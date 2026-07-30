# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Read this first: the queue now has TWO tracks

**`ROADMAP.md` was restructured on 2026-07-30 and a run now ships from both tracks, alternating.**
This is the single thing to understand before scoping anything.

| track | next unstarted |
|---|---|
| **R — capability** | R4 — reorder and restack |
| **P — product & craft** | **P1 — one design system, adopted** |

The owner's direction was that both apps still read as thrown-together rather than as products the
public can pick up, measured against OpenRocket, RocketPy and the vendor tools. The cause was
structural, not effort: `ROADMAP.md` was the queue and it contained **only** capability milestones, so
a hands-off run could not ship product work as its main job — and the old "one increment in four may
be defect **or polish** work" quota capped the very thing that was missing. The quota now covers only
*unqueued* defect work; craft with a *done when* is a P-track milestone and is not capped.

**Two new files, both binding, both to be read at session start:**
- **`DESIGN.md`** — the design system: tokens, type and spacing scale, component vocabulary, the five
  required states, number presentation, product shape, the touch contract. **Read it before writing a
  component.** Both repos carry an identical copy; a change to one is a change to both, same run.
- **`COMPETITION.md`** — the accumulating gap against OpenRocket, RocketPy, RASAero and RockSim. The
  done-check now requires one row added or resolved per run.

**P1 is the next P-track milestone and it is an extraction, not a repaint.** `components/ui.tsx` has
8 exports and only 5 of 23 components import it; `Chip` and `Disclosure` are imported nowhere. Grow it
into the vocabulary `DESIGN.md` §5 names, convert one surface per increment, and **ship the pinning
check with the first slice** so the drift cannot return mid-conversion.

## The arc so far

| milestone | state |
|---|---|
| R1 — address components by identity | SHIPPED 2026-07-30 |
| R2 — delete a component, and undo it | SHIPPED 2026-07-30 |
| R3 — add a component | SHIPPED 2026-07-30 |
| R4 — reorder and restack | NOT STARTED — next on the R-track |
| P1 — one design system, adopted | NOT STARTED — next on the P-track |

Three capability milestones shipped in two sessions and the editor has gone from a parametric tweaker
over a fixed tree to something that can grow one. What did **not** move in that time is what the app
feels like: it is still one 2577-line page carrying every job, with 12+ card treatments on it. That
asymmetry is exactly what the two-track queue exists to correct. `ROADMAP.md` carries what each
milestone delivered against its *done when* and the gap that became the next one's starting point;
read it first.

## Where the work is

The session is pinned to a working branch, not `main`. **CI does not run on a branch push.**
`test.yml` fires on `push: [main]` and on `pull_request:` only, and `deploy-cloudflare.yml` on
`push: [main]`. Re-read both `on:` blocks at session start; this session did, and they still say
that. So the sequence that actually ships is: gate locally → push the branch → open a PR (that is
what makes CI run) → merge on green (that is what deploys).

**The harness pins a working branch, its name is reused across sessions, and the remote copy is
DELETED when its PR merges.** This session opened with the remote branch gone and local `HEAD`
exactly equal to `origin/main` (`git rev-list --count origin/main..HEAD` = 0) — the previous
session's PR had merged and the branch was cleaned up. That is the normal starting state, not a
problem: commit onto it and `git push -u origin <branch>` recreates it. Note that the pinned name is
one the zero-trace invariant will not let you write into a committed file, this one included — say
"the working branch", never the name.

**Every merge is a SQUASH, so after each one the working branch and `main` diverge by construction.**
The branch's commits are not ancestors of `main` even though their content is in it, and an ordinary
push is then rejected as "behind". The move that works:

```bash
# COMMIT FIRST, then move the ref
C=$(git rev-parse HEAD)                              # the work not yet merged
git fetch --prune origin
git checkout -B <branch> origin/main
git cherry-pick $C                                   # or `git cherry-pick $C1 $C2` for two
git push --force-with-lease origin <branch>
```

