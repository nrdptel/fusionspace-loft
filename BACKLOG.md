# Backlog

Rough edges, missing affordances, and ideas too big for one pass — noticed while working,
not yet done. Newest first. One line each. Anything here is fair game for the next session.

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
  - **Winds-aloft direction is interpolated without a 0/360 wrap** (`lib/weather.ts:131`):
    `dir = a + (b - a) * f` straight into `windVector`, no unwrap anywhere. For a 350°/10° pair,
    f=0.5 gives **180°** where the truth is 0° — the vector exactly reversed, wind from due south
    where it blows from due north. `LEVELS` is deliberately dense at 1000/975/950/925 hPa, the band
    recovery drift lives in, and the profile fully replaces the surface wind under "Today".
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

- **`npx tsc --noEmit` fails on `e2e/smoke.spec.ts:3538`** — `Property 'labels' does not exist on
  type 'SVGElement | HTMLElement'`. Pre-existing and outside the gate (`npm run lint` and
  `npm run build` both pass, and neither typechecks the e2e directory), so nothing is broken today,
  but it means a whole-project typecheck is not currently a usable check. Narrow the locator or cast
  to `HTMLInputElement`.
  - **RASAero recovery `<Size1>`/`<Size2>` are read as canopy diameter in FEET with no bound.**
    `Complex.Two-Stage.CDX1` states Size1=12, Size2=24 on a 4.06 lb rocket: as feet that is a 7.32 m
    main and a 3.66 m drogue giving **0.94 m/s** under the main. Either the unit is wrong or the
    file is; nothing in the import says which, and no bound catches a canopy four times the rocket's
    length. Related: `planBooster` reads only Booster 1 — `IncludeBooster2`, `Booster2Engine`
    (`Show-off.CDX1` carries `A6Q (QU)`) and friends are read by no code, and the drop is not counted
    in the `droppedBoosters` warning. And `lib/motors/db.ts:114` has `Q` and `QUEST` but not `QU`,
    the code RASAero actually writes, so a two-character maker key can never match.
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
  - **The motor sweep flags two launch-safety rules and stays silent on the third.** Rail exit
    renders unflagged (`MotorSweep.tsx:314`) though the panel's own footnote names the ~15 m/s rule
    and the Flight tab raises a caution for it. Neither sweep row carries Mach or
    `extrapolatedTransonic` (`lib/sim/sweep.ts:82`), so the transonic candidate — the one a flyer is
    tempted by, because the table sorts apogee-descending — presents as confidently as a subsonic
    one, against `app/docs/page.tsx:52`'s promise to warn. Both existing flags are colour + a `title`
    on a non-focusable `<td>`: no hover on a phone, nothing for a screen reader (WCAG 1.4.1), and the
    flutter threshold appears in the tooltip string and in no visible copy.
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

- **An undo for removing a design from the shelf was written this session and REVERTED — read this
  before rewriting it.** The hit target is fixed (44x44 px, verified at 390x844 and 412x915, 0 of 4
  shelf controls now under target, 0 px horizontal overflow) but the destructive act still has no way
  back, which is inconsistent with leaving a design, whose undo shipped this session. The attempted
  fix kept the removed row in memory and offered "Put it back". Six reasons it did not ship, every one
  reproduced in the built app by review after a green gate of 677 unit and 119 e2e:
  1. **The restore can silently fail, or evict someone else.** It replayed `rememberRecent` with the
     row's ORIGINAL `openedAt`. That needed `rememberRecent` to order by `openedAt` instead of
     prepending — and then the restored entry sorts LAST, so `slice(0, MAX_RECENTS)` drops the very row
     the call was made to restore: storage byte-identical before and after, the banner clearing as if
     it had worked. Restoring a MIDDLE row into a full shelf restored it and permanently evicted the
     oldest design instead. **The restore path must not go through the add-and-evict path at all.**
  2. **Removing the LAST design offered no undo**, because the banner was nested inside
     `{recents.length > 0 && …}` and the whole card unmounts when the shelf empties — the one case
     where the deleted bytes are most likely the only copy. Verified: `Put it back` rendered 0 times.
  3. **The pending offer was never cleared** on load/reopen/import, so it resurfaced later for a design
     removed several designs ago, and pressing it then rewrote a LIVE entry's timestamp backwards —
     demoting the design just opened to first-evicted.
  4. **Ordering by `openedAt` changed the ordinary open path**, not just the undo: any stored entry
     stamped ahead of `Date.now()` (a phone clock that was fast, then corrected) now outranks the
     design being opened, and with a full shelf that design is not recorded at all.
  5. **Two removals in a row silently destroyed the first pending undo** — the natural sequence after a
     mis-tap, since the delete targets sit at 0 px from their Reopen neighbours in a wrapping list.
  6. **The copy was wrong in both directions**: "undoable until you leave this screen" over-promised
     (it vanished with the shelf) and under-described (the state outlived the screen indefinitely; only
     a /docs round trip dropped it, because that is a hard navigation in the static export).
  A working shape: keep the in-memory row, render the banner OUTSIDE the shelf card, clear it on any
  design load, and give the restore its own insertion that never evicts and never reorders — not
  `rememberRecent`. Leave `rememberRecent` alone; it is on every open path.
- **The shelf's Remove "×" WAS a 24x44 px destructive control welded to a 240 px Reopen target with a
  0 px gap — the hit target is fixed as of this session; the missing undo above is what remains.** One tap permanently deletes that design's stored bytes: 0 confirmations, no undo, and it
  survives a reload (shelf 2 -> 1 entries, still 1 after reload). Measured at 390x844 and 412x915,
  identical on both: the destructive control is 9.1-9.5% of its row's width with a 14 px glyph, and 2
  of the 4 shelf controls under 44 px are both this one. The shelf exists precisely because at the pad
  the .ork may not be on the phone at all — those bytes can be the only copy. This is now the sharpest
  remaining one-way door, and it is inconsistent with its own neighbour: leaving a design ships an undo
  as of this session, deleting one from the shelf does not.
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
