/** Fin flutter: an estimate of the airspeed at which a fin's own elasticity lets it flutter —
 *  a torsional/bending oscillation that, past the flutter boundary, diverges and shreds the fin.
 *  It is a leading cause of fin (and rocket) loss on fast flights, and neither OpenRocket nor
 *  RockSim reports it, so Loft flags it as a safety heuristic.
 *
 *  Method: the simplified flutter-boundary closed form derived from NACA TN 4197 (Martin, 1958,
 *  "Summary of Flutter Experiences as a Guide to the Preliminary Design of Lifting Surfaces on
 *  Missiles"), as popularised for rocketry by Apogee's "Peak of Flight" newsletter #291. In SI,
 *  with the shear modulus G and the ambient pressure P in the same units (Pa):
 *
 *    Vf = a · √( G / [ 1.337 · AR³ · P · (λ + 1) / ( 2 · (AR + 2) · (t/c)³ ) ] )
 *
 *  where a is the local speed of sound, AR = b²/S the exposed-fin aspect ratio (semi-span b,
 *  one-fin planform area S), λ = ct/cr the taper ratio, and t/c the thickness ratio on the root
 *  chord. Vf rises with the cube of the thickness ratio and the square root of G, and falls with
 *  aspect ratio — the classic "thin, high-aspect fins flutter first" behaviour.
 *
 *  This is a preliminary-design estimate, method-dependent to roughly ±20% (the full TN 4197
 *  method, which adds a chordwise mass-balance term, tends to sit a little lower). The rocketry
 *  convention is therefore to keep a healthy margin — a flutter speed comfortably above the peak
 *  airspeed — rather than to trust the number to the metre. Loft reports the margin and cautions
 *  when it is thin; it never reports "flutter-safe". */

import type { Rocket, Material, TrapezoidFinSet, GenericFinSet } from "../model/types";
import { flattenRocket } from "../model/geometry";
import type { Atmosphere } from "./atmosphere";

/** Recommended minimum flutter margin (flutter speed ÷ peak airspeed). Below this the fins are
 *  cautioned; the rocketry rule of thumb is 1.5× or more (Apogee suggests up to 2× given the
 *  method's spread). */
export const RECOMMENDED_FLUTTER_MARGIN = 1.5;

/** Fin material shear moduli (Pa), for the flutter estimate. Matched against the design's own
 *  material name; the values are representative engineering figures for the common fin stocks.
 *  Ordered so the more specific patterns win (carbon/aluminium before the generic composites). */
interface ShearEntry {
  pattern: RegExp;
  g: number;
  label: string;
}
const SHEAR_MODULI: ShearEntry[] = [
  { pattern: /carbon/i, g: 5.0e9, label: "carbon fibre" },
  { pattern: /alumin/i, g: 26e9, label: "aluminium" },
  { pattern: /titanium/i, g: 44e9, label: "titanium" },
  { pattern: /phenolic/i, g: 1.4e9, label: "phenolic" },
  { pattern: /g-?10|fr-?4|fibregla|fibergla|glass|frp/i, g: 3.0e9, label: "G10 fibreglass" },
  { pattern: /birch|plywood|\bply\b/i, g: 0.62e9, label: "plywood" },
  { pattern: /basswood/i, g: 0.17e9, label: "basswood" },
  { pattern: /balsa/i, g: 0.09e9, label: "balsa" },
  { pattern: /acrylic|plexi|pmma/i, g: 1.15e9, label: "acrylic" },
  { pattern: /polycarb|lexan/i, g: 0.79e9, label: "polycarbonate" },
  { pattern: /\bpla\b/i, g: 1.09e9, label: "PLA" },
  { pattern: /\babs\b/i, g: 0.8e9, label: "ABS" },
  { pattern: /delrin|acetal|\bpom\b/i, g: 1.0e9, label: "acetal" },
  { pattern: /cardboard|cardstock|kraft|\bpaper\b/i, g: 0.02e9, label: "cardboard" },
];

/** G10 fibreglass — by far the most common high-power fin material — is assumed when the design
 *  names no material, or one we don't recognise, so the estimate still has a defensible stiffness. */
const DEFAULT_SHEAR = 3.0e9;
const DEFAULT_LABEL = "G10 fibreglass";

export interface ShearModulus {
  /** Shear modulus (Pa). */
  g: number;
  /** The material the value represents (the design's own name when recognised). */
  label: string;
  /** True when the material couldn't be identified and the default (G10) was assumed. */
  assumed: boolean;
}

/** Resolve a fin material to a shear modulus, falling back to G10 fibreglass when unknown. */
export function shearModulusFor(material?: Material): ShearModulus {
  const name = material?.name?.trim();
  if (name) {
    for (const e of SHEAR_MODULI) {
      if (e.pattern.test(name)) return { g: e.g, label: name, assumed: false };
    }
  }
  return { g: DEFAULT_SHEAR, label: name ? `${name} (assumed ${DEFAULT_LABEL})` : DEFAULT_LABEL, assumed: true };
}

/** The simplified NACA TN 4197 flutter velocity (m/s) for a trapezoidal fin, all SI. Returns
 *  Infinity for a degenerate fin (no thickness, area, or chord) — i.e. no flutter constraint. */
export function finFlutterVelocity(p: {
  rootChord: number;
  tipChord: number;
  semiSpan: number;
  thickness: number;
  shearModulus: number;
  pressure: number;
  speedOfSound: number;
}): number {
  const { rootChord: cr, tipChord: ct, semiSpan: b, thickness: t, shearModulus: g, pressure: P, speedOfSound: a } = p;
  const area = 0.5 * (cr + ct) * b; // one exposed fin's planform area
  if (!(area > 0) || !(t > 0) || !(cr > 0) || !(b > 0) || !(P > 0) || !(g > 0)) return Infinity;
  const ar = (b * b) / area; // = 2b/(cr+ct), the exposed-fin aspect ratio
  const lambda = ct / cr; // taper ratio (0 for a delta, 1 for a rectangle)
  const tc = t / cr; // thickness ratio on the root chord
  const denom = (1.337 * ar * ar * ar * P * (lambda + 1)) / (2 * (ar + 2) * tc * tc * tc);
  return a * Math.sqrt(g / denom);
}

