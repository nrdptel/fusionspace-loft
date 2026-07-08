import { describe, it, expect } from "vitest";
import { simulate, type ResolvedMotor, type SimulateInput, type LaunchConditions } from "./simulate";
import { Atmosphere } from "./atmosphere";
import type { MotorCurve } from "../motors/eng";
import type { Rocket, BodyTube, MassComponent, Parachute, MotorConfiguration } from "../model/types";

/** A constant-thrust, constant-mass motor: F newtons for `burn` seconds. propMass 0 keeps
 *  the mass fixed so the vacuum flight has a clean closed-form solution. */
function constMotor(F: number, burn: number, dryMass = 0.1): MotorCurve {
  return {
    designation: "TEST",
    manufacturer: "test",
    diameterMm: 29,
    lengthMm: 100,
    delaysRaw: "",
    delays: [],
    propMass: 0,
    totalMass: dryMass,
    dryMass,
    samples: [
      { t: 0, thrust: F },
      { t: burn, thrust: F },
      { t: burn + 1e-4, thrust: 0 },
    ],
    totalImpulse: F * burn,
    cumulativeImpulse: [0, F * burn, F * burn],
    burnTime: burn + 1e-4,
    maxThrust: F,
    avgThrust: F,
    motorClass: "?",
  };
}

function testRocket(payloadKg: number, chute?: Parachute): Rocket {
  const body: BodyTube = {
    id: "b",
    name: "body",
    kind: "bodytube",
    placement: { method: "after", offset: 0 },
    outerRadius: 0.02,
    thickness: 0.001,
    length: 0.5,
    material: { name: "massless", density: 0, type: "bulk" },
    children: [],
  };
  const payload: MassComponent = {
    id: "m",
    name: "payload",
    kind: "masscomponent",
    placement: { method: "top", offset: 0.1 },
    mass: payloadKg,
    length: 0.05,
    children: [],
  };
  body.children.push(payload);
  if (chute) body.children.push(chute);
  return {
    name: "test",
    stages: [{ name: "s", components: [body] }],
    configurations: [],
    referenceType: "maximum",
  };
}

const CONFIG: MotorConfiguration = { id: "c", instances: [] };

function vacuumConditions(): LaunchConditions {
  return {
    rodLength: 0.001,
    rodAngleFromVertical: 0,
    rodAzimuth: 0,
    windSpeed: 0,
    windTo: 0,
    launchAltitude: 0,
    atmosphere: new Atmosphere({ seaLevelPressurePa: 1e-3 }), // ≈ vacuum
  };
}

describe("simulate — vacuum ballistic (closed-form check)", () => {
  it("matches the analytic burnout velocity and apogee", () => {
    // 100 N for 1 s on a 1.0 kg rocket (0.9 payload + 0.1 motor), no propellant loss.
    const rocket = testRocket(0.9);
    const motor: ResolvedMotor = { curve: constMotor(100, 1.0, 0.1), cg: 0.4, ignitionTime: 0 };
    const input: SimulateInput = {
      rocket,
      config: CONFIG,
      motors: [motor],
      recovery: [],
      conditions: vacuumConditions(),
    };
    const { summary } = simulate(input);

    // a = F/m − g = 100/1 − 9.80665 = 90.19 m/s²; v_bo = a·t; apogee = ½at² + v_bo²/2g.
    const a = 100 / 1.0 - 9.80665;
    const vbo = a * 1.0;
    const apogee = 0.5 * a * 1 * 1 + (vbo * vbo) / (2 * 9.80665);
    // Burnout velocity is the clean analytic check. (maxVelocity over the whole flight is
    // the ballistic descent speed here — no recovery, no drag — which is higher.)
    expect(summary.burnoutVelocity).toBeCloseTo(vbo, 0); // within ~1 m/s
    expect(summary.maxVelocity).toBeGreaterThan(vbo * 0.98);
    expect(summary.apogee).toBeGreaterThan(apogee * 0.98);
    expect(summary.apogee).toBeLessThan(apogee * 1.02);
    expect(summary.maxMach).toBeGreaterThan(0);
  });
});

describe("simulate — monotonicity", () => {
  it("a higher-impulse motor reaches a higher apogee", () => {
    const rocket = testRocket(0.9);
    const cond = vacuumConditions();
    const low = simulate({ rocket, config: CONFIG, motors: [{ curve: constMotor(100, 1, 0.1), cg: 0.4, ignitionTime: 0 }], recovery: [], conditions: cond });
    const high = simulate({ rocket, config: CONFIG, motors: [{ curve: constMotor(200, 1, 0.1), cg: 0.4, ignitionTime: 0 }], recovery: [], conditions: cond });
    expect(high.summary.apogee).toBeGreaterThan(low.summary.apogee);
    expect(high.summary.maxVelocity).toBeGreaterThan(low.summary.maxVelocity);
  });
});

describe("simulate — recovery terminal velocity", () => {
  it("descends near the parachute's terminal velocity", () => {
    const chute: Parachute = {
      id: "p",
      name: "chute",
      kind: "parachute",
      placement: { method: "top", offset: 0.05 },
      cd: 0.8,
      diameter: 1.0,
      mass: 0,
      deployEvent: "apogee",
      deployDelay: 0,
      children: [],
    };
    const rocket = testRocket(1.0, chute);
    // Small motor: up a little, then chute descent at sea level.
    const motor: ResolvedMotor = { curve: constMotor(120, 1.0, 0.1), cg: 0.4, ignitionTime: 0 };
    const cond: LaunchConditions = {
      rodLength: 0.001,
      rodAngleFromVertical: 0,
      rodAzimuth: 0,
      windSpeed: 0,
      windTo: 0,
      launchAltitude: 0,
      atmosphere: new Atmosphere(),
    };
    const { summary, events } = simulate({ rocket, config: CONFIG, motors: [motor], recovery: [{ name: "chute", cdA: 0.8 * Math.PI * 0.25, event: "apogee", deployDelay: 0 }], conditions: cond });

    const m = 1.1; // payload + motor
    const A = Math.PI * 0.5 * 0.5;
    const vt = Math.sqrt((2 * m * 9.80665) / (1.225 * 0.8 * A));
    expect(summary.descentRate).toBeGreaterThan(vt * 0.7);
    expect(summary.descentRate).toBeLessThan(vt * 1.3);
    expect(events.some((e) => e.type === "deploy")).toBe(true);
    expect(events.some((e) => e.type === "landing")).toBe(true);
  });
});
