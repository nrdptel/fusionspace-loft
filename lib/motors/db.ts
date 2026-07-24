/** The bundled motor database. Parses the inlined RASP curves (catalog.ts) once and
 *  resolves a design's motor *reference* (manufacturer + designation) to a real thrust
 *  curve. A `.ork` never embeds the curve, so this lookup is what makes an imported design
 *  simulable — and it runs entirely client-side, so it works offline.
 *
 *  Matching is deliberately forgiving: designations vary across tools ("K550W",
 *  "K550", "AeroTech K550W", a Cesaroni "838J293-13A" whose class/thrust core is "J293").
 *  We match on a normalized class-and-thrust core (letter + digits), preferring an exact
 *  designation and manufacturer, and report the match quality so the UI can flag a fuzzy
 *  or failed resolution honestly rather than silently simulating the wrong motor. */

import { MOTOR_CATALOG, type CatalogSource } from "./catalog";
import { parseEng, type MotorCurve } from "./eng";
import type { MotorSpec } from "../model/types";

export interface MotorDbEntry {
  curve: MotorCurve;
  source: CatalogSource;
  /** Normalized core designation, e.g. "K550", "J293". */
  core: string;
}

export type MatchQuality = "exact" | "designation" | "core" | "none";

export interface MotorMatch {
  entry: MotorDbEntry;
  quality: MatchQuality;
}

let cache: MotorDbEntry[] | null = null;

/** Parse the catalog once (lazily). A malformed entry is skipped, never fatal. */
export function allMotors(): MotorDbEntry[] {
  if (cache) return cache;
  const out: MotorDbEntry[] = [];
  for (const item of MOTOR_CATALOG) {
    try {
      const curve = parseEng(item.eng);
      out.push({ curve, source: item.source, core: coreDesignation(curve.designation) });
    } catch {
      // A bad curve shouldn't take down the whole database.
    }
  }
  cache = out;
  return out;
}

/** Uppercase, strip everything but alphanumerics. */
export function normalize(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The class-and-thrust core of a designation: the first letter-then-digits token, which
 *  is stable across manufacturer prefixes/suffixes ("838J293-13A" → "J293", "K550W" →
 *  "K550"). Falls back to the full normalized string if no such token exists. */
export function coreDesignation(designation: string): string {
  // Match on the raw (uppercased) string, not the separator-stripped one, so the digit run
  // stops at the delay/case separator: "838J293-13A" → "J293", not "J29313".
  const m = designation.toUpperCase().match(/([A-Z])(\d+)/);
  return m ? m[1] + m[2] : normalize(designation);
}

// RASP `.eng` files identify the maker by short, inconsistent codes ("E" vs "Estes",
// "AT" vs "AeroTech"); designs spell them out. Fold both onto one key so manufacturer
// comparison works.
const MFR_ALIASES: Record<string, string> = {
  AT: "aerotech",
  AERO: "aerotech", // some RASP .eng files spell AeroTech's code "AERO" rather than "AT"
  AEROTECH: "aerotech",
  CTI: "cesaroni",
  CES: "cesaroni",
  CESARONI: "cesaroni",
  CESARONITECHNOLOGY: "cesaroni",
  LOKIRESEARCH: "loki",
  E: "estes",
  ES: "estes",
  ESTES: "estes",
  Q: "quest",
  QUEST: "quest",
  RR: "roadrunner",
  PP: "publicmissiles",
  AMW: "animalmotorworks",
  CS: "contrail",
  H: "hypertek",
  HT: "hypertek",
  LOKI: "loki",
  KBA: "klima",
  KL: "klima",
  RASP: "",
};

function mfrKey(m?: string): string {
  if (!m) return "";
  const n = normalize(m);
  return MFR_ALIASES[n] ?? n.toLowerCase();
}

/** Resolve a design's motor reference to a database entry. Returns the best match and its
 *  quality; `quality === "none"` (with a null entry) means nothing matched. */
export function resolveMotor(spec: Pick<MotorSpec, "manufacturer" | "designation">): MotorMatch | null {
  const motors = allMotors();
  if (motors.length === 0) return null;

  const qDesig = normalize(spec.designation);
  const qCore = coreDesignation(spec.designation);
  const qMfr = mfrKey(spec.manufacturer);

  // An EXACT designation identifies a motor on its own ("A8" is an A8, and only one motor is
  // called "K550W"), so it matches maker-agnostically — otherwise an "E"-vs-"Estes" string
  // difference would block a clearly-correct match. The looser tiers are the danger: a substring
  // match ("K550" ⊂ a different maker's "K550W") or a class-and-thrust core match ("J293") can
  // land on the wrong maker's motor, so both require the manufacturer to agree when it's known on
  // both sides. An unknown maker on either side never vetoes.
  let best: { entry: MotorDbEntry; quality: MatchQuality; score: number } | null = null;
  for (const entry of motors) {
    const eDesig = normalize(entry.curve.designation);
    const eMfr = mfrKey(entry.curve.manufacturer);
    const mfrKnown = qMfr !== "" && eMfr !== "";
    const mfrAgree = mfrKnown ? qMfr === eMfr : false;

    let quality: MatchQuality = "none";
    if (eDesig === qDesig) quality = "exact";
    else if (eDesig.includes(qDesig) || qDesig.includes(eDesig)) {
      if (mfrKnown && !mfrAgree) continue; // a substring match must not cross makers
      quality = "designation";
    } else if (entry.core === qCore) {
      if (mfrKnown && !mfrAgree) continue; // nor a loose core match
      quality = "core";
    } else continue;

    // Rank by designation quality first, then prefer an agreeing manufacturer.
    const score = rank(quality) * 10 + (mfrAgree ? 1 : 0);
    if (!best || score > best.score) best = { entry, quality, score };
  }
  return best ? { entry: best.entry, quality: best.quality } : null;
}

function rank(q: MatchQuality): number {
  return q === "exact" ? 3 : q === "designation" ? 2 : q === "core" ? 1 : 0;
}
