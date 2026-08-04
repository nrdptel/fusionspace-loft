/** The transonic caveat has to reach EVERY surface that flies the solver — not just the flight card.
 *
 *  **This is the check for a Sev-1, and the shape of the defect is why it is written per carrier.**
 *  `FlightResult.extrapolatedTransonic` has existed since the `Extrapolated` treatment did, and
 *  `ResultsView` marked it. But the Monte-Carlo, the parameter sweep and the motor sweep summarise a
 *  run down to their own row/sample types — and none of those types carried the flag, so it was not
 *  that four components forgot to render a marker: the fact never left the solver. A flyer choosing a
 *  motor, sizing recovery from a dispersion, or reading a sweep curve saw figures identical to
 *  validated ones, while the same flight one panel away said "treat it as rough".
 *
 *  Measured on the real-design corpus when this was found: **9 of 109 flown stored simulations leave
 *  the M ≤ 0.8 envelope**, reaching M1.67 on `OR vs RAS Test 1.ork`. It is not a hypothetical.
 *
 *  So each assertion below pins the CARRIER, on a committed fixture that actually crosses the
 *  envelope — delete the field from any of the three result types and the corresponding case reds.
 *  `demo-dual-deploy.ork` flies to M1.29 and `demo-single-deploy.ork` to M0.60, so every case has a
 *  positive and a negative control and cannot pass by always answering the same way — and the two
 *  sweep cases get theirs from inside a single run, by choosing a range wide enough that the flag
 *  actually changes along it. That is not decoration: the first draft of the parameter-sweep case
 *  swept a range where 7 of 7 points were extrapolated, which passes identically if the flag is read
 *  from each point's own flight, copied from the nominal design, or hard-coded true. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { importOrk } from "../ork/import";
import { runFlight, overridesFromStored } from "./run";
import { motorSweep, parameterSweep, linRange, type SweepMotor } from "./sweep";
import { monteCarlo } from "./montecarlo";
import { allMotors } from "../motors/db";
import { primaryFinSpan } from "../model/edit";

async function load(name: string) {
  const buf = readFileSync(new URL(`../../fixtures/${name}`, import.meta.url));
  return importOrk(new Uint8Array(buf));
}

/** The fixture that leaves the envelope, and the one that stays inside it. */
const TRANSONIC = "demo-dual-deploy.ork";
const SUBSONIC = "demo-single-deploy.ork";

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

async function flightOf(name: string) {
  const doc = await load(name);
  const sim = doc.simulations[0];
  return {
    doc,
    sim,
    run: runFlight(doc.rocket, {
      configId: sim?.conditions.configId,
      overrides: sim ? overridesFromStored(sim) : undefined,
    }),
  };
}

