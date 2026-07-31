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

/** Three-stage stack: stages[0] = sustainer (top), [1] = Booster 1, [2] = Booster 2 (bottom). Needed
 *  for the one shape a two-stage rocket cannot express — a dead stage sitting UNDER a live one, which
 *  is shed by that stage's separation rather than carried. */
function threeStage(): { rocket: Rocket; config: MotorConfiguration } {
  uid = 0;
  const sustainer: Stage = { name: "Sustainer", components: [nose(), tube(0.6, "m-sust")] };
  const b1: Stage = { name: "Booster 1", components: [tube(0.5, "m-boost1")] };
  const b2: Stage = { name: "Booster 2", components: [tube(0.5, "m-boost2")] };
  const rocket: Rocket = {
    name: "Test three-stage",
    stages: [sustainer, b1, b2],
    configurations: [],
    referenceType: "maximum",
  };
  const motor = (designation: string) => ({
    designation,
    manufacturer: "AeroTech",
    type: "reload" as const,
    diameter: 0.038,
    length: 0.2,
  });
  const config: MotorConfiguration = {
    id: "cfg",
    instances: [
      { mountId: "m-sust", motor: motor("H128W"), ignitionEvent: "automatic", ignitionDelay: 0 },
      { mountId: "m-boost1", motor: motor("H128W"), ignitionEvent: "automatic", ignitionDelay: 0 },
      { mountId: "m-boost2", motor: motor("H128W"), ignitionEvent: "automatic", ignitionDelay: 0 },
    ],
  };
  rocket.configurations = [config];
  return { rocket, config };
}

