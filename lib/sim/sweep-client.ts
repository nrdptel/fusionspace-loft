/** Runs a motor or parameter sweep in the background so the UI doesn't freeze while dozens of
 *  flights compute. A true Web Worker would be ideal, but the static-export toolchain can't compile
 *  a bundled worker module — so instead the sweep runs on the main thread in small batches, yielding
 *  to the event loop between them. That keeps the page responsive (the spinner renders, clicks and
 *  scrolls are handled) and lets the work be abortable, at the cost of a little wall-clock overhead.
 *  Results are identical to the synchronous functions — this only changes WHEN the work happens. */

import {
  motorSweep,
  parameterSweep,
  type SweepMotor,
  type MotorSweepRow,
  type MotorSweepOptions,
  type ParamSweepPoint,
  type ParamSweepOptions,
  type SweepAxis,
} from "./sweep";
import type { Rocket } from "../model/types";

/** Flights per batch before yielding — a batch is a few tens of ms, short enough to stay responsive. */
const BATCH = 4;

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** True once the caller has abandoned this run (inputs changed); checked between batches to bail. */
export type Aborted = () => boolean;

/** Fly each fitting motor, a batch at a time, sorted by apogee (highest first) — the async, non
 *  -blocking counterpart of motorSweep. */
export async function runMotorSweep(
  rocket: Rocket,
  motors: SweepMotor[],
  opts: MotorSweepOptions,
  aborted?: Aborted,
): Promise<MotorSweepRow[]> {
  const rows: MotorSweepRow[] = [];
  for (let i = 0; i < motors.length; i += BATCH) {
    if (aborted?.()) return rows;
    rows.push(...motorSweep(rocket, motors.slice(i, i + BATCH), opts));
    if (i + BATCH < motors.length) await yieldToEventLoop();
  }
  // motorSweep sorts within each batch; sort the union so the whole table is highest-apogee first.
  rows.sort((a, b) => b.apogee - a.apogee);
  return rows;
}

/** Sweep one variable across its range, a batch of values at a time, preserving ascending order. */
export async function runParameterSweep(
  rocket: Rocket,
  axis: SweepAxis,
  values: number[],
  opts: ParamSweepOptions,
  aborted?: Aborted,
): Promise<ParamSweepPoint[]> {
  const points: ParamSweepPoint[] = [];
  for (let i = 0; i < values.length; i += BATCH) {
    if (aborted?.()) return points;
    points.push(...parameterSweep(rocket, axis, values.slice(i, i + BATCH), opts));
    if (i + BATCH < values.length) await yieldToEventLoop();
  }
  return points;
}
