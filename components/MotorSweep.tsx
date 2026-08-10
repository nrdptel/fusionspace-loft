"use client";

import { useEffect, useState } from "react";
import { conditionsPhrase, type ConditionsSource } from "@/lib/what-if";
import type { OrkDocument } from "@/lib/ork/import";
import { overridesFromStored } from "@/lib/sim/run";
import type { ConditionOverrides } from "@/lib/sim/setup";
import { ballisticGap, type SweepMotor, type MotorSweepRow } from "@/lib/sim/sweep";
import { RECOMMENDED_FLUTTER_MARGIN } from "@/lib/sim/flutter";
import { LIFTOFF_TWR_GUIDELINE, RAIL_EXIT_GUIDELINE_MPS } from "@/lib/sim/simulate";
import { runMotorSweep } from "@/lib/sim/sweep-client";
import type { GeometryEdits } from "@/lib/model/edit";
import { mToFt, mpsToFtps } from "@/lib/units";
import { usePersistedChoice, useSettled } from "@/lib/session";
import type { CsvCell } from "@/lib/csv";
import DownloadCsv, { CopyTable } from "./DownloadCsv";
import DataTable, { type Column } from "./DataTable";
import { compareCells } from "@/lib/table-sort";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";
import { Button, Card, Extrapolated, Panel } from "./ui";

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
      <span aria-hidden className="ml-1 font-sans text-xs font-semibold">
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
  mountCasingMm = 0,
  designMotor,
  designManufacturer,
  designApogee,
  designMotorFlies,
  ballastKg,
  geometry,
  designKey,
  flownOverrides,
  weatherSerial,
  conditions,
  onUse,
  motorSwap,
}: {
  doc: OrkDocument;
  simIndex: number;
  units: UnitSystem;
  /** Bundled motors of the design's mount diameter — the same list the swap picker offers. */
  options: SweepMotor[];
  /** The casing the design's own mount takes, in mm. See where it is used. */
  mountCasingMm?: number;
  /** The design's own motor designation, to mark its row. */
  designMotor: string;
  /** That motor's manufacturer as the catalog spells it, when it matched exactly. Without it a
   *  designation-only mark badges every manufacturer's motor of that name as the design's own. */
  designManufacturer?: string;
  /** The apogee (m) of the flight actually shown on the Flight card — the number the flyer just read.
   *  Every sweep row is ballistic, so on a design whose recovery opens before apogee the row badged
   *  DESIGN is not that flight, and the two disagree on screen with nothing saying why. */
  designApogee?: number;
  /** Whether the design's own motor resolves to a bundled curve. On a design whose motor was never
   *  matched there is no flight, so "the casing it already flies" would be asserted on a page that
   *  also says there is no thrust to fly. */
  designMotorFlies?: boolean;
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
  /** Fly the design on a swept motor. The panel ranks fifteen candidates on apogee, rail exit,
   *  margin, flutter and delay; without this it could not apply the one it recommends, so the flyer
   *  carried the designation to another route by memory. Optional so a read-only embedding stays
   *  possible. */
  onUse?: (row: MotorSweepRow) => void;
  /** The motor-swap what-if in force. Read ONLY to mark which row is flying — deliberately not part
   *  of `designKey`, because no sweep row depends on it: `motorSweep()` overrides the swap per
   *  candidate, so re-running on a swap change re-flies fifteen ballistic flights to produce
   *  byte-identical rows while dimming the table the flyer is reading. */
  motorSwap?: { manufacturer?: string; designation: string };
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
  const [rows, setRows] = useState<MotorSweepRow[] | null>(null);
  const [running, setRunning] = useState(false);
  // **The MOUNT's casing, not the first row's.** `swapOptions` merges the catalogue's 75 and 76 mm
  // motors into one physical class (3 inches is 76.2 mm — see `sameCasing`), and the list is sorted
  // by impulse, so `options[0]` can state a diameter this design does not have. The design's own
  // figure is passed down for exactly this reason.
  const casingMm = mountCasingMm > 0 ? mountCasingMm : Math.round((options[0]?.diameter ?? 0) * 1000);

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
    <Panel
      label="Motor sweep"
      title="Compare fitting motors"
      /* The list is filtered by the CASING the design flies, not by the mount's bore, and the two
         are not the same number: a 54 mm mount can fly a 38 mm motor in an adapter, and it is the
         38 mm ones that are offered. Saying "fits this mount" claimed the wider set and was
         checkably false against the design file, which states the bore outright. */
      aside={
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {options.length} bundled {casingMm} mm motors
        </span>
      }
      open={open}
      onOpenChange={setOpen}
      run="Run motor sweep"
      what="the motor sweep"
    >
      {/* The pitch, and only until it has been taken up. This paragraph answers "what is this and
          why would I run it" — a question the TABLE answers once the sweep has actually run, at
          which point the prose is 140 px of preamble sitting between the flyer and their answer.
          Measured on a 390x664 phone: it is the difference between `/sweep` clearing `DESIGN.md`
          §8's two-screen contract and missing it. Closing the panel brings it back, so nothing is
          lost — it is sequenced, not hidden. */}
      {!open && (
        <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
          Fly this airframe on every bundled motor of the {casingMm}{" "}
          mm casing{" "}
          {designMotorFlies === false ? "its file states for its motor" : "it already flies"}, all at once, and see
          how apogee, speed, rail-exit velocity, stability, and fin-flutter margin change across them —
          the classic &ldquo;which motor gets me to my target?&rdquo; sweep (and whether a punchier one
          pushes the fins toward flutter), run entirely on your device.
        </p>
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
        <Card tone="sunken" className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
          None of the fitting motors could be flown on this airframe.
        </Card>
      )}

      {/* The previous run stays on screen while the next one flies, dimmed and announced above as the
          previous design's — so an edit can be compared against what it changed rather than against a
          spinner. It is never left unlabelled: the status line says which it is. */}
      {open && rows !== null && rows.length > 0 && (
        <div aria-busy={running} className={running ? "opacity-50 transition-opacity" : undefined}>
          <SweepTable
            rows={rows}
            units={units}
            name={doc.rocket.name}
            conditions={conditions}
            designApogee={designApogee}
            onUse={onUse}
            motorSwap={motorSwap}
          />
        </div>
      )}
    </Panel>
  );
}

