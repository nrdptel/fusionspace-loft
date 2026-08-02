# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Read this first

**The environment gave us BOTH repos and NO Playwright browser, again.** `/home/user/loft-fixtures`
was present (link its per-tool directories into `corpus/` and the suite names `35 present`), and
`/opt/pw-browsers` again lacked `chromium_headless_shell-1228`. **`./node_modules/.bin/playwright
install chromium` is the command that works** — it exits 0 and lands 1228 in about ninety seconds.
The previous handoff is right that bare `npx playwright install` is a silent no-op. **This still
belongs in the environment's setup script and is the owner's fix**; it is paid for every session.

**`pkill -f <pattern>` killed my own gate with exit 144, exactly as the previous handoff warned.**
I read the warning and walked into it anyway. Use `fuser -k 3100/tcp`. Leaving this at the top
because it has now cost two sessions.

**`pgrep -af` is worse than useless here** — it matches the harness launcher and dumps its entire
multi-kilobyte argv into the session. Use `pgrep -f <pat> >/dev/null && echo yes`.

**A case-sensitive Playwright name regex turned a pure refactor red, and only in the FULL run.**
Converting the picker's clear control onto the `Button` primitive capitalised its label;
`getByRole("button", {name: /back to the design/})` then matched nothing. It passed in isolation
against the older build minutes earlier. Prefer `/…/i` for any control whose label a refactor could
recase.

**`scripts/check-text-gaps.mjs` earned its keep this run, and detector 1 is a REAL lead, not noise.**
It flagged one new hit in new copy; driving the rendered text in a browser found **two** genuine
missing spaces (`1089catalogued`, `(16 vendor files)— see`). Both were green through lint, unit,
build and e2e, because the defect exists only after the JSX transform. Verify a lead by reading the
RENDERED text, then fix it with an explicit `{" "}`.

**The pre-push agent review found ELEVEN defects in code that had already passed the whole gate**,
including a one-way door. It is not optional and it is the highest-yield fifteen minutes in the loop.
Details below.

## The arc so far

| milestone | state |
|---|---|
| R1 — address components by identity | SHIPPED 2026-07-30 |
| R2 — delete a component, and undo it | SHIPPED 2026-07-30 |
| R3 — add a component | SHIPPED 2026-07-30 |
| R4 — reorder and restack | SHIPPED 2026-07-31 |
| R5 — author a staged rocket | SHIPPED 2026-08-01 |
| R6 — a built design leaves Loft intact | SHIPPED 2026-08-02 |
| R7 — per-set fin drag | SHIPPED 2026-08-02, one *done when* clause undelivered with the reason measured |
| P1 — one design system, adopted | SHIPPED 2026-08-02 |
| P2 — workspaces as routes | SHIPPED 2026-08-02 |
| P3 — a stranger's first five minutes | SHIPPED 2026-08-02 |
| **R8 — component and material catalogues** | **IN PROGRESS** — increments 1–3 of 4–6. The picker ships this run and the catalogue is finally reachable from the app; the wall and the material are increment 4 |
| **P4 — a touch-native builder** | **IN PROGRESS** — increment 1 of 4–6 |
| P5 | NOT STARTED |

## This session — fourth run (2026-08-02)

**Baseline inherited, all measured before anything was changed:** lint 0 errors / 1 standing warning,
**997 unit** across 53 files, build, corpus **35 design files / 21 tests / 0 findings** with the
census medians unmoved from the last run (groundHitVelocity 8.3%, deploymentVelocity 6.0%,
flightTime 3.3%, maxAcceleration 3.2%, maxAltitude 3.1%, optimumDelay 2.5%, maxVelocity 2.2%,
maxMach 2.0%, launchRodVelocity 1.9%, timeToApogee 1.5%), and e2e **105 + 104 = 209 passed, 0
failed** once the browser was installed. **Zero open pull requests at session start** — everything
from the previous run was merged and live, so this run started from a clean `origin/main`.

### R8 increment 3 — the parts picker, and the catalogue is finally reachable

`components/PartPicker.tsx`. 1,089 published body tubes, searchable by number or description,
filterable by vendor or to the design's own caliber. Picking one writes the vendor's outer diameter
and length into `bodyDiameter`/`bodyLength` and the flight moves.

**Three things worth keeping:**

- **The catalogue is the app's FIRST dynamic `import()`**, and the split was verified from the built
  export rather than from intent: the chunk carrying `BT-60` is referenced by **no prerendered
  document**. 85 KB gz against a 343 KB whole-app budget. The service worker precaches everything
  under `_next/static`, so offline is unaffected. **Copy this pattern for the next big table** —
  `lib/motors/catalog.ts` (26.8 KB gz) is still statically imported.
- **A pick sets DIMENSIONS only, and the panel says so.** The wall and the material stay the
  design's own, so the mass is Loft's scaled figure, not the vendor's published weight. The material
  column sits right beside it, so silence there would have read as a claim.
