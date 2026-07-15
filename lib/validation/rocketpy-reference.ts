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
  staticMargin: number;
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

/** Fly a reference design in Loft exactly as RocketPy flew it: ballistic (recovery stripped, wind
 *  zeroed), under the fixture's stored conditions, in the configuration the reference names.
 *  Throws — rather than silently flying a different configuration — if that config no longer
 *  exists, so a stale reference fails loudly at build/test instead of showing wrong numbers. */
export async function flyReferenceDesign(d: RocketpyDesign): Promise<FlightRun> {
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
  return runFlight(doc.rocket, {
    configId: sim.conditions.configId,
    overrides: overridesFromStored(sim),
    ballistic: true,
  });
}
