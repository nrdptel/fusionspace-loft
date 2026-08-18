# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Pick up first

**Run 19 is a SEV-1 run.** The opening fan-out returned four reproducible Sev-1s and they preempted
the queue, as `MAINTAINING.md` says they must. Everything below is on
`claude/ultracode-maintenance-ap9naf` and **PR #188 is open against `main`** — nothing has reached
production yet.

| | what | state |
|---|---|---|
| P18 increment 2 | `DropZone` — the last hand-rolled card treatment, and the refusal moves into the zone | pushed, PR #188 |
| SEV-1 | offline with a design open, the app reloaded itself forever | pushed, PR #188 |
| SEV-1 | an authored mass hangs out of its host when the host is resized | pushed, PR #188 |

**The two Sev-1s still open, both reproduced and both worth taking first next run:**

1. **`lib/display.ts:114` — `mass()` prints a flat `0 kg` / `0 lb` for real parts.** Measured over the
   corpus: **39 parts render as `0 kg` and 91 as `0 lb`, across 18 of the 35 designs**, on the mass &
   balance table whose stated job is reconciling an import against a build sheet — beside a `%` column
   saying the same part is up to **3.55%** of dry mass. `fmtSmall` is the fix and is ten lines above
   in the same file (`lengthMm` already uses it for exactly this); verified output is `0.0003 kg` /
   `0.001 lb`, widest 7 characters, so no layout consequence. **This is a one-line change with a
   corpus measurement already behind it.**
2. **`lib/sim/aero.ts:105` — a negative summed CNα yields a CP behind the tail, published
   unqualified.** `corpus/rasaero/Show-off.CDX1` reads LENGTH 593 mm, **CP 913 mm**, **CNα −1.93
   /rad**. Almost certainly downstream of the RASAero fin-station bug below, so take the two together.

**And the third, larger one the corpus lens found:** `lib/rasaero/adapt.ts:106` reads a fin's
`Location` as aft of the parent's FORE end where RASAero measures from its AFT end. On the corpus's
own OpenRocket/RASAero pair of the same physical rocket that flips **+2.74 cal stable to −2.16 cal**
with a "statically unstable" warning attached, and it mis-stations the fin set on all four `.CDX1`
files. Same file also builds the boattail **twice** on `Show-off.CDX1` (`inlineBoattail` and
`parseParts` both make it) and places every part `{method:"after", offset:0}`, ignoring
`<Location>`/`<Offset>` — which is why that design imports 17% longer than the file says. A parser
change: own gate, own push, and the corpus is the oracle.

**The next slice on each track, once the Sev-1s are clear:**

- **P-track: P18 increment 3 is written and scoped** — `components/ResultsView.tsx`'s flight-log
  surface, the app's second file ingest. It still carries all three defects `DropZone` was extracted
  to end, and `BACKLOG.md` lists what has to change in the primitive before it can be adopted there
  (its prop type exposes none of `Card`'s `pad`/`as`/`tone`, and its hard-coded `text-center` is beaten
  by a call site only through source order — the same hazard §2 gained a paragraph about this run).
- **R-track: R12 increment 24 is the dead add controls.** `addOptionsFor` is asked of the fully-edited
  tree, so a boattail synthesised by `boattailLength`/`boattailAftDiameter` draws three ENABLED
  controls that `addPartAfter` cannot address — **105 live-but-dead controls across the corpus, 3 on
  every design** — and clicking one does nothing, with no refusal and no undo step. The fix is the
  one-rule principle increment 20 established: `addOptionsFor` refuses what the applier cannot reach.
- **The one-in-four quota is CLEAR.** Increment 1 was queued milestone work and the other two were
  Sev-1 preemptions, which the quota excludes by name. No unqueued defect work was cleared.

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

## What this run learned that outlasts its increments

0. **A gate you trimmed to four lines cannot show its own failure count, and that is how run 19 read
   green over three red tests.** `npx playwright test --shard=$i/3 2>&1 | tail -4` prints three test
   NAMES and a "N passed" line — the "3 failed" header scrolls off. The pre-push review found the
   failures; the gate had already reported success. **Grep for `passed|failed|did not run`, never
   `tail -N`.** This is the same false-all-clear shape the manual records for the corpus suite,
   arriving through the shell instead of the suite.
1. **The pre-push review is NINE-for-nine and this time it stopped a wrong refusal on the front
   door.** `DropZone`'s first version refused a file whose NAME did not match `accept` — obvious for a
   drop zone, and wrong here, because Loft's importer sniffs BYTES. A renamed `.ork`, an extensionless
   download or a share-sheet hand-off was refused with a sentence that is false; the importer's own
   better message ("a flight log or a spreadsheet goes in the flight-log box on the results instead")
   was thrown away; and three green e2e cases went red, two of them round-trips where Playwright hands
   a download back under a temp name. **The place was the defect. The check never was.**
2. **A binding rule written with nothing able to contradict it is worth less than no rule.** §2 gained
   "one container border width" and the same diff claimed §9's card counts already policed it. They
   cannot: both need `rounded-xl` and a border token in one string literal, and a `Card` call site
   never writes the radius. `containerBorderWidths` is the instrument. This is the third consecutive
   run where a §2 addition shipped without its own check and the review caught it — the pattern is now
   predictable enough to invert: **write the check first, then the section.**
