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
/** How a motor is triggered: at liftoff, by its stage becoming active in the serial sequence, or
 *  not at all. */
type IgnitionTrigger = "launch" | "stage" | "none";

/** Resolve a design's stated ignition event into a trigger.
 *
 *  OpenRocket records an ignition event per motor per configuration — `launch`, `burnout` (of the
 *  stage below), `automatic`, `never`. Loft's serial model assumes the default arrangement: the
 *  bottom stage lights at launch and each stage above air-starts on the burnout below it, which is
 *  exactly what `automatic` means. A design can say otherwise, and one does: an OpenRocket example
 *  lights its MIDDLE stage at launch and leaves the bottom stage's motor on a burnout event with
 *  nothing beneath it to burn out. Flying that on the default assumption fired the wrong motor
 *  first and read 49.8% high against the numbers the file itself stores.
 *
 *  `burnout`/`upperignition` on the bottom-most stage has no trigger — nothing below it ever burns
 *  out — so that motor never lights and rides as mass, which is what the file's stored flight
 *  shows (its mass trace carries the motor; its thrust trace never fires it). */
function ignitionTrigger(event: string | undefined, stageIndex: number, nStages: number): IgnitionTrigger {
  const ev = (event ?? "").trim().toLowerCase();
  const isBottom = stageIndex === nStages - 1;
  if (ev === "launch") return "launch";
  if (ev === "never") return "none";
  if (ev === "burnout" || ev === "upperignition") return isBottom ? "none" : "stage";
  // `automatic` and anything unrecognised keep the serial default.
  return isBottom ? "launch" : "stage";
}

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
    designation: string;
    cg: number;
    count: number;
    ejectionDelay: number;
    /** The design states this motor is plugged — no ejection charge will fire. */
    plugged: boolean;
    /** This motor's ignition delay from its stage becoming active — 0 for a normal motor, or the
     *  airstart delay for a second motor timed to light after liftoff/staging. */
    ignitionDelay: number;
    stageIndex: number;
    trigger: IgnitionTrigger;
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
    const trigger = ignitionTrigger(inst.ignitionEvent, stageIndex, nStages);
    placed.push({
      curve: match.entry.curve,
      designation: match.entry.designation,
      cg,
      count,
      ejectionDelay,
      plugged: inst.motor.plugged === true,
      ignitionDelay,
      stageIndex,
      trigger,
    });
    // A motor with no trigger never lights, so it adds no burn time to its stage — it rides along
    // as mass. The stage above therefore waits on whatever does burn below it, not on this.
    if (trigger !== "none") {
      stageBurnDuration[stageIndex] = Math.max(stageBurnDuration[stageIndex], ignitionDelay + match.entry.curve.burnTime);
    }
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
    // A stage whose motors never light has no burnout, so a burnout-triggered separation has no
    // trigger either: it stays attached and goes with whatever separates above it.
    else if (stageBurnDuration[i] === 0 && ev !== "ejection") detachT[i] = Infinity;
    else if (ev === "ejection" && Number.isFinite(stageEjectionTime[i])) detachT[i] = stageEjectionTime[i] + sepDelay;
    // `upperignition` (drop at upper-stage light) and the default both resolve to the lower stage's
    // burnout, which is exactly when the stage above air-starts in the serial model.
    else detachT[i] = burnoutSep + sepDelay;
  }

  // Phases: the stack starts whole; each separation (in time order) drops the current bottom
  // stage, so the attached count steps N → N-1 → … → 1.
  const phases: StagePhase[] = [{ startTime: 0, stageCount: nStages }];
  // A serial stack parts at ONE joint: separating stage i takes everything below it with it, so
  // the attached count becomes i, not one fewer. With every stage separating in turn that is the
  // same N → N-1 → … → 1 sequence as before; it differs only when a stage stays attached, where
  // decrementing would otherwise leave a phantom stage aboard after the joint above it parted.
  const seps = detachT
    .map((t, i) => ({ t, i }))
    .filter((x) => Number.isFinite(x.t) && x.i > 0)
    .sort((a, b) => a.t - b.t);
  let count = nStages;
  for (const { t, i } of seps) {
    if (i >= count) continue; // already gone with an earlier separation above it
    // Everything from this joint down leaves at once — that is what `count = i` says — so the
    // MOTORS down there leave with it. A stage that has no separation of its own still goes with
    // the joint above it (an unlit stage has no burnout to trigger on, so `detachT` left it at
    // `Infinity`), and that gap put its motor's point mass on the sustainer for the whole flight
    // while its airframe was correctly shed. Measured on `03.Three-stage.ork`: the shed Booster 2's
    // J315R is 0.85 kg of a reported 3.25 kg descent mass, against an attached 2.40 kg — and the
    // recovery goal-seek sizes a canopy off exactly that figure.
    for (let j = i; j < count; j++) detachT[j] = Math.min(detachT[j], t);
    count = i;
    phases.push({ startTime: t, stageCount: count });
  }

  const motors: ResolvedMotor[] = [];
  for (const p of placed) {
    // `launch` fires at liftoff wherever the motor sits in the stack — a design can light a
    // middle stage first, which the serial "bottom stage lights at launch" default would get
    // wrong. `none` means the design gave the motor a trigger that never arrives — a `never`
    // event on any stage, or a `burnout` event on the bottom-most one with nothing below it to
    // burn out. It rides as inert mass for as long as its own stage is attached, which is what
    // the file's own stored flight shows.
    const ignitionTime =
      p.trigger === "launch"
        ? p.ignitionDelay
        : p.trigger === "none"
          ? Infinity
          : stageActivation[p.stageIndex] + p.ignitionDelay;
    const resolved: ResolvedMotor = {
      curve: p.curve,
      designation: p.designation,
      cg: p.cg,
      ignitionTime,
      detachTime: detachT[p.stageIndex],
      ejectionTime: Number.isFinite(p.ejectionDelay)
        ? ignitionTime + p.curve.burnTime + p.ejectionDelay
        : undefined,
      plugged: p.plugged || undefined,
    };
    for (let i = 0; i < p.count; i++) motors.push(resolved);
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

/** A loaded motor's axial extent for the design diagram: where its casing sits on the airframe and
 *  how wide it is. Metres, from the nose tip. */
export interface MotorMark {
  /** Fore and aft casing stations (m from the nose tip). */
  x0: number;
  x1: number;
  /** Casing radius (m). */
  radius: number;
  designation: string;
}

/** Where each resolved motor's casing sits on the airframe, for drawing it inside the aft body on
 *  the design diagram. Resolves the configuration's motors against the bundled database (a design
 *  file carries only the designation and envelope, not the casing size), so it reflects exactly the
 *  motor the flight flew — including a what-if motor swap, since the caller passes the flown config.
 *  Empty when nothing resolves (no propulsion). */
export function motorLayout(rocket: Rocket, config: MotorConfiguration): MotorMark[] {
  const { motors } = buildRocketDynamics(rocket, config);
  return motors.map((m) => {
    const length = m.curve.lengthMm / 1000;
    return {
      x0: m.cg - length / 2,
      x1: m.cg + length / 2,
      radius: m.curve.diameterMm / 2000,
      designation: m.designation ?? m.curve.designation,
    };
  });
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
