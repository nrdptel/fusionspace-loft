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
    case "tubefinset":
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

/** The diameter (m) of the flat face the airframe presents to the airstream, or 0 when it leads with
 *  a nose cone or a full taper.
 *
 *  Loft's drag model takes forebody pressure and wave drag from whichever component is a nose cone,
 *  wherever it sits in the stack, and it has **no term at all for a blunt leading face** — the same
 *  shape of silence as the missing term for a bare mould-line step. That did not matter while the
 *  component order came from a file, because every real design leads with its nose. It matters now
 *  that a flyer can reorder the stack: measured on `fixtures/demo-quirks.ork`, nudging the nose cone
 *  one place aft leaves apogee at 1406.622 m, max velocity at 227.893 m/s and rail exit at 26.023 m/s
 *  — every digit identical to the streamlined design — while the rocket in the model is flying a
 *  66 mm flat disc into the airstream. Only the static margin moves.
 *
 *  So this is what the flight has to be able to SAY. It is a measurement of the geometry, not a
 *  judgement about it: a design may legitimately have no nose cone at all (RASAero states none), and a
 *  transition that tapers from zero is a nose by another name. What is reported is the face itself. */
export function leadingFaceDiameter(rocket: Rocket): number {
  const bodies = flattenRocket(rocket).filter((p) => isBody(p.component));
  if (!bodies.length) return 0;
  const front = bodies.reduce((best, p) => (p.xFore < best.xFore - 1e-9 ? p : best));
  const c = front.component;
  if (c.kind === "nosecone") return 0;
  // A transition states its own fore radius; anything else presents its full outer radius.
  const r = c.kind === "transition" ? c.foreRadius : outerRadius(c);
  return r > 0 ? 2 * r : 0;
}

/** The outer radius (m) a part presents at its AFT face, or undefined when it is not on the outer
 *  mould line at all (a fin set, a mass object, anything internal). */
export function aftOuterRadius(c: RocketComponent): number | undefined {
  return c.kind === "bodytube"
    ? c.outerRadius
    : c.kind === "nosecone" || c.kind === "transition"
      ? c.aftRadius
      : undefined;
}

/** The outer radius (m) a part presents at its FORE face. A nose cone comes to a point, so 0. */
export function foreOuterRadius(c: RocketComponent): number | undefined {
  return c.kind === "bodytube"
    ? c.outerRadius
    : c.kind === "transition"
      ? c.foreRadius
      : c.kind === "nosecone"
        ? 0
        : undefined;
}

/** The part that sits immediately behind `afterId` in the airframe's nose-to-tail chain, if any.
 *
 *  Top-level components only — an inner tube or a coupler is not on the outer mould line, so a walk
 *  that descended into children would read a joint that the airstream never sees, and it is also the
 *  only list a part can be stacked into (see `applyAdds`). But ACROSS stage boundaries, because a
 *  stack is one airframe until it separates. Searching one stage's list read the last tube of a
 *  booster as having nothing behind it, which is how an "add a tail cone" gesture put a contracting
 *  cone in the MIDDLE of a multi-stage rocket. Measured over the starter plus the corpus: 12 stage
 *  boundaries, all 12 joined end to end with no gap, and 10 of the 91 body tubes mis-read — the
 *  worst opening a 77.4 mm step on `02.Two-stage.ork`. */
export function nextTopLevel(rocket: Rocket, afterId: string): RocketComponent | undefined {
  const chain = rocket.stages.flatMap((s) => s.components);
  const i = chain.findIndex((c) => c.id === afterId);
  return i === -1 ? undefined : chain[i + 1];
}

/** The smallest mould-line step worth a sentence, in metres of DIAMETER.
 *
 *  Measured across the 35-design corpus: 33 joints step at all, and the sample falls into two groups
 *  with nothing between them — six from 0.0004 to 0.292 mm, which are rounding artefacts of designs
 *  stated in inches rather than steps anyone built, and 27 of 0.800 mm and up, median 12.70 mm. 0.5 mm sits
 *  in that gap, so the threshold is read off the data rather than chosen. Below it the notice would
 *  fire on arithmetic instead of on geometry, and a flag that cries wolf teaches flyers to ignore it. */
export const STEP_NOTICE_M = 0.0005;

/** One joint at which the airframe's outer mould line steps, with no length to take a slope over. */
export interface MouldLineStep {
  /** The component the step sits immediately behind. */
  id: string;
  /** Axial station of the joint (m). */
  x: number;
  /** Outer radius (m) each side of the joint. */
  foreRadius: number;
  aftRadius: number;
  /** The change in DIAMETER (m) across the joint: positive steps out, negative steps in. */
  diameterStep: number;
}

/** Every joint at which the mould line steps, nose→tail.
 *
 *  A shoulder that has LENGTH is a transition, and the drag model charges it by its joint angle
 *  (Niskanen eq. 3.86 for a shoulder, 3.88 for a boattail). A bare step is the same geometry with
 *  the length taken to zero, and the model has no term for it — eq. 3.86's own 0.8 is Hoerner's
 *  measured FLAT-FACE value for a body in clean flow, not for an annulus sitting inside the
 *  boundary layer of the body ahead of it, and charging it as though it were takes the corpus from
 *  agreeing to 35% low on `02.Two-stage.ork`. So the step is reported, not estimated.
 *
 *  It is not exotic and it is not something the editor invents: measured across the 35-design
 *  corpus, 33 of the 115 joints this can judge already step, in 13 of the 35 designs, by a median
 *  11.75 mm of diameter and up to 82.55 mm. `Show-off.CDX1` runs a 1.5 in tube straight into a
 *  2.73 in fin can.
 *
 *  A joint is only judged when the two parts actually meet: a gap between them is a different
 *  geometry, and one Loft does not model either. */
export function mouldLineSteps(rocket: Rocket): MouldLineStep[] {
  const flat = flattenRocket(rocket);
  const placed = new Map(flat.map((p) => [p.component.id, p]));
  const out: MouldLineStep[] = [];
  for (const stage of rocket.stages) {
    for (const c of stage.components) {
      const self = placed.get(c.id);
      const next = nextTopLevel(rocket, c.id);
      const after = next ? placed.get(next.id) : undefined;
      if (!self || !next || !after) continue;
      const fore = aftOuterRadius(c);
      const aft = foreOuterRadius(next);
      if (fore === undefined || aft === undefined) continue;
      // Only a joint the two parts actually share.
      if (Math.abs(after.xFore - (self.xFore + self.length)) > 1e-6) continue;
      if (fore === aft) continue;
      out.push({
        id: c.id,
        x: after.xFore,
        foreRadius: fore,
        aftRadius: aft,
        diameterStep: 2 * (aft - fore),
      });
    }
  }
  return out;
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
