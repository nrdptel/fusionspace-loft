import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importOrk } from "../ork/import";
import { pickConfig } from "./run";
import { buildSimulateInput, makeConditions } from "./setup";
import { simulate } from "./simulate";

/** Descent-step convergence guard. Under an open canopy the vehicle descends at a near-constant
 *  terminal velocity, so the descent integration step can be coarse without moving the answer —
 *  this pins that: the landing point, flight time, and ground-hit speed at the production descent
 *  step must match a step half its size to a tiny tolerance. If a future change makes the descent
 *  step-sensitive (a stiffer recovery model, say), this fails and the step must be revisited. */
async function load(name: string) {
  const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), "fixtures", name)));
  return importOrk(bytes);
}

function flyAtDescentStep(input: ReturnType<typeof buildSimulateInput>["input"], step: number) {
  const r = simulate({ ...input, descentTimeStep: step }).summary;
  return { flightTime: r.flightTime, landingX: r.landingX, landingY: r.landingY, drift: r.driftDistance, groundHit: r.groundHitVelocity };
}

describe("descent-step convergence", () => {
  it("the descent is converged: coarsening the step barely moves the landing", async () => {
    const doc = await load("demo-single-deploy.ork");
    const config = pickConfig(doc.rocket)!;
    // A light crosswind so drift is non-zero and the horizontal integration is actually exercised.
    const conditions = makeConditions({ windSpeed: 4, rodAngleDeg: 5 });
    const { input } = buildSimulateInput(doc.rocket, config, conditions);

    const steps = [0.025, 0.05, 0.1, 0.2];
    const runs = steps.map((s) => ({ s, ...flyAtDescentStep(input, s) }));
    const rel = (a: number, b: number) => (Math.abs(b) > 1e-9 ? Math.abs(a - b) / Math.abs(b) : Math.abs(a - b));

    // The production step (0.1) vs half its size (0.05): landing, flight time, and ground-hit speed
    // agree to a fraction of a percent — the descent is well past converged at the production step.
    const prod = runs.find((r) => r.s === 0.1)!;
    const half = runs.find((r) => r.s === 0.05)!;
    expect(rel(prod.flightTime, half.flightTime)).toBeLessThan(0.005);
    expect(rel(prod.drift, half.drift)).toBeLessThan(0.005);
    expect(rel(prod.groundHit, half.groundHit)).toBeLessThan(0.005);
    expect(Math.hypot(prod.landingX - half.landingX, prod.landingY - half.landingY)).toBeLessThan(0.01 * half.drift + 0.5);
  }, 30000);

  it("a canopy opening at speed stays stable even at an absurd step ceiling (no divergence)", async () => {
    // The payload-separation design pops its chute on lower-stage separation, well after burnout and
    // still moving — the stiff opening transient that made a fixed coarse step diverge to a
    // nonsensical speed. With the stability-bounded step, even a 1 s ceiling can't blow it up: the
    // step shortens through the transient on its own. Ground-hit stays finite and physical.
    const doc = await load("demo-payload-separation.ork");
    const config = pickConfig(doc.rocket)!;
    const { input } = buildSimulateInput(doc.rocket, config, makeConditions());
    for (const ceiling of [0.1, 0.5, 1.0]) {
      const r = simulate({ ...input, descentTimeStep: ceiling }).summary;
      expect(Number.isFinite(r.groundHitVelocity)).toBe(true);
      expect(r.groundHitVelocity).toBeGreaterThan(0);
      expect(r.groundHitVelocity).toBeLessThan(20); // under canopy — not a 1e11 blow-up
      expect(r.descentRate).toBeLessThan(20);
    }
  }, 30000);
});
