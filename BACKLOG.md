# Backlog

**This is a DEFECT LEDGER, not the work queue.** The queue is `ROADMAP.md`. What is wrong lives here;
what Loft cannot yet DO lives there. Fifty-five entries accumulated here and not one of them proposed
a new capability, so a session that treated this file as its queue could only ever ship fixes — which
is what several runs in a row did.

Read it to file into, and to check for a Sev-1 (a wrong number on a surface a flyer would act on, or
a one-way door — those preempt the milestone immediately). Everything else waits its turn under the
one-in-four quota on **unqueued** defect work in `MAINTAINING.md` — which caps clearing entries from
this file, and deliberately does **not** cap craft or product work, because that now has its own
track in `ROADMAP.md` with its own *done when*. Rough edges, missing affordances, and findings too
big for one pass. Newest first.

**Filed 2026-08-03 from a six-lens opening fan-out** (phone walk, desktop tenth-use walk, design-system
audit, competitive probe, milestone scout, Sev-1 number screen). Two of its findings became increments
the same run — the touch scan's blind spots, and the export carrying stored results out of a design
Loft can only fly reduced. The rest are below, newest first, each with the measurement that makes it
actionable. **Nothing here has been reproduced by hand unless it says so**; treat each as a hypothesis
to re-measure before it becomes work, which is the lesson the last run filed one line down.

**Filed 2026-08-04 from a six-lens opening fan-out whose findings were each then handed to an
adversarial refuter.** That second pass earned its place: of the claims put to it, **three were
refuted outright** and are recorded as such below rather than becoming work — a negative-sigma
Monte-Carlo input that `NumberField`'s `min = 0` **default parameter** already bounds (the claim
assumed `min` was undefined when omitted; it is not), a `GeometryInspector` empty state that is
genuinely unreachable because `ResultsView` never mounts without a successful flight, and a
`text-xl font-medium` divergence living in a primitive with zero call sites. Every entry below that
says CONFIRMED carries the command and the numbers the refuter could not talk it out of.

- **A design with NO recovery device at all trips neither the ballistic-descent warning nor the
  hard-landing one. SEV-1 — FIXED 2026-08-04** (a distinct `no-recovery` code; 4 of the 35 corpus
  designs carry no recovery device, three arriving at 43, 209 and 217 m/s). **Confirmed 2026-08-04.** `lib/sim/simulate.ts:1007-1008`:
  `recoveryExpected: recovery.length > 0` gates the ballistic-descent caution at `:1315`, and
  `anyRecoveryOpened` gates hard-landing at `:1353`. With zero devices **both gates are false**, so a
  lawn dart raises nothing. `ResultsView.tsx:584/:567` then publish Landing energy and Ground-hit
  speed as ordinary confident stats, and `RecoverySizingHint` (`:1596`) is itself gated on
  `hard-landing`, so it stays silent too. Measured on the 38 mm sample: with its chute, ground-hit
  **6.95 m/s / 17.1 J**; with the chute removed (nothing refuses the removal),
  **93.35 m/s / 2,969.7 J** — and an *identical* warning list. `grep -rn 'no-recovery|noRecovery'`
  returns nothing: there is no such code among the solver's 20. The two numbers a flyer clears a
  field and a waiver on, published with full confidence, while the same engine calls 7.7 m/s "firm".

- **A solver throw leaves the previous flight's numbers on screen beside the new design. SEV-1 —
  FIXED 2026-08-04** (`applyWhatIfState` flies first and commits only on success). **Confirmed
  2026-08-04.** `components/LoftApp.tsx:903-905`: the catch sets `error` but **not**
  `setRun(null)` — contrast the load path at `:646-647`, which does both. `setEdits(next.edits)` at
  `:974` has already committed, and `ResultsView` renders behind `{run && …}` at `:1984` with
  `geometry={geometryOf(edits)}` live. Reproduced: type 2001 into Body diameter (mm) on the 38 mm
  sample — `lib/sim/simulate.ts:442`'s `MAX_REF_RADIUS` throws above 2000 mm — and the red card
  appears while the Flight grid still reads the pre-edit **992.8 m / 4.07 cal**. The design panel
  redraws the new airframe; nothing marks the numbers stale. A confident apogee, margin and landing
  energy for a rocket that is not the one on screen.

- **A body diameter smaller than the motor inside it flies to a confident 11.6 km. CONFIRMED
  2026-08-04**, and this is the reproduction the entry below it (filed as SEV-1 and never measured)
  was missing. `components/LoftApp.tsx:2597`. On the 38 mm sample, via the exact `runFlight` call
  `compute()` makes: 10 mm → **1,437.5 m / 14.86 cal**; 5 mm → **3,297.2 m / 25.73 cal**; 1 mm →
  **10,326.5 m / 115.77 cal**; 0.1 mm → **11,588.6 m / 470.2 m/s / 1,151.77 cal**, against a baseline
  of 992.8 m / 4.07 cal. `motorsComplete` stays true throughout and no warning mentions the diameter:
  the tube shrinks around an 18 mm motor that keeps its size.

- **One fin, and the warning list comes back EMPTY. SEV-1 — FIXED 2026-08-04** (a
  `fin-count-assumption` warning naming the fin set; fires on 1 and 2 fins, silent from 3 up).
  **Confirmed 2026-08-04.**
  `components/LoftApp.tsx:2411` accepts `min={1}` while the Barrowman CP method assumes three or more
  symmetric fins. Measured on the same sample: `finCount: 1` → apogee **1,272.1 m**, static margin
  **1.639 cal**, `warnings: []` — not one caution, on the readout a flyer uses for a go/no-go. Two
  fins → 3.506 cal with only the over-stable note. Every other count carries at least that note, so
  the one-finned case is the *only* configuration that reports perfectly clean.

- **The `/design` editor is a 4.79-screen scroll on a phone before you reach the recovery controls.**
  Measured 2026-08-04 on the built export at 390x664, on a coarse pointer: the canopy-Cd field sits
  at **3,180 px = 4.79 screens**, against the two `DESIGN.md` §8 allows to a route's primary answer.
  The depth e2e passes because it measures each route's PRIMARY anchor and this is not one — so the
  contract is met as written while the editor is still a very long page. This is the PRODUCT SHAPE
  invariant's own argument arriving from the touch side: `/design` is several jobs (airframe, fins,
  recovery, mass & finish) stacked on one scroll, and splitting them is what §8 would actually be
  asking for if it measured more than one anchor per route. Not a regression — the field itself
  measures 154x44 px and meets the hit-target minimum exactly.

- **`DESIGN.md` §9's inversion check changed here and NOT in the sibling repo.** Filed 2026-08-04.
  The design-system invariant says both repos carry an identical copy and a change to one is a change
  to both in the same run. This session's GitHub scope is `nrdptel/fusionspace-loft` and
  `nrdptel/loft-fixtures` only, so the sibling could not be reached. The change is the per-file
  caption-vs-body count crediting the body-default primitives a file uses — it matters to any repo
  running a design-system milestone, and Debrief's own 212-to-82 inversion is the case §9 cites. An
  owner action: attach the sibling, or port the two edited blocks by hand.

- **The corpus census pools RockSim's BALLISTIC stored runs with its canopy descents, and 11 of 17
  rows are the ballistic ones.** Filed 2026-08-04, measured. `lib/corpus/sweep.test.ts` filters only
  on `hasPropulsion && validation`, so nothing excludes a stored simulation whose recovery never
  opened — RockSim marks them itself with `<HasDeployed>0</HasDeployed>` and `<FinalState>4</FinalState>`
  and Loft reads neither tag. On `FullScaleModelTH.rkt`, 11 of its 15 stored sims are plugged-motor
  lawn darts. Worse, that file **self-disagrees**: 83.3–83.7 m/s on four of them and 161.6–162.0 m/s
  on the other seven, for the same design, motor and wind — a 1.94x spread no model can satisfy.
  Splitting deployed from ballistic rows before comparing is the next real measurement on the
  descent metric, and it is a corpus-methodology change rather than an engine one.

- **`lib/model/edit.test.ts` has NINE `tsc --noEmit` errors, not the three previously recorded.**
  Re-measured 2026-08-04. All in that one file, all invisible to `npm run build` because Next
  type-checks the app graph and not the test files, so the gate stays green over them. The count
  moved because the file grew, not because anything was fixed.

- **The RocketPy cross-check's Δ column cannot reveal a shared assumption, and now says so — but the
  underlying limit stands.** Filed 2026-08-04. `components/RocketpyCrossCheck.tsx` feeds RocketPy
  Loft's own Cd(Mach), so above M0.8 both columns ride the same extrapolated curve: they agree
  BECAUSE they share the estimate. The panel carries an `Extrapolated` marker saying this now, which
  is honesty rather than a fix. A genuinely independent transonic oracle is the real answer and is a
  milestone-sized piece of work.

**Filed 2026-08-03 (second run of the day) from a six-lens opening fan-out and a three-lens pre-push
review.** One of its findings — a picked coupler silently cut down when its host shrank, under the
vendor's own part number — was a Sev-1 that the same run's own increment made reachable, and it was
fixed in that increment rather than filed. The rest are below.

- **RockSim designs disagree with Loft on ground-hit velocity 3.3x worse than OpenRocket ones, and
  one design is most of it. Measured 2026-08-03 by R9 increment 3.** Across the corpus's stored
  simulations: `.rkt` files median **25.7%** absolute against `.ork` files' **7.8%**, and the five
  worst cases in the whole corpus are all `.rkt` — four of them
  `rocksim__rocketryforum-rocket1student-usli-fullscale__FullScaleModelTH.rkt` at ~65%. This is the
  real lever on the census's worst metric, and it is an ADAPTER or a definitional question rather
  than a physics one: the parachute-coefficient split that R9 was scoped around does not discriminate
  at all (8.3% whether the file states a Cd or Loft supplies one). Start by reading what that one
  design stores for ground-hit velocity and what Loft flies for it. Queued as R9's increment 6, so
  this entry is a pointer rather than unqueued work.

- **86 of 92 corpus flights descend SLOWER than the file's own stored figure — 40 of 40 among those
  flown on a Loft fallback coefficient.** Measured 2026-08-03. A one-directional bias of that size is
  not a wrong coefficient (which would scatter); it points at the descent model or at a definitional
  difference in what each tool means by "ground-hit velocity". Recorded here because it outlives R9:
  whatever that milestone concludes, the sign of this error is a fact about the engine that a future
  session should not have to rediscover.

- **Nothing bounds a picked coupler's or ring's DIAMETER against the tube it goes inside. Measured
  2026-08-03, and it is the sibling of a rule that ships today for LENGTH.** A part longer than its
  host is refused at three layers and explained on the panel; a part WIDER than the host's bore is
  accepted silently by all of them — `buildable` (`components/PartPicker.tsx`), `usableCatalogRing`
  and `buildAdded` (`lib/model/edit.ts`) each check the bore against the part's own outer diameter
  and never against the host's. The caliber filter is the only affordance and it defaults OFF
  (`useState(false)`). So a 54.5 mm coupler goes inside a 51.0 mm bore, its mass lands in liftoff
  mass, CG and static margin, and the parts row reads it back as a real vendor part. Deliberately NOT
  ruled Sev-1: the mass is honestly computed for the part the flyer chose, the label is the part they
  chose, and OpenRocket does not refuse this either — but it is squarely "an input that accepts a
  value it cannot physically mean, and reports a confident number from it". The fit filter now opens
  on the host's bore, which is the affordance; making it a refusal, a caution, or a default-on filter
  is the open question.

- **A picked part left out of the flight explains itself only while its own row is selected, and
  never after a reload.** `components/GeometryInspector.tsx` gates the "not in the flight" notice on
  `pickTarget`, which requires `selectedId` to be that part; the added-parts effect deliberately
  adopts the list on first run WITHOUT selecting, so a resumed session shows a design quietly missing
  a part and its mass with nothing on screen saying so. Reachable: pick a coupler, shorten the tube
  under it, click any other row. The flight is CORRECT for the design as flown — what is missing is
  the explanation, which is why this is filed rather than fixed in the increment that created it.
  Fixing it means the notice living above the selection, beside where the design's other standing
  cautions render.

- **`PartPicker`'s `columns` memo lists `onPick` in its dependency array and every call site passes a
  fresh inline arrow**, so the memo recomputes on every render and the optimisation its own comment
  describes never happens. Four call sites, all inline. Harmless today at 1,089 rows because
  `DataTable` re-renders anyway; worth a `useCallback` at the call sites or dropping `onPick` from
  the deps and reading it from a ref.

- **The whole R8 catalogue-picker surface forgets everything between opens. Measured 2026-08-03.**
  `components/PartPicker.tsx:248-257`: `open`, `text`, `maker` and `fitsOnly` are component-local
  `useState`, reset on every close, and `lib/session.ts` — which persists the edit bag, the weather,
  the scenario and the sim index — carries none of them. A flyer picking tubes for a four-tube build
  retypes the vendor filter four times. OpenRocket persists its preset-dialog column widths, sort and
  filter across sessions (`ComponentPresetChooserDialog` + `Preferences`). This is the "controls that
  forget" tell, on the newest surface in the app.

- **CORRECTED the same day it was filed — the fit filter's TARGET, not just its tolerance.** As
  first written this entry described one filter comparing a part's outer diameter to the airframe's.
  That is true of the three airframe kinds and was never true of the two internal ones once they
  shipped: a coupler and a centring ring filter on the HOST TUBE'S BORE, because that is the
  dimension they have to match, and the label says so. The tolerance point below stands for all five.

- **The picker's fit filter is a 0.5 mm ABSOLUTE band where OpenRocket's is 5% with a 1 mm floor.**
  `components/PartPicker.tsx:309` (`const tol = 0.0005`) against
  `ComponentPresetRowFilter.java`'s `epsilon = MathUtil.max(value * 0.05, 0.001)`. At a 38 mm
  airframe theirs admits ±1.9 mm and ours ±0.5 mm, so Loft's "only parts at this caliber" hides rows
  a flyer would consider a fit. Ours is deliberate and arguably better for a coupler, whose bore
  really is cut to stock — but `COMPETITION.md` row 2 justifies the position with a sentence about
  their tolerance that is measurably wrong, and that sentence should be corrected either way.

- **Every picker column defines a `csv:` closure and none of them is reachable.**
  `components/PartPicker.tsx:739` — `DataTable` renders the copy/CSV controls only when `exportName`
  is passed (`components/DataTable.tsx:280`) and `PartPicker` passes none. So 8 columns of export
  code across 1,089 tubes, 854 cones, 236 couplers, 497 rings and 151 canopies is dead. One prop.

- **`tsc --noEmit` is red on `main` and has been for at least a run — 3 errors, all in
  `lib/model/edit.test.ts`.** Measured 2026-08-03 on `9ae41ee` with a clean stash: two at
  `:3915-3916` (an `innertube` literal missing `placement`, so it is not assignable to
  `RocketComponent`) and one at `:4018` (`designation` is not a key of `MotorMount`). `npm run build`
  does not catch them because Next type-checks the app graph, not the test files, so the gate is
  green and the editor is red. Either the test literals are fixed or `tsc --noEmit` joins the gate;
  a type error nobody sees is a type error that will be joined by others.

- **The parameter-sweep panel and the flight-path figure both vanish rather than saying why.**
  `components/ParameterSweep.tsx:328` (`if (axes.length === 0) return null`) and
  `components/FlightViz.tsx:37` (`if (traj.length < 2) return null`). `DESIGN.md` §5 requires an
  empty state on a data surface; a panel that disappears is the one state that teaches nothing. Both
  are call sites for the `EmptyState` primitive §5 declares and that does not exist.

- **A second `warn` card tone, disagreeing with the token.** `components/ResultsView.tsx:1234` spells
  `border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300` inline, against
  `CARD_TONES.warn` at `components/ui.tsx:34` (`text-amber-900 dark:text-amber-200`). One character
  of tone difference on a caution surface, and `lib/design-system.test.ts`'s card-treatment count
  does not see it because it counts treatments, not tones.

- **Two unit `<select>`s carry no `TOUCH_TARGET` while the other ten do.**
  `components/ResultsView.tsx:648` and `:706`, at `px-2 py-1` against the others' `px-2.5 py-1.5`.
  Not caught by `e2e/touch.spec.ts` — re-measure at 390 px before treating this as real, because the
  scan that covers exactly this was widened and re-pinned in P4 increment 7 and reports 0.

- **`text-[11px]` is used 47 times across 10 files, ~21 of them on field labels, legends and readout
  labels.** `DESIGN.md` §3 scopes that size to axis ticks and diagram annotations only and names
  `text-sm` the floor for anything a flyer reads a number from. Measured 2026-08-03;
  `components/LoftApp.tsx:2228` is a representative site.

- **Six of `DESIGN.md` §5's declared primitives do not exist, and two that exist have zero call
  sites.** Re-measured 2026-08-03: absent are `Panel`, `Readout`, `Figure`, `EmptyState`,
  `ErrorState` and `Extrapolated` (the previous run counted five and missed `Extrapolated`); present
  with no callers are `Section` and `Chip` (`Tabs` is also 0 but that is the documented consequence
  of the route split, not drift). The labelled-value treatment `Readout` would own is hand-rolled
  **27 times in 7 disagreeing class strings**; there is no `Select` primitive and **12** real
  `<select>` elements hand-roll **5** class strings. `lib/design-system.test.ts` holds all six §9
  counts at their budgets, so none of this can decay further — but none of the greps can see it
  either, which is why it took a reading agent to find.

- **"A design built from scratch is never written back to the shelf" — NOT REPRODUCED, corrected the
  same day it was filed.** Filed 2026-08-03 from the tenth-use cold walk as a Sev-1 against
  `components/LoftApp.tsx:532` (`syncShelfRow`), claiming an author's whole build is lost on leaving
  the page while the shelf claims it is saved. Driven in a browser against the built export: start a
  new design, set fin span to 123, go to Flight, then *Import another*. The landing surface reads
  "You were working on **New design** with 1 what-if set" and offers *Pick it back up*; reopening it
  shows the fin-span field advertising **123** as its placeholder, which is how this app displays the
  value being flown. The edit survives. Left here rather than deleted, because a ledger that quietly
  loses a false Sev-1 teaches the next session nothing — and this is the second run running in which
  the highest-severity cold-walk finding was the wrong one.

- **A transonic result is published with no out-of-envelope marker on the three surfaces where the
  motor is actually chosen. SEV-1 — REPRODUCED AND FIXED 2026-08-04.** Filed 2026-08-03 as
  UNREPRODUCED. `lib/sim/sweep.ts:22-42` and `:171-182`: neither `MotorSweepRow` nor the
  parameter-sweep or dispersion row types carries `maxMach` or `extrapolated`, so the caveat existed
  only on the Flight card's stat grid.
  **Reproduced by measurement, and it was worse than filed — FOUR surfaces, not three** (the stored-
  flight drag cross-check publishes a mean-gap agreement figure measured against the extrapolated
  curve, and was also bare). Across the real-design corpus, **9 of 109 flown stored simulations leave
  the M ≤ 0.8 envelope**, reaching **M1.67** on `OR vs RAS Test 1.ork` — so it fires on real files, not
  in theory. The mechanism was not four components forgetting a marker: the fact never left the
  solver, because none of the three summary types carried it.
  Fixed by lifting the treatment into `Extrapolated` in `components/ui.tsx` (the primitive
  `DESIGN.md` §5 already declared and nothing implemented), carrying the flag onto `MotorSweepRow`,
  `ParamSweepPoint` and `MonteCarloSample`, and rendering it per candidate, per point and per
  dispersed flight. Pinned by `lib/sim/extrapolated-reach.test.ts` (4 cases, each proved able to fail
  by reverting its own carrier) and an e2e that fails if a flyer is not told.

- **On a multi-motor design the thrust plot describes only the first resolved motor. SEV-1,
  UNREPRODUCED.** Filed 2026-08-03. `components/ResultsView.tsx:1850`: `resolutions.find(x => x.match)`
  feeds both the series and the caption, so a cluster or a staged design is plotted and labelled as
  one motor.

- **`.ork` is Loft's only export, so a RockSim or RASAero design is re-attributed to OpenRocket on
  re-import.** Filed 2026-08-03. `lib/ork/export.ts` writes an `<openrocket creator="Loft">` root
  whatever the design came from, and the format label follows the file. Now that stored results and
  conditions travel too (this run), the mislabelling reaches the cross-check page.

- **The stored WIND DIRECTION is read from the launch-ROD direction tag.** Filed 2026-08-03.
  `lib/ork/adapt.ts:802`: `conditions.windDirectionDeg = numOrUndef(cond, "launchroddirection")` — the
  same tag as `rodDirectionDeg` one line above. Two different physical quantities from one field.

- **Every solver warning states its figure in SI regardless of the units toggle.** Filed 2026-08-03.
  `lib/sim/simulate.ts:1356` (hard landing), `:1312` (ballistic) and the rest render "18.1 m/s"
  directly above a stat grid showing the same quantity in ft/s.

- **Airframe dimension fields are bounded only by `min={0}`.** Filed 2026-08-03.
  `components/LoftApp.tsx:2514` and the fin/nose fields: a body diameter smaller than the motor inside
  it is accepted and flown into a confident number, because the motor and mount keep their size. Fin
  count accepts 1 and 2 with no caveat that the CP method assumes three or more symmetric fins.
  `MAINTAINING.md`'s safety posture names this shape explicitly.

- **Four indigo primary buttons render on `/sweep` at once** — Fetch, Run motor sweep, Run parameter
  sweep, Run dispersion — against `DESIGN.md` §5's "at most one per surface". Filed 2026-08-03 from the
  design-system audit.

- **Six primitives `DESIGN.md` §5 declares do not exist**: `Panel`, `Readout`, `Figure`, `EmptyState`,
  `ErrorState` and one more, while `Section`, `Chip` and `Tabs` exist with **zero** call sites. Filed
  2026-08-03. The missing `Readout` is hand-rolled six ways that disagree with each other
  (`Stat`'s sub-line is `text-[11px]`, `StatCard`'s is `text-sm`). 14 `<select>` elements hand-roll
  five distinct class strings with no `Select` primitive at all. This is the P-track's next milestone
  in everything but name.

- **`text-[11px]`, scoped by §3 to "axis ticks and diagram annotations only", carries the labels of
  every decision-grade readout and every editor field.** Filed 2026-08-03.
  `components/ResultsView.tsx:1630,1682,1718,1810`.

- **`/analyze` tells the flyer it is forwarding somewhere it is not.** Filed 2026-08-03.
  `app/(app)/analyze/page.tsx:16`: `RETIRED = { analyze: "sweep" }` and the canonical route is
  `/sweep`, but the visible text names a different destination.

- **The docs pages are 22 to 44 screens deep with no in-page contents and no heading ids.** Filed
  2026-08-03, measured at 390x844: methods 30,856 px = 36.6 screens over 14 h2s, limitations 36,953 px
  = 43.8 screens, faq 18,672 px = 22.1. Every contextual "how these are computed" link lands at the
  top. This restates and measures an entry filed one run earlier.

- **The motor-sweep table is 734 px wide inside a 324 px scroller and the MOTOR column does not
  stick.** Filed 2026-08-03. At `maxScrollLeft` the only position where DELAY is visible has the
  motor's own name off screen, so the row cannot be identified while reading its numbers. The
  cross-check and parts tables share the pattern more mildly (480 px in 324).

- **The body-diameter grip moves 6.63 mm of diameter per pixel at phone fit width.** Filed
  2026-08-03: an 8 px drag took ⌀38 mm to 91 mm, a 48 px drag to 205 mm. The grip is a 44 px target
  with no fine-adjust on a coarse pointer; the keyboard path exists but a phone has no keyboard.

- **Switching workspaces preserves `scrollY`.** Filed 2026-08-03: at scrollY 3,200 on `/flight`,
  tapping Design lands 2,100 px below the design surface. Every workspace also carries 1,054 px of
  preamble above the spine — 1.25 screens on every route.

- **Expensive computed results are lost on reload while everything cheap is persisted.** Filed
  2026-08-03: the motor sweep, parameter sweep and dispersion all clear, while the design, the unit
  choice, the motor configuration and the picked part all survive.

- **Parts and Mass tables sort one direction only** — the second click returns to design order rather
  than reversing, so ascending is unreachable on `components/GeometryInspector.tsx:725`. Filed
  2026-08-03. Pickable rows are `<tr tabindex="0">` with no role and no `aria-selected`.

- **Every workspace route throws React error #418 (hydration mismatch) on load**, with or without a
  design; `/docs` and `/` are clean. Filed 2026-08-03, UNREPRODUCED.

- **COMPETITION.md row 8 is REFUTED and row 11 is stale both ways.** Filed 2026-08-03 from the
  competitive probe. Row 8 says Loft's wind model is not real-data driven; `lib/weather.ts:200`
  fetches Open-Meteo pressure-level winds and builds a real profile. Row 11 says Loft has no fin
  flutter; `lib/sim/flutter.ts` shipped it with cited moduli. Both want resolving rather than building.

