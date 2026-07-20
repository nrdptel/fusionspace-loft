import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importOrk } from "./import";
import { exportOrk, serializeRocketXml } from "./export";
import { newDesign } from "../model/starter";
import { applyGeometryEdits } from "../model/edit";
import { runFlight } from "../sim/run";
import { structurePointMasses } from "../sim/mass";
import type { OrkDocument } from "./adapt";
import type { NoseCone, BodyTube, MassComponent, Parachute, InnerTube, TrapezoidFinSet, MinorComponent } from "../model/types";

function flight(doc: OrkDocument) {
  const run = runFlight(doc.rocket, {
    configId: doc.rocket.defaultConfigId ?? doc.rocket.configurations[0]?.id,
  });
  return {
    apogee: run.result.summary.apogee,
    maxVelocity: run.result.summary.maxVelocity,
    dryMass: structurePointMasses(doc.rocket).reduce((a, m) => a + m.mass, 0),
    hasPropulsion: run.hasPropulsion,
  };
}

const load = (name: string) => importOrk(new Uint8Array(readFileSync(resolve(`fixtures/${name}`))));

describe("exportOrk — serialize the internal model back to .ork", () => {
  it("emits a valid store-only ZIP containing rocket.ork", () => {
    const bytes = exportOrk(newDesign());
    // ZIP local-file-header magic 'PK\x03\x04'.
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    // Central directory names the single entry.
    expect(new TextDecoder().decode(bytes)).toContain("rocket.ork");
  });

  it("serializes OpenRocket 1.10 XML with the design's name", () => {
    const xml = serializeRocketXml(newDesign().rocket);
    expect(xml).toContain('<openrocket version="1.10"');
    expect(xml).toContain("<name>New design</name>");
    expect(xml).toContain("<motorconfiguration");
    expect(xml).toContain("<designation>H128W</designation>");
    // Deterministic — the same design serializes identically (no wall-clock, stable ids).
    expect(serializeRocketXml(newDesign().rocket)).toBe(xml);
  });

  it("round-trips the from-scratch starter through export → import with the flight preserved", async () => {
    const before = flight(newDesign());
    const after = flight(await importOrk(exportOrk(newDesign())));
    expect(after.hasPropulsion).toBe(true);
    expect(after.apogee).toBeCloseTo(before.apogee, 1);
    expect(after.maxVelocity).toBeCloseTo(before.maxVelocity, 1);
    expect(after.dryMass).toBeCloseTo(before.dryMass, 6);
  });

  // Every bundled design — including elliptical fins, a boattail transition, a motor cluster, and a
  // multi-stage payload — must survive a round-trip with its flight intact. This is the real test:
  // the exporter matches exactly what the importer reads.
  for (const name of [
    "demo-single-deploy.ork",
    "demo-dual-deploy.ork",
    "demo-boattail.ork",
    "demo-multi-config.ork",
    "demo-payload-separation.ork",
    "demo-quirks.ork",
  ]) {
    it(`round-trips ${name} with apogee and mass preserved`, async () => {
      const doc = await load(name);
      const before = flight(doc);
      const after = flight(await importOrk(exportOrk(doc)));
      expect(after.apogee).toBeCloseTo(before.apogee, 0);
      expect(after.maxVelocity).toBeCloseTo(before.maxVelocity, 0);
      expect(after.dryMass).toBeCloseTo(before.dryMass, 4);
    });
  }
});

