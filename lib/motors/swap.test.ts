import { describe, it, expect } from "vitest";
import { designMotorIdentity, swapStillOffered,
  bakeMotorSwap,
} from "./swap";
import { resolveMotor, allMotors } from "./db";

describe("designMotorIdentity", () => {
  it("keeps the casing the design file stated, and never lets the catalog overrule it", () => {
    // An OpenRocket file records the casing itself. Even where the catalog would say otherwise, the
    // file is the design's own statement about the motor it flies.
    const id = designMotorIdentity({ designation: "C11", manufacturer: "Estes", diameter: 0.024 });
    expect(id.casingMm).toBe(24);

    const disagreeing = designMotorIdentity({ designation: "J420R", manufacturer: "Aerotech", diameter: 0.054 });
    expect(disagreeing.casingMm).toBe(54);
    // …and the catalog genuinely disagrees, so this is a real precedence test, not a tautology.
    expect(Math.round(resolveMotor({ designation: "J420R" })!.entry.curve.diameterMm)).toBe(38);
  });

  it("fills a silent casing from the catalog, at the size the motor actually is", () => {
    // RockSim and RASAero state no casing, so their adapters leave it 0. Assert WHICH casing comes
    // back, not merely that one does: a wrong number here offers motors that do not fit.
    expect(designMotorIdentity({ designation: "J420R", manufacturer: "Aerotech", diameter: 0 }).casingMm).toBe(38);
    expect(designMotorIdentity({ designation: "L1940X", manufacturer: "Aerotech" }).casingMm).toBe(75);
    expect(designMotorIdentity({ designation: "N1000W", manufacturer: "AT" }).casingMm).toBe(98);
    expect(designMotorIdentity({ designation: "C6", manufacturer: "Estes" }).casingMm).toBe(18);
  });

  it("offers the motor the design already flies, so its own motor is in its own list", () => {
    // The list means "motors of the casing this rocket demonstrably takes". If the design's own
    // motor were not in it, the claim would be about something other than what is flying.
    for (const designation of ["J420R", "L1940X", "N1000W", "C6"]) {
      const { casingMm } = designMotorIdentity({ designation });
      const sameCasing = allMotors().filter((m) => Math.round(m.curve.diameterMm) === casingMm);
      expect(sameCasing.some((m) => m.designation === designation), `${designation} absent from its own ${casingMm} mm list`).toBe(true);
    }
  });

  it("says nothing rather than guess when the motor is not matched exactly", () => {
    // A bare two-way substring counts as a "designation" match in `resolveMotor`, so this name finds
    // an 18 mm Estes A8. Seeding a casing from that would claim a fit built on a spelling accident.
    const loose = resolveMotor({ designation: "H225-14A-8" });
    expect(loose).not.toBeNull();
    expect(loose!.quality).not.toBe("exact");
    expect(designMotorIdentity({ designation: "H225-14A-8" }).casingMm).toBe(0);
    expect(designMotorIdentity({ designation: "H225-14A-8" }).manufacturer).toBeUndefined();

    // RASAero's "1/4A2" is in the corpus and resolves to nothing at all.
    expect(designMotorIdentity({ designation: "1/4A2", manufacturer: "AP" }).casingMm).toBe(0);
    // No designation at all — the swap surfaces have nothing to be about.
    expect(designMotorIdentity({ diameter: 0 }).casingMm).toBe(0);
  });

  it("names the manufacturer only on an exact match, so one C6 can be told from another", () => {
    // The catalog carries an Estes C6 and a Quest C6 at the same 18 mm. Marking the design's row in
    // the sweep by designation alone badges both.
    const c6s = allMotors().filter((m) => m.designation === "C6" && Math.round(m.curve.diameterMm) === 18);
    expect(c6s.length).toBeGreaterThan(1);

    // Pin WHICH maker comes back, not merely that it is one of them — comparing the answer to
    // itself would pass just as well with the two swapped. The name comes back as the CATALOG
    // spells it, so it compares equal to a swap option's manufacturer ("Estes Industries", not the
    // design file's "Estes").
    const estes = designMotorIdentity({ designation: "C6", manufacturer: "Estes" });
    expect(estes.manufacturer).toBe("Estes Industries");
    expect(c6s.some((m) => (m.manufacturer ?? m.curve.manufacturer ?? "") === estes.manufacturer)).toBe(true);

    // And the mirror case resolves to the OTHER one, so the manufacturer is genuinely being read.
    const quest = designMotorIdentity({ designation: "C6", manufacturer: "Quest" });
    expect(quest.manufacturer).toBe("Quest Aerospace");
    expect(quest.manufacturer).not.toBe(estes.manufacturer);
    expect(quest.casingMm).toBe(estes.casingMm);

    expect(designMotorIdentity({ designation: "1/4A2" }).manufacturer).toBeUndefined();
  });
});