/** The fin thickness (m) that would lift a fin set from its current flutter margin to a target one —
 *  the actionable answer behind the "thicken the fins" caution. Closed-form: the flutter speed rises
 *  with the 1.5 power of the thickness ratio (Vf ∝ (t/c)^1.5), and the peak airspeed the margin is
 *  taken against barely moves with thickness, so margin ∝ t^1.5 and
 *      t_target = t_now · (margin_target / margin_now)^(2/3).
 *  It errs slightly thick — a thicker fin also drags a little more and lowers the peak airspeed, so
 *  the true margin comes out a touch above the target — which is the safe direction for a fin caution.
 *  Returns t_now unchanged when the margin already meets the target or the inputs are degenerate. */
export function thicknessForFlutterMargin(
  currentThickness: number,
  currentMargin: number,
  targetMargin: number,
): number {
  if (!(currentThickness > 0) || !(currentMargin > 0) || !(targetMargin > currentMargin)) {
    return currentThickness;
  }
  return currentThickness * Math.pow(targetMargin / currentMargin, 2 / 3);
}

/** The root chord, tip chord, span, and thickness a fin set presents to the flutter estimate.
 *  A generic (elliptical/freeform) set is reduced to its equal-area, equal-span trapezoid — the
 *  same reduction the aerodynamics uses for the normal-force slope. */
function finDims(
  fin: TrapezoidFinSet | GenericFinSet,
): { cr: number; ct: number; b: number; t: number } | undefined {
  const b = fin.height;
  const t = fin.thickness;
  if (!(b > 0) || !(t > 0)) return undefined;
  if (fin.kind === "trapezoidfinset") {
    return { cr: fin.rootChord, ct: fin.tipChord, b, t };
  }
  const cr = fin.rootChord;
  const meanChord = fin.area / b;
  const ct = Math.max(0, 2 * meanChord - cr);
  return { cr, ct, b, t };
}

export interface FinFlutter {
  /** The fin set's name (or "fins"). */
  finName: string;
  /** The fin set's thickness (m) — the design lever the flutter fix works on. */
  thickness: number;
  /** Estimated flutter speed at the worst-case (lowest-margin) point of the ascent (m/s). */
  flutterVelocity: number;
  /** The airspeed at that worst-case point (m/s). */
  velocity: number;
  /** Altitude AGL at that point (m). */
  altitude: number;
  /** flutterVelocity ÷ velocity there — the flutter margin (dimensionless). */
  margin: number;
  /** Shear modulus used (Pa) and where it came from. */
  shearModulus: number;
  material: string;
  /** True when the material was not recognised and G10 was assumed. */
  assumedMaterial: boolean;
}

export interface FlutterReport {
  /** The fin set with the lowest flutter margin — the binding constraint. */
  worst: FinFlutter;
  /** Every fin set analysed (one for most designs). */
  finSets: FinFlutter[];
}

type AscentSample = { velocity: number; altitude: number; phase: string };

/** Estimate each fin set's flutter margin over the ascent and return the worst (lowest-margin)
 *  point, sampling the flutter speed against the real ambient pressure and speed of sound at each
 *  altitude the vehicle passes through. Flutter is an ascent (high-speed) concern, so descent and
 *  landed samples are ignored. Returns undefined when the design has no fins with a usable
 *  thickness, or never moves. */
export function analyzeFlutter(
  rocket: Rocket,
  trajectory: AscentSample[],
  atmosphere: Atmosphere,
  groundAltitudeMsl: number,
): FlutterReport | undefined {
  const finSets = flattenRocket(rocket)
    .map((p) => p.component)
    .filter(
      (c): c is TrapezoidFinSet | GenericFinSet =>
        c.kind === "trapezoidfinset" || c.kind === "ellipticalfinset" || c.kind === "freeformfinset",
    );
  if (!finSets.length) return undefined;

  const results: FinFlutter[] = [];
  for (const fin of finSets) {
    const dims = finDims(fin);
    if (!dims) continue;
    const sm = shearModulusFor(fin.material);
    let worst: FinFlutter | undefined;
    for (const s of trajectory) {
      if (s.phase === "descent" || s.phase === "landed") continue; // flutter is an ascent concern
      if (!(s.velocity > 1)) continue;
      const atm = atmosphere.sample(groundAltitudeMsl + s.altitude);
      const vf = finFlutterVelocity({
        rootChord: dims.cr,
        tipChord: dims.ct,
        semiSpan: dims.b,
        thickness: dims.t,
        shearModulus: sm.g,
        pressure: atm.pressure,
        speedOfSound: atm.speedOfSound,
      });
      if (!Number.isFinite(vf)) continue;
      const margin = vf / s.velocity;
      if (!worst || margin < worst.margin) {
        worst = {
          finName: fin.name || "fins",
          thickness: dims.t,
          flutterVelocity: vf,
          velocity: s.velocity,
          altitude: s.altitude,
          margin,
          shearModulus: sm.g,
          material: sm.label,
          assumedMaterial: sm.assumed,
        };
      }
    }
    if (worst) results.push(worst);
  }
  if (!results.length) return undefined;
  const worst = results.reduce((a, b) => (b.margin < a.margin ? b : a));
  return { worst, finSets: results };
}
