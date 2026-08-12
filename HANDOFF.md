# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Pick up first

**PR #171 carries both of this run's increments and is open against `main`.** If it has merged by the
time you read this, `main` is at that merge; if not, merging it on green is pre-authorised and is the
first thing to do. Nothing else is in flight. **The ledger's Sev-1 count is 0** — two candidates were
filed by the opening fan-out and both were refuted at the verify stage.

Where the two tracks stand, measured this run:

- **P-track: P14 is at increment 2 of 3.** The vanish instrument is derived rather than enumerated
  (22 surfaces in scope, was 2; 5 vanishes found where the roadmap had named 3). **Increment 3 is
  unstarted and unchanged:** `e2e/touch.spec.ts` counts the `title` ATTRIBUTE, so `HOVER_ONLY_FLOOR = 0`
  is blind to eleven SVG `<title>` CHILD elements in `components/RocketDiagram.tsx`. The phone walk
  this run enumerated all of them — see `BACKLOG.md`, which lists each with its measured rect — so the
  discovery half is already done. Expect the floor to go UP before it comes back to 0; that is the
  ratchet working, and it goes up in the same commit that makes the instrument honest.
- **R-track: R12 is at increment 13.** A flyer can now state a measured balance point for the nose
  cone and the body tube. **The next R slice is named by `COMPETITION.md` row 46 and by the increment's
  own gap:** `GeometryInspector`'s parts table has a *Station* column and a *Mass from* column and
  **no CG column and no CG provenance at all** — so the surface whose stated job is *did Loft read my
  rocket right?* is the one place a balance point cannot be read or attributed. `MassBreakdown` is
  still the only per-part CG surface in the app.

**Four things this run learned that are worth more than either of its increments.**

1. **The pre-push agent review is now the single highest-yield step in the loop, and it earned that
   twice.** On increment 1 it returned four certain defects in code the full gate had blessed — a
   find-and-blank loop that did not terminate (its 40-pass cap turned an infinite loop into a *silent*
   one), a `startsWith("return null")` that fired on `return nullable`, string literals neutralised in
   one helper and not its sibling, and a keyword exclusion missing a `\b`. On increment 2 it returned
   five more, including the one that mattered most: `overrideCGx` sets a cone's *shell* centroid and a
   shoulder is blended in aft of it, so the placeholder I was offering made the control
   non-idempotent on 15 of 57 live controls. **Give it the diff and nothing else, tell it to run
   things, and read what comes back before pushing.**
2. **I shipped a compliance check that could not fail, one increment after the milestone whose entire
   subject is compliance checks that cannot fail.** The corpus case for the CG refusal recomputed
   `[0, len].some(probe moves the design CG)` and compared it with `statedCGReachesDesign` — that
   expression, term for term. 70 of 70 agreement by construction, both failure branches unreachable,
   and it was published in `ROADMAP.md` as "0 disagreements". **A check must ask a different function
   a different question.** It now asserts the refusal's *stated reason* against `massByComponent`, and
   that a placeholder is a fixed point — which is what caught the shoulder blend.
