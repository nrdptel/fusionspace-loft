"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OrkDocument } from "@/lib/ork/import";
import type { MotorConfiguration } from "@/lib/model/types";
import { TOUCH_TARGET } from "@/lib/ui-tokens";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";
import type { RocketpyFlightResult } from "@/lib/validation/rocketpy-engine";
import { engineFailure } from "@/lib/validation/engine-error";
import { loadCrossCheck, saveCrossCheck } from "@/lib/session";
import type { GeometryEdits } from "@/lib/model/edit";
import { Button, Card, Extrapolated, Panel } from "./ui";
import { transonicReason } from "@/lib/sim/envelope";
import DataTable, { usePersistedSort, type Column } from "./DataTable";

/** Loft's own ballistic ascent, for a like-for-like comparison against RocketPy. */
interface LoftBallistic {
  apogee: number;
  maxVelocity: number;
  maxMach: number;
  timeToApogee: number;
  railExitVelocity: number;
  staticMarginCal: number;
  /** Why Loft has no static margin for this design, or undefined when it has one — the solver's own
   *  `FlightResult.marginUndefinedWhy`. Carried across rather than re-derived because this panel
   *  runs its OWN `runFlight`: the flight in this table is not the flight the summary strip is
   *  showing, so a reason read off the parent would be about a different rocket. */
  marginUndefinedWhy?: string;
  /** Loft's ascent left the drag model's validated subsonic envelope.
   *
   *  **The panel that most needs this is the one whose own Δ column cannot show it.** The footnote
   *  below states that RocketPy is fed Loft's Cd(Mach), so above M0.8 both columns ride the same
   *  extrapolated curve: they agree closely BECAUSE they share the assumption, and close agreement
   *  is exactly what this table invites a flyer to read as confidence. */
  extrapolatedTransonic: boolean;
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
  stableKey,
  designId,
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
  /** The same key, identified by which DESIGN rather than by how many have been opened — the one a
   *  STORED comparison is filed under. `designKey` leads with a per-mount counter, so a restored
   *  result compared against it would read as being "for a different rocket" the moment the shell
   *  remounts, which is the opposite of true. See `ResultsView`. */
  stableKey?: string;
  /** Which design this is, content-addressed, so a stored comparison can never surface on another. */
  designId?: string;
}) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const [done, setDone] = useState<Completed | null>(null);
  // A run in flight replaces the figures with its own progress; anything else shows the last
  // completed comparison, whether this panel is idle, stopped or reporting a failure.
  const showing = state.phase === "running" ? null : done;
  /** The key a completed comparison is judged against — the STABLE one, not `designKey`.
   *
   *  `designKey` leads with a per-mount load counter, so opening a second design from the shelf and
   *  coming back bumped it and marked a comparison genuinely for the rocket on screen as *"the design
   *  or motor configuration has changed since this ran"*. That is the wrong label in the more
   *  dangerous direction: it tells a flyer to distrust numbers that are correct, on the surface whose
   *  whole job is saying whether two solvers agree. Falls back to `designKey` where no stable key is
   *  supplied, which is the previous behaviour. */
  const judgeKey = stableKey ?? designKey;
  const stale = showing !== null && showing.ranFor !== judgeKey;
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
        marginUndefinedWhy: loftRun.result.marginUndefinedWhy,
        extrapolatedTransonic: loftRun.result.extrapolatedTransonic,
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
      setDone({ loft, rp, ranFor: judgeKey });
      setState({ phase: "done" });
      // Written ONCE, on completion. A stopped or failed run stores nothing: the panel keeps the
      // previous figures on screen deliberately, and persisting a run that did not finish would turn
      // "the last comparison, kept" into "a comparison that never happened".
      if (designId && stableKey) {
        saveCrossCheck({ designId, stableKey, loft: { ...loft }, rp: { ...rp }, at: Date.now() });
      }
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
  }, [doc, config, simIndex, ballastKg, motorSwap, geometry, judgeKey, designId, stableKey]);

  /** Come back to the comparison you left.
   *
   *  **Restored only where the whole design key matches, and then relabelled as CURRENT.** The stored
   *  entry carries `stableKey`, which is `designKey` with the per-mount load counter replaced by the
   *  design's own fingerprint; `ranFor` is set to today's `designKey` on the way back in, because the
   *  figures genuinely are for the design on screen and the panel's staleness banner reads that
   *  field. Restoring `ranFor` verbatim would have marked every restored comparison stale — a label
   *  saying "these numbers are for a different rocket" about the rocket in front of the flyer.
   *
   *  **Reactive, not mount-only, because this panel is not remounted when the design changes.**
   *  `ResultsView` carries no `key`, so opening another design from the shelf swaps the props under a
   *  panel that stays mounted — a mount-only effect would restore the first design's comparison and
   *  never the second's, and could never retry after a miss. It never starts a run: the worst case is
   *  that the flyer presses Run, which is what they would have had to do anyway.
   *
   *  Guarded so it cannot interrupt: a run in flight owns the panel, and a comparison already showing
   *  for this key is the one that would be restored. */
  useEffect(() => {
    if (!designId || !stableKey) return;
    if (state.phase === "running") return;
    if (done?.ranFor === stableKey) return;
    const stored = loadCrossCheck();
    if (!stored || stored.designId !== designId || stored.stableKey !== stableKey) return;
    setDone({
      loft: stored.loft as unknown as LoftBallistic,
      rp: stored.rp as unknown as RocketpyFlightResult,
      ranFor: stored.stableKey,
    });
    setState({ phase: "done" });
    // `state.phase` and `done` are read as guards, not watched: re-running on either would re-enter
    // this the moment it sets them. The identity that decides a restore is the design and its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId, stableKey]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  // Leaving the design entirely ends the run. Without this the abandoned flight keeps the shared
  // worker's single run chain busy, and the NEXT design's cross-check sits on "Preparing…" until the
  // flight nobody is waiting for finishes — measured at 13.5 s here, and it scales with whatever is
  // left of the abandoned run. The panel is only unmounted by leaving the design; switching workspace
  // tabs keeps it mounted (ResultsView keeps the panels alive deliberately), so a run survives a tab
  // change exactly as before.
  useEffect(() => () => abortRef.current?.abort(), []);


  return (
    <Panel
      label="RocketPy cross-check"
      title="Second opinion: RocketPy"
      aside={<span className="text-xs text-zinc-500 dark:text-zinc-400">independent 6-DOF engine, in your browser</span>}
    >
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
            <Button onClick={stop}>Stop</Button>
          )}
        </div>
      )}
      {/* **What leaving costs, said before it happens rather than discovered afterwards.**
          P17's third clause asks for the run to survive a navigation OR for the flyer to be told
          before leaving that it will be discarded. A blocking prompt is not available honestly here:
          the App Router has no navigation-blocking API, `beforeunload` does not fire on the in-app
          link this milestone is actually about, and intercepting every anchor would still miss the
          browser's Back button. A statement is what can be made true, so it is made plainly.

          It is scoped to a RUNNING check because that is the only thing genuinely lost: a FINISHED
          one is stored and comes back. What leaving mid-run costs, precisely: the ~40 MB itself is
          served cache-first by the service worker, so it is NOT downloaded again — but the panel's
          unmount aborts the run, and `teardown()` terminates the shared worker, so the next run pays
          the boot again. That is the same price the panel's own stopped-state copy already names. */}
      {state.phase === "running" && (
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          Following a link out of the app — to the docs, or the wordmark — ends this run. Moving
          between workspaces does not. A finished comparison is kept; one still going is not.
        </p>
      )}

      {/* A failure reads before the way out of it, so the button below is the next thing reached. */}
      {state.phase === "error" && <Failure message={state.message} offline={state.offline} />}

      {/* Stopping is a deliberate act with a price, and the price is named rather than discovered:
          the runtime is genuinely gone, so the next run starts it over. Saying "stopped waiting" would
          be the lie — see the note on `runRocketpy`. The stage is named because a cold run spends most
          of its time downloading and installing, not flying, so "stopped while flying" would usually
          be describing the wrong thing. */}
      {state.phase === "stopped" && (
        <Card tone="sunken" className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
          <p>
            Stopped at &ldquo;{state.stage}&rdquo;. RocketPy reports a finished flight or nothing, so
            that run produced no figures{showing ? " — the comparison below is the earlier run" : ""}.
          </p>
          {/* Decision-grade by the rule P1 increment 4 set: a sentence whose purpose is to change
              what the flyer does NEXT takes the body default, and this one names the price of the
              button directly above it — running again is a cold start, not a resume. The comment
              introducing this block already argued exactly that ("a deliberate act with a price, and
              the price is named rather than discovered") while the type scale filed it as a
              footnote. */}
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Stopping ends the Python runtime, which is what makes it a real stop rather than a
            cancelled wait. Running again starts it from scratch, so it costs what the first run did.
          </p>
        </Card>
      )}

      {/* A failed run must leave a way back. RocketPy is CPython under WASM flying a design a flyer
          is actively editing, so failures are ordinary — a geometry it will not take, a runtime that
          did not finish downloading — and every one of them used to end the panel for the rest of
          the page's life, reachable again only by reloading and losing the loaded design. Offering
          the same button is not a retry loop: nothing is re-attempted automatically, and the warm
          worker means a second attempt after a transient failure costs seconds, not the full boot. */}
      {(state.phase === "idle" || state.phase === "error" || state.phase === "stopped") && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button variant="primary" onClick={run}>
            {state.phase === "idle" ? "Run RocketPy" : state.phase === "stopped" ? "Run RocketPy again" : "Try RocketPy again"}
          </Button>
          {/* Only true before the first attempt. After a failure we do not know whether the download
              is the thing that failed, and guessing at the cause is worse than saying nothing. */}
          {state.phase === "idle" && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">downloads ~40 MB the first time</span>
          )}
        </div>
      )}

      {stale && (
        <Card tone="warn" className="mt-3 text-sm">
          <p>
            The design or motor configuration has changed since this ran, so the figures below are
            for the rocket as it was. They are kept rather than cleared — that is the &ldquo;before&rdquo;
            if you are editing toward a target — but run it again for what is on screen now.
          </p>
          {/* SECONDARY. This fires the same handler as the Run button above, so at full weight the
              surface showed one action twice — and `DESIGN.md` §5 allows one primary per surface.
              The two are never on screen together today (this block renders only once a result
              exists), but the weight is what says which is the surface's job. */}
          <Button variant="secondary" onClick={run} className="mt-2">
            Run RocketPy again
          </Button>
        </Card>
      )}
      {showing && <Comparison loft={showing.loft} rp={showing.rp} units={units} />}
    </Panel>
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
    <Card tone="danger" className="mt-3 text-sm">
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
          <pre className="mt-1 max-h-64 overflow-auto rounded-md border border-red-500/20 bg-red-500/5 p-2 text-[11px] leading-snug">
            {detail}
          </pre>
        </details>
      )}
    </Card>
  );
}

