import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importOrk } from "../ork/import";
import { pickConfig, runFromDocument } from "./run";
import { buildSimulateInput, makeConditions } from "./setup";
import { simulate } from "./simulate";
import { recoverySizing, DESCENT_BODY_CDA_FACTOR } from "./recovery";
import { G0 } from "../units";

async function load(name: string) {
  const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), "fixtures", name)));
  return importOrk(bytes);
}

describe("recoverySizing (closed form)", () => {
  const input = { descentMass: 2, refArea: 0.01, airDensity: 1.225 };

  it("solves a Cd·A that yields the target terminal velocity", () => {
    const target = 5;
    const s = recoverySizing(input, target, 0.8);
    // Reconstruct the terminal velocity from the returned Cd·A (+ the body term) and confirm target.
    const totalCdA = s.cdA + DESCENT_BODY_CDA_FACTOR * input.refArea;
    const v = Math.sqrt((2 * input.descentMass * G0) / (input.airDensity * totalCdA));
    expect(v).toBeCloseTo(target, 6);
    expect(s.cdA).toBeGreaterThan(0);
  });

  it("a slower target needs a bigger canopy", () => {
    expect(recoverySizing(input, 4).cdA).toBeGreaterThan(recoverySizing(input, 6).cdA);
  });

  it("converts Cd·A to a diameter at the stated drag coefficient", () => {
    const s = recoverySizing(input, 5, 0.8);
    // Cd·A = Cd·π(D/2)²  ⇒  the reported diameter must reproduce the Cd·A.
    expect(0.8 * Math.PI * (s.diameter / 2) ** 2).toBeCloseTo(s.cdA, 9);
  });

  it("flags when the bare airframe already descends slowly enough", () => {
    // A feather-light, draggy airframe: body drag alone (0.5·0.06 = 0.03 m² Cd·A) already lands it
    // at ~3.3 m/s, under the 5 m/s target — no canopy needed for that.
    const s = recoverySizing({ descentMass: 0.02, refArea: 0.06, airDensity: 1.225 }, 5);
    expect(s.bareAlreadyMeets).toBe(true);
    expect(s.cdA).toBe(0);
  });

  it("degrades safely on nonsense input", () => {
    expect(recoverySizing({ descentMass: 0, refArea: 0.01, airDensity: 1.225 }, 5).cdA).toBe(0);
    expect(recoverySizing(input, 0).cdA).toBe(0);
  });
});

describe("recoverySizing round-trip against a real flight", () => {
  it("a design flown with the sized canopy lands at the target speed", async () => {
    const doc = await load("demo-single-deploy.ork");
    const config = pickConfig(doc.rocket)!;
    const run = runFromDocument(doc);
    const r = run.result;
    const refArea = Math.PI * r.stability.refRadius * r.stability.refRadius;

    const target = 4.0; // m/s
    const sizing = recoverySizing(
      { descentMass: r.burnoutMass, refArea, airDensity: r.descentAirDensity },
      target,
    );
    expect(sizing.cdA).toBeGreaterThan(0);

    // Fly the design with its canopy replaced by exactly the sized Cd·A, and confirm it lands at
    // the target — the closed form and the flight's own descent model agree.
    const { input } = buildSimulateInput(doc.rocket, config, makeConditions());
    expect(input.recovery.length).toBeGreaterThanOrEqual(1);
    input.recovery.forEach((dev, i) => {
      dev.cdA = i === 0 ? sizing.cdA : 0; // one canopy, sized; any others removed
    });
    const flown = simulate(input);
    expect(flown.summary.groundHitVelocity).toBeGreaterThan(0);
    expect(Math.abs(flown.summary.groundHitVelocity - target) / target).toBeLessThan(0.03);
  }, 20000);
});
