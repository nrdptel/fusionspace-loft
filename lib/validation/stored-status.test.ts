import { describe, it, expect } from "vitest";
import { storedCaveat, storedTag } from "./stored-status";

describe("storedCaveat", () => {
  it("says when a stored run predates the design's last edit", () => {
    expect(storedCaveat("outdated", "OpenRocket")).toMatch(/outdated.*before the design was last changed/);
  });

  it("says when the tool doesn't consider the simulation run at all", () => {
    for (const status of ["notsimulated", "loaded"]) {
      expect(storedCaveat(status, "RockSim")).toMatch(/not run/);
      expect(storedCaveat(status, "RockSim")).toContain("RockSim");
    }
  });

  it("stays quiet for a current run, and for a status it doesn't know", () => {
    expect(storedCaveat("uptodate", "OpenRocket")).toBeNull();
    expect(storedCaveat(undefined, "OpenRocket")).toBeNull();
    expect(storedCaveat("somethingnew", "OpenRocket")).toBeNull();
    // `external` changes the panel's heading too, so it is handled there rather than here.
    expect(storedCaveat("external", "OpenRocket")).toBeNull();
  });
});

describe("storedTag", () => {
  it("compresses the caveat to something a select option can carry", () => {
    expect(storedTag("outdated")).toBe("outdated");
    expect(storedTag("notsimulated")).toBe("not run");
    expect(storedTag("loaded")).toBe("not run");
  });

  it("stays quiet exactly where the sentence does", () => {
    // The two must agree on WHEN to speak, or a picker option would carry a tag the panel it leads
    // to never explains, or the reverse.
    for (const status of ["uptodate", "external", "somethingnew", undefined]) {
      expect(storedTag(status) === null).toBe(storedCaveat(status, "OpenRocket") === null);
    }
  });
});