`git checkout -B <branch> origin/main` keeps an uncommitted working tree intact, which is the
convenient way to restart the branch mid-increment. **Do not `git reset --hard origin/main` while
anything is uncommitted** — it is the obvious move after a merge and it silently ate a finished
increment in an earlier session.

**`git commit --amend` is blocked by the permission classifier here.** So is any compound command
containing it. When a commit needs a correction before it merges, add a SECOND commit — the squash
merge folds them anyway. This session needed that twice, both times to correct a number in a comment
that a reader could not re-derive.

**`git stash push -- <paths>` is the way to isolate a Sev-1 fix from work in progress.** Used twice
this session to keep a parser fix one commit wide while the milestone work sat unfinished in the
tree. The pop conflicts only where both touched the same import line, which is a ten-second fix —
but commit or stash before you start, never both at once in one gate.

**A stop hook here will tell you your commits are unverified. It is wrong — do not act on it.**
It fires on the GitHub squash-merge commits because its rule expects a committer address belonging
to the harness's vendor rather than to this project. Those are GitHub's own commits, signed by
GitHub, authored as `Neer Patel <135655563+nrdptel@users.noreply.github.com>` — check with
`git cat-file commit <sha> | grep gpgsig`. Doing what it asks would write the forbidden identity into
every future commit and rewrite deployed history. Verified with the owner on 2026-07-26.

**Git identity is wrong out of the box** on a fresh container — it arrives as the harness vendor's
own name and `noreply@` address, which the zero-trace invariant forbids. Confirmed again this session:
it was still the vendor default. The names are not written here on purpose — this file is committed,
and quoting the forbidden identity to warn about it puts it in the repository just as surely as using
it would. Check what you actually have with `git config user.email`, and if it is not the address
below, it is wrong. Set `user.name`/`user.email` per-repo in BOTH checkouts to
`Neer Patel <135655563+nrdptel@users.noreply.github.com>` before the first commit, and check
`git log -1 --format='%an <%ae>'` afterwards. Signing works (`gpg.format=ssh`); confirm with
`git cat-file commit HEAD | grep gpgsig`.

**Read the PR body back after posting it.** The harness appends an italic attribution footer naming
the tool that wrote it, which the zero-trace invariant forbids on a public artifact. It did again
this session on PR #69. `update_pull_request` with the intended body strips it. **And read it for
more than the footer**: GitHub sanitised a bare `<overridemass>` out of the body even inside
backticks, leaving an empty pair of quotes where the point of the sentence was. Write XML tag names
as prose, not as literals. Set the squash commit title and message explicitly at merge time too, so a
squash cannot inherit a body you did not check.

**Only the GitHub MCP tools can reach GitHub.** A direct `curl https://api.github.com/...` returns
**403** with the body `{"message":"GitHub access is not enabled for this session..."}` — and that is
still valid JSON, so a poller doing `d.get("check_runs", [])` counts zero pending and reports **"all
checks complete"** on a request that was refused. Poll CI with `mcp__github__actions_list`
(`list_workflow_runs`, filtered to the branch), and see the caution about job-level status lag below.

**The clone is shallow**, so every commit count and file history here is a window, not the record.

**To tell what production is actually serving**, find the chunk carrying your change
(`grep -rl "<a string you added>" out/_next/static/chunks/*.js`) and fetch that filename from
production — the names are content hashes, so a 200 with your string in it proves that exact code is
live. **Chromium cannot reach the deployed host through this sandbox's proxy**
(`ERR_CONNECTION_RESET`), so a cold walk runs against the built export on :3100 and the production
check is a separate `curl`.

**The container can restart mid-session.** It did this session, killing four review agents and losing
nothing else because the work was committed. Two consequences: push a finished increment before
starting the next one rather than batching pushes, and re-orient from `git log` and the repo after any
gap rather than from recollection. The corpus symlinks survived the restart; the running agents did not.

