/** Wire a canonical `Rocket` + motor configuration + launch conditions into a `SimulateInput`.
 *  This resolves each referenced motor to a real thrust curve (bundled DB), places it on the
 *  axis, builds the recovery devices, and reports how well each motor matched so the UI can
 *  be honest about a fuzzy or failed resolution. Format-agnostic: it takes a `Rocket`, not a
 *  `.ork`. */

import type {
  Rocket,
  MotorConfiguration,
  Parachute,
  Streamer,
  RocketComponent,
} from "../model/types";
import { flattenRocket, type Positioned } from "../model/geometry";
import { resolveMotor, type MotorMatch } from "../motors/db";
import { Atmosphere } from "./atmosphere";
import { degToRad } from "../units";
import type {
  ResolvedMotor,
  RecoveryDeviceSim,
  LaunchConditions,
  SimulateInput,
  StagePhase,
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
  /** The staging timeline (one entry for single-stage). Fed to the simulator. */
  phases: StagePhase[];
}

/** Map each component id to the index of the stage that contains it (list order, nose→tail). */
function stageOfComponent(rocket: Rocket): Map<string, number> {
  const out = new Map<string, number>();
  rocket.stages.forEach((stage, i) => {
    const walk = (comps: RocketComponent[]): void => {
      for (const c of comps) {
        out.set(c.id, i);
        if (c.children.length) walk(c.children);
      }
    };
    walk(stage.components);
  });
  return out;
}

/** Resolve and place the motors of a configuration, work out the staging sequence, and build
 *  recovery devices. Serial staging: the bottom-most stage (last in list order) lights at
 *  launch; each stage above air-starts when the stage below burns out (plus its ignition delay)
 *  and the spent stage separates and drops away at that instant. The final (top) stage flies on
 *  to apogee. A single-stage design is the degenerate case — one phase, nothing separates. */
export function buildRocketDynamics(rocket: Rocket, config: MotorConfiguration): Buildup {
  const flat = flattenRocket(rocket);
  const byId = new Map<string, Positioned>();
  for (const p of flat) byId.set(p.component.id, p);
  const stageOf = stageOfComponent(rocket);
  const nStages = Math.max(1, rocket.stages.length);

  // First pass: resolve each motor, place it, and note which stage it belongs to. Accumulate,
  // per stage, the longest motor burn time and the stage's ignition delay.
  interface Placed {
    curve: ResolvedMotor["curve"];
    cg: number;
    count: number;
    ejectionDelay: number;
    stageIndex: number;
  }
  const placed: Placed[] = [];
  const resolutions: MotorResolution[] = [];
  const stageBurnTime = new Array(nStages).fill(0);
  const stageIgnitionDelay = new Array(nStages).fill(0);

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
    const stageIndex = stageOf.get(inst.mountId) ?? 0;
    const mountAft = mount ? mount.xFore + mount.length : 0;
    const overhang = mm?.overhang ?? 0;
    const motorLen = inst.motor.length || match.entry.curve.lengthMm / 1000;
    const cg = mountAft + overhang - motorLen / 2;
    const ejectionDelay = Number.isFinite(inst.motor.delay ?? NaN) ? (inst.motor.delay as number) : NaN;
    placed.push({ curve: match.entry.curve, cg, count, ejectionDelay, stageIndex });
    stageBurnTime[stageIndex] = Math.max(stageBurnTime[stageIndex], match.entry.curve.burnTime);
    stageIgnitionDelay[stageIndex] = inst.ignitionDelay ?? 0;
  }

  // Stage ignition times (firing order: the bottom stage — last in list order — lights first).
  // Each stage above ignites when the stage below burns out, plus its own ignition delay.
  const ignT = new Array(nStages).fill(0);
  ignT[nStages - 1] = stageIgnitionDelay[nStages - 1];
  for (let i = nStages - 2; i >= 0; i--) {
    ignT[i] = ignT[i + 1] + stageBurnTime[i + 1] + stageIgnitionDelay[i];
  }
  // A stage separates and drops away at its own burnout; the final (top) stage never does.
  const detachT = new Array(nStages).fill(Infinity);
  for (let i = 1; i < nStages; i++) detachT[i] = ignT[i] + stageBurnTime[i];

  const motors: ResolvedMotor[] = [];
  for (const p of placed) {
    const ignitionTime = ignT[p.stageIndex];
    const resolved: ResolvedMotor = {
      curve: p.curve,
      cg: p.cg,
      ignitionTime,
      detachTime: detachT[p.stageIndex],
      ejectionTime: Number.isFinite(p.ejectionDelay)
        ? ignitionTime + p.curve.burnTime + p.ejectionDelay
        : undefined,
    };
    for (let i = 0; i < p.count; i++) motors.push(resolved);
  }

  // Phases: the stack starts whole; each separation (in time order) drops the current bottom
  // stage, so the attached count steps N → N-1 → … → 1.
  const phases: StagePhase[] = [{ startTime: 0, stageCount: nStages }];
  const seps = detachT.filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  let count = nStages;
  for (const t of seps) {
    count -= 1;
    phases.push({ startTime: t, stageCount: count });
  }

  // Recovery devices ride with the final (top) stage, which is the vehicle whose descent is
  // tracked to the ground; a separated booster's own descent isn't simulated.
  const recovery: RecoveryDeviceSim[] = [];
  for (const p of flat) {
    if ((stageOf.get(p.component.id) ?? 0) !== 0) continue;
    const c = p.component;
    if (c.kind === "parachute") recovery.push(parachuteDevice(c, config.id));
    else if (c.kind === "streamer") recovery.push(streamerDevice(c, config.id));
  }

  return { motors, recovery, resolutions, phases };
}

/** The deployment setting in force for the flown configuration: a per-config override wins over
 *  the device's default event (a design can drogue-at-apogee in one config, deploy-at-altitude
 *  in another). */
function effectiveDeploy(
  c: Parachute | Streamer,
  configId: string,
): { event: Parachute["deployEvent"]; altitude?: number; delay: number } {
  const o = c.deployConfigs?.[configId];
  return {
    event: o ? o.event : c.deployEvent,
    altitude: o ? o.altitude : c.deployAltitude,
    delay: o ? o.delay : c.deployDelay ?? 0,
  };
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

function parachuteDevice(c: Parachute, configId: string): RecoveryDeviceSim {
  const area = c.area ?? Math.PI * (c.diameter / 2) * (c.diameter / 2);
  const d = effectiveDeploy(c, configId);
  return {
    name: c.name || "Parachute",
    cdA: c.cd * area,
    event: mapEvent(d.event),
    deployAltitude: d.altitude,
    deployDelay: d.delay,
  };
}

function streamerDevice(c: Streamer, configId: string): RecoveryDeviceSim {
  const area = c.stripLength * c.stripWidth;
  const d = effectiveDeploy(c, configId);
  return {
    name: c.name || "Streamer",
    cdA: c.cd * area,
    event: mapEvent(d.event),
    deployAltitude: d.altitude,
    deployDelay: d.delay,
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
  const { motors, recovery, resolutions, phases } = buildRocketDynamics(rocket, config);
  return {
    input: { rocket, config, motors, recovery, conditions, phases },
    resolutions,
  };
}
