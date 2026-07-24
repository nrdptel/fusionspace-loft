import { describe, it, expect } from "vitest";
import { allMotors, resolveMotor, coreDesignation, normalize } from "./db";

describe("motor database", () => {
  it("parses the bundled catalog", () => {
    const motors = allMotors();
    expect(motors.length).toBeGreaterThanOrEqual(62);
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

  it("flies the Estes low/mid line on its NAR-certified impulse (guards a mis-sourced curve)", () => {
    // Each bundled Estes curve must integrate to its NAR-certified total impulse (avg thrust ×
    // burn time from ThrustCurve.org). The band is asymmetric — a sparse RASP curve integrates a
    // few percent UNDER the published figure, so >2% OVER means the wrong data file, not sampling.
    // This is the guard that catches a mis-sourced curve: the bundled B4 was once an over-energetic
    // simfile (5.02 N·s — over the 5.0 N·s B-class ceiling, ~+17%), which flew "A simple model
    // rocket" ~26% high until it was replaced with the certified 4.30 N·s curve.
    const cases: Array<[string, string, number]> = [
      ["A8", "A", 2.321],
      ["B4", "B", 4.295],
      ["B6", "B", 4.326],
      ["C6", "C", 8.816],
      ["C11", "C", 8.797],
      ["D12", "D", 16.846],
      ["E9", "E", 27.872],
      ["E12", "E", 27.255],
    ];
    for (const [designation, cls, certNs] of cases) {
      const m = resolveMotor({ manufacturer: "Estes", designation });
      expect(m, `${designation} should resolve`).not.toBeNull();
      expect(m!.entry.curve.motorClass).toBe(cls);
      // Integrated impulse consistent with the class letter its designation claims (a B ≤ 5.0 N·s).
      expect(m!.entry.curve.totalImpulse, `${designation} impulse vs cert`).toBeGreaterThan(certNs * 0.92);
      expect(m!.entry.curve.totalImpulse, `${designation} impulse vs cert`).toBeLessThan(certNs * 1.02);
    }
  });

  it("covers common mid-power gap-fillers (Estes F15/E16, AeroTech F52/G77, Quest D5)", () => {
    // Common D–G motors real beginner/mid-power files reference, added from authentic ThrustCurve
    // curves. Each resolves in the right impulse class with a curve carrying real total impulse.
    const cases: [string, string, string][] = [
      ["Estes", "F15", "F"],
      ["Estes", "E16", "E"],
      ["AeroTech", "F52T", "F"],
      ["AeroTech", "G77R", "G"],
      ["Quest", "D5", "D"],
    ];
    for (const [manufacturer, designation, cls] of cases) {
      const m = resolveMotor({ manufacturer, designation });
      expect(m, `${designation} should resolve`).not.toBeNull();
      expect(m!.entry.curve.motorClass).toBe(cls);
      expect(m!.entry.curve.totalImpulse).toBeGreaterThan(0);
    }
  });

  it("fills the Cesaroni sub-I gap and AeroTech G64, on their certified impulse", () => {
    // Cesaroni had no bundled motor below I-class, though its Pro38 H/I motors are L1/L2 staples;
    // and the common AeroTech G64 was missing. Each is authentic ThrustCurve data resolving by its
    // (unique) designation, and must integrate to its published certified total impulse — the same
    // guard that caught the mis-sourced Estes B4 and AeroTech H999N curves.
    const cases: [string, string, string, number][] = [
      ["Cesaroni", "H100", "H", 286.4],
      ["Cesaroni", "I212", "I", 364],
      ["AeroTech", "G64", "G", 118.8],
    ];
    for (const [manufacturer, designation, cls, certNs] of cases) {
      const m = resolveMotor({ manufacturer, designation });
      expect(m, `${designation} should resolve`).not.toBeNull();
      expect(m!.entry.curve.motorClass).toBe(cls);
      expect(m!.entry.curve.totalImpulse, `${designation} impulse vs cert`).toBeGreaterThan(certNs * 0.9);
      expect(m!.entry.curve.totalImpulse, `${designation} impulse vs cert`).toBeLessThan(certNs * 1.05);
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

  it("resolves the AeroTech K1275R and M2400T a real RockSim design flies", () => {
    // A real .rkt (a 22 kg dual-deploy) references these two; without them it flew to nothing.
    // Each must resolve to its exact certified curve, and the parsed RASP impulse must land near
    // the ThrustCurve.org certified total impulse (trapezoidal integration of the sampled curve
    // runs a few percent under the published figure).
    const cases: Array<[string, string, number]> = [
      ["K1275R", "K", 2224.9],
      ["M2400T", "M", 7716.5],
    ];
    for (const [designation, cls, certNs] of cases) {
      const m = resolveMotor({ manufacturer: "AeroTech", designation });
      expect(m?.quality).toBe("exact");
      expect(m?.entry.curve.designation).toBe(designation);
      expect(m?.entry.curve.motorClass).toBe(cls);
      expect(m!.entry.curve.totalImpulse).toBeGreaterThan(certNs * 0.92);
      expect(m!.entry.curve.totalImpulse).toBeLessThan(certNs * 1.02);
    }
  });

  it("resolves the AeroTech H242T / J570W / H999N an OpenRocket dual-deploy design flies", () => {
    // OpenRocket's "Dual parachute deployment" example offers these three configs; without the
    // curves each flew to a zero apogee. Impulse must land near the certified value — and where a
    // certified peak thrust is given, the curve's peak must match it too: a curve with the right
    // total impulse but a smoothed peak still under-reports max acceleration. The bundled H999N was
    // once exactly that (a 1027 N peak against a TRA-certified 1710 N, reading max-g ~25% low) until
    // it was swapped for the certification curve.
    const cases: Array<[string, string, number, boolean, number?]> = [
      ["H242T", "H", 231.7, true],
      ["J570W", "J", 973.1, true, 1142.5],
      ["H999N", "H", 319.9, true, 1710],
    ];
    for (const [designation, cls, certNs, exact, certMaxN] of cases) {
      const m = resolveMotor({ manufacturer: "AeroTech", designation });
      expect(m).not.toBeNull();
      if (exact) expect(m?.quality).toBe("exact");
      expect(coreDesignation(m!.entry.curve.designation)[0]).toBe(cls);
      expect(m!.entry.curve.totalImpulse).toBeGreaterThan(certNs * 0.92);
      expect(m!.entry.curve.totalImpulse).toBeLessThan(certNs * 1.08);
      if (certMaxN !== undefined) {
        expect(m!.entry.curve.maxThrust, `${designation} peak thrust`).toBeGreaterThan(certMaxN * 0.9);
        expect(m!.entry.curve.maxThrust, `${designation} peak thrust`).toBeLessThan(certMaxN * 1.1);
      }
    }
  });

  it("resolves the in-the-wild HPR motors real design files reference", () => {
    // The exact manufacturer + designation strings the corpus designs carry, including the
    // propellant suffixes OpenRocket writes (…-CL(I), 644-J94-MY, N3800-BS, N3300, L1100SM).
    // Each must now resolve to its authentic curve in the right impulse class.
    const cases: Array<[string, string, string]> = [
      ["Cesaroni", "I216-CL(I)", "I"],
      ["Cesaroni", "644-J94-MY", "J"],
      ["Cesaroni", "N3800-BS", "N"],
      ["Cesaroni", "N3400-SK", "N"],
      ["AeroTech", "N3300", "N"],
      ["Loki", "K1127LB", "K"],
      ["Loki", "G66-LR", "G"],
      ["Animal Motor Works", "L1100SM", "L"],
      // The two-stage example's second config: a long-burn I59WN booster (whose certified curve is
      // the plugged I59WN-P) and a fast I357T sustainer.
      ["AeroTech", "I59WN", "I"],
      ["AeroTech", "I357T", "I"],
    ];
    for (const [manufacturer, designation, cls] of cases) {
      const m = resolveMotor({ manufacturer, designation });
      expect(m).not.toBeNull();
      expect(coreDesignation(m!.entry.curve.designation)[0]).toBe(cls);
      expect(m!.entry.curve.totalImpulse).toBeGreaterThan(0);
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

  it("does not cross manufacturers on a loose (substring/core) match", () => {
    // Cesaroni makes no "K550"; it must not resolve to AeroTech's K550W just because the
    // string is a substring. Silently flying the wrong maker's motor is false precision — the
    // honest result is "not found". (A genuinely custom motor sharing a class with some other
    // maker's motor stays unresolved for the same reason.)
    expect(resolveMotor({ manufacturer: "Cesaroni", designation: "K550" })).toBeNull();
    expect(resolveMotor({ manufacturer: "Loki", designation: "H128" })).toBeNull();
    // But the same designation with the right (or unknown) manufacturer still resolves, and an
    // exact designation matches regardless of a maker-string difference.
    expect(resolveMotor({ manufacturer: "AeroTech", designation: "K550" })?.entry.curve.designation).toBe("K550W");
    expect(resolveMotor({ designation: "K550" })?.entry.curve.designation).toBe("K550W");
    expect(resolveMotor({ manufacturer: "Cesaroni", designation: "K550W" })?.quality).toBe("exact");
  });

  it("normalizes and extracts cores", () => {
    expect(normalize("K550-W")).toBe("K550W");
    expect(coreDesignation("838J293-13A")).toBe("J293");
    expect(coreDesignation("K550W")).toBe("K550");
  });
});
