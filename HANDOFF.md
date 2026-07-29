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
**35 design files, 3/3**.

| | |
|---|---|
| `c81dc74` | **A rename no longer throws away every analysis on the page.** The design name was the first field of the analysis cache key, so each keystroke in the rename field re-flew the Monte-Carlo and both sweeps and marked the RocketPy cross-check stale — measured at 4.3 s of dispersion per character on the 54 mm dual-deploy sample. Identity is now a serial bumped by `loadDoc` and by nothing else. Two more holes in the same key, both found by the review of this diff: the parameter sweep depended on the axis OBJECT (rebuilt from `doc`) so it never honoured the key at all, and a motor swap keyed on the designation alone could not tell an Estes C6 from a Quest C6. |
| `e6056e0` | **The launch conditions are advertised at a precision you can type back.** A Conditions placeholder is a reading of the value being flown; rounded to the field's nominal precision it stopped being true. A design flying 3.0 m/s advertised "7" mph while flying 6.71, and typing the advertised 7 back moved drift 2,066 → 2,155 ft (+4.31%) AND hid the design file's own stored comparison. `d.fmtEditable` grows decimals only until the round trip is within 0.1%. |

## Pick up first

1. **The other 20 editable fields have the same round-trip defect `e6056e0` fixed for the 4 Conditions
   ones.** A census of all 31 (24 `<Num>` in `LoftApp.tsx`, 7 `<NumberField>` in `MonteCarlo.tsx`) is
   the basis. Worst measured: **fin thickness** — 0.254 mm balsa (a real part a real corpus file
   specifies) shows "0.3", **+18.11%**, and below 0.05 mm the box reads "0.0" and a bare focus+blur
   commits "0", which `fromSpan` maps to `undefined` — **the edit is silently deleted**. Second:
   **body diameter** on a BT-5, 0.01346 m shows "13" → 0.013 m, −3.42% on d and −6.7% on reference
   area. **Reproduce each before fixing** — the census is a subagent's reading, not a measurement.
2. **`fromSpan` maps 0 → `undefined`,** so an explicit zero fin sweep (a straight leading edge) can
   never be committed: typing 0 silently reverts to the design's own sweep.
3. **The boattail exit placeholder quotes a rounded bound:** a 0.0635 m body advertises `< 64` when
   63.5 mm is the true ceiling, so 64 mm reads as allowed and is wider than the body. `Num`'s refusal
   message then prints "flying < 64", which is not a value.
4. **`Payload pos` placeholder does not track the edited rocket** — 3.1 in of CG and 2.07 cal of
   static margin between what the field advertises and where a blank payload actually lands. Carried
   from the previous session, not re-measured.
5. **The Flight card's stat tiles put the two things you most need to read at the two smallest sizes**
   — every label 11 px, the unit 12 px against a 20–24 px value, on the surface the whole pad check
   happens on. 630 m of drift is a different walk from 630 ft.
6. **Fin flutter still cries wolf** (60 of 113 corpus flights), blocked on a citable shear modulus.

`BACKLOG.md` carries the fan-out's ranked queue with measurements — read it before choosing.

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
