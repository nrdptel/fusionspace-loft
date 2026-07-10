/** The flight simulator — the format-agnostic core. It takes a `Rocket` (however it was
 *  imported), a motor configuration, resolved thrust curves, and launch conditions, and
 *  integrates the trajectory with a 4th-order Runge–Kutta step.
 *
 *  Fidelity this session (stated plainly, mirrored in the limitations log):
 *   - Translational 3-DOF in the vertical plane. The state is carried as full 3-D vectors
 *     (position, velocity) so a 6-DOF rotational solve is an additive extension, not a
 *     rewrite. Thrust and drag act along the flight path (velocity-aligned); the rocket is
 *     assumed to fly at small angle of attack, which holds for a stable rocket in light
 *     wind. Weathercocking and the wind-induced angle of attack are NOT integrated — so
 *     boost-phase wind turning is approximate. Static stability (margin) is computed and
 *     reported, not fed into a rotational solve.
 *   - Mass and CG are time-varying (propellant burns off). Aerodynamics are Barrowman CP +
 *     a subsonic drag buildup (see aero.ts).
 *   - Recovery: each device deploys on its event (apogee / altitude / ejection); descent
 *     uses the summed deployed drag areas. Descent drift is the canopy drifting with wind.
 */

import type { Rocket, MotorConfiguration } from "../model/types";
import { Atmosphere } from "./atmosphere";
import { aeroGeometry, barrowman, dragCoefficient, type Stability } from "./aero";
import {
  structurePointMasses,
  combine,
  type PointMass,
  type MassProperties,
} from "./mass";
import { thrustAt, motorMassAt, type MotorCurve } from "../motors/eng";
import { G0 } from "../units";
import { vec, type Vec3, add, scale, mag } from "./vector";

/** A motor loaded into the design, resolved to a real curve and placed on the axis. */
export interface ResolvedMotor {
  curve: MotorCurve;
  /** Motor CG station from the nose tip (m). */
  cg: number;
  /** Ignition time (s). */
  ignitionTime: number;
  /** Ejection-charge fire time (s) if a delay is set (burnout + delay). */
  ejectionTime?: number;
  /** Time (s) the motor's stage separates and drops away, taking the spent casing with it.
   *  `Infinity` (the default) for the final stage, which flies to apogee. */
  detachTime?: number;
}

/** One segment of a staged flight: which stages are still attached, and from when. Serial
 *  staging drops the bottom-most stage at each separation, so the attached set is always the
 *  top `stageCount` stages (`rocket.stages[0 … stageCount-1]`). A single-stage flight is one
 *  phase with every stage attached the whole time. */
export interface StagePhase {
  /** Time (s) this phase becomes active — a separation instant, or 0 for the first phase. */
  startTime: number;
  /** Stages still attached, counted from the top (nose): `stages[0 … stageCount-1]`. */
  stageCount: number;
}

export interface RecoveryDeviceSim {
  name: string;
  /** Drag area Cd·A (m²). */
  cdA: number;
  event: "apogee" | "altitude" | "ejection" | "launch" | "never";
  deployAltitude?: number; // m AGL
  deployDelay: number; // s
  /** Filled at runtime: time the trigger fired plus the deploy delay — i.e. when the canopy
   *  opens and starts to drag. Undefined until the trigger event occurs. */
  deployedAt?: number;
  /** Filled at runtime: set once the canopy has actually opened (t ≥ deployedAt). */
  opened?: boolean;
}

export interface LaunchConditions {
  rodLength: number; // m
  rodAngleFromVertical: number; // rad
  rodAzimuth: number; // rad
  /** Surface wind speed (m/s). */
  windSpeed: number;
  /** Direction the wind blows TOWARD (rad, 0 = +X). */
  windTo: number;
  /** Field elevation (m MSL). */
  launchAltitude: number;
  atmosphere: Atmosphere;
  /** Optional winds-aloft: air velocity vector (m/s) as a function of altitude AGL. */
  windProfile?: (altAgl: number) => Vec3;
}

