/** Aerodynamics: static stability (centre of pressure and normal-force slope) by the
 *  Barrowman method, and a zero-lift drag coefficient by component buildup.
 *
 *  Stability — Barrowman equations (J. Barrowman, "The Practical Calculation of the
 *  Aerodynamic Characteristics of Slender Finned Vehicles", 1967; as compiled in the
 *  public Apogee "Peak of Flight" newsletters and the OpenRocket technical documentation,
 *  which is itself published). Valid subsonic, small angle of attack. Implemented clean-
 *  room from the published equations.
 *
 *  Drag — a subsonic component buildup: turbulent skin friction with a fineness/thickness
 *  form factor (Hoerner-style), base drag from the standard subsonic correlation, and
 *  modest pressure/interference terms. Beyond ~M0.8 the result is flagged as extrapolated;
 *  the transonic/supersonic rise here is crude by design and its error is reported by the
 *  validation harness, not hidden. See the in-app methods section and limitations log.
 */

import type { Rocket, TrapezoidFinSet, GenericFinSet } from "../model/types";
import {
  flattenRocket,
  referenceRadius,
  radiusAtStation,
  type Positioned,
} from "../model/geometry";
import { noseProps, transitionProps } from "./shapes";
import type { AtmosphereState } from "./atmosphere";
import { clamp } from "../units";

// --- stability -----------------------------------------------------------------------

export interface CpContribution {
  source: string;
  cnAlpha: number;
  /** CP station from the nose tip (m). */
  x: number;
}

export interface Stability {
  /** Total normal-force-coefficient slope (per radian), referenced to the reference area. */
  cnAlpha: number;
  /** Centre of pressure from the nose tip (m). */
  cp: number;
  refRadius: number;
  contributions: CpContribution[];
}

/** Barrowman CP and CNα of the (finned, axisymmetric) rocket at small angle of attack. */
export function barrowman(rocket: Rocket): Stability {
  const rRef = referenceRadius(rocket);
  const contributions: CpContribution[] = [];
  const flat = flattenRocket(rocket);

  for (const p of flat) {
    const c = p.component;
    if (c.kind === "nosecone") {
      const base = c.aftRadius;
      const V = noseProps(c.shape, c.length, base, c.shapeParameter ?? 0).volume;
      const cnA = 2 * ((base * base) / (rRef * rRef));
      const x = p.xFore + (c.length - V / (Math.PI * base * base));
      contributions.push({ source: c.name || "nose", cnAlpha: cnA, x });
    } else if (c.kind === "transition") {
      const rf = c.foreRadius;
      const ra = c.aftRadius;
      const cnA = 2 * ((ra * ra - rf * rf) / (rRef * rRef));
      const ratio = ra !== 0 ? rf / ra : 0;
      // Barrowman conical-transition CP (works for boattails too; CNα sign handles it).
      const denom = 1 - ratio * ratio;
      const xt =
        Math.abs(denom) > 1e-9
          ? (c.length / 3) * (1 + (1 - ratio) / denom)
          : c.length / 2;
      contributions.push({ source: c.name || "transition", cnAlpha: cnA, x: p.xFore + xt });
    } else if (
      c.kind === "trapezoidfinset" ||
      c.kind === "ellipticalfinset" ||
      c.kind === "freeformfinset"
    ) {
      contributions.push(finContribution(c, p, rocket, rRef));
    }
  }

  let cnAlpha = 0;
  let moment = 0;
  for (const k of contributions) {
    cnAlpha += k.cnAlpha;
    moment += k.cnAlpha * k.x;
  }
  const cp = cnAlpha !== 0 ? moment / cnAlpha : 0;
  return { cnAlpha, cp, refRadius: rRef, contributions };
}

function finContribution(
  fin: TrapezoidFinSet | GenericFinSet,
  p: Positioned,
  rocket: Rocket,
  rRef: number,
): CpContribution {
  const dRef = 2 * rRef;
  const rBody = radiusAtStation(rocket, p.xFore + 0.5 * (fin.rootChord || 0)) || rRef;
  const s = fin.height; // semispan
  const N = fin.finCount;

  let root: number;
  let tip: number;
  let sweep: number;
  if (fin.kind === "trapezoidfinset") {
    root = fin.rootChord;
    tip = fin.tipChord;
    sweep = fin.sweepLength;
  } else {
    // Reduce the elliptical/freeform planform to an equivalent trapezoid (same area & span).
    root = fin.rootChord;
    const meanChord = fin.height > 0 ? fin.area / fin.height : fin.rootChord;
    tip = Math.max(0, 2 * meanChord - root);
    sweep = fin.sweepLength;
  }

  // Mid-chord sweep length between root and tip mid-chords.
  const lf = Math.sqrt(s * s + Math.pow(sweep + tip / 2 - root / 2, 2));
  const cnaOne =
    (4 * N * (s / dRef) * (s / dRef)) / (1 + Math.sqrt(1 + Math.pow((2 * lf) / (root + tip), 2)));
  const interference = 1 + rBody / (s + rBody);
  const cnA = interference * cnaOne;

  // Barrowman fin CP from the fin root leading edge.
  const denom = root + tip;
  const xf =
    denom > 0
      ? (sweep / 3) * ((root + 2 * tip) / denom) +
        (1 / 6) * (root + tip - (root * tip) / denom)
      : fin.rootChord / 2;
  return { source: fin.name || "fins", cnAlpha: cnA, x: p.xFore + xf };
}

