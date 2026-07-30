# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

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
merge folds them anyway.

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
the tool that wrote it, which the zero-trace invariant forbids on a public artifact.
`update_pull_request` with the intended body strips it. Set the squash commit title and message
explicitly at merge time too, so a squash cannot inherit a body you did not check.

**Only the GitHub MCP tools can reach GitHub.** A direct `curl https://api.github.com/...` returns
**403** with the body `{"message":"GitHub access is not enabled for this session..."}` — and that is
still valid JSON, so a poller doing `d.get("check_runs", [])` counts zero pending and reports **"all
checks complete"** on a request that was refused. Poll CI with `mcp__github__pull_request_read`
(`method: get_check_runs`), and see the caution about job-level status lag below.

**The clone is shallow**, so every commit count and file history here is a window, not the record.

**To tell what production is actually serving**, find the chunk carrying your change
(`grep -rl "<a string you added>" out/_next/static/chunks/*.js`) and fetch that filename from
production — the names are content hashes, so a 200 with your string in it proves that exact code is
live. **Chromium cannot reach the deployed host through this sandbox's proxy**
(`ERR_CONNECTION_RESET`), so a cold walk runs against the built export on :3100 and the production
check is a separate `curl`.

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

**Never read a Playwright count through a pipe** — `| tail -20` eats the summary line.

**`Target page, context or browser has been closed` is the box, not the code.** It appeared once this
session on a commit that changed only markdown, on a test that had passed minutes earlier and passed
again alone and in a clean full run. The cause was a probe's own Chromium still running alongside the
suite. Tell it apart from a real failure by the shape: a genuine failure names an assertion and its
received value, this one names no expectation at all. Re-run before believing it — and do not leave a
probe browser open while the suite runs.

**Prove a new test can fail, and check the BUILD exit while you do it.** A negative control that does
not compile is not a negative control: `noUnusedLocals` fails the build, `out/` never changes, and
the test "passes" against the still-fixed code. This session's controls reverted `positive` on the
rail field and restored the zero-swallowing converter, rebuilt with `BUILD_EXIT=0`, and confirmed
both new tests went red — then restored from a copy taken before the revert.

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
**Confirmed this session: 35 files, 3/3.**

**`FIXTURES_TOKEN` is set, and the corpus now genuinely gates CI.** Verified in the CI log of the
`frontend` job, not inferred from the secret existing: `imports every design file (35 present)`, all
three corpus tests green in 20.0 s, and the accuracy census printed with the same medians as a local
run (deployment velocity 5.9%, flight time 3.3%, max altitude 3.2%, time to apogee 1.7%, n = 76–97).
That means **`PUBLISHED_MEDIAN_PCT` is now a real gate** — a change that degrades accuracy past the
slack fails CI, where before this it silently skipped. Whole `frontend` job: 84 s, 715 tests.

**But only the `frontend` job fetches it — the `e2e` job does not.** So the old rule now applies to
half the suite: a **vitest** test may drive a corpus design, and an **e2e** test still must drive a
COMMITTED fixture (`e2e/fixtures/`, `fixtures/`, `public/samples/`). Adding the fetch step to the
`e2e` job is a two-line change and deliberately not done — nothing uses it yet, and shipping a CI step
that enables nothing is the speculative work the brief forbids. When an e2e test genuinely needs a
real design, add the step *and* make that test skip itself when the corpus is absent, or every fork's
CI goes red.

There are no outstanding owner-side actions.

**A useful census shortcut**: the `.ork` container is a plain zip with one `rocket.ork` entry, so
`unzip -p <file> rocket.ork | grep …` scans the whole corpus from a node script in seconds without
going through the adapters. Two corpus files are NOT zips (`APEX_K_Dart.ork`,
`issuiuc-silsim-rocket/rocket.ork` are bare XML) — fall back to reading them directly.

## Orchestration on this box

**Four cores, so the agent concurrency cap is 2** per workflow. A 5-lens fan-out with per-finding
verification is ~20 agents and takes well over an hour to drain at that rate — dispatch it FIRST,
then do a whole increment while it runs. Do not wait on it.

**Never let a subagent write under `lib/`** — a `lib/*-tmp.test.ts` is collected by vitest AND
type-checked by the build. Root-level `*-tmp.mjs` is safe from both; the ignore glob covers
`*-tmp.mjs`, `*-tmp.ts`, `*-tmp.*.ts`. Clean the tree before the final gate and compare lint against
the baseline: **exactly 1 warning, the deliberate `setDraft` one in `LoftApp.tsx`**.

**Saying "you are read-only" is not enough — one did it anyway this session** (`lib/model/zz-repro.test.ts`),
and the gate came back with 6 lint errors and an inflated test count from a file that was not mine. Tell the
agent explicitly to put probes under `/tmp` and run them with `npx vite-node` on an absolute path, say WHY
(vitest collects and eslint checks anything under `lib/`), and then run **`git status --porcelain`
immediately before the final gate and again before quoting a test count.** The later fan-outs, given that
wording, stayed out.

