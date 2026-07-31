"use client";

import { useEffect, useState } from "react";
import { conditionsPhrase, type ConditionsSource } from "@/lib/what-if";
import type { OrkDocument } from "@/lib/ork/import";
import { overridesFromStored } from "@/lib/sim/run";
import type { ConditionOverrides } from "@/lib/sim/setup";
import { type SweepMotor, type MotorSweepRow } from "@/lib/sim/sweep";
import { RECOMMENDED_FLUTTER_MARGIN } from "@/lib/sim/flutter";
import { LIFTOFF_TWR_GUIDELINE, RAIL_EXIT_GUIDELINE_MPS } from "@/lib/sim/simulate";
import { runMotorSweep } from "@/lib/sim/sweep-client";
import type { GeometryEdits } from "@/lib/model/edit";
import { mToFt, mpsToFtps } from "@/lib/units";
import { usePersistedChoice, useSettled } from "@/lib/session";
import type { CsvCell } from "@/lib/csv";
import DownloadCsv, { CopyTable } from "./DownloadCsv";
import { TOUCH_TARGET_SQUARE } from "@/lib/ui-tokens";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";
import { Button, Card, ClosePanel, useReturnFocus } from "./ui";

const round = (n: number, dp: number) => (Number.isFinite(n) ? Math.round(n * 10 ** dp) / 10 ** dp : "");

/** A cell whose value sits under one of the launch-safety rules of thumb.
 *
 *  Colour carried the whole flag, and a `title` on a `<td>` carried the whole explanation. A `<td>`
 *  takes no focus, so the tooltip was unreachable by keyboard; there is no hover on a phone, which is
 *  the stated use for this panel; and a screen reader was told nothing at all. Amber text alone also
 *  puts the entire signal in one colour channel. So the marker is a GLYPH the sighted reader can see
 *  without colour, and the sentence the tooltip used to hide is `sr-only` text on the same cell —
 *  read aloud in the row it belongs to, rather than sitting in an attribute nothing announces.
 *
 *  The wording stays a note, never a verdict: Loft predicts, and a rule of thumb is not a go/no-go. */
function Flag({ note }: { note: string }) {
  // `relative` is load-bearing, not decoration. `sr-only` is `position: absolute`, and an absolutely
  // positioned box is clipped by an ancestor's `overflow` only when that ancestor is its containing
  // block. The table's `overflow-x-auto` wrapper is not positioned, so without this the hidden text
  // escaped the scroller, took its position from the initial containing block, and stretched the
  // DOCUMENT to the table's full 683 px — measured 102 px of sideways scroll on a 390 px phone, on
  // the workspace whose whole point is being usable at the pad. Positioning it here puts the
  // containing block back inside the scroller.
  return (
    <span className="relative">
      <span aria-hidden className="ml-1 font-sans text-[10px] font-semibold">
        &#9650;
      </span>
      <span className="sr-only"> — {note}</span>
    </span>
  );
}

/** Motor sweep: fly this airframe on every bundled motor of the casing it already flies, under one clean
 *  ballistic baseline, and lay the results side by side — the "which motor gets me to my target?"
 *  question answered at a glance, in the browser. Reuses the same motor-swap the what-if picker
 *  uses, so each row is exactly the flight that picking that motor would produce. It honours the
 *  active nose-ballast and geometry what-ifs, so the sweep is over the design the flyer is looking
 *  at. Because it's a like-for-like comparison, every motor flies ballistic to apogee under the
 *  launch conditions being flown — the design's own stored setup with the flyer's Conditions edits
 *  on top (recovery and wind removed; `runFlight` zeroes the wind for a ballistic run).
 *
 *  Not the same conditions as the RocketPy cross-check, which this used to claim to match: that
 *  panel flies `overridesFromStored(sim)` and never sees a Conditions edit, because its job is to
 *  put two engines on the design FILE's own flight. The shared half is the method — ballistic to
 *  apogee, recovery and wind removed — not the numbers, and the two diverge the moment a rail
 *  angle or a field elevation is typed. */