- **The material half cannot use the existing field.** Measured: the catalogue's 39 material strings
  for body tubes have **zero** overlap with `AIRFRAME_MATERIALS`' seven keys, and `airframeMaterial`
  takes a key. Increment 4 needs an edit field carrying an explicit `Material`.

### The Sev-1 — the recovery radius was measuring rockets that were still in the air

Found by the opening fan-out's Sev-1 screen, **reproduced before it was touched**, and it is the
subtlest of this class the repo has hit. `lib/sim/montecarlo.ts` summarised `driftDistance` and
`landingRadiusP95` over EVERY sample while `landingSpeed`/`landingEnergy` beside them had been
filtered to landed flights the previous run.

**Why it survived that fix: a sentinel drift is not a zero.** `simulate` takes `driftDistance` from
the exit position unconditionally, so a flight still descending at the 1,200 s cap contributes how
far downwind it had got — a plausible, smaller number. Reproduced on `Complex.Two-Stage.CDX1` at 5x
recovery size (inside the field's own 0.1–10x range): **0 of 12 samples landed**, the panel correctly
withheld landing speed as "no dispersed flight reached the ground", and printed a **58.0 m median
drift and a 121.4 m recovery radius** beside it. Understated, in the unsafe direction, on the one
figure whose job is to size a recovery area.

Fixed on every surface that presents it — the radius card, the landing scatter, the "covers N of M"
note, the dispersion CSV (which gained a `Landed` column and blanks rather than zeros), and the
single-flight card's `Drift from pad` — plus the limitations page, whose existing passage named only
two figures and is now four. Pinned in `lib/corpus/sweep.test.ts` by CONSTRUCTION rather than by
threshold: re-summarising the landed subset must give the same band and radius as summarising the
whole set, which is only true if the whole-set summary already ignores the un-landed ones. **As a
negative control the old code fails it**, naming the design and the exact figures.

### P4 increment 2 — the hover-only count, 67 → 25

Five files in the shared chrome, and the leverage is that each renders on all six routes the ratchet
walks: five edits paid for forty-two states. The two `opacity-0` + `group-hover:` `opacity-100`
external-link arrows are now always drawn — at opacity 0 they were the only mark saying those links
leave the site, and no touch gesture brings them up. Three `title`s deleted, one of them on a
decorative `aria-hidden` bar that reached neither touch nor assistive tech.

**The Ko-fi link is the general lesson: deletion alone was the wrong fix there.** "Ko-fi" appeared
nowhere else on the surface, so removing the tooltip would have removed the only statement of the
destination. It moved into the visible label instead. A `title` is safely deleted only when its
information is genuinely elsewhere.

**And the trap that would have looked like a fix:** the check matches the class STRING, not the
computed style, so pairing `pointer-coarse:opacity-100` with `group-hover:` `opacity-100` moves the
count not at all — and leaves the defect. Delete the literal.

**The remaining 25 are a different problem and should not be attacked the same way.** All of them
sit on the app chrome above the workspace spine, so each renders on four routes rather than six, and
writing any of them visibly spends the phone chrome ratchet (1060 px, measured 1011 → 49 px) and the
two-screen depth cap at once — the trade increment 1 records making and reverting. The next
increment needs somewhere to put the words, not a shorter string.

### R8 increment 4 — the vendor's wall, stock and weight

The *done when*'s material clause. Measured with the catalogue's own Rocketarium BT-60 (0.533 mm wall
at 782.88 kg/m³): **528.0 g → 342.3 g** on the demo, a 35% change in dry mass.

**Three things it had to get right, and the review found that two of them were wrong first:**

- **A pick is a body-tube FIELD, not a free-standing record.** `withCatalogTube` resolves its target
  through the `bodyTubeId` aim at apply time, so a pick that outlived its aim MIGRATED — removing the
  tube it was made for re-landed the vendor's wall and stock on the primary-tube fallback (411.6 g →
  53.9 g), and merely clicking another tube to READ it moved them there too (305.4 g → 129.1 g), with
  the caption still naming the part. It is now a `targets` entry on that aim. The registry test then
  caught that it also needed an undo label — that guard earning its keep.
- **The vendor's published WEIGHT beats the derived one.** Seven body tubes state a mass and every one
  disagrees with the computed figure by 3–5× (PS-7.5: 589.7 g published, 116.7 g derived). Applied as
  `overrideMass`, which does NOT subsume the subtree — a tube carries its mount, fins and parachute.
- **The solid-rod clamp is reachable from the other side.** A wall ≥ the tube's radius makes
  `mass.ts` clamp the inner radius to 0. No bad data needed: `bodyDiameter` scales the airframe and is
  a sweep axis, so a 48.8 mm pick narrowed under ~17.9 mm crosses it. Refused now.

### The worst thing this run did, kept because it is the transferable lesson

**The increment-4 measurement recorded in `ROADMAP.md` and a commit message was not reproducible, and
nothing in the gate could have told me.** It quoted a 0.27 mm wall and a density of 848.98 — a figure
that appears in NO row of the shipped catalogue. Both the probe and the unit test hand-typed "the
vendor's published figures" rather than reading them out of the data, so the numbers were internally
consistent, passed every check, and described a part that does not exist. The real BT-60 is 0.533 mm
at 782.88, and the corrected figure is 342.3 g rather than 344.4 g.

