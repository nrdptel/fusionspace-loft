import { describe, it, expect } from "vitest";
import { newDesign } from "./starter";
import { runFlight } from "../sim/run";
import { structurePointMasses } from "../sim/mass";

describe("newDesign — from-scratch starter", () => {
  it("produces a document shaped like an importer's, with a default config and no stored sims", () => {
    const doc = newDesign();
    expect(doc.rocket.stages).toHaveLength(1);
    expect(doc.rocket.configurations).toHaveLength(1);
    expect(doc.rocket.defaultConfigId).toBe(doc.rocket.configurations[0].id);
    expect(doc.simulations).toEqual([]);
    expect(doc.flownAsReduced).toBe(false);
    // No stored source, so the results view shows no format label and no misleading tool comparison.
    expect(doc.formatVersion).toBe("unknown");
  });

  it("resolves its motor from the bundled database and flies with propulsion", () => {
    const doc = newDesign();
    const run = runFlight(doc.rocket, { configId: doc.rocket.defaultConfigId });
    expect(run.hasPropulsion).toBe(true);
    expect(run.resolutions[0].match).not.toBeNull();
  });

  it("is stable and sensible out of the box — a real flight to tweak, not a blank slate", () => {
    const doc = newDesign();
    const run = runFlight(doc.rocket, { configId: doc.rocket.defaultConfigId });
    const s = run.result.summary;
    // Healthy static margin (a beginner design should not fly marginal or wildly over-stable).
    expect(run.result.staticMarginCal).toBeGreaterThan(1.0);
    expect(run.result.staticMarginCal).toBeLessThan(2.5);
    // A real, subsonic, safe flight: clears the rail, stays in the validated drag envelope, lands soft.
    expect(s.apogee).toBeGreaterThan(100);
    expect(s.railExitVelocity).toBeGreaterThan(15);
    expect(s.maxMach).toBeLessThan(0.8);
    expect(s.thrustToWeight).toBeGreaterThan(5);
    expect(s.descentRate).toBeLessThan(8);
    // A plausible small-HPR dry mass, and nothing flagged.
    const dry = structurePointMasses(doc.rocket).reduce((a, m) => a + m.mass, 0);
    expect(dry).toBeGreaterThan(0.3);
    expect(dry).toBeLessThan(1.5);
    expect(run.result.warnings ?? []).toHaveLength(0);
  });
});
