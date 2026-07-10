import { describe, it, expect } from "vitest";
import { buildRocketDynamics } from "./setup";
import { runFlight } from "./run";
import type {
  Rocket,
  NoseCone,
  BodyTube,
  InnerTube,
  TrapezoidFinSet,
  MotorConfiguration,
  Stage,
} from "../model/types";

// A minimal but valid stacked design: a sustainer (nose + tube + fins + motor mount) on top of a
// booster (tube + fins + motor mount). Motors are real bundled designations so they resolve.
let uid = 0;
const nextId = () => `c${uid++}`;

function mount(mountId: string): InnerTube {
  return {
    id: mountId,
    name: "mount",
    kind: "innertube",
    placement: { method: "bottom", offset: 0 },
    length: 0.2,
    outerRadius: 0.019,
    innerRadius: 0.0185,
    motorMount: { overhang: 0 },
    children: [],
  };
}

function fins(): TrapezoidFinSet {
  return {
    id: nextId(),
    name: "fins",
    kind: "trapezoidfinset",
    placement: { method: "bottom", offset: 0 },
    finCount: 3,
    rootChord: 0.1,
    tipChord: 0.05,
    height: 0.05,
    sweepLength: 0.05,
    thickness: 0.003,
    children: [],
  };
}

function nose(): NoseCone {
  return {
    id: nextId(),
    name: "nose",
    kind: "nosecone",
    placement: { method: "after", offset: 0 },
    length: 0.2,
    aftRadius: 0.025,
    shape: "ogive",
    shapeParameter: 0,
    children: [],
  };
}

function tube(len: number, mountId: string): BodyTube {
  return {
    id: nextId(),
    name: "body",
    kind: "bodytube",
    placement: { method: "after", offset: 0 },
    outerRadius: 0.025,
    thickness: 0.001,
    length: len,
    children: [mount(mountId), fins()],
  };
}

/** Two-stage rocket: stages[0] = sustainer (top), stages[1] = booster (bottom). */
function twoStage(): { rocket: Rocket; config: MotorConfiguration } {
  uid = 0;
  const sustMount = "m-sust";
  const boostMount = "m-boost";
  const sustainer: Stage = { name: "Sustainer", components: [nose(), tube(0.6, sustMount)] };
  const booster: Stage = { name: "Booster", components: [tube(0.5, boostMount)] };
  const rocket: Rocket = {
    name: "Test two-stage",
    stages: [sustainer, booster],
    configurations: [],
    referenceType: "maximum",
  };
  const config: MotorConfiguration = {
    id: "cfg",
    instances: [
      { mountId: sustMount, motor: { designation: "F50T", manufacturer: "AeroTech", type: "single-use", diameter: 0.029, length: 0.2 }, ignitionEvent: "automatic", ignitionDelay: 0 },
      { mountId: boostMount, motor: { designation: "H128W", manufacturer: "AeroTech", type: "reload", diameter: 0.038, length: 0.2 }, ignitionEvent: "automatic", ignitionDelay: 0 },
    ],
  };
  rocket.configurations = [config];
  return { rocket, config };
}

describe("serial staging plan", () => {
  it("lights the booster at launch and the sustainer at booster separation", () => {
    const { rocket, config } = twoStage();
    const bd = buildRocketDynamics(rocket, config);
    // Two phases: whole stack, then sustainer alone after separation.
    expect(bd.phases.length).toBe(2);
    expect(bd.phases[0]).toEqual({ startTime: 0, stageCount: 2 });
    expect(bd.phases[1].stageCount).toBe(1);
    const boosterBurnout = bd.phases[1].startTime;
    expect(boosterBurnout).toBeGreaterThan(0);

    // The booster fires at launch and detaches at its burnout; the sustainer air-starts then and
    // never detaches.
    const booster = bd.motors.find((m) => m.curve.designation === "H128W")!;
    const sustainer = bd.motors.find((m) => m.curve.designation === "F50T")!;
    expect(booster.ignitionTime).toBe(0);
    expect(booster.detachTime).toBeCloseTo(boosterBurnout, 3);
    expect(sustainer.ignitionTime).toBeCloseTo(boosterBurnout, 3);
    expect(sustainer.detachTime).toBe(Infinity);
  });

  it("respects an interstage coast (ignition delay) before the sustainer air-starts", () => {
    const { rocket, config } = twoStage();
    config.instances[0].ignitionDelay = 3; // sustainer lights 3 s after booster burnout
    const bd = buildRocketDynamics(rocket, config);
    const boosterBurnout = bd.motors.find((m) => m.curve.designation === "H128W")!.detachTime!;
    const sustainer = bd.motors.find((m) => m.curve.designation === "F50T")!;
    expect(sustainer.ignitionTime).toBeCloseTo(boosterBurnout + 3, 3);
  });

  it("igniting the sustainer adds altitude, and the spent booster drops away", () => {
    const { rocket } = twoStage();
    const staged = runFlight(rocket, { configId: "cfg" });
    expect(staged.hasPropulsion).toBe(true);
    expect(Number.isFinite(staged.result.summary.apogee)).toBe(true);
    expect(staged.result.summary.apogee).toBeGreaterThan(0);

    // A separation event is logged, and the vehicle mass steps down across it: the spent booster
    // (structure and empty casing) has dropped away, the core staging behaviour.
    const sep = staged.result.events.find((e) => e.type === "separation")!;
    expect(sep).toBeDefined();
    const before = staged.result.trajectory.filter((s) => s.t < sep.time).at(-1)!;
    const after = staged.result.trajectory.find((s) => s.t > sep.time)!;
    expect(after.mass).toBeLessThan(before.mass - 0.05); // booster is > 50 g of dropped mass
  });

  it("a single-stage rocket is one phase with nothing detaching", () => {
    const { rocket } = twoStage();
    const single: Rocket = { ...rocket, stages: rocket.stages.slice(0, 1) };
    const bd = buildRocketDynamics(single, rocket.configurations[0]);
    expect(bd.phases).toEqual([{ startTime: 0, stageCount: 1 }]);
    for (const m of bd.motors) expect(m.detachTime).toBe(Infinity);
  });
});
