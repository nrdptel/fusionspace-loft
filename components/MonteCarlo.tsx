"use client";

import { useEffect, useMemo, useState } from "react";
import type { OrkDocument } from "@/lib/ork/import";
import { overridesFromStored } from "@/lib/sim/run";
import { runMonteCarlo } from "@/lib/sim/montecarlo-client";
import { exceedanceProbability, type Dispersions, type MonteCarloResult, type Stat } from "@/lib/sim/montecarlo";
import type { GeometryEdits } from "@/lib/model/edit";
import { mToFt, ftToM, mpsToFtps } from "@/lib/units";
import type { CsvCell } from "@/lib/csv";
import { NumberField } from "./ui";
import DownloadCsv from "./DownloadCsv";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";

const round = (n: number, dp: number) => (Number.isFinite(n) ? Math.round(n * 10 ** dp) / 10 ** dp : "");

/** A probability in [0,1] as a compact, honest percentage: an exact 0/100 reads plainly, a small
 *  non-zero tail reads "<1%" rather than rounding to a falsely reassuring 0%. */
function formatChance(p: number): string {
  if (p <= 0) return "0%";
  if (p >= 1) return "100%";
  if (p < 0.01) return "<1%";
  return `${Math.round(p * 100)}%`;
}

/** Flights per run — enough for stable 5th/95th percentiles, cheap enough to finish in a second or
 *  two on the device. */
const SAMPLES = 300;
/** Fixed seed so the same design and dispersions reproduce the same cloud (and a screenshot is
 *  stable); the flyer varies the inputs, not the noise. */
const SEED = 0x10f7;

/** Monte-Carlo dispersion: fly the design a few hundred times with the launch conditions and motor
 *  impulse jittered around their nominal values, and show the spread — how high, how fast, and how
 *  far from the pad it comes down. The physics is the same trusted flight each time; the uncertainty
 *  is the flyer's own stated input assumptions propagated through it, which is exactly what sizing a
 *  recovery area or checking a waiver ceiling needs. Honours the active what-ifs, and runs entirely
 *  on the device. */