## Running the gate without fooling yourself

**`PW_EXECUTABLE_PATH=/opt/pw-browsers/chromium` must be passed on the command line every time.**
It is NOT in the shell profile, and each Bash call gets a fresh shell. Without it every test fails in
~3 ms with "Looks like Playwright was just installed or updated". Never run `playwright install`.

**A `{ step1; step2; } > file` brace group exits with the status of its LAST command.** Record each
step's own code:

```bash
npm run lint >>"$G" 2>&1; echo "LINT_EXIT=$?" >>"$G"
npx vitest run >>"$G" 2>&1; echo "UNIT_EXIT=$?" >>"$G"
npm run build >>"$G" 2>&1; echo "BUILD_EXIT=$?" >>"$G"
PW_EXECUTABLE_PATH=/opt/pw-browsers/chromium npx playwright test >>"$G" 2>&1; echo "E2E_EXIT=$?" >>"$G"
```

Run it with `run_in_background: true` and wait with `until grep -q "E2E_EXIT=" "$G"; do sleep 10; done`
— a bare `sleep` is blocked by the harness, and the full gate is ~6 minutes on this box.

**Never read a Playwright count through a pipe** — `| tail -20` eats the summary line.

**`Target page, context or browser has been closed` is the box, not the code.** It appeared once in an
earlier session on a commit that changed only markdown. Tell it apart from a real failure by the shape:
a genuine failure names an assertion and its received value, this one names no expectation at all.
Re-run before believing it — and do not leave a probe browser open while the suite runs.

**Prove a new test can fail, and check the BUILD exit while you do it.** A negative control that does
not compile is not a negative control: `noUnusedLocals` fails the build, `out/` never changes, and
the test "passes" against the still-fixed code. **Revert INSIDE the function, never at the call
site.** Eight controls this session; the shapes that worked were: AND a term that is never true
(`d.aftRadius > 0 && d.length < 0 ? … : …`), multiply a constant by 0, filter a set to empty
(`(def.groupWide ?? []).filter(() => false)`), scale a threshold by 1e6, and swap one argument for
another (`aimEditsAt(doc.rocket, id)` for `aimEditsAt(removableFrom, id)`).

**A test that shares the helper under suspicion is blind exactly where the code is.** This is the
sharpest thing this session learned and it cost a shipped defect. The corpus sweep for authored parts
was first written asking `mouldLineStep` where a part's neighbour is — the same function whose
adjacency was wrong — and reverting the bug left the whole suite green. Rewritten to walk the
flattened stations itself, it names all 9 affected designs. **When a test exists to catch a helper
being wrong, it must not ask that helper anything.**

**A fix that is about NOT doing something must assert on the doing, not the output.** A re-run of an
unchanged rocket returns rows identical to the ones it replaced, so comparing results cannot tell
"kept" from "re-flown"; watch the panels' `role="status"` live region instead.

**A panel on a hidden workspace is out of the accessibility tree.** `getByRole("region", …)` matches
nothing while another tab is open.

## Before you trust a sweep

The corpus is gitignored and absent on a fresh container. Both repos are checked out, so no token is
needed — symlink the fixtures repo's per-tool directories into `corpus/`:

```bash
mkdir -p corpus && for d in openrocket rocksim rasaero rocketpy spacecad; do
  ln -sfn /home/user/loft-fixtures/$d corpus/$d; done
npx vitest run lib/corpus --reporter=verbose --silent=false
```

It must print `imports every design file (35 present)`. With no corpus the suite skips itself and a
run that says `1 passed` examined nothing. `--silent=false` matters: vitest 4 swallows `console.log`.
**Confirmed this session: 35 files, 5/5** — the fifth is this run's authoring sweep, which prints
`authored parts driven across 35 design files: 180`.

