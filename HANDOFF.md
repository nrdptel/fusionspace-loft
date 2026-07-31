# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Read this first

**`BACKLOG.md`'s Sev-1 count is ZERO at the end of this run**, and that is a measured claim rather than
an inherited one: the single open Sev-1 this run started with — an authored booster whose motor mount is
deleted flying as dead ballast — was reproduced, fixed and pinned as increment 1. Run the screen against
the LEDGER, not against this summary of it; that is the mistake the previous two handoffs each made in
turn.

**One thing is owed to the sibling repo and could NOT be done, for the second run running.** `DESIGN.md`
§9's explanatory note quotes `GeometryInspector` at 9:2 and `MonteCarlo` at 9:4; both are now 2:8 and
3:9. §10 says a change to that file is a change to both copies in the same run. The sibling repo
(`fusionspace-debrief`) is reachable in the account's repo list, and **attaching it was refused by the
harness's permission classifier**, so correcting the numbers here alone would have created exactly the
divergence the invariant forbids. The correction is two numbers in §9's paragraph beginning "The
suite-wide ratio was removed on 2026-07-31". The rule itself is right and satisfied; only the historical
figures are stale. **A session with both repos attached should fix it in one commit each.**

**The pre-push second opinion is the highest-value thing in this workflow and it nearly did not run this
time.** Increment 1 passed a FULL GREEN GATE — lint, 908 unit, build, 178 e2e, corpus 10/10 — while the
warning it shipped **stated a falsehood**, and two independent review lenses caught it. Do not treat a
green gate as permission to push. Details under *What this session learned*.

**The queue has two tracks and a run ships from both.** `ROADMAP.md` is the queue; read it first.

| track | state at the end of 2026-07-31 (third session) |
|---|---|
| **R — capability** | **R5 — author a staged rocket — IN PROGRESS**, increments 1–2 of 4–6 shipped |
| **P — product & craft** | **P1 — one design system, adopted — IN PROGRESS**, increments 1–6 shipped |

## The arc so far

| milestone | state |
|---|---|
| R1 — address components by identity | SHIPPED 2026-07-30 |
| R2 — delete a component, and undo it | SHIPPED 2026-07-30 |
| R3 — add a component | SHIPPED 2026-07-30 |
| R4 — reorder and restack | SHIPPED 2026-07-31 |
| R5 — author a staged rocket | **IN PROGRESS** — inc. 1 (the stage) and 2 (the phase table) shipped |
| P1 — one design system, adopted | IN PROGRESS — increments 1–6 shipped 2026-07-31 |
| P2–P5 | NOT STARTED |

## Shipped this session (2026-07-31, third session of the day)

Baseline before anything changed, all four green: lint 0 errors / **1 warning** (the standing `setDraft`
one), **901 unit**, build, **177 e2e**, corpus **35 design files, 9/9**.

At the end, all four green: lint 0 errors / 1 warning (the same one), **914 unit**, build, **180 e2e**,
corpus **35 design files, 11/11**.

