"use client";

import { useEffect, useMemo, useState } from "react";
import { conditionsPhrase, type ConditionsSource } from "@/lib/what-if";
import type { OrkDocument } from "@/lib/ork/import";
import { overridesFromStored } from "@/lib/sim/run";
import type { ConditionOverrides } from "@/lib/sim/setup";
import { runMonteCarlo } from "@/lib/sim/montecarlo-client";
import {
  exceedanceProbability,
  landingSpeedExceedance,
  FIRM_LANDING_MPS,
  HARD_LANDING_MPS,
  type Dispersions,
  type MonteCarloResult,
  type Stat,
} from "@/lib/sim/montecarlo";
import type { GeometryEdits } from "@/lib/model/edit";
import { usePersistedNumber, useSettled } from "@/lib/session";
import { mToFt, ftToM, mpsToFtps, mpsToMph, mphToMps } from "@/lib/units";
import type { CsvCell } from "@/lib/csv";
import { Button, Card, ClosePanel, Extrapolated, NumberField, useReturnFocus } from "./ui";
import DownloadCsv, { CopyTable } from "./DownloadCsv";
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
  designKey,
  flownOverrides,
  weatherSerial,
  conditions,
}: {
  doc: OrkDocument;
  simIndex: number;
  units: UnitSystem;
  ballastKg?: number;
  recoveryCdScale?: number;
  motorSwap?: { manufacturer?: string; designation: string; diameter?: number };
  geometry?: GeometryEdits;
  /** One string standing for the design being flown. The props above are rebuilt on every render,
   *  so depending on their identity would restart the run whenever anything re-renders; this is
   *  their *value*, and it is what decides when the dispersion is genuinely out of date. */
  designKey: string;
  /** The launch conditions the flight in view was actually flown under. This study built its own
   *  nominal from the design FILE, so it answered for a different day than the Flight card beside
   *  it: on the 54 mm dual-deploy sample with surface wind set to 20 mph, the card's drift moved
   *  630 m to 1,877 m while this panel's recovery radius (95%) stayed at 1,203 m against a true
   *  2,519 m and its median drift at 593 m against 1,811 m. A 1,500 m field takes the chance of
   *  busting a 3,000 m ceiling from 36% to 83%. Those are the numbers a flyer plans a field and a
   *  recovery walk around. */
  flownOverrides?: ConditionOverrides;
  /** Bumped once per forecast fetched — the only thing that can tell one forecast's air from the
   *  next, since an atmosphere and a wind profile are functions with no value to compare. */
  weatherSerial?: number;
  /** Where each launch condition came from, so this panel names what IT flew. */
  conditions?: ConditionsSource;
}) {
  // A key for the CONDITIONS, separate from `designKey`. That shared key is watched by both sweeps
  // and by the RocketPy cross-check, and all three fly BALLISTIC — `runFlight` zeroes the wind for a
  // ballistic run, so a wind edit measurably changes nothing in them (apogee 2,941 m at 3 m/s and at
  // 8.94 m/s, identical). Adding the wind to the shared key would throw minutes of their work away
  // for a change that changed nothing, which is the exact waste `designKey` exists to avoid. So the
  // sweeps carry their own narrower key covering rail length, rail angle and elevation, and this
  // study — the one that does read the wind — carries this one. The RocketPy cross-check
  // deliberately keeps flying the FILE's conditions: it exists to compare two solvers like-for-like
  // against the design as saved, so the flyer's day is not the question it answers.
  const o = flownOverrides;
  const conditionsKeyLive = [
    o?.rodLength ?? "",
    o?.rodAngleDeg ?? "",
    o?.rodAzimuthDeg ?? "",
    o?.windSpeed ?? "",
    o?.launchAltitude ?? "",
    // A wind PROFILE and an atmosphere are functions, so identity is all there is to compare; they
    // are rebuilt only when a forecast is fetched, which is exactly when this should re-fly.
    o?.windProfile ? "profile" : "",
    o?.atmosphere ? "atm" : "",
    weatherSerial ?? "",
  ].join("|");
  // Settled, not live. `Num` calls `onChange` on every keystroke so a value can be typed a digit
  // at a time, and each intermediate reading is a distinct key — typing "1500" into the field
  // elevation restarted this panel four times, flying every candidate at 1 m, 15 m and 150 m on the
  // way. The dispersion's own sigma inputs have been debounced for exactly this reason since they
  // were added; the launch conditions reach the same panels through the same kind of field.
  const conditionsKey = useSettled(conditionsKeyLive, conditionsKeyLive);
  // Under today's weather the solver reads a wind PROFILE and never looks at a surface wind, so the
  // spread below cannot be applied to it: `windAt` returns `windProfile(altAgl)` whenever a profile
  // is set. Measured with a constant 8.94 m/s profile over 200 flights, the drift band is
  // bit-identical at a 0 and a 2 m/s sigma — 1,553 / 1,877 / 2,158 m either way — where without a
  // profile the same sigma widens it to 1,167 / 1,794 / 2,563 m. A field that demonstrably does
  // nothing must not sit there looking as though it does.
  const windProfileInForce = flownOverrides?.windProfile !== undefined;

  const [open, setOpen] = useState(false);
  // Closing unmounts the Close button; focus has to land on the Run button that replaces it.
  const [runRef, returnFocusToRun] = useReturnFocus();
  // Dispersion 1σ inputs, with common planning defaults: a ~5% motor total-impulse band, a couple
  // of degrees of rail lean, and a couple of m/s of wind variability. All editable — and kept,
  // because they are the flyer's own standing assumptions about their build quality and their
  // field, not something they should re-enter for every design and every reload.
  const [impulsePct, setImpulsePct] = usePersistedNumber("mc.impulsePct", 5);
  const [massPct, setMassPct] = usePersistedNumber("mc.massPct", 3);
  const [dragPct, setDragPct] = usePersistedNumber("mc.dragPct", 10);
  const [recoveryPct, setRecoveryPct] = usePersistedNumber("mc.recoveryPct", 15);
  const [rodAngleDeg, setRodAngleDeg] = usePersistedNumber("mc.rodAngleDeg", 2);
  const [windSpeedMps, setWindSpeedMps] = usePersistedNumber("mc.windSpeedMps", 2);
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  // Display <-> SI for the wind sigma, converting and NOTHING else. Deliberately not clamped here:
  // NumberField applies the bound itself and then says which value it flew instead, and a parent that
  // "helpfully" resolves an out-of-range entry first is exactly what stops that refusal from ever
  // being shown — a mistyped "-5" would go back to reading as a flown 0. Rounding is display-only and
  // imperial-only, so the m/s the model holds is never walked by a toggle.
  const windDisp = units === "imperial" ? Number(mpsToMph(windSpeedMps).toFixed(1)) : windSpeedMps;
  const onWindDisp = (v: number) => setWindSpeedMps(units === "imperial" ? mphToMps(v) : v);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  // Waiver/altitude ceiling to check the apogee band against — held in METRES, like every other
  // value in the model, and converted only where it is typed and read. Post-hoc on the existing
  // samples, so changing it never re-flies; it only re-reads the results.
  //
  // It used to be held in whatever units were on screen, which meant the unit toggle silently
  // reinterpreted it: a 3,000 ft waiver on this project's 38 mm sample (apogee 3,230 ft) reads
  // "chance over ceiling 86%", and switching to metric left 3000 in the box, now meaning 3,000 m,
  // and the same rocket read 0%. A waiver bust reading as clean, from a gesture nobody expects to
  // change what they entered.
  const [ceilingM, setCeilingM] = useState(0);

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
      // Everything the panel SHOWS resets, not only the result. `running` and `progress` used to
      // survive a close, and the reopen renders before this effect does — so the panel painted
      // "Flying 300 — 296 done…" for a run in which no flight had yet been made. Unreachable while
      // `open` was one-way; the close control is what put live values in this branch.
      setResult(null);
      setRunning(false);
      setProgress(0);
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
        overrides: flownOverrides ?? (sim ? overridesFromStored(sim) : undefined),
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
    // Keyed on the design's value, not the props' identity — see `designKey`. A changed dispersion
    // tolerance still re-flies; an unrelated re-render no longer restarts hundreds of flights.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, settled, designKey, conditionsKey]);

  return (
    <Card as="section" aria-label="Monte-Carlo dispersion">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-medium tracking-tight">Flight dispersion (Monte-Carlo)</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{SAMPLES} flights on your device</span>
          {open && <ClosePanel onClose={() => { setOpen(false); returnFocusToRun(); }} what="the dispersion run" />}
        </div>
      </div>
      <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
        Fly this design hundreds of times with the motor impulse, dry mass, aerodynamic drag, rail
        angle, and wind jittered around their nominal values, and see the <em>spread</em>{" "}of the
        outcomes — the apogee band to expect
        and how big a recovery area to plan for. The physics is the same each flight; the uncertainty
        is your own stated assumptions carried through it, not new precision.{" "}
        {/* Which conditions those nominals ARE. The two sweeps beside this panel each say the same
            thing about themselves; this one said nothing while quietly flying the design file's
            setup rather than the flyer's, and the recovery radius is not a number to be vague
            about. */}
        The nominals are {conditionsPhrase(conditions, { wind: true })}. Change them under{" "}
        <em>Conditions</em> and this re-flies.
        {/* Under a wind profile the scatter is NOT a disc over all headings. `windAt` returns the
            profile and never reads the sampled bearing, so every one of the flights drifts on the
            forecast's own wind — the spread is that one day's, not an all-bearings recovery area.
            Saying it here because this panel is sold as "how big a recovery area to plan for". */}
        {windProfileInForce && (
          <>
            {" "}
            Today&apos;s forecast supplies a wind profile, so every flight drifts on its bearings
            rather than on all of them: this is the spread for that wind, not a circle covering any
            wind. Switch to <em>As designed</em>{" "}for the all-headings recovery area.
          </>
        )}
      </p>

      {!open && (
        <div className="mt-3">
          <Button variant="primary" ref={runRef} onClick={() => setOpen(true)}>
            Run dispersion
          </Button>
        </div>
      )}

      {open && (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {/* `value={x || ""}` with `placeholder="0"`: a spread nobody has set reads as an empty box
                over a grey 0, not as a typed zero — but the field still knows what it is flying, so a
                refused entry can say "flying 0" rather than falling back to "the design's own value",
                which is a sentence about a design file and means nothing on a dispersion panel. */}
            <NumberField
              label="Motor impulse ±1σ"
              value={impulsePct || ""}
              placeholder="0"
              onChange={(v) => setImpulsePct(v === "" ? 0 : Number(v))}
              unit="%"
              step={1}
              hint="Total-impulse tolerance"
            />
            <NumberField
              label="Dry mass ±1σ"
              value={massPct || ""}
              placeholder="0"
              onChange={(v) => setMassPct(v === "" ? 0 : Number(v))}
              unit="%"
              step={1}
              hint="Build-mass tolerance"
            />
            <NumberField
              label="Aero drag ±1σ"
              value={dragPct || ""}
              placeholder="0"
              onChange={(v) => setDragPct(v === "" ? 0 : Number(v))}
              unit="%"
              step={1}
              hint="Drag-coefficient uncertainty"
            />
            <NumberField
              label="Recovery drag ±1σ"
              value={recoveryPct || ""}
              placeholder="0"
              onChange={(v) => setRecoveryPct(v === "" ? 0 : Number(v))}
              unit="%"
              step={1}
              hint="Parachute Cd·A uncertainty"
            />
            <NumberField
              label="Rail angle ±1σ"
              value={rodAngleDeg || ""}
              placeholder="0"
              onChange={(v) => setRodAngleDeg(v === "" ? 0 : Number(v))}
              unit="°"
              step={0.5}
              hint="Lean from vertical"
            />
            {/* Held in m/s like the rest of the model and converted only where it is typed and read —
                the same shape as the Waiver ceiling below. It was the one unit-bearing input on the
                page that ignored the toggle: it said "m/s" honestly enough, but it said it directly
                beside a sibling reading "ft" and a Conditions wind field reading "mph". */}
            <NumberField
              label="Wind speed ±1σ"
              value={windDisp || ""}
              placeholder="0"
              onChange={(v) => onWindDisp(v === "" ? 0 : Number(v))}
              unit={units === "imperial" ? "mph" : "m/s"}
              step={units === "imperial" ? 1 : 0.5}
              disabled={windProfileInForce}
              hint={
                windProfileInForce
                  ? "Today's weather flies a whole wind profile rather than one surface wind, so a spread on the surface figure has nothing to vary — switch to As designed to use it."
                  : "Around the nominal wind"
              }
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
              {/* Dimmed and marked busy while a fresh run is in flight, exactly as both sweeps do.
                  The previous cloud is deliberately kept so an edit can be compared against what it
                  changed rather than against a spinner — but at full opacity, under a caption that
                  flips the instant a Conditions field is touched, it read as the answer FOR those
                  conditions. On the 54 mm sample that is 1,203 m presented as current while the true
                  figure for the day just entered is 2,519 m. */}
              <div aria-busy={running} className={running ? "opacity-50 transition-opacity" : undefined}>
                <Report
                  result={result}
                  units={units}
                  name={doc.rocket.name}
                  ceilingM={ceilingM}
                  onCeilingM={setCeilingM}
                />
              </div>
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
            <Card tone="sunken" className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
              None of the dispersed flights could be flown on this design.
            </Card>
          )}
        </>
      )}
    </Card>
  );
}

