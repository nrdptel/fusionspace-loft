import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { importOrk } from "../ork/import";
import { overridesFromStored, runFlight } from "./run";
import { monteCarlo, exceedanceProbability, landingSpeedExceedance, plainResult, rehydrateResult, type MonteCarloOptions, type MonteCarloResult } from "./montecarlo";
import { newDesign } from "../model/starter";

async function load(name: string) {
  const buf = readFileSync(new URL(`../../fixtures/${name}`, import.meta.url));
  return importOrk(new Uint8Array(buf));
}

// Enough samples for the statistics to be stable, small enough that even the two-run tests stay
// quick on a slow shared CI runner.
const N = 50;
// Each sample is a full recovery flight (ascent + descent to landing), and some tests fly a few
// hundred of them; give them a generous ceiling so a slow runner never trips the 5 s default.
const T = 20_000;

async function baseOpts(overrides: Partial<MonteCarloOptions> = {}): Promise<{ rocket: Awaited<ReturnType<typeof load>>["rocket"]; opts: MonteCarloOptions }> {
  const doc = await load("demo-single-deploy.ork");
  const sim = doc.simulations[0];
  return {
    rocket: doc.rocket,
    opts: {
      n: N,
      seed: 12345,
      dispersions: { impulseFrac: 0.05, rodAngleDeg: 3, windSpeedMps: 2 },
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
      ...overrides,
    },
  };
}

