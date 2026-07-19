"use client";

import Link from "next/link";
import LineChart from "./LineChart";
import { crossCheckSeries } from "@/lib/validation/crosscheck";
import type { FlightResult } from "@/lib/sim/simulate";
import type { StoredFlightData } from "@/lib/ork/import";
import type { UnitSystem } from "@/lib/display";

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
  toolName = "OpenRocket",
  storedName,
  units,
}: {
  result: FlightResult;
  flightData: StoredFlightData;
  toolName?: string;
  storedName?: string;
  units: UnitSystem;
}) {
  const cc = crossCheckSeries(result, flightData);
  const c = units === "imperial" ? 3.28084 : 1;
  const altUnit = units === "imperial" ? "ft" : "m";
  const scale = (pts: { x: number; y: number }[]) => pts.map((p) => ({ x: p.x, y: p.y * c }));

  return (
    <section
      aria-label="Stored-flight cross-check"
      className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
    >
      <h2 className="text-lg font-semibold tracking-tight">Loft vs {toolName}&apos;s stored flight</h2>
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
        {cc.haveDrag ? " The drag curve is the ascent only; a deployed parachute's coefficient is left off." : ""}{" "}
        See{" "}
        <Link href="/docs/validation" className="text-indigo-600 underline underline-offset-2 dark:text-indigo-400">
          how this is measured
        </Link>
        .
      </p>

      <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-600 dark:text-zinc-300">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ background: LOFT_COLOR }} /> Loft
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ background: STORED_COLOR }} /> {toolName} (stored)
        </span>
      </div>

      {cc.haveDrag && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">Drag coefficient vs time (ascent)</p>
          <LineChart
            series={[
              { color: STORED_COLOR, label: `${toolName} stored`, points: cc.storedCd },
              { color: LOFT_COLOR, label: "Loft", points: cc.loftCd },
            ]}
            xLabel="time (s)"
            yLabel="Cd"
            yZeroFloor
          />
        </div>
      )}

      <div className="mt-3">
        <p className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">Altitude ({altUnit}) vs time</p>
        <LineChart
          series={[
            { color: STORED_COLOR, label: `${toolName} stored`, points: scale(cc.storedAltitude) },
            { color: LOFT_COLOR, label: "Loft", points: scale(cc.loftAltitude) },
          ]}
          xLabel="time (s)"
          yLabel={altUnit}
          yZeroFloor
        />
      </div>
    </section>
  );
}
