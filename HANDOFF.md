# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Read this first

**The sibling repo is owed three wording changes, for the FIFTH run running, and it is an OWNER fix.**
`add_repo` for `nrdptel/fusionspace-debrief` was refused by the harness's permission classifier again
on 2026-08-02. `DESIGN.md` §10 makes a change to one copy a change to both **in the same run**, so
every wording owed to that file stays unmade rather than creating the divergence the invariant
forbids. The queue is now FOUR, all in `BACKLOG.md`:

1. §9's shell block still says `grep -roh '\btext-lg\b'` while the executable check moved past it;
2. §5's "everything below lives in `components/ui.tsx`" now has two documented exceptions —
   `buttonClass` (a server component cannot call into a `"use client"` module) and `DataTable` (it
   needs `DownloadCsv`, which imports `Button`, so putting it in `ui.tsx` makes a cycle);
3. a hand-rolled-`<button>` grep and a stylesheet-value type check, to match the two ratchets added
   2026-08-01;
4. **new this run** — §5's component vocabulary has no entry for the workspace SPINE, which is now a
   real thing (`components/WorkspaceNav.tsx`). §7 already blesses it in prose ("navigation is one
   spine, present on every route, showing where the flyer is"); §5's table does not name it.

None is a divergence in BEHAVIOUR — every count agrees — but the prose drifts a wording at a time.
**A session created with both repos attached as sources clears all four in one commit each.**

**`BACKLOG.md`'s Sev-1 count is ZERO at the end of this run.** One wrong-number defect was found and
fixed inside R7 increment 1: above about M0.95 an *airfoil* fin was billed more leading-edge drag
than a *square* one, so the cross-section what-if told a flyer that streamlining their fins costs
apogee. Pre-existing; the per-set split is what made it reachable on a mixed design.

**Everything this run shipped is MERGED and serving.** Production was checked, not assumed:
`https://loft.fusionspace.co/flight` returns a real page titled *Flight — Loft*. Two pull requests,
#102 and #103, both merged on green CI (which runs the real-design corpus and the accuracy census).
A third increment is on the branch awaiting its pull request — see the end of this file.

## The arc so far

| milestone | state |
|---|---|
| R1 — address components by identity | SHIPPED 2026-07-30 |
| R2 — delete a component, and undo it | SHIPPED 2026-07-30 |
| R3 — add a component | SHIPPED 2026-07-30 |
| R4 — reorder and restack | SHIPPED 2026-07-31 |
| R5 — author a staged rocket | SHIPPED 2026-08-01 |
| R6 — a built design leaves Loft intact | SHIPPED 2026-08-02 |
| P1 — one design system, adopted | SHIPPED 2026-08-02 |
| **P2 — workspaces as routes** | **IN PROGRESS** — increments 1 and 2 of 4–6 shipped 2026-08-02 |
| **R7 — per-set fin drag, and the honest aero the builder needs** | **IN PROGRESS** — written from the after-list AND increment 1 of 3–5 shipped, 2026-08-02 |
| P3–P5 | NOT STARTED |

## This session (2026-08-02)

Baseline before anything changed, all four green: lint 0 errors / 1 warning (the standing `setDraft`
one), **950 unit**, build, **e2e 178 + 14 = 192**, corpus **35 design files, 14/14**. Nothing
inherited was red.

### P2 increment 1 — the workspaces became routes

`/flight`, `/design` and `/analyze` are three real static routes behind one navigation spine. The
fragment (`/#design`) and the `Tabs` tablist are gone; `DESIGN.md` §5 rules `Tabs` out for exactly
this case ("not for navigation between jobs; that is a route").

What a flyer gets that they did not have: an address per workspace that survives a bookmark and a
paste; Back and Forward that mean what they say; a per-route `<title>`; and **one precached document
per workspace** — the service worker went from 6 routes to 9.

**The load-bearing decision, recorded in `ROADMAP.md` under *Decisions taken without the owner*:**
the workspaces are mounted in the route-group LAYOUT (`app/(app)/layout.tsx`), not in the route
pages. A Next layout is not remounted when the flyer moves between the routes under it, so the
design, the undo stack, a running Monte-Carlo and a RocketPy cross-check all survive a navigation.
The obvious shape — a panel per `page.tsx` — unmounts them, and **none of those four results is
persisted anywhere**: `MonteCarlo`, `MotorSweep`, `ParameterSweep` and `RocketpyCrossCheck` each hold
their result in a plain `useState`, which is why `ResultsView` has kept panels mounted-and-hidden
since it was written. That shape becomes available once those are hoisted; until then it would trade
the milestone's own *"the design and its results survive moving between them"* clause for tidier
files.

**The mechanical cost, measured before starting: 262 `getByRole("tab", …)` call sites** across four
spec files (smoke 240, rocketpy 10, touch 10, touch-landscape 2). All migrated to `link` +
`aria-current="page"`. Two things the rename must NOT touch: `DataTable`'s rows also use
`aria-selected`, and a blanket replace corrupted one before it was caught.

### What the pre-push review caught that the gate could not

Four adversarial lenses over the diff, no other context. Two of them independently found the same
two defects, and both were real:

- **The header wordmark stranded a loaded design.** `/` and the workspaces share one layout, so
  following the wordmark home does not unmount anything: the design survived while the address
  stopped naming a workspace. The result was the Flight panel rendered under `/`, no spine link
  marked current, the title back to the site's — and the session-save effect, reading the address for
  "where I left off", quietly rewrote Analyze to Flight so the next cold open came back wrong.
- **A transient window inside every load did the same thing.** `setDoc` commits in one tick and the
  route change arrives in a later one, so there is a render where a design is open and the address
  still says `/`. The session-save effect runs in it. Fixed by recording the load's INTENT
  (`lastWorkspace.current = landing`) before navigating, rather than reading the address after.

Both are pinned by *the wordmark cannot strand a loaded design at an address that names no
workspace*, whose second half — reload and check the spine — is the part no amount of looking at the
screen would have shown.

Also from the review, verified — and then **reverted after measuring**, which is the part worth
keeping. The claim was that the router's payloads are never precached, so an offline spine tap falls
back to a document load and remounts the app. The first half is true. The fix was not: a client-side
switch fetches `/analyze/__next._head.txt?_rsc=7h4NYy5eoyMcNlUN` and three siblings, all carrying a
cache-busting query, and the worker's runtime lookup is `caches.match(req)` with the default
`ignoreSearch: false` — so precaching them under their bare paths could never have matched. It would
have shipped 78 cache entries and a comment claiming a benefit it did not deliver, and it tripled the
worker's install-time requests (25 → 103) on a box whose descriptor ceiling already destabilises the
suite. Filed with the trace, and with what IS true: prefetch fetches all four payloads per workspace
on the first online load and stale-while-revalidate caches each under its full URL, so after any
online visit the switch works offline. **Measure the key a cache is actually read by before adding
entries to it.**

And declined, with the reason: `/flight`, `/design`, `/analyze` are `robots: { index: false }` and
are NOT in `app/sitemap.ts`. Their content is the flyer's own design on their own device, so the
prerendered document is empty by construction — a search result titled "Flight — Loft" promising
apogee and plots, landing on an import screen, is a promise the page cannot keep. Still linkable,
bookmarkable and precached; only indexing is withheld.

### R7 increment 1 — each fin set is charged for the edge it actually has

The R-track was dry, so R7 was written from the after-list AND its first slice shipped. Every number
in the milestone was driven this run rather than carried from the ledger.

**There are THREE collapses in the fin drag build-up, not the two `BACKLOG.md` records**, and the
unfiled one is the largest: `aeroGeometry` billed every fin set the DRAGGIEST cross-section present.
Fixed. Over 97 stored simulations on 35 designs — timeToApogee 1.7 → **1.5%**, maxMach 2.1 →
**2.0%**, maxVelocity 2.3 → **2.2%**, optimumDelay 2.7 → **2.5%**, maxAltitude 3.2 → **3.1%**;
deploymentVelocity went the other way, 5.9 → **6.0%**, and is published at its new figure.

**Two things to carry forward, both the kind that would otherwise be re-derived.**

*Per-set SWEEP was written, measured and reverted in the same increment.* It improved no census
median and pushed a real design outside the corpus's agreement tolerance — the same shape as the
area-weighted thickness attempt before it. **Do not simply re-apply it.**

*`03.Three-stage.ork` got worse and that is recorded rather than glossed:* apogee −7.57% → **+10.76%**,
flight time −5.6% → **+10.67%**. Its sweep collapse was partly cancelling its cross-section one and
only one is fixed. In its `KNOWN_ISSUES` entry with both figures.

### P2 increment 2 — Analyze split into Sweep and Cross-check

`analyze` carried three of the five jobs the *done when* names, while the two surfaces that belong
beside its second solver sat in the FLIGHT panel a workspace away. Now `/sweep` (the two sweeps and
the dispersion) and `/validate` (the file's own stored numbers, its step-by-step flight, and the
independent solver). North Star #1 asks for independent estimates side by side; they could not be
side by side while they were on different routes.

**Driven on the built export, not asserted:**

| route | title | desktop depth | phone depth | controls under 44 px |
|---|---|---|---|---|
| `/flight` | Flight — Loft | 3.2 screens | 6.6 | 0 |
| `/design` | Design — Loft | 3.4 | 6.9 | 0 |
| `/sweep` | Sweep — Loft | 2.0 | 4.1 | 0 |
| `/validate` | Cross-check — Loft | 1.8 | 3.5 | 0 |

Zero horizontal overflow on all four at 390 px. **And the load-bearing claim, verified by driving
it: a Monte-Carlo left running survives a round trip to another workspace and back.** That is the
whole reason the design is mounted in the layout rather than in the pages.

**Flight and Design at ~7 phone screens is the honest bad number here** — `DESIGN.md` §8 wants at
most two to the answer. Splitting Analyze halved the two it split and left those two untouched.
Filed in `BACKLOG.md` for P4 with the measurement.

## What the pre-push reviews caught, across three of them

The single most valuable habit this run. Three reviews, ten agent-lenses, and the pattern is worth
naming: **most of what came back was false prose I had written, not broken code.**

- a burnout regression guard I "re-centred" had in fact been **widened nine-fold**, behind a comment
  asserting that re-centring is not loosening — and both of that comment's justifications were
  arithmetically false (a booster/sustainer swap fails 2 of 4 assertions, not 4);
- `/docs/validation` said outdated stored runs agree "about as well" as current ones at 3.3% against
  2.1%. Re-measured: **3.7% against 2.0%**, i.e. they agree LESS closely, and the old text understated
  the gap on exactly the runs that page flags;
- "22 of the 35 designs have one fin set" — 20 do, 2 have none, 28 are unaffected;
- `lib/model/types.ts` and `lib/model/edit.ts` both still described a rounded fin edge as "roughly
  halving" square stagnation drag, which is the model the solver explicitly rejected and documents
  rejecting;
- and the checks that had quietly stopped being able to fail: a unit census asking for
  `div[role=tabpanel]` after the panels became regions (so it censused the whole document three
  times and called it three workspaces), a touch scan still selecting `[role=tab]` (so the app's
  primary navigation was measured in neither dimension), and six one-shot reads racing a navigation.

**The third review, on the workspace split, is the one to read if you take only one.** It found that
the FAQ I had just rewritten sent a flyer to the wrong workspace for the second solver; that a staged
design got a BLANK Cross-check workspace because the notice explaining the solver's absence stayed
behind on Sweep; that `/analyze` — an address shipped that same morning and advertised as
bookmarkable — now answered with the 404 page; that nine `Validation` absence guards had become
vacuous because `getByRole` skips hidden subtrees; that the accessibility audit and the touch scan
had each lost a workspace; and that the migration hinge for the whole split (`RETIRED`) had no test
at any level. All fixed. `/analyze` is now a real route that forwards, and says so rather than
flashing.

**A blanket replace corrupted an unrelated assertion, twice.** `aria-selected` on `DataTable` rows in
one pass, and `toHaveCount(3)` → `4` on a parts-table row count and two diagram-handle counts in
another. Caught the second time only by running the control against the pre-change build. **After any
mechanical rename across the suite, list every site it touched and read each one.**

## Read this before trusting a red e2e run

**`npm run test:e2e` fails 2–8 tests on this box for a reason that is not the product.** The suite
serves `out/` with `npx serve`; partway through a full run the server dies with `EMFILE: too many
open files` and every test still to start fails on `ERR_CONNECTION_REFUSED`. `ulimit -n` is at its
4096 hard cap and cannot be raised. **Shard it** — `npx playwright test --shard=1/2 && npx playwright
test --shard=2/2` — each shard gets its own server and therefore its own budget. This session:
**97 + 96 = 193 passing, 0 failed.** CI is unaffected.

**Grep for `failed`, not for `passed`.** And when a trailing block of tests fails together with
`EMFILE` in the server output, that is this — not a regression to chase.

## What this session learned that is worth keeping

- **A workspace switch is a NAVIGATION now, not a `setState`.** Three e2e tests failed on this and
  none of them was a product bug: they read `page.url()` or scraped `innerText` in the tick after a
  click. `await page.waitForURL(…)` before any one-shot read. `expect(locator)` assertions retry and
  were all fine — 172 of 175 needed no change.
- **The static export is served as DIRECTORIES.** The address is `/design/`, with the trailing slash,
  so `waitForURL("**/design")` never matches and `pathname` comparisons need normalising.
  `workspaceFromPath` in `lib/workspaces.ts` strips it; the specs normalise once at the top.
- **`hidden` means zero width, and the diagram fits itself to its container.** The zoom test measured
  the SVG at **240 px** instead of **1198 px** because it measured during the navigation, while the
  Design panel was still hidden. The product re-fits correctly once visible; the test had to wait.
- **`pkill -f "<pattern>"` matches the shell running it** and killed the whole gate with exit 144.
  This is in the previous handoff, and I walked into it anyway. Use `fuser -k <port>/tcp`.
- **The design-system ratchet is EXACT, and that is the feature.** `PRIMITIVE_ADOPTERS.Tabs` went
  1 → 0 because its only adopter became the route spine, and the suite went red until the table was
  updated in the same commit. Do not treat that as a failure to route around.
- **Tailwind v4 still scans SOURCE for contiguous literals.** The tab bar's class strings moved to
  `lib/ui-tokens.ts` as `NAV_BAR` / `navItemClass` so the tablist and the spine cannot drift apart —
  spelled out in full, never assembled.

## Running the gate without fooling yourself

- **`npm install` first** on a fresh container, then **`npx playwright install chromium` once** and a
  bare `npx playwright test` — do NOT set `PW_EXECUTABLE_PATH`. `@playwright/test` is 1.61.1 and
  manages **chromium-1228**; the sandbox ships 1194. **The installer exits 2 even on success** —
  check `/opt/pw-browsers/` for `chromium-1228` rather than trusting the exit code. Confirmed again
  this session: it downloaded and the suite ran against 1228.
- **Shard the e2e**: `npx playwright test --shard=1/2 && npx playwright test --shard=2/2`.
- **`git commit --amend` is blocked by the permission classifier.** Add a second commit.
- **Never revert a negative control with `git checkout -- <file>`.** Copy the bytes aside and restore
  from the copy.
- `rm -f *-tmp.*` immediately before every gate: eslint lints gitignored root-level probes.
- **A probe under the scratchpad cannot resolve `@playwright/test`.** Put probes in the repo root with
  a `*-tmp.mjs` name (gitignored) and delete them before the gate.
- **`npx vite-node <file>-tmp.mjs`** runs a probe that imports `.ts` modules directly.
- Serve the built export with
  `(setsid npx serve -c e2e-serve.json -l 3100 --no-clipboard --no-request-logging < /dev/null &)`.
  **Do not pass `out` as an argument.**

## Before you trust a sweep

```bash
mkdir -p corpus && for d in openrocket rocksim rasaero rocketpy spacecad; do
  ln -sfn /home/user/loft-fixtures/$d corpus/$d; done
npx vitest run lib/corpus --reporter=verbose --silent=false
```

It must print `imports every design file (35 present)`. **Confirmed this session: 35 files, 14/14.**
The census medians MOVED this run and the published figures moved with them — a sweep now prints
maxAltitude **3.1%**, maxVelocity **2.2%**, timeToApogee **1.5%**, maxMach **2.0%**, optimumDelay
**2.5%**, deploymentVelocity **6.0%**. A session expecting the old 3.2 / 2.3 / 1.7 will read the
improvement as a broken corpus.

**The corpus filenames are NOT the names the ledger uses.** They are prefixed with their provenance:
`corpus/openrocket/openrocket__openrocket-repo-rasaero-threestage__03.Three-stage.ork`. A probe that
opens `corpus/openrocket/03.Three-stage.ork` gets ENOENT, and that reads exactly like a missing
corpus.

## Orchestration, measured

**This box has 4 cores, so a workflow's concurrency cap is 2.** A four-agent fan-out returned all
four in about 18 minutes. **Size a fan-out to 4 agents, not 8.**

**The opening fan-out was worth more than the Sev-1 screen it is nominally for.** The P2 route
reconnaissance predicted the 262-selector cost exactly, named the panel-unmount problem that decided
the whole architecture, and flagged the three-way split `analyze` still needs. The R7 agent found a
collapse nobody had filed and re-measured every number in the ledger. **The competitive probe ran
after the change landed and found what the split COSTS** — see `COMPETITION.md` row 31.

**The pre-push second opinion is not optional.** Four lenses over one diff found two real defects with
193 e2e tests green, and both were the kind a route split creates: state surviving a navigation that
should not have, and an address disagreeing with what is on screen.

## Facts about this codebase that cost time to rediscover

- **`FlightRun`'s scalars are under `result.summary`**, not on `result`.
- **A per-configuration deploy override REPLACES the component's own event AND altitude.**
- **Components nest under `.children`; a `Stage` holds `.components`.**
- **`importDesign` is async**, takes BYTES, handles `.ork`/`.rkt`/`.CDX1`.
- The app now has NINE page routes: `/`, `/flight`, `/design`, `/analyze`, `/docs`, `/docs/faq`,
  `/docs/methods`, `/docs/limitations`, `/docs/validation`.
- **A motor mount is a FIELD on a component, not a component** — on `BodyTube` and `InnerTube`. Twelve
  of the 35 real designs put it on the body tube.
- **`vitest.config.ts` walks `lib/` and `app/` only — NOT `components/`**, in a `node` environment. A
  component's pure logic has to move to `lib/` to be unit-testable.
- **`geom.finCount` and `geom.finThickness` on `AeroGeometry` have no consumers at all** — verified by
  search across `lib/`, `components/` and `app/`. They are dead reporting fields; changing them moves
  no number.

## Pick up first

1. **P2 increment 3 — the persistent design strip (`COMPETITION.md` row 31).** The one thing the
   route split COSTS that the scrolling page did not: `RocketDiagram` is reachable only through
   `GeometryInspector`, which renders only inside `#panel-design`, so a flyer sweeping a fin or
   reading a dispersion loses sight of the airframe both are about. All three desktop competitors
   keep a view of the rocket on screen across their tabs — verified from OpenRocket's own
   documentation (its Rocket Views Pane is a separate section BELOW the task tabs), the RockSim
   program guide and the RASAero II manual. `app/(app)/layout.tsx` is the right home because it does
   not remount.

2. **P2's remaining *done when* clauses.** The static-export assertion is not written (assert
   `out/flight/index.html` and friends exist, and that the sitemap and `robots` agree with
   `lib/workspaces.ts`). And "no route more than two screens deep to its primary answer" has been
   MEASURED but not pinned — the numbers are in the table above and in `BACKLOG.md`.

3. **R7 increment 2 — the thickness-ratio collapse**, which is the one of the remaining two that has
   no failed attempt behind it. `finThicknessRatio` is the largest thickness on the rocket over the
   LAST set walked's mean chord: on a two-set design whose sets are both 0.50 it reads 1.00. Per-set
   SWEEP is the other one and it has already been tried and reverted twice by two different routes —
   read `ROADMAP.md` before touching it.

4. **`runFromDocument` drops nine of `runFlight`'s options** (`lib/sim/run.ts:242`), so the corpus
   suite cannot measure drag sensitivity at all: `dragScale` 0.1 and 3.0 both leave
   `03.Three-stage.ork` at exactly −7.57%. Nothing user-facing depends on it, but it is R7's own
   instrument and it is broken. Small, and it unblocks measuring the two remaining collapses.

5. **`Section` still has ZERO adopters** while twelve surfaces hand-roll its exact shape. The largest
   un-taken conversion left, and P2's remaining slices move those surfaces rather than rewriting
   them — cheaper before the remaining splits than after.
