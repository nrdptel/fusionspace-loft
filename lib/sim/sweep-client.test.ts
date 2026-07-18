import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { importOrk } from "../ork/import";
import { overridesFromStored } from "./run";
import { motorSweep, parameterSweep, linRange, type SweepMotor } from "./sweep";
import { runMotorSweep, runParameterSweep } from "./sweep-client";
import { allMotors } from "../motors/db";
import { primaryFinSpan } from "../model/edit";

async function load(name: string) {
  return importOrk(new Uint8Array(readFileSync(new URL(`../../fixtures/${name}`, import.meta.url))));
}

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

describe("sweep-client (batched, non-blocking)", () => {
  it("runMotorSweep yields exactly what the synchronous motorSweep does", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const motors = fittingMotors(doc.rocket.configurations[0].instances[0].motor.diameter!);
    const opts = {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
      designMotor: doc.rocket.configurations[0].instances[0].motor.designation,
    };
    const sync = motorSweep(doc.rocket, motors, opts);
    const async = await runMotorSweep(doc.rocket, motors, opts);
    expect(async).toEqual(sync);
  });

  it("runParameterSweep yields exactly what the synchronous parameterSweep does", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const span = primaryFinSpan(doc.rocket)!;
    const values = linRange(span * 0.5, span * 1.75, 25);
    const opts = { configId: sim.conditions.configId, overrides: overridesFromStored(sim) };
    const sync = parameterSweep(doc.rocket, "finSpan", values, opts);
    const async = await runParameterSweep(doc.rocket, "finSpan", values, opts);
    expect(async).toEqual(sync);
  });

  it("abort stops the sweep early, returning only what finished", async () => {
    const doc = await load("demo-single-deploy.ork");
    const sim = doc.simulations[0];
    const motors = fittingMotors(doc.rocket.configurations[0].instances[0].motor.diameter!);
    // Abort immediately: no full run should complete (at most the first batch before the first yield).
    const rows = await runMotorSweep(
      doc.rocket,
      motors,
      { configId: sim.conditions.configId, overrides: overridesFromStored(sim) },
      () => true,
    );
    expect(rows.length).toBeLessThan(motors.length);
  });
});