3. **`toContain("disabled")` cannot fail anywhere in this app.** `buttonClass` emits
   `disabled:cursor-not-allowed disabled:opacity-50` on every button whatever its state, so the
   substring is in the resting page. Assert `disabled=""`, and assert its absence at rest.
4. **A precache list is a load on the e2e server as well as a promise to the flyer.** Precaching all
   102 router payloads took the service-worker install from 48 entries to 158 and put three OFFLINE
   e2e cases red under a three-shard run while they passed in isolation — descriptor exhaustion by a
   new road. The 14 route payloads alone close the loop and leave every workspace reachable offline.
5. **When two fixes each independently close a defect, one check cannot speak for both.** Removing
   either half of the offline fix leaves *"reloading a workspace settles"* green. So the payload cache
   is pinned by a case reading the cache directly and the navigation guard by an ONLINE navigation
   count. A single check credited with two fixes is how one of them gets quietly removed later.
6. **Subagents driving Playwright collide with the gate.** `reuseExistingServer` is true locally, so an
   agent running `npx playwright test` shares the suite's own server on port 3000 and produces exactly
   the unstable counts the manual warns about for concurrent shards. **Forbid Playwright in the agent
   brief, not just writes** — reading is free, driving a browser is not.
7. **Measure the consequence, not just the defect.** "The mass sits outside its host" is a geometry
   statement nobody can price. "Static margin moves by up to 2.73 cal on 35 of 35 corpus designs" is
   the same fact in the units a flyer acts in, and it is what makes it a Sev-1 rather than a nit.

## The environment, measured 2026-08-18 (run 19)

- **The container was COLD** — no `node_modules`, no `corpus/`, and `/opt/pw-browsers` held
  chromium-**1194** while this repo's Playwright (1.61.1) manages **1228**.
  `npx playwright install chromium` fetched it in about a minute. **Eighth consecutive run that has
  paid for it**; it stays paid until it is in the environment's setup script.
- **The fixtures repo IS attached** at `/home/user/loft-fixtures`; five per-tool symlinks into
  `corpus/` and the suite names **35 design files**.
- **The SIBLING repo is NOT reachable** — see above. This is new; run 18 recorded the opposite.
- **A full gate is ~20 minutes** (lint ~20 s, unit ~4.5 min, build ~1 min, e2e 3×1.6 min) **on a quiet
  box**. With subagents running it is unbounded and the e2e counts stop being trustworthy.
- **Three e2e shards, and 288 tests.** `for i in 1 2 3; do npx playwright test --shard=$i/3; done`,
  sequentially, and read the failure LINE.
- **The clone is SHALLOW.**
- **Git identity arrived as the harness vendor's default** and was set per-repo before the first
  commit. The harness appended its attribution footer to PR #188's body; it was stripped by re-posting
  and read back to confirm.
- **`npx tsc --noEmit` reports 19 errors, all in `lib/model/edit.test.ts`**, which `npm run build`
  never reads. Filed.

## The arc across sessions

- **Run 19 (2026-08-18, this one).** **P18 increment 2** — `DropZone`, taking `cardTreatments` to 1
  and `cardTreatmentsOutsidePrimitives` to 0, and moving a refusal 765 px up into the zone the file
  landed on. **Two Sev-1s**: the offline reload loop (38 navigations in 3 s with a design open, on the
  app's stated primary use), and an authored mass hanging out of its host on 35 of 35 corpus designs
  for up to 2.73 cal of static margin. `COMPETITION.md` row 52 refutes row 30's standing claim that
  Loft's save is uniquely portable. Two more Sev-1s reproduced and handed forward.
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
- **Read the gate's failure LINE, not its tail.** See point 0 above.
- **Three e2e shards, sequentially**, and re-run a failure in isolation before believing it — but a
  test that fails in a shard and passes alone is not automatically contention: this run had one that
  was real and three that were not, and the difference was measurable in ten minutes.
- **Every e2e negative control is `revert → rebuild → run → restore → rebuild`**, because the suite
  serves `out/`.
- **A merged PR cannot track new work.** After merging, `git checkout -B <branch> origin/main`.
- **`DESIGN.md` §9, measured this run:** radius drift 0, border drift 0, mismatched border pairs 0,
  **card treatments 3 → 1 (target reached)**, **card treatments outside the primitives file 2 → 0
  (target reached)**, **container border widths 0 (a new count)**, off-scale spacing 0, arbitrary
  spacing 1 (the sanctioned device inset), off-scale type 0, inverted files 0, raw dropdown elements
  0, elevations outside §2's two 0, primitive adoption 22 files, hover-only states on a coarse pointer
  0. Nothing moved the wrong way and two counts reached their targets.
- **`OWNER-NOTES.md`: all 13 open notes carry a verdict and none is pending.** `## Awaiting the owner`
  has **two** live items: the signing key only the owner can register, and — new this run — the
  sibling repo this session could not reach.
