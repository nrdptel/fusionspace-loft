import { describe, it, expect } from "vitest";
import { NO_SORT, compareCells, sortChoices, sortFromChoice, sortToChoice } from "./table-sort";

/** The one piece of `DataTable` that is pure enough to test without a DOM — and the one that had a
 *  correctness bug in it. `vitest.config.ts` does not walk `components/`, so anything left inside the
 *  component can only be checked through an e2e. */
describe("compareCells", () => {
  const sort = <T>(rows: T[], get: (r: T) => number | string, dir: 1 | -1) =>
    [...rows].sort((a, b) => compareCells(get(a), get(b), dir));

  it("orders numbers both ways", () => {
    expect(sort([3, 1, 2], (n) => n, 1)).toEqual([1, 2, 3]);
    expect(sort([3, 1, 2], (n) => n, -1)).toEqual([3, 2, 1]);
  });

  it("puts a non-finite value LAST in both directions, never first", () => {
    // The defect: `(x - y) * dir` returns NaN here, which makes the comparator invalid — the engine
    // is then free to leave the whole array in any order, not just the NaN.
    const rows = [5, NaN, 1, Number.POSITIVE_INFINITY, 3];
    expect(sort(rows, (n) => n, 1).slice(0, 3)).toEqual([1, 3, 5]);
    expect(sort(rows, (n) => n, -1).slice(0, 3)).toEqual([5, 3, 1]);
    for (const dir of [1, -1] as const) {
      const tail = sort(rows, (n) => n, dir).slice(3);
      expect(tail.every((n) => !Number.isFinite(n))).toBe(true);
    }
  });

  it("leaves the good values correctly ordered even when a bad one is present", () => {
    // The half a naive comparator gets wrong that is easy to miss: it is not only the NaN's own
    // position that goes, it is everything's.
    const withBad = sort([9, NaN, 2, 7, 4], (n) => n, 1);
    expect(withBad.slice(0, 4)).toEqual([2, 4, 7, 9]);
  });

  it("treats two non-finite values as equal rather than reordering them", () => {
    expect(compareCells(NaN, NaN, 1)).toBe(0);
    expect(compareCells(NaN, NaN, -1)).toBe(0);
  });

  it("compares strings with locale rules, both ways", () => {
    expect(sort(["C6", "a8", "B6"], (s) => s, 1)).toEqual(["a8", "B6", "C6"]);
    expect(sort(["C6", "a8", "B6"], (s) => s, -1)).toEqual(["C6", "B6", "a8"]);
  });
});

describe("a sort as one stored value", () => {
  // **Key and direction ride in ONE string, and this is why.** `usePersistedChoice` validates a
  // stored value against an allowlist; two keys would let a column come back with a direction from a
  // build where that column sorted the other way, or a direction with no column at all. The whole
  // pair is admitted or refused together.
  it("round-trips every state a table can be in, including the caller's own order", () => {
    for (const s of [null, { key: "mass", dir: -1 as const }, { key: "od", dir: 1 as const }]) {
      expect(sortFromChoice(sortToChoice(s))).toEqual(s);
    }
  });

  it("spells the caller's own order as a word, not as an empty string", () => {
    // `""` would fall through `usePersistedChoice`'s presence check and read as unset, so a flyer who
    // deliberately returned a table to its own order would get the default back on the next load.
    expect(sortToChoice(null)).toBe(NO_SORT);
    expect(NO_SORT).not.toBe("");
  });

  it("reads anything it does not recognise as the caller's own order rather than throwing", () => {
    // Reachable only by a key some other hand wrote — `sortChoices` refuses the rest — and the answer
    // has to be a table a flyer can see and click out of, not a workspace that fails to render.
    for (const bad of ["", "mass", ":asc", "mass:sideways", "none"]) {
      expect(sortFromChoice(bad)).toBeNull();
    }
  });

  it("keeps a key that contains a colon whole", () => {
    // `lastIndexOf`, not `split`. No column key carries a colon today; the parse is written so one
    // could without silently becoming a different column.
    expect(sortFromChoice("a:b:desc")).toEqual({ key: "a:b", dir: -1 });
  });
});

describe("the allowlist a stored sort is validated against", () => {
  // **The scar this exists for.** `components/MotorSweep.tsx` derived its list from EVERY column, so
  // it admitted a key whose column has no `sortValue` — and that value reached `col.sortValue!(a)`
  // behind a non-null assertion and took the workspace down on render. Three of the four columns in
  // `components/RocketpyCrossCheck.tsx` are that same shape.
  const COLS = [
    { key: "label", sortValue: (r: unknown) => String(r) },
    { key: "rp" },
    { key: "loft" },
    { key: "delta" },
  ];

  it("admits only the columns that can actually sort, both ways", () => {
    expect([...sortChoices(COLS)].sort()).toEqual([NO_SORT, "label:asc", "label:desc"].sort());
  });

  it("refuses a key whose column carries no comparator", () => {
    for (const key of ["rp", "loft", "delta"]) {
      for (const dir of ["asc", "desc"]) {
        expect(sortChoices(COLS)).not.toContain(`${key}:${dir}`);
      }
    }
  });

  it("always admits the caller's own order, so a flyer can deliberately return to it", () => {
    expect(sortChoices([])).toEqual([NO_SORT]);
  });
});
