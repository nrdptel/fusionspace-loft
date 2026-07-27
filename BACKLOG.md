# Backlog

Rough edges, missing affordances, and ideas too big for one pass — noticed while working,
not yet done. Newest first. One line each. Anything here is fair game for the next session.

- **Information that exists only in a `title=` never reaches a phone.** Measured this run on the
  results view at 412x915: 33 elements carry an explanation the visible text and any `aria-label`
  don't — the four Conditions field teachings (rail length, rail angle, surface wind, field
  elevation), the `<abbr>` behind a flagged stability margin, the motor-match quality badge, the
  parts-table sort headers, and the design-name and export buttons. A native tooltip does not fire
  on touch, so on the form factor the project describes as a pad check with gloves on, a flagged
  margin gets no explanation at all. The range half of this is fixed (a one-sided range now reads
  "0 or more"); the teaching half needs a real disclosure, not a `title`. Re-measured: 0 inputs lack
  an accessible name, so the older note claiming four do is resolved.
- **RocketPy cross-check is dead for any power-series nose cone**, and dies loudly: after a ~40 MB
  download it prints a raw 900-character Python traceback into the page — `ValueError: Parameter
  'power' cannot be None when using a nose cone kind 'powerseries'`. `lib/validation/rocketpy-spec.ts`
  maps `power: "powerseries"` but `scripts/rocketpy/fly.py` (and its two copies under `public/pyodide/`
  and `out/pyodide/`) calls `rocket.add_nose()` without the `power=` kwarg. Reproduced on
  `The Red Hunter.ork`. The headline independent-solver feature, 100% unavailable on that nose shape,
  showing a stack trace. Fix the kwarg AND stop rendering raw tracebacks.
- The design what-if fields silently discard a negative entry: typing `-3` into fin span leaves the
  field showing `-3` while the flown value stays 29 mm — no `aria-invalid`, no `role=alert`, no
  border change — yet "Reset to as-designed" appears as though an edit landed. The number on screen
  is not the number being flown, with nothing saying so. Related: none of the 21 number inputs carry
  a `max`, so a one-keystroke typo (500 for 50 in fin span) grows the diagram from 297 px to 3,446 px
  tall and shoves the panel off the page; 5000 gives 33,531 px. The "To scale · 455 mm long" caption
  keeps promising fidelity throughout.
- The diagram drag handles freeze their range at grab time: pulling fin span up 30 px moves 29→41 mm
  and the next 30 px moves nothing (6 consecutive samples at 41), with `aria-valuemax` jumping 41→58
  only on release. Half a long drag is dead travel.
- `primaryFinSetName`'s positional fallback ("fin set 2") numbers by `flattenRocket` order, but the
  parts table can be re-sorted by name/type/station/mass — so after sorting by mass, "fin set 2" is
  not the second fin row on screen. It also names one component while the fields edit its whole
  appearance-group, so on a design with two identical pairs the note names one set and changes two.
- Still no undo anywhere: Ctrl+Z after a handle drag does nothing, and the only escape is "Reset to
  as-designed", which discards every edit at once. Ten flights in, that is a stack of trims and one
  all-or-nothing exit.
- Parts table gaps measured this run: every column sorts one direction only (a second click returns
  to design order, so there is no lightest-first), there is no Copy or CSV while Mass & balance, the
  motor sweep and the parameter sweep all have both, and the sort order is not persisted though the
  motor sweep's is (`loft.pref.motorSweep.sort`). Mass & balance has no sortable columns at all, and
  in imperial 4 of its 9 rows collapse to `0 lb` while the % column still shows real values.
- No analysis can be cancelled: `cancel|stop|abort` matches 0 buttons across all four Analyze tools,
  including a RocketPy run measured at 50.5 s whose own copy says "a minute or so"; the only exit is
  a reload, which discards everything. The motor and parameter sweeps also report no progress at all
  (only `aria-busy`), while the dispersion study reports "152/300 flown" — same gesture, different
  feedback. The parameter sweep offers no range or step control: 25 points over an auto range, so
  "sweep 40–60 mm at 1 mm" — the tenth-use question — cannot be asked.
