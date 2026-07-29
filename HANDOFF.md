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
**128 e2e**, corpus **35 design files, 3/3**. At the time of writing: **714 unit, 145 e2e**, corpus 35
throughout.

**Two pull requests merged and confirmed serving; a third open on green CI.** Production was verified
by fetching the content-hashed chunks from `loft.fusionspace.co` and grepping them for strings the
change introduced — `holds its launch setup and no results`, `RocketPy cross-check under Analyze`,
`isn't a value this can fly` and the new `more than ` bound wording are all live.

**PR #59, squash `37cbd8f`.** Three defects a flyer meets on the way in.

| | |
|---|---|
| rail | A rail length of 0 was flown. `onRail` is `along < rodLength`, so a 0 m rail is left at t=0 before the motor builds thrust, and the Flight card printed **Rail-exit velocity 0 m/s** with no warning — the number an RSO reads to decide the rocket leaves the rail flying. 2.0 m → 28 m/s, 3 m → 35 m/s, 0 → 0 m/s. |
| zero | `fromSpan`/`fromMass` mapped every entered 0 to `undefined`, the spelling of "no edit". `lib/model/edit.ts` had already written down which fields take one — every geometry edit is `> 0` except `finSweepLength`, which is `>= 0` — so the one shape the model was written to accept was the one the editor could not build. `Num` gains `positive`; call sites split three ways with the model as the authority. |
| absence | 27 of 27 real corpus `.ork` carry stored results; **0 of the 3 shipped samples do**, so the cross-check the import screen promises is missing on every default first run and present on every real file. `noStoredResultsReason` says what the file carries and names the RocketPy cross-check. No stored figures were invented. |

**PR #60, squash `96145b0`.** Two defects in one sentinel, the second exposed by fixing the first.
A motor whose trigger can never arrive carries `ignitionTime = Infinity`; `burnoutTime` folded it into
a maximum, so the FLIGHT's burnout became `Infinity` — burnout velocity 0, optimum delay floored to
0 s, burnout mass read past every detach time. Reading it at a finite time then exposed a stage whose
airframe was shed while its motor's point mass rode the sustainer down. On `03.Three-stage.ork`:
burnout mass 1.973 → 3.254 → **2.403 kg**, landing energy 40 → 65 → **37 J**, apogee 1,452 →
**1,482 m**. Corpus medians improved (deployment velocity 6.5 → **5.9%**, n=76; max acceleration
3.3 → **3.2%**, n=94) and `/docs/validation` plus the suite's `PUBLISHED_MEDIAN_PCT` were updated to
match.

**PR #61, open.** The summary strip's Length and the Mass & balance panel both read the design off the
FILE while everything beside them came from the edited run: doubling a 700 mm body left Length at
950 mm beside a CP of 1,422 mm, and the two Design-tab panels disagreed about dry mass (0.6 vs
0.893 kg) while one caption points at the other by name.

It also carries what the Analyze panels SAY about the conditions they flew. A single
`conditionsEdited` boolean was wrong in both directions: the two ballistic sweeps credited the flyer
for a surface-wind edit that moved not one row — the motor sweep claimed "the launch conditions you
set" two sentences before its own caption says "Surface wind is not read at all" — and a fetched
forecast counted as the flyer's own setup even though `onWeather` clears the edits it overrides and
greys the fields. A design that states no launch setup was captioned as having stored one, on a page
already saying in amber that those are Loft's defaults. Now a `ConditionsSource` record and
`conditionsPhrase(src, { wind })`, so each panel is asked only about what it reads; five phrasings
confirmed in the rendered DOM. Plus four missing word gaps found by scanning the built chunks
("25flights across the range", "the OpenRocketcomparison is hidden", "Delayis the ejection delay",
"the stored OpenRocketresults describe") — see the JSX whitespace note below.

## What this session learned that is worth keeping

**The second opinion earned its keep on every single diff, and twice it found that MY OWN COMMENT was
the defect.** On the zero work it found a refused zero throwing away the edit it was typed over, a
refusal outliving the flight it described with no way to clear it, and a payload station counting as
an edit. On the burnout work, two independent lenses said the same thing: the doc comment I wrote
asserted as correct the very defect underneath it, and the test I wrote pinned the wrong descent mass
with a comment explaining why it was right. Neither would have been caught by the gate — every test
passed before and after.