function Report({
  result,
  units,
  name,
  ceilingM,
  onCeilingM,
}: {
  result: MonteCarloResult;
  units: UnitSystem;
  name: string;
  /** The ceiling in metres. 0 = none set. */
  ceilingM: number;
  onCeilingM: (v: number) => void;
}) {
  // The ceiling is HELD in metres and only shown in the chosen system, so switching systems
  // re-labels the same altitude instead of re-reading the same digits as a different one. Rounded
  // to a whole unit for the field: a waiver is quoted in whole feet or metres, and 3,937.007874 ft
  // in the box would be a conversion artefact, not the flyer's number. The rounding never reaches
  // the state — it is written back only if the flyer actually edits the field.
  const ceiling = ceilingM > 0 ? Math.round(units === "imperial" ? mToFt(ceilingM) : ceilingM) : 0;
  const onCeiling = (v: number) => onCeilingM(v > 0 ? (units === "imperial" ? ftToM(v) : v) : 0);
  const exceed = ceilingM > 0 ? exceedanceProbability(result, ceilingM) : NaN;
  // How often the dispersed flights land firm (>7.6 m/s) or hard (>10.7 m/s) — the recovery-adequacy
  // question the landing-speed band alone doesn't answer: not just the worst case, but how likely.
  // Only surfaced when some flights actually land firm, so a comfortably-soft design stays uncluttered.
  const firmChance = landingSpeedExceedance(result, FIRM_LANDING_MPS);
  const hardChance = landingSpeedExceedance(result, HARD_LANDING_MPS);
  // The envelope the dispersion left, when any of it did. The flight card has marked a transonic
  // flight since the treatment existed, and this panel — flying the SAME solver over the SAME design,
  // 300 times — marked nothing, so the identical caveat applied to one number and not to the band
  // around it. Counted rather than flagged: a dispersion straddles M0.8 whenever the design sits
  // near it, and "12 of 300" is a different claim from "300 of 300".
  const extrapolatedWhy =
    result.extrapolatedN > 0
      ? `${result.extrapolatedN} of ${result.n} dispersed flights reach past M0.8, outside the drag model's validated subsonic envelope — treat the bands below as rough`
      : undefined;
  return (
    <div className="mt-4">
      {extrapolatedWhy && (
        <div className="mb-3">
          <Extrapolated reason={extrapolatedWhy} />
        </div>
      )}
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
        {/* Withheld, not zeroed, when nothing reached the ground. `landingSpeed` and
            `landingEnergy` are 0 sentinels on a flight still airborne at the time cap, and
            summarising them published a 0.00 m/s median landing speed for a design where no sample
            landed at all — while the flight card one route away withholds those exact two figures
            with a reason. Two surfaces disagreeing about whether a number exists is worse than
            either alone. */}
        {result.landedN > 0 ? (
          <StatCard
            title="Landing speed"
            stat={result.landingSpeed}
            fmt={(v) => d.q(d.speed(v, units))}
          />
        ) : (
          <WithheldCard
            title="Landing speed"
            why="no dispersed flight reached the ground inside the time cap — reduce the recovery size, or check the deployment altitude and event"
          />
        )}
        {/* Withheld on the same population as the card beside it. Drift is taken from the
            solver's exit position, which for a flight still descending at the cap is where it had
            got to — a plausible smaller number rather than an obvious zero, understating the
            recovery area on the one figure that exists to size it. */}
        {result.landedN > 0 ? (
          <RadiusCard radius={result.landingRadiusP95} drift={result.driftDistance} units={units} />
        ) : (
          <WithheldCard
            title="Recovery radius (95%)"
            why="no dispersed flight reached the ground inside the time cap, so none has a landing point to draw a radius around — reduce the recovery size, or check the deployment altitude and event"
          />
        )}
      </div>

      {result.landedN > 0 && result.landedN < result.n && (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
          <span className="font-medium">Landing figures cover {result.landedN} of {result.n} flights.</span>{" "}
          The rest were still descending at the {"1,200"} s cap, so they carry no landing speed,
          energy, drift or landing point, and are left out of all four rather than counted as a soft
          landing that happened nearer the pad than it would have.
        </p>
      )}

      {result.landedN > 0 && result.landingEnergy.p95 > 0 && (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          <span className="font-medium">Landing energy:</span> {d.q(d.energy(result.landingEnergy.p50, units))} median,{" "}
          {d.q(d.energy(result.landingEnergy.p95, units))} worst-case (95th percentile) — the whole vehicle
          as one piece. Many fields and waivers cap the per-section landing energy; a design that comes down in
          separated sections divides this among them, so read it as a conservative whole-airframe figure.
        </p>
      )}

      {firmChance > 0 && (
        <p
          className={
            "mt-3 text-sm " +
            (firmChance > 0.05
              ? "text-amber-700 dark:text-amber-300"
              : "text-zinc-500 dark:text-zinc-400")
          }
        >
          {/* Thresholds shown to their exact value (a rounded "8 m/s" would misstate what's counted);
              imperial shows the round 25/35 ft/s the rule of thumb is quoted in. */}
          <span className="font-medium">Landing hardness:</span> {formatChance(firmChance)} of flights
          land firm (over {units === "imperial" ? "25 ft/s" : `${FIRM_LANDING_MPS} m/s`})
          {hardChance > 0
            ? `, ${formatChance(hardChance)} hard (over ${units === "imperial" ? "35 ft/s" : `${HARD_LANDING_MPS} m/s`})`
            : ""}
          . A larger canopy softens the landing (and its whole band).
        </p>
      )}

      <Card tone="sunken" className="mt-3 flex flex-wrap items-end gap-3">
        <div className="w-40">
          <NumberField
            label="Waiver ceiling"
            value={ceiling || ""}
            onChange={(v) => onCeiling(v === "" ? 0 : Number(v))}
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
                "mt-0.5 text-xl font-semibold tabular-nums " +
                (exceed > 0.05 ? "text-amber-700 dark:text-amber-300" : "text-zinc-900 dark:text-zinc-100")
              }
            >
              {formatChance(exceed)}
            </div>
          </div>
        )}
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
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
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Landing scatter (from the pad)
          </h3>
          <Scatter
            // Landed samples only. `landingX`/`landingY` are the solver's exit position, so an
            // un-landed flight plotted as a landing point is a rocket drawn on the ground where it
            // was still in the air — and it sits INSIDE the real scatter, pulling the cloud toward
            // the pad rather than looking like the outlier it is.
            points={result.samples.filter((s) => s.landed).map((s) => ({ x: s.landingX, y: s.landingY }))}
            radiusP95={result.landingRadiusP95}
            toNumber={(v) => (units === "imperial" ? mToFt(v) : v)}
            unit={units === "imperial" ? "ft" : "m"}
          />
        </div>
      </div>

      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        {/* Explicit: the space between an expression and the text after it is the one JSX drops,
            and it shipped "300flights;" here. The sibling caption above survives only because its
            text sits on its own line. */}
        {result.n}{" "}
        flights; the bands are 5th–95th percentiles.{" "}
        {/* One caption, two populations, and it used to claim all of them for both charts. The
            apogee histogram is over every flown sample; the scatter and the drift band are over the
            ones that reached the ground. Naming the split here as well as in the amber note above
            costs a clause and stops the charts and the cards disagreeing. */}
        {result.landedN < result.n &&
          `The apogee spread covers all ${result.n}; the scatter and the drift band cover the ${result.landedN} that landed. `}
        Rail-lean and wind directions are
        sampled from all bearings, so the scatter maps the recovery area to plan for regardless of the
        day&apos;s wind heading.{" "}
        {Number.isFinite(exceed) &&
          `The chance over the ceiling is the fraction of these flights that topped it — it still carries the model's own apogee error, so keep real margin. `}
        These are estimates that propagate the input spread you set — verify against your own margins,
        never a go/no-go.
      </p>
      <div className="mt-2">
        <DownloadCsv rows={csvRows(result, units)} name={name} suffix="dispersion" />
        <CopyTable rows={csvRows(result, units)} />
      </div>
    </div>
  );
}

