# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Pick up first

**Nothing here needs an owner decision that is not already parked.** `OWNER-NOTES.md` has 12 open
notes, all carrying a verdict from the run that first saw them (2026-08-08), none pending; its
*Awaiting the owner* section holds 11 entries and the two newest are still live — the signing key
only the owner can register, and the sibling repo this container cannot reach.

| | what | state |
|---|---|---|
| SEV-1 | the boattail was spliced ahead of a design's own tail cone, so the field that exists to CUT base drag flew the shipped sample **17.72 m lower** | **merged, live** (PR #198) |
| SEV-1 | the exit field carried no `max` at all and advertised a ceiling measured on a tree the applier does not use — a value inside the stated range built nothing and said nothing | **merged, live** (PR #198) |
| SEV-1 | that ceiling reached the design wall and **not the cone's own popover**, because the aim mask blanks every `designDims` key a derived part does not name — found by the pre-push review, in this run's own fix | **merged, live** (PR #198) |
| SEV-1 | a stale exit outside a ceiling another field had moved dropped the whole part in silence; it clamps now, and the field reads its value back through the same ceiling | **merged, live** (PR #198) |
| P19 increment 2 | `onSortChange` call sites **2 → 7**; persisted flyer-set controls **11 → 17** | **merged, live** (PR #198) |
| P19 increment 3 | the catalogue's search, vendor filter and caliber toggle survive a close, a re-open and a reload, keyed per kind; `COMPETITION.md` row 36's forgetting half **RESOLVED** | **PR #199** |
| — | **R12 increment 29 written, not started** — and the scoping moved what the increment IS, twice | **PR #199** |
| — | the parts table **could not reverse on any column** — found while converting it | **merged, live** (PR #198) |
| — | three intermittent e2e cases fixed with assertions rather than retries | **merged, live** (PR #198) |
| — | `COMPETITION.md` row 57 added; row 54 corrected on what its own recommendation was aimed at | **merged, live** (PR #198) |

**The two questions this run has to answer, answered.**

*What can a flyer DO that they could not before?* **Put a tail cone on a rocket that already has
one** — 8 of the 35 corpus designs and one of the eight bundled samples end in a transition, and on
every one of them the field built a shape nobody could fly and made the rocket slower. And **reverse
any table's sort**: five sortable columns on the parts table offered ten orders and reached four,
because the host threw away the direction the primitive had computed for it.

*What is measurably better?* Tables that remember the sort a flyer put them in: **1 of 7 → 7 of 7**.
Persisted flyer-set controls: **11 → 20** (the catalogue's three filters land in increment 3). Boattail ceilings that are advertised but not enforced:
**every one → none**, driven over 210 ceilings on 35 real designs in both unit systems. Surfaces
carrying the boattail's field with two different promises: **2 → 1**. e2e suite **300 → 303**, with
three cases that were intermittent now deterministic (6/6, 6/6, 4/4 on repeat).

**The next slice on each track:**

- **R-track: R12 increment 29 is WRITTEN and not started — read its entry in `ROADMAP.md` before
  writing any code, because the scoping contradicts the obvious plan in three places.** The switch
  cannot be on the boattail's EXIT: a boattail is by construction the aft-most part of the stack, so
  it has no next component to take a diameter from and no referent in the vocabulary the switch would
  borrow. The real gap is a ROUND TRIP — `lib/ork/xml.ts`'s `parseNum` takes the number out of
  `auto 0.025` and drops the token, and the exporter then writes an explicit radius, so opening a
  design and saving it back silently converts every automatic dimension into a hand-typed one. And
  there is a live import divergence at a stage boundary: `resolveAutoRadii` resets its neighbour
  cursors per stage where OpenRocket resolves across one, verified on two independent real
  multi-stage designs. Smallest first is the round trip; it needs no UI at all.
- **P-track: P19 increment 4** — the two sweeps come back to the run you left, the way the dispersion
  panel already does. It is a stored RESULT rather than a stored flag, and the increment 1 record in
  `ROADMAP.md` says why a flag cannot work: on all three panels `open` IS the run trigger, so a
  restored one either flies unbidden or renders a state indistinguishable from closed.
  `saveDispersion`/`loadDispersion`/`clearDispersion` and `MonteCarlo.tsx`'s `runKey` are the shape to
  copy, including the two properties that make it honest — the stored run compared verbatim against a
  key naming the design, the conditions and the inputs, and a dismissal that clears the stored copy.

## What the pre-push review caught this run, which is again the part worth carrying

**Three lenses over one diff returned twenty-seven findings, and two of them were Sev-1s in the fix
the diff existed to make.** Both were the same defect arriving through a door the fix had not closed,
which is the pattern worth naming: *a fix that corrects a value has to be checked on every surface
that reads it, and against every other input that can move it.*

1. **The bound reached one of the two surfaces that carry the field.** `maskAimedDims` blanks every
   `designDims` key a derived part's registry entry does not name, and the entry named one key while
   the field had grown to three. So the popover built precisely so the cone could be edited as a part
   kept the unbounded field. `DERIVED_PARTS`' own docblock predicted it in as many words — *"A derived
   part whose bounds ever depend on caliber has to name it here"* — which is the second time this run
   that a hazard the repo had already written down was walked into anyway.
2. **A live `max` is not a bound; it is a bound at the moment of typing.** Nothing re-applies it to a
   value already committed, so a second field that moves the ceiling puts yesterday's number outside
   today's limit. Whether the applier then drops or clamps is the whole difference between a silent
   no-op and a rocket that matches its panel.
3. **A check that re-implements the conversion it is verifying proves two copies agree.** The corpus
   case spelled out the metres→mm and metres→inches rounding rather than importing it, so changing the
   component's rounding would have left it green. Third instance of this shape in a month.
4. **A hint suppresses the field's own range sentence** (`guidance = hint ?? ranged`), so a hint that
   does not state the ceiling replaces the only sentence that did.
5. **A sentence that names a fact the solver contradicts is worse than one that says less.** The hint
   claimed a staged cone "separates before apogee"; the bundled payload-separation sample parts on an
   ejection charge AFTER apogee, and this repo's own flight test pins that.
6. **Two helpers were second spellings of `isBody` and `aftOuterRadius`**, both already imported into
   the file that re-spelled them, and both already serving a third caller.

*The general lesson, and it is not "review harder".* Findings 1, 2 and 3 are the same failure in three
places: **the fix was verified where it was written**. Ask of every corrected value: which other
surface renders it, and which other input can move it after it is correct?

## What P19 increment 2 turned up that was not its subject

- **The parts table could not reverse, on any column.** The host mapped "clicked the active column"
  straight to the design's order and discarded the direction `DataTable.click` had already computed.
  Mass opened heaviest-first with no lightest-first; Component A→Z with no Z→A. Five sortable columns,
  ten orders, **four of them reachable** — while `DataTable`'s own docblock described a three-state
  cycle that existed nowhere in the code. **A docblock is not a check.**
- **A hand-written union, a `switch` and an unsound cast were all one duplication.** The parts table
  named its five sortable columns a second time and re-derived each one's ordering value a third. The
  copies had drifted, and the drift IS the bug above: the switch is what fixed each column to one
  direction.
- **`sortDir` is where a three-state cycle counts from, so a table that OPENS on a column must declare
  it.** `MassBreakdown` opened heaviest-first with the column left at the default ascending, so the
  table sat one step into a cycle whose first step it had never taken and the next click cleared the
  sort instead of reversing it. The hook now takes an initial KEY and reads the direction off the
  column, so the two cannot disagree.

## The e2e flakes, measured and fixed rather than tolerated

Three cases, one shape: **a test that treats "not there yet" as "not there".** All three failed under
in-shard parallelism and passed alone.

- `e2e/docs.spec.ts:39` waited for six precached URLs and walked **seven**. The wait is derived from
  the array the loop walks now. 6/6 on repeat.
- `e2e/rocketpy-selfhosted.spec.ts:296` was the only offline case in the suite that flipped
  `setOffline(true)` on a page with **no service-worker controller at all**. 6/6.
- `e2e/touch.spec.ts:1174` skipped any docs route whose contents nav it could not find — right for
  `/docs/changelog`, indistinguishable from a nav that had not rendered. 57 chips against a floor of
  40, so losing the FAQ's 27 alone takes it red. 4/4.

**Still open, and filed:** `playwright.config.ts` runs `workers: 1` in CI and the local default
otherwise. Measured on shard 1 of 5 this run: **1 failure in 3 runs at the default, 0 in 2 at
`--workers=1`**, at 2.0 min per shard against 1.2. A fourth case of this shape should become a shared
`goOffline(page)` helper rather than a fourth one-off.

## What production is serving, walked after PR #198 merged

Walked by fetching the service worker's own precache manifest and every URL in it — not the index
page's `<script>` tags, which name only some of the chunks. Before the merge the live build token was
`9580c5173cba`; after it, `9100174c9a48`.

**71 precached paths, 70 answered 200, and the one that did not is expected**: `/docs/` is the host's
308 to `/docs`. This run's own strings are in the served chunks — the boattail hint's *"Fairs to"* and
the staged clause *"so it leaves with that stage"* are both **PRESENT**. `"Sort by Vendor"` is
absent, and that is correct rather than a gap: the catalogue is the app's one dynamic import and its
chunk is deliberately outside the precache list.

**So the production gap for PR #198 is zero.** PR #199 was in CI at the time this was written; the
next session should re-walk and confirm.

A browser cannot reach the live site from this container (the agent proxy; see *The environment*), so
a production walk is `curl` plus string probes over the precache manifest, and the browser journey is
run against the local `out/`. This run's cold walk on the built export read the boattail field at
`max="31.6"` with the hint *"Fairs to 32 mm — the aft end of Boattail. Up to 31.6 mm here."*, and the
flight moved **905 → 912 m** with the cone on it — higher, which is the direction the field's own
documentation promises and the opposite of what it did before this run. 0 console errors. Two tables'
sorts survived a reload in the same walk.

## What the sibling repo is OWED

`DESIGN.md` is shared and the DESIGN-IS-BINDING invariant says a change to one copy is a change to
both **in the same run**. **This run changed nothing in `DESIGN.md`** — the table-sort work is a
component contract rather than a system rule, and §5 already says "every table is this one".

What is still owed from run 20 is unchanged and is listed in that run's handoff: §2's container border
width paragraph, §2's `accent` row gaining a drop target, §5's `DropZone` bullet and its `useFileDrop`
paragraph, §9's `containerBorderWidths` command, and the correction to §5's false *"one `accept` list
drives the picker and the drop"*. **Both `add_repo` for `nrdptel/fusionspace-debrief` and a plain
`git clone` are still refused by this harness**, while `list_repos` shows the repo public with
`can_push: true` — so the account has the access and the session may not use it. Parked in
`OWNER-NOTES.md` under *Awaiting the owner*; the fix is attaching it as a second source at session
creation, exactly as the fixtures repo is.

## The environment, measured 2026-08-20 (run 22)

- **The container was COLD** — no `node_modules`, no `corpus/`, and `/opt/pw-browsers` held
  chromium-**1194** while this repo's Playwright manages **1228**. `npx playwright install chromium`
  fetched it in about a minute. **Tenth consecutive run that has paid for it**; it stays paid until
  it is in the environment's setup script, which is the owner's to make.
- **The fixtures repo IS attached** at `/home/user/loft-fixtures`; five per-tool symlinks into
  `corpus/` and the suite names **35 design files**.
- **Git identity arrived as the harness vendor's default** and was set per-repo before the first
  commit. Commits sign (`gpgsig` present on HEAD) even though `/home/claude/.ssh/commit_signing_key.pub`
  is a zero-byte file, which is worth knowing before anyone "fixes" it.
- **The harness appends its attribution footer to a PR body on CREATION and not on UPDATE**, so
  re-posting the body strips it. It did this run. It also HTML-escapes ASCII apostrophes in the posted
  body, and re-posting with typographic ones came back clean — so write PR prose with typographic
  quotes and read the body back every time.
- **A full gate is ~20 minutes** on a quiet box (lint ~1 min, build ~1 min, unit ~7 min, e2e
  5×1.2 min). Subagents may READ during it and must run nothing else.
- **FIVE e2e shards, and 303 tests** — 61 + 61 + 61 + 60 + 60. Read the failure LINE, never the tail.
- **`main` moved under this branch mid-run** (PR #197, the control-border contrast change). Merged in,
  re-gated in full, pushed. Expect this: the repo now has more than one session's work landing a day.
- **The clone is SHALLOW.**
- **`npx tsc --noEmit` reports errors only in test files**, which `npm run build` never reads.
- **A browser cannot reach the live site from here** — outbound HTTPS goes through the agent proxy and
  Chromium is not configured for it.

## The arc across sessions

- **Run 22 (2026-08-20, this one).** Four Sev-1s and two milestone slices across one PR: **R12
  increment 28** (a boattail fairs to the tail it is on, and states the bound it enforces — the anchor,
  the ceiling's tree, the aim mask and the moving-ceiling clamp), **P19 increment 2** (every table
  remembers its sort; `onSortChange` 2 → 7; the parts table gains a reverse it never had), and three
  intermittent e2e cases made deterministic. `COMPETITION.md` row 57 added, row 54 corrected. P19
  gained increment 6 from a half withdrawn on measurement. PR **#198**.
- **Run 21 (2026-08-19).** Three Sev-1s — `ValidationPanel` publishing the mean absolute error with no
  envelope caveat, the dispersion panel's vanishing waiver ceiling, and the diagram's zoom control
  doing nothing at all on a phone — plus **P19 increment 1** (persisted call sites 9 → 11) and
  `lib/envelope-surfaces.test.ts`. PR **#196**. A separate strand shipped the control-border contrast
  change as **#197**.
- **Run 20 (2026-08-18).** R12 increments 25, 26 and 27, a licensing Sev-1, P18 increment 3. P19
  decomposed. PRs **#191**–**#194**.
- **Run 19 (2026-08-18).** P18 increment 2, R12 increment 24, and six Sev-1s. PRs **#188**, **#189**.
- **Run 18 (2026-08-17).** R12 increments 21 and 22; P18 written and increment 1 shipped.
- **Run 17 (2026-08-17).** Two Sev-1s and three increments; **P17 SHIPPED**, R12 reached increment 20.
- **Run 16 (2026-08-14).** P17 increment 1; R12 increment 19.
- **Run 15 (2026-08-13/14).** A Sev-1 on the design's caliber. **P16 SHIPPED.** R12 reached 18.
- **Run 14 and earlier.** See `ROADMAP.md` for each milestone's *done when*.

## Standing hazards this run re-confirmed

- **Never push straight to `main`** — the deploy fires on any push, gated on nothing.
- **Read the gate's failure LINE, not its tail**, and re-run a failure before believing it — but a
  test that fails in a shard and passes alone is not automatically contention. Three this run were
  real defects in the tests themselves and each had a precise cause.
- **The gate is measured on a QUIET box.**
- **Every e2e negative control is `revert → rebuild → run → restore → rebuild`**, because the suite
  serves `out/`. Revert by changing a VALUE the fix depends on, not by deleting the code that uses it.
- **A merged PR cannot track new work.** After merging, `git checkout -B <branch> origin/main`.
- **`DESIGN.md` §9, measured this run**: `npx vitest run lib/design-system.test.ts` is **30 of 30**,
  every count at its stated target — radius drift 0, border drift 0, mismatched border pairs 0, card
  treatments 1, card treatments outside the primitives file 0, container border widths 0, elevations
  outside §2's two 0, off-scale spacing 0, off-scale type 0, hand-rolled `<select>` 0, hand-rolled
  `<button>` 3 (the three primitives). Nothing this run moved any of them.
- **The corpus is real and it ran**: `lib/corpus/sweep.test.ts` is **50 passed** over **35 design
  files**, including this run's new case — 210 advertised boattail ceilings driven in both unit
  systems, 0 stepping out behind the cone, 8 designs whose tail is a transition rather than a tube.
- **`OWNER-NOTES.md`: all 12 open notes carry a verdict and none is pending.** No new notes arrived
  this run, so every verdict is the 2026-08-08 one from the run that first saw them.