describe("a stage that can never fire", () => {
  // The state this exists for: a flyer authors a booster, then deletes the motor mount inside it.
  // The add-time gate (`canAddStage`) refuses seeding a booster with no mount to clone, but nothing
  // re-checks after a removal — so the stage is carried while contributing no thrust, and until this
  // warning nothing on the flight said so. Measured on the starter: 638.973 m against the design's
  // own 993.642 m, and the only other warning an unrelated static-margin caution.
  //
  // The three "never lights" cases below are each a separate route to the same flight, and an
  // earlier version of this predicate — which counted motor INSTANCES per stage — missed two of
  // them outright. They are asserted separately for that reason.
  const dead = (rocket: Rocket, config: MotorConfiguration) => buildRocketDynamics(rocket, config).deadStages;

  it("names a lower stage that no motor reaches at all", () => {
    const { rocket, config } = twoStage();
    config.instances = config.instances.filter((i) => i.mountId !== "m-boost");
    expect(dead(rocket, config)).toEqual([{ name: "Booster", shed: false }]);
  });

  it("names a lower stage whose motor has a trigger that never arrives", () => {
    // `never` is a native OpenRocket ignition event the importer already reads. The instance is
    // present and resolves — only the trigger is missing — so an instance count cannot see this.
    const { rocket, config } = twoStage();
    config.instances.find((i) => i.mountId === "m-boost")!.ignitionEvent = "never";
    expect(dead(rocket, config)).toEqual([{ name: "Booster", shed: false }]);
  });

  it("names a lower stage whose motor resolves to no thrust curve", () => {
    const { rocket, config } = twoStage();
    config.instances.find((i) => i.mountId === "m-boost")!.motor.designation = "ZZ9999-NOSUCH";
    expect(dead(rocket, config)).toEqual([{ name: "Booster", shed: false }]);
  });

  it("says nothing about a properly staged design", () => {
    const { rocket, config } = twoStage();
    expect(dead(rocket, config)).toEqual([]);
  });

  // The false positive that would have made this warning useless: an unpowered TOP stage is a dart,
  // which is a legitimate and common design — 3 of the 35 real corpus designs are exactly that
  // (`APEX_K_Dart.ork`, `ARC payload rocket.ork`, `Deployable payload.ork`). Only a stage BELOW the
  // top that cannot burn is at issue.
  it("says nothing about a dart — an unpowered TOP stage is a design, not a fault", () => {
    const { rocket, config } = twoStage();
    config.instances = config.instances.filter((i) => i.mountId !== "m-sust");
    expect(dead(rocket, config)).toEqual([]);
  });

  it("defers to `no-motor` when the configuration flies nothing at all", () => {
    const { rocket, config } = twoStage();
    config.instances = [];
    expect(dead(rocket, config)).toEqual([]);
  });

  it("says nothing about a single-stage design", () => {
    const { rocket, config } = twoStage();
    const single: Rocket = { ...rocket, stages: [rocket.stages[0]] };
    expect(dead(single, config)).toEqual([]);
  });

  // The claim that would have been a lie. A serial stack parts at ONE joint and takes everything
  // below it, so a dead stage under a LIVE one is still dropped. Measured on `02.Two-stage.ork` with
  // an authored booster whose mount was deleted: a separation at t≈1.6 s and apogee 1,184.749 m,
  // with `untracked-booster` firing on the same surface naming the same stage. A warning that said
  // "it never separates" would have been contradicted by the panel beside it.
  it("says a dead stage under a LIVE one is still shed, not carried", () => {
    const { rocket, config } = threeStage();
    // Kill the bottom stage only; the middle stage still burns and separates, taking it along.
    config.instances = config.instances.filter((i) => i.mountId !== "m-boost2");
    expect(dead(rocket, config)).toEqual([{ name: "Booster 2", shed: true }]);

    const warning = runFlight(rocket, {}).result.warnings.find((w) => w.code === "dead-stage")!;
    expect(warning.message).toContain("still dropped");
    expect(warning.message).not.toContain("carried to apogee");
  });

  // The plural and mixed wordings had no coverage at all: every other case here, and the single real
  // corpus design that fires this, yields exactly ONE dead stage — so a mis-worded plural or an
  // inverted `carried` comparison would have shipped green.
  it("words two dead stages in the plural, and says they are carried", () => {
    const { rocket, config } = threeStage();
    config.instances = config.instances.filter((i) => i.mountId === "m-sust");
    expect(dead(rocket, config)).toEqual([
      { name: "Booster 1", shed: false },
      { name: "Booster 2", shed: false },
    ]);
    const warning = runFlight(rocket, {}).result.warnings.find((w) => w.code === "dead-stage")!;
    expect(warning.message).toContain("Booster 1, Booster 2 carry no motor");
    expect(warning.message).toContain("They are carried to apogee");
    expect(warning.message).toContain("Give each stage");
  });

  it("does not claim one fate for a mixed set — some carried, some shed", () => {
    // Four stages — Sustainer(live) · Booster 1(dead) · Booster A(live) · Booster 2(dead) — because a
    // separation takes everything at or BELOW its own index. Booster A separating sheds Booster 2
    // beneath it, while Booster 1 sits above that joint and is carried. Neither blanket sentence is
    // true of the pair, which is exactly what the mixed wording exists for.
    const { rocket, config } = threeStage();
    rocket.stages.splice(2, 0, { name: "Booster A", components: [tube(0.4, "m-boostA")] });
    config.instances = config.instances.filter((i) => i.mountId === "m-sust");
    config.instances.push({
      mountId: "m-boostA",
      motor: { designation: "H128W", manufacturer: "AeroTech", type: "reload", diameter: 0.038, length: 0.2 },
      ignitionEvent: "automatic",
      ignitionDelay: 0,
    });
    const fates = dead(rocket, config);
    expect(fates.map((f) => f.shed).sort()).toEqual([false, true]);
    const warning = runFlight(rocket, {}).result.warnings.find((w) => w.code === "dead-stage")!;
    expect(warning.message).toContain("Some are carried to apogee as dead mass and some are dropped");
  });

  it("warns on the flight, and the flight really is a stack carrying an inert stage", () => {
    const { rocket, config } = twoStage();
    const staged = runFlight(rocket, {});
    expect(staged.result.warnings.some((w) => w.code === "dead-stage")).toBe(false);

    config.instances = config.instances.filter((i) => i.mountId !== "m-boost");
    const flown = runFlight(rocket, {});
    const warning = flown.result.warnings.find((w) => w.code === "dead-stage");
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe("warning");
    expect(warning!.message).toContain("Booster");
    // The consequence the message claims, asserted rather than described. Here the dead stage is the
    // bottom of a two-stage stack with nothing live below it, so it really is carried the whole way.
    expect(warning!.message).toContain("carried to apogee");
    expect(flown.result.events.filter((e) => e.type === "separation")).toHaveLength(0);
    expect(staged.result.events.filter((e) => e.type === "separation").length).toBeGreaterThan(0);
    expect(flown.result.summary.apogee).toBeLessThan(staged.result.summary.apogee);
  });
});

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

