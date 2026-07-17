"use client";

import { useCallback, useState } from "react";
import type { OrkDocument } from "@/lib/ork/import";
import type { MotorConfiguration } from "@/lib/model/types";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";
import type { RocketpyFlightResult } from "@/lib/validation/rocketpy-engine";

/** Loft's own ballistic ascent, for a like-for-like comparison against RocketPy. */
interface LoftBallistic {
  apogee: number;
  maxVelocity: number;
  maxMach: number;
  timeToApogee: number;
  railExitVelocity: number;
  staticMarginCal: number;
}

type State =
  | { phase: "idle" }
  | { phase: "running"; stage: string }
  | { phase: "done"; loft: LoftBallistic; rp: RocketpyFlightResult }
  | { phase: "error"; message: string };

/** Second opinion: fly the design in RocketPy — an independent 6-DOF engine — right in the browser,
 *  and compare it against Loft's own solver. Both fly a ballistic ascent to apogee (recovery
 *  stripped, wind zeroed), and RocketPy is fed Loft's own Cd(Mach) curve, so the comparison is a
 *  clean cross-check of the trajectory integrator, the mass model, and RocketPy's independent
 *  Barrowman centre of pressure — the same methodology as the Validation page, now on your own
 *  design. The ~40 MB RocketPy runtime downloads only when you tap the button, and runs entirely
 *  on your device (the design never leaves the browser). */
export default function RocketpyCrossCheck({
  doc,
  config,
  simIndex,
  units,
  ballastKg,
  motorSwap,
}: {
  doc: OrkDocument;
  config: MotorConfiguration;
  simIndex: number;
  units: UnitSystem;
  /** Active "what-if" nose ballast (kg), so the cross-check flies what the flyer is looking at. */
  ballastKg?: number;
  /** Active "what-if" motor swap. `config` is already the swapped configuration; this is only
   *  needed to reproduce the swap in Loft's independently-picked ballistic baseline. */
  motorSwap?: { manufacturer?: string; designation: string; diameter?: number };
}) {
  const [state, setState] = useState<State>({ phase: "idle" });

  const run = useCallback(async () => {
    setState({ phase: "running", stage: "Preparing…" });
    try {
      const [{ buildRocketpySpec }, { runRocketpy }, { runFlight, overridesFromStored, noseBallastStation }] =
        await Promise.all([
          import("@/lib/validation/rocketpy-spec"),
          import("@/lib/validation/rocketpy-engine"),
          import("@/lib/sim/run"),
        ]);
      // Loft's like-for-like number: the same design flown ballistic to apogee under the stored
      // launch conditions — exactly what RocketPy's terminate_on_apogee run computes. Honour the
      // active what-ifs so both engines fly the design the flyer sees above (not the original).
      const sim = doc.simulations[simIndex] ?? doc.simulations[0];
      const overrides = sim ? overridesFromStored(sim) : undefined;
      const loftRun = runFlight(doc.rocket, { configId: config.id, overrides, ballistic: true, ballastKg, motorSwap });
      const s = loftRun.result.summary;
      const loft: LoftBallistic = {
        apogee: s.apogee,
        maxVelocity: s.maxVelocity,
        maxMach: s.maxMach,
        timeToApogee: s.timeToApogee,
        railExitVelocity: s.railExitVelocity,
        staticMarginCal: loftRun.result.staticMarginCal,
      };
      // `config` is already the swapped configuration (runFlight returns it), so the motor is right;
      // add nose ballast as an extra point mass so the RocketPy spec carries the same weight too.
      const extras =
        ballastKg && ballastKg > 0
          ? [{ mass: ballastKg, cg: noseBallastStation(doc.rocket), ownInertia: 0, source: "Nose ballast" }]
          : [];
      const spec = buildRocketpySpec(doc, config, simIndex, extras);
      const rp = await runRocketpy(spec, { onProgress: (stage) => setState({ phase: "running", stage }) });
      setState({ phase: "done", loft, rp });
    } catch (e) {
      setState({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [doc, config, simIndex, ballastKg, motorSwap]);

  return (
    <section
      aria-label="RocketPy cross-check"
      className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Second opinion: RocketPy</h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">independent 6-DOF engine, in your browser</span>
      </div>
      <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
        Fly this design in{" "}
        <a
          href="https://github.com/RocketPy-Team/RocketPy"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          RocketPy
        </a>{" "}
        — a second, independent solver — and compare. Both fly a ballistic ascent to apogee and share
        Loft&apos;s drag curve, so the difference is a clean check of the trajectory, mass, and
        stability model. RocketPy runs entirely on your device; the design never leaves the browser.
      </p>

      {state.phase === "idle" && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={run}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            Run RocketPy
          </button>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">downloads ~40 MB the first time</span>
        </div>
      )}

      {state.phase === "running" && (
        <div className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300" role="status">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span>{state.stage}</span>
          <span className="text-xs text-zinc-400">(a minute or so)</span>
        </div>
      )}

      {state.phase === "error" && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          RocketPy couldn&apos;t run: {state.message}
        </div>
      )}

      {state.phase === "done" && <Comparison loft={state.loft} rp={state.rp} units={units} />}
    </section>
  );
}

function Comparison({ loft, rp, units }: { loft: LoftBallistic; rp: RocketpyFlightResult; units: UnitSystem }) {
  const rows = [
    { label: "Apogee", loft: d.altitude(loft.apogee, units), rp: d.altitude(rp.apogee, units), delta: d.changePercent(rp.apogee, loft.apogee) },
    { label: "Max velocity", loft: d.speed(loft.maxVelocity, units), rp: d.speed(rp.maxVelocity, units), delta: d.changePercent(rp.maxVelocity, loft.maxVelocity) },
    { label: "Max Mach", loft: d.mach(loft.maxMach), rp: d.mach(rp.maxMach), delta: d.changePercent(rp.maxMach, loft.maxMach) },
    { label: "Rail-exit velocity", loft: d.speed(loft.railExitVelocity, units), rp: d.speed(rp.railExitVelocity, units), delta: d.changePercent(rp.railExitVelocity, loft.railExitVelocity) },
    { label: "Time to apogee", loft: d.seconds(loft.timeToApogee), rp: d.seconds(rp.timeToApogee), delta: d.changePercent(rp.timeToApogee, loft.timeToApogee) },
    { label: "Static margin", loft: d.calibers(loft.staticMarginCal), rp: d.calibers(rp.staticMarginLiftoff), delta: d.changeAbsolute(rp.staticMarginLiftoff, loft.staticMarginCal, "cal") },
  ];
  return (
    <div className="mt-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <th className="py-1 pr-4 font-medium">Metric</th>
              <th className="py-1 pr-4 font-medium">Loft</th>
              <th className="py-1 pr-4 font-medium">RocketPy</th>
              <th className="py-1 font-medium">Loft − RocketPy</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-zinc-100 dark:border-zinc-800">
                <th scope="row" className="py-1.5 pr-4 text-left font-sans font-normal text-zinc-600 dark:text-zinc-300">
                  {r.label}
                </th>
                <td className="py-1.5 pr-4 text-zinc-800 dark:text-zinc-100">{d.q(r.loft)}</td>
                <td className="py-1.5 pr-4 text-zinc-800 dark:text-zinc-100">{d.q(r.rp)}</td>
                <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{r.delta.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Ballistic ascent to apogee (recovery and wind removed), RocketPy fed Loft&apos;s Cd(Mach) — a
        cross-check of the integrator, mass, and centre of pressure, not an independent drag model.
        Close agreement is a good sign; a gap is worth investigating, not proof either engine is right.
      </p>
    </div>
  );
}