export interface TrajectorySample {
  t: number;
  altitude: number; // AGL (m)
  x: number; // downrange (m)
  velocity: number; // total speed (m/s)
  verticalVelocity: number;
  acceleration: number; // signed along velocity (m/s²)
  mach: number;
  thrust: number; // N
  drag: number; // N
  mass: number; // kg
  cd: number;
  dynamicPressure: number; // Pa
  phase: FlightPhase;
}

export type FlightPhase = "rod" | "boost" | "coast" | "descent" | "landed";

export interface FlightEvent {
  type:
    | "ignition"
    | "liftoff"
    | "rail-exit"
    | "separation"
    | "burnout"
    | "apogee"
    | "deploy"
    | "landing";
  time: number;
  altitude: number;
  velocity: number;
  label?: string;
}

export interface FlightWarning {
  code: string;
  message: string;
  severity: "info" | "caution" | "warning";
}

export interface FlightSummary {
  apogee: number; // m AGL
  maxVelocity: number;
  maxAcceleration: number;
  maxMach: number;
  timeToApogee: number;
  flightTime: number;
  railExitVelocity: number;
  burnoutVelocity: number;
  burnoutAltitude: number;
  maxDynamicPressure: number;
  groundHitVelocity: number;
  /** Optimum ejection delay for apogee deployment (s from burnout). */
  optimumDelay: number;
  deploymentVelocity: number;
  driftDistance: number;
  descentRate: number; // final (main) descent rate (m/s)
}

export interface FlightResult {
  summary: FlightSummary;
  trajectory: TrajectorySample[];
  events: FlightEvent[];
  warnings: FlightWarning[];
  stability: Stability;
  /** Static margin in calibers at liftoff (loaded). */
  staticMarginCal: number;
  cgLoaded: number;
  cgDry: number;
  liftoffMass: number;
  burnoutMass: number;
  extrapolatedTransonic: boolean;
}

interface SimState {
  t: number;
  pos: Vec3;
  vel: Vec3;
}

/** Motor mass points at time t (dry casing + remaining propellant), for motors whose stage is
 *  still attached. A motor not yet ignited carries its full loaded mass (dead weight lofted by
 *  the stage below); one whose stage has separated is gone, casing and all. */
function motorMassPoints(motors: ResolvedMotor[], t: number): PointMass[] {
  const pts: PointMass[] = [];
  for (const m of motors) {
    if (t >= (m.detachTime ?? Infinity)) continue;
    pts.push({
      mass: motorMassAt(m.curve, t - m.ignitionTime),
      cg: m.cg,
      ownInertia: 0,
      source: m.curve.designation,
    });
  }
  return pts;
}

function totalThrust(motors: ResolvedMotor[], t: number): number {
  let f = 0;
  for (const m of motors) {
    if (t >= (m.detachTime ?? Infinity)) continue;
    f += thrustAt(m.curve, t - m.ignitionTime);
  }
  return f;
}

export interface SimulateInput {
  rocket: Rocket;
  config: MotorConfiguration;
  motors: ResolvedMotor[];
  recovery: RecoveryDeviceSim[];
  conditions: LaunchConditions;
  /** Staging timeline (from `buildRocketDynamics`). One phase ⇒ ordinary single-stage flight;
   *  more ⇒ spent stages drop away at each separation. Absent ⇒ single-stage. */
  phases?: StagePhase[];
  /** Fixed step during boost/coast (s). Descent uses a coarser step. */
  timeStep?: number;
}

const MAX_TIME = 1200; // s, hard cap

