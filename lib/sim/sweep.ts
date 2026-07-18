/** Motor sweep: fly one airframe on a list of candidate motors and collect the flight metrics that
 *  matter for choosing one, so a UI can lay them side by side. It's a thin loop over `runFlight`
 *  (each motor via the same motor-swap the what-if picker uses), kept out of the component so it can
 *  be unit-tested against the real solver. Every motor flies the same way — ballistic to apogee
 *  under one set of conditions — so the rows are a like-for-like comparison. */

import type { Rocket } from "../model/types";
import type { ConditionOverrides } from "./setup";
import type { GeometryEdits } from "../model/edit";
import { runFlight } from "./run";

/** A candidate motor to fly, as the swap picker describes it. */
export interface SweepMotor {
  designation: string;
  manufacturer: string;
  /** Casing diameter (m), passed through to the motor swap. */
  diameter: number;
  motorClass: string;
}

/** One motor's flight, as the sweep reports it. */
export interface MotorSweepRow {
  designation: string;
  manufacturer: string;
  motorClass: string;
  apogee: number;
  maxVelocity: number;
  railExitVelocity: number;
  thrustToWeight: number;
  staticMarginCal: number;
  /** True for the design's own motor, so the UI can mark its row. */
  isDesign: boolean;
}

export interface MotorSweepOptions {
  /** The stored flight configuration to fly (each motor is swapped onto it). */
  configId?: string;
  /** Launch conditions (from the stored simulation) shared by every motor. */
  overrides?: ConditionOverrides;
  /** Active nose-ballast what-if (kg), applied to every motor. */
  ballastKg?: number;
  /** Active builder geometry edits, applied to every motor. */
  geometry?: GeometryEdits;
  /** The design's own motor designation, to mark its row. */
  designMotor?: string;
}

/** Fly `rocket` on each of `motors` and return one row per motor that flies, sorted by apogee
 *  (highest first). A motor the airframe can't fly on — an unresolved swap, or a throw from the
 *  solver — is omitted rather than shown as a pad-drop. Every flight is ballistic to apogee under
 *  the shared `overrides`, so the rows compare like for like. */
export function motorSweep(rocket: Rocket, motors: SweepMotor[], opts: MotorSweepOptions = {}): MotorSweepRow[] {
  const rows: MotorSweepRow[] = [];
  for (const m of motors) {
    try {
      const run = runFlight(rocket, {
        configId: opts.configId,
        overrides: opts.overrides,
        ballistic: true,
        ballastKg: opts.ballastKg,
        motorSwap: { manufacturer: m.manufacturer, designation: m.designation, diameter: m.diameter },
        geometry: opts.geometry,
      });
      if (!run.hasPropulsion) continue;
      const s = run.result.summary;
      rows.push({
        designation: m.designation,
        manufacturer: m.manufacturer,
        motorClass: m.motorClass,
        apogee: s.apogee,
        maxVelocity: s.maxVelocity,
        railExitVelocity: s.railExitVelocity,
        thrustToWeight: s.thrustToWeight,
        staticMarginCal: run.result.staticMarginCal,
        isDesign: m.designation === opts.designMotor,
      });
    } catch {
      // A motor that can't be flown on this airframe is simply left out of the comparison.
    }
  }
  rows.sort((a, b) => b.apogee - a.apogee);
  return rows;
}
