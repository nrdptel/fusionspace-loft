# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Read this first

**The sibling repo is owed three commits, for the FOURTH run running, and it is an OWNER fix.**
`add_repo` for `nrdptel/fusionspace-debrief` was refused by the harness's permission classifier again
on 2026-08-01. `DESIGN.md` §10 makes a change to one copy a change to both **in the same run**, so
every wording owed to that file stays unmade rather than creating the divergence the invariant
forbids. Three are queued, all in `BACKLOG.md`:

1. §9's shell block still says `grep -roh '\btext-lg\b'` while the executable check moved past it;
2. §5's "everything below lives in `components/ui.tsx`" now has two documented exceptions —
   `buttonClass` (a server component cannot call into a `"use client"` module) and `DataTable` (it
   needs `DownloadCsv`, which imports `Button`, so putting it in `ui.tsx` makes a cycle);
3. a hand-rolled-`<button>` grep and a stylesheet-value type check, to match the two ratchets added
   2026-08-01.

None is a divergence in BEHAVIOUR — every count agrees — but the prose drifts a wording at a time.
**A session created with both repos attached as sources clears all three in one commit each.**

**`BACKLOG.md`'s Sev-1 count is ZERO at the end of this run.** Two were found and both are fixed.

## The arc so far

| milestone | state |
|---|---|
| R1 — address components by identity | SHIPPED 2026-07-30 |
| R2 — delete a component, and undo it | SHIPPED 2026-07-30 |
| R3 — add a component | SHIPPED 2026-07-30 |
| R4 — reorder and restack | SHIPPED 2026-07-31 |
| **R5 — author a staged rocket** | **SHIPPED 2026-08-01** — every clause of the *done when* reachable and pinned |
| **R6 — a built design leaves Loft intact** | **NOT STARTED — this is the next R-track milestone** |
| P1 — one design system, adopted | **IN PROGRESS** — one clause left, named below |
| P2–P5 | NOT STARTED |

## Shipped this session (2026-08-01)

Baseline before anything changed, all four green: lint 0 errors / 1 warning (the standing `setDraft`
one), **923 unit**, build, **187 e2e** (sharded 94 + 93), corpus **35 design files, 12/12**. Nothing
inherited was red.

**Thirteen increments across three pull requests.** #97 and #98 are MERGED and serving; #99 carries
the last four.

| PR | increments | state |
|---|---|---|
| **#97** | Sev-1: a cluster no longer multiplies an airframe's mass; Sev-1: the cluster field writes only the mounts it describes; 14 buttons onto `Button` + the ratchet; the review's four fixes | **MERGED** `cf6e2d1` |
| **#98** | `MotorSweep` and `GeometryInspector` onto `DataTable` (+4 primitive gaps); the touch contract keyed on pointer, not viewport; the cluster hint's scope; `COMPETITION.md` 27–29 | **MERGED** `ebc6d6b` |
| **#99** | **R5 shipped** (author a motor mount); the fin picker onto `Segmented`; `NumberField` brought up to `Num`'s standard; the docs type scale + a stylesheet-value check | **OPEN**, green at last check |

*Re-derive rather than trust this table:* `git log --oneline origin/main..HEAD` and
`mcp list_pull_requests state=open`.

## The two Sev-1s, and the lesson under both

Both were the motor **cluster count**, and neither needed an authoring gesture — the "Motor cluster"
field has always been offered on every design with a mount, so typing a number was the whole
reproduction.

1. **`lib/sim/mass.ts` scaled whatever carried the mount.** Right for an `innertube`; wrong for a
   `bodytube`, which is the airframe. Measured, Motors 1 → 3: `01.One-stage.ork` **+38.7%** dry mass
   and **+39.7 mm** CG; `Parallel booster staging.ork` +74.1% / +96.7 mm; `OR vs RAS Test 1.ork`
   +65.9% / +100.0 mm. CG is what the static margin is measured from. A third defect sat behind it:
   the scale ran AFTER the `overrideMass` check, so a stated 120 g reported as 360 g.
2. **The field read the FIRST mount and wrote EVERY mount.** `Airstart timing.ork` read 1 and
   committing any value flattened its 3-motor airstart. Fixed with the rule the fin fields already
   follow.

