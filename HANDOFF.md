# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Pick up first

**Run 17 shipped two increments and TWO Sev-1 fixes, all on PR #183.** `main` was at `bde404d` at
session start. Merging #183 on green is pre-authorised. **The ledger's open Sev-1 count is zero.**

**The next slice on each track:**

- **P-track: P17 is at increment 2 of 3–4.** *The shell survives every navigation, including the ones
  it does not own.* Increment 1 landed the undo stack; increment 2 landed the Monte-Carlo result.
  **Increment 3 is the RocketPy run**, and it is the one where *"warn before it goes"* may be the
  honest answer rather than a weaker fix — a ~40 MB runtime download cannot follow a flyer to a docs
  page, and a prompt saying so is not a consolation prize. Four smaller items remain listed under the
  milestone: bounding the session record by BYTES rather than step count, the per-keystroke write
  cost, `reset()` still discarding the undo stack, and closing the restored top step's run.
- **R-track: R12 is at increment 20.** Increment 20 made every part answer what can be added to it.
  **The measured next slice: of the 419 parts that take no gesture, 283 have `length > 0`, so
  `buildAdded`'s mass arm would already build a mass object for them today** — nose ballast in a nose
  cone is the obvious case and the North Star text names it. The panel and the handler demand a body
  tube while the model does not; that is a capability being refused rather than a rule enforced.
  `COMPETITION.md` row 50 carries the framing, and names the larger half still owed: OpenRocket's
  vocabulary palette is ALWAYS VISIBLE, so a flyer learns the whole set without picking anything,
  where Loft's refusal is reachable only by selecting a part that cannot take one.
- **The one-in-four quota is CLEAR.** Both increments were queued milestone work; the Sev-1 was a
  preemption, which the quota excludes — as was the discarded-session replay below.

## What this run learned that outlasts its increments

1. **The pre-push review is six-for-six, and this run it found SEVEN things in the increment's own
   work** — including one that made the feature actively worse than not having it: the dispersion
   panel force-opened at mount on the design id alone, and because all four workspaces render at once
   under `hidden`, that started 300 flights in a panel nobody had opened on every load whose stored
   entry had gone stale. Do not skip this step, and give the reviewer the diff with no other context.
2. **A counter is not an identity, and the difference is a wrong number.** `designKey`'s `loadId` and
   `conditionsKey`'s `weatherSerial` are both `useState(0)` counters bumped per load/fetch. They are
   correct for deciding when to re-fly INSIDE one mount, and worthless across a remount — which is
   exactly the boundary anything persisted has to cross. Two different designs, or two different
   forecasts, stamp identical keys after one. Anything stored must be keyed on CONTENT.
3. **State the control's result even when it refutes your own fix.** The review raised a lag between
   two 350 ms timers; the fix is right and shipped, but reverting it and re-running the case PASSES,
   because both timers drain before React commits. That is recorded in the source, the test and the
   PR as a latent hazard rather than a shipped defect. A fix argued from a test that cannot fail is
   the same false all-clear this repo keeps recording.
4. **`HANDOFF.md`'s own numbers go stale, and this one did.** The previous handoff said *"419 of the
   569 corpus parts answer NOTHING when picked"*. 419 is the NESTED-part count the corpus suite prints
   on the line above; the silent count measured **416** before this run's change and **419** after
   (the two differ by which kinds the widened rules reach). Two quantities three apart, which is
   exactly how a remembered number outlives its measurement. Re-measure before quoting.
5. **A `.md` ledger entry can be more wrong about its CAUSE than about its symptom.** The only open
   Sev-1 reproduces exactly as filed — but its claimed root cause (duplicate ids from `applyAdds`)
   measured **zero duplicate ids**. See below.

## The Sev-1 this run reproduced and fixed

**"Pick it back up" replays the edit bag onto bytes that already contain it.** Filed 2026-08-02 as
UNREPRODUCED; **reproduced here** through the real importer and exporter on the from-scratch starter:
**pristine 6 parts → add a tube 7 → export-and-reimport (baked) 7 → replay the edit bag 8.** The undo
for the app's one destructive act hands back a rocket one part longer than the one discarded.

