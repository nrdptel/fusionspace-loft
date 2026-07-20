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
  primaryFinThickness,
  primaryFinCrossSection,
  primaryFinMaterial,
  FIN_MATERIALS,
  primaryNose,
  primaryNoseShape,
  primaryBodyDiameter,
  primaryBodyTube,
  primaryFinish,
  primaryParachute,
} from "./edit";
import type { GenericFinSet, Transition, Parachute } from "./types";
import { overallLength } from "./geometry";
import { newDesign } from "./starter";
import { runFlight } from "../sim/run";

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

describe("applyGeometryEdits — fin cross-section", () => {
  it("sets every fin set's edge profile, non-destructively", async () => {
    const rocket = await load("demo-single-deploy.ork");
    // A finned demo defaults to square when it names no profile.
    expect(primaryFinCrossSection(rocket)).toBe("square");
    const edited = applyGeometryEdits(rocket, { finCrossSection: "airfoil" });
    expect(primaryFinCrossSection(edited)).toBe("airfoil");
    // Original untouched.
    expect(primaryFinCrossSection(rocket)).toBe("square");
    // Every fin set took it (a design can have more than one).
    for (const p of flattenRocket(edited)) {
      if (p.component.kind.endsWith("finset")) {
        expect((p.component as GenericFinSet).crossSection).toBe("airfoil");
      }
    }
  });

  it("is a no-op when undefined", async () => {
    const rocket = await load("demo-single-deploy.ork");
    expect(applyGeometryEdits(rocket, { finCrossSection: undefined })).toBe(rocket);
  });
});

