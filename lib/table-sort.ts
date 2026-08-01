/** How a `DataTable` column orders its rows.
 *
 *  Pure and DOM-free so it can be unit-tested: `vitest.config.ts` walks `lib/` in a `node`
 *  environment, and `components/` is not in that walk at all — a comparator living inside the
 *  component could only ever be checked through an e2e, which is the wrong instrument for
 *  "what happens when this value is NaN".
 */

/** Compare two cell values for a sorted column.
 *
 *  **A value that is not a finite number sorts LAST whichever way the column runs**, rather than
 *  pretending to be the best or the worst of them. That is not a nicety: the naive `(x - y) * dir`
 *  returns `NaN` for such a value, and a comparator that returns `NaN` is INVALID — the result is not
 *  "the NaN went first", it is an arbitrary, engine-dependent order for the whole array, including
 *  the rows that had perfectly good numbers.
 *
 *  Two real columns produce one. A motor with no fins to flutter has no flutter margin; a motor whose
 *  burn outruns the coast has no optimum delay. Both render as an em dash on screen, and before this
 *  they made the two columns beside them unsortable in a way nothing announced.
 *
 *  Strings compare with `localeCompare`, so "B6" and "b6" land together and digits inside a
 *  designation order the way a reader expects.
 */
export function compareCells(
  x: number | string,
  y: number | string,
  dir: 1 | -1,
): number {
  if (typeof x === "number" && typeof y === "number") {
    const xb = !Number.isFinite(x);
    const yb = !Number.isFinite(y);
    if (xb || yb) return xb && yb ? 0 : xb ? 1 : -1;
    return (x - y) * dir;
  }
  return String(x).localeCompare(String(y)) * dir;
}
