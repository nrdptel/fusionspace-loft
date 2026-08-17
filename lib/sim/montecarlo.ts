/** Monte-Carlo flight dispersion: fly the design many times with the motor total impulse, dry mass,
 *  aerodynamic drag, and launch conditions (rail lean, wind) jittered around their nominal values,
 *  and report the spread of the outcomes — how high it reaches, how fast it goes, and how far from
 *  the pad it comes down. This turns a single deterministic flight into a *distribution*, which is
 *  what a flyer actually needs to size a recovery area or gauge whether a waiver ceiling is safe
 *  under real-world variability.
 *
 *  Every sample is an ordinary Loft flight through the same trusted solver — nothing about the
 *  physics changes. The uncertainty is entirely in the INPUTS, which are the flyer's own stated
 *  assumptions (a rail is never perfectly plumb; wind gusts and shifts; a motor's total impulse
 *  varies lot to lot). So the output is an honest propagation of stated input uncertainty, not a
 *  claim of new precision. The rail-lean and wind DIRECTIONS are sampled uniformly (any bearing),
 *  so the landing scatter maps the recovery area to plan for regardless of the day's wind heading.
 *
 *  Determinism: the whole run is driven by a seeded PRNG (a design's dispersion is reproducible and
 *  testable), rather than Math.random — so re-running the same design with the same seed gives the
 *  same cloud, and a static export never depends on wall-clock entropy. */

import type { Rocket } from "../model/types";
import { defaultConditions, type ConditionOverrides } from "./setup";
import { radToDeg } from "../units";
import type { GeometryEdits } from "../model/edit";
import { runFlight } from "./run";

/** One-sigma spreads on the dispersed inputs. An omitted or zero spread holds that input at its
 *  nominal value (so a flyer can disperse just the sources they care about). */
export interface Dispersions {
  /** Motor total-impulse tolerance as a fraction, 1σ (e.g. 0.05 = ±5%). Scales the thrust curve.
   *  Hobby single-use motors are certified to a total-impulse band; ~5% (1σ) is a common planning
   *  figure. The dominant driver of apogee spread. */
  impulseFrac?: number;
  /** Dry-mass build tolerance as a fraction, 1σ (e.g. 0.03 = ±3%). Scales the airframe's structural
   *  mass — a built rocket rarely hits its CAD mass exactly (epoxy, layup, hardware). Together with
   *  impulse, one of the two main drivers of apogee spread. */
  massFrac?: number;
  /** Launch-rod angle from vertical, 1σ (deg). A rail is never perfectly plumb; the lean is added
   *  to the nominal rod angle and its bearing is random. Drives both a small apogee loss and the
   *  downrange landing spread. */
  rodAngleDeg?: number;
  /** Wind-speed spread around the nominal, 1σ (m/s), truncated at zero. The main driver of how far
   *  and how variably the rocket drifts under canopy. */
  windSpeedMps?: number;
  /** Drag-coefficient uncertainty as a fraction, 1σ (e.g. 0.1 = ±10%). Scales the aerodynamic
   *  (zero-lift) drag. Drag is the single largest error source in a preliminary sim (see the
   *  limitations log), so its uncertainty belongs in the apogee band alongside impulse and mass —
   *  without it the spread reads tighter than the physics warrants. Does not touch a deployed
   *  canopy's drag area. */
  dragFrac?: number;
  /** Deployed-recovery drag-area uncertainty as a fraction, 1σ (e.g. 0.15 = ±15%). Scales every open
   *  canopy's Cd·A per sample. A real parachute's drag coefficient is only known to ±10–20%, and it —
   *  not the airframe — sets the descent rate, so this is the main driver of the landing-speed band
   *  and (with wind) the drift spread. Distinct from `dragFrac`, which is the ascent aero and leaves
   *  the canopy untouched. Truncated well off zero so the descent stays physical. */
  recoveryFrac?: number;
}

export interface MonteCarloOptions {
  /** Number of flights to fly. */
  n: number;
  /** PRNG seed — same seed ⇒ same dispersion cloud. */
  seed: number;
  dispersions: Dispersions;
  /** The stored flight configuration to fly (each sample flies it with jittered inputs). */
  configId?: string;
  /** Nominal launch conditions (the dispersions jitter around these). */
  overrides?: ConditionOverrides;
  /** Active what-ifs, held fixed across every sample (the design the flyer is looking at). */
  ballastKg?: number;
  motorSwap?: { manufacturer?: string; designation: string; diameter?: number };
  geometry?: GeometryEdits;
  /** Active recovery-size what-if (scale on deployed drag area), held fixed across every sample —
   *  so the landing scatter reflects the resized canopy the flyer is looking at. */
  recoveryCdScale?: number;
}