3. **A reachability claim is a measurement, not a reading of the code.** I wrote that three of the
   five vanishes were reachable ("where a scratch build starts and where R2's deletions can return
   it"). Both halves were false and the repo says so plainly: `newDesign()` ships a nose cone and a
   body tube, and `removalRefusal` declines the removal that would leave a stage with none. The
   conversions were still right; the story about how the app got there was not, and an overstated
   symptom in `ROADMAP.md` is what the next session sizes its risk from.
4. **A `max` in the wrong unit does not refuse — it commits.** `NumberField.commit` clamps to the
   bound, so passing metres to a millimetre field meant a 170 mm cone enforced a 0.17 mm ceiling and
   silently stored a balance point at the tip. Every other bound in that panel converts first
   (`Number(toDispSpan(...))`). Copy the neighbour, not the type.

## The environment, measured 2026-08-12 (run 13)

- **Four cores.** `nproc` = 4, which caps a workflow's concurrency at **2** agents. An eight-agent
  opening fan-out took **65 minutes** to drain. Size fan-outs to 4–6, or expect to harvest late.
- **Subagents running concurrently with the e2e suite produce a spurious failure that looks real.**
  `smoke.spec.ts:4247` ("works offline after an online visit") failed once under contention and passed
  alone and in a clean shard re-run; `rocketpy-selfhosted.spec.ts:254` did the same later. Not flaky
  tests — starved ones. **Do not run the gate while agents are in flight.**
- **And they leave their probe files in your gate.** Review agents wrote five `-tmp.test.ts` files
  under `lib/`; they are gitignored, so `git status` was clean while `npm test` reported **70 files /
  1263 tests** instead of 65 / 1250. The counts were theirs. `find . -name "*-tmp*"` before believing
  a gate run, and re-run it once the tree is yours again.
- **`node_modules` is NOT installed at session start.** Run `npm install` first.
- **The Playwright browser is ABSENT at session start** and it looks like a wall of real failures.
  `npx playwright install chromium` fixed it in about a minute (chromium-headless-shell-1228, ~114 MB)
  and the suite ran against the revision this repo manages. Paid for again every session until it is
  in the environment's setup script, which is the owner's to make.
- **The fixtures repo WAS attached**, so the corpus is real: linking
  `/home/user/loft-fixtures/{openrocket,rocksim,rasaero,rocketpy,spacecad}` into `corpus/` gave the
  suite **35 design files**, and it named that count in its own output rather than skipping.
- **The clone is SHALLOW** — every commit count and file history is a window, not the record.
- **`npx tsc --noEmit` reports 28 errors, all in test files, all pre-existing** (identical count on
  `main` and on this branch). `npm run build` typechecks app code only, so the gate never sees them.
- **Git identity arrives as the harness vendor's default** and must be set per-repo before the first
  commit. `git config user.name "Neer Patel"` and
  `git config user.email "135655563+nrdptel@users.noreply.github.com"`. Signing was already
  configured and every commit this run carries a `gpgsig`.

## What the opening fan-out returned

Eight agents across six lenses plus two milestone recons. **Zero Sev-1s survived** — both candidates
were refuted for being real in the code and unreachable in the product, which is this repo's
documented failure mode and the reason the verify stage exists. 67 findings are filed in
`BACKLOG.md`, newest section first. The three worth naming here:

- **RASAero reads three stages' weight and balance from `simNodes[0]`** (`lib/rasaero/adapt.ts:539`,
  `:462`, `:586`). It reaches the published accuracy census, which flies `Complex.Two-Stage.CDX1`
  under `configId sim1` while the airframe figures come from node 0. **Highest-value correctness item
  in the ledger.** It is a physics change: its own gate, its own corpus run, its own push.
- **The tenth-use walk found six controls that forget**, including the Monte-Carlo *waiver ceiling* —
  a `useState(0)` sitting beside six persisted sigma inputs, and the one field on that panel that is
  a go/no-go input rather than a curiosity.
- **The phone walk found the eleven SVG `<title>` children P14 increment 3 is about**, each with its
  measured rect, plus six touch targets under 44 px and four routes past the two-screen rule
  (`/docs/limitations` renders **63.99 screens** at 390 px).

## The arc across sessions

- **Run 13 (2026-08-12, this one).** P14 increment 2 and R12 increment 13, both on PR #171. The
  vanish instrument stopped enumerating; the CG override shipped with a solver-derived refusal. Nine
  review findings fixed before push across the two increments. `COMPETITION.md` row 46 added.
- **Run 12 (2026-08-11).** The lumped-airframe Sev-1 family closed — one registry-driven refusal at a
  choke point replaced three rounds of per-field guards. PRs #166–#170.
- **Run 11 and earlier.** R12's editor family from increment 1, P13's shared design system, P10's
  repo surface, P7's dark mode. See `ROADMAP.md` for each milestone's *done when* and what it met.

## Standing hazards this run re-confirmed

- **Never push straight to `main`** — the deploy fires on any push, gated on nothing.
- **Every e2e negative control is `revert → rebuild → run → restore → rebuild`.** Playwright serves
  `out/`; a control that is not rebuilt cannot fail and looks exactly like one that passed. Used
  twice this run, and the first attempt failed to build (an unused local under `noUnusedLocals`),
  which produced no `out/` and a webServer timeout — neuter the function's *body* rather than
  deleting its call site.
- **Shard the e2e suite** (`--shard=1/2` then `--shard=2/2`), sequentially, never concurrently.
- **The harness appends an attribution footer to PR bodies and requires the commit identity the
  zero-trace invariant forbids.** Both are recorded under *Awaiting the owner* in `OWNER-NOTES.md`
  from run 12 and are unchanged; the footer is on #171 for the same reason it was on #166.
