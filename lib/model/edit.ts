/** Builder geometry edits: non-destructively apply dimension changes to an imported design,
 *  returning a modified Rocket the whole sim pipeline (mass, aero, flight) then flies. This is the
 *  first step of the in-browser builder — the same "edit → rebuild the model → re-simulate" loop
 *  a from-scratch builder needs, on an imported design.
 *
 *  The geometry is length-derived (flattenRocket stacks components by their lengths), so resizing a
 *  nose cone or body tube automatically shifts everything downstream and recomputes mass, drag,
 *  centre of pressure, and motor position. Fin span moves the centre of pressure (stability). */

import type { Rocket, RocketComponent, ComponentKind, NoseCone, BodyTube, Transition, Parachute, Material, SurfaceFinish, NoseShape, FinCrossSection, MotorMount, MassComponent,
  Stage, InnerTube, RingComponent,
} from "./types";
import { flattenRocket, aftOuterRadius, foreOuterRadius, nextTopLevel } from "./geometry";
import { uniqueUuidFrom, uuidFrom } from "./id";
import type { Positioned } from "./geometry";
import { LOFT_AUTHORED_PARACHUTE_CD } from "../sim/recovery-defaults";

/** Selectable nose-cone shapes, for the builder's nose picker. Ordered by how a flyer thinks of
 *  them (sharp → blunt, then the parametrised low-drag families). */
export const NOSE_SHAPES: NoseShape[] = ["ogive", "conical", "ellipsoid", "parabolic", "power", "haack"];

/** Selectable fin edge cross-sections, for the builder's fin-profile picker. Ordered draggiest →
 *  cleanest (square stagnates the flow; rounded attaches it, so no stagnation term at all, only
 *  half a square edge's trailing-edge wake; airfoil is streamlined at both edges). */
export const FIN_CROSS_SECTIONS: FinCrossSection[] = ["square", "rounded", "airfoil"];

/** A selectable fin stock for the builder's material picker: a display label, the bulk density
 *  that sets the fin mass, and a material name the flutter estimate recognises for its shear
 *  modulus.
 *
 *  **Every row carries where its density came from, and the ones with no published figure say so.**
 *  These set authored-part MASS, and mass feeds everything downstream of it, so "representative
 *  engineering figure" is a claim to label rather than imply — the same contract the shear moduli
 *  in `lib/sim/flutter.ts` now carry. Four are cited to a document, one to arithmetic on a vendor's
 *  own published tube dimensions, and four are honest estimates that say as much. */
export interface FinMaterialOption {
  key: string;
  label: string;
  /** Stored as the fin's material name so the flutter estimate resolves its shear modulus. */
  name: string;
  /** Bulk density (kg/m³). */
  density: number;
  /** Where `density` comes from. Never empty — a row with no published figure says so, the same
   *  contract `lib/sim/flutter.ts`'s shear moduli carry. These feed authored-part MASS, and mass
   *  feeds every number downstream of it, so "representative engineering figure" is a claim that
   *  has to be labelled rather than implied. */
  source: string;
  /** True when `density` traces to a published document or to arithmetic on published vendor
   *  dimensions. False for a representative figure with no primary source found. */
  sourced: boolean;
}

/** Fin-stock materials for the builder's fin material picker, lightest/floppiest → heaviest/stiffest,
 *  which is also roughly the flutter-resistance order. The `name` is what the flutter estimate matches
 *  against to resolve a shear modulus. */
export const FIN_MATERIALS: FinMaterialOption[] = [
  {
    key: "balsa",
    label: "Balsa",
    name: "balsa",
    density: 130,
    source:
      "typical hobby sheet. Balsa is sold GRADED BY DENSITY over roughly 100-250 kg/m3, so a single " +
      "figure is a simplification whichever one it is. The USDA Wood Handbook FPL-GTR-282's own " +
      "Ochroma pyramidale sample (Table 5-5a) is SG 0.16, about 185 kg/m3 — denser than typical " +
      "contest stock, which is why the handbook figure is cited here rather than adopted.",
    sourced: false,
  },
  {
    key: "basswood",
    label: "Basswood",
    name: "basswood",
    density: 414,
    source:
      "USDA Wood Handbook FPL-GTR-282 ch. 5, Table 5-3a: American basswood SG 0.37 at 12% moisture " +
      "content (ovendry weight, volume at 12% MC), i.e. 414 kg/m3.",
    sourced: true,
  },
  {
    key: "plywood",
    label: "Birch plywood",
    name: "birch plywood",
    density: 680,
    source:
      "typical aircraft-grade birch ply. The Wood Handbook has no plywood at all — it is clear-wood " +
      "only — and its solid yellow birch (Table 5-3a, SG 0.62) is 694 kg/m3, which is a different " +
      "material: aircraft ply is Baltic birch, and ply count, veneer thickness and glue lines all " +
      "move it.",
    sourced: false,
  },
  {
    key: "g10",
    label: "G10 fibreglass",
    name: "G10 fibreglass",
    density: 1770,
    source:
      "Norplex-Micarta Technical Data Bulletin NP500A (NEMA G-10), Physical Properties: specific " +
      "gravity 1.77 by ASTM D792.",
    sourced: true,
  },
  {
    key: "carbon",
    label: "Carbon fibre",
    name: "carbon fibre",
    density: 1570,
    source:
      "Hexcel HexPly 8552 product data sheet, prepreg properties: nominal laminate density 1.56-1.58 " +
      "g/cm3 across UD and woven AS4 layups. Laminate density moves with fibre volume fraction, so " +
      "this is the middle of a narrow published band rather than a constant.",
    sourced: true,
  },
  {
    key: "aluminium",
    label: "Aluminium",
    name: "aluminium",
    density: 2713,
    source: "MIL-HDBK-5J Table 3.6.2.0(b1), 6061: 0.098 lb/in3 = 2,713 kg/m3.",
    sourced: true,
  },
];

/** Airframe-shell materials for the builder's body/nose/transition material picker, lightest →
 *  heaviest. Reuses the fin-material option shape.
 *
 *  Three of these have no published density and are unlikely ever to get one: a rocketry body tube is
 *  a WOUND structure, and its bulk density is set by winding angle, ply count and adhesive rather
 *  than by a material anyone publishes a datasheet for. Where a vendor publishes a tube's inside and
 *  outside diameters, its length and its weight, the density follows by arithmetic — which is a
 *  weaker citation than a datasheet but a far stronger one than a round number, and it is recorded
 *  as a derivation so nobody mistakes it for a material property. */
export const AIRFRAME_MATERIALS: FinMaterialOption[] = [
  {
    key: "cardboard",
    label: "Cardboard",
    name: "cardboard",
    density: 700,
    source:
      "NO PUBLISHED DENSITY. Derived from two LOC kraft tubes' published dimensions and weights " +
      "(3.9 in: ID 3.900\u2033, OD 4.000\u2033, 34\u2033, 298 g; 3.00 in: ID 3.000\u2033, OD 3.100\u2033, 34\u2033, 226 g) the " +
      "figure is 847-862 kg/m3 — but that derivation is very sensitive to the 0.050\u2033 wall, which is " +
      "the difference of two 3-decimal diameters, so a 0.005\u2033 rounding moves it about 10%. Kept at " +
      "700 pending a measurement rather than moved onto arithmetic that fragile.",
    sourced: false,
  },
  {
    key: "plywood",
    label: "Birch plywood",
    name: "birch plywood",
    density: 680,
    source: "as FIN_MATERIALS — typical aircraft-grade birch ply; the Wood Handbook has no plywood.",
    sourced: false,
  },
  {
    key: "kraft-phenolic",
    label: "Kraft phenolic",
    name: "kraft phenolic",
    density: 950,
    source:
      "NO PUBLISHED DENSITY for a wound rocketry tube. NEMA Grade X paper phenolic (Norplex-Micarta " +
      "NP610) is SG 1.40, but that is a hot-pressed fully-consolidated SHEET with far more resin " +
      "than a convolute-wound tube — citing it would be citing the wrong material and would push " +
      "this to 1,400. Representative engineering figure.",
    sourced: false,
  },
  {
    key: "bluetube",
    label: "Blue Tube",
    name: "Blue Tube",
    density: 1270,
    source:
      "derived from the vendor's own published tube dimensions and weights: 2.56 in (ID 2.551\u2033, " +
      "OD 2.671\u2033, 48\u2033, 490 g) gives 1,266 kg/m3 and 98 mm (ID 3.900\u2033, OD 4.014\u2033, 48\u2033, 725 g) " +
      "gives 1,301. Always Ready Rocketry publishes no composition and no material properties, so " +
      "there is no datasheet to cite and this arithmetic is the strongest citation available.",
    sourced: true,
  },
  {
    key: "carbon",
    label: "Carbon fibre",
    name: "carbon fibre",
    density: 1570,
    source: "as FIN_MATERIALS — Hexcel HexPly 8552 nominal laminate density.",
    sourced: true,
  },
  {
    key: "fibreglass",
    label: "Fibreglass",
    name: "fibreglass",
    density: 1770,
    source: "as FIN_MATERIALS' G10 — Norplex-Micarta NP500A, specific gravity 1.77 (ASTM D792).",
    sourced: true,
  },
  {
    key: "aluminium",
    label: "Aluminium",
    name: "aluminium",
    density: 2713,
    source: "as FIN_MATERIALS — MIL-HDBK-5J Table 3.6.2.0(b1).",
    sourced: true,
  },
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
  kind: "bodytube" | "trapezoidfinset" | "transition" | "masscomponent" | "tubecoupler" | "centeringring";
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
  /** Mass (kg) — a point mass's own weight, and what `length` is to a tube: the one number no
   *  neighbour can supply, because nothing about the airframe implies how heavy an altimeter is.
   *  Ignored by every other kind. Its STATION is not here: it is derived from the anchor at every
   *  apply (see `massObjectStation`), so a bay stays where it sits in a tube that is later resized. */
  mass?: number;
  /** A real catalogued coupler or centring ring, chosen for THIS authored part.
   *
   *  **It rides on the `AddedPart` rather than becoming a fourth `catalog…` key on `GeometryEdits`,
   *  and that is the structural difference between these two kinds and the three that already have
   *  pickers.** A body tube, a nose cone and a parachute all exist on the design before the flyer
   *  picks one, so each pick is an EDIT to a part an aim slot can name. A coupler and a centring ring
   *  do not exist until they are authored — there is nothing to aim at, and a bag-level key would
   *  have to carry the target's id anyway. Putting the pick on the entry that creates the part says
   *  the same thing with no new addressing, and it inherits everything the entry already has: one
   *  undo step takes the part and its pick together, removing the part cannot leave the pick behind,
   *  and none of `hasGeometryEdits`, `INERT_EDIT_FIELDS`, `isEditedValue` or `AIM_SLOTS` needs a new
   *  case — four hand-maintained enumerations this would otherwise have had to be added to. */
  pick?: PickedRing;
}

/** A catalogued coupler or centring ring, as a pick records it.
 *
 *  **Every field is stated by every row, which is why this shape has no optionals and no derivation.**
 *  Measured over the whole catalogue: all 236 couplers and all 497 rings state an outer diameter, an
 *  inner diameter, a length and a material — and **none of either states a mass or a thickness**. So
 *  unlike the nose cone and the parachute, there is no published-versus-derived question to get wrong
 *  here: the mass is computed from the geometry and the stock in every single case, by the same
 *  `lib/sim/mass.ts` path a hand-typed ring goes through.
 *
 *  14 of the 497 rings carry a material with no density; `usableCatalogRing` refuses those, because a
 *  ring that cannot be weighed is a pick that changes the balance by nothing while naming a real part.
 *  7 of the 236 couplers state an inner diameter of exactly 0 — solid balsa plugs, which are a real
 *  product and which `lib/sim/mass.ts` already flies correctly as a solid cylinder. */
export interface PickedRing {
  manufacturer: string;
  partNumber: string;
  /** Metres. */
  outerDiameter: number;
  /** Metres. 0 is legal and means a solid plug — 7 of the 236 couplers are. */
  innerDiameter: number;
  /** Metres. */
  length: number;
  material: Material;
}

/** Whether a stored pick describes a ring the applier can actually build.
 *
 *  Mirrors the absolute bands the model enforces, for the reason the picker's own `buildable` header
 *  gives: a row the list lets through and the applier then refuses is a pick that appears to work and
 *  changes no number. A bag persisted by an older build replays through `lib/session.ts` on the next
 *  visit, so this is the guard on data this build never wrote. */
export function usableCatalogRing(p: PickedRing | undefined): p is PickedRing {
  return (
    !!p &&
    typeof p.partNumber === "string" &&
    p.partNumber.length > 0 &&
    p.outerDiameter > 0 &&
    p.outerDiameter < 1 &&
    p.innerDiameter >= 0 &&
    p.innerDiameter < p.outerDiameter &&
    p.length > 0 &&
    p.length < 2 &&
    !!p.material &&
    typeof p.material.density === "number" &&
    p.material.density > 0
  );
}

/** A booster stage the flyer authored, appended below everything already in the stack.
 *
 *  **A fourth list rather than a fifth `AddedPart.kind`, and the reason is structural.** `buildAdded`
 *  returns a component plus where it goes — beside its anchor in a stage's list, or inside it — and a
 *  stage is neither: it is the level ABOVE a component, so it has no anchor to name and nowhere in that
 *  return to land.
 *
 *  It carries no components of its own. What a booster is made of is decided at every apply from the
 *  design as it then stands (see `buildStage`), so a stage authored before a tube was widened is a
 *  booster of the widened tube — the same rule every other operation in this bag follows, and what
 *  makes replaying the bag from the pristine design the whole of undo.
 *
 *  **`seedId` is what identifies it.** `Stage` has no id in the model — imported stages have never
 *  needed one — so rather than give every adapter and the exporter a field to carry, an authored stage
 *  is addressed by the id of the body tube it is seeded with. That tube is a real component with a
 *  stable id, it is what R3's gestures anchor onto to grow the booster afterwards, and it is what a
 *  removal names. */
export interface AddedStage {
  /** Id of the stage's seed body tube. UUID-shaped and stable, minted by `newPartId`. */
  seedId: string;
  /** Id of the motor mount inside that tube, which is what a `MotorInstance` has to name. */
  mountId: string;
  /** What to call the stage, on the parts list and in the phase table. */
  name: string;
}

/** A motor mount authored onto a tube that had none.
 *
 *  **A FIFTH list rather than a fifth `AddedPart.kind`, and the reason is the same structural one
 *  `AddedStage` gives.** `buildAdded` returns *a component plus where it goes*, and a motor mount is
 *  neither: `motorMount` is a FIELD on `BodyTube` (`types.ts:120`) and `InnerTube` (`types.ts:201`),
 *  so authoring one MUTATES an existing part rather than building a new one, and there is nothing in
 *  that return shape to carry it. It also has no id of its own — `lib/sim/setup.ts` and
 *  `lib/ork/export.ts` both key a mount by its HOST component's id — so the entry names the host and
 *  nothing else.
 *
 *  It carries no motor. What the mount flies is decided at every apply from the design as it then
 *  stands, which is the rule every other operation in this bag follows and what makes replaying the
 *  bag from the pristine design the whole of undo. */
export interface MountAdd {
  /** The component the mount goes on — a body tube or an inner tube that has none. */
  hostId: string;
}

/** One reorder: `id` now sits immediately behind `after`, or at the nose end of its stage when `after`
 *  is null. Both ids are top-level components of the SAME stage; anything else is refused. */
export interface MovedPart {
  id: string;
  after: string | null;
}

/** A real commercial body tube a flyer selected from the bundled catalogue, and the two figures that
 *  selection wrote into the design. See `GeometryEdits.bodyTubePart` for why both halves are here.
 *
 *  `manufacturer` AND `partNumber`, never the number alone: 113 part numbers in the catalogue are
 *  carried by more than one vendor and 21 collide inside a single one, which is why
 *  `lib/components/db.ts`'s own `findPart` refuses a bare number rather than picking a winner. A
 *  caption reading "BT-60" without a vendor would be ambiguous in exactly the same way. */