**Drive the corpus before believing a verified finding's SEVERITY.** Adversarial verification
establishes that the code is wrong; it does not establish that anyone can reach it. Two rank-2
findings this session were real in the code and unreachable in practice: the RASAero pressure guard
(the only file with an impossible pressure shows no flight at all, because its motors do not resolve)
and the booster-descent phase index (the only designs whose phase table collapses are flagged
ballistic before the index is used). The manual's "a speculative guard that fires on zero real files
is worse than nothing" applies to a verified finding just as much as to a hunch.

**A negative control that does not compile is not a negative control — and the obvious control is
often the one that doesn't.** Reverting a value INSIDE a component leaves its prop unread,
`noUnusedLocals` fails the build, `out/` never changes, and the test passes against still-fixed code.
Revert at the CALL SITE instead. This bit once this session, exactly as the previous session recorded
it would.

**A JSX text run that spans a line break loses its LEADING space, and the gate cannot see it.** Not
just the obvious `{expr}` + newline + text case — a plain space that sits MID-LINE in the source is
also eaten as soon as the run wraps, so `, {STEPS} flights across` / newline / `the range;` shipped
as "25flights across the range". Four instances were live in the built export when this was found.
Lint, unit, build and e2e were all green on every one of them; the source reads correctly and only
the transform output is wrong. Write `{" "}` at the end of the line instead of trusting the space.

To find them, scan the BUILT chunks, not the source — the bug does not exist until after the
transform. The signature is a rendered value followed immediately by a string literal that opens with
a whole lowercase word: `,"([a-z]{2,}(?: [a-z]{2,}){1,4})` where the char before the comma is not a
closing quote. That returned exactly four true positives and no false ones across the whole app.
Broadening it to any capitalised word adds only CSS font stacks. Re-run it after any caption edit.

**A probe with no control measures nothing.** The first whole-corpus census shared one browser context
across 39 files and produced 39 identical rows, because the app restores the last design from storage
on reload. The version that produced the shipped measurement opens a fresh context per file and prints
each design's own name beside its numbers.

## Pick up first

`BACKLOG.md` carries the full ranked queue with measurements — the opening fan-out filed **53
findings** across five lenses, 20 went to adversarial verification and **19 survived**. Read it before
choosing, and reproduce before scoping: two of the verified ones turned out to be unreachable when
driven against real files, and that is recorded there.

The best next moves, in order:

1. **The Monte-Carlo flies the FILE's launch setup, not the flyer's.** `MonteCarlo.tsx:153` uses
   `overridesFromStored(sim)` only, so Conditions edits and the "Today" scenario never reach the
   dispersion study while the Flight card's drift does use them — and the panel does not even reset,
   because `designKey` carries no condition field. `app/docs/faq:244` then says "You set the
   one-sigma spread on each input, so the answer reflects your own conditions", which turns an
   undisclosed defect into a denied one. Recovery radius and the waiver-bust probability are the two
   numbers a flyer plans a field around. Both sibling Analyze panels already state which conditions
   they used.
2. **A motor swap survives a configuration change it cannot apply to.** `LoftApp.tsx:586` never
   reconciles `edits.motorSwap`. On `Punisher Apprentice.ork` (9 configs across 24/29/38 mm casings):
   swap on the 38 mm run, select the 24 mm run — the picker blanks while every number on the pad-check
   surface is still the 38 mm motor's.
3. **`<overridecd>` and the fin-tab tags are read by nothing.** `Base drag hack (short-wide).ork`
   states `<overridecd>0.0` on a tail flare and its own comment says the technique IS that checkbox;
   Loft bills the cone for drag the file says is zero. `<tabheight>`/`<tablength>` cost **101 g** on
   `Airstart timing.ork` and **120 g** on `03.Three-stage.ork`, undisclosed anywhere.
4. **`meanFinChord` is the LAST fin set walked while `finThickness` is the MAX** (`aero.ts:451`), so
   the thickness ratio belongs to no fin and changes if the sets are reordered — 8x out on
   `Simulation scripting.ork`, feeding both the fin friction form factor and the wave-drag term.
5. **The motor sweep flags two launch-safety rules and stays silent on the third**, and both flags it
   does raise are colour + a `title` on a non-focusable `<td>` — no hover on a phone, nothing for a
   screen reader.
6. **`downloadOrk` drops `ballastKg`** while baking payload mass and station in, so the exported file
   is missing the very thing nose ballast exists to fix.

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
