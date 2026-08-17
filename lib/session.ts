/** The last working session, kept in the browser so Loft picks up where it left off.
 *
 *  Loft is offline-first and the stated phone use is a pad check with no signal. Losing the
 *  loaded design on a refresh is worst exactly there: a phone reclaims a background tab's memory
 *  routinely, and the design file that would let you import again may not be on the phone at all.
 *  A reload also used to drop the unit choice and every what-if edit — a whole afternoon's trim
 *  work gone to an accidental swipe.
 *
 *  What is stored is the design's own bytes (`.ork`, `.rkt`, `.CDX1` — whatever was imported, or
 *  a serialised `.ork` for a design built here), its name, the chosen units, the flown motor
 *  configuration, and the active edits. Nothing leaves the browser: this is `localStorage` on the
 *  flyer's own device, the same place the theme choice lives, and it is cleared by starting over
 *  or by clearing site data. There is no account and no upload.
 */

import { useCallback, useEffect, useState } from "react";
import { isEditedValue } from "./model/edit";
import { resolveWorkspace, type Workspace } from "./workspaces";
import { plainConditions, rehydrateConditions, type WeatherConditions } from "./weather";
import { HISTORY_DEPTH } from "./model/history";

const KEY = "loft.session";
/** localStorage is typically a ~5 MB budget for the whole origin, and base64 costs a third on top
 *  of the raw bytes. A design far past this is a pathological file, not a rocket; it simply isn't
 *  remembered rather than evicting everything else the site keeps. */
const MAX_BYTES = 1_500_000;
/** How long stored conditions stay this hour's. One hour, because that is the grid the forecast is
 *  reported on and the unit `aloftTime` names. */
const WEATHER_MAX_AGE_MS = 60 * 60 * 1000;

export interface SavedSession {
  /** Schema version — a stored session from an older shape is discarded, never half-read. */
  v: 1;
  /** The design file's own bytes, base64-encoded. */
  design: string;
  /** File name (or the built design's name), as shown in the header. */
  name: string;
  /** Which workspace this design opens on — an import leads with its flight, a build with design,
   *  and a session that was left on another picks that one back up. Since each workspace became a
   *  route, this is the ADDRESS a resume without one of its own returns to; a deep link outranks it,
   *  because a link a flyer followed is not a suggestion. */
  opensOn: Workspace;
  units: "metric" | "imperial";
  /** Index into the design's stored simulations — which motor configuration was being flown. */
  simIndex: number;
  /** Active what-if / builder edits, as the app's own `Edits` shape. */
  edits: Record<string, unknown>;
  /** The rocket's own name, which a rename changes independently of the file name. Optional because a
   *  session stored before this existed has none. Used for LABELLING only — the restore path still
   *  goes through `name`, which is the file identity the rest of the app keys off. Without it a
   *  from-scratch build is offered back as "New design" however the flyer renamed it, and a renamed
   *  import is offered back under its original file name. The recents shelf already carries the same
   *  distinction for the same reason. */
  rocket?: string;
  /** The undo/redo stack, so leaving the workspace does not throw the flyer's edits away.
   *
   *  **The seam this exists for is not a reload.** The app's shell lives above the four workspace
   *  routes precisely so moving between them keeps the design, its edits and its undo stack — but
   *  `/docs/*` resolves through a different layout, so following one of the docs links the app plants
   *  beside its own numbers unmounts the shell. The design came back from here; the stack did not.
   *
   *  Typed loosely for the reason `edits` is: this module is storage, and the shapes it carries
   *  belong to the app. Optional because a session written before this existed has none, and because
   *  it is the first thing dropped when the record will not fit — see `writeSlot`. */
  history?: { past: readonly unknown[]; future: readonly unknown[] };
  /** Today's conditions, as data, and which of the two the flyer was flying.
   *
   *  **These ride with the stack because without them the present and the stack disagree about what
   *  air is being flown.** A resume used to put the flyer back on design conditions unconditionally;
   *  once the stack survives too, undoing could jump INTO a step taken under a forecast the present
   *  did not have, and redo would drop it again. Storing the present alongside makes the two halves
   *  one state. Stored plain and rebuilt on read for the same reason every step's are — see
   *  `rehydrateConditions`. */
  weather?: unknown;
  scenario?: "design" | "today";
  /** When those conditions were FETCHED (epoch ms), and the reason they expire.
   *
   *  **The fetch, not the write, and the difference is the whole guard.** The session is written on
   *  every edit, every workspace change and every resume, so a stamp taken at write time is retaken
   *  continuously — a profile fetched at 09:00 would still read "fresh" at 17:00 for anyone who kept
   *  working, and the rule below would measure nothing. `components/LoftApp.tsx` holds the fetch time
   *  beside the conditions and carries it through a resume unchanged for exactly this reason.
   *
   *  **A forecast is for an HOUR, and nothing on screen would reveal a stale one.** `parseForecast`
   *  matches the surface reading to a specific hourly wind profile and this file's own measurement
   *  records what an unmatched one costs: at 850 hPa, 2.78 m/s from 317° where the actual hour was
   *  2.12 m/s from 163° — **154° apart**. The Conditions panel prints `aloftTime` as the hour alone,
   *  `18:00 local`, with no date, so a profile restored from a previous day reads exactly like this
   *  evening's. Drift is the number a flyer walks on.
   *
   *  So conditions are restored only while they are still this hour's, and otherwise dropped along
   *  with anything that depends on them. That is the same rule the app already applies at fetch time
   *  through `aloftMatched`; this is it applied to the delay between storing and reading, which
   *  `aloftMatched` is computed too early to see. */
  weatherAt?: number;
}