- **Eight candidate COMPETITION rows from the same probe**, each with a verbatim competitor citation:
  per-component aerodynamic contribution (OpenRocket's Component analysis); a design carrying N NAMED
  simulations rather than one live one; plot-any-variable-against-any-variable; automatic design
  optimization; pods and parallel boosters; canted fins and roll; wind turbulence (OpenRocket writes
  `<windturbulence>` on all 91 corpus sims and Loft reads none of it); and a CD-vs-Mach curve
  (RASAero II's Aerodynamic Plots).

- **Loft's own `.ork` export writes no `<simulations>` block, so every launch condition and the motor
  configuration are silently dropped on a round trip. SEV-1 — FIXED 2026-08-03.** Filed and closed
  the same run, from a cold walk of the built export. `lib/ork/export.ts`'s `serializeRocketXml` takes only the rocket and never emits
  `<simulations>`, while `lib/ork/adapt.ts:788 parseSimulations` is where rod length, rod angle, wind,
  launch altitude and the atmosphere all come FROM — so re-importing a file Loft just wrote gives
  surface wind 3.0 m/s → 0.0, rail length 2.0 m → 1.0, and **drift from pad 630 m → 0 m**. Apogee is
  unchanged, so nothing on screen flags the loss, and the disclosure still reads "Conditions · as
  designed" over Loft's defaults. Drift and rail-exit are exactly the two figures used to decide
  whether the field and the rail are big enough. The same omission takes the motor-configuration
  picker with it (it is built from the stored sims): on `A simple model rocket.ork`, import → A8 →
  apogee 53 m, download, re-import → C6 → apogee 317 m, and no control left in the app gets back to
  the A8 that was exported. Reproduce: import `fixtures/demo-dual-deploy.ork`, note drift, Download
  .ork, Import another, pick the file just saved. `exportOrk` already RECEIVES `doc.simulations` —
  `components/LoftApp.tsx:860` passes `{...doc, rocket}` — so the conditions are in hand and simply
  not written. Preserve them verbatim; do not synthesise `<flightdata>` from Loft's own solver, or
  the Cross-check page ends up comparing Loft against itself at 0% error.

  **Fixed:** `serializeRocketXml` now emits a `<simulations>` block carrying each stored run's name,
  status, `configid` and full `<conditions>` (rod length, angle, direction, wind, launch altitude and
  the atmosphere). Measured after: drift from pad round-trips 629.7 → 629.7 m on `demo-dual-deploy`,
  291.5 on single-deploy and 253.8 on boattail, with rail length, wind and rail-exit velocity all
  identical. `<flightdata>` is written ONLY when the caller states the stored results still describe
  this rocket — the Download button passes `rocket === doc.rocket` — because carrying another tool's
  results onto an edited airframe would make Cross-check report the flyer's own what-if as Loft's
  error. A design with no stored run gets no block at all. Pinned by three cases in
  `lib/ork/export.test.ts` and an e2e driving Download → Import that reads drift off the page; the
  pre-existing round-trip e2e could not catch this because it asserts APOGEE, which barely moves with
  the launch setup.

- **A motor that does not resolve exactly is substituted with one that does not FIT the mount, and the
  whole flight is reported off it. SEV-1 — FIXED 2026-08-03.** Filed and closed the same run, from a
  cold walk. An `.ork` whose
  designation is `H999ZZ` on a 29 mm mount is matched to `H999N`, a **38 mm** motor, and the app
  reports apogee 1,471 m, Mach 1.04, 161 g, thrust-to-weight 162:1 with the only cue a small
  "· approx" in the chip. Loft knows the mount is 29 mm — the motor sweep on the same airframe says
  "15 bundled 29 mm motors" and does not list H999N. The unmatched-entirely case (`MYMOTOR`) is
  handled well, with the flight withheld and an honest explanation; the dangerous case is the one
  that looks fine. Knock-on: with the flying motor absent from the sweep's list, all 15 rows read
  "Use", none says "flying now", and no row carries the DESIGN badge, so there is nothing to anchor
  the comparison against.

  **Fixed:** `resolveMotor` now takes the casing the design file itself states and vetoes any
  NON-EXACT match whose casing disagrees; a design's own exact motor is never vetoed, because that is
  not a substitution Loft chose. `swapOptions` filters on the same `sameCasing` predicate, so a motor
  Loft substitutes is always one the sweep also offers. Measured: the veto is consulted on 6 of the
  105 corpus motor instances that state a casing, and changes 0 of them; over the whole catalogue
  perturbed three ways at eight casings it withheld 2,271 times and promoted a different motor 0
  times. The refusal also had to be EXPLAINED rather than reported as "not found" — the motor was
  found — so `MotorResolution.vetoedFit` carries the near-miss and both diameters onto the notice,
  the chip ("· wrong casing") and the aria-label. **Two things still open, both filed below:** the
  exact-match exemption, and the sweep's behaviour when the flying motor is a substitute.

- **A design whose file states a casing that disagrees with its own motor's certification record
  flies it with no cue at all.** Filed 2026-08-03 from the pre-push review of the casing veto. The
  veto deliberately exempts an EXACT designation match: a design that names its motor exactly has not
  asked Loft to choose anything, and withholding the flight over a file inconsistency would be a
  regression. So the disagreement is simply not surfaced. Measured: **0 of the 97 corpus instances
  that match exactly and state a casing** disagree, so this is theoretical rather than observed — but
  it is also the one route by which the flown motor can sit outside the sweep's own list. The right
  shape is probably a `doc.warnings` line naming both figures, not a refusal.

- **`sameCasing`'s tolerance band is not transitive: a stated 19 mm matches both the 18 and the 20 mm
  classes, which do not match each other.** Filed 2026-08-03 from the same review. Inherent to any
  tolerance, and the alternative — snapping to nominal classes — has to break the 19 tie arbitrarily.
  No corpus file states 19. Consequence if one did is a wider net, not a wrong flight.

- **"A one-tap parachute pick produces an UNFLAGGED lawn dart" — NOT REPRODUCED, and the ledger is
  corrected rather than left carrying a false Sev-1.** Filed 2026-08-03 from a cold walk against the
  control shipped in R8 increment 6, and re-measured the same day before acting on it. Fitting PAR-9TM (228.6 mm) to the 0.78 kg H-powered sample takes descent rate
  7 → 18 m/s and landing energy 17 → 113 J with zero cautions on `/flight` — no marker, no prose —
  while the same page says "below the 5:1 minimum commonly taught for high-power rockets" for
  thrust-to-weight and "below the ~50 ft/s (15 m/s) guideline for stable rail departure" for rail
  exit.

  **The measurement says otherwise.** Driving `demo-single-deploy.ork` through the solver at five
  canopy sizes: 610.0 mm gives 6.96 m/s and no landing warning; 457.2 mm gives 9.20 m/s and
  `hard-landing` at severity *caution*; 300.0 mm gives 13.90 m/s, 228.6 mm gives **18.14 m/s and
  112.7 J** and 150.0 mm gives 27.33 m/s, all at severity *warning*. Those are the walk's own two
  figures to the decimal, and the engine raises `hard-landing` on both — the rule is
  `groundHitVelocity > 7.6 m/s`, firm, and `> 10.7`, hard, the same thresholds the booster check uses.
  `components/ResultsView.tsx` renders `r.warnings` unconditionally whenever the list is non-empty.
  So recovery IS policed, by a rule that predates the parachute picker.

  **What survives is a test gap, and it is why the claim was believable:** grepping `e2e/` for
  "hard landing" or "firm landing" returns nothing. No end-to-end case asserts that a hard-landing
  caution reaches the page, so a regression that stopped rendering it would be invisible to the gate —
  and a walker looking for it has no pinned behaviour to check against. That is worth closing.

  The general lesson is filed in `HANDOFF.md`: a cold walk is a bug-FINDER, not an oracle. Every
  finding it produces is a hypothesis to re-measure before it becomes work.

- **The validation CSV exports carry no units, and the same filename and header hold metric or
  imperial depending on a toggle elsewhere. SEV-1.** Filed 2026-08-03 from a cold walk. `/validate`'s
  OpenRocket table exports `Metric,Stored,Loft,Δ` over rows mixing metres, m/s, m/s², seconds, Mach
  and percent; apogee exports as `50.6` in Metric and `165.97769028871392` in Imperial, both as
  `openrocket-validation.csv`, with nothing in the file to tell them apart. Values are raw 16-digit
  floats including visible float noise (`74.09000000000054`, `2.789999999999969`) for figures the UI
  shows as 74.1 s and 2.8 s, and the Δ column is a percentage with no `%`. The RocketPy table beside
  it fails the opposite way — display strings with thousands separators and a U+2212 MINUS SIGN, so
  every numeric cell lands in a spreadsheet as text. The dispersion CSV one workspace over does this
  correctly (`Apogee (m),Max velocity (m/s)…`, rounded), so this is an outlier rather than a house
  style. Filename is also `rocketpy-cross-check-cross-check.csv`.

- **An ordinary one-thumb scroll that starts on a diagram drag handle both scrolls the page AND drags
  the handle. SEV-1 — FIXED 2026-08-03.** Filed and closed the same run, from a phone cold walk. Flicking up from the body-diameter
  handle at 390x844 took ⌀38 mm → 205 mm, apogee 993 m → 133 m, static margin 4.07 → 1.12 cal, while
  scrolling the page 500 → 1274 px so the diagram was off screen before the numbers settled. Zoomed
  3x — the only way to see the fins on a phone — a left pan started on the nose-length handle panned
  the diagram AND shortened the nose 250 → 230 mm. Control cases prove it is the handle: the same
  flick started 40 px away on plain airframe only scrolls. Undo restores it, but only if you noticed.
  The handles are 44x44 on a coarse pointer by design (P4 increment 5 measured them), so the fix is a
  gesture discipline, not a smaller target.

  **Fixed, and the two obvious fixes both turned out not to work.** The `<g>` already carried
  `touch-none` — `touch-action` is not honoured on an inner SVG element in Chromium — and
  `preventDefault()` on the pointerdown does not stop a scroll either. Only a NON-PASSIVE `touchmove`
  listener does, registered synchronously in the pointerdown so it is in place before the first move.
  **An axis lock was tried and measured and does not work**: two of the three grips are horizontal,
  so a vertical flick on one is unambiguously a scroll, but waiting 8 px to decide still let the page
  go — ⌀38 mm to 139 mm AND 500 to 747 px — because Chromium commits to the scroll inside the slop
  window and the `touchmove` stops being `cancelable`. The decision has to be made on the first move
  or not at all, so the gesture belongs to the handle, as it does on a native range input. **Cost,
  stated:** a flick starting exactly on one of the three 44 px grips no longer scrolls the page.
  Pinned in `e2e/touch.spec.ts` with a control asserting plain airframe 60 px away still scrolls, and
  with a negative control that fails reading 590 to 823 px.

- **The diagram's tap columns went to the two parts that were already easiest to hit, and the fin set
  still has no 44 px target.** Filed 2026-08-03 from a phone cold walk, against P4 increment 5. The
  nose cone and body tube got full-height columns; the fin set is selectable only in a 17 px band at
  the far right, because above the centreline the fin-position drag handle sits on top of it and
  directly above and below the planform the body-tube column claims the tap. The mass object is a
  7 px dot. Increment 5's claim that nothing reachable became unreachable holds — both were tappable
  before and still are — but `DESIGN.md` §8's 44 px minimum is not met on either, and the increment
  described itself as closing the diagram's touch gap. It closed two thirds of it.

- **Tapping an already-selected part on the diagram un-selects it, with nothing on screen saying so,
  and the caption is desktop copy.** Filed 2026-08-03 from a phone cold walk. On a coarse pointer
  there is no hover to fall back on, so an accidental double-tap costs the identify readout entirely.
  The caption reads "Point at a part of the airframe to identify it; click one to keep it picked out"
  — a phone can do neither, and it never mentions un-picking.

- **A what-if edit makes the entire OpenRocket comparison vanish from Cross-check with no message.**
  Filed 2026-08-03 from a cold walk. The stored-vs-Loft table, the mean-abs-error headline and both
  overlay charts disappear on any what-if; the tab still says "Cross-check" and nothing says a what-if
  caused it or how to get it back. Loft knows how to write this state — for the bundled demo it
  prints a full paragraph explaining exactly why the comparison is unavailable. `DESIGN.md`'s "a
  withheld value says why, and what would restore it" is unmet here.

- **What-if edits survive a reload but the undo history does not, so a flyer returns to a modified
  design with a dead Undo.** Filed 2026-08-03 from a cold walk. The banner on that screen promises
  "Picked up where you left off — …, with any what-ifs you had set", which is exactly the case where
  knowing what changed matters most. Recoverable today only because the field placeholder happens to
  show the as-designed value.

- **The dispersion panel's Waiver ceiling is the only one of its seven controls not persisted, and it
  is the one that produces the go/no-go readout.** Filed 2026-08-03 from a cold walk. Six ±1σ inputs
  survive a reload; the ceiling box comes back empty and the CHANCE OVER CEILING tile is simply
  absent, with nothing saying the value was dropped.

- **No docs heading carries an id, so every contextual "how these are computed" link lands at the top
  of a 47,600-character article.** Filed 2026-08-03 from a cold walk. `/docs/methods` has 14 h2s and
  no in-page contents list; the explanation for the panel a flyer is standing in ("Monte-Carlo
  dispersion") is the 13th. These pages are the app's whole answer to "is this number trustworthy".

- **The landing-scatter chart has no axis, tick, scale bar, ring label or hover readout — 302 circles
  and zero text.** Filed 2026-08-03 from a cold walk. The only scale reference anywhere is the caption
  "circle = 95% within 1,203 m", on the chart that exists to tell a flyer how big a recovery area to
  plan for. Downrange/crossrange numbers exist only in the CSV.

- **The two `/validate` tables are rendered identically and sort differently.** Filed 2026-08-03 from
  a cold walk. The OpenRocket table's four columns all sort; the RocketPy table below has exactly one
  sort button, and the Δ column — the only one worth sorting a validation table by — is fixed.
  Separately, sorting Δ ascending orders by MAGNITUDE while the column shows signed values, so −12%
  appears after +5% with nothing saying the sign is ignored.

- **Exports carry none of the assumptions that produced them.** Filed 2026-08-03 from a cold walk.
  The dispersion CSV is 300 rows with no record of the six ±1σ values, the waiver ceiling, the
  conditions, the motor or the date — and since the sigmas are re-typable, two files from one design
  are indistinguishable. The cross-check CSV is `openrocket-validation.csv` regardless of design or
  which stored simulation it compared, even though every row changes with the motor configuration.

- **Authoring a coupler or a centring ring on a materials-less design is fully inert, yet the design
  flips to "edited" and the file's stored-simulation cross-check is withheld.** Filed 2026-08-03 from
  the pre-push review, where it was raised as a defect against R8 increment 7 and REFUTED as one: all
  12 corpus body tubes that state no wall are RASAero's, which state no materials either, so the part
  adds 0.000 g and the honest branch is the one that declines to invent a stock. What survives is
  general and pre-existing: these are the first authoring acts that can change nothing at all, and the
  stored-comparison panel vanishing on ANY edit is the same gap filed two entries above.

- **An UNAIMED absolute edit value survives removal of the part it was typed for, and re-lands on
  whatever the fallback resolves to next.** Filed 2026-08-03. `aimsClearedByRemoving` only fires when
  `bag[slot]` is a string — an explicit aim — so with the default (no aim) `mainParachuteDiameter`,
  `bodyLength`, `bodyDiameter`, `transitionLength` and the rest all outlive the component they
  described and silently re-target. The parachute PICK case was fixed this run because it is the
  worst of them (it rewrites mass as well as size, and carries a vendor's name on the provenance
  line), but the general hole stands and it wants a per-slot fallback resolver that
  `aimsClearedByRemoving` does not currently have. Reproduce: on a design with two body tubes, aim at
  nothing, type a body length, remove the primary tube — the length lands on the other one.

- **Three e2e assertions addressed sweep columns by hard-coded `nth-child`, and inserting one column
  silently re-pointed them at the neighbour.** Filed and FIXED 2026-08-02.
  `e2e/smoke.spec.ts`'s "a design edit re-runs an open sweep" read `td` index 1 — the Class column —
  and after a `Use` control was inserted second it was reading a button label no design edit can
  change, so it could only ever time out. "motor sweep flies every fitting motor" hard-coded
  `nth-child(3)` for Apogee and `nth-child(8)` for Flutter. All three now resolve the column from its
  header text. **Two traps in doing that**, both of which produced a wrong-looking failure for a
  selector problem: `DataTable`'s headers render UPPERCASE (so `innerText` is "APOGEE") and carry a
  sort-arrow glyph, and a `findIndex` miss returns −1, which becomes `nth-child(0)` — a selector that
  matches nothing and fails as "expected 0 to be greater than 2". The helper now normalises and
  asserts the column was found, naming the headers it saw.

- **The motor sweep's ballistic-gap notice compares the DESIGN row against the FLOWN apogee, so a
  motor swap makes it attribute a motor difference to the method.** Filed 2026-08-02 from the
  pre-push review. `components/MotorSweep.tsx` computes `ballisticGap(sorted.find(r => r.isDesign)?.apogee,
  designApogee)`, where `designApogee` is `run.result.summary.apogee` — the flight actually shown,
  which after a swap is the SWAPPED motor's. The amber notice then states a cause it no longer has:
  "the Design row flies ballistic … against the X this design actually flies, because its recovery
  opens before apogee." The mechanism predates the *Use* column (the `Swap motor` select could always
  reach it), but the column now puts the trigger one tap away inside the panel making the claim. The
  comparison is only meaningful with no swap active, or against the swapped motor's own row.

- **Shard 1 fails a DIFFERENT test almost every run, and the common factor is the four self-hosted
  RocketPy/Pyodide tests it carries.** Filed 2026-08-03 with the evidence, because this is the entry
  that stops a future session diagnosing its own change. `playwright.config.ts` sets
  `workers: process.env.CI ? 1 : undefined`, so locally Playwright runs ~half the cores in parallel
  while four tests each boot a Python runtime. Measured across three runs of the same build:
  run 1 failed `depth.spec.ts` "phone: the workspace spine stays within 1060px" after **31.2 s**
  (passes in **5.4 s** alone); run 2 failed `rocketpy-selfhosted.spec.ts` "names the connection when
  the run fails with no signal" after **6.3 s** (passes in **1.3 s** alone). **Two different tests on
  two runs is the signature of resource pressure rather than a defect** — a deterministic break fails
  deterministically. `grep -c EMFILE` is 0 in both, so it is not the file-descriptor exhaustion this
  file already documents. **Run shard 1 with `--workers=2` before believing it**, and say in the
  report if you did. The real fix is either capping workers in the config for the Pyodide file or
  giving it its own project.

- **`e2e/docs.spec.ts:32` "every docs page is readable offline" is load-sensitive, and it failed once
  in a full shard while passing everywhere else.** Filed 2026-08-02 with the evidence, because a
  future session meeting it needs to know this before diagnosing its own change. The test waits up to
  20 s for the service worker to become the controller AND for six URLs to be in the cache; under a
  full shard on this sandbox that budget is occasionally not enough. Measured this run: it failed once
  in `--shard=1/2`, then **passed in isolation** and **passed in a full re-run of the same shard
  (106/106)** against the identical build, and the change in flight touched no docs page, no service
  worker and no precache script. Not EMFILE — `grep -c EMFILE` was 0. The fix is a longer or
  condition-based wait, not a retry.

- **`lib/design-system.test.ts` reports 11 green while TEN classes of `DESIGN.md` drift cannot fail
  it.** Filed 2026-08-02 from a design-system audit, every count re-measured and the claims
  adversarially verified. The suite is honest about what it implements — §9's six shell greps — but
  §9 itself does not reach these, and §9 is shared verbatim with the sibling app, so this is §9's gap
  as much as the test's. Live, on surfaces a flyer reaches in under a minute:
  - **`lib/ui-tokens.ts` is outside every walk.** `uiSources(["components","app"])` never reads `lib/`,
    and that file holds `buttonClass`, `navItemClass` and `NAV_BAR` — the strings every converted
    surface now inherits. A probe planting `rounded-lg` and `px-5` there leaves all counts at 0 and
    the suite green. Latent today (it is clean), and it gets worse the more adoption succeeds.
  - **Primitive EXISTENCE is never asserted**, only adoption counts — and `Section`, `Tabs` and `Chip`
    are asserted at exactly 0 adopters, so deleting them from `ui.tsx` still passes.
  - **Six primitives `DESIGN.md` §5 says "live in `components/ui.tsx` and are imported" do not
    exist**: `Panel`, `Readout`, `Figure`, `EmptyState`, `ErrorState`, `Extrapolated`. Each is
    hand-rolled per file instead — `ResultsView`'s `Stat` and `MonteCarlo`'s `StatCard` are two
    Readouts; `ResultsView`'s `Plot` is a Figure; `FlightViz` and `LineChart` carry two legends. This
    is the exact mechanism that produced the twelve card treatments.
  - **`text-[11px]` is unconditionally allowed**, so §3's scoping of it to "axis ticks and diagram
    annotations only" is unenforced: 47 occurrences, on `<legend>`, field labels, `<dt>` and
    `DataTable`'s entire header row.
  - **The radius grep names `rounded-lg` alone** — 5 live off-system radii pass (4x `rounded-sm`, 1x
    `rounded-[2px]`), and `app/globals.css` declares `border-radius: 3px` on the global focus outline
    and `4px` on docs inline code, which the stylesheet check does not read (it parses `font-size`
    only — the blind spot its own comment says it closed for `.eqn`).
  - **No colour assertion at all**, though §2 says indigo is the single accent: fuchsia on the mass
    marker and its legend (`RocketDiagram.tsx:611,612,878`), plus 24 hard-coded hex occurrences over
    10 distinct values used for chart series identity.
  - **No font-weight assertion**, though §3 reserves `font-semibold` for "the one number a surface
    exists to show": 23 uses, plus `globals.css` setting h2/h3/strong/th to 600.
  - **The hand-rolled-control check matches `<button>` only**, so 12 hand-rolled `<select>` elements
    across 4 distinct class strings ship under a budget asserting exactly 3 hand-rolled controls.
    There is no `Select` primitive.
  - **No assertion for §3's `font-mono tabular-nums` rule** on compared numerals, and none for §5's
    five required states.
  Correcting one claim from the audit while filing it: `grep -c fuchsia` counts LINES (3), not
  occurrences (7); and the hex figure is 24 occurrences over 10 distinct, not 8 — reaching 8 requires
  excusing `app/layout.tsx`'s two `<meta name="theme-color">` values, which cannot take a token.

- **Two data surfaces implement none of `DESIGN.md` §5's five required states.**
  `components/FlightViz.tsx:37` returns `null` when `traj.length < 2` — a flight that ends on the rail,
  or a design flown before a motor is picked, leaves a blank hole where the trajectory chart should
  say what would fill it, while `LineChart` two files away implements the state correctly.
  `components/DragCrossCheck.tsx` has zero of the five (`grep -ciE 'loading|error|offline|extrapolat'`
  returns 0) and renders two `LineChart`s unconditionally, so it cannot say "this stored log had no
  usable drag column" — it just shows one line where a flyer expects two. §5: "a surface with no empty
  state is not finished. It is the state a flyer sees first."

- **The parts-table geometry that made the touch ratchet's blind spot unreachable is STALE, and the
  entry below still repeats it.** Measured 2026-08-02 on the built export at 390x664: the parts table
  is **418 px inside a 324 px `overflow-x-auto` container**, not 1,198 px inside 390; `getByRole("row")`
  returns **9**, not nothing; and rows 0 and 7 both `.click()` clean on the 38 mm sample and on the
  54 mm one. The `DataTable` conversion fixed all three and nothing re-measured, so the recorded
  reason nobody reached the selection-gated surface had been false for several runs. Correcting the
  record rather than deleting it, because the wrong measurement is what kept the blind spot open.

- **A body part's diagram tap column is only as wide as the part is long, and 37% of real parts are
  under 44 px wide.** Filed 2026-08-03, measured over all 39 corpus files at a 390 px fit width:
  **56 of 150 body parts** fall short, the narrowest being a 0.8 px transition on
  `github-issuiuc-silsim-rocket/rocket.ork`, with 3.3 px and 6.0 px close behind. The full-height
  column shipped this run fixes the HEIGHT contract on every part; the width follows the geometry and
  cannot be padded without stealing area from a neighbour (the later-drawn column wins an overlap, so
  which part loses would be arbitrary). The diagram's zoom control is the real answer and is already a
  44 px target — what is missing is any hint that zooming is what makes a short part tappable.

- ~~**Only 2 of a design's 8 parts have a tap target on the diagram, and both are 12 px tall.**~~
  **HALF FIXED 2026-08-03** — the two that HAVE a target now get a full-height tap column on a coarse
  pointer, measured 78x84 and 218x84 px with 80% and 73% of each reaching the part. **What stays
  filed is the other FOUR, and the count in the first version of this entry was wrong.** Fin sets and
  mass objects were ALREADY tappable — `o.fins` and `o.masses` both carry `hoverProps` — so 4 of the
  sample's 8 parts have a diagram target, not 2. That false count nearly shipped a regression: it is
  what let the tap columns be described as pure gain while an earlier paint order buried the fins.
  The four genuinely unreachable on the picture are the parachute, the inner tube and the two centring
  rings, for which `rocketOutline` produces no silhouette at all — so for those the honest answer may
  be that the table IS the surface and the diagram should say so rather than pretend.

- ~~**A drag handle's 44 px touch circle sits ON the airframe and steals the part underneath it.**~~
  **FIXED 2026-08-03**, by giving the part a target the handle cannot cover rather than by shrinking
  the handle. The grips keep their 44x44 circles and still win where they overlap — a grip is a
  smaller, more specific target the flyer aimed at — but they now account for only 20–27% of a part's
  column instead of being the only thing hittable near the centreline. `e2e/touch.spec.ts` measures
  the share and prints it rather than asserting a bare pass.

- **The motor sweep ranks 15 candidate motors and cannot apply one.** Filed 2026-08-02.
  `components/MotorSweep.tsx` contains exactly one `<Button>` in the whole file, and it is *Run*. A
  flyer who sweeps motors must memorise the winning designation, navigate to `/design`, and scroll
  **2.77 screens** to find it again in the *Swap motor* select (`components/LoftApp.tsx:2181`). That
  is what "pick a motor" — one of P4's three named pad journeys — actually costs today.

- **Two of P4's three pad journeys breach `DESIGN.md` §8's two-screen cap, and `e2e/depth.spec.ts`
  anchors above both.** Filed 2026-08-02, measured at 390x664 on the built export. *Sanity-check a
  delay*: the Optimum delay tile is 12th of 14 at **1,666 px = 2.51 screens** on `/flight`, while
  `e2e/depth.spec.ts:63` anchors that route on the Apogee tile at 1,138 px = 1.71 and passes. *Pick a
  motor*: the Swap motor select sits at **1,841 px = 2.77 screens** on `/design`. *Check stability* is
  healthy at 1.03 screens. The depth spec measures the route's primary answer, not each journey's, so
  neither breach fails anything today.

- **`RocketpyCrossCheck` borrows its propulsion guard from its call site.** Filed 2026-08-02.
  `components/RocketpyCrossCheck.tsx:122-137` runs its own `runFlight` and reads `staticMarginCal` off
  it without checking that run's own `hasPropulsion`/`motorsComplete`; it is safe only because
  `components/ResultsView.tsx:972` gates the panel. Contrast `lib/sim/sweep.ts:107`, which guards in
  the library. One prop-move from publishing an unloaded margin.

- **The Validation docs page flies committed reference designs without checking they still resolve.**
  Filed 2026-08-02. `app/docs/validation/page.tsx:34` puts `run.result.staticMarginCal` into the
  published RocketPy comparison at BUILD time and never checks `hasPropulsion`, so a reference design
  whose motor stopped resolving after a database re-cut would silently publish an unloaded margin as
  Loft's own accuracy record. Latent rather than live — today's references all resolve.

- **`scripts/gen-components.mjs` drops four upstream fields it could read.** Filed 2026-08-02, from a
  read of the `.orc` schema against the readers. `TubeCoupler` and `CenteringRing` read only
  InsideDiameter / OutsideDiameter / Length and never `Thickness`; `Parachute` reads Diameter / Sides /
  LineCount / LineLength and drops `DragCoefficient`, `PackedLength` and `PackedDiameter`. Harmless
  against today's vendor set — 0 couplers and 0 rings state a thickness and 0 of 151 chutes state a Cd
  or a packed size — but a re-vendor that fixed any of them upstream would be silently ignored.

- **The catalogue needs a vendor-alias table: 16 manufacturer strings for 14 companies.** Filed
  2026-08-02, measured over all 3,445 rows. "MPC" and "MRC" both appear in couplers (4 parts and 2);
  "Quest" and "Quest Aerospace" both appear in centring rings. The vendor filter therefore splits one
  company into two options.

- **`PartPicker`'s `rowKey` collides on centring rings.** Filed 2026-08-02. The key is
  `manufacturer/partNumber/outerDiameter/length`, and five ring rows duplicate it — SEMROC CR-7-18,
  RA-50/52H-101(BT-50), CR-9-225X2, CR-9-225X2P and CR-9-175P. A React key collision the first time a
  ring picker is opened; parachutes collapse the key to `mfr/part//` with 0 collisions.

- ~~**`GeometryInspector`'s eleven gesture tooltips are still hover-only.**~~ **FIXED 2026-08-02**,
  on the second attempt, in the form the first attempt established. Each now carries an `aria-label`
  that BEGINS with the control's own visible text and then adds what the tooltip said, so the
  accessible name is extended rather than replaced — `aria-label` overrides where `title` only
  supplements, and the regex sweep that substituted the description for the name renamed
  "Add a tube behind this" out from under fourteen e2e specs. The three dynamic labels interpolate
  the same component or stage name the visible text does.
  **What is NOT fixed, and stays filed:** `e2e/touch.spec.ts` still never selects a part, so ten of
  these eleven render outside its reach and a regression on them would not fail it — the count reads
  0 either way. ~~Reaching them needs the diagram's selection path or a wider viewport;
  `getByRole("row")` matches nothing for that table and a direct row click times out, because it is
  1,198 px wide inside a 390 px viewport in its own scrolling container.~~ **That sentence was stale
  and is corrected in the entry at the top of this file** — measured 2026-08-02, the table is 418 px
  inside 324, `getByRole("row")` returns 9, and a row click works. Also measured: the roadmap's
  "eleven … renders only once a part is SELECTED" is itself an overstatement — **eight** are strictly
  selection-gated, two more need a mount or a stage to exist first, and *Add a booster stage* renders
  ungated.

- **A picked catalogue part silently overrides the whole-airframe material control, and neither
  surface says so.** Filed 2026-08-02, **REPRODUCED by the reviewer, not re-driven by me.**
  `withCatalogTube` runs after `withAirframeMaterial` in `editOne`, which is the right precedence —
  a part the flyer NAMED should beat a category they chose from a dropdown — but nothing tells them.
  Measured: pick a BT-60, then set Airframe material = Cardboard, and the picked tube flies kraft at
  782.88 while every other tube flies cardboard at 700, with the select reading "Cardboard" and its
  "As designed (…)" label reading the pristine design's stock. The control that claims to state the
  airframe's material names neither of the two actually being flown. The fix is a note on the select
  when a pick is active, not a change to the precedence.

- **The dispersion CSV's `Landed` column has no e2e covering it**, and neither does the withheld
  recovery radius. Both shipped this run with unit/corpus coverage only. `e2e/smoke.spec.ts:737` is
  the only positional CSV parse in the suite and it reads the FLIGHT export, so a column inserted
  into the dispersion export is unguarded either way. Filed 2026-08-02.

- **`summarize([])` returns `sd: 0` — a confident finite zero — while every other field is `NaN`.**
  `lib/sim/montecarlo.ts:172,178`. No surface reads `sd` today, so this is latent; it matters because
  the withheld-value contract is per-field, and a future "drift σ" readout would print "0 m" for a
  set where nothing landed, re-creating this run's Sev-1 one field over. Filed 2026-08-02.

- **A `<select>` with no `TOUCH_TARGET`, four of them, and two withheld values with no reason.**
  Filed by the design-system audit, 2026-08-02, **UNREPRODUCED by me** — read from the code, not
  driven. `components/ParameterSweep.tsx:363` and `:380` (`px-2.5 py-1.5`) and
  `components/ResultsView.tsx:621` and `:681` (`px-2 py-1`) carry no `TOUCH_TARGET`, so they are
  under the 44 px `DESIGN.md` §8 contract on a coarse pointer. Separately
  `components/MotorSweep.tsx:390` (`optimumDelay`) and `:383` (`flutterMargin`) render a withheld
  value as a bare em dash with no reason, no `aria-label` and no restoring action — §6 says "a
  withheld value says why, and what would restore it. A blank cell is a bug." Both are P-track
  craft work rather than defect-ledger clearing.

- **Six primitives `DESIGN.md` §5 names as living in `components/ui.tsx` do not exist.**
  `Panel`, `Readout`, `Figure`, `EmptyState`, `ErrorState`, `Extrapolated` — verified absent by
  grep, 2026-08-02. §5's preamble says "a surface that needs one of these and hand-rolls it instead
  is not done", and `Readout` in particular is hand-rolled at least five times with five different
  geometries (`components/ResultsView.tsx:1490` and around). **The file and the code disagree, and
  `MAINTAINING.md` says the repo wins** — so either the primitives get built or §5 gets corrected;
  it should not be left as a standing contradiction in the binding document. Also filed: `Chip`
  (`components/ui.tsx:308`) and `Section` (`:121`) have ZERO adopters, asserted at 0 in
  `lib/design-system.test.ts`, while four hand-rolled chips and eight hand-rolled section headings
  ship beside them.

- **No text-input or select primitive exists at all**, so every search box and dropdown in the app
  copies a class string by hand — `components/LoftApp.tsx:2639` is the canonical one and
  `components/PartPicker.tsx` copied it again on 2026-08-02 because there was nothing to adopt.
  Measured: `grep -rn 'role="dialog"\|<dialog\|combobox' components/` returns zero hits, and
  `DESIGN.md` §2 names "dialogs" as a surface the token table covers. This is the missing half of
  the §5 vocabulary and it is the reason the parts picker is a `Disclosure`-shaped panel rather
  than a real combobox.

- **The catalogue's material names have ZERO overlap with the model's seven airframe keys.**
  Measured 2026-08-02: 1,089 catalogued body tubes carry 39 distinct material strings, all
  descriptive (`"Paper, spiral kraft glassine, Estes avg, bulk"`), while `AIRFRAME_MATERIALS` keys
  are `cardboard`/`kraft-phenolic`/`bluetube`/… . So a picked part's published DENSITY cannot be
  carried into the model through `airframeMaterial`, which takes a key. R8 increment 4 needs an
  edit field that carries an explicit `Material` (name + density + type) rather than a key, or the
  vendor's own figure gets snapped to one of seven generic ones — which is the substitution
  `lib/components/db.ts:133-141` explicitly refuses to make.

- **`manufacturers()` returns 16 strings for 14 companies.** "Quest"/"Quest Aerospace" and
  "MPC"/"MRC" are each one vendor twice, so the parts picker's vendor filter lists a company twice
  with its parts split between the entries. Measured 2026-08-02 from `lib/components/db.ts:90`.
  `ROADMAP.md` already names the alias table as owed by R8; this is the measurement that makes it
  actionable.

- **A three-stage stack that parts at ONE joint mis-attributes booster descent mass.**
  Filed by the Sev-1 screen, 2026-08-02, **UNREPRODUCED by me.** `lib/sim/simulate.ts:962` reads
  `phases[nStages - i]?.startTime`, assuming `phases[p].stageCount === nStages - p`; but
  `lib/sim/setup.ts:217-229` skips stages already gone, so a 3-stage serial stack that separates
  once yields `phases = [{0,3},{t,1}]`. One shed stage then resolves to `undefined` → mass 0 → its
  `boosterDescent` is dropped silently; the other is charged the COMBINED mass of everything that
  left. Latent: no corpus 3-stage design carries a chute on a lower stage (the filer checked all
  four), so it needs an authored design to reach. Booster descent speed and landing energy are
  range-safety numbers, so this is worth reproducing before it becomes reachable.

- **`maxAcceleration` is a printed 0 g on any design whose recovery deploys at `launch`.**
  Filed by the Sev-1 screen, 2026-08-02, **UNREPRODUCED by me.** `lib/sim/simulate.ts:782` updates
  `maxA` only while `!anyDeployed(...)`, and a `launch` deploy event is true from the first
  post-liftoff step, so the peak never leaves its initialisation zero and is rendered with no
  caveat. No corpus file uses `launch`, so it is latent — but the model accepts it and the importer
  maps it, so a real `.ork` can reach it.

- **`Flight time` prints the 1,200 s solver cap as a fact when the flight never landed.**
  Filed by the Sev-1 screen, 2026-08-02, **UNREPRODUCED by me.** `components/ResultsView.tsx:554`
  renders `s.flightTime` unconditionally while `Ground-hit speed` and `Landing energy` in the same
  grid are correctly gated on `s.landed`. Same class as the drift defect fixed this run, on the
  same card — worth doing with whatever next touches that grid.

- **The cross-check compares a 0 m/s sentinel against a real stored ground-hit velocity.**
  Filed by the Sev-1 screen, 2026-08-02, **UNREPRODUCED by me.** `lib/validation/compare.ts:43`
  compares `groundHitVelocity` whenever the file carries one, but the solver returns 0 when
  `landed` is false, so a −100% row enters `mape` and is printed as Loft's answer. The accuracy
  panel is the surface whose whole job is to say whether Loft can be trusted.

- **Typing a main-deploy altitude alone does nothing, and says nothing.**
  Filed by the Sev-1 screen, 2026-08-02, **UNREPRODUCED by me.** `applyDualDeploy` and
  `hasGeometryEdits` both require `mainDeployAltitude` AND `drogueDiameter`, so a lone altitude
  leaves the flight byte-identical with no notice, while the field's own placeholder reads
  "apogee". The boattail pair at least hints at its partner in the placeholder.

- **The flutter estimate's `sourced: false` flag reaches no screen.** `lib/sim/flutter.ts:240`
  documents the field as existing "so a surface can mark the estimate as unsupported", and six of
  fourteen rows are unsourced — but `FinFlutter` does not carry it and `grep -rn "sourced"
  components/ app/` returns nothing. Flutter velocity goes as sqrt(G), so this is the most
  leveraged input in the app's only safety estimate. Filed 2026-08-02.

- ~~**A booster's fins are judged for flutter against the speed the SUSTAINER reached after they
  were gone.**~~ **REPRODUCED and FIXED 2026-08-02**, and every figure the filer gave reproduced
  exactly: `Three stage low power rocket.ork` 0.68 → 2.11, `Two stage high power rocket.ork`
  0.52 → 1.20, `02.Two-stage.ork` 0.21 → 0.29, `03.Three-stage.ork` 0.23 → 0.72. `analyzeFlutter`
  now takes the realised phase timeline and judges each fin set only over its own attachment
  window. Pinned by a corpus assertion over 12 shed fin sets; as a negative control the old code
  names six violations with their times. **One thing it left behind, and it is latent rather than
  live:** a stage shed before the rocket exceeds 1 m/s leaves its fin set with no sample, and it
  then drops out of `finSets` with no error — and `finSets` has no consumer in `components/` or
  `app/` at all (only `worst` is read), so nothing would notice. The corpus assertion now also
  requires the reported fin-set count to equal the design's, which keeps it at zero; the real fix
  is a "not applicable" state on the flutter surface, and that belongs with whatever next touches
  it.

- ~~**Monte-Carlo publishes as a distribution the two numbers the flight card explicitly
  withholds.**~~ **REPRODUCED and FIXED 2026-08-02.** Confirmed exactly as filed:
  `Complex.Two-Stage.CDX1` at `recoveryCdScale: 5` — inside the field's own advertised 0.1–10×
  range — gives **40 of 40 samples with landingSpeed 0 and landingEnergy 0**, and the panel read a
  median landing speed of **0.00 m/s** and **0.0 J** of landing energy, with the firm-landing chance
  at 0.0%. `summarizeSamples` now computes both figures over the flights that reached the ground,
  `landingSpeedExceedance` is denominated the same way, the result carries `landedN`, and the panel
  withholds both with the reason when nothing landed — and says "covers N of M flights" when only
  some did. Pinned by a corpus assertion over 62 dispersions, with a guard that the unlanded path
  was actually exercised; the negative control fires. Published on `/docs/methods`.

- **A Loft-exported `.ork` re-opens on a different motor configuration, and says nothing about it.**
  **REPRODUCED 2026-08-02, and the diagnosis in the original filing is WRONG — read this one, not
  that one.** The claim was that the export loses the motor. It does not: dumping the emitted XML,
  all five `<motor configid=…>` entries carry exactly the designations the original had, and the
  `default="true"` marker lands on the right configuration. Geometry is clean too.

  What actually happens: `exportOrk` writes no `<simulation>` element, so the re-imported document
  has `simulations: []` — and `runFromDocument` with no explicit `configId` flies **the first stored
  simulation's configuration** when there is one, and falls back to the design's **default
  configuration** when there is not. On `Deployable payload.ork` those are different configurations
  of the same rocket: the first stored sim used the A8 (apogee **30.8 m**), the design's default is
  the C6 (**257.6 m**). Both numbers are correct for the motor actually flown, and the motor chip
  names it — which is why this is filed rather than treated as a Sev-1.

  Measured across the first 12 openrocket corpus files, every one going `sims N → 0`:
  `Deployable payload` 30.8 → 257.6 m (**+736.6%**), `Pods--airframes and winglets` 41.8 → 216.8
  (+419.0%), `Clustered motors` 62.9 → 308.9 (+391.1%), `3D printable nose cone and fins` 40.0 →
  119.6 (+199.2%), `Chute release` 313.4 → 497.7 (+58.8%), `Dual parachute deployment` 579.0 → 871.7
  (+50.5%). Seven of the twelve are unchanged, which is the tell that this is configuration
  selection rather than a geometry or motor defect.

  **Two candidate fixes, and they are not equivalent.** Carry the flown configuration through the
  export (a `<simulation>` element, or at minimum making the flown config the default on the way
  out) — or leave the file alone and have the IMPORT say plainly which configuration it chose and
  why, when a file offers several and names no simulation. The second is smaller and helps every
  file with multiple configs, not just Loft's own exports. `/docs/limitations` documents this round
  trip's fin-outline fidelity without mentioning either. Adjacent to R6, which is SHIPPED, so it is
  worked forward as a gap rather than by re-opening R6.

- **"Pick it back up" replays the edit bag onto bytes that already contain it.** Filed 2026-08-02
  from the opening fan-out; **UNREPRODUCED by me.** `components/LoftApp.tsx:1347` `reset()` calls
  `syncShelfRow()`, which rewrites `designBytes.current` with the geometry edits baked in
  (`:531-532`), stores the discarded session from those baked bytes at `:1351`, and still carries the
  unbaked edit bag at `:1357`; `onRestoreDiscarded` (`:697`) then replays the bag on top. Claimed
  repro in the shipped UI: new design → Parts → Body tube → "Add a tube behind this" → Flight
  (848 m) → "Import another" → "Pick it back up" → **724 m, a 9th row, a second Body tube at
  1,150 mm**: −15% apogee and +310 mm of length, unlabelled, produced by the button whose only job is
  to undo the destructive act. Root cause is claimed to be `lib/model/edit.ts:2446` — `applyAdds` and
  `applyAddedStages` insert unconditionally with no check that the id is already present, unlike
  `applyMountAdds` which is explicitly idempotent — which also makes one authored UUID appear twice
  in one tree, and `lib/model/id.ts:81` names that as exactly what `uniqueUuidFrom` exists to
  prevent. **Sev-1 if it reproduces** (one-way door on an undo).

- **A from-scratch build stops being tracked by its shelf row after any reload.** Filed 2026-08-02
  from the opening fan-out; **UNREPRODUCED by me.** `components/LoftApp.tsx:515` `syncShelfRow` no-ops
  unless `builtHere.current && shelfRowId.current`, and a resumed session restores neither
  (`builtHere.current = true` only at `:800` in `onNew`; `shelfRowId` only at `:588` behind
  `bytes && !resume`). Claimed: insert `await page.reload()` after the rename in the shipped
  `e2e/smoke.spec.ts:532` and the build itself restores fine (930 m on screen) but "Import another"
  shows no "My build" row at all — the shelf still holds "New design" with the untouched 994 m
  starter. Same root cause is claimed to disable motor-swap baking in `downloadOrk` (`:850`), where
  the code's own measurement at `:845` is that 7 of 15 offered swaps put the saved file >100% from
  the screen, worst **+1369%**.

- **With no liftoff, six summary figures are initialisation zeros printed as facts.** Filed
  2026-08-02 from the opening fan-out; **UNREPRODUCED by me.** `lib/sim/simulate.ts:931` — with no
  liftoff `apogeeTime` stays 0, so `optimumDelay = max(0, 0 − burnout) = 0`, and `railExitVelocity`,
  `burnoutVelocity`, `descentRate`, `timeToApogee` and `maxAcceleration` are all still zero, while
  `ResultsView` gates the whole card on `hasPropulsion` alone, which is true. Claimed: `A simple model
  rocket.ork` with `ballastKg: 1` (the nose-ballast field is `min={0}` with no max at
  `LoftApp.tsx:2252`) prints `optimumDelay 0.00, railExit 0.00, burnoutV 0.0, descentRate 0.00,
  timeToApogee 0.00, maxAccel 0.0, T:W 0.92` — and `simulate.ts:1527` gates its low-rail-exit caution
  on `railExitV > 0`, so a 0.00 m/s rail exit is displayed uncautioned. Same sentinel-as-fact shape as
  the already-fixed no-motor entry below, in the no-liftoff branch instead.

- **One shed stage is charged the mass of every stage that left with it, and the others vanish.**
  Filed 2026-08-02 from the opening fan-out; **UNREPRODUCED by me, and its reach today is zero.**
  `lib/sim/simulate.ts:961` `const sepT = phases[nStages - i]` assumes one phase per stage; when a
  serial stack parts at ONE joint, `phases` is shorter. Claimed on `03.Three-stage.ork` with a
  parachute injected into stages 1 and 2: a single entry, "Booster 2" at **1.8318 kg / 22.77 m/s /
  475.1 J** raising a `booster-hard-landing` warning, against Booster 2's own dry mass of
  **0.2154 kg** — terminal speed goes as √m so ~2.3× high and the energy ~5× high on a range-safety
  readout — while Booster 1 appears in neither `boosterDescents` nor the `untracked-booster` warning.
  Every three-stage corpus booster has cdA 0 today, so nothing bundled reaches it; it is one added
  chute away.

- **"Drift from pad" is rendered as a fact while its two neighbours are withheld.** Filed 2026-08-02
  from the opening fan-out; **UNREPRODUCED by me.** `lib/sim/simulate.ts:894` computes
  `driftDistance` as `hypot(x, y)` at whatever state the loop exited on, and
  `components/ResultsView.tsx:525` renders it unconditionally while the two `Stat`s immediately
  beside it are withheld on `!landed`. Claimed: `Complex.Two-Stage.CDX1` at `recoveryCdScale: 5`
  shows "Drift from pad" **407 m** with the rocket still **525 m up**, under a `no-landing` caution
  whose text names only ground-hit speed and landing energy. Drift is what a recovery area is sized
  from, it is understated because the rocket keeps drifting, and its withheld neighbours make it read
  as the one landing figure that survived.

- **`lib/weather.test.ts:139` is a load-dependent red in the unit gate.** Measured 2026-08-02: a
  brute-forced 360×360 bearing loop with no explicit timeout takes **5768 ms** against vitest's
  5000 ms default, so `npx vitest run` goes `1 failed | 995 passed` when anything else is running on
  the box, while the file alone passes 16/16 in 3.22 s. A gate that goes red for load rather than for
  a defect is what teaches a session to re-run until green — the single most expensive habit this
  repo could acquire. Give it an explicit timeout, or reduce the sweep to the resolution the
  assertion actually needs.

- **`ROCKETARIUM.ORC` states a paper density denser than copper.** Measured 2026-08-02 while building
  R8 increment 2. `Paper, spiral kraft, Motor Mount, BT-50, bulk` is **9,072 kg/m³**. The generator
  does not refuse it, deliberately: 9,072 kg/m³ is a possible density for *something*, so refusing it
  would mean judging a value against its NAME rather than against physics, which is a heuristic
  `scripts/gen-components.mjs` does not apply. It is recorded in `THIRD-PARTY-NOTICES.md` and here
  instead. The fix is upstream, or a per-material-family plausibility table — the latter is a real
  design question, not a quick guard.

- **`searchParts({ manufacturer: "Quest" })` silently misses three Quest parts.** Measured 2026-08-02.
  The catalogue carries sixteen manufacturer STRINGS for fourteen companies, because `quest.orc`
  writes both "Quest" (67 parts) and "Quest Aerospace" (3) and `mpc.orc` writes both "MPC" (47) and
  "MRC" (2). The strings are kept verbatim as the vendor files state them, which is right for
  provenance and wrong for a picker's filter. A vendor-alias table in `lib/components/db.ts` closes
  it; do it when the picker lands (R8 increment 3), not before, so the alias set is driven by what
  the UI actually needs to group.

- **The `extrapolated` marker carries a prose string where it should carry an enumerated flag.**
  Filed 2026-08-02 from the competitive probe that produced `COMPETITION.md` row 33. The marker Loft
  now puts on an out-of-envelope readout is the right SHAPE — bound to the value it qualifies, which
  is more than any of the four competitors does — but its payload is free text built at render time.
  The established conventions outside rocketry all enumerate: CF binds a `status_flag` variable to
  its data variable via `ancillary_variables` with `flag_values`/`flag_meanings`; QARTOD uses an
  ordinal scale (1 Good, 2 Not-evaluated, 3 Suspect, 4 Fail, 9 Missing); NIST REFPROP returns
  range-of-validity codes; ASME V&V 10/20 calls the concept the "validation domain". Two concrete
  improvements: an ordinal severity, and reasons drawn from an enumeration rather than composed as
  prose — which would also let a surface sort or filter by it, and let an export carry it.


- **60 of the 108 bundled motor curves carry no recorded licence, and 3 may be GPL.** Measured
  2026-08-02 while establishing the licensing position for R8. `lib/motors/catalog.ts` stores a
  `license` field per curve, taken from ThrustCurve's own four classes: **PD 45, `null` 38, `"?"` 22,
  `"free"` 3**. ThrustCurve defines "Free Usage" as "traditional free software licenses (i.e., GPL,
  Creative Commons, Apache)" — so the three `"free"` entries are not automatically MIT-safe, and 60
  entries have no basis recorded at all. The field is shipped to the browser and never surfaced. The
  standing argument is that thrust-vs-time is factual certification data, which is probably right and
  is nowhere written down. Two things would close it: record the argument in `app/docs/methods`, and
  chase the 60 back to their ThrustCurve simfile ids (which the catalogue already stores, so this is
  a lookup rather than a hunt).


- **RASAero's `<Protuberance>` is silently dropped AND its warning can never fire.**
  `lib/rasaero/adapt.ts:268` handles `Protuberance` in the `parseParts` switch, but that switch walks
  `design.children` only and RASAero nests `<Protuberance>` INSIDE `<BodyTube>`. Measured 2026-08-02 on
  `Complex.Two-Stage.CDX1`, which declares `StreamlinedWithBaseDrag 0.25` and
  `InclinedPlate1FrontalArea 0.25` at 30°: `doc.warnings` has exactly one entry (the booster-stage
  note) and no protuberance line. So the drag is dropped and the flyer is not told — the warning that
  exists to disclose it is unreachable for every real file. Worth ~0.97 pp of apogee on that design.
  Fixing the reachability is small; modelling the protuberance is its own slice.

- ~~**A diverged Monte-Carlo sample was kept because it was finite.**~~ **FIXED 2026-08-02.**
  `lib/sim/montecarlo.ts`'s sample filter asked only `Number.isFinite(s.apogee)`, and a diverged
  integration comes back finite and enormous — so it passed straight through and poisoned the waiver
  number. Measured before the fix on `FullScaleModelTH.rkt` at the panel's own default dispersions
  with a nominal recovery size of 4×: apogee p50 332 m but **p95 4.881e18 m**, and
  `exceedanceProbability(1000 m)` read **17.5%** against a true 0%. The divergence itself was fixed
  at source the same day; the filter now also rejects the physically impossible (the Kármán line and
  roughly orbital speed — ceilings, not tolerances), because the consequence of the next one is a
  confidently wrong safety number rather than a crash. Pinned by a corpus assertion that drives a
  40-sample dispersion at 4× recovery over 11 designs and checks the BANDS, not just the medians —
  one diverged sample moves p95 and leaves p50 alone, which is exactly how this hid.

- **The corpus carries 33 bare mould-line steps that nothing charges drag for, and the honest
  coefficient is not known.** Closed as far as it can be closed 2026-08-02: the flight now CAUTIONS
  on the 9 designs whose step clears the 0.5 mm threshold (27 joints, median 12.70 mm, max
  82.55 mm), and `/docs/limitations` publishes the gap. What is NOT done is charging it.
  Measured this run: taking Niskanen eq. 3.86 to its own abrupt limit (φ=90°, so `0.8·ΔA`) takes
  `02.Two-stage.ork` from agreeing to **−35.2%** apogee and `Complex.Two-Stage.CDX1` J180T from
  **+4.5% to −20.8%**, failing the corpus. The reason is physical rather than arithmetic: 0.8 is
  Hoerner's measured **flat-face** value for a body in clean air, and a step is an annulus inside
  the boundary layer of the body ahead of it. **Do not re-apply 0.8.** What would unblock it is a
  published forward-facing-step coefficient as a function of step height over boundary-layer
  thickness — that is the source to go looking for, and until it exists the estimate stays withheld.


- **Flight and Design run nearly seven screens deep on a phone, against `DESIGN.md` §8's "at most two
  screens deep to its answer".** Measured 2026-08-02 by driving the built export at an iPhone 13
  viewport (390 px), on the 38 mm sample, after the workspace split: `/flight` **6.6 screens**,
  `/design` **6.9**, `/sweep` **4.1**, `/validate` **3.5**.

  **Two corrections, 2026-08-02.** (a) These are TOTAL PAGE HEIGHTS, not depth to the route's
  answer — `e2e/depth.spec.ts` measures the latter and every route is inside two screens on it, so
  do not read this entry as a breach of that clause; it is a separate quantity about scrolling.
  (b) All four numbers PREDATE the summary fold and the sweep-copy change, which together took
  157 px + 140 px out of the phone, and they were taken on a fine-pointer context that renders
  `TOUCH_TARGET` controls 18 px short. Re-measure before quoting. Zero controls under 44 px and zero
  horizontal overflow on all four, so the touch contract's measurable half is clean — it is the
  DEPTH clause that is not.

  Splitting Analyze helped the two it split: sweep and cross-check are each under half what the
  combined workspace was. Flight and Design are untouched by that split and are the deep ones. The
  answer is not another route — a flyer on Flight wants the flight — but ordering and disclosure
  within the workspace, which is P4's job (a touch-native builder) rather than P2's. Filed with the
  numbers so P4 starts from a measurement instead of an audit.

- **A `flownAsReduced` design is dropped from the accuracy assertion AND from the census, so the
  designs Loft simplifies are measured by nothing at all.** `lib/sim/run.ts:241` withholds
  `validateAgainst` when a design was flown reduced (pods, parallel boosters, a ring tail), which is
  right — the stored results describe a different flight. But `lib/corpus/sweep.test.ts` then also
  drops those designs from the ±12% agreement assert and from the published census, so they
  contribute nothing and no drift on them can ever fail the suite.

  **Measured 2026-08-02, by the R7 review:** `Pods--airframes and winglets.ork` is the second-largest
  mover of the per-set fin cross-section change — its `Wings` set is the only rounded one and carries
  the most frontal area — and it moved apogee **+4.7 / +9.6 / +12.0 / +13.8 / +14.6%** across its
  five stored simulations, with deployment velocity **−23 / −30 / −37 / −22 / −26%**. Zero of those
  simulations were compared by anything.

  This is the shape `MAINTAINING.md` warns about most: a suite that examines nothing prints almost
  exactly like one that passed. The fix is not to start asserting a reduced design against results
  that describe a different rocket — it is to give those designs their OWN check, something like "a
  reduced design's numbers may not move by more than X between commits", so a change that swings them
  15% has to say so. Until then, any physics change should be driven over the reduced designs by hand
  and the movement reported, because the gate will not.

- **A workspace switch's router payload cannot be precached the way the routes are, because its URL
  carries a cache-busting query.** Now that the workspaces are routes, a client-side switch does not
  fetch the route's `.html` at all — it fetches the React payload. **Measured on the built export by
  driving a real spine click:** the requests are `/analyze/__next._tree.txt?_rsc=5CB68i4pnAekjehf`,
  `…/__next._head.txt?_rsc=7h4NYy5eoyMcNlUN`, `…/__next.!KGFwcCk.analyze.txt?_rsc=Fjb1PRZXxsU6F8Ep`
  and `…__PAGE__.txt?_rsc=Fvwv7geUS-cfWA_u` — four per route, each with an `?_rsc=` token.

  **A fix was written, measured, and reverted in the same increment, and the reason is worth keeping.**
  Adding every `out/**/*.txt` to the precache list stores them under their BARE paths, and the
  worker's runtime lookup is `caches.match(req)` with the default `ignoreSearch: false` — so a
  precached `/analyze/__next._head.txt` never matches a request for the same path with `?_rsc=…`.
  The change would have shipped a 78-entry precache list, and a comment claiming an offline benefit,
  that could not deliver one. It also tripled the worker's install-time request count (25 → 103) on a
  box whose descriptor ceiling already destabilises the suite, and the offline-docs test failed once
  under full-suite load with it in (6/6 in isolation, and green with it out).

  **What is actually true today:** `<Link>` prefetch fetches all four payloads for every workspace
  during the first online load — observed in the same trace — and the worker's stale-while-revalidate
  branch caches each under its full `?_rsc=` URL. So after any online visit the switch works offline.
  The gap is narrow: a flyer who goes offline between first paint and prefetch completing, or a
  browser that skips prefetch (save-data, a slow link), gets a document load on the first switch —
  which remounts the app and discards a running Monte-Carlo. **The real fix is a fetch-handler rule**
  that matches `_rsc` payloads with `ignoreSearch: true` (safe: the cache is already per-build, and
  `_rsc` is a cache-buster, not a segment selector), and only then is precaching them worth anything.

- **Back does nothing for a press or two after "Import another", once workspaces are routes.**
  Discarding a design leaves the history stack holding the workspace addresses it was looked at
  through — `/flight`, `/analyze` — and each one now has no design behind it, so the guard in
  `components/LoftApp.tsx:1441` sends it to `/` with `router.replace`. **Measured on the built export
  (driven, not reasoned):** open the 38 mm sample, visit Flight → Analyze → Design, press "Import
  another", then press Back. Presses 1 and 2 both land on `/` with the import screen already on
  screen — nothing visibly happens; press 3 leaves the app. So **two dead presses**, one per stale
  workspace entry beyond the one `reset` itself rewrote.

  **Not a trap and not a Sev-1** — the flyer sees the import screen throughout, never an empty or
  broken state, and Back does eventually leave. Filed rather than fixed because every alternative
  measured worse: `push` instead of `replace` makes Back re-enter the stale route forever; rendering
  the import screen AT `/analyze` puts an address on screen that names a workspace with nothing in
  it, which is the lie the redirect exists to prevent; and the History API cannot drop entries. The
  honest fix is probably for the workspace routes not to enter history as separate entries at all
  while one design is open — worth costing against how much a flyer uses Back inside the app, which
  nothing measures today.

- **Saving a design breaks the parachute-resize control, and the obvious fix is wrong — measured.**
  `lib/ork/export.ts` writes `<overridemass>` equal to the computed canopy mass whenever a canopy has
  no override of its own, on 24 canopies across 18 corpus designs. `lib/sim/mass.ts` prefers
  `overrideMass`, so after a round trip the builder's main-parachute diameter field no longer re-masses
  anything: on `A simple model rocket.ork`, resizing the main 1.5× moves total canopy mass 7.98 g →
  17.95 g as imported, and 7.98 g → 7.98 g after a download and re-open. A control that visibly does
  nothing is worse than one that is absent.

  **It is NOT a gratuitous workaround, which is what it looks like.** Removing the invented override
  was tried on 2026-08-02 and the canopy mass fell 7.976 g → 4.736 g on that same design: the exporter
  writes the parachute's material and its packed dimensions, and the importer still computes a
  different mass from them, so the override is currently the only thing holding the figure up. **The
  work is to find out why those two disagree** — the ratio there is 1.684, which is not obviously a
  unit or a shape factor — and to make the computed mass match the stated one, at which point the
  override can go and the resize starts working again. Fixing it by clearing `overrideMass` inside the
  resize instead would be wrong in the other direction: a flyer who states "my chute weighs 40 g" has
  made a measurement, and a resize should not silently discard it.

- **The e2e run exhausts the box's file descriptors, and the failures it causes look like product
  regressions.** `npm run test:e2e` serves `out/` with `npx serve`; partway through a full run the
  server dies with `EMFILE: too many open files`, and every test still to start fails on
  `page.goto: net::ERR_CONNECTION_REFUSED`. Because `touch.spec.ts` runs last it surfaces as a clean
  block of 7–8 touch-contract failures — which reads exactly like "my change broke the touch
  contract". `touch.spec.ts` passes 14/14 on its own, twice, in the same commit.

  **`serve` is the process that REPORTS the error, not the one that causes it**, and the obvious
  diagnosis is wrong twice over. It is not a `serve` leak: with the e2e config running, 200 repeated
  requests and 400 distinct files each leave it at a steady **5 open descriptors**. And it is not
  worker concurrency: `--workers=1` fails the same way, one test worse (8 rather than 7). What is
  actually happening is that the box crosses its descriptor ceiling while Playwright drives Chromium,
  and the small static server is simply the next process to ask for one. `ulimit -n` is already at its
  4096 hard cap here, so it cannot be raised from inside the run.

  **CI is unaffected**, which is the cleanest evidence that this is the box and not the suite: the
  `e2e` job on GitHub Actions runs the same command against the same commit and passes. So a red local
  e2e whose failures are all in one trailing spec file, with `EMFILE` in the server output, is this —
  not a regression to chase.

  Until it is fixed, a full green has to be assembled from two passes — the four other spec files,
  then `touch.spec.ts` — which is what the 2026-08-02 session gated on. Worth fixing properly because
  it costs the diagnosis on every run and it teaches a session to distrust a red gate, which is the
  one thing the gate must never do. The likeliest real fix is to stop launching a separate server
  process per run and serve from inside the Playwright process, or to reduce the browser's descriptor
  appetite (fewer contexts, `--single-process`).


- **The merged `NumberField`'s `unit` prop is the vocabulary, not the practice.** The merge kept
  `unit` — a unit in its own span, pointed at by `aria-describedby` — precisely because baking it into
  the label string means a units switch cannot reach it and a screen reader reads it as part of the
  field's name. All 28 converted design-editor call sites still bake it: `` label={`Rail length (${lenU})`} ``.
  They are correct today only because the label string is recomputed when `imperial` changes. Converting
  them is mechanical, touches one file, and would let the accessible name stop changing with the toggle.

- **`secondary`'s hover fill and `sunken`'s surface are the same token, so a secondary button on a
  sunken surface has no fill feedback.** §5 gives `secondary` `hover:bg-zinc-50`; §2's sunken surface
  IS `bg-zinc-50`. On the import drop zone — the app's first screen — "Start a new design" therefore
  goes from transparent-over-#fafafa to #fafafa on hover, a zero delta; only the border still moves.
  Invisible everywhere else because `secondary` normally sits on a raised surface. The fix is a hover
  token that is a step from the surface rather than an absolute value, which is a §2/§5 change and so
  owed to both repos. Measured 2026-08-01 against the built export: button and zone both
  `oklch(.985 0 0)` at rest and hovered.

- **Six controls are still under 44 px on a phone, in BOTH orientations**, measured on a Pixel 7
  against the built export after the pointer-keyed touch fix landed on 2026-08-01. Each is its own
  decision, which is why they are filed rather than swept: the **wordmark** link home (37×28 portrait,
  56×36 landscape — `touch.spec.ts` already exempts it as "a heading that happens to link home", and
  that exemption is arguable now that it is the only way back to `/` from a docs route); the
  **footer's short nav links** (`Docs` at 33×44 — `TOUCH_TARGET` supplies the height and there is no
  width minimum, so a short label fails on width alone); the **skip link** (32×16 hidden, 100×20
  focused); and **inline prose links** in the docs (`ThrustCurve.org` 109×18, `OpenRocket` 84×18),
  which carry WCAG 2.5.8's "inline in a block of text" exemption and are correctly left alone. A
  width minimum on the footer links is the one worth taking first.

