# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Pick up first

**Run 19 shipped nine increments: two queued milestone slices and seven Sev-1s.** Seven of them are
**merged and live** (`main` at `ec228a8`, deployed and verified — see *The production gap* below).
The last two are **PR #189**.

| | what | state |
|---|---|---|
| P18 increment 2 | `DropZone` — the last hand-rolled card treatment, and the refusal moves into the zone the file landed on | **live** |
| SEV-1 | offline with a design open, the app reloaded itself forever | **live** |
| SEV-1 | an authored mass hung out of the part holding it once that part was resized | **live** |
| SEV-1 | a part that weighs something printed as a flat `0 kg` | **live** |
| SEV-1 | the Conditions panel said "as designed" after the flyer replaced them | **live** |
| SEV-1 | the fallback-canopy caveat reached one surface of three | **live** |
| R12 increment 24 | three add controls on every design were live and did nothing | **live** |
| SEV-1 | a design with no centre of pressure was given one, and a band to go with it | **PR #189** |
| SEV-1 | a RASAero boattail described twice was built twice | **PR #189** |

**The next slice on each track:**

- **R-track: R12 increment 25.** The obvious one, and it comes straight out of increment 24's own
  "what this does NOT do": the three parts the dimension fields make — a boattail, a drogue, a payload
  bay — are now honestly refused, and a flyer still has no way to select a boattail and edit it AS a
  part. The product question is whether touching a field-made part promotes it to an authored one.
  That is a decision, not a bug, and it is the last thing standing between R12 and a tree where every
  part on screen behaves the same way.
- **P-track: P18 increment 3 is written and scoped** — `components/ResultsView.tsx`'s flight-log
  surface, the app's second file ingest. It still carries all three defects `DropZone` was extracted
  to end. `BACKLOG.md` lists what has to change in the primitive before it can be adopted there (its
  prop type exposes none of `Card`'s `pad`/`as`/`tone`, and its hard-coded `text-center` is beaten by
  a call site only through source order). **P18's remaining *done when* clause is the sibling mirror**,
  which this session could not reach — see below.

**The two best defects still open, both reproduced, both measured:**

1. **RASAero parts are all placed `{after, offset: 0}` and a part's own `<Location>` is never read.**
   This is the last big RASAero defect and it is now the ONLY thing between `Show-off.CDX1` and its
   stated length: after this run's boattail de-duplication it imports at 567.4 mm (22.34 in) against
   the file's own 20.00 in, **+11.7%**, down from +17%. `Complex.Two-Stage.CDX1` is 72.00 in against
   63.00 in. And the file itself shows why it matters beyond length: `Show-off.CDX1`'s fin can and
   the tube behind it BOTH say `Location 8`, so the parts genuinely overlap and stacking them
   end-to-end is not a rounding error. **Unlike the fin `Location` question, a part-level
   `<Location>` is unambiguous** — the corpus's own chains resolve (nose at 0 length 1, tube at 1
   length 7, next part at 8) — so this one is readable from the files rather than needing a manual.
2. **The fin-position sweep slides a fin set past the tail of the airframe and flies it there.**
   `parameterSweep(rocket, "finStation", …)` has no clamp: `lib/sim/sweep.test.ts` drives the fins to
   **1,005 mm and 1,030 mm on a 950 mm rocket**, and the CP dutifully follows to 953.6 mm and
   975.9 mm. The margins are arithmetically right for a rocket that cannot be built. Filed. The
   interesting half is whether the diagram's own Fin-position grip has the same gap.

## The production gap, measured 2026-08-18

`main` is `ec228a8`; the deployed service worker reports `BUILD_ID = "d9d9e8c7b6ad"`. Walked by
fetching the site's own precache manifest and every asset in it:

- **28 assets, 14 router payloads, 11 routes, 8 samples — every one returns 200.** The offline Sev-1's
  fix is complete in production, not merely deployed: `_rsc` and `ignoreSearch` are both in the served
  `sw.js`.
- Probed the served JS for this run's own strings: *"made by the design fields"* (R12 inc 24),
  *"as you set them"* (the conditions fix) and *"the canopy's drag coefficient is Loft's fallback"*
  are all **PRESENT**. *"outside the span of the parts"* is **absent**, which is correct — that is
  PR #189 and it has not merged.

**So the gap is exactly one increment, and it is the one still in review.** Note the method: the
first probe read only the 11 chunks the index page's `<script>` tags name and reported two of those
strings absent. The authoritative list is the service worker's own `BUILD_ASSETS`, because that is
what the app promises to work from offline.

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