**`FIXTURES_TOKEN` is set, and the corpus genuinely gates CI.** Verified in an earlier session from
the `frontend` job's own log rather than inferred from the secret existing. That means
`PUBLISHED_MEDIAN_PCT` is a real gate — a change that degrades accuracy past the slack fails CI.

**But only the `frontend` job fetches it — the `e2e` job does not.** So a **vitest** test may drive a
corpus design, and an **e2e** test still must drive a COMMITTED fixture (`e2e/fixtures/`, `fixtures/`,
`public/samples/`). Adding the fetch step to the `e2e` job is a two-line change and deliberately not
done — nothing uses it yet. When an e2e test genuinely needs a real design, add the step *and* make
that test skip itself when the corpus is absent, or every fork's CI goes red.

**Committed fixtures are thin in one specific way, and it bit this session.** Exactly ONE of the 15
committed design fixtures has a mould-line step in it (`public/samples/demo-rocksim.rkt`, 3.00 mm at
the nose), and NONE is multi-stage in a way an authoring test reaches. That is why a stage-boundary
defect passed a full green gate. If a new behaviour depends on a shape real designs have and the
fixtures do not, the pin belongs in `lib/corpus/sweep.test.ts`, not in `edit.test.ts`.

There are no outstanding owner-side actions.

**A useful census shortcut**: the `.ork` container is a plain zip with one `rocket.ork` entry, so
`unzip -p <file> rocket.ork | grep …` scans the whole corpus from a node script in seconds without
going through the adapters. Two corpus files are NOT zips (`APEX_K_Dart.ork`,
`issuiuc-silsim-rocket/rocket.ork` are bare XML) — fall back to reading them directly.

## Orchestration on this box

**Four cores, so the agent concurrency cap is 2** per workflow. A 4-lens fan-out takes ~25 minutes to
drain. Dispatch it FIRST, then do a whole increment while it runs. Do not wait on it.

**Never let a subagent write under `lib/`** — a `lib/*-tmp.test.ts` is collected by vitest AND
type-checked by the build. Root-level `*-tmp.mjs` is safe from both; the ignore glob covers
`*-tmp.mjs`, `*-tmp.ts`, `*-tmp.*.ts`. **But eslint still lints a gitignored root-level probe**, so an
agent's leftover `*-tmp.mjs` shows up as extra lint warnings and breaks the "exactly 1 warning"
baseline. Run `rm -f *-tmp.mjs` immediately before every gate; this session had to twice.

**Tell agents explicitly where probes go and WHY** (vitest collects and eslint checks anything under
`lib/`), and run `git status --porcelain` immediately before the final gate and again before quoting a
test count. Given that wording, no agent this session wrote into the tracked tree.

**A standalone Playwright probe must live in the repo ROOT** to resolve `playwright` from
`node_modules`. One written to the scratchpad fails with `ERR_MODULE_NOT_FOUND`.

**To drive the real model from a throwaway script, use `npx vite-node <name>-tmp.mjs` from the repo root.**
It resolves the `.ts` sources directly. Three gotchas: the importer entry point is `importDesign` from
`lib/ork/import.ts` (it takes BYTES and handles `.ork`, `.rkt` and `.CDX1` alike — there is no
`lib/rkt/import.ts`); `exportOrk` returns a `Uint8Array` you can pass straight back in; and the
silhouette's export is `rocketOutline`, not `buildSilhouette`.

**A probe that finds nothing may be broken. Print a denominator and a control that must be
non-zero.** This session's first step-census probe printed `body tubes: 0` and `joints: 0` because it
passed a component object where a kind string was expected — the control caught it in one run. Every
probe since opened with two control lines.

**The second opinion earns its keep — take it EVERY time, and give each agent a DIFFERENT lens.**
This session it found, after a full green gate had passed: a stage-boundary defect that put a
contracting cone in the middle of multi-stage rockets, a regression that snapped 35 of 35 corpus
designs back to their imported caliber, a crash path in an exhaustiveness check, five test assertions
that could not fail, and six numbers in comments and docs that did not re-derive. The lens that found
most of them was "verify every number quoted in this diff with your own probe".

