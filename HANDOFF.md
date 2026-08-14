# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Pick up first

**Run 16 shipped two increments. One is MERGED and LIVE (#181); the second is on the branch with a
green local gate and an open pull request (#182).** `main` is at `32a31c2`. Merging #182 on green is
all that is needed — it is pre-authorised and the run simply ran out of clock after its CI started.

**The next slice on each track:**

- **P-track: P17 is at increment 1 of 3–4.** *The shell survives every navigation, including the ones
  it does not own.* Increment 1 landed the undo stack. **Increment 2 is the Monte-Carlo result** —
  same seam, and the counter-argument is already recorded: re-opening the panel re-flies 300 flights,
  so persisting the RESULT is right where persisting the open/closed flag alone is not. Increment 3
  is the RocketPy run, where "warn before it goes" may be the honest answer rather than a weaker fix.
  Four smaller items are listed under the milestone and deliberately not folded in: bounding the
  record by BYTES rather than by step count, the per-keystroke write cost, `reset()` still discarding
  the stack, and closing the restored top step's run.
- **R-track: R12 is at increment 19, and the next slice is scoped and measured.** Increment 19 made
  "add a tube behind this" reach the nose cone. **The remaining gap is that 419 of the 569 corpus
  parts answer NOTHING when picked** — a ring, a bulkhead, a launch lug and a fin set genuinely take
  nothing, but the panel is silent rather than saying so. The slice is one exported verdict per add
  kind per part, so the panel answers on all 569; it also collapses a rule currently written in more
  than one place, which is how increment 19's gap survived. `COMPETITION.md` row 49 carries the
  framing.
- **The one-in-four quota is CLEAR.** Both increments were queued milestone work.

## What this run learned that outlasts its increments

1. **The pre-push review is five-for-five, and this run it twice found defects in the increment's own
   safety work.** It caught that `readStep` guarded the one field that had broken and passed three
   others through; that nothing capped the stack on READ; that a restored forecast had no age while
   the panel prints the hour without a date; and that the freshness stamp was being taken at the WRITE
   rather than at the fetch, so every edit renewed it. None of those is visible to any of the four
   gates.
2. **Ask what in a persisted object is DATA, field by field, before storing it.** `WhatIf` turned out
   to be fully serialisable except `weather`, which is eleven plain fields plus two things that are
   functions of them. The fix was to extract the derivation, not to drop the weather — and the
   extraction had to take the SORT with it, because `windProfile` walks ascending pairs and the
   invariant had been living in its only caller.
3. **A model test that passes before and after is evidence about the model, not about the fix.**
   Increment 19's applier test builds the same tube either way, because the applier never consulted
   the kind — which is exactly the finding. Only the e2e can pin a guard. Say so in the test rather
   than letting it read as coverage.
4. **A non-null assertion in a render path is a blank screen, not a missing button.** Replacing a
   safe `?.component` with `!.component` in a JSX gate threw inside render and blanked the parts
   table: **11 e2e failures, none of which mentioned the feature being changed.** `selectedId` can
   name a part no longer in the list — the moment after a removal is the ordinary case.
5. **Read the failure line, not the pass count.** A shard reporting `124 passed` was read as the
   silent-shard hazard for several minutes; it was 11 real failures, and the grep that produced the
   number had simply not matched the `11 failed` line above it.

## The environment, measured 2026-08-14 (run 16)

- **The container was WARM from the previous run** — `node_modules`, the five corpus symlinks and
  chromium-1228 were all still present, and `npm install` was not needed. Do not assume this: run 15
  measured the opposite, and the fix either way is the environment's setup script, which is the
  owner's to make.
- **The fixtures repo is attached** at `/home/user/loft-fixtures`; `corpus/` resolves through five
  per-tool symlinks and the suite names **35 design files**.
- **Do not overlap a build with a running gate.** The baseline gate's e2e was invalidated by a
  `rm -rf out && npm run build` started beside it — the suite serves `out/`, so the rebuild pulled
  the ground out from under it. Lint, unit and build had already reported green, which is what the
  baseline was for; the run used its own per-increment gates instead.
- **A 6-lens fan-out took 44 minutes with 8 agents and 0 errors.** Both Sev-1 candidates were refuted,
  and both refutations were more useful than the claims: one caught a filer working from stale
  `BACKLOG.md` line numbers, the other found the freshness stamp measuring the wrong interval.
- **A full gate is ~15 minutes** (lint ~20s, unit ~6.5 min, build ~1 min, e2e 2×2.4 min). CI is ~7–8
  minutes per job.
- **The clone is SHALLOW** — every commit count and file history is a window, not the record.
- **Git identity arrives as the harness vendor's default.** It was already set per-repo this run;
  every commit carries a `gpgsig`.
- **The harness appended the attribution footer to both pull request bodies.** Stripped from each by
  re-posting. Read every PR body back after posting.

## The arc across sessions

- **Run 16 (2026-08-14, this one).** P17 increment 1 — the undo stack survives a docs link, built on
  a `WeatherConditions` split into its data and its two derived members, with the derivation extracted
  so one definition serves both the parser and the reader. R12 increment 19 — "add a tube behind
  this" reaches the nose cone, a guard that was narrower than the code behind it on 35 of 35 designs.
  `COMPETITION.md` row 49.
- **Run 15 (2026-08-13/14).** A Sev-1: a picked coupler wider than its host was setting the whole
  design's reference diameter, moving static margin 0.6211 → 0.1157 cal from the reference alone.
  **P16 SHIPPED.** R12 reached increment 18. P17 written; its first increment attempted and withdrawn.
- **Run 14 (2026-08-13).** P15 shipped, R12 increment 15, P16 increment 1.
- **Run 13 (2026-08-12).** P14 shipped, P15 written, R12 reached increment 14.
- **Run 12 (2026-08-11).** The lumped-airframe Sev-1 family closed. PRs #166–#170.
- **Run 11 and earlier.** R12's editor family, P13's shared design system, P10's repo surface, P7's
  dark mode. See `ROADMAP.md` for each milestone's *done when*.

## Standing hazards this run re-confirmed

- **Never push straight to `main`** — the deploy fires on any push, gated on nothing.
- **Every e2e negative control is `revert → rebuild → run → restore → rebuild`**, and a control that
  fails to BUILD is not a control: reverting a guard can leave an unused import and fail
  `noUnusedLocals`, which reads as the control firing when nothing was tested. Narrow the condition
  instead of deleting the reference.
- **Shard the e2e suite sequentially**, and read the failure line rather than the pass count.
- **A merged PR cannot track new work.** After merging, `git checkout -B <branch> origin/main`.
- **Both `## Awaiting the owner` entries in `OWNER-NOTES.md` are unchanged** — the attribution footer
  and the commit identity the zero-trace invariant forbids, both from run 12.