/** base64 for a byte array, without pulling in a dependency or blowing the argument limit on a
 *  large file (`String.fromCharCode(...bytes)` throws past ~100 kB). */
export function toBase64(bytes: Uint8Array): string {
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** A history stack with every set of conditions reduced to the half that can be written down — the
 *  write-side counterpart of `readHistory`, and it lives here beside it so the two cannot drift.
 *
 *  Shaped as a transform over the stack rather than a flag on the writer, so the only form that ever
 *  reaches storage is the plain one and there is no path where a live set slips through. The steps
 *  are otherwise untouched: the reader rebuilds the derived members and validates everything else, so
 *  this side only has to stop writing what cannot be read back. */
export function storableHistory(h: { past: readonly unknown[]; future: readonly unknown[] }): {
  past: readonly unknown[];
  future: readonly unknown[];
} {
  const strip = (st: unknown) => {
    const step = st as { state?: { weather?: unknown } };
    if (!step?.state) return st;
    const w = step.state.weather;
    return { ...step, state: { ...step.state, weather: w ? plainConditions(w as WeatherConditions) : null } };
  };
  return { past: h.past.map(strip), future: h.future.map(strip) };
}

/** One undo step, as `lib/model/history.ts` writes it and as `undoHistory` expects to read it back:
 *  a state object, the prose label the control shows, the coalescing key, and the clock.
 *
 *  **The `state` is where a previous attempt at this died, and it is worth naming.** A step's state
 *  is the app's `WhatIf` — edits, scenario, sim index, and the live weather CONDITIONS. Those
 *  conditions are eleven fields of data plus an `Atmosphere` class instance and a `windProfile`
 *  closure, and `JSON.stringify` drops both silently. Storing the step verbatim therefore wrote a
 *  record that looked right and threw inside the solver on replay — and because `undoStep` does not
 *  consume a step whose apply fails, the control stayed lit over a stack nothing could walk. So the
 *  conditions go through `rehydrateConditions`, which rebuilds the two derived members from the
 *  eleven stored ones, and a step whose conditions will not rebuild is not a step. */
function readStep(x: unknown): { state: Record<string, unknown>; label: string; key: string; at: number } | null {
  if (!x || typeof x !== "object") return null;
  const s = x as { state?: unknown; label?: unknown; key?: unknown; at?: unknown };
  if (!s.state || typeof s.state !== "object") return null;
  if (typeof s.label !== "string" || typeof s.key !== "string") return null;
  if (typeof s.at !== "number" || !Number.isFinite(s.at)) return null;
  const raw = s.state as Record<string, unknown>;
  // **Every field of the state, not just the one that used to break.** The conditions are the field
  // that made a previous attempt fail, so they are the field it is tempting to guard alone — but the
  // failure MODE is what matters, and it is the same for all of them: `undoStep` applies the state,
  // the apply throws, `applyWhatIfState` returns false, and a step that fails to apply is not
  // consumed. So the control stays lit over a stack nothing can walk, whichever field was wrong. A
  // step whose `edits` is a string jams it exactly as a step whose atmosphere is dead does.
  if (!raw.edits || typeof raw.edits !== "object" || Array.isArray(raw.edits)) return null;
  if (raw.scenario !== "design" && raw.scenario !== "today") return null;
  if (typeof raw.simIndex !== "number" || !Number.isInteger(raw.simIndex) || raw.simIndex < 0) return null;
  const state: Record<string, unknown> = {
    edits: raw.edits,
    scenario: raw.scenario,
    simIndex: raw.simIndex,
    weather: null,
  };
  if (raw.weather !== null && raw.weather !== undefined) {
    const live = rehydrateConditions(raw.weather);
    if (!live) return null;
    state.weather = live;
  }
  return { state, label: s.label, key: s.key, at: s.at };
}

/** The stored stack, or `undefined` if any part of it is not one. **All or nothing, deliberately:**
 *  dropping only the bad steps would silently change what "undo three times" means, which is worse
 *  than starting the flyer with a clean stack and the edits they can still see in front of them. */
function readHistory(h: SavedSession["history"]): SavedSession["history"] {
  if (!h || !Array.isArray(h.past) || !Array.isArray(h.future)) return undefined;
  // The reducer caps what it WRITES at `HISTORY_DEPTH`; nothing capped what could be read back, so a
  // hand-edited or foreign record of any length was accepted whole. The bound belongs on both sides
  // of the boundary, not only on the side this app controls.
  if (h.past.length > HISTORY_DEPTH || h.future.length > HISTORY_DEPTH) return undefined;
  const past = h.past.map(readStep);
  const future = h.future.map(readStep);
  if (past.some((x) => x === null) || future.some((x) => x === null)) return undefined;
  return { past: past as unknown[], future: future as unknown[] };
}

/** The conditions half of a stored record — the present forecast, which of the two scenarios was
 *  being flown, and the undo stack, which are read together because they expire together.
 *
 *  **A stack whose steps were taken under a forecast is only as restorable as the forecast is.** Once
 *  the conditions are too old to fly, restoring the edits without them would put a flyer on design
 *  air in a state their own undo label says was flown on today's; restoring them anyway would fly
 *  yesterday's wind under a label that shows the hour and not the date. So when the conditions have
 *  expired, they go — and so does the stack, but ONLY if the stack actually depends on them. The
 *  common session never fetches a forecast at all, and its stack is unaffected. */
function readConditions(parsed: SavedSession, now = Date.now()): Pick<SavedSession, "history" | "weather" | "scenario" | "weatherAt"> {
  const history = readHistory(parsed.history);
  const stepsNeedWeather = !!history && [...history.past, ...history.future].some(
    (st) => (st as { state?: { weather?: unknown } })?.state?.weather != null,
  );
  const hasPresent = parsed.weather !== undefined && parsed.weather !== null;
  if (!hasPresent && !stepsNeedWeather) return { history, weather: undefined, scenario: undefined, weatherAt: undefined };

  const fresh = typeof parsed.weatherAt === "number" && Number.isFinite(parsed.weatherAt) && now - parsed.weatherAt <= WEATHER_MAX_AGE_MS && now >= parsed.weatherAt;
  if (!fresh) {
    return { history: stepsNeedWeather ? undefined : history, weather: undefined, scenario: undefined, weatherAt: undefined };
  }
  const weather = hasPresent ? (rehydrateConditions(parsed.weather) ?? undefined) : undefined;
  // Conditions that will not rebuild must not leave the flyer on "today" with no air behind it.
  if (hasPresent && !weather) {
    return { history: stepsNeedWeather ? undefined : history, weather: undefined, scenario: undefined, weatherAt: undefined };
  }
  return { history, weather, scenario: parsed.scenario === "today" ? "today" : undefined, weatherAt: parsed.weatherAt };
}

/** Read one stored session slot, or null if it is absent, unreadable, or from an older schema.
 *  Rebuilt field by field rather than spread, so hand-edited storage cannot smuggle in a shape the
 *  app does not expect — which also means a field added to `SavedSession` must be named HERE too, or
 *  it is written cleanly and silently dropped on the next read. */
function readSlot(key: string): SavedSession | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSession;
    if (parsed?.v !== 1 || typeof parsed.design !== "string" || !parsed.design) return null;
    return {
      v: 1,
      design: parsed.design,
      name: typeof parsed.name === "string" ? parsed.name : "Saved design",
      // Asked of the workspace vocabulary rather than spelled out, so a workspace added there is not
      // silently discarded on the next read by a check nobody remembered to extend — and a workspace
      // that has since been SPLIT resumes on whichever route took its job, instead of falling back
      // to the flight and moving the flyer somewhere they never were.
      opensOn: resolveWorkspace(parsed.opensOn) ?? "flight",
      units: parsed.units === "imperial" ? "imperial" : "metric",
      simIndex: Number.isInteger(parsed.simIndex) ? parsed.simIndex : 0,
      edits: parsed.edits && typeof parsed.edits === "object" ? parsed.edits : {},
      rocket: typeof parsed.rocket === "string" && parsed.rocket ? parsed.rocket : undefined,
      // Named HERE as well as on the type, because this function rebuilds field by field and its
      // docblock warns that anything not named is "written cleanly and silently dropped on the next
      // read" — which on screen is indistinguishable from never having saved one.
      ...readConditions(parsed),
    };
  } catch {
    return null;
  }
}