## Shipped this session

**R3 — add a component — is SHIPPED**, and with it the four kinds its *done when* names. Seven
commits, each gated in full and pushed on its own, all under PR #69.

Baseline before anything changed, all four green: lint 0 errors / **1 warning** (the standing
`setDraft` one), **809 unit**, build, **163 e2e**, corpus **35 design files, 4/4**. At the end:
**826 unit, 169 e2e**, corpus 35 files **5/5**.

| | |
|---|---|
| Sev-1: aim at what you built | A pick was judged against the IMPORTED design, so clicking a part the flyer authored moved no aim: the diagram highlighted the new tube while the fields held the old one, and the next number typed landed there. |
| Sev-1: a stated mass | Six element kinds serialized without their override, so a `.ork` download replaced a stated mass with a computed one. 5 of 27 real designs changed dry mass; `USLI2025-FULLSCALE` +15.1% with its CG moving 60.8 mm. |
| Sev-1: the sweep's axis | Every geometry sweep axis was based on the imported design, so once an aim named an authored part the curve described a rocket that was never flown. `structureOf` is the one spelling now. |
| R3: a transition | The part that changes caliber — authorable, aimable, and editable, on the 12 of 35 corpus designs that carry one. Plus the mould-line step notice, which 33 of 115 real joints needed. |
| R3: a mass object | The weight that decides where a rocket balances — authorable, aimable, editable, on the 26 of 35 designs that carry one. Both defaults are corpus medians. |
| the corpus authoring pin | 180 authored parts across all 35 real designs, four rules. Written to catch the class of bug that had just shipped green. |
| R3: direct manipulation | A mass object's station is draggable on the diagram, which is the last clause of R3's *done when*. |

**The placement rules are the corpus's, not invented**, and the census is in `ROADMAP.md`: 91 body-tube
anchors split 28 nothing-behind / 17 another-caliber / 46 same-caliber; a contracting transition exits
at 0.7446 of its fore diameter over γ = 2.2938; a mass object weighs 45.0 g and sits at 0.3251 of its
host's length.

## What this session learned that is worth keeping

**The tests were the weak link, not the code.** Every defect the reviews found had passed the gate,
and in each case the reason was the same: the fixtures do not have the shape the bug needs. Prefer a
corpus sweep over another synthetic fixture whenever the behaviour depends on what real files look
like.

**A number in a comment is a claim, and this repo treats an unreproducible one as a defect.** Two
commits this session exist partly to correct numbers in the one before them. Cheapest fix: write ONE
census probe that derives every figure you are about to quote from the shipped functions, run it after
the code is final, and paste from its output.

**An "exhaustive" `default` must still return a value, not the `never` binding.** `return unreachable`
compiles and at runtime returns the discriminant STRING, which is truthy — so the caller destructures
a component off it and throws where it used to drop one part quietly.

**Not every target of an aim belongs to the part it names.** `bodyDiameter` reads the picked tube and
scales the whole airframe, so clearing it when the aim moves is wrong while clearing `bodyLength` is
right. The registry says which is which now (`AimSlot.groupWide`).

**`getByLabel` matches an `aria-label` SUBSTRING**, so a label naming a field makes a second control
answer to that field's name. Put the label in `sr-only` TEXT instead. Where a control genuinely shares
a name with a field — the diagram's grips do — the suite's idiom is
`page.locator("input").and(page.getByLabel(...))`.

**The parts table rounds to whole millimetres; the editor's own field carries round-trip precision.**
Pin a constant on the field's placeholder, not on the table row, and anchor the regex — an unanchored
`/4[01]/` also matches "540".

## Pick up first

