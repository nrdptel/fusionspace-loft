"use client";

import type { Rocket } from "@/lib/model/types";
import { structurePointMasses, combine } from "@/lib/sim/mass";
import { kgToLb, mToIn } from "@/lib/units";
import type { CsvCell } from "@/lib/csv";
import DownloadCsv, { CopyTable } from "./DownloadCsv";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";

const round = (n: number, dp: number) => (Number.isFinite(n) ? Math.round(n * 10 ** dp) / 10 ** dp : "");

/** Mass & balance breakdown: where the design's dry structural mass comes from, part by part, and
 *  how it balances. Pure transparency into what Loft parsed — the same per-component point masses the
 *  simulator flies — so a flyer can sanity-check an import (a mistyped wall thickness or a missing
 *  override shows up as a wrong row) and see the dry centre of gravity. Structure only: the motor and
 *  nose ballast add their mass at launch and aren't shown here; an airframe what-if IS, because
 *  the airframe is what this describes. Read-only for now; it's also the component-level view a
 *  from-scratch builder will edit. */
export default function MassBreakdown({
  rocket,
  units,
  edited,
  massAbsorbed,
  massHeldBy,
}: {
  rocket: Rocket;
  units: UnitSystem;
  /** A geometry what-if is in force, so this describes the edited airframe rather than the file's.
   *  Said on the panel, in the same words and the same badge the diagram above it uses — a mass
   *  table that silently swapped which rocket it describes is worse than one that never moved. */
  edited?: boolean;
  /** Mass was added by a what-if and the design's total did not move, because the design states its
   *  weight as a whole-assembly override and the added part sits inside it. The model is right to
   *  hold the stated figure — that is what an override means — but the flyer has just typed a
   *  kilogram into a field and every number stayed put, so the panel where mass is read says why. */
  massAbsorbed?: boolean;
  /** The assembly or stage whose stated weight covers a part the flyer has REMOVED, or undefined. The
   *  mirror of `massAbsorbed`: the total does not fall either, and the panel where mass is read is
   *  where that has to be said. Carries the holder's own name rather than a boolean, because "the
   *  design states this" is not actionable and "Sustainer states this" is. */
  massHeldBy?: string;
}) {
  const points = structurePointMasses(rocket);
  if (points.length === 0) return null;
  const total = combine(points);
  // Heaviest first — the parts that dominate the dry mass lead.
  const rows = [...points].sort((a, b) => b.mass - a.mass);

  const massUnit = units === "imperial" ? "lb" : "kg";
  const lenUnit = units === "imperial" ? "in" : "mm";
  const toMass = (kg: number) => (units === "imperial" ? kgToLb(kg) : kg);
  const toLen = (m: number) => (units === "imperial" ? mToIn(m) : m * 1000);
  const csv: CsvCell[][] = [
    ["Component", `Mass (${massUnit})`, "% dry", `CG from nose (${lenUnit})`],
    ...rows.map((p): CsvCell[] => [
      p.source,
      round(toMass(p.mass), 4),
      total.mass > 0 ? round((p.mass / total.mass) * 100, 1) : "",
      round(toLen(p.cg), 1),
    ]),
    ["Dry total", round(toMass(total.mass), 4), 100, round(toLen(total.cg), 1)],
  ];

  return (
    <details className="group rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40">
      <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        <span className="flex items-center gap-2">
          Mass &amp; balance · dry {d.q(d.mass(total.mass, units))}
          {edited && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
              with your edits
            </span>
          )}
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
          Dry structure only — the motor and nose ballast add their mass at launch and are not
          shown here; they are in the flight&apos;s liftoff mass above. A design what-if that changes
          the airframe is shown here — resizing a part moves its row, and adding a payload or a
          drogue adds one — unless the design overrides the mass of the assembly the part sits in.
          Where a component or a stage states the mass of its whole subassembly, that measured figure
          stands in for everything inside it (the internals aren&apos;t listed separately), and
          anything added inside it is covered by the same figure.
          These are the same per-part masses the simulator flies; a wrong row usually means a
          mistyped dimension or material in the design file.
        </p>
        {massHeldBy && (
          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            A part you added or removed was inside {massHeldBy}, whose weight this design states
            outright — so the dry total above is unchanged. The stated figure stands for everything in
            there whether or not that part is, and the flight is flown at that figure. What the change
            does move is the balance: the design&apos;s own weight is now spread over a different set of
            parts, so the centre of gravity and the stability margin have changed.
          </p>
        )}
        {massAbsorbed && (
          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            The mass you added is inside an assembly whose weight this design states outright, so it
            does not change the total — the design&apos;s own figure stands for everything in there,
            and the flight above is flown at that figure. To fly the extra weight, use{" "}
            <em>Nose ballast</em>, which is added on top rather than inside.
          </p>
        )}
        <div className="mt-2">
          <DownloadCsv rows={csv} name={rocket.name} suffix="mass-breakdown" />
          <CopyTable rows={csv} />
        </div>
      </div>
    </details>
  );
}