export function simulate(input: SimulateInput): FlightResult {
  const { rocket, config, motors, recovery, conditions } = input;
  const dtBoost = input.timeStep ?? 0.01;

  const structure = structurePointMasses(rocket);
  const geom = aeroGeometry(rocket);
  const stability = barrowman(rocket);

  // A staged flight is a sequence of phases, each with a different set of attached stages.
  // Precompute the structural mass points and aerodynamic geometry of each phase's vehicle from
  // a sub-rocket of the attached (top-most) stages — reusing the same mass and aero code as a
  // single stage. The full stack is phase 0, so a single-stage flight is unchanged.
  const nStages = rocket.stages.length;
  const phases: StagePhase[] =
    input.phases && input.phases.length > 0 ? input.phases : [{ startTime: 0, stageCount: nStages || 1 }];
  const phaseData = phases.map((ph) => {
    const sub =
      ph.stageCount >= nStages ? rocket : { ...rocket, stages: rocket.stages.slice(0, ph.stageCount) };
    return {
      startTime: ph.startTime,
      structure: ph.stageCount >= nStages ? structure : structurePointMasses(sub),
      geom: ph.stageCount >= nStages ? geom : aeroGeometry(sub),
    };
  });
  const phaseIndexAt = (t: number): number => {
    let idx = 0;
    for (let i = 1; i < phaseData.length; i++) if (t >= phaseData[i].startTime - 1e-9) idx = i;
    return idx;
  };
  const geomAt = (t: number) => phaseData[phaseIndexAt(t)].geom;

  const massAt = (t: number): MassProperties =>
    combine([...phaseData[phaseIndexAt(t)].structure, ...motorMassPoints(motors, t)]);

  const cgDry = combine(structure).cg;
  const loaded = massAt(0);
  const staticMarginCal =
    geom.refDiameter > 0 ? (stability.cp - loaded.cg) / geom.refDiameter : 0;

  // Rail unit vector (tilt from vertical toward azimuth).
  const sa = Math.sin(conditions.rodAngleFromVertical);
  const rail: Vec3 = vec(
    sa * Math.cos(conditions.rodAzimuth),
    sa * Math.sin(conditions.rodAzimuth),
    Math.cos(conditions.rodAngleFromVertical),
  );

  const windAt = (altAgl: number): Vec3 => {
    if (conditions.windProfile) return conditions.windProfile(Math.max(0, altAgl));
    return vec(
      conditions.windSpeed * Math.cos(conditions.windTo),
      conditions.windSpeed * Math.sin(conditions.windTo),
      0,
    );
  };

  const burnout = burnoutTime(motors);
  // The first ejection charge to fire (burnout + the design's delay). A device set to deploy
  // "at ejection" opens at this time — which may be before or after apogee, depending on the
  // delay — rather than always at apogee, so a mistimed delay shows as an early or late deploy.
  const ejectionChargeTime = firstEjectionTime(motors);

  // Recovery deploy times resolved during integration.
  const events: FlightEvent[] = [];
  const warnings: FlightWarning[] = [];
  const trajectory: TrajectorySample[] = [];

  let state: SimState = { t: 0, pos: vec(0, 0, 0), vel: vec(0, 0, 0) };
  let phase: FlightPhase = "rod";
  let maxV = 0;
  let maxA = 0;
  let maxMach = 0;
  let maxQ = 0;
  let apogeeAlt = 0;
  let apogeeTime = 0;
  let railExitV = 0;
  let burnoutV = 0;
  let burnoutAlt = 0;
  let deploymentV = 0;
  let extrapolated = false;
  let prevSpeed = 0;
  let liftedOff = false;
  let apogeePassed = false;
  let deployedBeforeApogee = false;
  let landed = false;
  let separationsLogged = 0;

  events.push({ type: "ignition", time: 0, altitude: 0, velocity: 0 });

  // Acceleration (m/s²) at a sub-state, plus scalar diagnostics for the current step.
  const accel = (s: SimState): Vec3 => {
    const mp = massAt(s.t);
    const mass = Math.max(1e-6, mp.mass);
    const altMsl = conditions.launchAltitude + s.pos.z;
    const atm = conditions.atmosphere.sample(altMsl);
    const wind = windAt(s.pos.z);
    const airVel = { x: s.vel.x - wind.x, y: s.vel.y - wind.y, z: s.vel.z - wind.z };
    const airSpeed = mag(airVel);
    const thrust = totalThrust(motors, s.t);
    const boosting = thrust > 0;

    // Gravity.
    let f: Vec3 = vec(0, 0, -G0 * mass);

    // Thrust — along the rail while constrained, else along the flight path (velocity).
    const speed = mag(s.vel);
    let thrustDir: Vec3;
    if (onRail(s, conditions.rodLength, rail)) {
      thrustDir = rail;
    } else if (speed > 0.5) {
      thrustDir = scale(s.vel, 1 / speed);
    } else {
      thrustDir = rail;
    }
    f = add(f, scale(thrustDir, thrust));

    // Drag — opposes the air-relative velocity. Uses the geometry of whichever stages are still
    // attached at this instant (after a separation the spent booster's body is gone).
    if (airSpeed > 0.01) {
      const g = geomAt(s.t);
      let cdA: number;
      if (anyDeployed(recovery, s.t)) {
        // An open canopy drags whenever it is open — including a too-early (pre-apogee) deploy.
        cdA = deployedCdA(recovery, s.t) + g.refArea * 0.5; // chutes + a little body
      } else {
        const dr = dragCoefficient(g, atm, airSpeed, boosting);
        if (dr.extrapolated) extrapolated = true;
        cdA = dr.cd * g.refArea;
      }
      const dragMag = 0.5 * atm.density * airSpeed * airSpeed * cdA;
      const dir = scale(airVel, -1 / airSpeed);
      f = add(f, scale(dir, dragMag));
    }

    let a = scale(f, 1 / mass);
    // While on the rail, cancel any lateral (off-rail) acceleration — the rail reacts it.
    if (onRail(s, conditions.rodLength, rail)) {
      const along = a.x * rail.x + a.y * rail.y + a.z * rail.z;
      a = scale(rail, Math.max(0, along));
    }
    return a;
  };

  let dt = dtBoost;
  let steps = 0;
  const maxSteps = Math.ceil(MAX_TIME / 0.02) + 10;

  while (!landed && state.t < MAX_TIME && steps < maxSteps) {
    steps++;
    // Phase-adaptive step: fine during powered/near-apogee, coarse during descent.
    dt = phase === "descent" ? 0.05 : dtBoost;

    const prev = state;
    state = rk4Step(state, dt, accel);

    const mp = massAt(state.t);
    const altMsl = conditions.launchAltitude + state.pos.z;
    const atm = conditions.atmosphere.sample(altMsl);
    const wind = windAt(state.pos.z);
    const airVel = { x: state.vel.x - wind.x, y: state.vel.y - wind.y, z: state.vel.z - wind.z };
    const airSpeed = mag(airVel);
    const speed = mag(state.vel);
    const thrust = totalThrust(motors, state.t);
    const mach = airSpeed / atm.speedOfSound;
    const q = 0.5 * atm.density * airSpeed * airSpeed;

    // Liftoff.
    if (!liftedOff && speed > 0.1 && thrust > mp.mass * G0) {
      liftedOff = true;
      events.push({ type: "liftoff", time: state.t, altitude: state.pos.z, velocity: speed });
    }

    // Rail exit.
    if (railExitV === 0 && !onRail(state, conditions.rodLength, rail) && liftedOff) {
      railExitV = speed;
      events.push({ type: "rail-exit", time: state.t, altitude: state.pos.z, velocity: speed });
    }

    // Determine phase.
    if (onRail(state, conditions.rodLength, rail)) phase = "rod";
    else if (thrust > 0) phase = "boost";
    else if (!apogeePassed) phase = "coast";
    else phase = "descent";

    // Stage separation(s): a spent lower stage drops away as this phase begins. Log each one
    // crossed this step so a staged flight shows where mass and drag stepped down.
    while (
      separationsLogged < phaseData.length - 1 &&
      state.t >= phaseData[separationsLogged + 1].startTime
    ) {
      separationsLogged++;
      events.push({
        type: "separation",
        time: phaseData[separationsLogged].startTime,
        altitude: state.pos.z,
        velocity: speed,
        label: `Stage separation`,
      });
    }

    // Burnout (first time thrust hits zero after having thrust).
    if (burnoutV === 0 && thrust <= 0 && state.t >= burnout && burnout > 0 && liftedOff) {
      burnoutV = speed;
      burnoutAlt = state.pos.z;
      events.push({ type: "burnout", time: state.t, altitude: state.pos.z, velocity: speed });
    }

    // Tangential acceleration this step (finite difference of speed). Computed BEFORE
    // prevSpeed is updated so both the running max and the trajectory sample see the real
    // value — sampling it after the update would always read zero.
    const accInst = (speed - prevSpeed) / dt;

    // Track maxima (after liftoff).
    if (liftedOff) {
      maxV = Math.max(maxV, speed);
      maxMach = Math.max(maxMach, mach);
      maxQ = Math.max(maxQ, q);
      maxA = Math.max(maxA, Math.abs(accInst));
    }
    prevSpeed = speed;

    // Apogee (vertical velocity crosses zero, ascending→descending).
    if (!apogeePassed && liftedOff && prev.vel.z > 0 && state.vel.z <= 0) {
      apogeePassed = true;
      apogeeAlt = state.pos.z;
      apogeeTime = state.t;
      events.push({ type: "apogee", time: state.t, altitude: apogeeAlt, velocity: speed });
    }
    if (state.pos.z > apogeeAlt && !apogeePassed) apogeeAlt = state.pos.z;

    // Recovery: a trigger event schedules the device; the canopy actually opens (and begins
    // to drag) only once its deploy delay has elapsed. During the delay the vehicle keeps
    // falling on body drag alone, so the deploy marker and the reported deployment velocity
    // are taken at canopy open — not at the charge — which matters for a delayed deployment.
    for (const dev of recovery) {
      if (dev.event === "never") continue;
      if (dev.deployedAt === undefined) {
        let trigger = false;
        if (dev.event === "apogee") trigger = apogeePassed;
        else if (dev.event === "ejection")
          // Fire at the motor's ejection charge if one is modelled; else fall back to apogee.
          trigger = ejectionChargeTime !== undefined ? state.t >= ejectionChargeTime : apogeePassed;
        else if (dev.event === "altitude") trigger = apogeePassed && state.pos.z <= (dev.deployAltitude ?? 0);
        else if (dev.event === "launch") trigger = liftedOff;
        if (trigger) dev.deployedAt = state.t + (dev.deployDelay ?? 0);
      }
      if (dev.deployedAt !== undefined && !dev.opened && state.t >= dev.deployedAt) {
        dev.opened = true;
        if (!apogeePassed) deployedBeforeApogee = true;
        if (deploymentV === 0) deploymentV = speed;
        events.push({
          type: "deploy",
          time: state.t,
          altitude: state.pos.z,
          velocity: speed,
          label: dev.name,
        });
      }
    }

    // Sample the trajectory (thin it during long descent).
    const gNow = geomAt(state.t);
    const cdNow = anyDeployed(recovery, state.t)
      ? 0
      : dragCoefficient(gNow, atm, airSpeed, thrust > 0).cd;
    if (shouldSample(trajectory, state.t, phase)) {
      trajectory.push({
        t: state.t,
        altitude: state.pos.z,
        x: Math.hypot(state.pos.x, state.pos.y),
        velocity: speed,
        verticalVelocity: state.vel.z,
        acceleration: accInst,
        mach,
        thrust,
        drag: 0.5 * atm.density * airSpeed * airSpeed * (cdNow * gNow.refArea),
        mass: mp.mass,
        cd: cdNow,
        dynamicPressure: q,
        phase,
      });
    }

    // Landing.
    if (apogeePassed && state.pos.z <= 0 && state.t > apogeeTime) {
      landed = true;
      state.pos.z = 0;
      events.push({
        type: "landing",
        time: state.t,
        altitude: 0,
        velocity: mag(state.vel),
      });
    }
  }

  const groundHitVelocity = landed ? mag(state.vel) : 0;
  const driftDistance = Math.hypot(state.pos.x, state.pos.y);
  const burnoutMass = massAt(Math.max(burnout, 0)).mass;

  // Final (main) descent rate: the descent speed in the last tenth of the flight.
  let descentRate = 0;
  for (let i = trajectory.length - 1; i >= 0; i--) {
    if (trajectory[i].phase === "descent") {
      descentRate = Math.abs(trajectory[i].verticalVelocity);
      break;
    }
  }

  // Optimum delay: burnout → apogee (coast time).
  const optimumDelay = Math.max(0, apogeeTime - burnout);

  buildWarnings(warnings, {
    staticMarginCal,
    railExitV,
    extrapolated,
    motorInstances: config.instances.length,
    motorsPlaced: motors.length,
    apogee: apogeeAlt,
    landed,
    deployedBeforeApogee,
    deploymentVelocity: deploymentV,
    recoveryExpected: recovery.length > 0,
    anyRecoveryOpened: recovery.some((d) => d.opened),
    groundHitVelocity,
  });

  return {
    summary: {
      apogee: apogeeAlt,
      maxVelocity: maxV,
      maxAcceleration: maxA,
      maxMach,
      timeToApogee: apogeeTime,
      flightTime: state.t,
      railExitVelocity: railExitV,
      burnoutVelocity: burnoutV,
      burnoutAltitude: burnoutAlt,
      maxDynamicPressure: maxQ,
      groundHitVelocity,
      optimumDelay,
      deploymentVelocity: deploymentV,
      driftDistance,
      descentRate,
    },
    trajectory,
    events,
    warnings,
    stability,
    staticMarginCal,
    cgLoaded: loaded.cg,
    cgDry,
    liftoffMass: loaded.mass,
    burnoutMass,
    extrapolatedTransonic: extrapolated,
  };
}

