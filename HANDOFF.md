# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Pick up first

**PR #173 is open and is the only thing in flight.** Merging it on green is pre-authorised. PRs #171
and #172 are merged and **confirmed LIVE** on loft.fusionspace.co by fetching the deployed chunk, not
inferred from a green merge: `/_next/static/chunks/08eb1_d~it461.js` carries *Balance from*, *Nose
balance*, *Body tube balance*, *drawable airframe*, *fewer than two recorded positions*, *no dimension
Loft can sweep* and *the figure you set*. `main` is at `c65b87b`. **The ledger's Sev-1 count is 0** —
two candidates were filed by the opening fan-out and both were refuted at the verify stage.

Where the two tracks stand, measured this run:

- **P-track: P14 is SHIPPED** (all three instruments general rather than enumerative, each pinned).
  **P15 is new and is at increment 1 of 3** — *a target is an area, not a height*. The track had run
  dry again, so writing it was the work. **Increments 2 and 3 are measured and ready to start:** the
  header, import controls and `/design` count heights only, exactly as the footer did (the brand link
  at 37x28 and the skip link at 32x16 need exempting BY NAME, not by a filter nobody can find); and
  the docs routes are never visited by the suite at all, where `SectionNav`'s contents chips render
  34 px tall. Expect increment 2 to raise counts before it lowers them.
- **R-track: R12 is at increment 14.** A flyer can state a measured balance point for the nose cone
  and the body tube, and the parts table now shows where every part balances and whose figure that is.
  **The next R slice is the one the review named and this run deliberately did not take:** what
  `overrideCGx` MEANS on a part with a shoulder. It sets the shell centroid and the shoulder is
  blended in aft of it, so the part acts up to 133 mm behind the station stated. Changing that
  re-flies every imported `<overridecg>` and moves the published accuracy census — its own increment,
  its own gate, its own corpus run. `BACKLOG.md` carries the numbers.

**Four things this run learned that are worth more than any of its increments.**

1. **The pre-push agent review is the highest-yield step in the loop, and it earned that three times.**
   Increment 1: four certain defects in code the full gate had blessed — a find-and-blank loop that
   did not terminate (its 40-pass cap turned an infinite loop into a *silent* one), a
   `startsWith("return null")` firing on `return nullable`, string literals neutralised in one helper
   and not its sibling, a keyword exclusion missing a `\b`. Increment 2: five more, including
   `overrideCGx`'s shoulder blend, which made the control non-idempotent on 15 of 57 live controls.
   Increment 4: it caught the increment repeating the mistake the increment *before* it had warned
   about. **Give it the diff and nothing else, tell it to run things, and read what comes back.**
2. **I shipped a compliance check that could not fail, one increment after the milestone whose entire
   subject is compliance checks that cannot fail.** The corpus case for the CG refusal recomputed
   `[0, len].some(probe moves the design CG)` and compared it with `statedCGReachesDesign` — that
   expression, term for term. 70 of 70 by construction, both failure branches unreachable, published
   as "0 disagreements". **A check must ask a DIFFERENT function a DIFFERENT question.**
3. **Three selectors this run looked right and asserted nothing** — an apogee readout insensitive to
   the CG change under test, a `columnheader` name that never matched an uppercased header carrying a
   sort glyph, and a row-level `toContainText(/\d/)` satisfied by a column older than the change.
   Every new assertion got a control this run *because* of the first one, and each control found the
   next.
4. **A probe that does not reproduce the media query the token is written against is measuring a
   different app.** The first touch-target measurement reported 369 elements and 238 controls at a
   390 px viewport with no `hasTouch` — `pointer-coarse:` does not apply to a fine pointer. The real
   number is 80.

## The environment, measured 2026-08-12 (run 13)

- **Four cores.** `nproc` = 4, which caps a workflow's concurrency at **2** agents. An eight-agent
  opening fan-out took **65 minutes** to drain. Size fan-outs to 4–6, or expect to harvest late.
- **Never run the gate while agents are in flight.** Subagents competing with Playwright produced two
  spurious failures that look real (`smoke.spec.ts:4247` offline, `rocketpy-selfhosted.spec.ts:254`),
  both passing alone and in a clean shard re-run. Starved, not flaky.
- **And they leave their probe files in your gate.** Review agents wrote five `-tmp.test.ts` files
  under `lib/`; they are gitignored, so `git status` was clean while `npm test` reported **70 files /
  1263 tests** instead of 65 / 1250. The counts were theirs. **`find . -name "*-tmp*"` before
  believing a gate run.**
