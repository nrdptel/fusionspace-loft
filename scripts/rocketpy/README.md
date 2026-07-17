# RocketPy cross-validation harness

An independent check on Loft's flight engine. It flies the **same designs** through
[RocketPy](https://github.com/RocketPy-Team/RocketPy) — a mature, MIT-licensed, pure-Python 6-DOF
trajectory simulator validated against real flight data — and diffs its ascent metrics against
Loft's own TypeScript sim.

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
- **RocketPy's independent Barrowman CP** against ours (the static-margin column), and
- the **motor/thrust handling** (our thrust curve → RocketPy `GenericMotor`).

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
demo-multi-config     apogee (m)          556.27    557.38      520.0   -0.2%   [bundled]
                      max vel (m/s)       110.26    110.29      105.0   -0.0%
                      margin (cal)          4.51      4.51          -
demo-single-deploy    apogee (m)         1006.21   1007.49      980.0   -0.1%   [bundled]
                      max vel (m/s)       207.28    207.29      190.0   -0.0%
                      margin (cal)          4.07      4.07          -
demo-dual-deploy      apogee (m)         3083.58   3101.70     2250.0   -0.6%   [bundled]
                      max vel (m/s)       456.21    456.44      305.0   -0.1%
                      max Mach              1.35      1.35          -   -0.1%
                      margin (cal)          3.06      3.06          -
simple_v1.0           apogee (m)          293.01    293.45      248.4   -0.1%
                      max vel (m/s)        97.65     97.70       89.0   -0.0%
                      margin (cal)          1.94      1.94          -
                        (real w/ chute)    268.48                        early deploy
```

Apogee, velocity, Mach, and time-to-apogee all land within ~0.6% of the independent engine; the
independently-computed Barrowman static margin agrees to a fraction of a caliber. (Note the
OpenRocket "stored" column for the demo designs is an author estimate, not a real run — RocketPy is
the *real* independent check for them; see `fixtures/README.md`.)

**Known residual:** rail-exit velocity reads a few percent higher in Loft than in RocketPy. That's
a rail-clearance *convention* difference (Loft marks exit when the CG passes the rail length;
RocketPy when the last rail button clears) that matters proportionally on a short 1 m rail — a
definitional gap, not a physics error.

## Scope / TODO

- Single-stage only (multi-stage is skipped for now).
- Ascent to apogee (descent/recovery deliberately out of the ballistic comparison).
- Cluster motors are aggregated into one equivalent coaxial thrust curve.

## Licensing

Clean-room: RocketPy is used as an **external** oracle in a separate venv — it is not vendored,
copied, or linked into Loft, and none of its (MIT) code enters the bundle. What ships is only
`fixtures/rocketpy-cross-check.json`: a handful of scalar results for Loft's **own** demo designs.
Loft stays MIT and client-side.
