import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adaptRktXml } from "./adapt";
import { adaptDesignXml, importDesign } from "../ork/import";
import { flattenRocket, overallLength } from "../model/geometry";
import { dryMassProperties } from "../sim/mass";
import { runFromDocument, configChoices } from "../sim/run";
import type { NoseCone, BodyTube, TrapezoidFinSet, Parachute, MassComponent } from "../model/types";

const readRkt = (name: string) => readFileSync(resolve(process.cwd(), "fixtures/src", name), "utf-8");

describe("adaptRktXml — demo-rocksim fixture", () => {
  const doc = adaptRktXml(readRkt("demo-rocksim.rkt"));

  it("reads the design metadata and format", () => {
    expect(doc.rocket.name).toBe("Loft demo — 54 mm sport (J420R)");
    expect(doc.formatVersion).toMatch(/^RockSim/);
    expect(doc.flownAsReduced).toBe(false);
    expect(doc.warnings).toEqual([]);
    // One combined axial stage (single-stage design).
    expect(doc.rocket.stages).toHaveLength(1);
  });

  it("converts geometry from mm/diameters to SI radii and metres", () => {
    const flat = flattenRocket(doc.rocket);
    const nose = flat.find((p) => p.component.kind === "nosecone")!.component as NoseCone;
    expect(nose.length).toBeCloseTo(0.38, 5); // 380 mm
    expect(nose.aftRadius).toBeCloseTo(0.027, 5); // BaseDia 54 mm → r 27 mm
    expect(nose.shape).toBe("ogive"); // ShapeCode 1
    expect(nose.thickness).toBeCloseTo(0.002, 5); // hollow, 2 mm wall

    const tube = flat.find((p) => p.component.kind === "bodytube")!.component as BodyTube;
    expect(tube.length).toBeCloseTo(0.9, 5);
    expect(tube.outerRadius).toBeCloseTo(0.0285, 5); // OD 57 mm
    expect(tube.thickness).toBeCloseTo(0.0015, 5); // (57-54)/2 mm

    // Body parts stack nose→tail: the tube's fore end is the nose's aft end.
    const nosePos = flat.find((p) => p.component.kind === "nosecone")!;
    const tubePos = flat.find((p) => p.component.kind === "bodytube")!;
    expect(tubePos.xFore).toBeCloseTo(nosePos.xFore + nosePos.length, 5);
    expect(overallLength(doc.rocket)).toBeCloseTo(1.28, 3);
  });

  it("reads the trapezoidal fin set and seats it at the tube aft (LocationMode 2)", () => {
    const flat = flattenRocket(doc.rocket);
    const finPos = flat.find((p) => p.component.kind === "trapezoidfinset")!;
    const fins = finPos.component as TrapezoidFinSet;
    expect(fins.finCount).toBe(3);
    expect(fins.rootChord).toBeCloseTo(0.16, 5);
    expect(fins.tipChord).toBeCloseTo(0.07, 5);
    expect(fins.height).toBeCloseTo(0.075, 5);
    expect(fins.sweepLength).toBeCloseTo(0.095, 5);
    // Rear-referenced: the fin trailing edge sits at the tube's aft end.
    const tubePos = flat.find((p) => p.component.kind === "bodytube")!;
    expect(finPos.xFore + fins.rootChord).toBeCloseTo(tubePos.xFore + tubePos.length, 4);
  });

  it("honours the file's per-part masses (grams → kg) as overrides", () => {
    const flat = flattenRocket(doc.rocket);
    const nose = flat.find((p) => p.component.kind === "nosecone")!.component as NoseCone;
    // UseKnownMass=0 → RockSim's CalcMass is the active mass (210 g here).
    expect(nose.overrideMass).toBeCloseTo(0.21, 5);
    const chute = flat.find((p) => p.component.kind === "parachute")!.component as Parachute;
    expect(chute.mass).toBeCloseTo(0.14, 5);
    expect(chute.diameter).toBeCloseTo(1.2, 5);
    const payload = flat.find((p) => p.component.kind === "masscomponent")!.component as MassComponent;
    expect(payload.mass).toBeCloseTo(1.45, 5); // a mass object uses its known mass
    // Dry mass ≈ sum of the stated part masses.
    expect(dryMassProperties(doc.rocket).mass).toBeCloseTo(2.776, 2);
  });

  it("builds a motor configuration and stored simulation from the EngineSet", () => {
    expect(doc.rocket.configurations).toHaveLength(1);
    const cfg = doc.rocket.configurations[0];
    expect(cfg.instances).toHaveLength(1);
    expect(cfg.instances[0].motor.designation).toBe("J420R");
    expect(cfg.instances[0].motor.manufacturer).toBe("Aerotech");
    expect(cfg.instances[0].motor.delay).toBe(13); // EjectionDelay
    // The mount tube it references is flagged as a motor mount.
    const mount = flattenRocket(doc.rocket).find((p) => p.component.id === cfg.instances[0].mountId);
    expect(mount && "motorMount" in mount.component && mount.component.motorMount).toBeTruthy();

    expect(doc.simulations).toHaveLength(1);
    const sim = doc.simulations[0];
    expect(sim.hasResults).toBe(true);
    expect(sim.results.maxAltitude).toBeCloseTo(1244, 0);
    expect(sim.conditions.configId).toBe(cfg.id);
    expect(sim.conditions.launchAltitude).toBe(250);
    expect(sim.conditions.baseTempK).toBeCloseTo(293.15, 2);
    expect(sim.name).toBe("J420R-13"); // stripped of the [...] brackets

    const choices = configChoices(doc);
    expect(choices).toHaveLength(1);
    expect(choices[0].motors).toEqual(["J420R"]);
    expect(choices[0].storedApogeeM).toBeCloseTo(1244, 0);
  });

  it("captures the launch lug's outer radius for protuberance drag", () => {
    const lug = flattenRocket(doc.rocket).find((p) => p.component.kind === "launchlug")!.component;
    expect("radius" in lug && lug.radius).toBeCloseTo(0.006, 6); // OD 12 mm → r 6 mm
  });

  it("resolves the motor and flies a validated flight", () => {
    const run = runFromDocument(doc);
    expect(run.hasPropulsion).toBe(true);
    expect(run.resolutions[0].match?.quality).toBe("exact");
    expect(run.result.summary.apogee).toBeGreaterThan(500);
    expect(run.result.summary.maxMach).toBeLessThan(0.8); // subsonic — the reliable regime
    // A stored simulation is present and the vehicle wasn't reduced, so the comparison runs.
    expect(run.validation).toBeDefined();
    expect(run.validation!.count).toBeGreaterThan(3);
  });
});