**A standalone Playwright probe must live in the repo ROOT** to resolve `playwright` from
`node_modules`. One written to the scratchpad fails with `ERR_MODULE_NOT_FOUND`.

**To drive the real model from a throwaway script, use `npx vite-node <name>-tmp.mjs` from the repo root.**
It resolves the `.ts` sources directly, so a probe can `import { importOrk } from "./lib/ork/import.ts"`
and walk `flattenRocket` without a build. Two gotchas: `importOrk` wants the ZIP bytes, not the XML
(`exportOrk` returns a `Uint8Array` you can pass straight back in), and the silhouette's export is
`rocketOutline`, not `buildSilhouette`. `*-tmp.mjs` in the ROOT is covered by the ignore glob and is safe
from both vitest and the build — never put one under `lib/`.

**A probe that finds nothing may be broken. Print a denominator and a control that must be
non-zero.** Every probe this session opened with a control line naming the design's own value and a
non-zero change from a known-good entry, before measuring the case under test.

**The second opinion earns its keep — take it EVERY time.** It has found a real hole in the diff that
produced it more than once, including a false sentence in a doc comment written in that same diff.

## Shipped this session

**The run's goal was `ROADMAP.md`'s current milestone, and it shipped: R2 — delete a component, and undo
it.** It is marked SHIPPED there with the checks that pin it named, and the gap it leaves is written up as
R3's starting point. **R3 is now IN PROGRESS**; its first increment had not landed at the time of writing.

Baseline before anything changed, all four green: lint 0 errors / **1 warning** (the standing `setDraft`
one), **772 unit** (769 + the 3 corpus tests), build, **152 e2e**, corpus **35 design files, 3/3**. At the
end: **795 unit, 160 e2e**, corpus 35 files **4/4** — the fourth is new, below.

**Four commits on the working branch, each gated in full and pushed on its own, all four under PR #68.**

| | |
|---|---|
| undo everything | `lib/model/history.ts` — a pure, generic snapshot stack with a LABEL, RUN COALESCING and a depth cap. Every what-if was already a value in one bag over a pristine design, so a step is a copy of that bag. The snapshot is `{edits, weather, scenario, simIndex}`, because three controls move more than the edit bag in one act. Ctrl/⌘+Z, Shift+Z, Ctrl+Y. "Reset to as-designed" is a step like any other. |
| the delete surface's mass | A RASAero import mints one point mass carrying the WHOLE stated launch weight (the format has no per-part masses), and it could be deleted — 453.6 g dry → 0.0 g, CG at the nose tip, still flown. `standsForAirframe` + a refusal. And a removal inside a stated whole-assembly weight sheds nothing: now said before the click and after it. |
| a Sev-1 the review found | Typing −5 into Rail length flew a 0 m/s rail exit **while the cursor was still in the box** — the range was applied at the COMMIT and typing pushed every keystroke at the model. Pre-existing; the undo work made it reachable again with the warning stripped. The keystroke handler now withholds any complete number the commit path would refuse. |
| the corpus pin, and R2 done | A new corpus test drives **536 removable parts across all 35 real designs**. It found a second door to the RASAero defect on its first run: that point mass hangs off the first body tube, so removing THAT tube deleted the design's whole weight. `Show-off.CDX1` has two tubes, so the last-tube refusal never fired. |

**R2's *done when*, walked in the built export on `Simulation scripting.ork`** (4 fin sets, 2 mass objects,
3 body tubes; 2,348 m / 2.09 cal / 7.012 kg dry): fin set "CONTROL" → 2,458 m / 3.08 cal / 6.957 kg; mass
object "Nose cone payload" → 2,399 m / 1.58 cal / 6.362 kg; aft body tube → 4.672 kg and NO FLIGHT, because
it carries the motor mount and Loft reports a design with no propulsion rather than inventing one. Every undo
returned to the exact prior model. Taking tubes away until one is left refuses the last with its sentence.

## What this session learned that is worth keeping

**The pre-push second opinion found a Sev-1 in code that had already passed a full green gate.** Typing −5
into a rail-length box flew 0 m/s off the rail with no warning, for as long as the cursor stayed in the box.
A green gate is not a review; take the second opinion every time, and give each agent a DIFFERENT lens —
"can a flyer get a wrong number" is the one that found it, and neither of the other two did.

**A sweep over EVERY part beats a probe over the part you suspected.** The hand-written probe drove all 56
mass objects and cleared the design. The corpus test, which drives all 536 removable parts, found on its
first run that the same weight could be deleted from ABOVE by taking the body tube it hangs off. Write the
broad check before believing the narrow probe.

**`getByLabel` matches an `aria-label` SUBSTRING, so a label naming a field makes a second control answer to
that field's name.** "Undo the rail length" was matched by every `getByLabel(/Rail length/)` in the suite,
and it came first in the document. The fix is not to patch thirty locators: put the label in `sr-only` TEXT
instead of `aria-label` — the accessible name is the same, and `getByLabel` does not match text content.

