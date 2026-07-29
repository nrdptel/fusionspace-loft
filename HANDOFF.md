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
name and address, which the zero-trace invariant forbids. Confirmed again this session: it came up as
`Claude <noreply@anthropic.com>`. Set `user.name`/`user.email` per-repo in BOTH checkouts to
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

**CI still cannot fetch the corpus until a `FIXTURES_TOKEN` repository secret exists.** That secret
remains the one owner-side action. A test that needs a design file must drive a COMMITTED fixture
(`e2e/fixtures/`, `fixtures/`, `public/samples/`).

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

**A standalone Playwright probe must live in the repo ROOT** to resolve `playwright` from
`node_modules`. One written to the scratchpad fails with `ERR_MODULE_NOT_FOUND`.

**A probe that finds nothing may be broken. Print a denominator and a control that must be
non-zero.** Every probe this session opened with a control line naming the design's own value and a
non-zero change from a known-good entry, before measuring the case under test.

**The second opinion earns its keep — take it EVERY time.** It has found a real hole in the diff that
produced it more than once, including a false sentence in a doc comment written in that same diff.

## Shipped this session

Baseline before anything changed, all four green: lint 0 errors / **1 warning**, **695 unit**, build,
**128 e2e**, corpus **35 design files, 3/3**.

**Increment 1 — a rail of no length, and a zero that no field would take.** Two defects behind one
mechanism, both reproduced first-hand in the built export before scoping:

| | |
|---|---|
| rail | `Rail length` advertised its floor as "0 or more" and meant it. `onRail` is `along < rodLength`, so a 0 m rail is left at t=0 before the motor builds thrust, and the Flight card printed **Rail-exit velocity 0 m/s** with no warning — the number an RSO reads to decide the rocket leaves the rail flying. On the 54 mm dual-deploy sample: 2.0 m → 28 m/s, 3 m → 35 m/s, 0 → 0 m/s. |
| zero | `fromSpan`/`fromMass` mapped every entered 0 to `undefined`, the spelling of "no edit", so a zero was indistinguishable from a cleared box. `lib/model/edit.ts` had already written down which fields take one — every geometry edit is `> 0` **except `finSweepLength`, which is `>= 0`** because a sweep of zero is a straight leading edge. The one shape the model was written to accept was the one the editor could not build: typing 0 left the box reading "0" while the design's own 90 mm went on flying, apogee unchanged at 2,941 m where 0.5 mm moves it to 2,359 m. |

The mechanism is a `positive` prop on `Num` plus a three-way split at the call sites, with
`lib/model/edit.ts` as the authority for which field is which — see the comment above `orNone` in
`LoftApp.tsx`. `rangeWords` grew an exclusive-lower-bound form so the field's own words changed with
its behaviour ("more than 0, up to 20", not "0 to 20").

Gate after: lint 0 errors / 1 warning, **696 unit**, build, **130 e2e**, corpus 35, 3/3.

**One existing test regressed and the reason is worth keeping.** "a refused what-if says so, and the
field shows what is actually flown" passed before only *because* zero was swallowed: typing `-3`
clamps to `0` at commit, and `onChange("0")` used to arrive as `undefined`. With the converter honest
and `positive` refusing before the clamp, the negative value that live typing had already pushed at
the model stayed in the edit bag and the box redisplayed it. **Refusing an entry has to blank the
field's contribution on the way out**, because typing pushes every keystroke at the model and the
model silently declines what it cannot use.

## Pick up first

The opening fan-out (five lenses, adversarial verification) filed these. Every one names a corpus
file — **reproduce before scoping**, several are one grep away:

1. **`burnoutTime` returns `Infinity` when any motor's ignition trigger resolves to "none"**
   (`setup.ts:212` mints `ignitionTime = Infinity`), so burnout is never detected: `optimumDelay =
   max(0, apogeeTime - Infinity)` = **0.0 s**, and `burnoutMass = massAt(Infinity)` drops every
   casing. Optimum delay is what a flyer drills a delay grain to. Repro:
   `03.Three-stage.ork` (bottom stage's J315R has `<ignitionevent>burnout</ignitionevent>` with
   nothing below it).
2. **A RASAero `<Pressure>` is taken on a bare `> 0` guard** (`lib/rasaero/adapt.ts:371`).
   `Show-off.CDX1` states `<Pressure>2</Pressure>` → 6,773 Pa → ~0.08 kg/m³ against ~1.17: a 14.7×
   thin atmosphere flown as an ordinary flight, with no Conditions field exposing temperature or
   pressure so the flyer can neither see it nor correct it.
3. **An altitude-triggered recovery device with no stated altitude falls back to `?? 0`**
   (`simulate.ts:700`), so it "deploys" at the ground and sets `anyRecoveryOpened` — which gates the
   ballistic-descent warning the code's own comment calls "the most serious thing Loft can flag".
   Both importers can mint this shape.
4. **Winds-aloft direction is interpolated without a 0/360 wrap** (`lib/weather.ts:131`), so a wind
   veering through north between two levels is interpolated the long way and the drift bearing lands
   on the wrong side of the compass — in the 1000/975/950/925 hPa band where recovery drift lives.
5. **`.ork` archives carry `thrustcurves/*.rse` and the zip reader discards them**
   (`lib/ork/zip.ts:92`), so a design is refused a flight for want of a curve the file is carrying:
   `EscapeVelocity.ork`'s H225-14A and both simulations of `Show-off.CDX1` resolve to nothing.
6. **`<overridecd>` / `<overridesubcomponentscd>` are read by nothing**, so `Base drag hack
   (short-wide).ork` — whose own `<comment>` says the technique IS those checkboxes — is billed for
   drag the file states is zero. `<tabheight>`/`<tablength>` are not read either: 101 g of
   through-the-wall fin tab missing from the aft end of `Airstart timing.ork`.
7. **`meanFinChord` is assigned per fin set (ending as the LAST set) while `finThickness` is the MAX
   across sets** (`aero.ts:451`), so `finThicknessRatio` belongs to no fin and changes if the design's
   sets are reordered. Same defect pairs `finSweepLength` (last) with `finSpan` (max) at `aero.ts:505`.

`BACKLOG.md` carries the rest with measurements, newest first — including the stored-comparison gap
on the bundled samples (27 of 27 corpus `.ork` carry `<flightdata>`; **0 of the 3 shipped samples
do**), which is the highest-leverage craft item and needs no invented numbers, only a sentence on
screen saying why the panel is absent.

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
