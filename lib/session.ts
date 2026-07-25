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
  /** Which workspace this design opens on — an import leads with its flight, a build with design. */
  opensOn: "flight" | "design";
  units: "metric" | "imperial";
  /** Index into the design's stored simulations — which motor configuration was being flown. */
  simIndex: number;
  /** Active what-if / builder edits, as the app's own `Edits` shape. */
  edits: Record<string, unknown>;
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

/** Read the saved session, or null if there is none, it is unreadable, or it is from an older
 *  schema. Storage can throw outright (Safari private browsing), so every access is guarded. */
export function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSession;
    if (parsed?.v !== 1 || typeof parsed.design !== "string" || !parsed.design) return null;
    return {
      v: 1,
      design: parsed.design,
      name: typeof parsed.name === "string" ? parsed.name : "Saved design",
      opensOn: parsed.opensOn === "design" ? "design" : "flight",
      units: parsed.units === "imperial" ? "imperial" : "metric",
      simIndex: Number.isInteger(parsed.simIndex) ? parsed.simIndex : 0,
      edits: parsed.edits && typeof parsed.edits === "object" ? parsed.edits : {},
    };
  } catch {
    return null;
  }
}

export function saveSession(s: SavedSession): void {
  try {
    if (s.design.length > MAX_BYTES) return;
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Quota exceeded, or storage disabled entirely. Not remembering the session is a lesser
    // failure than breaking the app, so this is deliberately silent.
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

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // as above
  }
}
