"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Button, Card, Figure, Panel, Readout, Section, Select, type CardTone } from "./ui";
import { transonicReason } from "@/lib/sim/envelope";
import { notLandedWhy as whyNotLanded } from "@/lib/sim/withheld";
import { cx } from "@/lib/ui-tokens";
import WorkspaceNav from "./WorkspaceNav";
import AirframeStrip from "./AirframeStrip";
import { WORKSPACES, type Workspace } from "@/lib/workspaces";
import DataTable from "./DataTable";
import type { FlightRun } from "@/lib/sim/run";
import type { ConditionOverrides } from "@/lib/sim/setup";
import type { ConditionsSource } from "@/lib/what-if";
import { applyGeometryEdits, hasGeometryEdits, primaryFinGroupIds, structureOf, aimsOf, type AddedPart, type GeometryEdits, type MoveSlot } from "@/lib/model/edit";
import { designKey } from "@/lib/model/design-key";
import type { CatalogPart } from "@/lib/components/db";
import type { Material } from "@/lib/model/types";
import { formatLabel, sourceTool, type OrkDocument } from "@/lib/ork/import";
import type { FlightResult } from "@/lib/sim/simulate";
import { RECOMMENDED_FLUTTER_MARGIN, thicknessForFlutterMargin } from "@/lib/sim/flutter";
import LineChart, { type Series, type Marker } from "./LineChart";
import FlightViz from "./FlightViz";
import ValidationPanel from "./ValidationPanel";
import { noStoredResultsReason } from "@/lib/validation/stored-status";
import DragCrossCheck from "./DragCrossCheck";
import RocketpyCrossCheck from "./RocketpyCrossCheck";
import MotorSweep from "./MotorSweep";
import ParameterSweep from "./ParameterSweep";
import MonteCarlo from "./MonteCarlo";
import MassBreakdown from "./MassBreakdown";
import GeometryInspector from "./GeometryInspector";
import DownloadCsv from "./DownloadCsv";
import { csvQuantity, type CsvCell } from "@/lib/csv";
import { parseFlightLog, type FlightLogPoint, type FlightLogSpeedPoint, type LogUnit, type LogSpeedUnit } from "@/lib/flightlog";
import { mToFt, ftToM, mpsToFtps, ftpsToMps, mphToMps, KMH_PER_MPS, kgToLb } from "@/lib/units";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";
import { impulseClass } from "@/lib/motors/eng";
import { flattenRocket, overallLength } from "@/lib/model/geometry";
import { dryMassProperties, statedMassHolder } from "@/lib/sim/mass";
import type { Rocket } from "@/lib/model/types";
import { noseBallastStation, configChoices } from "@/lib/sim/run";
import { motorLayout } from "@/lib/sim/setup";
import { marginTrim, finStationTrim } from "@/lib/sim/trim";
import { recoverySizing } from "@/lib/sim/recovery";

/** A gentle target landing speed to size recovery toward — the middle of the ~3–6 m/s (10–20 ft/s)
 *  band most designs aim for, the same range the hard-landing warning is written against. */
const SOFT_LANDING_TARGET = 5;

/** The whole simulated trajectory as a CSV grid, one row per integration sample — so a flyer can take
 *  the raw flight into a spreadsheet or plot it against an altimeter log. The kinematic columns follow
 *  the chosen unit system (the same toggle the plots use) and Mach and drag coefficient are unitless,
 *  while thrust, drag and dynamic pressure stay in SI. That last group is a deliberate choice about the
 *  export rather than a reflection of the screen: the Flight card states max-Q in kPa or psi with the
 *  toggle, but this file is a physics record meant to be differentiated and integrated, and newtons and
 *  pascals are the units those operations expect. Every column names its own unit, so nothing here is
 *  ambiguous — it is simply not all the same system. Client-side only, like every other export. */
function flightDataCsv(result: FlightResult, units: UnitSystem): CsvCell[][] {
  const imperial = units === "imperial";
  const len = (m: number) => (imperial ? mToFt(m) : m);
  const spd = (mps: number) => (imperial ? mpsToFtps(mps) : mps);
  const mass = (kg: number) => (imperial ? kgToLb(kg) : kg);
  const lenU = imperial ? "ft" : "m";
  const spdU = imperial ? "ft/s" : "m/s";
  const massU = imperial ? "lb" : "kg";
  const r5 = (n: number) => (Number.isFinite(n) ? Math.round(n * 1e5) / 1e5 : "");
  const header: CsvCell[] = [
    "Time (s)",
    "Phase",
    `Altitude (${lenU})`,
    `Downrange (${lenU})`,
    `Speed (${spdU})`,
    `Vertical speed (${spdU})`,
    `Acceleration (${spdU}²)`,
    "Mach",
    "Drag coefficient",
    "Thrust (N)",
    "Drag (N)",
    `Mass (${massU})`,
    "Dynamic pressure (Pa)",
  ];
  const rows: CsvCell[][] = [header];
  for (const s of result.trajectory) {
    rows.push([
      r5(s.t),
      s.phase,
      r5(len(s.altitude)),
      r5(len(s.x)),
      r5(spd(s.velocity)),
      r5(spd(s.verticalVelocity)),
      r5(spd(s.acceleration)), // an acceleration shares the length unit's per-second² factor
      r5(s.mach),
      r5(s.cd),
      r5(s.thrust),
      r5(s.drag),
      r5(mass(s.mass)),
      r5(s.dynamicPressure),
    ]);
  }
  return rows;
}

/** A healthy static margin to trim toward — comfortably above the 1-caliber rule of thumb, below
 *  the ~3-caliber point where over-stability starts to weathercock. */
const TRIM_TARGET_CAL = 1.5;

/** Above this the design is over-stable (the flight raises the same caution) and prone to
 *  weathercocking; the fin-position trim then eases it back toward `OVER_STABLE_TARGET_CAL`. */
const OVER_STABLE_CAL = 3;
const OVER_STABLE_TARGET_CAL = 2;

const COLORS = {
  altitude: "#6366f1",
  velocity: "#10b981",
  vertical: "#818cf8",
  accel: "#f59e0b",
  mach: "#8b5cf6",
  thrust: "#ef4444",
};

/** Why a tool isn't offered for this design — said out loud, because a panel that simply
 *  isn't there reads as a missing feature rather than a modelling limit. */
function ToolUnavailable({
  title,
  reason,
  children,
}: {
  title: string;
  reason: string;
  /** Anything the flyer can DO about it, or read next. A surface that says only why it is empty
   *  leaves them where they were standing; `DESIGN.md` §5 asks an empty state to name the way
   *  forward, and this primitive had nowhere to put one. */
  children?: ReactNode;
}) {
  return (
    <Card as="section" tone="muted" aria-label={`${title} unavailable`} className="text-sm">
      <h2 className="text-base font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">{title}</h2>
      <p className="mt-1.5">{reason}</p>
      {children && <p className="mt-1.5">{children}</p>}
    </Card>
  );
}

/** The workspace vocabulary moved to `lib/workspaces.ts` when each workspace became a route of its
 *  own: the route pages are server components and a client module's exports do not survive that
 *  boundary. Re-exported so the call sites that already say `from "./ResultsView"` keep working. */
export { WORKSPACES, type Workspace };

/** A flight warning's severity, as one of `Card`'s tones — `DESIGN.md` §2, where the semantic colours
 *  are reserved for meaning and there are only two of them for "something is wrong".
 *
 *  `info` maps to the neutral inset rather than to a colour, and that is the point: a note with no
 *  semantic tone reads as a note. Inventing a third "informational" colour would be a change to
 *  `DESIGN.md` §2 under §1's rule, not a call site's decision.
 *
 *  It carries §2's SECONDARY text with it, and that pairing is load-bearing rather than decoration.
 *  `sunken` is the one tone in `CARD_TONES` that sets no colour of its own — `warn` and `danger` both
 *  do — so an `info` note left to inherit renders in the page's full-strength body ink while the amber
 *  caution stacked directly above it renders muted. That puts the loudest text on the least severe
 *  row, on the one surface whose whole job is to rank what is wrong. Caught by review, not by a check;
 *  the assertion below is the check. */
const SEVERITY: Record<string, { tone: CardTone; text: string }> = {
  warning: { tone: "danger", text: "" },
  caution: { tone: "warn", text: "" },
  info: { tone: "sunken", text: "text-zinc-600 dark:text-zinc-400" },
};

