import { describe, it, expect } from "vitest";
import { standardAtmosphere, atmosphereForGround } from "./atmosphere";

describe("Atmosphere (ISA)", () => {
  it("matches standard sea-level conditions", () => {
    const s = standardAtmosphere(0);
    expect(s.temperature).toBeCloseTo(288.15, 2);
    expect(s.pressure).toBeCloseTo(101325, 0);
    expect(s.density).toBeCloseTo(1.225, 2);
    expect(s.speedOfSound).toBeCloseTo(340.3, 0);
  });

  it("matches the standard at 11 km (tropopause)", () => {
    const s = standardAtmosphere(11000);
    expect(s.temperature).toBeCloseTo(216.65, 1);
    // Standard pressure at 11 km ≈ 22 632 Pa.
    expect(s.pressure).toBeGreaterThan(22000);
    expect(s.pressure).toBeLessThan(23300);
    expect(s.density).toBeLessThan(1.225);
  });

  it("temperature falls at the tropospheric lapse rate", () => {
    const s = standardAtmosphere(1000);
    expect(s.temperature).toBeCloseTo(288.15 - 6.5, 1);
  });

  it("calibrates to observed ground conditions at altitude", () => {
    const atm = atmosphereForGround(1500, 305, 84000); // hot, mile-high, low pressure
    const g = atm.sample(1500);
    expect(g.temperature).toBeCloseTo(305, 1);
    expect(g.pressure).toBeCloseTo(84000, -1);
    // Density is well below the sea-level standard on a hot, high, low-pressure day.
    expect(g.density).toBeLessThan(1.0);
  });
});
