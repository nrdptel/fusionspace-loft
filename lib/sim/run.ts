/** Orchestration the UI calls: pick a motor configuration, assemble conditions (optionally
 *  from a stored simulation so a comparison is apples-to-apples, or from live weather), run
 *  the flight, and optionally validate against the design's stored OpenRocket results. */

import type { Rocket, MotorConfiguration } from "../model/types";
import type { OrkDocument, StoredSimulation } from "../ork/adapt";
import { simulate, type FlightResult } from "./simulate";
import { buildSimulateInput, makeConditions, type MotorResolution, type ConditionOverrides } from "./setup";
import { Atmosphere, atmosphereForGround } from "./atmosphere";
import { compareToStored, type ValidationReport } from "../validation/compare";

export interface FlightRun {
  result: FlightResult;
  config: MotorConfiguration;
  resolutions: MotorResolution[];
  validation?: ValidationReport;
}

export function pickConfig(rocket: Rocket, configId?: string): MotorConfiguration | undefined {
  if (configId) {
    const c = rocket.configurations.find((cfg) => cfg.id === configId);
    if (c) return c;
  }
  if (rocket.defaultConfigId) {
    const c = rocket.configurations.find((cfg) => cfg.id === rocket.defaultConfigId);
    if (c) return c;
  }
  return rocket.configurations.find((c) => c.instances.length > 0) ?? rocket.configurations[0];
}

/** Build condition overrides from a stored simulation's launch conditions, so Loft flies the
 *  design under the same setup OpenRocket used. */
export function overridesFromStored(sim: StoredSimulation): ConditionOverrides {
  const c = sim.conditions;
  let atmosphere: Atmosphere | undefined;
  if (c.baseTempK && c.basePressurePa && c.launchAltitude !== undefined) {
    atmosphere = atmosphereForGround(c.launchAltitude, c.baseTempK, c.basePressurePa);
  }
  return {
    rodLength: c.rodLength,
    rodAngleDeg: c.rodAngleDeg,
    rodAzimuthDeg: c.rodDirectionDeg,
    windSpeed: c.windSpeed,
    launchAltitude: c.launchAltitude,
    atmosphere,
  };
}

export interface RunOptions {
  configId?: string;
  overrides?: ConditionOverrides;
  /** If provided, validate against this stored simulation's results. */
  validateAgainst?: StoredSimulation;
}

/** Run a flight for a canonical rocket. */
export function runFlight(rocket: Rocket, opts: RunOptions = {}): FlightRun {
  const config = pickConfig(rocket, opts.configId);
  if (!config) {
    throw new Error("This design has no motor configuration to simulate.");
  }
  const conditions = makeConditions(opts.overrides);
  const { input, resolutions } = buildSimulateInput(rocket, config, conditions);
  const result = simulate(input);
  const validation =
    opts.validateAgainst && opts.validateAgainst.hasResults
      ? compareToStored(result.summary, opts.validateAgainst.results)
      : undefined;
  return { result, config, resolutions, validation };
}

/** Run straight from an imported document: pick the config that matches the first stored
 *  sim (or the default), fly under the stored conditions, and validate. */
export function runFromDocument(doc: OrkDocument, opts: RunOptions = {}): FlightRun {
  const firstSim = doc.simulations[0];
  const overrides = opts.overrides ?? (firstSim ? overridesFromStored(firstSim) : undefined);
  return runFlight(doc.rocket, {
    configId: opts.configId ?? firstSim?.conditions.configId,
    overrides,
    validateAgainst: opts.validateAgainst ?? firstSim,
  });
}
