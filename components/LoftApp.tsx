"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ImportPanel from "./ImportPanel";
import ResultsView, { type Workspace } from "./ResultsView";
import { Segmented } from "./ui";
import { importDesign, sourceTool, type OrkDocument } from "@/lib/ork/import";
import { newDesign } from "@/lib/model/starter";
import { exportOrk } from "@/lib/ork/export";
import { flattenRocket } from "@/lib/model/geometry";
import { runFlight, pickConfig, overridesFromStored, configChoices, type FlightRun, type ConfigChoice } from "@/lib/sim/run";
import { storedTag } from "@/lib/validation/stored-status";
import {
  primaryFinSpan,
  unreachableFinSetCount,
  primaryFinSetPart,
  primaryBodyTubePart,
  unreachableBodyTubeCount,
  primaryParachutePart,
  unreachableParachuteCount,
  aimEditsAt,
  structureOf,
  primaryTransition,
  primaryTransitionPart,
  unreachableTransitionCount,
  primaryMassObject,
  primaryMassObjectPart,
  primaryMassObjectStation,
  unreachableMassObjectCount,
  transitionDefaults,
  authoredTransitionName,
  removalRefusal,
  newPartId,
  type AddedPart,
  type GeometryEdits,
  aimsClearedByRemoving,
  aimsClearedByAiming,
  isEditedValue,
  type AimedPart,
  primaryFinCount,
  primaryFinStation,
  primaryMotorClusterCount,
  primaryFinRootChord,
  primaryFinTipChord,
  primaryFinSweep,
  primaryFinThickness,
  primaryFinCrossSection,
  primaryFinMaterial,
  primaryNose,
  primaryNoseShape,
  primaryBodyTube,
  primaryBodyDiameter,
  aftmostBodyDiameter,
  primaryFinish,
  primaryAirframeMaterial,
  SURFACE_FINISHES,
  NOSE_SHAPES,
  FIN_CROSS_SECTIONS,
  FIN_MATERIALS,
  AIRFRAME_MATERIALS,
  applyGeometryEdits,
  hasGeometryEdits,
  primaryParachute,
  defaultPayloadStation,
} from "@/lib/model/edit";
import {
  commit as commitHistory,
  undo as undoHistory,
  redo as redoHistory,
  endRun,
  undoLabel,
  redoLabel,
  describeEdit,
  EMPTY_HISTORY,
  type History,
} from "@/lib/model/history";
import type { SurfaceFinish, NoseShape, FinCrossSection } from "@/lib/model/types";
import { designMotorIdentity, swapOptions, swapStillOffered, type SwapOption } from "@/lib/motors/swap";
import { defaultConditions, type ConditionOverrides } from "@/lib/sim/setup";
import { fetchConditions, geocode, type WeatherConditions } from "@/lib/weather";
import {
  clearDiscardedSession,
  clearSession,
  forgetRecent,
  fromBase64,
  loadDiscardedSession,
  loadRecents,
  loadSession,
  rememberRecent,
  carriesWork,
  saveDiscardedSession,
  saveSession,
  type SavedSession,
  toBase64,
  type RecentDesign,
} from "@/lib/session";
import { mToFt, ftToM, mpsToMph, mphToMps, radToDeg } from "@/lib/units";
import { TOUCH_TARGET, TOUCH_TARGET_SQUARE } from "@/lib/ui-tokens";
import { listWords, rangeWords, refusedMessage } from "@/lib/what-if";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";

/** Friendly labels for the surface-finish picker (smoothest → roughest). */
/** The design header's small secondary buttons — Download, Undo, Redo, Reset. One constant because
 *  four hand-copied class strings is how a row of buttons ends up with three different heights. */
const HEADER_BUTTON =
  "inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium " +
  "text-zinc-700 transition hover:border-indigo-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 " +
  `dark:text-zinc-300 dark:hover:text-zinc-100 ${TOUCH_TARGET}`;
/** Undo/redo: the same button, plus a disabled state and a square 44 px minimum. It carries only a
 *  glyph on a phone (see the header), and a one-glyph control clears the height minimum while landing
 *  at 32 px wide — which is not a target a gloved thumb can hit. */
const UNDO_BUTTON =
  `${HEADER_BUTTON} justify-center ${TOUCH_TARGET_SQUARE} ` +
  "aria-disabled:opacity-40 aria-disabled:hover:border-zinc-300 dark:aria-disabled:hover:border-zinc-700";

const FINISH_LABELS: Record<SurfaceFinish, string> = {
  mirror: "Mirror",
  polished: "Polished",
  "smooth-paint": "Smooth paint",
  "regular-paint": "Regular paint",
  unfinished: "Unfinished",
  rough: "Rough",
};

/** Friendly labels for the nose-shape picker. */
const NOSE_SHAPE_LABELS: Record<NoseShape, string> = {
  ogive: "Ogive",
  conical: "Conical",
  ellipsoid: "Ellipsoid",
  parabolic: "Parabolic",
  power: "Power series",
  haack: "Haack (Von Kármán)",
};

/** Friendly labels for the fin edge-profile picker (draggiest → cleanest). */
const FIN_CROSS_SECTION_LABELS: Record<FinCrossSection, string> = {
  square: "Square",
  rounded: "Rounded",
  airfoil: "Airfoil",
};

/** What an undo control calls each authoring gesture. A table rather than a chain of ternaries, so a
 *  fourth kind is one row and cannot be added to the switch and forgotten here — an unlabelled add
 *  reads as "Undo adding a part", which is exactly the label a flyer cannot act on. */
const ADD_LABEL: Readonly<Record<AddedPart["kind"], string>> = {
  bodytube: "adding a body tube",
  trapezoidfinset: "adding a fin set",
  transition: "adding a transition",
  masscomponent: "adding a mass object",
};

interface Edits {
  /** Which fin set the fin fields describe and edit. A selection, not an edit — see hasActiveEdits. */
  finSetId?: string;
  /** Which body tube the body fields describe and edit. A selection, not an edit — as above. */
  bodyTubeId?: string;
  /** Which transition the transition fields describe and edit. A selection, not an edit — as above. */
  transitionId?: string;
  /** Which mass object the mass fields describe and edit. A selection, not an edit — as above. */
  massObjectId?: string;
  /** Which canopy the recovery fields describe and edit. A selection, not an edit — as above. */
  parachuteId?: string;
  /** Components removed from the design, oldest first. An ordered list, so undo is dropping the last. */
  removedIds?: string[];
  /** Parts the flyer authored, oldest first — see `AddedPart` in the edit model. */
  added?: AddedPart[];
  rodLength?: number; // m
  rodAngleDeg?: number;
  windSpeed?: number; // m/s
  launchAltitude?: number; // m
  ballastKg?: number; // "what-if" nose ballast
  recoveryCdScale?: number; // "what-if" scale on deployed recovery drag area
  motorSwap?: { manufacturer?: string; designation: string; diameter?: number }; // "what-if" motor
  finSpan?: number; // builder edit: fin semi-span (m)
  finCount?: number; // builder edit: fins per set
  finRootChord?: number; // builder edit: fin root chord (m, trapezoidal)
  finTipChord?: number; // builder edit: fin tip chord (m, trapezoidal)
  finSweepLength?: number; // builder edit: fin LE sweep (m, trapezoidal)
  finStation?: number; // builder edit: fin group fore-edge station from nose tip (m) — stability lever
  finThickness?: number; // builder edit: fin thickness (m, any fin kind)
  finCrossSection?: FinCrossSection; // builder edit: fin edge cross-section (any fin kind)
  finMaterial?: string; // builder edit: fin material key (FIN_MATERIALS) — density + flutter stiffness
  noseLength?: number; // builder edit: nose-cone length (m)
  noseShape?: NoseShape; // builder edit: nose-cone contour
  bodyLength?: number; // builder edit: the picked body tube's length (m)
  bodyDiameter?: number; // builder edit: the picked tube's outer diameter (m); scales the airframe to it
  transitionLength?: number; // builder edit: the picked transition's length (m)
  transitionAftDiameter?: number; // builder edit: the picked transition's exit diameter (m)
  massObjectMass?: number; // builder edit: the picked mass object's weight (kg)
  massObjectStation?: number; // builder edit: where it sits (m from the nose tip)
  finish?: SurfaceFinish; // builder edit: whole-airframe surface finish
  airframeMaterial?: string; // builder edit: airframe-shell material key (AIRFRAME_MATERIALS)
  boattailLength?: number; // builder edit: add a conical boattail of this length (m) at the aft
  boattailAftDiameter?: number; // builder edit: the added boattail's exit diameter (m)
  mainDeployAltitude?: number; // builder edit: dual-deploy — main deploys at this altitude AGL (m)
  drogueDiameter?: number; // builder edit: dual-deploy — drogue diameter (m) added at apogee
  mainParachuteDiameter?: number; // builder edit: resize the main (largest) parachute (m)
  motorClusterCount?: number; // builder edit: how many motors the mount holds (cluster)
  payloadMassKg?: number; // builder edit: add a payload/av-bay point mass (kg)
  payloadStation?: number; // builder edit: where the added payload sits (m from nose; blank = mid-body)
}

/** Which keys of `Edits` describe the FLIGHT rather than the airframe. Everything else is geometry.
 *
 *  Named as the short list rather than the long one on purpose. Three places need the geometry half of
 *  the edit bag — the flight, the panels, and the `.ork` export — and all three spelled it out field by
 *  field, thirty lines each. Adding `added` to two of the three is what that costs: the mass panel grew
 *  a 310 mm section and put 142 g on the design while the Flight card went on reporting the apogee of a
 *  rocket without it, which is precisely the "two surfaces disagreeing about what is being flown"
 *  defect the rest of this file exists to prevent. The airframe list grows with the editor; this one
 *  does not, so deriving from it means the next field is covered by having been added. */
const FLIGHT_ONLY_EDITS: ReadonlySet<string> = new Set([
  "rodLength",
  "rodAngleDeg",
  "windSpeed",
  "launchAltitude",
  "ballastKg",
  "recoveryCdScale",
  "motorSwap",
]);

/** The geometry half of the edit bag — everything the airframe is built from, and nothing transient. */
function geometryOf(e: Edits): GeometryEdits {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) if (!FLIGHT_ONLY_EDITS.has(k)) out[k] = v;
  return out as GeometryEdits;
}

/** Everything one undo has to put back — the whole of "what is being flown", not just the edit bag.
 *
 *  Three of the controls move more than the edits in a single act: switching to today's weather drops
 *  the two condition edits it overrides, "Reset to as-designed" clears the weather and the scenario
 *  with the edits, and picking another motor configuration drops a swap the new casing cannot take. An
 *  undo that restored the edits and left the rest would hand the flyer a rocket that never existed —
 *  the exact class of defect the rest of this file exists to prevent — so the snapshot is the set. */
interface WhatIf {
  edits: Edits;
  weather: WeatherConditions | null;
  scenario: "design" | "today";
  simIndex: number;
}

/** Did this actually change what is being flown? A drag handle maps a pointer POSITION rather than a
 *  delta, so one already at the end of its range goes on applying its field every frame, and an arrow
 *  key pressed against a limit applies it too. Recording those would leave undo steps that undo
 *  nothing the flyer can see — a control that says it will take back the fin position and then does
 *  not is worse than one that is greyed out. Shallow by design: a fresh object in a field (a motor
 *  swap) counts as a change, which errs toward offering an undo rather than swallowing one. */
function movedWhatIf(a: WhatIf, b: WhatIf): boolean {
  if (a.weather !== b.weather || a.scenario !== b.scenario || a.simIndex !== b.simIndex) return true;
  const x = a.edits as Record<string, unknown>;
  const y = b.edits as Record<string, unknown>;
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (x[k] !== y[k]) return true;
  return false;
}

/** Is any what-if actually set? `applyEdit` merges patches, so clearing a field leaves its key
 *  behind holding `undefined` — a design edited and then un-edited still has a non-empty `Edits`
 *  object. "Edited" therefore means any *defined* value, never a non-empty object.
 *
 *  This is the single definition, because two of them disagreeing is what the flyer feels: the gate
 *  that hides the stored-tool comparison and the button that restores it have to answer the same
 *  question, or clearing a field leaves the comparison hidden with the way back hidden too. */
function hasActiveEdits(e: Edits): boolean {
  return Object.entries(e).some(([k, v]) => isEditedValue(k, v));
}

/** The launch conditions a run is actually flown under: the design file's stored setup, then the
 *  flyer's own edits on top, then today's weather if that scenario is on.
 *
 *  A FUNCTION at module level because more than one surface has to fly the same conditions, and the
 *  Monte-Carlo dispersion is the one that showed why. It built its own nominal straight from
 *  `overridesFromStored`, so it flew the FILE's launch setup while the Flight card beside it flew
 *  the flyer's — and the two numbers a flyer plans a field around are the ones that moved. Measured
 *  on the 54 mm dual-deploy sample with surface wind set to 20 mph: the Flight card's drift went
 *  630 m to 1,877 m while the dispersion's recovery radius (95%) stayed at 1,203 m against a true
 *  2,519 m, and its median drift at 593 m against 1,811 m. A 1,500 m field takes the chance of
 *  busting a 3,000 m ceiling from 36% to 83%. Two spellings of "what is being flown" is exactly the
 *  drift this file's other shared helpers exist to prevent. */
function flownOverrides(
  document: OrkDocument,
  e: Edits,
  wx: WeatherConditions | null,
  scen: "design" | "today",
  idx: number,
): ConditionOverrides {
  const stored = document.simulations[idx] ?? document.simulations[0];
  const overrides: ConditionOverrides = stored ? { ...overridesFromStored(stored) } : {};
  if (e.rodLength !== undefined) overrides.rodLength = e.rodLength;
  if (e.rodAngleDeg !== undefined) overrides.rodAngleDeg = e.rodAngleDeg;
  if (e.windSpeed !== undefined) overrides.windSpeed = e.windSpeed;
  if (e.launchAltitude !== undefined) overrides.launchAltitude = e.launchAltitude;
  if (scen === "today" && wx) {
    overrides.atmosphere = wx.atmosphere;
    overrides.windProfile = wx.windProfile;
    overrides.launchAltitude = wx.elevationMsl;
    overrides.windSpeed = wx.surfaceWindMps;
  }
  return overrides;
}