**The fix is structural, not a corrected number:** the test now resolves the part through
`findParts`/`materialOf` at run time and asserts against what it read, so a hand-typed figure cannot
be asserted against again. `MAINTAINING.md` already says "measure, don't remember" about the repo's
own state — this is the same failure about the repo's own DATA, and it is easier to walk into,
because a hand-typed constant looks exactly like a measured one three weeks later.

The same review also found that the e2e's "the mass moved" assertion was a verbatim duplicate of a
caption check three lines above it and could never fail. **Two of the four pre-push reviews this run
found a tautological or unreproducible check rather than a code defect** — that is worth knowing
about what the review is FOR.

### The sibling repo is ATTACHABLE now, and that clears a six-run blocker

`add_repo` for `nrdptel/fusionspace-debrief` **succeeded this run** — the previous five handoffs
record it being refused by the permission classifier, and every `DESIGN.md` wording change owed to
the sibling has been held back since, because §10 makes a change to one copy a change to both in the
same run. It is cloned at `/home/user/fusionspace-debrief`.

**They had diverged 103 lines, Debrief's was AHEAD in three places, and they are now BYTE-IDENTICAL.**
Its §9 block had strictly better greps, and the difference was hiding real drift in Loft: the spacing
grep listed a handful of off-scale values to hunt for rather than enumerating the scale and
subtracting it, so it could see neither a `gap-*`, nor a half-step, nor anything past its largest
alternative — and **Loft's footer had sat two steps outside the scale on both top margins, reading as
compliant, for as long as that check has existed.** The type grep matched one size name; the card
grep could not survive a trailing space or a `dark:` variant.

**The correction the reconciliation forced is in `lib/design-system.test.ts`'s own comment**, which
said widening the spacing regex "would put the two out of step, and §9 is shared verbatim with the
sibling app". That was exactly backwards — the sibling already had the wider form, so Loft's was the
stale side and widening it CONVERGED them.

**The lesson is not "Loft was behind."** Debrief's adoption grep was the weaker half of the same coin
a run earlier. It is that **a file shared verbatim between two repos cannot be verified from inside
one of them**, so whichever session next has both attached should diff them before trusting either
copy. Both now carry that sentence.

### Where the work is, and what to pick up first

**Four increments, all on `claude/ultracode-maintenance-1wbrx5`, all in pull request #113.**

| SHA | what |
|---|---|
| `4ba6dd9` | R8 inc 3 — the parts picker; the catalogue reaches the app |
| `bdff258` | the Sev-1 — drift and the recovery radius filtered to landed flights |
| `9cef2b6` | P4 inc 2 — hover-only states 67 → 25 |
| `07519af` | R8 inc 4 — the vendor's wall, stock and published weight |

**Pick up first, in this order:**

1. **P4 increment 3 — the remaining 25 hover-only states, and it needs a DESIGN idea rather than more
   deletions.** All 25 are on the app chrome above the workspace spine (Undo/Redo's disabled reason,
   the design-name field, Download .ork, the motor-match badge, the stability `<abbr>`), so writing
   any of them visibly spends the phone chrome ratchet (1060 px, measured 1011 → 49 px of headroom)
   and the two-screen depth cap at once. Somewhere to PUT the words is the increment.
2. **R8 increment 5 — the other four kinds.** Nose cone, coupler, centring ring and parachute cannot
   be authored by `AddedPart` at all today, so "any of five kinds" is four new build paths, not one.
   The parachute is hardest: the model requires `cd`, the catalogue has no such field, and only 21 of
   151 canopies state a mass.
3. **Reconcile the two `DESIGN.md` copies — now possible for the first time in six runs.** See below.

### What the pre-push reviews caught that the whole gate could not

Twice, and both times on code that had already passed lint, unit, build and e2e.

- **On the picker, ELEVEN findings, one a one-way door.** The provenance record was not in
  `INERT_EDIT_FIELDS`, so a pick whose two fields were later blanked left the design pristine but
  still reading as edited — stored-tool comparison withheld, the picker's own clear control already
  unmounted, and nothing on the panel able to clear it. It survived a reload, because the bag is
  persisted unfiltered. Also: a fixed-precision table disagreeing with the field it writes on 642 of
  1,089 tubes; a `failed` flag that latched forever under copy promising a retry; index-bearing row
  keys remounting 1,089 rows per keystroke; a provenance line quoting 16 vendor files when 12 carry
  a body tube; an unnamed `<th>`; CSV accessors emitting metres under mm/in headers.
- **On the Sev-1 fix, a NaN I had just created.** Withholding the radius made `Scatter`'s
  `Math.max(radiusP95, ...points, 1)` NaN, so the SVG would have carried `r="NaN"` and the caption
  read "circle = 95% within NaN m". The scatter now has the empty state `DESIGN.md` §5 requires.
  **Withholding a value is a change to every consumer of it**, and this is the second time that has
  bitten on this exact pair of figures.

