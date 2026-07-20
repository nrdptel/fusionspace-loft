import { describe, it, expect } from "vitest";
import { compareToStored } from "./compare";
import type { FlightSummary } from "../sim/simulate";

const summary: FlightSummary = {
  apogee: 1100,
  maxVelocity: 200,
  maxAcceleration: 240,
  maxMach: 0.58,
  timeToApogee: 12,
  flightTime: 120,
  railExitVelocity: 20,
  thrustToWeight: 8,
  burnoutVelocity: 195,
  burnoutAltitude: 120,
  maxDynamicPressure: 20000,
  groundHitVelocity: 5,
  optimumDelay: 10,
  deploymentVelocity: 3,
  driftDistance: 40,
  landingX: 40,
  landingY: 0,
  descentRate: 6,
  landingEnergy: 18,
};

describe("compareToStored", () => {
  it("diffs each stored metric with signed percentage error", () => {
    const report = compareToStored(summary, { maxAltitude: 1000, maxVelocity: 200 });
    expect(report.count).toBe(2);
    const apogee = report.comparisons.find((c) => c.key === "maxAltitude")!;
    expect(apogee.stored).toBe(1000);
    expect(apogee.simulated).toBe(1100);
    expect(apogee.pctError).toBeCloseTo(10, 3);
    const v = report.comparisons.find((c) => c.key === "maxVelocity")!;
    expect(v.pctError).toBeCloseTo(0, 6);
    expect(report.mape).toBeCloseTo(5, 3);
  });

  it("ignores metrics absent from the stored data", () => {
    const report = compareToStored(summary, { maxAltitude: 1000 });
    expect(report.count).toBe(1);
  });
});