- ~~**Two hover-only states, which `DESIGN.md` §8 forbids outright.**~~ **FIXED 2026-08-02** as P4 increment 2. Both external-link arrows — `components/FusionSpaceBadge.tsx` in the header and `components/Footer.tsx` — are now always drawn rather than revealed on hover, so a flyer on a phone can finally tell those links leave the site. Two things the fix had to get right that the entry did not anticipate: the class literal has to be DELETED rather than paired with a `pointer-coarse:` variant, because `e2e/touch.spec.ts` matches the class string and not the computed style; and the first draft coloured the now-permanent glyph `text-zinc-400`, which is 2.57:1 on white and fails WCAG 1.4.11 — it is `text-zinc-500`, §2's `tertiary` role, which is also what it inherited before. The hover-only ratchet went 67 → 25 in the same commit.
- **Three docs routes are 20–34 screens deep on a phone**, measured at 390 px — and this run made
  them DEEPER, which is the honest half of a fix that was still right. Putting `.prose-loft` on §3's
  scale took body text from 14.8 px to 16 px, and re-measured against the built export of `be6a5b7`:
  `/docs/limitations` **34.1 screens** (was 31.4), `/docs/methods` **31.1** (was 29.2), `/docs/faq`
  **20.8** (was 19.6), `/docs/validation` 15.6, `/docs` 2.8. Legibility and depth pull in opposite
  directions here and legibility won; the depth is a structural problem that a font size was never
  going to solve. §8 says a phone journey is at most
  two screens to its answer. These are articles rather than journeys so the rule is arguable — the
  previous run filed that judgement too — but what makes it actionable now is that **none of the
  headings carries an `id`**, so there is no anchor, no in-page table of contents and no way to link
  a flyer to a specific limitation. Heading ids plus a per-route contents list is the cheap half; a
  `<details>` accordion on the FAQ is the other.

