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

import type {
  Rocket,
  TrapezoidFinSet,
  GenericFinSet,
  TubeFinSet,
  FinCrossSection,
  SurfaceFinish,
} from "../model/types";
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
    } else if (c.kind === "tubefinset") {
      contributions.push(tubeFinContribution(c, p, rRef));
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

/** Normal-force slope and CP of a tube-fin set.
 *
 *  A tube fin is not a plate, so the Barrowman fin equations don't apply to it. It is a short
 *  open duct: at a small angle of attack the streamtube it captures enters inclined at α and
 *  leaves aligned with the tube's (and so the rocket's) axis. Slender-body/momentum theory — the
 *  same theory behind Barrowman's nose and transition terms — gives the reaction from that
 *  turning as N = ρV²·A_duct·α, i.e.
 *
 *      C_Nα = 2 · A_duct / A_ref   per radian,   A_duct = Σ N·π·r_i²
 *
 *  which is exactly the nose-cone form 2·(A_base/A_ref) with the captured area in place of the
 *  base area. The turning is distributed along the duct rather than concentrated at either lip,
 *  so the resultant is taken at the tube's mid-chord — the symmetric, non-extremal choice.
 *  Against OpenRocket's stored per-step CP on its own tube-fin example this lands ≈0.9 caliber
 *  FORWARD of theirs (Loft 0.7 cal margin vs 1.6 cal), i.e. on the conservative side; the
 *  limitations log records that residual rather than tuning it away.
 *
 *  References: slender-body normal force of a flow-through duct (Nielsen, *Missile Aerodynamics*,
 *  inlet/duct additive normal force); Barrowman 1967 for the surrounding method. Implemented
 *  clean-room from the published relations. */
function tubeFinContribution(fin: TubeFinSet, p: Positioned, rRef: number): CpContribution {
  const ri = Math.max(0, fin.outerRadius - fin.thickness);
  // A degenerate set (no tubes, no bore, no length) captures nothing and carries no normal force.
  if (!(fin.finCount > 0) || !(ri > 0) || !(fin.length > 0) || !(rRef > 0)) {
    return { source: fin.name || "tube fins", cnAlpha: 0, x: p.xFore };
  }
  const ductArea = fin.finCount * Math.PI * ri * ri;
  const cnA = (2 * ductArea) / (Math.PI * rRef * rRef);
  return { source: fin.name || "tube fins", cnAlpha: cnA, x: p.xFore + fin.length / 2 };
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
    // Reduce the elliptical/freeform planform to an equivalent trapezoid (same area & span) for
    // the normal-force slope. The chordwise CP is handled exactly for the elliptical case below.
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

  // Chordwise CP from the fin root leading edge.
  let xf: number;
  if (fin.kind !== "trapezoidfinset" && fin.cpChord !== undefined && fin.cpChord > 0) {
    // A freeform fin carries the exact chordwise CP measured from its actual outline at import
    // (Barrowman strip theory), so use it rather than the equal-area trapezoid below.
    xf = fin.cpChord;
  } else if (fin.kind === "ellipticalfinset") {
    // A half-ellipse fin's CP is not the equal-area trapezoid's. Integrating the Barrowman
    // quarter-chord aerodynamic centre over the elliptical chord distribution c(y)=cr·√(1−(y/s)²)
    // — with each section's AC at its own quarter-chord and the local lift ∝ chord — gives
    //   x̄ = cr/2 − ¼·(8/3π)·cr = (½ − 2/3π)·cr ≈ 0.288·cr  from the root leading edge.
    // That is further aft than reducing the planform to an equal-area trapezoid (≈0.20·cr), which
    // placed the CP too far forward and so under-predicted stability. Barrowman (integrated for the
    // elliptical planform); the same 0.288·cr an independent 6-DOF engine (RocketPy) uses.
    xf = (0.5 - 2 / (3 * Math.PI)) * root;
  } else {
    const denom = root + tip;
    xf =
      denom > 0
        ? (sweep / 3) * ((root + 2 * tip) / denom) +
          (1 / 6) * (root + tip - (root * tip) / denom)
        : fin.rootChord / 2;
  }
  return { source: fin.name || "fins", cnAlpha: cnA, x: p.xFore + xf };
}

// --- drag ----------------------------------------------------------------------------

/** A wetted area (m²) and the roughness height (m) of the finish it carries. */
export interface WettedSurface {
  roughness: number;
  area: number;
}

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
  /** Fins in the largest single fin set (a representative count; not the design's total when fins
   *  are split across sets). Fin frontal and wetted areas are summed over all sets separately. */
  finCount: number;
  /** Fin thickness (m), for leading-edge pressure drag. */
  finThickness: number;
  /** Total exposed fin frontal area (m²), summed over every fin set as Σ (fins · thickness · span)
   *  — so a design that splits its fins across several single-fin sets is counted in full. */
  finFrontalArea: number;
  /** The same frontal area, split by the edge cross-section each set actually carries. This is what
   *  the pressure build-up reads: a fin's edge drag is a property of that fin's edge, so a set is
   *  charged for the section it has and for no other.
   *
   *  It used to be one design-wide `finCrossSection` — the DRAGGIEST section present — applied to
   *  every set's area. Measured across the corpus: `Show-off.CDX1` has an airfoil set and a square
   *  set and billed both as square; `03.Three-stage.ork` has three rounded sets among five and
   *  billed all five as square, which took its whole drag coefficient at 100 m/s from 1.1745 to
   *  0.7453 (pressure term 0.6843 to 0.2552). That design was flying 7.57% LOW on apogee and now
   *  flies 10.76% HIGH — its own KNOWN_ISSUES entry carries both figures and the reason, which is
   *  that its sweep collapse was partly cancelling its cross-section one. Nothing
   *  changes for a design whose sets agree. Counted across the 35-design corpus: 20 carry exactly
   *  one fin set and 2 carry none; of the 13 with several, only 7 mix sections. So 28 of 35 are
   *  bit-identical either way, including both designs an earlier area-weighted attempt regressed.
   *
   *  Sums to `finFrontalArea`. */
  finFrontalByEdge: Record<FinCrossSection, number>;
  /** Draggiest fin edge cross-section present (square > rounded > airfoil). Reporting only now that
   *  the build-up reads `finFrontalByEdge`: it answers "what is the bluntest edge on this rocket",
   *  which is a fair thing to say about a design, and not "what is every fin charged for", which it
   *  is not. Square when the design has fins but names no cross-section — OpenRocket's own default. */
  finCrossSection: FinCrossSection;
  /** Wetted-area-weighted mean roughness height (m) — a representative figure for reporting and
   *  for the tube-fin term. The friction buildup itself does NOT use it; it sums per surface
   *  (`bodyWettedByFinish` / `finWettedByFinish`), because skin friction is a property of each
   *  surface, not of the airframe as a whole. */
  roughness: number;
  /** Body wetted area (m²) split by the roughness of the finish that surface actually carries.
   *  Sums to `bodyWettedArea`. A design commonly mixes finishes — a polished airframe with one
   *  unpainted coupler, a filled nose on a bare tube — and charging the whole rocket the roughest
   *  one over-drags it badly: on a real polished 33 mm model whose 25 mm of body tube is left
   *  "normal", it inflated the coefficient by ~0.14, about 30% of the total. */
  bodyWettedByFinish: WettedSurface[];
  /** Fin wetted area (m²) split the same way. Sums to `finWettedArea`. */
  finWettedByFinish: WettedSurface[];
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
  /** Total wetted area of every tube fin (m²), inner + outer wall. Zero on a design without them.
   *  Kept apart from `finWettedArea` because a tube fin is a duct, not a plate: it carries no
   *  thickness form factor and its Reynolds number runs on its own (short) chord. */
  tubeFinWettedArea: number;
  /** Total square-cut wall annulus area of every tube fin (m²), Σ N·π(r_o² − r_i²) — the frontal
   *  area presented at the leading edge and the base area left at the trailing edge. */
  tubeFinAnnulusArea: number;
  /** Wetted-area-weighted mean tube-fin chord (m) — the Reynolds and roughness length for the
   *  tube-fin friction term. Zero on a design without them. */
  tubeFinChord: number;
  /** Roughness height (m) of the tube fins' own finish. Zero on a design without them. */
  tubeFinRoughness: number;
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
  // Wetted area banked against the roughness of the finish each surface actually carries. Skin
  // friction is a property of a surface, not of the airframe, so a design that mixes finishes —
  // the common case — is summed term by term rather than charged the roughest one throughout.
  const bodyByFinish = new Map<number, number>();
  const finByFinish = new Map<number, number>();
  const bank = (m: Map<number, number>, k: number, a: number): void => {
    if (a > 0) m.set(k, (m.get(k) ?? 0) + a);
  };
  /** The roughness a component's own finish implies, falling back to the design default. */
  const roughOf = (c: { finish?: SurfaceFinish }): number =>
    (c.finish && FINISH_ROUGHNESS[c.finish]) || FINISH_ROUGHNESS.unfinished;

  let finWetted = 0;
  let finCount = 0;
  let finThickness = 0;
  let meanFinChord = 0;
  let finSpan = 0;
  let finSweepLength = 0;
  // Fin edge frontal area (Σ fins · thickness · span), summed per set rather than derived from a
  // single representative set. A design that models its N fins as N separate single-fin sets — a
  // common OpenRocket pattern — would otherwise have its fin pressure drag counted from just one
  // fin (see the multi-set note below).
  let finFrontal = 0;
  // The same frontal area, banked by the cross-section each set actually carries — which is what
  // the pressure build-up charges. A fin set that names none is square (the OpenRocket default).
  const finFrontalByEdge: Record<FinCrossSection, number> = { airfoil: 0, rounded: 0, square: 0 };
  // And, for reporting only, the bluntest edge on the rocket. Rank square > rounded > airfoil.
  let finEdgeRank = -1;
  const EDGE_RANK: Record<FinCrossSection, number> = { airfoil: 0, rounded: 1, square: 2 };
  const noteFinEdge = (cs: FinCrossSection | undefined, frontal: number): void => {
    const edge = cs ?? "square";
    finEdgeRank = Math.max(finEdgeRank, EDGE_RANK[edge]);
    finFrontalByEdge[edge] += frontal;
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

  let tubeFinWetted = 0;
  let tubeFinRough = 0;
  let tubeFinAnnulus = 0;
  let tubeFinChordWeight = 0; // Σ (wetted · chord), for the wetted-weighted mean chord below

  let aftBodyEnd = 0;
  for (const p of flat) {
    const c = p.component;
    if (c.kind === "nosecone") {
      bodyLength += c.length;
      {
        const w = noseProps(c.shape, c.length, c.aftRadius, c.shapeParameter ?? 0).wettedArea;
        bodyWetted += w;
        bank(bodyByFinish, roughOf(c), w);
      }
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
      {
        const w = 2 * Math.PI * c.outerRadius * c.length;
        bodyWetted += w;
        bank(bodyByFinish, roughOf(c), w);
      }
      if (p.xFore + c.length > aftBodyEnd) {
        aftBodyEnd = p.xFore + c.length;
        baseRadius = c.outerRadius;
      }
    } else if (c.kind === "transition") {
      bodyLength += c.length;
      {
        const w = transitionProps(c.shape, c.length, c.foreRadius, c.aftRadius, c.shapeParameter ?? 0).wettedArea;
        bodyWetted += w;
        bank(bodyByFinish, roughOf(c), w);
      }
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
      bank(finByFinish, roughOf(c), 2 * area * c.finCount);
      const frontal = c.finCount * c.thickness * c.height;
      finFrontal += frontal;
      finCount = Math.max(finCount, c.finCount);
      finThickness = Math.max(finThickness, c.thickness);
      meanFinChord = (c.rootChord + c.tipChord) / 2;
      finSpan = Math.max(finSpan, c.height);
      finSweepLength = c.sweepLength;
      noteFinEdge(c.crossSection, frontal);
    } else if (c.kind === "ellipticalfinset" || c.kind === "freeformfinset") {
      finWetted += 2 * c.area * c.finCount;
      bank(finByFinish, roughOf(c), 2 * c.area * c.finCount);
      const frontal = c.finCount * c.thickness * c.height;
      finFrontal += frontal;
      finCount = Math.max(finCount, c.finCount);
      finThickness = Math.max(finThickness, c.thickness);
      meanFinChord = c.height > 0 ? c.area / c.height : c.rootChord;
      finSpan = Math.max(finSpan, c.height);
      // Leading-edge sweep for the drag sweep factor. An elliptical fin is a half-ellipse whose tip
      // sits at mid-root-chord, so its leading edge sweeps back ~half the root chord over the span;
      // its stored sweepLength is 0, and treating that as an unswept (perpendicular) leading edge
      // over-counts the stagnation pressure drag — measured ~+22% on the fins of a heavily-finned
      // minimum-diameter design against OpenRocket's stored per-step Cd. A freeform fin's stored
      // sweepLength already reflects its actual outline, so use that.
      finSweepLength = c.kind === "ellipticalfinset" ? c.rootChord / 2 : c.sweepLength;
      noteFinEdge(c.crossSection, frontal);
    } else if (c.kind === "tubefinset") {
      // Tube fins are open-ended cylinders: the flow wets both the outer and the inner wall, and
      // the square-cut wall annulus faces the stream at each end. Both are accumulated here; the
      // drag pass turns them into friction and leading/trailing-edge pressure terms.
      const ro = c.outerRadius;
      const ri = Math.max(0, ro - c.thickness);
      if (c.finCount > 0 && ro > 0 && c.length > 0) {
        tubeFinWetted += c.finCount * 2 * Math.PI * (ro + ri) * c.length;
        tubeFinRough = roughOf(c);
        tubeFinAnnulus += c.finCount * Math.PI * (ro * ro - ri * ri);
        tubeFinChordWeight += c.finCount * 2 * Math.PI * (ro + ri) * c.length * c.length;
      }
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
  // A single representative roughness for reporting and for the tube-fin term: the wetted-area
  // weighted mean, which degenerates to the one value a uniformly-finished design carries.
  let roughWeighted = 0;
  let roughArea = 0;
  for (const [k, a] of [...bodyByFinish, ...finByFinish]) {
    roughWeighted += k * a;
    roughArea += a;
  }
  const weightedRoughness = roughArea > 0 ? roughWeighted / roughArea : FINISH_ROUGHNESS.unfinished;
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
    // Summed per set (finFrontal), so N fins split across N single-fin sets are counted in full.
    // For a design with one fin set this equals finCount·finThickness·finSpan, unchanged.
    finFrontalArea: finFrontal,
    finFrontalByEdge,
    finCrossSection: finEdgeRank < 0 ? "square" : (["airfoil", "rounded", "square"] as const)[finEdgeRank],
    roughness: weightedRoughness,
    bodyWettedByFinish: [...bodyByFinish].map(([roughness, area]) => ({ roughness, area })),
    finWettedByFinish: [...finByFinish].map(([roughness, area]) => ({ roughness, area })),
    noseFineness: Math.max(0.5, noseFineness),
    noseShapeFactor,
    finSweepFactor: clamp(cosL * cosL, 0.35, 1),
    protuberanceArea,
    shoulderPressureCdA,
    boattailPressureArea,
    nosePressureCdA,
    tubeFinWettedArea: tubeFinWetted,
    tubeFinAnnulusArea: tubeFinAnnulus,
    tubeFinChord: tubeFinWetted > 0 ? tubeFinChordWeight / tubeFinWetted : 0,
    tubeFinRoughness: tubeFinRough,
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

  // Body friction with a fineness form factor; fins with a thickness form factor. Each is summed
  // over the design's surfaces at the roughness of the finish that surface actually carries — a
  // component buildup, since skin friction belongs to a surface rather than to the airframe.
  // Charging every surface the roughest finish present over-drags the common mixed-finish design:
  // on a polished 33 mm model with 25 mm of "normal" body tube it added ~0.14 to a ~0.46
  // coefficient, and Loft read ~17% low on apogee against the file's own stored results.
  const fr = Math.max(2, geom.bodyFineness);
  const bodyForm = 1 + 60 / (fr * fr * fr) + 0.0025 * fr;
  const finForm = 1 + 2 * geom.finThicknessRatio;
  const frictionOver = (surfaces: WettedSurface[], form: number): number => {
    let total = 0;
    for (const sfc of surfaces) {
      total += skinFriction(re, sfc.roughness, geom.bodyLength, mach) * form * (sfc.area / geom.refArea);
    }
    return total;
  };
  const bodyFriction = frictionOver(geom.bodyWettedByFinish, bodyForm);
  const finFriction = frictionOver(geom.finWettedByFinish, finForm);
  // Tube fins: friction on both walls of a thin open cylinder. A thin-walled tube aligned with the
  // flow is aerodynamically a rolled-up flat plate — no thickness-driven pressure gradient — so it
  // takes NO form factor; its bluntness is carried explicitly by the wall-annulus terms below
  // (Hoerner, *Fluid-Dynamic Drag*, ch. 6). Its Reynolds number runs on its own chord, which is
  // much shorter than the airframe's, so it sits higher on the friction curve than the body does.
  let tubeFinFriction = 0;
  if (geom.tubeFinWettedArea > 0 && geom.tubeFinChord > 0) {
    const reTube = (atm.density * velocity * geom.tubeFinChord) / atm.dynamicViscosity;
    const cfTube = skinFriction(reTube, geom.tubeFinRoughness || geom.roughness, geom.tubeFinChord, mach);
    tubeFinFriction = cfTube * (geom.tubeFinWettedArea / geom.refArea);
  }
  const friction = bodyFriction + finFriction + tubeFinFriction;

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
  //
  // Accumulated PER SET, by the section each set actually carries. The published model is defined
  // for a fin set's own edge; applying it design-wide was the defect, not the model. Until
  // 2026-08-02 the whole fin frontal area was charged the DRAGGIEST section present, so one square
  // set made every airfoil and rounded set on the rocket pay square-edge stagnation drag. Measured:
  // `03.Three-stage.ork` (three rounded sets among five) total Cd 1.1745 → 0.7453 at 100 m/s;
  // `Show-off.CDX1` billed its airfoil set as square. Across 97 stored simulations on 35 real
  // designs every accuracy median improved or held; `03.Three-stage.ork` itself went from 7.57% low
  // on apogee to 10.76% high, which is recorded rather than glossed — see its KNOWN_ISSUES entry.
  // Unchanged wherever a design's sets agree, which is every single-set design and every multi-set
  // design using one section throughout.
  // The compressibility rise on a streamlined leading edge, and a bound on it that the model has
  // always needed and never had. Unbounded, this reaches 4.12 at the M0.99 clamp while a SQUARE
  // edge's stagnation coefficient caps at 1.06 — so above about M0.95 an airfoil fin was billed
  // more leading-edge drag than a blunt one, which is backwards. Measured on a real design's
  // geometry, total Cd by section: at M0.30 square 0.780 / rounded 0.474 / airfoil 0.451, correctly
  // ordered; at M1.20 square 2.216 / rounded 3.219 / airfoil 3.183, inverted. A flyer using the
  // cross-section what-if on a Mach design was told that streamlining the fins costs them apogee.
  //
  // The bound is the model's own claim rather than a new one: a stagnation face is the WORST case an
  // edge can present to the flow, so no streamlined edge may be charged more than one. It changes
  // nothing subsonically, where `leCompress` is far below `stagnationCd` (0.03 against 0.87 at
  // M0.30). This is not the wave-drag term and does not touch it; every flight past M0.8 is still
  // flagged extrapolated.
  const leCompress = Math.min(
    Math.pow(Math.max(0.01, 1 - Math.min(mach, 0.99) ** 2), -0.417) - 1,
    stagnationCd(mach),
  );
  const edgeCoeffs = (cs: FinCrossSection): { le: number; te: number } => {
    switch (cs) {
      case "airfoil":
        return { le: leCompress, te: 0 };
      case "rounded":
        // A radiused leading edge attaches the flow — there is no flat stagnation face — so
        // subsonically it carries no stagnation pressure drag, only the compressibility rise, the
        // same leading-edge term as an airfoil (Hoerner, edge/bluff-edge drag). Its rounded trailing
        // edge still sheds a wake, taken at half a square edge's base drag. (The earlier
        // half-stagnation leading edge over-counted a rounded fin's pressure drag ~2× against
        // OpenRocket's stored per-step Cd on its rounded-fin examples.)
        return { le: leCompress, te: 0.5 * baseCoeff };
      default: // square (also the default when no cross-section is named)
        return { le: stagnationCd(mach), te: baseCoeff };
    }
  };
  let finPressure = 0;
  for (const cs of ["airfoil", "rounded", "square"] as const) {
    const area = geom.finFrontalByEdge[cs];
    if (!(area > 0)) continue;
    const { le, te } = edgeCoeffs(cs);
    // `finSweepFactor` is still ONE angle for the whole design. Making it per-set was written and
    // measured in this same increment and REVERTED: it moved no census median in the right
    // direction (optimumDelay went back 2.5% → 2.7%) and it pushed a real design outside the
    // corpus's own agreement tolerance — the same shape as the area-weighted thickness attempt
    // before it. It is R7's next slice, with its own investigation, not a rider on this one.
    finPressure += (le * geom.finSweepFactor + te) * (area / geom.refArea);
  }

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
  // Tube-fin edge pressure drag. A tube fin's wall is cut square at both ends, so the same pair of
  // terms a square-edged flat fin gets applies to its wall annulus: stagnation at the leading edge
  // (unswept — a tube's lip is perpendicular to the flow, so no cos²Λ relief) and base drag on the
  // trailing edge. Referenced to the annulus area Σ N·π(r_o² − r_i²). This is the term that makes a
  // tube-fin design drag so much more than its plan area suggests: six body-diameter tubes present
  // roughly a third of the airframe's own frontal area in bare wall edges.
  const tubeFinPressure =
    (stagnationCd(mach) + baseCoeff) * (geom.tubeFinAnnulusArea / geom.refArea);
  const pressure =
    finPressure +
    tubeFinPressure +
    shoulderPressure +
    boattailPressure +
    nosePressure +
    (protuberance + 0.01) * pg;

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
