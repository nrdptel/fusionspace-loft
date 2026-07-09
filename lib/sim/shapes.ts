/** Contour geometry for bodies of revolution (nose cones and transitions). Gives the
 *  radius profile r(x), the enclosed volume, and the volume centroid for each of the
 *  standard nose-cone shapes. Mass properties use these for solid/shell volume and CG;
 *  the Barrowman aerodynamics use the volume (the nose CP is X = L − V/A_base).
 *
 *  Profile equations are the standard published forms (e.g. the nose-cone geometry
 *  compiled in the public "Nose cone design" literature and Barrowman's reports); each is
 *  parameterised so x runs 0→L from tip to base and r(L) = base radius R.
 */

import type { NoseShape } from "../model/types";
import { clamp } from "../units";

/** Radius (m) of a nose contour at axial station x∈[0,L], tip at x=0, base radius R. */
export function noseRadius(
  shape: NoseShape,
  x: number,
  L: number,
  R: number,
  param = 0,
): number {
  // A non-positive base radius has no contour. Guard first: the ogive form below divides by R
  // (rho = (R²+L²)/2R), so R=0 would otherwise yield Infinity → NaN and poison volume/mass — as
  // seen on real files whose "auto" radii couldn't be resolved and were zeroed.
  if (R <= 0) return 0;
  if (L <= 0) return R;
  const f = clamp(x / L, 0, 1);
  switch (shape) {
    case "conical":
      return R * f;
    case "ogive": {
      // Tangent ogive of base radius R and length L.
      const rho = (R * R + L * L) / (2 * R);
      const val = rho * rho - (L - x) * (L - x);
      return clamp(Math.sqrt(Math.max(0, val)) - (rho - R), 0, R);
    }
    case "ellipsoid":
      return R * Math.sqrt(Math.max(0, 1 - (1 - f) * (1 - f)));
    case "power": {
      const n = param > 0 ? param : 0.5;
      return R * Math.pow(f, n);
    }
    case "parabolic": {
      const K = clamp(param, 0, 1);
      return R * ((2 * f - K * f * f) / (2 - K));
    }
    case "haack": {
      // Haack series; C=0 is Von Kármán (LV-Haack), C=1/3 is LD-Haack.
      const C = param;
      const theta = Math.acos(clamp(1 - 2 * f, -1, 1));
      const inner = theta - Math.sin(2 * theta) / 2 + C * Math.pow(Math.sin(theta), 3);
      return (R / Math.sqrt(Math.PI)) * Math.sqrt(Math.max(0, inner));
    }
    default:
      return R * f;
  }
}

/** Radius of a transition contour at x∈[0,L], fore radius Rf → aft radius Ra. The nose
 *  shapes generalise to transitions by scaling a tip-anchored profile between Rf and Ra. */
export function transitionRadius(
  shape: NoseShape,
  x: number,
  L: number,
  Rf: number,
  Ra: number,
  param = 0,
): number {
  // Build the profile as if it were a full nose of base radius Ra, then read the segment
  // that starts at the station whose radius is Rf. For a cone this is exact; for curved
  // shapes it is the standard "shape clipped" interpretation.
  if (Ra === Rf) return Ra;
  const big = Math.max(Ra, Rf);
  const small = Math.min(Ra, Rf);
  // Solve for the virtual full length so the profile passes through both radii.
  // Numerically find the station on a unit-length nose of base `big` giving `small`.
  const steps = 200;
  let xSmall = 0;
  for (let i = 0; i <= steps; i++) {
    const xx = (i / steps) * 1;
    if (noseRadius(shape, xx, 1, big, param) >= small) {
      xSmall = xx;
      break;
    }
  }
  const virtLen = L / (1 - xSmall); // length of the virtual full nose
  const foreIsSmall = Rf < Ra;
  const station = foreIsSmall ? xSmall * virtLen + x : (1 - xSmall) * virtLen - x + xSmall * virtLen;
  const r = noseRadius(shape, clamp(station, 0, virtLen), virtLen, big, param);
  return clamp(r, small, big);
}

export interface SolidProps {
  /** Enclosed volume (m³). */
  volume: number;
  /** Axial centroid from the fore end (m). */
  centroid: number;
  /** Wetted (lateral surface) area (m²). */
  wettedArea: number;
}

/** Integrate a radius profile r(x) over [0,L] for volume, centroid, and wetted area. */
export function revolutionProps(
  radiusAt: (x: number) => number,
  L: number,
  steps = 400,
): SolidProps {
  if (L <= 0) return { volume: 0, centroid: 0, wettedArea: 0 };
  const dx = L / steps;
  let volume = 0;
  let moment = 0;
  let wetted = 0;
  let rPrev = radiusAt(0);
  for (let i = 1; i <= steps; i++) {
    const x = i * dx;
    const r = radiusAt(x);
    const rMid = (r + rPrev) / 2;
    const dV = Math.PI * rMid * rMid * dx;
    volume += dV;
    moment += dV * (x - dx / 2);
    // Lateral (frustum) surface: slant length × mean circumference.
    const slant = Math.sqrt(dx * dx + (r - rPrev) * (r - rPrev));
    wetted += Math.PI * (r + rPrev) * slant;
    rPrev = r;
  }
  return { volume, centroid: volume > 0 ? moment / volume : L / 2, wettedArea: wetted };
}

/** Solid volume, CG, and wetted area of a nose cone. */
export function noseProps(shape: NoseShape, L: number, R: number, param = 0): SolidProps {
  return revolutionProps((x) => noseRadius(shape, x, L, R, param), L);
}

/** Solid volume, CG, and wetted area of a transition. */
export function transitionProps(
  shape: NoseShape,
  L: number,
  Rf: number,
  Ra: number,
  param = 0,
): SolidProps {
  return revolutionProps((x) => transitionRadius(shape, x, L, Rf, Ra, param), L);
}
