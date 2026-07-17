import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importOrk } from "../ork/import";
import { flattenRocket } from "./geometry";
import { applyGeometryEdits, primaryFinSpan } from "./edit";
import type { GenericFinSet } from "./types";

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
  });
});
