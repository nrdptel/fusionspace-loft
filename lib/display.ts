/** Display helpers for the UI. The simulation is SI internally; these convert out for a
 *  chosen unit system and format to honest precision. No verdicts, no false precision. */

import { mToFt, mpsToFtps, mpsToMph, kgToLb, paToPsi } from "./units";
import { storedTag } from "./validation/stored-status";

export type UnitSystem = "metric" | "imperial";

export function fmt(n: number, decimals = 1): string {
  if (!Number.isFinite(n)) return "—";
  const f = 10 ** decimals;
  const r = Math.round(n * f) / f;
  return (r === 0 ? 0 : r).toLocaleString("en-US", { maximumFractionDigits: decimals });
}

/** How many decimal places a value needs before it stops rounding away to zero, starting from
 *  `decimals` and giving up at `maxDecimals`. Callers that show several related numbers together —
 *  a from/to pair and the change between them — take the widest of them so the row is formatted at
 *  one precision and cannot contradict itself. */
export function decimalsFor(n: number, decimals = 1, maxDecimals = decimals + 4): number {
  if (!Number.isFinite(n) || n === 0) return decimals;
  for (let dp = decimals; dp <= maxDecimals; dp++) {
    if (Math.round(n * 10 ** dp) !== 0) return dp;
  }
  return maxDecimals;
}

/** Format like `fmt`, but never present a value that isn't zero as a flat "0". A 0.254 mm fin shown
 *  as "0 mm" reads as a formatting bug rather than as the alarmingly thin fin it is, and a flutter
 *  margin printed "0×" hides the difference between 0.01× and 0.05× on a safety flag. Adds decimal
 *  places until the value survives the rounding; past `maxDecimals` it is smaller than this display
 *  can state, and a bound is honest where another zero is not. */
export function fmtSmall(n: number, decimals = 1, maxDecimals = decimals + 4): string {
  if (!Number.isFinite(n)) return "—";
  const dp = decimalsFor(n, decimals, maxDecimals);
  const shown = fmt(n, dp);
  if (n !== 0 && Number(shown.replace(/,/g, "")) === 0) {
    // The same sign glyph `fmt` would have produced, so a bound and an ordinary value read alike.
    return `${n < 0 ? "-" : ""}<${fmt(10 ** -maxDecimals, maxDecimals)}`;
  }
  return shown;
}

export interface Quantity {
  value: string;
  unit: string;
}

export function altitude(m: number, sys: UnitSystem): Quantity {
  return sys === "imperial"
    ? { value: fmt(mToFt(m), 0), unit: "ft" }
    : { value: fmt(m, 0), unit: "m" };
}

export function distance(m: number, sys: UnitSystem): Quantity {
  return altitude(m, sys);
}

export function speed(mps: number, sys: UnitSystem): Quantity {
  return sys === "imperial"
    ? { value: fmt(mpsToFtps(mps), 0), unit: "ft/s" }
    : { value: fmt(mps, 0), unit: "m/s" };
}

export function speedMph(mps: number, sys: UnitSystem): Quantity {
  return sys === "imperial"
    ? { value: fmt(mpsToMph(mps), 0), unit: "mph" }
    : { value: fmt(mps, 1), unit: "m/s" };
}

/** Acceleration is reported in g — the number flyers actually reason about — in both systems. */
export function accel(mps2: number): Quantity {
  return { value: fmt(mps2 / 9.80665, 0), unit: "g" };
}

export function mass(kg: number, sys: UnitSystem): Quantity {
  return sys === "imperial"
    ? { value: fmt(kgToLb(kg), 2), unit: "lb" }
    : { value: fmt(kg, 3), unit: "kg" };
}

/** A component dimension. Whole millimetres (or tenths of an inch) is the right precision for an
 *  airframe, but hobby stock runs thinner than that — a 0.254 mm (0.010 in) balsa fin is a real part
 *  a real file specifies — so a dimension that would round away keeps the places it needs instead of
 *  reading as a missing value. */
export function lengthMm(m: number, sys: UnitSystem): Quantity {
  return sys === "imperial"
    ? { value: fmtSmall(m * 39.3701, 1), unit: "in" }
    : { value: fmtSmall(m * 1000, 0), unit: "mm" };
}

/** Dynamic pressure. Imperial rocketry states max-Q in psi; the SI form is kPa rather than raw
 *  pascals, which run to five figures on any flight worth the name. */
export function dynamicPressure(pa: number, sys: UnitSystem): Quantity {
  return sys === "imperial" ? { value: fmtSmall(paToPsi(pa), 2), unit: "psi" } : { value: fmt(pa / 1000, 1), unit: "kPa" };
}

export function mach(m: number): Quantity {
  return { value: fmt(m, 2), unit: "Mach" };
}

export function seconds(s: number): Quantity {
  return { value: fmt(s, 1), unit: "s" };
}

/** Kinetic energy: joules (SI) or foot-pounds-force (imperial, the unit US flying fields quote a
 *  landing-energy limit in). 1 J = 0.737562 ft·lbf. Shows a decimal only for small values. */
export function energy(joules: number, sys: UnitSystem): Quantity {
  if (sys === "imperial") {
    const ftlbf = joules * 0.737562;
    return { value: fmt(ftlbf, ftlbf < 10 ? 1 : 0), unit: "ft·lbf" };
  }
  return { value: fmt(joules, joules < 10 ? 1 : 0), unit: "J" };
}

export function calibers(cal: number): Quantity {
  return { value: fmt(cal, 2), unit: "cal" };
}

/** A fin-flutter margin, "1.4×" — the estimated flutter speed as a multiple of the peak airspeed.
 *  One helper so every surface that quotes it agrees, and small enough margins keep their digits:
 *  the thinnest in the corpus run 0.01–0.05×, and those are exactly the ones a flyer has to be able
 *  to tell apart. */
