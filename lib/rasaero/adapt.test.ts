import { describe, it, expect } from "vitest";
import { adaptRasAeroXml, airframeMass, parseEngineName } from "./adapt";
import { adaptDesignXml, sourceTool } from "../ork/import";
import { flattenRocket, overallLength } from "../model/geometry";
import { dryMassProperties } from "../sim/mass";
import { runFromDocument } from "../sim/run";
import type { BodyTube, NoseCone, TrapezoidFinSet, Transition, Parachute } from "../model/types";

/** A minimal but complete RASAero design: 4 in airframe, Von Kármán nose, four fins on the tube,
 *  a launch site, dual-deploy recovery, and one simulation carrying RASAero's own numbers. Shaped
 *  exactly like the real `.CDX1` exports in the corpus. */
const DESIGN = `<RASAeroDocument>
  <FileVersion>2</FileVersion>
  <RocketDesign>
    <NoseCone>
      <PartType>NoseCone</PartType><Length>20</Length><Diameter>4</Diameter>
      <Shape>Von Karman Ogive</Shape><Location>0</Location>
    </NoseCone>
    <BodyTube>
      <PartType>BodyTube</PartType><Length>48</Length><Diameter>4</Diameter>
      <LaunchLugDiameter>0.5</LaunchLugDiameter><LaunchLugLength>2</LaunchLugLength>
      <Location>20</Location><BoattailLength>0</BoattailLength><BoattailRearDiameter>0</BoattailRearDiameter>
      <Fin>
        <Count>4</Count><Chord>12</Chord><Span>5</Span><SweepDistance>10</SweepDistance>
        <TipChord>2.5</TipChord><Thickness>0.1875</Thickness><Location>13</Location>
        <AirfoilSection>Hexagonal</AirfoilSection>
      </Fin>
    </BodyTube>
    <Surface>Smooth Paint</Surface>
  </RocketDesign>
  <LaunchSite>
    <Altitude>3848</Altitude><Pressure>29.53</Pressure><RodAngle>5</RodAngle>
    <RodLength>8</RodLength><Temperature>95</Temperature><WindSpeed>10</WindSpeed>
  </LaunchSite>
  <Recovery>
    <DeviceType1>Parachute</DeviceType1><Size1>2</Size1><CD1>1.33</CD1><Altitude1>1000</Altitude1>
    <DeviceType2>Parachute</DeviceType2><Size2>6</Size2><CD2>1.33</CD2><Altitude2>700</Altitude2>
  </Recovery>
  <SimulationList>
    <Simulation>
      <SustainerEngine>K550W  (AT)</SustainerEngine>
      <SustainerLaunchWt>37.8</SustainerLaunchWt>
      <SustainerCG>43.82</SustainerCG>
      <SustainerIgnitionDelay>0</SustainerIgnitionDelay>
      <TimetoApogee>66.3</TimetoApogee><MaxAltitude>7340</MaxAltitude><MaxVelocity>900</MaxVelocity>
    </Simulation>
  </SimulationList>
</RASAeroDocument>`;

