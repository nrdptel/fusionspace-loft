# RocketPy cross-validation harness

An independent check on Loft's flight engine. It flies the **same designs** through
[RocketPy](https://github.com/RocketPy-Team/RocketPy) — a mature, MIT-licensed, pure-Python 6-DOF
trajectory simulator validated against real flight data — and diffs its ascent metrics (and, for
designs with recovery, its landing metrics) against Loft's own TypeScript sim.

It has **two roles**:

1. **Dev cross-check** — sanity-check a change to the sim core against a second, independent engine
   before trusting it. Point it at any design (including OpenRocket's own GPL examples).
2. **Generate the committed reference the users see.** For the bundled demo designs it writes
   `fixtures/rocketpy-cross-check.json`, and the app's **Validation** page renders a Loft-vs-RocketPy
   panel from it. Loft is computed live at build time; RocketPy's numbers are this committed
   reference.

**RocketPy itself never ships and never runs in the browser** — it's Python, and running it live
would need the heavy Pyodide payload. Only the pre-computed reference numbers ship. The harness
needs Python + RocketPy in a virtualenv; nothing in `app/` or `lib/` imports it.

## Keeping it honest (the CI drift guard)

`lib/validation/rocketpy-cross-check.test.ts` runs in CI. It flies each bundled design ballistically
in Loft and asserts it still agrees with the committed RocketPy reference. **If that test fails after
a change to the drag, mass, motor, or integration code, Loft has drifted from the independent
reference — regenerate it (below) and commit the new `fixtures/rocketpy-cross-check.json`.** That's
the intended workflow: a calculation change updates its validation artifact in the same change, the
same discipline the limitations log follows. It keeps the numbers the Validation page shows current
and honest.

## What it does and doesn't validate

RocketPy does **not** derive total drag from geometry — it requires a caller-supplied
`Cd(Mach)` curve for power-off and power-on drag. So the harness feeds RocketPy **Loft's own**
drag curve (sampled from `lib/sim/aero.ts`). That means the cross-check holds drag **equal** on
both sides and validates:

- the **trajectory integrator** (RK4 vs RocketPy's solver),
- the **mass model** (dry mass, motor mass depletion, burnout mass),
- **RocketPy's independent Barrowman CP** against ours (the static-margin column),
- the **motor/thrust handling** (our thrust curve → RocketPy `GenericMotor`), and
- for designs with recovery, the **descent integrator and burnout mass** — both engines fly to the
  ground under the same landing drag area (`Cd·A`), so the **landing speed and energy** are diffed
  the same way the ascent is (drag area held equal). See "Descent cross-check" below.

It is **not** an independent *drag* oracle. The independent drag check is OpenRocket's stored
per-step Cd, which lives in the app (`lib/validation/compare.ts` and the Validation doc page).
The three engines are complementary:

| Engine            | Drag source                     | Role                                  |
| ----------------- | ------------------------------- | ------------------------------------- |
| **Loft**          | own geometry buildup            | the engine under test                 |
| **OpenRocket** (stored) | its own per-step Cd (in the .ork) | independent **drag** oracle           |
| **RocketPy** (live) | fed Loft's Cd                 | independent **integrator + mass + CP** oracle |

## Apples-to-apples: ballistic ascent

The comparison is deliberately **ballistic** — no recovery deployment, no wind — on both sides:

- **Recovery is stripped** from the Loft run. If it weren't, a design whose ejection charge fires
  *before* apogee (e.g. a short C6 delay) would have its climb truncated by the open parachute,
  and comparing that against RocketPy's ballistic `terminate_on_apogee` would be apples-to-oranges.
  (This is exactly what the harness caught first: Loft's real C6 flight tops out at 268 m because
  the chute opens ~2 s early, while its *ballistic* apogee is 293 m — matching RocketPy.)
- **Wind is zeroed**, so the vertical apogee isn't confounded by a light crosswind.

The emitter still records the **real** (recovery-flown) apogee alongside the ballistic one, and the
runner prints it as context (`(real w/ chute)`) whenever an early ejection makes the two differ.
OpenRocket's stored apogee is a *real* flight (recovery + wind), shown for reference only.

## Descent cross-check (designs with recovery)

The *landing* is cross-checked with the same discipline, holding the descent drag area equal instead
of the ascent `Cd(Mach)`:

- `buildRocketpySpec` computes the design's **landing `Cd·A`** — every deployed canopy/streamer plus
  the body's own descent drag (`0.5·A_ref`), exactly the sum Loft's descent model settles to terminal
  velocity under (`lib/sim/simulate.ts`). It rides in the spec as `recovery.landingCdA`.
- `fly(spec, descent=True)` adds **one equivalent parachute** carrying that whole `Cd·A`, deployed at
  apogee, and flies to the ground (no `terminate_on_apogee`). It returns the **landing speed**
  (RocketPy's impact velocity, zero wind ⇒ vertical terminal) and **landing energy** (½·m·v² from
  RocketPy's own descent mass) on top of the ascent metrics. A single equivalent chute reaches the
  same terminal velocity Loft does, so the terminal landing speed/energy match without replaying the
  staged drogue→main sequence — which changes descent *time* (not compared) but not the terminal.
- Loft's side is flown **recovery-on, wind-zeroed** (`flyReferenceRecovery`), so its impact speed is
  the vertical terminal too — apples-to-apples with RocketPy's zero-wind descent.

Descent is **opt-in** (`descent=False` by default) so the in-browser Pyodide solver stays ascent-only
and fast; only this offline harness flies to the ground. RocketPy still applies the airframe drag
curve on the way down — a sub-percent add at ~5–7 m/s — so ~0.1–0.3% agreement is expected, not exact.

## How it works

Two halves, bridged by a JSON "spec". The spec is **the shared hand-off**, not a throwaway: both
the spec-builder and the flight routine are library modules the in-browser RocketPy second solver
reuses verbatim, so what the browser flies is exactly what this harness flies.

1. **`emit.ts`** — a Vitest test that reuses the real library (importers, mass, aero, motor DB,
   sim). It builds each spec with **`lib/validation/rocketpy-spec.ts`** (`buildRocketpySpec` — a
   pure, browser-safe module, *not* local to this harness) and writes `out/<key>.spec.json`
   (everything RocketPy needs: geometry, motor thrust curve, sampled `Cd(Mach)`, environment) plus
   `out/<key>.loft.json` (Loft's own ballistic result + the real apogee + OpenRocket's stored
   figure). The `DESIGNS` list holds both the **bundled demo fixtures** (from
   `fixtures/src/*.ork.xml`, marked `bundled`) and any external dev-only designs from `LOFT_ORK_DIR`.
2. **`run_rocketpy.py`** — reads each spec and flies it via **`fly.py`** (`fly(spec)` — the shared
   flight routine, also loaded into WASM by the Pyodide runner), prints the 3-way table, and writes
   the `bundled` designs' RocketPy numbers to **`fixtures/rocketpy-cross-check.json`** — the
   committed reference the Validation page reads.

The **`pyodide/`** subdirectory runs that same `fly.py` under Pyodide (CPython-in-WASM) — the proof
and seed for the in-browser second solver. See `pyodide/README.md`.

Loft's ballistic run reuses the engine's own code path: `runFlight(rocket, { ballistic: true })`
(strips recovery, zeroes wind), the same call the Validation page and the CI drift-guard use, so
"ballistic" means one thing everywhere.

## Running it

**1. Set up RocketPy** (once) in a virtualenv — a fresh venv avoids the system-setuptools quirk
that breaks `pip install rocketpy` on some Debian/Ubuntu boxes:

```sh
python3 -m venv .venv-rocketpy
.venv-rocketpy/bin/pip install --upgrade pip setuptools wheel
.venv-rocketpy/bin/pip install rocketpy
```

**2. Emit specs + Loft results** (uses a one-off Vitest config so it runs outside the normal
`lib/**` test glob). The bundled demo fixtures are in-repo, so this works with no extra setup:

```sh
npx vitest run --config scripts/rocketpy/vitest.config.ts scripts/rocketpy/emit.ts
```

To also cross-check external designs (e.g. OpenRocket's own GPL examples — they ship with
OpenRocket, so they aren't committed here), unpack their `.ork` to XML, point the emitter at the
directory, and add them to the `DESIGNS` list in `emit.ts`:

```sh
export LOFT_ORK_DIR=/path/to/ork-xml   # defaults to /tmp/orkxml
```

**3. Run the cross-check** (prints the table and regenerates `fixtures/rocketpy-cross-check.json`):

```sh
.venv-rocketpy/bin/python scripts/rocketpy/run_rocketpy.py
```

Then run the drift guard to confirm the app agrees with the freshly-generated reference:

```sh
npm test -- rocketpy-cross-check
```

## Current results

Ballistic ascent, Loft vs RocketPy (both fed Loft's Cd). The **bundled demo designs** (committed to
the reference and shown on the Validation page) span a subsonic G, a mid-power H, and a transonic K;
the external OpenRocket examples are dev-only:

```
design                metric                Loft  RocketPy  OR stored   L−RPy
-------------------------------------------------------------------------------
demo-multi-config     apogee (m)          547.40    548.41      520.0   -0.2%   [bundled]
                      max vel (m/s)       109.10    109.13      105.0   -0.0%
                      margin (cal)          4.51      4.51          -
                      landing (m/s)         6.76      6.75          -   +0.1%
                      land KE (J)          15.31     15.27          -   +0.3%
demo-single-deploy    apogee (m)          992.79    994.09      980.0   -0.1%   [bundled]
                      max vel (m/s)       205.22    205.24      190.0   -0.0%
                      margin (cal)          4.07      4.07          -
                      landing (m/s)         6.95      6.94          -   +0.1%
                      land KE (J)          17.11     17.07          -   +0.3%
demo-dual-deploy      apogee (m)         2940.52   2957.10     2250.0   -0.6%   [bundled]
                      max vel (m/s)       436.28    436.47      305.0   -0.0%
                      max Mach              1.29      1.29          -   -0.1%
                      margin (cal)          3.06      3.06          -
                      landing (m/s)         5.27      5.26          -   +0.1%
                      land KE (J)          28.50     28.43          -   +0.3%
demo-boattail         apogee (m)          905.36    906.57     1015.0   -0.1%   [bundled]
                      max vel (m/s)       187.34    187.35      196.0   -0.0%
                      margin (cal)          3.82      3.84          -
                      landing (m/s)         7.31      7.30          -   +0.1%
                      land KE (J)          20.89     20.84          -   +0.3%
elliptical_v1.9       apogee (m)          657.88    658.38      662.0   -0.1%
                      max vel (m/s)       182.09    182.10      181.9   -0.0%
                      margin (cal)          1.93      1.94          -
simple_v1.0           apogee (m)          279.92    280.33      248.4   -0.1%
                      max vel (m/s)        91.42     91.47       89.0   -0.0%
                      margin (cal)          2.25      2.25          -
                      landing (m/s)         4.07      4.07          -   +0.1%
                      land KE (J)           0.49      0.49          -   +0.3%
```

Apogee, velocity, Mach, and time-to-apogee all land within ~0.6% of the independent engine; the
independently-computed Barrowman static margin agrees to a fraction of a caliber. The landing speed
and energy (designs with recovery) agree to ~0.1–0.3%, holding the descent drag area equal. The
`elliptical_v1.9` row is a real OpenRocket example whose *stored* column is a genuine OpenRocket run
(not an author estimate): reading the elliptical fin's leading-edge sweep into the drag brought
Loft's apogee there from −6.5% to −0.6% of OpenRocket's own figure. (For the bundled demo designs the
OpenRocket "stored" column is an author estimate, not a real run — RocketPy is the *real* independent
check for them; see `fixtures/README.md`.)

**Known residual:** rail-exit velocity reads a few percent higher in Loft than in RocketPy. That's
a rail-clearance *convention* difference (Loft marks exit when the CG passes the rail length;
RocketPy when the last rail button clears) that matters proportionally on a short 1 m rail — a
definitional gap, not a physics error.

## Scope / TODO

- Single-stage only (multi-stage is skipped for now).
- Ascent is ballistic to apogee; descent (recovery) is cross-checked separately, holding the landing
  `Cd·A` equal — see "Descent cross-check" above. Descent *time* (staged drogue→main) isn't compared.
- Cluster motors are aggregated into one equivalent coaxial thrust curve.

## Licensing

Clean-room: RocketPy is used as an **external** oracle in a separate venv — it is not vendored,
copied, or linked into Loft, and none of its (MIT) code enters the bundle. What ships is only
`fixtures/rocketpy-cross-check.json`: a handful of scalar results for Loft's **own** demo designs.
Loft stays MIT and client-side.
