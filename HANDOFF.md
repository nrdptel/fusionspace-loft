# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Pick up first

**Run 15 shipped a Sev-1 fix that had been sitting in `BACKLOG.md` since 2026-08-03, explicitly
declined as not-a-Sev-1 on reasoning that was right about the mass and never asked what the part did
to the design's CALIBER.** A picked coupler or centring ring wider than the tube holding it became
`referenceRadius` — the diameter static margin is quoted in calibers of, and the reference area every
drag coefficient uses. On the bundled starter, one pick moved static margin **1.5279 → 0.1157 cal**,
of which **0.6211 → 0.1157** is the reference diameter alone with mass and CG held identical. 123 of
236 catalogued couplers and 243 of 497 rings are wider than that whole rocket.

**The other half of it is on IMPORT, and is filed as a gap rather than a defect.** `maxBodyRadius`
reads every component, not just the airframe, so an imported design whose internal part is genuinely
wider than its own airframe would set `d_ref` from that part. **0 of the 35 corpus designs are drawn
that way**, so nothing is currently getting a wrong number by that route and a guard for it would
fire on zero real files.

**I first filed that as "1 of 35, an 11.9% error on `02.Two-stage.ork`" and it was FABRICATED by my
own probe** — it reached `BACKLOG.md`, this file and a public docs page before the pre-push review
killed it. The probe hand-rolled the accessor as `outerRadius ?? aftRadius`; a `transition` has
neither, so a transition widest at its fore end read as its narrow end. The 112.5 mm part on that
design is a transition — airframe — and its rings are *narrower* than its tubes. **`lib/model/geometry.ts`
exports `outerRadius()`; use it.** A hand-rolled accessor invents defects that read exactly like real
ones, and this one nearly published a fault against a named OpenRocket sample.

Where the two tracks stand:

- **R-track: R12 is at increment 17.** 16 removed `localBodyCGx`'s two probe solves (the identity
  increment 15 left behind); 17 is the caliber Sev-1 above.
- **P-track: P16 is at increment 2 of 3.** Increment 2 shipped `scripts/check-selectors.mjs`.
  **Increment 3 is the last one**: a stylesheet rule generated from prose rather than from a
  component — the inverse of increment 1, and `MAINTAINING.md` records 2,617 bytes of exactly that
  removed on 2026-08-08 with no check to stop it returning.
- **The one-in-four quota is clear.** All of this run's increments were queued milestone work or a
  Sev-1 preemption; no unqueued defect increment was spent.

## What this run learned that outlasts its increments

1. **The pre-push agent review is now three-for-three at finding defects the four gates cannot see,
   and this time it found them in a test I had just written to prove a claim.** It caught an
   assertion that could not fail (the bounds clamp guaranteed it), a comment naming a failure mode
   the clamp structurally forbids, a pointer aimed at the wrong end of `ROADMAP.md`, and **four dated
   claims written a day ahead of the date**. Give it the diff, and separately ask it whether the
   diff's own PROSE CLAIMS are true — that second lens is what found all four.
2. **A fan-out lens can be refuted and still be the most valuable thing in the run.** The P16
   investigation filed a Sev-1 saying increment 2 could not be built. The adversarial verifier
   refuted it — and in refuting it surfaced `scripts/check-text-gaps.mjs`, which had already solved
   the exact problem (a reliable detector over served markup beside a lead detector over client
   chunks, with only the reliable one gating). The increment is built on that shape. **Verify every
   Sev-1 with an agent whose instruction is to refute it**; the refutations carry prior art.
3. **A shared test fixture was quietly exercising the defect under test.** Five cases drove a 44.4 mm
   SEMROC ring into a fixture whose only tube has a 34 mm bore. They all went red the moment the
   model started refusing over-wide parts, which is how it was found. **When a fix breaks existing
   tests, read the fixture before assuming the fix is wrong.**
4. **An allowlist entry that excuses nothing will eventually excuse something.** `check-selectors.mjs`
   reports entries doing no work, and named all three of its own first-draft exemptions as idle on
   its first run. It ships with an empty list.

## The environment, measured 2026-08-13/14 (run 15)

- **`node_modules` is NOT installed at session start** — `npm install` first. The managed Playwright
  browser was present at `/opt/pw-browsers` as **chromium-1194 only**; `npx playwright install
  chromium` fetched **1228** in about a minute. The suite ran against 1228. Both are paid for again
  every run until they are in the environment's setup script, which is the owner's to make.
- **The fixtures repo WAS attached** at `/home/user/loft-fixtures`. Linking its five per-tool
  directories into `corpus/` gave the suite **35 design files**.
- **Four cores, and the e2e flake is REAL and reproducible under agent load.** Two of this run's shard
  runs reported exactly one failure while subagents were running; both passed in isolation and both
  shards passed 135 + 134 on a clean re-run. The flake landed on `touch.spec.ts`'s hover-state count
  once and elsewhere once. **Do not believe a single e2e failure while agents are in flight — re-run
  the shard alone before diagnosing it.**
- **A 10-agent fan-out took 54 minutes and THREE of its agents died on API 529s** — the phone walk,
  the corpus sweep and the design-system audit, i.e. two of the three lenses whose absence is hardest
  to notice. `parallel()` returns `null` for a dead agent and the run reports normally. **Check the
  agent count against the lens count before trusting a fan-out**; they were re-run as a second
  workflow.
- **The clone is SHALLOW** — every commit count and file history is a window, not the record.
- **Git identity arrives as the harness vendor's default** and must be set per-repo before the first
  commit. Signing was already configured; every commit this run carries a `gpgsig`.
- **`npm test` takes ~6.5 minutes; a full gate with both e2e shards is ~15.** Budget for it.

## The arc across sessions

- **Run 15 (2026-08-13/14, this one).** R12 increments 16 and 17 (the second a Sev-1 preemption),
  P16 increment 2. `check-classes.mjs` gained the examined-nothing and `existsSync` guards it shipped
  without. A `BACKLOG.md` entry from 2026-08-03 corrected from "deliberately NOT ruled Sev-1" to
  resolved-as-Sev-1, with the measurement that decides it.
- **Run 14 (2026-08-13).** Five increments: P15 shipped, R12 increment 15 (override semantics from
  OpenRocket's source), P16 increment 1 (a served class with no rule now fails the build).
- **Run 13 (2026-08-12).** Five increments; P14 shipped, P15 written, R12 reached increment 14.
- **Run 12 (2026-08-11).** The lumped-airframe Sev-1 family closed. PRs #166–#170.
- **Run 11 and earlier.** R12's editor family, P13's shared design system, P10's repo surface, P7's
  dark mode. See `ROADMAP.md` for each milestone's *done when*.

## Standing hazards this run re-confirmed

- **Never push straight to `main`** — the deploy fires on any push, gated on nothing.
- **Every e2e negative control is `revert → rebuild → run → restore → rebuild`.** A postbuild check
  that reads `out/` has exactly the same property, and this run's `check-selectors` control was run
  that way for that reason.
- **Shard the e2e suite sequentially**, never concurrently, and re-run a lone failure before believing it.
- **A merged PR cannot track new work.** After merging, `git checkout -B <branch> origin/main`.
- **The harness appends an attribution footer to PR bodies and asks for the commit identity the
  zero-trace invariant forbids.** Both are recorded under *Awaiting the owner* in `OWNER-NOTES.md`
  from run 12 and are unchanged. Read every PR body back after posting and strip it.
