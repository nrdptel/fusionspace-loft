/** Builder geometry edits: non-destructively apply dimension changes to an imported design,
 *  returning a modified Rocket the whole sim pipeline (mass, aero, flight) then flies. This is the
 *  first step of the in-browser builder — the same "edit → rebuild the model → re-simulate" loop
 *  a from-scratch builder needs, on an imported design.
 *
 *  The geometry is length-derived (flattenRocket stacks components by their lengths), so resizing a
 *  nose cone or body tube automatically shifts everything downstream and recomputes mass, drag,
 *  centre of pressure, and motor position. Fin span moves the centre of pressure (stability). */

import type { Rocket, RocketComponent, ComponentKind, NoseCone, BodyTube, Transition, Parachute, Material, SurfaceFinish, NoseShape, FinCrossSection, MotorMount, MassComponent } from "./types";
import { flattenRocket } from "./geometry";
import { uniqueUuidFrom } from "./id";
import type { Positioned } from "./geometry";

/** Selectable nose-cone shapes, for the builder's nose picker. Ordered by how a flyer thinks of
 *  them (sharp → blunt, then the parametrised low-drag families). */
export const NOSE_SHAPES: NoseShape[] = ["ogive", "conical", "ellipsoid", "parabolic", "power", "haack"];

/** Selectable fin edge cross-sections, for the builder's fin-profile picker. Ordered draggiest →
 *  cleanest (square stagnates the flow, rounded halves that, airfoil is streamlined). */
export const FIN_CROSS_SECTIONS: FinCrossSection[] = ["square", "rounded", "airfoil"];

/** A selectable fin stock for the builder's material picker: a display label, the bulk density
 *  that sets the fin mass, and a material name the flutter estimate recognises for its shear
 *  modulus. Densities are representative engineering figures for the common fin stocks; ordered
 *  lightest/floppiest → heaviest/stiffest, which is also roughly the flutter-resistance order. */
export interface FinMaterialOption {
  key: string;
  label: string;
  /** Stored as the fin's material name so the flutter estimate resolves its shear modulus. */
  name: string;
  /** Bulk density (kg/m³). */
  density: number;
}
export const FIN_MATERIALS: FinMaterialOption[] = [
  { key: "balsa", label: "Balsa", name: "balsa", density: 130 },
  { key: "basswood", label: "Basswood", name: "basswood", density: 420 },
  { key: "plywood", label: "Birch plywood", name: "birch plywood", density: 680 },
  { key: "g10", label: "G10 fibreglass", name: "G10 fibreglass", density: 1850 },
  { key: "carbon", label: "Carbon fibre", name: "carbon fibre", density: 1550 },
  { key: "aluminium", label: "Aluminium", name: "aluminium", density: 2700 },
];

/** Airframe-shell materials for the builder's body/nose/transition material picker — the common
 *  tube stocks, lightest → heaviest. Bulk densities are representative values for the laminate or
 *  stock (fibreglass/carbon/phenolic laminates, vulcanised-fibre "Blue Tube", spiral-wound kraft
 *  cardboard, birch ply, 6061 aluminium). Reuses the fin-material option shape. */
export const AIRFRAME_MATERIALS: FinMaterialOption[] = [
  { key: "cardboard", label: "Cardboard", name: "cardboard", density: 700 },
  { key: "plywood", label: "Birch plywood", name: "birch plywood", density: 680 },
  { key: "kraft-phenolic", label: "Kraft phenolic", name: "kraft phenolic", density: 950 },
  { key: "bluetube", label: "Blue Tube", name: "vulcanised fibre", density: 1250 },
  { key: "carbon", label: "Carbon fibre", name: "carbon fibre", density: 1550 },
  { key: "fibreglass", label: "Fibreglass", name: "fibreglass", density: 1850 },
  { key: "aluminium", label: "Aluminium", name: "aluminium", density: 2700 },
];

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

/** One part the flyer authored. Deliberately a THIN record: an id, what kind it is, what it sits behind,
 *  and the one dimension that has no sensible neighbour to inherit. Everything else — diameter, wall,
 *  material, finish — comes from the part it was added after, because a new tube that does not fair to
 *  the airframe it joins is a geometry no flyer meant to draw, and because a modal wall of number fields
 *  is exactly what the roadmap says to resist. The numbers are the confirmation, not the gesture: once
 *  the part is there, the editor's existing fields aim at it and change it. */
export interface AddedPart {
  /** Minted once when the part is authored, and stable from then on. UUID-shaped, so the part can be
   *  exported to `.ork` and re-imported as itself — see `lib/model/id.ts` for why that shape. */
  id: string;
  /** What to build. The switch in `buildAdded` is where the rest arrive. */
  kind: "bodytube" | "trapezoidfinset" | "transition";
  /** The component this goes immediately AFTER, in its stage's own top-level list. An id rather than an
   *  index or a role, so it still means the same part after a length edit, a removal, or a reload. */
  after: string;
  /** Length (m) — a tube's own length, and the one dimension a neighbour cannot supply: inheriting it
   *  would silently double the airframe, and zero is not a part. Ignored by kinds that have no length
   *  of their own to choose; a fin set copies the design's own, and a transition takes the length its
   *  own diameter change implies (see `transitionDefaults`). */
  length: number;
  /** What to call it on the diagram and in the parts list. */
  name?: string;
}

export interface GeometryEdits {
  /** Which fin set the fin fields describe and edit. Undefined means the frontmost one, which is
   *  what the panel has always used and what every readback below still falls back to. This is a
   *  SELECTION, not an edit: on its own it changes no geometry, so `hasGeometryEdits` ignores it and
   *  a design with only a selection set is still flown untouched.
   *
   *  It matters because 13 of the 35 corpus designs carry more than one fin set, and until now the
   *  other sets could not be reached at all. The edit still lands on the selected set's whole GROUP
   *  — every set indistinguishable from it — so a ring the file stores as three parts resizes
   *  together, exactly as before. */
  finSetId?: string;
  /** Which body tube the body fields describe and edit. Undefined means the design's primary tube —
   *  the longest — which is what the panel has always used and what every readback below still falls
   *  back to. Like `finSetId` this is a SELECTION, not an edit: on its own it changes no geometry, so
   *  `hasGeometryEdits` ignores it and a design with only a selection set is flown untouched.
   *
   *  It matters because 23 of the 35 corpus designs carry more than one body tube AS LOFT IMPORTS THEM
   *  — `Two stage high power rocket.ork` eight, `03.Three-stage.ork` nine — and until now every one of
   *  them but the longest was unreachable: `Body length` silently resized whichever tube happened to be
   *  longest, however far from the part the flyer had picked. (Counting raw `<bodytube>` tags instead
   *  gives 20 of the 27 `.ork`, which overstates the reach: three of those designs keep tubes inside pod
   *  or parallel-stage assemblies the importer declines to fly, and a part that is not imported is not a
   *  part a flyer can pick.) */
  bodyTubeId?: string;
  /** Which transition the transition fields describe and edit. Undefined means the design's frontmost
   *  one, which is what every readback below falls back to. A SELECTION, not an edit, exactly like the
   *  other aims.
   *
   *  It matters because a transition is where an airframe changes caliber, and 12 of the 35 corpus
   *  designs carry one — 25 in all, 17 of them between two body sections and 8 at the tail — and until
   *  now not one of them could be touched. The only transition a flyer could shape was a boattail they
   *  had just asked for by typing two numbers into fields that create one; a transition the design
   *  came with was read-only. */
  transitionId?: string;
  /** Which recovery canopy the recovery fields describe and edit. Undefined means the design's main
   *  parachute — the largest by canopy area — which is what the panel has always used and what every
   *  readback below still falls back to. A SELECTION, not an edit, exactly like the two above.
   *
   *  It matters more than either: 17 of the 35 corpus designs carry more than one parachute — every
   *  dual-deploy design does, by definition — and the drogue was unreachable on all of them. A flyer
   *  who picked the drogue and resized it resized the MAIN instead, which moves landing speed and
   *  landing energy, the two numbers recovery sizing exists to get right. */
  parachuteId?: string;
  /** Components the flyer has removed, oldest first — the design's structural deletions.
   *
   *  An ordered LIST rather than a set, because the order is what makes it undoable: dropping the last
   *  entry restores exactly the design before that deletion, since the model is always rebuilt from the
   *  pristine one plus this bag. That is the same property the flat dimension fields have (retype the
   *  number and you are back) and the reason a deletion needed it more: a number can be retyped from
   *  memory and a deleted part cannot.
   *
   *  Removing a component takes everything mounted inside it — a body tube goes with its motor mount,
   *  its fins and its parachute — and drops any motor whose mount went with it. A motor left pointing at
   *  a mount that no longer exists is not inert: `lib/sim/setup.ts` resolves the mount to undefined and
   *  places the motor's mass at station 0, at the nose tip, which is a wrong flight rather than no
   *  flight. */
  removedIds?: string[];
  /** Parts the flyer AUTHORED rather than imported, oldest first.
   *
   *  The first edit that is an operation rather than a value. Everything else in this bag is a scalar
   *  standing for "the design, but with this dimension changed" — a shape that cannot express "add a
   *  body tube", because there is no field for a part that does not exist yet and no way to say WHICH
   *  of three. Loft has added components before (a boattail, a dual-deploy drogue, a payload point
   *  mass) but each is a special case with one instance and a hard-coded anchor; this is the general
   *  one, and the flat fields keep working beside it until the operation path covers them.
   *
   *  An ordered LIST for the same reason `removedIds` is: the order is what makes it undoable, since
   *  the model is always rebuilt from the pristine design plus this bag. Each entry carries its own id,
   *  minted once, so an aim, a removal and an undo all address the same part across rebuilds. */
  added?: AddedPart[];
  /** Absolute fin semi-span (root→tip height, m) for the fin group the panel describes — the
   *  primary set and any set indistinguishable from it. Undefined leaves fins as-is. */
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
  /** Longitudinal position (m from the nose tip) the primary (frontmost) fin set's fore edge should
   *  sit at. Every fin set shifts by the same amount, keeping their spacing, so the whole fin group
   *  moves fore or aft. This is the third classic stability lever: moving the fins aft moves the
   *  centre of pressure aft and raises the static margin (nose ballast trims the CG forward; fin
   *  span and this trim the CP aft). It barely touches drag or mass, so it isolates the stability
   *  effect. Undefined leaves the fins where the design puts them. */
  finStation?: number;
  /** Fin thickness (m) for the primary fin group — drives the fin drag (skin-friction form factor,
   *  edge pressure, wave) and the flutter margin (∝ (t/c)³). Undefined leaves it. */
  finThickness?: number;
  /** Fin edge cross-section for the primary fin group — square, rounded, or airfoil. Sets the fin edge
   *  pressure drag: a square edge stagnates the flow head-on, a rounded edge roughly halves that,
   *  an airfoil is streamlined. The "what would airfoiling my fins buy?" what-if. Undefined leaves
   *  each set's own profile. */
  finCrossSection?: FinCrossSection;
  /** Fin material for the primary fin group, as a `FIN_MATERIALS` key — sets the fin density (so mass, CG
   *  and stability follow) and the material the flutter estimate reads for its shear modulus, so
   *  a stiffer stock visibly raises the flutter margin. The "would G10 fix my flutter?" what-if.
   *  Undefined (or an unknown key) leaves each set's own material. */
  finMaterial?: string;
  /** Absolute nose-cone length (m) for the design's nose. Undefined leaves it. */
  noseLength?: number;
  /** Nose-cone contour for the design's nose (drives nose pressure and wave drag). Chosen from the
   *  picker as a canonical instance of the shape. Undefined leaves it. */
  noseShape?: NoseShape;
  /** Absolute length (m) for the body tube `bodyTubeId` names — the longest when nothing is picked.
   *  Only that one tube resizes; everything aft of it restacks. Undefined leaves it. */
  bodyLength?: number;
  /** Target outer diameter (m) of the body tube `bodyTubeId` names. The whole outer airframe (nose
   *  base, every body tube, transitions and their shoulders) scales by the same factor to hit it,
   *  keeping the mould line faired — the "same design in a wider/narrower tube" what-if. Fins, the
   *  nose profile, the motor, and internal fittings keep their size. Unlike `bodyLength` this stays
   *  group-wide on purpose: a design whose tubes step down through a transition would come apart if
   *  one of them were widened alone, so the picked tube sets the TARGET and the airframe follows it.
   *  Undefined leaves it. */
  bodyDiameter?: number;
  /** Absolute length (m) for the transition `transitionId` names — the frontmost when nothing is
   *  picked. Only that one transition resizes; everything aft of it restacks, exactly as a body
   *  tube's length does. This is the fairing-angle lever: a boattail's own pressure drag fades to
   *  nothing as it lengthens (Niskanen eq. 3.88 interpolates over γ = L / 2·ΔR, full base drag at
   *  γ ≤ 1 and none at γ ≥ 3), and a shoulder's grows as it shortens. Undefined leaves it. */
  transitionLength?: number;
  /** Absolute exit (aft) diameter (m) of the transition `transitionId` names. The caliber the
   *  airframe steps TO — the number a transition exists to set.
   *
   *  Applied AFTER the whole-airframe caliber scale, so a diameter typed here is the one flown even
   *  when `bodyDiameter` is also set. Nothing aft of the transition follows it: Loft has no mechanism
   *  that resizes parts a flyer did not pick, and inventing one would silently re-caliber an airframe
   *  from a single field. Where that leaves the mould line stepping at the joint behind it, the panel
   *  says so and by how much — see `mouldLineStep`. Undefined leaves it. */
  transitionAftDiameter?: number;
  /** Surface finish applied to the whole airframe (drives skin-friction drag). Undefined leaves
   *  each component's own finish. */
  finish?: SurfaceFinish;
  /** Airframe-shell material (an `AIRFRAME_MATERIALS` key) set on the nose, body tubes, and
   *  transitions — the parts whose mass is computed from geometry × density, so switching stock (say
   *  fibreglass → cardboard) re-masses the airframe and shifts apogee and stability. Fins and
   *  internal fittings keep their own material. Undefined (or an unknown key) leaves each as-is; on a
   *  design whose masses are file overrides (a RockSim import) it changes only the named stock. */
  airframeMaterial?: string;
  /** Add a conical boattail (tail cone) of this axial length (m) at the aft of the airframe. The
   *  first structural *add* in the builder: it contracts the base, so most of the base drag — the
   *  single largest drag source on a blunt-based rocket — goes away, at the cost of a little
   *  boattail pressure drag and mass. Needs `boattailAftDiameter` too; both must be set (and the
   *  exit narrower than the body) to add one. Undefined adds nothing. */
  boattailLength?: number;
  /** The added boattail's exit (aft) diameter (m). Must be > 0 and < the body diameter. */
  boattailAftDiameter?: number;
  /** Convert recovery to dual-deploy: the design's main (largest) parachute deploys at this
   *  altitude AGL (m) instead of at apogee. Needs `drogueDiameter` too — a main alone deploying low
   *  would free-fall ballistically from apogee, so both are required to build a valid dual-deploy.
   *  Undefined leaves recovery as-is. */
  mainDeployAltitude?: number;
  /** Diameter (m) of the drogue added at apogee for the dual-deploy above — it controls the descent
   *  from apogee down to the main's deployment. Needs `mainDeployAltitude` too. */
  drogueDiameter?: number;
  /** Resize the design's main (largest) parachute to this canopy diameter (m). The applyable
   *  companion to the recovery-sizing readout, which names the canopy a target landing speed needs
   *  but couldn't set: this bakes it in, scaling the canopy mass with its area (∝ diameter²) and
   *  flowing into the flight (descent rate, landing speed, deployment) and the export. Undefined
   *  leaves the parachute as-is; ignored on a design with no parachute. */
  mainParachuteDiameter?: number;
  /** Number of motors the mount holds (≥ 1). Flown as this many identical coaxial motors — N× the
   *  thrust and motor mass — so it answers "what would clustering buy?" A cluster is set on every
   *  motor mount in the design (a from-scratch or single-stage design has one); 1 flies a single
   *  motor (de-clustering an imported cluster). Undefined leaves the mount(s) as-is. */
  motorClusterCount?: number;
  /** Add a payload / avionics-bay mass of this many kg — the real, often dominant, non-structural
   *  weight (electronics, tracker, ballast, nose weight) that a from-scratch design needs to fly
   *  honestly. Modelled as a point mass inside the airframe, so it adds to the loaded mass and shifts
   *  the CG toward its station — apogee falls and the static margin moves. Undefined adds nothing. */
  payloadMassKg?: number;
  /** Where the added payload sits, as a station (m) from the nose tip. Undefined places it at the
   *  mid-point of the main body tube (a typical bay location); a value overrides that, clamped to
   *  keep the mass inside the airframe. Only meaningful with `payloadMassKg`. */
  payloadStation?: number;
}


