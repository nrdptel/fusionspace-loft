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

/** Fin material shear moduli (Pa), for the flutter estimate — each with the source it comes from.
 *
 *  **Every row carries a `source`, and rows that have none say so in it.** That is the point of the
 *  field. Until 2026-08-02 this table was fourteen uncited numbers described only as "representative
 *  engineering figures", while the METHOD consuming them cites NACA TN 4197 — a citation gap on the
 *  one output in this app that is a safety estimate. Chasing them established where they came from:
 *  they are round US-CUSTOMARY values (26e9 = 3.8e3 ksi, 44e9 = 6.2e3 ksi, 0.62e9 = 89,000 psi,
 *  5.0e9 = 725,000 psi, 3.0e9 = 435,000 psi, 0.09e9 = 13,000 psi), i.e. the table descends from the
 *  hobby fin-flutter literature rather than from any primary materials document — and the current
 *  version of that literature disagrees with several of them.
 *
 *  Two were refuted outright by the USDA Wood Handbook and are corrected here. Where a published
 *  value is HIGHER than what shipped, note which way that cuts: flutter velocity goes as sqrt(G), so
 *  a too-low G under-states the safe speed and over-warns. That is the right direction to be wrong
 *  in, but "wrong in a safe direction and uncited" is still not a number this tool should hand out.
 *
 *  Where the published spread is genuinely wide, Loft takes the LOW end deliberately and says so on
 *  the row. That is a stated choice, not an accident.
 *
 *  Ordered so the more specific patterns win (carbon/aluminium before the generic composites). */
interface ShearEntry {
  pattern: RegExp;
  g: number;
  label: string;
  /** Where this number comes from. Never empty — a row with nothing behind it says that outright,
   *  and `sourced` is false so a surface can mark the estimate as unsupported. */
  source: string;
  /** True when `g` traces to a published document. False for a representative engineering figure
   *  with no primary source found. */
  sourced: boolean;
}

/** The wood values are derived, so the arithmetic is here rather than hidden in a constant.
 *
 *  USDA Wood Handbook FPL-GTR-282 (2021) ch. 5 gives modulus of elasticity E_L (Table 5-3a/5-5a) and
 *  the elastic RATIOS G/E_L per species (Table 5-1, p. 5-2). Table 5-1's footnote a says E_L "may be
 *  approximated by increasing modulus of elasticity values in Table 5-3 by 10%", which removes the
 *  shear deflection included in a bending test — so the derivation is E_L x 1.10 x ratio.
 *
 *  A fin twisting about its span is a thin rectangular section, so the shear that matters runs in
 *  the PLANE of the fin. With the grain along the chord that is G_LR for quarter-sawn stock and
 *  G_LT for flat-sawn, and a design tool cannot know which the flyer bought — so Loft takes G_LT,
 *  the lower of the two. (G_RT, rolling shear, is emphatically not it: balsa's is ~11x smaller.)
 *  It is a US Government work, so there is no licence question. */
const woodG = (elMPa: number, ratioLT: number): number => elMPa * 1.1 * ratioLT * 1e6;

