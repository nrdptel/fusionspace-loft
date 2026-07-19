"use client";

import Link from "next/link";
import type { FlightRun } from "@/lib/sim/run";
import type { GeometryEdits } from "@/lib/model/edit";
import type { OrkDocument } from "@/lib/ork/import";
import type { FlightResult } from "@/lib/sim/simulate";
import { RECOMMENDED_FLUTTER_MARGIN } from "@/lib/sim/flutter";
import LineChart, { type Series, type Marker } from "./LineChart";
import FlightViz from "./FlightViz";
import ValidationPanel from "./ValidationPanel";
import RocketpyCrossCheck from "./RocketpyCrossCheck";
import MotorSweep from "./MotorSweep";
import ParameterSweep from "./ParameterSweep";
import MonteCarlo from "./MonteCarlo";
import MassBreakdown from "./MassBreakdown";
import GeometryInspector from "./GeometryInspector";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";
import { overallLength } from "@/lib/model/geometry";
import { noseBallastStation } from "@/lib/sim/run";
import { marginTrim } from "@/lib/sim/trim";
import { recoverySizing } from "@/lib/sim/recovery";

/** A gentle target landing speed to size recovery toward — the middle of the ~3–6 m/s (10–20 ft/s)
 *  band most designs aim for, the same range the hard-landing warning is written against. */
const SOFT_LANDING_TARGET = 5;

/** A healthy static margin to trim toward — comfortably above the 1-caliber rule of thumb, below
 *  the ~3-caliber point where over-stability starts to weathercock. */