export default function ResultsView({
  run,
  doc,
  loadId,
  designId,
  weatherAt,
  units,
  flownOverrides,
  weatherSerial,
  conditions,
  baseline,
  simIndex = 0,
  ballastKg,
  recoveryCdScale,
  motorSwap,
  geometry,
  swapOptions,
  mountCasingMm,
  designMotor,
  designManufacturer,
  designMotorFlies,
  onEditGeometry,
  onUseMotor,
  onSelectPart,
  propertiesFor,
  onRemovePart,
  onAddAfter,
  onMovePart,
  canMovePart,
  onMovePartTo,
  movePartSlots,
  onAddStage,
  onRemoveStage,
  canAddMountTo,
  onAddMount,
  onPickPart,
  onClearPick,
  onRemoveMount,
  refuseRemoval,
  workspace,
  designEditor,
}: {
  run: FlightRun;
  doc: OrkDocument;
  /** Which design is loaded, as a token that changes on load and on nothing else — see `designKey`.
   *  The heavy panels cache an answer against it, so anything the flyer can edit without changing
   *  the rocket (the name) has to stay out of it. */
  loadId: string | number;
  /** Which DESIGN is loaded, content-addressed and stable across a load — see `designFingerprint`.
   *  Passed through to the dispersion panel, which files its finished run under it. Distinct from
   *  `loadId`, which is a per-mount counter and cannot identify a design across a navigation. */
  designId?: string;
  /** When the forecast on screen was FETCHED (epoch ms), or undefined on design air. The forecast's
   *  stable identity — passed through to the dispersion panel, which cannot use `weatherSerial` for
   *  that job because it is a per-mount counter. */
  weatherAt?: number;
  units: UnitSystem;
  /** The launch conditions the run in view was flown under — the design file's stored setup with the
   *  flyer's Conditions edits and today's weather folded in, exactly as the Flight card flew them.
   *  The dispersion study built its own nominal from the file alone, so it answered for a different
   *  day: on the 54 mm sample at 20 mph its recovery radius stayed 1,203 m against a true 2,519 m. */
  flownOverrides?: ConditionOverrides;
  /** Bumped once per forecast fetched. The panels compare conditions by value, and a forecast's
   *  atmosphere and wind profile are functions with no value to compare — this is what lets a key
   *  see that the air changed. */
  weatherSerial?: number;
  /** Where each launch condition came from, so each panel names what IT flew rather than sharing one
   *  flag with panels that read different fields. */
  conditions?: ConditionsSource;
  /** When a design what-if (nose ballast / motor swap) is active, the same flight without that
   *  change under identical conditions — so the results can show what the change bought. */
  baseline?: FlightRun | null;
  /** The stored-simulation index being flown, for building the RocketPy cross-check spec. */
  simIndex?: number;
  /** Active "what-if" edits, so the RocketPy cross-check flies the same hypothetical shown above. */
  ballastKg?: number;
  /** Active recovery-size what-if (scale on deployed drag area) — affects the descent, so the
   *  Monte-Carlo (landing scatter) honours it. */
  recoveryCdScale?: number;
  motorSwap?: { manufacturer?: string; designation: string; diameter?: number };
  geometry?: GeometryEdits;
  /** Bundled motors that fit this airframe's mount, for the motor-sweep comparison. */
  swapOptions?: { designation: string; manufacturer: string; diameter: number; motorClass: string }[];
  /** The casing the design's own mount takes, in mm — what the offered list is LABELLED with. */
  mountCasingMm?: number;
  /** The design's own motor designation, to mark its row in the sweep. */
  designMotor?: string;
  /** That motor's manufacturer as the catalog spells it, when it matched exactly — a designation
   *  alone does not identify a motor, and an 18 mm sweep carries two different C6s. */
  designManufacturer?: string;
  /** Whether the design's own motor resolves to a bundled curve, so the sweep's description of the
   *  offered list does not claim a flight on a design that makes none. */
  designMotorFlies?: boolean;
  /** Apply a geometry edit from the diagram's drag handle (e.g. fin station) — the same path a
   *  numeric what-if field uses, so dragging and typing converge on one edit flow. */
  onEditGeometry?: (patch: GeometryEdits) => void;
  /** Fly the design on a motor chosen from the sweep's own table. The sweep ranks every fitting
   *  bundled motor and, until this existed, could not apply one — so "pick a motor", which is one of
   *  the three pad journeys `ROADMAP.md`'s P4 *done when* names, meant memorising a designation and
   *  re-finding it in a sixteen-option select 2.77 screens down another route. */
  onUseMotor?: (m: { manufacturer: string; designation: string; diameter?: number }) => void;
  /** Told which part the flyer picked in the parts table or on the diagram, so the editor's fields
   *  describe and edit that part. Which fields a pick re-aims is the edit model's call. */
  onSelectPart?: (id: string) => void;
  /** Handed straight to the design panel — the property surface for the picked part. Threaded rather
   *  than built here for the same reason `onSelectPart` is: the fields belong where the edit bag
   *  lives, and this component neither owns nor inspects them. */
  propertiesFor?: (id: string) => { title: string; label: string; body: React.ReactNode } | null;
  /** Remove a component from the design — the structural half of editing. */
  onRemovePart?: (id: string) => void;
  /** Author a part behind the picked one. Given only where editing is offered, like `onRemovePart`. */
  onAddAfter?: (id: string, kind?: AddedPart["kind"]) => void;
  /** Re-order the picked part within its stage. Given only where editing is offered, like the two above. */
  onMovePart?: (id: string, dir: -1 | 1) => void;
  /** Whether that nudge is available, judged against the same tree the move is applied to. */
  canMovePart?: (id: string, dir: -1 | 1) => boolean;
  /** Commit a drag's drop: put this part immediately behind `after`, or first when `after` is null. */
  onMovePartTo?: (id: string, after: string | null) => void;
  /** Every legal drop for a part, resolved against the tree the operation runs against. */
  movePartSlots?: (id: string) => MoveSlot[];
  /** Append a booster stage below the design. */
  onAddStage?: () => void;
  onRemoveStage?: (seedId: string) => void;
  canAddMountTo?: (id: string) => boolean;
  onAddMount?: (id: string) => void;
  onRemoveMount?: (hostId: string) => void;
  /** Choose a real catalogued coupler or centring ring for the authored part `id`, and drop that
   *  choice again. Passed straight through to the geometry panel, which is where the part is picked
   *  out and therefore the only surface that can say WHICH authored part is being picked for. The
   *  catalogue row goes up rather than a finished record, for the reason `GeometryInspector`'s own
   *  prop note gives: building the record is the edit model's call and is made beside the rest of
   *  the bag. */
  onPickPart?: (id: string, part: CatalogPart, material: Material | undefined) => void;
  onClearPick?: (id: string) => void;
  /** Why a part cannot be removed, or null. Asked of the app rather than judged in the panel, so the reason
   *  shown and the guard that enforces it cannot disagree about which design they are judging. */
  refuseRemoval?: (id: string) => string | null;
  /** Which workspace the flyer is on — the ROUTE, resolved from the address by the shell above.
   *  Where a load *lands* is a navigation and belongs there too; this view only renders what the
   *  current route asks for. */
  workspace: Workspace;
  /** The design-editing surface (motor swap + geometry/recovery what-ifs), rendered inside the
   *  Design workspace next to the diagram it edits — build and edit are the same surface. */
  designEditor?: ReactNode;
}) {
  const r = run.result;
  const s = r.summary;
  /** The envelope the ascent numbers left, or undefined while they are inside it. `DESIGN.md` §5
   *  requires the `Extrapolated` treatment wherever a number leaves the envelope its method was
   *  validated over; the drag model's is subsonic, and above about M0.8 it is a bounded parametric
   *  estimate rather than a solution. Worded to match the `transonic` caution the solver already
   *  raises, so the marker and the card cannot drift apart. */
  const extrapolatedWhy = transonicReason(r.extrapolatedTransonic, s.maxMach);
  const markers = eventMarkers(r);
  // Which workspace is open — the route, handed down. The panels below all stay mounted and the
  // route only decides which one is visible, which is deliberate rather than incidental: a
  // Monte-Carlo is a 300-flight run and a RocketPy cross-check spins up a WASM interpreter, and
  // unmounting either on a navigation would throw that work away every time the flyer glanced at
  // the diagram. Their results are not persisted anywhere, so mounted-and-hidden IS the mechanism
  // that makes P2's "the design and its results survive moving between them" true.
  const tab = workspace;

  // An optional uploaded flight log (altimeter CSV) overlaid on the altitude plot — the flyer's real
  // flight beside Loft's prediction. Parsed and held entirely in the browser; the unit defaults to
  // whatever the file named (or the current display unit) and can be corrected if the curve looks off.
  const [log, setLog] = useState<{
    points: FlightLogPoint[];
    unit: LogUnit;
    /** True while `unit` is Loft's GUESS rather than something the file named.
     *
     *  `lib/flightlog.ts` returns `unitHint: null` deliberately, to mean *the header does not say* —
     *  a bare `Altitude` column parses fine and lands here. The guess is the flyer's current display
     *  system, which is a reasonable default and is wrong for every flyer whose altimeter exports
     *  feet while they read metric: the curve, both peaks and the percentage beneath them all come
     *  out 3.28x, presented in the same confident voice as a stated unit. Carried so the surface can
     *  say which of the two it is, and cleared the moment the flyer touches the picker — at that
     *  point the unit is theirs, not Loft's. */
    unitAssumed: boolean;
    speed: { points: FlightLogSpeedPoint[]; unit: LogSpeedUnit; unitAssumed: boolean } | null;
  } | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const onLogFile = (file: File | undefined) => {
    setLogError(null);
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => setLogError("Couldn't read that file.");
    reader.onload = () => {
      try {
        const parsed = parseFlightLog(String(reader.result ?? ""));
        setLog({
          points: parsed.points,
          unit: parsed.unitHint ?? (units === "imperial" ? "ft" : "m"),
          unitAssumed: parsed.unitHint === null,
          speed: parsed.speed
            ? {
                points: parsed.speed.points,
                unit: parsed.speed.unitHint ?? (units === "imperial" ? "ft/s" : "m/s"),
                unitAssumed: parsed.speed.unitHint === null,
              }
            : null,
        });
      } catch (e) {
        setLog(null);
        setLogError(e instanceof Error ? e.message : "Couldn't read that flight log.");
      }
    };
    reader.readAsText(file);
  };
  // The uploaded log as an altitude series in the plot's own display unit: log altitude → metres →
  // the metric/imperial unit the altitude curve uses.
  const logSeries: Series | null =
    log && log.points.length > 1
      ? {
          color: "#0891b2", // cyan — distinct from the indigo prediction, reads as measured data
          label: "flight log",
          points: log.points.map((p) => {
            const m = log.unit === "ft" ? ftToM(p.altitude) : p.altitude;
            return { x: p.t, y: units === "imperial" ? mToFt(m) : m };
          }),
        }
      : null;
  // The one number the overlay is really for: the log's own peak altitude beside Loft's predicted
  // apogee. It compares peaks only, so it needs no time alignment; it's the flyer's measurement next
  // to the estimate, not a model-accuracy claim. A wildly off delta usually means the log's unit is
  // set wrong — the toggle beside it fixes that. Both values are in the plot's display unit.
  const predApogee = units === "imperial" ? mToFt(s.apogee) : s.apogee;
  const altUnit = units === "imperial" ? "ft" : "m";
  const logPeak = logSeries ? Math.max(...logSeries.points.map((p) => p.y)) : null;
  const peakDeltaPct = logPeak !== null && predApogee > 0 ? ((logPeak - predApogee) / predApogee) * 100 : null;

  // When the log also carries a velocity column, overlay it on the velocity plot and compare its own
  // peak against Loft's predicted max velocity — the second half of the predict-vs-reality check.
  const logToMps = (v: number, u: LogSpeedUnit) =>
    u === "ft/s" ? ftpsToMps(v) : u === "mph" ? mphToMps(v) : u === "km/h" ? v / KMH_PER_MPS : v;
  const logSpeedSeries: Series | null =
    log?.speed && log.speed.points.length > 1
      ? {
          color: "#0891b2",
          label: "flight log",
          points: log.speed.points.map((p) => {
            const mps = logToMps(p.v, log.speed!.unit);
            return { x: p.t, y: units === "imperial" ? mpsToFtps(mps) : mps };
          }),
        }
      : null;
  const spdUnit = units === "imperial" ? "ft/s" : "m/s";
  const predMaxV = units === "imperial" ? mpsToFtps(s.maxVelocity) : s.maxVelocity;
  const logMaxV = logSpeedSeries ? Math.max(...logSpeedSeries.points.map((p) => p.y)) : null;
  const vDeltaPct = logMaxV !== null && predMaxV > 0 ? ((logMaxV - predMaxV) / predMaxV) * 100 : null;

  // No propulsion ⇒ the "flight" is a zero-thrust drop and every metric is meaningless. Lead
  // with why, name the motor(s) that didn't resolve, and withhold the misleading numbers, plots,
  // and the stored comparison. The geometry and stability below are motor-independent and stay
  // valid.
  //
  // Whose stored numbers those are is the file's own tool — OpenRocket, RockSim or RASAero. Every
  // surface below that names it is gated on the file carrying that tool's results, so a design
  // built here rather than imported never reaches them; the neutral wording is the fallback rather
  // than naming a tool that never wrote this design.
  const toolName = sourceTool(doc) ?? "the design file";

  // The geometry panel reflects the active what-if edits, so its silhouette matches the CG/CP the
  // (also edited) flight reports. Ballast and motor-swap what-ifs don't change the shape — they
  // shift only the CG marker — so applying the geometry edits alone keeps the picture consistent.
  const editing = !!(geometry && hasGeometryEdits(geometry));
  // What the heavy analysis panels are keyed on: change any of it and a completed run no longer describes
  // the design on screen, so the panel resets rather than showing a stale answer as a current one.
  const dkey = designKey({ loadId, simIndex, configId: run.config.id, ballastKg, recoveryCdScale, motorSwap, geometry });
  // **The motor sweep is keyed WITHOUT the swap, and that is a correctness point rather than a
  // micro-optimisation.** No sweep row can depend on `motorSwap`: `lib/sim/sweep.ts` overrides the
  // motor per candidate, and every other input (`options`, `designMotor`, `ballastKg`, `geometry`,
  // the condition overrides) is unchanged by one. Keying it on `dkey` meant the new *Use* control
  // re-ran the whole sweep on every tap — fifteen full ballistic flights, on a phone, to produce
  // byte-identical rows, with the table the flyer is reading dimmed to `opacity-50` and announcing
  // itself as stale while they waited. Comparing two candidates cost two complete re-sweeps.
  const sweepKey = designKey({ loadId, simIndex, configId: run.config.id, ballastKg, recoveryCdScale, geometry });
  const shownRocket = editing ? applyGeometryEdits(doc.rocket, geometry) : doc.rocket;
  /** The five descent figures are only as good as the canopy coefficient behind them, and on a file
   *  that states none that coefficient is Loft's rather than the designer's — which R9 closes the
   *  loop on here. `DESIGN.md` §5 requires the `Extrapolated` treatment "wherever a number leaves
   *  the envelope its method was validated over", and a descent computed from a supplied constant
   *  has left it in the plainest way: nothing about this design was measured to produce that figure.
   *
   *  Only when the coefficient is a FALLBACK. A canopy whose Cd the file states, or that the flyer
   *  typed, is the designer's own claim and is not Loft's to caveat — the whole point of
   *  `Parachute.cdFrom` is that those cases are distinguishable, and marking all of them would make
   *  the flag mean nothing. Measured across the corpus: 40 of 92 flights are flown on a fallback,
   *  so this is a caveat a flyer meets often enough to be worth being accurate about. */
  const descentFromDefault = shownRocket
    ? flattenRocket(shownRocket)
        .map((p) => p.component)
        .some((c) => (c.kind === "parachute" || c.kind === "streamer") && c.cdFrom === "default")
    : false;
  const descentWhy = descentFromDefault
    ? "the canopy's drag coefficient is Loft's fallback, not a figure this design states — the descent figures below follow it, so treat them as rough and try the range on /design"
    : undefined;
  /** Why every landing figure is withheld, when they are — the four readouts below share it.
   *
   *  It lived here, and that was the bug: the validation table is a fifth surface reading the same
   *  sentinels, it never asked, and it published them as −100% disagreements with the source
   *  tool while these four said "—". One local string cannot be shared by a module that does
   *  not import this component, so the condition and its wording now live in `lib/sim/withheld.ts`
   *  and both surfaces read them from there. */
  const notLandedWhy = whyNotLanded(s);
  /** Asked of the EDITED rocket, not the pristine one. R5 made a stage something a flyer can author, so
   *  `doc.rocket.stages.length` is the count of the stages the FILE came with and a booster added in the
   *  editor never moves it. Every tool below this line is gated on it, and the cross-check is the one
   *  that publishes a number: it builds its spec from the edited rocket, where `buildRocketpySpec`
   *  carries a single `motor` and folds `motors.length` of them into one coaxial cluster — right for a
   *  cluster and wrong for serial staging. Measured on the starter with one booster authored, the spec
   *  it handed RocketPy read peak thrust 381.0 N against the real 190.5 N and propellant 0.1882 kg
   *  against 0.0941 kg, both motors burning together from t=0 on a vehicle that never sheds a stage —
   *  a wrong number on the one surface whose whole job is to say whether Loft's number can be trusted. */
  const staged = (shownRocket.stages?.length ?? 1) > 1;
  // **Every motor a bore refusal makes unflyable, and that is every motor this list can offer.**
  // `swapOptions` is built from the DESIGN's stated casing, so on an airframe narrowed below its
  // own motor each candidate is refused on arrival — `motorSweep` drops them all at
  // `!run.hasPropulsion` and the panel ends on "none could be flown". The notice below used to point
  // at it as "the exception ... the fastest way to see what this airframe would do", which is a loop
  // with no exit dressed as a recovery. The exception is real for a motor the DATABASE lacks; it is
  // not real for an airframe that cannot hold one.
  const boreRefused = run.resolutions.some((res) => res.vetoedBore);
  // The motor sweep flies the bundled candidates itself rather than the design's own configuration,
  // so it is the one sweep that still works when no motor resolved — and on that design it is
  // the most useful one there is.
  const canSweepMotors = !staged && !boreRefused && !!swapOptions && swapOptions.length > 1;
  // A design can state its weight as a whole-assembly override, and a part added INSIDE that
  // assembly then weighs nothing — the override IS the design's statement about the total, so the
  // model is right to hold it. What was wrong is that nothing said so. Measured on a design weighed
  // by the stage: a 1,000 g payload on a 1.4 kg rocket left dry mass 1.234 kg, liftoff mass 1.436 kg
  // and apogee 581 m every one unchanged, while the panel wore a "with your edits" badge over a
  // table that had not moved. Three of the 35 corpus designs are that shape. Detected by asking the
  // model rather than by inspecting the tree: mass was added, and the total did not move.
  // Only edits that can ADD structure. A main-chute resize was in this list and can shrink one, so
  // trimming a canopy on an overridden design popped a notice saying the mass "you added" had been
  // absorbed — for a change that removed mass.
  const addsMass = (geometry?.payloadMassKg ?? 0) > 0 || (geometry?.drogueDiameter ?? 0) > 0;
  const massAbsorbed =
    editing && addsMass && Math.abs(dryMassProperties(shownRocket).mass - dryMassProperties(doc.rocket).mass) < 1e-9;
  // The same rule read the other way, which had nothing saying so: a part REMOVED from inside a
  // stated assembly does not lower the total either. Judged against the pristine design with only the
  // removals applied, so a dimension edit that adds mass elsewhere cannot mask the difference — and
  // asked of the model (`statedMassHolder`) rather than inferred from a total that did not move, so a
  // genuinely weightless part coming out does not raise a notice about an override that isn't there.
  // Measured on `EscapeVelocity.ork`: its 141.7 g "Avionics" leaves dry mass at exactly 2000.0 g while
  // the static margin moves 4.461 → 4.312 cal.
  //
  // Authoring reads the same way and needed the same sentence: a part built INSIDE a stated assembly
  // weighs nothing either, because the design's own figure already covers whatever is in there. Driving
  // an authored 45 g mass object into all 91 body tubes across the starter and the corpus, 10 of them
  // moved the dry total not at all. Judged on the anchor, since the authored part is not in the
  // pristine design to ask about.
  const massHeldBy = [...(geometry?.removedIds ?? []), ...(geometry?.added ?? []).map((a) => a.after)]
    .map((id) => statedMassHolder(doc.rocket, id))
    .find((holder): holder is string => holder !== null);
  // The motor casing(s) the flight flew, for drawing inside the aft body — resolved for the shown
  // design and its (possibly swapped) config, so the picture matches what was flown.
  const shownMotors = run.hasPropulsion ? motorLayout(shownRocket, run.config) : [];

  return (
    <div className="space-y-6">
      {/* Why there is no flight, when there isn't one. Above the tabs with the flight warnings,
          because it is the context every workspace shares — the geometry below is still real, the
          numbers that depend on thrust are not. */}
      {!run.hasPropulsion && (
        <NoPropulsionNotice run={run} tool={toolName} swapOptions={swapOptions} mountCasingMm={mountCasingMm} doc={doc} />
      )}

      <RocketSummary run={run} doc={doc} rocket={shownRocket} units={units} geometry={geometry} />

      {r.warnings.length > 0 && (
        <ul className="space-y-2">
          {r.warnings.map((w) => (
            <Card
              as="li"
              key={w.code}
              tone={(SEVERITY[w.severity] ?? SEVERITY.info).tone}
              className={cx("text-sm", (SEVERITY[w.severity] ?? SEVERITY.info).text)}
            >
              {w.message}
            </Card>
          ))}
        </ul>
      )}

      {/* **The airframe, kept on screen while the flyer works on something else** —
          `COMPETITION.md` row 31, and the one thing the route split cost that the scrolling page did
          not. Every desktop tool keeps a view of the rocket beside whatever tab is open; Loft mounted
          the drawing in `panel-design` alone, so sweeping a fin or reading a dispersion meant losing
          sight of the airframe both are about.

          It sits HERE, above the spine and outside every `role="region"` block, for a mechanical
          reason as well as a visual one: `RocketDiagram` measures itself with `useMeasuredWidth`,
          which reads 0 inside a `hidden` subtree — mounted within a workspace panel it would measure
          nothing and draw nothing, silently, on every route but the open one.

          Suppressed on `/design`, where the full drawing is already the top of the workspace. A
          second copy there would be redundant and, worse, AMBIGUOUS: the same accessible names would
          appear twice on one page.

          The CG/CP gating mirrors the full diagram's below, deliberately and for the reason recorded
          there — an unmatched motor must retire the CG mark, its caption and the SVG's own
          `aria-label` together, rather than drawing a balance point that assumes a motor is aboard. */}
      {tab !== "design" && (
        <AirframeStrip
          rocket={shownRocket}
          units={units}
          cg={run.motorsComplete ? run.result.cgLoaded : undefined}
          cp={run.result.stability.cp}
          marginCal={run.motorsComplete ? run.result.staticMarginCal : undefined}
          motors={shownMotors}
        />
      )}

      {/* The workspace spine — one row of links, on every workspace route, showing where the flyer
          is. The design summary and any flight warnings above stay put, as the context every
          workspace shares. */}
      <WorkspaceNav />

      {/* FLIGHT — the simulated flight itself. The comparison against the file's own stored numbers
          used to live here too and moved to Cross-check, beside the other two surfaces that answer
          the same question. */}
      {/* A landmark region per workspace, not a `tabpanel`: there is no tablist above them any more,
          and a `tabpanel` with nothing controlling it is a lie told to a screen reader. The ids are
          kept — they are what a skip link and the suite address a workspace by. */}
      <div role="region" id="panel-flight" aria-label="Flight workspace" hidden={tab !== "flight"} className="space-y-8">
      {/* With no thrust every flight number is meaningless, so the workspace says what it would hold
          and why it is empty rather than showing a zero-altitude "flight" — or simply vanishing,
          which reads as a feature Loft doesn't have. */}
      {!run.hasPropulsion && (
        <ToolUnavailable
          title="Flight"
          reason={`Flying this design needs a thrust curve, and none of ${
            run.resolutions.length > 1 ? "its motors" : "its motor"
          } could be matched to one — see the notice above. The flight results, the plots and the flight path all depend on that thrust, so they are withheld rather than shown as zeros. Swap in a bundled motor under Design and they fill in. (The ${toolName} comparison depends on it too, and says so on Cross-check.)`}
        />
      )}
      {run.hasPropulsion && (<>
      {/* Key results */}
      <Section
        aria-label="Results"
        title="Flight"
        aside={<>
          {/* Where these numbers are weak, beside the numbers. This link only ever appeared inside
              the NO-MOTOR notice, so a flyer looking at a perfectly ordinary flight had no route to
              the limitations log at all — the milestone's clause is that these pages are found
              "from where the question arises rather than from a footer", and it arises here.
              Deliberately NOT in the design summary beside the methods link: that strip is shared
              chrome above the workspace spine, and putting a second link in it wrapped the row and
              took the phone chrome from 1060 to 1070 px, which the depth ratchet caught. Inside the
              panel it costs every route's depth nothing. */}
          <Link
            href="/docs/limitations"
            className="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          >
            where it&apos;s weak
          </Link>
        </>}
      >
        {baseline && baseline.hasPropulsion && <WhatIfDelta run={run} baseline={baseline} units={units} />}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {/* Marked on the numbers the transonic drag extrapolation actually drives — the ascent.
              Rail-exit velocity (~20 m/s off the rail) and thrust-to-weight (static) are inside the
              validated envelope whatever the flight does later, so marking them would be the flag
              crying wolf that the brief warns teaches flyers to ignore every flag. */}
          <Readout label="Apogee" q={d.altitude(s.apogee, units)} accent extrapolated={extrapolatedWhy} />
          <Readout label="Max velocity" q={d.speed(s.maxVelocity, units)} sub={d.q(d.mach(s.maxMach))} extrapolated={extrapolatedWhy} />
          <Readout label="Max acceleration" q={d.accel(s.maxAcceleration)} extrapolated={extrapolatedWhy} />
          <Readout label="Rail-exit velocity" q={d.speed(s.railExitVelocity, units)} />
          <Readout label="Thrust-to-weight" q={d.ratio(s.thrustToWeight)} sub="liftoff" />
          <Readout label="Time to apogee" q={d.seconds(s.timeToApogee)} extrapolated={extrapolatedWhy} />
          <Readout label="Burnout velocity" q={d.speed(s.burnoutVelocity, units)} extrapolated={extrapolatedWhy} />
          <Readout
            label="Descent rate"
            q={d.speed(s.descentRate, units)}
            sub={s.drogueDescentRate !== undefined ? "under main" : undefined}
            extrapolated={descentWhy}
          />
          {s.drogueDescentRate !== undefined && (
            <Readout
              label="Drogue descent"
              q={d.speed(s.drogueDescentRate, units)}
              sub="under drogue"
              extrapolated={descentWhy}
            />
          )}
          {/* Withheld on the same test as the two below, and it was not until 2026-08-02. Drift is
              `simulate`'s exit position taken unconditionally, so a flight still descending at the
              cap reports how far downwind it had got — a plausible smaller number rather than an
              obvious zero, sitting between two figures that correctly say they do not exist. */}
          <Readout
            label="Drift from pad"
            q={d.distance(s.driftDistance, units)}
            withheld={notLandedWhy}
          />
          {/* Both are 0 when the flight never reached the ground — a sentinel the solver carries,
              not a measurement, and these are the two numbers a recovery setup is judged on. Shown
              as zeros, a flyer enlarging a canopy watched the landing energy fall to 0 J and read
              it as success. */}
          <Readout
            label="Ground-hit speed"
            q={d.speed(s.groundHitVelocity, units)}
            sub="descent rate at impact"
            withheld={notLandedWhy}
            extrapolated={descentWhy}
          />
          {/* The speed over the ground is a different question from the descent rate, and under
              wind it is a materially different number — up to twice it on a light canopy. It is
              shown beside rather than folded in, and only when the two actually diverge, because a
              second stat repeating the first to three significant figures is noise. */}
          {s.landed && s.groundHitTotalVelocity > s.groundHitVelocity * 1.05 && (
            <Readout
              label="Arrival speed"
              q={d.speed(s.groundHitTotalVelocity, units)}
              sub="over the ground, drift included"
              extrapolated={descentWhy}
            />
          )}
          <Readout
            label="Landing energy"
            q={d.energy(s.landingEnergy, units)}
            sub="whole vehicle, from descent rate"
            withheld={notLandedWhy}
            extrapolated={descentWhy}
          />
          <Readout label="Optimum delay" q={d.seconds(s.optimumDelay)} sub="burnout → apogee" extrapolated={extrapolatedWhy} />
          {/* **Withheld on the same test as its three neighbours, and it was not until 2026-08-05.**
              A flight that never reached the ground has no flight TIME either — it has however long
              the solver ran, which on a 25 m main is 1.3 s because the adaptive step collapses under
              an enormous canopy. One panel published three em dashes and a confident 1.3 s for the
              same non-flight. */}
          <Readout label="Flight time" q={d.seconds(s.flightTime)} withheld={notLandedWhy} />
          <Readout label="Max dynamic pressure" q={d.dynamicPressure(s.maxDynamicPressure, units)} extrapolated={extrapolatedWhy} />
        </div>
        <RecoverySizingHint run={run} units={units} />
        <BoosterDescentNote run={run} units={units} />
      </Section>

      {/* Flight phases — a staged flight's own timeline. Gated on the EDITED rocket, like every other
          staged surface: reading `doc.rocket.stages.length` is the bug R5 has already hit twice, and a
          phase table invisible on an authored booster fails the milestone's *done when* outright. */}
      {staged && <PhaseTable run={run} rocket={shownRocket} units={units} />}

      {/* Flight path */}
      <Panel label="Flight path" title="Flight path">
        <div className="mt-3">
          <FlightViz result={r} units={units} />
        </div>
      </Panel>

      {/* Plots */}
      <Section
        aria-label="Plots"
        className="space-y-6"
        title="Plots"
        aside={<>
          {/* The raw trajectory, sample by sample, for a spreadsheet or a plot against an altimeter
              log — offered only for a real flight (a design with no resolved motor has none). */}
          {run.hasPropulsion && r.trajectory.length > 0 && (
            <DownloadCsv rows={flightDataCsv(r, units)} name={doc.rocket.name} suffix="flight-data" label="Download flight data" />
          )}
        </>}
      >
        {/* Two-up once the column is wide enough for it: four full-width plots stacked made the
            Flight workspace 4.7 screens tall, and reading altitude against velocity meant
            scrolling between them. */}
        <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <Figure title={`Altitude (${units === "imperial" ? "ft" : "m"}) vs time`}>
          <LineChart
            series={logSeries ? [altSeries(r, units), logSeries] : [altSeries(r, units)]}
            markers={markers}
            xLabel="time (s)"
            yLabel={units === "imperial" ? "ft" : "m"}
            yZeroFloor
          />
          {run.hasPropulsion && r.trajectory.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              {/* Overlay a real altimeter log beside the prediction — the predict → fly → compare loop.
                  Parsed in the browser; the file is never uploaded. */}
              {/* `TOUCH_TARGET` on the LABEL, because the label is the control. The input inside is
                  `sr-only` and 1x1, so the touch scan's `width < 4` filter drops it and its selector
                  never matched a `<label>` at all — and the scan's own comment exempted it on the
                  grounds that it sits "behind a visible 44 px trigger". Measured on a phone: 148x30.
                  A documented exemption resting on a wrong measurement is worse than no exemption,
                  because it reads as having been checked. */}
              <label className="print-hide inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300 px-2.5 py-1 font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 pointer-coarse:min-h-11">
                {log ? "Replace flight log" : "Overlay a flight log"}
                <input
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  aria-label="Flight log CSV"
                  className="sr-only"
                  onChange={(e) => {
                    onLogFile(e.target.files?.[0]);
                    e.target.value = ""; // allow re-selecting the same file after a parse error
                  }}
                />
              </label>
              {log && (
                <>
                  <label className="inline-flex items-center gap-1.5">
                    Log altitude in
                    <Select
                      aria-label="Flight log altitude unit"
                      value={log.unit}
                      // CHANGING the unit makes it the flyer's, so the marker goes. Re-picking the
                      // value already shown does not fire `change` at all, so a flyer whose guess
                      // was already right keeps the caution — which is the correct outcome and not
                      // a workaround: Loft still does not know, and the file still does not say.
                      // What is genuinely missing is a way to SAY "yes, metres" without changing
                      // anything; filed rather than bolted on.
                      onChange={(e) => setLog({ ...log, unit: e.target.value as LogUnit, unitAssumed: false })}
                    >
                      <option value="m">metres</option>
                      <option value="ft">feet</option>
                    </Select>
                  </label>
                  {log.unitAssumed && (
                    <span className="text-amber-700 dark:text-amber-400">
                      · assumed &mdash; the file&apos;s header does not name a unit
                    </span>
                  )}
                  <span>· {log.points.length} points</span>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setLog(null);
                      setLogError(null);
                    }}
                    className="underline underline-offset-2"
                  >
                    Remove
                  </Button>
                </>
              )}
              {logError ? (
                <span className="text-red-600 dark:text-red-400">{logError}</span>
              ) : !log ? (
                <span>a CSV with time and altitude columns — its curve overlays here to check against.</span>
              ) : null}
            </div>
          )}
          {logPeak !== null && (
            <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
              Log peak <strong className="tabular-nums">{d.fmt(logPeak, 0)}&nbsp;{altUnit}</strong> · Loft predicted{" "}
              <strong className="tabular-nums">{d.fmt(predApogee, 0)}&nbsp;{altUnit}</strong>
              {peakDeltaPct !== null && Math.abs(peakDeltaPct) >= 0.5 && (
                <>
                  {" "}— the log flew{" "}
                  <strong className="tabular-nums">{d.fmt(Math.abs(peakDeltaPct), 0)}%</strong>{" "}
                  {peakDeltaPct >= 0 ? "higher" : "lower"} than predicted
                </>
              )}
              . Your measurement beside the estimate — not a model-accuracy figure.
              {/* The caution rides with the number rather than only at the control that sets it: this
                  sentence is what a flyer reads and quotes, and a unit Loft guessed is exactly the
                  kind of assumption `DESIGN.md` §6 requires a reference value to name. Stated as the
                  consequence, because "unit assumed" alone does not tell anyone what it would cost. */}
              {log?.unitAssumed && (
                <>
                  {" "}
                  <span className="text-amber-700 dark:text-amber-400">
                    The unit is Loft&apos;s assumption, not the file&apos;s: if this log is in{" "}
                    {log.unit === "m" ? "feet" : "metres"}, every figure on this line is out by 3.3&times;.
                    Set it above.
                  </span>
                </>
              )}
            </p>
          )}
        </Figure>
        </Card>
        <Card>
          <Figure title={`Velocity (${units === "imperial" ? "ft/s" : "m/s"}) vs time`}>
          <LineChart
            series={logSpeedSeries ? [...velSeries(r, units), logSpeedSeries] : velSeries(r, units)}
            markers={markers}
            xLabel="time (s)"
            yLabel={units === "imperial" ? "ft/s" : "m/s"}
          />
          {logSpeedSeries && log?.speed && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              {/* The uploaded log carried a velocity column — overlay it and compare peaks, with its own
                  unit picker (speeds are exported in more units than altitudes). */}
              <label className="inline-flex items-center gap-1.5">
                Log speed in
                <Select
                  aria-label="Flight log speed unit"
                  value={log.speed.unit}
                  onChange={(e) =>
                    setLog(
                      log
                        ? {
                            ...log,
                            speed: log.speed
                              ? { ...log.speed, unit: e.target.value as LogSpeedUnit, unitAssumed: false }
                              : null,
                          }
                        : null,
                    )
                  }
                >
                  <option value="m/s">m/s</option>
                  <option value="ft/s">ft/s</option>
                  <option value="mph">mph</option>
                  <option value="km/h">km/h</option>
                </Select>
              </label>
              {log.speed.unitAssumed && (
                <span className="text-amber-700 dark:text-amber-400">
                  · assumed, from four possibilities &mdash; the header does not name one
                </span>
              )}
              {logMaxV !== null && (
                <span className="text-zinc-600 dark:text-zinc-300">
                  Log peak <strong className="tabular-nums">{d.fmt(logMaxV, 0)}&nbsp;{spdUnit}</strong> · Loft predicted{" "}
                  <strong className="tabular-nums">{d.fmt(predMaxV, 0)}&nbsp;{spdUnit}</strong>
                  {vDeltaPct !== null && Math.abs(vDeltaPct) >= 0.5 && (
                    <>
                      {" "}— <strong className="tabular-nums">{d.fmt(Math.abs(vDeltaPct), 0)}%</strong>{" "}
                      {vDeltaPct >= 0 ? "faster" : "slower"}
                    </>
                  )}
                  {log.speed.unitAssumed && (
                    <>
                      {" "}
                      <span className="text-amber-700 dark:text-amber-400">
                        on a unit Loft assumed &mdash; set it above.
                      </span>
                    </>
                  )}
                </span>
              )}
            </div>
          )}
        </Figure>
        </Card>
        <Card>
          <Figure title="Acceleration (g) vs time">
          <LineChart series={[accelSeries(r)]} markers={markers} xLabel="time (s)" yLabel="g" />
        </Figure>
        </Card>
        {/* "Total thrust", not "Motor thrust" — the curve is the vehicle's, summed across every
            motor burning at that instant, so on a staged or airstarted design it is not any single
            motor's published curve. The old singular heading was half of what made the first-motor
            plot a defect rather than a partial view: nothing on the surface said it was one of
            several. The caption below names them. */}
        {thrustSeries(run) && (
          <Card>
            <Figure title="Total thrust (N) vs time">
              <LineChart series={[thrustSeries(run)!]} xLabel="time (s)" yLabel="N" yZeroFloor />
              <MotorStatsCaption run={run} units={units} />
            </Figure>
          </Card>
        )}
        </div>
      </Section>
      </>)}
      </div>

      {/* DESIGN — the rocket itself: its shape (editable on the diagram) and where its mass sits. */}
      <div role="region" id="panel-design" aria-label="Design workspace" hidden={tab !== "design"} className="space-y-8">
        {/* The parsed component tree with each part's dimensions and station — import verification.
            The diagram marks the loaded CG and CP so the stability picture reads off the airframe.

            **The CG and the margin are withheld when a motor is missing, and this is the call site
            that decides it.** `GeometryInspector` takes them as plain optional numbers, so there is
            nowhere in its contract to say the motor is absent — which is precisely how the diagram
            came to draw a "CG" mark at the DRY station, caption it with the unloaded margin, and
            assert that margin in the SVG's own `aria-label` (the one a screen reader speaks, and the
            one that travels with a copied graphic) while the same screen's summary strip withheld
            it. Passing `undefined` retires all three together, because each is already gated on the
            value being present. `shownMotors` was ALREADY gated on `hasPropulsion` here, so the
            picture drew an empty motor tube beside a CG that assumed a motor was in it. */}
        <GeometryInspector
          rocket={shownRocket}
          units={units}
          cg={run.motorsComplete ? run.result.cgLoaded : undefined}
          cp={run.result.stability.cp}
          marginCal={run.motorsComplete ? run.result.staticMarginCal : undefined}
          cgWithheldReason={
            run.motorsComplete
              ? undefined
              : "The centre of gravity and the static margin are not marked: a motor in this configuration could not be matched to a thrust curve, so it is left out of the build entirely and the balance would be drawn without its mass. Match the motor, or swap in a substitute, and both come back — including the live margin readout while you drag."
          }
          edited={editing}
          motors={shownMotors}
          onEdit={onEditGeometry}
          onSelectPart={onSelectPart}
          propertiesFor={propertiesFor}
          onRemove={onRemovePart}
          onAddAfter={onAddAfter}
          onMove={onMovePart}
          canMove={canMovePart}
          onMoveTo={onMovePartTo}
          moveSlotsFor={movePartSlots}
          addedStages={geometry?.addedStages}
          onAddStage={onAddStage}
          onRemoveStage={onRemoveStage}
          mountAdds={geometry?.mountAdds}
          canAddMountTo={canAddMountTo}
          onAddMount={onAddMount}
          onRemoveMount={onRemoveMount}
          refuseRemoval={refuseRemoval}
          // The authored parts themselves, from the same bag `addedStages` and `mountAdds` come from
          // — the catalogue pick rides on the `AddedPart` entry, so the entry is what the panel has
          // to see to know whether one is set.
          added={geometry?.added}
          onPickPart={onPickPart}
          onClearPick={onClearPick}
          // The aim map, so a role added to the edit model needs no new prop on the way down. Projected
          // through the registry, never the raw bag: a typed span is not an aim.
          aims={geometry ? aimsOf(geometry) : undefined}
        />

        {/* The editing surface, right below the diagram it changes — fly a different motor, add
            nose weight, resize/reshape the airframe. Build and edit are the same surface. */}
        {designEditor}

        {/* Where the dry mass comes from, part by part — transparency into the parsed structure. */}
        {/* The EDITED rocket, like the diagram above it: this panel was describing the file's
            airframe while the diagram described the one being edited, and Mass & balance is where a
            flyer decides how much ballast to add and where.

            It is not what makes the two totals agree, and an earlier version of this comment said
            it was. `massByComponent` keeps only point masses that carry a component id, so it drops
            the lumped figure a stage-level mass override emits; the caption above used to SUM it and
            read "adds up to 0 kg" against a real 1.361 kg airframe. That is fixed one component
            over, in `GeometryInspector`, by stating `dryMassProperties` instead — not here. */}
        <MassBreakdown
          rocket={shownRocket}
          units={units}
          edited={editing}
          massAbsorbed={massAbsorbed}
          massHeldBy={massHeldBy}
        />
      </div>

      {/* SWEEP — vary one thing and see what it does. The heavier, opt-in tools that re-fly the
          design hundreds of times: every motor that fits, one dimension at a time, and a dispersion
          over the whole flight. The second solver used to sit here too and now has its own route,
          beside the other two surfaces that answer "does something else agree?". */}
      <div role="region" id="panel-sweep" aria-label="Sweep workspace" hidden={tab !== "sweep"} className="space-y-8">
      {/* Two of the three tools here are single-stage only — a swept "primary" fin or nose is
          ambiguous once there are several stages. Saying so is the point: a panel that is simply
          absent reads as a feature Loft doesn't have. The second solver has the same limit and now
          says so on its own workspace rather than here. */}
      {staged && (
        <ToolUnavailable
          title="Design sweeps"
          // The EDITED count, for the same reason `staged` above is: on a design with a booster authored
          // in the editor `doc.rocket.stages.length` is still the file's 1, so this read "This design
          // flies 1 stages." — a wrong number and a broken sentence, on the copy whose only job is to
          // explain why three tools just disappeared.
          reason={`This design flies ${shownRocket.stages.length} stages. A motor or parameter sweep needs one unambiguous airframe to vary — with several stages there is no single "the" nose, body or fin set to sweep. The dispersion study below is over the whole flight and does run on a staged design, and the second solver on Cross-check has the same single-stage limit.`}
        />
      )}
      {/* Without a resolved motor there is no flight to analyze, and every tool here is built on one
          — except the motor sweep, which flies the bundled candidates itself and so still answers
          the question this design actually has: which motor to put in it. */}
      {!run.hasPropulsion && (
        <ToolUnavailable
          title={canSweepMotors ? "Parameter sweep and dispersion study" : "Design sweeps"}
          reason={`These tools re-fly the design hundreds of times, and this one has no thrust curve to fly on — see the notice above.${
            canSweepMotors
              ? " The motor sweep below is the exception: it flies the bundled substitutes themselves, so it works here and is the fastest way to see what this airframe would do on each of them."
              : boreRefused
                ? " Widen the airframe on Design until it can hold its motor, and they become available."
                : " Swap in a bundled motor under Design and they become available."
          }`}
        />
      )}
      {/* Motor sweep: only when there's a real choice (more than one fitting bundled motor) and a
          single-stage vehicle, so each swept flight is a like-for-like whole-rocket comparison.
          Keyed on the design + config + active geometry/ballast what-if so it resets when the design
          the sweep is over changes. */}
      {canSweepMotors && (
        <MotorSweep
          designKey={sweepKey}
          flownOverrides={flownOverrides}
          weatherSerial={weatherSerial}
          conditions={conditions}
          doc={doc}
          simIndex={simIndex}
          units={units}
          options={swapOptions}
          mountCasingMm={mountCasingMm}
          designMotor={designMotor ?? ""}
          designManufacturer={designManufacturer}
          designApogee={run.result.summary.apogee}
          designMotorFlies={designMotorFlies}
          ballastKg={ballastKg}
          geometry={geometry}
          motorSwap={motorSwap}
          onUse={
            onUseMotor
              ? (r) =>
                  onUseMotor({
                    manufacturer: r.manufacturer,
                    designation: r.designation,
                    // Carried so this path and the `Swap motor` select build the IDENTICAL record.
                    // `swapMotor` falls back to the design's own motor diameter when this is absent,
                    // and the sweep only ever offers motors of the design's own casing, so the two
                    // agree today — but "agree today by an argument" is exactly the kind of
                    // equivalence that stops holding when the sweep's list widens. Looked up rather
                    // than assumed: `MotorSweepRow` carries no diameter, `swapOptions` does.
                    diameter: swapOptions?.find(
                      (o) => o.manufacturer === r.manufacturer && o.designation === r.designation,
                    )?.diameter,
                  })
              : undefined
          }
        />
      )}

      {/* Parameter sweep: vary one design dimension and plot the response. Single-stage only, so the
          swept "primary" nose/body/fin is unambiguous. Keyed on design + config + active what-ifs so
          it resets when the design the sweep is over changes. */}
      {!staged && run.hasPropulsion && (
        <ParameterSweep
          designKey={dkey}
          flownOverrides={flownOverrides}
          weatherSerial={weatherSerial}
          conditions={conditions}
          doc={doc}
          simIndex={simIndex}
          units={units}
          ballastKg={ballastKg}
          motorSwap={motorSwap}
          geometry={geometry}
          // `hasPropulsion` is what decides whether this panel is offered at all — a reduced flight
          // is still a meaningful apogee. `motorsComplete` is what decides whether ONE of its metrics
          // can be published, and the two are not the same predicate: a cluster with one motor Loft
          // has no curve for satisfies the first and fails the second. Same sentence as the strip.
          marginWithheld={run.motorsComplete ? undefined : MOTOR_GAP_SHORT(run)}
        />
      )}

      {/* Monte-Carlo dispersion: fly the design hundreds of times with jittered impulse, rail angle,
          and wind, and show the outcome spread (apogee band + recovery-area radius). Offered for any
          design that develops thrust — including multi-stage — since the dispersion is over the whole
          flight. Keyed on design + config + active what-ifs so it resets when the flown design changes. */}
      {run.hasPropulsion && (
        <MonteCarlo
          designKey={dkey}
          designId={designId}
          weatherAt={weatherAt}
          flownOverrides={flownOverrides}
          weatherSerial={weatherSerial}
          conditions={conditions}
          doc={doc}
          simIndex={simIndex}
          units={units}
          ballastKg={ballastKg}
          recoveryCdScale={recoveryCdScale}
          motorSwap={motorSwap}
          geometry={geometry}
        />
      )}

      </div>

      {/* CROSS-CHECK — every surface that answers "does anything else agree?", in one place. Two of
          the three were in the FLIGHT panel and the third was in ANALYZE, which put the file's own
          stored numbers a workspace away from the independent solver run against the same design.
          North Star #1 is that these are shown side by side as independent estimates that can
          disagree; they could not be side by side while they were on different routes. */}
      <div role="region" id="panel-validate" aria-label="Cross-check workspace" hidden={tab !== "validate"} className="space-y-8">
      {/* The same gate these two carried in the Flight panel, moved with them: with no thrust there
          is no flight to compare against anything. Said, rather than left blank — a workspace that
          simply vanishes reads as a feature Loft does not have. */}
      {!run.hasPropulsion && (
        <ToolUnavailable
          title="Cross-check"
          reason={`Every check here puts a flight beside something else — ${toolName}'s own stored numbers, its step-by-step trajectory, or an independent solver run in your browser. None of ${
            run.resolutions.length > 1 ? "this design's motors" : "this design's motor"
          } could be matched to a thrust curve, so there is no flight to put beside them. Swap in a bundled motor under Design and these fill in.`}
        />
      )}
      {/* The second solver flies a single-stage vehicle. On a staged design it is simply not
          offered, and until this notice existed the whole workspace could go blank on a design that
          carries no stored results either — three surfaces absent, nothing said, which is exactly
          the "reads as a feature Loft doesn't have" case the notice pattern exists for. */}
      {staged && run.hasPropulsion && (
        <ToolUnavailable
          title="Second solver"
          reason={`This design flies ${shownRocket.stages.length} stages, and the RocketPy cross-check flies a single-stage vehicle. The comparisons against ${toolName}'s own stored numbers are unaffected and appear here whenever the file carries them.`}
        />
      )}
      {run.hasPropulsion && (<>
      {run.validation && run.validation.count > 0 && (
        <ValidationPanel
          report={run.validation}
          units={units}
          storedName={doc.simulations[simIndex]?.name}
          toolName={toolName}
          external={doc.simulations[simIndex]?.status === "external"}
          storedStatus={doc.simulations[simIndex]?.status}
        />
      )}

      {/* Per-step cross-check: when the file carries the design tool's own step-by-step flight and
          Loft flew the design as stored (run.validation present ⇒ no what-if edits, not reduced),
          overlay Loft's trajectory and drag against it — an independent per-step oracle beyond the
          summary numbers above. */}
      {run.validation && doc.simulations[simIndex]?.flightData && (
        <DragCrossCheck
          result={r}
          flightData={doc.simulations[simIndex]!.flightData!}
          toolName={toolName}
          storedName={doc.simulations[simIndex]?.name}
          storedStatus={doc.simulations[simIndex]?.status}
          units={units}
        />
      )}

        {/* Why there is no stored comparison at all: the file carries simulations, and not one of
            them holds a result. Absence is the state that reads as "Loft cannot do this" — and the
            import screen has just said it can — so say what the file has instead of showing nothing.
            The reduced-vehicle panel below is gated on a stored result EXISTING, so the two cannot
            both fire. */}
        {doc.simulations.length > 0 && !doc.simulations.some((sim) => sim.hasResults) && (
          <ToolUnavailable
            title={`${toolName} comparison`}
            reason={noStoredResultsReason(doc.simulations.map((sim) => sim.status), toolName)!}
          >
            {/* The question this design cannot answer is still worth answering. "How far off is
                Loft?" is exactly what a flyer wants when the file gives them nothing to compare
                against, and until now the only route to that evidence was a page they had to know
                existed. All three bundled samples land here, so it is also what a stranger sees. */}
            Loft&apos;s own accuracy is measured against 35 real design files with stored results —{" "}
            <Link href="/docs/validation" className="underline underline-offset-2">
              see how this is measured
            </Link>
            .
          </ToolUnavailable>
        )}

        {/* Why the metric-by-metric stored comparison is withheld for a design Loft flew reduced. */}
        {doc.flownAsReduced && doc.simulations.some((sim) => sim.hasResults) && (
          <Card as="section" tone="warn" aria-label="Comparison withheld" className="text-sm">
            <h2 className="text-base font-semibold tracking-tight">{toolName} comparison withheld</h2>
            <p className="mt-1.5">
              This design contains something Loft flew in simplified form — staging, pods, parallel
              boosters, or a fin type it can&apos;t model (see the warnings above) — so the stored{" "}
              {toolName}{" "}
              results describe a different flight than the one simulated here. Comparing them
              would misstate the engine&apos;s accuracy, so the metric-by-metric comparison is
              withheld — import a design Loft flies complete for a like-for-like check.
            </p>
          </Card>
        )}
      </>)}
      {/* An independent second solver on the flyer's own design — RocketPy's flight is single-stage,
          so offer it only for single-stage designs that actually have propulsion.
          Key on the design + configuration + active what-if so any change (config switch, ballast,
          motor swap) remounts the panel to idle instead of leaving a stale RocketPy result on screen. */}
      {/* `motorsComplete`, not `hasPropulsion`: this panel runs its own `runFlight` and puts
          `staticMarginCal` in a comparison row against RocketPy's, so on a partial cluster it would
          republish the very margin the summary strip above it withholds — and label the disagreement
          with RocketPy as an accuracy gap when the real cause is a motor Loft could not find. */}
      {!staged && run.motorsComplete && (
        <RocketpyCrossCheck
          designKey={dkey}
          doc={doc}
          config={run.config}
          simIndex={simIndex}
          units={units}
          ballastKg={ballastKg}
          motorSwap={motorSwap}
          geometry={geometry}
        />
      )}

      </div>
    </div>
  );
}