describe("adaptRktXml — degradation and edge cases", () => {
  it("routes .rkt bytes through the shared importer by sniffing the root", async () => {
    const bytes = new TextEncoder().encode(readRkt("demo-rocksim.rkt"));
    const doc = await importDesign(bytes);
    expect(doc.formatVersion).toMatch(/^RockSim/);
    expect(doc.rocket.configurations[0].instances[0].motor.designation).toBe("J420R");
  });

  it("dispatches OpenRocket XML to the OpenRocket adapter", () => {
    const ork = readFileSync(resolve(process.cwd(), "fixtures/src", "demo-single-deploy.ork.xml"), "utf-8");
    const doc = adaptDesignXml(ork);
    expect(doc.formatVersion).not.toMatch(/^RockSim/);
  });

  it("rejects a non-RockSim root", () => {
    expect(() => adaptRktXml("<html></html>")).toThrow(/RockSim/);
  });

  it("maps the documented nose-cone shape codes", () => {
    const shapeFor = (code: number) => {
      const xml = `<RockSimDocument><DesignInformation><RocketDesign><Name>t</Name>` +
        `<Stage3Parts><NoseCone><Name>n</Name><Len>100.</Len><BaseDia>50.</BaseDia>` +
        `<ShapeCode>${code}</ShapeCode><CalcMass>10.</CalcMass></NoseCone></Stage3Parts>` +
        `</RocketDesign></DesignInformation></RockSimDocument>`;
      const flat = flattenRocket(adaptRktXml(xml).rocket);
      return (flat[0].component as NoseCone).shape;
    };
    expect(shapeFor(0)).toBe("conical");
    expect(shapeFor(1)).toBe("ogive");
    expect(shapeFor(2)).toBe("ellipsoid"); // RockSim PARABOLIC
    expect(shapeFor(4)).toBe("power");
    expect(shapeFor(5)).toBe("parabolic");
    expect(shapeFor(6)).toBe("haack");
  });

  it("flies with no propulsion when the design carries no motor", () => {
    // A design saved with no stored simulation has no motor; it must still import and run
    // (with results withheld) rather than throw.
    const xml = `<RockSimDocument><DesignInformation><RocketDesign><Name>bare</Name>` +
      `<Stage3Parts><NoseCone><Name>n</Name><Len>200.</Len><BaseDia>40.</BaseDia>` +
      `<ShapeCode>1</ShapeCode><CalcMass>60.</CalcMass></NoseCone>` +
      `<BodyTube><Name>b</Name><Len>400.</Len><OD>40.</OD><ID>38.</ID><SerialNo>2</SerialNo>` +
      `<CalcMass>120.</CalcMass></BodyTube></Stage3Parts>` +
      `</RocketDesign></DesignInformation></RockSimDocument>`;
    const doc = adaptRktXml(xml);
    expect(doc.rocket.configurations).toHaveLength(1);
    expect(doc.rocket.configurations[0].instances).toHaveLength(0);
    const run = runFromDocument(doc);
    expect(run.hasPropulsion).toBe(false);
  });

  it("flags a multi-stage design as flown-reduced", () => {
    const stage = (tag: string, dia: number) =>
      `<${tag}><BodyTube><Name>${tag}</Name><Len>300.</Len><OD>${dia}.</OD><ID>${dia - 2}.</ID>` +
      `<SerialNo>${dia}</SerialNo><CalcMass>100.</CalcMass></BodyTube></${tag}>`;
    const xml = `<RockSimDocument><DesignInformation><RocketDesign><Name>two</Name>` +
      stage("Stage3Parts", 40) + stage("Stage1Parts", 54) +
      `</RocketDesign></DesignInformation></RockSimDocument>`;
    const doc = adaptRktXml(xml);
    expect(doc.flownAsReduced).toBe(true);
    expect(doc.warnings.some((w) => /stages/.test(w))).toBe(true);
  });
});
