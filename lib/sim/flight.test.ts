import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importOrk } from "../ork/import";
import { runFromDocument, configChoices } from "./run";
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

describe("multi-configuration selection", () => {
  it("offers each stored simulation as a labelled configuration choice", async () => {
    const doc = await load("demo-multi-config.ork");
    const choices = configChoices(doc);
    expect(choices).toHaveLength(2);
    expect(choices[0].motors).toEqual(["H128W"]);
    expect(choices[1].motors).toEqual(["G40W"]);
    expect(choices[0].storedApogeeM).toBe(980);
    expect(choices[1].storedApogeeM).toBe(520);
  });

  it("flies the chosen configuration's motor and compares to its own stored results", async () => {
    const doc = await load("demo-multi-config.ork");
    const forSim = (i: number) =>
      runFromDocument(doc, {
        configId: doc.simulations[i].conditions.configId,
        validateAgainst: doc.simulations[i],
      });
    const h = forSim(0);
    const g = forSim(1);
    expect(h.resolutions[0].match?.entry.curve.designation).toBe("H128W");
    expect(g.resolutions[0].match?.entry.curve.designation).toBe("G40W");
    // The larger motor flies higher, and each is compared against its own stored numbers.
    expect(h.result.summary.apogee).toBeGreaterThan(g.result.summary.apogee);
    expect(h.validation).toBeDefined();
    expect(g.validation).toBeDefined();
    expect(doc.flownAsReduced).toBe(false);
  });
});

describe("motor cluster simulation", () => {
  it("flies a cluster on more thrust and mass than a single motor", async () => {
    const single = await load("demo-single-deploy.ork");
    const singleRun = runFromDocument(single);

    const clustered = await load("demo-single-deploy.ork");
    for (const p of flattenRocket(clustered.rocket)) {
      const c = p.component;
      if ("motorMount" in c && c.motorMount) c.motorMount.clusterCount = 3;
    }
    const run = runFromDocument(clustered);

    // Three identical motors fire: the resolution records the count, and liftoff mass rises
    // (two extra loaded motors plus the tripled motor-tube mass).
    expect(run.resolutions[0].count).toBe(3);
    expect(run.result.liftoffMass).toBeGreaterThan(singleRun.result.liftoffMass);
    // 3× total impulse for only a little more mass ⇒ a higher, finite, plausible apogee.
    expect(run.result.summary.apogee).toBeGreaterThan(singleRun.result.summary.apogee);
    expect(Number.isFinite(run.result.summary.apogee)).toBe(true);
    // A cluster is simulated, not simplified, so the comparison isn't withheld.
    expect(clustered.flownAsReduced).toBe(false);
  });
});

describe("validation withheld for a simplified vehicle", () => {
  it("compares a complete design but withholds it when the flown vehicle is reduced", async () => {
    const doc = await load("demo-single-deploy.ork");
    // Complete single-stage design ⇒ flown whole ⇒ the stored-results comparison runs.
    expect(doc.flownAsReduced).toBe(false);
    expect(runFromDocument(doc).validation).toBeDefined();
    // A staged / pod / parallel / clustered design imports with this flag set; Loft then flew a
    // different vehicle than the stored results describe, so the comparison must be withheld.
    (doc as { flownAsReduced: boolean }).flownAsReduced = true;
    expect(runFromDocument(doc).validation).toBeUndefined();
  });
});

