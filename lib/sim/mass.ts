/** Mass properties derived from the component tree: total mass, centre of gravity, and
 *  longitudinal (pitch) moment of inertia about the CG. Masses come from each component's
 *  geometry and material density where that is well-defined (tubes, rings, fins, bodies of
 *  revolution), and from an explicit value where the design gives one (mass components,
 *  `<overridemass>`). The method and its approximations are documented in the in-app methods
 *  section and the limitations log.
 *
 *  Everything is SI. The CG is measured from the nose tip. The motor's contribution is
 *  time-varying (propellant burns off) and is added by the simulator via `combine`. */

import type { Rocket, RocketComponent, Stage, NoseCone, Transition } from "../model/types";
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
  /** The component this mass belongs to, for surfaces that key off the same identity the diagram
   *  and the parts table do. Absent on the lumped mass of a stage-level override, which stands for
   *  a whole assembly rather than one part. */
  componentId?: string;
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
    case "tubefinset": {
      // N thin-walled cylinders: annular wall volume each. Their CG is the tube mid-length —
      // they are uniform along the airframe axis.
      const ro = c.outerRadius;
      const ri = Math.max(0, ro - c.thickness);
      mass = Math.PI * (ro * ro - ri * ri) * c.length * c.finCount * density(c);
      cgLocal = c.length / 2;
      ownInertia = (mass * c.length * c.length) / 12;
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

  // Shoulder mass: the collar of a nose cone or transition that plugs into the neighbouring tube
  // is real material a bare body-of-revolution volume misses (OpenRocket counts it). Add it before
  // the override check, since a stated component mass already includes it.
  let shoulderMass = 0;
  let shoulderMoment = 0;
  if (overrideMass === undefined && (c.kind === "nosecone" || c.kind === "transition")) {
    for (const s of shoulderContribs(c, p.xFore)) {
      shoulderMass += s.mass;
      shoulderMoment += s.mass * s.cg;
    }
  }

  if (overrideMass !== undefined) mass = overrideMass;

  // A clustered motor mount is N motor tubes, not one; scale the tube's own structural mass to
  // match (the motors themselves are added N times by the simulator). Modelled coaxially, so
  // the extra tubes sit on the centreline — fine for the vertical-plane mass/CG the solver uses.
  //
  // **Only an INNER TUBE is one of those N tubes.** A `motorMount` also sits on a `BodyTube`
  // (`types.ts:120`) — the airframe itself — and a cluster of three motors inside a 50 mm airframe
  // is three motor tubes inside ONE airframe, not three airframes. Scaling the host regardless was
  // reachable from the "Motor cluster" field on 12 of the 35 real designs, every one of which ships
  // `clusterCount: 1` and so had to be typed to reach: measured on `01.One-stage.ork`, a 50.3 mm
  // body tube, Motors 1 → 3 moved dry mass 0.4241 → 0.5881 kg (+38.7%) and CG 674.0 → 713.8 mm
  // (+39.7 mm); on `Parallel booster staging.ork` +74.1% and +96.7 mm; on `OR vs RAS Test 1.ork`
  // +65.9% and +100.0 mm. CG is what the static margin is measured from, so that is a wrong
  // stability number from a legal edit, on the surface a flyer sizes nose ballast against.
  //
  // **No corpus design exercises this, and saying so is the point** — the two files that ship a
  // cluster (`Airstart timing.ork` at 3, `Clustered motors.ork` at 4) both carry it on an
  // `innertube`, where the scale is correct and unchanged. The census cannot move, so the guard is
  // pinned by a synthetic case in `mass.test.ts` rather than by the sweep.
  //
  // What this deliberately does NOT do is invent the extra motor tubes' mass on an airframe-hosted
  // cluster. Loft is told nothing about their geometry there — a body tube's `motorMount` carries an
  // overhang and a count, not a tube — and guessing one would be a confident number from no data.
  // Under-counting two thin motor tubes is a small, disclosed error; tripling the airframe is not.
  // Recorded on the limitations page.
  const cluster = c.kind === "innertube" ? c.motorMount?.clusterCount ?? 1 : 1;
  if (cluster > 1) {
    mass *= cluster;
    ownInertia *= cluster;
  }

  const bodyCg = overrideCg !== undefined ? p.xFore + overrideCg : p.xFore + cgLocal;
  const totalMass = mass + shoulderMass;
  if (totalMass <= 0) return null;
  // Mass-weighted CG of the body and its shoulder(s), which sit fore/aft of the body proper.
  const cg = (mass * bodyCg + shoulderMoment) / totalMass;
  return { mass: totalMass, cg, ownInertia, source: c.name || c.kind, componentId: c.id };
}