// --- integration & helpers -----------------------------------------------------------

/** One RK4 step of the {position, velocity} state under an acceleration field a(state). */
function rk4Step(s: SimState, dt: number, accel: (s: SimState) => Vec3): SimState {
  const a1 = accel(s);
  const s2: SimState = { t: s.t + dt / 2, pos: add(s.pos, scale(s.vel, dt / 2)), vel: add(s.vel, scale(a1, dt / 2)) };
  const a2 = accel(s2);
  const s3: SimState = { t: s.t + dt / 2, pos: add(s.pos, scale(s2.vel, dt / 2)), vel: add(s.vel, scale(a2, dt / 2)) };
  const a3 = accel(s3);
  const s4: SimState = { t: s.t + dt, pos: add(s.pos, scale(s3.vel, dt)), vel: add(s.vel, scale(a3, dt)) };
  const a4 = accel(s4);

  const velInc = add(add(a1, scale(add(a2, a3), 2)), a4);
  const posVelAvg = add(add(s.vel, scale(add(s2.vel, s3.vel), 2)), s4.vel);
  return {
    t: s.t + dt,
    pos: add(s.pos, scale(posVelAvg, dt / 6)),
    vel: add(s.vel, scale(velInc, dt / 6)),
  };
}

/** Distance travelled from the pad along the rail axis, while ≤ rod length ⇒ constrained. */
function onRail(s: SimState, rodLength: number, rail: Vec3): boolean {
  const along = s.pos.x * rail.x + s.pos.y * rail.y + s.pos.z * rail.z;
  return along < rodLength;
}

