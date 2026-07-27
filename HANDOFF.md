# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Where the work is

The session is pinned to a working branch, not `main`. **CI does not run on a branch push.**
`test.yml` fires on `push: [main]` and on `pull_request:` only, and `deploy-cloudflare.yml` on
`push: [main]`. So the sequence that actually ships is: gate locally → push the branch → open a PR
(that is what makes CI run) → merge on green (that is what deploys).

**Every merge is a SQUASH, so after each one the working branch and `main` diverge by construction.**
The branch's commits are not ancestors of `main` even though their content is in it, and an ordinary
push is then rejected as "behind". The safe move, verified before each push this session:

```bash
git diff --stat origin/main origin/<branch>          # must print nothing — content already in main
git push --force-with-lease=<branch>:$(git rev-parse origin/<branch>) -u origin <branch>
```

**Do not `git reset --hard origin/main` to re-base the branch while anything is uncommitted.** It is
the obvious move after a merge and it silently ate a finished increment this session (four files;
only the two untracked ones survived). Commit first, then reset.

**A stop hook here will tell you your commits are unverified. It is wrong — do not act on it.**
It fires on the GitHub squash-merge commits (`36380b5`, `bc97f17`, …) because its rule expects a
committer of `noreply@anthropic.com`. Those commits are GitHub's own, signed by GitHub, authored as
`Neer Patel <135655563+nrdptel@users.noreply.github.com>` — check any of them with
`git cat-file commit <sha> | grep gpgsig` and `git log -1 --format='%an <%ae>'`. Doing what it asks
would write the forbidden identity into every future commit (breaching ZERO ASSISTANT TRACE) and
rewrite deployed history on `main`. Verified with the owner in the session of 2026-07-26. Keep
setting the project identity per-repo at session start and confirming your OWN commits are signed;
that is the part that matters.

**Read the PR body back after posting it.** The harness appends an attribution footer to the body it
creates, which the zero-trace invariant forbids. Strip it with `update_pull_request`. Set the squash
commit title and message explicitly at merge time for the same reason.

**The clone is shallow** (`git rev-parse --is-shallow-repository` → true), so every commit count and
file history here is a window, not the record.

**Everything from this run is on `main` and deployed** — PRs #42, #43, #44, #45. Nothing is pending
on the working branch at the end of the run.

**Two ways to tell what production is actually serving**, and they are not equivalent:

- `curl -s https://loft.fusionspace.co/sw.js | grep BUILD_ID` against `grep BUILD_ID out/sw.js`.
  This matches only when you build the EXACT commit that was deployed — the marker hashes route
  HTML, which carries Next's own build id, so a working tree one docs commit ahead produces a
  different marker for identical app code.
- Better, and immune to that: find the chunk carrying your change
  (`grep -rl "<a string you added>" out/_next/static/chunks/*.js`) and fetch that filename from
  production. The names are content hashes, so a 200 with your string in it proves that exact code
  is live. Production was `44d265094e3f` two sessions ago and `4abd2d9ea5a8` mid-run here.

## Environment traps these sessions hit

