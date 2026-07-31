# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Read this first: the queue now has TWO tracks

**`ROADMAP.md` was restructured on 2026-07-30 and a run now ships from both tracks, alternating.**
This is the single thing to understand before scoping anything.

| track | state at the end of 2026-07-31 |
|---|---|
| **R — capability** | **R4 — reorder and restack — IN PROGRESS**, increment 1 shipped |
| **P — product & craft** | **P1 — one design system, adopted — IN PROGRESS**, increments 1–2 shipped |

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
| R4 — reorder and restack | NOT STARTED — fully scoped 2026-07-31, see below |
| P1 — one design system, adopted | IN PROGRESS 2026-07-31 — increment 1 shipped, ratchet pinned |

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

## Shipped this session (2026-07-31) — four pull requests, all merged and deployed

Baseline before anything changed, all four green: lint 0 errors / **1 warning** (the standing
`setDraft` one), **826 unit**, build, **169 e2e**, corpus **35 design files, 5/5**.
At the end: **869 unit, 171 e2e**, corpus 35 files **6/6**. Nothing is pending on a branch.

| PR | what |
|---|---|
| **#76** | **Sev-1 — "today's weather" flew last night's wind.** `lib/weather.ts` read the winds-aloft profile from `hourly` index 0, which with `timezone=auto` and `forecast_days=1` is **00:00 local**, while the surface block was live. Measured against the live API at 18:15 local: 850 hPa 154° from the real hour, 500 hPa 166° apart at fifteen times the speed. Flown on three real designs the landing point moved **241 m, 352 m and 255 m** — and the drift MAGNITUDE barely changed, so the number looked right and pointed the wrong way. Plus the bearing wrap in the same function, and **P1 increment 1**. |
| **#77** | **Sev-1 — a saved design did not re-open with the balance it was saved with.** The parachute and streamer writers never emitted the packed dimensions, and `lib/sim/mass.ts` places a packed canopy's CG at half its packed length. Static margin moved on **21 of 35** real designs; after the fix, **6**, all of them the disclosed freeform conversion. Plus **86 spaces the build was eating on the live site**, and `check-text-gaps.mjs` in `postbuild`. |
| **#78** | **R4 increment 1 — a flyer can reorder the airframe**, and **P1 increment 2 — one button hierarchy**. Five defects found by the pre-push review, all fixed before pushing. |
| **#79** | **The motor sweep says what it is showing.** `ballisticGap` (the DESIGN row reading 1,888 m against a 342 m flight) and `designMotorFlies`, both harvested from a pull request that had been open since 2026-07-28. |

**Both stale pull requests are closed, with their reasoning recorded on them.** #67's undo half was
superseded by `lib/model/history.ts`, but its `check-text-gaps.mjs` existed nowhere on `main` and found
86 live defects — harvested first, then closed. #55's four glued sentences were already gone, but its
`ballisticGap`, its `resolves` flag and two measured builder BLOCKERS were not — the first two are
shipped, the blockers are in `BACKLOG.md` with the note on why the obvious fix is wrong.

## The done-check, answered

**What can a flyer DO after this run that they could not before?** Reorder the airframe: pick any
top-level part and walk it toward the nose or the tail, with the stations of everything aft following
and each nudge undoable by name. Walked on `fixtures/demo-quirks.ork` in the built export of `b280201`:
the aft tube moves forward and the static margin goes **5.60 → 4.14 cal**.

**What is measurably better about using the tool?** Two numbers a flyer acts on stopped being wrong.
Today's-weather drift pointed up to 352 m the wrong way and now does not; a downloaded design's static
margin moved on 21 of 35 real designs and now moves on none except the disclosed freeform case. Plus
86 sentences on the live site that were missing a space, and the §9 counts below.

**`DESIGN.md` §9, start of run → end:**

