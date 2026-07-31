# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Read this first: the queue now has TWO tracks

**`ROADMAP.md` was restructured on 2026-07-30 and a run now ships from both tracks, alternating.**
This is the single thing to understand before scoping anything.

| track | state at the end of 2026-07-31 |
|---|---|
| **R — capability** | R4 — reorder and restack — NOT STARTED, and fully scoped (see *R4 is scoped* below) |
| **P — product & craft** | **P1 — one design system, adopted — IN PROGRESS**, increment 1 shipped |

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

## Shipped this session (2026-07-31)

Baseline before anything changed, all four green: lint 0 errors / **1 warning** (the standing
`setDraft` one), **826 unit**, build, **169 e2e**, corpus **35 design files, 5/5**.

| | |
|---|---|
| **P1, increment 1** | The design system got the primitives it names and a check that fails. `Card` (five tones, an `as` so a landmark stays a landmark), `Section`, `Button` (three weights + `danger`); seventeen hand-rolled containers converted; `lib/design-system.test.ts` pins `DESIGN.md` §9 as an EXACT ratchet. §9 counts before → after: `rounded-lg` 49 → 46, distinct card treatments 9 → 3, adopters 5 → 11. |
| **§9 itself was broken** | Its adoption grep searched `from './ui'` in single quotes while every import in the repo is double-quoted, so it answered **0 whether adoption was 0% or 100%**, for as long as `DESIGN.md` has existed. Also: the `sm > xs` total passed by three while **9 of 23 files were individually inverted**, and counting adopters by FILE is satisfied for the rest of the milestone by one more `Card` import. All three are sharpened in `DESIGN.md` and asserted the sharpened way. |
| **Sev-1: the wind was yesterday's** | `lib/weather.ts` read winds aloft from `hourly` index 0 — **00:00 local**, because `timezone=auto` + `forecast_days=1` makes the hourly array a local day — while the surface block was live. Measured against the live API at 18:15 local: 850 hPa index 0 was 154° from the real hour, 500 hPa 166° and fifteen times the speed. Flown on three real designs, the landing point moved **241 m, 352 m and 255 m** — opposite sides of the pad, with the drift MAGNITUDE barely changing, so the number looked right and pointed the wrong way. |
| **The bearing wrap, in the same function** | A plain lerp on a compass bearing reverses the wind wherever two levels straddle north (350°/10° meets at 180°). `lerpBearing` takes the short arc. Was filed in `BACKLOG.md`; fixed here because it corrupts the same number as the Sev-1 above, in the same line of the same function. |
| **`lib/weather.ts` had NO tests** | Which is most of why it carried both. `lib/weather.test.ts` is 16 cases, and the e2e stub now carries a full 24-hour day with `current.time`, where before it carried one unstamped hour and therefore only ever exercised the fallback branch. |

## R4 is scoped, and the scoping is the expensive half

An agent drove all 35 corpus designs, 6 committed fixtures and 5 e2e fixtures through the importer to
establish these. They are measurements, not opinions, and they turn R4 from a placement-model rewrite
into a 3-increment milestone:

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

**Two Sev-1-class export defects are reproduced, quantified and NOT yet fixed.** This is the top of the
queue. Measured this session by round-tripping all 35 corpus designs through `exportOrk` →
`importDesign`:

- **28 of 35 designs change their balance**, and **21 of 35 shift static margin by more than 0.005 cal**
  — a Sev-1 quantity by name. Worst: `Pods--airframes and winglets.ork` **2.13 → 1.50 cal (−0.64)**;
  `Three stage low power rocket.ork` **2.51 → 2.79 (+0.28)**. Dry mass barely moves; it is the CG.
- **Cause 1 — `lib/ork/export.ts`'s parachute and streamer writers never emit `packedlength`**, while
  `lib/sim/mass.ts:182,187` places a packed canopy's CG at `packedLength/2`. `masscomponent` and
  `shockcord` DO write it, so the omission is inconsistent within one file.
- **Cause 2 — the freeform-fin export clamps its tip chord** (`Math.max(0, 2*area/height - rootChord)`),
  so whenever `2*area/height < rootChord` the exported area is strictly LARGER than the original and the
  comment's "equal area" claim is false for exactly the tapered planforms freeform fins exist to express.
- It belongs to **R6** by subject, but a wrong static margin on a file the flyer re-opens or hands to
  OpenRocket is Sev-1 rule 1, so it preempts.

**Then continue P1.** Its next slices, in order, are on `ROADMAP.md`: `Button` adoption plus the two
surfaces carrying two indigo primaries each (`ImportPanel`, `RocketpyCrossCheck` — §5 forbids it
outright), then the type scale (14 uses of a `text-lg` that is not on the scale), then the 8 off-scale
spacing values, then `DataTable`.

**Then R4**, which is fully scoped above.

**Two pull requests have been open for days and neither is merged, and one carries work that is NOT on
`main` at all.** Read them before scoping anything:
- **#67 "Undo every edit, not just a removal — R2 complete"** — the undo half is SUPERSEDED (`main` has
  `lib/model/history.ts`, and R2 is marked SHIPPED). But it also carries `scripts/check-text-gaps.mjs`
  and a `BACKLOG.md` entry recording **79 missing spaces on the served `/docs` pages**, and neither the
  script nor the entry exists on `main`. Harvest the script, then close #67 with that reason. Closing it
  blind loses the 79.
- **#55 "Stop the build eating the space out of four sentences"** — **entirely unlanded.** `ballisticGap`,
  `designMotorFlies` and `e2e/build-text.spec.ts` are all absent from `main` (`git grep ballisticGap`
  returns nothing). Its `ballisticGap` is a real correctness fix: the motor sweep's DESIGN row reads
  1,888 m against a Flight card one tab away reading 342 m, on a design whose recovery opens before
  apogee. Its base is `e7f80a9`, seven merges behind, so it needs rebasing rather than merging.

`BACKLOG.md` is a defect ledger to file into and screen for Sev-1s. Its Sev-1 count is zero at the end
of this run **only if the two export defects above are counted as pick-up-first rather than filed** —
they are stated here, at the top, deliberately.

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
