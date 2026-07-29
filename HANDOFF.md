# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Where the work is

The session is pinned to a working branch, not `main`. **CI does not run on a branch push.**
`test.yml` fires on `push: [main]` and on `pull_request:` only, and `deploy-cloudflare.yml` on
`push: [main]`. So the sequence that actually ships is: gate locally → push the branch → open a PR
(that is what makes CI run) → merge on green (that is what deploys).

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
name and address, which the zero-trace invariant forbids. Set `user.name`/`user.email` per-repo in
BOTH checkouts to `Neer Patel <135655563+nrdptel@users.noreply.github.com>` before the first commit,
and check `git log -1 --format='%an <%ae>'` afterwards. Signing works (`gpg.format=ssh`); confirm
with `git cat-file commit HEAD | grep gpgsig`.

**Read the PR body back after posting it.** The harness appends an italic attribution footer naming
the tool that wrote it, which the zero-trace invariant forbids on a public artifact.
`update_pull_request` with the intended body strips it. Set the squash commit title and message
explicitly at merge time too, so a squash cannot inherit a body you did not check.

**Only the GitHub MCP tools can reach GitHub.** A direct `curl https://api.github.com/...` returns
**403** with the body `{"message":"GitHub access is not enabled for this session..."}` — and that is
still valid JSON, so a poller doing `d.get("check_runs", [])` counts zero pending and reports **"all
checks complete"** on a request that was refused. Poll CI with `mcp__github__pull_request_read`
(`method: get_check_runs`).

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

**Prove a new test can fail, and check the BUILD exit while you do it.** This bit twice this session
and the second one is the subtle one:

1. The first negative control edited `ResultsView` so the fix was reverted — but that left a prop
   unused, `noUnusedLocals` failed the build, `out/` never changed, and the test "passed" against the
   still-fixed code. **A negative control that does not compile is not a negative control.**
2. The second compiled, `BUILD_EXIT=0`, and the test STILL passed — because the assertion compared
   the sweep's rows before and after, and **a re-run of an unchanged rocket returns rows identical to
   the ones it replaced.** Asserting on the RESULT could not tell "kept" from "re-flown". The test
   had to watch the panels' `role="status"` live region — the WORK — instead.

The general rule: when a fix is about *not doing* something, assert on the doing, not on the output.

**A panel on a hidden workspace is out of the accessibility tree.** `getByRole("region", …)` matches
nothing while another tab is open, so a watcher armed on the Analyze panels sees nothing while you
are making an edit on Design. That is why the rename test watches the live region (same tab) and the
ballast control asserts on changed rows (across tabs) — two different observables for two directions
of the same test.

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

**CI still cannot fetch the corpus until a `FIXTURES_TOKEN` repository secret exists.** That secret
remains the one owner-side action. A test that needs a design file must drive a COMMITTED fixture
(`e2e/fixtures/`, `fixtures/`, `public/samples/`).

## Orchestration on this box

**Four cores, so the agent concurrency cap is 2** per workflow. A 4-lens fan-out with per-finding
verification is ~48 agents and takes well over an hour to drain at that rate — dispatch it FIRST,
then do a whole increment while it runs. Do not wait on it.

**Never let a subagent write under `lib/`** — a `lib/*-tmp.test.ts` is collected by vitest AND
type-checked by the build. Root-level `*-tmp.mjs` is safe from both; the ignore glob covers
`*-tmp.mjs`, `*-tmp.ts`, `*-tmp.*.ts`. Clean the tree before the final gate and compare lint against
the baseline: **exactly 1 warning, the deliberate `setDraft` one in `LoftApp.tsx`**.

**A probe that finds nothing may be broken. Print a denominator and a control that must be
non-zero.** Three probes this session reported a clean bill of health while measuring nothing: one
never clicked Run and counted an unrelated table's 14 rows; one matched a `<details>` whose content
is in the DOM while collapsed; one used a busy-detector that never fired on the explicit Run it was
supposed to calibrate against.

