# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Pick up first

**Run 18 shipped R12 increment 21 and wrote P18.** `main` was at `c70f8b7` at session start and the
work is on the pinned branch. **The ledger's open Sev-1 count is zero**, and the opening fan-out
claimed none.

**READ THIS BEFORE YOU BELIEVE A RED E2E GATE: two shards are no longer enough.** `MAINTAINING.md`
still says `--shard=1/2 && --shard=2/2`, and at **207 tests** that advice has expired. Measured this
run: two shards reported **12 failures and roughly 58 tests that never ran** — 5 scattered in shard 1
and **7 consecutive at the tail of `touch.spec.ts`** in shard 2, which is exactly the descriptor
clustering the manual describes. **All 12 pass in isolation.** At three shards the same tree is
**93 + 92 + 92 = 277 passed, 0 failed**. Use `for i in 1 2 3; do npx playwright test --shard=$i/3; done`
and add the counts. Filed, because the durable fix is a shard count derived from the test count
rather than a number in a manual that goes stale as the suite grows.

**The next slice on each track:**

- **R-track: R12 is at increment 22.** Increment 21 widened the mass-object gesture from body tubes
  to the five kinds with an interior bay. The next slice is named in `COMPETITION.md` row 50's
  still-owed clause and is the larger half of that row: **OpenRocket's add palette is ALWAYS
  VISIBLE**, so a flyer learns the whole component vocabulary without selecting anything, while
  Loft's verdicts are reachable only by picking a part that cannot take one. A persistent list of the
  six kinds with their verdicts is what makes row 50 `BETTER` rather than merely different.
- **P-track: P18 is WRITTEN and NOT STARTED.** Two named primitives — `Toast` and `DropZone` — to
  absorb the two card treatments hand-rolled at call sites in `components/ServiceWorker.tsx:74` and
  `components/ImportPanel.tsx:168`. Increment 1 is `Toast`. **Read its *done when* before starting:
  the first draft of that milestone was wrong and the correction is recorded in it.**
- **The one-in-four quota is CLEAR.** Increment 21 was queued milestone work; writing P18 is what
  `MAINTAINING.md` requires of a dry track. No unqueued defect work was cleared this run.

## What this run learned that outlasts its increments

0. **The pre-push review is EIGHT-for-eight, and this time it stopped a fabricated number reaching a
   docs page.** The diff published *"across the corpus that covers 20 of the 218 places a mass object
   can be added — measured with the same test the applier uses to decide it"*. **The real figure is
   22**, and the sentence's claim about its method was false: 20 comes from asking whether the whole
   DESIGN states a lumped weight, and the applier asks about the PART. The two it misses are real —
   a stage-level `<overridesubcomponents>` in `EscapeVelocity.ork` (5 hosts) and one inner tube in
   `The Red Hunter.ork`. Re-measured directly, by authoring 50 g into each of the 218 in turn and
   counting where the dry total does not move: **22, over four designs.** Nothing in the four gates
   could see it — the number was in prose.
1. **THREE of the six assertions in the test written to make the widening safe CANNOT FAIL**, and the
   review found that too. A `masscomponent` contributes 0 to `outerRadius`, to `barrowman` and to the
   stacking cursor, so the CP, CNa, length and radius checks hold whatever the rule allows; and the
   "mass landed inside its host" bound holds by construction, the offset being a fraction of the very
   span it is bounded by. They are kept as regression guards against a future change that gives a
   point mass an extent, and are now LABELLED as carrying no control rather than credited with one.
   The falsifiable assertions are the kind list and the 50 g mass ledger. **This is the same false
   all-clear shape this repo keeps recording, arriving inside the test written to close a gap.**
2. **A widened rule needs the SURFACE re-examined, not just the model — and the e2e is the only layer
   that can see it.** The whole add row was gated on `offers.has("bodytube")`, a stand-in for "is
   there anything to show" that held only while every inside-kind was also a behind-kind. An inner
   tube has a bay and no aft face: with the rule widened and that gate untouched, the model would
   author the mass, the button would never render, and the panel would print *"Nothing can be added
   to this part"* over a rule saying the opposite. **The new e2e also caught the transition button
   mid-change**, still unconditional after the comment beside it said otherwise.
3. **`HANDOFF.md`'s own numbers went stale again, and one of them was structurally wrong.** The
   previous handoff proposed P18 as *"a count that moves 3 → 1"*. `DESIGN.md` §9 forbids reaching 1
   the way that framing implies, `lib/design-system.test.ts` already records the honest floor as 3,
   and the milestone as first written would have gone **red on a correct implementation** — its
   *done when* said `cardTreatments` stays 3 while its outcome removes two of the three strings.
   Corrected before a line was written: the target is 1, reachable by composition, and a *new* count
   (`cardTreatmentsOutsidePrimitives`, 2 → 0) is what the milestone actually moves.
