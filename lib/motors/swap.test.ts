import { describe, it, expect } from "vitest";
import { designMotorIdentity } from "./swap";
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