// --- drag ----------------------------------------------------------------------------

export interface AeroGeometry {
  refRadius: number;
  refArea: number;
  refDiameter: number;
  bodyLength: number;
  bodyFineness: number;
  bodyWettedArea: number;
  baseRadius: number;
  baseArea: number;
  finWettedArea: number;
  finThicknessRatio: number;
  finCount: number;
  /** Fin thickness (m), for leading-edge pressure drag. */
  finThickness: number;
  /** Total exposed fin frontal area (m²) = N · thickness · span. */
  finFrontalArea: number;
  /** Roughness height (m) from the roughest surface finish present. */
  roughness: number;
}

const FINISH_ROUGHNESS: Record<string, number> = {
  rough: 500e-6,
  unfinished: 150e-6,
  "regular-paint": 60e-6,
  "smooth-paint": 20e-6,
  polished: 2e-6,
  mirror: 0.5e-6,
};

/** Precompute the fixed drag geometry once per design. */
export function aeroGeometry(rocket: Rocket): AeroGeometry {
  const rRef = referenceRadius(rocket);
  const flat = flattenRocket(rocket);

  let bodyWetted = 0;
  let bodyLength = 0;
  let baseRadius = rRef;
  let roughness = FINISH_ROUGHNESS.unfinished;

  let finWetted = 0;
  let finCount = 0;
  let finThickness = 0;
  let meanFinChord = 0;
  let finSpan = 0;

  let aftBodyEnd = 0;
  for (const p of flat) {
    const c = p.component;
    if (c.finish && FINISH_ROUGHNESS[c.finish] !== undefined) {
      roughness = Math.max(roughness === FINISH_ROUGHNESS.unfinished ? 0 : roughness, FINISH_ROUGHNESS[c.finish]);
    }
    if (c.kind === "nosecone") {
      bodyLength += c.length;
      bodyWetted += noseProps(c.shape, c.length, c.aftRadius, c.shapeParameter ?? 0).wettedArea;
      if (p.xFore + c.length > aftBodyEnd) {
        aftBodyEnd = p.xFore + c.length;
        baseRadius = c.aftRadius;
      }
    } else if (c.kind === "bodytube") {
      bodyLength += c.length;
      bodyWetted += 2 * Math.PI * c.outerRadius * c.length;
      if (p.xFore + c.length > aftBodyEnd) {
        aftBodyEnd = p.xFore + c.length;
        baseRadius = c.outerRadius;
      }
    } else if (c.kind === "transition") {
      bodyLength += c.length;
      bodyWetted += transitionProps(c.shape, c.length, c.foreRadius, c.aftRadius, c.shapeParameter ?? 0).wettedArea;
      if (p.xFore + c.length > aftBodyEnd) {
        aftBodyEnd = p.xFore + c.length;
        baseRadius = c.aftRadius;
      }
    } else if (c.kind === "trapezoidfinset") {
      const area = ((c.rootChord + c.tipChord) / 2) * c.height;
      finWetted += 2 * area * c.finCount;
      finCount = Math.max(finCount, c.finCount);
      finThickness = Math.max(finThickness, c.thickness);
      meanFinChord = (c.rootChord + c.tipChord) / 2;
      finSpan = Math.max(finSpan, c.height);
    } else if (c.kind === "ellipticalfinset" || c.kind === "freeformfinset") {
      finWetted += 2 * c.area * c.finCount;
      finCount = Math.max(finCount, c.finCount);
      finThickness = Math.max(finThickness, c.thickness);
      meanFinChord = c.height > 0 ? c.area / c.height : c.rootChord;
      finSpan = Math.max(finSpan, c.height);
    }
  }

  const refArea = Math.PI * rRef * rRef;
  return {
    refRadius: rRef,
    refArea,
    refDiameter: 2 * rRef,
    bodyLength,
    bodyFineness: rRef > 0 ? bodyLength / (2 * rRef) : 10,
    bodyWettedArea: bodyWetted,
    baseRadius,
    baseArea: Math.PI * baseRadius * baseRadius,
    finWettedArea: finWetted,
    finThicknessRatio: meanFinChord > 0 ? finThickness / meanFinChord : 0,
    finCount,
    finThickness,
    finFrontalArea: finCount * finThickness * finSpan,
    roughness: roughness || FINISH_ROUGHNESS.unfinished,
  };
}

export interface DragResult {
  /** Total zero-lift drag coefficient, referenced to the reference area. */
  cd: number;
  friction: number;
  base: number;
  pressure: number;
  /** Compressibility (wave) drag — zero below the critical Mach. */
  wave: number;
  /** True when Mach is beyond the validated subsonic envelope (~0.8). */
  extrapolated: boolean;
}

