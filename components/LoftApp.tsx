"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ImportPanel from "./ImportPanel";
import ResultsView, { type Workspace } from "./ResultsView";
import { Segmented } from "./ui";
import { importDesign, sourceTool, type OrkDocument } from "@/lib/ork/import";
import { newDesign } from "@/lib/model/starter";
import { exportOrk } from "@/lib/ork/export";
import { runFlight, pickConfig, overridesFromStored, configChoices, type FlightRun, type ConfigChoice } from "@/lib/sim/run";
import { storedTag } from "@/lib/validation/stored-status";
import {
  primaryFinSpan,
  unreachableFinSetCount,
  primaryFinSetName,
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
import type { SurfaceFinish, NoseShape, FinCrossSection } from "@/lib/model/types";
import { allMotors } from "@/lib/motors/db";
import type { ConditionOverrides } from "@/lib/sim/setup";
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
import { mToFt, ftToM, mpsToMph, mphToMps } from "@/lib/units";
import { TOUCH_TARGET } from "@/lib/ui-tokens";
import { rangeWords, refusedMessage } from "@/lib/what-if";
import * as d from "@/lib/display";
import type { UnitSystem } from "@/lib/display";

/** Friendly labels for the surface-finish picker (smoothest → roughest). */
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

interface Edits {
  /** Which fin set the fin fields describe and edit. A selection, not an edit — see hasActiveEdits. */
  finSetId?: string;
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
  bodyLength?: number; // builder edit: primary body-tube length (m)
  bodyDiameter?: number; // builder edit: primary body-tube outer diameter (m); scales the airframe
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

/** Is any what-if actually set? `applyEdit` merges patches, so clearing a field leaves its key
 *  behind holding `undefined` — a design edited and then un-edited still has a non-empty `Edits`
 *  object. "Edited" therefore means any *defined* value, never a non-empty object.
 *
 *  This is the single definition, because two of them disagreeing is what the flyer feels: the gate
 *  that hides the stored-tool comparison and the button that restores it have to answer the same
 *  question, or clearing a field leaves the comparison hidden with the way back hidden too. */
function hasActiveEdits(e: Edits): boolean {
  // `finSetId` says which component the fin fields are POINTED AT, not that anything was changed.
  // Counting it would withhold the stored-tool comparison — and hide the button that brings it
  // back — the moment a flyer clicked a fin set to look at it.
  return Object.entries(e).some(([k, v]) => k !== "finSetId" && v !== undefined && v !== "");
}

/** Same-diameter bundled motors the design could fly, with the design's own motor as the default.
 *  Built once per design/config so the picker offers a fitting alternative without editing the file. */
interface SwapInfo {
  designMotor: string;
  options: { designation: string; manufacturer: string; diameter: number; motorClass: string }[];
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
  const [weather, setWeather] = useState<WeatherConditions | null>(null);
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
      const base: ConditionOverrides = stored ? overridesFromStored(stored) : {};
      const overrides: ConditionOverrides = { ...base };
      if (e.rodLength !== undefined) overrides.rodLength = e.rodLength;
      if (e.rodAngleDeg !== undefined) overrides.rodAngleDeg = e.rodAngleDeg;
      if (e.windSpeed !== undefined) overrides.windSpeed = e.windSpeed;
      if (e.launchAltitude !== undefined) overrides.launchAltitude = e.launchAltitude;
      const usingToday = scen === "today" && wx;
      if (usingToday) {
        overrides.atmosphere = wx.atmosphere;
        overrides.windProfile = wx.windProfile;
        overrides.launchAltitude = wx.elevationMsl;
        overrides.windSpeed = wx.surfaceWindMps;
      }
      const edited = hasActiveEdits(e) || scen === "today";
      const configId = stored?.conditions.configId;
      const run = runFlight(document.rocket, {
        configId,
        overrides,
        ballastKg: e.ballastKg,
        recoveryCdScale: e.recoveryCdScale,
        motorSwap: e.motorSwap,
        geometry: {
          finSetId: e.finSetId,
          finSpan: e.finSpan,
          finCount: e.finCount,
          finRootChord: e.finRootChord,
          finTipChord: e.finTipChord,
          finSweepLength: e.finSweepLength,
          finStation: e.finStation,
          finThickness: e.finThickness,
          finCrossSection: e.finCrossSection,
          finMaterial: e.finMaterial,
          noseLength: e.noseLength,
          noseShape: e.noseShape,
          bodyLength: e.bodyLength,
          bodyDiameter: e.bodyDiameter,
          finish: e.finish,
          airframeMaterial: e.airframeMaterial,
          boattailLength: e.boattailLength,
          boattailAftDiameter: e.boattailAftDiameter,
          mainDeployAltitude: e.mainDeployAltitude,
          drogueDiameter: e.drogueDiameter,
          mainParachuteDiameter: e.mainParachuteDiameter,
          motorClusterCount: e.motorClusterCount,
          payloadMassKg: e.payloadMassKg,
          payloadStation: e.payloadStation,
        },
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
      const hasWhatIf =
        e.ballastKg !== undefined ||
        e.motorSwap !== undefined ||
        e.finSpan !== undefined ||
        e.finCount !== undefined ||
        e.finRootChord !== undefined ||
        e.finTipChord !== undefined ||
        e.finSweepLength !== undefined ||
        e.finStation !== undefined ||
        e.finThickness !== undefined ||
        e.finCrossSection !== undefined ||
        e.finMaterial !== undefined ||
        e.noseLength !== undefined ||
        e.noseShape !== undefined ||
        e.bodyLength !== undefined ||
        e.bodyDiameter !== undefined ||
        e.finish !== undefined ||
        e.airframeMaterial !== undefined ||
        (e.boattailLength !== undefined && e.boattailAftDiameter !== undefined) ||
        (e.mainDeployAltitude !== undefined && e.drogueDiameter !== undefined) ||
        e.mainParachuteDiameter !== undefined ||
        e.motorClusterCount !== undefined ||
        e.payloadMassKg !== undefined;
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
      resume?: { edits: Edits; simIndex: number },
    ) => {
      const e = resume?.edits ?? {};
      const idx = resume?.simIndex ?? 0;
      setDoc(document);
      setFileName(name);
      setEdits(e);
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
        const { run: r, baseline: b } = compute(document, e, null, "design", idx);
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
    const geometry = {
      finSetId: edits.finSetId,
      finSpan: edits.finSpan,
      finCount: edits.finCount,
      finRootChord: edits.finRootChord,
      finTipChord: edits.finTipChord,
      finSweepLength: edits.finSweepLength,
      finStation: edits.finStation,
      finThickness: edits.finThickness,
      finCrossSection: edits.finCrossSection,
      finMaterial: edits.finMaterial,
      noseLength: edits.noseLength,
      noseShape: edits.noseShape,
      bodyLength: edits.bodyLength,
      bodyDiameter: edits.bodyDiameter,
      finish: edits.finish,
      airframeMaterial: edits.airframeMaterial,
      boattailLength: edits.boattailLength,
      boattailAftDiameter: edits.boattailAftDiameter,
      mainDeployAltitude: edits.mainDeployAltitude,
      drogueDiameter: edits.drogueDiameter,
      mainParachuteDiameter: edits.mainParachuteDiameter,
      motorClusterCount: edits.motorClusterCount,
      payloadMassKg: edits.payloadMassKg,
      payloadStation: edits.payloadStation,
    };
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

  const rerun = useCallback(
    (e: Edits, wx: WeatherConditions | null, scen: "design" | "today") => {
      if (!doc) return;
      try {
        const { run: r, baseline: b } = compute(doc, e, wx, scen, simIndex);
        setRun(r);
        setBaseline(b);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not simulate.");
      }
    },
    [doc, compute, simIndex],
  );

  const applyEdit = (patch: Edits) => {
    const next = { ...edits, ...patch };
    setEdits(next);
    rerun(next, weather, scenario);
  };

  // Clear every what-if — design edits, condition edits, and today's-weather — and re-fly the design
  // exactly as the file describes it, restoring the stored-tool comparison. The counterpart to the
  // build-by-editing loop: one step back to the untouched design without unloading it.
  const editsActive = scenario === "today" || hasActiveEdits(edits);
  const resetEdits = () => {
    setEdits({});
    setWeather(null);
    setScenario("design");
    rerun({}, null, "design");
  };

  const selectConfig = (idx: number) => {
    setSimIndex(idx);
    if (!doc) return;
    try {
      const { run: r, baseline: b } = compute(doc, edits, weather, scenario, idx);
      setRun(r);
      setBaseline(b);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not simulate.");
    }
  };

  const reset = () => {
    setDoc(null);
    setRun(null);
    setBaseline(null);
    setError(null);
    setFileName("");
    setEdits({});
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
  const swapInfo = useMemo<SwapInfo | null>(() => {
    if (!doc) return null;
    const sim = doc.simulations[simIndex] ?? doc.simulations[0];
    // The config Loft actually flies — the stored sim's when it names one, otherwise the design's
    // default (pickConfig, the same resolution the simulator uses). So a design imported without any
    // stored simulation — a hand-authored or exported file — still offers same-casing swaps.
    const config = pickConfig(doc.rocket, sim?.conditions.configId);
    const motor = config?.instances[0]?.motor;
    if (!motor?.designation) return null;
    const diaMm = Math.round((motor.diameter ?? 0) * 1000);
    if (!(diaMm > 0)) return null;
    const options = allMotors()
      .filter((m) => Math.round(m.curve.diameterMm) === diaMm)
      .sort((a, b) => a.curve.totalImpulse - b.curve.totalImpulse)
      .map((m) => ({
        designation: m.designation,
        manufacturer: m.manufacturer ?? m.curve.manufacturer ?? "",
        diameter: m.curve.diameterMm / 1000,
        motorClass: m.curve.motorClass,
      }));
    return { designMotor: motor.designation, options };
  }, [doc, simIndex]);

  // The design's own dimensions, shown as the starting points for the builder edits.
  const designDims = useMemo(
    () =>
      doc
        ? {
            // Every fin readback takes the selected set, so the value the field shows to edit FROM
            // is the same set the edit is written TO. Undefined selection = the frontmost set.
            finSpan: primaryFinSpan(doc.rocket, edits.finSetId),
            unreachableFinSets: unreachableFinSetCount(doc.rocket, edits.finSetId),
            finSetName: primaryFinSetName(doc.rocket, edits.finSetId),
            finCount: primaryFinCount(doc.rocket, edits.finSetId),
            finRootChord: primaryFinRootChord(doc.rocket, edits.finSetId),
            finTipChord: primaryFinTipChord(doc.rocket, edits.finSetId),
            finSweepLength: primaryFinSweep(doc.rocket, edits.finSetId),
            finStation: primaryFinStation(doc.rocket, edits.finSetId),
            finThickness: primaryFinThickness(doc.rocket, edits.finSetId),
            finCrossSection: primaryFinCrossSection(doc.rocket, edits.finSetId),
            finMaterial: primaryFinMaterial(doc.rocket, edits.finSetId),
            noseLength: primaryNose(doc.rocket)?.length,
            noseShape: primaryNoseShape(doc.rocket),
            bodyLength: primaryBodyTube(doc.rocket)?.length,
            bodyDiameter: primaryBodyDiameter(doc.rocket),
            finish: primaryFinish(doc.rocket),
            airframeMaterial: primaryAirframeMaterial(doc.rocket),
            mainParachuteDiameter: primaryParachute(doc.rocket)?.diameter,
            motorClusterCount: primaryMotorClusterCount(doc.rocket),
            payloadStation: defaultPayloadStation(doc.rocket),
          }
        : {
            finSpan: undefined,
            unreachableFinSets: 0,
            finSetName: undefined,
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
            finish: undefined,
            airframeMaterial: undefined,
            mainParachuteDiameter: undefined,
            motorClusterCount: undefined,
            payloadStation: undefined,
          },
    // The fin readbacks take the selected set, so the selection is a real dependency: without it
    // the panel keeps showing the frontmost set's numbers while the edit writes to the picked one.
    [doc, edits.finSetId],
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
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={reset}
                className={`inline-flex items-center gap-1.5 text-sm text-zinc-600 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white ${TOUCH_TARGET}`}
              >
                <span aria-hidden>←</span> Import another
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
                className={`inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:border-indigo-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 ${TOUCH_TARGET}`}
              >
                Download .ork
              </button>
              {editsActive && (
                <button
                  type="button"
                  onClick={resetEdits}
                  title="Clear every what-if and re-fly the design as the file describes it"
                  className={`inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:border-indigo-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 ${TOUCH_TARGET}`}
                >
                  Reset to as-designed
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
            weather={weather}
            scenario={scenario}
            setScenario={(s) => {
              setScenario(s);
              rerun(edits, weather, s);
            }}
            onWeather={(wx) => {
              setWeather(wx);
              setScenario("today");
              rerun(edits, wx, "today");
            }}
            busy={busy}
            tool={toolName}
          />

          {run && (
            <ResultsView
              run={run}
              doc={doc}
              units={units}
              baseline={baseline}
              simIndex={simIndex}
              ballastKg={edits.ballastKg}
              recoveryCdScale={edits.recoveryCdScale}
              motorSwap={edits.motorSwap}
              geometry={{
                finSetId: edits.finSetId,
                finSpan: edits.finSpan,
                finCount: edits.finCount,
                finRootChord: edits.finRootChord,
                finTipChord: edits.finTipChord,
                finSweepLength: edits.finSweepLength,
                finStation: edits.finStation,
                finThickness: edits.finThickness,
                finCrossSection: edits.finCrossSection,
                finMaterial: edits.finMaterial,
                noseLength: edits.noseLength,
                noseShape: edits.noseShape,
                bodyLength: edits.bodyLength,
                bodyDiameter: edits.bodyDiameter,
                finish: edits.finish,
                airframeMaterial: edits.airframeMaterial,
                boattailLength: edits.boattailLength,
                boattailAftDiameter: edits.boattailAftDiameter,
                mainDeployAltitude: edits.mainDeployAltitude,
                drogueDiameter: edits.drogueDiameter,
                mainParachuteDiameter: edits.mainParachuteDiameter,
                motorClusterCount: edits.motorClusterCount,
                payloadMassKg: edits.payloadMassKg,
                payloadStation: edits.payloadStation,
              }}
              swapOptions={swapInfo?.options}
              designMotor={swapInfo?.designMotor}
              onEditGeometry={applyEdit}
              onSelectFinSet={(id) => applyEdit({ finSetId: id ?? undefined })}
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
    finSetName?: string;
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
    finish?: SurfaceFinish;
    airframeMaterial?: string;
    mainParachuteDiameter?: number;
    motorClusterCount?: number;
    payloadStation?: number;
  };
}) {
  const imperial = units === "imperial";
  const lenU = imperial ? "ft" : "m";
  const toDispLen = (m: number | undefined) => (m === undefined ? "" : imperial ? mToFt(m).toFixed(1) : m.toFixed(1));
  const fromLen = (v: string) => (v === "" ? undefined : imperial ? ftToM(Number(v)) : Number(v));
  const massU = imperial ? "oz" : "g";
  const toDispMass = (kg: number | undefined) =>
    kg === undefined ? "" : imperial ? (kg * 35.274).toFixed(1) : (kg * 1000).toFixed(0);
  const fromMass = (v: string) =>
    v === "" || Number(v) === 0 ? undefined : imperial ? Number(v) / 35.274 : Number(v) / 1000;
  const spanU = imperial ? "in" : "mm";
  const toDispSpan = (m: number | undefined) =>
    m === undefined ? "" : imperial ? (m * 39.3701).toFixed(2) : (m * 1000).toFixed(0);
  const fromSpan = (v: string) =>
    v === "" || Number(v) === 0 ? undefined : imperial ? Number(v) / 39.3701 : Number(v) / 1000;
  const toDispThick = (m: number | undefined) =>
    m === undefined ? "" : imperial ? (m * 39.3701).toFixed(3) : (m * 1000).toFixed(1);

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
                  {designDims.unreachableFinSets > 0 ? `Fins — ${designDims.finSetName}` : "Fins"}
                </legend>
                {designDims.unreachableFinSets > 0 && (
                  // A staged or podded design carries sets that legitimately differ. These fields
                  // describe one of them at a time — say which, and say how to aim them at another,
                  // rather than letting one unlabelled control stand for all of them.
                  <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                    This design has {designDims.unreachableFinSets} other fin{" "}
                    {designDims.unreachableFinSets === 1 ? "set" : "sets"} with different dimensions.
                    These fields describe and change {designDims.finSetName}; to edit another, pick it
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
                    />
                  )}
                  {designDims.finTipChord !== undefined && (
                    <Num
                      label={`Fin tip (${spanU})`}
                      value={toDispSpan(edits.finTipChord)}
                      placeholder={toDispSpan(designDims.finTipChord)}
                      onChange={(v) => onEdit({ finTipChord: fromSpan(v) })}
                    min={0}
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
                    />
                  )}
                  {designDims.finThickness !== undefined && (
                    <Num
                      label={`Fin thickness (${spanU})`}
                      value={toDispThick(edits.finThickness)}
                      placeholder={toDispThick(designDims.finThickness)}
                      onChange={(v) => onEdit({ finThickness: fromSpan(v) })}
                    min={0}
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
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {designDims.noseLength !== undefined && (
                    <Num
                      label={`Nose length (${spanU})`}
                      value={toDispSpan(edits.noseLength)}
                      placeholder={toDispSpan(designDims.noseLength)}
                      onChange={(v) => onEdit({ noseLength: fromSpan(v) })}
                    min={0}
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
                    />
                  )}
                  {designDims.bodyDiameter !== undefined && (
                    <Num
                      label={`Body diameter (${spanU})`}
                      value={toDispSpan(edits.bodyDiameter)}
                      placeholder={toDispSpan(designDims.bodyDiameter)}
                      onChange={(v) => onEdit({ bodyDiameter: fromSpan(v) })}
                    min={0}
                    />
                  )}
                  {designDims.bodyDiameter !== undefined && (
                    <Num
                      label={`Boattail length (${spanU})`}
                      value={toDispSpan(edits.boattailLength)}
                      placeholder="0"
                      onChange={(v) => onEdit({ boattailLength: fromSpan(v) })}
                    min={0}
                    />
                  )}
                  {designDims.bodyDiameter !== undefined && (
                    <Num
                      label={`Boattail exit (${spanU})`}
                      value={toDispSpan(edits.boattailAftDiameter)}
                      placeholder={`< ${toDispSpan(designDims.bodyDiameter)}`}
                      onChange={(v) => onEdit({ boattailAftDiameter: fromSpan(v) })}
                    min={0}
                    />
                  )}
                </div>
              </fieldset>
            )}

            <fieldset className="min-w-0 border-0 p-0">
              <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Recovery
              </legend>
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
                />
                <Num
                  label={`Drogue Ø (${spanU})`}
                  value={toDispSpan(edits.drogueDiameter)}
                  placeholder="0"
                  onChange={(v) => onEdit({ drogueDiameter: fromSpan(v) })}
                min={0}
                />
                {designDims.mainParachuteDiameter !== undefined && (
                  <Num
                    label={`Main chute Ø (${spanU})`}
                    value={toDispSpan(edits.mainParachuteDiameter)}
                    placeholder={toDispSpan(designDims.mainParachuteDiameter)}
                    onChange={(v) => onEdit({ mainParachuteDiameter: fromSpan(v) })}
                  min={0}
                  />
                )}
              </div>
            </fieldset>

            <fieldset className="min-w-0 border-0 p-0">
              <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Mass &amp; finish
              </legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Num
                  label={`Nose ballast (${massU})`}
                  value={toDispMass(edits.ballastKg)}
                  placeholder="0"
                  onChange={(v) => onEdit({ ballastKg: fromMass(v) })}
                min={0}
                />
                {designDims.payloadStation !== undefined && (
                  <Num
                    label={`Payload (${massU})`}
                    value={toDispMass(edits.payloadMassKg)}
                    placeholder="0"
                    onChange={(v) => onEdit({ payloadMassKg: fromMass(v) })}
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
            It&apos;s a hypothetical change to the design, so the {tool} comparison is hidden while
            any is set. The geometry fields start from the design&apos;s own dimensions; only motors
            that fit this airframe&apos;s diameter are offered.
          </p>
        </div>
  );
}

function ConditionsControls({
  units,
  edits,
  onEdit,
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
  const toDispLen = (m: number | undefined) => (m === undefined ? "" : imperial ? mToFt(m).toFixed(1) : m.toFixed(1));
  const toDispSpd = (mps: number | undefined) => (mps === undefined ? "" : imperial ? mpsToMph(mps).toFixed(0) : mps.toFixed(1));
  const fromLen = (v: string) => (v === "" ? undefined : imperial ? ftToM(Number(v)) : Number(v));
  const fromSpd = (v: string) => (v === "" ? undefined : imperial ? mphToMps(Number(v)) : Number(v));

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
            placeholder="1.2"
            onChange={(v) => onEdit({ rodLength: fromLen(v) })}
            min={0}
            max={imperial ? 66 : 20}
            hint="How much rail guides the rocket before it flies free."
          />
          <Num
            label="Rail angle (°)"
            value={edits.rodAngleDeg ?? ""}
            placeholder="0"
            onChange={(v) => onEdit({ rodAngleDeg: v === "" ? undefined : Number(v) })}
            min={0}
            max={45}
            step={1}
            hint="Tilt from vertical, 0–45°. Past that the rocket is being thrown rather than launched, and the ascent model no longer describes it."
          />
          <Num
            label={`Surface wind (${spdU})`}
            value={toDispSpd(edits.windSpeed)}
            placeholder="0"
            onChange={(v) => onEdit({ windSpeed: fromSpd(v) })}
            disabled={scenario === "today"}
            min={0}
            max={imperial ? 90 : 40}
            hint="Wind speed at the pad. Direction is a separate thing — a negative speed is not a wind from the other side."
          />
          <Num
            label={`Field elev. (${lenU})`}
            value={toDispLen(edits.launchAltitude)}
            placeholder="0"
            onChange={(v) => onEdit({ launchAltitude: fromLen(v) })}
            disabled={scenario === "today"}
            min={imperial ? -1400 : -430}
            max={imperial ? 16400 : 5000}
            hint="Height of the launch site above sea level — from the Dead Sea to the highest field anyone drives to."
          />
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Blank fields use the design&apos;s stored launch conditions. Changing any field re-flies
          the design and hides the {tool} comparison (the conditions no longer match).
        </p>

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
}) {
  const ref = useRef<HTMLInputElement>(null);
  // What the box shows. It is NOT simply `value`: while the field has focus the flyer owns the
  // text, so it can pass through states the model would reject ("1" on the way to "12", or "-" on
  // the way to "-3"). The moment focus leaves it goes back to what is being flown — see the effect.
  const [draft, setDraft] = useState(String(value ?? ""));
  // The entry that was refused, kept only to say so. Cleared as soon as the flyer types again.
  const [refused, setRefused] = useState<string | null>(null);

  // The field must never sit there showing a number that is not the one in the flight. It could:
  // the input is controlled by `value`, and an entry the model refuses leaves `value` unchanged, so
  // React sees the same prop, never re-renders the node, and the refused text stays on screen —
  // typing -3 into Fin span left "-3" in the box while the design's own 19 mm went on being flown,
  // with nothing saying so. Re-syncing whenever the field is not focused converges on the truth
  // however the parent resolved the entry: accepted, clamped, or dropped.
  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(String(value ?? ""));
  });

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
    setRefused(bounded !== n ? raw : null);
    if (String(bounded) !== raw) onChange(String(bounded));
  };

  // A bound the field doesn't have is said in words, not left as a dash. Most of these fields are
  // floored at zero and open above — a dimension has no upper limit the editor can name — and
  // "0 to –" reads as a range that failed to load rather than as "no maximum". Shared with the
  // analysis panels' number field so the two never say it differently.
  const ranged = rangeWords(min, max);
  // What the flight is actually using: the committed edit if there is one, else the design's own
  // value, which is what the placeholder shows. Naming it is the whole point of the message — the
  // complaint is not that the entry was refused, it is not knowing what is being flown instead.
  const flown = String(value ?? "") || placeholder;
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
