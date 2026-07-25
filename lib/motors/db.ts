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
  /** The motor's catalogued designation — ThrustCurve.org's, when the curve's provenance
   *  records it, else the RASP header's. Matching runs against this. */
  designation: string;
  /** The motor's catalogued manufacturer, on the same preference. */
  manufacturer?: string;
  /** Every published name this motor answers to — its manufacturer designation and, where the
   *  provenance records one, its common (class-and-thrust) name. A Cesaroni reload is sold as
   *  part number "648J285-15A" but written into a design as "J285"; both name the same motor,
   *  and a design file may carry either. */
  names: string[];
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
      // A RASP header carries whatever the curve's author typed: an abbreviated designation
      // ("E30" for AeroTech's E30T, "G80NBT" for a G80T) and a terse maker code ("A", "AT",
      // "E"). ThrustCurve.org's certification record is the authority on both, so it wins where
      // the provenance has it. Matching against the abbreviation alone left real design files
      // with no resolvable motor and so no propulsion at all.
      const designation = item.source.designation || curve.designation;
      const manufacturer = item.source.manufacturer || curve.manufacturer;
      // The certified casing envelope wins over the header's for the same reason the designation
      // does — the header is the curve author's typing. It matters beyond bookkeeping: the
      // motor-swap list filters by mount diameter and the design diagram draws the casing, so a
      // 54 mm motor whose header claims 75 mm is offered for the wrong mount and drawn wrong.
      if (typeof item.source.diameterMm === "number" && item.source.diameterMm > 0) {
        curve.diameterMm = item.source.diameterMm;
      }
      if (typeof item.source.lengthMm === "number" && item.source.lengthMm > 0) {
        curve.lengthMm = item.source.lengthMm;
      }
      const names = [...new Set([designation, item.source.commonName].filter((n): n is string => !!n))];
      out.push({
        curve,
        source: item.source,
        core: coreDesignation(designation),
        designation,
        manufacturer,
        names,
      });
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
  A: "aerotech", // the single-letter AeroTech code some wRASP-era .eng files use
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
  AP: "apogee", // RASAero writes the maker as a short code in parentheses: "1/4A2  (AP)"
  APOGEE: "apogee",
  APOGEECOMPONENTS: "apogee",
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

/** Whether two manufacturer keys name the same maker. Beyond the alias table, one key being a
 *  prefix of the other covers the trading-name difference that shows up constantly between a
 *  design file and a certification record — "Apogee" vs "Apogee Components", "Estes" vs "Estes
 *  Industries", "Quest" vs "Quest Aerospace", "Cesaroni" vs "Cesaroni Technology". Three
 *  characters minimum, so a one- or two-letter RASP code can't prefix-match half the database
 *  (those go through the alias table instead). */
function sameMaker(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/** Resolve a design's motor reference to a database entry. Returns the best match and its
 *  quality; `quality === "none"` (with a null entry) means nothing matched. */
export function resolveMotor(spec: Pick<MotorSpec, "manufacturer" | "designation">): MotorMatch | null {
  const motors = allMotors();
  if (motors.length === 0) return null;

  const qDesig = normalize(spec.designation);
  const qCore = coreDesignation(spec.designation);
  const qMfr = mfrKey(spec.manufacturer);

  // A KNOWN, DISAGREEING manufacturer vetoes the match outright, at every quality. Bare
  // class-and-thrust names are not unique across makers once more than one maker is bundled —
  // Apogee, Estes and Quest all sell a "C10"-shaped name — so an exact designation on the wrong
  // maker is exactly the silent wrong-motor substitution this database must never make. (The
  // veto used to spare exact matches, on the reasoning that an "E"-vs-"Estes" string difference
  // shouldn't block an obviously-correct match; catalogued manufacturers now come from
  // ThrustCurve's certification record and fold through the alias table and a trading-name
  // prefix, so that escape hatch is no longer paying for itself.) An unknown maker on either
  // side never vetoes: a design that names no maker still resolves on designation alone.
  let best: { entry: MotorDbEntry; quality: MatchQuality; score: number } | null = null;
  for (const entry of motors) {
    const eMfr = mfrKey(entry.manufacturer);
    const mfrKnown = qMfr !== "" && eMfr !== "";
    const mfrAgree = mfrKnown ? sameMaker(qMfr, eMfr) : false;
    if (mfrKnown && !mfrAgree) continue;

    // Test every published name the motor answers to and keep its best quality.
    let quality: MatchQuality = "none";
    for (const name of entry.names) {
      const eDesig = normalize(name);
      if (eDesig === qDesig) { quality = "exact"; break; }
      if (eDesig.includes(qDesig) || qDesig.includes(eDesig)) quality = "designation";
    }
    if (quality === "none") {
      if (entry.core === qCore) quality = "core";
      else continue;
    }

    // Rank by designation quality first, then prefer an agreeing manufacturer.
    const score = rank(quality) * 10 + (mfrAgree ? 1 : 0);
    if (!best || score > best.score) best = { entry, quality, score };
  }
  return best ? { entry: best.entry, quality: best.quality } : null;
}

function rank(q: MatchQuality): number {
  return q === "exact" ? 3 : q === "designation" ? 2 : q === "core" ? 1 : 0;
}