## This session — third run (2026-08-02)

Three commits on the working branch, none merged yet. Baseline inherited: lint 0 errors / 1 standing
warning, **983 unit**, build, corpus **35 design files 18/18** — and e2e **RED**, 208 failures, all
of them the missing browser above rather than a defect.

### R8 increment 2 — the component catalogue (`ebbb9ab`, hardened by `1f38898`)

`scripts/gen-components.mjs` parses the vendored Apache-2.0 openrocket-database (16 `.orc` files,
2.2 MB, `lib/components/orc/`) into `lib/components/catalog.ts`: **3,445 parts** from fourteen
manufacturers, normalised to SI, 82 KB gzipped. It reuses `lib/ork/xml.ts` — the same parser that
reads a flyer's design — via Node 22's type stripping, rather than carrying a second XML
implementation. `lib/components/db.ts` is the query API; `THIRD-PARTY-NOTICES.md` carries the
Apache grant, sixteen retained copyright notices and the statement of modifications.

**Nothing in the app imports it yet, so the bundle is unchanged. The picker is increment 3, and it
is the next R-track work.**

Three properties of the source data are load-bearing and all were measured: a material's unit comes
from its `<Type>` and never from `UnitsOfMeasure` (six SURFACE rows declare `g/m2` while carrying
kg/m²); six material names are defined more than once with different densities; 113 part numbers
collide across manufacturers and 21 within one, so `findPart` refuses to guess. Six entries are
refused outright — `Paper, bulk` at 0.0011 kg/m³ in two files (referenced by 18 real parts), an
elastic cord typed BULK, three parts with a bore wider than their outside, and one nose cone with
4.250 in of wall on a 0.974 in body.

### The Sev-1: landing speed was measuring the weather (`a4abebb`)

`groundHitVelocity` was `mag(state.vel)`, the full speed over the ground, so under a canopy it
carried the wind. Every consumer means the vertical descent rate — the 25/35 ft/s rules of thumb,
the per-section landing energy a waiver is judged on, and the stored figure in every design file.
On `USLI2025-FULLSCALE-10.15` it read **10.46 m/s at 20 mph against the file's own 5.607**, and the
landing energy built on it was **801 J against 215 J**. The file's five stored runs sit at
5.607–5.610 across 0–20 mph — flat while their flight time and altitude move — which is what
established the convention rather than assuming it.

The drift is separated, not discarded: `groundHitTotalVelocity` shows as "Arrival speed" when wind
makes it materially larger.

**The census figure got worse and that is the point: groundHitVelocity 3.0% → 8.3%, raised rather
than slackened, and said on `/docs/validation`.** The old figure was two errors cancelling — on the
openrocket files Loft's descent rate runs low and the wind term ran high. On the nine stored sims
where wind exceeds 4 m/s the vertical figure agrees to **0.68%** and the total is out by **25.27%**.
The descent-rate gap this exposes is real and is now visible work.

Pinned by a corpus assertion flying all 35 designs at 0/4/9 m/s; as a negative control the old code
names **56 violations** with exact figures.

### Two more Sev-1s, both reproduced before they were touched

**`lib/sim/flutter.ts` — a booster's fins were judged against the speed the SUSTAINER reached after
they were shed** (`f8cc5f7`). Every fin set on `Three stage low power rocket.ork` reported the
identical 77.1 m/s at 95 m, which is the tell. The red 0.68 margin belonged to a fin set shed at
0.86 s; over its own flight it is 2.11. Fixed by passing the realised phase timeline; **it reassigns
warnings rather than suppressing them** — `03.Three-stage.ork` keeps its 0.23 flag because that fin
set really is attached. Pinned over 12 shed fin sets, negative control names six violations.

**`lib/sim/montecarlo.ts` — a dispersion reported landings that never happened** (`ddbed12`). At
`recoveryCdScale: 5`, inside the field's own advertised range, **40 of 40 samples were 0 sentinels**
and the panel read 0.00 m/s and 0.0 J — while `ResultsView` withholds those exact two figures one
route away. Landing stats now come from the flights that landed, the result carries `landedN`, and
the panel withholds with a reason or says "covers N of M flights".

### What is still NOT reproduced

The remaining fan-out findings are filed at the top of `BACKLOG.md` **marked UNREPRODUCED**, with the
filer's numbers. Both Sev-1s above reproduced exactly as filed, so these are worth taking seriously —
but they are still claims. Ranked by claimed damage:

1. `lib/ork/export.ts:568` — a Loft-exported `.ork` re-imports with no stored simulations, so it
   flies a different motor configuration: claimed **52.9 → 317.1 m** on `A simple model rocket.ork`.
   **Reproduce this first**; it is the largest claimed number left.
2. `components/LoftApp.tsx:1347` — "Pick it back up" replays the edit bag onto bytes that already
   contain it: claimed −15% apogee and a duplicated part, from the undo button.
