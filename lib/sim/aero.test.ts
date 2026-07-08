import { describe, it, expect } from "vitest";
import { barrowman, aeroGeometry, dragCoefficient, skinFriction } from "./aero";
import { Atmosphere } from "./atmosphere";
import type { Rocket, NoseCone, BodyTube, TrapezoidFinSet } from "../model/types";

function coneRocket(): Rocket {
  const nose: NoseCone = {
    id: "n",
    name: "nose",
    kind: "nosecone",
    placement: { method: "after", offset: 0 },
    length: 0.2,
    aftRadius: 0.025,
    shape: "conical",
    shapeParameter: 0,
    children: [],
  };
  const body: BodyTube = {
    id: "b",
    name: "body",
    kind: "bodytube",
    placement: { method: "after", offset: 0 },
    outerRadius: 0.025,
    thickness: 0.001,
    length: 0.6,
    children: [],
  };
  return {
    name: "cone",
    stages: [{ name: "s", components: [nose, body] }],
    configurations: [],
    referenceType: "maximum",
  };
}

describe("barrowman", () => {
  it("a cone nose has CNα = 2 and CP at 2/3 of its length", () => {
    const rocket = coneRocket();
    const st = barrowman(rocket);
    expect(st.cnAlpha).toBeCloseTo(2, 2);
    // Cone CP from tip = 2/3·L (body tubes add no normal force).
    expect(st.cp).toBeCloseTo((2 / 3) * 0.2, 2);
  });

  it("adding a fin set moves the CP aft and raises CNα", () => {
    const rocket = coneRocket();
    const fins: TrapezoidFinSet = {
      id: "f",
      name: "fins",
      kind: "trapezoidfinset",
      placement: { method: "bottom", offset: 0 },
      finCount: 3,
      rootChord: 0.1,
      tipChord: 0.05,
      height: 0.05,
      sweepLength: 0.05,
      thickness: 0.003,
      children: [],
    };
    rocket.stages[0].components[1].children.push(fins);
    const st = barrowman(rocket);
    expect(st.cnAlpha).toBeGreaterThan(2);
    expect(st.cp).toBeGreaterThan(0.4); // well aft of the nose
  });
});

describe("dragCoefficient", () => {
  it("produces a sane subsonic Cd₀ and flags transonic", () => {
    const geom = aeroGeometry(coneRocket());
    const atm = new Atmosphere().sample(0);
    const sub = dragCoefficient(geom, atm, 100, false);
    expect(sub.cd).toBeGreaterThan(0.2);
    expect(sub.cd).toBeLessThan(1.2);
    expect(sub.extrapolated).toBe(false);
    const trans = dragCoefficient(geom, atm, 340, false);
    expect(trans.extrapolated).toBe(true);
  });

  it("base drag is suppressed while boosting", () => {
    const geom = aeroGeometry(coneRocket());
    const atm = new Atmosphere().sample(0);
    const coasting = dragCoefficient(geom, atm, 80, false);
    const boosting = dragCoefficient(geom, atm, 80, true);
    expect(boosting.base).toBeLessThan(coasting.base);
  });
});

describe("skinFriction", () => {
  it("decreases with Reynolds number in the turbulent regime", () => {
    const a = skinFriction(1e6, 1e-6, 1, 0);
    const b = skinFriction(1e7, 1e-6, 1, 0);
    expect(b).toBeLessThan(a);
    expect(a).toBeGreaterThan(0);
  });

  it("stays strictly positive across the full Mach range (never negative supersonic)", () => {
    // Regression: the compressibility correction must not drive friction negative — a naive
    // (1 − 0.1·M²) factor went negative past ~Mach 3.16.
    for (const M of [0, 0.5, 1, 2, 3.2, 4, 5]) {
      const cf = skinFriction(5e6, 20e-6, 0.9, M);
      expect(cf).toBeGreaterThan(0);
      expect(Number.isFinite(cf)).toBe(true);
    }
  });

  it("total Cd stays positive and finite from subsonic through supersonic", () => {
    const geom = aeroGeometry(coneRocket());
    const atm = new Atmosphere().sample(3000);
    for (const M of [0.3, 0.8, 1.5, 2.5, 3.2, 4, 5]) {
      const cd = dragCoefficient(geom, atm, M * atm.speedOfSound, false).cd;
      expect(cd).toBeGreaterThan(0);
      expect(Number.isFinite(cd)).toBe(true);
    }
  });
});
