"use client";

import { useEffect, useState } from "react";
import type { OrkDocument } from "@/lib/ork/import";
import { overridesFromStored } from "@/lib/sim/run";
import { type SweepMotor, type MotorSweepRow } from "@/lib/sim/sweep";
import { RECOMMENDED_FLUTTER_MARGIN } from "@/lib/sim/flutter";
import { runMotorSweep } from "@/lib/sim/sweep-client";
import type { GeometryEdits } from "@/lib/model/edit";
import { mToFt, mpsToFtps } from "@/lib/units";
import type { CsvCell } from "@/lib/csv";
import DownloadCsv from "./DownloadCsv";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";

const round = (n: number, dp: number) => (Number.isFinite(n) ? Math.round(n * 10 ** dp) / 10 ** dp : "");

/** Below this liftoff thrust-to-weight the rocket is at or under the common HPR rule of thumb for
 *  clean rail clearance — worth flagging (softly, never as a verdict). */
const TW_RULE_OF_THUMB = 5;

/** Motor sweep: fly this airframe on every bundled motor that fits its mount, all under one clean
 *  ballistic baseline, and lay the results side by side — the "which motor gets me to my target?"
 *  question answered at a glance, in the browser. Reuses the same motor-swap the what-if picker
 *  uses, so each row is exactly the flight that picking that motor would produce. It honours the
 *  active nose-ballast and geometry what-ifs, so the sweep is over the design the flyer is looking
 *  at. Because it's a like-for-like comparison, every motor flies ballistic to apogee under the
 *  design's stored launch conditions (recovery and wind removed), matching the RocketPy
 *  cross-check's methodology. */
export default function MotorSweep({
  doc,
  simIndex,
  units,
  options,
  designMotor,
  ballastKg,
  geometry,
}: {
  doc: OrkDocument;
  simIndex: number;
  units: UnitSystem;
  /** Bundled motors of the design's mount diameter — the same list the swap picker offers. */
  options: SweepMotor[];
  /** The design's own motor designation, to mark its row. */
  designMotor: string;
  /** Active "what-if" nose ballast (kg), applied to every motor in the sweep. */
  ballastKg?: number;
  /** Active builder geometry edits, applied to every motor in the sweep. */
  geometry?: GeometryEdits;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<MotorSweepRow[] | null>(null);
  const [running, setRunning] = useState(false);

  // Run the sweep off the main thread (falls back to synchronous if no worker), so a design's
  // dozens of flights don't freeze the UI. A stale run (inputs changed mid-flight) is ignored.
  useEffect(() => {
    if (!open) {
      setRows(null);
      return;
    }
    let live = true;
    setRunning(true);
    const sim = doc.simulations[simIndex] ?? doc.simulations[0];
    runMotorSweep(
      doc.rocket,
      options,
      {
        configId: sim?.conditions.configId,
        overrides: sim ? overridesFromStored(sim) : undefined,
        ballastKg,
        geometry,
        designMotor,
      },
      () => !live,
    ).then((r) => {
      if (!live) return;
      setRows(r);
      setRunning(false);
    });
    return () => {
      live = false;
    };
  }, [open, doc, simIndex, options, designMotor, ballastKg, geometry]);

  return (
    <section
      aria-label="Motor sweep"
      className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Compare fitting motors</h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{options.length} motors fit this mount</span>
      </div>
      <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
        Fly this airframe on every bundled motor that fits its mount diameter, all at once, and see
        how apogee, speed, rail-exit velocity, stability, and fin-flutter margin change across them —
        the classic &ldquo;which motor gets me to my target?&rdquo; sweep (and whether a punchier one
        pushes the fins toward flutter), run entirely on your device.
      </p>

      {!open && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            Run motor sweep
          </button>
        </div>
      )}

      {open && running && (
        <div className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300" role="status">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span>Flying {options.length} motors…</span>
        </div>
      )}

      {open && !running && rows !== null && rows.length === 0 && (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
          None of the fitting motors could be flown on this airframe.
        </div>
      )}

      {open && !running && rows !== null && rows.length > 0 && (
        <SweepTable rows={rows} units={units} name={doc.rocket.name} />
      )}
    </section>
  );
}

function sweepCsv(rows: MotorSweepRow[], units: UnitSystem): CsvCell[][] {
  const spd = units === "imperial" ? "ft/s" : "m/s";
  const alt = units === "imperial" ? "ft" : "m";
  const toAlt = (m: number) => (units === "imperial" ? mToFt(m) : m);
  const toSpd = (mps: number) => (units === "imperial" ? mpsToFtps(mps) : mps);
  const header: CsvCell[] = ["Motor", "Manufacturer", "Class", `Apogee (${alt})`, `Max velocity (${spd})`, `Rail-exit (${spd})`, "Thrust-to-weight", "Static margin (cal)", "Fin flutter margin (x)", "Optimum delay (s)", "Design"];
  const body: CsvCell[][] = rows.map((r) => [
    r.designation,
    r.manufacturer,
    r.motorClass,
    round(toAlt(r.apogee), 1),
    round(toSpd(r.maxVelocity), 1),
    round(toSpd(r.railExitVelocity), 1),
    round(r.thrustToWeight, 2),
    round(r.staticMarginCal, 2),
    round(r.flutterMargin, 2),
    round(r.optimumDelay, 1),
    r.isDesign ? "yes" : "",
  ]);
  return [header, ...body];
}

