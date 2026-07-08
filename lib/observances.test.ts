import { describe, it, expect } from "vitest";
import { observancesForDate, type Observance } from "./observances";

describe("observances", () => {
  it("returns an array for every month", () => {
    for (let m = 0; m < 12; m++) {
      const list = observancesForDate(new Date(2026, m, 15));
      expect(Array.isArray(list)).toBe(true);
    }
  });

  it("shows Pride and Men's Mental Health in June", () => {
    const ids = observancesForDate(new Date(2026, 5, 15)).map((o) => o.id);
    expect(ids).toContain("pride");
    expect(ids).toContain("mens-mental-health");
  });

  it("every observance has the fields the UI needs", () => {
    for (let m = 0; m < 12; m++) {
      for (const o of observancesForDate(new Date(2026, m, 1))) {
        expectValid(o);
      }
    }
  });

  it("every month carries at least one observance (no accidentally empty month)", () => {
    for (let m = 0; m < 12; m++) {
      expect(observancesForDate(new Date(2026, m, 15)).length).toBeGreaterThan(0);
    }
  });

  it("all observance ids are unique across the whole year", () => {
    const ids = allObservances().map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("pairs every resource link with a visible label", () => {
    for (const o of allObservances()) {
      if (o.href) {
        expect(o.href).toMatch(/^https?:\/\//);
        expect(o.hrefLabel).toBeTruthy();
      }
    }
  });

  it("gives every accent bar both a background and a title", () => {
    for (const o of allObservances()) {
      if (o.bar) {
        expect(o.bar.background).toBeTruthy();
        expect(o.bar.title).toBeTruthy();
      }
    }
  });

  it("defaults to the current month when called with no argument", () => {
    expect(Array.isArray(observancesForDate())).toBe(true);
  });

  it("maps a date to its own month's set (January → blood donor)", () => {
    expect(observancesForDate(new Date(2026, 0, 10)).map((o) => o.id)).toContain("blood-donor");
    expect(observancesForDate(new Date(2026, 11, 1)).map((o) => o.id)).toContain("world-aids-day");
  });
});

/** Flatten every month's observances (Jan–Dec) for whole-year invariants. */
function allObservances(): Observance[] {
  return Array.from({ length: 12 }, (_, m) => observancesForDate(new Date(2026, m, 15))).flat();
}

function expectValid(o: Observance) {
  expect(o.id).toBeTruthy();
  expect(o.emoji).toBeTruthy();
  expect(o.message).toBeTruthy();
  if (o.bar) expect(o.bar.background).toMatch(/gradient|#/);
}
