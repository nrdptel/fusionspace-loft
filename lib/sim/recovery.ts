/** Recovery sizing: solve the parachute drag area (and an equivalent canopy diameter) that brings
 *  a design to a target landing speed. The recovery-side companion to the stability trim
 *  (lib/sim/trim.ts) — a goal-seek that answers the sizing question directly instead of leaving the
 *  flyer to guess a canopy and re-fly until the descent rate looks right.
 *
 *  It is closed-form. Under an open canopy the vehicle descends at terminal velocity, where drag
 *  balances weight:
 *      v = √( 2·m·g / (ρ·CdA_total) ),   CdA_total = CdA_chute + f·A_ref,
 *  with m the descent (burnout) mass, ρ the air density at the field, A_ref the airframe frontal
 *  area, and f·A_ref the airframe's own descent drag — the SAME body term the flight's descent model
 *  uses (lib/sim/simulate.ts). Solving for the canopy,
 *      CdA_chute = 2·m·g/(ρ·v²) − f·A_ref,
 *  so a size this returns, flown, reproduces the target descent speed — asserted against a real
 *  flight in recovery.test.ts. The equivalent diameter follows from CdA = C_d·π(D/2)². */

import { G0 } from "../units";

/** The airframe's own drag during descent as a fraction of its reference (frontal) area — the body
 *  hanging beneath the canopy still drags a little. Matches the descent model in simulate.ts
 *  (`cdA = deployedCdA + refArea * 0.5`), so sizing stays consistent with the flown descent. */
export const DESCENT_BODY_CDA_FACTOR = 0.5;

export interface RecoverySizingInput {
  /** Descent mass (kg): the vehicle under canopy, propellant spent — i.e. the burnout mass. */
  descentMass: number;
  /** Airframe reference (frontal) area (m²). */
  refArea: number;
  /** Air density (kg/m³) at the landing field (z = 0). */
  airDensity: number;
}

export interface RecoverySizing {
  targetSpeed: number;
  /** Canopy drag area C_d·A (m²) needed to hit the target landing speed; 0 when the bare airframe
   *  already descends at or below the target. */
  cdA: number;
  /** Equivalent circular-canopy diameter (m) at the assumed drag coefficient `cd`. */
  diameter: number;
  /** The parachute drag coefficient the diameter assumes. */
  cd: number;
  /** True when the airframe alone already meets the target — no canopy would be needed for it (a
   *  very light or very draggy airframe). */
  bareAlreadyMeets: boolean;
}

/** Solve the parachute C_d·A (and an equivalent diameter at drag coefficient `cd`, default 0.8 —
 *  the flat-circular value OpenRocket uses) to land at `targetSpeed`, consistent with the flight's
 *  own descent model. A degenerate input (no mass, density, or target) returns a zero sizing. */
export function recoverySizing(
  input: RecoverySizingInput,
  targetSpeed: number,
  cd = 0.8,
): RecoverySizing {
  const { descentMass, refArea, airDensity } = input;
  const bodyCdA = DESCENT_BODY_CDA_FACTOR * Math.max(0, refArea);
  if (!(descentMass > 0) || !(airDensity > 0) || !(targetSpeed > 0) || !(cd > 0)) {
    return { targetSpeed, cdA: 0, diameter: 0, cd, bareAlreadyMeets: false };
  }
  const totalCdA = (2 * descentMass * G0) / (airDensity * targetSpeed * targetSpeed);
  const chuteCdA = totalCdA - bodyCdA;
  const bareAlreadyMeets = chuteCdA <= 0;
  const cdA = Math.max(0, chuteCdA);
  const diameter = Math.sqrt((4 * cdA) / (Math.PI * cd));
  return { targetSpeed, cdA, diameter, cd, bareAlreadyMeets };
}