/** A stat that cannot be computed, saying why and what would restore it. `DESIGN.md` §6: "a
 *  withheld value says why, and what would restore it. A blank cell is a bug." */
function WithheldCard({ title, why }: { title: string; why: string }) {
  return (
    <Card tone="sunken">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-zinc-400 dark:text-zinc-500" aria-label={`${title} withheld: ${why}`}>
        —
      </div>
      <div className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{why}</div>
    </Card>
  );
}

function StatCard({ title, stat, fmt }: { title: string; stat: Stat; fmt: (v: number) => string }) {
  return (
    <Card tone="sunken">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{fmt(stat.p50)}</div>
      <div className="mt-0.5 text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
        {fmt(stat.p5)} – {fmt(stat.p95)} <span className="text-zinc-400 dark:text-zinc-500">(5–95%)</span>
      </div>
    </Card>
  );
}

function RadiusCard({ radius, drift, units }: { radius: number; drift: Stat; units: UnitSystem }) {
  return (
    <Card tone="sunken">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Recovery radius (95%)
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {d.q(d.distance(radius, units))}
      </div>
      <div className="mt-0.5 text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
        median drift {d.q(d.distance(drift.p50, units))}
      </div>
    </Card>
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
      <text x={padL} y={H - 6} className="fill-zinc-500 text-[11px]" style={{ fontSize: 11 }}>
        {Math.round(lo).toLocaleString()} {unit}
      </text>
      <text x={W - padR} y={H - 6} textAnchor="end" className="fill-zinc-500 text-[11px]" style={{ fontSize: 11 }}>
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
  // Nothing landed, so there is no scatter and no circle — say that instead of drawing an empty
  // plot. This is `DESIGN.md` §5's empty state, and without it the arithmetic below propagates:
  // `Math.max(NaN, ...[], 1)` is NaN, so `scale` and `rCircle` are NaN, React writes `r="NaN"` into
  // the SVG, and the caption reads "circle = 95% within NaN m". Withholding the radius upstream is
  // what makes this reachable, so the two changes belong together.
  if (points.length === 0 || !Number.isFinite(radiusP95)) {
    return (
      <div className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
        No dispersed flight reached the ground inside the time cap, so there are no landing points to
        plot. Reduce the recovery size, or check the deployment altitude and event.
      </div>
    );
  }
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
      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        circle = 95% within {d.fmt(toNumber(radiusP95), 0)} {unit}
      </div>
    </div>
  );
}

