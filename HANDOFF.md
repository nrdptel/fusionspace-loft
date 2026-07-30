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

**The run's goal was `ROADMAP.md`'s next milestone, and it shipped: R1 — address components by identity,
not by role.** It is marked SHIPPED there with the checks that pin it named, and the gap it left is
written up as R2's starting point rather than as a reason to re-open it.

Baseline before anything changed, all four green: lint 0 errors / **1 warning** (the standing `setDraft`
one), **715 unit**, build, **147 e2e**, corpus **35 design files, 3/3**. One e2e failed in the opening
full run — `picking a fin set aims the fin fields at it` — with `Target page, context or browser has been
closed` and no failed assertion, exactly the box-not-code signature this file already describes; it passed
alone on the re-run. At the end: **748 unit, 150 e2e**, corpus 35 throughout.

**Four commits on the working branch.** Each was gated in full and pushed on its own.

| | |
|---|---|
| body tubes | `Body length`/`Body diameter` resolved "the" tube as the LONGEST, so every other tube was unreachable — **23 of the 35 corpus designs** carry more than one as Loft imports them. `bodyTubeId` now aims them, and the panel names the tube by the design's own name or, where a file calls every tube "body", by its station. |
| canopies | The recovery fields resolved "the" parachute as the LARGEST, so the drogue was unreachable on every dual-deploy design — **17 of 35**. `parachuteId` aims them. On the bundled 54 mm sample, doubling the drogue moves the under-drogue descent off 16 m/s; aimed at the main it does not move at all. |
| one registry | `AIM_SLOTS` maps each aim to the component kinds that move it and the value fields whose target it decides. `aimEditsAt`, `INERT_EDIT_FIELDS` and the design key are all derived from it, replacing three hand-maintained lists that the third role would have had to be added to correctly. |
| the review's Sev-1s | Three defects the pre-push review found in the first two commits, all reproduced before being fixed. See below — the first one is the one worth reading. |

**The pre-push review found a Sev-1 that the comment in the same diff denied.** `addBoattail` and
`addPayloadMass` anchored on the LONGEST body tube, which stood in for "the aft of the airframe" only
while nothing could change which tube was longest — and aiming `bodyLength` broke exactly that. Measured
on `01.One-stage.ork` (a 254 mm payload tube ahead of a 610 mm body tube): pick the forward tube, take it
to 700 mm, add a tail cone, and it lands at station **889 mm**, contracting 54 mm to 40 mm and
re-expanding through the transition behind it, instead of at 1,121 mm on the tail. The solver flies that.
The payload bay jumped tube in the same edit, 816 → 539 mm, while its own station field went on
advertising 816. A boattail anchors to `aftmostBodyTube` (by station, not length) now; the payload follows
the pick, and `defaultPayloadStation` takes the same pick so a blank and what a blank does agree.

Two more from the same review: the pick-sync ref was seeded with the aims present at mount, so a restored
session came back holding a part nothing on screen identified (a regression against the behaviour before
any of this); and "Reset to as-designed" moves every aim in one commit while only the first moved slot was
examined, leaving a highlight with no aim behind it and a row that took two clicks to aim at again.

**A number in three committed places was wrong, and the review caught it.** "20 of the 27 real OpenRocket
designs carry more than one body tube" is the raw `<bodytube>` TAG count. What Loft imports is **17 of
27**, because three of those designs keep tubes inside pod or parallel-stage assemblies the importer
declines to fly — and a part that is not imported is not a part a flyer can pick. Across all 35 importable
files the figure is **23**. Corrected in the code comments, the e2e comment and `/docs/limitations`; the
commit messages that quote 20 stand as written, which is why this note exists.

## What this session learned that is worth keeping

**Take the second opinion, and give each agent a DIFFERENT lens.** Three lenses (edit-model correctness,
surface consistency, does-a-flyer-get-a-wrong-number) converged on the same top finding by three different
routes, and the one that found the boattail defect found it by reading the comment I had written beside it
and checking whether the code still did what it said. The redundant version of that fan-out would have
found one of the three.

**A negative control whose BUILD exits 1 establishes nothing — and the obvious control is the one that
does.** Reverting the boattail anchor at the call site left `aftmostBodyTube` unused, `noUnusedLocals`
failed the build, and `out/` never changed. Redone by reverting the rule INSIDE the helper so everything
stayed referenced. This file already warned about it and it still caught me once; check the exit code, do
not reason about whether this particular revert could leave something unused.

**A pin that reads `corpus/` is not a pin.** The corpus is gitignored and absent on every fork and public
clone, so a `readFileSync` under `corpus/` is a hard ENOENT there — a red CI for people who have done
nothing wrong — while `lib/corpus/sweep.test.ts` skips itself instead. A milestone's proof has to run on
`fixtures/` or `e2e/fixtures/`. `fixtures/demo-quirks.ork` turned out to reproduce the exact shape needed
(a 450 mm aft tube behind a 500 mm forward one, so "longest" points at the wrong end), which is worth
knowing before reaching for a corpus design.

**Measure the model, not the file.** `demo-quirks.ork` declares three body tubes and imports as two — the
third is inside a pod assembly. Every count I took from raw XML was wrong in the same direction, including
the one that reached three committed files. Count what `flattenRocket` returns.

**A whole-map dependency is a trap when the map carries values.** Passing the edit bag down as "the aims"
would have let a typed span read as an aim, with a number where a component id belongs. `aimsOf` projects
through the registry so only aims can move. The same shape one level up: a per-slot comparison is needed
because more than one aim moves in a single commit, and examining the first moved slot silently drops the
rest.

**Reach is measured after import, and it decides scope.** R1's notes asked for nose cones. Zero corpus
designs have more than one after import, so a `noseId` would have been a mechanism addressing nothing;
canopies, which the notes did not mention, were the widest-reaching case at 17 of 35 and the only one that
moves a safety number. The list in the roadmap is a starting point for a measurement, not the measurement.

## Pick up first

**Start at `ROADMAP.md`.** R1 is SHIPPED; **the next unstarted milestone is R2 — delete a component, and
undo it**, and R2's notes now name its first task explicitly.

**R2's first increment is not a delete — it is id stability.** A from-scratch design's component ids are
re-minted on every reload (`lib/ork/export.ts` writes `nextUuid()` rather than `c.id`, and a built
design's session bytes are an export), so an aim saved before a reload resolves to nothing. An operation
list keyed on ids that change underneath it is not a foundation. The probe and the measured id sequence
are in `BACKLOG.md`'s newest entry. Everything else R2 needs from the pick surface exists: `AIM_SLOTS`,
`aimEditsAt`, `aimsOf` and `AimedPart` in `lib/model/edit.ts`, and a parts list and diagram that both
report a pick through one funnel.

**Do not re-open R1.** Its gap is written up in `ROADMAP.md` under the milestone: pods are an ingestion
feature and want their own entry; nose cones are measured at 0 designs and deliberately unaimed;
transitions and mass objects arrive with the field that edits them.

`BACKLOG.md` is a defect ledger to file into and to screen for Sev-1s. **Its Sev-1 count is zero at the
end of this run** — the three the review raised were fixed and pinned within the run. Its six newest
entries are this session's, each with the measurement that makes it actionable, and the entry about a live
edit following a same-kind pick is deliberately marked as something R2 removes rather than something to
patch.

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
