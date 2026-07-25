# Backlog

Rough edges, missing affordances, and ideas too big for one pass — noticed while working,
not yet done. Newest first. One line each. Anything here is fair game for the next session.

- The Analyze workspace is four full-width cards of prose with one button each — a menu, not a work
  surface. A single column wastes the desktop width, nothing a run produced survives switching tabs,
  and there's no saved-view or preset idea anywhere. OpenRocket's simulation tab is a table of runs
  you can re-run, edit, plot and export; that's the benchmark this surface is furthest from.
- The desktop landing page fills about half the width and never says what Loft can do past import —
  no mention of the sweeps, dispersion, cross-check, or the builder that are one click away.
- The design what-if panel is a wall of ~24 number fields. Only the fins, body wall and boattail
  have diagram handles; nose, recovery, payload, materials and finish are typing-only.
- The parts list is read-only and one-directional (a row highlights the diagram, not the reverse),
  hidden behind a disclosure, and carries no mass. OpenRocket's editor has a selectable component
  tree with add/delete, which is the gap that keeps Loft's editor feeling like a viewer with fields.
- Corpus fetch is still unwired: no lock file pinning repo/tag/asset/sha256, no `fetch-fixtures`
  step, no CI secret. Blocked on two owner-side actions — cutting a release asset in `loft-fixtures`
  and adding `FIXTURES_TOKEN` — so the suite still only gates a machine that already has the files.
- A no-recovery descent is a tumble, not a dart. On `FullScaleModelTH.rkt`'s plugged configuration
  Loft comes in at 152 m/s against RockSim's 83 m/s: both agree nothing opened, but RockSim models
  the unstable body's drag and Loft flies it nose-down. Worth a tumbling-drag model for the
  ballistic case, where the number feeds a safety warning.
- RASAero booster staging is now the only staging Loft doesn't do (RockSim's landed this session).
  The file has everything needed — `Booster1Engine`, `Booster1LaunchWt`, `Booster1CG`,
  `Booster1SeparationDelay`, `Booster1IgnitionDelay`, `IncludeBooster1`, and the `<Booster>` part
  itself with its own fins and boattail. What's missing is the CONVENTION: on
  `Complex.Two-Stage.CDX1` the sustainer is 4.06 lb at 35.96 in and Booster1 is 5.64 lb at 43.06 in,
  and a 43 in CG cannot belong to a part spanning 55–62.5 in — so those almost certainly describe
  the whole stack at liftoff, not the booster alone. "Almost certainly" isn't good enough for a mass
  and a CG. Settle it empirically first: fly both readings against the three staged CDX1 files'
  stored apogees and take the one that reproduces them.
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
- RASAero import leaves three things on the table: booster stages (only the sustainer flies, and
  the comparison is withheld), a fin set mounted on a tapered section, and `<Protuberance>` parts.
  RASAero's `<MachAlt>` Mach-vs-altitude table is also unread — it is a second per-step oracle.
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
- The corpus suite exists now (`lib/corpus/sweep.test.ts`, skips when absent) but nothing FETCHES
  the corpus: no lock file pinning repo/tag/asset/sha256, no `fetch-fixtures` step, no CI secret.
  Until that lands the suite only gates a machine that already has the files.
- `Pods--airframes and winglets.ork` sim 1 reads +25%: pods are dropped, so the comparison is
  withheld, but the pods' own drag is simply missing.
- Deployment velocity is the worst metric in almost every corpus comparison (e.g. +153% on
  OpenRocket's tube-fin example) — the chute-deploy timing model looks like the cause.
- A `.ork` whose motor Loft can't resolve flies with no propulsion; the same-casing substitute
  is offered, but a design with *several* unresolvable motors makes you pick one by one.
