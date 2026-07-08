import { describe, it, expect } from "vitest";
import { parseEng, thrustAt, impulseAt, propMassAt, motorMassAt, impulseClass } from "./eng";

const H128W = `; AeroTech H128W
H128W 29 194 14 0.09408 0.2016 AT
   0.024 102.423
   0.500 184.114
   1.000 137.000
   1.293 0.000
`;

describe("parseEng", () => {
  const c = parseEng(H128W);

  it("reads the header fields", () => {
    expect(c.designation).toBe("H128W");
    expect(c.manufacturer).toBe("AT");
    expect(c.diameterMm).toBe(29);
    expect(c.lengthMm).toBe(194);
    expect(c.propMass).toBeCloseTo(0.09408, 5);
    expect(c.totalMass).toBeCloseTo(0.2016, 4);
    expect(c.dryMass).toBeCloseTo(0.2016 - 0.09408, 4);
  });

  it("prepends a zero-thrust origin", () => {
    expect(c.samples[0]).toEqual({ t: 0, thrust: 0 });
  });

  it("classifies total impulse as an H", () => {
    expect(c.motorClass).toBe("H");
    expect(c.totalImpulse).toBeGreaterThan(160);
    expect(c.totalImpulse).toBeLessThanOrEqual(320);
  });

  it("interpolates thrust linearly and is zero outside the burn", () => {
    expect(thrustAt(c, -1)).toBe(0);
    expect(thrustAt(c, 2)).toBe(0);
    // midway between 0.024→0.5 samples
    const mid = thrustAt(c, 0.262);
    expect(mid).toBeGreaterThan(102);
    expect(mid).toBeLessThan(185);
  });

  it("depletes propellant with delivered impulse", () => {
    expect(propMassAt(c, 0)).toBeCloseTo(c.propMass, 6);
    expect(propMassAt(c, 2)).toBeCloseTo(0, 6);
    expect(impulseAt(c, 2)).toBeCloseTo(c.totalImpulse, 3);
    // motor mass falls monotonically from total to dry.
    expect(motorMassAt(c, 0)).toBeCloseTo(c.totalMass, 4);
    expect(motorMassAt(c, 2)).toBeCloseTo(c.dryMass, 4);
    expect(motorMassAt(c, 0.5)).toBeLessThan(c.totalMass);
    expect(motorMassAt(c, 0.5)).toBeGreaterThan(c.dryMass);
  });
});

describe("impulseClass", () => {
  it("maps total impulse to letters", () => {
    expect(impulseClass(2)).toBe("A");
    expect(impulseClass(4)).toBe("B");
    expect(impulseClass(20)).toBe("E");
    expect(impulseClass(300)).toBe("H");
    expect(impulseClass(2500)).toBe("K");
  });
});
