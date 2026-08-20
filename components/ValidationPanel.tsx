"use client";

import Link from "next/link";
import type { MetricComparison, ValidationReport } from "@/lib/validation/compare";
import { storedCaveat } from "@/lib/validation/stored-status";
import type { UnitSystem } from "@/lib/display";
import { fmt } from "@/lib/display";
import { mToFt, mpsToFtps } from "@/lib/units";
import { transonicReason } from "@/lib/sim/envelope";
import { Card, Extrapolated, Panel } from "./ui";
import DataTable, { usePersistedSort, type Column } from "./DataTable";

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

/** A converted figure as a CSV number: the value the cell shows, at the cell's own precision.
 *  Dimensionless metrics (Mach, thrust-to-weight) get the extra decimal the cell gives them. */
function csvNumber(q: { v: number; u: string }): number | string {
  if (!Number.isFinite(q.v)) return "";
  const dp = q.u === "" ? 2 : 1;
  return Math.round(q.v * 10 ** dp) / 10 ** dp;
}

export default function ValidationPanel({
  report,
  units,
  storedName,
  toolName,
  external = false,
  storedStatus,
  extrapolatedTransonic,
  maxMach,
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
  /** Whether LOFT's half of this comparison left the drag model's validated envelope, and the
   *  Mach it reached — `lib/sim/envelope.ts`'s two facts, passed rather than re-derived so this
   *  panel and the flight it describes cannot disagree at the boundary.
   *
   *  **This panel was the seventh surface, and it was not on the list of six.** `envelope.ts`'s own
   *  docblock names the surfaces that rendered a supersonic flight's numbers as though they were
   *  validated — both sweeps, the dispersion, the drag cross-check, the RocketPy cross-check and the
   *  summary strip — and every one of them was fixed. This one publishes **the mean absolute error
   *  itself**, which is the single number a flyer quotes as Loft's accuracy, and it published it
   *  bare. `DragCrossCheck` renders directly BELOW it off the same flight and says *"Loft's curve,
   *  and the mean gap measured against it, are rough above that"* — so on a supersonic design the
   *  two agreement figures sat on one screen, one hedged and one not, which is the arrangement
   *  `envelope.ts` exists to prevent in its own words.
   *
   *  **Required, not optional, and the first draft of this fix had them optional.** `transonicReason`
   *  formats the Mach into its own sentence, so an absent one defaulted through `?? 0` would have
   *  published *"this flight reaches M0.00, outside the drag model's validated subsonic envelope
   *  (M ≤ 0.8)"* — a sentence that contradicts itself, on the panel this change exists to make
   *  honest. Unreachable through the single call site, which always has both; required so that it
   *  stays unreachable through the second one. */
  extrapolatedTransonic: boolean;
  maxMach: number;
}) {
  const columns: Column<MetricComparison>[] = [
          {
            key: "label",
            label: "Metric",
            sortValue: (c) => c.label,
            cell: (c) => <span className="font-sans text-zinc-700 dark:text-zinc-300">{c.label}</span>,
            // **The unit rides on the metric NAME in the export**, because it is per row here — each
            // metric has its own — so it cannot go in a column header the way the dispersion export
            // puts it. Without it the file was two numeric columns whose VALUE flips with the unit
            // toggle, under one filename, with nothing in it saying which system it was saved in.
            csv: (c) => {
              const u = convert(c.label, c.stored, c.unit, units).u;
              return u ? `${c.label} (${u})` : c.label;
            },
          },
          {
            key: "stored",
            label: "Stored",
            align: "right",
            sortValue: (c) => c.stored,
            cell: (c) => {
              const st = convert(c.label, c.stored, c.unit, units);
              return (
                <span className="text-zinc-500 dark:text-zinc-400">
                  {fmt(st.v, st.u === "" ? 2 : 1)} <span className="text-xs">{st.u}</span>
                </span>
              );
            },
            // Rounded to what the cell shows. The raw float is not more honest — it is a conversion
            // artefact: a stored 50.59 m exported as 165.97769028871392 ft claims twelve digits of a
            // number the model has three of, which is the false precision `DESIGN.md` §6 forbids.
            csv: (c) => csvNumber(convert(c.label, c.stored, c.unit, units)),
          },
          {
            key: "loft",
            label: "Loft",
            align: "right",
            sortValue: (c) => c.simulated,
            cell: (c) => {
              const si = convert(c.label, c.simulated, c.unit, units);
              return (
                <>
                  {fmt(si.v, si.u === "" ? 2 : 1)} <span className="text-xs">{si.u}</span>
                </>
              );
            },
            csv: (c) => csvNumber(convert(c.label, c.simulated, c.unit, units)),
          },
          {
            key: "delta",
            label: "Δ",
            align: "right",
            // Sorted by MAGNITUDE, because the question a flyer has of this column is "where do we
            // disagree most", not "which is most negative".
            sortValue: (c) => Math.abs(c.pctError),
            cell: (c) => (
              <span
                className={
                  Math.abs(c.pctError) > 25
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-zinc-500 dark:text-zinc-400"
                }
              >
                {c.pctError >= 0 ? "+" : ""}
                {fmt(c.pctError, 0)}%
              </span>
            ),
            csvLabel: "\u0394 (%)",
            // Plain ASCII and rounded like the cell: the screen's "+12%" carries its sign and unit in
            // the glyphs, and a bare 12.34567 under a header reading only "\u0394" is a number a reader
            // has to guess the meaning of.
            csv: (c) => (Number.isFinite(c.pctError) ? Math.round(c.pctError * 10) / 10 : ""),
          },
        ];

  // Opens in the order the comparison was built — metric by metric, the order the caveats below it
  // are written in — so the default is the caller's own and a remembered sort is a deliberate act.
  // Keyed on the SURFACE, not the tool: `toolName` changes with every import and a per-tool key would
  // forget the sort the moment a flyer opened a RockSim file after an OpenRocket one.
  const [sort, setSort] = usePersistedSort("validation.sort", columns);

  return (
    <Panel
      label="Validation"
      title={external ? "Stated figures vs Loft" : `${toolName} vs Loft`}
      aside={
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          mean abs. error{" "}
          <span className="font-mono text-zinc-700 dark:text-zinc-300">{fmt(report.mape, 1)}%</span>
        </span>
      }
    >
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

      {/* **Loft's half is the extrapolated one, so the marker belongs on the GAP rather than on
          either column** — the same reasoning `DragCrossCheck` states, and for the same reason: the
          stored tool's figures carry whatever caveat that tool attached to them and are not Loft's
          to qualify. The mean absolute error in the header above is measured against a Loft flight
          that left the validated envelope, and it is the figure this panel exists to publish. */}
      {extrapolatedTransonic && (
        <div className="mt-3">
          <Extrapolated
            reason={
              transonicReason(extrapolatedTransonic, maxMach)! +
              `. Loft's half of every row below, and the mean error measured from them, are rough above that — ${toolName}'s stored figures are not`
            }
          />
        </div>
      )}

      {!external && storedCaveat(storedStatus, toolName) && (
        <Card as="p" tone="warn" className="mt-2 text-sm">
          {storedCaveat(storedStatus, toolName)}
        </Card>
      )}

      {/* The cross-check a flyer most wants to paste into a build thread, and until now it could not
          leave the page: no sort, no copy, no export. `minWidth` is kept from the hand-rolled version
          — these four columns compress into unreadability well before the viewport does. */}
      <DataTable
        className="mt-3"
        sort={sort}
        onSortChange={setSort}
        rows={report.comparisons}
        rowKey={(c) => c.key}
        minWidth="30rem"
        exportName={toolName}
        exportSuffix="validation"
        // **The withheld metrics travel with the file.** The card below names them on screen; the
        // export used to come back with eight rows and nothing saying a ninth was withheld or why,
        // which reads as "the file stored less" rather than "we did not measure it" — the same
        // caveat-on-one-surface shape the withholding was built to end.
        csvPreamble={report.withheld.map(
          (w) => `Not compared — ${w.label.toLowerCase()}: ${w.reason}`,
        )}
        caption={`Loft against ${toolName}'s stored results, metric by metric`}
        empty="No metric in this design's stored run can be compared yet — import a design whose tool saved a simulation, and every figure it stored appears here beside Loft's."
        columns={columns}
      />

      {/* What the file stored and this flight cannot answer. Said out loud, because the alternative
          is a table that quietly comes back with eight rows instead of ten and reads as though the
          file stored less than it did. `DESIGN.md` §3 puts a withheld figure's REASON in the same
          place as the figure it replaces, so this sits with the table rather than in a footnote. */}
      {report.withheld.length > 0 && (
        <Card as="p" tone="sunken" className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Not compared:{" "}
          {report.withheld.map((w, i) => (
            <span key={w.key}>
              {i > 0 && "; "}
              <strong className="font-medium">{w.label.toLowerCase()}</strong> &mdash; {w.reason}
            </span>
          ))}
          . {toolName} stored {report.withheld.length === 1 ? "a figure" : "figures"} for{" "}
          {report.withheld.length === 1 ? "it" : "them"}; Loft&apos;s flight has none to set beside{" "}
          {report.withheld.length === 1 ? "it" : "them"}, so nothing is scored rather than scoring a
          zero that only looks like a measurement.
        </Card>
      )}
    </Panel>
  );
}
