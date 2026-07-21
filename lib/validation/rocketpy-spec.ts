/** Build a RocketPy "spec" from a Loft design — the neutral hand-off an independent RocketPy
 *  flight is assembled from.
 *
 *  This is the single shared interface between two RocketPy runners:
 *    1. the dev cross-check harness (scripts/rocketpy: emit.ts → run_rocketpy.py), which flies the
 *       bundled demos in native RocketPy to produce the committed Validation-page reference; and
 *    2. the in-browser second solver (a lazily-loaded Pyodide/WASM RocketPy), which flies the
 *       user's own design on demand as an independent cross-check of Loft's own result.
 *
 *  Both build the spec here, so what RocketPy flies is exactly what Loft flies. The spec carries
 *  Loft's own Cd(Mach) curve — RocketPy does not derive total drag from geometry — so a RocketPy
 *  run cross-checks the trajectory integrator, the mass model, and RocketPy's independent
 *  Barrowman centre of pressure while holding the drag model equal; it is not an independent drag
 *  oracle (that role is OpenRocket's stored per-step Cd). The module is pure and browser-safe: no
 *  filesystem, no Node APIs — only Loft's own sim/geometry/mass code. */

import type { OrkDocument } from "../ork/import";
import type { Rocket, MotorConfiguration } from "../model/types";
import { aeroGeometry, dragCoefficient, barrowman } from "../sim/aero";
import { dryMassProperties, combine, type PointMass } from "../sim/mass";
import { buildRocketDynamics } from "../sim/setup";
import { flattenRocket, referenceRadius, radiusAtStation } from "../model/geometry";
import { Atmosphere } from "../sim/atmosphere";

/** A `[Mach, Cd]` sample of the drag curve. */
export type CdSample = [number, number];
/** A `[time (s), thrust (N)]` sample of the motor curve. */
export type ThrustSample = [number, number];

export interface RocketpyNose {
  length: number;
  /** RocketPy nose `kind` string (see NOSE_KIND). */
  kind: string;
  baseRadius: number;
  /** Station of the nose tip from the nose tip (m) — i.e. its fore x on the airframe. */
  position: number;
}

export interface RocketpyTail {
  topRadius: number;
  bottomRadius: number;
  length: number;
  position: number;
}

export interface RocketpyFin {
  kind: "trapezoidal" | "elliptical";
  n: number;
  rootChord: number;
  tipChord: number;
  span: number;
  sweepLength: number;
  position: number;
  radius: number;
}

export interface RocketpyMotor {
  designation: string;
  thrust: ThrustSample[];
  burnTime: number;
  propMass: number;
  dryMass: number;
  diameter: number;
  length: number;
  /** Nozzle (motor origin) station on the airframe, from the nose tip (m). */
  position: number;
}

export interface RocketpyEnvironment {
  elevation: number;
  temperatureK: number;
  pressurePa: number;
  windMps: number;
  railLength: number;
  inclinationDeg: number;
  headingDeg: number;
}

export interface RocketpyRecovery {
  /** Total descent drag area C_d·A (m²) at landing: every deployed canopy/streamer plus the body's
   *  own descent drag (0.5·A_ref), exactly the Cd·A Loft's descent model settles to terminal
   *  velocity under (lib/sim/simulate.ts: `deployedCdA + refArea·0.5`). Fed to RocketPy as a single
   *  equivalent parachute so an independent engine reaches the same terminal descent — the descent
   *  analogue of feeding Loft's Cd(Mach) on ascent: the drag area is held equal, so the cross-check
   *  isolates the descent integrator and the (burnout) mass model, not the drag. 0 when the design
   *  carries no recovery device (it would fall ballistically, and no descent check is meaningful). */
  landingCdA: number;
}

export interface RocketpySpec {
  name: string;
  motorDesignation: string | null;
  speedOfSound0: number;
  environment: RocketpyEnvironment;
  recovery: RocketpyRecovery;
  rocket: {
    radius: number;
    mass: number;
    cgNoMotor: number;
    inertia: [number, number, number];
    cp: number;
    cdPowerOff: CdSample[];
    cdPowerOn: CdSample[];
    nose: RocketpyNose | null;
    tails: RocketpyTail[];
    fins: RocketpyFin[];
  };
  motor: RocketpyMotor | null;
}

/** Map Loft's nose-shape names to RocketPy's `kind` strings. */
export const NOSE_KIND: Record<string, string> = {
  ogive: "ogive",
  conical: "conical",
  ellipsoid: "elliptical",
  power: "powerseries",
  parabolic: "parabolic",
  haack: "lvhaack",
};

/** Sample Loft's own Cd(Mach) at sea-level static conditions, 0…3 Mach in 0.05 steps — the drag
 *  curve RocketPy is fed (it needs a Cd(Mach) table; it does not build drag from geometry). */
export function sampleCd(rocket: Rocket): CdSample[] {
  const geom = aeroGeometry(rocket);
  const atm = new Atmosphere().sample(0);
  const out: CdSample[] = [];
  for (let m = 0; m <= 3.0001; m += 0.05) {
    const v = m * atm.speedOfSound;
    const cd = m === 0 ? dragCoefficient(geom, atm, 0.01).cd : dragCoefficient(geom, atm, v).cd;
    out.push([Number(m.toFixed(3)), Number(cd.toFixed(4))]);
  }
  return out;
}

/** Assemble the RocketPy spec for a design's chosen configuration and stored-simulation index.
 *  `extraMasses` are "what-if" point masses added to the dry vehicle (e.g. nose ballast) — folded
 *  into the mass/CG/inertia exactly as the sim folds them, so a RocketPy run reflects the same
 *  hypothetical the flyer is looking at. Pass a motor-swapped config to fly a different motor. */