function sweepCsv(rows: MotorSweepRow[], units: UnitSystem): CsvCell[][] {
  const spd = units === "imperial" ? "ft/s" : "m/s";
  const alt = units === "imperial" ? "ft" : "m";
  const toAlt = (m: number) => (units === "imperial" ? mToFt(m) : m);
  const toSpd = (mps: number) => (units === "imperial" ? mpsToFtps(mps) : mps);
  const header: CsvCell[] = ["Motor", "Manufacturer", "Class", `Apogee (${alt})`, `Max velocity (${spd})`, `Rail-exit (${spd})`, "Thrust-to-weight", "Static margin (cal)", "Fin flutter margin (x)", "Optimum delay (s)", "Design", "Extrapolated"];
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
    // The export carries the caveat too. A ranking pasted into a build thread is the artifact that
    // outlives the session, and without this column it left here byte-identical to a validated one —
    // the same "confident claim in one place" this whole change exists to stop, one step further out.
    r.extrapolatedTransonic ? "past M0.8 — outside the validated drag envelope" : "",
  ]);
  return [header, ...body];
}

/** The sweep's columns on the shared primitive — `DESIGN.md` §5, "every table is this one".
 *
 *  Apogee descending is the default because the question this table exists to answer is "how high does
 *  each of these get me?" — but it is only the first question. Which motor clears the rail fastest,
 *  which leaves the most flutter margin, which needs the shortest delay: each is one click, and each is
 *  a real reason to pick a motor. `sortDir` is why the primitive gained that prop: a measurement opens
 *  biggest-first and a name opens A→Z, and a table that opens every column ascending charges a flyer a
 *  second click to ask the question they meant.
 *
 *  `csv` is deliberately absent from every column, and `exportName` is not passed. The panel keeps its
 *  OWN export (`sweepCsv`) because that one carries eleven columns to the screen's nine data ones —
 *  the tenth on screen is the *Use* control, which is an action rather than a value and has nothing
 *  to export. It splits
 *  Motor and Manufacturer, adds the Design flag, and puts the unit in each header — and a second pair
 *  of controls beside it would be two exports of the same table that disagree. */