/** The swap picker's contents for one stored configuration: which casing to offer motors at, and
 *  who made the design's own. A FUNCTION rather than an inline memo because two callers need the
 *  same answer — the picker that renders the options, and the configuration change that has to
 *  decide whether a swap already chosen still belongs to the run being selected. Two spellings of
 *  that question would drift, and the drift is invisible: one of them decides what is FLOWN. */
function swapInfoFor(doc: OrkDocument, simIndex: number): SwapInfo | null {
  const sim = doc.simulations[simIndex] ?? doc.simulations[0];
  // The config Loft actually flies — the stored sim's when it names one, otherwise the design's
  // default (pickConfig, the same resolution the simulator uses). So a design imported without any
  // stored simulation — a hand-authored or exported file — still offers same-casing swaps.
  const config = pickConfig(doc.rocket, sim?.conditions.configId);
  const motor = config?.instances[0]?.motor;
  if (!motor?.designation) return null;
  // Which casing to offer swaps at, and who made the design's motor. RockSim and RASAero state no
  // casing at all, which used to leave this 0 and withhold both surfaces from every design they
  // write; see `designMotorIdentity` for what stands in and what deliberately does not.
  const { casingMm: diaMm, manufacturer: designManufacturer } = designMotorIdentity(motor);
  if (!(diaMm > 0)) return null;
  return { designMotor: motor.designation, designManufacturer, options: swapOptions(diaMm) };
}

/** Same-diameter bundled motors the design could fly, with the design's own motor as the default.
 *  Built once per design/config so the picker offers a fitting alternative without editing the file. */
interface SwapInfo {
  designMotor: string;
  /** The design motor's manufacturer as the catalog spells it, set only when the motor matched
   *  exactly — what tells an Estes C6 from a Quest C6 when the sweep marks the design's own row. */
  designManufacturer?: string;
  options: SwapOption[];
}