describe("untracked-booster range-safety warning", () => {
  const warned = (rocket: Rocket) =>
    runFlight(rocket, { configId: "cfg" }).result.warnings.some((w) => w.code === "untracked-booster");

  it("flags a spent booster that drops with no recovery — it falls ballistically, untracked", () => {
    // twoStage's booster is a bare tube + fins + mount: nothing recovers it, so once it separates it
    // descends ballistically and Loft doesn't fly it to the ground. That is a range hazard.
    expect(warned(twoStage().rocket)).toBe(true);
  });

  it("stays silent when the booster carries its own recovery", () => {
    const { rocket } = twoStage();
    const boosterTube = rocket.stages[1].components[0] as BodyTube;
    const chute: Parachute = {
      id: "booster-chute", name: "Booster chute", kind: "parachute",
      placement: { method: "top", offset: 0 }, cd: 0.8, diameter: 0.5, mass: 0.03,
      deployEvent: "apogee", deployDelay: 0, children: [],
    };
    boosterTube.children = [...boosterTube.children, chute];
    // The booster is designed to recover, so it isn't the ballistic hazard the warning is about.
    expect(warned(rocket)).toBe(false);
  });

  it("doesn't flag a single-stage flight — nothing separates", () => {
    const { rocket } = twoStage();
    const single: Rocket = { ...rocket, stages: rocket.stages.slice(0, 1), configurations: rocket.configurations };
    expect(warned(single)).toBe(false);
  });
});

describe("separated booster descent readout", () => {
  const withBoosterChute = (diameter: number): Rocket => {
    const { rocket } = twoStage();
    const boosterTube = rocket.stages[1].components[0] as BodyTube;
    const chute: Parachute = {
      id: "booster-chute", name: "Booster chute", kind: "parachute",
      placement: { method: "top", offset: 0 }, cd: 0.8, diameter, mass: 0.03,
      deployEvent: "apogee", deployDelay: 0, children: [],
    };
    boosterTube.children = [...boosterTube.children, chute];
    return rocket;
  };

  it("reports a recovered booster's terminal descent (mass + a sensible speed)", () => {
    const run = runFlight(withBoosterChute(0.6), { configId: "cfg" });
    expect(run.result.boosterDescents).toHaveLength(1);
    const bd = run.result.boosterDescents[0];
    expect(bd.name).toBe("Booster");
    expect(bd.mass).toBeGreaterThan(0.05); // the dropped stage's structure + spent casing
    // A real canopy descent — bounded, not a free-fall or a NaN.
    expect(bd.terminalSpeed).toBeGreaterThan(1);
    expect(bd.terminalSpeed).toBeLessThan(40);
    // Its own landing energy is ½·m·v² from that mass and terminal speed — the same recovery figure
    // the top vehicle reports, for the booster.
    expect(bd.landingEnergy).toBeGreaterThan(0);
    expect(bd.landingEnergy).toBeCloseTo(0.5 * bd.mass * bd.terminalSpeed ** 2, 6);
  });

  it("a bigger booster canopy gives a slower terminal descent (physical monotonicity)", () => {
    const small = runFlight(withBoosterChute(0.4), { configId: "cfg" }).result.boosterDescents[0].terminalSpeed;
    const big = runFlight(withBoosterChute(1.0), { configId: "cfg" }).result.boosterDescents[0].terminalSpeed;
    expect(big).toBeLessThan(small);
  });

  it("reports nothing for a ballistic (un-recovered) booster or a single-stage flight", () => {
    // The un-recovered booster is the ballistic-warning case, not a tracked descent.
    expect(runFlight(twoStage().rocket, { configId: "cfg" }).result.boosterDescents).toHaveLength(0);
    const { rocket } = twoStage();
    const single: Rocket = { ...rocket, stages: rocket.stages.slice(0, 1), configurations: rocket.configurations };
    expect(runFlight(single, { configId: "cfg" }).result.boosterDescents).toHaveLength(0);
  });
});