/** Returns whether the session was actually stored. Callers that put something on SCREEN because of
 *  it need to know: an offer to restore a session that was never written is a button that does nothing,
 *  which is worse than not offering it. */
function writeSlot(key: string, s: SavedSession): boolean {
  try {
    if (s.design.length > MAX_BYTES) return false;
    localStorage.setItem(key, JSON.stringify(s));
    return true;
  } catch {
    // **Quota exceeded — and the undo stack is the part to give up, not the design.** Storage can
    // also be disabled outright (Safari private browsing), which this same branch covers.
    //
    // The stack is capped at `HISTORY_DEPTH` steps, but each step carries a whole `edits` snapshot
    // and those are append-only in the structural fields, so on a heavily built design it is the one
    // part of this record that grows in practice. `MAX_BYTES` above is measured against the design
    // alone and cannot see it. Writing the stack is a strict improvement when it fits and a strict
    // LOSS if it costs the design: a flyer who loses their rocket because the app was trying to
    // remember how to undo it has been made worse off by a feature meant to help.
    if (s.history) {
      try {
        const { history: _dropped, ...rest } = s;
        void _dropped;
        localStorage.setItem(key, JSON.stringify(rest));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

/** Read the saved session, or null if there is none, it is unreadable, or it is from an older
 *  schema. Storage can throw outright (Safari private browsing), so every access is guarded. */
export function loadSession(): SavedSession | null {
  return readSlot(KEY);
}

export function saveSession(s: SavedSession): void {
  writeSlot(KEY, s);
}

/** --- the discarded session -----------------------------------------------------------------
 *
 *  One level of undo for the one destructive act in the app. "Import another" and "Start fresh" are
 *  a single click each — the first is a text link 12 px from the design-name input — and they threw
 *  away the loaded design, every what-if set on it, and the session, with no confirmation and no way
 *  back. Measured on the 38 mm sample: a 75 mm fin span and 20 g of nose ballast take apogee from
 *  993 m to 881 m, and that click returned the flyer to an empty import screen with all of it gone.
 *
 *  Deliberately NOT the recent-designs shelf, which was the obvious place and the wrong one. The
 *  shelf is a "recent files" list keyed by name and size, with an eviction rule; hanging per-design
 *  state on it made the entry holding the work the first one evicted, gave every from-scratch build
 *  the same identity, and let any reopen that was not the shelf row wipe the state. This slot has no
 *  identity model and no eviction: it is literally the session that was just discarded, so restoring
 *  it is the same operation as resuming a session, and its limits are exactly a reload's limits.
 *
 *  Exactly one level, replaced each time a design is left, so it can never grow into a history nobody
 *  curated. */
const DISCARDED_KEY = "loft.session.discarded";

export function loadDiscardedSession(): SavedSession | null {
  return readSlot(DISCARDED_KEY);
}

/** Returns whether it was stored, so the caller only offers a way back that exists. A design past the
 *  size cap, or storage that is disabled outright, means there is nothing to offer. */
export function saveDiscardedSession(s: SavedSession): boolean {
  return writeSlot(DISCARDED_KEY, s);
}

/** How many what-ifs a stored session was carrying.
 *
 *  Uses the app's OWN definition of edited, which is not "how many keys are in the bag": the edit bag
 *  is a patch spread over the previous bag, so a field that was set and then CLEARED leaves its key
 *  behind holding `undefined`; and a selection field records which component the fields are POINTED
 *  AT, not that anything was changed. Counting either would tell a flyer their as-designed rocket is
 *  carrying changes — the same mistake, in the opposite direction, as the gate that hides the
 *  stored-tool comparison.
 *
 *  The selection fields come from `INERT_EDIT_FIELDS` rather than being spelled out here: this used to
 *  name `finSetId` alone, so the second selection field the editor grew would have counted as a
 *  what-if here while the app went on treating it as inert. `hasActiveEdits` in the app applies the
 *  same set. */
export function countWhatIfs(s: SavedSession): number {
  return Object.entries(s.edits).filter(([k, v]) => isEditedValue(k, v)).length;
}

/** Whether a session carries work that exists nowhere else. The DESIGN is on the recents shelf either
 *  way; the what-ifs and the chosen motor configuration are not, so they are what an undo slot is for.
 *  Used to stop a session with nothing to lose from evicting one that has something. */
export function carriesWork(s: SavedSession): boolean {
  return countWhatIfs(s) > 0 || s.simIndex > 0;
}

export function clearDiscardedSession(): void {
  try {
    localStorage.removeItem(DISCARDED_KEY);
  } catch {
    /* storage disabled — nothing to clear */
  }
}

/** A number the flyer set that should still be there next time — a dispersion tolerance, not a
 *  result. Kept apart from the design session above: these are the flyer's own standing assumptions
 *  about their build and their field, so they outlive whichever design is open and survive
 *  "Start fresh". Stored per key; unreadable or unavailable storage just falls back to `initial`,
 *  and the first render always uses `initial` so the server's HTML and the client's agree. */
export function usePersistedNumber(key: string, initial: number): [number, (v: number) => void] {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`loft.pref.${key}`);
      const n = raw === null ? NaN : Number(raw);
      if (Number.isFinite(n)) setValue(n);
    } catch {
      // storage disabled — keep the default
    }
  }, [key]);
  const set = useCallback(
    (v: number) => {
      setValue(v);
      try {
        localStorage.setItem(`loft.pref.${key}`, String(v));
      } catch {
        // as above
      }
    },
    [key],
  );
  return [value, set];
}

