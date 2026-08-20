/** The real-design corpus suite.
 *
 *  Loft's sharpest bug-finder is driving actual in-the-wild design files: every `.ork` and `.rkt`
 *  carries its own tool's stored simulation, so each file is a built-in accuracy oracle. Those
 *  files live in a separate private repository — they are other people's designs, under their own
 *  terms — and are never committed here. This suite runs against whatever corpus is present and
 *  **skips itself when there is none**, so a public clone and a fork's CI stay green.
 *
 *  Point it at a corpus with `LOFT_CORPUS_DIR`, or extract one into a gitignored `corpus/` at the
 *  repo root. The layout is one directory per source tool:
 *
 *      corpus/openrocket/*.ork   corpus/rocksim/*.rkt   corpus/rasaero/*.CDX1
 *
 *  What it asserts:
 *   - every design file imports without throwing;
 *   - where Loft flew the complete design and the file stores results, both the apogee AND the max
 *     velocity agree within `TOLERANCE_PCT` — unless the case is listed in `KNOWN_ISSUES` with a
 *     reason. Apogee alone is not the trajectory: a heavier rocket that also drags less reaches a
 *     similar height on a different flight, so the speed it got there at is what separates accuracy
 *     from two errors cancelling.
 *
 *  A file Loft still gets wrong belongs in KNOWN_ISSUES, parsed and flown but not asserted, so the
 *  gap is documented rather than baked in as correct. Fix the cause, then delete the entry to arm
 *  the assert. Never widen the tolerance to make a case pass.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { importDesign } from "../ork/import";
import { exportOrk } from "../ork/export";
import { resolveMotor, sameCasing } from "../motors/db";
import { runFlight, runFromDocument, overridesFromStored } from "../sim/run";
import { monteCarlo, summarizeSamples } from "../sim/montecarlo";
import {
  flattenRocket,
  leadingFaceDiameter,
  mouldLineSteps,
  STEP_NOTICE_M,
  overallLength,
  maxBodyRadius,
  statedCGBounds,
  canHostInsideMass,
  aftOuterRadius,
} from "../model/geometry";
import type { Rocket, RocketComponent } from "../model/types";
import {
  applyGeometryEdits,
  finStationBounds,
  statedAirframeMass,
  PER_PART_MASS_FIELDS,
  moveTarget,
  moveSlots,
  canAddStage,
  canAddMount,
  stageSeedBase,
  removalRefusal,
  transitionDefaults,
  newPartId,
  boattailBase,
  boattailExitMax,
  boattailFairsToDiameter,
  boattailHost,
  derivedPartId,
  aimEditsAt,
  primaryMassObject,
  primaryNose,
  primaryMotorClusterCount,
  primaryMountGroupIds,
  unreachableMountCount,
  internalPartBounds,
  fittingMaxOuterDiameter,
  fittingUnitMass,
  addOptionsFor,
  ADD_KINDS,
} from "../model/edit";
import { dryMassProperties, localBodyCGx, massByComponent, statedCGReachesDesign, statedMassHolder } from "../sim/mass";
import { spanCeiling, spanToMetres } from "../display";
import { barrowman } from "../sim/aero";

const CORPUS_DIR = process.env.LOFT_CORPUS_DIR ?? resolve(process.cwd(), "corpus");
const TOLERANCE_PCT = 12;

/** Cases Loft does not yet get right, each with why. Keyed `<file>::<simulation name>`; a bare
 *  `<file>` covers every simulation in it. These are flown but not asserted. */
const KNOWN_ISSUES: Record<string, string> = {
  "APEX_K_Dart.ork":
    "Mach 2+ minimum-diameter dart. Above M0.8 the wave-drag model is a bounded parametric " +
    "estimate, not a solved one, and the flight is flagged extrapolated.",
  "OR vs RAS Test 1.ork":
    "Mach 2.3 minimum-diameter N1000. The two reference tools disagree with EACH OTHER by ~60% " +
    "on this design (OpenRocket 45,636 ft vs RASAero 73,409 ft), so there is no single target.",
  "OR vs RAS Test 1.CDX1": "Same design as the .ork above; see that entry.",
  "rocksimTestRocket1.rkt":
    "OpenRocket's synthetic RockSim import-test file. Its stored results don't match its own " +
    "geometry — max acceleration reads 52% off, a pre-deployment number — so it is not a usable " +
    "accuracy oracle.",
  "TubeFins1.rkt::C6-5":
    "Synthetic import-test file whose stored per-part masses weigh the tube fins as solid rods. " +
    "Its apogee happens to land within 6% while max velocity reads 25% and max acceleration 60% " +
    "high — the file flies a much heavier rocket than its own geometry describes, so agreeing " +
    "with its apogee would be two errors cancelling, not accuracy.",
  "Complex.Two-Stage.CDX1::J90W":
    "Two-stage RASAero design, newly flown staged rather than sustainer-only. Its other " +
    "configuration (J180T + I215R) lands at +4.5% apogee and −1.9% max velocity; this one, on the " +
    "long-burn J90W, reads +12.4% and +8.0%. RASAero stores nearly the same apogee for both " +
    "(1326.5 m and 1328.6 m) despite very different motors, which Loft doesn't reproduce. Flying " +
    "the sustainer after separation rather than at booster burnout was tried and made BOTH " +
    "configurations worse (+23.6% and +21.7%), so the timing is not the cause.",
};

/** **Two entries were dropped from `KNOWN_ISSUES` on 2026-08-14, and this records what came with
 *  them.** Both had come inside the ±`TOLERANCE_PCT` the suite asserts, so each was excusing a case
 *  that would have passed — and the nudge above could not say so, because its apogee bar was half the
 *  tolerance and both sat in the gap. Re-measured before removal:
 *
 *  - `Punisher Apprentice.ork::Simulation 10` — apogee **−10.15%**, max velocity **−1.56%**. It was
 *    the largest motor in a nine-simulation sweep; the other eight land within 7.5%. Now asserted,
 *    with **1.85 points** of margin on apogee.
 *  - `03.Three-stage.ork::Simulation 1` — apogee **+10.76%**, max velocity **+4.95%**, flight time
 *    **+10.67%**. Now asserted, with **1.24 points** of margin — the thinnest armed case in the
 *    corpus, and named here so the next run knows how close it is rather than rediscovering it from
 *    a red gate.
 *
 *  **The physical gap behind the second one is NOT closed, and deleting its prose with its entry
 *  would have lost the only record of it.** Three of that design's five fin sets are rounded and were
 *  billed as square (over-drag) until R7's per-set cross-section; its leading-edge sweep is still
 *  collapsed to one design-wide 22.4° against five real sets at 35.0–70.6° (also over-drag). The two
 *  errors were partly cancelling and only one is fixed, which is why R7 made this design's apogee
 *  error WORSE — the one place in the corpus where it did. Making the sweep per-set in that same
 *  increment was measured and reverted: it moved no census median the right way and pushed a real
 *  design outside the agreement tolerance. R7's sweep slice is what closes it.
 *
 *  So the case passes and the model is still approximate, which is exactly the state a passing
 *  assertion cannot express — hence this comment rather than silence. */

/** The per-metric accuracy the Validation page publishes: median absolute disagreement with each
 *  file's own stored results, across every stored simulation Loft flies completely (known issues
 *  included, so it is the honest picture rather than the flattering one). Keep this and the page in
 *  step — the suite prints the current figures, so an improvement is a one-line update to both. */
const PUBLISHED_MEDIAN_PCT: Record<string, number> = {
  // Re-measured 2026-08-02 with R7's per-set fin cross-section. Five of the ten improved and none
  // moved the wrong way: timeToApogee 1.7 -> 1.5, maxMach 2.1 -> 2.0, maxVelocity 2.3 -> 2.2,
  // optimumDelay 2.7 -> 2.5, maxAltitude 3.2 -> 3.1. Tightened here in the same change as the
  // engine and the page, because a claim left at its old, looser figure is a gate that has stopped
  // gating.
  // **groundHitVelocity went 3.0 -> 8.3 -> 2.0, and not one of those moves was the engine.** All
  // three were the same mistake found in three places: Loft's figure and the stored figure were not
  // always the same physical quantity, and nothing recorded which was which.
  //
  //  - 3.0% was two errors cancelling. Loft reported the TOTAL ground speed under a name that means
  //    the vertical descent rate, and its own descent ran low; on `pods--airframes and winglets`
  //    that reads -14.5% vertical but -3.0% total. Reporting the vertical figure honestly took the
  //    census to 8.3% and was the right move.
  //  - 8.3% was still not comparing like with like on two of the three sources. RockSim stores
  //    `<VelocityAtLanding>` as the TOTAL — verified as hypot(X, Y, Z) on 17 of 17 corpus
  //    simulations — so reading `<YVelocityAtLanding>` instead moved the RockSim median
  //    25.7% -> 21.9% (2026-08-04).
  //  - And OpenRocket CHANGED ITS OWN CONVENTION at 24.12. Verified from its source, not inferred:
  //    <= 23.09 `AbstractEulerStepper.java:168` writes `TYPE_VELOCITY_TOTAL` from
  //    `airSpeed.length()` (air-relative, so ~the vertical rate under a canopy); >= 24.12 that
  //    stepper has zero references to the type and `SimulationStatus.java:643` writes it from
  //    `getRocketVelocity().length()` (the ground-frame total). 64 of the corpus's 91 OpenRocket
  //    stored simulations are on the newer side. Comparing per era took the openrocket median
  //    7.8% -> 1.2% and the whole metric 8.3% -> 2.0%, again with no engine change.
  //
  // So the number below is now what it always claimed to be — how far Loft's descent is from the
  // tool's, rather than how far a vertical speed is from a total one. Tightened here in the same
  // change as the adapter and the page, because a claim left at its old, looser figure is a gate
  // that has stopped gating.
  //
  // **And then the census stopped pooling two different flights.** A descent under a canopy and a
  // descent with nothing out are not the same measurement, and until 2026-08-04 they shared a row:
  // `FullScaleModelTH.rkt` alone contributes 11 plugged runs (`[L1940X-P]`, 83-162 m/s) against 4
  // canopy ones (8.8-9.2 m/s). Splitting on what the writing tool itself marks — see
  // `StoredSimulation.recoveryDeployed` — took `groundHitVelocity` 2.0 -> 1.3 over 82 runs and put
  // the 12 ballistic ones on their own line at 14.9, where they can be read rather than averaged
  // away. That second figure is the honest bad news this milestone was allowed to surface: Loft's
  // no-recovery descent is its weakest published number, and it is now visible instead of diluted.
  // Same split, same reason, on `flightTime`: 3.3 -> 3.1 and 4.8.
  //
  // **And then the census stopped counting one comparison fifteen times.** See `censusRowId`: a
  // quantity none of a file's varied inputs reaches is stored identically run after run, and Loft
  // answers identically too, so `maxAcceleration` and `launchRodVelocity` were carrying 27 exact
  // repeats between them from `FullScaleModelTH.rkt` alone — 14 copies of one +8.8% acceleration row,
  // and 13 of a rail-exit row that collapses to two rather than one because rail length DOES reach
  // it. Counting each comparison once took `maxAcceleration` 3.2 -> 1.8 over 80 rows and
  // `launchRodVelocity` 1.9 -> 1.6 over 73; `optimumDelay` moved 2.5 -> 2.4 and the rest stood still.
  //
  // **Re-measured 2026-08-09, and the mover was a PARSER fix rather than the solver.** An OpenRocket
  // centring ring whose file writes `<innerradius>auto</innerradius>` was read as "no number" and
  // fell back to `outerradius − thickness` with thickness defaulting to 0 — a ring with no hole and,
  // once the volume is `π(ro² − ri²)L`, no metal. It weighed nothing. `USLI2025-FULLSCALE-10.15 (2)`
  // carried four such aluminium rings at 0 g against ~210 g each: 6.7% of a 12,620 g dry mass, at
  // four fixed stations, so the CG and the static margin were wrong with it. Seven of the twelve
  // rows below improved, on the same 35 files and with no change to the solver:
  //
  //   deploymentVelocity 6.2 → 5.1 · groundHitVelocity 1.3 → 0.8 · maxAcceleration 1.8 → 1.3
  //   maxVelocity 2.2 → 1.9 · maxMach 2.0 → 1.7 · maxAltitude 3.1 → 2.9 · flightTime 3.1 → 2.8
  //
  // **And one moved the other way, which is stated rather than buried**: launchRodVelocity 1.6 → 1.9.
  // It is inside the slack and it is not a regression to chase — a heavier vehicle leaves the rail
  // more slowly, which is the direction a mass correction pushes. What would be dishonest is to
  // publish the seven and quietly leave the one, so both directions move here.
  timeToApogee: 1.5,
  launchRodVelocity: 1.9,
  maxMach: 1.7,
  maxVelocity: 1.9,
  optimumDelay: 2.4,
  maxAltitude: 2.9,
  groundHitVelocity: 0.8,
  "groundHitVelocity/ballistic": 14.9,
  flightTime: 2.8,
  "flightTime/ballistic": 4.8,
  maxAcceleration: 1.3,
  deploymentVelocity: 5.1,
};

/** How far a metric may drift from its published figure before the page counts as stale. Wide
 *  enough that adding one design to the corpus doesn't fail the suite, tight enough that a real
 *  regression in the engine does.
 *
 *  **The band is asymmetric, and the asymmetry is the point.** Above the claim, a flat 0.75 is right:
 *  the claims run from 1.3% to 14.9% and a REGRESSION is measured in absolute points wherever it
 *  happens. Below the claim — the direction added 2026-08-09, where an unpublished IMPROVEMENT goes
 *  red — a flat 0.75 is the wrong shape in both directions at once. It never bites on the small
 *  figures (`groundHitVelocity` could improve by 58% and stay green) and it bites instantly on the
 *  large one: `groundHitVelocity/ballistic` is 14.9 over twelve rows against a bimodal reference that
 *  disagrees with itself by 1.94×, so any real improvement to the plugged-descent drag model — which
 *  `ROADMAP.md` explicitly wants — would move it by many points at once and fail a 0.75 bound the
 *  moment it worked. So the improvement side is the greater of the flat figure and a tenth of the
 *  claim, which is the same rule at 7.5% and a proportionate one at 14.9%. */
const CENSUS_SLACK_PCT = 0.75;
const censusImprovementSlack = (claim: number) => Math.max(CENSUS_SLACK_PCT, claim * 0.1);

/** Which census row a comparison belongs in. Everything is itself except the descent metrics on a
 *  run the writing tool marks as NOT-DEPLOYED, which get their own row.
 *
 *  A canopy descent and a lawn dart are different flights, and a median over both is a number about
 *  neither. It is not a small effect here: `FullScaleModelTH.rkt` stores 15 runs of one design, and
 *  11 of them are plugged (`[L1940X-P]`) — so on the RockSim side the ballistic population OUTNUMBERS
 *  the canopy one nearly three to one, and four of the corpus's five worst ground-hit cases are that
 *  file. See `StoredSimulation.recoveryDeployed` for how the tool's own marking is read.
 *
 *  Both formats state it — RockSim per recovery device, OpenRocket as a `recoverydevicedeployment`
 *  event in the flight log it has always written and Loft had never opened. A run whose file states
 *  neither stays on the main line rather than being assumed either way, and the case below prints
 *  all three populations with their counts so "unstated" is visible as its own number rather than
 *  hidden inside the published one.
 *
 *  `flightTime` is split for the same reason and it is the more obvious of the two — the plugged runs
 *  fall 2,100 m with nothing out, so their whole flight is shorter than the canopy runs' descent
 *  alone. */
/** `deploymentVelocity` joined the split on 2026-08-05, for the same reason and a wider spread than
 *  either of the other two. A run the writing tool marks as not-deployed still stores a figure under
 *  this name — RockSim writes ~234 m/s for `FullScaleModelTH`'s plugged runs, where its canopy runs
 *  store 10 to 33 — because the charge fires whether or not anything comes out. Pooling a 234 m/s
 *  "deployment" with a 10 m/s one is a median about neither, exactly as it was for the descent. */
const BALLISTIC_SPLIT_METRICS = new Set(["groundHitVelocity", "flightTime", "deploymentVelocity"]);
const censusKey = (key: string, sim: { recoveryDeployed?: boolean }) =>
  sim.recoveryDeployed === false && BALLISTIC_SPLIT_METRICS.has(key) ? `${key}/ballistic` : key;

/** **One comparison, counted once — however many stored runs of a file repeat it.**
 *
 *  A file's stored simulations vary the inputs their author was interested in, and a quantity none of
 *  those inputs reaches is stored identically run after run — as is Loft's answer for it. The census
 *  counted each copy as a separate measurement.
 *
 *  **Read out of `FullScaleModelTH.rkt`, whose fifteen stored runs are where most of this lives.**
 *  What varies across them is the **rail length** (`<LaunchGuideLen>` 914.4 mm on eleven, 1422.4 on
 *  four) and the **ejection delay** (`[L1940X-0]` against the plugged `[L1940X-P]`, apogee ~323 m
 *  against ~2,101 m). `<LaunchWindSpeed>` is `0.` on all fifteen — an earlier draft of this comment
 *  said the runs differ in wind and was corrected by opening the file. Against that:
 *
 *    - `<MaxAcceleration>` is **125.291 on all fifteen**, and Loft returns **136.345** on all fifteen.
 *      Peak axial acceleration is set by the thrust spike, which is over before the rocket leaves
 *      even the short rail and long before any ejection charge, so neither varied input can reach it
 *      and both tools agree it does not move. **One** disagreement, at +8.8%, was carrying fifteen
 *      times the weight of any other design's in a population of 94.
 *    - `<VelocityAtLaunchGuideEnd>` **does** respond, at 14.6479 off the short rail and 18.1014 off
 *      the long one. So rail-exit velocity collapses fifteen rows to **two**, not to one — 13
 *      repeats, not 14 — which is the shape to expect and a useful check on the rule: a metric the
 *      varied input reaches keeps a row per distinct value of it.
 *
 *  **This is not the diagnosis R10's own notes predicted, and the measurement is what corrected it.**
 *  Those notes read the invariance as "a sampled or rounded peak rather than a per-run measurement" —
 *  the oracle's resolution, to be excused. Two things in the file say otherwise. Loft's own answer is
 *  equally invariant, so the invariance is a fact about the flight rather than about RockSim's
 *  output; and RockSim's acceleration fields are not quantised — `<MaxHorzAcceleration>` in the same
 *  blocks reads 0.36345 / 0.451539 / 0.453523 / … , fifteen distinct values at six significant
 *  figures. The stored number is fine. What was wrong is the ARITHMETIC over it.
 *
 *  **The key is both sides, and that is the whole of the safety.** A row is dropped only when some
 *  earlier row of the same file and metric agrees with it on the stored value AND on Loft's value —
 *  i.e. when it is literally the same comparison. Where the tool repeats itself and Loft does not
 *  (or the reverse), the disagreement genuinely varies per run and every row counts. So this cannot
 *  remove an inconvenient case: an inconvenient case differs from its neighbours by definition.
 *
 *  Measured over the whole census, 54 of 910 rows are exact repeats, and they are concentrated:
 *  `maxAcceleration` 94 → 80 rows (3.2% → 1.8%) and `launchRodVelocity` 94 → 73 (1.9% → 1.6%) carry
 *  35 of the 54. Every other metric moves by at most 0.1%, and four do not move at all — which is
 *  the shape a correct de-duplication should have, and is asserted below rather than asserted here.
 *
 *  **Every figure this moved, it moved DOWNWARD**, and R10's notes forbid dropping a case to make a
 *  median look better. That is why the rule is mechanical, metric-blind, and pinned by
 *  `counts a stored comparison once, however many times a file repeats it` — which names the repeats
 *  it found, requires the known concentration to still be there, and fails if the rule ever starts
 *  removing rows that disagree. The repeats are also published rather than netted away: the page
 *  states each metric's population, and those populations are asserted against it. Note what makes
 *  the direction unreachable rather than merely unintended: `pctError` is a pure function of the two
 *  values the key is built from, so every member of a duplicate group carries the SAME error and the
 *  rule cannot see a row's magnitude at all. Had the repeated comparison been a 0.1% agreement, the
 *  median would have gone up.
 *
 *  **Two limits, stated because the rule is narrower than the principle behind it.**
 *
 *  1. **It de-duplicates identical VALUES, not identical RUNS.** Nine of that file's fifteen runs are
 *     byte-identical in every stated input and differ only in RockSim's own turbulence draw — their
 *     stored apogees read 2101.98 / 2105.15 / 2098.47 / … — so on `maxAltitude` they survive as nine
 *     rows, and one design still casts fifteen votes there while casting one on `maxAcceleration`.
 *     The principled form is a median of per-design medians, which would weight every metric alike;
 *     it is a larger change than this item and is filed in `BACKLOG.md` rather than smuggled in here.
 *  2. **It costs the median its sensitivity to a single design's boost error**, which is exactly the
 *     metric this was done for: fifteen rows moving from below the median to the top used to shift it
 *     past `CENSUS_SLACK_PCT`, and one row cannot. That is a real loss of gate strength and it is
 *     replaced rather than accepted — `no single design's max acceleration is quietly far out` asserts
 *     the WORST row, the same instrument `optimumDelay` needed for the same reason. */
const censusRowId = (file: string, key: string, stored: number, simulated: number) =>
  `${file}|${key}|${stored.toFixed(6)}|${simulated.toFixed(6)}`;

interface Case {
  file: string;
  sim: string;
  pctError: number;
  /** Max velocity, where the file stores one. Apogee alone can agree for the wrong reasons —
   *  a heavier rocket that also drags less reaches a similar height on a different trajectory —
   *  so the speed it got there at is what separates accuracy from cancelling errors. */
  velPctError?: number;
}

function corpusFiles(): { path: string; name: string }[] {
  if (!existsSync(CORPUS_DIR) || !statSync(CORPUS_DIR).isDirectory()) return [];
  const out: { path: string; name: string }[] = [];
  for (const dir of readdirSync(CORPUS_DIR)) {
    const sub = join(CORPUS_DIR, dir);
    if (!statSync(sub).isDirectory()) continue;
    for (const f of readdirSync(sub).sort()) {
      if (/\.(ork|ork\.gz|rkt|cdx1)$/i.test(f)) out.push({ path: join(sub, f), name: f });
    }
  }
  return out;
}

/** The corpus names files `<family>__<source>__<original name>`; the original is what a reader
 *  recognises and what KNOWN_ISSUES is keyed on. */
const shortName = (name: string): string => name.split("__").pop() ?? name;

/** The two unit systems `components/LoftApp.tsx` puts a ceiling through before a flyer can type it.
 *  A bound is only real if it survives the conversion the field displays it in, and the imperial one
 *  is the tighter of the two on a small design.
 *
 *  **The conversion is `lib/display.ts`'s own, not a copy of it.** A first draft spelled the two
 *  roundings here — `m * 1000` floored, `m * 39.3701 * 100` floored — which made the case a proof
 *  that two implementations agree rather than a proof that the field's ceiling is reachable. Changing
 *  the component's rounding would have left this green. It is the failure mode this repo has recorded
 *  three times: a check whose subject is supplied by the check. */
const UNIT_SYSTEMS: readonly [string, boolean][] = [
  ["mm", false],
  ["in", true],
];

/** How far the outer mould line steps at the joint immediately behind `id`, in metres of DIAMETER,
 *  computed from the flattened geometry alone.
 *
 *  Deliberately NOT `mouldLineStep`: this suite exists to catch what the app's own adjacency gets
 *  wrong, and asking the suspect where its neighbours are cannot do that. Adjacency here is "the next
 *  body part whose fore station is this one's aft station", which is a fact about the drawing rather
 *  than about any list. 0 when nothing touches it. */
const isBodyPart = (k: string) => k === "nosecone" || k === "bodytube" || k === "transition";

function stepBehind(rocket: Rocket, id: string): number {
  const bodies = flattenRocket(rocket)
    .filter((p) => isBodyPart(p.component.kind))
    .sort((a, b) => a.xFore - b.xFore);
  const self = bodies.find((p) => p.component.id === id);
  if (!self) return 0;
  const aftOf = (c: RocketComponent) =>
    c.kind === "bodytube" ? c.outerRadius : c.kind === "nosecone" || c.kind === "transition" ? c.aftRadius : undefined;
  const foreOf = (c: RocketComponent) =>
    c.kind === "bodytube" ? c.outerRadius : c.kind === "transition" ? c.foreRadius : 0;
  const next = bodies.find(
    (p) => p.component.id !== id && Math.abs(p.xFore - (self.xFore + self.length)) < 1e-6,
  );
  const mine = aftOf(self.component);
  if (!next || mine === undefined) return 0;
  return 2 * (foreOf(next.component) - mine);
}

/** The fin kinds this suite bounds — the three whose axial extent is a root chord bonded to the
 *  airframe. `tubefinset` is deliberately absent: a tube fin is a ring of tubes around the airframe
 *  rather than a plate bonded edge-on, so "the root must lie on the body" is not the rule that
 *  describes it. Mirrors `FIN_SET_KINDS` in `lib/model/edit.ts`. */
const FIN_KINDS = new Set(["trapezoidfinset", "ellipticalfinset", "freeformfinset"]);

/** One stage's body extent in the flattened frame — the same span `keepFinsOnAirframe` bounds
 *  against, computed here independently rather than imported, so the check is not the code under
 *  test asking itself whether it is right. */
function stageSpan(rocket: Rocket, stageIndex: number): { fore: number; aft: number } | undefined {
  let fore = Infinity;
  let aft = -Infinity;
  for (const p of flattenRocket(rocket)) {
    if (p.stageIndex !== stageIndex) continue;
    // **`isBody`'s three kinds exactly, and NOT `tubefinset`.** A first draft included it, which made
    // this "independent" oracle strictly MORE permissive than the code it checks — an oracle that can
    // only ever false-pass. It measures no difference on today's corpus, which is precisely why it
    // would have gone unnoticed. Caught by the pre-push review.
    if (!["nosecone", "bodytube", "transition"].includes(p.component.kind)) continue;
    fore = Math.min(fore, p.xFore);
    aft = Math.max(aft, p.xFore + p.length);
  }
  return Number.isFinite(fore) && aft > fore ? { fore, aft } : undefined;
}

const files = corpusFiles();
const suite = files.length ? describe : describe.skip;