/** Mass and CG of each shoulder of a nose cone or transition — the collar that plugs into the
 *  neighbouring tube. Modelled as a tube of the shoulder's radius and wall (falling back to the
 *  component's own wall, then solid) plus an end-cap disc when the shoulder is capped, placed at
 *  its own centre: a nose's (and a transition's aft) shoulder sits just below the component, a
 *  transition's fore shoulder just above it. Empty when no shoulder is stated or the material has
 *  no density. Same geometry-times-density method as the rest of the mass model. */
function shoulderContribs(c: NoseCone | Transition, xFore: number): { mass: number; cg: number }[] {
  const rho = density(c);
  if (rho <= 0) return [];
  const wall = c.thickness && c.thickness > 0 ? c.thickness : 0;
  const out: { mass: number; cg: number }[] = [];
  const add = (
    radius: number | undefined,
    length: number | undefined,
    thickness: number | undefined,
    capped: boolean | undefined,
    cg: number,
  ): void => {
    if (!(radius && radius > 0) || !(length && length > 0)) return;
    // Solid shoulder when neither the shoulder nor the component states a wall thickness.
    const t = thickness && thickness > 0 ? thickness : wall > 0 ? wall : radius;
    const ri = Math.max(0, radius - t);
    let vol = Math.PI * (radius * radius - ri * ri) * length;
    if (capped && ri > 0) vol += Math.PI * ri * ri * Math.min(t, length); // end-cap bulkhead
    const mass = vol * rho;
    if (mass > 0) out.push({ mass, cg });
  };
  const aftLen = c.aftShoulderLength ?? 0;
  if (c.kind === "nosecone") {
    add(c.aftShoulderRadius, c.aftShoulderLength, c.aftShoulderThickness, c.aftShoulderCapped, xFore + c.length + aftLen / 2);
  } else {
    const foreLen = c.foreShoulderLength ?? 0;
    add(c.foreShoulderRadius, c.foreShoulderLength, c.foreShoulderThickness, c.foreShoulderCapped, xFore - foreLen / 2);
    add(c.aftShoulderRadius, c.aftShoulderLength, c.aftShoulderThickness, c.aftShoulderCapped, xFore + c.length + aftLen / 2);
  }
  return out;
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

/** True when a stage carries a whole-assembly mass override — the same "override mass of all
 *  subcomponents" rule OpenRocket applies to any component assembly, here at the stage level. */
function stageOverridesSubtreeMass(s: Stage): boolean {
  return s.overrideMass !== undefined && s.overrideSubcomponents === true;
}

/** Every component under `roots`, including the roots themselves. */
function collectSubtree(roots: RocketComponent[]): Set<RocketComponent> {
  const set = new Set<RocketComponent>();
  const walk = (cs: RocketComponent[]) => {
    for (const c of cs) {
      set.add(c);
      walk(c.children);
    }
  };
  walk(roots);
  return set;
}

/** What states the mass covering this component, or null when nothing does — the assembly's or the
 *  stage's own name, ready to put in a sentence.
 *
 *  Asked by the surfaces that offer an edit, so a panel does not have to walk the tree itself and get
 *  a different answer from the solver. A design can state a measured weight for a whole assembly, and
 *  then a part inside it weighs nothing on its own: adding one does not raise the total (which the
 *  mass panel already says) and REMOVING one does not lower it. That second half had nothing saying
 *  so. Measured on `EscapeVelocity.ork`, weighed at stage level: removing its 141.7 g "Avionics"
 *  leaves dry mass at exactly 2000.0 g while the margin moves 4.461 → 4.312 cal — the model is right,
 *  because that is what an override means, but a flyer who deletes a part and watches the mass not
 *  move has been told nothing. */
/** What an assembly carrying a whole-subtree override is CALLED, wherever one has to be named.
 *
 *  One function because two had drifted: `massByComponent` fell back to the component's `kind` (or
 *  the bare word "stage") for an unnamed carrier while `statedMassHolder` fell back to "this
 *  assembly" / "this stage". The parts table reads the first and the property panel's withheld-mass
 *  hint reads the second, so on a design whose override-carrying assembly has an empty `<name>` the
 *  two surfaces named the same carrier differently — the split this whole area keeps producing. */
export function carrierLabel(c: RocketComponent | Stage): string {
  return c.name || ("kind" in c ? c.kind : "stage");
}

/** True when this component states ONE weight for itself and everything inside it — an override the
 *  flyer can still restate, unlike one an ancestor imposes. `statedMassHolder` deliberately answers
 *  only the ancestor question, so this is the other half a surface needs before it can describe what
 *  a mass field on that part would actually cover. */
export function statesOwnAssemblyMass(rocket: Rocket, id: string): boolean {
  for (const p of flattenAll(rocket)) if (p.id === id) return overridesSubtreeMass(p);
  return false;
}

function flattenAll(rocket: Rocket): RocketComponent[] {
  const out: RocketComponent[] = [];
  const walk = (cs: RocketComponent[]) => {
    for (const c of cs) {
      out.push(c);
      walk(c.children);
    }
  };
  for (const st of rocket.stages) walk(st.components);
  return out;
}

export function statedMassHolder(rocket: Rocket, id: string): string | null {
  // Wrapped rather than returned bare, because "found it, nothing covers it" and "did not find it"
  // are both null and mean opposite things.
  const search = (cs: RocketComponent[], covering: string | null): { holder: string | null } | null => {
    for (const c of cs) {
      // A component's OWN override is not what covers it — that figure goes with it when it is
      // removed. Only an ancestor's does, and the OUTERMOST one wins, exactly as
      // `structurePointMasses` resolves it: a nested override inside an already-subsumed subtree
      // contributes nothing and must not be the one named.
      if (c.id === id) return { holder: covering };
      const hit = search(c.children, covering ?? (overridesSubtreeMass(c) ? carrierLabel(c) : null));
      if (hit) return hit;
    }
    return null;
  };
  for (const stage of rocket.stages) {
    const hit = search(stage.components, stageOverridesSubtreeMass(stage) ? carrierLabel(stage) : null);
    if (hit) return hit.holder;
  }
  return null;
}

/** Would stating a balance point on the component `id` names actually move the DESIGN's balance
 *  point — or is the control a no-op?
 *
 *  **The CG question is not the mass question, and answering it with `statedMassHolder` would have
 *  been wrong on three of the four lumped corpus designs.** For a stated WEIGHT the hazard is a
 *  double-count, and the predicate is "does an ancestor already state this part's mass". For a
 *  stated CG there is nothing to add to, so the hazard is a silent no-op — and the two do not
 *  coincide:
 *
 *  - *RASAero's airframe lump*: the shells carry no material, `componentPointMass` returns null, and
 *    an `overrideCGx` on them reaches nothing. Dead — and `statedMassHolder` says the OPPOSITE. It
 *    returns null for all 8 of these (nothing covers their mass, so offer the control), because the
 *    mass side's refusal on RASAero does not come from it at all: it comes from `statedAirframeMass`
 *    and `lumpFor` in the panel. An earlier draft of this docblock claimed the two agreed here; over
 *    the 70 corpus controls they disagree on **13**, in both directions — the 5 below, plus these 8
 *    where `statedMassHolder` would have offered a control that demonstrably does nothing.
 *  - *A component-level whole-subtree override*: descendants are skipped outright below, so a CG on
 *    a descendant is dead — but a CG on the CARRIER is honoured normally, where its mass field is
 *    the one that must be refused. The two predicates point opposite ways on the same part.
 *  - *A stage-level override* (3 of the 35 corpus designs): the lump's CG is recomputed from every
 *    subsumed part whenever the stage states no `overrideCGx` of its own, so a per-part CG on a
 *    subsumed part **is live and does move the design's balance point** — while a per-part MASS on
 *    that same part is dead. `statedMassHolder` answers identically for this case and the one above,
 *    so reusing it would have greyed out a control that demonstrably works.
 *
 *  So this is measured rather than argued: perturb the part's stated CG and see whether the design's
 *  moves. Two probes, at each end of the part, because a single one lands on the current station
 *  whenever the part already balances there — a probe that changes nothing cannot tell a dead
 *  control from an unmoved one. This is the same "derive it from the solver rather than reason about
 *  the tree" that `massCarriedBy` reached the long way round, and it costs two extra passes over a
 *  tree the panel already walks several times per render. */
/** The local station (m from the part's own fore end) that `overrideCGx` REPLACES — which is not the
 *  same quantity as the part's reported CG, and the difference is what a placeholder must not get
 *  wrong.
 *
 *  **`overrideCGx` sets the BODY's centroid, and a shoulder is then blended in aft of it.**
 *  `componentPointMass` computes `bodyCg = xFore + overrideCg` and then returns
 *  `(mass * bodyCg + shoulderMoment) / totalMass`, so on the 15 corpus nose cones that carry a
 *  shoulder the part acts up to 133 mm behind the station the flyer stated. Offering the reported CG
 *  as the placeholder made the control non-idempotent: typing the number the box already showed moved
 *  the design's CG on 15 of 57 live controls, and the part then read back a third number again.
 *
 *  Recovered by inversion rather than by re-deriving the centroid, so there is one definition of the
 *  blend and this cannot drift from it. The reported CG is affine in `overrideCGx` — slope
 *  `mass / totalMass`, which is 1 with no shoulder — so two probes give the slope and the current
 *  reported CG gives the station. Returns `undefined` where the part reports no CG at all (it carries
 *  no structural mass of its own, or its mass is subsumed), because there is no figure to show. */
export function localBodyCGx(rocket: Rocket, id: string): number | undefined {
  const part = flattenRocket(rocket).find((p) => p.component.id === id);
  const len = part ? (part.component as { length?: number }).length : undefined;
  if (!part || len === undefined || !(len > 0)) return undefined;
  const reported = massByComponent(rocket).get(id)?.cg;
  if (reported === undefined || !Number.isFinite(reported)) return undefined;
  const at = (cgx: number) => massByComponent(withOverrideCGx(rocket, id, cgx)).get(id)?.cg;
  const lo = at(0);
  const hi = at(len);
  if (lo === undefined || hi === undefined || !Number.isFinite(lo) || !Number.isFinite(hi)) return undefined;
  const slope = (hi - lo) / len;
  if (!(Math.abs(slope) > 1e-12)) return undefined;
  const local = (reported - lo) / slope;
  return Number.isFinite(local) ? Math.min(Math.max(local, 0), len) : undefined;
}

/** One definition of "the same rocket with a different stated CG on one part", shared by the two
 *  probes below so they cannot disagree about what they are perturbing. */
function withOverrideCGx(rocket: Rocket, id: string, cgx: number): Rocket {
  const rewrite = (c: RocketComponent): RocketComponent =>
    c.id === id
      ? ({ ...c, overrideCGx: cgx } as RocketComponent)
      : c.children.length
        ? { ...c, children: c.children.map(rewrite) }
        : c;
  return { ...rocket, stages: rocket.stages.map((s) => ({ ...s, components: s.components.map(rewrite) })) };
}

export function statedCGReachesDesign(rocket: Rocket, id: string): boolean {
  const part = flattenRocket(rocket).find((p) => p.component.id === id);
  const len = part ? (part.component as { length?: number }).length : undefined;
  if (!part || len === undefined || !(len > 0)) return false;
  const base = dryMassProperties(rocket).cg;
  if (!Number.isFinite(base)) return false;
  for (const probe of [0, len]) {
    const moved = dryMassProperties(withOverrideCGx(rocket, id, probe)).cg;
    if (Number.isFinite(moved) && Math.abs(moved - base) > 1e-9) return true;
  }
  return false;
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
  // A stage-level subtree override subsumes every component in the stage; otherwise scan its
  // components for their own overrides. Collect the overridden stages to emit a lumped mass below.
  const overriddenStages: Stage[] = [];
  for (const stage of rocket.stages) {
    if (stageOverridesSubtreeMass(stage)) {
      overriddenStages.push(stage);
      for (const c of collectSubtree(stage.components)) subsumed.add(c);
    } else {
      scan(stage.components);
    }
  }

  const positioned = flattenRocket(rocket);
  const out: PointMass[] = [];
  for (const p of positioned) {
    if (subsumed.has(p.component)) continue; // mass folded into a subtree override
    const pm = componentPointMass(p);
    if (pm) out.push(pm);
  }

  // For each stage that overrides its whole mass, emit one lumped point mass: the measured stage
  // weight, at the stage's natural centre of gravity (the mass-weighted centroid of its own parts),
  // or the override CG when the design gives one. OpenRocket keeps the CG at the natural centroid
  // unless overridden and only replaces the total — so the stage's stability is preserved while its
  // mass reflects the measured figure. The natural inertia is scaled by the mass ratio to stay
  // consistent (6-DOF-ready), and the motor is layered on separately as always.
  for (const stage of overriddenStages) {
    const comps = collectSubtree(stage.components);
    const natural: PointMass[] = [];
    let foreX = Infinity;
    for (const p of positioned) {
      if (!comps.has(p.component)) continue;
      foreX = Math.min(foreX, p.xFore);
      const pm = componentPointMass(p);
      if (pm) natural.push(pm);
    }
    const nat = combine(natural);
    const mass = stage.overrideMass ?? 0;
    if (mass <= 0) continue;
    const cg =
      stage.overrideCGx !== undefined
        ? (Number.isFinite(foreX) ? foreX : 0) + stage.overrideCGx
        : nat.cg;
    const ownInertia = nat.mass > 0 ? nat.inertia * (mass / nat.mass) : 0;
    out.push({ mass, cg, ownInertia, source: stage.name || "stage" });
  }
  return out;
}

/** Dry mass properties (no motor). */
export function dryMassProperties(rocket: Rocket): MassProperties {
  return combine(structurePointMasses(rocket));
}

/** What each component contributes to the dry structure, keyed by the component id the diagram and
 *  the parts table already use — so one part can be pointed at in the picture and read in the table
 *  with its mass beside its dimensions.
 *
 *  A part whose mass is folded into an ancestor's whole-assembly override contributes nothing of its
 *  own; it is reported with `subsumedBy` naming the assembly that carries it, so the table can say
 *  where the mass went rather than show a misleading zero. */
export interface ComponentMass {
  /** Mass this component contributes to the dry structure (kg); 0 when subsumed. */
  mass: number;
  /** Absolute CG station from the nose tip (m); undefined when subsumed. */
  cg?: number;
  /** The assembly whose mass override subsumed this part, when one did. */
  subsumedBy?: string;
}

export function massByComponent(rocket: Rocket): Map<string, ComponentMass> {
  const out = new Map<string, ComponentMass>();
  for (const pm of structurePointMasses(rocket)) {
    if (pm.componentId) out.set(pm.componentId, { mass: pm.mass, cg: pm.cg });
  }
  // Anything the walk skipped is subsumed by an ancestor (or stage) override. Name the nearest
  // ancestor that carries a whole-assembly override so the row says where its mass is counted.
  const label = carrierLabel;
  const walk = (components: RocketComponent[], carrier: string | undefined) => {
    for (const c of components) {
      const carriedBy = carrier ?? (overridesSubtreeMass(c) ? label(c) : undefined);
      if (carrier && !out.has(c.id)) out.set(c.id, { mass: 0, subsumedBy: carrier });
      walk(c.children, carriedBy);
    }
  };
  for (const stage of rocket.stages) {
    walk(stage.components, stageOverridesSubtreeMass(stage) ? label(stage) : undefined);
  }
  return out;
}

/** The point masses that stand for a whole airframe's stated weight rather than for a part inside it.
 *
 *  A RASAero file states one launch weight and no per-part masses, so its adapter has nowhere to put
 *  that weight except a single point mass — and `lib/model/edit.ts` refuses to remove one, because
 *  taking it out leaves a rocket with no mass at all that Loft would still fly and still report a
 *  confident apogee for. That refusal used to hang on a flag the RASAero adapter set by hand, and the
 *  flag did not survive Loft's own `.ork` export: saving `Show-off.CDX1` as a `.ork` and reopening it
 *  kept the 453.6 g and lost the refusal, so the flyer could delete the design's entire weight and
 *  fly the 0.0 g rocket that was left. `OR vs RAS Test 1.CDX1` went 17145.8 g → 12777.0 g and still
 *  reported 7373 m.
 *
 *  So it is DERIVED rather than remembered — from the thing the refusal actually claims: would taking
 *  this out leave no mass at all? That question can be asked of any design, from any format, at any
 *  point in its life, and it cannot be lost in a file that has nowhere to write it down.
 *
 *  Per stage, not per design: a staged rocket is several airframes flown in sequence, and a booster
 *  whose whole stated weight is one point mass is in exactly the position a single-stage one is. That
 *  is what `Complex.Two-Stage.CDX1` needs — its two airframe masses are only load-bearing one stage at
 *  a time, and a whole-design test sees each of them held up by the other and flags neither.
 *
 *  Checked against all 35 corpus designs: it reproduces the hand-set flag exactly — the same 4 masses
 *  on the same 3 designs, nothing added and nothing dropped — both as imported and after an export and
 *  re-import. In particular it does NOT fire on `EscapeVelocity.ork`, whose stage carries its 2000 g as
 *  a subtree override: removing that design's one mass object leaves the 2000 g standing, so it is a
 *  part inside the design and stays removable. */
export function airframeMassIds(rocket: Rocket): Set<string> {
  const out = new Set<string>();
  const without = (r: Rocket, id: string): Rocket => {
    const prune = (cs: RocketComponent[]): RocketComponent[] =>
      cs.filter((c) => c.id !== id).map((c) => ({ ...c, children: prune(c.children) }));
    return { ...r, stages: r.stages.map((s) => ({ ...s, components: prune(s.components) })) };
  };
  for (const stage of rocket.stages) {
    const alone = { ...rocket, stages: [stage] };
    // A stage with no mass to begin with has nothing for a point mass to stand for, and every mass in
    // it would otherwise qualify vacuously.
    if (dryMassProperties(alone).mass <= 0) continue;
    for (const p of flattenRocket(alone)) {
      if (p.component.kind !== "masscomponent") continue;
      if (dryMassProperties(without(alone, p.component.id)).mass <= 0) out.add(p.component.id);
    }
  }
  return out;
}
