import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importOrk } from "../ork/import";
import { runFromDocument, runFlight, noseBallastStation } from "./run";
import { marginTrim, type MarginTrimInput } from "./trim";

async function load(name: string) {
  const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), "fixtures", name)));
  return importOrk(bytes);
}

describe("marginTrim (closed-form stability trim)", () => {
  // A rocket 1 m long, 0.1 m diameter, nose ballast at 0.15 m, CP at 0.80 m, loaded CG at 0.55 m,
  // loaded mass 2 kg. Current margin = (0.80 − 0.55)/0.1 = 2.5 cal.
  const base: MarginTrimInput = {
    cp: 0.8,
    cgLoaded: 0.55,
    loadedMass: 2,
    refDiameter: 0.1,
    noseStation: 0.15,
  };

  it("reports the current margin", () => {
    const t = marginTrim(base, 3.5);
    expect(t.currentMarginCal).toBeCloseTo(2.5, 6);
  });

  it("needs no ballast when the design already meets the target", () => {
    const t = marginTrim(base, 2.0); // below current 2.5
    expect(t.alreadyMet).toBe(true);
    expect(t.feasible).toBe(true);
    expect(t.ballastKg).toBe(0);
    expect(t.achievedMarginCal).toBeCloseTo(2.5, 6);
  });

  it("solves the exact ballast for a reachable target, and the solution reproduces the target", () => {
    const target = 3.0;
    const t = marginTrim(base, target);
    expect(t.feasible).toBe(true);
    expect(t.alreadyMet).toBe(false);
    expect(t.ballastKg).toBeGreaterThan(0);
    // Re-apply the returned ballast to the loaded CG blend and confirm the margin lands on target.
    const b = t.ballastKg;
    const cgWithBallast = (base.loadedMass * base.cgLoaded + b * base.noseStation) / (base.loadedMass + b);
    const marginWithBallast = (base.cp - cgWithBallast) / base.refDiameter;
    expect(marginWithBallast).toBeCloseTo(target, 6);
    expect(t.achievedMarginCal).toBeCloseTo(target, 6);
  });

  it("reports the ceiling and flags infeasible when nose ballast alone can't reach the target", () => {
    // Max attainable = (cp − noseStation)/d = (0.80 − 0.15)/0.1 = 6.5 cal.
    const t = marginTrim(base, 8.0);
    expect(t.maxMarginCal).toBeCloseTo(6.5, 6);
    expect(t.feasible).toBe(false);
    expect(t.ballastKg).toBe(0);
    expect(t.achievedMarginCal).toBeCloseTo(6.5, 6);
  });

  it("degrades safely on a design with no reference diameter", () => {
    const t = marginTrim({ ...base, refDiameter: 0 }, 2.0);
    expect(t.feasible).toBe(false);
    expect(t.ballastKg).toBe(0);
  });

  it("is monotone: a stiffer target needs more ballast", () => {
    const a = marginTrim(base, 3.0).ballastKg;
    const b = marginTrim(base, 4.0).ballastKg;
    expect(b).toBeGreaterThan(a);
  });
});

describe("marginTrim round-trip against a real flight", () => {
  it("the ballast it returns, flown, produces the target margin the solver reports", async () => {
    const doc = await load("demo-single-deploy.ork");
    const design = doc.rocket;
    const run = runFromDocument(doc);
    const r = run.result;

    const input: MarginTrimInput = {
      cp: r.stability.cp,
      cgLoaded: r.cgLoaded,
      loadedMass: r.liftoffMass,
      refDiameter: r.stability.refRadius * 2,
      noseStation: noseBallastStation(design),
    };
    const target = input.cp && input.refDiameter > 0 ? r.staticMarginCal + 0.5 : 0;
    const trim = marginTrim(input, target);
    expect(trim.feasible).toBe(true);
    expect(trim.ballastKg).toBeGreaterThan(0);

    // Fly the SAME design with exactly that nose ballast and read the solver's own static margin.
    const flown = runFlight(design, {
      configId: run.config.id,
      ballastKg: trim.ballastKg,
    });
    // The closed form and the flight's mass/CG combine must agree to a hundredth of a caliber.
    expect(flown.result.staticMarginCal).toBeCloseTo(target, 2);
  }, 20000);
});
