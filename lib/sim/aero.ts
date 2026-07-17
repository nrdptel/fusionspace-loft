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
 *  modest pressure/interference terms. Above ~M0.8 a transonic/supersonic wave-drag term is
 *  added whose peak is geometry-driven — the nose's own fineness and contour shape, and the
 *  fins' thickness reduced by leading-edge sweep — but it remains a bounded parametric
 *  estimate, not a per-geometry wave-drag solution, and every such flight is flagged
 *  extrapolated. See the in-app methods section and limitations log.
 */

import type { Rocket, TrapezoidFinSet, GenericFinSet, FinCrossSection } from "../model/types";
import {
  flattenRocket,
  referenceRadius,
  radiusAtStation,
  type Positioned,
} from "../model/geometry";
import { noseProps, transitionProps, noseRadius } from "./shapes";
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
  // A rocket with no resolvable body radius has no defined reference area; every Barrowman term
  // divides by it, so bail with a null (not NaN) result rather than poison the stability output.
  if (!(rRef > 0)) return { cnAlpha: 0, cp: 0, refRadius: 0, contributions };
  const flat = flattenRocket(rocket);

  for (const p of flat) {
    const c = p.component;
    if (c.kind === "nosecone") {
      const base = c.aftRadius;
      // A zero/negative-radius nose (a placeholder or malformed part) carries no normal force,
      // and its CP term V/(π·base²) would divide by zero — skip it rather than emit a NaN.
      if (base > 0) {
        const V = noseProps(c.shape, c.length, base, c.shapeParameter ?? 0).volume;
        const cnA = 2 * ((base * base) / (rRef * rRef));
        const x = p.xFore + (c.length - V / (Math.PI * base * base));
        contributions.push({ source: c.name || "nose", cnAlpha: cnA, x });
      }
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

  // A degenerate fin set — no fins, no span, or no root chord — has no planform, so it carries
  // no normal force. Return a zero contribution rather than divide by (root+tip)=0 and emit a NaN
  // that would poison the CP, the static margin, and (silently) the low-stability warning.
  if (!(N > 0) || !(s > 0) || !(fin.rootChord > 0)) {
    return { source: fin.name || "fins", cnAlpha: 0, x: p.xFore };
  }

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
  /** Draggiest fin edge cross-section present (square > rounded > airfoil), setting the fin
   *  leading-edge pressure drag. Square when the design has fins but names no cross-section. */
  finCrossSection: FinCrossSection;
  /** Roughness height (m) from the roughest surface finish present. */
  roughness: number;
  /** Forebody (nose) fineness ratio, length / diameter — the primary wave-drag driver. */
  noseFineness: number;
  /** Nose-contour wave-drag factor relative to a Von Kármán ogive (= 1.0, the minimum). */
  noseShapeFactor: number;
  /** Leading-edge sweep factor cos²Λ for the fins (1 = unswept), reducing supersonic fin
   *  wave drag as the leading edge sweeps back. */
  finSweepFactor: number;
  /** Total frontal area (m²) of external fittings — launch lugs and rail buttons — for their
   *  parasitic/interference drag. Zero when the design carries none. */
  protuberanceArea: number;
  /** Summed shoulder (diameter-increasing transition) pressure-drag C_d·A (m²): 0.8·sin²φ over
   *  each expanding transition's frontal-area increase. Divide by refArea for the coefficient.
   *  Zero for a plain or boattailed airframe. */
  shoulderPressureCdA: number;
  /** Summed boattail (diameter-decreasing transition) geometry factor (m²): f(γ)·ΔA over each
   *  contracting transition's frontal-area reduction. Multiply by the (Mach-dependent) base-drag
   *  coefficient, then divide by refArea, for the pressure-drag coefficient. Zero for a plain or
   *  shouldered airframe. */
  boattailPressureArea: number;
  /** Nose pressure-drag C_d·A (m²): 0.8·sin²φ over the nose base area, φ the contour's joint angle
   *  at the base. Divide by refArea for the coefficient. Zero for a tangent (ogive/ellipsoid/Haack)
   *  nose; non-zero for a cone or blunt shape. */
  nosePressureCdA: number;
}

/** Transonic/supersonic wave-drag of a nose contour, relative to a Von Kármán ogive of the
 *  same fineness (the minimum-drag body of revolution, = 1.0). The ordering — Haack/Von Kármán
 *  lowest, then parabolic, power, tangent-ogive, ellipsoid, conical highest — follows the
 *  published nose-shape drag comparisons (Hoerner, *Fluid-Dynamic Drag*; the Sears–Haack /
 *  Von Kármán minimum-drag result). It is a bounded relative estimate, not a CFD solution. */
const NOSE_WAVE_FACTOR: Record<string, number> = {
  haack: 1.0, // Von Kármán / LD-Haack — minimum wave drag by construction
  parabolic: 1.1,
  power: 1.15,
  ogive: 1.2,
  ellipsoid: 1.3,
  conical: 1.4,
};

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
  let finSweepLength = 0;
  // The draggiest cross-section present drives the fin leading-edge pressure drag. Rank
  // square > rounded > airfoil; a fin set that names none is square (the OpenRocket default).
  let finEdgeRank = -1;
  const EDGE_RANK: Record<FinCrossSection, number> = { airfoil: 0, rounded: 1, square: 2 };
  const noteFinEdge = (cs: FinCrossSection | undefined): void => {
    finEdgeRank = Math.max(finEdgeRank, EDGE_RANK[cs ?? "square"]);
  };

  // Forebody (nose) geometry — the dominant wave-drag driver. Captured from the frontmost
  // nose cone; a design with none keeps a neutral default (a mid-fineness ogive).
  let noseLength = 0;
  let noseBaseRadius = 0;
  let noseShapeFactor = NOSE_WAVE_FACTOR.ogive;
  let haveNose = false;

  let protuberanceArea = 0;
  let shoulderPressureCdA = 0;
  let boattailPressureArea = 0;
  let nosePressureCdA = 0;

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
      if (!haveNose) {
        haveNose = true;
        noseLength = c.length;
        noseBaseRadius = c.aftRadius;
        noseShapeFactor = NOSE_WAVE_FACTOR[c.shape] ?? NOSE_WAVE_FACTOR.ogive;
        // Nose pressure drag (Niskanen eq. 3.86, following Hoerner): 0.8·sin²φ over the nose base
        // area, φ = the contour's joint angle where the nose meets the body. A tangent shape (ogive,
        // ellipsoid, Haack) meets it smoothly (φ ≈ 0, essentially no drag); a cone or blunt shape
        // has a real joint angle and a small pressure drag. The base slope is read numerically from
        // the contour so every shape is handled uniformly. Not compressibility-corrected — a low-
        // subsonic separation effect, like the shoulder term (transonic flights are flagged rough).
        if (c.length > 0 && c.aftRadius > 0) {
          const eps = c.length * 1e-4;
          const rNear = noseRadius(c.shape, c.length - eps, c.length, c.aftRadius, c.shapeParameter ?? 0);
          const phi = Math.atan2(c.aftRadius - rNear, eps);
          nosePressureCdA += 0.8 * Math.sin(phi) ** 2 * Math.PI * c.aftRadius * c.aftRadius;
        }
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
      // Shoulder (diameter-increasing transition) pressure drag, after Niskanen (OpenRocket
      // technical documentation eq. 3.86, following Hoerner): Cd = 0.8·sin²φ referenced to the
      // frontal-area *increase*, where φ is the conical joint angle. A smooth/gentle shoulder
      // (small φ) drags little; an abrupt step (φ→90°) approaches the 0.8 stagnation value. A
      // contracting transition (boattail) is not added here — its dominant effect is the reduced
      // base area, already captured above. Not compressibility-corrected (valid at low subsonic,
      // per the source); transonic flights are already flagged as extrapolated.
      if (c.length > 0 && c.foreRadius >= 0 && c.aftRadius > c.foreRadius) {
        const phi = Math.atan2(c.aftRadius - c.foreRadius, c.length);
        const dA = Math.PI * (c.aftRadius * c.aftRadius - c.foreRadius * c.foreRadius);
        shoulderPressureCdA += 0.8 * Math.sin(phi) ** 2 * dA;
      }
      // Boattail (diameter-decreasing transition) pressure drag, after Niskanen (eq. 3.88): the
      // base-drag coefficient acting over the frontal-area *reduction*, scaled by a length-to-
      // height interpolation — full base drag for an abrupt contraction (γ ≤ 1, ≈ a 27° cone),
      // fading to nothing for a gentle one (γ ≥ 3, ≈ 9°). The base-area reduction itself is
      // already in the base-drag term (baseRadius follows the aft end); this adds only the slope's
      // own pressure drag, so a zero-length boattail nets to no change. The base coefficient is
      // Mach-dependent, so only the geometry factor f·ΔA is precomputed here.
      if (c.length > 0 && c.aftRadius >= 0 && c.foreRadius > c.aftRadius) {
        const gamma = c.length / (2 * (c.foreRadius - c.aftRadius));
        const f = gamma <= 1 ? 1 : gamma >= 3 ? 0 : (3 - gamma) / 2;
        boattailPressureArea += f * Math.PI * (c.foreRadius * c.foreRadius - c.aftRadius * c.aftRadius);
      }
    } else if (c.kind === "trapezoidfinset") {
      const area = ((c.rootChord + c.tipChord) / 2) * c.height;
      finWetted += 2 * area * c.finCount;
      finCount = Math.max(finCount, c.finCount);
      finThickness = Math.max(finThickness, c.thickness);
      meanFinChord = (c.rootChord + c.tipChord) / 2;
      finSpan = Math.max(finSpan, c.height);
      finSweepLength = c.sweepLength;
      noteFinEdge(c.crossSection);
    } else if (c.kind === "ellipticalfinset" || c.kind === "freeformfinset") {
      finWetted += 2 * c.area * c.finCount;
      finCount = Math.max(finCount, c.finCount);
      finThickness = Math.max(finThickness, c.thickness);
      meanFinChord = c.height > 0 ? c.area / c.height : c.rootChord;
      finSpan = Math.max(finSpan, c.height);
      finSweepLength = c.sweepLength;
      noteFinEdge(c.crossSection);
    } else if ((c.kind === "launchlug" || c.kind === "railbutton") && c.radius && c.radius > 0) {
      const count = Math.max(1, c.instanceCount ?? 1);
      protuberanceArea += count * Math.PI * c.radius * c.radius;
    }
  }

  const refArea = Math.PI * rRef * rRef;
  // Nose fineness = length / diameter; slender ⇒ far less wave drag. Default to a moderate
  // ogive when the design has no nose cone (a reduced or tube-only vehicle).
  const noseDiameter = 2 * (noseBaseRadius > 0 ? noseBaseRadius : rRef);
  const noseFineness = haveNose && noseDiameter > 0 ? noseLength / noseDiameter : 3;
  // Fin leading-edge sweep Λ (from the tip's aft offset over the span): supersonic fin wave
  // drag falls with cos²Λ as the leading edge sweeps back behind the Mach cone.
  const sweepAngle = finSpan > 0 ? Math.atan2(finSweepLength, finSpan) : 0;
  const cosL = Math.cos(sweepAngle);
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
    finCrossSection: finEdgeRank < 0 ? "square" : (["airfoil", "rounded", "square"] as const)[finEdgeRank],
    roughness: roughness || FINISH_ROUGHNESS.unfinished,
    noseFineness: Math.max(0.5, noseFineness),
    noseShapeFactor,
    finSweepFactor: clamp(cosL * cosL, 0.35, 1),
    protuberanceArea,
    shoulderPressureCdA,
    boattailPressureArea,
    nosePressureCdA,
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

