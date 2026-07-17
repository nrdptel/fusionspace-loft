"use client";

import Link from "next/link";
import type { FlightRun } from "@/lib/sim/run";
import type { OrkDocument } from "@/lib/ork/import";
import type { FlightResult } from "@/lib/sim/simulate";
import LineChart, { type Series, type Marker } from "./LineChart";
import FlightViz from "./FlightViz";
import ValidationPanel from "./ValidationPanel";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";
import { overallLength } from "@/lib/model/geometry";

const COLORS = {
  altitude: "#6366f1",
  velocity: "#10b981",
  vertical: "#818cf8",
  accel: "#f59e0b",
  mach: "#8b5cf6",
  thrust: "#ef4444",
};

const SEVERITY: Record<string, string> = {
  warning: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  caution: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  info: "border-zinc-400/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
};

/** The design tool an imported document came from, for labelling the stored-results comparison
 *  honestly (a RockSim import isn't an "OpenRocket comparison"). */
function sourceTool(doc: OrkDocument): string {
  return doc.formatVersion.startsWith("RockSim") ? "RockSim" : "OpenRocket";
}

export default function ResultsView({
  run,
  doc,
  units,
}: {
  run: FlightRun;
  doc: OrkDocument;
  units: UnitSystem;
}) {
  const r = run.result;
  const s = r.summary;
  const markers = eventMarkers(r);

  // No propulsion ⇒ the "flight" is a zero-thrust drop and every metric is meaningless. Lead
  // with why, name the motor(s) that didn't resolve, and withhold the misleading numbers,
  // plots, and OpenRocket comparison. The geometry and stability below are motor-independent
  // and stay valid.
  const tool = sourceTool(doc);

  if (!run.hasPropulsion) {
    return (
      <div className="space-y-8">
        <NoPropulsionNotice run={run} tool={tool} />
        <RocketSummary run={run} doc={doc} units={units} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <RocketSummary run={run} doc={doc} units={units} />

      {r.warnings.length > 0 && (
        <ul className="space-y-2">
          {r.warnings.map((w) => (
            <li key={w.code} className={"rounded-lg border px-3 py-2 text-sm " + (SEVERITY[w.severity] ?? SEVERITY.info)}>
              {w.message}
            </li>
          ))}
        </ul>
      )}

      {/* Key results */}
      <section aria-label="Results">
        <h2 className="text-lg font-semibold tracking-tight">Flight</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Apogee" q={d.altitude(s.apogee, units)} accent />
          <Stat label="Max velocity" q={d.speed(s.maxVelocity, units)} sub={d.q(d.mach(s.maxMach))} />
          <Stat label="Max acceleration" q={d.accel(s.maxAcceleration)} />
          <Stat label="Rail-exit velocity" q={d.speed(s.railExitVelocity, units)} />
          <Stat label="Thrust-to-weight" q={d.ratio(s.thrustToWeight)} sub="liftoff" />
          <Stat label="Time to apogee" q={d.seconds(s.timeToApogee)} />
          <Stat label="Burnout velocity" q={d.speed(s.burnoutVelocity, units)} />
          <Stat label="Descent rate" q={d.speed(s.descentRate, units)} />
          <Stat label="Drift from pad" q={d.distance(s.driftDistance, units)} />
          <Stat label="Ground-hit speed" q={d.speed(s.groundHitVelocity, units)} />
          <Stat label="Optimum delay" q={d.seconds(s.optimumDelay)} sub="burnout → apogee" />
          <Stat label="Flight time" q={d.seconds(s.flightTime)} />
          <Stat label="Max dynamic pressure" q={{ value: d.fmt(s.maxDynamicPressure / 1000, 1), unit: "kPa" }} />
        </div>
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
        <h2 className="text-lg font-semibold tracking-tight">Plots</h2>
        <Plot title={`Altitude (${units === "imperial" ? "ft" : "m"}) vs time`}>
          <LineChart
            series={[altSeries(r, units)]}
            markers={markers}
            xLabel="time (s)"
            yLabel={units === "imperial" ? "ft" : "m"}
            yZeroFloor
          />
        </Plot>
        <Plot title={`Velocity (${units === "imperial" ? "ft/s" : "m/s"}) vs time`}>
          <LineChart
            series={velSeries(r, units)}
            markers={markers}
            xLabel="time (s)"
            yLabel={units === "imperial" ? "ft/s" : "m/s"}
          />
        </Plot>
        <Plot title="Acceleration (g) vs time">
          <LineChart series={[accelSeries(r)]} markers={markers} xLabel="time (s)" yLabel="g" />
        </Plot>
        {thrustSeries(run) && (
          <Plot title="Motor thrust (N) vs time">
            <LineChart series={[thrustSeries(run)!]} xLabel="time (s)" yLabel="N" yZeroFloor />
          </Plot>
        )}
      </section>

      {run.validation && run.validation.count > 0 && (
        <ValidationPanel report={run.validation} units={units} storedName={doc.simulations[0]?.name} toolName={tool} />
      )}

      {doc.flownAsReduced && doc.simulations.some((s) => s.hasResults) && (
        <section
          aria-label="Comparison withheld"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200"
        >
          <h2 className="text-base font-semibold tracking-tight">{tool} comparison withheld</h2>
          <p className="mt-1.5">
            This design contains something Loft flew in simplified form — staging, pods, parallel
            boosters, or a fin type it can&apos;t model (see the warnings above) —
            so the stored {tool} results describe a different flight than the one simulated here.
            Comparing them would misstate the engine&apos;s accuracy, so the metric-by-metric
            comparison is withheld — import a design Loft flies complete for a like-for-like check.
          </p>
        </section>
      )}
    </div>
  );
}

function NoPropulsionNotice({ run, tool }: { run: FlightRun; tool: string }) {
  const unresolved = run.resolutions.filter((res) => !res.match);
  const hasInstances = run.resolutions.length > 0;
  return (
    <section
      aria-label="No flight simulated"
      className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-800 dark:text-red-200"
    >
      <h2 className="text-lg font-semibold tracking-tight">No flight simulated</h2>
      {hasInstances ? (
        <>
          <p className="mt-2 text-sm">
            {unresolved.length > 1
              ? "None of this configuration's motors"
              : "This configuration's motor"}{" "}
            could be matched to a thrust curve in the bundled database, so there is no thrust to
            fly. Rather than show a misleading zero-altitude &ldquo;flight,&rdquo; the flight
            results, plots, and {tool} comparison are withheld.
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
        . Check the designation, or pick a configuration whose motor is in the set. The rocket
        geometry and stability below are computed independently and remain valid.
      </p>
    </section>
  );
}

function RocketSummary({ run, doc, units }: { run: FlightRun; doc: OrkDocument; units: UnitSystem }) {
  const r = run.result;
  const length = overallLength(doc.rocket);
  const dia = r.stability.refRadius * 2;
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{doc.rocket.name}</h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {doc.formatVersion === "unknown"
            ? ""
            : doc.formatVersion.startsWith("RockSim")
              ? doc.formatVersion.replace("RockSim ", "RockSim format ")
              : `OpenRocket format ${doc.formatVersion}`}
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
                ? `Matched ${res.match.entry.curve.designation} (${res.match.quality})${res.count > 1 ? ` — cluster of ${res.count}` : ""}`
                : "No thrust curve found"
            }
          >
            {res.count > 1 ? `${res.count}× ` : ""}
            {res.designation}
            {res.match && res.match.quality !== "exact" ? ` → ${res.match.entry.curve.designation}` : ""}
            {!res.match ? " · not found" : res.match.quality !== "exact" ? " · approx" : ""}
          </span>
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
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
        />
        <Field term="CNα" value={d.fmt(r.stability.cnAlpha, 2) + " /rad"} />
      </dl>
    </section>
  );
}

function Field({ term, value, hint }: { term: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{term}</dt>
      <dd className="font-mono text-sm tabular-nums text-zinc-800 dark:text-zinc-200">
        {value}
        {hint && <span className="ml-1 text-[10px] uppercase text-amber-700 dark:text-amber-400">{hint}</span>}
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
