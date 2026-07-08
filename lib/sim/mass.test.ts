import { describe, it, expect } from "vitest";
import { combine, dryMassProperties, finChordCentroid } from "./mass";
import type { Rocket, BodyTube } from "../model/types";

describe("combine", () => {
  it("computes CG as a mass-weighted mean and inertia by parallel axis", () => {
    const mp = combine([
      { mass: 1, cg: 0, ownInertia: 0, source: "a" },
      { mass: 1, cg: 2, ownInertia: 0, source: "b" },
    ]);
    expect(mp.mass).toBe(2);
    expect(mp.cg).toBe(1);
    // Two 1 kg points at ±1 m from the CG → I = 2·(1·1²) = 2.
    expect(mp.inertia).toBeCloseTo(2, 6);
  });
});

describe("finChordCentroid", () => {
  it("is at mid-chord for a rectangular fin with no sweep", () => {
    expect(finChordCentroid(0.1, 0.1, 0)).toBeCloseTo(0.05, 6);
  });
  it("moves aft with leading-edge sweep", () => {
    expect(finChordCentroid(0.1, 0.05, 0.05)).toBeGreaterThan(0.05);
  });
});

describe("dryMassProperties", () => {
  it("computes a hollow body tube's mass from geometry", () => {
    // 1 m tube, OD 0.05 m, wall 0.001 m, density 1000 kg/m³.
    const ro = 0.025;
    const ri = ro - 0.001;
    const expected = Math.PI * (ro * ro - ri * ri) * 1.0 * 1000;
    const tube: BodyTube = {
      id: "b",
      name: "tube",
      kind: "bodytube",
      placement: { method: "after", offset: 0 },
      material: { name: "x", density: 1000, type: "bulk" },
      outerRadius: ro,
      thickness: 0.001,
      length: 1.0,
      children: [],
    };
    const rocket: Rocket = {
      name: "t",
      stages: [{ name: "s", components: [tube] }],
      configurations: [],
      referenceType: "maximum",
    };
    const mp = dryMassProperties(rocket);
    expect(mp.mass).toBeCloseTo(expected, 5);
    expect(mp.cg).toBeCloseTo(0.5, 3); // mid-length
  });
});
