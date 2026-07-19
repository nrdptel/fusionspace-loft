import { describe, it, expect } from "vitest";
import { crossCheckSeries, dragAgreement, RECOVERY_CD_CEILING } from "./crosscheck";
import type { FlightResult, TrajectorySample, FlightPhase } from "../sim/simulate";
import type { StoredFlightData } from "../ork/adapt";

/** A trajectory sample with just the fields the cross-check reads; the rest are filled with zeros. */
function sample(t: number, altitude: number, cd: number, phase: FlightPhase): TrajectorySample {
  return {
    t, altitude, cd, phase,
    x: 0, velocity: 0, verticalVelocity: 0, acceleration: 0, mach: 0, thrust: 0, drag: 0, mass: 1, dynamicPressure: 0,
  };
}
const result = (samples: TrajectorySample[]) => ({ trajectory: samples }) as unknown as FlightResult;

function stored(points: Array<[number, number, number]>): StoredFlightData {
  return { branch: "Main", points: points.map(([time, altitude, cd]) => ({ time, altitude, cd, mach: 0, velocity: 0 })) };
}

describe("crossCheckSeries", () => {
  it("takes Loft's ascent drag (boost + coast), dropping descent and landed samples", () => {
    const r = result([
      sample(0, 0, 0.6, "rod"),
      sample(1, 100, 0.55, "boost"),
      sample(3, 300, 0.5, "coast"),
      sample(20, 50, 1.2, "descent"), // under canopy — excluded
      sample(30, 0, 0, "landed"),
    ]);
    const { loftCd } = crossCheckSeries(r, stored([[0, 0, 0.6], [3, 300, 0.5]]));
    expect(loftCd.map((p) => p.x)).toEqual([0, 1, 3]);
    expect(loftCd.every((p) => p.y > 0)).toBe(true);
  });

  it("takes the file's ascent drag up to its apogee, and drops a deployed-parachute coefficient", () => {
    // Apogee at t=3 (alt 300); the t=5 row is a parachute (Cd 45) after apogee — excluded twice over.
    const data = stored([
      [0, 0, 0.6],
      [2, 200, 0.55],
      [3, 300, 0.5],
      [5, 250, 45], // parachute, post-apogee
    ]);
    const { storedCd } = crossCheckSeries(result([sample(0, 0, 0.6, "boost"), sample(3, 300, 0.5, "coast")]), data);
    expect(storedCd.map((p) => p.x)).toEqual([0, 2, 3]);
    expect(Math.max(...storedCd.map((p) => p.y))).toBeLessThan(RECOVERY_CD_CEILING);
  });

  it("drops an early (pre-apogee) deployment's parachute spike from the drag curve", () => {
    // A too-short delay: chute opens at t=2 (Cd 60) before apogee at t=4. The spike must not appear.
    const data = stored([
      [0, 0, 0.6],
      [1, 120, 0.55],
      [2, 200, 60], // early deployment
      [4, 210, 55], // still under canopy
    ]);
    const { storedCd } = crossCheckSeries(result([sample(0, 0, 0.6, "boost")]), data);
    expect(storedCd.map((p) => p.y).every((y) => y < RECOVERY_CD_CEILING)).toBe(true);
    expect(storedCd.map((p) => p.x)).toEqual([0, 1]);
  });

  it("reports no drag curve when the file stored no usable Cd (NaN column), but still altitude", () => {
    const data = stored([[0, 0, NaN], [1, 100, NaN], [2, 150, NaN]]);
    const cc = crossCheckSeries(result([sample(0, 0, 0.6, "boost"), sample(1, 100, 0.5, "coast")]), data);
    expect(cc.haveDrag).toBe(false);
    expect(cc.storedCd).toHaveLength(0);
    expect(cc.storedAltitude).toHaveLength(3); // altitude still overlaid
    expect(cc.loftAltitude).toHaveLength(2);
  });

  it("flags a usable drag overlay only when both engines have an ascent curve", () => {
    const data = stored([[0, 0, 0.6], [1, 100, 0.55], [2, 150, 0.5]]);
    const cc = crossCheckSeries(result([sample(0, 0, 0.6, "boost"), sample(1, 100, 0.55, "coast")]), data);
    expect(cc.haveDrag).toBe(true);
  });
});

describe("dragAgreement", () => {
  const cc = (loft: TrajectorySample[], stored_: Array<[number, number, number]>) =>
    crossCheckSeries(result(loft), stored(stored_));

  it("reports zero difference for identical curves", () => {
    const loft = [sample(0, 0, 0.6, "boost"), sample(1, 100, 0.5, "coast"), sample(2, 150, 0.45, "coast")];
    const a = dragAgreement(cc(loft, [[0, 0, 0.6], [1, 100, 0.5], [2, 150, 0.45]]))!;
    expect(a.meanAbsCd).toBeCloseTo(0, 10);
    expect(a.meanPct).toBeCloseTo(0, 10);
    expect(a.n).toBe(3);
  });

  it("interpolates Loft onto stored times and averages the gap", () => {
    // Loft holds Cd 0.50 across t=0..2; stored is 0.40 at t=0.5 and 0.60 at t=1.5 → |Δ| = 0.10 each.
    const loft = [sample(0, 0, 0.5, "boost"), sample(2, 100, 0.5, "coast")];
    const a = dragAgreement(cc(loft, [[0.5, 20, 0.4], [1.5, 90, 0.6]]))!;
    expect(a.n).toBe(2);
    expect(a.meanAbsCd).toBeCloseTo(0.1, 10);
    // mean of 0.10/0.40 and 0.10/0.60 = (0.25 + 0.1667)/2 = 0.2083 → ~20.8%
    expect(a.meanPct).toBeCloseTo(20.83, 1);
  });

  it("compares only stored points inside Loft's ascent time span", () => {
    // Loft ascent spans t=0..1; the stored point at t=5 is outside and must be ignored.
    const loft = [sample(0, 0, 0.5, "boost"), sample(1, 80, 0.5, "coast")];
    const a = dragAgreement(cc(loft, [[0.5, 40, 0.5], [5, 200, 0.9]]))!;
    expect(a.n).toBe(1);
    expect(a.meanAbsCd).toBeCloseTo(0, 10);
  });

  it("is undefined when there is no drag overlay", () => {
    const loft = [sample(0, 0, 0.5, "boost"), sample(1, 80, 0.5, "coast")];
    expect(dragAgreement(cc(loft, [[0, 0, NaN], [1, 80, NaN]]))).toBeUndefined();
  });
});
