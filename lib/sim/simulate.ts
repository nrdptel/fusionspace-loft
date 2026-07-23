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

import type { Rocket, MotorConfiguration, RocketComponent } from "../model/types";
import { Atmosphere } from "./atmosphere";
import { aeroGeometry, barrowman, dragCoefficient, type Stability } from "./aero";
import { analyzeFlutter, RECOMMENDED_FLUTTER_MARGIN, type FlutterReport } from "./flutter";
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
  event: "apogee" | "altitude" | "ejection" | "launch" | "separation" | "never";
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
  /** Liftoff thrust-to-weight ratio: peak thrust while clearing the rail ÷ loaded weight. The
   *  standard HPR launch-safety check — below 1 the rocket cannot leave the pad. */
  thrustToWeight: number;
  burnoutVelocity: number;
  burnoutAltitude: number;
  maxDynamicPressure: number;
  groundHitVelocity: number;
  /** Optimum ejection delay for apogee deployment (s from burnout). */
  optimumDelay: number;
  deploymentVelocity: number;
  driftDistance: number;
  /** Landing point relative to the pad (m): downrange (+x) and crossrange (+y) components of the
   *  drift, so a set of flights (e.g. a Monte-Carlo) can be plotted as a 2D scatter. Their
   *  magnitude is `driftDistance`. */
  landingX: number;
  landingY: number;
  descentRate: number; // final (main) descent rate (m/s)
  /** Kinetic energy the vehicle carries at ground impact (J): ½·m·v², from the descent (burnout)
   *  mass and the ground-hit speed. Many flying fields and waivers reference a per-section landing
   *  energy as their recovery-adequacy check, so it's reported alongside the descent rate. Loft
   *  flies the whole (top) vehicle down, so this is that vehicle's energy as one piece — a design
   *  that lands in separated sections would divide it among them. 0 when it doesn't reach the ground. */
  landingEnergy: number;
}

export interface FlightResult {
  summary: FlightSummary;
  trajectory: TrajectorySample[];
  events: FlightEvent[];
  warnings: FlightWarning[];
  stability: Stability;
  /** Static margin in calibers at liftoff (loaded). */
  staticMarginCal: number;
  /** For a staged flight, the lowest static margin (cal) any upper stage has at the moment it
   *  starts flying alone (loaded, just after separation) — the worst-case for a separated stage.
   *  Undefined for a single-stage flight. */
  upperStageMarginCal?: number;
  cgLoaded: number;
  cgDry: number;
  liftoffMass: number;
  burnoutMass: number;
  /** Air density (kg/m³) at the landing field (z = 0, i.e. the launch altitude) — the density the
   *  final descent settles to terminal velocity in. Exposed so recovery sizing (lib/sim/recovery.ts)
   *  can be computed consistently with the flown descent. */
  descentAirDensity: number;
  extrapolatedTransonic: boolean;
  /** A recovery device opened before apogee, so the coast (and thus the reported apogee time) was
   *  cut short. The orchestrator uses this to recompute the optimum delay from a free coast. */
  deployedBeforeApogee: boolean;
  /** Fin-flutter estimate over the ascent (worst-case margin per fin set). Undefined when the
   *  design has no fins with a usable thickness. A safety heuristic, not a guarantee — see
   *  flutter.ts. */
  flutter?: FlutterReport;
  /** Separated lower stages that carry their own recovery: their estimated terminal descent speed
   *  under that canopy (the top stage is the one flown to the ground, so a booster's own landing is
   *  otherwise untracked). A range-safety readout, complementing the ballistic-booster warning for
   *  an un-recovered stage. Empty for a single-stage flight or when no dropped stage recovers. */
  boosterDescents: BoosterDescent[];
}

/** A separated, self-recovering lower stage's estimated descent — a terminal-velocity landing under
 *  its own canopy, computed from the mass that leaves the stack at separation and the largest
 *  recovery drag area on that stage. */
