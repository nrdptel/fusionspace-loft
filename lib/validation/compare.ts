/** The validation harness. A `.ork` carries OpenRocket's own stored flight results; this
 *  diffs Loft's engine output against them, metric by metric, so accuracy is measured and
 *  reported honestly rather than assumed. It exists to quantify error — a large diff from a
 *  crude drag model is surfaced plainly, not hidden. The same comparison drives the in-app
 *  "OpenRocket vs Loft" panel on a user's own design and the docs' validation cases. */

import type { FlightSummary } from "../sim/simulate";
import type { StoredResults } from "../ork/adapt";

export interface MetricComparison {
  key: string;
  label: string;
  unit: string;
  stored: number;
  simulated: number;
  absError: number;
  /** Signed percentage error of the simulation relative to the stored value. */
  pctError: number;
}

export interface ValidationReport {
  comparisons: MetricComparison[];
  /** Mean absolute percentage error across the compared metrics. */
  mape: number;
  /** Number of metrics that were available to compare. */
  count: number;
}

interface MetricDef {
  key: keyof StoredResults;
  label: string;
  unit: string;
  sim: (s: FlightSummary) => number;
}

const METRICS: MetricDef[] = [
  { key: "maxAltitude", label: "Apogee", unit: "m", sim: (s) => s.apogee },
  { key: "maxVelocity", label: "Max velocity", unit: "m/s", sim: (s) => s.maxVelocity },
  { key: "maxAcceleration", label: "Max acceleration", unit: "m/s²", sim: (s) => s.maxAcceleration },
  { key: "maxMach", label: "Max Mach", unit: "", sim: (s) => s.maxMach },
  { key: "timeToApogee", label: "Time to apogee", unit: "s", sim: (s) => s.timeToApogee },
  { key: "flightTime", label: "Flight time", unit: "s", sim: (s) => s.flightTime },
  { key: "groundHitVelocity", label: "Ground-hit velocity", unit: "m/s", sim: (s) => s.groundHitVelocity },
  { key: "launchRodVelocity", label: "Rail-exit velocity", unit: "m/s", sim: (s) => s.railExitVelocity },
  { key: "deploymentVelocity", label: "Deployment velocity", unit: "m/s", sim: (s) => s.deploymentVelocity },
  { key: "optimumDelay", label: "Optimum delay", unit: "s", sim: (s) => s.optimumDelay },
];

/** Compare a simulated summary against stored OpenRocket results. Only metrics present in
 *  the stored data (finite) are compared. */
export function compareToStored(summary: FlightSummary, stored: StoredResults): ValidationReport {
  const comparisons: MetricComparison[] = [];
  for (const m of METRICS) {
    const storedVal = stored[m.key];
    if (storedVal === undefined || !Number.isFinite(storedVal)) continue;
    const simVal = m.sim(summary);
    const absError = simVal - storedVal;
    const pctError = storedVal !== 0 ? (absError / storedVal) * 100 : NaN;
    comparisons.push({
      key: m.key,
      label: m.label,
      unit: m.unit,
      stored: storedVal,
      simulated: simVal,
      absError,
      pctError,
    });
  }
  const withPct = comparisons.filter((c) => Number.isFinite(c.pctError));
  const mape =
    withPct.length > 0
      ? withPct.reduce((a, c) => a + Math.abs(c.pctError), 0) / withPct.length
      : NaN;
  return { comparisons, mape, count: comparisons.length };
}