/** One dispersed flight's headline outcomes. */
export interface MonteCarloSample {
  apogee: number;
  maxVelocity: number;
  /** Horizontal distance from the pad to the landing point (m). */
  driftDistance: number;
  /** Whether this flight reached the ground inside the time cap. When false its `landingSpeed` and
   *  `landingEnergy` are 0 sentinels rather than measurements, and the summary leaves it out of
   *  both. */
  landed: boolean;
  /** Landing point relative to the pad (m), for the 2D scatter. */
  landingX: number;
  landingY: number;
  /** VERTICAL descent speed at impact (m/s) — how hard it lands under recovery, the
   *  recovery-adequacy figure, and the convention `FIRM_LANDING_MPS` / `HARD_LANDING_MPS` below
   *  are written in. Not the speed over the ground: wind drift moves that without making the
   *  canopy any smaller, so a dispersion over it would report the weather's spread, not the
   *  design's. */
  landingSpeed: number;
  /** Kinetic energy at ground impact (J), ½·m·v² for the whole vehicle — the recovery-adequacy figure
   *  many fields and waivers set a per-section limit on, so its worst-case matters as much as speed. */
  landingEnergy: number;
  /** This flight left the drag model's validated subsonic envelope (M > 0.8), so its numbers are a
   *  bounded parametric estimate rather than a solution.
   *
   *  **Per sample, not per run, because a dispersion is precisely where the two mix.** The sweep
   *  varies impulse, mass and drag, so a design sitting near M0.8 nominally puts part of its
   *  distribution outside the envelope and part inside — and the tail that crosses is the fast tail,
   *  which is the one that sets the 95th-percentile figures a flyer sizes recovery against. A single
   *  per-run flag could only say "some of this is extrapolated" or, worse, take the nominal flight's
   *  answer for all 300. */
  extrapolated: boolean;
}

/** A metric's spread: median with a 5th–95th-percentile band, plus mean and standard deviation. */
export interface Stat {
  p5: number;
  p50: number;
  p95: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
}

export interface MonteCarloResult {
  samples: MonteCarloSample[];
  apogee: Stat;
  maxVelocity: Stat;
  /** Horizontal distance from the pad to the landing point (m). **Landed flights only**, like the
   *  three figures below it — see `landedN`. `NaN` throughout when none landed, which a surface must
   *  withhold rather than render. */
  driftDistance: Stat;
  /** Radius (m) from the pad containing 95% of the landings — the recovery area to plan for. */
  landingRadiusP95: number;
  /** Ground-impact descent-rate spread (m/s) — how hard it lands across the dispersion; the 95th
   *  percentile is the worst-case a flyer sizes recovery against. Computed over the flights that
   *  actually REACHED the ground: a flight still airborne at the time cap carries a 0 sentinel, not
   *  a measurement, and averaging those in reported a soft landing that never happened. */
  landingSpeed: Stat;
  /** Ground-impact kinetic energy spread (J) for the whole vehicle — the field/waiver recovery-
   *  adequacy figure; its 95th percentile is the worst-case to check against a landing-energy limit.
   *  Same population as `landingSpeed`. */
  landingEnergy: Stat;
  /** Flights that actually flew (a sample whose motor can't resolve is dropped). */
  n: number;
  /** Of those, how many reached the ground inside the time cap. `landingSpeed`, `landingEnergy`,
   *  `driftDistance` and `landingRadiusP95` describe these and only these, so a surface must
   *  withhold ALL FOUR when this is 0 — the same house rule the flight card follows, and for the
   *  same reason: a flyer enlarging a canopy watched the landing energy fall to 0 J and read it as
   *  success. Drift and the radius joined that list on 2026-08-02; they had been summarised over
   *  every sample, which understated the recovery area in the unsafe direction. */
  landedN: number;
  /** How many of the `n` flown samples left the drag model's validated subsonic envelope.
   *
   *  A COUNT rather than a boolean, because "3 of 300" and "300 of 300" are different claims about
   *  the same distribution and a surface that flattened them would say the same thing about both.
   *  Zero means every dispersed flight stayed inside the envelope, and the surface marks nothing. */
  extrapolatedN: number;
}