function NoPropulsionNotice({
  run,
  tool,
  swapOptions,
  mountCasingMm,
  doc,
}: {
  run: FlightRun;
  tool: string;
  /** Bundled motors of the design's own casing diameter — the substitutes the design tools below
   *  offer. When present, the notice points the flyer at that recovery path rather than dead-ending. */
  swapOptions?: { designation: string; manufacturer: string; diameter: number; motorClass: string }[];
  /** The casing the design's own mount takes. See `casingMm` below for why `swapOptions[0]` will not
   *  do. */
  mountCasingMm?: number;
  doc: OrkDocument;
}) {
  const unresolved = run.resolutions.filter((res) => !res.match);
  const hasInstances = run.resolutions.length > 0;
  // Same-casing substitutes exist — the "Swap motor" picker in the design tools below can fly the
  // design on a bundled curve of the right diameter, turning a dead-end into a two-click recovery.
  // Gated at >1 to match that picker's own visibility, so the notice never points at an absent one.
  // **Not offered when the mount itself is too small**, because the list is built from the DESIGN's
  // stated casing and every motor on it is that same diameter — so each one is refused on arrival for
  // the same reason. Offering a two-click recovery that cannot work sends the flyer round a loop with
  // no exit in it, which reads as broken rather than as refused. The way out here is the airframe
  // dimension they just changed, and the notice above names it.
  const boreRefused = run.resolutions.some((res) => res.vetoedBore);
  const canSubstitute = !boreRefused && !!swapOptions && swapOptions.length > 1;
  // The configuration picker only renders when the design stores more than one, so a design with a
  // single stored configuration has nothing to pick — offering that as the way out sends the flyer
  // hunting for a control that was never drawn. Gated the same way the picker itself is.
  const canPickConfig = configChoices(doc).length > 1;
  // **The MOUNT's figure, not the first offered motor's.** `swapOptions` merges the catalogue's 75
  // and 76 mm motors into one physical class (3 inches is 76.2 mm — `sameCasing`), and it is sorted
  // by impulse, so the first row can state a diameter this design has never had. The sentence below
  // makes a fit claim, so it has to name the mount.
  const casingMm =
    mountCasingMm && mountCasingMm > 0
      ? mountCasingMm
      : canSubstitute
        ? Math.round(swapOptions![0].diameter * 1000)
        : 0;
  return (
    <Panel label="No flight simulated" title="No flight simulated" tone="danger">
      {hasInstances ? (
        <>
          {/* Each branch carries its own negation. Sharing the clause "could be matched" only reads
              correctly after "None of …": the singular subject took it verbatim and said "This
              configuration's motor could be matched to a thrust curve … so there is no thrust to
              fly" — the opposite of what happened, contradicting itself in the same sentence, on the
              panel whose whole job is to explain why there is no flight. */}
          <p className="mt-2 text-sm">
            {unresolved.length > 1
              ? "None of this configuration's motors could be matched"
              : "This configuration's motor could not be matched"}{" "}
            to a thrust curve
            {/* "in the bundled database" alone is FALSE where the casing veto fired: the designation
                does reach a bundled curve, and Loft turned it down because the motor is the wrong
                diameter for the mount. Flying it anyway is the Sev-1 this replaced. */}
            {unresolved.some((res) => res.vetoedFit || res.vetoedBore) ? " that fits this mount" : ""} in the bundled
            database, so there is no thrust to fly. Rather than show a misleading zero-altitude
            &ldquo;flight,&rdquo; the flight results, plots, and {tool} comparison are withheld.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {unresolved.map((res, i) => (
              <li key={i} className="font-mono">
                {res.manufacturer ? `${res.manufacturer} ` : ""}
                {res.designation}
                {/* "not found" is the wrong sentence for a motor that WAS found and turned down for
                    its casing — and that refusal is the one a flyer most needs explained, because
                    the designation looks almost right. Naming the near-miss and both diameters
                    points at the two things it can actually be: a mistyped designation, or a stated
                    casing that disagrees with the motor the file means. */}
                {/* The bore refusal names the AIRFRAME, not the motor, because that is the thing
                    the flyer changed. It fires on an edit rather than on a file — a body diameter
                    typed below the motor inside it — so "not found" and "wrong casing" both point
                    at the wrong end of the problem. */}
                {res.vetoedBore
                  ? ` — ${res.vetoedBore.designation} is a ${res.vetoedBore.motorMm} mm motor and this mount is ${res.vetoedBore.boreMm} mm across; it cannot go in`
                  : res.vetoedFit
                    ? ` — ${res.vetoedFit.designation} is the closest bundled name, and it is a ${res.vetoedFit.matchedMm} mm motor; this one is on a ${res.vetoedFit.statedMm} mm casing`
                    : " — not found"}
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
      {canSubstitute && (
        <p className="mt-3 text-sm">
          <strong>Fly it with a substitute.</strong> The bundled set has {swapOptions!.length} motors
          of the same {casingMm} mm casing. Pick one under <em>Swap motor</em>{" "}in the design tools
          below and the flight re-flies with it — a quick way to get a ballpark while you track down
          the exact curve.
        </p>
      )}
      {/* **The way out, named as a control on a page.** A bore refusal is not about the motor
          database at all, so the paragraph below — which blames the bundled subset and tells the
          flyer to check the designation — is the wrong instruction on this branch. It is suppressed
          and replaced with the one that works. Naming the field and the workspace, not just the two
          diameters: a flyer who typed a number into a box needs to be told which box. */}
      {boreRefused ? (
        <p className="mt-3 text-sm">
          <strong>Nothing is wrong with the motor.</strong> The airframe is narrower than the motor
          it is meant to hold, so no bundled curve of this casing would fit either — which is why
          there is no substitute to offer. Widen <em>Body diameter</em>{" "}on the{" "}
          <Link href="/design" className="underline underline-offset-2">
            Design
          </Link>{" "}
          workspace until it clears the figure above, or clear the field to go back to the
          design&apos;s own diameter. The rocket geometry below is computed independently and remains
          valid; stability is not, because a motor that cannot be loaded is left out of the build.
        </p>
      ) : (
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
        . Check the designation
        {!canSubstitute && canPickConfig ? ", or pick a configuration whose motor is in the set" : ""}. The rocket
        geometry below — lengths, diameters, and the dry mass — is computed independently and remains
        valid. <strong>Stability is not:</strong> an unmatched motor is left out of the build
        entirely rather than carried as dead weight, so the centre of gravity sits forward of where
        it would fly and the static margin is withheld rather than reported over-stable.
      </p>
      )}
    </Panel>
  );
}

/** Why the loaded figures are withheld, in the few words a `Field`'s sub-line has room for.
 *
 *  There are TWO states behind `!motorsComplete` and they need different words. When nothing
 *  resolved, `NoPropulsionNotice` renders above the strip and explains at length, so this only has
 *  to name the cause. When SOME motors resolved — a cluster with one missing — that notice does not
 *  render at all, so this sub-line is the only thing on the surface saying why a number vanished.
 *  A single string would have been wrong in one of the two, and silent in the one with no notice. */
const MOTOR_GAP_SHORT = (run: FlightRun): string =>
  run.hasPropulsion
    ? "a motor in this configuration could not be matched, so its mass is missing from the build"
    : "needs a motor: without one the CG sits forward of where it flies";

/** Where the design fields are, named once. Every design reaches the Design workspace now — a
 *  design with no flight included — so advice can point at one place instead of guessing which
 *  layout the flyer is looking at. */
const EDIT_POINTER = "in the Design workspace";
/** The same place named as a noun rather than as a verb adjunct — "the Design workspace's fin
 *  fields describe…" rather than a bare "the fin fields". */
const FIN_FIELDS_NOUN = "The Design workspace's fin fields";

function RocketSummary({
  run,
  doc,
  rocket,
  units,
  geometry,
}: {
  run: FlightRun;
  doc: OrkDocument;
  /** The rocket the run describes — the EDITED one while a geometry what-if is set. Every other
   *  figure in this strip already comes from the run, so reading length off `doc.rocket` made one
   *  cell quietly describe a different rocket: doubling a 700 mm body left "950 mm" beside a centre
   *  of pressure of 1,422 mm, which is 472 mm past the length the same line claims. This strip sits
   *  above the tabs so a design edit's headline effect is legible from any workspace, and overall
   *  length is what a flyer checks against a rail, a shipping tube and a waiver form. */
  rocket: Rocket;
  units: UnitSystem;
  geometry?: GeometryEdits;
}) {
  const r = run.result;
  const length = overallLength(rocket);
  const dia = r.stability.refRadius * 2;
  // Same sentence the flight card uses, from the same module, so the strip and the card one screen
  // apart cannot come to disagree about the same flight.
  const extrapolatedWhy = transonicReason(r.extrapolatedTransonic, r.summary.maxMach);
  const [detailOpen, setDetailOpen] = useState(false);
  return (
    <Panel
      title={doc.rocket.name}
      aside={
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {formatLabel(doc)}
          {" · "}
          {/* The route to the method, from where the question arises. Every number on every
              workspace sits under this strip, and until now the only link to how they are computed
              was on the import screen — which is to say it disappeared at exactly the moment a
              flyer had a figure in front of them to doubt. It rides the row the format label
              already occupies, so it costs the shared chrome no height. */}
          <Link href="/docs/methods" className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300">
            how these are computed
          </Link>
        </span>
      }
    >
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
            aria-label={
              res.match
                ? `Matched ${res.match.entry.designation} (${res.match.quality})${res.count > 1 ? ` — cluster of ${res.count}` : ""}`
                : res.vetoedBore
                  ? `${res.vetoedBore.designation} is a ${res.vetoedBore.motorMm} mm motor and this mount is only ${res.vetoedBore.boreMm} mm across`
                  : res.vetoedFit
                    ? `No thrust curve of this mount's ${res.vetoedFit.statedMm} mm casing — the closest name, ${res.vetoedFit.designation}, is a ${res.vetoedFit.matchedMm} mm motor`
                    : "No thrust curve found"
            }
          >
            {res.count > 1 ? `${res.count}× ` : ""}
            {res.designation}
            {res.match && res.match.quality !== "exact" ? ` → ${res.match.entry.designation}` : ""}
            {/* The chip is the ONLY motor state visible from every workspace, so it carries the
                distinction too. "not found" on a motor that was found and turned down for its casing
                sends a flyer hunting for a thrust curve that is already in the set. */}
            {!res.match
              ? res.vetoedBore
                ? " · too big for the mount"
                : res.vetoedFit
                  ? " · wrong casing"
                  : " · not found"
              : res.match.quality !== "exact"
                ? " · approx"
                : ""}
          </span>
        ))}
      </div>

      {/* THE HEADLINE THREE, visible on every viewport, and the rest folded behind a control on a
          phone. This strip is the chrome every workspace route sits under, so its height is a term
          in all four routes' depth — it cost a 390 px phone 508 px of the 1,071 px above the
          workspace spine, i.e. 1.61 of the two screens `DESIGN.md` §8 allows before any workspace
          renders a pixel. Folding it took 157 px out of that on all four routes at once; it did NOT
          close the contract, and `e2e/depth.spec.ts` still carries `/sweep` as a breach at 2.12
          screens once the pointer is measured as coarse.

          Which three stay is not a layout preference: STATIC MARGIN is what a flyer reads for a
          go/no-go, LIFTOFF MASS is what they check against the motor's minimum and their waiver, and
          APOGEE is the number two e2e cases exist to prove updates live while editing on `/design`.
          The rest are reference figures a flyer looks up rather than watches.

          Two lists rather than one, with the control between them: a `<button>` is not a permitted
          child of `<dl>`, and putting it inside to keep a single list failed the accessibility gate.
          Two lists is the honest structure anyway — these ARE two groups, the figures a flyer
          watches and the ones they look up.

          Not a `Disclosure`: that primitive takes a static `open`, and a native `<details>` cannot
          be talked out of hiding its content by a media query, so a viewport-driven fold cannot be
          expressed with it. The control is a `Button`, so nothing here is a hand-rolled treatment,
          and it sits BEFORE the region it controls — expanding must not push the control that did
          it off the bottom of the screen, and a reader should meet the trigger before the content
          it reveals. */}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        {/* Apogee leads the strip so a design edit's headline flight effect is visible from any
            workspace — the editors live on Design, but this summary sits above the tabs. Only with
            propulsion: a design whose motor didn't resolve has no meaningful apogee. */}
        {/* Marked when the flight left the drag model's envelope, through `Field`'s own hint slot
            rather than the `Extrapolated` block used elsewhere. This strip is the shared chrome all
            four routes sit under, and a permanent reason line here is paid for on every one of them
            — it is what took `/sweep` back past the two screens §8 allows once before. The badge
            carries the reason to a pointer, a keyboard and a screen reader; the block treatment
            stands where the number is the surface's whole subject. Without this the same apogee read
            plain up here and "extrapolated" on the card below, one screen apart. */}
        {run.hasPropulsion && (
          <Readout
            variant="row"
            label="Apogee"
            q={d.altitude(r.summary.apogee, units)}
            extrapolated={extrapolatedWhy}
          />
        )}
        {/* **The motor is not "dead mass" when it fails to resolve — it is ABSENT.** `lib/sim/setup.ts`
            skips an unmatched instance entirely, so it contributes neither mass nor CG, and the two
            figures below are then measuring a rocket with nothing in the tube. Apogee has always been
            guarded; these two were not, and they are the pair a flyer reads for a go/no-go.

            Measured on `demo-single-deploy.ork` with its motor made unresolvable: liftoff mass
            0.8018 → 0.6002 kg (which is exactly the dry mass), static margin 4.065 → 5.921 cal —
            +46%, and MORE stable than the truth, which is the reassuring direction. The old strip
            published both under their loaded labels, and the notice directly above said the
            stability "remains valid".

            **Both are gated on `motorsComplete`, NOT on `hasPropulsion`, and the difference is a
            whole state.** `hasPropulsion` is `some(match)`: a cluster of four with one motor missing
            satisfies it. Gating here on that while the Design panel and the folded pair below gate
            on `motorsComplete` would put the published margin and the withheld CG it is computed
            from on the same card — one caveated, its neighbour stated with a `high` verdict on it.

            **The mass is withheld too, rather than relabelled, and the first draft got that wrong.**
            "Dry mass" is only right in the state where NOTHING resolved. On a partial cluster
            `liftoffMass` is the dry mass plus whichever motors happened to be found — a wrong number
            under a right label, which is worse than the single-motor case this was reasoned about.
            And `liftoffMass` is `massAt(0)`, which also carries the flyer's what-if nose ballast, so
            "Dry mass" disagreed with the two surfaces that publish the real dry figure
            (`MassBreakdown` and the parts panel) the moment any ballast was set. One withheld cell
            with a true reason beats a label that is right in one of three states. */}
        {run.motorsComplete ? (
          <Readout variant="row" label="Liftoff mass" q={d.mass(r.liftoffMass, units)} />
        ) : (
          <Readout variant="row" label="Liftoff mass" q={{ value: "—", unit: "" }} withheld={MOTOR_GAP_SHORT(run)} />
        )}
        {run.motorsComplete ? (
          <Readout
            variant="row"
            label="Static margin"
            q={d.calibers(r.staticMarginCal)}
            flag={
              r.staticMarginCal < 1
                ? {
                    text: "low",
                    why: "under 1 caliber: the centre of pressure is close enough to the centre of gravity that the rocket may not hold a straight course off the rail",
                  }
                : r.staticMarginCal > 3
                  ? {
                      text: "high",
                      why: "over 3 calibers: strongly over-stable, so the rocket weathercocks hard into wind and loses altitude and downrange predictability",
                    }
                  : undefined
            }
          />
        ) : (
          // Withheld rather than blank, with the reason ON the cell. It cannot lean on the notice
          // above — that renders only when NOTHING resolved, so on a partial cluster there would be
          // no sentence anywhere. `MOTOR_GAP_SHORT` says which of the two states this is.
          <Readout variant="row" label="Static margin" q={{ value: "—", unit: "" }} withheld={MOTOR_GAP_SHORT(run)} />
        )}

      </dl>

      {/* The control, then the region it controls. Outside the list because a `<button>` is not a
          permitted child of `<dl>` — axe flags it, and the a11y gate caught exactly that when this
          was first written with the control inside. Placing it BETWEEN the two lists is what keeps
          the trigger ahead of its content: expanding must not push the control that did it off the
          bottom of the screen, and a reader should meet the trigger before what it reveals.
          Named for what is actually behind it — a label that omits half its contents is how a flyer
          concludes a figure is missing rather than folded. */}
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 sm:hidden"
        aria-expanded={detailOpen}
        aria-controls="rocket-summary-detail"
        onClick={() => setDetailOpen((v) => !v)}
      >
        {detailOpen ? "Hide" : "Show"} mass, balance and fin figures
      </Button>

      <dl
        id="rocket-summary-detail"
        className={cx(
          "mt-2 grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid sm:grid-cols-4",
          detailOpen ? "grid" : "hidden",
        )}
      >
        {/* Both of these are the same defect as the margin above, one fold deeper — and the fold is
            not a guard: `sm:grid` opens it on every desktop width, and the print stylesheet restyles
            the live DOM, so an ungated cell here reaches the range card handed to an RSO.

            "Burnout mass" is withheld rather than relabelled because there is no burn to be after:
            with no motor placed the burnout time is 0, so it reads the dry mass under a label naming
            a state the flight never entered — and the cell two rows up already says "Dry mass". Two
            identical numbers under different labels is worse than one withheld. */}
        {run.motorsComplete ? (
          <Readout variant="row" label="Burnout mass" q={d.mass(r.burnoutMass, units)} />
        ) : (
          // "no motor burned" is only true when NONE resolved. On a partial cluster the flight has a
          // real burnout — the Flight panel publishes a burnout velocity from the same run — so that
          // reason would be a false claim beside a withheld number, which is worse than a blank.
          <Readout variant="row" label="Burnout mass" q={{ value: "—", unit: "" }} withheld={MOTOR_GAP_SHORT(run)} />
        )}
        <Readout variant="row" label="Length" q={d.lengthMm(length, units)} />
        <Readout variant="row" label="Max diameter" q={d.lengthMm(dia, units)} />
        {/* The loaded CG is what the withheld margin is computed FROM, so publishing it while
            withholding the margin would hand over the same claim one step earlier. CP is geometry
            and stays. */}
        {run.motorsComplete ? (
          <Readout variant="row" label="CG (loaded)" q={d.lengthMm(r.cgLoaded, units)} />
        ) : (
          <Readout variant="row" label="CG (loaded)" q={{ value: "—", unit: "" }} withheld={MOTOR_GAP_SHORT(run)} />
        )}
        <Readout variant="row" label="CP" q={d.lengthMm(r.stability.cp, units)} />
        {/* Split rather than carried across as one string: §5 says the unit is never baked into the
            value, and this was the one site in the strip that did. */}
        <Readout variant="row" label="CNα" q={{ value: d.fmt(r.stability.cnAlpha, 2), unit: "/rad" }} />
        {r.flutter && (
          <Readout
            variant="row"
            label="Fin flutter (est.)"
            q={d.speed(r.flutter.worst.flutterVelocity, units)}
            flag={
              r.flutter.worst.margin < RECOMMENDED_FLUTTER_MARGIN
                ? {
                    text: "thin",
                    why: `the estimated flutter speed is under ${RECOMMENDED_FLUTTER_MARGIN}× the fastest this fin set flies, the margin the method's own spread calls for`,
                  }
                : undefined
            }
            sub={`${d.flutterMargin(r.flutter.worst.margin)} margin`}
          />
        )}
      </dl>

      {/* Deliberately OUTSIDE the fold, on every viewport. Both render only when there is something
          wrong to say — a margin outside 1-3 cal, a thin flutter margin — and both are the only
          place the reasoning behind that flag is spelled out. A safety-relevant sentence a flyer has
          to go looking for is the "reachable only by knowing it is there" failure, and folding them
          would save nothing on the healthy designs the depth measurement is taken on anyway. */}
      <StabilityTrimHint run={run} rocket={rocket} units={units} />
      <FlutterFixHint run={run} doc={doc} units={units} geometry={geometry} />
    </Panel>
  );
}

/** When the fin-flutter margin is thin, say plainly how thick the fins would need to be to reach a
 *  healthy margin — the number behind the "thicken the fins" caution, so it's actionable rather than
 *  a vague direction. Completes the actionable-safety trio (stability trim, recovery sizing, this).
 *  Closed-form (lib/sim/flutter.ts) and conservative (errs slightly thick). */
function FlutterFixHint({
  run,
  doc,
  units,
  geometry,
}: {
  run: FlightRun;
  doc: OrkDocument;
  units: UnitSystem;
  /** The active what-ifs, for the fin SELECTION only: whether this hint's set is reachable depends
   *  on which set the fields are currently pointed at, so the claim and the fields have to resolve
   *  it the same way. */
  geometry?: GeometryEdits;
}) {
  const f = run.result.flutter;
  if (!f || !Number.isFinite(f.worst.margin) || f.worst.margin >= RECOMMENDED_FLUTTER_MARGIN) return null;
  if (!(f.worst.thickness > 0)) return null;
  const tFix = thicknessForFlutterMargin(f.worst.thickness, f.worst.margin, RECOMMENDED_FLUTTER_MARGIN);
  if (!(tFix > f.worst.thickness)) return null;
  // The fin what-ifs address one fin group, which need not be the worst-margin set. Across the
  // corpus this hint fires on 60 flights and 16 of them name a set the fields cannot reach — and
  // those are the worst margins in the set (0.08x, 0.21x, 0.29x). Telling a flyer to thicken fins
  // the panel will not touch is worse than saying nothing, on a warning that is safety-relevant.
  // Judged on the design plus the flyer's structure, not the import: a fin ring the flyer AUTHORED is
  // not in the imported file, so this said the fields "describe a different fin set on this design, so
  // they can't make this change — it has to go back to the design file" about a set the fields would in
  // fact have changed. On the one hint that is safety-relevant, and about the only fin set a
  // from-scratch design might have.
  const editable = primaryFinGroupIds(structureOf(doc.rocket, geometry ?? {}), geometry?.finSetId).has(f.worst.finId);

  return (
    <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
      <span className="font-medium text-zinc-600 dark:text-zinc-300">Fin-flutter fix:</span>{" "}
      thickening the {f.worst.finName} from {d.q(d.lengthMm(f.worst.thickness, units))} to about{" "}
      {d.q(d.lengthMm(tFix, units))} would lift the flutter margin to{" "}
      {d.flutterMargin(RECOMMENDED_FLUTTER_MARGIN)} (from {d.flutterMargin(f.worst.margin)}). Shortening
      the span or a stiffer material does the same.{" "}
      {editable ? (
        <>Set the fin thickness {EDIT_POINTER} to check the apogee cost.</>
      ) : (
        <>
          {/* The explicit space is load-bearing: JSX drops a plain space between an expression and
              the text that follows it across a line break, which shipped "fin fieldsdescribe". */}
          {FIN_FIELDS_NOUN}{" "}
          describe a different fin set on this design, so they can&apos;t make this change — it has to
          go back to the design file.
        </>
      )}
    </p>
  );
}

/** When the static margin is off a healthy value, say plainly how to trim it: how much nose ballast
 *  would lift a thin margin (or that ballast alone can't, when the fins are too small or too far
 *  forward), and — as the weight-free companion — how far to slide the fin group. Moving the fins is
 *  the *only* lever that can bring down an over-stable, weathercock-prone margin, which nose ballast
 *  cannot. Closed-form goal-seeks (lib/sim/trim.ts), the inverse of the ballast and fin-position
 *  sweeps: the sweeps plot the whole curve, these answer the one question a flyer actually asks. */
function StabilityTrimHint({
  run,
  rocket,
  units,
}: {
  run: FlightRun;
  /** The EDITED rocket, like the strip it sits under. Both goal-seeks are geometry reads — the nose
   *  station ballast would sit at, and the fin group's own position — and they were taken off the
   *  design FILE while the margin, mass and reference diameter they are solved against came from the
   *  edited run. On the 38 mm sample with fin span cut to 20 mm the hint said "move the fin set about
   *  193 mm aft" where the edited airframe needs 287 mm — 49% short, on a number a flyer acts on by
   *  moving parts. A doubled body length happens to come out identical, which is why the staleness
   *  survived the surrounding work: the edit that exposes it is not the one anybody tried. */
  rocket: Rocket;
  units: UnitSystem;
}) {
  const r = run.result;
  // **The most damaging of the unloaded-margin surfaces, because it is PRESCRIPTIVE.** Everything
  // else on that path published a wrong number; this one reads it, goal-seeks against it, and tells
  // the flyer to move a part — "at 5.92 cal this is over-stable … moving the fin set about N mm
  // forward would ease the margin" — computed from a CG and a mass with the motor missing. It
  // rendered directly beneath the strip that had just withheld the very margin it was quoting.
  //
  // It returns nothing rather than being caveated: a trim instruction is only worth having if the
  // margin it trims is the flown one, and the notice above already says why there is no margin.
  if (!run.motorsComplete) return null;
  const refD = r.stability.refRadius * 2;
  const trim = marginTrim(
    {
      cp: r.stability.cp,
      cgLoaded: r.cgLoaded,
      loadedMass: r.liftoffMass,
      refDiameter: refD,
      noseStation: noseBallastStation(rocket),
    },
    TRIM_TARGET_CAL,
  );
  // A degenerate airframe (no resolvable diameter) has no meaningful margin to trim — say nothing.
  if (!(r.stability.refRadius > 0) || !Number.isFinite(trim.currentMarginCal)) return null;

  const box = "mt-3 border-t border-zinc-200 pt-3 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400";
  const label = <span className="font-medium text-zinc-600 dark:text-zinc-300">Stability trim:</span>;

  // Thin margin: name the nose ballast, and the weight-free fin-aft move that reaches the same target.
  if (!trim.alreadyMet) {
    const fin = finStationTrim(rocket, trim.currentMarginCal, r.liftoffMass, refD, TRIM_TARGET_CAL);
    const finAft =
      fin && fin.feasible && fin.shiftM > 0 ? (
        <> Or move the fin set about {d.q(d.lengthMm(fin.shiftM, units))} aft — weight-free — for the same margin.</>
      ) : null;
    return (
      <p className={box}>
        {trim.feasible ? (
          <>
            {label} adding about {d.q(d.mass(trim.ballastKg, units))} of nose ballast would bring the
            static margin to {d.fmt(TRIM_TARGET_CAL, 1)} cal (from {d.fmt(trim.currentMarginCal, 2)} cal).
            Nose weight trades a little apogee for stability — set it {EDIT_POINTER} to see
            the cost.
          </>
        ) : (
          <>
            {label} nose ballast alone tops out near {d.fmt(trim.maxMarginCal, 2)} cal — short of{" "}
            {d.fmt(TRIM_TARGET_CAL, 1)} cal — so no amount of nose weight makes this design comfortably
            stable. Enlarge the fins to reach it.
          </>
        )}
        {finAft}
      </p>
    );
  }

  // Over-stable: the one case nose ballast can't fix — name the fin-forward move that eases it.
  if (trim.currentMarginCal > OVER_STABLE_CAL) {
    const fin = finStationTrim(rocket, trim.currentMarginCal, r.liftoffMass, refD, OVER_STABLE_TARGET_CAL);
    if (fin && fin.feasible && fin.shiftM < 0) {
      return (
        <p className={box}>
          {label} at {d.fmt(trim.currentMarginCal, 2)} cal this is over-stable and can weathercock
          strongly into wind. Moving the fin set about {d.q(d.lengthMm(-fin.shiftM, units))} forward
          would ease the margin to about {d.fmt(OVER_STABLE_TARGET_CAL, 1)} cal — a weight-free trim
          (nose ballast only adds stability, never sheds it). Set the fin position{" "}
          {EDIT_POINTER} to check.
        </p>
      );
    }
  }
  return null;
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
    <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
      <span className="font-medium text-zinc-600 dark:text-zinc-300">Recovery sizing:</span> to land
      at about {d.q(d.speed(SOFT_LANDING_TARGET, units))} instead, the main needs a drag area of
      roughly {d.fmt(sizing.cdA, 2)} m² Cd·A — about a {d.q(d.lengthMm(sizing.diameter, units))}{" "}
      canopy at Cd {d.fmt(sizing.cd, 1)}. A bigger canopy lands softer (and drifts farther).
    </p>
  );
}

/** A staged flight only flies the top stage to the ground; a separated lower stage that carries its
 *  own recovery still lands somewhere. Report each such booster's estimated terminal descent so the
 *  flyer plans for it. (An un-recovered booster is flagged ballistic by a warning instead.) */
function BoosterDescentNote({ run, units }: { run: FlightRun; units: UnitSystem }) {
  const boosters = run.result.boosterDescents;
  if (!boosters.length) return null;
  return (
    <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
      <span className="font-medium text-zinc-600 dark:text-zinc-300">Separated booster recovery:</span>{" "}
      {boosters.map((b, i) => (
        <span key={b.name}>
          {i > 0 ? "; " : ""}the {b.name} ({d.q(d.mass(b.mass, units))}) comes down at about{" "}
          {d.q(d.speed(b.terminalSpeed, units))} ({d.q(d.energy(b.landingEnergy, units))}) under its own canopy
        </span>
      ))}
      . Only the top stage is flown to the ground, so this is a terminal-velocity estimate for the
      booster&apos;s own landing — plan its recovery area separately.
    </p>
  );
}



/** A compact "what-if vs design" readout: after the flyer applies a design what-if (nose ballast
 *  or a motor swap), the results change but the original numbers are gone. This shows, for the key
 *  flight metrics, the design's own figure → the what-if figure and the signed change — so the
 *  effect of the change is legible at a glance instead of remembered. Both runs share identical
 *  launch conditions, so every delta is the design change alone. Directions are shown by sign, not
 *  colour: a lower apogee from added ballast isn't "bad", it's the trade the flyer is weighing. */
/** Exported for `lib/what-if-delta.test.tsx` and for nothing else — the surface census in
 *  `lib/margin-surfaces.test.ts` can tell that this file consults `motorsComplete`, but not that THIS
 *  card does, and a negative control proved that gap: deleting the gate below leaves the census green
 *  because the summary strip elsewhere in the file still mentions the predicate. A card that publishes
 *  two static margins and a signed change between them is worth a check that renders it. */
export function WhatIfDelta({ run, baseline, units }: { run: FlightRun; baseline: FlightRun; units: UnitSystem }) {
  const cur = run.result.summary;
  const base = baseline.result.summary;

  // Name the motor change when the swap flew a different motor than the design's own. Designation
  // comes from the resolutions, so it's correct regardless of any mass difference between motors.
  const curMotor = run.resolutions.find((x) => x.match)?.match?.entry.designation;
  const baseMotor = baseline.resolutions.find((x) => x.match)?.match?.entry.designation;
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
    // **The stability row needs BOTH flights' motors to have resolved, and it is the only row here
    //  that does.** The margin is measured from the loaded CG, so a configuration missing a motor is
    //  missing that motor's mass from the number — the summary strip directly above this card has
    //  withheld it under `!motorsComplete` since that was measured (4.065 → 5.921 cal, +46%). This
    //  card is gated on `hasPropulsion`, which is a weaker predicate: `some(match)`, satisfied by a
    //  cluster with one motor Loft has no curve for. So it published two margins and a signed delta
    //  under a cell reading "—".
    //
    //  **And the DELTA needs both ends even when the current flight is fine**, which is the half a
    //  single check on `run` would have missed: the baseline is the design as its file describes it,
    //  so a motor-swap what-if onto a bundled motor gives a complete `run` and an incomplete
    //  `baseline`, and the row would then report a stability change the flyer never made. Hence the
    //  conjunction rather than a test on either one.
    //
    //  Withheld, never dropped: an absent row on a card whose other three still print is a blank
    //  cell, which `DESIGN.md` §6 calls a bug. It says which flight is short a motor and what brings
    //  the row back.
    ...(run.motorsComplete && baseline.motorsComplete
      ? [
          {
            label: "Stability",
            base: d.calibers(baseline.result.staticMarginCal),
            cur: d.calibers(run.result.staticMarginCal),
            change: d.changeAbsolute(baseline.result.staticMarginCal, run.result.staticMarginCal, "cal"),
          },
        ]
      : [
          {
            label: "Stability",
            base: { value: "—", unit: "" },
            cur: { value: "—", unit: "" },
            change: { text: "withheld" },
          },
        ]),
    // Fin-flutter margin, when both flights estimate one (a finned design) — so a fin edit shows its
    // effect on the flutter headroom right alongside the stability trade. All three numbers share
    // one precision, and it has to be wide enough for the CHANGE as well as for the two ends: at one
    // decimal 1.44 → 1.46 reads "1.4 → 1.5" with a change of "0", which is the self-contradiction
    // this row exists to avoid. `fmtSmall` on the ends so a margin below even that precision states
    // a bound rather than a zero.
    ...(run.result.flutter && baseline.result.flutter
      ? (() => {
          const baseMargin = baseline.result.flutter.worst.margin;
          const curMargin = run.result.flutter.worst.margin;
          const dp = Math.max(
            d.decimalsFor(baseMargin, 1),
            d.decimalsFor(curMargin, 1),
            d.decimalsFor(curMargin - baseMargin, 1),
          );
          return [
            {
              label: "Flutter margin",
              base: { value: d.fmtSmall(baseMargin, dp), unit: "×" },
              cur: { value: d.fmtSmall(curMargin, dp), unit: "×" },
              change: d.changeAbsolute(baseMargin, curMargin, "×", dp),
            },
          ];
        })()
      : []),
  ];

  return (
    <Card role="group" aria-label="What-if vs design" tone="accent" className="mt-3">
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
            <dd className="font-mono text-sm tabular-nums text-indigo-600 dark:text-indigo-400">{row.change.text}</dd>
          </div>
        ))}
      </dl>
      {/* The withheld row's reason, and what brings it back — `DESIGN.md` §6. It sits under the grid
          rather than inside the cell because the cell is a mono figure column three columns wide, and
          a sentence in it wraps into the row beside it. Same gap the summary strip above names, in
          the same words. */}
      {!(run.motorsComplete && baseline.motorsComplete) && (
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
          <strong>Stability is withheld:</strong>{" "}
          {run.motorsComplete
            ? "the design's own flight is missing a motor, so there is nothing to compare this margin against"
            : MOTOR_GAP_SHORT(run)}
          . The margin is measured from the loaded centre of gravity, so it needs every motor&apos;s
          mass. Resolve the motor under Design and the row comes back.
        </p>
      )}
    </Card>
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
/** The thrust the VEHICLE delivers, over flight time — not one motor's published curve.
 *
 *  **It used to plot `resolutions.find(x => x.match)`, which is the first motor that resolved and
 *  nothing else.** On a design whose configuration resolves more than one motor instance — a staged
 *  stack, or a single-stage vehicle with an airstarted second mount — that is a fraction of the
 *  flight, drawn under a heading that says "Motor thrust" and names nothing. Measured across the
 *  corpus: 14 configurations on 5 designs are affected, and `Airstart timing.ork` is the case that
 *  admits no defence — single stage, one phase, both motors burning in the same flight, plotting
 *  **1,624.9 N·s of a 2,917.3 N·s vehicle**, 56%, presented as the whole.
 *
 *  The solver has always computed the right thing: `simulate.ts` sums `thrustAt(curve, t -
 *  ignitionTime)` over every motor and stores the result on each trajectory sample. So this is a
 *  READ of the flight rather than a reconstruction, which is what makes it correct for a cluster, a
 *  staged stack and an airstart alike without knowing which it is. Measured on `Airstart timing.ork`:
 *  integrating these samples gives 2,915.0 N·s against the configuration's declared 2,917.3 — 0.08%
 *  — and the trajectory carries 142 points across the burn where the single motor's own curve had 27,
 *  so the plot gained resolution rather than losing it.
 *
 *  Clipped to the burn, with one sample past it so the curve visibly returns to zero: the trajectory
 *  runs to landing, and a thrust plot with a 40-second zero tail is a plot of nothing. */