- Parts table rows carry `tabIndex=0` with `role=null` and `aria-selected`, which is invalid on an
  implicit row outside a grid, and they add 12 stops to the tab order.
- **Benchmark, configuration picker vs OpenRocket's simulation table.** Theirs is a table with a row
  per stored run and columns for apogee, max velocity, max acceleration, time to apogee, deployment
  velocity and ground-hit velocity, a status icon per row, and sorting — every run visible and
  comparable at once, and each run's own launch conditions editable in place. Loft's is a single
  `<select>`: one run visible at a time, one metric (apogee), and the status folded into the label
  rather than given a column. As of this run the identity and the status marker are honest (that was
  the gap that could mislead); what is left is the SHAPE — a flyer comparing five stored motors has
  to open the dropdown five times and remember. The natural fix is the same component table the
  parts list and Mass & balance want, applied to stored runs: rows, columns, a sort, and the picker
  becoming a selection in it. On `FullScaleModelTH.rkt` that is 15 rows a dropdown cannot show.
- The parameter sweep's CSV rounds every metric to 3 dp, which is right for apogee and wrong for the
  flutter-margin column: a fin-thickness sweep down to 0.5× on an already-thin fin drives the margin
  under 0.0005 and the column reads `0` while the plotted curve doesn't. The motor sweep's CSV was
  moved to 3 dp for the same reason and is fine at that scale; this one needs per-metric precision
  rather than one number for all five.