**The second opinion earns its keep — take it EVERY time.** On the first increment it found a real
hole (the parameter sweep never honoured the cache key at all, by a different route) and a false
sentence in a doc comment *written in that same diff*. Both were fixed before the push.

## Shipped this session

Baseline before anything changed: lint 0 errors / 1 warning, **682 unit**, build, **122 e2e**, corpus
**35 design files, 3/3**. At the time of writing: **695 unit, 128 e2e**, corpus 35 throughout.

Both pull requests merged on green CI and are serving.

**A caution about reading CI here, which cost this session nearly an hour.** The checks API reported
PR #57's e2e job as `in_progress` for twenty minutes after that job had completed green, and it
happened again on #58 — a job whose steps were ALL `success`, including "Complete job", still
reported `in_progress` at job level. **Job-level status lags; step-level status does not.** Use
`actions_list` with `list_workflow_jobs` and read the `steps` array, not `pull_request_read`'s
`get_check_runs`. Concluding from a stale `in_progress` that a run is stuck nearly ended this
session with finished, verified work sitting unmerged.

**PR #56, squash `20ee501`** — confirmed serving by fetching the content-hashed chunk carrying its
new strings (it 404'd before the merge):

| | |
|---|---|
| rename | The design name was the first field of the analysis cache key, so each keystroke re-flew the Monte-Carlo and both sweeps and staled the cross-check — 4.3 s of dispersion per character. Identity is now a serial bumped by `loadDoc`. Review of that diff found two more holes in the same key: the parameter sweep depended on an object rebuilt from the document so it never honoured the key at all, and a swap keyed on the designation alone could not tell an Estes C6 from a Quest C6. |
| round-trip | A field's greyed placeholder advertised a rounded reading of the value in force: "7" mph against a flown 6.71, and typing it back moved drift 4.31% while hiding the file's own stored comparison. In the Design editor the same rounding DESTROYED data — 0.03 mm redisplayed as "0.0", parsed back as zero, and zero means "no edit". `d.fmtEditable` adds a decimal only where the nominal precision would misstate. |
| close | The dispersion run and both sweeps had no way to close: 2,195 px against 308 px on a 390 px phone, and 2.5 s of re-flying per design edit. Plus focus return and state reset, both from review. |

**PR #57, merged as `1ca7989` and confirmed live** — production build `f0a829ea5191` serves both
markers (the provenance note's own text, and `LaunchGuideLength` in the adapter), checked by fetching
the content-hashed chunk:

| | |
|---|---|
| `fb0d5a6` | Conditions says which of its greyed values Loft supplied and which the design did. A from-scratch build showed rail 1.0 / wind 0 / elev 0 under a caption calling them the flyer's own setup. Also carries, unmentioned in its own message (`--amend` is blocked here, so `dfef63d` records it): a rename now survives a reload and a "pick it back up". |
| `7bdec07` | The note says what Loft READ, not what the file contains — see below. |
| `829c797` | The parser fix behind that wording: design-level launch setup on RASAero and RockSim. 1.0 m default → 3.6576 m on the CDX1, → 0.9144 m on the .rkt, every other corpus design unchanged. |
| `0614f8f` | The done-check's two measurements, recorded not acted on. |

**The parser diff's independent review did not return inside the 30 minutes it was given**, so its
checks are mine — that diff is still the best candidate for a fresh pair of eyes: units confirmed against a file carrying BOTH tags at the same value (`TubeFins1.rkt`,
914.4 each way), a before/after rail census over all 35 corpus designs, and an end-to-end walk of both
affected files in the built export. If you want the second opinion, that diff is the one to hand a
fresh agent.

## The thing to actually learn from this session

**A note that fills a silence can be worse than the silence.** The Conditions note started as "This
design specifies no rail length…", which reads well and is FALSE on two import paths: RASAero and
RockSim both state a launch setup at DESIGN level, and Loft's adapters only reached it from inside a
per-simulation loop. `Three-stage rocket.CDX1` in the corpus states a 12 ft rail, 7.64° and 3,750 ft
against a self-closing `<SimulationList/>` — the note would have denied all three. Caught by review,
not by the gate: every test passed both before and after, because no test knew what the file said.

The wording is now "Loft read no …", which is true whichever way the gap falls, and the gap itself is
fixed in the adapters — measured on the corpus, 1.0 m default → 3.6576 m on that RASAero file and
→ 0.9144 m on `rocksimTestRocket2.rkt`.

**The general form: when you add a sentence about someone else's data, the sentence is a claim, and
it needs a source the same way a number does.**

## Pick up first

1. **`fromSpan` and `fromMass` map an entered 0 to `undefined`,** so zero is not a value a flyer can
   set — a fin sweep of 0 is a straight leading edge and cannot be expressed. A semantics change per
   field, which is why the round-trip pass did not fold it in.
2. **The scenario toggle is a second door into the state `onWeather` guards** and leaves a wind edit
   in a disabled box the flight has thrown away (2,518 m of drift advertised against 1,563 m).
3. **The boattail exit placeholder quotes a rounded bound** — a 0.0635 m body advertises "< 64" when
   63.5 mm is the ceiling, so 64 mm reads as allowed and is wider than the body.
4. **The stored-tool comparison is silently absent on a file that carries no stored results**, which
   is 3 of the 4 bundled samples — measured directly from the files: `demo-dual-deploy.ork`,
   `demo-single-deploy.ork` and `demo-multi-config.ork` each have `<simulation>` blocks with zero
   `<flightdata>`. So the headline cross-check the landing copy promises never appears on the default
   first run and nothing says why, while three other ways it can go missing each get a panel.
5. **`Payload pos` placeholder does not track the edited rocket** — 3.1 in of CG and 2.07 cal of
   static margin between what the field advertises and where a blank payload lands. Not re-measured.
6. **The Flight card's stat tiles** put the label at 11 px and the unit at 12 px against a 20–24 px
   value, on the surface the whole pad check happens on. 630 m of drift is a different walk from 630 ft.

`BACKLOG.md` carries the full ranked queue with measurements — a 4-lens fan-out over the app filed 48
findings this run and 10 were killed by adversarial verification, including two of the three ranked
most damaging. Read it before choosing, and reproduce before scoping.

## Environment notes

- Serve the built export on :3100 for probes and agents; the e2e suite owns :3000. **Start it with
  `setsid` and `< /dev/null`** — `nohup … &` from a Bash tool call dies with the call and leaves
  `pgrep` matching a corpse, so `curl` returns `000` while the process "exists":
  `(setsid npx serve -c e2e-serve.json -l 3100 > /path/serve.log 2>&1 < /dev/null &)`.
  Rebuilding swaps `out/` under anything reading :3100.
- A standalone Playwright probe must live in the repo ROOT to resolve `playwright` from
  `node_modules`. One written to the scratchpad fails with `ERR_MODULE_NOT_FOUND`.
- Do not name gate artifacts `*.log` in the repo root — `.gitignore` covers only `npm-debug.log*`.
- `innerText` throws on an SVG `<text>`; use `textContent`.
- `getByLabel` matches substrings AND matches a `g[role="slider"]` sharing the name. Use
  `page.locator("input").and(page.getByLabel(/…/))` when you mean the field.
- The design-name field's accessible name is exactly **"Design name"** — `getByLabel(/^name/i)` does
  not match it.
- **`<details>` keeps its content in the DOM while collapsed**, so `getByText(...).count()` is not a
  test of whether it is open. Ask the element: `details.evaluate(el => el.open)`.
- Locally `retries: 0` and `workers: undefined` (= 2 here); CI runs 1 worker with 1 retry, so a flake
  that is a hard red locally can pass on CI.
- `playwright.config.ts` sets `timeout: 60_000` — a bare `locator.click: Test timeout` with no failed
  assertion is usually a slow reload eating the budget, not the app.