function csvRows(result: MonteCarloResult, units: UnitSystem): CsvCell[][] {
  const alt = units === "imperial" ? "ft" : "m";
  const spd = units === "imperial" ? "ft/s" : "m/s";
  const eu = units === "imperial" ? "ft·lbf" : "J";
  const toAlt = (m: number) => (units === "imperial" ? mToFt(m) : m);
  const toSpd = (mps: number) => (units === "imperial" ? mpsToFtps(mps) : mps);
  const toEnergy = (j: number) => (units === "imperial" ? j * 0.737562 : j);
  // `Landed` first among the landing columns, and every landing cell BLANK when it is false.
  //
  // The export carried what the panel refuses to show: a sample still airborne at the cap emitted a
  // 0 m/s landing speed, a 0 J energy and a part-way drift under plain headers, with nothing to tell
  // them from measurements. A flyer pulling the CSV into a spreadsheet to find the worst-case
  // landing energy for a waiver averaged initialisation zeros into it — the exact failure the panel
  // itself was fixed for, one click away. A blank cell is the honest form here: it is what the CSV
  // reader's own aggregate functions skip, where a 0 is what they average.
  const header: CsvCell[] = [
    "Flight",
    `Apogee (${alt})`,
    `Max velocity (${spd})`,
    "Landed",
    `Drift distance (${alt})`,
    `Landing downrange (${alt})`,
    `Landing crossrange (${alt})`,
    `Landing speed (${spd})`,
    `Landing energy (${eu})`,
  ];
  const body: CsvCell[][] = result.samples.map((s, i) => [
    i + 1,
    round(toAlt(s.apogee), 1),
    round(toSpd(s.maxVelocity), 1),
    s.landed ? "yes" : "no",
    ...(s.landed
      ? [
          round(toAlt(s.driftDistance), 1),
          round(toAlt(s.landingX), 1),
          round(toAlt(s.landingY), 1),
          round(toSpd(s.landingSpeed), 1),
          round(toEnergy(s.landingEnergy), 1),
        ]
      : ["", "", "", "", ""]),
  ]);
  return [header, ...body];
}