- `toDispThick` in `LoftApp.tsx` is the one fin-thickness surface not routed through `lengthMm`
  (`(m*1000).toFixed(1)`), so a fin under 0.05 mm would show "0.0" in the input while the fix hint
  beside it names the real value — and re-typing the shown number drops the edit. No corpus file is
  that thin (the thinnest is Cherokee's 0.254 mm, which shows correctly), so this is a latent
  inconsistency rather than a live bug.
- The fin-flutter fix hint now admits when the worst-margin set is one the fin fields can't reach
  (16 of the 60 corpus flights it fires on, including the thinnest margins: 0.08x, 0.21x, 0.29x).
  What it still can't do is let the flyer act on it — that needs per-component editing.
- `RocketDiagram` resolves its drag-handle fin set by nearest station to `primaryFinStation` rather
  than by id, so nothing structurally guarantees the handle and the edit target are the same set.
  Measured this run: across the 29 corpus designs that carry a fin set, nearest-station and by-id
  resolution pick the same set every time and the primary set is present in the outline in all 29,
  so this is a latent fragility with zero live cases — matching by id would make it provable, and
  `OutlineFin` already carries the id.
- Phone, re-measured this run at 412x915 / DPR 2.6 (handles are their own entry below). Under 44 px:
  the 9 motor-sweep column-sort buttons at 15.7 px tall, the Conditions "Launch site" input (250.8x34)
  and its "Fetch" button (61.2x32), the sticky header's design-name input (176x30) and "Import
  another" (92.1x40, wrapping to two lines), the four Analyze "Run …" buttons at 36 px, 7 Monte-Carlo
  number inputs at 36 px, the "Parts · 8" and "Use it offline" disclosure rows at 16-20 px, the 5
  /docs sub-nav links at 30 px, and 10 footer links at 16-20 px. Every view exceeds two viewport
  heights — /docs/methods 21,514 px (23.5x), /docs/limitations 16,656, /docs/faq 13,136, Design with
  all sections open 6,182, Flight 4,022 — though the workspace tablist is sticky and its tabs are a
  clean 44 px. Text under 12 px: Flight 113 nodes (24 at 9 px, 38 at 10 px, all in the flight-path
  figure), Design 76, Analyze 16. Clean: no hover-only state (0), no horizontal document overflow
  (0 across 12 states), no console errors (0). Caveat worth its own fix: 13 elements carry
  information ONLY in `title=`, which never fires on touch — including the `<abbr>` behind the
  stability badge and all four Conditions field explanations.
- Desktop tenth-use, measured: analysis results are the one thing a reload discards (units, tab,
  motor swap and fin edits all survive it); no long analysis can be cancelled (no Cancel/Stop in
  MonteCarlo/MotorSweep/ParameterSweep/RocketpyCrossCheck); the cluster fixture offers two options
  labelled identically ("C6 · 307 m" twice); apogee reads 63 m in the header and 62.9 m in the
  validation table it is meant to be checked against; Mass & balance has no sort affordances while
  the sibling Parts table does; the Parts sort order
  is the one view choice not persisted (`GeometryInspector.tsx` uses plain `useState`).
- Fins can now be addressed by id, but every OTHER role still resolves one component: the frontmost
  nose, the longest body tube, the largest parachute. 23 of 35 corpus designs carry more than one body
  tube and none of the extras can be edited. `bodyDiameter` is the worst of them, since it scales
  every tube by a factor derived from the longest one alone. The seam that made fins work — one
  resolver shared by the readbacks and the write path, plus a selection on `GeometryEdits` — is the
  pattern to repeat per role; the read-only parts list needs the same thing.
- A second nose cone is simply never edited: `primaryNose` takes the frontmost and `noseLength`/
  `noseShape` key off its id. No corpus design has two nose cones (0 of 35), so this is documentation,
  not a bug worth code today.
- The diagram's touch layout shows one fin handle at a time now, which makes every handle tappable
  but costs the phone something the desktop keeps: two fin dimensions can't be compared side by side
  on the picture, and re-aiming is a tap away. Worth revisiting once the diagram itself is bigger on
  a phone (it is 346x89 px at fit-width) — with room, two or three handles could coexist at 44 px.
- The to-scale diagram is 346x89 px on a phone — 89 px of height for a whole airframe. It zooms, but
  the default fit is unreadable, and the Design workspace runs 1,892 px deep before you reach the
  fields.
- Wind barely moves Loft's apogee, because weathercocking is rotation and the solver is 3-DOF. On
  `USLI2025-FULLSCALE`'s own five stored runs at 0/5/10/15/20 mph, OpenRocket's apogee falls
  1,602 → 1,549 m (−3.3%) while Loft reads 1,634 m at every wind speed. Now stated in the
  limitations log; closing it properly means integrating pitch, i.e. the 6-DOF project.
- The Wood Handbook (USDA FPL-GTR-190, Table 5-1) unblocks half of the fin-flutter shear-modulus
  problem below: it gives citable G_LR/E_L ratios — balsa 0.054, basswood 0.056, yellow birch 0.074
  — so G follows from a species' E_L. What is still missing is a citable E_L for hobby-grade stock
  (balsa's varies ~3× across the density range the shops sell), and any source at all for birch
  *plywood* panel shear and cardboard. That spread is the real finding: G is uncertain by ~2× on
  exactly the soft stocks that trip the warning, and Vf goes as √G, so the honest fix is probably a
  flutter-speed *band* per material rather than a better single number.
- The parts table and the Mass & balance panel are two tables of the same components on the same
  tab — the parts table now carries mass beside each part's dimensions, and Mass & balance carries
  % dry, per-part CG, the dry total and the CSV. Worth unifying into one component table (which is
  what OpenRocket's tree is) rather than leaving the overlap.
- Diagram handles and number fields still disagree on range: the fin-span handle clamps to the
  framed extent (5–84 mm on the 38 mm sample) and reports that as its `aria-valuemax`, while the
  fin-span field accepts 120 mm and computes a perfectly good 4.79 cal. The handle's bound is a
  framing constraint dressed as a property limit.
- RASAero `<Protuberance>` is still unread, but the corpus says it barely matters: the only one
  present (`Complex.Two-Stage`) is 0.25 in² of frontal area against a 4-inch airframe's 12.6 in²,
  so modelling it cannot move that file's +12.4% residual. Lower priority than the entry it
  replaces suggested.
- Design number fields show the design's own value only as a grey placeholder, so a set value and an
  inherited one look nearly alike and any tweak means retyping the whole number.
- There is no undo, and "Reset to as-designed" is all-or-nothing with no per-field revert; "Import
  another" discards every what-if without asking.
- The motor sweep and the parameter sweep show a labelled spinner but no count. Monte-Carlo does it
  well ("32/300 flown") and the RocketPy cross-check does it best (runtime → install → fly); neither
  sweep's worker reports progress, so adding one means threading a callback through.
- Analyze results survive an edit now, but not a reload: the session keeps the design, units, edits
  and motor configuration, and a 300-flight Monte-Carlo is still gone.
- The parameter sweep offers 7 axes against ~23 editable dimensions — no fin count, materials,
  surface finish, chute sizes, payload mass or boattail.
- The fin-flutter check cries wolf: across the corpus it raises the hard "fins may flutter" warning
  on 31 of 94 flights — a third — including OpenRocket's own bundled Estes-class examples, which fly
  every weekend. The formula is not the problem (it reproduces Apogee #291's worked example: 260.7
  vs ~262 m/s). Every false alarm is on a soft, density-variable stock — cardboard (G assumed
  0.02 GPa), balsa (0.09), basswood (0.17), birch ply (0.62) — and Vf goes as the SQUARE ROOT of G,
  so the shear modulus is the most leveraged input in the estimate and `lib/sim/flutter.ts` carries
  it as an uncited table of "representative engineering figures". Re-tabling it needs a citable
  source (the Apogee newsletter's own table would be ideal — that PDF is scanned, so it isn't
  extractable); substituting one guess for another isn't worth doing. Until then the warning is
  training flyers to ignore a safety flag. One extreme case is NOT Loft's fault: Cherokee-E-5055's
  0.01x margin comes from the file's own 0.254 mm (0.01 in) balsa fin.
- The Analyze workspace's empty state is four full-width cards of prose with one button each, which
  reads as a menu; once run, the panels themselves are dense and good. Worth compressing the idle
  state so all four fit above the fold and the width isn't spent on a single column.
- A design library: the shelf under "Your designs" now keeps the last eight designs opened and
  reopens any of them, which covers working across a build. What it isn't yet is a library — no
  switching without going back to the import screen, no renaming or grouping there, and each entry
  carries the design but not the what-ifs that were set on it.
- The phone's design what-if panel is still a two-column grid of ~24 small fields, and the diagram
  defaults to fit-width (now zoomable, but fit on a 29:1 airframe is 11 px of body). The natural
  next step is per-component editing driven by the diagram selection.
- The design what-if panel is a wall of ~24 number fields. Only the fins, body wall, nose and
  boattail have diagram handles; recovery, payload, materials and finish are typing-only.
- The parts list selects both ways and now carries each part's mass and sorts by any column, but it
  is still read-only. What OpenRocket's component tree has and Loft's doesn't is add and delete, and
  a selected part opening its own fields — that is the gap that keeps the editor feeling like a
  viewer with fields beside it. It needs the edits model to grow past one flat bag of ~26 global
  fields ("the" fin set, "the" nose) to something addressed per component id.
- The corpus fetch is wired — `fixtures.lock.json`, `scripts/fetch-fixtures.mjs`, an npm script and a
  CI step — but CI still fetches nothing until a `FIXTURES_TOKEN` repository secret exists. That is
  the one owner-side action left; until then the suite gates only a machine that already has the
  files. The network path itself is the one branch never exercised here (no real token in the
  sandbox); the local-tarball, tampered-file, moved-snapshot and no-token paths all are.
- A no-recovery descent is a tumble, not a dart. On `FullScaleModelTH.rkt`'s plugged configuration
  Loft comes in at 152 m/s against RockSim's 83 m/s: both agree nothing opened, but RockSim models
  the unstable body's drag and Loft flies it nose-down. Worth a tumbling-drag model for the
  ballistic case, where the number feeds a safety warning.
- A RockSim `<CustomFinSet>`'s fin tabs (`TabLength`/`TabDepth`/`TabOffset`) and cant angle are
  read past — the tab is structure inside the airframe, so it is mass Loft doesn't count, and a
  canted custom fin flies uncanted. Both are zero on the corpus's only custom-fin design.
- The service worker precaches route HTML but not the RSC segment payloads Next's router fetches
  for a client-side navigation (`__next.*.txt?_rsc=…`, ~580 kB, and the `_rsc` hash means they
  can't be matched without `ignoreSearch`). Offline, an in-app link still lands on the right page
  because the router falls back to a full navigation — but that reload drops in-memory state.
- `demo-rocksim.rkt`'s stored `<SimulationResults>` are author estimates too, but RockSim's format
  has no `external` marker to carry that, so the panel still labels them RockSim's. Worth either a
  document-level flag on the import or dropping the stored block from that fixture.
- Loft still reads +31% apogee / +43% velocity against `demo-dual-deploy`'s stated figures, and
  those figures are internally inconsistent (2,250 m apogee at the same 20.2 s time-to-apogee Loft
  reaches 2,940 m in). The label is now honest, but the demo would land better with figures that
  hold together — regenerate them from the engine, or state a range.
- Remaining corpus residuals, each excused in the suite's KNOWN_ISSUES with a reason: APEX K-Dart
  -22.8% and OR-vs-RAS -42%/-66% (both supersonic, outside the validated envelope and the biggest
  argument for a real wave-drag model); `03.Three-stage` max velocity -17% after the ignition fix;
  Punisher sim 10 -10.4%; USLI zero-delay +11.7%.
- The corpus sweep and the per-step drag cross-check are worth committing as real dev tools with
  assertions rather than being rewritten as throwaway probes each session — the sweep now is, the
  drag cross-check isn't.
- RASAero import still leaves `<Protuberance>` parts unread, and a SECOND booster stage is skipped
  (only Booster 1 flies). RASAero's `<MachAlt>` Mach-vs-altitude table is also unread — it is a
  second per-step oracle, in a file that already gives one cross-check.
- A RASAero import's mass is a single point, so the airframe carries no moment of inertia of its
  own. Harmless for the 3-DOF solve; a real gap the day rotational dynamics arrive.
- Two RockSim corpus fixtures store results that don't match their own geometry (`TubeFins1.rkt`
  weighs its tube fins as solid rods; `rocksimTestRocket1.rkt` reads 52% low on max acceleration,
  a pre-deployment number) — both are OpenRocket's synthetic import-test files, and both are now
  excused in the sweep as unusable oracles. They still cost coverage: nothing else in the corpus
  exercises tube fins against stored results, so that geometry has no accuracy check at all.
- ThrustCurve has no RASP file for Cesaroni H225-14A (RockSim `.rse` only); an `.rse` curve reader
  would unlock it and a long tail of other motors that only ship in that format.
- RocketPy `.py` / `.ipynb` design scripts don't import; the corpus carries three, two of
  them with *actual flown* apogees (NDRT 2020, Valetudo) — the strongest ground truth there is.
- Tube fins can't be edited: no diagram handles, no what-if fields, and `lib/model/edit.ts`
  still finds only trapezoid/elliptical/freeform sets as "the" fin set.
- Tube-fin aero omits tube-to-body and tube-to-tube interference drag, any ring-wing lift
  beyond the captured streamtube, and the shielding of the airframe inside the tubes; the
  CP reads ~0.9 caliber forward of OpenRocket's on its own example.
- Ring tails (`<RingTail>` in RockSim) are still dropped with a warning.
- `Pods--airframes and winglets.ork` sim 1 reads +25%: pods are dropped, so the comparison is
  withheld, but the pods' own drag is simply missing.
- Deployment velocity reads worst in percentage terms but is ill-conditioned near apogee, not badly
  modelled — the census on /docs/validation shows the absolute error barely moves across bands. The
  genuinely wrong cases (e.g. +153% on OpenRocket's tube-fin example) are the ones left to explain.
- A design with SEVERAL unresolvable motors makes you accept the same-casing substitute one by one.
  (A partly-resolved configuration now withholds its stored comparison, so at least the missing
  curve no longer reads as an accuracy gap.)
