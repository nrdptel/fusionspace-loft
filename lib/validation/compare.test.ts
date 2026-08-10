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
  // Deliberately different, so the two events below cannot pass by accident.
  lastDeploymentVelocity: 1,
  // A flight that opened something and reached the ground — the baseline every case below varies
  // one fact away from.
  deployments: 1,
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

  // OpenRocket's stored deployment velocity is the LAST opening; Loft REPORTS the fastest, which is
  // the opening shock a flyer sizes hardware against. Both directions asserted on one summary.
  describe("the deployment velocity is compared against the event the file describes", () => {
    const dep = (event?: "max" | "last") =>
      compareToStored(summary, { deploymentVelocity: 3 }, event ? { deploymentVelocityEvent: event } : {})
        .comparisons.find((c) => c.key === "deploymentVelocity")!;

    it("scores the reported maximum by default — the only reading a silent format allows", () => {
      expect(dep().simulated).toBe(3);
    });

    it("scores the LAST opening for a file that stores that one — OpenRocket's", () => {
      expect(dep("last").simulated).toBe(1);
      expect(dep("last").pctError).toBeCloseTo(-66.6667, 3);
    });

    it("treats an explicit max as the default rather than as a third case", () => {
      expect(dep("max").simulated).toBe(dep().simulated);
    });
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

  /** A metric whose EVENT never happened is not a metric this flight scores 0 on.
   *
   *  `FlightSummary` reports 0 for the ground-hit velocity of a flight that never reached the ground
   *  and for the deployment velocity of a flight where nothing opened, and says on both fields that
   *  the zero is "a sentinel, not a measurement". The Flight card obeyed that; this table did not,
   *  and published the sentinel as a −100% disagreement with the source tool. The stored side
   *  of every case here is a real figure taken from the corpus file that exposed it. */
  describe("a metric the flight cannot answer is withheld rather than scored", () => {
    const NOT_LANDED: FlightSummary = {
      ...summary,
      landed: false,
      notLandedReason: "time-cap",
      // The sentinels the summary really carries in this state — see `simulate.ts`.
      groundHitVelocity: 0,
      flightTime: 1200,
    };
    const NOTHING_OPENED: FlightSummary = { ...summary, deployments: 0, deploymentVelocity: 0, lastDeploymentVelocity: 0 };

    it("withholds ground-hit velocity and flight time when the flight never landed", () => {
      const report = compareToStored(NOT_LANDED, { groundHitVelocity: 6.3, flightTime: 266.9 });
      expect(report.comparisons).toHaveLength(0);
      expect(report.withheld.map((w) => w.key).sort()).toEqual(["flightTime", "groundHitVelocity"]);
      // The reason is the reader's, not a code word — and it is the SAME sentence the Flight card
      // shows for the same flight, because both read it from `lib/sim/withheld.ts`.
      expect(report.withheld[0].reason).toContain("1,200 s cap");
    });

    it("tells the two non-landing outcomes apart", () => {
      const report = compareToStored(
        { ...NOT_LANDED, notLandedReason: "step-budget" },
        { groundHitVelocity: 6.3 },
      );
      expect(report.withheld[0].reason).toContain("could not integrate");
    });

    /** The live corpus case: `rocksimTestRocket1.rkt [E6-2]` flies with nothing out while the file
     *  states 33.4 m/s. Before this gate the row read "RockSim 33.4 · Loft 0.0 · −100%". */
    it("withholds deployment velocity when nothing opened on the flight", () => {
      const report = compareToStored(NOTHING_OPENED, { deploymentVelocity: 33.4284 });
      expect(report.comparisons).toHaveLength(0);
      expect(report.withheld).toHaveLength(1);
      expect(report.withheld[0].label).toBe("Deployment velocity");
    });

    /** The negative control the gate is worth nothing without: these same three metrics must still
     *  be compared on a flight that DID land with something out, or "withhold it" would be a
     *  synonym for "delete the row". */
    it("still scores all three on a flight that landed with a device out", () => {
      const report = compareToStored(summary, {
        groundHitVelocity: 5,
        flightTime: 120,
        deploymentVelocity: 3,
      });
      expect(report.comparisons.map((c) => c.key).sort()).toEqual([
        "deploymentVelocity",
        "flightTime",
        "groundHitVelocity",
      ]);
      expect(report.withheld).toEqual([]);
    });

    /** The two conditions are independent: a ballistic arrival is still an arrival, so a flight that
     *  lands with nothing out keeps its landing figures and loses only the deployment one. A single
     *  shared "something went wrong" gate would fail this. */
    it("keeps the landing figures on a flight that landed with nothing out", () => {
      const report = compareToStored(NOTHING_OPENED, {
        groundHitVelocity: 5,
        deploymentVelocity: 33.4284,
      });
      expect(report.comparisons.map((c) => c.key)).toEqual(["groundHitVelocity"]);
      expect(report.withheld.map((w) => w.key)).toEqual(["deploymentVelocity"]);
    });

    /** The metrics an unlanded flight still answers. Withholding the whole report would throw these
     *  away to suppress two bad rows, which is why the gate is per metric. */
    it("still scores the ascent metrics on a flight that never landed", () => {
      const report = compareToStored(NOT_LANDED, { maxAltitude: 1000, maxVelocity: 200, timeToApogee: 12 });
      expect(report.count).toBe(3);
      expect(report.withheld).toEqual([]);
    });

    /** The withheld rows must not reach the mean either — averaging a −100% into the headline
     *  accuracy figure is the same false number one line up. */
    it("leaves the withheld metrics out of the mean absolute error", () => {
      const report = compareToStored(NOT_LANDED, {
        maxAltitude: 1100, // exact — the only metric that can be scored here
        groundHitVelocity: 6.3,
        flightTime: 266.9,
      });
      expect(report.mape).toBeCloseTo(0, 6);
    });
  });
});
