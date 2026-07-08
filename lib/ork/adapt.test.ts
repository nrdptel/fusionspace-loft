import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adaptOrkXml } from "./adapt";
import { importOrk } from "./import";
import { flattenRocket } from "../model/geometry";

const readXml = (name: string) =>
  readFileSync(resolve(process.cwd(), "fixtures/src", name), "utf-8");

describe("adaptOrkXml — single deploy fixture", () => {
  const doc = adaptOrkXml(readXml("demo-single-deploy.ork.xml"));

  it("reads the rocket, stage, and format version", () => {
    expect(doc.formatVersion).toBe("1.10");
    expect(doc.rocket.name).toContain("Loft Demo");
    expect(doc.rocket.stages).toHaveLength(1);
    expect(doc.warnings).toEqual([]);
  });

  it("builds the component tree", () => {
    const kinds = flattenRocket(doc.rocket).map((p) => p.component.kind);
    expect(kinds).toContain("nosecone");
    expect(kinds).toContain("bodytube");
    expect(kinds).toContain("innertube");
    expect(kinds).toContain("trapezoidfinset");
    expect(kinds).toContain("parachute");
    expect(kinds).toContain("masscomponent");
    expect(kinds.filter((k) => k === "centeringring")).toHaveLength(2);
  });

  it("resolves the motor configuration", () => {
    expect(doc.rocket.configurations).toHaveLength(1);
    const cfg = doc.rocket.configurations[0];
    expect(doc.rocket.defaultConfigId).toBe(cfg.id);
    expect(cfg.instances).toHaveLength(1);
    expect(cfg.instances[0].motor.designation).toBe("H128W");
    expect(cfg.instances[0].motor.manufacturer).toBe("AeroTech");
    expect(cfg.instances[0].motor.diameter).toBeCloseTo(0.029, 4);
  });

  it("reads the stored flight results", () => {
    expect(doc.simulations).toHaveLength(1);
    const sim = doc.simulations[0];
    expect(sim.hasResults).toBe(true);
    expect(sim.results.maxAltitude).toBe(980);
    expect(sim.results.maxMach).toBe(0.55);
    expect(sim.conditions.rodLength).toBe(1.2);
  });
});

describe("adaptOrkXml — dual deploy fixture", () => {
  const doc = adaptOrkXml(readXml("demo-dual-deploy.ork.xml"));

  it("reads two parachutes with distinct deploy events", () => {
    const chutes = flattenRocket(doc.rocket)
      .map((p) => p.component)
      .filter((c) => c.kind === "parachute");
    expect(chutes).toHaveLength(2);
    const events = chutes.map((c) => (c.kind === "parachute" ? c.deployEvent : "")).sort();
    expect(events).toEqual(["altitude", "apogee"]);
  });

  it("has a K550W motor", () => {
    expect(doc.rocket.configurations[0].instances[0].motor.designation).toBe("K550W");
  });
});

describe("graceful degradation", () => {
  it("skips unknown components with a warning instead of throwing", () => {
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>Odd</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.1</length><aftradius>0.02</aftradius><shape>ogive</shape></nosecone>
            <warpdrive><power>9000</power></warpdrive>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    const doc = adaptOrkXml(xml);
    expect(doc.rocket.stages[0].components).toHaveLength(1);
    expect(doc.warnings.join(" ")).toContain("warpdrive");
  });

  it("rejects a non-OpenRocket root", () => {
    expect(() => adaptOrkXml("<html></html>")).toThrow(/OpenRocket/);
  });
});

describe("importOrk (zip → model)", () => {
  it("imports the zipped .ork binary", async () => {
    const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const doc = await importOrk(bytes);
    expect(doc.rocket.name).toContain("Loft Demo");
    expect(doc.rocket.configurations[0].instances[0].motor.designation).toBe("H128W");
  });
});
