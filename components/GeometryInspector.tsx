"use client";

import { useState } from "react";
import type { Rocket, RocketComponent } from "@/lib/model/types";
import { flattenRocket } from "@/lib/model/geometry";
import { massByComponent } from "@/lib/sim/mass";
import type { MotorMark } from "@/lib/sim/setup";
import type { GeometryEdits } from "@/lib/model/edit";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";
import RocketDiagram from "./RocketDiagram";

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

/** A sortable column heading. Clicking it sorts by that column; clicking the active one returns to
 *  the design's own nose-to-tail order, so there is always a way back to how the rocket is built. */
function SortHeader({
  col,
  sort,
  onSort,
  children,
}: {
  col: Exclude<PartSort, "design">;
  sort: PartSort;
  onSort: (s: PartSort) => void;
  children: React.ReactNode;
}) {
  const active = sort === col;
  return (
    <th className="py-1 pr-4 font-medium" aria-sort={active ? (col === "mass" ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(active ? "design" : col)}
        title={active ? "Back to the design's own order" : `Sort by ${col}`}
        className="inline-flex items-center gap-1 uppercase tracking-wide outline-none hover:text-zinc-700 focus-visible:ring-2 focus-visible:ring-indigo-400 dark:hover:text-zinc-200"
      >
        {children}
        <span aria-hidden className={active ? "text-indigo-500" : "text-transparent"}>
          {col === "mass" ? "▾" : "▴"}
        </span>
      </button>
    </th>
  );
}

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
}) {
  const parts = flattenRocket(rocket);
  // Each part's own dry mass, keyed by the same component id the diagram and the table share, so a
  // part can be pointed at on the picture and read with its weight beside its dimensions. Structure
  // only — the motor is layered on at launch and lives in the mass & balance panel.
  const masses = massByComponent(rocket);
  const dryTotal = [...masses.values()].reduce((a, m) => a + m.mass, 0);
  // Hover previews, a click picks. Picking has to stick: the pointer must leave a shape before you
  // can read anything about it, so a hover-only link meant clicking a part on the diagram told you
  // nothing — the one place it said what the part was sat behind a closed disclosure.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [partsOpen, setPartsOpen] = useState(false);
  const [sort, setSort] = useState<PartSort>("design");
  const activeId = hoveredId ?? selectedId;
  const active = parts.find((p) => p.component.id === activeId);

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
    <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Design geometry
          {edited && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
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
            setSelectedId((cur) => (cur === id ? null : id));
            setPartsOpen(true);
          }}
          motors={motors}
          onEdit={onEdit}
        />
        {/* What you just pointed at. Reserved height so hovering across the airframe doesn't make
            everything below it jump. */}
        <p className="mt-1 min-h-6 text-xs text-zinc-600 dark:text-zinc-300" aria-live="polite">
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
        {onEdit && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Grab a handle to reshape the design right on the picture — slide the fin group fore or aft,
            pull a fin tip up to resize the span, pull the body wall out to resize the caliber, or (on
            straight-edged fins) rake the tip or resize the root and tip chords by their corner
            handles. The design re-flies live, so the margin updates as you drag; arrow keys nudge a
            focused handle too.
          </p>
        )}
        {/* The part-by-part detail is opt-in — hover/focus a row and it lights up on the diagram. */}
        <details
          className="group mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800"
          open={partsOpen}
          onToggle={(e) => setPartsOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
            <span className="text-zinc-400 transition group-open:rotate-180">▾</span>
            Parts · {parts.length}
          </summary>
          <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <SortHeader col="name" sort={sort} onSort={setSort}>Component</SortHeader>
                <SortHeader col="type" sort={sort} onSort={setSort}>Type</SortHeader>
                <SortHeader col="station" sort={sort} onSort={setSort}>Station</SortHeader>
                <SortHeader col="mass" sort={sort} onSort={setSort}>Mass</SortHeader>
                <th className="py-1 font-medium">Dimensions</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {rows.map(({ p, i }) => (
                <tr
                  key={`${p.component.id}-${i}`}
                  tabIndex={0}
                  onMouseEnter={() => setHoveredId(p.component.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(p.component.id)}
                  onBlur={() => setHoveredId(null)}
                  onClick={() => setSelectedId((cur) => (cur === p.component.id ? null : p.component.id))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId((cur) => (cur === p.component.id ? null : p.component.id));
                    }
                  }}
                  aria-selected={selectedId === p.component.id}
                  className={`cursor-pointer border-t border-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 dark:border-zinc-800 ${
                    activeId === p.component.id ? "bg-indigo-50 dark:bg-indigo-500/10" : ""
                  } ${selectedId === p.component.id ? "ring-1 ring-inset ring-indigo-300 dark:ring-indigo-500/40" : ""}`}
                >
                  <th scope="row" className="py-1.5 pr-4 text-left font-sans font-normal text-zinc-700 dark:text-zinc-200">
                    {p.component.name || KIND_LABEL[p.component.kind] || p.component.kind}
                  </th>
                  <td className="py-1.5 pr-4 text-zinc-500 dark:text-zinc-400">
                    {KIND_LABEL[p.component.kind] ?? p.component.kind}
                  </td>
                  <td className="py-1.5 pr-4 text-zinc-800 dark:text-zinc-100">{d.q(d.lengthMm(p.xFore, units))}</td>
                  <td
                    className={`py-1.5 pr-4 ${
                      massCell(p.component.id).muted
                        ? "font-sans text-xs text-zinc-500 dark:text-zinc-400"
                        : "text-zinc-800 dark:text-zinc-100"
                    }`}
                  >
                    {massCell(p.component.id).text}
                  </td>
                  <td className="py-1.5 text-zinc-800 dark:text-zinc-100">{describeDims(p.component, units)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
          nose-to-tail order is the default. The mass column is dry structure only — it adds up to{" "}
          {d.q(d.mass(dryTotal, units))}, with the motor and any what-if ballast layered on at launch
          in the <em>Mass &amp; balance</em> panel.
        </p>
        </details>
      </div>
    </section>
  );
}