**The lesson.** `BACKLOG.md` had #1 filed as *"Not reachable today… only an inner tube or a
minimum-diameter tube ever carries a mount"*. Both halves were false — **12 of the 35 real designs
carry the mount on a `bodytube`**. The claim was made from the type signature and never driven.
**When an entry says "not reachable", the cheapest possible next action is to drive it.**

## Three findings that did NOT survive being driven

Worth as much as the ones that held, because each looked certain from the source:

- **"The analysis panels are a one-way door — a long solve with no `catch`, spinner forever."** All
  three render `ClosePanel` while open. The defect is a missing error state, not a trap. Filed sev2.
- **"`Segmented` and `Tabs` have no keyboard focus ring."** Then, driven: "three different focus
  colours across the app." Both wrong. `app/globals.css` carries the app's one focus rule and it
  reaches every control; the difference was a probe reading `getComputedStyle` **mid-`transition`**.
  Tab the whole page with a settle and every control kind renders `2px solid rgb(99,102,241)`. A
  first version of that "fix" was written and reverted.
- **"10 px text on four docs routes."** They are `<sub>` elements in equations, which the browser
  renders `smaller` because that is what a subscript IS. A floor added on the misdiagnosis was
  reverted.

**Measure the element you think you are measuring, and let the page settle.** Two of the three were
bad probes, not bad code.

## What this session learned that is worth keeping

**Tailwind v4 generates NOTHING for an interpolated class.** It scans SOURCE for literal strings, so
hoisting a variant prefix into a constant means the utility never appears contiguously and no rule is
emitted — the class ships in the served attribute doing nothing. Spell variant prefixes out in full,
and **grep the built stylesheet after touching a token block**. Both dark clauses matter (`.dark` AND
the `prefers-color-scheme` form).

**`not-aria-disabled:` does not cover `disabled`.** `:not([aria-disabled=true])` matches a
`<button disabled>`, and Chromium matches `:hover` on disabled buttons. Gating on one of the two
shipped for exactly one commit and made the diagram's zoom −/+ light up at the ends of their range.

**A `className` cannot re-tint a variant.** `text-zinc-400` beside `ghost`'s own `text-zinc-600` is
dead: both are bare single-class selectors and Tailwind emits `text-zinc-400` FIRST, so the variant
wins however the attribute is ordered.

**A ratchet that excludes FILES excludes more than it means to.** The first hand-rolled-`<button>`
check skipped `ui.tsx` and `DataTable.tsx`; only one of the four buttons in that pair is the
primitive. It was also gameable in the milestone's own direction. **Exclude by BEHAVIOUR, per
element** — here, "its opening tag takes its class from `buttonClass`".

**A check that matches class NAMES cannot see a stylesheet.** `.prose-loft` declared three off-scale
font sizes on all six docs routes while `offScaleType` read 0. The executable copy now reads declared
VALUES too. **The same blind spot still covers colour**: `app/globals.css` restates the neutral ramp
in raw hex at seven sites, and nothing counts it.

**`npm run build` does not type-check the test files.** A type error sat in `lib/model/edit.test.ts`
with the whole gate green. `npx tsc --noEmit` catches it and the gate does not run it — worth adding.

**A negative control's BUILD exit is the control.** Used five times this run; one control did not
compile and the suite silently re-tested the previous good export and "passed".

## Running the gate without fooling yourself

- **`npm install` first** on a fresh container, then **`npx playwright install chromium` once** and a
  bare `npx playwright test` — do NOT set `PW_EXECUTABLE_PATH`. `@playwright/test` is 1.61.1 and
  manages **chromium-1228**; the sandbox ships 1194. **The installer exits 2 even on success** —
  check `/opt/pw-browsers/` for `chromium-1228` rather than trusting the exit code.
- **Shard the e2e**: `npx playwright test --shard=1/2 && npx playwright test --shard=2/2`. 95 + 95.
- **`pkill -f "<pattern>"` matches the shell running it** and kills your own background job (exit
  144). Seen twice. Use a pattern that cannot match the invoking command line.
- **`git commit --amend` is blocked by the permission classifier.** Add a second commit.
- **Never revert a negative control with `git checkout -- <file>`.** Copy the bytes aside and restore
  from the copy.
- `rm -f *-tmp.*` immediately before every gate: eslint lints gitignored root-level probes.
- **A probe under the scratchpad cannot resolve `@playwright/test`.** Put probes in the repo root with
  a `*-tmp.mjs` name (gitignored) and delete them before the gate.