3. `components/LoftApp.tsx:515` — a from-scratch build stops being tracked by its shelf row after any
   reload, which also disables motor-swap baking in `downloadOrk`.
4. `lib/sim/simulate.ts:931` — with no liftoff, six summary figures are initialisation zeros printed
   as facts.

Also filed: `lib/weather.test.ts:139` is a **load-dependent red** in the unit gate (5768 ms against
vitest's 5000 ms default) — it went red once here under concurrent load and passes 16/16 alone. That
is the failure mode that teaches a session to re-run until green; give it an explicit timeout.

### Where the work is, and what production is serving

**All nine commits are MERGED and LIVE.** PR #111 merged as `96fcd9f` with both CI jobs green —
including the `frontend` job, which is the one that fetches the real corpus and runs the accuracy
census, so the raised 8.3% figure is validated upstream and not only locally. The deploy landed
about 80 seconds later.

Verified against production rather than assumed, after the deploy: all ten routes on
`loft.fusionspace.co` answer 200, `/docs/validation` serves the **8.3%** figure and the paragraph
explaining why it rose, and `/docs/methods` serves all three of this run's new passages — the two
landing speeds, the stage-attachment window, and the landed-only dispersion band. Before the merge
the same probes returned 0 on every one of them, which is what makes this a measurement of the
deploy rather than a hope about it.

**The working branch was restarted from the merged `main` afterwards**, per the harness rule that a
merged pull request is finished and cannot track new work. Anything after `96fcd9f` is a fresh
change on the same branch name and needs its own pull request.

### The measurement that is now owed to `DESIGN.md`

§9's compliance block should gain the hover-only count that `e2e/touch.spec.ts` now takes. It was
NOT added, because §10 makes a change to one copy of `DESIGN.md` a change to both repos in the same
run and the sibling is not attached here. That is now **five** things owed to the sibling copy, the
other four unchanged from the last five runs. A session created with both repos attached clears all
five.

## This session (2026-08-02)

Three increments, all pushed to the working branch. Baseline inherited green once the browser was
installed: lint 0 errors / 1 standing warning, **961 unit**, build, **e2e 100 + 100 = 200**, corpus
**35 design files, 14/14**, census matching every published figure.

### The Sev-1, and it was in the recovery numbers

The RK4 step bound that keeps an open canopy's stiff quadratic drag stable was gated on
`phase === "descent"`, which is only set after apogee. **Any recovery device opening at or before
apogee was integrated at the flat 0.01 s boost step with no bound at all**, and it diverged:

| design | recovery size | reported |
|---|---|---|
| `FullScaleModelTH.rkt` (ejects 0.5 s pre-apogee at 250 m/s) | 5× | apogee **2.07e13 m** (3.30e2 m at 4×) |
| `Complex.Two-Stage.CDX1` (drogue opens AT apogee) | 10× | ground-hit **7.52e32 m/s**, landing energy **4.00e65 J**, under a confident *hard landing* warning |

Both inputs are inside the `Recovery size (×)` field's own advertised 0.1–10× range, and ground-hit
speed and landing energy are the two numbers a field waiver is judged against. The step now follows
the canopy rather than the clock. **`DESCENT_STEP_MIN` was the second half**: it is a floor ON a
stability bound, so at 0.002 s it capped the bound at λ ≈ 1,390 — which a 10× canopy exceeds above
about 67 m/s, i.e. the floor was binding on exactly the case the bound exists for. Now 2e-4.

Also on that surface: a flight that hits the 1,200 s cap without landing carried
`groundHitVelocity` 0 and `landingEnergy` 0 as **sentinels** and rendered them as fact. A flyer
enlarging a canopy could watch the landing energy fall to 0 J and read it as success. The summary now
carries `landed` and both figures are withheld with the reason.

Census identical to the tenth on all ten metrics — this changed nothing that was not already
diverging. Pinned by a corpus assertion flying all 35 designs at 0.1/2/5/10× (124 flights), driven as
a negative control: with the old step selection restored it names all three divergences and their
exact figures.

### P2 increment 5 — the chrome fix, and P2 is done

The design summary above the workspace spine cost a 390 px phone **508 px** of the 1071 px of shared
chrome every route sits under. Three headline fields stay (apogee, liftoff mass, static margin); the
other seven fold behind a phone-only `Button`, shown outright from `sm:` up. `StabilityTrimHint` and
`FlutterFixHint` stay OUTSIDE the fold — they render only when something is wrong and are the only
place the reasoning behind that flag is written.

**The fold took 157 px out of the shared chrome on all four routes. Desktop unchanged at 773 px.**
§9's counts are unmoved (the control is the `Button` primitive, so the hand-rolled-`<button>` count
stays at 3).