/** mulberry32 — a small, fast, well-distributed 32-bit PRNG. Seeded and deterministic. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standard-normal sample (Box–Muller) from a uniform PRNG. */
function gaussian(rand: () => number): number {
  // Guard u1 away from 0 so log() is finite.
  const u1 = Math.max(1e-12, rand());
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Percentile (linear interpolation) of a sorted ascending array; p in [0,1]. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function summarize(values: number[]): Stat {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = n > 0 ? sorted.reduce((a, b) => a + b, 0) / n : NaN;
  const variance = n > 1 ? sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return {
    p5: percentile(sorted, 0.05),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    mean,
    sd: Math.sqrt(variance),
    min: n > 0 ? sorted[0] : NaN,
    max: n > 0 ? sorted[n - 1] : NaN,
  };
}

/** Whether a flown sample describes something a hobby rocket could actually have done.
 *
 *  This was `Number.isFinite(apogee)` alone, and finiteness is not the same question. A sample whose
 *  integration diverges comes back FINITE and enormous, so it passed straight through and poisoned
 *  the distribution — measured on `FullScaleModelTH.rkt` at the dispersion panel's own defaults with
 *  a nominal recovery size of 4x: apogee p50 332 m, **p95 4.881e18 m**, and "chance over ceiling"
 *  against a 1,000 m waiver read **17.5%** where the true answer is 0%. That is the single most
 *  actionable number in the app — a flyer reads it to decide whether a flight busts their waiver.
 *
 *  The divergence that produced it is fixed at source (the integrator's step is now bound by the
 *  canopy rather than by the flight phase, and the corpus flies every design at 0.1/2/5/10x to keep
 *  it that way), so this filter should now never fire. It is here because the consequence of the
 *  next one is a confidently wrong safety number rather than a crash, and a filter that only asks
 *  about finiteness cannot see that shape of wrong at all.
 *
 *  The bounds are ceilings no hobby flight approaches, not tolerances: the Karman line, and roughly
 *  orbital speed. A sample past either is the integrator talking, not the rocket. */
function physicallyPossible(s: {
  apogee: number;
  maxVelocity: number;
  groundHitVelocity: number;
  landingEnergy: number;
}): boolean {
  return (
    Number.isFinite(s.apogee) &&
    s.apogee <= 100_000 &&
    Number.isFinite(s.maxVelocity) &&
    s.maxVelocity <= 8_000 &&
    Number.isFinite(s.groundHitVelocity) &&
    s.groundHitVelocity <= 8_000 &&
    Number.isFinite(s.landingEnergy) &&
    s.landingEnergy <= 1e9
  );
}

/** Fly the dispersed samples one at a time, yielding each successful flight, so a caller can spread
 *  the work across the event loop (the UI stays responsive during a few hundred flights). Advances
 *  the seeded PRNG deterministically regardless of how the caller consumes it. A sample whose flight
 *  can't be built (unresolved motor, degenerate geometry) advances the stream but yields nothing, so
 *  the yielded samples describe real flights only. */
export function* monteCarloSamples(rocket: Rocket, opts: MonteCarloOptions): Generator<MonteCarloSample> {
  const rand = mulberry32(opts.seed);
  const d = opts.dispersions;
  const base = opts.overrides ?? {};
  // **The nominals come from `defaultConditions()`, never from a literal.** These two lines read
  // `?? 0` and `?? 0` — hand-copies of what the engine defaults happened to be — and on 2026-08-08
  // the wind default moved to 2 m/s and this one did not. Because the loop below ALWAYS writes an
  // explicit `windSpeed` into each sample's overrides, the dispersion never falls through to
  // `makeConditions`, so nothing downstream could correct it: measured on the from-scratch design,
  // the Flight card flew a 411.28 m drift while the dispersion beside it reported a median of
  // 0.00 m. Two surfaces, one design, one number a flyer sizes a recovery area with.
  //
  // This is the exact failure `flownOverrides` in `components/LoftApp.tsx` was extracted to prevent
  // — its docblock records the same defect arriving from the other direction — and the lesson is the
  // same one: a default written down twice is a default that will disagree with itself. Derive it.
  const engine = defaultConditions();
  const nomAngle = base.rodAngleDeg ?? radToDeg(engine.rodAngleFromVertical);
  const nomWind = base.windSpeed ?? engine.windSpeed;

  for (let i = 0; i < opts.n; i++) {
    // Draw every random for this sample up front so the PRNG stream is a stable function of the
    // sample index (adding a dispersion source later doesn't reshuffle the earlier ones).
    const gImpulse = gaussian(rand);
    const gMass = gaussian(rand);
    const gAngle = gaussian(rand);
    const gWind = gaussian(rand);
    const railBearing = rand() * 360; // rail-lean direction — arbitrary
    const windBearing = rand() * 360; // wind heading — arbitrary
    const gDrag = gaussian(rand);
    const gRecovery = gaussian(rand); // drawn last so adding it doesn't reshuffle the earlier draws

    // Impulse: a motor never delivers below ~a tenth of its rating, so clamp the tail off zero to
    // keep a physical (and integrable) flight; the clamp only bites at absurd σ.
    const thrustScale = d.impulseFrac ? Math.max(0.1, 1 + gImpulse * d.impulseFrac) : 1;
    // Dry mass: a build can't lose more than its whole structure, so clamp the low tail well off
    // zero; the clamp only bites at absurd σ.
    const massScale = d.massFrac ? Math.max(0.2, 1 + gMass * d.massFrac) : 1;
    // Rod angle: nominal lean plus jitter, magnitude ≥ 0 (a negative "angle from vertical" is just
    // a lean the other way, already covered by the random bearing).
    const rodAngleDeg = d.rodAngleDeg ? Math.abs(nomAngle + gAngle * d.rodAngleDeg) : nomAngle;
    const windSpeed = d.windSpeedMps ? Math.max(0, nomWind + gWind * d.windSpeedMps) : nomWind;
    // Drag scale: a physical drag is positive, so clamp the low tail well off zero (only bites at
    // absurd σ). Nominal 1 when no drag spread is set.
    const dragScale = d.dragFrac ? Math.max(0.2, 1 + gDrag * d.dragFrac) : 1;
    // Recovery drag scale: a deployed canopy's Cd·A, clamped positive. Combined below with any active
    // recovery-size what-if, so the dispersion jitters around the size the flyer is looking at.
    const recoveryScale = d.recoveryFrac ? Math.max(0.2, 1 + gRecovery * d.recoveryFrac) : 1;

    const overrides: ConditionOverrides = {
      ...base,
      rodAngleDeg,
      rodAzimuthDeg: d.rodAngleDeg ? railBearing : base.rodAzimuthDeg,
      windSpeed,
      windToDeg: d.windSpeedMps ? windBearing : base.windToDeg,
    };

    try {
      const run = runFlight(rocket, {
        configId: opts.configId,
        overrides,
        ballastKg: opts.ballastKg,
        motorSwap: opts.motorSwap,
        geometry: opts.geometry,
        recoveryCdScale: (opts.recoveryCdScale ?? 1) * recoveryScale,
        thrustScale,
        massScale,
        dragScale,
      });
      if (!run.hasPropulsion) continue;
      const s = run.result.summary;
      if (!physicallyPossible(s)) continue;
      yield {
        apogee: s.apogee,
        maxVelocity: s.maxVelocity,
        driftDistance: s.driftDistance,
        landingX: s.landingX,
        landingY: s.landingY,
        landingSpeed: s.groundHitVelocity,
        landingEnergy: s.landingEnergy,
        landed: s.landed,
        extrapolated: run.result.extrapolatedTransonic,
      };
    } catch {
      // A sample that can't be flown is dropped from the distribution.
    }
  }
}

/** Summarize a set of dispersed samples into per-metric bands and the recovery radius. */
export function summarizeSamples(samples: MonteCarloSample[]): MonteCarloResult {
  // Landing statistics come from the flights that LANDED. `groundHitVelocity` and `landingEnergy`
  // are 0 on a flight still airborne at the 1,200 s cap — a sentinel the solver documents as such,
  // not a measurement — and summarising them alongside real landings published a distribution the
  // flight card one route away refuses to publish as a single number. Measured on
  // `Complex.Two-Stage.CDX1` at a recovery size inside the field's own 0.1-10x range: 40 of 40
  // samples were sentinels, and the panel read 0.00 m/s median landing speed and 0.0 J.
  const landed = samples.filter((s) => s.landed);
  // **Drift and the recovery radius belong to that same population, and until 2026-08-02 they did
  // not.** They were the one landing quantity still summarised over EVERY sample, and the reason it
  // survived the fix above is that a sentinel drift does not look like a sentinel: `simulate` sets
  // `driftDistance` from `state.pos` at loop exit unconditionally (`groundHitVelocity` beside it is
  // gated on `landed`), so a flight still descending at the cap contributes the distance it had
  // reached SO FAR. Not a zero anyone would notice — a plausible, smaller number, from a rocket that
  // was still travelling downwind when it was measured.
  //
  // That is understated in the unsafe direction on the one figure whose whole job is to say how big
  // a recovery area to plan for. Reproduced on `Complex.Two-Stage.CDX1` at 5x recovery size, a value
  // inside the field's own 0.1-10x range: 0 of 12 samples landed, the panel correctly withheld
  // landing speed as "no dispersed flight reached the ground" — and printed a 58.0 m median drift
  // and a 121.4 m recovery radius beside it, describing twelve rockets that were all still in the
  // air. Two stats in one card disagreeing about whether the flight finished is worse than either
  // alone.
  const landedDriftSorted = landed.map((s) => s.driftDistance).sort((a, b) => a - b);
  return {
    samples,
    apogee: summarize(samples.map((s) => s.apogee)),
    maxVelocity: summarize(samples.map((s) => s.maxVelocity)),
    driftDistance: summarize(landed.map((s) => s.driftDistance)),
    landingRadiusP95: percentile(landedDriftSorted, 0.95),
    landingSpeed: summarize(landed.map((s) => s.landingSpeed)),
    landingEnergy: summarize(landed.map((s) => s.landingEnergy)),
    n: samples.length,
    landedN: landed.length,
    // Over EVERY flown sample, not just the landed ones: apogee and max speed are summarised over
    // all of them, and those are the two figures the transonic envelope actually bounds.
    extrapolatedN: samples.filter((s) => s.extrapolated).length,
  };
}

/** Fly `rocket` `n` times with dispersed inputs and summarize the outcomes. Deterministic in
 *  `seed`. A sample whose flight can't be built (unresolved motor, degenerate geometry) is
 *  dropped rather than counted as a pad-drop, so the statistics describe real flights only. */
export function monteCarlo(rocket: Rocket, opts: MonteCarloOptions): MonteCarloResult {
  return summarizeSamples([...monteCarloSamples(rocket, opts)]);
}

/** Fraction of dispersed flights whose apogee exceeds `ceilingM` (metres) — the "chance of busting
 *  a waiver ceiling" a high-power flyer checks their altitude limit against. In [0,1]; NaN when
 *  there are no samples or the ceiling isn't a positive number. It carries the model's own
 *  systematic error (the apogee bias), so it's a planning cue, not a guarantee. */
export function exceedanceProbability(result: MonteCarloResult, ceilingM: number): number {
  if (result.n === 0 || !(ceilingM > 0)) return NaN;
  const over = result.samples.reduce((c, s) => c + (s.apogee > ceilingM ? 1 : 0), 0);
  return over / result.n;
}

/** Landing-speed thresholds (m/s), the same rule-of-thumb boundaries the flight's own hard-landing
 *  warning uses: above ~7.6 m/s (25 ft/s) a landing gets firm; past ~10.7 m/s (35 ft/s) it risks
 *  damage on all but the toughest airframes. */
export const FIRM_LANDING_MPS = 7.6;
export const HARD_LANDING_MPS = 10.7;

/** Fraction of dispersed flights that land at or above `speedMps` — the chance of a landing at least
 *  that hard, the recovery-adequacy companion to the waiver-ceiling exceedance. For a marginal
 *  recovery it answers the actionable question the band alone doesn't: not just how hard the worst
 *  case is, but how often it happens.
 *
 *  Denominated over the flights that LANDED, not over every flight. Counting a still-airborne
 *  sample as "did not land hard" is the most flattering possible reading of a flight that has not
 *  finished: it reported 0.0% chance of a firm landing on a design where no sample reached the
 *  ground at all. In [0,1]; NaN when nothing landed or the threshold is not positive. */
export function landingSpeedExceedance(result: MonteCarloResult, speedMps: number): number {
  if (result.landedN === 0 || !(speedMps > 0)) return NaN;
  const landed = result.samples.filter((s) => s.landed);
  const over = landed.reduce((c, s) => c + (s.landingSpeed > speedMps ? 1 : 0), 0);
  return over / landed.length;
}

/** --- storing a result, and reading one back ----------------------------------------------------
 *
 *  A finished dispersion is 300 flights of work, and following one of the docs links the app plants
 *  beside its own numbers used to throw it away. Keeping it means writing it down, and writing it
 *  down means answering the question the last attempt at persistence in this repo got wrong:
 *  **which fields of this object are DATA, and which only look like it.**
 *
 *  The answer here is not a class instance or a closure — `MonteCarloResult` is plain numbers and
 *  booleans all the way down. It is `NaN`, and `JSON.stringify` turns it into `null` in silence.
 *  Measured on the 38 mm sample: an ordinary 300-flight run has **2,739 leaves and round-trips with
 *  none of them changed**, so nothing about the normal case would ever reveal the problem. A run in
 *  which nothing landed has **39 leaves and loses 29 of them to `null`** — and those 29 are exactly
 *  the figures this file documents as "`NaN` throughout when none landed, which a surface must
 *  withhold rather than render". A `null` is not `NaN`: `Number.isFinite(null)` is false, so the
 *  panel's own formatter happens to hold, but `result.landingEnergy.p95 > 0` and every future
 *  reader would be comparing against a value whose type says `number` and whose contents are not.
 *
 *  **The half that carries the sentinel is the READER, and it is worth being exact about which.**
 *  `JSON.stringify` already writes `NaN` as `null`, so `rehydrateResult` turning `null` back into
 *  `NaN` is the whole of the fix; a control confirms the round trip holds with no write-side
 *  transform at all. `plainResult` is not that fix and is not sold as one. It is the write-side
 *  discipline `readSlot` applies to the session record for the same reason: it rebuilds the object
 *  field by field, so only what the reader knows about is ever written, and a field this type grows
 *  later that ISN'T plain data — a Map, a class, a closure — is dropped loudly by the reader rather
 *  than smuggled through by `JSON.stringify` and found on a surface.
 *
 *  The pair lives HERE, beside the type whose contract it is keeping, rather than in the storage
 *  module. The storage module cannot see that `NaN` means "withheld"; this file is where that is
 *  written down. */

/** A number as it can be written down: the withheld sentinel becomes `null`, everything else stays.
 *  A non-finite that is NOT `NaN` (an infinity) is also stored as `null` — it is not a value any
 *  surface here should render either, and reading it back as one would be inventing a measurement. */
function plainNumber(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

function plainStat(s: Stat): Record<string, number | null> {
  return {
    p5: plainNumber(s.p5),
    p50: plainNumber(s.p50),
    p95: plainNumber(s.p95),
    mean: plainNumber(s.mean),
    sd: plainNumber(s.sd),
    min: plainNumber(s.min),
    max: plainNumber(s.max),
  };
}

/** A finished result reduced to the half that survives `JSON.stringify` — the write-side counterpart
 *  of `rehydrateResult`, and it lives beside it so the two cannot drift. Shaped as a transform over
 *  the result rather than a flag on the writer, so the only form that ever reaches storage is the
 *  one that can be read back. */
export function plainResult(r: MonteCarloResult): unknown {
  return {
    samples: r.samples.map((s) => ({
      apogee: plainNumber(s.apogee),
      maxVelocity: plainNumber(s.maxVelocity),
      driftDistance: plainNumber(s.driftDistance),
      landed: s.landed,
      landingX: plainNumber(s.landingX),
      landingY: plainNumber(s.landingY),
      landingSpeed: plainNumber(s.landingSpeed),
      landingEnergy: plainNumber(s.landingEnergy),
      extrapolated: s.extrapolated,
    })),
    apogee: plainStat(r.apogee),
    maxVelocity: plainStat(r.maxVelocity),
    driftDistance: plainStat(r.driftDistance),
    landingRadiusP95: plainNumber(r.landingRadiusP95),
    landingSpeed: plainStat(r.landingSpeed),
    landingEnergy: plainStat(r.landingEnergy),
    n: r.n,
    landedN: r.landedN,
    extrapolatedN: r.extrapolatedN,
  };
}

/** `null` back to the withheld sentinel; anything that is neither a finite number nor `null` fails
 *  the read. `undefined` is a missing field, not a withheld one, and is refused for that reason —
 *  a record written by an older shape must not read as a run whose figures were withheld. */
function readNumber(x: unknown): number | null {
  if (x === null) return NaN;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function readStat(x: unknown): Stat | null {
  if (!x || typeof x !== "object") return null;
  const s = x as Record<string, unknown>;
  const out = {} as Record<string, number>;
  for (const k of ["p5", "p50", "p95", "mean", "sd", "min", "max"] as const) {
    const v = readNumber(s[k]);
    if (v === null) return null;
    out[k] = v;
  }
  return out as unknown as Stat;
}

/** A stored result, or `null` if any part of it is not one.
 *
 *  **All or nothing, deliberately**, for the same reason the undo stack is: a half-read dispersion
 *  is a cloud whose scatter and whose bands describe different populations, and a flyer sizes a
 *  recovery area off exactly that disagreement. Every count is checked against the samples that
 *  back it, because `landedN` is what four of the six figures are withheld on — a record claiming
 *  landings it does not carry would publish a drift band computed from nothing. */
export function rehydrateResult(x: unknown): MonteCarloResult | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  if (!Array.isArray(r.samples)) return null;
  const samples: MonteCarloSample[] = [];
  for (const raw of r.samples) {
    if (!raw || typeof raw !== "object") return null;
    const s = raw as Record<string, unknown>;
    if (typeof s.landed !== "boolean" || typeof s.extrapolated !== "boolean") return null;
    const nums = {} as Record<string, number>;
    for (const k of ["apogee", "maxVelocity", "driftDistance", "landingX", "landingY", "landingSpeed", "landingEnergy"] as const) {
      const v = readNumber(s[k]);
      if (v === null) return null;
      nums[k] = v;
    }
    samples.push({ ...(nums as unknown as Omit<MonteCarloSample, "landed" | "extrapolated">), landed: s.landed, extrapolated: s.extrapolated });
  }
  const apogee = readStat(r.apogee);
  const maxVelocity = readStat(r.maxVelocity);
  const driftDistance = readStat(r.driftDistance);
  const landingSpeed = readStat(r.landingSpeed);
  const landingEnergy = readStat(r.landingEnergy);
  const landingRadiusP95 = readNumber(r.landingRadiusP95);
  if (!apogee || !maxVelocity || !driftDistance || !landingSpeed || !landingEnergy || landingRadiusP95 === null) return null;
  const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
  const n = count(r.n);
  const landedN = count(r.landedN);
  const extrapolatedN = count(r.extrapolatedN);
  if (n === null || landedN === null || extrapolatedN === null) return null;
  // The counts are what the surfaces withhold on, so a record whose counts disagree with its own
  // samples is refused rather than repaired: `landedN` deciding a drift band that the samples say
  // nobody flew is the wrong-number case this whole read path exists to prevent.
  if (n !== samples.length) return null;
  if (landedN !== samples.filter((s) => s.landed).length) return null;
  if (extrapolatedN !== samples.filter((s) => s.extrapolated).length) return null;
  // **And the invariant the counts exist to express, which the counts alone do not check.** This
  // file's own docblocks state it twice: the drift band, the recovery radius, the landing speed and
  // the landing energy are `NaN` throughout when `landedN` is 0, and every surface withholds all four
  // on exactly that test. A record with landings but withheld landing figures would therefore be
  // RENDERED — NaN read as a measurement on the surface a flyer sizes recovery from — and a record
  // with no landings but finite ones would publish a band computed from nothing.
  const landingFigures = [driftDistance, landingSpeed, landingEnergy].flatMap((st) => [st.p5, st.p50, st.p95, st.mean, st.min, st.max]).concat(landingRadiusP95);
  const withheld = landingFigures.every((v) => Number.isNaN(v));
  const measured = landingFigures.every((v) => Number.isFinite(v));
  if (landedN === 0 ? !withheld : !measured) return null;
  return { samples, apogee, maxVelocity, driftDistance, landingRadiusP95, landingSpeed, landingEnergy, n, landedN, extrapolatedN };
}
