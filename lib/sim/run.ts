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
  /** True if at least one motor resolved to a real thrust curve. When false the flight has no
   *  propulsion, so its numbers are meaningless and callers should withhold them rather than
   *  present a zero-altitude "flight". */
  hasPropulsion: boolean;
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
  /** Fly to the true *ballistic* apogee: strip recovery and zero the wind. The rocket coasts
   *  unimpeded to the top instead of having its climb capped by an early ejection, and the
   *  vertical apogee isn't nudged by a crosswind. Used by the RocketPy cross-check so an
   *  independent engine (which flies ballistic to apogee) is compared like-for-like; not for
   *  ordinary flights, whose recovery and wind are part of the real trajectory. */
  ballistic?: boolean;
}

/** Run a flight for a canonical rocket. */
export function runFlight(rocket: Rocket, opts: RunOptions = {}): FlightRun {
  const config = pickConfig(rocket, opts.configId);
  if (!config) {
    throw new Error("This design has no motor configuration to simulate.");
  }
  let conditions = makeConditions(opts.overrides);
  if (opts.ballistic) {
    conditions = { ...conditions, windSpeed: 0, windTo: 0, windProfile: undefined };
  }
  const built = buildSimulateInput(rocket, config, conditions);
  const resolutions = built.resolutions;
  // A ballistic run drops every recovery device so the coast runs to the true apogee.
  const input = opts.ballistic ? { ...built.input, recovery: [] } : built.input;
  const result = simulate(input);
  // Optimum ejection delay must reflect the true (ballistic) apogee — a stable property of the
  // rocket, motor, and launch conditions, not the delay actually flown. When a too-short delay
  // opens the canopy before apogee, the primary run's coast is cut short, so its apogee time (and
  // the optimum delay derived from it) reads low — which would recommend an even shorter delay,
  // compounding the mistake. Recompute it from a recovery-free coast under the same conditions.
  if (!opts.ballistic && result.deployedBeforeApogee && built.input.recovery.length > 0) {
    const freeCoast = simulate({ ...built.input, recovery: [] });
    result.summary.optimumDelay = freeCoast.summary.optimumDelay;
  }
  const hasPropulsion = resolutions.some((r) => r.match !== null);
  // A no-thrust run "flies" to zero apogee; comparing that to stored results yields a
  // meaningless −100%, so skip validation entirely unless the flight actually had propulsion.
  // A ballistic run flew a different (recovery-stripped) trajectory than the stored one describes,
  // so its stored comparison would be misleading — skip it there too.
  const validation =
    !opts.ballistic && hasPropulsion && opts.validateAgainst && opts.validateAgainst.hasResults
      ? compareToStored(result.summary, opts.validateAgainst.results)
      : undefined;
  return { result, config, resolutions, hasPropulsion, validation };
}

/** A stored simulation offered as a selectable flight configuration in the UI. */
export interface ConfigChoice {
  /** Index into `doc.simulations`. */
  simIndex: number;
  /** Unique motor designations for this configuration, e.g. ["H128W"] or ["K550W", "I211W"]. */
  motors: string[];
  /** OpenRocket's stored apogee (m AGL) for this simulation, if it carries results. */
  storedApogeeM?: number;
  /** The simulation's name (e.g. "H128W", "Simulation 3 - too short delay"). */
  name: string;
}

/** The design's stored simulations as selectable configurations, each labelled by its motor(s)
 *  and OpenRocket's stored apogee. A design with two or more lets the UI offer a picker; with
 *  one (or none) there is nothing to choose. Order matches `doc.simulations`. */
export function configChoices(doc: OrkDocument): ConfigChoice[] {
  return doc.simulations.map((sim, simIndex) => {
    const cfg = doc.rocket.configurations.find((c) => c.id === sim.conditions.configId);
    const motors = cfg
      ? [...new Set(cfg.instances.map((i) => i.motor.designation).filter(Boolean))]
      : [];
    const apo = sim.results.maxAltitude;
    return {
      simIndex,
      motors,
      storedApogeeM: sim.hasResults && Number.isFinite(apo) ? apo : undefined,
      name: sim.name,
    };
  });
}

/** Run straight from an imported document: pick the config that matches the first stored
 *  sim (or the default), fly under the stored conditions, and validate. */
export function runFromDocument(doc: OrkDocument, opts: RunOptions = {}): FlightRun {
  const firstSim = doc.simulations[0];
  const overrides = opts.overrides ?? (firstSim ? overridesFromStored(firstSim) : undefined);
  // When Loft flew a simplified vehicle (staging/pods/parallel/cluster dropped), the stored
  // results describe a different flight, so an accuracy comparison would be misleading — skip it.
  const validateAgainst = opts.validateAgainst ?? (doc.flownAsReduced ? undefined : firstSim);
  return runFlight(doc.rocket, {
    configId: opts.configId ?? firstSim?.conditions.configId,
    overrides,
    validateAgainst,
  });
}