- **A negative control must still COMPILE.** Three controls this run failed to build rather than
  failing the test — an unused local under `noUnusedLocals` produces no `out/`, and Playwright then
  times out waiting for its webServer, which reads as an infrastructure problem rather than a control
  that did not run. Neuter a function's BODY, or keep the reference (`{(coarse ? true : true) && …}`),
  rather than deleting a call site.
- **`node_modules` is NOT installed at session start.** Run `npm install` first.
- **The Playwright browser is ABSENT at session start**, and it looks like a wall of real failures.
  `npx playwright install chromium` fixes it in about a minute (chromium-headless-shell-1228, ~114 MB).
  Paid for again every session until it is in the environment's setup script — the owner's to make.
- **The fixtures repo WAS attached.** Linking `/home/user/loft-fixtures/{openrocket,rocksim,rasaero,
  rocketpy,spacecad}` into `corpus/` gave the suite **35 design files**, and it named that count in
  its own output rather than skipping.
- **The clone is SHALLOW** — every commit count and file history is a window, not the record.
- **`npx tsc --noEmit` reports 28 errors, all in test files, all pre-existing** (identical count on
  `main` and on the branch). `npm run build` typechecks app code only, so the gate never sees them.
- **Git identity arrives as the harness vendor's default** and must be set per-repo before the first
  commit: `Neer Patel <135655563+nrdptel@users.noreply.github.com>`. Signing was already configured
  and every commit this run carries a `gpgsig`.
- **The build's own text-gap detector earns its keep.** It caught a missing space (`</em>for`) that
  this run introduced in the methods page, from 0 → 1 and back.

## What the opening fan-out returned

Eight agents across six lenses plus two milestone recons. **Zero Sev-1s survived** — both candidates
were refuted for being real in the code and unreachable in the product. **67 findings are filed in
`BACKLOG.md`**, newest section first. The three worth naming here:

- **RASAero reads three stages' weight and balance from `simNodes[0]`** (`lib/rasaero/adapt.ts:539`,
  `:462`, `:586`). It reaches the published accuracy census, which flies `Complex.Two-Stage.CDX1`
  under `configId sim1` while the airframe figures come from node 0. **Highest-value correctness item
  in the ledger.** A physics change: its own gate, its own corpus run, its own push.
- **Six controls that forget**, including the Monte-Carlo *waiver ceiling* — a `useState(0)` beside
  six persisted sigma inputs, and the one field on that panel that is a go/no-go input.
- **A mass object's balance point can land outside the rocket** — found by the parts table's new
  column publishing a figure that had only ever been computed. 4 figures aft of the airframe's own
  tail on 3 designs; `FullScaleModelTH.rkt` balances 5,444 mm on a 3,213 mm rocket, because a RockSim
  shock cord imports carrying the cord's *deployed* length.

## The arc across sessions

- **Run 13 (2026-08-12, this one).** Five increments across five PRs' worth of work; #171 and #172
  merged and live, #173 open. P14 shipped and P15 written and opened. R12 reached increment 14. The
  vanish instrument stopped enumerating (2 → 22 surfaces in scope), the hover-only instrument learned
  to see SVG `<title>` children (0 → 4 → 0), a flyer can state a balance point, and the parts table
  says where every part balances. `COMPETITION.md` row 46 added; row 45's named next step resolved.
- **Run 12 (2026-08-11).** The lumped-airframe Sev-1 family closed — one registry-driven refusal at a
  choke point replaced three rounds of per-field guards. PRs #166–#170.
- **Run 11 and earlier.** R12's editor family from increment 1, P13's shared design system, P10's
  repo surface, P7's dark mode. See `ROADMAP.md` for each milestone's *done when*.

## Standing hazards this run re-confirmed

- **Never push straight to `main`** — the deploy fires on any push, gated on nothing.
- **Every e2e negative control is `revert → rebuild → run → restore → rebuild`**, and it must compile.
- **Shard the e2e suite** (`--shard=1/2` then `--shard=2/2`), sequentially, never concurrently.
- **A merged PR cannot track new work.** After merging, `git checkout -B <branch> origin/main` and
  put the next increment on top; the branch then needs `--force-with-lease` and a NEW pull request.
- **The harness appends an attribution footer to PR bodies and requires the commit identity the
  zero-trace invariant forbids.** Both are recorded under *Awaiting the owner* in `OWNER-NOTES.md`
  from run 12 and are unchanged. The footer is on #171–#173 for the same reason it was on #166:
  `MAINTAINING.md` resolves harness-versus-manual conflicts in the harness's favour and asks the
  session to say which instruction it could not honour. This is that.
