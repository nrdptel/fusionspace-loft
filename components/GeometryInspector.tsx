"use client";

import { useEffect, useRef, useState } from "react";
import type { Rocket, RocketComponent } from "@/lib/model/types";
import { flattenRocket } from "@/lib/model/geometry";
import { massByComponent, dryMassProperties, statedMassHolder } from "@/lib/sim/mass";
import type { MotorMark } from "@/lib/sim/setup";
import { STEP_NOTICE_M } from "@/lib/model/geometry";
import { mouldLineStep, type AddedPart, type AddedStage, type GeometryEdits, type MountAdd, type MoveSlot } from "@/lib/model/edit";
import { TOUCH_TARGET } from "@/lib/ui-tokens";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";
import RocketDiagram from "./RocketDiagram";
import DataTable, { type Column } from "./DataTable";
import { Button, Card } from "./ui";

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
): Column<PartRow>[] => [
  {
    key: "name",
    label: "Component",
    rowHeader: true,
    sortValue: ({ p }) => (p.component.name || kindLabel(p.component)).toLowerCase(),
    cell: ({ p }) => (
      <span className="font-sans text-zinc-700 dark:text-zinc-200">
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
      <span className="text-zinc-500 dark:text-zinc-400">
        {KIND_LABEL[p.component.kind] ?? p.component.kind}
      </span>
    ),
    csv: ({ p }) => KIND_LABEL[p.component.kind] ?? p.component.kind,
  },
  {
    key: "station",
    label: "Station",
    sortValue: ({ p }) => p.xFore,
    cell: ({ p }) => d.q(d.lengthMm(p.xFore, units)),
    csv: ({ p }) => Math.round(p.xFore * 1000 * 10) / 10,
  },
  {
    key: "mass",
    label: "Mass",
    sortDir: -1,
    sortValue: ({ p }) => masses.get(p.component.id)?.mass ?? 0,
    cell: ({ p }) => {
      const m = massCell(p.component.id);
      return (
        <span className={m.muted ? "font-sans text-zinc-500 dark:text-zinc-400" : undefined}>
          {m.text}
        </span>
      );
    },
    csv: ({ p }) => {
      const m = masses.get(p.component.id);
      // The screen says "in <assembly>" where a part's mass is counted elsewhere; the export says the
      // same thing rather than a 0 that would silently sum wrong in a spreadsheet.
      return !m ? "" : m.subsumedBy ? `in ${m.subsumedBy}` : Math.round(m.mass * 1e6) / 1e6;
    },
  },
  {
    key: "dims",
    label: "Dimensions",
    cell: ({ p }) => describeDims(p.component, units),
    csv: ({ p }) => describeDims(p.component, units),
  },
];

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

const KIND_LABEL: Record<string, string> = {
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

/** The authoring controls in the parts panel. One constant so a second one cannot arrive at a
 *  different height from the first. */

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
    case "innertube":
      return `L ${L(c.length)}, ${dia(c.outerRadius)}`;
    case "tubecoupler":
    case "centeringring":
    case "bulkhead":
    case "engineblock":
      return `L ${L(c.length)}, ${dia(c.outerRadius)}`;
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
}: {
  rocket: Rocket;
  units: UnitSystem;
  /** Loaded CG / CP stations (m from the nose tip) and static margin (cal), marked on the diagram
   *  — the same loaded values the results panel reports. Omitted for a design shown without a flight. */
  cg?: number;
  cp?: number;
  marginCal?: number;
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
  /** Every component id the edit model is currently aimed at, keyed by its aim slot. Passed back in so
   *  the pick shown here and the parts the fields describe cannot drift apart — a restored session
   *  arrives with an aim and no pick, and "Reset to as-designed" clears the aims without clearing the
   *  pick. Taken as the whole map rather than one prop per slot: the editor grows a slot per role, and
   *  a prop list that grows with it is a list to forget to extend. */
  aims?: Readonly<Record<string, string | undefined>>;
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

  /** A part's own dry mass as the table shows it: a figure, or where its mass is counted instead. */
  const massCell = (id: string): { text: string; muted: boolean } => {
    const m = masses.get(id);
    if (!m) return { text: "—", muted: true }; // carries no structural mass of its own
    if (m.subsumedBy) return { text: `in ${m.subsumedBy}`, muted: true };
    return { text: d.q(d.mass(m.mass, units)), muted: false };
  };

  if (parts.length === 0) return null;

  return (
    <Card as="section" pad={false}>
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
      <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
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
              <span className="text-zinc-500 dark:text-zinc-400">· {massCell(active.component.id).text}</span>
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
                title="Remove this part from the design and re-fly it"
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
                title="Move this part one place toward the nose and re-fly the design"
              >
                ← Move toward the nose
              </Button>
            )}
            {canMove?.(selectedId, 1) && (
              <Button
                onClick={() => onMove(selectedId, 1)}
                title="Move this part one place toward the tail and re-fly the design"
              >
                Move toward the tail →
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
              title="Add a body tube immediately behind this one, faired to it, and re-fly the design"
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
                title="Add a fin set to this tube, matching the design's own fins, and re-fly it"
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
              title="Add a mass object inside this tube — electronics, a tracker, ballast — and re-fly the design"
            >
              <span aria-hidden>+</span> Add a mass inside this
            </Button>
            <Button
              className="ml-1.5"
              onClick={() => onAddAfter(selectedId, "transition")}
              title="Add a transition behind this — faired to what follows it, or contracting into a tail cone where nothing does — and re-fly the design"
            >
              <span aria-hidden>+</span> Add a transition behind this
            </Button>
          </p>
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
              title="Give this tube a motor mount flying the design's own motor, and re-fly it"
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
                      title="Take this motor mount back off, with the motor that came with it"
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
              <Button onClick={onAddStage} title="Add a booster stage below the design, seeded from its own aft airframe, and re-fly it">
                <span aria-hidden>+</span> Add a booster stage
              </Button>
            )}
            {(addedStages ?? []).map((s) => (
              <Button
                key={s.seedId}
                variant="danger"
                onClick={() => onRemoveStage?.(s.seedId)}
                title={`Remove ${s.name} and re-fly the design without it`}
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
        {onEdit && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Grab a handle to reshape the design right on the picture — slide the fin group fore or aft,
            pull a fin tip up to resize the span, pull the body wall out to resize the caliber, drag the
            tube&apos;s aft edge to lengthen it, drag the nose/body joint to lengthen or blunt the nose,
            or (on straight-edged fins) rake the tip or resize the root and tip chords by their corner
            handles. The design re-flies live, so the
            margin updates as you drag; arrow keys nudge a focused handle a hundredth of its range, and
            Shift makes that ten times bigger.
          </p>
        )}
        {/* The part-by-part detail is opt-in — hover/focus a row and it lights up on the diagram. */}
        <details
          className="group mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800"
          open={partsOpen}
          onToggle={(e) => setPartsOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className={`flex cursor-pointer select-none items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 ${TOUCH_TARGET}`}>
            <span className="text-zinc-400 transition group-open:rotate-180">▾</span>
            Parts · {parts.length}
          </summary>
          <DataTable
            className="mt-2"
            columns={PART_COLUMNS(units, masses, massCell)}
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
          per-fin chords and span. Any column heading sorts the table; the design&apos;s own
          nose-to-tail order is the default. The mass column is dry structure only; this design&apos;s
          dry mass is {d.q(d.mass(dryTotal, units))}; the motor and any what-if ballast are added on
          top of it at launch and are in the flight&apos;s liftoff mass, not in this column or in the{" "}
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
