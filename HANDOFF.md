# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Pick up first

**NOTHING IS IN FLIGHT. Ten increments merged and deployed, no open PR, no unreproduced Sev-1 —
the first genuinely clean slate in several runs.** Start from `ROADMAP.md` and the two tracks.
Where they stand:

- **R-track: the mass override is on the canopy and on all five internal kinds.** What remains is
  the nose cone (26 non-Loft masses across the corpus) and the body tube (13) — the same five pieces
  (bag key, applier, aim-slot target, control, undo label) against a different slot. **Measure before
  picking the next one**: this run's guess was "nose cone and body tube next", and counting the
  corpus by kind said the five internal kinds carried 45 between them, nearly double either. The
  probe is six lines over `massFrom`. **Read `chuteTargetId` in `applyDimensionEdits` first** —
  every field a slot aims must be listed in that condition or the applier silently falls back to
  "the primary part", which is right on a one-of-a-kind design and wrong the moment there are two.
  That bug was live in increment 9 until a pre-push read of the diff.
- **P-track: P13 is met and the airframe strip (`COMPETITION.md` row 31) shipped on desktop.** The
  next P pick is open. Widening the shared `DESIGN.md` digest to §1, §2, §3 and §11 is the cheapest
  real candidate and is now a routine change. **The strip left one thing genuinely undone and it is
  worth doing properly rather than quietly:** a phone gets no persistent drawing at all, because at
  390x664 it costs the sweep's answer its second screen. That is the right call today and it is not
  the end state — a phone-shaped answer (a collapsed rail that expands, or the drawing docked to the
  spine itself) is a design question nobody has scoped.

**Three things this run learned that are worth more than any one of its increments:**

1. **Ask whether a user can REACH a defect before scoping it.** The Sev-1 screen filed
   `compare.ts`'s missing `landed` gate three times over eight days; it was right about the code
   every time and never asked. Measured: 115 stored corpus runs, 6 unlanded, all 6 already gated by
   `hasPropulsion`, and `LoftApp.tsx:533` withholds the comparison from any edited design — so the
   edit needed to stop a flight landing is the edit that removes the comparison. **Meanwhile the
   reachable defect was a third sentinel nobody had enumerated**: `deploymentVelocity` is 0 when
   nothing opened, and a flight with nothing out lands fine, so it clears every gate the landing
   pair trips. One unedited corpus file published *"RockSim 33.4 m/s · Loft 0.0 m/s · −100%"* and
   reported that design's mean error as 48.74% where its comparable metrics disagree by 42.33%.
   Compare the two candidates: one took an hour to disprove, the other a minute to confirm, and the
   difference was one question.
2. **A disabled check is indistinguishable from a passing one.** `eslint-config-next` never extended
   ESLint's recommended set, so 61 rules were off for the life of the repo and a duplicate `case`
   shipped. The bill for turning them on was two genuine errors. Assume nothing about a tool that
   reports success — `lib/lint-config.test.ts` and `lib/design-doc.test.ts` exist for the same
   reason.
3. **Read your own diff before pushing, even on a green gate.** Two of this run's real findings came
   from that pass and from nothing else: the canopy-aim bug above, and a comment I had written that
   asserted the opposite of what a `<select>` actually does.

<details>
<summary>The two Sev-1 candidates in full, for anyone re-reading the ledger entries</summary>

1. **RESOLVED — but not where the screen kept pointing, and that is the transferable part.** The
   Sev-1 screen filed `compare.ts`'s missing `landed` gate three times over eight days. Run 9 ruled
   it **latent rather than reachable**; I re-derived that independently and **run 9 was right**:
   `components/LoftApp.tsx:533` withholds the stored comparison from any edited design, and the edit
   needed to stop a flight landing is exactly that edit. Measured: 115 stored runs, 6 unlanded, all
   6 already gated by `hasPropulsion`. **The reachable defect was a third sentinel nobody had
   enumerated** — `deploymentVelocity` is 0 when nothing opened, and a flight with nothing out lands
   fine, so it clears every gate the landing pair trips. `rocksimTestRocket1.rkt [E6-2]`, unedited,
   published *"RockSim 33.4 m/s · Loft 0.0 m/s · −100%"* and reported that design's mean absolute
   error as **48.74%** where its comparable metrics disagree by **42.33%** — the fault made Loft look
   *worse* than it is, on the accuracy page. **The lesson: the screen read the code correctly every
   time and never asked whether a user could get there.** Reachability is the first question, not the
   last one.
2. **ALSO RESOLVED — and it took one reading, because there was no gate in front of it.** A bare
   `Altitude` header matches `isAltitudeHeader` and yields `unitHint: null`, and the path from there
   is "a flyer uploads a CSV" with no `edited` flag or propulsion guard anywhere in it. Both pickers
   showed Loft's guess exactly as they show a stated unit, and the altitude guess is between two
   while the SPEED guess is between four. Fixed by marking the assumption at each picker and putting
   a caution on the number that names what it would cost, rather than withholding — the flyer may
   well have the right unit, and the house precedent for a value resting on a default is
   `descentWhy`'s caution, not a blank. **Contrast the two candidates deliberately when you next read
   a Sev-1 filing:** one was unreachable behind two unrelated rules and took an hour to disprove; the
   other was reachable by construction and took a minute to confirm. Reachability is cheap to ask and
   it is the question that separates them.

</details>

**PR #155 AND #156 ARE BOTH MERGED.** #155 is live (`23659a5`, deploy confirmed by fetching
`/docs/methods` on loft.fusionspace.co); #156 squashed to `4d1512f` after CI ran green on both jobs.
Its sibling, `nrdptel/fusionspace-debrief#170`, is merged.

1. **#156's CI silence resolved itself and the cause is worth keeping.** No run fired for `0ba149d`,
   `7346ff1` or `9d55c8b`; the cause was that `main` had moved under #155's squash, leaving the PR
   un-mergeable — GitHub cannot build a merge commit for a `pull_request` event, so it produces no
   run at all rather than a failing one. Merging `origin/main` into the branch started a run
   immediately. **A PR with no CI run at all is a merge-conflict symptom, not a CI outage.**
2. **P13 is 3 of 3 in Loft and its `done when` is met**; what remains is widening the shared span,
   which the mechanism now makes a routine change. `lib/design-shared.test.ts` holds §4, §6, §7, §8 and
   §10 to one digest in BOTH repos. §1, §2, §3 and §11 are next: they differ only in clauses one copy
   has taken and the other has not.
3. **R12's mass override SHIPPED on the parachute slot; the remaining kinds are the same shape.**
   `parachuteMass` is a bag key, an applier, a readback, a control and an undo label — the whole
   vertical slice — and the caption beside it names whose figure is being flown. **The next kinds are
   a copy of this, not a design problem**: nose cone and body tube are the two with real demand after
   the canopy. What CANNOT be copied is a universal per-part override: `aimEditsAt` returns the FIRST
   matching slot and a green test forbids one kind routing to two, so a universal target cannot be a
   peer slot — it needs the keyed bag the flat `GeometryEdits` cannot express, which is its own
   milestone. **Read `chuteTargetId` in `applyDimensionEdits` before adding the next one**: every
   field aimed by a slot must be listed in that condition or the applier silently falls back to
   "the largest/primary part", which is right on a one-of-a-kind design and wrong the moment there
   are two. That bug was live in this increment until a pre-push read of the diff, and the
   dual-deploy case that catches it is in `edit.test.ts`.

## Read this first

**The pre-push agent review is worth more than the gate, and this run is the strongest evidence yet.**
Over three fully green gates it found: an exporter minting a component id TWICE (7 freeform fin sets
on 6 corpus designs went out under a fabricated hash); a new model field riding `structuredClone` onto
parts Loft invents and then into the flyer's file; a `DESIGN.md` exception that bought a permanent
carve-out for **zero pixels** (CSS clamps a corner radius to what its edge can hold, so on a 12x8 px
chip every radius at or above 4 px renders as 4 px); a design-system check that could not see the one
file holding the control radius for every button in the app; and **seven wrong provenance marks** on
the mass work, three of them claims the design file does not support. Not one is visible in a passing
suite. Give it the diff and nothing else, and ask it to refute.

**`add_repo` with `access: "push"` for `nrdptel/fusionspace-debrief` SUCCEEDS.** The previous run
recorded it as refused and parked the whole design-system reconciliation on the owner; it was never
blocked. Attach the sibling FIRST whenever `DESIGN.md` moves.

**A check can name one literal and read green over the whole class it was written to catch.** §9's
radius grep named the middle radius; with it at 0, the tree held seven off-system radii, five of them
one hand-rolled treatment. Enumerate the class and SUBTRACT what is allowed. And read the right text:
over raw source a class pattern reads English prose (18 hits across the docs routes); over `class="…"`
attributes only it cannot see a class composed through `cx(…)`, which is how every primitive here
writes its own. String literals with comments stripped is the answer.

**Do not trust a quick corpus measurement taken with `execSync`.** A first count of the author notes
returned 23 across 11 files and was wrong: node's default 1 MB `maxBuffer` silently truncated the
larger designs. The real figure is 40 across 18, which is what the repo already said.

## The environment, measured 2026-08-09/10 (run 9)

- **Both fixture and sibling repos are reachable.** `loft-fixtures` is on disk at session start;
  linking its five per-tool directories into `corpus/` gives the suite its full **35 fixtures**, and
  the sweep names that count in its own test name.
- `npx playwright install chromium` was needed again — **seventh consecutive run**, one minute and
  114 MB. It belongs in the environment's setup script. Parked for the owner.
- The clone is SHALLOW; any commit count is a window, not the record.
- Git identity arrives as the harness vendor's default and must be set per-repo before the first
  commit. Commits sign correctly once it is.
- `test.yml` fires on `pull_request` and on a push to `main`, not on a working-branch push — and see
  point 1 above: it did not fire for PR #156 at all.
- The e2e suite still needs two shards on this sandbox (127 + 126). **One flake this run**, recorded
  rather than waved through: `depth.spec.ts`'s *"desktop: the workspace spine stays within 820px of
  the top"* failed once inside a full shard-1 run and then passed three times — alone, as a whole
  file, and in a repeat of the same full shard. Filed in `BACKLOG.md`; the failure message names the
  route and the pixel figure, so the next occurrence is worth capturing rather than re-running.
- **Playwright serves the BUILT `out/`, not the sources — so the gate's order is load-bearing and
  editing between `npm run build` and `npm run test:e2e` silently tests the previous build.**
  `playwright.config.ts:38` runs `npx serve` over `out/`. Cost me one confused debugging round on a
  new e2e case that failed with the element genuinely absent from the page while the source rendering
  it was correct. It fails in the safe direction here (a stale pass is a stale FAIL for new
  assertions) but the reverse — editing a fix and re-running e2e without rebuilding — would report
  green on code that was never served. Rebuild before every e2e run you intend to believe.

## This run — thirteen increments, twelve merged and deployed, one on PR #163

| # | what | where |
|---|---|---|
| 1 | The notes a design file carries survive Loft — 81 across 22 of the 35 designs | merged `23659a5` |
| 2 | Sev-1: a rail button imported at 0 kg on all 9 in the corpus | merged `23659a5` |
| 3 | The queue's state; P13 opened because the P-track had run dry | merged `23659a5` |
| 4 | P13/1 — `DESIGN.md` is read by the gate | merged `23659a5` |
| 5 | P13/2+3 — a `Swatch` primitive, a radius rule the gate can see, one digest over both repos | merged `4d1512f` |
| 6 | R12/7 — the parts table says which masses the design stated | merged `4d1512f` |
| 7 | The validation table stops scoring a sentinel — one live row, and the headline error it moved | merged `d0c81cd` |
| 8 | A flight log's unit says whether the file named it or Loft guessed | merged `a8e5df7` |
| 9 | R12/8 — a canopy can be given the mass it was weighed at | merged `2d66012` |
| 10 | The linter runs the 61 rules everyone assumed it was running | merged `43dae0f` |
| 11 | P/row 31 — the airframe stays on screen while you work in another workspace | merged `f98a59f` |
| 12 | R12/9 — the internal structure takes a weighed mass, on the slot with the largest gap | merged `a1428b1` |
| 13 | The identify line says where a mass came from — the last surface that did not | PR #163 |

