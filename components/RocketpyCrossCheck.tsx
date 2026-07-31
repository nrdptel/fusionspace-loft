"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OrkDocument } from "@/lib/ork/import";
import type { MotorConfiguration } from "@/lib/model/types";
import { TOUCH_TARGET } from "@/lib/ui-tokens";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";
import type { RocketpyFlightResult } from "@/lib/validation/rocketpy-engine";
import { engineFailure } from "@/lib/validation/engine-error";
import type { GeometryEdits } from "@/lib/model/edit";
import { Card } from "./ui";

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
  /** `stoppable` is false for the window before the engine has the run — our own four dynamic imports
   *  and Loft's baseline flight. Nothing exists to stop there, and offering Stop anyway would be a
   *  button that reports having ended a runtime that was never built. It flips true on the engine's
   *  first progress message, which only arrives once the worker is real. */
  | { phase: "running"; stage: string; stoppable: boolean }
  | { phase: "done" }
  /** The stage the run was stopped at. RocketPy spends most of a cold run downloading and installing,
   *  not flying, so a stopped panel that always said "flying" would be describing the wrong thing. */
  | { phase: "stopped"; stage: string }
  /** `offline` records what the BROWSER said at the moment the run failed, not a diagnosis of the
   *  failure. RocketPy's ~40 MB runtime is not precached (the service worker excludes /pyodide/, and
   *  the worker script with it), so with no signal the run cannot start and the panel used to report
   *  the engine's own generic "The RocketPy worker crashed." — which reads as a defect in the tool or
   *  the design, on the form factor this project describes as a pad check with no signal. */
  | { phase: "error"; message: string; offline: boolean };

/** A completed cross-check, held OUTSIDE the phase so that stopping or failing the next run cannot
 *  destroy it. The panel promises the previous figures are "kept rather than cleared — that is the
 *  'before' if you are editing toward a target", and a promise that survives success but not a Stop
 *  is not a promise. */
