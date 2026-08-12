"use client";

import { useEffect, useRef, useState } from "react";
import type { MassProvenance, Material, Rocket, RocketComponent } from "@/lib/model/types";
import { flattenRocket, STEP_NOTICE_M } from "@/lib/model/geometry";
import { massByComponent, dryMassProperties, statedMassHolder } from "@/lib/sim/mass";
import { massSource, massSourceLabel } from "@/lib/mass-provenance";
import type { MotorMark } from "@/lib/sim/setup";
import { mouldLineStep, internalSpanLabel, type AddedPart, type AddedStage, type GeometryEdits, type MountAdd, type MoveSlot } from "@/lib/model/edit";
import { TOUCH_TARGET } from "@/lib/ui-tokens";
import { csvQuantity } from "@/lib/csv";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";
import type { CatalogPart } from "@/lib/components/db";
import RocketDiagram from "./RocketDiagram";
import DataTable, { type Column } from "./DataTable";
import PartPicker from "./PartPicker";
import { Button, Card, EmptyState, Popover } from "./ui";

type PartRow = { p: ReturnType<typeof flattenRocket>[number]; i: number };

/** The parts table's columns on the shared primitive — `DESIGN.md` §5.
 *
 *  A function rather than a constant because three of the five close over `units` and over the mass
 *  map, both of which change as the flyer works. `csv` is on every column, so this table gains copy
 *  and CSV export for the first time: `COMPETITION.md` row 26 records "sorts and cannot be copied"
 *  as a gap against RockSim, and it closes here with nothing to double, because this panel had no
 *  export of its own at all.
 *
 *  `sortDir: -1` on Mass only. Heaviest-first is the reading the column exists for — a flyer looking
 *  for what to lighten — and it is what the hand-rolled version did. Station and the two names open
 *  ascending, which is nose-to-tail and A→Z. */
const PART_COLUMNS = (
  units: UnitSystem,
  masses: ReturnType<typeof massByComponent>,
  massCell: (id: string) => { text: string; muted: boolean },
  /** Whether the rows are in the design's own nose-to-tail order. **Nesting is only meaningful in
   *  that order**: sorted by mass or by name a child can appear above its host, so an indent would
   *  claim a relationship the row order contradicts. Sorted views render flat, which is honest. */
  treeOrder: boolean,
  /** A component id → the host's own NAME, or `undefined` where the design never gave it one.
   *
   *  **Undefined is a deliberate answer, not a gap.** Falling back to the kind produced "in Body
   *  tube" on every nested row of a design whose tubes are unnamed — which tells a flyer nothing the
   *  indent and the row above it do not already say, and which is actively ambiguous on a design
   *  with three of them. The words earn their place exactly when the host has a distinguishing name
   *  ("in Payload / main bay"), which is also exactly when the indent alone is ambiguous. */
  hostName: (id: string) => string | undefined,
  /** The same lookup, falling back to the host's KIND — used only by the CSV, which has no indent
   *  and so cannot afford the silence the screen can. */
  hostLabel: (id: string) => string | undefined,
): Column<PartRow>[] => {
  /** Does this part's mass appear on ITS OWN row? False for a part subsumed by an ancestor's
   *  whole-assembly override, and for one carrying no structural mass at all. The provenance column
   *  and the Mass cell have to agree about that, so both read it from here. */
  const ownsMass = (id: string): boolean => {
    const m = masses.get(id);
    return !!m && !m.subsumedBy;
  };
  return [
  {
    key: "name",
    label: "Component",
    rowHeader: true,
    sortValue: ({ p }) => (p.component.name || kindLabel(p.component)).toLowerCase(),
    cell: ({ p }) => (
      // **The design is a tree and this table drew it as a list.** Measured across the 27 corpus
      // `.ork` files: 347 of 459 components sit at depth >= 1, and the tree runs four deep — a
      // coupler inside a body tube, a chute inside that coupler, a shock cord beside it, all
      // rendered as siblings of the nose cone. The owner named this directly: "there is a tree of
      // parts from top to bottom in which components such as a payload or a mass or a parachute can
      // be under a coupler or tube."
      //
      // The row stays a table row rather than becoming nested markup, because `DataTable` owns its
      // sort, its keyboard navigation and its copy-out, and a tree of `<ul>`s would lose all three.
      // The guide character is `aria-hidden`: an indent a screen reader announces as a dash tells a
      // blind flyer less than nothing, so the relationship travels in the "in <host>" line instead.
      //
      // **The indent is PADDING, and the first version got that wrong in a way no test could see.**
      // It emitted a run of spaces, which HTML collapses — so every depth rendered the same elbow at
      // zero indentation, a decoration shaped like a tree. Two independent reviewers caught it; the
      // suite could not, because the test asserts the words. An inline element honours
      // `padding-inline-start`, so the cell stays a cell and the depth is real.
      <span
        className="font-sans text-zinc-700 dark:text-zinc-200"
        style={treeOrder && p.depth > 0 ? { paddingInlineStart: `${(p.depth - 1) * 0.9}rem` } : undefined}
      >
        {treeOrder && p.depth > 0 && (
          <span aria-hidden className="select-none text-zinc-300 dark:text-zinc-600">
            └{" "}
          </span>
        )}
        {p.component.name || KIND_LABEL[p.component.kind] || p.component.kind}
      </span>
    ),
    csv: ({ p }) => p.component.name || KIND_LABEL[p.component.kind] || p.component.kind,
  },
  {
    key: "type",
    label: "Type",
    sortValue: ({ p }) => kindLabel(p.component).toLowerCase(),
    cell: ({ p }) => (
      // `data-kind` carries the component's KIND, which its label cannot. The label is the design's
      // own name where it has one — a body tube may be called "Booster airframe" — and the nested
      // line below adds the host's name to this same cell, so any text match over the row is both
      // ambiguous and fragile. Eighteen e2e locators counted body tubes by matching the words "Body
      // tube" anywhere in the row, and the host line broke every one of them at once. A kind is a
      // fact about the model rather than a string on screen, so it is the right thing to select on.
      //
      // `zinc-600`, not `zinc-500`, and the difference is a WCAG failure rather than a shade. §2 puts
      // a label at `secondary` anyway, but the number is what settles it: this cell sits on
      // `bg-indigo-50` the moment its row is PICKED, and `#71717b` on `#eef2ff` is 4.32:1 against
      // AA's 4.5 — so selecting a part, which is now the central gesture of the design workspace,
      // dropped its own kind cell below the floor. On white it was 4.83 and passing, which is why
      // nothing caught it: §9's contrast check walks the docs routes and the workspaces in their
      // RESTING state, and no check picks a row first. `zinc-600` reads 6.90:1 selected, 7.72:1 at
      // rest.
      <span data-kind={p.component.kind} className="text-zinc-600 dark:text-zinc-400">
        {KIND_LABEL[p.component.kind] ?? p.component.kind}
        {/* **The host in words — the half that actually carries the structure.** The indent on the
            name only works in design order and reads as punctuation to a screen reader; this names
            the part it sits inside, so it survives every sort order, reaches assistive tech, and
            goes out in the CSV.

            Subordinated by SIZE, not by colour, and that is a correction rather than a preference:
            the first version set a zinc-400/zinc-500 pair that is on no §2 text role at all, and
            this run's own contrast walk failed it at 3.67:1 against WCAG AA's 4.5. Inheriting the
            cell's colour and dropping one size is what §3 prescribes for the text around a value,
            and it removes the colour decision entirely. */}
        {p.parentId !== undefined && hostName(p.parentId) && (
          <span className="block text-xs">in {hostName(p.parentId)}</span>
        )}
      </span>
    ),
    // **The export falls back to the KIND where the screen does not, and the indent is the reason.**
    // On screen a part inside an unnamed tube is already visibly under it, so repeating "in Body
    // tube" is noise. A CSV has no indent: without the fallback, a part nested three deep exported
    // byte-identical to a stage-level one and the tree could not be reconstructed from the file at
    // all.
    csv: ({ p }) => {
      const host = p.parentId === undefined ? undefined : hostLabel(p.parentId);
      return (KIND_LABEL[p.component.kind] ?? p.component.kind) + (host ? ` (in ${host})` : "");
    },
  },
  {
    key: "station",
    label: "Station",
    sortValue: ({ p }) => p.xFore,
    cell: ({ p }) => d.q(d.lengthMm(p.xFore, units)),
    // **The export takes the SAME quantity the cell renders, and the unit travels in the header.**
    // It used to compute its own `xFore * 1000`, which is millimetres whatever the toggle says — so
    // in Imperial the screen read 12.8 in and the copied row said 323.8, 25.4x off, under a bare
    // `Station`. A build sheet is exactly the surface a flyer acts on from.
    csvLabel: d.lengthMm(0, units).unit ? `Station (${d.lengthMm(0, units).unit})` : "Station",
    csv: ({ p }) => csvQuantity(d.lengthMm(p.xFore, units)),
  },
  {
    key: "mass",
    label: "Mass",
    sortDir: -1,
    sortValue: ({ p }) => masses.get(p.component.id)?.mass ?? 0,
    cell: ({ p }) => {
      const m = massCell(p.component.id);
      const from = massSource(p.component);
      return (
        <span className={m.muted ? "font-sans text-zinc-500 dark:text-zinc-400" : undefined}>
          {m.text}
          {/* **Which masses the design STATED, on the surface that exists to answer "did Loft read my
              rocket right?".** Measured over the 35-design corpus: 91 of them, and every one read
              identically to a figure Loft derived from a density. `DESIGN.md` §6 asks a reference
              value to name its source; a bare number cannot. A dagger rather than a word because the
              column is numbers and the caption below carries the sentence — and `title` alone would
              be a hover-only state §8 forbids, so the mark is visible and the key is in the caption. */}
          {from && !m.muted ? (
            // **No `title`, and that is §8 rather than an omission.** A first version carried the
            // sentence as a tooltip; `e2e/touch.spec.ts` counted two new hover-only states, which is
            // exactly right — a phone cannot reach a tooltip, so a mark's meaning must not live
            // there. The key is in the caption below the table, and the column beside this one says
            // it in words for anyone who wants it in the row itself.
            <span className="ml-1 font-sans text-xs text-zinc-600 dark:text-zinc-400" aria-hidden="true">
              {from.mark}
            </span>
          ) : null}
        </span>
      );
    },
    // Kilograms whatever the toggle said, under a bare `Mass`, while the cell rendered pounds — the
    // same drift as `Station` above and from the same cause, two sources of truth for one number.
    csvLabel: `Mass (${d.mass(0, units).unit})`,
    csv: ({ p }) => {
      const m = masses.get(p.component.id);
      // The screen says "in <assembly>" where a part's mass is counted elsewhere; the export says the
      // same thing rather than a 0 that would silently sum wrong in a spreadsheet.
      return !m ? "" : m.subsumedBy ? `in ${m.subsumedBy}` : csvQuantity(d.mass(m.mass, units));
    },
  },
  {
    key: "massFrom",
    label: "Mass from",
    // Its own column in the CSV as well as a mark on the screen: a spreadsheet has no room for a
    // footnote, and a copied table that says 984 g without saying who said so is the same wrong
    // claim one screen further from the flyer.
    cell: ({ p }) => (
      // zinc-600 rather than 500: on the indigo tint a picked row wears, 500 measures 4.32:1 against
      // WCAG AA's 4.5, which `e2e/contrast.spec.ts` caught over an otherwise green gate.
      <span className="text-zinc-600 dark:text-zinc-400">{massSourceLabel(p.component, ownsMass(p.component.id))}</span>
    ),
    csv: ({ p }) => massSourceLabel(p.component, ownsMass(p.component.id)),
  },
  {
    key: "dims",
    label: "Dimensions",
    cell: ({ p }) => describeDims(p.component, units),
    csv: ({ p }) => describeDims(p.component, units),
  },
  ];
};

