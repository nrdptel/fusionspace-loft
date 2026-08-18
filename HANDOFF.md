# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Pick up first

**Run 20 is IN FLIGHT as this is written. What is already verified and gated is below; what is still
running is named as such, so a session reading this after an interruption knows which is which.**

**Read this first, because it is the only item here an owner has to decide:** `OWNER-NOTES.md`'s
*Awaiting the owner* now carries a note dated 2026-08-18 recording that **the app ships RocketPy to
the browser while `MAINTAINING.md`'s clean-room invariant says it never should** — 41 MB of
`out/pyodide/`, 23 wheels, `rocketpy-1.12.1-py3-none-any.whl` among them. Nothing in the repo records
that being decided. **The licensing half is fixed this run and is not in doubt**; the invariant's
sentence is untouched, deliberately, because a session quietly editing an invariant to match the code
is the failure the invariant list exists to prevent.

| | what | state |
|---|---|---|
| R12 increment 25 | a boattail the design FIELDS made opens the two fields that made it — it had no Properties control at all | **merged, live** (PR #191) |
| SEV-1 (invariant) | `THIRD-PARTY-NOTICES.md` said RocketPy was not shipped while the build ships it; 23 wheels and 11 licences, one LGPLv3+, named nowhere | **merged, live** (PR #191) |
| — | `scripts/check-notices.mjs`, wired into `postbuild`: four claims, all four proved able to fail | **merged, live** (PR #191) |
| R12 increment 26 | SEV-1: a fin set's root now stays on the airframe, bounded per STAGE and moved as a rigid GROUP, in the applier every caller goes through | gate running, pending push |

**The pre-push review on increment 26 returned twenty-four findings across two passes and found FOUR
defects the increment had created — including one strictly worse than the Sev-1 it was fixing.** That
is the number worth carrying forward, not the fix:

1. **The cut and the shift shared a stale measurement.** Cutting an oversized root MOVES a
   `bottom`-placed set (42 of the 62 bounded corpus sets, all seven fixtures), so correcting from the
   pre-cut flatten put a 1900 mm root, cut to 950 mm, at station 950 mm on a 950 mm airframe — the
   whole set behind the tail, with a CP at 1006.7 mm and +2.02 cal reported for it.
2. **`min` stayed at 0 while `max` became the group's** — the Sev-1's mirror image, live on any staged
   design (`Two stage high power rocket.ork`'s fore bound is 781 mm).
3. **`Fin root` had no ceiling at all**, so the same two-typed-field argument applied verbatim to the
   other fin field.
4. **The ceiling read the flown tree while the placeholder read the pristine one**, so the field could
   advertise a max below its own placeholder and refuse the number it was showing.

**And four measurements quoted in comments were wrong** — a placement tally of 43/17/4 that summed to
64 in a sentence about 62 sets (it counted the two `tubefinset`s the same paragraph excludes), a
"7 of 13" that was the aft direction only, and two others. **The lesson: a fix that touches geometry
needs its numbers re-measured after every change to the fix, not once at the start.**

**What the pre-push review changed about increment 25, because it is the run's most transferable
lesson so far.** The first version opened property panels on all THREE field-made parts. Two were
withdrawn:

- the **drogue**'s panel carried the MAIN canopy's `Cd`, mass and provenance line, because the per-aim
  `designDims` mask works by SUBTRACTING `AIMED_FIELDS` and those render on metadata keys belonging to
  no aim. Typing in that Cd calls `withParachuteCd`, which resolves through `edits.parachuteId` — **a
  different part from the one the panel is headed with.**
- and `drogueDiameter` on a per-part surface **had already been decided against, in a comment, with a
  reason**: on a design with one canopy it AUTHORS a second.

**A mask that works by subtraction leaks by omission**, and the fix queued as increment 26 is an
allowlist. The review also caught the panel **unmounting mid-keystroke** — `NumberField` fires per
character, `addBoattail` bails on a length of zero, so backspacing removed the part and the popover
with it. The aim now resolves against the STRUCTURAL tree, where the host lives, so the surface
survives its own edit.

**What increment 26 settled, and it is the transferable part.** Four questions, each answered by
measuring the corpus rather than by argument: the datum is the **stage** (a stack datum drives fins
past their stage on 4 designs), not the **parent tube** (3 designs already overhang theirs, including
OpenRocket's own shipped example), the group moves **rigidly** (a per-set correction rewrote the
spacing on 9 designs, spreads to 500 mm), and it can be **unconditional** (0 of 62 sets overhang as
imported). A newly authored set is seated on its own — the corpus caught that as *"authoring a booster
changed a stage above it"*. **The pattern worth carrying: when a bound has to be chosen, the corpus
answers it and the answer is a number, not a preference.**

**The next slice on each track:**

- **R-track: R12 increment 27** — the drogue and the payload get their property panels, once the
  `designDims` mask blanks by allowlist instead of by subtraction. Written up in full under R12 in
  `ROADMAP.md`, including which keys leak and which structural keys must survive the change.
  The next-best alternative if that stalls: `ParameterSweep.tsx`'s band is still built from
  `structureOf`, so with the model now bounded its out-of-range points silently vanish from a range
  the panel still draws. `finStationBounds` is the one function to build it from.
- **P-track: P18 increment 3** — the flight-log picker in `components/ResultsView.tsx`. **Its *done
  when* contradicts itself and needs amending first:** it asks to refuse "by name", while increment
  2's own paragraph one screen up records a name gate being reverted as false, and `lib/flightlog.ts`
  never sees a filename. The parser sniffs content (it hunts a header naming a time and an altitude
  column) and already refuses a `.png` — so what is genuinely missing is the DROP path, not the
  refusal.

**The e2e flake, measured rather than guessed.** `e2e/docs.spec.ts:39` "every docs page is readable
offline" fails with `net::ERR_INTERNET_DISCONNECTED` on `/docs` under in-shard parallelism and passes
**5 of 5 in isolation** (3.6–4.1 s each). Raising the shard count does NOT fix it — it failed in
shard 1 at four shards and again at five — so it is not the shard-pressure class `MAINTAINING.md`
documents. The lever is `workers`, not shards: `playwright.config.ts` runs `workers: 1` in CI (green
there) and the local default otherwise. Filed with the numbers.

## What production is serving, walked twice on 2026-08-18

Walked by fetching the site's own precache manifest and every URL in it — not by reading the index
page's `<script>` tags, which name only 11 of the 25 chunks and reported two of this run's strings
absent when they were not. The service worker's `BUILD_ASSETS` is the authoritative list, because
that is what the app promises to work from offline.

**After PR #188** (`main` at `ec228a8`, `BUILD_ID = "d9d9e8c7b6ad"`): 28 assets, 14 router payloads,
11 routes, 8 samples, **every one 200**. The offline Sev-1's fix is complete rather than merely
deployed — `_rsc` and `ignoreSearch` are both in the served `sw.js`.

**After PR #189** (`main` at `8c0bd50`, `BUILD_ID = "717cdd8c1a60"`): **60 precached URLs re-checked,
0 not 200.** Probed the served JS for this run's own sentences — *"puts the centre of pressure
outside the span of the parts"*, *"No static margin is available for this design"* and *"The centre
of pressure and the static margin are not marked"* are all **PRESENT**, and the motor advice the cold
walk removed — *"Swap in a bundled motor under Design, and it comes back"* — is **absent**.

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
  and built twice. `COMPETITION.md` rows 52 and 53. PRs **#188** and **#189**, both merged; production re-walked after each and the gap is zero.
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
