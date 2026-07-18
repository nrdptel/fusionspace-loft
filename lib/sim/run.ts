/** Orchestration the UI calls: pick a motor configuration, assemble conditions (optionally
 *  from a stored simulation so a comparison is apples-to-apples, or from live weather), run
 *  the flight, and optionally validate against the design's stored OpenRocket results. */

import type { Rocket, MotorConfiguration } from "../model/types";
import type { OrkDocument, StoredSimulation } from "../ork/adapt";
import { flattenRocket } from "../model/geometry";
import { applyGeometryEdits, hasGeometryEdits, type GeometryEdits } from "../model/edit";
import type { PointMass } from "./mass";
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
  /** Override the boost/coast integration step (s). Defaults to the solver's own step; used by
   *  convergence checks that need to vary it. */
  timeStep?: number;
  /** "What-if" ballast added to the nose (kg): extra weight the flyer is considering to trim
   *  stability or apogee. Modelled as a point mass at the nose cone, so it shifts the CG forward
   *  and the whole vehicle heavier. 0/undefined leaves the design unchanged. */
  ballastKg?: number;
  /** "What-if" motor swap: fly the design on a different motor than the one it carries. Replaces
   *  the motor in every instance of the flown configuration (a cluster keeps its count), so the
   *  flyer can compare motors without editing the file. Undefined flies the design's own motor. */
  motorSwap?: { manufacturer?: string; designation: string; diameter?: number };
  /** Builder edits: fly the design with resized geometry (fin span, nose/body length). Rebuilds the
   *  vehicle before flight, so mass, aerodynamics (centre of pressure, stability), and drag all
   *  reflect the change. Undefined/empty flies the design's own geometry. */
  geometry?: GeometryEdits;
  /** Scale every motor's thrust (and total impulse) — a motor's lot-to-lot impulse tolerance.
   *  Defaults to 1 (the design's rated curve); used by the Monte-Carlo dispersion. */
  thrustScale?: number;
  /** Scale the airframe's dry structural mass — build-to-build mass variation. Defaults to 1;
   *  used by the Monte-Carlo dispersion. */
  massScale?: number;
}

/** Apply a what-if motor swap to a configuration: every instance flies the chosen motor, keeping
 *  its mount, cluster count, ignition timing, and (for recovery) ejection delay. */
function swapMotor(config: MotorConfiguration, swap: NonNullable<RunOptions["motorSwap"]>): MotorConfiguration {
  return {
    ...config,
    instances: config.instances.map((i) => ({
      ...i,
      motor: {
        ...i.motor,
        manufacturer: swap.manufacturer,
        designation: swap.designation,
        diameter: swap.diameter ?? i.motor.diameter,
      },
    })),
  };
}

/** Where nose ballast sits: inside the frontmost nose cone (its mid-length), or the very front of
 *  the airframe if the design somehow has no nose. Returns the station from the nose tip (m). */
export function noseBallastStation(rocket: Rocket): number {
  const nose = flattenRocket(rocket).find((p) => p.component.kind === "nosecone");
  return nose ? nose.xFore + nose.length / 2 : 0;
}

/** Run a flight for a canonical rocket. */
export function runFlight(rocket: Rocket, opts: RunOptions = {}): FlightRun {
  // Builder geometry edits (resized fins, nose, or body) rebuild the model before anything else, so
  // mass, aerodynamics, and the flight all see the edited design.
  const design = opts.geometry && hasGeometryEdits(opts.geometry) ? applyGeometryEdits(rocket, opts.geometry) : rocket;
  const picked = pickConfig(design, opts.configId);
  if (!picked) {
    throw new Error("This design has no motor configuration to simulate.");
  }
  const config = opts.motorSwap ? swapMotor(picked, opts.motorSwap) : picked;
  let conditions = makeConditions(opts.overrides);
  if (opts.ballistic) {
    conditions = { ...conditions, windSpeed: 0, windTo: 0, windProfile: undefined };
  }
  const built = buildSimulateInput(design, config, conditions);
  const resolutions = built.resolutions;
  // A ballistic run drops every recovery device so the coast runs to the true apogee.
  const extraMasses: PointMass[] =
    opts.ballastKg && opts.ballastKg > 0
      ? [{ mass: opts.ballastKg, cg: noseBallastStation(design), ownInertia: 0, source: "Nose ballast" }]
      : [];
  const withExtras = extraMasses.length ? { ...built.input, extraMasses } : built.input;
  const scaled =
    (opts.thrustScale !== undefined && opts.thrustScale !== 1) ||
    (opts.massScale !== undefined && opts.massScale !== 1)
      ? {
          ...withExtras,
          ...(opts.thrustScale !== undefined && opts.thrustScale !== 1 ? { thrustScale: opts.thrustScale } : {}),
          ...(opts.massScale !== undefined && opts.massScale !== 1 ? { massScale: opts.massScale } : {}),
        }
      : withExtras;
  const base = opts.timeStep ? { ...scaled, timeStep: opts.timeStep } : scaled;
  const input = opts.ballistic ? { ...base, recovery: [] } : base;
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
