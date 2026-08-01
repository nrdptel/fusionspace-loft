import { describe, it, expect } from "vitest";
import { noStoredResultsReason, storedCaveat, storedTag } from "./stored-status";

describe("noStoredResultsReason", () => {
  it("says nothing when the file carries no simulations to explain", () => {
    // A from-scratch build has none, and "this design carries 0 simulations" is not a sentence
    // worth showing someone who never imported a file.
    expect(noStoredResultsReason([], "OpenRocket")).toBeNull();
  });

  it("passes on what the file says when every stored run is marked external", () => {
    // The shape all three bundled samples have: a simulation holding conditions and nothing else.
    const msg = noStoredResultsReason(["external"], "OpenRocket")!;
    expect(msg).toContain("a simulation that holds its launch setup and no results");
    expect(msg).toContain("not OpenRocket's own simulator output");
    // It has to name the way back, or it is only an apology.
    expect(msg).toContain("run the RocketPy cross-check below");
  });

  it("counts them, and reads as a sentence at more than one", () => {
    const msg = noStoredResultsReason(["external", "external"], "OpenRocket")!;
    expect(msg).toContain("2 simulations that hold their launch setup and no results");
  });

  it("prefers the tool's own 'not run' marker over the external wording when they are mixed", () => {
    const msg = noStoredResultsReason(["external", "notsimulated"], "OpenRocket")!;
    expect(msg).toContain("which OpenRocket marks as not run");
    expect(msg).not.toContain("simulator output");
  });

  it("says the plain thing when the file marks nothing at all", () => {
    const msg = noStoredResultsReason([undefined], "RockSim")!;
    expect(msg).toContain("a simulation that holds its launch setup and no results,");
    expect(msg).toContain("RockSim");
    expect(msg).not.toContain("marks as not run");
  });

  it("never names a tool it wasn't given", () => {
    // `sourceTool` falls back to "the design file" for a source Loft cannot name; the sentence has
    // to survive that rather than inventing OpenRocket.
    const msg = noStoredResultsReason(["external"], "the design file")!;
    expect(msg).toContain("the design file");
    expect(msg).not.toMatch(/OpenRocket|RockSim|RASAero/);
  });
});

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
