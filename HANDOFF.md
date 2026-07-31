# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Read this first

**`BACKLOG.md`'s Sev-1 count was NOT zero at the start of this run, and the previous handoff said it
was.** The shelf's "×" permanently deleted a design's only stored bytes — no confirmation, no undo,
surviving a reload — which is the manual's second Sev-1 criterion verbatim, and the ledger entry
itself already called it "the sharpest remaining one-way door". It was counted as a defect rather
than as a preemption. **Fixed this run.** The lesson for the next one: run the Sev-1 screen against
the LEDGER, not against the previous handoff's summary of it.

**And this handoff does not claim zero either — the count is ONE.** It is written out under *Pick up
first*: an authored booster whose motor mount is then deleted flies as 35.7%-below-pristine dead
ballast with zero separation events and nothing on any surface saying so. Do not restate it as zero.

**Six Sev-1s were found this run and five fixed. Four of the six were in code THIS RUN WROTE, and two
of those were in the fix for the other two** — found only because the R5 commit was reviewed a second
time, on its own fixes, after it had been pushed. The pattern is worth more than any one of them:
every round of review on this milestone found something the round before it had introduced, and the
rounds did not converge until the third. **Review the fix, not just the commit.**

**The queue has two tracks and a run ships from both.** `ROADMAP.md` is the queue; read it first.

| track | state at the end of 2026-07-31 (second session) |
|---|---|
| **R — capability** | **R4 SHIPPED.** **R5 — author a staged rocket — IN PROGRESS**, increment 1 of 4–6 shipped |
| **P — product & craft** | **P1 — one design system, adopted — IN PROGRESS**, increments 1–5 shipped |

**`DESIGN.md` and `COMPETITION.md` are binding and are read at session start.** `DESIGN.md` §9's
compliance block is executable as `lib/design-system.test.ts`, with every count an EXACT ratchet, so
an improvement and a regression both fail until the number moves in the same commit as the work.

**One thing is owed to the sibling repo and was NOT done, because this session could not reach it.**
`DESIGN.md` §9's explanatory note quotes `GeometryInspector` at 9:2 and `MonteCarlo` at 9:4; the tree
said 10:2 and 9:3 when it was written, and both are now 2:8 and 3:9. The file is shared verbatim with
Debrief and §10 says a change to one is a change to both in the same run — this session was scoped to
this repo and the fixtures repo, so correcting it here alone would have created exactly the
divergence the invariant forbids. **The correction is two numbers in §9's paragraph beginning "The
suite-wide ratio was removed on 2026-07-31", and it must land in BOTH copies together.** The rule
itself is right and is satisfied; only the historical figures are stale.

## The arc so far

| milestone | state |
|---|---|
| R1 — address components by identity | SHIPPED 2026-07-30 |
| R2 — delete a component, and undo it | SHIPPED 2026-07-30 |
| R3 — add a component | SHIPPED 2026-07-30 |
| R4 — reorder and restack | **SHIPPED 2026-07-31** — the operation, the button pair, and the drag |
| R5 — author a staged rocket | **IN PROGRESS** — increment 1 shipped 2026-07-31; the phase table is increment 2 |
| P1 — one design system, adopted | IN PROGRESS — increments 1–5 shipped 2026-07-31 |
| P2–P5 | NOT STARTED |

Three capability milestones shipped in two sessions and the editor went from a parametric tweaker over
a fixed tree to something that can grow one. The P-track exists because what did NOT move in that time
is what the app feels like. `ROADMAP.md` carries what each milestone delivered against its *done when*
and the gap that became the next one's starting point; read it first.

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

**Run `npx playwright install chromium` once, then use a bare `npx playwright test`. Do NOT set
`PW_EXECUTABLE_PATH`.** This reverses what this file said until 2026-07-31, and the reversal is
measured. `@playwright/test` here is **1.61.1**, which manages **chromium-1228**; the sandbox's
pre-installed `/opt/pw-browsers/chromium` is **1194**, thirty-four revisions off the build the suite
was written against. `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` is already exported in this
environment, so the install lands *beside* the stale one rather than in `~/.cache` — after it,
`ls /opt/pw-browsers` shows both `chromium-1194` and `chromium-1228`, and a bare `npx playwright test`
resolves 1228. The download is ~177 MB + ~114 MB, takes about a minute, and **succeeds through the
proxy**; the blanket "never run `playwright install` in a sandbox" advice assumes the right build is
already there, and here it is not. 169/169 green on 1228 this session. *This closes the `BACKLOG.md`
entry about the missing revision guard for practical purposes, though porting the sibling repo's
config-level guard is still worth doing.*

