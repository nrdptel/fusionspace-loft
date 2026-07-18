import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { importOrk } from "../ork/import";
import { runFlight, overridesFromStored } from "./run";
import { motorSweep, parameterSweep, linRange, type SweepMotor } from "./sweep";
import { allMotors } from "../motors/db";
import { primaryFinSpan, primaryFinThickness, primaryBodyTube } from "../model/edit";

async function load(name: string) {
  const buf = readFileSync(new URL(`../../fixtures/${name}`, import.meta.url));
  return importOrk(new Uint8Array(buf));
}

/** The fitting bundled motors for a design's mount diameter — the same list the swap picker builds. */
function fittingMotors(diameterM: number): SweepMotor[] {
  const diaMm = Math.round(diameterM * 1000);
  return allMotors()
    .filter((m) => Math.round(m.curve.diameterMm) === diaMm)
    .map((m) => ({
      designation: m.curve.designation,
      manufacturer: m.curve.manufacturer,
      diameter: m.curve.diameterMm / 1000,
      motorClass: m.curve.motorClass,
    }));
}

describe("motorSweep", () => {
  it("flies every fitting motor and returns rows sorted by apogee (highest first)", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const dia = doc.rocket.configurations.find((c) => c.id === sim.conditions.configId)?.instances[0]?.motor
      .diameter;
    expect(dia).toBeGreaterThan(0);
    const motors = fittingMotors(dia!);
    expect(motors.length).toBeGreaterThan(1);

    const rows = motorSweep(doc.rocket, motors, {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
      designMotor: doc.rocket.configurations[0].instances[0].motor.designation,
    });

    // Every returned row is a real flight with finite, positive metrics.
    expect(rows.length).toBeGreaterThan(1);
    for (const r of rows) {
      expect(r.apogee).toBeGreaterThan(0);
      expect(Number.isFinite(r.maxVelocity)).toBe(true);
      expect(Number.isFinite(r.railExitVelocity)).toBe(true);
      expect(Number.isFinite(r.thrustToWeight)).toBe(true);
      expect(Number.isFinite(r.staticMarginCal)).toBe(true);
    }
    // Sorted by apogee, descending.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].apogee).toBeGreaterThanOrEqual(rows[i].apogee);
    }
    // A bigger motor (class) reaches higher: the top row out-flies the bottom row.
    expect(rows[0].apogee).toBeGreaterThan(rows[rows.length - 1].apogee);
  });

  it("marks the design's own motor and no other", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const dia = doc.rocket.configurations[0].instances[0].motor.diameter!;
    const designMotor = doc.rocket.configurations[0].instances[0].motor.designation;
    const motors = fittingMotors(dia);

    const rows = motorSweep(doc.rocket, motors, {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
      designMotor,
    });
    const marked = rows.filter((r) => r.isDesign);
    expect(marked).toHaveLength(1);
    expect(marked[0].designation).toBe(designMotor);
  });

  it("applies nose ballast to every motor — a ballasted sweep flies heavier and lower", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const dia = doc.rocket.configurations[0].instances[0].motor.diameter!;
    const motors = fittingMotors(dia);
    const base = { configId: sim.conditions.configId, overrides: overridesFromStored(sim) };

    const plain = motorSweep(doc.rocket, motors, base);
    const ballasted = motorSweep(doc.rocket, motors, { ...base, ballastKg: 0.25 });

    // Same motors fly, but each ballasted flight is heavier — lower apogee and a more forward CG
    // (higher static margin) for the same motor.
    const byMotor = (rows: typeof plain, des: string) => rows.find((r) => r.designation === des)!;
    for (const p of plain) {
      const b = byMotor(ballasted, p.designation);
      expect(b.apogee).toBeLessThan(p.apogee);
      expect(b.staticMarginCal).toBeGreaterThan(p.staticMarginCal);
    }
  });

  it("omits motors that can't be flown rather than throwing", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const good = fittingMotors(doc.rocket.configurations[0].instances[0].motor.diameter!);
    // A bogus motor the database can't resolve: it produces no thrust, so the sweep leaves it out.
    const withBogus: SweepMotor[] = [
      ...good,
      { designation: "ZZ9999XX", manufacturer: "NoSuchMaker", diameter: good[0].diameter, motorClass: "Z" },
    ];
    const rows = motorSweep(doc.rocket, withBogus, {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(rows.some((r) => r.designation === "ZZ9999XX")).toBe(false);
    expect(rows.length).toBe(good.length);
  });
});