**It did NOT close the two-screen clause, and this file said it had.** The phone context in
`e2e/depth.spec.ts` was a phone-sized viewport over `devices["Desktop Chrome"]`, so it reported
`pointer: fine` and every `TOUCH_TARGET` control rendered 26 px instead of 44 — understating the
shared chrome by **97 px** (914 measured, **1011** on a real coarse pointer). With `hasTouch` set,
`/sweep` sits at **1410 px = 2.12 screens** against 1328, so **82 px are still owed**. The
`test.fail` marker was deleted on the fine-pointer number and is restored with the true one. The
ratchet went 1120 → **1060**, not the 960 that measurement would have justified.

**The remaining 82 px were not the shared chrome.** Increment 6 found them in `/sweep`'s own panel:
its explanatory paragraph is a PITCH, and once the sweep has run the table answers the same question,
so 140 px of prose sat between the flyer and their result. Shown only until the panel opens now.
`/sweep` measures **1260 px = 1.90 screens** on a coarse pointer, 68 px inside the contract. P2 is
done.

**The design strip is NOT done and is deliberately out of P2.** It costs a phone another 130–160 px,
which puts the chrome back over the ratchet just tightened and `/sweep` back over two screens. It is
the P-track's next opening measurement, not a rider on this.

### The optimum delay was computed for the wrong vehicle

`lib/sim/run.ts` recomputes the delay from a recovery-free coast when a design deploys before apogee
— and read `built.input`, the raw build, instead of the flight actually flown. It dropped the
flyer's nose ballast and the thrust/mass/drag scales silently. On `The Red Hunter.ork` the delay sat
at exactly **4.66 s** for ballast 0 through 0.1 kg while apogee fell 258.5 → 147.4 m; the correct
figures are 4.66 / 4.99 / 5.20 / 5.31 / 4.58. Picking a delay is one of the three things this tool
exists to help with.

Pinned by the INVARIANT rather than those numbers — the delay a run reports must equal the delay of
the same run flown ballistic — over 6 early-deploying corpus flights, with the count asserted
non-zero so it cannot pass by finding nothing.

**Why the corpus never caught it: the census flies no what-ifs.** That is worth remembering when
judging what the corpus does and does not protect.

### R8 increment 1 — the fin shear moduli were fourteen uncited numbers, and two were wrong

Flutter speed goes as √G, so it is the most leveraged input in the one output this app produces that
is a safety estimate — and the whole table was "representative engineering figures" under a method
that cites NACA TN 4197 precisely. They turned out to be round US-customary values (3,800 ksi,
89,000 psi, 13,000 psi), i.e. inherited from the hobby fin-flutter literature rather than any primary
document.

**basswood 0.17 → 0.511 GPa (low by 3×)**, balsa 0.09 → 0.138, aluminium 26 → 26.2, titanium
44 → 42.75. Woods from USDA Wood Handbook FPL-GTR-282 ch. 5 as E_L × 1.10 × G_LT/E_L; metals from
MIL-HDBK-5J. Six rows have no published value and now say so in words. Every error ran the same way
— too little stiffness, so a margin reported thinner than it is — which is the right direction for a
safety estimate and still not a number to hand out uncited.

**Densities are the remaining half and are NOT done**; what was measured for them is in `ROADMAP.md`.

### P3 increments 2 and 3 — the caveat goes on the number, and the docs pages get found

`DESIGN.md` §5 requires the `Extrapolated` treatment wherever a number leaves its validated envelope.
Loft raised a transonic caution CARD while the apogee itself rendered byte-identical either way — and
a flyer reading the number does not necessarily read the card. Seven ascent-derived readouts now
carry the marker with its reason; rail-exit and thrust-to-weight deliberately do not, because they
are inside the envelope whatever the flight does later.

Then the three docs pages the milestone names. **Limitations** was linked only from inside the
no-motor notice, so an ordinary flight had no route to it. **Validation** was reachable only when the
file carried stored results — and none of the three bundled samples does, so every stranger's first
run hit an empty comparison whose only content was why it was empty. `ToolUnavailable` gained a slot
for the way forward, which §5 asks of an empty state and the primitive had nowhere to put.

### R7 increment 4 — the under-drag is a bare mould-line step, and it is NOT charged

Increment 3 said "the next slice is not a fin slice; find the drag `Complex.Two-Stage.CDX1` is
missing". It is a **bare step in the outer mould line** — a diameter increase with no transition to
take it over, which `aero.ts` has no term for. The silence was already recorded in two code comments
and on the limitations page and had never been closed. 33 of 115 judgeable joints step, in 13 of 35
designs; 27 of those in 9 designs clear the 0.5 mm notice threshold.

**Charging it fails, and this is now the fourth measured rejection on R7 — read `ROADMAP.md` before
attempting a fifth.** Eq. 3.86 at its abrupt limit (`0.8·ΔA`) takes `02.Two-stage.ork` from agreeing
to **−35.2%** and `Complex.Two-Stage.CDX1` J180T from +4.5% to **−20.8%**. The reason is physical:
0.8 is Hoerner's measured **flat-face** value in clean air, and a step is an annulus inside the
boundary layer of the body ahead of it. So the flight **reports the step and withholds the estimate**.
What would unblock it is a published forward-facing-step coefficient as a function of step height
over boundary-layer thickness; `UNVERIFIED` whether one exists in citable form.