/** A choice the flyer made about how to look at their results — which dimension the sweep varies,
 *  which metric it plots, which column the motor table is sorted on. Not the flyer's input the way
 *  a dispersion tolerance is, but a view they set up deliberately, and having it snap back to the
 *  default on the next design is the same small betrayal. `allowed` guards against a stored value
 *  that no longer exists (a renamed axis, a dropped column). */
export function usePersistedChoice<T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`loft.pref.${key}`) as T | null;
      if (raw !== null && allowed.includes(raw)) setValue(raw);
    } catch {
      // storage disabled — keep the default
    }
    // `allowed` is a literal list at every call site; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(`loft.pref.${key}`, v);
      } catch {
        // as above
      }
    },
    [key],
  );
  return [value, set];
}

/** --- the recent-designs shelf ------------------------------------------------------------------
 *
 *  Loft holds one design at a time, but a flyer working across a build does not: a booster and its
 *  sustainer, this year's cert rocket and last year's, the same airframe on two motor mounts. Every
 *  design that gets opened is kept here on the device — the same bytes the session keeps, under a
 *  separate key — so any of them can be reopened later without going back to the file. It is the
 *  "recent files" the desktop tools have, minus the filesystem: at the pad the file may not be on
 *  the phone at all.
 *
 *  Deliberately separate from the active session above: this shelf is additive, so a shelf that
 *  cannot be read or written never costs the flyer the design they have open. */