describe("swapStillOffered", () => {
  const opts = [
    { designation: "H283ST-15A", manufacturer: "AeroTech", diameter: 0.038, motorClass: "H" },
    { designation: "H148R", manufacturer: "AeroTech", diameter: 0.038, motorClass: "H" },
  ];

  it("keeps a swap the new configuration still offers", () => {
    expect(swapStillOffered({ manufacturer: "AeroTech", designation: "H148R" }, opts)).toBe(true);
  });

  it("drops a swap the new configuration cannot take", () => {
    // The case that mattered: a 38 mm choice carried onto a 24 mm configuration, where every number
    // on the pad-check surface then described a motor that configuration cannot hold.
    expect(swapStillOffered({ manufacturer: "Estes Industries", designation: "E12" }, opts)).toBe(false);
    // ...including when the new configuration offers nothing at all.
    expect(swapStillOffered({ manufacturer: "AeroTech", designation: "H148R" }, [])).toBe(false);
  });

  it("tells two makers' same-designation motors apart", () => {
    // The same trap the sweep's DESIGN badge hit: a bare designation match cannot tell an Estes C6
    // from a Quest C6, and here it would keep a swap the new casing does not actually offer.
    expect(swapStillOffered({ manufacturer: "Estes Industries", designation: "H148R" }, opts)).toBe(false);
  });

  it("drops a swap that names no maker, because the picker cannot show one either", () => {
    // Tempting to match on designation alone. The picker cannot: its value is
    // `${manufacturer ?? ""}|${designation}` against options spelled `${o.manufacturer}|${o.
    // designation}`, so a manufacturer-less swap composes to "|H148R", matches no option and renders
    // blank. Keeping it would preserve exactly the state this function exists to end — a motor being
    // flown with the only control that names it showing nothing — this time on purpose. Reachable:
    // a restored session blob is unvalidated JSON, so a stored edit can arrive without a maker.
    expect(swapStillOffered({ designation: "H148R" }, opts)).toBe(false);
    expect(swapStillOffered({ designation: "E12" }, opts)).toBe(false);
  });

  it("has nothing to drop when no swap is set", () => {
    expect(swapStillOffered(undefined, opts)).toBe(true);
    expect(swapStillOffered(undefined, [])).toBe(true);
  });
});


describe("designMotorIdentity — does this design fly at all?", () => {
  it("says whether the design flies, so the copy does not claim a flight there is not", () => {
    // The offered list is described as "the casing it already flies". On a design whose motor was
    // never matched that sentence is asserted on the same page as "there is no thrust to fly" —
    // measured on `e2e/fixtures/unresolved-motor.ork`, where both were on screen at once.
    expect(designMotorIdentity({ designation: "C11", manufacturer: "Estes", diameter: 0.024 }).resolves).toBe(true);

    expect(designMotorIdentity({ designation: "Z9999-CUSTOM", diameter: 0.029 }).resolves).toBe(false);
    expect(designMotorIdentity({ diameter: 0.029 }).resolves).toBe(false);
    // ...and that design still gets a casing, from the file. The two signals are independent: the
    // 29 mm came from the file's own stated diameter, not from a motor anyone matched.
    expect(designMotorIdentity({ designation: "Z9999-CUSTOM", diameter: 0.029 }).casingMm).toBe(29);
  });

  it("counts a LOOSE match as flying, because that is what the simulator flies", () => {
    // "Does this design fly?" and "is the casing safe to infer?" are different questions. A bare
    // two-way substring counts as a designation match in `resolveMotor`, which is not good enough to
    // seed a fit claim from — but it IS what `runFlight` burns.
    const loose = designMotorIdentity({ designation: "H225-14A-8" });
    expect(loose.resolves).toBe(true);
    expect(loose.casingMm).toBe(0);
  });
});

describe("baking a motor swap into the design", () => {
  const rocket = () => ({
    configurations: [
      { id: "a", instances: [{ mountId: "m1", motor: { designation: "H128W", manufacturer: "AeroTech", type: "reload" as const, diameter: 0.038, length: 0.2 } }] },
      { id: "b", instances: [{ mountId: "m1", motor: { designation: "H128W", manufacturer: "AeroTech", type: "reload" as const, diameter: 0.038, length: 0.2 } }] },
    ],
  });

  // Before this existed, "Download .ork" wrote the design's own motor whatever the flyer had picked.
  // Measured on the starter across all 15 swaps the picker offers: 7 put the saved file more than
  // 100% away from the screen, worst an E16 reading 67.6 m on screen while the file flew 993.6 m.
  it("writes the picked motor into every configuration", () => {
    const out = bakeMotorSwap(rocket(), { manufacturer: "Estes", designation: "E16", diameter: 0.024 });
    for (const c of out.configurations) {
      expect(c.instances[0].motor.designation).toBe("E16");
      expect(c.instances[0].motor.manufacturer).toBe("Estes");
      expect(c.instances[0].motor.diameter).toBe(0.024);
    }
  });

  // A design can carry several configurations, and a motor written into one of them is the same
  // silent divergence in a smaller window — the flyer switches config and the file disagrees again.
  it("leaves no configuration on the design's own motor", () => {
    const out = bakeMotorSwap(rocket(), { designation: "E16" });
    expect(out.configurations.map((c) => c.instances[0].motor.designation)).toEqual(["E16", "E16"]);
  });

  it("keeps the fields the swap does not state", () => {
    const out = bakeMotorSwap(rocket(), { designation: "E16" });
    expect(out.configurations[0].instances[0].motor.manufacturer).toBe("AeroTech");
    expect(out.configurations[0].instances[0].motor.diameter).toBe(0.038);
    expect(out.configurations[0].instances[0].motor.length).toBe(0.2);
    expect(out.configurations[0].instances[0].mountId).toBe("m1");
  });

  it("returns the design untouched when nothing was swapped", () => {
    const r = rocket();
    expect(bakeMotorSwap(r, undefined)).toBe(r);
  });
});
