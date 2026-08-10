"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ImportPanel from "./ImportPanel";
import ResultsView from "./ResultsView";
import { workspaceFromPath, workspacePath, type Workspace } from "@/lib/workspaces";
import { KIND_LABEL } from "./GeometryInspector";
import { Button, Card, ErrorState, NumberField, Segmented, Select } from "./ui";
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
  AIM_SLOTS,
  aimEditsAt,
  moveTarget,
  moveSlots,
  structureOf,
  primaryTransition,
  primaryTransitionPart,
  unreachableTransitionCount,
  primaryInternalPart,
  primaryInternalPartAim,
  internalPartBounds,
  primaryFitting,
  primaryFittingAim,
  unreachableFittingCount,
  fittingHasDrag,
  unreachableInternalCount,
  internalSpanLabel,
  INTERNAL_MAX_BORE_FRACTION,
  primaryMassObject,
  primaryMassObjectPart,
  primaryMassObjectStation,
  unreachableMassObjectCount,
  transitionDefaults,
  authoredTransitionName,
  removalRefusal,
  newPartId,
  type AddedPart,
  type MovedPart,
  type GeometryEdits,
  aimsClearedByRemoving,
  aimsClearedByAiming,
  isEditedValue,
  type AimedPart,
  primaryFinCount,
  primaryFinStation,
  primaryMotorClusterCount,
  unreachableMountCount,
  primaryMountGroupIds,
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
  fittingMaxOuterDiameter,
  fittingUnitMass,
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
  canAddStage,
  canAddMount,
  stageSeedBase,
  addedStageIds,
  type AddedStage,
  type MountAdd,
  type PickedBodyTube,
  type PickedNoseCone,
  type PickedParachute,
  type PickedRing,
} from "@/lib/model/edit";
import PartPicker from "./PartPicker";
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
import type { Material, SurfaceFinish, NoseShape, FinCrossSection, CdProvenance, MassProvenance } from "@/lib/model/types";
import type { CatalogPart } from "@/lib/components/db";
import { designMotorIdentity, swapOptions, swapStillOffered, type SwapOption,
  bakeMotorSwap,
} from "@/lib/motors/swap";
import { defaultConditions, type ConditionOverrides } from "@/lib/sim/setup";
import { massByComponent, statedMassHolder, statesOwnAssemblyMass } from "@/lib/sim/mass";
import { fetchConditions, geocode, type WeatherConditions } from "@/lib/weather";
import {
  clearDiscardedSession,
  clearSession,
  forgetRecent,
  fromBase64,
  loadDiscardedSession,
  loadRecents,
  MAX_RECENTS,
  MAX_RECENTS_MB,
  loadSession,
  rememberRecent,
  replaceRecent,
  restoreRecent,
  carriesWork,
  saveDiscardedSession,
  saveSession,
  type SavedSession,
  toBase64,
  type RecentDesign,
  type RemovedRecent,
} from "@/lib/session";
import { mToFt, ftToM, mpsToMph, mphToMps, radToDeg } from "@/lib/units";
import { TOUCH_TARGET } from "@/lib/ui-tokens";
import { listWords } from "@/lib/what-if";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";

/** Friendly labels for the surface-finish picker (smoothest → roughest). */
/** The free-text-input treatment, until a `TextField` primitive owns it.
 *
 *  Named rather than inlined so the next conversion can find it. This exact string was silently
 *  shared with the file's `<select>` elements, and converting those to the `Select` primitive
 *  stripped it off this field along with them — the phone suite's hit-target scan caught the result
 *  at 218x24 px against §8's 44 px minimum, which is what that scan is for. */
const TREAT_INPUT =
  "rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

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
  tubecoupler: "adding a coupler",
  centeringring: "adding a centering ring",
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
  /** Which piece of internal structure the internal fields describe and edit — a coupler, a centring
   *  ring, a bulkhead, an engine block or an inner tube. A selection, not an edit — as above. */
  internalId?: string;
  /** Which external fitting the fitting fields describe — a shock cord, a launch lug, a rail button.
   *  A selection, not an edit — as above. */
  fittingId?: string;
  /** Components removed from the design, oldest first. An ordered list, so undo is dropping the last. */
  removedIds?: string[];
  /** Parts the flyer authored, oldest first — see `AddedPart` in the edit model. */
  added?: AddedPart[];
  /** Top-level parts the flyer has re-ordered, oldest first — see `MovedPart` in the edit model.
   *
   *  This interface is a hand-restated duplicate of `GeometryEdits` rather than an extension of it, so a
   *  new operation has to be added in BOTH places and the type system will not catch the omission:
   *  `applyEdit` spreads patches structurally, so a `moved` the app never declared would be carried into
   *  the bag and silently dropped by every consumer typed on this interface. */
  moved?: MovedPart[];
  /** Booster stages the flyer has authored — see `AddedStage` in the edit model. */
  addedStages?: AddedStage[];
  /** Motor mounts authored onto tubes that had none — see `MountAdd`. */
  mountAdds?: MountAdd[];
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
  noseMass?: number; // builder edit: what the nose cone weighs, as the flyer weighed it (kg)
  bodyLength?: number; // builder edit: the picked body tube's length (m)
  bodyTubeMass?: number; // builder edit: what the picked tube weighs, as the flyer weighed it (kg)
  bodyDiameter?: number; // builder edit: the picked tube's outer diameter (m); scales the airframe to it
  catalogBodyTube?: PickedBodyTube; // builder edit: which catalogued part the two above came from
  catalogNoseCone?: PickedNoseCone; // builder edit: the published cone the nose fields came from
  catalogParachute?: PickedParachute; // builder edit: the published canopy the recovery fields came from
  transitionLength?: number; // builder edit: the picked transition's length (m)
  transitionAftDiameter?: number; // builder edit: the picked transition's exit diameter (m)
  internalLength?: number; // builder edit: the picked internal part's length / plate thickness (m)
  internalOuterDiameter?: number; // builder edit: the picked internal part's outer diameter (m)
  internalInnerDiameter?: number; // builder edit: the picked internal part's bore (m)
  internalMass?: number; // builder edit: the picked internal part's mass, as the flyer weighed it (kg)
  fittingMass?: number; // builder edit: the picked fitting's mass (kg)
  fittingLength?: number; // builder edit: the picked fitting's length (m)
  fittingDiameter?: number; // builder edit: the picked fitting's outer diameter (m)
  fittingCount?: number; // builder edit: how many of the picked fitting are on the airframe
  massObjectMass?: number; // builder edit: the picked mass object's weight (kg)
  massObjectStation?: number; // builder edit: where it sits (m from the nose tip)
  finish?: SurfaceFinish; // builder edit: whole-airframe surface finish
  airframeMaterial?: string; // builder edit: airframe-shell material key (AIRFRAME_MATERIALS)
  boattailLength?: number; // builder edit: add a conical boattail of this length (m) at the aft
  boattailAftDiameter?: number; // builder edit: the added boattail's exit diameter (m)
  mainDeployAltitude?: number; // builder edit: dual-deploy — main deploys at this altitude AGL (m)
  drogueDiameter?: number; // builder edit: dual-deploy — drogue diameter (m) added at apogee
  mainParachuteDiameter?: number; // builder edit: resize the main (largest) parachute (m)
  parachuteCd?: number; // builder edit: the aimed canopy's drag coefficient
  parachuteMass?: number; // builder edit: the aimed canopy's mass, as the flyer weighed it
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
  const { casingMm: diaMm, manufacturer: designManufacturer, resolves } = designMotorIdentity(motor);
  if (!(diaMm > 0)) return null;
  return {
    designMotor: motor.designation,
    designManufacturer,
    designMotorFlies: resolves,
    casingMm: diaMm,
    options: swapOptions(diaMm),
  };
}

/** Same-diameter bundled motors the design could fly, with the design's own motor as the default.
 *  Built once per design/config so the picker offers a fitting alternative without editing the file. */
interface SwapInfo {
  designMotor: string;
  /** The design motor's manufacturer as the catalog spells it, set only when the motor matched
   *  exactly — what tells an Estes C6 from a Quest C6 when the sweep marks the design's own row. */
  designManufacturer?: string;
  /** Whether the design's own motor resolves to a bundled curve — i.e. whether this design flies at
   *  all. The copy describing the offered list claims a casing "this design already flies", which is
   *  false on a design whose motor was never matched. */
  designMotorFlies: boolean;
  /** The casing THIS DESIGN's mount takes, which is what the offered list must be labelled with.
   *  Not `options[0]`: `swapOptions` merges the catalogue's 75 and 76 mm motors into one class (see
   *  `sameCasing`), and the list is sorted by impulse, so the first row's own figure can name a
   *  diameter the design does not have. */
  casingMm: number;
  options: SwapOption[];
}