suite("real-design corpus", () => {
  it("keeps every fin set on its own stage, and never moves one on a design nobody has edited", async () => {
    // **The bound `keepFinsOnAirframe` enforces, asked of every real design.** Two claims, and the
    // second is the one that decides whether the clamp could ship at all: a rule that moved fins on
    // an unedited import would be rewriting other people's designs, which is the one thing Loft does
    // not do to a number a file states.
    const moved: string[] = [];
    const off: string[] = [];
    const torn: string[] = [];
    let sets = 0;
    let multi = 0;
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const finsOf = (r: Rocket) =>
        flattenRocket(r).filter((p) => FIN_KINDS.has(p.component.kind));
      const before = finsOf(doc.rocket);
      sets += before.length;
      if (before.length > 1) multi++;

      // 1. An empty edit bag moves nothing. Measured across the corpus at 0 before shipping; a
      //    parent-tube datum instead of a stage one would move three designs, which is why the datum
      //    is the stage.
      const idle = finsOf(applyGeometryEdits(doc.rocket, {}));
      for (let i = 0; i < before.length; i++) {
        if (Math.abs(idle[i].xFore - before[i].xFore) > 1e-9) {
          moved.push(`${f.name}: ${before[i].component.name || "fin set"} moved ${(idle[i].xFore - before[i].xFore) * 1000} mm on an EMPTY edit`);
        }
      }
      if (!before.length) continue;

      // 2. Asking for a station a metre aft leaves every set on its own stage — and the FIELD's
      //    advertised ceiling is achievable rather than optimistic.
      const bounds = finStationBounds(doc.rocket);
      const far = applyGeometryEdits(doc.rocket, { finStation: (bounds?.hi ?? 0) + 1 });
      for (const p of finsOf(far)) {
        const span = stageSpan(far, p.stageIndex);
        if (span && (p.xFore < span.fore - 1e-6 || p.xFore + p.length > span.aft + 1e-6)) {
          off.push(`${f.name}: ${p.component.name || "fin set"} ends ${((p.xFore + p.length - span.aft) * 1000).toFixed(1)} mm past stage ${p.stageIndex}`);
        }
      }

      // 3. **The group stays rigid.** Fin position is one delta over every set the design carries —
      //    the panel and the limitations page both say so — and a clamp that corrected each set
      //    separately silently rewrote the spacing on 9 of the 13 multi-set designs — the number the
      //    control below actually reports — and 12 of the 13 differ in one direction or the other.
      //    Every set must move by the SAME amount.
      //    **Asked BEYOND the bound, where the clamp actually fires.** A first draft asked for exactly
      //    `bounds.hi`, which is by construction the largest station at which no set violates — so
      //    nothing was corrected, every delta was trivially equal, and a per-set correction passed
      //    it. A control that cannot fail is the failure this repo keeps cataloguing; caught by
      //    running that control.
      if (before.length > 1) {
        const atMax = finsOf(applyGeometryEdits(doc.rocket, { finStation: (bounds?.hi ?? 0) + 0.5 }));
        const deltas = atMax.map((p, i) => p.xFore - before[i].xFore);
        const spread = Math.max(...deltas) - Math.min(...deltas);
        if (spread > 1e-9) {
          torn.push(`${f.name}: sets moved by different amounts — spread ${(spread * 1000).toFixed(1)} mm`);
        }
      }
    }
    console.log(
      `fin sets across ${files.length} design files: ${sets}, on ${multi} designs carrying more than one; ` +
        `0 moved by an empty edit, 0 driven off their stage, 0 groups torn apart`,
    );
    expect(sets, "no design carries a fin set — this case would prove nothing").toBeGreaterThan(0);
    expect(multi, "no design carries more than one set — the rigidity claim is untested").toBeGreaterThan(0);
    expect(moved, "a fin set moved on a design nobody edited").toEqual([]);
    expect(off, "a fin set was driven off the stage it sits on").toEqual([]);
    expect(torn, "the fin group was torn apart by the clamp").toEqual([]);
  });

  it(`imports every design file (${files.length} present)`, async () => {
    const failures: string[] = [];
    for (const f of files) {
      try {
        const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
        expect(doc.rocket.stages.length, `${f.name} has no stages`).toBeGreaterThan(0);
      } catch (e) {
        failures.push(`${shortName(f.name)}: ${(e as Error).message}`);
      }
    }
    expect(failures, "design files that failed to import").toEqual([]);
  }, 300_000);

  /** **Every part of every real design comes back as itself across a round trip.**
   *
   *  `lib/model/id.test.ts` has pinned this on synthesized designs since R1; over the real corpus it
   *  was false, and had been for as long as the exporter has had two fin-set cases. `componentId`
   *  RESERVES an id rather than reading one — ask twice for the same component and the second answer
   *  is a fabricated `uuidFrom("<id>#1")` — and the two `*finset` cases built their own opening tag
   *  after the shared one had already been built eagerly. So a freeform fin set, and only a freeform
   *  fin set, went out under a hash: **7 sets across 6 of the 27 `.ork` designs, and the other 325
   *  stated ids intact.** A design authored here is persisted as its own exported bytes, so after
   *  a reload an aim, a removal or a move naming that set resolved to nothing.
   *
   *  **Scoped to the parts whose id the FILE stated, which is the only promise there is to keep.**
   *  `.rkt` and `.CDX1` carry no component id at all and neither do some hand-written `.ork` files,
   *  so those adapters mint one per part on every import and `componentId` hashes a minted id into a
   *  UUID on the way out — 237 of the corpus's 569 parts, none of which the design ever named. A
   *  stated id is UUID-shaped and `uniqueUuidFrom` returns it untouched, so "the file said `X`, Loft
   *  gave back `X`" is exactly the assertion, and it is made by set difference rather than by count
   *  so a part returning under someone ELSE's id fails as loudly as one that vanishes. */
  const STATED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  it("gives back every part whose id its own design file stated", async () => {
    const lost: string[] = [];
    let parts = 0;
    let stated = 0;
    let checked = 0;
    for (const f of files.filter((f) => /\.ork(\.gz)?$/i.test(f.name))) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const before = flattenRocket(doc.rocket).map((p) => p.component);
      const after = new Set(flattenRocket((await importDesign(exportOrk(doc))).rocket).map((p) => p.component.id));
      checked++;
      parts += before.length;
      for (const c of before) {
        // A minted id was never the design's to keep; only an id the file stated is a promise.
        if (!STATED_ID.test(c.id)) continue;
        stated++;
        if (!after.has(c.id)) lost.push(`${shortName(f.name)}: ${c.kind} "${c.name}" came back under another id`);
      }
    }
    console.log(
      `round-tripped ids across ${checked} OpenRocket design files: ${parts} parts, ${stated} of them ` +
        `carrying an id the file itself stated`,
    );
    expect(stated, "no design stated an id of its own, so this asserted nothing").toBeGreaterThan(0);
    expect(lost, "parts that did not come back under their own id").toEqual([]);
  }, 300_000);

  /** **Which masses the design STATED, counted over every real file.**
   *
   *  Measured 2026-08-09 before the field existed: **91 per-part masses across the corpus came from
   *  the design rather than from Loft** — 64 `<overridemass>` across 15 of the 27 `.ork` files,
   *  spanning fifteen kinds from a stage to a rail button, plus 27 `KnownMass` figures across all 4
   *  `.rkt` files — and every one of them rendered in the parts table as a bare number,
   *  indistinguishable from a mass Loft derived from a density. `DESIGN.md` §6 asks a reference value
   *  to name its source, and none of them could.
   *
   *  With the field in place the census reads **108 stated, 60 carried from the source tool, 401
   *  computed here**. More than 91 stated because an override is not the only way a file gives a
   *  weight outright — an OpenRocket mass component and a RockSim `KnownMass` both do. More than 27
   *  from the tool because everything a `.rkt` hands over verbatim carries RockSim's own figure,
   *  including its parachutes, streamers and lugs, which sit outside the structural set and were the
   *  three the first version of this left unmarked and therefore claiming to be Loft's own.
   *
   *  **The distinction cannot be read off `overrideMass`, which is the whole reason `massFrom`
   *  exists.** `lib/ork/adapt.ts` sets that field only from a genuine `<overridemass>`; `lib/rkt/
   *  adapt.ts` synthesises one on every structural part from whichever of RockSim's two figures the
   *  design selects — and every corpus `.rkt` has `<UseKnownMass>` at 0, so all four fly RockSim's
   *  own COMPUTED number. A marker hung off `overrideMass` would have called those measurements.
   *
   *  Asserted as a relationship rather than as golden counts, so it survives a re-cut: every part
   *  whose mass the design states carries the marker, no part Loft computed carries one, and both
   *  populations are non-empty. */
  it("says which of every real design's masses the design itself stated", async () => {
    let stated = 0;
    let tool = 0;
    let computed = 0;
    const wrong: string[] = [];
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const rkt = /\.rkt$/i.test(f.name);
      for (const p of flattenRocket(doc.rocket)) {
        const c = p.component as {
          kind: string;
          name: string;
          massFrom?: "stated" | "tool";
          overrideMass?: number;
        };
        if (c.massFrom === "stated") stated++;
        else if (c.massFrom === "tool") tool++;
        else computed++;
        // An `.ork` states a mass exactly when it carries an override, so the two must agree there.
        // A `.rkt` synthesises an override from a figure RockSim computed, which is precisely the
        // case the marker exists to keep apart — so the same rule would be wrong for it.
        if (!rkt && c.overrideMass !== undefined && c.massFrom !== "stated") {
          wrong.push(`${shortName(f.name)}: ${c.kind} "${c.name}" states a mass and is not marked`);
        }
        // Nothing may claim the source tool computed it unless a tool did: only the RockSim adapter
        // has another tool's figure to carry.
        if (!rkt && c.massFrom === "tool") {
          wrong.push(`${shortName(f.name)}: ${c.kind} "${c.name}" claims a tool figure on a non-RockSim design`);
        }
      }
    }
    console.log(
      `mass provenance across ${files.length} design files: ${stated} stated by the design, ` +
        `${tool} carried from the source tool, ${computed} computed here`,
    );
    expect(stated, "no design stated a mass — this asserted nothing").toBeGreaterThan(0);
    expect(tool, "no design carried another tool's figure — the second value asserted nothing").toBeGreaterThan(0);
    expect(computed, "every mass was attributed — the unmarked case asserted nothing").toBeGreaterThan(0);
    expect(wrong, "masses whose stated marker disagrees with the file").toEqual([]);
  }, 300_000);

  /** **The same question about the other number the mass model produces per part.**
   *
   *  Loft honours a stated CG in preference to its own geometry — that is what makes a nose cone with
   *  lead in the tip fly the margin it actually has — and then printed the result on `MassBreakdown`'s
   *  *CG from nose* column with no way to tell the design's claim from Loft's arithmetic. Measured
   *  2026-08-11: **15 stated CGs across 8 of the 35 designs** (5 nose cones, 4 parachutes, 2 mass
   *  objects and one each of transition, tube coupler, body tube and fin set), and stripping them moves the static
   *  margin on **6 of the 7** — `rocksimTestRocket1.rkt` 4.243 → 5.254 cal and `Cherokee-E-5055.ork`
   *  1.421 → 1.897 cal, both a real caliber of stability.
   *
   *  Asserted as a RELATIONSHIP rather than as golden counts, for the reason the mass case above
   *  gives: the corpus can be re-cut and the numbers move, but "a part carrying a stated CG is marked
   *  as stated, and nothing else claims one" is true of any corpus. */
  it("says which of every real design's balance points the design itself stated", async () => {
    let statedCg = 0;
    let computedCg = 0;
    const wrong: string[] = [];
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      for (const p of flattenRocket(doc.rocket)) {
        const c = p.component as {
          kind: string;
          name: string;
          cgFrom?: string;
          overrideCGx?: number;
          standsForAirframe?: boolean;
        };
        if (c.cgFrom === "stated") statedCg++;
        else computedCg++;
        // The marker and the figure are set at the same place in every adapter, so on a file Loft did
        // not write they must agree in BOTH directions — a stated CG that is unmarked is a reference
        // value presented as Loft's own, and a mark with nothing behind it is a claim about a number
        // the design never made.
        //
        // **"Behind it" is an override OR a stated placement, and the second is not a loophole.** A
        // RASAero `.CDX1` states one launch weight and one CG and no per-part anything, so its adapter
        // mints a zero-length mass component whose PLACEMENT is that balance point — there is no
        // computed CG for an override to replace. Reading the invariant as "override only" would have
        // forced that mark off the one design whose CG is most plainly the file's own, which is how
        // the first version of this case left `Show-off.CDX1` crediting Loft with a figure it takes
        // verbatim from `<SustainerCG>`. `standsForAirframe` is the exact and only such carrier.
        const hasStatedFigure = c.overrideCGx !== undefined || c.standsForAirframe === true;
        if (c.overrideCGx !== undefined && c.cgFrom !== "stated") {
          wrong.push(`${shortName(f.name)}: ${c.kind} "${c.name}" states a CG and is not marked`);
        }
        if (c.cgFrom === "stated" && !hasStatedFigure) {
          wrong.push(`${shortName(f.name)}: ${c.kind} "${c.name}" is marked as stating a CG and states none`);
        }
      }
    }
    console.log(
      `CG provenance across ${files.length} design files: ${statedCg} stated by the design, ` +
        `${computedCg} computed here`,
    );
    expect(statedCg, "no design stated a CG — this asserted nothing").toBeGreaterThan(0);
    expect(computedCg, "every CG was attributed — the unmarked case asserted nothing").toBeGreaterThan(0);
    expect(wrong, "balance points whose stated marker disagrees with the file").toEqual([]);
  }, 300_000);

  /** **A mark must not outlive the number it describes — and the case above cannot see that, because
   *  it only ever looks at an IMPORT.**
   *
   *  A catalogue pick replaces a cone with a different one, so it clears `overrideCGx`: a 65.4 mm
   *  balance measured on a 396.9 mm cone would otherwise be pinned onto the 233.7 mm one that
   *  replaced it. The first version of `cgFrom` cleared the number at all three pick sites and left
   *  the MARK at every one, so the breakdown went on reading *"stated by the design"* beside a figure
   *  the design no longer supplies. Reproduced on **5 real corpus designs** before the fix.
   *
   *  This is the same shape as the four wrong mass marks the review caught on the increment that
   *  added `massFrom`, which is why it is asserted over the EDIT path rather than trusted to a
   *  reading: the invariant is "marked implies a figure behind it", and it has to hold after an edit
   *  and not merely after a parse. */
  it("never leaves a stated-CG mark on a design whose CG an edit has replaced", async () => {
    // A real catalogued cone, in the shape `catalogNoseCone` takes. Its dimensions do not have to
    // match any design: the point is that picking one clears the imported balance point.
    const pick = {
      manufacturer: "Estes",
      partNumber: "PNC-70A",
      shape: "ogive" as const,
      length: 0.2337,
      outerDiameter: 0.054,
      shoulderDiameter: 0.052,
      shoulderLength: 0.02,
      mass: 0.12,
    };
    const stranded: string[] = [];
    let picked = 0;
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const nose = primaryNose(doc.rocket);
      if (!nose || (nose as { cgFrom?: string }).cgFrom !== "stated") continue;
      picked++;
      const after = applyGeometryEdits(doc.rocket, { catalogNoseCone: pick as never });
      const c = flattenRocket(after).find((p) => p.component.id === nose.id)?.component as
        | { overrideCGx?: number; cgFrom?: string }
        | undefined;
      if (c && c.cgFrom !== undefined && c.overrideCGx === undefined) {
        stranded.push(`${shortName(f.name)}: nose is marked "${c.cgFrom}" with no stated CG behind it`);
      }
    }
    console.log(`stated-CG marks across an edit: ${picked} design(s) whose nose states a CG, ${stranded.length} stranded`);
    expect(picked, "no corpus design states a nose CG — this asserted nothing").toBeGreaterThan(0);
    expect(stranded, "designs left claiming a stated CG after an edit replaced it").toEqual([]);
  }, 300_000);

  /** **A round trip through Loft must not turn Loft's own arithmetic into the design's claim.**
   *
   *  The exporter writes a mass Loft COMPUTED as an explicit figure — that is what keeps a canopy's
   *  mass across an export at all — so a naive re-import reads every one of them as "the design
   *  states this". Measured 2026-08-10 before the fix: **51 parts across the 27 `.ork` designs went
   *  unmarked → stated, and 15 parts of `FullScaleModelTH.rkt` went from the SOURCE TOOL's figure to
   *  stated**, which `lib/ork/export.test.ts` names in its own words as the thing that must not
   *  happen. It reaches a flyer with no download: a design authored here is persisted as its own
   *  exported bytes and re-imported on reload.
   *
   *  `lib/ork/adapt.ts` takes no mass provenance from a file whose `creator` is Loft. This asserts
   *  the consequence over every design rather than the mechanism, so a future exporter that learns to
   *  carry provenance properly can satisfy it a better way. */
  it("never turns its own arithmetic into the design's claim across a round trip", async () => {
    const laundered: string[] = [];
    let compared = 0;
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      // **Both marks, because they ride the same export path and the same hazard.** The exporter
      // writes an `<overridecg>` for a CG Loft is merely carrying, exactly as it writes an explicit
      // mass — so a naive re-import would read every one as the design's own claim. `lib/ork/adapt.ts`
      // takes no provenance of either kind from a file whose `creator` is Loft's own string.
      const before = new Map(
        flattenRocket(doc.rocket).map((p) => [
          p.component.id,
          {
            mass: (p.component as { massFrom?: string }).massFrom,
            cg: (p.component as { cgFrom?: string }).cgFrom,
          },
        ]),
      );
      for (const p of flattenRocket((await importDesign(exportOrk(doc))).rocket)) {
        if (!before.has(p.component.id)) continue; // a minted id — a different question, asserted above
        compared++;
        const was = before.get(p.component.id)!;
        const now = {
          mass: (p.component as { massFrom?: string }).massFrom,
          cg: (p.component as { cgFrom?: string }).cgFrom,
        };
        // Only a mark GAINED or CHANGED is laundering. Losing one is the conservative direction and
        // is what a Loft-written file does deliberately.
        for (const which of ["mass", "cg"] as const) {
          if (now[which] !== undefined && now[which] !== was[which]) {
            laundered.push(
              `${shortName(f.name)}: ${p.component.kind} "${p.component.name}" ${which} ${was[which] ?? "unmarked"} → ${now[which]}`,
            );
          }
        }
      }
    }
    console.log(`mass and CG provenance across a round trip: ${compared} parts compared by id`);
    expect(compared, "no part survived a round trip by id — this asserted nothing").toBeGreaterThan(100);
    expect(laundered, "provenance a round trip through Loft invented or changed").toEqual([]);
  }, 300_000);

  /** **No real design flies a fitting Loft could not weigh.**
   *
   *  A rail button is not a short launch lug, and reading it as one gave four real designs a part
   *  with no mass at all — see `railButtonMass` in `lib/ork/adapt.ts` for the element-by-element
   *  reason. A part with no mass gets no row in `massByComponent`, so the parts table printed a dash
   *  where every other part carries a figure, and the fittings fieldset that reads the same value
   *  disappeared, leaving that part's Properties popover empty.
   *
   *  Asserted on the whole population rather than on the four, so the next fitting kind whose
   *  geometry Loft reads under the wrong element names fails here rather than shipping. The census
   *  is printed and both counts are asserted non-zero, so a corpus re-cut that dropped every design
   *  with a fitting on it could not leave this passing on nothing.
   *
   *  **The RASAero designs are the one exemption, and it is a positive assertion rather than a
   *  carve-out.** `.CDX1` declares a launch lug by DIAMETER and a rail guide by diameter alone — no
   *  material, no wall, no height — because that format wants them for parasitic drag and nothing
   *  else (`lib/rasaero/adapt.ts`'s `externals`). There is nothing there to weigh, and inventing a
   *  figure would be the false precision the safety posture forbids. What makes that safe rather
   *  than a silent hole is that the same format states the design's LAUNCH WEIGHT, which the adapter
   *  mints as a `standsForAirframe` point mass — so every gram is already in the total, including
   *  these. That is what is asserted for them, part by part, rather than skipped. */
  it("weighs every external fitting on every real design, and none of them at nothing", async () => {
    const FITTINGS = ["shockcord", "launchlug", "railbutton"] as const;
    const byKind: Record<string, number> = {};
    const massless: string[] = [];
    const dragOnly: string[] = [];
    let stated = 0;
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      // Does this design state its weight as a whole, rather than part by part? Only RASAero does.
      const lumped = flattenRocket(doc.rocket).some(
        (p) => p.component.kind === "masscomponent" && p.component.standsForAirframe,
      );
      for (const p of flattenRocket(doc.rocket)) {
        const c = p.component as { kind: string; name: string; mass?: number; overrideMass?: number };
        if (!(FITTINGS as readonly string[]).includes(c.kind)) continue;
        byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
        if (c.overrideMass !== undefined) stated++;
        // The figure the flight and the parts table actually use: a stated mass wins over a computed
        // one, so a part is only massless when NEITHER is there.
        const flown = c.overrideMass ?? c.mass;
        if (flown !== undefined && flown > 0) continue;
        if (lumped) dragOnly.push(`${shortName(f.name)}: ${c.kind}`);
        else massless.push(`${shortName(f.name)}: ${c.kind} "${c.name}" has no mass at all`);
      }
    }
    const total = Object.values(byKind).reduce((a, n) => a + n, 0);
    console.log(
      `external fittings weighed across ${files.length} design files: ${total} parts ` +
        `(${FITTINGS.map((k) => `${byKind[k] ?? 0} ${k}`).join(", ")}), ${stated} stating their own mass, ` +
        `${dragOnly.length} declared for drag alone by a format that states the design's weight as a whole`,
    );
    expect(total, "no design carried a fitting, so this asserted nothing").toBeGreaterThan(0);
    expect(byKind.railbutton ?? 0, "no design carried a rail button — the kind this pins").toBeGreaterThan(0);
    expect(massless, "fittings a real design flies with no mass at all").toEqual([]);
  }, 300_000);

  /** **A stated weight is never ADDED to a design that already states one for the whole airframe.**
   *
   *  A RASAero `.CDX1` states one launch weight and no per-part masses, so its adapter mints a single
   *  point mass that already contains the nose and the tube. The airframe mass controls shipped on
   *  2026-08-10 wrote an `overrideMass` on either without checking, so the flyer's figure was ADDED to
   *  a total that already included it: measured on the bundled RASAero sample, 500 g typed on the cone
   *  took dry mass 1.567 kg → 2.067 kg — exactly 500 g of double count — and on the corpus's larger
   *  `.CDX1` it moved apogee 1,083 m → 996 m and the margin 1.92 → 2.23 cal, with the breakdown still
   *  reading "Airframe (stated launch weight)" beside it. A flyer sizes a motor, a chute and a margin
   *  off those.
   *
   *  Found by the opening fan-out's Sev-1 screen, which drove the bundled sample rather than reading
   *  the code — and the increment it caught was the one that had deliberately MADE these controls
   *  render on RASAero designs, on the reasoning that a scale is the only source there. The reasoning
   *  was right about the need and wrong about the arithmetic.
   *
   *  `statedAirframeMass` is the guard, and it is the same one `primaryMassObject` and
   *  `removalRefusal` already applied to that lump — written twice in this file and skipped by the
   *  third caller, which is why it is exported now rather than written a fourth time. */
  it("never adds a stated part weight to a design that states one weight for the whole airframe", async () => {
    const doubled: string[] = [];
    const moved = new Set<string>();
    let lumped = 0;
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      if (!statedAirframeMass(doc.rocket)) continue;
      lumped++;
      const base = dryMassProperties(doc.rocket).mass;
      // **Driven off `PER_PART_MASS_FIELDS` rather than a hand-written pair, and that is the whole
      // repair.** The first version of this case listed the nose and the body tube — the two fields
      // the increment beside it had just guarded — and passed for a day while `parachuteMass` and
      // `fittingMass` went on adding a typed weight to a figure that already contained it. Measured
      // 2026-08-11 before the fix: `Show-off.CDX1` took 0.4536 → 0.9536 kg on a 500 g canopy and its
      // margin 12.81 → 9.28 cal; `Complex.Two-Stage.CDX1` took 1.1777 → 2.1777 kg on a fitting (the
      // typed unit mass times its count) and its margin 1.78 → 1.29 cal.
      //
      // Reading the registry means a seventh mass field is covered the moment it is declared, and a
      // field that writes a mass without being declared fails `lib/model/edit.test.ts`'s registry
      // case instead of quietly double-counting here.
      for (const key of Object.keys(PER_PART_MASS_FIELDS)) {
        const after = dryMassProperties(applyGeometryEdits(doc.rocket, { [key]: 0.5 })).mass;
        if (Math.abs(after - base) > 1e-9) {
          moved.add(key);
          doubled.push(
            `${shortName(f.name)}: a stated \`${key}\` weight moved dry mass ${base.toFixed(4)} → ` +
              `${after.toFixed(4)} kg on a design whose whole weight is one lump that already contains it`,
          );
        }
      }
    }
    console.log(
      `lumped-airframe designs across ${files.length} design files: ${lumped} stating one weight for ` +
        `the whole airframe, ${doubled.length} double-counts across ` +
        `${Object.keys(PER_PART_MASS_FIELDS).length} per-part mass fields` +
        (moved.size ? ` (${[...moved].join(", ")})` : ""),
    );
    expect(
      lumped,
      "no design states its weight as one lump — the double-count case is untested",
    ).toBeGreaterThan(0);
    expect(doubled, "designs where a stated part weight is added to a weight that already includes it").toEqual([]);
  }, 300_000);

  /** **A vehicle that weighs nothing never reaches a flyer with a balance point — and the reason is
   *  not the one it looks like.**
   *
   *  Measured 2026-08-11: `Three-stage rocket.CDX1`, an in-the-wild RASAero design in this corpus,
   *  imports with `dryMass` and `liftoffMass` of exactly **0 kg** — the format states weights per part
   *  and that file states none — and `run.result.staticMarginCal` for it is **6.32 cal**. Read off the
   *  result object that looks like a confident, comfortably-stable figure for a rocket with no mass.
   *
   *  **It reaches no surface, and asking that question is the whole point of this case.** That design
   *  has no motor assigned at all, so `hasPropulsion` is false, so `motorsComplete` is false, and
   *  every one of the six registered margin surfaces withholds on exactly that flag. A first pass at
   *  this filed it as a Sev-1 and added `result.liftoffMass > 0` to the predicate; the negative
   *  control then refused to fail, which is precisely what a guard that changes nothing looks like,
   *  and the extra condition was reverted. `MAINTAINING.md` is explicit that a speculative guard
   *  firing on zero real files is worse than nothing, and `HANDOFF.md` records the same trap from the
   *  other side: the screen can read the code correctly every time and never ask whether a user can
   *  get there.
   *
   *  So this asserts the RELATIONSHIP rather than a guard — massless implies withheld — and it is
   *  worth keeping because the route to breaking it is one change wide: give that design a motor
   *  that resolves, whether by an adapter fix or a corpus re-cut, and a 6.32 cal margin computed from
   *  zero mass reaches every surface at once. It fails then, and it says why. */
  it("never lets a design that weighs nothing reach a surface with a loaded figure", async () => {
    const published: string[] = [];
    let massless = 0;
    let flown = 0;
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      let run;
      try {
        run = runFromDocument(doc, {});
      } catch {
        continue; // no motor configuration to fly at all — a different case, covered elsewhere
      }
      flown++;
      if (run.result.liftoffMass > 0) continue;
      massless++;
      if (run.motorsComplete)
        published.push(
          `${shortName(f.name)}: liftoff mass 0 kg and motorsComplete true — a static margin of ` +
            `${run.result.staticMarginCal.toFixed(2)} cal computed from no mass would reach every ` +
            `margin surface. Withhold it on the loaded-figure predicate rather than per surface.`,
        );
    }
    console.log(
      `loaded-figure reachability across ${files.length} design files: ${flown} flown, ` +
        `${massless} weighing nothing at liftoff, ${published.length} of those reaching a surface`,
    );
    expect(flown, "no design flew, so this asserted nothing").toBeGreaterThan(0);
    expect(
      massless,
      "no design in the corpus weighs nothing at liftoff — the case this guards is gone, so either " +
        "the corpus was re-cut or an importer started inventing a mass; re-derive before deleting",
    ).toBeGreaterThan(0);
    expect(published, "designs that weigh nothing and still reach a surface with a loaded figure").toEqual([]);
  }, 300_000);

  /** **The flyer's own scale reading lands on the airframe of every real design.**
   *
   *  The nose cone and the body tube were the last airframe kinds with no mass control: measured over
   *  this corpus, **13 body-tube and 10 nose-cone masses** come from the design or its own tool rather
   *  than from Loft, and Loft had read every one of them since the first importer with no way to write
   *  one. (The figure previously recorded for the nose cone was 26; re-measured 2026-08-10 by two
   *  independent counts over the same files it is 10, and the body tube's 13 reproduced exactly.)
   *
   *  Asserted as a RELATIONSHIP over every design rather than as golden numbers, so a corpus re-cut
   *  cannot silently disarm it: on each file the weight lands on the part it was aimed at, marks
   *  itself the flyer's, never swallows the assembly inside the tube, and moves the design's dry mass.
   *  The populations are asserted non-empty for the same reason the census is printed — a sweep that
   *  examined nothing must not read like one that passed. */
  it("puts the flyer's own weight on every real design's nose cone and body tube", async () => {
    const wrong: string[] = [];
    let lumpedSkipped = 0;
    // **The second half, and it is the one a green gate would otherwise hide.** Where an assembly
    // states one weight for itself and everything in it, a part inside contributes nothing of its
    // own — so a mass typed on that part changes no flight, and the panel withholds the control and
    // names the carrier instead. The two ways of asking that question have to agree everywhere: the
    // mass model's own `subsumedBy`, which the parts table prints, and `statedMassHolder`, which the
    // property panel reads. They disagreeing is how one surface comes to caveat what another states
    // plainly.
    const subsumedMismatch: string[] = [];
    let subsumed = 0;
    let subsumedDesigns = 0;
    const AIMABLE = new Set([
      "nosecone", "bodytube", "tubecoupler", "centeringring", "bulkhead", "engineblock",
      "innertube", "shockcord", "launchlug", "railbutton", "masscomponent", "parachute",
    ]);
    let cones = 0;
    let tubes = 0;
    let multiTube = 0;
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const rocket = doc.rocket;
      // **A design whose whole weight is ONE lump is the case where this control is correctly
      // refused, not the case where it must land.** Its adapter's single point mass already contains
      // the cone and the tube, so writing an override on either would ADD to a figure that includes
      // it — which is what the sibling case below asserts, and what this one must therefore skip.
      // Counted rather than silently passed over, so a corpus re-cut cannot empty both populations.
      if (statedAirframeMass(rocket)) {
        lumpedSkipped++;
        continue;
      }
      const base = dryMassProperties(rocket).mass;
      const masses = massByComponent(rocket);
      let hereSubsumed = 0;
      for (const p of flattenRocket(rocket)) {
        if (!AIMABLE.has(p.component.kind)) continue;
        const byMassModel = masses.get(p.component.id)?.subsumedBy !== undefined;
        const byHolder = statedMassHolder(rocket, p.component.id) !== null;
        if (byMassModel !== byHolder)
          subsumedMismatch.push(
            `${shortName(f.name)}: ${p.component.kind} "${p.component.name}" — parts table says ` +
              `${byMassModel ? "counted elsewhere" : "its own"}, the property panel says ` +
              `${byHolder ? "counted elsewhere" : "its own"}`,
          );
        if (byMassModel) hereSubsumed++;
      }
      subsumed += hereSubsumed;
      if (hereSubsumed > 0) subsumedDesigns++;
      const nose = flattenRocket(rocket).find((p) => p.component.kind === "nosecone")?.component;
      const allTubes = flattenRocket(rocket)
        .filter((p) => p.component.kind === "bodytube")
        .map((p) => p.component);
      if (allTubes.length > 1) multiTube++;

      if (nose) {
        cones++;
        const edited = applyGeometryEdits(rocket, { noseMass: 0.25 });
        const after = flattenRocket(edited).find((p) => p.component.id === nose.id)!.component as {
          overrideMass?: number;
          massFrom?: string;
        };
        if (after.overrideMass !== 0.25 || after.massFrom !== "flyer")
          wrong.push(`${shortName(f.name)}: a stated nose mass did not land on the cone`);
        // The flight only has to move where the cone's own weight is what the design flies. Inside an
        // assembly that states one figure for everything in it, the cone contributes nothing and the
        // dry mass correctly sits still — which is precisely why the panel refuses to offer the
        // control there rather than accepting a number and dropping it.
        const noseCarried = statedMassHolder(rocket, nose.id) !== null;
        if (!noseCarried && Math.abs(dryMassProperties(edited).mass - base) < 1e-9)
          wrong.push(`${shortName(f.name)}: a stated nose mass did not move the design's dry mass`);
        if (noseCarried && Math.abs(dryMassProperties(edited).mass - base) > 1e-9)
          wrong.push(`${shortName(f.name)}: a nose mass moved a design whose stage states its weight`);
      }

      // Aim the LAST tube, so a design carrying several is a real test of the aim rather than of the
      // fallback — the fallback and the aim agree on a single-tube design and only there.
      const aimed = allTubes[allTubes.length - 1];
      if (aimed) {
        tubes++;
        const edited = applyGeometryEdits(rocket, { bodyTubeId: aimed.id, bodyTubeMass: 0.25 });
        const flat = flattenRocket(edited);
        const after = flat.find((p) => p.component.id === aimed.id)!.component as {
          overrideMass?: number;
          overrideSubcomponents?: boolean;
          massFrom?: string;
        };
        if (after.overrideMass !== 0.25 || after.massFrom !== "flyer")
          wrong.push(`${shortName(f.name)}: a stated tube mass did not land on the aimed tube`);
        if (after.overrideSubcomponents !== undefined)
          wrong.push(`${shortName(f.name)}: a stated tube mass claimed the assembly inside the tube`);
        // No other tube took the figure — the failure a single-tube design cannot show.
        for (const other of allTubes) {
          if (other.id === aimed.id) continue;
          const o = flat.find((p) => p.component.id === other.id)!.component as {
            overrideMass?: number;
            massFrom?: string;
          };
          const was = other as { overrideMass?: number; massFrom?: string };
          if (o.overrideMass !== was.overrideMass || o.massFrom !== was.massFrom)
            wrong.push(`${shortName(f.name)}: a stated tube mass migrated onto another tube`);
        }
      }
    }
    console.log(
      `stated airframe weights across ${files.length} design files: ${cones} nose cone(s) and ` +
        `${tubes} body tube(s) aimable, ${multiTube} design(s) carrying more than one tube, ` +
        `${lumpedSkipped} design(s) skipped for stating one weight for the whole airframe`,
    );
    expect(subsumedMismatch, "parts where the two answers to 'is this mass counted elsewhere' disagree").toEqual([]);
    console.log(
      `parts whose mass an assembly already states: ${subsumed} across ${subsumedDesigns} design file(s) — ` +
        `each one a mass field the property panel withholds and names the carrier for`,
    );
    expect(subsumed, "no design states an assembly weight — the withheld case is untested").toBeGreaterThan(0);
    expect(cones, "no design carried a nose cone, so this asserted nothing").toBeGreaterThan(0);
    expect(tubes, "no design carried a body tube, so this asserted nothing").toBeGreaterThan(0);
    expect(multiTube, "no design carried a second tube — the aim is untested without one").toBeGreaterThan(0);
    expect(wrong, "real designs where a flyer's stated airframe weight went astray").toEqual([]);
  }, 300_000);

  /** **The flyer's own balance point, on every real design's nose cone and body tube.**
   *
   *  The twin of the stated weight above, and it pins the three things that are NOT the same as the
   *  weight's:
   *
   *  1. **It is bounded.** A mass has no host to fit inside; a station does, and one off the end of
   *     the part cannot mean anything. Driven with a metre on parts that are centimetres long, the
   *     stored figure must be the part's own length and never the number typed.
   *  2. **It is marked.** `cgFrom: "flyer"` moves with the number, so `MassBreakdown`'s *CG from*
   *     column cannot caption a hand-typed station "Loft's own" — the claim about a calculation that
   *     never happened.
   *  3. **The refusal predicate is the SOLVER's answer, not the mass model's.** `statedCGReachesDesign`
   *     perturbs the part and asks whether the design's balance point moves. This asserts the panel's
   *     answer against what the flight actually does, in both directions, on every real design: where
   *     it says the control is live the design's CG must move, and where it says the control is dead
   *     the design's CG must sit still. Reusing `statedMassHolder` here — the obvious shortcut —
   *     would have greyed out a working control on the stage-override designs, where a per-part CG is
   *     honoured while a per-part MASS on the same part is not. */
  it("puts the flyer's own balance point on every real design's nose cone and body tube, and bounds it", async () => {
    const wrong: string[] = [];
    let cones = 0;
    let tubes = 0;
    let live = 0;
    let dead = 0;
    let clamped = 0;
    let idempotent = 0;
    let subsumedButLive = 0;
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const { rocket } = doc;
      const baseCg = dryMassProperties(rocket).cg;
      if (!Number.isFinite(baseCg)) continue;
      const flatBefore = flattenRocket(rocket);
      const nose = flatBefore.find((p) => p.component.kind === "nosecone")?.component;
      const allTubes = flatBefore.filter((p) => p.component.kind === "bodytube").map((p) => p.component);
      const aimed = allTubes[allTubes.length - 1];

      for (const [part, bag] of [
        [nose, (v: number) => ({ noseCGx: v })],
        [aimed, (v: number) => ({ bodyTubeId: aimed?.id, bodyTubeCGx: v })],
      ] as const) {
        if (!part) continue;
        const len = (part as { length: number }).length;
        if (part === nose) cones++;
        else tubes++;
        const reaches = statedCGReachesDesign(rocket, part.id);
        if (reaches) live++;
        else dead++;

        // A station a whole metre down a part that is centimetres long: the bound is what must
        // decide the stored figure, not the number typed.
        //
        // **The bound is the whole PART's extent, not the body's length** (2026-08-13). It was `len`
        // until a stated CG came to mean the whole part's centroid, shoulders included; a shouldered
        // cone can genuinely balance behind its base, so clamping to `len` would refuse the reading
        // the panel asks the flyer for. `statedCGBounds` is the one definition, shared with
        // `withStatedCG` and `localBodyCGx`, so these three cannot drift apart on what a stated
        // balance point is allowed to be. 25 of the corpus's cones carry a shoulder and moved this
        // expectation when the semantics changed — which is the assertion doing its job.
        const over = applyGeometryEdits(rocket, bag(1));
        const stored = flattenRocket(over).find((p) => p.component.id === part.id)!.component as {
          overrideCGx?: number;
          cgFrom?: string;
        };
        const bound = statedCGBounds(part)?.max ?? len;
        if (bound < 1) {
          clamped++;
          if (stored.overrideCGx === undefined || Math.abs(stored.overrideCGx - bound) > 1e-9)
            wrong.push(`${shortName(f.name)}: a balance point past the end of a ${part.kind} was stored as ${stored.overrideCGx}, not clamped to ${bound}`);
        }
        if (stored.cgFrom !== "flyer")
          wrong.push(`${shortName(f.name)}: a stated ${part.kind} balance point is not marked as the flyer's`);

        // **Checked against an INDEPENDENT fact, because the obvious check is a tautology.** The
        // first draft recomputed `[0, len].some(probe moves the design CG)` and compared it with
        // `statedCGReachesDesign` — which is that expression, term for term. It agreed on 70 of 70 by
        // construction and both failure branches were unreachable: a compliance check that cannot
        // fail, written one increment after the milestone whose whole subject is compliance checks
        // that cannot fail.
        //
        // The independent fact is whether the part produces a structural point mass at all. A CG is
        // a station for a mass to act at, so a part with no mass of its own has nothing for a stated
        // station to move, and one with a mass of its own does. That is a different question asked of
        // a different function, and it can disagree.
        // Asserted one direction at a time, because the two directions are different claims and the
        // first draft of this conflated them. A REFUSED control tells the flyer *this part carries no
        // weight of its own for a balance point to place* — so the check is that the part produces no
        // point mass at all, which is what that sentence means and is answered by a different
        // function than the predicate under test. This is the assertion that would have caught the
        // refusal's original wording, which named an assembly override that is not operating on any
        // of the 8 real cases.
        const entry = massByComponent(rocket).get(part.id);
        if (!reaches && entry !== undefined)
          wrong.push(
            `${shortName(f.name)}: the ${part.kind}'s balance point is refused for carrying no weight, but it produces a point mass`,
          );
        // The other direction is deliberately NOT "offered ⇒ carries its own mass", which is false and
        // is the most interesting thing here: a part subsumed by a STAGE-level lump has no mass of its
        // own and its balance point is still live, because the lump's CG is recomputed from every
        // subsumed part. A part subsumed by a COMPONENT-level override is skipped outright and is not.
        // Counted rather than asserted, so the population is visible if a corpus re-cut empties it.
        if (reaches && entry !== undefined && entry.subsumedBy !== undefined) subsumedButLive++;
        // And the placeholder must be a FIXED POINT: committing the figure the box already shows
        // cannot move the flight. This is what caught the shoulder blend, when `overrideCGx` replaced
        // the body centroid while the reported CG included the shoulder — offering the reported
        // figure moved the design's CG on 15 of 57 live controls. That blend is gone (2026-08-13); a
        // stated CG is now the whole part's centroid and this asserts the property still holds.
        //
        // **It is blind to the population where the property last broke, and that is worth stating
        // here rather than discovering twice.** This drives the two PANEL controls over real design
        // files, and 0 of the 35 carry a cone whose whole-part balance point sits behind its own
        // base — so it passed green while the bound in `localBodyCGx` was wrong for exactly that
        // shape. The catalogue is where it is reachable (a cone pick is one click from the front
        // door), and `lib/model/edit.test.ts`'s *"every catalogued cone's shown balance point is one
        // the design actually flies at"* is the check that covers it.
        const shown = localBodyCGx(rocket, part.id);
        if (reaches && shown !== undefined) {
          const cg = dryMassProperties(applyGeometryEdits(rocket, bag(shown))).cg;
          if (Number.isFinite(cg) && Math.abs(cg - baseCg) > 1e-6)
            wrong.push(
              `${shortName(f.name)}: typing the ${part.kind} placeholder back moved the design CG by ` +
                `${((cg - baseCg) * 1000).toFixed(2)} mm — the box shows a number it does not hold`,
            );
          idempotent++;
        }
      }
    }
    console.log(
      `stated balance points across ${files.length} design files: ${cones} nose cone(s) and ${tubes} body tube(s) ` +
        `offered, ${live} control(s) the flight answers to and ${dead} it does not, ${clamped} bound to the part's own length, ` +
        `${idempotent} whose shown figure is a fixed point, ${subsumedButLive} live on a part a stage lump subsumes`,
    );
    expect(cones, "no design carried a nose cone, so this asserted nothing").toBeGreaterThan(0);
    expect(tubes, "no design carried a body tube, so this asserted nothing").toBeGreaterThan(0);
    expect(clamped, "no part was short enough to test the bound").toBeGreaterThan(0);
    expect(live, "no design offered a live balance-point control — the whole feature is untested").toBeGreaterThan(0);
    expect(dead, "no design refused one — the refusal's stated reason is untested").toBeGreaterThan(0);
    expect(
      subsumedButLive,
      "no subsumed-but-live part — the case that stops this reusing the mass model's predicate is untested",
    ).toBeGreaterThan(0);
    expect(wrong, "real designs where a flyer's stated balance point went astray").toEqual([]);
  }, 300_000);

  /** **Every note a real design file carries, read in and written back out unchanged.**
   *
   *  Loft read none of them and wrote none of them, so import → download deleted the lot. Measured
   *  over this corpus at the commit before the fix: 40 non-empty `<comment>` elements across 18 of
   *  the 27 `.ork` designs — 16 on the rocket itself, 1 on a stage, 23 on components (12 centring
   *  rings, 6 shock cords, 2 fin sets, and one each of transition, inner tube and nose cone) — plus
   *  40 non-empty `<PartDesc>` across all 4 `.rkt` designs and one design-level `<Comments>`. Eighty
   *  one notes on 22 of the 35 designs, and Loft destroyed every one of them. That is prose the flyer typed, and it is
   *  the one thing a round trip cannot recompute: a dropped mass comes back slightly wrong from the
   *  material and the geometry, a dropped sentence is gone.
   *
   *  Asserted as a MULTISET rather than per-part, because the round trip does not promise to keep a
   *  component id (`.rkt` parts are minted fresh on every import) and this is a question about the
   *  prose, not about identity. The census is printed and the count is asserted non-zero, so a
   *  corpus re-cut that dropped every annotated file could not leave this passing on nothing. */
  it("carries every note a real design wrote, and loses none of them on the way back out", async () => {
    const notes = (r: Rocket): string[] => {
      const out: string[] = [];
      if (r.comment) out.push(r.comment);
      for (const s of r.stages) if (s.comment) out.push(s.comment);
      for (const p of flattenRocket(r)) if (p.component.comment) out.push(p.component.comment);
      return out.sort();
    };
    let total = 0;
    let annotated = 0;
    const onRocket: string[] = [];
    const lost: string[] = [];
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const before = notes(doc.rocket);
      if (!before.length) continue;
      annotated++;
      total += before.length;
      if (doc.rocket.comment) onRocket.push(shortName(f.name));
      const back = await importDesign(exportOrk(doc));
      const after = notes(back.rocket);
      if (JSON.stringify(after) !== JSON.stringify(before)) {
        const missing = before.filter((n) => !after.includes(n));
        lost.push(
          `${shortName(f.name)}: ${before.length} note(s) in, ${after.length} out` +
            (missing.length ? ` — first lost: ${JSON.stringify(missing[0].slice(0, 60))}` : ""),
        );
      }
    }
    console.log(
      `author notes across ${files.length} design files: ${total} on ${annotated} annotated design(s), ` +
        `${onRocket.length} of them a design-level note`,
    );
    expect(total, "no design file carried a note, so this asserted nothing").toBeGreaterThan(0);
    expect(lost, "notes a design carried that did not survive the round trip").toEqual([]);
  }, 300_000);

  it("carries every real design's tree structure through the flatten, not just its order", async () => {
    // **`flattenRocket` walked depth-first and threw the depth away**, so every surface built on it
    // could only ever show a flat list — which is most of why the parts table reads as a list of
    // parts rather than a picture of the design. R12's first requirement is a tree the flyer can
    // SEE, and it cannot be built from a projection that does not carry one.
    //
    // Driven over the real corpus rather than a fixture because the shapes that matter are the ones
    // nobody would think to synthesize: a coupler inside a tube with a chute inside the coupler, a
    // mass object under a nose, a stage whose parts nest four deep.
    //
    // What is asserted is INTERNAL CONSISTENCY, not a golden number, so it holds as the corpus is
    // re-cut: every non-root part names a parent that (a) exists, (b) appears BEFORE it — the walk
    // is depth-first, so a child can never precede its host — (c) is exactly one level shallower,
    // and (d) is in the same stage. Then a control, because a sweep that examined nothing reports
    // no violations and prints exactly like a pass.
    let parts = 0;
    let nested = 0;
    let maxDepth = 0;
    const stageCounts = new Set<number>();
    const bad: string[] = [];

    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const flat = flattenRocket(doc.rocket);
      const seen = new Map<string, { depth: number; stageIndex: number }>();
      for (const p of flat) {
        parts++;
        maxDepth = Math.max(maxDepth, p.depth);
        stageCounts.add(p.stageIndex);
        const where = `${shortName(f.name)} · "${p.component.name}" (${p.component.kind})`;
        if (p.depth === 0) {
          if (p.parentId !== undefined) bad.push(`${where}: depth 0 but names a parent`);
        } else {
          nested++;
          const parent = p.parentId === undefined ? undefined : seen.get(p.parentId);
          if (!parent) bad.push(`${where}: depth ${p.depth} with no parent seen before it`);
          else {
            if (parent.depth !== p.depth - 1) bad.push(`${where}: depth ${p.depth} under a parent at ${parent.depth}`);
            if (parent.stageIndex !== p.stageIndex) bad.push(`${where}: stage ${p.stageIndex} under a parent in stage ${parent.stageIndex}`);
          }
        }
        seen.set(p.component.id, { depth: p.depth, stageIndex: p.stageIndex });
      }
      // The flatten must still describe the whole design, not a pruned version of it.
      const total = doc.rocket.stages.reduce((n, s) => {
        const count = (cs: RocketComponent[]): number => cs.reduce((k, c) => k + 1 + count(c.children), 0);
        return n + count(s.components);
      }, 0);
      if (total !== flat.length) bad.push(`${shortName(f.name)}: flattened ${flat.length} of ${total} components`);
    }

    console.log(
      `component trees across ${files.length} design files: ${parts} parts, ${nested} nested ` +
        `(${((100 * nested) / Math.max(1, parts)).toFixed(1)}%), deepest ${maxDepth}, ` +
        `${stageCounts.size} distinct stage index(es)`,
    );
    expect(bad, "components whose place in the tree does not survive the flatten").toEqual([]);
    // CONTROLS. A corpus with no nesting at all would pass every assertion above while proving
    // nothing, and a depth that never exceeds 1 would not exercise the recursion.
    expect(parts, "the sweep examined no components").toBeGreaterThan(100);
    expect(nested, "no component in the entire corpus is nested — the walk is not carrying depth").toBeGreaterThan(50);
    expect(maxDepth, "the corpus never nests more than one level deep").toBeGreaterThan(1);
  }, 300_000);

  it("never lets a removal leave a design with no mass, and says so when it moves none", async () => {
    // R2's delete surface, held to its *done when* — "delete it, see stability, dry mass and apogee
    // move" — across every real design rather than the two committed fixtures. It runs here, in the
    // corpus suite, precisely because it needs real files: the case it exists for was only reachable
    // on formats and overrides the synthetic fixtures do not have. On a clone with no corpus this
    // whole suite skips itself, so a fork's CI stays green.
    //
    // Two rules, and both were broken when this was first driven over all 56 mass objects:
    //   1. no removal may leave a weightless design. Every `.CDX1` import mints one point mass
    //      carrying the entire stated launch weight, and removing it took `Show-off.CDX1` to 0.0 g
    //      dry with its CG at the nose tip and flipped `Complex.Two-Stage.CDX1` to −0.92 caliber,
    //      both still flown with a confident apogee;
    //   2. a removal that sheds NO mass must be explained by something in the model — a stated
    //      whole-assembly weight — rather than being a total that silently sits still.
    const weightless: string[] = [];
    const unexplained: string[] = [];
    let driven = 0;

    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const before = dryMassProperties(doc.rocket);
      if (!(before.mass > 0)) continue; // a design with no mass to begin with proves nothing here
      for (const p of flattenRocket(doc.rocket)) {
        if (removalRefusal(doc.rocket, p.component.id)) continue;
        driven++;
        const after = dryMassProperties(applyGeometryEdits(doc.rocket, { removedIds: [p.component.id] }));
        const where = `${shortName(f.name)} · "${p.component.name}" (${p.component.kind})`;
        if (!(after.mass > 0)) weightless.push(where);
        // Only a part that HAD mass is expected to shed any — a launch lug or a coupler weighing
        // nothing sheds nothing for an honest reason, and a notice about an override that is not
        // there would be worse than silence.
        const own = massByComponent(doc.rocket).get(p.component.id)?.mass ?? 0;
        if (own > 1e-9 && Math.abs(before.mass - after.mass) < 1e-9 && !statedMassHolder(doc.rocket, p.component.id)) {
          unexplained.push(`${where} — ${(own * 1000).toFixed(1)} g removed, dry total unmoved`);
        }
      }
    }

    // The denominator, printed so a run that examined nothing cannot read like a pass.
    console.log(`removable parts driven across ${files.length} design files: ${driven}`);
    expect(driven, "no removable part was driven — the sweep proves nothing").toBeGreaterThan(100);
    expect(weightless, "removals that left a design with no mass at all").toEqual([]);
    expect(unexplained, "removals that shed a part's mass without the total moving, and nothing says why").toEqual([]);
  }, 300_000);

  it("never authors a part that opens a step, floats outside its host, or cannot be taken back", async () => {
    // R3's authoring surface, held across every real design rather than the two committed fixtures —
    // and it exists because the synthetic fixtures could not have caught what shipped. Every unit test
    // in `edit.test.ts` authors onto a single-stage design or a hand-built three-component literal, so
    // a bug that only appears where a STAGE ENDS passed a full green gate: `nextTopLevel` searched one
    // stage's list, the last tube of a booster read as having nothing behind it, and "add a transition"
    // built a contracting tail cone in the middle of a multi-stage rocket — 10 of 91 anchors, worst
    // opening a 77.4 mm step on `02.Two-stage.ork`. Real files are the only place that is reachable:
    // 9 of the 35 corpus designs are multi-stage and 12 stage boundaries sit between their sections.
    //
    // Four rules, one per way an authored part can be wrong:
    //   1. a transition never opens a mould-line step that was not already there. Loft has no drag
    //      term for a bare radius step, so a shape the gesture INVENTS is a shape flown optimistically;
    //   2. a mass object sits inside the part holding it — the solver puts mass wherever the tree says,
    //      so one placed outside the airframe is still flown, at a CG nobody could build;
    //   3. everything authored is removable, or the flyer is in a state with no way back;
    //   4. everything authored is aimable, or the fields silently edit some other part.
    const openedAStep: string[] = [];
    const floating: string[] = [];
    const stuck: string[] = [];
    const unaimable: string[] = [];
    const misplaced: string[] = [];
    const shapeless: string[] = [];
    const misanchored: string[] = [];
    let driven = 0;
    let transMade = 0;
    let massMade = 0;
    let stations = 0;
    let resized_ = 0;

    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const pristine = doc.rocket;
      for (const anchor of flattenRocket(pristine)) {
        if (anchor.component.kind !== "bodytube") continue;
        const where = `${shortName(f.name)} · behind "${anchor.component.name}"`;

        // --- a transition -------------------------------------------------------------------
        const d = transitionDefaults(pristine, anchor.component.id);
        if (d) {
          const id = newPartId(pristine, undefined, anchor.component.id);
          const built = applyGeometryEdits(pristine, {
            added: [{ id, kind: "transition", after: anchor.component.id, length: d.length }],
          });
          const made = flattenRocket(built).find((p) => p.component.id === id);
          if (made) {
            driven++;
            transMade++;
            // Measured from the flattened STATIONS, not through `mouldLineStep` — a test that shares
            // the helper under suspicion is blind in exactly the way the code is. Proved: reverting
            // `nextTopLevel` to its single-stage search leaves this suite green if the step is asked
            // of `mouldLineStep`, because that function goes blind at the same boundary. Walking the
            // geometry instead catches all 10 mis-read anchors.
            //
            // BOTH joints, and with no excuse for a design that already stepped. An earlier version
            // only judged the aft joint and only when the step grew, which excused exactly the 17
            // step-closing anchors the fairing branch exists for — deleting that branch outright fired
            // the rule at 0 of 90. The rule is simply that an authored transition fairs at both ends:
            // to its anchor in front, and to whatever follows it, or nothing follows and there is no
            // joint to judge.
            const nowThere = stepBehind(built, id);
            if (Math.abs(nowThere) > 0.0005) {
              openedAStep.push(`${where} — aft joint steps ${(Math.abs(nowThere) * 1000).toFixed(1)} mm of diameter`);
            }
            const foreJoint = stepBehind(built, anchor.component.id);
            if (Math.abs(foreJoint) > 0.0005) {
              openedAStep.push(`${where} — fore joint steps ${(Math.abs(foreJoint) * 1000).toFixed(1)} mm of diameter`);
            }
            // What was built has to BE a transition: a positive length, and — where nothing follows —
            // an exit narrower than its entry, which is the base-drag lever the part exists for.
            const c = made.component as { length: number; foreRadius: number; aftRadius: number };
            if (!(c.length > 0)) shapeless.push(`${where} — length ${(c.length * 1000).toFixed(2)} mm`);
            if (!(c.foreRadius > 0) || !(c.aftRadius > 0)) {
              shapeless.push(`${where} — radii ${(c.foreRadius * 2000).toFixed(1)}→${(c.aftRadius * 2000).toFixed(1)} mm`);
            }
            const follows = flattenRocket(built).some(
              (q) => Math.abs(q.xFore - (made.xFore + made.length)) < 1e-6 && isBodyPart(q.component.kind),
            );
            if (!follows && !(c.aftRadius < c.foreRadius - 1e-9)) {
              shapeless.push(`${where} — a tail cone that does not contract (${(c.foreRadius * 2000).toFixed(1)}→${(c.aftRadius * 2000).toFixed(1)} mm)`);
            }
            // And it sits immediately behind the part it names, not merely somewhere in the stage.
            if (Math.abs(made.xFore - (anchor.xFore + anchor.length)) > 1e-6) {
              misanchored.push(`${where} — landed at ${(made.xFore * 1000).toFixed(1)} mm, anchor ends at ${((anchor.xFore + anchor.length) * 1000).toFixed(1)} mm`);
            }
            if (removalRefusal(built, id)) stuck.push(`${where} (transition)`);
            if (aimEditsAt(built, id).transitionId !== id) unaimable.push(`${where} (transition)`);
          }
        }

        // --- a mass object ------------------------------------------------------------------
        const mid = newPartId(pristine, undefined, anchor.component.id);
        const withMass = applyGeometryEdits(pristine, {
          added: [{ id: mid, kind: "masscomponent", after: anchor.component.id, length: 0 }],
        });
        const mass = flattenRocket(withMass).find((p) => p.component.id === mid);
        if (!mass) continue;
        driven++;
        massMade++;
        const host = flattenRocket(withMass).find((p) => p.component.id === anchor.component.id)!;
        if (mass.xFore < host.xFore - 1e-9 || mass.xFore > host.xFore + host.length + 1e-9) {
          floating.push(`${where} — station ${(mass.xFore * 1000).toFixed(1)} mm, host ${(host.xFore * 1000).toFixed(1)}–${((host.xFore + host.length) * 1000).toFixed(1)} mm`);
        }
        // A mass object with no mass is not a mass object, and it is the one number the part is for.
        const built = mass.component as { mass: number };
        if (!(built.mass > 0)) shapeless.push(`${where} — a mass object weighing ${(built.mass * 1000).toFixed(2)} g`);
        if (removalRefusal(withMass, mid)) stuck.push(`${where} (mass object)`);
        if (aimEditsAt(withMass, mid).massObjectId !== mid) unaimable.push(`${where} (mass object)`);

        // **Rule 6, and it is a SEV-1 this sweep could not see until 2026-08-18: the host RESIZED
        // under the mass after it was placed.** The station was derived once, from the length the
        // host has when `applyAdds` runs — the FILE's — and `applyDimensionEdits` runs afterwards.
        // `resolveChildFore`'s `top` arm never clamps, so the mass did not move with the shrinking
        // host: measured across this corpus before the fix, the mass landed outside its host on
        // **35 of 35 designs** and past the whole airframe's tail on **7**, moving static margin by
        // up to **2.73 cal**. Every check above ran on a design nobody had edited, which is the one
        // shape of this sweep that could not reach it.
        //
        // Every anchor in this loop is already a body tube (the `continue` at the top of it), which
        // is what makes `bodyLength` the aimed edit that resizes the host — so there is no second
        // filter here and a first draft's `if (kind === "bodytube")` was a guard that could not be
        // false, reading as a narrowing that did real work. **The other four kinds with a bay are NOT
        // covered by this sweep and are NOT unit-pinned either** — a first draft of this comment said
        // they were, and all three unit cases resolve their host through `primaryBodyTube`. What is
        // pinned is the rule on a tube, on every design; the coupler case, which is the one
        // `fitAddedInternalParts` can shorten AFTER `withMassStation` has clamped, has no check at
        // all and is filed.
        const shrunkTo = Math.max(0.02, host.length * 0.3);
        const resized = applyGeometryEdits(pristine, {
          added: [{ id: mid, kind: "masscomponent", after: anchor.component.id, length: 0 }],
          bodyTubeId: anchor.component.id,
          bodyLength: shrunkTo,
        });
        const rf = flattenRocket(resized);
        const rm = rf.find((p) => p.component.id === mid);
        const rh = rf.find((p) => p.component.id === anchor.component.id);
        if (rm && rh) {
          resized_++;
          if (rm.xFore < rh.xFore - 1e-9 || rm.xFore > rh.xFore + rh.length + 1e-9) {
            floating.push(
              `${where} — after the host was resized to ${(shrunkTo * 1000).toFixed(1)} mm, the mass flies at ` +
                `${(rm.xFore * 1000).toFixed(1)} mm and its host spans ` +
                `${(rh.xFore * 1000).toFixed(1)}–${((rh.xFore + rh.length) * 1000).toFixed(1)} mm`,
            );
          }
        }
      }

      // --- a mass object's STATION, on the design's OWN masses ------------------------------
      // Rule 5, and the one the first version of this sweep could not see: the grip and the field
      // both speak an absolute station from the nose tip, so the station a flyer asks for must be
      // the station that is flown — or, where it falls outside the part holding the mass, the
      // nearest point inside it. Driven on the design's own mass objects rather than an authored
      // one, because the failure was in how the HOST is resolved and imported masses use all four
      // placement methods (31 top, 12 absolute, 8 bottom, 5 middle across the corpus) where an
      // authored one is always `top`. Driven with a length edit live underneath, because the other
      // half of the failure was reading the host's extent from the pre-edit tree — and shaping the
      // airframe before placing the mass is the ordinary build order.
      const own = primaryMassObject(pristine);
      const ownHost = own
        ? flattenRocket(pristine).find((p) => p.component.children.some((c) => c.id === own.id))
        : undefined;
      if (!own || !ownHost || !(ownHost.length > 0)) continue;
      const nose = primaryNose(pristine);
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const want = ownHost.xFore + ownHost.length * t;
        for (const alsoEdit of [{}, nose ? { noseLength: nose.length * 1.6 } : {}]) {
          stations++;
          const moved = applyGeometryEdits(pristine, {
            ...alsoEdit,
            massObjectId: own.id,
            massObjectStation: want,
          });
          const at = flattenRocket(moved).find((p) => p.component.id === own.id)?.xFore;
          const host = flattenRocket(moved).find((p) => p.component.children.some((c) => c.id === own.id));
          if (at === undefined || !host) continue;
          const clamped = Math.max(host.xFore, Math.min(host.xFore + host.length, want));
          if (Math.abs(at - clamped) > 1e-6) {
            misplaced.push(
              `${shortName(f.name)} · "${own.name}" (${own.placement.method}) — asked ${(want * 1000).toFixed(1)} mm, flown ${(at * 1000).toFixed(1)} mm, host ${(host.xFore * 1000).toFixed(1)}–${((host.xFore + host.length) * 1000).toFixed(1)} mm`,
            );
          }
        }
      }
    }

    // The denominator, printed so a run that examined nothing cannot read like a pass.
    // Denominators PER BRANCH, printed and asserted separately. One merged counter passed at 135 with
    // the transition branch half dead, and could not say which half.
    console.log(`authored parts driven across ${files.length} design files: ${driven} (${transMade} transitions, ${massMade} mass objects)`);
    console.log(`mass-object stations driven across ${files.length} design files: ${stations}`);
    console.log(`authored masses re-checked after their host was resized: ${resized_}`);
    expect(transMade, "no transition was authored — that branch proves nothing").toBeGreaterThan(80);
    expect(massMade, "no mass object was authored — that branch proves nothing").toBeGreaterThan(80);
    expect(stations, "no mass station was driven — that branch proves nothing").toBeGreaterThan(100);
    // Floored at 80 like its three siblings, not at a third of the real population: this branch
    // drives once per authored mass and lands at 90, so a floor of 30 would let two thirds of the
    // corpus stop being driven with the one guard whose stated job is "that branch proves nothing"
    // still green.
    expect(resized_, "no authored mass was re-checked after a resize — that branch proves nothing").toBeGreaterThan(80);
    expect(openedAStep, "authored transitions that opened a mould-line step the design did not have").toEqual([]);
    expect(floating, "authored mass objects placed outside the part holding them").toEqual([]);
    expect(stuck, "authored parts that cannot be removed again").toEqual([]);
    expect(unaimable, "authored parts the editor's fields cannot be aimed at").toEqual([]);
    expect(misplaced, "mass objects flown at a station other than the one asked for").toEqual([]);
    expect(shapeless, "authored parts built without the dimension that makes them that part").toEqual([]);
    expect(misanchored, "authored parts that did not land immediately behind the part they name").toEqual([]);
  }, 300_000);

  it("authors a booster on every real design, and every one of them separates", async () => {
    // R5's operation, held across every real airframe rather than the starter's two-part stack. The
    // load-bearing half is the CONFIGURATION write: a stage separates only if a configuration instance
    // names a mount inside it, so a booster with a mount and no instance never lights and never drops —
    // measured on the starter as a 37.5% apogee loss with no separation event and nothing said. Designs
    // carry up to five configurations, so an instance added to one and missing from another is the same
    // silent loss on whichever the flyer switches to.
    //
    // Four rules, one per way an authored stage can be wrong:
    //   1. the stack grows by exactly one, and the stages above it are untouched;
    //   2. every configuration gains an instance in the new mount — not just the flown one;
    //   3. the booster carries no recovery device, which the solver would never deploy from a lower
    //      stage and which a whole-subtree clone produces silently;
    //   4. dropping the entry restores the design exactly, which is what makes it undoable.
    const wrongCount: string[] = [];
    const missedConfig: string[] = [];
    const cloned: string[] = [];
    const notRestored: string[] = [];
    const refusedButOffered: string[] = [];
    const neverSeparated: string[] = [];
    const wrongMotor: string[] = [];
    let authored = 0;
    let refused = 0;
    let burnedOut = 0;
    let separated = 0;
    let flown = 0;

    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const seedId = newPartId(doc.rocket, [], "stage:1");
      const mountId = newPartId(doc.rocket, [{ id: seedId } as never], "mount:1");
      const edits = { addedStages: [{ seedId, mountId, name: "Booster" }] };
      const staged = applyGeometryEdits(doc.rocket, edits);
      // Refused where there is nothing to seed a FLYABLE booster from — no body tube, or an aft tube
      // with no motor mount to clone. `canAddStage` is the predicate the control is offered on, and it
      // must agree with what the operation actually does or the button does nothing.
      const offered = canAddStage(doc.rocket);
      if (staged.stages.length === doc.rocket.stages.length) {
        if (offered) refusedButOffered.push(`${f.name}: the control is offered and the operation refuses`);
        refused++;
        continue;
      }
      if (!offered) refusedButOffered.push(`${f.name}: the operation authored a stage the control hides`);
      authored++;

      // 1
      if (staged.stages.length !== doc.rocket.stages.length + 1) {
        wrongCount.push(`${f.name}: ${doc.rocket.stages.length} -> ${staged.stages.length} stages`);
      }
      if (JSON.stringify(staged.stages.slice(0, -1)) !== JSON.stringify(doc.rocket.stages)) {
        wrongCount.push(`${f.name}: authoring a booster changed a stage above it`);
      }
      // 2 — the effective mount is the entry's own id, or the seed tube itself on a min-diameter clone.
      const seed = staged.stages[staged.stages.length - 1].components[0];
      const effective = seed.children.some((c) => c.id === mountId) ? mountId : seed.id;
      // The mount the SOURCE tube used, which is what the booster's motor must be copied from.
      const src = flattenRocket(doc.rocket)
        .filter((p) => p.component.kind === "bodytube")
        .reduce((best, p) => (p.xFore > best.xFore ? p : best)).component;
      const srcMountId = src.children.find((c) => "motorMount" in c && c.motorMount !== undefined)?.id ?? src.id;
      for (const cfg of staged.configurations) {
        // A configuration the design says flies nothing stays flying nothing — see `applyAddedStages`.
        if (cfg.instances.length <= 1) continue;
        const inBooster = cfg.instances.find((i) => i.mountId === effective);
        if (!inBooster) {
          missedConfig.push(`${f.name}: configuration ${cfg.id} has no motor in the booster`);
          continue;
        }
        // And it is the motor the SEED TUBE'S OWN MOUNT flies, not whichever instance happens to be
        // first. On a design whose first instance sits in an upper stage those are different motors:
        // `Three stage low power rocket.ork` puts an A8 in a booster whose own mount flies a B6, and
        // apogee reads 294.4 m against the 334.2 m the aft mount gives — 11.9% low, with nothing said.
        // The separation assertion below cannot see this: the wrong motor still lights and still drops.
        const fromSeed = cfg.instances.find((i) => i.mountId === srcMountId);
        const designation = (i: { motor: { designation?: string } }) => i.motor?.designation ?? "";
        if (fromSeed && designation(inBooster) !== designation(fromSeed)) {
          wrongMotor.push(`${f.name}: booster flies ${designation(inBooster)} where its seed tube flies ${designation(fromSeed)}`);
        }
      }
      // 3
      if (seed.children.some((c) => c.kind === "parachute" || c.kind === "streamer")) {
        cloned.push(`${f.name}: a recovery device was cloned into the booster`);
      }
      // 4
      if (JSON.stringify(applyGeometryEdits(doc.rocket, { addedStages: [] })) !== JSON.stringify(doc.rocket)) {
        notRestored.push(`${f.name}: dropping the entry did not restore the design`);
      }

      // And it FLIES, with a separation event — the claim the other three exist to support. Only where
      // the design has propulsion at all; a design whose motor Loft cannot resolve has nothing to burn.
      const run = runFromDocument({ ...doc, rocket: staged }, {});
      if (run.hasPropulsion) {
        flown++;
        // Only a flight that reaches BURNOUT can separate, because the serial-staging default is to
        // separate when the stage finishes burning. One real design never gets there with a booster on
        // it and that is not a defect: `rocksimTestRocket1.rkt` is a 692 g airframe on an E6 at a 2.96
        // thrust-to-weight, and the extra stage takes its apogee from 141.6 m to 15.8 m — it reaches
        // the top of a 3.1 s flight while still burning. It is counted and named rather than dropped,
        // because a silently excluded case is how a rule stops meaning anything.
        if (run.result.events.some((e) => e.type === "burnout")) {
          burnedOut++;
          // The design's OWN separations, flown only where the branch needs them: a second full flight
          // for every design — including the 5 with no propulsion and the 1 that never burns out — is
          // what pushed this test past the 5 s default and turned CI red while the local gate stayed
          // green. Inside the branch it costs the 29 flights the comparison actually uses.
          const separationsBefore = runFromDocument(doc, {}).result.events.filter((e) => e.type === "separation").length;
          // EXACTLY one more than the design already had. `some(separation)` is satisfied by a
          // separation the design came with, so on the 9 multi-stage designs it was structurally blind
          // to the very defect this test exists to catch: a booster that never lights leaves the
          // pre-existing separations firing and the assertion green. `> before` fixes that half;
          // `=== before + 1` also catches a booster that separates while SUPPRESSING one of the
          // design's own, which is the same class of silent wrong flight in the other direction.
          const after = run.result.events.filter((e) => e.type === "separation").length;
          if (after === separationsBefore + 1) separated++;
          else neverSeparated.push(`${f.name}: burned out and the separation count did not rise by exactly one (${separationsBefore} -> ${after})`);
        }
      }
    }

    console.log(
      `boosters authored across ${files.length} design files: ${authored} authored, ${refused} refused; ` +
        `${flown} had propulsion, ${burnedOut} of those reached burnout, and ${separated} of THOSE separated ` +
        `(${flown - burnedOut} never burned out — too marginal to fly with a booster on it)`,
    );
    expect(authored, "no booster was authored — that branch proves nothing").toBeGreaterThan(20);
    expect(refusedButOffered, "the control and the operation disagree about whether a booster can be added").toEqual([]);
    expect(wrongCount, "an authored stage that did not append cleanly").toEqual([]);
    expect(missedConfig, "a configuration left without a motor in the booster").toEqual([]);
    expect(wrongMotor, "a booster flying a motor its own seed tube does not").toEqual([]);
    expect(cloned, "a recovery device cloned into a stage the solver never deploys from").toEqual([]);
    expect(notRestored, "dropping the entry did not restore the design").toEqual([]);
    // Every design that reaches burnout must stage. This is the assertion the configuration write
    // exists for: without an instance in the booster's mount the stage's burn duration is zero, it
    // never lights, and it never drops.
    expect(neverSeparated, "a design that burned out and still did not separate").toEqual([]);
    expect(separated, "no authored booster separated").toBe(burnedOut);
    expect(burnedOut, "no authored booster reached burnout — that branch proves nothing").toBeGreaterThan(20);
    // Two full flights per design — the pristine one for its separation count, and the staged one —
    // so this needs the same explicit budget its neighbours take rather than the 5 s default.
  }, 300_000);

  it("authors a motor mount on every real design that can take one, and unblocks the booster it exists for", async () => {
    // R5's last *done when* clause. The operation exists for the designs whose aft tube carries no
    // mount to clone, where `canAddStage` refuses a booster outright — so the assertion that matters
    // is not "the field got set", it is "the refusal it was written to lift is lifted".
    const offered: string[] = [];
    const refusedBooster: string[] = [];
    const unblocked: string[] = [];
    const stillRefused: string[] = [];
    const doubled: string[] = [];
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const tubes = flattenRocket(doc.rocket).filter((p) => p.component.kind === "bodytube");
      if (!tubes.length) continue;
      const aft = tubes.reduce((b, p) => (p.xFore > b.xFore ? p : b)).component;
      if (!canAddMount(doc.rocket, aft.id)) {
        if (!canAddStage(doc.rocket)) stillRefused.push(`${f.name}: no mount offered either`);
        continue;
      }
      offered.push(f.name);
      const bag = { mountAdds: [{ hostId: aft.id }] };
      const built = applyGeometryEdits(doc.rocket, bag);

      // The mount landed exactly once, and so did its motor. `applyMountAdds` runs at TWO points in
      // the pipeline, so a doubled instance would fly the design's motor twice on every design here.
      const holders = flattenRocket(built)
        .map((p) => p.component)
        .filter((c) => "motorMount" in c && (c as { motorMount?: unknown }).motorMount !== undefined)
        .filter((c) => c.id === aft.id);
      if (holders.length !== 1) doubled.push(`${f.name}: ${holders.length} mounts on one tube`);
      for (const cfg of built.configurations) {
        const n = cfg.instances.filter((i) => i.mountId === aft.id).length;
        if (n > 1) doubled.push(`${f.name}: ${n} instances naming one mount`);
      }

      if (!canAddStage(doc.rocket)) {
        refusedBooster.push(f.name);
        if (canAddStage(stageSeedBase(doc.rocket, bag))) unblocked.push(f.name);
        else stillRefused.push(`${f.name}: mount added, booster still refused`);
      }
    }
    console.log(
      `motor mounts authored across ${files.length} design files: offered on ${offered.length}; ` +
        `${refusedBooster.length} refused a booster before, ${unblocked.length} unblocked by a mount` +
        (stillRefused.length ? ` — still refused: ${stillRefused.join("; ")}` : ""),
    );
    expect(offered.length, "no design offered the gesture — that branch proves nothing").toBeGreaterThan(10);
    expect(doubled, "a mount or its motor landed more than once").toEqual([]);
    // The designs the operation was written for must actually be reachable by it. One of the two that
    // refuse a booster has no motor anywhere for Loft to put in a mount, so it refuses the mount too
    // and stays refused — which is the honest answer, not a gap.
    expect(unblocked.length, "the mount gesture unblocked no design that a booster was refused on").toBeGreaterThan(0);
  });

  it("changes only the motor mounts the cluster field says it is changing", async () => {
    // The field reads back off ONE mount and used to write to ALL of them, so a design whose mounts
    // hold different counts had its unmentioned mount silently rewritten. This drives the real
    // denominator: how many designs carry mounts that disagree, and what the edit does to them.
    const disagreeing: string[] = [];
    const rewritten: string[] = [];
    let mountsSeen = 0;
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const mounts = (r: typeof doc.rocket) =>
        flattenRocket(r)
          .map((p) => p.component)
          .filter((c) => "motorMount" in c && (c as { motorMount?: unknown }).motorMount !== undefined);
      const before = mounts(doc.rocket);
      if (!before.length) continue;
      mountsSeen += before.length;
      const outside = unreachableMountCount(doc.rocket);
      if (outside > 0) {
        disagreeing.push(
          `${f.name}: ${outside} of ${before.length} mount(s) outside the group the field reads ` +
            `(${primaryMotorClusterCount(doc.rocket)})`,
        );
      }
      // Commit a value the field could offer and check nothing outside the group moved.
      const group = primaryMountGroupIds(doc.rocket);
      const after = mounts(applyGeometryEdits(doc.rocket, { motorClusterCount: 2 }));
      const countOf = (c: (typeof after)[number]) =>
        ((c as { motorMount?: { clusterCount?: number } }).motorMount?.clusterCount ?? 1);
      for (let i = 0; i < before.length; i++) {
        if (group.has(before[i].id)) continue;
        if (countOf(after[i]) !== countOf(before[i])) {
          rewritten.push(
            `${f.name}: ${before[i].name} was ${countOf(before[i])}, became ${countOf(after[i])} ` +
              `from an edit describing ${primaryMotorClusterCount(doc.rocket)}`,
          );
        }
      }
    }
    console.log(
      `motor mounts across ${files.length} design files: ${mountsSeen} mounts, ` +
        `${disagreeing.length} design(s) whose mounts disagree — ${disagreeing.join("; ") || "none"}`,
    );
    expect(mountsSeen, "no mount was read — that branch proves nothing").toBeGreaterThan(20);
    // The one design that has the shape must still HAVE it, or this assertion is watching nothing.
    expect(disagreeing.length, "no real design carries mounts with different counts").toBeGreaterThan(0);
    expect(rewritten, "a mount the field never described was rewritten by it").toEqual([]);
  });

  it("costs no real design its motor, and finds none that was already flying a misfit", async () => {
    // **This is a NO-REGRESSION check and it is named as one**, because it cannot honestly be more
    // than that. A first version was called "never substitutes a motor that could not fit" and
    // asserted `lost`/`misfit` empty — which they are whether the veto exists or not, as the pre-push
    // review proved by deleting it and watching this stay green.
    //
    // The bite cannot be driven from the corpus, and the measurement says why: **0 of the catalogue's
    // 102 designation cores span more than one casing class**, so a loose match can only ever land on
    // the size its own family is made in. The reported defect needed a FILE whose stated casing
    // disagreed with the motor its designation nearly names — 29 mm stated, `H999ZZ` reaching the
    // 38 mm `H999N` — and no corpus design does that. Manufacturing one here would be a test of a
    // string I chose. `lib/motors/db.test.ts` pins the bite on the real reported case instead.
    //
    // What this DOES establish is the thing that check cannot: that arming the veto changes no real
    // flight, over every motor instance in 35 in-the-wild files.
    let stated = 0;
    let silent = 0;
    let loose = 0;
    const lost: string[] = [];
    const misfit: string[] = [];
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      for (const cfg of doc.rocket.configurations) {
        for (const inst of cfg.instances) {
          const m = inst.motor;
          if (!m.designation) continue;
          const casing = Math.round((m.diameter ?? 0) * 1000);
          if (casing > 0) stated++; else silent++;
          const name = `${shortName(f.name)}/${m.designation}`;
          const withFit = resolveMotor(m);
          const ignoringFit = resolveMotor({ designation: m.designation, manufacturer: m.manufacturer });
          // Where the veto is even CONSULTED: an exact match is exempt, so this is the honest reach
          // figure rather than the count of files that state a casing at all.
          if (ignoringFit && ignoringFit.quality !== "exact" && casing > 0) loose++;
          // Nothing a real file describes may be lost.
          if (ignoringFit && !withFit) {
            lost.push(`${name}: ${casing} mm stated, ${Math.round(ignoringFit.entry.curve.diameterMm)} mm matched`);
          }
          // Computed from the PRE-veto resolution. Asking the post-veto one is a tautology — the veto
          // is precisely what makes that answer impossible — which is what the first version did.
          if (ignoringFit && casing > 0 && ignoringFit.quality !== "exact") {
            const got = Math.round(ignoringFit.entry.curve.diameterMm);
            if (got > 0 && !sameCasing(got, casing)) misfit.push(`${name}: would fly ${got} mm in ${casing} mm`);
          }
        }
      }
    }
    console.log(
      `motor instances across ${files.length} design files: ${stated} state a casing, ${silent} do not ` +
        `(RockSim states the mount's bore, RASAero the nozzle); ${loose} resolve loosely enough for the ` +
        `veto to be consulted at all, and ${misfit.length} of those disagree on casing`,
    );
    expect(stated, "no corpus file states a casing — nothing here would be exercised").toBeGreaterThan(10);
    expect(lost, "the casing veto dropped a motor a real design was flying").toEqual([]);
    expect(misfit, "a real design was already flying a motor that does not fit its own stated casing").toEqual([]);
  }, 300_000);

  it("says so on every real design that loses a motor, clustered or not", async () => {
    // A motor that does not resolve is left OUT of the build (`lib/sim/setup.ts` skips it), so the
    // flight runs on less thrust and less mass than the design calls for and reads low. One warning
    // exists to say that — and for as long as it has existed it could not fire on a clustered
    // design, because it compared the cluster-EXPANDED flown count against the UN-EXPANDED instance
    // count. Any cluster made the left side the larger one.
    //
    // Driven by CONSTRUCTION rather than against a threshold: break exactly one instance of every
    // configuration on every real design, and require the result to say a motor is missing. The
    // clustered subset is counted and asserted non-empty, because it is the subset the defect lived
    // in and an assertion that never reaches it is watching nothing.
    const silent: string[] = [];
    const clustered: string[] = [];
    let broken = 0;
    let wouldHaveBeenMissed = 0;
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      for (const cfg of doc.rocket.configurations) {
        if (cfg.instances.length === 0) continue;
        // The expanded count the design calls for, read the way the solver reads it: a mount's
        // `clusterCount`, not the length of the instance list.
        const mountCount = new Map<string, number>();
        for (const p of flattenRocket(doc.rocket)) {
          const mm = (p.component as { motorMount?: { clusterCount?: number } }).motorMount;
          if (mm) mountCount.set(p.component.id, Math.max(1, Math.round(mm.clusterCount ?? 1)));
        }
        const expanded = cfg.instances.reduce((s, i) => s + (mountCount.get(i.mountId) ?? 1), 0);
        if (expanded > cfg.instances.length) clustered.push(`${shortName(f.name)}/${cfg.name ?? cfg.id}`);
        for (let k = 0; k < cfg.instances.length; k++) {
          const rocket = {
            ...doc.rocket,
            configurations: doc.rocket.configurations.map((c) =>
              c.id !== cfg.id
                ? c
                : {
                    ...c,
                    instances: c.instances.map((inst, i) =>
                      i === k ? { ...inst, motor: { ...inst.motor, designation: "ZZ-NOT-A-MOTOR" } } : inst,
                    ),
                  },
            ),
          };
          let run;
          try {
            run = runFlight(rocket, { configId: cfg.id });
          } catch {
            continue; // a design with nothing left to fly is another test's business
          }
          broken++;
          const codes = run.result.warnings.map((w) => w.code);
          const said = codes.includes("partial-cluster") || codes.includes("no-motor");
          if (!said) {
            silent.push(
              `${shortName(f.name)}/${cfg.name ?? cfg.id}: broke instance ${k + 1} of ` +
                `${cfg.instances.length} (${expanded} expanded) and the flight said nothing — ${codes.join(", ") || "no warnings at all"}`,
            );
          }
          // The negative control, computed rather than asserted: how many of these the OLD
          // comparison (`placed < instances.length`) would have let through in silence. It is the
          // clustered ones, and it is printed so a future reader can see the defect's real size.
          const placed = run.resolutions.reduce((s, r) => s + (r.match ? (r.count ?? 1) : 0), 0);
          if (placed > 0 && placed < expanded && !(placed < cfg.instances.length)) wouldHaveBeenMissed++;
        }
      }
    }
    console.log(
      `lost-motor check across ${files.length} design files: ${broken} single-motor removals driven, ` +
        `${new Set(clustered).size} clustered configuration(s), ` +
        `${wouldHaveBeenMissed} that the pre-fix comparison would have passed over in silence`,
    );
    expect(broken, "no motor was ever broken — this test proves nothing").toBeGreaterThan(20);
    expect(
      new Set(clustered).size,
      "no real design carries a cluster, so the branch the defect lived in is untested",
    ).toBeGreaterThan(0);
    expect(wouldHaveBeenMissed, "the negative control found nothing the old code missed").toBeGreaterThan(0);
    expect(silent, "a design flew on a missing motor and said nothing").toEqual([]);
  }, 300_000);

  it("authors a coupler and a centring ring on every real design, inside the tube and massing something", async () => {
    // The two INTERNAL kinds. Unlike every previously authorable part they touch no outer mould line
    // at all — so the check is the mirror image of the authored-part sweep above: the airframe must
    // NOT move, and the dry mass must.
    const stepped: string[] = [];
    const weightless: string[] = [];
    const outside: string[] = [];
    const solid: string[] = [];
    const wrongShape: string[] = [];
    const addedG: Record<string, number[]> = { tubecoupler: [], centeringring: [] };
    let authored = 0;
    let eligible = 0;
    let exempt = 0;
    let clamped = 0;
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const rocket = doc.rocket;
      const tubes = flattenRocket(rocket).filter((p) => p.component.kind === "bodytube");
      if (!tubes.length) continue;
      eligible++;
      const host = tubes[0];
      const beforeLen = overallLength(rocket);
      const beforeMass = dryMassProperties(rocket).mass;
      for (const kind of ["tubecoupler", "centeringring"] as const) {
        const id = newPartId(rocket, undefined, host.component.id);
        // `length: 0` is what the button sends — the size is the corpus figure, resolved against the
        // host by `internalPartDefaults`. Driving the default path is the point: a test that names its
        // own length checks the clamp and nothing about the part a flyer would actually get.
        const built = applyGeometryEdits(rocket, {
          added: [{ id, kind, after: host.component.id, length: 0 }],
        });
        const made = flattenRocket(built).find((p) => p.component.id === id);
        if (!made) continue;
        authored++;
        const name = `${shortName(f.name)}/${kind}`;
        // 1. It goes INSIDE the host, not behind it — so the rocket is exactly as long as it was.
        if (Math.abs(overallLength(built) - beforeLen) > 1e-9) stepped.push(`${name}: length moved`);
        // 2. It sits within the host's own span, which is what "inside" has to mean geometrically.
        if (made.xFore < host.xFore - 1e-9 || made.xFore + made.length > host.xFore + host.length + 1e-9) {
          outside.push(`${name}: ${made.xFore.toFixed(4)}..${(made.xFore + made.length).toFixed(4)} outside host ${host.xFore.toFixed(4)}..${(host.xFore + host.length).toFixed(4)}`);
        }
        // 3. It weighs something wherever the host states a stock AND the design counts per-part
        //    mass at all. A part that adds nothing is an edit that changes no number — the "controls
        //    that forget" tell — but there is a legitimate exemption and it is the majority on some
        //    files: a design whose enclosing ASSEMBLY states its own weight subsumes everything
        //    inside it, so adding a part there moves the balance and not the total. That is exactly
        //    what `statedMassHolder` reports, and what the parts panel already tells the flyer in
        //    words. Counted rather than waved through, so the exemption is visible.
        const c = made.component as { material?: unknown; innerRadius: number; outerRadius: number };
        const subsumed = statedMassHolder(built, id);
        if (subsumed) {
          exempt++;
        } else if (c.material !== undefined && dryMassProperties(built).mass <= beforeMass + 1e-12) {
          weightless.push(`${name}: stock but no mass`);
        }
        addedG[kind].push((dryMassProperties(built).mass - beforeMass) * 1000);
        // 4. **A ring is bored and a coupler is long, and neither is negotiable.** Both kinds are the
        //    same `RingComponent`, so the one way to author them wrong is to size them alike — which
        //    the first draft did, giving every ring a 50 mm SOLID slug at 134 g median and 1.74 kg at
        //    worst. 0 of the 83 real centring rings in the corpus have a zero bore, and none of the 31
        //    real couplers is shorter than 1.0537 calibers.
        if (kind === "centeringring") {
          if (!(c.innerRadius > 0)) solid.push(`${name}: bore 0 — that is a bulkhead, not a ring`);
          if (made.length > 0.033) wrongShape.push(`${name}: ${(made.length * 1000).toFixed(1)} mm thick, past the corpus's thickest ring`);
        } else if (made.length < 1.05 * 2 * c.outerRadius - 1e-9) {
          // Below the corpus floor ONLY where the host is too short to hold one — the clamp, which
          // has to win, since a coupler past the fore end is the defect that clamp exists for.
          if (made.length >= host.length - 1e-9) clamped++;
          else wrongShape.push(`${name}: ${(made.length / (2 * c.outerRadius)).toFixed(2)} calibers in a host with room for more`);
        }
      }
    }
    const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    console.log(
      `internal parts authored across ${files.length} design files: ${authored} ` +
        `(coupler + centring ring on every design with a body tube), ` +
        `${exempt} inside an assembly whose stated weight already subsumes them, ` +
        `${clamped} couplers cut down to a host too short to hold one; ` +
        `median added mass ${med(addedG.tubecoupler).toFixed(2)} g coupler, ` +
        `${med(addedG.centeringring).toFixed(2)} g ring`,
    );
    // **Both kinds on every eligible design, counted exactly.** This read `> 40` against an actual 70
    // — 43% of slack, so half the corpus could stop building and every list below would still be
    // empty for the wrong reason, since each one is filled behind `if (!made) continue`. Every corpus
    // file has a body tube, so the number is 2 per file and there is no reason to leave it loose.
    expect(eligible, "no design had a body tube — the corpus is not loaded").toBe(files.length);
    expect(authored, "a design refused to build one of the two internal kinds").toBe(eligible * 2);
    expect(stepped, "an internal part changed the airframe's length").toEqual([]);
    expect(outside, "an internal part sits outside the tube that holds it").toEqual([]);
    expect(weightless, "an internal part with a stock added no mass").toEqual([]);
    expect(solid, "a centring ring was authored with no bore").toEqual([]);
    expect(wrongShape, "an internal part was authored at a size no real one has").toEqual([]);
    // The mass a ring adds is what the sizing is FOR, so it is asserted rather than only printed: a
    // 1/8 inch bored plate is single-digit grams, and the solid 50 mm slug this replaced was 134.
    expect(med(addedG.centeringring), "the median centring ring is heavier than a plate of ply").toBeLessThan(20);
    expect(med(addedG.centeringring), "the median centring ring weighs nothing at all").toBeGreaterThan(0);
  }, 300_000);

  it("sizes every real design's internal structure, and never builds one out of nothing", async () => {
    // **The population this milestone exists for.** Measured across these files before the
    // `internalId` slot existed: 249 of 569 parts had no field describing them, and 194 of those 249
    // are these five kinds. The unit tests drive a design built by hand; this one drives every real
    // one, because a bound read off a HOST is only as good as the hosts real files actually have —
    // an assembly, a coupler inside a coupler, a mount two levels down, a part with no stated wall.
    const insideOut: string[] = [];
    const unbounded: string[] = [];
    const inert: string[] = [];
    const unnamed: string[] = [];
    let driven = 0;
    let withHost = 0;
    let subsumed = 0;
    const KINDS = ["tubecoupler", "centeringring", "bulkhead", "engineblock", "innertube"];
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const rocket = doc.rocket;
      const parts = flattenRocket(rocket).filter((p) => KINDS.includes(p.component.kind));
      const before = dryMassProperties(rocket).mass;
      for (const p of parts) {
        const id = p.component.id;
        const name = `${shortName(f.name)}/${p.component.kind}`;
        driven++;
        // 1. Every one of them is now aimable, which is the whole capability.
        if (JSON.stringify(aimEditsAt(rocket, id)) !== JSON.stringify({ internalId: id })) {
          unnamed.push(`${name}: no aim`);
          continue;
        }
        // 2. The bounds the panel advertises are the ones the applier enforces — one function, driven
        //    here over every real host rather than over the one a unit test builds.
        const b = internalPartBounds(rocket, id);
        if (b.maxLength !== undefined) withHost++;
        // **A missing bound is a FINDING, not a skip, and reading it as a skip is how this check
        // reported green over 36 real parts.** The asserts below were written `if (bound !== undefined
        // && over > bound)`, so a part whose host stated no bore was driven at nine metres of outer
        // diameter and then not looked at. Every internal part in a real design has a host that states
        // one — an airframe part through its wall, another internal part through its own bore — so an
        // absent bound means the bound is not being read, which is exactly the defect.
        if (b.maxOuterDiameter === undefined) {
          unbounded.push(`${name}: no outer bound from its host, so any diameter is accepted`);
        }
        const over = applyGeometryEdits(rocket, {
          internalId: id, internalLength: 99, internalOuterDiameter: 9, internalInnerDiameter: 9,
        });
        const made = flattenRocket(over).find((q) => q.component.id === id)?.component as
          | { length: number; outerRadius: number; innerRadius: number }
          | undefined;
        if (!made) { unnamed.push(`${name}: the edit lost the part`); continue; }
        if (b.maxLength !== undefined && made.length > b.maxLength + 1e-9) {
          unbounded.push(`${name}: ${made.length.toFixed(4)} m past the host's ${b.maxLength.toFixed(4)} m`);
        }
        if (b.maxOuterDiameter !== undefined && made.outerRadius * 2 > b.maxOuterDiameter + 1e-9) {
          unbounded.push(`${name}: OD ${(made.outerRadius * 2).toFixed(4)} past the host's bore ${b.maxOuterDiameter.toFixed(4)}`);
        }
        // 3. **A part made of nothing is the failure this is really guarding.** These kinds carry no
        //    aerodynamic term, so every one of these fields reaches the flight through MASS — and a
        //    bore that has swallowed the wall produces a confident CG from a component nobody could
        //    build. Asserted on the geometry of every real part, under the most hostile entry the
        //    panel's own bounds would ever let through.
        if (!(made.innerRadius < made.outerRadius)) {
          insideOut.push(`${name}: bore ${made.innerRadius.toFixed(5)} >= wall ${made.outerRadius.toFixed(5)}`);
        }
        // 4. And the edit has to CHANGE something — a field that moves no number is the "controls
        //    that forget" tell. Four exemptions are real and every one of them is COUNTED rather than
        //    waved through, because an exemption nobody can see is indistinguishable from a bug:
        //    an enclosing assembly that states its own weight subsumes the part (the same exemption
        //    the authoring sweep above counts); a file that states no stock gives the mass model no
        //    density to work from; a part whose own mass the file OVERRIDES outright is not computed
        //    from geometry at all, and honouring that is the point of an override; and a part already
        //    as long as the host that bounds it has nowhere to grow.
        const grown = applyGeometryEdits(rocket, { internalId: id, internalLength: (p.length || 0.01) * 2 });
        const grownLen = (flattenRocket(grown).find((q) => q.component.id === id)?.component as { length: number } | undefined)?.length;
        if (Math.abs(dryMassProperties(grown).mass - before) <= 1e-12) {
          const c = p.component as { material?: unknown; overrideMass?: number };
          const explained =
            statedMassHolder(grown, id) !== null ||
            c.material === undefined ||
            c.overrideMass !== undefined ||
            Math.abs((grownLen ?? 0) - p.length) <= 1e-12;
          if (explained) subsumed++;
          else inert.push(`${name}: doubled and moved no mass`);
        }
      }
    }
    console.log(
      `internal structure driven across ${files.length} design files: ${driven} parts, ${withHost} bounded by a host, ` +
        `${subsumed} whose mass the file states outright, or that a bound leaves nowhere to grow`,
    );
    expect(files.length, "no design was read — that branch proves nothing").toBeGreaterThan(20);
    expect(driven, "no internal part was driven at all").toBeGreaterThan(150);
    expect(unnamed, "a real internal part that the aim registry cannot speak for").toEqual([]);
    expect(unbounded, "an internal part flown past the bound its own panel advertises").toEqual([]);
    expect(insideOut, "an internal part flown with a bore at or past its own wall").toEqual([]);
    expect(inert, "an internal part whose size edit moved no mass, with nothing to explain it").toEqual([]);
  }, 300_000);

  it("sizes every real design's external fittings, and the count reaches the drag", async () => {
    // The LAST kinds with no field, after the internal structure. Two of the three are protuberances
    // the drag model squares, so this drives the aero as well as the geometry — over every real lug
    // and button rather than over the one a unit test builds.
    const unnamed: string[] = [];
    const unbounded: string[] = [];
    const inertDrag: string[] = [];
    let driven = 0;
    let withDrag = 0;
    const KINDS = ["shockcord", "launchlug", "railbutton"];
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const rocket = doc.rocket;
      const parts = flattenRocket(rocket).filter((p) => KINDS.includes(p.component.kind));
      if (!parts.length) continue;
      const maxDia = 2 * maxBodyRadius(rocket);
      for (const p of parts) {
        const id = p.component.id;
        const name = `${shortName(f.name)}/${p.component.kind}`;
        driven++;
        if (JSON.stringify(aimEditsAt(rocket, id)) !== JSON.stringify({ fittingId: id })) {
          unnamed.push(`${name}: no aim`);
          continue;
        }
        // The most hostile entry the panel's bounds would ever let through.
        const over = applyGeometryEdits(rocket, {
          fittingId: id, fittingDiameter: 9, fittingCount: 99, fittingLength: 9, fittingMass: 9,
        });
        const made = flattenRocket(over).find((q) => q.component.id === id)?.component as
          | { radius?: number; instanceCount?: number }
          | undefined;
        if (!made) { unnamed.push(`${name}: the edit lost the part`); continue; }
        if (maxDia > 0 && (made.radius ?? 0) * 2 > maxDia + 1e-9) {
          unbounded.push(`${name}: OD ${((made.radius ?? 0) * 2).toFixed(4)} past the airframe's ${maxDia.toFixed(4)}`);
        }
        // And on a lug or a button the count must reach the FLIGHT. Asserted through the reference
        // area the solver actually uses rather than through the field, because a field that writes a
        // number nothing reads is the defect this milestone family keeps finding.
        if (p.component.kind === "shockcord") continue;
        withDrag++;
        const one = applyGeometryEdits(rocket, { fittingId: id, fittingCount: 1 });
        const many = applyGeometryEdits(rocket, { fittingId: id, fittingCount: 8 });
        const areaOf = (r: Rocket) => {
          const c = flattenRocket(r).find((q) => q.component.id === id)?.component as
            | { radius?: number; instanceCount?: number }
            | undefined;
          return (c?.instanceCount ?? 1) * Math.PI * (c?.radius ?? 0) ** 2;
        };
        if (!((p.component as { radius?: number }).radius) || (p.component as { radius?: number }).radius === 0) continue;
        if (areaOf(many) <= areaOf(one) + 1e-15) {
          inertDrag.push(`${name}: eight of it present no more frontal area than one`);
        }
      }
    }
    console.log(
      `external fittings driven across ${files.length} design files: ${driven} parts, ${withDrag} of them protuberances the drag model squares`,
    );
    expect(files.length, "no design was read — that branch proves nothing").toBeGreaterThan(20);
    expect(driven, "no fitting was driven at all").toBeGreaterThan(40);
    expect(unnamed, "a real fitting that the aim registry cannot speak for").toEqual([]);
    expect(unbounded, "a fitting flown wider than the airframe it is bolted to").toEqual([]);
    expect(inertDrag, "a fitting whose count reaches no frontal area").toEqual([]);
  }, 300_000);

  it("advertises every real fitting the ceiling it actually enforces, and carries its mass with its count", async () => {
    // Two Sev-1s from one root, driven over every real lug and button rather than the one a unit test
    // builds. The bound is measured on the PRISTINE tree and clamped after `scaleAirframeRadii`, so a
    // caliber what-if made the panel's promise and the applier's enforcement two different numbers;
    // and `mass` on a fitting is the TOTAL across its instances everywhere except the applier, which
    // left the drag scaling with the count and the mass standing still.
    const drifted: string[] = [];
    const inertMass: string[] = [];
    let bounded = 0;
    let weighed = 0;
    let subsumed = 0;
    const KINDS = ["launchlug", "railbutton"];
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const rocket = doc.rocket;
      const parts = flattenRocket(rocket).filter((p) => KINDS.includes(p.component.kind));
      if (!parts.length) continue;
      for (const p of parts) {
        const id = p.component.id;
        const name = `${shortName(f.name)}/${p.component.kind}`;
        // A caliber what-if in BOTH directions — the widening one is what shipped wrong, and a
        // narrowing one is the same mistake with the sign flipped.
        for (const factor of [2, 0.5]) {
          const pristine = 2 * maxBodyRadius(rocket);
          if (!(pristine > 0)) continue;
          const edits = { bodyDiameter: pristine * factor, fittingId: id, bodyTubeId: undefined };
          const promised = fittingMaxOuterDiameter(rocket, edits);
          if (!(promised > 0)) continue;
          bounded++;
          // Type exactly the ceiling the panel would advertise. It must arrive intact: a value the
          // panel called legal that the applier then trims is the defect, in either direction.
          const out = applyGeometryEdits(rocket, { ...edits, fittingDiameter: promised });
          const made = flattenRocket(out).find((q) => q.component.id === id)?.component as
            | { radius?: number }
            | undefined;
          const flown = (made?.radius ?? 0) * 2;
          if (Math.abs(flown - promised) > 1e-9) {
            drifted.push(`${name} @${factor}x: promised ${promised.toFixed(4)}, flew ${flown.toFixed(4)}`);
          }
        }
        // And the count has to carry the mass. Asserted through the whole design's dry mass, because a
        // field that writes a number the mass model never reads is exactly what this found.
        // **The figure the solver actually flies, not the one the geometry computes.** A design that
        // STATES a fitting's mass wins over the computed one, and the applier scales that stated
        // figure with the count — so expecting the computed unit here reports every overridden
        // fitting as inert. It did not surface until rail buttons started carrying a computed mass
        // too (before that they had only the override, and the `mass === undefined` guard below
        // skipped all five). `fittingUnitMass` is the panel's own readback, so this asserts the
        // count against the number the flyer is shown.
        const unit = fittingUnitMass(rocket, id);
        if (unit === undefined || !(unit > 0)) continue;
        // A part under an ancestor that overrides its whole subtree's mass contributes nothing to the
        // dry total, by design — `structurePointMasses` drops it so the stated assembly figure is not
        // double-counted. Its count moving no mass is correct, not inert, and four real lugs on two
        // designs sit there (`EscapeVelocity.ork`, `FullScaleModelTH.rkt`); asserting over them would
        // have this case fail on behaviour the mass model is right about.
        if (statedMassHolder(rocket, id) !== null) { subsumed++; continue; }
        weighed++;
        const one = dryMassProperties(applyGeometryEdits(rocket, { fittingId: id, fittingCount: 1 })).mass;
        const four = dryMassProperties(applyGeometryEdits(rocket, { fittingId: id, fittingCount: 4 })).mass;
        if (Math.abs(four - one - unit * 3) > 1e-9) {
          inertMass.push(`${name}: 1→4 moved ${(four - one).toFixed(6)} kg, expected ${(unit * 3).toFixed(6)}`);
        }
      }
    }
    console.log(
      `fitting bounds driven across ${files.length} design files: ${bounded} advertised ceilings, ${weighed} masses re-counted, ${subsumed} subsumed by an ancestor's stated assembly mass`,
    );
    expect(files.length, "no design was read — that branch proves nothing").toBeGreaterThan(20);
    expect(bounded, "no ceiling was advertised at all — the check proves nothing").toBeGreaterThan(20);
    expect(weighed, "no fitting carried a mass — the mass half proves nothing").toBeGreaterThan(10);
    expect(drifted, "a ceiling the panel advertises that the applier does not enforce").toEqual([]);
    expect(inertMass, "a fitting whose count reaches the drag but not the mass").toEqual([]);
  }, 300_000);

  it("puts a boattail on every real design's actual tail, and builds every exit the field would offer", async () => {
    // **Two Sev-1s from one root, and the corpus is what found both.** The anchor used to be the
    // aft-most body TUBE, so a design whose tail is already a transition had the cone spliced BETWEEN
    // the tube and that transition — a contraction followed by a step back OUT to the tube's own
    // caliber, which the drag model flies in full. And the ceiling the field advertised was measured
    // on the pristine tree while the applier measures it after `scaleAirframeRadii`, so a caliber
    // what-if made the promise and the enforcement two different numbers on the one field in the app
    // with no `max` at all.
    //
    // Driven over every real design rather than the one a unit test builds, because "the tail is a
    // transition" is a property of files rather than of a shape anyone would think to construct.
    const stepped: string[] = [];
    const dropped: string[] = [];
    let tails = 0;
    let transitionTails = 0;
    let ceilings = 0;
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const rocket = doc.rocket;
      const host = boattailHost(rocket);
      if (!host) continue;
      tails++;
      if (host.kind !== "bodytube") transitionTails++;

      // 1. NOTHING BEHIND THE CONE IS WIDER THAN ITS EXIT. The exact shape the splice produced, asked
      //    of the mould line rather than of the insertion index, so a future anchor that is wrong in
      //    some other way still fails here.
      const fairsTo = boattailFairsToDiameter(rocket)!;
      const out = applyGeometryEdits(rocket, { boattailLength: 0.04, boattailAftDiameter: fairsTo * 0.7 });
      // Found by its DERIVED ID, never by its name. Two corpus designs already carry a part called
      // "Boattail" — one of them two of them — so a name match picks the design's own tail cone and
      // then reports every part behind it as a step this edit caused. It cost this case one wrong
      // failure before it cost a session anything.
      const coneId = derivedPartId(host.id, "boattail");
      const cone = flattenRocket(out).find((p) => p.component.id === coneId);
      if (!cone) {
        dropped.push(`${shortName(f.name)}: no cone built at 70% of ${(fairsTo * 1000).toFixed(1)} mm`);
      } else {
        // **The invariant, stated as "the cone is the tail" rather than as "nothing behind it is
        // wider".** A first draft asked the second question with a filter on `xFore >= cone's aft
        // end`, which cannot see a part that STARTS ahead of the cone and reaches past it — an
        // absolutely-placed aft tube does exactly that, and it is the worst mould line of all. Being
        // the aft-most body part in the whole tree is the property that makes the step impossible,
        // and it is one comparison.
        const bodies = flattenRocket(out).filter((p) => aftOuterRadius(p.component) !== undefined);
        const last = bodies.reduce((a, b) => (b.xFore + b.length > a.xFore + a.length ? b : a));
        if (last.component.id !== cone.component.id) {
          const w = aftOuterRadius(last.component)! * 2;
          stepped.push(
            `${shortName(f.name)}: ${last.component.kind} "${last.component.name}" (⌀${(w * 1000).toFixed(1)} mm) ends behind the boattail, not the boattail`,
          );
        }
        // And it really contracts: a "boattail" that flares or sits flush removes no base area.
        const exit = (cone.component as { aftRadius: number }).aftRadius * 2;
        const fore = (cone.component as { foreRadius: number }).foreRadius * 2;
        if (!(exit < fore)) {
          stepped.push(`${shortName(f.name)}: the cone runs ${(fore * 1000).toFixed(1)} → ${(exit * 1000).toFixed(1)} mm`);
        }
      }

      // 2. EVERY CEILING THE FIELD WOULD OFFER IS ONE THE APPLIER BUILDS — under a caliber what-if in
      //    both directions, and after the metres→mm and metres→inches rounding the field puts it
      //    through. A ceiling that survives the arithmetic and is then dropped in silence is the
      //    original defect wearing a units conversion.
      const pristine = 2 * maxBodyRadius(rocket);
      if (!(pristine > 0)) continue;
      for (const factor of [1, 2, 0.5]) {
        const edits = factor === 1 ? {} : { bodyDiameter: pristine * factor };
        const max = boattailExitMax(boattailBase(rocket, edits));
        if (max === undefined || !(max > 0)) continue;
        for (const [label, imperial] of UNIT_SYSTEMS) {
          // Exactly what a flyer can type: the ceiling through the field's own display conversion.
          const typed = spanToMetres(spanCeiling(max, imperial), imperial);
          if (!(typed > 0)) continue;
          ceilings++;
          const built = applyGeometryEdits(rocket, {
            ...edits,
            boattailLength: 0.04,
            boattailAftDiameter: typed,
          });
          const id = derivedPartId(boattailHost(boattailBase(rocket, edits))!.id, "boattail");
          const made = flattenRocket(built).find((p) => p.component.id === id);
          if (!made) {
            dropped.push(
              `${shortName(f.name)} @${factor}x ${label}: the field would offer ${(typed * 1000).toFixed(3)} mm against a ceiling of ${(max * 1000).toFixed(3)} mm and nothing was built`,
            );
            continue;
          }
          // **Built is not enough — it has to be built at the number that was typed.** A clamp that
          // quietly substituted some other exit would leave `dropped` empty while the field showed a
          // figure the rocket does not have, which is the defect this whole case exists for.
          const flew = (made.component as { aftRadius: number }).aftRadius * 2;
          if (Math.abs(flew - typed) > 1e-9) {
            dropped.push(
              `${shortName(f.name)} @${factor}x ${label}: offered ${(typed * 1000).toFixed(3)} mm, flew ${(flew * 1000).toFixed(3)} mm`,
            );
          }
        }
      }
    }
    console.log(
      `boattail anchors across ${files.length} design files: ${tails} designs can take one, ${transitionTails} of them end in a transition rather than a tube; ${ceilings} advertised ceilings driven, ${stepped.length} step out behind the cone`,
    );
    expect(files.length, "no design was read — that branch proves nothing").toBeGreaterThan(20);
    expect(transitionTails, "no design ends in a transition — the case this exists for is unexercised").toBeGreaterThan(4);
    expect(ceilings, "no ceiling was driven — the second half proves nothing").toBeGreaterThan(50);
    expect(stepped, "a part behind the boattail wider than its exit — the cone contracts and the airframe steps back out").toEqual([]);
    expect(dropped, "a value the field would offer that the applier silently refuses").toEqual([]);
  }, 300_000);

  it("finds no real design that leads with anything but a nose cone", async () => {
    // The denominator behind the blunt-face warning R4's drag made necessary. Loft takes forebody
    // pressure and wave drag from whichever component is a nose cone wherever it sits, and has no term
    // at all for a flat leading face — so the warning has to fire on a reordered airframe and must
    // never fire on a design as a file describes it. This is the half of that claim only the corpus
    // can hold: a shape the editor can reach and no file produces.
    const leading: string[] = [];
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const face = leadingFaceDiameter(doc.rocket);
      if (face > 0) leading.push(`${f.name}: ${(face * 1000).toFixed(1)} mm flat face as imported`);
    }
    console.log(`leading-face check across ${files.length} design files: ${leading.length} lead with a flat face`);
    expect(files.length, "no design was read — that branch proves nothing").toBeGreaterThan(20);
    expect(leading, "a real design that the blunt-face warning would fire on as imported").toEqual([]);
  });

  it("names exactly the real designs whose lower stage cannot fire, and no dart", async () => {
    // The denominator behind the dead-stage warning, taken from the FLOWN flight rather than from the
    // predicate, so this test cannot be satisfied by a predicate that agrees with itself.
    //
    // Exactly ONE real design is in this state, and it is a genuine one rather than an artefact:
    // `03.Three-stage.ork` puts a `burnout` ignition event on its bottom-most stage, where nothing
    // below it ever burns out, so that J315R never lights and the stage is carried. Loft has always
    // flown it that way — `ignitionTrigger` has a comment saying the file's own stored flight agrees —
    // and until this warning nothing said so on any surface.
    //
    // Two traps this pins. First the DART: an unpowered TOP stage is a legitimate design and 3 of
    // these files are exactly that (`APEX_K_Dart.ork`, `ARC payload rocket.ork`,
    // `Deployable payload.ork`), so a rule of "every stage needs a motor" would name 4 files here, not
    // 1. Second, `shed`: a dead stage under a live one is still dropped by that stage's separation, so
    // a warning claiming it is carried would contradict the `untracked-booster` notice beside it.
    const dead: string[] = [];
    let multiStage = 0;
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      if (doc.rocket.stages.length > 1) multiStage++;
      const run = runFromDocument(doc, {});
      if (run.result.warnings.some((w) => w.code === "dead-stage")) dead.push(shortName(f.name));
    }
    console.log(
      `dead-stage check across ${files.length} design files: ${dead.length} fly a lower stage that cannot fire ` +
        `(${multiStage} of the files are multi-stage) — ${dead.join(", ") || "none"}`,
    );
    expect(files.length, "no design was read — that branch proves nothing").toBeGreaterThan(20);
    expect(multiStage, "no multi-stage design was read — the predicate's whole branch is untested").toBeGreaterThan(0);
    expect(dead.sort()).toEqual(["03.Three-stage.ork"]);
    // A full flight per design needs the same explicit budget its neighbours take. Measured 488 ms
    // locally and 5,186 ms on the CI runner, which overran vitest's 5 s default and turned the build
    // red on a commit whose local gate was green.
  }, 300_000);

  it("gives every real staged flight a phase timeline its table can be built from", async () => {
    // This holds the ASSUMPTIONS R5's phase table is built on, against real files — it does not render
    // the table (the e2e does that). The table draws one row per PHASE and names each row's shed stages
    // as the slice `stages[stageCount_p … stageCount_{p-1} - 1]`; if the timeline underneath does not
    // have the shape asserted here, those rows are wrong however the component is written. Both traps
    // are ones a synthetic fixture cannot expose:
    //
    //   - rows are NOT stages. `03.Three-stage.ork` has 3 stages, 2 phases and ONE separation, because
    //     a serial stack parts at one joint and takes everything below it; `Three stage low power
    //     rocket.ork` has 3 of each. A table built from `rocket.stages` prints a phase that never was.
    //   - `stageCount` is a COUNT of what remains, not an index of what left. Naming only
    //     `stages[stageCount]` would drop the second stage at any boundary where two joints part.
    const shapes: string[] = [];
    let multiStage = 0;
    let totalPhases = 0;
    let boundariesWhereTwoStagesLeft = 0;

    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const n = doc.rocket.stages.length;
      if (n < 2) continue;
      multiStage++;
      const run = runFromDocument(doc, {});
      const phases = run.phases;
      totalPhases += phases.length;
      const name = shortName(f.name);

      if (phases.length === 0) { shapes.push(`${name}: no phases at all`); continue; }
      if (phases[0].stageCount !== n) shapes.push(`${name}: first phase holds ${phases[0].stageCount} of ${n} stages`);
      if (phases[0].startTime !== 0) shapes.push(`${name}: first phase starts at ${phases[0].startTime}`);

      const shedTotal: number[] = [];
      for (let i = 1; i < phases.length; i++) {
        const prev = phases[i - 1].stageCount;
        const here = phases[i].stageCount;
        if (here >= prev) shapes.push(`${name}: phase ${i + 1} holds ${here}, not fewer than ${prev}`);
        if (phases[i].startTime < phases[i - 1].startTime) shapes.push(`${name}: phase ${i + 1} begins before phase ${i}`);
        for (let k = here; k < prev; k++) shedTotal.push(k);
        if (prev - here > 1) boundariesWhereTwoStagesLeft++;
        // Every boundary a row draws its altitude and speed from must have an event behind it, or the
        // table renders "not logged" where a real number belongs.
        const ev = run.result.events.find((e) => e.type === "separation" && Math.abs(e.time - phases[i].startTime) < 1e-6);
        if (!ev) shapes.push(`${name}: phase boundary at ${phases[i].startTime.toFixed(3)} s has no separation event`);
      }
      // Each shed stage is named exactly once, and every stage below the final count is accounted for.
      // (Given the two checks above this is arithmetically implied, so it is kept as a cheap guard on
      // those checks rather than sold as the guard on the slice rule.)
      const expected = Array.from({ length: n - phases[phases.length - 1].stageCount }, (_, k) => phases[phases.length - 1].stageCount + k);
      if (JSON.stringify([...shedTotal].sort((a, b) => a - b)) !== JSON.stringify(expected)) {
        shapes.push(`${name}: shed slices ${JSON.stringify(shedTotal)} do not cover ${JSON.stringify(expected)} exactly once`);
      }

      // What the TABLE actually depends on, which nothing asserted before: it pairs `seps[i]` with
      // `phases[i + 1]` POSITIONALLY and truncates to `seps.length + 1` rows. That is only sound if
      // separations arrive in phase order and never outnumber the phases — otherwise a row's "to" and
      // the next row's "from" silently disagree.
      const sepEvents = run.result.events.filter((e) => e.type === "separation");
      if (sepEvents.length + 1 > phases.length) {
        shapes.push(`${name}: ${sepEvents.length} separations logged against ${phases.length} phases`);
      }
      sepEvents.forEach((e, k) => {
        const planned = phases[k + 1];
        if (!planned) return;
        if (Math.abs(e.time - planned.startTime) > 1e-6) {
          shapes.push(`${name}: separation ${k + 1} at ${e.time.toFixed(3)} s does not match phase ${k + 2} at ${planned.startTime.toFixed(3)} s`);
        }
      });
    }

    console.log(
      `phase timelines across ${files.length} design files: ${multiStage} multi-stage, ${totalPhases} phases, ` +
        `${boundariesWhereTwoStagesLeft} boundaries where more than one stage left at once`,
    );
    expect(multiStage, "no multi-stage design was read — this suite proves nothing").toBeGreaterThan(0);
    expect(boundariesWhereTwoStagesLeft, "no boundary sheds two stages — the slice rule is untested").toBeGreaterThan(0);
    expect(shapes).toEqual([]);
    // Flies every multi-stage design; same explicit budget, same reason as above.
  }, 300_000);

  it("logs a burnout for every stage that burns, without moving the burnout it reports", async () => {
    // R5 increment 3. A flight used to log exactly ONE burnout ever — `burnoutTime`'s max over every
    // lit motor — so a booster's burnout, the event that CAUSES the separation right after it, was
    // never recorded. 8 of the 9 multi-stage designs reported 1, including the one that burns three.
    //
    // The dangerous half of this change is NOT the new events; it is the summary. The emission and
    // the `burnoutVelocity` / `burnoutAltitude` latch were one guard, so looping it over the stages
    // moves the reported burnout to the BOOSTER's — on `03.Three-stage.ork` the sustainer's burnout
    // becomes the booster's, which under the drag model of the day was 202.8 m/s at 787.4 m becoming
    // 44.9 m/s at 366.6 m, 77.9% low, published onto the Burnout velocity stat a flyer sizes an
    // ejection delay against. (Those two pairs are that model's; re-measured 2026-08-02 the same
    // swap is 224.4 m/s at 845.8 m becoming 52.2 m/s at 390.5 m. The ratio is the point, not the
    // absolute numbers — the guard below carries the current ones.) Both halves are asserted here, and the summary half is the one worth
    // having: a `some(type === "burnout")` check stays green through exactly that regression.
    const multi: string[] = [];
    const gained: string[] = [];
    let totalBurnouts = 0;
    let summary: { v: number; alt: number } | undefined;

    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      if (doc.rocket.stages.length < 2) continue;
      const name = shortName(f.name);
      multi.push(name);
      const run = runFromDocument(doc, {});
      const bos = run.result.events.filter((e) => e.type === "burnout");
      totalBurnouts += bos.length;
      if (bos.length > 1) gained.push(name);

      // Ordered in time, and each attributed to a stage — the table matches them into its rows.
      for (let k = 1; k < bos.length; k++) {
        expect(bos[k].time, `${name}: burnouts out of time order`).toBeGreaterThanOrEqual(bos[k - 1].time);
      }
      for (const b of bos) {
        expect(b.stageIndex, `${name}: a burnout names no stage, so no row can claim it`).toBeDefined();
        expect(b.stageIndex!).toBeLessThan(doc.rocket.stages.length);
      }
      // No stage may report two burnouts: one per stage is the whole contract.
      const perStage = bos.map((b) => b.stageIndex);
      expect(new Set(perStage).size, `${name}: two burnouts for one stage`).toBe(perStage.length);

      if (name === "03.Three-stage.ork") {
        summary = { v: run.result.summary.burnoutVelocity, alt: run.result.summary.burnoutAltitude };
      }
    }

    console.log(
      `burnouts across ${files.length} design files: ${multi.length} multi-stage, ${totalBurnouts} burnout ` +
        `events, ${gained.length} designs logging more than one`,
    );

    // Named exactly, not counted. `toEqual([])` or a bare count would accept the emission going blind
    // again, which is the failure this repo has already had once on a sweep of this shape.
    expect(gained.sort()).toEqual(
      [
        "02.Two-stage.ork",
        "03.Three-stage.ork",
        "Complex.Two-Stage.CDX1",
        "Three stage low power rocket.ork",
        "Two stage high power rocket.ork",
      ].sort(),
    );
    expect(multi.length, "no multi-stage design was read — this suite proves nothing").toBe(9);

    // THE REGRESSION GUARD. This is the sustainer's burnout, and it must not become the booster's.
    //
    // **Re-centred 2026-08-02, on a measurement, when R7's per-set fin cross-section moved the
    // flight.** The window was 200–205 m/s and 780–795 m — this design's numbers under the old drag
    // model, not anything about which stage is being reported. Charging each fin set its own edge
    // section instead of the draggiest present took the sustainer's burnout to 224.4 m/s at 845.8 m.
    //
    // Driven this run, both burnout events on this design:
    //
    //     booster    52.2 m/s at 390.5 m
    //     sustainer 224.4 m/s at 845.8 m
    //
    // **The two halves of this band do different jobs, and saying so is what stops the next
    // re-centring from quietly becoming a loosening.** The LOWER bounds are the discriminator: the
    // booster's 52.2 m/s and 390.5 m are 4.1× and 2.1× below them, so reporting the booster fails
    // both. The UPPER bounds discriminate nothing — a booster is slower and lower, so no ceiling can
    // catch it — and exist only to stop the number drifting unnoticed. They are therefore kept
    // TIGHT rather than generous: ±5%, against the ±1.2% they had before and the ±10% a first
    // attempt at this re-centring used. At ±10% the Burnout velocity a flyer sizes an ejection delay
    // against could move 9% with the suite green, which is a worse guard than the one being replaced.
    expect(summary, "03.Three-stage.ork was not read").toBeDefined();
    expect(summary!.v).toBeGreaterThan(213);
    expect(summary!.v).toBeLessThan(236);
    expect(summary!.alt).toBeGreaterThan(803);
    expect(summary!.alt).toBeLessThan(888);
    // Flies every multi-stage design; same explicit budget, same reason as the sweeps above.
  }, 300_000);

  it("offers a drag only drops that land exactly where the indicator promised", async () => {
    // R4's drag reads `moveSlots` for every place a part can go, draws an indicator at each, and
    // commits the one the pointer was nearest. A slot is therefore a PROMISE about where the part will
    // land, made before the flyer lets go — so the property to hold across real airframes is that
    // applying a slot puts the part immediately in front of the part the slot named, every time.
    //
    // Driven on the corpus rather than a fixture for the reason the reorder sweep gives: a stage
    // boundary is where the synthetic shapes cannot reach, and the aft-end slot of a non-final stage is
    // the one case where the part a drop lands in front of belongs to a DIFFERENT stage than the anchor.
    const misplaced: string[] = [];
    const crossed: string[] = [];
    const disagreed: string[] = [];
    let slots = 0;
    let designsWithASlot = 0;
    let acrossABoundary = 0;

    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const stageOf = (r: Rocket, id: string) =>
        r.stages.findIndex((s) => s.components.some((c) => c.id === id));
      let any = false;

      for (const stage of doc.rocket.stages) {
        for (const c of stage.components) {
          const offered = moveSlots(doc.rocket, c.id);

          // Every nudge the buttons offer must be one of the drag's slots. Two functions answering
          // "where can this go" is exactly how a control comes to offer a move the operation cannot
          // make, which cost this milestone an increment already.
          for (const dir of [-1, 1] as const) {
            const mv = moveTarget(doc.rocket, c.id, dir);
            if (mv && !offered.some((s) => s.move.after === mv.after)) {
              disagreed.push(`${f.name}: ${c.id} can nudge ${dir} to a slot the drag does not offer`);
            }
          }

          for (const slot of offered) {
            any = true;
            slots++;
            const after = applyGeometryEdits(doc.rocket, { moved: [slot.move] });
            if (stageOf(after, c.id) !== stageOf(doc.rocket, c.id)) {
              crossed.push(`${f.name}: ${c.id} left its stage`);
              continue;
            }
            // The promise: read the whole airframe's top-level order and check the dragged part sits
            // immediately in front of the part the slot named. Walked from the stages directly rather
            // than asked of `moveSlots` itself — a test that asks the function under suspicion is blind
            // exactly where the code is.
            const line = after.stages.flatMap((s) => s.components.map((x) => x.id));
            const at = line.indexOf(c.id);
            const landed = slot.before === null ? at === line.length - 1 : line[at + 1] === slot.before;
            if (!landed) {
              misplaced.push(
                `${f.name}: ${c.id} dropped before ${slot.before ?? "the tail"} landed in front of ${line[at + 1] ?? "nothing"}`,
              );
            }
            if (slot.before !== null && stageOf(doc.rocket, slot.before) !== stageOf(doc.rocket, c.id)) {
              acrossABoundary++;
            }
          }
        }
      }
      if (any) designsWithASlot++;
    }

    console.log(
      `drag drop-slots driven across ${files.length} design files: ${slots} (on ${designsWithASlot} designs), ` +
        `${acrossABoundary} landing in front of the next stage's first part`,
    );
    expect(slots, "no drop slot was driven — that branch proves nothing").toBeGreaterThan(100);
    expect(disagreed, "a nudge the drag does not offer as a slot").toEqual([]);
    expect(crossed, "a drop that moved a part into another stage").toEqual([]);
    expect(misplaced, "a drop that did not land where its indicator promised").toEqual([]);
  });

  it("never lets a reorder overlap a part, cross a stage, or fail to come back", async () => {
    // R4's operation, held across every real design rather than the starter's two-part stack. The
    // authoring sweep above exists because a stage boundary is where the synthetic fixtures could not
    // reach; the same is true here. A reorder is only interesting where a stage has three or more
    // top-level children, which **21 of the 35 corpus designs** have against three of the six committed
    // `fixtures/` (max 4 children) and none of the five `e2e/fixtures/` (max 2). So the committed set
    // can prove the gesture works and only the corpus can prove it holds across real airframes.
    //
    // Four rules, one per way a reorder can be wrong:
    //   1. no two top-level parts overlap afterwards — the done-when says the diagram never shows it,
    //      and since stations are derived from a running cursor the way to break it is to rewrite a
    //      `placement` instead of permuting the list;
    //   2. no part changes stage. `nextTopLevel` flattens across stage boundaries, so a part let out of
    //      its own stage re-stages itself silently — a different separation event and a different flight;
    //   3. the same set of parts is present afterwards, in a different order — a reorder must not add
    //      or drop anything;
    //   4. dropping the entry restores the original order exactly, which is what makes it undoable.
    const overlapped: string[] = [];
    const restaged: string[] = [];
    const lost: string[] = [];
    const stuck: string[] = [];
    let moves = 0;
    let changed = 0;
    let designsWithSomewhereToGo = 0;

    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const stageOf = (r: Rocket, id: string) =>
        r.stages.findIndex((s) => s.components.some((c) => c.id === id));
      const topIds = (r: Rocket) => r.stages.map((s) => s.components.map((c) => c.id));
      const before = topIds(doc.rocket);
      let any = false;

      for (const stage of doc.rocket.stages) {
        for (const c of stage.components) {
          for (const dir of [-1, 1] as const) {
            const mv = moveTarget(doc.rocket, c.id, dir);
            if (!mv) continue;
            any = true;
            moves++;
            const after = applyGeometryEdits(doc.rocket, { moved: [mv] });

            // 3 — same parts, per stage.
            const now = topIds(after);
            if (
              now.length !== before.length ||
              now.some((ids, i) => [...ids].sort().join() !== [...before[i]].sort().join())
            ) {
              lost.push(`${f.name}: moving ${c.id} ${dir} changed which parts exist`);
            }
            // 2 — nothing changed stage.
            if (stageOf(after, c.id) !== stageOf(doc.rocket, c.id)) {
              restaged.push(`${f.name}: ${c.id} moved out of its stage`);
            }
            // 1 — no overlap. Walked from the flattened stations directly rather than asked of any
            // helper the reorder itself uses: a test that shares the function under suspicion is blind
            // exactly where the code is, which this suite has already been bitten by once.
            const flat = flattenRocket(after);
            const tops = new Set(after.stages.flatMap((s) => s.components.map((x) => x.id)));
            const line = flat.filter((x) => tops.has(x.component.id)).sort((a, b) => a.xFore - b.xFore);
            for (let i = 1; i < line.length; i++) {
              if (line[i].xFore < line[i - 1].xFore + line[i - 1].length - 1e-6) {
                overlapped.push(
                  `${f.name}: moving ${c.id} ${dir} overlapped ${line[i - 1].component.id} and ${line[i].component.id}`,
                );
                break;
              }
            }
            // 4 — the move CHANGED the order, and nudging it back restores it exactly.
            //
            // The obvious spelling of this rule — apply `{ moved: [] }` and compare — cannot fail:
            // `applyMoves` returns the rocket untouched on an empty list, so it asserts nothing about
            // the operation at all. Deleting the whole body of `applyMoves` would leave it green.
            // Driving the INVERSE move is the property that means something, and it needs the order to
            // have actually moved first, which is the `changed` counter below.
            if (JSON.stringify(now) === JSON.stringify(before)) {
              stuck.push(`${f.name}: moving ${c.id} ${dir} changed nothing`);
            } else {
              changed++;
              const back = moveTarget(after, c.id, dir === 1 ? -1 : 1);
              if (!back) {
                stuck.push(`${f.name}: ${c.id} could not be nudged back after moving ${dir}`);
              } else if (JSON.stringify(topIds(applyGeometryEdits(doc.rocket, { moved: [mv, back] }))) !== JSON.stringify(before)) {
                stuck.push(`${f.name}: nudging ${c.id} ${dir} and back did not restore the order`);
              }
            }
          }
        }
      }
      if (any) designsWithSomewhereToGo++;
    }

    console.log(
      `reorders driven across ${files.length} design files: ${moves} (on ${designsWithSomewhereToGo} designs), ` +
        `${changed} permuted the list and were nudged back`,
    );
    expect(moves, "no reorder was driven — that branch proves nothing").toBeGreaterThan(100);
    // Every driven move must have permuted the list. Without this the three rules above are satisfied
    // by an `applyMoves` that does nothing at all.
    expect(changed, "reorders that were applied but permuted nothing").toBe(moves);
    expect(overlapped, "reorders that made two top-level parts overlap").toEqual([]);
    expect(restaged, "reorders that moved a part into another stage").toEqual([]);
    expect(lost, "reorders that added or dropped a part").toEqual([]);
    expect(stuck, "reorders that could not be taken back").toEqual([]);
  }, 300_000);

  it("flies every stored simulation and agrees on apogee and speed", async () => {
    const asserted: Case[] = [];
    const excused: Case[] = [];
    const breaches: string[] = [];

    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue; // the import test above owns this failure
      }
      for (const sim of doc.simulations) {
        let run;
        try {
          run = runFromDocument(doc, {
            configId: sim.conditions.configId,
            // A reduced flight is a different vehicle, so its stored numbers aren't comparable.
            validateAgainst: doc.flownAsReduced ? undefined : sim,
            overrides: overridesFromStored(sim),
          });
        } catch (e) {
          breaches.push(`${shortName(f.name)} [${sim.name}] threw: ${(e as Error).message}`);
          continue;
        }
        const apogee = run.validation?.comparisons.find((c) => c.key === "maxAltitude");
        if (!run.hasPropulsion || !apogee || !Number.isFinite(apogee.pctError)) continue;
        const vel = run.validation?.comparisons.find((c) => c.key === "maxVelocity");
        const short = shortName(f.name);
        const known = KNOWN_ISSUES[`${short}::${sim.name}`] ?? KNOWN_ISSUES[short];
        const c: Case = {
          file: short,
          sim: sim.name,
          pctError: apogee.pctError,
          velPctError: vel && Number.isFinite(vel.pctError) ? vel.pctError : undefined,
        };
        if (known) {
          excused.push(c);
          continue;
        }
        asserted.push(c);
        if (Math.abs(apogee.pctError) > TOLERANCE_PCT) {
          breaches.push(
            `${short} [${sim.name}] apogee ${apogee.pctError.toFixed(1)}% ` +
              `(stored ${apogee.stored.toFixed(1)} m, Loft ${apogee.simulated.toFixed(1)} m)`,
          );
        }
        // Apogee alone is not the trajectory. A heavier rocket that also drags less reaches a
        // similar height on a different flight, so agreeing on the peak can be two errors
        // cancelling — this suite already refuses to *un-excuse* a case on apogee alone for
        // exactly that reason. Holding max velocity to the same tolerance makes that a gate
        // rather than a hint, and the speed it got there at is the number that separates the two.
        if (vel && Number.isFinite(vel.pctError) && Math.abs(vel.pctError) > TOLERANCE_PCT) {
          breaches.push(
            `${short} [${sim.name}] max velocity ${vel.pctError.toFixed(1)}% ` +
              `(stored ${vel.stored.toFixed(1)} m/s, Loft ${vel.simulated.toFixed(1)} m/s)`,
          );
        }
      }
    }

    // A known issue that has quietly come good should be un-excused rather than left hidden.
    // Apogee alone isn't enough to say so: several of these files store results their own
    // geometry can't produce, and one of them agrees on apogee while reading 25% high on speed.
    // Requiring the trajectory to agree too keeps the nudge from arming a coincidence.
    //
    // **The apogee bar used to be `TOLERANCE_PCT / 2`, and that made this nudge blind over exactly
    // the band it exists to police.** The suite ASSERTS at `TOLERANCE_PCT`; the nudge asked for half
    // of it, so an entry sitting between the two — passing the assertion it is excused from, and
    // therefore excusing nothing — could never be reported, however long it stayed that way.
    // Measured 2026-08-14, both in that band and both invisible to this line for as long as it read
    // `/2`: `Punisher Apprentice.ork::Simulation 10` at apogee −10.15% / velocity −1.56%, and
    // `03.Three-stage.ork` at +10.76% / +4.95%. Two suppressed assertions that would have passed.
    // The velocity clause is what stops a coincidence arming — that was always the real guard, and
    // it is untouched; the halved apogee bar was a second, stricter one with no reason of its own.
    // A check that cannot fire over the range it polices is the shape P14 and P16 are both about,
    // and this is that shape inside the corpus rather than inside the gate.
    const fixed = excused.filter(
      (c) =>
        Math.abs(c.pctError) <= TOLERANCE_PCT &&
        c.velPctError !== undefined &&
        Math.abs(c.velPctError) <= TOLERANCE_PCT,
    );
    if (fixed.length) {
      console.log(
        `corpus: ${fixed.length} known-issue case(s) now agree on apogee AND speed — ` +
          `consider dropping their KNOWN_ISSUES entry:\n` +
          fixed
            .map(
              (c) =>
                `  ${c.file} [${c.sim}] apogee ${c.pctError.toFixed(1)}%, ` +
                `max velocity ${c.velPctError!.toFixed(1)}%`,
            )
            .join("\n"),
      );
    }

    expect(asserted.length, "no comparable simulations found — is the corpus complete?").toBeGreaterThan(0);
    expect(breaches, `apogee or max velocity outside ±${TOLERANCE_PCT}%`).toEqual([]);
  }, 900_000);

  it("still meets the accuracy the Validation page claims", async () => {
    // The docs publish a per-metric census of how far Loft lands from the numbers real design files
    // already carry. A published accuracy figure with nothing holding it to account goes quietly
    // stale the first time the engine changes — so it is asserted here, against the same corpus it
    // was measured on. **Two-directional since 2026-08-09**: it was one-directional on the principle
    // that getting better is always allowed, which left a page free to under-claim indefinitely with
    // nothing red. Getting better is still always allowed — it just has to be published in the change
    // that earned it, and the run logs the current figures so that is one edit rather than a
    // re-measurement. See `censusImprovementSlack` for why that side of the band is not flat.
    const errs = new Map<string, number[]>();
    const counted = new Set<string>();
    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      for (const sim of doc.simulations) {
        let run;
        try {
          run = runFromDocument(doc, {
            configId: sim.conditions.configId,
            validateAgainst: doc.flownAsReduced ? undefined : sim,
            overrides: overridesFromStored(sim),
          });
        } catch {
          continue;
        }
        if (!run.hasPropulsion || !run.validation) continue;
        for (const c of run.validation.comparisons) {
          if (!Number.isFinite(c.pctError)) continue;
          const key = censusKey(c.key, sim);
          // See `censusRowId`: a stored run that repeats an earlier run's comparison exactly, on
          // both sides, is the same measurement and is counted once.
          const id = censusRowId(f.name, key, c.stored, c.simulated);
          if (counted.has(id)) continue;
          counted.add(id);
          const list = errs.get(key) ?? [];
          list.push(Math.abs(c.pctError));
          errs.set(key, list);
        }
      }
    }
    const median = (a: number[]) => {
      const s = [...a].sort((x, y) => x - y);
      return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    };
    const measured = [...errs.entries()].map(([k, v]) => ({ key: k, n: v.length, med: median(v) }));
    console.log(
      "corpus census (median |Δ| vs each file's stored results, known issues included):\n" +
        measured
          .sort((a, b) => b.med - a.med)
          .map((m) => `  ${m.key.padEnd(20)} n=${String(m.n).padStart(3)}  ${m.med.toFixed(1)}%`)
          .join("\n"),
    );
    const stale: string[] = [];
    for (const m of measured) {
      const claim = PUBLISHED_MEDIAN_PCT[m.key];
      if (claim === undefined) continue;
      if (m.med > claim + CENSUS_SLACK_PCT) {
        stale.push(`${m.key} median |Δ| ${m.med.toFixed(1)}% > the ${claim}% on /docs/validation`);
      }
      // **And stale in the GENEROUS direction too, which this gate could not see until 2026-08-09.**
      // It was one-directional on the stated principle that "getting better is always allowed" — but
      // a page claiming 3.2% while the suite measures 1.8% is just as wrong about Loft as one
      // claiming 1.8% while it measures 3.2%, and it is the shape that rots silently: nothing goes
      // red, so the figure sits there being under-sold for as long as nobody re-reads it. R10's
      // *done when* asks for the page and `PUBLISHED_MEDIAN_PCT` to move in the SAME commit as the
      // measurement, and this is what makes that a rule rather than an intention. An improvement is
      // still always allowed — it just has to be published in the change that earned it.
      if (m.med < claim - censusImprovementSlack(claim)) {
        stale.push(
          `${m.key} median |Δ| ${m.med.toFixed(1)}% is BETTER than the ${claim}% on /docs/validation — publish it in this commit`,
        );
      }
    }
    expect(stale, "the Validation page's accuracy census no longer holds — remeasure and update it").toEqual([]);
    // A claim nothing measured is a claim that cannot go stale, which is the same as no claim at
    // all. The loop above skips a key it finds no rows for, so before 2026-08-04 a metric could
    // stop being compared entirely — an adapter regression, a renamed key, a bucket that never
    // fills — and this case would still pass green with the published figure untouched. It went in
    // with the two `/ballistic` rows, which are exactly the kind of key that can quietly stop
    // existing.
    const unmeasured = Object.keys(PUBLISHED_MEDIAN_PCT).filter((k) => !measured.some((m) => m.key === k));
    expect(unmeasured, "published on /docs/validation but measured by nothing here").toEqual([]);

    // **And the POPULATION each figure is measured over is published, and matches.** The page used
    // to print one "97 stored simulations" above all ten medians while their real populations ran
    // 76 to 97 — a metric is compared where a file stores it, and the three formats do not store the
    // same set, so max Mach was 77 against apogee's 97 and OpenRocket-only. A reader took 6.0% as a
    // corpus-wide figure when two of the three tools were never asked.
    //
    // *Those figures are the 2026-08-04 measurement that motivated the check and are left as the
    // history they are.* Today the range is **68 to 97**, max Mach is 68 and still the only
    // OpenRocket-only metric — deployment velocity stopped being one on 2026-08-05, when RockSim's
    // misspelled `VelocityAtDeplyment` was read — and only apogee reaches 97. The live figures are
    // the page's own, asserted below; this comment does not carry any.
    //
    // Asserted against the page's own source, the way `lib/design-system.test.ts` asserts its counts,
    // because the median gate above cannot see a population change at all: dropping every RockSim row
    // from a metric could improve its median and this suite would applaud.
    const page = readFileSync(resolve(process.cwd(), "app/docs/validation/page.tsx"), "utf-8");
    const PAGE_LABEL: Record<string, string> = {
      timeToApogee: "time to apogee",
      launchRodVelocity: "rail-exit velocity",
      maxMach: "max Mach",
      maxVelocity: "max velocity",
      optimumDelay: "optimum delay",
      maxAltitude: "apogee",
      maxAcceleration: "max acceleration",
      flightTime: "flight time",
      groundHitVelocity: "ground-hit velocity",
      deploymentVelocity: "deployment velocity",
    };
    const wrongN: string[] = [];
    for (const [key, label] of Object.entries(PAGE_LABEL)) {
      const m = measured.find((x) => x.key === key);
      if (!m) continue;
      // The label, then its bolded percentage, then the population in brackets — allowing the
      // "(68, OpenRocket only)" form the single-format metric carries.
      //
      // **Anchored to the start of a list entry, and it has to be.** `apogee` is a substring of
      // `time to apogee`, so an unanchored search found the wrong entry and read the wrong
      // population for `maxAltitude` — and it passed anyway from the day it was written until
      // 2026-08-09, because the two metrics happened to share a population of 97. The de-duplication
      // that moved time-to-apogee to 94 is what made it visible. A check that is right by
      // coincidence is not a check, so the anchor is the fix rather than reordering the page.
      const re = new RegExp(`(?:<li>|,\\s*)${label}\\s*<strong>([^<]*)</strong>[^(]*\\((\\d+)`);
      const hit = re.exec(page);
      if (!hit) {
        wrongN.push(`${key}: /docs/validation states no population beside "${label}"`);
        continue;
      }
      if (Number(hit[2]) !== m.n) wrongN.push(`${key}: page says n=${hit[2]}, measured n=${m.n}`);
      // **And the PERCENTAGE the page prints, which this check captured and then threw away for its
      // whole life.** The median gate above compares against `PUBLISHED_MEDIAN_PCT` — a hand-kept
      // copy of what the page is believed to say — while the page itself was never read. So the
      // page could claim anything at all as long as the constant was right, and on 2026-08-09 six
      // separate figures on the two docs routes were stale under a gate whose own prose says it
      // "recomputes the census on every run and fails if any metric drifts from what this page
      // claims". It did not claim that; it claimed drift from a constant. This closes the loop: the
      // number a reader sees is now the number that is asserted.
      const shown = Number(hit[1].replace("%", "").trim());
      if (!Number.isFinite(shown)) {
        wrongN.push(`${key}: /docs/validation prints "${hit[1]}" where a percentage belongs`);
      } else if (Math.abs(shown - PUBLISHED_MEDIAN_PCT[key]) > 1e-9) {
        wrongN.push(
          `${key}: /docs/validation prints ${shown}% while PUBLISHED_MEDIAN_PCT says ${PUBLISHED_MEDIAN_PCT[key]}%`,
        );
      }
    }
    expect(wrongN, "a published median names a population or a percentage it is not measured over").toEqual([]);
  }, 900_000);

  /** **R10 item 5, last part: a comparison is counted once, and the de-duplication cannot degenerate.**
   *
   *  The rule itself is four lines in the census above, and four lines that quietly delete rows are
   *  exactly what R10's notes forbid — *"what it must not do is widen a tolerance or drop a case to
   *  make a median look better"*. So the rule is held from both ends here, and the assertions are
   *  chosen so that either way of breaking it goes red:
   *
   *  - **it must still find repeats** — a keying mistake that made every row unique would silently
   *    restore the old weighting and no median would move enough to notice;
   *  - **it must not find too many** — keying on the file and metric alone, or rounding the values
   *    hard enough to collide, would start merging genuinely different runs;
   *  - **every dropped row must be an exact repeat of one that stayed**, checked here against the
   *    values themselves rather than trusted from the key that built them. *This is the assertion
   *    that actually caught the over-matching key when it was proved able to fail:* dropping Loft's
   *    side of the key took the count from 54 to 60, which the bound above tolerates and this does
   *    not. A count bound is a coarse instrument and is kept only for the case where the key stops
   *    matching altogether;
   *  - **no metric may lose its population to it**, so a metric cannot be de-duplicated into a
   *    median over three rows.
   *
   *  It also prints the repeats by file and metric, because the concentration is the finding: two
   *  metrics and one file carry most of it, and a corpus that grew a third would say so here. */
  it("counts a stored comparison once, however many times a file repeats it", async () => {
    const rows: { file: string; key: string; stored: number; simulated: number }[] = [];
    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      for (const sim of doc.simulations) {
        let run;
        try {
          run = runFromDocument(doc, {
            configId: sim.conditions.configId,
            validateAgainst: doc.flownAsReduced ? undefined : sim,
            overrides: overridesFromStored(sim),
          });
        } catch {
          continue;
        }
        if (!run.hasPropulsion || !run.validation) continue;
        for (const c of run.validation.comparisons) {
          if (!Number.isFinite(c.pctError)) continue;
          rows.push({ file: f.name, key: censusKey(c.key, sim), stored: c.stored, simulated: c.simulated });
        }
      }
    }
    expect(rows.length, "no comparison rows at all — the census walk found nothing to de-duplicate").toBeGreaterThan(500);

    const kept = new Map<string, { file: string; key: string; stored: number; simulated: number }>();
    const dropped: typeof rows = [];
    for (const r of rows) {
      const id = censusRowId(r.file, r.key, r.stored, r.simulated);
      if (kept.has(id)) dropped.push(r);
      else kept.set(id, r);
    }

    const byPair = new Map<string, number>();
    for (const r of dropped) {
      const label = `${shortName(r.file)} :: ${r.key}`;
      byPair.set(label, (byPair.get(label) ?? 0) + 1);
    }
    console.log(
      `census de-duplication: ${dropped.length} of ${rows.length} comparison rows are exact repeats\n` +
        [...byPair.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => `  ${String(n).padStart(3)}x  ${k}`)
          .join("\n"),
    );

    // Both ends of the range. 54 today; the bounds are wide enough that adding a design to the
    // corpus does not fail this, and narrow enough that "the key stopped matching" (0) and "the key
    // started over-matching" (hundreds) both do.
    expect(dropped.length, "the de-duplication stopped finding repeats — it is no longer doing anything").toBeGreaterThan(20);
    expect(
      dropped.length,
      "the de-duplication is merging rows that are not repeats — check the key, not the corpus",
    ).toBeLessThan(rows.length * 0.15);

    // **Every dropped row is an exact repeat, re-checked from the values.** The loop above trusts
    // the key; this does not. A key that stringified a value badly — or a future edit that keyed on
    // the file and metric alone — would pass everything above and fail here, which is the point.
    const notRepeats = dropped.filter((r) => {
      const k = kept.get(censusRowId(r.file, r.key, r.stored, r.simulated));
      return !k || k.stored !== r.stored || k.simulated !== r.simulated;
    });
    expect(notRepeats, "a row was de-duplicated against one it does not actually match").toEqual([]);

    // **The concentration, named, and the two shapes asserted apart.** 14 of `FullScaleModelTH.rkt`'s
    // 15 stored runs repeat one +8.8% max-acceleration comparison — nothing those runs vary reaches
    // peak axial acceleration. Its rail-exit velocity repeats 13, not 14, because rail length DOES
    // reach that one and the fifteen rows collapse to two rather than to one. Asserting both keeps
    // the difference visible: a rule that started merging on the file alone would take the second to
    // 14 and this goes red. If a future adapter change made those runs differ, it goes red too, and
    // the published figure moves with it — the correct outcome rather than a nuisance.
    expect(
      byPair.get("FullScaleModelTH.rkt :: maxAcceleration") ?? 0,
      "the known repeated max-acceleration rows are no longer being found",
    ).toBeGreaterThanOrEqual(10);
    expect(
      byPair.get("FullScaleModelTH.rkt :: launchRodVelocity") ?? 0,
      "rail-exit velocity should collapse fifteen rows to two, not to one — the rail length reaches it",
    ).toBe(13);

    // **And no metric is de-duplicated into insignificance.** The floor is ten distinct comparisons:
    // below that a median is not a census figure.
    //
    // **`deploymentVelocity/ballistic` used to be excused by name here at n=1, and on 2026-08-10 it
    // went to n=0 — because that one row was never a comparison.** It is the single corpus run where
    // the charge fires with nothing out, and the split above exists because the tool still stores a
    // figure for it: *"the charge fires whether or not anything comes out"*. Loft has no such
    // reading — it times the deployment of a device, and on this flight no device deployed — so the
    // row was RockSim's 33.4 m/s against Loft's not-a-measurement 0, published as a flawless
    // −100%. Splitting it into its own bucket kept it out of the other median but left it on the
    // panel; `compareToStored` now withholds it, and the bucket it was the whole population of is
    // empty. Asserted as absent rather than deleted, so a regression that starts scoring it again
    // fails here as well as in the sentinel census at the bottom of this file.
    const perKey = new Map<string, number>();
    for (const r of kept.values()) perKey.set(r.key, (perKey.get(r.key) ?? 0) + 1);
    const gutted = [...perKey.entries()].filter(([, n]) => n < 10).map(([k, n]) => `${k} n=${n}`);
    expect(
      gutted,
      "a metric's population fell below ten distinct comparisons — a median over that is not a census figure",
    ).toEqual([]);
    expect(
      perKey.get("deploymentVelocity/ballistic"),
      "the not-deployed run is being scored again — it has no deployment for the stored figure to disagree with",
    ).toBeUndefined();

    // **What the de-duplication COST, replaced rather than accepted.** Weight is the whole reason a
    // median notices a single design: fifteen rows moving from below the median to the top used to
    // drag it past `CENSUS_SLACK_PCT`, and after this change one row cannot. So on the metric this
    // was done for, a max-acceleration error confined to one design would no longer turn anything
    // red — and nothing else in the repo covers it, since the per-case `TOLERANCE_PCT` gate scores
    // apogee and max velocity only.
    //
    // **The instrument is the TAIL, not the worst row**, and that distinction is load-bearing. A
    // worst-row bound has to sit above today's worst (59.9%) to be green, so it could not see the
    // scenario it exists for — one design moving from +8.8% to +40% passes under it untouched.
    // Counting how many rows are far out does see that: the count goes 2 → 3 and this fails. It also
    // survives the corpus growing, which a bound on a single number does not.
    const accel = [...kept.values()]
      .filter((r) => r.key === "maxAcceleration")
      .map((r) => ({ file: shortName(r.file), pct: ((r.simulated - r.stored) / r.stored) * 100 }))
      .filter((r) => Math.abs(r.pct) > 25)
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    console.log(
      `max acceleration, rows past 25% after de-duplication: ${accel.length}\n` +
        accel.map((r) => `  ${r.pct.toFixed(1)}%  ${r.file}`).join("\n"),
    );
    // Two today, both small RockSim designs and both long-standing: TubeFins1 at +59.9% and
    // rocksimTestRocket1 at -52.4%. The threshold is a round 25% rather than a figure tuned to sit
    // just above them — the nearest row on either side of it is 8.8%, so there is a wide gap and
    // nothing here is fitted to the data.
    expect(
      accel.map((r) => `${r.pct.toFixed(0)}% ${r.file}`),
      "a design's max acceleration moved into the tail — the median cannot see this any more, which is why this counts it",
    ).toHaveLength(2);
  }, 900_000);

  /** **R10: no stored optimum delay is scored against a flight that never happened.**
   *
   *  The two formats mean different things by the same word, and Loft applied one rule to both:
   *
   *    - OpenRocket's `optimumdelay` is the FREE-COAST delay — `timeToOptimumAltitude` minus the
   *      last burnout, exact on 73 of 73 stored simulations here, where apogee-minus-burnout matches
   *      only 56. `lib/sim/run.ts` substitutes a recovery-free coast whenever a device opened before
   *      apogee, which is right for a flyer and right for this format.
   *    - RockSim's `<OptimalDelay>` is that run's OWN `TimeToApogee - TimeToBurnout`, exact on every
   *      stored simulation in all four corpus RockSim designs. `FullScaleModelTH.rkt`'s four
   *      `[L1940X-0]` runs open their canopy at burnout, so RockSim's apogee is 3.65 s and its
   *      stored delay 1.34 s, against Loft's free coast of ~16 s.
   *
   *  **A median could not see this and the census gate therefore could not either.** Four rows of 84
   *  moved from +1107% to -21% and the published 2.5% did not shift by a decimal, which is exactly
   *  what a median is for and exactly why it is the wrong instrument here. This asserts the WORST
   *  row instead: a bound that the old rule breaks by a factor of eighteen.
   *
   *  The bound is deliberately loose — 60% against a worst case of 59% would be tuning, so it sits
   *  at 200%, which still fails an order of magnitude before the defect returns. What is being held
   *  is "no row is comparing two different flights", not a target for the metric itself. */
  it("scores every stored optimum delay against the flight its own file describes", async () => {
    const rows: { file: string; sim: string; pct: number }[] = [];
    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      for (const sim of doc.simulations) {
        let run;
        try {
          run = runFromDocument(doc, {
            configId: sim.conditions.configId,
            validateAgainst: doc.flownAsReduced ? undefined : sim,
            overrides: overridesFromStored(sim),
          });
        } catch {
          continue;
        }
        if (!run.hasPropulsion || !run.validation) continue;
        const c = run.validation.comparisons.find((x) => x.key === "optimumDelay");
        if (!c || !Number.isFinite(c.pctError)) continue;
        rows.push({ file: f.name, sim: sim.name, pct: c.pctError });
      }
    }
    // The corpus must actually be supplying these rows — a metric that stops being compared at all
    // would otherwise pass this by having nothing to fail on, which is the failure the census's own
    // `unmeasured` guard exists for.
    expect(rows.length, "no optimum-delay comparisons found — is the corpus complete?").toBeGreaterThan(50);
    const worst = rows.reduce((a, b) => (Math.abs(b.pct) > Math.abs(a.pct) ? b : a));
    expect(
      Math.abs(worst.pct),
      `worst optimum-delay row: ${worst.file} :: ${worst.sim} at ${worst.pct.toFixed(1)}% — ` +
        `a row this far out means Loft's figure and the stored one describe different flights, not that the delay model is off`,
    ).toBeLessThan(200);
  }, 900_000);

  /** **R10: the descent populations are counted separately, and neither is allowed to vanish.**
   *
   *  The census above splits `groundHitVelocity` and `flightTime` on whether the writing tool says a
   *  recovery device came out. This case is what stops that split silently degenerating — the exact
   *  failure R9's increment 3 had, where a coefficient-provenance split printed three rows of `n=0`
   *  and read as "no design of that kind disagrees" instead of "the field this reads is undefined".
   *
   *  So it asserts the arithmetic of the split rather than a target: every comparable run lands in
   *  exactly one population, both stated populations carry real cases, and the ballistic one is not
   *  a rounding error. It PRINTS the medians because those are the finding — and because a run where
   *  the ballistic median collapses toward the canopy one means Loft's plugged descent got better,
   *  which is worth seeing rather than asserting a bound on. */
  it("counts a plugged descent separately from a canopy one, and neither population vanishes", async () => {
    const buckets = new Map<"deployed" | "ballistic" | "unstated", number[]>([
      ["deployed", []],
      ["ballistic", []],
      ["unstated", []],
    ]);
    let comparable = 0;
    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      for (const sim of doc.simulations) {
        let run;
        try {
          run = runFromDocument(doc, {
            configId: sim.conditions.configId,
            validateAgainst: doc.flownAsReduced ? undefined : sim,
            overrides: overridesFromStored(sim),
          });
        } catch {
          continue;
        }
        if (!run.hasPropulsion || !run.validation) continue;
        const c = run.validation.comparisons.find((x) => x.key === "groundHitVelocity");
        if (!c || !Number.isFinite(c.pctError)) continue;
        comparable++;
        const where =
          sim.recoveryDeployed === true ? "deployed" : sim.recoveryDeployed === false ? "ballistic" : "unstated";
        buckets.get(where)!.push(Math.abs(c.pctError));
      }
    }
    const median = (xs: number[]) => {
      if (!xs.length) return NaN;
      const a = [...xs].sort((p, q) => p - q);
      const m = a.length >> 1;
      return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    };
    console.log(
      "ground-hit velocity by what the FILE says came out:\n" +
        [...buckets.entries()]
          .map(([k, v]) => `  ${k.padEnd(10)} n=${String(v.length).padStart(3)}  ${median(v).toFixed(1)}%`)
          .join("\n"),
    );

    const deployed = buckets.get("deployed")!;
    const ballistic = buckets.get("ballistic")!;
    const unstated = buckets.get("unstated")!;
    // Both STATED populations are real. Only `.rkt` files state it and the corpus carries four of
    // them, so these floors are low on purpose — they are here to catch the field going undefined
    // everywhere (adapter regression, corpus swap), not to encode today's exact counts.
    expect(deployed.length, "no stored run is marked as having deployed — is `recoveryDeployed` being read?").toBeGreaterThanOrEqual(4);
    expect(ballistic.length, "no stored run is marked as NOT having deployed — the split has degenerated").toBeGreaterThanOrEqual(8);
    // The third population is real too, and naming it is the honest part. It is small — 12 stored
    // runs saved with summary results and no event log — but it is not empty, and the published
    // `groundHitVelocity` row covers it alongside the stated canopy descents, so it must stay
    // visible. A zero here would mean either every file suddenly states deployment or the "does not
    // say" branch stopped being reachable, and both are worth a red test rather than a quiet
    // widening of what the published figure is measured over.
    expect(unstated.length, "nothing is unstated — has the `does not say` branch stopped being reachable?").toBeGreaterThan(0);
    // Every comparable run lands in exactly ONE population. `comparable` is counted independently of
    // the bucketing, so a fourth state added later with no bucket — or a mis-typed key silently
    // creating one — goes red here instead of quietly shrinking a published median.
    expect(deployed.length + ballistic.length + unstated.length, "a comparable run fell out of every population").toBe(
      comparable,
    );
    expect(comparable, "the comparable set has collapsed — is the corpus complete?").toBeGreaterThan(50);
  }, 900_000);

  /** **R10: a file whose own tool disagrees with itself is NAMED, not averaged.**
   *
   *  The census compares Loft against a stored number on the assumption that the number is the tool's
   *  answer for that flight. One file in this corpus breaks the assumption outright:
   *  `FullScaleModelTH.rkt` stores eleven runs under the single name `[L1940X-P]`, sharing every
   *  stated input, whose landing speeds fall into two clusters **1.94x apart** — four at
   *  83.3-83.7 m/s and seven at 161.6-162.0. RockSim returns two answers for one rocket. No
   *  deterministic solver can agree with both, so part of that population's disagreement is the
   *  oracle's own spread rather than Loft's error, and a median over it silently attributes the whole
   *  thing to Loft.
   *
   *  This does NOT drop the cases — `ROADMAP.md` R10's notes forbid that, and rightly: the corpus
   *  gate is the most valuable check in the repo precisely because nothing is allowed to leave it to
   *  make a number look better. It names them, so the published ballistic figure can say what it is
   *  measured over.
   *
   *  Asserted two ways. The known case must still be FOUND, so the detector cannot quietly stop
   *  detecting — an adapter that stopped reading `SimulationName`, or a corpus swap, would otherwise
   *  read as "no file disagrees with itself". And no OTHER group may appear without being listed
   *  here, so the next file with this problem arrives as a red test rather than as a worse median
   *  nobody can explain. */
  it("names every file whose own tool stores two answers for one flight", async () => {
    /** A group is self-disagreeing past this ratio. 1.5x is far outside anything a solver's own
     *  step-size or sampling jitter produces — the known case is 1.94x and the next-widest group in
     *  the corpus is **1.004x**, so there is nothing marginal in between for this number to be tuned
     *  against. The run prints that runner-up, so a corpus that grows a 1.4x group says so instead of
     *  passing silently. */
    const SELF_DISAGREEMENT_RATIO = 1.5;
    /** Groups already known and accounted for on `/docs/limitations`. `file · name · runs · ratio`. */
    const KNOWN = ["FullScaleModelTH.rkt · L1940X-P · 11 runs · 1.94x"];

    const found: string[] = [];
    let widestOther = 1;
    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      const groups = new Map<string, number[]>();
      for (const sim of doc.simulations) {
        const v = sim.results.groundHitVelocity;
        if (!Number.isFinite(v) || !(v! > 0)) continue;
        const list = groups.get(sim.name) ?? [];
        list.push(v!);
        groups.set(sim.name, list);
      }
      for (const [name, vs] of groups) {
        if (vs.length < 2) continue;
        const ratio = Math.max(...vs) / Math.min(...vs);
        if (ratio >= SELF_DISAGREEMENT_RATIO) {
          found.push(`${shortName(f.name)} · ${name} · ${vs.length} runs · ${ratio.toFixed(2)}x`);
        } else if (ratio > widestOther) {
          widestOther = ratio;
        }
      }
    }
    console.log(
      `files whose own tool stores two answers for one flight (>= ${SELF_DISAGREEMENT_RATIO}x):\n` +
        (found.length ? found.map((s) => `  ${s}`).join("\n") : "  none") +
        `\n  widest group below the threshold: ${widestOther.toFixed(3)}x`,
    );
    // Both directions at once: the known case is still detected, and nothing new has appeared.
    expect(found.sort(), "self-disagreeing stored groups — see /docs/limitations").toEqual([...KNOWN].sort());
  }, 900_000);

  /** **R9 increment 3: attribute the ground-hit-velocity error before moving any coefficient.**
   *
   *  `groundHitVelocity` is the metric Loft agrees with the corpus least on — 8.3% median against
   *  apogee's 3.1% — and the obvious lever is the parachute drag coefficient. This test exists to
   *  establish whether that is actually where the error lives, because the alternative is a session
   *  tuning a number until the census improves, which is fitting rather than fixing.
   *
   *  **The discriminating split is where the coefficient CAME FROM.** A design whose file states a
   *  Cd is flown on the designer's own figure; one that states none is flown on a Loft fallback. If
   *  the fallback group is markedly worse, the coefficient is the lever. If the two groups agree,
   *  the error is somewhere else entirely — the descent model, the wind, or the stored figures — and
   *  R9's later increments have to be re-aimed rather than spent.
   *
   *  It PRINTS the attribution and asserts only that the measurement was actually taken, because the
   *  finding is the output. A threshold here would be inventing a target for a number nobody has
   *  explained yet. */
  it("says where the ground-hit-velocity error actually lives, split by where the coefficient came from", async () => {
    const rows: { file: string; tool: string; from: string; pct: number }[] = [];
    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      // Every recovery device this design carries, and whether ANY of them took a Loft fallback.
      const chutes = flattenRocket(doc.rocket)
        .map((p) => p.component)
        .filter((c) => c.kind === "parachute" || c.kind === "streamer") as { cdFrom?: string }[];
      if (!chutes.length) continue;
      const from = chutes.every((c) => c.cdFrom === "file")
        ? "file"
        : chutes.every((c) => c.cdFrom === "default")
          ? "default"
          : "mixed";
      for (const sim of doc.simulations) {
        let run;
        try {
          run = runFromDocument(doc, {
            configId: sim.conditions.configId,
            validateAgainst: doc.flownAsReduced ? undefined : sim,
            overrides: overridesFromStored(sim),
          });
        } catch {
          continue;
        }
        if (!run.hasPropulsion || !run.validation) continue;
        const c = run.validation.comparisons.find((x) => x.key === "groundHitVelocity");
        if (!c || !Number.isFinite(c.pctError)) continue;
        // The writing tool, from the extension rather than from a field the corpus record does not
        // carry — the first version read `f.tool`, which is `undefined`, so all three per-tool rows
        // printed `n=0` and looked exactly like "no design of that kind disagrees".
        const tool = /\.ork(\.gz)?$/i.test(f.name) ? "openrocket" : /\.rkt$/i.test(f.name) ? "rocksim" : "rasaero";
        rows.push({ file: f.name, tool, from, pct: c.pctError });
      }
    }

    const median = (xs: number[]) => {
      if (!xs.length) return NaN;
      const a = [...xs].sort((p, q) => p - q);
      const m = a.length >> 1;
      return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    };
    const group = (name: string, sel: (r: (typeof rows)[number]) => boolean) => {
      const g = rows.filter(sel);
      const abs = g.map((r) => Math.abs(r.pct));
      // The SIGNED median matters as much as the absolute one: a coefficient that is wrong in one
      // direction shows as a one-sided error, while a scattered one points at the model instead.
      const signed = g.map((r) => r.pct);
      const low = g.filter((r) => r.pct < 0).length;
      return `${name.padEnd(22)} n=${String(g.length).padStart(3)}  |Δ| ${median(abs).toFixed(1).padStart(5)}%  signed ${median(signed).toFixed(1).padStart(6)}%  ${low}/${g.length} descend SLOWER than stored`;
    };

    console.log(
      "ground-hit velocity, attributed (R9 increment 3):\n" +
        [
          group("all", () => true),
          group("Cd from the file", (r) => r.from === "file"),
          group("Cd from a fallback", (r) => r.from === "default"),
          group("mixed", (r) => r.from === "mixed"),
          group("openrocket", (r) => r.tool === "openrocket"),
          group("rocksim", (r) => r.tool === "rocksim"),
          group("rasaero", (r) => r.tool === "rasaero"),
        ].join("\n") +
        "\n  worst 5: " +
        [...rows]
          .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
          .slice(0, 5)
          .map((r) => `${r.file} ${r.pct.toFixed(1)}% (${r.from})`)
          .join(", "),
    );

    // The measurement has to have HAPPENED — a split that examined nothing prints three tidy `n=0`
    // lines and reads exactly like a result.
    expect(rows.length, "no ground-hit comparisons were measured at all").toBeGreaterThan(50);
    expect(
      rows.filter((r) => r.from === "file").length,
      "no design flew a file-stated coefficient, so the split cannot discriminate",
    ).toBeGreaterThan(10);
    expect(
      rows.filter((r) => r.from !== "file").length,
      "no design flew a fallback coefficient, so the split cannot discriminate",
    ).toBeGreaterThan(5);
  }, 900_000);
  /** Every design whose airframe steps says so, and no design that fairs does.
   *
   *  The drag build-up charges a transition by its own joint angle and has no term at all for a
   *  bare step, so a stepped design flies optimistically by an amount Loft cannot state. The editor
   *  has said this since a flyer could author one, but only about the part they had SELECTED — so
   *  an imported design carried it silently. This pins the flight's own caution against the real
   *  corpus rather than against a synthetic two-tube case.
   *
   *  Measured across these 35 designs: 33 joints step in 13 designs; 27 of those steps in 9 designs
   *  clear the 0.5 mm notice threshold, median 12.70 mm of diameter and up to 82.55 mm. The other
   *  six are rounding artefacts of designs stated in inches. */
  it("says so on every real design whose airframe steps, and stays quiet on the rest", async () => {
    const stepped: string[] = [];
    const wrong: string[] = [];
    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      const steps = mouldLineSteps(doc.rocket).filter(
        (s) => Math.abs(s.diameterStep) > STEP_NOTICE_M,
      );
      let run;
      try {
        run = runFromDocument(doc);
      } catch {
        continue;
      }
      const said = run.result.warnings.some((w) => w.code === "mould-line-step");
      if (steps.length > 0) stepped.push(`${shortName(f.name)} (${steps.length})`);
      // The caution has to track the geometry in BOTH directions: a design that steps and says
      // nothing is the silence this closes, and one that fairs and cries wolf teaches flyers to
      // ignore the flag — which the brief calls out by name.
      if (steps.length > 0 && !said) wrong.push(`${shortName(f.name)}: steps but says nothing`);
      if (steps.length === 0 && said) wrong.push(`${shortName(f.name)}: fairs but cautions anyway`);
    }
    console.log(
      `mould-line steps across ${files.length} design files: ${stepped.length} designs step above the ` +
        `${STEP_NOTICE_M * 1000} mm notice threshold — ${stepped.join(", ")}`,
    );
    expect(wrong, "designs whose step caution disagrees with their geometry").toEqual([]);
    // A floor, not an equality: a re-cut corpus may add designs. Zero would mean the walk broke.
    expect(stepped.length).toBeGreaterThanOrEqual(9);
  }, 300_000);
  /** No recovery size the field offers may return a number physics cannot produce.
   *
   *  The step bound that keeps an open canopy's stiff drag inside RK4's stability region was
   *  reachable only once the flight had passed apogee, so a device opening at or before apogee was
   *  integrated at the flat boost step with no bound. Two designs here diverged from inputs inside
   *  the `Recovery size (×)` field's own advertised 0.1–10× range: `FullScaleModelTH.rkt`, which
   *  ejects half a second before apogee at 250 m/s, returned an apogee of 2.07e13 m at 5× (3.30e2 m
   *  at 4×); and `Complex.Two-Stage.CDX1`, whose drogue opens exactly AT apogee so a single
   *  unbounded step is enough, returned a ground-hit speed of 7.52e32 m/s and a landing energy of
   *  4.00e65 J at 10× — under a confident "hard landing" warning.
   *
   *  Driven across every design rather than the two known ones: the bug was reachable on any design
   *  whose recovery opens early, and which those are is a property of the corpus, not a constant. */
  it("returns a physical flight at every recovery size the field offers, on every design", async () => {
    const absurd: string[] = [];
    let flown = 0;
    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      for (const scale of [0.1, 2, 5, 10]) {
        let run;
        try {
          run = runFromDocument(doc, { recoveryCdScale: scale });
        } catch {
          continue;
        }
        if (!run.hasPropulsion) continue;
        flown++;
        const s = run.result.summary;
        // Ceilings a real hobby flight cannot reach, not tolerances: the Kármán line for altitude
        // and roughly orbital speed. A number past either is the integrator, not the rocket.
        const bad: string[] = [];
        if (!Number.isFinite(s.apogee) || s.apogee > 100_000) bad.push(`apogee ${s.apogee.toExponential(3)} m`);
        if (!Number.isFinite(s.maxVelocity) || s.maxVelocity > 8_000)
          bad.push(`max velocity ${s.maxVelocity.toExponential(3)} m/s`);
        if (!Number.isFinite(s.groundHitVelocity) || s.groundHitVelocity > 8_000)
          bad.push(`ground-hit ${s.groundHitVelocity.toExponential(3)} m/s`);
        if (!Number.isFinite(s.landingEnergy) || s.landingEnergy > 1e9)
          bad.push(`landing energy ${s.landingEnergy.toExponential(3)} J`);
        if (bad.length) absurd.push(`${shortName(f.name)} at ${scale}×: ${bad.join(", ")}`);
      }
    }
    console.log(`recovery-size sweep across ${files.length} design files: ${flown} flights at 0.1/2/5/10×`);
    expect(flown, "no design flew, so this asserted nothing").toBeGreaterThan(50);
    expect(absurd, "a legal recovery size produced a number physics cannot produce").toEqual([]);
  }, 900_000);

  /** A dispersion never reports a landing that did not happen.
   *
   *  `groundHitVelocity` and `landingEnergy` are 0 on a flight still airborne at the 1,200 s cap —
   *  a sentinel the solver documents as such — and the Monte-Carlo summary averaged them in
   *  alongside real landings. Measured on `Complex.Two-Stage.CDX1` at `recoveryCdScale: 5`, inside
   *  the field's own advertised 0.1–10x range: **40 of 40 samples were sentinels**, the panel read
   *  a median landing speed of 0.00 m/s and 0.0 J of landing energy, and the firm-landing chance
   *  came out 0.0% — the most flattering possible reading of a flight that never finished. The
   *  flight card one route away withholds those exact two figures with a reason, so two surfaces
   *  disagreed about whether the number existed at all.
   *
   *  Driven as a NEGATIVE CONTROL: summarise over `samples` instead of the landed ones and this
   *  names the designs and the recovery sizes whose landing statistics are pure sentinel. */
  it("never averages a landing that never happened into a dispersion", async () => {
    const sentinels: string[] = [];
    let checked = 0;
    let sawUnlanded = 0;
    // Counted and printed separately because the two new drift checks below sit on opposite
    // branches: one fires only where NOTHING landed, the other only where some did. A corpus that
    // happened to contain only one shape would leave the other silently vacuous, and this file's own
    // convention is that a check which cannot fail is worse than none.
    let sawNoneLanded = 0;
    let sawPartial = 0;
    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      // 5x is a legal entry in the recovery-size field, and it is where flights stop landing.
      for (const scale of [1, 5]) {
        let mc;
        try {
          mc = monteCarlo(doc.rocket, {
            n: 12,
            seed: 11,
            dispersions: { impulseFrac: 0.05, massFrac: 0.03, rodAngleDeg: 1 },
            recoveryCdScale: scale,
          });
        } catch {
          continue;
        }
        if (mc.n === 0) continue;
        checked++;
        if (mc.landedN < mc.n) sawUnlanded++;
        if (mc.landedN === 0) sawNoneLanded++;
        else if (mc.landedN < mc.n) sawPartial++;
        // Where nothing landed, both figures must be absent rather than zero. Where some did, the
        // summary must describe those and only those — a zero surviving into the band is a sample
        // that never reached the ground being counted as the softest landing in the set.
        if (mc.landedN === 0) {
          if (Number.isFinite(mc.landingSpeed.p50) || Number.isFinite(mc.landingEnergy.p50)) {
            sentinels.push(
              `${shortName(f.name)} at ${scale}x: nothing landed, yet landing speed reads ` +
                `${mc.landingSpeed.p50} m/s and energy ${mc.landingEnergy.p50} J`,
            );
          }
        } else if (mc.landingSpeed.min === 0) {
          sentinels.push(
            `${shortName(f.name)} at ${scale}x: ${mc.n - mc.landedN} of ${mc.n} never landed and a ` +
              `0 m/s sentinel reached the band`,
          );
        }
        // **Drift and the recovery radius ride the same population**, and until 2026-08-02 they did
        // not — they were summarised over every sample while the two figures above were already
        // filtered. The reason it survived that fix is that a sentinel drift is not a zero: it is
        // the distance the flight had covered when the cap stopped it, so it reads as a plausible
        // smaller number from a rocket that was still going downwind. Understated, on the figure a
        // flyer sizes a recovery area from.
        //
        // Asserted by CONSTRUCTION rather than by threshold: re-summarising the landed subset alone
        // must give the same drift band and the same radius as summarising the whole set does, which
        // is only true if the whole-set summary already ignores the un-landed ones. As a negative
        // control the old code fails this on the first design that hits the cap.
        if (mc.landedN > 0 && mc.landedN < mc.n) {
          const landedOnly = summarizeSamples(mc.samples.filter((x) => x.landed));
          const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
          if (
            !same(landedOnly.driftDistance.p50, mc.driftDistance.p50) ||
            !same(landedOnly.landingRadiusP95, mc.landingRadiusP95)
          ) {
            sentinels.push(
              `${shortName(f.name)} at ${scale}x: ${mc.n - mc.landedN} of ${mc.n} never landed, and ` +
                `their mid-air positions moved the drift band (${mc.driftDistance.p50.toFixed(1)} vs ` +
                `${landedOnly.driftDistance.p50.toFixed(1)} m) or the recovery radius ` +
                `(${mc.landingRadiusP95.toFixed(1)} vs ${landedOnly.landingRadiusP95.toFixed(1)} m)`,
            );
          }
        }
        // Where NOTHING landed there is no radius to draw at all, so both must be absent rather than
        // describing twelve rockets that were still in the air. Reproduced on
        // `Complex.Two-Stage.CDX1` at 5x: 0 of 12 landed, landing speed correctly withheld, and a
        // 58.0 m median drift and 121.4 m radius printed beside it.
        if (mc.landedN === 0 && (Number.isFinite(mc.driftDistance.p50) || Number.isFinite(mc.landingRadiusP95))) {
          sentinels.push(
            `${shortName(f.name)} at ${scale}x: nothing landed, yet median drift reads ` +
              `${mc.driftDistance.p50} m and the recovery radius ${mc.landingRadiusP95} m`,
          );
        }
      }
    }
    console.log(
      `dispersion landing sentinels across ${files.length} design files: ${checked} dispersions, ` +
        `${sawUnlanded} with at least one flight still airborne at the cap ` +
        `(${sawNoneLanded} where NONE landed, ${sawPartial} where some did) `,
    );
    expect(checked, "no dispersion ran, so this asserted nothing").toBeGreaterThan(10);
    expect(
      sawUnlanded,
      "no dispersion had an unlanded flight, so the sentinel path was never exercised",
    ).toBeGreaterThan(0);
    expect(sentinels, "a flight that never landed was reported as a landing").toEqual([]);
  }, 900_000);

  /** A fin set is judged for flutter only over the flight its own stage was still attached for.
   *
   *  `analyzeFlutter` walked the whole ascent for every fin set, so on a staged design a booster's
   *  fins were charged with the speed the SUSTAINER reached after they were already on the ground —
   *  and `results.reduce` made that the `worst` the entire flutter surface reports. Measured before
   *  the fix, every fin set on `Three stage low power rocket.ork` reported the identical 77.1 m/s at
   *  95 m, and the 0.68 margin lighting the red warning belonged to a fin set shed at 0.86 s; judged
   *  over its own flight it is 2.11. Flutter speed is the one safety estimate this app produces, and
   *  the worst fin set is also the one `FlutterFixHint` names and thickens.
   *
   *  Driven as a NEGATIVE CONTROL: drop the `phases` argument at the `analyzeFlutter` call in
   *  `simulate.ts` and this names every design whose fin sets collapse onto one sample. */
  it("judges each fin set over the flight its own stage was attached for", async () => {
    /** Which stage each fin set sits on, read from the MODEL rather than from the solver, so this
     *  is an independent derivation and not a restatement of the implementation. */
    const finStageOf = (rocket: Rocket): Map<string, number> => {
      const m = new Map<string, number>();
      const walk = (cs: RocketComponent[], stage: number) => {
        for (const c of cs) {
          if (
            c.kind === "trapezoidfinset" ||
            c.kind === "ellipticalfinset" ||
            c.kind === "freeformfinset"
          ) {
            m.set(c.id, stage);
          }
          walk(c.children, stage);
        }
      };
      rocket.stages.forEach((s, i) => walk(s.components, i));
      return m;
    };

    const late: string[] = [];
    let checked = 0;
    for (const f of files) {
      let doc;
      let run;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
        run = runFromDocument(doc);
      } catch {
        continue;
      }
      if (!run.hasPropulsion) continue;
      const flutter = run.result.flutter;
      // Detach times from the phase timeline the run reports, read through `StagePhase`'s own
      // documented meaning: `stageCount` is how many stages are still attached counting from the
      // nose, so stage `s` is gone from the first phase whose count has fallen to or below `s`.
      //
      // Counting separation EVENTS instead does not work, and getting that wrong made this test
      // silently weaker rather than louder: a serial stack can part at ONE joint and shed two
      // stages on a single event — `03.Three-stage.ork` does exactly that, phases
      // [{0,3},{7.33,1}] — so "the i-th separation removes stage n-i" assigned stage 1 an infinite
      // detach time and skipped the very fin set most likely to be judged out of its window.
      const phases = run.phases;
      if (!flutter || phases.length < 2) continue;
      const stageOf = finStageOf(doc.rocket);
      const detachOf = (stage: number): number =>
        phases.find((p) => p.stageCount <= stage)?.startTime ?? Infinity;

      // Narrowing a fin set's window can empty it: a stage shed before the rocket ever exceeds
      // 1 m/s leaves that set with no sample, and it then drops out of `finSets` with no error and
      // no marker — and if every fin-bearing stage went that early the whole flutter surface would
      // vanish from the flight card rather than say why. Nothing on today's corpus reaches it, and
      // this is what keeps it that way.
      if (flutter.finSets.length !== stageOf.size) {
        late.push(
          `${shortName(f.name)}: the design has ${stageOf.size} fin set(s) but flutter reports ` +
            `${flutter.finSets.length} — one was judged over an empty window and vanished silently`,
        );
      }

      for (const s of flutter.finSets) {
        const stage = stageOf.get(s.finId);
        if (stage === undefined || s.time === undefined) continue;
        const until = detachOf(stage);
        if (!Number.isFinite(until)) continue; // still attached at the end — nothing to check
        checked++;
        // A tenth of a second of slack: the trajectory is sampled, so the last sample before
        // separation can sit fractionally either side of the event's own timestamp.
        if (s.time > until + 0.1) {
          late.push(
            `${shortName(f.name)}: "${s.finName}" (stage ${stage}, shed at ${until.toFixed(2)} s) ` +
              `judged at t=${s.time.toFixed(2)} s, ${s.velocity.toFixed(1)} m/s, margin ${s.margin.toFixed(2)}`,
          );
        }
      }
    }
    console.log(
      `flutter stage-attachment across ${files.length} design files: ${checked} fin sets on stages that were shed`,
    );
    expect(checked, "no fin set was ever shed, so this asserted nothing").toBeGreaterThan(3);
    expect(late, "a shed stage's fins were judged at a speed they never saw").toEqual([]);
  }, 900_000);

  /** The landing speed a canopy is judged by does not change because the wind got up.
   *
   *  `groundHitVelocity` was the full ground-frame speed, `mag(state.vel)`, so under an open canopy
   *  it carried the horizontal drift — which IS the wind. The figure it is compared against, and
   *  the 25 ft/s and 35 ft/s rules of thumb it feeds, and the per-section landing energy a waiver
   *  cites, are all descent rates. On `USLI2025-FULLSCALE-10.15` it read 10.46 m/s at 20 mph
   *  against the file's own 5.61 at every wind, and the landing energy built on it was 3.7x too
   *  large — on the surface a flyer sizes a canopy from.
   *
   *  Driven as a NEGATIVE CONTROL: restore `mag(state.vel)` at the `groundHitVelocity` assignment
   *  and this names the designs and the exact speeds it moved to. The total is asserted to move in
   *  the same breath, so the test cannot be satisfied by making both wind-blind. */
  it("judges a canopy by its descent rate, which the wind does not change", async () => {
    const WINDS = [0, 4, 9];
    const drifted: string[] = [];
    let checked = 0;
    let sawTotalRise = 0;
    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      const runs = WINDS.map((windSpeed) => {
        try {
          return runFromDocument(doc, { overrides: { windSpeed } });
        } catch {
          return undefined;
        }
      });
      if (runs.some((r) => !r?.hasPropulsion)) continue;
      const sums = runs.map((r) => r!.result.summary);
      // Only designs that actually come down under a canopy: a ballistic arrival is dominated by
      // the vertical term anyway, so it cannot tell the two conventions apart.
      if (!sums.every((s) => s.landed && s.groundHitVelocity > 0 && s.groundHitVelocity < 30)) continue;
      checked++;

      const calm = sums[0].groundHitVelocity;
      for (let i = 1; i < sums.length; i++) {
        const moved = Math.abs(sums[i].groundHitVelocity - calm) / calm;
        // 2% covers the genuine second-order effect of a longer, wind-lengthened descent; the
        // defect moved it by 93% on the worst design.
        if (moved > 0.02) {
          drifted.push(
            `${shortName(f.name)}: descent rate ${calm.toFixed(2)} m/s calm -> ` +
              `${sums[i].groundHitVelocity.toFixed(2)} m/s at ${WINDS[i]} m/s of wind (+${(moved * 100).toFixed(0)}%)`,
          );
        }
      }
      // The drift is not discarded — it is reported as the arrival speed, and that one MUST rise.
      if (sums[sums.length - 1].groundHitTotalVelocity > sums[0].groundHitTotalVelocity * 1.05) {
        sawTotalRise++;
      }
    }
    console.log(
      `landing-speed wind invariance across ${files.length} design files: ${checked} designs flown at ` +
        `${WINDS.join("/")} m/s, ${sawTotalRise} whose arrival speed rises with the wind`,
    );
    expect(checked, "no design came down under a canopy, so this asserted nothing").toBeGreaterThan(5);
    expect(drifted, "the descent rate a canopy is judged by moved with the wind").toEqual([]);
    expect(
      sawTotalRise,
      "no design's arrival speed rose with the wind — the drift term has been dropped, not separated",
    ).toBeGreaterThan(0);
  }, 900_000);
  /** The optimum delay describes the vehicle on screen, not the one in the file.
   *
   *  When a design deploys before apogee its own apogee time reads low, so the delay is recomputed
   *  from a recovery-free coast. That recompute used the RAW build rather than the flight actually
   *  flown, and silently dropped every caller option — nose ballast, and the thrust/mass/drag scales
   *  and time step. Measured on `The Red Hunter.ork`: the delay sat at exactly 4.66 s for ballast 0,
   *  0.01, 0.02, 0.05 and 0.1 kg while apogee fell 258.5 → 147.4 m; the correct figures are
   *  4.66 / 4.99 / 5.20 / 5.31 / 4.58, so at 0.05 kg a flyer was told 4.66 s for a rocket that wants
   *  5.31 — on a number they set on the motor itself.
   *
   *  The invariant, which does not depend on any one design: the delay a run reports must equal the
   *  delay of the SAME run flown ballistic. Anything else means the two describe different vehicles. */
  it("reports an optimum delay for the vehicle it flew, ballast and all", async () => {
    const wrong: string[] = [];
    let exercised = 0;
    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      for (const ballastKg of [0, 0.05]) {
        let run;
        let ballistic;
        try {
          run = runFromDocument(doc, { ballastKg });
          ballistic = runFromDocument(doc, { ballastKg, ballistic: true });
        } catch {
          continue;
        }
        // Only designs that actually take the recompute branch can say anything here.
        if (!run.hasPropulsion || !run.result.deployedBeforeApogee) continue;
        const shown = run.result.summary.optimumDelay;
        const truth = ballistic.result.summary.optimumDelay;
        if (!Number.isFinite(shown) || !Number.isFinite(truth)) continue;
        exercised++;
        if (Math.abs(shown - truth) > 0.01) {
          wrong.push(
            `${shortName(f.name)} @ ${ballastKg} kg: shows ${shown.toFixed(2)} s, flew a rocket wanting ${truth.toFixed(2)} s`,
          );
        }
      }
    }
    console.log(`optimum delay checked on ${exercised} early-deploying flights across ${files.length} design files`);
    // Non-vacuous: if nothing deploys early the assert below proves nothing at all.
    expect(exercised, "no corpus design deployed before apogee, so this asserted nothing").toBeGreaterThan(0);
    expect(wrong, "the optimum delay describes a different vehicle than the flight beside it").toEqual([]);
  }, 300_000);
  /** The waiver number a flyer actually acts on, over real designs.
   *
   *  "Chance over ceiling" is the most actionable figure in the app. Its inputs are dispersed
   *  samples, and the sample filter used to ask only whether the apogee was FINITE — which a
   *  diverged integration is. Measured before the fix, on `FullScaleModelTH.rkt` at the panel's own
   *  default dispersions with a nominal recovery size of 4x: apogee p50 332 m but p95 4.881e18 m,
   *  and exceedance against a 1,000 m ceiling read 17.5% where the truth is 0%.
   *
   *  Driven at a recovery scale in the region that used to diverge, because that is the input that
   *  produced it — a Monte-Carlo at nominal settings would have passed throughout. */
  it("gives a dispersion a flyer could act on, at a recovery size that used to diverge", async () => {
    const bad: string[] = [];
    let checked = 0;
    for (const f of files.slice(0, 12)) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      let res;
      try {
        res = monteCarlo(doc.rocket, {
          n: 40,
          seed: 12345,
          recoveryCdScale: 4,
          dispersions: {
            impulseFrac: 0.05,
            massFrac: 0.03,
            dragFrac: 0.1,
            recoveryFrac: 0.15,
            rodAngleDeg: 2,
            windSpeedMps: 2,
          },
        });
      } catch {
        continue;
      }
      if (res.samples.length === 0) continue;
      checked++;
      // The band, not just the median: a single diverged sample moves p95 and leaves p50 alone,
      // which is exactly how this hid.
      for (const [name, stat] of [
        ["apogee", res.apogee],
        ["landing speed", res.landingSpeed],
      ] as const) {
        for (const [k, v] of Object.entries(stat)) {
          if (typeof v !== "number") continue;
          if (!Number.isFinite(v) || Math.abs(v) > 100_000) {
            bad.push(`${shortName(f.name)} ${name}.${k} = ${v.toExponential(3)}`);
          }
        }
      }
    }
    console.log(`dispersion bands checked on ${checked} designs at 4x recovery, 40 samples each`);
    expect(checked, "no design produced a dispersion, so this asserted nothing").toBeGreaterThan(0);
    expect(bad, "a dispersion band contains a figure physics cannot produce").toEqual([]);
  }, 900_000);

  /** The validation table was the THIRD surface to read a sentinel as a measurement.
   *
   *  `FlightSummary` reports 0 for a figure whose event never happened, and says so on the field
   *  itself: *"a sentinel, not a measurement ... Surfaces must withhold them rather than render the
   *  zeros"*. The Flight card obeyed it. The Monte-Carlo summary was fixed to obey it (the check
   *  directly above). `compareToStored` did not ask at all, and it is the surface that publishes a
   *  DIFFERENCE — so the sentinel came out not as a suspicious 0 but as a confident agreement
   *  figure against the source tool.
   *
   *  **One live case, on an unedited corpus file, with nothing exotic done to it.**
   *  `rocksimTestRocket1.rkt [E6-2]` flies with nothing out while the file states a 33.4 m/s
   *  deployment; the row read **"RockSim 33.4 m/s · Loft 0.0 m/s · −100%"**. The landing pair
   *  needs a flight that does not finish, which no corpus file does under its own recovery — so the
   *  arithmetic is pinned by `lib/validation/compare.test.ts` and the reachable half is pinned here.
   *
   *  The count is asserted EXACTLY. A withheld row is a real finding about a design, not a
   *  nuisance: if this number moves, either a flight changed or the gate did, and both want reading
   *  rather than a `toBeLessThan` that absorbs them silently. */
  it("never scores a stored metric against a flight that could not answer it", async () => {
    const scoredSentinels: string[] = [];
    const withheldRows: string[] = [];
    let rows = 0;
    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      for (const sim of doc.simulations) {
        let run;
        try {
          run = runFromDocument(doc, {
            configId: sim.conditions.configId,
            validateAgainst: doc.flownAsReduced ? undefined : sim,
            overrides: overridesFromStored(sim),
          });
        } catch {
          continue; // owned by the import/flight checks above
        }
        if (!run.validation) continue;
        const s = run.result.summary;
        const where = `${shortName(f.name)} [${sim.name}]`;
        for (const w of run.validation.withheld) withheldRows.push(`${where} ${w.key}`);
        for (const c of run.validation.comparisons) {
          rows++;
          // Stated as the condition each metric NEEDS, so a new metric with a new sentinel has to be
          // added here to be trusted — rather than as "is the value 0", which cannot tell a sentinel
          // from a rocket that genuinely did something at 0.
          const needs =
            c.key === "groundHitVelocity" || c.key === "flightTime"
              ? s.landed
              : c.key === "deploymentVelocity"
                ? s.deployments > 0
                : true;
          if (!needs) scoredSentinels.push(`${where} ${c.key} stored=${c.stored} loft=${c.simulated}`);
        }
      }
    }
    console.log(
      `${rows} stored comparisons scored; ${withheldRows.length} withheld: ${withheldRows.join(", ") || "none"}`,
    );
    expect(rows, "no stored comparison ran, so this asserted nothing").toBeGreaterThan(0);
    expect(scoredSentinels, "a stored metric was scored against a sentinel").toEqual([]);
    // The reachable half, named. Deleting the gate puts this row back among the scored ones above,
    // so the two assertions fail together rather than one covering for the other.
    expect(withheldRows).toEqual(["rocksimTestRocket1.rkt [E6-2] deploymentVelocity"]);
  }, 900_000);
});

