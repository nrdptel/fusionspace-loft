import { describe, it, expect } from "vitest";
import { noseRadius, noseProps, transitionProps } from "./shapes";
import type { NoseShape } from "../model/types";

const SHAPES: NoseShape[] = ["conical", "ogive", "ellipsoid", "power", "parabolic", "haack"];

describe("degenerate radius yields finite zero props (never NaN)", () => {
  // Real files whose "auto" radii can't be resolved end up zeroed. A zero base radius must not
  // poison volume/mass — the ogive contour in particular divides by R (rho = (R²+L²)/2R), so
  // R=0 would otherwise give Infinity → NaN and a NaN liftoff mass. Regression for a real
  // OpenRocket 15.03 template import that reported "NaN kg".
  for (const s of SHAPES) {
    it(`${s} nose with zero base radius`, () => {
      const p = noseProps(s, 0.15, 0);
      expect(Number.isFinite(p.volume)).toBe(true);
      expect(Number.isFinite(p.centroid)).toBe(true);
      expect(Number.isFinite(p.wettedArea)).toBe(true);
      expect(p.volume).toBe(0);
      expect(noseRadius(s, 0.05, 0.15, 0)).toBe(0);
    });
  }

  it("transition with zero radii is finite and empty", () => {
    const p = transitionProps("conical", 0.05, 0, 0);
    expect(Number.isFinite(p.volume)).toBe(true);
    expect(p.volume).toBe(0);
  });
});

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
