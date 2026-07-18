/** Builder geometry edits: non-destructively apply dimension changes to an imported design,
 *  returning a modified Rocket the whole sim pipeline (mass, aero, flight) then flies. This is the
 *  first step of the in-browser builder — the same "edit → rebuild the model → re-simulate" loop
 *  a from-scratch builder needs, on an imported design.
 *
 *  The geometry is length-derived (flattenRocket stacks components by their lengths), so resizing a
 *  nose cone or body tube automatically shifts everything downstream and recomputes mass, drag,
 *  centre of pressure, and motor position. Fin span moves the centre of pressure (stability). */

import type { Rocket, RocketComponent, NoseCone, BodyTube } from "./types";
import { flattenRocket } from "./geometry";

export interface GeometryEdits {
  /** Absolute fin semi-span (root→tip height, m) for every fin set. Undefined leaves fins as-is. */
  finSpan?: number;
  /** Number of fins per set (≥ 1). Undefined leaves the count as-is. */
  finCount?: number;
  /** Absolute nose-cone length (m) for the design's nose. Undefined leaves it. */
  noseLength?: number;
  /** Absolute length (m) for the design's primary (longest) body tube. Undefined leaves it. */
  bodyLength?: number;
}

/** True when at least one edit actually changes something. */
export function hasGeometryEdits(e: GeometryEdits): boolean {
  return (
    (e.finSpan !== undefined && e.finSpan > 0) ||
    (e.finCount !== undefined && e.finCount >= 1) ||
    (e.noseLength !== undefined && e.noseLength > 0) ||
    (e.bodyLength !== undefined && e.bodyLength > 0)
  );
}

/** The design's nose cone (the frontmost one). */
export function primaryNose(rocket: Rocket): NoseCone | undefined {
  return flattenRocket(rocket)
    .map((p) => p.component)
    .find((c): c is NoseCone => c.kind === "nosecone");
}

/** The design's primary body tube — the longest, i.e. the main airframe. */
export function primaryBodyTube(rocket: Rocket): BodyTube | undefined {
  const tubes = flattenRocket(rocket)
    .map((p) => p.component)
    .filter((c): c is BodyTube => c.kind === "bodytube");
  return tubes.length ? tubes.reduce((a, b) => (b.length > a.length ? b : a)) : undefined;
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

/** Apply the edits to one component (and its subtree). Trapezoid fins derive their area from
 *  dimensions downstream, so only the height changes; a generic (elliptical/freeform) set stores
 *  its planform area, so it's scaled with the span to keep the shape. Length overrides are keyed by
 *  component id (resolved once in applyGeometryEdits). */
function editComponent(c: RocketComponent, e: GeometryEdits, lengths: Map<string, number>): RocketComponent {
  const children = c.children.length ? c.children.map((child) => editComponent(child, e, lengths)) : c.children;

  const newLen = lengths.get(c.id);
  if (newLen !== undefined && "length" in c) {
    return { ...c, length: newLen, children };
  }

  const span = e.finSpan !== undefined && e.finSpan > 0 ? e.finSpan : undefined;
  const count = e.finCount !== undefined && e.finCount >= 1 ? Math.round(e.finCount) : undefined;
  if (span !== undefined || count !== undefined) {
    if (c.kind === "trapezoidfinset") {
      return { ...c, height: span ?? c.height, finCount: count ?? c.finCount, children };
    }
    if (c.kind === "ellipticalfinset" || c.kind === "freeformfinset") {
      const height = span ?? c.height;
      // A generic set stores its planform area; scale it with any span change to keep the shape.
      const area = span !== undefined && c.height > 0 ? c.area * (span / c.height) : c.area;
      return { ...c, height, area, finCount: count ?? c.finCount, children };
    }
  }
  return children === c.children ? c : { ...c, children };
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
  return {
    ...rocket,
    stages: rocket.stages.map((s) => ({ ...s, components: s.components.map((c) => editComponent(c, edits, lengths)) })),
  };
}