/** Design geometry: a to-scale side-view of the airframe, above the parsed component tree with each
 *  part's key dimensions and its station — the "did Loft read my rocket right?" view. Pure
 *  transparency into what the importer produced (the same components the simulator flies), the
 *  geometry counterpart of the mass & balance breakdown. The picture reads at a glance; the table is
 *  the exact detail. The diagram is directly editable through its handles; the table is still
 *  read-only, and both are the surface a from-scratch builder/editor grows further manipulation on
 *  top of. */

/** How the parts table is ordered. "design" is the airframe's own order, nose to tail — the order a
 *  flyer reads their own rocket in, and the default. The rest sort a column, heaviest/longest first
 *  on the numeric ones, because that is the question being asked when you sort them. */
type PartSort = "design" | "name" | "type" | "station" | "mass";

/** Exported so the property surface's heading names a part exactly as the parts table and the
 *  identify line do. Two tables of the same nouns is how a panel's label and its own note drift
 *  apart, and this one is already the app's single copy. */
export const KIND_LABEL: Record<string, string> = {
  nosecone: "Nose cone",
  bodytube: "Body tube",
  transition: "Transition",
  trapezoidfinset: "Trapezoidal fins",
  ellipticalfinset: "Elliptical fins",
  freeformfinset: "Freeform fins",
  tubefinset: "Tube fins",
  innertube: "Inner tube",
  tubecoupler: "Tube coupler",
  centeringring: "Centering ring",
  bulkhead: "Bulkhead",
  engineblock: "Engine block",
  masscomponent: "Mass object",
  parachute: "Parachute",
  streamer: "Streamer",
  shockcord: "Shock cord",
  launchlug: "Launch lug",
  railbutton: "Rail button",
};

/** What kind of part this is, in the reader's words. */
const kindLabel = (c: RocketComponent): string => KIND_LABEL[c.kind] ?? c.kind;

/** A compact dimension summary for one component, in the flyer's units. Empty when the part has no
 *  geometry worth spelling out (its mass still shows in the mass breakdown). */
function describeDims(c: RocketComponent, units: UnitSystem): string {
  const L = (m: number) => d.q(d.lengthMm(m, units)); // small lengths read best in mm / in
  const dia = (r: number) => `⌀${L(2 * r)}`;
  switch (c.kind) {
    case "nosecone":
      return `${c.shape}, L ${L(c.length)}, ${dia(c.aftRadius)}`;
    case "bodytube":
      return `L ${L(c.length)}, ${dia(c.outerRadius)}${c.thickness ? `, wall ${L(c.thickness)}` : ""}`;
    case "transition":
      return `L ${L(c.length)}, ${dia(c.foreRadius)}→${dia(c.aftRadius)}`;
    case "trapezoidfinset":
      return `${c.finCount} fins · root ${L(c.rootChord)}, tip ${L(c.tipChord)}, span ${L(c.height)}`;
    case "ellipticalfinset":
    case "freeformfinset":
      return `${c.finCount} fins · root ${L(c.rootChord)}, span ${L(c.height)}`;
    // The five internal kinds carry the same three numbers, and the row shows all three: the BORE is
    // the hole a motor tube passes through, it is now editable, and a dimension a flyer can change
    // that appears on no list is a change they can only find by re-opening the panel. The axial one
    // takes its word from `internalSpanLabel` rather than a hard-coded `L`, so the row a flyer clicks
    // and the panel it opens cannot call one part two things — which is what that function is
    // exported for. A solid disc has no bore and says nothing rather than "⌀0".
    case "innertube":
    case "tubecoupler":
    case "centeringring":
    case "bulkhead":
    case "engineblock":
      return `${internalSpanLabel(c.kind) === "Thickness" ? "T" : "L"} ${L(c.length)}, ${dia(c.outerRadius)}${
        c.innerRadius > 0 ? `, bore ${dia(c.innerRadius)}` : ""
      }`;
    // The external fittings. A launch lug's and a rail button's DIAMETER and COUNT are what the drag
    // model squares into the protuberance area, so a row that showed only a length was hiding the
    // two numbers that reach the flight. A count of one is left unsaid — every part is one of itself
    // until a design says otherwise.
    case "shockcord":
    case "launchlug":
    case "railbutton": {
      const bits: string[] = [];
      if (c.length !== undefined && c.length > 0) bits.push(`L ${L(c.length)}`);
      if (c.radius !== undefined && c.radius > 0) bits.push(dia(c.radius));
      if ((c.instanceCount ?? 1) > 1) bits.push(`x${c.instanceCount}`);
      return bits.length ? bits.join(", ") : "—";
    }
    default:
      return "length" in c && typeof c.length === "number" && c.length > 0 ? `L ${L(c.length)}` : "—";
  }
}

