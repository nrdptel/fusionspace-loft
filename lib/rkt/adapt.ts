/** The RockSim `.rkt` adapter: translate a parsed RockSim design tree INTO the same canonical
 *  rocket model the `.ork` adapter produces, so the simulator — which never sees a file format
 *  — flies a RockSim design exactly as it flies an OpenRocket one. This is a sibling of
 *  `lib/ork/adapt.ts`: a thin adapter into the one internal model, not a second engine.
 *
 *  Clean-room: RockSim's format is documented publicly (the `RockSim_Xml_Doc.txt` shipped with
 *  RockSim, the RockSim engine-file spec, and OpenRocket's documented RockSim compatibility);
 *  this is implemented from those descriptions and from inspecting real `.rkt` exports. No
 *  RockSim or OpenRocket source is used.
 *
 *  Units — RockSim stores linear dimensions in millimetres and part masses in grams; diameters
 *  are diameters (halved to a radius); material densities and the stored flight results are
 *  already SI. Every value is converted to SI here (metres, kilograms, seconds, radians, kelvin).
 *  Angles are stored in radians. Unknown parts are collected as warnings and skipped, never
 *  thrown on, matching the "degrade gracefully on unknowns" requirement.
 *
 *  Mass — unlike a `.ork` (which stores no per-part mass, so Loft computes it from geometry), a
 *  `.rkt` carries RockSim's own per-part mass (`CalcMass`, or `KnownMass` when the design is in
 *  known-mass mode). Loft honours those as explicit per-component overrides, so an imported
 *  RockSim design flies the exact masses RockSim assigned — the honest representation, and it
 *  keeps the Loft-vs-RockSim comparison about the aerodynamics and integration rather than a
 *  mass-model difference. */

import type {
  Rocket,
  RocketComponent,
  Stage,
  Material,
  Placement,
  AxialMethod,
  NoseShape,
  SurfaceFinish,
  FinCrossSection,
  MotorConfiguration,
  MotorInstance,
  MotorSpec,
  MotorMount,
  MassProvenance,
} from "../model/types";
import { planformFromPoints, type FinPoint } from "../model/planform";
import { radToDeg, cToK } from "../units";
import { parseXml, child, children, childText, childNum, type XmlNode } from "../ork/xml";
import type {
  OrkDocument,
  StoredSimulation,
  StoredResults,
  StoredConditions,
} from "../ork/adapt";
import { RKT_PARACHUTE_CD, RKT_STREAMER_CD } from "../sim/recovery-defaults";

// --- unit conversions ----------------------------------------------------------------
const MM = 1 / 1000; // millimetre → metre
const RAD = 1 / 2000; // diameter (mm) → radius (m)
const G = 1 / 1000; // gram → kilogram
const MMHG_TO_PA = 133.322387415; // mm of mercury → pascal

let idCounter = 0;
const nextId = (): string => `r${++idCounter}`;

/** A numeric child, or `fallback` (default 0) when absent/non-numeric. */
function n(node: XmlNode, name: string, fallback = 0): number {
  const v = childNum(node, name, NaN);
  return Number.isFinite(v) ? v : fallback;
}

// --- enum mappings (documented RockSim shape / finish codes) --------------------------

/** Nose-cone / transition shape codes. RockSim's PARABOLIC (2) is closest to an ellipsoid in
 *  Loft's contour set, matching OpenRocket's own RockSim mapping; an unknown code defaults to
 *  ellipsoid (RockSim's documented default). */
function noseShape(code: number): NoseShape {
  switch (code) {
    case 0:
      return "conical";
    case 1:
      return "ogive";
    case 2:
      return "ellipsoid"; // RockSim PARABOLIC
    case 3:
      return "ellipsoid"; // ELLIPTICAL
    case 4:
      return "power"; // POWER_SERIES
    case 5:
      return "parabolic"; // PARABOLIC_SERIES
    case 6:
      return "haack"; // HAACK / Von Kármán
    default:
      return "ellipsoid";
  }
}

/** Fin edge cross-section codes (RockSim's `TipShapeCode`), matching OpenRocket's RockSim mapping.
 *  This sets the fin edge pressure drag: a square edge stagnates the flow head-on; a rounded edge
 *  roughly halves that; an airfoil is streamlined. On a thick fin it is a large share of the drag,
 *  so reading it (instead of defaulting every RockSim fin to square) keeps a rounded/airfoiled
 *  design from being badly over-dragged. Unknown/absent ⇒ square (RockSim's own default). */
function finCrossSection(code: number): FinCrossSection {
  switch (code) {
    case 1:
      return "rounded";
    case 2:
      return "airfoil";
    default:
      return "square"; // 0 = SQUARE, and RockSim's default when absent
  }
}

/** Surface finish codes → equivalent roughness category; unknown defaults to matt paint. */
function finish(code: number): SurfaceFinish {
  switch (code) {
    case 0:
      return "polished";
    case 1:
      return "smooth-paint"; // GLOSS
    case 2:
      return "regular-paint"; // MATT
    case 3:
      return "unfinished";
    default:
      return "regular-paint";
  }
}

/** Ring usage code → the concentric-ring kind. All are annular cylinders for mass; the kind
 *  only refines labelling and auto-radius intent. */
type RingKind = "tubecoupler" | "centeringring" | "bulkhead" | "engineblock";
function ringKind(code: number): RingKind {
  switch (code) {
    case 1:
      return "bulkhead";
    case 2:
      return "engineblock";
    case 4:
      return "tubecoupler";
    default:
      return "centeringring";
  }
}

// --- placement ------------------------------------------------------------------------

