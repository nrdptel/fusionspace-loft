import type { FlightResult } from "../sim/simulate";
import type { StoredFlightData } from "../ork/adapt";

/** Above this a stored per-step drag coefficient is a deployed recovery device, not airframe drag:
 *  a parachute's Cd referenced to the body area runs into the tens, so it is left off the drag
 *  curve, which is about the vehicle's own aerodynamics on the way up. */
export const RECOVERY_CD_CEILING = 5;

export interface XYPoint {
  x: number;
  y: number;
}

/** Loft's own solver and the design file's stored flight, as matched series for overlaying. The
 *  drag series are the ascent only (boost + coast), where the coefficient is the airframe's own;
 *  the altitude series span the whole flight. All in SI (metres, seconds) — the caller scales. */
export interface CrossCheckSeries {
  /** Drag coefficient vs time (s). */
  loftCd: XYPoint[];
  storedCd: XYPoint[];
  /** Altitude (m AGL) vs time (s). */
  loftAltitude: XYPoint[];
  storedAltitude: XYPoint[];
  /** True when both engines have an ascent drag curve worth overlaying. */
  haveDrag: boolean;
}

/** Build the matched Loft-vs-stored series for the cross-check panel. Loft's ascent is its boost
 *  and coast samples (a deployed descent is a different, recovery-dominated regime); the file's
 *  ascent is its steps up to its own apogee with any deployed-device coefficient filtered out, so
 *  an early (too-short-delay) deployment doesn't inject a parachute spike into the drag curve. */
export function crossCheckSeries(result: FlightResult, data: StoredFlightData): CrossCheckSeries {
  const apogee = data.points.reduce((a, b) => (b.altitude > a.altitude ? b : a));
  const storedCd = data.points
    .filter((p) => p.time <= apogee.time && Number.isFinite(p.cd) && p.cd > 0 && p.cd < RECOVERY_CD_CEILING)
    .map((p) => ({ x: p.time, y: p.cd }));
  const loftCd = result.trajectory
    .filter((s) => s.phase !== "descent" && s.phase !== "landed" && Number.isFinite(s.cd) && s.cd > 0)
    .map((s) => ({ x: s.t, y: s.cd }));
  const storedAltitude = data.points.map((p) => ({ x: p.time, y: p.altitude }));
  const loftAltitude = result.trajectory.map((s) => ({ x: s.t, y: s.altitude }));
  return {
    loftCd,
    storedCd,
    loftAltitude,
    storedAltitude,
    haveDrag: storedCd.length > 1 && loftCd.length > 1,
  };
}

/** How closely the two ascent drag curves agree — an honest number for the visual overlay. */
export interface DragAgreement {
  /** Mean absolute drag-coefficient difference over the compared points. */
  meanAbsCd: number;
  /** Mean of |ΔCd| / stored Cd, as a percentage. */
  meanPct: number;
  /** Points compared (stored ascent samples that fall within Loft's ascent time span). */
  n: number;
}

/** Linear interpolation of a time-sorted {x,y} series at time t, clamped to its ends. */
function interpolateAt(series: XYPoint[], t: number): number {
  if (t <= series[0].x) return series[0].y;
  const last = series[series.length - 1];
  if (t >= last.x) return last.y;
  for (let i = 1; i < series.length; i++) {
    if (series[i].x >= t) {
      const a = series[i - 1];
      const b = series[i];
      const span = b.x - a.x;
      return span > 0 ? a.y + ((b.y - a.y) * (t - a.x)) / span : a.y;
    }
  }
  return last.y;
}

/** Quantify how closely Loft's ascent drag curve tracks the file's stored one: interpolate Loft's
 *  Cd onto each stored ascent sample's time and average the difference. This turns the visual
 *  overlay into a concrete figure — the honest basis for "the two engines' drag agree to about
 *  X%". Undefined when there is no overlapping drag curve to compare. */
export function dragAgreement(cc: CrossCheckSeries): DragAgreement | undefined {
  if (!cc.haveDrag) return undefined;
  const loft = cc.loftCd;
  const tMin = loft[0].x;
  const tMax = loft[loft.length - 1].x;
  let sumAbs = 0;
  let sumPct = 0;
  let n = 0;
  for (const p of cc.storedCd) {
    if (p.x < tMin || p.x > tMax) continue; // only where Loft's ascent actually overlaps
    const diff = Math.abs(interpolateAt(loft, p.x) - p.y);
    sumAbs += diff;
    if (p.y > 0) sumPct += diff / p.y;
    n++;
  }
  if (n === 0) return undefined;
  return { meanAbsCd: sumAbs / n, meanPct: (sumPct / n) * 100, n };
}