export default function MonteCarlo({
  doc,
  simIndex,
  units,
  ballastKg,
  recoveryCdScale,
  motorSwap,
  geometry,
}: {
  doc: OrkDocument;
  simIndex: number;
  units: UnitSystem;
  ballastKg?: number;
  recoveryCdScale?: number;
  motorSwap?: { manufacturer?: string; designation: string; diameter?: number };
  geometry?: GeometryEdits;
}) {
  const [open, setOpen] = useState(false);
  // Dispersion 1σ inputs, with common planning defaults: a ~5% motor total-impulse band, a couple
  // of degrees of rail lean, and a couple of m/s of wind variability. All editable.
  const [impulsePct, setImpulsePct] = useState(5);
  const [massPct, setMassPct] = useState(3);
  const [dragPct, setDragPct] = useState(10);
  const [recoveryPct, setRecoveryPct] = useState(15);
  const [rodAngleDeg, setRodAngleDeg] = useState(2);
  const [windSpeedMps, setWindSpeedMps] = useState(2);
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  // Waiver/altitude ceiling to check the apogee band against (display units; 0 = off). Post-hoc on
  // the existing samples, so changing it never re-flies — it only re-reads the results.
  const [ceiling, setCeiling] = useState(0);

  const dispersions = useMemo<Dispersions>(
    () => ({
      impulseFrac: Math.max(0, impulsePct) / 100,
      massFrac: Math.max(0, massPct) / 100,
      dragFrac: Math.max(0, dragPct) / 100,
      recoveryFrac: Math.max(0, recoveryPct) / 100,
      rodAngleDeg: Math.max(0, rodAngleDeg),
      windSpeedMps: Math.max(0, windSpeedMps),
    }),
    [impulsePct, massPct, dragPct, recoveryPct, rodAngleDeg, windSpeedMps],
  );

  // Debounce the dispersion inputs so typing in a field doesn't kick off a fresh 300-flight run on
  // every keystroke — the run waits until the value settles. (Serialised as the effect dependency so
  // a new object identity from an unchanged value doesn't re-trigger it.)
  const [settled, setSettled] = useState(dispersions);
  const dispKey = `${dispersions.impulseFrac}|${dispersions.massFrac}|${dispersions.dragFrac}|${dispersions.recoveryFrac}|${dispersions.rodAngleDeg}|${dispersions.windSpeedMps}`;
  useEffect(() => {
    const id = setTimeout(() => setSettled(dispersions), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispKey]);

  // Re-fly when opened, when a dispersion changes, or when an active what-if changes. Kept off the
  // main thread (batched) so the page stays responsive; a stale run is abandoned between batches.
  useEffect(() => {
    if (!open) {
      setResult(null);
      return;
    }
    let live = true;
    setRunning(true);
    setProgress(0);
    const sim = doc.simulations[simIndex] ?? doc.simulations[0];
    runMonteCarlo(
      doc.rocket,
      {
        n: SAMPLES,
        seed: SEED,
        dispersions: settled,
        configId: sim?.conditions.configId,
        overrides: sim ? overridesFromStored(sim) : undefined,
        ballastKg,
        recoveryCdScale,
        motorSwap,
        geometry,
      },
      () => !live,
      (done) => live && setProgress(done),
      // Draw the cloud as it forms — each partial replaces the last, refining toward the final run.
      (partial) => live && setResult(partial),
    ).then((r) => {
      if (!live || r === null) return;
      setResult(r);
      setRunning(false);
    });
    return () => {
      live = false;
    };
  }, [open, doc, simIndex, settled, ballastKg, recoveryCdScale, motorSwap, geometry]);

  return (
    <section
      aria-label="Monte-Carlo dispersion"
      className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Flight dispersion (Monte-Carlo)</h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{SAMPLES} flights on your device</span>
      </div>
      <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
        Fly this design hundreds of times with the motor impulse, dry mass, aerodynamic drag, rail
        angle, and wind jittered around their nominal values, and see the <em>spread</em> of the
        outcomes — the apogee band to expect
        and how big a recovery area to plan for. The physics is the same each flight; the uncertainty
        is your own stated assumptions carried through it, not new precision.
      </p>

      {!open && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            Run dispersion
          </button>
        </div>
      )}

      {open && (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <NumberField
              label="Motor impulse ±1σ"
              value={impulsePct}
              onChange={setImpulsePct}
              unit="%"
              step={1}
              hint="Total-impulse tolerance"
            />
            <NumberField
              label="Dry mass ±1σ"
              value={massPct}
              onChange={setMassPct}
              unit="%"
              step={1}
              hint="Build-mass tolerance"
            />
            <NumberField
              label="Aero drag ±1σ"
              value={dragPct}
              onChange={setDragPct}
              unit="%"
              step={1}
              hint="Drag-coefficient uncertainty"
            />
            <NumberField
              label="Recovery drag ±1σ"
              value={recoveryPct}
              onChange={setRecoveryPct}
              unit="%"
              step={1}
              hint="Parachute Cd·A uncertainty"
            />
            <NumberField
              label="Rail angle ±1σ"
              value={rodAngleDeg}
              onChange={setRodAngleDeg}
              unit="°"
              step={0.5}
              hint="Lean from vertical"
            />
            <NumberField
              label="Wind speed ±1σ"
              value={windSpeedMps}
              onChange={setWindSpeedMps}
              unit="m/s"
              step={0.5}
              hint="Around the nominal wind"
            />
          </div>

          {result !== null && result.n > 0 ? (
            // Once some flights have landed, show the distribution and let it refine in place. While
            // the run finishes, a slim indicator keeps the count visible so the cloud reads as
            // "still filling in", not final.
            <>
              {running && (
                <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400" role="status">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                  <span>Refining — {progress}/{SAMPLES} flown…</span>
                </div>
              )}
              <Report
                result={result}
                units={units}
                name={doc.rocket.name}
                ceiling={ceiling}
                onCeiling={setCeiling}
              />
            </>
          ) : running || result === null ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300" role="status">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              <span>
                Flying {SAMPLES}
                {progress > 0 ? ` — ${progress} done` : ""}…
              </span>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
              None of the dispersed flights could be flown on this design.
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Report({
  result,
  units,
  name,
  ceiling,
  onCeiling,
}: {
  result: MonteCarloResult;
  units: UnitSystem;
  name: string;
  ceiling: number;
  onCeiling: (v: number) => void;
}) {
  // The ceiling is entered in the chosen unit system; convert to metres to compare with the
  // (SI) sample apogees. 0/blank means "no ceiling set".
  const ceilingM = ceiling > 0 ? (units === "imperial" ? ftToM(ceiling) : ceiling) : 0;
  const exceed = ceilingM > 0 ? exceedanceProbability(result, ceilingM) : NaN;
  return (
    <div className="mt-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Apogee"
          stat={result.apogee}
          fmt={(v) => d.q(d.altitude(v, units))}
        />
        <StatCard
          title="Max speed"
          stat={result.maxVelocity}
          fmt={(v) => d.q(d.speed(v, units))}
        />
        <StatCard
          title="Landing speed"
          stat={result.landingSpeed}
          fmt={(v) => d.q(d.speed(v, units))}
        />
        <RadiusCard radius={result.landingRadiusP95} drift={result.driftDistance} units={units} />
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="w-40">
          <NumberField
            label="Waiver ceiling"
            value={ceiling}
            onChange={onCeiling}
            unit={units === "imperial" ? "ft" : "m"}
            step={units === "imperial" ? 500 : 100}
            placeholder="optional"
            hint="Altitude limit to check"
          />
        </div>
        {Number.isFinite(exceed) && (
          <div className="pb-1">
            <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Chance over ceiling
            </div>
            <div
              className={
                "mt-0.5 text-lg font-semibold tabular-nums " +
                (exceed > 0.05 ? "text-amber-700 dark:text-amber-300" : "text-zinc-900 dark:text-zinc-100")
              }
            >
              {formatChance(exceed)}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Apogee distribution
          </h3>
          <Histogram
            values={result.samples.map((s) => s.apogee)}
            toNumber={(v) => (units === "imperial" ? mToFt(v) : v)}
            unit={units === "imperial" ? "ft" : "m"}
            p5={result.apogee.p5}
            p95={result.apogee.p95}
            median={result.apogee.p50}
            ceiling={ceilingM > 0 ? ceilingM : undefined}
          />
        </div>
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Landing scatter (from the pad)
          </h3>
          <Scatter
            points={result.samples.map((s) => ({ x: s.landingX, y: s.landingY }))}
            radiusP95={result.landingRadiusP95}
            toNumber={(v) => (units === "imperial" ? mToFt(v) : v)}
            unit={units === "imperial" ? "ft" : "m"}
          />
        </div>
      </div>

      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        {result.n} flights; the bands are 5th–95th percentiles. Rail-lean and wind directions are
        sampled from all bearings, so the scatter maps the recovery area to plan for regardless of the
        day&apos;s wind heading.{" "}
        {Number.isFinite(exceed) &&
          `The chance over the ceiling is the fraction of these flights that topped it — it still carries the model's own apogee error, so keep real margin. `}
        These are estimates that propagate the input spread you set — verify against your own margins,
        never a go/no-go.
      </p>
      <div className="mt-2">
        <DownloadCsv rows={csvRows(result, units)} name={name} suffix="dispersion" />
      </div>
    </div>
  );
}

function StatCard({ title, stat, fmt }: { title: string; stat: Stat; fmt: (v: number) => string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{fmt(stat.p50)}</div>
      <div className="mt-0.5 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
        {fmt(stat.p5)} – {fmt(stat.p95)} <span className="text-zinc-400 dark:text-zinc-500">(5–95%)</span>
      </div>
    </div>
  );
}

function RadiusCard({ radius, drift, units }: { radius: number; drift: Stat; units: UnitSystem }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Recovery radius (95%)
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {d.q(d.distance(radius, units))}
      </div>
      <div className="mt-0.5 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
        median drift {d.q(d.distance(drift.p50, units))}
      </div>
    </div>
  );
}

/** A small SVG histogram of a sample set, with the median and 5–95% band marked. Theme-aware via
 *  Tailwind fill/stroke classes; no chart library. */
function Histogram({
  values,
  toNumber,
  unit,
  p5,
  p95,
  median,
  ceiling,
}: {
  values: number[];
  toNumber: (v: number) => number;
  unit: string;
  p5: number;
  p95: number;
  median: number;
  /** Optional waiver-ceiling value (same raw units as the samples) to mark; flights to its right
   *  are over the limit. */
  ceiling?: number;
}) {
  const W = 320;
  const H = 150;
  const padL = 4;
  const padR = 4;
  const padB = 22;
  const padT = 6;
  const xs = values.map(toNumber);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const span = hi - lo || 1;
  const BINS = 16;
  const counts = new Array(BINS).fill(0);
  for (const x of xs) {
    const b = Math.min(BINS - 1, Math.floor(((x - lo) / span) * BINS));
    counts[b] += 1;
  }
  const maxCount = Math.max(...counts, 1);
  const plotW = W - padL - padR;
  const plotH = H - padB - padT;
  const xAt = (v: number) => padL + ((toNumber(v) - lo) / span) * plotW;
  const barW = plotW / BINS;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-1.5 w-full" role="img" aria-label="Apogee distribution histogram">
      {/* 5–95% band */}
      <rect
        x={xAt(p5)}
        y={padT}
        width={Math.max(0, xAt(p95) - xAt(p5))}
        height={plotH}
        className="fill-indigo-500/10"
      />
      {counts.map((c, i) => {
        const h = (c / maxCount) * plotH;
        return (
          <rect
            key={i}
            x={padL + i * barW + 0.5}
            y={padT + plotH - h}
            width={Math.max(0.5, barW - 1)}
            height={h}
            className="fill-indigo-500/70"
          />
        );
      })}
      {/* median line */}
      <line
        x1={xAt(median)}
        x2={xAt(median)}
        y1={padT}
        y2={padT + plotH}
        className="stroke-indigo-600 dark:stroke-indigo-300"
        strokeWidth={1.5}
        strokeDasharray="3 2"
      />
      {/* waiver ceiling: shade the over-limit region and mark the line (clamped into the plot) */}
      {ceiling !== undefined &&
        (() => {
          const cx = Math.max(padL, Math.min(padL + plotW, xAt(ceiling)));
          return (
            <g>
              <rect x={cx} y={padT} width={padL + plotW - cx} height={plotH} className="fill-amber-500/15" />
              <line
                x1={cx}
                x2={cx}
                y1={padT}
                y2={padT + plotH}
                className="stroke-amber-600 dark:stroke-amber-400"
                strokeWidth={1.5}
              />
            </g>
          );
        })()}
      {/* axis min / max labels */}
      <text x={padL} y={H - 6} className="fill-zinc-500 text-[10px]" style={{ fontSize: 10 }}>
        {Math.round(lo).toLocaleString()} {unit}
      </text>
      <text x={W - padR} y={H - 6} textAnchor="end" className="fill-zinc-500 text-[10px]" style={{ fontSize: 10 }}>
        {Math.round(hi).toLocaleString()} {unit}
      </text>
    </svg>
  );
}

/** A small SVG scatter of landing points around the pad (origin), with the 95% recovery circle.
 *  Square aspect so distances read true; theme-aware. */
function Scatter({
  points,
  radiusP95,
  toNumber,
  unit,
}: {
  points: { x: number; y: number }[];
  radiusP95: number;
  toNumber: (v: number) => number;
  unit: string;
}) {
  const S = 150;
  const c = S / 2;
  // Scale so the furthest landing (or the 95% circle, whichever is larger) fits with a small margin.
  const maxR = Math.max(radiusP95, ...points.map((p) => Math.hypot(p.x, p.y)), 1);
  const scale = (c - 8) / maxR;
  const rCircle = radiusP95 * scale;
  return (
    <div className="mt-1.5">
      <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-[220px]" role="img" aria-label="Landing scatter around the pad">
        {/* axes through the pad */}
        <line x1={c} y1={4} x2={c} y2={S - 4} className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth={0.75} />
        <line x1={4} y1={c} x2={S - 4} y2={c} className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth={0.75} />
        {/* 95% recovery circle */}
        <circle cx={c} cy={c} r={rCircle} className="fill-indigo-500/5 stroke-indigo-500/50" strokeWidth={1} strokeDasharray="3 2" />
        {/* landings (y inverted so north is up) */}
        {points.map((p, i) => (
          <circle key={i} cx={c + p.x * scale} cy={c - p.y * scale} r={1.3} className="fill-indigo-500/60" />
        ))}
        {/* pad */}
        <circle cx={c} cy={c} r={2} className="fill-zinc-700 dark:fill-zinc-200" />
      </svg>
      <div className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
        circle = 95% within {d.fmt(toNumber(radiusP95), 0)} {unit}
      </div>
    </div>
  );
}

function csvRows(result: MonteCarloResult, units: UnitSystem): CsvCell[][] {
  const alt = units === "imperial" ? "ft" : "m";
  const spd = units === "imperial" ? "ft/s" : "m/s";
  const toAlt = (m: number) => (units === "imperial" ? mToFt(m) : m);
  const toSpd = (mps: number) => (units === "imperial" ? mpsToFtps(mps) : mps);
  const header: CsvCell[] = [
    "Flight",
    `Apogee (${alt})`,
    `Max velocity (${spd})`,
    `Drift distance (${alt})`,
    `Landing downrange (${alt})`,
    `Landing crossrange (${alt})`,
    `Landing speed (${spd})`,
  ];
  const body: CsvCell[][] = result.samples.map((s, i) => [
    i + 1,
    round(toAlt(s.apogee), 1),
    round(toSpd(s.maxVelocity), 1),
    round(toAlt(s.driftDistance), 1),
    round(toAlt(s.landingX), 1),
    round(toAlt(s.landingY), 1),
    round(toSpd(s.landingSpeed), 1),
  ]);
  return [header, ...body];
}