export default function MotorSweep({
  doc,
  simIndex,
  units,
  options,
  designMotor,
  designManufacturer,
  ballastKg,
  geometry,
  designKey,
  flownOverrides,
  weatherSerial,
  conditions,
}: {
  doc: OrkDocument;
  simIndex: number;
  units: UnitSystem;
  /** Bundled motors of the design's mount diameter — the same list the swap picker offers. */
  options: SweepMotor[];
  /** The design's own motor designation, to mark its row. */
  designMotor: string;
  /** That motor's manufacturer as the catalog spells it, when it matched exactly. Without it a
   *  designation-only mark badges every manufacturer's motor of that name as the design's own. */
  designManufacturer?: string;
  /** Active "what-if" nose ballast (kg), applied to every motor in the sweep. */
  ballastKg?: number;
  /** Active builder geometry edits, applied to every motor in the sweep. */
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

  const [open, setOpen] = useState(false);
  // Closing unmounts the Close button; focus has to land on the Run button that replaces it.
  const [runRef, returnFocusToRun] = useReturnFocus();
  const [rows, setRows] = useState<MotorSweepRow[] | null>(null);
  const [running, setRunning] = useState(false);
  // Every option was filtered to one casing, so any of them states it.
  const casingMm = Math.round((options[0]?.diameter ?? 0) * 1000);

  // Run the sweep off the main thread (falls back to synchronous if no worker), so a design's
  // dozens of flights don't freeze the UI. A stale run (inputs changed mid-flight) is ignored.
  useEffect(() => {
    if (!open) {
      // `running` resets with the rows: it is stale the moment the panel closes, and the reopen
      // renders before this effect runs. See the same branch in MonteCarlo.
      setRows(null);
      setRunning(false);
      return;
    }
    let live = true;
    setRunning(true);
    const sim = doc.simulations[simIndex] ?? doc.simulations[0];
    runMotorSweep(
      doc.rocket,
      options,
      {
        configId: sim?.conditions.configId,
        overrides: flownOverrides ?? (sim ? overridesFromStored(sim) : undefined),
        ballastKg,
        geometry,
        designMotor,
        designManufacturer,
      },
      () => !live,
    ).then((r) => {
      if (!live) return;
      setRows(r);
      setRunning(false);
    });
    return () => {
      live = false;
    };
    // Deliberately keyed on the design's value, not on the props' identity — see `designKey`. The
    // sweep re-runs when the design actually changes and survives an unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, designKey, ballisticConditionsKey]);

  return (
    <Card as="section" aria-label="Motor sweep">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Compare fitting motors</h2>
        {/* The list is filtered by the CASING the design flies, not by the mount's bore, and the two
            are not the same number: a 54 mm mount can fly a 38 mm motor in an adapter, and it is the
            38 mm ones that are offered. Saying "fits this mount" claimed the wider set and was
            checkably false against the design file, which states the bore outright. */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {options.length} bundled {casingMm} mm motors
          </span>
          {open && <ClosePanel onClose={() => { setOpen(false); returnFocusToRun(); }} what="the motor sweep" />}
        </div>
      </div>
      <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
        Fly this airframe on every bundled motor of the same {casingMm}{" "}
        mm casing it already flies, all at once, and see
        how apogee, speed, rail-exit velocity, stability, and fin-flutter margin change across them —
        the classic &ldquo;which motor gets me to my target?&rdquo; sweep (and whether a punchier one
        pushes the fins toward flutter), run entirely on your device.
      </p>

      {!open && (
        <div className="mt-3">
          <Button variant="primary" ref={runRef} onClick={() => setOpen(true)}>
            Run motor sweep
          </Button>
        </div>
      )}

      {open && running && (
        <div className="mt-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300" role="status">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span>
            Flying {options.length} motors
            {rows !== null && rows.length > 0 ? " again for the edited design — the table below is the previous run" : "…"}
          </span>
        </div>
      )}

      {open && !running && rows !== null && rows.length === 0 && (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
          None of the fitting motors could be flown on this airframe.
        </div>
      )}

      {/* The previous run stays on screen while the next one flies, dimmed and announced above as the
          previous design's — so an edit can be compared against what it changed rather than against a
          spinner. It is never left unlabelled: the status line says which it is. */}
      {open && rows !== null && rows.length > 0 && (
        <div aria-busy={running} className={running ? "opacity-50 transition-opacity" : undefined}>
          <SweepTable rows={rows} units={units} name={doc.rocket.name} conditions={conditions} />
        </div>
      )}
    </Card>
  );
}

function sweepCsv(rows: MotorSweepRow[], units: UnitSystem): CsvCell[][] {
  const spd = units === "imperial" ? "ft/s" : "m/s";
  const alt = units === "imperial" ? "ft" : "m";
  const toAlt = (m: number) => (units === "imperial" ? mToFt(m) : m);
  const toSpd = (mps: number) => (units === "imperial" ? mpsToFtps(mps) : mps);
  const header: CsvCell[] = ["Motor", "Manufacturer", "Class", `Apogee (${alt})`, `Max velocity (${spd})`, `Rail-exit (${spd})`, "Thrust-to-weight", "Static margin (cal)", "Fin flutter margin (x)", "Optimum delay (s)", "Design"];
  const body: CsvCell[][] = rows.map((r) => [
    r.designation,
    r.manufacturer,
    r.motorClass,
    round(toAlt(r.apogee), 1),
    round(toSpd(r.maxVelocity), 1),
    round(toSpd(r.railExitVelocity), 1),
    round(r.thrustToWeight, 2),
    round(r.staticMarginCal, 2),
    // Three places, not two: the on-screen cell keeps a thin margin's digits, and a column that
    // exported "0" for a number the table shows as 0.005× would disagree with what it came from.
    round(r.flutterMargin, 3),
    round(r.optimumDelay, 1),
    r.isDesign ? "yes" : "",
  ]);
  return [header, ...body];
}

/** The sortable columns, and what each sorts on. Apogee descending is the default because the
 *  question this table exists to answer is "how high does each of these get me?" — but it is only
 *  the first question. Which motor clears the rail fastest, which leaves the most flutter margin,
 *  which needs the shortest delay: each is one click, and each is a real reason to pick a motor. */
const COLUMNS = [
  { key: "designation", label: "Motor", numeric: false, get: (r: MotorSweepRow) => r.designation },
  { key: "motorClass", label: "Class", numeric: false, get: (r: MotorSweepRow) => r.motorClass },
  { key: "apogee", label: "Apogee", numeric: true, get: (r: MotorSweepRow) => r.apogee },
  { key: "maxVelocity", label: "Max V", numeric: true, get: (r: MotorSweepRow) => r.maxVelocity },
  { key: "railExitVelocity", label: "Rail exit", numeric: true, get: (r: MotorSweepRow) => r.railExitVelocity },
  { key: "thrustToWeight", label: "T:W", numeric: true, get: (r: MotorSweepRow) => r.thrustToWeight },
  { key: "staticMarginCal", label: "Margin", numeric: true, get: (r: MotorSweepRow) => r.staticMarginCal },
  { key: "flutterMargin", label: "Flutter", numeric: true, get: (r: MotorSweepRow) => r.flutterMargin },
  { key: "optimumDelay", label: "Delay", numeric: true, get: (r: MotorSweepRow) => r.optimumDelay },
] as const;

type SortKey = (typeof COLUMNS)[number]["key"];

/** Every "<column>:<direction>" the sort can be in, so a remembered value from a build with a
 *  different column set is discarded rather than leaving the table sorted on nothing. */
const SORT_CHOICES: readonly string[] = COLUMNS.flatMap((c) => [`${c.key}:asc`, `${c.key}:desc`]);

function SweepTable({
  rows,
  units,
  name,
  conditions,
}: {
  rows: MotorSweepRow[];
  units: UnitSystem;
  name: string;
  /** Whether the conditions these flights used came from the flyer or from the design file — the
   *  caption below names which, because it invites a comparison against "your rail". */
  conditions?: ConditionsSource;
}) {
  // Which column the table is sorted on is a view the flyer chose deliberately — someone picking a
  // motor on flutter margin is doing that across every design they open, not once. Direction rides
  // along in the same stored value so the pair can't come back inconsistent.
  const [stored, setStored] = usePersistedChoice<string>("motorSweep.sort", "apogee:desc", SORT_CHOICES);
  const [key, dir] = stored.split(":") as [SortKey, "asc" | "desc"];
  const sort = { key, dir: (dir === "asc" ? 1 : -1) as 1 | -1 };
  const setSort = (next: { key: SortKey; dir: 1 | -1 }) =>
    setStored(`${next.key}:${next.dir === 1 ? "asc" : "desc"}`);
  const col = COLUMNS.find((c) => c.key === sort.key)!;
  const sorted = [...rows].sort((a, b) => {
    const x = col.get(a);
    const y = col.get(b);
    // A motor with no flutter estimate (no fins to flutter) sorts last either way rather than
    // pretending to be the best or worst of them.
    if (typeof x === "number" && typeof y === "number") {
      const xb = !Number.isFinite(x);
      const yb = !Number.isFinite(y);
      if (xb || yb) return xb && yb ? 0 : xb ? 1 : -1;
      return (x - y) * sort.dir;
    }
    return String(x).localeCompare(String(y)) * sort.dir;
  });
  // Re-clicking the sorted column flips it; a new column starts the way that column is most
  // useful — biggest first for a number, A→Z for a name.
  const click = (next: SortKey) =>
    setSort(
      sort.key === next
        ? { key: next, dir: (sort.dir === 1 ? -1 : 1) as 1 | -1 }
        : { key: next, dir: (COLUMNS.find((c) => c.key === next)!.numeric ? -1 : 1) as 1 | -1 },
    );

  return (
    <div className="mt-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {COLUMNS.map((c, i) => {
                const active = sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={"py-1 font-medium" + (i < COLUMNS.length - 1 ? " pr-4" : "")}
                    aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  >
                    <button
                      type="button"
                      onClick={() => click(c.key)}
                      className={
                        `inline-flex items-center gap-1 uppercase tracking-wide hover:text-zinc-800 dark:hover:text-zinc-100 ${TOUCH_TARGET_SQUARE} ` +
                        (active ? "text-zinc-800 dark:text-zinc-100" : "")
                      }
                      title={`Sort by ${c.label.replace(/ /g, " ").toLowerCase()}`}
                    >
                      {c.label}
                      <span aria-hidden className={active ? "" : "opacity-0"}>
                        {sort.dir === 1 ? "▲" : "▼"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="font-mono">
            {sorted.map((r) => {
              const lowTW = r.thrustToWeight < LIFTOFF_TWR_GUIDELINE;
              // The caption names this rule and the column was never checked against it. The engine
              // already raises `low-rail-exit` on the flown design at the same threshold, so a motor
              // could sit in this table unflagged while picking it raised a caution on the next screen.
              const slowRail = r.railExitVelocity > 0 && r.railExitVelocity < RAIL_EXIT_GUIDELINE_MPS;
              const thinFlutter = Number.isFinite(r.flutterMargin) && r.flutterMargin < RECOMMENDED_FLUTTER_MARGIN;
              return (
                <tr
                  key={`${r.manufacturer}|${r.designation}`}
                  className={
                    "border-t border-zinc-100 dark:border-zinc-800 " +
                    (r.isDesign ? "bg-indigo-50/70 dark:bg-indigo-500/10" : "")
                  }
                >
                  <th
                    scope="row"
                    className="py-1.5 pr-4 text-left font-sans font-normal text-zinc-700 dark:text-zinc-200"
                  >
                    <span className="font-medium text-zinc-800 dark:text-zinc-100">{r.designation}</span>{" "}
                    <span className="text-zinc-500 dark:text-zinc-400">· {r.manufacturer}</span>
                    {r.isDesign && (
                      <span className="ml-1.5 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                        Design
                      </span>
                    )}
                  </th>
                  <td className="py-1.5 pr-4 text-zinc-600 dark:text-zinc-300">{r.motorClass}</td>
                  <td className="py-1.5 pr-4 text-zinc-800 dark:text-zinc-100">{d.q(d.altitude(r.apogee, units))}</td>
                  <td className="py-1.5 pr-4 text-zinc-800 dark:text-zinc-100">{d.q(d.speed(r.maxVelocity, units))}</td>
                  <td
                    className={
                      "py-1.5 pr-4 " +
                      (slowRail ? "text-amber-700 dark:text-amber-300" : "text-zinc-800 dark:text-zinc-100")
                    }
                  >
                    {d.q(d.speed(r.railExitVelocity, units))}
                    {slowRail && (
                      <Flag note={`below the ~${d.q(d.speed(RAIL_EXIT_GUIDELINE_MPS, units))} guideline for a stable rail departure`} />
                    )}
                  </td>
                  <td
                    className={
                      "py-1.5 pr-4 " +
                      (lowTW ? "text-amber-700 dark:text-amber-300" : "text-zinc-800 dark:text-zinc-100")
                    }
                  >
                    {d.fmt(r.thrustToWeight, 1)}
                    {lowTW && (
                      <Flag note={`below the ~${LIFTOFF_TWR_GUIDELINE}:1 rule of thumb for clean rail clearance`} />
                    )}
                  </td>
                  <td className="py-1.5 pr-4 text-zinc-800 dark:text-zinc-100">{d.q(d.calibers(r.staticMarginCal))}</td>
                  <td
                    className={
                      "py-1.5 pr-4 " +
                      (thinFlutter ? "text-amber-700 dark:text-amber-300" : "text-zinc-800 dark:text-zinc-100")
                    }
                  >
                    {Number.isFinite(r.flutterMargin) ? d.flutterMargin(r.flutterMargin) : "—"}
                    {thinFlutter && (
                      <Flag note={`below the recommended ${RECOMMENDED_FLUTTER_MARGIN}× fin-flutter margin at this speed`} />
                    )}
                  </td>
                  {/* No per-cell `title` here either. It repeated one sentence about what the
                      COLUMN means on every row, in an attribute a keyboard cannot reach and a phone
                      cannot hover — and the caption below already says the same thing, once. */}
                  <td className="py-1.5 text-zinc-800 dark:text-zinc-100">
                    {Number.isFinite(r.optimumDelay) ? d.q(d.seconds(r.optimumDelay)) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Each motor flies a ballistic ascent to apogee under{" "}
        {conditionsPhrase(conditions, { wind: false })}
        {" "}— a like-for-like comparison, not the full recovery flight. Rail-exit velocity,
        thrust-to-weight and fin-flutter margin are the launch-safety numbers, and a{" "}
        <span aria-hidden className="font-sans font-semibold">
          &#9650;
        </span>{" "}
        marks any that falls under its rule of thumb — the same ~{LIFTOFF_TWR_GUIDELINE}:1,
        ~15&nbsp;m/s (≈50&nbsp;ft/s) and {RECOMMENDED_FLUTTER_MARGIN}× thresholds the flight itself
        cautions on, so a motor cannot pass unmarked here and raise a caution once you pick it. The
        rail is the one being flown, so shortening it under <em>Conditions</em> moves that column.
        Surface wind is not read at all —
        a ballistic ascent has no recovery to drift. <em>Delay</em>{" "}
        is the ejection delay that deploys at apogee for that motor (burnout&nbsp;→&nbsp;apogee), so
        you can pick the delay to buy or drill for each candidate; a faster motor coasts longer and
        wants a longer delay. These are estimates to verify, never a go/no-go.
      </p>
      <div className="mt-2">
        {/* Exported in the order on screen — a table you sorted and then exported unsorted is a
            different table from the one you were reading. */}
        <DownloadCsv rows={sweepCsv(sorted, units)} name={name} suffix="motor-sweep" />
        <CopyTable rows={sweepCsv(sorted, units)} />
      </div>
    </div>
  );
}