describe("exportOrk — real-design features round-trip (regression)", () => {
  // Helpers to reach the starter's parts, then round-trip a mutated design and re-read it.
  const parts = (doc: OrkDocument) => {
    const [nose, body] = doc.rocket.stages[0].components as [NoseCone, BodyTube];
    const [avionics, chute, mount, fins] = body.children as [MassComponent, Parachute, InnerTube, TrapezoidFinSet];
    return { nose, body, avionics, chute, mount, fins };
  };
  const roundtrip = async (doc: OrkDocument) => importOrk(exportOrk(doc));

  it("preserves a motor cluster's count (thrust), not just one motor", async () => {
    const doc = newDesign();
    parts(doc).mount.motorMount!.clusterCount = 4; // fly the single motor as 4 coaxial
    const before = flight(doc);
    const back = await roundtrip(doc);
    const mount = parts(back).mount;
    expect(mount.motorMount!.clusterCount).toBe(4);
    // 4 motors ⇒ much higher apogee than 1; the count must survive or thrust collapses.
    expect(flight(back).apogee).toBeCloseTo(before.apogee, 0);
  });

  it("preserves a stage-level mass override (a measured whole-section weight)", async () => {
    const doc = newDesign();
    doc.rocket.stages[0].overrideMass = 1.5;
    doc.rocket.stages[0].overrideSubcomponents = true;
    const back = await roundtrip(doc);
    expect(back.rocket.stages[0].overrideMass).toBeCloseTo(1.5, 6);
    expect(back.rocket.stages[0].overrideSubcomponents).toBe(true);
    expect(structurePointMasses(back.rocket).reduce((a, m) => a + m.mass, 0)).toBeCloseTo(1.5, 3);
  });

  it("preserves a per-configuration deployment override (right deploy time)", async () => {
    const doc = newDesign();
    parts(doc).chute.deployConfigs = { "cfg-1": { event: "altitude", altitude: 150, delay: 0 } };
    const back = await roundtrip(doc);
    const chute = parts(back).chute;
    expect(chute.deployConfigs?.["cfg-1"]?.event).toBe("altitude");
    expect(chute.deployConfigs?.["cfg-1"]?.altitude).toBeCloseTo(150, 3);
  });

  it("preserves a nose-cone shoulder's mass", async () => {
    const doc = newDesign();
    const n = parts(doc).nose;
    n.aftShoulderLength = 0.06;
    n.aftShoulderRadius = 0.026;
    n.aftShoulderThickness = 0.002;
    const before = structurePointMasses(doc.rocket).reduce((a, m) => a + m.mass, 0);
    const back = await roundtrip(doc);
    expect(parts(back).nose.aftShoulderLength).toBeCloseTo(0.06, 6);
    expect(structurePointMasses(back.rocket).reduce((a, m) => a + m.mass, 0)).toBeCloseTo(before, 4);
  });

  it("round-trips a builder airframe-material swap (mass preserved)", async () => {
    const doc = newDesign();
    const rocket = applyGeometryEdits(doc.rocket, { airframeMaterial: "carbon" });
    const before = flight({ ...doc, rocket });
    const back = await importOrk(exportOrk({ ...doc, rocket }));
    // The shell material name survives on the body tube, and the flown mass round-trips.
    const body = back.rocket.stages
      .flatMap((s) => s.components)
      .find((c) => c.kind === "bodytube") as { material?: { name: string } } | undefined;
    expect(body?.material?.name).toBe("carbon fibre");
    expect(flight(back).dryMass).toBeCloseTo(before.dryMass, 4);
  });

  it("round-trips a builder dual-deploy (main-at-altitude + drogue)", async () => {
    const doc = newDesign();
    const rocket = applyGeometryEdits(doc.rocket, { mainDeployAltitude: 150, drogueDiameter: 0.3 });
    const back = await importOrk(exportOrk({ ...doc, rocket }));
    const chutes = back.rocket.stages
      .flatMap((s) => s.components)
      .flatMap(function walk(c): typeof c[] {
        return [c, ...c.children.flatMap(walk)];
      })
      .filter((c): c is Parachute => c.kind === "parachute");
    expect(chutes).toHaveLength(2);
    const main = chutes.find((c) => c.deployEvent === "altitude")!;
    const drogue = chutes.find((c) => c.deployEvent === "apogee")!;
    expect(main).toBeTruthy();
    expect(main.deployAltitude).toBeCloseTo(150, 3);
    expect(drogue.diameter).toBeCloseTo(0.3, 4);
  });

  it("round-trips a builder-added boattail with its base-drag benefit", async () => {
    // Add a boattail (the builder's first structural add), save, and re-open: the transition must
    // survive so the saved design keeps flying with the reduced base drag.
    const doc = newDesign();
    const rocket = applyGeometryEdits(doc.rocket, { boattailLength: 0.06, boattailAftDiameter: 0.03 });
    const before = flight({ ...doc, rocket });
    const back = await importOrk(exportOrk({ ...doc, rocket }));
    const bt = back.rocket.stages.flatMap((s) => s.components).find((c) => c.kind === "transition") as
      | { shape: string; foreRadius: number; aftRadius: number }
      | undefined;
    expect(bt).toBeTruthy();
    expect(bt!.shape).toBe("conical");
    expect(bt!.aftRadius).toBeLessThan(bt!.foreRadius);
    const after = flight(back);
    expect(after.apogee).toBeCloseTo(before.apogee, 0);
  });

  it("preserves a per-configuration stage-separation override", async () => {
    const doc = newDesign();
    // Give the (single) stage a per-config separation override and round-trip it. Even on a
    // one-stage design the block must survive, since it's what a multi-stage design relies on to
    // drop its booster at the right instant per motor config.
    doc.rocket.stages[0].separationConfigs = {
      "cfg-1": { event: "upperignition", delay: 0 },
      "cfg-2": { event: "burnout", delay: 1.5 },
    };
    const back = await roundtrip(doc);
    const sc = back.rocket.stages[0].separationConfigs;
    expect(sc?.["cfg-1"]?.event).toBe("upperignition");
    expect(sc?.["cfg-2"]?.event).toBe("burnout");
    expect(sc?.["cfg-2"]?.delay).toBeCloseTo(1.5, 6);
  });

  it("preserves a launch lug's mass and count", async () => {
    const doc = newDesign();
    const lug: MinorComponent = {
      id: "lug", name: "Launch lug", kind: "launchlug",
      placement: { method: "bottom", offset: -0.1 },
      mass: 0.012, radius: 0.004, length: 0.05, instanceCount: 2, children: [],
    };
    parts(doc).body.children.push(lug);
    const before = structurePointMasses(doc.rocket).reduce((a, m) => a + m.mass, 0);
    const back = await roundtrip(doc);
    const backLug = parts(back).body.children.find((c) => c.kind === "launchlug") as MinorComponent | undefined;
    expect(backLug).toBeTruthy();
    expect(backLug!.mass).toBeCloseTo(0.012, 5);
    expect(structurePointMasses(back.rocket).reduce((a, m) => a + m.mass, 0)).toBeCloseTo(before, 4);
  });
});