const RECENTS_KEY = "loft.recents";
/** How many designs the shelf holds. Past this the least-recently-opened is dropped — enough for a
 *  build's worth of variants without spending the origin's whole storage budget on history. */
export const MAX_RECENTS = 8;
/** Total base64 the shelf may hold, so history never crowds out the active session (which has its
 *  own MAX_BYTES allowance on top). Oldest entries go first until the shelf fits. */
const MAX_RECENTS_BYTES = 2_500_000;
/** The same figure in MB, for the one sentence that has to state it to a flyer. */
export const MAX_RECENTS_MB = Math.round(MAX_RECENTS_BYTES / 1_000_000);

/** A design taken off the shelf and held so it can be put back: the stored row itself, the position
 *  it came from, and the reason a restore was refused if one was. */
export interface RemovedRecent {
  entry: RecentDesign;
  index: number;
  refusal?: string;
}

export interface RecentDesign {
  /** Stable id, so reopening the same design updates its entry rather than adding another. */
  id: string;
  /** The design file's own bytes, base64-encoded — the same verbatim bytes the session keeps. */
  design: string;
  /** Display name (the file name, or the built design's name). */
  name: string;
  /** The rocket's own name, which a rename changes independently of the file name. */
  rocket: string;
  /** Epoch ms when it was last opened — the shelf's order and its eviction rule. */
  openedAt: number;
}