function burnoutTime(motors: ResolvedMotor[]): number {
  let t = 0;
  for (const m of motors) t = Math.max(t, m.ignitionTime + m.curve.burnTime);
  return t;
}

/** The earliest ejection-charge time across the motors (burnout + the design's delay), or
 *  undefined if no motor carries a modelled ejection charge (e.g. a plugged motor). A device
 *  set to deploy at ejection opens at this time. */
function firstEjectionTime(motors: ResolvedMotor[]): number | undefined {
  let t = Infinity;
  for (const m of motors) {
    // Only the final stage's motor(s) eject the tracked recovery. A lower stage's ejection
    // charge is a staging/separation charge — it must not fire the sustainer's parachute.
    if ((m.detachTime ?? Infinity) !== Infinity) continue;
    if (m.ejectionTime !== undefined && m.ejectionTime < t) t = m.ejectionTime;
  }
  return Number.isFinite(t) ? t : undefined;
}

/** A device contributes drag only once its canopy has opened — i.e. the trigger has fired AND
 *  its deploy delay has elapsed (t ≥ deployedAt). Before then the vehicle falls on body drag. */
function anyDeployed(recovery: RecoveryDeviceSim[], t: number): boolean {
  return recovery.some((d) => d.deployedAt !== undefined && t >= d.deployedAt);
}