describe("monteCarlo", () => {
  it(
    "is deterministic in the seed — same seed reproduces the cloud exactly",
    async () => {
      const { rocket, opts } = await baseOpts();
      const a = monteCarlo(rocket, opts);
      const b = monteCarlo(rocket, opts);
      expect(a.n).toBe(b.n);
      expect(a.apogee.p50).toBe(b.apogee.p50);
      expect(a.samples).toEqual(b.samples);
    },
    T,
  );

  it(
    "a different seed gives a different cloud",
    async () => {
      const { rocket, opts } = await baseOpts();
      const a = monteCarlo(rocket, opts);
      const b = monteCarlo(rocket, { ...opts, seed: 999 });
      expect(a.samples).not.toEqual(b.samples);
      // ...but the summary statistics should be close (same distribution, different draws).
      expect(Math.abs(a.apogee.p50 - b.apogee.p50) / a.apogee.p50).toBeLessThan(0.05);
    },
    T,
  );

  it(
    "flew (nearly) every requested sample — a resolvable design drops none",
    async () => {
      const { rocket, opts } = await baseOpts();
      const r = monteCarlo(rocket, opts);
      expect(r.n).toBe(N);
      expect(r.samples.length).toBe(N);
    },
    T,
  );

  it(
    "reports a landing-speed band — a sensible under-canopy descent that mass spread widens",
    async () => {
      const { rocket, opts } = await baseOpts();
      const r = monteCarlo(rocket, opts);
      // Every dispersed flight recovers, so the landing speed is a real under-canopy descent, and
      // the 95th percentile (the worst, hardest landing a flyer sizes recovery against) is at or
      // above the median.
      expect(r.landingSpeed.p50).toBeGreaterThan(0);
      expect(r.landingSpeed.p95).toBeLessThan(20);
      expect(r.landingSpeed.p95).toBeGreaterThanOrEqual(r.landingSpeed.p50);
      // Dispersing dry mass spreads the landing speed (a heavier build descends faster).
      const tight = monteCarlo(rocket, { ...opts, dispersions: { massFrac: 0.01 } });
      const wide = monteCarlo(rocket, { ...opts, dispersions: { massFrac: 0.2 } });
      expect(wide.landingSpeed.sd).toBeGreaterThan(tight.landingSpeed.sd);
    },
    T,
  );

  it(
    "reports a landing-energy band consistent with ½·m·v², widened by mass spread",
    async () => {
      const { rocket, opts } = await baseOpts();
      const r = monteCarlo(rocket, opts);
      // Positive, ordered, and each sample's energy is ½·m·v² for a physical descent mass (0.1–100 kg
      // implied by energy = ½ m v²): back out m from every sample and check it's a sane vehicle mass.
      expect(r.landingEnergy.p50).toBeGreaterThan(0);
      expect(r.landingEnergy.p95).toBeGreaterThanOrEqual(r.landingEnergy.p50);
      for (const s of r.samples) {
        const impliedMass = (2 * s.landingEnergy) / (s.landingSpeed * s.landingSpeed);
        expect(impliedMass).toBeGreaterThan(0.05);
        expect(impliedMass).toBeLessThan(100);
      }
      // A heavier build lands with more energy (½ m v² rises with both m and the faster descent), so
      // dispersing dry mass widens the energy band.
      const tight = monteCarlo(rocket, { ...opts, dispersions: { massFrac: 0.01 } });
      const wide = monteCarlo(rocket, { ...opts, dispersions: { massFrac: 0.2 } });
      expect(wide.landingEnergy.sd).toBeGreaterThan(tight.landingEnergy.sd);
    },
    T,
  );

  it(
    "recovery-drag spread widens the landing-speed band — the canopy dragFrac leaves untouched",
    async () => {
      const { rocket, opts } = await baseOpts();
      // dragFrac scales the ascent aero and explicitly does NOT touch the canopy, so it barely moves
      // the landing speed; recoveryFrac scales the canopy Cd·A and drives it.
      const ascentOnly = monteCarlo(rocket, { ...opts, dispersions: { dragFrac: 0.2 } });
      const canopy = monteCarlo(rocket, { ...opts, dispersions: { recoveryFrac: 0.2 } });
      expect(canopy.landingSpeed.sd).toBeGreaterThan(ascentOnly.landingSpeed.sd * 2);
      // A softer (draggier) canopy lands slower: the low tail of the band sits well under the median.
      expect(canopy.landingSpeed.p5).toBeLessThan(canopy.landingSpeed.p50);
    },
    T,
  );

  it(
    "zero dispersion collapses to a single deterministic outcome",
    async () => {
      const { rocket, opts } = await baseOpts({ dispersions: {}, n: 30 });
      const r = monteCarlo(rocket, opts);
      // Every flight is identical, so the band has zero width.
      expect(r.apogee.sd).toBeCloseTo(0, 6);
      expect(r.apogee.p5).toBeCloseTo(r.apogee.p95, 6);
      expect(r.maxVelocity.sd).toBeCloseTo(0, 6);
    },
    T,
  );

  it(
    "more impulse spread widens the apogee band",
    async () => {
      const { rocket, opts } = await baseOpts();
      const tight = monteCarlo(rocket, { ...opts, dispersions: { impulseFrac: 0.02 } });
      const wide = monteCarlo(rocket, { ...opts, dispersions: { impulseFrac: 0.15 } });
      expect(wide.apogee.sd).toBeGreaterThan(tight.apogee.sd * 2);
      // The median apogee should stay put — the spread grows around it, it doesn't shift.
      expect(Math.abs(wide.apogee.p50 - tight.apogee.p50) / tight.apogee.p50).toBeLessThan(0.05);
    },
    T,
  );

  it(
    "thrustScale raises apogee and total impulse monotonically",
    async () => {
      const doc = await load("demo-single-deploy.ork");
      const sim = doc.simulations[0];
      const fly = (thrustScale: number) =>
        runFlight(doc.rocket, {
          configId: sim.conditions.configId,
          overrides: overridesFromStored(sim),
          ballistic: true,
          thrustScale,
        }).result.summary;
      const nominal = fly(1);
      const hot = fly(1.2);
      const cold = fly(0.8);
      expect(hot.apogee).toBeGreaterThan(nominal.apogee);
      expect(cold.apogee).toBeLessThan(nominal.apogee);
      // A hotter motor also reaches a higher peak speed.
      expect(hot.maxVelocity).toBeGreaterThan(nominal.maxVelocity);
    },
    T,
  );

  it(
    "massScale lowers apogee and more mass spread widens the band",
    async () => {
      const doc = await load("demo-single-deploy.ork");
      const sim = doc.simulations[0];
      const fly = (massScale: number) =>
        runFlight(doc.rocket, {
          configId: sim.conditions.configId,
          overrides: overridesFromStored(sim),
          ballistic: true,
          massScale,
        }).result.summary;
      // A heavier-than-CAD build flies lower; a lighter one flies higher.
      expect(fly(1.15).apogee).toBeLessThan(fly(1).apogee);
      expect(fly(0.85).apogee).toBeGreaterThan(fly(1).apogee);

      // As a dispersion source, more mass spread widens the apogee band.
      const { rocket, opts } = await baseOpts();
      const tight = monteCarlo(rocket, { ...opts, dispersions: { massFrac: 0.01 } });
      const wide = monteCarlo(rocket, { ...opts, dispersions: { massFrac: 0.1 } });
      expect(wide.apogee.sd).toBeGreaterThan(tight.apogee.sd * 2);
    },
    T,
  );

  it(
    "dragScale lowers apogee and more drag spread widens the band",
    async () => {
      const doc = await load("demo-single-deploy.ork");
      const sim = doc.simulations[0];
      const fly = (dragScale: number) =>
        runFlight(doc.rocket, {
          configId: sim.conditions.configId,
          overrides: overridesFromStored(sim),
          ballistic: true,
          dragScale,
        }).result.summary;
      // More drag than the model's nominal flies lower; less drag flies higher.
      expect(fly(1.2).apogee).toBeLessThan(fly(1).apogee);
      expect(fly(0.8).apogee).toBeGreaterThan(fly(1).apogee);

      // As a dispersion source, more drag-coefficient spread widens the apogee band around a
      // roughly unchanged median.
      const { rocket, opts } = await baseOpts();
      const tight = monteCarlo(rocket, { ...opts, dispersions: { dragFrac: 0.02 } });
      const wide = monteCarlo(rocket, { ...opts, dispersions: { dragFrac: 0.2 } });
      expect(wide.apogee.sd).toBeGreaterThan(tight.apogee.sd * 2);
      expect(Math.abs(wide.apogee.p50 - tight.apogee.p50) / tight.apogee.p50).toBeLessThan(0.05);
    },
    T,
  );

  it(
    "wind spread drives the landing scatter and recovery radius",
    async () => {
      const { rocket, opts } = await baseOpts();
      const calm = monteCarlo(rocket, { ...opts, dispersions: { windSpeedMps: 0.5 } });
      const gusty = monteCarlo(rocket, { ...opts, dispersions: { windSpeedMps: 6 } });
      expect(gusty.landingRadiusP95).toBeGreaterThan(calm.landingRadiusP95);
      // The scatter is 2D — landings spread in both x and y, not along a single line.
      const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
      expect(spread(gusty.samples.map((s) => s.landingX))).toBeGreaterThan(0);
      expect(spread(gusty.samples.map((s) => s.landingY))).toBeGreaterThan(0);
    },
    T,
  );

  it(
    "exceedance probability tracks the apogee band against a ceiling",
    async () => {
      const { rocket, opts } = await baseOpts();
      const r = monteCarlo(rocket, opts);
      // A ceiling below every flight is certainly busted; above every flight, never.
      expect(exceedanceProbability(r, r.apogee.min - 1)).toBe(1);
      expect(exceedanceProbability(r, r.apogee.max + 1)).toBe(0);
      // At the median, roughly half the flights are over (within sampling noise).
      const pMedian = exceedanceProbability(r, r.apogee.p50);
      expect(pMedian).toBeGreaterThan(0.3);
      expect(pMedian).toBeLessThan(0.7);
      // Raising the ceiling can only lower the chance of exceeding it (monotonic).
      expect(exceedanceProbability(r, r.apogee.p95)).toBeLessThanOrEqual(exceedanceProbability(r, r.apogee.p5));
      // A degenerate ceiling is not a number.
      expect(exceedanceProbability(r, 0)).toBeNaN();
    },
    T,
  );

  it(
    "landing-speed exceedance tracks the landing-speed band against a threshold",
    async () => {
      const { rocket, opts } = await baseOpts();
      const r = monteCarlo(rocket, opts);
      // Below every flight's landing speed ⇒ every flight is at least that hard; above every ⇒ none.
      expect(landingSpeedExceedance(r, r.landingSpeed.min - 1)).toBe(1);
      expect(landingSpeedExceedance(r, r.landingSpeed.max + 1)).toBe(0);
      // Raising the threshold can only lower the chance of a landing that hard (monotonic).
      expect(landingSpeedExceedance(r, r.landingSpeed.p95)).toBeLessThanOrEqual(
        landingSpeedExceedance(r, r.landingSpeed.p5),
      );
      expect(landingSpeedExceedance(r, 0)).toBeNaN();
    },
    T,
  );

  it(
    "percentiles are ordered p5 ≤ p50 ≤ p95 within min/max",
    async () => {
      const { rocket, opts } = await baseOpts();
      const r = monteCarlo(rocket, opts);
      for (const stat of [r.apogee, r.maxVelocity, r.driftDistance]) {
        expect(stat.min).toBeLessThanOrEqual(stat.p5);
        expect(stat.p5).toBeLessThanOrEqual(stat.p50);
        expect(stat.p50).toBeLessThanOrEqual(stat.p95);
        expect(stat.p95).toBeLessThanOrEqual(stat.max);
      }
    },
    T,
  );

  it(
    "flies the same nominal conditions the single flight does, on a design that states none",
    async () => {
      // **A default written down twice is a default that will disagree with itself.** `nomAngle` and
      // `nomWind` were `?? 0` and `?? 0` — hand-copies of what `defaultConditions()` happened to
      // hold. When the wind default moved to 2 m/s they did not, and because every sample writes an
      // explicit `windSpeed` into its own overrides, the dispersion never falls through to
      // `makeConditions` and nothing downstream could correct it. Measured before the fix on the
      // from-scratch design: the Flight card reported a **411.28 m** drift and the dispersion beside
      // it a median of **0.00 m** — two surfaces, one design, and the number a flyer sizes a
      // recovery area with.
      //
      // With every dispersion off, each sample IS the nominal, so the median must land on the single
      // flight's own answer. That is the property worth pinning: it holds whatever the defaults are
      // later tuned to, and it fails the moment the two spellings diverge again.
      const doc = newDesign();
      const configId = doc.rocket.defaultConfigId;
      const single = runFlight(doc.rocket, { configId }).result.summary;
      const mc = monteCarlo(doc.rocket, { n: 8, seed: 7, dispersions: {}, configId });

      expect(single.driftDistance).toBeGreaterThan(1); // control: a nominal of zero would pass vacuously
      expect(mc.driftDistance.p50).toBeCloseTo(single.driftDistance, 2);
      expect(mc.apogee.p50).toBeCloseTo(single.apogee, 2);
    },
    T,
  );
});

