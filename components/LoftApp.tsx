"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import ImportPanel from "./ImportPanel";
import ResultsView from "./ResultsView";
import { Segmented } from "./ui";
import { importOrkFile, importOrk, type OrkDocument } from "@/lib/ork/import";
import { runFlight, overridesFromStored, type FlightRun } from "@/lib/sim/run";
import type { ConditionOverrides } from "@/lib/sim/setup";
import { fetchConditions, geocode, type WeatherConditions } from "@/lib/weather";
import { mToFt, ftToM, mpsToMph, mphToMps } from "@/lib/units";
import type { UnitSystem } from "@/lib/display";

interface Edits {
  rodLength?: number; // m
  rodAngleDeg?: number;
  windSpeed?: number; // m/s
  launchAltitude?: number; // m
}

export default function LoftApp() {
  const [units, setUnits] = useState<UnitSystem>("metric");
  const [doc, setDoc] = useState<OrkDocument | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [run, setRun] = useState<FlightRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState<Edits>({});
  const [weather, setWeather] = useState<WeatherConditions | null>(null);
  const [scenario, setScenario] = useState<"design" | "today">("design");

  const compute = useCallback(
    (document: OrkDocument, e: Edits, wx: WeatherConditions | null, scen: "design" | "today"): FlightRun => {
      const stored = document.simulations[0];
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
      return runFlight(document.rocket, {
        configId: stored?.conditions.configId,
        overrides,
        // Validate only when flying the design's own stored conditions unchanged.
        validateAgainst: edited ? undefined : stored,
      });
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
      setError(null);
      try {
        setRun(compute(document, {}, null, "design"));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not simulate this design.");
        setRun(null);
      }
    },
    [compute],
  );

  const onFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const document = await importOrkFile(file);
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
        const document = await importOrk(bytes);
        loadDoc(document, label);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load the sample.");
      } finally {
        setBusy(false);
      }
    },
    [loadDoc],
  );

  const rerun = useCallback(
    (e: Edits, wx: WeatherConditions | null, scen: "design" | "today") => {
      if (!doc) return;
      try {
        setRun(compute(doc, e, wx, scen));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not simulate.");
      }
    },
    [doc, compute],
  );

  const applyEdit = (patch: Edits) => {
    const next = { ...edits, ...patch };
    setEdits(next);
    rerun(next, weather, scenario);
  };

  const reset = () => {
    setDoc(null);
    setRun(null);
    setError(null);
    setFileName("");
    setEdits({});
    setWeather(null);
    setScenario("design");
  };

  return (
    <div className="mt-8">
      {!doc && (
        <>
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Import an OpenRocket <code className="font-mono">.ork</code> design and Loft simulates
            the flight in your browser — apogee, speed, stability, and recovery — and compares
            against the numbers OpenRocket stored in the file. It runs on a phone, offline once
            loaded. Results are estimates from a model;{" "}
            <Link href="/docs/methods" className="text-indigo-600 underline underline-offset-2 dark:text-indigo-400">
              see how they&apos;re computed
            </Link>{" "}
            and{" "}
            <Link href="/docs/limitations" className="text-indigo-600 underline underline-offset-2 dark:text-indigo-400">
              where the model is weak
            </Link>
            .
          </p>
          <ImportPanel onFile={onFile} onSample={onSample} busy={busy} />
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
              {fileName && (
                <span className="hidden truncate text-xs text-zinc-400 sm:inline" title={fileName}>
                  {fileName}
                </span>
              )}
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

          {run && <ResultsView run={run} doc={doc} units={units} />}
        </div>
      )}
    </div>
  );
}

// --- conditions controls (rod / wind / elevation + today's weather) -----------------

function ConditionsControls({
  units,
  edits,
  onEdit,
  weather,
  scenario,
  setScenario,
  onWeather,
  busy,
}: {
  units: UnitSystem;
  edits: Edits;
  onEdit: (patch: Edits) => void;
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
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
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
      <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</span>
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