function SweepTable({ rows, units, name }: { rows: MotorSweepRow[]; units: UnitSystem; name: string }) {
  return (
    <div className="mt-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <th className="py-1 pr-4 font-medium">Motor</th>
              <th className="py-1 pr-4 font-medium">Class</th>
              <th className="py-1 pr-4 font-medium">Apogee</th>
              <th className="py-1 pr-4 font-medium">Max&nbsp;V</th>
              <th className="py-1 pr-4 font-medium">Rail&nbsp;exit</th>
              <th className="py-1 pr-4 font-medium">T:W</th>
              <th className="py-1 pr-4 font-medium">Margin</th>
              <th className="py-1 pr-4 font-medium">Flutter</th>
              <th className="py-1 font-medium">Delay</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((r) => {
              const lowTW = r.thrustToWeight < TW_RULE_OF_THUMB;
              const thinFlutter = Number.isFinite(r.flutterMargin) && r.flutterMargin < RECOMMENDED_FLUTTER_MARGIN;
              return (
                <tr
                  key={`${r.manufacturer}|${r.designation}`}
                  className={
                    "border-t border-zinc-100 dark:border-zinc-800 " +
                    (r.isDesign ? "bg-indigo-50/70 dark:bg-indigo-500/10" : "")
                  }
                >
                  <th
                    scope="row"
                    className="py-1.5 pr-4 text-left font-sans font-normal text-zinc-700 dark:text-zinc-200"
                  >
                    <span className="font-medium text-zinc-800 dark:text-zinc-100">{r.designation}</span>{" "}
                    <span className="text-zinc-500 dark:text-zinc-400">· {r.manufacturer}</span>
                    {r.isDesign && (
                      <span className="ml-1.5 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                        Design
                      </span>
                    )}
                  </th>
                  <td className="py-1.5 pr-4 text-zinc-600 dark:text-zinc-300">{r.motorClass}</td>
                  <td className="py-1.5 pr-4 text-zinc-800 dark:text-zinc-100">{d.q(d.altitude(r.apogee, units))}</td>
                  <td className="py-1.5 pr-4 text-zinc-800 dark:text-zinc-100">{d.q(d.speed(r.maxVelocity, units))}</td>
                  <td className="py-1.5 pr-4 text-zinc-800 dark:text-zinc-100">{d.q(d.speed(r.railExitVelocity, units))}</td>
                  <td
                    className={
                      "py-1.5 pr-4 " +
                      (lowTW ? "text-amber-700 dark:text-amber-300" : "text-zinc-800 dark:text-zinc-100")
                    }
                    title={lowTW ? `Below the ~${TW_RULE_OF_THUMB}:1 rule of thumb for clean rail clearance` : undefined}
                  >
                    {d.fmt(r.thrustToWeight, 1)}
                  </td>
                  <td className="py-1.5 pr-4 text-zinc-800 dark:text-zinc-100">{d.q(d.calibers(r.staticMarginCal))}</td>
                  <td
                    className={
                      "py-1.5 pr-4 " +
                      (thinFlutter ? "text-amber-700 dark:text-amber-300" : "text-zinc-800 dark:text-zinc-100")
                    }
                    title={
                      thinFlutter
                        ? `Below the recommended ${RECOMMENDED_FLUTTER_MARGIN}× fin-flutter margin at this speed`
                        : undefined
                    }
                  >
                    {Number.isFinite(r.flutterMargin) ? `${d.fmt(r.flutterMargin, 1)}×` : "—"}
                  </td>
                  <td
                    className="py-1.5 text-zinc-800 dark:text-zinc-100"
                    title="Optimum ejection delay for apogee deployment (burnout → apogee)"
                  >
                    {Number.isFinite(r.optimumDelay) ? d.q(d.seconds(r.optimumDelay)) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Each motor flies a ballistic ascent to apogee under the design&apos;s stored launch
        conditions — a like-for-like comparison, not the full recovery flight. Rail-exit velocity and
        thrust-to-weight are the launch-safety numbers to check against your rail and the ~5:1 and
        ~15&nbsp;m/s (≈50&nbsp;ft/s) rules of thumb. <em>Delay</em> is the ejection delay that deploys
        at apogee for that motor (burnout&nbsp;→&nbsp;apogee), so you can pick the delay to buy or drill
        for each candidate; a faster motor coasts longer and wants a longer delay. These are estimates
        to verify, never a go/no-go.
      </p>
      <div className="mt-2">
        <DownloadCsv rows={sweepCsv(rows, units)} name={name} suffix="motor-sweep" />
      </div>
    </div>
  );
}
