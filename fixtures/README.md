# Test fixtures

Real `.ork` files used by the parser tests, the simulation tests, and the validation
harness. Each is a ZIP archive containing a single `rocket.ork` XML entry, exactly like a
file OpenRocket writes. The human-readable source XML lives in [`src/`](./src); the `.ork`
binaries are regenerated from it (any ZIP tool works — the entry must be named `rocket.ork`).

| File | Design | Motor | Recovery |
|------|--------|-------|----------|
| `demo-single-deploy.ork` | 38 mm fibreglass sport rocket, 29 mm mount | AeroTech H128W | single deploy at apogee |
| `demo-dual-deploy.ork` | 54 mm fibreglass dual-deploy | AeroTech K550W | drogue at apogee, main at 150 m |
| `demo-multi-config.ork` | Same 38 mm airframe with two motor configurations (stored simulations), so the app's motor-configuration picker has something to switch between | AeroTech H128W and G40W | single deploy at apogee |
| `demo-quirks.ork` | Parser regression: `auto` radii (bare + valued), a boattail transition, a tube coupler with a subcomponent, an elliptical fin set, legacy element names (`<position>`, `<fincount>`), and a parallel stage | AeroTech J420R | streamer at apogee |

`demo-quirks.ork` isn't a realistic design — it deliberately exercises format features real
OpenRocket exports use that the two demo designs don't, so the parser's handling of them is
pinned by tests (its stored figures are placeholders and aren't validated against).

## Provenance and the stored results — read this

These designs were **authored for Loft**; they are original, not copied from OpenRocket's
sample library (whose files are GPL). They are valid OpenRocket 1.10-schema files and open
in OpenRocket.

The `<flightdata>` figures stored in each file (apogee, max velocity, …) are **independent
author estimates, not the output of an OpenRocket simulation run.** Loft does not ship
OpenRocket, so it cannot generate genuine OpenRocket numbers here. They are included because
real `.ork` files carry stored results, so the parser and the "OpenRocket vs Loft"
comparison need something to read — treat the bundled comparison as a demonstration of the
*mechanism*, not an accuracy claim.

**For a real accuracy check, import your own `.ork`.** A file you simulated in OpenRocket
carries OpenRocket's genuine stored results, and Loft diffs its engine against those live.
See the in-app **Docs → Validation** page and the **limitations log** for the full, candid
account. Loft's engine is separately checked against first-principles physics
(hand-calculated coast, energy/impulse sanity, conservation) in the test suite.
