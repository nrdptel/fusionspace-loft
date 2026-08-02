# Third-party notices

Loft is MIT licensed (see `LICENSE`). It bundles two datasets it did not author, so that the tool
resolves real parts and real motors offline with no network call. Both are listed here with the
terms they arrive under, what was changed, and where the originals came from.

This file is the notice required by those terms. It is also the honest record of what is *not*
cleanly licensed, because a bundle that lists only its well-licensed half is worse than no list.

---

## 1. OpenRocket component database — Apache License 2.0

**What it is.** 3,445 real commercial rocketry parts — body tubes, nose cones, transitions,
couplers, centring rings, bulkheads, launch lugs, engine blocks, parachutes and streamers — from
fourteen manufacturers, each with its part number, published dimensions and named material. The
catalogue carries sixteen distinct manufacturer *strings* for those fourteen companies, because
`quest.orc` writes both "Quest" and "Quest Aerospace" and `mpc.orc` writes both "MPC" and "MRC" —
the strings are kept as the vendor files state them rather than merged, so a lookup by manufacturer
must expect both spellings.

| | |
|---|---|
| Upstream | https://github.com/openrocket/openrocket-database |
| Commit | `1512874ace50917e25ccf7d7df1f616b5f39a8b5` |
| Path | `orc/` |
| Licence | Apache License 2.0 — full text at `lib/components/orc/LICENSE-Apache-2.0.txt` |
| Vendored to | `lib/components/orc/` (16 `.orc` files, verbatim) |
| Generated into | `lib/components/catalog.ts`, by `scripts/gen-components.mjs` |
| Machine-readable record | `lib/components/orc/provenance.json` |

**This database is Apache-2.0, not GPL, and the distinction matters.** OpenRocket's *application*
is GPLv3, and its own repository grants an explicit additional permission under GPL §7 to package
the program "along with any non-compilable data files (such as thrust curves or component
databases)". The parts database is a separate repository under Apache-2.0 with its own `LICENSE`
at the repository root, and the application pulls it in as an external resource. Redistributing it
inside an MIT bundle is permitted provided the licence text ships, the copyright notices are
retained, and modifications are stated — which is what this section does.

**Not used, and deliberately.** OpenRocket's *material* database is `Databases.java`, compilable
Java inside the GPLv3 tree, so the §7 data-file permission does not reach it. None of it is here.
Loft's own material figures are derived independently from primary sources and cited at
`lib/sim/flutter.ts` and `lib/model/edit.ts`. The ~15 `.orc` files committed inside the GPL
application tree under `datafiles/components/internal/` are likewise not used.

### Copyright notices, retained (Apache-2.0 §4(c))

Each vendored file carries its own notice in its header; they are reproduced here so the notices
survive even where only the generated module is read.

| File | Vendor | Notice |
|---|---|---|
| `apogee.orc` | Apogee Components | by Dave Cook  NAR 21953  caveduck17@gmail.com 2021 |
| `bluetube.orc` | Always Ready Rocketry (Blue Tube) | by Dave Cook NAR 21953  caveduck17@gmail.com 2017 |
| `BMS.ORC` | Balsa Machining Service | Copyright (c) 2022 by Stephen J. Heilman (sj_h1@live.com) and Dave Cook (caveduck17@gmail.com) |
| `competition_chutes.orc` | Generic competition | Copyright 2017 by Dave Cook  NAR 21953  caveduck17@gmail.com |
| `estes_classic.orc` | Estes | by Dave Cook  NAR 21953  caveduck17@gmail.com 2014-2017 |
| `estes_ps2.orc` | Estes (Pro Series II) | by Dave Cook  NAR 21953  caveduck17@gmail.com 2014-2017 |
| `generic_materials.orc` | (materials only) | Copyright 2014-2018 by Dave Cook  NAR 21953  caveduck17@gmail.com |
| `giantleaprocketry.orc` | Giant Leap Rocketry | See `LICENSE` in the upstream distribution; no per-file notice |
| `loc_precision.orc` | LOC Precision | Copyright 2014-2019 by Dave Cook  NAR 21953  caveduck17@gmail.com |
| `madcow.orc` | Madcow Rocketry | by Dave Cook  NAR 21953  caveduck17@gmail.com  2017-2018 |
| `mpc.orc` | MPC (1969-1973) | by Dave Cook  NAR 21953  caveduck17@gmail.com 2014-2017 |
| `publicmissiles.orc` | Public Missiles Ltd. | See `LICENSE` in the upstream distribution; no per-file notice |
| `quest.orc` | Quest Aerospace | Copyright 2018 by Dave Cook NAR 21953  caveduck17@gmail.com |
| `ROCKETARIUM.ORC` | Rocketarium | by Stephen J. Heilman  sj_h1@live.com |
| `semroc.orc` | SEMROC | Copyright 2017-2019 by Dave Cook NAR 21953  caveduck17@gmail.com |
| `top_flight.orc` | Top Flight Recovery | Copyright 2017-2022 by Dave Cook  NAR 21953  caveduck17@gmail.com |