interface Completed {
  loft: LoftBallistic;
  rp: RocketpyFlightResult;
  /** The design it was computed for, so a later edit shows as a difference instead of silently
   *  invalidating what is on screen. */
  ranFor: string;
}

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
  geometry,
  designKey,
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
  /** Active builder geometry edits (fin span, nose/body length). Applied to both the RocketPy spec
   *  and Loft's baseline, so both engines fly the edited design. */
  geometry?: GeometryEdits;
  /** One string standing for the design that was flown. Downloading a 40 MB runtime and flying it
   *  costs the better part of a minute, so unlike the sweeps this panel does not re-run itself when
   *  the design changes — it keeps the answer and says it is now for a different rocket, which is
   *  also the comparison a flyer editing toward a target actually wants. */
  designKey: string;
}) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const [done, setDone] = useState<Completed | null>(null);
  // A run in flight replaces the figures with its own progress; anything else shows the last
  // completed comparison, whether this panel is idle, stopped or reporting a failure.
  const showing = state.phase === "running" ? null : done;
  const stale = showing !== null && showing.ranFor !== designKey;
  /** The controller for the run in flight, so Stop can reach it. One per run, never reused. */
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ phase: "running", stage: "Preparing…", stoppable: false });
    // The last stage the engine reported, read in the catch below — so it is declared out here.
    let reached = "Preparing…";
    try {
      const [
        { buildRocketpySpec },
        { runRocketpy },
        { runFlight, overridesFromStored, noseBallastStation },
        { applyGeometryEdits, hasGeometryEdits },
      ] = await Promise.all([
        import("@/lib/validation/rocketpy-spec"),
        import("@/lib/validation/rocketpy-engine"),
        import("@/lib/sim/run"),
        import("@/lib/model/edit"),
      ]);
      // Loft's like-for-like number: the same design flown ballistic to apogee under the stored
      // launch conditions — exactly what RocketPy's terminate_on_apogee run computes. Honour the
      // active what-ifs so both engines fly the design the flyer sees above (not the original).
      const sim = doc.simulations[simIndex] ?? doc.simulations[0];
      const overrides = sim ? overridesFromStored(sim) : undefined;
      const loftRun = runFlight(doc.rocket, {
        configId: config.id,
        overrides,
        ballistic: true,
        ballastKg,
        motorSwap,
        geometry,
      });
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
      // apply the geometry edits to the rocket the spec is built from, and add nose ballast as an
      // extra point mass — so the RocketPy spec matches the flown design exactly.
      const editedRocket =
        geometry && hasGeometryEdits(geometry) ? applyGeometryEdits(doc.rocket, geometry) : doc.rocket;
      const extras =
        ballastKg && ballastKg > 0
          ? [{ mass: ballastKg, cg: noseBallastStation(editedRocket), ownInertia: 0, source: "Nose ballast" }]
          : [];
      const spec = buildRocketpySpec({ ...doc, rocket: editedRocket }, config, simIndex, extras);
      const rp = await runRocketpy(spec, {
        onProgress: (stage) => {
          reached = stage;
          setState({ phase: "running", stage, stoppable: true });
        },
        signal: controller.signal,
      });
      setDone({ loft, rp, ranFor: designKey });
      setState({ phase: "done" });
    } catch (e) {
      // A stop is not a failure, and must not read as one: no traceback, no "couldn't run". Matched
      // on `name` rather than `instanceof Error` because the abort arrives as a DOMException, whose
      // place in the Error prototype chain is not something to bet a state transition on.
      if ((e as { name?: string } | null)?.name === "AbortError") setState({ phase: "stopped", stage: reached });
      else
        setState({
          phase: "error",
          message: e instanceof Error ? e.message : String(e),
          // A fact the browser reports, captured now rather than when the panel renders — not a guess
          // at the cause. `engineFailure` deliberately never classifies a failure; this does not
          // either, it just says what else was true at the time.
          offline: typeof navigator !== "undefined" && navigator.onLine === false,
        });
    }
  }, [doc, config, simIndex, ballastKg, motorSwap, geometry, designKey]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  // Leaving the design entirely ends the run. Without this the abandoned flight keeps the shared
  // worker's single run chain busy, and the NEXT design's cross-check sits on "Preparing…" until the
  // flight nobody is waiting for finishes — measured at 13.5 s here, and it scales with whatever is
  // left of the abandoned run. The panel is only unmounted by leaving the design; switching workspace
  // tabs keeps it mounted (ResultsView keeps the panels alive deliberately), so a run survives a tab
  // change exactly as before.
  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <Card as="section" aria-label="RocketPy cross-check">
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

      {/* The row WRAPS: on a 390 px phone the stage label plus its aside already filled the width
          with nothing to spare, so a Stop beside them had nowhere to go but off the edge. */}
      {state.phase === "running" && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-zinc-600 dark:text-zinc-300">
          {/* The live region is the stage text alone — the button is not something to re-announce
              every time the stage changes. */}
          <span className="flex items-center gap-2" role="status">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <span>{state.stage}</span>
            <span className="text-xs text-zinc-400">(a minute or so)</span>
          </span>
          {/* Offered only once the engine has the run. Before that the only thing in flight is our own
              module loading and Loft's baseline flight — there is no runtime to end, and a Stop that
              said it had ended one would be reporting something that never happened. */}
          {state.stoppable && (
            <button
              type="button"
              onClick={stop}
              className={`rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 ${TOUCH_TARGET}`}
            >
              Stop
            </button>
          )}
        </div>
      )}

      {/* A failure reads before the way out of it, so the button below is the next thing reached. */}
      {state.phase === "error" && <Failure message={state.message} offline={state.offline} />}

      {/* Stopping is a deliberate act with a price, and the price is named rather than discovered:
          the runtime is genuinely gone, so the next run starts it over. Saying "stopped waiting" would
          be the lie — see the note on `runRocketpy`. The stage is named because a cold run spends most
          of its time downloading and installing, not flying, so "stopped while flying" would usually
          be describing the wrong thing. */}
      {state.phase === "stopped" && (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
          <p>
            Stopped at &ldquo;{state.stage}&rdquo;. RocketPy reports a finished flight or nothing, so
            that run produced no figures{showing ? " — the comparison below is the earlier run" : ""}.
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Stopping ends the Python runtime, which is what makes it a real stop rather than a
            cancelled wait. Running again starts it from scratch, so it costs what the first run did.
          </p>
        </div>
      )}

      {/* A failed run must leave a way back. RocketPy is CPython under WASM flying a design a flyer
          is actively editing, so failures are ordinary — a geometry it will not take, a runtime that
          did not finish downloading — and every one of them used to end the panel for the rest of
          the page's life, reachable again only by reloading and losing the loaded design. Offering
          the same button is not a retry loop: nothing is re-attempted automatically, and the warm
          worker means a second attempt after a transient failure costs seconds, not the full boot. */}
      {(state.phase === "idle" || state.phase === "error" || state.phase === "stopped") && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={run}
            className={`rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 ${TOUCH_TARGET}`}
          >
            {state.phase === "idle" ? "Run RocketPy" : state.phase === "stopped" ? "Run RocketPy again" : "Try RocketPy again"}
          </button>
          {/* Only true before the first attempt. After a failure we do not know whether the download
              is the thing that failed, and guessing at the cause is worse than saying nothing. */}
          {state.phase === "idle" && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">downloads ~40 MB the first time</span>
          )}
        </div>
      )}

      {stale && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <p>
            The design or motor configuration has changed since this ran, so the figures below are
            for the rocket as it was. They are kept rather than cleared — that is the &ldquo;before&rdquo;
            if you are editing toward a target — but run it again for what is on screen now.
          </p>
          <button
            type="button"
            onClick={run}
            className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            Run RocketPy again
          </button>
        </div>
      )}
      {showing && <Comparison loft={showing.loft} rp={showing.rp} units={units} />}
    </Card>
  );
}