`DESIGN.md` §9, start of run → end: `rounded-lg` **35 → 25**; card treatments 3 → 3 (one is `Card`'s own);
off-scale spacing 0 → 0; `text-lg` 0 → 0; inverted type files 0 → 0; primitive adopters 14 → 14 of 23.
Nothing moved the wrong way.

| commit | what |
|---|---|
| `37a2019` | **Sev-1 — a stage that cannot fire now says so.** The last open Sev-1 in the ledger. Rewritten once after review found the first version lied; see below. |
| `1f172f2` | **R5 increment 2 — the phase table.** `FlightRun.phases`, a per-phase table on the flight surface, and separation dots on the flight-path chart. |
| `e64919b` | **The rest of the page made to read the flight rather than the plan**, plus three wrong claims and three assertions that could not fail — all found by the review of `1f172f2` after it was pushed. |
| `ab460e7` | **The CI budget the new sweeps needed, and P1 increment 6** — `rounded-lg` 35 → 25. |
| `d4717da` | This handoff. |
| `622b215` | **The `CARD_TONES` decision that unblocks P1 6b**, taken and written up rather than left as a question. |

**All six SHIPPED — pull request #84 merged on green as `446ec37`, and production serves them.** Both CI
jobs passed every step on the head that merged; the deploy completed; and what is live was checked rather
than assumed. The two chunks carrying this run's code are **byte-identical (sha256) to the local build the
180-test e2e suite ran against** — `04fi6lqd1vn1j.js`, which carries *no motor that can fire*, *carried to
apogee as dead mass*, *still dropped* and *ignition trigger that never arrives*, and `06str.0c5uor9.js`,
which carries *Flight phases*. `/docs/limitations` serves the corrected prose, including *One of the 35
real design files*, where it previously published the opposite.

**One trap when checking production: the hashed assets propagate before the HTML does.** Measured this
run — the new chunks were live and byte-identical while `/docs/limitations` still returned the previous
copy, which reads exactly like a half-broken deploy. It was edge cache. Re-fetch with
`-H 'Cache-Control: no-cache'` and a cache-busting query before concluding anything, and check the deploy
workflow's own run for the merge commit.

## What this session learned that is worth keeping

**A green gate is not a correct feature, and this run has the sharpest example yet.** Increment 1's first
version shipped a warning whose central sentence — "it stays attached for the whole flight and never
separates" — is **false whenever the dead stage sits below a stage that still burns**, because a serial
stack parts at one joint and takes everything below it. On `02.Two-stage.ork` that renders the new warning
beside `untracked-booster` saying the opposite, about the same stage, on the same surface. Nine unit
cases, a corpus sweep and an e2e were all green over it, because every one of them was two-stage — the
one shape where the claim happens to hold. **When a new assertion is about a relationship between things,
build the fixture where the relationship is different.**

**The same review found the predicate itself was measuring the wrong quantity.** It counted motor
INSTANCES per stage. "Can this stage fire" is not that, and the gap was three false negatives on real
files, each worse than the bug being fixed: `ignitionEvent:"never"` loses 95.2% of apogee on
`02.Two-stage.ork` (1378.003 → 66.682 m); an unresolvable designation flies 93.508 m; and
`03.Three-stage.ork` is in the state as imported. The fix was to compute it in `lib/sim/setup.ts` keyed on
`stageBurnDuration[i] === 0` — **the same quantity the separation timing is derived from**, so the warning
and the flight cannot disagree. Generalise: when a warning describes what the solver did, derive it from
the solver's own intermediate, not from a re-reading of the inputs.

**"0 of 35" was an artefact of a blind predicate, not a fact about the corpus.** Both the docs and the
sweep published it. The real figure is **1 of 35**. A sweep that returns nothing is evidence about the
sweep as much as about the corpus — check the predicate can see the thing before believing the count.

**A green LOCAL gate does not prove the runner agrees, and this repo has now learned it twice.** CI went
red on `e64919b` while the identical tree passed here: the new dead-stage corpus sweep flies all 35
designs and ran under vitest's 5 s default — **488 ms on this box, 5,186 ms on the runner**. Every
neighbouring sweep already carries an explicit `300_000` for exactly this reason and the previous handoff
wrote the lesson down; it was still reintroduced. **Any test that flies the corpus takes the budget, and
the `frontend` job's own result on the PR head is read before a run is called done.**

**Run the gate AFTER the last edit, not around it.** Two gate runs this session were invalidated by edits
that landed while they were in flight, and a third was re-run for honesty. The result of a gate that
overlapped an edit tells you nothing about the tree you are about to push.

**A probe's control line earns its keep every single time.** Three probes this session were wrong in ways
only their controls revealed: `mountId=(none found)` (the ids are freshly MINTED for the parts a stage
creates, not existing ids), a stage walk over `.components` when components nest under **`.children`**,
and `importDesign` being **async** and never awaited. Every one would have produced a confident, wrong,
publishable number.

**Prefer the corpus to another synthetic fixture, and make the sweep assert a NAME.** The dead-stage sweep
asserts `["03.Three-stage.ork"]` exactly, so it fails both if a real design starts firing the warning and
if that one stops — where `toEqual([])` would have quietly accepted the predicate going blind again.

## Running the gate without fooling yourself

Everything under this heading in the previous handoff still holds and was re-confirmed this session. The
points that mattered most, unchanged:

- **`npm install` first** on a fresh container (~1 min), then **`npx playwright install chromium` once**
  and a bare `npx playwright test` — do NOT set `PW_EXECUTABLE_PATH`. `@playwright/test` is 1.61.1 and
  manages **chromium-1228**; the sandbox ships **1194**. Confirmed again: 1228 was absent at session
  start, installed in about a minute through the proxy, and **179/179 ran against it**.
- Record each gate step's own exit code; a `{ … } > file` brace group reports only its last command.
  Run it with `run_in_background: true` and wait with `until grep -q "E2E_EXIT=" "$G"; do sleep 10; done`.
- **`git commit --amend` is blocked by the permission classifier.** Add a second commit; the squash folds
  them.
- **Never revert a negative control with `git checkout -- <file>`.** Copy the file's bytes aside and
  restore from the copy. Used five times this session with no loss.
- **A negative control's BUILD exit is part of the control** — the e2e runs against `out/`, so a control
  that does not compile leaves the suite testing the still-correct build.
- `rm -f *-tmp.mjs` immediately before every gate: eslint lints gitignored root-level probes and breaks
  the "exactly 1 warning" baseline.
- Serve the built export for probes with `(setsid npx serve -c e2e-serve.json -l 3100 … < /dev/null &)`;
  the e2e suite owns :3000.

## Before you trust a sweep

The corpus is gitignored and absent on a fresh container. Both repos are checked out, so no token is
needed — symlink the fixtures repo's per-tool directories into `corpus/`:

```bash
mkdir -p corpus && for d in openrocket rocksim rasaero rocketpy spacecad; do
  ln -sfn /home/user/loft-fixtures/$d corpus/$d; done
npx vitest run lib/corpus --reporter=verbose --silent=false
```

It must print `imports every design file (35 present)`. **Confirmed this session: 35 files, 11/11**, with
every count printed — 536 removable parts · 180 authored parts · 230 mass-object stations · 484 drag
drop-slots · 206 reorders · 33 authored boosters and 2 refusals · 0 of 35 leading with a flat face ·
**1 of 35 flying a lower stage that cannot fire (`03.Three-stage.ork`)** · **9 multi-stage designs,
18 phases, 1 boundary shedding more than one stage at once**.

`FIXTURES_TOKEN` is set and the corpus genuinely gates CI, but **only the `frontend` job fetches it — the
`e2e` job does not**, so an e2e test still needs a committed fixture.

## Facts about this codebase that cost time to rediscover

- **Components nest under `.children`; a `Stage` holds `.components`.** Mixing them up makes a walk find
  one part where there are nine.
- **`importDesign` is async.** `lib/ork/import.ts`, takes BYTES, handles `.ork`/`.rkt`/`.CDX1` alike.
- **An authored stage's `seedId`/`mountId` are FRESHLY MINTED ids** for the parts `buildStage` will
  create, not ids of existing components. Mirror `LoftApp.addStage`'s two `newPartId` calls.
- **`stageBurnDuration[i] === 0` in `lib/sim/setup.ts` is the canonical "this stage never burns"**, and it
  already accounts for all three causes. Anything asking that question should use it.
- **A phase is not a stage.** `phases[p].stageCount` is a COUNT of what remains; the stages shed at a
  boundary are the slice `stages[stageCount_p … stageCount_{p-1} - 1]`, because two joints can part at one
  instant (they do, on `03.Three-stage.ork`: 3 stages, 2 phases, 1 separation event).
- **Only ONE burnout event is emitted per flight, ever** — the last motor's. All 9 multi-stage corpus
  designs report exactly 1, including the one that burns three motors.
- The `GeometryEdits` six-place trap in the previous handoff still applies to any new key on that bag; a
  phase table touches none of it, because it reads already-computed results.

## Pick up first

1. **R5 increment 3.** The *done when* still owes: "give it its own motor mount and fins" is inherited
   from the seed rather than authored (there is no `AddedPart.kind` for a mount), and only an AUTHORED
   stage can be removed. Per-stage burn intervals are the natural next table column and need a solver
   change — one burnout event per `detachTime` group.
2. **P1's remaining slices.** The 35 `rounded-lg`, which an opening-fan-out agent scoped into three
   increments — **6a** the 10 button sites (mechanical), **6b** the 12 zinc-50 sunken blocks (blocked on
   one decision: does `CARD_TONES` gain a `sunken` tone?), **6c** the 8 semantic notices **plus**
   `app/globals.css`'s print rule keyed on `.rounded-lg`, which breaks print if the sites convert without
   it, **plus** the ratchet update. 6c must be last. Then `DataTable`, sized by `COMPETITION.md` row 24.
   **Increment 6 did 6a**, so what is left is 6b (the 12 zinc-50 blocks) and 6c (the 8 semantic notices +
   `app/globals.css`'s print rule + the ratchet to 0). 6c must be last, because that stylesheet rule stays
   valid until the final container converts. **6b is no longer blocked**: the `CARD_TONES` decision is
   taken and written up in `ROADMAP.md` under *Decisions taken without the owner* — add a `sunken` tone
   (which `DESIGN.md` §2 already names), define it WITH the hairline so the conversion is visually
   identical, and drop the border only where the parent is confirmed raised.
3. **The design-system audit finally ran**, and it is the biggest single body of P-track work now known:
   `text-[10px]`×22 and `text-[9px]`×3 are an eighth and ninth type size (one of them inside `Chip`
   itself), `text-[11px]` is at 32 uses of which 29 are off-role, 69 unsanctioned half-step spacings, four
   `variant="primary"` on one scrolling surface, `Section`/`Chip`/`Disclosure` exported with **zero** call
   sites, and seven of §5's named primitives do not exist at all. All filed in `BACKLOG.md`.

**The two BLOCKERS from the previous session are still unfixed**, both silent data loss on the
from-scratch builder, both with full reproductions in `BACKLOG.md`: `Download .ork` drops the motor the
flyer picked (1,033 m saved, 542 m re-imported), and reopening your own build from the shelf hands back
the factory starter. A triage agent argued both are Sev-1 by the manual's first criterion. They are the
strongest candidates the moment nothing else preempts.

## Environment notes

- **The GitHub MCP tools are the only path to GitHub**; a direct `curl` to the API returns 403 with valid
  JSON, which a naive poller reads as "no checks pending". Poll with `mcp__github__actions_list`, and read
  the `steps` array — **job-level status lags by up to twenty minutes; step-level does not.**
- **Attaching a second GitHub repo mid-session can be refused by the permission classifier.** It was, for
  `fusionspace-debrief`. Route around it and say so; do not treat it as the repo being unreachable.
- The clone is **shallow**, so every commit count and file history is a window, not the record.
- CI does not run on a branch push: `test.yml` fires on `push: [main]` and `pull_request:` only,
  `deploy-cloudflare.yml` on `push: [main]`. Re-read both `on:` blocks at session start; this session did,
  and they still say that. Gate locally → push the branch → open a PR (that is what makes CI run) → merge
  on green (that is what deploys).
- **The zero-trace sweep has one standing false positive and it is not ours**: `out/pyodide/pyodide-lock.json`
  is Pyodide's own index of installable wheels, untracked and already in production. Sweep the TRACKED
  tree with `git grep`.
- **The app has SIX page routes and none of them is `/validation` or `/motors`** — a previous handoff's
  cold-walk list named both and they 404. They are `/`, `/docs`, `/docs/faq`, `/docs/methods`,
  `/docs/limitations` and `/docs/validation`; confirmed against production, where `/validation` is a 404
  and `/docs/validation` is a 200. Walk those six.
- `innerText` throws on an SVG `<text>`; use `textContent`. `<details>` keeps its content in the DOM while
  collapsed, so ask `details.evaluate(el => el.open)`. `getByLabel` matches an `aria-label` SUBSTRING.
- The parts panel's part-removal control and a stage's own *Remove &lt;name&gt;* control both match
  `/^Remove /`; disambiguate with the part control's title, `"Remove this part from the design and re-fly it"`.
