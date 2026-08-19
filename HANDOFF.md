# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Pick up first

**Read `OWNER-NOTES.md` first, because it is the only item here an owner has to decide:** its
*Awaiting the owner* carries a note dated 2026-08-18 recording that **the app ships RocketPy to the
browser while `MAINTAINING.md`'s clean-room invariant says it never should** — 41 MB of
`out/pyodide/`, 23 wheels, `rocketpy-1.12.1-py3-none-any.whl` among them. Nothing in the repo records
that being decided. **The licensing half is fixed and is not in doubt**; the invariant's sentence is
untouched, deliberately, because a session quietly editing an invariant to match the code is the
failure the invariant list exists to prevent.

| | what | state |
|---|---|---|
| SEV-1 | `ValidationPanel` published `mean abs. error N%` — the number a flyer quotes as Loft's accuracy — with no envelope caveat, while `DragCrossCheck` hedged the same flight directly below it | **merged, live** (PR #196) |
| — | `lib/envelope-surfaces.test.ts` — the census that would have caught it, read out of `ResultsView`'s own JSX; 16 surfaces, each with a written verdict | **merged, live** (PR #196) |
| SEV-1 | the dispersion panel's waiver ceiling went to an EMPTY box while the panel went on reporting a waiver bust from it — two keystrokes to reach | **merged, live** (PR #196) |
| SEV-1 | the diagram's zoom control did nothing at all on a phone and never had — 505.3 px/m at 1×, 1.5×, 2×, 4× AND 8× | **merged, live** (PR #196) |
| P19 increment 1 | persisted call sites **9 → 11**, and `usePersistedNumber` gained the `valid` guard that remembering a number creates the need for | **merged, live** (PR #196) |
| — | `COMPETITION.md` row 56 added; `MAINTAINING.md` + `AGENTS.md` carry the new shard count | **merged, live** (PR #196) |

**The two questions this run has to answer, answered.**

*What can a flyer DO that they could not before?* **Magnify the airframe on a phone** — the control
was there and inert on every rocket at every step, on the one form factor its own docblock names as
the reason it exists. And **come back to the tool they set up**: the waiver ceiling they entered and
the magnification they chose both survive a reload, where before only the six dispersion tolerances
did.

*What is measurably better?* Persisted call sites **9 → 11**. Surfaces publishing a Loft figure with
no envelope caveat: **1 → 0**, out of 16 censused. The phone's zoom range: **1 usable step of 7 → 7**.
Ceilings that render as an empty box while being reported from: **every one under 0.5 m → none**. And
the e2e suite: **299 → 300**, with three new cases, each driven red against its own revert.

**The next slice on each track:**

- **P-track: P19 increment 2** — every table's sort survives, and the parts list stays open.
  `onSortChange` call sites **2 → 7**. Read the increment's own note about the `allowed` guard's scar
  first (`MotorSweep.tsx` discards a remembered sort naming a column that no longer sorts, because
  `col.sortValue!(a)` on a column without one scrambles the array). The fan-out also filed an
  UNREPRODUCED claim that the parts table's sort cannot reverse at all — `onSortChange` maps "clicked
  the active key" straight to `"design"` where `DataTable.tsx` documents a three-state cycle. Verify
  that inside this increment rather than as its own entry.
- **R-track: R12 increment 28 does not exist yet, and this run did NOT write it.** The R-track got no
  slice: three Sev-1s and P19 increment 1 filled the first pass. `COMPETITION.md` row 54's own
  recommendation still stands as the cheapest next step — OpenRocket's per-field `Automatic` switch,
  `boattailAftDiameter` tracking its host tube — **but the run's scoping fan-out returned three
  claimed Sev-1s against the boattail that must be reproduced before that increment is written, and
  one of them says the recommendation is aimed at the wrong thing.** They are in `BACKLOG.md` and
  summarised below. Reproduce them first; the increment is different depending on the answer.

## The three boattail claims that R12 increment 28 has to settle first

Returned by the opening fan-out, **NOT reproduced by this session** — they are claims, and
`MAINTAINING.md` forbids a claim becoming an increment. Each names a file and a gesture, so each is a
few minutes to settle:

1. **`aftmostBodyTube` matches only `kind:"bodytube"`**, so on a design whose tail is already a
   transition the new boattail is claimed to splice BETWEEN tube and existing transition — a
   contraction followed by a step back out, with `baseRadius` left on the old tail so the base-drag
   benefit the field exists for never happens. Claimed on the shipped `demo-boattail.ork` sample and
   4 corpus `.ork`. **This is the case "its host tube" has to resolve**, so scoping increment 28
   without settling it scopes the wrong thing.
2. **The advertised bound is not the enforced bound.** `boattailFairsTo` is claimed to read the tree
   WITHOUT dimension edits while `addBoattail`'s guard runs after the caliber scale — so a value
   inside the placeholder's stated range silently builds nothing and says nothing. If it holds, an
   Automatic exit that tracks the LIVE host diameter removes it by construction, which is the
   strongest argument for the increment.
3. **`aftmostBodyTube` scans every stage**, so on a staged design the boattail is claimed to be built
   on the stage that separates earliest and to leave with it.

Also worth reading before that increment: `lib/ork/adapt.ts` already parses OpenRocket's `auto` token
and resolves it from neighbours, and `lib/ork/export.ts` deliberately writes explicit radii instead.
So "automatic" is **not** purely a UI authoring state — the format carries it and Loft flattens it on
every save. An Automatic switch built without touching that ships a second vocabulary for one idea.

## What the pre-push review caught this run, which is again the part worth carrying

**Three lenses over one diff returned eleven findings and six were real, including two checks that
could not fail — written in the same commit as the fix they were supposed to protect.**

1. **Both new unit guards were untested at their call sites.** The tests passed `readPersistedNumber`
   a predicate they had written themselves, so deleting the third argument at `MonteCarlo.tsx` or
   `RocketDiagram.tsx` left the whole suite green. `ZOOM_STEPS` was not even exported, so the test
   re-typed the list. **A test that supplies its own version of the thing under test is not a check**,
   and this is the second time this repo has recorded that shape in a month. Both call sites are now
   read off the source and asserted, and the control was driven red.
2. **`scrollWidth <= window.innerWidth` cannot fail.** `e2e/touch.spec.ts` documents it: innerWidth
   includes the scrollbar and is widened under `isMobile` emulation. It was written as the
   page-overflow half of a one-way-door guard and asserted nothing. `document.documentElement.clientWidth`.
3. **A new e2e with no `test.setTimeout` declaring 120 s of its own waits.** It would have died at the
   config's 60 s mid-wait rather than on an assertion — a red gate that says nothing about the code.
4. **`page.getByText("2×")` is a substring match across four workspaces that are all mounted at
   once**, and a cluster design's motor label is written `${count}× `. Scoped to the zoom control's own
   `role="group"`.
5. **The census this run added missed four of its own members** — the two sweeps, the dispersion and
   the RocketPy cross-check take `doc`/`simIndex` rather than a finished flight, and those four are
   named in `envelope.ts`'s own list of six. Its tag scan also could not cross a `>`, so an arrow
   function in a prop truncated the attribute list and membership depended on prop ORDER. **The file
   written to stop a class of blindness had two instances of it.**
6. **`maxMach ?? 0` would have published "this flight reaches M0.00, outside the drag model's
   validated subsonic envelope (M ≤ 0.8)"** — a sentence contradicting itself, on the panel the
   change existed to make honest. Unreachable through the single call site; the props are required now
   so it stays unreachable through the second.

*The general lesson, and it is not "review harder".* Findings 1, 2 and 5 are all the same failure:
**a check whose subject is supplied by the check.** A predicate the test wrote, a viewport the browser
widened, a census whose membership rule matched only the shapes its author had in mind. Ask of every
new assertion: *what edit, in the production file, makes this red?* If the answer is "none", it is
narrative.

## The e2e flake, measured rather than guessed

`e2e/docs.spec.ts:39` "every docs page is readable offline" fails with `net::ERR_INTERNET_DISCONNECTED`
on `/docs` under in-shard parallelism and passes **8 of 8 in isolation** (3.6–4.1 s each). Raising the
shard count does NOT fix it — it failed at four shards and again at five — so it is not the
shard-pressure class `MAINTAINING.md` documents. The lever is `workers`, not shards:
`playwright.config.ts` runs `workers: 1` in CI (green there) and the local default otherwise. Filed
with the numbers.

## What production is serving, walked after every merge on 2026-08-18

Walked by fetching the site's own precache manifest and every URL in it — not by reading the index
page's `<script>` tags, which name only 11 of the 25 chunks and once reported two of a run's strings
absent when they were not. The service worker's `BUILD_ASSETS` is the authoritative list, because that
is what the app promises to work from offline.

**After PR #193** (`main` at `d0c2843`, `BUILD_ID = "aff65baa4d2b"`): the flight-log drop's own
sentences — *"Drop one on this chart"*, *"tab-separated export"*, *"Flight log file"* — are all
**PRESENT** in the served chunk, and the served stylesheet carries
`transition:none!important;animation:none!important` inside the universal `@media print` rule beside
`box-shadow` and `background-image`. So the print fix is what a flyer's printer gets, not just what
the repo says.

**After PR #194** (`main` at `29b7c68`, `BUILD_ID = "272249d46401"`): **72 precached URLs re-checked,
2 not 200 — and both are expected**: `/docs/` is the host's 308 to `/docs`, and `/pyodide/` is the
fetch handler's path PREFIX rather than a URL, so **70 real URLs, all 200**. Increment 27's own
strings — *"Its own fields are under Properties"* and *"attached to it, taken off it, or moved here"* —
are **PRESENT**.

**And the journey was walked on the shipped bytes.** A browser cannot reach the live site from this
container (the agent proxy; see *The environment*), so the served stylesheet's SHA-256 was compared
against the local `out/` — **identical** — and the walk run against those bytes. From the scratch
starter, typing the dual-deploy pair and a payload weight and then picking each part:

```
Drogue:  aria-label="Drogue"   fields: Diameter (mm)                     leaked: none
Payload: aria-label="Payload"  fields: Weight (g) · Position (mm)        leaked: none
console errors: none
```

Checked absent on the drogue's panel specifically: `Canopy Cd`, `Canopy mass`, `Main chute`, and both
spellings of the deploy altitude — the field that sets when the MAIN opens. On P18 increment 3's
journey, also on the shipped bytes: the hint names the drop, `accept` carries `.tsv`, `dragover` is
cancelled (so a dragged link cannot navigate the app away mid-session), the overlay renders, and
**0 elements are still animating on the printed sheet**.

**So the production gap is zero.** Every increment this run shipped is what a flyer gets.

## What the sibling repo is OWED, verbatim, because this session could not reach it

`DESIGN.md` is shared and the DESIGN-IS-BINDING invariant says a change to one copy is a change to
both **in the same run**. This run changed §2 and §5 in Loft's copy only. **Both `add_repo` for
`nrdptel/fusionspace-debrief` and a plain `git clone` of it are refused by the harness before they
reach GitHub** — `list_repos` shows the repo public with `can_push: true`, so the account has the
access and the session may not use it. Parked in `OWNER-NOTES.md` under *Awaiting the owner*; the fix
is attaching it as a second source at session creation, exactly as the fixtures repo is.

Neither section is in `lib/design-shared.test.ts`'s `SHARED_SECTIONS` (4, 6, 7, 8, 10), so no check is
red in either copy. What to paste over there:

- **§2 Borders** gains a paragraph after the two-colour table: **one container border width, 1 px,
  whatever the container is for.** It is about WIDTH, not colour — which colour a container takes is
  the rule already stated. A SIDE rule is not a container edge and is not governed (the nav spine's
  underline). The reason it is a rule at all: a width handed to `Card` through `className` beats
  `Card`'s own `border` only by SOURCE ORDER, measured at bytes 16,788 and 16,910 of Loft's built
  stylesheet, equal specificity.
- **§2 Accent** gains "and a drop target with a file over it" to the `accent` row, because that token
  now carries a transient meaning beside its standing one.
- **§5 Containers** gains a `DropZone` bullet: a file target, `Card` at `muted` at rest and `accent`
  while a file is over it, owning the file input and the picker (a drop zone with no click-to-pick is
  broken on every touch device) and owning **where** a refusal appears while the caller owns **what**
  it says.
- **§9** gains a `containerBorderWidths` command, target 0, and a paragraph saying why the two card
  counts cannot cover it: both need `rounded-xl` and a border token in ONE literal, and a `Card`
  caller never spells the radius.
- **§5's `DropZone` bullet gains a `useFileDrop` paragraph** (added 2026-08-18 with P18 increment 3),
  verbatim:

  > **A file target that cannot be a card takes `useFileDrop` instead** — the drag half on its own,
  > which is what `DropZone` is built from. The flight-log intake is that case: an inline control in a
  > toolbar row inside a `Figure` inside a `Card`, where the card-shaped primitive would be a card
  > inside a card. One behaviour, two presentations, so the three things a drop target has to get
  > right — depth-counted highlight, `Files`-only arming, and an unconditional `dragover` cancel so a
  > dragged link cannot navigate the app away — are written once. A surface that needs its own drag
  > handling beyond that is not a file target and should not have one.

  And the sentence it is appended to needs correcting in BOTH copies while you are there: §5 says
  *"one `accept` list drives the picker **and** the drop"*, which is false of `DropZone` itself —
  `take` checks no extension, and the name gate was deliberately reverted by increment 2's own review
  because Loft's importer sniffs bytes. It should read: the `accept` list drives the picker; the
  refusal is the reader's, rendered inside the zone.

## What this run learned that outlasts its increments

1. **An intermittent test is a defect reported as a mood, and the fix is a second assertion rather
   than a retry.** The print-contrast sweep could only see the fade defect one run in three. That is
   not a guard: it is a die roll a session will eventually read as noise. The answer was a
   timing-free count of what is still animating under print — with the SCREEN count asserted non-zero
   first, so an app that transitioned nothing could not satisfy it vacuously. **When a test fails
   sometimes, ask what it would take to make it fail every time, and add that.**
2. **Classify every absent-assertion against its gate before believing the count.** Increment 27's
   e2e swept two panels for twenty-one labels; **nineteen could not go red under any bug** — the
   label was `!only`-gated, or relabelled by an `only ?` expression, or sat on a key the OLD mask
   already blanked. A long list of `toHaveCount(0)` reads as thoroughness and can be nothing at all.
   *And the corollary that caught a real defect: a leak sweep scoped to `label` cannot see a caption,
   a hint or a `<p>`. The canopy's provenance line is text.*
3. **A decision entry that argues carefully about one control is evidence about that control and
   nothing else on the same row.** The `drogueDiameter` decision was written out at length while
   `mainDeployAltitude` — the field immediately beside it, ungated, belonging to a different
   component — went onto the same panel unexamined. Thoroughness about one thing reads as
   thoroughness, to its own author most of all.
4. **A mask cannot reach a control gated on nothing.** Both of the leaks this run fixed shared a
   shape: the containment was somewhere other than where the fix was. The Cd/mass pair was contained
   by a fieldset gate, not by the mask; the deploy altitude was contained by nothing. **Before
   trusting a filter, enumerate what it CANNOT see.**
5. **The gate is measured on a QUIET box, and the written rule was too narrow.** A read-only review
   agent running the type-checker and the unit suite alongside a shard loop turned shard 2 from
   75 passed into **32 failed**, every one of which passed in isolation. `MAINTAINING.md` said "never
   run two shards concurrently"; it now says the broader thing. Subagents may READ during a gate.
6. **Polish makes latent defects reachable.** The `transition` added so a drop highlight would fade
   is on 96 other call sites and had never printed, because no transitioning element with a dark
   ground had sat inside `main` on the flight page before. **A one-line style addition is a change to
   every rule that competes with it** — here, the whole `@media print` block.
7. **Extract before you test, when the thing you need to test is inside a component.** The per-aim
   mask was an inline expression in a `.tsx` file, in a repo with no component tests, so nothing
   could drive it and a whole increment was withdrawn over what it did. Moving it to `lib/` was three
   lines and turned an unverifiable rule into one with an exact-set assertion and two live controls.
8. **Read the key space out of the declaration, never copy it.** The mask's unit case parses the 67
   `designDims` keys out of the component's own type text. A hand-written second list would have
   passed while the real type grew a key the allowlist had never heard of — which is the precise
   defect the increment existed to remove, re-entering through its own test.
9. **A ledger number is a claim and gets re-measured with everything else.** Five figures written
   this run were wrong on first draft — `31` tsc errors (20), "thirty-odd" `massCarriedBy` sites (44),
   "ten surfaces" (8), "the seven `unreachable*` counts" (8), and an array in registry order where
   the code produces tree order. The last one was a red test; the rest would have shipped.

## The environment, measured 2026-08-18 (run 20)

- **The container was COLD** — no `node_modules`, no `corpus/`, and `/opt/pw-browsers` held
  chromium-**1194** while this repo's Playwright (1.61.1) manages **1228**.
  `npx playwright install chromium` fetched it in about a minute. **Ninth consecutive run that has
  paid for it**; it stays paid until it is in the environment's setup script.
- **The fixtures repo IS attached** at `/home/user/loft-fixtures`; five per-tool symlinks into
  `corpus/` and the suite names **35 design files**.
- **The SIBLING repo is NOT reachable.** Both `add_repo` and a plain `git clone` are refused by the
  harness before they reach GitHub, while `list_repos` shows it public with `can_push: true` — so the
  account has the access and the session may not use it. Parked for the owner; the fix is attaching it
  as a second source at session creation, exactly as the fixtures repo is.
- **A full gate is ~20 minutes** on a quiet box (lint ~1 min, build ~1 min, unit ~7 min, e2e
  4×1.5 min). **With anything else running it is not a gate**: a review agent running `tsc` and
  `vitest` alongside it produced 32 failures that all passed in isolation.
- **FOUR e2e shards, and 299 tests** — 75 + 75 + 75 + 74. `for i in 1 2 3 4; do npx playwright test
  --shard=$i/4; done`, sequentially, and read the failure LINE, never the tail.
- **The clone is SHALLOW.**
- **Git identity arrived as the harness vendor's default** and was set per-repo before the first
  commit. **The harness appends its attribution footer to every PR body on creation** — three for
  three this run — and does NOT append on update, so re-posting the body strips it. It also
  HTML-escapes ASCII apostrophes and quotes in the posted body and eats an `<x>` placeholder, so
  write PR prose with typographic quotes and no angle brackets. Read the body back every time.
- **The remote feature branch holds the PRE-SQUASH commit after each merge**, so the next push is
  rejected as behind. Confirm the remote head's TREE equals `origin/main`'s (it does, after a squash
  merge) and then `--force-with-lease`. Three times this run.
- **A browser cannot reach the live site from here.** Outbound HTTPS goes through the agent proxy and
  Chromium is not configured for it — `page.goto("https://loft.fusionspace.co/")` fails
  `ERR_CONNECTION_RESET` while `curl` works. So a production WALK is curl plus string probes, and the
  browser journey is run against `out/` **after checking the served asset's hash matches the local
  one** — which is a stronger claim than a browser walk anyway, and is how this run verified the print
  fix.
- **`npx tsc --noEmit` reports 20 errors, all in test files**, which `npm run build` never reads.
  Filed, with the live count.

## The arc across sessions

- **Run 20 (2026-08-18, this one).** Four shipped units across three PRs: **R12 increment 25** (a
  field-made boattail becomes editable), a **licensing Sev-1** (`THIRD-PARTY-NOTICES.md` denied
  shipping RocketPy while the build ships it — 23 wheels, 11 licences, one LGPLv3+, plus
  `scripts/check-notices.mjs` so the claim cannot drift from the artifact again), **R12 increment 26**
  (Sev-1: a fin set's root stays on the airframe, bounded per stage, moved as a rigid group),
  **P18 increment 3** (the flight-log intake becomes a drop target; `useFileDrop` extracted from
  `DropZone`) with a print-sheet fix beside it, and **R12 increment 27** (the drogue and the payload
  get their panels; the per-aim mask blanks by allowlist). **P19 decomposed.** `COMPETITION.md` rows
  54 and 55 added, row 54 narrowed. PRs **#191**, **#192**, **#193**, **#194**, all merged; production
  walked after each and the gap is zero. **Every one of the three pre-push reviews found a real
  defect the gate could not see, and one of them found the increment shipping the defect it was
  written to fix.**
- **Run 19 (2026-08-18).** Eight increments: **P18 increment 2** (`DropZone` —
  `cardTreatments` 3 → 1, outside the primitives file 2 → 0, and a refusal moved 765 px up into the
  zone the file landed on), **R12 increment 24** (three dead add controls on every design), and **six
  Sev-1s** — the offline reload loop, an authored mass hanging out of its host for up to 2.73 cal, real
  part masses printing as a flat zero on 18 of 35 designs, a Conditions summary claiming "as designed"
  after the flyer replaced them, the fallback-canopy caveat reaching one surface of three, a
  design with no centre of pressure being given one **with a band on it**, and a RASAero boattail
  described twice and built twice. `COMPETITION.md` rows 52 and 53. PRs **#188** and **#189**.
- **Run 18 (2026-08-17).** R12 increments 21 and 22 — a mass goes inside anything with a bay; the whole
  add vocabulary on screen. P18 written and increment 1 shipped (`Toast`). PRs #185, #186, #187.
- **Run 17 (2026-08-17).** Two Sev-1s and three increments; **P17 SHIPPED**, R12 reached increment 20.
- **Run 16 (2026-08-14).** P17 increment 1; R12 increment 19. `COMPETITION.md` row 49.
- **Run 15 (2026-08-13/14).** A Sev-1 on the design's caliber. **P16 SHIPPED.** R12 reached 18.
- **Run 14 (2026-08-13).** P15 shipped, R12 increment 15, P16 increment 1.
- **Run 13 (2026-08-12).** P14 shipped, P15 written, R12 reached 14.
- **Run 12 (2026-08-11).** The lumped-airframe Sev-1 family closed. PRs #166–#170.
- **Run 11 and earlier.** R12's editor family, P13's shared design system, P10's repo surface, P7's
  dark mode. See `ROADMAP.md` for each milestone's *done when*.

## Standing hazards this run re-confirmed

- **Never push straight to `main`** — the deploy fires on any push, gated on nothing.
- **Read the gate's failure LINE, not its tail.** `| tail -4` scrolls the "N failed" header off the
  top; grep for `passed|failed|did not run`.
- **The gate is measured on a QUIET box.** Not just "no two shards": no subagent running `tsc`, no
  second `vitest`, nothing. A review agent doing exactly that turned 75 passed into 32 failed.
- **Four e2e shards, sequentially**, and re-run a failure in isolation before believing it — but a
  test that fails in a shard and passes alone is not automatically contention: run 19 had one that was
  real and three that were not, and the difference was measurable in ten minutes. Run 20's print-sheet
  failure was real and reproduced 8 of 24 times; the way to see it was to clone the test twelve times
  into a throwaway spec and print the diagnostic the assertion could not.
- **Every e2e negative control is `revert → rebuild → run → restore → rebuild`**, because the suite
  serves `out/`. And the revert has to COMPILE: `noUnusedLocals` turns the obvious one-line revert
  into a red build that leaves the previous `out/` in place, so the control passes and proves nothing.
  Revert by changing a VALUE the fix depends on, not by deleting the code that uses it.
- **A merged PR cannot track new work.** After merging, `git checkout -B <branch> origin/main`.
- **`DESIGN.md` §9, measured this run**: `npx vitest run lib/design-system.test.ts` is the authority
  and it is **30 passed, 30 of 30**, every count at its stated target — radius drift 0, border drift 0,
  mismatched border pairs 0, card treatments 1, card treatments outside the primitives file 0,
  container border widths 0, elevations outside §2's two 0, off-scale spacing 0, off-scale type 0,
  inverted files 0, hand-rolled `<select>` 0. Nothing this run moved any of them.
- **The corpus is real and it ran**: `lib/corpus/sweep.test.ts` is **49 passed** over **35 design
  files** — 909 stored comparisons scored with 1 withheld, ground-hit velocity 0.7% against
  OpenRocket's stored figures over 76 flights, 568 parts × 6 add gestures each carrying a reason,
  217 bay parts taking an authored mass with 0 moving the mould line or the stability solve.
- **`OWNER-NOTES.md`: all 12 open notes carry a verdict and none is pending.** *(The previous handoff
  said 13; the Open section holds twelve distinct notes — ON-1 … ON-10 plus ON-B1 and ON-B2 — and the
  extra count came from ON-4 being named twice, once in its own note and once in the cluster header.)*
  No new notes arrived this run, so every verdict is the 2026-08-08 one from the run that first saw
  them. `## Awaiting the owner` holds 11 entries; the two newest are still live — the signing key only
  the owner can register, and the sibling repo this session could not reach.