export default function LoftApp({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  /** The workspace the ADDRESS names, or null at the import screen. This is the single source of
   *  truth for which workspace is open: it was a `useState` synced to a URL fragment until each
   *  workspace became a route of its own, and two mechanisms for one fact is how the fragment and
   *  the panel got to disagree in the first place. */
  const workspace = workspaceFromPath(pathname);
  const [units, setUnits] = useState<UnitSystem>("metric");
  const [doc, setDoc] = useState<OrkDocument | null>(null);
  const [fileName, setFileName] = useState<string>("");
  /** The session the last "Import another" / "Start fresh" threw away, offered back on the import
   *  screen. Read on mount rather than during render: localStorage is client-only and the first
   *  render has to match the server's. */
  const [discarded, setDiscarded] = useState<SavedSession | null>(null);
  /** Designs taken off the shelf since the last load, newest first, held in memory so each can be put
   *  back. The shelf's "×" was the last destructive act in the app with no way out: one tap deleted a
   *  design's only stored bytes, with no confirmation, no undo, and it survived a reload — and the
   *  shelf exists precisely because at the pad the file may not be on the phone at all.
   *
   *  A LIST rather than one pending row, because holding only the latest meant a second removal
   *  silently destroyed the first design's way back, and two removals in a row is the natural
   *  sequence after a mis-tap. Nothing is written for these: the row is already out of storage, and
   *  what is held here is the copy that puts it back, with the position it came from and any reason
   *  a restore could not be made. */
  const [removedRecents, setRemovedRecents] = useState<RemovedRecent[]>([]);
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
  /** Whether the stored session has been looked for yet. A workspace route deep-linked into a cold
   *  tab has no design for a beat while the saved bytes are re-imported, and "no design" is also
   *  what an empty storage looks like — so the two have to be told apart before the address is
   *  corrected, or a legitimate resume gets bounced to the import screen mid-restore. */
  const [sessionChecked, setSessionChecked] = useState(false);
  /** The last workspace the flyer was actually ON, which is not always the one the address names.
   *
   *  The root is the front door, and a flyer with a design open can reach it — the wordmark in the
   *  header is a link home. `workspace` is null there, so anything reading it as "where I left off"
   *  writes `flight` over the truth: tap the wordmark from a workspace, reload, and the session comes
   *  back on Flight. A ref rather than state because nothing renders from it. */
  const lastWorkspace = useRef<Workspace>("flight");
  /** The loaded design's own bytes, kept so the session can be written back verbatim — the file
   *  the flyer imported, not a re-serialisation of it, so its stored results survive a reload. */
  const designBytes = useRef<string | null>(null);
  /** The shelf row standing for the design that is open, and everything needed to bring it up to
   *  date. `designBytes` is the design as it was OPENED — for a from-scratch build that is the
   *  factory starter, written before the first keystroke — so the row goes stale the moment the
   *  flyer changes anything. Held in refs rather than closed over: `loadDoc` is memoised on
   *  `compute` alone, and a stale closure here would re-shelve a design that is no longer open. */
  const shelfRowId = useRef<string | null>(null);
  /** Whether the open design was BUILT here rather than imported. Only a build's shelf row may be
   *  rewritten, and only a build's motor swap is baked into its export: for an imported file the bytes
   *  are the flyer's own and a swap on top is a hypothesis, which is what the shelf's caveat says.
   *
   *  Held BOTH ways on purpose. The callbacks (`syncShelfRow`, `downloadOrk`) run outside render and
   *  want the ref, which is always current. The download notice is rendered, and a ref read during
   *  render does not re-render when it changes — so that path reads state. Setting one without the
   *  other is the bug this comment exists to prevent. */
  const builtHere = useRef(false);
  const [builtHereNow, setBuiltHereNow] = useState(false);
  const liveDesign = useRef<{ doc: OrkDocument | null; edits: Edits; name: string }>({
    doc: null,
    edits: {},
    name: "",
  });
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

  /** Bring the open design's shelf row up to date before it stops being the open design.
   *
   *  The shelf writes its row at LOAD time, from the bytes the design arrived with. That is right for
   *  an imported file — the file IS the design, and what-ifs on top of it are hypotheses. It is wrong
   *  for a from-scratch build, where there is no file and the edits ARE the rocket: the row was
   *  written from the factory starter before the first keystroke and never refreshed, so reopening it
   *  handed back the starter and the build was gone with no way back.
   *
   *  Re-serialised exactly the way `downloadOrk` does, so the design a flyer reopens and the design a
   *  flyer downloads are the same rocket. Called wherever the open design is about to be replaced or
   *  cleared, which is the last moment its row can still be made true. */
  // The live design, mirrored into a ref so `syncShelfRow` can read it from inside callbacks that are
  // memoised on other things. A ref rather than state because nothing renders from it.
  useEffect(() => {
    liveDesign.current = { doc, edits, name: fileName };
  }, [doc, edits, fileName]);

  const syncShelfRow = useCallback(() => {
    const id = shelfRowId.current;
    const { doc: liveDoc, edits: liveEdits, name } = liveDesign.current;
    if (!id || !liveDoc || !builtHere.current) return;
    const geometry = geometryOf(liveEdits);
    const rocket = hasGeometryEdits(geometry) ? applyGeometryEdits(liveDoc.rocket, geometry) : liveDoc.rocket;
    let next: string;
    try {
      // Same rule as `downloadOrk`, so the design a flyer reopens off the shelf and the design they
      // download are byte-identical — this row is compared against that export.
      next = toBase64(exportOrk({ ...liveDoc, rocket }, { storedResultsDescribeThisRocket: rocket === liveDoc.rocket }));
    } catch {
      // Serialising is best effort: a shelf row that cannot be refreshed must never take the design
      // that is open down with it.
      return;
    }
    // Nothing to say if the bytes did not move. Note this comparison is only meaningful because the
    // guard above restricts us to designs Loft itself serialised: an IMPORTED file's bytes are the
    // flyer's own and `exportOrk` never reproduces them byte for byte, so this test would have fired
    // on every untouched import and replaced their rows with Loft's re-export. The full gate caught
    // exactly that — it broke the shelf's put-it-back offer, which matches rows by id.
    if (next === designBytes.current) return;
    designBytes.current = next;
    setRecents(replaceRecent(id, { design: next, name, rocket: rocket.name || name }, Date.now()));
    shelfRowId.current = null;
  }, []);

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
      // The design being replaced is about to stop being the open one — its shelf row's last chance
      // to become true. Runs before any state is touched.
      syncShelfRow();
      // Cleared for every load; `onNew` sets it back immediately after, which is the only path that
      // produces a design with no file behind it.
      builtHere.current = false;
      setBuiltHereNow(false);
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
      setError(null);
      setRestored(resume !== undefined);
      if (bytes) designBytes.current = toBase64(bytes);
      // Every design that gets opened joins the shelf, so history builds itself rather than asking
      // the flyer to curate it. A resumed session is already the newest entry; re-recording it
      // would only rewrite its timestamp.
      if (bytes && !resume) {
        const shelf = rememberRecent(
          { design: designBytes.current!, name, rocket: document.rocket.name || name },
          Date.now(),
        );
        // Remember WHICH row stands for this design, so `syncShelfRow` can replace that row rather
        // than leaving it beside a second one under a different byte length.
        shelfRowId.current = shelf[0]?.id ?? null;
        setRecents(shelf);
        // An offer to put back a design that is now ON the shelf is spent — it came back by another
        // route. Dropping only those, rather than clearing every offer on every load, is what keeps
        // the undo alive across the most natural next tap after a mis-tap: reopening a DIFFERENT
        // design. The earlier version cleared the lot here, and the removed design became
        // unrecoverable one click later. It is safe to keep the rest because `restoreRecent` refuses
        // rather than evicting and never overwrites a live row, so a stale offer can only be refused.
        const onShelf = new Set(shelf.map((r) => r.id));
        setRemovedRecents((prev) => prev.filter((r) => !onShelf.has(r.entry.id)));
      }
      try {
        const { run: r, baseline: b } = compute(restored, e, null, "design", idx);
        setRun(r);
        setBaseline(b);
        const landing = !r.hasPropulsion && opensOn === "flight" ? "design" : opensOn;
        // Recorded BEFORE the navigation, not after it lands. `setDoc` above commits in this tick
        // and the route change arrives in a later one, so there is a render where a design is open
        // and the address still says `/` — and the session-save effect runs in it. Reading the
        // address there wrote `flight` over the workspace this load is on its way to, so a resumed
        // session came back on the wrong one. The ref is the load's own intent, which is knowable
        // now; the address is the same fact arriving late.
        lastWorkspace.current = landing;
        // Take the flyer to the workspace this load means to open on. An import leads with its
        // flight (the payoff) and a fresh build with the editor; a resumed session goes back where
        // it was left. A design whose motor didn't resolve has no flight to lead with, so it opens
        // on Design instead — the workspace holding the geometry it can still be checked against
        // and the motor swap that fixes it. Only the LANDING is corrected: a flyer who then asks
        // for Flight gets Flight, which says why it is empty rather than bouncing them back.
        //
        // `replace`, not `push`: this is where the load lands, not a step the Back button should
        // have to undo on the way out of the design.
        router.replace(workspacePath(landing));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not simulate this design.");
        setRun(null);
        setBaseline(null);
        // A design that cannot be flown has no workspaces at all: the results view is what renders
        // them, and it needs a run. The error card and the design's own chrome are on the root, so
        // that is where the address should say the flyer is — naming a workspace that has nothing
        // behind it is the same lie in the other direction.
        router.replace("/");
      }
    },
    [compute, syncShelfRow, router],
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
        // **A failed fetch is not an empty file, and saying so blamed the flyer.** The service
        // worker answers an uncached request offline with a synthetic 504, whose body is empty — so
        // without this check the bytes were a 0-length array, the importer took its empty-file
        // branch, and the screen read "That file is empty. Pick the design file your tool saved."
        // to somebody who had picked nothing and had no signal. The recovery it advised was
        // impossible and the real cause was invisible. Bundled samples ship with the app, so the
        // only way one is unreachable is the network.
        if (!res.ok) {
          throw new Error(
            navigator.onLine
              ? `That sample could not be loaded (${res.status}). It ships with Loft, so this is usually temporary — try again, or import a design file of your own.`
              : "That sample has not been saved for offline use yet. Open it once with a connection and it will be there next time; a design file from your device works offline either way.",
          );
        }
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

  /** Take a design off the shelf, holding on to it so the flyer can put it back. */
  const onForgetRecent = useCallback((id: string) => {
    // Read the row AND its position before removing it: what goes back has to be the stored entry
    // itself — its bytes, its name, its rename — and the index puts it back where it was among rows
    // that share a timestamp, which the sort alone cannot do.
    const before = loadRecents();
    const index = before.findIndex((r) => r.id === id);
    const entry = index >= 0 ? before[index] : undefined;
    setRecents(forgetRecent(id));
    // No entry means storage went away underneath us (cleared in another tab, or turned off
    // mid-session). Removing with no offer is the exact no-way-back this exists to close, so say so
    // rather than letting the row vanish quietly.
    if (!entry) {
      setError("That design could not be read back before it was removed, so there is nothing to put back.");
      return;
    }
    setRemovedRecents((prev) => [{ entry, index }, ...prev.filter((r) => r.entry.id !== entry.id)]);
  }, []);

  /** Put one back.
   *
   *  `restoreRecent` never evicts and never overwrites to make room — it refuses — so a refusal means
   *  the shelf genuinely has no space for this design any more. The reason goes NEXT TO THE BUTTON
   *  rather than into the page's shared error strip, which renders below the whole import fragment:
   *  a control whose only feedback is a sentence a screen away is a control that silently does
   *  nothing, which is the failure this whole change exists to remove.
   *
   *  Deliberately NOT written inside a `setRemovedRecents` updater. A state updater must be pure —
   *  it can be called twice — and this one writes to `localStorage` and sets two other pieces of
   *  state. */
  const onRestoreRecent = useCallback(
    (id: string) => {
      const held = removedRecents.find((r) => r.entry.id === id);
      if (!held) return;
      const list = restoreRecent(held.entry, held.index);
      if (!list) {
        setRemovedRecents((prev) =>
          prev.map((r) =>
            r.entry.id === id
              ? {
                  ...r,
                  refusal:
                    `The shelf is full — it holds ${MAX_RECENTS} designs and ${MAX_RECENTS_MB} MB, and it ` +
                    "filled up while this one was off it. Remove another design and press this again.",
                }
              : r,
          ),
        );
        return;
      }
      setRecents(list);
      setRemovedRecents((prev) => prev.filter((r) => r.entry.id !== id));
    },
    [removedRecents],
  );

  // Start a fresh design from scratch — the builder path. A starter model (not parsed from any
  // file) enters the exact same pipeline an import does, so every edit, sweep, and flight works on
  // it immediately; the flyer tweaks a real, stable flight rather than staring at a blank slate.
  const onNew = useCallback(() => {
    // A built design has no file behind it, so it is serialised through the same .ork writer the
    // download uses — one representation for saving, sharing, and remembering.
    const document = newDesign();
    loadDoc(document, "New design", "design", exportOrk(document));
    builtHere.current = true;
    setBuiltHereNow(true);
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
  /** What "Download .ork" will leave out of the file, named with its values, or "" when it carries
   *  everything on screen.
   *
   *  The motor is the one that mattered: it is baked in for a design built here, and deliberately not
   *  for an imported one, where a swap is a hypothesis against the flyer's own file. Ballast and a
   *  resized canopy are left out on both paths and cannot currently be otherwise — nose ballast is a
   *  runtime point mass rather than a component, so there is nothing in the model for the exporter to
   *  write. The FAQ has always said this; it said it two navigations away from this button, which is
   *  not where a flyer needs to be told. */
  const downloadOmits = useCallback((): string => {
    const out: string[] = [];
    if (edits.motorSwap && !builtHereNow) out.push(`the ${edits.motorSwap.designation} swap`);
    if (edits.ballastKg) out.push(`${Math.round(edits.ballastKg * 1000)} g of nose ballast`);
    if (edits.recoveryCdScale && edits.recoveryCdScale !== 1) out.push("the resized canopy");
    if (!out.length) return "";
    const list = out.length === 1 ? out[0] : `${out.slice(0, -1).join(", ")} and ${out[out.length - 1]}`;
    return `Saves the airframe. ${list.charAt(0).toUpperCase()}${list.slice(1)} ${out.length === 1 ? "is" : "are"} not part of the design, so ${out.length === 1 ? "it is" : "they are"} not saved.`;
  }, [edits, builtHereNow]);

  const downloadOrk = useCallback(() => {
    if (!doc) return;
    // Bake in the builder's structural (geometry) edits so the saved airframe matches what's shown.
    const geometry = geometryOf(edits);
    let rocket = hasGeometryEdits(geometry) ? applyGeometryEdits(doc.rocket, geometry) : doc.rocket;
    // The motor is baked in too, but ONLY for a design built here — and that distinction is the whole
    // of it. On an imported file a swap is genuinely a hypothesis against a real design, and writing
    // it into the export would make the saved file disagree with the file the flyer brought. On the
    // builder path there is no such file: "Swap motor" is the only motor control in the app, so for a
    // build that dropdown IS the motor picker, and leaving it out saved a rocket nobody designed.
    //
    // Measured on the starter across all 15 swaps the picker offers: 7 of them put the saved file more
    // than 100% away from the screen, and the worst is the dangerous direction — an E16 reads 67.6 m
    // on screen while the file it wrote flies 993.6 m, +1369%, with the margin quietly moving too.
    // The format carries it perfectly once it is written: baked in and re-imported, an E16 flies
    // 67.6 m again.
    if (builtHere.current) rocket = bakeMotorSwap(rocket, edits.motorSwap);
    // **The stored results ride along only when nothing here has changed the airframe.** They are the
    // ORIGINATING tool's simulation of the design as its author drew it, and they are what the
    // Cross-check page compares Loft against — so carrying them onto an edited rocket would have that
    // page report the effect of the flyer's own what-if as Loft's error. The launch CONDITIONS are
    // written either way: a rail length and a wind speed are not results, and dropping them is the
    // Sev-1 this whole block exists to fix (drift from pad 630 m to 0 m on a re-import, silently).
    const bytes = exportOrk({ ...doc, rocket }, { storedResultsDescribeThisRocket: rocket === doc.rocket });
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
    (w: WhatIf): boolean => {
      if (!doc) return false;
      try {
        const { run: r, baseline: b } = compute(doc, w.edits, w.weather, w.scenario, w.simIndex);
        setRun(r);
        setBaseline(b);
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not simulate.");
        return false;
      }
    },
    [doc, compute],
  );

  /** Move to a what-if state, but ONLY if it can actually be flown — and answer whether it happened.
   *
   *  **A refused change must leave nothing behind, and this is the reason the whole path is shaped
   *  this way.** The state used to be committed and the flight attempted afterwards, so a solver
   *  throw set `error` and returned — while `setEdits` had already landed. The design panel then
   *  redrew the new airframe with every flight number still the PREVIOUS run's, under an error
   *  message that said nothing about the numbers being stale. Reproduced on the 38 mm sample: typing
   *  2001 into Body diameter (mm) trips `MAX_REF_RADIUS` in `lib/sim/simulate.ts`, and the grid went
   *  on reading 992.8 m and 4.07 cal for a rocket two metres across. A confident apogee, static
   *  margin and landing energy for a rocket that is not the one on screen.
   *
   *  **Clearing the run instead would have been worse, and that is not obvious until you look.**
   *  The load path does exactly that (`setRun(null)` beside its own `setError`), so matching it looks
   *  like the consistent fix — but `DesignEditor` renders INSIDE `{run && …}`, so blanking the run
   *  deletes the very field the flyer would use to correct the value. That trades a wrong number for
   *  a state with no way out of it, which `MAINTAINING.md` ranks as the worse of the two.
   *
   *  So the change is simply refused, which is the idiom `NumberField` already uses for a value that
   *  cannot fly: the design on screen and the numbers beside it stay the last pair that agreed. It
   *  also makes the invariant self-reinforcing — an unflyable state can never enter the history, so
   *  undo and redo can only ever restore states that flew once already. */
  const applyWhatIfState = (w: WhatIf): boolean => {
    if (!fly(w)) return false;
    setEdits(w.edits);
    setWeather(w.weather);
    setScenario(w.scenario);
    setSimIndex(w.simIndex);
    return true;
  };

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
    // The flight comes FIRST, and nothing below runs if it throws — see `applyWhatIfState`. A change
    // that cannot be flown must not reach the history either: an undo step that restores a state the
    // solver refuses is a step the flyer can never come back through.
    if (!applyWhatIfState(next)) return;
    if (action && movedWhatIf(before, next)) {
      setHistory((h) => commitHistory(h, before, action.label, action.key, Date.now()));
    } else {
      // A change that records nothing still ENDS the gesture before it. Without this a pick recorded
      // nothing AND closed nothing, so a span dragged on one fin set, a pick of another, and a span
      // dragged on that one all shared the key `finSpan` inside the window and merged into a single
      // step — one undo took back both gestures and re-aimed the fields at the first part.
      setHistory(endRun);
    }
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
    // The WHOLE bag, not a hand-picked three fields: `structureOf` names the structural keys itself,
    // and a call site that restates them goes silently out of date the next time one is added.
    () => (doc ? structureOf(doc.rocket, edits) : null),
    // The whole bag is the dependency too, for the same reason it is the argument. This tree is what
    // `moveTarget` and `movePart` resolve an anchor against, so a dep list that named three fields and
    // missed `moved` computed the SECOND nudge's anchor from the order before the first one — and the
    // next key added would have repeated it. Naming `edits` cannot go out of date. (The lint rule
    // caught the `moved` case; the e2e did not, because it walks one move.)
    [doc, edits],
  );

  /** The design a booster is seeded FROM, which is NOT `removableFrom`. `applyAddedStages` runs first in
   *  the pipeline, on the pristine rocket plus the stages already authored — an added tube, a removal or
   *  a reorder is invisible to it. Asking `canAddStage` the fully-structured tree instead disagrees with
   *  the operation in 123 states across the corpus, both ways; `stageSeedBase` carries the measurements.
   *  Memoised like its three siblings below: `canAddStage` runs `buildStage`, which flattens the rocket
   *  and deep-clones the aft tube's subtree, and this is read on every render. */
  const stageBase = useMemo(() => (doc ? stageSeedBase(doc.rocket, edits) : null), [doc, edits]);

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

  /** Add a booster stage below everything already in the stack, and take it away again.
   *
   *  The stage carries no components of its own in the edit bag: what a booster is made of is decided at
   *  every apply from the design as it then stands, which is what makes replaying the bag the whole of
   *  undo. `applyAddedStages` seeds it from the design's own aft tube — that tube, its motor mount and
   *  its fins, and nothing else — and puts a motor in every configuration, without which the stage never
   *  lights, never drops, and costs the design 37.5% of its apogee in silence.
   *
   *  Removal is dropping the entry, not a `removedIds` list of its parts: the stage exists only in the
   *  bag, so there is nothing in the pristine design to mark as gone. The aims are cleared the same way a
   *  component removal clears them, because an absolute dimension still aimed at a part inside the
   *  booster re-lands on whatever the role fallback resolves to once the booster is gone. */
  const addStage = () => {
    if (!doc || !removableFrom) return;
    const n = (edits.addedStages?.length ?? 0) + 1;
    const name = n === 1 ? "Booster" : `Booster ${n}`;
    const seedId = newPartId(removableFrom, edits.added, `stage:${n}`);
    const mountId = newPartId(removableFrom, [...(edits.added ?? []), { id: seedId } as AddedPart], `mount:${n}`);
    applyEdit(
      { addedStages: [...(edits.addedStages ?? []), { seedId, mountId, name }] },
      { label: `adding ${name}`, key: `addstage:${seedId}` },
    );
  };

  /** Give a tube a motor mount, and take it back off again.
   *
   *  A mount is a FIELD, not a component, so unlike every other authoring gesture there is no part to
   *  mint an id for — the entry names its HOST and nothing else, which is also how `lib/sim/setup.ts`
   *  and `lib/ork/export.ts` already key a mount. Removal is dropping the entry, exactly as for a
   *  stage: the mount exists only in the bag, so there is nothing in the pristine design to mark gone.
   *
   *  Nothing to clear on removal, and that is a property of the operation rather than an omission: the
   *  mount adds no component, so no aim can be pointing INTO it. The motor instance it wrote goes with
   *  it because the whole thing is replayed from the pristine design on every apply. */
  const addMount = (hostId: string) => {
    if (!doc || !removableFrom) return;
    if ((edits.mountAdds ?? []).some((m) => m.hostId === hostId)) return;
    const host = flattenRocket(removableFrom).find((p) => p.component.id === hostId)?.component;
    applyEdit(
      { mountAdds: [...(edits.mountAdds ?? []), { hostId }] },
      { label: `adding a motor mount to ${host?.name || "a tube"}`, key: `addmount:${hostId}` },
    );
  };

  const removeMount = (hostId: string) => {
    if (!doc) return;
    if (!(edits.mountAdds ?? []).some((m) => m.hostId === hostId)) return;
    const host = flattenRocket(removableFrom ?? doc.rocket).find((p) => p.component.id === hostId)?.component;
    applyEdit(
      { mountAdds: (edits.mountAdds ?? []).filter((m) => m.hostId !== hostId) },
      { label: `removing the motor mount on ${host?.name || "a tube"}`, key: `rmmount:${hostId}` },
    );
  };

  const removeStage = (seedId: string) => {
    if (!doc || !removableFrom) return;
    const entry = edits.addedStages?.find((s) => s.seedId === seedId);
    if (!entry) return;
    // What the stage accounts for — every id, not a walk down from the seed. `addedStageIds` carries the
    // reasoning and the measurements; the two things it buys are that a DELETED seed does not hide the
    // rest of the stage, and that a part of the stage the flyer already removed is still counted.
    const gone = addedStageIds(doc.rocket, edits, seedId);
    // Every aim pointing into the stage, cleared in the same commit. An absolute dimension still aimed
    // at a part inside the booster does not stop applying when the booster goes: it falls back to the
    // design's primary part and lands there instead. On the starter that took the SUSTAINER's 620 mm
    // tube to 400 mm — apogee 993.642 to 1105.598 m, with the field still reading 400.
    let cleared: Edits = edits;
    for (const id of gone) cleared = { ...cleared, ...aimsClearedByRemoving(removableFrom, cleared, id) };
    // And EVERY list that names one of those parts goes with the stage — not just `added`. An entry
    // left behind is a live what-if for a component that is nowhere: the design still reads as edited,
    // so it withholds the file's own stored-results comparison. `removedIds` is the one that also
    // changes a flight — see `addedStageIds` for the two clicks that otherwise hand a flyer a booster
    // born with its own motor mount already deleted.
    applyEdit(
      {
        ...cleared,
        added: (edits.added ?? []).filter((a) => !gone.has(a.id)),
        removedIds: (edits.removedIds ?? []).filter((id) => !gone.has(id)),
        moved: (edits.moved ?? []).filter((m) => !gone.has(m.id) && !(m.after !== null && m.after !== undefined && gone.has(m.after))),
        addedStages: (edits.addedStages ?? []).filter((s) => s.seedId !== seedId),
      },
      { label: `removing ${entry.name}`, key: `rmstage:${seedId}` },
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
    } else if (kind === "tubecoupler" || kind === "centeringring") {
      // The two INTERNAL kinds. `length: 0` is deliberate and means "the corpus figure": both sizes
      // are decided by `internalPartDefaults` against the host, so the button and any other caller
      // build the identical part rather than two that agree by argument. A coupler is 1.86 calibers
      // and a ring is 3.18 mm — see there for why one number could not have served both.
      part = { id, kind, after: afterId, length: 0, name: kind === "tubecoupler" ? "Coupler" : "Centering ring" };
    } else {
      part = { id, kind: "bodytube", after: afterId, length: Math.max(anchor.length / 2, 2 * anchor.outerRadius) };
    }
    // Aim the fields for that KIND at it in the same commit, so one undo takes back the part AND the aim
    // rather than leaving the fields holding a part that no longer exists — and clear the absolute
    // dimensions that aim was pointing, which otherwise re-land on the part just made.
    const nextAdded = [...(edits.added ?? []), part];
    const aim = aimEditsAt(structureOf(doc.rocket, { ...edits, added: nextAdded }), id);
    applyEdit(
      { added: nextAdded, ...aimsClearedByAiming(edits, aim), ...aim },
      { label: ADD_LABEL[kind] ?? "adding a part", key: `add:${id}` },
    );
  };

  /** Record a real catalogued coupler or centring ring against the authored part it was chosen for.
   *
   *  **The record is built HERE, from the catalogue row, exactly as the three pickers above it do.**
   *  `PartPicker` hands over the row and the stock it resolved rather than a finished record, so the
   *  refusal of a density the catalogue would not stand behind stays one decision made in one place —
   *  and so one component can serve five kinds without a union type threaded through it. This arm is
   *  then the second of the three statements of the same rule: the picker has already disabled a row
   *  it cannot build, and `usableCatalogRing` refuses it again at apply time on a bag replayed from
   *  an older session.
   *
   *  The pick is spliced onto the `AddedPart` entry rather than written to a bag-level key — see
   *  `PickedRing` for why — so one undo takes the part and its pick together and removing the part
   *  cannot leave the pick behind. */
  const pickPartFromCatalog = (id: string, p: CatalogPart, material: Material | undefined) => {
    const list = edits.added ?? [];
    if (!list.some((a) => a.id === id)) return;
    // The three DIMENSIONS are stated by every catalogued coupler and every catalogued ring — 236 of
    // 236 and 497 of 497 — so no partial geometry can be written here. The fourth term, the stock, is
    // not the same claim: `materialOf` refuses a density the catalogue would not stand behind, and it
    // refuses **14 of the 497 rings** (0 of the 236 couplers), so this guard does fire on real data.
    // The picker already disables those rows, which is what makes the return unreachable today rather
    // than what makes it unnecessary. A bore of exactly 0 is legal and deliberate: 7 couplers are
    // solid balsa plugs, which `lib/sim/mass.ts` already flies as a solid cylinder.
    if (
      p.outerDiameter === undefined ||
      p.innerDiameter === undefined ||
      p.length === undefined ||
      !material
    )
      return;
    const pick: PickedRing = {
      manufacturer: p.manufacturer,
      partNumber: p.partNumber,
      outerDiameter: p.outerDiameter,
      innerDiameter: p.innerDiameter,
      length: p.length,
      material: { name: material.name, density: material.density, type: material.type },
    };
    applyEdit(
      { added: list.map((a) => (a.id === id ? { ...a, pick } : a)) },
      // Keyed on the part AND the part number, so walking the catalogue coalesces into one undo step
      // per row while two picks on two different authored parts stay separately undoable. The clear
      // below takes a key of its own for the reason the tube picker records: a pick and an unpick
      // sharing a derived key merged into a single step inside the coalescing window, and the flyer
      // could not get back to the part they had just chosen.
      { label: `${p.manufacturer} ${p.partNumber}`, key: `ring-pick-${id}-${p.partNumber}` },
    );
  };

  /** Drop the pick, returning the part to the size Loft derived from its host. The whole `pick` key
   *  goes rather than being set to undefined: `usableCatalogRing` is a type guard over an optional
   *  field, so an entry carrying `pick: undefined` and one carrying no `pick` fly identically today —
   *  but only one of them survives a round trip through `JSON.stringify` in `lib/session.ts`
   *  unchanged, and an edit bag that differs from itself after a reload is the kind of drift the
   *  design-key memoisation is built on top of. */
  const clearPartPick = (id: string) => {
    const list = edits.added ?? [];
    const entry = list.find((a) => a.id === id);
    if (!entry?.pick) return;
    applyEdit(
      {
        added: list.map((a) => {
          if (a.id !== id) return a;
          const rest: AddedPart = { ...a };
          delete rest.pick;
          return rest;
        }),
      },
      {
        label: entry.kind === "tubecoupler" ? "the catalogue coupler" : "the catalogue centering ring",
        key: `ring-clear-${id}`,
      },
    );
  };

  /** Whether a nudge is available, judged against the SAME tree `movePart` applies it to. The panel
   *  asks this rather than working it out from the rocket it was handed, exactly as it asks
   *  `refuseRemoval` — the shown rocket carries the dimension edits, which synthesise top-level parts
   *  of their own, so a control decided there can offer a move the operation cannot make. */
  const canMovePart = useCallback(
    (id: string, dir: -1 | 1) => (removableFrom ? moveTarget(removableFrom, id, dir) !== null : false),
    [removableFrom],
  );

  /** Every place a part can be dropped, for the diagram's drag. Judged against the SAME tree
   *  `movePartTo` applies against, for the reason `canMovePart` gives above: the shown rocket carries
   *  the dimension edits, which synthesise top-level parts of their own, so a slot resolved there can
   *  name an anchor the operation cannot address. */
  const movePartSlots = useCallback(
    (id: string) => (removableFrom ? moveSlots(removableFrom, id) : []),
    [removableFrom],
  );

  /** Drop a top-level part at a chosen slot — the drag's commit, where `movePart` is the nudge's.
   *
   *  Appended to `moved` exactly as a nudge is, and keyed uniquely per commit so two drops never
   *  coalesce into one undo step. It takes the anchor rather than a direction because a drag is not a
   *  direction: it lands where the pointer was let go, which may be several places away. */
  const movePartTo = (id: string, after: string | null) => {
    if (!doc || !removableFrom) return;
    // Re-checked here, not trusted from the caller. The diagram computes its slots from a render that
    // may be a frame behind the model, and an entry naming an anchor in another stage is a silent
    // no-op inside `applyMoves` — which would leave an undo step on the stack that undoes nothing.
    if (!moveSlots(removableFrom, id).some((s) => s.move.after === after)) return;
    const name = flattenRocket(removableFrom).find((p) => p.component.id === id)?.component.name;
    applyEdit(
      { moved: [...(edits.moved ?? []), { id, after }] },
      {
        label: `moving ${name || "the part"} along the airframe`,
        // Keyed uniquely per commit, like the nudge and every other structural act: two drops a
        // moment apart are two decisions, not two frames of one gesture.
        key: `move:${id}:${after ?? "nose"}:${edits.moved?.length ?? 0}`,
      },
    );
  };

  /** Nudge a top-level part one place toward the nose or the tail, within its own stage.
   *
   *  Appended to `moved` rather than applied to the tree, like every other structural act in this bag:
   *  the model is always rebuilt from the pristine design plus the bag, so dropping the last entry IS
   *  the undo. `moveTarget` decides where it lands and returns null when there is nowhere to go, which
   *  is also what the parts panel reads to leave the button out — one answer to "can this move?", not
   *  two that can disagree. */
  const movePart = (id: string, dir: -1 | 1) => {
    if (!doc || !removableFrom) return;
    const mv = moveTarget(removableFrom, id, dir);
    if (!mv) return;
    const name = flattenRocket(removableFrom).find((p) => p.component.id === id)?.component.name;
    applyEdit(
      { moved: [...(edits.moved ?? []), mv] },
      {
        // Named, like a removal is: after the move the part has changed places, and "Undo" alone asks
        // the flyer to remember which of several nudges they are stepping out of.
        //
        // Keyed UNIQUELY per commit, so nudges never coalesce. A run key would merge three clicks
        // inside the 900 ms window into one step, and one undo would then jump the part three places
        // back under a label that says "moving X toward the nose" in the singular. Structural acts do
        // not merge anywhere else in this app — `removeComponent` keys per part for the same reason —
        // and a reorder is a structural act. The run-coalescing rule is for a drag or a typed number,
        // where the intermediate states are frames of one gesture rather than decisions.
        label: `moving ${name || "the part"} ${dir === -1 ? "toward the nose" : "toward the tail"}`,
        key: `move:${id}:${dir}:${(edits.moved?.length ?? 0)}`,
      },
    );
  };

  /** Step back one action, and forward again. The whole what-if state moves together — see `WhatIf` —

   *  so a step taken under today's weather or another motor configuration comes back under the same
   *  ones, rather than restoring the edits into whatever is on screen now. */
  const undoStep = () => {
    const back = undoHistory(history, { edits, weather, scenario, simIndex });
    if (!back) return;
    // The history only ever holds states that flew, so this cannot normally refuse — but if it does,
    // the step is not consumed, so the flyer keeps the undo rather than losing it to a failed replay.
    if (!applyWhatIfState(back.state)) return;
    setHistory(back.history);
  };

  const redoStep = () => {
    const forward = redoHistory(history, { edits, weather, scenario, simIndex });
    if (!forward) return;
    if (!applyWhatIfState(forward.state)) return;
    setHistory(forward.history);
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
    // Same last chance as `loadDoc`, on the other way out: this clears the design without opening
    // another, and the flyer's next move is often the shelf row this design left behind.
    syncShelfRow();
    if (designBytes.current) {
      const leaving: SavedSession = {
        v: 1,
        design: designBytes.current,
        name: fileName,
        rocket: doc?.rocket.name || undefined,
        opensOn: lastWorkspace.current,
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
    // No design, no workspace — go back to the import screen rather than leaving the address on a
    // workspace route that now has nothing to show.
    router.replace("/");
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
    if (!saved) {
      setSessionChecked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const bytes = fromBase64(saved.design);
        const document = await importDesign(bytes);
        if (cancelled) return;
        setUnits(saved.units);
        // A workspace the flyer ASKED for outranks the one the session remembers. Opening
        // loft.fusionspace.co/design from a bookmark, or reloading while on the sweeps, has to land
        // where the address says — otherwise a deep link is only a suggestion, which is exactly the
        // thing routes were supposed to fix. The session's own workspace is the fallback for a load
        // that named none, which is every arrival at the import screen.
        loadDoc(document, saved.name, workspaceFromPath(window.location.pathname) ?? saved.opensOn, bytes, {
          edits: saved.edits as Edits,
          simIndex: saved.simIndex,
          rocket: saved.rocket,
        });
      } catch {
        // A design Loft can no longer read (a format change, a truncated write) is dropped rather
        // than shown as an error on a page the flyer never asked to be on.
        clearSession();
      } finally {
        if (!cancelled) setSessionChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Deliberately once, on mount: this restores a session, it doesn't track one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Keep the ref in step with the address. In an effect rather than in the render body — a ref
   *  written during render is a lint error and a real one: a render can be discarded, and this
   *  would have kept the write. Declared ABOVE the session-save effect on purpose, so within one
   *  commit the ref is already current by the time the session is written. */
  useEffect(() => {
    if (workspace) lastWorkspace.current = workspace;
  }, [workspace]);

  /** Keep the address and what is on screen telling the same story. Two ways they can disagree, and
   *  both are reachable by clicking, not by typing:
   *
   *  · **A workspace route with no design behind it** — a stale bookmark, a shared link, or the
   *    design cleared in another tab. There is nothing for the workspace to show, so the flyer goes
   *    to the import screen, which is the only thing that can put a design there. Held behind the
   *    session lookup so a legitimate resume is never bounced out from under itself.
   *  · **The root with a design open** — the header wordmark is a link home, and these routes share
   *    one layout, so following it does NOT unmount anything: the design survives while the address
   *    stops naming a workspace. Left alone, `/` rendered the Flight panel under an address that
   *    named no workspace, with no link on the spine marked current. The front door's job is to get
   *    a design open; with one already open the flyer belongs back in it.
   *
   *  Gated on `run`, not just `doc`: a design that threw in the solver has an error card and no
   *  workspaces to offer, and bouncing it into one would be an address naming a view that is not
   *  there. */
  useEffect(() => {
    if (!sessionChecked) return;
    if (!doc && workspace) router.replace("/");
    else if (doc && run && !workspace) router.replace(workspacePath(lastWorkspace.current));
  }, [sessionChecked, doc, run, workspace, router]);

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
      // Where I left off includes WHICH workspace, and that is now the address — so a workspace
      // reached with the browser's own Back button is recorded exactly like one reached by clicking
      // the spine, with no second mechanism to keep in step. Read from the ref rather than from
      // `workspace` so a moment spent at the root — between a load and its navigation landing, or
      // on the way through the wordmark — cannot overwrite the answer with `flight`.
      opensOn: lastWorkspace.current,
      units,
      simIndex,
      edits: edits as Record<string, unknown>,
    });
  }, [doc, fileName, workspace, units, simIndex, edits]);

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
            // What the cone and the aimed tube weigh TODAY — the stated override where the design
            // gives one, Loft's own figure from the contour, wall and stock otherwise. Read off
            // `massByComponent` rather than off the component, so the placeholder shows exactly the
            // quantity the typed number replaces: on the rare part carrying a whole-assembly
            // override that map already holds the assembly's figure rather than the part's.
            // **`?? NaN`, not `?.mass`, and that is the difference between reaching every design and
            //  reaching 31 of 35.** `massByComponent` has an entry only for a part that produces a
            //  structural point mass — a subsumed part gets `{mass: 0}`, but a part Loft computes NO
            //  mass for gets no entry at all. All 4 RASAero designs in the corpus are that shape:
            //  the format states one lumped launch weight and no per-part masses, so the nose and the
            //  tube had no entry, the readback was `undefined`, and the control never rendered — on
            //  precisely the designs where a flyer's own scale is the ONLY possible source. The field
            //  renders whenever the PART exists; what it weighs today is a separate question, and
            //  `NaN` is how "there is no figure to show you" reaches the placeholder below.
            noseMass: (() => {
              const n = primaryNose(designBase);
              return n ? (massByComponent(designBase).get(n.id)?.mass ?? Number.NaN) : undefined;
            })(),
            /** **Where a part's weight is already counted, on every field that offers to state one.**
             *
             *  OpenRocket lets an assembly state one figure for itself and everything in it, and 4 of
             *  the 35 corpus designs do — a stage-level override on three of them and a component one
             *  on the fourth. Inside such an assembly a part contributes nothing of its own, so a mass
             *  typed here changes no flight: `massByComponent` reports the part at **0 kg, counted in
             *  ⟨assembly⟩**, and the parts table one click away already prints exactly that.
             *
             *  The property panel did not, and that is the split this closes: 42 aimable parts across
             *  those 4 designs — 10 body tubes, 7 centring rings, 5 canopies, 4 couplers, 4 bulkheads,
             *  3 nose cones, 2 inner tubes, 2 mass objects, 2 shock cords, 2 lugs, 1 rail button — sat
             *  behind a live-looking box, three of the kinds showing a placeholder of 0 for a part that
             *  weighs something. `NumberField`'s own `disabled` exists for this and says so in its
             *  docblock: a control that demonstrably does nothing must not look as though it does. */
            massCarriedBy: (() => {
              const of = (id?: string) => (id ? statedMassHolder(designBase, id) ?? undefined : undefined);
              // **A part that states its OWN whole-assembly weight is the other case, and it is not
              //  this one.** `statedMassHolder` answers only the ANCESTOR question by design, so a
              //  tube carrying `overrideMass` + `overrideSubcomponents` itself reports no holder: the
              //  field stays live, which is right — the flyer can restate that figure — but the
              //  number it shows is the assembly's, so the hint saying "the tube on its own" was the
              //  exact opposite of the truth. `fixtures/demo-quirks.ork`'s "Upper" is this shape
              //  (600 g covering the tube, a coupler and a streamer), and it is one click from the
              //  front door.
              const covers = (id?: string) => (id ? statesOwnAssemblyMass(designBase, id) : false);
              return {
                nose: of(primaryNose(designBase)?.id),
                bodyTube: of(primaryBodyTube(designBase, edits.bodyTubeId)?.id),
                internal: of(primaryInternalPart(designBase, edits.internalId)?.id),
                fitting: of(primaryFitting(designBase, edits.fittingId)?.id),
                massObject: of(primaryMassObject(designBase, edits.massObjectId)?.id),
                parachute: of(primaryParachute(designBase, edits.parachuteId)?.id),
                noseCoversAssembly: covers(primaryNose(designBase)?.id),
                bodyTubeCoversAssembly: covers(primaryBodyTube(designBase, edits.bodyTubeId)?.id),
              };
            })(),
            bodyLength: primaryBodyTube(designBase, edits.bodyTubeId)?.length,
            bodyTubeMass: (() => {
              const t = primaryBodyTube(designBase, edits.bodyTubeId);
              return t ? (massByComponent(designBase).get(t.id)?.mass ?? Number.NaN) : undefined;
            })(),
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
            // The internal structure: couplers, centring rings, bulkheads, engine blocks and inner
            // tubes. 194 parts across 25/17/11/13/25 of the 35 corpus designs, and until now not one
            // of them had a field. They are 194 of the 249 parts (of 569) that no field described.
            internalLength: primaryInternalPart(designBase, edits.internalId)?.length,
            internalOuterDiameter: (() => {
              const p = primaryInternalPart(designBase, edits.internalId);
              return p ? p.outerRadius * 2 : undefined;
            })(),
            internalInnerDiameter: (() => {
              const p = primaryInternalPart(designBase, edits.internalId);
              return p ? p.innerRadius * 2 : undefined;
            })(),
            // What the part weighs TODAY — the stated override where the design gives one, and Loft's
            // own figure from geometry and material otherwise. Shown as the field's placeholder so a
            // flyer sees the number they are overruling rather than an empty box beside a mass that
            // is on no surface of this panel.
            internalMass: (() => {
              const p = primaryInternalPart(designBase, edits.internalId);
              return p ? massByComponent(designBase).get(p.id)?.mass : undefined;
            })(),
            internalKind: primaryInternalPart(designBase, edits.internalId)?.kind,
            internalPart: primaryInternalPartAim(designBase, edits.internalId),
            unreachableInternals: unreachableInternalCount(designBase),
            // The ceilings the two dimension fields advertise, from the same function the applier
            // clamps with, so the promise and the enforcement cannot drift.
            internalMaxLength: internalPartBounds(designBase, edits.internalId).maxLength,
            internalMaxOuterDiameter: internalPartBounds(designBase, edits.internalId).maxOuterDiameter,
            // **Two bound INPUTS that must survive the property-surface mask, which is why they are
            // metadata rather than values.** `DesignEditor` blanks every AIMED field belonging to
            // another component, and `bodyDiameter` is one — so inside a fitting's or an internal
            // part's own popover it read `undefined`, which forced `calibreScale` to 1 and left the
            // fitting ceiling with no number at all. The field then advertised no bound while
            // `applyGeometryEdits` clamped anyway: the promise and the enforcement drifting apart,
            // which is the defect the boattail shipped once and the internal bounds shipped again.
            // These two keys are in no aim's target list, so the mask leaves them alone.
            calibreBase: primaryBodyDiameter(designBase, edits.bodyTubeId),
            // Only the two fields the bound actually reads, rather than the whole edit bag: passing
            // `edits` makes this memo depend on every keystroke in the panel and go stale on the two
            // that matter, which is the opposite of what it needs.
            fittingMaxDiameter: fittingMaxOuterDiameter(designBase, {
              bodyDiameter: edits.bodyDiameter,
              bodyTubeId: edits.bodyTubeId,
            }),
            // The external fittings — shock cords, launch lugs, rail buttons. 54 parts across the 35
            // corpus designs and the last kinds with no field; two of the three reach the flight
            // through protuberance DRAG as well as through mass.
            // PER INSTANCE, from the same function the applier multiplies back up. The stored figure
            // is the total across the instances, so reading it raw left this field advertising a
            // pristine total while the parts table one click away showed the scaled one.
            fittingMass: fittingUnitMass(designBase, edits.fittingId),
            fittingLength: primaryFitting(designBase, edits.fittingId)?.length,
            fittingDiameter: (() => {
              const f = primaryFitting(designBase, edits.fittingId);
              return f?.radius !== undefined ? f.radius * 2 : undefined;
            })(),
            fittingCount: primaryFitting(designBase, edits.fittingId)?.instanceCount ?? (primaryFitting(designBase, edits.fittingId) ? 1 : undefined),
            fittingKind: primaryFitting(designBase, edits.fittingId)?.kind,
            fittingPart: primaryFittingAim(designBase, edits.fittingId),
            unreachableFittings: unreachableFittingCount(designBase),
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
            // The coefficient and its origin, read off the SAME canopy the diameter is — R9's gap:
            // it is the one input in the recovery chain that sets landing speed and landing energy,
            // and it was on no surface in the app at all.
            // The canopy's mass and where it came from, off that SAME canopy. Read back so the
            // field shows what it is overruling rather than an empty box beside a number nobody
            // can see: Loft derives this from diameter and a surface density, and the flyer's
            // scale knows about line, swivel and bag that no diameter can.
            mainParachuteMass: primaryParachute(designBase, edits.parachuteId)?.mass,
            mainParachuteMassFrom: primaryParachute(designBase, edits.parachuteId)?.massFrom,
            mainParachuteCd: primaryParachute(designBase, edits.parachuteId)?.cd,
            mainParachuteCdFrom: primaryParachute(designBase, edits.parachuteId)?.cdFrom,
            parachutePart: primaryParachutePart(designBase, edits.parachuteId),
            unreachableParachutes: unreachableParachuteCount(designBase),
            motorClusterCount: primaryMotorClusterCount(designBase),
            unreachableMounts: unreachableMountCount(designBase),
            mountsWritten: primaryMountGroupIds(designBase).size,
            payloadStation: defaultPayloadStation(designBase, edits.bodyTubeId),
          }
        : {
            finSpan: undefined,
            unreachableFinSets: 0,
            unreachableMounts: 0,
            mountsWritten: 0,
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
            noseMass: undefined,
            // Nothing loaded, so nothing's weight is counted anywhere.
            massCarriedBy: {},
            bodyLength: undefined,
            bodyTubeMass: undefined,
            bodyDiameter: undefined,
            bodyTubePart: undefined,
            unreachableBodyTubes: 0,
            boattailFairsTo: undefined,
            transitionLength: undefined,
            transitionAftDiameter: undefined,
            transitionPart: undefined,
            unreachableTransitions: 0,
            internalLength: undefined,
            internalOuterDiameter: undefined,
            internalInnerDiameter: undefined,
            internalMass: undefined,
            internalKind: undefined,
            internalPart: undefined,
            unreachableInternals: 0,
            internalMaxLength: undefined,
            internalMaxOuterDiameter: undefined,
            calibreBase: undefined,
            fittingMaxDiameter: undefined,
            fittingMass: undefined,
            fittingLength: undefined,
            fittingDiameter: undefined,
            fittingCount: undefined,
            fittingKind: undefined,
            fittingPart: undefined,
            unreachableFittings: 0,
            massObjectMass: undefined,
            massObjectStation: undefined,
            massObjectPart: undefined,
            unreachableMassObjects: 0,
            finish: undefined,
            airframeMaterial: undefined,
            mainParachuteDiameter: undefined,
            mainParachuteMass: undefined,
            mainParachuteMassFrom: undefined,
            mainParachuteCd: undefined,
            mainParachuteCdFrom: undefined,
            parachutePart: undefined,
            unreachableParachutes: 0,
            motorClusterCount: undefined,
            payloadStation: undefined,
          },
    // The fin and body readbacks take their selected part, so both selections are real dependencies:
    // without them the panel keeps showing the primary part's numbers while the edit writes to the
    // picked one.
    [doc, designBase, edits.finSetId, edits.bodyTubeId, edits.bodyDiameter, edits.transitionId, edits.massObjectId, edits.parachuteId, edits.internalId, edits.fittingId],
  );

  return (
    <div className="mt-8">
      {/* The import screen belongs to the root route and only to it. On a workspace route with no
          design there is a resume in flight or a redirect about to happen (see the effect above),
          and flashing the import screen into that gap advertises "nothing here" for a design that
          is seconds from arriving. */}
      {!doc && !workspace && (
        <>
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Import an OpenRocket <code className="font-mono">.ork</code>, RockSim{" "}
            <code className="font-mono">.rkt</code>{" "}or RASAero <code className="font-mono">.CDX1</code>{" "}
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
            removedRecents={removedRecents}
            onRestoreRecent={onRestoreRecent}
            discarded={discarded}
            onRestoreDiscarded={onRestoreDiscarded}
          />
        </>
      )}

      {/* The fault, and then what became of the change — because those are two different questions
          and only the first was ever answered. The change is refused rather than applied (see
          `applyWhatIfState`), so the design and the numbers below are still the last pair that
          agreed; saying so is what stops a flyer reading the grid as the result of what they just
          typed. Only said when there is a design on screen to be unchanged: the same card carries
          import failures on the root route, where there is no flight to speak of. */}
      {error && (
        <ErrorState
          className="mt-4"
          what={error}
          next={
            doc
              ? "The change was not applied — the design and the flight below are unchanged."
              : undefined
          }
        />
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
              <Button
                variant="ghost"
                size="sm"
                square
                onClick={reset}
                className="sm:underline sm:underline-offset-2"
              >
                <span aria-hidden>←</span>
                <span className="sr-only sm:not-sr-only">Import another</span>
              </Button>
              <input
                type="text"
                aria-label="Design name — used as the results title and the .ork filename"
                value={doc.rocket.name}
                onChange={(e) => renameDesign(e.target.value)}
                placeholder="Design name"
                className={`min-w-0 max-w-[11rem] rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm font-medium text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${TOUCH_TARGET}`}
              />
              {fileName && fileName !== doc.rocket.name && (
                <span className="hidden truncate text-xs text-zinc-500 dark:text-zinc-400 sm:inline" title={fileName}>
                  {fileName}
                </span>
              )}
              <Button
                size="sm"
                square
                onClick={downloadOrk}
                // **Begins with the VISIBLE label, deliberately.** `aria-label` REPLACES the
                // accessible name where `title` only supplemented it, so the first version of this
                // made the button announce "Save this design as an OpenRocket .ork file" — losing
                // the words on screen, which is WCAG 2.5.3 (label in name) and the thing a voice-
                // control user actually says. The description follows the label rather than
                // replacing it.
                aria-label={`Download .ork — ${downloadOmits() || "save this design as an OpenRocket .ork file"}`}
              >
                <span aria-hidden className="sm:hidden">
                  ↓
                </span>
                <span className="sr-only sm:not-sr-only">Download .ork</span>
              </Button>
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
                <Button
                  size="sm"
                  square
                  onClick={undoStep}
                  aria-disabled={!canUndo || undefined}
                  // Set only when there IS something to undo, and both halves of that are
                  // deliberate. `aria-label` REPLACES the accessible name where `title` merely
                  // supplements it, so overriding the disabled state renamed a button whose visible
                  // word is "Undo" — WCAG 2.5.3, and the name a voice-control user says out loud.
                  // The disabled arm's old tooltip said "Nothing to undo", which is exactly what
                  // `aria-disabled` already conveys, so it is dropped rather than relocated: a
                  // tooltip that restates the state it sits on teaches nothing and, being a `title`,
                  // never reached a phone at all.
                  aria-label={canUndo ? `Undo ${canUndo} (${modKey}+Z)` : undefined}
                >
                  <span aria-hidden>↶</span>
                  <span className="sr-only sm:not-sr-only">Undo{canUndo ? ` ${canUndo}` : ""}</span>
                </Button>
                <Button
                  size="sm"
                  square
                  onClick={redoStep}
                  aria-disabled={!canRedo || undefined}
                  aria-label={canRedo ? `Redo ${canRedo} (${modKey}+Shift+Z)` : undefined}
                >
                  <span aria-hidden>↷</span>
                  <span className="sr-only">Redo{canRedo ? ` ${canRedo}` : ""}</span>
                </Button>
              </span>
              {editsActive && (
                <Button
                  size="sm"
                  onClick={resetEdits}
                  aria-label="Reset to as-designed — clear every what-if and re-fly the design as the file describes it"
                  className="shrink-0"
                >
                  Reset<span className="sr-only sm:not-sr-only">&nbsp;to as-designed</span>
                </Button>
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

          {/* Said in visible copy, not only in the download button's `title`. A tooltip is hover-only,
              which DESIGN.md §8 forbids outright — and this is exactly the kind of thing a flyer needs
              on a phone, where there is no hover at all. */}
          {downloadOmits() && (
            <Card tone="sunken" className="text-sm text-zinc-600 dark:text-zinc-400" role="note">
              {downloadOmits()}
            </Card>
          )}

          {restored && (
            // Never restore silently: a design that reappears without saying so is indistinguishable
            // from one you thought you had closed, and the numbers on screen would be someone else's
            // session as far as the reader knows.
            <Card tone="sunken" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              <span>
                Picked up where you left off — <strong className="font-medium">{fileName}</strong>, with
                any what-ifs you had set. Kept on this device only.
              </span>
              <Button variant="ghost" size="sm" onClick={reset} className="underline underline-offset-2">
                Start fresh
              </Button>
            </Card>
          )}

          {choices.length > 1 && (
            <ConfigPicker choices={choices} selected={simIndex} onSelect={selectConfig} units={units} tool={toolName} />
          )}

          {doc.warnings.length > 0 && (
            <Card tone="warn" className="text-sm">
              <p className="font-medium">Some parts of this design weren&apos;t fully understood:</p>
              <ul className="mt-1 list-disc pl-6">
                {doc.warnings.slice(0, 6).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Card>
          )}

          {/* How the design was read, as distinct from what couldn't be. Explaining that a two-stage
              design flies serially, or which weight a format without materials uses, under an amber
              "weren't fully understood" heading made a correct reading look like a broken one. */}
          {doc.notes.length > 0 && (
            <Card tone="sunken" className="text-sm text-zinc-600 dark:text-zinc-300">
              <p className="font-medium text-zinc-700 dark:text-zinc-200">How Loft read this design:</p>
              <ul className="mt-1 list-disc pl-6">
                {doc.notes.slice(0, 6).map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </Card>
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
                // The profile's own hour, carried to every panel that quotes a drift number.
                aloftHour: weather?.aloftTime,
                aloftMatched: weather?.aloftMatched,
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
              mountCasingMm={swapInfo?.casingMm}
              designMotor={swapInfo?.designMotor}
              designManufacturer={swapInfo?.designManufacturer}
              designMotorFlies={swapInfo?.designMotorFlies}
              onEditGeometry={applyEdit}
              // Apply a motor straight from the sweep's ranking. Routed through `applyEdit` like
              // every other what-if, so it lands in the same edit bag, is undoable by the same
              // control, persists across a reload with the rest, and re-flies every panel — rather
              // than being a second mechanism beside the Swap motor select, which reads it back.
              // The record is built from the same three fields the select writes, `diameter`
              // included, so the two paths are indistinguishable downstream and `swapStillOffered`
              // re-validates either of them identically on a configuration change.
              onUseMotor={(m) => {
                // **A tap that changes nothing must not commit a history step.** `movedWhatIf`
                // compares edit fields by REFERENCE and its own note says "a fresh object in a field
                // (a motor swap) counts as a change", so re-applying the motor already in force
                // pushed an undo step that undoes nothing visible and buried the previous real one.
                // The `<select>` could never reach this — it fires no change event when the same
                // option is re-chosen — but a button is one tap.
                const cur = edits.motorSwap;
                if (cur && cur.designation === m.designation && cur.manufacturer === m.manufacturer) return;
                applyEdit(
                  { motorSwap: { manufacturer: m.manufacturer, designation: m.designation, diameter: m.diameter } },
                  { label: `Fly on ${m.designation}`, key: "motorSwap" },
                );
              }}
              // A pick re-aims the fields that describe THAT kind of part and leaves the rest alone.
              // The routing lives in the edit model rather than here, so the panel that reports the
              // pick does not also have to know which fields a body tube or a fin set drives.
              onRemovePart={removeComponent}
              onAddAfter={addPartAfter}
              onMovePart={movePart}
              canMovePart={canMovePart}
              onMovePartTo={movePartTo}
              movePartSlots={movePartSlots}
              onAddStage={stageBase && canAddStage(stageBase) ? addStage : undefined}
              onRemoveStage={removeStage}
              // Asked of the tree the operation runs against — `stageBase` — for exactly the reason
              // `canAddStage` is: the mount-add applies before the structural edits, so asking the
              // fully-edited tree would offer the control where the operation refuses and withhold it
              // where the operation works.
              canAddMountTo={(id) => !!stageBase && canAddMount(stageBase, id)}
              onAddMount={addMount}
              onRemoveMount={removeMount}
              onPickPart={pickPartFromCatalog}
              onClearPick={clearPartPick}
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
              workspace={workspace ?? "flight"}
              // **The property surface for whatever part is picked out — R12's "selecting a component
              // is how you edit it".** It is the SAME `DesignEditor`, aimed: the fields, their units,
              // their bounds and their refusals are one implementation, filtered down to the component
              // in hand. A second copy of them is what every divergence in this file has been.
              //
              // The aim is read from the edit registry rather than from a table here — `aimEditsAt`
              // answers "which slot does a pick on this id move", which is exactly "which fields
              // describe it" — plus the nose, which has no slot because a design has one of them.
              // A part no field describes returns null and gets no control at all.
              propertiesFor={(id) => {
                const tree = removableFrom ?? structureOf(doc.rocket, edits);
                const part = flattenRocket(tree).find((x) => x.component.id === id)?.component;
                if (!part) return null;
                const slot = Object.keys(aimEditsAt(tree, id))[0];
                const aim = slot ?? (part.kind === "nosecone" ? "nose" : undefined);
                if (!aim) return null;
                // The part's own name where it has one, its kind otherwise — the SAME table the
                // parts panel's rows and its identify line read from, so the popover's heading names
                // a part the way the surface the flyer just clicked on does.
                const label = part.name || KIND_LABEL[part.kind] || part.kind;
                return {
                  title: label,
                  label,
                  body: (
                    <DesignEditor
                      units={units}
                      edits={edits}
                      onEdit={applyEdit}
                      swap={swapInfo}
                      designDims={designDims}
                      tool={toolName}
                      only={aim}
                    />
                  ),
                };
              }}
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
      {/* Whatever the route itself renders, inside the shell that holds the design. Empty today —
          each workspace's content is still rendered above, mounted for every route so a
          Monte-Carlo or a cross-check survives the flyer walking away from it and back. */}
      {children}
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
    <Card as="label" className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Motor configuration</span>
      <Select
        aria-label="Motor configuration"
        value={selected}
        onChange={(e) => onSelect(Number(e.target.value))}
        className="min-w-0 flex-1"
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
      </Select>
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
    </Card>
  );
}

// --- conditions controls (rod / wind / elevation + today's weather) -----------------

/** The design-editing surface: fly a different motor, add nose weight, and resize/reshape the
 *  airframe. It lives in the Design workspace next to the to-scale diagram it edits, so building
 *  and editing are the same surface. Every change is a hypothetical on the loaded design, so the
 *  stored-tool comparison is hidden while any is set. */
/** How to say where a canopy's drag coefficient came from, in the flyer's terms rather than the
 *  model's.
 *
 *  Three values, and the third is why `CdProvenance` gained a member: a chute Loft itself authored —
 *  the starter design's, or the drogue the dual-deploy editor adds — used to carry no provenance at
 *  all, and absence cannot be told apart from "nobody recorded it". `undefined` therefore still
 *  means exactly that, and says so rather than guessing.
 *
 *  There is deliberately no "from the catalogue" case: 0 of the 151 catalogued canopies publish a
 *  coefficient, so a pick leaves the field as it found it. */
function cdOriginPhrase(from: CdProvenance | undefined): string {
  switch (from) {
    case "file":
      return "the design file's own figure";
    case "default":
      return "Loft's fallback, because the file states none";
    case "loft":
      return "Loft's own, for a canopy authored here";
    // One `case "flyer"` — there were two, the second unreachable and shipped that way. Harmless in
    // behaviour (the first wins) and not harmless as a signal: `no-duplicate-case` is not on in this
    // repo's eslint config, so nothing said so. Filed in `BACKLOG.md`.
    case "flyer":
      return "your own figure, typed here";
    default:
      return "origin not recorded";
  }
}

/** Where a canopy's MASS came from, in the flyer's words — the mass twin of `cdOriginPhrase`.
 *
 *  Deliberately NOT the same sentences as the parts table's `massSourceLabel`. That surface is a
 *  column in a dense table and answers "which kind of figure is this" in two words; this one is a
 *  sentence under a control the flyer is about to type into, and answers "whose number am I
 *  overruling". `MassProvenance`'s three cases are the same three either way.
 *
 *  `undefined` means Loft derived it from the canopy's diameter and a surface density — the case
 *  this control exists for, because that estimate cannot see line, swivel or bag. It says so
 *  outright rather than staying silent, since a mass with no stated origin is exactly the one a
 *  flyer should feel free to replace. */
function massOriginPhrase(from: MassProvenance | undefined): string {
  switch (from) {
    case "stated":
      return "the weight the design file states";
    case "tool":
      return "the source tool's own computation, carried across";
    case "flyer":
      return "your own figure, typed here";
    default:
      return "Loft's estimate from the canopy's diameter, which cannot see line, swivel or bag";
  }
}

/** The editor's own chrome, or none of it.
 *
 *  Declared at module scope rather than chosen inline: a component created during render is a NEW
 *  component type on every pass, so React unmounts and remounts its whole subtree and every field
 *  inside it loses what was being typed. eslint refuses it outright, and it is right to — the first
 *  draft of the property surface did exactly this.
 *
 *  `bare` is what a property surface wants: that surface brings its own card and its own heading
 *  naming the part, so a second card would be raised-inside-raised (§2 forbids it) under a heading
 *  about a heading. */
function EditorFrame({ bare, children }: { bare?: boolean; children: React.ReactNode }) {
  if (bare) return <>{children}</>;
  return (
    <Card tone="sunken">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Design what-if
      </p>
      {children}
    </Card>
  );
}

/** The fieldset legend and the inline field label inside `DesignEditor`, spelled ONCE.
 *
 *  **They were six and six identical string literals, and that is why this is a constant rather than
 *  taste.** `lib/design-system.test.ts` ratchets `text-[11px]` — a token §3 scopes to axis ticks and
 *  diagram annotations — and its own docblock says how the number comes down: *"a label that moves
 *  into a primitive stops being spelled at the call site."* Twelve call sites spelling it made this
 *  file eleven of the app's forty-one uses, and adding a thirteenth for a new fieldset would have
 *  grown a count that is only allowed to shrink. Collapsed, the same twelve labels cost two.
 *
 *  Not lifted into `components/ui.tsx`: §5 is the binding component vocabulary and both repos carry
 *  an identical copy, so a new primitive is a `DESIGN.md` change in both — the right move when a
 *  second surface needs the same treatment, and premature while one does. */
const FIELDSET_LEGEND = "mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const FIELD_LABEL = "block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

/** Which component's fields a property surface is showing — an `AIM_SLOTS` key, or `"nose"`.
 *
 *  The nose is the one kind the aim registry deliberately has no slot for, because a design has
 *  exactly one and there is nothing to aim; `noseLength` and `noseShape` still describe it, so a
 *  flyer who picks it has to be able to reach them. Everything else is derived from the registry
 *  rather than listed again here — a second list of "which fields describe which part" is precisely
 *  what `AIM_SLOTS`' own docblock says had already drifted four ways once. */
export type EditorAim = string;

/** The value fields each aim owns, derived from the registry plus the nose's three. */
const AIM_FIELDS: Readonly<Record<string, readonly string[]>> = {
  ...Object.fromEntries(Object.entries(AIM_SLOTS).map(([slot, def]) => [slot, def.targets])),
  nose: ["noseLength", "noseShape", "noseMass", "catalogNoseCone"],
};

/** Every field any aim owns — the set a property surface filters DOWN from. */
const AIMED_FIELDS: ReadonlySet<string> = new Set(Object.values(AIM_FIELDS).flat());

function DesignEditor({
  units,
  edits,
  onEdit,
  swap,
  designDims: designDimsIn,
  tool,
  only,
}: {
  units: UnitSystem;
  edits: Edits;
  /** Show only the fields that describe ONE component, and render bare rather than as the what-if
   *  card — what a property surface opened from a picked part wants.
   *
   *  Implemented as a filter over `designDims` rather than as a second copy of the fields, because
   *  every one of them already carries its own unit conversion, its bound, its refusal message and
   *  the sentence naming which part it is holding. A second copy is the mechanism behind every
   *  divergence this repo has had to unwind. Most of the filtering falls out for free: the controls
   *  are already gated on `designDims.<field> !== undefined`, so blanking the other groups' values
   *  hides them without touching a single control. The handful that are NOT gated that way — the
   *  motor swap, the whole-airframe finish and material, the nose ballast, the recovery scale, the
   *  boattail and the payload — are whole-DESIGN fields rather than one part's, and they are gated
   *  on `only` explicitly below. */
  only?: EditorAim;
  /** `applyEdit` — the optional second argument names the gesture for the undo control. Without it
   *  a multi-field patch falls back to "the design", which is right for a patch that has no single
   *  name and wrong for one that does. */
  onEdit: (patch: Edits, action?: { label?: string; key?: string } | null) => void;
  swap: SwapInfo | null;
  /** The tool whose stored comparison an edit hides — named by the importer, never assumed. */
  tool: string;
  /** The design's own dimensions (m; counts are plain numbers), shown as the fields' placeholders. */
  designDims: {
    finSpan?: number;
    unreachableFinSets: number;
    unreachableMounts: number;
    mountsWritten: number;
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
    noseMass?: number;
    /** Per aim, the assembly whose STATED weight already covers that part — so its own mass field
     *  is a control that would demonstrably do nothing. Undefined where the part carries its own. */
    massCarriedBy: {
      nose?: string;
      bodyTube?: string;
      internal?: string;
      fitting?: string;
      massObject?: string;
      parachute?: string;
      /** The part states one weight for ITSELF and everything in it — so the field is live and the
       *  figure it holds is the assembly's, not the part's. A different sentence, not a disabled box. */
      noseCoversAssembly?: boolean;
      bodyTubeCoversAssembly?: boolean;
    };
    bodyLength?: number;
    bodyTubeMass?: number;
    bodyDiameter?: number;
    bodyTubePart?: AimedPart;
    unreachableBodyTubes: number;
    boattailFairsTo?: number;
    transitionLength?: number;
    transitionAftDiameter?: number;
    transitionPart?: AimedPart;
    unreachableTransitions: number;
    internalLength?: number;
    internalOuterDiameter?: number;
    internalInnerDiameter?: number;
    internalMass?: number;
    /** Which of the five kinds the aim landed on — the panel labels the axial field `Thickness` on a
     *  plate and `Length` on a tube, which is one model field and two flyers' words. */
    internalKind?: string;
    internalPart?: AimedPart;
    unreachableInternals: number;
    internalMaxLength?: number;
    internalMaxOuterDiameter?: number;
    calibreBase?: number;
    fittingMaxDiameter?: number;
    fittingMass?: number;
    fittingLength?: number;
    fittingDiameter?: number;
    fittingCount?: number;
    /** Which of the three kinds the aim landed on — the panel says whether the diameter reaches drag
     *  as well as mass, and only two of them do. */
    fittingKind?: string;
    fittingPart?: AimedPart;
    unreachableFittings: number;
    massObjectMass?: number;
    massObjectStation?: number;
    massObjectPart?: AimedPart;
    unreachableMassObjects: number;
    finish?: SurfaceFinish;
    airframeMaterial?: string;
    mainParachuteDiameter?: number;
    mainParachuteMass?: number;
    mainParachuteMassFrom?: MassProvenance;
    mainParachuteCd?: number;
    mainParachuteCdFrom?: CdProvenance;
    parachutePart?: AimedPart;
    unreachableParachutes: number;
    motorClusterCount?: number;
    payloadStation?: number;
  };
}) {
  // Blank out every VALUE field that belongs to another component, and leave everything else — the
  // metadata keys (`finSetPart`, `unreachableBodyTubes`, …) are what the notes inside each group use
  // to name the part they are holding, and they belong to the group that survives.
  const designDims = !only
    ? designDimsIn
    : (Object.fromEntries(
        Object.entries(designDimsIn).map(([k, v]) => [
          k,
          AIMED_FIELDS.has(k) && !(AIM_FIELDS[only] ?? []).includes(k) ? undefined : v,
        ]),
      ) as typeof designDimsIn);
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
  const internalPhrase = partPhrase(designDims.internalPart, "internal part");
  const fittingPhrase = partPhrase(designDims.fittingPart, "fitting");
  // **The caliber factor, because the internal bounds are measured on the pristine design and the
  // applier scales them.** `Body diameter` scales the whole outer airframe and every internal part
  // with it, and the internal edit is written after that scale, so `internalGeometryEdit` multiplies
  // the host bound by exactly this. The panel has to advertise the same number or it promises a
  // ceiling the model does not use — the boattail defect, in a second place.
  // The denominator is `calibreBase`, NOT `bodyDiameter`: they hold the same number, but the second is
  // an aimed field and a property surface blanks it, which silently forced this to 1 in exactly the
  // popovers whose bounds depend on it.
  const calibreScale =
    edits.bodyDiameter !== undefined && edits.bodyDiameter > 0 && designDims.calibreBase
      ? edits.bodyDiameter / designDims.calibreBase
      : 1;
  // The bounds the internal fields advertise, in the flyer's own span unit. `undefined` is a real
  // answer — a design that states no host length has no ceiling to promise — and `NumberField` treats
  // it as unbounded, which is the honest reading rather than a fabricated limit.
  const internalMaxSpan = designDims.internalMaxLength !== undefined
    ? Number(toDispSpan(designDims.internalMaxLength))
    : undefined;
  const internalMaxOuter = designDims.internalMaxOuterDiameter !== undefined
    ? Number(toDispSpan(designDims.internalMaxOuterDiameter * calibreScale))
    : undefined;
  // The bore is bounded by the outer diameter BEING FLOWN — the edited one where the flyer has typed
  // one, the design's own otherwise — times the one shared cap, which is exactly what
  // `internalGeometryEdit` clamps to. Bounding it at the design's stale outer diameter would
  // advertise a ceiling the model stops using the moment the flyer narrows the part.
  const internalOuterFlown =
    edits.internalOuterDiameter ??
    (designDims.internalOuterDiameter !== undefined
      ? designDims.internalOuterDiameter * calibreScale
      : undefined);
  const internalMaxBore = internalOuterFlown !== undefined
    ? Number(toDispSpan(internalOuterFlown * INTERNAL_MAX_BORE_FRACTION))
    : undefined;
  // The airframe's own maximum diameter, in the flyer's span unit — the ceiling a fitting's frontal
  // size is held to, from the same number the applier clamps with. Placed after `calibreScale`
  // because it consumes it.
  // Straight from `fittingMaxOuterDiameter`, the one function the applier clamps with — no second
  // expression of the rule here, and no caliber factor to forget, because the bound already carries it.
  const fittingMaxDia = designDims.fittingMaxDiameter !== undefined
    ? Number(toDispSpan(designDims.fittingMaxDiameter))
    : undefined;
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
        <EditorFrame bare={!!only}>
          {/* The what-if fields, grouped into labelled sections (a <fieldset> per subsystem) rather
              than one long wall — so a flyer can find the fin controls, the nose/body controls, or the
              recovery controls at a glance, and a screen reader announces each field's group. A group
              renders only when the design actually carries fields for it. */}
          <div className="mt-3 space-y-4">
            {!only && ((swap && swap.options.length > 1) || designDims.motorClusterCount !== undefined) && (
              <fieldset className="min-w-0 border-0 p-0">
                {!only && (
                <legend className={FIELDSET_LEGEND}>
                  Motor
                </legend>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {swap && swap.options.length > 1 && (
                    <label className="col-span-2 block">
                      <span className={FIELD_LABEL}>
                        Swap motor
                      </span>
                      <Select
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
                        className="mt-1 w-full"
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
                      </Select>
                    </label>
                  )}
                  {designDims.motorClusterCount !== undefined && (
                    <NumberField
                      label="Motor cluster"
                      value={edits.motorClusterCount ?? ""}
                      placeholder={String(designDims.motorClusterCount)}
                      min={1}
                      max={12}
                      step={1}
                      // Say WHICH mounts this speaks for, and HOW MANY. It reads back off one mount
                      // and writes to every mount already holding that count, so it is wrong in two
                      // different directions and both are measured on real designs. On a design whose
                      // mounts differ — an air-start pod beside a centre motor — it describes some of
                      // them and not others (1 corpus design). And on a staged design where every
                      // stage's mount holds one, "the mount" is 2 or 3 mounts: typing 3 on
                      // `02.Two-stage.ork` flies SIX motors and on `03.Three-stage.ork` NINE
                      // (5 corpus designs). A count a flyer plans a flight around must not be
                      // multiplied by a number the field never mentions.
                      hint={
                        [
                          designDims.mountsWritten > 1
                            ? `How many motors EACH of this design's ${designDims.mountsWritten} motor mounts holds — so a 3 here flies ${designDims.mountsWritten * 3} motors, not 3.`
                            : "How many motors the mount holds — at least one.",
                          designDims.unreachableMounts > 0
                            ? `${designDims.unreachableMounts} other mount${designDims.unreachableMounts === 1 ? " holds" : "s hold"} a different count and ${designDims.unreachableMounts === 1 ? "is" : "are"} not changed by this field.`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" ")
                      }
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
                {!only && (
                <legend className={FIELDSET_LEGEND}>
                  {designDims.unreachableFinSets > 0 ? `Fins — ${finPhrase}` : "Fins"}
                </legend>
                )}
                {!only && designDims.unreachableFinSets > 0 && (
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
                  <NumberField
                    label={`Fin span (${spanU})`}
                    value={toDispSpan(edits.finSpan)}
                    placeholder={toDispSpan(designDims.finSpan)}
                    onChange={(v) => onEdit({ finSpan: fromSpan(v) })}
                  min={0}
                  positive
                  />
                  {designDims.finCount !== undefined && (
                    <NumberField
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
                    <NumberField
                      label={`Fin root (${spanU})`}
                      value={toDispSpan(edits.finRootChord)}
                      placeholder={toDispSpan(designDims.finRootChord)}
                      onChange={(v) => onEdit({ finRootChord: fromSpan(v) })}
                    min={0}
                    positive
                    />
                  )}
                  {designDims.finTipChord !== undefined && (
                    <NumberField
                      label={`Fin tip (${spanU})`}
                      value={toDispSpan(edits.finTipChord)}
                      placeholder={toDispSpan(designDims.finTipChord)}
                      onChange={(v) => onEdit({ finTipChord: fromSpan(v) })}
                    min={0}
                    positive
                    />
                  )}
                  {designDims.finSweepLength !== undefined && (
                    <NumberField
                      label={`Fin sweep (${spanU})`}
                      value={toDispSpan(edits.finSweepLength)}
                      placeholder={toDispSpan(designDims.finSweepLength)}
                      onChange={(v) => onEdit({ finSweepLength: fromSpan(v) })}
                    min={0}
                    />
                  )}
                  {designDims.finStation !== undefined && (
                    <NumberField
                      label={`Fin position (${spanU})`}
                      value={toDispSpan(edits.finStation)}
                      placeholder={toDispSpan(designDims.finStation)}
                      onChange={(v) => onEdit({ finStation: fromSpan(v) })}
                    min={0}
                    positive
                    />
                  )}
                  {designDims.finThickness !== undefined && (
                    <NumberField
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
                      <span className={FIELD_LABEL}>
                        Fin edge
                      </span>
                      <Select
                        aria-label="Fin edge cross-section"
                        value={edits.finCrossSection ?? ""}
                        onChange={(e) =>
                          onEdit({ finCrossSection: e.target.value ? (e.target.value as FinCrossSection) : undefined })
                        }
                        className="mt-1 w-full"
                      >
                        <option value="">As designed ({FIN_CROSS_SECTION_LABELS[designDims.finCrossSection]})</option>
                        {FIN_CROSS_SECTIONS.map((s) => (
                          <option key={s} value={s}>
                            {FIN_CROSS_SECTION_LABELS[s]}
                          </option>
                        ))}
                      </Select>
                    </label>
                  )}
                  {designDims.finCrossSection !== undefined && (
                    <label className="block">
                      <span className={FIELD_LABEL}>
                        Fin material
                      </span>
                      <Select
                        aria-label="Fin material"
                        value={edits.finMaterial ?? ""}
                        onChange={(e) => onEdit({ finMaterial: e.target.value || undefined })}
                        className="mt-1 w-full"
                      >
                        <option value="">
                          As designed{designDims.finMaterial ? ` (${designDims.finMaterial})` : ""}
                        </option>
                        {FIN_MATERIALS.map((m) => (
                          <option key={m.key} value={m.key}>
                            {m.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                  )}
                </div>
              </fieldset>
            )}

            {(designDims.noseLength !== undefined ||
              designDims.noseShape !== undefined ||
              designDims.bodyDiameter !== undefined ||
              // The transition fields live inside this group, so a property surface aimed at a
              // transition opens it with nothing else in it — without this clause the whole group
              // is hidden and the transition has no fields at all.
              designDims.transitionLength !== undefined ||
              designDims.transitionAftDiameter !== undefined) && (
              <fieldset className="min-w-0 border-0 p-0">
                {!only && (
                <legend className={FIELDSET_LEGEND}>
                  Nose &amp; body
                </legend>
                )}
                {!only && designDims.unreachableBodyTubes > 0 && (
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
                {!only && designDims.unreachableTransitions > 0 && (
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
                    <NumberField
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
                      <span className={FIELD_LABEL}>
                        Nose shape
                      </span>
                      <Select
                        aria-label="Nose shape"
                        value={edits.noseShape ?? ""}
                        onChange={(e) => onEdit({ noseShape: e.target.value ? (e.target.value as NoseShape) : undefined })}
                        className="mt-1 w-full"
                      >
                        <option value="">As designed ({NOSE_SHAPE_LABELS[designDims.noseShape]})</option>
                        {NOSE_SHAPES.map((s) => (
                          <option key={s} value={s}>
                            {NOSE_SHAPE_LABELS[s]}
                          </option>
                        ))}
                      </Select>
                    </label>
                  )}
                  {/* **The stated weight of the cone, and of the tube.** The two kinds every rocket
                      has were the last airframe parts a flyer could not put a scale reading on:
                      measured over the 35-design corpus, 13 body-tube and 10 nose-cone masses come
                      from the design or its own tool rather than from Loft, and Loft has read every
                      one of them since the first importer with no way to write one.

                      Unbounded, like every other stated weight here: a mass has no host to fit
                      inside. `>= 0` rather than `> 0` — a part weighed at nothing worth counting is
                      a real answer, and the EMPTY field is what means "leave it alone". */}
                  {designDims.noseMass !== undefined && (
                    <NumberField
                      label={`Nose mass (${massU})`}
                      value={toDispMass(edits.noseMass)}
                      onChange={(v) => {
                        const kg = fromMass(v);
                        onEdit({ noseMass: kg !== undefined && kg >= 0 ? kg : undefined });
                      }}
                      min={0}
                      // **Disabled only while the field is EMPTY, and that is a way back out rather
                      //  than a nicety.** A pick re-aims a live value onto the newly picked part, so
                      //  typing a weight and then clicking a part whose mass an assembly already
                      //  states left the number sitting in a box that could no longer be edited or
                      //  cleared — still an active what-if, still withholding the stored-tool
                      //  comparison, with only Undo as an exit. That is the one-way door the
                      //  `disabled` prop was added without. A field the flyer has typed into stays
                      //  editable so they can clear it; the hint still says where the weight is
                      //  counted, so nothing is hidden.
                      disabled={designDims.massCarriedBy.nose !== undefined && edits.noseMass === undefined}
                      hint={
                        designDims.massCarriedBy.nose
                          ? `Counted in ${designDims.massCarriedBy.nose}, which states one weight for itself and everything in it.`
                          : designDims.massCarriedBy.noseCoversAssembly
                            ? "This cone states one weight for itself and everything inside it — so this figure covers the assembly, not the shell."
                            : "What it actually weighs — Loft computes this from its shape and stock."
                      }
                      // No placeholder where there is no figure to show: `NaN` reaches here from a
                      // design that states its weight as a whole and none of it per part.
                      placeholder={
                        designDims.massCarriedBy.nose || !Number.isFinite(designDims.noseMass)
                          ? undefined
                          : toDispMass(designDims.noseMass)
                      }
                    />
                  )}
                  {designDims.bodyLength !== undefined && (
                    <NumberField
                      label={`Body length (${spanU})`}
                      value={toDispSpan(edits.bodyLength)}
                      placeholder={toDispSpan(designDims.bodyLength)}
                      onChange={(v) => onEdit({ bodyLength: fromSpan(v) })}
                    min={0}
                    positive
                    />
                  )}
                  {designDims.bodyTubeMass !== undefined && (
                    <NumberField
                      // **"Body tube mass", and the hint says what it does NOT cover.** A tube is the
                      // one kind whose children are the norm — fins, a lug, a mount, a chute — so a
                      // flyer who weighed the bare tube and a flyer who weighed the built section are
                      // asking two different questions. Loft takes the first, which is what
                      // OpenRocket's Override tab defaults to, and says so on the field rather than
                      // leaving the flyer to infer it from a number that moved less than they expected.
                      label={`Body tube mass (${massU})`}
                      value={toDispMass(edits.bodyTubeMass)}
                      onChange={(v) => {
                        const kg = fromMass(v);
                        onEdit({ bodyTubeMass: kg !== undefined && kg >= 0 ? kg : undefined });
                      }}
                      min={0}
                      disabled={designDims.massCarriedBy.bodyTube !== undefined && edits.bodyTubeMass === undefined}
                      hint={
                        designDims.massCarriedBy.bodyTube
                          ? `Counted in ${designDims.massCarriedBy.bodyTube}, which states one weight for itself and everything in it.`
                          : designDims.massCarriedBy.bodyTubeCoversAssembly
                            ? // The sentence below would be a flat lie on this design: the figure in
                              // the box is the tube PLUS everything inside it, because that is what
                              // the design states. `fixtures/demo-quirks.ork` is exactly this shape.
                              "This tube states one weight for itself and everything inside it — so this figure covers the assembly, not the tube alone."
                            : "The tube on its own — not the fins, mount or chute inside it."
                      }
                      placeholder={
                        designDims.massCarriedBy.bodyTube || !Number.isFinite(designDims.bodyTubeMass)
                          ? undefined
                          : toDispMass(designDims.bodyTubeMass)
                      }
                    />
                  )}
                  {designDims.bodyDiameter !== undefined && (
                    <NumberField
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
                    <NumberField
                      label={`Transition length (${spanU})`}
                      value={toDispSpan(edits.transitionLength)}
                      placeholder={toDispSpan(designDims.transitionLength)}
                      onChange={(v) => onEdit({ transitionLength: fromSpan(v) })}
                      min={0}
                      positive
                    />
                  )}
                  {designDims.transitionAftDiameter !== undefined && (
                    <NumberField
                      label={`Transition exit (${spanU})`}
                      value={toDispSpan(edits.transitionAftDiameter)}
                      placeholder={toDispSpan(designDims.transitionAftDiameter)}
                      onChange={(v) => onEdit({ transitionAftDiameter: fromSpan(v) })}
                      min={0}
                      positive
                    />
                  )}
                  {/* The boattail pair ADDS a part at the aft end of the airframe — it is not a
                      property of the tube whose caliber gates it, so it stays out of a per-part
                      surface. Same for the airframe material and the nose ballast below. */}
                  {!only && designDims.bodyDiameter !== undefined && (
                    <NumberField
                      label={`Boattail length (${spanU})`}
                      value={toDispSpan(edits.boattailLength)}
                      placeholder="0"
                      onChange={(v) => onEdit({ boattailLength: orNone(fromSpan(v)) })}
                    min={0}
                    />
                  )}
                  {!only && designDims.bodyDiameter !== undefined && (
                    <NumberField
                      label={`Boattail exit (${spanU})`}
                      value={toDispSpan(edits.boattailAftDiameter)}
                      placeholder={`< ${toDispSpan(designDims.boattailFairsTo ?? designDims.bodyDiameter)}`}
                      onChange={(v) => onEdit({ boattailAftDiameter: orNone(fromSpan(v)) })}
                    min={0}
                    />
                  )}
                </div>
                {/* R8: authoring by SELECTION rather than by measurement. It sits under the two fields
                    it writes — a flyer who owns a BT-60 says so here instead of reading a caliber and
                    a length off a rule, and the fields above then show the vendor's own figures, still
                    editable. The catalogue is a separate chunk fetched on first open; see
                    `PartPicker`. */}
                {designDims.bodyDiameter !== undefined && (
                  <PartPicker
                    kind="bodytube"
                    imperial={imperial}
                    currentOuterDiameter={edits.bodyDiameter ?? designDimsIn.bodyDiameter}
                    // The record itself is always passed, because since the pick began carrying a
                    // wall and a stock it changes the flight even with both dimension fields blank —
                    // so the clear path has to exist whenever it is set. What the MATCH governs is
                    // only the wording: the bag is persisted and replayed, so a flyer can pick a
                    // tube, retype the caliber and reload, and a caption reading "flying an Estes
                    // BT-60" would then put a vendor's part number on a number that vendor never
                    // published.
                    picked={edits.catalogBodyTube}
                    dimensionsMatch={
                      !!edits.catalogBodyTube &&
                      edits.bodyDiameter === edits.catalogBodyTube.outerDiameter &&
                      edits.bodyLength === edits.catalogBodyTube.length
                    }
                    // Both gestures NAME themselves. A three-key patch otherwise falls through
                    // `describeEdit`'s multi-field arm to "the design", so the one action on this
                    // panel with an obvious name was the one the undo button could not say — and
                    // pick-then-unpick shared a derived key, so the pair merged into a single step
                    // inside the coalescing window instead of being separately undoable.
                    // The picker hands over the catalogue row and the stock it resolved; building
                    // the edit-bag record is done HERE, beside the rest of the patch, so one picker
                    // can serve two kinds without a union type threaded through it. The picker has
                    // already refused a row that cannot be built, and `usableCatalogTube` refuses it
                    // again at apply time — this arm is the third statement of the same rule and the
                    // one that stops a partial record ever being written.
                    onPick={(p, material) => {
                      if (
                        p.outerDiameter === undefined ||
                        p.length === undefined ||
                        p.innerDiameter === undefined
                      )
                        return;
                      onEdit(
                        {
                          bodyDiameter: p.outerDiameter,
                          bodyLength: p.length,
                          catalogBodyTube: {
                            manufacturer: p.manufacturer,
                            partNumber: p.partNumber,
                            outerDiameter: p.outerDiameter,
                            length: p.length,
                            innerDiameter: p.innerDiameter,
                            // The vendor's own published weight where there is one. Seven body tubes
                            // state one and every one disagrees with the figure computed from their
                            // own geometry and stock by 3-5x — see `PickedBodyTube.mass`.
                            ...(p.mass !== undefined && p.mass > 0 ? { mass: p.mass } : {}),
                            ...(material
                              ? { material: { name: material.name, density: material.density } }
                              : {}),
                          },
                        },
                        { label: `${p.manufacturer} ${p.partNumber}`, key: `catalog-pick-${p.partNumber}` },
                      );
                    }}
                    onClear={() =>
                      onEdit(
                        {
                          bodyDiameter: undefined,
                          bodyLength: undefined,
                          catalogBodyTube: undefined,
                        },
                        { label: "the catalogue tube", key: "catalog-clear" },
                      )
                    }
                  />
                )}
                {/* The same gesture for the nose, and the catalogue describes a cone far better than
                    it describes a tube: all 854 state a contour, a base, a length, a shoulder and a
                    usable density, where 0 of 1,089 tubes state a wall. So a cone pick takes the
                    whole published part rather than two figures out of it. */}
                {designDims.noseLength !== undefined && (
                  <PartPicker
                    kind="nosecone"
                    imperial={imperial}
                    // The caliber to open on is the BODY's, not the nose's own base: a flyer looking
                    // for a cone wants the ones that fit the tube they are building on, which is
                    // exactly the fit OpenRocket filters its presets by.
                    currentOuterDiameter={edits.bodyDiameter ?? designDimsIn.bodyDiameter}
                    picked={edits.catalogNoseCone}
                    // Length and contour are the two the flyer can retype afterwards; the base, the
                    // shoulder and the wall have no fields of their own, so those cannot drift.
                    dimensionsMatch={
                      !!edits.catalogNoseCone &&
                      edits.noseLength === edits.catalogNoseCone.length &&
                      edits.noseShape === edits.catalogNoseCone.shape
                    }
                    onPick={(p, material) => {
                      if (
                        p.outerDiameter === undefined ||
                        p.length === undefined ||
                        p.shape === undefined ||
                        p.shoulderDiameter === undefined ||
                        p.shoulderLength === undefined
                      )
                        return;
                      onEdit(
                        {
                          noseLength: p.length,
                          noseShape: p.shape,
                          catalogNoseCone: {
                            manufacturer: p.manufacturer,
                            partNumber: p.partNumber,
                            outerDiameter: p.outerDiameter,
                            length: p.length,
                            shape: p.shape,
                            shoulderDiameter: p.shoulderDiameter,
                            shoulderLength: p.shoulderLength,
                            // Absent means SOLID, which is what 728 of the 854 are — see
                            // `PickedNoseCone.thickness`. `filled` is not carried separately
                            // because the two are exhaustive and disjoint over the catalogue.
                            ...(p.filled !== true && p.thickness !== undefined && p.thickness > 0
                              ? { thickness: p.thickness }
                              : {}),
                            ...(p.mass !== undefined && p.mass > 0 ? { mass: p.mass } : {}),
                            ...(material
                              ? { material: { name: material.name, density: material.density } }
                              : {}),
                          },
                        },
                        {
                          label: `${p.manufacturer} ${p.partNumber}`,
                          key: `catalog-nose-pick-${p.partNumber}`,
                        },
                      );
                    }}
                    onClear={() =>
                      onEdit(
                        {
                          noseLength: undefined,
                          noseShape: undefined,
                          catalogNoseCone: undefined,
                        },
                        { label: "the catalogue nose cone", key: "catalog-nose-clear" },
                      )
                    }
                  />
                )}
              </fieldset>
            )}

            {/* The internal structure — a coupler, a centring ring, a bulkhead, an engine block, an
                inner tube. Its own group rather than a corner of "Nose & body": the parts in that
                group are the outer mould line, and every part in this one is inside it and
                contributes mass alone. Shown only when the design carries one to hold. */}
            {designDims.internalLength !== undefined && (
              <fieldset className="min-w-0 border-0 p-0">
                {!only && (
                  <legend className={FIELDSET_LEGEND}>
                    {designDims.unreachableInternals > 0
                      ? `Internal structure — ${internalPhrase}`
                      : "Internal structure"}
                  </legend>
                )}
                {!only && designDims.unreachableInternals > 0 && (
                  // The corpus median design carries five of these and the worst carries far more, so
                  // the aim matters here more than on any other slot: the fields hold exactly one part
                  // and there is no group-broadcast rule that could make them mean more.
                  <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                    This design has {designDims.unreachableInternals} other internal{" "}
                    {designDims.unreachableInternals === 1 ? "part" : "parts"} — couplers, centring{" "}
                    rings, bulkheads and motor-mount tubes. These fields describe and change{" "}
                    {internalPhrase}; to edit another, pick it on the diagram or in the parts table{" "}
                    above.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <NumberField
                    label={`${internalSpanLabel(designDims.internalKind ?? "")} (${spanU})`}
                    value={toDispSpan(edits.internalLength)}
                    placeholder={toDispSpan(designDims.internalLength)}
                    onChange={(v) => onEdit({ internalLength: fromSpan(v) })}
                    min={0}
                    // The part cannot be longer than the one holding it — the model clamps to exactly
                    // this and the field advertises the same number, so the bound is visible before it
                    // is hit rather than after.
                    max={internalMaxSpan}
                    positive
                  />
                  {designDims.internalOuterDiameter !== undefined && (
                    <NumberField
                      label={`Outer Ø (${spanU})`}
                      value={toDispSpan(edits.internalOuterDiameter)}
                      placeholder={toDispSpan(designDims.internalOuterDiameter)}
                      onChange={(v) => onEdit({ internalOuterDiameter: fromSpan(v) })}
                      min={0}
                      max={internalMaxOuter}
                      positive
                    />
                  )}
                  {designDims.internalInnerDiameter !== undefined && (
                    <NumberField
                      label={`Bore Ø (${spanU})`}
                      value={toDispSpan(edits.internalInnerDiameter)}
                      placeholder={toDispSpan(designDims.internalInnerDiameter)}
                      onChange={(v) => onEdit({ internalInnerDiameter: fromSpan(v) })}
                      min={0}
                      // Bounded BELOW the outer diameter being flown, not at it: a bore equal to the
                      // wall is a part made of nothing. No `positive` — a bore of zero is the one
                      // real answer here, and it is what a solid bulkhead is.
                      max={internalMaxBore}
                      hint="0 is a solid disc"
                    />
                  )}
                  {/* **The mass override, on the slot that covers the largest remaining population.**
                      Measured over the corpus by kind: the five kinds this one slot addresses carry
                      45 masses the design or its tool supplied rather than Loft — 22 centring rings,
                      9 inner tubes, 8 couplers, 3 bulkheads, 3 engine blocks — more than the nose
                      cone and the body tube together. Loft has read every one of them since the
                      first importer and had no way to write one.

                      (The nose-cone figure this comment first carried was 26. Re-measured 2026-08-10
                      by two independent counts over the same 35 files — `massFrom` by kind, and every
                      `overrideMass` on a cone listed by file — it is **10**. The body tube's 13
                      reproduced exactly, so the method was right and the one number was not.)

                      Unbounded, unlike the three dimensions above: a mass has no host to fit inside.
                      `>= 0` rather than `> 0`, as on the canopy — a part weighed at nothing worth
                      counting is a real answer and the EMPTY field is what means "leave it alone". */}
                  {designDims.internalMass !== undefined && (
                    <NumberField
                      // **"Part mass", not "Mass"** — the mass-object fieldset one panel down already
                      // owns the bare word, and two controls sharing a label is ambiguous to a
                      // screen reader before it is ambiguous to a selector. Not named per kind
                      // either: this slot addresses five of them, and a label that changed as the
                      // flyer clicked between a ring and a coupler would be a moving target for the
                      // same field.
                      label={`Part mass (${massU})`}
                      value={toDispMass(edits.internalMass)}
                      onChange={(v) => {
                        const kg = fromMass(v);
                        onEdit({ internalMass: kg !== undefined && kg >= 0 ? kg : undefined });
                      }}
                      min={0}
                      disabled={designDims.massCarriedBy.internal !== undefined}
                      hint={
                        designDims.massCarriedBy.internal
                          ? `Counted in ${designDims.massCarriedBy.internal}, which states one weight for itself and everything in it.`
                          : "What it actually weighs — Loft computes this from its size and material."
                      }
                      placeholder={
                        designDims.massCarriedBy.internal ? undefined : toDispMass(designDims.internalMass)
                      }
                    />
                  )}
                </div>
              </fieldset>
            )}

            {/* The external fittings — a shock cord, a launch lug, a rail button. Its own group for
                the same reason the internal structure has one: these are neither the mould line nor
                what is inside it, they are bolted to the outside. Shown only when the design has one. */}
            {designDims.fittingMass !== undefined && (
              <fieldset className="min-w-0 border-0 p-0">
                {!only && (
                  <legend className={FIELDSET_LEGEND}>
                    {designDims.unreachableFittings > 0 ? `Fittings — ${fittingPhrase}` : "Fittings"}
                  </legend>
                )}
                {!only && designDims.unreachableFittings > 0 && (
                  <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                    This design has {designDims.unreachableFittings} other{" "}
                    {designDims.unreachableFittings === 1 ? "fitting" : "fittings"} — shock cords,{" "}
                    launch lugs and rail buttons. These fields describe and change {fittingPhrase};{" "}
                    to edit another, pick it on the diagram or in the parts table above.
                  </p>
                )}
                {/* **Why the diameter and the count are worth typing, said once and only where it is
                    true.** A lug and a button are protuberances the airframe pushes through the air
                    and the drag model squares their radius; a shock cord is inside it and reaches the
                    flight through mass alone. Saying so on all three would be a caveat that does not
                    apply to one of them, which is how a caveat stops being read. */}
                {fittingHasDrag(designDims.fittingKind ?? "") && (
                  <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Diameter and count set this fitting&apos;s frontal area, which the drag model adds
                    to the airframe&apos;s — so a pair of buttons entered as one is drag the flight is
                    not carrying.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <NumberField
                    label={`Fitting mass each (${massU})`}
                    value={toDispMass(edits.fittingMass)}
                    placeholder={
                      designDims.massCarriedBy.fitting ? undefined : toDispMass(designDims.fittingMass)
                    }
                    onChange={(v) => onEdit({ fittingMass: fromMass(v) })}
                    min={0}
                    disabled={designDims.massCarriedBy.fitting !== undefined}
                    hint={
                      designDims.massCarriedBy.fitting
                        ? `Counted in ${designDims.massCarriedBy.fitting}, which states one weight for itself and everything in it.`
                        : undefined
                    }
                  />
                  {designDims.fittingLength !== undefined && (
                    <NumberField
                      label={`Fitting length (${spanU})`}
                      value={toDispSpan(edits.fittingLength)}
                      placeholder={toDispSpan(designDims.fittingLength)}
                      onChange={(v) => onEdit({ fittingLength: fromSpan(v) })}
                      min={0}
                      positive
                    />
                  )}
                  {designDims.fittingDiameter !== undefined && (
                    <NumberField
                      label={`Fitting Ø (${spanU})`}
                      value={toDispSpan(edits.fittingDiameter)}
                      placeholder={toDispSpan(designDims.fittingDiameter)}
                      onChange={(v) => onEdit({ fittingDiameter: fromSpan(v) })}
                      min={0}
                      // A fitting wider than the airframe it is bolted to would put more frontal area
                      // on the outside of the rocket than the rocket has. The applier clamps to the
                      // same number.
                      max={fittingMaxDia}
                      positive
                    />
                  )}
                  <NumberField
                    label="How many"
                    value={edits.fittingCount !== undefined ? String(edits.fittingCount) : ""}
                    placeholder={String(designDims.fittingCount ?? 1)}
                    onChange={(v) => onEdit({ fittingCount: v === "" ? undefined : Math.round(Number(v)) })}
                    // Floored at 1: a design carrying none of a fitting is a removal, which the parts
                    // panel already has a verb for, and zero here would silently delete its drag and
                    // its mass while leaving it drawn.
                    min={1}
                    max={16}
                    positive
                  />
                </div>
              </fieldset>
            )}

            {(!only || only === "parachuteId") && (
            <fieldset className="min-w-0 border-0 p-0">
              {/* No legend inside a property surface: the surface's own heading already names the
                  part, and a legend under it would be a heading about a heading. */}
              {!only && (
              <legend className={FIELDSET_LEGEND}>
                {designDims.unreachableParachutes > 0 ? `Recovery — ${chutePhrase}` : "Recovery"}
              </legend>
              )}
              {!only && designDims.unreachableParachutes > 0 && (
                // Every dual-deploy design carries two canopies, and the fields used to resolve "the"
                // parachute as the LARGEST — so on 17 of the 35 corpus designs the drogue could not be
                // reached at all, and a flyer aiming to shrink it resized the main instead. That moves
                // landing speed and landing energy, which is what recovery sizing exists to get right.
                <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                  This design has {designDims.unreachableParachutes} other{" "}
                  {designDims.unreachableParachutes === 1 ? "canopy" : "canopies"}.{" "}
                  <em>Main chute Ø</em>, <em>Main deploy alt</em> and <em>Drogue Ø</em> describe and{" "}
                  change {chutePhrase}; to work on another, pick it in the parts table above.{" "}
                  <em>Recovery size</em>{" "}is a scale on every deployed canopy, so it is the one control{" "}
                  here that is not about one of them.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {!only && (
                <NumberField
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
                )}
                {/* **Two labels that are right on the wall and wrong on a per-part surface, and one
                    control that does not belong there at all.**

                    The wall holds ONE set of recovery fields for the whole design, so "Main deploy
                    alt" and "Main chute Ø" name which canopy they mean. A property surface is already
                    headed with the part's name, and on the drogue's panel a field labelled "Main
                    chute Ø" holding the drogue's own 460 mm is a wrong label on a number a flyer
                    sizes a recovery area with. So the aimed labels drop the "Main". Caught by a
                    pre-push review driving the drogue's panel; the field was always editing the right
                    component.

                    "Drogue Ø" goes further and is removed: on a design with one canopy it AUTHORS a
                    second, which is a change to the recovery system rather than a property of the
                    part in hand — the same reason the boattail and the payload are not here. */}
                <NumberField
                  label={only ? `Deploy altitude (${lenU})` : `Main deploy alt (${lenU})`}
                  value={toDispLen(edits.mainDeployAltitude)}
                  placeholder="apogee"
                  onChange={(v) => onEdit({ mainDeployAltitude: fromLen(v) })}
                min={0}
                positive
                />
                {!only && (
                <NumberField
                  label={`Drogue Ø (${spanU})`}
                  value={toDispSpan(edits.drogueDiameter)}
                  placeholder="0"
                  onChange={(v) => onEdit({ drogueDiameter: orNone(fromSpan(v)) })}
                min={0}
                />
                )}
                {designDims.mainParachuteDiameter !== undefined && (
                  <NumberField
                    label={only ? `Diameter (${spanU})` : `Main chute Ø (${spanU})`}
                    value={toDispSpan(edits.mainParachuteDiameter)}
                    placeholder={toDispSpan(designDims.mainParachuteDiameter)}
                    onChange={(v) => onEdit({ mainParachuteDiameter: fromSpan(v) })}
                  min={0}
                  positive
                  />
                )}
              </div>
              {/* **The coefficient the whole descent is computed from, and where it came from.**
                  R9's gap: landing speed and landing energy are what an RSO and a waiver check, this
                  is the single input that sets them, and it was on no surface in the app — a flyer
                  could not see it, could not tell whose number it was, and (still, until increment
                  5) cannot change it.

                  A `NumberField` like its four neighbours, because it is now an edit like theirs —
                  it shipped one increment earlier as a read-only note, which was the honest shape
                  while a disabled box would have advertised an edit that did not exist. The
                  provenance stays a sentence beneath it: `DESIGN.md` §6 requires a reference value
                  to name its source, and a source is not a number a field can hold.

                  The origin has four values and not the four R9's *done when* names — a different
                  four. Typing one is an origin (`"your own figure"`); a catalogue pick is not. A
                  catalogue pick cannot be one: 0 of the 151 catalogued canopies publish a
                  coefficient, so a pick leaves this field exactly as it found it — which
                  `PartPicker` already tells the flyer in words. Saying "catalogue part" here would
                  be inventing a provenance the data cannot support. */}
              {designDims.mainParachuteCd !== undefined && (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <NumberField
                      label="Canopy Cd"
                      value={edits.parachuteCd ?? ""}
                      placeholder={d.fmtEditable(designDims.mainParachuteCd, 2)}
                      min={0.1}
                      max={3}
                      step={0.05}
                      hint="Drag coefficient of the canopy — it sets descent rate, arrival speed and landing energy."
                      onChange={(v) => {
                        const n = v === "" ? undefined : Number(v);
                        onEdit({ parachuteCd: n !== undefined && n > 0 ? n : undefined });
                      }}
                    />
                    {/* **The mass override, and the first control in Loft whose job is to overrule a
                        computed figure rather than to change a dimension.** Loft derives a canopy's
                        mass from its diameter and a surface density; a real canopy arrives with
                        line, a swivel and a deployment bag that no diameter can see, which is why
                        22 of the corpus's 64 `<overridemass>` elements sit on parachutes — more
                        than on any other kind. Loft has read that element since the first importer
                        and had no way to write one.

                        `>= 0` rather than `> 0`, unlike every dimension on this surface: a canopy
                        weighed at nothing worth counting is a real answer, and the EMPTY field is
                        what means "leave it alone". Typing 0 is the flyer saying something. */}
                    <NumberField
                      label={`Canopy mass (${massU})`}
                      value={toDispMass(edits.parachuteMass)}
                      placeholder={
                        designDims.massCarriedBy.parachute
                          ? undefined
                          : toDispMass(designDims.mainParachuteMass)
                      }
                      min={0}
                      disabled={designDims.massCarriedBy.parachute !== undefined}
                      hint={
                        designDims.massCarriedBy.parachute
                          ? `Counted in ${designDims.massCarriedBy.parachute}, which states one weight for itself and everything in it.`
                          : "What the canopy, its lines and its bag actually weigh — Loft estimates this from diameter alone."
                      }
                      onChange={(v) => {
                        const kg = fromMass(v);
                        onEdit({ parachuteMass: kg !== undefined && kg >= 0 ? kg : undefined });
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Flying{" "}
                    <span className="font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                      {d.fmt(edits.parachuteCd ?? designDims.mainParachuteCd, 2)}
                    </span>{" "}
                    —{" "}
                    {cdOriginPhrase(
                      edits.parachuteCd !== undefined ? "flyer" : designDims.mainParachuteCdFrom,
                    )}
                    . A real canopy&apos;s coefficient is only known to about &plusmn;10&ndash;20%, so
                    trying the range says more than any single figure.{" "}
                    {/* The mass and its source, in the same sentence and the same shape as the
                        coefficient above it — `DESIGN.md` §6 requires a reference value to name its
                        source, and this is now two reference values sharing one caption. Reads the
                        provenance the model carries rather than re-deriving it, so a mass carried
                        from the file cannot be captioned as Loft's own. */}
                    {designDims.mainParachuteMass !== undefined && (
                      <>
                        Weighing{" "}
                        <span className="font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                          {toDispMass(edits.parachuteMass ?? designDims.mainParachuteMass)}&nbsp;{massU}
                        </span>{" "}
                        —{" "}
                        {massOriginPhrase(
                          edits.parachuteMass !== undefined ? "flyer" : designDims.mainParachuteMassFrom,
                        )}
                        .{" "}
                      </>
                    )}
                    <Link
                      href="/docs/limitations"
                      className="text-indigo-600 underline underline-offset-2 dark:text-indigo-400"
                    >
                      What backs each figure
                    </Link>
                    .
                  </p>
                </>
              )}

              {/* The third kind the catalogue can offer, and the first that is not airframe. It edits
                  the canopy that is already there — the same shape as a nose pick, and for the same
                  reason: the model requires a drag coefficient and a deploy event, and the catalogue
                  states neither, so the part being replaced is where both come from. */}
              {designDims.mainParachuteDiameter !== undefined && (
                <PartPicker
                  kind="parachute"
                  imperial={imperial}
                  picked={edits.catalogParachute}
                  // The one figure with a field of its own, so it is the only one that can drift.
                  dimensionsMatch={
                    !!edits.catalogParachute &&
                    (edits.mainParachuteDiameter === undefined ||
                      edits.mainParachuteDiameter === edits.catalogParachute.diameter)
                  }
                  onPick={(p, material) => {
                    if (p.diameter === undefined || !(p.diameter > 0)) return;
                    // **The mass, and where it comes from, in the order the evidence supports.**
                    // The vendor's own weight wins where they publish one (21 of 151) — measured,
                    // theirs and the derived figure disagree by up to 7.85x, because hem, spill
                    // hole, swivel and shroud attachment are invisible to a diameter and a surface
                    // density. Otherwise it is derived by the SAME formula the `.ork` importer uses
                    // for a hand-built chute (`parachuteMass`): canopy area x surface density, plus
                    // lines x length x line density. Using the importer's own arithmetic rather than
                    // a second one keeps a catalogue part and a typed part on one model.
                    const derived = (): number | undefined => {
                      const d = material?.density;
                      if (d === undefined || !(d > 0)) return undefined;
                      const canopy = Math.PI * (p.diameter! / 2) ** 2 * d;
                      const ld = p.lineMaterial?.density;
                      const lines =
                        p.lineCount && p.lineLength && ld && ld > 0 ? p.lineCount * p.lineLength * ld : 0;
                      return canopy + lines;
                    };
                    const mass = p.mass !== undefined && p.mass > 0 ? p.mass : derived();
                    if (mass === undefined || !(mass > 0)) return;
                    onEdit(
                      {
                        catalogParachute: {
                          manufacturer: p.manufacturer,
                          partNumber: p.partNumber,
                          diameter: p.diameter,
                          mass,
                          ...(p.lineCount !== undefined ? { lineCount: p.lineCount } : {}),
                          ...(p.lineLength !== undefined ? { lineLength: p.lineLength } : {}),
                          ...(material
                            ? { material: { name: material.name, density: material.density } }
                            : {}),
                        },
                        // **Written, not cleared**, and the difference is a number on screen that
                        // is not the one being flown. Clearing it left the "Main chute Ø" field
                        // empty, so it fell back to its placeholder — `designDims.mainParachuteDiameter`,
                        // read off the PRISTINE design — and the panel then advertised the
                        // pre-pick canopy as "the design's own" while a different one flew, with no
                        // field anywhere showing the flown size. Both sibling pickers avoid this by
                        // writing the vendor's figures into the fields the flyer can see.
                        //
                        // It is a no-op through the applier: the resize scales mass by (d/d)² = 1
                        // against the diameter the pick just wrote. It also makes `dimensionsMatch`
                        // true, which is what the caption's "Flying …" wording assumes.
                        mainParachuteDiameter: p.diameter,
                      },
                      {
                        label: `${p.manufacturer} ${p.partNumber}`,
                        key: `catalog-chute-pick-${p.partNumber}`,
                      },
                    );
                  }}
                  // Both keys go back together, with an explicit action — a two-key patch falls
                  // through `describeEdit`, which returns "the design" for anything with more than
                  // one key, so the undo control read "Undo the design" for the way back from a
                  // pick. Both sibling pickers pass one for the same reason.
                  onClear={() =>
                    onEdit(
                      { catalogParachute: undefined, mainParachuteDiameter: undefined },
                      { label: "the catalogue parachute", key: "catalog-chute-clear" },
                    )
                  }
                />
              )}
            </fieldset>
            )}

            {(!only || only === "massObjectId") && (
            <fieldset className="min-w-0 border-0 p-0">
              {!only && (
              <legend className={FIELDSET_LEGEND}>
                Mass &amp; finish
              </legend>
              )}
              {!only && designDims.unreachableMassObjects > 0 && (
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
                  <NumberField
                    label={`Mass (${massU})`}
                    value={toDispMass(edits.massObjectMass)}
                    placeholder={
                      designDims.massCarriedBy.massObject ? undefined : toDispMass(designDims.massObjectMass)
                    }
                    onChange={(v) => onEdit({ massObjectMass: fromMass(v) })}
                    min={0}
                    disabled={designDims.massCarriedBy.massObject !== undefined}
                    hint={
                      designDims.massCarriedBy.massObject
                        ? `Counted in ${designDims.massCarriedBy.massObject}, which states one weight for itself and everything in it.`
                        : undefined
                    }
                  />
                )}
                {designDims.massObjectStation !== undefined && (
                  <NumberField
                    label={`Mass pos (${spanU})`}
                    value={toDispSpan(edits.massObjectStation)}
                    placeholder={toDispSpan(designDims.massObjectStation)}
                    onChange={(v) => onEdit({ massObjectStation: fromSpan(v) })}
                    min={0}
                  />
                )}
                {!only && (
                <NumberField
                  label={`Nose ballast (${massU})`}
                  value={toDispMass(edits.ballastKg)}
                  placeholder="0"
                  onChange={(v) => onEdit({ ballastKg: orNone(fromMass(v)) })}
                min={0}
                />
                )}
                {!only && designDims.payloadStation !== undefined && (
                  <NumberField
                    label={`Payload (${massU})`}
                    value={toDispMass(edits.payloadMassKg)}
                    placeholder="0"
                    onChange={(v) => onEdit({ payloadMassKg: orNone(fromMass(v)) })}
                  min={0}
                  />
                )}
                {!only && designDims.payloadStation !== undefined && (
                  <NumberField
                    label={`Payload pos (${spanU})`}
                    value={toDispSpan(edits.payloadStation)}
                    placeholder={toDispSpan(designDims.payloadStation)}
                    onChange={(v) => onEdit({ payloadStation: fromSpan(v) })}
                  min={0}
                  />
                )}
                {!only && designDims.finish !== undefined && (
                  <label className="block">
                    <span className={FIELD_LABEL}>
                      Surface finish
                    </span>
                    <Select
                      aria-label="Surface finish"
                      value={edits.finish ?? ""}
                      onChange={(e) => onEdit({ finish: e.target.value ? (e.target.value as SurfaceFinish) : undefined })}
                      className="mt-1 w-full"
                    >
                      <option value="">As designed ({FINISH_LABELS[designDims.finish]})</option>
                      {SURFACE_FINISHES.map((f) => (
                        <option key={f} value={f}>
                          {FINISH_LABELS[f]}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
                {!only && designDims.bodyDiameter !== undefined && (
                  <label className="block">
                    <span className={FIELD_LABEL}>
                      Airframe material
                    </span>
                    <Select
                      aria-label="Airframe material"
                      value={edits.airframeMaterial ?? ""}
                      onChange={(e) => onEdit({ airframeMaterial: e.target.value || undefined })}
                      className="mt-1 w-full"
                    >
                      <option value="">
                        As designed{designDims.airframeMaterial ? ` (${designDims.airframeMaterial})` : ""}
                      </option>
                      {AIRFRAME_MATERIALS.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
              </div>
            </fieldset>
            )}
          </div>
          {/* The wall's own pitch, and it belongs to the wall: it names the motor swap, the ballast,
              the boattail and the payload — four controls a per-part surface deliberately does not
              carry — so inside one it would be ninety words describing fields that are not there. */}
          {!only && (
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
          )}
        </EditorFrame>
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
    <Card as="details" pad={false} className="group">
      <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        <span>Conditions {scenario === "today" && weather ? "· today" : "· as designed"}</span>
        <span className="text-xs text-zinc-400 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-4 border-t border-zinc-100 px-4 py-4 dark:border-zinc-800">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberField
            label={`Rail length (${lenU})`}
            value={toDispLen(edits.rodLength)}
            placeholder={toDispLen(flown.rodLength)}
            onChange={(v) => onEdit({ rodLength: fromLen(v) })}
            min={0}
            positive
            max={imperial ? 66 : 20}
            hint="How much rail guides the rocket before it flies free."
          />
          <NumberField
            label="Rail angle (°)"
            value={edits.rodAngleDeg ?? ""}
            placeholder={d.fmtEditable(flown.rodAngleDeg, 1)}
            onChange={(v) => onEdit({ rodAngleDeg: v === "" ? undefined : Number(v) })}
            min={0}
            max={45}
            step={1}
            hint="Tilt from vertical, 0–45°. Past that the rocket is being thrown rather than launched, and the ascent model no longer describes it."
          />
          <NumberField
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
          <NumberField
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
          // Decision-grade by the rule P1 increment 4 set: a sentence whose purpose is to change what
          // the flyer does NEXT takes the body default. This one says a number they are about to
          // trust came from Loft rather than from their file — the same shape as the mould-line step
          // and stated-mass notices that rule promoted — and the code already treats it as a warning
          // (amber) while the type scale filed it as a footnote.
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Loft read no {listWords(defaultedNames)} from this design, so{" "}
            {defaultedNames.length === 1 ? "that field is" : "those are"} its own default.
          </p>
        )}

        <Card tone="sunken">
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
              // NOT a `Select`, so it keeps its own treatment — a free-text field, and the primitive
              // that would own this is a `TextField` P6 has not built yet. Spelled out here rather
              // than shared with the dropdowns, because the two are different controls that happen
              // to look alike today.
              className={`min-w-0 flex-1 ${TREAT_INPUT} ${TOUCH_TARGET}`}
            />
            <Button variant="primary" onClick={findWeather} disabled={wxBusy || busy}>
              {wxBusy ? "Fetching…" : "Fetch"}
            </Button>
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
              {/* The profile's own hour, said outright. The surface reading is live and the aloft
                  profile is one hour of a 24-hour forecast day, so they are two different stamps in
                  one response — and until this said so, a flyer reading a drift number had nothing
                  telling them which hour the wind above the pad came from. */}
              {weather.aloft.length} aloft levels{" "}
              {!weather.aloftTime
                ? "(hour not stated by the forecast)"
                : weather.aloftMatched
                  ? `for ${weather.aloftTime.slice(11)} local`
                  : `for ${weather.aloftTime.slice(11)} local — the forecast gave no way to tie that to the surface reading`}{" "}
              · field {toDispLen(weather.elevationMsl)} {lenU}
            </p>
          )}
        </Card>
      </div>
    </Card>
  );
}

/** A number field for a what-if. `min`/`max` are the range in which the value means something
 *  physically, not a style choice: outside it the solver still returns a number, and a confident
 *  figure computed from a rail angle of 120° or a fin count of zero is worse than no figure. The
 *  bounds reach the browser (validation, spinners, the mobile keypad) and are enforced on commit,
 *  so a typed or pasted value lands inside them and the field shows what was actually flown. */