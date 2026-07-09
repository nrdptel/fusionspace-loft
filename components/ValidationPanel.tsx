"use client";

import Link from "next/link";
import type { ValidationReport } from "@/lib/validation/compare";
import type { UnitSystem } from "@/lib/display";
import { fmt } from "@/lib/display";
import { mToFt, mpsToFtps } from "@/lib/units";

/** Shows Loft's engine against the results the design tool (OpenRocket or RockSim) stored in
 *  the imported design, metric by metric. This is the honest accuracy record: the numbers are
 *  what they are, the mean error is stated plainly, and nothing is hidden. For the bundled
 *  samples the stored figures are author estimates (see the Validation docs), so this reads as
 *  a demonstration there. */

const IMPERIAL_LEN = new Set(["Apogee"]);
const IMPERIAL_SPD = new Set(["Max velocity", "Ground-hit velocity", "Rail-exit velocity", "Deployment velocity"]);

function convert(label: string, value: number, unit: string, units: UnitSystem): { v: number; u: string } {
  if (units !== "imperial") return { v: value, u: unit };
  if (IMPERIAL_LEN.has(label)) return { v: mToFt(value), u: "ft" };
  if (IMPERIAL_SPD.has(label)) return { v: mpsToFtps(value), u: "ft/s" };
  return { v: value, u: unit };
}

export default function ValidationPanel({
  report,
  units,
  storedName,
  toolName = "OpenRocket",
}: {
  report: ValidationReport;
  units: UnitSystem;
  storedName?: string;
  toolName?: string;
}) {
  return (
    <section aria-label="Validation" className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{toolName} vs Loft</h2>
        <span className="text-xs text-zinc-500">
          mean abs. error{" "}
          <span className="font-mono text-zinc-700 dark:text-zinc-300">{fmt(report.mape, 1)}%</span>
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Loft&apos;s engine against the results stored in{" "}
        {storedName ? <span className="italic">{storedName}</span> : "this design"}. Differences
        are expected — the point is to show them, not hide them. See{" "}
        <Link href="/docs/validation" className="text-indigo-600 underline underline-offset-2 dark:text-indigo-400">
          how this is measured
        </Link>
        .
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <th className="py-1 pr-3 font-medium">Metric</th>
              <th className="py-1 pr-3 text-right font-medium">Stored</th>
              <th className="py-1 pr-3 text-right font-medium">Loft</th>
              <th className="py-1 text-right font-medium">Δ</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {report.comparisons.map((c) => {
              const st = convert(c.label, c.stored, c.unit, units);
              const si = convert(c.label, c.simulated, c.unit, units);
              const big = Math.abs(c.pctError) > 25;
              return (
                <tr key={c.key} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1.5 pr-3 font-sans text-zinc-700 dark:text-zinc-300">{c.label}</td>
                  <td className="py-1.5 pr-3 text-right text-zinc-500">
                    {fmt(st.v, st.u === "" ? 2 : 1)} <span className="text-[10px]">{st.u}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-right text-zinc-800 dark:text-zinc-200">
                    {fmt(si.v, si.u === "" ? 2 : 1)} <span className="text-[10px]">{si.u}</span>
                  </td>
                  <td className={"py-1.5 text-right " + (big ? "text-amber-600 dark:text-amber-400" : "text-zinc-500")}>
                    {c.pctError >= 0 ? "+" : ""}
                    {fmt(c.pctError, 0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