### Statement of modifications (Apache-2.0 §4(b))

The vendored `.orc` files under `lib/components/orc/` are **unmodified**, byte for byte, from the
commit named above. The single exception is a file mode: `loc_precision.orc` is `0755` upstream and
`0644` here.

`lib/components/catalog.ts` is a **derived** work, generated from those files by
`scripts/gen-components.mjs`. The transformations it applies:

1. **Normalised to SI.** The source states dimensions in inches, millimetres, centimetres or feet
   and masses in ounces, grams or kilograms, with the unit as an attribute on each element. Every
   value is converted to metres and kilograms. An unrecognised unit — or an ABSENT one — is a hard
   error rather than a silent 1:1, because a wrong length is a wrong rocket: 96% of this database
   is in inches, so assuming metres would inflate a 0.976 in tube 39-fold.
2. **Materials resolved per file, then from the shared table.** Six material names are defined more
   than once with different densities, so a part uses its own file's definition first, then
   `generic_materials.orc` — the database's own shared table, named explicitly rather than reached
   by whichever filename sorted first — and only then the remaining files in sorted order.
   Resolving by read order alone would make a part's mass depend on the fact that `BMS.ORC` is
   capitalised.
3. **A material's unit is taken from its `<Type>`, never from `UnitsOfMeasure`.** The upstream
   maintainer records that the attribute is often wrong, and it is: six `SURFACE` materials declare
   `g/m2` while carrying values in kg/m² (1.9 oz ripstop at 0.0589). Believing the attribute would
   make those canopies a thousand times too light.
4. **Three material definitions are refused as physically impossible** and ship with a `null`
   density rather than a number: `Paper, bulk` at 0.0011 kg/m³ in both `BMS.ORC` and
   `ROCKETARIUM.ORC` (lighter than air, and referenced by 18 real parts), and
   `Elastic, flat, 3/8 in. width` at 0.006087 typed as `BULK` when it is plainly a line material.
   They are listed in the generated `REFUSED_MATERIALS`.
5. **Four parts are dropped for unbuildable geometry**, each stating a negative material volume.
   Three state a bore wider than the outside diameter — `quest.orc` `CR2924, Q14022`, `semroc.orc`
   `HTC-11`, `semroc.orc` `RA-55-70` — and one states a wall thicker than its own radius,
   `estes_classic.orc` `PRP-1H, 032487, 032492` at 4.250 in of wall on a 0.974 in body, plainly a
   decimal slip for 0.250 in. They are listed in the generated `REFUSED_PARTS`.

None of these change a published figure. They refuse figures that cannot be published values, and
each refusal is recorded in the bundle rather than only in this file.

**What is NOT refused, and why.** `ROCKETARIUM.ORC` states `Paper, spiral kraft, Motor Mount,
BT-50, bulk` as 9,072 kg/m³ — denser than copper, and certainly wrong for paper. It is not refused,
because 9,072 kg/m³ is a physically possible density for *something*; refusing it would mean
judging the value against its NAME rather than against physics, and that is a heuristic this
generator deliberately does not apply. It is recorded here instead, and in `BACKLOG.md`.

---

## 2. Motor thrust curves — ThrustCurve.org, and this one has a gap

**What it is.** 108 RASP `.eng` thrust curves under `lib/motors/curves/`, inlined into
`lib/motors/catalog.ts` by `scripts/gen-motors.mjs`. Each entry records its ThrustCurve.org simfile
id and info URL, so any curve is traceable to the record it came from. Manufacturers represented:
AeroTech, Animal Motor Works, Apogee Components, Cesaroni Technology, Estes Industries, Hypertek,
Loki Research, Quest Aerospace.

Thrust-versus-time is certification and test-stand measurement — factual data about a physical
article — and each curve names its origin. But **the licence field is not clean, and pretending
otherwise would be the kind of quiet claim this project does not make**:

| Licence as recorded | Curves |
|---|---|
| `PD` (public domain) | 45 |
| *(none recorded)* | 38 |
| `?` | 22 |
| `free` | 3 |

**63 of 108 curves carry no usable licence statement**, and ThrustCurve.org's own definition of
`free` includes GPL, so the three `free` curves are not necessarily compatible with an MIT bundle
either. This is a pre-existing gap, it is tracked in `BACKLOG.md`, and it is stated here rather
than left for someone to discover. The component catalogue above was built deliberately not to
reproduce it: a single explicit Apache-2.0 grant covers every one of its 3,445 parts.

---

## 3. Not bundled, and why

- **RocketPy** is used as an external cross-check oracle. It is not vendored into the bundle and is
  not a runtime dependency of the shipped application.
- **OpenRocket** itself — its solver, its material database, and the `.orc` files inside its GPLv3
  application tree — is not used. Every method Loft implements is written from published sources
  and cited on `/docs/methods`.
- **MatWeb** material data is not used. Its terms forbid redistribution.
