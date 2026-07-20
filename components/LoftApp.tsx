"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import ImportPanel from "./ImportPanel";
import ResultsView from "./ResultsView";
import { Segmented } from "./ui";
import { importDesignFile, importDesign, type OrkDocument } from "@/lib/ork/import";
import { newDesign } from "@/lib/model/starter";
import { exportOrk } from "@/lib/ork/export";
import { runFlight, overridesFromStored, configChoices, type FlightRun, type ConfigChoice } from "@/lib/sim/run";
import {
  primaryFinSpan,
  primaryFinCount,
  primaryFinRootChord,
  primaryFinTipChord,
  primaryFinSweep,
  primaryFinThickness,
  primaryFinCrossSection,
  primaryFinMaterial,
  primaryNose,
  primaryNoseShape,
  primaryBodyTube,
  primaryBodyDiameter,
  primaryFinish,
  SURFACE_FINISHES,
  NOSE_SHAPES,
  FIN_CROSS_SECTIONS,
  FIN_MATERIALS,
  applyGeometryEdits,
  hasGeometryEdits,
} from "@/lib/model/edit";
import type { SurfaceFinish, NoseShape, FinCrossSection } from "@/lib/model/types";
import { allMotors } from "@/lib/motors/db";
import type { ConditionOverrides } from "@/lib/sim/setup";
import { fetchConditions, geocode, type WeatherConditions } from "@/lib/weather";
import { mToFt, ftToM, mpsToMph, mphToMps } from "@/lib/units";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";

/** Friendly labels for the surface-finish picker (smoothest → roughest). */
const FINISH_LABELS: Record<SurfaceFinish, string> = {
  mirror: "Mirror",
  polished: "Polished",
  "smooth-paint": "Smooth paint",
  "regular-paint": "Regular paint",
  unfinished: "Unfinished",
  rough: "Rough",
};

/** Friendly labels for the nose-shape picker. */
const NOSE_SHAPE_LABELS: Record<NoseShape, string> = {
  ogive: "Ogive",
  conical: "Conical",
  ellipsoid: "Ellipsoid",
  parabolic: "Parabolic",
  power: "Power series",
  haack: "Haack (Von Kármán)",
};

/** Friendly labels for the fin edge-profile picker (draggiest → cleanest). */
const FIN_CROSS_SECTION_LABELS: Record<FinCrossSection, string> = {
  square: "Square",
  rounded: "Rounded",
  airfoil: "Airfoil",
};

interface Edits {
  rodLength?: number; // m
  rodAngleDeg?: number;
  windSpeed?: number; // m/s
  launchAltitude?: number; // m
  ballastKg?: number; // "what-if" nose ballast
  recoveryCdScale?: number; // "what-if" scale on deployed recovery drag area
  motorSwap?: { manufacturer?: string; designation: string; diameter?: number }; // "what-if" motor
  finSpan?: number; // builder edit: fin semi-span (m)
  finCount?: number; // builder edit: fins per set
  finRootChord?: number; // builder edit: fin root chord (m, trapezoidal)
  finTipChord?: number; // builder edit: fin tip chord (m, trapezoidal)
  finSweepLength?: number; // builder edit: fin LE sweep (m, trapezoidal)
  finThickness?: number; // builder edit: fin thickness (m, any fin kind)
  finCrossSection?: FinCrossSection; // builder edit: fin edge cross-section (any fin kind)
  finMaterial?: string; // builder edit: fin material key (FIN_MATERIALS) — density + flutter stiffness
  noseLength?: number; // builder edit: nose-cone length (m)
  noseShape?: NoseShape; // builder edit: nose-cone contour
  bodyLength?: number; // builder edit: primary body-tube length (m)
  bodyDiameter?: number; // builder edit: primary body-tube outer diameter (m); scales the airframe
  finish?: SurfaceFinish; // builder edit: whole-airframe surface finish
}

/** Same-diameter bundled motors the design could fly, with the design's own motor as the default.
 *  Built once per design/config so the picker offers a fitting alternative without editing the file. */
interface SwapInfo {
  designMotor: string;
  options: { designation: string; manufacturer: string; diameter: number; motorClass: string }[];
}