/** What the second solver said when it stopped, in a shape a phone can hold.
 *
 *  A RocketPy failure arrives as a Python traceback — the real one is 30 lines and 1,449 characters,
 *  of which only the last says what went wrong. Printed straight into the panel it buried that line
 *  under frames the flyer did not write, and its longest path (an 86-character site-packages frame line)
 *  is a single unbreakable token, so at 390 px it pushed the whole page 115 px sideways: every other
 *  panel on the workspace started scrolling horizontally because of one failed cross-check.
 *
 *  The report is kept in full and unedited — it is the only thing worth attaching to a bug report,
 *  and the frame it names is often more telling than the exception line — but it is folded away and
 *  scrolls inside its own box, with the alignment of Python's `^^^` carets intact. */
function Failure({ message, offline }: { message: string; offline: boolean }) {
  const { headline, detail } = engineFailure(message);
  return (
    <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
      {/* What the browser said, before what the engine said. RocketPy's runtime is a ~40 MB download
          that is not precached, so with no connection the run cannot start at all — and the engine's
          own words for that are "the worker crashed", which sounds like the tool or the design is at
          fault. The engine's message is still shown, unchanged and in full: this adds a fact, it does
          not reinterpret one. */}
      {offline && (
        <p className="mb-1 break-words font-medium">
          Your device is offline, and RocketPy needs to download about 40 MB the first time you run it.
          That is the likely reason, though what it reported is below.
        </p>
      )}
      <p className="break-words">RocketPy couldn&apos;t run: {headline}</p>
      {detail && (
        <details className="group mt-1">
          <summary className={`flex cursor-pointer select-none items-center gap-1.5 text-xs ${TOUCH_TARGET}`}>
            <span className="underline underline-offset-2">What RocketPy reported</span>
            <span className="transition group-open:rotate-180">▾</span>
          </summary>
          <pre className="mt-1 max-h-64 overflow-auto rounded border border-red-500/20 bg-red-500/5 p-2 text-[11px] leading-snug">
            {detail}
          </pre>
        </details>
      )}
    </div>
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
              {/* Same reading order as the stored-results comparison next door: the outside number
                  first, Loft second, then how Loft differs from it. Two tables on adjacent tabs that
                  put the reference on opposite sides make every glance a re-read. */}
              <th className="py-1 pr-4 font-medium">Metric</th>
              <th className="py-1 pr-4 font-medium">RocketPy</th>
              <th className="py-1 pr-4 font-medium">Loft</th>
              <th className="py-1 font-medium">Δ</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-zinc-100 dark:border-zinc-800">
                <th scope="row" className="py-1.5 pr-4 text-left font-sans font-normal text-zinc-600 dark:text-zinc-300">
                  {r.label}
                </th>
                <td className="py-1.5 pr-4 text-zinc-800 dark:text-zinc-100">{d.q(r.rp)}</td>
                <td className="py-1.5 pr-4 text-zinc-800 dark:text-zinc-100">{d.q(r.loft)}</td>
                <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{r.delta.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Ballistic ascent to apogee (recovery and wind removed), RocketPy fed Loft&apos;s Cd(Mach) — a
        cross-check of the integrator, mass, and centre of pressure, not an independent drag model.
        Δ is Loft against RocketPy, the same direction the stored-results comparison reads.
        Close agreement is a good sign; a gap is worth investigating, not proof either engine is right.
      </p>
    </div>
  );
}