interface Ctx {
  warnings: string[];
  /** Explanations of how the design was read, kept apart from the gaps above. */
  notes: string[];
  /** All body/inner tubes by their RockSim serial number, so an EngineSet's MountSerialNo can
   *  find the mount it loads and mark it (with the cluster count) as a motor mount. */
  mounts: Map<number, BodyMount>;
  reduced: boolean;
}

/** A mounted tube whose motor-mount role is filled in once an EngineSet references it. */
type BodyMount = Extract<RocketComponent, { motorMount?: MotorMount }>;

/** RockSim `LocationMode` for a sub-component's axial offset `Xb`:
 *   0 = measured aft from the front of the parent (Loft's parent-relative "top");
 *   1 = measured aft from the tip of the nose — an absolute station on the airframe, independent
 *       of the parent (Loft's "absolute"); a payload/trim mass in a rear tube commonly uses this,
 *       and reading it as parent-relative places the part far behind the airframe, wrecking the CG;
 *   2 = measured FORWARD from the rear of the parent, so a positive `Xb` moves toward the nose.
 *       Loft's "bottom" places a positive offset aft (matching OpenRocket), so the sign is flipped
 *       here — motor-mount rings and bulkheads carry a positive `Xb` and belong inside the tube,
 *       not stacked out behind it.
 *  A top-level body part ignores the mode and stacks after the previous one (the airframe is a
 *  nose→tail run). */
function placement(node: XmlNode, topLevel: boolean): Placement {
  const xb = n(node, "Xb", 0) * MM;
  const radial = n(node, "RadialLoc", 0) * MM;
  const radialOffset = radial > 0 ? radial : undefined;
  if (topLevel) return { method: "after", offset: xb, radialOffset };
  const mode = Math.round(n(node, "LocationMode", 0));
  const method: AxialMethod = mode === 2 ? "bottom" : mode === 1 ? "absolute" : "top";
  // Mode 2 measures forward from the rear; "bottom" measures aft — flip the sign.
  const offset = mode === 2 ? -xb : xb;
  return { method, offset, radialOffset };
}

// --- materials & mass -----------------------------------------------------------------

function material(node: XmlNode): Material | undefined {
  const density = n(node, "Density", 0);
  if (!(density > 0)) return undefined;
  const dt = Math.round(n(node, "DensityType", 0));
  const type = dt === 1 ? "surface" : dt === 2 ? "line" : "bulk";
  return { name: childText(node, "Material") || "material", density, type };
}

/** The part mass (kg) RockSim would fly for this component: its known (measured) mass when the
 *  design is in known-mass mode, otherwise RockSim's calculated mass, falling back across the
 *  two so a populated value always wins. Returns undefined when neither is positive. */
function fileMassKg(node: XmlNode, useKnownMass: boolean): number | undefined {
  return fileMass(node, useKnownMass)?.kg;
}

/** The same figure, WITH which of RockSim's two numbers it is.
 *
 *  **`.rkt` carries both, on every part, always** — `<CalcMass>` beside `<KnownMass>` on 67 of 67
 *  parts across all four corpus designs — and they are different claims: one is RockSim's own
 *  computation and the other is what the designer weighed. The spreads are not cosmetic;
 *  `FullScaleModelTH.rkt`'s tube coupler states 984.0 g against a computed 70.6 g.
 *
 *  Both land in `overrideMass`, which is why that field cannot carry the distinction: on a `.ork`
 *  import it means "the designer stated this" and here it means whichever of the two the design
 *  selected. Every corpus `.rkt` has `<UseKnownMass>` at 0, so all of them fly RockSim's computed
 *  figure — which is a number from another tool, not a measurement, and the surface should say so. */
function fileMass(node: XmlNode, useKnownMass: boolean): { kg: number; from: MassProvenance } | undefined {
  const known = n(node, "KnownMass", 0);
  const calc = n(node, "CalcMass", 0);
  const stated = useKnownMass && known > 0;
  const grams = stated ? known : calc > 0 ? calc : known;
  if (!(grams > 0)) return undefined;
  // The last branch is the known figure again — reached only when RockSim computed nothing — so it
  // is stated too, whatever the design-level flag says.
  return { kg: grams * G, from: stated || calc <= 0 ? "stated" : "tool" };
}

/** The provenance of a mass taken verbatim from the file, as a spreadable patch — empty when the file
 *  offers no figure at all, so a component keeps whatever it had. */
function massOf(node: XmlNode, useKnownMass: boolean): { massFrom?: MassProvenance } {
  const own = fileMass(node, useKnownMass);
  return own ? { massFrom: own.from } : {};
}

/** A `<CustomFinSet>`'s outline: "x,y|x,y|…" in millimetres, with a trailing separator and often a
 *  repeated closing point. Returns the points in the outline's own units (mm); a list too short to
 *  bound an area yields none, and the caller falls back to the trapezoidal summary fields. */
function finPointList(node: XmlNode): FinPoint[] {
  const raw = childText(node, "PointList") || "";
  const pts: FinPoint[] = [];
  for (const pair of raw.split("|")) {
    const [xs, ys] = pair.split(",");
    const x = Number(xs);
    const y = Number(ys);
    if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
  }
  // Drop a repeated final point (RockSim closes the polygon explicitly); the area maths closes it.
  while (pts.length > 1 && pts[pts.length - 1].x === pts[pts.length - 2].x && pts[pts.length - 1].y === pts[pts.length - 2].y) {
    pts.pop();
  }
  return pts.length >= 3 ? pts : [];
}

const STRUCTURAL = new Set<RocketComponent["kind"]>([
  "nosecone",
  "bodytube",
  "transition",
  "innertube",
  "tubecoupler",
  "centeringring",
  "bulkhead",
  "engineblock",
  "trapezoidfinset",
  "freeformfinset",
  "tubefinset",
  "launchlug",
]);

