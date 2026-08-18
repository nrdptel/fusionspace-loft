# Third-party notices

Loft is MIT licensed (see `LICENSE`). It ships three sets of things it did not author: two datasets,
so the tool resolves real parts and real motors offline with no network call, and the Python runtime
that carries its second solver. All three are listed here with the terms they arrive under, what was
changed, and where the originals came from.

*The third set was absent from this file until 2026-08-18, and §3 records how — it is assembled at
build time from a lock file rather than declared in `package.json`, so a reader of the manifest could
not have found it. `scripts/check-notices.mjs` now fails the build rather than leaving that to a
reader.*

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

## 3. The in-browser second solver, and every byte it ships

**This section exists because the sentence below it was false for as long as the second solver has
shipped.** §4 said, in as many words, that RocketPy *"is not vendored into the bundle and is not a
runtime dependency of the shipped application"*. Measured on a clean build, 2026-08-18:
`out/pyodide/` is **41 MB** and carries `rocketpy-1.12.1-py3-none-any.whl` (415,563 bytes), which
`public/pyodide/fly.py` imports in the browser worker. The one explicit negative claim in this file
was contradicted by the deployed bytes, and nothing in the repo could say so.

**The cause is structural, and it is worth stating so the next reader trusts the list below.** This
file was written against `package.json`, whose dependency set is small and MIT throughout. The
payload here is a SECOND dependency set, assembled at build time by `scripts/pyodide/vendor.mjs`
(`prebuild`) from Pyodide's own pinned lock file plus PyPI — so it is invisible to anyone reading
`package.json`, and bumping `PYODIDE_VERSION` or one entry in `DIST_ROOTS` pulls a different closure
with different licences and nothing to notice. `scripts/check-notices.mjs` now fails the build when a
shipped wheel, or a licence a shipped wheel carries, is named nowhere here — and when this file
claims something is not bundled while the build ships it.

**Why it ships at all.** Loft's second solver is RocketPy, run as an independent cross-check beside
Loft's own answer. The CLIENT-SIDE invariant forbids a server, so there is nowhere to run it except
the flyer's browser, which means the interpreter and the library are served from Loft's origin. Its
results are always presented as *another tool's prediction*, never merged into Loft's own — that is
the whole point of a cross-check. **Whether this is compatible with the clean-room invariant's
"never vendored into the bundle" clause is an owner-level question**, and it is parked in
`OWNER-NOTES.md` under *Awaiting the owner* rather than settled here. What this section fixes is
narrower and is not in doubt: what ships, under what terms, said out loud.

### The runtime

| artifact | version | terms |
|---|---|---|
| Pyodide (`pyodide.mjs`, `pyodide.asm.mjs`, `pyodide.asm.wasm`, `python_stdlib.zip`, `pyodide-lock.json`) | 314.0.2 | MPL-2.0 |

`python_stdlib.zip` is CPython's standard library, under the **Python Software Foundation License**.
Pyodide is redistributed unmodified, from the pinned CDN, byte for byte.

### The wheels

Twenty-three, every one redistributed **unmodified** as the `.whl` the index published. None is
linked into Loft's own code: they are separate files fetched by a Python interpreter at runtime.

| wheel | version | terms |
|---|---|---|
| `certifi` | 2026.4.22 | Mozilla Public License 2.0 (MPL 2.0) |
| `cftime` | 1.6.5 | MIT |
| `charset-normalizer` | 3.4.7 | MIT |
| `contourpy` | 1.3.3 | BSD License |
| `cycler` | 0.12.1 | BSD License |
| `dill` | 0.4.1 | BSD License |
| `fonttools` | 4.62.1 | MIT |
| `idna` | 3.11 | BSD-3-Clause |
| `kiwisolver` | 1.5.0 | BSD License |
| `matplotlib` | 3.10.8 | Python Software Foundation License |
| `micropip` | 0.11.1 | Mozilla Public License 2.0 (MPL 2.0) |
| `numpy` | 2.4.3 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 |
| `packaging` | 26.1 | Apache-2.0 OR BSD-2-Clause |
| `pillow` | 12.2.0 | MIT-CMU |
| `pyparsing` | 3.3.2 | MIT |
| `python-dateutil` | 2.9.0.post0 | BSD License |
| `pytz` | 2026.1.post1 | MIT License |
| `requests` | 2.33.1 | Apache Software License |
| `rocketpy` | 1.12.1 | MIT License |
| `scipy` | 1.18.0 | BSD License |
| `simplekml` | 1.3.6 | GNU Lesser General Public License v3 or later (LGPLv3+) |
| `six` | 1.17.0 | MIT License |
| `urllib3` | 2.6.3 | MIT |

**`simplekml` is LGPLv3-or-later, and it is the only copyleft item Loft distributes.** It is here
because it is a hard import-time dependency of RocketPy, not a choice:
`rocketpy/__init__.py` reaches `rocketpy/simulation/flight_data_exporter.py`, which does
`import simplekml` at module top, so `from rocketpy import Flight` fails without it. Loft uses none
of what it provides — nothing in the app exports KML.

The LGPL's redistribution conditions are met by the shape this already takes, and both halves are
stated because a licence satisfied by accident is one a refactor breaks:

- **It is conveyed unmodified, as a separate work.** The wheel is byte-identical to the one built
  from the published sdist; Loft neither patches it nor links it. LGPLv3 §4's combined-work
  conditions do not attach — this is §5's *"a work that uses the Library"* distributed alongside it,
  and the library is replaceable by dropping a different wheel into `public/pyodide/`.
- **Notice is given here, and the source is available.** The project and its complete corresponding
  source are at <https://pypi.org/project/simplekml/> and
  <https://github.com/eisoldt/simplekml>; the licence text is at
  <https://www.gnu.org/licenses/lgpl-3.0.html>. Loft is MIT and stays MIT: no LGPL code is copied
  into it, and its own terms are unaffected.

*It is a committed pre-built wheel (`scripts/pyodide/wheels/`) rather than a fetched one because PyPI
ships simplekml as an sdist only — building it would put Python and pip in the production build
image. That is a build-reproducibility decision and changes nothing about the terms.*

---

## 4. Not bundled, and why

*RocketPy used to head this list, with a sentence saying it was neither vendored nor a runtime
dependency. It is both, it always was, and §3 above is now the record of what actually ships. The
entry is gone from here rather than corrected in place because a section headed "Not bundled" cannot
carry an exception to its own heading — `scripts/check-notices.mjs` fails the build if this list ever
names something the export contains again, which is the check that would have caught the original.*

- **OpenRocket** itself — its solver, its material database, and the `.orc` files inside its GPLv3
  application tree — is not used. Every method Loft implements is written from published sources
  and cited on `/docs/methods`.
- **MatWeb** material data is not used. Its terms forbid redistribution.
