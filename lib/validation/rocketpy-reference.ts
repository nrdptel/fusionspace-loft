/** The committed RocketPy cross-check reference and how to re-fly its designs in Loft.
 *
 *  RocketPy is an independent, open-source 6-DOF engine that can't run in the browser or CI, so its
 *  results for the bundled demo designs are computed offline (see scripts/rocketpy/) and committed
 *  in fixtures/rocketpy-cross-check.json. This module loads that reference and re-flies each design
 *  in Loft the same way RocketPy did — ballistically — so the Validation page and the drift-guard
 *  test share one definition of "the reference" and one way to reproduce it. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importOrk } from "../ork/import";
import { runFlight, configChoices, overridesFromStored, type FlightRun } from "../sim/run";

export interface RocketpyDesign {
  key: string;
  config: string;
  name: string;
  apogee: number;
  maxVelocity: number;
  maxMach: number;
  timeToApogee: number;
  railExitVelocity: number;
  staticMargin: number;
  /** Terminal landing speed (m/s) RocketPy reaches under an equivalent canopy carrying the design's
   *  landing drag area, wind zeroed. Present only for designs that carry recovery. */
  landingSpeed?: number;
  /** Kinetic energy at that landing (J): ½·m·v² from RocketPy's own descent mass. Present only for
   *  designs that carry recovery. */
  landingEnergy?: number;
}

export interface RocketpyReference {
  engine: string;
  engineVersion: string;
  method: string;
  designs: RocketpyDesign[];
}

/** Load the committed reference (fixtures/rocketpy-cross-check.json). Read at build time (the
 *  Validation page) and at test time; never at runtime in the browser. */
export function loadRocketpyReference(): RocketpyReference {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "fixtures", "rocketpy-cross-check.json"), "utf-8"),
  );
}

/** Resolve a reference design's fixture, motor configuration, and stored conditions. Throws —
 *  rather than silently flying a different configuration — if that config no longer exists, so a
 *  stale reference fails loudly at build/test instead of showing wrong numbers. */
async function resolveReference(d: RocketpyDesign) {
  const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), "fixtures", `${d.key}.ork`)));
  const doc = await importOrk(bytes);
  const choice = configChoices(doc).find((c) => c.motors.some((m) => m.includes(d.config)));
  if (!choice) {
    throw new Error(
      `RocketPy reference names configuration "${d.config}" for ${d.key}, but the fixture has no ` +
        "such motor configuration — regenerate fixtures/rocketpy-cross-check.json (scripts/rocketpy).",
    );
  }
  const sim = doc.simulations[choice.simIndex];
  return { doc, sim };
}

/** Fly a reference design in Loft exactly as RocketPy flew its ascent: ballistic (recovery stripped,
 *  wind zeroed), under the fixture's stored conditions, in the configuration the reference names. */
export async function flyReferenceDesign(d: RocketpyDesign): Promise<FlightRun> {
  const { doc, sim } = await resolveReference(d);
  return runFlight(doc.rocket, {
    configId: sim.conditions.configId,
    overrides: overridesFromStored(sim),
    ballistic: true,
  });
}

/** Fly a reference design's descent the way RocketPy flew it: recovery ON (it settles to terminal
 *  under its canopy) but wind zeroed (so the impact speed is the vertical terminal, matching
 *  RocketPy's zero-wind descent under the same landing Cd·A). The summary's `groundHitVelocity` and
 *  `landingEnergy` are Loft's landing metrics for the descent cross-check. Only meaningful for a
 *  design that carries recovery (`d.landingSpeed !== undefined`). */
export async function flyReferenceRecovery(d: RocketpyDesign): Promise<FlightRun> {
  const { doc, sim } = await resolveReference(d);
  return runFlight(doc.rocket, {
    configId: sim.conditions.configId,
    overrides: { ...overridesFromStored(sim), windSpeed: 0 },
  });
}