0. **A gate you trimmed to four lines cannot show its own failure count, and that is how this run
   read green over three red tests.** `npx playwright test --shard=$i/3 2>&1 | tail -4` prints three
   test NAMES and a "N passed" line — the "3 failed" header scrolls off. The pre-push review found the
   failures; the gate had already reported success. **Grep for `passed|failed|did not run`, never
   `tail -N`.** Same false-all-clear shape the manual records for the corpus suite, arriving through
   the shell instead of the suite.
1. **A COLD WALK OF THE BUILT EXPORT FOUND TWO DEFECTS THE WHOLE GATE COULD NOT.** Both were created
   by the very change that was about to ship, and both are the same shape: a sentence that was written
   when its condition had exactly one cause, and outlived it.
   - `ParameterSweep`'s withheld-metric notice ended *"Swap in a bundled motor under Design, and it
     comes back on both"* — hard-wired advice, now printed to a flyer whose motor is fine and whose
     centre of pressure is not a point on their rocket.
   - `GeometryInspector`'s explanation of the missing CG/CP marks is gated on `cg === undefined`, so a
     design with a resolved motor and no CP dropped both marks **in silence** — §5's "a surface that
     vanishes instead of saying why", introduced by the fix for a different vanishing.
   **When you give an existing condition a second cause, re-read every sentence downstream of it.**
   The type system cannot see a prose fix, and neither can 1,329 unit tests.
2. **"Reachable in the corpus" and "reachable by a flyer" are different claims, and the second is the
   one that sizes a Sev-1.** The no-CP defect looked like a one-file RASAero curiosity — until the
   from-scratch starter reached it in **two typed fields**, both inside the range the Design workspace
   offers. Drive the editor before deciding a defect is a corner.
3. **Test the arithmetic, not a proxy for it.** The no-CP rule's first version asked whether the CP
   was inside the AIRFRAME, which sounded obviously right and was wrong: the fin-position sweep puts
   fins past the tail, so the CP goes past it too with every contribution positive and CNα healthy.
   The correct test is the convex hull of the contributions — exact, because a weighted average with
   non-negative weights cannot leave the interval it averages over. **The proxy would have hidden a
   real bug behind a caveat about a different one.**
4. **NOT EVERY FIX CAN BE PINNED BY THE CORPUS, and saying so beats shipping a check that cannot
   fail.** Three drafts of a corpus rule for the double-boattail, three different failures. Asked of
   every KIND it found **11 duplicates across the corpus, all legitimate** (two fin sets at one
   station is a real design; every parachute hashed identically because a canopy has none of
   `length`/`outerRadius`/`foreRadius`/`aftRadius`). Narrowed to ADJACENT transitions it went inert —
   after the fix there is not one adjacent pair of transitions in the whole corpus, so it compared
   zero pairs and would have passed forever. Widened to every same-stage PAIR it ran green **with the
   fix reverted**, because RASAero places everything `{after, offset: 0}`: the duplicate APPENDS
   rather than overlaps (551.2 mm and 576.6 mm), so "same station" cannot see it. The unit case with
   its own in-file control — a thousandth of an inch of difference must build two cones — is the
   honest instrument, and the corpus's contribution is that all 35 still fly.
5. **Bumping a stored record's version silently rearms every test that writes one.** `session.test.ts`
   has five cases that write a v1 record with a field deleted and assert a null read. With the reader
   moved to v2 they all still passed — on the VERSION check, having stopped testing the missing field
   entirely. Move the fixtures with the reader.
6. **The pre-push review is nine-for-nine.** This time it stopped a wrong refusal on the front door:
   `DropZone`'s first version refused a file whose NAME did not match `accept`, and Loft's importer
   sniffs BYTES. **The place was the defect. The check never was.**
7. **A binding rule written with nothing able to contradict it is worth less than no rule.** Third
   consecutive run where a §2 addition shipped without its own check. Invert it: **write the check
   first, then the section.**
8. **Subagents driving Playwright collide with the gate.** `reuseExistingServer` is true locally, so an
   agent's `npx playwright test` shares the suite's own server on port 3000. Forbid Playwright in the
   agent brief, not just writes.
9. **Measure the consequence, not just the defect.** "The mass sits outside its host" is a geometry
   statement nobody can price. "Static margin moves by up to 2.73 cal on 35 of 35 corpus designs" is
   the same fact in the units a flyer acts in.