Verified against production, not just against `main`: `/docs/validation` serves increment 7's
sentinel paragraph, `/docs/methods` serves increment 9's canopy-mass section, and increment 8's
*"the file's header does not name a unit"* is present in the deployed JS chunk. Deploy fires on push
to `main` and was confirmed by fetching the live site, not assumed from a green merge.

**Increment 7 is the one to read if you read one.** It is the only one that came from *reproducing* a
filed claim rather than from the queue, it overturned two of this repo's own prior conclusions (run
9's "latent" ruling stands; the Sev-1 screen's three filings pointed at the wrong metric), and it is
pinned by a corpus census that names the single row it changes. `lib/sim/withheld.ts` is new and is
where a reason for a withheld figure now lives for every surface.

## The corpus, stated plainly

**35 design files**, and every check added this run asserts its own denominator so a re-cut cannot
leave one passing on nothing: 81 author notes, 332 stated component ids, 54 external fittings, 108
stated masses / 60 from the source tool / 401 Loft's own, and 332 parts compared by id across a round
trip.

## What is waiting on the owner

Two entries in `OWNER-NOTES.md`'s *Awaiting the owner*: the Playwright browser in the setup script
(seven runs), and the repository-page settings. A third was ANSWERED by measurement this run — push
access to the sibling — and is marked as such rather than deleted.

## The previous run (2026-08-08, earlier the same day)

### The environment, as the previous run measured it

- `node_modules` absent at session start (~90 s). **The managed Playwright browser chromium-1228 was
  absent again** — `/opt/pw-browsers` had 1194 — and `npx playwright install chromium` fixed it in
  about a minute. **Fourth consecutive run to report this.** Both are paid for again every session
  until they are in the environment's setup script, which is the owner's fix and nobody else's.
- The fixtures repo WAS attached. The suite names `imports every design file (35 present)`, and the
  corpus sweep is green — so every "0 findings" below is from a sweep that examined something.
- The clone is **shallow**, so any commit count here is a window, not the record.
- Commits are signed and the identity is `Neer Patel <135655563+nrdptel@users.noreply.github.com>`,
  set per-repo before the first commit. It arrives as the harness vendor's default; set it every run.
- **The session-restore flake is real and was seen TWICE this run, on two different specs.** Both
  times a route was asked for its own panel and timed out at ~30 s with "element(s) not found" —
  `e2e/touch.spec.ts`'s pad-states walk once, and `e2e/depth.spec.ts`'s desktop spine once — and both
  passed in isolation and on a clean re-run, with the phone twin of the second passing in the same
  shard. **The signature is a 30 s TIMEOUT on a missing element, not an assertion about a number.**
  An assertion failure naming a measurement is yours; a wait that expired is the restore racing the
  navigation. Re-run before believing it, and do not run agents during e2e.

- **4 cores, and the orchestration layer competes with the gate for them.** The opening fan-out ran
  17 agents at a concurrency of 2 and took ~50 minutes wall-clock; while it ran, a `npm test` that
  takes 185 s alone took over 8 minutes. `MAINTAINING.md` already says not to run subagents during
  e2e; the same is true of the unit suite on this box. Dispatch the fan-out, then do LOW-CPU work
  (reading, writing docs, scoping) until it lands — not gate cycles.
- **Markdown WAS scanned by Tailwind, and is not any more.** Confirmed by controlled experiment
  (appending two unused utilities to `ROADMAP.md` grew the stylesheet 65,895 → 66,254 bytes), then
  fixed by adopting the sibling repo's `@source not "../**/*.md"` — which that repo has had since
  2026-07-31. The shipped stylesheet went **65,895 → 63,278 bytes**, 2,617 bytes of dead rules
  generated from prose. `MAINTAINING.md`'s workaround bullet is updated to say so. A ledger entry may
  now name a class plainly; `lib/` is still scanned on purpose.

### That run — eight increments, all merged

| # | SHA | what |
|---|---|---|
| 1 | `8a8ab23` | **P7 SHIPPED** (from `ON-1`) — the docs, readable in the theme the visitor is actually in, plus the two checks that were missing |
| 2 | `8a8ab23` | **The triage** — twelve verdicts, eight milestones, R4 annotated rather than re-opened |
| 3 | `8a8ab23` | **R11 SHIPPED** (from `ON-2`) — a scratch build that goes downrange and says whose assumption the wind is, plus a plot that explains a flight with no down-range instead of drawing one on its own axis |
| 4 | `8a8ab23` | **The pre-push review's blocker** — the Monte-Carlo nominal was a hand-copy of the old wind default, so the dispersion flew 0 m/s beside a Flight card flying 2 |
| 5 | `d67d85b` | **Scan the code, not the prose** — taken from the sibling; 2,617 bytes of dead CSS the ledgers were generating |
| 6 | `d67d85b` | **R12 increment 1** — the design's tree is visible; `flattenRocket` carries depth, parent and stage |
| 7 | `d67d85b` | The done-check, and what production actually serves |
| 8 | `4df4d45` | **P10 increment 1** — the README says what Loft imports, and two of its claims now fail the build when they stop being true |

### Its done-check

**What can a flyer DO after this run that they could not before? (R-track)**

1. **Read the documentation.** On a dark-OS device with no theme chosen — the default state — all six
   docs routes served body prose at **1.91:1** and headings at **1.12:1**. Verified against
   production's own bytes after the deploy: every prose colour now resolves to its dark value and the
   worst ratio anywhere is **6.67:1**, against WCAG AA's 4.5. That is the owner's `ON-1`, fixed and
   live.
2. **See a scratch build go somewhere.** A from-scratch design flew 0.00 m downrange and plotted as a
   vertical line on its own axis. It flies 411.3 m of drift now, on a 2 m/s default taken from the
   corpus's own median, stated on screen as Loft's assumption rather than the flyer's setup — and
   where the answer genuinely is a vertical line, the plot says so instead of inventing an axis.
3. **See the design's structure.** The parts list showed a flat list; three quarters of a real
   design's components sit at depth ≥ 1, so most of the topology was invisible. It renders the tree
   now — indented in design order, with the host named in words in every order.

**What is measurably better about using the tool? (P-track)**

- Worst docs contrast in the default theme: **1.12:1 → 6.67:1**, measured on production.
- Shipped stylesheet: **65,895 → 63,278 bytes** on the exclusion change alone — 2,617 bytes of rules
  generated from ledger prose rather than from any component. It stands at **63,476** at the end of
  the run; the 198 bytes back are R12's own new `text-xs` on the host line, i.e. a real utility a
  real component asks for, which is the difference the exclusion exists to preserve.
- Unit **1,110 → 1,114**; e2e **234 → 243**; corpus cases **28 → 30**.
- `DESIGN.md` §9 gained its first check that reads a rendered COLOUR rather than a class name —
  closing a blind spot the file itself had already recorded twice.
- §9's counts are otherwise unmoved and at target: rounded-lg 0, card treatments 3 (the recorded
  honest floor), off-scale spacing 0, off-scale type 0, inverted files 0, hand-rolled dropdowns 0
  (three shell hits are prose comments, exactly as §9 anticipates), `text-[11px]` 41, 18 adopters.

**What is NOT better, stated rather than implied.** R11's *"labelled axis"* clause is not met — the
flight-path plot still has no tick labels on either axis and still fabricates a one-unit range, so
the fix is a caption and a sentence rather than an axis; it is filed with the measurement. R12's
parts list is still collapsed by default and selection still does not drive the property surface,
which is the whole point of the milestone. And the ledger's historical Sev-1 labels were NOT
re-audited this run: the ledger's own entry says that count "does not survive contact" and is a
reading list rather than a Sev-1 count. What was checked is narrower and is written up — three
Sev-1-shaped claims from the fan-out (round-trip id loss, drag-coefficient re-attribution, a +22.4%
apogee move) did not reproduce on any real file, and two latent ones (`compare.ts`'s missing
`landed` gate, the unwritten `<customreference>`) are real but unreachable today.

### Its arc table (superseded by the one above)

| milestone | state |
|---|---|
| R1–R8 | SHIPPED 2026-07-30 → 2026-08-03 |
| R9 — the descent Loft cannot defend | SHIPPED 2026-08-04 |
| **R10 — the corpus comparison Loft can defend** | **IN PROGRESS** — only `maxAcceleration` remains of Size item (5) |
| **R11 — a scratch build flies somewhere** (from `ON-2`) | **SHIPPED 2026-08-08** — both increments, four pinning checks, two negative controls |
| **R12 — the component tree the flyer sees** (from `ON-6`/`ON-7`/`ON-5`/`ON-4`) | **NOT STARTED.** The batch's largest item, and the R-track's centre of gravity now |
| P1–P5 | SHIPPED 2026-08-02 → 2026-08-03 |
| P6 — the primitives the design system declares | SHIPPED 2026-08-05 |
| **P7 — readable in every theme** (from `ON-1`) | **SHIPPED 2026-08-08** |
| **P8–P12** (from `ON-3`, `ON-B1`, `ON-B2`, `ON-8`, `ON-9`) | **NOT STARTED**, all decomposed with *done when*s and pinning checks. The P-track is no longer dry |

### What it said to pick up first

1. **R12 — the component tree.** All four editor-shape notes converge on it, and the decisive
   measurement is already taken: **the model ALREADY carries the tree** (`children` on every
   component, parent-relative `Placement`), so this is a UI milestone, not the architectural pivot
   `ROADMAP.md` feared. What is missing is a surface and a selection concept. The scoping numbers are
   in `COMPETITION.md` row 39: 75.6% of a real design's components sit at depth ≥ 2, **55.8% have no
   hit target on the drawing at all**, 46.8% have no editable field of any kind, and every add
   control sits behind one `kind === "bodytube"` guard so ~85% of parts offer nothing.
2. **P8 — the phone stands the rocket up.** Fully scoped with four measurements that each kill an
   obvious wrong turn; the sharpest is that the grips' `axis` prop means SCREEN axis, so rotating
   without re-basing it inverts six of eight controls AND the `aria-orientation` a screen reader
   announces.
3. **R10's last item, `maxAcceleration`**, is still open and still scoped in `ROADMAP.md`.

### What it said was waiting on the owner

**Three** entries in `OWNER-NOTES.md` under *Awaiting the owner*, all cheap and none blocking: the
repo's GitHub description/website/topics are empty and a session cannot set them (paste-ready values
are in that file); whether Loft's header should adopt the motor finder's two-row shape; and that the
motor finder's own repo is not attached, only its live site — which is the one `ON-B1` needs answered
to read the reference implementation rather than infer it from rendered output.