const SHEAR_MODULI: ShearEntry[] = [
  {
    pattern: /carbon/i,
    g: 5.0e9,
    label: "carbon fibre",
    source:
      "lower bound. NCAMP NCP-RP-2010-008 Rev D (Hexcel 8552/AS4 unitape) Table 4-11 gives an " +
      "in-plane G12 of 4.83 GPa for a UNIDIRECTIONAL lamina — a matrix-dominated property. A real " +
      "fin is woven or +/-45, where the effective in-plane modulus is several times higher (a +/-45 " +
      "laminate approaches E1/4, of order 33 GPa). The honest range spans an order of magnitude and " +
      "is set by layup and fibre fraction, so this is deliberately near the bottom of it.",
    sourced: true,
  },
  {
    pattern: /alumin/i,
    g: 26.2e9,
    label: "aluminium",
    source:
      "MIL-HDBK-5J (2003) Table 3.6.2.0(b1), 6061 sheet: G = 3.8e3 ksi = 26.2 GPa. A US " +
      "Government work, unlimited distribution. (Its successor MMPDS is Battelle-copyrighted and is " +
      "not usable here.)",
    sourced: true,
  },
  {
    pattern: /titanium/i,
    g: 42.75e9,
    label: "titanium",
    source: "MIL-HDBK-5J (2003) Table 5.4.1.0(b), annealed Ti-6Al-4V sheet: G = 6.2e3 ksi = 42.75 GPa.",
    sourced: true,
  },
  {
    pattern: /phenolic/i,
    g: 1.4e9,
    label: "phenolic",
    source:
      "NO PUBLISHED VALUE FOUND. NEMA Grade X paper phenolic datasheets (e.g. Norplex-Micarta " +
      "NP610) publish flexural modulus and shear STRENGTH but no shear modulus — and a rocketry " +
      "phenolic tube is convolute-wound with far less resin than that pressed sheet anyway, so the " +
      "sheet would be the wrong material to cite. Representative engineering figure.",
    sourced: false,
  },
  {
    pattern: /g-?10|fr-?4|fibregla|fibergla|glass|frp/i,
    g: 3.0e9,
    label: "G10 fibreglass",
    source:
      "low end, deliberately. Neither NEMA-grade datasheet (Norplex-Micarta NP500A for G-10, GSFR4 " +
      "for FR-4) publishes a shear modulus at all. Apogee Peak of Flight #615 (Bennett, 2023) " +
      "collects published values spanning 2.9-11.7 GPa, measures ~5.34 GPa directly and recommends " +
      "4.14 GPa as a working figure. Loft keeps the low end because this is also the FALLBACK for " +
      "any material it does not recognise, where under-stating stiffness is the safe way to be wrong.",
    sourced: true,
  },
  {
    pattern: /birch|plywood|\bply\b/i,
    g: 0.62e9,
    label: "plywood",
    source:
      "Apogee Peak of Flight #615 (Bennett, 2023), 'Birch Aircraft Plywood' 89,000 psi = 0.614 GPa. " +
      "The Wood Handbook has no plywood at all — it is clear-wood only — and solid yellow birch " +
      "derives to 1.04 GPa, which is a different material: aircraft ply is Baltic birch, and ply " +
      "count, veneer thickness and glue lines all move it.",
    sourced: true,
  },
  {
    pattern: /basswood/i,
    g: woodG(10100, 0.046),
    label: "basswood",
    source:
      "USDA Wood Handbook FPL-GTR-282 ch. 5: American basswood E_L = 10,100 MPa (Table 5-3a, 12% " +
      "MC) x 1.10 x G_LT/E_L 0.046 (Table 5-1) = 0.511 GPa. CORRECTED 2026-08-02 from an uncited " +
      "0.17 GPa, which was low by a factor of 3.",
    sourced: true,
  },
  {
    pattern: /balsa/i,
    g: woodG(3400, 0.037),
    label: "balsa",
    source:
      "USDA Wood Handbook FPL-GTR-282 ch. 5: Ochroma pyramidale E_L = 3,400 MPa (Table 5-5a, 12% " +
      "MC) x 1.10 x G_LT/E_L 0.037 (Table 5-1) = 0.138 GPa. CORRECTED 2026-08-02 from an uncited " +
      "0.09 GPa. Balsa is sold GRADED BY DENSITY over roughly 100-250 kg/m3 and its stiffness " +
      "tracks that, so one number for balsa is a simplification whichever number it is; the " +
      "handbook's own sample is denser than typical hobby stock.",
    sourced: true,
  },
  {
    pattern: /acrylic|plexi|pmma/i,
    g: 1.15e9,
    label: "acrylic",
    source:
      "NO STATIC VALUE FOUND. Rohm's PLEXIGLAS sheet datasheet (211-1) publishes only a DYNAMIC " +
      "shear modulus of 1.70 GPa at ~10 Hz (ISO 537); deriving from its own E = 3300 MPa and " +
      "nu = 0.37 gives 1.20 GPa, which this figure is close to. Representative engineering figure.",
    sourced: false,
  },
  {
    pattern: /polycarb|lexan/i,
    g: 0.79e9,
    label: "polycarbonate",
    source:
      "NO PUBLISHED VALUE FOUND. The Makrolon 2405 datasheet publishes tensile and flexural moduli " +
      "but neither a shear modulus nor a Poisson's ratio. Representative engineering figure.",
    sourced: false,
  },
  {
    pattern: /\bpla\b/i,
    g: 1.09e9,
    label: "PLA",
    source:
      "NO PUBLISHED VALUE FOUND. And a printed part is the wrong thing to look one up for: infill, " +
      "raster angle and inter-layer bond dominate, and the result is strongly anisotropic, so a " +
      "bulk-resin figure is an upper bound a printed fin will not reach. Representative estimate.",
    sourced: false,
  },
  {
    pattern: /\babs\b/i,
    g: 0.8e9,
    label: "ABS",
    source:
      "NO PUBLISHED VALUE FOUND. Same printed-part caveat as PLA. Representative estimate.",
    sourced: false,
  },
  {
    pattern: /delrin|acetal|\bpom\b/i,
    g: 1.0e9,
    label: "acetal",
    source:
      "NO TABULATED VALUE. DuPont's Delrin design guide gives nu = 0.35 and torsional G' only as a " +
      "temperature curve, and warns that G' = E/(2(1+nu)) 'is only an approximation' for Delrin; " +
      "that derivation at 23 C gives 1.11 GPa. Representative engineering figure.",
    sourced: false,
  },
  {
    pattern: /cardboard|cardstock|kraft|\bpaper\b/i,
    g: 0.02e9,
    label: "cardboard",
    source:
      "NO PUBLISHED VALUE FOUND, and none is likely to exist: a spiral- or convolute-wound kraft " +
      "tube's stiffness is dominated by winding angle, ply count, adhesive and paper grade, none of " +
      "which any vendor publishes. Representative engineering figure.",
    sourced: false,
  },
];

