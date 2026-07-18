import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importOrk } from "../ork/import";
import { flattenRocket } from "./geometry";
import {
  applyGeometryEdits,
  primaryFinSpan,
  primaryFinCount,
  primaryFinRootChord,
  primaryFinTipChord,
  primaryFinSweep,
  primaryNose,
  primaryBodyTube,
  primaryFinish,
} from "./edit";
import type { GenericFinSet } from "./types";
import { overallLength } from "./geometry";

async function load(name: string) {
  const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), "fixtures", name)));
  return (await importOrk(bytes)).rocket;
}

describe("applyGeometryEdits — fin span", () => {
  it("resizes a trapezoidal fin set's span, non-destructively", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const before = primaryFinSpan(rocket)!;
    expect(before).toBeGreaterThan(0);

    const target = before * 1.5;
    const edited = applyGeometryEdits(rocket, { finSpan: target });

    expect(primaryFinSpan(edited)).toBeCloseTo(target, 9);
    // The imported design is untouched — callers keep a pristine model.
    expect(primaryFinSpan(rocket)).toBeCloseTo(before, 9);
    expect(edited).not.toBe(rocket);
  });

  it("scales a generic (elliptical) fin set's stored area with the span", async () => {
    const rocket = await load("demo-boattail.ork");
    const finOf = (r: typeof rocket) =>
      flattenRocket(r)
        .map((p) => p.component)
        .find((c): c is GenericFinSet => c.kind === "ellipticalfinset" || c.kind === "freeformfinset");
    const fin = finOf(rocket);
    expect(fin).toBeTruthy();
    const { height: h0, area: a0 } = fin!;

    const edited = applyGeometryEdits(rocket, { finSpan: h0 * 2 });
    const editedFin = finOf(edited)!;
    // Doubling the span doubles the stored planform area (the shape is preserved).
    expect(editedFin.height).toBeCloseTo(h0 * 2, 9);
    expect(editedFin.area).toBeCloseTo(a0 * 2, 9);
  });

  it("no-ops when the edit is empty or non-positive", async () => {
    const rocket = await load("demo-single-deploy.ork");
    expect(applyGeometryEdits(rocket, {})).toBe(rocket);
    expect(applyGeometryEdits(rocket, { finSpan: 0 })).toBe(rocket);
    expect(applyGeometryEdits(rocket, { noseLength: 0, bodyLength: 0 })).toBe(rocket);
  });
});

describe("applyGeometryEdits — fin count", () => {
  it("changes the fin count, rounding to a whole number, non-destructively", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const before = primaryFinCount(rocket)!;
    expect(before).toBeGreaterThanOrEqual(3);

    const edited = applyGeometryEdits(rocket, { finCount: before + 1.4 });
    // Fractional counts round to a whole number of fins.
    expect(primaryFinCount(edited)).toBe(before + 1);
    // The imported design is untouched.
    expect(primaryFinCount(rocket)).toBe(before);
    expect(edited).not.toBe(rocket);
  });

  it("changes the count without touching the span", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const span0 = primaryFinSpan(rocket)!;
    const n0 = primaryFinCount(rocket)!;

    const edited = applyGeometryEdits(rocket, { finCount: n0 + 2 });
    expect(primaryFinCount(edited)).toBe(n0 + 2);
    expect(primaryFinSpan(edited)).toBeCloseTo(span0, 9);
  });

  it("applies span and count together in one edit", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const span0 = primaryFinSpan(rocket)!;
    const n0 = primaryFinCount(rocket)!;

    const edited = applyGeometryEdits(rocket, { finSpan: span0 * 1.5, finCount: n0 + 1 });
    expect(primaryFinSpan(edited)).toBeCloseTo(span0 * 1.5, 9);
    expect(primaryFinCount(edited)).toBe(n0 + 1);
  });

  it("no-ops for a count below one", async () => {
    const rocket = await load("demo-single-deploy.ork");
    expect(applyGeometryEdits(rocket, { finCount: 0 })).toBe(rocket);
  });
});

