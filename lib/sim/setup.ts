/** Wire a canonical `Rocket` + motor configuration + launch conditions into a `SimulateInput`.
 *  This resolves each referenced motor to a real thrust curve (bundled DB), places it on the
 *  axis, builds the recovery devices, and reports how well each motor matched so the UI can
 *  be honest about a fuzzy or failed resolution. Format-agnostic: it takes a `Rocket`, not a
 *  `.ork`. */

import type { Rocket, MotorConfiguration, Parachute, Streamer } from "../model/types";
import { flattenRocket, type Positioned } from "../model/geometry";
import { resolveMotor, type MotorMatch } from "../motors/db";
import { Atmosphere } from "./atmosphere";
import { degToRad } from "../units";
import type {
  ResolvedMotor,
  RecoveryDeviceSim,
  LaunchConditions,
  SimulateInput,
} from "./simulate";

export interface MotorResolution {
  mountId: string;
  designation: string;
  manufacturer?: string;
  match: MotorMatch | null;
  /** How many identical motors this mount flies (a cluster is >1); 1 for a single motor. */
  count: number;
}

export interface Buildup {
  motors: ResolvedMotor[];
  recovery: RecoveryDeviceSim[];
  resolutions: MotorResolution[];
}

/** Resolve and place the motors of a configuration, and build recovery devices. */
export function buildRocketDynamics(rocket: Rocket, config: MotorConfiguration): Buildup {
  const flat = flattenRocket(rocket);
  const byId = new Map<string, Positioned>();
  for (const p of flat) byId.set(p.component.id, p);

  const motors: ResolvedMotor[] = [];
  const resolutions: MotorResolution[] = [];

  for (const inst of config.instances) {
    const match = resolveMotor(inst.motor);
    const mount = byId.get(inst.mountId);
    const mm = mount?.component && "motorMount" in mount.component ? mount.component.motorMount : undefined;
    // A clustered mount flies N identical motors. Modelled as N coaxial motors: N× thrust and
    // N× propellant/casing mass, all at the mount's centreline (radial offset isn't modelled —
    // it doesn't affect the vertical-plane apogee/velocity solve). The clustered tube's own
    // structural mass is scaled by N in lib/sim/mass.ts.
    const count = Math.max(1, Math.round(mm?.clusterCount ?? 1));
    resolutions.push({
      mountId: inst.mountId,
      designation: inst.motor.designation,
      manufacturer: inst.motor.manufacturer,
      match,
      count,
    });
    if (!match) continue;
    const mountAft = mount ? mount.xFore + mount.length : 0;
    const overhang = mm?.overhang ?? 0;
    const motorLen = inst.motor.length || match.entry.curve.lengthMm / 1000;
    const aftX = mountAft + overhang;
    const cg = aftX - motorLen / 2;
    const ignitionTime = inst.ignitionDelay ?? 0;
    const delay = Number.isFinite(inst.motor.delay ?? NaN) ? (inst.motor.delay as number) : NaN;
    const resolved: ResolvedMotor = {
      curve: match.entry.curve,
      cg,
      ignitionTime,
      ejectionTime: Number.isFinite(delay) ? ignitionTime + match.entry.curve.burnTime + delay : undefined,
    };
    for (let i = 0; i < count; i++) motors.push(resolved);
  }

  const recovery: RecoveryDeviceSim[] = [];
  for (const p of flat) {
    const c = p.component;
    if (c.kind === "parachute") recovery.push(parachuteDevice(c));
    else if (c.kind === "streamer") recovery.push(streamerDevice(c));
  }

  return { motors, recovery, resolutions };
}

function mapEvent(e: Parachute["deployEvent"]): RecoveryDeviceSim["event"] {
  switch (e) {
    case "apogee":
      return "apogee";
    case "ejection":
      return "ejection";
    case "altitude":
      return "altitude";
    case "launch":
      return "launch";
    default:
      return "never";
  }
}

function parachuteDevice(c: Parachute): RecoveryDeviceSim {
  const area = c.area ?? Math.PI * (c.diameter / 2) * (c.diameter / 2);
  return {
    name: c.name || "Parachute",
    cdA: c.cd * area,
    event: mapEvent(c.deployEvent),
    deployAltitude: c.deployAltitude,
    deployDelay: c.deployDelay ?? 0,
  };
}

function streamerDevice(c: Streamer): RecoveryDeviceSim {
  const area = c.stripLength * c.stripWidth;
  return {
    name: c.name || "Streamer",
    cdA: c.cd * area,
    event: mapEvent(c.deployEvent),
    deployAltitude: c.deployAltitude,
    deployDelay: c.deployDelay ?? 0,
  };
}

export interface ConditionOverrides {
  rodLength?: number;
  rodAngleDeg?: number;
  rodAzimuthDeg?: number;
  windSpeed?: number;
  windToDeg?: number;
  launchAltitude?: number;
  atmosphere?: Atmosphere;
  windProfile?: LaunchConditions["windProfile"];
}

/** Sensible defaults for launch conditions (standard day, near-vertical 1 m rail, light wind). */
export function defaultConditions(): LaunchConditions {
  return {
    rodLength: 1.0,
    rodAngleFromVertical: 0,
    rodAzimuth: 0,
    windSpeed: 0,
    windTo: 0,
    launchAltitude: 0,
    atmosphere: new Atmosphere(),
  };
}

export function makeConditions(overrides: ConditionOverrides = {}): LaunchConditions {
  const base = defaultConditions();
  return {
    rodLength: overrides.rodLength ?? base.rodLength,
    rodAngleFromVertical: overrides.rodAngleDeg !== undefined ? degToRad(overrides.rodAngleDeg) : base.rodAngleFromVertical,
    rodAzimuth: overrides.rodAzimuthDeg !== undefined ? degToRad(overrides.rodAzimuthDeg) : base.rodAzimuth,
    windSpeed: overrides.windSpeed ?? base.windSpeed,
    windTo: overrides.windToDeg !== undefined ? degToRad(overrides.windToDeg) : base.windTo,
    launchAltitude: overrides.launchAltitude ?? base.launchAltitude,
    atmosphere: overrides.atmosphere ?? base.atmosphere,
    windProfile: overrides.windProfile,
  };
}

/** Assemble a full SimulateInput. */
export function buildSimulateInput(
  rocket: Rocket,
  config: MotorConfiguration,
  conditions: LaunchConditions,
): { input: SimulateInput; resolutions: MotorResolution[] } {
  const { motors, recovery, resolutions } = buildRocketDynamics(rocket, config);
  return {
    input: { rocket, config, motors, recovery, conditions },
    resolutions,
  };
}