**Two of this file's own recorded numbers were wrong and are corrected in `ROADMAP.md`:** the W2
variant does not reproduce at −4.96% / −13.60% — two independent measurements put it at
**−12.92% / −20.92%** — and the salvaged step list mislabelled the interstage flare (2.750→6.000 in,
not 3.250→6.000) and counted a real charged transition (6.000→6.500) as an uncharged step.

`<UseBooster1>False` is **not** a sustainer-only marker: each `<Simulation>` carries
`<IncludeBooster1>True` and the adapter already reads that. The `liftoffMass=NaN` thread was a probe
bug — there is no such field on the summary.

### What the pre-push review caught that the gate could not

An adversarial read of the diff with no other context found **a wrong number on a public page**: the
limitations page attached the median to the wrong population (11.75 mm is all 33 steps; the 27 above
threshold are 12.70 mm), while three other places in the same change said 12.70 correctly. It also
caught a paragraph the rewrite had deleted that was still true, a second e2e locator that matched two
surfaces while claiming to test one, and three `MouldLineStep` fields with no test holding their
meaning. Its differential test is worth keeping: `mouldLineStep` (singular) and `mouldLineSteps`
(plural) agree on sign and magnitude across every top-level component of all 35 corpus designs and
4,000 generated rockets — 0 mismatches.

### What went wrong, and what it cost

- **A synthetic regression test passed against the broken code, twice.** The first version passed
  `recovery: []`, so no canopy ever deployed; the second deployed one but at 58 m/s, where dt·λ is
  1.04 and RK4 is comfortably stable. Only the negative control caught either. **A regression test
  for a numerical bug has to be shown to fail against the old code**, and for a stability bug that
  means computing the regime it needs to be in rather than guessing a severe-looking input.
- **Overlapping background e2e runs looked exactly like the sandbox's documented descriptor
  exhaustion.** Two shards sharing one port gave 100, then 86, then 31 passed with no failure line.
  Nearly filed as an environment defect; it was self-inflicted concurrency.
- **My own published prose was wrong once and caught by the review, not by me** — the same shape as
  the last two runs (a clean claim the per-population numbers contradict). The check that works is
  re-reading each number against the measurement that produced it.

## This session — second run (2026-08-01)

Four increments, all merged through PR #105. Baseline inherited green.

**A note on the dates in this file.** Entries below say `2026-08-02` for work whose commits git dates
`2026-08-01`; `date -u`, the harness clock and every commit agree on the earlier date. The older prose
is left alone rather than rewritten on a guess, but entries from this run use the date the commit
actually carries. If a later session can settle it, settle it — do not add a third convention.

### P2 increment 3 — the static-export assertion

`scripts/check-routes.mjs`, from `postbuild`. Four claims, each driven as a negative control before
the check was trusted. **A postbuild script rather than a vitest test on purpose:** `npm test` runs
before `npm run build`, so a test reading `out/` would skip itself on a clean checkout, and a suite
that skips prints almost exactly like one that passed.

### R7 increment 2 — `runFromDocument` forwards what it is given

It named three of `RunOptions`' twelve fields and dropped nine silently. `dragScale` 0.1 and 3.0 both
returned the identical −7.57% apogee on `03.Three-stage.ork`; the range is now +175.81% to −36.27%.
This is R7's own instrument, and increment 3 could not have been measured without it.

### R7 increment 3 — the third attempt at per-set fin drag, and why all three failed

Implemented per-set thickness (and then per-set sweep on top), measured, **reverted both**. The
numbers are in `ROADMAP.md` and on `/docs/limitations`. The finding that matters, and the reason this
increment is a measurement rather than a feature:

> A collapsed value is **not** biased in one direction. It lands wherever the last set read puts it,
> so correcting it ADDS drag to some designs and takes it from others — of the twelve it changes, the
> eight with comparable stored results went both ways. What matters is which designs it takes drag
> *from*, and the two the *done when* protects are ones Loft already flies high, i.e. already
> under-dragged from somewhere else. The collapses are partly compensating for a separate under-drag.

So **the next R7 slice is not a fin slice**: find the drag `Complex.Two-Stage.CDX1` is missing. Its
J90W configuration is already a `KNOWN_ISSUES` entry saying RASAero stores nearly the same apogee for
two very different motors and Loft does not reproduce it. Do not re-implement per-set thickness or
sweep before that; it is now three attempts and three reverts.

A hypothesis refuted on the way: the `0.35` `cos²Λ` floor is NOT what breaks that design (its per-set
factors are 0.500/0.640/0.367 against a design-wide 0.640, none floored). The floor still wants a
source; charged per set it binds 15 of 51 fin surfaces across 13 designs, against 8 floored today.

### P2 increment 4 — the two-screen clause, pinned, and a record corrected

`e2e/depth.spec.ts`. See item 2 of the next-session list below for the numbers and the cause — the
short version is that **depth to a route's answer is not page height**, this file had been conflating
them, and the clause was being recorded as failing when three of four routes pass comfortably.