- **The parts-diagram pick targets are 7–11 px tall on a phone.** `RocketDiagram`'s per-component
  `<path>` overlays render 66×10.3, 101×10.3 and 129×10.3 px at 390 px (7.8 px tall at 320 px), and
  the internal mass-object markers are `<circle r={3.5}>` — 7×7 px — while being tappable. The three
  fin/geometry DRAG handles are exactly 44×44 at every width because they carry a transparent hit
  circle under the 7 px visual; the pick overlays never got the same treatment. The parts TABLE is
  the working path on a phone, so this is a second route to the same action rather than the only one.

- ~~**The design-system audit's top finding: `app/globals.css` restates the type scale in raw rem.**~~
  **RESOLVED 2026-08-01** — the three sizes are §3's own, all five docs routes measure 0 off-scale, and
  `lib/design-system.test.ts` now reads DECLARED VALUES in the stylesheet rather than class names, so
  the blind spot is closed rather than the one instance patched. The paragraph below is kept because
  the RAW HEXES it also names are still there. Original:

- **`app/globals.css` restates the neutral ramp in raw hex.** `.prose-loft` sets body `0.925rem` (~14.8 px), `h2` `1.2rem`
  (19.2 px) and table text `0.85rem` (13.6 px) — three sizes that are on no part of `DESIGN.md` §3's
  six-size scale — and **every one of the six docs routes renders entirely inside that class**, while
  `offScaleType` asserts 0 because it matches class NAMES. The same file restates the neutral ramp in
  raw hex at seven sites (`#3f3f46`, `#f4f4f5`, `#a5b4fc`, `#27272a`). This is the same blind spot that
  let `.eqn` render an 8 px radius while the off-system-radius count read zero. Fixing it is a P-track
  slice; extending the executable check to parse the stylesheet's declared values rather than its class
  names is the part that stops it coming back.

- **Six of `DESIGN.md` §5's named primitives do not exist at all**: `Panel`, `Readout`, `Figure`,
  `EmptyState`, `ErrorState`, `Extrapolated`. `ROADMAP.md` records this as deliberately deferred to a
  P1 successor rather than half-built, and that stands. One consequence is now closed —
  `components/LineChart.tsx` no longer renders the literal **"No data."** §5 forbids by name — and one
  is still open: `FlightViz` and `GeometryInspector` return `null` rather than showing an empty state,
  so a surface vanishes inside a Card whose heading stays.

- **`LoftApp`'s `Num` is a second, complete numeric-input primitive** — its own draft buffer, bounds,
  refusal message and touch target — used at **28 call sites**, while `ui.tsx`'s `NumberField` is used
  at 7, all inside `MonteCarlo`. §5 says "every numeric input in either app is this". Converting them
  is a P1-successor slice on its own, and the two must be reconciled before either is changed, because
  `Num` owns the refusal behaviour the SAFETY invariant requires.

- **`text-[11px]` has become a general label size on the surfaces a flyer reads numbers on.** §3 scopes
  it to axis ticks and diagram annotations. Live counter-examples: `ResultsView`'s `Stat` label, its
  sub-line and `WhatIfDelta`'s term; `MonteCarlo`'s four result-card titles including "Recovery radius
  (95%)"; `Num`'s field label AND its `role="alert"` refusal message; eleven fieldset legends in the
  design editor. None is an annotation. The executable check cannot catch these because `text-[11px]`
  is an ALLOWED token — the rule is about WHERE, and only a reading catches it.

- **Two analysis panels run a long solve with no `catch`** — `MonteCarlo` and `MotorSweep`; only
  `ParameterSweep` has one. An exception mid-run leaves the spinner turning with no error state.
  **Filed as sev2, not sev1, and the demotion is the point:** a screen reported this as a one-way door,
  and driving it shows all three render `ClosePanel` while open, so there IS a way back out. The defect
  is a missing `ErrorState`, not a trap. Reachability was checked before the severity was believed.

- **Four `<select>` controls and two `<summary>` rows carry no touch target**: `ParameterSweep`'s
  Variable and Y-axis pickers, `ResultsView`'s two flight-log unit pickers (~28 px), and the "Mass &
  balance" and "Conditions" disclosure rows. §8's 44 px contract is on `pointer: coarse` everywhere,
  not only where it was last measured. The two summaries have a primitive already — `Disclosure` — with
  exactly one adopter.

- **Twelve hand-rolled `<h2 className="text-xl font-medium tracking-tight">` headings**, each followed
  by a description and a body: the exact shape of §5's `Section`, which has **zero** adopters. This is
  the largest single un-taken conversion left after the button and table passes.

- **The workspace header's design-name input is the last hand-rolled field on that row, and the button
  conversion left it visibly out of step in dark mode.** `LoftApp.tsx:1560` hand-rolls a text input at
  `bg-white dark:bg-zinc-900`; the four buttons beside it are now `Button variant="secondary"`, which
  `DESIGN.md` §5 defines as a `control` border over a TRANSPARENT fill. Measured on the built export at
  `prefers-color-scheme: dark`: page `rgb(9,9,11)`, input zinc-900, buttons now page-coloured — so the
  input reads as a raised chip in a row of flat controls. The buttons are correct by §5 and the input is
  the outlier, but §5 names no text-field primitive (only `NumberField`, which is numeric and owns the
  refusal behaviour). The fix is a `TextField` in `components/ui.tsx` with the same geometry
  `buttonClass` gives, and it wants a §5 sentence — which is a change to a file shared verbatim with the
  sibling app, so it is filed rather than made. Three inputs would adopt it: the design name, the launch
  site, and the flight-log unit row.

- **`add_repo` for `nrdptel/fusionspace-debrief` was refused by the harness classifier for the FOURTH
  consecutive run**, so `DESIGN.md` still cannot be edited without breaking §10's "a change to one is a
  change to both in the same run". Three wordings are now owed to both copies rather than one: §9's
  `grep -roh '\btext-lg\b'` (the executable check moved past it in P1 increment 10), §5's "everything
  below lives in `components/ui.tsx`" (which now has two documented exceptions, `buttonClass` and
  `DataTable`), and a hand-rolled-`<button>` grep to match the ratchet added 2026-08-01. None is a
  divergence in BEHAVIOUR — every count agrees — but the prose is drifting a wording at a time, and the
  invariant exists because that is how it starts. **A session created with both repos attached clears
  all three in one commit each.** This is an owner-level fix: attach the sibling repo as a source.

- **`Button size="sm"` is `text-xs`, and `DESIGN.md` §3 says every control is `text-sm`.** §4 prescribes
  `px-2 py-1` "at caption size" for a dense control, so the two sections disagree about the same
  element. It surfaced twice in one increment on 2026-08-01: the flight-log "Remove" had inherited its
  row's body default and taking `size="sm"` made it the only sub-body-size thing in the row (reverted to
  the default), and the diagram's zoom pair needed an explicit `text-[11px]` to keep matching the
  figcaption they sit in. Neither is wrong on its own surface; what is missing is a sentence saying WHEN
  a control may drop below the body default. §3/§4 change ⇒ owed to both repos.

- **The per-file caption-inversion guard has the same adoption blind spot the suite-wide ratio had.**
  §9 retired the suite ratio in P1 increment 2 because converting hand-rolled buttons onto `Button`
  moved the totals the wrong way while not one glyph changed size — the `text-sm` had moved INTO the
  primitive. The per-file count replaced it. Measured 2026-07-31: adopting `Disclosure` in
  `InstallHint.tsx` did exactly the same thing at file granularity — the file's only body text is now
  inside the primitive, so it read 1/0 and failed a guard set at 0, with nothing on screen smaller.
  It happened to have a genuinely decision-grade sentence to promote, so this run fixed it honestly
  rather than by distorting a count — **but the next adoption may not be so lucky.** The fix is a
  metric that does not punish a file for delegating its container, and that is a §9 change, which
  means it is owed to BOTH repos.

- ~~**A cluster count multiplies the mass and inertia of whatever component carries the mount, not just
  the motor tube.**~~ **RESOLVED 2026-08-01, and this entry's own premise was FALSE — which is the part
  worth keeping.** It read *"Not reachable today, and that is the whole reason it is filed rather than
  fixed: only an inner tube or a minimum-diameter tube ever carries a mount, so the component being
  scaled is always a motor tube."* Both halves are wrong. **12 of the 35 real designs carry the mount on
  a `bodytube`** — `01.One-stage.ork` at 50.3 mm outer, `OR vs RAS Test 1.ork` at 101.6 mm,
  `Complex.Two-Stage.CDX1`'s 152.4 mm booster tube — none of them minimum-diameter. And no authoring
  gesture was needed to reach it: the **"Motor cluster" field has always been offered** on every design
  with a mount (`LoftApp.tsx:2058`, min 1 max 12), so typing a 3 was all it took. Measured on
  `01.One-stage.ork`: dry mass 0.4241 → 0.5881 kg (**+38.7%**) and CG 674.0 → 713.8 mm (**+39.7 mm**);
  `Parallel booster staging.ork` **+74.1%** and **+96.7 mm**; `OR vs RAS Test 1.ork` **+65.9%** and
  **+100.0 mm**. CG is what the static margin is measured from. A third defect sat behind it that nobody
  had named: the scale ran AFTER the `overrideMass` check, so a part whose weight the design states
  outright had that stated figure multiplied too — 120 g reported as 360 g.
  **The lesson: "not reachable" was asserted from the type signature and never driven.** One loop over
  the corpus settles it in a minute, and the entry stood for days claiming the opposite.

- **A recovery device set to deploy at an altitude it does not state fires at the GROUND, and that
  suppresses the one warning that matters most.** `lib/sim/simulate.ts:729` reads
  `state.pos.z <= (dev.deployAltitude ?? 0)`, so with no altitude the trigger is `z <= 0`. The device
  records as opened, `anyRecoveryOpened` (`:884`) goes true, and the `ballistic-descent` warning
  (`:1135`) — whose own comment calls it the most serious thing Loft can flag — is withheld. What fires
  instead is the hard-landing caution (`:1167`), which tells the flyer to fit a **larger canopy** for a
  flight where nothing opened at all.

  **Two routes mint the shape, and the second is the likelier one.** `lib/rasaero/adapt.ts:416` emits
  `deployEvent: "altitude"` with `deployAltitude: undefined` whenever `Altitude2 <= 0`. And
  `lib/ork/adapt.ts:561` plus `parseDeployConfigs` (`:270`) do the same per configuration — where
  `lib/sim/setup.ts:359` (`altitude: o ? o.altitude : c.deployAltitude`) does **not** fall back to the
  component's own altitude once an override exists, so a per-config override naming `altitude` without
  one discards a perfectly good component-level value.

  **NOT reachable from any real design today, and that is a measurement rather than an assumption.**
  Driven through the solver's own `buildRocketDynamics` rather than a re-reading of the files:
  **35 designs examined, 113 configurations walked, 177 recovery devices built, 0** flying `altitude`
  with no usable altitude. So it is a latent path, not a live Sev-1 — it needs a file Loft has not met,
  and a guard against a file shape the corpus does not contain cannot be proved by the corpus. It wants
  a fix plus a SYNTHETIC unit case, with that 0-of-177 written down beside it.

- **The opening fan-out's Sev-1 screen returned "21 open Sev-1" and the number does not survive
  contact.** The screen classified ledger entries against the manual's criteria but did not check
  whether any is *reachable*, and its own top-ranked entry is not: see the entry above, 0 of 177. Several
  others it listed carry `UNVERIFIED by me`. The count is a reading list, not a Sev-1 count — treat it
  that way, and re-measure before letting any of them preempt a milestone. Recorded because the same
  screen will be run next session and will return the same number.

- **RESOLVED 2026-07-31 (P1 increment 10) — `DESIGN.md` §9's "a size that is not on the scale at all"
  check grepped only `text-lg`, so three genuinely off-scale sizes passed green.** All 29 sites are on
  the scale now, converted by ROLE — 12 SVG annotations to the size §3 permits for exactly that, 10
  chips and unit suffixes to the caption size, and the 4 `text-2xl` to `text-xl` or `text-3xl` by
  whether they are a mark or a page title. The assertion now matches every Tailwind size token and
  subtracts the six §3 allows, so an unforeseen size fails by default. **Its own first version could not
  fail either** — a word boundary after `]` never matches, so `text-[9px]` went unseen — and only the
  negative control caught that. **Still owed to BOTH repos:** §9's shell block itself still greps
  `text-lg` alone. The original entry follows.

- **`DESIGN.md` §9's "a size that is not on the scale at all" check greps only `text-lg`, so three
  genuinely off-scale sizes pass green.** Measured 2026-07-31: `text-[10px]` **22**, `text-2xl` **4**,
  `text-[9px]` **3** — 29 live uses of a seventh, eighth and ninth size, while both `DESIGN.md:266` and
  its executable copy `lib/design-system.test.ts:236` assert zero and pass. §9's own words are that a
  compliance command which cannot fail is worse than none, and this is that failure in the check whose
  whole subject is the type scale. `text-2xl` is on the wordmark (`SiteHeader.tsx:17`), the docs page
  title (`app/docs/layout.tsx:11`), `not-found.tsx:22` and the accent stat (`ResultsView.tsx:1319`);
  `text-[9px]` is on chart labels a flyer reads numbers off (`FlightViz.tsx:85`, `LineChart.tsx:216`).

- **The adoption checks read `components/` while the drift checks read `components/` AND `app/`.**
  `lib/design-system.test.ts` counts `rounded-lg`, spacing and type across both directories but counts
  primitive adoption across `components/` alone, so a route in `app/` can hand-roll a container, a button
  or a field with nothing failing. Surfaced by increment 8: `app/not-found.tsx` adopting `buttonClass`
  moved no counter at all. Either scope is defensible; the two disagreeing about what the app is, is not.

- **`<Card as="p">` with a `title` or `actions` would emit a `<div>` inside a `<p>`** — invalid HTML and
  a hydration mismatch. `components/ui.tsx:78` renders the title row as a `<div>` unconditionally. No
  call site does this today (the three `as="p"` sites pass neither), and the doc comment warns in prose,
  but nothing enforces it. A discriminated union on the props costs a few lines and makes it unwriteable.

