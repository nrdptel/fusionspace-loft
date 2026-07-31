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
  2. **The dispersion stat tiles diverged from the flight stat tiles they mirror.** `MonteCarlo.tsx:537`
     is now 12 px radius / 16 px pad / `bg-zinc-50` at 291×105; the Flight tile it echoes
     (`ResultsView.tsx:1317`) is still `rounded-lg … p-3 bg-white` at 8 px / 12 px / 299×93. Before the
     conversion both were 8 px + 12 px and differed only in fill. They are the same object to a flyer —
     label, big number, range. This is transitional (the Flight tiles are among the 15 `rounded-lg`
     still to convert) but it is visible now, and converting them closes it.
  3. **`RocketpyCrossCheck`'s three run-outcome notices now have three geometries.** The stopped notice
     converted to 12 px / 16 px; the stale-amber `:272` and failure-red `:306` are still
     `rounded-lg px-3 py-2`. They alternate in the same slot, and a flyer reads shape before colour.
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

- **Converting the 35 remaining `rounded-lg` breaks print unless the stylesheet changes with it.**
  `app/globals.css` carries a print rule keyed on `.rounded-lg` (`grep -n 'rounded-lg' app/globals.css`),
  so a sweep of the class through `components/` and `app/` silently drops whatever that rule does to the
  printed page. Noted here rather than fixed because the sweep itself is a later P1 slice; whoever takes
  it changes both in the same commit.

- **A motor-resolution chip carries a verdict at chip size.** `ResultsView.tsx:992` renders "exact /
  approximate / unmatched" for every motor the run resolved, in emerald/amber/red at `text-xs`. `DESIGN.md`
  §5 sizes `Chip` at `text-xs`, so this is on-system as written — but the thing it states is whether the
  simulator flew the flyer's actual motor, and if it did not, every number below it is about a different
  rocket. Either it is not a chip (it is a `Readout` with a provenance caveat), or §5 needs a status
  token that is allowed to be body-sized. Filed rather than decided, because it is a `DESIGN.md` change
  and that file is shared with the sibling app.

- **BLOCKER — "Download .ork" silently drops the motor the flyer picked, and the saved rocket flies 48%
  lower.** Recorded on 2026-07-30 by a cold walk of the from-scratch builder, harvested here from a pull
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

- **A freeform fin's outline is discarded on export, and no trapezoid can stand in for it — R6 work,
  with the measurements already taken.** `lib/ork/export.ts` writes a `freeformfinset` as the
  equal-area trapezoid, tip = 2·area/height − root. That solution is negative whenever the planform
  tapers hard, and the tip is then clamped to zero with the root kept, so the exported fin is LARGER
  in area than the one drawn. Measured 2026-07-31 over all 35 corpus designs: **8 carry a freeform
  set and 6 of those shift static margin through a download/re-import — median 0.080 cal, worst
  0.685 cal on `Pods--airframes and winglets.ork` (2.13 → 1.45), whose "Wings" set comes back 42%
  bigger in area.** No design without a freeform set moves at all.
  **Shrinking the ROOT to 2·area/height instead was built, measured and REVERTED the same day**, and
  the reasons are the value of this entry: (1) a zero-area planform — which `planformFromPoints` can
  produce from collinear points — writes a root of 0, and `finContribution` drops a fin set with no
  root, so the set VANISHES from lift and drag (measured: 2.44 → 1.53 cal on the starter, ~0.9 cal
  with no warning); (2) a fin set's `axialLength` IS its root chord, so under a `bottom` or `middle`
  anchor a shorter root translates the planform down the tube — `Pods`' "Wings" moved **52.4 mm aft**
  — which is an unlabelled change to a build number; and (3) the margin it produced looked better only
  because of that displacement, since compensating the offset gives 1.28 cal, worse than either.
  **The real fix is to stop discarding the outline**: retain the `<finpoints>` on the model at import
  and write them back, which makes the round trip lossless instead of choosing which way to be wrong.
  That needs `GenericFinSet` to carry the points it currently reduces away, and it belongs to R6 ("a
  built design leaves Loft intact"). Disclosed on `/docs/limitations` with its size in the meantime.

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
  velocity" at y=1157 — 174% of a screen down**. The stated phone use is a pad check with gloves on, and
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