/** Kinds whose CG the mass model derives from geometry and which therefore accept a per-part CG
 *  override (the `overrideCGx` path, shared with the OpenRocket `<overridecg>` import). A point mass
 *  carries its CG at its own station, and fins/internal fittings keep their computed CG, so those
 *  are left out. */
const CG_OVERRIDABLE = new Set<RocketComponent["kind"]>(["nosecone", "bodytube", "transition"]);

/** A genuine RockSim per-part CG override → the CG's offset from the component fore (m), the RockSim
 *  analogue of OpenRocket's `<overridecg>`. RockSim stores a component's CG from its front in
 *  millimetres and flags it with `UseKnownCG`; honour it only when the part is explicitly marked
 *  known-CG AND the value is a *deliberate* override — it differs from RockSim's own computed CG
 *  (`CalcCG`) and sits within the component. RockSim also sets `UseKnownCG=1` when it has merely
 *  cached the computed CG, so adopting the value whenever the flag is set would blindly defer to
 *  RockSim's per-part CG (not ground truth) and could import a nonsensical out-of-body value (a real
 *  file was seen with a nose `KnownCG` well past its length); this keeps only an intentional trim,
 *  e.g. a nose weighted with clay to a measured CG.
 *
 *  **The `knownM > lengthM` bound is now slightly too tight, and it is left alone deliberately.**
 *  Since 2026-08-13 a stated CG means the WHOLE part's balance point, shoulder included
 *  (`lib/sim/mass.ts`), so a shouldered nose can legitimately balance behind its own base and this
 *  would refuse it. The correct bound is `statedCGBounds`'s, as `withStatedCG` and `localBodyCGx`
 *  now use. It is not changed here because **both `.rkt` CG overrides in the corpus pass this bound
 *  comfortably**, so the widening would fire on zero real files while weakening the one guard that
 *  rejects RockSim's cached-not-measured values — which is the failure this function exists for, and
 *  which a real file has actually exhibited. Filed in `BACKLOG.md`; it wants a fixture that shows the
 *  case before the guard moves. */
function cgOverrideM(node: XmlNode, lengthM: number): number | undefined {
  if (Math.round(n(node, "UseKnownCG", 0)) !== 1) return undefined;
  const knownM = n(node, "KnownCG", 0) * MM;
  const calcM = n(node, "CalcCG", 0) * MM;
  if (!(lengthM > 0) || !(knownM > 0) || knownM > lengthM + 1e-6) return undefined;
  if (Math.abs(knownM - calcM) < 1e-4) return undefined; // equals the computed CG — not a real override
  return knownM;
}

// --- component parsing ----------------------------------------------------------------

function baseOf(node: XmlNode, topLevel: boolean) {
  return {
    id: nextId(),
    name: childText(node, "Name") || node.name,
    // RockSim's word for the author's note on a part. It reads as a description more often than as
    // a remark — 40 non-empty across all four corpus designs, most of them a vendor's part number
    // like "PNC-70A" — which is exactly the kind of thing a flyer loses by opening the file here.
    comment: childText(node, "PartDesc")?.trim() || undefined,
    placement: placement(node, topLevel),
    material: material(node),
    finish: finish(Math.round(n(node, "FinishCode", 2))),
    children: [] as RocketComponent[],
  };
}

/** Depth-first parse of a part's `<AttachedParts>` children (nested tubes, rings, recovery,
 *  mass, fins) into the model, warning on anything unsupported. */
function attached(node: XmlNode, ctx: Ctx, useKnownMass: boolean): RocketComponent[] {
  const ap = child(node, "AttachedParts");
  if (!ap) return [];
  const out: RocketComponent[] = [];
  for (const c of ap.children) {
    const comp = parseComponent(c, ctx, false, useKnownMass);
    if (comp) out.push(comp);
    else noteUnsupported(c, ctx);
  }
  return out;
}

/** Flag part types Loft can't fly and record why, so a comparison against the design's stored
 *  results is withheld rather than reported as a misleading error. */
function noteUnsupported(node: XmlNode, ctx: Ctx): void {
  const name = node.name;
  if (name === "RingTail") {
    ctx.reduced = true;
    ctx.warnings.push(`A ring tail (<${name}>) isn't modelled yet — the design was flown without it.`);
  } else if (name === "Pod" || name === "ExternalPod" || name === "SubAssembly") {
    ctx.reduced = true;
    ctx.warnings.push(`A pod/sub-assembly (<${name}>) isn't simulated — only the primary stack flies.`);
  } else if (name !== "AttachedParts") {
    ctx.warnings.push(`Skipped unsupported RockSim part: <${name}>`);
  }
}