## The environment, measured 2026-08-18 (run 19)

- **The container was COLD** — no `node_modules`, no `corpus/`, and `/opt/pw-browsers` held
  chromium-**1194** while this repo's Playwright (1.61.1) manages **1228**.
  `npx playwright install chromium` fetched it in about a minute. **Eighth consecutive run that has
  paid for it**; it stays paid until it is in the environment's setup script.
- **The fixtures repo IS attached** at `/home/user/loft-fixtures`; five per-tool symlinks into
  `corpus/` and the suite names **35 design files**.
- **The SIBLING repo is NOT reachable** — see above. This is new; run 18 recorded the opposite.
- **A full gate is ~20 minutes** on a quiet box (lint ~4 min, unit ~5 min, build ~1 min, e2e
  4×1.2 min). With subagents running it is unbounded and the e2e counts stop being trustworthy.
- **FOUR e2e shards, and 293 tests.** `for i in 1 2 3 4; do npx playwright test --shard=$i/4; done`,
  sequentially, and read the failure LINE.
- **The clone is SHALLOW.**
- **Git identity arrived as the harness vendor's default** and was set per-repo before the first
  commit. **The harness appended its attribution footer to PR #189's body on creation** — it does NOT
  append on update, so re-posting the same body strips it. Read it back to confirm; PR #188's body was
  clean because it was created before the footer arrived and updated afterwards.
- **`npx tsc --noEmit` reports errors in `lib/model/edit.test.ts`**, which `npm run build` never
  reads. Filed.

## The arc across sessions

- **Run 19 (2026-08-18, this one).** Eight increments: **P18 increment 2** (`DropZone` —
  `cardTreatments` 3 → 1, outside the primitives file 2 → 0, and a refusal moved 765 px up into the
  zone the file landed on), **R12 increment 24** (three dead add controls on every design), and **six
  Sev-1s** — the offline reload loop, an authored mass hanging out of its host for up to 2.73 cal, real
  part masses printing as a flat zero on 18 of 35 designs, a Conditions summary claiming "as designed"
  after the flyer replaced them, the fallback-canopy caveat reaching one surface of three, a
  design with no centre of pressure being given one **with a band on it** (−15 cal flagged LOW and
  +12.81 cal flagged HIGH, from the same undefined figure), and a RASAero boattail described twice
  and built twice. `COMPETITION.md` rows 52 and 53. PRs #188 (merged) and #189.
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
- **Four e2e shards, sequentially**, and re-run a failure in isolation before believing it — but a
  test that fails in a shard and passes alone is not automatically contention: run 19 had one that was
  real and three that were not, and the difference was measurable in ten minutes.
- **Every e2e negative control is `revert → rebuild → run → restore → rebuild`**, because the suite
  serves `out/`. And the revert has to COMPILE: `noUnusedLocals` turns the obvious one-line revert
  into a red build that leaves the previous `out/` in place, so the control passes and proves nothing.
  Revert by changing a VALUE the fix depends on, not by deleting the code that uses it.
- **A merged PR cannot track new work.** After merging, `git checkout -B <branch> origin/main`.
- **`DESIGN.md` §9, measured this run** (`npx vitest run lib/design-system.test.ts` is the authority;
  the shell one-liners over-report two of these and say so): radius drift 0, border drift 0, mismatched
  border pairs 0, **card treatments 3 → 1 (target reached)**, **card treatments outside the primitives
  file 2 → 0 (target reached)**, **container border widths 0 (a new count)**, elevations outside §2's
  two 0, off-scale spacing 0, arbitrary spacing 1 (the sanctioned device inset), off-scale type 0,
  inverted files 0, hand-rolled `<select>` 0, hand-rolled `<button>` 3 (the three primitives),
  primitive adoption ≥21 files. Nothing moved the wrong way and two counts reached their targets.
- **`OWNER-NOTES.md`: all 12 open notes carry a verdict and none is pending.** *(The previous handoff
  said 13; the Open section holds twelve distinct notes — ON-1 … ON-10 plus ON-B1 and ON-B2 — and the
  extra count came from ON-4 being named twice, once in its own note and once in the cluster header.)*
  No new notes arrived this run, so every verdict is the 2026-08-08 one from the run that first saw
  them. `## Awaiting the owner` holds 11 entries; the two newest are still live — the signing key only
  the owner can register, and the sibling repo this session could not reach.