export function flutterMargin(x: number): string {
  return `${fmtSmall(x, 1)}×`;
}

/** A dimensionless ratio, shown as "6.2 : 1" — the form flyers read thrust-to-weight in. */
export function ratio(x: number): Quantity {
  return { value: fmt(x, 1), unit: ": 1" };
}

/** One string like "1,234 ft" for inline use. */
export function q(quantity: Quantity): string {
  return `${quantity.value} ${quantity.unit}`.trim();
}

/** A signed change from a baseline to a new value, for "what-if vs design" readouts. `dir` is
 *  the direction (−1 down, +1 up, 0 none/undefined) so callers can style it without re-parsing. */
export interface Change {
  text: string;
  dir: -1 | 0 | 1;
}

/** Percentage change from `base` to `cur`, formatted for display — fewer decimals as the
 *  magnitude grows (18%, not 18.3%; 4.2%, not 4%). Returns "—"/dir 0 when the baseline is ~0,
 *  where a percentage is undefined. Uses a true minus sign so the sign reads cleanly. */
export function changePercent(base: number, cur: number): Change {
  if (!Number.isFinite(base) || !Number.isFinite(cur) || Math.abs(base) < 1e-9) {
    return { text: "—", dir: 0 };
  }
  const p = ((cur - base) / base) * 100;
  const mag = fmt(Math.abs(p), Math.abs(p) >= 10 ? 0 : 1);
  // Sign follows the rounded magnitude, so a change that rounds to 0 reads as "0%", not "+0%".
  const rounded = Number(mag.replace(/,/g, ""));
  const dir = rounded === 0 ? 0 : p > 0 ? 1 : -1;
  const sign = dir > 0 ? "+" : dir < 0 ? "−" : "";
  return { text: `${sign}${mag}%`, dir };
}

/** Signed absolute change in the value's own unit, e.g. a static-margin shift "+0.90 cal". */
export function changeAbsolute(base: number, cur: number, unit: string, decimals = 2): Change {
  if (!Number.isFinite(base) || !Number.isFinite(cur)) return { text: "—", dir: 0 };
  const diff = cur - base;
  const mag = fmt(Math.abs(diff), decimals);
  const rounded = Number(mag.replace(/,/g, ""));
  const dir = rounded === 0 ? 0 : diff > 0 ? 1 : -1;
  const sign = dir > 0 ? "+" : dir < 0 ? "−" : "";
  return { text: `${sign}${mag}${unit ? " " + unit : ""}`, dir };
}

/** Labels for a design's stored simulations, guaranteed to be distinct.
 *
 *  A run's motor and its stored apogee are usually enough to tell it from the others, but not
 *  always: measured over the 35-design corpus, of the 21 designs that offer a picker, 3 produce a
 *  repeated label. `Clustered motors.ork` carries two genuinely different configurations that both
 *  reach 307 m; `FullScaleModelTH.rkt` stores 15 runs of one motor whose apogees round together,
 *  six of them indistinguishable, and its run names repeat as well. Choosing between options that
 *  read the same silently compares Loft against a different stored flight, so a repeated label
 *  takes on whatever separates it: the run's own name, then its position in the file. Distinctness
 *  is this function's own guarantee, not something a caller has to have arranged. */
export function storedRunLabels(
  runs: readonly { motors: string[]; name: string; storedApogeeM?: number; simIndex: number; status?: string }[],
  sys: UnitSystem,
): string[] {
  const base = runs.map((c) => {
    const motors = c.motors.length ? c.motors.join(" + ") : c.name?.trim() || "Configuration";
    // `Number.isFinite`, not `!== undefined`: a null or NaN apogee would reach `fmt` and render
    // "— m", which asserts a stored figure this run does not carry.
    if (!Number.isFinite(c.storedApogeeM as number)) return motors;
    // The apogee is the source tool's, and the tool says whether it still stands behind it. 18 of
    // the corpus's 108 picker options quote a run marked outdated or never run — every option on
    // `USLI2025-FULLSCALE`, 8 of 9 on `Punisher Apprentice.ork` — so an unmarked figure here would
    // present an earlier version of the rocket as that tool's current answer.
    const tag = storedTag(c.status);
    return `${motors} · ${q(altitude(c.storedApogeeM as number, sys))}${tag ? ` (${tag})` : ""}`;
  });
  const tally = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());

  // Tier two: the run's own name, but only where it actually adds something. A RASAero import names
  // each run after its own motor and an .ork with an unresolved configuration falls back to the
  // name for the motor half of the label, so appending it blindly produces "J90W · 1,200 m · J90W".
  const byBase = tally(base);
  const named = base.map((l, i) => {
    const name = runs[i].name?.trim();
    return byBase.get(l)! > 1 && name && !l.includes(name) ? `${l} · ${name}` : l;
  });

  // Tier three: the run's position in the file, on every member of a group that still reads alike —
  // marking only the later ones would leave the first looking like the unambiguous one. The position
  // is the run's own index in the file, which is what a flyer counts down their simulation list to
  // find; the backstop below is what makes distinctness a guarantee rather than a consequence of it.
  const byNamed = tally(named);
  const placed = named.map((l, i) => (byNamed.get(l)! > 1 ? `${l} · #${runs[i].simIndex + 1}` : l));

  // And a backstop, so "distinct" is a property of this function rather than of its callers: a run
  // whose own name happens to read like another's position marker could still collide.
  const seen = new Set<string>();
  return placed.map((l) => {
    let out = l;
    for (let k = 2; seen.has(out); k++) out = `${l} (${k})`;
    seen.add(out);
    return out;
  });
}