export interface PickedBodyTube {
  manufacturer: string;
  partNumber: string;
  /** Metres — what the pick wrote to `bodyDiameter`. */
  outerDiameter: number;
  /** Metres — what the pick wrote to `bodyLength`. */
  length: number;
  /** Kilograms — the vendor's OWN published weight, where they publish one.
   *
   *  Carried because the derived figure and the published one disagree badly on the parts that state
   *  both. Measured over the catalogue: 7 body tubes publish a mass, all Public Missiles, and the
   *  figure computed from their geometry and material density is **3–5× light** — PS-7.5 publishes
   *  589.7 g against 116.7 g derived, PS-1.5 21.3 g against 6.7 g. Whatever the cause upstream (a
   *  glassed phenolic whose stated stock is the paper core, most likely), the vendor's own number is
   *  the one they will weigh, and publishing 116.7 g under a caption reading "Flying Public Missiles
   *  PS-7.5" would be a confident wrong mass on the figure CG, stability and apogee all sit on.
   *
   *  Applied as `overrideMass`, which replaces the component's OWN mass and NOT its subtree — a tube
   *  carries its motor mount, its fins and its parachute as children, and swallowing those into a
   *  tube's published weight would be a much larger error than the one this fixes. */
  mass?: number;
  /** Metres. The vendor's published bore, from which the WALL is derived — `(OD − ID) / 2`.
   *
   *  The catalogue states an inner and an outer diameter and never a thickness (0 of 1,089 body
   *  tubes carry one), so the wall has to be derived rather than read. It matters more than its size
   *  suggests: `lib/sim/mass.ts` models a tube that has a material and NO wall as a solid rod —
   *  measured previously on a hand-built part at 2.13x the mass and 72% off the apogee, with no
   *  error shown anywhere. So the wall and the material travel together or neither travels. */
  innerDiameter: number;
  /** The vendor's own published stock, carried by VALUE with its density.
   *
   *  **Not an `AIRFRAME_MATERIALS` key, and that is the whole point of the milestone.** Measured
   *  2026-08-02: the catalogue's 39 material strings for body tubes have ZERO overlap with the seven
   *  keys — they are descriptive ("Paper, spiral kraft glassine, Estes avg, bulk") where the keys are
   *  nominal ("cardboard") — so routing a pick through `airframeMaterial` would snap a published
   *  figure onto a generic one. That is exactly the substitution `lib/components/db.ts` refuses to
   *  make, and the reason it refuses is that mass feeds CG, stability and apogee.
   *
   *  Absent when the catalogue has no usable density for the part (`materialOf` returns undefined for
   *  the 18 whose upstream figure was refused as physically impossible). The picker surfaces that
   *  rather than substituting a default, and this stays `undefined` so the tube keeps its own stock. */
  material?: { name: string; density: number };
}

/** A real commercial nose cone a flyer selected from the bundled catalogue.
 *
 *  Same rule as `PickedBodyTube` — the record carries the VALUES it wrote, never a pointer into a
 *  catalogue that is re-cut against newer upstream commits — and the same `manufacturer` AND
 *  `partNumber` pairing, for the same collision reason.
 *
 *  **The catalogue describes a nose cone far better than it describes a tube**, and that changes what
 *  a pick can honestly claim. Measured over the 854 catalogued cones: every one states a contour, a
 *  base diameter, a length, a shoulder diameter, a shoulder length and a material whose density
 *  survived the refusal pass — 854 of 854 on each, where 0 of 1,089 body tubes state a wall at all.
 *  So where a tube pick has to derive its wall and leave the shape alone, a nose pick can take the
 *  vendor's actual geometry. */
export interface PickedNoseCone {
  manufacturer: string;
  partNumber: string;
  /** Metres — the BASE (aft) outer diameter, written to the nose's `aftRadius` as half of it.
   *
   *  **Deliberately not scaled onto the airframe.** `bodyDiameter` scales every outer radius so the
   *  mould line stays faired, and doing the same from the nose would resize the whole rocket to fit
   *  a part costing a few pounds — the tail wagging the airframe. A cone whose base disagrees with
   *  the tube behind it produces a real mould-line step, and Loft already walks the airframe for
   *  those and cautions on the flight (`mouldLineSteps`), naming the step and saying the drag reads
   *  optimistically. Letting the existing check speak is better than either silently resizing the
   *  design or refusing the pick. */
  outerDiameter: number;
  /** Metres — what the pick wrote to `noseLength`. */
  length: number;
  /** The vendor's contour, written to `noseShape`. The catalogue's own `shape` values are already
   *  exactly this union — `.orc` records the same five contours upper-cased — so nothing is mapped
   *  or guessed. Of the 854, 464 are ogive, 233 ellipsoid, 135 conical, 12 parabolic and 10 Haack;
   *  none is `power`. */
  shape: NoseShape;
  /** Metres. The shoulder that plugs into the tube — its diameter and its length.
   *
   *  Carried because a shoulder is real mass sitting at the very front of the rocket, where it moves
   *  the CG most per gram. 50 of the 854 publish a shoulder length of 0, which is a cone that butts
   *  rather than plugs, and that is written through as no shoulder rather than treated as missing. */
  shoulderDiameter: number;
  shoulderLength: number;
  /** Metres, or absent for a cone the vendor states is SOLID.
   *
   *  The two are exhaustive and disjoint over the catalogue, which is why this is one optional field
   *  rather than a wall plus a flag: 728 of 854 state `filled`, the other 126 state a thickness, none
   *  states both and none states neither. A solid cone is `NoseCone.thickness` undefined, which the
   *  mass model already reads as solid — the same behaviour that is a DEFECT for a tube (a shell with
   *  a material and no wall becomes a rod) is the correct answer for a turned balsa cone. */
  thickness?: number;
  /** Kilograms — the vendor's own published weight, where they publish one. 137 of the 854 do.
   *
   *  Applied as `overrideMass`, on the component only and not its subtree, for the reason
   *  `PickedBodyTube.mass` sets out at length. */
  mass?: number;
  /** The vendor's published stock, by value with its density. Never an `AIRFRAME_MATERIALS` key —
   *  see `PickedBodyTube.material`. Optional for the same reason it is there, though as of this
   *  catalogue no nose cone's density was refused, so it is present on all 854. */
  material?: { name: string; density: number };
}

/** A real commercial parachute the flyer chose, carried BY VALUE like every other pick.
 *
 *  **What the catalogue does and does not state, measured over all 151 canopies.** Diameter, sides,
 *  line count, line length and a surface material are on 151 of 151; a line material on 145; a
 *  stated mass on 21. Nothing states a `cd`, a packed size, a length or an outer diameter — 0 of 151
 *  on each. That shape is what this type is built around, and it is why a parachute pick edits the
 *  canopy that is ALREADY THERE rather than authoring a new one: the model requires a `cd` and a
 *  deploy event, and the catalogue supplies neither.
 *
 *  **The `cd` therefore comes from the chute being replaced, and that is the honest answer rather
 *  than a convenient one.** A drag coefficient is a property of a canopy's cut and porosity that no
 *  vendor in this database publishes; inventing one would be a number a flyer would then fly a
 *  landing speed off. The design's own is a real figure — 22 of the 37 parachute nodes across the
 *  corpus state one explicitly (1.5 ×10, 1.55 ×4, 0.75 ×4, 2.2 ×2, 1.34, 0.61), the rest saying
 *  `auto`, which the importer maps to 0.8. So a pick changes the canopy's SIZE and MASS and leaves
 *  the coefficient exactly where the flyer's own file put it. */
