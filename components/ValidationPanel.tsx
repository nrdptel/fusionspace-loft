"use client";

import Link from "next/link";
import type { ValidationReport } from "@/lib/validation/compare";
import { storedCaveat } from "@/lib/validation/stored-status";
import type { UnitSystem } from "@/lib/display";
import { fmt } from "@/lib/display";
import { mToFt, mpsToFtps } from "@/lib/units";

/** Shows Loft's engine against the results the design tool (OpenRocket or RockSim) stored in
 *  the imported design, metric by metric. This is the honest accuracy record: the numbers are
 *  what they are, the mean error is stated plainly, and nothing is hidden.
 *
 *  Not every stored run is the tool's current answer, though, and the file says which is which.
 *  OpenRocket writes a status on every simulation, and three of them mean the numbers are not what
 *  they look like:
 *
 *    - `external` — results that did NOT come from its simulator. `fixtures/src/demo-boattail`,
 *      `demo-payload-separation` and `demo-quirks` carry figures marked this way, so the panel has
 *      something to demonstrate on. The three designs the app offers as one-tap samples do NOT:
 *      each carries `<simulation status="external">` holding launch conditions and no `<flightdata>`
 *      at all, so `hasResults` is false and this panel never renders for them. That absence is
 *      explained on screen by `noStoredResultsReason`, not by this component.
 *    - `outdated` — a real run, but from before the design was last edited, so it describes an
 *      earlier version of this rocket.
 *    - `notsimulated` / `loaded` — figures the file carries for a simulation the tool does not
 *      consider run.
 *
 *  Calling any of those "OpenRocket vs Loft" attributes a current prediction to a tool that did not
 *  make one, so each is said out loud instead. Across the corpus this is not a rare edge: 11 of 91
 *  stored OpenRocket runs are outdated and 7 more are marked not simulated. */

const IMPERIAL_LEN = new Set(["Apogee"]);
const IMPERIAL_SPD = new Set(["Max velocity", "Ground-hit velocity", "Rail-exit velocity", "Deployment velocity"]);
const IMPERIAL_ACCEL = new Set(["Max acceleration"]);

/** A comparison row in the unit system on screen. The rows that fall through are the ones with no
 *  imperial form — seconds, Mach, calibers, percentages — NOT the ones nobody has listed yet: max
 *  acceleration sat in that gap and read "108.4 m/s²" on an otherwise imperial page, on 3 of the
 *  first 4 corpus designs. Anything with a metric unit and no case here is a bug, so the fall-through
 *  asserts the unit is already system-neutral rather than quietly passing it along. */
function convert(label: string, value: number, unit: string, units: UnitSystem): { v: number; u: string } {
  if (units !== "imperial") return { v: value, u: unit };
  if (IMPERIAL_LEN.has(label)) return { v: mToFt(value), u: "ft" };
  if (IMPERIAL_SPD.has(label)) return { v: mpsToFtps(value), u: "ft/s" };
  // m/s² -> ft/s²: the same factor as m -> ft, since only the length dimension changes.
  if (IMPERIAL_ACCEL.has(label)) return { v: mpsToFtps(value), u: "ft/s²" };
  return { v: value, u: unit };
}

export default function ValidationPanel({
  report,
  units,
  storedName,
  toolName,
  external = false,
  storedStatus,
}: {
  report: ValidationReport;
  units: UnitSystem;
  storedName?: string;
  /** The tool whose stored results these are — named by the importer, never assumed. */
  toolName: string;
  /** The stored simulation is marked `external` — figures the file carries, not this tool's own
   *  simulator output. */
  external?: boolean;
  /** The source tool's own status for this stored run, when it has one. */
  storedStatus?: string;
}) {
  return (
    <section aria-label="Validation" className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">
          {external ? "Stated figures vs Loft" : `${toolName} vs Loft`}
        </h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          mean abs. error{" "}
          <span className="font-mono text-zinc-700 dark:text-zinc-300">{fmt(report.mape, 1)}%</span>
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Loft&apos;s engine against the results stored in{" "}
        {storedName ? <span className="italic">{storedName}</span> : "this design"}
        {external
          ? ` — figures the file states, marked in it as not produced by ${toolName}'s own simulator, so treat them as a reference point rather than a second solver's answer`
          : ""}
        . Differences are expected — the point is to show them, not hide them. See{" "}
        <Link href="/docs/validation" className="text-indigo-600 underline underline-offset-2 dark:text-indigo-400">
          how this is measured
        </Link>
        .
      </p>

      {!external && storedCaveat(storedStatus, toolName) && (
        <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          {storedCaveat(storedStatus, toolName)}
        </p>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
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
                  <td className="py-1.5 pr-3 text-right text-zinc-500 dark:text-zinc-400">
                    {fmt(st.v, st.u === "" ? 2 : 1)} <span className="text-[10px]">{st.u}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-right text-zinc-800 dark:text-zinc-200">
                    {fmt(si.v, si.u === "" ? 2 : 1)} <span className="text-[10px]">{si.u}</span>
                  </td>
                  <td className={"py-1.5 text-right " + (big ? "text-amber-700 dark:text-amber-400" : "text-zinc-500 dark:text-zinc-400")}>
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
