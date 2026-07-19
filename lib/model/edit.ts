/** Builder geometry edits: non-destructively apply dimension changes to an imported design,
 *  returning a modified Rocket the whole sim pipeline (mass, aero, flight) then flies. This is the
 *  first step of the in-browser builder — the same "edit → rebuild the model → re-simulate" loop
 *  a from-scratch builder needs, on an imported design.
 *
 *  The geometry is length-derived (flattenRocket stacks components by their lengths), so resizing a
 *  nose cone or body tube automatically shifts everything downstream and recomputes mass, drag,
 *  centre of pressure, and motor position. Fin span moves the centre of pressure (stability). */

import type { Rocket, RocketComponent, NoseCone, BodyTube, SurfaceFinish, NoseShape, FinCrossSection } from "./types";
import { flattenRocket } from "./geometry";

/** Selectable nose-cone shapes, for the builder's nose picker. Ordered by how a flyer thinks of
 *  them (sharp → blunt, then the parametrised low-drag families). */
export const NOSE_SHAPES: NoseShape[] = ["ogive", "conical", "ellipsoid", "parabolic", "power", "haack"];

/** Selectable fin edge cross-sections, for the builder's fin-profile picker. Ordered draggiest →
 *  cleanest (square stagnates the flow, rounded halves that, airfoil is streamlined). */
export const FIN_CROSS_SECTIONS: FinCrossSection[] = ["square", "rounded", "airfoil"];

/** The canonical shape parameter to give each nose shape when it's chosen from the picker, so the
 *  result is one well-defined nose. `ogive`/`conical`/`ellipsoid` ignore it; the parametrised
 *  families take their common representative — a ½-power and ½-parabola, and the C=0 Haack, i.e. the
 *  minimum-drag Sears–Haack / Von Kármán ogive (the reason a flyer reaches for a Haack nose). */
const NOSE_SHAPE_PARAM: Partial<Record<NoseShape, number>> = {
  power: 0.5,
  parabolic: 0.5,
  haack: 0,
};

/** Surface finishes ordered smoothest → roughest, for choosing the representative one and for the
 *  edit UI. The roughest present is what drives skin-friction drag (see aeroGeometry). */
export const SURFACE_FINISHES: SurfaceFinish[] = [
  "mirror",
  "polished",
  "smooth-paint",
  "regular-paint",
  "unfinished",
  "rough",
];

export interface GeometryEdits {
  /** Absolute fin semi-span (root→tip height, m) for every fin set. Undefined leaves fins as-is. */
  finSpan?: number;
  /** Number of fins per set (≥ 1). Undefined leaves the count as-is. */
  finCount?: number;
  /** Absolute fin root chord (m) for a trapezoidal fin set. Undefined leaves it. */
  finRootChord?: number;
  /** Absolute fin tip chord (m) for a trapezoidal fin set (0 ⇒ a delta). Undefined leaves it. */
  finTipChord?: number;
  /** Fin leading-edge sweep (m the tip LE is aft of the root LE) for a trapezoidal fin set.
   *  Undefined leaves it. */
  finSweepLength?: number;
  /** Fin thickness (m) for every fin set — drives the fin drag (skin-friction form factor, edge
   *  pressure, wave) and the flutter margin (∝ (t/c)³). Undefined leaves it. */
  finThickness?: number;
  /** Fin edge cross-section for every fin set — square, rounded, or airfoil. Sets the fin edge
   *  pressure drag: a square edge stagnates the flow head-on, a rounded edge roughly halves that,
   *  an airfoil is streamlined. The "what would airfoiling my fins buy?" what-if. Undefined leaves
   *  each set's own profile. */
  finCrossSection?: FinCrossSection;
  /** Absolute nose-cone length (m) for the design's nose. Undefined leaves it. */
  noseLength?: number;
  /** Nose-cone contour for the design's nose (drives nose pressure and wave drag). Chosen from the
   *  picker as a canonical instance of the shape. Undefined leaves it. */
  noseShape?: NoseShape;
  /** Absolute length (m) for the design's primary (longest) body tube. Undefined leaves it. */
  bodyLength?: number;
  /** Target outer diameter (m) of the design's primary body tube. The whole outer airframe (nose
   *  base, every body tube, transitions and their shoulders) scales by the same factor to hit it,
   *  keeping the mould line faired — the "same design in a wider/narrower tube" what-if. Fins, the
   *  nose profile, the motor, and internal fittings keep their size. Undefined leaves it. */
  bodyDiameter?: number;
  /** Surface finish applied to the whole airframe (drives skin-friction drag). Undefined leaves
   *  each component's own finish. */
  finish?: SurfaceFinish;
}

