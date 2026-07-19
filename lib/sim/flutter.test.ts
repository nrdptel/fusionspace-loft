import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  finFlutterVelocity,
  shearModulusFor,
  analyzeFlutter,
  thicknessForFlutterMargin,
  RECOMMENDED_FLUTTER_MARGIN,
} from "./flutter";
import { Atmosphere } from "./atmosphere";
import { importOrk } from "../ork/import";
import { runFromDocument, runFlight } from "./run";
import { flattenRocket } from "../model/geometry";

async function load(name: string) {
  const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), "fixtures", name)));
  return importOrk(bytes);
}

describe("finFlutterVelocity — the NACA TN 4197 simplified closed form", () => {
  it("reproduces a hand-computed value exactly", () => {
    // cr=0.2, ct=0.1, b=0.1 ⇒ area 0.015, AR 0.6667, λ 0.5, t/c 0.02; G 3 GPa, P 101325 Pa,
    // a 340 m/s. Worked through the closed form by hand, Vf = 495.7367908979871 m/s.
    const vf = finFlutterVelocity({
      rootChord: 0.2,
      tipChord: 0.1,
      semiSpan: 0.1,
      thickness: 0.004,
      shearModulus: 3.0e9,
      pressure: 101325,
      speedOfSound: 340,
    });
    expect(vf).toBeCloseTo(495.7367908979871, 6);
  });

  it("rises with the cube of thickness (Vf ∝ (t/c)^1.5)", () => {
    const base = { rootChord: 0.2, tipChord: 0.1, semiSpan: 0.1, shearModulus: 3.0e9, pressure: 101325, speedOfSound: 340 };
    const v1 = finFlutterVelocity({ ...base, thickness: 0.003 });
    const v2 = finFlutterVelocity({ ...base, thickness: 0.006 }); // 2× thickness
    // Vf ∝ (t/c)^{3/2}, so doubling thickness multiplies Vf by 2^1.5 ≈ 2.828.
    expect(v2 / v1).toBeCloseTo(Math.pow(2, 1.5), 6);
  });

  it("rises with the square root of the shear modulus", () => {
    const base = { rootChord: 0.2, tipChord: 0.1, semiSpan: 0.1, thickness: 0.004, pressure: 101325, speedOfSound: 340 };
    const v1 = finFlutterVelocity({ ...base, shearModulus: 3.0e9 });
    const v2 = finFlutterVelocity({ ...base, shearModulus: 12.0e9 }); // 4× stiffer
    expect(v2 / v1).toBeCloseTo(2, 6); // √4 = 2
  });

  it("falls as the fin gets larger (higher aspect ratio) and rises as pressure drops (altitude)", () => {
    const base = { rootChord: 0.2, tipChord: 0.1, thickness: 0.004, shearModulus: 3.0e9, speedOfSound: 340 };
    const small = finFlutterVelocity({ ...base, semiSpan: 0.1, pressure: 101325 });
    const tall = finFlutterVelocity({ ...base, semiSpan: 0.2, pressure: 101325 });
    expect(tall).toBeLessThan(small); // a longer, higher-aspect fin flutters sooner
    // Thinner air (higher altitude) raises the flutter boundary: Vf ∝ 1/√P at fixed a.
    const highAlt = finFlutterVelocity({ ...base, semiSpan: 0.1, pressure: 101325 / 2 });
    expect(highAlt / small).toBeCloseTo(Math.sqrt(2), 6);
  });

  it("returns Infinity for a degenerate fin (no flutter constraint)", () => {
    const g = { rootChord: 0.2, tipChord: 0.1, semiSpan: 0.1, shearModulus: 3.0e9, pressure: 101325, speedOfSound: 340 };
    expect(finFlutterVelocity({ ...g, thickness: 0 })).toBe(Infinity); // a zero-thickness plate
    expect(finFlutterVelocity({ ...g, semiSpan: 0, thickness: 0.004 })).toBe(Infinity); // no span
  });

  it("estimates a real fluttered fin below the speed that destroyed it", () => {
    // Nakka Rocketry's flutter case study: acrylic fins (G ≈ 1.15 GPa), cr 105.66 mm, ct 55.1 mm,
    // semi-span 117.7 mm, t 1.91 mm, at ~1000 m (P 89.8 kPa, a 336 m/s). The fins fluttered and
    // broke at ~200 m/s. Our simplified estimate is method-dependent (the full TN 4197 method with
    // its mass-balance term gives ~71 m/s), but it must land well below the 200 m/s that actually
    // caused failure — i.e. Loft would have flagged it.
    const vf = finFlutterVelocity({
      rootChord: 0.10566,
      tipChord: 0.0551,
      semiSpan: 0.1177,
      thickness: 0.00191,
      shearModulus: 1.1515e9,
      pressure: 89800,
      speedOfSound: 336,
    });
    expect(vf).toBeGreaterThan(60);
    expect(vf).toBeLessThan(120);
    expect(vf).toBeLessThan(200 / RECOMMENDED_FLUTTER_MARGIN); // comfortably inside a warning
  });
});

