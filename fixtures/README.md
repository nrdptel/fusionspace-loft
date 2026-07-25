# Test fixtures

**The designs the app SHIPS as samples state no flight results at all.** They are Loft's own
designs; no OpenRocket run ever produced numbers for them, so inventing a set and letting the
comparison panel present it as another tool's prediction was dishonest — and the invented figures
did not even hold together (one claimed a 2,250 m apogee at the same 20.2 s time-to-apogee at
which Loft reaches 2,940 m, which no ballistic coast does). Those files now carry their simulation
and its launch conditions and nothing else, so the comparison panel simply doesn't appear for a
sample. It appears for YOUR file, which is where it belongs.

The **test-only** fixtures — `demo-boattail`, `demo-quirks`, `demo-payload-separation`, and
`demo-rocksim.rkt`, none of which is offered in the app — keep a declared set of synthetic stored
results so the comparison path stays covered by tests. Each carries OpenRocket's
`status="external"`, the format's own marker for results that did not come from its simulator.
They are test data, never ground truth. Real ground truth lives in the separate design-file
corpus (see CONTRIBUTING).

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
