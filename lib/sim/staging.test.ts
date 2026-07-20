import { describe, it, expect } from "vitest";
import { buildRocketDynamics } from "./setup";
import { runFlight } from "./run";
import { flattenRocket } from "../model/geometry";
import type {
  Rocket,
  NoseCone,
  BodyTube,
  InnerTube,
  TrapezoidFinSet,
  Parachute,
  MotorConfiguration,
  SeparationEvent,
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

/** Single stage with two motor mounts: a main motor and a second that airstarts after a delay. */
function airstart(delay: number): { rocket: Rocket; config: MotorConfiguration } {
  uid = 0;
  const mainMount = "m-main";
  const airMount = "m-air";
  const body: BodyTube = {
    id: nextId(),
    name: "body",
    kind: "bodytube",
    placement: { method: "after", offset: 0 },
    outerRadius: 0.025,
    thickness: 0.001,
    length: 0.6,
    children: [mount(mainMount), mount(airMount), fins()],
  };
  const rocket: Rocket = {
    name: "Airstart test",
    stages: [{ name: "Stage", components: [nose(), body] }],
    configurations: [],
    referenceType: "maximum",
  };
  const config: MotorConfiguration = {
    id: "cfg",
    instances: [
      { mountId: mainMount, motor: { designation: "H128W", manufacturer: "AeroTech", type: "reload", diameter: 0.038, length: 0.2 }, ignitionEvent: "automatic", ignitionDelay: 0 },
      { mountId: airMount, motor: { designation: "F50T", manufacturer: "AeroTech", type: "single-use", diameter: 0.029, length: 0.2 }, ignitionEvent: "automatic", ignitionDelay: delay },
    ],
  };
  rocket.configurations = [config];
  return { rocket, config };
}

describe("within-stage airstart", () => {
  it("ignites a second motor at its own delay while the first lights at launch", () => {
    const { rocket, config } = airstart(2);
    const bd = buildRocketDynamics(rocket, config);
    const main = bd.motors.find((m) => m.curve.designation === "H128W")!;
    const air = bd.motors.find((m) => m.curve.designation === "F50T")!;
    expect(main.ignitionTime).toBe(0);
    expect(air.ignitionTime).toBeCloseTo(2, 6);
    // Single stage: neither motor's stage detaches.
    expect(main.detachTime).toBe(Infinity);
    expect(air.detachTime).toBe(Infinity);
  });

  it("lights both at launch when the second has no delay (unchanged behaviour)", () => {
    const { rocket, config } = airstart(0);
    const bd = buildRocketDynamics(rocket, config);
    for (const m of bd.motors) expect(m.ignitionTime).toBe(0);
  });

  it("actually changes the flight — the airstart timing is modelled, not ignored", () => {
    const together = runFlight(airstart(0).rocket, { configId: "cfg" }).result.summary.apogee;
    const delayed = runFlight(airstart(5).rocket, { configId: "cfg" }).result.summary.apogee;
    expect(together).toBeGreaterThan(0);
    expect(delayed).toBeGreaterThan(0);
    expect(Math.abs(delayed - together)).toBeGreaterThan(1); // not invariant to the delay
  });
});

describe("multi-stage stability", () => {
  it("stacks the booster below the sustainer rather than overlapping it at the nose", () => {
    const { rocket } = twoStage();
    const tubes = flattenRocket(rocket).filter((p) => p.component.kind === "bodytube");
    expect(tubes.length).toBe(2);
    const [sust, boost] = tubes;
    // The booster body begins at the aft end of the sustainer body — not back at x=0. (The bug
    // this guards against put every stage at 0, piling the whole stack onto the nose.)
    expect(boost.xFore).toBeGreaterThanOrEqual(sust.xFore + sust.length - 1e-6);
  });

  it("flags an upper stage that is stable on the pad but unstable once it flies alone", () => {
    const { rocket } = twoStage();
    // Strip the sustainer's fins and give the booster large ones: the big aft fins keep the whole
    // stack stable off the pad, but the sustainer alone — nose + tube + a motor at the tail, no
    // fins — is unstable after it separates. A hazard the liftoff margin can't see.
    const sustTube = rocket.stages[0].components[1] as BodyTube;
    sustTube.children = sustTube.children.filter((c) => c.kind !== "trapezoidfinset");
    const boostFins = rocket.stages[1].components[0].children.find(
      (c) => c.kind === "trapezoidfinset",
    ) as TrapezoidFinSet;
    boostFins.finCount = 4;
    boostFins.rootChord = 0.2;
    boostFins.tipChord = 0.1;
    boostFins.height = 0.14;

    const run = runFlight(rocket, { configId: "cfg" });
    expect(run.result.staticMarginCal).toBeGreaterThan(1); // stable on the pad
    expect(run.result.upperStageMarginCal!).toBeLessThan(1); // not once it flies alone
    expect(run.result.warnings.some((w) => w.code === "upper-stage-stability")).toBe(true);
    expect(run.result.warnings.some((w) => w.code === "low-stability")).toBe(false);
  });

  it("keys the upper-stage warning to the sustainer's own margin, not the liftoff margin", () => {
    // The contract: the warning fires exactly when the post-separation margin is below 1 cal,
    // independent of how stable the loaded stack was on the pad.
    const { rocket } = twoStage();
    const run = runFlight(rocket, { configId: "cfg" });
    const warned = run.result.warnings.some((w) => w.code === "upper-stage-stability");
    expect(warned).toBe((run.result.upperStageMarginCal ?? Infinity) < 1);
  });

  it("reports no upper-stage margin for a single-stage flight", () => {
    const { rocket } = twoStage();
    const single: Rocket = { ...rocket, stages: rocket.stages.slice(0, 1) };
    single.configurations = rocket.configurations;
    const run = runFlight(single, { configId: "cfg" });
    expect(run.result.upperStageMarginCal).toBeUndefined();
  });
});

/** A payload/dual-section rocket: a motorised booster (bottom) carries a motorless payload (top).
 *  The booster separates at its own ejection charge, and the payload's parachute deploys on that
 *  lower-stage separation — the common single-motor "separate and recover near apogee" pattern
 *  (OpenRocket's own ARC-payload and deployable-payload examples are built this way). */
function payload(sepEvent: Stage["separationEvent"], ejectionDelay: number): { rocket: Rocket; config: MotorConfiguration } {
  uid = 0;
  const boostMount = "m-boost";
  const chute: Parachute = {
    id: nextId(),
    name: "Payload chute",
    kind: "parachute",
    placement: { method: "top", offset: 0 },
    cd: 0.8,
    diameter: 0.6,
    mass: 0.03,
    deployEvent: "lowerstage-separation",
    deployDelay: 0,
    children: [],
  };
  const payloadTube: BodyTube = {
    id: nextId(),
    name: "payload body",
    kind: "bodytube",
    placement: { method: "after", offset: 0 },
    outerRadius: 0.025,
    thickness: 0.001,
    length: 0.4,
    children: [chute],
  };
  const rocket: Rocket = {
    name: "Payload test",
    stages: [
      { name: "Payload", components: [nose(), payloadTube] },
      { name: "Booster", components: [tube(0.5, boostMount)], separationEvent: sepEvent, separationDelay: 0 },
    ],
    configurations: [],
    referenceType: "maximum",
  };
  const config: MotorConfiguration = {
    id: "cfg",
    instances: [
      {
        mountId: boostMount,
        motor: { designation: "H128W", manufacturer: "AeroTech", type: "reload", diameter: 0.038, length: 0.2, delay: ejectionDelay },
        ignitionEvent: "automatic",
        ignitionDelay: 0,
      },
    ],
  };
  rocket.configurations = [config];
  return { rocket, config };
}

describe("stage separation event + recovery on lower-stage separation", () => {
  it("separates at the booster's ejection charge, not at burnout, when the event is ejection", () => {
    const { rocket, config } = payload("ejection", 6); // 6 s ejection delay ⇒ separation well after burnout
    const bd = buildRocketDynamics(rocket, config);
    const booster = bd.motors.find((m) => m.curve.designation === "H128W")!;
    const burnout = booster.ignitionTime + booster.curve.burnTime;
    // The booster hangs on until its ejection charge (burnout + 6 s), not dropping at burnout.
    expect(booster.detachTime).toBeCloseTo(burnout + 6, 3);
    expect(bd.phases.at(-1)!.startTime).toBeCloseTo(burnout + 6, 3);
  });

  it("deploys the payload chute on separation and comes in under canopy (not ballistic)", () => {
    const run = runFlight(payload("ejection", 6).rocket, { configId: "cfg" });
    const sep = run.result.events.find((e) => e.type === "separation")!;
    const deploy = run.result.events.find((e) => e.type === "deploy")!;
    expect(sep).toBeDefined();
    expect(deploy).toBeDefined();
    // The chute opens at the separation instant, not never.
    expect(deploy.time).toBeCloseTo(sep.time, 1);
    // A real canopy descent, and specifically NOT the ballistic case the old model produced.
    expect(run.result.summary.descentRate).toBeLessThan(15);
    expect(run.result.warnings.some((w) => w.code === "ballistic-descent")).toBe(false);
  });

  it("the separation event controls the timing — a burnout separation parts (and deploys) far earlier", () => {
    const ejection = runFlight(payload("ejection", 6).rocket, { configId: "cfg" }).result.events.find((e) => e.type === "separation")!;
    // Same airframe, separating at burnout instead: the split happens much sooner.
    const burnout = runFlight(payload("burnout", 6).rocket, { configId: "cfg" }).result.events.find((e) => e.type === "separation")!;
    expect(ejection.time - burnout.time).toBeGreaterThan(4); // the 6 s ejection delay, less the burn already elapsed
  });

  it("keeps the stage attached for a 'never' separation event", () => {
    const { rocket, config } = payload("never", 6);
    const bd = buildRocketDynamics(rocket, config);
    expect(bd.phases.length).toBe(1); // nothing ever detaches
    for (const m of bd.motors) expect(m.detachTime).toBe(Infinity);
  });

  // OpenRocket lets a stage separate on a different event per motor configuration — the classic
  // case is a two-stage rocket that separates at the booster's ejection charge on one motor set
  // and at upper-stage ignition on another. Missing the per-config lookup carried the spent
  // booster to apogee on such a config (a real ~22% apogee error on a corpus two-stage design).
  it("applies a per-config separation override over the stage's default event", () => {
    const { rocket, config } = payload("ejection", 6);
    const booster = () => buildRocketDynamics(rocket, config).motors.find((m) => m.curve.designation === "H128W")!;
    const burnout = booster().ignitionTime + booster().curve.burnTime;
    // Default (no override): separates at its ejection charge, burnout + 6 s.
    expect(booster().detachTime).toBeCloseTo(burnout + 6, 3);
    // This config overrides to burnout — the override wins over the default "ejection".
    rocket.stages[1].separationConfigs = { cfg: { event: "burnout" } };
    expect(booster().detachTime).toBeCloseTo(burnout, 3);
    // An override keyed to a *different* config doesn't apply to this flight.
    rocket.stages[1].separationConfigs = { "other-cfg": { event: "burnout" } };
    expect(booster().detachTime).toBeCloseTo(burnout + 6, 3);
  });

  it("the per-config override moves when the booster drops — and changes the flight", () => {
    const fly = (override?: SeparationEvent) => {
      const { rocket, config } = twoStage();
      // Booster set to part at its own ejection charge, 8 s after burnout — so without an override
      // it rides on well past staging.
      config.instances[1].motor.delay = 8;
      rocket.stages[1].separationEvent = "ejection";
      if (override) rocket.stages[1].separationConfigs = { cfg: { event: override } };
      const run = runFlight(rocket, { configId: "cfg" });
      return { sep: run.result.events.find((e) => e.type === "separation")!, apogee: run.result.summary.apogee };
    };
    const carried = fly();                 // "ejection": booster held to burnout + 8 s
    const dropped = fly("upperignition");  // override: drops at staging (booster burnout)
    // The crux of the bug: the override changes *when* the booster separates. Dropping the
    // per-config lookup left both configs on the default "ejection" timing.
    expect(dropped.sep.time).toBeLessThan(carried.sep.time - 4);
    // And that changes the flight (the timing is modelled, not cosmetic).
    expect(Math.abs(dropped.apogee - carried.apogee)).toBeGreaterThan(15);
  });

  it("doesn't flag the finless payload as an unstable upper stage — it recovers at separation", () => {
    const run = runFlight(payload("ejection", 6).rocket, { configId: "cfg" });
    // The payload pops its chute ON the lower-stage separation, so it's under canopy from that
    // instant and never flies ballistically — no upper-stage-stability warning, and no upper-stage
    // margin is reported for a section that isn't flown ballistically.
    expect(run.result.upperStageMarginCal).toBeUndefined();
    expect(run.result.warnings.some((w) => w.code === "upper-stage-stability")).toBe(false);
  });
});
