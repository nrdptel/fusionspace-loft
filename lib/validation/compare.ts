/** The validation harness. A `.ork` carries OpenRocket's own stored flight results; this
 *  diffs Loft's engine output against them, metric by metric, so accuracy is measured and
 *  reported honestly rather than assumed. It exists to quantify error — a large diff from a
 *  crude drag model is surfaced plainly, not hidden. The same comparison drives the in-app
 *  "OpenRocket vs Loft" panel on a user's own design and the docs' validation cases. */

import type { FlightSummary } from "../sim/simulate";
import type { StoredResults } from "../ork/adapt";
import { notLandedWhy, noDeploymentWhy } from "../sim/withheld";

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

/** A metric the file stored and Loft did NOT compare, with the reason said out loud. */
export interface WithheldMetric {
  key: string;
  label: string;
  reason: string;
}

export interface ValidationReport {
  comparisons: MetricComparison[];
  /** Mean absolute percentage error across the compared metrics. */
  mape: number;
  /** Number of metrics that were available to compare. */
  count: number;
  /** Metrics the stored run has and this flight cannot answer, because the event they describe
   *  never happened. Empty on a normal flight. Surfaced rather than silently dropped: a table that
   *  quietly shrinks from ten rows to eight reads as "the file stored less", which is not what
   *  happened. */
  withheld: WithheldMetric[];
}

interface MetricDef {
  key: keyof StoredResults;
  label: string;
  unit: string;
  sim: (s: FlightSummary) => number;
  /** Why this flight cannot answer this metric, when it cannot — `undefined` on a flight that can.
   *
   *  **A zero here is an event that did not happen, not a measurement of zero**, and only the flight
   *  knows which. `FlightSummary` says so on `landed` ("a sentinel, not a measurement ... Surfaces
   *  must withhold them rather than render the zeros") and on `deployments`, and the Flight card has
   *  always obeyed it. This table did not: it read the sentinel as Loft's answer and published the
   *  arithmetic. Scored against `rocksimTestRocket1.rkt [E6-2]`, whose flight opens nothing while the
   *  file states 33.4 m/s, the deployment row read **"RockSim 33.4 m/s · Loft 0.0 m/s · −100%"**
   *  — a perfect-looking disagreement about a measurement neither tool made.
   *
   *  Only the metrics whose own event can fail to occur carry one. Apogee, max velocity and time to
   *  apogee are answers a flight has whether or not it lands, which is why this is per metric rather
   *  than a gate on the whole report: withholding all ten would throw away eight good comparisons to
   *  suppress two bad ones. */
  unanswerable?: (s: FlightSummary) => string | undefined;
}

const METRICS: MetricDef[] = [
  { key: "maxAltitude", label: "Apogee", unit: "m", sim: (s) => s.apogee },
  { key: "maxVelocity", label: "Max velocity", unit: "m/s", sim: (s) => s.maxVelocity },
  { key: "maxAcceleration", label: "Max acceleration", unit: "m/s²", sim: (s) => s.maxAcceleration },
  { key: "maxMach", label: "Max Mach", unit: "", sim: (s) => s.maxMach },
  { key: "timeToApogee", label: "Time to apogee", unit: "s", sim: (s) => s.timeToApogee },
  // Not a sentinel like the two below — the clock genuinely ran — but on an unlanded flight it is
  // the CAP rather than a flight time, so comparing it scores 1,200 s against a stored 70 s and
  // reports Loft 1,600% slow. A lower bound is not an answer to "how long was the flight".
  { key: "flightTime", label: "Flight time", unit: "s", sim: (s) => s.flightTime, unanswerable: notLandedWhy },
  {
    key: "groundHitVelocity",
    label: "Ground-hit velocity",
    unit: "m/s",
    sim: (s) => s.groundHitVelocity,
    unanswerable: notLandedWhy,
  },
  { key: "launchRodVelocity", label: "Rail-exit velocity", unit: "m/s", sim: (s) => s.railExitVelocity },
  {
    key: "deploymentVelocity",
    label: "Deployment velocity",
    unit: "m/s",
    sim: (s) => s.deploymentVelocity,
    unanswerable: noDeploymentWhy,
  },
  { key: "optimumDelay", label: "Optimum delay", unit: "s", sim: (s) => s.optimumDelay },
];

/** Compare a simulated summary against stored OpenRocket results. Only metrics present in
 *  the stored data (finite) are compared.
 *
 *  `groundHitVelocityFrame` says which QUANTITY the file's stored landing velocity is, because
 *  OpenRocket changed its mind between releases and the file does not say — see
 *  `StoredSimulation.groundHitVelocityFrame`. Loft reports the vertical descent rate; a file written
 *  by 24.12 or later stores the ground-frame total, and comparing one against the other is wrong in a
 *  single direction, because a total is never smaller than its own vertical component.
 *
 *  Absent, it compares against the vertical figure — the reading Loft has always used and the one
 *  `COMPETITION.md` row 34 established empirically from stored numbers. That is the conservative
 *  default: it is right for every file written before the change, and for a file whose creator string
 *  is missing there is nothing better to go on than the behaviour that has been measured. */
export function compareToStored(
  summary: FlightSummary,
  stored: StoredResults,
  opts: {
    groundHitVelocityFrame?: "vertical" | "total";
    /** Which FLIGHT the stored optimum delay describes — see `StoredSimulation.optimumDelayBasis`.
     *  OpenRocket stores the free-coast figure, which is what Loft reports; RockSim stores the
     *  as-flown apogee-minus-burnout of the run it sits in, which on a design whose canopy opens
     *  before apogee is a different flight entirely. Absent, it compares free-coast: the reading
     *  Loft has always used, and the right one for the format supplying most of the corpus. */
    optimumDelayBasis?: "free-coast" | "as-flown";
    /** Which of a flight's deployments the stored `deploymentVelocity` describes.
     *
     *  OpenRocket's attribute is last-write-wins over its own event list — LAST matches the stored
     *  flight log on 21 of 21 multi-deploy simulations in this corpus, MAX on only 19 — while Loft
     *  REPORTS the maximum, deliberately, because that is the opening shock a flyer sizes hardware
     *  against. On a design whose apogee device opens faster than its main the two differ by 70%
     *  with no physics in it. Absent, it compares the reported maximum: the reading Loft has always
     *  used, and the only one available for a format that does not say. */
    deploymentVelocityEvent?: "max" | "last";
  } = {},
): ValidationReport {
  const comparisons: MetricComparison[] = [];
  const withheld: WithheldMetric[] = [];
  for (const m of METRICS) {
    const storedVal = stored[m.key];
    if (storedVal === undefined || !Number.isFinite(storedVal)) continue;
    // Asked before the value is read, not after: the point is that the number in the summary cannot
    // be distinguished from a real one by looking at it.
    const cannot = m.unanswerable?.(summary);
    if (cannot) {
      withheld.push({ key: m.key, label: m.label, reason: cannot });
      continue;
    }
    const simVal =
      m.key === "groundHitVelocity" && opts.groundHitVelocityFrame === "total"
        ? summary.groundHitTotalVelocity
        : m.key === "optimumDelay" && opts.optimumDelayBasis === "as-flown"
          ? summary.optimumDelayAsFlown
          : m.key === "deploymentVelocity" && opts.deploymentVelocityEvent === "last"
            ? summary.lastDeploymentVelocity
            : m.sim(summary);
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
  return { comparisons, mape, count: comparisons.length, withheld };
}