function thrustSeries(run: FlightRun): Series | null {
  const traj = run.result.trajectory;
  let last = -1;
  for (let i = 0; i < traj.length; i++) if (traj[i].thrust > 0) last = i;
  if (last < 0) return null;
  const points = traj.slice(0, Math.min(last + 2, traj.length)).map((p) => ({ x: p.t, y: p.thrust }));
  return { color: COLORS.thrust, label: "thrust", points };
}

/** The key numbers a flyer reads a thrust curve for, under the plot: the delivered total impulse and
 *  its class letter, the peak and average thrust, the burn time, and the loaded propellant mass. All
 *  are the *delivered* figures — scaled by the cluster count, to match the N× curve above — so the
 *  impulse and its class are what the vehicle actually flies (a cluster of three G's reads as an I).
 *  Reads the same primary resolved motor `thrustSeries` plots; renders nothing when none resolved. */
function MotorStatsCaption({ run, units }: { run: FlightRun; units: UnitSystem }) {
  // **Every motor the configuration flies, not the first one that resolved.** The impulse and its
  // class letter are what a flyer takes to a waiver and an RSO, and reading them off one instance of
  // several is a wrong number on the surface where being wrong costs most: `Airstart timing.ork`
  // read "1624.9 N·s (K)" for a vehicle that delivers 2917.3 N·s and certifies as an L.
  const matched = run.resolutions.filter((x) => x.match);
  if (!matched.length) return null;
  const each = matched.map((r) => ({ curve: r.match!.entry.curve, n: Math.max(1, r.count ?? 1) }));
  const totalImpulse = each.reduce((a, e) => a + e.curve.totalImpulse * e.n, 0);
  const propMass = each.reduce((a, e) => a + e.curve.propMass * e.n, 0); // kg
  // Peak and burn come from the FLIGHT, not from summing published figures: two motors that never
  // overlap do not stack their peaks, and one that airstarts late extends the burn past its own
  // duration. The trajectory already answers both, correctly, for every arrangement.
  const traj = run.result.trajectory;
  const peak = traj.reduce((a, p) => Math.max(a, p.thrust), 0);
  const burnEnd = traj.reduce((a, p) => (p.thrust > 0 ? p.t : a), 0);
  // Averaged over the interval thrust is actually delivered over — impulse ÷ burn — which is the
  // definition, and which stays right when a second motor lights halfway through.
  const avg = burnEnd > 0 ? totalImpulse / burnEnd : 0;
  // How the motors read as a set. One entry is its designation; several are listed in the order the
  // configuration holds them, so an airstarted pair reads "K550W + 3× I211W" rather than silently
  // becoming its first half.
  const motorText = each
    .map((e) => (e.n > 1 ? `${e.n}× ${e.curve.designation}` : e.curve.designation))
    .join(" + ");
  const propText =
    units === "imperial" ? `${(propMass * 35.274).toFixed(2)} oz` : `${Math.round(propMass * 1000)} g`;
  // Only meaningful for a single motor: two motors with different delays cannot share one figure,
  // and printing the first one's would be the same defect this whole caption just stopped making.
  const delays =
    each.length === 1 && each[0].curve.delaysRaw && each[0].curve.delaysRaw !== "0"
      ? each[0].curve.delaysRaw
      : null;
  const stat = (label: string, value: string) => (
    <span>
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>{" "}
      <span className="font-medium tabular-nums text-zinc-700 dark:text-zinc-200">{value}</span>
    </span>
  );
  return (
    <figcaption className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
      {stat(each.length > 1 ? "motors" : "motor", motorText)}
      {stat("total impulse", `${totalImpulse.toFixed(1)} N·s (${impulseClass(totalImpulse)})`)}
      {stat("peak", `${Math.round(peak)} N`)}
      {stat("avg", `${Math.round(avg)} N`)}
      {stat("burn", `${burnEnd.toFixed(1)} s`)}
      {stat("propellant", propText)}
      {delays && stat("delays", delays)}
    </figcaption>
  );
}