**The shared-`DESIGN.md` invariant is HONOURED this run — the first time in four.** A change to that
file is meant to be a change to both repos in the same run, and three previous runs reported it as a
gap because the sibling was out of scope. It is not: `nrdptel/fusionspace-debrief` is listable and
pushable, and **attaching it mid-run costs one tool call and one shallow clone**. The §9 contrast
rule is merged there (that repo's PR #144). Do this whenever `DESIGN.md` moves.

**Two things that only became visible with both repos attached, and neither was findable from inside
one of them:**
- **The sibling had already fixed a hazard this repo was working around.** Its stylesheet excludes
  markdown from Tailwind's scan and has since 2026-07-31; Loft was still writing class names broken
  up in prose to avoid regenerating them. Adopted here, 2,617 bytes of dead CSS removed.
- **The two copies of `DESIGN.md` have drifted by ~369 diff lines** — five button weights there
  against three here, and different descriptions of `Panel` and `Section`. Filed in `BACKLOG.md`,
  sized at 2–3 increments. It needs both repos attached, which is now known to be cheap.

**Measured while there: the sibling does NOT carry the dark-mode defect.** Zero `:where(.dark)` rules
and zero hand-written colour declarations in its stylesheet — every colour comes through a utility
that gets both clauses. So `ON-1` was Loft-only, and that is a measurement rather than an assumption.

## Two runs ago — ten increments, four Sev-1s, R9 closed (2026-08-04)

| # | SHA | what | verified by |
|---|---|---|---|
| 1 | `b7dd9f9` | **SEV-1** — an out-of-envelope flight said so on ONE surface of six | 4 unit cases, each proved able to fail by reverting its own carrier |
| 2 | `77d0882` | **SEV-1** — an edit the solver refuses was half-applied | an e2e proved to red on the old ordering |
| 3 | `71bbba0` | The caveat finished — the two surfaces #1 missed, one module owning the wording | the six defects a pre-push review found, each verified first |
| 4 | `a163034` | **R9 inc 6** — RockSim's landing-speed comparison corrected | census: rocksim **25.7% → 21.9%**, no engine change |
| 5 | `08623e5` | **P6 inc 1** — `Readout` lifted from `ResultsView`'s local `Stat` | 227 e2e unmodified, proving the DOM is unchanged |
| — | `b8a6c40` | **merged to `main` as #125** — the five above reached production | both CI jobs green; frontend log names `imports every design file (35 present)` |
| 6 | `6794bed` | **SEV-1** — a design with no recovery device raised no warning at 2,970 J | a case stripping every device; reds when the gate is reverted |
| 7 | `675422e` | **SEV-1** — one fin returned an EMPTY warning list at 1.639 cal | fin counts 1,2,3,4,6 — fires on the first two, silent on the rest |
| 8 | `069a1b2` | **P6 inc 2** — `Select`; every dropdown in the app is one treatment | adoption ratchet + a source count of zero hand-rolled `<select>` |
| 9 | `081e775` | **R9 inc 5** — the canopy Cd is editable and re-flies | an e2e that changes it and watches ground-hit speed fall |
| 10 | `1201499` | **R9's last clause** — descent figures on a FALLBACK Cd carry the marker | 229 e2e |
| 11 | `a0e567e` | R9 SHIPPED, R10 written, `COMPETITION.md` row 35 RESOLVED, §9 fixed | the §9 counts, re-run |

**Reached production: 5 of 11. The rest are on the branch.**

**R9's premise was wrong TWICE, and both corrections were measurements rather than opinions.**
Increment 3 disproved the parachute-Cd hypothesis. Increment 6 then found the RockSim half was not
physics at all: RockSim stores the TOTAL ground-frame landing speed (verified as hypot of its own
three component tags on 17 of 17 stored sims) while Loft reports the VERTICAL descent rate, so the
comparison was wrong in one direction by construction — which is the "86 of 92 descend slower"
signature nobody could explain. **R9 also refuted a clause of its own *done when*:** it asked for
"catalogue part" as a Cd origin, and 0 of the 151 catalogued canopies publish one.

**What is left of the 21.9% is partly not Loft's**, and R10 is written around it: 11 of the 17 `.rkt`
rows are one design's plugged-motor ballistic runs pooled with canopy descents, and that file stores
**83.6 m/s and 162.0 m/s for eleven runs of the same configuration**.

**Environment, re-measured today.** `node_modules` absent (~90 s). The managed Playwright browser
**chromium-1228 was absent again** — `/opt/pw-browsers` had 1194 — and `npx playwright install
chromium` fixed it in about a minute. Both are paid for every session until they are in the
environment's setup script, which is the owner's fix. The fixtures repo WAS attached: the suite names
`imports every design file (35 present)`, confirmed in CI's own log too. `tsc --noEmit` is red on
`main` with **9** errors (not the 3 the last handoff recorded), all in `lib/model/edit.test.ts`,
invisible to `npm run build`.

**One invariant could not be honoured, and it is the owner's to close.** `DESIGN.md` is shared
verbatim with the sibling repo and a change to one is meant to be a change to both in the same run.
This session's GitHub scope was `nrdptel/fusionspace-loft` and `nrdptel/loft-fixtures` only, so the
§9 edit landed here alone. Filed in `BACKLOG.md` with the two blocks to port.

## This session — sixth run (2026-08-03) — nine increments, all now on `main`

| # | SHA | what | verified by |
|---|---|---|---|
| 1 | `29d8fc0` | Two Sev-1s: the partial-cluster warning could never fire on a cluster, and every loaded figure was published as if a missing motor were aboard | corpus sweep, 129 single-motor removals across 35 designs with a negative control naming the 5 the old code missed; e2e asserting no margin VALUE survives on the page |
| 2 | `b295895` | P4 inc 4 — the touch ratchet reaches the selection-gated surface, and the motor sweep can apply the motor it recommends | both §8 counts over the gated surface; an e2e walking all three pad journeys, asserting the Use control is on screen at 390 px and that the swap is undoable |
| 3 | `f55516c` | R8 inc 6 — a real commercial parachute can be chosen; landing speed spans 2.16–18.15 m/s across the catalogue | six cases in `edit.test.ts` incl. a negative control; an e2e driving the whole gesture and the clear path back |
| 4 | `79a72a6` | P4 inc 5 — the diagram gets a full-height tap column per body part | e2e asserting 44 px height on every column, ≥40% reach, distinct selection, and that a fin set is still selectable — with a negative control |
| 5 | `6cbaa5d` | R8 inc 7 — a coupler and a centring ring can be authored, sized from the corpus rather than alike | 7 cases in `edit.test.ts` incl. two negative controls; corpus sweep over all 35 designs; e2e reading the Station column back |
| 6 | `36d811d` | **Sev-1** — a motor that does not fit the mount is refused instead of flown, and the refusal explains itself | catalogue-wide probe (2,271 withheld, 0 promoted); corpus no-regression over 105 stated casings; e2e on a new fixture asserting the copy |
| 7 | `0bc50ea` | **Sev-1** — the `.ork` export carries the launch setup, so a downloaded design reopens on its own conditions | 3 cases in `export.test.ts`; e2e reading drift off the page, with a negative control that reads `0m` |
| 8 | `8c8d31a` | A reported Sev-1 re-measured and REFUTED, and the test gap under it closed | e2e pinning the landing caution at both thresholds and the silence below them |
| 9 | `PENDING` | **Sev-1** — a flick starting on a diagram grip no longer scrolls the page while it edits the design | e2e driving REAL touch through CDP, with an off-handle control and a negative control |

**Gate at the end:** lint 0 errors / 1 standing warning · **1043 unit across 55 files** · build ·
corpus **35 design files / 24 tests / 0 findings**, census medians unmoved · e2e **110 + 110 = 220**,
which is the suite's full count. `DESIGN.md` §9 unmoved: rounded-lg 0, card treatments 3 (recorded
floor), off-scale spacing 0, off-scale type 0, inverted files 0, adoption 17/27.

**Sev-1 count in `BACKLOG.md` at the end of the run: ONE open, three fixed, one refuted.** Two cold walks of the built export found them and they are the top five entries in that
file: the `.ork` export drops every launch condition and the motor configuration on a round trip
(drift from pad 630 m → 0 m); an unmatched motor is substituted with one that does not FIT the mount
and the whole flight is reported off it; a one-tap parachute pick can produce an unflagged 18 m/s
descent on a page that DOES police thrust-to-weight and rail exit; the validation CSVs carry no units
and the same filename holds metric or imperial; and an ordinary one-thumb scroll that starts on a
diagram drag handle both scrolls AND drags. The motor-fit and export ones were taken this run
and are closed. **Take the rest before the roadmap queue** — that is what `MAINTAINING.md` says a
Sev-1 does. The parachute one is the cheapest of the three left: `/flight` already writes a caution
for thrust-to-weight and for rail exit, so recovery is the one side of the same panel with no rule.

**Three process lessons from this run, all of which cost real time:**

- **A cold walk is a bug-FINDER, not an oracle — re-measure every finding before it becomes work.**
  Of the eleven this run's two walks produced, one was flatly wrong and it was filed as a Sev-1: "a
  one-tap parachute pick produces an UNFLAGGED lawn dart … the Flight page carries zero cautions".
  The solver has raised `hard-landing` above 7.6 m/s since long before the parachute picker, and the
  page renders it — driven in a browser it reads "descends at about 18.1 m/s … a hard landing that
  can damage the airframe", at the walk's own figure. Re-measuring took twenty minutes; taking it at
  face value would have been an increment spent "fixing" working behaviour. The entry in
  `BACKLOG.md` is corrected in place rather than deleted, with the five-size measurement, because a
  ledger that quietly loses a false Sev-1 teaches nothing. **What was real underneath it: no e2e
  asserted the caution reaches the page at all** — that is now pinned, including the silence below
  the threshold.

- **A pre-push review agent left a mutation in the working tree.** One verifier patched
  `lib/motors/db.ts` to `if (false && …)` for mutation testing and never restored it; it was caught
  only because the next edit to that block failed to match. **Diff the tree after any review that is
  told it may mutate**, or forbid in-tree mutation outright and require a scratch copy.
- **Do not run the gate while review agents are running.** They create and delete probe test files
  inside the repo, so `npm test` reported 55 files, then 54, then 53 across three runs of the same
  commit. Every count taken during a review is unreliable. Run the gate after they finish.

## This session — fifth run (2026-08-02)

**Baseline inherited, measured before anything changed:** lint 0 errors / 1 standing warning, **1014
unit** across 53 files, build green, corpus **35 design files / 21 tests / 0 findings** with the
census medians unmoved, e2e **106 + 105 = 211 passed** once the browser was installed. **Zero open
pull requests at session start** — `HEAD` was exactly `origin/main`.

### Two Sev-1s, one root cause: an unmatched motor is ABSENT, not dead weight

`lib/sim/setup.ts` pushes a resolution and then `continue`s on no match, so an unresolved motor
contributes neither thrust nor mass. A comment in `lib/sim/run.ts` said it rode "as dead mass", and
nine surfaces believed it.

**The partial-cluster warning could never fire on a cluster.** It compared the cluster-EXPANDED flown
count against the UN-EXPANDED instance count, so any clustered mount made the left side larger.
Reproduced on `Airstart timing.ork` (one K550W + a cluster of three I211W): breaking the K550W drops
apogee **1296.5 → 478.5 m (−63%)** and moves the margin 1.697 → 2.486 cal, with the warning list
**byte-identical**. The expanded count now travels as `SimulateInput.motorsCalledFor`.

**And every loaded figure was published as if the motor were aboard.** On `demo-single-deploy.ork`
with its motor made unresolvable: liftoff mass 0.8018 → 0.6002 kg, loaded CG 0.6430 → 0.5725 m,
static margin **4.065 → 5.921 cal (+46%, and MORE stable than the truth)** — under a notice that said
the stability "remains valid". A surface audit enumerated the nine: the summary strip, the folded CG
and burnout mass, a `StabilityTrimHint` that *prescribed moving the fin set*, the `over-stable`
warning card, the diagram's CG mark, its caption, its SVG `aria-label`, the RocketPy cross-check, and
two captions asserting a reconciliation that no longer held. **All of it prints onto a range card.**

`FlightRun.motorsComplete` is the predicate they now share. **It is `hasPropulsion && every(match)`,
and the conjunction is not pedantry** — `[].every()` is `true`, so a design with no motor assigned
would have bypassed the entire fix.

**The low-stability warning is deliberately NOT gated, and the asymmetry is the whole point.** A
missing motor is missing AFT mass, so the margin reads high: that makes the over-stable caution a
false alarm (gated) and a LOW reading conservative (kept, with the gap named in the message).
Suppressing the low branch would have added a false negative where the number already errs safe.

Pinned by `lib/corpus/sweep.test.ts` — **129 single-motor removals across 35 design files, 10
clustered configurations**, and an in-test counter for the **5** the old comparison passed over in
silence. With the old semantics restored the test fails, naming all five. Plus an e2e that asserts no
margin VALUE survives anywhere on the page.

### P4 increment 4 — the blind spot is a PIN, and the journey that dead-ended does not

