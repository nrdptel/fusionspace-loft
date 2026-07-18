import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { importOrk } from "../ork/import";
import { overridesFromStored, runFlight } from "./run";
import { monteCarlo, type MonteCarloOptions } from "./montecarlo";

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
});
