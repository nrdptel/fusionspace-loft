"use client";

import { useEffect, useMemo, useState } from "react";
import type { OrkDocument } from "@/lib/ork/import";
import { runFlight, overridesFromStored } from "@/lib/sim/run";
import { linRange, type SweepAxis, type ParamSweepPoint } from "@/lib/sim/sweep";
import { runParameterSweep } from "@/lib/sim/sweep-client";
import { primaryFinSpan, primaryFinThickness, primaryNose, primaryBodyTube, primaryBodyDiameter, type GeometryEdits } from "@/lib/model/edit";
import { mToFt, mToIn, mpsToFtps, kgToG, G_PER_OZ } from "@/lib/units";
import type { CsvCell } from "@/lib/csv";
import LineChart from "./LineChart";
import DownloadCsv from "./DownloadCsv";
import type { UnitSystem } from "@/lib/display";

const round = (n: number, dp: number) => (Number.isFinite(n) ? Math.round(n * 10 ** dp) / 10 ** dp : "");

/** Number of flights across the range — dense enough for a smooth curve, cheap enough to be instant. */
const STEPS = 25;
/** The range spans this fraction of the design's own value to this multiple of it. */
const RANGE_LO = 0.5;
const RANGE_HI = 1.75;

interface AxisDef {
  axis: SweepAxis;
  label: string;
  /** The design's own value for this variable (SI): the geometry dimension, or 0 for ballast. */
  base: number;
  /** The swept range in SI units. */
  lo: number;
  hi: number;
  /** Convert an SI value on this axis to the chosen unit system's number for the x-axis. */
  xToNumber: (v: number, units: UnitSystem) => number;
  xUnit: (units: UnitSystem) => string;
}

interface MetricDef {
  key: "apogee" | "maxVelocity" | "railExitVelocity" | "staticMarginCal" | "flutterMargin";
  label: string;
  /** Convert the SI metric value to the chosen unit system's number for plotting. */
  toNumber: (v: number, units: UnitSystem) => number;
  unit: (units: UnitSystem) => string;
}

const METRICS: MetricDef[] = [
  { key: "apogee", label: "Apogee", toNumber: (v, u) => (u === "imperial" ? mToFt(v) : v), unit: (u) => (u === "imperial" ? "ft" : "m") },
  { key: "maxVelocity", label: "Max velocity", toNumber: (v, u) => (u === "imperial" ? mpsToFtps(v) : v), unit: (u) => (u === "imperial" ? "ft/s" : "m/s") },
  { key: "railExitVelocity", label: "Rail-exit velocity", toNumber: (v, u) => (u === "imperial" ? mpsToFtps(v) : v), unit: (u) => (u === "imperial" ? "ft/s" : "m/s") },
  { key: "staticMarginCal", label: "Static margin", toNumber: (v) => v, unit: () => "cal" },
  // Unitless ratio (flutter speed ÷ peak airspeed); keep ≥ 1.5. Only offered for a finned design.
  { key: "flutterMargin", label: "Fin flutter margin", toNumber: (v) => v, unit: () => "×" },
];

/** The design's small lengths (fin span, tube lengths) read best in mm / in; ballast in g / oz. */
const lengthX = (m: number, units: UnitSystem) => (units === "imperial" ? mToIn(m) : m * 1000);
const lengthUnit = (units: UnitSystem) => (units === "imperial" ? "in" : "mm");
const massX = (kg: number, units: UnitSystem) => (units === "imperial" ? kgToG(kg) / G_PER_OZ : kgToG(kg));
const massUnit = (units: UnitSystem) => (units === "imperial" ? "oz" : "g");

const geometryAxis = (axis: SweepAxis, label: string, base: number): AxisDef => ({
  axis,
  label,
  base,
  lo: base * RANGE_LO,
  hi: base * RANGE_HI,
  xToNumber: lengthX,
  xUnit: lengthUnit,
});

