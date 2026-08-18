import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importOrk } from "../ork/import";
import { runFromDocument, runFlight, noseBallastStation, overridesFromStored } from "./run";
import { marginTrim, finStationTrim, type MarginTrimInput } from "./trim";
import { finStationBounds, primaryFinStation } from "../model/edit";

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

describe("finStationTrim (fin-position stability trim)", () => {
  it("moves the fins to hit a target margin — forward to soften it, aft to stiffen it", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const over = overridesFromStored(sim);
    const nominal = runFlight(doc.rocket, { configId: sim.conditions.configId, overrides: over }).result;
    const cur = nominal.staticMarginCal; // the demo sits over-stable, ~4 cal
    const refD = nominal.stability.refRadius * 2;

    // Trim DOWN to 2.0 cal: the fins move forward — the over-stable fix nose ballast can't do.
    const down = finStationTrim(doc.rocket, cur, nominal.liftoffMass, refD, 2.0)!;
    expect(down.feasible).toBe(true);
    expect(down.shiftM).toBeLessThan(0);
    const flownDown = runFlight(doc.rocket, {
      configId: sim.conditions.configId,
      overrides: over,
      geometry: { finStation: down.targetStation },
    }).result;
    // The solved station reproduces the target margin in a real flight (linear, so it lands close).
    expect(Math.abs(flownDown.staticMarginCal - 2.0)).toBeLessThan(0.1);

    // **Trim UP to 6.0 cal: the fins would have to move aft, and on this design there is nowhere aft
    // to move them.** Its fins sit flush with the tail — 830 mm with a 120 mm root on a 950 mm
    // airframe — so the station the solve asks for is off the airframe and the answer is
    // INFEASIBLE. That is the half this case used to get wrong: it flew `up.targetStation` and
    // asserted the flight reached 6.0 cal, which it could only do while `applyGeometryEdits` was
    // willing to hang the fins behind the rocket. `components/ResultsView.tsx` already gates the
    // suggestion on `feasible`, so the flyer is now offered nothing here rather than a station the
    // model would silently refuse.
    const up = finStationTrim(doc.rocket, cur, nominal.liftoffMass, refD, 6.0)!;
    expect(up.shiftM).toBeGreaterThan(0);
    expect(up.feasible, "a station off the tail must not be offered as achievable").toBe(false);
    expect(up.targetStation).toBeGreaterThan(finStationBounds(doc.rocket)!.hi);
    // ...and flying it anyway lands short of the target, which is the measurement that makes the
    // infeasibility real rather than a label: the model clamps the station, so the margin the flyer
    // would have got is nowhere near the 6.0 the solve named.
    const flownUp = runFlight(doc.rocket, {
      configId: sim.conditions.configId,
      overrides: over,
      geometry: { finStation: up.targetStation },
    }).result;
    expect(Math.abs(flownUp.staticMarginCal - 6.0)).toBeGreaterThan(0.5);
    expect(flownUp.staticMarginCal).toBeCloseTo(cur, 6);
  }, 20000);

  it("probes forward when there is no room aft, and still solves", async () => {
    // **A clamp breaks every finite difference that steps blind, and this one stepped aft.** The
    // slope is measured by moving the fins 5 cm and reading the margin change; once
    // `keepFinsOnAirframe` bounds the station, a design whose fins are flush with the tail — which is
    // where fins usually are, and is true of all seven committed fixtures — had its probe clamped
    // straight back to where it started. The difference quotient then divided zero, the slope failed
    // the authority test, and this function returned null: the trim silently stopped existing on
    // exactly the designs it is most useful on. It probes in whichever direction has room now.
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const over = overridesFromStored(sim);
    const nominal = runFlight(doc.rocket, { configId: sim.conditions.configId, overrides: over }).result;
    const refD = nominal.stability.refRadius * 2;
    // There is genuinely no room aft — the premise of the case.
    expect(finStationBounds(doc.rocket)!.hi).toBeCloseTo(primaryFinStation(doc.rocket)!, 9);
    const trim = finStationTrim(doc.rocket, nominal.staticMarginCal, nominal.liftoffMass, refD, 2.0);
    expect(trim, "the trim returned null on a design with a perfectly good forward direction").not.toBeNull();
    expect(trim!.feasible).toBe(true);
    // And the slope it measured is the real one: flying the station it names reaches the target.
    const flown = runFlight(doc.rocket, {
      configId: sim.conditions.configId,
      overrides: over,
      geometry: { finStation: trim!.targetStation },
    }).result;
    expect(Math.abs(flown.staticMarginCal - 2.0)).toBeLessThan(0.1);
  }, 20000);

  it("returns null when there is nothing to solve (no fins, no diameter, no mass)", async () => {
    const doc = await load("demo-single-deploy.ork");
    const m = runFlight(doc.rocket, { configId: doc.simulations[0].conditions.configId }).result;
    const refD = m.stability.refRadius * 2;
    // A zero loaded mass or reference diameter has no defined margin slope.
    expect(finStationTrim(doc.rocket, m.staticMarginCal, 0, refD, 2)).toBeNull();
    expect(finStationTrim(doc.rocket, m.staticMarginCal, m.liftoffMass, 0, 2)).toBeNull();
  }, 20000);
});
