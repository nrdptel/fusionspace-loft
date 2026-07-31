"use client";

import { useEffect, useMemo, useState } from "react";
import { conditionsPhrase, type ConditionsSource } from "@/lib/what-if";
import type { ConditionOverrides } from "@/lib/sim/setup";
import type { OrkDocument } from "@/lib/ork/import";
import { runFlight, overridesFromStored } from "@/lib/sim/run";
import { linRange, SWEEP_AXES, type SweepAxis, type ParamSweepPoint } from "@/lib/sim/sweep";
import { usePersistedChoice, useSettled } from "@/lib/session";
import { runParameterSweep } from "@/lib/sim/sweep-client";
import { AIM_SLOTS, structureOf, primaryFinSpan, primaryFinRootChord, primaryFinTipChord, primaryFinThickness, primaryFinStation, primaryFinChord, primaryNose, primaryBodyTube, primaryBodyDiameter, type GeometryEdits } from "@/lib/model/edit";
import { overallLength } from "@/lib/model/geometry";
import { mToFt, mToIn, mpsToFtps, kgToG, G_PER_OZ } from "@/lib/units";
import type { CsvCell } from "@/lib/csv";
import LineChart from "./LineChart";
import DownloadCsv, { CopyTable } from "./DownloadCsv";
import type { UnitSystem } from "@/lib/display";
import { Button, Card, ClosePanel, useReturnFocus } from "./ui";

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

/** Every metric key the sweep can offer, for validating a remembered choice against a build of Loft
 *  that may have added or dropped one. (The axes' equivalent is SWEEP_AXES, in the sweep module.) */
const ALL_METRIC_KEYS = METRICS.map((m) => m.key) as readonly MetricDef["key"][];

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
 *  All flights are ballistic to apogee under the launch conditions being flown — the design's own
 *  stored setup with the flyer's Conditions edits on top, the same like-for-like baseline the motor
 *  sweep uses. Surface wind is not among them: `runFlight` zeroes it for a ballistic run. Runs entirely on the device. */