function parseComponent(
  node: XmlNode,
  ctx: Ctx,
  topLevel: boolean,
  useKnownMass: boolean,
): RocketComponent | null {
  const b = baseOf(node, topLevel);
  let comp: RocketComponent | null = null;

  switch (node.name) {
    case "NoseCone": {
      const hollow = Math.round(n(node, "ConstructionType", 0)) === 1;
      const wall = n(node, "WallThickness", 0) * MM;
      comp = {
        ...b,
        kind: "nosecone",
        length: n(node, "Len", 0) * MM,
        aftRadius: n(node, "BaseDia", 0) * RAD,
        thickness: hollow && wall > 0 ? wall : undefined,
        shape: noseShape(Math.round(n(node, "ShapeCode", 1))),
        shapeParameter: n(node, "ShapeParameter", 0) || undefined,
        aftShoulderLength: n(node, "ShoulderLen", 0) * MM || undefined,
        aftShoulderRadius: n(node, "ShoulderOD", 0) * RAD || undefined,
        children: attached(node, ctx, useKnownMass),
      };
      break;
    }
    case "BodyTube": {
      const od = n(node, "OD", 0) * RAD;
      const id = n(node, "ID", 0) * RAD;
      const inside = Math.round(n(node, "IsInsideTube", 0)) === 1;
      const serial = Math.round(n(node, "SerialNo", 0));
      if (inside) {
        comp = {
          ...b,
          kind: "innertube",
          length: n(node, "Len", 0) * MM,
          outerRadius: od,
          innerRadius: Math.min(id, od),
          children: [],
        };
      } else {
        comp = {
          ...b,
          kind: "bodytube",
          length: n(node, "Len", 0) * MM,
          outerRadius: od,
          thickness: od > id && id > 0 ? od - id : undefined,
          children: [],
        };
      }
      // Record every tube by serial so an EngineSet can mark its mount later; parse children
      // after so nested inner tubes are recorded too.
      if (serial > 0) ctx.mounts.set(serial, comp as BodyMount);
      (comp as { children: RocketComponent[] }).children = attached(node, ctx, useKnownMass);
      break;
    }
    case "Transition": {
      const hollow = Math.round(n(node, "ConstructionType", 0)) === 1;
      const wall = n(node, "WallThickness", 0) * MM;
      comp = {
        ...b,
        kind: "transition",
        length: n(node, "Len", 0) * MM,
        foreRadius: n(node, "FrontDia", 0) * RAD,
        aftRadius: n(node, "RearDia", 0) * RAD,
        thickness: hollow && wall > 0 ? wall : undefined,
        shape: noseShape(Math.round(n(node, "ShapeCode", 1))),
        shapeParameter: n(node, "ShapeParameter", 0) || undefined,
        foreShoulderLength: n(node, "FrontShoulderLen", 0) * MM || undefined,
        aftShoulderLength: n(node, "RearShoulderLen", 0) * MM || undefined,
        children: attached(node, ctx, useKnownMass),
      };
      break;
    }
    case "FinSet": {
      comp = {
        ...b,
        kind: "trapezoidfinset",
        finCount: Math.max(1, Math.round(n(node, "FinCount", 3))),
        rootChord: n(node, "RootChord", 0) * MM,
        tipChord: n(node, "TipChord", 0) * MM,
        height: n(node, "SemiSpan", 0) * MM,
        sweepLength: n(node, "SweepDistance", 0) * MM,
        thickness: n(node, "Thickness", 0) * MM || 0.003,
        crossSection: finCrossSection(Math.round(n(node, "TipShapeCode", 0))),
        cantAngle: n(node, "CantAngle", 0),
        children: attached(node, ctx, useKnownMass),
      };
      break;
    }
    case "CustomFinSet": {
      // A custom (freeform) planform. RockSim writes the outline in `<PointList>` as
      // "x,y|x,y|…" in millimetres — x chordwise from the root leading edge, y spanwise — and
      // ALSO writes root/tip/span/sweep fields, which on a custom shape are RockSim's own
      // trapezoidal summary and disagree with the outline (on the USLI full-scale design in the
      // corpus, the list gives a 76.2 mm tip where the field says 52.04). The shape is the whole
      // point of drawing one, so the outline wins and the same strip-theory CP the OpenRocket
      // freeform path uses is computed from it.
      const pts = finPointList(node);
      const p = planformFromPoints(pts);
      const fallbackSpan = n(node, "SemiSpan", 0) * MM;
      comp = {
        ...b,
        kind: "freeformfinset",
        finCount: Math.max(1, Math.round(n(node, "FinCount", 3))),
        rootChord: p.rootChord * MM || n(node, "RootChord", 0) * MM,
        area: p.area * MM * MM,
        height: p.span * MM || fallbackSpan,
        sweepLength: p.sweep * MM || n(node, "SweepDistance", 0) * MM,
        thickness: n(node, "Thickness", 0) * MM || 0.003,
        crossSection: finCrossSection(Math.round(n(node, "TipShapeCode", 0))),
        cpChord: p.cpChord > 0 ? p.cpChord * MM : undefined,
        // The outline itself, converted to the model's metres, so an export can write the shape back
        // instead of an equal-area trapezoid. `<PointList>` is RockSim's spelling of the same closed
        // polygon OpenRocket writes as `<finpoints>`; both reduce through `planformFromPoints`, and
        // that reduction is one-way.
        points: pts.length >= 3 ? pts.map((pt) => ({ x: pt.x * MM, y: pt.y * MM })) : undefined,
        children: attached(node, ctx, useKnownMass),
      };
      break;
    }
    case "TubeFinSet": {
      const od = n(node, "OD", 0) * RAD;
      const id = n(node, "ID", 0) * RAD;
      comp = {
        ...b,
        kind: "tubefinset",
        finCount: Math.max(1, Math.round(n(node, "TubeCount", n(node, "FinCount", 6)))),
        length: n(node, "Len", 0) * MM,
        outerRadius: od,
        // RockSim often leaves a tube fin's bore at 0 (it stores no wall for the part). A solid rod
        // is not a tube fin, so 0 means "unstated" — resolved below from the airframe the tubes are
        // cut from, not taken literally.
        thickness: od > id && id > 0 ? od - id : 0,
        children: attached(node, ctx, useKnownMass),
      };
      break;
    }
    case "Ring": {
      const od = n(node, "OD", 0) * RAD;
      const id = n(node, "ID", 0) * RAD;
      const kind = ringKind(Math.round(n(node, "UsageCode", 0)));
      comp = {
        ...b,
        kind,
        length: n(node, "Len", 0) * MM,
        outerRadius: od,
        innerRadius: kind === "bulkhead" ? 0 : Math.min(id, od),
        children: attached(node, ctx, useKnownMass),
      };
      break;
    }
    case "MassObject": {
      // **`fileMass` answers which of RockSim's two fields this came from, and that answer is used.**
      // A first version hardcoded `"stated"` here on the argument that a mass object has no geometry
      // to derive a weight from — true of the PART, and not of the FILE: two corpus shock cords carry
      // `KnownMass` 0 with a non-round `CalcMass` (0.483998 g, 37.9598 g), which is RockSim
      // calculating from a material and a length. Marking those as the designer's own measurement is
      // the wrong claim, and it disagreed with what the structural path says about the identical
      // input. Found by the pre-push review.
      const own = fileMass(node, useKnownMass);
      const mass = own?.kg ?? 0;
      comp = {
        ...b,
        kind: "masscomponent",
        ...(own ? { massFrom: own.from } : {}),
        mass,
        length: n(node, "Len", 0) * MM || undefined,
        massType: childText(node, "Name"),
        children: [],
      };
      break;
    }
    case "Parachute": {
      comp = {
        ...b,
        kind: "parachute",
        // RockSim exposes no parachute Cd field at all, so there is no source value to resolve a
        // missing one TO — see `RKT_PARACHUTE_CD`, which says so and records that it is reached by
        // 0 of the corpus's RockSim designs.
        cd: n(node, "DragCoefficient", RKT_PARACHUTE_CD.cd) || RKT_PARACHUTE_CD.cd,
        cdFrom: n(node, "DragCoefficient", 0) > 0 ? ("file" as const) : ("default" as const),
        diameter: n(node, "Dia", 0) * MM,
        // Taken verbatim from the file, so it carries the file's own provenance. These three kinds
        // sit OUTSIDE `STRUCTURAL`, so the marking block below never reaches them — and unmarked
        // means "Loft derived this from geometry and material", which is not true of a number read
        // straight out of a `.rkt`. Found by the pre-push review.
        ...massOf(node, useKnownMass),
        mass: fileMassKg(node, useKnownMass) ?? 0,
        // The design tree doesn't pin a deploy event/altitude (that lives in the sim setup), but a
        // RockSim single-deploy design ejects on the motor's charge — that is what the delay in an
        // engine code is for. Firing at the CHARGE rather than at apogee is what the file's own
        // stored results describe: a zero-delay ("-0") configuration opens the canopy at burnout,
        // still doing hundreds of metres per second, and tops out far below its ballistic apogee.
        // Defaulting to apogee flew one such design ~545% high against its own stored numbers. A
        // plugged motor carries no ejection delay, and the solver then falls back to apogee.
        deployEvent: "ejection",
        deployDelay: 0,
        packedLength: n(node, "Len", 0) * MM || undefined,
        children: [],
      };
      break;
    }
    case "Streamer": {
      comp = {
        ...b,
        kind: "streamer",
        cd: n(node, "DragCoefficient", RKT_STREAMER_CD.cd) || RKT_STREAMER_CD.cd,
        cdFrom: n(node, "DragCoefficient", 0) > 0 ? ("file" as const) : ("default" as const),
        stripLength: n(node, "Len", 0) * MM,
        stripWidth: n(node, "Width", 0) * MM,
        ...massOf(node, useKnownMass),
        mass: fileMassKg(node, useKnownMass) ?? 0,
        // As for a parachute above: RockSim ejects on the motor's charge, not at apogee.
        deployEvent: "ejection",
        deployDelay: 0,
        packedLength: n(node, "Len", 0) * MM || undefined,
        children: [],
      };
      break;
    }
    case "LaunchLug": {
      const od = n(node, "OD", 0) * RAD; // outer radius (m) from the lug's outer diameter
      comp = {
        ...b,
        kind: "launchlug",
        ...massOf(node, useKnownMass),
        mass: fileMassKg(node, useKnownMass),
        length: n(node, "Len", 0) * MM || undefined,
        radius: od > 0 ? od : undefined,
        instanceCount: 1,
        children: [],
      };
      break;
    }
    default:
      return null;
  }

  // Honour the file's per-part mass as an explicit override (see the module header). Mass-only
  // parts already carry their mass directly; this covers the structural parts Loft would
  // otherwise compute from geometry.
  if (comp && STRUCTURAL.has(comp.kind)) {
    const om = fileMass(node, useKnownMass);
    if (om !== undefined) {
      (comp as { overrideMass?: number }).overrideMass = om.kg;
      (comp as { massFrom?: MassProvenance }).massFrom = om.from;
    }
  }
  // Honour a genuine per-part CG override (the RockSim analogue of OpenRocket's <overridecg>), so a
  // nose or section trimmed to a measured CG flies with that CG — and thus the right stability
  // margin — instead of Loft's geometry estimate.
  if (comp && CG_OVERRIDABLE.has(comp.kind)) {
    const cg = cgOverrideM(node, (comp as { length?: number }).length ?? 0);
    if (cg !== undefined) {
      (comp as { overrideCGx?: number }).overrideCGx = cg;
      // **`"stated"` here, where the MASS on the same part is `"tool"`, and the difference is real
      // rather than an inconsistency.** `cgOverrideM` returns a figure only when `<UseKnownCG>` is 1
      // — RockSim's own word for "the user gave me this, do not compute it" — and it additionally
      // refuses one that equals `<CalcCG>`. The mass path has no such gate to pass: every corpus
      // `.rkt` carries `<UseKnownMass>` at 0, so all four fly RockSim's COMPUTED figure and are
      // marked as the source tool's rather than as the design's.
      (comp as { cgFrom?: MassProvenance }).cgFrom = "stated";
    }
  }
  return comp;
}

