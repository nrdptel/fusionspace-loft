import { describe, it, expect } from "vitest";
import { allMotors, resolveMotor, sameCasing, coreDesignation, normalize } from "./db";

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
      expect(m, d).not.toBeNull();
      // Exact where the catalogued designation IS that string. Some of these are catalogued under
      // a more specific certified name than the one a design writes — AeroTech's H100W curve is
      // the H100W_DMS, a different product line from the RMS reload — so those resolve at
      // "designation" quality, which the UI flags as approximate. That is the honest answer, not
      // a miss: the name a design uses is a substring of the certified one.
      expect(["exact", "designation"], `${d} quality`).toContain(m!.quality);
      expect(m!.entry.names.some((n) => n.toUpperCase().includes(d.toUpperCase())), `${d} names`).toBe(true);
      // The resolved curve is in the right impulse class. Read the class from the class-and-thrust
      // core, not the first character — a certified name can carry a product-line prefix
      // ("HP-L1000W"), where the leading letter is not the impulse class.
      expect(coreDesignation(m!.entry.designation)[0], `${d} class`).toBe(d[0]);
      expect(m!.entry.curve.totalImpulse).toBeGreaterThan(0);
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
    // But the same designation with the right (or unknown) manufacturer still resolves.
    expect(resolveMotor({ manufacturer: "AeroTech", designation: "K550" })?.entry.curve.designation).toBe("K550W");
    expect(resolveMotor({ designation: "K550" })?.entry.curve.designation).toBe("K550W");
    // Nor does an EXACT designation cross makers. Bare class-and-thrust names are not unique
    // across manufacturers, so "Cesaroni K550W" resolving to AeroTech's would be the same silent
    // wrong-motor substitution, just with a longer string.
    expect(resolveMotor({ manufacturer: "Cesaroni", designation: "K550W" })).toBeNull();
    // A trading-name difference is not a maker difference, though.
    expect(resolveMotor({ manufacturer: "Apogee Components", designation: "C10" })?.quality).toBe("exact");
    expect(resolveMotor({ manufacturer: "Apogee", designation: "C10" })?.quality).toBe("exact");
    expect(resolveMotor({ manufacturer: "Estes Industries", designation: "A8" })?.quality).toBe("exact");
  });

  it("normalizes and extracts cores", () => {
    expect(normalize("K550-W")).toBe("K550W");
    expect(coreDesignation("838J293-13A")).toBe("J293");
    expect(coreDesignation("K550W")).toBe("K550");
  });
});

describe("catalogued identity beats the RASP header's abbreviation", () => {
  it("resolves AeroTech E30T, whose curve header says only \"E30\" from maker \"A\"", () => {
    // The bundled AeroTech_E30T.eng header reads `E30 24 70 4-7 .0178 .047 A`: an abbreviated
    // designation and a single-letter maker code. Matching against that left a real design file
    // (a Punisher Apprentice from the .ork corpus) with no resolvable motor and so no flight at
    // all. ThrustCurve.org's record — E30T, AeroTech — is the catalogued identity instead.
    const m = resolveMotor({ manufacturer: "AeroTech", designation: "E30T" });
    expect(m?.quality).toBe("exact");
    expect(m?.entry.designation).toBe("E30T");
    expect(m?.entry.manufacturer).toBe("AeroTech");
  });

  it("resolves AeroTech G80T exactly, not by a loose class-and-thrust core", () => {
    // Header designation is "G80NBT"; the certification designation is G80T.
    const m = resolveMotor({ manufacturer: "AeroTech", designation: "G80T" });
    expect(m?.quality).toBe("exact");
    expect(m?.entry.designation).toBe("G80T");
  });

  it("still falls back to the header when the provenance records no designation", () => {
    // Every bundled entry ends up with a designation one way or the other.
    for (const e of allMotors()) expect(e.designation.length).toBeGreaterThan(0);
  });
});