/** True when at least one edit actually changes something. */
export function hasGeometryEdits(e: GeometryEdits): boolean {
  return (
    (e.finSpan !== undefined && e.finSpan > 0) ||
    (e.finCount !== undefined && e.finCount >= 1) ||
    (e.finRootChord !== undefined && e.finRootChord > 0) ||
    (e.finTipChord !== undefined && e.finTipChord > 0) ||
    (e.finSweepLength !== undefined && e.finSweepLength >= 0) ||
    (e.finThickness !== undefined && e.finThickness > 0) ||
    e.finCrossSection !== undefined ||
    (e.noseLength !== undefined && e.noseLength > 0) ||
    e.noseShape !== undefined ||
    (e.bodyLength !== undefined && e.bodyLength > 0) ||
    (e.bodyDiameter !== undefined && e.bodyDiameter > 0) ||
    e.finish !== undefined
  );
}

/** The design's nose cone (the frontmost one). */
export function primaryNose(rocket: Rocket): NoseCone | undefined {
  return flattenRocket(rocket)
    .map((p) => p.component)
    .find((c): c is NoseCone => c.kind === "nosecone");
}

/** The design's nose-cone contour, for showing the flyer the current shape to edit from. */
export function primaryNoseShape(rocket: Rocket): NoseShape | undefined {
  return primaryNose(rocket)?.shape;
}

/** The design's primary body tube — the longest, i.e. the main airframe. */
export function primaryBodyTube(rocket: Rocket): BodyTube | undefined {
  const tubes = flattenRocket(rocket)
    .map((p) => p.component)
    .filter((c): c is BodyTube => c.kind === "bodytube");
  return tubes.length ? tubes.reduce((a, b) => (b.length > a.length ? b : a)) : undefined;
}

/** The design's primary body-tube outer diameter (m) — the caliber a flyer reads the rocket by, and
 *  the value the diameter what-if scales from. Undefined for a tubeless design. */
export function primaryBodyDiameter(rocket: Rocket): number | undefined {
  const tube = primaryBodyTube(rocket);
  return tube ? tube.outerRadius * 2 : undefined;
}

/** The design's primary (frontmost) fin set, if any. */
function primaryFinSet(rocket: Rocket) {
  return flattenRocket(rocket)
    .map((p) => p.component)
    .find((c) => c.kind === "trapezoidfinset" || c.kind === "ellipticalfinset" || c.kind === "freeformfinset");
}

/** The design's primary fin set's semi-span (m), for showing the flyer the current value to edit
 *  from. Undefined for a finless design. */
export function primaryFinSpan(rocket: Rocket): number | undefined {
  const fin = primaryFinSet(rocket);
  return fin && "height" in fin ? fin.height : undefined;
}

/** The design's primary fin set's fin count. Undefined for a finless design. */
export function primaryFinCount(rocket: Rocket): number | undefined {
  const fin = primaryFinSet(rocket);
  return fin && "finCount" in fin ? fin.finCount : undefined;
}

/** The primary fin set's root chord (m), only when it's trapezoidal (a generic set's root chord is a
 *  reduction, not a directly editable dimension). Undefined otherwise. */
export function primaryFinRootChord(rocket: Rocket): number | undefined {
  const fin = primaryFinSet(rocket);
  return fin?.kind === "trapezoidfinset" ? fin.rootChord : undefined;
}

/** The primary fin set's tip chord (m), only when it's trapezoidal. Undefined otherwise. */
export function primaryFinTipChord(rocket: Rocket): number | undefined {
  const fin = primaryFinSet(rocket);
  return fin?.kind === "trapezoidfinset" ? fin.tipChord : undefined;
}

/** The primary fin set's leading-edge sweep (m), only when it's trapezoidal. Undefined otherwise. */
export function primaryFinSweep(rocket: Rocket): number | undefined {
  const fin = primaryFinSet(rocket);
  return fin?.kind === "trapezoidfinset" ? fin.sweepLength : undefined;
}

