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
    // The fixture's fin is TipShapeCode 0 — a square edge.
    expect(fins.crossSection).toBe("square");
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

  // LocationMode 1 places a sub-component from the nose tip (an absolute airframe station),
  // not from the front of its parent. A rear-tube trim/payload mass commonly uses it, and
  // reading it as parent-relative pushes the part far behind the airframe — which silently
  // drags the CG aft and can flip a stable rocket to "unstable". (Found driving a real .rkt.)
  const massAt = (mode: number, xbMm: number) => {
    const xml = `<RockSimDocument><DesignInformation><RocketDesign><Name>t</Name>` +
      `<Stage3Parts><NoseCone><Name>n</Name><Len>100.</Len><BaseDia>50.</BaseDia><ShapeCode>1</ShapeCode><CalcMass>10.</CalcMass></NoseCone>` +
      `<BodyTube><Name>b</Name><Len>400.</Len><OD>50.</OD><ID>48.</ID><SerialNo>2</SerialNo><CalcMass>50.</CalcMass>` +
      `<AttachedParts><MassObject><Name>trim</Name><LocationMode>${mode}</LocationMode><Xb>${xbMm}.</Xb><KnownMass>500.</KnownMass><Len>0.</Len></MassObject></AttachedParts>` +
      `</BodyTube></Stage3Parts></RocketDesign></DesignInformation></RockSimDocument>`;
    const flat = flattenRocket(adaptRktXml(xml).rocket);
    return flat.find((p) => p.component.kind === "masscomponent")!.xFore;
  };

  it("places a LocationMode=1 mass from the nose tip (absolute), not from the parent front", () => {
    // Nose 0–0.1 m; body 0.1–0.5 m. Xb = 450 mm from the nose tip ⇒ 0.45 m, inside the body tube.
    // Read parent-relative it would be 0.1 + 0.45 = 0.55 m, a tenth of a metre past the airframe.
    expect(massAt(1, 450)).toBeCloseTo(0.45, 3);
    expect(massAt(1, 450)).toBeLessThan(0.5); // stays on the airframe, not behind it
  });

  it("still reads LocationMode=0 as an offset from the parent front", () => {
    // Body starts at 0.1 m; 200 mm from its front ⇒ 0.30 m.
    expect(massAt(0, 200)).toBeCloseTo(0.3, 3);
  });

  it("reads LocationMode=2 as a forward offset from the parent rear", () => {
    // Body ends at 0.5 m. A positive Xb of 100 mm measures FORWARD from the rear ⇒ 0.40 m, inside
    // the tube — the RockSim convention motor-mount rings and bulkheads use. Added aft it would be
    // 0.60 m, a tenth of a metre behind the airframe. Xb = 0 keeps a part flush at the rear.
    expect(massAt(2, 100)).toBeCloseTo(0.4, 3);
    expect(massAt(2, 100)).toBeLessThan(0.5);
    expect(massAt(2, 0)).toBeCloseTo(0.5, 3);
  });
});

describe("adaptRktXml — fin edge cross-section (TipShapeCode)", () => {
  // A RockSim FinSet records its edge profile in TipShapeCode. On a thick fin that profile is a
  // large share of the drag, so defaulting every RockSim fin to square badly over-drags a
  // rounded/airfoiled design; reading it keeps the aerodynamics honest.
  const finFor = (tip: string): TrapezoidFinSet => {
    const xml =
      `<RockSimDocument><DesignInformation><RocketDesign><Stage3Parts>` +
      `<FinSet><Name>Fins</Name><FinCount>3</FinCount><RootChord>100.</RootChord><TipChord>50.</TipChord>` +
      `<SemiSpan>50.</SemiSpan><Thickness>3.</Thickness><ShapeCode>0</ShapeCode>${tip}</FinSet>` +
      `</Stage3Parts></RocketDesign></DesignInformation></RockSimDocument>`;
    return flattenRocket(adaptRktXml(xml).rocket).find((p) => p.component.kind === "trapezoidfinset")!
      .component as TrapezoidFinSet;
  };

  it("maps 0→square, 1→rounded, 2→airfoil", () => {
    expect(finFor("<TipShapeCode>0</TipShapeCode>").crossSection).toBe("square");
    expect(finFor("<TipShapeCode>1</TipShapeCode>").crossSection).toBe("rounded");
    expect(finFor("<TipShapeCode>2</TipShapeCode>").crossSection).toBe("airfoil");
  });

  it("defaults an absent or unknown code to square", () => {
    expect(finFor("").crossSection).toBe("square");
    expect(finFor("<TipShapeCode>9</TipShapeCode>").crossSection).toBe("square");
  });
});