describe("a motor is matched on every name it is published under", () => {
  it("resolves a Cesaroni reload written by its common name, not its part number", () => {
    // OpenRocket files reference "J285"; ThrustCurve's designation for that motor is the part
    // number "648J285-15A". Matching only the part number left the design unresolved.
    const m = resolveMotor({ manufacturer: "Cesaroni Technology", designation: "J285" });
    expect(m?.quality).toBe("exact");
    expect(m?.entry.designation).toBe("648J285-15A");
    expect(m?.entry.names).toContain("J285");
    expect(m!.entry.curve.diameterMm).toBeCloseTo(38, 0);
  });

  it("resolves a design's fuller Cesaroni string against the part number", () => {
    const m = resolveMotor({ manufacturer: "Cesaroni Technology", designation: "411-I175-WH-14A" });
    expect(m?.entry.designation).toBe("411I175-14A");
    expect(m!.entry.curve.diameterMm).toBeCloseTo(38, 0);
  });

  it("keeps a loose name match from crossing manufacturers", () => {
    // "C10" is an Apogee 18 mm motor here; asking Estes for one must not hand back Apogee's —
    // and Estes makes no C10, so the honest answer is "not found".
    expect(resolveMotor({ manufacturer: "Estes", designation: "C10" })).toBeNull();
    // Quest's C12 and Estes' C11 are likewise their own makers' motors, not each other's.
    expect(resolveMotor({ manufacturer: "Estes", designation: "C12" })).toBeNull();
    expect(resolveMotor({ manufacturer: "Quest", designation: "C11" })).toBeNull();
  });

  it("bundles the motors the real-design corpus asks for", () => {
    // Each of these came from an in-the-wild .ork or .rkt that previously flew with no propulsion
    // at all. Diameters are asserted so a future re-fetch can't quietly swap in a same-name motor
    // of a different size.
    const cases: [string, string, number][] = [
      ["AeroTech", "L1940X", 75],
      ["AeroTech", "N1000W", 98],
      ["AeroTech", "G74W", 29],
      ["AeroTech", "HP-H135W", 29],
      ["Cesaroni Technology", "J420-CL", 38],
      ["Cesaroni Technology", "2546K300-P", 54],
      ["Quest", "C12", 18],
      ["Quest", "F41W", 24],
      ["Apogee", "C10", 18],
      ["Estes", "1/4A3", 13],
      ["Estes", "1/2A3", 13],
      ["Estes", "A3", 13],
      ["Hypertek", "2800CC172L-L540", 75],
    ];
    for (const [manufacturer, designation, dia] of cases) {
      const m = resolveMotor({ manufacturer, designation });
      expect(m, `${manufacturer} ${designation}`).not.toBeNull();
      expect(m!.entry.curve.diameterMm, `${designation} diameter`).toBeCloseTo(dia, 0);
    }
  });

  it("keeps every bundled curve inside its own impulse class", () => {
    // A curve fetched under the wrong name shows up here: a "J" carrying an I's impulse, say.
    const MAX: Record<string, number> = {
      A: 2.5, B: 5, C: 10, D: 20, E: 40, F: 80, G: 160, H: 320,
      I: 640, J: 1280, K: 2560, L: 5120, M: 10240, N: 20480,
    };
    for (const e of allMotors()) {
      const m = (e.source.commonName ?? e.designation).match(/^(\d)\/(\d)?([A-Z])|^([A-Z])/);
      const cls = m?.[3] ?? m?.[4];
      const frac = m?.[1] && m?.[2] ? Number(m[1]) / Number(m[2]) : 1;
      if (!cls || !MAX[cls]) continue;
      const hi = MAX[cls] * frac;
      expect(e.curve.totalImpulse, `${e.designation} impulse`).toBeGreaterThan(hi / 2 * 0.9);
      expect(e.curve.totalImpulse, `${e.designation} impulse`).toBeLessThan(hi * 1.05);
    }
  });
});


