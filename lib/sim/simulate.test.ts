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

describe("simulate — liftoff thrust-to-weight", () => {
  // Sea-level launch off a 1 m rail, so the ratio (not just rail length) governs departure.
  const railConditions = (): LaunchConditions => ({
    rodLength: 1.0,
    rodAngleFromVertical: 0,
    rodAzimuth: 0,
    windSpeed: 0,
    windTo: 0,
    launchAltitude: 0,
    atmosphere: new Atmosphere(),
  });
  const fly = (payloadKg: number, thrustN: number) =>
    simulate({
      rocket: testRocket(payloadKg),
      config: CONFIG,
      motors: [{ curve: constMotor(thrustN, 2.0, 0.1), cg: 0.4, ignitionTime: 0 }],
      recovery: [],
      conditions: railConditions(),
    });

  it("reports the ratio and stays quiet for a healthy T/W (≫ 5:1)", () => {
    const { summary, warnings } = fly(0.9, 100); // 1.0 kg loaded, weight ~9.8 N → T/W ~10
    expect(summary.thrustToWeight).toBeGreaterThan(9);
    expect(summary.thrustToWeight).toBeLessThan(11);
    expect(warnings.some((w) => w.code === "no-liftoff")).toBe(false);
    expect(warnings.some((w) => w.code === "low-thrust-to-weight")).toBe(false);
  });

  it("warns that an under-powered rocket cannot leave the pad (T/W < 1)", () => {
    const { summary, warnings } = fly(5.0, 30); // ~5.1 kg loaded, weight ~50 N → T/W ~0.6
    expect(summary.thrustToWeight).toBeLessThan(1);
    expect(summary.apogee).toBeLessThan(1); // never climbs
    const w = warnings.find((x) => x.code === "no-liftoff");
    expect(w?.severity).toBe("warning");
    // The misleading "hit the time cap before landing" note is suppressed when it never flew.
    expect(warnings.some((x) => x.code === "no-landing")).toBe(false);
  });

  it("cautions on a marginal T/W below the 5:1 rule of thumb", () => {
    const { summary, warnings } = fly(1.0, 30); // ~1.1 kg loaded, weight ~10.8 N → T/W ~2.8
    expect(summary.thrustToWeight).toBeGreaterThan(1);
    expect(summary.thrustToWeight).toBeLessThan(5);
    const w = warnings.find((x) => x.code === "low-thrust-to-weight");
    expect(w?.severity).toBe("caution");
    expect(warnings.some((x) => x.code === "no-liftoff")).toBe(false);
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

describe("simulate — peak acceleration is an ascent quantity", () => {
  // Regression for a real-file finding: OpenRocket's "A simple model rocket" C6 "too short delay"
  // config deploys its chute well before apogee at ~90 m/s. Loft used to fold that opening-shock
  // deceleration into the reported max acceleration (473 m/s² vs OpenRocket's 191), because the
  // instantaneous drag jump of an opening canopy registers a huge finite-difference spike. Max
  // acceleration is the ascent (boost) g-load; the opening shock is a recovery load reported via
  // the deployment velocity instead.
  const motor: ResolvedMotor = { curve: constMotor(120, 1.0, 0.1), cg: 0.4, ignitionTime: 0 };
  const bigCdA = 0.8 * Math.PI * 0.25; // a full-size canopy: a violent opening shock at speed

  function flyWith(event: "apogee" | "launch", deployDelay: number) {
    return simulate({
      rocket: testRocket(1.0),
      config: CONFIG,
      motors: [motor],
      recovery: [{ name: "chute", cdA: bigCdA, event, deployDelay }],
      conditions: {
        rodLength: 0.001,
        rodAngleFromVertical: 0,
        rodAzimuth: 0,
        windSpeed: 0,
        windTo: 0,
        launchAltitude: 0,
        atmosphere: new Atmosphere(),
      },
    });
  }

  it("ignores an opening shock from a high-speed early deployment", () => {
    const normal = flyWith("apogee", 0); // opens at apogee, near-stationary — a gentle shock
    const early = flyWith("launch", 1.2); // opens 0.2 s after burnout, still climbing fast

    // The early flight really does open at speed — otherwise the test proves nothing.
    expect(early.summary.deploymentVelocity).toBeGreaterThan(30);
    expect(early.events.some((e) => e.type === "deploy")).toBe(true);

    // The boost is identical up to the early deploy, so both flights share the same peak g-load;
    // the high-speed opening shock must NOT inflate the early flight's reported max acceleration.
    expect(early.summary.maxAcceleration).toBeCloseTo(normal.summary.maxAcceleration, 1);
    // And it stays near the ~100 m/s² boost peak, nowhere near the hundreds-of-m/s² opening shock.
    expect(early.summary.maxAcceleration).toBeLessThan(150);
  });

  it("resolves a sharp thrust peak analytically, not smoothed by the step", () => {
    // A triangular thrust pulse peaking at t = 0.1 s, flown in vacuum (no drag) with a fixed mass,
    // so the peak acceleration has a closed form: a = Ppeak/m − g. A finite difference of sampled
    // speed averages the acceleration across the step and reads the peak low (~307 m/s² here);
    // evaluating the net force at the step lands on the true peak (~323 m/s²). This is what makes a
    // punchy HPR motor's max-g read right instead of ~20% low.
    const Ppeak = 200;
    const spike: MotorCurve = {
      designation: "SPIKE",
      manufacturer: "test",
      diameterMm: 29,
      lengthMm: 100,
      delaysRaw: "",
      delays: [],
      propMass: 0,
      totalMass: 0.1,
      dryMass: 0.1,
      samples: [
        { t: 0, thrust: 0 },
        { t: 0.1, thrust: Ppeak },
        { t: 0.2, thrust: 0 },
      ],
      totalImpulse: 0.5 * Ppeak * 0.2,
      cumulativeImpulse: [0, 0.5 * Ppeak * 0.1, 0.5 * Ppeak * 0.2],
      burnTime: 0.2,
      maxThrust: Ppeak,
      avgThrust: (0.5 * Ppeak * 0.2) / 0.2,
      motorClass: "?",
    };
    const mass = 0.6; // 0.5 kg payload + 0.1 kg motor, constant (propMass 0)
    const { summary } = simulate({
      rocket: testRocket(0.5),
      config: CONFIG,
      motors: [{ curve: spike, cg: 0.4, ignitionTime: 0 }],
      recovery: [],
      conditions: vacuumConditions(),
    });
    const analyticPeak = Ppeak / mass - 9.80665; // ≈ 323.5 m/s²
    // Lands on the analytic peak (within ~1.5%), clear of the ~307 m/s² a difference quotient gives.
    expect(summary.maxAcceleration).toBeGreaterThan(318);
    expect(summary.maxAcceleration).toBeLessThan(analyticPeak * 1.02);
  });
});

describe("simulate — a bare mould-line step is said out loud", () => {
  /** The same rocket twice: once with its two tubes faired, once with the aft tube oversized so the
   *  airframe steps out at the joint. Everything else is held identical, so the caution is the only
   *  thing that can differ. */
  function twoTube(aftRadius: number): Rocket {
    const fore: BodyTube = {
      id: "f",
      name: "fore",
      kind: "bodytube",
      placement: { method: "after", offset: 0 },
      outerRadius: 0.02,
      thickness: 0.001,
      length: 0.4,
      material: { name: "massless", density: 0, type: "bulk" },
      children: [],
    };
    const payload: MassComponent = {
      id: "m",
      name: "payload",
      kind: "masscomponent",
      placement: { method: "top", offset: 0.1 },
      mass: 0.9,
      length: 0.05,
      children: [],
    };
    fore.children.push(payload);
    const aft: BodyTube = { ...fore, id: "a", name: "aft", outerRadius: aftRadius, children: [] };
    return {
      name: "test",
      stages: [{ name: "s", components: [fore, aft] }],
      configurations: [],
      referenceType: "maximum",
    };
  }

  const fly = (rocket: Rocket) =>
    simulate({
      rocket,
      config: CONFIG,
      motors: [{ curve: constMotor(100, 1.0, 0.1), cg: 0.4, ignitionTime: 0 }],
      recovery: [],
      conditions: vacuumConditions(),
    });

  it("cautions when the airframe steps, and names the step", () => {
    const w = fly(twoTube(0.03)).warnings.find((x) => x.code === "mould-line-step");
    expect(w).toBeDefined();
    // The number in the sentence is the step the geometry actually has: 20 mm of DIAMETER, not the
    // 10 mm of radius. A caveat that misstates its own measurement teaches a flyer to discount it.
    expect(w!.message).toContain("20 mm");
    expect(w!.message).toContain("out");
    // A caution, not a warning: one joint's pressure drag on an otherwise complete build-up, as
    // against the blunt-nose case where the whole forebody term is missing.
    expect(w!.severity).toBe("caution");
  });

  it("says nothing when the joint fairs", () => {
    expect(fly(twoTube(0.02)).warnings.some((x) => x.code === "mould-line-step")).toBe(false);
  });

  it("does not claim a drag number it cannot stand behind", () => {
    // Eq. 3.86's 0.8 is a measured flat-face value in clean flow; an annular step sits inside the
    // boundary layer of the body ahead of it. Charging it as a flat face took `02.Two-stage.ork`
    // from agreeing to 35.2% low, so Loft reports the geometry and withholds the estimate. If a
    // sourced coefficient ever arrives this assertion is what says the message has to change too.
    const w = fly(twoTube(0.03)).warnings.find((x) => x.code === "mould-line-step");
    expect(w!.message).not.toMatch(/\d\s*%/);
    expect(w!.message).toContain("cannot state");
  });
});

describe("simulate — a canopy open before apogee cannot make the integrator diverge", () => {
  /** The step bound that keeps an open parachute's stiff quadratic drag inside RK4's stability
   *  region used to be reachable only once the flight had passed apogee (`phase === "descent"`).
   *  A canopy that opened at or before apogee was therefore integrated at the flat 0.01 s boost
   *  step with no bound at all, and it diverged. Two of the 35 corpus designs did:
   *  `FullScaleModelTH.rkt` ejects 0.5 s before apogee at 250 m/s and returned an apogee of
   *  2.07e13 m at a recovery size of 5x (3.30e2 m at 4x), and `Complex.Two-Stage.CDX1` — whose
   *  drogue opens exactly AT apogee, so one unbounded step is enough — returned a ground-hit speed
   *  of 7.52e32 m/s and a landing energy of 4.00e65 J under a confident "hard landing" warning.
   *  Both inputs are inside the recovery-size field's own advertised 0.1-10x range.
   *
   *  Driven here as a big canopy opening 0.2 s after launch, under full thrust — the reachable
   *  shape of the same geometry, and it needs no corpus to run. */
  const CHUTE = { name: "main", cdA: 1.5 * Math.PI * 0.6 * 0.6, event: "launch" as const, deployDelay: 0.35 };

  // `recoveryCdScale` is a RunOptions field that `run.ts` applies by scaling `cdA` before the
  // solver ever sees it, so the scale is applied here the same way rather than passed to
  // `simulate`, which has no such field and would silently ignore it.
  const flyWithCanopy = (scale = 1) =>
    simulate({
      rocket: testRocket(0.9),
      config: CONFIG,
      motors: [{ curve: constMotor(1000, 1.0, 0.1), cg: 0.4, ignitionTime: 0 }],
      recovery: [{ ...CHUTE, cdA: CHUTE.cdA * scale }],
      conditions: { ...vacuumConditions(), atmosphere: new Atmosphere() },
    });

  it("returns a physical flight with a large canopy opening at speed", () => {
    const { summary } = flyWithCanopy();
    // Finiteness and physical scale, not a specific number: the bug produced 1e13 m and 1e32 m/s
    // from a flight whose real apogee is tens of metres.
    expect(Number.isFinite(summary.apogee)).toBe(true);
    expect(summary.apogee).toBeGreaterThan(0);
    expect(summary.apogee).toBeLessThan(100_000);
    expect(Number.isFinite(summary.maxVelocity)).toBe(true);
    expect(summary.maxVelocity).toBeLessThan(10_000);
    expect(Number.isFinite(summary.groundHitVelocity)).toBe(true);
    expect(summary.groundHitVelocity).toBeLessThan(10_000);
  });

  it("stays physical across the whole recovery-size range the field offers", () => {
    // 0.1x to 10x is the range `Recovery size (x)` accepts, and that the input is LEGAL is exactly
    // what made this a Sev-1 rather than an edge case.
    for (const scale of [0.1, 0.5, 1, 2, 4, 5, 7, 10]) {
      const { summary } = flyWithCanopy(scale);
      expect(Number.isFinite(summary.apogee), `apogee at ${scale}x`).toBe(true);
      expect(summary.apogee, `apogee at ${scale}x`).toBeLessThan(100_000);
      expect(Number.isFinite(summary.groundHitVelocity), `ground-hit speed at ${scale}x`).toBe(true);
      expect(summary.groundHitVelocity, `ground-hit speed at ${scale}x`).toBeLessThan(10_000);
      expect(Number.isFinite(summary.landingEnergy), `landing energy at ${scale}x`).toBe(true);
    }
  });

  it("gets slower on the ground the bigger the canopy, instead of jumping orders of magnitude", () => {
    // The physical direction, which a diverged flight cannot satisfy: more drag area lands softer.
    const speeds = [1, 2, 4].map((k) => flyWithCanopy(k)).map((r) => r.summary.groundHitVelocity);
    expect(speeds.every((v) => Number.isFinite(v) && v > 0)).toBe(true);
    expect(speeds[1]).toBeLessThan(speeds[0]);
    expect(speeds[2]).toBeLessThan(speeds[1]);
  });

  it("carries whether it landed, so a surface can withhold the figures that need one", () => {
    // groundHitVelocity and landingEnergy are 0 when the flight never reaches the ground — a
    // sentinel, not a measurement. `landed` is what lets a surface tell that from a soft landing.
    const { summary } = flyWithCanopy();
    expect(typeof summary.landed).toBe("boolean");
    expect(summary.landed).toBe(true);
    expect(summary.groundHitVelocity).toBeGreaterThan(0);
  });
});