export default function LoftApp() {
  const [units, setUnits] = useState<UnitSystem>("metric");
  const [doc, setDoc] = useState<OrkDocument | null>(null);
  const [fileName, setFileName] = useState<string>("");
  /** The session the last "Import another" / "Start fresh" threw away, offered back on the import
   *  screen. Read on mount rather than during render: localStorage is client-only and the first
   *  render has to match the server's. */
  const [discarded, setDiscarded] = useState<SavedSession | null>(null);
  const [run, setRun] = useState<FlightRun | null>(null);
  const [baseline, setBaseline] = useState<FlightRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState<Edits>({});
  /** Where the flyer has been, so they can go back. Reset by loading a design and by nothing else —
   *  an undo stack that survived a load would offer to restore one design's edits onto another. */
  const [history, setHistory] = useState<History<WhatIf>>(EMPTY_HISTORY as History<WhatIf>);
  const [weather, setWeather] = useState<WeatherConditions | null>(null);
  /** Bumped once per forecast fetched, and by nothing else. The analysis panels watch the launch
   *  conditions by VALUE, and a forecast's atmosphere and wind profile are FUNCTIONS — there is no
   *  value to compare, so a presence flag cannot tell a new forecast from the last one. Re-fetching
   *  at the same site, or fetching another site at the same elevation, left every key byte-identical
   *  while the air the flight was flown through was replaced. Air density is the dominant term in a
   *  ballistic apogee, so the sweeps would have kept the old rows and captioned them as the flyer's. */
  const [weatherSerial, setWeatherSerial] = useState(0);
  const [scenario, setScenario] = useState<"design" | "today">("design");
  const [simIndex, setSimIndex] = useState(0);
  // Which results workspace a freshly loaded design opens on: an import wants its Flight result up
  // front, a from-scratch build wants the editable Design surface, and a resumed session wants the
  // one it was left on. Set per load, read once as the results view mounts (it remounts on every
  // load — the import panel only shows when nothing is loaded, so every design arrives through a
  // fresh mount) and then kept in step as the flyer moves between workspaces, so "where I left off"
  // includes which workspace that was.
  const [initialTab, setInitialTab] = useState<Workspace>("flight");
  /** The loaded design's own bytes, kept so the session can be written back verbatim — the file
   *  the flyer imported, not a re-serialisation of it, so its stored results survive a reload. */
  const designBytes = useRef<string | null>(null);
  /** True when this design came back from the last session rather than being freshly opened. */
  const [restored, setRestored] = useState(false);
  /** Bumped once per design load, and by nothing else. The heavy analysis panels key their cached
   *  answer on "which design is this", and that question has to be answered by the act of loading
   *  rather than by any field the flyer can edit — the name used to stand in for it, so renaming a
   *  design re-flew the analysis panels a keystroke at a time. */
  const [loadSerial, setLoadSerial] = useState(0);
  /** Designs opened before, kept on the device so a flyer working across a build can pick any of
   *  them back up without the file. Read on mount (localStorage is client-only, so the first render
   *  must match the server's empty one) and kept in step as designs are opened and dropped. */
  const [recents, setRecents] = useState<RecentDesign[]>([]);

  const compute = useCallback(
    (
      document: OrkDocument,
      e: Edits,
      wx: WeatherConditions | null,
      scen: "design" | "today",
      idx: number,
    ): { run: FlightRun; baseline: FlightRun | null } => {
      const stored = document.simulations[idx] ?? document.simulations[0];
      const overrides = flownOverrides(document, e, wx, scen, idx);
      const edited = hasActiveEdits(e) || scen === "today";
      const configId = stored?.conditions.configId;
      const run = runFlight(document.rocket, {
        configId,
        overrides,
        ballastKg: e.ballastKg,
        recoveryCdScale: e.recoveryCdScale,
        motorSwap: e.motorSwap,
        geometry: geometryOf(e),
        // Validate only when flying the design's own stored conditions unchanged, and only when
        // Loft flew the complete design — a simplified vehicle (staging/pods/parallel/cluster)
        // wouldn't match the stored results, so the comparison would be misleading. Any edit —
        // including "what-if" ballast — makes the flight hypothetical, so the stored comparison
        // is withheld.
        validateAgainst: edited || document.flownAsReduced ? undefined : stored,
      });
      // A *design* what-if (nose ballast, a motor swap, or a geometry edit like fin span) changes
      // the rocket itself. Fly the same design WITHOUT that change under the very same conditions,
      // so the results can show what the change bought — apogee, speed, and stability deltas —
      // instead of numbers in isolation. Condition edits alone (rod, wind, weather) don't alter the
      // design, so they get no baseline.
      // Derived, not listed. This is the fourth place that has to answer "is this design edited?"
      // and the only one that was still spelling the fields out one by one — so the two transition
      // fields landed without it and a flyer who reshaped a tail cone got no delta card at all, which
      // is precisely the number that change exists to show. `hasGeometryEdits` is the one predicate
      // (it also knows which fields only count in pairs); ballast and a motor swap are the two design
      // what-ifs that are not geometry.
      const hasWhatIf =
        e.ballastKg !== undefined || e.motorSwap !== undefined || hasGeometryEdits(geometryOf(e));
      const baseline = hasWhatIf ? runFlight(document.rocket, { configId, overrides }) : null;
      return { run, baseline };
    },
    [],
  );

  const loadDoc = useCallback(
    (
      document: OrkDocument,
      name: string,
      opensOn: Workspace = "flight",
      /** The design's own file bytes, so the session can store exactly what was opened. */
      bytes?: Uint8Array,
      /** A session being restored: its saved edits and configuration, instead of a clean slate. */
      resume?: { edits: Edits; simIndex: number; rocket?: string },
    ) => {
      const e = resume?.edits ?? {};
      const idx = resume?.simIndex ?? 0;
      // A rename lives outside the file bytes — it is the one edit the session cannot recover by
      // re-importing — so a resumed session puts it back. Without this a reload silently returned
      // the design under the name in the file, and the "pick it back up" card named a design it
      // then did not return: it advertises `saved.rocket` while the restore read only the bytes.
      const restored =
        resume?.rocket && resume.rocket !== document.rocket.name
          ? { ...document, rocket: { ...document.rocket, name: resume.rocket } }
          : document;
      setLoadSerial((n) => n + 1);
      setDoc(restored);
      setFileName(name);
      setEdits(e);
      // A load is where the history starts, not a step in it. Carrying a stack across a load would
      // offer to restore one design's edits onto another — and the session that resumes here arrives
      // with its edits already applied, so its own past is not ours to replay.
      setHistory(EMPTY_HISTORY as History<WhatIf>);
      setWeather(null);
      setScenario("design");
      setSimIndex(idx);
      setInitialTab(opensOn);
      // Point the address at the workspace this load means to open on, before the results view
      // mounts and reads it. Loading a design is a deliberate act with an intended landing place —
      // an import leads with its flight — so it wins over whatever fragment the last design left
      // behind; within a design, the fragment then follows the flyer.
      if (typeof window !== "undefined") window.history.replaceState(null, "", `#${opensOn}`);
      setError(null);
      setRestored(resume !== undefined);
      if (bytes) designBytes.current = toBase64(bytes);
      // Every design that gets opened joins the shelf, so history builds itself rather than asking
      // the flyer to curate it. A resumed session is already the newest entry; re-recording it
      // would only rewrite its timestamp.
      if (bytes && !resume) {
        setRecents(
          rememberRecent(
            { design: designBytes.current!, name, rocket: document.rocket.name || name },
            Date.now(),
          ),
        );
      }
      try {
        const { run: r, baseline: b } = compute(restored, e, null, "design", idx);
        setRun(r);
        setBaseline(b);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not simulate this design.");
        setRun(null);
        setBaseline(null);
      }
    },
    [compute],
  );

  const onFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const document = await importDesign(bytes);
        loadDoc(document, file.name, "flight", bytes);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not read that file.");
        setDoc(null);
        setRun(null);
      } finally {
        setBusy(false);
      }
    },
    [loadDoc],
  );

  const onSample = useCallback(
    async (path: string, label: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(path);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const document = await importDesign(bytes);
        loadDoc(document, label, "flight", bytes);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load the sample.");
      } finally {
        setBusy(false);
      }
    },
    [loadDoc],
  );

  // Reopen a design from the shelf. Its bytes go back through the ordinary importer, exactly as a
  // restored session does, so a reopened design is byte-for-byte the one that was saved — stored
  // results and all. Its what-if edits are not kept: the shelf remembers designs, not experiments.
  /** Pick the discarded session back up — the undo for "Import another" / "Start fresh". It runs the
   *  same path a resumed session does, so what comes back is byte-for-byte the design that was open,
   *  with its edits, its motor configuration, its units and the workspace it was left on.
   *
   *  What it does NOT restore is today's-weather, because the session has never carried that: a
   *  reload loses it too. Restoring only what a reload restores keeps one rule instead of two. */
  const onRestoreDiscarded = useCallback(async () => {
    const saved = loadDiscardedSession();
    if (!saved) {
      // Another tab picked it up first, or storage was cleared underneath us. The offer was rendered
      // from state read at mount, so it can outlive what it points at — say so rather than having the
      // button quietly do nothing, which is what the sibling failure path below already does.
      setDiscarded(null);
      setError("That design was already picked back up somewhere else, so there is nothing to restore.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const bytes = fromBase64(saved.design);
      const document = await importDesign(bytes);
      setUnits(saved.units);
      loadDoc(document, saved.name, saved.opensOn, bytes, {
        edits: saved.edits as Edits,
        simIndex: saved.simIndex,
        rocket: saved.rocket,
      });
      clearDiscardedSession();
      setDiscarded(null);
    } catch {
      // The bytes no longer import (a format change, a truncated write). Drop the offer rather than
      // leaving a button that fails every time it is pressed.
      clearDiscardedSession();
      setDiscarded(null);
      setError("What you were working on could no longer be read, so it has been cleared.");
    } finally {
      setBusy(false);
    }
  }, [loadDoc]);

  const onOpenRecent = useCallback(
    async (id: string) => {
      const entry = loadRecents().find((r) => r.id === id);
      if (!entry) return;
      setBusy(true);
      setError(null);
      try {
        const bytes = fromBase64(entry.design);
        const document = await importDesign(bytes);
        loadDoc(document, entry.name, "flight", bytes);
      } catch {
        // A design Loft can no longer read is dropped from the shelf rather than left to fail again.
        setRecents(forgetRecent(id));
        setError("That saved design could no longer be read, so it has been removed.");
      } finally {
        setBusy(false);
      }
    },
    [loadDoc],
  );

  const onForgetRecent = useCallback((id: string) => setRecents(forgetRecent(id)), []);

  // Start a fresh design from scratch — the builder path. A starter model (not parsed from any
  // file) enters the exact same pipeline an import does, so every edit, sweep, and flight works on
  // it immediately; the flyer tweaks a real, stable flight rather than staring at a blank slate.
  const onNew = useCallback(() => {
    // A built design has no file behind it, so it is serialised through the same .ork writer the
    // download uses — one representation for saving, sharing, and remembering.
    const document = newDesign();
    loadDoc(document, "New design", "design", exportOrk(document));
  }, [loadDoc]);

  // Rename the current design. The name is pure metadata — it doesn't touch the airframe or the
  // flight — so this updates the document in place without re-flying. It flows to the results title,
  // the Download .ork filename, and the saved file's own <name>, so a built design can be given a
  // real name before it's saved or re-opened.
  const renameDesign = useCallback((name: string) => {
    setDoc((prev) => (prev ? { ...prev, rocket: { ...prev.rocket, name } } : prev));
  }, []);

  // Save the current design — built, edited, or imported — as an OpenRocket .ork, entirely in the
  // browser. It re-opens in Loft and, using OpenRocket's own format, in OpenRocket; so a design is
  // durable and portable rather than lost on refresh. Any active what-if edits are baked in.
  const downloadOrk = useCallback(() => {
    if (!doc) return;
    // Bake in the builder's structural (geometry) edits so the saved airframe matches what's shown.
    // Transient flight what-ifs (ballast, motor swap, recovery scale, launch conditions) are not
    // part of the design and are left out.
    const geometry = geometryOf(edits);
    const rocket = hasGeometryEdits(geometry) ? applyGeometryEdits(doc.rocket, geometry) : doc.rocket;
    const bytes = exportOrk({ ...doc, rocket });
    const base =
      (rocket.name || fileName || "design").replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-") || "design";
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}.ork`;
    a.click();
    URL.revokeObjectURL(url);
  }, [doc, edits, fileName]);

  /** Fly a what-if state. Takes the configuration index from the state rather than from the component,
   *  because an undo can move it: restoring the edits of a step taken under another configuration while
   *  flying the current one is a flight neither the flyer nor the file ever asked for. */
  const fly = useCallback(
    (w: WhatIf) => {
      if (!doc) return;
      try {
        const { run: r, baseline: b } = compute(doc, w.edits, w.weather, w.scenario, w.simIndex);
        setRun(r);
        setBaseline(b);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not simulate.");
      }
    },
    [doc, compute],
  );

  /** The launch conditions the flight is actually using when the Conditions fields are blank —
   *  resolved exactly as `makeConditions` resolves them, so what the greyed placeholders advertise is
   *  what the solver flew. Recomputed with the design and the picked configuration because a stored
   *  simulation carries its own rail and wind. */
  /** The conditions the run in view was flown under, as an overrides object — the same one
   *  `compute` builds, so the dispersion cannot fly a different setup from the Flight card. */
  const flownOverridesNow = useMemo(
    () => (doc ? flownOverrides(doc, edits, weather, scenario, simIndex) : undefined),
    [doc, edits, weather, scenario, simIndex],
  );

  const flownConditions = useMemo(() => {
    const base = defaultConditions();
    const sim = doc ? (doc.simulations[simIndex] ?? doc.simulations[0]) : undefined;
    const stored = sim ? overridesFromStored(sim) : undefined;
    // Today's weather governs elevation while it is on — `compute` above sets exactly that override —
    // so the elevation placeholder follows it. Rail length and angle are not weather and keep coming
    // from the design.
    //
    // WIND IS DIFFERENT, and advertising a number for it would be the same lie this is fixing. Under
    // today's weather the solver does not read a surface wind at all: `windAt` returns
    // `windProfile(altAgl)` whenever a profile is set, and that profile only falls back to the 10 m
    // anemometer reading below the lowest reported level (~110 m MSL). A 900 m field flying a 15 m/s
    // gradient wind drifts 324 m while the anemometer says 3 m/s — a flight that really was 3 m/s
    // drifts 67 m. There is no single flown wind to show, so the field says so instead of naming one.
    const usingToday = scenario === "today" && weather;
    // Which fields the DESIGN actually specifies. Everything else falls through to the engine's
    // defaults above — and a default presented as the flyer's own setup is a claim about their file
    // that their file never made. A rail length is the case that bites: the default is 1.0 m, real
    // designs declare up to 3.048 m, and rail-exit velocity is the number the pad check turns on.
    const defaulted = {
      rodLength: stored?.rodLength === undefined,
      rodAngleDeg: stored?.rodAngleDeg === undefined,
      windSpeed: !usingToday && stored?.windSpeed === undefined,
      launchAltitude: !usingToday && stored?.launchAltitude === undefined,
    };
    return {
      rodLength: stored?.rodLength ?? base.rodLength,
      rodAngleDeg: stored?.rodAngleDeg ?? radToDeg(base.rodAngleFromVertical),
      windSpeed: usingToday ? null : (stored?.windSpeed ?? base.windSpeed),
      launchAltitude: usingToday ? weather.elevationMsl : (stored?.launchAltitude ?? base.launchAltitude),
      defaulted,
    };
  }, [doc, simIndex, scenario, weather]);

  /** THE one path that changes what is being flown. Every control routes through it — a number box, a
   *  drag handle, a removal, the scenario toggle, the configuration picker — so that "can this be
   *  undone?" has one answer for all of them instead of one per control.
   *
   *  `action` is what the undo control will say it is taking back, and the key that decides whether
   *  this extends the gesture already in progress or starts a new step. `null` records nothing: that is
   *  for a PICK, which aims the fields at another part without changing the rocket. Selection is not an
   *  undoable act in any editor a flyer has used, and recording it would bury the edits under it. */
  const commitWhatIf = (next: WhatIf, action: { label: string; key: string } | null) => {
    const before: WhatIf = { edits, weather, scenario, simIndex };
    if (action && movedWhatIf(before, next)) {
      setHistory((h) => commitHistory(h, before, action.label, action.key, Date.now()));
    } else {
      // A change that records nothing still ENDS the gesture before it. Without this a pick recorded
      // nothing AND closed nothing, so a span dragged on one fin set, a pick of another, and a span
      // dragged on that one all shared the key `finSpan` inside the window and merged into a single
      // step — one undo took back both gestures and re-aimed the fields at the first part.
      setHistory(endRun);
    }
    setEdits(next.edits);
    setWeather(next.weather);
    setScenario(next.scenario);
    setSimIndex(next.simIndex);
    fly(next);
  };

  const applyEdit = (patch: Edits, action?: { label?: string; key?: string } | null) => {
    // A patch's field names are the gesture: every frame of a fin-span drag and every keystroke in the
    // span box arrive as `{ finSpan }`, so they share a key and merge into one undo. A caller with
    // something better to say — which part it removed — passes its own, and a key of its own so two
    // removals a moment apart stay separately undoable.
    const named =
      action === null
        ? null
        : {
            label: action?.label ?? describeEdit(patch as Record<string, unknown>),
            key: action?.key ?? Object.keys(patch).sort().join(","),
          };
    commitWhatIf({ edits: { ...edits, ...patch }, weather, scenario, simIndex }, named);
  };

  // Clear every what-if — design edits, condition edits, and today's-weather — and re-fly the design
  // exactly as the file describes it, restoring the stored-tool comparison. The counterpart to the
  // build-by-editing loop: one step back to the untouched design without unloading it.
  const editsActive = scenario === "today" || hasActiveEdits(edits);
  const resetEdits = () => {
    commitWhatIf({ edits: {}, weather: null, scenario: "design", simIndex }, {
      label: "the reset",
      key: "reset",
    });
  };

  // Remove a component. The id is APPENDED to an ordered list rather than applied to the tree, so the
  // pristine design stays the only source of truth and the deletion is undoable by dropping the entry —
  // the same shape every other what-if has, and the reason a deletion could be offered at all. A
  // parametric edit is recoverable by retyping a number; a deleted part is not.
  /** The design a removal is judged and applied against: the pristine one with the removals so far taken
   *  out. NOT the fully-edited model the diagram shows — the dimension edits can ADD parts (a boattail, a
   *  drogue, a payload bay) and those are appended AFTER the prune, so `removedIds` can never take one.
   *  Offering to remove a part the mechanism cannot touch is a button that does nothing. */
  const removableFrom = useMemo(
    () => (doc ? structureOf(doc.rocket, { added: edits.added, removedIds: edits.removedIds }) : null),
    [doc, edits.added, edits.removedIds],
  );

  /** Why this part cannot be removed, or null. The panel asks THIS rather than judging for itself, so the
   *  reason it shows and the guard that enforces it cannot disagree about which design they are judging. */
  const refuseRemoval = useCallback(
    (id: string) => (removableFrom ? removalRefusal(removableFrom, id) : "No design is loaded."),
    [removableFrom],
  );

  const removeComponent = (id: string) => {
    if (!doc || !removableFrom) return;
    if (removalRefusal(removableFrom, id)) return;
    // Named after the part, from the PRISTINE design: by the time the undo control renders the label the
    // part is gone from the model on screen, and "Undo the design" for a deletion asks the flyer to
    // remember what they deleted. Keyed by the id so two removals a moment apart never merge into one
    // step — a deleted part is the one edit retyping a number cannot bring back.
    const name = flattenRocket(doc.rocket).find((p) => p.component.id === id)?.component.name;
    // Clearing the aims the removal invalidates is not tidiness: an absolute dimension edit still aimed at
    // a part that is gone re-lands on whatever the role fallback resolves to. Measured on
    // `two-stage-firm-booster.ork` — a 77 mm span aimed at the second fin set moved the surviving 50.0 mm
    // set to 77.0 mm the moment the aimed set was removed, with the field still reading 77.
    applyEdit(
      {
        ...aimsClearedByRemoving(removableFrom, edits, id),
        removedIds: [...(edits.removedIds ?? []), id],
      },
      { label: `removing ${name || "the part"}`, key: `remove:${id}` },
    );
  };

  /** Author a part behind the one the flyer picked. The gesture is "another one of these, here": the
   *  part it goes behind is the part on screen, and everything the new part can inherit — caliber, wall,
   *  material, finish — comes from that neighbour rather than from a modal wall of number fields. The
   *  numbers are the confirmation: the fields re-aim at the new part the moment it exists, so the very
   *  next thing the flyer types changes what they just made.
   *
   *  The default length is HALF the neighbour's, floored at one caliber. Proportionate to the design, so
   *  a 4-inch airframe gets a section and a 24 mm one gets a coupler rather than both getting the same
   *  invented number; visible enough that the panels the milestone names actually move — one caliber on
   *  the starter design added 25 g and left apogee and margin reading the same to the digit shown, which
   *  is a capability a flyer cannot see; and never so long that it re-proportions the rocket before
   *  anyone has said what it is for. The floor is there because half of a very short tube is a seam. */
  const addPartAfter = (afterId: string, kind: AddedPart["kind"] = "bodytube") => {
    if (!doc || !removableFrom) return;
    const anchor = flattenRocket(removableFrom).find((p) => p.component.id === afterId)?.component;
    if (!anchor || anchor.kind !== "bodytube") return;
    const id = newPartId(doc.rocket, edits.added, afterId);
    let part: AddedPart;
    if (kind === "trapezoidfinset") {
      part = { id, kind, after: afterId, length: 0, name: "Fins" };
    } else if (kind === "transition") {
      // The length a transition's own diameter change implies, not a fraction of its neighbour: a cone
      // is defined by the step it makes, so the corpus's slenderness is the number that belongs here.
      // The name is decided ONCE, here, and carried on the entry — deciding it at every apply would let
      // a cone rename itself the moment another part was authored behind it.
      const d = transitionDefaults(removableFrom, afterId);
      if (!d) return;
      part = { id, kind, after: afterId, length: d.length, name: authoredTransitionName(removableFrom, afterId) };
    } else if (kind === "masscomponent") {
      // Weight and station both come from the corpus's medians (see `buildAdded`), and the mass fields
      // aim at the part immediately, so the next keystroke replaces the starting weight rather than
      // a modal asking for it before anything exists to see.
      part = { id, kind, after: afterId, length: 0, name: "Mass object" };
    } else {
      part = { id, kind: "bodytube", after: afterId, length: Math.max(anchor.length / 2, 2 * anchor.outerRadius) };
    }
    // Aim the fields for that KIND at it in the same commit, so one undo takes back the part AND the aim
    // rather than leaving the fields holding a part that no longer exists — and clear the absolute
    // dimensions that aim was pointing, which otherwise re-land on the part just made.
    const nextAdded = [...(edits.added ?? []), part];
    const aim = aimEditsAt(structureOf(doc.rocket, { added: nextAdded, removedIds: edits.removedIds }), id);
    applyEdit(
      { added: nextAdded, ...aimsClearedByAiming(edits, aim), ...aim },
      { label: ADD_LABEL[kind] ?? "adding a part", key: `add:${id}` },
    );
  };

  /** Step back one action, and forward again. The whole what-if state moves together — see `WhatIf` —
   *  so a step taken under today's weather or another motor configuration comes back under the same
   *  ones, rather than restoring the edits into whatever is on screen now. */
  const undoStep = () => {
    const back = undoHistory(history, { edits, weather, scenario, simIndex });
    if (!back) return;
    setHistory(back.history);
    setEdits(back.state.edits);
    setWeather(back.state.weather);
    setScenario(back.state.scenario);
    setSimIndex(back.state.simIndex);
    fly(back.state);
  };

  const redoStep = () => {
    const forward = redoHistory(history, { edits, weather, scenario, simIndex });
    if (!forward) return;
    setHistory(forward.history);
    setEdits(forward.state.edits);
    setWeather(forward.state.weather);
    setScenario(forward.state.scenario);
    setSimIndex(forward.state.simIndex);
    fly(forward.state);
  };

  const canUndo = undoLabel(history);
  const canRedo = redoLabel(history);

  /** How to spell the undo modifier for this keyboard. Set after mount, never during render: the
   *  static export is built once and served to every platform, so deciding it at render time would
   *  make the first client render disagree with the server's HTML. */
  const [modKey, setModKey] = useState("Ctrl");
  useEffect(() => {
    if (typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
      setModKey("⌘");
    }
  }, []);

  // The shortcut every editor has. Held in a ref so the listener is registered once rather than
  // re-bound on every edit — and so a key pressed mid-drag still sees the current stack.
  const shortcutRef = useRef({ undoStep, redoStep });
  useEffect(() => {
    shortcutRef.current = { undoStep, redoStep };
  });
  useEffect(() => {
    if (!doc) return;
    const onKey = (ev: KeyboardEvent) => {
      const k = ev.key.toLowerCase();
      // Ctrl+Y is redo too, not only Shift+Z. It is what OpenRocket binds on a PC, and a hobbyist
      // arriving from it presses it first — a shortcut that silently does nothing reads as a broken
      // undo rather than as a shortcut this app spells differently.
      const wants = k === "z" ? (ev.shiftKey ? "redo" : "undo") : k === "y" && !ev.shiftKey ? "redo" : null;
      if (!wants || !(ev.metaKey || ev.ctrlKey) || ev.altKey) return;
      // Never steal the shortcut from a text box: a flyer part-way through typing a design name or a
      // dimension expects Ctrl+Z to undo their typing, not to re-fly the rocket. The number fields
      // push every keystroke at the model, so the two would fight over the same gesture.
      const el = ev.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      ev.preventDefault();
      if (wants === "redo") shortcutRef.current.redoStep();
      else shortcutRef.current.undoStep();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc]);

  const selectConfig = (idx: number) => {
    if (!doc) {
      setSimIndex(idx);
      return;
    }
    // A motor swap is a choice made against ONE casing, and changing configuration can change the
    // casing. `swapMotor` applies the swap unconditionally, so a swap chosen for a 38 mm run went on
    // flying under a 24 mm one — while the picker, rebuilt for the new casing, could no longer show
    // it and reset itself to blank. Measured on `Punisher Apprentice.ork`, which stores nine
    // configurations across 24/29/38 mm: swapping the 38 mm H550ST for an H283ST gives 1,068 m,
    // 36.3:1 and 40 m/s off the rail, and selecting the 24 mm E30T configuration left all three
    // untouched. That configuration's own numbers are 90 m, 7:1 and 16 m/s. Every figure on the
    // pad-check surface was a motor the selected configuration cannot take, and the only control
    // that would have said so was blank. Carry the swap over only where the new configuration still
    // offers it, which is exactly what the picker is about to show.
    // Undoable for the same reason: dropping the swap is a change the flyer did not type and cannot
    // retype from the picker, because the picker for the new casing no longer offers that motor. One
    // step back is the only way to see it again.
    const keep = swapStillOffered(edits.motorSwap, swapInfoFor(doc, idx)?.options ?? []);
    commitWhatIf(
      { edits: keep ? edits : { ...edits, motorSwap: undefined }, weather, scenario, simIndex: idx },
      { label: "the motor configuration", key: "simIndex" },
    );
  };

  const reset = () => {
    setDoc(null);
    setRun(null);
    setBaseline(null);
    setError(null);
    setFileName("");
    setEdits({});
    setHistory(EMPTY_HISTORY as History<WhatIf>);
    setWeather(null);
    setScenario("design");
    setSimIndex(0);
    setRestored(false);
    // Keep what is being thrown away. This is the app's one destructive act — a single click, from a
    // text link 12 px from the design-name input — and it took the design, every what-if on it and the
    // session with it. The slot holds exactly the session that is about to be cleared, so picking it
    // back up is the same operation as resuming one.
    if (designBytes.current) {
      const leaving: SavedSession = {
        v: 1,
        design: designBytes.current,
        name: fileName,
        rocket: doc?.rocket.name || undefined,
        opensOn: initialTab,
        units,
        simIndex,
        edits: edits as Record<string, unknown>,
      };
      // One slot, so what goes in it matters. A session carrying nothing — no what-ifs, the design's
      // own motor configuration — must not evict one that carries something: the DESIGN is on the
      // recents shelf either way, but the trims exist nowhere else. Without this rule the natural
      // recovery move after a mis-click (open a sample to get oriented, leave it again) is what
      // destroys the work the offer was holding.
      const held = loadDiscardedSession();
      if (carriesWork(leaving) || !held || !carriesWork(held)) {
        // Only offer a way back that actually exists: a design past the storage cap, or storage
        // disabled outright, means nothing was kept and a button promising otherwise would do nothing.
        setDiscarded(saveDiscardedSession(leaving) ? leaving : null);
      } else {
        setDiscarded(held);
      }
    }
    designBytes.current = null;
    clearSession();
    // No design, no workspace — leave the address on the import screen rather than pointing at a
    // view that isn't there.
    if (typeof window !== "undefined") window.history.replaceState(null, "", window.location.pathname);
  };

  // Pick the last session back up. A phone reclaims a backgrounded tab routinely and the pad is
  // where that hurts — the design file that would let you import again may not even be on the
  // device. Restoring runs the saved bytes back through the ordinary importer, so a resumed design
  // is byte-for-byte the one that was open, edits and all. Nothing here leaves the browser.
  // The shelf is read on mount for the same reason the session is: localStorage is client-only, so
  // the first render has to match the server's (empty) one.
  useEffect(() => {
    setRecents(loadRecents());
    setDiscarded(loadDiscardedSession());
  }, []);

  useEffect(() => {
    const saved = loadSession();
    if (!saved) return;
    let cancelled = false;
    (async () => {
      try {
        const bytes = fromBase64(saved.design);
        const document = await importDesign(bytes);
        if (cancelled) return;
        setUnits(saved.units);
        loadDoc(document, saved.name, saved.opensOn, bytes, {
          edits: saved.edits as Edits,
          simIndex: saved.simIndex,
          rocket: saved.rocket,
        });
      } catch {
        // A design Loft can no longer read (a format change, a truncated write) is dropped rather
        // than shown as an error on a page the flyer never asked to be on.
        clearSession();
      }
    })();
    return () => {
      cancelled = true;
    };
    // Deliberately once, on mount: this restores a session, it doesn't track one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // …and keep it current. Everything that survives a reload is written here, so there is one
  // place that decides what "where I left off" means.
  useEffect(() => {
    if (!doc || !designBytes.current) return;
    saveSession({
      v: 1,
      design: designBytes.current,
      name: fileName,
      // The rename is not in the bytes, so it has to be carried beside them or a reload loses it.
      rocket: doc.rocket.name || undefined,
      opensOn: initialTab,
      units,
      simIndex,
      edits: edits as Record<string, unknown>,
    });
  }, [doc, fileName, initialTab, units, simIndex, edits]);

  const choices = doc ? configChoices(doc) : [];

  // The tool that wrote the loaded design, for every place the UI names whose stored numbers it is
  // showing or withholding. A RockSim `.rkt` and a RASAero `.CDX1` carry their own tool's results;
  // calling those "OpenRocket's" attributes a prediction to a tool that never made it. A design
  // built here has no source tool, and none of these surfaces have anything of its to name.
  const toolName = (doc && sourceTool(doc)) || "the design file";

  // Bundled motors of the same casing diameter as the design's own — the fitting swaps the picker
  // offers. Recomputed only when the design or its selected configuration changes.
  const swapInfo = useMemo<SwapInfo | null>(() => (doc ? swapInfoFor(doc, simIndex) : null), [doc, simIndex]);

  const designBase = removableFrom ?? doc?.rocket;
  // The design's own dimensions, shown as the starting points for the builder edits.
  //
  // Read from the design plus the flyer's STRUCTURE (`removableFrom` — the pristine design with the
  // parts they have authored and without the ones they have removed) rather than from the imported
  // file. A part the flyer just built is not in the file, so resolving an aim against the file fell
  // back to the design's primary part and advertised ITS value: add a tube to the starter design and
  // the Body length field offered 620 mm as "the design's own" for a section 44 mm long. A field must
  // never sit there showing a number that is not the one in the flight, and a placeholder is that field
  // saying what the part currently is. The dimension edits are still excluded, which is what makes
  // these the values to edit FROM.
  const designDims = useMemo(
    () =>
      doc && designBase
        ? {
            // Every fin readback takes the selected set, so the value the field shows to edit FROM
            // is the same set the edit is written TO. Undefined selection = the frontmost set.
            finSpan: primaryFinSpan(designBase, edits.finSetId),
            unreachableFinSets: unreachableFinSetCount(designBase, edits.finSetId),
            finSetPart: primaryFinSetPart(designBase, edits.finSetId),
            finCount: primaryFinCount(designBase, edits.finSetId),
            finRootChord: primaryFinRootChord(designBase, edits.finSetId),
            finTipChord: primaryFinTipChord(designBase, edits.finSetId),
            finSweepLength: primaryFinSweep(designBase, edits.finSetId),
            finStation: primaryFinStation(designBase, edits.finSetId),
            finThickness: primaryFinThickness(designBase, edits.finSetId),
            finCrossSection: primaryFinCrossSection(designBase, edits.finSetId),
            finMaterial: primaryFinMaterial(designBase, edits.finSetId),
            noseLength: primaryNose(designBase)?.length,
            noseShape: primaryNoseShape(designBase),
            // The body readbacks take the picked tube for the same reason the fin ones take the
            // picked set: the value the field shows to edit FROM has to be the part the edit is
            // written TO. 23 of the 35 corpus designs carry several tubes as Loft imports them.
            bodyLength: primaryBodyTube(designBase, edits.bodyTubeId)?.length,
            bodyDiameter: primaryBodyDiameter(designBase, edits.bodyTubeId),
            bodyTubePart: primaryBodyTubePart(designBase, edits.bodyTubeId),
            // The boattail's exit is validated against the tube the cone ATTACHES to — the aft-most one
            // — so the bound the field advertises has to come from there too. Quoting the picked tube's
            // caliber promised a limit the validator never used, and a value inside the advertised
            // range was then a silent no-op.
            boattailFairsTo: aftmostBodyDiameter(designBase),
            unreachableBodyTubes: unreachableBodyTubeCount(designBase),
            // The transition readbacks take the picked one for the same reason every other aim does:
            // the value shown to edit FROM has to be the part the edit is written TO. 12 of the 35
            // corpus designs carry a transition and none of them could be reached until now.
            transitionLength: primaryTransition(designBase, edits.transitionId)?.length,
            transitionAftDiameter: (() => {
              const t = primaryTransition(designBase, edits.transitionId);
              return t ? t.aftRadius * 2 : undefined;
            })(),
            transitionPart: primaryTransitionPart(designBase, edits.transitionId),
            unreachableTransitions: unreachableTransitionCount(designBase),
            // 26 of the 35 corpus designs carry a mass object, 56 in all, and until now not one could
            // be reached: the only mass a flyer could state was a payload the editor adds.
            massObjectMass: primaryMassObject(designBase, edits.massObjectId)?.mass,
            massObjectStation: primaryMassObjectStation(designBase, edits.massObjectId),
            massObjectPart: primaryMassObjectPart(designBase, edits.massObjectId),
            unreachableMassObjects: unreachableMassObjectCount(designBase),
            finish: primaryFinish(designBase),
            airframeMaterial: primaryAirframeMaterial(designBase),
            // The recovery readbacks take the picked canopy, so the diameter a field shows to edit
            // FROM is the canopy the resize is written TO. 17 of the 35 corpus designs carry more
            // than one — every dual-deploy design does — and the drogue was unreachable on all.
            mainParachuteDiameter: primaryParachute(designBase, edits.parachuteId)?.diameter,
            parachutePart: primaryParachutePart(designBase, edits.parachuteId),
            unreachableParachutes: unreachableParachuteCount(designBase),
            motorClusterCount: primaryMotorClusterCount(designBase),
            payloadStation: defaultPayloadStation(designBase, edits.bodyTubeId),
          }
        : {
            finSpan: undefined,
            unreachableFinSets: 0,
            finSetPart: undefined,
            finCount: undefined,
            finRootChord: undefined,
            finTipChord: undefined,
            finSweepLength: undefined,
            finStation: undefined,
            finThickness: undefined,
            finCrossSection: undefined,
            finMaterial: undefined,
            noseLength: undefined,
            noseShape: undefined,
            bodyLength: undefined,
            bodyDiameter: undefined,
            bodyTubePart: undefined,
            unreachableBodyTubes: 0,
            boattailFairsTo: undefined,
            transitionLength: undefined,
            transitionAftDiameter: undefined,
            transitionPart: undefined,
            unreachableTransitions: 0,
            massObjectMass: undefined,
            massObjectStation: undefined,
            massObjectPart: undefined,
            unreachableMassObjects: 0,
            finish: undefined,
            airframeMaterial: undefined,
            mainParachuteDiameter: undefined,
            parachutePart: undefined,
            unreachableParachutes: 0,
            motorClusterCount: undefined,
            payloadStation: undefined,
          },
    // The fin and body readbacks take their selected part, so both selections are real dependencies:
    // without them the panel keeps showing the primary part's numbers while the edit writes to the
    // picked one.
    [doc, designBase, edits.finSetId, edits.bodyTubeId, edits.transitionId, edits.massObjectId, edits.parachuteId],
  );

  return (
    <div className="mt-8">
      {!doc && (
        <>
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Import an OpenRocket <code className="font-mono">.ork</code>, RockSim{" "}
            <code className="font-mono">.rkt</code> or RASAero <code className="font-mono">.CDX1</code>{" "}
            design and Loft simulates the flight in your
            browser — apogee, speed, stability, and recovery — and compares against the numbers
            the design tool stored in the file. It runs on a phone, offline once loaded. Results
            are estimates from a model;{" "}
            <Link href="/docs/methods" className="text-indigo-600 underline underline-offset-2 dark:text-indigo-400">
              see how they&apos;re computed
            </Link>{" "}
            and{" "}
            <Link href="/docs/limitations" className="text-indigo-600 underline underline-offset-2 dark:text-indigo-400">
              where the model is weak
            </Link>
            .
          </p>
          <ImportPanel
            onFile={onFile}
            onSample={onSample}
            onNew={onNew}
            busy={busy}
            recents={recents}
            onOpenRecent={onOpenRecent}
            onForgetRecent={onForgetRecent}
            discarded={discarded}
            onRestoreDiscarded={onRestoreDiscarded}
          />
        </>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {doc && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* On a phone this row is icons and the design's name; the words come back at `sm:`. Undo
                and redo took it past 390 px — measured, the five controls wanted 518 px of a 358 px
                row — and the two ways out are both worse than shortening the labels: overflowing puts
                a horizontal scrollbar under every workspace, and wrapping to a second row costs 48 px
                of height that pushed the diagram's drag handles below the fold, where a tap at a
                handle's own centre resolved to nothing at all. Deliberately NOT `flex-wrap`: a wrapping
                row wraps before it shrinks, so the name field kept its full 176 px and the row went to
                two lines anyway. Nowrap plus the field's own `min-w-0` lets it give up the width
                instead, which is the right thing to spend — a name is readable at half its width and a
                44 px control is not tappable at half of its. */}
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={reset}
                className={
                  "inline-flex items-center justify-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900 " +
                  `dark:text-zinc-300 dark:hover:text-white sm:underline sm:underline-offset-2 ${TOUCH_TARGET_SQUARE}`
                }
              >
                <span aria-hidden>←</span>
                <span className="sr-only sm:not-sr-only">Import another</span>
              </button>
              <input
                type="text"
                aria-label="Design name"
                value={doc.rocket.name}
                onChange={(e) => renameDesign(e.target.value)}
                placeholder="Design name"
                title="Rename this design — used as the results title and the .ork filename"
                className={`min-w-0 max-w-[11rem] rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm font-medium text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${TOUCH_TARGET}`}
              />
              {fileName && fileName !== doc.rocket.name && (
                <span className="hidden truncate text-xs text-zinc-500 dark:text-zinc-400 sm:inline" title={fileName}>
                  {fileName}
                </span>
              )}
              <button
                type="button"
                onClick={downloadOrk}
                title="Save this design as an OpenRocket .ork file"
                className={`${HEADER_BUTTON} justify-center ${TOUCH_TARGET_SQUARE}`}
              >
                <span aria-hidden className="sm:hidden">
                  ↓
                </span>
                <span className="sr-only sm:not-sr-only">Download .ork</span>
              </button>
              {/* Undo and redo over every edit, not only the deletions. Each NAMES what it will do,
                  because "Undo" alone asks the flyer to remember what they last did — and after a
                  removal the part is no longer on the diagram to remind them. Disabled rather than
                  hidden: a control that appears and disappears as the stack empties is one a flyer
                  has to hunt for, and its position on the header would move under the pointer.

                  The name is carried as `sr-only` text on a phone rather than as an `aria-label`, and
                  that is deliberate on both counts. A phone header has room for the glyph and a 44 px
                  target and nothing else — with the words in, the row wanted 518 px of a 358 px line —
                  so the label has to leave the layout without leaving the accessibility tree. And an
                  `aria-label` naming a field is a SECOND control answering to that field's name:
                  "Undo the rail length" is matched by anything looking up "Rail length", so the box a
                  flyer's voice control or a test means to reach stops being the only match. Visible
                  text (however small) names the button without joining that lookup. */}
              <span className="inline-flex items-center gap-1">
                {/* `aria-disabled`, not `disabled`. A disabled button leaves the accessibility tree
                    and drops focus to <body>, and the moment it empties is exactly when a keyboard
                    user is stepping back through a mistake — press Enter once too often and your
                    place in the page is gone. Announced as unavailable, still reachable by Tab. */}
                <button
                  type="button"
                  onClick={undoStep}
                  aria-disabled={!canUndo || undefined}
                  title={canUndo ? `Undo ${canUndo} (${modKey}+Z)` : "Nothing to undo"}
                  className={UNDO_BUTTON}
                >
                  <span aria-hidden>↶</span>
                  <span className="sr-only sm:not-sr-only">Undo{canUndo ? ` ${canUndo}` : ""}</span>
                </button>
                <button
                  type="button"
                  onClick={redoStep}
                  aria-disabled={!canRedo || undefined}
                  title={canRedo ? `Redo ${canRedo} (${modKey}+Shift+Z)` : "Nothing to redo"}
                  className={UNDO_BUTTON}
                >
                  <span aria-hidden>↷</span>
                  <span className="sr-only">Redo{canRedo ? ` ${canRedo}` : ""}</span>
                </button>
              </span>
              {editsActive && (
                <button
                  type="button"
                  onClick={resetEdits}
                  title="Clear every what-if and re-fly the design as the file describes it"
                  className={`${HEADER_BUTTON} shrink-0`}
                >
                  Reset<span className="sr-only sm:not-sr-only">&nbsp;to as-designed</span>
                </button>
              )}
            </div>
            <Segmented
              value={units}
              onChange={(v) => setUnits(v as UnitSystem)}
              options={[
                { value: "metric", label: "Metric" },
                { value: "imperial", label: "Imperial" },
              ]}
              ariaLabel="Unit system"
              size="sm"
            />
          </div>

          {restored && (
            // Never restore silently: a design that reappears without saying so is indistinguishable
            // from one you thought you had closed, and the numbers on screen would be someone else's
            // session as far as the reader knows.
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
              <span>
                Picked up where you left off — <strong className="font-medium">{fileName}</strong>, with
                any what-ifs you had set. Kept on this device only.
              </span>
              <button
                type="button"
                onClick={reset}
                className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Start fresh
              </button>
            </div>
          )}

          {choices.length > 1 && (
            <ConfigPicker choices={choices} selected={simIndex} onSelect={selectConfig} units={units} tool={toolName} />
          )}

          {doc.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              <p className="font-medium">Some parts of this design weren&apos;t fully understood:</p>
              <ul className="mt-1 list-disc pl-5">
                {doc.warnings.slice(0, 6).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* How the design was read, as distinct from what couldn't be. Explaining that a two-stage
              design flies serially, or which weight a format without materials uses, under an amber
              "weren't fully understood" heading made a correct reading look like a broken one. */}
          {doc.notes.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
              <p className="font-medium text-zinc-700 dark:text-zinc-200">How Loft read this design:</p>
              <ul className="mt-1 list-disc pl-5">
                {doc.notes.slice(0, 6).map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <ConditionsControls
            units={units}
            edits={edits}
            onEdit={applyEdit}
            flown={flownConditions}
            weather={weather}
            scenario={scenario}
            setScenario={(s) => {
              // Switching TO today overrides the same two edits a fetch does, so it has to drop
              // them for the same reason — see `onWeather` below, whose comment describes exactly
              // the state this toggle used to produce. Reproduced: fetch a forecast, switch to As
              // designed, type 12 m/s, switch back. The box read 12.0, greyed out, while the flight
              // drifted 794 m on the forecast's wind — the 2,518 m that 12 m/s actually gives was
              // nowhere on screen. Two paths into the same scenario disagreeing is its own defect.
              const kept =
                s === "today" ? { ...edits, windSpeed: undefined, launchAltitude: undefined } : edits;
              // Undoable because it DROPS edits the flyer typed. Switching to today discards the wind
              // and elevation they set, and switching back does not bring them back — the way back was
              // "Reset to as-designed", which also discards everything else.
              commitWhatIf({ edits: kept, weather, scenario: s, simIndex }, {
                label: "the weather scenario",
                key: "scenario",
              });
            }}
            onWeather={(wx) => {
              // Drop the two condition edits today's weather overrides. `compute` applies them and
              // then overwrites both with the forecast, so leaving them set left the field greyed out
              // displaying a number the flight had thrown away: 12 m/s in the box against 7.4 m/s
              // flown, which is 2,518 m of drift advertised against the 1,563 m actually computed.
              // `Num`'s own re-sync effect exists to guarantee a field never sits there showing a
              // value that is not the one in the flight; this is the same rule one level up.
              const kept = { ...edits, windSpeed: undefined, launchAltitude: undefined };
              setWeatherSerial((n) => n + 1);
              commitWhatIf({ edits: kept, weather: wx, scenario: "today", simIndex }, {
                label: "the forecast",
                key: "weather",
              });
            }}
            busy={busy}
            tool={toolName}
          />

          {run && (
            <ResultsView
              run={run}
              doc={doc}
              loadId={loadSerial}
              units={units}
              flownOverrides={flownOverridesNow}
              weatherSerial={weatherSerial}
              conditions={{
                // What each panel should SAY about the nominals it flew. One boolean could not:
                // it made a surface-wind edit flip the two sweeps' captions to "the launch
                // conditions you set" while every row was bit-identical — those panels fly
                // ballistic, and `runFlight` zeroes the wind for a ballistic run — and it made a
                // fetched forecast read as the flyer's own setup while the fields it filled are
                // greyed out and un-typeable. Each panel asks only about the fields it reads.
                railEdited: edits.rodLength !== undefined || edits.rodAngleDeg !== undefined,
                elevationEdited: edits.launchAltitude !== undefined,
                windEdited: edits.windSpeed !== undefined,
                today: scenario === "today" && weather !== null,
                // And when the design specifies nothing, the nominals are Loft's own defaults, not
                // "the design's own stored launch conditions" — the Conditions panel already says
                // so in amber on the same page, so claiming otherwise contradicts it a screen away.
                defaulted:
                  flownConditions.defaulted.rodLength &&
                  flownConditions.defaulted.rodAngleDeg &&
                  flownConditions.defaulted.windSpeed &&
                  flownConditions.defaulted.launchAltitude,
              }}
              baseline={baseline}
              simIndex={simIndex}
              ballastKg={edits.ballastKg}
              recoveryCdScale={edits.recoveryCdScale}
              motorSwap={edits.motorSwap}
              geometry={geometryOf(edits)}
              swapOptions={swapInfo?.options}
              designMotor={swapInfo?.designMotor}
              designManufacturer={swapInfo?.designManufacturer}
              onEditGeometry={applyEdit}
              // A pick re-aims the fields that describe THAT kind of part and leaves the rest alone.
              // The routing lives in the edit model rather than here, so the panel that reports the
              // pick does not also have to know which fields a body tube or a fin set drives.
              onRemovePart={removeComponent}
              onAddAfter={addPartAfter}
              refuseRemoval={refuseRemoval}
              onSelectPart={(id) => {
                // A pick that aims nothing — a coupler, a centring ring — must not commit an edit
                // patch. An empty one still replaced the edits object, re-flew the whole design and
                // rewrote the saved session, so reading a part cost a flight.
                // `null` keeps it out of the undo stack. A pick aims the fields at another part; it
                // changes nothing about the rocket (see `INERT_EDIT_FIELDS`), and no editor a flyer
                // has used makes selection undoable. Recording it would bury the edits under the
                // clicks that led to them.
                //
                // Judged against `removableFrom` — the design plus the flyer's STRUCTURE — and not the
                // pristine import, for the same reason the Remove button is. A part the flyer AUTHORED
                // is not in `doc.rocket`, so picking one aimed NOTHING: the diagram highlighted the new
                // tube while the body fields went on holding whichever tube they held before, and the
                // next length typed landed there. On the starter design: add a tube behind its own
                // 620.0 mm one (the new tube is half of it, 310.0 mm), click the 620 mm tube, click
                // back onto the authored one, type 400 mm — the authored tube stayed 310.0 mm and the
                // design's own became 400.0 mm, with the diagram highlighting the part that did not
                // move. The three parts a DIMENSION edit adds (a boattail, a drogue, a payload bay)
                // are still not aimable, and deliberately: they are appended after this tree, so no
                // aim can reach them — which is the same rule that already stops the Remove button
                // offering to take one out.
                const patch = removableFrom ? aimEditsAt(removableFrom, id) : {};
                if (Object.keys(patch).length) applyEdit(patch, null);
              }}
              initialTab={initialTab}
              onWorkspaceChange={setInitialTab}
              designEditor={
                <DesignEditor
                  units={units}
                  edits={edits}
                  onEdit={applyEdit}
                  swap={swapInfo}
                  designDims={designDims}
                  tool={toolName}
                />
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

// --- motor-configuration picker ------------------------------------------------------

/** When a design carries more than one flight configuration (the source tool's stored simulations —
 *  e.g. the same airframe on an H128W and a G40W), let the flyer choose which to simulate. Each
 *  option shows the motor(s) and the apogee that tool stored for it, so motors can be compared. */
function ConfigPicker({
  choices,
  selected,
  onSelect,
  units,
  tool,
}: {
  choices: ConfigChoice[];
  selected: number;
  onSelect: (simIndex: number) => void;
  units: UnitSystem;
  /** The tool that stored these configurations — a RockSim or RASAero import isn't OpenRocket's. */
  tool: string;
}) {
  const labels = d.storedRunLabels(choices, units);
  return (
    <label className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Motor configuration</span>
      <select
        aria-label="Motor configuration"
        value={selected}
        onChange={(e) => onSelect(Number(e.target.value))}
        className={`min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${TOUCH_TARGET}`}
      >
        {/* No `title`: it used to carry the run's raw name, which is now part of the visible label
            wherever it distinguishes anything — leaving it made eleven options with different text
            share one identical tooltip on `FullScaleModelTH.rkt`. A tooltip less specific than the
            text it expands is worse than none, and native tooltips never fire on touch anyway. */}
        {choices.map((c, i) => (
          <option key={c.simIndex} value={c.simIndex}>
            {labels[i]}
          </option>
        ))}
      </select>
      <span className="w-full text-xs text-zinc-500 dark:text-zinc-400 sm:w-auto">
        {choices.length} configurations in this design — the apogee shown is {tool}&apos;s stored value.
        {/* An option marked outdated or not run still belongs in the list — it is a reference point —
            but it is not what the tool would predict for the design as it now stands, and the picker
            is where the flyer decides which run to be compared against. */}
        {choices.some((c) => storedTag(c.status)) && (
          <>
            {" "}
            One or more predate the design&apos;s last edit or were never run; {tool} says so, and the
            comparison panel spells out what that means for the flight chosen.
          </>
        )}
      </span>
    </label>
  );
}

// --- conditions controls (rod / wind / elevation + today's weather) -----------------

/** The design-editing surface: fly a different motor, add nose weight, and resize/reshape the
 *  airframe. It lives in the Design workspace next to the to-scale diagram it edits, so building
 *  and editing are the same surface. Every change is a hypothetical on the loaded design, so the
 *  stored-tool comparison is hidden while any is set. */
function DesignEditor({
  units,
  edits,
  onEdit,
  swap,
  designDims,
  tool,
}: {
  units: UnitSystem;
  edits: Edits;
  onEdit: (patch: Edits) => void;
  swap: SwapInfo | null;
  /** The tool whose stored comparison an edit hides — named by the importer, never assumed. */
  tool: string;
  /** The design's own dimensions (m; counts are plain numbers), shown as the fields' placeholders. */
  designDims: {
    finSpan?: number;
    unreachableFinSets: number;
    finSetPart?: AimedPart;
    finCount?: number;
    finRootChord?: number;
    finTipChord?: number;
    finSweepLength?: number;
    finStation?: number;
    finThickness?: number;
    finCrossSection?: FinCrossSection;
    finMaterial?: string;
    noseLength?: number;
    noseShape?: NoseShape;
    bodyLength?: number;
    bodyDiameter?: number;
    bodyTubePart?: AimedPart;
    unreachableBodyTubes: number;
    boattailFairsTo?: number;
    transitionLength?: number;
    transitionAftDiameter?: number;
    transitionPart?: AimedPart;
    unreachableTransitions: number;
    massObjectMass?: number;
    massObjectStation?: number;
    massObjectPart?: AimedPart;
    unreachableMassObjects: number;
    finish?: SurfaceFinish;
    airframeMaterial?: string;
    mainParachuteDiameter?: number;
    parachutePart?: AimedPart;
    unreachableParachutes: number;
    motorClusterCount?: number;
    payloadStation?: number;
  };
}) {
  const imperial = units === "imperial";
  // Every one of these renders a value the flyer can type, so each renders at ROUND-TRIP precision:
  // `d.fmtEditable` adds a decimal only where the field's nominal precision would misstate what is
  // being flown. Whole millimetres put a BT-5's 13.46 mm on screen as "13" (−3.4% on the diameter,
  // −6.7% on the reference area it drives), and tenths of a millimetre put a 0.254 mm balsa fin —
  // a real part a real corpus file specifies — at "0.3", 18% thick. Worse than misreading it, the
  // box then COMMITS that reading: `Num` re-syncs an unfocused field to the displayed text and
  // commits it on the next blur, so a 0.03 mm entry redisplayed as "0.0" was parsed back as zero,
  // and zero here means "no edit" — a focus and a Tab with nothing typed silently deleted it.
  const lenU = imperial ? "ft" : "m";
  const toDispLen = (m: number | undefined) => (m === undefined ? "" : d.fmtEditable(imperial ? mToFt(m) : m, 1));
  const fromLen = (v: string) => (v === "" ? undefined : imperial ? ftToM(Number(v)) : Number(v));
  const massU = imperial ? "oz" : "g";
  const toDispMass = (kg: number | undefined) =>
    kg === undefined ? "" : d.fmtEditable(imperial ? kg * 35.274 : kg * 1000, imperial ? 1 : 0);
  const fromMass = (v: string) => (v === "" ? undefined : imperial ? Number(v) / 35.274 : Number(v) / 1000);
  const spanU = imperial ? "in" : "mm";
  const toDispSpan = (m: number | undefined) =>
    m === undefined ? "" : d.fmtEditable(imperial ? m * 39.3701 : m * 1000, imperial ? 2 : 0);
  const fromSpan = (v: string) => (v === "" ? undefined : imperial ? Number(v) / 39.3701 : Number(v) / 1000);
  // How to refer to the part a group of fields is holding. The design's own name where that name tells
  // it apart from its siblings; otherwise where the part SITS, which is what a flyer reads off the
  // diagram and the one description that stays true however the parts table beside it is sorted — a
  // positional name ("fin set 2") did not, and it also named one part while the fin fields change a
  // whole appearance-group, so the group size is stated outright rather than implied.
  const partPhrase = (p: AimedPart | undefined, noun: string): string => {
    if (!p) return `the ${noun}`;
    const where = p.name ?? `the ${noun} ${d.q(d.lengthMm(p.station, units))} from the nose`;
    return p.covers > 1 ? `${where} (${p.covers} parts, changed together)` : where;
  };
  const finPhrase = partPhrase(designDims.finSetPart, "set");
  const bodyPhrase = partPhrase(designDims.bodyTubePart, "tube");
  const chutePhrase = partPhrase(designDims.parachutePart, "canopy");
  const transPhrase = partPhrase(designDims.transitionPart, "transition");
  const massPhrase = partPhrase(designDims.massObjectPart, "mass object");
  // Blank means "use the design's own value". A zero is a different statement, and these fields want
  // three different answers to it — so every call site says which of the three it is, and
  // `lib/model/edit.ts` is the authority, because it is the code that decides what the solver sees:
  //   · a zero the model FLIES goes through untouched. `finSweepLength >= 0` there is deliberate — a
  //     sweep of zero is a straight leading edge, an entirely ordinary fin — and a payload at station
  //     zero sits at the fore end of the body tube rather than its middle. Both were unreachable
  //     while every zero was thrown away here.
  //   · a zero on a field whose UNEDITED value is already zero — nose ballast, an added payload, a
  //     drogue the design does not carry, either half of a boattail it does not have — says exactly
  //     what blank says, so `orNone` folds it back to blank. Storing it instead would count as an
  //     edit and withhold the stored-tool comparison for a change that changed nothing. The two
  //     boattail fields belong together here: `edit.ts:198` gates them as a PAIR, so a zero on
  //     either one means "no boattail", which is what leaving both blank already means.
  //   · a zero the model will NOT fly never leaves the field at all: `Num`'s `positive` refuses it in
  //     words. That is the case the old blanket "zero means blank" hid — a refused entry looked
  //     byte-identical to a cleared one, so the field simply forgot what the flyer had typed.
  const orNone = (m: number | undefined) => (m === 0 ? undefined : m);
  const toDispThick = (m: number | undefined) =>
    m === undefined ? "" : d.fmtEditable(imperial ? m * 39.3701 : m * 1000, imperial ? 3 : 1);

  return (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Design what-if
          </p>
          {/* The what-if fields, grouped into labelled sections (a <fieldset> per subsystem) rather
              than one long wall — so a flyer can find the fin controls, the nose/body controls, or the
              recovery controls at a glance, and a screen reader announces each field's group. A group
              renders only when the design actually carries fields for it. */}
          <div className="mt-3 space-y-4">
            {((swap && swap.options.length > 1) || designDims.motorClusterCount !== undefined) && (
              <fieldset className="min-w-0 border-0 p-0">
                <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Motor
                </legend>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {swap && swap.options.length > 1 && (
                    <label className="col-span-2 block">
                      <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Swap motor
                      </span>
                      <select
                        aria-label="Swap motor"
                        value={edits.motorSwap ? `${edits.motorSwap.manufacturer ?? ""}|${edits.motorSwap.designation}` : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          const opt = v ? swap.options.find((o) => `${o.manufacturer}|${o.designation}` === v) : undefined;
                          onEdit({
                            motorSwap: opt
                              ? { manufacturer: opt.manufacturer, designation: opt.designation, diameter: opt.diameter }
                              : undefined,
                          });
                        }}
                        className={`mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${TOUCH_TARGET}`}
                      >
                        <option value="">Design motor ({swap.designMotor})</option>
                        {Object.entries(
                          swap.options.reduce<Record<string, SwapInfo["options"]>>((acc, o) => {
                            (acc[o.motorClass] ??= []).push(o);
                            return acc;
                          }, {}),
                        ).map(([cls, opts]) => (
                          <optgroup key={cls} label={`${cls} class`}>
                            {opts.map((o) => (
                              <option key={`${o.manufacturer}|${o.designation}`} value={`${o.manufacturer}|${o.designation}`}>
                                {o.designation} · {o.manufacturer}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                  )}
                  {designDims.motorClusterCount !== undefined && (
                    <Num
                      label="Motor cluster"
                      value={edits.motorClusterCount ?? ""}
                      placeholder={String(designDims.motorClusterCount)}
                      min={1}
                      max={12}
                      step={1}
                      hint="How many motors the mount holds — at least one."
                      onChange={(v) => {
                        const n = v === "" ? undefined : Math.round(Number(v));
                        onEdit({ motorClusterCount: n !== undefined && n >= 1 ? n : undefined });
                      }}
                    />
                  )}
                </div>
              </fieldset>
            )}

            {designDims.finSpan !== undefined && (
              <fieldset className="min-w-0 border-0 p-0">
                <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {designDims.unreachableFinSets > 0 ? `Fins — ${finPhrase}` : "Fins"}
                </legend>
                {designDims.unreachableFinSets > 0 && (
                  // A staged or podded design carries sets that legitimately differ. These fields
                  // describe one of them at a time — say which, and say how to aim them at another,
                  // rather than letting one unlabelled control stand for all of them.
                  <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                    This design has {designDims.unreachableFinSets} other fin{" "}
                    {designDims.unreachableFinSets === 1 ? "set" : "sets"} with different dimensions.{" "}
                    These fields describe and change {finPhrase}; to edit another, pick it{" "}
                    on the diagram or in the parts table above. Fin position moves all of them together.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Num
                    label={`Fin span (${spanU})`}
                    value={toDispSpan(edits.finSpan)}
                    placeholder={toDispSpan(designDims.finSpan)}
                    onChange={(v) => onEdit({ finSpan: fromSpan(v) })}
                  min={0}
                  positive
                  />
                  {designDims.finCount !== undefined && (
                    <Num
                      label="Fin count"
                      value={edits.finCount ?? ""}
                      placeholder={String(designDims.finCount)}
                      min={1}
                      max={12}
                      step={1}
                      hint="Fins in the set. Zero is not a fin set — it is a design with no fins, which the editor cannot yet build."
                      onChange={(v) => {
                        const n = v === "" ? undefined : Math.round(Number(v));
                        onEdit({ finCount: n !== undefined && n >= 1 ? n : undefined });
                      }}
                    />
                  )}
                  {designDims.finRootChord !== undefined && (
                    <Num
                      label={`Fin root (${spanU})`}
                      value={toDispSpan(edits.finRootChord)}
                      placeholder={toDispSpan(designDims.finRootChord)}
                      onChange={(v) => onEdit({ finRootChord: fromSpan(v) })}
                    min={0}
                    positive
                    />
                  )}
                  {designDims.finTipChord !== undefined && (
                    <Num
                      label={`Fin tip (${spanU})`}
                      value={toDispSpan(edits.finTipChord)}
                      placeholder={toDispSpan(designDims.finTipChord)}
                      onChange={(v) => onEdit({ finTipChord: fromSpan(v) })}
                    min={0}
                    positive
                    />
                  )}
                  {designDims.finSweepLength !== undefined && (
                    <Num
                      label={`Fin sweep (${spanU})`}
                      value={toDispSpan(edits.finSweepLength)}
                      placeholder={toDispSpan(designDims.finSweepLength)}
                      onChange={(v) => onEdit({ finSweepLength: fromSpan(v) })}
                    min={0}
                    />
                  )}
                  {designDims.finStation !== undefined && (
                    <Num
                      label={`Fin position (${spanU})`}
                      value={toDispSpan(edits.finStation)}
                      placeholder={toDispSpan(designDims.finStation)}
                      onChange={(v) => onEdit({ finStation: fromSpan(v) })}
                    min={0}
                    positive
                    />
                  )}
                  {designDims.finThickness !== undefined && (
                    <Num
                      label={`Fin thickness (${spanU})`}
                      value={toDispThick(edits.finThickness)}
                      placeholder={toDispThick(designDims.finThickness)}
                      onChange={(v) => onEdit({ finThickness: fromSpan(v) })}
                    min={0}
                    positive
                    />
                  )}
                  {designDims.finCrossSection !== undefined && (
                    <label className="block">
                      <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Fin edge
                      </span>
                      <select
                        aria-label="Fin edge cross-section"
                        value={edits.finCrossSection ?? ""}
                        onChange={(e) =>
                          onEdit({ finCrossSection: e.target.value ? (e.target.value as FinCrossSection) : undefined })
                        }
                        className={`mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${TOUCH_TARGET}`}
                      >
                        <option value="">As designed ({FIN_CROSS_SECTION_LABELS[designDims.finCrossSection]})</option>
                        {FIN_CROSS_SECTIONS.map((s) => (
                          <option key={s} value={s}>
                            {FIN_CROSS_SECTION_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {designDims.finCrossSection !== undefined && (
                    <label className="block">
                      <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Fin material
                      </span>
                      <select
                        aria-label="Fin material"
                        value={edits.finMaterial ?? ""}
                        onChange={(e) => onEdit({ finMaterial: e.target.value || undefined })}
                        className={`mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${TOUCH_TARGET}`}
                      >
                        <option value="">
                          As designed{designDims.finMaterial ? ` (${designDims.finMaterial})` : ""}
                        </option>
                        {FIN_MATERIALS.map((m) => (
                          <option key={m.key} value={m.key}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </fieldset>
            )}

            {(designDims.noseLength !== undefined ||
              designDims.noseShape !== undefined ||
              designDims.bodyDiameter !== undefined) && (
              <fieldset className="min-w-0 border-0 p-0">
                <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Nose &amp; body
                </legend>
                {designDims.unreachableBodyTubes > 0 && (
                  // A staged, podded or coupler-split airframe is several tubes end to end — 23 of the
                  // 35 corpus designs are, as Loft imports them. Say which one the length field is
                  // holding, and say plainly that the caliber field is NOT one tube's: it scales the
                  // whole outer airframe, and a note implying otherwise would be the more misleading
                  // of the two.
                  <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                    This design has {designDims.unreachableBodyTubes} other body{" "}
                    {designDims.unreachableBodyTubes === 1 ? "tube" : "tubes"}.{" "}
                    <em>Body length</em> describes and changes {bodyPhrase}; to edit another, pick it{" "}
                    on the diagram or in the parts table above. <em>Body diameter</em> reads that same{" "}
                    tube, but scales the whole outer airframe to the caliber you give it, so the mould{" "}
                    line stays faired.
                  </p>
                )}
                {designDims.unreachableTransitions > 0 && (
                  // A design that steps caliber more than once — a payload shoulder and a tail cone —
                  // has several, and the fields hold exactly one of them.
                  <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                    This design has {designDims.unreachableTransitions} other{" "}
                    {designDims.unreachableTransitions === 1 ? "transition" : "transitions"}.{" "}
                    <em>Transition length</em> and <em>Transition exit</em> describe and change{" "}
                    {transPhrase}; to edit another, pick it on the diagram or in the parts table above.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {designDims.noseLength !== undefined && (
                    <Num
                      label={`Nose length (${spanU})`}
                      value={toDispSpan(edits.noseLength)}
                      placeholder={toDispSpan(designDims.noseLength)}
                      onChange={(v) => onEdit({ noseLength: fromSpan(v) })}
                    min={0}
                    positive
                    />
                  )}
                  {designDims.noseShape !== undefined && (
                    <label className="block">
                      <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Nose shape
                      </span>
                      <select
                        aria-label="Nose shape"
                        value={edits.noseShape ?? ""}
                        onChange={(e) => onEdit({ noseShape: e.target.value ? (e.target.value as NoseShape) : undefined })}
                        className={`mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${TOUCH_TARGET}`}
                      >
                        <option value="">As designed ({NOSE_SHAPE_LABELS[designDims.noseShape]})</option>
                        {NOSE_SHAPES.map((s) => (
                          <option key={s} value={s}>
                            {NOSE_SHAPE_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {designDims.bodyLength !== undefined && (
                    <Num
                      label={`Body length (${spanU})`}
                      value={toDispSpan(edits.bodyLength)}
                      placeholder={toDispSpan(designDims.bodyLength)}
                      onChange={(v) => onEdit({ bodyLength: fromSpan(v) })}
                    min={0}
                    positive
                    />
                  )}
                  {designDims.bodyDiameter !== undefined && (
                    <Num
                      label={`Body diameter (${spanU})`}
                      value={toDispSpan(edits.bodyDiameter)}
                      placeholder={toDispSpan(designDims.bodyDiameter)}
                      onChange={(v) => onEdit({ bodyDiameter: fromSpan(v) })}
                    min={0}
                    positive
                    />
                  )}
                  {/* A transition is where an airframe changes caliber, and until now not one could be
                      touched — 12 of the 35 corpus designs carry one, 25 in all. Shown only when the
                      design has one to hold: a field for a part that is not there teaches nothing. */}
                  {designDims.transitionLength !== undefined && (
                    <Num
                      label={`Transition length (${spanU})`}
                      value={toDispSpan(edits.transitionLength)}
                      placeholder={toDispSpan(designDims.transitionLength)}
                      onChange={(v) => onEdit({ transitionLength: fromSpan(v) })}
                      min={0}
                      positive
                    />
                  )}
                  {designDims.transitionAftDiameter !== undefined && (
                    <Num
                      label={`Transition exit (${spanU})`}
                      value={toDispSpan(edits.transitionAftDiameter)}
                      placeholder={toDispSpan(designDims.transitionAftDiameter)}
                      onChange={(v) => onEdit({ transitionAftDiameter: fromSpan(v) })}
                      min={0}
                      positive
                    />
                  )}
                  {designDims.bodyDiameter !== undefined && (
                    <Num
                      label={`Boattail length (${spanU})`}
                      value={toDispSpan(edits.boattailLength)}
                      placeholder="0"
                      onChange={(v) => onEdit({ boattailLength: orNone(fromSpan(v)) })}
                    min={0}
                    />
                  )}
                  {designDims.bodyDiameter !== undefined && (
                    <Num
                      label={`Boattail exit (${spanU})`}
                      value={toDispSpan(edits.boattailAftDiameter)}
                      placeholder={`< ${toDispSpan(designDims.boattailFairsTo ?? designDims.bodyDiameter)}`}
                      onChange={(v) => onEdit({ boattailAftDiameter: orNone(fromSpan(v)) })}
                    min={0}
                    />
                  )}
                </div>
              </fieldset>
            )}

            <fieldset className="min-w-0 border-0 p-0">
              <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {designDims.unreachableParachutes > 0 ? `Recovery — ${chutePhrase}` : "Recovery"}
              </legend>
              {designDims.unreachableParachutes > 0 && (
                // Every dual-deploy design carries two canopies, and the fields used to resolve "the"
                // parachute as the LARGEST — so on 17 of the 35 corpus designs the drogue could not be
                // reached at all, and a flyer aiming to shrink it resized the main instead. That moves
                // landing speed and landing energy, which is what recovery sizing exists to get right.
                <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                  This design has {designDims.unreachableParachutes} other{" "}
                  {designDims.unreachableParachutes === 1 ? "canopy" : "canopies"}.{" "}
                  <em>Main chute Ø</em>, <em>Main deploy alt</em> and <em>Drogue Ø</em> describe and{" "}
                  change {chutePhrase}; to work on another, pick it in the parts table above.{" "}
                  <em>Recovery size</em> is a scale on every deployed canopy, so it is the one control{" "}
                  here that is not about one of them.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Num
                  label="Recovery size (×)"
                  value={edits.recoveryCdScale ?? ""}
                  placeholder="1"
                  min={0.1}
                  max={10}
                  step={0.1}
                  hint="Scale on the deployed drag area — 2 is twice the canopy."
                  onChange={(v) => {
                    const n = v === "" ? undefined : Number(v);
                    onEdit({ recoveryCdScale: n !== undefined && n > 0 ? n : undefined });
                  }}
                />
                <Num
                  label={`Main deploy alt (${lenU})`}
                  value={toDispLen(edits.mainDeployAltitude)}
                  placeholder="apogee"
                  onChange={(v) => onEdit({ mainDeployAltitude: fromLen(v) })}
                min={0}
                positive
                />
                <Num
                  label={`Drogue Ø (${spanU})`}
                  value={toDispSpan(edits.drogueDiameter)}
                  placeholder="0"
                  onChange={(v) => onEdit({ drogueDiameter: orNone(fromSpan(v)) })}
                min={0}
                />
                {designDims.mainParachuteDiameter !== undefined && (
                  <Num
                    label={`Main chute Ø (${spanU})`}
                    value={toDispSpan(edits.mainParachuteDiameter)}
                    placeholder={toDispSpan(designDims.mainParachuteDiameter)}
                    onChange={(v) => onEdit({ mainParachuteDiameter: fromSpan(v) })}
                  min={0}
                  positive
                  />
                )}
              </div>
            </fieldset>

            <fieldset className="min-w-0 border-0 p-0">
              <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Mass &amp; finish
              </legend>
              {designDims.unreachableMassObjects > 0 && (
                // 26 of the 35 corpus designs carry a mass object and 15 carry several — an av-bay, a
                // tracker, a nose weight, shear pins. The fields hold exactly one of them.
                <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                  This design has {designDims.unreachableMassObjects} other mass{" "}
                  {designDims.unreachableMassObjects === 1 ? "object" : "objects"}.{" "}
                  <em>Mass</em> and <em>Mass pos</em> describe and change {massPhrase}; to work on
                  another, pick it on the diagram or in the parts table above.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {designDims.massObjectMass !== undefined && (
                  <Num
                    label={`Mass (${massU})`}
                    value={toDispMass(edits.massObjectMass)}
                    placeholder={toDispMass(designDims.massObjectMass)}
                    onChange={(v) => onEdit({ massObjectMass: fromMass(v) })}
                    min={0}
                  />
                )}
                {designDims.massObjectStation !== undefined && (
                  <Num
                    label={`Mass pos (${spanU})`}
                    value={toDispSpan(edits.massObjectStation)}
                    placeholder={toDispSpan(designDims.massObjectStation)}
                    onChange={(v) => onEdit({ massObjectStation: fromSpan(v) })}
                    min={0}
                  />
                )}
                <Num
                  label={`Nose ballast (${massU})`}
                  value={toDispMass(edits.ballastKg)}
                  placeholder="0"
                  onChange={(v) => onEdit({ ballastKg: orNone(fromMass(v)) })}
                min={0}
                />
                {designDims.payloadStation !== undefined && (
                  <Num
                    label={`Payload (${massU})`}
                    value={toDispMass(edits.payloadMassKg)}
                    placeholder="0"
                    onChange={(v) => onEdit({ payloadMassKg: orNone(fromMass(v)) })}
                  min={0}
                  />
                )}
                {designDims.payloadStation !== undefined && (
                  <Num
                    label={`Payload pos (${spanU})`}
                    value={toDispSpan(edits.payloadStation)}
                    placeholder={toDispSpan(designDims.payloadStation)}
                    onChange={(v) => onEdit({ payloadStation: fromSpan(v) })}
                  min={0}
                  />
                )}
                {designDims.finish !== undefined && (
                  <label className="block">
                    <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Surface finish
                    </span>
                    <select
                      aria-label="Surface finish"
                      value={edits.finish ?? ""}
                      onChange={(e) => onEdit({ finish: e.target.value ? (e.target.value as SurfaceFinish) : undefined })}
                      className={`mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${TOUCH_TARGET}`}
                    >
                      <option value="">As designed ({FINISH_LABELS[designDims.finish]})</option>
                      {SURFACE_FINISHES.map((f) => (
                        <option key={f} value={f}>
                          {FINISH_LABELS[f]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {designDims.bodyDiameter !== undefined && (
                  <label className="block">
                    <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Airframe material
                    </span>
                    <select
                      aria-label="Airframe material"
                      value={edits.airframeMaterial ?? ""}
                      onChange={(e) => onEdit({ airframeMaterial: e.target.value || undefined })}
                      className={`mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${TOUCH_TARGET}`}
                    >
                      <option value="">
                        As designed{designDims.airframeMaterial ? ` (${designDims.airframeMaterial})` : ""}
                      </option>
                      {AIRFRAME_MATERIALS.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </fieldset>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Fly a different motor, add nose weight, resize the fins, nose, or body, add a boattail
            (set both a length and an exit narrower than the body), add a payload / av-bay mass (a
            position blank sits it mid-body), or switch to dual-deploy (set both a main-deploy
            altitude and a drogue diameter — the main then opens low over a drogue that controls the
            fall from apogee, cutting drift) to trim stability, drag, apogee, or landing.
            It&apos;s a hypothetical change to the design, so the {tool}{" "}
            comparison is hidden while any is set. The geometry fields start from the design&apos;s
            own dimensions; the motors offered are the bundled ones of the same casing as the one
            this design already flies — that casing demonstrably fits, which a mount&apos;s stated
            bore does not establish for every motor that would go in it.
          </p>
        </div>
  );
}

function ConditionsControls({
  units,
  edits,
  onEdit,
  flown,
  weather,
  scenario,
  setScenario,
  onWeather,
  busy,
  tool,
}: {
  units: UnitSystem;
  edits: Edits;
  onEdit: (patch: Edits) => void;
  /** The launch conditions the flight is ACTUALLY using when these fields are blank — the design's
   *  own stored setup, or the engine's defaults where it stores none. The placeholders render this,
   *  because `Num` treats a placeholder as a claim about what is being flown: it prints it verbatim
   *  as "flying X" when it refuses an entry. Hardcoded literals made that claim false — 25 of the 27
   *  corpus .ork files declare a rod length, one of them 3.048 m against a placeholder of 1.2, where
   *  rail-exit reads 26 m/s as flown and 16 m/s if the flyer types what was advertised. */
  flown: {
    rodLength: number;
    rodAngleDeg: number;
    windSpeed: number | null;
    launchAltitude: number;
    /** Which of them the DESIGN does not specify, so they are the engine's defaults rather than
     *  anything read from the file. Named on screen: a default advertised as the flyer's own setup
     *  is a claim about their file that their file never made. */
    defaulted: { rodLength: boolean; rodAngleDeg: boolean; windSpeed: boolean; launchAltitude: boolean };
  };
  /** The tool whose stored comparison a condition change hides — named by the importer. */
  tool: string;
  weather: WeatherConditions | null;
  scenario: "design" | "today";
  setScenario: (s: "design" | "today") => void;
  onWeather: (wx: WeatherConditions) => void;
  busy: boolean;
}) {
  const [place, setPlace] = useState("");
  const [wxBusy, setWxBusy] = useState(false);
  const [wxError, setWxError] = useState<string | null>(null);

  const imperial = units === "imperial";
  const lenU = imperial ? "ft" : "m";
  const spdU = imperial ? "mph" : "m/s";
  // Rendered at round-trip precision, not at a nominal one: these fields advertise the value the
  // flight is USING, and a number a flyer can type back has to mean what it says. See `fmtEditable`.
  const toDispLen = (m: number | undefined) => (m === undefined ? "" : d.fmtEditable(imperial ? mToFt(m) : m, 1));
  const toDispSpd = (mps: number | undefined) =>
    mps === undefined ? "" : d.fmtEditable(imperial ? mpsToMph(mps) : mps, imperial ? 0 : 1);
  const fromLen = (v: string) => (v === "" ? undefined : imperial ? ftToM(Number(v)) : Number(v));
  const fromSpd = (v: string) => (v === "" ? undefined : imperial ? mphToMps(Number(v)) : Number(v));

  // The fields the design leaves unspecified, in the labels the flyer is looking at — and only
  // while the greyed value is what is on screen. A field the flyer has typed into is flying THEIR
  // number, which outranks the design's setup and the engine's default both; naming it as a default
  // would credit Loft with a value the flyer chose, on the same line that exists to stop the
  // reverse. Its placeholder is not even visible, so there is nothing there to attribute.
  const defaultedNames = (
    [
      ["rodLength", "rail length", edits.rodLength],
      ["rodAngleDeg", "rail angle", edits.rodAngleDeg],
      ["windSpeed", "surface wind", edits.windSpeed],
      ["launchAltitude", "field elevation", edits.launchAltitude],
    ] as const
  )
    .filter(([k, , edit]) => flown.defaulted[k] && edit === undefined)
    .map(([, label]) => label);

  const findWeather = async () => {
    if (!place.trim()) return;
    setWxBusy(true);
    setWxError(null);
    try {
      const places = await geocode(place);
      if (places.length === 0) {
        setWxError("No matching place found.");
        return;
      }
      const p = places[0];
      const wx = await fetchConditions(p.latitude, p.longitude, [p.name, p.admin1, p.country].filter(Boolean).join(", "));
      onWeather(wx);
    } catch {
      setWxError("Couldn't fetch weather (offline, or the service is down).");
    } finally {
      setWxBusy(false);
    }
  };

  return (
    <details className="group rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40">
      <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        <span>Conditions {scenario === "today" && weather ? "· today" : "· as designed"}</span>
        <span className="text-xs text-zinc-400 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-4 border-t border-zinc-100 px-4 py-4 dark:border-zinc-800">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Num
            label={`Rail length (${lenU})`}
            value={toDispLen(edits.rodLength)}
            placeholder={toDispLen(flown.rodLength)}
            onChange={(v) => onEdit({ rodLength: fromLen(v) })}
            min={0}
            positive
            max={imperial ? 66 : 20}
            hint="How much rail guides the rocket before it flies free."
          />
          <Num
            label="Rail angle (°)"
            value={edits.rodAngleDeg ?? ""}
            placeholder={d.fmtEditable(flown.rodAngleDeg, 1)}
            onChange={(v) => onEdit({ rodAngleDeg: v === "" ? undefined : Number(v) })}
            min={0}
            max={45}
            step={1}
            hint="Tilt from vertical, 0–45°. Past that the rocket is being thrown rather than launched, and the ascent model no longer describes it."
          />
          <Num
            label={`Surface wind (${spdU})`}
            value={toDispSpd(edits.windSpeed)}
            // null means today's weather is flying a whole profile rather than one surface wind, so
            // there is no number this field could honestly advertise.
            placeholder={flown.windSpeed === null ? "today's profile" : toDispSpd(flown.windSpeed)}
            onChange={(v) => onEdit({ windSpeed: fromSpd(v) })}
            disabled={scenario === "today"}
            min={0}
            max={imperial ? 90 : 40}
            hint="Wind speed at the pad. Direction is a separate thing — a negative speed is not a wind from the other side."
          />
          <Num
            label={`Field elev. (${lenU})`}
            value={toDispLen(edits.launchAltitude)}
            placeholder={toDispLen(flown.launchAltitude)}
            onChange={(v) => onEdit({ launchAltitude: fromLen(v) })}
            disabled={scenario === "today"}
            min={imperial ? -1400 : -430}
            max={imperial ? 16400 : 5000}
            hint="Height of the launch site above sea level — from the Dead Sea to the highest field anyone drives to."
          />
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Each greyed value is what the flight is using for that field right now — the design&apos;s
          stored setup, today&apos;s weather where that is on, or Loft&apos;s own default where the
          design specifies nothing. It carries enough decimals to be typed back unchanged, so pinning
          a field to the value already in force is a no-op rather than a silent edit. With
          today&apos;s weather the wind is a profile that changes with altitude rather than one
          number, so that field says so instead of naming one. Changing any field re-flies the design
          and hides the {tool} comparison (the conditions no longer match).
        </p>
        {defaultedNames.length > 0 && (
          // Which fields are Loft's and which are theirs. Without this the caption's three sources
          // are a menu rather than an answer, and the from-scratch case — where every one of the
          // four is a default — reads exactly like a design that specified them.
          //
          // It says what LOFT READ, not what the file contains, and the difference is load-bearing:
          // RASAero and RockSim both carry a design-level launch setup that Loft's importers only
          // reach from inside a per-simulation loop, so a file with no stored simulation loses it.
          // `Three-stage rocket.CDX1` in the corpus states a 12 ft rail, 7.64° and 3,750 ft and has
          // an empty `<SimulationList/>`; a note claiming the design specifies none of them would be
          // flatly false about the file, which is worse than the silence this replaced. The reading
          // gap itself is a real bug and is in BACKLOG.md with this file named.
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Loft read no {listWords(defaultedNames)} from this design, so{" "}
            {defaultedNames.length === 1 ? "that field is" : "those are"} its own default.
          </p>
        )}

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Re-fly for today&apos;s weather
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Pulls live surface conditions and winds aloft for a launch site (Open-Meteo) so you can
            see how today&apos;s density and wind change apogee and drift. Needs a connection.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="text"
              aria-label="Launch site"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && findWeather()}
              placeholder="Launch site, e.g. Lucerne Valley, CA"
              className={`min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${TOUCH_TARGET}`}
            />
            <button
              type="button"
              onClick={findWeather}
              disabled={wxBusy || busy}
              className={`rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60 ${TOUCH_TARGET}`}
            >
              {wxBusy ? "Fetching…" : "Fetch"}
            </button>
            {weather && (
              <Segmented
                value={scenario}
                onChange={(v) => setScenario(v as "design" | "today")}
                options={[
                  { value: "design", label: "As designed" },
                  { value: "today", label: "Today" },
                ]}
                ariaLabel="Weather scenario"
                size="sm"
              />
            )}
          </div>
          {wxError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{wxError}</p>}
          {weather && (
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
              <span className="font-medium">{weather.place}</span> · {weather.tempC.toFixed(0)} °C ·{" "}
              surface wind {toDispSpd(weather.surfaceWindMps)} {spdU} ·{" "}
              {weather.aloft.length} aloft levels · field {toDispLen(weather.elevationMsl)} {lenU}
            </p>
          )}
        </div>
      </div>
    </details>
  );
}

/** A number field for a what-if. `min`/`max` are the range in which the value means something
 *  physically, not a style choice: outside it the solver still returns a number, and a confident
 *  figure computed from a rail angle of 120° or a fin count of zero is worse than no figure. The
 *  bounds reach the browser (validation, spinners, the mobile keypad) and are enforced on commit,
 *  so a typed or pasted value lands inside them and the field shows what was actually flown. */
function Num({
  label,
  value,
  placeholder,
  onChange,
  disabled,
  min,
  max,
  step,
  hint,
  positive,
}: {
  label: string;
  value: string | number;
  placeholder?: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  /** What the range means, in the flyer's words — shown as the field's tooltip. */
  hint?: string;
  /** The field describes a part that has to be THERE: a rail with length, a tube with a diameter,
   *  a fin with thickness. Zero is not a small value of any of those, and the model will not fly
   *  one — so the field refuses it in words rather than handing over a number that gets dropped
   *  somewhere the flyer cannot see. Leave it off wherever zero is a real answer: a fin sweep of
   *  zero is a straight leading edge, and a payload at station zero sits at the top of the tube. */
  positive?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // What the box shows. It is NOT simply `value`: while the field has focus the flyer owns the
  // text, so it can pass through states the model would reject ("1" on the way to "12", or "-" on
  // the way to "-3"). The moment focus leaves it goes back to what is being flown — see the effect.
  const [draft, setDraft] = useState(String(value ?? ""));
  // The entry that was refused, kept only to say so. Cleared as soon as the flyer types again.
  const [refused, setRefused] = useState<string | null>(null);
  // What that message's "flying …" named when it was written. A refusal is about ONE entry against
  // ONE value in the flight, and it has to outlive the commit that raised it — the box has already
  // resynced by then — but not outlive the flight it describes. Without this the field kept its
  // amber border, `aria-invalid` and a live `role="alert"` through "Reset to as-designed" and
  // through a unit switch, still quoting the old value in the old units, and the only way to clear
  // it was to focus that exact box and type: a state a flyer can walk into with no way back out.
  // `null` is "not latched yet"; the latched value is whatever `flown` was, which is `undefined` on
  // a field with no placeholder and nothing edited — a real state, and distinct from not-latched.
  const against = useRef<string | undefined | null>(null);

  // What the flight is actually using: the committed edit if there is one, else the design's own
  // value, which is what the placeholder shows. Naming it is the whole point of the message — the
  // complaint is not that the entry was refused, it is not knowing what is being flown instead.
  const flown = String(value ?? "") || placeholder;

  // The field must never sit there showing a number that is not the one in the flight. It could:
  // the input is controlled by `value`, and an entry the model refuses leaves `value` unchanged, so
  // React sees the same prop, never re-renders the node, and the refused text stays on screen —
  // typing -3 into Fin span left "-3" in the box while the design's own 19 mm went on being flown,
  // with nothing saying so. Re-syncing whenever the field is not focused converges on the truth
  // however the parent resolved the entry: accepted, clamped, or dropped.
  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(String(value ?? ""));
    // Latch on the render AFTER the refusal, so it records where the commit LEFT the flight rather
    // than where it found it — `commit` can call `onChange` on its way out, and React batches that
    // with `setRefused` into one render.
    if (refused === null) against.current = null;
    else if (against.current === null) against.current = flown;
    else if (against.current !== flown) setRefused(null);
  });

  /** Would this entry be refused or pulled to a bound? Then it must not reach the model even in
   *  passing.
   *
   *  Typing pushes every keystroke at the flight, and the range was applied only at the COMMIT — so
   *  between the keystroke and the blur the solver was flying a number the field itself calls
   *  impossible. Measured on the 38 mm sample: typing −5 into Rail length put "Rail-exit velocity
   *  0 m/s" on the pad-check surface, with no refusal shown, for as long as the flyer left the cursor
   *  in the box. That is the one number a pad check turns on. It also left an impossible value sitting
   *  in the edit bag, which undo could later restore as though it had been a state worth returning to.
   *
   *  Digit-by-digit entry is untouched: "1" on the way to "12" is inside the range and lands as before.
   *  What is withheld is a COMPLETE number the field would not accept — the same rule the commit path
   *  applies, asked one step earlier. The literal zero on a positive field was already withheld this
   *  way; this is that rule generalised rather than a new one. */
  const wouldNotFly = (raw: string) => {
    if (raw === "") return false;
    const n = Number(raw);
    if (!Number.isFinite(n)) return true;
    const bounded = min !== undefined && n < min ? min : max !== undefined && n > max ? max : n;
    return bounded !== n || (positive === true && bounded <= 0);
  };

  /** Commit the typed text. Returns what the model was asked for, which is not always what was
   *  typed: a value outside the range is pulled to the nearest bound rather than refused outright,
   *  because the flyer's intent ("as thin as it goes") is legible and a bound is a real answer. */
  const commit = (raw: string) => {
    if (raw === "") {
      // Blank means "use the design's own value", never zero.
      setRefused(null);
      onChange("");
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setRefused(raw);
      return;
    }
    const bounded = min !== undefined && n < min ? min : max !== undefined && n > max ? max : n;
    // Zero on a field that needs a part to be there is REFUSED, not pulled to a bound — there is no
    // nearest legal value to pull it to, and the model would take it and drop it. Dropping it is
    // what the flyer never sees: entering 0 for the rail length used to fly a rail no rocket ever
    // leaves and print "Rail-exit velocity 0 m/s" beside it, which is the one number a pad check
    // turns on. Refusing it says which value is actually in the flight instead.
    if (positive && bounded === 0) {
      setRefused(raw);
      // Nothing to undo at the model: `wouldNotFly` withheld this entry at the keystroke, so it never
      // reached the flight and there is nothing of it to blank. Blanking anyway is what the earlier
      // version had to do — a negative DID reach the model then — and doing it now would throw away a
      // good edit the flyer made earlier and typed over: a committed 25 mm fin span, one "-3" and a
      // Tab, and the 25 would be gone with only the global reset to bring anything back. The box
      // re-syncs to what is flown on its own; the message above says which value that is.
      return;
    }
    setRefused(bounded !== n ? raw : null);
    if (String(bounded) !== raw) onChange(String(bounded));
  };

  // A bound the field doesn't have is said in words, not left as a dash. Most of these fields are
  // floored at zero and open above — a dimension has no upper limit the editor can name — and
  // "0 to –" reads as a range that failed to load rather than as "no maximum". Shared with the
  // analysis panels' number field so the two never say it differently.
  const ranged = rangeWords(min, max, positive);
  const msgId = `${label.replace(/[^a-z]+/gi, "-").toLowerCase()}-refused`;

  return (
    <label className="block" title={hint ?? (ranged ? `${label}: ${ranged}` : undefined)}>
      <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        ref={ref}
        type="number"
        inputMode="decimal"
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        aria-invalid={refused !== null || undefined}
        aria-describedby={refused !== null ? msgId : undefined}
        // Typing is left alone so a value can be entered digit by digit ("1" on the way to "12");
        // the range is applied when the field is committed — blurred, or Enter pressed.
        onChange={(e) => {
          setDraft(e.target.value);
          setRefused(null);
          // A value this field would not accept never reaches the flight, not even in passing. This
          // fires on every keystroke, so without it "0" on the way to "0.5" reaches the model — and a
          // zero that lands counts as an edit, which is enough on its own to withhold the stored-tool
          // comparison for a change that changed nothing — while a typed −5 flew a rail no rocket
          // leaves and printed 0 m/s beside it. The commit path below says so in words.
          if (wouldNotFly(e.target.value)) return;
          onChange(e.target.value);
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          commit(e.currentTarget.value);
        }}
        // A what-if field is the control a flyer uses most, and the stated phone use is a pad check
        // with gloves on: 34 px was under the project's own 44 px touch minimum. Released back to
        // the design's density on a pointer layout, like every other target here.
        className={`mt-1 w-full rounded-md border bg-white px-2.5 py-1.5 font-mono text-sm text-zinc-800 outline-none disabled:opacity-50 dark:bg-zinc-900 dark:text-zinc-100 ${TOUCH_TARGET} ${
          refused !== null
            ? "border-amber-500 focus:border-amber-500 dark:border-amber-500"
            : "border-zinc-300 focus:border-indigo-400 dark:border-zinc-700"
        }`}
      />
      {refused !== null && (
        <span id={msgId} role="alert" className="mt-1 block text-[11px] text-amber-700 dark:text-amber-400">
          {refusedMessage(refused, ranged, flown)}
        </span>
      )}
    </label>
  );
}