/** Skin-friction coefficient of a flat plate at Reynolds number Re with a roughness floor. A
 *  rocket's boundary layer is treated as fully turbulent — tripped near the nose by the surface
 *  finish, joints, and fins — so a fully-turbulent flat-plate correlation is used across the whole
 *  Reynolds range. A laminar 1.328/√Re branch (valid only for an idealised smooth plate below the
 *  transition Reynolds) would UNDER-state friction at the low Reynolds numbers a small, slow rocket
 *  sees for much of its flight, which is where the coast-drag error showed up against OpenRocket's
 *  stored per-step drag. The turbulent assumption is the standard one for rocket drag (Barrowman;
 *  the OpenRocket technical documentation, Niskanen). */
export function skinFriction(re: number, roughness: number, length: number, mach: number): number {
  // Fully-turbulent flat plate (Prandtl–Schlichting), with a constant floor below Re 1e4 (which is
  // only ~0.5 m/s — a negligible dynamic pressure). No laminar branch, by design.
  const cf = re < 1e4 ? 1.48e-2 : 0.455 / Math.pow(Math.log10(re), 2.58);
  // Roughness floor: past a critical Reynolds number a rough surface's friction stops falling. This
  // holds friction flat at high Re where it exceeds the smooth value, while the smooth turbulent
  // value climbs above it at low Re — the crossover that makes a small rocket's coast drag rise as
  // it slows, matching OpenRocket. (Referenced to the wetted area by the caller.)
  let cfWithFloor = cf;
  if (roughness > 0 && length > 0) {
    const cfRough = 0.032 * Math.pow(roughness / length, 0.2);
    cfWithFloor = Math.max(cf, cfRough);
  }
  // Compressibility correction for a turbulent boundary layer (reference-temperature /
  // Frankl–Voishel approximation, adiabatic wall). Monotonically decreasing and ALWAYS
  // positive — unlike a naive (1 − kM²) factor, which turns friction negative past ~M3.
  return cfWithFloor / Math.pow(1 + 0.144 * mach * mach, 0.65);
}

