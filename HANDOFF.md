# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Read this first

**The Playwright browser this repo manages was NOT present in the sandbox, and the whole e2e suite
failed until it was installed.** Measured 2026-08-02: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` is
set by the environment, `@playwright/test` 1.61.1 wants **chromium_headless_shell-1228**, and the
directory did not contain it — every test died with `Executable doesn't exist`, which reads as 200
real failures rather than a missing binary. `npx playwright install chromium` fetched it (~114 MB,
about a minute, through the proxy) and the suite went green. **This belongs in the environment setup
script**; it is paid for again every session until it is. Do not reach for `PW_EXECUTABLE_PATH` —
that is what silently runs the suite against the wrong revision.

**And do not run two e2e shards concurrently.** Both back onto one `serve` process and one port, so
overlapping runs report unstable counts (100, then 86, then 31 passed) with no failure line and a
"did not run" list that looks exactly like the file-descriptor exhaustion `MAINTAINING.md`
documents. It is not that. Run the shards sequentially and the counts are stable at 100 + 100.

**The sibling repo is owed four wording changes, for the SIXTH run running, and it is an OWNER fix.**
`add_repo` for `nrdptel/fusionspace-debrief` is still refused by the harness's permission classifier.
`DESIGN.md` §10 makes a change to one copy a change to both **in the same run**, so every wording
owed to that file stays unmade rather than creating the divergence the invariant forbids. The four
are listed in `BACKLOG.md` unchanged. **A session created with both repos attached clears all four in
one commit each.**

**`BACKLOG.md`'s Sev-1 count is ZERO at the end of this run** — one was found and fixed (below), and
the next-worst known correctness item (the optimum delay computed for the wrong vehicle when a
what-if is set) is filed with its numbers rather than left in anyone's head.

**Everything this run is MERGED except one pull request.** #107 and #108 and #109 are on `main` and
deployed; the dispersion-filter hardening is the only thing pending, on the working branch. Production
was checked rather than assumed: all eight routes 200, and `/docs/limitations` serves this run's text.

**The run's own worst moment, kept because it is the transferable lesson.** P2's two-screen clause was
declared met, the `test.fail` pinning it deleted, and `ROADMAP.md`, `HANDOFF.md` and `COMPETITION.md`
all updated to say so — on a measurement taken with `pointer: fine`. `e2e/depth.spec.ts`'s phone was a
phone-sized viewport over `devices["Desktop Chrome"]`, so every `TOUCH_TARGET` control rendered 26 px
instead of 44 and the shared chrome came out **97 px short**, in the direction that makes the app look
like it passes. The adversarial diff review caught it; the marker went back with the true figure; and
the clause was then closed for real on a coarse pointer. **Any viewport-based contract in this repo
must set `hasTouch` from the first line it is written.**

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
| P2 — workspaces as routes | SHIPPED 2026-08-02 — all five clauses met and pinned. `/sweep` closed at **1.90 screens on a coarse pointer**, after a false close at 914 px on a fine one that is documented in `ROADMAP.md` rather than quietly fixed |
| **R7 — per-set fin drag, and the honest aero the builder needs** | **IN PROGRESS** — increments 1–5 of 3–5 shipped. Increment 4 FOUND the under-drag increment 3 sent it looking for (a bare mould-line step) and deliberately did not charge it, for a sourced reason; increment 5 was a Sev-1 on the same surface |
| **P3 — a stranger's first five minutes** | **IN PROGRESS** — increment 1 of 3–4 shipped 2026-08-02: the cold-load walkthrough exists and found two real gaps, both fixed |
| **R8 — component and material catalogues** | **IN PROGRESS** — decomposed with its licence question settled, and increment 1 shipped: every fin shear modulus now cites a source, and two were wrong (basswood by 3×) |
| P4–P5 | NOT STARTED |

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