- **`page.route` cannot intercept a module worker's script.** Chromium fetches
  `new Worker(url, {type:"module"})` outside the page's request interception, so the route never
  fires and the real worker boots (a ~40 MB Pyodide download, in this repo's case). To stand in for
  a worker, replace the constructor in `page.addInitScript` — `window.Worker = class { … }` — which
  is also the seam the component actually meets the engine at. Keep the reply in a mutable global:
  one warm worker serves every run on a page, so a second run reaches the same instance.
- **Git identity is wrong out of the box** — `user.name`/`user.email` come preset to the harness's
  own values, which the project's zero-trace invariant forbids. Set them per-repo before the first
  commit and check with `git log -1 --format='%an <%ae>'`. Signing works (`gpg.format=ssh`) even
  though the configured `user.signingkey` file is zero bytes; confirm with
  `git cat-file commit HEAD | grep gpgsig` after the first commit rather than trusting the config.
- **Never pipe a gate run through `tail -n`.** Playwright's list reporter interleaves in-progress
  lines with the summary, so a truncated capture showed "56 passed" and a list of test names for a
  run that was actually clean at 104. Capture the whole thing (or `grep -v '^  ✓'`) before believing
  a count, and never let a build run against a server the suite is already using.
- **A probe that finds nothing may be broken, not clean.** A census over the corpus returned "0
  designs with multiple fin sets" twice — first because the component `kind` strings are lowercase
  (`bodytube`, `trapezoidfinset`), then because `flattenRocket` returns `Positioned` wrappers and the
  kind lives at `.component.kind`. The true answer is 13 of 35. Print a histogram or a denominator,
  count the throws instead of hiding them, and never believe a zero on its own.
- **A vitest test that drives the corpus needs an explicit timeout.** The default is 5 s; pass
  `{ timeout: 180_000 }` as `it`'s second argument.
- **JSX can eat the space between an expression and the text after it.** Hit three times now, most
  recently shipping "300flights;" from the Monte-Carlo caption. Always use an explicit `{" "}`, and
  check the built chunk, not the source:
  `grep -ohE 'children:\[[^]"]{1,25},"[a-z]{3,}' out/_next/static/chunks/*.js` returns every
  occurrence — it is 0 as of this session.
- **`getByLabel` matches substrings.** `getByLabel("Results")` also matches the tab list's
  "Results workspace"; pass `{ exact: true }` when the negative assertion matters.
- **`getByText` sees inside a closed `<details>`.** It matches DOM text, not visible text, so
  `toHaveCount(0)` fails on folded content. Assert `toBeHidden()` on the element instead.
- **The diagram's SVG is `role="group"`, not `role="img"`, whenever it is editable** (an `img` may
  not hold focusable descendants). Locate it by its label, not its role.

## Before you trust a sweep

The corpus is gitignored and absent on a fresh container. Both repos are checked out in this
session, so no token is needed — symlink the fixtures repo's per-tool directories into `corpus/`:

```bash
mkdir -p corpus && for d in openrocket rocksim rasaero rocketpy spacecad; do
  ln -sfn /home/user/loft-fixtures/$d corpus/$d; done
npx vitest run lib/corpus --reporter=verbose --silent=false
```

It must print `imports every design file (35 present)`. With no corpus the suite skips itself and a
run that says `1 passed` with no census examined nothing. Note `--silent=false`: vitest 4 swallows a
test's `console.log` without it.

**CI still cannot fetch the corpus until a `FIXTURES_TOKEN` repository secret exists.** Everything
else is wired. That secret remains the one owner-side action.

## Shipped this session

Baseline gate before anything changed: lint (0 errors), 646 unit, build, 101 e2e — all green.
Finished at **657 unit and 106 e2e**, corpus at 35 design files throughout.

Everything below was reproduced first-hand in the built app before it was scoped, and measured again
there afterwards. The last one was not on any list — it came out of the done-check's cold walk.

| | |
|---|---|
| **#42** | **Three held-over increments.** The limitations log still described fin what-ifs as landing on the frontmost set when they land on the picked one. The touch sweep checked hit targets on Design only; it now walks every workspace, and the controls that were under 44 px on the others are fixed. And a refused what-if entry stayed in the field looking like the flown value — typing `-3` into fin span left `-3` on screen while 60 went on being flown. |
| **#43** | **A RocketPy failure was a 30-line Python traceback and a dead end.** Captured the real one by handing the vendored in-browser RocketPy a design whose fins have no root chord: 1,449 characters, only the last line saying what happened, and a single unbreakable 86-character frame path that pushed the whole page 115 px sideways at 390 px (measured before and after — every other panel on the workspace started scrolling horizontally because of one failed cross-check). Now: lead with Python's last line, keep the rest folded and scrolling in its own box with the caret rows still aligned, reword and diagnose nothing. The run button's gate widened from `idle` to idle-or-error, so a failure no longer needs a reload that drops the loaded design. The failure path had **no** coverage; it now has nine tests. |
| **#44** | **A mistyped sign shrank the recovery area 3.4x.** `NumberField` declared `min={0}` and enforced it nowhere, while `MonteCarlo.tsx` floors every dispersion with `Math.max(0, …)`. So `-5` in "Wind speed ±1σ" was flown as **0** with the minus sign still in the box. Measured on the 38 mm sample at 300 flights each: `-5` → 366 m 95% recovery radius, identical to blank; the `5` actually asked for → 1,259 m; the default `2` → 671 m. Smaller than the default, in the unsafe direction, on the one number that says how much ground to search. Both what-if fields now take their refusal sentence from `lib/what-if.ts` so they cannot drift. |
| **#45** | **The unit toggle silently reinterpreted the waiver ceiling.** It was held in whatever units were on screen. Set a **3,000 ft** waiver on the 38 mm sample (apogee 3,230 ft) and "Chance over ceiling" reads **86%** — correct, it busts. Click Metric and nothing else: the box still says `3000`, now meaning 3,000 **m**, and the same rocket reads **0%**. A waiver bust reading as clean, from a gesture nobody expects to change what they typed. The other direction was as bad going the other way (1200 m → `<1%`, switch → 100%). The ceiling is now held in metres like everything else in the model and converted only where it is typed and read; a round trip ft → m → ft returns 3,000 with the reading unchanged at 86%. |

