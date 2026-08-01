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

**A published docs page currently overstates the model, and R7's first slice is to fix it.**
`app/docs/methods/page.tsx:347` says the fin `cos²Λ` reduction "uses each fin's actual leading-edge
sweep". Measured this run on real files: it is one design-wide angle. `Mini Honest John.ork` reads
**0.0°** where its working 4-fin set sweeps **44.5°**. Not filed as a Sev-1 (it is a claim about the
method, not a wrong number on a surface a flyer acts on) but it is a false statement on a public
artifact, and it is R7 increment 1, not a someday.

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
| **P2 — workspaces as routes** | **IN PROGRESS** — increment 1 of 4–6 shipped 2026-08-02 |
| **R7 — per-set fin drag, and the honest aero the builder needs** | **WRITTEN 2026-08-02**, not started. The R-track was dry; extending it was the work. |
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

### R7 written from the after-list, and every number in it re-measured

The R-track was dry (R6 shipped), so extending `ROADMAP.md` was the work. R7 is decomposed with
measurements taken **this run**, not carried from the ledger — I drove `aeroGeometry` over the corpus
myself rather than trusting the fan-out:

| design | per-set | what the model uses |
|---|---|---|
| `Show-off.CDX1` | t/c 0.500, 0.500 · airfoil, square | t/c **1.000** · **square** |
| `Mini Honest John.ork` | sweep **44.5°**, 0.0° | **0.0°** |
| `03.Three-stage.ork` | rounded, rounded, square, rounded, square | **square** (3 rounded sets billed square) |
| `Pods--airframes and winglets.ork` | t/c 0.297, 0.038, 0.062, 0.041, 0.041 | t/c **0.122** |
| `Complex.Two-Stage.CDX1` | all six square | square — **unchanged by the fix** |
| `The Red Hunter.ork` | both square | square — **unchanged by the fix** |

**There are THREE collapses, not the two `BACKLOG.md` records.** The unfiled one — the draggiest
cross-section present is billed to every set — is also the largest and the cheapest to fix, and it is
exactly value-preserving on the two designs the reverted area-weighted attempt regressed. That is
R7's first slice.

**R7's own instrument is broken and this blocks measurement, not shipping.** `lib/sim/run.ts:242` —
`runFromDocument` forwards only `configId`/`overrides`/`validateAgainst` to `runFlight` and drops
`dragScale`, `geometry`, `ballistic`, `timeStep`, `ballastKg`, `motorSwap`, `massScale`,
`thrustScale`, `recoveryCdScale`. The corpus suite drives that function, so no corpus-level drag
sensitivity is measurable through it. Nothing user-facing is affected (the app calls `runFlight`
directly).

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

1. **R7 increment 1 — per-set fin cross-section, and make the methods page true.** The measurements
   are in `ROADMAP.md`, the code is `lib/sim/aero.ts:343,523,640-663`, and the change is to accumulate
   fin frontal area PER cross-section class instead of billing every set the draggiest edge present.
   Value-preserving on `Complex.Two-Stage.CDX1`, `The Red Hunter.ork` and all 22 single-set designs;
   the design it moves is 7.57% low on apogee, so it moves toward zero. Needs no new source — the
   code already cites a model that is defined per fin set.

2. **P2 increment 2 — split `/analyze` into `/sweep` and `/validate`.** Three of the five jobs the
   *done when* names still share one route, and "validate/cross-check" is currently split across two
   panels: `ValidationPanel` and `DragCrossCheck` sit inside the FLIGHT panel while
   `RocketpyCrossCheck` sits inside Analyze.

3. **P2 — the persistent design strip (`COMPETITION.md` row 31).** The one thing the split COSTS that
   the scrolling page did not: the drawing is reachable only from `/design`, while all three desktop
   competitors keep a view of the rocket on screen across their tabs. `app/(app)/layout.tsx` is the
   right home because it does not remount.

4. **`Section` still has ZERO adopters** while twelve surfaces hand-roll its exact shape. Measured
   again this run. The largest un-taken conversion left, and P2 moves those surfaces rather than
   rewriting them — so it is cheaper to do it before the remaining splits, not after.
