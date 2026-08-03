# Changelog

What changed in Loft, newest first. Dates are the day the work reached
[loft.fusionspace.co](https://loft.fusionspace.co).

**This file is the single source for the version the app shows.** `scripts/gen-version.mjs` reads the
newest released heading below, checks it against `package.json`, and writes `lib/version.ts` — the
one module the UI imports. The build FAILS if the two disagree, so a release described here and a
version shipped in the bundle cannot drift apart. Adding a release means adding a heading here and
bumping `package.json`; nothing else.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions are
[semantic](https://semver.org/spec/v2.0.0.html). Loft is pre-1.0: the minor number moves when a flyer
can do something new, the patch number when something they could already do got better or was fixed.

## [0.9.0] — 2026-08-03

Loft's first described release. It covers what the tool can do today rather than every step that got
it here — the per-change record starts from this entry.

### Build and edit

- **Build a rocket from scratch, or edit one you imported** — the same surface, the same model, the
  same solver. *Start a new design* opens a stable 54 mm sport rocket already flying, rather than a
  blank slate.
- **Add, remove, reorder and restack parts** — body tubes, fin sets, transitions, mass objects,
  couplers, centring rings, motor mounts and booster stages. Every structural act is one undo step,
  named after the part it made.
- **Edit the part you picked**, on designs with several of a kind: click any tube, fin set, canopy or
  mass object on the diagram or in the parts list and the fields aim at *that* one, named. The
  selection survives a re-fly and a reload.
- **Choose real commercial parts from a bundled catalogue** — body tubes, nose cones, parachutes,
  couplers and centring rings, 2,990 parts across 13 vendors, with each vendor's own dimensions,
  material and part number. A part that does not fit is refused with the reason rather than flown at
  a size its vendor never published.
- **Author a staged rocket** and fly the separation.
- **A design built in Loft leaves intact** as an `.ork` file — geometry, materials, motor
  configuration and launch conditions — and reopens as itself.

### Simulate and check

- **Import the file you already have**: OpenRocket `.ork`, RockSim `.rkt`, RASAero `.CDX1`, RocketPy
  and SpaceCAD.
- **See more than one answer.** Loft's own solver, the numbers the design file already stores from
  the tool that made it, and an in-browser RocketPy second opinion — presented side by side, with
  disagreement flagged rather than hidden.
- **Sweep a motor selection, sweep a parameter, and run a Monte-Carlo dispersion** — all in the
  browser, on your own machine.
- **Per-set fin drag and a cited fin-flutter estimate** (NACA TN 4197), with every shear modulus and
  every material density carrying its published source — or saying plainly that no published value
  exists.

### The tool itself

- **Distinct workspaces as real routes** — import, design, flight, sweep, validate, docs — rather
  than one scrolling page.
- **A touch-native phone layout**, held to a 44 px hit target with no state reachable only by hover,
  and the three things a range day needs — pick a motor, check stability, sanity-check a delay —
  walked one-handed and offline.
- **Installable and offline** from the second visit, including the parts catalogue and the motor
  data.
- **Everything runs on your device.** No account, no upload, no tracking, no server. Free.

### Honesty

- **Every number is a prediction from a model, never a measurement and never a go/no-go.** A value
  that is withheld says why and how to get it back; an extrapolated one says so; a reference figure
  names the tool that produced it and any caveat that tool attached.
- **A candid, dated [limitations log](https://loft.fusionspace.co/docs/limitations)**, a
  [methods page](https://loft.fusionspace.co/docs/methods) linking every calculation to its published
  source, and a [validation page](https://loft.fusionspace.co/docs/validation) with the measured
  accuracy against real design files.

[0.9.0]: https://github.com/nrdptel/fusionspace-loft
