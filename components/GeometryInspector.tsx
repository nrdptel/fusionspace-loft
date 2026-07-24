"use client";

import { useState } from "react";
import type { Rocket, RocketComponent } from "@/lib/model/types";
import { flattenRocket } from "@/lib/model/geometry";
import type { MotorMark } from "@/lib/sim/setup";
import type { GeometryEdits } from "@/lib/model/edit";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";
import RocketDiagram from "./RocketDiagram";

/** Design geometry: a to-scale side-view of the airframe, above the parsed component tree with each
 *  part's key dimensions and its station — the "did Loft read my rocket right?" view. Pure
 *  transparency into what the importer produced (the same components the simulator flies), the
 *  geometry counterpart of the mass & balance breakdown. The picture reads at a glance; the table is
 *  the exact detail. Read-only for now; both are the surface a from-scratch builder/editor grows
 *  direct manipulation on top of. */

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
  const [hoveredId, setHoveredId] = useState<string | null>(null);
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
          highlightId={hoveredId}
          onHover={setHoveredId}
          motors={motors}
          onEdit={onEdit}
        />
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
        <details className="group mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <summary className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
            <span className="text-zinc-400 transition group-open:rotate-180">▾</span>
            Parts · {parts.length}
          </summary>
          <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <th className="py-1 pr-4 font-medium">Component</th>
                <th className="py-1 pr-4 font-medium">Type</th>
                <th className="py-1 pr-4 font-medium">Station</th>
                <th className="py-1 font-medium">Dimensions</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {parts.map((p, i) => (
                <tr
                  key={`${p.component.id}-${i}`}
                  tabIndex={0}
                  onMouseEnter={() => setHoveredId(p.component.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(p.component.id)}
                  onBlur={() => setHoveredId(null)}
                  className={`border-t border-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 dark:border-zinc-800 ${
                    hoveredId === p.component.id ? "bg-indigo-50 dark:bg-indigo-500/10" : ""
                  }`}
                >
                  <th scope="row" className="py-1.5 pr-4 text-left font-sans font-normal text-zinc-700 dark:text-zinc-200">
                    {p.component.name || KIND_LABEL[p.component.kind] || p.component.kind}
                  </th>
                  <td className="py-1.5 pr-4 text-zinc-500 dark:text-zinc-400">
                    {KIND_LABEL[p.component.kind] ?? p.component.kind}
                  </td>
                  <td className="py-1.5 pr-4 text-zinc-800 dark:text-zinc-100">{d.q(d.lengthMm(p.xFore, units))}</td>
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
          Hover a part to pick it out on the diagram. Diameters are shown as{" "}
          <span className="font-mono">⌀</span>; a fin set lists its per-fin chords and span. Masses
          are in the <em>Mass &amp; balance</em> panel.
        </p>
        </details>
      </div>
    </section>
  );
}