/** An id for a design: its name and its size, which is stable across reopening the same file and
 *  distinct between two designs a flyer would call different. Two genuinely different designs that
 *  collide here would overwrite each other's entry — a name-and-size collision, which in practice
 *  means the same file. */
function recentId(name: string, design: string): string {
  return `${name}:${design.length}`;
}

export function loadRecents(): RecentDesign[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (r): r is RecentDesign =>
          !!r &&
          typeof r === "object" &&
          typeof (r as RecentDesign).design === "string" &&
          !!(r as RecentDesign).design &&
          typeof (r as RecentDesign).name === "string",
      )
      .map((r) => ({
        id: typeof r.id === "string" && r.id ? r.id : recentId(r.name, r.design),
        design: r.design,
        name: r.name,
        rocket: typeof r.rocket === "string" ? r.rocket : r.name,
        openedAt: Number.isFinite(r.openedAt) ? r.openedAt : 0,
      }))
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

function writeRecents(list: RecentDesign[]): void {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
  } catch {
    // Quota exceeded or storage disabled. History is a convenience; losing it must never break the
    // design that is actually open.
  }
}

/** Record a design on the shelf, newest first, evicting by age until it fits both caps. Returns the
 *  shelf as it now stands so a caller can render it without re-reading storage. */
export function rememberRecent(entry: Omit<RecentDesign, "id" | "openedAt">, now: number): RecentDesign[] {
  const id = recentId(entry.name, entry.design);
  const kept = loadRecents().filter((r) => r.id !== id);
  let list = [{ ...entry, id, openedAt: now }, ...kept].slice(0, MAX_RECENTS);
  let total = list.reduce((n, r) => n + r.design.length, 0);
  while (list.length > 1 && total > MAX_RECENTS_BYTES) {
    total -= list[list.length - 1].design.length;
    list = list.slice(0, -1);
  }
  writeRecents(list);
  return list;
}

/** Bring a shelf row up to date with the design it names, replacing the row `oldId` rather than
 *  adding a second one beside it.
 *
 *  A plain `rememberRecent` cannot do this. Its id is `name:byteLength`, so re-recording an edited
 *  design mints a DIFFERENT id — the stale row survives and the shelf grows a duplicate of the same
 *  design at two different moments in its life. Dropping `oldId` first is the whole point.
 *
 *  This exists because the shelf held a design the flyer never had. A from-scratch build is
 *  serialised to bytes ONCE, before the first keystroke, and every edit after that lives in the edit
 *  bag — so the row said "New design" and handed back the factory starter, losing the build with no
 *  way back. Measured through the shipped UI: a starter edited to an 85 mm fin span flies 930 m at
 *  2.19 cal, and reopening it from the shelf gave 994 m at 1.53 cal, the untouched starter. */
export function replaceRecent(
  oldId: string,
  entry: Omit<RecentDesign, "id" | "openedAt">,
  now: number,
): RecentDesign[] {
  const id = recentId(entry.name, entry.design);
  // Keep the row's ORIGINAL position in time. The flyer did not just open this design; they have
  // been working in it, and re-stamping it would reorder a shelf sorted by when things were opened.
  const previous = loadRecents().find((r) => r.id === oldId);
  const openedAt = previous?.openedAt ?? now;
  const kept = loadRecents().filter((r) => r.id !== oldId && r.id !== id);
  let list = [{ ...entry, id, openedAt }, ...kept]
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, MAX_RECENTS);
  let total = list.reduce((n, r) => n + r.design.length, 0);
  while (list.length > 1 && total > MAX_RECENTS_BYTES) {
    total -= list[list.length - 1].design.length;
    list = list.slice(0, -1);
  }
  writeRecents(list);
  return list;
}

/** Drop one design from the shelf — the flyer's own "I'm done with that one". */
export function forgetRecent(id: string): RecentDesign[] {
  const list = loadRecents().filter((r) => r.id !== id);
  writeRecents(list);
  return list;
}