/** Parameter sweep: vary one of the design's dimensions across a range and plot how a chosen flight
 *  metric responds — the response curve behind a single what-if. Reuses the builder's geometry-edit
 *  path, so each point is exactly the flight that dimension would produce; every other active what-if
 *  (ballast, motor swap, the other geometry edits) is held fixed, so the curve isolates one variable.
 *  All flights are ballistic to apogee under the design's stored conditions — the same like-for-like
 *  baseline the motor sweep and RocketPy cross-check use. Runs entirely on the device. */
export default function ParameterSweep({
  doc,
  simIndex,
  units,
  ballastKg,
  motorSwap,
  geometry,
}: {
  doc: OrkDocument;
  simIndex: number;
  units: UnitSystem;
  ballastKg?: number;
  motorSwap?: { manufacturer?: string; designation: string; diameter?: number };
  geometry?: GeometryEdits;
}) {
  // The variables this design can sweep: its geometry (each ranged around its own value) plus nose
  // ballast (0 → a mass-relative max), which any flyable design can take.
  const axes = useMemo<AxisDef[]>(() => {
    const list: AxisDef[] = [];
    const span = primaryFinSpan(doc.rocket);
    if (span && span > 0) list.push(geometryAxis("finSpan", "Fin span", span));
    const thickness = primaryFinThickness(doc.rocket);
    if (thickness && thickness > 0) list.push(geometryAxis("finThickness", "Fin thickness", thickness));
    const nose = primaryNose(doc.rocket)?.length;
    if (nose && nose > 0) list.push(geometryAxis("noseLength", "Nose length", nose));
    const body = primaryBodyTube(doc.rocket)?.length;
    if (body && body > 0) list.push(geometryAxis("bodyLength", "Body length", body));
    const dia = primaryBodyDiameter(doc.rocket);
    if (dia && dia > 0) list.push(geometryAxis("bodyDiameter", "Body diameter", dia));
    // Nose ballast: range 0 → ~40% of the design's liftoff mass, sized from one baseline flight so
    // the trim sweep spans a sensible amount of weight for this particular rocket.
    const sim = doc.simulations[simIndex] ?? doc.simulations[0];
    try {
      const b = runFlight(doc.rocket, {
        configId: sim?.conditions.configId,
        overrides: sim ? overridesFromStored(sim) : undefined,
        ballistic: true,
        motorSwap,
        geometry,
      });
      const m = b.result.liftoffMass;
      if (b.hasPropulsion && Number.isFinite(m) && m > 0) {
        list.push({
          axis: "ballastKg",
          label: "Nose ballast",
          base: 0,
          lo: 0,
          hi: Math.max(0.05, 0.4 * m),
          xToNumber: massX,
          xUnit: massUnit,
        });
      }
    } catch {
      // No ballast axis if the design won't fly a baseline.
    }
    return list;
  }, [doc, simIndex, motorSwap, geometry]);

  // The flutter-margin metric is only meaningful for a design with fins; a finless design drops it.
  const metrics = useMemo(
    () => (primaryFinThickness(doc.rocket) !== undefined ? METRICS : METRICS.filter((m) => m.key !== "flutterMargin")),
    [doc],
  );

  const [open, setOpen] = useState(false);
  const [axisKey, setAxisKey] = useState<SweepAxis>(axes[0]?.axis ?? "finSpan");
  const [metricKey, setMetricKey] = useState<MetricDef["key"]>("apogee");
  const [points, setPoints] = useState<ParamSweepPoint[] | null>(null);
  const [running, setRunning] = useState(false);

  const axisDef = axes.find((a) => a.axis === axisKey) ?? axes[0];
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];

  // Fly the sweep for the selected variable, in the background so the UI stays responsive. Switching
  // the plotted METRIC re-reads these points without re-flying; only changing the variable (or a
  // held-fixed what-if) re-runs the flights. A stale run is abandoned between batches.
  useEffect(() => {
    if (!open || !axisDef) {
      setPoints(null);
      return;
    }
    let live = true;
    setRunning(true);
    const sim = doc.simulations[simIndex] ?? doc.simulations[0];
    const values = linRange(axisDef.lo, axisDef.hi, STEPS);
    runParameterSweep(
      doc.rocket,
      axisDef.axis,
      values,
      {
        configId: sim?.conditions.configId,
        overrides: sim ? overridesFromStored(sim) : undefined,
        ballastKg,
        motorSwap,
        baseGeometry: geometry,
      },
      () => !live,
    ).then((pts) => {
      if (!live) return;
      setPoints(pts);
      setRunning(false);
    });
    return () => {
      live = false;
    };
  }, [open, doc, simIndex, axisDef, ballastKg, motorSwap, geometry]);

  // A design with no editable dimension (no fins, nose, or body tube) has nothing to sweep.
  if (axes.length === 0) return null;

  return (
    <section
      aria-label="Parameter sweep"
      className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Sweep a parameter</h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">how one dimension changes the flight</span>
      </div>
      <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
        Vary one of the design&apos;s dimensions across a range and see how apogee, speed, stability,
        or fin-flutter margin responds — the response curve behind a single edit, run entirely on your
        device. Every other active what-if is held fixed, so the curve isolates the one variable.
      </p>

      {!open && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            Run parameter sweep
          </button>
        </div>
      )}

      {open && axisDef && (
        <>
          <div className="mt-3 flex flex-wrap gap-3">
            <label className="block">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Variable
              </span>
              <select
                aria-label="Sweep variable"
                value={axisKey}
                onChange={(e) => setAxisKey(e.target.value as SweepAxis)}
                className="mt-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {axes.map((a) => (
                  <option key={a.axis} value={a.axis}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Y-axis
              </span>
              <select
                aria-label="Sweep metric"
                value={metricKey}
                onChange={(e) => setMetricKey(e.target.value as MetricDef["key"])}
                className="mt-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {metrics.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {running || points === null ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300" role="status">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              <span>Flying {STEPS} points…</span>
            </div>
          ) : points.length > 1 ? (
            <SweepChart points={points} axis={axisDef} metric={metric} metrics={metrics} units={units} name={doc.rocket.name} />
          ) : (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              Not enough of the range could be flown to draw a curve.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function SweepChart({
  points,
  axis,
  metric,
  metrics,
  units,
  name,
}: {
  points: ParamSweepPoint[];
  axis: AxisDef;
  metric: MetricDef;
  metrics: MetricDef[];
  units: UnitSystem;
  name: string;
}) {
  // X in this axis's own display units (mm/in for a dimension, g/oz for ballast); Y in the metric's.
  const xUnit = axis.xUnit(units);
  const yUnit = metric.unit(units);
  // The CSV carries every available metric across the swept range, not just the one currently plotted.
  const csv: CsvCell[][] = [
    [`${axis.label} (${xUnit})`, ...metrics.map((m) => `${m.label} (${m.unit(units)})`)],
    ...points.map((p) => [round(axis.xToNumber(p.x, units), 3), ...metrics.map((m) => round(m.toNumber(p[m.key], units), 3))]),
  ];
  const series = [
    {
      color: "#6366f1",
      label: metric.label,
      points: points.map((p) => ({
        x: axis.xToNumber(p.x, units),
        y: metric.toNumber(p[metric.key], units),
      })),
    },
  ];
  const designX = axis.xToNumber(axis.base, units);
  return (
    <div className="mt-3">
      <LineChart
        series={series}
        markers={[{ x: designX, label: "design" }]}
        xLabel={`${axis.label} (${xUnit})`}
        yLabel={`${metric.label}${yUnit ? ` (${yUnit})` : ""}`}
        yZeroFloor={metric.key !== "staticMarginCal"}
      />
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Ballistic ascent to apogee under the design&apos;s stored conditions, {STEPS} flights across
        the range; the marker is the design&apos;s own value (no added ballast for that axis). Each
        variable shifts the centre of pressure and the mass its own way — read these as estimates to
        verify, not a go/no-go.
      </p>
      <div className="mt-2">
        <DownloadCsv rows={csv} name={name} suffix={`sweep-${axis.axis}`} />
      </div>
    </div>
  );
}