describe("adaptRasAeroXml", () => {
  const doc = adaptRasAeroXml(DESIGN);

  it("is picked by the shared importer from its XML root", () => {
    expect(adaptDesignXml(DESIGN).creator).toBe("RASAero II");
    expect(doc.formatVersion).toMatch(/^RASAero/);
    expect(sourceTool(doc)).toBe("RASAero");
  });

  it("rejects a file that isn't RASAero", () => {
    expect(() => adaptRasAeroXml("<openrocket/>")).toThrow(/Not a RASAero file/);
  });

  it("converts inches to metres through the whole airframe", () => {
    const flat = flattenRocket(doc.rocket);
    const nose = flat.find((p) => p.component.kind === "nosecone")!.component as NoseCone;
    expect(nose.length).toBeCloseTo(20 * 0.0254, 6);
    expect(nose.aftRadius).toBeCloseTo(2 * 0.0254, 6); // 4 in diameter → 2 in radius
    expect(nose.shape).toBe("haack"); // Von Kármán
    const tube = flat.find((p) => p.component.kind === "bodytube")!.component as BodyTube;
    expect(tube.length).toBeCloseTo(48 * 0.0254, 6);
    expect(overallLength(doc.rocket)).toBeCloseTo(68 * 0.0254, 6);
  });

  it("reads the fin set, its sweep and its streamlined edge", () => {
    const fins = flattenRocket(doc.rocket).find((p) => p.component.kind === "trapezoidfinset")!
      .component as TrapezoidFinSet;
    expect(fins.finCount).toBe(4);
    expect(fins.rootChord).toBeCloseTo(12 * 0.0254, 6);
    expect(fins.tipChord).toBeCloseTo(2.5 * 0.0254, 6);
    expect(fins.height).toBeCloseTo(5 * 0.0254, 6);
    expect(fins.sweepLength).toBeCloseTo(10 * 0.0254, 6);
    expect(fins.crossSection).toBe("airfoil"); // Hexagonal
  });

  it("reads the launch lug for its parasitic drag", () => {
    const lug = flattenRocket(doc.rocket).find((p) => p.component.kind === "launchlug");
    expect(lug).toBeDefined();
  });

  it("carries the design's stated launch weight, with the motor's mass separated out", () => {
    // 37.8 lb loaded. A K550W weighs ~1.4 kg loaded, so the airframe is the balance — and the two
    // together must balance at the 43.82 in CG the file states.
    const dry = dryMassProperties(doc.rocket);
    expect(dry.mass).toBeGreaterThan(0);
    expect(dry.mass).toBeLessThan(37.8 * 0.45359237);
    expect(doc.notes.join(" ")).toMatch(/no materials or per-part masses/);
  });

  it("balances airframe and motor at exactly the stated CG", () => {
    // The arithmetic on its own, so the intent is pinned independently of any bundled curve.
    const { mass, station } = airframeMass(10, 1.0, 2, 1.6);
    expect(mass).toBeCloseTo(8, 9);
    expect((mass * station + 2 * 1.6) / 10).toBeCloseTo(1.0, 9);
  });

  it("places the whole stated weight at the stated CG when the motor can't be weighed", () => {
    const { mass, station } = airframeMass(10, 1.0, 0, 1.6);
    expect(mass).toBeCloseTo(10, 9);
    expect(station).toBeCloseTo(1.0, 9);
  });

  it("splits RASAero's engine name into designation and maker code", () => {
    expect(parseEngineName("N1000W  (AT)")).toEqual({ designation: "N1000W", manufacturer: "AT" });
    expect(parseEngineName("1/4A2  (AP)")).toEqual({ designation: "1/4A2", manufacturer: "AP" });
    expect(parseEngineName("K550W")).toEqual({ designation: "K550W" });
  });

  it("carries RASAero's own predicted numbers as a cross-check, converted from feet", () => {
    const sim = doc.simulations[0];
    expect(sim.hasResults).toBe(true);
    expect(sim.results.maxAltitude).toBeCloseTo(7340 * 0.3048, 3);
    expect(sim.results.maxVelocity).toBeCloseTo(900 * 0.3048, 3);
    expect(sim.results.timeToApogee).toBeCloseTo(66.3, 6);
  });

  it("reads the launch site, converting feet, °F, inHg and mph", () => {
    const c = doc.simulations[0].conditions;
    expect(c.launchAltitude).toBeCloseTo(3848 * 0.3048, 3);
    expect(c.baseTempK).toBeCloseTo((95 - 32) / 1.8 + 273.15, 6);
    expect(c.basePressurePa).toBeCloseTo(29.53 * 3386.389, 1);
    expect(c.windSpeed).toBeCloseTo(10 * 0.44704, 6);
    expect(c.rodAngleDeg).toBe(5);
    expect(c.rodLength).toBeCloseTo(8 * 0.3048, 6);
  });

  it("builds dual deploy from the two recovery events", () => {
    const chutes = flattenRocket(doc.rocket)
      .map((p) => p.component)
      .filter((c): c is Parachute => c.kind === "parachute");
    expect(chutes).toHaveLength(2);
    expect(chutes[0].deployEvent).toBe("apogee");
    expect(chutes[0].diameter).toBeCloseTo(2 * 0.3048, 6); // canopy size is in feet
    expect(chutes[1].deployEvent).toBe("altitude");
    expect(chutes[1].deployAltitude).toBeCloseTo(700 * 0.3048, 3);
  });

  it("flies through the same solver as any other format", () => {
    const run = runFromDocument(doc);
    expect(run.hasPropulsion).toBe(true);
    expect(run.result.summary.apogee).toBeGreaterThan(0);
    expect(Number.isFinite(run.result.summary.apogee)).toBe(true);
  });

  it("flags a booster it can't weigh as flown reduced", () => {
    // This design's simulation states no Booster1 weight, so there is nothing to build the stage
    // from — it is skipped and the comparison withheld, rather than flown at a guessed mass.
    const staged = DESIGN.replace(
      "<Surface>Smooth Paint</Surface>",
      `<Booster><PartType>Booster</PartType><Length>24</Length><Diameter>4</Diameter><Location>68</Location></Booster>
       <Surface>Smooth Paint</Surface>`,
    );
    const d = adaptRasAeroXml(staged);
    expect(d.flownAsReduced).toBe(true);
    expect(d.warnings.join(" ")).toMatch(/booster stage/i);
  });

  it("reads an inline boattail on a body tube as a contracting transition", () => {
    const tapered = DESIGN.replace(
      "<BoattailLength>0</BoattailLength><BoattailRearDiameter>0</BoattailRearDiameter>",
      "<BoattailLength>4</BoattailLength><BoattailRearDiameter>3</BoattailRearDiameter>",
    );
    const bt = flattenRocket(adaptRasAeroXml(tapered).rocket).find(
      (p) => p.component.kind === "transition",
    )!.component as Transition;
    expect(bt.length).toBeCloseTo(4 * 0.0254, 6);
    expect(bt.aftRadius).toBeCloseTo(1.5 * 0.0254, 6);
    expect(bt.aftRadius).toBeLessThan(bt.foreRadius);
  });

  it("keeps the design's launch setup when it stores no simulations", () => {
    // `<LaunchSite>` is design-level — one block for the whole file — but it only reached the model
    // through the per-simulation loop, so a design with an empty `<SimulationList/>` threw its
    // entire launch setup away and flew Loft's defaults. Measured on the corpus's
    // `Three-stage rocket.CDX1`, which states a 12 ft rail against that 1.0 m default: 3.66x on the
    // length rail-exit velocity is computed across, which is the number a pad check turns on.
    const bare = DESIGN.replace(/<SimulationList>[\s\S]*<\/SimulationList>/, "<SimulationList />");
    const d = adaptRasAeroXml(bare);
    expect(d.simulations).toHaveLength(1);
    const [setup] = d.simulations;
    expect(setup.conditions.rodLength).toBeCloseTo(8 * 0.3048, 6); // 8 ft, as the file states
    expect(setup.conditions.rodAngleDeg).toBe(5);
    expect(setup.conditions.launchAltitude).toBeCloseTo(3848 * 0.3048, 6);
    expect(setup.conditions.windSpeed).toBeCloseTo(10 * 0.44704, 6);
    // It is a SETUP, not a run: no results, so it stays out of every stored-tool comparison exactly
    // as an unrun simulation does, and nothing presents Loft's own numbers as verified against it.
    expect(setup.hasResults).toBe(false);
    expect(setup.results).toEqual({});
    expect(setup.status).toBe("notsimulated");

    expect(d.warnings.join(" ")).toMatch(/no launch weight/);
    // No motor, so the run layer withholds the flight rather than reporting a zero-altitude one.
    expect(runFromDocument(d).hasPropulsion).toBe(false);
  });

  it("does not invent a setup when the design states no launch site either", () => {
    // The guard has to fire on a real absence and not on every simulation-less design, or it turns
    // "Loft read nothing" into "Loft read a default and called it the file's".
    const bare = DESIGN.replace(/<SimulationList>[\s\S]*<\/SimulationList>/, "<SimulationList />").replace(
      /<LaunchSite>[\s\S]*<\/LaunchSite>/,
      "",
    );
    expect(adaptRasAeroXml(bare).simulations).toHaveLength(0);
  });
});