export default function ParameterSweep({
  doc,
  simIndex,
  units,
  ballastKg,
  motorSwap,
  geometry,
  designKey,
  flownOverrides,
  weatherSerial,
  conditions,
}: {
  doc: OrkDocument;
  simIndex: number;
  units: UnitSystem;
  ballastKg?: number;
  motorSwap?: { manufacturer?: string; designation: string; diameter?: number };
  geometry?: GeometryEdits;
  /** One string standing for the design being swept. The props above are rebuilt on every render,
   *  so depending on their identity would restart the sweep whenever anything re-renders; this is
   *  their *value*, and it is what decides when the sweep is genuinely out of date. */
  designKey: string;
  /** The launch conditions the flight in view is flown under. This panel flew the design FILE's
   *  setup while inviting a comparison against the flyer's own rail. Surface wind is genuinely a
   *  no-op here — `runFlight` zeroes it for a ballistic run, and the apogee is identical to the
   *  metre at 3 m/s and at 8.94 m/s — but rail length, rail angle and field elevation are not:
   *  measured on the 54 mm sample, a 10 deg rail moves the ballistic apogee 2,941 -> 2,852 m
   *  (-3.0%), a 1,500 m field moves it -> 3,237 m (+10.1%), and shortening the rail 2.0 -> 1.0 m
   *  drops rail-exit velocity 28.2 -> 19.6 m/s, straight through the ~15 m/s rule of thumb this
   *  panel's own caption cites. */
  flownOverrides?: ConditionOverrides;
  /** Bumped once per forecast fetched — the only thing that can tell one forecast's air from the
   *  next, since an atmosphere and a wind profile are functions with no value to compare. */
  weatherSerial?: number;
  /** Where each launch condition came from, so this panel names what IT flew. */
  conditions?: ConditionsSource;
}) {
  // Only the conditions a BALLISTIC ascent actually reads. Wind is excluded on purpose: `runFlight`
  // zeroes it for a ballistic run, so re-flying a whole sweep on a wind edit would throw the work
  // away for a change measured to alter nothing. This is why the sweeps do not simply join the
  // dispersion in watching every condition.
  const o = flownOverrides;
  const ballisticConditionsKeyLive = [o?.rodLength ?? "", o?.rodAngleDeg ?? "", o?.launchAltitude ?? "", o?.atmosphere ? "atm" : "", weatherSerial ?? ""].join("|");
  // Settled, not live. `Num` calls `onChange` on every keystroke so a value can be typed a digit
  // at a time, and each intermediate reading is a distinct key — typing "1500" into the field
  // elevation restarted this panel four times, flying every candidate at 1 m, 15 m and 150 m on the
  // way. The dispersion's own sigma inputs have been debounced for exactly this reason since they
  // were added; the launch conditions reach the same panels through the same kind of field.
  const ballisticConditionsKey = useSettled(ballisticConditionsKeyLive, ballisticConditionsKeyLive);

  // The variables this design can sweep: its geometry (each ranged around its own value) plus nose
  // ballast (0 → a mass-relative max), which any flyable design can take.
  // The design plus the flyer's STRUCTURE. Every axis below is swept as an ABSOLUTE value written
  // through `applyGeometryEdits`, which resolves each aim against the parts the flyer has authored —
  // so the base has to be read off the same tree, or the curve's x-axis is one part's dimension while
  // the flights vary another's. Measured on the starter design with a tube authored behind its own:
  // the Body-length axis was based on the 620.0 mm design tube and spanned 310–1085 mm with the
  // "design's own" marker at 620 mm, while every point resized the 310.0 mm authored tube. The whole
  // plotted curve and its marker described a rocket that was never flown.
  const axisBase = useMemo(
    () => structureOf(doc.rocket, geometry ?? {}),
    // The WHOLE bag, not the structural keys by name. `structureOf` decides which keys are structural,
    // so a dependency list that restates them goes stale the next time one is added — which is exactly
    // what happened to this memo when reordering shipped: measured on the starter with an aft tube
    // moved one place forward, the fin-position base read 0.700 m against the 1.000 m every swept point
    // was written into. 300 mm, on the axis that drives static margin. Depending on the object costs a
    // recompute when an unrelated field changes, and buys immunity to that whole class of defect.
    [doc.rocket, geometry],
  );
  const axes = useMemo<AxisDef[]>(() => {
    const list: AxisDef[] = [];
    // Each axis is swept as an ABSOLUTE value written to the selected fin set, so its base has to
    // be that set's dimension. Reading the frontmost set's span while writing the selected one
    // plotted a curve whose x-axis was not the span of the fin being changed.
    const span = primaryFinSpan(axisBase, geometry?.finSetId);
    if (span && span > 0) list.push(geometryAxis("finSpan", "Fin span", span));
    // The chord axes (trapezoidal fins only) are the fin-area levers a flyer can also drag on the
    // diagram — sweeping them plots the "how big should my fins be?" response. Tip chord can be zero
    // on a delta, which has no range to sweep, so it's offered only when the design carries one.
    const rootChord = primaryFinRootChord(axisBase, geometry?.finSetId);
    if (rootChord && rootChord > 0) list.push(geometryAxis("finRootChord", "Fin root chord", rootChord));
    const tipChord = primaryFinTipChord(axisBase, geometry?.finSetId);
    if (tipChord && tipChord > 0) list.push(geometryAxis("finTipChord", "Fin tip chord", tipChord));
    const thickness = primaryFinThickness(axisBase, geometry?.finSetId);
    if (thickness && thickness > 0) list.push(geometryAxis("finThickness", "Fin thickness", thickness));
    // Fin position: a station, not a size, so it ranges as an absolute band (±35% of the body
    // length) around the design value rather than a percentage. The band is then clamped to keep
    // every swept position buildable — the fin root stays on the airframe, its fore edge behind the
    // nose and its aft (trailing) edge no further back than the tail — so the curve never implies
    // stability you could only get by hanging the fins off the end (for tail-mounted fins that
    // makes it a forward-only sweep, which is the honest range).
    const finStation = primaryFinStation(axisBase, geometry?.finSetId);
    const finChord = primaryFinChord(axisBase, geometry?.finSetId);
    const bodyForStation = primaryBodyTube(axisBase)?.length;
    const airframeLen = overallLength(axisBase);
    const noseLen = primaryNose(axisBase)?.length ?? 0;
    if (finStation && finStation > 0 && bodyForStation && bodyForStation > 0 && finChord && finChord > 0 && airframeLen > 0) {
      const band = 0.35 * bodyForStation;
      const lo = Math.max(0.02, noseLen, finStation - band);
      const hi = Math.min(finStation + band, airframeLen - finChord);
      if (hi > lo) {
        list.push({ axis: "finStation", label: "Fin position", base: finStation, lo, hi, xToNumber: lengthX, xUnit: lengthUnit });
      }
    }
    const nose = primaryNose(axisBase)?.length;
    if (nose && nose > 0) list.push(geometryAxis("noseLength", "Nose length", nose));
    // Both body axes are swept as ABSOLUTE values written to the picked tube, so like the fin axes
    // their base has to be that tube's own dimension — a curve based on the longest tube's length
    // while the sweep resizes a different one has the wrong rocket on its x-axis.
    const body = primaryBodyTube(axisBase, geometry?.bodyTubeId)?.length;
    if (body && body > 0) list.push(geometryAxis("bodyLength", "Body length", body));
    const dia = primaryBodyDiameter(axisBase, geometry?.bodyTubeId);
    if (dia && dia > 0) list.push(geometryAxis("bodyDiameter", "Body diameter", dia));
    // Nose ballast: range 0 → ~40% of the design's liftoff mass, sized from one baseline flight so
    // the trim sweep spans a sensible amount of weight for this particular rocket.
    const sim = doc.simulations[simIndex] ?? doc.simulations[0];
    try {
      const b = runFlight(doc.rocket, {
        configId: sim?.conditions.configId,
        overrides: flownOverrides ?? (sim ? overridesFromStored(sim) : undefined),
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
    // `ballisticConditionsKey` stands in for `flownOverrides`, which is rebuilt on every render — the
    // ballast axis is sized from a baseline FLIGHT, so it has to follow a rail-angle or elevation
    // change, but depending on the object's identity would resize it on every unrelated re-render.
    // Same reasoning as `designKey` below: depend on the value, not the reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, simIndex, motorSwap, geometry, ballisticConditionsKey]);

  // The flutter-margin metric is only meaningful for a design with fins; a finless design drops it.
  // Deliberately NOT asked of the picked set: the question is whether this rocket has fins at all,
  // and every fin set carries a thickness, so routing it through the selection only made the answer
  // look as if it moved with the picker when it cannot. (It also read a value it did not depend on,
  // which is what eslint was pointing at.)
  // It reads the STRUCTURE base rather than the import so a design whose only fin set the flyer built
  // still offers the flutter metric — on a from-scratch design that is the only fin set there is.
  const metrics = useMemo(
    () => (primaryFinThickness(axisBase) !== undefined ? METRICS : METRICS.filter((m) => m.key !== "flutterMargin")),
    [axisBase],
  );

  const [open, setOpen] = useState(false);
  // Closing unmounts the Close button; focus has to land on the Run button that replaces it.
  const [runRef, returnFocusToRun] = useReturnFocus();
  // Which dimension to sweep and what to plot are a view the flyer set up, not a result — so they
  // are remembered. A stored choice this design can't offer (no fins, so no flutter margin; an axis
  // its geometry doesn't have) falls back to the default rather than selecting nothing.
  const [storedAxis, setStoredAxis] = usePersistedChoice<SweepAxis>(
    "sweep.axis",
    axes[0]?.axis ?? "finSpan",
    SWEEP_AXES,
  );
  const [storedMetric, setStoredMetric] = usePersistedChoice<MetricDef["key"]>(
    "sweep.metric",
    "apogee",
    ALL_METRIC_KEYS,
  );
  const axisKey = axes.some((a) => a.axis === storedAxis) ? storedAxis : (axes[0]?.axis ?? "finSpan");
  const metricKey = metrics.some((m) => m.key === storedMetric) ? storedMetric : "apogee";
  const setAxisKey = setStoredAxis;
  const setMetricKey = setStoredMetric;
  const [points, setPoints] = useState<ParamSweepPoint[] | null>(null);
  const [running, setRunning] = useState(false);

  const axisDef = axes.find((a) => a.axis === axisKey) ?? axes[0];
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];
  // Which component the swept axis is aimed at, when it is an aimed one. Read from the edit model's own
  // registry rather than listed here, so an axis that becomes aimed later is covered without a change.
  const axisAimSlot = Object.entries(AIM_SLOTS).find(([, def]) => def.targets.includes(axisKey))?.[0];
  const axisAimId = axisAimSlot
    ? ((geometry as Record<string, unknown> | undefined)?.[axisAimSlot] as string | undefined)
    : undefined;

  // Fly the sweep for the selected variable, in the background so the UI stays responsive. Switching
  // the plotted METRIC re-reads these points without re-flying; only changing the variable (or a
  // held-fixed what-if) re-runs the flights. A stale run is abandoned between batches.
  useEffect(() => {
    if (!open || !axisDef) {
      // `running` resets with the points: it is stale the moment the panel closes, and the reopen
      // renders before this effect runs. See the same branch in MonteCarlo.
      setPoints(null);
      setRunning(false);
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
        overrides: flownOverrides ?? (sim ? overridesFromStored(sim) : undefined),
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
    // Keyed on the design's value, not the props' identity — see `designKey`.
    //
    // `axisAimId` is a dependency in its own right because `designKey` deliberately ignores a bare aim:
    // a pick alone changes no geometry, so a Monte-Carlo already flown still describes the design on
    // screen. But this axis is swept as an ABSOLUTE value written to the aimed part, so moving that pick
    // re-bases the x-axis and the design's own marker — and without this the plotted curve went on
    // describing the part the flyer had aimed away from. Changing the swept
    // axis still re-runs; an unrelated re-render no longer restarts the flights. The axis is named
    // by its KEY and not by `axisDef`: that object is rebuilt from `doc` whenever `doc` changes
    // identity, so depending on it re-flew all 25 points on every keystroke in the rename field —
    // the same defect `designKey` fixes one level up, arriving by a different route. The axis's own
    // bounds move only when the rocket does, which `designKey` already covers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, axisKey, axisAimId, designKey, ballisticConditionsKey]);

  // A design with no editable dimension (no fins, nose, or body tube) has nothing to sweep.
  if (axes.length === 0) return null;

  return (
    <Card as="section" aria-label="Parameter sweep">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-medium tracking-tight">Sweep a parameter</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">how one dimension changes the flight</span>
          {open && <ClosePanel onClose={() => { setOpen(false); returnFocusToRun(); }} what="the parameter sweep" />}
        </div>
      </div>
      <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
        Vary one of the design&apos;s dimensions across a range and see how apogee, speed, stability,
        or fin-flutter margin responds — the response curve behind a single edit, run entirely on your
        device. Every other active what-if is held fixed, so the curve isolates the one variable.
      </p>

      {!open && (
        <div className="mt-3">
          <Button variant="primary" ref={runRef} onClick={() => setOpen(true)}>
            Run parameter sweep
          </Button>
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

          {(running || points === null) && (
            <div className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300" role="status">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              <span>
                Flying {STEPS} points
                {points !== null && points.length > 1
                  ? " again for the edited design — the curve below is the previous run"
                  : "…"}
              </span>
            </div>
          )}
          {/* The previous curve stays while the next one flies, dimmed and announced above as the
              previous design's, so an edit can be read against what it changed. */}
          {points !== null && points.length > 1 && (
            <div aria-busy={running} className={running ? "opacity-50 transition-opacity" : undefined}>
              <SweepChart points={points} axis={axisDef} metric={metric} metrics={metrics} units={units} name={doc.rocket.name} conditions={conditions} />
            </div>
          )}
          {!running && points !== null && points.length <= 1 && (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              Not enough of the range could be flown to draw a curve.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function SweepChart({
  points,
  axis,
  metric,
  metrics,
  units,
  name,
  conditions,
}: {
  points: ParamSweepPoint[];
  axis: AxisDef;
  metric: MetricDef;
  metrics: MetricDef[];
  units: UnitSystem;
  name: string;
  /** Whether the conditions these flights used came from the flyer or from the design file. */
  conditions?: ConditionsSource;
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
        Ballistic ascent to apogee under{" "}
        {/* `{" "}` and not a plain space: a JSX text run that spans a line break loses its LEADING
            whitespace, so `{STEPS} flights` on one line and `the range` on the next shipped as
            "25flights across the range". The space has to survive the transform, not the source. */}
        {conditionsPhrase(conditions, { wind: false })}, {STEPS}{" "}
        flights across the range; the marker is the design&apos;s own value (no added ballast for
        that axis). Each variable shifts the centre of pressure and the mass its own way — read
        these as estimates to verify, not a go/no-go.
      </p>
      <div className="mt-2">
        <DownloadCsv rows={csv} name={name} suffix={`sweep-${axis.axis}`} />
        <CopyTable rows={csv} />
      </div>
    </div>
  );
}