/** Put a removed design back, exactly as it was. The undo for `forgetRecent`.
 *
 *  This is deliberately NOT `rememberRecent`, and that is the whole design. An earlier attempt at
 *  this undo replayed the add path with the row's original timestamp and was reverted, because the
 *  add path's job is to make room: it prepends, caps at `MAX_RECENTS`, and then evicts by age until
 *  the byte budget fits. Run to restore a MIDDLE row into a full shelf, it put the row back and
 *  permanently deleted the oldest design instead — one destructive act undone by another.
 *
 *  So this path never evicts and never reorders. It keeps the entry's own `openedAt`, which is what
 *  `loadRecents` sorts by, so the row returns to the position it was removed from rather than to the
 *  front. And it REFUSES rather than trimming when putting the row back would not fit: it returns
 *  null and the shelf is left untouched, so the caller can say so instead of silently costing the
 *  flyer a different design.
 *
 *  In practice the refusal is unreachable from one tab — the offer is cleared on every design load,
 *  so between the removal and the restore the shelf can only shrink. It is here for the case that
 *  makes it reachable at all: a second tab filling the shelf from the same origin's storage. */
export function restoreRecent(entry: RecentDesign, index: number): RecentDesign[] | null {
  const list = loadRecents();
  // Already there, by whatever route. Nothing to do — and REPLACING it would be the destructive act
  // this function exists to avoid: `recentId` is name-plus-byte-length, so a collision is a row the
  // flyer can still see and open, and dropping it for a stale copy is a deletion wearing an undo's
  // clothes.
  if (list.some((r) => r.id === entry.id)) return list;
  // Inserted at the position it was removed from, not appended and sorted. `loadRecents` re-sorts by
  // `openedAt` and its sort is stable, so for distinct timestamps either would do — but two designs
  // opened in the same millisecond are ordinary on a scripted or fast sequence, and an appended row
  // lands after its tie-mates instead of back where it was.
  const at = Math.min(Math.max(index, 0), list.length);
  const next = [...list.slice(0, at), entry, ...list.slice(at)];
  if (next.length > MAX_RECENTS) return null;
  // The single-entry exemption mirrors `rememberRecent`, whose trim loop is `list.length > 1` for the
  // same reason: a design larger than the shelf's whole budget is KEPT when it is the only one, so
  // without this exemption such a design could be removed and never put back. That is the one-way
  // door this function exists to close, rebuilt inside the fix for it.
  if (next.length > 1 && next.reduce((n, r) => n + r.design.length, 0) > MAX_RECENTS_BYTES) return null;
  writeRecents(next);
  // Read back rather than returning what was written. `loadRecents` sorts by `openedAt` and the
  // written array is only an insertion order — returning it hands the caller a shelf a reload would
  // not reproduce, and the caller renders it. (The write still has to carry the insertion position:
  // that sort is stable, so it is what places a restored row among rows sharing a timestamp.)
  return loadRecents();
}

export function clearRecents(): void {
  try {
    localStorage.removeItem(RECENTS_KEY);
  } catch {
    // as above
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // as above
  }
}

/** --- the finished dispersion --------------------------------------------------------------------
 *
 *  A Monte-Carlo is 300 flights, and the app plants a link to the method that explains it directly
 *  beside the numbers it produces. Following that link resolves through a different layout, so the
 *  shell unmounts and the cloud is gone; coming back re-flies the whole run. This slot is what makes
 *  the trip survivable.
 *
 *  **It is deliberately NOT in `SavedSession`, and the reason is a measurement.** That record is
 *  rewritten on every edit, every workspace change and every resume — in practice once per keystroke
 *  — and a finished 300-flight result is **78,649 bytes of JSON, 77,619 of it the samples** (measured
 *  on the 38 mm sample; the summary alone is 1,030). Putting it in the session would add a 77 KB
 *  synchronous `JSON.stringify` and `setItem` to every keystroke, on the main thread, on the phone
 *  §8 is written for — and it would put a derived cache inside the record whose quota path is already
 *  choosing what to sacrifice to keep the flyer's rocket. So it is its own slot, written ONCE when a
 *  run completes, and losing it costs nothing but the run.
 *
 *  **What makes it safe to read back is the key, not the bytes.** A restored cloud that does not
 *  belong to the design, the conditions and the tolerances now on screen is a wrong number on the
 *  surface a flyer sizes a recovery area from. So the entry carries the exact identity of the run
 *  that produced it and the reader refuses anything else — see `runKey` at its only call site. */
const DISPERSION_KEY = "loft.dispersion";

