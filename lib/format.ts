/** Small display helpers. The aim is honest precision — never more digits than the
 *  input or the method justify. */

/** Round to a fixed number of decimals and drop trailing zeros. */
export function round(n: number, decimals = 2): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** decimals;
  const r = Math.round(n * f) / f;
  // Normalize negative zero (Math.round(-0.4) === -0) so nothing ever renders "-0".
  return r === 0 ? 0 : r;
}

/** Format a number with up to `decimals` places, trimming trailing zeros. */
export function fmt(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "—";
  // Pin the locale: these numbers are server-rendered on first paint, so a
  // locale-dependent separator (1.87 vs 1,87) would cause a hydration mismatch.
  return round(n, decimals).toLocaleString("en-US", {
    maximumFractionDigits: decimals,
  });
}

/** Black-powder mass, always grams, to 0.01 g. */
export function fmtMass(grams: number): string {
  if (!Number.isFinite(grams) || grams <= 0) return "—";
  const s = grams.toFixed(2);
  // A positive charge that rounds to 0.00 g is real but below display precision;
  // showing "0.00 g" would read as "no charge" on a tool where under-sizing is the
  // dangerous direction. Say what's true instead.
  return s === "0.00" ? "<0.01" : s;
}