/** Zero-lift drag coefficient at a flight state. */
export function dragCoefficient(
  geom: AeroGeometry,
  atm: AtmosphereState,
  velocity: number,
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

  // Base drag. Subsonic it rises with the square of Mach; supersonic the base pressure recovers
  // and it falls as ~1/M (Hoerner). The two branches meet continuously at M=1 (both 0.25).
  // Referenced to the base area, then the reference area. It is NOT reduced while the motor burns:
  // OpenRocket's stored per-step drag shows the full base drag throughout boost (the Niskanen model
  // applies it to the whole base regardless of thrust), and for a body much wider than its motor
  // the exhaust fills only a small part of the base — so a blanket boost reduction badly
  // under-drags a large-body / small-motor design (it read ~6× low on a 195 mm body flying a 54 mm
  // motor). Applying the subsonic form supersonically — as a naive model does — makes base drag
  // (and total Cd) grow without bound, which is wrong; the 1/M branch avoids that.
  const baseCoeff = mach <= 1 ? 0.12 + 0.13 * mach * mach : 0.25 / mach;
  const base = baseCoeff * (geom.baseArea / geom.refArea);

  // Fin edge pressure drag, set by the fin's edge cross-section — the term that dominates a finned
  // model rocket's pressure drag and that a thickness-only model badly under-counts. A SQUARE edge
  // stagnates the flow head-on at the leading edge (stagnation-pressure Cd ≈ 0.85 subsonic, reduced
  // by LE sweep as cos²Λ) and leaves a blunt trailing-edge base (base-drag Cd, no sweep); a ROUNDED
  // edge halves both; an AIRFOIL is streamlined, leaving only the small transonic compressibility
  // rise. Referenced to the fin frontal area (N · thickness · span) over the reference area. Model
  // and coefficients from the OpenRocket technical documentation (Niskanen), after Hoerner,
  // *Fluid-Dynamic Drag*.
  const finEdge = geom.finFrontalArea / geom.refArea;
  const leCompress = Math.pow(Math.max(0.01, 1 - Math.min(mach, 0.99) ** 2), -0.417) - 1;
  let finLeCoeff: number; // leading-edge stagnation
  let finTeCoeff: number; // trailing-edge base
  switch (geom.finCrossSection) {
    case "airfoil":
      finLeCoeff = leCompress;
      finTeCoeff = 0;
      break;
    case "rounded":
      finLeCoeff = 0.5 * stagnationCd(mach);
      finTeCoeff = 0.5 * baseCoeff;
      break;
    default: // square (also the default when no cross-section is named)
      finLeCoeff = stagnationCd(mach);
      finTeCoeff = baseCoeff;
  }
  const finPressure = (finLeCoeff * geom.finSweepFactor + finTeCoeff) * finEdge;

  // Parasitic drag of the external fittings (launch lugs, rail buttons) from their own frontal
  // area rather than a blind allowance, plus a small flat residual for un-modelled hardware
  // (joints, screw heads), with a mild Prandtl–Glauert amplification (bounded below M_crit).
  // C_PROTUBERANCE is an axial fitting's pressure-drag coefficient on its frontal circle, reduced
  // for sitting in the body boundary layer (Hoerner protuberance drag; the model-rocket launch-lug
  // literature) — small on a slender HPR body, but a real contributor on a small model rocket
  // where the lug is large relative to the airframe.
  const protuberance = C_PROTUBERANCE * (geom.protuberanceArea / geom.refArea);
  const pg = 1 / Math.sqrt(Math.max(0.19, 1 - Math.min(mach, 0.9) * Math.min(mach, 0.9)));
  // Shoulder pressure drag is a low-subsonic stagnation effect (flow separation at the step), so
  // it is NOT Prandtl-corrected — added flat, per the source. Zero for a plain/boattailed body.
  const shoulderPressure = geom.shoulderPressureCdA / geom.refArea;
  // Boattail pressure drag rides on the base-drag coefficient (its Mach dependence, sub- and
  // supersonic, is carried by baseCoeff), scaled by the precomputed slope geometry factor. Zero
  // for a plain/shouldered body.
  const boattailPressure = (baseCoeff * geom.boattailPressureArea) / geom.refArea;
  // Nose pressure drag — same low-subsonic separation effect as the shoulder, so added flat. Zero
  // for a tangent (ogive/ellipsoid/Haack) nose; small for a cone or blunt shape.
  const nosePressure = geom.nosePressureCdA / geom.refArea;
  const pressure =
    finPressure + shoulderPressure + boattailPressure + nosePressure + (protuberance + 0.01) * pg;

  // Wave (compressibility) drag — zero below the critical Mach, a transonic rise to a peak
  // near M≈1.15, then a supersonic decline. A bounded, published-shape model (not a
  // per-geometry CFD result): the peak scales with fin thickness and body bluntness.
  const wave = waveDrag(geom, mach);

  // Clamp the total to a physical ceiling. No nose-forward rocket has a zero-lift Cd anywhere
  // near this — even a stubby, rough, big-finned design stays under ~3 — so the clamp never
  // touches a real flight. It only engages on malformed geometry (e.g. a unit-scale import
  // error inflating a dimension), where an astronomically large Cd would otherwise make the
  // fixed-step integrator go unstable and report a nonsensical apogee instead of degrading.
  const cd = Math.min(friction + base + pressure + wave, MAX_CD0);
  return { cd, friction, base, pressure, wave, extrapolated: mach > 0.8 };
}