// --- motors ---------------------------------------------------------------------------

/** Build a motor instance from one `<EngineSet>` and mark the mount it loads. Returns null when
 *  the set carries no engine code. */
function engineInstance(set: XmlNode, ctx: Ctx): MotorInstance | null {
  const designation = (childText(set, "EngineCode") || "").trim();
  if (!designation) return null;
  const mountSerial = Math.round(n(set, "MountSerialNo", 0));
  const count = Math.max(1, Math.round(n(set, "EngineCount", 1)));
  const overhang = n(set, "EngineOverhang", 0) * MM;
  // RockSim writes the ejection delay in seconds, and a NEGATIVE value for a plugged motor —
  // no ejection charge at all (the file that flies both writes 0 for its "-0" configuration and
  // −2 for its "-P" one, whose own stored results eject at no time and come in ballistic). A
  // missing element says nothing either way, so it stays "unstated" rather than plugged.
  const ejectionText = (childText(set, "EjectionDelay") || "").trim();
  const ejection = ejectionText === "" ? -1 : n(set, "EjectionDelay", -1);
  const plugged = ejectionText !== "" && ejection < 0;
  const mount = ctx.mounts.get(mountSerial) ?? fallbackMount(ctx);
  if (mount) {
    const role: MotorMount = { overhang };
    if (count > 1) role.clusterCount = count;
    (mount as { motorMount?: MotorMount }).motorMount = role;
  }
  const spec: MotorSpec = {
    manufacturer: childText(set, "EngineMfg") || undefined,
    designation,
    type: "unknown",
    diameter: 0,
    length: 0,
    delay: ejection >= 0 ? ejection : undefined,
    plugged: plugged || undefined,
  };
  return {
    mountId: mount?.id ?? "",
    motor: spec,
    ignitionDelay: n(set, "IgnitionDelay", 0),
  };
}