- **`npx vite-node <file>-tmp.mjs`** runs a probe that imports `.ts` modules directly. Plain `node`
  cannot, and `vite-node -e` does not work — it must be a file.
- Serve the built export with
  `(setsid npx serve -c e2e-serve.json -l 3100 --no-clipboard --no-request-logging < /dev/null &)`.
  **Do not pass `out` as an argument.**

## Before you trust a sweep

```bash
mkdir -p corpus && for d in openrocket rocksim rasaero rocketpy spacecad; do
  ln -sfn /home/user/loft-fixtures/$d corpus/$d; done
npx vitest run lib/corpus --reporter=verbose --silent=false
```

It must print `imports every design file (35 present)`. **Confirmed this session: 35 files, 14/14**,
census medians unmoved (maxAltitude 3.2%, maxVelocity 2.3%, timeToApogee 1.7%).

## Orchestration, measured

**This box has 4 cores, so a workflow's concurrency cap is 2.** An eight-agent fan-out at session
start returned **2 results in 45 minutes** and the rest starved, with two transcripts stopping
mid-run and nothing recorded. **Size a fan-out to 4 agents, not 8.** A four-agent relaunch returned
all four. The two that did return from the first were worth the whole exercise: both Sev-1s came out
of one of them, and the P1 table-conversion plan predicted the exact e2e selectors that broke.

**The pre-push second opinion found a regression the full gate could not.** Four lenses over one diff
turned up six things, one a real visual regression I had shipped and one a structural hole in the
check I had just written. 187 e2e tests were green across both. **The gate does not measure hover
states or the meaning of a metric.**

## Facts about this codebase that cost time to rediscover

- **`FlightRun`'s scalars are under `result.summary`**, not on `result`.
- **A per-configuration deploy override REPLACES the component's own event AND altitude.**
- **Components nest under `.children`; a `Stage` holds `.components`.**
- **`importDesign` is async**, takes BYTES, handles `.ork`/`.rkt`/`.CDX1`.
- **The session persists across a reload**, so a second `page.goto("/")` restores the design and the
  import panel is not rendered at all.
- The app has SIX page routes: `/`, `/docs`, `/docs/faq`, `/docs/methods`, `/docs/limitations`,
  `/docs/validation`.
- **A motor mount is a FIELD on a component, not a component** — on `BodyTube` and `InnerTube`. Twelve
  of the 35 real designs put it on the body tube. Any code assuming "the thing carrying a mount is a
  motor tube" is wrong on a third of them.
- **`vitest.config.ts` walks `lib/` and `app/` only — NOT `components/`**, in a `node` environment. A
  component's pure logic has to move to `lib/` to be unit-testable; otherwise an e2e is the only
  instrument. `lib/table-sort.ts` exists for exactly that reason.

## Pick up first

1. **P1's last clause — convert `Num`'s 28 call sites onto `NumberField`.** The reconciliation is half
   done: `NumberField` took the touch minimum and the withhold-at-keystroke rule on 2026-08-01, so it
   is no longer the weaker of the two. What remains is the conversion plus two disagreements —
   `Num`'s label is `text-[11px]` where §3 does not permit it for a field label, and `Num` bakes the
   unit into the label string where `NumberField` has a `unit` prop. **`Num` owns the refusal
   behaviour the SAFETY invariant requires**, so keep the stronger of the two at every point. Sized 2.

2. **R6 — a built design leaves Loft intact.** The next R-track milestone, and R5 just made it more
   urgent: a flyer can now author a motor mount, and `downloadOrk` is known to drop `ballastKg`.
   `COMPETITION.md` row 14 also records that a cluster loses its radial geometry on export
   (`<clusterscale>`, `<clusterrotation>`). A builder whose output loses parts is worse than none.

3. **`Section` has ZERO adopters** while twelve surfaces hand-roll
   `<h2 className="text-xl font-medium tracking-tight">` followed by a description and a body — the
   exact shape §5 names. It is the largest un-taken conversion left after the button and table passes,
   and it is what P2 (workspaces as routes) will move rather than rewrite.

4. **The stylesheet blind spot is only half closed.** The new check reads declared FONT SIZES; nothing
   reads declared COLOURS, and `app/globals.css` restates the neutral ramp in raw hex at seven sites,
   several off §2's ramp. Same shape, same file, same fix.
