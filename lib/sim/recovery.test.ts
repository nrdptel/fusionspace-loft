import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importOrk } from "../ork/import";
import { pickConfig, runFromDocument, runFlight, overridesFromStored } from "./run";
import { flattenRocket } from "../model/geometry";
import type { RocketComponent } from "../model/types";
import { buildSimulateInput, makeConditions } from "./setup";
import { simulate } from "./simulate";
import { recoverySizing, DESCENT_BODY_CDA_FACTOR } from "./recovery";
import { G0 } from "../units";

async function load(name: string) {
  const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), "fixtures", name)));
  return importOrk(bytes);
}

describe("recoverySizing (closed form)", () => {
  const input = { descentMass: 2, refArea: 0.01, airDensity: 1.225 };

  it("solves a Cd·A that yields the target terminal velocity", () => {
    const target = 5;
    const s = recoverySizing(input, target, 0.8);
    // Reconstruct the terminal velocity from the returned Cd·A (+ the body term) and confirm target.
    const totalCdA = s.cdA + DESCENT_BODY_CDA_FACTOR * input.refArea;
    const v = Math.sqrt((2 * input.descentMass * G0) / (input.airDensity * totalCdA));
    expect(v).toBeCloseTo(target, 6);
    expect(s.cdA).toBeGreaterThan(0);
  });

  it("a slower target needs a bigger canopy", () => {
    expect(recoverySizing(input, 4).cdA).toBeGreaterThan(recoverySizing(input, 6).cdA);
  });

  it("converts Cd·A to a diameter at the stated drag coefficient", () => {
    const s = recoverySizing(input, 5, 0.8);
    // Cd·A = Cd·π(D/2)²  ⇒  the reported diameter must reproduce the Cd·A.
    expect(0.8 * Math.PI * (s.diameter / 2) ** 2).toBeCloseTo(s.cdA, 9);
  });

  it("flags when the bare airframe already descends slowly enough", () => {
    // A feather-light, draggy airframe: body drag alone (0.5·0.06 = 0.03 m² Cd·A) already lands it
    // at ~3.3 m/s, under the 5 m/s target — no canopy needed for that.
    const s = recoverySizing({ descentMass: 0.02, refArea: 0.06, airDensity: 1.225 }, 5);
    expect(s.bareAlreadyMeets).toBe(true);
    expect(s.cdA).toBe(0);
  });

  it("degrades safely on nonsense input", () => {
    expect(recoverySizing({ descentMass: 0, refArea: 0.01, airDensity: 1.225 }, 5).cdA).toBe(0);
    expect(recoverySizing(input, 0).cdA).toBe(0);
  });
});

describe("recoverySizing round-trip against a real flight", () => {
  it("a design flown with the sized canopy lands at the target speed", async () => {
    const doc = await load("demo-single-deploy.ork");
    const config = pickConfig(doc.rocket)!;
    const run = runFromDocument(doc);
    const r = run.result;
    const refArea = Math.PI * r.stability.refRadius * r.stability.refRadius;

    const target = 4.0; // m/s
    const sizing = recoverySizing(
      { descentMass: r.burnoutMass, refArea, airDensity: r.descentAirDensity },
      target,
    );
    expect(sizing.cdA).toBeGreaterThan(0);

    // Fly the design with its canopy replaced by exactly the sized Cd·A, and confirm it lands at
    // the target — the closed form and the flight's own descent model agree.
    const { input } = buildSimulateInput(doc.rocket, config, makeConditions());
    expect(input.recovery.length).toBeGreaterThanOrEqual(1);
    input.recovery.forEach((dev, i) => {
      dev.cdA = i === 0 ? sizing.cdA : 0; // one canopy, sized; any others removed
    });
    const flown = simulate(input);
    expect(flown.summary.groundHitVelocity).toBeGreaterThan(0);
    expect(Math.abs(flown.summary.groundHitVelocity - target) / target).toBeLessThan(0.03);
  }, 20000);
});

describe("a design with no recovery device at all", () => {
  /** The Sev-1 this exists for: both neighbouring gates need a recovery device to EXIST before they
   *  can fire — `ballistic-descent` is `recoveryExpected && landed && !anyRecoveryOpened`, and
   *  `hard-landing` is `anyRecoveryOpened && …` — so a design with an empty recovery list satisfied
   *  neither and arrived at 90+ m/s with an identical warning list to the same design under a canopy.
   *  Measured on the real corpus, 4 of 35 designs carry no recovery device. */
  it("says so, where before it said nothing at all", async () => {
    const buf = readFileSync(new URL(`../../fixtures/demo-single-deploy.ork`, import.meta.url));
    const doc = await importOrk(new Uint8Array(buf));
    const sim = doc.simulations[0];
    const opts = {
      configId: sim?.conditions.configId,
      overrides: sim ? overridesFromStored(sim) : undefined,
    };

    const withChute = runFlight(doc.rocket, opts);
    // The control. Under its canopy this design lands softly and raises no descent warning of any
    // kind, so the codes asserted below cannot be arriving from something else in the flight.
    expect(withChute.result.summary.groundHitVelocity).toBeLessThan(10);
    expect(withChute.result.warnings.map((w) => w.code)).not.toContain("no-recovery");

    // Strip every recovery device, exactly as removing the parachute in the editor does.
    const stripped = structuredClone(doc.rocket);
    const strip = (parts: RocketComponent[]): RocketComponent[] =>
      parts
        .filter((c) => c.kind !== "parachute" && c.kind !== "streamer")
        .map((c) => ({ ...c, children: strip(c.children) }));
    for (const st of stripped.stages) st.components = strip(st.components);

    const bare = runFlight(stripped, opts);
    expect(
      flattenRocket(stripped).some((p) => p.component.kind === "parachute" || p.component.kind === "streamer"),
      "the fixture still carries a recovery device, so this case proves nothing",
    ).toBe(false);
    // It really does come in ballistic — an order of magnitude faster than the controlled descent.
    expect(bare.result.summary.groundHitVelocity).toBeGreaterThan(
      withChute.result.summary.groundHitVelocity * 5,
    );
    const codes = bare.result.warnings.map((w) => w.code);
    expect(codes, "a rocket with no recovery device arrived with nothing said about it").toContain(
      "no-recovery",
    );
    // And it says the arrival speed, so the warning is actionable rather than a label — the figure
    // it qualifies is the one a flyer checks a waiver against.
    const w = bare.result.warnings.find((x) => x.code === "no-recovery")!;
    expect(w.severity).toBe("warning");
    expect(w.message).toMatch(/\d+ m\/s/);
    // NOT the ballistic-descent code, which means something different: there, a device exists and
    // failed to open. Conflating the two would tell a flyer to check their ejection timing on a
    // design that has no ejection to time.
    expect(codes).not.toContain("ballistic-descent");
  });
});