describe("booster hard-landing range-safety warning", () => {
  const withBoosterChute = (diameter: number): Rocket => {
    const { rocket } = twoStage();
    const boosterTube = rocket.stages[1].components[0] as BodyTube;
    const chute: Parachute = {
      id: "booster-chute", name: "Booster chute", kind: "parachute",
      placement: { method: "top", offset: 0 }, cd: 0.8, diameter, mass: 0.03,
      deployEvent: "apogee", deployDelay: 0, children: [],
    };
    boosterTube.children = [...boosterTube.children, chute];
    return rocket;
  };
  const boosterWarn = (diameter: number) =>
    runFlight(withBoosterChute(diameter), { configId: "cfg" }).result.warnings.find((w) => w.code === "booster-hard-landing");

  it("cautions when an undersized booster chute lands the stage firm (>7.6 m/s)", () => {
    // A 0.2 m canopy brings this booster down at ~9.4 m/s — firm, not hard.
    const w = boosterWarn(0.2);
    expect(w).toBeDefined();
    expect(w!.severity).toBe("caution");
    expect(w!.message).toContain("Booster");
  });

  it("warns (not just cautions) when a tiny booster chute lands the stage hard (>10.7 m/s)", () => {
    // A 0.15 m canopy leaves the booster coming in at ~12.5 m/s — hard enough to damage the airframe.
    const w = boosterWarn(0.15);
    expect(w).toBeDefined();
    expect(w!.severity).toBe("warning");
  });

  it("stays silent when the booster chute lands it softly", () => {
    // A 0.5 m canopy brings the booster down at ~3.7 m/s — a normal landing, no flag.
    expect(boosterWarn(0.5)).toBeUndefined();
  });

  it("doesn't fire for an un-recovered (ballistic) booster — that's the untracked-booster case", () => {
    // twoStage's bare booster has no recovery: it's flagged as ballistic, not as a firm landing.
    const warnings = runFlight(twoStage().rocket, { configId: "cfg" }).result.warnings;
    expect(warnings.some((w) => w.code === "booster-hard-landing")).toBe(false);
  });
});