/** True when at least one edit actually changes something. */
export function hasGeometryEdits(e: GeometryEdits): boolean {
  return (
    (e.removedIds !== undefined && e.removedIds.length > 0) ||
    (e.added !== undefined && e.added.length > 0) ||
    (e.finSpan !== undefined && e.finSpan > 0) ||
    (e.finCount !== undefined && e.finCount >= 1) ||
    (e.finRootChord !== undefined && e.finRootChord > 0) ||
    (e.finTipChord !== undefined && e.finTipChord > 0) ||
    (e.finSweepLength !== undefined && e.finSweepLength >= 0) ||
    (e.finStation !== undefined && e.finStation > 0) ||
    (e.finThickness !== undefined && e.finThickness > 0) ||
    e.finCrossSection !== undefined ||
    (e.finMaterial !== undefined && FIN_MATERIALS.some((m) => m.key === e.finMaterial)) ||
    (e.noseLength !== undefined && e.noseLength > 0) ||
    e.noseShape !== undefined ||
    (e.bodyLength !== undefined && e.bodyLength > 0) ||
    (e.bodyDiameter !== undefined && e.bodyDiameter > 0) ||
    (e.transitionLength !== undefined && e.transitionLength > 0) ||
    (e.transitionAftDiameter !== undefined && e.transitionAftDiameter > 0) ||
    e.finish !== undefined ||
    (e.airframeMaterial !== undefined && AIRFRAME_MATERIALS.some((m) => m.key === e.airframeMaterial)) ||
    (e.boattailLength !== undefined && e.boattailLength > 0 &&
      e.boattailAftDiameter !== undefined && e.boattailAftDiameter > 0) ||
    (e.mainDeployAltitude !== undefined && e.mainDeployAltitude > 0 &&
      e.drogueDiameter !== undefined && e.drogueDiameter > 0) ||
    (e.mainParachuteDiameter !== undefined && e.mainParachuteDiameter > 0) ||
    (e.motorClusterCount !== undefined && e.motorClusterCount >= 1) ||
    (e.payloadMassKg !== undefined && e.payloadMassKg > 0)
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

/** The body tube the panel is about: the one picked, or the design's primary tube — the longest, i.e.
 *  the main airframe — when nothing is.
 *
 *  Every body readback and the body edit path resolve through this one function, so the value shown to
 *  edit FROM and the tube the edit is written TO can never name different components. A selection
 *  naming a tube this design doesn't have falls back to the longest rather than resolving to nothing —
 *  a stale id from a restored session must not silently disable the body fields. */
export function primaryBodyTube(rocket: Rocket, selectedId?: string): BodyTube | undefined {
  const tubes = flattenRocket(rocket)
    .map((p) => p.component)
    .filter((c): c is BodyTube => c.kind === "bodytube");
  if (!tubes.length) return undefined;
  const picked = selectedId ? tubes.find((c) => c.id === selectedId) : undefined;
  return picked ?? tubes.reduce((a, b) => (b.length > a.length ? b : a));
}

/** The picked body tube's outer diameter (m) — the caliber a flyer reads the rocket by, and the value
 *  the diameter what-if scales from. Undefined for a tubeless design. */
export function primaryBodyDiameter(rocket: Rocket, selectedId?: string): number | undefined {
  const tube = primaryBodyTube(rocket, selectedId);
  return tube ? tube.outerRadius * 2 : undefined;
}

/** How many body tubes sit OUTSIDE the one the body fields describe — the tubes a flyer can see on
 *  the diagram but cannot reach from this panel without picking one. 0 means the fields speak for the
 *  whole airframe. */
export function unreachableBodyTubeCount(rocket: Rocket): number {
  const tubes = flattenRocket(rocket).filter((p) => p.component.kind === "bodytube");
  return Math.max(0, tubes.length - 1);
}

/** The transition the panel is about: the one picked, or the design's frontmost when nothing is.
 *
 *  Every transition readback and the transition edit path resolve through this one function, for the
 *  same reason the tube and fin ones do: the value shown to edit FROM and the part the edit is written
 *  TO can never name different components. Frontmost rather than "the biggest step" or "the aft-most",
 *  because the fallback's job is to be predictable — the panel names which one it is holding either
 *  way. A selection naming a transition this design doesn't have falls back rather than resolving to
 *  nothing, so a stale id from a restored session cannot silently disable the fields. */
export function primaryTransition(rocket: Rocket, selectedId?: string): Transition | undefined {
  const trans = flattenRocket(rocket)
    .map((p) => p.component)
    .filter((c): c is Transition => c.kind === "transition");
  if (!trans.length) return undefined;
  const picked = selectedId ? trans.find((c) => c.id === selectedId) : undefined;
  return picked ?? trans[0];
}

/** How many transitions sit OUTSIDE the one the transition fields describe. 0 means the fields speak
 *  for the only one the design has. */
export function unreachableTransitionCount(rocket: Rocket): number {
  return Math.max(0, flattenRocket(rocket).filter((p) => p.component.kind === "transition").length - 1);
}

/** The design's primary (frontmost) fin set, if any. */
/** The fin set the panel is about: the one selected, or the frontmost when nothing is.
 *
 *  Every fin readback and the fin edit path resolve through this one function, so the value shown
 *  to edit FROM and the set the edit is written TO can never name different components. A selection
 *  naming a set this design doesn't have falls back to the frontmost rather than resolving to
 *  nothing — a stale id from a restored session must not silently disable the fin fields. */
function primaryFinSet(rocket: Rocket, selectedId?: string) {
  const fins = flattenRocket(rocket)
    .map((p) => p.component)
    .filter((c) => c.kind === "trapezoidfinset" || c.kind === "ellipticalfinset" || c.kind === "freeformfinset");
  return (selectedId ? fins.find((c) => c.id === selectedId) : undefined) ?? fins[0];
}

const FIN_SET_KINDS = ["trapezoidfinset", "ellipticalfinset", "freeformfinset"] as const;

function isFinSet(c: RocketComponent) {
  return (FIN_SET_KINDS as readonly string[]).includes(c.kind);
}

/** The editor's aim registry: for each selection field, which component kinds a pick on them aims it
 *  at, and which value fields' target it decides.
 *
 *  ONE table, because four separate lists were already drifting apart. "Which fields does a pick
 *  re-aim", "which keys are inert", "which selection matters to the design key", and "which panel
 *  names the part it holds" used to be spelled out independently, and every new selection field had to
 *  be added to all four. Missing one fails silently and differently each time: an inert key counted as
 *  a what-if withholds the stored-tool comparison and hides the button that restores it, while a
 *  missing design-key entry leaves a Monte-Carlo presenting one part's numbers after the flyer has
 *  aimed the edit at another. */
export interface AimSlot {
  /** Component kinds a pick on which aims this slot. */
  kinds: readonly ComponentKind[];
  /** The value fields whose target this slot decides. Empty would make the slot pointless. */
  targets: readonly string[];
}
export const AIM_SLOTS: Readonly<Record<string, AimSlot>> = {
  finSetId: {
    kinds: FIN_SET_KINDS,
    targets: [
      "finSpan",
      "finCount",
      "finRootChord",
      "finTipChord",
      "finSweepLength",
      "finStation",
      "finThickness",
      "finCrossSection",
      "finMaterial",
    ],
  },
  bodyTubeId: { kinds: ["bodytube"], targets: ["bodyLength", "bodyDiameter"] },
  transitionId: { kinds: ["transition"], targets: ["transitionLength", "transitionAftDiameter"] },
  parachuteId: {
    kinds: ["parachute"],
    targets: ["mainParachuteDiameter", "mainDeployAltitude", "drogueDiameter"],
  },
};

/** Edit-bag keys that say which component the fields are POINTED AT, or where a part that is not there
 *  yet would go — never that anything changed. Counting one as an edit would withhold the stored-tool
 *  comparison, and hide the button that brings it back, the moment a flyer clicked a part to look at it.
 *
 *  Derived from the registry, plus `payloadStation`, which is inert for a different reason: it places a
 *  payload that does not exist without `payloadMassKg`, so on its own it produces a flight
 *  byte-identical to the design's. Exported because three places have to answer "is this design
 *  edited?" the same way — the app's `hasActiveEdits`, the saved session's what-if count, and this
 *  module — and three spellings of it drift. One of them decides what a flyer is told is being flown. */
export const INERT_EDIT_FIELDS: ReadonlySet<string> = new Set([
  ...Object.keys(AIM_SLOTS),
  "payloadStation",
]);

/** Just the aims out of an edit bag, keyed by slot — what a view needs to show which part each group of
 *  fields is holding, with none of the values. Projected through the registry rather than handed the
 *  whole bag: passing every field would let a value edit masquerade as an aim, and "the aim moved" would
 *  then fire on a typed span with a number where a component id belongs. */
export function aimsOf(e: GeometryEdits): Readonly<Record<string, string | undefined>> {
  const out: Record<string, string | undefined> = {};
  for (const slot of Object.keys(AIM_SLOTS)) out[slot] = (e as Record<string, unknown>)[slot] as string | undefined;
  return out;
}

/** Does this entry in an edit bag represent an actual change?
 *
 *  The ONE predicate. Three places have to answer "is this design edited?" the same way — the app's
 *  `hasActiveEdits`, the saved session's `countWhatIfs`, and this module — and they had drifted twice over.
 *  A selection field says which part the fields point at, not that anything changed. The bag is a patch
 *  spread over the previous one, so a field set and then CLEARED leaves its key holding `undefined`. And an
 *  EMPTY ARRAY is not a change: undoing the last removal leaves `removedIds: []`, which a bare
 *  `v !== undefined && v !== ""` test reads as a value — so a design restored to pristine went on reading as
 *  edited, withholding the stored-tool comparison and hiding the button that brings it back. Fixing that in
 *  one of the three and not the others is exactly how this drifts, so there is now only one. */
export function isEditedValue(key: string, value: unknown): boolean {
  if (INERT_EDIT_FIELDS.has(key)) return false;
  if (value === undefined || value === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/** Which edit target a pick on `id` moves. Picking a part aims the fields that describe THAT KIND of
 *  part at it and leaves every other aim alone: a flyer who has set fin set 2's span and then clicks a
 *  body tube to read it must not have that span silently re-applied to fin set 1. A part no field
 *  describes — a coupler, a centring ring, a launch lug — returns an empty patch, so merely reading it
 *  moves no aim at all. */
export function aimEditsAt(rocket: Rocket, id: string): GeometryEdits {
  const c = flattenRocket(rocket).find((p) => p.component.id === id)?.component;
  if (!c) return {};
  for (const [slot, def] of Object.entries(AIM_SLOTS)) {
    if ((def.kinds as readonly string[]).includes(c.kind)) return { [slot]: id };
  }
  return {};
}

/** Identity of a fin set as a flyer would see it: where it sits and what it looks like. Two sets
 *  with the same key are indistinguishable on the airframe, so they are one physical ring that the
 *  design file happens to store as separate parts — a common OpenRocket pattern, and the reason the
 *  fin edits cannot simply target one component id. */
function finGroupKey(p: Positioned): string {
  const c = p.component as {
    height?: number;
    rootChord?: number;
    tipChord?: number;
    sweepLength?: number;
    thickness?: number;
    finCount?: number;
  };
  return [
    p.xFore.toFixed(6),
    (c.height ?? 0).toFixed(6),
    (c.rootChord ?? 0).toFixed(6),
    (c.tipChord ?? 0).toFixed(6),
    (c.sweepLength ?? 0).toFixed(6),
    (c.thickness ?? 0).toFixed(7),
    c.finCount ?? 0,
  ].join("|");
}

/** The fin sets the panel's fields actually describe: the primary set plus every set identical to
 *  it at the same station. That is one physical ring however many parts the file splits it into, so
 *  a span edit resizes the whole ring and never leaves a rocket with fins of two different sizes.
 *
 *  Measured over the 35-design corpus: 13 designs carry several fin sets. One (`ARC payload
 *  rocket.ork`) is a single 3-fin ring stored as three 1-fin sets, where every set must move
 *  together; the other 12 hold sets that genuinely differ — `03.Three-stage.ork` puts a 19.1 mm
 *  sustainer set beside 108.0 mm booster fins — where editing all of them would destroy the design.
 *  Grouping by appearance is what serves both: it broadcasts only where the sets are
 *  indistinguishable to begin with. */
export function primaryFinGroupIds(rocket: Rocket, selectedId?: string): Set<string> {
  const fins = flattenRocket(rocket).filter((p) => isFinSet(p.component));
  if (!fins.length) return new Set();
  const seed = (selectedId ? fins.find((p) => p.component.id === selectedId) : undefined) ?? fins[0];
  const key = finGroupKey(seed);
  return new Set(fins.filter((p) => finGroupKey(p) === key).map((p) => p.component.id));
}

/** How many fin sets sit OUTSIDE the group the fin fields describe — the sets a flyer can see on the
 *  diagram but cannot reach from this panel. 0 means the fields speak for every fin on the rocket. */
export function unreachableFinSetCount(rocket: Rocket, selectedId?: string): number {
  const fins = flattenRocket(rocket).filter((p) => isFinSet(p.component));
  return fins.length - primaryFinGroupIds(rocket, selectedId).size;
}

/** How a panel should name the part its fields are aimed at, so a design with parts the panel cannot
 *  reach can say WHICH one it is holding rather than labelling them all "Fins" or "Body".
 *
 *  `name` is the design's own, and only when that name tells this part apart from the others it has to
 *  be distinguished from — real files name every part alike ("Fin set", "Body tube"), and a shared name
 *  distinguishes nothing. Otherwise the caller names the part by `station`, where its fore edge sits on
 *  the airframe. That replaces a positional name ("fin set 2"), which was wrong twice over: it counted
 *  in `flattenRocket` order while the parts table beside it can be re-sorted by name, type, station or
 *  mass, so "fin set 2" was not the second fin row on screen; and it named one component while the fin
 *  fields edit its whole appearance-group, so on a design with two identical pairs it named one set and
 *  changed two. A station is stable under every sort, is what a flyer reads off the diagram, and
 *  `covers` states the group size outright instead of implying 1. */
export interface AimedPart {
  /** The design's own name for the part, when it distinguishes it. Undefined ⇒ name it by `station`. */
  name?: string;
  /** Station of the part's fore edge (m from the nose tip). */
  station: number;
  /** How many components the fields actually change — more than 1 where the aim resolves to a group
   *  of indistinguishable parts that must move together. */
  covers: number;
}

/** Build the label for one resolved part. `peers` are the parts it must be told apart from. */
function aimedPart(seed: Positioned, peers: Positioned[], covers: number): AimedPart {
  const own = seed.component.name?.trim();
  const shared = !!own && peers.filter((p) => p.component.name?.trim() === own).length > 1;
  return { name: own && !shared ? own : undefined, station: seed.xFore, covers };
}

/** Which fin set the fin fields are holding, and how many sets they change. Undefined for a finless
 *  design. */
export function primaryFinSetPart(rocket: Rocket, selectedId?: string): AimedPart | undefined {
  const fins = flattenRocket(rocket).filter((p) => isFinSet(p.component));
  if (!fins.length) return undefined;
  const group = primaryFinGroupIds(rocket, selectedId);
  const seed = (selectedId ? fins.find((p) => p.component.id === selectedId) : undefined) ?? fins[0];
  return aimedPart(seed, fins, Math.max(1, group.size));
}

/** Which body tube the body fields are holding. Always one tube — `bodyLength` resizes exactly the
 *  picked part — so `covers` is 1. Undefined for a tubeless design. */
export function primaryBodyTubePart(rocket: Rocket, selectedId?: string): AimedPart | undefined {
  const tubes = flattenRocket(rocket).filter((p) => p.component.kind === "bodytube");
  if (!tubes.length) return undefined;
  const tube = primaryBodyTube(rocket, selectedId);
  const seed = tubes.find((p) => p.component.id === tube?.id) ?? tubes[0];
  return aimedPart(seed, tubes, 1);
}

/** Which transition the transition fields are holding. Always one — both fields change exactly the
 *  picked part — so `covers` is 1. Undefined for a design with no transition. */
export function primaryTransitionPart(rocket: Rocket, selectedId?: string): AimedPart | undefined {
  const trans = flattenRocket(rocket).filter((p) => p.component.kind === "transition");
  if (!trans.length) return undefined;
  const picked = primaryTransition(rocket, selectedId);
  const seed = trans.find((p) => p.component.id === picked?.id) ?? trans[0];
  return aimedPart(seed, trans, 1);
}

/** The design's primary fin set's semi-span (m), for showing the flyer the current value to edit
 *  from. Undefined for a finless design. */
export function primaryFinSpan(rocket: Rocket, selectedId?: string): number | undefined {
  const fin = primaryFinSet(rocket, selectedId);
  return fin && "height" in fin ? fin.height : undefined;
}

/** The design's primary fin set's fin count. Undefined for a finless design. */
export function primaryFinCount(rocket: Rocket, selectedId?: string): number | undefined {
  const fin = primaryFinSet(rocket, selectedId);
  return fin && "finCount" in fin ? fin.finCount : undefined;
}

/** The design's primary fin set's fore-edge station from the nose tip (m) — the current
 *  longitudinal position, for the builder's "move the fins" edit to start from. Resolved through
 *  flattenRocket, so it reflects wherever the placement puts the set. Undefined for a finless
 *  design. */
export function primaryFinStation(rocket: Rocket, selectedId?: string): number | undefined {
  const fin = primaryFinSet(rocket, selectedId);
  if (!fin) return undefined;
  const placed = flattenRocket(rocket).find((p) => p.component.id === fin.id);
  return placed ? placed.xFore : undefined;
}

/** The design's primary fin set's axial extent along the body (m) — its root chord, for any fin
 *  kind — so a caller can tell how much airframe the fin root occupies (e.g. to keep a moved fin's
 *  trailing edge on the airframe). Undefined for a finless design. */
export function primaryFinChord(rocket: Rocket, selectedId?: string): number | undefined {
  const fin = primaryFinSet(rocket, selectedId);
  if (!fin) return undefined;
  const placed = flattenRocket(rocket).find((p) => p.component.id === fin.id);
  return placed ? placed.length : undefined;
}

/** How many motors the design's (first) motor mount holds — 1 for a single motor. Undefined when
 *  the design has no motor mount at all. */
export function primaryMotorClusterCount(rocket: Rocket): number | undefined {
  const mount = flattenRocket(rocket)
    .map((p) => p.component)
    .find((c) => "motorMount" in c && (c as { motorMount?: MotorMount }).motorMount);
  return mount ? (mount as { motorMount?: MotorMount }).motorMount?.clusterCount ?? 1 : undefined;
}

/** The primary fin set's root chord (m), only when it's trapezoidal (a generic set's root chord is a
 *  reduction, not a directly editable dimension). Undefined otherwise. */
export function primaryFinRootChord(rocket: Rocket, selectedId?: string): number | undefined {
  const fin = primaryFinSet(rocket, selectedId);
  return fin?.kind === "trapezoidfinset" ? fin.rootChord : undefined;
}

/** The primary fin set's tip chord (m), only when it's trapezoidal. Undefined otherwise. */
export function primaryFinTipChord(rocket: Rocket, selectedId?: string): number | undefined {
  const fin = primaryFinSet(rocket, selectedId);
  return fin?.kind === "trapezoidfinset" ? fin.tipChord : undefined;
}

/** The primary fin set's leading-edge sweep (m), only when it's trapezoidal. Undefined otherwise. */
export function primaryFinSweep(rocket: Rocket, selectedId?: string): number | undefined {
  const fin = primaryFinSet(rocket, selectedId);
  return fin?.kind === "trapezoidfinset" ? fin.sweepLength : undefined;
}

/** The primary fin set's thickness (m). Defined for every fin kind (all carry a thickness), so a
 *  finless design is the only undefined case. */
export function primaryFinThickness(rocket: Rocket, selectedId?: string): number | undefined {
  const fin = primaryFinSet(rocket, selectedId);
  return fin && "thickness" in fin ? fin.thickness : undefined;
}

/** The primary fin set's edge cross-section, defaulting to square (the OpenRocket default) when a
 *  finned design names none — so the picker shows the profile the aero is actually using. Undefined
 *  for a finless design. */
export function primaryFinCrossSection(rocket: Rocket, selectedId?: string): FinCrossSection | undefined {
  const fin = primaryFinSet(rocket, selectedId);
  return fin ? (("crossSection" in fin && fin.crossSection) || "square") : undefined;
}

/** The primary fin set's material name (the design's own, for the picker's "as designed" label).
 *  Undefined for a finless design or a fin set with no named material. */
export function primaryFinMaterial(rocket: Rocket, selectedId?: string): string | undefined {
  const fin = primaryFinSet(rocket, selectedId);
  return fin?.material?.name;
}

/** Apply the edits to one component (and its subtree). Trapezoid fins derive their area from
 *  dimensions downstream, so only the height changes; a generic (elliptical/freeform) set stores
 *  its planform area, so it's scaled with the span to keep the shape. Length overrides are keyed by
 *  component id (resolved once in applyGeometryEdits). */
function editComponent(
  c: RocketComponent,
  e: GeometryEdits,
  lengths: Map<string, number>,
  finShift: number,
  finTargetIds: Set<string>,
): RocketComponent {
  const children = c.children.length
    ? c.children.map((child) => editComponent(child, e, lengths, finShift, finTargetIds))
    : c.children;

  /** Apply the motor-cluster edit to whatever this component has become.
   *
   *  A component can be BOTH a motor mount and something else the editor changes: on a
   *  minimum-diameter design the mount IS a body tube. The cluster used to be its own early-returning
   *  branch below the length branch, so whichever ran first won and the other was dropped in silence.
   *  Measured on `01.One-stage.ork`, whose mount is a body tube: `motorClusterCount: 3` alone flies
   *  three motors — 1,243 m, thrust-to-weight 33.1 — and the same edit with a body length on that tube
   *  flies ONE, at 692 m and 19.0, while the Motors field goes on reading 3. Motor count is the number
   *  a flyer plans a flight around, so a field saying three over a flight of one is the shape of defect
   *  this file's other shared helpers exist to prevent. */
  const clustered = (x: RocketComponent): RocketComponent => {
    if (!(e.motorClusterCount !== undefined && e.motorClusterCount >= 1)) return x;
    if (!("motorMount" in x) || !x.motorMount) return x;
    const n = Math.round(e.motorClusterCount);
    return { ...x, motorMount: { ...x.motorMount, clusterCount: n > 1 ? n : undefined } };
  };

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
    return clustered({ ...c, length: newLen, children });
  }

  // Motor cluster count: how many motors the mount holds, set on every motor mount (a from-scratch
  // or single-stage design has one). Flown as N identical coaxial motors — N× thrust and motor
  // mass; 1 flies a single motor.
  if (e.motorClusterCount !== undefined && e.motorClusterCount >= 1 && "motorMount" in c && c.motorMount) {
    return clustered({ ...c, children });
  }

  const isFin = c.kind === "trapezoidfinset" || c.kind === "ellipticalfinset" || c.kind === "freeformfinset";
  // The fin SHAPE edits carry absolute values read back off the primary fin set (primaryFinSpan and
  // friends), so they may only be written back to the sets that reading actually describes: the
  // primary set and anything indistinguishable from it. Applying them to EVERY set would take a
  // design whose sets legitimately differ — a three-stage booster's 108 mm fins beside its
  // sustainer's 19 mm — and flatten them all to the one value the panel happened to be showing.
  // Applying them to one component id alone would break the opposite case, where a file stores a
  // single 3-fin ring as three 1-fin sets and resizing one leaves the rocket asymmetric. Grouping
  // by appearance serves both. What the field shows is what it changes — no more, no less.
  const isFinTarget = isFin && finTargetIds.has(c.id);
  const span = isFinTarget && e.finSpan !== undefined && e.finSpan > 0 ? e.finSpan : undefined;
  const count = isFinTarget && e.finCount !== undefined && e.finCount >= 1 ? Math.round(e.finCount) : undefined;
  const root = isFinTarget && e.finRootChord !== undefined && e.finRootChord > 0 ? e.finRootChord : undefined;
  const tip = isFinTarget && e.finTipChord !== undefined && e.finTipChord > 0 ? e.finTipChord : undefined;
  const sweep =
    isFinTarget && e.finSweepLength !== undefined && e.finSweepLength >= 0 ? e.finSweepLength : undefined;
  const thick = isFinTarget && e.finThickness !== undefined && e.finThickness > 0 ? e.finThickness : undefined;
  const cross = isFinTarget ? e.finCrossSection : undefined;
  // Fin material: swap the whole fin stock (density + a name the flutter estimate recognises).
  const matOpt =
    isFinTarget && e.finMaterial !== undefined ? FIN_MATERIALS.find((m) => m.key === e.finMaterial) : undefined;
  const material = matOpt ? { name: matOpt.name, density: matOpt.density, type: "bulk" as const } : undefined;
  // Fin-position edit: shift this fin set's placement offset by the resolved delta (+ = aft). The
  // offset feeds linearly into the axial stacking (resolveChildFore), so a delta moves the set by
  // exactly that much whatever its placement method. Only fin sets shift; other components ignore it.
  // Unlike the shape edits this one is a DELTA and stays group-wide on purpose: the whole fin group
  // slides together, so a multi-set design keeps its spacing and finStationTrim's slope holds.
  const shiftedPlacement =
    isFin && finShift !== 0 ? { ...c.placement, offset: c.placement.offset + finShift } : undefined;
  if (
    span !== undefined ||
    count !== undefined ||
    root !== undefined ||
    tip !== undefined ||
    sweep !== undefined ||
    thick !== undefined ||
    cross !== undefined ||
    material !== undefined ||
    shiftedPlacement !== undefined
  ) {
    if (c.kind === "trapezoidfinset") {
      // Root/tip chord and sweep reshape the trapezoid directly; the aero and mass read them, so
      // area and CP follow. Only trapezoidal sets take a chord/sweep edit (a generic set's chord is
      // a reduction). Thickness, edge cross-section, and material apply to every fin kind.
      return {
        ...c,
        height: span ?? c.height,
        finCount: count ?? c.finCount,
        rootChord: root ?? c.rootChord,
        tipChord: tip ?? c.tipChord,
        sweepLength: sweep ?? c.sweepLength,
        thickness: thick ?? c.thickness,
        crossSection: cross ?? c.crossSection,
        material: material ?? c.material,
        placement: shiftedPlacement ?? c.placement,
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
        material: material ?? c.material,
        placement: shiftedPlacement ?? c.placement,
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

/** Set the airframe-shell material on a component subtree — the "what if the tubes were cardboard
 *  instead of fibreglass?" edit. Applied only to the external shell (nose, body tubes, transitions)
 *  whose mass is computed from geometry × density; fins keep their own material (their density and
 *  flutter stiffness are their own choice), and internal fittings and recovery keep theirs. */
function withAirframeMaterial(c: RocketComponent, material: Material): RocketComponent {
  const children = c.children.length ? c.children.map((ch) => withAirframeMaterial(ch, material)) : c.children;
  if (c.kind === "nosecone" || c.kind === "bodytube" || c.kind === "transition") {
    return { ...c, material, children };
  }
  return children === c.children ? c : { ...c, children };
}

/** The airframe's representative shell material name — the primary body tube's, for the picker's
 *  "as designed" label. Undefined when the primary tube carries no named material. Takes no selection:
 *  the material edit is whole-airframe by design, so a label naming one picked tube's stock would
 *  describe less than the control changes. */
export function primaryAirframeMaterial(rocket: Rocket): string | undefined {
  return primaryBodyTube(rocket)?.material?.name;
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

/** The airframe's aft-most top-level body tube — the one a tail cone belongs behind.
 *
 *  Deliberately neither the longest tube nor the picked one. Not the picked one because a boattail
 *  CONTRACTS the base, so putting one behind whatever tube a flyer happened to be reading inserts a
 *  step part-way up the airframe, which then re-expands through the parts aft of it — geometry the
 *  solver dutifully flies. Not the longest either, which is what this used to resolve: once `bodyLength`
 *  became aimed at a picked tube, lengthening a forward tube past the longest moved the tail cone with
 *  it. Measured on `01.One-stage.ork` (a 254 mm payload tube ahead of a 610 mm body tube): picking the
 *  forward tube and taking it to 700 mm put the boattail at station 889 mm, contracting 54 mm to 40 mm
 *  and re-expanding through the transition behind it, instead of at 1,121 mm on the tail.
 *
 *  Top-level only, because that is the list the insert can splice into; a nested tube has no
 *  unambiguous aft slot and the caller skips the boattail rather than placing it wrongly. */
export function aftmostBodyTube(rocket: Rocket): BodyTube | undefined {
  const topLevel = new Set(rocket.stages.flatMap((s) => s.components.map((c) => c.id)));
  const tubes = flattenRocket(rocket).filter(
    (p) => p.component.kind === "bodytube" && topLevel.has(p.component.id),
  );
  if (!tubes.length) return undefined;
  return tubes.reduce((a, b) => (b.xFore + b.length > a.xFore + a.length ? b : a)).component as BodyTube;
}

/** The caliber a boattail would fair to — the aft-most top-level tube's outer diameter (m). The field
 *  that bounds the cone's exit has to quote THIS, not the picked tube's: the exit is validated against
 *  the tube the cone attaches to, and a placeholder naming a different component promises a bound the
 *  validator does not use, so a value inside the advertised range is silently ignored. Undefined for a
 *  design with no top-level body tube, which is also the case where no boattail can be added. */
export function aftmostBodyDiameter(rocket: Rocket): number | undefined {
  const tube = aftmostBodyTube(rocket);
  return tube ? tube.outerRadius * 2 : undefined;
}

/** Append a conical boattail after the airframe's aft-most body tube. Sized from the *edited* tube, so
 *  it fairs to whatever diameter the other what-ifs left (e.g. after a caliber change), and its exit
 *  is clamped just inside the body so it can only contract, never flare. Skips silently when there's
 *  no top-level body tube to attach to, or the requested exit isn't a valid contraction — the caller
 *  keeps the un-boattailed design rather than a malformed one. */
function addBoattail(rocket: Rocket, length: number, aftRadius: number): Rocket {
  const tube = aftmostBodyTube(rocket);
  if (!tube || !(length > 0) || !(aftRadius > 0) || !(aftRadius < tube.outerRadius)) return rocket;
  const boattail: Transition = {
    id: `${tube.id}-boattail`,
    name: "Boattail",
    kind: "transition",
    placement: { method: "after", offset: 0 },
    length,
    foreRadius: tube.outerRadius,
    aftRadius,
    thickness: tube.thickness,
    shape: "conical",
    material: tube.material,
    finish: tube.finish,
    children: [],
  };
  // Insert immediately after the primary tube in whichever stage's top-level list holds it, so the
  // boattail stacks onto the aft of the airframe. A nested body tube (unusual) has no obvious aft
  // slot, so the boattail is skipped there rather than placed ambiguously.
  let inserted = false;
  const stages = rocket.stages.map((s) => {
    const idx = s.components.findIndex((c) => c.id === tube.id);
    if (idx === -1) return s;
    inserted = true;
    return { ...s, components: [...s.components.slice(0, idx + 1), boattail, ...s.components.slice(idx + 1)] };
  });
  return inserted ? { ...rocket, stages } : rocket;
}

/** Set one transition's exit radius, wherever it sits in the tree. Only the aft end moves: the fore end
 *  is the joint with the part in front, and changing it would un-fair the airframe at a joint the flyer
 *  did not touch. */
function withTransitionExit(c: RocketComponent, id: string, aftRadius: number): RocketComponent {
  if (c.id === id && c.kind === "transition") return { ...c, aftRadius };
  if (!c.children.length) return c;
  return { ...c, children: c.children.map((k) => withTransitionExit(k, id, aftRadius)) };
}

/** The outer radius a part presents at its AFT face, or undefined for a part that is not on the outer
 *  mould line at all (a coupler, a fin set, a point mass). This is the joint diameter a part stacked
 *  behind it has to fair to. */
function aftOuterRadius(c: RocketComponent): number | undefined {
  return c.kind === "bodytube"
    ? c.outerRadius
    : c.kind === "nosecone" || c.kind === "transition"
      ? c.aftRadius
      : undefined;
}

/** The outer radius a part presents at its FORE face. A nose cone comes to a point, so 0. */
function foreOuterRadius(c: RocketComponent): number | undefined {
  return c.kind === "bodytube"
    ? c.outerRadius
    : c.kind === "transition"
      ? c.foreRadius
      : c.kind === "nosecone"
        ? 0
        : undefined;
}

/** The part that sits immediately behind `afterId` in its stage's own top-level list, if any. Top-level
 *  because that is the only list a part can be stacked into (see `applyAdds`), so it is also the only
 *  list whose neighbour a new part has to fair to. */
function nextTopLevel(rocket: Rocket, afterId: string): RocketComponent | undefined {
  for (const s of rocket.stages) {
    const i = s.components.findIndex((c) => c.id === afterId);
    if (i !== -1) return s.components[i + 1];
  }
  return undefined;
}

/** How far the mould line steps at the joint immediately behind a component — the difference in
 *  DIAMETER (m) between what it presents at its aft face and what the next part presents at its fore
 *  face. 0 when they fair, undefined when there is no joint to judge (nothing follows, or one of the
 *  two is not on the outer mould line).
 *
 *  Worth stating because Loft's drag model has a term for a transition's OWN slope — Niskanen eq. 3.86
 *  for a shoulder, 3.88 for a boattail, both a function of the joint angle — and none at all for a bare
 *  radius step, which has no length to take an angle over. A step is not exotic: measured across the
 *  35-design corpus, 31 of 115 touching airframe joints already step, in 11 of the 35 designs, by a
 *  median 11.75 mm of diameter and up to 82.55 mm. So this is not a guard against a value the editor
 *  invents; it is the sentence that was missing for the designs that arrive with one. */
export function mouldLineStep(rocket: Rocket, id: string): number | undefined {
  const flat = flattenRocket(rocket);
  const self = flat.find((p) => p.component.id === id);
  if (!self) return undefined;
  const mine = aftOuterRadius(self.component);
  const next = nextTopLevel(rocket, id);
  const theirs = next ? foreOuterRadius(next) : undefined;
  if (mine === undefined || theirs === undefined) return undefined;
  // Only a joint the two parts actually share: a gap between them is a different geometry, and one
  // Loft does not model either.
  const placed = flat.find((p) => p.component.id === next?.id);
  if (!placed || Math.abs(placed.xFore - (self.xFore + self.length)) > 1e-6) return undefined;
  return 2 * (theirs - mine);
}

/** How much narrower a transition authored with nothing behind it should exit, as a fraction of the
 *  diameter it starts at, and how long it should be for that change.
 *
 *  Both are the corpus's medians rather than numbers anyone chose, which is the same standard the
 *  authored fin ring is held to (it is cloned from the design's own set). Measured across the 25
 *  transitions in the 35-design corpus: 14 contract, 7 flare and 4 run straight through; the 14
 *  contracting ones exit at a median 0.754 of the diameter they start at, over a median
 *  γ = L / 2·ΔR of 2.294 — which is also, not by coincidence, close to the γ ≥ 3 at which a
 *  boattail's own pressure drag has faded to nothing (Niskanen eq. 3.88). The shortest real
 *  transition in the corpus is 6 mm, which is the floor a step-closing shoulder is held to so a
 *  0.076 mm step cannot mint a part too small to see, click or take back out. */
const TRANSITION_CONTRACTION = 0.754;
const TRANSITION_SLENDERNESS = 2.294;
const TRANSITION_MIN_LENGTH = 0.006;
/** The corpus's median transition length, for the one case with no diameter change to derive one
 *  from: a section between two parts already at the same caliber. Measured over the same 25. */
const TRANSITION_MEDIAN_LENGTH = 0.019;

/** The transition an "add one behind this" gesture should build: what it starts at, what it exits at,
 *  and the length that change implies. Undefined when the anchor presents no outer diameter to start
 *  from — a coupler, a fin set, a point mass — which is also the case where no transition can be
 *  faired to it.
 *
 *  The exit is decided by the airframe, never invented, and there are exactly three positions an
 *  anchor can be in. Measured by driving all 91 body tubes in the starter plus the 35-design corpus:
 *
 *   - **Nothing behind it (38 of 91).** A tail cone, contracting to the corpus median of the 14
 *     contracting transitions — 0.754 of the diameter it starts at, over γ = L/2·ΔR of 2.294. This is
 *     the base-drag lever, and the only position where a contraction is what the flyer is asking for.
 *   - **A part behind it at a different caliber (15 of 91).** The transition fairs EXACTLY to it and
 *     closes a step the design already had. Nothing is chosen; the number is read off the neighbour.
 *   - **A part behind it at the same caliber (38 of 91).** Straight through, fore = aft, at the
 *     corpus's median transition length. Contracting here would open a step at the joint BEHIND the
 *     new part — a stepped airframe nobody drew, on 38 of the 91 positions the gesture is offered.
 *     A zero-taper transition is not a contrivance to avoid that: 4 of the 25 corpus transitions are
 *     exactly this, a section in the mould line. The exit field is aimed at the part the moment it
 *     exists, so the very next keystroke is what shapes it — the numbers are the confirmation, and
 *     the gesture is putting the part there. */
export function transitionDefaults(
  rocket: Rocket,
  afterId: string,
): { foreRadius: number; aftRadius: number; length: number } | undefined {
  const anchor = flattenRocket(rocket).find((p) => p.component.id === afterId)?.component;
  if (!anchor) return undefined;
  const foreRadius = aftOuterRadius(anchor);
  if (!(foreRadius !== undefined && foreRadius > 0)) return undefined;
  const next = nextTopLevel(rocket, afterId);
  const theirs = next ? foreOuterRadius(next) : undefined;
  const aftRadius =
    theirs !== undefined && theirs > 0
      ? theirs // fair to the neighbour, whether that closes a step or leaves it straight through
      : foreRadius * TRANSITION_CONTRACTION; // nothing behind it: a tail cone
  const taper = Math.abs(foreRadius - aftRadius);
  const length =
    taper > 1e-6
      ? Math.max(TRANSITION_SLENDERNESS * 2 * taper, TRANSITION_MIN_LENGTH)
      : TRANSITION_MEDIAN_LENGTH;
  return { foreRadius, aftRadius, length };
}

/** What to call a transition authored behind `afterId`, decided once at birth and then carried on the
 *  `AddedPart` so it cannot drift when the design changes underneath it. A cone with nothing behind it
 *  is a tail cone in every flyer's vocabulary; one between two sections is a transition. */
export function authoredTransitionName(rocket: Rocket, afterId: string): string {
  return nextTopLevel(rocket, afterId) ? "Transition" : "Tail cone";
}

/** A sensible default station (m from the nose tip) for an added payload: the mid-point of the main
 *  body tube, a typical avionics-bay location. Undefined for a design with no body tube. */
export function defaultPayloadStation(rocket: Rocket, selectedId?: string): number | undefined {
  const tube = primaryBodyTube(rocket, selectedId);
  if (!tube) return undefined;
  const placed = flattenRocket(rocket).find((p) => p.component.id === tube.id);
  return placed ? placed.xFore + placed.length / 2 : undefined;
}

/** Add a payload / avionics-bay point mass inside the main body tube. It goes in as an internal mass
 *  component (the way OpenRocket stores a mass object), positioned at `station` from the nose tip —
 *  clamped to stay within the tube — so it adds to the loaded mass and shifts the CG toward its
 *  station without disturbing the external airframe. Exports as an `.ork` mass object. Skips silently
 *  when there's no body tube to hold it or the mass isn't positive, so the caller keeps the design. */
function addPayloadMass(
  rocket: Rocket,
  massKg: number,
  station: number | undefined,
  selectedId?: string,
): Rocket {
  // The picked tube, so a blank station puts the bay in the tube the flyer is holding and the field's
  // placeholder can say where that is. Resolved by role instead, the bay jumped tube the moment a
  // length edit made a different one the longest: on `01.One-stage.ork`, picking the forward tube and
  // taking it to 700 mm moved the payload from station 816 mm to 539 mm while the field went on
  // advertising 816.
  const tube = primaryBodyTube(rocket, selectedId);
  if (!tube || !(massKg > 0)) return rocket;
  const placed = flattenRocket(rocket).find((p) => p.component.id === tube.id);
  if (!placed) return rocket;
  const target = station !== undefined ? station : placed.xFore + placed.length / 2;
  // Keep the mass inside the tube (an offset from its fore edge, within its length).
  const offset = Math.max(0, Math.min(placed.length, target - placed.xFore));
  const payload: MassComponent = {
    id: `${tube.id}-payload`,
    name: "Payload",
    kind: "masscomponent",
    placement: { method: "top", offset },
    mass: massKg,
    massType: "payload",
    children: [],
  };
  const attach = (list: RocketComponent[]): RocketComponent[] =>
    list.map((c) => {
      if (c.id === tube.id) return { ...c, children: [...c.children, payload] };
      return c.children.length ? { ...c, children: attach(c.children) } : c;
    });
  return { ...rocket, stages: rocket.stages.map((s) => ({ ...s, components: attach(s.components) })) };
}

/** The canopy the recovery fields are about: the one picked, or the design's main parachute — the
 *  largest by canopy area, the one that sets the landing speed — when nothing is.
 *
 *  Every recovery readback and every recovery edit resolve through this one function, so the value a
 *  field shows to edit FROM cannot name a different canopy from the one the edit is written TO. A
 *  selection naming a parachute this design doesn't have falls back to the largest rather than
 *  resolving to nothing. Undefined for a design with no parachute (a streamer- or tumble-recovery
 *  design). */
export function primaryParachute(rocket: Rocket, selectedId?: string): Parachute | undefined {
  const chutes = flattenRocket(rocket)
    .map((p) => p.component)
    .filter((c): c is Parachute => c.kind === "parachute");
  if (!chutes.length) return undefined;
  const picked = selectedId ? chutes.find((c) => c.id === selectedId) : undefined;
  if (picked) return picked;
  const areaOf = (c: Parachute) => c.area ?? (Math.PI / 4) * c.diameter * c.diameter;
  return chutes.reduce((best, c) => (areaOf(c) > areaOf(best) ? c : best), chutes[0]);
}

/** How many canopies sit OUTSIDE the one the recovery fields describe — the ones a flyer can see in the
 *  parts list but cannot reach from this panel without picking one. 0 means the fields speak for the
 *  design's whole recovery. */
export function unreachableParachuteCount(rocket: Rocket): number {
  const chutes = flattenRocket(rocket).filter((p) => p.component.kind === "parachute");
  return Math.max(0, chutes.length - 1);
}

/** Which canopy the recovery fields are holding. Always one, so `covers` is 1. Undefined for a design
 *  with no parachute. */
export function primaryParachutePart(rocket: Rocket, selectedId?: string): AimedPart | undefined {
  const chutes = flattenRocket(rocket).filter((p) => p.component.kind === "parachute");
  if (!chutes.length) return undefined;
  const chute = primaryParachute(rocket, selectedId);
  const seed = chutes.find((p) => p.component.id === chute?.id) ?? chutes[0];
  return aimedPart(seed, chutes, 1);
}

/** Convert a design to dual-deploy: the canopy `parachuteId` names — the largest when nothing is
 *  picked — deploys at `mainAltitude` (AGL, m) instead of at apogee, and a drogue of `drogueDiameter`
 *  (m) is added at apogee to control the descent down to it. This is the standard high-power recovery — a fast, low-drift fall under the
 *  drogue, then a soft landing under the main — and it feeds the existing dual-deploy safety
 *  readouts (the main's under-drogue opening speed, the reduced drift). Skips silently when there's
 *  no parachute to promote or the inputs aren't a valid pair, so the caller keeps the design as-is. */
function applyDualDeploy(
  rocket: Rocket,
  mainAltitude: number,
  drogueDiameter: number,
  selectedId?: string,
): Rocket {
  const main = primaryParachute(rocket, selectedId);
  if (!main || !(mainAltitude > 0) || !(drogueDiameter > 0)) return rocket;
  // Canopy mass scales with area (≈ diameter²), so a smaller drogue is proportionally lighter.
  const drogueMass = main.mass * Math.min(1, (drogueDiameter / main.diameter) ** 2);
  const drogue: Parachute = {
    id: `${main.id}-drogue`,
    name: "Drogue",
    kind: "parachute",
    placement: { ...main.placement },
    cd: 0.8,
    diameter: drogueDiameter,
    mass: drogueMass,
    deployEvent: "apogee",
    deployDelay: 0,
    material: main.material,
    children: [],
  };
  // Rebuild the tree: promote the main to an altitude deployment and drop the drogue in beside it.
  // A per-config deploy override would otherwise win over the new altitude event, so it's cleared.
  const transform = (list: RocketComponent[]): RocketComponent[] =>
    list.flatMap((c) => {
      const children = transform(c.children);
      if (c.id === main.id) {
        const asMain: Parachute = {
          ...(c as Parachute),
          name: "Main parachute",
          deployEvent: "altitude",
          deployAltitude: mainAltitude,
          deployConfigs: undefined,
          children,
        };
        return [asMain, drogue];
      }
      return children === c.children ? [c] : [{ ...c, children }];
    });
  return { ...rocket, stages: rocket.stages.map((s) => ({ ...s, components: transform(s.components) })) };
}

/** Resize the canopy `parachuteId` names — the largest when nothing is picked — to a target
 *  `diameter` (m), scaling its mass with its area (∝ diameter²) so a bigger chute is proportionally
 *  heavier. The mass
 *  basis is the parachute's own effective diameter (from an explicit `area` if it carries one, else
 *  its `diameter`), so a RockSim chute stored as an area resizes correctly too. Any explicit `area`
 *  is cleared so the new diameter drives the descent. Skips silently when there's no parachute or
 *  the diameter isn't positive, leaving the design as-is. */
function withMainParachuteDiameter(rocket: Rocket, diameter: number, selectedId?: string): Rocket {
  const main = primaryParachute(rocket, selectedId);
  if (!main || !(diameter > 0)) return rocket;
  const oldD = main.area ? Math.sqrt((4 * main.area) / Math.PI) : main.diameter;
  if (!(oldD > 0)) return rocket;
  const massScale = (diameter / oldD) ** 2;
  const transform = (list: RocketComponent[]): RocketComponent[] =>
    list.map((c) => {
      const children = transform(c.children);
      if (c.id === main.id) {
        return { ...(c as Parachute), diameter, area: undefined, mass: main.mass * massScale, children };
      }
      return children === c.children ? c : { ...c, children };
    });
  return { ...rocket, stages: rocket.stages.map((s) => ({ ...s, components: transform(s.components) })) };
}

/** Every id a removal of `id` would take: the part and everything mounted inside it. */
function subtreeIds(rocket: Rocket, id: string): Set<string> {
  const out = new Set<string>();
  const collect = (c: RocketComponent): void => {
    out.add(c.id);
    for (const ch of c.children) collect(ch);
  };
  const find = (list: RocketComponent[]): boolean => {
    for (const c of list) {
      if (c.id === id) {
        collect(c);
        return true;
      }
      if (find(c.children)) return true;
    }
    return false;
  };
  for (const st of rocket.stages) if (find(st.components)) break;
  return out;
}

/** The aim slots that must be cleared when `id` is removed, as a patch to merge into the edit bag.
 *
 *  Without this a removal is silently destructive in the one way this editor has worked hardest to
 *  prevent. An aim naming a component that no longer exists falls back to the role default — that
 *  fallback is deliberate, so a stale id from a restored session cannot disable the fields — and an
 *  ABSOLUTE dimension edit then lands on whatever the fallback resolves to. Measured on
 *  `two-stage-firm-booster.ork`: aim the fin fields at the second set, type a 77 mm span, remove that
 *  set, and the surviving set goes from 50.0 mm to 77.0 mm. A different fin changes, with the field
 *  still reading 77.
 *
 *  Covers the whole subtree, because a removal takes what is mounted inside the part: deleting a body
 *  tube takes its fin set, and the fin aim names the fin set rather than the tube. */
export function aimsClearedByRemoving(rocket: Rocket, edits: GeometryEdits, id: string): GeometryEdits {
  const gone = subtreeIds(rocket, id);
  const bag = edits as Record<string, unknown>;
  const patch: Record<string, undefined> = {};
  for (const [slot, def] of Object.entries(AIM_SLOTS)) {
    const aimed = bag[slot];
    if (typeof aimed === "string" && gone.has(aimed)) {
      patch[slot] = undefined;
      // The VALUES go too, not just the aim. They are absolute numbers read off a part that is about to
      // stop existing, and an unaimed absolute value still resolves to the primary part — so leaving them
      // is how the edit lands on a different component. Emptying the fields also keeps the panel honest:
      // it stops showing a number that is not the one being flown.
      for (const field of def.targets) patch[field] = undefined;
    }
  }
  return patch as GeometryEdits;
}

/** The values to clear when an aim MOVES to a part that was just authored — the mirror of
 *  `aimsClearedByRemoving`, and for the same reason.
 *
 *  An absolute dimension in the bag describes the part the fields were holding a moment ago. Re-aiming
 *  them at a new part without clearing it does not leave the number where it was: it re-lands it on the
 *  part that has just been made, and the one it was typed for reverts. Measured on the starter design —
 *  aim at its 620.0 mm body tube, type 400 mm, then author a tube behind it: the design's own tube
 *  snapped back to 620.0 mm and the brand-new 310.0 mm one became 400.0 mm, with the field still
 *  reading 400 and nothing saying which part it had moved to.
 *
 *  Only the slots the aim patch actually moves are cleared, so a span typed for a fin set survives
 *  authoring a body tube. */
export function aimsClearedByAiming(edits: GeometryEdits, aim: GeometryEdits): GeometryEdits {
  const bag = edits as Record<string, unknown>;
  const moving = aim as Record<string, unknown>;
  const patch: Record<string, undefined> = {};
  for (const [slot, def] of Object.entries(AIM_SLOTS)) {
    if (moving[slot] === undefined || moving[slot] === bag[slot]) continue;
    for (const field of def.targets) if (bag[field] !== undefined) patch[field] = undefined;
  }
  return patch as GeometryEdits;
}

/** Every component id in a design, so a reference to one can be checked for still existing. */
function liveIds(rocket: Rocket): Set<string> {
  const out = new Set<string>();
  const walk = (list: RocketComponent[]): void => {
    for (const c of list) {
      out.add(c.id);
      walk(c.children);
    }
  };
  for (const s of rocket.stages) walk(s.components);
  return out;
}

/** Why `id` cannot be removed from `rocket`, as a sentence for the flyer, or null when it can.
 *
 *  Judged against the design AS SHOWN — the model with any earlier removals already applied — so on a
 *  two-tube airframe the first tube goes and the second is refused, rather than both being allowed
 *  because the pristine design had two.
 *
 *  Deliberately short: the only structural rule is that an airframe needs a body. Removing the nose is
 *  allowed — a blunt-nosed rocket is a real thing to build — though the drag it is then flown at is
 *  optimistic: `lib/sim/aero.ts` has no flat-face model and falls back to a moderate fineness-3 ogive for a
 *  nose-less vehicle, which is documented on the limitations page rather than hidden behind a refusal.
 *  Removing the only motor mount is allowed too: that leaves a design with no propulsion, which Loft
 *  already reports as such rather than inventing a flight for it. Refusing what is merely unwise would be
 *  a verdict, and Loft does not give those. */
export function removalRefusal(rocket: Rocket, id: string): string | null {
  const target = flattenRocket(rocket).find((p) => p.component.id === id);
  if (!target) return "That part is no longer in this design.";
  // A point mass that stands for a whole airframe's stated weight is the design's mass, not a part
  // inside it — a RASAero file states one launch weight and no per-part masses, so the adapter has
  // nowhere else in the model to put it. Removing it left `Show-off.CDX1` at 0.0 g dry with its CG at
  // the nose tip and `Complex.Two-Stage.CDX1` at −0.92 caliber, both still flown and both reported
  // with a confident apogee. 3 of the 4 RASAero designs in the corpus are that shape.
  if (target.component.kind === "masscomponent" && target.component.standsForAirframe) {
    return `${target.component.name} is this design's whole stated weight, not a part inside it — this file states one launch weight and no per-part masses, so removing it would leave a rocket with no mass at all. Change the weight in the file, or edit a design that carries its own materials.`;
  }
  // And the same weight cannot be taken out from ABOVE. A removal takes everything mounted inside the
  // part, and the adapter has to hang that point mass off some component — the first body tube — so
  // removing THAT tube deleted the design's entire weight just as surely. Found by sweeping every
  // removable part of all 35 corpus designs rather than every mass object: `Show-off.CDX1` carries two
  // tubes, so the last-tube refusal did not fire, and taking the first one left 0.0 g dry.
  const inside = flattenRocket(rocket).find(
    (p) =>
      p.component.kind === "masscomponent" &&
      p.component.standsForAirframe &&
      p.component.id !== id &&
      subtreeIds(rocket, id).has(p.component.id),
  );
  if (inside) {
    return `This design's whole stated weight (${inside.component.name}) is carried inside ${target.component.name}, and removing a part takes everything mounted in it — so this would leave a rocket with no mass at all. This file states one launch weight and no per-part masses, so there is no weight for Loft to keep behind.`;
  }
  if (target.component.kind === "bodytube") {
    // Counted within the target's OWN stage, not across the design. A staged rocket is several airframes
    // flown in sequence, so "the design still has a tube" is no comfort to a sustainer that no longer
    // does: on `two-stage-firm-booster.ork` — one tube per stage — a whole-design count found two and
    // allowed the removal that left stage 0 with none.
    const stage = rocket.stages.find((st) => subtreeIds({ ...rocket, stages: [st] }, id).size > 0);
    const inStage = stage
      ? flattenRocket({ ...rocket, stages: [stage] }).filter((p) => p.component.kind === "bodytube").length
      : 0;
    if (inStage <= 1) {
      const which = rocket.stages.length > 1 && stage ? ` in ${stage.name || "this stage"}` : "";
      return `This is the only body tube left${which}, and an airframe needs one — a rocket without it has no body to fly. Remove something else, or add a tube first.`;
    }
  }
  return null;
}

/** Drop the removed components, everything mounted inside them, and any motor left without a mount.
 *
 *  Applied BEFORE the dimension edits, so every role resolves against the design that is actually left:
 *  delete the longest tube and `Body length` describes the longest of the rest, not a part that is gone.
 *  An aim naming a removed component falls back the same way a stale id from a restored session does. */
function applyRemovals(rocket: Rocket, removedIds?: readonly string[]): Rocket {
  if (!removedIds?.length) return rocket;
  const gone = new Set(removedIds);
  const prune = (list: RocketComponent[]): RocketComponent[] =>
    list
      .filter((c) => !gone.has(c.id))
      .map((c) => (c.children.length ? { ...c, children: prune(c.children) } : c));
  const stages = rocket.stages.map((s) => ({ ...s, components: prune(s.components) }));
  const pruned: Rocket = { ...rocket, stages };
  const alive = liveIds(pruned);
  // A motor whose mount went with the part is dropped, not left dangling: `lib/sim/setup.ts` resolves an
  // unknown mount to undefined and puts the motor's mass at station 0 — the nose tip — which is a wrong
  // flight rather than an absent one. The configuration itself stays, so the picker still lists it and the
  // run reports honestly that there is nothing left to burn.
  const configurations = rocket.configurations.map((cfg) =>
    cfg.instances.every((i) => alive.has(i.mountId))
      ? cfg
      : { ...cfg, instances: cfg.instances.filter((i) => alive.has(i.mountId)) },
  );
  return { ...pruned, configurations };
}

/** The design plus the flyer's STRUCTURE — the parts they authored, without the ones they removed —
 *  and none of their dimension edits.
 *
 *  ONE spelling, exported, because several surfaces need exactly this tree and reaching for the
 *  IMPORTED design instead is a specific, repeatable defect rather than a style difference: an aim
 *  naming a part the flyer authored resolves to nothing in the import, and every `primary*` resolver
 *  then quietly falls back to the design's own primary part. What the surface READS and what the edit
 *  CHANGES are two different components from that moment on.
 *
 *  The dimension edits are excluded on purpose: this is the base a field or a sweep axis edits FROM,
 *  and those are the thing being varied. */
export function structureOf(rocket: Rocket, edits: GeometryEdits): Rocket {
  return applyGeometryEdits(rocket, { added: edits.added, removedIds: edits.removedIds });
}

/** Return a design with the geometry edits applied. The original rocket is untouched (a fresh tree
 *  is returned only where something changed), so callers can keep the imported model pristine.
 *
 *  Removals come first and the dimension edits are applied to what is left — see `applyRemovals`. */
export function applyGeometryEdits(rocket: Rocket, edits: GeometryEdits): Rocket {
  // ADDS FIRST, then removals, then the dimension edits. The order is not arbitrary and each step of it
  // was chosen against a case:
  //  - adds before removals, so a part the flyer authored can be REMOVED by id like any other. The
  //    other way round, `removedIds` is applied to a tree the added part is not in yet, and the one
  //    part a flyer is most likely to want back is the one they cannot take out.
  //  - adds before the dimension edits, so `bodyTubeId` can aim at an authored tube and `bodyLength`
  //    edits it — the whole point of authoring being an edit of the same model, not a second mechanism.
  //    It also means `aftmostBodyTube`, which anchors a boattail, sees a tube that was added behind it.
  return applyDimensionEdits(
    applyRemovals(applyAdds(rocket, edits.added), edits.removedIds),
    withoutRemovedAims(edits),
  );
}

/** Build the component one authored part describes, inheriting everything it can from the neighbour it
 *  was added after, and say where it goes: BESIDE that neighbour in its stage's list, or INSIDE it.
 *  Returns null when the entry describes nothing buildable. */
function buildAdded(
  part: AddedPart,
  after: RocketComponent,
  rocket: Rocket,
): { component: RocketComponent; inside: boolean } | null {
  if (part.kind === "trapezoidfinset") {
    // Fins are mounted ON a tube, not stacked behind it, so this one goes INSIDE the anchor.
    //
    // Cloned from the design's own primary set rather than derived from invented proportions. "Another
    // one of these, here" is the whole gesture, and it is the only default that is a fact about this
    // rocket instead of a number somebody chose: root chord, tip, sweep, span, count, thickness, edge
    // cross-section and stock all come across, so the new ring matches the one already flying. Every
    // one of the 35 corpus designs carries at least one fin set, and so does the starter, so a source
    // exists on every design a flyer can reach; where one genuinely does not, nothing is built and the
    // control is not offered rather than a shape being invented.
    if (after.kind !== "bodytube") return null;
    const src = flattenRocket(rocket).find((p) => p.component.kind === "trapezoidfinset")?.component;
    if (!src || src.kind !== "trapezoidfinset") return null;
    return {
      inside: true,
      component: {
        ...src,
        id: part.id,
        name: part.name || "Fins",
        // Aft-aligned inside the tube it is mounted on, which is where a fin set sits and what makes
        // the picture match the gesture. Cloning the source's own placement would carry an offset
        // measured inside a different part.
        placement: { method: "bottom", offset: 0 },
        children: [],
      },
    };
  }
  if (!(part.length > 0)) return null;
  switch (part.kind) {
    case "transition": {
      // A transition is the one part whose whole purpose is that its two ends differ, so unlike a tube
      // it cannot inherit its caliber wholesale — it inherits the FORE end and derives the exit. Both
      // come from `transitionDefaults`, re-resolved here rather than frozen onto the `AddedPart`, so a
      // cone stays faired to the airframe through a later caliber edit instead of being a step the
      // flyer never typed. Its LENGTH is the birth value on the entry, exactly like a tube's, and
      // `transitionLength` is what changes it afterwards.
      const d = transitionDefaults(rocket, part.after);
      if (!d) return null;
      const wall = "thickness" in after && after.thickness !== undefined && after.thickness > 0 ? after.thickness : undefined;
      return {
        inside: false,
        component: {
          id: part.id,
          name: part.name || "Transition",
          kind: "transition",
          placement: { method: "after", offset: 0 },
          length: part.length,
          foreRadius: d.foreRadius,
          aftRadius: d.aftRadius,
          // Conical, because 22 of the 25 transitions in the corpus are (2 ogive, 1 power) and because
          // a cone is the only contour whose joint angle a flyer can read straight off the diagram.
          shape: "conical",
          ...(wall !== undefined ? { thickness: wall, ...(after.material ? { material: after.material } : {}) } : {}),
          ...(after.finish ? { finish: after.finish } : {}),
          children: [],
        },
      };
    }
    case "bodytube": {
      // The caliber has to come from the airframe, not from the flyer: a tube that does not fair to the
      // part it joins is a step in the outer mould line, which changes the drag and the stability of a
      // design nobody meant to draw. `aftRadius` on a nose or transition IS the joint diameter there.
      const radius = aftOuterRadius(after);
      if (!(radius !== undefined && radius > 0)) return null;
      // The wall and the material travel TOGETHER, and a wall of nothing takes the material with it.
      // `lib/sim/mass.ts` models a tube that has a material and no wall as a SOLID ROD — measured on a
      // hand-built part, 2.13× the mass and 72% off the apogee, with no error anywhere — so a part
      // that inherited one without the other would be the quietest wrong number this milestone could
      // ship. Measured across the corpus: of 90 body tubes, exactly 12 carry neither, and all 12 are
      // the RASAero ones, whose geometry is deliberately massless because the format states no
      // materials at all and the weight is carried by a separate point mass. So inheriting the pair is
      // right on every real design: a real wall where the design states one, and the same massless
      // geometry as its neighbours where it does not.
      const wall = "thickness" in after && after.thickness !== undefined && after.thickness > 0 ? after.thickness : undefined;
      return {
        inside: false,
        component: {
        id: part.id,
        name: part.name || "Body tube",
        kind: "bodytube",
        placement: { method: "after", offset: 0 },
        length: part.length,
        outerRadius: radius,
        ...(wall !== undefined ? { thickness: wall, ...(after.material ? { material: after.material } : {}) } : {}),
        ...(after.finish ? { finish: after.finish } : {}),
        children: [],
        },
      };
    }
    default: {
      // A kind added to `AddedPart` and not to this switch used to fall off the end returning
      // `undefined`, which typechecked only because the return type is nullable — so the part was
      // dropped by `applyAdds` with nothing said on any surface. This makes the fifth kind a
      // compile error instead of a silent no-op.
      const unreachable: never = part.kind;
      return unreachable;
    }
  }
}

/** Splice every authored part into the design, each immediately behind the part it names.
 *
 *  An entry whose anchor is not in the design is DROPPED rather than placed somewhere else: the anchor
 *  is the only thing that says where the part goes, and putting it at the aft end instead would move a
 *  flyer's part without saying so. That happens when the anchor was itself removed, which is a state a
 *  flyer can reach and undo, so silence about it is wrong only if it were permanent — and it is not. */
function applyAdds(rocket: Rocket, added?: readonly AddedPart[]): Rocket {
  if (!added?.length) return rocket;
  let out = rocket;
  for (const part of added) {
    const anchor = flattenRocket(out).find((p) => p.component.id === part.after)?.component;
    if (!anchor) continue;
    const made = buildAdded(part, anchor, out);
    if (!made) continue;
    const { component: built, inside } = made;
    let placed = false;
    // A part mounted INSIDE its anchor can go anywhere the anchor is, nested or not, so it walks the
    // whole tree. A part stacked BESIDE it needs an unambiguous slot in a top-level list.
    if (inside) {
      const mount = (list: RocketComponent[]): RocketComponent[] =>
        list.map((c) => {
          if (c.id === part.after) {
            placed = true;
            return { ...c, children: [...c.children, built] };
          }
          return c.children.length ? { ...c, children: mount(c.children) } : c;
        });
      const nested = out.stages.map((s) => ({ ...s, components: mount(s.components) }));
      if (placed) out = { ...out, stages: nested };
      continue;
    }
    const stages = out.stages.map((s) => {
      const idx = s.components.findIndex((c) => c.id === part.after);
      if (idx === -1) return s;
      placed = true;
      return { ...s, components: [...s.components.slice(0, idx + 1), built, ...s.components.slice(idx + 1)] };
    });
    // A nested anchor — a tube inside a tube, which real designs do have — has no unambiguous aft slot
    // in a top-level list, so the part is skipped rather than placed somewhere it was not asked for.
    // The same rule `addBoattail` already applies, for the same reason.
    if (placed) out = { ...out, stages };
  }
  return out;
}

/** A UUID-shaped id for a newly authored part, unique within the design it is joining. Derived from the
 *  design's own shape rather than random, so the same sequence of edits produces the same ids — which is
 *  what lets a stored aim, a removal and an undo all still point at the right part after a reload. */
export function newPartId(rocket: Rocket, added: readonly AddedPart[] | undefined, after: string): string {
  const taken = new Set(flattenRocket(rocket).map((p) => p.component.id));
  for (const a of added ?? []) taken.add(a.id);
  return uniqueUuidFrom(`added:${after}:${taken.size}`, taken);
}

/** Drop any aim naming a component this same bag removes — and the values that aim was pointing.
 *
 *  Clearing the aim alone is NOT enough, and getting that wrong is the whole defect. The role fallback is
 *  deliberate (a stale id from a restored session must not disable the fields), so an unaimed span still
 *  resolves to the primary set — meaning a 77 mm span typed for the set the flyer just deleted lands on a
 *  surviving set instead. Measured on `two-stage-firm-booster.ork`: aim the fin fields at the second set,
 *  type 77 mm, remove that set, and the surviving 50.0 mm set became 77.0 mm.
 *
 *  So the values go with the aim. That is the honest answer: those numbers described a part that no longer
 *  exists, and the fields then read the surviving part's own dimensions rather than a value nothing is
 *  flying. This is why `AIM_SLOTS` pairs each aim with the fields it targets.
 *
 *  The app does the same when it appends the removal, so the UI's fields empty in step and never show a
 *  number that is not being flown. This is the model refusing to build a wrong rocket from a bag it is
 *  handed anyway — it decides what the solver sees, so it does not rely on a caller having been careful. */
function withoutRemovedAims(edits: GeometryEdits): GeometryEdits {
  if (!edits.removedIds?.length) return edits;
  const gone = new Set(edits.removedIds);
  const bag = edits as Record<string, unknown>;
  let out: Record<string, unknown> | null = null;
  for (const [slot, def] of Object.entries(AIM_SLOTS)) {
    const aimed = bag[slot];
    if (typeof aimed === "string" && gone.has(aimed)) {
      out = out ?? { ...bag };
      out[slot] = undefined;
      for (const field of def.targets) out[field] = undefined;
    }
  }
  return (out ?? edits) as GeometryEdits;
}

/** The dimension half of the edit bag, applied to a design whose removals have already been taken out. */
function applyDimensionEdits(rocket: Rocket, edits: GeometryEdits): Rocket {
  if (!hasGeometryEdits(edits)) return rocket;
  // Resolve which components the length edits target, once, from the pristine design.
  const lengths = new Map<string, number>();
  if (edits.noseLength !== undefined && edits.noseLength > 0) {
    const nose = primaryNose(rocket);
    if (nose) lengths.set(nose.id, edits.noseLength);
  }
  if (edits.bodyLength !== undefined && edits.bodyLength > 0) {
    const tube = primaryBodyTube(rocket, edits.bodyTubeId);
    if (tube) lengths.set(tube.id, edits.bodyLength);
  }
  // A transition's length rides the same map as a tube's — everything aft of it restacks either way,
  // because placement is relative and `flattenRocket` recomputes the stations from the tree.
  const transTarget = primaryTransition(rocket, edits.transitionId);
  if (edits.transitionLength !== undefined && edits.transitionLength > 0 && transTarget) {
    lengths.set(transTarget.id, edits.transitionLength);
  }
  // The exit is applied LAST, after the whole-airframe caliber scale, so an absolute diameter typed
  // here is the one flown even when `bodyDiameter` is also set — the same precedence the boattail's
  // exit already has, and the only one under which the field is not showing a number nothing is using.
  const transExit =
    edits.transitionAftDiameter !== undefined && edits.transitionAftDiameter > 0 && transTarget
      ? { id: transTarget.id, aftRadius: edits.transitionAftDiameter / 2 }
      : undefined;
  const finish = edits.finish;
  const matOpt = AIRFRAME_MATERIALS.find((m) => m.key === edits.airframeMaterial);
  const airframeMaterial: Material | undefined = matOpt
    ? { name: matOpt.name, density: matOpt.density, type: "bulk" }
    : undefined;
  // Diameter what-if: the factor that takes the pristine primary tube to the target diameter, then
  // applied to the whole outer airframe so it stays faired. 1 (no scaling) when unset or degenerate.
  // The factor comes from the PICKED tube, like the field's own readback: seeding it from the longest
  // tube while the field displayed the picked one turned "make this 54 mm" into a scale computed off
  // another part's caliber, so the tube the flyer was looking at landed anywhere but 54 mm.
  let radiusScale = 1;
  if (edits.bodyDiameter !== undefined && edits.bodyDiameter > 0) {
    const tube = primaryBodyTube(rocket, edits.bodyTubeId);
    if (tube && tube.outerRadius > 0) radiusScale = edits.bodyDiameter / 2 / tube.outerRadius;
  }
  // Fin-position what-if: how far to shift the fin group so the SELECTED set's fore edge lands on
  // the requested station, applied as an offset delta to every fin set so the design keeps its
  // spacing. The base must come from the same set the field showed: seeding it from the frontmost
  // set while the field displayed the selected one turned "nudge this set 10 mm aft" into a shift of
  // the whole inter-set distance — on a two-stage design, over a metre, silently, on every fin.
  // 0 (no shift) when unset or the design has no fins.
  let finShift = 0;
  if (edits.finStation !== undefined && edits.finStation > 0) {
    const cur = primaryFinStation(rocket, edits.finSetId);
    if (cur !== undefined) finShift = edits.finStation - cur;
  }
  // Which sets the fin SHAPE edits land on — the primary set every primaryFin* readback seeds the
  // fields from, plus any set indistinguishable from it (one ring stored as several parts).
  // Resolved once from the pristine design, like the length edits above.
  const finTargetIds = primaryFinGroupIds(rocket, edits.finSetId);
  const editOne = (c: RocketComponent): RocketComponent => {
    let geo = editComponent(c, edits, lengths, finShift, finTargetIds);
    if (finish) geo = withFinish(geo, finish);
    if (airframeMaterial) geo = withAirframeMaterial(geo, airframeMaterial);
    if (radiusScale !== 1) geo = scaleAirframeRadii(geo, radiusScale);
    if (transExit) geo = withTransitionExit(geo, transExit.id, transExit.aftRadius);
    return geo;
  };
  const edited: Rocket = {
    ...rocket,
    stages: rocket.stages.map((s) => ({ ...s, components: s.components.map(editOne) })),
  };
  // Structural add: a boattail is appended after the (already-edited) primary tube, so it fairs to
  // the tube's final diameter.
  let out = edited;
  if (edits.boattailLength !== undefined && edits.boattailAftDiameter !== undefined) {
    out = addBoattail(out, edits.boattailLength, edits.boattailAftDiameter / 2);
  }
  // Recovery resize: set the picked canopy (the largest when none is) to a target diameter. Applied
  // before any dual-deploy promotion, so a resized canopy is the one promoted to the altitude
  // deployment. Both resolve the same aim, so with one set the promotion cannot drift onto another
  // canopy just because the resize made a different one the largest.
  if (edits.mainParachuteDiameter !== undefined && edits.mainParachuteDiameter > 0) {
    out = withMainParachuteDiameter(out, edits.mainParachuteDiameter, edits.parachuteId);
  }
  // Recovery add: convert to dual-deploy (main at altitude + a drogue at apogee).
  if (edits.mainDeployAltitude !== undefined && edits.drogueDiameter !== undefined) {
    out = applyDualDeploy(out, edits.mainDeployAltitude, edits.drogueDiameter, edits.parachuteId);
  }
  // Payload add: a point mass inside the (already-edited) body tube, so its station tracks whatever
  // the length/diameter edits left.
  if (edits.payloadMassKg !== undefined && edits.payloadMassKg > 0) {
    out = addPayloadMass(out, edits.payloadMassKg, edits.payloadStation, edits.bodyTubeId);
  }
  return out;
}