const DEFAULT_SHEAR = 3.0e9;
const DEFAULT_LABEL = "G10 fibreglass";

export interface ShearModulus {
  /** Shear modulus (Pa). */
  g: number;
  /** The material the value represents (the design's own name when recognised). */
  label: string;
  /** True when the material couldn't be identified and the default (G10) was assumed. */
  assumed: boolean;
  /** Where `g` comes from — a citation, or a plain statement that none was found. Never empty. */
  source: string;
  /** True when `g` traces to a published document. A flutter margin resting on a `false` here is
   *  resting on an engineering estimate, and the surfaces that present it should say so: the brief's
   *  safety posture asks that a warning whose most leveraged input is uncertain says which. Flutter
   *  velocity goes as sqrt(G), so this is the most leveraged input there is. */
  sourced: boolean;
}

/** Resolve a fin material to a shear modulus, falling back to G10 fibreglass when unknown. */
export function shearModulusFor(material?: Material): ShearModulus {
  const name = material?.name?.trim();
  if (name) {
    for (const e of SHEAR_MODULI) {
      if (e.pattern.test(name)) {
        return { g: e.g, label: name, assumed: false, source: e.source, sourced: e.sourced };
      }
    }
  }
  // The fallback IS the G10 row, so it inherits that row's source rather than restating it.
  const fallback = SHEAR_MODULI.find((e) => e.label === DEFAULT_LABEL);
  return {
    g: DEFAULT_SHEAR,
    label: name ? `${name} (assumed ${DEFAULT_LABEL})` : DEFAULT_LABEL,
    assumed: true,
    source: fallback?.source ?? "no source recorded",
    sourced: fallback?.sourced ?? false,
  };
}

/** Every material Loft can name, with its stiffness and where that figure comes from. Exported so a
 *  docs surface can publish the provenance rather than leaving it in a source file. */
export function shearModulusTable(): { label: string; g: number; source: string; sourced: boolean }[] {
  return SHEAR_MODULI.map((e) => ({ label: e.label, g: e.g, source: e.source, sourced: e.sourced }));
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
  /** The fin set's own component id, so a surface can tell whether the design fields actually reach
   *  this set — the fin what-ifs address one fin group, which need not be the worst-margin one. */
  finId: string;
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
          finId: fin.id,
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
