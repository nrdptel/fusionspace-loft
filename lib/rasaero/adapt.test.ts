import { describe, it, expect } from "vitest";
import { adaptRasAeroXml, airframeMass, parseEngineName } from "./adapt";
import { adaptDesignXml } from "../ork/import";
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
    expect(doc.warnings.join(" ")).toMatch(/no materials or per-part masses/);
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

  it("flags a design with RASAero boosters as flown reduced", () => {
    const staged = DESIGN.replace(
      "<Surface>Smooth Paint</Surface>",
      `<Booster><PartType>Booster</PartType><Length>24</Length><Diameter>4</Diameter><Location>68</Location></Booster>
       <Surface>Smooth Paint</Surface>`,
    );
    const d = adaptRasAeroXml(staged);
    expect(d.flownAsReduced).toBe(true);
    expect(d.warnings.join(" ")).toMatch(/booster stages/);
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

  it("degrades rather than throwing on a design with no simulations", () => {
    const bare = DESIGN.replace(/<SimulationList>[\s\S]*<\/SimulationList>/, "<SimulationList />");
    const d = adaptRasAeroXml(bare);
    expect(d.simulations).toHaveLength(0);
    expect(d.warnings.join(" ")).toMatch(/no launch weight/);
    // No motor, so the run layer withholds the flight rather than reporting a zero-altitude one.
    expect(runFromDocument(d).hasPropulsion).toBe(false);
  });
});