describe("applyGeometryEdits — fin material", () => {
  it("swaps every fin set's material density and name, non-destructively", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const g10 = FIN_MATERIALS.find((m) => m.key === "g10")!;
    const edited = applyGeometryEdits(rocket, { finMaterial: "g10" });
    expect(primaryFinMaterial(edited)).toBe(g10.name);
    for (const p of flattenRocket(edited)) {
      if (p.component.kind.endsWith("finset")) {
        expect((p.component as GenericFinSet).material?.density).toBe(g10.density);
        expect((p.component as GenericFinSet).material?.name).toBe(g10.name);
      }
    }
    // Original untouched.
    expect(primaryFinMaterial(rocket)).not.toBe(g10.name);
  });

  it("is a no-op for an unknown or missing material key", async () => {
    const rocket = await load("demo-single-deploy.ork");
    expect(applyGeometryEdits(rocket, { finMaterial: undefined })).toBe(rocket);
    expect(applyGeometryEdits(rocket, { finMaterial: "unobtainium" })).toBe(rocket);
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

describe("applyGeometryEdits — fin thickness", () => {
  it("resets a trapezoidal fin's thickness, non-destructively", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const t0 = primaryFinThickness(rocket)!;
    expect(t0).toBeGreaterThan(0);

    const edited = applyGeometryEdits(rocket, { finThickness: t0 * 2 });
    expect(primaryFinThickness(edited)).toBeCloseTo(t0 * 2, 9);
    // The planform (span, chords) is untouched, and the original design is pristine.
    expect(primaryFinSpan(edited)).toBeCloseTo(primaryFinSpan(rocket)!, 9);
    expect(primaryFinRootChord(edited)).toBeCloseTo(primaryFinRootChord(rocket)!, 9);
    expect(primaryFinThickness(rocket)).toBeCloseTo(t0, 9);
    expect(edited).not.toBe(rocket);
  });

  it("applies to an elliptical fin set too (unlike a chord edit, thickness is universal)", async () => {
    const rocket = await load("demo-boattail.ork"); // elliptical fins
    const t0 = primaryFinThickness(rocket)!;
    expect(t0).toBeGreaterThan(0);
    // A chord edit is ignored on an elliptical set, but a thickness edit takes effect.
    const edited = applyGeometryEdits(rocket, { finThickness: t0 * 1.5 });
    expect(primaryFinThickness(edited)).toBeCloseTo(t0 * 1.5, 9);
  });

  it("no-ops for a non-positive thickness", async () => {
    const rocket = await load("demo-single-deploy.ork");
    expect(applyGeometryEdits(rocket, { finThickness: 0 })).toBe(rocket);
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

describe("applyGeometryEdits — nose shape", () => {
  it("changes the nose contour and installs the shape's canonical parameter, non-destructively", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const shape0 = primaryNoseShape(rocket)!;
    expect(shape0).toBeTruthy();

    // A Haack nose is the C=0 Sears–Haack / Von Kármán minimum-drag ogive.
    const edited = applyGeometryEdits(rocket, { noseShape: "haack" });
    expect(primaryNoseShape(edited)).toBe("haack");
    expect(primaryNose(edited)!.shapeParameter).toBe(0);
    // Conical/ellipsoid ignore the parameter, so choosing one clears it.
    expect(primaryNose(applyGeometryEdits(rocket, { noseShape: "conical" }))!.shapeParameter).toBeUndefined();
    // The original design is untouched.
    expect(primaryNoseShape(rocket)).toBe(shape0);
    expect(edited).not.toBe(rocket);
  });

  it("changes the nose shape and length together in one edit", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const len0 = primaryNose(rocket)!.length;
    const edited = applyGeometryEdits(rocket, { noseShape: "conical", noseLength: len0 * 1.4 });
    expect(primaryNoseShape(edited)).toBe("conical");
    expect(primaryNose(edited)!.length).toBeCloseTo(len0 * 1.4, 9);
  });
});

describe("applyGeometryEdits — airframe diameter", () => {
  it("scales the whole outer airframe to the target caliber, keeping the mould line faired", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const d0 = primaryBodyDiameter(rocket)!;
    const noseAft0 = primaryNose(rocket)!.aftRadius;
    const target = d0 * 1.4;

    const edited = applyGeometryEdits(rocket, { bodyDiameter: target });
    // The primary tube hits the target, and the nose base scales by the same factor so it still
    // fairs into the tube.
    expect(primaryBodyDiameter(edited)).toBeCloseTo(target, 9);
    expect(primaryNose(edited)!.aftRadius).toBeCloseTo(noseAft0 * 1.4, 9);
    // Original untouched; a fresh tree returned.
    expect(primaryBodyDiameter(rocket)).toBeCloseTo(d0, 9);
    expect(edited).not.toBe(rocket);
  });

  it("keeps the fins' planform (a 'same fins, wider tube' what-if)", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const edited = applyGeometryEdits(rocket, { bodyDiameter: primaryBodyDiameter(rocket)! * 1.5 });
    // Fins are unchanged — the flyer re-uses the same fins on a wider airframe.
    expect(primaryFinSpan(edited)).toBeCloseTo(primaryFinSpan(rocket)!, 9);
    expect(primaryFinRootChord(edited)).toBeCloseTo(primaryFinRootChord(rocket)!, 9);
  });

  it("scales internal tubes and rings too, so a narrowed tube stays the widest part", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const ringR = (r: typeof rocket) =>
      flattenRocket(r)
        .map((p) => p.component)
        .filter((c) => c.kind === "centeringring")
        .map((c) => (c as { outerRadius: number }).outerRadius);
    const before = ringR(rocket);
    expect(before.length).toBeGreaterThan(0);
    const edited = applyGeometryEdits(rocket, { bodyDiameter: primaryBodyDiameter(rocket)! * 0.75 });
    const after = ringR(edited);
    // Every centring ring narrowed by the same 0.75 factor — none is left poking past the tube.
    for (let i = 0; i < before.length; i++) expect(after[i]).toBeCloseTo(before[i] * 0.75, 9);
  });
});

describe("applyGeometryEdits — add a boattail (structural add)", () => {
  const boattailOf = (r: ReturnType<typeof newDesign>["rocket"]) =>
    flattenRocket(r)
      .map((p) => p.component)
      .find((c): c is Transition => c.kind === "transition");

  it("appends a conical boattail after the primary body tube, non-destructively", () => {
    const rocket = newDesign().rocket;
    expect(boattailOf(rocket)).toBeUndefined(); // the starter has no boattail
    const tube = primaryBodyTube(rocket)!;

    const edited = applyGeometryEdits(rocket, { boattailLength: 0.05, boattailAftDiameter: 0.04 });
    const bt = boattailOf(edited)!;
    expect(bt).toBeTruthy();
    expect(bt.shape).toBe("conical");
    expect(bt.length).toBeCloseTo(0.05, 9);
    // It fairs to the body: fore radius = tube radius, exit = half the requested diameter.
    expect(bt.foreRadius).toBeCloseTo(tube.outerRadius, 9);
    expect(bt.aftRadius).toBeCloseTo(0.02, 9);
    // Non-destructive: the original design still has no boattail.
    expect(boattailOf(rocket)).toBeUndefined();
  });

  it("fairs the boattail to the edited diameter when a caliber what-if is also active", () => {
    const rocket = newDesign().rocket;
    const dia0 = primaryBodyDiameter(rocket)!;
    const edited = applyGeometryEdits(rocket, {
      bodyDiameter: dia0 * 0.5, // halve the airframe…
      boattailLength: 0.05,
      boattailAftDiameter: dia0 * 0.4, // …exit still narrower than the halved body
    });
    const bt = boattailOf(edited)!;
    // Fore radius tracks the halved tube, not the original — the boattail fairs to the final mould line.
    expect(bt.foreRadius).toBeCloseTo((dia0 * 0.5) / 2, 9);
  });

  it("skips a boattail that wouldn't contract (exit ≥ body), keeping a valid design", () => {
    const rocket = newDesign().rocket;
    const dia0 = primaryBodyDiameter(rocket)!;
    const edited = applyGeometryEdits(rocket, { boattailLength: 0.05, boattailAftDiameter: dia0 * 1.2 });
    expect(boattailOf(edited)).toBeUndefined(); // no flared "boattail" is added
  });

  it("raises apogee by cutting base drag — the design lever it exists for", () => {
    const doc = newDesign();
    const base = runFlight(doc.rocket, { configId: "cfg-1" }).result.summary.apogee;
    const withBt = applyGeometryEdits(doc.rocket, { boattailLength: 0.06, boattailAftDiameter: 0.03 });
    const flown = runFlight(withBt, { configId: "cfg-1" }).result.summary.apogee;
    // Contracting the base removes most of the base drag, so the same motor flies higher.
    expect(flown).toBeGreaterThan(base);
  });
});

describe("applyGeometryEdits — dual-deploy recovery", () => {
  const chutesOf = (r: ReturnType<typeof newDesign>["rocket"]) =>
    flattenRocket(r).map((p) => p.component).filter((c): c is Parachute => c.kind === "parachute");

  it("promotes the main to an altitude deployment and adds a drogue at apogee", () => {
    const rocket = newDesign().rocket;
    expect(chutesOf(rocket)).toHaveLength(1); // the starter has a single apogee chute
    const mainD = primaryParachute(rocket)!.diameter;

    const dd = applyGeometryEdits(rocket, { mainDeployAltitude: 150, drogueDiameter: 0.3 });
    const chutes = chutesOf(dd);
    expect(chutes).toHaveLength(2);
    const main = chutes.find((c) => c.name === "Main parachute")!;
    const drogue = chutes.find((c) => c.name === "Drogue")!;
    expect(main.deployEvent).toBe("altitude");
    expect(main.deployAltitude).toBeCloseTo(150, 6);
    expect(main.diameter).toBeCloseTo(mainD, 6); // the main keeps its canopy
    expect(drogue.deployEvent).toBe("apogee");
    expect(drogue.diameter).toBeCloseTo(0.3, 6);
    // The original design is untouched.
    expect(chutesOf(rocket)).toHaveLength(1);
  });

  it("opens the main under the drogue at speed — the dual-deploy safety signature", () => {
    const rocket = newDesign().rocket;
    const single = runFlight(rocket, { configId: "cfg-1" }).result.summary;
    const dd = runFlight(applyGeometryEdits(rocket, { mainDeployAltitude: 150, drogueDiameter: 0.3 }), {
      configId: "cfg-1",
    }).result.summary;
    // A single apogee chute opens at ~0 m/s; the dual-deploy main opens after a drogue descent, so
    // its (worst-case) deployment speed is far higher — the shock that actually matters.
    expect(single.deploymentVelocity ?? 0).toBeLessThan(3);
    expect(dd.deploymentVelocity ?? 0).toBeGreaterThan(8);
    // …yet it still lands gently under the same main.
    expect(dd.groundHitVelocity!).toBeCloseTo(single.groundHitVelocity!, 0);
  });

  it("cuts the wind drift — the reason to fly dual-deploy", () => {
    const rocket = newDesign().rocket;
    const wind = { windSpeed: 6 }; // 6 m/s crosswind
    const single = runFlight(rocket, { configId: "cfg-1", overrides: wind }).result.summary.driftDistance!;
    const dd = runFlight(applyGeometryEdits(rocket, { mainDeployAltitude: 150, drogueDiameter: 0.3 }), {
      configId: "cfg-1",
      overrides: wind,
    }).result.summary.driftDistance!;
    // Falling fast under the drogue until 150 m spends far less time in the wind than drifting all
    // the way down under the main, so the landing is much closer to the pad.
    expect(single).toBeGreaterThan(0);
    expect(dd).toBeLessThan(single * 0.6);
  });
});
