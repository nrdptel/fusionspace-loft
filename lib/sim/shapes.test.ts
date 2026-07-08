import { describe, it, expect } from "vitest";
import { noseRadius, noseProps } from "./shapes";

describe("nose shapes", () => {
  it("cone radius is linear and volume is πr²L/3", () => {
    const R = 0.05;
    const L = 0.2;
    expect(noseRadius("conical", 0, L, R)).toBeCloseTo(0, 6);
    expect(noseRadius("conical", L / 2, L, R)).toBeCloseTo(R / 2, 6);
    expect(noseRadius("conical", L, L, R)).toBeCloseTo(R, 6);
    const p = noseProps("conical", L, R);
    expect(p.volume).toBeCloseTo((Math.PI * R * R * L) / 3, 4);
    // Cone volume centroid is 3/4 of the length from the tip.
    expect(p.centroid).toBeCloseTo(0.75 * L, 2);
  });

  it("ogive base radius equals R and volume ≈ 0.53·πR²L", () => {
    const R = 0.04;
    const L = 0.25;
    expect(noseRadius("ogive", L, L, R)).toBeCloseTo(R, 4);
    const p = noseProps("ogive", L, R);
    const ratio = p.volume / (Math.PI * R * R * L);
    expect(ratio).toBeGreaterThan(0.45);
    expect(ratio).toBeLessThan(0.62);
  });

  it("every shape reaches the base radius at x=L", () => {
    for (const s of ["conical", "ogive", "ellipsoid", "power", "parabolic", "haack"] as const) {
      expect(noseRadius(s, 0.3, 0.3, 0.05, 0.5)).toBeCloseTo(0.05, 3);
    }
  });
});