/** The primary fin set's thickness (m). Defined for every fin kind (all carry a thickness), so a
 *  finless design is the only undefined case. */
export function primaryFinThickness(rocket: Rocket): number | undefined {
  const fin = primaryFinSet(rocket);
  return fin && "thickness" in fin ? fin.thickness : undefined;
}

/** The primary fin set's edge cross-section, defaulting to square (the OpenRocket default) when a
 *  finned design names none — so the picker shows the profile the aero is actually using. Undefined
 *  for a finless design. */
export function primaryFinCrossSection(rocket: Rocket): FinCrossSection | undefined {
  const fin = primaryFinSet(rocket);
  return fin ? (("crossSection" in fin && fin.crossSection) || "square") : undefined;
}

/** Apply the edits to one component (and its subtree). Trapezoid fins derive their area from
 *  dimensions downstream, so only the height changes; a generic (elliptical/freeform) set stores
 *  its planform area, so it's scaled with the span to keep the shape. Length overrides are keyed by
 *  component id (resolved once in applyGeometryEdits). */
function editComponent(c: RocketComponent, e: GeometryEdits, lengths: Map<string, number>): RocketComponent {
  const children = c.children.length ? c.children.map((child) => editComponent(child, e, lengths)) : c.children;

  const newLen = lengths.get(c.id);
  // The nose cone takes both a length override and a shape change (the aero reads both), so handle it
  // before the generic length branch. A shape change installs that shape's canonical parameter.
  if (c.kind === "nosecone" && (newLen !== undefined || e.noseShape !== undefined)) {
    const shape = e.noseShape ?? c.shape;
    return {
      ...c,
      length: newLen ?? c.length,
      shape,
      shapeParameter: e.noseShape !== undefined ? NOSE_SHAPE_PARAM[e.noseShape] : c.shapeParameter,
      children,
    };
  }
  if (newLen !== undefined && "length" in c) {
    return { ...c, length: newLen, children };
  }

  const span = e.finSpan !== undefined && e.finSpan > 0 ? e.finSpan : undefined;
  const count = e.finCount !== undefined && e.finCount >= 1 ? Math.round(e.finCount) : undefined;
  const root = e.finRootChord !== undefined && e.finRootChord > 0 ? e.finRootChord : undefined;
  const tip = e.finTipChord !== undefined && e.finTipChord > 0 ? e.finTipChord : undefined;
  const sweep = e.finSweepLength !== undefined && e.finSweepLength >= 0 ? e.finSweepLength : undefined;
  const thick = e.finThickness !== undefined && e.finThickness > 0 ? e.finThickness : undefined;
  const cross = e.finCrossSection;
  if (
    span !== undefined ||
    count !== undefined ||
    root !== undefined ||
    tip !== undefined ||
    sweep !== undefined ||
    thick !== undefined ||
    cross !== undefined
  ) {
    if (c.kind === "trapezoidfinset") {
      // Root/tip chord and sweep reshape the trapezoid directly; the aero and mass read them, so
      // area and CP follow. Only trapezoidal sets take a chord/sweep edit (a generic set's chord is
      // a reduction). Thickness and edge cross-section drive the fin drag and apply to every kind.
      return {
        ...c,
        height: span ?? c.height,
        finCount: count ?? c.finCount,
        rootChord: root ?? c.rootChord,
        tipChord: tip ?? c.tipChord,
        sweepLength: sweep ?? c.sweepLength,
        thickness: thick ?? c.thickness,
        crossSection: cross ?? c.crossSection,
        children,
      };
    }
    if (c.kind === "ellipticalfinset" || c.kind === "freeformfinset") {
      const height = span ?? c.height;
      // A generic set stores its planform area; scale it with any span change to keep the shape.
      const area = span !== undefined && c.height > 0 ? c.area * (span / c.height) : c.area;
      return {
        ...c,
        height,
        area,
        finCount: count ?? c.finCount,
        thickness: thick ?? c.thickness,
        crossSection: cross ?? c.crossSection,
        children,
      };
    }
  }
  return children === c.children ? c : { ...c, children };
}

/** Set one surface finish on a component and its whole subtree — the "what if the whole airframe
 *  were polished / left rough?" edit. Uniform, so the roughest-present rule the aero uses just
 *  reduces to the chosen finish. */