**Measure the phone header before adding to it.** Two buttons took the design header from fitting to wanting
518 px of a 358 px row. Overflowing puts a horizontal scrollbar under every workspace; wrapping costs 48 px
of height, which pushed the diagram's drag handles below the fold and made `elementFromPoint` at a handle's
own centre return null. And **`flex-wrap` wraps BEFORE it shrinks** — the name field kept its full 176 px and
the row went to two lines anyway. Nowrap plus `min-w-0` on the row AND the field is what actually fits.

**`aria-disabled` rather than `disabled` on a toolbar button.** A disabled button leaves the accessibility
tree and drops focus to `<body>` — and for undo, the moment the stack empties is exactly when a keyboard user
is stepping back through a mistake. Playwright's `toBeDisabled()` matches `aria-disabled` too, and its
actionability check refuses to click one, so the e2e reads the same.

**A negative control that keeps every symbol referenced.** Seven controls this session, all with BUILD_EXIT
0 checked: revert the rule INSIDE the function (`at - open.at < 0 && COALESCE_MS > 0`), invert a call-site
condition (`if (action && !movedWhatIf(...))`), bind a shortcut to the wrong key, or AND in a term that is
never true (`&& target.component.mass < 0`). Never revert at the call site — `noUnusedLocals` fails the
build, `out/` never changes, and the test then passes against still-correct code.

## Pick up first

**Start at `ROADMAP.md`.** R1 and R2 are SHIPPED. **R3 — add a component — is IN PROGRESS and is the run's
goal.** Its *done when*: start from the starter design, add a second body tube, a transition, a fin set and a
mass object, place each at a station by direct manipulation, fly it, and have the stability and mass panels
describe the rocket you just built.

**R3's pivot, named in `ROADMAP.md` and confirmed by R2.** `GeometryEdits` is a flat patch of ~30 optional
scalars. It cannot express "add a body tube": there is no field for a part that does not exist, and no way to
say WHICH of three. Loft already adds three components through that patch — a boattail, a dual-deploy drogue
and a payload point mass — and each is a special case with one instance and a hard-coded anchor. Read
`addBoattail`, `applyDualDeploy` and `addPayloadMass` in `lib/model/edit.ts` before designing the general
one; `addBoattail`'s anchor is the cautionary tale (it keyed on the LONGEST tube, which broke the moment
`bodyLength` could be aimed).

**The undo stack survives that transition unchanged** — a snapshot of an operation list is still a snapshot —
so R3 does not have to rebuild it.

`BACKLOG.md` is a defect ledger to file into and screen for Sev-1s. **Its Sev-1 count is zero at the end of
this run** — the one that was found (the rail length) was fixed, not filed. Its five newest entries are this
session's, each with the measurement that makes it actionable.

## Environment notes

- Serve the built export on :3100 for probes and agents; the e2e suite owns :3000. **Start it with
  `setsid` and `< /dev/null`** — `nohup … &` from a Bash tool call dies with the call and leaves
  `pgrep` matching a corpse, so `curl` returns `000` while the process "exists":
  `(setsid npx serve -c e2e-serve.json -l 3100 > /path/serve.log 2>&1 < /dev/null &)`.
  Rebuilding swaps `out/` under anything reading :3100.
- Do not name gate artifacts `*.log` in the repo root — `.gitignore` covers only `npm-debug.log*`.
- `innerText` throws on an SVG `<text>`; use `textContent`.
- `getByLabel` matches substrings AND matches a `g[role="slider"]` sharing the name. Use
  `page.locator("input").and(page.getByLabel(/…/))` when you mean the field, or
  `page.locator("label").filter({ hasText: /…/ }).first().locator("input")`, which is what the e2e
  suite uses.
- A `Stat` card renders its label and its value as sibling `<div>`s, so
  `getByText("Rail-exit velocity", { exact: true }).locator("xpath=following-sibling::div[1]")` reads
  the number without matching the label's own text.
- The design-name field's accessible name is exactly **"Design name"** — `getByLabel(/^name/i)` does
  not match it.
- **`<details>` keeps its content in the DOM while collapsed**, so `getByText(...).count()` is not a
  test of whether it is open. Ask the element: `details.evaluate(el => el.open)`. The Conditions
  panel is one of these and starts closed.
- Locally `retries: 0` and `workers: undefined` (= 2 here); CI runs 1 worker with 1 retry, so a flake
  that is a hard red locally can pass on CI.
- `playwright.config.ts` sets `timeout: 60_000` — a bare `locator.click: Test timeout` with no failed
  assertion is usually a slow reload eating the budget, not the app.
- **Reading CI here has a trap that cost an earlier session an hour.** A job whose steps are ALL
  `success` can still report `in_progress` at job level for twenty minutes. **Job-level status lags;
  step-level status does not.** Use `actions_list` with `list_workflow_jobs` and read the `steps`
  array, not `pull_request_read`'s `get_check_runs`.
