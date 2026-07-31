# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Read this first

**`BACKLOG.md`'s Sev-1 count is ZERO, and the "21 open Sev-1" figure a screen produced this run is not
one.** That screen classified ledger entries against the manual's criteria without checking whether any
is *reachable*, and its own top-ranked entry is not: driven through the solver's own path, **35 designs,
113 configurations, 177 recovery devices built, 0** in the state it describes. Several of its other
entries carry `UNVERIFIED by me`. Treat that list as a reading list, not a count — it will be produced
again next session and it will say 21 again. Re-measure before letting any of them preempt a milestone.

**The sibling repo is still owed one commit, for the THIRD run running.** `DESIGN.md` §9's explanatory
note quotes `GeometryInspector` at 9:2 and `MonteCarlo` at 9:4; `ROADMAP.md`'s own increment-4 table says
10/2 and 9/3, and both are now 2:8 and 3:9. §10 says a change to that file is a change to both copies in
the same run, so correcting it here ALONE would create exactly the divergence the invariant forbids —
which is why it is still unfixed rather than forgotten. `nrdptel/fusionspace-debrief` is in the account's
repo list and **`add_repo` was refused by the harness's permission classifier again**. A session created
with both repos attached fixes it in one commit each.

**The queue has two tracks and a run ships from both.** `ROADMAP.md` is the queue; read it first.

| track | state |
|---|---|
| **R — capability** | **R5 — author a staged rocket — IN PROGRESS**, increments 1–2 of 4–6 shipped. Increment 3 is scoped in detail below. |
| **P — product & craft** | **P1 — one design system, adopted — IN PROGRESS**, increments 1–8 shipped. `DataTable` is all that is left. |

## The arc so far

| milestone | state |
|---|---|
| R1 — address components by identity | SHIPPED 2026-07-30 |
| R2 — delete a component, and undo it | SHIPPED 2026-07-30 |
| R3 — add a component | SHIPPED 2026-07-30 |
| R4 — reorder and restack | SHIPPED 2026-07-31 |
| R5 — author a staged rocket | **IN PROGRESS** — inc. 1 (the stage) and 2 (the phase table) shipped |
| P1 — one design system, adopted | **IN PROGRESS** — increments 1–8 shipped; only `DataTable` remains |
| P2–P5 | NOT STARTED |

## Shipped this session (2026-07-31, fourth session of the day)

Baseline before anything changed, all four green: lint 0 errors / 1 warning (the standing `setDraft`
one), **922 unit**, build, **182 e2e**, corpus **35 design files, 11/11**. Nothing inherited was red.

**Pull request #87 was open at session start and is now merged** (`357075e`) — the previous run's two
BLOCKERs, both silent data loss on the from-scratch builder. It was green on that day's `main` and its
diff read correctly, so it was merged rather than rebased. Its `bakeMotorSwap` writes the swap into every
instance of every configuration, which matches what `swapMotor` (`lib/sim/run.ts:107`) already does per
configuration — checked before merging, because that is exactly the kind of divergence it was fixing.

| commit | what |
|---|---|
| `23cc549` | **P1 increment 8 — the off-system radius to 0**, and `app/globals.css`'s print rule retired in the same commit, which is why that slice had to go last. |
| `a874b2b` | The measurements that increment invalidated, corrected in `ROADMAP.md` and `BACKLOG.md`. |
| `c240a28` | **A dark-theme sheet prints as ink on white** — 193 of 369 text nodes were under 3:1. |

## What this session learned that is worth keeping

**The print block had claimed for its whole life to handle "dark-mode colours on a white sheet" and did
not, because nothing measured it.** `color-scheme: light` does not cancel a `dark:` utility, and
`html, body { color }` never reaches an element that sets its own — which every `dark:text-…` does. The
sheet forced a white ground and kept dark text on it: **193 of 369 text nodes under 3:1**, numbers,
labels and warnings alike. Two further traps sat behind it, and both cost a cycle:

- **The dark variant has TWO clauses** (top of `app/globals.css`): a `.dark` class from an explicit
  choice, and a `prefers-color-scheme` media query for everything else. Theme "System" — the default —
  sets **no class at all**, so a fix written against `.dark` alone covers nobody. The first version did
  exactly that and the test's own control caught it.
- **Forcing ink alone made it worse.** Only two selectors whiten containers, so newly-black text landed
  on containers that kept their dark fill: 195 under 3:1, up from 193. The fills have to be cleared with
  the ink — which is what the comment four rules above it already claimed the block did.