4. **Measure the thing the sentence claims, not a proxy for it.** Both of this run's number errors
   were the same mistake: a predicate that is *nearly* the question. 20-versus-22 asked the design
   where the sentence asked the part; 283-versus-128 (recorded last run, corrected in
   `COMPETITION.md` row 50 this run) counted `component.length` where the panel iterates
   `axialLength`.

## The environment, measured 2026-08-17 (run 18)

- **The container was COLD** — no `node_modules`, no `corpus/`, and `/opt/pw-browsers` held
  chromium-**1194** while this repo's Playwright (1.61.1) manages **1228**.
  `npx playwright install chromium` fetched 1228 in about a minute. **This is the seventh consecutive
  run that has paid for it**, and it stays paid until it is in the environment's setup script.
- **The fixtures repo is attached** at `/home/user/loft-fixtures`; five per-tool symlinks into
  `corpus/` and the suite names **35 design files**, 569 parts.
- **The corpus suite names its fixture count in the TEST TITLE, not in a log line** — `imports every
  design file (35 present)` — and `console.log` from vitest is swallowed in this environment.
  `--reporter=verbose` is how you read it. Every other corpus `console.log` is invisible here too, so
  do not treat a missing log as a suite that did not run.
- **A full gate is ~22 minutes** (lint ~20 s, unit ~7.5 min, build ~1 min, e2e 3×2.1 min).
- **The clone is SHALLOW** — every commit count and file history is a window, not the record.
- **Git identity arrived as the harness vendor's default** and was set per-repo before the first
  commit.
- **No pull requests were open at session start** — the first run in a while where that was true.

## The arc across sessions

- **Run 18 (2026-08-17, this one).** **R12 increment 21** — a mass object goes inside any part with
  an interior bay, not only a body tube: **90 → 218 of 569 corpus parts**, and the parts that answer
  NOTHING fall **419 → 351**. Nose ballast in a nose cone and an av-bay inside a coupler, both of
  which the North Star names, were refused on all 35 designs. **P18 written** after the P-track ran
  dry, and its first draft's *done when* corrected before any code. `COMPETITION.md` row 51 added and
  row 50's stale clause resolved.
- **Run 17 (2026-08-17).** Two Sev-1s and three increments; **P17 SHIPPED**, R12 reached increment
  20. The undo for "Import another" replayed the edit bag onto bytes that already carried it; a
  fetched forecast's age was renewed by every edit. `COMPETITION.md` row 50.
- **Run 16 (2026-08-14).** P17 increment 1 — the undo stack survives a docs link. R12 increment 19 —
  a tube can be added behind the nose cone. `COMPETITION.md` row 49.
- **Run 15 (2026-08-13/14).** A Sev-1 on the design's caliber. **P16 SHIPPED.** R12 reached
  increment 18. P17 written; its first increment attempted and withdrawn.
- **Run 14 (2026-08-13).** P15 shipped, R12 increment 15, P16 increment 1.
- **Run 13 (2026-08-12).** P14 shipped, P15 written, R12 reached increment 14.
- **Run 12 (2026-08-11).** The lumped-airframe Sev-1 family closed. PRs #166–#170.
- **Run 11 and earlier.** R12's editor family, P13's shared design system, P10's repo surface, P7's
  dark mode. See `ROADMAP.md` for each milestone's *done when*.

## Standing hazards this run re-confirmed

- **Never push straight to `main`** — the deploy fires on any push, gated on nothing.
- **Three e2e shards, not two** (see the top of this file), and read the failure line rather than the
  pass count. Run them SEQUENTIALLY.
- **Every e2e negative control is `revert → rebuild → run → restore → rebuild`**, and the suite serves
  `out/`. Both of this run's controls fired correctly.
- **A merged PR cannot track new work.** After merging, `git checkout -B <branch> origin/main`.
- **`DESIGN.md` §9, measured this run:** radius drift 0, border drift 0, **card treatments 3**
  (target 1, and P18 is the milestone that gets it there), off-scale spacing 0, arbitrary spacing 0,
  off-scale type 0, inverted files 0, raw `<select>` 0 (3 grep hits, all inside prose comments),
  primitive adoption 22 files, hover-only states on a coarse pointer 0. Only the card count is off
  target, and it now has a milestone.
- **Both `## Awaiting the owner` entries in `OWNER-NOTES.md` are unchanged** — the attribution footer
  and the commit identity the zero-trace invariant forbids, both from run 12. **All 13 open notes
  carry a verdict; none is pending.**