Reaching `GeometryInspector`'s selection-gated gesture bar found **nothing**: 0 hover-only, 0 under
44 px. That is honest rather than disappointing — increment 3 fixed those eight controls and no check
could see them, so a regression read 0 either way. **Select the BODY TUBE row, not row 1**: four of
the controls render only for a body tube, and row 1 is the nose cone.

**The real finding was that *pick a motor* could not be completed.** `MotorSweep.tsx` held exactly one
`<Button>` — *Run*. The panel ranks fifteen motors and could not apply one; the flyer memorised a
designation and scrolled **2.77 screens** on another route to re-find it in a select. A *Use* column
now does it in one tap, through `applyEdit`, so it shares the edit bag, the undo and the select.

### R8 increment 6 — a real parachute, and the coefficient it refuses to invent

The third of the five kinds the *done when* names. **The catalogue already shipped 151 canopies** —
the roadmap's "140" was pre-recount — so this was a picker and a model path, not data acquisition.

**Take the parachute before the coupler and the ring, and the reason is structural.** It is the only
remaining kind a design ALREADY HAS, so a pick edits the part that is there: no new `AddedPart` kind,
no `buildAdded` arm, no placement rule, no inspector button. The other two are a full new build path
for a median 34.4 g and 1.52 g.

**Measured over all 151:** diameter, gores, line count, line length and a surface cloth on 151 of 151;
line material on 145; a stated mass on 21. And on **0 of 151**: a drag coefficient, a packed size, a
length, an outer diameter. That last pair was the blocker — `PartPicker`'s `buildable()` required
both BEFORE the kind switch, so all 151 rows would have rendered disabled, which on a phone is
indistinguishable from a missed tap.

**The `cd` is taken from the canopy being replaced**, because no vendor here publishes one and a
landing speed is not a number to compute from a guess. 22 of the 37 corpus parachute nodes state one
explicitly; the rest say `auto` → 0.8.

**Measured on `demo-single-deploy.ork`** (610.0 mm, 26.1 g, cd 0.8, 6.95 m/s over 152.7 s): LOC
LP-96-2022 gives **2.16 m/s**, Top Flight PAR-9 gives **18.15 m/s** — a factor of 8.4.

**The trap that was waiting: 20 of the 37 corpus parachute nodes carry `<overridemass>`** (11 of 27
`.ork` files), which is the MAJORITY, and `overrideMass` wins outright in `lib/sim/mass.ts`. A pick
that set `mass` without clearing it would fly the old weight under the vendor's name — the identical
Sev-1 the nose-cone increment shipped and had to fix. Cleared, and asserted by giving the design an
87.9 g override first and watching the pick take it to 4.0 g.

### What went wrong, and what it cost

- **`pkill -f vitest` killed my own newly-started run** (exit 144). ~5 min.
- **Three e2e cycles were spent on a stale build** because a component change landed after the last
  `npm run build`. The e2e gate reads `out/`, never the source — rebuild after every UI edit.
- **My first negative control was invalid**: I emulated the old comparison with `input.config...`
  inside a function that has no `input` in scope, so every flight threw and the test went red for the
  wrong reason. It looked like a passing control. Emulate an old behaviour at a boundary where the
  values are actually in scope — I moved it to `buildSimulateInput` and it named all five cases.
- **An existing e2e was pinning the defect.** `"a design that can't fly still gets the whole
  navigation spine"` asserted the text "in the Design workspace", which was satisfied only by the
  wrong stability advice the Sev-1 fix removes. A green assertion can be holding a bug in place.

## This session — fourth run (2026-08-02)

**Baseline inherited, all measured before anything was changed:** lint 0 errors / 1 standing warning,
**997 unit** across 53 files, build, corpus **35 design files / 21 tests / 0 findings** with the
census medians unmoved from the last run (groundHitVelocity 8.3%, deploymentVelocity 6.0%,
flightTime 3.3%, maxAcceleration 3.2%, maxAltitude 3.1%, optimumDelay 2.5%, maxVelocity 2.2%,
maxMach 2.0%, launchRodVelocity 1.9%, timeToApogee 1.5%), and e2e **105 + 104 = 209 passed, 0
failed** once the browser was installed. **Zero open pull requests at session start** — everything
from the previous run was merged and live, so this run started from a clean `origin/main`.

### R8 increment 3 — the parts picker, and the catalogue is finally reachable

`components/PartPicker.tsx`. 1,089 published body tubes, searchable by number or description,
filterable by vendor or to the design's own caliber. Picking one writes the vendor's outer diameter
and length into `bodyDiameter`/`bodyLength` and the flight moves.

**Three things worth keeping:**

- **The catalogue is the app's FIRST dynamic `import()`**, and the split was verified from the built
  export rather than from intent: the chunk carrying `BT-60` is referenced by **no prerendered
  document**. 85 KB gz against a 343 KB whole-app budget. The service worker precaches everything
  under `_next/static`, so offline is unaffected. **Copy this pattern for the next big table** —
  `lib/motors/catalog.ts` (26.8 KB gz) is still statically imported.
- **A pick sets DIMENSIONS only, and the panel says so.** The wall and the material stay the
  design's own, so the mass is Loft's scaled figure, not the vendor's published weight. The material
  column sits right beside it, so silence there would have read as a claim.
- **The material half cannot use the existing field.** Measured: the catalogue's 39 material strings
  for body tubes have **zero** overlap with `AIRFRAME_MATERIALS`' seven keys, and `airframeMaterial`
  takes a key. Increment 4 needs an edit field carrying an explicit `Material`.

### The Sev-1 — the recovery radius was measuring rockets that were still in the air

Found by the opening fan-out's Sev-1 screen, **reproduced before it was touched**, and it is the
subtlest of this class the repo has hit. `lib/sim/montecarlo.ts` summarised `driftDistance` and
`landingRadiusP95` over EVERY sample while `landingSpeed`/`landingEnergy` beside them had been
filtered to landed flights the previous run.

**Why it survived that fix: a sentinel drift is not a zero.** `simulate` takes `driftDistance` from
the exit position unconditionally, so a flight still descending at the 1,200 s cap contributes how
far downwind it had got — a plausible, smaller number. Reproduced on `Complex.Two-Stage.CDX1` at 5x
recovery size (inside the field's own 0.1–10x range): **0 of 12 samples landed**, the panel correctly
withheld landing speed as "no dispersed flight reached the ground", and printed a **58.0 m median
drift and a 121.4 m recovery radius** beside it. Understated, in the unsafe direction, on the one
figure whose job is to size a recovery area.

Fixed on every surface that presents it — the radius card, the landing scatter, the "covers N of M"
note, the dispersion CSV (which gained a `Landed` column and blanks rather than zeros), and the
single-flight card's `Drift from pad` — plus the limitations page, whose existing passage named only
two figures and is now four. Pinned in `lib/corpus/sweep.test.ts` by CONSTRUCTION rather than by
threshold: re-summarising the landed subset must give the same band and radius as summarising the
whole set, which is only true if the whole-set summary already ignores the un-landed ones. **As a
negative control the old code fails it**, naming the design and the exact figures.

### P4 increment 2 — the hover-only count, 67 → 25

Five files in the shared chrome, and the leverage is that each renders on all six routes the ratchet
walks: five edits paid for forty-two states. The two `opacity-0` + `group-hover:` `opacity-100`
external-link arrows are now always drawn — at opacity 0 they were the only mark saying those links
leave the site, and no touch gesture brings them up. Three `title`s deleted, one of them on a
decorative `aria-hidden` bar that reached neither touch nor assistive tech.

**The Ko-fi link is the general lesson: deletion alone was the wrong fix there.** "Ko-fi" appeared
nowhere else on the surface, so removing the tooltip would have removed the only statement of the
destination. It moved into the visible label instead. A `title` is safely deleted only when its
information is genuinely elsewhere.

**And the trap that would have looked like a fix:** the check matches the class STRING, not the
computed style, so pairing `pointer-coarse:opacity-100` with `group-hover:` `opacity-100` moves the
count not at all — and leaves the defect. Delete the literal.

**The remaining 25 are a different problem and should not be attacked the same way.** All of them
sit on the app chrome above the workspace spine, so each renders on four routes rather than six, and
writing any of them visibly spends the phone chrome ratchet (1060 px, measured 1011 → 49 px) and the
two-screen depth cap at once — the trade increment 1 records making and reverting. The next
increment needs somewhere to put the words, not a shorter string.

### R8 increment 4 — the vendor's wall, stock and weight

The *done when*'s material clause. Measured with the catalogue's own Rocketarium BT-60 (0.533 mm wall
at 782.88 kg/m³): **528.0 g → 342.3 g** on the demo, a 35% change in dry mass.

**Three things it had to get right, and the review found that two of them were wrong first:**

- **A pick is a body-tube FIELD, not a free-standing record.** `withCatalogTube` resolves its target
  through the `bodyTubeId` aim at apply time, so a pick that outlived its aim MIGRATED — removing the
  tube it was made for re-landed the vendor's wall and stock on the primary-tube fallback (411.6 g →
  53.9 g), and merely clicking another tube to READ it moved them there too (305.4 g → 129.1 g), with
  the caption still naming the part. It is now a `targets` entry on that aim. The registry test then
  caught that it also needed an undo label — that guard earning its keep.
- **The vendor's published WEIGHT beats the derived one.** Seven body tubes state a mass and every one
  disagrees with the computed figure by 3–5× (PS-7.5: 589.7 g published, 116.7 g derived). Applied as
  `overrideMass`, which does NOT subsume the subtree — a tube carries its mount, fins and parachute.
- **The solid-rod clamp is reachable from the other side.** A wall ≥ the tube's radius makes
  `mass.ts` clamp the inner radius to 0. No bad data needed: `bodyDiameter` scales the airframe and is
  a sweep axis, so a 48.8 mm pick narrowed under ~17.9 mm crosses it. Refused now.

### The worst thing this run did, kept because it is the transferable lesson

**The increment-4 measurement recorded in `ROADMAP.md` and a commit message was not reproducible, and
nothing in the gate could have told me.** It quoted a 0.27 mm wall and a density of 848.98 — a figure
that appears in NO row of the shipped catalogue. Both the probe and the unit test hand-typed "the
vendor's published figures" rather than reading them out of the data, so the numbers were internally
consistent, passed every check, and described a part that does not exist. The real BT-60 is 0.533 mm
at 782.88, and the corrected figure is 342.3 g rather than 344.4 g.

**The fix is structural, not a corrected number:** the test now resolves the part through
`findParts`/`materialOf` at run time and asserts against what it read, so a hand-typed figure cannot
be asserted against again. `MAINTAINING.md` already says "measure, don't remember" about the repo's
own state — this is the same failure about the repo's own DATA, and it is easier to walk into,
because a hand-typed constant looks exactly like a measured one three weeks later.

The same review also found that the e2e's "the mass moved" assertion was a verbatim duplicate of a
caption check three lines above it and could never fail. **Two of the four pre-push reviews this run
found a tautological or unreproducible check rather than a code defect** — that is worth knowing
about what the review is FOR.

### The sibling repo is ATTACHABLE now, and that clears a six-run blocker

`add_repo` for `nrdptel/fusionspace-debrief` **succeeded this run** — the previous five handoffs
record it being refused by the permission classifier, and every `DESIGN.md` wording change owed to
the sibling has been held back since, because §10 makes a change to one copy a change to both in the
same run. It is cloned at `/home/user/fusionspace-debrief`.

**They had diverged 103 lines, Debrief's was AHEAD in three places, and they are now BYTE-IDENTICAL.**
Its §9 block had strictly better greps, and the difference was hiding real drift in Loft: the spacing
grep listed a handful of off-scale values to hunt for rather than enumerating the scale and
subtracting it, so it could see neither a `gap-*`, nor a half-step, nor anything past its largest
alternative — and **Loft's footer had sat two steps outside the scale on both top margins, reading as
compliant, for as long as that check has existed.** The type grep matched one size name; the card
grep could not survive a trailing space or a `dark:` variant.