export default function LoftApp() {
  const [units, setUnits] = useState<UnitSystem>("metric");
  const [doc, setDoc] = useState<OrkDocument | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [run, setRun] = useState<FlightRun | null>(null);
  const [baseline, setBaseline] = useState<FlightRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState<Edits>({});
  const [weather, setWeather] = useState<WeatherConditions | null>(null);
  const [scenario, setScenario] = useState<"design" | "today">("design");
  const [simIndex, setSimIndex] = useState(0);

  const compute = useCallback(
    (
      document: OrkDocument,
      e: Edits,
      wx: WeatherConditions | null,
      scen: "design" | "today",
      idx: number,
    ): { run: FlightRun; baseline: FlightRun | null } => {
      const stored = document.simulations[idx] ?? document.simulations[0];
      const base: ConditionOverrides = stored ? overridesFromStored(stored) : {};
      const overrides: ConditionOverrides = { ...base };
      if (e.rodLength !== undefined) overrides.rodLength = e.rodLength;
      if (e.rodAngleDeg !== undefined) overrides.rodAngleDeg = e.rodAngleDeg;
      if (e.windSpeed !== undefined) overrides.windSpeed = e.windSpeed;
      if (e.launchAltitude !== undefined) overrides.launchAltitude = e.launchAltitude;
      const usingToday = scen === "today" && wx;
      if (usingToday) {
        overrides.atmosphere = wx.atmosphere;
        overrides.windProfile = wx.windProfile;
        overrides.launchAltitude = wx.elevationMsl;
        overrides.windSpeed = wx.surfaceWindMps;
      }
      const edited = Object.keys(e).length > 0 || scen === "today";
      const configId = stored?.conditions.configId;
      const run = runFlight(document.rocket, {
        configId,
        overrides,
        ballastKg: e.ballastKg,
        recoveryCdScale: e.recoveryCdScale,
        motorSwap: e.motorSwap,
        geometry: {
          finSpan: e.finSpan,
          finCount: e.finCount,
          finRootChord: e.finRootChord,
          finTipChord: e.finTipChord,
          finSweepLength: e.finSweepLength,
          finThickness: e.finThickness,
          finCrossSection: e.finCrossSection,
          finMaterial: e.finMaterial,
          noseLength: e.noseLength,
          noseShape: e.noseShape,
          bodyLength: e.bodyLength,
          bodyDiameter: e.bodyDiameter,
          finish: e.finish,
        },
        // Validate only when flying the design's own stored conditions unchanged, and only when
        // Loft flew the complete design — a simplified vehicle (staging/pods/parallel/cluster)
        // wouldn't match the stored results, so the comparison would be misleading. Any edit —
        // including "what-if" ballast — makes the flight hypothetical, so the stored comparison
        // is withheld.
        validateAgainst: edited || document.flownAsReduced ? undefined : stored,
      });
      // A *design* what-if (nose ballast, a motor swap, or a geometry edit like fin span) changes
      // the rocket itself. Fly the same design WITHOUT that change under the very same conditions,
      // so the results can show what the change bought — apogee, speed, and stability deltas —
      // instead of numbers in isolation. Condition edits alone (rod, wind, weather) don't alter the
      // design, so they get no baseline.
      const hasWhatIf =
        e.ballastKg !== undefined ||
        e.motorSwap !== undefined ||
        e.finSpan !== undefined ||
        e.finCount !== undefined ||
        e.finRootChord !== undefined ||
        e.finTipChord !== undefined ||
        e.finSweepLength !== undefined ||
        e.finThickness !== undefined ||
        e.finCrossSection !== undefined ||
        e.finMaterial !== undefined ||
        e.noseLength !== undefined ||
        e.noseShape !== undefined ||
        e.bodyLength !== undefined ||
        e.bodyDiameter !== undefined ||
        e.finish !== undefined;
      const baseline = hasWhatIf ? runFlight(document.rocket, { configId, overrides }) : null;
      return { run, baseline };
    },
    [],
  );

  const loadDoc = useCallback(
    (document: OrkDocument, name: string) => {
      setDoc(document);
      setFileName(name);
      setEdits({});
      setWeather(null);
      setScenario("design");
      setSimIndex(0);
      setError(null);
      try {
        const { run: r, baseline: b } = compute(document, {}, null, "design", 0);
        setRun(r);
        setBaseline(b);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not simulate this design.");
        setRun(null);
        setBaseline(null);
      }
    },
    [compute],
  );

  const onFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const document = await importDesignFile(file);
        loadDoc(document, file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not read that file.");
        setDoc(null);
        setRun(null);
      } finally {
        setBusy(false);
      }
    },
    [loadDoc],
  );

  const onSample = useCallback(
    async (path: string, label: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(path);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const document = await importDesign(bytes);
        loadDoc(document, label);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load the sample.");
      } finally {
        setBusy(false);
      }
    },
    [loadDoc],
  );

  // Start a fresh design from scratch — the builder path. A starter model (not parsed from any
  // file) enters the exact same pipeline an import does, so every edit, sweep, and flight works on
  // it immediately; the flyer tweaks a real, stable flight rather than staring at a blank slate.
  const onNew = useCallback(() => loadDoc(newDesign(), "New design"), [loadDoc]);

  // Rename the current design. The name is pure metadata — it doesn't touch the airframe or the
  // flight — so this updates the document in place without re-flying. It flows to the results title,
  // the Download .ork filename, and the saved file's own <name>, so a built design can be given a
  // real name before it's saved or re-opened.
  const renameDesign = useCallback((name: string) => {
    setDoc((prev) => (prev ? { ...prev, rocket: { ...prev.rocket, name } } : prev));
  }, []);

  // Save the current design — built, edited, or imported — as an OpenRocket .ork, entirely in the
  // browser. It re-opens in Loft and, using OpenRocket's own format, in OpenRocket; so a design is
  // durable and portable rather than lost on refresh. Any active what-if edits are baked in.
  const downloadOrk = useCallback(() => {
    if (!doc) return;
    // Bake in the builder's structural (geometry) edits so the saved airframe matches what's shown.
    // Transient flight what-ifs (ballast, motor swap, recovery scale, launch conditions) are not
    // part of the design and are left out.
    const geometry = {
      finSpan: edits.finSpan,
      finCount: edits.finCount,
      finRootChord: edits.finRootChord,
      finTipChord: edits.finTipChord,
      finSweepLength: edits.finSweepLength,
      finThickness: edits.finThickness,
      finCrossSection: edits.finCrossSection,
      finMaterial: edits.finMaterial,
      noseLength: edits.noseLength,
      noseShape: edits.noseShape,
      bodyLength: edits.bodyLength,
      bodyDiameter: edits.bodyDiameter,
      finish: edits.finish,
    };
    const rocket = hasGeometryEdits(geometry) ? applyGeometryEdits(doc.rocket, geometry) : doc.rocket;
    const bytes = exportOrk({ ...doc, rocket });
    const base =
      (rocket.name || fileName || "design").replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-") || "design";
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}.ork`;
    a.click();
    URL.revokeObjectURL(url);
  }, [doc, edits, fileName]);

  const rerun = useCallback(
    (e: Edits, wx: WeatherConditions | null, scen: "design" | "today") => {
      if (!doc) return;
      try {
        const { run: r, baseline: b } = compute(doc, e, wx, scen, simIndex);
        setRun(r);
        setBaseline(b);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not simulate.");
      }
    },
    [doc, compute, simIndex],
  );

  const applyEdit = (patch: Edits) => {
    const next = { ...edits, ...patch };
    setEdits(next);
    rerun(next, weather, scenario);
  };

  const selectConfig = (idx: number) => {
    setSimIndex(idx);
    if (!doc) return;
    try {
      const { run: r, baseline: b } = compute(doc, edits, weather, scenario, idx);
      setRun(r);
      setBaseline(b);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not simulate.");
    }
  };

  const reset = () => {
    setDoc(null);
    setRun(null);
    setBaseline(null);
    setError(null);
    setFileName("");
    setEdits({});
    setWeather(null);
    setScenario("design");
    setSimIndex(0);
  };

  const choices = doc ? configChoices(doc) : [];

  // Bundled motors of the same casing diameter as the design's own — the fitting swaps the picker
  // offers. Recomputed only when the design or its selected configuration changes.
  const swapInfo = useMemo<SwapInfo | null>(() => {
    if (!doc) return null;
    const sim = doc.simulations[simIndex] ?? doc.simulations[0];
    const motor = doc.rocket.configurations.find((c) => c.id === sim?.conditions.configId)?.instances[0]?.motor;
    if (!motor?.designation) return null;
    const diaMm = Math.round((motor.diameter ?? 0) * 1000);
    if (!(diaMm > 0)) return null;
    const options = allMotors()
      .filter((m) => Math.round(m.curve.diameterMm) === diaMm)
      .sort((a, b) => a.curve.totalImpulse - b.curve.totalImpulse)
      .map((m) => ({
        designation: m.curve.designation,
        manufacturer: m.curve.manufacturer,
        diameter: m.curve.diameterMm / 1000,
        motorClass: m.curve.motorClass,
      }));
    return { designMotor: motor.designation, options };
  }, [doc, simIndex]);

  // The design's own dimensions, shown as the starting points for the builder edits.
  const designDims = useMemo(
    () =>
      doc
        ? {
            finSpan: primaryFinSpan(doc.rocket),
            finCount: primaryFinCount(doc.rocket),
            finRootChord: primaryFinRootChord(doc.rocket),
            finTipChord: primaryFinTipChord(doc.rocket),
            finSweepLength: primaryFinSweep(doc.rocket),
            finThickness: primaryFinThickness(doc.rocket),
            finCrossSection: primaryFinCrossSection(doc.rocket),
            finMaterial: primaryFinMaterial(doc.rocket),
            noseLength: primaryNose(doc.rocket)?.length,
            noseShape: primaryNoseShape(doc.rocket),
            bodyLength: primaryBodyTube(doc.rocket)?.length,
            bodyDiameter: primaryBodyDiameter(doc.rocket),
            finish: primaryFinish(doc.rocket),
          }
        : {
            finSpan: undefined,
            finCount: undefined,
            finRootChord: undefined,
            finTipChord: undefined,
            finSweepLength: undefined,
            finThickness: undefined,
            finCrossSection: undefined,
            finMaterial: undefined,
            noseLength: undefined,
            noseShape: undefined,
            bodyLength: undefined,
            bodyDiameter: undefined,
            finish: undefined,
          },
    [doc],
  );

  return (
    <div className="mt-8">
      {!doc && (
        <>
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Import an OpenRocket <code className="font-mono">.ork</code> or RockSim{" "}
            <code className="font-mono">.rkt</code> design and Loft simulates the flight in your
            browser — apogee, speed, stability, and recovery — and compares against the numbers
            the design tool stored in the file. It runs on a phone, offline once loaded. Results
            are estimates from a model;{" "}
            <Link href="/docs/methods" className="text-indigo-600 underline underline-offset-2 dark:text-indigo-400">
              see how they&apos;re computed
            </Link>{" "}
            and{" "}
            <Link href="/docs/limitations" className="text-indigo-600 underline underline-offset-2 dark:text-indigo-400">
              where the model is weak
            </Link>
            .
          </p>
          <ImportPanel onFile={onFile} onSample={onSample} onNew={onNew} busy={busy} />
        </>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {doc && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 text-sm text-zinc-600 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
              >
                <span aria-hidden>←</span> Import another
              </button>
              <input
                type="text"
                aria-label="Design name"
                value={doc.rocket.name}
                onChange={(e) => renameDesign(e.target.value)}
                placeholder="Design name"
                title="Rename this design — used as the results title and the .ork filename"
                className="min-w-0 max-w-[11rem] rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm font-medium text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              {fileName && fileName !== doc.rocket.name && (
                <span className="hidden truncate text-xs text-zinc-500 dark:text-zinc-400 sm:inline" title={fileName}>
                  {fileName}
                </span>
              )}
              <button
                type="button"
                onClick={downloadOrk}
                title="Save this design as an OpenRocket .ork file"
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:border-indigo-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                Download .ork
              </button>
            </div>
            <Segmented
              value={units}
              onChange={(v) => setUnits(v as UnitSystem)}
              options={[
                { value: "metric", label: "Metric" },
                { value: "imperial", label: "Imperial" },
              ]}
              ariaLabel="Unit system"
              size="sm"
            />
          </div>

          {choices.length > 1 && (
            <ConfigPicker choices={choices} selected={simIndex} onSelect={selectConfig} units={units} />
          )}

          {doc.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              <p className="font-medium">Some parts of this design weren&apos;t fully understood:</p>
              <ul className="mt-1 list-disc pl-5">
                {doc.warnings.slice(0, 6).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <ConditionsControls
            units={units}
            edits={edits}
            onEdit={applyEdit}
            swap={swapInfo}
            designDims={designDims}
            weather={weather}
            scenario={scenario}
            setScenario={(s) => {
              setScenario(s);
              rerun(edits, weather, s);
            }}
            onWeather={(wx) => {
              setWeather(wx);
              setScenario("today");
              rerun(edits, wx, "today");
            }}
            busy={busy}
          />

          {run && (
            <ResultsView
              run={run}
              doc={doc}
              units={units}
              baseline={baseline}
              simIndex={simIndex}
              ballastKg={edits.ballastKg}
              recoveryCdScale={edits.recoveryCdScale}
              motorSwap={edits.motorSwap}
              geometry={{
                finSpan: edits.finSpan,
                finCount: edits.finCount,
                finRootChord: edits.finRootChord,
                finTipChord: edits.finTipChord,
                finSweepLength: edits.finSweepLength,
                finThickness: edits.finThickness,
                finCrossSection: edits.finCrossSection,
                finMaterial: edits.finMaterial,
                noseLength: edits.noseLength,
                noseShape: edits.noseShape,
                bodyLength: edits.bodyLength,
                bodyDiameter: edits.bodyDiameter,
                finish: edits.finish,
              }}
              swapOptions={swapInfo?.options}
              designMotor={swapInfo?.designMotor}
            />
          )}
        </div>
      )}
    </div>
  );
}

// --- motor-configuration picker ------------------------------------------------------

/** When a design carries more than one flight configuration (OpenRocket's stored simulations —
 *  e.g. the same airframe on an H128W and a G40W), let the flyer choose which to simulate. Each
 *  option shows the motor(s) and the apogee OpenRocket stored for it, so motors can be compared. */
function ConfigPicker({
  choices,
  selected,
  onSelect,
  units,
}: {
  choices: ConfigChoice[];
  selected: number;
  onSelect: (simIndex: number) => void;
  units: UnitSystem;
}) {
  const optionLabel = (c: ConfigChoice): string => {
    const motors = c.motors.length ? c.motors.join(" + ") : c.name || "Configuration";
    if (c.storedApogeeM === undefined) return motors;
    const a = d.altitude(c.storedApogeeM, units);
    return `${motors} · ${a.value} ${a.unit}`;
  };
  return (
    <label className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Motor configuration</span>
      <select
        aria-label="Motor configuration"
        value={selected}
        onChange={(e) => onSelect(Number(e.target.value))}
        className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {choices.map((c) => (
          <option key={c.simIndex} value={c.simIndex} title={c.name}>
            {optionLabel(c)}
          </option>
        ))}
      </select>
      <span className="w-full text-xs text-zinc-500 dark:text-zinc-400 sm:w-auto">
        {choices.length} configurations in this design — the apogee shown is OpenRocket&apos;s stored value.
      </span>
    </label>
  );
}

// --- conditions controls (rod / wind / elevation + today's weather) -----------------

function ConditionsControls({
  units,
  edits,
  onEdit,
  swap,
  designDims,
  weather,
  scenario,
  setScenario,
  onWeather,
  busy,
}: {
  units: UnitSystem;
  edits: Edits;
  onEdit: (patch: Edits) => void;
  swap: SwapInfo | null;
  /** The design's own dimensions (m; fin count is a plain number), shown as the builder fields' placeholders. */
  designDims: {
    finSpan?: number;
    finCount?: number;
    finRootChord?: number;
    finTipChord?: number;
    finSweepLength?: number;
    finThickness?: number;
    finCrossSection?: FinCrossSection;
    finMaterial?: string;
    noseLength?: number;
    noseShape?: NoseShape;
    bodyLength?: number;
    bodyDiameter?: number;
    finish?: SurfaceFinish;
  };
  weather: WeatherConditions | null;
  scenario: "design" | "today";
  setScenario: (s: "design" | "today") => void;
  onWeather: (wx: WeatherConditions) => void;
  busy: boolean;
}) {
  const [place, setPlace] = useState("");
  const [wxBusy, setWxBusy] = useState(false);
  const [wxError, setWxError] = useState<string | null>(null);

  const imperial = units === "imperial";
  const lenU = imperial ? "ft" : "m";
  const spdU = imperial ? "mph" : "m/s";
  const toDispLen = (m: number | undefined) => (m === undefined ? "" : imperial ? mToFt(m).toFixed(1) : m.toFixed(1));
  const toDispSpd = (mps: number | undefined) => (mps === undefined ? "" : imperial ? mpsToMph(mps).toFixed(0) : mps.toFixed(1));
  const fromLen = (v: string) => (v === "" ? undefined : imperial ? ftToM(Number(v)) : Number(v));
  const fromSpd = (v: string) => (v === "" ? undefined : imperial ? mphToMps(Number(v)) : Number(v));
  const massU = imperial ? "oz" : "g";
  const toDispMass = (kg: number | undefined) =>
    kg === undefined ? "" : imperial ? (kg * 35.274).toFixed(1) : (kg * 1000).toFixed(0);
  const fromMass = (v: string) =>
    v === "" || Number(v) === 0 ? undefined : imperial ? Number(v) / 35.274 : Number(v) / 1000;
  // Fin span is small, so show it in mm / in.
  const spanU = imperial ? "in" : "mm";
  const toDispSpan = (m: number | undefined) =>
    m === undefined ? "" : imperial ? (m * 39.3701).toFixed(2) : (m * 1000).toFixed(0);
  const fromSpan = (v: string) =>
    v === "" || Number(v) === 0 ? undefined : imperial ? Number(v) / 39.3701 : Number(v) / 1000;
  // Fin thickness is a few mm, where a round millimetre is too coarse — show a decimal.
  const toDispThick = (m: number | undefined) =>
    m === undefined ? "" : imperial ? (m * 39.3701).toFixed(3) : (m * 1000).toFixed(1);

  const findWeather = async () => {
    if (!place.trim()) return;
    setWxBusy(true);
    setWxError(null);
    try {
      const places = await geocode(place);
      if (places.length === 0) {
        setWxError("No matching place found.");
        return;
      }
      const p = places[0];
      const wx = await fetchConditions(p.latitude, p.longitude, [p.name, p.admin1, p.country].filter(Boolean).join(", "));
      onWeather(wx);
    } catch {
      setWxError("Couldn't fetch weather (offline, or the service is down).");
    } finally {
      setWxBusy(false);
    }
  };

  return (
    <details className="group rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40">
      <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        <span>Conditions {scenario === "today" && weather ? "· today" : "· as designed"}</span>
        <span className="text-xs text-zinc-400 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-4 border-t border-zinc-100 px-4 py-4 dark:border-zinc-800">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Num label={`Rail length (${lenU})`} value={toDispLen(edits.rodLength)} placeholder="1.2" onChange={(v) => onEdit({ rodLength: fromLen(v) })} />
          <Num label="Rail angle (°)" value={edits.rodAngleDeg ?? ""} placeholder="0" onChange={(v) => onEdit({ rodAngleDeg: v === "" ? undefined : Number(v) })} />
          <Num label={`Surface wind (${spdU})`} value={toDispSpd(edits.windSpeed)} placeholder="0" onChange={(v) => onEdit({ windSpeed: fromSpd(v) })} disabled={scenario === "today"} />
          <Num label={`Field elev. (${lenU})`} value={toDispLen(edits.launchAltitude)} placeholder="0" onChange={(v) => onEdit({ launchAltitude: fromLen(v) })} disabled={scenario === "today"} />
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Blank fields use the design&apos;s stored launch conditions. Changing any field re-flies
          the design and hides the OpenRocket comparison (the conditions no longer match).
        </p>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Design what-if
          </p>
          {swap && swap.options.length > 1 && (
            <label className="mt-2 block">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Motor
              </span>
              <select
                aria-label="Swap motor"
                value={edits.motorSwap ? `${edits.motorSwap.manufacturer ?? ""}|${edits.motorSwap.designation}` : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  const opt = v ? swap.options.find((o) => `${o.manufacturer}|${o.designation}` === v) : undefined;
                  onEdit({
                    motorSwap: opt
                      ? { manufacturer: opt.manufacturer, designation: opt.designation, diameter: opt.diameter }
                      : undefined,
                  });
                }}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="">Design motor ({swap.designMotor})</option>
                {Object.entries(
                  swap.options.reduce<Record<string, SwapInfo["options"]>>((acc, o) => {
                    (acc[o.motorClass] ??= []).push(o);
                    return acc;
                  }, {}),
                ).map(([cls, opts]) => (
                  <optgroup key={cls} label={`${cls} class`}>
                    {opts.map((o) => (
                      <option key={`${o.manufacturer}|${o.designation}`} value={`${o.manufacturer}|${o.designation}`}>
                        {o.designation} · {o.manufacturer}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Num
              label={`Nose ballast (${massU})`}
              value={toDispMass(edits.ballastKg)}
              placeholder="0"
              onChange={(v) => onEdit({ ballastKg: fromMass(v) })}
            />
            <Num
              label="Recovery size (×)"
              value={edits.recoveryCdScale ?? ""}
              placeholder="1"
              onChange={(v) => {
                const n = v === "" ? undefined : Number(v);
                onEdit({ recoveryCdScale: n !== undefined && n > 0 ? n : undefined });
              }}
            />
            {designDims.finSpan !== undefined && (
              <Num
                label={`Fin span (${spanU})`}
                value={toDispSpan(edits.finSpan)}
                placeholder={toDispSpan(designDims.finSpan)}
                onChange={(v) => onEdit({ finSpan: fromSpan(v) })}
              />
            )}
            {designDims.finCount !== undefined && (
              <Num
                label="Fin count"
                value={edits.finCount ?? ""}
                placeholder={String(designDims.finCount)}
                onChange={(v) => {
                  const n = v === "" ? undefined : Math.round(Number(v));
                  onEdit({ finCount: n !== undefined && n >= 1 ? n : undefined });
                }}
              />
            )}
            {designDims.finRootChord !== undefined && (
              <Num
                label={`Fin root (${spanU})`}
                value={toDispSpan(edits.finRootChord)}
                placeholder={toDispSpan(designDims.finRootChord)}
                onChange={(v) => onEdit({ finRootChord: fromSpan(v) })}
              />
            )}
            {designDims.finTipChord !== undefined && (
              <Num
                label={`Fin tip (${spanU})`}
                value={toDispSpan(edits.finTipChord)}
                placeholder={toDispSpan(designDims.finTipChord)}
                onChange={(v) => onEdit({ finTipChord: fromSpan(v) })}
              />
            )}
            {designDims.finSweepLength !== undefined && (
              <Num
                label={`Fin sweep (${spanU})`}
                value={toDispSpan(edits.finSweepLength)}
                placeholder={toDispSpan(designDims.finSweepLength)}
                onChange={(v) => onEdit({ finSweepLength: fromSpan(v) })}
              />
            )}
            {designDims.finThickness !== undefined && (
              <Num
                label={`Fin thickness (${spanU})`}
                value={toDispThick(edits.finThickness)}
                placeholder={toDispThick(designDims.finThickness)}
                onChange={(v) => onEdit({ finThickness: fromSpan(v) })}
              />
            )}
            {designDims.finCrossSection !== undefined && (
              <label className="block">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Fin edge
                </span>
                <select
                  aria-label="Fin edge cross-section"
                  value={edits.finCrossSection ?? ""}
                  onChange={(e) =>
                    onEdit({ finCrossSection: e.target.value ? (e.target.value as FinCrossSection) : undefined })
                  }
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="">As designed ({FIN_CROSS_SECTION_LABELS[designDims.finCrossSection]})</option>
                  {FIN_CROSS_SECTIONS.map((s) => (
                    <option key={s} value={s}>
                      {FIN_CROSS_SECTION_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {designDims.finCrossSection !== undefined && (
              <label className="block">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Fin material
                </span>
                <select
                  aria-label="Fin material"
                  value={edits.finMaterial ?? ""}
                  onChange={(e) => onEdit({ finMaterial: e.target.value || undefined })}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="">
                    As designed{designDims.finMaterial ? ` (${designDims.finMaterial})` : ""}
                  </option>
                  {FIN_MATERIALS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {designDims.noseLength !== undefined && (
              <Num
                label={`Nose length (${spanU})`}
                value={toDispSpan(edits.noseLength)}
                placeholder={toDispSpan(designDims.noseLength)}
                onChange={(v) => onEdit({ noseLength: fromSpan(v) })}
              />
            )}
            {designDims.noseShape !== undefined && (
              <label className="block">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Nose shape
                </span>
                <select
                  aria-label="Nose shape"
                  value={edits.noseShape ?? ""}
                  onChange={(e) => onEdit({ noseShape: e.target.value ? (e.target.value as NoseShape) : undefined })}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="">As designed ({NOSE_SHAPE_LABELS[designDims.noseShape]})</option>
                  {NOSE_SHAPES.map((s) => (
                    <option key={s} value={s}>
                      {NOSE_SHAPE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {designDims.bodyLength !== undefined && (
              <Num
                label={`Body length (${spanU})`}
                value={toDispSpan(edits.bodyLength)}
                placeholder={toDispSpan(designDims.bodyLength)}
                onChange={(v) => onEdit({ bodyLength: fromSpan(v) })}
              />
            )}
            {designDims.bodyDiameter !== undefined && (
              <Num
                label={`Body diameter (${spanU})`}
                value={toDispSpan(edits.bodyDiameter)}
                placeholder={toDispSpan(designDims.bodyDiameter)}
                onChange={(v) => onEdit({ bodyDiameter: fromSpan(v) })}
              />
            )}
            {designDims.finish !== undefined && (
              <label className="block">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Surface finish
                </span>
                <select
                  aria-label="Surface finish"
                  value={edits.finish ?? ""}
                  onChange={(e) => onEdit({ finish: e.target.value ? (e.target.value as SurfaceFinish) : undefined })}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="">As designed ({FINISH_LABELS[designDims.finish]})</option>
                  {SURFACE_FINISHES.map((f) => (
                    <option key={f} value={f}>
                      {FINISH_LABELS[f]}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Fly a different motor, add nose weight, or resize the fins, nose, or body to trim
            stability, drag, or apogee — a hypothetical change to the design, so the OpenRocket
            comparison is hidden while any is set. The geometry fields start from the design&apos;s
            own dimensions; only motors that fit this airframe&apos;s diameter are offered.
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Re-fly for today&apos;s weather
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Pulls live surface conditions and winds aloft for a launch site (Open-Meteo) so you can
            see how today&apos;s density and wind change apogee and drift. Needs a connection.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="text"
              aria-label="Launch site"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && findWeather()}
              placeholder="Launch site, e.g. Lucerne Valley, CA"
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <button
              type="button"
              onClick={findWeather}
              disabled={wxBusy || busy}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {wxBusy ? "Fetching…" : "Fetch"}
            </button>
            {weather && (
              <Segmented
                value={scenario}
                onChange={(v) => setScenario(v as "design" | "today")}
                options={[
                  { value: "design", label: "As designed" },
                  { value: "today", label: "Today" },
                ]}
                ariaLabel="Weather scenario"
                size="sm"
              />
            )}
          </div>
          {wxError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{wxError}</p>}
          {weather && (
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
              <span className="font-medium">{weather.place}</span> · {weather.tempC.toFixed(0)} °C ·{" "}
              surface wind {toDispSpd(weather.surfaceWindMps)} {spdU} ·{" "}
              {weather.aloft.length} aloft levels · field {toDispLen(weather.elevationMsl)} {lenU}
            </p>
          )}
        </div>
      </div>
    </details>
  );
}

function Num({
  label,
  value,
  placeholder,
  onChange,
  disabled,
}: {
  label: string;
  value: string | number;
  placeholder?: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-sm text-zinc-800 outline-none focus:border-indigo-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
    </label>
  );
}
