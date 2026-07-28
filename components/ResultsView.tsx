"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Tabs } from "./ui";
import type { FlightRun } from "@/lib/sim/run";
import { applyGeometryEdits, hasGeometryEdits, primaryFinGroupIds, type GeometryEdits } from "@/lib/model/edit";
import { designKey } from "@/lib/model/design-key";
import { formatLabel, sourceTool, type OrkDocument } from "@/lib/ork/import";
import type { FlightResult } from "@/lib/sim/simulate";
import { RECOMMENDED_FLUTTER_MARGIN, thicknessForFlutterMargin } from "@/lib/sim/flutter";
import LineChart, { type Series, type Marker } from "./LineChart";
import FlightViz from "./FlightViz";
import ValidationPanel from "./ValidationPanel";
import DragCrossCheck from "./DragCrossCheck";
import RocketpyCrossCheck from "./RocketpyCrossCheck";
import MotorSweep from "./MotorSweep";
import ParameterSweep from "./ParameterSweep";
import MonteCarlo from "./MonteCarlo";
import MassBreakdown from "./MassBreakdown";
import GeometryInspector from "./GeometryInspector";
import DownloadCsv from "./DownloadCsv";
import type { CsvCell } from "@/lib/csv";
import { parseFlightLog, type FlightLogPoint, type FlightLogSpeedPoint, type LogUnit, type LogSpeedUnit } from "@/lib/flightlog";
import { mToFt, ftToM, mpsToFtps, ftpsToMps, mphToMps, KMH_PER_MPS, kgToLb } from "@/lib/units";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";
import { impulseClass } from "@/lib/motors/eng";
import { overallLength } from "@/lib/model/geometry";
import { noseBallastStation, configChoices } from "@/lib/sim/run";
import { motorLayout } from "@/lib/sim/setup";
import { marginTrim, finStationTrim } from "@/lib/sim/trim";
import { recoverySizing } from "@/lib/sim/recovery";

/** A gentle target landing speed to size recovery toward — the middle of the ~3–6 m/s (10–20 ft/s)
 *  band most designs aim for, the same range the hard-landing warning is written against. */
const SOFT_LANDING_TARGET = 5;

/** The whole simulated trajectory as a CSV grid, one row per integration sample — so a flyer can take
 *  the raw flight into a spreadsheet or plot it against an altimeter log. The kinematic columns follow
 *  the chosen unit system (the same toggle the plots use) and Mach and drag coefficient are unitless,
 *  while thrust, drag and dynamic pressure stay in SI. That last group is a deliberate choice about the
 *  export rather than a reflection of the screen: the Flight card states max-Q in kPa or psi with the
 *  toggle, but this file is a physics record meant to be differentiated and integrated, and newtons and
 *  pascals are the units those operations expect. Every column names its own unit, so nothing here is
 *  ambiguous — it is simply not all the same system. Client-side only, like every other export. */
function flightDataCsv(result: FlightResult, units: UnitSystem): CsvCell[][] {
  const imperial = units === "imperial";
  const len = (m: number) => (imperial ? mToFt(m) : m);
  const spd = (mps: number) => (imperial ? mpsToFtps(mps) : mps);
  const mass = (kg: number) => (imperial ? kgToLb(kg) : kg);
  const lenU = imperial ? "ft" : "m";
  const spdU = imperial ? "ft/s" : "m/s";
  const massU = imperial ? "lb" : "kg";
  const r5 = (n: number) => (Number.isFinite(n) ? Math.round(n * 1e5) / 1e5 : "");
  const header: CsvCell[] = [
    "Time (s)",
    "Phase",
    `Altitude (${lenU})`,
    `Downrange (${lenU})`,
    `Speed (${spdU})`,
    `Vertical speed (${spdU})`,
    `Acceleration (${spdU}²)`,
    "Mach",
    "Drag coefficient",
    "Thrust (N)",
    "Drag (N)",
    `Mass (${massU})`,
    "Dynamic pressure (Pa)",
  ];
  const rows: CsvCell[][] = [header];
  for (const s of result.trajectory) {
    rows.push([
      r5(s.t),
      s.phase,
      r5(len(s.altitude)),
      r5(len(s.x)),
      r5(spd(s.velocity)),
      r5(spd(s.verticalVelocity)),
      r5(spd(s.acceleration)), // an acceleration shares the length unit's per-second² factor
      r5(s.mach),
      r5(s.cd),
      r5(s.thrust),
      r5(s.drag),
      r5(mass(s.mass)),
      r5(s.dynamicPressure),
    ]);
  }
  return rows;
}

/** A healthy static margin to trim toward — comfortably above the 1-caliber rule of thumb, below
 *  the ~3-caliber point where over-stability starts to weathercock. */
const TRIM_TARGET_CAL = 1.5;

/** Above this the design is over-stable (the flight raises the same caution) and prone to
 *  weathercocking; the fin-position trim then eases it back toward `OVER_STABLE_TARGET_CAL`. */
const OVER_STABLE_CAL = 3;
const OVER_STABLE_TARGET_CAL = 2;

const COLORS = {
  altitude: "#6366f1",
  velocity: "#10b981",
  vertical: "#818cf8",
  accel: "#f59e0b",
  mach: "#8b5cf6",
  thrust: "#ef4444",
};

/** Why an Analyze tool isn't offered for this design — said out loud, because a panel that simply
 *  isn't there reads as a missing feature rather than a modelling limit. */
function ToolUnavailable({ title, reason }: { title: string; reason: string }) {
  return (
    <section
      aria-label={`${title} unavailable`}
      className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400"
    >
      <h2 className="text-base font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">{title}</h2>
      <p className="mt-1.5">{reason}</p>
    </section>
  );
}

/** The results workspaces, in the order the tab bar shows them. Also the vocabulary of the URL
 *  fragment (`#design`), so a workspace is a place you can link to and come back to. */
export const WORKSPACES = ["flight", "design", "analyze"] as const;
export type Workspace = (typeof WORKSPACES)[number];

const SEVERITY: Record<string, string> = {
  warning: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  caution: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  info: "border-zinc-400/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
};