**`node_modules` is ABSENT on a fresh container — run `npm install` first** (~1 min). Nothing else in
this file works before that, including the `npx vite-node` probe recipe below.

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

**A class-string helper must live in `lib/ui-tokens.ts`, never in `components/ui.tsx`.** That file is
`"use client"`, the site header is a SERVER component, and a helper exported from the former and called
from the latter fails the build outright — *"Attempted to call buttonClass() from the server"*. Cost
one gate run this session. `lib/ui-tokens.ts`'s own header already carried the warning, from the time a
touch token lived in the client module and shipped a throwing stub into a served `class` attribute.
Components stay in `components/ui.tsx`; anything that is a STRING goes in the token module.

**`npm run build` must be re-run between a negative control and reading the e2e result.** The suite
runs against `out/`, so a control edited into a source file changes nothing until the build lands —
and a control that "passes" for that reason looks exactly like a test that cannot fail.

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

**An assertion placed after the state it tests has already been cleaned up cannot fail.** One
negative control came back green this session for that reason alone: the clear-on-load assertion in
the new shelf-undo e2e ran after every pending removal had already been restored, so it asserted
`toHaveCount(0)` against a list that was empty either way. The fix is to leave the state STANDING and
then take the action under test. When a control comes back green, suspect the control, then suspect
the assertion's position in the test — in that order.

**A comparison can be unfalsifiable because the emulator moves both sides.** `e2e/touch.spec.ts`'s
horizontal-overflow test compared `documentElement.scrollWidth` against `window.innerWidth`, and under
`isMobile` emulation Chromium widens the LAYOUT viewport to swallow an overflow: measured at 320 px,
`scrollWidth` 370 and `innerWidth` 370, assertion green, while `clientWidth` correctly read 320. It had
never been able to fail. Compare against `clientWidth`. And run a layout check at more than one width:
this suite is pinned to the iPhone 13's 390 px, and both a 360 px and a 320 px phone were overflowing.

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

**A sentence can lose a space at BUILD time and nowhere else, and the gate now catches it.** A JSX
text run that starts on the same line as a closing inline tag and continues onto the next loses its
leading space — Babel trims the first line of a multi-line run. The SOURCE reads correctly, so nothing
in lint, unit, build or e2e could see it, and 86 instances had accumulated on the served pages.
`scripts/check-text-gaps.mjs` runs in `postbuild` and exits 1 on any hit, so `npm run build` is now the
check. Two detectors: the served-markup one is reliable and gates; the client-chunk one is a lead to
verify by hand and deliberately does not gate, because it reads minified JavaScript where an ordinary
string concatenation looks the same. **Confirm any hit in the rendered TEXT before fixing it** — strip
React's text-node separator comment first, since a space emitted as its own node sits beside one.

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

## Shipped this session (2026-07-31, second session of the day)

Baseline before anything changed, all four green: lint 0 errors / **1 warning** (the standing
`setDraft` one), **870 unit**, build, **171 e2e**, corpus **35 design files, 6/6** with its counts
printed (536 removable parts, 180 authored, 230 mass stations, 206 reorders).