/** The aft-most recorded tube, so a motor whose `MountSerialNo` doesn't resolve still gets
 *  placed on a real mount (the sensible default for a motor) rather than dropped. */
function fallbackMount(ctx: Ctx): BodyMount | undefined {
  let last: BodyMount | undefined;
  for (const m of ctx.mounts.values()) last = m;
  return last;
}

/** The EngineSets under a container's Stage1/2/3 engine lists. */
function engineSetsIn(container: XmlNode): XmlNode[] {
  const out: XmlNode[] = [];
  for (const stage of ["Stage1Engines", "Stage2Engines", "Stage3Engines"]) {
    const s = child(container, stage);
    if (s) out.push(...children(s, "EngineSet"));
  }
  return out;
}

// --- stored simulations ---------------------------------------------------------------

/** Map one `<SimulationResults>` to Loft's stored-results shape. RockSim stores the kinematic
 *  results in SI already; only the launch-site conditions need unit work. */
function storedSim(res: XmlNode, index: number, designRailM?: number): StoredSimulation {
  const results: StoredResults = {};
  let hasResults = false;
  const set = (key: keyof StoredResults, tag: string) => {
    const v = childNum(res, tag, NaN);
    if (Number.isFinite(v) && v !== 0) {
      results[key] = v;
      hasResults = true;
    }
  };
  set("maxAltitude", "MaxAltitude");
  set("maxVelocity", "MaxVelocity");
  set("maxAcceleration", "MaxAcceleration");
  set("timeToApogee", "TimeToApogee");
  set("flightTime", "TimeToLanding");
  // **The VERTICAL component, not `VelocityAtLanding`, and this is a like-for-like correction rather
  // than a physics change.** RockSim's `<VelocityAtLanding>` is the TOTAL ground-frame speed:
  // measured across every stored simulation in the corpus's RockSim designs, it equals
  // hypot(X, Y, Z) to four decimal places on 17 of 17. Loft's `groundHitVelocity` is deliberately
  // vertical-only (`Math.abs(state.vel.z)` in `lib/sim/simulate.ts`) — wind drift moves the total
  // without making the canopy any smaller, so a figure including it would report the weather's
  // spread rather than the design's, which is the same reasoning the dispersion's landing speed
  // records.
  //
  // Comparing one against the other is wrong in ONE DIRECTION by construction: a total is never
  // smaller than its own vertical component, so Loft could only ever read low against it. That is
  // exactly the signature the census has been showing and nobody had attributed — 86 of 92 flights
  // "descending slower than stored", which a wrong coefficient would have scattered instead.
  // `<YVelocityAtLanding>` is the vertical axis (on the ballistic runs it is within 0.1% of the
  // total, as a near-vertical lawn dart should be; under a canopy the two part company by ~5%).
  //
  // `VelocityAtLanding` stays as the fallback, because a file that stores the summary without the
  // components is still better compared against approximately than not at all — and `set` already
  // ignores an absent or zero tag, so the fallback fires only when the component is genuinely
  // missing. Note RockSim misspells the X tag as `XVelcoityAtLanding`; the Y tag is spelled
  // correctly and is the only one needed here.
  //
  // Taken as a MAGNITUDE: the file stores the vertical component signed, and it is negative on a
  // descent (`-8.50141`, `-161.869`). `set` accepts a negative unchanged, so reading it through the
  // generic helper would have stored a negative speed and compared it against Loft's absolute one.
  (() => {
    const vy = childNum(res, "YVelocityAtLanding", NaN);
    if (Number.isFinite(vy) && vy !== 0) {
      results.groundHitVelocity = Math.abs(vy);
      hasResults = true;
      return;
    }
    set("groundHitVelocity", "VelocityAtLanding");
  })();
  set("launchRodVelocity", "VelocityAtLaunchGuideEnd");
  // **`<OptimalDelay>` is this run's own `TimeToApogee − TimeToBurnout`, not a free coast**, so the
  // simulation carries `optimumDelayBasis: "as-flown"` below and the comparison scores Loft's
  // as-flown figure against it. Verified as an identity on every stored simulation in the corpus's
  // four RockSim designs — see `StoredSimulation.optimumDelayBasis` for the arithmetic. Without it,
  // a design whose canopy opens at burnout is compared free-coast against a flight that never
  // coasted: 16.16 s against a stored 1.34 s, on four rows of one file.
  set("optimumDelay", "OptimalDelay");
  // **RockSim DOES store a deployment velocity, in a tag it misspells.** `VelocityAtDeplyment` —
  // the same class of typo as `XVelcoityAtLanding` beside it — carries a real figure on 6 of the 17
  // stored simulations in this corpus (33.4284, 10.207, and four at ~234.4). Nothing read it, so
  // the published 6.0% deployment-velocity median was an OpenRocket-only figure standing in a
  // cross-tool census. The per-device `DeployedAt_Velocity` is 0 on every run here and is not a
  // substitute. No `deploymentVelocityEvent` is set: this is one figure per run with no event list
  // to place it against, so it is compared against Loft's reported maximum.
  set("deploymentVelocity", "VelocityAtDeplyment");

  const conditions: StoredConditions = { configId: `sim${index}` };
  const alt = childNum(res, "LaunchAltitude", NaN);
  if (Number.isFinite(alt)) conditions.launchAltitude = alt;
  const temp = childNum(res, "LaunchTemperature", NaN);
  if (Number.isFinite(temp)) conditions.baseTempK = cToK(temp);
  const baro = childNum(res, "LaunchBarometer", NaN);
  if (Number.isFinite(baro) && baro > 0) conditions.basePressurePa = baro * MMHG_TO_PA;
  const wind = childNum(res, "LaunchWindSpeed", NaN);
  if (Number.isFinite(wind)) conditions.windSpeed = wind;
  const angle = childNum(res, "LaunchAngle", NaN); // radians off vertical
  if (Number.isFinite(angle)) conditions.rodAngleDeg = radToDeg(angle);
  const rail = childNum(res, "LaunchGuideLen", NaN) * MM; // stored in mm
  if (Number.isFinite(rail) && rail > 0.1 && rail < 20) conditions.rodLength = rail;
  // RockSim states the rail length in two places: per simulation as `LaunchGuideLen`, and once for
  // the whole design as `<LaunchGuideLength>`. Only the per-simulation one was read, so a run that
  // omits it lost the design's rail and flew Loft's 1.0 m default instead — `rocksimTestRocket2.rkt`
  // in the corpus carries a simulation with no `LaunchGuideLen` and a design-level 914.4 mm, an 8.6%
  // understatement of the length rail-exit velocity is computed over. The per-simulation figure
  // still wins wherever the file states one; this is the fallback, not a replacement.
  else if (designRailM !== undefined) conditions.rodLength = designRailM;

  return {
    name: (childText(res, "SimulationName") || `Simulation ${index + 1}`).replace(/^\[|\]$/g, ""),
    recoveryDeployed: recoveryDeployed(res),
    optimumDelayBasis: "as-flown",
    conditions,
    results,
    hasResults,
  };
}