export interface PickedParachute {
  manufacturer: string;
  partNumber: string;
  /** Metres — the canopy diameter laid flat, which is the convention every catalogued figure uses
   *  and the same one `Parachute.diameter` means. Written through with any explicit `area` cleared,
   *  so the vendor's diameter is what drives the descent. */
  diameter: number;
  /** Kilograms. The vendor's own published weight where they publish one (21 of 151), else the
   *  figure derived from the part's own stated geometry and stock.
   *
   *  **The two disagree, on every vendor and by a wide margin, and the published one wins.**
   *  Recomputed over all 21 canopies that state both, with the same formula the derivation uses:
   *  Public Missiles 12 canopies, published/derived **0.99x to 1.69x**; Rocketarium 3, **1.46x to
   *  1.73x**; Giant Leap 6, **2.91x to 7.85x**. Only three of the 21 land within 4% — an earlier
   *  version of this note quoted exactly those three and called them "Public Missiles' three",
   *  which was a cherry-picked subset of a twelve-part set presented as the vendor's whole answer.
   *  The honest reading is the opposite of what that implied: the derivation runs LOW essentially
   *  everywhere, because a canopy's real weight is dominated by hem, spill hole, swivel and shroud
   *  attachment, none of which a diameter and a surface density can see. So where the vendor has
   *  weighed one, that is the number, and the derivation is the fallback rather than the rule.
   *
   *  Applied as the component's own `mass`, NOT as `overrideMass`: a parachute's mass field already
   *  IS its mass in `lib/sim/mass.ts`, so an override would be a second mechanism saying the same
   *  thing — and the replaced chute's own override is cleared for the reason the nose applier
   *  records at length. */
  mass: number;
  /** The vendor's published canopy stock, by value with its SURFACE density (kg/m²) — never a key
   *  into any of Loft's own tables. Carried for provenance and for the derivation above; the model
   *  has no material field on a `Parachute`, so this never reaches the solver. */
  material?: { name: string; density: number };
  /** The shroud lines, as published: how many and how long (m). Kept because they are a real part of
   *  the derived mass — `lineCount x lineLength x lineDensity` is the second term of the same
   *  formula the `.ork` importer uses — and because a flyer comparing two canopies of one diameter
   *  is often choosing on exactly this. */
  lineCount?: number;
  lineLength?: number;
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
  /** Which mass object the mass fields describe and edit. Undefined means the design's heaviest one a
   *  flyer could actually take out — the point mass a RASAero import synthesises to hold a whole stated
   *  launch weight is not a part, and aiming a mass field at it would offer to retype a design's own
   *  weight as if it were ballast. A SELECTION, not an edit, like the other aims.
   *
   *  It matters because 26 of the 35 corpus designs carry a mass object, 56 in all, and not one of them
   *  could be reached: the only mass a flyer could state was a payload the editor ADDS. */
  massObjectId?: string;
  /** Which recovery canopy the recovery fields describe and edit. Undefined means the design's main
   *  parachute — the largest by canopy area — which is what the panel has always used and what every
   *  readback below still falls back to. A SELECTION, not an edit, exactly like the two above.
   *
   *  It matters more than either: 17 of the 35 corpus designs carry more than one parachute — every
   *  dual-deploy design does, by definition — and the drogue was unreachable on all of them. A flyer
   *  who picked the drogue and resized it resized the MAIN instead, which moves landing speed and
   *  landing energy, the two numbers recovery sizing exists to get right. */
  parachuteId?: string;
  /** Which piece of INTERNAL STRUCTURE the three internal fields describe and edit — a tube coupler, a
   *  centring ring, a bulkhead, an engine block or an inner (motor-mount) tube. Undefined means the
   *  design's frontmost one. A SELECTION, not an edit, exactly like the other aims.
   *
   *  **One slot for five kinds, because they are one shape.** `types.ts` gives `RingComponent` and
   *  `InnerTube` the identical three geometry fields — `length`, `outerRadius`, `innerRadius` — and
   *  models both as annular cylinders with no aerodynamic contribution. A second slot per kind would
   *  be five copies of one registry entry, and `AIM_SLOTS`' own docblock records what happened the
   *  last time this file held the same fact in more than one place.
   *
   *  It matters because this is the largest unreachable population left in the model. Measured over
   *  the 35-design corpus: **249 of 569 parts (43.8%) have no field that describes them, and 194 of
   *  those 249 are these five kinds** — 83 centring rings on 25 designs, 37 inner tubes on 25, 31
   *  couplers on 17, 29 bulkheads on 11, 14 engine blocks on 13. A flyer could already AUTHOR a
   *  coupler and a centring ring and then not resize either, which is worse than not offering them:
   *  the part arrives at Loft's own corpus-median default and the flyer's real one is 1/8 inch of ply
   *  they cannot type in. */
  internalId?: string;
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
  /** Top-level parts the flyer has MOVED along the airframe, oldest first — `{ id, after }`, where
   *  `after` is the id of the part it now sits behind, or null for the nose end of its stage.
   *
   *  The second operation-shaped edit, and the last one a flat patch of scalars cannot express: a
   *  station is not a free variable on a stacked airframe. A top-level part's station is DERIVED —
   *  `flattenRocket` walks each stage's list with a running cursor, so the aft end of one sibling is
   *  the fore end of the next — which means reordering the list IS the reorder. There is no station
   *  arithmetic to do and no `placement` to rewrite. Measured over the whole corpus before this shipped:
   *  **all 150 top-level components across all 35 designs use placement `after` with offset 0**, zero
   *  exceptions, so no imported design can defeat a reorder expressed as a list permutation.
   *
   *  An ordered LIST of single moves rather than a full ordered id list per stage, and the difference
   *  matters. A full list is a SNAPSHOT, not a patch: it goes stale the instant `added` or `removedIds`
   *  changes the membership, so a part authored after the snapshot was taken is absent from it and gets
   *  dropped or silently appended; it cannot be undone by removing one entry, which is how every other
   *  edit in this bag steps back; and `lib/session.ts` restores the whole bag from storage, so a stale
   *  snapshot is reachable rather than theoretical. A `{ id, after }` entry naming a part that is no
   *  longer there simply does nothing, exactly as an `added` entry with a missing anchor already does.
   *
   *  A move NEVER crosses a stage boundary. Dragging a part out of its stage is not a restack — it is a
   *  different separation event, with a different flight — and `nextTopLevel` flattens across stages, so
   *  a part allowed to cross one would silently re-stage itself. Refused in `applyMoves`. */
  moved?: MovedPart[];
  /** Booster stages the flyer authored, appended in order. See `AddedStage`. */
  addedStages?: AddedStage[];
  /** Motor mounts the flyer authored onto tubes that had none. See `MountAdd`. */
  mountAdds?: MountAdd[];
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
   *  pressure drag: a square edge stagnates the flow head-on; a rounded edge attaches it, so it
   *  carries no stagnation term at all and only half a square edge's trailing-edge base wake;
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
  /** The real commercial part the flyer CHOSE, when they chose one instead of measuring — its
   *  identity, plus the two figures the choice wrote.
   *
   *  **Provenance, not a third edit.** The geometry a pick asks for is already expressed by
   *  `bodyDiameter` and `bodyLength`, which the picker sets; this records WHICH published part those
   *  numbers came from, so the surface can say "flying an Estes BT-60" rather than leaving two changed
   *  values to speak for themselves. `DESIGN.md` §6 — every reference value names its source.
   *  `hasGeometryEdits` ignores it for exactly that reason: on its own it changes no geometry, the
   *  same way the `*Id` aims do not.
   *
   *  **It carries the VALUES it wrote, not the identity alone, and that is what stops it lying.** The
   *  bag is persisted and replayed (`lib/session.ts`), so a flyer can pick a tube, retype the
   *  diameter, and reload; an identity-only record would then caption someone else's number with a
   *  vendor's part number. Holding what the pick wrote lets the surface show the attribution only
   *  while both figures are still the ones that part published.
   *
   *  Resolved at PICK time rather than at apply time, for the same reason `AddedPart` carries a length
   *  rather than a reference to one: `lib/components/catalog.ts` is re-cut against newer upstream
   *  commits, and a stored pointer would silently redimension a saved design the day it moved. */
  catalogBodyTube?: PickedBodyTube;
  /** The real commercial NOSE CONE the flyer chose, when they chose one instead of measuring.
   *
   *  The nose's own geometry is already partly expressed by `noseLength` and `noseShape`, which the
   *  pick sets alongside this — but unlike the tube case, those two do not express the whole part.
   *  A cone's base diameter, its shoulder, its wall and its stock have no scalar edit fields at all,
   *  so this record is where they live, and it is a real edit rather than pure provenance from the
   *  first version. `usableCatalogNose` is the one test of whether it can be applied. */
  catalogNoseCone?: PickedNoseCone;
  /** The real commercial PARACHUTE the flyer chose, when they chose one instead of measuring.
   *
   *  `mainParachuteDiameter` already resizes the aimed canopy, so a pick could in principle have
   *  ridden on that one scalar — and it must not. That field scales the existing chute's mass by
   *  (d/d₀)², which is the right model for "make my canopy bigger" and the wrong one for "I own this
   *  part": the vendor states the canopy's own stock, its line count and its line length, and 21 of
   *  the 151 publish a weight outright. A pick that only moved the diameter would fly a real part's
   *  size at a scaled version of somebody else's mass. `usableCatalogParachute` is the one test of
   *  whether it can be applied. */
  catalogParachute?: PickedParachute;
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
  /** Absolute length (m) of the internal part `internalId` names — its axial extent along the
   *  airframe. On a centring ring, a bulkhead or an engine block this is the PLATE THICKNESS and the
   *  panel labels it so; on a coupler or an inner tube it is a tube's length. The number is the same
   *  field of the same model type either way, and the two vocabularies are a fact about what flyers
   *  call the part, not about the model.
   *
   *  It changes mass, and mass alone: `types.ts` gives these kinds no aerodynamic contribution, so a
   *  longer coupler is heavier and further nothing. That is still a flight change — mass moves the CG,
   *  the CG moves the static margin, and both move apogee — which is exactly why a part a flyer cannot
   *  size is a part whose mass they cannot correct. Undefined leaves it. */
  internalLength?: number;
  /** Absolute OUTER diameter (m) of the internal part `internalId` names. Undefined leaves it. */
  internalOuterDiameter?: number;
  /** Absolute INNER diameter (m) — the bore — of the internal part `internalId` names.
   *
   *  A bore at or above the outer diameter is a part made of nothing, so it is refused rather than
   *  flown: `applyDimensionEdits` drops it and the design keeps its own. The panel bounds the field at
   *  the outer diameter it is being flown against, so the refusal is normally unreachable from the UI —
   *  but the bag is persisted and replayed (`lib/session.ts`), and a bore typed before the outer
   *  diameter shrank underneath it reaches the model on the next visit. The model decides what the
   *  solver sees; it does not rely on the caller having been careful. Undefined leaves it. */
  internalInnerDiameter?: number;
  /** Absolute mass (kg) of the mass object `massObjectId` names. The dominant non-structural weight on
   *  most designs — electronics, tracker, ballast, nose weight — so it moves loaded mass, the CG and
   *  therefore the static margin, and the apogee with them. Undefined leaves it. */
  massObjectMass?: number;
  /** Where that mass object sits, as a station (m) from the nose tip. Clamped to stay inside the part
   *  holding it, because a point mass floating outside the airframe is not a rocket anyone built.
   *  Unlike `payloadStation` this is NOT inert: it moves the CG, which is the whole reason to have it.
   *  Undefined leaves the mass where the design puts it. */
  massObjectStation?: number;
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
  /** The aimed canopy's drag coefficient, as a what-if.
   *
   *  **The one input in the recovery chain a flyer could not reach**, and the one that sets descent
   *  rate, arrival speed and landing energy — the pair an RSO and a waiver actually check. It is
   *  also the honest way to explore the uncertainty: a real canopy's coefficient is only known to
   *  about +/-10-20%, so trying the range is a more truthful use of this field than trusting any
   *  single figure, whether the file stated it or Loft supplied it.
   *
   *  Bounded by the applier rather than trusted: a coefficient of zero is a canopy that is not
   *  there, and a negative one is thrust. */
  parachuteCd?: number;
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
/** Whether a stored pick carries enough to change anything — the ONE test, so the three places that
 *  ask (`hasGeometryEdits`, `isEditedValue`, and the applier) cannot drift. A bore that is absent,
 *  non-positive, or not inside the outer diameter derives a wall of zero or one at least as wide as
 *  the tube, and `lib/sim/mass.ts` clamps the inner radius at 0 — which flies the tube as a SOLID
 *  ROD, the exact failure the wall exists to prevent, reached from the other side. */
export function usableCatalogTube(p: PickedBodyTube | undefined): boolean {
  return (
    p !== undefined &&
    typeof p.innerDiameter === "number" &&
    p.innerDiameter > 0 &&
    p.innerDiameter < p.outerDiameter
  );
}

/** Whether a picked parachute record carries enough for the applier to use it.
 *
 *  Every pick is replayed from `localStorage` on load, so a record written by an older or newer
 *  build reaches this — which is why the bound on `diameter` is a real physical band and not merely
 *  `> 0`. The catalogue's own canopies run **203.2 mm to 3,657.6 mm**, and the band is deliberately
 *  much wider than that (50 mm to 10 m) rather than snug: it exists to refuse a stored 0.0001 m that
 *  would fly a landing speed off a canopy the size of a coin, not to police what a vendor may add.
 *  A snug band would turn every upstream re-cut into a silently refused row. */
export function usableCatalogParachute(p: PickedParachute | undefined): boolean {
  return (
    p !== undefined &&
    typeof p.diameter === "number" &&
    Number.isFinite(p.diameter) &&
    p.diameter > 0.05 &&
    p.diameter < 10 &&
    // The mass is written straight onto the component, so a NaN or a negative would land in the
    // dry-mass total unchallenged — and a parachute's mass is the one a flyer checks a descent rate
    // against. Zero is refused rather than allowed: no canopy weighs nothing, and a stored 0 is a
    // half-written record rather than a claim.
    typeof p.mass === "number" &&
    Number.isFinite(p.mass) &&
    p.mass > 0 &&
    p.mass < 50
  );
}

/** The same ONE test for a nose pick, and it asks a different question because the catalogue answers
 *  a different one. A tube pick is refused without a bore; a cone has no bore to state — 728 of the
 *  854 are solid and say so — so what has to be present is the geometry the cone IS: a base, a
 *  length, a contour, and a shoulder that fits inside the base.
 *
 *  A stated wall must leave a bore, exactly as the tube test requires: a thickness at or past the
 *  base radius is a cone with no cavity, which `lib/sim/mass.ts` would clamp to a solid anyway, so
 *  taking it would fly a mass the vendor never published under their name. A cone with NO thickness
 *  is not refused — that is the solid case, and it is the majority. */
export function usableCatalogNose(p: PickedNoseCone | undefined): boolean {
  return (
    p !== undefined &&
    typeof p.outerDiameter === "number" &&
    p.outerDiameter > 0 &&
    typeof p.length === "number" &&
    p.length > 0 &&
    NOSE_SHAPES.includes(p.shape) &&
    typeof p.shoulderDiameter === "number" &&
    p.shoulderDiameter > 0 &&
    p.shoulderDiameter <= p.outerDiameter &&
    // The applier reads `shoulderLength` as both the gate and the value, so leaving it unchecked
    // let a replayed record install a collar as long as the rocket — a stored 1.5 m took the demo
    // design 600.2 g to 670.8 g — or drop the shoulder silently on a NaN while still counting as an
    // edit. Bounded by the cone's own length: a shoulder longer than the part it hangs off is not a
    // shoulder. Zero is legal and means the cone butts rather than plugs.
    typeof p.shoulderLength === "number" &&
    Number.isFinite(p.shoulderLength) &&
    p.shoulderLength >= 0 &&
    p.shoulderLength <= p.length &&
    // A stated wall must leave a bore, exactly as the tube test requires: a thickness at or past the
    // base radius is a cone with no cavity, which `lib/sim/mass.ts` would clamp to a solid anyway,
    // so taking it would fly a mass the vendor never published under their name.
    (p.thickness === undefined || (p.thickness > 0 && p.thickness < p.outerDiameter / 2))
  );
}

export function hasGeometryEdits(e: GeometryEdits): boolean {
  return (
    (e.removedIds !== undefined && e.removedIds.length > 0) ||
    (e.added !== undefined && e.added.length > 0) ||
    // A reorder is a real edit, and forgetting it here is invisible rather than loud: the caller skips
    // `applyGeometryEdits` entirely when this returns false, so a design with ONLY a move applied would
    // be shown, flown and exported as the pristine one. Caught by the e2e, not by any unit test.
    (e.moved !== undefined && e.moved.length > 0) ||
    (e.addedStages !== undefined && e.addedStages.length > 0) ||
    (e.mountAdds !== undefined && e.mountAdds.length > 0) ||
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
    // A picked part now carries a WALL and a STOCK of its own, so it changes the flight even with
    // both dimension fields blank — it stopped being the pure provenance record it was when it
    // shipped, and it came out of `INERT_EDIT_FIELDS` in the same change.
    usableCatalogTube(e.catalogBodyTube) ||
    // A nose pick is a real edit from the outset, not provenance: `noseLength` and `noseShape` carry
    // two of its six figures, and the base diameter, the shoulder, the wall and the stock are
    // expressed nowhere else. Omitting this disjunct makes `applyDimensionEdits` early-return and a
    // design whose only edit is a chosen cone flies pristine.
    usableCatalogNose(e.catalogNoseCone) ||
    usableCatalogParachute(e.catalogParachute) ||
    (e.transitionLength !== undefined && e.transitionLength > 0) ||
    (e.transitionAftDiameter !== undefined && e.transitionAftDiameter > 0) ||
    (e.internalLength !== undefined && e.internalLength > 0) ||
    (e.internalOuterDiameter !== undefined && e.internalOuterDiameter > 0) ||
    // A bore of zero is a real answer here and the only field in this file for which it is: a solid
    // disc is what a bulkhead IS, and `>= 0` rather than `> 0` is what lets a flyer say so. The
    // impossible entry is a bore at or above the outer diameter, and that is refused in the applier
    // rather than here — this predicate answers "did anything change", not "is it buildable".
    (e.internalInnerDiameter !== undefined && e.internalInnerDiameter >= 0) ||
    (e.massObjectMass !== undefined && e.massObjectMass >= 0) ||
    (e.massObjectStation !== undefined && e.massObjectStation >= 0) ||
    e.finish !== undefined ||
    (e.airframeMaterial !== undefined && AIRFRAME_MATERIALS.some((m) => m.key === e.airframeMaterial)) ||
    (e.boattailLength !== undefined && e.boattailLength > 0 &&
      e.boattailAftDiameter !== undefined && e.boattailAftDiameter > 0) ||
    (e.mainDeployAltitude !== undefined && e.mainDeployAltitude > 0 &&
      e.drogueDiameter !== undefined && e.drogueDiameter > 0) ||
    (e.mainParachuteDiameter !== undefined && e.mainParachuteDiameter > 0) ||
    (e.parachuteCd !== undefined && e.parachuteCd > 0) ||
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

/** The five kinds that mount INSIDE the airframe as annular or solid cylinders and share one geometry:
 *  `length`, `outerRadius`, `innerRadius` (`types.ts`). `RING_KINDS` below is the subset that the
 *  fitting rule and the authoring defaults treat alike; this is that set plus `innertube`, which is the
 *  same three fields with a `motorMount` marker hanging off it.
 *
 *  Deliberately NOT re-derived from `RING_KINDS`: these two sets answer different questions and have
 *  drifted apart before. "Can I be longer than my host?" is the ring rule. "Do I have three numbers a
 *  flyer can type?" is this one. */
const INTERNAL_KINDS: ReadonlySet<string> = new Set([
  "tubecoupler",
  "centeringring",
  "bulkhead",
  "engineblock",
  "innertube",
]);

/** The internal part the three internal fields are about: the one picked, or the design's frontmost
 *  when nothing is — the same fallback rule `primaryTransition` uses, and for the same reason. A
 *  design carries several (the corpus median is 5), so the fallback is a starting point rather than an
 *  answer, which is what the unreachable count below exists to say. */
export function primaryInternalPart(
  rocket: Rocket,
  selectedId?: string,
): (RingComponent | InnerTube) | undefined {
  const parts = flattenRocket(rocket)
    .map((p) => p.component)
    .filter((c): c is RingComponent | InnerTube => INTERNAL_KINDS.has(c.kind));
  if (!parts.length) return undefined;
  const picked = selectedId ? parts.find((c) => c.id === selectedId) : undefined;
  return picked ?? parts[0];
}

/** How many internal parts sit OUTSIDE the one the internal fields describe. */
export function unreachableInternalCount(rocket: Rocket): number {
  return Math.max(0, flattenRocket(rocket).filter((p) => INTERNAL_KINDS.has(p.component.kind)).length - 1);
}

/** What a flyer calls this part's axial dimension. A plate has a THICKNESS and a tube has a LENGTH;
 *  they are one model field and two words, and OpenRocket's own dialogs make the same split. Exported
 *  so the panel and the parts table cannot label one part two ways. */
export function internalSpanLabel(kind: string): "Thickness" | "Length" {
  return kind === "centeringring" || kind === "bulkhead" || kind === "engineblock" ? "Thickness" : "Length";
}

/** The mass object the mass fields are about: the one picked, or the design's heaviest REMOVABLE one
 *  when nothing is.
 *
 *  Heaviest rather than frontmost because that is the one a flyer is looking for — the av-bay or the
 *  nose weight, not a 3 g shear-pin entry — and it is the one whose station moves the CG most. The
 *  fallback deliberately skips a point mass that stands in for a whole airframe's weight: a RASAero
 *  import mints one to hold the launch weight the format states, and offering to retype that as if it
 *  were ballast would present a design's own measurement as a what-if. On 3 of the 4 RASAero designs
 *  it is also the heaviest thing in the model, so an unguarded fallback would land on it every time. */
export function primaryMassObject(rocket: Rocket, selectedId?: string): MassComponent | undefined {
  const masses = flattenRocket(rocket)
    .map((p) => p.component)
    .filter((c): c is MassComponent => c.kind === "masscomponent");
  if (!masses.length) return undefined;
  // A pick is refused on the same grounds the fallback avoids it, and the same grounds `removalRefusal`
  // refuses to delete it: a point mass that stands in for a whole airframe's stated weight is not a part
  // sitting in the design, it IS the design's mass. Offering to restate or to SLIDE it would present a
  // measurement the file makes as a what-if — and sliding it is the worse of the two, because a lumped
  // CG has no station a flyer could move it to. 4 such masses across 3 RASAero designs in the corpus.
  const picked = selectedId ? masses.find((c) => c.id === selectedId && !c.standsForAirframe) : undefined;
  if (picked) return picked;
  const real = masses.filter((c) => !c.standsForAirframe);
  if (!real.length) return undefined;
  return real.reduce((best, c) => (c.mass > best.mass ? c : best), real[0]);
}

/** Which mass object the mass fields are holding. Always one. Undefined for a design with none a
 *  flyer could state. */
export function primaryMassObjectPart(rocket: Rocket, selectedId?: string): AimedPart | undefined {
  const masses = flattenRocket(rocket).filter((p) => p.component.kind === "masscomponent");
  if (!masses.length) return undefined;
  const picked = primaryMassObject(rocket, selectedId);
  if (!picked) return undefined;
  const seed = masses.find((p) => p.component.id === picked.id) ?? masses[0];
  return aimedPart(seed, masses, 1);
}

/** Where that mass object sits — its station (m) from the nose tip — so the field shows the value it
 *  edits FROM. Undefined when there is none to hold. */
export function primaryMassObjectStation(rocket: Rocket, selectedId?: string): number | undefined {
  const picked = primaryMassObject(rocket, selectedId);
  if (!picked) return undefined;
  return flattenRocket(rocket).find((p) => p.component.id === picked.id)?.xFore;
}

/** How many mass objects sit OUTSIDE the one the mass fields describe. */
export function unreachableMassObjectCount(rocket: Rocket): number {
  return Math.max(0, flattenRocket(rocket).filter((p) => p.component.kind === "masscomponent").length - 1);
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
  /** Targets that describe MORE than the part the slot names, so re-aiming the slot does not
   *  invalidate them. `bodyDiameter` is the one: it reads the picked tube's caliber but scales the
   *  whole outer airframe to hit it, deliberately, so that a design stepping through a transition
   *  cannot come apart. It therefore still means what it meant after the aim moves — which is why
   *  clearing it on a re-aim was a regression that snapped 35 of 35 corpus designs back to their
   *  imported caliber. A REMOVAL is the other case and still clears it: the scale is computed from
   *  the aimed tube, so with that tube gone the same number would resolve to a different factor. */
  groupWide?: readonly string[];
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
  // `catalogBodyTube` is a TARGET of this aim, not a free-standing record, and leaving it out was a
  // real defect rather than an omission. `withCatalogTube` resolves its tube through this same aim at
  // apply time, so a pick that outlived the aim MIGRATED: removing the tube it was made for re-landed
  // the vendor's wall and stock on whatever `primaryBodyTube` fell back to, and merely clicking
  // another tube to READ it — the gesture this slot exists to support — moved them there too.
  // Measured on a two-tube design: 411.6 g to 53.9 g on the removal, 305.4 g to 129.1 g on the re-aim,
  // with the caption still naming the part in both. Listed here, it clears exactly when `bodyLength`
  // and `bodyDiameter` do, which is the behaviour a flyer already understands.
  bodyTubeId: {
    kinds: ["bodytube"],
    targets: ["bodyLength", "bodyDiameter", "catalogBodyTube"],
    groupWide: ["bodyDiameter"],
  },
  transitionId: { kinds: ["transition"], targets: ["transitionLength", "transitionAftDiameter"] },
  massObjectId: { kinds: ["masscomponent"], targets: ["massObjectMass", "massObjectStation"] },
  parachuteId: {
    kinds: ["parachute"],
    // `catalogParachute` is a target, not merely provenance: the applier resolves its canopy through
    // this same aim, so a pick that outlived its aim would migrate onto whatever the primary-chute
    // fallback found next — which is the defect `withCatalogTube` shipped and had to fix. Listing it
    // here makes the pick clear exactly when the diameter and deploy fields aimed at that part do.
    targets: [
      "mainParachuteDiameter",
      "mainDeployAltitude",
      "drogueDiameter",
      "catalogParachute",
      "parachuteCd",
    ],
  },
  // Five kinds, one slot, because they are one shape in `types.ts` — see `internalId`'s own docblock
  // for the measurement that decided the scope. `innertube` sits here beside the four ring kinds and
  // not in a slot of its own: a motor-mount tube a flyer wants to lengthen is asking the same question
  // of the same three fields as a coupler is.
  internalId: {
    kinds: ["tubecoupler", "centeringring", "bulkhead", "engineblock", "innertube"],
    targets: ["internalLength", "internalOuterDiameter", "internalInnerDiameter"],
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
  // A pick stored before this field carried a bore applies NOTHING — `applyGeometryEdits` needs
  // `innerDiameter` to derive a wall, and refuses without one — so counting it as an edit would call
  // an untouched design edited, withhold the file's stored-simulation comparison and hide the button
  // that restores it. The bag is persisted and replayed (`lib/session.ts`), so a bag written by the
  // build that shipped the picker's first increment reaches this code on the next visit. That exact
  // regression has been fixed here once before, from a different direction.
  if (key === "catalogBodyTube") return usableCatalogTube(value as PickedBodyTube | undefined);
  // Same reasoning, and it is not optional for a new field either: without this branch the generic
  // `value !== undefined` below passes ANY object, so a half-written record — or one persisted by a
  // build whose `PickedNoseCone` carried fewer fields — reads as an edit while the applier refuses
  // it, which withholds the imported file's stored-simulation comparison on an unchanged design.
  if (key === "catalogNoseCone") return usableCatalogNose(value as PickedNoseCone | undefined);
  if (key === "catalogParachute") return usableCatalogParachute(value as PickedParachute | undefined);
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

/** The internal part the three internal fields are holding, named the way the panel names every other
 *  aim. Told apart from every OTHER internal part rather than from its own kind: a design with one
 *  coupler and three centring rings has four parts on this one aim, and naming the coupler as if the
 *  rings were not there would put the same caption on four different pieces of structure. */
export function primaryInternalPartAim(rocket: Rocket, selectedId?: string): AimedPart | undefined {
  const parts = flattenRocket(rocket).filter((p) => INTERNAL_KINDS.has(p.component.kind));
  if (!parts.length) return undefined;
  const picked = primaryInternalPart(rocket, selectedId);
  const seed = parts.find((p) => p.component.id === picked?.id) ?? parts[0];
  return aimedPart(seed, parts, 1);
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

/** Every component carrying a motor mount, in flatten order. */
function mountsOf(rocket: Rocket): RocketComponent[] {
  return flattenRocket(rocket)
    .map((p) => p.component)
    .filter((c) => "motorMount" in c && (c as { motorMount?: MotorMount }).motorMount !== undefined);
}

function clusterOf(c: RocketComponent): number {
  return (c as { motorMount?: MotorMount }).motorMount?.clusterCount ?? 1;
}

/** How many motors the design's (first) motor mount holds — 1 for a single motor. Undefined when
 *  the design has no motor mount at all. */
export function primaryMotorClusterCount(rocket: Rocket): number | undefined {
  const mount = mountsOf(rocket)[0];
  return mount ? clusterOf(mount) : undefined;
}

/** The mounts the Motor-cluster field's value TRUTHFULLY describes — the primary mount, plus every
 *  other mount already holding the same number of motors — and therefore the only ones it may write.
 *
 *  Exactly the rule `primaryFinGroupIds` follows a few hundred lines up, for exactly the same reason:
 *  a field reads back off ONE part and used to write to ALL of them. The reader took the first mount
 *  in flatten order and the writer matched any component with a `motorMount` at all, so on a design
 *  whose mounts differ the field stated one number and changed another. Measured on
 *  `Airstart timing.ork`, whose `54mm center` holds 1 and whose `38mm airstart` holds 3: the field
 *  read 1, and committing any value flattened the airstart cluster to it — a 3-motor airstart
 *  silently becoming 2 from a field that never mentioned it. Five corpus designs had one edit rewrite
 *  two or three mounts.
 *
 *  Grouping by the CURRENT count rather than by position is what makes the claim honest: every mount
 *  in the group is one the displayed number is already true of, so writing the new number to all of
 *  them is the same statement the field is making. Anything holding a different count is a part this
 *  panel is not describing, and `unreachableMountCount` is how the surface says so. */
export function primaryMountGroupIds(rocket: Rocket): Set<string> {
  const mounts = mountsOf(rocket);
  if (!mounts.length) return new Set();
  const n = clusterOf(mounts[0]);
  return new Set(mounts.filter((c) => clusterOf(c) === n).map((c) => c.id));
}

/** How many motor mounts sit OUTSIDE the group the Motor-cluster field describes — the mounts a
 *  flyer can see in the parts table but cannot reach from this panel. 0 means the field speaks for
 *  every mount on the rocket, which is true of 34 of the 35 real designs. */
export function unreachableMountCount(rocket: Rocket): number {
  return mountsOf(rocket).length - primaryMountGroupIds(rocket).size;
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
  mountTargetIds: Set<string>,
): RocketComponent {
  const children = c.children.length
    ? c.children.map((child) => editComponent(child, e, lengths, finShift, finTargetIds, mountTargetIds))
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
    // Only the mounts the field's own value describes — see `primaryMountGroupIds`. Resolved from
    // the pristine tree by the caller, so replaying the bag cannot make the group drift.
    if (!mountTargetIds.has(x.id)) return x;
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
    // **A tube that shrinks takes its internal fittings with it.** `applyAdds` runs BEFORE this, so
    // an authored coupler was clamped against the host's PRISTINE length; shrinking the host
    // afterwards leaves the part hanging out — and because these sit `bottom`-flush, they grow
    // FORWARD, out of the tube's fore end and into whatever is ahead. Measured on the starter before
    // this clamp: add a coupler to the 620 mm tube (94.8 mm, +40.9 g), then type 20 into Body length
    // and 74.8 mm of it sits inside the nose cone, still counting its full un-shrunk mass.
    //
    // Applied to the fittings the design ARRIVED with too, not only authored ones: the geometry is
    // equally impossible either way, and the flyer typing the length is making the same claim about
    // the same tube. Ring kinds only — a fin set or a mass object inside a shortened tube is
    // repositioned by `flattenRocket`, not overhung by it.
    // **AUTHORED fittings are not fitted here — `fitAddedInternalParts` owns those, over the final
    // tree.** This arm can only see the length this ONE edit is setting, and an authored part has to
    // be judged against the length its host ends up with; running both rules over an authored part
    // gave two gates judging two different rockets, which is exactly how a picked coupler came to be
    // offered at a length the applier would then refuse. One class of part, one rule, one home.
    const authored = new Set((e.added ?? []).map((a) => a.id));
    const fitted =
      c.kind === "bodytube"
        ? children.map((ch) =>
            isRing(ch) && !authored.has(ch.id) && ch.length > newLen
              ? { ...ch, length: Math.max(1e-4, newLen) }
              : ch,
          )
        : children;
    return clustered({ ...c, length: newLen, children: fitted });
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
      const scale = span !== undefined && c.height > 0 ? span / c.height : 1;
      const area = c.area * scale;
      // And the OUTLINE with it. A freeform set keeps the points it was drawn from so an export can
      // write the shape back rather than an equal-area trapezoid — which means a span edit that moved
      // `height` and `area` but left the points alone would export the fin the flyer started with.
      // Measured on `Pods--airframes and winglets.ork` before this line existed: stretching the
      // "Cockpit" set's span 7.0 mm → 10.4 mm and downloading gave a file that reopened at 7.0 mm,
      // static margin 2.077 → 2.134 — the edit silently undone by saving it. A span stretch scales y
      // only; the chord is untouched, which is why `area` above scales linearly with the same factor.
      const points =
        scale === 1 || !c.points ? c.points : c.points.map((pt) => ({ x: pt.x, y: pt.y * scale }));
      return {
        ...c,
        height,
        area,
        points,
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
/** Put a catalogued part's published WALL and STOCK on one body tube — the one the body fields are
 *  aimed at, never the whole airframe.
 *
 *  This is deliberately narrower than `withAirframeMaterial` below, which is a whole-airframe what-if
 *  ("the same design in cardboard"). A pick is a statement about ONE part: the flyer said they are
 *  holding an Estes BT-60, not that every tube on the rocket is one. Widening it would overwrite the
 *  stock of parts they never chose.
 *
 *  It runs AFTER the whole-airframe material edit in `editOne`, so an explicit pick beats the generic
 *  one where both are set — the published figure is the better number, and silently replacing a part
 *  the flyer named with a category they picked from a dropdown is the wrong way round.
 *
 *  The wall is NOT scaled by the caliber what-if. `scaleAirframeRadii` touches `outerRadius` and
 *  never `thickness`, which is right here rather than incidental: a real tube's wall is a property of
 *  the tube, not a ratio of its diameter. */
function withCatalogTube(
  c: RocketComponent,
  id: string,
  thickness: number,
  material: Material | undefined,
  publishedMass: number | undefined,
): RocketComponent {
  const children = c.children.length
    ? c.children.map((ch) => withCatalogTube(ch, id, thickness, material, publishedMass))
    : c.children;
  if (c.kind === "bodytube" && c.id === id) {
    // The wall and the material travel TOGETHER — see `PickedBodyTube.innerDiameter`. Where the
    // catalogue has no usable density the tube keeps its own material rather than being handed one
    // it did not state, and it keeps its own wall with it, because a real wall under an invented
    // stock is the same wrong mass from the other direction.
    if (!material) return children === c.children ? c : { ...c, children };
    // A wall at least as wide as the tube's own radius is not a thin-walled tube at all, and
    // `lib/sim/mass.ts` clamps the inner radius at 0 and flies it as a SOLID ROD without complaint.
    // Reachable without any bad data: `bodyDiameter` scales the airframe and is also a sweep axis, so
    // a flyer who picks a 48.8 mm tube and then narrows the design under ~17.9 mm crosses it. The
    // wall is left alone in that case and the stock still lands, which is the pair's own rule.
    if (!(thickness < c.outerRadius)) {
      return { ...c, material, children };
    }
    return {
      ...c,
      thickness,
      material,
      // The vendor's own weight where they publish one — see `PickedBodyTube.mass`. Set alongside
      // the geometry rather than instead of it, so the diagram and the drag still use the real
      // dimensions and only the MASS comes from the published figure.
      //
      // **And the replaced tube's own weighed figures are cleared where they do not.** This shipped
      // with the hole and the nose applier inherited it: `overrideMass` wins outright in
      // `lib/sim/mass.ts`, so a tube carrying one took the vendor's wall and stock and went on
      // flying the mass of the part it replaced. Less reachable than on the nose — 2 of 27 corpus
      // designs carry one on the primary tube against 10 of 41 on the cone — but wrong in exactly
      // the same way, and a mass override is how a real file records a part somebody weighed.
      overrideMass: publishedMass !== undefined && publishedMass > 0 ? publishedMass : undefined,
      overrideCGx: undefined,
      children,
    };
  }
  return children === c.children ? c : { ...c, children };
}

/** Put a picked commercial parachute onto the canopy `parachuteId` names.
 *
 *  The counterpart of `withCatalogNose`, and the same three rules apply — take the whole published
 *  part, clear what the replaced one carried that would outlive it, and never invent a figure the
 *  vendor does not state. What differs is which figures exist: a canopy publishes a diameter and a
 *  stock and no drag coefficient at all, so the `cd` is left exactly as the design had it. */
function withCatalogParachute(c: RocketComponent, id: string, p: PickedParachute): RocketComponent {
  const children = c.children.length ? c.children.map((ch) => withCatalogParachute(ch, id, p)) : c.children;
  if (c.kind === "parachute" && c.id === id) {
    return {
      ...(c as Parachute),
      diameter: p.diameter,
      // Cleared, exactly as `withMainParachuteDiameter` clears it. `Parachute.area` is an explicit
      // reference area the solver PREFERS over the diameter (`lib/sim/simulate.ts`, `lib/sim/setup.ts`
      // both read `c.area ?? pi(d/2)^2`), so a stale one would fly the OLD canopy's drag under the new
      // part's name with the diameter beside it saying otherwise.
      //
      // **Defensive rather than live, and worth saying which:** measured 2026-08-03, NO importer sets
      // this field — the `.ork`, `.rkt` and RASAero adapters all supply a diameter — so no design a
      // flyer can currently load reaches the branch. It is cleared anyway because the field exists
      // for a format that states one, the solver already honours it, and an applier that left it
      // would be a wrong number waiting on an adapter change rather than a bug today.
      area: undefined,
      // **A canopy that was MASSLESS stays massless, and this is a wrong number rather than a
      // nicety.** `lib/rasaero/adapt.ts` gives every `.CDX1` canopy `mass: 0` deliberately: the
      // format states no per-part masses at all, so the whole design's weight rides in one point
      // mass and the geometry is massless by construction. Writing the vendor's weight onto it
      // COUNTS THE CANOPY TWICE. Measured on `Show-off.CDX1`: dry mass 0.4536 kg (its stated 1 lb)
      // → 0.5358 kg, +18%, with the dry CG moving 25.4 → 96.9 mm; `Complex.Two-Stage.CDX1` goes
      // 1.1777 → 1.2599 kg. Both are reachable — the picker renders on both, since each states a
      // canopy diameter.
      //
      // `withMainParachuteDiameter` has always preserved this for free, because it SCALES
      // (0 × anything is 0); an applier that assigns rather than scales has to say it out loud. The
      // vendor's size still lands, so the descent rate moves exactly as it should — it is only the
      // mass that the design has already accounted for elsewhere.
      mass: (c as Parachute).mass > 0 ? p.mass : 0,
      // **The replaced canopy's own weighed figures are CLEARED**, and on this kind it is the common
      // case rather than an edge: 20 of the 37 parachute nodes across the corpus carry an
      // `<overridemass>` (11 of the 27 `.ork` files). `lib/sim/mass.ts` lets `overrideMass` win
      // outright, so a pick that set `mass` and left the override in place would take the vendor's
      // diameter — changing the descent rate — while flying the old weight under a caption naming
      // the new part. That is the identical Sev-1 the nose-cone increment shipped and had to fix,
      // waiting on the one kind where it is the majority.
      overrideMass: undefined,
      overrideCGx: undefined,
      children,
    };
  }
  return children === c.children ? c : { ...c, children };
}

/** Put a catalogued nose cone's published geometry and stock on the design's nose.
 *
 *  Broader than `withCatalogTube` because the catalogue says more about a cone than it does about a
 *  tube: the base, the shoulder, the wall and the stock all come from the vendor. `length` and
 *  `shape` are NOT set here — they are already carried by `noseLength` and `noseShape`, which the
 *  pick writes alongside this record and `editComponent` applies in its own branch. Setting them
 *  twice would put the same figure in two places and let them disagree after a later edit to either.
 *
 *  Runs at the same point in `editOne` as the tube applier and for the same reasons: after the
 *  whole-airframe material what-if, so an explicit pick beats a generic one; and after
 *  `scaleAirframeRadii`, which is what makes the base diameter here a deliberate override of the
 *  caliber scaling rather than a race with it. That ordering has a consequence worth stating: a
 *  flyer who picks a cone and THEN runs the caliber what-if gets a rocket whose airframe scaled and
 *  whose nose base did not, so the mould line steps — which `mouldLineSteps` sees and the flight
 *  cautions about, in words, on the surface. That is the honest outcome; silently rescaling the
 *  vendor's part to fit would be a number nobody published. */
function withCatalogNose(
  c: RocketComponent,
  id: string,
  p: PickedNoseCone,
  material: Material | undefined,
): RocketComponent {
  const children = c.children.length
    ? c.children.map((ch) => withCatalogNose(ch, id, p, material))
    : c.children;
  if (c.kind === "nosecone" && c.id === id) {
    return {
      ...c,
      aftRadius: p.outerDiameter / 2,
      // A stated thickness, or SOLID — but only alongside the vendor's stock, which is the rule the
      // tube applier already enforces by refusing both without a material. Writing the wall outside
      // that guard was the same defect from the other side: a SOLID cone's absent thickness landing
      // on the design's OWN density turns a 3 mm-walled fibreglass cone into a solid one, measured
      // at 600.2 g -> 826.7 g (+37.7%) on the demo design. No catalogued cone reaches it today
      // (0 of 854 had its density refused), but the catalogue is re-cut against newer upstream
      // commits and `db.ts` refuses densities at generate time, so it is one regeneration away.
      //
      // `thickness: undefined` is how the model spells solid, and 728 of the 854 are exactly that —
      // a turned balsa or plastic cone with no cavity, which is most small-field hardware.
      ...(material ? { thickness: p.thickness } : {}),
      // A shoulder of zero length is a cone that BUTTS rather than plugs, and 50 of the 854 publish
      // one. Written through as such rather than treated as an absent field, so the mass model adds
      // no shoulder that the vendor does not sell.
      aftShoulderRadius: p.shoulderLength > 0 ? p.shoulderDiameter / 2 : undefined,
      aftShoulderLength: p.shoulderLength > 0 ? p.shoulderLength : undefined,
      // The shoulder's OWN wall and end cap are cleared, not inherited, and this is a real defect
      // rather than tidiness. `shoulderContribs` in `lib/sim/mass.ts` reads both: a stale
      // `aftShoulderThickness` walls the vendor's shoulder to the dimensions of the cone the flyer
      // replaced, and a stale `aftShoulderCapped` adds a bulkhead disc the catalogue never states —
      // both at the very front of the rocket, where a gram moves the CG furthest. The catalogue
      // states neither for any of the 854, so the honest value is absent: undefined thickness makes
      // the shoulder follow the nose's own wall, which is what a real moulded cone does.
      aftShoulderThickness: undefined,
      aftShoulderCapped: undefined,
      // The stock travels only when the catalogue has a usable density, exactly as it does for a
      // tube: a real wall under an invented density is a wrong mass from the other direction.
      ...(material ? { material } : {}),
      // **The replaced cone's own weighed figures are CLEARED, not kept**, and this was a defect
      // found by the pre-push review rather than by any test. `overrideMass` wins outright in
      // `lib/sim/mass.ts` and additionally suppresses the shoulder, so a design whose nose carried
      // one took the vendor's whole geometry and flew the OLD mass — measured on
      // `rocksimTestRocket1.rkt` (nose override 126.4 g): dry mass 387.736 g before the pick and
      // 387.736 g after, byte for byte, under a caption reading "Flying SEMROC BNC-70HAC".
      // `overrideCGx` is worse than merely stale: 65.4 mm was measured on a 396.9 mm cone and would
      // have been pinned onto the 233.7 mm one that replaced it. 10 of the 41 corpus designs with a
      // nose carry the mass override and 5 carry the CG one, so this is the common case rather than
      // an edge. The vendor's own published weight still wins where they publish one.
      overrideMass: p.mass !== undefined && p.mass > 0 ? p.mass : undefined,
      overrideCGx: undefined,
      children,
    };
  }
  return children === c.children ? c : { ...c, children };
}

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
    // UUID-shaped, and derived from the host so it is stable across rebuilds of the same edit bag.
    // A plain `${tube.id}-boattail` was both: stable, and NOT a UUID — and `lib/ork/export.ts` hashes
    // any non-UUID id into one on the way out, so all three of the flat structural adds changed
    // identity every time the design was saved. A design built here is persisted as its own exported
    // bytes, so that is not an export-only detail: a selection, an aim or an undo naming one of these
    // parts stopped resolving after a reload.
    id: uuidFrom(`${tube.id}-boattail`),
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

/** How much of an internal part's outer diameter its bore may take. A part has to be made of
 *  something: at 1.0 the wall is zero, the mass is zero, and the CG the flight reports comes from a
 *  component nobody could build.
 *
 *  **The exact fraction is a choice; holding it in ONE place is not.** The panel advertises this cap
 *  on the Bore field and `internalGeometryEdit` enforces it, and a bound quoted from one place and
 *  applied from another is a promise the validator never made — a defect this file has shipped once
 *  already (the boattail's exit advertised the picked tube's caliber while the validator used the
 *  aft-most tube's, so a value inside the advertised range was a silent no-op). Both read this. */
export const INTERNAL_MAX_BORE_FRACTION = 0.99;

/** The physical ceilings on the internal part `selectedId` names, read off the part HOLDING it.
 *
 *  **Exported because the panel advertises these numbers and the applier enforces them, and a bound
 *  quoted from one place and applied from another is a promise the validator never made.** That exact
 *  defect has shipped here once: the boattail field advertised the picked tube's caliber while the
 *  validator used the aft-most tube's, so a value inside the advertised range was a silent no-op. One
 *  function, two callers.
 *
 *  Either may be `undefined`, which means "no bound this design can state" — a part with no host in
 *  the tree, or a host with no length. The applier then takes the flyer's number as given: inventing a
 *  ceiling out of nothing would be a fabricated constraint, which is the opposite failure. */
export function internalPartBounds(
  rocket: Rocket,
  selectedId?: string,
): { maxLength?: number; maxOuterDiameter?: number } {
  const target = primaryInternalPart(rocket, selectedId);
  if (!target) return {};
  const flat = flattenRocket(rocket);
  const host = flat.find((p) => p.component.children.some((c) => c.id === target.id));
  if (!host) return {};
  // **The host's BORE, and it is stated two different ways depending on what the host IS.**
  //
  // An airframe part (a body tube, a nose, a transition) states an outer radius and a wall, and the
  // bore is the difference — which is what `internalPartDefaults` measures when it authors a part
  // into one. An INTERNAL part states its bore outright, in `innerRadius` (`types.ts`), and
  // `aftOuterRadius` does not answer for those kinds at all: it returns undefined for anything that
  // is not a body part, so a host that is itself a coupler or a motor-mount tube produced NO bound.
  //
  // That is not a corner. Across the 27 OpenRocket files in the corpus, **36 internal parts on 14
  // designs sit inside another internal part** — ten bulkheads inside couplers on
  // `Two stage high power rocket.ork` alone, engine blocks inside motor-mount tubes on eight designs.
  // Every one of them had a panel that advertised no ceiling and an applier that took whatever was
  // typed, on the field whose whole docblock is "nothing fits in a tube wider than its host's bore".
  const hostInner = (host.component as { innerRadius?: number }).innerRadius;
  const bore = INTERNAL_KINDS.has(host.component.kind)
    ? hostInner !== undefined && hostInner > 0
      ? hostInner
      : undefined
    : (() => {
        const r = aftOuterRadius(host.component) ?? 0;
        const w =
          "thickness" in host.component &&
          host.component.thickness !== undefined &&
          host.component.thickness > 0
            ? host.component.thickness
            : 0;
        return r > 0 ? Math.max(1e-6, r - w) : undefined;
      })();
  return {
    maxLength: host.length > 0 ? host.length : undefined,
    maxOuterDiameter: bore !== undefined ? bore * 2 : undefined,
  };
}

/** Resolve what the three internal fields actually mean on this design, ONCE, against the pristine
 *  tree — the same discipline `massTarget`, `nosePickId` and `chuteTargetId` already follow, and for
 *  the same reason: every one of these numbers is bounded by a part OTHER than the one being edited,
 *  so reading the bound off a tree a previous step has already mutated gives a different answer.
 *
 *  **The bounds are physical, not stylistic, and this is a SAFETY-posture surface.** These parts have
 *  no aerodynamic contribution, so every one of these fields reaches the flight through MASS — which
 *  moves the CG, the static margin and the apogee. A value that cannot be built therefore does not
 *  produce a visibly silly rocket; it produces a confident number computed from one. Three bounds:
 *
 *  - **Nothing fits in a tube wider than its host's bore.** A coupler joins two tubes from the inside;
 *    a centring ring centres a mount inside one. `internalPartDefaults` already sizes a new one to
 *    `hostOuterRadius − hostWall`, and an edit is held to the same ceiling.
 *  - **Nothing is longer than the part holding it** — `RING_KINDS`' own stated constraint, and the one
 *    the authoring path already enforces by cutting a coupler down (see `addInternalPart`).
 *  - **A bore is capped a hair BELOW the outer diameter being flown** — `INTERNAL_MAX_BORE_FRACTION`.
 *    A bore equal to the outer diameter is a part made of nothing: zero wall, zero mass, and a
 *    confident CG computed from a component that cannot exist. The cap is a clamp rather than a
 *    refusal because "as thin as it goes" is legible intent and a bound is a real answer — the same
 *    rule `NumberField` states for every other bounded field in the app.
 *
 *  Returns `undefined` when nothing is aimed or nothing is set, so the applier can skip the walk. */
function internalGeometryEdit(
  rocket: Rocket,
  edits: GeometryEdits,
  radiusScale: number,
): { id: string; length?: number; outerRadius?: number; innerRadius?: number } | undefined {
  const target = primaryInternalPart(rocket, edits.internalId);
  if (!target) return undefined;
  const { maxLength: hostLength, maxOuterDiameter } = internalPartBounds(rocket, edits.internalId);
  // **The host bound is measured on the PRISTINE tree and applied AFTER the caliber scale**, so it
  // has to be scaled too. `bodyDiameter` scales the whole outer airframe and every internal part with
  // it (`scaleAirframeRadii`), and this edit is written last so an absolute number typed here is the
  // one flown — the same precedence the transition's exit has. Without the factor, typing a coupler's
  // outer diameter and then narrowing the airframe left the coupler WIDER than the tube holding it,
  // and `outerRadius()` reads the widest part, so the reference area went with it.
  const hostBore =
    maxOuterDiameter !== undefined ? (maxOuterDiameter / 2) * radiusScale : undefined;

  const length =
    edits.internalLength !== undefined && edits.internalLength > 0
      ? hostLength !== undefined
        ? Math.min(edits.internalLength, hostLength)
        : edits.internalLength
      : undefined;
  const outerRadius =
    edits.internalOuterDiameter !== undefined && edits.internalOuterDiameter > 0
      ? hostBore !== undefined
        ? Math.min(edits.internalOuterDiameter / 2, hostBore)
        : edits.internalOuterDiameter / 2
      : undefined;
  // What the bore is measured against: the outer radius actually being FLOWN — the edited one where
  // there is an edit, the design's own otherwise. Measuring it against the design's stale outer radius
  // is how "58 mm of bore into a part I just narrowed to 54" gets through.
  const outerFlown = outerRadius ?? target.outerRadius;
  const innerRadius =
    edits.internalInnerDiameter !== undefined && edits.internalInnerDiameter >= 0
      ? Math.min(edits.internalInnerDiameter / 2, outerFlown * INTERNAL_MAX_BORE_FRACTION)
      : undefined;
  if (length === undefined && outerRadius === undefined && innerRadius === undefined) return undefined;
  return { id: target.id, length, outerRadius, innerRadius };
}

/** Apply that resolved edit to the one component it names. A bare setter — every bound was already
 *  taken in `internalGeometryEdit`, against the pristine tree. */
function withInternalGeometry(
  c: RocketComponent,
  e: { id: string; length?: number; outerRadius?: number; innerRadius?: number },
): RocketComponent {
  if (c.id === e.id && (INTERNAL_KINDS.has(c.kind))) {
    const part = c as RingComponent | InnerTube;
    const outerRadius = e.outerRadius ?? part.outerRadius;
    // **The bore is clamped against the radius actually being WRITTEN, here, unconditionally.** It is
    // already capped in `internalGeometryEdit` — but against the pristine tree, and this runs after
    // the caliber scale has moved `part.outerRadius` underneath it. Re-asserting it at the point of
    // writing makes "a part is never inside out" true by construction rather than by an argument
    // about the order of five transforms, which is the kind of argument that stops being true the
    // next time one is inserted.
    const bore = Math.min(
      e.innerRadius ??
        (part.innerRadius < outerRadius
          ? part.innerRadius
          : Math.max(0, outerRadius - (part.outerRadius - part.innerRadius))),
      outerRadius * INTERNAL_MAX_BORE_FRACTION,
    );
    return {
      ...part,
      length: e.length ?? part.length,
      outerRadius,
      // A bore the outer edit has just overtaken is pulled back under it rather than left crossing:
      // the flyer narrowed the part and said nothing about the hole, so the hole follows the wall it
      // is cut in and the part KEEPS THE WALL THE DESIGN DREW. Leaving it would fly a part inside
      // out; taking the bore cap instead would silently turn a 2 mm-walled coupler into foil.
      innerRadius: bore,
    } as RocketComponent;
  }
  if (!c.children.length) return c;
  return { ...c, children: c.children.map((k) => withInternalGeometry(k, e)) };
}

/** Put one mass object at an absolute station (m from the nose tip), clamped to stay inside the part
 *  holding it.
 *
 *  Takes the WHOLE rocket rather than a placement, because both numbers the conversion needs — where
 *  the host begins and how long it is — are read off the tree it is given, not inferred from the mass's
 *  own offset. Inferring them is what made this wrong for every placement method except `top`, and wrong
 *  again under any live length edit. A point mass placed outside the airframe would still be FLOWN: the
 *  solver puts mass wherever the tree says. This clamp is the difference between a CG a flyer can trust
 *  and one computed from a rocket that could not be built.
 *
 *  The method is rewritten to `top` on the way through, so the mass then behaves like one a flyer
 *  placed: measured from the fore end of the part carrying it, and staying put in it when the airframe
 *  around it changes. */
function withMassStation(rocket: Rocket, id: string, station: number): Rocket {
  const flat = flattenRocket(rocket);
  const host = flat.find((p) => p.component.children.some((c) => c.id === id));
  if (!host || !(host.length > 0)) return rocket;
  const offset = Math.max(0, Math.min(host.length, station - host.xFore));
  return {
    ...rocket,
    stages: rocket.stages.map((s) => ({
      ...s,
      components: s.components.map((c) => withMassObject(c, id, undefined, offset)),
    })),
  };
}

/** Set one mass object's weight and/or its offset inside its parent, wherever it sits in the tree. */
function withMassObject(
  c: RocketComponent,
  id: string,
  mass: number | undefined,
  offset: number | undefined,
): RocketComponent {
  if (c.id === id && c.kind === "masscomponent") {
    return {
      ...c,
      ...(mass !== undefined ? { mass } : {}),
      ...(offset !== undefined ? { placement: { ...c.placement, method: "top" as const, offset } } : {}),
    };
  }
  if (!c.children.length) return c;
  return { ...c, children: c.children.map((k) => withMassObject(k, id, mass, offset)) };
}

/** How far the mould line steps at the joint immediately behind a component — the difference in
 *  DIAMETER (m) between what it presents at its aft face and what the next part presents at its fore
 *  face. 0 when they fair, undefined when there is no joint to judge (nothing follows, or one of the
 *  two is not on the outer mould line).
 *
 *  Worth stating because Loft's drag model has a term for a transition's OWN slope — Niskanen eq. 3.86
 *  for a shoulder, 3.88 for a boattail, both a function of the joint angle — and none at all for a bare
 *  radius step, which has no length to take an angle over. A step is not exotic: measured across the
 *  35-design corpus, 33 of the 115 joints it can judge already step, in 13 of the 35 designs, by a
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
  // Loft does not model either. All 12 stage boundaries in the corpus pass this — a stack is joined
  // until it separates — so a boundary step is reported like any other.
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
 *  contracting ones exit at a median 0.7446 of the diameter they start at, over a median
 *  γ = L / 2·ΔR of 2.2938 — on the gentle side of the γ ≥ 3 at which a boattail's own pressure drag
 *  has faded to nothing (Niskanen eq. 3.88). Both medians are over the CONTRACTING subset; γ across
 *  all 21 tapered transitions is 2.7609, which is a different statistic.
 *
 *  The floor is the shortest real transition in the corpus, 6.35 mm, so that closing a step of a few
 *  ten-thousandths of a millimetre — the smallest in the corpus is 0.0004 mm, a rounding artefact of
 *  a design stated in inches — cannot mint a part too small to see, click or take back out. */
const TRANSITION_CONTRACTION = 0.7446;
const TRANSITION_SLENDERNESS = 2.2938;
const TRANSITION_MIN_LENGTH = 0.00635;
/** The corpus's median transition length, for the one case with no diameter change to derive one
 *  from: a section between two parts already at the same caliber. Measured over the same 25. */
const TRANSITION_MEDIAN_LENGTH = 0.01905;

/** What an authored point mass weighs and where it sits before the flyer says otherwise, both the
 *  corpus's own medians over its 56 mass objects.
 *
 *  The mass is the median of the 52 that are real parts rather than a whole airframe's stated weight
 *  (q25 5 g, q75 498 g — the spread is why this is a starting point and not a guess to leave alone; the
 *  field is aimed at the new part the moment it exists). The station is a fraction of the length of the
 *  part holding it: the median offset among the 16 corpus masses placed `top` inside a body tube is
 *  0.3251 of that tube's length. A third of the way down is where an av-bay actually goes. */
const MASS_OBJECT_DEFAULT_KG = 0.045;
const MASS_OBJECT_STATION_FRACTION = 0.3251;

/** The transition an "add one behind this" gesture should build: what it starts at, what it exits at,
 *  and the length that change implies. Undefined when the anchor presents no outer diameter to start
 *  from — a coupler, a fin set, a point mass — which is also the case where no transition can be
 *  faired to it.
 *
 *  The exit is decided by the airframe, never invented, and there are exactly three positions an
 *  anchor can be in. Measured by driving all 91 body tubes in the starter plus the 35-design corpus:
 *
 *   - **Nothing behind it (28 of 91).** A tail cone, contracting to the corpus median of the 14
 *     contracting transitions — 0.7446 of the diameter it starts at, over γ = L/2·ΔR of 2.2938. This
 *     is the base-drag lever, and the only position where a contraction is what the flyer is asking
 *     for.
 *   - **A part behind it at a different caliber (17 of 91).** The transition fairs EXACTLY to it and
 *     closes a step the design already had. Nothing is chosen; the number is read off the neighbour.
 *   - **A part behind it at the same caliber (46 of 91).** Straight through, fore = aft, at the
 *     corpus's median transition length. Contracting here would open a step at the joint BEHIND the
 *     new part — a stepped airframe nobody drew, on half the positions the gesture is offered.
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

/** The `RingComponent` kinds — everything that mounts INSIDE a tube as an annular or solid cylinder
 *  (`types.ts`). They share a shape and, for the fitting rule, a constraint: none can be longer than
 *  the tube holding it. */
const RING_KINDS: ReadonlySet<string> = new Set(["tubecoupler", "centeringring", "bulkhead", "engineblock"]);
const isRing = (c: RocketComponent): c is RingComponent => RING_KINDS.has(c.kind);

/** A coupler's length as a multiple of the tube it joins. Median of the 31 real couplers in the
 *  corpus (p25 1.287, p75 2.323, and never once below 1.0537 — a coupler shorter than its own
 *  diameter does not hold a joint straight, and no designer in the corpus drew one). */
const COUPLER_CALIBERS = 1.859;
/** A centring ring's thickness, ABSOLUTE rather than a fraction of the tube. The corpus median over
 *  83 real rings is 3.18 mm, which is 1/8 inch — ring stock is sold in sheet thicknesses, so the
 *  number that generalises is the sheet, not a ratio. (p25 2.0 mm, p75 6.35 mm = 1/4 inch; the
 *  length/diameter ratio spans 0.020–1.000 over the same set, a 50x spread against the thickness's
 *  25x, so the ratio is the worse predictor as well as the less physical one.) */
const RING_THICKNESS = 0.003175;
/** What a centring ring bores to when its host carries no inner tube to centre, as a fraction of the
 *  ring's own outer radius: the corpus median over 83 rings, every one of which is bored. */
const RING_BORE_FRACTION = 0.87;

/** Geometry for the two INTERNAL kinds, from the corpus rather than from taste — the same rule the
 *  transition defaults above follow, and for the same reason: a part that arrives at a made-up size
 *  is a mass the flyer will not think to check.
 *
 *  **A coupler and a centring ring are the same `RingComponent` and could not be less alike in
 *  proportion.** A coupler is a TUBE — 1.86 calibers long with a wall, spanning a joint. A ring is a
 *  PLATE — 3.18 mm of ply with a big hole in it. Sizing them alike is how the first draft of this
 *  gave every ring a 50 mm solid slug: 134 g at the corpus median and 1.74 kg at its worst, on a part
 *  that really weighs a few grams.
 *
 *  **The bore is where the ring earns its name, and it is read from the design wherever the design
 *  states it**: the `innertube` mounted in the host IS the motor mount a ring centres (`MotorMount`
 *  is a marker carrying no diameter of its own — see `types.ts`), so a host that has one fixes the
 *  bore exactly. Where the host has none there is no measurement to take, and the fallback is the
 *  corpus median ratio rather than a solid disc: **0 of the 83 real centring rings in the corpus are
 *  solid.** A disc with no hole is a bulkhead, which is a different part doing a different job. */
export function internalPartDefaults(
  kind: "tubecoupler" | "centeringring",
  host: RocketComponent,
): { length: number; innerRadius: number } {
  const hostR = aftOuterRadius(host) ?? 0;
  const wall = "thickness" in host && host.thickness !== undefined && host.thickness > 0 ? host.thickness : 0;
  const ro = Math.max(1e-6, hostR - wall);
  if (kind === "tubecoupler") {
    // A coupler is a tube, so it keeps a wall like the tube it joins: **the host's own wherever the
    // host states one**, and 5% of the radius only for the 12 corpus tubes that state none.
    //
    // This read `Math.max(wall, ro * 0.05)`, which is a FLOOR rather than a fallback and was caught
    // by the pre-push review disagreeing with the sentence above it. The floor won on 56 of the 78
    // corpus tubes that DO state a wall — 72% — because a real airframe wall is thin next to its
    // bore: it inflated the coupler's mass by a median 1.93x and up to 12.85x, +416 g on
    // `FullScaleModelTH.rkt` alone, which moves liftoff mass and static margin. A design that states
    // its wall has already answered this question and Loft has no business overriding the answer.
    const w = wall > 0 ? wall : ro * 0.05;
    return { length: COUPLER_CALIBERS * 2 * ro, innerRadius: Math.max(0, ro - w) };
  }
  // The mount is not always a direct child — 41 corpus body tubes hold one deeper — so this descends,
  // and it prefers a tube actually CARRYING a motor mount over the first inner tube it meets. The
  // label on the button says "bored to the motor mount", and this is what makes that true rather than
  // usually-true: `innertube` is also how a design models an av-bay sleeve or a coupler stub.
  const mounts = innerTubesWithin(host);
  const innerTube = mounts.find((t) => t.motorMount) ?? mounts[0];
  const bore =
    innerTube && innerTube.outerRadius > 0
      ? Math.min(innerTube.outerRadius, ro * 0.95)
      : ro * RING_BORE_FRACTION;
  return { length: RING_THICKNESS, innerRadius: bore };
}

/** Every inner tube at or below `host`, nearest first. A motor mount is frequently nested one or two
 *  levels down — inside a coupler, inside an assembly — rather than sitting as a direct child. */
function innerTubesWithin(host: RocketComponent): InnerTube[] {
  const out: InnerTube[] = [];
  const walk = (c: RocketComponent) => {
    for (const ch of c.children ?? []) {
      if (ch.kind === "innertube") out.push(ch);
      walk(ch);
    }
  };
  walk(host);
  return out;
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
    // UUID-shaped, and derived from the host so it is stable across rebuilds of the same edit bag.
    // A plain `${tube.id}-boattail` was both: stable, and NOT a UUID — and `lib/ork/export.ts` hashes
    // any non-UUID id into one on the way out, so all three of the flat structural adds changed
    // identity every time the design was saved. A design built here is persisted as its own exported
    // bytes, so that is not an export-only detail: a selection, an aim or an undo naming one of these
    // parts stopped resolving after a reload.
    id: uuidFrom(`${tube.id}-payload`),
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
    // UUID-shaped, and derived from the host so it is stable across rebuilds of the same edit bag.
    // A plain `${tube.id}-boattail` was both: stable, and NOT a UUID — and `lib/ork/export.ts` hashes
    // any non-UUID id into one on the way out, so all three of the flat structural adds changed
    // identity every time the design was saved. A design built here is persisted as its own exported
    // bytes, so that is not an export-only detail: a selection, an aim or an undo naming one of these
    // parts stopped resolving after a reload.
    id: uuidFrom(`${main.id}-drogue`),
    name: "Drogue",
    kind: "parachute",
    placement: { ...main.placement },
    cd: LOFT_AUTHORED_PARACHUTE_CD.cd,
    cdFrom: "loft",
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
/** Set the aimed canopy's drag coefficient.
 *
 *  The provenance moves with it: a coefficient a flyer typed is neither the file's figure nor a
 *  fallback Loft supplied, and leaving `cdFrom` alone would have left the surface reporting "the
 *  design file's own figure" beside a number the file never contained. That is the exact class of
 *  wrongness `cdFrom` was added to prevent, arriving from the other direction.
 *
 *  Mass is untouched, unlike the resize beside it. A canopy's coefficient is a property of its shape
 *  and porosity, not of how much fabric is in it — two canopies of the same diameter and different
 *  Cd weigh the same. */
function withParachuteCd(rocket: Rocket, cd: number, selectedId?: string): Rocket {
  const main = primaryParachute(rocket, selectedId);
  if (!main || !(cd > 0)) return rocket;
  const transform = (list: RocketComponent[]): RocketComponent[] =>
    list.map((c) => {
      const children = transform(c.children);
      if (c.id === main.id) {
        return { ...(c as Parachute), cd, cdFrom: "flyer" as const, children };
      }
      return children === c.children ? c : { ...c, children };
    });
  return { ...rocket, stages: rocket.stages.map((s) => ({ ...s, components: transform(s.components) })) };
}

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
  // **A catalogue PICK has to go when its canopy does, even with no explicit aim** — and the loop
  // above cannot see that case, because it only fires when `bag[slot]` is a string.
  //
  // With the default (unaimed) the fields resolve through "the largest canopy", so removing the
  // chute a pick was made for silently re-lands the vendor's diameter AND weight on the next-largest
  // one, with the provenance line still reading "Flying <part>". That is the `withCatalogTube`
  // migration defect in its third incarnation, and a pick is worse than a typed diameter here
  // because it rewrites the mass as well as the size and carries a vendor's name while doing it.
  //
  // Resolved precisely rather than by clearing on any parachute removal: an over-eager clear would
  // throw away a figure the flyer typed for a canopy that is still there. **The same hole remains
  // for the unaimed VALUE fields on every slot** (`mainParachuteDiameter`, `bodyLength`, and the
  // rest) — it is pre-existing and general, it needs a per-slot fallback resolver this function does
  // not have, and it is filed in `BACKLOG.md` rather than widened here.
  if (usableCatalogParachute((edits as GeometryEdits).catalogParachute)) {
    const held = primaryParachute(rocket, typeof bag.parachuteId === "string" ? bag.parachuteId : undefined);
    if (held && gone.has(held.id)) {
      patch.catalogParachute = undefined;
      patch.mainParachuteDiameter = undefined;
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
 *  This is for an aim that moves because a part was AUTHORED — not for a pick. Picking another part of
 *  the same kind deliberately re-aims a live value onto it, which is a decision already recorded in
 *  `ROADMAP.md`: the panel names the part the fields are holding, so it is visible rather than silent,
 *  and reading one part while editing another is a thing flyers do. An add is different in kind — the
 *  aim moves without being asked, onto a part that did not exist a moment ago.
 *
 *  Only the slots the aim patch actually moves are cleared, so a span typed for a fin set survives
 *  authoring a body tube — and within a slot, only the targets that are dimensions of the part the aim
 *  just left. `bodyDiameter` is not one: it scales the whole outer airframe and goes on meaning the
 *  same thing wherever the aim points, so clearing it snapped 35 of 35 corpus designs back to their
 *  imported caliber the moment a tube was authored. Worst measured, `OR vs RAS Test 1.ork`:
 *  142.2 mm reverting to 101.6 mm and apogee 5,938 m to 7,276 m, from a click that adds a part. */
export function aimsClearedByAiming(edits: GeometryEdits, aim: GeometryEdits): GeometryEdits {
  const bag = edits as Record<string, unknown>;
  const moving = aim as Record<string, unknown>;
  const patch: Record<string, undefined> = {};
  for (const [slot, def] of Object.entries(AIM_SLOTS)) {
    if (moving[slot] === undefined || moving[slot] === bag[slot]) continue;
    const wider = new Set(def.groupWide ?? []);
    for (const field of def.targets) {
      if (wider.has(field)) continue;
      if (bag[field] !== undefined) patch[field] = undefined;
    }
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
/** Where a part lands if the flyer nudges it one place toward the nose (`-1`) or the tail (`+1`).
 *
 *  Returns the `MovedPart` to append, or null when the move is not available — the part is not a
 *  top-level component of a stage, or it is already at that end of its own stage. Null is what the UI
 *  reads to leave the control out, so "can I move this?" is answered in one place rather than
 *  re-derived beside every button.
 *
 *  Deliberately does NOT step into the neighbouring stage at a boundary. A part that left its stage
 *  would separate at a different moment and fly a different flight; the honest answer at the end of a
 *  stage is that there is nowhere to go, not a silent re-staging. */
/** Every place a part can be dropped, for a gesture that is not a one-place nudge.
 *
 *  `moveTarget` answers "one step which way"; a drag answers "anywhere along the airframe", so it needs
 *  the whole set of legal landings at once — both to draw an indicator at each and to know which ones
 *  are not on offer. Same stage-scoped rule as `moveTarget`, for the same reason: a part let out of its
 *  own stage would separate at a different moment and fly a different flight.
 *
 *  Each slot carries two things, and the split is the load-bearing part of this design:
 *
 *  - `move` is the entry to append to `GeometryEdits.moved`, anchored to a component ID. It is
 *    resolved against the tree the operation will actually run against.
 *  - `before` names the part the dragged one would land IN FRONT OF, so a caller can look that part's
 *    station up in the tree it is DRAWING and put the indicator at the right pixel. Null means the aft
 *    end of the airframe.
 *
 *  Those are two different trees and they must stay that way. The rocket on screen carries the flyer's
 *  dimension edits, which synthesise top-level parts of their own — a boattail exists there and not in
 *  the structure — so an anchor read off the drawing can name a part `applyMoves` cannot address, and
 *  the move silently does nothing while the indicator promised otherwise. Anchors come from the
 *  operation's tree; pixels come from the picture.
 *
 *  The two slots that would leave the part where it is are left out rather than returned and ignored:
 *  the gap immediately in front of it and the one immediately behind it are the same position. */
export interface MoveSlot {
  move: MovedPart;
  before: string | null;
}

export function moveSlots(rocket: Rocket, id: string): MoveSlot[] {
  const si = rocket.stages.findIndex((s) => s.components.some((c) => c.id === id));
  if (si < 0) return [];
  const list = rocket.stages[si].components;
  const k = list.findIndex((c) => c.id === id);
  // What sits at the aft end of this stage is the next stage's first top-level part — the stack is one
  // continuous airframe — or nothing at all on the last stage.
  const afterStage = rocket.stages.slice(si + 1).flatMap((s) => s.components)[0]?.id ?? null;
  const slots: MoveSlot[] = [];
  for (let i = 0; i <= list.length; i++) {
    if (i === k || i === k + 1) continue; // both are where it already is
    slots.push({
      move: { id, after: i === 0 ? null : list[i - 1].id },
      before: i < list.length ? list[i].id : afterStage,
    });
  }
  return slots;
}

export function moveTarget(rocket: Rocket, id: string, dir: -1 | 1): MovedPart | null {
  for (const stage of rocket.stages) {
    const i = stage.components.findIndex((c) => c.id === id);
    if (i < 0) continue;
    const j = i + dir;
    if (j < 0 || j >= stage.components.length) return null;
    // Moving toward the nose means landing behind the part TWO places up (or at the nose end); moving
    // toward the tail means landing behind the one that was next. Expressed as an anchor rather than an
    // index so the entry survives a later add or removal changing what sits where.
    return { id, after: dir === -1 ? (i - 2 >= 0 ? stage.components[i - 2].id : null) : stage.components[j].id };
  }
  return null;
}

/** Re-order top-level parts within their stage.
 *
 *  Each entry is applied in turn against the list as it stands, so a sequence of moves composes the way
 *  the flyer made them and dropping the last entry steps exactly one move back. An entry is a NO-OP —
 *  never an error — when the part or its anchor is gone (removed, or never authored), when the two are
 *  in different stages, or when the anchor is the part itself. Those are all states an edit bag restored
 *  from storage can legitimately be in, and refusing them loudly would turn a stale session into a
 *  broken one.
 *
 *  **A move never crosses a stage.** `nextTopLevel` flattens across stage boundaries, so a part let out
 *  of its own stage would re-stage itself silently — a different separation event and a different
 *  flight, with nothing on any surface saying so. The same single-stage-versus-whole-chain confusion
 *  already cost a session once, when an authored transition landed in the middle of a multi-stage
 *  rocket. */
/** The structure a booster is seeded with: the design's own aft body tube, carrying its motor mount and
 *  its fin sets and NOTHING else.
 *
 *  Cloned rather than invented, for the reason R3's fin ring is: it is the only default that is a fact
 *  about this rocket instead of a number somebody chose. What is deliberately left behind is the rest of
 *  that tube's contents, and both halves of that were measured:
 *
 *  - **Avionics and payload.** A whole-subtree clone of the starter's aft tube drags 150 g of altimeter
 *    and parachute into the booster — 26.4% of the seed's mass — none of which a booster carries.
 *  - **Recovery.** `lib/sim/setup.ts` collects recovery devices from stage 0 only, so a canopy cloned
 *    into a booster is dead weight the solver never deploys. Silent, and exactly what a subtree clone
 *    produces. Measured across the corpus's 12 real booster stages: 12 carry a fin set, 10 carry a
 *    motor mount, and 0 carry a nose cone — so tube + mount + fins is what a booster actually is.
 *
 *  Returns null when there is nothing to seed a FLYABLE booster from — no body tube, or a tube with no
 *  motor mount to carry across. That second refusal is not tidiness. A stage that cannot burn is not a
 *  booster, it is ballast the solver sheds, and Loft reports a confident number for it: measured on
 *  `03.Three-stage.ork`, whose aft tube carries no mount Loft can clone, appending one took apogee from
 *  1,481.8 m to 2,299.2 m — a 55% GAIN from a stage that can never fire. An input that cannot mean
 *  anything physically is refused rather than flown into a confident number. 2 of the 35 real designs
 *  are in that state, and on those the gesture is not offered at all. */
function buildStage(rocket: Rocket, entry: AddedStage): { stage: Stage; mountId: string; srcMountId: string } | null {
  const tubes = flattenRocket(rocket).filter((p) => p.component.kind === "bodytube");
  if (!tubes.length) return null;
  const src = tubes.reduce((best, p) => (p.xFore > best.xFore ? p : best)).component;
  if (src.kind !== "bodytube") return null;

  // Keep only what a booster is: the mount and the fins. `motorMount` on the tube ITSELF is the
  // minimum-diameter case, where the tube is its own mount and there is no inner tube to carry over.
  const keep = src.children.filter(
    (c) => c.kind === "trapezoidfinset" || ("motorMount" in c && c.motorMount !== undefined),
  );
  // The MOUNT takes the entry's own `mountId`, not a derived one. The entry has to fully determine the
  // tree it builds — that is what makes replaying the bag from the pristine design the whole of undo —
  // and the mount is the one id something outside the tree has to name: a `MotorInstance`. Deriving it
  // here instead left the app minting an id the applier never used, so the instance named a mount that
  // did not exist and the stage never separated. Everything else is derived, because nothing refers to
  // it by name.
  // **Only the FIRST mount takes `entry.mountId`, and the rest are derived like any other child.**
  // Giving every kept mount that one id was fine while every seed tube had exactly one — and
  // `Airstart timing.ork` has two, a 54 mm centre and a 38 mm airstart, both children of the aft
  // tube. Both clones came out carrying the same id, so the tree held two components indistinguishable
  // by the only handle anything outside it has, and `lib/sim/setup.ts`'s id map resolved the booster's
  // K550W instance to whichever of the pair it happened to keep. Measured: a Ø54 motor loaded into a
  // Ø38.7 mm bore, on a stage Loft had just authored. It flew, because nothing checked; the mount-bore
  // veto in `setup.ts` is what turned it into a visible failure.
  let mountTaken = false;
  const children = keep.map((c, i) => {
    const isMount = "motorMount" in c && c.motorMount !== undefined;
    const takesEntryId = isMount && !mountTaken;
    if (takesEntryId) mountTaken = true;
    return {
      ...structuredClone(c),
      id: takesEntryId
        ? entry.mountId
        : uniqueUuidFrom(`${entry.seedId}:child:${i}`, new Set([entry.seedId, entry.mountId])),
      name: c.name,
      children: [] as RocketComponent[],
    };
  });
  const seed: RocketComponent = {
    ...structuredClone(src),
    id: entry.seedId,
    name: `${entry.name} airframe`,
    children,
  };
  // Which component a motor sits in: the inner tube if one came across, else the seed tube itself.
  const inner = children.find((c) => "motorMount" in c && c.motorMount !== undefined);
  const mountId = inner ? inner.id : "motorMount" in seed && seed.motorMount !== undefined ? seed.id : "";
  if (!mountId) return null;
  // Which mount the SOURCE tube used, so the configuration write can clone that tube's own motor rather
  // than whichever instance happens to be first.
  const srcInner = src.children.find((c) => "motorMount" in c && c.motorMount !== undefined);
  const srcMountId = srcInner ? srcInner.id : src.id;
  // `separationEvent` is left undefined on purpose — that is the serial-staging default (separate when
  // the stage finishes burning), which is what 10 of the corpus's 12 real boosters reduce to, and it is
  // the one a flyer who has just authored a booster means.
  return { stage: { name: entry.name, components: [seed] }, mountId, srcMountId };
}

/** Append the authored booster stages, and give each one a motor in every configuration.
 *
 *  **This is the first edit in the bag that writes to `rocket.configurations`, and that is the whole
 *  operation.** A stage separates only if a configuration instance names a mount inside it
 *  (`lib/sim/setup.ts` derives each stage's burn duration from the instances that land in it), so a
 *  booster with a mount and no instance never lights and never drops: measured on the starter, that is
 *  993.642 m falling to 621.158 m — a 37.5% loss — with no separation event and nothing on any surface
 *  saying why. An authored stage that cannot fly is not a stage.
 *
 *  The instance is added to EVERY configuration, not just the one on screen. A design can carry several
 *  — five on `Deployable payload.ork` — and a booster present on one and missing from another is the
 *  same silent 37.5% on whichever the flyer switches to. The motor cloned is the one in the tube the
 *  booster was SEEDED from, falling back to that configuration's first instance, so the booster flies
 *  the motor its own airframe already flies rather than one Loft chose.
 *
 *  Applied FIRST in the pipeline, before `applyAdds`, so an authored part can anchor onto the new
 *  stage's seed tube and R3's gestures grow the booster from there. */
function applyAddedStages(rocket: Rocket, addedStages?: readonly AddedStage[]): Rocket {
  if (!addedStages?.length) return rocket;
  let out = rocket;
  for (const entry of addedStages) {
    const built = buildStage(out, entry);
    if (!built) continue;
    const { stage, mountId, srcMountId } = built;
    const stages = [...out.stages, stage];
    const configurations = out.configurations.map((cfg) => {
      if (cfg.instances.some((i) => i.mountId === mountId)) return cfg;
      // A configuration with no instances at all is a configuration the design says flies nothing. Two
      // of the 35 real designs carry one. Putting a motor in the booster THERE would make the design
      // fly on a configuration its own file says is empty, which is inventing a flight rather than
      // authoring a stage — so it is left as it is, and it flies nothing with a booster on it too.
      // Cloned from the instance in the tube the booster was SEEDED from where there is one, and only
      // then from the first. On a design whose first instance is in an upper stage those are different
      // motors, and the booster is a copy of the aft airframe: measured on `Three stage low power
      // rocket.ork`, instance zero puts an A8 in a booster whose own mount flies a B6, and apogee reads
      // 294.4 m against the 334.2 m the aft mount's motor gives — 11.9% low.
      const fromSeed = srcMountId ? cfg.instances.find((i) => i.mountId === srcMountId) : undefined;
      const from = fromSeed ?? cfg.instances[0];
      if (!from) return cfg;
      // The IGNITION EVENT is deliberately not carried across. `lib/sim/setup.ts` derives
      // bottom-versus-upper from the stage index, so an event cloned from a SUSTAINER — `burnout`, on a
      // design that air-starts — lands on the new BOTTOM stage where it resolves to "never lights".
      //
      // **No corpus design exercises this, and saying so is the point.** Every seed instance across all
      // 35 real files carries `ignitionEvent: "automatic"` or none, and `ignitionTrigger` maps both to
      // `launch` on the bottom stage — so with the seed-mount preference above in place, restoring this
      // clone changes nothing on any real design. It was entangled with that preference when it was
      // found: the pre-fix code cloned `instances[0]` AND its event, and on `02.Two-stage.ork` the pair
      // took apogee from the 2055.479 m the fixed code flies down to 1152.856 m with the booster never
      // lighting. Either fix alone closes the corpus. The guard stays because the FIELD is what makes a
      // design air-start, `ignitionEvent` is read straight off the file, and a design that sets one on
      // its aft mount is a real file Loft has not met yet — it is pinned by a synthetic case in
      // `edit.test.ts` rather than by the sweep, which is the honest place for it.
      const { ignitionEvent: _e, ignitionDelay: _d, ...rest } = structuredClone(from);
      void _e;
      void _d;
      return { ...cfg, instances: [...cfg.instances, { ...rest, mountId }] };
    });
    out = { ...out, stages, configurations };
  }
  return out;
}

/** Which components can be given a motor mount, and why the answer is not simply "a tube without one".
 *
 *  Three conditions, and each is a case:
 *   - the host must be a `bodytube` or an `innertube`, because those are the only two types that
 *     carry the field at all (`types.ts:120`, `:201`);
 *   - it must not already have one, because this operation SETS the field rather than merging into it;
 *   - and the design must have a motor to put in it. A mount with no `MotorInstance` naming it is
 *     dead weight the solver never lights: `lib/sim/setup.ts` derives each stage's burn from the
 *     instances that land in it, so an empty mount adds nothing and — worse — satisfies a
 *     `canAddStage` that only tests for a mount's EXISTENCE, after which `applyAddedStages` falls back
 *     to `cfg.instances[0]` and the booster flies whichever motor happens to be first. That is the
 *     documented 11.9%-low case on `Three stage low power rocket.ork`, reached from a new direction.
 *     Refusing here is what keeps that door shut.
 */
export function canAddMount(rocket: Rocket, hostId: string): boolean {
  const host = flattenRocket(rocket).find((p) => p.component.id === hostId)?.component;
  if (!host) return false;
  if (host.kind !== "bodytube" && host.kind !== "innertube") return false;
  if ("motorMount" in host && host.motorMount !== undefined) return false;
  // Something to fly. A configuration with no instances at all is a configuration the design says
  // flies nothing, and two of the 35 real designs carry one — those are not a motor to clone.
  return rocket.configurations.some((cfg) => cfg.instances.length > 0);
}

/** Set the authored mounts, and give each one a motor in every configuration.
 *
 *  **The motor is the operation, exactly as it is for a stage.** `applyAddedStages`' own comment says
 *  it: a mount with no instance never lights and never drops, so authoring the field alone would put a
 *  control on screen that changes nothing and leaves `canAddStage` satisfied by an empty mount. The
 *  motor cloned is the one that configuration's first instance flies — the design's own — because a
 *  tube that never had a mount has no motor of its own to prefer.
 *
 *  `ignitionEvent` and `ignitionDelay` are omitted for the same reason `applyAddedStages` omits them:
 *  `lib/sim/setup.ts` derives bottom-versus-upper from the STAGE INDEX, so an event cloned from a
 *  sustainer lands on a mount where it can resolve to "never lights".
 *
 *  Applied at TWO points in the pipeline and idempotent by construction — the second pass finds the
 *  field already set and skips. Once before `applyAddedStages`, so a booster can be authored on a
 *  design whose aft tube had no mount to clone (which is the whole point of this operation, and the
 *  2 designs it exists for); once after `applyAdds`, so a mount can go on a tube the flyer authored.
 *
 *  **It is provably orthogonal to the anchoring property the pipeline order protects**, and that is
 *  why no reordering was needed. `buildStage` picks its seed by set membership and station alone —
 *  `flattenRocket(...).filter(kind === "bodytube")` reduced by `xFore` — and a mount-add creates no
 *  component and moves none, so it can change neither. The three causes of divergence `stageSeedBase`
 *  names (an authored tube at the tail, a removal, a reorder) are every one of them positional. */
function applyMountAdds(rocket: Rocket, mountAdds?: readonly MountAdd[]): Rocket {
  if (!mountAdds?.length) return rocket;
  let out = rocket;
  for (const entry of mountAdds) {
    if (!canAddMount(out, entry.hostId)) continue;
    const set = (list: RocketComponent[]): RocketComponent[] =>
      list.map((c) =>
        c.id === entry.hostId
          ? { ...c, motorMount: { overhang: 0 }, children: c.children }
          : c.children.length
            ? { ...c, children: set(c.children) }
            : c,
      );
    const stages = out.stages.map((st) => ({ ...st, components: set(st.components) }));
    const configurations = out.configurations.map((cfg) => {
      if (cfg.instances.some((i) => i.mountId === entry.hostId)) return cfg;
      const from = cfg.instances[0];
      if (!from) return cfg;
      const { ignitionEvent: _e, ignitionDelay: _d, ...rest } = structuredClone(from);
      void _e;
      void _d;
      return { ...cfg, instances: [...cfg.instances, { ...rest, mountId: entry.hostId }] };
    });
    out = { ...out, stages, configurations };
  }
  return out;
}

/** Whether a booster can be authored on this design at all — the predicate behind the control.
 *
 *  Asked of the same tree the operation runs against, so the button is offered exactly where the
 *  gesture works — and it must actually be ASKED. Exported and asserted but never called from the UI,
 *  the control renders on a design the operation refuses, so the click commits an undo step, flips the
 *  design to edited (which withholds the file's own stored-results comparison) and changes nothing.
 *
 *  It is false where there is no body tube to seed from, and where the aft tube carries no motor mount
 *  to clone: see `buildStage` for the 55% apogee gain that refusal prevents. */
export function canAddStage(rocket: Rocket): boolean {
  return buildStage(rocket, { seedId: "probe", mountId: "probe-mount", name: "probe" }) !== null;
}

/** The tree the NEXT authored stage is seeded from — and the only tree `canAddStage` may be asked of.
 *
 *  `applyAddedStages` runs FIRST in the pipeline, on the pristine design, so the aft tube it clones is
 *  the pristine design's (plus any stage already authored, because the loop accumulates). The whole
 *  edited structure is a different rocket: an authored tube at the tail, a removal, or a reorder all
 *  change which tube is aft-most, and none of them are visible to the operation.
 *
 *  Asking the gate the wrong tree is not cosmetic. Driven across the corpus one removal or one move at
 *  a time, the two disagree in **123 states**, and they disagree both ways. 121 are false refusals —
 *  the cheapest is the starter with one ordinary tube authored at the tail, where the gate says no and
 *  the operation would have given a 2-stage design flying 1373.372 m with a separation, so the control
 *  simply vanishes from a design that supports it. The other 2 are on `03.Three-stage.ork`, one of the
 *  exact designs the refusal exists for: nudge a tube one place and the gate says yes, the button
 *  renders, and the click leaves the stage count at 3 with the design flipped to edited — the
 *  changes-nothing click the refusal was written to prevent, reached from the other side. */
export function stageSeedBase(rocket: Rocket, edits: GeometryEdits): Rocket {
  return applyAddedStages(applyMountAdds(rocket, edits.mountAdds), edits.addedStages);
}

/** Every component id an authored stage accounts for: its seed, whatever is mounted in that seed, and
 *  every part the flyer has since authored INTO the stage. What a removal of that stage has to take
 *  with it, from every list in the bag.
 *
 *  Computed by diffing the structure with the stage against the structure without it, rather than by
 *  walking down from `seedId`. The seed is an ordinary removable component: delete it and the stage is
 *  still there holding the parts authored onto it, but a walk rooted at `seedId` finds nothing and
 *  clears nothing. Measured on the starter — booster, a tube authored inside it set to 400 mm, seed
 *  deleted, then the stage removed — that left the aim live and resized the SUSTAINER: 993.642 m to
 *  1105.598 m with the field still reading 400.
 *
 *  **Removals are deliberately suppressed on both sides.** A part of this stage the flyer has already
 *  deleted still belongs to it, and its `removedIds` entry has to go when the stage does. Leaving it is
 *  not cosmetic: `newPartId` is deterministic and `addStage` names by the current length, so after a
 *  removal the next booster is minted with the SAME seed and mount ids — and is born with its own motor
 *  mount already in `removedIds`. Measured on the starter: add a booster (1491.464 m, one separation),
 *  delete its motor mount (638.973 m, none), remove the stage (993.642 m), add a booster again — and
 *  the new one reads 638.973 m with zero separation events, 35.7% below the design's own flight, from
 *  two clicks that destroy nothing. */
export function addedStageIds(rocket: Rocket, edits: GeometryEdits, seedId: string): Set<string> {
  const bag: GeometryEdits = { ...edits, removedIds: undefined };
  const ids = (r: Rocket) => new Set(flattenRocket(r).map((p) => p.component.id));
  const withStage = ids(structureOf(rocket, bag));
  const without = ids(structureOf(rocket, { ...bag, addedStages: (edits.addedStages ?? []).filter((s) => s.seedId !== seedId) }));
  const gone = new Set<string>();
  for (const id of withStage) if (!without.has(id)) gone.add(id);
  return gone;
}

function applyMoves(rocket: Rocket, moved?: readonly MovedPart[]): Rocket {
  if (!moved?.length) return rocket;
  let stages = rocket.stages;
  for (const mv of moved) {
    const si = stages.findIndex((s) => s.components.some((c) => c.id === mv.id));
    if (si < 0) continue; // the part is gone, or is not top-level
    const list = stages[si].components;
    const from = list.findIndex((c) => c.id === mv.id);
    if (mv.after === mv.id) continue;
    let to: number;
    if (mv.after === null) {
      to = 0;
    } else {
      const anchor = list.findIndex((c) => c.id === mv.after);
      if (anchor < 0) continue; // the anchor is gone, or is in another stage — refuse rather than guess
      // Index AFTER the removal, so "behind X" means the same thing whichever direction the part came
      // from. Computing it before is the classic off-by-one here: dragging forward and dragging back
      // would land one slot apart for the same gesture.
      to = anchor < from ? anchor + 1 : anchor;
    }
    if (to === from) continue;
    const next = list.slice();
    const [part] = next.splice(from, 1);
    next.splice(to, 0, part);
    stages = stages.map((s, i) => (i === si ? { ...s, components: next } : s));
  }
  return stages === rocket.stages ? rocket : { ...rocket, stages };
}

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
  // The structural keys, named in ONE place. Every one of them has to be listed here, and this is the
  // list — callers pass the whole bag and this picks. They used to hand-restate the same three fields
  // at each call site, which is how `moved` reached three of them and not the fourth, and it is the
  // trap `HANDOFF.md` records as costing every operation so far an increment. A caller that passes the
  // whole bag cannot be out of date; a caller that spells out fields silently can.
  return applyGeometryEdits(rocket, {
    added: edits.added,
    removedIds: edits.removedIds,
    moved: edits.moved,
    addedStages: edits.addedStages,
    mountAdds: edits.mountAdds,
  });
}

/** Return a design with the geometry edits applied. The original rocket is untouched (a fresh tree
 *  is returned only where something changed), so callers can keep the imported model pristine.
 *
 *  Removals come first and the dimension edits are applied to what is left — see `applyRemovals`. */
/** Make every AUTHORED coupler and centring ring fit the part it sits inside — the one place that
 *  question is asked, over the tree that is actually flown.
 *
 *  **It runs last, and that is the whole point.** An internal part is seated `bottom`-flush in its
 *  host, so one longer than its host does not overhang the back — it overhangs the FRONT, past the
 *  fore end, into whatever is ahead of it. Which lengths are involved is only settled once the adds,
 *  the removals, the moves and the dimension edits have all run, so any earlier gate is judging a
 *  rocket that is not the one being flown. Two earlier gates did exactly that, and disagreed with
 *  each other in both directions: `buildAdded` refused a pick against the host's PRISTINE length, so
 *  a coupler picked for a tube the flyer had lengthened was refused for fitting a tube that no longer
 *  exists; and the shrink clamp in `applyDimensionEdits` only fired when that one tube carried a
 *  length edit, so a part could be left overhanging by any other route.
 *
 *  **A PICKED part is dropped; a DERIVED one is cut down.** The derived length is Loft's own estimate
 *  of what a flyer would fit, and shortening it is honest. A picked one carries a vendor's part
 *  number on the parts row, so flying a shortened version of a named product is a wrong number under
 *  a label naming a real part — `MAINTAINING.md`'s safety posture — and the honest move is to leave
 *  it out. `GeometryInspector` says so on the surface, names both lengths, and gives the two ways
 *  back: lengthen the tube, or drop the pick.
 *
 *  Design-arrived fittings are NOT touched here. Those stay with the shrink clamp, which is the right
 *  home for them: their geometry is the file's own until the flyer types a length that contradicts
 *  it, and that is the moment the clamp fires. One class of part, one rule, one home. */
function fitAddedInternalParts(rocket: Rocket, added?: readonly AddedPart[]): Rocket {
  if (!added?.length) return rocket;
  const authored = new Map(added.map((a) => [a.id, a]));
  const walk = (list: RocketComponent[]): RocketComponent[] =>
    list.map((c) => {
      const kids = c.children.length ? walk(c.children) : c.children;
      if (c.kind !== "bodytube") return kids === c.children ? c : { ...c, children: kids };
      const host: number = c.length;
      const fitted = kids.flatMap((ch): RocketComponent[] => {
        if (!isRing(ch)) return [ch];
        const entry = authored.get(ch.id);
        if (!entry || ch.length <= host + 1e-9) return [ch];
        if (usableCatalogRing(entry.pick)) return [];
        const cut: RingComponent = { ...ch, length: Math.max(1e-4, host) };
        return [cut];
      });
      return { ...c, children: fitted };
    });
  return { ...rocket, stages: rocket.stages.map((s) => ({ ...s, components: walk(s.components) })) };
}

export function applyGeometryEdits(rocket: Rocket, edits: GeometryEdits): Rocket {
  // ADDS FIRST, then removals, then the dimension edits. The order is not arbitrary and each step of it
  // was chosen against a case:
  //  - adds before removals, so a part the flyer authored can be REMOVED by id like any other. The
  //    other way round, `removedIds` is applied to a tree the added part is not in yet, and the one
  //    part a flyer is most likely to want back is the one they cannot take out.
  //  - adds before the dimension edits, so `bodyTubeId` can aim at an authored tube and `bodyLength`
  //    edits it — the whole point of authoring being an edit of the same model, not a second mechanism.
  //    It also means `aftmostBodyTube`, which anchors a boattail, sees a tube that was added behind it.
  //  - STAGES before everything, because a stage is the level above a component: an authored part has
  //    to be able to anchor onto the booster's seed tube, a removal has to be able to reach into it, and
  //    a reorder has to see it in the stack. Applied last, none of those could address it at all.
  //  - moves AFTER removals, so an entry naming a part or an anchor that has been deleted simply drops
  //    instead of resolving against a tree that still has it; and BEFORE the dimension edits, so
  //    `aftmostBodyTube`, `nextTopLevel` and `transitionDefaults` all see the order the flyer built
  //    rather than the order the file arrived in.
  //  - MOUNT-ADDS twice, and both positions are load-bearing. Before the stages, so a booster can be
  //    authored on a design whose aft tube had no mount to clone — the 2 real designs this operation
  //    exists for, and the reason `canAddStage` refuses them today. After the adds, so a mount can go
  //    on a tube the flyer authored. The operation is idempotent: the second pass finds the field set
  //    and `canAddMount` returns false.
  //  - and FITTING the authored internal parts dead last, over the finished tree, because whether a
  //    coupler fits its tube is only answerable once every step above has run. See
  //    `fitAddedInternalParts` for the two gates this replaced and how they disagreed.
  return fitAddedInternalParts(
    applyDimensionEdits(
      applyMoves(
        applyRemovals(
          applyMountAdds(applyAdds(applyAddedStages(applyMountAdds(rocket, edits.mountAdds), edits.addedStages), edits.added), edits.mountAdds),
          edits.removedIds,
        ),
        edits.moved,
      ),
      withoutRemovedAims(edits),
    ),
    edits.added,
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
  if (part.kind === "tubecoupler" || part.kind === "centeringring") {
    // **Both kinds are the same `RingComponent` in the model** — `length`, `outerRadius`,
    // `innerRadius` — and both mount INSIDE the tube that carries them rather than stacking behind
    // it, which is the fin set's placement mode, not the tube's. A coupler joining two tubes and a
    // ring centring a motor mount are internal parts: nothing about them changes the outer mould
    // line, so `lib/sim/aero` never sees them and they move dry mass and CG only.
    if (after.kind !== "bodytube") return null;
    const hostR = aftOuterRadius(after);
    if (hostR === undefined || !(hostR > 0)) return null;
    // The bore the host actually has. A coupler slides INSIDE the tube, so its outer radius is the
    // tube's INNER radius — that is what "coupler" means — and a tube with no stated wall has no
    // inner radius to speak of, so the host's own outer radius is the honest fallback rather than an
    // invented wall. Measured across the corpus: of 90 body tubes, 12 state no thickness and all 12
    // are RASAero's, whose geometry is deliberately massless.
    const wall = "thickness" in after && after.thickness !== undefined && after.thickness > 0 ? after.thickness : 0;
    const ro = Math.max(1e-6, hostR - wall);
    const geom = internalPartDefaults(part.kind, after);
    // **A pick replaces every dimension AND the stock, or it replaces none of them.** The derived
    // sizes above are Loft's estimate of what a flyer would fit; a catalogued part is a real object
    // with a published outer diameter, bore, length and material, and taking three of those while
    // keeping the host's stock would fly a part that exists nowhere. Every catalogue row states all
    // four — 236 of 236 couplers and 497 of 497 rings — so there is no partial case to handle.
    //
    // **Whether it FITS is not decided here**, and that is the correction rather than an omission.
    // A part too long for its host is refused rather than cut down — a vendor's part number over a
    // length that vendor never published is a wrong number under a label naming a real product — but
    // this function only ever sees the host as the FILE describes it, because `applyAdds` runs before
    // `applyDimensionEdits`. Judging here made the rule disagree with itself in both directions: a
    // coupler picked for a tube the flyer had LENGTHENED was refused against the shorter original,
    // and one picked before the tube was SHORTENED was never re-judged at all.
    // `fitAddedInternalParts` asks the question once, over the tree that is actually flown.
    const pick = usableCatalogRing(part.pick) ? part.pick : undefined;
    return {
      inside: true,
      component: {
        id: part.id,
        name: part.name || (part.kind === "tubecoupler" ? "Coupler" : "Centering ring"),
        kind: part.kind,
        // Seated at the aft end of its host, where a coupler joining the next tube actually sits and
        // where a ring carrying a mount usually does. `bottom` is also the only method that keeps
        // meaning the same thing when the host is later lengthened.
        placement: { method: "bottom", offset: 0 },
        // **Clamped to the host, always.** An internal part seated at the host's aft end with a
        // length longer than the host does not stick out the back — it sticks out the FRONT, past
        // the fore end, into whatever is ahead of it. Caught by the corpus sweep before it shipped:
        // `02.Two-stage.ork`'s first body tube is 7.5 mm long and `Cherokee-E-5055.ork`'s is 25.4 mm,
        // so a coupler at its corpus length ran past both fore ends.
        length: pick
          ? pick.length
          : Math.max(1e-4, Math.min(part.length > 0 ? part.length : geom.length, after.length)),
        outerRadius: pick ? pick.outerDiameter / 2 : ro,
        innerRadius: pick ? pick.innerDiameter / 2 : Math.min(geom.innerRadius, ro),
        // The host's own stock, for the reason every other authored part inherits it: a part that
        // arrives in a material the flyer never chose is a mass they will not check. A host with no
        // material leaves the ring massless, exactly as the tube builder does. A PICK brings its own,
        // because the vendor states one on every row and it is the only thing that makes the part's
        // weight the part's rather than the airframe's.
        ...(pick ? { material: pick.material } : after.material ? { material: after.material } : {}),
        children: [],
      },
    };
  }
  if (part.kind === "masscomponent") {
    // A point mass is mounted INSIDE the part that carries it — 56 of 56 in the corpus have a parent,
    // none is a top-level stage child — so this is the fin set's placement mode, not the tube's.
    //
    // Its station is DERIVED here rather than frozen onto the entry, so a bay stays a third of the way
    // down the tube that holds it when that tube is later resized. `top` is the modal corpus method
    // (31 of 56) and the only one that keeps meaning the same thing under a length edit; `absolute`
    // (12 of 56) would pin it in space while the airframe moved underneath.
    const host = "length" in after && typeof after.length === "number" ? after.length : 0;
    if (!(host > 0)) return null;
    const mass = part.mass !== undefined && part.mass >= 0 ? part.mass : MASS_OBJECT_DEFAULT_KG;
    return {
      inside: true,
      component: {
        id: part.id,
        name: part.name || "Mass object",
        kind: "masscomponent",
        placement: { method: "top", offset: host * MASS_OBJECT_STATION_FRACTION },
        mass,
        massType: "payload",
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
      // dropped by `applyAdds` with nothing said on any surface. The `never` binding makes the fifth
      // kind a compile error instead of a silent no-op.
      //
      // It must still RETURN NULL, not the binding. `return unreachable` compiles, but at runtime the
      // value is the kind STRING, which is truthy — so `applyAdds` destructures `{component, inside}`
      // off it and splices `undefined` into the stage list, and the app throws instead of dropping one
      // part. That is reachable rather than theoretical: `lib/session.ts` restores the edit bag from
      // `localStorage` wholesale, so a session saved by a newer build would white-screen an older one.
      const unreachable: never = part.kind;
      void unreachable;
      return null;
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
  // Which mass object the mass fields are holding. Resolved here, from the design base, for the same
  // reason every other aim is — but APPLIED at the very end, once the tree has its final geometry.
  const massTarget = primaryMassObject(rocket, edits.massObjectId);
  // The exit is applied LAST, after the whole-airframe caliber scale, so an absolute diameter typed
  // here is the one flown even when `bodyDiameter` is also set — the same precedence the boattail's
  // exit already has, and the only one under which the field is not showing a number nothing is using.
  const transExit =
    edits.transitionAftDiameter !== undefined && edits.transitionAftDiameter > 0 && transTarget
      ? { id: transTarget.id, aftRadius: edits.transitionAftDiameter / 2 }
      : undefined;
  const finish = edits.finish;
  // The picked part's wall and stock, resolved against the tube the body fields are aimed at — the
  // same tube `bodyLength` resizes and `bodyDiameter` takes its scale factor from, so the three
  // cannot describe different parts.
  const picked = edits.catalogBodyTube;
  const pickedTubeId = usableCatalogTube(picked) ? primaryBodyTube(rocket, edits.bodyTubeId)?.id : undefined;
  const pickedWall = picked ? (picked.outerDiameter - picked.innerDiameter) / 2 : 0;
  const pickedMaterial: Material | undefined = picked?.material
    ? { name: picked.material.name, density: picked.material.density, type: "bulk" }
    : undefined;
  // The picked cone, resolved against the SAME nose `noseLength` and `noseShape` target — which is
  // `primaryNose`, the frontmost cone, and it takes no selection because there is no nose aim slot.
  // Resolving both through one function is what stops the record and the two scalars describing
  // different parts on a design that carries more than one cone.
  const nosePick = usableCatalogNose(edits.catalogNoseCone) ? edits.catalogNoseCone : undefined;
  const nosePickId = nosePick ? primaryNose(rocket)?.id : undefined;
  const nosePickMaterial: Material | undefined = nosePick?.material
    ? { name: nosePick.material.name, density: nosePick.material.density, type: "bulk" }
    : undefined;
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
  // The internal part's three dimensions and every bound they are held to, resolved once from the
  // pristine design — see `internalGeometryEdit` for why the bounds cannot be read later, and why it
  // needs the caliber factor. Placed after `radiusScale` because it consumes it.
  const internalEdit = internalGeometryEdit(rocket, edits, radiusScale);
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
  // Which mounts the cluster edit lands on — the mount every `primaryMotorClusterCount` readback
  // seeds the field from, plus any mount already holding that same count. Resolved once from the
  // pristine design, like the fin group and the length edits above.
  const mountTargetIds = primaryMountGroupIds(rocket);
  const editOne = (c: RocketComponent): RocketComponent => {
    let geo = editComponent(c, edits, lengths, finShift, finTargetIds, mountTargetIds);
    if (finish) geo = withFinish(geo, finish);
    if (airframeMaterial) geo = withAirframeMaterial(geo, airframeMaterial);
    if (radiusScale !== 1) geo = scaleAirframeRadii(geo, radiusScale);
    if (pickedTubeId && pickedWall > 0)
      geo = withCatalogTube(geo, pickedTubeId, pickedWall, pickedMaterial, picked?.mass);
    if (nosePickId && nosePick) geo = withCatalogNose(geo, nosePickId, nosePick, nosePickMaterial);
    if (transExit) geo = withTransitionExit(geo, transExit.id, transExit.aftRadius);
    // After the airframe caliber scale, for the same reason the transition's exit is: an absolute
    // number typed here is the one flown even when `bodyDiameter` is also set. A coupler is inside the
    // airframe, so the scale reaches it — and a flyer who has typed its diameter has already answered.
    if (internalEdit) geo = withInternalGeometry(geo, internalEdit);
    if (massTarget && edits.massObjectMass !== undefined && edits.massObjectMass >= 0) {
      geo = withMassObject(geo, massTarget.id, edits.massObjectMass, undefined);
    }
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
  // **The canopy all three recovery edits act on is resolved ONCE, from the PRISTINE design, and
  // that is a correctness fix rather than tidiness.**
  //
  // `primaryParachute(rocket, aim)` falls back to "the largest canopy" when the flyer has not aimed
  // at one, which is the default. Each of the three steps below used to re-resolve it against the
  // tree the previous step had just mutated — harmless while every step only RESIZED, because the
  // three ran in an order where the target could not change underneath them. A pick breaks that: it
  // can make the aimed canopy SMALLER than another one, so the fallback moves.
  //
  // Measured on `fixtures/demo-dual-deploy.ork` (Main 1220.0 mm, Drogue 460.0 mm, no aim): pick the
  // catalogued Rocketarium 18 in (457.2 mm) and the Main becomes the SMALLER of the two, so typing
  // 900 into "Main chute Ø" — the field directly above the picker, whose placeholder reads 1220 —
  // resized the DROGUE to 900 mm at 4x its mass and left the Main untouched. The same construction
  // on the promotion path produced TWO components named "Main parachute", both on altitude deploy.
  // 62 of the 151 catalogued canopies are smaller than that design's drogue, and 17 of the 35 corpus
  // designs carry more than one canopy, so this is the common shape rather than a corner.
  //
  // Resolving once against `rocket` is what `nosePickId` and `massTarget` already do above, for the
  // same reason. The id is then passed as the explicit aim to all three, so none of them can fall
  // back to a rule at all.
  const chutePick = usableCatalogParachute(edits.catalogParachute) ? edits.catalogParachute : undefined;
  const chuteTargetId =
    chutePick ||
    edits.mainParachuteDiameter !== undefined ||
    edits.mainDeployAltitude !== undefined ||
    edits.parachuteCd !== undefined
      ? primaryParachute(rocket, edits.parachuteId)?.id
      : undefined;
  // Recovery PICK: a real commercial canopy, applied BEFORE the resize below, because the two compose
  // rather than compete — a pick writes the vendor's diameter and weight, and a diameter typed
  // afterwards then scales the mass from THOSE, so "a PAR-18, but cut down to 400 mm" flies a
  // plausible weight for a cut-down PAR-18 instead of for whatever canopy the file happened to ship.
  // Applied the other way round the pick would silently discard a number the flyer had typed.
  if (chutePick && chuteTargetId) {
    out = {
      ...out,
      stages: out.stages.map((st) => ({
        ...st,
        components: st.components.map((c) => withCatalogParachute(c, chuteTargetId, chutePick)),
      })),
    };
  }
  // Recovery resize: set that same canopy to a target diameter.
  if (edits.mainParachuteDiameter !== undefined && edits.mainParachuteDiameter > 0) {
    out = withMainParachuteDiameter(out, edits.mainParachuteDiameter, chuteTargetId);
  }
  // Recovery coefficient: the canopy's own Cd, on that same aimed canopy. AFTER the pick and the
  // resize, and the order is load-bearing in the same way theirs is: neither of those touches `cd`,
  // so applying it last means a coefficient a flyer typed survives a pick made afterwards rather
  // than being silently discarded by it.
  if (edits.parachuteCd !== undefined && edits.parachuteCd > 0) {
    out = withParachuteCd(out, edits.parachuteCd, chuteTargetId);
  }
  // Recovery add: convert to dual-deploy (main at altitude + a drogue at apogee), on that same canopy.
  if (edits.mainDeployAltitude !== undefined && edits.drogueDiameter !== undefined) {
    out = applyDualDeploy(out, edits.mainDeployAltitude, edits.drogueDiameter, chuteTargetId);
  }
  // Payload add: a point mass inside the (already-edited) body tube, so its station tracks whatever
  // the length/diameter edits left.
  if (edits.payloadMassKg !== undefined && edits.payloadMassKg > 0) {
    out = addPayloadMass(out, edits.payloadMassKg, edits.payloadStation, edits.bodyTubeId);
  }
  // The mass object's STATION, last of all and against the tree that is actually flown.
  //
  // It arrives as an absolute distance from the nose tip — what the field shows and what a flyer reads
  // off the diagram — and has to become an offset inside the part holding it. Both halves of that
  // conversion are facts about the FINAL geometry, so resolving them any earlier is wrong in two ways
  // that were both reachable and both measured:
  //
  //  - the host's fore station was derived as `mass.xFore − placement.offset`, which is only true for
  //    a `top` placement. Of the 56 corpus mass objects 31 are `top`, 12 `absolute`, 8 `bottom` and 5
  //    `middle` — so on 4 of the 24 designs the grip would appear on, the station it read was not the
  //    station flown, and on 3 of those every position along the whole travel landed the mass on ONE
  //    station: a grip that moves the CG once and then never again.
  //  - the host's extent came from the pre-dimension-edit tree, so any live length edit shifted it.
  //    Measured on the starter, in a flyer's normal build order: take the nose from 220 mm to 440 mm,
  //    then ask for station 595 mm, and the mass flies at 815 mm. Shrink the body tube from 620 mm to
  //    207 mm with the mass parked at its aft end and it flies at 840 mm on a 427 mm rocket — the
  //    point mass outside the airframe this clamp exists to prevent, with a confident apogee over it.
  if (massTarget && edits.massObjectStation !== undefined && edits.massObjectStation >= 0) {
    out = withMassStation(out, massTarget.id, edits.massObjectStation);
  }
  return out;
}
