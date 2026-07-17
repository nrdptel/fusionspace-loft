import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importOrk } from "../ork/import";
import { configChoices, noseBallastStation } from "../sim/run";
import { buildRocketpySpec, NOSE_KIND } from "./rocketpy-spec";

async function load(name: string) {
  const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), "fixtures", name)));
  return importOrk(bytes);
}

/** Build the RocketPy spec for a design's first (default) stored configuration. */
async function specFor(name: string) {
  const doc = await load(name);
  const choice = configChoices(doc)[0];
  const sim = doc.simulations[choice.simIndex];
  const config = doc.rocket.configurations.find((c) => c.id === sim.conditions.configId)!;
  return { doc, spec: buildRocketpySpec(doc, config, choice.simIndex) };
}

describe("buildRocketpySpec", () => {
  it("carries the resolved motor as a thrust curve RocketPy can fly", async () => {
    const { spec } = await specFor("demo-single-deploy.ork");
    expect(spec.motorDesignation).toBe("H128W");
    expect(spec.motor).not.toBeNull();
    const m = spec.motor!;
    expect(m.thrust.length).toBeGreaterThan(1);
    expect(m.burnTime).toBeGreaterThan(0);
    expect(m.propMass).toBeGreaterThan(0);
    expect(m.diameter).toBeGreaterThan(0);
    // Thrust samples are [t, N] pairs in ascending time, starting at t=0.
    expect(m.thrust[0][0]).toBe(0);
    expect(m.thrust.every(([t, f]) => Number.isFinite(t) && Number.isFinite(f))).toBe(true);
  });

  it("emits a sea-level Cd(Mach) table of 61 finite samples from Mach 0 to 3", async () => {
    const { spec } = await specFor("demo-single-deploy.ork");
    const cd = spec.rocket.cdPowerOff;
    expect(cd.length).toBe(61); // 0 … 3.0 in 0.05 steps, inclusive
    expect(cd[0][0]).toBe(0);
    expect(cd[cd.length - 1][0]).toBeCloseTo(3.0, 3);
    expect(cd.every(([mach, c]) => Number.isFinite(mach) && Number.isFinite(c) && c > 0)).toBe(true);
    // Power-on and power-off tables are both present (Loft feeds the same curve to each).
    expect(spec.rocket.cdPowerOn.length).toBe(61);
  });

  it("maps the nose shape to a RocketPy kind and a finite centre of pressure", async () => {
    const { spec } = await specFor("demo-single-deploy.ork");
    expect(spec.rocket.nose).not.toBeNull();
    expect(Object.values(NOSE_KIND)).toContain(spec.rocket.nose!.kind);
    expect(spec.rocket.nose!.baseRadius).toBeGreaterThan(0);
    expect(Number.isFinite(spec.rocket.cp)).toBe(true);
    expect(spec.rocket.cp).toBeGreaterThan(0);
  });

  it("emits a trapezoidal fin set with sane geometry", async () => {
    const { spec } = await specFor("demo-single-deploy.ork");
    expect(spec.rocket.fins.length).toBeGreaterThan(0);
    const fin = spec.rocket.fins[0];
    expect(fin.kind).toBe("trapezoidal");
    expect(fin.n).toBeGreaterThanOrEqual(3);
    expect(fin.rootChord).toBeGreaterThan(0);
    expect(fin.span).toBeGreaterThan(0);
    expect(fin.radius).toBeGreaterThan(0);
  });

  it("mirrors the design's mass, inertia, and launch conditions", async () => {
    const { spec } = await specFor("demo-single-deploy.ork");
    expect(spec.rocket.mass).toBeGreaterThan(0);
    expect(spec.rocket.inertia).toHaveLength(3);
    expect(spec.rocket.inertia.every((i) => Number.isFinite(i) && i > 0)).toBe(true);
    const e = spec.environment;
    expect(e.railLength).toBeGreaterThan(0);
    expect(e.inclinationDeg).toBeGreaterThan(0);
    expect(e.inclinationDeg).toBeLessThanOrEqual(90);
    expect(Number.isFinite(e.temperatureK)).toBe(true);
    expect(e.windMps).toBe(0); // the cross-check is a zero-wind ascent-physics diff
  });

  it("folds nose ballast into the dry mass — heavier, CG forward, more inertia", async () => {
    const doc = await load("demo-single-deploy.ork");
    const choice = configChoices(doc)[0];
    const sim = doc.simulations[choice.simIndex];
    const config = doc.rocket.configurations.find((c) => c.id === sim.conditions.configId)!;

    const base = buildRocketpySpec(doc, config, choice.simIndex);
    const ballast = 0.25; // +250 g at the nose
    const withBallast = buildRocketpySpec(doc, config, choice.simIndex, [
      { mass: ballast, cg: noseBallastStation(doc.rocket), ownInertia: 0, source: "Nose ballast" },
    ]);

    // Heavier by exactly the ballast; CG moves forward (toward the nose, smaller station); the extra
    // mass off-axis raises the pitch inertia. The motor and aero surfaces are untouched.
    expect(withBallast.rocket.mass).toBeCloseTo(base.rocket.mass + ballast, 6);
    expect(withBallast.rocket.cgNoMotor).toBeLessThan(base.rocket.cgNoMotor);
    expect(withBallast.rocket.inertia[0]).toBeGreaterThan(base.rocket.inertia[0]);
    expect(withBallast.motor?.designation).toBe(base.motor?.designation);
    expect(withBallast.rocket.cp).toBeCloseTo(base.rocket.cp, 6);
  });

  it("handles a boattail + elliptical-fin design: a tail and an elliptical fin appear", async () => {
    const { spec } = await specFor("demo-boattail.ork");
    // The contracting transition becomes a RocketPy tail (top radius > bottom radius).
    expect(spec.rocket.tails.length).toBeGreaterThan(0);
    const tail = spec.rocket.tails[0];
    expect(tail.topRadius).toBeGreaterThan(tail.bottomRadius);
    expect(tail.length).toBeGreaterThan(0);
    // Its elliptical fins map to RocketPy's elliptical kind.
    expect(spec.rocket.fins.some((f) => f.kind === "elliptical")).toBe(true);
  });
});