const COLUMNS: Column<MotorSweepRow>[] = [
  {
    key: "designation",
    label: "Motor",
    rowHeader: true,
    sortValue: (r) => r.designation,
    cell: (r) => (
      <span className="font-sans">
        <span className="font-medium text-zinc-800 dark:text-zinc-100">{r.designation}</span>{" "}
        <span className="text-zinc-500 dark:text-zinc-400">· {r.manufacturer}</span>
        {r.isDesign && (
          <span className="ml-1.5 rounded-md bg-indigo-600 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-white">
            Design
          </span>
        )}
      </span>
    ),
  },
  {
    // **The column that turns a ranking into a decision — and it sits SECOND, deliberately.** Before
    // this the whole file contained exactly one `<Button>` — *Run* — so a flyer who swept fifteen
    // motors and found their answer had to memorise the designation, leave for the Design workspace,
    // and scroll 1,841 px (2.77 screens at 390x664) to re-find it in a sixteen-option `<select>`.
    // That is the "task that works but costs steps a mature tool doesn't charge" tell, on one of the
    // three pad journeys P4's *done when* names.
    //
    // **Last would have re-created the defect it exists to remove.** This table is ~683 px wide
    // inside the phone's horizontal scroller; as the tenth column every control sat off the right
    // edge of a 390 px viewport at rest, so reaching it meant scrolling a nested scroller ~350 px.
    // Beside the motor's own name it is on screen without scrolling, which is the whole point. The
    // pre-push review caught this, and noted the trap in the test that missed it: Playwright's
    // `toBeVisible()` does not test viewport intersection and `click()` auto-scrolls, so the journey
    // passed on a control a thumb could not see. The spec now asserts the button's `x`.
    //
    // Named "Use" rather than empty: `DataTable` writes the label into a `<th scope="col">`, and a
    // column of unnamed buttons leaves fifteen controls all reading the same thing with nothing to
    // place them (WCAG 1.3.1) — the same reason `PartPicker`'s Choose column is named.
    key: "use",
    label: "Use",
    cell: () => null,
  },
  {
    key: "motorClass",
    label: "Class",
    sortValue: (r) => r.motorClass,
    cell: (r) => <span className="text-zinc-600 dark:text-zinc-300">{r.motorClass}</span>,
  },
  { key: "apogee", label: "Apogee", sortDir: -1, sortValue: (r) => r.apogee, cell: () => null },
  { key: "maxVelocity", label: "Max V", sortDir: -1, sortValue: (r) => r.maxVelocity, cell: () => null },
  { key: "railExitVelocity", label: "Rail exit", sortDir: -1, sortValue: (r) => r.railExitVelocity, cell: () => null },
  { key: "thrustToWeight", label: "T:W", sortDir: -1, sortValue: (r) => r.thrustToWeight, cell: () => null },
  { key: "staticMarginCal", label: "Margin", sortDir: -1, sortValue: (r) => r.staticMarginCal, cell: () => null },
  { key: "flutterMargin", label: "Flutter", sortDir: -1, sortValue: (r) => r.flutterMargin, cell: () => null },
  { key: "optimumDelay", label: "Delay", sortDir: -1, sortValue: (r) => r.optimumDelay, cell: () => null },
];

/** Every "<column>:<direction>" the sort can be in, so a remembered value from a build with a
 *  different column set is discarded rather than leaving the table sorted on nothing. */
// Only columns that can ACTUALLY sort. The guard's job is to discard a remembered value from a build
// with a different column set; derived from every column it also admitted `use:asc`/`use:desc`, and
// `use` has no `sortValue` — so a stored value of that shape reached `col.sortValue!(a)` behind a
// non-null assertion and took the workspace down on render rather than falling back.
const SORT_CHOICES: readonly string[] = COLUMNS.filter((c) => c.sortValue).flatMap((c) => [
  `${c.key}:asc`,
  `${c.key}:desc`,
]);

