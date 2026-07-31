import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importOrk } from "./import";
import { exportOrk, serializeRocketXml } from "./export";
import { newDesign } from "../model/starter";
import { applyGeometryEdits } from "../model/edit";
import { runFlight } from "../sim/run";
import { combine, structurePointMasses } from "../sim/mass";
import type { OrkDocument } from "./adapt";
import type { NoseCone, BodyTube, MassComponent, Parachute, InnerTube, TrapezoidFinSet, GenericFinSet, MinorComponent } from "../model/types";

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

  /** A fin set by its name, anywhere in the tree. A freeform set is written as a `trapezoidfinset`,
   *  so the KIND changes across the round trip and only the name is stable to look it up by. */
  const finByName = (doc: OrkDocument, name: string): TrapezoidFinSet | undefined => {
    const walk = (cs: readonly { name: string; children?: readonly unknown[] }[]): unknown => {
      for (const c of cs) {
        if (c.name === name) return c;
        const kids = (c as { children?: readonly { name: string }[] }).children;
        if (kids) {
          const hit = walk(kids as never);
          if (hit) return hit;
        }
      }
      return undefined;
    };
    return doc.rocket.stages.map((s) => walk(s.components as never)).find(Boolean) as TrapezoidFinSet | undefined;
  };

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

  it("preserves a canopy's PACKED dimensions, which are where its mass sits", async () => {
    // `lib/sim/mass.ts` places a packed canopy's CG at half its packed length, and the parachute and
    // streamer writers emitted neither `packedlength` nor `packedradius` while `masscomponent` and
    // `shockcord` both did. So a downloaded design re-opened with every canopy's mass moved forward
    // to the front face of its bay. Measured across the 35-design corpus before the fix: the balance
    // moved on 28 of 35 designs and static margin — a number a flyer acts on — moved by more than
    // 0.005 cal on 21 of them, worst 0.64 cal.
    const doc = newDesign();
    const chute = parts(doc).chute;
    chute.packedLength = 0.12;
    chute.packedRadius = 0.018;
    const cgBefore = combine(structurePointMasses(doc.rocket)).cg;

    const back = await roundtrip(doc);
    const backChute = parts(back).chute;
    expect(backChute.packedLength).toBeCloseTo(0.12, 6);
    expect(backChute.packedRadius).toBeCloseTo(0.018, 6);
    // The point of the field: the whole design still balances where it did.
    expect(combine(structurePointMasses(back.rocket)).cg).toBeCloseTo(cgBefore, 6);
  });

  it("keeps a hard-tapered freeform fin's ROOT and POSITION, and does not chase its area", async () => {
    // A freeform outline is not retained, so the export writes the equal-area trapezoid:
    // tip = 2·area/height − root. That solution is NEGATIVE once the planform tapers hard, and the
    // tip is then clamped to zero while the root is kept — so the exported fin is larger in area than
    // the one drawn. This asserts that deliberate choice, because the obvious alternative is worse:
    // shrinking the root to 2·area/height writes a root of ZERO for a zero-area planform, and
    // `finContribution` drops a fin set with no root, so the set disappears from lift and drag
    // altogether. It also moves the fin, since a fin set's axial length IS its root chord — measured
    // on `Pods--airframes and winglets.ork`, the "Wings" set translated 52.4 mm aft under its
    // `bottom` anchor. Tried and reverted 2026-07-31; the real fix is to round-trip `<finpoints>`,
    // which is R6's and is filed.
    const doc = newDesign();
    const body = parts(doc).body;
    const height = 0.05;
    const rootChord = 0.06;
    const area = 0.0004; // 2·area/height = 0.016 m, well under the root
    body.children.push({
      kind: "freeformfinset",
      id: "ff-hard-taper",
      name: "Hard taper",
      finCount: 3,
      thickness: 0.003,
      rootChord,
      height,
      sweepLength: 0.02,
      area,
      children: [],
      placement: { method: "bottom", offset: 0 },
    } as unknown as GenericFinSet);

    const back = await roundtrip(doc);
    const out = finByName(back, "Hard taper")!;
    // The root survives, so the fin stays the length it was and stays where it was put.
    expect(out.rootChord).toBeCloseTo(rootChord, 9);
    expect(out.tipChord).toBeCloseTo(0, 9);
    expect(out.height).toBeCloseTo(height, 9);
    // And the cost is stated rather than hidden: the exported area is larger than the drawn one.
    const exported = ((out.rootChord + out.tipChord) / 2) * out.height;
    expect(exported).toBeGreaterThan(area);
    expect(exported).toBeCloseTo((rootChord * height) / 2, 9);
  });

  it("leaves a gently-tapered freeform fin's trapezoid exact", async () => {
    // Where the tip solution is positive there is no loss at all: area, span and sweep all survive.
    const doc = newDesign();
    const body = parts(doc).body;
    const height = 0.05;
    const rootChord = 0.02;
    const area = 0.0009; // 2·area/height = 0.036 ⇒ tip = 0.016, comfortably positive
    body.children.push({
      kind: "freeformfinset",
      id: "ff-gentle",
      name: "Gentle taper",
      finCount: 3,
      thickness: 0.003,
      rootChord,
      height,
      sweepLength: 0.01,
      area,
      children: [],
      placement: { method: "bottom", offset: 0 },
    } as unknown as GenericFinSet);

    const back = await roundtrip(doc);
    const out = finByName(back, "Gentle taper")!;
    expect(out.rootChord).toBeCloseTo(rootChord, 9);
    expect(out.tipChord).toBeCloseTo((2 * area) / height - rootChord, 9);
    expect(((out.rootChord + out.tipChord) / 2) * out.height).toBeCloseTo(area, 9);
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

  it("round-trips a builder main-parachute resize (canopy diameter + mass preserved)", async () => {
    const doc = newDesign();
    const d0 = parts(doc).chute.diameter;
    const target = d0 * 1.5;
    const rocket = applyGeometryEdits(doc.rocket, { mainParachuteDiameter: target });
    const before = flight({ ...doc, rocket });
    const back = await importOrk(exportOrk({ ...doc, rocket }));
    const chute = parts(back).chute;
    // The resized canopy diameter survives, and its heavier (∝ area) mass round-trips too.
    expect(chute.diameter).toBeCloseTo(target, 4);
    expect(flight(back).dryMass).toBeCloseTo(before.dryMass, 4);
  });

  it("round-trips a builder motor-cluster edit (count preserved ⇒ same thrust)", async () => {
    const doc = newDesign();
    const rocket = applyGeometryEdits(doc.rocket, { motorClusterCount: 3 });
    const before = flight({ ...doc, rocket });
    const back = await importOrk(exportOrk({ ...doc, rocket }));
    // The cluster count survives, so the re-imported design flies the same three-motor thrust.
    expect(parts(back).mount.motorMount!.clusterCount).toBe(3);
    expect(flight(back).apogee).toBeCloseTo(before.apogee, 0);
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

  it("keeps the mass a design STATED for a part, rather than the one Loft computes", async () => {
    // Six element kinds were written without their `<overridemass>` — mass objects, parachutes,
    // streamers, lugs, rail buttons and shock cords — so a stated mass was silently replaced on a
    // round trip by the one Loft derives from the part's material. Measured across the 27 real `.ork`
    // designs in the corpus: 5 changed dry mass on a download → re-import, and on `USLI2025-FULLSCALE`
    // the shock cord's stated 304.0 g came back as its computed 2,220.7 g — 12,620.2 g → 14,528.7 g,
    // +15.1% on the whole design, with the CG moving 60.8 mm and nothing said anywhere.
    //
    // A stated mass is something the flyer put on a scale; a computed one is a guess from a density.
    // The shock cord is the sharpest case because a long tubular-nylon harness computes enormous.
    const doc = newDesign();
    const tube = doc.rocket.stages[0].components.find((c) => c.kind === "bodytube") as BodyTube;
    const cord: MinorComponent = {
      id: "8e0f9b62-3a5c-4d71-9c2e-1f0a7b4d5e63",
      name: "Harness",
      kind: "shockcord",
      placement: { method: "top", offset: 0.1 },
      // What the material would compute to, and what the flyer actually weighed.
      mass: 2.2207,
      overrideMass: 0.304,
      children: [],
    };
    const ballast: MassComponent = {
      id: "5b1c7d90-64ae-4f28-8d13-90c6e2a4f7b1",
      name: "Nose weight",
      kind: "masscomponent",
      placement: { method: "top", offset: 0.05 },
      mass: 0.02,
      overrideMass: 0.05,
      children: [],
    };
    const rocket = {
      ...doc.rocket,
      stages: doc.rocket.stages.map((s) => ({
        ...s,
        components: s.components.map((c) => (c.id === tube.id ? { ...c, children: [...c.children, cord, ballast] } : c)),
      })),
    };
    const before = flight({ ...doc, rocket });
    const back = await importOrk(exportOrk({ ...doc, rocket }));
    const find = (id: string) =>
      back.rocket.stages
        .flatMap((s) => s.components)
        .flatMap((c) => [c, ...c.children])
        .find((c) => c.id === id);
    expect(find(cord.id)?.overrideMass).toBeCloseTo(0.304, 6);
    expect(find(ballast.id)?.overrideMass).toBeCloseTo(0.05, 6);
    // And the number that actually matters: the design still weighs what it weighed.
    expect(flight(back).dryMass).toBeCloseTo(before.dryMass, 6);
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