export default function ResultsView({
  run,
  doc,
  units,
  baseline,
  simIndex = 0,
  ballastKg,
  recoveryCdScale,
  motorSwap,
  geometry,
  swapOptions,
  designMotor,
  onEditGeometry,
  onSelectFinSet,
  initialTab,
  onWorkspaceChange,
  designEditor,
}: {
  run: FlightRun;
  doc: OrkDocument;
  units: UnitSystem;
  /** When a design what-if (nose ballast / motor swap) is active, the same flight without that
   *  change under identical conditions — so the results can show what the change bought. */
  baseline?: FlightRun | null;
  /** The stored-simulation index being flown, for building the RocketPy cross-check spec. */
  simIndex?: number;
  /** Active "what-if" edits, so the RocketPy cross-check flies the same hypothetical shown above. */
  ballastKg?: number;
  /** Active recovery-size what-if (scale on deployed drag area) — affects the descent, so the
   *  Monte-Carlo (landing scatter) honours it. */
  recoveryCdScale?: number;
  motorSwap?: { manufacturer?: string; designation: string; diameter?: number };
  geometry?: GeometryEdits;
  /** Bundled motors that fit this airframe's mount, for the motor-sweep comparison. */
  swapOptions?: { designation: string; manufacturer: string; diameter: number; motorClass: string }[];
  /** The design's own motor designation, to mark its row in the sweep. */
  designMotor?: string;
  /** Apply a geometry edit from the diagram's drag handle (e.g. fin station) — the same path a
   *  numeric what-if field uses, so dragging and typing converge on one edit flow. */
  onEditGeometry?: (patch: GeometryEdits) => void;
  /** Told which fin set the flyer picked in the parts table or on the diagram, so the fin fields
   *  describe and edit that set. Null clears it back to the frontmost. */
  onSelectFinSet?: (id: string | null) => void;
  /** Which workspace to open on. An import lands on its flight result; a from-scratch build lands on
   *  the editable Design surface, and a resumed session lands where it was left. Read once at mount
   *  — the view remounts on every design load. */
  initialTab?: Workspace;
  /** Told which workspace the flyer moved to, so the session can pick that one back up. */
  onWorkspaceChange?: (tab: Workspace) => void;
  /** The design-editing surface (motor swap + geometry/recovery what-ifs), rendered inside the
   *  Design workspace next to the diagram it edits — build and edit are the same surface. */
  designEditor?: ReactNode;
}) {
  const r = run.result;
  const s = r.summary;
  const markers = eventMarkers(r);
  // Where a load lands. Imports lead with the flight (the payoff) and a fresh build with the editor,
  // but a design whose motor didn't resolve has no flight to lead with — so it opens on Design, the
  // workspace holding the geometry it can still be checked against and the motor swap that fixes it.
  // Only the landing is corrected: clicking Flight from there is still the flyer's to do.
  const landingTab = (want: Workspace | null | undefined): Workspace => {
    const w = want ?? "flight";
    return !run.hasPropulsion && w === "flight" ? "design" : w;
  };

  // Which workspace is open. Panels stay mounted (hidden) so a run in one — a swept curve, a
  // Monte-Carlo — isn't lost when you glance at another.
  const [tab, setTab] = useState<Workspace>(landingTab(initialTab));

  // The open workspace is written to the URL fragment, so a workspace can be linked, bookmarked, and
  // reached with the browser's own Back button — three views deep in an app that never changed its
  // address is a view you can only get to by knowing it's there. Hydration-safe: the fragment is
  // read in an effect, never during render, so the server's HTML and the client's first pass agree.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace(/^#/, "");
      return (WORKSPACES as readonly string[]).includes(id) ? (id as Workspace) : null;
    };
    const adopt = (id: Workspace) => {
      setTab(id);
      // Tell the session too: a workspace reached with the browser's Back button is as much "where
      // I left off" as one reached by clicking the tab, and a reload must agree with the address.
      onWorkspaceChange?.(id);
    };
    // The loader points the address at the workspace it means to open on, before this view mounts.
    // Correct it for what the design actually has and put the address back in step, so a load never
    // leaves `#flight` selecting Design. `replaceState`, not `push`: this is the same landing, not a
    // navigation the Back button should have to undo.
    const initial = landingTab(fromHash() ?? initialTab);
    adopt(initial);
    if (window.location.hash !== `#${initial}`) window.history.replaceState(null, "", `#${initial}`);
    const onHash = () => {
      const id = fromHash();
      if (id) adopt(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
    // Once, as the view mounts for this design — thereafter the listener carries it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectTab = useCallback(
    (id: string) => {
      const next = (WORKSPACES as readonly string[]).includes(id) ? (id as Workspace) : "flight";
      setTab(next);
      onWorkspaceChange?.(next);
      // A real history entry, so Back returns to the workspace you came from rather than leaving
      // the app. Guarded: a repeat of the current fragment would stack duplicate entries.
      if (typeof window !== "undefined" && window.location.hash !== `#${next}`) {
        window.history.pushState(null, "", `#${next}`);
      }
    },
    [onWorkspaceChange],
  );

  // An optional uploaded flight log (altimeter CSV) overlaid on the altitude plot — the flyer's real
  // flight beside Loft's prediction. Parsed and held entirely in the browser; the unit defaults to
  // whatever the file named (or the current display unit) and can be corrected if the curve looks off.
  const [log, setLog] = useState<{
    points: FlightLogPoint[];
    unit: LogUnit;
    speed: { points: FlightLogSpeedPoint[]; unit: LogSpeedUnit } | null;
  } | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const onLogFile = (file: File | undefined) => {
    setLogError(null);
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => setLogError("Couldn't read that file.");
    reader.onload = () => {
      try {
        const parsed = parseFlightLog(String(reader.result ?? ""));
        setLog({
          points: parsed.points,
          unit: parsed.unitHint ?? (units === "imperial" ? "ft" : "m"),
          speed: parsed.speed
            ? { points: parsed.speed.points, unit: parsed.speed.unitHint ?? (units === "imperial" ? "ft/s" : "m/s") }
            : null,
        });
      } catch (e) {
        setLog(null);
        setLogError(e instanceof Error ? e.message : "Couldn't read that flight log.");
      }
    };
    reader.readAsText(file);
  };
  // The uploaded log as an altitude series in the plot's own display unit: log altitude → metres →
  // the metric/imperial unit the altitude curve uses.
  const logSeries: Series | null =
    log && log.points.length > 1
      ? {
          color: "#0891b2", // cyan — distinct from the indigo prediction, reads as measured data
          label: "flight log",
          points: log.points.map((p) => {
            const m = log.unit === "ft" ? ftToM(p.altitude) : p.altitude;
            return { x: p.t, y: units === "imperial" ? mToFt(m) : m };
          }),
        }
      : null;
  // The one number the overlay is really for: the log's own peak altitude beside Loft's predicted
  // apogee. It compares peaks only, so it needs no time alignment; it's the flyer's measurement next
  // to the estimate, not a model-accuracy claim. A wildly off delta usually means the log's unit is
  // set wrong — the toggle beside it fixes that. Both values are in the plot's display unit.
  const predApogee = units === "imperial" ? mToFt(s.apogee) : s.apogee;
  const altUnit = units === "imperial" ? "ft" : "m";
  const logPeak = logSeries ? Math.max(...logSeries.points.map((p) => p.y)) : null;
  const peakDeltaPct = logPeak !== null && predApogee > 0 ? ((logPeak - predApogee) / predApogee) * 100 : null;

  // When the log also carries a velocity column, overlay it on the velocity plot and compare its own
  // peak against Loft's predicted max velocity — the second half of the predict-vs-reality check.
  const logToMps = (v: number, u: LogSpeedUnit) =>
    u === "ft/s" ? ftpsToMps(v) : u === "mph" ? mphToMps(v) : u === "km/h" ? v / KMH_PER_MPS : v;
  const logSpeedSeries: Series | null =
    log?.speed && log.speed.points.length > 1
      ? {
          color: "#0891b2",
          label: "flight log",
          points: log.speed.points.map((p) => {
            const mps = logToMps(p.v, log.speed!.unit);
            return { x: p.t, y: units === "imperial" ? mpsToFtps(mps) : mps };
          }),
        }
      : null;
  const spdUnit = units === "imperial" ? "ft/s" : "m/s";
  const predMaxV = units === "imperial" ? mpsToFtps(s.maxVelocity) : s.maxVelocity;
  const logMaxV = logSpeedSeries ? Math.max(...logSpeedSeries.points.map((p) => p.y)) : null;
  const vDeltaPct = logMaxV !== null && predMaxV > 0 ? ((logMaxV - predMaxV) / predMaxV) * 100 : null;

  // No propulsion ⇒ the "flight" is a zero-thrust drop and every metric is meaningless. Lead
  // with why, name the motor(s) that didn't resolve, and withhold the misleading numbers, plots,
  // and the stored comparison. The geometry and stability below are motor-independent and stay
  // valid.
  //
  // Whose stored numbers those are is the file's own tool — OpenRocket, RockSim or RASAero. Every
  // surface below that names it is gated on the file carrying that tool's results, so a design
  // built here rather than imported never reaches them; the neutral wording is the fallback rather
  // than naming a tool that never wrote this design.
  const toolName = sourceTool(doc) ?? "the design file";

  // The geometry panel reflects the active what-if edits, so its silhouette matches the CG/CP the
  // (also edited) flight reports. Ballast and motor-swap what-ifs don't change the shape — they
  // shift only the CG marker — so applying the geometry edits alone keeps the picture consistent.
  const editing = !!(geometry && hasGeometryEdits(geometry));
  // What the Analyze panels are keyed on: change any of it and a completed run no longer describes
  // the design on screen, so the panel resets rather than showing a stale answer as a current one.
  const dkey = designKey({ name: doc.rocket.name, simIndex, configId: run.config.id, ballastKg, recoveryCdScale, motorSwap, geometry });
  const staged = (doc.rocket.stages?.length ?? 1) > 1;
  // The motor sweep flies the bundled candidates itself rather than the design's own configuration,
  // so it is the one Analyze tool that still works when no motor resolved — and on that design it is
  // the most useful one there is.
  const canSweepMotors = !staged && !!swapOptions && swapOptions.length > 1;
  const shownRocket = editing ? applyGeometryEdits(doc.rocket, geometry) : doc.rocket;
  // The motor casing(s) the flight flew, for drawing inside the aft body — resolved for the shown
  // design and its (possibly swapped) config, so the picture matches what was flown.
  const shownMotors = run.hasPropulsion ? motorLayout(shownRocket, run.config) : [];

  return (
    <div className="space-y-6">
      {/* Why there is no flight, when there isn't one. Above the tabs with the flight warnings,
          because it is the context every workspace shares — the geometry below is still real, the
          numbers that depend on thrust are not. */}
      {!run.hasPropulsion && (
        <NoPropulsionNotice run={run} tool={toolName} swapOptions={swapOptions} doc={doc} />
      )}

      <RocketSummary run={run} doc={doc} units={units} geometry={geometry} />

      {r.warnings.length > 0 && (
        <ul className="space-y-2">
          {r.warnings.map((w) => (
            <li key={w.code} className={"rounded-lg border px-3 py-2 text-sm " + (SEVERITY[w.severity] ?? SEVERITY.info)}>
              {w.message}
            </li>
          ))}
        </ul>
      )}

      {/* Workspace navigation — the results are more than one page of tool now, so split the jobs
          into focused views rather than one endless scroll. The design summary and any flight
          warnings above stay put, as the context every view shares. */}
      <Tabs
        tabs={[
          { id: "flight", label: "Flight" },
          { id: "design", label: "Design" },
          { id: "analyze", label: "Analyze" },
        ]}
        value={tab}
        onChange={selectTab}
        ariaLabel="Results workspace"
      />

      {/* FLIGHT — the simulated flight and its comparison to the file's own stored numbers. */}
      <div role="tabpanel" id="panel-flight" aria-labelledby="tab-flight" hidden={tab !== "flight"} className="space-y-8">
      {/* With no thrust every flight number is meaningless, so the workspace says what it would hold
          and why it is empty rather than showing a zero-altitude "flight" — or simply vanishing,
          which reads as a feature Loft doesn't have. */}
      {!run.hasPropulsion && (
        <ToolUnavailable
          title="Flight"
          reason={`Flying this design needs a thrust curve, and none of ${
            run.resolutions.length > 1 ? "its motors" : "its motor"
          } could be matched to one — see the notice above. The flight results, plots, flight path and ${toolName} comparison all depend on that thrust, so they are withheld rather than shown as zeros. Swap in a bundled motor under Design and they fill in.`}
        />
      )}
      {run.hasPropulsion && (<>
      {/* Key results */}
      <section aria-label="Results">
        <h2 className="text-lg font-semibold tracking-tight">Flight</h2>
        {baseline && baseline.hasPropulsion && <WhatIfDelta run={run} baseline={baseline} units={units} />}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Apogee" q={d.altitude(s.apogee, units)} accent />
          <Stat label="Max velocity" q={d.speed(s.maxVelocity, units)} sub={d.q(d.mach(s.maxMach))} />
          <Stat label="Max acceleration" q={d.accel(s.maxAcceleration)} />
          <Stat label="Rail-exit velocity" q={d.speed(s.railExitVelocity, units)} />
          <Stat label="Thrust-to-weight" q={d.ratio(s.thrustToWeight)} sub="liftoff" />
          <Stat label="Time to apogee" q={d.seconds(s.timeToApogee)} />
          <Stat label="Burnout velocity" q={d.speed(s.burnoutVelocity, units)} />
          <Stat
            label="Descent rate"
            q={d.speed(s.descentRate, units)}
            sub={s.drogueDescentRate !== undefined ? "under main" : undefined}
          />
          {s.drogueDescentRate !== undefined && (
            <Stat label="Drogue descent" q={d.speed(s.drogueDescentRate, units)} sub="under drogue" />
          )}
          <Stat label="Drift from pad" q={d.distance(s.driftDistance, units)} />
          <Stat label="Ground-hit speed" q={d.speed(s.groundHitVelocity, units)} />
          <Stat label="Landing energy" q={d.energy(s.landingEnergy, units)} sub="whole vehicle" />
          <Stat label="Optimum delay" q={d.seconds(s.optimumDelay)} sub="burnout → apogee" />
          <Stat label="Flight time" q={d.seconds(s.flightTime)} />
          <Stat label="Max dynamic pressure" q={d.dynamicPressure(s.maxDynamicPressure, units)} />
        </div>
        <RecoverySizingHint run={run} units={units} />
        <BoosterDescentNote run={run} units={units} />
      </section>

      {/* Flight path */}
      <section aria-label="Flight path" className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="text-lg font-semibold tracking-tight">Flight path</h2>
        <div className="mt-3">
          <FlightViz result={r} units={units} />
        </div>
      </section>

      {/* Plots */}
      <section aria-label="Plots" className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Plots</h2>
          {/* The raw trajectory, sample by sample, for a spreadsheet or a plot against an altimeter
              log — offered only for a real flight (a design with no resolved motor has none). */}
          {run.hasPropulsion && r.trajectory.length > 0 && (
            <DownloadCsv rows={flightDataCsv(r, units)} name={doc.rocket.name} suffix="flight-data" label="Download flight data" />
          )}
        </div>
        {/* Two-up once the column is wide enough for it: four full-width plots stacked made the
            Flight workspace 4.7 screens tall, and reading altitude against velocity meant
            scrolling between them. */}
        <div className="grid gap-6 xl:grid-cols-2">
        <Plot title={`Altitude (${units === "imperial" ? "ft" : "m"}) vs time`}>
          <LineChart
            series={logSeries ? [altSeries(r, units), logSeries] : [altSeries(r, units)]}
            markers={markers}
            xLabel="time (s)"
            yLabel={units === "imperial" ? "ft" : "m"}
            yZeroFloor
          />
          {run.hasPropulsion && r.trajectory.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              {/* Overlay a real altimeter log beside the prediction — the predict → fly → compare loop.
                  Parsed in the browser; the file is never uploaded. */}
              <label className="print-hide inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300 px-2.5 py-1 font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">
                {log ? "Replace flight log" : "Overlay a flight log"}
                <input
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  aria-label="Flight log CSV"
                  className="sr-only"
                  onChange={(e) => {
                    onLogFile(e.target.files?.[0]);
                    e.target.value = ""; // allow re-selecting the same file after a parse error
                  }}
                />
              </label>
              {log && (
                <>
                  <label className="inline-flex items-center gap-1.5">
                    Log altitude in
                    <select
                      aria-label="Flight log altitude unit"
                      value={log.unit}
                      onChange={(e) => setLog({ ...log, unit: e.target.value as LogUnit })}
                      className="rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value="m">metres</option>
                      <option value="ft">feet</option>
                    </select>
                  </label>
                  <span>· {log.points.length} points</span>
                  <button
                    type="button"
                    onClick={() => {
                      setLog(null);
                      setLogError(null);
                    }}
                    className="underline underline-offset-2 hover:text-zinc-800 dark:hover:text-zinc-100"
                  >
                    Remove
                  </button>
                </>
              )}
              {logError ? (
                <span className="text-red-600 dark:text-red-400">{logError}</span>
              ) : !log ? (
                <span>a CSV with time and altitude columns — its curve overlays here to check against.</span>
              ) : null}
            </div>
          )}
          {logPeak !== null && (
            <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-300">
              Log peak <strong className="tabular-nums">{d.fmt(logPeak, 0)}&nbsp;{altUnit}</strong> · Loft predicted{" "}
              <strong className="tabular-nums">{d.fmt(predApogee, 0)}&nbsp;{altUnit}</strong>
              {peakDeltaPct !== null && Math.abs(peakDeltaPct) >= 0.5 && (
                <>
                  {" "}— the log flew{" "}
                  <strong className="tabular-nums">{d.fmt(Math.abs(peakDeltaPct), 0)}%</strong>{" "}
                  {peakDeltaPct >= 0 ? "higher" : "lower"} than predicted
                </>
              )}
              . Your measurement beside the estimate — not a model-accuracy figure.
            </p>
          )}
        </Plot>
        <Plot title={`Velocity (${units === "imperial" ? "ft/s" : "m/s"}) vs time`}>
          <LineChart
            series={logSpeedSeries ? [...velSeries(r, units), logSpeedSeries] : velSeries(r, units)}
            markers={markers}
            xLabel="time (s)"
            yLabel={units === "imperial" ? "ft/s" : "m/s"}
          />
          {logSpeedSeries && log?.speed && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              {/* The uploaded log carried a velocity column — overlay it and compare peaks, with its own
                  unit picker (speeds are exported in more units than altitudes). */}
              <label className="inline-flex items-center gap-1.5">
                Log speed in
                <select
                  aria-label="Flight log speed unit"
                  value={log.speed.unit}
                  onChange={(e) =>
                    setLog(log ? { ...log, speed: log.speed ? { ...log.speed, unit: e.target.value as LogSpeedUnit } : null } : null)
                  }
                  className="rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="m/s">m/s</option>
                  <option value="ft/s">ft/s</option>
                  <option value="mph">mph</option>
                  <option value="km/h">km/h</option>
                </select>
              </label>
              {logMaxV !== null && (
                <span className="text-zinc-600 dark:text-zinc-300">
                  Log peak <strong className="tabular-nums">{d.fmt(logMaxV, 0)}&nbsp;{spdUnit}</strong> · Loft predicted{" "}
                  <strong className="tabular-nums">{d.fmt(predMaxV, 0)}&nbsp;{spdUnit}</strong>
                  {vDeltaPct !== null && Math.abs(vDeltaPct) >= 0.5 && (
                    <>
                      {" "}— <strong className="tabular-nums">{d.fmt(Math.abs(vDeltaPct), 0)}%</strong>{" "}
                      {vDeltaPct >= 0 ? "faster" : "slower"}
                    </>
                  )}
                </span>
              )}
            </div>
          )}
        </Plot>
        <Plot title="Acceleration (g) vs time">
          <LineChart series={[accelSeries(r)]} markers={markers} xLabel="time (s)" yLabel="g" />
        </Plot>
        {thrustSeries(run) && (
          <Plot title="Motor thrust (N) vs time">
            <LineChart series={[thrustSeries(run)!]} xLabel="time (s)" yLabel="N" yZeroFloor />
            <MotorStatsCaption run={run} units={units} />
          </Plot>
        )}
        </div>
      </section>

      {run.validation && run.validation.count > 0 && (
        <ValidationPanel
          report={run.validation}
          units={units}
          storedName={doc.simulations[simIndex]?.name}
          toolName={toolName}
          external={doc.simulations[simIndex]?.status === "external"}
          storedStatus={doc.simulations[simIndex]?.status}
        />
      )}

      {/* Per-step cross-check: when the file carries the design tool's own step-by-step flight and
          Loft flew the design as stored (run.validation present ⇒ no what-if edits, not reduced),
          overlay Loft's trajectory and drag against it — an independent per-step oracle beyond the
          summary numbers above. */}
      {run.validation && doc.simulations[simIndex]?.flightData && (
        <DragCrossCheck
          result={r}
          flightData={doc.simulations[simIndex]!.flightData!}
          toolName={toolName}
          storedName={doc.simulations[simIndex]?.name}
          storedStatus={doc.simulations[simIndex]?.status}
          units={units}
        />
      )}

        {/* Why the metric-by-metric stored comparison is withheld for a design Loft flew reduced. */}
        {doc.flownAsReduced && doc.simulations.some((sim) => sim.hasResults) && (
          <section
            aria-label="Comparison withheld"
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200"
          >
            <h2 className="text-base font-semibold tracking-tight">{toolName} comparison withheld</h2>
            <p className="mt-1.5">
              This design contains something Loft flew in simplified form — staging, pods, parallel
              boosters, or a fin type it can&apos;t model (see the warnings above) — so the stored{" "}
              {toolName} results describe a different flight than the one simulated here. Comparing them
              would misstate the engine&apos;s accuracy, so the metric-by-metric comparison is
              withheld — import a design Loft flies complete for a like-for-like check.
            </p>
          </section>
        )}
      </>)}
      </div>

      {/* DESIGN — the rocket itself: its shape (editable on the diagram) and where its mass sits. */}
      <div role="tabpanel" id="panel-design" aria-labelledby="tab-design" hidden={tab !== "design"} className="space-y-8">
        {/* The parsed component tree with each part's dimensions and station — import verification.
            The diagram marks the loaded CG and CP so the stability picture reads off the airframe. */}
        <GeometryInspector
          rocket={shownRocket}
          units={units}
          cg={run.result.cgLoaded}
          cp={run.result.stability.cp}
          marginCal={run.result.staticMarginCal}
          edited={editing}
          motors={shownMotors}
          onEdit={onEditGeometry}
          onSelectFinSet={onSelectFinSet}
          selectedFinSetId={geometry?.finSetId}
        />

        {/* The editing surface, right below the diagram it changes — fly a different motor, add
            nose weight, resize/reshape the airframe. Build and edit are the same surface. */}
        {designEditor}

        {/* Where the dry mass comes from, part by part — transparency into the parsed structure. */}
        <MassBreakdown rocket={doc.rocket} units={units} />
      </div>

      {/* ANALYZE — the heavier, opt-in tools: an independent second solver, and design-space sweeps. */}
      <div role="tabpanel" id="panel-analyze" aria-labelledby="tab-analyze" hidden={tab !== "analyze"} className="space-y-8">
      {/* Three of the four tools are single-stage only — a swept "primary" fin or nose is ambiguous
          once there are several stages, and the second solver flies one stage. Saying so is the
          point: a panel that is simply absent reads as a feature Loft doesn't have. */}
      {staged && (
        <ToolUnavailable
          title="Second solver and design sweeps"
          reason={`This design flies ${doc.rocket.stages.length} stages. The RocketPy cross-check flies a single-stage vehicle, and a motor or parameter sweep needs one unambiguous airframe to vary — with several stages there is no single "the" nose, body or fin set to sweep. The dispersion study below is over the whole flight and does run on a staged design.`}
        />
      )}
      {/* Without a resolved motor there is no flight to analyze, and every tool here is built on one
          — except the motor sweep, which flies the bundled candidates itself and so still answers
          the question this design actually has: which motor to put in it. */}
      {!run.hasPropulsion && (
        <ToolUnavailable
          title={canSweepMotors ? "Second solver, parameter sweep and dispersion study" : "Analysis"}
          reason={`These tools re-fly the design hundreds of times, and this one has no thrust curve to fly on — see the notice above.${
            canSweepMotors
              ? " The motor sweep below is the exception: it flies the bundled substitutes themselves, so it works here and is the fastest way to see what this airframe would do on each of them."
              : " Swap in a bundled motor under Design and they become available."
          }`}
        />
      )}
      {/* An independent second solver on the flyer's own design — RocketPy's flight is single-stage,
          so offer it only for single-stage designs that actually have propulsion.
          Key on the design + configuration + active what-if so any change (config switch, ballast,
          motor swap) remounts the panel to idle instead of leaving a stale RocketPy result on screen. */}
      {!staged && run.hasPropulsion && (
        <RocketpyCrossCheck
          designKey={dkey}
          doc={doc}
          config={run.config}
          simIndex={simIndex}
          units={units}
          ballastKg={ballastKg}
          motorSwap={motorSwap}
          geometry={geometry}
        />
      )}

      {/* Motor sweep: only when there's a real choice (more than one fitting bundled motor) and a
          single-stage vehicle, so each swept flight is a like-for-like whole-rocket comparison.
          Keyed on the design + config + active geometry/ballast what-if so it resets when the design
          the sweep is over changes. */}
      {canSweepMotors && (
        <MotorSweep
          designKey={dkey}
          doc={doc}
          simIndex={simIndex}
          units={units}
          options={swapOptions}
          designMotor={designMotor ?? ""}
          ballastKg={ballastKg}
          geometry={geometry}
        />
      )}

      {/* Parameter sweep: vary one design dimension and plot the response. Single-stage only, so the
          swept "primary" nose/body/fin is unambiguous. Keyed on design + config + active what-ifs so
          it resets when the design the sweep is over changes. */}
      {!staged && run.hasPropulsion && (
        <ParameterSweep
          designKey={dkey}
          doc={doc}
          simIndex={simIndex}
          units={units}
          ballastKg={ballastKg}
          motorSwap={motorSwap}
          geometry={geometry}
        />
      )}

      {/* Monte-Carlo dispersion: fly the design hundreds of times with jittered impulse, rail angle,
          and wind, and show the outcome spread (apogee band + recovery-area radius). Offered for any
          design that develops thrust — including multi-stage — since the dispersion is over the whole
          flight. Keyed on design + config + active what-ifs so it resets when the flown design changes. */}
      {run.hasPropulsion && (
        <MonteCarlo
          designKey={dkey}
          doc={doc}
          simIndex={simIndex}
          units={units}
          ballastKg={ballastKg}
          recoveryCdScale={recoveryCdScale}
          motorSwap={motorSwap}
          geometry={geometry}
        />
      )}

      </div>
    </div>
  );
}