/** Skin-friction coefficient of a flat plate at Reynolds number Re with a roughness floor. */
export function skinFriction(re: number, roughness: number, length: number, mach: number): number {
  let cf: number;
  if (re < 1) {
    cf = 0.01;
  } else if (re < 1e4) {
    cf = 1.48e-2; // very low Re floor
  } else if (re < 5e5) {
    cf = 1.328 / Math.sqrt(re); // laminar
  } else {
    cf = 0.455 / Math.pow(Math.log10(re), 2.58); // turbulent (Prandtl–Schlichting)
  }
  // Roughness floor: beyond a critical Re a rough surface can't drop below this.
  if (roughness > 0 && length > 0) {
    const cfRough = 0.032 * Math.pow(roughness / length, 0.2);
    cf = Math.max(cf, cfRough);
  }
  // Compressibility correction for a turbulent boundary layer (reference-temperature /
  // Frankl–Voishel approximation, adiabatic wall). Monotonically decreasing and ALWAYS
  // positive — unlike a naive (1 − kM²) factor, which turns friction negative past ~M3.
  return cf / Math.pow(1 + 0.144 * mach * mach, 0.65);
}

/** Zero-lift drag coefficient at a flight state. `boosting` fills the base and cuts base drag. */
export function dragCoefficient(
  geom: AeroGeometry,
  atm: AtmosphereState,
  velocity: number,
  boosting: boolean,
): DragResult {
  const mach = velocity / atm.speedOfSound;
  const re = (atm.density * velocity * geom.bodyLength) / atm.dynamicViscosity;

  const cf = skinFriction(re, geom.roughness, geom.bodyLength, mach);

  // Body friction with a fineness form factor; fins with a thickness form factor.
  const fr = Math.max(2, geom.bodyFineness);
  const bodyForm = 1 + 60 / (fr * fr * fr) + 0.0025 * fr;
  const bodyFriction = cf * bodyForm * (geom.bodyWettedArea / geom.refArea);
  const finForm = 1 + 2 * geom.finThicknessRatio;
  const finFriction = cf * finForm * (geom.finWettedArea / geom.refArea);
  const friction = bodyFriction + finFriction;

  // Base drag. Subsonic it rises with the square of Mach; supersonic the base pressure
  // recovers and it falls as ~1/M (Hoerner). The two branches meet continuously at M=1
  // (both 0.25). Referenced to the base area, then the reference area. Suppressed while the
  // motor burns (exhaust fills the base region). Applying the subsonic form supersonically —
  // as a naive model does — makes base drag (and total Cd) grow without bound, which is wrong.
  const baseCoeff = mach <= 1 ? 0.12 + 0.13 * mach * mach : 0.25 / mach;
  const base = baseCoeff * (geom.baseArea / geom.refArea) * (boosting ? 0.15 : 1);

  // Subsonic pressure/interference: fin leading-edge/thickness drag plus a small flat
  // allowance for launch lugs, joints, and rail buttons, with a mild Prandtl–Glauert
  // amplification (bounded below the critical Mach).
  const finLe = 0.8 * Math.max(0, geom.finThicknessRatio) * (geom.finFrontalArea / geom.refArea);
  const pg = 1 / Math.sqrt(Math.max(0.19, 1 - Math.min(mach, 0.9) * Math.min(mach, 0.9)));
  const pressure = (finLe + 0.01) * pg;

  // Wave (compressibility) drag — zero below the critical Mach, a transonic rise to a peak
  // near M≈1.15, then a supersonic decline. A bounded, published-shape model (not a
  // per-geometry CFD result): the peak scales with fin thickness and body bluntness.
  const wave = waveDrag(geom, mach);

  const cd = friction + base + pressure + wave;
  return { cd, friction, base, pressure, wave, extrapolated: mach > 0.8 };
}

const M_CRIT = 0.8;
const M_PEAK = 1.15;

/** Transonic/supersonic wave-drag coefficient (referenced to the reference area). Zero
 *  below M_CRIT; a smooth rise to a peak at M_PEAK whose height grows with fin thickness and
 *  falls with body slenderness; then a supersonic decline toward a slender-body plateau. */
function waveDrag(geom: AeroGeometry, mach: number): number {
  if (mach <= M_CRIT) return 0;
  const finTerm = 2.0 * Math.max(0, geom.finThicknessRatio);
  const noseTerm = 0.35 / Math.max(1, geom.bodyFineness / 6); // slender ⇒ less wave drag
  const peak = clamp(noseTerm + finTerm + 0.15, 0.2, 1.2);
  if (mach <= M_PEAK) {
    const t = (mach - M_CRIT) / (M_PEAK - M_CRIT); // 0→1
    return peak * t * t * (3 - 2 * t); // smoothstep rise
  }
  return peak * Math.sqrt(M_PEAK / mach); // supersonic decline
}
