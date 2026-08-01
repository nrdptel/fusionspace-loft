import { describe, it, expect } from "vitest";
import { compareCells } from "./table-sort";

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