describe("applyGeometryEdits — fin chords", () => {
  it("reshapes a trapezoidal fin's root and tip chords, non-destructively", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const root0 = primaryFinRootChord(rocket)!;
    const tip0 = primaryFinTipChord(rocket)!;
    expect(root0).toBeGreaterThan(0);

    const edited = applyGeometryEdits(rocket, { finRootChord: root0 * 1.5, finTipChord: tip0 * 0.5 });
    expect(primaryFinRootChord(edited)).toBeCloseTo(root0 * 1.5, 9);
    expect(primaryFinTipChord(edited)).toBeCloseTo(tip0 * 0.5, 9);
    // Span and count are untouched, and the original design is pristine.
    expect(primaryFinSpan(edited)).toBeCloseTo(primaryFinSpan(rocket)!, 9);
    expect(primaryFinRootChord(rocket)).toBe(root0);
  });

  it("ignores a chord edit on an elliptical fin set (its chord is a reduction, not a dimension)", async () => {
    const rocket = await load("demo-boattail.ork"); // elliptical fins
    expect(primaryFinRootChord(rocket)).toBeUndefined();
    // No trapezoidal fin to reshape ⇒ a chord-only edit leaves the design structurally unchanged
    // (the elliptical fin's dimensions are untouched).
    expect(applyGeometryEdits(rocket, { finRootChord: 0.2 })).toStrictEqual(rocket);
  });

  it("no-ops for a non-positive chord", async () => {
    const rocket = await load("demo-single-deploy.ork");
    expect(applyGeometryEdits(rocket, { finRootChord: 0, finTipChord: 0 })).toBe(rocket);
  });
});

describe("applyGeometryEdits — fin sweep", () => {
  it("reshapes a trapezoidal fin's leading-edge sweep, non-destructively", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const sweep0 = primaryFinSweep(rocket)!;
    expect(sweep0).toBeGreaterThanOrEqual(0);

    const edited = applyGeometryEdits(rocket, { finSweepLength: sweep0 + 0.03 });
    expect(primaryFinSweep(edited)).toBeCloseTo(sweep0 + 0.03, 9);
    // Span, count and chords are untouched, and the original design is pristine.
    expect(primaryFinSpan(edited)).toBeCloseTo(primaryFinSpan(rocket)!, 9);
    expect(primaryFinRootChord(edited)).toBeCloseTo(primaryFinRootChord(rocket)!, 9);
    expect(primaryFinSweep(rocket)).toBeCloseTo(sweep0, 9);
    expect(edited).not.toBe(rocket);
  });

  it("accepts a zero sweep (an unswept, square leading edge)", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const edited = applyGeometryEdits(rocket, { finSweepLength: 0 });
    expect(primaryFinSweep(edited)).toBe(0);
    // A zero sweep is a real edit (unlike a zero span), so a fresh tree is returned.
    expect(edited).not.toBe(rocket);
  });

  it("ignores a sweep edit on an elliptical fin set (it has no leading-edge sweep dimension)", async () => {
    const rocket = await load("demo-boattail.ork"); // elliptical fins
    expect(primaryFinSweep(rocket)).toBeUndefined();
    expect(applyGeometryEdits(rocket, { finSweepLength: 0.05 })).toStrictEqual(rocket);
  });
});

describe("applyGeometryEdits — surface finish", () => {
  it("sets the chosen finish on every component of the airframe", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const edited = applyGeometryEdits(rocket, { finish: "polished" });
    const finishes = new Set(flattenRocket(edited).map((p) => p.component.finish));
    expect(finishes).toEqual(new Set(["polished"]));
    // The original design is untouched.
    expect(flattenRocket(rocket).every((p) => p.component.finish === "polished")).toBe(false);
  });

  it("primaryFinish reports the roughest finish present (what drives the drag)", async () => {
    const rocket = await load("demo-single-deploy.ork");
    // Force a mix: most smooth, one rough — the rough one should win.
    const mixed = applyGeometryEdits(rocket, { finish: "polished" });
    const roughed = {
      ...mixed,
      stages: mixed.stages.map((s, i) =>
        i === 0
          ? { ...s, components: s.components.map((c, j) => (j === 0 ? { ...c, finish: "rough" as const } : c)) }
          : s,
      ),
    };
    expect(primaryFinish(roughed)).toBe("rough");
    expect(primaryFinish(mixed)).toBe("polished");
  });
});

describe("applyGeometryEdits — length", () => {
  it("resizes the primary body tube and stretches the overall airframe", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const tube = primaryBodyTube(rocket)!;
    const len0 = tube.length;
    const overall0 = overallLength(rocket);

    const edited = applyGeometryEdits(rocket, { bodyLength: len0 + 0.1 });
    expect(primaryBodyTube(edited)!.length).toBeCloseTo(len0 + 0.1, 9);
    // A longer main tube makes the whole airframe ~0.1 m longer (downstream parts shift aft).
    expect(overallLength(edited)).toBeCloseTo(overall0 + 0.1, 6);
    // Non-destructive.
    expect(primaryBodyTube(rocket)!.length).toBeCloseTo(len0, 9);
  });

  it("resizes the nose cone", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const nose = primaryNose(rocket)!;
    const len0 = nose.length;

    const edited = applyGeometryEdits(rocket, { noseLength: len0 * 1.5 });
    expect(primaryNose(edited)!.length).toBeCloseTo(len0 * 1.5, 9);
    expect(primaryNose(rocket)!.length).toBeCloseTo(len0, 9);
  });
});
