/** Display helpers for the UI. The simulation is SI internally; these convert out for a
 *  chosen unit system and format to honest precision. No verdicts, no false precision. */

import { mToFt, mpsToFtps, mpsToMph, kgToLb } from "./units";

export type UnitSystem = "metric" | "imperial";

export function fmt(n: number, decimals = 1): string {
  if (!Number.isFinite(n)) return "—";
  const f = 10 ** decimals;
  const r = Math.round(n * f) / f;
  return (r === 0 ? 0 : r).toLocaleString("en-US", { maximumFractionDigits: decimals });
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

export function lengthMm(m: number, sys: UnitSystem): Quantity {
  return sys === "imperial"
    ? { value: fmt(m * 39.3701, 1), unit: "in" }
    : { value: fmt(m * 1000, 0), unit: "mm" };
}

export function mach(m: number): Quantity {
  return { value: fmt(m, 2), unit: "Mach" };
}

export function seconds(s: number): Quantity {
  return { value: fmt(s, 1), unit: "s" };
}

export function calibers(cal: number): Quantity {
  return { value: fmt(cal, 2), unit: "cal" };
}

/** A dimensionless ratio, shown as "6.2 : 1" — the form flyers read thrust-to-weight in. */
export function ratio(x: number): Quantity {
  return { value: fmt(x, 1), unit: ": 1" };
}

/** One string like "1,234 ft" for inline use. */
export function q(quantity: Quantity): string {
  return `${quantity.value} ${quantity.unit}`.trim();
}
