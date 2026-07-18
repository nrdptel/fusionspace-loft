"use client";

import type { Rocket } from "@/lib/model/types";
import { structurePointMasses, combine } from "@/lib/sim/mass";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";

/** Mass & balance breakdown: where the design's dry structural mass comes from, part by part, and
 *  how it balances. Pure transparency into what Loft parsed — the same per-component point masses the
 *  simulator flies — so a flyer can sanity-check an import (a mistyped wall thickness or a missing
 *  override shows up as a wrong row) and see the dry centre of gravity. Structure only: the motor and
 *  any active what-if add their mass at launch and aren't shown here. Read-only for now; it's also
 *  the component-level view a from-scratch builder will edit. */
export default function MassBreakdown({ rocket, units }: { rocket: Rocket; units: UnitSystem }) {
  const points = structurePointMasses(rocket);
  if (points.length === 0) return null;
  const total = combine(points);
  // Heaviest first — the parts that dominate the dry mass lead.
  const rows = [...points].sort((a, b) => b.mass - a.mass);

  return (
    <details className="group rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40">
      <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        <span>
          Mass &amp; balance · dry {d.q(d.mass(total.mass, units))}
        </span>
        <span className="text-xs text-zinc-400 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <th className="py-1 pr-4 font-medium">Component</th>
                <th className="py-1 pr-4 font-medium">Mass</th>
                <th className="py-1 pr-4 font-medium">% dry</th>
                <th className="py-1 font-medium">CG from nose</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {rows.map((p, i) => (
                <tr key={`${p.source}-${i}`} className="border-t border-zinc-100 dark:border-zinc-800">
                  <th scope="row" className="py-1.5 pr-4 text-left font-sans font-normal text-zinc-700 dark:text-zinc-200">
                    {p.source}
                  </th>
                  <td className="py-1.5 pr-4 text-zinc-800 dark:text-zinc-100">{d.q(d.mass(p.mass, units))}</td>
                  <td className="py-1.5 pr-4 text-zinc-500 dark:text-zinc-400">
                    {total.mass > 0 ? d.fmt((p.mass / total.mass) * 100, 0) : "—"}%
                  </td>
                  <td className="py-1.5 text-zinc-800 dark:text-zinc-100">{d.q(d.lengthMm(p.cg, units))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-300 font-sans dark:border-zinc-700">
                <th scope="row" className="py-1.5 pr-4 text-left font-medium text-zinc-700 dark:text-zinc-200">
                  Dry total
                </th>
                <td className="py-1.5 pr-4 font-mono font-medium text-zinc-900 dark:text-zinc-50">
                  {d.q(d.mass(total.mass, units))}
                </td>
                <td className="py-1.5 pr-4 text-zinc-500 dark:text-zinc-400">100%</td>
                <td className="py-1.5 font-mono text-zinc-700 dark:text-zinc-300">CG {d.q(d.lengthMm(total.cg, units))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Dry structure only — the motor and any active what-if add their mass at launch. Where a
          component overrides the mass of its whole subassembly, that measured figure stands in for
          everything inside it (the internals aren&apos;t listed separately). These are the same
          per-part masses the simulator flies; a wrong row usually means a mistyped dimension or
          material in the design file.
        </p>
      </div>
    </details>
  );
}