/** The phases of a staged flight: one row per interval between separations, naming which stages were
 *  attached, when the interval ran, what ended it and what left at that boundary.
 *
 *  Rows come from `run.phases` — the solver's own staging timeline — and NOT from `rocket.stages`.
 *  The two differ, and assuming otherwise prints a phase that never existed: a serial stack parts at
 *  ONE joint and takes everything below it, so `03.Three-stage.ork` has 3 stages but 2 phases and a
 *  single separation, while `Three stage low power rocket.ork` has 3 of each.
 *
 *  For the same reason `stageCount` is a COUNT of what is still attached, not an index of what left.
 *  The stages shed at phase p are `stages[stageCount_p … stageCount_{p-1} - 1]` — a slice, because two
 *  joints can part at one instant, and naming only `stages[stageCount]` would drop the rest.
 *
 *  No competitor presents this. OpenRocket, RockSim and RASAero all show one row per SIMULATION, and
 *  OpenRocket's flight events are plot markers and CSV comments — over a list that does not include
 *  separation at all. See `COMPETITION.md` row 25. */
function PhaseTable({ run, rocket, units }: { run: FlightRun; rocket: Rocket; units: UnitSystem }) {
  const phases = run.phases;
  const stages = rocket.stages ?? [];

  // A design may reuse a stage name — `Three stage low power rocket.ork` has two called "Booster
  // stage" — and then "Booster stage separates" twice tells a flyer nothing about which joint parted.
  // Only the ambiguous ones are numbered, so the common case stays clean.
  const nameCounts = new Map<string, number>();
  for (const s of stages) nameCounts.set(s.name || "", (nameCounts.get(s.name || "") ?? 0) + 1);
  const stageName = (i: number) => {
    const raw = stages[i]?.name;
    if (!raw) return `Stage ${i + 1}`;
    return (nameCounts.get(raw) ?? 0) > 1 ? `${raw} (stage ${i + 1})` : raw;
  };

  // Rows are bounded by the separations the flight ACTUALLY LOGGED, never by the schedule alone.
  // `phases` is what `buildRocketDynamics` planned from burn times; a flight can end before reaching a
  // planned separation, and then tabling it states an event that did not happen. Measured on
  // `ARC payload rocket.ork` with 1 kg of nose ballast: the vehicle lands at 9.64 s having never
  // separated, while the schedule still puts a separation at 10.43 s. Truncating to the realised
  // count is what keeps this table a record rather than a plan.
  const seps = run.result.events.filter((e) => e.type === "separation").slice().sort((a, b) => a.time - b.time);
  const realised = phases.slice(0, seps.length + 1);
  const landing = run.result.events.find((e) => e.type === "landing");
  const flightEnd = landing?.time ?? run.result.summary.flightTime;

  // Every stage burnout the flight logged, newest solver change: one per stage that actually burns,
  // where a flight used to report exactly ONE ever — the last motor's — so a booster's burnout, the
  // event that CAUSES the separation right after it, appeared nowhere.
  const burnouts = run.result.events.filter((e) => e.type === "burnout");

  const rows = realised.map((p, i) => {
    const next = realised[i + 1];
    const boundary = next ? seps[i] : landing;
    // The burnouts that happened inside THIS phase's window. Matched on the interval rather than on
    // `stageIndex`, because what a row is about IS the interval: the stage that sheds at the end of a
    // phase is the one that burned out during it, and where two stages leave together both of their
    // burnouts belong to that one row.
    //
    // The window is closed at its END and open at its start — `(from, to]`, with the first row also
    // taking its own start. A burnout and the separation it causes are the SAME INSTANT on the
    // default staging rule, so a window closed at both ends puts the booster's burnout in the row it
    // ends AND in the row it begins. Walked in the built export before this: the starter with a
    // booster printed row 2 as "1.3 s Booster · 2.6 s Sustainer" — a phase claiming a burnout that
    // happened before it started.
    const from = p.startTime;
    const to = next ? seps[i].time : flightEnd;
    const inPhase = burnouts.filter((b) => (i === 0 ? b.time >= from : b.time > from) && b.time <= to);
    const shed = next ? stages.slice(next.stageCount, p.stageCount).map((_, k) => stageName(next.stageCount + k)) : [];
    // The last phase runs to the END OF THE FLIGHT, not to apogee. Apogee is an event INSIDE a phase,
    // not a boundary between two — and on a payload/dual-section design that separates at an ejection
    // charge the separation happens AFTER apogee, so ending the last row at apogee printed a row whose
    // "to" was earlier than its "from": `ARC payload rocket.ork` read From 10.4 s To 8.1 s.
    return {
      attached: Array.from({ length: p.stageCount }, (_, k) => stageName(k)),
      from,
      to,
      ends: next ? `${shed.join(" + ")} ${shed.length > 1 ? "separate" : "separates"}` : landing ? "Landing" : "End of flight",
      altitude: boundary?.altitude,
      velocity: boundary?.velocity,
      burnouts: inPhase.map((b) => ({
        time: b.time,
        // Named here rather than in the solver, with the same rule the Stages-attached column uses,
        // so one stage cannot read two ways on one page.
        stage: b.stageIndex !== undefined ? stageName(b.stageIndex) : undefined,
      })),
    };
  });

  return (
    <Panel label="Flight phases" title="Flight phases">
      {/* `COMPETITION.md` row 25 calls this table a lead no competitor offers — and until it took the
          primitive, its numbers could not leave the page at all. Phases are in flight order and that
          IS the meaning of the table, so the Phase column is deliberately the only sortable one: it
          restores the order after a flyer has sorted by another.

          **This component used to `return null` above when `rows` was empty, and the comment here
          used to say that made `empty` unreachable.** Both are gone. The guard was the last thing
          standing between a flyer and a panel that vanishes: the primitive's `empty` copy was already
          written, already required, and provably never rendered — which is the exact shape of the
          `MassBreakdown` defect that made this rule a rule. Deleting the guard costs nothing on any
          reachable path (`staged` gates this whole component, and a staged flight has phases) and
          means the surface can no longer disappear from under its own heading. */}
      <DataTable
        className="mt-3"
        rows={rows}
        rowKey={(_, i) => String(i)}
        exportName={rocket.name || "design"}
        exportSuffix="flight-phases"
        caption="Each phase of the staged flight, in order"
        // Says only what is true of an empty row set. The copy this replaces — "a design that never
        // sheds a stage flies as one" — named a cause that cannot produce this state: a staged design
        // that never sheds still yields ONE phase, which is a one-row table with its own note below.
        // It was written while a `return null` above made it unrenderable, and reviewing the copy is
        // what a guard like that stops anyone from doing.
        empty="No phase boundaries came back from this flight. A staged flight that reaches a separation tables each phase here."
        columns={[
          {
            key: "phase",
            label: "Phase",
            rowHeader: true,
            sortValue: (r) => rows.indexOf(r),
            cell: (r) => <span className="font-sans text-zinc-700 dark:text-zinc-200">{rows.indexOf(r) + 1}</span>,
            csv: (r) => rows.indexOf(r) + 1,
          },
          {
            key: "attached",
            label: "Stages attached",
            cell: (r) => <span className="font-sans text-zinc-700 dark:text-zinc-200">{r.attached.join(" + ")}</span>,
            csv: (r) => r.attached.join(" + "),
          },
          // Seconds in both systems, but a bare `From` still leaves a spreadsheet guessing.
          { key: "from", label: "From", cell: (r) => d.q(d.seconds(r.from)), csvLabel: "From (s)", csv: (r) => r.from },
          { key: "to", label: "To", cell: (r) => d.q(d.seconds(r.to)), csvLabel: "To (s)", csv: (r) => r.to },
          {
            key: "burnout",
            label: "Burnout",
            // A blank cell is a bug (DESIGN.md §6). A phase with no burnout in it is the ordinary
            // state for a stage that never lit, and it says so.
            cell: (r) =>
              r.burnouts.length === 0 ? (
                <span className="font-sans text-zinc-500 dark:text-zinc-400">no motor burned</span>
              ) : (
                r.burnouts.map((b, k) => (
                  <span key={k} className="mr-2 whitespace-nowrap">
                    {d.q(d.seconds(b.time))}
                    {b.stage && r.burnouts.length > 1 && (
                      <span className="ml-1 font-sans text-xs text-zinc-500 dark:text-zinc-400">
                        {/* A leading space inside the span, not just a margin: the margin is invisible
                            to a screen reader and to anything copying the cell out, and the two ran
                            together as "1.3 sBooster" in the text layer. */}
                        {` ${b.stage}`}
                      </span>
                    )}
                  </span>
                ))
              ),
            csv: (r) =>
              r.burnouts.length === 0
                ? "no motor burned"
                : r.burnouts.map((b) => (b.stage ? `${b.time.toFixed(2)} ${b.stage}` : b.time.toFixed(2))).join("; "),
          },
          {
            key: "ends",
            label: "Ends with",
            cell: (r) => <span className="font-sans text-zinc-700 dark:text-zinc-200">{r.ends}</span>,
            csv: (r) => r.ends,
          },
          {
            key: "altitude",
            label: "Altitude",
            cell: (r) =>
              r.altitude !== undefined ? (
                d.q(d.altitude(r.altitude, units))
              ) : (
                <span className="font-sans text-zinc-500 dark:text-zinc-400">not logged</span>
              ),
            // The unit travels in the header and the number comes from the SAME quantity the cell
            // renders — it used to export the raw SI double under a bare `Altitude`, so a copied
            // table read 62.34362601207104 where the cell said 205 ft.
            csvLabel: `Altitude (${d.altitude(0, units).unit})`,
            csv: (r) => (r.altitude !== undefined ? csvQuantity(d.altitude(r.altitude, units)) : "not logged"),
          },
          {
            key: "velocity",
            label: "Speed",
            cell: (r) =>
              r.velocity !== undefined ? (
                d.q(d.speed(r.velocity, units))
              ) : (
                <span className="font-sans text-zinc-500 dark:text-zinc-400">not logged</span>
              ),
            csvLabel: `Speed (${d.speed(0, units).unit})`,
            csv: (r) => (r.velocity !== undefined ? csvQuantity(d.speed(r.velocity, units)) : "not logged"),
          },
        ]}
      />
      {/* Both notes explain the TABLE's columns, so neither may render when the table has been
          replaced by its empty state — a legend for columns that are not on screen is the same
          reads-as-broken surface this file's empty states exist to remove. Guarded here rather than
          by the `return null` that used to sit above the whole component, which took the panel with
          it. */}
      {rows.length === 0 ? null : rows.length === 1 ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          This design has more than one stage but nothing separated: the stack flew whole. A stage is
          shed when <em>its own</em> motor finishes burning, so either no lower stage ever lit — see any
          warning above — or the flight ended before the separation was due, which is what happens when
          a design is too heavy to reach it.
        </p>
      ) : (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Altitude and speed are read at the boundary that ends each phase, from the same events the
          flight-path chart marks. The last phase runs to the end of the flight — apogee happens inside
          a phase, not between two — and only the top stage is flown to the ground, so a shed
          stage&apos;s own descent is not simulated.
        </p>
      )}
    </Panel>
  );
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
