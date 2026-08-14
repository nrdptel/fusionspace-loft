# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Pick up first

**Everything run 15 shipped is MERGED and LIVE. Nothing is pending.** Two pull requests, #178 and
#179, both green on CI and both merged; `main` is at `59bf140`. Confirmed on the deployed site rather
than inferred from a green merge: `loft.fusionspace.co/docs/methods` serves this run's `d_ref`
paragraph, and **the deployed stylesheet is 63,670 bytes — the exact figure P16 increment 3 measured
locally**, so the byte reduction is verifiable in production.

**One increment was built, gated green, and WITHDRAWN — read `ROADMAP.md`'s P17 before rebuilding
it.** P17 increment 1 persisted the undo stack so a docs link stops destroying it. It passed lint,
1,261 unit tests, six postbuild checks and its own e2e case with a working negative control. Its
pre-push review found that `WhatIf.weather` holds an `Atmosphere` **class instance** and a
`windProfile` **function**, neither of which survives `JSON.stringify` — so a step committed under
today's weather throws when replayed, `undoStep` does not consume a step whose apply fails, and the
stack jams permanently with raw JavaScript on screen. **A one-way door created by the fix for
one-way doors.** Verified directly before withdrawing: the round trip leaves `atmosphere.sample`
undefined and calling it throws. Seven concrete requirements for the next attempt are in the P17
entry, all measured — including a 1.85 MB worst-case record against a guard that only sees the
design's 6 KB.

**The next slice on each track:**

- **P-track: P17 is written and NOT STARTED.** *The shell survives every navigation, including the
  ones it does not own.* **Increment 1 is the next P slice and it is a rebuild, not a resume** — the
  withdrawn attempt is documented in full, and the first thing it must do is stop persisting a state
  object that holds a class instance and a closure.
- **R-track: R12 is at increment 18.** The next slice is filed and measured: **`referenceRadius`
  takes the widest component in the design rather than the widest part of the AIRFRAME.** Increment
  17 closed the authoring route; the import route is open, **0 of 35 corpus designs exercise it**, so
  it waits for a file that does — a guard firing on zero real files is worse than nothing. If it is
  taken, establish first what OpenRocket's `MAXIMUM` reference type actually measures, from its
  published documentation.
- **The one-in-four quota is CLEAR.** Every increment this run was queued milestone work or a Sev-1
  preemption; no unqueued defect increment was spent.

## What this run learned that outlasts its increments

1. **The pre-push agent review is four-for-four, and this run it twice found defects in work whose
   whole point was rigour.** It caught an assertion that could not fail inside a test whose docblock
   claimed it could not pass by construction; four dated claims written a day ahead of the date; and
   — worst — **a fabricated corpus finding of my own** that had reached the ledger, the handoff and a
   public docs page. Give it the diff, and separately ask whether the diff's own PROSE CLAIMS are
   true. That second lens found all of it.
2. **Use the codebase's own accessor in a probe.** The fabricated finding came from hand-rolling
   `outerRadius ?? aftRadius`; a `transition` has neither, so one widest at its FORE end read as its
   narrow end and a probe invented an 11.9% error on a named OpenRocket sample.
   `lib/model/geometry.ts` exports `outerRadius()` and answers for every kind.
3. **A checker's first design is usually wrong in a way that still prints a pass.** `check-classes`'s
   inverse half went through two: substring matching let 476 of 484 classes pass by being embedded in
   a longer name, and lexing string literals out of minified JS desynchronised on an apostrophe in
   English prose. Both printed clean. **Measure what fraction of the population your check can
   actually see before believing its zero.**
4. **When a fix breaks existing tests, read the FIXTURE before assuming the fix is wrong.** Five
   cases were driving a 44.4 mm ring into a design whose only tube has a 34 mm bore — they were
   exercising the very defect under repair, and went red the moment the model started refusing it.
5. **A refuted fan-out finding can be the most valuable thing in the run.** The P16 investigation
   filed a Sev-1 saying increment 2 could not be built; the adversarial verifier refuted it and, in
   refuting, surfaced `check-text-gaps.mjs` — which had already solved the exact problem. Two
   increments are built on its shape. **Verify every Sev-1 with an agent told to refute it.**