const TRIM_TARGET_CAL = 1.5;

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
  baseline,
  simIndex = 0,
  ballastKg,
  motorSwap,
  geometry,
  swapOptions,
  designMotor,
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
  motorSwap?: { manufacturer?: string; designation: string; diameter?: number };
  geometry?: GeometryEdits;
  /** Bundled motors that fit this airframe's mount, for the motor-sweep comparison. */
  swapOptions?: { designation: string; manufacturer: string; diameter: number; motorClass: string }[];
  /** The design's own motor designation, to mark its row in the sweep. */
  designMotor?: string;
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
        {baseline && baseline.hasPropulsion && <WhatIfDelta run={run} baseline={baseline} units={units} />}
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
        <RecoverySizingHint run={run} units={units} />
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

      {/* Where the dry mass comes from, part by part — transparency into the parsed structure. */}
      <MassBreakdown rocket={doc.rocket} units={units} />

      {/* The parsed component tree with each part's dimensions and station — import verification. */}
      <GeometryInspector rocket={doc.rocket} units={units} />

      {/* An independent second solver on the flyer's own design — RocketPy's flight is single-stage,
          so offer it only for single-stage designs that actually have propulsion (guaranteed here).
          Key on the design + configuration + active what-if so any change (config switch, ballast,
          motor swap) remounts the panel to idle instead of leaving a stale RocketPy result on screen. */}
      {(doc.rocket.stages?.length ?? 1) === 1 && (
        <RocketpyCrossCheck
          key={`${doc.rocket.name}:${run.config.id}:${simIndex}:${ballastKg ?? 0}:${motorSwap?.designation ?? ""}:${geometry?.finSpan ?? 0}:${geometry?.finCount ?? 0}:${geometry?.finRootChord ?? 0}:${geometry?.finTipChord ?? 0}:${geometry?.finSweepLength ?? 0}:${geometry?.finThickness ?? 0}:${geometry?.finCrossSection ?? ""}:${geometry?.finMaterial ?? ""}:${geometry?.noseLength ?? 0}:${geometry?.noseShape ?? ""}:${geometry?.bodyLength ?? 0}:${geometry?.bodyDiameter ?? 0}:${geometry?.finish ?? ""}`}
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
      {(doc.rocket.stages?.length ?? 1) === 1 && swapOptions && swapOptions.length > 1 && (
        <MotorSweep
          key={`${doc.rocket.name}:${simIndex}:${ballastKg ?? 0}:${geometry?.finSpan ?? 0}:${geometry?.finCount ?? 0}:${geometry?.finRootChord ?? 0}:${geometry?.finTipChord ?? 0}:${geometry?.finSweepLength ?? 0}:${geometry?.finThickness ?? 0}:${geometry?.finCrossSection ?? ""}:${geometry?.finMaterial ?? ""}:${geometry?.noseLength ?? 0}:${geometry?.noseShape ?? ""}:${geometry?.bodyLength ?? 0}:${geometry?.bodyDiameter ?? 0}:${geometry?.finish ?? ""}`}
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
      {(doc.rocket.stages?.length ?? 1) === 1 && (
        <ParameterSweep
          key={`${doc.rocket.name}:${simIndex}:${ballastKg ?? 0}:${motorSwap?.designation ?? ""}:${geometry?.finSpan ?? 0}:${geometry?.finCount ?? 0}:${geometry?.finRootChord ?? 0}:${geometry?.finTipChord ?? 0}:${geometry?.finSweepLength ?? 0}:${geometry?.finThickness ?? 0}:${geometry?.finCrossSection ?? ""}:${geometry?.finMaterial ?? ""}:${geometry?.noseLength ?? 0}:${geometry?.noseShape ?? ""}:${geometry?.bodyLength ?? 0}:${geometry?.bodyDiameter ?? 0}:${geometry?.finish ?? ""}`}
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
          key={`${doc.rocket.name}:${simIndex}:${ballastKg ?? 0}:${motorSwap?.designation ?? ""}:${geometry?.finSpan ?? 0}:${geometry?.finCount ?? 0}:${geometry?.finRootChord ?? 0}:${geometry?.finTipChord ?? 0}:${geometry?.finSweepLength ?? 0}:${geometry?.finThickness ?? 0}:${geometry?.finCrossSection ?? ""}:${geometry?.finMaterial ?? ""}:${geometry?.noseLength ?? 0}:${geometry?.noseShape ?? ""}:${geometry?.bodyLength ?? 0}:${geometry?.bodyDiameter ?? 0}:${geometry?.finish ?? ""}`}
          doc={doc}
          simIndex={simIndex}
          units={units}
          ballastKg={ballastKg}
          motorSwap={motorSwap}
          geometry={geometry}
        />
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
        {r.flutter && (
          <Field
            term="Fin flutter (est.)"
            value={d.q(d.speed(r.flutter.worst.flutterVelocity, units))}
            hint={r.flutter.worst.margin < RECOMMENDED_FLUTTER_MARGIN ? "thin" : undefined}
            sub={`${d.fmt(r.flutter.worst.margin, 1)}× margin`}
          />
        )}
      </dl>

      <StabilityTrimHint run={run} doc={doc} units={units} />
    </section>
  );
}

/** When the static margin is below a healthy value, say plainly how much nose ballast would trim it
 *  there — or that ballast alone can't, when the fins are too small or too far forward to reach it
 *  no matter the weight. A closed-form goal-seek (lib/sim/trim.ts), the inverse of the ballast
 *  sweep: the sweep plots the whole curve, this answers the one question a flyer actually asks. */
function StabilityTrimHint({ run, doc, units }: { run: FlightRun; doc: OrkDocument; units: UnitSystem }) {
  const r = run.result;
  const trim = marginTrim(
    {
      cp: r.stability.cp,
      cgLoaded: r.cgLoaded,
      loadedMass: r.liftoffMass,
      refDiameter: r.stability.refRadius * 2,
      noseStation: noseBallastStation(doc.rocket),
    },
    TRIM_TARGET_CAL,
  );
  // Only worth surfacing when the margin is actually thin; a comfortably-stable design needs nothing.
  // A degenerate airframe (no resolvable diameter) has no meaningful margin to trim — say nothing.
  if (!(r.stability.refRadius > 0) || trim.alreadyMet || !Number.isFinite(trim.currentMarginCal)) return null;

  return (
    <p className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
      {trim.feasible ? (
        <>
          <span className="font-medium text-zinc-600 dark:text-zinc-300">Stability trim:</span> adding
          about {d.q(d.mass(trim.ballastKg, units))} of nose ballast would bring the static margin to{" "}
          {d.fmt(TRIM_TARGET_CAL, 1)} cal (from {d.fmt(trim.currentMarginCal, 2)} cal). Nose weight
          trades a little apogee for stability — set it under Conditions → Design what-if to see the cost.
        </>
      ) : (
        <>
          <span className="font-medium text-zinc-600 dark:text-zinc-300">Stability trim:</span> nose
          ballast alone tops out near {d.fmt(trim.maxMarginCal, 2)} cal — short of {d.fmt(TRIM_TARGET_CAL, 1)} cal —
          so no amount of nose weight makes this design comfortably stable. Enlarge the fins or move them aft.
        </>
      )}
    </p>
  );
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

function Field({ term, value, hint, sub }: { term: string; value: string; hint?: string; sub?: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{term}</dt>
      <dd className="font-mono text-sm tabular-nums text-zinc-800 dark:text-zinc-200">
        {value}
        {hint && <span className="ml-1 text-[10px] uppercase text-amber-700 dark:text-amber-400">{hint}</span>}
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
  const curMotor = run.resolutions.find((x) => x.match)?.match?.entry.curve.designation;
  const baseMotor = baseline.resolutions.find((x) => x.match)?.match?.entry.curve.designation;
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
    // effect on the flutter headroom right alongside the stability trade.
    ...(run.result.flutter && baseline.result.flutter
      ? [
          {
            label: "Flutter margin",
            base: { value: d.fmt(baseline.result.flutter.worst.margin, 1), unit: "×" },
            cur: { value: d.fmt(run.result.flutter.worst.margin, 1), unit: "×" },
            change: d.changeAbsolute(baseline.result.flutter.worst.margin, run.result.flutter.worst.margin, "×", 1),
          },
        ]
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