describe("the catalogued envelope comes from the certification record", () => {
  it("uses the certified diameter and length, not the RASP header's", () => {
    // A header's envelope is the curve author's typing and is sometimes wrong: the bundled AMW
    // L1100 curve's header claims 75 mm for a motor certified at 54 mm. That is not bookkeeping —
    // the motor-swap list filters candidates by mount diameter and the design diagram draws the
    // casing, so a mis-stated diameter offers the motor for the wrong mount.
    const m = resolveMotor({ manufacturer: "Animal Motor Works", designation: "L1100" });
    expect(m).not.toBeNull();
    expect(m!.entry.curve.diameterMm).toBe(54);
  });

  it("gives every bundled motor a plausible casing envelope", () => {
    // Hobby motor casings run 13 mm (Estes T-series) to 98 mm; anything outside that is a data
    // error, not a motor.
    for (const e of allMotors()) {
      expect(e.curve.diameterMm, `${e.designation} diameter`).toBeGreaterThanOrEqual(13);
      expect(e.curve.diameterMm, `${e.designation} diameter`).toBeLessThanOrEqual(98);
      expect(e.curve.lengthMm, `${e.designation} length`).toBeGreaterThan(20);
      expect(e.curve.lengthMm, `${e.designation} length`).toBeLessThan(2000);
    }
  });

  it("resolves AeroTech F67C to its own curve, not the F67W", () => {
    // A design asking for the F67C used to fall through to a class-and-thrust core match on the
    // F67W — a different propellant with 28% less impulse in a 29 mm shorter casing — and flew a
    // real design 29.6% low against its own stored results.
    const c = resolveMotor({ manufacturer: "AeroTech", designation: "F67C" });
    const w = resolveMotor({ manufacturer: "AeroTech", designation: "F67W" });
    expect(c?.quality).toBe("exact");
    expect(w?.quality).toBe("exact");
    expect(c!.entry.designation).toBe("F67C");
    expect(w!.entry.designation).toBe("F67W");
    expect(c!.entry.curve.totalImpulse).toBeGreaterThan(w!.entry.curve.totalImpulse * 1.15);
    expect(c!.entry.curve.lengthMm).toBeGreaterThan(w!.entry.curve.lengthMm);
  });

  it("reads the two-letter maker code RASAero actually writes for Quest", () => {
    // A short code that misses the alias table is not a maker Loft has never heard of — it is a
    // maker that DISAGREES, and a disagreeing manufacturer vetoes the match at every quality.
    // `sameMaker` will not prefix-match under three characters, on purpose, so "qu" could reach
    // "quest" by no other route: the design simply had no motor, and so no flight. RASAero writes
    // this code — `Show-off.CDX1` in the corpus carries "A6Q  (QU)".
    const quest = allMotors().filter((m) => /quest/i.test(m.manufacturer ?? ""));
    expect(quest.length, "bundled Quest motors to resolve against").toBeGreaterThan(0);
    for (const code of ["QU", "Q", "Quest", "QUEST"]) {
      const r = resolveMotor({ manufacturer: code, designation: quest[0].designation });
      expect(r?.quality, `manufacturer "${code}"`).toBe("exact");
      expect(r!.entry.designation, `manufacturer "${code}"`).toBe(quest[0].designation);
    }
  });
  it("refuses a substitute that could not go in the tube, and still flies the design's own motor", () => {
    // **A substitution Loft chose has to FIT.** A cold walk of the built export found a design whose
    // designation is `H999ZZ` on a 29 mm mount resolving to `H999N` — a 38 mm motor — on a bare
    // two-way substring test, after which the app reported apogee 1,471 m, Mach 1.04 and
    // thrust-to-weight 162:1 off a motor that cannot be loaded. The only cue was "· approx".
    const loose = resolveMotor({ manufacturer: "AeroTech", designation: "H999ZZ" });
    expect(loose?.quality, "the loose match this exists to veto no longer reproduces").toBe("designation");
    expect(Math.round(loose!.entry.curve.diameterMm), "H999N is the 38 mm motor in question").toBe(38);

    // Stating the casing the design actually has vetoes it, and there is no smaller lie to fall back
    // on: withheld beats plausible, and the app's unmatched path already explains itself.
    expect(
      resolveMotor({ manufacturer: "AeroTech", designation: "H999ZZ", diameter: 0.029 }),
      "a 38 mm motor was accepted for a 29 mm mount — the Sev-1 this exists to stop",
    ).toBeNull();
    // A 38 mm mount is entitled to that same motor.
    const fits = resolveMotor({ manufacturer: "AeroTech", designation: "H999ZZ", diameter: 0.038 });
    expect(fits?.entry.designation, "a 38 mm mount was refused its own 38 mm motor").toBe(loose!.entry.designation);

    // **The design's OWN motor is never vetoed**, even against a disagreeing stated casing — an exact
    // designation is not something Loft chose, and dropping it would withhold a flight Loft can fly.
    const exact = resolveMotor({ manufacturer: "AeroTech", designation: "H128W", diameter: 0.075 });
    expect(exact?.quality, "an exact match was vetoed — a design\u2019s own motor must never be").toBe("exact");
    expect(exact!.entry.designation).toBe("H128W");
    // And a file that states no casing is unaffected — RockSim's figure is the mount's bore and
    // RASAero's is the nozzle, so there is nothing to check against and nothing is withheld.
    expect(resolveMotor({ manufacturer: "AeroTech", designation: "H999ZZ", diameter: 0 })?.quality).toBe("designation");
  });
  it("treats the catalogue's 75 and 76 mm motors as one casing, and 18 and 20 as two", () => {
    // The band `sameCasing` allows is not taste — it is read off the bundled catalogue, and getting
    // it wrong breaks the veto in the OPPOSITE direction by withholding a legitimate flight. The
    // casings present are 13, 18, 20, 24, 29, 38, 54, 75, 76 and 98 mm.
    const casings = [...new Set(allMotors().map((m) => Math.round(m.curve.diameterMm)))].sort((a, b) => a - b);
    expect(casings).toEqual([13, 18, 20, 24, 29, 38, 54, 75, 76, 98]);
    // 3 inches is 76.2 mm, so the same physical class is certified at both figures — 7 motors at the
    // nominal 75 and 2 at the measured 76. Rounded equality would have split them.
    expect(sameCasing(75, 76)).toBe(true);
    expect(sameCasing(76, 75)).toBe(true);
    // 18 mm and 20 mm really are different mounts (Estes' and Quest's), 2 mm apart, and must not
    // merge — which is why the band is a percentage rather than a flat millimetre or two.
    expect(sameCasing(18, 20)).toBe(false);
    // Every other neighbouring pair in the catalogue is 5 mm or more apart, so none of them is close.
    for (let i = 1; i < casings.length; i++) {
      const [a, b] = [casings[i - 1], casings[i]];
      expect(sameCasing(a, b), `${a} vs ${b}`).toBe(b - a <= 1);
    }
    // A silence on either side is not a disagreement — a file that states no casing is unaffected.
    expect(sameCasing(0, 38)).toBe(true);
    expect(sameCasing(38, 0)).toBe(true);
  });

  it("has no designation core spanning two casings, which is why the veto needs the FILE's figure", () => {
    // The measurement that says what the veto is actually for. A loose match lands via the
    // class-and-thrust core, and no core in the catalogue is made in two sizes — so the veto can
    // never be adjudicating between two bundled candidates. It is always adjudicating between the
    // casing the DESIGN FILE states and the casing the near-miss motor really is, which is exactly
    // the reported defect: a 29 mm design reaching the 38 mm H999N.
    const byCore = new Map<string, Set<number>>();
    for (const m of allMotors()) {
      const d = Math.round(m.curve.diameterMm);
      if (!byCore.has(m.core)) byCore.set(m.core, new Set());
      byCore.get(m.core)!.add(d);
    }
    const spanning = [...byCore.entries()].filter(([, ds]) => ds.size > 1).map(([c]) => c);
    expect(byCore.size, "cores to check").toBeGreaterThan(50);
    expect(spanning, "a core in two casings would need the veto to choose between bundled motors").toEqual([]);
  });
  it("only ever withholds — it never quietly promotes a different motor into the slot", () => {
    // The header claims "where the veto leaves nothing, the answer is null". The worry it has to
    // answer is the opposite failure: with the best candidate filtered out, a LOWER-quality but
    // fitting entry could win the ranking and be flown instead — a second silent substitution
    // installed by the fix for the first.
    //
    // Driven over the whole catalogue rather than argued: every bundled designation, perturbed three
    // ways so it can only match loosely, asked at each of the eight casing classes.
    let same = 0;
    let withheld = 0;
    const promoted: string[] = [];
    for (const m of allMotors()) {
      for (const suffix of ["ZZ", "X", "-99"]) {
        const near = `${m.designation}${suffix}`;
        const blind = resolveMotor({ designation: near, manufacturer: m.manufacturer });
        if (!blind) continue;
        for (const casing of [13, 18, 24, 29, 38, 54, 75, 98]) {
          const fitted = resolveMotor({ designation: near, manufacturer: m.manufacturer, diameter: casing / 1000 });
          if (!fitted) withheld++;
          else if (fitted.entry.designation === blind.entry.designation) same++;
          else promoted.push(`${near} at ${casing} mm: ${blind.entry.designation} -> ${fitted.entry.designation}`);
        }
      }
    }
    expect(same + withheld, "the probe matched nothing — it proves nothing").toBeGreaterThan(1000);
    expect(withheld, "no case was withheld, so the veto never fired in this probe").toBeGreaterThan(100);
    expect(promoted, "the veto promoted a different motor instead of withholding").toEqual([]);
  });
});
