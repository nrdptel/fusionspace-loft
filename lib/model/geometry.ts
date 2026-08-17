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
  /** How deep this component sits in its stage's tree — 0 for a part attached to the stage
   *  itself, 1 for something inside it, and so on.
   *
   *  **The walk below has always been depth-first and has always thrown the depth away**, so every
   *  surface built on it could only show a flat list. That is most of what makes the parts table a
   *  list of parts rather than a picture of the design: measured across the 27 corpus `.ork` files,
   *  **347 of 459 components sit at depth ≥ 1** and the tree runs four deep. A coupler inside a body
   *  tube, a chute inside that coupler and a shock cord beside it all rendered as four siblings of
   *  the nose cone. */
  depth: number;
  /** The id of the component this one is placed against, or `undefined` for a stage-level part.
   *  Carried so a surface can group children under their host without re-walking the tree — and so
   *  it can do it correctly, which an indentation level alone cannot: two parts at the same depth
   *  under different hosts are not siblings. */
  parentId?: string;
  /** Which stage this component belongs to, 0-based from the nose. A staged design is several
   *  trees stacked, not one, and a surface that draws it as one is wrong about the topology even
   *  when it happens to look right. */
  stageIndex: number;
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
    depth: number,
    parentId: string | undefined,
    stageIndex: number,
  ): number => {
    let cursor = parentFore; // aft end of the previous sibling (start = parent fore)
    for (const c of components) {
      const len = axialLength(c);
      const xFore = resolveChildFore(c, parentFore, parentLength, cursor);
      out.push({ component: c, xFore, length: len, bodyRadius: outerRadius(c), depth, parentId, stageIndex });
      cursor = xFore + len;
      if (c.children.length > 0) walk(c.children, xFore, len, depth + 1, c.id, stageIndex);
    }
    return cursor;
  };

  // Stages stack nose→tail: each begins at the aft end of the one above, so a multi-stage stack
  // is one continuous airframe (a single stage just starts at the nose, x=0). Without this the
  // stages would overlap at x=0 — total mass and reference area (and so apogee) survive that, but
  // the centre of gravity, centre of pressure, and stability margin would be badly wrong.
  let stageFore = 0;
  rocket.stages.forEach((stage, stageIndex) => {
    stageFore = walk(stage.components, stageFore, 0, 0, undefined, stageIndex);
  });
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

/** Can a new part be authored immediately BEHIND this one?
 *
 *  **The question is whether it presents an aft face to fair to**, which is exactly what
 *  `aftOuterRadius` answers: a body tube at its own outer radius, a nose cone and a transition at
 *  their aft ones, and nothing for a part that is inside another or mounted on one. A fin set has no
 *  aft face to build from; a centring ring's is not the airframe's.
 *
 *  **Named here rather than spelled as a kind test at each call site, because it was spelled three
 *  times and all three said `bodytube`** — narrower than the code behind them. `buildAdded`'s body
 *  tube arm and `transitionDefaults` both size the new part through `aftOuterRadius(anchor)` and have
 *  always been able to answer for a nose cone or a transition; only the guards in front of them said
 *  otherwise. Measured over the 35-design corpus: body tubes are **90 of 569 parts**, and the three
 *  kinds with an aft face are **150** — so the gesture "another one of these, here" was refused on
 *  the nose cone of every design, which is the first part a from-scratch build has. */
export function canAnchorAfter(c: RocketComponent): boolean {
  const r = aftOuterRadius(c);
  return r !== undefined && r > 0;
}