**Chromium reports computed colours as `lab()`/`oklab()`, and canvas `fillStyle` does not normalise
them.** A `\d+` match on `lab(2.51107 0.242703 -0.886115)` reads the numbers 2, 51107 and 0 — which
produced a confident average of 17036 for a near-black background, and three successive versions of one
probe that were all wrong in different ways. **Rasterise through `getImageData` and read pixels.** Both
new checks do; anything measuring colour in this repo should.

**A test that cannot fail is worth less than none, and this run built one before catching it.** The new
"no workspace scrolls horizontally once a design is loaded" check first asserted page width only. Its
negative control — the metric tiles repadded to `p-12` — left the page width **unchanged** and the test
green, because a `grid-cols-2` simply shrinks its columns and the numerals overflow their own tiles. The
assertion now asks each tile whether its content fits IT, and fires on six tiles under that control.
**A first version that passes its negative control is a finding about the test.**

**Scope an element-overflow assertion, or it will need excusing on a clean tree.** Sweeping every element
in `main` reports six hits on untouched code, every one correct behaviour: the header's title block is
`min-w-0` precisely so it may shrink and truncate (that IS the fix that took 320 px to zero), a text
`<input>` reports its whole value width, and an SVG `<text>` is not a box. An assertion a session has to
explain away is one it learns to ignore.

**The pre-push review earned its keep again, and its best finding was not the one it ranked first.** It
raised the two notices whose text shade increment 8 had nudged, as a print-contrast `sev1`. Reproducing
it found those two were **2 of 193** — the finding was real and its scope was an order of magnitude off
in the finder's favour. It also caught, independently across three lenses, that `info` mapped to the one
tone carrying no text colour, so the least severe warning rendered in the strongest ink on the page.

**"It is the only site of its kind" was wrong, and the grep could not have told me.** The methods page's
formula block was hand-rolled onto §2 tokens on the grounds that nothing else looked like it. `.eqn` —
defined in `app/globals.css` and used by every other equation in the docs — is the same block, a few
paragraphs up the same article. **§9's checks match class NAMES, so a raw `border-radius: 8px` in the
stylesheet is invisible to them**: the off-system radius count reached zero while `.eqn` was still
rendering 8 px corners on every docs route.

## Running the gate without fooling yourself

Everything under this heading in the previous handoff still holds and was re-confirmed. The points that
mattered most:

- **`npm install` first** on a fresh container, then **`npx playwright install chromium` once** and a
  bare `npx playwright test` — do NOT set `PW_EXECUTABLE_PATH`. `@playwright/test` is 1.61.1 and manages
  **chromium-1228**; the sandbox ships 1194. Confirmed again: 1228 was absent at session start and
  installed in about a minute through the proxy.
- Record each gate step's own exit code; a `{ … } > file` brace group reports only its last command.
- **`git commit --amend` is blocked by the permission classifier.** Add a second commit.
- **Never revert a negative control with `git checkout -- <file>`.** Copy the file's bytes aside and
  restore from the copy. Used three times this session with no loss.
- **A negative control's BUILD exit is part of the control** — the e2e runs against `out/`.
- `rm -f *-tmp.mjs` immediately before every gate: eslint lints gitignored root-level probes.
- **A probe under the scratchpad cannot resolve `@playwright/test`.** Put probes in the repo root with a
  `*-tmp.mjs` name (gitignored — check with `git check-ignore -v`) and delete them before the gate.
- Serve the built export for probes with
  `(setsid npx serve -c e2e-serve.json -l 3100 --no-clipboard --no-request-logging < /dev/null &)`.
  **Do not pass `out` as an argument** — `e2e-serve.json` already sets `"public": "out"`, and adding it
  makes `serve` look for the config inside `out/` and exit.

## Before you trust a sweep

The corpus is gitignored and absent on a fresh container. Both repos are checked out, so no token is
needed — symlink the fixtures repo's per-tool directories into `corpus/`:

```bash
mkdir -p corpus && for d in openrocket rocksim rasaero rocketpy spacecad; do
  ln -sfn /home/user/loft-fixtures/$d corpus/$d; done
npx vitest run lib/corpus --reporter=verbose --silent=false
```

It must print `imports every design file (35 present)`. **Confirmed this session: 35 files, 11/11.**

`FIXTURES_TOKEN` is set and the corpus genuinely gates CI, but **only the `frontend` job fetches it — the
`e2e` job does not**, so an e2e test still needs a committed fixture.

