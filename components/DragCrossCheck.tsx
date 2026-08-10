"use client";

import Link from "next/link";
import LineChart from "./LineChart";
import { crossCheckSeries, dragAgreement } from "@/lib/validation/crosscheck";
import { fmt } from "@/lib/display";
import type { FlightResult } from "@/lib/sim/simulate";
import type { StoredFlightData } from "@/lib/ork/import";
import type { UnitSystem } from "@/lib/display";
import { Extrapolated, Figure, Panel, Swatch } from "./ui";
import { transonicReason } from "@/lib/sim/envelope";

const LOFT_COLOR = "#6366f1"; // indigo — Loft's own solver
const STORED_COLOR = "#f59e0b"; // amber — the design tool's stored run

/** Overlays Loft's own solver against the per-step flight the design file already stored — the
 *  trajectory it recorded and, where present, the drag coefficient it computed step by step. Two
 *  independent estimates of one flight, side by side: agreement builds confidence and a gap is a
 *  flag worth seeing, not hiding. Unlike the summary comparison (which matches endpoints), the
 *  stored drag curve is a genuinely independent per-step oracle from a different solver. Shown only
 *  when the file carries a per-step log and Loft flew the design as stored (no what-if edits). */
export default function DragCrossCheck({
  result,
  flightData,
  toolName,
  storedName,
  storedStatus,
  units,
}: {
  result: FlightResult;
  flightData: StoredFlightData;
  /** The tool whose stored per-step log this is — named by the importer, never assumed. */
  toolName: string;
  storedName?: string;
  /** The source tool's own status for this stored run — an outdated one logged a different design. */
  storedStatus?: string;
  units: UnitSystem;
}) {
  const cc = crossCheckSeries(result, flightData);
  const agreement = dragAgreement(cc);
  const c = units === "imperial" ? 3.28084 : 1;
  const altUnit = units === "imperial" ? "ft" : "m";
  const scale = (pts: { x: number; y: number }[]) => pts.map((p) => ({ x: p.x, y: p.y * c }));

  return (
    <Panel label="Stored-flight cross-check" title={<>Loft vs {toolName}&apos;s stored flight</>}>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        This file carries {toolName}&apos;s own per-step flight
        {storedName ? (
          <>
            {" "}
            (<span className="italic">{storedName}</span>)
          </>
        ) : null}
        . Loft&apos;s solver is plotted against it — two independent estimates of the same flight, so
        a difference is a flag worth seeing, not hidden.
        {storedStatus === "outdated" && (
          <>
            {" "}
            <span className="text-amber-700 dark:text-amber-400">
              {toolName} marks this run as outdated, so the logged flight is of the design as it was
              before its last edit.
            </span>
          </>
        )}
        {cc.haveDrag ? " The drag curve is the ascent only; a deployed parachute's coefficient is left off." : ""}{" "}
        See{" "}
        <Link href="/docs/validation" className="text-indigo-600 underline underline-offset-2 dark:text-indigo-400">
          how this is measured
        </Link>
        .
      </p>

      {/* Loft's own curve is the extrapolated half of this comparison, so the agreement figure below
          is measured partly outside the envelope Loft's drag model was validated over. The stored
          tool's curve carries whatever caveat that tool attached to it and is not Loft's to qualify —
          which is exactly why the marker belongs on the panel that presents the GAP between them
          rather than on either series. */}
      {result.extrapolatedTransonic && (
        <div className="mt-3">
          {/* Worded against what is actually rendered. The drag plot and the mean-gap figure are
              gated on `cc.haveDrag`, so on a file carrying an altitude log and no per-step Cd the
              longer sentence named a curve and a gap the flyer could not see — which reads as a
              missing panel rather than a caveat. */}
          <Extrapolated
            reason={
              transonicReason(result.extrapolatedTransonic, result.summary.maxMach)! +
              (cc.haveDrag
                ? ". Loft's curve, and the mean gap measured against it, are rough above that"
                : ". Loft's half of the altitude comparison is rough above that")
            }
          />
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-600 dark:text-zinc-300">
        <span className="inline-flex items-center gap-1.5">
          <Swatch color={LOFT_COLOR} /> Loft
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Swatch color={STORED_COLOR} /> {toolName} (stored)
        </span>
      </div>

      {cc.haveDrag && (
        <Figure
          className="mt-3"
          title="Drag coefficient vs time (ascent)"
          aside={
            agreement && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                mean gap{" "}
                <span className="font-mono text-zinc-700 dark:text-zinc-300">{fmt(agreement.meanPct, 0)}%</span>{" "}
                (±<span className="font-mono">{fmt(agreement.meanAbsCd, 2)}</span> C
                <sub>d</sub>)
              </p>
            )
          }
        >
          <LineChart
            series={[
              { color: STORED_COLOR, label: `${toolName} stored`, points: cc.storedCd },
              { color: LOFT_COLOR, label: "Loft", points: cc.loftCd },
            ]}
            xLabel="time (s)"
            yLabel="Cd"
            yZeroFloor
          />
        </Figure>
      )}

      <Figure className="mt-3" title={`Altitude (${altUnit}) vs time`}>
        <LineChart
          series={[
            { color: STORED_COLOR, label: `${toolName} stored`, points: scale(cc.storedAltitude) },
            { color: LOFT_COLOR, label: "Loft", points: scale(cc.loftAltitude) },
          ]}
          xLabel="time (s)"
          yLabel={altUnit}
          yZeroFloor
        />
      </Figure>
    </Panel>
  );
}