/** Can a point mass be authored INSIDE this one?
 *
 *  **The third rule, and it is neither of the other two.** `canAnchorAfter` asks for an aft face to
 *  fair to; the bore test asks for a tube to hold a coupler, a ring or a fin set concentric. A point
 *  mass needs neither — it has no radius and touches no mould line. What it needs is an **interior
 *  axial bay to sit in**, and the five kinds below are the ones that have one: their `axialLength`
 *  IS an interior span, so a station a third of the way down it lands inside the part.
 *
 *  **Spelled as an allowlist of kinds rather than a length test, because a length test is what was
 *  there and it is wrong on four kinds.** `buildAdded` asked only `after.length > 0`, which is true
 *  of parts whose length is not a bay at all: a shock cord's is the CORD (24 in the corpus, up to
 *  0.673 m), a launch lug's is a rail that runs down the outside (19), a fin set's `axialLength` is
 *  its root chord (52), a canopy's is its packed length (50). And it is true of a mass object's own
 *  extent, which is not bounded by its host at all — `TubeFins1.rkt` carries one **1.219 m long in a
 *  0.629 m rocket** and `FullScaleModelTH.rkt` one of **6.340 m in a 3.213 m** one, so a mass
 *  authored a third of the way down either would land behind the tail.
 *
 *  **The discs are refused on the same grounds and they are the bulk of the refusals.** Measured
 *  across the 35-design corpus: a centring ring is 1.3–32.0 mm thick (83 parts), a bulkhead
 *  2.0–9.5 mm (29), an engine block 3.0–25.4 mm (14). A plate is not a bay, and offering to hide an
 *  av-bay inside a 2 mm bulkhead would be a gesture that flies a number nobody meant.
 *
 *  Measured over the same corpus for the five that ARE offered: **128 parts** in the four kinds this
 *  adds — nose cone 35, inner tube 37, tube coupler 31, transition 25 — plus the 90 body tubes that
 *  already had it. Authoring a mass into all 128 moves the overall length on 0, `maxBodyRadius` on 0,
 *  the Barrowman CP on 0 and CNa on 0, and leaves a CG inside the airframe on all 128. */
export function canHostInsideMass(c: RocketComponent): boolean {
  switch (c.kind) {
    case "nosecone":
    case "bodytube":
    case "innertube":
    case "tubecoupler":
    case "transition":
      return true;
    default:
      return false;
  }
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

/** The full physical extent of a part in its OWN frame (m), fore end at 0 — shoulders included.
 *
 *  **This is the bound a stated balance point is held to, and `[0, length]` is the wrong one.** That
 *  was correct while `overrideCGx` meant the SHELL's centroid, which cannot leave the body. Since
 *  2026-08-13 it means the WHOLE part's centroid, shoulders included (OpenRocket's
 *  `RocketComponent.getCG()`), and that legitimately sits outside the body: a shoulder carrying most
 *  of the part's mass pulls the balance point aft of the base, and a transition's FORE shoulder pulls
 *  it fore of the datum, to negative x.
 *
 *  Measured on the corpus the day the semantics changed: `rocket.ork` carries two 12.70 mm
 *  transitions whose 152.4 mm aft shoulders hold ~92% of their mass, and whose whole-part CG is
 *  **81.96 mm** — six times the body's own length. Clamping that to `[0, len]` handed the panel a
 *  placeholder of 12.70 mm for a part balancing at 81.96, which is the non-idempotent placeholder the
 *  stated-CG control exists not to have: typing back the figure the box showed moved the design's CG.
 *  20 of the 804 catalogued nose cones with a shoulder are the same shape and are one click from the
 *  front door.
 *
 *  A bound is still wanted — a station off the end of the physical part means nothing, and an
 *  unbounded field stored a balance point a thousand kilometres down a zero-length cone once. This is
 *  that bound, drawn around the part that exists rather than around the body alone. */
export function statedCGBounds(c: RocketComponent): { min: number; max: number } | undefined {
  const len = (c as { length?: number }).length;
  if (len === undefined || !(len > 0)) return undefined;
  if (c.kind === "nosecone") return { min: 0, max: len + (c.aftShoulderLength ?? 0) };
  if (c.kind === "transition")
    return { min: -(c.foreShoulderLength ?? 0), max: len + (c.aftShoulderLength ?? 0) };
  return { min: 0, max: len };
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