describe("shearModulusFor — material lookup", () => {
  it("recognises the common fin materials from the design's own name", () => {
    expect(shearModulusFor({ name: "G10 fiberglass", density: 1850, type: "bulk" }).assumed).toBe(false);
    expect(shearModulusFor({ name: "Carbon fiber", density: 1600, type: "bulk" }).g).toBe(5.0e9);
    expect(shearModulusFor({ name: "Aluminum 6061", density: 2700, type: "bulk" }).g).toBe(26e9);
    expect(shearModulusFor({ name: "Birch plywood", density: 680, type: "bulk" }).g).toBeLessThan(1e9);
    // Ordering: carbon/aluminium win over the generic composite pattern.
    expect(shearModulusFor({ name: "Balsa", density: 170, type: "bulk" }).label).toBe("Balsa");
  });

  it("assumes G10 fibreglass when the material is missing or unrecognised, and says so", () => {
    const none = shearModulusFor(undefined);
    expect(none.assumed).toBe(true);
    expect(none.g).toBe(3.0e9);
    const weird = shearModulusFor({ name: "Unobtainium", density: 1000, type: "bulk" });
    expect(weird.assumed).toBe(true);
    expect(weird.g).toBe(3.0e9);
    expect(weird.label).toContain("assumed");
  });
});