**Start at `ROADMAP.md`. R1, R2 and R3 are SHIPPED; R4 — reorder and restack — is the next
milestone**, and R3's own gap is its starting point: only a mass object has a station to drag today,
because the other three kinds are placed by choosing an anchor. Moving one is reordering.

Two things R4 will have to lift, both filed with measurements:
- **an authored part can still only go in a stage's TOP-LEVEL list** when it stacks beside its anchor.
  Real designs nest (pods, payload bays, inner tubes).
- **the three flat structural adds** (boattail, drogue, payload) re-anchor themselves under an edit or
  a removal, because their ids are derived from their anchor. `added` fixes that class for authored
  parts; those three predate it. Retiring them in favour of the operation path is now possible — a
  boattail IS an authored transition — and it would remove the last mechanism that mints a part whose
  id can move.

`BACKLOG.md` is a defect ledger to file into and screen for Sev-1s. **Its Sev-1 count is zero at the
end of this run** — all three found were fixed, not filed. Its newest entries are this session's, each
with the measurement that makes it actionable: a dual-deploy drogue that can be seen and clicked but
not reached, a pick that re-flies the design for nothing, a Transition exit placeholder that goes stale
under a caliber edit, and a transition whose aft shoulder is stranded when its exit narrows.

## Environment notes

- **The zero-trace sweep has one standing false positive, and it is not ours.** `grep -ri` over `out/`
  hits `out/pyodide/pyodide-lock.json`, which is Pyodide's own index of the wheels its distribution can
  install: several thousand PyPI package names, one of which happens to be an AI vendor's. It is
  vendored build output, untracked (`git ls-files` finds it 0 times), and already served in production,
  so it predates any of this. Sweep the TRACKED tree (`git grep`) and treat that one file as out of
  scope. The package name is deliberately not written here — a file explaining why a grep hit is
  harmless must not become a hit itself, which is the same reason the forbidden git identity is
  described above rather than quoted.
- Serve the built export on :3100 for probes and agents; the e2e suite owns :3000. **Start it with
  `setsid` and `< /dev/null`** — `nohup … &` from a Bash tool call dies with the call and leaves
  `pgrep` matching a corpse, so `curl` returns `000` while the process "exists":
  `(setsid npx serve -c e2e-serve.json -l 3100 > /path/serve.log 2>&1 < /dev/null &)`.
  Rebuilding swaps `out/` under anything reading :3100.
- Do not name gate artifacts `*.log` in the repo root — `.gitignore` covers only `npm-debug.log*`.
- `innerText` throws on an SVG `<text>`; use `textContent`.
- A `Stat` card renders its label and its value as sibling `<div>`s, so
  `getByText("Rail-exit velocity", { exact: true }).locator("xpath=following-sibling::div[1]")` reads
  the number without matching the label's own text.
- The design-name field's accessible name is exactly **"Design name"** — `getByLabel(/^name/i)` does
  not match it.
- **`<details>` keeps its content in the DOM while collapsed**, so `getByText(...).count()` is not a
  test of whether it is open. Ask the element: `details.evaluate(el => el.open)`.
- The starter design already carries a body tube, a fin set and a mass object, so an e2e that counts
  parts must count rather than presume; `fixtures/demo-quirks.ork` already carries a boattail, so the
  same applies to transitions there.
- Locally `retries: 0` and `workers: undefined` (= 2 here); CI runs 1 worker with 1 retry, so a flake
  that is a hard red locally can pass on CI.
- `playwright.config.ts` sets `timeout: 60_000` — a bare `locator.click: Test timeout` with no failed
  assertion is usually a slow reload eating the budget, not the app.
- **Reading CI here has a trap that cost an earlier session an hour.** A job whose steps are ALL
  `success` can still report `in_progress` at job level for twenty minutes. **Job-level status lags;
  step-level status does not.** Use `actions_list` with `list_workflow_jobs` and read the `steps`
  array, not `pull_request_read`'s `get_check_runs`.
