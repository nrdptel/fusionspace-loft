import { describe, it, expect } from "vitest";
import { compareToStored } from "./compare";
import type { FlightSummary } from "../sim/simulate";

const summary: FlightSummary = {
  apogee: 1100,
  landed: true,
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
  groundHitTotalVelocity: 6,
  optimumDelay: 10,
  // Deliberately different from `optimumDelay`, so the two bases below cannot pass by accident:
  // this is the shape of a flight whose canopy opened before apogee, where `run.ts` has replaced
  // the reported figure with a recovery-free coast and this one is what actually happened.
  optimumDelayAsFlown: 2,
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

  // The two formats store the optimum delay for two different flights, and the comparison has to
  // pick the matching one. Asserted in BOTH directions on the same summary, because a selector that
  // simply always read one field would pass a one-sided test.
  describe("the optimum delay is compared against the flight the file describes", () => {
    const delay = (basis?: "free-coast" | "as-flown") =>
      compareToStored(summary, { optimumDelay: 10 }, basis ? { optimumDelayBasis: basis } : {})
        .comparisons.find((c) => c.key === "optimumDelay")!;

    it("scores the reported free-coast figure by default — OpenRocket's convention", () => {
      expect(delay().simulated).toBe(10);
      expect(delay().pctError).toBeCloseTo(0, 6);
    });

    it("scores the as-flown figure for a file that stores apogee minus burnout — RockSim's", () => {
      expect(delay("as-flown").simulated).toBe(2);
      expect(delay("as-flown").pctError).toBeCloseTo(-80, 6);
    });

    it("treats an explicit free-coast basis as the default rather than as a third case", () => {
      expect(delay("free-coast").simulated).toBe(delay().simulated);
    });
  });
});