function withFinish(c: RocketComponent, finish: SurfaceFinish): RocketComponent {
  const children = c.children.length ? c.children.map((ch) => withFinish(ch, finish)) : c.children;
  return { ...c, finish, children };
}

/** Scale the outer airframe radially by `f` — every body tube, the nose base, and each transition
 *  (with their shoulders) — so the mould line stays faired at a new caliber. This is the "same
 *  design in a wider/narrower tube" what-if: the aerodynamic outer surface (which sets the
 *  reference area, and so the drag and the stability caliber) scales, while fins, the nose profile,
 *  the motor, and internal fittings (couplers, rings, mounts) keep their size. */
function scaleAirframeRadii(c: RocketComponent, f: number): RocketComponent {
  const children = c.children.length ? c.children.map((ch) => scaleAirframeRadii(ch, f)) : c.children;
  if (c.kind === "nosecone") {
    return {
      ...c,
      aftRadius: c.aftRadius * f,
      aftShoulderRadius: c.aftShoulderRadius !== undefined ? c.aftShoulderRadius * f : c.aftShoulderRadius,
      children,
    };
  }
  if (c.kind === "bodytube") {
    return { ...c, outerRadius: c.outerRadius * f, children };
  }
  if (c.kind === "transition") {
    return { ...c, foreRadius: c.foreRadius * f, aftRadius: c.aftRadius * f, children };
  }
  // Internal tubes and rings scale with the caliber too, so they stay inside the airframe and a
  // narrowed tube doesn't leave a coupler or centring ring as the widest (reference) part. The
  // motor keeps its own diameter, so a scaled mount just changes the annular gap around it.
  if (
    c.kind === "innertube" ||
    c.kind === "tubecoupler" ||
    c.kind === "centeringring" ||
    c.kind === "bulkhead" ||
    c.kind === "engineblock"
  ) {
    return { ...c, outerRadius: c.outerRadius * f, innerRadius: c.innerRadius * f, children };
  }
  return children === c.children ? c : { ...c, children };
}

/** The design's representative surface finish — the roughest one present, since that is what drives
 *  the skin-friction drag. Defaults to "unfinished" when no component names a finish. */
export function primaryFinish(rocket: Rocket): SurfaceFinish {
  const present = new Set(
    flattenRocket(rocket)
      .map((p) => p.component.finish)
      .filter((f): f is SurfaceFinish => f !== undefined),
  );
  // SURFACE_FINISHES is smoothest→roughest; the last present one is the roughest.
  for (let i = SURFACE_FINISHES.length - 1; i >= 0; i--) {
    if (present.has(SURFACE_FINISHES[i])) return SURFACE_FINISHES[i];
  }
  return "unfinished";
}

/** Return a design with the geometry edits applied. The original rocket is untouched (a fresh tree
 *  is returned only where something changed), so callers can keep the imported model pristine. */
export function applyGeometryEdits(rocket: Rocket, edits: GeometryEdits): Rocket {
  if (!hasGeometryEdits(edits)) return rocket;
  // Resolve which components the length edits target, once, from the pristine design.
  const lengths = new Map<string, number>();
  if (edits.noseLength !== undefined && edits.noseLength > 0) {
    const nose = primaryNose(rocket);
    if (nose) lengths.set(nose.id, edits.noseLength);
  }
  if (edits.bodyLength !== undefined && edits.bodyLength > 0) {
    const tube = primaryBodyTube(rocket);
    if (tube) lengths.set(tube.id, edits.bodyLength);
  }
  const finish = edits.finish;
  // Diameter what-if: the factor that takes the pristine primary tube to the target diameter, then
  // applied to the whole outer airframe so it stays faired. 1 (no scaling) when unset or degenerate.
  let radiusScale = 1;
  if (edits.bodyDiameter !== undefined && edits.bodyDiameter > 0) {
    const tube = primaryBodyTube(rocket);
    if (tube && tube.outerRadius > 0) radiusScale = edits.bodyDiameter / 2 / tube.outerRadius;
  }
  const editOne = (c: RocketComponent): RocketComponent => {
    let geo = editComponent(c, edits, lengths);
    if (finish) geo = withFinish(geo, finish);
    if (radiusScale !== 1) geo = scaleAirframeRadii(geo, radiusScale);
    return geo;
  };
  return {
    ...rocket,
    stages: rocket.stages.map((s) => ({ ...s, components: s.components.map(editOne) })),
  };
}