describe("adaptRktXml — per-part CG override (UseKnownCG/KnownCG)", () => {
  // RockSim stores a component's CG from its front in mm and flags a deliberate override with
  // UseKnownCG=1. A nose or section trimmed to a measured CG (clay in the nose, say) must fly with
  // that CG — and thus the right stability margin — the way the OpenRocket adapter honours
  // <overridecg>. Loft counts only a *genuine* override so it doesn't blindly adopt RockSim's own
  // per-part CG (RockSim caches it into KnownCG too) or import a nonsensical out-of-body value.
  const design = (cgTags: string) => {
    // Nose 0–100 mm (light); a heavy uniform body tube 100–500 mm (Len 400). The tube's geometry CG
    // is its midpoint: 200 mm from its front ⇒ the 300 mm airframe station.
    const xml =
      `<RockSimDocument><DesignInformation><RocketDesign><Name>t</Name><Stage3Parts>` +
      `<NoseCone><Name>n</Name><Len>100.</Len><BaseDia>50.</BaseDia><ShapeCode>1</ShapeCode><CalcMass>10.</CalcMass></NoseCone>` +
      `<BodyTube><Name>b</Name><Len>400.</Len><OD>50.</OD><ID>48.</ID><SerialNo>2</SerialNo><CalcMass>2000.</CalcMass><CalcCG>200.</CalcCG>${cgTags}</BodyTube>` +
      `</Stage3Parts></RocketDesign></DesignInformation></RockSimDocument>`;
    const rocket = adaptRktXml(xml).rocket;
    const tube = flattenRocket(rocket).find((p) => p.component.kind === "bodytube")!
      .component as BodyTube & { overrideCGx?: number };
    return { tube, cg: dryMassProperties(rocket).cg };
  };

  const baseline = design("");

  it("maps a genuine override to overrideCGx and shifts the CG onto it", () => {
    // Override the tube CG to 100 mm from its front (geometry says 200) ⇒ overrideCGx 0.1 m and the
    // tube CG at the 200 mm station instead of 300 mm. The heavy tube pulls the whole rocket forward.
    const g = design(`<UseKnownCG>1</UseKnownCG><KnownCG>100.</KnownCG>`);
    expect(g.tube.overrideCGx).toBeCloseTo(0.1, 6);
    expect(g.cg).toBeLessThan(baseline.cg); // moved forward
    expect(g.cg).toBeCloseTo(0.2, 2); // ≈ the overridden (dominant) tube CG
  });

  it("ignores a CG marked known but equal to the computed CG (RockSim's cached value)", () => {
    const g = design(`<UseKnownCG>1</UseKnownCG><KnownCG>200.</KnownCG>`);
    expect(g.tube.overrideCGx).toBeUndefined();
    expect(g.cg).toBeCloseTo(baseline.cg, 6);
  });

  it("ignores an override that sits outside the component (bogus data)", () => {
    const g = design(`<UseKnownCG>1</UseKnownCG><KnownCG>900.</KnownCG>`); // past the 400 mm length
    expect(g.tube.overrideCGx).toBeUndefined();
    expect(g.cg).toBeCloseTo(baseline.cg, 6);
  });

  it("ignores KnownCG when the part isn't marked known-CG", () => {
    const g = design(`<UseKnownCG>0</UseKnownCG><KnownCG>100.</KnownCG>`);
    expect(g.tube.overrideCGx).toBeUndefined();
    expect(g.cg).toBeCloseTo(baseline.cg, 6);
  });
});