export interface StoredDispersion {
  v: 1;
  /** Which design this was flown for, stable across a load — see `designFingerprint`. Held apart
   *  from `runKey` because the two answer different questions: this one decides whether the panel
   *  should be OPEN at all when the flyer comes back, and it can be answered on the first render;
   *  `runKey` decides whether the stored numbers may be SHOWN, and it cannot, because the flyer's
   *  own dispersion tolerances arrive from storage an effect later. */
  designId: string;
  /** The full identity of the run: the design, its edits, the conditions flown, the tolerances, and
   *  the sample count and seed. Compared verbatim; anything else re-flies. */
  runKey: string;
  /** The result, already reduced to the half that survives JSON — see `plainResult`. Typed loosely
   *  for the reason `edits` is: this module is storage, and the shape belongs to the simulation. */
  result: unknown;
  /** When the run finished (epoch ms). Not used to expire it — the key already decides validity —
   *  but a stored answer with no clock is one nothing can ever reason about later. */
  at: number;
}

/** A token for "which design is this", stable across a reload and across a navigation away and back.
 *
 *  **`designKey`'s `loadId` cannot serve here and the difference is a wrong number.** That token is
 *  minted once per LOAD from a counter that starts at zero on every mount, so a resumed session
 *  re-mints it — and two different designs opened in different orders can be handed the same one.
 *  Keying stored results on it would let a cloud flown for one design be restored onto another. This
 *  is content-addressed instead: the name, the byte length, and a hash of the bytes themselves.
 *
 *  FNV-1a over the base64 rather than a cryptographic digest: this decides whether to re-fly 300
 *  flights, not whether to trust a signature, and it runs on a string that can be a megabyte. The
 *  length is carried beside the hash so a collision has to beat both. */
export function designFingerprint(name: string, designBase64: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < designBase64.length; i++) {
    h ^= designBase64.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${name}:${designBase64.length}:${(h >>> 0).toString(36)}`;
}

/** The stored dispersion, whatever design it belongs to. The caller compares the ids itself, because
 *  it has two different questions to ask of them and only one of them can be answered at mount. */
export function loadDispersion(): StoredDispersion | null {
  try {
    const raw = localStorage.getItem(DISPERSION_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as StoredDispersion;
    if (p?.v !== 1) return null;
    if (typeof p.designId !== "string" || !p.designId) return null;
    if (typeof p.runKey !== "string" || !p.runKey) return null;
    if (!p.result || typeof p.result !== "object") return null;
    return { v: 1, designId: p.designId, runKey: p.runKey, result: p.result, at: Number.isFinite(p.at) ? p.at : 0 };
  } catch {
    return null;
  }
}

/** Returns whether it was stored. A cache that could not be written is not an error worth surfacing —
 *  the panel simply re-flies next time — but the caller is told so it never reasons about an entry
 *  that is not there. Quota failures drop the entry entirely rather than trimming it: half a
 *  dispersion is not a smaller dispersion. */
export function saveDispersion(entry: Omit<StoredDispersion, "v">): boolean {
  try {
    localStorage.setItem(DISPERSION_KEY, JSON.stringify({ v: 1, ...entry }));
    return true;
  } catch {
    // Out of room, or storage disabled outright (Safari private browsing). Clear rather than leave a
    // previous run's entry behind: it is keyed, so it could not be shown for this design — but an
    // entry nothing will ever match is just spent quota.
    clearDispersion();
    return false;
  }
}

export function clearDispersion(): void {
  try {
    localStorage.removeItem(DISPERSION_KEY);
  } catch {
    // as above
  }
}


/** A value that lags its input until the input stops changing.
 *
 *  The analysis panels key their cached answer on a VALUE rather than a prop's identity, which stops
 *  an unrelated re-render throwing minutes of work away. That is not enough for a value the flyer
 *  TYPES: `Num` calls `onChange` on every keystroke so a digit can be entered one at a time, so
 *  every intermediate reading is a distinct value and a distinct key. Typing "1500" into the field
 *  elevation restarted the motor sweep four times — measured as eight `aria-busy` transitions —
 *  flying every bundled candidate at 1 m, then 15 m, then 150 m, before the field the flyer meant.
 *  The dispersion's own sigma inputs were debounced for exactly this reason; the launch conditions
 *  reach the same panels and need the same treatment.
 *
 *  Compare by VALUE, not identity: the caller passes a string key, so a rebuilt-but-unchanged object
 *  does not restart the timer. */
export function useSettled<T>(value: T, key: string, ms = 350): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
    // `value` is CAPTURED, not watched: the effect re-arms on the key, and the value it settles to
    // is the one from the render where the key last changed — which is the same value. Listing it
    // would re-arm on a rebuilt-but-identical object, which is the whole thing the key avoids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms]);
  return settled;
}
