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
  /** Worst-case fin-flutter margin over the ascent (flutter speed ÷ peak airspeed) — a faster motor
   *  pushes the fins closer to flutter, so this is a motor-selection safety cue. NaN for a finless
   *  design. */
  flutterMargin: number;
  /** Optimum ejection delay for apogee deployment (s from burnout) — a faster motor coasts longer,
   *  so each candidate wants a different delay. The motor-selection companion to the flight's own
   *  optimum-delay readout: it says which delay to buy or drill for each motor. NaN when the motor
   *  can't reach a real apogee (e.g. it won't clear the rail). */
  optimumDelay: number;
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
        flutterMargin: run.result.flutter ? run.result.flutter.worst.margin : Number.NaN,
        // A motor that never really flew (won't clear the rail) has no meaningful apogee delay.
        optimumDelay: Number.isFinite(s.optimumDelay) && s.optimumDelay > 0 ? s.optimumDelay : Number.NaN,
        isDesign: m.designation === opts.designMotor,
      });
    } catch {
      // A motor that can't be flown on this airframe is simply left out of the comparison.
    }
  }
  rows.sort((a, b) => b.apogee - a.apogee);
  return rows;
}

// --- parameter sweep -----------------------------------------------------------------

/** A continuous variable the sweep can vary. The geometry axes map to a field of GeometryEdits
 *  (reusing the builder's "edit → rebuild → re-fly" path); `ballastKg` varies added nose weight
 *  instead — the classic stability-trim sweep. */
export type SweepAxis =
  | "finSpan"
  | "finRootChord"
  | "finTipChord"
  | "finThickness"
  | "finStation"
  | "noseLength"
  | "bodyLength"
  | "bodyDiameter"
  | "ballastKg";

/** The geometry axes, distinct from the ballast (mass) axis for how a value is applied. Most set an
 *  absolute dimension; `finStation` sets the fin group's longitudinal position — both flow through
 *  the same builder edit, so the swept value is just one field of GeometryEdits either way. The chord
 *  axes (root, tip) are the fin-area levers a flyer can also shape on the diagram, so a dimension is
 *  sweepable and draggable through one path. */
const GEOMETRY_AXES: readonly SweepAxis[] = [
  "finSpan",
  "finRootChord",
  "finTipChord",
  "finThickness",
  "finStation",
  "noseLength",
  "bodyLength",
  "bodyDiameter",
];

/** One flight in a parameter sweep: the swept value and the metrics that respond to it. */
export interface ParamSweepPoint {
  /** The swept parameter's value (m). */
  x: number;
  apogee: number;
  maxVelocity: number;
  railExitVelocity: number;
  staticMarginCal: number;
  /** Worst-case fin-flutter margin over the ascent (flutter speed ÷ peak airspeed). NaN when the
   *  design has no fins to estimate. */
  flutterMargin: number;
}

export interface ParamSweepOptions {
  configId?: string;
  overrides?: ConditionOverrides;
  /** Active nose-ballast what-if (kg), held fixed across the sweep. */
  ballastKg?: number;
  /** Active motor-swap what-if, held fixed across the sweep. */
  motorSwap?: { manufacturer?: string; designation: string; diameter?: number };
  /** Other active geometry edits, held fixed while the swept axis varies over them. */
  baseGeometry?: GeometryEdits;
}

/** Evenly-spaced values from a to b inclusive (n ≥ 2). */
export function linRange(a: number, b: number, n: number): number[] {
  if (n < 2) return [a];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(a + ((b - a) * i) / (n - 1));
  return out;
}

/** Fly `rocket` across a range of one design variable and return one point per value, in the order
 *  given (ascending x for a plot). Each flight rebuilds the design with the swept axis set to the
 *  value — every OTHER active what-if (ballast, motor swap, other geometry edits) held fixed — and
 *  flies ballistic to apogee under the shared conditions, so the curve isolates the swept variable's
 *  effect. A value the airframe can't fly is dropped rather than plotted as a pad-drop. */
export function parameterSweep(
  rocket: Rocket,
  axis: SweepAxis,
  values: number[],
  opts: ParamSweepOptions = {},
): ParamSweepPoint[] {
  const out: ParamSweepPoint[] = [];
  const isGeometry = GEOMETRY_AXES.includes(axis);
  for (const v of values) {
    // A geometry dimension must be positive; ballast may be zero (no added weight).
    if (isGeometry ? !(v > 0) : !(v >= 0)) continue;
    // A geometry axis overrides that one field of the held-fixed edits; the ballast axis leaves the
    // geometry alone and varies the added nose weight instead.
    const geometry: GeometryEdits = isGeometry ? { ...opts.baseGeometry, [axis]: v } : { ...opts.baseGeometry };
    const ballastKg = isGeometry ? opts.ballastKg : v;
    try {
      const run = runFlight(rocket, {
        configId: opts.configId,
        overrides: opts.overrides,
        ballistic: true,
        ballastKg,
        motorSwap: opts.motorSwap,
        geometry,
      });
      if (!run.hasPropulsion) continue;
      const s = run.result.summary;
      if (!Number.isFinite(s.apogee) || !Number.isFinite(run.result.staticMarginCal)) continue;
      out.push({
        x: v,
        apogee: s.apogee,
        maxVelocity: s.maxVelocity,
        railExitVelocity: s.railExitVelocity,
        staticMarginCal: run.result.staticMarginCal,
        flutterMargin: run.result.flutter ? run.result.flutter.worst.margin : Number.NaN,
      });
    } catch {
      // A value that can't be flown is simply left out of the curve.
    }
  }
  return out;
}