6. **`readSlot` rebuilds `SavedSession` field by field, and its docblock says a new field must be
   named there or it is "written cleanly and silently dropped on the next read".** That is exactly
   what P17 increment 1's first draft did. The file had already written down how to get it wrong.
7. **A green gate is not an argument that a persisted shape is data.** P17 increment 1 stored an
   object holding a class instance and a closure; lint, 1,261 unit tests, six postbuild checks and a
   purpose-built e2e case with a working negative control all passed, because the failure needs a
   fetched forecast, an edit, a navigation and an undo in that order and nothing walks that sequence.
   **Argue a persistence change from the SHAPE of what is stored, field by field, not from a passing
   suite.**

## The environment, measured 2026-08-13/14 (run 15)

- **`node_modules` is NOT installed at session start** — `npm install` first. The managed Playwright
  browser was present as **chromium-1194 only**; `npx playwright install chromium` fetched **1228** in
  about a minute, and the suite ran against 1228. Both are paid for again every run until they are in
  the environment's setup script, which is the owner's to make.
- **The fixtures repo WAS attached** at `/home/user/loft-fixtures`. Linking its five per-tool
  directories into `corpus/` gave the suite **35 design files**, and it named that count itself.
- **Four cores, and the e2e flake is REAL and reproducible under agent load.** Two shard runs
  reported exactly one failure while subagents were running; both passed in isolation and both shards
  passed clean on re-run. **Do not believe a single e2e failure while agents are in flight — re-run
  the shard alone first.**
- **A 10-agent fan-out took 54 minutes and THREE agents died on API 529s** — the phone walk, the
  corpus sweep and the design-system audit, i.e. the lenses whose absence is hardest to notice.
  `parallel()` returns `null` for a dead agent and the run reports normally. **Check the agent count
  against the lens count before trusting a fan-out.** They were re-run as a second workflow.
- **A full gate is ~15 minutes** (lint ~20s, unit ~6.5 min, build ~1 min, e2e 2×2.4 min). CI takes
  ~7–8 minutes per job and both jobs ran green on both pull requests.
- **The clone is SHALLOW** — every commit count and file history is a window, not the record.
- **Git identity arrives as the harness vendor's default** and must be set per-repo before the first
  commit. Signing was already configured; every commit this run carries a `gpgsig`.
- **The harness appended the attribution footer to BOTH pull request bodies.** Stripped from each by
  re-posting the body. Read every PR body back after posting.

## The arc across sessions

- **Run 15 (2026-08-13/14, this one).** Five increments merged across two pull requests, and a sixth
  built, gated green and withdrawn on review. **A Sev-1** — a picked coupler or ring wider than its host was setting the whole
  design's reference diameter, moving static margin 0.6211 → 0.1157 cal from the reference alone;
  filed in the ledger since 2026-08-03 and explicitly declined as not-a-Sev-1 on reasoning that never
  asked what the part does to the caliber. **P16 SHIPPED** (all three clauses, each with its own
  negative control). **P17 written**, and its first increment attempted and pulled — see above. R12
  reached increment 18. `COMPETITION.md` row 48.
- **Run 14 (2026-08-13).** Five increments: P15 shipped, R12 increment 15 (override semantics from
  OpenRocket's source), P16 increment 1.
- **Run 13 (2026-08-12).** Five increments; P14 shipped, P15 written, R12 reached increment 14.
- **Run 12 (2026-08-11).** The lumped-airframe Sev-1 family closed. PRs #166–#170.
- **Run 11 and earlier.** R12's editor family, P13's shared design system, P10's repo surface, P7's
  dark mode. See `ROADMAP.md` for each milestone's *done when*.

## Standing hazards this run re-confirmed

- **Never push straight to `main`** — the deploy fires on any push, gated on nothing.
- **Every e2e negative control is `revert → rebuild → run → restore → rebuild`**, and a POSTBUILD
  CHECK that reads `out/` has exactly the same property. Both of this run's check controls were run
  that way for that reason.
- **Shard the e2e suite sequentially**, never concurrently, and re-run a lone failure before believing it.
- **A merged PR cannot track new work.** After merging, `git checkout -B <branch> origin/main`.
- **Both `## Awaiting the owner` entries in `OWNER-NOTES.md` are unchanged** — the attribution footer
  and the commit identity the zero-trace invariant forbids, both from run 12.