/** Did a RECOVERY device come out on this stored run? See `StoredSimulation.recoveryDeployed` for
 *  why the answer changes what the number beside it means.
 *
 *  Scoped to `<SimulationEvents>` deliberately. `<HasDeployed>` also appears inside
 *  `<Booster1Staging>` and `<Booster2Staging>` — those are STAGE separation events, and on the
 *  corpus's four-device design a file-wide read pools two staging flags in with three parachute
 *  flags. Measured: it makes no difference to the ANSWER on any of the 17 stored runs here, because
 *  the staging flags are 0 wherever the recovery flags are 0. It would make a difference on the first
 *  file where a booster separates and nothing else does, which is a normal flight to fly and would
 *  read as a canopy descent at 80 m/s.
 *
 *  The empty-event case is why `<FinalState>` is read at all: `rocksimTestRocket1.rkt` stores a run
 *  with NO recovery events, which on its own is "the file records nothing" rather than "nothing
 *  deployed". Its `<FinalState>` is 4, the value the other 11 ballistic runs carry, and it lands at
 *  56.5 m/s from 445 m — a lawn dart. So a stated `FinalState` is taken as evidence the run was
 *  actually flown, and an absent one leaves the answer undefined rather than guessing `false`. */
function recoveryDeployed(res: XmlNode): boolean | undefined {
  const events = child(res, "SimulationEvents");
  const flags = events ? children(events, "SimulationEvent") : [];
  if (flags.some((e) => childNum(e, "HasDeployed", 0) === 1)) return true;
  if (flags.length > 0) return false;
  return childText(res, "FinalState") !== undefined ? false : undefined;
}

/** A tube fin's wall, when the file didn't state one. RockSim's `<TubeFinSet>` commonly stores
 *  `ID` as 0, which would read as a solid rod — the opposite of a tube fin, killing both the duct
 *  normal force and the wall-annulus drag. Tube fins are cut from the same tube stock as the
 *  airframe, so the enclosing body tube's own wall is the honest fallback; a thin default covers a
 *  file that states neither. On RockSim's own tube-fin example this recovers the wall to within
 *  half a millimetre, putting Loft's duct CNα within 1% of the CNα that file itself stores. */
const DEFAULT_TUBE_FIN_WALL = 0.0005;

function resolveTubeFinWalls(components: RocketComponent[], parentWall: number): void {
  for (const c of components) {
    if (c.kind === "tubefinset" && !(c.thickness > 0)) {
      c.thickness = parentWall > 0 ? parentWall : DEFAULT_TUBE_FIN_WALL;
      // The file's stated per-part mass came from the same zero-bore geometry — RockSim weighs
      // those tubes as SOLID rods, an order of magnitude heavy. Having replaced the bore for the
      // aero, keep the part coherent and weigh it from the inferred wall too, rather than flying
      // a set of tubes that masses like a set of rods.
      delete (c as { overrideMass?: number }).overrideMass;
    }
    const wall = c.kind === "bodytube" && (c.thickness ?? 0) > 0 ? (c.thickness as number) : parentWall;
    if (c.children.length) resolveTubeFinWalls(c.children, wall);
  }
}