### What went wrong, and what it cost

- **A subagent's headline finding was false on both of its load-bearing premises** and was nearly
  acted on as a Sev-1: it reported the recents shelf's `Remove` as a one-way door breaching a
  `DESIGN.md` 8 px destructive-separation rule. There is no such rule in `DESIGN.md`, and the removal
  is recoverable — `onForgetRecent` deliberately holds the entry and a put-back affordance renders
  from `removedRecents`. Both took about two minutes to check. **Check the premises of a finding
  before its severity**, especially one that would preempt the milestone.
- **A measurement taken at the wrong moment set a ratchet 71 px too tight.** The spine cap was first
  read right after `loadSample` — before navigation settled — giving ≤1000 px when the real figure is
  1071 px on every route. Caught only because the ratchet was re-run across all four routes instead
  of one. Measure the thing where it lives, not where it is convenient.
- **My own prose was false twice and caught by re-reading it against the data**, both times the same
  shape: a clean directional claim ("both collapses over-state fin drag") that the per-design numbers
  contradict (`APEX_K_Dart.ork` goes the other way). Both were corrected before commit. This keeps
  happening; the fix that works is re-reading each numeric claim against the measurement that
  produced it, not re-reading for style.

### What went wrong this run, and what each cost

- **A false claim shipped into three files before the review caught it** (above). The fix that works
  is not "re-read the prose" — it is re-deriving the MEASUREMENT under the conditions the contract
  names, before writing anything down.
- **A regression test passed against the broken code twice.** The first version passed
  `recovery: []`, so no canopy ever deployed; the second deployed one at 58 m/s, where dt·λ is 1.04
  and RK4 is comfortably stable. Only the negative control caught either. **A regression test for a
  numerical bug has to be shown to FAIL against the old code**, and for a stability bug that means
  computing the regime rather than guessing a severe-looking input.
- **Overlapping background e2e runs impersonated the sandbox's documented descriptor exhaustion.**
  Two shards sharing one port reported 100, then 86, then 31 passed with no failure line. Nearly
  filed as an environment defect; it was self-inflicted concurrency.
- **A python dedupe removed the wrong copy**, shipping two headline fields under a comment claiming
  three — and the one that got folded was static margin, the go/no-go number. Caught by review, not
  by the gate, because no check asserted what the strip contains.

### What to pick up first

1. **R8 increment 2** — the component catalogue itself. The licence question is settled and the
   pattern to copy (`scripts/gen-motors.mjs` + a `provenance.json` + an inlined TS module) is named
   in `ROADMAP.md`. This is the biggest single capability available on either track.
2. **The four wording changes owed to the sibling repo's `DESIGN.md`**, still blocked on an owner
   fix — `add_repo` for `nrdptel/fusionspace-debrief` is refused by the harness.
3. **P4 — a touch-native builder.** Already decomposed. Its opening measurement is the persistent
   design strip, which costs a phone 130–160 px against the 68 px of headroom `/sweep` now has.

## Previous session (2026-08-02)

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

**Driven on the built export, not asserted.** These are TOTAL page heights in screens — how far the
document scrolls — **not** depth to each route's answer, which is a different and much smaller
quantity now pinned by `e2e/depth.spec.ts` (see item 2 below). They were labelled "depth" here and
read as a two-screen failure for it; they are not that.

| route | title | desktop page height | phone page height | controls under 44 px |
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

2. **P2's remaining *done when* clause.** Both of the two named here are now done, and the note that
   used to sit here was wrong twice over, so read this before trusting the table above.

   The **static-export assertion** shipped as `scripts/check-routes.mjs`, wired into `postbuild`.
   Note that the assertion this file used to suggest — "assert `out/flight/index.html` and friends
   exist" — would have FAILED against the real export: a workspace's document is `out/flight.html`,
   and `out/flight/` holds only the seven RSC segment files. `check-routes.mjs` accepts either shape
   deliberately; do not "fix" it toward `index.html`.

   **"No route more than two screens deep to its primary answer"** is now pinned by
   `e2e/depth.spec.ts`, and pinning it corrected the record. Depth to the ANSWER is not page height,
   which is what the table above measures and what had been read as a failure. Measured at 390x664
   with the bundled sample: `/flight` 1.53 screens, `/design` 1.55, `/validate` 1.70 — all pass.
   `/sweep` is a real breach at **2.10** and is pinned as a `test.fail`, so it runs, measures, and
   goes red the day it is fixed. The cause is not `/sweep`: it is the **1071 px of shared chrome
   above the workspace spine** (identical on all four routes), which is 1.61 of the two screens
   before any workspace renders. The design summary is 508 px of that. See `BACKLOG.md`.

   What remains of P2 is the **persistent design strip** (`COMPETITION.md` row 31) — and it is not
   free: it costs 130–160 px on a phone, which is more than `/sweep`'s remaining budget. The chrome
   has to come down first or the strip pushes a second route over the line.

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