function NoPropulsionNotice({
  run,
  tool,
  swapOptions,
  doc,
}: {
  run: FlightRun;
  tool: string;
  /** Bundled motors of the design's own casing diameter — the substitutes the design tools below
   *  offer. When present, the notice points the flyer at that recovery path rather than dead-ending. */
  swapOptions?: { designation: string; manufacturer: string; diameter: number; motorClass: string }[];
  doc: OrkDocument;
}) {
  const unresolved = run.resolutions.filter((res) => !res.match);
  const hasInstances = run.resolutions.length > 0;
  // Same-casing substitutes exist — the "Swap motor" picker in the design tools below can fly the
  // design on a bundled curve of the right diameter, turning a dead-end into a two-click recovery.
  // Gated at >1 to match that picker's own visibility, so the notice never points at an absent one.
  const canSubstitute = !!swapOptions && swapOptions.length > 1;
  // The configuration picker only renders when the design stores more than one, so a design with a
  // single stored configuration has nothing to pick — offering that as the way out sends the flyer
  // hunting for a control that was never drawn. Gated the same way the picker itself is.
  const canPickConfig = configChoices(doc).length > 1;
  const casingMm = canSubstitute ? Math.round(swapOptions![0].diameter * 1000) : 0;
  return (
    <section
      aria-label="No flight simulated"
      className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-800 dark:text-red-200"
    >
      <h2 className="text-lg font-semibold tracking-tight">No flight simulated</h2>
      {hasInstances ? (
        <>
          {/* Each branch carries its own negation. Sharing the clause "could be matched" only reads
              correctly after "None of …": the singular subject took it verbatim and said "This
              configuration's motor could be matched to a thrust curve … so there is no thrust to
              fly" — the opposite of what happened, contradicting itself in the same sentence, on the
              panel whose whole job is to explain why there is no flight. */}
          <p className="mt-2 text-sm">
            {unresolved.length > 1
              ? "None of this configuration's motors could be matched"
              : "This configuration's motor could not be matched"}{" "}
            to a thrust curve in the bundled database, so there is no thrust to fly. Rather than show
            a misleading zero-altitude &ldquo;flight,&rdquo; the flight results, plots, and {tool}{" "}
            comparison are withheld.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {unresolved.map((res, i) => (
              <li key={i} className="font-mono">
                {res.manufacturer ? `${res.manufacturer} ` : ""}
                {res.designation} — not found
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-sm">
          This configuration has no motor assigned, so there is no thrust to fly. The flight
          results and plots are withheld.
        </p>
      )}
      {canSubstitute && (
        <p className="mt-3 text-sm">
          <strong>Fly it with a substitute.</strong> The bundled set has {swapOptions!.length} motors
          of the same {casingMm} mm casing. Pick one under <em>Swap motor</em> in the design tools
          below and the flight re-flies with it — a quick way to get a ballpark while you track down
          the exact curve.
        </p>
      )}
      <p className="mt-3 text-sm">
        The bundled database is a curated subset of ThrustCurve.org, not the full catalogue — see
        the{" "}
        <Link href="/docs/methods" className="underline underline-offset-2">
          motor model in Methods
        </Link>{" "}
        and the{" "}
        <Link href="/docs/limitations" className="underline underline-offset-2">
          limitations log
        </Link>
        . Check the designation
        {!canSubstitute && canPickConfig ? ", or pick a configuration whose motor is in the set" : ""}. The rocket
        geometry and stability below are computed independently and remain valid.
      </p>
    </section>
  );
}

/** Where the design fields are, named once. Every design reaches the Design workspace now — a
 *  design with no flight included — so advice can point at one place instead of guessing which
 *  layout the flyer is looking at. */
const EDIT_POINTER = "in the Design workspace";
/** The same place named as a noun rather than as a verb adjunct — "the Design workspace's fin
 *  fields describe…" rather than a bare "the fin fields". */
const FIN_FIELDS_NOUN = "The Design workspace's fin fields";

function RocketSummary({
  run,
  doc,
  units,
  geometry,
}: {
  run: FlightRun;
  doc: OrkDocument;
  units: UnitSystem;
  geometry?: GeometryEdits;
}) {
  const r = run.result;
  const length = overallLength(doc.rocket);
  const dia = r.stability.refRadius * 2;
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{doc.rocket.name}</h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {formatLabel(doc)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {run.resolutions.map((res, i) => (
          <span
            key={i}
            className={
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs " +
              (res.match
                ? res.match.quality === "exact"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300")
            }
            title={
              res.match
                ? `Matched ${res.match.entry.designation} (${res.match.quality})${res.count > 1 ? ` — cluster of ${res.count}` : ""}`
                : "No thrust curve found"
            }
          >
            {res.count > 1 ? `${res.count}× ` : ""}
            {res.designation}
            {res.match && res.match.quality !== "exact" ? ` → ${res.match.entry.designation}` : ""}
            {!res.match ? " · not found" : res.match.quality !== "exact" ? " · approx" : ""}
          </span>
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        {/* Apogee leads the strip so a design edit's headline flight effect is visible from any
            workspace — the editors live on Design, but this summary sits above the tabs. Only with
            propulsion: a design whose motor didn't resolve has no meaningful apogee. */}
        {run.hasPropulsion && <Field term="Apogee" value={d.q(d.altitude(r.summary.apogee, units))} />}
        <Field term="Liftoff mass" value={d.q(d.mass(r.liftoffMass, units))} />
        <Field term="Burnout mass" value={d.q(d.mass(r.burnoutMass, units))} />
        <Field term="Length" value={d.q(d.lengthMm(length, units))} />
        <Field term="Max diameter" value={d.q(d.lengthMm(dia, units))} />
        <Field term="CG (loaded)" value={d.q(d.lengthMm(r.cgLoaded, units))} />
        <Field term="CP" value={d.q(d.lengthMm(r.stability.cp, units))} />
        <Field
          term="Static margin"
          value={d.q(d.calibers(r.staticMarginCal))}
          hint={r.staticMarginCal < 1 ? "low" : r.staticMarginCal > 3 ? "high" : undefined}
          hintWhy={
            r.staticMarginCal < 1
              ? "under 1 caliber: the centre of pressure is close enough to the centre of gravity that the rocket may not hold a straight course off the rail"
              : r.staticMarginCal > 3
                ? "over 3 calibers: strongly over-stable, so the rocket weathercocks hard into wind and loses altitude and downrange predictability"
                : undefined
          }
        />
        <Field term="CNα" value={d.fmt(r.stability.cnAlpha, 2) + " /rad"} />
        {r.flutter && (
          <Field
            term="Fin flutter (est.)"
            value={d.q(d.speed(r.flutter.worst.flutterVelocity, units))}
            hint={r.flutter.worst.margin < RECOMMENDED_FLUTTER_MARGIN ? "thin" : undefined}
            hintWhy={`the estimated flutter speed is under ${RECOMMENDED_FLUTTER_MARGIN}× the peak airspeed, the margin the method's own spread calls for`}
            sub={`${d.flutterMargin(r.flutter.worst.margin)} margin`}
          />
        )}
      </dl>

      <StabilityTrimHint run={run} doc={doc} units={units} />
      <FlutterFixHint run={run} doc={doc} units={units} geometry={geometry} />
    </section>
  );
}

/** When the fin-flutter margin is thin, say plainly how thick the fins would need to be to reach a
 *  healthy margin — the number behind the "thicken the fins" caution, so it's actionable rather than
 *  a vague direction. Completes the actionable-safety trio (stability trim, recovery sizing, this).
 *  Closed-form (lib/sim/flutter.ts) and conservative (errs slightly thick). */
function FlutterFixHint({
  run,
  doc,
  units,
  geometry,
}: {
  run: FlightRun;
  doc: OrkDocument;
  units: UnitSystem;
  /** The active what-ifs, for the fin SELECTION only: whether this hint's set is reachable depends
   *  on which set the fields are currently pointed at, so the claim and the fields have to resolve
   *  it the same way. */
  geometry?: GeometryEdits;
}) {
  const f = run.result.flutter;
  if (!f || !Number.isFinite(f.worst.margin) || f.worst.margin >= RECOMMENDED_FLUTTER_MARGIN) return null;
  if (!(f.worst.thickness > 0)) return null;
  const tFix = thicknessForFlutterMargin(f.worst.thickness, f.worst.margin, RECOMMENDED_FLUTTER_MARGIN);
  if (!(tFix > f.worst.thickness)) return null;
  // The fin what-ifs address one fin group, which need not be the worst-margin set. Across the
  // corpus this hint fires on 60 flights and 16 of them name a set the fields cannot reach — and
  // those are the worst margins in the set (0.08x, 0.21x, 0.29x). Telling a flyer to thicken fins
  // the panel will not touch is worse than saying nothing, on a warning that is safety-relevant.
  const editable = primaryFinGroupIds(doc.rocket, geometry?.finSetId).has(f.worst.finId);

  return (
    <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="font-medium text-zinc-600 dark:text-zinc-300">Fin-flutter fix:</span>{" "}
      thickening the {f.worst.finName} from {d.q(d.lengthMm(f.worst.thickness, units))} to about{" "}
      {d.q(d.lengthMm(tFix, units))} would lift the flutter margin to{" "}
      {d.flutterMargin(RECOMMENDED_FLUTTER_MARGIN)} (from {d.flutterMargin(f.worst.margin)}). Shortening
      the span or a stiffer material does the same.{" "}
      {editable ? (
        <>Set the fin thickness {EDIT_POINTER} to check the apogee cost.</>
      ) : (
        <>
          {/* The explicit space is load-bearing: JSX drops a plain space between an expression and
              the text that follows it across a line break, which shipped "fin fieldsdescribe". */}
          {FIN_FIELDS_NOUN}{" "}
          describe a different fin set on this design, so they can&apos;t make this change — it has to
          go back to the design file.
        </>
      )}
    </p>
  );
}

/** When the static margin is off a healthy value, say plainly how to trim it: how much nose ballast
 *  would lift a thin margin (or that ballast alone can't, when the fins are too small or too far
 *  forward), and — as the weight-free companion — how far to slide the fin group. Moving the fins is
 *  the *only* lever that can bring down an over-stable, weathercock-prone margin, which nose ballast
 *  cannot. Closed-form goal-seeks (lib/sim/trim.ts), the inverse of the ballast and fin-position
 *  sweeps: the sweeps plot the whole curve, these answer the one question a flyer actually asks. */
function StabilityTrimHint({
  run,
  doc,
  units,
}: {
  run: FlightRun;
  doc: OrkDocument;
  units: UnitSystem;
}) {
  const r = run.result;
  const refD = r.stability.refRadius * 2;
  const trim = marginTrim(
    {
      cp: r.stability.cp,
      cgLoaded: r.cgLoaded,
      loadedMass: r.liftoffMass,
      refDiameter: refD,
      noseStation: noseBallastStation(doc.rocket),
    },
    TRIM_TARGET_CAL,
  );
  // A degenerate airframe (no resolvable diameter) has no meaningful margin to trim — say nothing.
  if (!(r.stability.refRadius > 0) || !Number.isFinite(trim.currentMarginCal)) return null;

  const box = "mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400";
  const label = <span className="font-medium text-zinc-600 dark:text-zinc-300">Stability trim:</span>;

  // Thin margin: name the nose ballast, and the weight-free fin-aft move that reaches the same target.
  if (!trim.alreadyMet) {
    const fin = finStationTrim(doc.rocket, trim.currentMarginCal, r.liftoffMass, refD, TRIM_TARGET_CAL);
    const finAft =
      fin && fin.feasible && fin.shiftM > 0 ? (
        <> Or move the fin set about {d.q(d.lengthMm(fin.shiftM, units))} aft — weight-free — for the same margin.</>
      ) : null;
    return (
      <p className={box}>
        {trim.feasible ? (
          <>
            {label} adding about {d.q(d.mass(trim.ballastKg, units))} of nose ballast would bring the
            static margin to {d.fmt(TRIM_TARGET_CAL, 1)} cal (from {d.fmt(trim.currentMarginCal, 2)} cal).
            Nose weight trades a little apogee for stability — set it {EDIT_POINTER} to see
            the cost.
          </>
        ) : (
          <>
            {label} nose ballast alone tops out near {d.fmt(trim.maxMarginCal, 2)} cal — short of{" "}
            {d.fmt(TRIM_TARGET_CAL, 1)} cal — so no amount of nose weight makes this design comfortably
            stable. Enlarge the fins to reach it.
          </>
        )}
        {finAft}
      </p>
    );
  }

  // Over-stable: the one case nose ballast can't fix — name the fin-forward move that eases it.
  if (trim.currentMarginCal > OVER_STABLE_CAL) {
    const fin = finStationTrim(doc.rocket, trim.currentMarginCal, r.liftoffMass, refD, OVER_STABLE_TARGET_CAL);
    if (fin && fin.feasible && fin.shiftM < 0) {
      return (
        <p className={box}>
          {label} at {d.fmt(trim.currentMarginCal, 2)} cal this is over-stable and can weathercock
          strongly into wind. Moving the fin set about {d.q(d.lengthMm(-fin.shiftM, units))} forward
          would ease the margin to about {d.fmt(OVER_STABLE_TARGET_CAL, 1)} cal — a weight-free trim
          (nose ballast only adds stability, never sheds it). Set the fin position{" "}
          {EDIT_POINTER} to check.
        </p>
      );
    }
  }
  return null;
}

/** When the design lands firm or hard under its recovery, say plainly how big a canopy would bring
 *  it down to a gentle speed — the recovery-side goal-seek (lib/sim/recovery.ts), the companion to
 *  the stability trim. Tied to the hard-landing warning: it appears exactly when that fix is the
 *  actionable one, so it doesn't clutter a design that already lands softly. */
function RecoverySizingHint({ run, units }: { run: FlightRun; units: UnitSystem }) {
  const r = run.result;
  // Only for an actual too-fast-under-canopy landing — the case the hard-landing warning flags.
  // A ballistic descent (nothing opened) is a timing problem, not a sizing one, and is warned
  // separately; skip it here (its ground-hit speed is far higher than any canopy landing).
  const firmLanding = r.warnings.some((w) => w.code === "hard-landing");
  if (!firmLanding) return null;

  const refArea = Math.PI * r.stability.refRadius * r.stability.refRadius;
  const sizing = recoverySizing(
    { descentMass: r.burnoutMass, refArea, airDensity: r.descentAirDensity },
    SOFT_LANDING_TARGET,
  );
  if (!(sizing.cdA > 0) || !Number.isFinite(sizing.diameter)) return null;

  return (
    <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="font-medium text-zinc-600 dark:text-zinc-300">Recovery sizing:</span> to land
      at about {d.q(d.speed(SOFT_LANDING_TARGET, units))} instead, the main needs a drag area of
      roughly {d.fmt(sizing.cdA, 2)} m² Cd·A — about a {d.q(d.lengthMm(sizing.diameter, units))}{" "}
      canopy at Cd {d.fmt(sizing.cd, 1)}. A bigger canopy lands softer (and drifts farther).
    </p>
  );
}

/** A staged flight only flies the top stage to the ground; a separated lower stage that carries its
 *  own recovery still lands somewhere. Report each such booster's estimated terminal descent so the
 *  flyer plans for it. (An un-recovered booster is flagged ballistic by a warning instead.) */
function BoosterDescentNote({ run, units }: { run: FlightRun; units: UnitSystem }) {
  const boosters = run.result.boosterDescents;
  if (!boosters.length) return null;
  return (
    <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="font-medium text-zinc-600 dark:text-zinc-300">Separated booster recovery:</span>{" "}
      {boosters.map((b, i) => (
        <span key={b.name}>
          {i > 0 ? "; " : ""}the {b.name} ({d.q(d.mass(b.mass, units))}) comes down at about{" "}
          {d.q(d.speed(b.terminalSpeed, units))} ({d.q(d.energy(b.landingEnergy, units))}) under its own canopy
        </span>
      ))}
      . Only the top stage is flown to the ground, so this is a terminal-velocity estimate for the
      booster&apos;s own landing — plan its recovery area separately.
    </p>
  );
}

function Field({
  term,
  value,
  hint,
  hintWhy,
  sub,
}: {
  term: string;
  value: string;
  hint?: string;
  /** What the flag means and why it matters — a badge reading "HIGH" beside a number is a verdict
   *  with no reasoning attached, which is the one thing this tool is not supposed to hand out. */
  hintWhy?: string;
  sub?: string;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{term}</dt>
      <dd className="font-mono text-sm tabular-nums text-zinc-800 dark:text-zinc-200">
        {value}
        {hint && (
          <abbr
            title={hintWhy}
            aria-label={hintWhy ? `${hint} — ${hintWhy}` : hint}
            className="ml-1 text-[10px] uppercase text-amber-700 no-underline dark:text-amber-400"
          >
            {hint}
          </abbr>
        )}
        {sub && <div className="text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">{sub}</div>}
      </dd>
    </div>
  );
}

function Stat({ label, q, sub, accent }: { label: string; q: d.Quantity; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className={"mt-1 font-mono tabular-nums " + (accent ? "text-2xl text-indigo-600 dark:text-indigo-400" : "text-xl text-zinc-900 dark:text-zinc-100")}>
        {q.value}
        <span className="ml-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">{q.unit}</span>
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{sub}</div>}
    </div>
  );
}

/** A compact "what-if vs design" readout: after the flyer applies a design what-if (nose ballast
 *  or a motor swap), the results change but the original numbers are gone. This shows, for the key
 *  flight metrics, the design's own figure → the what-if figure and the signed change — so the
 *  effect of the change is legible at a glance instead of remembered. Both runs share identical
 *  launch conditions, so every delta is the design change alone. Directions are shown by sign, not
 *  colour: a lower apogee from added ballast isn't "bad", it's the trade the flyer is weighing. */
function WhatIfDelta({ run, baseline, units }: { run: FlightRun; baseline: FlightRun; units: UnitSystem }) {
  const cur = run.result.summary;
  const base = baseline.result.summary;

  // Name the motor change when the swap flew a different motor than the design's own. Designation
  // comes from the resolutions, so it's correct regardless of any mass difference between motors.
  const curMotor = run.resolutions.find((x) => x.match)?.match?.entry.designation;
  const baseMotor = baseline.resolutions.find((x) => x.match)?.match?.entry.designation;
  const motorNote = curMotor && baseMotor && curMotor !== baseMotor ? { from: baseMotor, to: curMotor } : null;

  const rows = [
    {
      label: "Apogee",
      base: d.altitude(base.apogee, units),
      cur: d.altitude(cur.apogee, units),
      change: d.changePercent(base.apogee, cur.apogee),
    },
    {
      label: "Max speed",
      base: d.speed(base.maxVelocity, units),
      cur: d.speed(cur.maxVelocity, units),
      change: d.changePercent(base.maxVelocity, cur.maxVelocity),
    },
    {
      label: "Rail exit",
      base: d.speed(base.railExitVelocity, units),
      cur: d.speed(cur.railExitVelocity, units),
      change: d.changePercent(base.railExitVelocity, cur.railExitVelocity),
    },
    {
      label: "Stability",
      base: d.calibers(baseline.result.staticMarginCal),
      cur: d.calibers(run.result.staticMarginCal),
      change: d.changeAbsolute(baseline.result.staticMarginCal, run.result.staticMarginCal, "cal"),
    },
    // Fin-flutter margin, when both flights estimate one (a finned design) — so a fin edit shows its
    // effect on the flutter headroom right alongside the stability trade. All three numbers share
    // one precision, and it has to be wide enough for the CHANGE as well as for the two ends: at one
    // decimal 1.44 → 1.46 reads "1.4 → 1.5" with a change of "0", which is the self-contradiction
    // this row exists to avoid. `fmtSmall` on the ends so a margin below even that precision states
    // a bound rather than a zero.
    ...(run.result.flutter && baseline.result.flutter
      ? (() => {
          const baseMargin = baseline.result.flutter.worst.margin;
          const curMargin = run.result.flutter.worst.margin;
          const dp = Math.max(
            d.decimalsFor(baseMargin, 1),
            d.decimalsFor(curMargin, 1),
            d.decimalsFor(curMargin - baseMargin, 1),
          );
          return [
            {
              label: "Flutter margin",
              base: { value: d.fmtSmall(baseMargin, dp), unit: "×" },
              cur: { value: d.fmtSmall(curMargin, dp), unit: "×" },
              change: d.changeAbsolute(baseMargin, curMargin, "×", dp),
            },
          ];
        })()
      : []),
  ];

  return (
    <div
      role="group"
      aria-label="What-if vs design"
      className="mt-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 dark:bg-indigo-500/10"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-800 dark:text-zinc-100">
          What-if vs design
        </h3>
        {motorNote ? (
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            Flying <span className="font-mono">{motorNote.to}</span> — design flew{" "}
            <span className="font-mono">{motorNote.from}</span>
          </p>
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">vs the design under the same conditions</p>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{row.label}</dt>
            <dd className="mt-0.5 font-mono text-sm tabular-nums text-zinc-700 dark:text-zinc-200">
              {row.base.value} <span aria-hidden>→</span>
              <span className="sr-only"> to </span>{" "}
              <span className="text-zinc-900 dark:text-zinc-100">{row.cur.value}</span>{" "}
              <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">{row.cur.unit}</span>
            </dd>
            <dd className="font-mono text-xs tabular-nums text-indigo-600 dark:text-indigo-400">{row.change.text}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Plot({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</h3>
      <div className="mt-2 overflow-x-auto">{children}</div>
    </div>
  );
}

// --- series builders ---

function altSeries(r: FlightResult, units: UnitSystem): Series {
  const c = units === "imperial" ? 3.28084 : 1;
  return { color: COLORS.altitude, label: "altitude", points: r.trajectory.map((p) => ({ x: p.t, y: p.altitude * c })) };
}
function velSeries(r: FlightResult, units: UnitSystem): Series[] {
  const c = units === "imperial" ? 3.28084 : 1;
  return [
    { color: COLORS.velocity, label: "total speed", points: r.trajectory.map((p) => ({ x: p.t, y: p.velocity * c })) },
    { color: COLORS.vertical, label: "vertical", points: r.trajectory.map((p) => ({ x: p.t, y: p.verticalVelocity * c })) },
  ];
}
function accelSeries(r: FlightResult): Series {
  return { color: COLORS.accel, label: "acceleration", points: r.trajectory.map((p) => ({ x: p.t, y: p.acceleration / 9.80665 })) };
}
function thrustSeries(run: FlightRun): Series | null {
  const res = run.resolutions.find((x) => x.match);
  const m = res?.match?.entry.curve;
  if (!m) return null;
  // A cluster fires N identical motors, so the delivered thrust is N× the single-motor curve.
  const n = Math.max(1, res?.count ?? 1);
  return { color: COLORS.thrust, label: "thrust", points: m.samples.map((p) => ({ x: p.t, y: p.thrust * n })) };
}

/** The key numbers a flyer reads a thrust curve for, under the plot: the delivered total impulse and
 *  its class letter, the peak and average thrust, the burn time, and the loaded propellant mass. All
 *  are the *delivered* figures — scaled by the cluster count, to match the N× curve above — so the
 *  impulse and its class are what the vehicle actually flies (a cluster of three G's reads as an I).
 *  Reads the same primary resolved motor `thrustSeries` plots; renders nothing when none resolved. */
function MotorStatsCaption({ run, units }: { run: FlightRun; units: UnitSystem }) {
  const res = run.resolutions.find((x) => x.match);
  const m = res?.match?.entry.curve;
  if (!m) return null;
  const n = Math.max(1, res?.count ?? 1);
  const totalImpulse = m.totalImpulse * n;
  const propMass = m.propMass * n; // kg
  const propText =
    units === "imperial" ? `${(propMass * 35.274).toFixed(2)} oz` : `${Math.round(propMass * 1000)} g`;
  const delays = m.delaysRaw && m.delaysRaw !== "0" ? m.delaysRaw : null;
  const stat = (label: string, value: string) => (
    <span>
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>{" "}
      <span className="font-medium tabular-nums text-zinc-700 dark:text-zinc-200">{value}</span>
    </span>
  );
  return (
    <figcaption className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
      {n > 1 && stat("cluster", `${n}× ${m.designation}`)}
      {stat("total impulse", `${totalImpulse.toFixed(1)} N·s (${impulseClass(totalImpulse)})`)}
      {stat("peak", `${Math.round(m.maxThrust * n)} N`)}
      {stat("avg", `${Math.round(m.avgThrust * n)} N`)}
      {stat("burn", `${m.burnTime.toFixed(1)} s`)}
      {stat("propellant", propText)}
      {delays && stat("delays", delays)}
    </figcaption>
  );
}

function eventMarkers(r: FlightResult): Marker[] {
  const seen = new Set<string>();
  const out: Marker[] = [];
  for (const e of r.events) {
    const lbl = e.type === "deploy" ? "deploy" : e.type === "rail-exit" ? "rail" : e.type;
    if (["ignition"].includes(e.type)) continue;
    const key = lbl + Math.round(e.time * 10);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x: e.time, label: lbl });
  }
  return out;
}