## Facts about this codebase that cost time to rediscover

- **`FlightRun`'s scalars are under `result.summary`**, not on `result` — `result` carries `summary`,
  `trajectory`, `events`, `warnings`, `stability`, `flutter` and friends. A probe reading
  `result.groundHitVelocity` gets `undefined` and dies on `.toFixed`.
- **A per-configuration deploy override REPLACES the component's own event AND altitude.**
  `effectiveDeploy` (`lib/sim/setup.ts:352`) is `altitude: o ? o.altitude : c.deployAltitude` — when the
  override exists there is no fallback, so mutating a parachute's `deployEvent` in a probe does nothing
  on any design that carries `deployConfigs`. Drive `buildRocketDynamics` and read the built device.
- **Components nest under `.children`; a `Stage` holds `.components`.**
- **`importDesign` is async.** `lib/ork/import.ts`, takes BYTES, handles `.ork`/`.rkt`/`.CDX1` alike.
- **The session persists across a reload**, so a second `page.goto("/")` in one e2e test restores the
  design and the import panel — with its sample buttons — is not rendered at all.
- `innerText` throws on an SVG `<text>`; use `textContent`.
- The app has SIX page routes: `/`, `/docs`, `/docs/faq`, `/docs/methods`, `/docs/limitations`,
  `/docs/validation`. `/validation` and `/motors` are 404s.

## Pick up first

1. **R5 increment 3 — per-stage burnout, scoped in detail and with the trap named.** Only ONE burnout
   event is emitted per flight ever: `lib/sim/simulate.ts:677`, guarded on `burnoutV === 0 && t >= burnout`
   where `burnout` is `burnoutTime(motors)`, a `max` over every lit motor. **The trap:** that same
   `burnoutV === 0` guard doubles as the SUMMARY latch two lines below, so emitting per-stage burnouts
   through it silently moves `burnoutVelocity`/`burnoutAltitude` to the booster's — measured on
   `03.Three-stage.ork`, 202.8 m/s @ 787.1 m becomes 44.9 m/s @ 366.6 m, **−77.9%**, and
   `<Stat label="Burnout velocity">` publishes it. Splitting the latch from the emission is the real
   change. `lib/sim/setup.ts:194` already computes `burnoutSep = stageActivation[i] + stageBurnDuration[i]`
   — the per-stage burnout — but `Buildup` (`setup.ts:37`) does not carry those arrays out, so either add
   the field or carry `stageIndex` (already on `Placed`) onto the `ResolvedMotor` literal at `setup.ts:245`.
   Do NOT group by `detachTime`: `setup.ts:226` collapses two stages leaving at one joint onto one value.
   **Where it is a new number:** on the default separation rule a stage's burnout EQUALS its separation
   time, so a Burnout column would restate the "To" column; on the `ejection` rule it does not —
   `Complex.Two-Stage.CDX1` burns out at 2.40 s and parts at 4.40 s, `ARC payload rocket.ork` 1.43 vs
   10.43. That gap is the thing no surface names. Smallest visible slice: the `PhaseTable` Burnout column,
   which shows one real cell from today's single event and fills in once the solver change lands.
   `lib/sim/flight.test.ts:466` takes the FIRST burnout by `find` and will quietly change meaning.
2. **P1's last slice — `DataTable`.** Six bespoke `<table>`s: `MassBreakdown:81`, `ValidationPanel:102`,
   `MotorSweep:342`, `RocketpyCrossCheck:346`, `GeometryInspector:559`, `ResultsView`'s `PhaseTable`. All
   six `<thead><tr>` carry a byte-identical class string and all six sit in an `overflow-x-auto` wrapper,
   so the extraction is mechanical — one increment, not four. **Two traps:** `ValidationPanel` is the only
   non-uniform one (`min-w-[30rem] border-collapse`, right-aligned cells), so the primitive needs a
   column-alignment prop and a min-width escape; and `app/docs/validation/page.tsx:259` is a SEVENTH table
   inside a server route, where a `"use client"` primitive cannot go — size it at six. Sized by
   `COMPETITION.md` rows 24 and 26; row 26 is new this run and says what the affordances must be.
3. **The §9 off-scale-type guard is blind.** It greps `text-lg` alone while `text-[10px]` ×22,
   `text-2xl` ×4 and `text-[9px]` ×3 are live — 29 uses of a seventh, eighth and ninth size passing an
   assertion that asserts zero. Filed in `BACKLOG.md` with the sites. This is the largest known P-track
   body of work after `DataTable`.
