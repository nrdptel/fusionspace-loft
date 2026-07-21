import { describe, it, expect } from "vitest";
import { motorLayout } from "./setup";
import { pickConfig } from "./run";
import { newDesign } from "../model/starter";
import { overallLength } from "../model/geometry";

describe("motorLayout", () => {
  it("places the resolved motor casing inside the airframe", () => {
    const doc = newDesign();
    const config = pickConfig(doc.rocket, doc.rocket.defaultConfigId)!;
    const marks = motorLayout(doc.rocket, config);
    expect(marks).toHaveLength(1);
    const m = marks[0];
    expect(m.x1).toBeGreaterThan(m.x0); // a real fore→aft extent
    expect(m.radius).toBeGreaterThan(0);
    expect(m.designation).toBeTruthy();
    // The casing sits on the airframe, aft of the nose, within the overall length.
    const L = overallLength(doc.rocket);
    expect(m.x0).toBeGreaterThan(0);
    expect(m.x1).toBeLessThanOrEqual(L + 0.05); // a little overhang past the aft end is allowed
    // The casing fits inside the body tube it mounts in.
    expect(m.radius).toBeLessThanOrEqual(0.05);
  });

  it("returns nothing for a configuration with no motors", () => {
    const doc = newDesign();
    const config = { id: "empty", instances: [] };
    expect(motorLayout(doc.rocket, config)).toEqual([]);
  });
});