export interface BoosterDescent {
  name: string;
  /** Descending mass (kg): the stage's structure plus its spent motor casing. */
  mass: number;
  /** Terminal descent speed at the landing field (m/s) under the stage's largest canopy. */
  terminalSpeed: number;
  /** Kinetic energy this stage carries at its own landing (J): ½·m·v² from its descending mass and
   *  terminal speed — the same recovery-adequacy figure the top vehicle reports, for this booster. */
  landingEnergy: number;
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

function totalThrust(motors: ResolvedMotor[], t: number, scale = 1): number {
  let f = 0;
  for (const m of motors) {
    if (t >= (m.detachTime ?? Infinity)) continue;
    f += thrustAt(m.curve, t - m.ignitionTime);
  }
  return f * scale;
}

/** Total attached-motor mass at t (dry casing + remaining propellant). The scalar counterpart of
 *  motorMassPoints, for the hot integration loop, which needs only the total mass — not the CG or
 *  inertia — so it avoids allocating point-mass objects thousands of times per flight. */
function motorMassSumAt(motors: ResolvedMotor[], t: number): number {
  let m = 0;
  for (const mo of motors) {
    if (t >= (mo.detachTime ?? Infinity)) continue;
    m += motorMassAt(mo.curve, t - mo.ignitionTime);
  }
  return m;
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
  /** Fixed step during descent under recovery (s). Defaults to `DESCENT_STEP`. Exposed mainly so a
   *  convergence check can vary it; ordinary flights use the default. */
  descentTimeStep?: number;
  /** Extra structural point masses layered onto the airframe for every phase — the "what-if"
   *  ballast trim (added nose weight, say). They ride the flown vehicle throughout, so they shift
   *  mass and CG (and thus apogee and stability) exactly as a real added mass would. Empty/absent
   *  for an unmodified design. */
  extraMasses?: PointMass[];
  /** Scale factor on every motor's thrust (and thus total impulse), default 1. Models a motor's
   *  lot-to-lot total-impulse tolerance — the propellant mass is essentially fixed for a given
   *  motor, so the variation is in average thrust, which is what this scales. Used by the
   *  Monte-Carlo dispersion; an ordinary flight leaves it at 1. */
  thrustScale?: number;
  /** Scale factor on the airframe's dry structural mass (not the motor, not what-if ballast),
   *  default 1. Models build-to-build variation — epoxy, layup, and hardware rarely hit the CAD
   *  mass exactly. Scales each structural point mass and its inertia uniformly, so the CG is
   *  unchanged and only the total mass moves. Used by the Monte-Carlo dispersion. */
  massScale?: number;
  /** Scale factor on the aerodynamic (zero-lift) drag coefficient, default 1. Models the drag
   *  model's own uncertainty — the single largest error source (see the limitations log) — which a
   *  build-and-conditions Monte-Carlo should propagate too. Multiplies the body/fin drag only, NOT a
   *  deployed canopy's drag area (that is set by the chute, not the aero model). Used by the
   *  Monte-Carlo dispersion; an ordinary flight leaves it at 1. */
  dragScale?: number;
}

const MAX_TIME = 1200; // s, hard cap

/** Integration step ceiling under recovery. Once a canopy is open the vehicle settles to terminal
 *  velocity within a second or two and then descends at a near-constant speed — an all-but-linear
 *  trajectory that a large step integrates as accurately as a small one. This ceiling is set from a
 *  convergence study (lib/sim/descent-convergence.test.ts): halving it moves the landing point and
 *  flight time by well under a tenth of a percent, so it is comfortably converged while keeping the
 *  long descent — the bulk of a full flight's steps, and thus of a Monte-Carlo's cost — cheap. At
 *  0.2 s it sits just inside the drag-stability bound at a typical ~5–7 m/s main-canopy terminal
 *  speed (2·g/v ≈ 3–4 /s ⇒ a ~0.25–0.4 s stable step), so the steady descent runs at this ceiling
 *  while the opening transient still shortens on its own. Halving the descent's step count from the
 *  earlier 0.1 s cuts a full recovery flight — and a 300-sample Monte-Carlo — by about a fifth to a
 *  quarter (measured), for a sub-metre landing shift (nil on a single-deploy demo, ~0.06% on a
 *  dual-deploy). */
const DESCENT_STEP = 0.2;
/** Floor on the descent step. Small enough to stay stable through the opening-shock transient of a
 *  realistic (even a mistimed high-speed) deployment; only reached briefly, since the drag pulls the
 *  speed back to terminal within a few steps. */
const DESCENT_STEP_MIN = 0.002;
/** Target for (step × drag-response-rate) through an open canopy. An open parachute's quadratic
 *  drag is a stiff decay: the explicit RK4 step is stable only while dt·λ stays inside its stability
 *  region (~2.78 on the real axis), where λ = ρ·(Cd·A)·v/m is the linearised response rate. Holding
 *  dt·λ at this value keeps a comfortable margin, so a fast deployment cannot make the descent
 *  diverge into a nonsensical speed (it once did, at a fixed coarse step). */
const DESCENT_STABILITY = 1.0;

export function simulate(input: SimulateInput): FlightResult {
  const { rocket, config, motors, recovery, conditions } = input;
  const dtBoost = input.timeStep ?? 0.01;
  const dtDescent = input.descentTimeStep ?? DESCENT_STEP;
  const thrustScale = input.thrustScale ?? 1;
  const massScale = input.massScale ?? 1;
  const dragScale = input.dragScale ?? 1;
  // Scale the dry structural masses uniformly (mass and its own inertia); the CG is unchanged
  // because every point scales together. Motor mass and what-if ballast are layered on separately
  // and are not scaled. A unit scale returns the points untouched.
  const scaleStructure = (pts: PointMass[]): PointMass[] =>
    massScale === 1 ? pts : pts.map((p) => ({ ...p, mass: p.mass * massScale, ownInertia: p.ownInertia * massScale }));

  const structure = scaleStructure(structurePointMasses(rocket));
  const geom = aeroGeometry(rocket);
  const stability = barrowman(rocket);

  // Guard against a non-physical airframe. A unit error (millimetres entered as metres, say) or a
  // corrupt import can inflate the reference diameter far beyond any real rocket; the enormous
  // reference area then makes drag astronomical and the fixed-step integrator diverges to a
  // nonsensical altitude. Refuse to report a garbage number — fail with a clear, actionable message
  // instead (the UI surfaces it the same way it does a missing motor).
  const MAX_REF_RADIUS = 1.0; // m — a 2 m airframe, larger than any hobby or amateur rocket.
  if (!Number.isFinite(geom.refRadius) || geom.refRadius > MAX_REF_RADIUS) {
    throw new Error(
      `The airframe's reference diameter is ${(geom.refRadius * 2).toFixed(1)} m — implausibly ` +
        "large for a rocket, most likely a unit error in the design or a corrupt file. Check the " +
        "airframe dimensions.",
    );
  }

  // A staged flight is a sequence of phases, each with a different set of attached stages.
  // Precompute the structural mass points and aerodynamic geometry of each phase's vehicle from
  // a sub-rocket of the attached (top-most) stages — reusing the same mass and aero code as a
  // single stage. The full stack is phase 0, so a single-stage flight is unchanged.
  const nStages = rocket.stages.length;
  const phases: StagePhase[] =
    input.phases && input.phases.length > 0 ? input.phases : [{ startTime: 0, stageCount: nStages || 1 }];
  // Ballast/what-if masses ride the flown vehicle in every phase (added nose weight stays with the
  // sustainer through staging), so layer them onto each phase's structural points.
  const extra = input.extraMasses ?? [];
  const phaseData = phases.map((ph) => {
    const sub =
      ph.stageCount >= nStages ? rocket : { ...rocket, stages: rocket.stages.slice(0, ph.stageCount) };
    const baseStructure = ph.stageCount >= nStages ? structure : scaleStructure(structurePointMasses(sub));
    const phaseStructure = extra.length ? [...baseStructure, ...extra] : baseStructure;
    return {
      startTime: ph.startTime,
      structure: phaseStructure,
      // The phase's constant structural mass, summed once so the hot loop needn't re-add it.
      structureMass: phaseStructure.reduce((s, p) => s + p.mass, 0),
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

  // Total mass only (structure + attached motors) — the hot-loop path, avoiding the point-array
  // build and the two-pass CG/inertia combine that massAt does. The 3-DOF accel uses only mass.
  const massSumAt = (t: number): number =>
    phaseData[phaseIndexAt(t)].structureMass + motorMassSumAt(motors, t);

  const cgDry = combine(phaseData[0].structure).cg;
  const loaded = massAt(0);
  const staticMarginCal =
    geom.refDiameter > 0 ? (stability.cp - loaded.cg) / geom.refDiameter : 0;

  // Upper-stage stability. After each separation the newly-exposed vehicle flies alone; its
  // margin is lowest right at ignition, when the freshly-lit motor pulls the CG aft, so evaluate
  // it there. A stack can be comfortably stable off the pad yet have an unstable sustainer once
  // the booster drops — a distinct hazard worth flagging on its own. The top stages keep their
  // nose-forward stations in the sub-rocket, so CP and CG stay in the same frame as the motors'.
  // A payload/dual-section rocket is the exception: its final stage pops a chute ON the separation
  // (a lower-stage-separation recovery), so it is under canopy from that instant and never flies
  // ballistically — a finless payload section then isn't an unstable-upper-stage hazard, so the
  // final phase is skipped when a separation-triggered recovery opens it.
  const finalStageRecoversAtSeparation = recovery.some((d) => d.event === "separation");
  let upperStageMarginCal: number | undefined;
  let worstUpperStageName = "";
  for (let p = 1; p < phaseData.length; p++) {
    if (p === phaseData.length - 1 && finalStageRecoversAtSeparation) continue;
    const stageCount = phases[p].stageCount;
    const sub = { ...rocket, stages: rocket.stages.slice(0, stageCount) };
    const cp = barrowman(sub).cp;
    const g = phaseData[p].geom;
    const cg = combine([...phaseData[p].structure, ...motorMassPoints(motors, phaseData[p].startTime)]).cg;
    const margin = g.refDiameter > 0 ? (cp - cg) / g.refDiameter : 0;
    if (upperStageMarginCal === undefined || margin < upperStageMarginCal) {
      upperStageMarginCal = margin;
      worstUpperStageName = rocket.stages[stageCount - 1]?.name || "upper stage";
    }
  }

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
  // The final stage separation — when the tracked (top) stage is left flying alone. A recovery
  // device set to deploy on lower-stage separation opens then (the classic payload/dual-section
  // charge that both parts the sections and pops the chute). Undefined for a single-stage flight.
  const lastSeparationTime =
    phaseData.length > 1 ? phaseData[phaseData.length - 1].startTime : undefined;

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
  let liftoffTWR = 0; // peak thrust-to-weight ratio while establishing flight (through rail exit)
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
    const mass = Math.max(1e-6, massSumAt(s.t));
    const altMsl = conditions.launchAltitude + s.pos.z;
    const atm = conditions.atmosphere.sample(altMsl);
    const wind = windAt(s.pos.z);
    const airVel = { x: s.vel.x - wind.x, y: s.vel.y - wind.y, z: s.vel.z - wind.z };
    const airSpeed = mag(airVel);
    const thrust = totalThrust(motors, s.t, thrustScale);

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
        const dr = dragCoefficient(g, atm, airSpeed);
        if (dr.extrapolated) extrapolated = true;
        cdA = dr.cd * dragScale * g.refArea;
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

  // Descent step: capped at the (converged) ceiling, but shortened through an open canopy's stiff
  // opening transient so a fast deployment cannot make the explicit integrator diverge. Before the
  // canopy opens the fall is a smooth free-fall (small drag, not stiff), so it runs at the ceiling.
  const descentStep = (s: SimState): number => {
    if (!anyDeployed(recovery, s.t)) return dtDescent;
    const mass = Math.max(1e-6, massSumAt(s.t));
    const rho = conditions.atmosphere.sample(conditions.launchAltitude + s.pos.z).density;
    const wind = windAt(s.pos.z);
    const airSpeed = Math.hypot(s.vel.x - wind.x, s.vel.y - wind.y, s.vel.z - wind.z);
    const cdA = deployedCdA(recovery, s.t) + geomAt(s.t).refArea * 0.5;
    const rate = (rho * cdA * airSpeed) / mass; // linearised drag response rate λ (1/s)
    if (!(rate > 0)) return dtDescent;
    return Math.min(dtDescent, Math.max(DESCENT_STEP_MIN, DESCENT_STABILITY / rate));
  };

  let dt = dtBoost;
  let steps = 0;
  // Backstop against a runaway loop, generous enough that a real flight (a few thousand steps, even
  // with brief sub-ms transients) never trips it — the shortened descent steps are only transient.
  const maxSteps = Math.ceil(MAX_TIME / DESCENT_STEP_MIN) + 10;

  while (!landed && state.t < MAX_TIME && steps < maxSteps) {
    steps++;
    // Phase-adaptive step: fine during powered/near-apogee, adaptive (stability-bounded) descent.
    dt = phase === "descent" ? descentStep(state) : dtBoost;

    const prev = state;
    state = rk4Step(state, dt, accel);

    const massNow = massSumAt(state.t);
    const altMsl = conditions.launchAltitude + state.pos.z;
    const atm = conditions.atmosphere.sample(altMsl);
    const wind = windAt(state.pos.z);
    const airVel = { x: state.vel.x - wind.x, y: state.vel.y - wind.y, z: state.vel.z - wind.z };
    const airSpeed = mag(airVel);
    const speed = mag(state.vel);
    const thrust = totalThrust(motors, state.t, thrustScale);
    const mach = airSpeed / atm.speedOfSound;
    const q = 0.5 * atm.density * airSpeed * airSpeed;

    // Liftoff thrust-to-weight: the peak thrust-to-weight ratio while still establishing flight
    // (up to rail exit) — the launch-safety number flyers check against the 5:1 rule of thumb.
    // Uses the current (near-loaded) mass, so it reflects the push actually available to break
    // free of the pad. On a staged flight the rail is cleared early, so this stays a booster-
    // liftoff quantity and isn't inflated by a lighter sustainer firing at altitude.
    if (railExitV === 0 && thrust > 0) {
      liftoffTWR = Math.max(liftoffTWR, thrust / (Math.max(1e-6, massNow) * G0));
    }

    // Liftoff.
    if (!liftedOff && speed > 0.1 && thrust > massNow * G0) {
      liftedOff = true;
      events.push({ type: "liftoff", time: state.t, altitude: state.pos.z, velocity: speed });
    }

    // Under-powered: if every motor has burned out and the rocket never developed enough thrust
    // to leave the pad, it never will — stop integrating a stationary rocket rather than run to
    // the time cap. The no-liftoff warning below explains the near-zero apogee.
    if (!liftedOff && thrust <= 0 && burnout > 0 && state.t > burnout) break;

    // Rail exit. Interpolate the crossing to the exact moment the rocket has travelled the rod
    // length, rather than recording the step-end speed. A fixed step overshoots the crossing by up
    // to one step, so the step-end speed reads high — and the off-the-rail velocity is a safety
    // number (fin authority against weathercocking), where an optimistic reading is the wrong error.
    // Linear interpolation across the step matches an event-root-finding 6-DOF engine (RocketPy) to
    // a fraction of a percent, versus several percent high uninterpolated.
    if (railExitV === 0 && !onRail(state, conditions.rodLength, rail) && liftedOff) {
      const alongPrev = prev.pos.x * rail.x + prev.pos.y * rail.y + prev.pos.z * rail.z;
      const alongNow = state.pos.x * rail.x + state.pos.y * rail.y + state.pos.z * rail.z;
      const f =
        alongNow > alongPrev
          ? Math.min(1, Math.max(0, (conditions.rodLength - alongPrev) / (alongNow - alongPrev)))
          : 1;
      const velExit = add(
        prev.vel,
        scale(vec(state.vel.x - prev.vel.x, state.vel.y - prev.vel.y, state.vel.z - prev.vel.z), f),
      );
      railExitV = mag(velExit);
      events.push({
        type: "rail-exit",
        time: prev.t + f * (state.t - prev.t),
        altitude: prev.pos.z + f * (state.pos.z - prev.pos.z),
        velocity: railExitV,
      });
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
      // Peak acceleration is an ascent quantity: stop tracking it once a recovery canopy is dragging,
      // so a high-speed (mistimed) deployment's opening-shock spike doesn't masquerade as the
      // flight's max g-load. The opening shock is reported separately via the deployment velocity.
      // Gate on the drag-active predicate (not a post-step flag) so the very step the canopy opens —
      // where the finite-difference spike is largest — is already excluded.
      if (!anyDeployed(recovery, state.t)) maxA = Math.max(maxA, Math.abs(accInst));
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
        else if (dev.event === "separation")
          // Deploy when the stage below separates; a device with nothing below it never fires.
          trigger = lastSeparationTime !== undefined && state.t >= lastSeparationTime;
        if (trigger) dev.deployedAt = state.t + (dev.deployDelay ?? 0);
      }
      if (dev.deployedAt !== undefined && !dev.opened && state.t >= dev.deployedAt) {
        dev.opened = true;
        if (!apogeePassed) deployedBeforeApogee = true;
        // Report the worst-case opening speed across every recovery deployment — the number that
        // sets the opening-shock load. On a dual-deploy design the drogue opens near apogee (almost
        // stationary) and the MAIN opens later at the faster under-drogue descent speed, so taking
        // the maximum (not the first) captures the shock that actually matters — and lets the
        // fast-deployment warning fire on a hard main deployment it otherwise missed.
        deploymentV = Math.max(deploymentV, speed);
        events.push({
          type: "deploy",
          time: state.t,
          altitude: state.pos.z,
          velocity: speed,
          label: dev.name,
        });
      }
    }

    // Sample the trajectory (thin it during long descent). The per-sample drag coefficient is the
    // one genuinely expensive quantity here (the drag buildup — logs and powers), and it feeds only
    // the sample, so compute it only on steps actually kept, not on every integration step. The
    // integrator's own drag is computed separately inside accel(); this changes nothing it sees.
    if (shouldSample(trajectory, state.t, phase)) {
      const gNow = geomAt(state.t);
      const cdNow = anyDeployed(recovery, state.t)
        ? 0
        : dragCoefficient(gNow, atm, airSpeed).cd;
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
        mass: massNow,
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
  // Kinetic energy at impact (½·m·v²) from the descent mass and the ground-hit speed — the
  // recovery-adequacy figure many fields and waivers cite. 0 when the vehicle never reaches the
  // ground (groundHitVelocity is 0 there).
  const landingEnergy = 0.5 * burnoutMass * groundHitVelocity * groundHitVelocity;

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

  // Spent lower stages that drop away and carry no recovery Loft can see descend ballistically —
  // and their fall isn't simulated (only the top stage is flown to the ground). Each such booster is
  // a range hazard: a heavy, un-parachuted section can travel a long way downrange. The dropped
  // stages are the ones below the final attached count; flag any with no chute/streamer in its tree.
  const finalStageCount = phases[phases.length - 1].stageCount;
  const ballisticBoosters: string[] = [];
  const boosterDescents: BoosterDescent[] = [];
  const groundDensity = conditions.atmosphere.sample(conditions.launchAltitude).density;
  for (let i = finalStageCount; i < nStages; i++) {
    const st = rocket.stages[i];
    if (!st) continue;
    const name = st.name || `stage ${i + 1}`;
    const cdA = subtreeMaxRecoveryCdA(st.components);
    if (cdA <= 0) {
      // No canopy Loft can see ⇒ ballistic, untracked (flagged below).
      ballisticBoosters.push(name);
      continue;
    }
    // The mass that leaves the stack at this stage's separation (structure + spent casing) is its
    // descending mass; under its largest canopy it settles to a terminal velocity at the field.
    const sepT = phases[nStages - i]?.startTime;
    const mass = sepT !== undefined ? massSumAt(sepT - 1e-3) - massSumAt(sepT + 1e-3) : 0;
    if (mass > 0 && groundDensity > 0) {
      const terminalSpeed = Math.sqrt((2 * mass * G0) / (groundDensity * cdA));
      boosterDescents.push({ name, mass, terminalSpeed, landingEnergy: 0.5 * mass * terminalSpeed * terminalSpeed });
    }
  }

  buildWarnings(warnings, {
    staticMarginCal,
    upperStageMarginCal,
    upperStageName: worstUpperStageName,
    railExitV,
    liftedOff,
    liftoffTWR,
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
    ballisticBoosters,
    firmBoosters: boosterDescents.filter((b) => b.terminalSpeed > 7.6),
  });

  // Fin-flutter safety estimate over the ascent. Below the recommended margin the fins are
  // cautioned; below 1 the peak airspeed is past the estimated flutter boundary (a warning). The
  // number is a preliminary-design estimate (see flutter.ts), so it is never used to certify a fin
  // as safe — only to flag a thin margin.
  const flutter = analyzeFlutter(rocket, trajectory, conditions.atmosphere, conditions.launchAltitude);
  if (flutter && Number.isFinite(flutter.worst.margin) && flutter.worst.margin < RECOMMENDED_FLUTTER_MARGIN) {
    const w = flutter.worst;
    const attrib = w.assumedMaterial ? ` (assuming ${w.material})` : ` (${w.material})`;
    warnings.push(
      w.margin < 1
        ? {
            code: "fin-flutter",
            severity: "warning",
            message:
              `Fins may flutter: the estimated flutter speed (~${Math.round(w.flutterVelocity)} m/s${attrib}) ` +
              `is below the ${Math.round(w.velocity)} m/s peak airspeed. Thicken the fins, shorten the span, ` +
              `or use a stiffer material.`,
          }
        : {
            code: "fin-flutter",
            severity: "caution",
            message:
              `Thin fin-flutter margin: the estimated flutter speed (~${Math.round(w.flutterVelocity)} m/s${attrib}) ` +
              `is only ${w.margin.toFixed(1)}× the ${Math.round(w.velocity)} m/s peak airspeed ` +
              `(keep ≥ ${RECOMMENDED_FLUTTER_MARGIN}×).`,
          },
    );
  }

  return {
    summary: {
      apogee: apogeeAlt,
      maxVelocity: maxV,
      maxAcceleration: maxA,
      maxMach,
      timeToApogee: apogeeTime,
      flightTime: state.t,
      railExitVelocity: railExitV,
      thrustToWeight: liftoffTWR,
      burnoutVelocity: burnoutV,
      burnoutAltitude: burnoutAlt,
      maxDynamicPressure: maxQ,
      groundHitVelocity,
      optimumDelay,
      deploymentVelocity: deploymentV,
      driftDistance,
      landingX: state.pos.x,
      landingY: state.pos.y,
      descentRate,
      landingEnergy,
    },
    trajectory,
    events,
    warnings,
    stability,
    staticMarginCal,
    upperStageMarginCal,
    cgLoaded: loaded.cg,
    cgDry,
    liftoffMass: loaded.mass,
    burnoutMass,
    descentAirDensity: conditions.atmosphere.sample(conditions.launchAltitude).density,
    extrapolatedTransonic: extrapolated,
    deployedBeforeApogee,
    flutter,
    boosterDescents,
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

/** The largest recovery drag area (Cd·A, m²) in a component subtree — the device that sets the
 *  terminal descent speed at landing (the main on a dual-deploy stage, or the sole canopy). Zero
 *  when the subtree carries no recovery device. */
function subtreeMaxRecoveryCdA(components: RocketComponent[]): number {
  let max = 0;
  for (const c of components) {
    if (c.kind === "parachute") {
      const area = c.area ?? Math.PI * (c.diameter / 2) * (c.diameter / 2);
      max = Math.max(max, c.cd * area);
    } else if (c.kind === "streamer") {
      max = Math.max(max, c.cd * c.stripLength * c.stripWidth);
    }
    max = Math.max(max, subtreeMaxRecoveryCdA(c.children));
  }
  return max;
}

function buildWarnings(
  out: FlightWarning[],
  ctx: {
    staticMarginCal: number;
    /** Lowest upper-stage margin (cal) after a separation; undefined if single-stage. */
    upperStageMarginCal?: number;
    /** Name of the stage with that lowest post-separation margin. */
    upperStageName?: string;
    railExitV: number;
    /** The rocket developed enough thrust to leave the pad. */
    liftedOff: boolean;
    /** Peak thrust-to-weight ratio while clearing the rail. */
    liftoffTWR: number;
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
    /** Names of spent lower stages that dropped away with no recovery device — ballistic, untracked. */
    ballisticBoosters: string[];
    /** Separated lower stages that DO recover but land firm or hard under their own canopy
     *  (terminal speed > 7.6 m/s), each with its estimated landing speed. */
    firmBoosters: BoosterDescent[];
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
  // A staged upper stage flies alone after separation, and can be unstable then even when the
  // full stack was stable on the pad (or vice-versa). Flag it separately from the liftoff margin.
  if (ctx.upperStageMarginCal !== undefined && ctx.upperStageMarginCal < 1.0) {
    const name = ctx.upperStageName || "upper stage";
    out.push({
      code: "upper-stage-stability",
      message:
        ctx.upperStageMarginCal < 0
          ? `After separation the ${name} is statically unstable as modelled (centre of pressure ahead of centre of gravity) once it flies alone — a staged stage can be stable on the pad yet unstable after staging. Verify independently.`
          : `After separation the ${name}'s static margin is ${ctx.upperStageMarginCal.toFixed(2)} cal — below the 1 cal rule of thumb once it flies alone. Verify independently.`,
      severity: "warning",
    });
  }
  // A spent lower stage that drops with no recovery falls ballistically — and Loft flies only the
  // top stage to the ground, so that fall isn't in the numbers above. It is a real range hazard:
  // plan clearance for it, not just for the tracked stage.
  if (ctx.ballisticBoosters.length > 0) {
    const many = ctx.ballisticBoosters.length > 1;
    out.push({
      code: "untracked-booster",
      message:
        `This flight sheds ${many ? "spent lower stages" : "a spent lower stage"} (${ctx.ballisticBoosters.join(", ")}) ` +
        `with no recovery device Loft can see. A separated booster's own descent isn't simulated — only the top stage is ` +
        `flown to the ground — and with no parachute it falls ballistically, reaching a high speed and drifting well downrange. ` +
        `Plan the range clearance and recovery area for it too, not just the tracked stage above.`,
      severity: "caution",
    });
  }
  // A separated lower stage that DOES recover, but comes down firm or hard under its own canopy.
  // Same thresholds as the top-stage hard-landing check (firm > 7.6 m/s, hard > 10.7 m/s), applied
  // to each recovering booster's estimated terminal speed — its own landing is otherwise only a
  // number in the descent readout, never flagged. A too-small drogue/booster chute is a real hazard.
  if (ctx.firmBoosters.length > 0) {
    const hard = ctx.firmBoosters.some((b) => b.terminalSpeed > 10.7);
    const list = ctx.firmBoosters.map((b) => `${b.name} at about ${b.terminalSpeed.toFixed(1)} m/s`).join(", ");
    const many = ctx.firmBoosters.length > 1;
    out.push({
      code: "booster-hard-landing",
      message:
        `A separated lower stage lands ${hard ? "hard" : "firm"} under its own recovery (${list}). ` +
        `${many ? "These stages come" : "It comes"} down faster than the ~3–6 m/s most designs aim for` +
        `${hard ? ", hard enough to damage the airframe" : ""}. A larger drogue or booster chute lands it softer; ` +
        `verify it's acceptable for that stage's mass and construction, and plan its recovery area.`,
      severity: hard ? "warning" : "caution",
    });
  }
  // Liftoff thrust-to-weight — the most basic launch-safety check, and (unlike rail-exit
  // velocity) independent of how long the rail is. Only meaningful when a motor was flown; the
  // no-motor case is covered above. Below 1:1 the rocket cannot leave the pad at all, which
  // otherwise reads as a silent near-zero apogee.
  if (ctx.motorsPlaced > 0 && !ctx.liftedOff) {
    out.push({
      code: "no-liftoff",
      message:
        `The rocket does not lift off the pad as modelled — the motor's thrust is too low for the ` +
        `loaded weight (peak thrust-to-weight ratio only ${ctx.liftoffTWR.toFixed(1)}:1, and it must ` +
        `exceed 1:1 to climb). The reported apogee is essentially zero; check the motor choice against ` +
        "the rocket's mass.",
      severity: "warning",
    });
  } else if (ctx.motorsPlaced > 0 && ctx.liftoffTWR > 0 && ctx.liftoffTWR < 5) {
    out.push({
      code: "low-thrust-to-weight",
      message:
        `Liftoff thrust-to-weight ratio is ${ctx.liftoffTWR.toFixed(1)}:1 — below the 5:1 minimum ` +
        "commonly taught for high-power rockets. A low ratio gives a slow, wind-sensitive departure; " +
        "make sure the launch rail is long enough to reach a stable speed, or choose a higher-thrust motor.",
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
  if (!ctx.landed && ctx.liftedOff) {
    out.push({
      code: "no-landing",
      message: "The simulation hit its time cap before landing — descent figures may be incomplete.",
      severity: "info",
    });
  }
}
