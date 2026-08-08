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

  it("flies a flight that goes somewhere, instead of a vertical line", () => {
    // **R11's pinning check.** The owner reported the scratch build's plot as "just a vertical line
    // meaning it does not go downrange at all", and it was: `defaultConditions()` shipped
    // `windSpeed: 0` alongside a plumb rail, and in a 3-DOF solver with no weathercocking those are
    // the only two sources of horizontal motion. Every one of the 506 trajectory samples carried
    // x = 0 EXACTLY, so the path was drawn on top of its own axis.
    //
    // This asserts the OUTCOME rather than the constant, so it survives someone tuning the number:
    // a from-scratch design must produce a trajectory with real horizontal extent. It fails the
    // moment the default returns to zero, and the distinct-x check is what makes it fail for the
    // right reason — a degenerate path has exactly one distinct x, whatever its length.
    const doc = newDesign();
    const run = runFlight(doc.rocket, { configId: doc.rocket.defaultConfigId });
    const s = run.result.summary;
    const xs = new Set(run.result.trajectory.map((p) => p.x));

    expect(xs.size, "every trajectory sample shares one downrange value — the plot is a vertical line").toBeGreaterThan(10);
    expect(s.driftDistance, "a from-scratch design lands where it launched").toBeGreaterThan(1);
    // Sane rather than dramatic: this is a light wind on a small rocket, not a storm. The bracket is
    // wide because it is guarding the sign of the thing, not calibrating it.
    expect(s.driftDistance).toBeLessThan(2000);

    // And the rail stays plumb — the drift is WIND, not a lean nobody asked for. 85 of the corpus's
    // 91 stored simulations set rod angle to zero, so inventing one would misrepresent real practice.
    // Removing the wind is what proves it: if a lean were supplying any of the drift, the flight
    // below would still go somewhere. (This line replaced `expect(run.config).toBeTruthy()`, which
    // `runFlight` makes unconditionally true — a no-op sitting under a comment claiming a check.)
    const zeroWind = runFlight(doc.rocket, { configId: doc.rocket.defaultConfigId, overrides: { windSpeed: 0 } });
    expect(
      zeroWind.result.summary.driftDistance,
      "with the wind removed the drift must vanish, or something other than wind is moving it",
    ).toBeCloseTo(0, 6);
  });
});
