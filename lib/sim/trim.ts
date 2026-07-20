/** Stability trim: solve for the nose ballast — or the fin-group position — that brings a design to
 *  a target static margin.
 *
 *  This is a goal-seek (an optimisation primitive), the inverse of the ballast parameter sweep —
 *  instead of plotting the margin across a range of added weight, it answers the design question
 *  directly: "how much nose ballast reaches N calibers, and can ballast get there at all?"
 *
 *  It is exact and closed-form, not iterative. Static margin is (CP − CG)/diameter, evaluated at
 *  the loaded CG (as the flight reports it). Ballast of mass b placed at the nose station xn moves
 *  the loaded CG to a mass-weighted blend,
 *      cg(b) = (M·cg₀ + b·xn) / (M + b),
 *  and the aerodynamic CP does not move with mass, so setting (CP − cg(b))/d = target and solving
 *  for b gives
 *      b = M·(cg_target − cg₀) / (xn − cg_target),   cg_target = CP − target·d.
 *  As b → ∞ the CG asymptotes to the nose station, so the *most* stable a design can be made with
 *  nose ballast alone is (CP − xn)/d — a hard ceiling. A target above it is unreachable by ballast
 *  (the fins are too small or too far forward), which is worth saying plainly rather than returning
 *  an ever-growing lump of lead.
 *
 *  The same {mass, CG} combine the flight uses (lib/sim/mass.ts) produces cg(b), so the ballast this
 *  returns, typed into the nose-ballast what-if, reproduces the target margin the solver reports —
 *  the round-trip is asserted in trim.test.ts against a real flight, not just the algebra. */

import type { Rocket } from "../model/types";
import { barrowman } from "./aero";
import { dryMassProperties } from "./mass";
import { applyGeometryEdits, primaryFinStation } from "../model/edit";

export interface MarginTrimInput {
  /** Centre of pressure, station from the nose tip (m). */
  cp: number;
  /** Loaded centre of gravity, station from the nose tip (m) — as the reported margin uses. */
  cgLoaded: number;
  /** Loaded mass (kg). */
  loadedMass: number;
  /** Reference (max-body) diameter (m) — the caliber the margin is measured in. */
  refDiameter: number;
  /** Where nose ballast sits, station from the nose tip (m) — from `noseBallastStation`. */
  noseStation: number;
}

export interface MarginTrim {
  targetMarginCal: number;
  /** The design's current (as-supplied) static margin (cal). */
  currentMarginCal: number;
  /** Additional nose ballast (kg) to reach the target from the current state; 0 if already met or
   *  unreachable. */
  ballastKg: number;
  /** The static margin (cal) the returned ballast achieves — the target when feasible, else the
   *  ceiling `maxMarginCal`. */
  achievedMarginCal: number;
  /** The most stable (cal) nose ballast alone can make this design — the CG→nose asymptote. */
  maxMarginCal: number;
  /** True when the target is reachable with finite nose ballast (target < maxMarginCal). */
  feasible: boolean;
  /** True when the design already meets or exceeds the target (no ballast needed). */
  alreadyMet: boolean;
}

/** Solve the nose ballast for a target static margin. Pure and exact — no flight, no iteration.
 *  A degenerate airframe (no diameter, or a nose at/behind the CG) yields a not-feasible result
 *  with zero ballast rather than a divide-by-zero. */
