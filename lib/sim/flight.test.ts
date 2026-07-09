import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importOrk } from "../ork/import";
import { runFromDocument } from "./run";
import { flattenRocket } from "../model/geometry";
import type { OrkDocument } from "../ork/adapt";

/** End-to-end: import each committed fixture, fly it, and check the results are physically
 *  plausible and stable. The exact numbers are Loft's own engine output (a regression guard),
 *  NOT an accuracy claim against OpenRocket — the fixtures' stored figures are independent
 *  author estimates (see fixtures/README.md). Bands are wide on purpose. */

async function load(name: string) {
  const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), "fixtures", name)));
  return importOrk(bytes);
}

describe("single-deploy fixture flight", () => {
  it("flies plausibly and resolves the motor exactly", async () => {
    const doc = await load("demo-single-deploy.ork");
    const run = runFromDocument(doc);

    expect(run.resolutions[0].match?.quality).toBe("exact");
    const s = run.result.summary;

    // Plausibility (H128W, ~0.9 kg): subsonic, sub-2 km, a few hundred m/s.
    expect(s.apogee).toBeGreaterThan(300);
    expect(s.apogee).toBeLessThan(2000);
    expect(s.maxVelocity).toBeGreaterThan(80);
    expect(s.maxVelocity).toBeLessThan(300);
    expect(s.maxMach).toBeLessThan(0.8); // stays in the validated subsonic envelope
    expect(s.railExitVelocity).toBeGreaterThan(10);
    // Recovery: single chute, a walking-pace-ish descent, lands.
    expect(s.descentRate).toBeGreaterThan(3);
    expect(s.descentRate).toBeLessThan(20);
    expect(s.groundHitVelocity).toBeLessThan(20);

    // Stability sane and positive.
    expect(run.result.staticMarginCal).toBeGreaterThan(1);
    expect(run.result.stability.cp).toBeGreaterThan(run.result.cgLoaded);

    // The validation harness runs and produces a finite MAPE against the stored estimates.
    expect(run.validation).toBeDefined();
    expect(Number.isFinite(run.validation!.mape)).toBe(true);
    expect(run.validation!.count).toBeGreaterThanOrEqual(6);

    // Regression: the per-sample acceleration must not be dead-zero (it powers the plot).
    const peakSampleAccel = Math.max(...run.result.trajectory.map((s) => Math.abs(s.acceleration)));
    expect(peakSampleAccel).toBeGreaterThan(20); // boost accel is tens of m/s²
  });
});

describe("unresolvable motor", () => {
  it("reports no propulsion and withholds the validation comparison", async () => {
    const doc = await load("demo-single-deploy.ork");
    // Point every motor instance at a designation the bundled database can't match, so the
    // resolver returns null and the flight has no thrust — the case a real file hits when its
    // motor isn't in the curated subset.
    for (const cfg of doc.rocket.configurations) {
      for (const inst of cfg.instances) {
        inst.motor.manufacturer = "NoSuchMaker";
        inst.motor.designation = "ZZ9999XX";
      }
    }
    const run = runFromDocument(doc);

    // The resolution is honestly reported as a miss, and the run flags itself as unflyable.
    expect(run.resolutions.length).toBeGreaterThan(0);
    expect(run.resolutions.every((r) => r.match === null)).toBe(true);
    expect(run.hasPropulsion).toBe(false);
    expect(run.result.warnings.some((w) => w.code === "no-motor")).toBe(true);

    // No bogus −100% comparison is produced even though the file carries stored results.
    expect(run.validation).toBeUndefined();

    // The degenerate "flight" never leaves the pad — which is exactly why its numbers are hidden.
    expect(run.result.summary.apogee).toBeLessThan(1);
  });
});

describe("partial motor cluster", () => {
  it("flies on the resolved motor but flags the under-counted thrust", async () => {
    const doc = await load("demo-single-deploy.ork");
    // Turn the single-motor design into a two-motor cluster where the second motor can't be
    // resolved: the flight still has thrust (so it flies), but on less than the design calls
    // for — the case that otherwise reads as an ordinary, complete flight.
    for (const cfg of doc.rocket.configurations) {
      if (cfg.instances.length === 0) continue;
      const base = cfg.instances[0];
      cfg.instances.push({
        ...base,
        motor: { ...base.motor, manufacturer: "NoSuchMaker", designation: "ZZ9999XX" },
      });
    }
    const run = runFromDocument(doc);

    // One resolved, one missing — a genuine partial cluster.
    expect(run.resolutions.some((r) => r.match !== null)).toBe(true);
    expect(run.resolutions.some((r) => r.match === null)).toBe(true);
    expect(run.hasPropulsion).toBe(true);

    // Flagged as a partial cluster, not as "no motor", and the flight still ran.
    expect(run.result.warnings.some((w) => w.code === "partial-cluster")).toBe(true);
    expect(run.result.warnings.some((w) => w.code === "no-motor")).toBe(false);
    expect(run.result.summary.apogee).toBeGreaterThan(0);
  });
});

describe("recovery deploy delay", () => {
  const setDelay = (doc: OrkDocument, delay: number) => {
    for (const p of flattenRocket(doc.rocket)) {
      if (p.component.kind === "parachute" || p.component.kind === "streamer") {
        p.component.deployDelay = delay;
      }
    }
  };

  it("free-falls on body drag until the canopy opens, then reports the higher deploy speed", async () => {
    const immediate = await load("demo-single-deploy.ork");
    setDelay(immediate, 0);
    const runNow = runFromDocument(immediate);

    const delayed = await load("demo-single-deploy.ork");
    setDelay(delayed, 6);
    const runDelayed = runFromDocument(delayed);

    // Same vehicle, same ascent, same apogee — only the recovery delay differs.
    expect(runDelayed.result.summary.apogee).toBeCloseTo(runNow.result.summary.apogee, 0);

    // With a 6 s delay the vehicle free-falls before the canopy opens, so the deployment
    // velocity is far higher than an immediate deploy near apogee. Before the fix the delay
    // was ignored (the canopy dragged from the charge instant) and these were equal.
    expect(runDelayed.result.summary.deploymentVelocity).toBeGreaterThan(
      runNow.result.summary.deploymentVelocity + 20,
    );

    // The deploy marker lands ~6 s after apogee (within a couple of integration steps).
    const apo = runDelayed.result.events.find((e) => e.type === "apogee")!;
    const dep = runDelayed.result.events.find((e) => e.type === "deploy")!;
    expect(dep.time - apo.time).toBeGreaterThan(5.5);
    expect(dep.time - apo.time).toBeLessThan(6.5);
  });
});

describe("dual-deploy fixture flight", () => {
  it("deploys a drogue at apogee and a main at altitude", async () => {
    const doc = await load("demo-dual-deploy.ork");
    const run = runFromDocument(doc);

    expect(run.resolutions[0].match?.quality).toBe("exact");
    const deploys = run.result.events.filter((e) => e.type === "deploy");
    expect(deploys.length).toBe(2);

    const s = run.result.summary;
    expect(s.apogee).toBeGreaterThan(800);
    expect(s.maxVelocity).toBeGreaterThan(150);
    // Main brings it in slow.
    expect(s.descentRate).toBeGreaterThan(3);
    expect(s.descentRate).toBeLessThan(15);
    // Transonic flight is flagged as extrapolated.
    expect(run.result.warnings.some((w) => w.code === "transonic")).toBe(true);
  });
});
