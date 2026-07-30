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
import { INERT_EDIT_FIELDS } from "./model/edit";

const KEY = "loft.session";
/** localStorage is typically a ~5 MB budget for the whole origin, and base64 costs a third on top
 *  of the raw bytes. A design far past this is a pathological file, not a rocket; it simply isn't
 *  remembered rather than evicting everything else the site keeps. */
const MAX_BYTES = 1_500_000;

export interface SavedSession {
  /** Schema version — a stored session from an older shape is discarded, never half-read. */
  v: 1;
  /** The design file's own bytes, base64-encoded. */
  design: string;
  /** File name (or the built design's name), as shown in the header. */
  name: string;
  /** Which workspace this design opens on — an import leads with its flight, a build with design,
   *  and a session that was left on another picks that one back up. */
  opensOn: "flight" | "design" | "analyze";
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
      opensOn:
        parsed.opensOn === "design" || parsed.opensOn === "analyze" ? parsed.opensOn : "flight",
      units: parsed.units === "imperial" ? "imperial" : "metric",
      simIndex: Number.isInteger(parsed.simIndex) ? parsed.simIndex : 0,
      edits: parsed.edits && typeof parsed.edits === "object" ? parsed.edits : {},
      rocket: typeof parsed.rocket === "string" && parsed.rocket ? parsed.rocket : undefined,
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
    // Quota exceeded, or storage disabled entirely. Not remembering the session is a lesser
    // failure than breaking the app, so this stays silent — but it is reported, not swallowed.
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
  return Object.entries(s.edits).filter(
    ([k, v]) => !INERT_EDIT_FIELDS.has(k) && v !== undefined && v !== "",
  ).length;
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

/** Drop one design from the shelf — the flyer's own "I'm done with that one". */
export function forgetRecent(id: string): RecentDesign[] {
  const list = loadRecents().filter((r) => r.id !== id);
  writeRecents(list);
  return list;
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