describe("adaptRasAeroXml — booster stages", () => {
  /** A two-stage design shaped like the corpus's: a 4 in sustainer over a booster that carries its
   *  own fins and inline boattail, and a simulation stating the stack's weight with Booster 1
   *  aboard. The booster spans 68–76 in, which is what makes the two readings of Booster1CG
   *  distinguishable. */
  const staged = (sim: string) => `<RASAeroDocument><FileVersion>2</FileVersion><RocketDesign>
    <NoseCone><PartType>NoseCone</PartType><Length>20</Length><Diameter>4</Diameter><Shape>Von Karman Ogive</Shape></NoseCone>
    <BodyTube><PartType>BodyTube</PartType><Length>48</Length><Diameter>4</Diameter>
      <Fin><Count>4</Count><Chord>12</Chord><Span>5</Span><SweepDistance>10</SweepDistance>
        <TipChord>2.5</TipChord><Thickness>0.1875</Thickness><Location>30</Location></Fin>
    </BodyTube>
    <Booster><PartType>Booster</PartType><Length>8</Length><Diameter>4</Diameter><Location>68</Location>
      <BoattailLength>0</BoattailLength><BoattailRearDiameter>0</BoattailRearDiameter>
      <Fin><Count>3</Count><Chord>6</Chord><Span>3</Span><SweepDistance>3</SweepDistance>
        <TipChord>2</TipChord><Thickness>0.1</Thickness><Location>1</Location></Fin>
    </Booster>
    </RocketDesign><SimulationList><Simulation>${sim}</Simulation></SimulationList></RASAeroDocument>`;

  // Sustainer 10 lb at 40 in; the stack with the booster aboard 14 lb at 48 in. Read as the stack,
  // the booster is 4 lb and the moment balance puts it at (14·48 − 10·40)/4 = 68 in — inside it.
  const SIM = `<SustainerEngine>K550W  (AT)</SustainerEngine>
    <SustainerLaunchWt>10</SustainerLaunchWt><SustainerCG>40</SustainerCG><SustainerIgnitionDelay>0</SustainerIgnitionDelay>
    <Booster1Engine>K550W  (AT)</Booster1Engine><Booster1LaunchWt>14</Booster1LaunchWt><Booster1CG>48</Booster1CG>
    <Booster1SeparationDelay>1.5</Booster1SeparationDelay><Booster1IgnitionDelay>0</Booster1IgnitionDelay>
    <IncludeBooster1>True</IncludeBooster1>
    <MaxAltitude>7340</MaxAltitude><MaxVelocity>900</MaxVelocity>`;

  it("builds the booster as its own stage, below the sustainer", () => {
    const doc = adaptRasAeroXml(staged(SIM));
    expect(doc.rocket.stages.map((s) => s.name)).toEqual(["Sustainer", "Booster"]);
    expect(doc.rocket.stages[1].separationEvent).toBe("burnout");
    expect(doc.rocket.stages[1].separationDelay).toBeCloseTo(1.5, 6);
    // A booster Loft actually flies is not a reduced vehicle, so the cross-check stands.
    expect(doc.flownAsReduced).toBe(false);
  });

  it("reads Booster1 as the whole stack on the pad, not the booster alone", () => {
    // The convention the corpus settles: the booster is the DIFFERENCE in stated weight, balanced
    // at the difference in moments. 14 − 10 = 4 lb here.
    const doc = adaptRasAeroXml(staged(SIM));
    const boosterMass = dryMassProperties(doc.rocket).mass - dryMassProperties({ ...doc.rocket, stages: [doc.rocket.stages[0]] }).mass;
    // The booster's motor mass is separated out of its stated weight, so compare the stage's own
    // mass component rather than the loaded figure: 4 lb minus the K550W's loaded mass.
    expect(boosterMass).toBeGreaterThan(0);
    expect(boosterMass).toBeLessThan(4 * 0.45359237);
  });

  it("gives the booster its own motor, mounted in the booster", () => {
    const doc = adaptRasAeroXml(staged(SIM));
    const cfg = doc.rocket.configurations[0];
    expect(cfg.instances).toHaveLength(2);
    const boosterTube = doc.rocket.stages[1].components.find((c) => c.kind === "bodytube")!;
    expect(cfg.instances.some((i) => i.mountId === boosterTube.id)).toBe(true);
    // …and the fin set RASAero hangs off the booster came with it.
    expect(boosterTube.children.some((c) => c.kind === "trapezoidfinset")).toBe(true);
  });

  it("refuses to stage on a weight it can't make sense of", () => {
    // A stack weight at or below the sustainer's would give the booster zero or negative mass.
    const bad = SIM.replace("<Booster1LaunchWt>14</Booster1LaunchWt>", "<Booster1LaunchWt>9</Booster1LaunchWt>");
    const doc = adaptRasAeroXml(staged(bad));
    expect(doc.rocket.stages).toHaveLength(1);
    expect(doc.flownAsReduced).toBe(true);
    expect(doc.warnings.join(" ")).toMatch(/booster stage/i);
  });

  it("says so when its simulations disagree about the airframe, and names the one being flown", () => {
    // **A `.CDX1` states the stack's weight and balance PER SIMULATION; Loft flies one airframe.**
    // So simulation 1's figures are used under every configuration the file offers, and a flyer who
    // switches configuration changes the motors and nothing else. Measured on the corpus: 2 of the 4
    // RASAero designs disagree with themselves this way — `Complex.Two-Stage.CDX1` by 41 g and 6 mm,
    // `Show-off.CDX1` by a full inch of balance point.
    const two = DESIGN.replace(
      "</Simulation>\n  </SimulationList>",
      `</Simulation>
    <Simulation>
      <SustainerEngine>J350W  (AT)</SustainerEngine>
      <SustainerLaunchWt>35.1</SustainerLaunchWt>
      <SustainerCG>41.90</SustainerCG>
      <SustainerIgnitionDelay>0</SustainerIgnitionDelay>
    </Simulation>
  </SimulationList>`,
    );
    const doc = adaptRasAeroXml(two);
    expect(doc.rocket.configurations.length, "both simulations are offered").toBe(2);
    const w = doc.warnings.join(" ");
    expect(w, "the disagreement is stated").toMatch(/different launch weight or balance point/i);
    // It names the figures actually being flown, so the flyer can tell which of the two they have.
    expect(w).toMatch(/37\.80 lb at 43\.82 in/);
    expect(w).toMatch(/changes the motors and not the airframe/i);
  });

  it("stays quiet when every simulation states the same airframe", () => {
    // The other half of the claim, and the one that stops the warning becoming noise a flyer learns
    // to ignore: a file with two simulations that agree gets nothing. `MAINTAINING.md` — "a flag that
    // cries wolf teaches flyers to ignore it".
    const same = DESIGN.replace(
      "</Simulation>\n  </SimulationList>",
      `</Simulation>
    <Simulation>
      <SustainerEngine>J350W  (AT)</SustainerEngine>
      <SustainerLaunchWt>37.8</SustainerLaunchWt>
      <SustainerCG>43.82</SustainerCG>
      <SustainerIgnitionDelay>0</SustainerIgnitionDelay>
    </Simulation>
  </SimulationList>`,
    );
    const doc = adaptRasAeroXml(same);
    expect(doc.rocket.configurations.length).toBe(2);
    expect(doc.warnings.join(" ")).not.toMatch(/different launch weight or balance point/i);
  });

  it("doesn't stage a simulation that excludes the booster", () => {
    const off = SIM.replace("<IncludeBooster1>True</IncludeBooster1>", "<IncludeBooster1>False</IncludeBooster1>");
    const doc = adaptRasAeroXml(staged(off));
    expect(doc.rocket.stages).toHaveLength(1);
    expect(doc.flownAsReduced).toBe(true);
  });

  it("flies the stack and drops the booster partway up", () => {
    const doc = adaptRasAeroXml(staged(SIM));
    const run = runFromDocument(doc);
    expect(run.hasPropulsion).toBe(true);
    const sep = run.result.events.find((e) => e.type === "separation");
    const apogee = run.result.events.find((e) => e.type === "apogee")!;
    expect(sep).toBeDefined();
    expect(sep!.time).toBeLessThan(apogee.time);
  });
});
