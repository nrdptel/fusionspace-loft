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
  // The code RASAero actually writes. `Show-off.CDX1` in the corpus carries "A6Q  (QU)", and
  // without this line a two-letter key cannot reach Quest by any route: `sameMaker` requires three
  // characters before it will prefix-match, so "qu" is not an unknown maker that falls through —
  // it is a KNOWN, DISAGREEING one, and a disagreeing manufacturer vetoes the match at every
  // quality. `resolveMotor({ manufacturer: "QU", designation: "C12" })` returned null against six
  // bundled Quest motors, which is no motor and so no flight.
  QU: "quest",
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

/** Whether two casing diameters (mm) name the same physical motor class.
 *
 *  **Not equality, and the reason is in the bundled catalogue itself.** Its casings are 13, 18, 20,
 *  24, 29, 38, 54, 75, 76 and 98 mm — and the 75 and the 76 are ONE class: 3 inches is 76.2 mm, so
 *  seven motors are certified at the nominal 75 and two (M1882-LW, M2550-LB) at the measured 76. A
 *  design stating either would have had the other withheld under rounded equality, which is a
 *  legitimate flight refused — the exact failure a fit check must not introduce while fixing the
 *  opposite one.
 *
 *  2% of the larger, floored at 1 mm, is the band that separates the real classes: it merges 75/76
 *  (1 mm apart, 1.3%) and keeps 18 and 20 apart (2 mm, 11%) — those two really are different mounts,
 *  Estes' and Quest's. Every other neighbouring pair in the catalogue is 5 mm or more apart.
 *
 *  **A band is not an equivalence relation and this one is not transitive**: a file stating 19 mm
 *  matches both the 18 and the 20, which are not each other's. That is a property of any tolerance,
 *  and it is left rather than engineered away because the alternative — snapping to nominal classes —
 *  has to break the same tie arbitrarily, 19 being equidistant. No corpus file states 19; the
 *  consequence if one did is that a loose match could reach either small class, which is a wider net
 *  rather than a wrong flight. */
export function sameCasing(aMm: number, bMm: number): boolean {
  if (!(aMm > 0) || !(bMm > 0)) return true; // nothing stated on one side is nothing to disagree with
  return Math.abs(aMm - bMm) <= Math.max(1, 0.02 * Math.max(aMm, bMm));
}

/** Resolve a design's motor reference to a database entry. Returns the best match and its
 *  quality; `quality === "none"` (with a null entry) means nothing matched.
 *
 *  **A SUBSTITUTE THAT DOES NOT FIT THE CASING IS NOT A SUBSTITUTE.** `spec.diameter` is the casing
 *  the design file itself states, in metres, and where the file states one it VETOES any match Loft
 *  had to reach for. `swapOptions` filters its list on the SAME `sameCasing` predicate, so a motor
 *  Loft SUBSTITUTED is always one the sweep also offers. (A design's own EXACT motor is exempt from
 *  the veto — see below — so in principle that one can sit outside the sweep's list, on a file whose
 *  stated casing disagrees with the certification record. Measured: 0 of the 97 corpus instances that
 *  match exactly and state a casing. Filed in `BACKLOG.md`.)
 *
 *  This was a wrong number on the surface a flyer reads for a go/no-go, found by a cold walk of the
 *  built export. A design whose designation is `H999ZZ` on a 29 mm mount matched `H999N` — a **38 mm**
 *  motor — at "designation" quality on a bare substring test, and the app then reported apogee
 *  1,471 m, Mach 1.04, 161 g and thrust-to-weight 162:1 off a motor that cannot go in the tube. The
 *  only cue was a small "· approx" in a chip. Loft already knew the mount was 29 mm: the sweep on the
 *  same airframe says "15 bundled 29 mm motors" and does not list H999N.
 *
 *  **Exact matches are deliberately exempt.** A design that names its motor exactly has not asked
 *  Loft to choose anything; if the file's stated casing then disagrees with the certification record
 *  that is the file's own inconsistency, and dropping the design's own motor over it would withhold a
 *  flight Loft can legitimately fly. The veto is only ever on a motor Loft picked.
 *
 *  Where the veto leaves nothing, the answer is null — and that path is already good: the app
 *  withholds the flight and explains, rather than flying something plausible. A file that states no
 *  casing at all (RockSim's `MotorDia` is the mount's bore, RASAero records the nozzle) is unchanged,
 *  because there is nothing to check against. */
export function resolveMotor(
  // `diameter` is widened to optional rather than Pick'd: on `MotorSpec` it is required, but every
  // caller that has no casing to offer — the RASAero adapter, and any test naming a motor by name —
  // must be able to leave it out and get the pre-veto behaviour.
  spec: Pick<MotorSpec, "manufacturer" | "designation"> & { diameter?: number },
): MotorMatch | null {
  const motors = allMotors();
  if (motors.length === 0) return null;

  const qDesig = normalize(spec.designation);
  const qCore = coreDesignation(spec.designation);
  const qMfr = mfrKey(spec.manufacturer);
  const qCasingMm = Math.round((spec.diameter ?? 0) * 1000);

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

    // The casing veto — see the header. Only ever applied to a motor Loft reached for; `sameCasing`
    // returns true whenever either side is silent, so an uncatalogued casing and a file that states
    // none both fall through unchanged.
    if (quality !== "exact" && !sameCasing(qCasingMm, Math.round(entry.curve.diameterMm ?? 0))) continue;

    // Rank by designation quality first, then prefer an agreeing manufacturer.
    const score = rank(quality) * 10 + (mfrAgree ? 1 : 0);
    if (!best || score > best.score) best = { entry, quality, score };
  }
  return best ? { entry: best.entry, quality: best.quality } : null;
}

function rank(q: MatchQuality): number {
  return q === "exact" ? 3 : q === "designation" ? 2 : q === "core" ? 1 : 0;
}
