import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { importOrk } from "../ork/import";
import { overridesFromStored } from "./run";
import { motorSweep, type SweepMotor } from "./sweep";
import { allMotors } from "../motors/db";

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