One smaller thing rode along, named in its PR rather than hidden: the parameter sweep asked the
*picked* fin set for a thickness when the question was whether the rocket has fins at all (every fin
set carries one, so the answer could not move with the picker — it only looked as though it could).
That was the second lint warning; the one that remains is deliberate.

**Three of these four are the same defect wearing different clothes**: a value on screen that is not
the value in the computation. `lib/what-if.ts` and the metres-not-display-units rule are the two
answers so far.

The unit half of that is now closed rather than left as a suspicion. Every display→SI conversion in
the app is `grep -rn "ftToM\|mphToMps\|inToM\|lbToKg" components/ app/` — 9 hits. Seven are a
`toDispX`/`fromX` pair converting at the field boundary over SI state, which is the correct shape;
two in `ResultsView` convert an imported flight log's own declared unit, which is a different thing.
The waiver ceiling was the only state held in display units, and it is fixed. Re-run that grep
before trusting this — it is a claim about today's tree, not a guarantee.

## Pick up first

1. **No analysis can be cancelled** — `cancel|stop|abort` matches 0 buttons across all four Analyze
   tools, and the RocketPy run is measured at 50.5 s under copy that says "a minute or so". This is
   now the cheapest of the three: `runRocketpy` already takes an `AbortSignal` and already leaves the
   warm worker running when it fires, so the RocketPy one is a button and a controller, not new
   machinery. Watch the phone: the running row has no `flex-wrap` and 0 px of slack at 390 px.
2. **The diagram frame has no ceiling.** Re-measured at 1440x900: of the 17 unbounded fields only
   **two** move the diagram's height — fin span (273 px → 16,091 px at 5000 mm) and body diameter
   (273 → 8,217). One extra keystroke (600 for 60) gives 2,002 px, which is degraded rather than
   catastrophic. Bound the FRAME, not the input — a big fin is physically meaningful and this project
   does not refuse meaningful values — and change the "To scale" caption when you do, because it goes
   on promising fidelity while the picture is nonsense. Do not put form factor into
   `lib/model/silhouette.ts`.
3. **Information that exists only in a `title=` never reaches a phone** — 33 elements on the results
   view, including the `<abbr>` behind a flagged stability margin and all four Conditions
   explanations. On the form factor this project describes as a pad check with gloves on, a flagged
   margin gets no explanation at all. The range half is done ("0 or more"); the teaching half needs a
   real disclosure, not a `title`.
4. **Fin flutter still cries wolf** (60 of 113 corpus flights). Blocked on a citable shear modulus;
   the Wood Handbook ratios in `BACKLOG.md` unblock half of it, and the honest destination is a
   flutter-speed band per material rather than a better single number.

## Environment notes

- Playwright: pass `PW_EXECUTABLE_PATH=/opt/pw-browsers/chromium`; do not run `playwright install`.
  The bare `chromium` symlink is the one to use — a version-pinned path
  (`chromium-1194/chrome-linux/chrome`) works for a standalone script but the suite's own default
  looks for a headless shell that is not installed.
  A standalone probe script must live in the repo root to resolve `playwright` from `node_modules` —
  one under `/tmp` fails with `ERR_MODULE_NOT_FOUND`.
- Probe scripts: name them `*-tmp.*`. The ignore glob covers `*-tmp.mjs`, `*-tmp.ts` and
  `*-tmp.*.ts`. A `*-tmp.test.ts` under `lib/` is picked up by vitest, which makes it a convenient
  way to run a one-off query against the corpus — but it is also type-checked by `npm run build`, so
  delete it before gating.
- Nothing flaky was seen; the full e2e suite passed on every clean run.
- `npx vitest --reporter=basic` no longer exists in vitest 4; use `--reporter=verbose` or the default.