describe("ejection-charge deployment timing", () => {
  const setEjection = (doc: OrkDocument, motorDelay: number) => {
    for (const p of flattenRocket(doc.rocket)) {
      if (p.component.kind === "parachute") p.component.deployEvent = "ejection";
    }
    for (const cfg of doc.rocket.configurations) {
      for (const inst of cfg.instances) inst.motor.delay = motorDelay;
    }
  };

  it("fires at the motor's ejection charge — a too-short delay deploys before apogee", async () => {
    const doc = await load("demo-single-deploy.ork");
    setEjection(doc, 1); // 1 s after burnout — well before this rocket's natural apogee
    const run = runFromDocument(doc);
    const apogee = run.result.events.find((e) => e.type === "apogee")!;
    const deploy = run.result.events.find((e) => e.type === "deploy")!;
    expect(deploy.time).toBeLessThan(apogee.time); // opened while still ascending
    expect(run.result.warnings.some((w) => w.code === "early-deployment")).toBe(true);
  });

  it("deploys after apogee for a long delay — timing tracks the charge, not apogee", async () => {
    const short = await load("demo-single-deploy.ork");
    setEjection(short, 1);
    const shortDeploy = runFromDocument(short).result.events.find((e) => e.type === "deploy")!;

    const long = await load("demo-single-deploy.ork");
    setEjection(long, 20); // fires well after apogee
    const longRun = runFromDocument(long);
    const apogee = longRun.result.events.find((e) => e.type === "apogee")!;
    const deploy = longRun.result.events.find((e) => e.type === "deploy")!;
    expect(deploy.time).toBeGreaterThan(apogee.time); // opened while descending
    expect(longRun.result.warnings.some((w) => w.code === "early-deployment")).toBe(false);
    // Same rocket, different delay ⇒ different deploy time: timing is the charge, not apogee.
    expect(Math.abs(shortDeploy.time - deploy.time)).toBeGreaterThan(2);
    // Still recovers under canopy despite the free-fall before it opens.
    expect(longRun.result.summary.groundHitVelocity).toBeLessThan(15);
  });

  it("flags a ballistic descent when the charge would fire after the rocket is already down", async () => {
    const doc = await load("demo-single-deploy.ork");
    setEjection(doc, 60); // far longer than the whole flight
    const run = runFromDocument(doc);
    expect(run.result.events.some((e) => e.type === "deploy")).toBe(false);
    expect(run.result.warnings.some((w) => w.code === "ballistic-descent")).toBe(true);
    expect(run.result.summary.groundHitVelocity).toBeGreaterThan(50); // comes in ballistic
  });

  it("reports a recovery-independent optimum delay even when the flown delay opens early", async () => {
    // The optimum ejection delay is the delay that deploys AT apogee — a property of the rocket,
    // motor, and conditions, not of the (possibly wrong) delay actually flown. A too-short delay
    // opens the canopy before apogee and truncates the coast; the recommended optimum must not be
    // dragged down with it (that would advise an even shorter delay, compounding the mistake).
    const early = await load("demo-single-deploy.ork");
    setEjection(early, 1); // too short — deploys while ascending
    const earlyRun = runFromDocument(early);
    expect(earlyRun.result.deployedBeforeApogee).toBe(true);

    const late = await load("demo-single-deploy.ork");
    setEjection(late, 20); // deploys after apogee — coast runs to the true top
    const lateRun = runFromDocument(late);
    expect(lateRun.result.deployedBeforeApogee).toBe(false);

    // Same airframe + motor ⇒ same optimum delay regardless of the delay flown (within a step).
    expect(earlyRun.result.summary.optimumDelay).toBeGreaterThan(0);
    expect(earlyRun.result.summary.optimumDelay).toBeCloseTo(lateRun.result.summary.optimumDelay, 1);
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

describe("hard-landing (undersized recovery) warning", () => {
  const chuteOf = (doc: OrkDocument) =>
    flattenRocket(doc.rocket).find((p) => p.component.kind === "parachute")?.component;

  it("does not warn when the canopy brings it in at a sane descent rate", async () => {
    // The bundled demos land at ~6–7 m/s — a normal descent, no caution.
    for (const f of ["demo-single-deploy.ork", "demo-dual-deploy.ork"]) {
      const run = runFromDocument(await load(f));
      expect(run.result.summary.groundHitVelocity).toBeLessThan(7.6);
      expect(run.result.warnings.some((w) => w.code === "hard-landing")).toBe(false);
    }
  });

  it("warns when a chute is far too small for the airframe", async () => {
    const doc = await load("demo-single-deploy.ork");
    const chute = chuteOf(doc);
    expect(chute?.kind).toBe("parachute");
    if (chute?.kind === "parachute") {
      chute.diameter = 0.15; // shrink the canopy drastically
      chute.area = undefined;
    }
    const run = runFromDocument(doc);
    const w = run.result.warnings.find((x) => x.code === "hard-landing");
    expect(run.result.summary.groundHitVelocity).toBeGreaterThan(10.7);
    expect(w).toBeDefined();
    expect(w!.severity).toBe("warning"); // very hard landing
    // A recovery device DID open, so this is the hard-landing case, not the ballistic one.
    expect(run.result.warnings.some((x) => x.code === "ballistic-descent")).toBe(false);
  });

  it("cautions (not warns) at a merely firm landing between the thresholds", async () => {
    const doc = await load("demo-single-deploy.ork");
    const chute = chuteOf(doc);
    if (chute?.kind === "parachute") {
      chute.diameter = 0.35; // firm but not catastrophic
      chute.area = undefined;
    }
    const run = runFromDocument(doc);
    const v = run.result.summary.groundHitVelocity;
    const w = run.result.warnings.find((x) => x.code === "hard-landing");
    if (v > 7.6 && v <= 10.7) {
      expect(w?.severity).toBe("caution");
    }
    expect(v).toBeGreaterThan(7.6);
  });
});