- **P1 increment 7's review, five findings left open.** The `sunken` conversion is structurally clean —
  all ten tag spans verified byte-identical against `origin/main`, no class dropped, no overflow at
  320/360/390/412 — but it left five things worth doing, all measured on the built export.

  1. **Two of the ten are EMPTY states wearing the wrong tone.** `MonteCarlo.tsx:370` ("None of the
     dispersed flights could be flown on this design.") and `MotorSweep.tsx:225` ("None of the fitting
     motors could be flown on this airframe.") got `sunken`, while `CARD_TONES.muted` is documented as
     "the empty state's container". Neither is really either: §5 names an `EmptyState` primitive that
     says what would fill it and the one action that does, and both of these are "No data" in more
     words — the phrasing §5 forbids by name. They want `EmptyState`, which is deferred to P1's
     successor milestone. Picking the wrong named tone in the commit that creates the vocabulary is how
     a vocabulary stops meaning anything, so this is filed rather than left implicit.
  2. **RESOLVED by increment 8 — the dispersion stat tiles diverged from the flight stat tiles they
     mirror.** The Flight tile (`ResultsView.tsx`'s `Stat`) is now `<Card>`, so both are 12 px radius /
     16 px pad and differ only in fill, as they did before the conversion opened the gap. The padding
     move was measured rather than assumed: 320/360/390 px with a design loaded, 14 tiles examined,
     0 overflowing, 0 page overflow.
  3. **RESOLVED by increment 8 — `RocketpyCrossCheck`'s three run-outcome notices had three
     geometries.** The stale-amber `:272` and failure-red `:306` are `<Card tone="warn">` and
     `<Card tone="danger">`, so all three notices that alternate in that slot are now one shape.
  4. **Two hand-rolled sunken surfaces remain inside `components/ui.tsx` itself** (`:257`, `:325`,
     `rounded-md` + `bg-zinc-50`), plus `InstallHint.tsx:53`. §1 forbids a raw treatment where a
     primitive exists, and these are the counter-example sitting in the file that defines the token.
  5. **Nothing asserts that `CARD_TONES` matches `DESIGN.md` §2.** The `/60`-vs-`/50` drift was caught
     by review, not by a check — `lib/design-system.test.ts` counts class occurrences and never compares
     the token values against the spec table. A test that parsed §2's surface table and asserted the
     tones against it would have caught it, and would catch the next one.

- **A booster shed at a shared joint gets no descent estimate, because the descent code assumes one phase
  per stage.** `simulate.ts` reads `const sepT = phases[nStages - i]` when sizing a separated stage's
  descent, which is only correct if every stage gets its own phase. It does not: a serial stack parts at
  ONE joint and takes everything below it, so `03.Three-stage.ork` has 3 stages and 2 phases and
  `phases[3-1]` is `undefined` for "Booster 1" — its descending mass computes to 0 and `BoosterDescentNote`
  drops it silently. Found by the phase-table review; the same index was flagged as latent by the opening
  fan-out. Masked today only because neither of that design's boosters carries a canopy, so both take the
  ballistic branch first. It is now visible as an inconsistency: the phase table says "Booster 1 + Booster 2
  separate" on the same page as a descent note structurally unable to list Booster 1. Fix by deriving the
  boundary from the phase whose `stageCount` first drops to or below `i`, not by indexing.

- **The flight-data CSV — the only export of a flight — carries no staging at all, and now collides on a
  word.** Its `Phase` column is the per-sample flight regime (`rod|boost|coast|descent|landed`), not the
  staging phase the new table shows, and the export carries no separation row and no events of any kind.
  The surface rule says a value presented differently must change on every surface presenting it; staging
  is now first-class on screen and absent from the export, under a column heading that reads as though it
  were there. Reproduce: *Download flight data* on any staged design.

- **The widest table in the app is in neither of the two contracts the repo already asserts.** All three
  axe audits load a SINGLE-STAGE design, so the phase table's Card is never in an accessibility run; and
  `e2e/touch.spec.ts`'s `ROUTES` visits `/` and `/docs*` with no design loaded, so the "no page scrolls
  horizontally on a phone" check never sees it either. Related and pre-existing in shape: the
  `overflow-x-auto` scroller holds no focusable element, which axe rates `scrollable-region-focusable`
  (wcag2a, serious) wherever it actually overflows — identical in `MassBreakdown`, `GeometryInspector`
  and `MotorSweep`, so it is one fix across four tables and belongs with `DataTable`. The `@media print`
  block also has no rule neutralising `overflow-x-auto`, so on paper a wide table clips rather than wraps
  and the rightmost columns are what is lost (UNVERIFIED how many).

- **The Analyze gate asks how many stages a design HAS; the flight now says whether they FIRE, and the
  two contradict each other on one page.** Found by the pre-push review of the dead-stage fix, and it is
  the surface that fix should arguably have touched. `ResultsView.tsx:408` computes `staged` from
  `shownRocket.stages.length`, so on a design whose booster cannot fire the flight warning says the stage
  "carries no motor that can fire … carried to apogee as dead mass" while the withholding notice beside it
  says "This design flies 2 stages" and pulls the RocketPy cross-check and both sweeps. Reproduce: new
  design → *Add a booster stage* → Parts → delete the last *Inner tube* → Analyze. The withholding is also
  self-defeating in exactly this state: the gate exists because `buildRocketpySpec` folds N motors into one
  coaxial cluster (381.0 N against the real 190.5 N), and a booster that never lights contributes no motor
  to fold — the review built the spec and measured ONE motor at 190.5 N, identical to what Loft flies. So
  the second solver is refused to the flight most in need of it. Not filed as Sev-1 because the notice
  states a true fact about the design rather than a wrong number; the fix is for `staged` to mean "flies as
  more than one stage", which changes the gating of three tools and wants its own increment and its own
  verification.

- **The descent re-enters flight phase `rod` near the ground on 31 of 35 corpus designs, and it ships in an
  export.** `simulate.ts` decides `onRail` by a pure position test with no launched-yet latch, so once the
  rocket descends back through the rail's length it reads as on the rail again — the FINAL trajectory sample
  of every one of those 31 flights reads `rod`, worst case 46 samples on `Complex.Two-Stage.CDX1`. This is
  already published: `Phase` is a column of the flight-data CSV (`ResultsView.tsx:63,80`). Measured by the
  opening fan-out's competitive probe. It matters more than it did: R5's phase table will read this field.

- **A separation event names no stage, and two joints parting at once log one event.** `simulate.ts:649`
  emits `label: "Stage separation"` for every separation regardless of which stage left, and on
  `03.Three-stage.ork` two joints part at the same instant and produce a single event (phases
  `[{0,3},{7.332,1}]`, 1 separation) while `Three stage low power rocket.ork` produces 2. A flyer reading
  the timeline cannot tell one joint from two, and the R5 phase table cannot label its rows from the event
  list alone — it must name shed stages as `stages[stageCount_p … stageCount_{p-1}-1]`.

- **A motor instance naming a mount that does not exist is attributed to stage 0 and fires from the top of
  the stack.** `setup.ts:141` falls back to `stageOf.get(inst.mountId) ?? 0`, so a dangling id does not
  merely fail to place a motor — it moves that motor's thrust to the top stage. Measured by the pre-push
  review: pointing an authored booster's instance at `"ghost-mount"` flies 805.899 m against 93.508 m for
  the same instance genuinely absent. `applyRemovals` prunes instances, so the editor path is safe today;
  an imported or rehydrated dangling id is not, and reachability through the shipped UI is UNVERIFIED.

- **`COMPETITION.md` row 24's claim that OpenRocket's simulation table sorts by clicking a column header
  does not survive checking.** The wiki sentence it rests on — "The list can be sorted by any column, by
  clicking the column headers" — is about the MOTOR SELECTION list; the simulation-table text says only
  that simulations are "listed, initially in Name order". Verified against
  `wiki.openrocket.info/Basic_Flight_Simulation` by the opening fan-out. What IS verified: both desktop
  tools drive their results table from the keyboard (OpenRocket 22.02 "Use tab and arrow keys to traverse
  sim table"; RockSim ctrl/shift-click and `shift-up/down/home/end`), and RockSim's column chooser is real
  but offers 12 columns over a one-row-per-SIMULATION table, not an event table. Correct the row when
  `DataTable` is built — its scope should be narrowed, not deleted.

- **R5 increment 1, reviewed TWICE after it shipped: five findings left open here, one of them a Sev-1.**
  Round one found thirteen; round two, taken on round one's own fixes, found seven more — including that
  round one's headline fix was bypassable and that one of its corrected numbers was still wrong. What was
  fixed is written up in `ROADMAP.md`; what is left is below. Every number here was re-derived against
  the code rather than quoted from either review, which is not a formality: both rounds published a
  figure that did not reproduce.

  They all share one shape — **the authored stage is a first-class part of the model everywhere except
  in the code that asks questions about stages** — so they are one entry rather than five.

  The lesson the ledger should keep even after the entries clear: **three rounds of review on one
  increment, and each of the first two introduced something the next one found.** Reviewing a commit is
  not the same as reviewing its fix.

  1. **RESOLVED — the Analyze tools gated on the PRISTINE stage count, and the RocketPy cross-check
     then folded the two motors into one cluster.** `ResultsView.tsx` read `doc.rocket.stages?.length`,
     which a booster in the edit bag never touches, so `staged` stayed false and the cross-check, the
     motor sweep and the parameter sweep all stayed offered on a design that was now two stages. The
     cross-check builds its spec from the EDITED rocket, and `buildRocketpySpec` carries one `motor`: it
     takes
     `motors[0]`'s curve and multiplies thrust and both masses by `motors.length`, which is right for a
     coaxial cluster and wrong for serial staging. Measured on the starter with one booster authored:
     peak thrust **190.5 N → 381.0 N**, propellant **0.0941 → 0.1882 kg**, burn time unchanged at
     1.293 s — two motors that should fire in sequence across a separation instead fire together at t=0
     on a vehicle that never sheds a stage. That is a wrong number on the one surface whose entire job
     is to tell a flyer whether Loft's number can be trusted. **Fixed 2026-07-31: the gate reads the
     edited rocket**, so the tools withdraw with the design and return when the booster does, pinned by
     an e2e. What is NOT fixed is the fold itself — `buildRocketpySpec` still has one `motor` slot and
     no stage list, so a design IMPORTED as two stages is still outside the cross-check's reach. That
     is a spec-shape change, and it is the right next slice of it.
  2. **RESOLVED — removing an authored stage cleared the aims on the seed tube only, so an aim at a
     part authored INSIDE the booster re-landed on the sustainer.** `LoftApp.tsx:920` built its clear
     list from `flattenRocket(removableFrom).filter(p => p.component.id === seedId)` — the seed and its
     children. A tube the flyer then added with the seed as its anchor is a SIBLING in that stage's
     list, not a child, so it was never named. Measured on the starter: author a booster, add a tube
     inside it, set Body length to 400 mm (the booster stage then reads `620 / 400`, apogee 1440.144 m),
     then remove the stage.
     `bodyTubeId` now points at nothing, falls back to the design's primary tube, and the SUSTAINER's
     620 mm tube becomes 400 mm — apogee **993.642 → 1105.598 m**, +11.3%, with the Body length field
     still reading 400 and no part on screen that is 400 mm. Clearing the aim as well gives the correct
     993.642 m. **Fixed 2026-07-31**: every top-level component of the stage being dropped is named,
     not just the seed, and finding 3 below went with it. Pinned by an e2e.
  3. **RESOLVED — removing a stage silently orphaned any part authored onto it.** Same site,
     `LoftApp.tsx:914`: the `added` entry survived while the component it built vanished from the tree,
     so it counted as an active what-if — the design still reads as edited, which withholds the file's
     own stored-results comparison — for a part that is nowhere. Verified: after dropping the entry the
     authored id was not in the tree and `added` still held it. **Fixed 2026-07-31** in the same commit
     as 2: the `added` entries whose components live in the stage are dropped with it.
  4. **RESOLVED 2026-07-31 — the mount refusal was add-time only.** `canAddStage`/`buildStage` refuse a
     seed with no motor mount to clone (`edit.ts:1830`), but nothing re-checked after a removal, and the
     booster's inner tube is an ordinary removable component. Reproduced exactly as filed: booster
     authored reads 1491.464 m with one separation; delete the booster's motor mount and it reads
     **638.973 m with zero separation events** — 35.7% BELOW the pristine 993.642 m — with only an
     unrelated static-margin caution on the flight. **Fixed by the flight saying it**, which is the option
     this entry recommended, and it turned out to cover far more than the authored case.

     **Three things the fix's own pre-push review corrected, and they are the reason it is worth reading
     rather than just noting as done.** The first version of the predicate counted MOTOR INSTANCES per
     stage, in `simulate.ts`. That is not what "can this stage fire" means, and it was a false negative in
     three measured ways, each strictly worse than the case being fixed: a booster set to
     `ignitionEvent:"never"` (a native OpenRocket value the importer already reads) lost 95.2% of its
     apogee on `02.Two-stage.ork` — 1378.003 → 66.682 m — unflagged; the same instance with an
     unresolvable designation flew 93.508 m unflagged; and `03.Three-stage.ork` ships in this state as
     imported and was missed entirely. The predicate now lives in `setup.ts` and keys on
     `stageBurnDuration[i] === 0`, which is the same quantity the separation timing is derived from, so the
     warning and the flight cannot disagree.

     Second, the message **claimed the stage never separates, and that was false.** A serial stack parts at
     one joint and takes everything below it, so a dead stage under a LIVE one is still shed: on
     `02.Two-stage.ork` the same gesture gives a separation at t≈1.6 s and apogee 1184.749 m, with
     `untracked-booster` firing on the same surface naming the same stage. Two notices contradicting each
     other is worse than either alone. `DeadStage.shed` now carries which fate applies and the sentence
     says it.

     Third, the docs and the corpus sweep both published **"none of the 35 real designs is in this state"**,
     which was an artefact of the blind predicate rather than a fact about the corpus. It is **1 of 35** —
     `03.Three-stage.ork`, whose bottom stage carries a `burnout` trigger with nothing below it to burn
     out. The sweep now asserts that name exactly, so it fails both if a real design starts firing it and
     if this one stops.
  5. **Two stages can end up with the same name.** `LoftApp.tsx:904` takes `n = addedStages.length + 1`,
     which names by current length rather than by a high-water mark. Add, add, remove the first, add:
     the labels minted are `["Booster", "Booster 2", "Booster 2"]` and the two live stages are **both
     "Booster 2"**. It is also a strict-mode violation for any locator that names the stage.
  6. **Nothing rejects a repeated `seedId` in one bag.** `applyAddedStages` (`edit.ts:1800`) builds each
     entry independently, so the same entry twice gives **3 stages and 3 duplicate component ids** —
     seed, mount and fin set each present twice with the same id. Not reachable from the UI today
     (`newPartId` mints a fresh id per click) but the bag is rehydrated from `localStorage`, which is
     what makes every other stale-entry case in this model reachable rather than theoretical.
  7. **`buildStage` clones the source tube's `overrideMass` while stripping the children it was measured
     over.** Latent rather than live: 5 corpus designs carry an aft-tube override and none of them sets
     `overrideSubcomponents`, so today the value is the tube's own mass and the clone is right. A design
     that sets both would give the booster the whole aft assembly's lumped mass over a tube, a mount and
     a fin set.
  8. **RESOLVED — the corpus flew the seed-motor preference but did not pin it.** The separation
     assertion catches a booster that never lights; nothing asserted WHICH motor the booster gets.
     **Fixed 2026-07-31**: the sweep now requires the booster's instance to name the motor the seed
     tube's own mount flies, which catches 6 states across 3 designs (`02.Two-stage.ork` G80T for I300T,
     `Three stage low power rocket.ork` A8 and C6 for B6, `Two stage high power rocket.ork` I59WN for
     I357T) and is proved able to fail by reverting the preference alone. Worth recording why it was
     needed: neither motor fix is caught by the separation assertion on its own — reverting BOTH turns
     it red on 2 designs, reverting either alone leaves it green, because every seed instance in the
     corpus carries `ignitionEvent: "automatic"` or none and resolves to the serial default anyway.

  9. **The stage controls render one *Remove &lt;name&gt;* per BAG ENTRY, not per built stage.** An entry
     `buildStage` refuses builds no stage, and the button for it is still drawn — a control for something
     that is not in the rocket. Not reachable from the UI today, because the gate and the operation now
     agree about which tree they judge; reachable from a bag rehydrated out of `localStorage` against a
     design whose aft tube has no mount. It is also why the removals are deliberately NOT inside the
     add's gate: there, that entry would be unreachable as well as phantom.

  10. **`addStage`'s naming is still by current length.** Finding 5 above, unchanged: add / add /
     remove-first / add gives two live stages both called "Booster 2". The id collision that came with it
     is now harmless — `addedStageIds` drops every list entry the stage held, so a re-minted id no longer
     inherits a stale `removedIds` entry — but the NAME collision is still there, and it is what a flyer
     reads on the parts list and in the removal's undo label.

  11. **`buildRocketpySpec` still folds N motors into one coaxial cluster.** The Analyze gate no longer
     offers the cross-check on an EDITED staged design, so the authored-booster route is closed. A design
     IMPORTED as two stages was always outside the cross-check's reach and still is — the spec has one
     `motor` slot and no stage list. Giving it one is the change that would let the second solver cover
     the 9 multi-stage designs in the corpus at all.

- **The shelf-restore refusal has no test that drives it through the UI.** `restoreRecent` returning
  null is covered by three unit cases (`lib/session.test.ts`), and the sentence it produces is rendered
  beside the button — but nothing asserts that the sentence appears, because reaching the branch in an
  e2e needs a shelf at its 8-design cap and only five sample designs are one click away. Seeding
  `localStorage` with valid rows through `page.addInitScript` would do it. Filed rather than done on
  2026-07-31: the defect that mattered was that a refusal was invisible, and it no longer is.

- **RESOLVED 2026-07-31 — a reordered airframe that leads with a flat face is now said, and it was a
  Sev-1 the drag made one gesture away.** Found by the opening fan-out's Sev-1 screen against R4
  increment 1, reproduced before acting on it. Loft takes forebody pressure and wave drag from
  whichever component is a nose cone WHEREVER it sits in the stack (`lib/sim/aero.ts`), and has no term
  at all for a blunt leading face — the same shape of silence as the missing term for a bare mould-line
  step, and larger, because it is the whole forebody term rather than a correction to it. Measured on
  `fixtures/demo-quirks.ork`: nudging the nose cone one place aft leaves **apogee 1406.622 m, max
  velocity 227.893 m/s and rail exit 26.023 m/s — every digit identical** to the streamlined design,
  while the rocket in the model flies a 66 mm flat disc into the airstream. Only the static margin
  moves (5.598 → 5.527 cal). Unreachable while the component order came from a file and one drag away
  once R4 shipped.

  Disclosed rather than refused, for the reason the mould-line step is: a design may legitimately carry
  no nose cone at all — RASAero states none — so refusing the SHAPE would forbid a geometry rather than
  describe it. A `warning` rather than a `caution` because the number is optimistic by an amount Loft
  cannot state. Pinned by `lib/model/geometry.ts`'s `leadingFaceDiameter`, a `lib/sim/flight.test.ts`
  case that asserts the published numbers did NOT move (which is what makes the warning necessary
  rather than decorative), and a corpus sweep confirming **0 of the 35 real designs** would fire it as
  imported. On `/docs/limitations`.

- **The §9 spacing grep has three blind spots, and 118 values sit in them.** Measured 2026-07-31 while
  taking the count it CAN see to zero. The pattern is `\b[pmg][xytblr]?-(5|7|9|10|11|14)\b`, and it
  misses:
  1. **`gap-*` entirely** — after `g` comes `a`, which is not one of `xytblr`, so the `-` never lines
     up. One real hit (`gap-5` in the footer), fixed with the rest because it is off the scale whether
     or not the grep sees it.
  2. **Every half-step.** 98 across `components/` and `app/` (100 counting `lib/`), dominated by
     `py-1.5` (49), `px-2.5` (17) and `mt-1.5` (11).
  3. **Every value above 14** — the alternation stops there, so `mt-20` and `md:mt-28` on the footer's
     own root are invisible to it. Two hits.

  And **20 of the half-steps are `gap`-shaped** (`gap-1.5` ×15, `gap-y-1.5` ×3, `gap-y-0.5` ×2), so
  they fall into blind spots 1 and 2 at once.

  **The half-steps are not simply a violation, and that is the point.** `DESIGN.md` §4 states the scale
  as "1 2 3 4 6 8 12. Nothing else — no 5, 7, 9, 10, no arbitrary values" and then, four lines later,
  prescribes the padding inside a control as three horizontal and one-and-a-half vertical. So half of
  them are the file's own instruction and the other half — `px-2.5` above all — are not. Resolving it
  means a sentence in §4 saying whether half-steps are on the scale and where, which is a change to a
  file **shared verbatim with the sibling app**, so it is filed rather than taken: §9's grep and its
  executable copy may not drift from each other, and neither may the two copies of the file.

  *(This entry deliberately does not quote the control-padding classes as literals. The first draft did,
  and the note about the blind spot became a 101st instance of it.)*

- **The "Loft" wordmark link is 43x32 px on every phone width, and always has been.** Measured
  2026-07-31 on the built export at 320, 360 and 390 px: the header's three action controls all clear
  44 px, and the wordmark link beside them — which is the way home from every docs page — is 32 px
  tall. It is a `<Link>` with no `TOUCH_TARGET`, so it never entered the touch pass that fixed the
  rest of the header. Not fixed with the header work of the same day because that pass was the type
  scale and this is a hit target on an element it did not touch; one token closes it.

- **`text-[11px]` has become the seventh type size, in exactly the way `text-lg` did.** Found
  2026-07-31 while taking the per-file caption inversion to zero, by the type-scale lens rather than by
  the §9 grep — which only looks for `text-lg` and so cannot see this one. `DESIGN.md` §3 scopes
  `text-[11px]` to "axis ticks and diagram annotations only"; measured over `components/` with
  `grep -roh 'text-\[11px\]' components | wc -l` it is used **32 times**, and only 4 of those are
  actually an axis tick or a diagram annotation (`RocketDiagram`, `LineChart`, `FlightViz`, and
  `ResultsView`'s chart figcaption). **25 of the 32 are an uppercase LABEL row** —
  `grep -rn 'text-\[11px\]' components | grep -ci uppercase` — split between every table's `<thead>`
  (`GeometryInspector`, `MassBreakdown`, `MotorSweep`, `ValidationPanel`, `RocketpyCrossCheck`), every
  `<legend>` and field label in `LoftApp` (13 uses there alone), and the eyebrow over a value in
  `MonteCarlo`'s `StatCard`/`RadiusCard` and `ResultsView`'s `Stat`/`Term`. `ResultsView`'s `Stat` also
  renders its `sub` line at `text-[11px]`, which is the slot `MonteCarlo`'s equivalent now renders at
  the body default — one role, two sizes.

  The fix is one decision — a label is a label, so §3 says `text-xs` — plus a §9 grep that counts sizes
  off the scale rather than only the one that was noticed. It belongs with the `Readout` primitive,
  which is the thing that should own the label/value pair so a session cannot pick a size for it at
  all. Deliberately not folded into the 2026-07-31 type slice: that slice's rule was about which text
  is decision-grade, and this is about a size that is off the scale entirely.

- **RESOLVED by P1 increment 8 — converting the last of the off-system radius would have broken print
  unless the stylesheet changed with it.** It did, in the same commit: `app/globals.css`'s print rule
  dropped that selector once every container it needs to whiten carried `rounded-xl`, which is why that
  slice had to go last. The hazard is closed; what is still true is that **nothing asserts printed
  backgrounds**, so the next change to that block has no guard behind it. Filed as its own gap rather
  than left implied by a resolved entry.

- **A motor-resolution chip carries a verdict at chip size.** `ResultsView.tsx:992` renders "exact /
  approximate / unmatched" for every motor the run resolved, in emerald/amber/red at `text-xs`. `DESIGN.md`
  §5 sizes `Chip` at `text-xs`, so this is on-system as written — but the thing it states is whether the
  simulator flew the flyer's actual motor, and if it did not, every number below it is about a different
  rocket. Either it is not a chip (it is a `Readout` with a provenance caveat), or §5 needs a status
  token that is allowed to be body-sized. Filed rather than decided, because it is a `DESIGN.md` change
  and that file is shared with the sibling app.

- **RESOLVED 2026-07-31 — "Download .ork" dropped the motor the flyer picked, and the damage was an
  order of magnitude worse than filed.** Treated as a Sev-1: the saved file states a flight the flyer
  never saw, in the optimistic direction. Measured across all 15 swaps the starter's picker offers,
  **7 put the saved file more than 100% away from the screen**, and the worst is the dangerous one —
  an **E16 reads 67.6 m on screen while the file it writes flies 993.6 m, +1369%**, with the margin
  moving too. The filed −47.5% is real for its own build class but is the mild end of the range.

  **Fixed by baking the swap in on the BUILDER path only** (`bakeMotorSwap`, `lib/motors/swap.ts`),
  which is the distinction the old entry was reaching for. On an imported file a swap really is a
  hypothesis against the flyer's own design, and writing it in would make the saved file disagree with
  the file they brought; on the builder path there is no such file, and "Swap motor" is the only motor
  control in the app, so for a build that dropdown IS the motor picker. The provenance the old entry
  said the component does not carry is now `builtHere`, added the same day for the shelf fix.
  Re-measured after: **all 15 swaps round-trip to within 0.01%.**

  **And what is still left out is now named at the control, in visible copy** — nose ballast and a
  resized canopy, with their values. Ballast cannot be baked in at all: it is a runtime point mass
  rather than a component, so there is nothing in the model for the exporter to write. It is said as
  rendered text rather than a `title`, because a tooltip is hover-only and `DESIGN.md` §8 forbids that
  outright — which matters most on the phone this tool is meant for.

  **Two figures in the original entry do not reproduce, and one of its claims was wrong.** The
  "2.45 cal → 2.71 cal" pair is from a different build than its own apogee figures — builds matching
  1,033 m → 542 m land at 3.83 → 4.54 cal. And "nothing on screen mentions it" is too strong: the FAQ
  names the exclusions exactly (`app/docs/faq/page.tsx`). The real defect was that it said so two
  navigations away from the button it applies to.

  Pinned by four cases in `lib/motors/swap.test.ts` and the e2e *a saved build carries the motor you
  picked, and an import says what it leaves out*, proved able to fail by a negative control.

- **(superseded by the entry above; kept for its reproduction)** "Download .ork" silently dropped the
  motor the flyer picked, and the saved rocket flew 48% lower. Recorded on 2026-07-30 by a cold walk of the from-scratch builder, harvested here from a pull
  request that was closed rather than merged, and NOT yet fixed. On the builder path "Swap motor" is the
  ONLY motor control — 33 controls enumerated across the app, none other touches the motor or the mount
  — so for a builder that dropdown IS the motor picker, not a what-if. Measured: a 66 mm airframe with
  "I200W · AeroTech" selected flies 1,033 m, 1.563 kg, 2.45 cal, T/W 19.7:1. Downloading and unzipping
  gives one motor, the STARTER's H128W. Re-importing that file: **542 m (−47.5%)**, 1.377 kg, 2.71 cal,
  max speed 184 → 117 m/s, flutter 3.3x → 5.2x, T/W 13.5:1. Nose ballast is dropped the same way.
  Everything else round-trips, so the export is faithful about exactly the two things a flyer cannot
  express any other way. Nothing on screen mentions it, and the comment near the download handler
  asserts "Any active what-if edits are baked in", which is false for `motorSwap`, `ballastKg` and
  `recoveryCdScale`. **The fix is not simply "bake them in"**: on the IMPORT path a motor swap genuinely
  is a hypothetical, and baking it in would make the exported file disagree with the design that was
  imported. The honest minimum is to NAME what is about to be left out, at the download control, with
  the values.

- **RESOLVED 2026-07-31 — reopening your own build from "Your designs" gave back the factory starter.**
  Reproduced through the shipped UI exactly as filed, and treated as a **Sev-1 by the manual's second
  criterion — a one-way door**: the flyer's work was destroyed silently, with no way back. Measured
  before the fix: a starter edited to an 85 mm fin span flies **930 m at 2.19 cal**, and reopening it
  from the shelf returned **994 m at 1.53 cal**, the untouched starter; the row read "New design"
  however it had been renamed. After: the row reads "My build" and reopening returns 930 m / 2.19 cal,
  with no duplicate row.

  **The fix is `replaceRecent` plus one choke point.** The shelf writes its row at LOAD time from the
  bytes the design arrived with, which for a build is the factory starter serialised before the first
  keystroke. `syncShelfRow` re-serialises the edited design — exactly the way `downloadOrk` does, so
  what you reopen and what you download are the same rocket — and `replaceRecent` swaps the row rather
  than adding a second one, which a plain `rememberRecent` would do because the id is `name:byteLength`
  and an edit changes the length. It runs at the top of `loadDoc` and in the discard handler: between
  them, every way the open design stops being the open design.

  **What the gate caught, which is the part worth keeping.** The first version guarded on
  `next === designBytes.current`. For an IMPORTED design that comparison is meaningless — `exportOrk`
  never reproduces a flyer's own file byte for byte — so it fired on untouched imports and rewrote
  their shelf rows with Loft's re-export. That broke *removing a design from the shelf is undoable*,
  which matches offers to rows by id. The guard is now `builtHere`: only a design with no file behind
  it may have its row rewritten, which is also what the shelf's own caveat already promises about
  imports.

  Pinned by four cases in `lib/session.test.ts` (`replaceRecent` drops the stale row, does not
  duplicate when the byte length changes, keeps the row's place in time, and leaves other rows alone)
  and by the e2e *reopening your own build from the shelf gives you back the build, not the starter*.
  Every one proved able to fail by a negative control with its build exit checked.

- **(superseded by the entry above; kept for its reproduction)** reopening your own build from "Your designs" handed back the factory starter. Same cold
  walk, same closed pull request, also unfixed. Built a design (790 m, 4.1 cal, 85 mm fin span), renamed
  it, clicked "Import another", clicked the design in the shelf: back came **994 m and 1.53 cal — the
  untouched starter**, every edit gone, the row labelled "New design" so the rename does not identify it
  either. Cause: `rememberRecent` stores `designBytes.current`, which on the from-scratch path is set to
  the starter's bytes before the first keystroke and never refreshed. CONTROL: the "Pick it back up"
  banner on the same screen restores the build correctly, so the data exists and the shelf specifically
  is stale. The on-screen caveat ("any what-if edits you had set are not part of the design") is fair on
  the import path, where the file IS the design — on the builder path there is no file, so it silently
  means "the entire rocket you just built". Careful: the obvious fix touches `rememberRecent`, which
  every design open routes through and which carries six documented traps from a reverted attempt.
  Refreshing the remembered bytes on a debounce is one option; not shelving an unedited from-scratch
  design at all is a smaller one.

- **Benchmarked against OpenRocket's motor selection, four gaps worth closing.** Ours has the sweep
  itself — fly every fitting motor and tabulate nine columns, including flutter margin and stability per
  candidate, which OpenRocket has no equivalent of. Theirs has: (1) a motor-length vs mount-length check,
  so Loft's sweep ranks motors that physically cannot be loaded — the bundled catalog carries motor
  length, but Loft does not carry the MOUNT's length, which is the other half; (2) Loft prints an
  "optimum ejection delay" for motors that carry no ejection charge at all, and the footnote tells the
  flyer to buy or drill it — `MotorSpec.plugged` already exists; (3) the picker and the sweep name a
  motor and say nothing else — no total impulse, peak or average thrust, burn time, propellant mass,
  length or thrust curve, all of which are in the bundled catalog; (4) 108 bundled motors against
  OpenRocket's ~1,033, with no way to add one. Smaller: motors are listed by manufacturer part number
  though the catalog carries common names too, there is no search or filter, and thrust-to-weight is
  computed from PEAK thrust but shown against a rule of thumb conventionally stated on AVERAGE thrust —
  that last one is a correctness question, not a feature gap, and should be checked first.

- **A reorder can only move a TOP-LEVEL part, which is the same ceiling `added` has.** `moveTarget`
  returns null for anything nested — a fin set on a tube, a mass object in a bay, an inner tube — because
  those have no place in a stage's stack order. Real designs nest (pods, payload bays, inner tubes), so
  "move this part into that bay" and "move it out of this one" are both real gestures a builder wants and
  neither exists. Measured 2026-07-31: 206 reorders are available across the 35 corpus designs at the top
  level; the nested population is untouched. Lifting the ceiling is one change for both operations —
  `AddedPart.after` and `MovedPart.after` would both need to address a parent as well as a sibling — so it
  is worth doing once rather than twice.

- **RESOLVED 2026-08-02 — a freeform fin's outline now round-trips.** The model retains the
  outline instead of reducing it away at import, and the exporter writes `<finpoints>` back, for both
  the OpenRocket and the RockSim reader. All **9 freeform sets across the 8 corpus designs that carry
  one** now survive a download and re-open with static margin unchanged to three decimals — including
  `Pods--airframes and winglets.ork`, which was the worst at 2.134 → 1.449 cal (−32%), and
  `rocksimTestRocket2.rkt`, which had been losing its `over-stable` warning outright. The equal-area
  trapezoid described below is still what a set with NO outline gets — an elliptical set, or a
  freeform set read from a design an older Loft saved — so both of its tests stay, now labelled as
  the fallback. `/docs/limitations` is updated, including why an older saved copy cannot be recovered.
  Original entry, kept for the measurements and for the reverted alternative:

  > - **A freeform fin's outline is discarded on export, and no trapezoid can stand in for it — R6 work,
  > with the measurements already taken.** `lib/ork/export.ts` writes a `freeformfinset` as the
  > equal-area trapezoid, tip = 2·area/height − root. That solution is negative whenever the planform
  > tapers hard, and the tip is then clamped to zero with the root kept, so the exported fin is LARGER
  > in area than the one drawn. Measured 2026-07-31 over all 35 corpus designs: **8 carry a freeform
  > set and 6 of those shift static margin through a download/re-import — median 0.080 cal, worst
  > 0.685 cal on `Pods--airframes and winglets.ork` (2.13 → 1.45), whose "Wings" set comes back 42%
  > bigger in area.** No design without a freeform set moves at all.
  > **Shrinking the ROOT to 2·area/height instead was built, measured and REVERTED the same day**, and
  > the reasons are the value of this entry: (1) a zero-area planform — which `planformFromPoints` can
  > produce from collinear points — writes a root of 0, and `finContribution` drops a fin set with no
  > root, so the set VANISHES from lift and drag (measured: 2.44 → 1.53 cal on the starter, ~0.9 cal
  > with no warning); (2) a fin set's `axialLength` IS its root chord, so under a `bottom` or `middle`
  > anchor a shorter root translates the planform down the tube — `Pods`' "Wings" moved **52.4 mm aft**
  > — which is an unlabelled change to a build number; and (3) the margin it produced looked better only
  > because of that displacement, since compensating the offset gives 1.28 cal, worse than either.
  > **The real fix is to stop discarding the outline**: retain the `<finpoints>` on the model at import
  > and write them back, which makes the round trip lossless instead of choosing which way to be wrong.
  > That needs `GenericFinSet` to carry the points it currently reduces away, and it belongs to R6 ("a
  > built design leaves Loft intact"). Disclosed on `/docs/limitations` with its size in the meantime.

- **`Parachute.area` is the one mass- or drag-relevant field the `.ork` export still drops.** Read at
  `lib/sim/setup.ts` and `lib/sim/simulate.ts` as `c.area ?? π(d/2)²`, so a design carrying an explicit
  canopy area loses it on a download and descends at the wrong rate. Latent rather than live: no corpus
  design and no adapter sets it today, which is why it was not fixed alongside the packed dimensions —
  a guard that fires on zero real files is the speculative work `MAINTAINING.md` forbids. Fix it when
  an adapter starts setting it, and add the fixture at the same time.

- **RESOLVED 2026-07-31 — the spaces JSX ate on the served pages are gone, and the build now fails if
  one comes back.** A JSX text run that begins on the same line as a closing inline tag and continues
  onto the next line loses its leading space: Babel trims the first line of a multi-line run, so
  `</strong> in them` reaches the page as `</strong>in them` while the source reads correctly and
  lint, unit, build and e2e are all green. Measured on the built export: **86 instances across the
  four docs pages and five app components**, verified in the LIVE served text rather than only in the
  markup — `loft.fusionspace.co/docs/validation` read "97 stored simulationsin them", "per-stepflight
  log" and "notsimulatedmeans". All 86 are fixed by replacing the plain space with an explicit space
  expression, and `scripts/check-text-gaps.mjs` now runs in `postbuild`, so the count cannot leave
  zero without failing the build. Proved by putting one back: build exits 1, naming the file and the
  sentence.

- **A truncated `hourly` series silently thins the winds-aloft profile instead of saying so.**
  `lib/weather.ts`'s level loop calls `arrAt(hourly[…], idx)` per pressure level and `continue`s when
  any of the three series is short, so a response whose `time` has 24 entries but whose
  `wind_speed_850hPa` has 1 drops 850 hPa from the profile with nothing on screen. The Conditions panel
  reports "N aloft levels", so a thinned profile reads as a coarser forecast rather than a damaged one.
  Not fixed with the hour-matching Sev-1 because it has never been observed live — every response
  measured on 2026-07-31 (32.9 N/106.9 W, Kathmandu, Chatham, Tokyo) returned all twelve levels at full
  length — and a guard that fires on zero real responses is the speculative work `MAINTAINING.md`
  forbids. The check that would make it real: assert `hourly[series].length === hourly.time.length` and
  report the shortfall rather than dropping the level.

- **`text-lg` is used 14 times and is not in the type scale at all**, and `font-semibold` 28 times where
  `DESIGN.md` §3 reserves it for "the one number a surface exists to show". Measured 2026-07-31 with
  `grep -roh 'text-lg' components app | wc -l` and `grep -roh 'font-semibold' components | wc -l`. Every
  panel heading in the app is `text-lg font-semibold tracking-tight` — a seventh size sitting between
  `text-base` and `text-xl`, invented once and copied twelve times. It is P1 work (the type-scale slice)
  rather than a defect to clear ad hoc: converting them to `text-xl font-medium` is one increment and it
  moves the section-heading rhythm on every surface at once. Not folded into P1's first increment because
  that one was containers, and a type change and a container change landing together makes a visual
  regression impossible to bisect.

- **Two `rounded-xl border…` treatments are not cards and should not be `<Card>`.** `components/ServiceWorker.tsx:71`
  is a floating update toast (`shadow-lg`) and `components/ImportPanel.tsx:88` is the import drop zone
  (`border-2 border-dashed p-8`, an interactive target). `DESIGN.md` §9's target of one treatment counts
  both against `Card`, so the count cannot reach 1 honestly — they want their own named primitives
  (`Toast`, `DropZone`). Recorded on P1's status line so the target reads 3 rather than looking like a
  shortfall.

- **The e2e config has no browser-revision guard, so the documented gate command silently tests
  against the wrong Chromium.** Measured 2026-07-30: `@playwright/test` 1.61.1 manages chromium-1228,
  the sandbox's pre-installed `/opt/pw-browsers/chromium` is 1194, and `PW_EXECUTABLE_PATH` — which
  this repo's own notes instruct every session to set — hands the older build straight to the suite
  with no complaint. All 169 tests passed on both revisions, so nothing is masked today; the defect is
  that nothing would say so if it were. The sibling repo hit exactly this and its
  `playwright.config.ts` now compares `chromium.executablePath()`'s revision against the override's
  and throws with the reason instead of running. Port that function here — it is ~15 lines, it needs
  no new dependency, and it converts a silent wrong-browser run into a one-line error naming the fix.
  Reproduce: `PW_EXECUTABLE_PATH=/opt/pw-browsers/chromium npx playwright test` and note that nothing
  reports which revision ran.
- **Dragging the Mass position grip past its end splits one gesture into two undos.** A frame beyond
  `lo`/`hi` emits the value the previous frame already emitted, `movedWhatIf` sees no change, and
  `endRun` closes the coalescing run — so overshooting and coming back leaves two "Undo the mass
  position" steps for one drag. The grip's range is only the part holding the mass, so overshoot is the
  ordinary gesture rather than an edge case. Reproduce on the starter: drag the mass past the tube's aft
  end, hold there a moment, drag back inside, then press Undo twice. The e2e only nudges with ArrowLeft,
  which never clamps, so it cannot see this. The fix is for a clamped frame to extend the run rather
  than close it — `endRun` is called by any commit that records nothing, and a no-op inside a live drag
  is not the same thing as a deliberate boundary.
- **Authoring one part hides the controls for authoring the next.** The three add buttons render only
  while the picked part is a body tube, and every add re-aims the fields at the part it just made — so
  after "Add a transition behind this" the transition is selected, it is not a tube, and all three
  buttons vanish. Building an airframe therefore costs a re-pick between every gesture. Reproduce:
  Start a new design → Design → Parts → click the body tube → Add a transition behind this → the row
  of add buttons is gone. This is the tell the OpenRocket benchmark already named — their palette
  GREYS OUT what cannot attach to the current selection, so the flyer learns the rule, where Loft's
  controls simply disappear and teach nothing. Disabled-with-a-reason is the fix, and it applies to
  the fin-set control too (hidden outright when a design has no set to clone).
- **The Transition exit placeholder goes stale under a whole-airframe caliber change.** The transition
  readbacks come off the structure base (the design plus the flyer's adds and removals, without their
  dimension edits) while `bodyDiameter` rescales every transition's fore and aft radius in the flown
  model — so the box offers a caliber nothing is flying while the parts table two inches above shows the
  real one. Reproduce on `APEX_K_Dart.ork`: set Body diameter to 1.4x, then read the parts row
  (`→ 98.0 mm`) beside the Transition exit box (`70.0`). All 25 corpus transitions disagree once a
  caliber edit is live, worst 165.1 shown against 247.6 flown on `Complex.Two-Stage.CDX1`. Every other
  readback is immune because `bodyDiameter` is the only edit that rescales another field's subject; the
  fix is to scale the transition readback by the same factor the flight uses.
- **Narrowing a transition's exit strands its aft shoulder outside the cone.** `withTransitionExit`
  sets `aftRadius` and leaves `aftShoulderRadius` where it was, so `lib/sim/mass.ts` goes on charging
  the shoulder's mass at the old radius and the diagram draws a cone the shoulder no longer fits.
  3 of the 25 corpus transitions reach that state at a plausible typed exit (e.g.
  `github-issuiuc-silsim-rocket__rocket.ork`). Small in kilograms, but it is a part a flyer can neither
  see nor reach, and the honest fix is to clamp the shoulder to the new exit.
- **A dual-deploy drogue is a canopy the flyer can see, click, and not reach.** `drogueDiameter` +
  `mainDeployAltitude` add a second parachute inside `applyDimensionEdits`, AFTER the tree every aim is
  resolved against, so it is in the parts table and on the diagram but in neither `removableFrom` nor
  the aim base. Clicking it highlights the row and moves no aim, and the recovery fields go on
  describing the Main. `unreachableParachuteCount(designBase)` counts 0 for the same reason, so the
  Recovery panel is headed plain "Recovery" while two canopies are flying — the one heading whose job
  is to say another canopy exists. Reproduce: any design → set Main deploy alt and Drogue Ø → Design →
  click "Drogue" in the parts table → the Main chute Ø field still reads the main's diameter. The class
  fix is the one R3 is building: a drogue authored through `added` mints its own id and lands in the
  structure base like any other part.
- **A pick that changes no aim still re-flies the design and rewrites the saved session.** The guard in
  `onSelectPart` rejects only an EMPTY patch, so clicking a part whose aim is already held commits a bag
  identical to the one in state — `commitWhatIf` runs, `fly()` runs, and the `edits`-keyed save effect
  writes `localStorage`. The comment two lines above says exactly this must not happen ("reading a part
  cost a flight"). Reproduce: click one body tube, click another, click the first again — three flights
  for two aims. One-line fix: commit only when some key in the patch differs from the value held.
- **On a phone the pad-check number is nearly two screens below the fold.** Cold-walked at an iPhone 13
  viewport (390x664) on the built export of the SHA this run shipped: the Flight workspace is **6.7 screens
  deep**, "Apogee" sits at y=486 (73% of a screen down), "Static margin" at y=617, and **"Rail-exit
  velocity" at y=1157 — 174% of a screen down**.
  **RE-MEASURED 2026-08-01, same viewport, and the numbers above are stale in one direction:** "Apogee"
  is now at **y=1013 (1.53 screens)**, roughly double where this entry found it. What sits above it is
  the 1071 px of shared chrome broken down in the newer entry at the end of this file — the workspace
  spine and the design summary now precede the panel on every route, which is the cost
  `COMPETITION.md` row 31 predicted the route split could carry. Still inside DESIGN.md §8's two
  screens, and now pinned by `e2e/depth.spec.ts` rather than re-walked by hand; `/sweep` is the one
  route that breaches. Treat the chrome, not the Flight panel's ordering, as the thing to fix. The stated phone use is a pad check with gloves on, and
  rail-exit velocity is the number that check turns on. Nothing is wrong or missing; it is far, which is
  the "phone layout is the desktop squeezed" tell measured rather than asserted. Page overflow is 0 px on
  every workspace, so this is ordering and density, not a layout break. R7 material.
- **Nine site-chrome links are under the 44 px touch minimum, on every workspace.** Measured on the same
  walk: `Docs` 28x44, `Charge` 40x44, `Muster` 39x44, `Loft` 44x32, `Skip to content` 32x16, and the three
  footer links (`ThrustCurve.org` 90x16, `OpenRocket` 70x16, `ADA.gov` 60x16). The touch suite scopes to the
  app's own controls, so the header and footer have never been held to the rule the rest of the app is.
- **The authoring palette does not teach the tree the way OpenRocket's does.** Benchmarked: OpenRocket puts
  an "Add new component" palette of icon buttons beside the tree and **greys out** the kinds that cannot
  attach to the current selection — a nose cone is disabled while a fin set is selected — so the palette
  teaches what can hold what. Loft shows or hides its two controls instead, which is correct but silent: a
  flyer who picks a fin set sees nothing and learns nothing about why. Two more from the same benchmark:
  the new part should open **selected and highlighted on the diagram** (Loft aims the fields at it but does
  not light it up), and a mass object's placement **is** a station — `top` + a non-zero offset in 49 of the
  56 real ones — so unlike a tube's, its add gesture has to ask for one.
- **The three flat structural adds re-anchor themselves under an edit or a removal, silently.** Measured
  on `01.One-stage.ork`: removing the aft body tube moves the boattail to station 0.4429 and renames it
  `c2-boattail`; a `payloadMassKg` with an unaimed `bodyLength` jumps the payload from station 816 mm to
  316 mm while the field advertises 816; and `boattailAftDiameter` is absolute while `bodyDiameter` scales
  the airframe first, so a caliber shrink makes a valid exit fail the `aftRadius < outerRadius` guard and
  the boattail vanishes with nothing said. R3's `added` list fixes this class for authored parts (its
  anchor is a component id and its identity is its own); these three predate it and still carry it.
- **An authored part can only go in a stage's TOP-LEVEL list.** `applyAdds` skips an entry whose anchor is
  nested inside another component, the same rule `addBoattail` already applies, because a nested anchor has
  no unambiguous aft slot. Real designs do nest — pods, payload bays, inner tubes — so this is a ceiling
  R3 will have to lift before "add a part inside this bay" is possible.
- **Ctrl+Z inside a number box grows the undo stack instead of shrinking it.** The shortcut handler bails
  out on `INPUT`/`TEXTAREA`/`SELECT`/contenteditable so a flyer part-way through typing keeps their own text
  undo — but the what-if number fields push every keystroke at the model, so the browser's native text undo
  fires an `input` event, React's `onChange` runs, and `applyEdit` records a step. The visible result is
  still right (the value goes back and the flight follows it), which is why this is filed rather than fixed:
  the stack grows by one where it should shrink by one. Reproduce: focus Fin span, type 60, wait a second,
  press Ctrl+Z without leaving the field, watch the Undo label. The real fix is the field-blur boundary
  below, which would let the shortcut work in the box without the field and the flight disagreeing.
- **The undo stack infers a gesture boundary from a 900 ms clock, and two real boundaries are sitting
  unused.** `RocketDiagram`'s `onActiveChange(true/false)` is an exact pointer-down/up bracket and is passed
  to only 2 of the 7 handles (for freezing the SVG frame); a number field's `onBlur` is the exact typing
  boundary and is not reported at all. Consequence, measured: typing "0.075" digit by digit with more than
  900 ms between keystrokes leaves 5 undo steps rather than 1, and some of them restore an intermediate
  value the flyer never meant to fly. Threading both into `commitWhatIf` as an explicit run key would
  replace the clock for every gesture the app can actually see.
- **Renaming a design is the one header control that is not on the undo stack.** `renameDesign` calls
  `setDoc` directly, so it never reaches `commitWhatIf`. The name is persisted to the session and is what
  `Download .ork` names the file, and OpenRocket puts renames on the same stack ("Rename configuration(s)").
  Reproduce: rename a design, click outside the box, press Ctrl+Z — the name stays. Cheap once the rename
  is routed through the same commit path; it needs the document, not just the edit bag, in the snapshot.
- **Leaving a design and clearing an edit are two different undos with two different depths.** The what-if
  stack is 100 deep, labelled and keyboard-driven; "Import another" is undone by a separate one-level
  `localStorage` slot with its own wording, and the shortcut is unbound on the import screen entirely
  (the handler is gated on `doc`). Reproduce: make edits, click "Import another", press Ctrl+Z — nothing.
  One Edit ▸ Undo covering both is what a hobbyist expects from every desktop tool.
- **Two large corpus designs make the removal and undo labels ambiguous, because parts share a name.**
  `USLI2025-FULLSCALE` carries 7 mass objects all named "Mass Component" (1360.8 g, 3.0 g, 3.0 g, 992.2 g,
  166.2 g, 166.2 g, 166.2 g), `Base drag hack` two identical "Tungsten .5 oz Nose Weight", and
  `FullScaleModelTH.rkt` two named "Mass". Both the Remove button and "Undo removing Mass Component" then
  name a part the flyer cannot tell from six others. `primaryBodyTubePart` already solves exactly this for
  tubes by falling back to the station; mass objects need the same.
- **A nose-less design is flown at a fineness-3 ogive's nose drag, because there is no flat-face model.**
  `lib/sim/aero.ts` sets `noseFineness = haveNose && noseDiameter > 0 ? noseLength / noseDiameter : 3`, and
  its own comment says so. Now that a flyer can REMOVE the nose cone (R2), that fallback is reachable by a
  deliberate act rather than only by an odd import, so the optimism is stated on `/docs/limitations` instead
  of left implicit. The fix is a real blunt-body term; until then the page says not to read an apogee off a
  nose-less rocket.
- **The parameter sweep's axes are resolved from the PRISTINE design, so an axis can outlive the part it
  varies.** `components/ParameterSweep.tsx` builds `axes` from `doc.rocket`, not from the edited model, so
  after removing a fin set the fin axes are still offered and the sweep plots a flat line — a response curve
  for a dimension nothing has. Same shape for the flutter metric. Found by the pre-push review; not fixed
  here because the sweep needs the shown rocket threaded to it, which is its own increment.
- **After the only motor mount is removed, the motor pickers still offer motors.** `swapInfo` and
  `configChoices` come from the pristine `doc.rocket`, so the swap picker and the configuration picker keep
  listing options for a design that now has no mount. The flight itself is honest ("This configuration has
  no motor assigned, so there is no thrust to fly" — verified on `USLI2025-FULLSCALE-10.15 (2).ork`), so
  this is a control offering something inert rather than a wrong number.
- **The baseline / what-if delta strip does not treat a removal as a what-if.** `hasWhatIf` in
  `components/LoftApp.tsx` lists every design edit except `removedIds`, so a removal produces `baseline =
  null` and the before/after strip never renders for the one edit whose effect is largest.
- **A successful removal can leave the stale-id refusal sentence on screen.** `GeometryInspector`'s local
  `selectedId` is not cleared when the picked part is removed, and the aim-sync effect does not fire because
  no aim moved, so the panel can render "That part is no longer in this design." in amber immediately after
  a removal that worked. Cosmetic but confusing: it reads as a failure.
- **On a design whose stage carries `overrideMass` + `overrideSubcomponents`, a removal sheds no mass and
  nothing says so.** The stage's stated figure replaces the sum of its parts, so deleting a part inside it
  changes the mass by zero. The existing "mass absorbed" notice is gated on the ADD cases (payload, drogue),
  so a removal gets no equivalent. `Dual parachute deployment.ork` and `EscapeVelocity.ork` are the corpus
  designs that state mass this way.

- **Benchmark against OpenRocket: the parts list is FLAT where theirs is a tree, and 9 of 35 designs pay
  for it.** OpenRocket presents components as a hierarchy with the stage as an explicit parent, so a part
  is identified by where it sits in the structure. Loft's parts table has Component, Type, Station, Mass
  and Dimensions — **no stage column and no nesting** — so on a staged design with repeated names the
  station is the only discriminator. Measured: 9 of the 35 corpus designs have more than one stage AND
  parts sharing a type+name; the worst is `Two stage high power rocket.ork`, 2 stages and 47 parts, of
  which **33** share a type+name with another (Bulkhead x10, Tube Coupler x9, Centering Ring x8). R1
  fixed the half a flyer acts on — the editor names the part it is HOLDING, by station where the name does
  not distinguish it — but a flyer scanning the list to find a part still cannot tell a booster bulkhead
  from a sustainer one. A stage column is the cheap version; the tree is the real one, and it is what R2's
  delete and R4's reorder will both want a surface for.

- **A from-scratch design's component ids are re-minted on every reload, so a stored aim matches nothing.**
  Measured with a probe: `newDesign()` gives its parts the ids `nose`, `body`, `av`, `chute`, `mount`; a
  built design's session bytes are `exportOrk(document)` (`components/LoftApp.tsx`, the "Start fresh"
  path), and `lib/ork/export.ts`'s `nextUuid()` writes `10f70000-0000-4000-8000-000000000002` upward
  instead of `c.id` — so the re-imported model carries entirely different ids and an aim saved before the
  reload resolves to nothing, falling back to the longest tube / largest canopy. Two exports of one design
  ARE identical (the counter resets per export), so this is the export/live boundary, not repeat exports.
  Harmless today only because the starter carries one body tube and one fin set. It is a hard blocker for
  R2, whose operation list addresses ids, and it is recorded in `ROADMAP.md` as R2's first task. The fix
  is to write `c.id` when it is already UUID-shaped and to make the starter's ids UUID-shaped, so the
  round trip preserves them; an imported design is unaffected either way, since its session stores the
  original bytes and a re-parse of the same bytes re-derives the same ids.
- **The caliber drag handle's upper bound comes from the WIDEST part, not the tube it resizes.**
  `components/RocketDiagram.tsx`: `diaHi = max(bodyDiaNow, 2 * frameExtent)` with `frameExtent` derived
  from the airframe's maximum extent, while the handle now sits on the PICKED tube. On a narrow picked
  tube the handle can therefore scale the whole outer airframe well past the frozen frame, and the comment
  above it claims the bounds "keep the wall inside the framed extent". Found by the pre-push review; not
  fixed because the bound is a drag range rather than a number a flyer reads, and the same handle's
  freeze-frame behaviour is already filed above.
- **`lib/sim/trim.ts` computes the fin-position trim advice from the FRONTMOST set, not the picked one.**
  Carried over from an earlier session's entry and re-checked this run: `primaryFinStation(rocket)` with no
  selected id. The pre-push review's own correction is worth keeping — the millimetre figure the panel
  prints is `targetStation - station0`, so the seed cancels and the number is right. What is actually wrong
  is `feasible: targetStation > 0`, which is judged against the frontmost set's station, and the sentence
  saying "the fin set" without naming which. R1 shipped `primaryFinSetPart`, so naming it is now cheap.
- **A field holds one value, so picking another part of the same kind re-aims a live edit onto it.**
  With `bodyLength` set to 640 mm on the aft tube, clicking the forward tube to read its mass re-aims that
  640 mm onto the forward tube. Identical on fin sets, which shipped earlier, and inherent to an edit model
  that is a flat patch of absolute values rather than a per-part record. NOT a defect to patch in place: it
  is visible (the panel names the part it is holding) and it is what R2's operation list removes. Recorded
  on `/docs/limitations` as a stated consequence rather than left for a flyer to discover.
- **The importer drops pod-mounted and parallel-stage components, and R1's second named design is mostly
  pods.** `Pods--airframes and winglets.ork` declares 3 body tubes, 3 nose cones and 6 fin sets; Loft
  imports 1, 1 and 5. The omission is disclosed at import ("This design has pods, which aren't simulated
  yet — only the primary stack was flown"), so no number is presented as complete — but the parts a flyer
  can click are only the ones that survived. 2 corpus designs carry `<podset>` and 1 a `<parallelstage>`.
  Ingestion work, not editor work; it wants its own roadmap entry rather than a slice of one.
- **`primaryFinSet`'s "frontmost" is a DOCUMENT-order claim, and it is false on 3 designs.**
  `flattenRocket` pushes as it walks and never sorts, so `fins[0]` is the first in file order, not the
  most forward. Measured: `Mini Honest John.ork` has `fins[0]` at x=156.2 mm with a set at 124.5 mm ahead
  of it; `The Red Hunter.ork` `fins[0]` at 385.0 mm against a freeform set at 202.0 mm. R1 removed the
  user-visible half of this — the panel names a set by its STATION now, which is true whatever the walk
  order — but the doc comments in `lib/model/edit.ts` still say "frontmost" and the fallback is still
  document-order.

- **RESOLVED this session — the hit-target suite measured HEIGHT only, so a control could pass at
  34 px wide.** The scan filtered on `r.height >= 44` and never looked at width. Measured on a
  390x844 phone, three controls were under the project's own stated 44x44 minimum while the suite
  reported every workspace clean: the parts table's `Type` (37x44) and `Mass` (42x44) sort headers,
  and the motor sweep's `T:W` (34x44) — the axis a thumb misses along on a row of adjacent columns.
  The scan now asserts both dimensions, and the three headers take `TOUCH_TARGET_SQUARE`, which
  existed for exactly this. Both tables already scrolled inside their own `overflow-x-auto`
  containers (683 px and 410 px of table in a 324 px container), so the 9-10 px this adds costs no
  layout: neither workspace scrolls the page sideways, and `sm:min-w-0` leaves desktop at 37x16.

- **RESOLVED this session — a payload added inside an assembly the design has weighed was accepted,
  badged "with your edits", and changed nothing.** A whole-assembly mass override IS the design's
  statement about the total, so the model is right to hold it and OpenRocket does the same — but
  nothing said so. Measured on `e2e/fixtures/stage-weighed.ork`: a 1,000 g payload on a 1.4 kg rocket
  left dry mass **1.234 kg**, liftoff mass **1.436 kg** and apogee **581 m** every one unchanged,
  while the mass panel wore the edited badge over a table that had not moved. A flyer sizing an
  av-bay would fly a design 70% lighter than the one on the bench. Three of the 35 corpus designs are
  this shape (`Dual parachute deployment.ork`, `EscapeVelocity.ork`, `02.Two-stage.ork`). Detected by
  asking the model rather than walking the tree — mass was added and the total did not move — and the
  panel now names the reason and points at nose ballast, which is added on top rather than inside.
  Found by an independent review of the change that introduced the badge.

- **A motor swap on a STAGED design replaces every stage's motor, and the swap picker is built from
  `instances[0]` alone.** `swapMotor` (`lib/sim/run.ts:102`) rewrites every instance, while
  `swapInfoFor` derives the offered casing from the first. Measured on `Two stage high power
  rocket.ork`, configuration "I59WN + I357T": selecting G66-LR puts G66-LR in BOTH stages — the
  resolution strip reads "G66-LR G66-LR" — and apogee goes **1,354 -> 430 m**. This session's
  configuration-change guard inherits the same blind spot: a swap that fits the sustainer and not the
  booster is validated against the sustainer alone. The `!staged` gate that withholds the motor SWEEP
  for exactly this reason (`ResultsView.tsx:349`) is not on the picker. Pre-existing and already noted
  further down this file; recorded here with the measurement.

- **RESOLVED this session — wiring the launch conditions into the analysis panels made every
  KEYSTROKE restart them.** The panels key their cached answer on a value so an unrelated re-render
  cannot throw minutes of work away; `Num` calls `onChange` on every keystroke so a value can be typed
  a digit at a time, so each intermediate reading became a distinct key. Measured on the built export:
  typing `1500` into Field elev. drove **8 aria-busy transitions** on the motor sweep — four full
  restarts, each flying every bundled 54 mm candidate at 1 m, then 15 m, then 150 m. Settled at 350 ms
  through a shared `useSettled`, the same treatment the dispersion's own sigma inputs have always had:
  **2 transitions**, and the panel still lands on the value that was typed. Found by an independent
  review of the change that introduced it.

- **RESOLVED this session — a NEW forecast could not change any panel's key.** An atmosphere and a
  wind profile are FUNCTIONS, so they were folded in as a presence flag; re-fetching at the same site,
  or fetching another site at the same elevation, left every key byte-identical while the air the
  flight is flown through was replaced. Air density is the dominant term in a ballistic apogee — the
  sweeps would have kept the old rows and captioned them as the flyer's. A `weatherSerial`, bumped
  once per fetch and by nothing else, now carries the identity the value comparison cannot.

- **Under today's weather the dispersion has no wind uncertainty at all, and said the opposite.**
  `windAt` returns `windProfile(altAgl)` and never reads the sampled bearing, so all 300 flights drift
  on the forecast's own wind: the scatter is one lobe, not a disc over all headings. `/docs/methods`
  asserted the opposite one sentence after the new paragraph explaining the profile. Both the page and
  the panel now say which case they are in — but note this is a DISCLOSURE, not a fix: the recovery
  area under Today is still the spread of one bearing. Sampling a bearing spread around the forecast's
  own heading would be the real answer and is not done.

- **The RocketPy cross-check flies the FILE's launch conditions while every panel around it flies
  the flyer's.** `RocketpyCrossCheck.tsx:119` takes `overridesFromStored(sim)` and is never handed
  `flownOverrides`, though it does honour the design what-ifs (ballast, motor swap, geometry). So
  with a rail angle or a field elevation typed, the Loft column in that panel is a different flight
  from the apogee on the Flight card a screen up. Internally the comparison is still apples to
  apples — both engines fly the stored setup — which is arguably right for a check against the
  file's own stored results, but nothing on screen says which of the two flights the reader is
  looking at. Either thread the conditions through or caption it. Not yet measured.

- **A JSX text run that spans a line break loses its LEADING space** — found four shipped instances
  this session (see RESOLVED below). Worth a lint rule: nothing in the gate catches it, and the
  source looks correct. The scan that found them reads the built chunks, not the source, because the
  bug only exists after the transform.

- **RESOLVED this session — the scenario toggle kept a wind edit the flight discards.** `onWeather`
  drops the two edits a forecast overrides and its comment says exactly why; the toggle reached the
  same scenario by a different door and did not. Measured in the built export on the 54 mm sample:
  fetch a forecast, switch to As designed, type 12 m/s, switch back to Today — the box read **12.0**,
  greyed out, while the flight drifted **794 m** on the forecast's wind, and 12 m/s really does give
  **2,518 m**. The toggle now clears the same two edits the fetch does, so the two paths into Today
  agree. Covered by the suite's first weather test, with the forecast and geocoding endpoints stubbed
  so it is not a network test.

- **RESOLVED this session — one shared "the flyer edited the conditions" flag had panels claiming
  credit for edits they never read, and called a fetched forecast the flyer's own setup.** Three
  Analyze panels took a single `conditionsEdited` boolean. Two of them (motor sweep, parameter
  sweep) fly BALLISTIC, and `runFlight` zeroes the wind for a ballistic run — so a surface-wind edit
  flipped both captions to "the launch conditions you set" over a table that was bit-identical.
  Verified in the built export: with wind set to 9 m/s the motor sweep's caption claimed the flyer's
  conditions two sentences before its own text says "Surface wind is not read at all". The same flag
  also counted `scenario === "today"` as an edit, though `onWeather` deliberately CLEARS the two
  edits it overrides and greys both fields — the flyer set none of it — and it let a design that
  states no launch setup be captioned "the design's own stored launch conditions" while the
  Conditions panel said in amber, on the same page, that those are Loft's defaults. Replaced with a
  `ConditionsSource` record and `conditionsPhrase(src, { wind })` in `lib/what-if.ts`, so each panel
  is asked only about the fields it reads. All five phrasings confirmed in the rendered DOM.

- **RESOLVED this session — four shipped captions were missing a word gap** ("25flights across the
  range", "the OpenRocketcomparison is hidden", "Delayis the ejection delay", "the stored
  OpenRocketresults describe"). One cause: a JSX text run that spans a line break loses its LEADING
  whitespace, so a plain space before a wrapped continuation does not survive the transform even
  when the space sits mid-line in the source. Found by scanning the built chunks for a rendered
  value followed immediately by a string opening with a whole lowercase word; fixed with explicit
  `{" "}`; the scan now returns zero. Each of the four was confirmed broken and then correct in the
  rendered DOM, the last of them on `Parallel booster staging.ork`, which is a design that actually
  reaches the withheld-comparison notice.

- **RESOLVED this session — the dispersion study planned for the day the design file was saved, not
  the flyer's.** `MonteCarlo` built its nominal from `overridesFromStored(sim)` alone, so the four
  Conditions edits and the whole "Today" scenario never reached it, while the Flight card beside it
  used them. Measured in the built export on the 54 mm dual-deploy sample, surface wind set to
  8.9408 m/s (20 mph): the card's drift went **630 -> 1,877 m** while the panel's recovery radius
  (95%) stayed at **1,203 m** against a true **2,519 m** and its median drift at **593 m** against
  **1,811 m**; landing speed 6 -> 10 m/s. It did not even reset, because `designKey` carries no
  condition field. `app/docs/faq` then said "the answer reflects your own conditions", which turned an
  undisclosed defect into a denied one. Now plumbed through one shared `flownOverrides`, with its OWN
  conditions key — the shared `designKey` is watched by the two sweeps and the RocketPy cross-check,
  all of which fly ballistic, and `runFlight` zeroes the wind for a ballistic run, so a wind edit
  measurably changes nothing in them (apogee 2,941 m at 3 m/s and at 8.94 m/s, identical). The panel
  now also says whose conditions it flew. An independent headless replica of `monteCarlo` predicted
  2518.7 m and 1811.1 m before the change was written; the browser measured 2,519 m and 1,811 m.

- **The other three stored-conditions surfaces, measured — one of them makes a promise it breaks.**
  `MotorSweep.tsx:89`, `ParameterSweep.tsx:152,232` and `RocketpyCrossCheck.tsx:119` all fly
  `overridesFromStored`. Surface wind is a genuine no-op for all three (`run.ts:135` zeroes it for a
  ballistic run — apogee 2,941 m at 3 m/s and at 8.94 m/s), but rail length, rail angle and field
  elevation are not: rail 10 deg moves the ballistic apogee 2,941 -> 2,852 m (-3.0%), elevation 1,500 m
  -> 3,237 m (+10.1%), and rail length 2.0 -> 1.0 m drops rail-exit velocity **28.2 -> 19.6 m/s**,
  straight through the ~15 m/s rule of thumb. **The motor sweep is the one that breaks a promise**:
  its caption invites you to check rail-exit "against your rail" while flying the rail length in the
  FILE. The parameter sweep discloses its baseline plainly ("under the design's stored conditions"),
  so it is disclosed rather than denied. The RocketPy cross-check is silent about conditions, but
  stored is arguably the RIGHT choice there — the panel exists to compare two solvers like-for-like
  against the file — so its fix is wording, not plumbing.

- **RESOLVED this session — the parts-table caption read "adds up to 0 kg" for a real 1.4-2.0 kg
  airframe.** The caption stated the SUM OF ITS OWN COLUMN as the design's dry mass; it now states
  `dryMassProperties`, the same source the Mass & balance panel reads, and names the part no row can
  carry. Verified in the built export: `Dual parachute deployment.ork` 0 -> **1.361 kg** (all of it
  whole-stage), `EscapeVelocity.ork` 0 -> **2 kg**, `02.Two-stage.ork` 1.002 -> **2.533 kg** (1.531 kg
  whole-stage), and the bundled sample unchanged at 0.6 kg with no note. `massByComponent` itself is
  unchanged and still keyed by component — a stage override belongs to no component and the table is
  not missing rows, it is missing a row it cannot have. `e2e/fixtures/stage-weighed.ork` was added so
  CI can exercise the shape at all: no bundled sample or committed fixture carried a stage-level
  override, and the sample-based test passes with the defect reintroduced. The original entry follows.
- **The parts-table caption reads "adds up to 0 kg" for a real 1.4-2.0 kg airframe.**
  `massByComponent` (`lib/sim/mass.ts:407`) keeps only point masses that carry a `componentId`, and a
  stage-level `<overridemass>` is pushed at `:381` with no `componentId` — so the whole lumped figure
  is dropped from the total the diagram's caption sums. Reproduced first-hand in the built export with
  ZERO edits applied: `Dual parachute deployment.ork` renders **"adds up to 0 kg"** beside a Mass &
  balance panel reading **1.361 kg** (the lumped `Sustainer` is 1.3608 kg), and `EscapeVelocity.ork`
  **"0 kg"** against **2 kg**. `02.Two-stage.ork` reads 1.002 kg against 2.533 kg — its lumped `Dart`
  is 1.5309 kg. The caption is reachable: it lives in the Parts `<details>`, which opens on the
  summary click or on any part click. It is also the caption that points a flyer AT the other panel by
  name, so the two numbers are read together. Fix by giving the lumped row a home in
  `massByComponent` rather than dropping it — the panel beside it already labels such a row with the
  nearest ancestor that carries the override.

- **RESOLVED this session — the stability trim advice described the file's airframe while every
  number it was solved against came from the edited one.** `StabilityTrimHint` sits inside the same
  `<section>` as the summary strip and is fed cp, cgLoaded, liftoffMass and refDiameter from the run,
  but took its two GEOMETRY reads — `noseBallastStation` and `finStationTrim` — off `doc.rocket`.
  Measured on the 38 mm sample with fin span cut to 20 mm: it advised moving the fin set **193 mm**
  aft where the edited airframe needs **287 mm**, 49% short, on a number a flyer acts on by moving
  parts. Body diameter to 76 mm: 78 mm advised against 104 mm correct. A doubled body length comes out
  identical either way, which is how it survived the work on the panels around it. Related and NOT
  fixed: `finStationTrim` reads `primaryFinStation(rocket)` with no selected id (`trim.ts:154`), so on
  a multi-fin-set design it names the frontmost set rather than the selected one — the same defect the
  fin what-if fields were fixed for in an earlier session.

- **RESOLVED this session — two panels described a rocket the flyer was not editing.** The summary
  strip's Length read `overallLength(doc.rocket)` while Max diameter, CG, CP and Static margin beside
  it came from the edited run. Measured on the 38 mm sample: doubling a 700 mm body left Length
  reading **950 mm** next to a centre of pressure of **1,422 mm** — 472 mm past the length the same
  line claims. That strip sits above the tabs so an edit's headline effect is legible from any
  workspace, and overall length is what a flyer checks against a rail, a shipping tube and a waiver
  form. `MassBreakdown` had the same shape one panel over: fed `doc.rocket` while its sibling
  `GeometryInspector` got the edited model, so the two panels on one tab disagreed about the same dry
  mass (**0.6 kg against 0.893 kg**) — while the diagram's caption points at that panel by name for
  the total and the panel's own caption says these are the masses the simulator flies. Both now take
  the shown rocket. The e2e test asserts a self-consistency the fix does not have to be known to
  read: a centre of pressure cannot sit beyond the airframe it is measured on.

- **CORRECTION to two entries below — measured, and neither is reachable on any real file.** The
  fan-out filed both and adversarial verification confirmed the CODE is wrong in each; driving the
  corpus says the damage is not.
  - The RASAero `<Pressure>` guard: `Show-off.CDX1` is the only file whose stated pressure passes
    `> 0` while being impossible, and that design **shows no flight at all** — its motors (`1/4A2`,
    `C4`) resolve to nothing, so the 14.7x thin atmosphere reaches no displayed number. A guard here
    would fire on zero reachable designs. **What IS worth chasing, and is new:** across the 4 RASAero
    corpus files the only plausible value is `OR vs RAS Test 1`'s **29.53 inHg at a 3,848 ft field**,
    and `atmosphereForGround` inverts that to a sea-level pressure of **1,137 hPa** — 53 hPa above
    the highest ever recorded on Earth (1,083.8 hPa, Agata, 1968). Read instead as a sea-level
    altimeter setting it is an ordinary 1,000 hPa. So RASAero's `<Pressure>` is very likely
    sea-level-referenced and Loft reads it as the pressure AT the field, flying air ~15% too dense.
    The two tools' own stored apogees on that design (RASAero 22,376 m, OpenRocket 13,910 m) differ
    by 60%, so they cannot settle it — this needs the RASAero II documentation, not another sweep.
  - `sepT = phases[nStages - i]` (`simulate.ts:824`) indexes the phase list positionally, which only
    holds for a full separation ladder; a collapsed table drops one booster's descent readout and
    gives the other both boosters' mass. Verified on a synthetic fixture. **No corpus design reaches
    it**: the only two designs whose phase table collapses are `03.Three-stage.ork` and `Three stage
    low power rocket.ork`, and both are flagged ballistic — no canopy Loft can see — so the descent
    loop skips them before the index is used. The correct lookup is `phases.find(p => p.stageCount
    <= i)?.startTime`, and note the mass then belongs to the whole group that leaves at that instant,
    not to each stage separately: a serial stack parts at ONE joint.

- **`ejectionTime` is `Infinity`, not `undefined`, for a motor that never ignites**
  (`setup.ts:221` computes `ignitionTime + burnTime + delay`). `ejectionIsPlugged`
  (`simulate.ts:1006`) tests `m.ejectionTime !== undefined` and so reads "something on this stage
  does fire" from a motor that never fires, dropping the plugged-motor warning and letting an
  `ejection`-triggered chute fall back to apogee. This session's detach fix closes it for an unlit
  stage that IS shed (its motor now carries a finite detach time and is filtered out); it remains for
  an unlit stage nothing separates above. One line at the source: a motor with a non-finite ignition
  time has no ejection time.

- **RESOLVED this session — one unlit motor made the whole flight's burnout `Infinity`, and four
  numbers were read off it.** `setup.ts:212` mints `ignitionTime = Infinity` for a motor whose
  trigger can never arrive (a `burnout` event on the bottom-most stage, with nothing beneath it to
  burn out); it rides as inert mass, which is what the file's own stored flight shows.
  `burnoutTime` folded that into a `Math.max`, so the FLIGHT's burnout became `Infinity` — not
  "later than the others", but "never". Measured in the built export on `03.Three-stage.ork`, the
  one corpus design that mints the trigger: **burnout velocity 0 m/s and optimum delay 0 s beside a
  1,452 m apogee reached at 20.8 s.** Optimum delay is what a flyer buys or drills a delay grain to,
  and 0 s reads as "deploy at burnout" on a rocket still ten seconds from apogee. `burnoutMass` was
  read at `t = Infinity`, past every casing's detach time (`t >= (detachTime ?? Infinity)` and
  `Infinity >= Infinity` is true), so the descent mass lost every motor — including the inert one
  still bolted on — and landing energy and the recovery-sizing goal-seek are both computed from it.
  Fixed by skipping non-finite ignition times. Before/after census across all **39** corpus and
  sample designs, driven through the built app one isolated browser context each: **1 design
  changed** — burnout velocity 0 → 181 m/s, optimum delay 0 → 10.8 s, landing energy 40 → 65 J,
  apogee unchanged at 1,452 m — and 38 unchanged.

- **The opening fan-out this session filed 53 findings across five lenses; 20 went to adversarial
  verification and 19 survived. The ones not yet worked, in rough damage order.** Every one names a
  file and a corpus design; reproduce before scoping.
  - **A RASAero `<Pressure>` is taken on a bare `> 0` guard** (`lib/rasaero/adapt.ts:371`) and fed
    straight to `atmosphereForGround` via `lib/sim/run.ts:44`. `Show-off.CDX1` states
    `<Pressure>2</Pressure>` — 2 inHg → 6,773 Pa, 6.7% of sea level → ρ ≈ 0.08 kg/m³ against ~1.17,
    a **14.7× thin atmosphere** flown as an ordinary flight. `<Temperature>` and `<Altitude>` have
    no bound at all. Nothing on screen says the atmosphere came from the file, and Conditions
    exposes neither field, so the flyer can neither see it nor correct it. The RockSim path already
    bounds rail length to 0.1–20 m (`lib/rkt/adapt.ts:618`); the atmosphere inputs get nothing.
  - **An altitude-triggered recovery device with no stated altitude falls back to `?? 0`**
    (`lib/sim/simulate.ts:700`), so its trigger becomes `pos.z <= 0` and it "deploys" at the ground
    on the last descent step — setting `anyRecoveryOpened`, which gates the ballistic-descent
    warning the code's own comment calls "the most serious thing Loft can flag". Both importers can
    mint the shape (`rasaero/adapt.ts:416` when `Altitude2 <= 0`; `ork/adapt.ts:561` via
    `childNum(...) || undefined`). A ballistic impact is downgraded to a hard-landing caution that
    advises a larger canopy for a flight where nothing opened.
  - **RESOLVED 2026-07-31 — winds-aloft direction is interpolated the short way round.** This read
    "interpolated without a 0/360 wrap (`lib/weather.ts:131`): `dir = a + (b - a) * f` straight into
    `windVector`, no unwrap anywhere. For a 350°/10° pair, f=0.5 gives 180° where the truth is 0° —
    the vector exactly reversed, wind from due south where it blows from due north." `lerpBearing`
    (`lib/weather.ts`) takes the difference into **[−180°, 180°)** first — half-open at the top, which is
    brute-forced over every integer pair in the test rather than asserted in prose. Fixed alongside a Sev-1 in the same function that
    corrupted the same number, and pinned by `lib/weather.test.ts`, which the file had none of.
  - **`.ork` archives carry `thrustcurves/*.rse` and the zip reader discards them**
    (`lib/ork/zip.ts:92` takes only the first design entry), while `lib/motors/db.ts:4` and
    `lib/model/types.ts:315` both assert "a .ork never embeds the curve". So a design is refused a
    flight for want of a curve the file is carrying: `EscapeVelocity.ork`'s H225-14A configuration
    (stored apogee 524.75 m) and both simulations of `Show-off.CDX1` resolve to nothing.
  - **`<overridecd>` / `<overridesubcomponentscd>` are read by nothing.** `Base drag hack
    (short-wide).ork` sets `<overridemass>0.0`, `<overridecg>0.0` AND `<overridecd>0.0` on a 0.2475 m
    tail flare, and its own `<comment>` says the technique IS those three checkboxes. Loft honours
    two of three and bills the cone for drag the file states is zero — the design's documented
    purpose inverted. Neighbouring gap: `<tabheight>`/`<tablength>`/`<tabposition>` are read nowhere
    either, so **101 g** of through-the-wall fin tab vanishes from the aft end of `Airstart
    timing.ork` (3 × 0.0682625 × 0.2413 × 0.003 m × 680 kg/m³) and **120 g** from
    `03.Three-stage.ork`. Fin fillets cost 237 g on `OR vs RAS Test 1.ork` and are at least disclosed
    at `app/docs/limitations/page.tsx:118`; tabs are disclosed nowhere.
  - **`meanFinChord` is assigned per fin set, ending as the LAST set walked, while `finThickness` on
    the next line is the MAX across sets** (`lib/sim/aero.ts:451`), so `finThicknessRatio` pairs one
    set's thickness with another set's chord — a ratio belonging to no fin, which changes if the
    design's sets are reordered without changing the rocket. `finSweepLength` (last) paired with
    `finSpan` (max) at `aero.ts:505` is the same defect.

    **Measured, and an area-weighted fix was built and then REVERTED — read this before rebuilding
    it.** 13 of the 35 corpus designs carry more than one fin set. The mixed pairing produces
    `Show-off.CDX1` t/c = **1.00** — a fin as thick as its chord — where both its sets are 0.50, and
    `Mini Honest John.ork` an **unswept** leading edge (0.0°) where its dominant set sweeps 44.5°,
    taking the full stagnation drag a swept edge does not pay. `Pods--airframes and winglets.ork`
    reads t/c 0.122 against an area-weighted 0.046.

    Replacing both with planform-area-weighted means (of t/c, and of cos²Λ rather than of Λ) is
    exactly value-preserving on the 22 single-set designs, and the corpus medians barely move —
    timeToApogee **1.7 → 1.5%**, maxMach **2.1 → 2.2%**, every other metric unchanged — because the
    medians are dominated by designs the change cannot touch. Per design, on the 15 comparable
    stored simulations, 14 moved: `03.Three-stage.ork` apogee **7.57 → 6.89%** and maxMach 3.98 →
    3.75%, `Simulation scripting.ork` slightly better on all three, and most others ±0.05. But two
    regress hard: `Complex.Two-Stage.CDX1` apogee **12.40 → 20.35%** and **4.53 → 11.85%**, and
    `The Red Hunter.ork` **4.44 → 5.66%** (maxV 1.72 → 2.24%).

    The regression is not a bad average, it is the model underneath. `Complex.Two-Stage.CDX1` is a
    RASAero stress-test carrying six genuinely different sets (chords 1/0.25/1/6/2/4 in, counts
    3/6/6/5/4/3, per-set t/c 0.20/0.53/0.20/0.025/0.10/0.040) — checked against the raw `<Fin>`
    nodes, so they are real definitions and not unused template stubs. RASAero models each set on
    its own; Loft collapses every set into ONE equivalent fin for drag, and no choice of average
    represents six sets that different. "Last set wins" was not right either — it just happened to
    land on a sane set on these two files.

    So the honest fix is per-set drag accumulation (each set contributing its own friction form
    factor and sweep factor over its own wetted area), not a better mean. If a cheaper step is
    wanted first, the candidate is "the set with the largest planform area supplies BOTH numbers",
    which at least never yields a ratio belonging to no fin — unmeasured, and it must be run against
    the same 15 comparable simulations before it goes anywhere near the deploy branch.

    **CORRECTED 2026-08-01 — the fix this entry recommends has now been measured, and it is not
    enough on its own.** Per-set friction form factor and per-set sweep factor over each set's own
    wetted area were both implemented and both reverted (R7 increment 3; the numbers are in
    `ROADMAP.md` and on `/docs/limitations`). Per-set thickness alone moved `Complex.Two-Stage.CDX1`
    J180T from +4.5254% to +4.9578% and J90W from +12.3991% to +12.8813%; adding per-set sweep took
    them to +13.98% and +22.60%, outside the ±12% the corpus asserts. The reasoning above is right
    that no mean represents six sets that different — but the reason the change does not help is
    different from what this entry assumes. A collapsed value is not biased in one direction, so
    correcting it adds drag to some designs and removes it from others; these two are ones Loft
    already flies HIGH, so removing a spurious over-drag moves them further from their stored
    results. The collapses are partly compensating for a separate under-drag on this design, and
    that under-drag has to be found first. Do not re-implement per-set thickness or sweep before it;
    that is three attempts and three reverts.

- **RESOLVED this session — `npx tsc --noEmit` failed over the whole project** on one untyped
  `evaluate` callback in `e2e/smoke.spec.ts` (`Property 'labels' does not exist on type
  'SVGElement | HTMLElement'`). Outside the gate — `npm run lint` and `npm run build` both passed,
  and neither typechecks the e2e directory — so nothing was broken, but it meant a whole-project
  typecheck was not a check anyone could run. Typing the callback `HTMLInputElement` clears it, and
  `tsc --noEmit` now exits 0 across the repo. Found while checking an unrelated change had not
  introduced one, which is the only reason it was noticed at all: consider adding it to the gate.
  - **RASAero recovery `<Size1>`/`<Size2>` are read as canopy diameter in FEET with no bound.**
    `Complex.Two-Stage.CDX1` states Size1=12, Size2=24 on a 4.06 lb rocket: as feet that is a 7.32 m
    main and a 3.66 m drogue giving **0.94 m/s** under the main. Either the unit is wrong or the
    file is; nothing in the import says which, and no bound catches a canopy four times the rocket's
    length. Related: `planBooster` reads only Booster 1 — `IncludeBooster2`, `Booster2Engine`
    (`Show-off.CDX1` carries `A6Q (QU)`) and friends are read by no code, and the drop is not counted
    in the `droppedBoosters` warning. **The `QU` half of this is RESOLVED this session**: the alias
    table had `Q` and `QUEST` but not `QU`, the code RASAero actually writes, and a two-letter key
    that misses the table is not an unknown maker — `sameMaker` refuses to prefix-match under three
    characters, so it is a DISAGREEING one, and a disagreeing manufacturer vetoes the match at every
    quality. `resolveMotor({ manufacturer: "QU", designation: "C12" })` returned **null** against
    six bundled Quest motors: no motor, so no flight. Note the honest limit — the only `(QU)` in the
    corpus is `Show-off.CDX1`'s `Booster2Engine`, and both its `IncludeBooster2` flags are `False`,
    so no corpus flight reaches it and the fix is verified at unit level only. The rest of this
    entry (Booster 2 read by no code, `<Size1>`/`<Size2>` unbounded) still stands.
  - **The Monte-Carlo flies the file's stored launch setup, not the flyer's.** `MonteCarlo.tsx:153`
    uses `overridesFromStored(sim)` only, so Conditions edits and the "Today" scenario are absent
    from its nominal while the Flight card's drift uses them. Set surface wind to 20 mph: the Flight
    card's drift jumps, median drift / recovery radius (95%) / chance over ceiling do not, and the
    panel does not even reset because `designKey` carries no condition field. `app/docs/faq:244`
    then states "You set the one-sigma spread on each input, so the answer reflects your own
    conditions" — which converts an undisclosed defect into a denied one. Recovery radius and the
    waiver-bust probability are the two numbers a flyer plans a field around.
  - **A motor swap survives a configuration change it cannot apply to.** `selectConfig`
    (`LoftApp.tsx:586`) never reconciles `edits.motorSwap` and `swapMotor` applies it
    unconditionally. On `Punisher Apprentice.ork` (9 configs across 24/29/38 mm casings): swap on the
    38 mm H550ST run, then select the 24 mm E30T run — the picker shows blank while apogee, T:W,
    rail exit and optimum delay are still the 38 mm motor's.
  - **`downloadOrk` bakes payload mass and station into the export but drops `ballastKg` entirely**
    (`LoftApp.tsx:478`, adjacent fields in one fieldset), with nothing saying so. Nose ballast exists
    to fix a low static margin, and the exported file is the one a flyer builds to.
  - **Two panels on the Design tab describe different rockets.** `RocketSummary`'s Length comes from
    the UNEDITED design while CG, CP and margin beside it come from the edited run
    (`ResultsView.tsx:862`); `MassBreakdown` is fed `doc.rocket` while its sibling `GeometryInspector`
    gets `shownRocket` (`ResultsView.tsx:657`), and the Geometry caption points AT the stale panel by
    name while MassBreakdown claims "the same per-part masses the simulator flies".
  - **PARTLY RESOLVED this session — the motor sweep's launch-safety flags.** Rail exit rendered
    unflagged though the panel's own caption named the ~15 m/s rule and the Flight tab raised a
    caution for it; it is checked now, against the SAME threshold, which is one exported constant
    (`RAIL_EXIT_GUIDELINE_MPS`, with `LIFTOFF_TWR_GUIDELINE` beside it) rather than a literal in the
    engine and a second copy in the panel. So a motor can no longer pass unmarked here and caution
    once picked. Both existing flags were colour plus a `title` on a non-focusable `<td>` — no hover
    on a phone, unreachable by keyboard, nothing for a screen reader (WCAG 1.4.1), the whole signal
    in one colour channel — and are now a glyph plus an `sr-only` sentence in the row. The Delay
    column's per-row tooltip went too: it repeated one fact about the COLUMN on every row in an
    attribute nothing announces, and the caption already says it once.

    **Still open in this entry:** neither sweep row carries Mach or `extrapolatedTransonic`
    (`lib/sim/sweep.ts:82`), so the transonic candidate — the one a flyer is tempted by, because the
    table sorts apogee-descending — still presents as confidently as a subsonic one, against
    `app/docs/page.tsx:52`'s promise to warn. That is the larger half and is untouched.
  - **`.prose-loft table { display: block }`** (`app/globals.css:193`) drops every docs table out of
    the accessibility tree as a table, so `/docs/validation` — the page carrying Loft's own accuracy
    claims — reads as a flat run of numbers with no column names, in a scroll container with no
    `tabindex` for a keyboard user.
  - Rank 3–5, briefly: the flight-log Remove button is a 16 px target that unmounts itself on press
    (focus falls to `<body>`); the flight-log unit selects are 22 px and the sweep selects 34 px; the
    docs nav links are 28–30 px; `.rkt` simulation names keep a bracket when RockSim writes a
    trailing space; the rail-button mass path can never fire; `conditions.windDirectionDeg` reads
    `<launchroddirection>` while the real `<winddirection>` is read by nothing; RASAero `<Event1>`/
    `<EventType1>` are ignored (device 1 hardcoded apogee, device 2 altitude); `units` has no
    `loft.pref.*` entry while the theme, the MC sigmas and both sweep sorts do; the stored-vs-Loft
    table formats to 1 dp against the stat tiles' 0 dp; every warning string hardcodes SI while the
    tiles above it convert; the impact speed is called three different names across three surfaces;
    the MC histogram axis labels use the browser locale rather than `fmt`; the flight-path figure
    labels `p.x` as "down-range" while Drift is `hypot(x, y)`; `not-found`/`error` have no `#main`
    for the skip link and `<main>` has no `tabIndex={-1}`; the MC progress live region announces
    every batch; the parts-table hover read-out announces each row twice.

- **A rail length of 0 was flown, and the flight reported "Rail-exit velocity 0 m/s" beside it with
  no warning — RESOLVED this session.** The field's floor was `min={0}` and it took a 0 and flew it;
  `onRail` (`lib/sim/simulate.ts:953`) is `along < rodLength`, so a 0 m
  rail is left at t=0 with the motor yet to build thrust. Measured in the built export on the 54 mm
  dual-deploy sample: the design's own 2.0 m rail gives **28 m/s**, 3 m gives 35 m/s, and 0 gives
  **0 m/s** with nothing on the page saying the input could not mean anything. That is the number an
  RSO reads to decide the rocket leaves the rail flying, so a confident zero from an impossible input
  is the worst shape this can take. Fixed by giving `Num` a `positive` floor: the entry is refused in
  the words every other out-of-range entry already uses, naming what is flown instead.

- **Zero was not a value any design field could take, and the field said nothing when it dropped one
  — RESOLVED this session, per field.** `fromSpan`/`fromMass` in `LoftApp.tsx` mapped every entered
  0 to `undefined`, which is the spelling of "no edit", so a zero was indistinguishable from a
  cleared box. `lib/model/edit.ts` is the authority on which fields take one and it already made the
  distinction: every geometry edit is guarded `> 0` **except `finSweepLength`, which is `>= 0`**
  (lines 187 and 461) because a sweep of zero is a straight leading edge. So the one shape the model
  was written to accept was the one shape the editor could not build. Measured on the 54 mm sample:
  the design's own 90 mm sweep, typing 0, box left reading "0" while the flight went on using 90 —
  apogee unchanged at 2,941 m, where 0.5 mm moves it to 2,359 m. `payloadStation` is the second such
  field: station 0 puts the added mass at the fore edge of the body tube, where blank puts it
  mid-tube. Both now land; the fields whose unedited value is already zero (nose ballast, added
  payload, a drogue the design does not carry, either half of a boattail it does not have) fold a
  zero back to blank, since storing it would count as an edit and withhold the stored-tool comparison
  for a change that changed nothing; the rest refuse it out loud. Independent review of the diff put
  `boattailAftDiameter` in that middle bucket where the first pass had it refusing: `edit.ts:198`
  gates the two boattail fields as a PAIR, so a zero on either means "no boattail", which is what
  leaving both blank already means — and the refusal it raised read "flying < 2.205", quoting a bound
  as if it were the value in the flight.

- **The stored-tool comparison — the thing the landing copy promises — cannot appear on any bundled
  `.ork` sample, and nothing says why.** Measured across every `.ork` this session can reach (27 real
  corpus designs + the 3 shipped samples): **27 of 27 corpus designs carry `<flightdata>`; 0 of the 3
  samples do.** `demo-dual-deploy`, `demo-single-deploy` and `demo-multi-config` each carry a
  `<simulation status="external">` holding conditions and no results, so `hasResults` is false,
  `lib/sim/run.ts:187` skips validation, and `ResultsView.tsx:617`'s "comparison withheld" panel does
  not fire either — it is gated on `doc.flownAsReduced`. So the default first run shows nothing and
  explains nothing, under copy in `ImportPanel.tsx:285` that says "Loft shows its result beside those
  numbers rather than asking you to trust one." Note the three fixtures that DO carry external
  flight data — `demo-boattail`, `demo-payload-separation`, `demo-quirks` — are exactly the three
  that are not offered as one-tap examples. Fix by saying why on screen, reading the file's own
  `status` for the wording; do NOT invent stored numbers for the samples.

- **`ValidationPanel.tsx:20` states as fact something the shipped files contradict.** Its doc comment
  says `external` is "what the bundled demo designs carry: figures their author estimated, so the
  panel has something to demonstrate on." All three bundled demos carry `status="external"` with zero
  `<flightdata>`, so the panel has nothing to demonstrate on and never renders for them. The sentence
  was true of `fixtures/src/demo-boattail|payload-separation|quirks`, which are not bundled.

- **RESOLVED this session — an edit to `Payload pos` alone marked the design edited and withheld the
  stored-tool comparison for a change that changes nothing.** `addPayloadMass`
  (`lib/model/edit.ts:652`) returns the rocket untouched unless `massKg > 0`, but `hasActiveEdits`
  counted any defined value, so a payload station with no payload mass was a no-op that still cost
  the flyer the cross-check panel. It pre-dated the zero work and applied to every value, not just
  zero. `payloadStation` now joins `finSetId` in `INERT_EDITS`: it can never be the only thing that
  makes a design edited, because wherever the station matters the mass beside it is already set and
  already counted.

- **The model documents a fin tip chord of 0 as a delta and then refuses it.** `lib/model/edit.ts:96`
  says in as many words "Absolute fin tip chord (m) for a trapezoidal fin set (0 ⇒ a delta)", and the
  gates at :186 and :459 are `> 0`, so the zero is dropped before the solver sees it — the same shape
  as the `finSweepLength` gap fixed this session, one field over. `ParameterSweep.tsx:112` already
  reasons about delta designs ("Tip chord can be zero on a delta, which has no range to sweep"), so
  the rest of the app expects them. **Nothing in the corpus exercises it**: 0 of 36 `.ork`/fixture
  designs scanned carries a zero `<tipchord>`, and the from-scratch starter uses 0.06 m — so this is
  a BUILDER gap, not an importer one, and the "field refusing the value it advertises as flown"
  symptom an independent review predicted is not currently reachable. Fixing it is a model change
  (`>= 0` at both gates) and needs its own gate and corpus run: check `aero.ts` λ = ct/cr,
  `mass.ts`'s fin area, and `flutter.ts` at ct = 0 before flipping it, since a zero denominator is
  the obvious hazard.

- **Conditions exposes 4 of the 8 launch parameters Loft already models, and the other 4 are read
  from real files and flown where a flyer cannot see them.** Benchmarked against OpenRocket's
  simulation-conditions dialog, which is the tool a flyer would come from. `StoredConditions`
  (`lib/ork/adapt.ts:76`) carries `baseTempK` and `basePressurePa`; `lib/sim/setup.ts:363,365` carry
  `rodAzimuthDeg` and `windToDeg`, and `defaultConditions` sets all four. The `.ork` importer reads
  base temperature and pressure (`lib/ork/adapt.ts:795`) and the RASAero one reads Temperature and
  Pressure off `<LaunchSite>`. `grep -c` for any of the four in `components/LoftApp.tsx` returns
  **0**. So a design flown at 3,750 ft on a 95 °F day is flown with those numbers and the panel that
  exists to say what is being flown does not mention them. Wind DIRECTION is the sharpest: the
  surface-wind field's own hint says "Direction is a separate thing — a negative speed is not a wind
  from the other side", which names the gap without closing it, and drift bearing is what sizes a
  recovery walk. Nothing here is wrong; it is a surface that stops short of the model behind it.

- **RESOLVED this session — the footer's navigation links were 16 px tall on a phone.** They are
  `<nav>` links, not words in a sentence, so the WCAG "inline in a block of text" exemption never
  covered them — and the hit-target suite excluded the whole footer on exactly that reasoning, which
  is why the region was never reached. Re-measured on a 390x844 phone with a design loaded: GitHub,
  Docs, Motor Finder, Charge, Window and Muster now all **44 px tall**, the "A Fusion Space project"
  link 358x20 -> **358x44**, and desktop unchanged at 16 px because `TOUCH_TARGET` releases at `sm:`.
  The footer's PROSE credits (ThrustCurve.org, OpenRocket, ADA.gov) are deliberately left at 16 px —
  they sit inside sentences — and the new test asserts that too, so the line is drawn by structure
  rather than by region. A fresh phone walk of the whole app now reads: Flight **7 of 34** operable
  controls under 44 px (was 13), Design 8 of 83 (was 14), Analyze 7 of 37 (was 13); 0 px horizontal
  overflow everywhere; depths 5.5 / 4.5 / 3.5 screens. The original entry follows.
- **The footer's links are 16 px tall on a phone.** Measured on a 390x664 viewport with a design
  loaded: 13 interactive elements clear no 44 px minimum, and 5 of them are the footer's own links
  (GitHub 16x60, Docs 16x28, Motor Finder 16x71, Charge 16x40, Window 16x44). The header, tabs, unit
  toggle, what-if fields and shelf controls all pass — this is the one region the hit-target passes
  have not reached. The docs nav was flagged separately at 28 px. Same walk found no horizontal
  overflow, an offline reload that keeps the design with **0** failed requests, and workspace depths
  of 6.5 / 5.8 / 4.3 screens (Flight / Design / Analyze) — Flight is the one worth splitting first.

- **RESOLVED this session — RASAero and RockSim state a launch setup at DESIGN level, and Loft only
  ever read it from inside a per-simulation loop, so a file with no stored simulation lost it.**
  `lib/rasaero/adapt.ts:449` finds `<LaunchSite>` once, design-wide, but only reaches it through
  `storedSim(sim, site, i, id)` inside the per-simulation loop at :497. Measured on a corpus file:
  `rasaero__openrocket-repo-rasaero-threestage-cdx1__Three-stage rocket.CDX1` carries
  `<LaunchSite>` with `RodLength 12` (ft), `RodAngle 7.64`, `Altitude 3750` (ft) and `WindSpeed 0`,
  and a self-closing `<SimulationList/>` — zero simulations. Loft imports it with `simulations: []`
  and flies its own 1.0 m rail, 0°, 0 m instead: the rail is understated **3.66x** on the input
  rail-exit velocity is computed from, which is the number a pad check turns on. RockSim has the
  same shape — `rocksim__openrocket-repo-rocksim-threestage__rocksimTestRocket2.rkt` carries
  `<LaunchGuideLength>914.4</LaunchGuideLength>` at `<RocketDesign>` level, and nothing under `lib/`
  reads that tag; `lib/rkt/adapt.ts:618` reads only the per-`<SimulationResults>` `LaunchGuideLen`.
  Fixed by carrying the design-level block as a stored simulation with no results, in both adapters:
  the CDX1 now flies 3.6576 m and the .rkt 0.9144 m, with every other corpus design unchanged. The
  Conditions note still reads "Loft read no …" rather than "this design specifies no …" — keep it
  that way. The wording is not a workaround for the parser gap; it is the honest claim either way,
  since Loft cannot know what it failed to read, and the next format with a corner like this one
  will arrive before anyone notices.

- **The scenario toggle keeps a wind or elevation edit that the flight throws away, in a box the
  flyer cannot then clear.** `LoftApp.tsx:935` — the "As designed"/"Today" segmented control calls
  `rerun(edits, weather, s)` with `edits` untouched, while the OTHER entry point into the same state,
  `onWeather` at :939, deliberately drops `edits.windSpeed` and `edits.launchAltitude` first —
  because `compute` applies them and then overwrites both with the forecast. Repro: load the 54 mm
  dual-deploy sample, fetch weather for a site, click **As designed**, type Surface wind = 12 into
  the now-enabled field, click **Today**. The flight is flying the forecast; the box still reads 12,
  and `disabled={scenario === "today"}` means it cannot be cleared without leaving the scenario. The
  previous session fixed exactly this for the `onWeather` path and the entry beside it says the rule
  belongs one level up — this is the second door into the same room. The fix is to route both entry
  points through one function that decides what a scenario change does to the edit bag.

- **RESOLVED this session — see the entry at the top of this file, which carries the measurements.**
  The prescription below was right about the defect and right that the answer is per field; what it
  did not know is that `lib/model/edit.ts` had already written the per-field answer down, and that
  the same converter was hiding a REFUSAL as well as a design: a rail of no length was flown rather
  than refused. The original text follows.
- **`fromSpan` and `fromMass` map an entered 0 to `undefined`, so zero is not a value a flyer can
  set.** `LoftApp.tsx:1115,1110` — `v === "" || Number(v) === 0 ? undefined : …`. Blank already means
  "use the design's own value", so 0 has a spelling of its own to take, and for at least one field it
  is a real design: a fin sweep length of 0 is a straight leading edge. Typing 0 there silently
  reverts to the design's own sweep with nothing said. This is also the second half of the
  fin-thickness data loss fixed this session — that fix stopped the box from ROUNDING an entry down
  to "0.0", but an entry the flyer genuinely types as 0 still vanishes. Deliberately not changed in
  the same pass: it is a semantics change per field (0 g of ballast and 0 mm of nose are not alike),
  not a formatting one.

- **The boattail exit placeholder quotes a rounded bound as if it were the limit.** `LoftApp.tsx:1392`
  renders `` `< ${toDispSpan(designDims.bodyDiameter)}` ``, so a 0.0635 m body advertises "< 64" when
  63.5 mm is the ceiling: 64 mm reads as allowed and is wider than the body it exits. `Num`'s refusal
  message then prints it verbatim as "flying < 64", which is not a value. Round a QUOTED BOUND down,
  never to nearest — the rest of the round-trip work this session made the value fields honest and
  left this one bound behind.

- **The remaining `.toFixed` display paths that feed an editable box, after this session's two
  passes.** The census covered all 31 editable numeric fields (24 `<Num>` in `LoftApp.tsx`, 7
  `<NumberField>` in `MonteCarlo.tsx`). The four Conditions fields and the Design editor's shared
  `toDispLen`/`toDispMass`/`toDispSpan`/`toDispThick` now use `d.fmtEditable`. Still hand-rolled and
  unaudited: `MonteCarlo.tsx:91`'s `windDisp` (`mpsToMph(x).toFixed(1)`) — its own comment says the
  rounding is display-only and imperial-only, which is the same claim the Conditions fields made
  before they were measured. Measure it before assuming either way.

- **`Num` commits a value nobody typed.** `LoftApp.tsx:1755`'s re-sync effect writes the displayed
  text back into the draft whenever the field is not focused, and `commit` calls `onChange` whenever
  `String(Number(raw)) !== raw` — true for every trailing-zero string ("10.0" → "10", "0.010" →
  "0.01"). A bare Tab-through therefore writes to the model. It is value-preserving now that the
  display round-trips, so nothing is currently lost by it, but it is a live edit produced by focus
  alone and it trips whatever watches for edits. `NumberField` in `ui.tsx` does NOT have this shape —
  its `commit` returns early when `bounded === n` — so the two siblings disagree about what a commit
  is.

- **The sweep's DESIGN row can disagree with the flight on the next tab, and on one design it does so
  by 5.5x.** The sweep flies every candidate BALLISTIC (recovery removed) so the rows compare like
  for like, and the panel's footnote says so. But the row badged as the flyer's OWN design is the
  anchor every other row is read against, and on `FullScaleModelTH.rkt` it reads **1,888 m** while
  the Flight card one tab away reads **342 m** — that design opens a recovery device before apogee.
  Measured across all 39 corpus and sample designs whose surfaces are on: this is the only one where
  the gap exceeds 10%. It is not new behaviour, but it is newly ON SCREEN, because that design had no
  sweep at all until this session. Fix: when the design's own row departs from the design's real
  flight by more than a few percent, say so beside the badge ("ballistic — the stored flight deploys
  before apogee at 342 m"). The number is already computed on the Flight tab.

- **On a multi-stage design the swap picker varies something the same screen says cannot be varied,
  and a swap silently replaces EVERY stage's motor.** Newly reachable: `Complex.Two-Stage.CDX1` now
  gets the picker, while the Analyze tab on that same design explains that its tools are withheld
  because a staged design's "primary" motor is ambiguous — and `canSweepMotors` is gated on `!staged`
  for exactly that reason. The picker is not. Related, and measured on the same design: the sweep's
  DESIGN row is not the design's flight on a multi-instance configuration (1,813 m badged against
  1,491 m flown), because the swap replaces every instance rather than only the one the swap list was
  built for. Fix either by gating the picker on `!staged` the way the sweep is, or by swapping only
  the instance `designMotorIdentity` read and saying so.

- **RESOLVED — the motor tools now render on RockSim and RASAero imports. The fix was NOT the one
  this entry spent two sessions prescribing, and measuring that prescription is what killed it.**
  The defect as measured: the swap picker and the motor sweep rendered on **0 of 8** non-OpenRocket
  corpus designs with nothing on screen saying why, while the SAME rocket exported as `.ork` offered
  both (controlled pair: `OR vs RAS Test 1`, identical N1000W flight, 8,011 m vs 7,646 m). Both are
  gated on the motor casing diameter, and `lib/rkt/adapt.ts:554` and `lib/rasaero/adapt.ts:481,492`
  hardcode `diameter: 0`. Now the **picker on 5 of 8** and the **sweep on 4 of 8**, plus the bundled
  RockSim sample. Three designs name no motor Loft can resolve (two name none at all, one is
  RASAero's `1/4A2`), so they stay off rather than offer a list built on a guess; the fifth,
  `Complex.Two-Stage.CDX1`, gets the picker but not the sweep, held back by the pre-existing
  `!staged` gate at `ResultsView.tsx:349`, which does explain itself on screen.
  **Why "read `MotorDia`" was wrong.** This entry said to read RockSim's `MotorDia` and carry it as
  the mount's diameter, treating the catalog as a distant second-best. `MotorDia` is the mount's
  **bore**, not a casing size, and the two are different quantities: `FullScaleModelTH.rkt` declares
  76 mm on the mount of a 75 mm L1940X, and `demo-rocksim.rkt` declares 54 mm while flying a 38 mm
  J420R through an adapter. A bore is an upper bound, so filtering on it drops the design's OWN motor
  out of the very list of motors said to fit — the USLI design would have been handed 2 motors,
  neither of them the one it flies. RASAero states no casing anywhere: its only diameter near the
  motor is `SustainerNozzleDiameter`, the nozzle exit (2.737 in on a 98 mm N1000W).
  **What shipped instead** is in `lib/motors/swap.ts`: the casing of the motor the design ALREADY
  FLIES, looked up in the bundled catalog and gated on `resolveMotor(...).quality === "exact"`. That
  motor demonstrably fits this rocket, so a bundled motor of the same casing fits it too — the
  identical claim the `.ork` path makes from the file's own figure, and the file's figure still wins
  wherever it has one. The exact gate is load-bearing: a "designation" match is a bare two-way
  substring test, so `resolveMotor({designation: "H225-14A-8"})` returns an **Estes A8 at 18 mm**,
  and `411-I175-WH-14A` lands on a Cesaroni `411I175-14A` at 38 mm the same way. (An earlier version
  of this entry called that second one a "core" match at 29 mm. It is a "designation" match at
  38 mm — measured, not inherited.)
  Fixed alongside, because turning the sweep on for `.rkt` files exposed it: `motorSweep` badged
  DESIGN by bare designation, so the 18 mm sweep marked both the Estes C6 and the Quest C6 as the
  design's own motor while they fly measurably differently. It now takes the manufacturer too, and
  both spellings are produced by one function so they cannot drift apart.

- **RESOLVED — typing back the value a Conditions field advertises is now the no-op it looks like.**
  The deferred fix at the foot of this entry is what shipped: `d.fmtEditable` in `lib/display.ts`
  grows a reading a decimal at a time until it round-trips within 0.1%, so the advertised number IS
  the flown number. Measured in the built export on the 54 mm dual-deploy sample, imperial: the wind
  field used to advertise "7" against a flown 6.71 mph, and typing that 7 back moved drift 2,066 →
  2,155 ft (+4.31%); it now advertises "6.71" and typing it back is a 0.00% change. The same helper
  then went to the Design editor's `toDispLen`/`toDispMass`/`toDispSpan`/`toDispThick`, where the
  identical defect was destroying data rather than merely misstating it — see the fin-thickness note
  at the top of this file. **The rest of this entry is kept because its three sub-findings are still
  live and one of them is a separate open bug.** The original text follows.
  A Conditions placeholder is a READING of the flown value at the field's own display
  precision, not the value itself, and once it looked authoritative that reading became a trap. Rail
  length
  renders to 1 dp (3.048 m shows "3.0", 3.6576 shows "3.7", up to 1.6% off) and surface wind to whole
  mph in imperial (2.0 m/s shows "4", and 0.599 m/s on `Show-off.CDX1` shows "1", a 25% understatement).
  Typing the advertised number back is not the no-op it looks like: on `base-drag-hack.ork` in imperial,
  entering the advertised 4 mph moved drift from 149 ft to 133 ft (−11%), and it trips `hasActiveEdits`,
  which HIDES the stored OpenRocket/RockSim/RASAero comparison — the app discards its own validation
  panel in exchange for a value it had just claimed was in force. The old hardcoded "1.2" never invited
  that because it was obviously not the design's. Reproduced first-hand this session on
  `base-drag-hack.ork` in imperial: the wind field advertises "4", drift as flown is 149 ft, and
  typing that 4 back gives 133 ft with the OpenRocket comparison row gone.
  **A fix was written this session and REVERTED — do not repeat it.** It made `Num.commit` treat an
  entry equal to the placeholder as "leave it as it is". Three certain defects, all measured by review
  in the built app:
  1. **The premise is false where a placeholder is not a reading of the flown value.** `Payload pos`
     advertises `defaultPayloadStation` on the PRISTINE rocket, while `addPayloadMass` places a blank
     payload using the ALREADY-EDITED one. On the 38 mm sample, imperial: payload 16 oz, body length
     27.56 → 47.56 in, the field still advertises "23.62" while the payload sits at 33.62 in. Typing
     23.62 — the flyer pinning the av-bay where the field says it is — was swallowed; typing 23.63
     landed, moving CG 3.1 in and static margin 2.07 cal. That is a real, separate bug in its own
     right: **the Payload pos placeholder does not track the edited rocket.**
  2. **The advertised value becomes the only value that cannot be pinned**, and an entry is the only
     way to hold a condition constant while sweeping configurations. `USLI2025-FULLSCALE`'s five stored
     runs are a wind sweep at exactly 0/5/10/15/20 mph; on run #2 the field advertises "5", typing 5
     was swallowed, and switching configuration then moved the flight to 15 mph silently — drift
     1,318 → 2,139 ft. The placeholder there is EXACT, so the "it is only a rounded reading"
     justification does not even apply.
  3. **Enter left the box asserting a value not in force.** `commit` cleared the model but not
     `draft`, and the re-sync effect is gated on the field not being focused, so after Enter the input
     still read "4", styled byte-identically to a pinned edit, while the rest of the page said nothing
     was edited.
  The honest fix is the one deferred — **round-trip-safe display precision** on these fields, so the
  advertised number IS the flown number and typing it back is naturally a no-op — and that is what
  shipped; the measurements below are the pre-fix ones this entry was written from. `toDispSpd` renders
  imperial wind at 0 dp (2.0 m/s → "4" against a flown 4.47 mph, and 0.599 m/s → "1", 25% off) and
  `toDispLen` at 1 dp. Note also that the machinery for "your entry was not used, here is what is
  flown" already exists on the same field for out-of-range entries — whatever replaces this should use
  it rather than discarding an entry in silence.
- **A condition typed and then overridden by today's weather is only DISABLED, not cleared, on the
  other two fields' pattern.** Fixed this session for surface wind and field elevation — `onWeather`
  now drops those two edits, because `compute` applied them and then overwrote both with the forecast,
  leaving a greyed box reading 12 m/s against 7.4 m/s flown (2,518 m of drift advertised against 1,563 m
  computed). Worth checking whether any OTHER edit is silently overridden the same way when a scenario
  changes; `Num`'s own re-sync effect exists to guarantee a field never shows a number that is not in
  the flight, and that rule belongs one level up too.

- **RESOLVED 2026-07-31 — removing a design from the shelf is undoable, and this is the second attempt
  at it. The first was reverted; its six failure modes are why this one is shaped the way it is.**
  The defect: one tap on the shelf's "×" permanently deleted that design's stored bytes — 0
  confirmations, no undo, and it survived a reload (shelf 2 -> 1 entries, still 1 after reload) — on
  the surface that exists precisely because at the pad the .ork may not be on the phone at all, so
  those bytes can be the only copy. Sev-1 by the manual's second criterion, a one-way door, and it
  preempted the milestone. `HANDOFF.md` had reported the Sev-1 count as zero without counting it.

  **What shipped, and which of the six reverted failures each part answers:**
  - `restoreRecent` in `lib/session.ts` is its own insertion and never goes through `rememberRecent`.
    It keeps the entry's own `openedAt` AND the index it was removed from, so the row returns to the
    position it was taken from rather than to the front, including among rows that share a timestamp
    (the shelf's sort is stable, so an appended row lands after its tie-mates). It REFUSES, returning
    null and leaving the shelf untouched, when putting the row back would exceed either cap — and it
    returns the shelf as `loadRecents` would read it back, not the insertion order it wrote, because
    the caller renders what it returns. *(1: the reverted version replayed the add path, which caps
    and evicts by age; restoring a middle row into a full shelf put the row back and permanently
    deleted the oldest design instead — one destructive act undone by another.)*
  - **The byte cap exempts a single entry, exactly as `rememberRecent`'s trim loop does.** Found by the
    pre-push review, in the first version of this fix: `rememberRecent` KEEPS a design larger than the
    shelf's whole budget when it is the only one, so without the same exemption on the way back, a
    2 MB design could be removed and never restored — the one-way door rebuilt inside the fix for it.
    There is no import size guard, so a real design reaches it.
  - **A restore never replaces a row that is already on the shelf.** `recentId` is name-plus-byte-
    length, so two different files can collide; filtering the live row out and inserting the held copy
    would be a deletion wearing an undo's clothes, reachable from a second tab.
  - The offer renders OUTSIDE the shelf card, above the drop zone, beside the app's other undo.
    *(2: nested inside `{recents.length > 0 && …}` it unmounted with the shelf, so removing the LAST
    design — the case where the bytes are most likely the only copy — offered nothing.)*
  - An offer is dropped when that design is back on the shelf by any route, rather than every offer
    being cleared on every load. *(3: an offer left standing resurfaced for a design removed several
    designs ago — but clearing the lot, which is what the first version of this fix did, meant
    reopening a DIFFERENT design one click later made the removed one unrecoverable, which is the same
    no-way-back in a smaller window. Keeping the rest is safe because `restoreRecent` refuses rather
    than evicting and never overwrites a live row, so a stale offer can only ever be refused.)*
  - **The refusal is reported beside the button, not in the page's shared error strip**, which renders
    below the whole import fragment — a control whose only feedback is a sentence a screen away is a
    control that silently does nothing. The offer's container carries `role="status"`, because pressing
    "×" destroys the focused control and renders the offer somewhere else on the page.
  - Nothing reorders on the ordinary open path; `rememberRecent` is untouched. *(4.)*
  - The pending removals are a LIST, so two taps in a row — what a mis-tap looks like — leave both
    designs recoverable. *(5: holding one offer silently destroyed the first design's way back.)*
  - The copy says what was removed and what it cost, and the refusal path says why it could not go
    back and what to do about it. *(6.)*

  Pinned by five cases in `lib/session.test.ts` (position preserved, the last design, two removals in
  either order, and both refusals) and by the e2e *removing a design from the shelf is undoable,
  including the last one*. Every one was proved able to fail by a negative control applied inside the
  function under test, with its build exit checked — including one that was rewritten because the
  first version of its clear-on-load assertion could not fail.

- **Offline, the RocketPy panel blames itself instead of the network.** With no signal it says
  "RocketPy couldn't run: The RocketPy worker crashed." — the truth is that the ~40 MB Pyodide runtime
  is not precached and cannot be fetched. `/pyodide/` appears in 0 of the 34 service-worker cache
  entries, `navigator.onLine` is false throughout and is never consulted, and the "downloads ~40 MB the
  first time" hint is shown only in the idle phase, so the single clue that a download was needed is
  removed by the very failure that explains it. The weather path on the same screen already gets this
  right ("Couldn't fetch weather (offline, or the service is down)") — 1 of the 2 network-dependent
  features names the connection. A flyer will re-tap a button that cannot succeed.
- **The Flight card's stat tiles put the two things you most need to read at the two smallest sizes.**
  On a phone every read-out's label is 11 px and 15 of 25 render the unit at 12 px against a 20-24 px
  value — the unit is 50-60% of the value's size. 118 of 239 visible text nodes on that workspace are
  under 12 px (28 at 9 px). Metric and imperial are both offered and 630 m of drift is a different
  recovery walk from 630 ft, so a big number whose unit you cannot read in sunlight with gloves on is a
  number you can act on wrongly. Distinct from the known /docs sub-12 px note, which is prose and
  formula subscripts.

- **SETTLED — offline works, and the earlier doubt was my probe, not the app.** Under HARD offline
  (140 wire requests aborted, 120 of them service-worker-originated; control: /robots.txt returns 504
  len=0, so the offline was real) all six precached routes — `/`, `/docs`, `/docs/faq`,
  `/docs/methods`, `/docs/limitations`, `/docs/validation` — serve http=200 `fromServiceWorker=true`
  with byte-identical body text (faq 24,742 chars, methods 40,884, limitations 32,256), CSS applied,
  React hydrated, 0 uncaught errors. The routes precache within 7 ms of `serviceWorker.ready` (34 cache
  entries). The previous session's "it fails" came from calling `setOffline(true)` before the worker
  activated. **And the whole pad check completes offline:** a cold boot of `/` renders the import panel
  and the shelf, one tap on a shelf row reopens a design in 3.06 s reading Apogee 2,941 m, descent
  5 m/s under main, drogue 16 m/s, drift 630 m, and an offline round trip to /docs and back (454 ms
  out, 1,544 ms back) restores the design and the open workspace. It stops nowhere.

- **RESOLVED a different way this session — leaving a design is now undoable.** Kept for the six
  traps it documents, because they are about the recents shelf's identity and eviction model and every
  one of them is still true of that shelf. What shipped instead is a single "discarded session" slot:
  `reset()` stores the session it is about to clear, and the import screen offers to pick it back up.
  No shelf identity, no eviction, and restoring is the same operation as resuming a session — which is
  why traps 1, 2, 3 and 6 cannot apply to it. The ORIGINAL entry, with the traps, follows.

- **[SUPERSEDED — the shelf-based approach, and why it was reverted.]** The defect: "Import another" (and "Start fresh",
  same `reset`) is one click that discards the design, every what-if and the session with no
  confirmation, and the recents shelf — the apparent way back — returns the airframe with an empty edit
  bag. Measured on the 38 mm sample: a 75 mm fin span and 20 g of nose ballast take apogee 993 m ->
  881 m, and reopening returns 993 m with `session.edits` `{}`. The reopen path's own comment says it:
  "the shelf remembers designs, not experiments."
  The attempted fix — `RecentDesign` gains `edits`/`simIndex`, `reset` stamps them, `onOpenRecent`
  resumes them, and the shelf badges "N changes" — works for the happy path (verified end to end: badge
  reads "2 changes", reopening returns 881 m with both fields back) and is NET NEGATIVE because of six
  things, all reproduced in the built app by review before it was pushed. A confirmation dialog is NOT
  the answer either; it asks the flyer to approve the loss rather than preventing it.
  1. **It makes the protected entry the eviction victim.** `loadDoc` skips `rememberRecent` when a
     `resume` argument is present (`if (bytes && !resume)`), so an entry carrying edits never bumps
     `openedAt`. Reopening it leaves it at the BOTTOM of a newest-first shelf, and `sort(openedAt)` +
     `slice(0, MAX_RECENTS)` then drops it first: with 8 entries, reopening the trimmed one, working in
     it, leaving it and importing one more design deleted it outright — design bytes and trims — while
     six untouched older entries survived. `MAX_RECENTS_BYTES` (2.5 MB) reaches this at ~5 real .ork
     files. Before the change a reopen always bumped the timestamp, so the design in hand could never be
     evicted. **This turns "your trims are dropped" into "your design is deleted" and is why it was
     reverted.**
  2. **Every from-scratch design shares one shelf id.** `recentId` is name + base64 length, `onNew`
     always passes the literal "New design", and `exportOrk(newDesign())` is byte-identical, so the id
     is always `New design:5436`; renaming changes `doc.rocket.name`, never `fileName`. Verified:
     building a design, trimming it, leaving it, then starting a second build and leaving that one
     replaced the first entry — and for a built design the shelf's bytes are just the generic starter,
     so the edits bag IS the rocket. The collision was harmless before; carrying state makes it
     destructive. The FAQ's "a build with several variants on the go" cannot hold two builds at all.
  3. **Any reopen that is not the shelf row wipes the stamp.** `rememberRecent` rebuilds the entry from
     `{design, name, rocket}`, so clicking the sample button below the shelf, or re-dropping the same
     file, overwrites the entry with no `edits` field. Verified: badge present, one click on the sample,
     badge gone permanently.
  4. **`editCount` is not the app's own definition of edited.** `finSetId` is a SELECTION — `hasActiveEdits`
     excludes it deliberately ("counting it would withhold the stored-tool comparison") — but it is a
     real string, so merely clicking a parts row badges an as-designed rocket "1 change", and it cannot
     be cleared because "Reset to as-designed" never appears for it. Whatever counts must go through
     `hasActiveEdits`'s notion, not `Object.keys`.
  5. **Today's-weather is a what-if and is not carried.** `editsActive = scenario === "today" ||
     hasActiveEdits(edits)` and "Reset to as-designed" clears both, but only `{edits, simIndex}` is
     stamped and `loadDoc` unconditionally does `setWeather(null); setScenario("design")`. A flyer who
     geocodes their field and trims against real air gets no badge at all and design-day air back.
  6. **The shelf's own caption contradicts it.** `ImportPanel` says "Reopening one flies it as saved;
     any what-if edits you had set are not part of the design" directly under the new badge. The FAQ was
     updated and this was missed — the caveat in one place and the confident claim in another, on the
     surface where the decision is actually made.
  Two implementation notes worth keeping: `loadRecents` rebuilds each entry field by field, so a field
  named only on the interface is written cleanly and silently dropped on the next read; and the edit bag
  is a patch spread over the previous bag, so a CLEARED field leaves its key holding `undefined` and any
  count must filter those out (`JSON.stringify` drops them on the way to storage, so an unfiltered
  count also disagrees with what comes back).

- The flight-data CSV keeps thrust, drag and dynamic pressure in SI while its kinematic columns follow
  the unit toggle, so an imperial flyer reads max-Q as psi on the Flight card and 19,100 (Pa) in the
  export of the same flight. Every column names its own unit so nothing is ambiguous, and a physics
  record in newtons and pascals is a defensible choice — the docstring now states that reason instead
  of the stale one ("matching how the app shows them", which stopped being true this run). Worth
  revisiting only if a flyer asks for a fully imperial export.

- **The Conditions placeholders advertise a launch setup that is not the one being flown**, and this is
  the next thing to fix. The four are hardcoded literals ("1.2", "0", "0", "0") while the caption below
  them says "Blank fields use the design's stored launch conditions", and the fields ARE blank on
  import. `Num`'s own contract makes the placeholder a CLAIM about what is flown — "else the design's
  own value, which is what the placeholder shows", and `flown = String(value ?? "") || placeholder`
  prints it verbatim in the refusal message as "flying X" — so a wrong placeholder makes that message
  lie. Two measurements: a corpus file stores a 5.1816 m rail against a placeholder of 1.2 (rail-exit
  14 m/s advertised vs 29 m/s stored, on a launch-safety number) and 5.0 m/s wind against 0 (drift 0 m
  vs 1,307 m); and a from-scratch design flies `defaultConditions().rodLength` = 1.0 m, so the
  placeholder overstates the rail by 20% and rail-exit velocity by 10% — 64 ft/s blank against 71 ft/s
  at the advertised 3.9 ft, verified live. **A units-only fix here was tried this run and reverted on
  purpose:** converting the literal to "3.9" for imperial is arithmetically right and makes a wrong
  claim PLAUSIBLE, which is worse than the self-evidently broken "1.2 ft" it replaced. The fix is to
  derive all four placeholders from the resolved conditions the flight actually used, which means
  threading those into the Conditions panel — it does not currently receive them. The corpus-file
  numbers are the cold walk's and are not re-measured here; the from-scratch numbers are.
- **RESOLVED — `Num` DOES enforce its declared bounds; the old entry here was stale and had been
  carried forward unmeasured for three sessions.** Measured first-hand this session on the 38 mm
  sample, all four Conditions fields plus the Design what-ifs: of the 24 numeric inputs on screen,
  7 declare a max and **7 of 7 clamped a 10x-over-max entry** on commit, each setting
  `aria-invalid=true` and rendering exactly one refusal message naming what is flown instead — rail
  200→20 m, angle 450→45°, wind 400→40 m/s, elevation 50,000→5,000 m, cluster 120→12, fin count
  120→12, recovery 100→10x. All 24 declare a min. The enforcement lives in `Num`'s `commit`, which
  runs on blur or Enter; a probe that types without committing sees the raw text and concludes
  otherwise, which is the likeliest source of the original claim.
- The Flight card shows max acceleration in g (`d.accel`, system-neutral) while the stored-vs-Loft
  comparison table shows the same quantity in m/s² — now ft/s² in imperial. Both are labelled and
  neither is wrong, but they are two units for one number on one page: 15 g against 145.1 m/s² on the
  38 mm sample. Routing the comparison row through `d.accel` too would settle it, at the cost of
  changing what metric readers see.
- `d.lengthMm` renders one decimal of an inch, so a diagram handle reads "2.4 in" where the field
  beside it reads "2.39" — the same value at two precisions. The handles now match the figure's own
  caption, which is the consistency that mattered; aligning the field would mean changing the caption
  too, so it is a deliberate follow-up rather than a leftover.
- Re-running the RocketPy cross-check discards the previous comparison on FAILURE, though no longer on a
  stop: `phase: "error"` renders the failure and the preserved result together now, but a second failure
  after a success still leaves the flyer with a traceback where the "before" used to be. The result is
  held outside the phase as of this run, so this is a rendering-gate question, not a data-loss one.

- **Information that exists only in a `title=` never reaches a phone.** Measured this run on the
  results view at 412x915: 33 elements carry an explanation the visible text and any `aria-label`
  don't — the four Conditions field teachings (rail length, rail angle, surface wind, field
  elevation), the `<abbr>` behind a flagged stability margin, the motor-match quality badge, the
  parts-table sort headers, and the design-name and export buttons. A native tooltip does not fire
  on touch, so on the form factor the project describes as a pad check with gloves on, a flagged
  margin gets no explanation at all. The range half of this is fixed (a one-sided range now reads
  "0 or more"); the teaching half needs a real disclosure, not a `title`. Re-measured: 0 inputs lack
  an accessible name, so the older note claiming four do is resolved.
- The refusal sentence says "flying 0", which is right for the six dispersion inputs and slightly
  wrong for the seventh field it now also covers: a waiver ceiling is not flown, it is compared
  against, and 0 there means "no ceiling set". The actionable half (refused, range is 0 or more) is
  right in both. Fixing it means one more parameter on `refusedMessage` or a per-field verb — worth
  doing only alongside a third caller, not on its own.
- **A third value-entry surface still takes a number without a range: the diagram drag handles.**
  Both typed what-if fields now refuse an out-of-range entry and name what is flown instead, and
  they share one sentence (`lib/what-if.ts`) so they cannot drift. The handles reach the same edits
  by a different gesture and have their own bounds logic — worth checking they agree with the
  fields, since a flyer who learns the rule by typing will expect it when dragging.
- The diagram has no ceiling on its rendered height, so a large fin span or body diameter grows it
  without bound. Re-measured this run at 1440x900: of the 17 unbounded fields only TWO move the
  diagram's height at all — fin span (273 px -> 16,091 px at 5000 mm) and body diameter
  (273 -> 8,217) — so the earlier "any of 17 fields" note overstated it. One extra keystroke (600 for
  60) gives 2,002 px, which is degraded rather than catastrophic; the 16,091 px case needs a value
  two orders out. The honest fix is a ceiling on the FRAME rather than a max on the input, since a
  big fin is physically meaningful and the project does not refuse meaningful values — but the
  "To scale" caption keeps promising fidelity while the picture is nonsense, so whatever bounds the
  frame has to change that caption too.
- The diagram drag handles freeze their range at grab time: pulling fin span up 30 px moves 29→41 mm
  and the next 30 px moves nothing (6 consecutive samples at 41), with `aria-valuemax` jumping 41→58
  only on release. Half a long drag is dead travel.
- **RESOLVED 2026-07-30 (R1) — `primaryFinSetName`'s positional fallback.** It numbered by
  `flattenRocket` order while the parts table beside it can be re-sorted by name/type/station/mass, and it
  named one component while the fields edit a whole appearance-group. Replaced by `AimedPart {name, station,
  covers}`: the design's own name where that distinguishes the part, otherwise its STATION — true under
  every sort — and the group size stated outright. Pinned by `lib/model/edit.test.ts`'s `naming the part the
  fields are holding` suite. The old function is gone, so this entry describes code that no longer exists.
- **NARROWED 2026-07-30 (R2) — undo exists for REMOVALS, and only for removals.** Deleting a part is
  undoable by name (`Restore <part>`), because `removedIds` is an ordered list and the model rebuilds from
  the pristine design. Everything else is unchanged and the entry still stands for it: Ctrl+Z after a handle
  drag does nothing, a typed dimension and a motor swap cannot be stepped back, and the only escape from
  those is still "Reset to as-designed", which discards every edit at once. Ten flights in, that is still a
  stack of trims and one all-or-nothing exit. **This is what remains of R2's *done when*** and the shape is
  already right for it: every edit is a value in one bag applied to a pristine design, so an undo stack is a
  stack of `Edits` snapshots in `LoftApp`, not a diffing problem.
- Parts table gaps measured this run: every column sorts one direction only (a second click returns
  to design order, so there is no lightest-first), there is no Copy or CSV while Mass & balance, the
  motor sweep and the parameter sweep all have both, and the sort order is not persisted though the
  motor sweep's is (`loft.pref.motorSweep.sort`). Mass & balance has no sortable columns at all, and
  in imperial 4 of its 9 rows collapse to `0 lb` while the % column still shows real values.
- Cancelling an analysis is now measured rather than assumed, and the old entry here overstated it.
  The RocketPy cross-check HAS a Stop as of this run, and it ends the runtime rather than the wait. The
  other three do not, and on the evidence they should not: the motor sweep, the parameter sweep and the
  Monte-Carlo finish in 0.3-2.2 s on both the 38 mm sample and a USLI fullscale design, so a Stop there
  is a control nobody reaches. `runMotorSweep`/`runParameterSweep`/`runMonteCarlo` all already take an
  abort predicate and return their partial rows, so if a design ever IS slow enough to need one, the
  seam exists — but it would have to come with an honest "stopped after N of M" label, because a
  partial sweep presented as a whole one is worse than no Stop. What is still missing on those three is
  PROGRESS, not cancellation: the two sweeps report only `aria-busy` while the dispersion study says
  "152/300 flown". The parameter sweep also offers no range or step control — 25 points over an auto
  range, so "sweep 40-60 mm at 1 mm", the tenth-use question, cannot be asked.

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
- Phone, re-measured at 412x915 / DPR 2.6. The operable controls now clear 44 px on every workspace
  and an e2e case holds them there. What is left is text rather than controls, and needs a different
  answer than a bigger box: the 5 /docs sub-nav links at 30 px and 10 footer links at 16-20 px are
  line-height-bound, and the inline prose links with them. Every view exceeds two viewport
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
  framing constraint dressed as a property limit. Note the handle's ARIA numbers are in DISPLAY units
  as of this run, so that 5–84 reads 0.2–3.3 under imperial — measure in metric or convert.
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
- **RESOLVED — the corpus gates CI.** The fetch was wired (`fixtures.lock.json`,
  `scripts/fetch-fixtures.mjs`, an npm script and a CI step) and waiting on a `FIXTURES_TOKEN`
  repository secret, which the owner has now set. Verified from the `frontend` job's log rather than
  from the secret existing: `imports every design file (35 present)`, three corpus tests green in
  20.0 s, census medians matching a local run. So `PUBLISHED_MEDIAN_PCT` is a live gate now — an
  accuracy regression past `CENSUS_SLACK_PCT` fails CI where it previously skipped — and the network
  branch of the fetch, the one branch never exercised from this sandbox, is exercised on every push.
  Remaining, and small: the **`e2e` job does not fetch the corpus**, so e2e tests still need committed
  fixtures. Adding the step is two lines; it is not done because nothing uses it yet, and whichever
  test first needs it must skip itself when the corpus is absent or every fork's CI goes red.
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
- **The shared chrome above the workspace spine is 1071 px on a short phone, and it is what breaks
  DESIGN.md §8's two-screen contract.** Measured 2026-08-01 at 390x664 with the bundled sample,
  identical on all four workspace routes: header 73, toolbar 68, restore banner 112, collapsed
  Conditions 44, design summary 508, warnings 74. That is **1.61 of the two screens** spent before a
  workspace renders a pixel, leaving 0.39 for the route's own answer. `/sweep` does not fit — its
  first swept-motor row lands at 1393 px = **2.10 screens** — and is pinned as a `test.fail` in
  `e2e/depth.spec.ts` so it runs, measures, and goes red the day it is fixed. `/flight` (1.53),
  `/design` (1.55) and `/validate` (1.70) pass. The design summary is the single largest term at
  508 px, against 316 px on desktop; DESIGN.md §8 says desktop and touch are separate designs over
  one model, so collapsing it to a disclosure on a coarse pointer — the pattern Conditions already
  uses at 44 px — is the obvious move and would return ~460 px to every route at once. Do this
  BEFORE the persistent design strip (`COMPETITION.md` row 31): the strip costs a phone another
  130–160 px, which is more than the remaining budget on `/sweep`.
- The recents shelf's destructive control sits flush against its open control — `Remove <design>`
  (44x44) and `Reopen <design>` (247x44) share an edge with a **0 px gap**, joined deliberately as a
  split control (`ImportPanel.tsx:201-239`). A thumb aiming at Reopen can hit Remove. Two things
  that were claimed about this and are NOT true, checked before filing: DESIGN.md carries no
  destructive-separation rule for it to breach, and the removal is **not** unrecoverable —
  `onForgetRecent` (`LoftApp.tsx:737`) deliberately holds the entry and its index, and a "put back"
  affordance renders from `removedRecents` (`ImportPanel.tsx:96-114`). So this is a craft issue about
  mis-tap cost on a glove, not data loss.
- **A throwaway probe left in `lib/` silently joins `npm test`.** `vitest.config.ts` includes
  `lib/**/*.test.ts`, and `.gitignore`'s own comment acknowledges that a session's diagnostics "live
  in the tree only while they run" — so while one exists, the gate's test count is not the suite's.
  Hit for real on 2026-08-01: a read-only fan-out held six probes in `lib/corpus/` at once, and a
  `npm test` run during that window would have reported a number that was not 961 and could have gone
  red on somebody else's scratch file. The `.gitignore` rule covers the SUFFIX form (`*-tmp.*.ts`)
  only; the same session named its probes with a `tmp-` PREFIX and they showed up untracked, one
  `git add -A` away from being committed — which is the exact accident that rule exists to prevent.
  Two candidate fixes, neither measured: widen the ignore to cover both orderings, or give probes a
  directory outside `lib/` that vitest does not scan. The second is better if an explicit
  `npx vitest run <path>` still works from there; check, because `include` filters explicit paths too.
- **The nose picker's caliber filter matches nothing on a metric airframe, and that is the
  catalogue rather than the filter.** Measured 2026-08-02 against `demo-single-deploy.ork` (38.0 mm):
  **0 of 854** catalogued nose cones sit within the picker's own 0.5 mm tolerance — 0 at 1 mm, 18 at
  2 mm, 231 at 5 mm. The cones are imperial stock (SEMROC 573, Estes 95, BalsaMachining 76) across
  103 distinct base diameters from 7.14 mm to 296.16 mm. The filter is off by default and the empty
  state says how to clear it, so nothing is broken — a flyer sees every cone and picks one. What is
  missing is that the tool does not SAY why the fitted list is empty, which reads as a bug in the
  filter rather than as a fact about what SEMROC sells. **Do not widen the tolerance to hide it**: a
  2 mm mismatch is a real mould-line step and the flight already names it, so a looser fit would be
  inventing agreement the vendor does not publish. The honest fix is an empty state that names the
  nearest stock sizes. Note the 0.5 mm is shared with `searchParts`' own fit clauses, so it cannot be
  changed for one surface alone.
- **There is still no nose-cone aim slot, and it is a latch rather than a wrong number.**
  `AIM_SLOTS` has no nose entry, so `withoutRemovedAims` can never clear `catalogNoseCone`,
  `noseLength` or `noseShape`. Checked before filing: the migration this causes for body tubes is NOT
  reachable for cones today — all 41 corpus and fixture designs import with exactly one nose cone
  (the two `.ork` files carrying 2 and 3 `<nosecone>` elements lose their pod cones on import),
  `AddedPart` cannot author a nose, and an added stage does not mint one. What IS reachable: remove
  the only nose while a pick is live and the three fields stay in the bag with no way to clear them,
  because the picker unmounts — so undoing the removal silently re-applies the pick. Add the slot
  before the third kind lands; it is the cheap prophylactic, and the body-tube version of this was a
  shipped defect.
