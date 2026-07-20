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
  SeparationEvent,
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

  // First pass: resolve each motor, place it, note its stage and its own ignition delay, and
  // accumulate how long each stage burns from activation to its last motor's burnout.
  interface Placed {
    curve: ResolvedMotor["curve"];
    cg: number;
    count: number;
    ejectionDelay: number;
    /** This motor's ignition delay from its stage becoming active — 0 for a normal motor, or the
     *  airstart delay for a second motor timed to light after liftoff/staging. */
    ignitionDelay: number;
    stageIndex: number;
  }
  const placed: Placed[] = [];
  const resolutions: MotorResolution[] = [];
  // How long each stage takes from becoming active to its LAST motor's burnout: the max over its
  // motors of (that motor's ignition delay + its burn time). A within-stage airstart keeps the
  // stage "burning" until the airstarted motor finishes, which is when a spent lower stage drops.
  const stageBurnDuration = new Array(nStages).fill(0);

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
    const ignitionDelay = Number.isFinite(inst.ignitionDelay ?? NaN) ? (inst.ignitionDelay as number) : 0;
    placed.push({ curve: match.entry.curve, cg, count, ejectionDelay, ignitionDelay, stageIndex });
    stageBurnDuration[stageIndex] = Math.max(stageBurnDuration[stageIndex], ignitionDelay + match.entry.curve.burnTime);
  }

  // Stage activation times (firing order: the bottom stage — last in list order — is active at
  // launch; each stage above becomes active when the stage below finishes burning). Each motor
  // then ignites at its stage's activation PLUS its own ignition delay, so two motors in one
  // stage can airstart at different times (the second lights after the first).
  const stageActivation = new Array(nStages).fill(0);
  for (let i = nStages - 2; i >= 0; i--) {
    stageActivation[i] = stageActivation[i + 1] + stageBurnDuration[i + 1];
  }
  // Each stage's own motor ejection-charge time (earliest, if any) — for a stage set to separate at
  // ejection. Matches the per-motor ejectionTime formula below (ignition + burn + ejection delay).
  const stageEjectionTime = new Array(nStages).fill(Infinity);
  for (const p of placed) {
    if (!Number.isFinite(p.ejectionDelay)) continue;
    const ej = stageActivation[p.stageIndex] + p.ignitionDelay + p.curve.burnTime + p.ejectionDelay;
    stageEjectionTime[p.stageIndex] = Math.min(stageEjectionTime[p.stageIndex], ej);
  }
  // When a spent lower stage separates and drops away, following the design's separation event.
  // The default (unspecified / burnout / upper-stage ignition) is Loft's serial-staging behaviour:
  // the stage drops when it finishes burning. `ejection` separates it at its own ejection charge —
  // often a long delay, so a payload/dual-section rocket parts near apogee, not at burnout — and
  // `never` keeps it attached. (apogee/altitude separation isn't yet resolved in-flight; it falls
  // back to the burnout default.) The top stage never separates.
  const detachT = new Array(nStages).fill(Infinity);
  for (let i = 1; i < nStages; i++) {
    const sep = effectiveSeparation(rocket.stages[i], config.id);
    const ev = sep.event;
    const sepDelay = sep.delay;
    const burnoutSep = stageActivation[i] + stageBurnDuration[i];
    if (ev === "never") detachT[i] = Infinity;
    else if (ev === "ejection" && Number.isFinite(stageEjectionTime[i])) detachT[i] = stageEjectionTime[i] + sepDelay;
    // `upperignition` (drop at upper-stage light) and the default both resolve to the lower stage's
    // burnout, which is exactly when the stage above air-starts in the serial model.
    else detachT[i] = burnoutSep + sepDelay;
  }

  const motors: ResolvedMotor[] = [];
  for (const p of placed) {
    const ignitionTime = stageActivation[p.stageIndex] + p.ignitionDelay;
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

/** The separation setting in force for the flown configuration: a per-config override wins over
 *  the stage's default event (a two-stage design can drop the booster at its ejection charge on
 *  one motor and at upper-stage ignition on another). Missing the per-config lookup made the
 *  spent booster ride to apogee on such a config — a large apogee error. */
function effectiveSeparation(
  stage: Rocket["stages"][number] | undefined,
  configId: string,
): { event: SeparationEvent | undefined; delay: number } {
  const o = stage?.separationConfigs?.[configId];
  return {
    event: o?.event ?? stage?.separationEvent,
    delay: (o?.delay ?? stage?.separationDelay) ?? 0,
  };
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
    case "lowerstage-separation":
      return "separation";
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