function SweepTable({
  rows,
  units,
  name,
  conditions,
  designApogee,
  onUse,
  motorSwap,
}: {
  rows: MotorSweepRow[];
  units: UnitSystem;
  name: string;
  /** The apogee (m) the Flight card shows, so the table can say when its own DESIGN row is not it. */
  designApogee?: number;
  /** Whether the conditions these flights used came from the flyer or from the design file — the
   *  caption below names which, because it invites a comparison against "your rail". */
  conditions?: ConditionsSource;
  /** Fly the design on this motor instead. Absent leaves the table read-only, which is what it was. */
  onUse?: (row: MotorSweepRow) => void;
  /** The motor-swap what-if in force, so the table can mark what is actually FLYING rather than what
   *  the file was designed around. Absent means the design's own motor is on the rail. */
  motorSwap?: { manufacturer?: string; designation: string };
}) {
  // Which column the table is sorted on is a view the flyer chose deliberately — someone picking a
  // motor on flutter margin is doing that across every design they open, not once. Direction rides
  // along in the same stored value so the pair can't come back inconsistent. The primitive takes the
  // sort as a CONTROLLED pair for exactly this: persistence here validates against the column list
  // rather than writing and reading back, and this panel also needs to KNOW the order, because its
  // own CSV comes out in the order on screen.
  const [stored, setStored] = usePersistedChoice<string>("motorSweep.sort", "apogee:desc", SORT_CHOICES);
  const [key, dir] = stored.split(":") as [string, "asc" | "desc"];
  const sort = { key, dir: (dir === "asc" ? 1 : -1) as 1 | -1 };

  // The unit-bearing cells, kept here rather than in COLUMNS because they close over `units`. The
  // amber flag rides on a span INSIDE the cell: colour inherits, so the rendered result is identical
  // to the `<td>`-level class it replaces, and the primitive keeps ownership of the cell's own layout.
  const amber = (on: boolean) => (on ? "text-amber-700 dark:text-amber-300" : undefined);
  const cells: Record<string, (r: MotorSweepRow) => React.ReactNode> = {
    // A row whose flight left the validated subsonic envelope is marked on the apogee cell, in the
    // table's own `Flag` idiom rather than a second vocabulary. It is per ROW because a motor sweep
    // exists to rank candidates against each other and a bigger motor is what pushes a design
    // through M0.8 — so the top of the ranking is the part most likely to be extrapolated while the
    // rows it beat are not, and a caveat over the whole table could not say which.
    apogee: (r) => (
      <span className={amber(r.extrapolatedTransonic)}>
        {d.q(d.altitude(r.apogee, units))}
        {r.extrapolatedTransonic && (
          <Flag note="extrapolated: this flight reaches past M0.8, outside the drag model's validated subsonic envelope" />
        )}
      </span>
    ),
    maxVelocity: (r) => d.q(d.speed(r.maxVelocity, units)),
    railExitVelocity: (r) => {
      const slow = r.railExitVelocity > 0 && r.railExitVelocity < RAIL_EXIT_GUIDELINE_MPS;
      return (
        <span className={amber(slow)}>
          {d.q(d.speed(r.railExitVelocity, units))}
          {slow && (
            <Flag note={`below the ~${d.q(d.speed(RAIL_EXIT_GUIDELINE_MPS, units))} guideline for a stable rail departure`} />
          )}
        </span>
      );
    },
    thrustToWeight: (r) => {
      const low = r.thrustToWeight < LIFTOFF_TWR_GUIDELINE;
      return (
        <span className={amber(low)}>
          {d.fmt(r.thrustToWeight, 1)}
          {low && <Flag note={`below the ~${LIFTOFF_TWR_GUIDELINE}:1 rule of thumb for clean rail clearance`} />}
        </span>
      );
    },
    staticMarginCal: (r) => d.q(d.calibers(r.staticMarginCal)),
    flutterMargin: (r) => {
      const thin = Number.isFinite(r.flutterMargin) && r.flutterMargin < RECOMMENDED_FLUTTER_MARGIN;
      return (
        <span className={amber(thin)}>
          {Number.isFinite(r.flutterMargin) ? d.flutterMargin(r.flutterMargin) : "—"}
          {thin && (
            <Flag note={`below the recommended ${RECOMMENDED_FLUTTER_MARGIN}× fin-flutter margin at this speed`} />
          )}
        </span>
      );
    },
    optimumDelay: (r) => (Number.isFinite(r.optimumDelay) ? d.q(d.seconds(r.optimumDelay)) : "—"),
  };
  // **What is FLYING, which is not the same question as which row is the design's.** The first draft
  // gated this cell on `r.isDesign` — a fact about the FILE's motor, read from the pristine document
  // and unmoved by a swap. One tap then made the panel contradict itself: "flying now" stayed on the
  // motor that was no longer flying, the row that WAS flying still offered a button that did
  // nothing, and the design's own motor became the one row with no way back to it — inside the panel
  // added to remove exactly that trip. Found by the pre-push review, not by the gate.
  //
  // Comparing manufacturer AND designation also settles an ambiguity `isDesign` carries: it falls
  // back to a designation-only match when the design's motor resolved loosely, so on an 18 mm design
  // an Estes C6 and a Quest C6 could BOTH read as the design's and neither would offer a control.
  const flying = (r: MotorSweepRow) =>
    motorSwap
      ? r.designation === motorSwap.designation &&
        (!motorSwap.manufacturer || r.manufacturer === motorSwap.manufacturer)
      : r.isDesign;

  const columns = COLUMNS.map((c) =>
    c.key === "use"
      ? {
          ...c,
          cell: (r: MotorSweepRow) =>
            flying(r) ? (
              // Muted, but at the table's own size: every other cell inherits it, and a caption-size
              // class here tipped this file into `DESIGN.md` §3's inversion (5 against 4), which
              // `lib/design-system.test.ts` caught before it shipped. The class name is deliberately
              // NOT written out even in this comment — the check greps the file's raw text and cannot
              // tell a mention from a use, so naming it here re-created the count that had just been
              // fixed. `MAINTAINING.md` records the same trap for Tailwind's own scanner.
              <span className="text-zinc-500 dark:text-zinc-400">flying now</span>
            ) : (
              <Button
                variant="secondary"
                onClick={() => onUse?.(r)}
                // The visible label is one word because the column is narrow on a phone; the
                // accessible name carries which motor, label-first, so a voice-control user can say
                // the word they can see and a screen-reader user is not given fifteen bare "Use"s.
                // The design's own row says so: returning to it is a different act from choosing a
                // candidate, and the flyer should be able to tell which they are about to do.
                aria-label={
                  r.isDesign
                    ? `Use ${r.designation} — go back to this design's own motor, and re-fly`
                    : `Use ${r.designation} — fly this design on it instead, and re-fly`
                }
              >
                Use
              </Button>
            ),
        }
      : cells[c.key]
        ? { ...c, cell: cells[c.key] }
        : c,
  );

  // Sorted here as well as inside the table, because the CSV must come out in the order on SCREEN —
  // a table you sorted and then exported unsorted is a different table from the one you were reading.
  const col = COLUMNS.find((c) => c.key === sort.key && c.sortValue) ?? COLUMNS[0];
  const sorted = [...rows].sort((a, b) => compareCells(col.sortValue!(a), col.sortValue!(b), sort.dir));

  // The design's own row against the flight the flyer actually read — see `ballisticGap` for why a
  // small difference is the method rather than a discrepancy.
  const gap = ballisticGap(sorted.find((r) => r.isDesign)?.apogee, designApogee);

  // How much of the ranking is outside the drag model's validated envelope. The per-row flag above
  // says WHICH candidates; this says how much of the table to read that way, and carries the reason
  // in words for the flyer who never hovers a cell.
  const exN = rows.filter((r) => r.extrapolatedTransonic).length;
  const extrapolatedWhy = exN
    ? `${exN} of ${rows.length} candidates reach past M0.8, outside the drag model's validated subsonic envelope — those rows are marked, and are rough`
    : undefined;

  return (
    <div className="mt-3">
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => `${r.manufacturer}|${r.designation}`}
        caption="Motors swept over this airframe"
        sort={sort}
        onSortChange={(next) =>
          setStored(next ? `${next.key}:${next.dir === 1 ? "asc" : "desc"}` : "apogee:desc")
        }
        rowProps={(r) => (r.isDesign ? { className: "bg-indigo-50/70 dark:bg-indigo-500/10" } : {})}
        empty="No motor of this casing flew — widen the casing on the design, or pick a motor by hand."
      />
      {/* The DESIGN row is the anchor every other row is read against, and on a design whose recovery
          opens before apogee it is NOT the flight shown one tab away — on the bundled USLI airframe the
          row reads 1,888 m against a flight of 342 m. The footnote below has always said the sweep is
          ballistic; what it never did was connect that to the specific number the flyer had just read.
          Shown only when the two actually part company, so it stays a signal rather than boilerplate. */}
      {gap && (
        <p className="mt-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          The <strong>Design</strong> row flies ballistic like every other row here:{" "}
          {d.q(d.altitude(gap.sweep, units))} against the{" "}
          {d.q(d.altitude(gap.flown, units))}{" "}
          this design actually flies, because its recovery opens before apogee. Compare the rows with
          each other, not with the flight above.
        </p>
      )}
      {/* BELOW the table, with the other flag explanations, and that placement is measured rather
          than aesthetic. Above it, this marker pushed the first swept row from 1,260 px to 1,348 px
          on a 390x664 phone — past the 1,328 px `DESIGN.md` §8 allows to the primary answer, a
          contract this very panel already broke once and closed by moving its own preamble out of
          the way. The per-row ▲ is inside the table and costs the answer no height at all, so the
          flyer meets the marking on the row they are reading and the reason where every other flag
          on this table explains itself. */}
      {extrapolatedWhy && (
        <div className="mt-3">
          <Extrapolated reason={extrapolatedWhy} />
        </div>
      )}
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
        cautions on, so a motor cannot pass unmarked here and raise a caution once you pick it. On{" "}
        <em>Apogee</em> the same mark means something different and is worth reading as such: not a
        safety threshold, but that this candidate flies past M0.8 and out of the drag model&apos;s
        validated envelope, so its altitude is a rougher estimate than the rows below it. The
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
