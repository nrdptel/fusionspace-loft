import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { importOrk } from "../ork/import";
import { overridesFromStored } from "./run";
import { monteCarlo, type MonteCarloOptions } from "./montecarlo";
import { runMonteCarlo } from "./montecarlo-client";

async function load(name: string) {
  return importOrk(new Uint8Array(readFileSync(new URL(`../../fixtures/${name}`, import.meta.url))));
}

async function baseOpts(): Promise<{ rocket: Awaited<ReturnType<typeof load>>["rocket"]; opts: MonteCarloOptions }> {
  const doc = await load("demo-single-deploy.ork");
  const sim = doc.simulations[0];
  return {
    rocket: doc.rocket,
    opts: {
      n: 40,
      seed: 7,
      dispersions: { impulseFrac: 0.05, massFrac: 0.03, rodAngleDeg: 3, windSpeedMps: 2 },
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    },
  };
}

describe("montecarlo-client (batched, non-blocking)", () => {
  it(
    "runMonteCarlo yields exactly what the synchronous monteCarlo does",
    async () => {
      const { rocket, opts } = await baseOpts();
      const sync = monteCarlo(rocket, opts);
      const async = await runMonteCarlo(rocket, opts);
      // The async runner only spreads the work across the event loop; results must be identical.
      expect(async).toEqual(sync);
    },
    20_000,
  );

  it(
    "abort mid-run returns null rather than a partial distribution",
    async () => {
      const { rocket, opts } = await baseOpts();
      // Abort immediately: the run bails at the first batch boundary and reports nothing.
      const r = await runMonteCarlo(rocket, opts, () => true);
      expect(r).toBeNull();
    },
    20_000,
  );

  it(
    "reports progress as batches complete",
    async () => {
      const { rocket, opts } = await baseOpts();
      const seen: number[] = [];
      const r = await runMonteCarlo(rocket, opts, undefined, (done) => seen.push(done));
      expect(r).not.toBeNull();
      // Progress is monotonically increasing and bounded by the requested count.
      expect(seen.length).toBeGreaterThan(0);
      for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
      expect(seen[seen.length - 1]).toBeLessThanOrEqual(opts.n);
    },
    20_000,
  );

  it(
    "emits partial distributions that fill in toward the final one",
    async () => {
      const { rocket, opts } = await baseOpts();
      const partials: number[] = [];
      const final = await runMonteCarlo(rocket, opts, undefined, undefined, (p) => partials.push(p.n));
      expect(final).not.toBeNull();
      // The preview arrives more than once and each has flown at least as many samples as the last —
      // the cloud grows, never shrinks.
      expect(partials.length).toBeGreaterThan(1);
      for (let i = 1; i < partials.length; i++) expect(partials[i]).toBeGreaterThanOrEqual(partials[i - 1]);
      // A partial never reports more flights than the whole run.
      expect(partials[partials.length - 1]).toBeLessThanOrEqual(final!.n);
      // The final result is exactly the synchronous one — the preview changes only WHEN, not WHAT.
      expect(final).toEqual(monteCarlo(rocket, opts));
    },
    20_000,
  );
});