describe("storing a finished dispersion", () => {
  /** A result whose landing figures are the withheld sentinel — the state this file documents as
   *  "`NaN` throughout when none landed". Built by hand rather than flown, because forcing a real
   *  300-flight run in which nothing reaches the ground takes a pathological recovery and the point
   *  here is the SHAPE, not the physics that produces it. */
  function withheld(): MonteCarloResult {
    const nan = { p5: NaN, p50: NaN, p95: NaN, mean: NaN, sd: NaN, min: NaN, max: NaN };
    return {
      samples: [
        { apogee: 100, maxVelocity: 50, driftDistance: 12, landed: false, landingX: 3, landingY: 4, landingSpeed: 0, landingEnergy: 0, extrapolated: false },
      ],
      apogee: { p5: 100, p50: 100, p95: 100, mean: 100, sd: 0, min: 100, max: 100 },
      maxVelocity: { p5: 50, p50: 50, p95: 50, mean: 50, sd: 0, min: 50, max: 50 },
      driftDistance: { ...nan },
      landingRadiusP95: NaN,
      landingSpeed: { ...nan },
      landingEnergy: { ...nan },
      n: 1,
      landedN: 0,
      extrapolatedN: 0,
    };
  }

  it(
    "gives back a real 300-flight result unchanged through storage",
    async () => {
      const { rocket, opts } = await baseOpts();
      const before = monteCarlo(rocket, { ...opts, n: 300 });
      const after = rehydrateResult(JSON.parse(JSON.stringify(plainResult(before))));
      expect(after).not.toBeNull();
      // Deep equality over the whole object: 300 samples and six bands, not a spot check on the
      // two figures that happen to be on the card.
      expect(after).toEqual(before);
    },
    120_000,
  );

  it("carries the withheld sentinel across storage, which the READER is what does", () => {
    const before = withheld();
    // The failure this exists to prevent, stated first: a plain round trip turns every one of those
    // NaNs into `null`, and `null` is not a withheld measurement — it is a number-typed field
    // holding something that is not a number.
    const naive = JSON.parse(JSON.stringify(before)) as MonteCarloResult;
    expect(naive.driftDistance.p50).toBeNull();
    expect(Number.isNaN(naive.landingRadiusP95)).toBe(false);

    // **And this is the half that fixes it.** `JSON.stringify` writes `NaN` as `null` on its own, so
    // reading `null` back as `NaN` is the entire mechanism — `plainResult` is write-side discipline,
    // not the sentinel's carrier, and a test that credited it would be describing the wrong half.
    // Fed the NAIVE bytes, with no write-side transform anywhere, the reader still restores it:
    const fromNaive = rehydrateResult(naive);
    expect(fromNaive).not.toBeNull();
    expect(Number.isNaN(fromNaive!.driftDistance.p50)).toBe(true);

    const after = rehydrateResult(JSON.parse(JSON.stringify(plainResult(before))));
    expect(after).not.toBeNull();
    expect(Number.isNaN(after!.driftDistance.p50)).toBe(true);
    expect(Number.isNaN(after!.landingSpeed.p95)).toBe(true);
    expect(Number.isNaN(after!.landingEnergy.mean)).toBe(true);
    expect(Number.isNaN(after!.landingRadiusP95)).toBe(true);
    // …and the figures that were NOT withheld are still numbers, so the sentinel is being carried
    // rather than smeared over everything.
    expect(after!.apogee.p50).toBe(100);
    expect(after!.landedN).toBe(0);
  });

  it("refuses a record whose counts disagree with the samples it carries", () => {
    const r = withheld();
    const stored = plainResult(r) as Record<string, unknown>;
    // `landedN` is what four of the six figures are withheld on, so a record claiming a landing it
    // does not carry would publish a drift band computed from nothing.
    expect(rehydrateResult({ ...stored, landedN: 1 })).toBeNull();
    expect(rehydrateResult({ ...stored, n: 2 })).toBeNull();
    expect(rehydrateResult({ ...stored, extrapolatedN: 1 })).toBeNull();
  });

  it("refuses a malformed record all-or-nothing rather than reading part of it", () => {
    const r = withheld();
    const stored = plainResult(r) as Record<string, unknown>;
    expect(rehydrateResult(null)).toBeNull();
    expect(rehydrateResult("not a result")).toBeNull();
    expect(rehydrateResult({ ...stored, samples: "nope" })).toBeNull();
    expect(rehydrateResult({ ...stored, apogee: { p5: 1 } })).toBeNull();
    // A missing field is not a withheld one. `undefined` must fail where `null` succeeds, or a
    // record written by an older shape reads as a run whose figures were deliberately withheld.
    expect(rehydrateResult({ ...stored, landingRadiusP95: undefined })).toBeNull();
    expect(rehydrateResult({ ...stored, landingRadiusP95: null })).not.toBeNull();
    // A sample missing its booleans is not a sample.
    expect(rehydrateResult({ ...stored, samples: [{ apogee: 1 }] })).toBeNull();
  });

  it("refuses a record whose landing figures disagree with its landed count", () => {
    // The invariant the counts exist to express, and which counting alone does not check. Every
    // surface withholds drift, the recovery radius, landing speed and landing energy on `landedN === 0`
    // — so a record claiming landings while storing those four as withheld would be RENDERED, reading
    // NaN as a measurement on the surface a flyer sizes a recovery area from.
    const withheldButLanded = plainResult({
      ...withheld(),
      samples: [{ apogee: 100, maxVelocity: 50, driftDistance: 12, landed: true, landingX: 3, landingY: 4, landingSpeed: 5, landingEnergy: 6, extrapolated: false }],
      landedN: 1,
    }) as Record<string, unknown>;
    expect(rehydrateResult(withheldButLanded)).toBeNull();

    // …and the mirror: no landings, but finite landing figures — a band computed from nothing.
    const measuredButNoneLanded = plainResult({
      ...withheld(),
      driftDistance: { p5: 1, p50: 2, p95: 3, mean: 2, sd: 1, min: 1, max: 3 },
      landingRadiusP95: 4,
      landingSpeed: { p5: 1, p50: 2, p95: 3, mean: 2, sd: 1, min: 1, max: 3 },
      landingEnergy: { p5: 1, p50: 2, p95: 3, mean: 2, sd: 1, min: 1, max: 3 },
    }) as Record<string, unknown>;
    expect(rehydrateResult(measuredButNoneLanded)).toBeNull();
  });

  it("stores an infinity as withheld rather than reading it back as a measurement", () => {
    const r = withheld();
    r.apogee.max = Infinity;
    const after = rehydrateResult(JSON.parse(JSON.stringify(plainResult(r))));
    expect(after).not.toBeNull();
    expect(Number.isNaN(after!.apogee.max)).toBe(true);
  });
});
