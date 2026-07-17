/** Mass properties derived from the component tree: total mass, centre of gravity, and
 *  longitudinal (pitch) moment of inertia about the CG. Masses come from each component's
 *  geometry and material density where that is well-defined (tubes, rings, fins, bodies of
 *  revolution), and from an explicit value where the design gives one (mass components,
 *  `<overridemass>`). The method and its approximations are documented in the in-app methods
 *  section and the limitations log.
 *
 *  Everything is SI. The CG is measured from the nose tip. The motor's contribution is
 *  time-varying (propellant burns off) and is added by the simulator via `combine`. */

import type { Rocket, RocketComponent } from "../model/types";
import { flattenRocket, type Positioned } from "../model/geometry";
import { noseProps, transitionProps } from "./shapes";

export interface PointMass {
  /** Mass (kg). */
  mass: number;
  /** Absolute CG station from the nose tip (m). */
  cg: number;
  /** Component's own transverse inertia about its CG (kg·m²); 0 if treated as a point. */
  ownInertia: number;
  /** For diagnostics: which component produced this. */
  source: string;
}

export interface MassProperties {
  mass: number;
  /** CG from the nose tip (m). */
  cg: number;
  /** Pitch/yaw moment of inertia about the CG (kg·m²). */
  inertia: number;
}

/** Combine a set of point masses into aggregate mass properties. */
export function combine(points: PointMass[]): MassProperties {
  let mass = 0;
  let moment = 0;
  for (const p of points) {
    mass += p.mass;
    moment += p.mass * p.cg;
  }
  const cg = mass > 0 ? moment / mass : 0;
  let inertia = 0;
  for (const p of points) {
    const d = p.cg - cg;
    inertia += p.ownInertia + p.mass * d * d;
  }
  return { mass, cg, inertia };
}

function density(c: RocketComponent): number {
  return c.material?.density ?? 0;
}

/** Mass and CG of a single positioned component from its geometry + material. Returns null
 *  for parts that carry no structural mass here (they may still be added elsewhere). */
function componentPointMass(p: Positioned): PointMass | null {
  const c = p.component;

  // An explicit override wins for both mass and CG.
  const overrideMass = "overrideMass" in c ? c.overrideMass : undefined;
  const overrideCg = "overrideCGx" in c ? c.overrideCGx : undefined;

  let mass = 0;
  let cgLocal = p.length / 2; // default: mid-length
  let ownInertia = 0;

  switch (c.kind) {
    case "nosecone": {
      const t = c.thickness && c.thickness > 0 && c.thickness < c.aftRadius ? c.thickness : 0;
      const outer = noseProps(c.shape, c.length, c.aftRadius, c.shapeParameter ?? 0);
      let vol = outer.volume;
      let cg = outer.centroid;
      if (t > 0) {
        const Li = Math.max(0, c.length - t);
        const Ri = Math.max(0, c.aftRadius - t);
        const inner = noseProps(c.shape, Li, Ri, c.shapeParameter ?? 0);
        const innerTipOffset = c.length - Li; // solid tip depth
        const innerCgAbs = innerTipOffset + inner.centroid;
        const shellVol = Math.max(0, outer.volume - inner.volume);
        vol = shellVol;
        cg = shellVol > 0 ? (outer.volume * outer.centroid - inner.volume * innerCgAbs) / shellVol : outer.centroid;
      }
      mass = vol * density(c);
      cgLocal = cg;
      ownInertia = mass * c.length * c.length / 12;
      break;
    }
    case "transition": {
      const t = c.thickness && c.thickness > 0 ? c.thickness : 0;
      const outer = transitionProps(c.shape, c.length, c.foreRadius, c.aftRadius, c.shapeParameter ?? 0);
      let vol = outer.volume;
      let cg = outer.centroid;
      if (t > 0) {
        const inner = transitionProps(
          c.shape,
          c.length,
          Math.max(0, c.foreRadius - t),
          Math.max(0, c.aftRadius - t),
          c.shapeParameter ?? 0,
        );
        vol = Math.max(0, outer.volume - inner.volume);
        cg = outer.centroid;
      }
      mass = vol * density(c);
      cgLocal = cg;
      ownInertia = mass * c.length * c.length / 12;
      break;
    }
    case "bodytube": {
      const ro = c.outerRadius;
      const ri = Math.max(0, ro - (c.thickness ?? ro));
      const vol = Math.PI * (ro * ro - ri * ri) * c.length;
      mass = vol * density(c);
      cgLocal = c.length / 2;
      ownInertia = (mass * c.length * c.length) / 12;
      break;
    }
    case "innertube": {
      const ro = c.outerRadius;
      const ri = Math.max(0, c.innerRadius);
      const vol = Math.PI * (ro * ro - ri * ri) * c.length;
      mass = vol * density(c);
      cgLocal = c.length / 2;
      ownInertia = (mass * c.length * c.length) / 12;
      break;
    }
    case "tubecoupler":
    case "centeringring":
    case "bulkhead":
    case "engineblock": {
      const ro = c.outerRadius;
      const ri = Math.max(0, c.innerRadius);
      const vol = Math.PI * (ro * ro - ri * ri) * c.length;
      mass = vol * density(c);
      cgLocal = c.length / 2;
      break;
    }
    case "trapezoidfinset": {
      const area = ((c.rootChord + c.tipChord) / 2) * c.height;
      const vol = area * c.thickness * c.finCount;
      mass = vol * density(c);
      // Chordwise area centroid of one fin, from the root leading edge.
      cgLocal = finChordCentroid(c.rootChord, c.tipChord, c.sweepLength);
      ownInertia = mass * c.rootChord * c.rootChord / 12;
      break;
    }
    case "ellipticalfinset":
    case "freeformfinset": {
      const vol = c.area * c.thickness * c.finCount;
      mass = vol * density(c);
      // Chordwise area centroid (the fin's mass CG), from the root leading edge. A half-ellipse fin
      // is symmetric about its mid-chord — every spanwise strip is centred at c_root/2 — so its area
      // centroid is exactly 0.5·c_root (the same symmetric shape whose aerodynamic centre the aero
      // pass puts at 0.288·c_root, and where OpenRocket places the elliptical fin's CG). A freeform
      // planform has no closed form and its outline isn't retained past import, so it keeps a
      // mid-planform estimate — a small error on a light part.
      cgLocal = c.kind === "ellipticalfinset" ? 0.5 * c.rootChord : 0.42 * c.rootChord;
      break;
    }
    case "masscomponent": {
      mass = c.mass;
      cgLocal = (c.length ?? 0) / 2;
      break;
    }
    case "parachute": {
      mass = c.mass;
      cgLocal = (c.packedLength ?? 0) / 2;
      break;
    }
    case "streamer": {
      mass = c.mass;
      cgLocal = (c.packedLength ?? 0) / 2;
      break;
    }
    case "shockcord":
    case "launchlug":
    case "railbutton": {
      mass = c.mass ?? 0;
      cgLocal = (c.length ?? 0) / 2;
      break;
    }
  }

  if (overrideMass !== undefined) mass = overrideMass;

  // A clustered motor mount is N motor tubes, not one; scale the tube's own structural mass to
  // match (the motors themselves are added N times by the simulator). Modelled coaxially, so
  // the extra tubes sit on the centreline — fine for the vertical-plane mass/CG the solver uses.
  const cluster = "motorMount" in c ? c.motorMount?.clusterCount ?? 1 : 1;
  if (cluster > 1) {
    mass *= cluster;
    ownInertia *= cluster;
  }

  const cg = overrideCg !== undefined ? p.xFore + overrideCg : p.xFore + cgLocal;
  if (mass <= 0) return null;
  return { mass, cg, ownInertia, source: c.name || c.kind };
}

