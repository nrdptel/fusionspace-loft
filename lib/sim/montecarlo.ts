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
import type { ConditionOverrides } from "./setup";
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
}

/** One dispersed flight's headline outcomes. */
export interface MonteCarloSample {
  apogee: number;
  maxVelocity: number;
  /** Horizontal distance from the pad to the landing point (m). */
  driftDistance: number;
  /** Landing point relative to the pad (m), for the 2D scatter. */
  landingX: number;
  landingY: number;
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
  driftDistance: Stat;
  /** Radius (m) from the pad containing 95% of the landings — the recovery area to plan for. */
  landingRadiusP95: number;
  /** Flights that actually flew (a sample whose motor can't resolve is dropped). */
  n: number;
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

/** Fly the dispersed samples one at a time, yielding each successful flight, so a caller can spread
 *  the work across the event loop (the UI stays responsive during a few hundred flights). Advances
 *  the seeded PRNG deterministically regardless of how the caller consumes it. A sample whose flight
 *  can't be built (unresolved motor, degenerate geometry) advances the stream but yields nothing, so
 *  the yielded samples describe real flights only. */
export function* monteCarloSamples(rocket: Rocket, opts: MonteCarloOptions): Generator<MonteCarloSample> {
  const rand = mulberry32(opts.seed);
  const d = opts.dispersions;
  const base = opts.overrides ?? {};
  const nomAngle = base.rodAngleDeg ?? 0;
  const nomWind = base.windSpeed ?? 0;

  for (let i = 0; i < opts.n; i++) {
    // Draw every random for this sample up front so the PRNG stream is a stable function of the
    // sample index (adding a dispersion source later doesn't reshuffle the earlier ones).
    const gImpulse = gaussian(rand);
    const gMass = gaussian(rand);
    const gAngle = gaussian(rand);
    const gWind = gaussian(rand);
    const railBearing = rand() * 360; // rail-lean direction — arbitrary
    const windBearing = rand() * 360; // wind heading — arbitrary
    const gDrag = gaussian(rand); // drawn last so adding it doesn't reshuffle the earlier draws

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
        thrustScale,
        massScale,
        dragScale,
      });
      if (!run.hasPropulsion) continue;
      const s = run.result.summary;
      if (!Number.isFinite(s.apogee)) continue;
      yield {
        apogee: s.apogee,
        maxVelocity: s.maxVelocity,
        driftDistance: s.driftDistance,
        landingX: s.landingX,
        landingY: s.landingY,
      };
    } catch {
      // A sample that can't be flown is dropped from the distribution.
    }
  }
}

/** Summarize a set of dispersed samples into per-metric bands and the recovery radius. */
export function summarizeSamples(samples: MonteCarloSample[]): MonteCarloResult {
  const driftSorted = samples.map((s) => s.driftDistance).sort((a, b) => a - b);
  return {
    samples,
    apogee: summarize(samples.map((s) => s.apogee)),
    maxVelocity: summarize(samples.map((s) => s.maxVelocity)),
    driftDistance: summarize(samples.map((s) => s.driftDistance)),
    landingRadiusP95: percentile(driftSorted, 0.95),
    n: samples.length,
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