describe("linRange", () => {
  it("returns n evenly-spaced values, endpoints inclusive", () => {
    expect(linRange(0, 10, 5)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(linRange(2, 2, 1)).toEqual([2]);
    const r = linRange(1, 4, 4);
    expect(r[0]).toBe(1);
    expect(r[r.length - 1]).toBe(4);
    expect(r).toHaveLength(4);
  });
});

describe("parameterSweep", () => {
  it("sweeps fin span: bigger fins move the CP aft (more stable) and add drag (lower apogee)", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const span = primaryFinSpan(doc.rocket)!;
    const pts = parameterSweep(doc.rocket, "finSpan", linRange(span * 0.5, span * 1.75, 15), {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(pts).toHaveLength(15);
    // x ascends across the range, every flight finite and positive.
    for (let i = 0; i < pts.length; i++) {
      expect(pts[i].apogee).toBeGreaterThan(0);
      expect(Number.isFinite(pts[i].staticMarginCal)).toBe(true);
      if (i > 0) expect(pts[i].x).toBeGreaterThan(pts[i - 1].x);
    }
    const first = pts[0];
    const last = pts[pts.length - 1];
    // Bigger fins: CP aft ⇒ higher static margin; more fin drag + mass ⇒ lower apogee.
    expect(last.staticMarginCal).toBeGreaterThan(first.staticMarginCal);
    expect(last.apogee).toBeLessThan(first.apogee);
  });

  it("sweeps fin thickness: the flutter margin climbs steeply while drag rises (apogee falls)", async () => {
    const doc = await load("demo-dual-deploy.ork"); // a fast flight where flutter is a real concern
    const sim = doc.simulations[0];
    const t0 = primaryFinThickness(doc.rocket)!;
    const pts = parameterSweep(doc.rocket, "finThickness", linRange(t0 * 0.5, t0 * 1.75, 14), {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(pts).toHaveLength(14);
    // Every point has a finite flutter margin (the design has fins).
    for (const p of pts) expect(Number.isFinite(p.flutterMargin)).toBe(true);
    const first = pts[0];
    const last = pts[pts.length - 1];
    // Thicker fins are much stiffer (flutter speed ∝ (t/c)^1.5) — the margin rises sharply — but
    // present more drag, so the apogee falls across the range.
    expect(last.flutterMargin).toBeGreaterThan(first.flutterMargin);
    expect(last.flutterMargin).toBeGreaterThan(first.flutterMargin * 2); // the (t/c)³ steepness
    expect(last.apogee).toBeLessThan(first.apogee);
  });

  it("reports a flutter margin on a fin-span sweep (bigger fins → thinner flutter margin)", async () => {
    const doc = await load("demo-dual-deploy.ork");
    const sim = doc.simulations[0];
    const span = primaryFinSpan(doc.rocket)!;
    const pts = parameterSweep(doc.rocket, "finSpan", linRange(span * 0.6, span * 1.6, 10), {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    // A larger span raises the aspect ratio, which lowers the flutter speed: the margin shrinks.
    expect(pts[pts.length - 1].flutterMargin).toBeLessThan(pts[0].flutterMargin);
    expect(pts.every((p) => Number.isFinite(p.flutterMargin))).toBe(true);
  });

  it("sweeps body length: a longer airframe flies heavier (lower apogee) and more stable", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const body = primaryBodyTube(doc.rocket)!.length;
    const pts = parameterSweep(doc.rocket, "bodyLength", linRange(body * 0.6, body * 1.6, 12), {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(pts.length).toBeGreaterThan(2);
    expect(pts[pts.length - 1].apogee).toBeLessThan(pts[0].apogee);
    expect(pts[pts.length - 1].staticMarginCal).toBeGreaterThan(pts[0].staticMarginCal);
  });

  it("sweeps body diameter: a wider airframe drags more (lower apogee) and is less stable in calibers", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const d0 = 0.038; // the demo's 38 mm airframe
    const pts = parameterSweep(doc.rocket, "bodyDiameter", linRange(d0 * 0.6, d0 * 1.6, 12), {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(pts.length).toBeGreaterThan(2);
    // Wider ⇒ more reference area and mass (lower apogee) and proportionally smaller fins (less
    // stable in calibers).
    expect(pts[pts.length - 1].apogee).toBeLessThan(pts[0].apogee);
    expect(pts[pts.length - 1].staticMarginCal).toBeLessThan(pts[0].staticMarginCal);
  });

  it("holds other what-ifs fixed while sweeping — active nose ballast still applies at every point", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const span = primaryFinSpan(doc.rocket)!;
    const base = {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    };
    const values = linRange(span * 0.5, span * 1.5, 8);
    const plain = parameterSweep(doc.rocket, "finSpan", values, base);
    // Nose ballast is held fixed across the span sweep; it moves the CG forward and adds mass, so
    // every point is more stable and flies lower than the un-ballasted sweep — proving the other
    // what-if carries through untouched while only fin span varies.
    const ballasted = parameterSweep(doc.rocket, "finSpan", values, { ...base, ballastKg: 0.2 });
    expect(ballasted).toHaveLength(plain.length);
    for (let i = 0; i < plain.length; i++) {
      expect(ballasted[i].staticMarginCal).toBeGreaterThan(plain[i].staticMarginCal);
      expect(ballasted[i].apogee).toBeLessThan(plain[i].apogee);
    }
  });

  it("sweeps nose ballast: more weight raises the margin and lowers apogee, from a zero-ballast start", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    // 0 → 200 g of nose weight.
    const pts = parameterSweep(doc.rocket, "ballastKg", linRange(0, 0.2, 11), {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(pts).toHaveLength(11);
    // Ballast starts at zero (no added weight) and increases.
    expect(pts[0].x).toBe(0);
    expect(pts[pts.length - 1].x).toBeCloseTo(0.2, 9);
    // Nose weight moves the CG forward (margin up monotonically) and flies heavier (apogee down).
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].staticMarginCal).toBeGreaterThan(pts[i - 1].staticMarginCal);
      expect(pts[i].apogee).toBeLessThan(pts[i - 1].apogee);
    }
    // The zero-ballast point is the plain design.
    const plain = runFlight(doc.rocket, { configId: sim.conditions.configId, overrides: overridesFromStored(sim), ballistic: true });
    expect(pts[0].apogee).toBeCloseTo(plain.result.summary.apogee, 5);
    expect(pts[0].staticMarginCal).toBeCloseTo(plain.result.staticMarginCal, 5);
  });

  it("skips non-positive values rather than flying a degenerate rocket", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const span = primaryFinSpan(doc.rocket)!;
    const pts = parameterSweep(doc.rocket, "finSpan", [0, -span, span], {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(pts).toHaveLength(1);
    expect(pts[0].x).toBeCloseTo(span, 9);
  });
});
