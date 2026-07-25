# Test fixtures

**The stored flight results in these designs are author estimates, not simulator output.** They
exist so the comparison panel has something to demonstrate on. Each therefore carries
OpenRocket's `status="external"` on its `<simulation>` — the format's own marker for results
that did not come from its simulator — and the app labels them "stated figures" rather than
attributing them to OpenRocket. If you edit a fixture's geometry, either update its stored
figures or leave them: they are a reference point, never a ground truth. Real ground truth lives
in the separate design-file corpus.

Real design files used by the parser tests, the simulation tests, and the validation
harness. The OpenRocket `.ork` fixtures are ZIP archives containing a single `rocket.ork`
XML entry, exactly like a file OpenRocket writes; the RockSim `.rkt` fixture is plain XML,
exactly like a file RockSim writes. The human-readable source lives in [`src/`](./src). Regenerate the loadable files from it with

```bash
node scripts/gen-fixtures.mjs
```

which writes both the `.ork` binaries here **and** the three designs the app serves as one-tap
examples from `public/samples/`. Those two copies used to be maintained by hand and drifted —
a change to the fixtures' stored-result marker never reached the samples users actually click —
so they are generated from the one source now. The `.rkt` source *is* the loadable file and is
copied straight across.

| File | Design | Motor | Recovery |
|------|--------|-------|----------|
| `demo-single-deploy.ork` | 38 mm fibreglass sport rocket, 29 mm mount | AeroTech H128W | single deploy at apogee |
| `demo-dual-deploy.ork` | 54 mm fibreglass dual-deploy | AeroTech K550W | drogue at apogee, main at 150 m |
| `demo-multi-config.ork` | Same 38 mm airframe with two motor configurations (stored simulations), so the app's motor-configuration picker has something to switch between | AeroTech H128W and G40W | single deploy at apogee |
| `demo-quirks.ork` | Parser regression: `auto` radii (bare + valued), a boattail transition, a tube coupler with a subcomponent, an elliptical fin set, legacy element names (`<position>`, `<fincount>`), and a parallel stage | AeroTech J420R | streamer at apogee |
| `demo-payload-separation.ork` | Two-stage payload rocket: a motorless payload section rides a booster that separates at its own ejection charge (a long delay, so the split falls near apogee); the payload chute deploys on that lower-stage separation. Exercises the stage separation event and separation-triggered recovery | AeroTech F50T (6 s delay) | payload chute on lower-stage separation |
| `src/demo-rocksim.rkt` | RockSim import: a 54 mm minimum-diameter fibreglass sport rocket with a payload mass object, exercising the `.rkt` adapter — mm/gram units, `LocationMode` placement, RockSim shape/finish codes, per-part masses, an `EngineSet` motor, and a stored `SimulationResults` | AeroTech J420R | single deploy at apogee |

`demo-quirks.ork` isn't a realistic design — it deliberately exercises format features real
OpenRocket exports use that the two demo designs don't, so the parser's handling of them is
pinned by tests (its stored figures are placeholders and aren't validated against).

## Provenance and the stored results — read this

These designs were **authored for Loft**; they are original, not copied from OpenRocket's or
RockSim's sample libraries. The `.ork` files are valid OpenRocket 1.10-schema files and open
in OpenRocket; `demo-rocksim.rkt` is a valid RockSim-schema file authored by hand from the
public format specification.

The stored flight figures in each file (apogee, max velocity, …) — the `<flightdata>`
attributes in a `.ork`, the `<SimulationResults>` fields in the `.rkt` — are **independent
author estimates, not the output of an OpenRocket or RockSim simulation run.** Loft ships
neither tool, so it cannot generate their genuine numbers here. They are included because
real files carry stored results, so the parser and the "design tool vs Loft" comparison need
something to read — treat the bundled comparison as a demonstration of the *mechanism*, not
an accuracy claim.

**For a real accuracy check, import your own `.ork`.** A file you simulated in OpenRocket
carries OpenRocket's genuine stored results, and Loft diffs its engine against those live.
See the in-app **Docs → Validation** page and the **limitations log** for the full, candid
account. Loft's engine is separately checked against first-principles physics
(hand-calculated coast, energy/impulse sanity, conservation) in the test suite.

## `rocketpy-cross-check.json` — the independent-engine reference

Unlike the author-estimated stored figures, this file holds **genuine** independent-simulator
output: the ballistic apogee, velocity, Mach, time-to-apogee, and static margin that
[RocketPy](https://github.com/RocketPy-Team/RocketPy) (a mature open-source 6-DOF engine) produces
for the bundled demo designs when fed Loft's own drag curve. It's generated offline by
[`scripts/rocketpy`](../scripts/rocketpy) — RocketPy is Python and doesn't run in the browser — and
the **Docs → Validation** page renders a live Loft-vs-RocketPy comparison from it. `lib/validation/
rocketpy-cross-check.test.ts` guards it in CI: if the engine drifts from these numbers, regenerate
the file (see the harness README). It cross-checks the integrator, mass model, and centre of
pressure — not drag, which is held equal on both sides.
