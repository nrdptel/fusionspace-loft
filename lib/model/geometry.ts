/** Resolve the component tree into absolute axial positions. OpenRocket places each
 *  component relative to its parent (top/middle/bottom/after/absolute); the physics needs
 *  every part's absolute station from the nose tip. This walk is pure and shape-aware, and
 *  is the shared front-end for both the mass and the aerodynamic passes. */

import type {
  Rocket,
  RocketComponent,
  Stage,
  NoseShape,
} from "./types";

export interface Positioned {
  component: RocketComponent;
  /** Absolute axial station of the component's fore end, from the nose tip (m). */
  xFore: number;
  /** Axial length used for placement/mass (m). */
  length: number;
  /** Outer radius at this component's location (m), for interference/reference use. */
  bodyRadius: number;
}

/** The axial length a component occupies (m) — the span used both to stack it and to
 *  place its own children. Zero-length parts (a thin bulkhead, a packed chute) still have
 *  a placement span from their stated packed/own length. */
export function axialLength(c: RocketComponent): number {
  switch (c.kind) {
    case "nosecone":
    case "bodytube":
    case "transition":
    case "innertube":
    case "tubecoupler":
    case "centeringring":
    case "bulkhead":
    case "engineblock":
      return c.length;
    case "trapezoidfinset":
    case "ellipticalfinset":
    case "freeformfinset":
      return c.rootChord;
    case "masscomponent":
      return c.length ?? 0;
    case "parachute":
      return c.packedLength ?? 0;
    case "streamer":
      return c.packedLength ?? 0;
    default:
      return c.length ?? 0;
  }
}

/** Outer radius of a body component (m); non-body parts return 0. */
export function outerRadius(c: RocketComponent): number {
  switch (c.kind) {
    case "nosecone":
      return c.aftRadius;
    case "bodytube":
      return c.outerRadius;
    case "transition":
      return Math.max(c.foreRadius, c.aftRadius);
    case "innertube":
    case "tubecoupler":
    case "centeringring":
    case "bulkhead":
    case "engineblock":
      return c.outerRadius;
    default:
      return 0;
  }
}

/** Resolve a child's absolute fore-end station given its placement and its parent. */
function resolveChildFore(
  child: RocketComponent,
  parentFore: number,
  parentLength: number,
  cursorAfter: number,
): number {
  const len = axialLength(child);
  const { method, offset } = child.placement;
  switch (method) {
    case "absolute":
      return offset;
    case "top":
      return parentFore + offset;
    case "middle":
      return parentFore + (parentLength - len) / 2 + offset;
    case "bottom":
      return parentFore + parentLength - len + offset;
    case "after":
    default:
      return cursorAfter + offset;
  }
}

/** Depth-first flatten of the active stage(s), each component tagged with its absolute
 *  fore station. Top-level body components stack (the running cursor is the aft end of the
 *  previous sibling); subcomponents place against their parent. */
export function flattenRocket(rocket: Rocket): Positioned[] {
  const out: Positioned[] = [];

  const walk = (
    components: RocketComponent[],
    parentFore: number,
    parentLength: number,
  ): number => {
    let cursor = parentFore; // aft end of the previous sibling (start = parent fore)
    for (const c of components) {
      const len = axialLength(c);
      const xFore = resolveChildFore(c, parentFore, parentLength, cursor);
      out.push({ component: c, xFore, length: len, bodyRadius: outerRadius(c) });
      cursor = xFore + len;
      if (c.children.length > 0) walk(c.children, xFore, len);
    }
    return cursor;
  };

  // Stages stack nose→tail: each begins at the aft end of the one above, so a multi-stage stack
  // is one continuous airframe (a single stage just starts at the nose, x=0). Without this the
  // stages would overlap at x=0 — total mass and reference area (and so apogee) survive that, but
  // the centre of gravity, centre of pressure, and stability margin would be badly wrong.
  let stageFore = 0;
  for (const stage of rocket.stages) {
    stageFore = walk(stage.components, stageFore, 0);
  }
  return out;
}

/** Total on-axis length of the rocket (nose tip to aft-most body end, m). */
export function overallLength(rocket: Rocket): number {
  const flat = flattenRocket(rocket);
  let max = 0;
  for (const p of flat) {
    if (isBody(p.component)) max = Math.max(max, p.xFore + p.length);
  }
  return max;
}

/** Maximum outer body radius (m) — the default aerodynamic reference radius. */
export function maxBodyRadius(rocket: Rocket): number {
  let max = 0;
  for (const p of flattenRocket(rocket)) {
    max = Math.max(max, outerRadius(p.component));
  }
  return max;
}

/** Reference radius (m) for aerodynamic coefficients, per the rocket's reference type. */
export function referenceRadius(rocket: Rocket): number {
  if (rocket.referenceType === "custom" && rocket.referenceRadius) {
    return rocket.referenceRadius;
  }
  if (rocket.referenceType === "nose") {
    const nose = flattenRocket(rocket).find((p) => p.component.kind === "nosecone");
    if (nose) return outerRadius(nose.component);
  }
  return maxBodyRadius(rocket);
}

export function isBody(c: RocketComponent): boolean {
  return c.kind === "nosecone" || c.kind === "bodytube" || c.kind === "transition";
}

/** Body outer radius at an arbitrary axial station x (m) — used to seat a fin set on the
 *  body for the fin-body interference factor. Returns the max radius spanning x. */
export function radiusAtStation(rocket: Rocket, x: number): number {
  let r = 0;
  for (const p of flattenRocket(rocket)) {
    if (!isBody(p.component)) continue;
    if (x >= p.xFore - 1e-6 && x <= p.xFore + p.length + 1e-6) {
      r = Math.max(r, outerRadius(p.component));
    }
  }
  return r;
}

export const NOSE_SHAPES: NoseShape[] = [
  "ogive",
  "conical",
  "ellipsoid",
  "power",
  "parabolic",
  "haack",
];

export type { Stage };