**The correction the reconciliation forced is in `lib/design-system.test.ts`'s own comment**, which
said widening the spacing regex "would put the two out of step, and §9 is shared verbatim with the
sibling app". That was exactly backwards — the sibling already had the wider form, so Loft's was the
stale side and widening it CONVERGED them.

**The lesson is not "Loft was behind."** Debrief's adoption grep was the weaker half of the same coin
a run earlier. It is that **a file shared verbatim between two repos cannot be verified from inside
one of them**, so whichever session next has both attached should diff them before trusting either
copy. Both now carry that sentence.

### Where the work is, and what to pick up first

**Eight increments, all MERGED and LIVE**, across both repos. Each shipped through a pull request
green on both CI jobs before merging, each deploy verified against production rather than assumed —
the live probe returned 0 before a merge and 1 after, and all ten routes answer 200. The last one
was checked with `"Pick a real nose cone"`, 0 chunks before and 1 after.

| merge | what |
|---|---|
| `dd92ae0` (#113) | R8-3 the parts picker · the Sev-1 · P4-2 the phone chrome · R8-4 the vendor's wall, stock and weight |
| `529e84d` (#114) | P4-3 the app chrome's tooltips, 25 → 1 |
| `bc5b183` (#115) | the two `DESIGN.md` copies converged, and the drift the weaker greps hid |
| `8c33186` (#117) | P4-4 the builder's eleven gesture controls, 1 → 0 |
| `3fa86aa` (#118) | R8-5 the second kind — 854 nose cones, the Sev-1 in the mass it replaces, and the step a mismatched base leaves |

And on the sibling: `nrdptel/fusionspace-debrief` `07198a0` (#95), the companion `DESIGN.md` note.

A pull request that carries only THIS file is a correction to the record, not an increment, so it is
counted in neither the total above nor the table (#116 was the first of them). **Write the count that
will be true once the correction lands** — the entry this replaces claimed six and three because it
was written to describe the moment before its own merge, and it went stale on the way in.

**Production was driven, not just polled.** The sandbox's Chromium cannot reach the public internet
(`net::ERR_CONNECTION_RESET`; `curl` goes through the agent proxy and Playwright does not), so the
live check is `curl` against `/sw.js`'s own precache manifest and then each chunk it lists. That
found the picker's control string, the 3,445-part catalogue chunk (1,083,579 bytes, precached so it
is there offline), and the label-first `aria-label`s. **Do not try to point Playwright at the live
site from here** — it fails on the network, not on the product.

**R8-5, the last increment of the run, in one paragraph.** A nose cone is now pickable, and the
catalogue describes one far better than it describes a tube — 854 of 854 cones state a contour, a
base, a length, a shoulder and a usable density, against 0 of 1,089 tubes stating a wall. So the pick
takes the whole published part. `PartPicker` grew a `kind` and a per-kind table of copy and columns
rather than being copied; both walks are green. **The decision worth carrying forward is the one that
looks like a gap and is not:** a cone pick deliberately does NOT rescale the airframe the way a tube
pick does, so a 39.95 mm cone on a 38.0 mm tube leaves a real 2 mm step — and the mould-line check
Loft already had says so on the flight, in words. That was reproduced BEFORE the UI copy claiming it
was written, and it is pinned in both the unit test and the e2e. OpenRocket solves the same problem by
filtering its presets to what fits; the measurement that says Loft's answer is a real trade rather
than a rationalisation is that **0 of 854 cones** sit within 0.5 mm of a 38.0 mm airframe, so that
filter would show a metric builder an empty list too.

**The sibling repo is CLOSED OUT, and `DESIGN.md` §10's invariant holds for the first time.**
`nrdptel/fusionspace-debrief` #95 is merged (`07198a0`), so the companion note shipped rather than
being left for the owner. Verified from both checkouts after both merges: `md5sum` of `DESIGN.md` is
`e9d28c1a92974b17fbdb83edee7723c7` on each, and `diff` is silent. **This run leaves the owner
nothing.**

The thing to carry forward is HOW that was reachable at all: the divergence is invisible from inside
one repo, because each copy looks internally consistent. It took a session with BOTH attached. So the
standing instruction stays — whichever session next has both, `diff` them before trusting either, and
`add_repo` the sibling early rather than at the end.

**A note on branch mechanics that cost time twice.** `main` here is SQUASH-merged, so after a merge
the working branch's commits no longer exist on `main` by SHA and the next pull request opens
`dirty`. The fix each time is `git checkout -B <branch> origin/main` and cherry-pick or re-apply —
which is exactly what the harness rule says, and worth doing IMMEDIATELY after every merge rather
than at the next push.

**Pick up first, in this order:**

1. **P4 increment 4 — give the ratchet a way to SEE the selection-gated surface.** The eleven gesture
   controls themselves are fixed, and `DESIGN.md` §8's two counts are both zero. What is not fixed is
   that ten of them render only once a part is selected and the walk never selects one, so a
   regression there would not fail anything. Two ways in failed and are recorded in the spec:
   `getByRole("row")` matches nothing for that table, and a direct row click times out because it is
   1,198 px wide inside a 390 px viewport in its own scrolling container. It wants the diagram's own
   selection path, or a second walk at a wider viewport.
2. **R8 increment 5 — the other four kinds.** Nose cone, coupler, centring ring and parachute cannot
   be authored by `AddedPart` at all today, so "any of five kinds" is four new build paths. The
   parachute is hardest: the model requires `cd`, the catalogue has no such field, and only 21 of 151
   canopies state a mass.
3. **The three walks P4's *done when* actually names** — pick a motor, check stability, sanity-check a
   delay, one-handed and offline. Nothing has walked them. The hit-target and hover counts are the
   finish; those journeys are the substance.

### What the pre-push reviews caught that the whole gate could not

Twice, and both times on code that had already passed lint, unit, build and e2e.

- **On the picker, ELEVEN findings, one a one-way door.** The provenance record was not in
  `INERT_EDIT_FIELDS`, so a pick whose two fields were later blanked left the design pristine but
  still reading as edited — stored-tool comparison withheld, the picker's own clear control already
  unmounted, and nothing on the panel able to clear it. It survived a reload, because the bag is
  persisted unfiltered. Also: a fixed-precision table disagreeing with the field it writes on 642 of
  1,089 tubes; a `failed` flag that latched forever under copy promising a retry; index-bearing row
  keys remounting 1,089 rows per keystroke; a provenance line quoting 16 vendor files when 12 carry
  a body tube; an unnamed `<th>`; CSV accessors emitting metres under mm/in headers.
- **On the Sev-1 fix, a NaN I had just created.** Withholding the radius made `Scatter`'s
  `Math.max(radiusP95, ...points, 1)` NaN, so the SVG would have carried `r="NaN"` and the caption
  read "circle = 95% within NaN m". The scatter now has the empty state `DESIGN.md` §5 requires.
  **Withholding a value is a change to every consumer of it**, and this is the second time that has
  bitten on this exact pair of figures.

## This session — third run (2026-08-02)

Three commits on the working branch, none merged yet. Baseline inherited: lint 0 errors / 1 standing
warning, **983 unit**, build, corpus **35 design files 18/18** — and e2e **RED**, 208 failures, all
of them the missing browser above rather than a defect.

### R8 increment 2 — the component catalogue (`ebbb9ab`, hardened by `1f38898`)

`scripts/gen-components.mjs` parses the vendored Apache-2.0 openrocket-database (16 `.orc` files,
2.2 MB, `lib/components/orc/`) into `lib/components/catalog.ts`: **3,445 parts** from fourteen
manufacturers, normalised to SI, 82 KB gzipped. It reuses `lib/ork/xml.ts` — the same parser that
reads a flyer's design — via Node 22's type stripping, rather than carrying a second XML
implementation. `lib/components/db.ts` is the query API; `THIRD-PARTY-NOTICES.md` carries the
Apache grant, sixteen retained copyright notices and the statement of modifications.

**Nothing in the app imports it yet, so the bundle is unchanged. The picker is increment 3, and it
is the next R-track work.**

Three properties of the source data are load-bearing and all were measured: a material's unit comes
from its `<Type>` and never from `UnitsOfMeasure` (six SURFACE rows declare `g/m2` while carrying
kg/m²); six material names are defined more than once with different densities; 113 part numbers
collide across manufacturers and 21 within one, so `findPart` refuses to guess. Six entries are
refused outright — `Paper, bulk` at 0.0011 kg/m³ in two files (referenced by 18 real parts), an
elastic cord typed BULK, three parts with a bore wider than their outside, and one nose cone with
4.250 in of wall on a 0.974 in body.

### The Sev-1: landing speed was measuring the weather (`a4abebb`)

`groundHitVelocity` was `mag(state.vel)`, the full speed over the ground, so under a canopy it
carried the wind. Every consumer means the vertical descent rate — the 25/35 ft/s rules of thumb,
the per-section landing energy a waiver is judged on, and the stored figure in every design file.
On `USLI2025-FULLSCALE-10.15` it read **10.46 m/s at 20 mph against the file's own 5.607**, and the
landing energy built on it was **801 J against 215 J**. The file's five stored runs sit at
5.607–5.610 across 0–20 mph — flat while their flight time and altitude move — which is what
established the convention rather than assuming it.

The drift is separated, not discarded: `groundHitTotalVelocity` shows as "Arrival speed" when wind
makes it materially larger.

**The census figure got worse and that is the point: groundHitVelocity 3.0% → 8.3%, raised rather
than slackened, and said on `/docs/validation`.** The old figure was two errors cancelling — on the
openrocket files Loft's descent rate runs low and the wind term ran high. On the nine stored sims
where wind exceeds 4 m/s the vertical figure agrees to **0.68%** and the total is out by **25.27%**.
The descent-rate gap this exposes is real and is now visible work.

Pinned by a corpus assertion flying all 35 designs at 0/4/9 m/s; as a negative control the old code
names **56 violations** with exact figures.

### Two more Sev-1s, both reproduced before they were touched

**`lib/sim/flutter.ts` — a booster's fins were judged against the speed the SUSTAINER reached after
they were shed** (`f8cc5f7`). Every fin set on `Three stage low power rocket.ork` reported the
identical 77.1 m/s at 95 m, which is the tell. The red 0.68 margin belonged to a fin set shed at
0.86 s; over its own flight it is 2.11. Fixed by passing the realised phase timeline; **it reassigns
warnings rather than suppressing them** — `03.Three-stage.ork` keeps its 0.23 flag because that fin
set really is attached. Pinned over 12 shed fin sets, negative control names six violations.

**`lib/sim/montecarlo.ts` — a dispersion reported landings that never happened** (`ddbed12`). At
`recoveryCdScale: 5`, inside the field's own advertised range, **40 of 40 samples were 0 sentinels**
and the panel read 0.00 m/s and 0.0 J — while `ResultsView` withholds those exact two figures one
route away. Landing stats now come from the flights that landed, the result carries `landedN`, and
the panel withholds with a reason or says "covers N of M flights".

### What is still NOT reproduced

The remaining fan-out findings are filed at the top of `BACKLOG.md` **marked UNREPRODUCED**, with the
filer's numbers. Both Sev-1s above reproduced exactly as filed, so these are worth taking seriously —
but they are still claims. Ranked by claimed damage:

1. `lib/ork/export.ts:568` — a Loft-exported `.ork` re-imports with no stored simulations, so it
   flies a different motor configuration: claimed **52.9 → 317.1 m** on `A simple model rocket.ork`.
   **Reproduce this first**; it is the largest claimed number left.
2. `components/LoftApp.tsx:1347` — "Pick it back up" replays the edit bag onto bytes that already
   contain it: claimed −15% apogee and a duplicated part, from the undo button.
3. `components/LoftApp.tsx:515` — a from-scratch build stops being tracked by its shelf row after any
   reload, which also disables motor-swap baking in `downloadOrk`.
4. `lib/sim/simulate.ts:931` — with no liftoff, six summary figures are initialisation zeros printed
   as facts.

Also filed: `lib/weather.test.ts:139` is a **load-dependent red** in the unit gate (5768 ms against
vitest's 5000 ms default) — it went red once here under concurrent load and passes 16/16 alone. That
is the failure mode that teaches a session to re-run until green; give it an explicit timeout.

### Where the work is, and what production is serving

**All nine commits are MERGED and LIVE.** PR #111 merged as `96fcd9f` with both CI jobs green —
including the `frontend` job, which is the one that fetches the real corpus and runs the accuracy
census, so the raised 8.3% figure is validated upstream and not only locally. The deploy landed
about 80 seconds later.

Verified against production rather than assumed, after the deploy: all ten routes on
`loft.fusionspace.co` answer 200, `/docs/validation` serves the **8.3%** figure and the paragraph
explaining why it rose, and `/docs/methods` serves all three of this run's new passages — the two
landing speeds, the stage-attachment window, and the landed-only dispersion band. Before the merge
the same probes returned 0 on every one of them, which is what makes this a measurement of the
deploy rather than a hope about it.

**The working branch was restarted from the merged `main` afterwards**, per the harness rule that a
merged pull request is finished and cannot track new work. Anything after `96fcd9f` is a fresh
change on the same branch name and needs its own pull request.

### The measurement that is now owed to `DESIGN.md`

§9's compliance block should gain the hover-only count that `e2e/touch.spec.ts` now takes. It was
NOT added, because §10 makes a change to one copy of `DESIGN.md` a change to both repos in the same
run and the sibling is not attached here. That is now **five** things owed to the sibling copy, the
other four unchanged from the last five runs. A session created with both repos attached clears all
five.

## This session (2026-08-02)

Three increments, all pushed to the working branch. Baseline inherited green once the browser was
installed: lint 0 errors / 1 standing warning, **961 unit**, build, **e2e 100 + 100 = 200**, corpus
**35 design files, 14/14**, census matching every published figure.

### The Sev-1, and it was in the recovery numbers

The RK4 step bound that keeps an open canopy's stiff quadratic drag stable was gated on
`phase === "descent"`, which is only set after apogee. **Any recovery device opening at or before
apogee was integrated at the flat 0.01 s boost step with no bound at all**, and it diverged:

| design | recovery size | reported |
|---|---|---|
| `FullScaleModelTH.rkt` (ejects 0.5 s pre-apogee at 250 m/s) | 5× | apogee **2.07e13 m** (3.30e2 m at 4×) |
| `Complex.Two-Stage.CDX1` (drogue opens AT apogee) | 10× | ground-hit **7.52e32 m/s**, landing energy **4.00e65 J**, under a confident *hard landing* warning |

Both inputs are inside the `Recovery size (×)` field's own advertised 0.1–10× range, and ground-hit
speed and landing energy are the two numbers a field waiver is judged against. The step now follows
the canopy rather than the clock. **`DESCENT_STEP_MIN` was the second half**: it is a floor ON a
stability bound, so at 0.002 s it capped the bound at λ ≈ 1,390 — which a 10× canopy exceeds above
about 67 m/s, i.e. the floor was binding on exactly the case the bound exists for. Now 2e-4.

Also on that surface: a flight that hits the 1,200 s cap without landing carried
`groundHitVelocity` 0 and `landingEnergy` 0 as **sentinels** and rendered them as fact. A flyer
enlarging a canopy could watch the landing energy fall to 0 J and read it as success. The summary now
carries `landed` and both figures are withheld with the reason.

Census identical to the tenth on all ten metrics — this changed nothing that was not already
diverging. Pinned by a corpus assertion flying all 35 designs at 0.1/2/5/10× (124 flights), driven as
a negative control: with the old step selection restored it names all three divergences and their
exact figures.

### P2 increment 5 — the chrome fix, and P2 is done

The design summary above the workspace spine cost a 390 px phone **508 px** of the 1071 px of shared
chrome every route sits under. Three headline fields stay (apogee, liftoff mass, static margin); the
other seven fold behind a phone-only `Button`, shown outright from `sm:` up. `StabilityTrimHint` and
`FlutterFixHint` stay OUTSIDE the fold — they render only when something is wrong and are the only
place the reasoning behind that flag is written.

**The fold took 157 px out of the shared chrome on all four routes. Desktop unchanged at 773 px.**
§9's counts are unmoved (the control is the `Button` primitive, so the hand-rolled-`<button>` count
stays at 3).

**It did NOT close the two-screen clause, and this file said it had.** The phone context in
`e2e/depth.spec.ts` was a phone-sized viewport over `devices["Desktop Chrome"]`, so it reported
`pointer: fine` and every `TOUCH_TARGET` control rendered 26 px instead of 44 — understating the
shared chrome by **97 px** (914 measured, **1011** on a real coarse pointer). With `hasTouch` set,
`/sweep` sits at **1410 px = 2.12 screens** against 1328, so **82 px are still owed**. The
`test.fail` marker was deleted on the fine-pointer number and is restored with the true one. The
ratchet went 1120 → **1060**, not the 960 that measurement would have justified.

**The remaining 82 px were not the shared chrome.** Increment 6 found them in `/sweep`'s own panel:
its explanatory paragraph is a PITCH, and once the sweep has run the table answers the same question,
so 140 px of prose sat between the flyer and their result. Shown only until the panel opens now.
`/sweep` measures **1260 px = 1.90 screens** on a coarse pointer, 68 px inside the contract. P2 is
done.

**The design strip is NOT done and is deliberately out of P2.** It costs a phone another 130–160 px,
which puts the chrome back over the ratchet just tightened and `/sweep` back over two screens. It is
the P-track's next opening measurement, not a rider on this.

### The optimum delay was computed for the wrong vehicle

`lib/sim/run.ts` recomputes the delay from a recovery-free coast when a design deploys before apogee
— and read `built.input`, the raw build, instead of the flight actually flown. It dropped the
flyer's nose ballast and the thrust/mass/drag scales silently. On `The Red Hunter.ork` the delay sat
at exactly **4.66 s** for ballast 0 through 0.1 kg while apogee fell 258.5 → 147.4 m; the correct
figures are 4.66 / 4.99 / 5.20 / 5.31 / 4.58. Picking a delay is one of the three things this tool
exists to help with.

Pinned by the INVARIANT rather than those numbers — the delay a run reports must equal the delay of
the same run flown ballistic — over 6 early-deploying corpus flights, with the count asserted
non-zero so it cannot pass by finding nothing.

**Why the corpus never caught it: the census flies no what-ifs.** That is worth remembering when
judging what the corpus does and does not protect.

### R8 increment 1 — the fin shear moduli were fourteen uncited numbers, and two were wrong

Flutter speed goes as √G, so it is the most leveraged input in the one output this app produces that
is a safety estimate — and the whole table was "representative engineering figures" under a method
that cites NACA TN 4197 precisely. They turned out to be round US-customary values (3,800 ksi,
89,000 psi, 13,000 psi), i.e. inherited from the hobby fin-flutter literature rather than any primary
document.

**basswood 0.17 → 0.511 GPa (low by 3×)**, balsa 0.09 → 0.138, aluminium 26 → 26.2, titanium
44 → 42.75. Woods from USDA Wood Handbook FPL-GTR-282 ch. 5 as E_L × 1.10 × G_LT/E_L; metals from
MIL-HDBK-5J. Six rows have no published value and now say so in words. Every error ran the same way
— too little stiffness, so a margin reported thinner than it is — which is the right direction for a
safety estimate and still not a number to hand out uncited.

**Densities are the remaining half and are NOT done**; what was measured for them is in `ROADMAP.md`.

### P3 increments 2 and 3 — the caveat goes on the number, and the docs pages get found

`DESIGN.md` §5 requires the `Extrapolated` treatment wherever a number leaves its validated envelope.
Loft raised a transonic caution CARD while the apogee itself rendered byte-identical either way — and
a flyer reading the number does not necessarily read the card. Seven ascent-derived readouts now
carry the marker with its reason; rail-exit and thrust-to-weight deliberately do not, because they
are inside the envelope whatever the flight does later.

Then the three docs pages the milestone names. **Limitations** was linked only from inside the
no-motor notice, so an ordinary flight had no route to it. **Validation** was reachable only when the
file carried stored results — and none of the three bundled samples does, so every stranger's first
run hit an empty comparison whose only content was why it was empty. `ToolUnavailable` gained a slot
for the way forward, which §5 asks of an empty state and the primitive had nowhere to put.

### R7 increment 4 — the under-drag is a bare mould-line step, and it is NOT charged

Increment 3 said "the next slice is not a fin slice; find the drag `Complex.Two-Stage.CDX1` is
missing". It is a **bare step in the outer mould line** — a diameter increase with no transition to
take it over, which `aero.ts` has no term for. The silence was already recorded in two code comments
and on the limitations page and had never been closed. 33 of 115 judgeable joints step, in 13 of 35
designs; 27 of those in 9 designs clear the 0.5 mm notice threshold.

**Charging it fails, and this is now the fourth measured rejection on R7 — read `ROADMAP.md` before
attempting a fifth.** Eq. 3.86 at its abrupt limit (`0.8·ΔA`) takes `02.Two-stage.ork` from agreeing
to **−35.2%** and `Complex.Two-Stage.CDX1` J180T from +4.5% to **−20.8%**. The reason is physical:
0.8 is Hoerner's measured **flat-face** value in clean air, and a step is an annulus inside the
boundary layer of the body ahead of it. So the flight **reports the step and withholds the estimate**.
What would unblock it is a published forward-facing-step coefficient as a function of step height
over boundary-layer thickness; `UNVERIFIED` whether one exists in citable form.

**Two of this file's own recorded numbers were wrong and are corrected in `ROADMAP.md`:** the W2
variant does not reproduce at −4.96% / −13.60% — two independent measurements put it at
**−12.92% / −20.92%** — and the salvaged step list mislabelled the interstage flare (2.750→6.000 in,
not 3.250→6.000) and counted a real charged transition (6.000→6.500) as an uncharged step.

`<UseBooster1>False` is **not** a sustainer-only marker: each `<Simulation>` carries
`<IncludeBooster1>True` and the adapter already reads that. The `liftoffMass=NaN` thread was a probe
bug — there is no such field on the summary.

### What the pre-push review caught that the gate could not

An adversarial read of the diff with no other context found **a wrong number on a public page**: the
limitations page attached the median to the wrong population (11.75 mm is all 33 steps; the 27 above
threshold are 12.70 mm), while three other places in the same change said 12.70 correctly. It also
caught a paragraph the rewrite had deleted that was still true, a second e2e locator that matched two
surfaces while claiming to test one, and three `MouldLineStep` fields with no test holding their
meaning. Its differential test is worth keeping: `mouldLineStep` (singular) and `mouldLineSteps`
(plural) agree on sign and magnitude across every top-level component of all 35 corpus designs and
4,000 generated rockets — 0 mismatches.

### What went wrong, and what it cost

- **A synthetic regression test passed against the broken code, twice.** The first version passed
  `recovery: []`, so no canopy ever deployed; the second deployed one but at 58 m/s, where dt·λ is
  1.04 and RK4 is comfortably stable. Only the negative control caught either. **A regression test
  for a numerical bug has to be shown to fail against the old code**, and for a stability bug that
  means computing the regime it needs to be in rather than guessing a severe-looking input.
- **Overlapping background e2e runs looked exactly like the sandbox's documented descriptor
  exhaustion.** Two shards sharing one port gave 100, then 86, then 31 passed with no failure line.
  Nearly filed as an environment defect; it was self-inflicted concurrency.
- **My own published prose was wrong once and caught by the review, not by me** — the same shape as
  the last two runs (a clean claim the per-population numbers contradict). The check that works is
  re-reading each number against the measurement that produced it.

## This session — second run (2026-08-01)

Four increments, all merged through PR #105. Baseline inherited green.

**A note on the dates in this file.** Entries below say `2026-08-02` for work whose commits git dates
`2026-08-01`; `date -u`, the harness clock and every commit agree on the earlier date. The older prose
is left alone rather than rewritten on a guess, but entries from this run use the date the commit
actually carries. If a later session can settle it, settle it — do not add a third convention.

### P2 increment 3 — the static-export assertion

`scripts/check-routes.mjs`, from `postbuild`. Four claims, each driven as a negative control before
the check was trusted. **A postbuild script rather than a vitest test on purpose:** `npm test` runs
before `npm run build`, so a test reading `out/` would skip itself on a clean checkout, and a suite
that skips prints almost exactly like one that passed.

### R7 increment 2 — `runFromDocument` forwards what it is given

It named three of `RunOptions`' twelve fields and dropped nine silently. `dragScale` 0.1 and 3.0 both
returned the identical −7.57% apogee on `03.Three-stage.ork`; the range is now +175.81% to −36.27%.
This is R7's own instrument, and increment 3 could not have been measured without it.

### R7 increment 3 — the third attempt at per-set fin drag, and why all three failed

Implemented per-set thickness (and then per-set sweep on top), measured, **reverted both**. The
numbers are in `ROADMAP.md` and on `/docs/limitations`. The finding that matters, and the reason this
increment is a measurement rather than a feature:

> A collapsed value is **not** biased in one direction. It lands wherever the last set read puts it,
> so correcting it ADDS drag to some designs and takes it from others — of the twelve it changes, the
> eight with comparable stored results went both ways. What matters is which designs it takes drag
> *from*, and the two the *done when* protects are ones Loft already flies high, i.e. already
> under-dragged from somewhere else. The collapses are partly compensating for a separate under-drag.

So **the next R7 slice is not a fin slice**: find the drag `Complex.Two-Stage.CDX1` is missing. Its
J90W configuration is already a `KNOWN_ISSUES` entry saying RASAero stores nearly the same apogee for
two very different motors and Loft does not reproduce it. Do not re-implement per-set thickness or
sweep before that; it is now three attempts and three reverts.

A hypothesis refuted on the way: the `0.35` `cos²Λ` floor is NOT what breaks that design (its per-set
factors are 0.500/0.640/0.367 against a design-wide 0.640, none floored). The floor still wants a
source; charged per set it binds 15 of 51 fin surfaces across 13 designs, against 8 floored today.

### P2 increment 4 — the two-screen clause, pinned, and a record corrected

`e2e/depth.spec.ts`. See item 2 of the next-session list below for the numbers and the cause — the
short version is that **depth to a route's answer is not page height**, this file had been conflating
them, and the clause was being recorded as failing when three of four routes pass comfortably.

### What went wrong, and what it cost

- **A subagent's headline finding was false on both of its load-bearing premises** and was nearly
  acted on as a Sev-1: it reported the recents shelf's `Remove` as a one-way door breaching a
  `DESIGN.md` 8 px destructive-separation rule. There is no such rule in `DESIGN.md`, and the removal
  is recoverable — `onForgetRecent` deliberately holds the entry and a put-back affordance renders
  from `removedRecents`. Both took about two minutes to check. **Check the premises of a finding
  before its severity**, especially one that would preempt the milestone.
- **A measurement taken at the wrong moment set a ratchet 71 px too tight.** The spine cap was first
  read right after `loadSample` — before navigation settled — giving ≤1000 px when the real figure is
  1071 px on every route. Caught only because the ratchet was re-run across all four routes instead
  of one. Measure the thing where it lives, not where it is convenient.
- **My own prose was false twice and caught by re-reading it against the data**, both times the same
  shape: a clean directional claim ("both collapses over-state fin drag") that the per-design numbers
  contradict (`APEX_K_Dart.ork` goes the other way). Both were corrected before commit. This keeps
  happening; the fix that works is re-reading each numeric claim against the measurement that
  produced it, not re-reading for style.

### What went wrong this run, and what each cost

- **A false claim shipped into three files before the review caught it** (above). The fix that works
  is not "re-read the prose" — it is re-deriving the MEASUREMENT under the conditions the contract
  names, before writing anything down.
- **A regression test passed against the broken code twice.** The first version passed
  `recovery: []`, so no canopy ever deployed; the second deployed one at 58 m/s, where dt·λ is 1.04
  and RK4 is comfortably stable. Only the negative control caught either. **A regression test for a
  numerical bug has to be shown to FAIL against the old code**, and for a stability bug that means
  computing the regime rather than guessing a severe-looking input.
- **Overlapping background e2e runs impersonated the sandbox's documented descriptor exhaustion.**
  Two shards sharing one port reported 100, then 86, then 31 passed with no failure line. Nearly
  filed as an environment defect; it was self-inflicted concurrency.
- **A python dedupe removed the wrong copy**, shipping two headline fields under a comment claiming
  three — and the one that got folded was static margin, the go/no-go number. Caught by review, not
  by the gate, because no check asserted what the strip contains.

### What to pick up first

1. **R8 increment 2** — the component catalogue itself. The licence question is settled and the
   pattern to copy (`scripts/gen-motors.mjs` + a `provenance.json` + an inlined TS module) is named
   in `ROADMAP.md`. This is the biggest single capability available on either track.
2. **The four wording changes owed to the sibling repo's `DESIGN.md`**, still blocked on an owner
   fix — `add_repo` for `nrdptel/fusionspace-debrief` is refused by the harness.
3. **P4 — a touch-native builder.** Already decomposed. Its opening measurement is the persistent
   design strip, which costs a phone 130–160 px against the 68 px of headroom `/sweep` now has.

## Previous session (2026-08-02)

Baseline before anything changed, all four green: lint 0 errors / 1 warning (the standing `setDraft`
one), **950 unit**, build, **e2e 178 + 14 = 192**, corpus **35 design files, 14/14**. Nothing
inherited was red.

### P2 increment 1 — the workspaces became routes

`/flight`, `/design` and `/analyze` are three real static routes behind one navigation spine. The
fragment (`/#design`) and the `Tabs` tablist are gone; `DESIGN.md` §5 rules `Tabs` out for exactly
this case ("not for navigation between jobs; that is a route").

What a flyer gets that they did not have: an address per workspace that survives a bookmark and a
paste; Back and Forward that mean what they say; a per-route `<title>`; and **one precached document
per workspace** — the service worker went from 6 routes to 9.

**The load-bearing decision, recorded in `ROADMAP.md` under *Decisions taken without the owner*:**
the workspaces are mounted in the route-group LAYOUT (`app/(app)/layout.tsx`), not in the route
pages. A Next layout is not remounted when the flyer moves between the routes under it, so the
design, the undo stack, a running Monte-Carlo and a RocketPy cross-check all survive a navigation.
The obvious shape — a panel per `page.tsx` — unmounts them, and **none of those four results is
persisted anywhere**: `MonteCarlo`, `MotorSweep`, `ParameterSweep` and `RocketpyCrossCheck` each hold
their result in a plain `useState`, which is why `ResultsView` has kept panels mounted-and-hidden
since it was written. That shape becomes available once those are hoisted; until then it would trade
the milestone's own *"the design and its results survive moving between them"* clause for tidier
files.

**The mechanical cost, measured before starting: 262 `getByRole("tab", …)` call sites** across four
spec files (smoke 240, rocketpy 10, touch 10, touch-landscape 2). All migrated to `link` +
`aria-current="page"`. Two things the rename must NOT touch: `DataTable`'s rows also use
`aria-selected`, and a blanket replace corrupted one before it was caught.

### What the pre-push review caught that the gate could not

Four adversarial lenses over the diff, no other context. Two of them independently found the same
two defects, and both were real:

- **The header wordmark stranded a loaded design.** `/` and the workspaces share one layout, so
  following the wordmark home does not unmount anything: the design survived while the address
  stopped naming a workspace. The result was the Flight panel rendered under `/`, no spine link
  marked current, the title back to the site's — and the session-save effect, reading the address for
  "where I left off", quietly rewrote Analyze to Flight so the next cold open came back wrong.
- **A transient window inside every load did the same thing.** `setDoc` commits in one tick and the
  route change arrives in a later one, so there is a render where a design is open and the address
  still says `/`. The session-save effect runs in it. Fixed by recording the load's INTENT
  (`lastWorkspace.current = landing`) before navigating, rather than reading the address after.

Both are pinned by *the wordmark cannot strand a loaded design at an address that names no
workspace*, whose second half — reload and check the spine — is the part no amount of looking at the
screen would have shown.

Also from the review, verified — and then **reverted after measuring**, which is the part worth
keeping. The claim was that the router's payloads are never precached, so an offline spine tap falls
back to a document load and remounts the app. The first half is true. The fix was not: a client-side
switch fetches `/analyze/__next._head.txt?_rsc=7h4NYy5eoyMcNlUN` and three siblings, all carrying a
cache-busting query, and the worker's runtime lookup is `caches.match(req)` with the default
`ignoreSearch: false` — so precaching them under their bare paths could never have matched. It would
have shipped 78 cache entries and a comment claiming a benefit it did not deliver, and it tripled the
worker's install-time requests (25 → 103) on a box whose descriptor ceiling already destabilises the
suite. Filed with the trace, and with what IS true: prefetch fetches all four payloads per workspace
on the first online load and stale-while-revalidate caches each under its full URL, so after any
online visit the switch works offline. **Measure the key a cache is actually read by before adding
entries to it.**

And declined, with the reason: `/flight`, `/design`, `/analyze` are `robots: { index: false }` and
are NOT in `app/sitemap.ts`. Their content is the flyer's own design on their own device, so the
prerendered document is empty by construction — a search result titled "Flight — Loft" promising
apogee and plots, landing on an import screen, is a promise the page cannot keep. Still linkable,
bookmarkable and precached; only indexing is withheld.

### R7 increment 1 — each fin set is charged for the edge it actually has

The R-track was dry, so R7 was written from the after-list AND its first slice shipped. Every number
in the milestone was driven this run rather than carried from the ledger.

**There are THREE collapses in the fin drag build-up, not the two `BACKLOG.md` records**, and the
unfiled one is the largest: `aeroGeometry` billed every fin set the DRAGGIEST cross-section present.
Fixed. Over 97 stored simulations on 35 designs — timeToApogee 1.7 → **1.5%**, maxMach 2.1 →
**2.0%**, maxVelocity 2.3 → **2.2%**, optimumDelay 2.7 → **2.5%**, maxAltitude 3.2 → **3.1%**;
deploymentVelocity went the other way, 5.9 → **6.0%**, and is published at its new figure.

**Two things to carry forward, both the kind that would otherwise be re-derived.**

*Per-set SWEEP was written, measured and reverted in the same increment.* It improved no census
median and pushed a real design outside the corpus's agreement tolerance — the same shape as the
area-weighted thickness attempt before it. **Do not simply re-apply it.**

*`03.Three-stage.ork` got worse and that is recorded rather than glossed:* apogee −7.57% → **+10.76%**,
flight time −5.6% → **+10.67%**. Its sweep collapse was partly cancelling its cross-section one and
only one is fixed. In its `KNOWN_ISSUES` entry with both figures.

### P2 increment 2 — Analyze split into Sweep and Cross-check

`analyze` carried three of the five jobs the *done when* names, while the two surfaces that belong
beside its second solver sat in the FLIGHT panel a workspace away. Now `/sweep` (the two sweeps and
the dispersion) and `/validate` (the file's own stored numbers, its step-by-step flight, and the
independent solver). North Star #1 asks for independent estimates side by side; they could not be
side by side while they were on different routes.

**Driven on the built export, not asserted.** These are TOTAL page heights in screens — how far the
document scrolls — **not** depth to each route's answer, which is a different and much smaller
quantity now pinned by `e2e/depth.spec.ts` (see item 2 below). They were labelled "depth" here and
read as a two-screen failure for it; they are not that.

| route | title | desktop page height | phone page height | controls under 44 px |
|---|---|---|---|---|
| `/flight` | Flight — Loft | 3.2 screens | 6.6 | 0 |
| `/design` | Design — Loft | 3.4 | 6.9 | 0 |
| `/sweep` | Sweep — Loft | 2.0 | 4.1 | 0 |
| `/validate` | Cross-check — Loft | 1.8 | 3.5 | 0 |

Zero horizontal overflow on all four at 390 px. **And the load-bearing claim, verified by driving
it: a Monte-Carlo left running survives a round trip to another workspace and back.** That is the
whole reason the design is mounted in the layout rather than in the pages.

**Flight and Design at ~7 phone screens is the honest bad number here** — `DESIGN.md` §8 wants at
most two to the answer. Splitting Analyze halved the two it split and left those two untouched.
Filed in `BACKLOG.md` for P4 with the measurement.

## What the pre-push reviews caught, across three of them

The single most valuable habit this run. Three reviews, ten agent-lenses, and the pattern is worth
naming: **most of what came back was false prose I had written, not broken code.**

- a burnout regression guard I "re-centred" had in fact been **widened nine-fold**, behind a comment
  asserting that re-centring is not loosening — and both of that comment's justifications were
  arithmetically false (a booster/sustainer swap fails 2 of 4 assertions, not 4);
- `/docs/validation` said outdated stored runs agree "about as well" as current ones at 3.3% against
  2.1%. Re-measured: **3.7% against 2.0%**, i.e. they agree LESS closely, and the old text understated
  the gap on exactly the runs that page flags;
- "22 of the 35 designs have one fin set" — 20 do, 2 have none, 28 are unaffected;
- `lib/model/types.ts` and `lib/model/edit.ts` both still described a rounded fin edge as "roughly
  halving" square stagnation drag, which is the model the solver explicitly rejected and documents
  rejecting;
- and the checks that had quietly stopped being able to fail: a unit census asking for
  `div[role=tabpanel]` after the panels became regions (so it censused the whole document three
  times and called it three workspaces), a touch scan still selecting `[role=tab]` (so the app's
  primary navigation was measured in neither dimension), and six one-shot reads racing a navigation.

**The third review, on the workspace split, is the one to read if you take only one.** It found that
the FAQ I had just rewritten sent a flyer to the wrong workspace for the second solver; that a staged
design got a BLANK Cross-check workspace because the notice explaining the solver's absence stayed
behind on Sweep; that `/analyze` — an address shipped that same morning and advertised as
bookmarkable — now answered with the 404 page; that nine `Validation` absence guards had become
vacuous because `getByRole` skips hidden subtrees; that the accessibility audit and the touch scan
had each lost a workspace; and that the migration hinge for the whole split (`RETIRED`) had no test
at any level. All fixed. `/analyze` is now a real route that forwards, and says so rather than
flashing.

**A blanket replace corrupted an unrelated assertion, twice.** `aria-selected` on `DataTable` rows in
one pass, and `toHaveCount(3)` → `4` on a parts-table row count and two diagram-handle counts in
another. Caught the second time only by running the control against the pre-change build. **After any
mechanical rename across the suite, list every site it touched and read each one.**

## Read this before trusting a red e2e run

**`npm run test:e2e` fails 2–8 tests on this box for a reason that is not the product.** The suite
serves `out/` with `npx serve`; partway through a full run the server dies with `EMFILE: too many
open files` and every test still to start fails on `ERR_CONNECTION_REFUSED`. `ulimit -n` is at its
4096 hard cap and cannot be raised. **Shard it** — `npx playwright test --shard=1/2 && npx playwright
test --shard=2/2` — each shard gets its own server and therefore its own budget. This session:
**97 + 96 = 193 passing, 0 failed.** CI is unaffected.

**Grep for `failed`, not for `passed`.** And when a trailing block of tests fails together with
`EMFILE` in the server output, that is this — not a regression to chase.

## What this session learned that is worth keeping

- **A workspace switch is a NAVIGATION now, not a `setState`.** Three e2e tests failed on this and
  none of them was a product bug: they read `page.url()` or scraped `innerText` in the tick after a
  click. `await page.waitForURL(…)` before any one-shot read. `expect(locator)` assertions retry and
  were all fine — 172 of 175 needed no change.
- **The static export is served as DIRECTORIES.** The address is `/design/`, with the trailing slash,
  so `waitForURL("**/design")` never matches and `pathname` comparisons need normalising.
  `workspaceFromPath` in `lib/workspaces.ts` strips it; the specs normalise once at the top.
- **`hidden` means zero width, and the diagram fits itself to its container.** The zoom test measured
  the SVG at **240 px** instead of **1198 px** because it measured during the navigation, while the
  Design panel was still hidden. The product re-fits correctly once visible; the test had to wait.
- **`pkill -f "<pattern>"` matches the shell running it** and killed the whole gate with exit 144.
  This is in the previous handoff, and I walked into it anyway. Use `fuser -k <port>/tcp`.
- **The design-system ratchet is EXACT, and that is the feature.** `PRIMITIVE_ADOPTERS.Tabs` went
  1 → 0 because its only adopter became the route spine, and the suite went red until the table was
  updated in the same commit. Do not treat that as a failure to route around.
- **Tailwind v4 still scans SOURCE for contiguous literals.** The tab bar's class strings moved to
  `lib/ui-tokens.ts` as `NAV_BAR` / `navItemClass` so the tablist and the spine cannot drift apart —
  spelled out in full, never assembled.

## Running the gate without fooling yourself

- **`npm install` first** on a fresh container, then **`npx playwright install chromium` once** and a
  bare `npx playwright test` — do NOT set `PW_EXECUTABLE_PATH`. `@playwright/test` is 1.61.1 and
  manages **chromium-1228**; the sandbox ships 1194. **The installer exits 2 even on success** —
  check `/opt/pw-browsers/` for `chromium-1228` rather than trusting the exit code. Confirmed again
  this session: it downloaded and the suite ran against 1228.
- **Shard the e2e**: `npx playwright test --shard=1/2 && npx playwright test --shard=2/2`.
- **`git commit --amend` is blocked by the permission classifier.** Add a second commit.
- **Never revert a negative control with `git checkout -- <file>`.** Copy the bytes aside and restore
  from the copy.
- `rm -f *-tmp.*` immediately before every gate: eslint lints gitignored root-level probes.
- **A probe under the scratchpad cannot resolve `@playwright/test`.** Put probes in the repo root with
  a `*-tmp.mjs` name (gitignored) and delete them before the gate.
- **`npx vite-node <file>-tmp.mjs`** runs a probe that imports `.ts` modules directly.
- Serve the built export with
  `(setsid npx serve -c e2e-serve.json -l 3100 --no-clipboard --no-request-logging < /dev/null &)`.
  **Do not pass `out` as an argument.**

## Before you trust a sweep

```bash
mkdir -p corpus && for d in openrocket rocksim rasaero rocketpy spacecad; do
  ln -sfn /home/user/loft-fixtures/$d corpus/$d; done
npx vitest run lib/corpus --reporter=verbose --silent=false
```

It must print `imports every design file (35 present)`. **Confirmed this session: 35 files, 14/14.**
The census medians MOVED this run and the published figures moved with them — a sweep now prints
maxAltitude **3.1%**, maxVelocity **2.2%**, timeToApogee **1.5%**, maxMach **2.0%**, optimumDelay
**2.5%**, deploymentVelocity **6.0%**. A session expecting the old 3.2 / 2.3 / 1.7 will read the
improvement as a broken corpus.

**The corpus filenames are NOT the names the ledger uses.** They are prefixed with their provenance:
`corpus/openrocket/openrocket__openrocket-repo-rasaero-threestage__03.Three-stage.ork`. A probe that
opens `corpus/openrocket/03.Three-stage.ork` gets ENOENT, and that reads exactly like a missing
corpus.

## Orchestration, measured

**This box has 4 cores, so a workflow's concurrency cap is 2.** A four-agent fan-out returned all
four in about 18 minutes. **Size a fan-out to 4 agents, not 8.**

**The opening fan-out was worth more than the Sev-1 screen it is nominally for.** The P2 route
reconnaissance predicted the 262-selector cost exactly, named the panel-unmount problem that decided
the whole architecture, and flagged the three-way split `analyze` still needs. The R7 agent found a
collapse nobody had filed and re-measured every number in the ledger. **The competitive probe ran
after the change landed and found what the split COSTS** — see `COMPETITION.md` row 31.

**The pre-push second opinion is not optional.** Four lenses over one diff found two real defects with
193 e2e tests green, and both were the kind a route split creates: state surviving a navigation that
should not have, and an address disagreeing with what is on screen.

## Facts about this codebase that cost time to rediscover

- **`FlightRun`'s scalars are under `result.summary`**, not on `result`.
- **A per-configuration deploy override REPLACES the component's own event AND altitude.**
- **Components nest under `.children`; a `Stage` holds `.components`.**
- **`importDesign` is async**, takes BYTES, handles `.ork`/`.rkt`/`.CDX1`.
- The app now has NINE page routes: `/`, `/flight`, `/design`, `/analyze`, `/docs`, `/docs/faq`,
  `/docs/methods`, `/docs/limitations`, `/docs/validation`.
- **A motor mount is a FIELD on a component, not a component** — on `BodyTube` and `InnerTube`. Twelve
  of the 35 real designs put it on the body tube.
- **`vitest.config.ts` walks `lib/` and `app/` only — NOT `components/`**, in a `node` environment. A
  component's pure logic has to move to `lib/` to be unit-testable.
- **`geom.finCount` and `geom.finThickness` on `AeroGeometry` have no consumers at all** — verified by
  search across `lib/`, `components/` and `app/`. They are dead reporting fields; changing them moves
  no number.

## Pick up first

**Rewritten at the end of the 2026-08-04 run. Items 1 and 2 are the ledger's two remaining OPEN
Sev-1 entries — both still marked UNREPRODUCED, so reproduce before scoping. This run refuted three
findings that looked just as solid.**

1. **SEV-1, UNREPRODUCED — on a multi-motor design the thrust plot describes only the first resolved
   motor.** `components/ResultsView.tsx`: `resolutions.find(x => x.match)` feeds both the series and
   the caption, so a cluster or a staged design is plotted and labelled as one motor. The corpus has
   10 clustered configurations and 9 multi-stage designs to reproduce it on.

2. **SEV-1 — a `/validate` figure renders metric or imperial depending on a toggle elsewhere.** Filed
   2026-08-03 from a cold walk, never re-measured.

3. **R10 increment 1 — settle the `.ork` landing-velocity convention from OpenRocket's source, by
   version.** A probe this run read 23.09's `AbstractEulerStepper` overwriting `TYPE_VELOCITY_TOTAL`
   with the AIR-relative speed, while `unstable` sets it from `getRocketVelocity()` — the
   ground-frame total. If that holds, **the convention CHANGED between versions** and a corpus file's
   `creator` string decides which figure Loft is being scored against. `COMPETITION.md` row 34 rests
   on inference from stored numbers and is marked `UNVERIFIED`; this either upgrades it to a citation
   or corrects it. Marked `UNVERIFIED` here too — it is one agent's reading, not yet mine.

4. **P6 increment 3 — `EmptyState`/`ErrorState`.** The confirmed live case is
   `components/MassBreakdown.tsx:47`: `if (points.length === 0) return null` short-circuits before a
   `DataTable` whose `empty` copy is written and unreachable, so the panel vanishes rather than
   saying why. Its `GeometryInspector` sibling was investigated and **REFUTED** — `ResultsView` never
   mounts without a successful flight, so that branch is genuinely unreachable. Expect the §9
   inversion check to need the same primitive credit `Select` needed.

5. **A body diameter smaller than the motor inside it flies to a confident 11.6 km.** Measured this
   run — 0.1 mm gives 11,588.6 m and 1,151.77 cal with `motorsComplete` true and no warning naming
   the diameter. Now that `fin-count-assumption` and `no-recovery` exist, this is the same shape of
   fix and the third of that trio.

6. **The `/design` editor is a 4.79-screen scroll on a phone** before the recovery controls. Measured
   on the built export at 390x664. The depth e2e passes because it measures one primary anchor per
   route; the PRODUCT SHAPE invariant is the real argument for splitting that page.