describe("real-design corpus — the authoring panel answers on every part", () => {
  it("gives every part a verdict on every add gesture, and every refusal a reason", async () => {
    // **The gap this closes, measured before it was closed: of 569 parts across the 35 designs, 416
    // were offered NOTHING and told nothing.** The panel's add row had no else branch — a flyer
    // picking a centring ring, a bulkhead, a launch lug or a fin set got no button and no sentence.
    // `DESIGN.md` §5: a surface with no empty state is not finished.
    //
    // Asserted over the real corpus rather than a constructed rocket, because the point is coverage
    // across every part kind that occurs in the wild, and a hand-built tree only contains the kinds
    // whoever wrote it thought of.
    const files = corpusFiles();
    if (files.length === 0) return;
    let parts = 0;
    let silent = 0;
    const offeredBy = new Map<string, number>();
    const silentByKind = new Map<string, number>();
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      for (const p of flattenRocket(doc.rocket)) {
        parts++;
        const opts = addOptionsFor(doc.rocket, p.component.id);
        // Every kind, always, in a stable order — a caller cannot render a subset by forgetting one.
        expect(opts.map((o) => o.kind), `${f.name}: ${p.component.id}`).toEqual([...ADD_KINDS]);
        for (const o of opts) {
          if (o.offered) {
            expect(o.reason, `${f.name}: an offered gesture carries a refusal`).toBeUndefined();
            offeredBy.set(o.kind, (offeredBy.get(o.kind) ?? 0) + 1);
          } else {
            // The whole point: a refusal SAYS something, and says what would work instead.
            expect(o.reason, `${f.name}: ${p.component.kind} refused ${o.kind} with no reason`).toBeTruthy();
            expect(o.reason!.length, `${f.name}: a reason too short to teach anything`).toBeGreaterThan(20);
          }
        }
        if (opts.every((o) => !o.offered)) {
          silent++;
          silentByKind.set(p.component.kind, (silentByKind.get(p.component.kind) ?? 0) + 1);
        }
      }
    }
    const top = [...silentByKind.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ${n}`).join(", ");
    console.log(
      `add-gesture verdicts across ${files.length} design files: ${parts} parts x ${ADD_KINDS.length} kinds, ` +
        `${silent} parts take no gesture at all (${top}) — each now says why`,
    );
    // Every part answers. This is the assertion the milestone's *done when* rests on: not that every
    // part can be added to, which is false and should be, but that none is silent about it.
    expect(parts).toBeGreaterThan(500);
  }, 120_000);

  it("offers a mass object on every part with an interior bay, and on nothing else", async () => {
    // **R12 increment 21's *done when*.** A point mass needs neither an aft face to fair to nor a
    // bore to sit concentric in — only somewhere inside to sit — and it was gated on the bore test
    // anyway. So nose ballast, which the North Star names as the headline case, was refused on the
    // nose cone of all 35 designs, and an av-bay was refused on the coupler that in the field IS the
    // av-bay.
    //
    // Asserted as a PARTITION over the real corpus rather than a count: the offered set is named by
    // KIND and the names are checked, so a rule reaching the same 218 parts through a different set
    // fails. A count alone would not.
    //
    // **The obvious assertion here — `expect(opt.offered).toBe(canHostInsideMass(part))` — was
    // written first and it is CIRCULAR**, because `addOptionsFor` computes `offered` by calling that
    // exact predicate. It compares a function with itself and cannot fail for any rule. Caught by
    // the pre-push review, and recorded rather than quietly deleted: it is the same "a check that
    // cannot fire" shape this file already carries twice, arriving inside the test written to close
    // a gap. What carries the control is the KIND LIST below — narrowing the rule to body tubes
    // fails it with *"expected [ 'bodytube' ] to deeply equal [ 'bodytube', 'innertube', …(3) ]"*.
    const files = corpusFiles();
    if (files.length === 0) return;
    let offered = 0;
    let refused = 0;
    const offeredKinds = new Map<string, number>();
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      for (const p of flattenRocket(doc.rocket)) {
        const opt = addOptionsFor(doc.rocket, p.component.id).find((o) => o.kind === "masscomponent")!;
        if (!opt.offered) {
          // A refusal teaches, or it is not a refusal — the same bar the whole-panel test sets.
          expect(opt.reason, `${f.name}: ${p.component.kind} refused with no reason`).toBeTruthy();
          refused++;
          continue;
        }
        offered++;
        offeredKinds.set(p.component.kind, (offeredKinds.get(p.component.kind) ?? 0) + 1);
      }
    }
    const shape = [...offeredKinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ");
    console.log(`mass-object hosts across ${files.length} design files: ${offered} offered (${shape}), ${refused} refused`);
    // The five kinds and no others. Named rather than counted, so a rule that reached the same total
    // through a different set would fail here.
    expect([...offeredKinds.keys()].sort()).toEqual(["bodytube", "innertube", "nosecone", "transition", "tubecoupler"]);
    expect(offered).toBeGreaterThan(150);
  }, 120_000);

  it("authoring a mass into every bay leaves the mould line and the stability solve where they were", async () => {
    // **What makes the widening safe to ship, measured rather than argued.** A point mass has no
    // radius and is not on the outer mould line, so authoring one must move the airframe's length,
    // its reference radius, its Barrowman CP and its CNa by exactly nothing — while moving the mass
    // and the CG, which is the whole point of adding ballast.
    //
    // **Three of the assertions here CANNOT FAIL for this rule, and saying so is the point of this
    // paragraph.** A `masscomponent` contributes 0 to `outerRadius`, nothing to `barrowman`'s switch
    // and nothing to the top-level stacking cursor, so the CP, CNa, length and radius checks hold
    // whatever `canHostInsideMass` allows — and the station bound holds by construction, because the
    // offset is a fraction of the very span it is bounded by. They are kept as REGRESSION guards
    // against a future change that gives a point mass an extent, which is a real hazard, and they are
    // labelled rather than credited with a control they do not carry. Pointed out by the pre-push
    // review after the first draft's docblock claimed they would have caught the old length test.
    //
    // **The falsifiable one is the MASS**, and it is the assertion that carries this test: 50 g
    // authored into a host either arrives in the design's dry total or it does not, and which hosts
    // swallow it is a fact about real files rather than about the rule.
    const files = corpusFiles();
    if (files.length === 0) return;
    const ADD_KG = 0.05;
    let hosts = 0;
    let cgMoved = 0;
    // Hosts whose weight a design already states as part of a whole assembly or stage. Loft counts no
    // mass for the parts inside such a holder, so ballast added there moves the balance and not the
    // total — correctly, and the panels say so. NAMED rather than counted: `EscapeVelocity.ork`'s is a
    // STAGE-level `<overridesubcomponents>`, which a whole-design "does this file lump its airframe"
    // test does not see, and asking that question instead answers 20 where the truth is 22.
    const held: string[] = [];
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const before = doc.rocket;
      const baseLen = overallLength(before);
      const baseR = maxBodyRadius(before);
      const baseCP = barrowman(before);
      const baseCG = dryMassProperties(before).cg;
      const baseMass = dryMassProperties(before).mass;
      for (const p of flattenRocket(before)) {
        if (!canHostInsideMass(p.component)) continue;
        hosts++;
        const id = newPartId(before, undefined, p.component.id);
        const after = applyGeometryEdits(before, {
          added: [{ id, kind: "masscomponent", after: p.component.id, length: 0, mass: ADD_KG }],
        });
        const parts = flattenRocket(after);
        const made = parts.find((q) => q.component.id === id);
        expect(made, `${f.name}: ${p.component.kind} offered the gesture and built nothing`).toBeDefined();
        // Inside the part that holds it, not merely somewhere in the design — the station is derived
        // from the host's own length, so a host whose length is not a bay would land it outside.
        const hostPos = parts.find((q) => q.component.id === p.component.id)!;
        expect(made!.xFore, `${f.name}: ${p.component.kind} · mass authored outside its host`)
          .toBeGreaterThanOrEqual(hostPos.xFore - 1e-9);
        expect(made!.xFore).toBeLessThanOrEqual(hostPos.xFore + hostPos.length + 1e-9);
        // Nothing aerodynamic moves.
        const cp = barrowman(after);
        expect(overallLength(after)).toBeCloseTo(baseLen, 12);
        expect(maxBodyRadius(after)).toBeCloseTo(baseR, 12);
        expect(cp.cp, `${f.name}: ${p.component.kind} moved the CP`).toBeCloseTo(baseCP.cp, 12);
        expect(cp.cnAlpha, `${f.name}: ${p.component.kind} moved CNa`).toBeCloseTo(baseCP.cnAlpha, 12);
        // The CG stays inside the airframe, and 50 g of ballast is allowed to move it — that is the
        // capability. Only its staying a real station is asserted.
        const cg = dryMassProperties(after).cg;
        expect(Number.isFinite(cg) && cg > 0 && cg <= baseLen, `${f.name}: CG left the airframe`).toBe(true);
        if (Math.abs(cg - baseCG) > 1e-9) cgMoved++;
        // **The ballast arrives, or the design already stated a weight that contains it.** No third
        // outcome: a host that silently swallows 50 g without stating a lumped weight is mass the
        // flyer typed and the solver never flew.
        const gained = dryMassProperties(after).mass - baseMass;
        if (Math.abs(gained - ADD_KG) > 1e-9) {
          expect(gained, `${f.name}: ${p.component.kind} · authored mass neither arrived nor was held`).toBeCloseTo(0, 12);
          held.push(`${shortName(f.name)}:${p.component.kind}`);
        }
      }
    }
    console.log(
      `mass authored into ${hosts} bay parts: ${hosts - held.length} carried the 50 g, ${held.length} held it ` +
        `inside a stated assembly, ${cgMoved} moved the CG, 0 moved the mould line or the stability solve`,
    );
    expect(hosts).toBeGreaterThan(150);
    // An EXACT ratchet, like §9's counts: this number moving in either direction is a change to what
    // the corpus says about lumped designs, and it should fail until somebody has looked at why.
    expect(held.length, `hosts that hold the ballast: ${held.sort().join(", ")}`).toBe(22);
    expect(cgMoved, "adding ballast that moves no CG anywhere would mean the solve ignores it").toBeGreaterThan(150);
  }, 300_000);
});