export default function GeometryInspector({
  rocket,
  units,
  cg,
  cp,
  marginCal,
  cgWithheldReason,
  edited = false,
  motors,
  onEdit,
  onSelectPart,
  onRemove,
  onAddAfter,
  onMove,
  canMove,
  onMoveTo,
  moveSlotsFor,
  addedStages,
  onAddStage,
  onRemoveStage,
  canAddMountTo,
  onAddMount,
  mountAdds,
  onRemoveMount,
  refuseRemoval,
  aims,
  added,
  onPickPart,
  onClearPick,
  propertiesFor,
}: {
  rocket: Rocket;
  units: UnitSystem;
  /** Loaded CG / CP stations (m from the nose tip) and static margin (cal), marked on the diagram
   *  — the same loaded values the results panel reports. Omitted for a design shown without a flight. */
  cg?: number;
  cp?: number;
  marginCal?: number;
  /** Why `cg`/`marginCal` are absent, when they are absent for a reason a flyer should hear rather
   *  than because there is no flight at all.
   *
   *  A blank is a bug (`DESIGN.md` §6: a withheld value says why and what would restore it), and
   *  this panel is where the withholding becomes VISIBLE — the CG mark, the margin in the caption
   *  and the margin in the diagram's accessible name all simply stop being drawn. Without a
   *  sentence, a flyer whose motor did not resolve sees a stability picture quietly lose half its
   *  marks and has nothing on this surface telling them why or how to get it back. */
  cgWithheldReason?: string;
  /** True when `rocket` reflects active what-if geometry edits rather than the imported design, so
   *  the panel can say so — it's then a live preview of the edit, not the parsed original. */
  edited?: boolean;
  /** Loaded motor casing(s), drawn inside the aft body on the diagram. */
  motors?: MotorMark[];
  /** When provided, the diagram exposes a drag handle that applies a geometry edit (fin station). */
  onEdit?: (patch: GeometryEdits) => void;
  /** Told which part the flyer picked, so the editor's fields can describe and edit THAT part rather
   *  than always the design's primary one. Fires on every sticky pick and never on a release; which
   *  fields a pick re-aims — and which picks re-aim nothing — is the edit model's call
   *  (`aimEditsAt`), not this panel's. Picking is a view concern and stays owned here. */
  onSelectPart?: (id: string) => void;
  /** Remove the picked component from the design. Given only where editing is offered, so a design shown
   *  without an editor stays read-only. The panel asks `removalRefusal` first and shows the reason instead
   *  of the control when there is one — a button that silently does nothing is worse than no button. */
  onRemove?: (id: string) => void;
  /** Nudge the picked part one place toward the nose (`-1`) or the tail (`+1`). The parts table is the
   *  KEYBOARD and touch path for a reorder: the diagram's centreline grips are already fine-pointer-only
   *  because at phone fit width the airframe is about 11 px tall and every grip sits inside every other's
   *  44 px target, so a drag-to-reorder handle there would repeat that. A pair of buttons on the picked
   *  row is reachable by tab, by screen reader and by thumb, and the table already defaults to the
   *  design's own order so it shows the result immediately. */
  onMove?: (id: string, dir: -1 | 1) => void;
  /** Whether that nudge is available. Asked of the CALLER rather than worked out here, for the same
   *  reason `refuseRemoval` is: this panel is handed the fully-edited rocket, and the dimension edits
   *  synthesise top-level parts of their own (a boattail), so `moveTarget` answered against it offers
   *  moves on and around parts the operation cannot address — a button that does nothing. The app
   *  judges against the same structure it will apply the move to. */
  canMove?: (id: string, dir: -1 | 1) => boolean;
  /** Commit the diagram drag's drop: put this part immediately behind `after`, or first when null. */
  onMoveTo?: (id: string, after: string | null) => void;
  /** Every legal drop for a part. Handed straight to the diagram, which turns each into a pixel. */
  moveSlotsFor?: (id: string) => MoveSlot[];
  /** Booster stages the flyer has authored, in the order they were added. */
  addedStages?: readonly AddedStage[];
  /** Whether the picked part can be given a motor mount — asked of the tree the operation runs
   *  against, so the control is offered exactly where the gesture works. */
  canAddMountTo?: (id: string) => boolean;
  onAddMount?: (id: string) => void;
  /** The mounts the flyer has authored, so each can be taken back off. */
  mountAdds?: readonly MountAdd[];
  onRemoveMount?: (hostId: string) => void;
  /** Append a booster stage below everything already in the stack. */
  onAddStage?: () => void;
  /** Take one back, named by its seed tube's id. */
  onRemoveStage?: (seedId: string) => void;
  /** Author a part behind the picked one. Offered only on a part something can be built onto — today
   *  a body tube, whose caliber the new one fairs to. A control that appears on every part and does
   *  nothing on most of them is worse than one that appears where it works. */
  onAddAfter?: (id: string, kind?: AddedPart["kind"]) => void;
  /** Why the picked part cannot be removed, or null — asked of the caller, which owns the design a removal
   *  is judged against. The panel judging for itself let the two disagree: it read the fully-edited model,
   *  which contains parts a dimension edit ADDED and the removal mechanism cannot take. */
  refuseRemoval?: (id: string) => string | null;
  /** The property surface for the picked part — the fields that describe THAT component, or null
   *  where nothing describes it.
   *
   *  A render prop rather than a component, because the fields live where the edit bag lives: every
   *  one of them carries its own unit conversion, its bound, its refusal message and the sentence
   *  naming which part it is holding, and moving them here would mean a second copy of all four.
   *  This panel owns the SELECTION (see `selectedId` below) and the app owns the FIELDS, which is the
   *  same split `onSelectPart` already draws.
   *
   *  Driven by `selectedId` rather than by `aims`, deliberately: the aim-following effect below syncs
   *  the pick FROM the aims, so feeding a surface off the aims closes a loop through this component.
   *  `selectedId` is upstream of both. */
  propertiesFor?: (id: string) => { title: string; label: string; body: React.ReactNode } | null;
  /** Every component id the edit model is currently aimed at, keyed by its aim slot. Passed back in so
   *  the pick shown here and the parts the fields describe cannot drift apart — a restored session
   *  arrives with an aim and no pick, and "Reset to as-designed" clears the aims without clearing the
   *  pick. Taken as the whole map rather than one prop per slot: the editor grows a slot per role, and
   *  a prop list that grows with it is a list to forget to extend. */
  aims?: Readonly<Record<string, string | undefined>>;
  /** The parts the flyer has AUTHORED, so the panel can tell an authored coupler or centring ring
   *  from one the design arrived with. Only the two internal kinds read it today — they are the only
   *  authored parts that carry a catalogue pick — but it is the whole list rather than a filtered one
   *  because filtering here would put a second copy of "which kinds can be picked" on this side of
   *  the wire, and the two would drift.
   *
   *  It arrives from the same edit bag `addedStages` and `mountAdds` already come from, for the same
   *  reason: the pick rides on the `AddedPart` entry (see `PickedRing`), so the entry is what the
   *  picker has to be shown to know whether one is set. */
  added?: readonly AddedPart[];
  /** A catalogued coupler or centring ring chosen for the authored part `id`. The catalogue ROW and
   *  the stock the picker resolved, not a finished record — turning those into a `PickedRing` is the
   *  edit model's call and is made where the rest of the bag is assembled, exactly as the three
   *  pickers that already exist do it. That is also what keeps the refusal of a density the catalogue
   *  would not stand behind a single decision, made in the picker and passed on. */
  onPickPart?: (id: string, part: CatalogPart, material: Material | undefined) => void;
  /** Drop the pick on `id`, returning the part to the size Loft derived for it. Separate from
   *  `onPickPart` rather than a pick of `undefined`, because the two gestures carry different undo
   *  labels and different keys — a pick names the vendor's part, a clear names the kind. */
  onClearPick?: (id: string) => void;
}) {
  const parts = flattenRocket(rocket);
  // Each part's own dry mass, keyed by the same component id the diagram and the table share, so a
  // part can be pointed at on the picture and read with its weight beside its dimensions. Structure
  // only — the motor is layered on at launch and lives in the mass & balance panel.
  const masses = massByComponent(rocket);
  // The design's real dry mass, from the same source the Mass & balance panel reads, NOT the sum of
  // the column below. A design can state its mass as a whole-STAGE override, which belongs to no
  // component and so gets no row here — every part under it correctly reads 0 g "counted in
  // <stage>", and summing the column then reports the whole airframe as weightless. Measured with no
  // edits at all: `Dual parachute deployment.ork` said "adds up to 0 kg" for a 1.361 kg rocket and
  // `EscapeVelocity.ork` "0 kg" for 2 kg, both beside a panel stating the true figure.
  const dryTotal = dryMassProperties(rocket).mass;
  // What no row can account for. Named rather than hidden: a table whose column does not add up to
  // its own stated total, with nothing saying why, is the worse of the two failures.
  const columnTotal = [...masses.values()].reduce((a, m) => a + m.mass, 0);
  const unlisted = dryTotal - columnTotal;
  // Hover previews, a click picks. Picking has to stick: the pointer must leave a shape before you
  // can read anything about it, so a hover-only link meant clicking a part on the diagram told you
  // nothing — the one place it said what the part was sat behind a closed disclosure.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [partsOpen, setPartsOpen] = useState(false);
  const [sort, setSort] = useState<PartSort>("design");
  // Keep the pick shown here in step with the aims the edit model holds. Two paths move one without a
  // click: restoring a session arrives with an aim and no pick, and "Reset to as-designed" clears the
  // aims while the row stays highlighted — after which the next click on that row toggles it OFF and
  // the flyer has to click twice to aim at it again.
  //
  // What matters is which aim MOVED, not which is set. With the fin fields aimed at one set and the
  // body fields at another part, treating any of them as "the pick" would drag the highlight straight
  // back off whichever the flyer clicked last — so the previous map is kept and compared slot by slot.
  const aimSig = JSON.stringify(aims ?? {});
  // Seeded EMPTY, not with the aims present at mount, so the first run sees a restored session's aim as
  // a move and shows it as the pick. Seeded with them, the mount-time comparison found nothing moved and
  // a resumed session came back asserting the fields were aimed at a part that nothing on the diagram or
  // in the parts table identified — while the drag handles did sit on it. Two surfaces disagreeing about
  // the same pick.
  const lastAims = useRef("{}");
  useEffect(() => {
    const was: Record<string, string | undefined> = JSON.parse(lastAims.current);
    lastAims.current = aimSig;
    const now: Record<string, string | undefined> = aims ?? {};
    const moved = [...new Set([...Object.keys(was), ...Object.keys(now)])].filter((k) => was[k] !== now[k]);
    if (!moved.length) return;
    setSelectedId((cur) => {
      // An aim that moved TO a part shows as the pick.
      const aimed = moved.map((k) => now[k]).find(Boolean);
      if (aimed) return aimed;
      // Otherwise every aim that moved was CLEARED — "Reset to as-designed" clears them all at once, so
      // more than one moves in a single commit. Drop the pick only when it is a part one of them was
      // aiming through; a part the flyer is merely reading stays picked. Examining only the first moved
      // slot left a picked tube highlighted with no aim behind it, after which the next click on that
      // row toggled the highlight OFF instead of aiming, so it took two clicks to aim at it again.
      return moved.some((k) => was[k] === cur) ? null : cur;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aimSig]);

  // **This used to carry a second, parallel effect for couplers and centring rings**, because those
  // two kinds had no `AIM_SLOTS` entry at all: `aimEditsAt` returned an empty patch for them, no aim
  // moved when one was authored, and the effect above could not show the new part as the pick the way
  // it does for a tube or a fin set. The `internalId` slot removed the special case — a coupler now
  // moves an aim exactly as every other kind does, and the one effect above handles it. Two code
  // paths selecting the same part on the same commit is how they drift.

  // The diagram, a table row click and a row's Enter/Space all pick the same way, so they go through
  // one toggle — three copies could not stay in step once picking gained a second effect.
  //
  // The next value is computed here rather than inside the updater: a state updater has to be pure,
  // and React double-invokes it in development, so calling out from inside it re-flew the design
  // twice per pick and updated a parent mid-render.
  //
  // A pick is reported, and a RELEASE is not. Reporting a release would silently re-aim an active edit
  // at the design's primary part — the flyer sets set 2's span to 77 mm, clicks the row again to stop
  // picking it out, and set 1 becomes 77 mm instead. The legend names the part the fields describe, so
  // leaving it aimed is visible rather than hidden.
  const pick = (id: string) => {
    const next = selectedId === id ? null : id;
    setSelectedId(next);
    if (next) onSelectPart?.(next);
  };
  const activeId = hoveredId ?? selectedId;
  const active = parts.find((p) => p.component.id === activeId);
  // Judged on the model being flown, which is the one this panel draws, so a step the flyer just
  // opened by typing an exit diameter is stated by the same render that shows the new shape.
  const stepBehind = selectedId ? mouldLineStep(rocket, selectedId) : undefined;
  /** The picked-out part where it is an AUTHORED coupler or centring ring — the only two kinds a
   *  catalogue pick can be recorded against — together with the outer diameter the part is being
   *  flown at. Null on everything else, which is what gates the picker below.
   *
   *  The diameter is read off the BUILT component rather than off the entry, because the entry
   *  states no diameter at all: `buildAdded` derives it from the host's bore, or takes the pick's
   *  own where one is set. So this is the figure a flyer is looking at, and it is the one the fit
   *  filter has to open on. */
  const pickEntry = selectedId ? (added ?? []).find((a) => a.id === selectedId) : undefined;
  const pickTarget =
    pickEntry && (pickEntry.kind === "tubecoupler" || pickEntry.kind === "centeringring")
      ? {
          entry: pickEntry,
          // **The HOST TUBE'S BORE, which is the caliber these two parts have to match — read off the
          // host rather than off the part itself.** Reading the built part's own outer diameter is
          // what `buildAdded` derives it FROM when nothing is picked, so the two agree until a pick
          // lands and then diverge: after picking a 54.5 mm coupler the label read "Only couplers
          // that fit this tube's bore (54.5 mm)" over a 51.0 mm bore, and ticking the box then
          // filtered the catalogue to parts matching the last pick instead of matching the tube. A
          // wrong number under a label that names the right dimension.
          //
          // It is also what keeps the figure available when the part is NOT in the tree: a pick left
          // out for being too long has no built component to read, and an undefined caliber HIDES
          // the fit checkbox while the filter behind it stays latched — "0 of 236 catalogued
          // couplers" with no control on screen to clear it.
          outerDiameter: (() => {
            const h = parts.find((x) => x.component.id === pickEntry.after)?.component;
            if (!h || !("outerRadius" in h) || !(h.outerRadius > 0)) return undefined;
            // The same expression the applier sizes a derived coupler with: a tube that states no
            // wall has no inner radius to speak of, so its own outer radius is the honest fallback
            // rather than an invented wall.
            const wall = "thickness" in h && h.thickness !== undefined && h.thickness > 0 ? h.thickness : 0;
            const bore = (h.outerRadius - wall) * 2;
            return bore > 0 ? bore : undefined;
          })(),
          // The host's own length, which is the longest part that can go inside it. `buildAdded`
          // REFUSES a pick longer than this rather than cutting it down — a vendor's part number on
          // a shortened part is a wrong number under a real name — and `applyAdds` then skips the
          // entry, so a picker that offered one would delete the flyer's part on a tap. Read off the
          // host as it is being flown, so a tube the flyer has just shortened bounds the list
          // immediately.
          hostLength: (() => {
            const h = parts.find((x) => x.component.id === pickEntry.after)?.component;
            const l = h && "length" in h ? h.length : undefined;
            return l !== undefined && l > 0 ? l : undefined;
          })(),
        }
      : null;
  /** Whether the pick is set but NOT being flown — it is longer than the tube it goes in, so
   *  `fitAddedInternalParts` left it out rather than shortening a part that carries a vendor's part
   *  number. Derived once and read by both the notice and the picker's own caption, because those
   *  two sit one line apart and a flyer reading "not in the flight" above "Flying …" is being told
   *  two things about one part. The comparison is the model's own, on the same two numbers. */
  const pickDropped =
    !!pickTarget?.entry.pick &&
    pickTarget.hostLength !== undefined &&
    pickTarget.entry.pick.length > pickTarget.hostLength;

  // A part's host, by the host's OWN name, so "in Payload coupler" and the row reading "Payload
  // coupler" are the same string. Undefined where the design never named the host — see the prop's
  // docblock: the kind fallback said "in Body tube" on every nested row of an unnamed design, which
  // adds nothing the indent does not, and is ambiguous where there are three of them.
  // **One Map, built once — not an O(n) `find` called three times per row on every render.** The
  // first version was exactly that, and `hoveredId` changes on every pointer move across the diagram
  // while the collapsed `<details>` keeps all rows mounted: on a 569-part design that is hundreds of
  // thousands of id comparisons per mousemove, for a string that never changes between them.
  const byId = new Map(parts.map((q) => [q.component.id, q.component] as const));
  /** The host's own NAME, or undefined where the design never gave it one — for the screen. */
  const hostName = (id: string): string | undefined => byId.get(id)?.name || undefined;
  /** The same, falling back to the kind — for the CSV, which has no indent to lean on. */
  const hostLabel = (id: string): string | undefined => {
    const c = byId.get(id);
    return c ? c.name || KIND_LABEL[c.kind] || c.kind : undefined;
  };

  // The table's rows in the chosen order. Sorting is stable against the design order, so parts that
  // tie on a column still read nose-to-tail rather than shuffling.
  const rows = parts.map((p, i) => ({ p, i }));
  if (sort !== "design") {
    const key = (r: { p: (typeof parts)[number] }) => {
      switch (sort) {
        case "name":
          return (r.p.component.name || kindLabel(r.p.component)).toLowerCase();
        case "type":
          return kindLabel(r.p.component).toLowerCase();
        case "station":
          return r.p.xFore;
        case "mass":
          return -(masses.get(r.p.component.id)?.mass ?? 0); // heaviest first
      }
    };
    rows.sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (ka === kb) return a.i - b.i;
      return ka < kb ? -1 : 1;
    });
  }

  /** Which mass marks this design actually shows, so the caption's key names only those. A legend for
   *  a mark nobody can see is noise on every design that computes all of its own masses. */
  const massMarksShown = [
    ...new Set(
      parts
        .filter((p) => !masses.get(p.component.id)?.subsumedBy && masses.has(p.component.id))
        .map((p) => (p.component as { massFrom?: MassProvenance }).massFrom)
        .filter((f): f is MassProvenance => f !== undefined),
    ),
  ];

  /** A part's own dry mass as the table shows it: a figure, or where its mass is counted instead. */
  const massCell = (id: string): { text: string; muted: boolean } => {
    const m = masses.get(id);
    if (!m) return { text: "—", muted: true }; // carries no structural mass of its own
    if (m.subsumedBy) return { text: `in ${m.subsumedBy}`, muted: true };
    return { text: d.q(d.mass(m.mass, units)), muted: false };
  };

  /** The section's own heading row, shared by the empty state and the full surface.
   *
   *  Extracted when the empty state landed, rather than copied into it. The alternative — a second
   *  `Card`/`h3` pair spelled out in the early return — is precisely the "just this once" that
   *  `DESIGN.md` §9's card-treatment count exists to measure, and it would have read as a twelfth
   *  variant of a treatment the system already owns. */
  const heading = (
    <div className="flex items-center justify-between px-4 py-3">
      <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Design geometry
        {edited && (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
            with your edits
          </span>
        )}
      </h3>
    </div>
  );

  // **A design with no components says so under its own heading.** `DESIGN.md` §5: a data surface
  // without an empty state is not finished, and this one used to `return null` — taking the whole
  // "Design geometry" section, the drawing and the parts table off `/design` at once, with nothing
  // left to say a design had been loaded at all.
  //
  // **Not reachable through the editor, and the first version of this comment said it was.** The
  // claim was that R2's deletions could empty a design; `removalRefusal` (`lib/model/edit.ts`)
  // refuses the removal that leaves a stage with no body tube, and `newDesign()` starts with one.
  // What can still produce it is a file that parses into no components at all. The branch stays —
  // §5's rule is about what the surface does when it has nothing, not about how often that happens —
  // but the honest record is that this is defensive rather than a hole a flyer was falling into.
  //
  // The copy names IMPORT and nothing else on purpose. Every add-part control on this surface hangs
  // off `selectedId`, and with no parts there is nothing to select, so an empty state saying "add a
  // nose cone" would name an action that is not on the page — the dead end `EmptyState`'s own
  // docblock says to omit rather than invent.
  if (parts.length === 0)
    return (
      <Card as="section" pad={false}>
        {heading}
        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <EmptyState what="No components were read from this design, so there is nothing to measure. Import a design file that carries an airframe and every part appears here with its dimensions and mass." />
        </div>
      </Card>
    );

  return (
    <Card as="section" pad={false}>
      {heading}
      <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
        {/* The design at a glance — always shown, so you see your rocket without hunting for it. */}
        <RocketDiagram
          rocket={rocket}
          units={units}
          cg={cg}
          cp={cp}
          marginCal={marginCal}
          highlightId={activeId}
          onHover={setHoveredId}
          onSelect={(id) => {
            pick(id);
            setPartsOpen(true);
          }}
          motors={motors}
          onEdit={onEdit}
          onMoveTo={onMoveTo}
          moveSlotsFor={moveSlotsFor}
          selectedFinSetId={aims?.finSetId}
          selectedBodyTubeId={aims?.bodyTubeId}
          selectedMassObjectId={aims?.massObjectId}
        />
        {/* What you just pointed at. Reserved height so hovering across the airframe doesn't make
            everything below it jump. */}
        <p className="mt-1 min-h-6 text-sm text-zinc-600 dark:text-zinc-300" aria-live="polite">
          {active ? (
            <>
              <span className="font-medium text-zinc-800 dark:text-zinc-100">
                {active.component.name || KIND_LABEL[active.component.kind] || active.component.kind}
              </span>{" "}
              <span className="text-zinc-500 dark:text-zinc-400">
                {/* Most designs name a part after what it is; repeating "Body tube · Body tube"
                    is noise, so the type only appears when it adds something. */}
                {kindLabel(active.component) !== (active.component.name || "")
                  ? `· ${kindLabel(active.component)} `
                  : ""}
                · at {d.q(d.lengthMm(active.xFore, units))} from the nose
              </span>{" "}
              <span className="font-mono">{describeDims(active.component, units)}</span>{" "}
              {/* **The mass, and where it came from — this line had the figure and not the source.**
                  It is the ONLY mass readout on screen while the `Parts` disclosure is closed, which
                  is its default and the state a phone lands in: on `demo-rocksim.rkt` it read
                  "Nose cone · … · 118.50 g" with no marker and no key anywhere, while the same part
                  inside the disclosure read "computed by the source tool". `DESIGN.md` §6 requires a
                  reference value to name its source, and one surface honouring that while its
                  neighbour does not is the drift the provenance work exists to stop.

                  Spelled out in WORDS here rather than borrowing the table's †/‡/§ marks. A mark
                  needs a key, the table's key is its caption, and this line is outside the table —
                  a dagger with no legend within reach says less than nothing. Silent for a mass
                  Loft computed itself, which is the ordinary case and the one that needs no claim. */}
              <span className="text-zinc-500 dark:text-zinc-400">
                · {massCell(active.component.id).text}
                {massSource(active.component) && !masses.get(active.component.id)?.subsumedBy
                  ? ` · ${massSource(active.component)!.label}`
                  : ""}
              </span>
            </>
          ) : (
            <span className="text-zinc-500 dark:text-zinc-400">
              Point at a part of the airframe to identify it; click one to keep it picked out.
            </span>
          )}
        </p>
        {/* Removing the part that is picked. It sits with the line that names the part rather than in the
            editor below, because "this one, gone" is a statement about the thing you are pointing at —
            and it is the only destructive control on this panel, so it stays where its subject is
            visible. A refusal replaces it with the reason. */}
        {/* **The property surface for the picked part, and the point of the whole selection.** It sits
            at the head of the picked-part controls — above the removal, the reorder and the authoring
            — because "what is this part" comes before "do something to it", and because it is the one
            of them a flyer reaches for repeatedly rather than once.

            It is a popover rather than a jump to the wall of fields below (`ON-5`, `ON-7`): the fields
            are the same fields, aimed at this component by id, but they arrive WHERE the flyer is
            looking instead of a screen away, and they arrive without the twenty-odd fields describing
            other parts. Nothing is removed from the wall — the sequencing `ON-4` set is that a
            replacement proves itself before anything it replaces goes away.

            A part no field describes — a coupler, a launch lug, a bulkhead — returns null and gets no
            control, rather than a button that opens an empty surface. */}
        {selectedId && (() => {
          const props = propertiesFor?.(selectedId);
          if (!props) return null;
          // A `<div>`, not a `<p>`: the open panel is a `Card` full of fieldsets and headings, and
          // block content inside a paragraph is invalid nesting the browser silently repairs by
          // closing the `<p>` early — which would move the panel out of the wrapper the outside-press
          // handler measures against.
          return (
            <div className="mt-2">
              {/* No `aria-label` on the trigger: it shows words, and an `aria-label` REPLACES them
                  in the accessible name (§5, WCAG 2.5.3 *Label in Name*) — a button reading
                  "Properties" named "Edit the properties of the main parachute" stops answering to
                  voice control. The panel's own name carries which part, which is where a screen
                  reader hears it anyway, and there is only ever one of these on screen because there
                  is only ever one picked part. */}
              <Popover
                trigger="Properties"
                title={props.title}
                what={`the properties of ${props.label}`}
              >
                {props.body}
              </Popover>
            </div>
          );
        })()}
        {onRemove && selectedId && (
          <p className="mt-1 text-sm">
            {refuseRemoval?.(selectedId) ? (
              <span className="text-amber-700 dark:text-amber-400" role="status">
                {refuseRemoval(selectedId)}
              </span>
            ) : (
              <Button
                variant="danger"
                onClick={() => onRemove(selectedId)}
                aria-label={`Remove ${parts.find((x) => x.component.id === selectedId)?.component.name || KIND_LABEL[parts.find((x) => x.component.id === selectedId)?.component.kind ?? ""] || "this part"} from the design and re-fly it`}
              >
                Remove{" "}
                {parts.find((x) => x.component.id === selectedId)?.component.name ||
                  KIND_LABEL[parts.find((x) => x.component.id === selectedId)?.component.kind ?? ""] ||
                  "this part"}
              </Button>
            )}
          </p>
        )}
        {/* Reordering, beside the deletion and the authoring — the third structural act, on the part it
            acts on. Each button is left out rather than disabled when there is nowhere to go: at the
            ends of a stage there is no next slot, because a move never crosses a stage boundary (that
            would be a different separation event, not a restack). */}
        {onMove && selectedId && (canMove?.(selectedId, -1) || canMove?.(selectedId, 1)) && (
          <p className="mt-1 flex flex-wrap items-center gap-2">
            {canMove?.(selectedId, -1) && (
              <Button
                onClick={() => onMove(selectedId, -1)}
                aria-label="Move toward the nose — one place, and re-fly the design"
              >
                {/* `aria-hidden` like every other glyph in this file. Left visible it was part of the
                    accessible name, so the `aria-label` beside it — which does not carry an arrow —
                    would not have contained the visible label. That is the WCAG 2.5.3 failure this
                    conversion was redone to avoid, hiding in the two controls nobody re-read. */}
                <span aria-hidden>←</span> Move toward the nose
              </Button>
            )}
            {canMove?.(selectedId, 1) && (
              <Button
                onClick={() => onMove(selectedId, 1)}
                aria-label="Move toward the tail — one place, and re-fly the design"
              >
                Move toward the tail <span aria-hidden>→</span>
              </Button>
            )}
          </p>
        )}
        {/* Authoring, beside the deletion: the two structural acts sit together, on the part they are
            about. "Add a tube behind this" rather than an Add ▾ menu, because the gesture is "another
            one of these, here" — the part it goes behind is the one on screen, the new part inherits
            its caliber, wall, material and finish, and the editor's fields re-aim at it the moment it
            exists. The numbers are the confirmation, not the gesture. */}
        {onAddAfter && selectedId && parts.find((x) => x.component.id === selectedId)?.component.kind === "bodytube" && (
          <p className="mt-1 text-sm">
            <Button
              onClick={() => onAddAfter(selectedId)}
              aria-label="Add a tube behind this — a body tube faired to it, and re-fly the design"
            >
              <span aria-hidden>+</span> Add a tube behind this
            </Button>
            {/* Only where there is a set to copy — the new ring is cloned from the design's own rather
                than derived from invented proportions, so a design with no fins has no source and the
                control is not offered. All 35 corpus designs carry one, and so does the starter. */}
            {parts.some((x) => x.component.kind === "trapezoidfinset") && (
              <Button
                className="ml-1.5"
                onClick={() => onAddAfter(selectedId, "trapezoidfinset")}
                aria-label="Add fins to this tube — matching the design's own fins, and re-fly it"
              >
                <span aria-hidden>+</span> Add fins to this tube
              </Button>
            )}
            {/* The part that changes caliber. Its exit is a fact about the design wherever the design
                supplies one — a part already sitting behind this at another caliber means the cone
                fairs exactly to it and CLOSES a step, which is what 17 of the 25 corpus transitions
                do. With nothing behind it, it is a tail cone, and the label says so rather than making
                the flyer find out by clicking. */}
            {/* The non-structural weight that decides where a rocket balances — an av-bay, a tracker,
                nose ballast. It mounts INSIDE the tube rather than behind it, so unlike the other three
                it needs a station, and the corpus supplies one: a third of the way down the part
                holding it, which is where a real bay sits. */}
            <Button
              className="ml-1.5"
              onClick={() => onAddAfter(selectedId, "masscomponent")}
              aria-label="Add a mass inside this — electronics, a tracker, ballast — and re-fly the design"
            >
              <span aria-hidden>+</span> Add a mass inside this
            </Button>
            <Button
              className="ml-1.5"
              onClick={() => onAddAfter(selectedId, "transition")}
              aria-label="Add a transition behind this — faired to what follows it, or contracting into a tail cone where nothing does, and re-fly the design"
            >
              <span aria-hidden>+</span> Add a transition behind this
            </Button>
            {/* The two INTERNAL parts, and they are the first authored kinds that touch no outer
                mould line at all: a coupler joins two tubes from inside, a centring ring holds a
                motor mount concentric. Neither changes the airframe the solver sees — they move dry
                mass and CG and nothing else — which is why they sit after the four that do.

                Both size themselves from the part they go into rather than asking, and the two sizes
                have nothing in common even though the model calls them the same shape: a coupler is a
                TUBE at the host's bore and 1.86 calibers long, a ring is a bored PLATE 3.18 mm thick.
                `internalPartDefaults` holds both figures and where in the corpus they come from. The
                alternative was a modal of number fields, which is what the roadmap says to resist.

                A coupler is cut down where the tube is shorter than 1.86 calibers — 3 of the 35
                corpus designs — because a part longer than its host does not overhang the back, it
                overhangs the FRONT into whatever is ahead of it. The label says "as long as the tube
                allows" rather than promising a length the tube cannot give. */}
            <Button
              className="ml-1.5"
              onClick={() => onAddAfter(selectedId, "tubecoupler")}
              aria-label="Add a coupler inside this — a tube at this one's bore, as long as the tube allows, and re-fly the design"
            >
              <span aria-hidden>+</span> Add a coupler inside this
            </Button>
            <Button
              className="ml-1.5"
              onClick={() => onAddAfter(selectedId, "centeringring")}
              aria-label="Add a centering ring inside this — a plate bored to the motor mount where this tube has one, or to a typical bore where it has none, and re-fly the design"
            >
              <span aria-hidden>+</span> Add a centering ring inside this
            </Button>
          </p>
        )}
        {/* Authoring by SELECTION for the two internal kinds, on the part it describes. It sits HERE
            rather than in the editor below with the other three pickers, and that placement is the
            whole reason this took a shape of its own: a body tube, a nose cone and a canopy exist on
            the design before anyone picks one, so their pickers belong beside the fields that edit
            them. A coupler and a centring ring do not exist until they are authored, so the only
            thing that can name WHICH one is being picked for is the part that is picked out — and
            that lives on this panel. The pick rides on the `AddedPart` entry for the same reason
            (see `PickedRing`).

            The caliber to open on is the part's OWN outer diameter — the host's bore, which is what
            `buildAdded` sized it to — not the airframe's. A coupler at the airframe's caliber does
            not go inside the airframe. */}
        {onPickPart && onClearPick && pickTarget && (
          <div className="mt-2">
            {/* **The one case where a pick stops being flown, said out loud.** A picked part is
                refused rather than cut down when its host is shorter than it (see the clamp in
                `applyDimensionEdits`), so shortening the tube under a coupler takes the coupler out
                of the design. The row simply disappearing from the parts table with a caption still
                reading "Flying Always Ready Rocketry TC_2.15_8" is a surface disagreeing with itself
                about what is being flown, and it is reachable in two keystrokes.
                `DESIGN.md` §6: a withheld value says why and how to get it back — here there are two
                ways back and both are named. */}
            {pickDropped && pickTarget.entry.pick && pickTarget.hostLength !== undefined && (
                <Card tone="warn" className="mb-2 text-sm" role="status">
                  <p>
                    <strong className="font-medium">
                      This {pickTarget.entry.kind === "tubecoupler" ? "coupler" : "centering ring"} is
                      not in the flight.
                    </strong>{" "}
                    {pickTarget.entry.pick.manufacturer} {pickTarget.entry.pick.partNumber} is{" "}
                    {d.q(d.lengthMm(pickTarget.entry.pick.length, units))} long and the part it goes
                    inside is now {d.q(d.lengthMm(pickTarget.hostLength, units))}. It is left out rather than
                    flown short, because a shortened part under a vendor&apos;s part number is not
                    that part. Lengthen the tube, or take the pick back below.
                  </p>
                </Card>
              )}
            <PartPicker
              kind={pickTarget.entry.kind === "tubecoupler" ? "tubecoupler" : "centeringring"}
              imperial={units === "imperial"}
              currentOuterDiameter={pickTarget.outerDiameter}
              maxLength={pickTarget.hostLength}
              picked={pickTarget.entry.pick}
              // These two have no editable dimension of their own, so nothing a flyer can type can
              // make the flown figures drift from the pick's — the part is either built at all four
              // of them or not built at all. So the one thing this flag can say for them is whether
              // the pick is IN THE FLIGHT, which is exactly what the notice above reports, read off
              // the same two lengths so the two lines cannot contradict each other.
              dimensionsMatch={!pickDropped}
              onPick={(p, material) => onPickPart(pickTarget.entry.id, p, material)}
              onClear={() => onClearPick(pickTarget.entry.id)}
            />
          </div>
        )}
        {/* A motor mount on a tube that has none. It sits with the other authoring acts and on the
            picked part, because a mount belongs to ONE tube — unlike a stage, which is the level
            above a component and is therefore not gated on a pick.
            Offered only where it can mean something: the part must be a tube without a mount, and the
            design must have a motor to put in it. A mount with nothing naming it is dead weight the
            solver never lights, and it would satisfy a `canAddStage` that only tests a mount EXISTS. */}
        {onAddMount && selectedId && canAddMountTo?.(selectedId) && (
          <p className="mt-1 text-sm">
            <Button
              onClick={() => onAddMount(selectedId)}
              aria-label="Add a motor mount to this tube — flying the design's own motor, and re-fly it"
            >
              <span aria-hidden>+</span> Add a motor mount to this tube
            </Button>
          </p>
        )}
        {/* Authored mounts, each takeable back. Named by the tube they are on, because that is the
            only name a mount has — it is a field, not a component, so it has no id of its own. */}
        {(mountAdds ?? []).length > 0 && (
          <Card tone="accent" className="mt-2 text-sm" role="note">
            <p>
              <strong className="font-medium">
                {(mountAdds ?? []).length === 1 ? "A motor mount you added" : `${(mountAdds ?? []).length} motor mounts you added`}
              </strong>{" "}
              — each flies this design&apos;s own motor, because a tube that never had a mount has no
              motor of its own to prefer, and a mount with nothing in it never lights. The flight above
              includes {(mountAdds ?? []).length === 1 ? "it" : "them"}. Pick a different motor for the
              whole design under <em>Motor</em>.
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {(mountAdds ?? []).map((m) => {
                const host = parts.find((x) => x.component.id === m.hostId)?.component;
                return (
                  <li key={m.hostId}>
                    <Button
                      variant="danger"
                      onClick={() => onRemoveMount?.(m.hostId)}
                      aria-label={`Remove the mount on ${host?.name || KIND_LABEL[host?.kind ?? ""] || "that tube"} — with the motor that came with it`}
                    >
                      <span aria-hidden>−</span> Remove the mount on{" "}
                      {host?.name || KIND_LABEL[host?.kind ?? ""] || "that tube"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        {/* Staging, beside the other structural acts and deliberately NOT gated on a picked part: a
            stage is the level above a component, so there is nothing to pick it on. A booster is
            appended below everything already in the stack — which is where a booster goes — and seeded
            from the design's own aft tube, its mount and its fins, so it is a booster of THIS rocket
            rather than a shape Loft chose. */}
        {/* The REMOVE controls are not gated on the add being available. Once `canAddStage` reads the
            tree the operation actually seeds from, an authored stage always leaves a mount to clone, so
            a design that HAS a booster can normally be given another — and this separation looks like
            belt and braces. It is not: the removals are rendered per BAG ENTRY, and an entry `buildStage`
            refuses builds no stage at all. A bag rehydrated from storage against a design whose aft tube
            has no mount is exactly that state, and inside the add's gate the entry becomes unreachable —
            a one-way door assembled out of a refusal. This cost a full e2e run to find when the gate was
            wrong, and it is the reason to keep the two apart now that it is right. */}
        {(onAddStage || (addedStages ?? []).length > 0) && (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            {onAddStage && (
              <Button onClick={onAddStage} aria-label="Add a booster stage — below the design, seeded from its own aft airframe, and re-fly it">
                <span aria-hidden>+</span> Add a booster stage
              </Button>
            )}
            {(addedStages ?? []).map((s) => (
              <Button
                key={s.seedId}
                variant="danger"
                onClick={() => onRemoveStage?.(s.seedId)}
                aria-label={`Remove ${s.name} — and re-fly the design without it`}
              >
                Remove {s.name}
              </Button>
            ))}
          </p>
        )}
        {/* Where the outer mould line STEPS behind the part you are holding, and by how much.
            Loft's drag model has a term for a transition's own slope — a shoulder's joint angle, a
            boattail's — and none at all for a bare radius step, which has no length to take an angle
            over. So a step is a real geometry Loft flies optimistically, and saying nothing about it
            is the shape of silence the brief forbids. It is not exotic and it is not something the
            editor invents: measured across the 35-design corpus, 33 of the 115 joints this can judge
            already step, in 13 of the 35 designs, by a median 11.75 mm of diameter and up to 82.55 mm.
            OpenRocket warns on exactly this; Loft has never said a word. */}
        {selectedId && stepBehind !== undefined && Math.abs(stepBehind) > STEP_NOTICE_M && (
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-400" role="status">
            The airframe steps {stepBehind > 0 ? "out" : "in"} by {d.q(d.lengthMm(Math.abs(stepBehind), units))}{" "}
            of diameter at the joint behind this part. Loft models a transition&apos;s own slope but has
            no drag term for a bare step, so the drag here is read optimistically.
          </p>
        )}
        {/* Said BEFORE the click, where the flyer is deciding, rather than left to be inferred from a
            total that did not move. A design can state a measured weight for a whole assembly, and a
            part inside it then weighs nothing of its own — so this removal moves the balance and not
            the mass. The model is right to hold the stated figure; what was missing is the sentence.
            Measured on `EscapeVelocity.ork`: removing its 141.7 g "Avionics" leaves dry mass at exactly
            2000.0 g while the static margin moves 4.461 → 4.312 cal. */}
        {selectedId && statedMassHolder(rocket, selectedId) && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400" role="status">
            This design states {statedMassHolder(rocket, selectedId)}&apos;s weight as a whole, so it
            counts no mass for the parts inside — adding a part here, or removing one, moves the balance
            and not the total.
          </p>
        )}
        {/* Placed directly under the diagram, because that is where the absence is visible: the CG
            mark, its legend swatch and the margin in the caption all stop being drawn together. §6
            requires a withheld value to say why and what would bring it back, and the alternative
            here is worse than a blank — before this the marks were drawn anyway, at the DRY station,
            and the caption asserted a margin the summary strip was withholding two panels up. */}
        {cgWithheldReason && cg === undefined && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{cgWithheldReason}</p>
        )}
        {onEdit && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Grab a handle to reshape the design right on the picture — slide the fin group fore or aft,
            pull a fin tip up to resize the span, pull the body wall out to resize the caliber, drag the
            tube&apos;s aft edge to lengthen it, drag the nose/body joint to lengthen or blunt the nose,
            or (on straight-edged fins) rake the tip or resize the root and tip chords by their corner
            handles. The design re-flies live, so the{" "}
            {/* The margin promise is conditional on there BEING a margin. This paragraph and the
                withheld-value sentence above are adjacent siblings — `onEdit` is always supplied —
                so an unconditional "the margin updates as you drag" told the flyer, one sentence
                after being told the margin cannot be marked, that it would update live if they
                dragged. The reassuring sentence is the one that would have survived unedited. */}
            {marginCal !== undefined
              ? "margin updates as you drag"
              : "picture and the mass update as you drag"}
            ; arrow keys nudge a focused handle a hundredth of its range, and
            Shift makes that ten times bigger.
          </p>
        )}
        {/* The part-by-part detail is opt-in — hover/focus a row and it lights up on the diagram. */}
        <details
          className="group mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800"
          open={partsOpen}
          onToggle={(e) => setPartsOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className={`flex cursor-pointer select-none items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 ${TOUCH_TARGET}`}>
            <span className="text-zinc-400 transition group-open:rotate-180">▾</span>
            Parts · {parts.length}
          </summary>
          <DataTable
            className="mt-2"
            columns={PART_COLUMNS(units, masses, massCell, sort === "design", hostName, hostLabel)}
            rows={rows}
            rowKey={({ p }, i) => `${p.component.id}-${i}`}
            caption="Every part the importer read, with its station and mass"
            exportName={rocket.name || "design"}
            exportSuffix="parts"
            // The sort is CONTROLLED because this table has a third state the primitive's own
            // asc/desc cycle cannot hold: clicking the active column a second time returns to the
            // DESIGN's own nose-to-tail order — the order a flyer reads their own rocket in — rather
            // than reversing. `null` is that order, and it is why a `persistKey` on the primitive
            // would not have worked here.
            sort={sort === "design" ? null : { key: sort, dir: sort === "mass" ? -1 : 1 }}
            onSortChange={(next) => setSort(next === null || next.key === sort ? "design" : (next.key as PartSort))}
            // Seven things on the `<tr>`, none of them a styling choice: the row is the pick target,
            // it links the diagram on hover AND on focus, and it has a keyboard path. `aria-selected`
            // is rendered on EVERY row rather than only the picked one — present-and-false is what
            // tells a screen-reader user the row is selectABLE.
            rowProps={({ p }) => ({
              tabIndex: 0,
              onMouseEnter: () => setHoveredId(p.component.id),
              onMouseLeave: () => setHoveredId(null),
              onFocus: () => setHoveredId(p.component.id),
              onBlur: () => setHoveredId(null),
              onClick: () => pick(p.component.id),
              onKeyDown: (e: React.KeyboardEvent<HTMLTableRowElement>) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  pick(p.component.id);
                }
              },
              // A focusable row with no name is an anonymous stop for anyone arriving by keyboard;
              // say which part it is and what pressing it does.
              "aria-label": `${p.component.name || KIND_LABEL[p.component.kind] || p.component.kind} — ${
                selectedId === p.component.id ? "picked out on the diagram, press to release" : "press to pick out on the diagram"
              }`,
              "aria-selected": selectedId === p.component.id,
              className: `cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 ${
                activeId === p.component.id ? "bg-indigo-50 dark:bg-indigo-500/10" : ""
              } ${selectedId === p.component.id ? "ring-1 ring-inset ring-indigo-300 dark:ring-indigo-500/40" : ""}`,
            })}
            // Unreachable inside the `parts.length === 0` guard above, which returns null before this
            // renders — but §5 makes `empty` required precisely so the next call site cannot skip it,
            // and "No data" is forbidden. This says what would fill it.
            empty="No parts were read from this design — import a file, or add a component to the airframe."
          />
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {edited ? (
            <>
              The design <strong>with your active what-if edits applied</strong> — the picture, the
              CG/CP, and the flight above all reflect the same edited rocket. Clear the edits to see
              the design as imported.
            </>
          ) : (
            <>
              The component tree exactly as Loft parsed it, each part&apos;s station measured from the
              nose tip — a quick way to confirm the import matches your design.
            </>
          )}{" "}
          A row and its shape on the diagram light up together, and clicking either keeps that part
          picked out — so you can find a part on the picture and read what it is, or the other way
          round. Diameters are shown as <span className="font-mono">⌀</span>; a fin set lists its
          per-fin chords and span.{" "}
          {/* **The key to the mass marks, in the caption rather than in a hover.** §8 forbids a state
              a flyer can only reach by hovering, and the `title` on each mark is a bonus for a mouse
              rather than the way the marks are read. Rendered only when a mark is on screen: a legend
              for something that is not there is noise on every design that computes all its own
              masses. */}
          {massMarksShown.length > 0 && (
            <>
              {/* **Each half is guarded on its own mark.** A first version guarded only the ‡ clause,
                  so a design carrying nothing but ‡ printed a key for a † that appears nowhere — the
                  exact noise the control case says this conditional exists to prevent, reintroduced
                  inside it. `rocksimTestRocket1.rkt` is that design: six parts, all ‡. */}
              {massMarksShown.includes("stated") && (
                <>
                  A <strong>†</strong> beside a mass means the design file states that figure rather
                  than Loft deriving it from the part&apos;s geometry and material
                  {massMarksShown.includes("tool") ? "" : ". "}
                </>
              )}
              {massMarksShown.includes("tool") && (
                <>
                  {massMarksShown.includes("stated") ? ", and a " : "A "}
                  <strong>‡</strong> means the mass is the source tool&apos;s own computed figure,
                  carried through rather than recomputed here.{" "}
                </>
              )}
              An unmarked mass is Loft&apos;s own.{" "}
            </>
          )} Any column heading sorts the table; the design&apos;s own
          nose-to-tail order is the default. The mass column is dry structure only; this design&apos;s
          dry mass is {d.q(d.mass(dryTotal, units))}; the motor and any what-if ballast are added on
          top of it at launch and are in the flight&apos;s liftoff mass — where a motor was
          matched — not in this column or in the{" "}
          <em>Mass &amp; balance</em>{" "}panel, which breaks the same dry figure down part by part.
          {unlisted > 1e-6 && (
            <>
              {" "}
              Of that, {d.q(d.mass(unlisted, units))} is stated in the design as a whole-stage figure
              rather than part by part, so it belongs to no row here — the{" "}
              <em>Mass &amp; balance</em>{" "}
              panel lists it under the stage&apos;s own name.
            </>
          )}
        </p>
        </details>
      </div>
    </Card>
  );
}
