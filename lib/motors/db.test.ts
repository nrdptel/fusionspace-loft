import { describe, it, expect } from "vitest";
import { allMotors, resolveMotor, coreDesignation, normalize } from "./db";

describe("motor database", () => {
  it("parses the bundled catalog", () => {
    const motors = allMotors();
    expect(motors.length).toBeGreaterThanOrEqual(54);
    for (const m of motors) {
      expect(m.curve.totalImpulse).toBeGreaterThan(0);
      expect(m.curve.samples.length).toBeGreaterThan(2);
    }
  });

  it("covers common mid/high-power Cesaroni and Loki reloads (J–M)", () => {
    const cases: Array<[string, string]> = [
      ["K261", "Cesaroni"], ["K530", "Cesaroni"], ["L730", "Cesaroni"],
      ["L1350", "Cesaroni"], ["M1670", "Cesaroni"], ["M2245", "Cesaroni"], ["M3400", "Cesaroni"],
      ["J528", "Loki"], ["K627", "Loki"], ["L1400", "Loki"], ["M1882", "Loki"], ["M2550", "Loki"],
    ];
    for (const [designation, manufacturer] of cases) {
      const m = resolveMotor({ manufacturer, designation });
      expect(m).not.toBeNull();
      // The resolved curve is in the right impulse class (letter matches).
      expect(coreDesignation(m!.entry.curve.designation)[0]).toBe(designation[0]);
      expect(m!.entry.curve.totalImpulse).toBeGreaterThan(0);
    }
  });

  it("covers the common low/mid-power motors (so real model-rocket files resolve)", () => {
    for (const d of ["A8", "B4", "B6", "C6", "C11", "D12", "E9", "E12"]) {
      expect(resolveMotor({ designation: d })).not.toBeNull();
    }
  });

  it("covers the common AeroTech F–I motors real HPR files reference", () => {
    // These are the motors the OpenRocket example designs used that Loft previously couldn't
    // resolve, so those files flew to nothing. Each must now resolve to its exact curve.
    for (const d of ["F50T", "G40W", "H148R", "H669N", "I115W", "I211W"]) {
      const m = resolveMotor({ manufacturer: "AeroTech", designation: d });
      expect(m?.quality).toBe("exact");
      expect(m?.entry.curve.designation).toBe(d);
      expect(m?.entry.curve.totalImpulse).toBeGreaterThan(0);
    }
  });

  it("covers the AeroTech H–L workhorse single-use motors", () => {
    // Common composite reloads/single-use across the H–L range that HPR designs reference.
    // AeroTech previously had no L-class curve at all; these fill the mid/high-power span so
    // more imported designs resolve their motor to an exact curve rather than nothing.
    for (const d of ["H100W", "H180W", "I200W", "I284W", "J350W", "J500G", "J800T",
                     "K250W", "K700W", "K1050W", "L952W", "L1000"]) {
      const m = resolveMotor({ manufacturer: "AeroTech", designation: d });
      expect(m?.quality).toBe("exact");
      expect(m?.entry.curve.designation).toBe(d);
      // The resolved curve is in the right impulse class.
      expect(m?.entry.curve.designation[0]).toBe(d[0]);
      expect(m?.entry.curve.totalImpulse).toBeGreaterThan(0);
    }
  });

  it("resolves a Cesaroni common name against a full ThrustCurve designation", () => {
    // Cesaroni curves are stored under their full ThrustCurve designation
    // (e.g. "1266-J760-WT-19A"); a design typically references just "J760". The
    // substring/core match must still find it and land in the right impulse class.
    for (const [designation, core] of [["J760", "J760"], ["I540", "I540"]] as const) {
      const m = resolveMotor({ manufacturer: "Cesaroni", designation });
      expect(m).not.toBeNull();
      expect(coreDesignation(m!.entry.curve.designation)).toBe(core);
      expect(m!.entry.curve.totalImpulse).toBeGreaterThan(0);
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