export function marginTrim(input: MarginTrimInput, targetMarginCal: number): MarginTrim {
  const { cp, cgLoaded, loadedMass, refDiameter, noseStation } = input;
  const d = refDiameter;
  const currentMarginCal = d > 0 ? (cp - cgLoaded) / d : 0;
  // The CG→nose-station asymptote: the stiffest margin nose ballast can ever buy.
  const maxMarginCal = d > 0 ? (cp - noseStation) / d : 0;

  const degenerate = !(d > 0) || !(loadedMass > 0) || !(cgLoaded > noseStation);
  if (degenerate) {
    return {
      targetMarginCal,
      currentMarginCal,
      ballastKg: 0,
      achievedMarginCal: currentMarginCal,
      maxMarginCal,
      feasible: false,
      alreadyMet: currentMarginCal >= targetMarginCal,
    };
  }

  // Already at or above the target — the sim's own margin, no ballast to add.
  if (targetMarginCal <= currentMarginCal) {
    return {
      targetMarginCal,
      currentMarginCal,
      ballastKg: 0,
      achievedMarginCal: currentMarginCal,
      maxMarginCal,
      feasible: true,
      alreadyMet: true,
    };
  }

  // Unreachable with nose ballast alone (would need the CG forward of the nose ballast station).
  if (targetMarginCal >= maxMarginCal) {
    return {
      targetMarginCal,
      currentMarginCal,
      ballastKg: 0,
      achievedMarginCal: maxMarginCal,
      maxMarginCal,
      feasible: false,
      alreadyMet: false,
    };
  }

  const cgTarget = cp - targetMarginCal * d; // CG station that yields the target margin
  const ballastKg = (loadedMass * (cgLoaded - cgTarget)) / (cgTarget - noseStation);
  return {
    targetMarginCal,
    currentMarginCal,
    ballastKg: Math.max(0, ballastKg),
    achievedMarginCal: targetMarginCal,
    maxMarginCal,
    feasible: true,
    alreadyMet: false,
  };
}

export interface FinStationTrim {
  targetMarginCal: number;
  /** The design's current (as-supplied) static margin (cal). */
  currentMarginCal: number;
  /** The primary fin set's current fore station (m from the nose tip). */
  currentStation: number;
  /** The station to move the fin group's fore edge to for the target margin (m from the nose tip). */
  targetStation: number;
  /** How far to shift the fins (m): positive is aft (more stable), negative is fore (less stable). */
  shiftM: number;
  /** True when the design has fins whose position moves the margin and the target sits on the
   *  airframe (a positive station); false for a finless/degenerate design or an unreachable target. */
  feasible: boolean;
}

/** Solve the fin-group longitudinal position that brings a design to a target static margin — the
 *  weight-free companion to `marginTrim`, and the only lever that can *reduce* an over-stable margin
 *  (moving the fins forward), which nose ballast cannot. Static margin is very nearly linear in fin
 *  station — the fins' centre-of-pressure contribution shifts one-for-one with them — so the slope
 *  is taken from a small finite difference of the exact Barrowman CP and the dry CG (both pure, no
 *  flight) and inverted. Moving the fins also drags their own mass along, nudging the loaded CG; that
 *  term is small next to the CP shift but is folded in so the result lands on target. Typed into the
 *  fin-position what-if it reproduces the target margin — asserted against a real flight in
 *  trim.test.ts. Returns not-feasible for a finless or degenerate design, or a target that would put
 *  the fins ahead of the nose tip. */
export function finStationTrim(
  rocket: Rocket,
  currentMarginCal: number,
  loadedMass: number,
  refDiameter: number,
  targetMarginCal: number,
): FinStationTrim | null {
  const station0 = primaryFinStation(rocket);
  if (station0 === undefined || !(refDiameter > 0) || !(loadedMass > 0)) return null;
  const DELTA = 0.05; // 5 cm probe for the finite-difference margin slope
  const base = barrowman(rocket);
  const dryBase = dryMassProperties(rocket);
  const shifted = applyGeometryEdits(rocket, { finStation: station0 + DELTA });
  const dCp = (barrowman(shifted).cp - base.cp) / DELTA;
  const dCgLoaded = ((dryMassProperties(shifted).cg - dryBase.cg) / DELTA) * (dryBase.mass / loadedMass);
  const dMarginPerM = (dCp - dCgLoaded) / refDiameter;
  if (!(Math.abs(dMarginPerM) > 1e-4)) return null; // no stability authority from fin position
  const targetStation = station0 + (targetMarginCal - currentMarginCal) / dMarginPerM;
  return {
    targetMarginCal,
    currentMarginCal,
    currentStation: station0,
    targetStation,
    shiftM: targetStation - station0,
    feasible: targetStation > 0,
  };
}