/** Stagnation-pressure drag coefficient of a blunt (square) edge facing the flow, after base-
 *  pressure recovery: ≈ 0.85 in incompressible flow, rising toward transonic. From the OpenRocket
 *  technical documentation (Niskanen), after Hoerner. Used for a square fin leading edge. */
function stagnationCd(mach: number): number {
  const m = Math.min(mach, 1);
  return 0.85 * (1 + (m * m) / 4 + (m * m * m * m) / 40);
}

/** Physical ceiling on the zero-lift drag coefficient — a numerical guard, not a model term. */
const MAX_CD0 = 10;

const M_CRIT = 0.8;
const M_PEAK = 1.15;

/** Pressure-drag coefficient of an axial external fitting (launch lug, rail button) referenced
 *  to its own frontal area. A blunt rim in freestream would be ~1; halved here because the
 *  fitting sits low in the body's boundary layer where the local dynamic pressure is reduced. */
const C_PROTUBERANCE = 0.5;

/** Transonic/supersonic wave-drag coefficient (referenced to the reference area). Zero below
 *  M_CRIT; a smooth rise to a peak at M_PEAK, then a supersonic decline toward a slender-body
 *  plateau. The peak height is geometry-driven: the forebody term scales with the nose's own
 *  fineness (slender ⇒ less) and its contour shape (Von Kármán lowest, cone highest), and the
 *  fin term with fin thickness ratio reduced by leading-edge sweep (cos²Λ). This is a bounded
 *  parametric estimate of the transonic hump, not a per-geometry wave-drag solution. */
function waveDrag(geom: AeroGeometry, mach: number): number {
  if (mach <= M_CRIT) return 0;
  // Forebody wave drag falls with nose fineness (~1/fn transonic trend) and rises with the
  // contour's shape factor; fins add their thickness drag, cut by leading-edge sweep.
  const noseTerm = (geom.noseShapeFactor * 0.6) / geom.noseFineness;
  const finTerm = 2.0 * Math.max(0, geom.finThicknessRatio) * geom.finSweepFactor;
  const peak = clamp(noseTerm + finTerm + 0.05, 0.12, 1.2);
  if (mach <= M_PEAK) {
    const t = (mach - M_CRIT) / (M_PEAK - M_CRIT); // 0→1
    return peak * t * t * (3 - 2 * t); // smoothstep rise
  }
  return peak * Math.sqrt(M_PEAK / mach); // supersonic decline
}