/** Chordwise centroid of a trapezoidal fin, measured aft of the root leading edge (m). */
export function finChordCentroid(root: number, tip: number, sweep: number): number {
  // Area centroid x̄ of a trapezoid with parallel chords `root` (y=0) and `tip` (y=h),
  // the tip leading edge swept aft by `sweep`. Integrated over the span.
  const denom = root + tip;
  if (denom <= 0) return 0;
  // x̄ = (2·sweep·? ) — split into the swept LE contribution and the chord-shape term.
  const leTerm = (sweep * (root + 2 * tip)) / (3 * denom);
  const chordTerm = (root * root + root * tip + tip * tip) / (3 * denom);
  return leTerm + chordTerm / 1; // aft of root LE
}

/** True when a component carries a mass override that OpenRocket applies to its whole
 *  subtree (`<overridemass>` together with the "override mass of all subcomponents" flag).
 *  Such an override replaces the combined mass of the component AND every descendant with
 *  the single stated figure — the design's own measured weight for the assembly. */
function overridesSubtreeMass(c: RocketComponent): boolean {
  const overrideMass = "overrideMass" in c ? c.overrideMass : undefined;
  const subtree = "overrideSubcomponents" in c ? c.overrideSubcomponents : undefined;
  return overrideMass !== undefined && subtree === true;
}

/** The dry structural point masses of the rocket (everything except the motor). Computed
 *  once per design; the motor is layered on per time step by the simulator.
 *
 *  Honours OpenRocket's "override mass of all subcomponents": when a component states a
 *  measured mass for its whole assembly, that figure stands in for the component and every
 *  part inside it, so the descendants' own masses are NOT added on top (adding them would
 *  double-count — the bug this guards against). The override component itself is still
 *  emitted normally: `componentPointMass` already applies its override mass at its own CG,
 *  matching OpenRocket, which places the lumped mass there and contributes nothing from the
 *  subsumed children. A motor is unaffected — it is layered on separately by the simulator,
 *  exactly as OpenRocket keeps motor mass outside a structural override. */
export function structurePointMasses(rocket: Rocket): PointMass[] {
  // Collect every component subsumed by an ancestor that overrides its whole subtree's mass.
  // A pre-order walk visits ancestors before descendants, so the outermost override wins and
  // a nested override inside an already-subsumed subtree is simply ignored (as OpenRocket does).
  const subsumed = new Set<RocketComponent>();
  const markSubtree = (c: RocketComponent) => {
    for (const ch of c.children) {
      subsumed.add(ch);
      markSubtree(ch);
    }
  };
  const scan = (components: RocketComponent[]) => {
    for (const c of components) {
      if (!subsumed.has(c) && overridesSubtreeMass(c)) markSubtree(c);
      scan(c.children);
    }
  };
  for (const stage of rocket.stages) scan(stage.components);

  const out: PointMass[] = [];
  for (const p of flattenRocket(rocket)) {
    if (subsumed.has(p.component)) continue; // mass folded into an ancestor's subtree override
    const pm = componentPointMass(p);
    if (pm) out.push(pm);
  }
  return out;
}

/** Dry mass properties (no motor). */
export function dryMassProperties(rocket: Rocket): MassProperties {
  return combine(structurePointMasses(rocket));
}