At the end, all four green: lint 0 errors / **1 warning** (the same standing `setDraft` one), **897
unit**, build, **177 e2e**, corpus **35 design files, 9/9** — 536 removable parts · 180 authored parts
· 230 mass-object stations · 484 drag drop-slots (30 in front of the next stage's first part) · 206
reorders · 33 authored boosters and 2 refusals, 30 flown, 29 reaching burnout and 29 of those
separating · 0 of 35 leading with a flat face.

**CI was RED on the head this run pushed, and the local gate was green at the same commit.** The
booster corpus sweep ran under vitest's 5 s default; it fits locally and does not on the runner. The
last commit gives it the same explicit `300_000` its neighbours take. The lesson is not about that
test: **a sweep that adds a second full flight per design needs an explicit budget, and a green local
gate does not prove the runner agrees.** Read the `frontend` job's result on the PR head before
calling a session done, not just the local exits.

| commit | what |
|---|---|
| `96937cb` | **P1 increment 4 — the decision-grade numbers come off caption size.** Nine of twenty-three component files had `text-xs` outnumbering `text-sm`; the suite-wide ratio passed by three and could not see it. `text-xs` across `components/` 91 → 56, `text-sm` 84 → 113, inverted files 9 → 0. |
| `37fc6ca` | **The pre-push review's findings, and a phone overflow the gate could not see.** Putting the header's controls on the type scale took that row 197 → 229 px, which overflowed a 360 px phone by 10 px; a 320 px phone had ALREADY been overflowing by 19 px. Both 0 now. The check that should have caught it could never fail — see the lesson above. |
| `e8467ef` | **Sev-1 — removing a design from the shelf is undoable.** Second attempt; the first was reverted and its six failure modes each shaped a part of this one. |
| `71e17e8` | **The hole that undo left in itself**, found by the pre-push review: `rememberRecent` keeps a design larger than the whole shelf budget when it is the only one, and `restoreRecent` had no matching exemption — so an over-budget design could be removed and never put back. Plus four more, each of which could have made the undo destructive or invisible. |
| `da949d7` | Corrected a scoping premise `ROADMAP.md` and this file both carried, and refreshed the handoff. |
| `c3cf389` | **R4 SHIPPED — drag a part along the airframe and drop it between two others.** `moveSlots`, a drop indicator, 484 drop slots driven across all 35 real designs. |
| `2a061e6` | **Sev-1 — a reordered airframe flying a flat face into the airstream now says so.** Nudging the nose one place aft left apogee, max velocity and rail exit every digit identical while the model flew a 66 mm flat disc. |
| `c2d5b63` | **P1 increment 5 — off-scale spacing to zero**, plus the three blind spots in the check that measures it, plus three `COMPETITION.md` rows and five corrections to them. |
| `4a69479` | **R5 increment 1 — a flyer can add a booster stage.** The first edit that writes to `rocket.configurations`; without it the stage never lights and the design loses 37.5% of its apogee in silence. |
| *(this run's last two)* | **Two rounds of review on `4a69479`, both after it shipped.** Round one found thirteen, round two found seven more IN THE FIXES — including that round one's headline fix was bypassable by deleting the booster's seed tube, and that one of its corrected numbers was still wrong. Ten fixed, five filed. Four were wrong numbers on a surface: the cross-check folding a booster's motor into a coaxial cluster (381.0 N against the real 190.5 N), removing a booster resizing the SUSTAINER (993.642 → 1105.598 m, twice, by two different routes), and a withdrawal notice reading "This design flies 1 stages." |

**The previous handoff's "Sev-1 count is zero" was wrong** — see the top of this file. **Four Sev-1s
were found this run and three were fixed.** Two were in the ledger or one gesture from it; two were in
this run's OWN R5 commit, found by a second opinion taken on it after it had already been pushed, and
the fourth is filed and open. Reviewing a commit you have already shipped is worth doing, and the
count that matters is the one at the END of the run.

## R4 — what shipped, and the one trap it left



**Increment 1 is in**: `GeometryEdits.moved` (an ordered list of `{ id, after }`), `applyMoves` between
removals and the dimension edits, the stage-boundary refusal, `moveTarget`, and the parts panel's
move-toward-the-nose / move-toward-the-tail pair. Pinned by 9 unit cases, a corpus sweep driving **206
reorders across all 35 real designs**, and two e2e cases. **Next slice is the DRAG** — the *done when*
says "drag a component along the airframe", and the buttons came first on purpose because they are the
keyboard and touch path a drag can never be.

**The trap, and it is THE thing to remember before adding the next operation: a new key on
`GeometryEdits` has to be added in SIX places, and exactly one of them is type-checked.** Every one of
the other five was missed on the first pass here and found by the pre-push review or the e2e — never by
a unit test, because unit tests call `applyGeometryEdits` directly and so walk straight past all of
them:

| where | what it costs when it is missed |
|---|---|
| `components/LoftApp.tsx`'s `interface Edits` | **the only one TypeScript catches.** It is a hand-restated duplicate of `GeometryEdits`, not an extension. |
| `hasGeometryEdits` (`lib/model/edit.ts`) | decides whether `applyGeometryEdits` runs AT ALL. With only a move set it returned false, so the design was shown, flown and exported as the pristine one. |
| the two `structureOf(doc.rocket, { … })` call sites | they name their fields explicitly, so the structure every aim and removal is judged against silently loses the new operation. |
| `removableFrom`'s `useMemo` deps | the tree the operation resolves its anchor against. Stale, a part could be moved exactly ONE place and no further, with the control still lit. The lint rule catches this one — do not silence it. |
| `ParameterSweep`'s `axisBase` deps | the one that publishes a number. Stale, the swept axis describes the pre-edit rocket while every point is written into the post-edit one: 300 mm out on the axis that drives static margin. |
| whichever tree the PANEL judges its control against | the panel is handed the fully-edited rocket, whose dimension edits synthesise top-level parts of their own; the app applies against the structure. Two trees, two answers, and controls that do nothing. Ask the app, the way `refuseRemoval` already does. |

Grep every function that enumerates this bag's fields by name before writing a line of the next one.

The scoping below was done by an agent driving all 35 corpus designs, 6 committed fixtures and 5 e2e
fixtures through the importer, and every figure in it was re-measured before being built on:

- **A top-level part's station is DERIVED, never stored** — `flattenRocket` walks each stage's list with
  a running cursor (`lib/model/geometry.ts:100-127`). So "the station arithmetic of everything aft
  follows" is FREE the moment the list order changes. R4 needs no arithmetic work at all.
- **All 150 top-level components across all 35 corpus designs use placement `after` with offset 0.**
  Zero exceptions, zero `absolute`/`top`/`middle` at index > 0. Reordering the array is therefore
  sufficient and safe: no entry needs its `placement` rewritten, and no imported design can defeat it.
- **Take `moved?: { id, after: string | null }[]`, appended, NOT a full ordered id list per stage.** A
  full list is a snapshot rather than a patch: it goes stale the instant `added`/`removedIds` change the
  membership, it cannot be undone by dropping one entry, and `lib/session.ts` restores the bag wholesale
  from storage, so the stale-snapshot case is reachable rather than theoretical.
- **Apply it FOURTH: after `applyAdds`, after `applyRemovals`, before `applyDimensionEdits`**
  (`lib/model/edit.ts:1614`). After adds so an authored part is reorderable by id; after removals so an
  entry naming a removed anchor simply drops; before the dimension edits so `aftmostBodyTube`,
  `nextTopLevel` and `transitionDefaults` all see the order the flyer built.
- **Refuse a cross-stage drop.** `nextTopLevel` flattens ACROSS stage boundaries
  (`rocket.stages.flatMap(...)`), so a part allowed to cross one silently re-stages itself — a different
  separation event. One-line guard. The identical single-stage-versus-chain confusion already cost a
  session once.
- **`interface Edits` in `components/LoftApp.tsx:154` is a HAND-RESTATED duplicate of `GeometryEdits`.**
  A new `moved` key must be added in BOTH or the app cannot carry it, and the type system will not catch
  the omission because `applyEdit` patches spread structurally.
- **The diagram's drag machinery is reusable, the gesture is not.** Every handle emits
  `onEdit({ [field]: scalar })` over a closed union of 9 scalar names, so a reorder cannot ride the
  existing contract. What DOES reuse wholesale: the pointerdown/CTM/rAF/AbortController drag scaffolding
  and `hoverProps(id)`'s per-part closed silhouette path, which already gives every body part a
  hit-testable, id-addressed grab target.
- **~~Freeze the HORIZONTAL frame during the drag.~~ MEASURED FALSE, 2026-07-31.** This said the
  airframe's overall length changes under the pointer mid-drag. It does not: `flattenRocket` stacks
  each stage's list with a running cursor and all 150 top-level components across the 35 corpus
  designs are body parts at `after` + 0, so a pure permutation leaves the sum — and therefore
  `o.length` — bit-identical. Freezing it would fix nothing. **What actually moves is `maxExtent`**,
  because fin seats re-resolve through `radiusAtStation`, which jumps `frameExtent` → `centerY` → `H`
  and shifts the whole picture VERTICALLY; the existing `vFrameExtent` freeze is the fix and the
  reorder drag must set it exactly as the fin-span handle does. And on a design carrying a boattail
  what-if, `addBoattail` returns the rocket unchanged once a narrower tube becomes aft-most, so the
  boattail VANISHES and the airframe genuinely does shorten — a preview-only, undo-invisible geometry
  change, and the one real horizontal drift. Left here struck through rather than deleted because two
  files carried the wrong instruction and a future session will otherwise re-derive it.
- **Only ONE committed fixture has R4's shape**: `fixtures/demo-quirks.ork`, 4 top-level children
  (nose > tube > transition > tube), already loaded at `e2e/smoke.spec.ts:3153`. **None of the 5 e2e
  fixtures has a stage with 3+ top-level children**, and the starter has 2 — so the honest e2e is
  "add a tube with R3, then drag it in front of the one it was added behind", which also proves
  adds-then-reorder compose. Discovering this after writing the test costs an increment.
- **The parts table is the keyboard/touch parity surface.** It already defaults to `flattenRocket`
  order, so it follows a reorder for free, and a move-up/move-down pair per row is the accessible
  equivalent of the drag. The two centreline handles are already fine-pointer-only because at phone fit
  width the airframe is ~11 px tall — a reorder grip on the body hits exactly that wall, so R4 needs a
  touch story decided up front or `e2e/touch.spec.ts` fails and P4 inherits the gap.

## What this session learned that is worth keeping

**NEVER revert a negative control with `git checkout -- <file>`. This file already said so, and this
session did it anyway** — one line in a loop of controls, and it took an entire uncommitted increment's
worth of work in `components/LoftApp.tsx` back to HEAD. Recoverable only because the edits were still
in context. **Copy the file's bytes aside FIRST and restore from the copy**, every time, without
exception; and when a control set touches more than one file, copy all of them before the first control
rather than reaching for git halfway through.

**A negative control's BUILD exit is part of the control.** Twice this session a control came back
green with `BUILD_EXIT=1` — the tree never changed, so the e2e ran against the still-correct `out/`.
Print the exit code beside the result, always.

The original note follows, and it is still the rule: It reverts the WHOLE file to `HEAD`,
including the uncommitted work you are testing. Running six controls in a loop that way silently
destroyed three files' worth of a finished increment — `components/ui.tsx` lost every primitive it had
just gained — and the loop went on reporting that each control "went red", which it did, for the wrong
reason: each successive control was measuring a tree that had lost the previous fix. **Copy the file's
bytes aside and restore from the copy**, and re-run the whole control set afterwards to confirm each
fires exactly the assertion it should. The corrected run fired one assertion per control.

**A control that changes only a comment or a message is not a control.** The one control that did not
fire was written as `from "./ui"` → `from "@/components/ui"`, which the assertion accepts on purpose —
both spellings are the same import. The control had to actually delete the import line. When a control
comes back green, suspect the control before the test.


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

## The done-check, answered

**Corpus, with its fixture count** — 35 design files, 9/9 suites, every count printed:
536 removable parts · 180 authored parts · 230 mass-object stations · **484 drag drop-slots (30 landing
in front of the next stage's first part)** · 206 reorders · **33 authored boosters and 2 refusals, 30
flown, 29 reaching burnout and 29 of those separating** · **0 of 35 designs lead with a flat face**.

**`DESIGN.md` §9, start of run → end:**

| count | start | end | target |
|---|---|---|---|
| `rounded-lg` | 37 | **35** | 0 |
| distinct card treatments | 3 | 3 | 3 (one is `Card`'s own) |
| off-scale spacing | 8 | **0** | 0 |
| `text-lg` | 0 | 0 | 0 |
| files where `text-xs` outnumbers `text-sm` | 9 | **0** | 0 |
| components importing the primitives | 12 | **14** of 23 | most |
| `Button` adopters | 7 | **9** (+1 taking the geometry as a class) | most |

**What can a flyer DO after this run that they could not before? (R-track)** Drag a part along the
airframe and drop it between two others, with a rule marking the joint while the pointer moves — and
**add a booster stage to a single-stage design and take it back**, which turns a design that flew
994 m at 196 m/s into one that flies 1,491 m at 274 m/s. Both walked in the built export.

**What is measurably better about using the tool? (P-track)** Three Sev-1s are gone: deleting a design
from the shelf is undoable; a reordered airframe flying a flat face into the airstream now says the
apogee is optimistic instead of publishing the streamlined one; the RocketPy cross-check no longer
folds an authored booster's motor into a coaxial cluster and calls the result a second opinion (381.0 N
against the real 190.5 N); and removing a booster no longer resizes the sustainer behind the flyer's
back (993.642 → 1105.598 m). Every decision-grade number came off
caption size — `text-xs` across `components/` went 91 → 56 — and the footer's standing safety
disclaimer came out of the fine print. A 360 px phone stopped scrolling horizontally, and a 320 px one
did too, having done so for some time.

**Production.** `loft.fusionspace.co` serves 200 and does **not** carry any of this run's code — its
chunks contain no `addedStages`, which the local build's do. Everything below is on the working branch
and in **pull request #82**, verified and pending a merge. Under SHIPPED-MEANS-REACHABLE none of it has
shipped yet.

**Walked cold on the built export before the last push**, on `/`, `/docs`, `/docs/limitations`,
`/validation` and `/motors` — all 200, no page error, no console error, no 4xx or 5xx. The R5 gesture
end to end: 994 m becomes 1,491 m and the flight names the shed stage; with a booster on, the RocketPy
cross-check and the parameter sweep withdraw while the dispersion study stays (it is offered for
multi-stage on purpose); removing the booster puts 994 m back exactly.

**Four checks that could not fail were found**, which is the finding this run would keep if it could
keep only one: the phone horizontal-overflow e2e compared against a viewport width the emulator
inflates to absorb the overflow; a clear-on-load assertion ran after the state it tested had already
been cleaned up; the corpus's booster-separation assertion used `some(e => e.type === "separation")`,
which a design's PRE-EXISTING separation satisfies, so on the multi-stage designs it was structurally
blind to the defect it existed to catch; and the §9 spacing grep has three blind spots holding 118
values. Three fixed, the last filed.

**And a refusal that was exported, unit tested and swept across all 35 corpus designs was never asked
by the UI.** `canAddStage` had three proofs and no caller, so on the 2 designs it refuses the button
rendered anyway and a click committed an undo step, flipped the design to edited — which withholds the
file's own stored-results comparison — and changed nothing. **A guard is not a guard until a caller
asks it, and no amount of coverage of the guard itself will tell you.** The cheap check is to grep for
the exported name and confirm at least one call site that is not a test.

## Pick up first

**Take the next slice of each track, in this order** — after the standing Sev-1 above, which preempts
both by the manual's first criterion and is small.

1. **R5 increment 2 — the PHASE TABLE.** The *done when* asks for "a staged flight whose phase table
   matches what they built" and the flight surface has none: separation is a marker on the altitude
   chart (`ResultsView.tsx:1483`) and a sentence in the untracked-booster warning. `FlightViz.tsx:65`
   filters `separation` out of its event dots entirely. The solver already emits a `separation`
   `FlightEvent` per phase boundary, so this is a surface, not a model.
2. **P1's remaining slices**: the 35 `rounded-lg` — and **that breaks print unless
   `app/globals.css`'s rule keyed on `.rounded-lg` changes in the same commit** — then `DataTable`,
   which `COMPETITION.md` row 24 now sizes: five tables, 2 that sort, 3 that copy, and RockSim lets the
   flyer choose the columns.
3. **Then alternate.**

**What R5 still owes its *done when*, beyond the phase table**: "give it its own motor mount and fins"
is inherited from the seed rather than authored, because there is no `AddedPart.kind` for a mount; and
only an AUTHORED stage can be removed, because `Stage` has no id (the decision and its cost are in
`ROADMAP.md` under *Decisions taken without the owner*).

**Two BLOCKERS in `BACKLOG.md` are still unfixed**, both silent data loss on the from-scratch builder,
both with full reproductions and a note on why the obvious fix is wrong:
- **`Download .ork` drops the motor the flyer picked.** 1,033 m saved, 542 m re-imported (−47.5%).
- **Reopening your own build from the shelf hands back the factory starter.** 790 m / 4.1 cal comes
  back as 994 m / 1.53 cal.

A triage agent argued both are Sev-1 by the manual's first criterion. They are the strongest candidates
the moment nothing else preempts, and the second is on the very surface this run gave an undo to.

**The `BACKLOG.md` Sev-1 count is ONE at the end of this run — do not read this as zero.** Six were
found and five fixed: the shelf's one-way delete, the blunt leading face, the cross-check's folded
motor cluster, the sustainer resized by a booster removal, and that same sustainer resize reached a
SECOND way once the first fix turned out to be bypassable by deleting the booster's seed tube. The
sixth is filed and is the first thing to pick up:

**An authored booster whose motor mount is then deleted flies as dead ballast and nothing says so.**
`canAddStage`/`buildStage` refuse a seed with no mount to clone, but that refusal is ADD-TIME ONLY and
the booster's inner tube is an ordinary removable component. Measured on the starter: booster authored
reads 1491.464 m with one separation; delete the booster's inner tube and it reads **638.973 m with
zero separation events** — 35.7% BELOW the 993.642 m the design flew before the booster existed — and
the only warning on the flight is an unrelated static-margin caution. It is the same class as the
55%-gain case the add-time refusal exists to prevent, reached from the other direction. Either the
removal is refused inside an authored stage or the flight says the stage cannot fire; the second is
better, because it also catches an IMPORTED stage in that state, which nothing checks today.

Both rounds of the R5 review — every open finding with its reproduction — are the top entry in
`BACKLOG.md`.

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