describe("the design's own ignition events drive the firing order", () => {
  /** Three-stage stack: stages[0] top (sustainer), stages[2] bottom — the OpenRocket order. */
  function threeStage(events: [string, string, string]): { rocket: Rocket; config: MotorConfiguration } {
    uid = 0;
    const ids = ["m-top", "m-mid", "m-bot"];
    const rocket: Rocket = {
      name: "Test three-stage",
      stages: [
        { name: "Stage", components: [nose(), tube(0.6, ids[0])] },
        { name: "Booster 1", components: [tube(0.3, ids[1])] },
        { name: "Booster 2", components: [tube(0.3, ids[2])] },
      ],
      configurations: [],
      referenceType: "maximum",
    };
    const motor = (d: string) => ({ designation: d, manufacturer: "AeroTech", type: "reload" as const, diameter: 0.038, length: 0.2 });
    return {
      rocket,
      config: {
        id: "cfg",
        instances: ids.map((mountId, i) => ({
          mountId,
          motor: motor(i === 1 ? "H128W" : "H180W"),
          ignitionEvent: events[i],
          ignitionDelay: 0,
        })),
      },
    };
  }

  it("keeps the serial default when every motor is automatic", () => {
    const { rocket, config } = threeStage(["automatic", "automatic", "automatic"]);
    const b = buildRocketDynamics(rocket, config);
    const times = b.motors.map((m) => m.ignitionTime).sort((a, x) => a - x);
    // Bottom lights at launch; the two above air-start in turn.
    expect(times[0]).toBe(0);
    expect(times[1]).toBeGreaterThan(0);
    expect(times[2]).toBeGreaterThan(times[1]);
  });

  it("lights a MIDDLE stage at launch when the design says so", () => {
    // An OpenRocket example does exactly this: the middle stage carries `launch` while the bottom
    // stage's motor sits on a `burnout` event with nothing below it to burn out. Flying it on the
    // serial default fired the wrong motor first and read 49.8% high against the file's own
    // stored results; honouring the events brought it to -9.4% with rail-exit velocity matching
    // the stored figure to 0.4%.
    const { rocket, config } = threeStage(["burnout", "launch", "burnout"]);
    const b = buildRocketDynamics(rocket, config);
    const byMount = new Map(b.motors.map((m) => [m.designation, m.ignitionTime]));
    // The middle stage's H128W is the one that fires at t=0.
    expect(byMount.get("H128W")).toBe(0);
  });

  it("never lights a motor whose trigger can never arrive", () => {
    // `burnout` on the bottom-most stage has nothing beneath it; the motor rides as inert mass.
    const { rocket, config } = threeStage(["burnout", "launch", "burnout"]);
    const b = buildRocketDynamics(rocket, config);
    const lit = b.motors.filter((m) => Number.isFinite(m.ignitionTime));
    expect(lit).toHaveLength(2); // the middle stage's, and the sustainer's on its burnout
    expect(b.motors.some((m) => m.ignitionTime === Infinity)).toBe(true);
  });

  it("reads burnout off the motors that burn, not off one that never lights", () => {
    // The flight's burnout was `max(ignitionTime + burnTime)` over EVERY motor, and a motor whose
    // trigger can never arrive carries `ignitionTime = Infinity` — so one unlit motor made the whole
    // flight's burnout `Infinity`. That is not "later than the others", it is "never", and four
    // numbers a flyer acts on were read off it. Optimum delay is the sharpest: `max(0, apogee - ∞)`
    // is 0 s, which reads as "deploy at burnout" on a rocket still climbing.
    const { rocket, config } = threeStage(["burnout", "launch", "burnout"]);
    // `threeStage` hands the configuration back separately; `runFlight` resolves it off the design.
    const { result } = runFlight({ ...rocket, configurations: [config] }, { configId: config.id });
    const s = result.summary;

    expect(s.apogee).toBeGreaterThan(0);
    // Burnout happened, was seen, and was logged.
    expect(s.burnoutVelocity).toBeGreaterThan(0);
    expect(s.burnoutAltitude).toBeGreaterThan(0);
    expect(result.events.some((e) => e.type === "burnout")).toBe(true);
    // The coast from burnout to apogee is a real interval, not a floor at zero.
    expect(s.optimumDelay).toBeGreaterThan(0);
    expect(s.optimumDelay).toBeLessThan(s.timeToApogee);
    // Burnout mass is read at a finite time now, and it has to be the mass of the vehicle that is
    // STILL ATTACHED. The bottom stage of this fixture is shed — the sibling test below asserts the
    // phases step 3 → 1 — so neither its airframe nor the motor bolted to it is aboard, even though
    // that motor never lit and so has no burnout of its own to separate on. A `> 0` /
    // `<= liftoffMass` pair would pass with its point mass still riding along, which is exactly the
    // state this asserts against.
    expect(result.burnoutMass).toBeGreaterThan(0);
    expect(result.burnoutMass).toBeLessThan(result.liftoffMass);
    const unlit = buildRocketDynamics(rocket, config).motors.find((m) => !Number.isFinite(m.ignitionTime))!;
    expect(unlit).toBeDefined();
    // It leaves with its stage, not at `Infinity`, and that is before the flight is over.
    expect(Number.isFinite(unlit.detachTime!)).toBe(true);
    expect(unlit.detachTime).toBeLessThan(s.timeToApogee);
    // And its full loaded mass is genuinely gone from the descent, not merely "some mass is".
    expect(result.burnoutMass).toBeLessThanOrEqual(result.liftoffMass - unlit.curve.totalMass);
  });

  it("drops everything below the joint that parts, not one stage per event", () => {
    // A serial stack separates at ONE joint: when the middle stage goes, the bottom goes with it.
    const { rocket, config } = threeStage(["burnout", "launch", "burnout"]);
    const b = buildRocketDynamics(rocket, config);
    // Phases step 3 → 1: the un-fired bottom stage never separates on its own.
    expect(b.phases[0].stageCount).toBe(3);
    expect(b.phases[b.phases.length - 1].stageCount).toBe(1);
    expect(b.phases).toHaveLength(2);
  });

  it("still steps N → N-1 → … → 1 when every stage separates in turn", () => {
    const { rocket, config } = threeStage(["automatic", "automatic", "automatic"]);
    const counts = buildRocketDynamics(rocket, config).phases.map((p) => p.stageCount);
    expect(counts).toEqual([3, 2, 1]);
  });
});