describe("analyzeFlutter — worst-case margin over the ascent", () => {
  it("reports a healthy margin (no false alarm) for the bundled demos", async () => {
    for (const name of ["demo-single-deploy.ork", "demo-dual-deploy.ork", "demo-boattail.ork"]) {
      const doc = await load(name);
      const run = runFromDocument(doc);
      const rep = run.result.flutter;
      expect(rep, `${name} should have a flutter report (it has fins)`).toBeDefined();
      // 4–5 mm G10 fins on these airframes are well clear of flutter.
      expect(rep!.worst.margin).toBeGreaterThan(RECOMMENDED_FLUTTER_MARGIN);
      expect(run.result.warnings.some((w) => w.code === "fin-flutter")).toBe(false);
    }
  });

  it("flags flutter (warning) once the fins are made too thin", async () => {
    const doc = await load("demo-dual-deploy.ork"); // a fast, transonic flight
    for (const p of flattenRocket(doc.rocket)) {
      const c = p.component;
      if (c.kind === "trapezoidfinset" || c.kind === "ellipticalfinset" || c.kind === "freeformfinset") {
        (c as { thickness: number }).thickness = 0.0008; // 0.8 mm — far too thin for this speed
      }
    }
    const run = runFromDocument(doc);
    expect(run.result.flutter!.worst.margin).toBeLessThan(1);
    const w = run.result.warnings.find((x) => x.code === "fin-flutter");
    expect(w).toBeDefined();
    expect(w!.severity).toBe("warning");
  });

  it("only considers the ascent — a fast descent never sets the margin", async () => {
    // Drive a real imported design with a synthetic trajectory: a gentle ascent sample and a
    // blazing descent sample. The descent (however fast) is ignored, so the margin is set by the
    // 50 m/s ascent point, not the 900 m/s descent one.
    const doc = await load("demo-single-deploy.ork");
    const traj = [
      { velocity: 50, altitude: 100, phase: "boost" },
      { velocity: 900, altitude: 500, phase: "descent" },
    ];
    const rep = analyzeFlutter(doc.rocket, traj, new Atmosphere(), 0);
    expect(rep).toBeDefined();
    expect(rep!.worst.velocity).toBe(50);
  });

  it("thicknessForFlutterMargin solves t ∝ margin^(2/3), and no-ops when already met", () => {
    // margin ∝ t^1.5, so to triple the margin, thickness grows by 3^(2/3).
    expect(thicknessForFlutterMargin(0.002, 0.5, 1.5)).toBeCloseTo(0.002 * Math.pow(3, 2 / 3), 9);
    // Already at/above the target ⇒ leave the thickness alone.
    expect(thicknessForFlutterMargin(0.003, 2.0, 1.5)).toBe(0.003);
    // Degenerate inputs return the input unchanged.
    expect(thicknessForFlutterMargin(0, 0.5, 1.5)).toBe(0);
  });

  it("the fix thickness, flown, actually reaches the target margin (conservatively)", async () => {
    const doc = await load("demo-dual-deploy.ork"); // a fast, transonic flight
    for (const p of flattenRocket(doc.rocket)) {
      const c = p.component;
      if (c.kind === "trapezoidfinset" || c.kind === "ellipticalfinset" || c.kind === "freeformfinset") {
        (c as { thickness: number }).thickness = 0.0008; // 0.8 mm — flutters
      }
    }
    const thin = runFromDocument(doc).result.flutter!.worst;
    expect(thin.margin).toBeLessThan(RECOMMENDED_FLUTTER_MARGIN);

    const tFix = thicknessForFlutterMargin(thin.thickness, thin.margin, RECOMMENDED_FLUTTER_MARGIN);
    expect(tFix).toBeGreaterThan(thin.thickness);

    // Re-fly the design with the fins thickened to the fix via the same what-if the UI uses.
    const fixed = runFlight(doc.rocket, { geometry: { finThickness: tFix } }).result.flutter!.worst;
    // It reaches the target and, because a thicker fin also drags a little more (lower peak speed),
    // errs a touch above it — never below. Not wildly over, either.
    expect(fixed.margin).toBeGreaterThanOrEqual(RECOMMENDED_FLUTTER_MARGIN * 0.99);
    expect(fixed.margin).toBeLessThan(RECOMMENDED_FLUTTER_MARGIN * 1.35);
  }, 20000);

  it("returns undefined for a finless design", async () => {
    const doc = await load("demo-single-deploy.ork");
    // Strip every fin set from the tree (recursively — fins hang off the body tube, not the stage).
    const stripFins = (c: (typeof doc.rocket.stages)[number]["components"][number]): typeof c => ({
      ...c,
      children: c.children.filter((ch) => !ch.kind.includes("finset")).map(stripFins),
    });
    const finless = {
      ...doc.rocket,
      stages: doc.rocket.stages.map((s) => ({
        ...s,
        components: s.components.filter((c) => !c.kind.includes("finset")).map(stripFins),
      })),
    };
    expect(flattenRocket(finless).some((p) => p.component.kind.includes("finset"))).toBe(false);
    const rep = analyzeFlutter(finless, [{ velocity: 100, altitude: 50, phase: "boost" }], new Atmosphere(), 0);
    expect(rep).toBeUndefined();
  });
});