// --- top level ------------------------------------------------------------------------

export function adaptRktXml(xml: string): OrkDocument {
  idCounter = 0;
  const root = parseXml(xml);
  if (root.name !== "RockSimDocument") {
    throw new Error(`Not a RockSim file (root <${root.name}>)`);
  }
  const design = child(child(root, "DesignInformation") ?? root, "RocketDesign");
  if (!design) throw new Error("RockSim file has no <RocketDesign> element");

  const warnings: string[] = [];
  const notes: string[] = [];
  const ctx: Ctx = { warnings, notes, mounts: new Map(), reduced: false };
  const useKnownMass = Math.round(n(design, "UseKnownMass", 0)) === 1;

  // RockSim numbers stages 3 (top / sustainer, with the nose) down to 1 (aft booster), which is
  // already Loft's nose→tail stage order, so each populated RockSim stage becomes one of the
  // model's stages and the solver's serial staging takes it from there — the same staging an
  // OpenRocket multi-stage design gets, since the solver has never seen a file format.
  const stageParts: { name: string; components: RocketComponent[] }[] = [];
  const allComponents: RocketComponent[] = [];
  const STAGE_TAGS = ["Stage3Parts", "Stage2Parts", "Stage1Parts"] as const;
  for (const stageTag of STAGE_TAGS) {
    const stage = child(design, stageTag);
    if (!stage) continue;
    const parts: RocketComponent[] = [];
    for (const partNode of stage.children) {
      const comp = parseComponent(partNode, ctx, true, useKnownMass);
      if (comp) parts.push(comp);
      else noteUnsupported(partNode, ctx);
    }
    if (parts.length) {
      stageParts.push({ name: stageTag.replace("Parts", ""), components: parts });
      allComponents.push(...parts);
    }
  }
  if (stageParts.length > 1) {
    notes.push(
      `This design has ${stageParts.length} stages, flown serially: the booster lights at launch, each ` +
        `stage above air-starts when the one below burns out and separates. The separated stages' own ` +
        `descent isn't tracked — only the sustainer is flown to the ground.`,
    );
  }
  // A tube fin's wall comes from the airframe it's cut from, which may sit in another stage.
  resolveTubeFinWalls(allComponents, 0);
  const designName = childText(design, "Name") || "Stage";
  const stages: Stage[] =
    stageParts.length > 0
      ? stageParts.map((s) => ({ name: stageParts.length > 1 ? s.name : designName, components: s.components }))
      : [{ name: designName, components: [] }];

  // Each <SimulationResults> carries its own <EngineSet>s and stored numbers: map each to a
  // motor configuration (linked by id) and a stored simulation, mirroring how OpenRocket's
  // simulations reference configurations. Marking the mount also fills its motor-mount role.
  const configs: MotorConfiguration[] = [];
  const simulations: StoredSimulation[] = [];
  // The design's own rail length, stated once for the whole file in millimetres. Bounded the same
  // way the per-simulation figure is, so a nonsense value is refused rather than flown.
  const designRail = n(design, "LaunchGuideLength", NaN) * MM;
  const designRailM =
    Number.isFinite(designRail) && designRail > 0.1 && designRail < 20 ? designRail : undefined;
  const resultsList = child(root, "SimulationResultsList");
  const resultNodes = resultsList ? children(resultsList, "SimulationResults") : [];
  resultNodes.forEach((res, i) => {
    const instances = engineSetsIn(res)
      .map((set) => engineInstance(set, ctx))
      .filter((x): x is MotorInstance => x !== null);
    const sim = storedSim(res, i, designRailM);
    configs.push({ id: `sim${i}`, name: sim.name, instances });
    simulations.push(sim);
  });

  // A design with no stored simulations (so no motor) still needs a configuration to select; an
  // empty one flies with no propulsion, which the run layer detects and withholds honestly.
  if (configs.length === 0) configs.push({ id: "default", instances: [] });
  // …but the design's own launch setup is not part of any simulation, and throwing it away with
  // them left the file's rail length unread. `rocksimTestRocket2.rkt` in the corpus states 914.4 mm
  // at `<RocketDesign>` level and carries an empty `<SimulationResultsList>`; Loft flew its 1.0 m
  // default over it, 8.6% short on the length rail-exit velocity is computed across. Carried as a
  // stored simulation with no results, which is what the file describes: a setup, and no run under
  // it. `hasResults: false` keeps it out of every comparison, exactly as an unrun stored simulation
  // already is. The RASAero adapter does the same with its design-level `<LaunchSite>`.
  if (simulations.length === 0 && designRailM !== undefined) {
    simulations.push({
      name: "Launch setup",
      status: "notsimulated",
      conditions: { configId: configs[0].id, rodLength: designRailM },
      results: {},
      hasResults: false,
    });
  }

  const rocket: Rocket = {
    name: childText(design, "Name") || "Imported rocket",
    // RockSim keeps the design-level note under a different name again — `<Comments>` on
    // `<RocketDesign>`, where OpenRocket writes `<comment>` on `<rocket>`.
    comment: childText(design, "Comments")?.trim() || undefined,
    stages,
    configurations: configs,
    defaultConfigId: configs[0]?.id,
    referenceType: "maximum",
  };

  return {
    rocket,
    simulations,
    formatVersion: `RockSim ${childText(root, "FileVersion") || "?"}`,
    creator: "RockSim",
    warnings,
    notes,
    flownAsReduced: ctx.reduced,
  };
}