function deployedCdA(recovery: RecoveryDeviceSim[], t: number): number {
  let s = 0;
  for (const d of recovery) if (d.deployedAt !== undefined && t >= d.deployedAt) s += d.cdA;
  return s;
}

/** Keep the trajectory to a sane size: dense early, thinned during the long descent. */
function shouldSample(traj: TrajectorySample[], t: number, phase: FlightPhase): boolean {
  if (traj.length === 0) return true;
  const last = traj[traj.length - 1].t;
  const gap = phase === "descent" ? 0.5 : phase === "coast" ? 0.1 : 0.02;
  return t - last >= gap;
}

function buildWarnings(
  out: FlightWarning[],
  ctx: {
    staticMarginCal: number;
    railExitV: number;
    extrapolated: boolean;
    /** How many motors the configuration calls for. */
    motorInstances: number;
    /** How many of those resolved to a real curve and were flown. */
    motorsPlaced: number;
    apogee: number;
    landed: boolean;
    /** A recovery device opened before apogee (likely a too-short ejection delay). */
    deployedBeforeApogee: boolean;
    deploymentVelocity: number;
    /** The design carries at least one recovery device. */
    recoveryExpected: boolean;
    /** At least one recovery device actually opened during the flight. */
    anyRecoveryOpened: boolean;
    groundHitVelocity: number;
  },
): void {
  // A recovery device configured but never deployed before the ground = ballistic impact. This
  // is the too-long-delay / plugged-motor case, and it's the most serious thing Loft can flag.
  if (ctx.recoveryExpected && ctx.landed && !ctx.anyRecoveryOpened) {
    out.push({
      code: "ballistic-descent",
      message:
        `No recovery device deployed before the rocket reached the ground — it comes in ballistic ` +
        `at about ${ctx.groundHitVelocity.toFixed(0)} m/s. The ejection charge fires after the rocket ` +
        "is already down (delay too long), or no ejection is modelled for the motor. Verify the recovery timing.",
      severity: "warning",
    });
  } else if (ctx.deployedBeforeApogee) {
    // Deployed before apogee — while still ascending. Severity scales with speed: a fast early
    // deployment risks a zipper or shredded canopy; barely early and slow is only marginal.
    const fast = ctx.deploymentVelocity > 30;
    out.push({
      code: "early-deployment",
      message:
        `A recovery device opens before apogee, while the rocket is still ascending` +
        `${ctx.deploymentVelocity > 0 ? ` at about ${ctx.deploymentVelocity.toFixed(0)} m/s` : ""}. ` +
        `The motor's ejection delay looks short for this flight${fast ? "; an early deployment at this speed can zipper the airframe or shred the parachute" : ""}. ` +
        "Verify the delay against the motor's printed data.",
      severity: fast ? "warning" : "caution",
    });
  }
  // A recovery device opened but the descent is still fast — an undersized canopy. Distinct from
  // the ballistic case above (there nothing opened); here the rocket lands harder than the
  // ~3–6 m/s (10–20 ft/s) most designs aim for. Above ~25 ft/s a landing gets firm; past ~35 ft/s
  // it risks damage on all but the toughest airframes. A rule of thumb, not a verdict.
  if (ctx.anyRecoveryOpened && ctx.landed && ctx.groundHitVelocity > 7.6) {
    const hard = ctx.groundHitVelocity > 10.7;
    out.push({
      code: "hard-landing",
      message:
        `The rocket lands at about ${ctx.groundHitVelocity.toFixed(1)} m/s under its recovery ` +
        `device — ${hard ? "a hard landing that can damage the airframe" : "a firm landing"}. ` +
        "Most designs aim for ~3–6 m/s (10–20 ft/s); a larger canopy lands softer. Verify it's " +
        "acceptable for your airframe's mass and construction.",
      severity: hard ? "warning" : "caution",
    });
  }
  if (ctx.motorsPlaced === 0) {
    out.push({
      code: "no-motor",
      message: "No motor was resolved for this configuration — thrust could not be simulated.",
      severity: "warning",
    });
  } else if (ctx.motorsPlaced < ctx.motorInstances) {
    // A cluster where some motors resolved and others didn't: the flight runs, but on less
    // thrust and mass than the design calls for, so apogee and velocity read low. This must be
    // flagged loudly — the result otherwise looks like an ordinary, complete flight.
    const missing = ctx.motorInstances - ctx.motorsPlaced;
    out.push({
      code: "partial-cluster",
      message: `Only ${ctx.motorsPlaced} of ${ctx.motorInstances} motors in this configuration resolved to a thrust curve — ${missing} could not be found. The flight was simulated on the resolved motor${ctx.motorsPlaced > 1 ? "s" : ""} alone, so its thrust is under-counted and apogee and velocity read low. See the motor tags for which weren't matched.`,
      severity: "warning",
    });
  }
  if (ctx.staticMarginCal < 1.0) {
    out.push({
      code: "low-stability",
      message:
        ctx.staticMarginCal < 0
          ? "The centre of pressure is ahead of the centre of gravity: the rocket is statically unstable as modelled."
          : `Static margin is ${ctx.staticMarginCal.toFixed(2)} cal — below the 1 cal rule of thumb. Verify independently.`,
      severity: "warning",
    });
  } else if (ctx.staticMarginCal > 3) {
    out.push({
      code: "over-stable",
      message: `Static margin is ${ctx.staticMarginCal.toFixed(2)} cal — high, which can make the rocket weathercock strongly into wind.`,
      severity: "caution",
    });
  }
  if (ctx.railExitV > 0 && ctx.railExitV < 15.24) {
    out.push({
      code: "low-rail-exit",
      message: `Rail-exit velocity is ${ctx.railExitV.toFixed(1)} m/s — below the ~50 ft/s (15 m/s) guideline for stable rail departure.`,
      severity: "caution",
    });
  }
  if (ctx.extrapolated) {
    out.push({
      code: "transonic",
      message:
        "The flight goes transonic/supersonic (M > 0.8), outside the drag model's validated subsonic envelope — treat apogee and velocity as rough.",
      severity: "caution",
    });
  }
  if (!ctx.landed) {
    out.push({
      code: "no-landing",
      message: "The simulation hit its time cap before landing — descent figures may be incomplete.",
      severity: "info",
    });
  }
}
