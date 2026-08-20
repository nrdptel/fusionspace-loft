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

/** Which column a `DataTable` is sorted on, and which way. `null` is the caller's OWN order — the
 *  design's nose-to-tail order in the parts table, the flight's own order in the phase table, the
 *  registry's in the mass breakdown — which is a third state the `{key, dir}` pair cannot express and
 *  every one of these tables opens in. */
export type TableSort = { key: string; dir: 1 | -1 } | null;

/** The stored spelling of "the caller's own order". A word rather than an empty string because
 *  `usePersistedChoice` treats a stored value as present or absent, and "" is a real key nobody can
 *  see: `loft.pref.<k>` set to "" would fall through the `allowed` check and read as unset. */
export const NO_SORT = "none";

/** A sort as one string, which is the whole reason this pair exists.
 *
 *  `usePersistedChoice` is `<T extends string>` and validates a stored value against an allowlist, so
 *  the key and the direction have to ride in ONE value or they can come back inconsistent — a column
 *  remembered from a build where it sorted the other way, or a direction with no column. That is
 *  `components/MotorSweep.tsx`'s own reasoning, generalised: it spelled `"apogee:desc"` inline and was
 *  the only table in the app that survived a reload. */
export function sortToChoice(sort: TableSort): string {
  return sort === null ? NO_SORT : `${sort.key}:${sort.dir === 1 ? "asc" : "desc"}`;
}

/** The inverse. Anything this does not recognise reads as the caller's own order rather than throwing:
 *  a value that reaches here has already passed `sortChoices`' allowlist, and a table that renders
 *  unsorted is a state the flyer can see and click out of, where a throw is a workspace that does not
 *  render at all. */
export function sortFromChoice(v: string): TableSort {
  const at = v.lastIndexOf(":");
  if (at <= 0) return null;
  const dir = v.slice(at + 1);
  if (dir !== "asc" && dir !== "desc") return null;
  return { key: v.slice(0, at), dir: dir === "asc" ? 1 : -1 };
}

/** Every value a surface's stored sort may take, derived from the columns that can ACTUALLY sort.
 *
 *  **The filter on `sortValue` is the point, and it is a scar.** `components/MotorSweep.tsx` derived
 *  its allowlist from every column and so admitted `use:asc`/`use:desc` — a column with no
 *  `sortValue` — and a stored value of that shape reached `col.sortValue!(a)` behind a non-null
 *  assertion and took the workspace down on render. Three of the four columns in
 *  `components/RocketpyCrossCheck.tsx` are that shape, so a guard built the other way is one stored
 *  key away from the same crash on a second surface.
 *
 *  `NO_SORT` is always admitted: every one of these tables opens in its caller's own order, so that
 *  is a state a flyer can deliberately return to and therefore one worth remembering. */
export function sortChoices(columns: readonly { key: string; sortValue?: unknown }[]): readonly string[] {
  return [NO_SORT, ...columns.filter((c) => c.sortValue).flatMap((c) => [`${c.key}:asc`, `${c.key}:desc`])];
}
