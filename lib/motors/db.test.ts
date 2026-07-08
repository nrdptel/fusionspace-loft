import { describe, it, expect } from "vitest";
import { allMotors, resolveMotor, coreDesignation, normalize } from "./db";

describe("motor database", () => {
  it("parses the bundled catalog", () => {
    const motors = allMotors();
    expect(motors.length).toBeGreaterThanOrEqual(18);
    for (const m of motors) {
      expect(m.curve.totalImpulse).toBeGreaterThan(0);
      expect(m.curve.samples.length).toBeGreaterThan(2);
    }
  });

  it("covers the common low/mid-power motors (so real model-rocket files resolve)", () => {
    for (const d of ["A8", "B4", "B6", "C6", "C11", "D12", "E9", "E12"]) {
      expect(resolveMotor({ designation: d })).not.toBeNull();
    }
  });

  it("matches an Estes designation despite the abbreviated .eng manufacturer code", () => {
    // RASP .eng files write "E" for Estes; OpenRocket designs say "Estes". A manufacturer
    // string difference must not veto an otherwise-exact designation match.
    const a8 = resolveMotor({ manufacturer: "Estes", designation: "A8" });
    expect(a8?.entry.curve.designation).toBe("A8");
    const c6 = resolveMotor({ manufacturer: "Estes", designation: "C6" });
    expect(c6?.entry.curve.designation).toMatch(/C6/);
  });

  it("resolves an exact designation + manufacturer", () => {
    const m = resolveMotor({ manufacturer: "AeroTech", designation: "H128W" });
    expect(m?.quality).toBe("exact");
    expect(m?.entry.curve.designation).toBe("H128W");
  });

  it("resolves the fixture's K550W", () => {
    const m = resolveMotor({ manufacturer: "AeroTech", designation: "K550W" });
    expect(m?.entry.curve.designation).toBe("K550W");
  });

  it("falls back to a class-and-thrust core match for a Cesaroni common name", () => {
    // Cesaroni file designation is "J293BS"; a design may reference just "J293".
    const m = resolveMotor({ manufacturer: "Cesaroni", designation: "J293" });
    expect(m).not.toBeNull();
    expect(coreDesignation(m!.entry.curve.designation)).toBe("J293");
  });

  it("returns null when nothing matches", () => {
    expect(resolveMotor({ designation: "Z9999XX" })).toBeNull();
  });

  it("normalizes and extracts cores", () => {
    expect(normalize("K550-W")).toBe("K550W");
    expect(coreDesignation("838J293-13A")).toBe("J293");
    expect(coreDesignation("K550W")).toBe("K550");
  });
});
