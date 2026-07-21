/** Drift guard for the RocketPy cross-check shown on the Validation page.
 *
 *  RocketPy (an independent, open-source 6-DOF engine) can't run in the browser or in CI, so its
 *  numbers for the bundled demo designs are computed offline and committed in
 *  fixtures/rocketpy-cross-check.json (see scripts/rocketpy/). This test flies the same designs in
 *  Loft — *ballistically*, exactly as RocketPy flew them — and asserts they still agree.
 *
 *  If it fails after a change to the drag, mass, motor, or integration code, that means Loft has
 *  drifted from the committed independent reference: regenerate the reference (scripts/rocketpy)
 *  and commit it. That is the intended workflow — the same discipline the limitations log follows,
 *  where a calculation change updates its validation artifact in the same change — and it keeps the
 *  figures the Validation page shows honest and current.
 */

import { describe, it, expect } from "vitest";
import { loadRocketpyReference, flyReferenceDesign, flyReferenceRecovery } from "./rocketpy-reference";

const ref = loadRocketpyReference();

describe("RocketPy cross-check (drift guard)", () => {
  it("is the RocketPy reference over the bundled demo designs", () => {
    expect(ref.engine).toBe("RocketPy");
    expect(ref.designs.length).toBeGreaterThanOrEqual(3);
  });

  for (const d of ref.designs) {
    // The gap is ~0.6% at most in practice; these bands are wide enough to tolerate small
    // integrator/drag evolution but catch a real regression in the flight mechanics.
    it(`${d.key} (${d.config}) agrees with RocketPy`, async () => {
      const run = await flyReferenceDesign(d);
      const s = run.result.summary;
      const near = (loft: number, rp: number, rel: number, label: string) =>
        expect(
          Math.abs(loft - rp) / Math.abs(rp),
          `${d.key} ${label}: Loft ${loft.toFixed(2)} vs RocketPy ${rp} — regenerate the reference (scripts/rocketpy) if this is an intended change`,
        ).toBeLessThanOrEqual(rel);
      near(s.apogee, d.apogee, 0.03, "apogee"); // integrator + mass + CP, drag held equal
      near(s.maxVelocity, d.maxVelocity, 0.02, "max velocity");
      near(s.maxMach, d.maxMach, 0.03, "max Mach");
      near(s.timeToApogee, d.timeToApogee, 0.03, "time to apogee");
      // Off-the-rail velocity — a safety number, resolved at the exact rod-length crossing. Both
      // engines fly the full rail length, so this pins the rail-phase integration.
      near(s.railExitVelocity, d.railExitVelocity, 0.03, "rail-exit velocity");
      // RocketPy's independent Barrowman CP vs ours, within a fraction of a caliber.
      expect(Math.abs(run.result.staticMarginCal - d.staticMargin)).toBeLessThanOrEqual(0.25);
    });

    // Descent cross-check (designs with recovery): Loft's terminal landing speed and energy against
    // RocketPy's, both flown to the ground under the same landing Cd·A with wind zeroed. Holds the
    // drag area equal, so this catches a regression in the descent integrator or the burnout mass.
    if (d.landingSpeed !== undefined) {
      it(`${d.key} (${d.config}) agrees with RocketPy on landing`, async () => {
        const run = await flyReferenceRecovery(d);
        const s = run.result.summary;
        const near = (loft: number, rp: number, rel: number, label: string) =>
          expect(
            Math.abs(loft - rp) / Math.abs(rp),
            `${d.key} ${label}: Loft ${loft.toFixed(2)} vs RocketPy ${rp} — regenerate the reference (scripts/rocketpy) if this is an intended change`,
          ).toBeLessThanOrEqual(rel);
        // Landing speed is a safety-relevant number; the two engines agree to ~0.1% in practice, so
        // a 3% band tolerates small integrator/mass evolution but catches a real descent regression.
        near(s.groundHitVelocity, d.landingSpeed!, 0.03, "landing speed");
        near(s.landingEnergy, d.landingEnergy!, 0.05, "landing energy");
      });
    }
  }
});