/** A displayed quantity as a CSV number — the digits without the thousands separator or the unit. */
function csvNumber(q: { value: string; unit: string }): number | string {
  const n = Number(q.value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : "";
}

function Comparison({ loft, rp, units }: { loft: LoftBallistic; rp: RocketpyFlightResult; units: UnitSystem }) {
  const rows = [
    { label: "Apogee", loft: d.altitude(loft.apogee, units), rp: d.altitude(rp.apogee, units), delta: d.changePercent(rp.apogee, loft.apogee) },
    { label: "Max velocity", loft: d.speed(loft.maxVelocity, units), rp: d.speed(rp.maxVelocity, units), delta: d.changePercent(rp.maxVelocity, loft.maxVelocity) },
    { label: "Max Mach", loft: d.mach(loft.maxMach), rp: d.mach(rp.maxMach), delta: d.changePercent(rp.maxMach, loft.maxMach) },
    { label: "Rail-exit velocity", loft: d.speed(loft.railExitVelocity, units), rp: d.speed(rp.railExitVelocity, units), delta: d.changePercent(rp.railExitVelocity, loft.railExitVelocity) },
    { label: "Time to apogee", loft: d.seconds(loft.timeToApogee), rp: d.seconds(rp.timeToApogee), delta: d.changePercent(rp.timeToApogee, loft.timeToApogee) },
    // **Withheld on BOTH sides when Loft has no centre of pressure, not just on Loft's.** A Δ column
    // against RocketPy's figure would read as an accuracy gap between two tools, when the real fact
    // is that one of them has no figure at all — the same argument the panel's own gate makes about
    // an unresolved motor. RocketPy's number stays visible; it is the comparison that is withdrawn.
    loft.marginUndefinedWhy
      ? {
          label: "Static margin",
          loft: { value: "—", unit: "" },
          rp: d.calibers(rp.staticMarginLiftoff),
          delta: { text: "withheld" },
        }
      : { label: "Static margin", loft: d.calibers(loft.staticMarginCal), rp: d.calibers(rp.staticMarginLiftoff), delta: d.changeAbsolute(rp.staticMarginLiftoff, loft.staticMarginCal, "cal") },
  ];
  // Loft's half of this comparison is the extrapolated half, and the agreement is not evidence
  // against that — RocketPy is fed Loft's own Cd(Mach) (see the footnote), so above M0.8 the two
  // columns share the assumption rather than testing it. Stated above the table, because a flyer
  // reading close agreement here is reading it as confirmation.
  const extrapolatedWhy = transonicReason(loft.extrapolatedTransonic, loft.maxMach);
  const columns: Column<(typeof rows)[number]>[] = [
          {
            key: "label",
            label: "Metric",
            rowHeader: true,
            sortValue: (r) => r.label,
            cell: (r) => <span className="font-sans text-zinc-600 dark:text-zinc-300">{r.label}</span>,
            // The unit, from the row's own quantity — see the value columns below.
            csv: (r) => (r.rp.unit ? `${r.label} (${r.rp.unit})` : r.label),
          },
          // **The screen shows "1,234 ft"; the export must not.** A CSV cell carrying a thousands
          // separator and a unit is a string, not a number — it needs quoting, it will not sum, and
          // a spreadsheet reads the whole column as text. The unit moves onto the metric name (it is
          // per row here, so it cannot go in a column header) and the value stays a plain number.
          { key: "rp", label: "RocketPy", cell: (r) => d.q(r.rp), csv: (r) => csvNumber(r.rp) },
          { key: "loft", label: "Loft", cell: (r) => d.q(r.loft), csv: (r) => csvNumber(r.loft) },
          {
            key: "delta",
            label: "Δ",
            cell: (r) => <span className="text-zinc-500 dark:text-zinc-400">{r.delta.text}</span>,
            // **NOT `\u0394 (%)`, and the first draft of this was.** Five of the six rows are a
            // percentage and the static-margin row is an absolute caliber difference
            // (`d.changeAbsolute(..., "cal")`), so a percent header would publish "+0.90 cal" as
            // 0.9%, on the very row a flyer reads to decide whether two engines agree about
            // stability. The unit stays in the cell here, because it is not the same unit down the
            // column — which is exactly the case the metric-name trick above cannot cover.
            csv: (r) => {
              // The screen withholds an undefined change as an em dash. Stripping non-numerics
              // turns that into "", and `Number("")` is 0 — so a delta nobody could compute would
              // export as EXACT AGREEMENT between two solvers, which is the strongest claim this
              // table can make and the one it has least right to.
              const raw = r.delta.text.replace(/\u2212/g, "-");
              return /\d/.test(raw) ? raw : "";
            },
          },
        ];

  // Opens in the order the two solvers are compared in — apogee first, the order the caveats under
  // the table are written in — so the caller's own order is the default and a remembered sort is a
  // deliberate act. Three of these four columns carry no `sortValue`, which is exactly why the
  // allowlist is derived from the columns rather than written out: a guard built the other way admits
  // `rp`, `loft` and `delta`, and a stored one of those announces "sorted by Δ" over rows nothing
  // reordered, on a header with no button to clear it.
  const [sort, setSort] = usePersistedSort("crosscheck.sort", columns);

  return (
    <div className="mt-3">
      {/* A withheld CELL in a data table has nowhere to carry its reason — the em dash is the whole
          cell — so the sentence goes above the table, in the slot the transonic caveat already uses.
          Without it the row reads as a solver that declined to answer rather than a design that has
          no figure to answer with. */}
      {loft.marginUndefinedWhy && (
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          <strong className="font-medium">Static margin is withheld on Loft&rsquo;s side:</strong>{" "}
          {loft.marginUndefinedWhy} RocketPy&rsquo;s own figure is still shown, and the &Delta; is not.
        </p>
      )}
      {extrapolatedWhy && (
        <div className="mb-3">
          <Extrapolated
            reason={`${extrapolatedWhy}. RocketPy is fed Loft's own drag curve, so both columns share that estimate and the difference between them cannot show it`}
          />
        </div>
      )}
      {/* The disagreement between two independent solvers is exactly the number a flyer takes
          elsewhere to argue with, and until now it was trapped in the DOM — no sort, no copy, no
          export. Column order is deliberate and unchanged: the outside number first, Loft second,
          then how Loft differs from it, matching the stored-results comparison next door. Two tables
          on adjacent tabs that put the reference on opposite sides make every glance a re-read. */}
      <DataTable
        sort={sort}
        onSortChange={setSort}
        rows={rows}
        rowKey={(r) => r.label}
        exportName="rocketpy-cross-check"
        exportSuffix="cross-check"
        caption="Loft against RocketPy, metric by metric"
        empty="Nothing to compare yet — run RocketPy above and its figures appear here beside Loft's."
        columns={columns}
      />
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Ballistic ascent to apogee (recovery and wind removed), RocketPy fed Loft&apos;s Cd(Mach) — a
        cross-check of the integrator, mass, and centre of pressure, not an independent drag model.
        Δ is Loft against RocketPy, the same direction the stored-results comparison reads.
        Close agreement is a good sign; a gap is worth investigating, not proof either engine is right.
      </p>
    </div>
  );
}