| count | start | end | target |
|---|---|---|---|
| `rounded-lg` | 49 | **37** | 0 |
| distinct card treatments | 9 | **3** | 3 (one is `Card`'s own) |
| off-scale spacing | 8 | 8 | 0 |
| components importing `ui.tsx` | 5 | **12** of 23 | most |
| components importing `Button` | 0 | **7** | most that have one |
| hand-rolled indigo primaries | 16 | **6** | 0 |
| surfaces with two primaries | 2 | **0** | 0 |
| files where `text-xs` outnumbers `text-sm` | 9 | 9 | 0 |

**Cold walk of the built export of `b280201`, and the phone.** The reorder moves the margin as above.
The from-scratch builder composes with it: add a tube behind the body, and the authored tube is
immediately reorderable — R3 already aims at it, so the control is there without another click. At a
390 px viewport the move control measures **159 × 44 px** (the contract is 44) and the page has **0 px**
of horizontal scroll. No page errors on any leg.

**Production.** `loft.fusionspace.co/docs/limitations` serves the freeform disclosure including "worst
0.69 cal", so #77 is live. There is no gap between what shipped and what is deployed: every one of the
four pull requests merged to `main`, which deploys on push.

**`COMPETITION.md` gained two rows** (20: a move that cannot be made is refused, and one that can is
re-checked — OpenRocket has had drag-drop reorder since 1.1.3 and added gap/overlap warnings in 22.02;
21: one look-and-feel engine with density as a user-adjustable global). Row 1's note now names its P1
dependency. The ledger's "newest first" header was wrong — the table ascends and the numbers are stable
references — and now says so.

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
- **Freeze the HORIZONTAL frame during the drag.** `onActiveChange` does the vertical analogue for two
  existing handles; without the horizontal one the airframe's overall length changes under the pointer
  mid-drag and the drop indicator drifts away from it.
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

**NEVER revert a negative control with `git checkout -- <file>`.** It reverts the WHOLE file to `HEAD`,
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

## Pick up first

**Both tracks are IN PROGRESS and neither is blocked. Take the next slice of each, in this order.**

1. **R4 increment 2 — the DRAG.** The *done when* asks for "drag a component along the airframe and
   drop it between two others"; increment 1 shipped the operation and a button pair. The drag reuses
   `RocketDiagram`'s existing pointerdown/CTM/rAF/AbortController scaffolding wholesale and
   `hoverProps(id)`'s per-part closed silhouette path, which already gives every body part a
   hit-testable, id-addressed grab target. What is new is the drop-target computation and the
   indicator — and **freeze the HORIZONTAL frame for the duration**, because the airframe's overall
   length changes under the pointer mid-drag and the x-scale snapshot goes stale. `onActiveChange`
   already does the vertical analogue for two handles; there is no horizontal one. Keep it
   fine-pointer-only, like the other centreline grips: the buttons are the touch path.
2. **P1 increment 3 — the type scale.** 14 uses of a `text-lg` that is not on §3's six-size scale, and
   9 of 23 component files where `text-xs` outnumbers `text-sm`. Both counts are in the ratchet
   already; converting the panel headings to `text-xl font-medium` moves the section rhythm on every
   surface at once. Then the 8 off-scale spacing values (single-token edits, the cheapest count to
   take to zero), then `DataTable`.
3. **Then R4 increment 3, then P1's remaining slices**, alternating.

**Two BLOCKERS are filed in `BACKLOG.md` with full reproductions and are NOT fixed** — both are silent
data loss on the from-scratch builder, both harvested from a pull request closed this run, and both
carry a note on why the obvious fix is wrong (which is the expensive half):

- **`Download .ork` drops the motor the flyer picked.** 1,033 m saved, 542 m re-imported (−47.5%).
  On the builder path "Swap motor" is the only motor control, so that dropdown IS the picker, not a
  what-if. Not fixable by "bake them in" — on the import path a swap genuinely is a hypothetical.
- **Reopening your own build from the shelf hands back the factory starter.** 790 m / 4.1 cal comes
  back as 994 m / 1.53 cal. The "Pick it back up" banner restores it correctly, so the data exists.

Neither is a Sev-1 by the manual's definition — no wrong number is *published*, and there is a way
back — but they are the two worst things a builder can hit, and they are the strongest candidates the
moment a Sev-1 preemption is not competing with them.

**`BACKLOG.md`'s Sev-1 count is zero at the end of this run.** Three were found and all three were
fixed rather than filed: the winds-aloft hour, the bearing wrap, and the export's packed dimensions.

**No pull requests are open.** #76, #77, #78 and #79 all merged and deployed; #55 and #67, open since
2026-07-28 and 2026-07-30, are closed with their unique content harvested first.

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
