# RocketPy cross-validation harness (dev-only)

An independent check on Loft's flight engine while we build it. It flies the **same designs**
through [RocketPy](https://github.com/RocketPy-Team/RocketPy) — a mature, MIT-licensed, pure-Python
6-DOF trajectory simulator validated against real flight data — and diffs its ascent metrics
against Loft's own TypeScript sim.

This is **development tooling**. It is **not shipped**, **not part of CI**, and needs Python +
RocketPy in a virtualenv. Nothing in `app/` or `lib/` imports it; the engine has no dependency on
it. It exists so a change to the sim core can be sanity-checked against a second, independent
engine before we trust it.

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

Two halves, bridged by a JSON "spec" (which is also the adapter surface a future in-browser
RocketPy engine would use):

1. **`emit.ts`** — a Vitest test that reuses the real library (importers, mass, aero, motor DB,
   sim). For each design it writes `out/<name>.spec.json` (everything RocketPy needs: geometry,
   motor thrust curve, sampled `Cd(Mach)`, environment) and `out/<name>.loft.json` (Loft's own
   ballistic result + the real apogee + OpenRocket's stored figure).
2. **`run_rocketpy.py`** — reads each spec, builds a RocketPy `Environment` / `GenericMotor` /
   `Rocket` / `Flight`, and prints the 3-way table.

## Running it

**1. Designs.** Put design XML files (OpenRocket's own bundled examples, unpacked from their `.ork`
— they ship with OpenRocket, which is GPL, so they aren't committed here) in a directory, and point
the emitter at it:

```sh
export LOFT_ORK_DIR=/path/to/ork-xml   # defaults to /tmp/orkxml
```

Edit the `DESIGNS` list in `emit.ts` to match the filenames you have.

**2. Emit specs + Loft results** (uses a one-off Vitest config so it runs outside the normal
`lib/**` test glob):

```sh
npx vitest run --config scripts/rocketpy/vitest.config.ts scripts/rocketpy/emit.ts
```

**3. Set up RocketPy** (once) in a virtualenv — a fresh venv avoids the system-setuptools quirk
that breaks `pip install rocketpy` on some Debian/Ubuntu boxes:

```sh
python3 -m venv .venv-rocketpy
.venv-rocketpy/bin/pip install --upgrade pip setuptools wheel
.venv-rocketpy/bin/pip install rocketpy
```

**4. Run the cross-check:**

```sh
.venv-rocketpy/bin/python scripts/rocketpy/run_rocketpy.py
```

## Current results

Ballistic ascent, Loft vs RocketPy (both fed Loft's Cd), across a slow low-power model, a
mid-power design, and a transonic high-power design:

```
design                metric                Loft  RocketPy  OR stored   L−RPy
-------------------------------------------------------------------------------
APEX_v1.6             apogee (m)         2868.17   2871.05     2881.3   -0.1%
                      max vel (m/s)       362.35    362.34      364.9   +0.0%
                      max Mach              1.07      1.07          -   -0.0%
                      t apogee (s)         21.44     21.48          -   -0.2%
                      margin (cal)          2.26      2.32          -
                        (real w/ chute)   2813.23                        early deploy
elliptical_v1.9       apogee (m)          673.72    674.22      662.0   -0.1%
                      max vel (m/s)       187.08    187.10      181.9   -0.0%
                      margin (cal)          1.80      1.95          -
simple_v1.0           apogee (m)          293.01    293.45      248.4   -0.1%
                      max vel (m/s)        97.65     97.70       89.0   -0.0%
                      t apogee (s)          7.20      7.20          -   +0.0%
                      margin (cal)          1.94      1.94          -
                        (real w/ chute)    268.48                        early deploy
```

Apogee, velocity, Mach, and time-to-apogee all land within ~0.2% of the independent engine; the
independently-computed Barrowman static margin agrees to a fraction of a caliber. The gap to
OpenRocket's stored apogee (a *real* flight, with its own higher per-step drag and the early
recovery deployment) is the honest accuracy story tracked on the app's Validation page.

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
copied, or linked into Loft, and none of its (MIT) code enters the bundle. Loft stays MIT and
client-side.
