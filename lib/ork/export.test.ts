import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importOrk } from "./import";
import { exportOrk, serializeRocketXml } from "./export";
import { newDesign } from "../model/starter";
import { runFlight } from "../sim/run";
import { structurePointMasses } from "../sim/mass";
import type { OrkDocument } from "./adapt";

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