**The cause is NOT the one filed.** Duplicate component ids after the restore measured zero — the
export/reimport re-mints ids, so the replayed part arrives as a genuinely new one. The real cause is
one line up: `syncShelfRow` overwrites `designBytes.current` with edits-baked bytes, while
`designBytes`'s own docblock says it is *"the design as it was OPENED"*. `reset()` then pairs those
baked bytes with the unbaked edit bag at `components/LoftApp.tsx`, and `onRestoreDiscarded` replays
the bag on top. Fixing the id insert would not have fixed this.

**FIXED, and the fix is one line.** `syncShelfRow` no longer writes the baked bytes back over
`designBytes.current`; the shelf still gets them, because `replaceRecent` is handed the serialisation
directly. Pinned by `e2e/smoke.spec.ts`'s *picking a discarded build back up returns the rocket that
was discarded, not a longer one*, with a control that fails it **Expected: 7, Received: 8** — the same
+1 the model-level probe measured. **The ledger's Sev-1 count is now ZERO.**

## The environment, measured 2026-08-17 (run 17)

- **The container was COLD** — no `node_modules`, no `corpus/`, and `/opt/pw-browsers` held
  chromium-**1194** while this repo's Playwright (1.61.1) manages **1228**.
  `npx playwright install chromium` fetched it in about a minute (~114 MB) through the proxy. All of
  that is paid for again next session until it is in the environment's setup script, which is the
  owner's to make.
- **The fixtures repo is attached** at `/home/user/loft-fixtures`; five per-tool symlinks into
  `corpus/` and the suite names **35 design files**, 569 parts.
- **A full gate is ~15 minutes** (lint ~20 s, unit ~7 min, build ~1 min, e2e 2×2.9 min). CI ~7–8 min
  per job.
- **The `rocketpy-selfhosted` e2e specs FLAKE here and look exactly like a red baseline.** The
  baseline reported 2 failures across the two shards and BOTH passed on an immediate re-run with no
  code change. Re-run the shard before believing an inherited red gate.
- **`npx tsc --noEmit -p tsconfig.json` reports ~12 errors in `lib/model/edit.test.ts`** that nothing
  in the gate can see — `npm run build` type-checks the app and not the specs, and vitest does not
  type-check at all. Pre-existing; filed.
- **The clone is SHALLOW** — every commit count and file history is a window, not the record.
- **Git identity arrived as the harness vendor's default** and was set per-repo before the first
  commit. Every commit carries a `gpgsig`.
- **The harness appended the attribution footer to the PR body.** Stripped by re-posting, and
  verified gone by reading the body back. Read every PR body back after posting.

## The arc across sessions

- **Run 17 (2026-08-17, this one).** Two Sev-1s. One: the undo for "Import another" replayed the
  edit bag onto bytes that already carried it, so picking a discarded build back up returned a rocket
  a part longer than the one discarded — filed 2026-08-02, unreproduced for a fortnight, reproduced
  and fixed here, with the ledger's stated root cause shown to be wrong. Two: a fetched forecast's age was renewed by every edit, so
  a morning profile never expired — the stamp lived in `applyWhatIfState`, one function away from the
  comment forbidding exactly that. P17 increment 2 — a finished Monte-Carlo survives a docs link,
  stored in its own slot (78,649 bytes, 77,619 of it samples) and keyed on content rather than on two
  per-mount counters. R12 increment 20 — every part answers what can be added to it, from one
  exported rule that replaced three copies. `COMPETITION.md` row 50.
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
- **Every e2e negative control is `revert → rebuild → run → restore → rebuild`**, and the suite serves
  `out/`, so a control without the rebuild silently passes. This run got one control for free by
  running a new test against the pre-change build, and it failed correctly.
- **Shard the e2e suite sequentially**, and read the failure line rather than the pass count.
- **A merged PR cannot track new work.** After merging, `git checkout -B <branch> origin/main`.
- **`DESIGN.md` §9's card-treatment count is 3 against a target of 1**, and every other count is at
  target. The two extras are `components/ServiceWorker.tsx` (the update toast) and
  `components/ImportPanel.tsx` (the drop zone), both hand-rolls of `Card`. That is a P-track slice
  with a count that moves 3 → 1, not an ad-hoc cleanup.
- **Both `## Awaiting the owner` entries in `OWNER-NOTES.md` are unchanged** — the attribution footer
  and the commit identity the zero-trace invariant forbids, both from run 12. All 12 open notes carry
  a verdict; none is pending.
