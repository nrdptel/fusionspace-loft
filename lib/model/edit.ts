/** Builder geometry edits: non-destructively apply dimension changes to an imported design,
 *  returning a modified Rocket the whole sim pipeline (mass, aero, flight) then flies. This is the
 *  first step of the in-browser builder — the same "edit → rebuild the model → re-simulate" loop
 *  a from-scratch builder needs, on an imported design.
 *
 *  Fin span is the primary aerodynamic tuning knob (bigger fins move the centre of pressure aft, so
 *  the rocket flies more stable — the classic trade against nose weight), so it's the first
 *  editable dimension. */

import type { Rocket, RocketComponent } from "./types";
import { flattenRocket } from "./geometry";

export interface GeometryEdits {
  /** Absolute fin semi-span (root→tip height, m) for every fin set. Undefined leaves fins as-is. */
  finSpan?: number;
}

/** True when at least one edit actually changes something. */
export function hasGeometryEdits(e: GeometryEdits): boolean {
  return e.finSpan !== undefined && e.finSpan > 0;
}

/** Apply the edits to one component (and its subtree). Trapezoid fins derive their area from
 *  dimensions downstream, so only the height changes; a generic (elliptical/freeform) set stores
 *  its planform area, so it's scaled with the span to keep the shape. */
function editComponent(c: RocketComponent, e: GeometryEdits): RocketComponent {
  const children = c.children.length ? c.children.map((child) => editComponent(child, e)) : c.children;
  const span = e.finSpan;
  if (span !== undefined && span > 0) {
    if (c.kind === "trapezoidfinset") {
      return { ...c, height: span, children };
    }
    if (c.kind === "ellipticalfinset" || c.kind === "freeformfinset") {
      const area = c.height > 0 ? c.area * (span / c.height) : c.area;
      return { ...c, height: span, area, children };
    }
  }
  return children === c.children ? c : { ...c, children };
}

/** Return a design with the geometry edits applied. The original rocket is untouched (a fresh tree
 *  is returned only where something changed), so callers can keep the imported model pristine. */
export function applyGeometryEdits(rocket: Rocket, edits: GeometryEdits): Rocket {
  if (!hasGeometryEdits(edits)) return rocket;
  return {
    ...rocket,
    stages: rocket.stages.map((s) => ({ ...s, components: s.components.map((c) => editComponent(c, edits)) })),
  };
}

/** The design's primary fin set's semi-span (m), for showing the flyer the current value to edit
 *  from. Undefined for a finless design. */
export function primaryFinSpan(rocket: Rocket): number | undefined {
  const fin = flattenRocket(rocket)
    .map((p) => p.component)
    .find((c) => c.kind === "trapezoidfinset" || c.kind === "ellipticalfinset" || c.kind === "freeformfinset");
  return fin && "height" in fin ? fin.height : undefined;
}