export function buildRocketpySpec(
  doc: OrkDocument,
  config: MotorConfiguration,
  simIndex: number,
  extraMasses: PointMass[] = [],
): RocketpySpec {
  const rocket = doc.rocket;
  const baseDry = dryMassProperties(rocket);
  // Fold any what-if masses into the dry properties. Combining the aggregate dry body (as one point
  // mass at its CG with its own inertia) with the extras is identical, by the parallel-axis theorem,
  // to combining every component individually — which is exactly what the sim does.
  const dry = extraMasses.length
    ? combine([{ mass: baseDry.mass, cg: baseDry.cg, ownInertia: baseDry.inertia, source: "dry" }, ...extraMasses])
    : baseDry;
  const refR = referenceRadius(rocket);
  const flat = flattenRocket(rocket);
  const { motors, recovery } = buildRocketDynamics(rocket, config);

  // Descent Cd·A at landing: every recovery device that actually deploys (a "never" device is
  // configured but inert), plus the body's own descent drag — the same sum the flight's descent
  // model settles to terminal velocity under (simulate.ts: `deployedCdA + refArea·0.5`). Fed to
  // RocketPy as one equivalent canopy, so the descent cross-check holds the drag area equal and
  // checks the descent integrator and mass model, exactly as the ascent check holds Cd(Mach) equal.
  const refArea = Math.PI * refR * refR;
  const deployedCdA = recovery.reduce((s, d) => (d.event === "never" ? s : s + d.cdA), 0);
  const landingCdA = deployedCdA > 0 ? deployedCdA + refArea * 0.5 : 0;

  // Aerodynamic surfaces (nose, transitions, fins). Body tubes of constant radius add no CP.
  let nose: RocketpyNose | null = null;
  const tails: RocketpyTail[] = [];
  const fins: RocketpyFin[] = [];
  for (const p of flat) {
    const c = p.component;
    if (c.kind === "nosecone") {
      nose = { length: c.length, kind: NOSE_KIND[c.shape] ?? "ogive", baseRadius: c.aftRadius, position: p.xFore };
    } else if (c.kind === "transition") {
      tails.push({ topRadius: c.foreRadius, bottomRadius: c.aftRadius, length: c.length, position: p.xFore });
    } else if (c.kind === "trapezoidfinset") {
      fins.push({
        kind: "trapezoidal", n: c.finCount, rootChord: c.rootChord, tipChord: c.tipChord,
        span: c.height, sweepLength: c.sweepLength, position: p.xFore,
        radius: radiusAtStation(rocket, p.xFore) || refR,
      });
    } else if (c.kind === "ellipticalfinset" || c.kind === "freeformfinset") {
      // Approximate: elliptical fins directly; a freeform reduces to an equal-area trapezoid.
      const chord = c.height > 0 ? c.area / c.height : c.rootChord;
      fins.push({
        kind: c.kind === "ellipticalfinset" ? "elliptical" : "trapezoidal",
        n: c.finCount, rootChord: c.rootChord || chord, tipChord: Math.max(0, 2 * chord - (c.rootChord || chord)),
        span: c.height, sweepLength: c.sweepLength, position: p.xFore,
        radius: radiusAtStation(rocket, p.xFore) || refR,
      });
    }
  }

  // Single motor (or cluster → aggregate as one equivalent thrust curve × count).
  const m0 = motors[0];
  const motorLen = m0 ? m0.curve.lengthMm / 1000 : 0;
  const count = motors.length;
  // Sum identical coaxial curves for a cluster: N× thrust, N× masses, same time base.
  const samples: ThrustSample[] = m0
    ? m0.curve.samples.map((s) => [Number(s.t.toFixed(4)), Number((s.thrust * count).toFixed(3))])
    : [];
  const motor: RocketpyMotor | null = m0
    ? {
        designation: m0.curve.designation,
        thrust: samples,
        burnTime: m0.curve.burnTime,
        propMass: m0.curve.propMass * count,
        dryMass: m0.curve.dryMass * count,
        diameter: m0.curve.diameterMm / 1000,
        length: motorLen,
        // Nozzle (motor origin) location on the rocket, from the nose tip.
        position: m0.cg + motorLen / 2,
      }
    : null;

  const cond = doc.simulations[simIndex]?.conditions;
  const atm0 = new Atmosphere().sample(0);
  const environment: RocketpyEnvironment = {
    elevation: cond?.launchAltitude ?? 0,
    temperatureK: cond?.baseTempK ?? 288.15,
    pressurePa: cond?.basePressurePa ?? 101325,
    // Zero wind on both sides: the cross-check is an ascent-physics diff (integrator, drag, mass,
    // CP), and a light crosswind barely moves the vertical apogee but would be a needless confound.
    windMps: 0,
    railLength: cond?.rodLength ?? 1,
    inclinationDeg: 90 - (cond?.rodAngleDeg ?? 0),
    headingDeg: cond?.rodDirectionDeg ?? 0,
  };

  // Roll inertia estimate (thin shell ≈ m r²); pitch/yaw from our mass model about the dry CG.
  const rollInertia = dry.mass * refR * refR;

  return {
    name: doc.rocket.name,
    motorDesignation: motor?.designation ?? null,
    speedOfSound0: atm0.speedOfSound,
    environment,
    recovery: { landingCdA },
    rocket: {
      radius: refR,
      mass: dry.mass,
      cgNoMotor: dry.cg,
      inertia: [dry.inertia, dry.inertia, rollInertia],
      cp: barrowman(rocket).cp,
      cdPowerOff: sampleCd(rocket),
      cdPowerOn: sampleCd(rocket),
      nose,
      tails,
      fins,
    },
    motor,
  };
}