describe("the transonic caveat reaches every surface that flies the solver", () => {
  it("has a fixture on each side of the envelope, so the cases below can discriminate", async () => {
    const hot = await flightOf(TRANSONIC);
    const cold = await flightOf(SUBSONIC);
    // Stated as the physical fact rather than as the flag, so this reds if the envelope constant
    // moves and quietly makes every other case in this file vacuous.
    expect(hot.run.result.summary.maxMach).toBeGreaterThan(0.8);
    expect(cold.run.result.summary.maxMach).toBeLessThan(0.8);
    expect(hot.run.result.extrapolatedTransonic).toBe(true);
    expect(cold.run.result.extrapolatedTransonic).toBe(false);
  }, 30_000);

  it("carries it onto every motor-sweep row, and only onto the ones that earn it", async () => {
    const { doc, sim, run } = await flightOf(TRANSONIC);
    const dia = doc.rocket.configurations.find((c) => c.id === sim.conditions.configId)?.instances[0]
      ?.motor.diameter;
    expect(dia).toBeGreaterThan(0);
    const rows = motorSweep(doc.rocket, fittingMotors(dia!), {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(rows.length).toBeGreaterThan(1);
    // Every row answers the question — the field is not optional and not undefined anywhere.
    for (const r of rows) expect(typeof r.extrapolatedTransonic).toBe("boolean");
    // And the marking is per row rather than per table: a motor sweep exists to rank candidates,
    // and the faster candidates are the ones that cross M0.8. If every row answered the same way the
    // flag would be decoration, so this asserts the sweep actually splits.
    const hot = rows.filter((r) => r.extrapolatedTransonic).length;
    expect(hot).toBeGreaterThan(0);
    expect(hot).toBeLessThan(rows.length);
    // A faster flight is the one that leaves the envelope — the flag must track speed, not row order.
    const slowest = [...rows].sort((a, b) => a.maxVelocity - b.maxVelocity)[0];
    expect(slowest.extrapolatedTransonic).toBe(false);
    expect(run.result.extrapolatedTransonic).toBe(true);
  }, 120_000);

  it("carries it onto every parameter-sweep point, and splits the curve where the flights do", async () => {
    const { doc, sim } = await flightOf(TRANSONIC);
    const span = primaryFinSpan(doc.rocket);
    expect(span).toBeGreaterThan(0);
    // **The range is 1x to 8x deliberately, and the first version of this case got it wrong.**
    // Sweeping 0.5x-1.5x returns 7 of 7 points extrapolated on this fixture, so `some(...)` passed
    // byte-identically whether the flag came from each point's own flight, from the nominal design
    // copied across the curve, or from a literal `true`. A case with no negative control does not
    // discriminate, however green it is. Over 1x-8x the fins grow enough to drag the tail of the
    // range back under M0.8: measured 4 hot of 9.
    const pts = parameterSweep(doc.rocket, "finSpan", linRange(span!, span! * 8, 9), {
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(pts.length).toBeGreaterThan(1);
    for (const p of pts) expect(typeof p.extrapolatedTransonic).toBe("boolean");
    const hot = pts.filter((p) => p.extrapolatedTransonic).length;
    expect(hot).toBeGreaterThan(0);
    expect(hot).toBeLessThan(pts.length);
    // And it splits the way the PHYSICS does rather than by position: bigger fins are draggier, so
    // the slow end of this axis is the end that stays inside the envelope. A flag copied from the
    // nominal design would mark every point; one keyed to the index would not track speed.
    const fastest = [...pts].sort((a, b) => b.maxVelocity - a.maxVelocity)[0];
    const slowest = [...pts].sort((a, b) => a.maxVelocity - b.maxVelocity)[0];
    expect(fastest.extrapolatedTransonic).toBe(true);
    expect(slowest.extrapolatedTransonic).toBe(false);
  }, 120_000);

  it("counts the dispersed flights that left the envelope, rather than flattening them to a flag", async () => {
    const { doc, sim } = await flightOf(TRANSONIC);
    const hot = monteCarlo(doc.rocket, {
      n: 30,
      seed: 4242,
      dispersions: { impulseFrac: 0.05, rodAngleDeg: 3, windSpeedMps: 2 },
      configId: sim.conditions.configId,
      overrides: overridesFromStored(sim),
    });
    expect(hot.n).toBeGreaterThan(0);
    expect(hot.extrapolatedN).toBeGreaterThan(0);
    // A count, not a boolean — it must never exceed the flights it is counted over, which is the
    // property a surface's "N of M" sentence depends on.
    expect(hot.extrapolatedN).toBeLessThanOrEqual(hot.n);
    // Per sample, so a design that stays inside the envelope counts zero rather than inheriting the
    // nominal flight's answer.
    const coldDoc = await load(SUBSONIC);
    const coldSim = coldDoc.simulations[0];
    const cold = monteCarlo(coldDoc.rocket, {
      n: 30,
      seed: 4242,
      dispersions: { impulseFrac: 0.05, rodAngleDeg: 3, windSpeedMps: 2 },
      configId: coldSim.conditions.configId,
      overrides: overridesFromStored(coldSim),
    });
    expect(cold.n).toBeGreaterThan(0);
    expect(cold.extrapolatedN).toBe(0);
  }, 120_000);
});
