import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adaptOrkXml } from "./adapt";
import { importOrk } from "./import";
import { flattenRocket, referenceRadius } from "../model/geometry";

const readXml = (name: string) =>
  readFileSync(resolve(process.cwd(), "fixtures/src", name), "utf-8");

describe("adaptOrkXml — single deploy fixture", () => {
  const doc = adaptOrkXml(readXml("demo-single-deploy.ork.xml"));

  it("reads the rocket, stage, and format version", () => {
    expect(doc.formatVersion).toBe("1.10");
    expect(doc.rocket.name).toContain("Loft Demo");
    expect(doc.rocket.stages).toHaveLength(1);
    expect(doc.warnings).toEqual([]);
    // A complete single-stage design is not flown reduced, so its comparison is shown.
    expect(doc.flownAsReduced).toBe(false);
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

  it("resolves an internal part nested in a coupler, so one auto radius can't poison the model", () => {
    // A bulkhead with no radius, nested inside a tube coupler (not directly in the tube). It
    // must inherit the coupler's radius; if it stayed NaN it would poison the total mass and
    // the reference radius, collapsing the whole flight to zero.
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>Nested</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.1</length><aftradius>0.025</aftradius><shape>ogive</shape></nosecone>
            <bodytube><length>0.4</length><radius>0.025</radius><thickness>0.001</thickness><subcomponents>
              <tubecoupler><length>0.05</length><outerradius>0.024</outerradius><thickness>0.001</thickness><subcomponents>
                <bulkhead><length>0.002</length></bulkhead>
              </subcomponents></tubecoupler>
            </subcomponents></bodytube>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    const doc = adaptOrkXml(xml);
    const bulkhead = flattenRocket(doc.rocket).find((p) => p.component.kind === "bulkhead")!.component;
    expect(bulkhead.kind).toBe("bulkhead");
    if (bulkhead.kind === "bulkhead") {
      expect(Number.isFinite(bulkhead.outerRadius)).toBe(true);
      expect(bulkhead.outerRadius).toBeGreaterThan(0);
    }
    // The reference radius (and hence the whole simulation) stays finite.
    expect(Number.isFinite(referenceRadius(doc.rocket))).toBe(true);
  });

  it("zeroes a truly unresolvable internal radius rather than leaving it NaN", () => {
    // A bulkhead floating directly in the stage with nothing to fit inside: it can't be
    // resolved, but must be zeroed (and flagged), never left NaN to poison the flight.
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>Orphan</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.1</length><aftradius>0.025</aftradius><shape>ogive</shape></nosecone>
            <bulkhead><length>0.002</length></bulkhead>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    const doc = adaptOrkXml(xml);
    const bulkhead = flattenRocket(doc.rocket).find((p) => p.component.kind === "bulkhead")!.component;
    if (bulkhead.kind === "bulkhead") expect(bulkhead.outerRadius).toBe(0);
    expect(Number.isFinite(referenceRadius(doc.rocket))).toBe(true);
    expect(doc.warnings.some((w) => /auto|resolve/i.test(w))).toBe(true);
  });

  it("detects a motor cluster and flags the flight as reduced", () => {
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>Cluster</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.1</length><aftradius>0.02</aftradius><shape>ogive</shape></nosecone>
            <bodytube><length>0.3</length><radius>0.02</radius><subcomponents>
              <innertube>
                <length>0.07</length><radius>0.009</radius>
                <clusterconfiguration>4-ring</clusterconfiguration>
                <motormount><motor configid="c1"><designation>C6</designation></motor></motormount>
              </innertube>
            </subcomponents></bodytube>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    const doc = adaptOrkXml(xml);
    expect(doc.warnings.some((w) => /cluster/i.test(w))).toBe(true);
    expect(doc.flownAsReduced).toBe(true);
  });

  it("flags a tube-fin design as flown-reduced (fins skipped)", () => {
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>TubeFin</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.1</length><aftradius>0.02</aftradius><shape>ogive</shape></nosecone>
            <bodytube><length>0.3</length><radius>0.02</radius><subcomponents>
              <tubefinset><fincount>6</fincount><length>0.08</length><radius>0.02</radius></tubefinset>
            </subcomponents></bodytube>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    const doc = adaptOrkXml(xml);
    expect(doc.flownAsReduced).toBe(true);
    expect(doc.warnings.some((w) => /tubefinset/i.test(w))).toBe(true);
  });

  it("does not flag a plain single motor (clusterconfiguration = single) as a cluster", () => {
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>Solo</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.1</length><aftradius>0.02</aftradius><shape>ogive</shape></nosecone>
            <bodytube><length>0.3</length><radius>0.02</radius><subcomponents>
              <innertube>
                <length>0.07</length><radius>0.009</radius>
                <clusterconfiguration>single</clusterconfiguration>
                <motormount><motor configid="c1"><designation>C6</designation></motor></motormount>
              </innertube>
            </subcomponents></bodytube>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    const doc = adaptOrkXml(xml);
    expect(doc.warnings.some((w) => /cluster/i.test(w))).toBe(false);
    expect(doc.flownAsReduced).toBe(false);
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

describe("real-world quirks fixture (auto radii, legacy tags, boattail, pods)", () => {
  const doc = adaptOrkXml(readXml("demo-quirks.ork.xml"));
  const flat = flattenRocket(doc.rocket);
  const byName = (n: string) => flat.find((p) => p.component.name === n)!.component;

  it("resolves an auto body-tube radius from its neighbour", () => {
    // <radius>auto</radius> on the upper tube ⇒ the nose's 33 mm base radius.
    const upper = byName("Upper");
    expect(upper.kind).toBe("bodytube");
    if (upper.kind === "bodytube") expect(upper.outerRadius).toBeCloseTo(0.033, 4);
  });

  it("resolves an auto transition fore radius, keeping the explicit aft radius", () => {
    const shoulder = byName("Shoulder");
    expect(shoulder.kind).toBe("transition");
    if (shoulder.kind === "transition") {
      expect(shoulder.foreRadius).toBeCloseTo(0.033, 4); // from the upper tube
      expect(shoulder.aftRadius).toBeCloseTo(0.022, 4); // explicit boattail end
    }
  });

  it("fits an auto tube-coupler inside its enclosing tube", () => {
    const coupler = byName("Coupler");
    expect(coupler.kind).toBe("tubecoupler");
    if (coupler.kind === "tubecoupler") {
      expect(coupler.outerRadius).toBeGreaterThan(0.028);
      expect(coupler.outerRadius).toBeLessThanOrEqual(0.033);
    }
  });

  it("reads legacy element names (fincount, position) and an elliptical fin set", () => {
    const fins = byName("Ell fins");
    expect(fins.kind).toBe("ellipticalfinset");
    if (fins.kind === "ellipticalfinset") {
      expect(fins.finCount).toBe(4);
      expect(fins.area).toBeGreaterThan(0);
    }
    // legacy <position> placed the fins at a positive aft station.
    expect(flat.find((p) => p.component.name === "Ell fins")!.xFore).toBeGreaterThan(0.5);
  });

  it("parses a streamer as a recovery device", () => {
    const streamer = byName("Streamer");
    expect(streamer.kind).toBe("streamer");
  });

  it("warns about parallel stages rather than dropping them silently", () => {
    expect(doc.warnings.some((w) => /parallel/i.test(w))).toBe(true);
  });

  it("marks the import as flown-reduced (a parallel stage was dropped)", () => {
    expect(doc.flownAsReduced).toBe(true);
  });

  it("simulates to a plausible, stable flight after resolution", async () => {
    const { runFromDocument } = await import("../sim/run");
    const run = runFromDocument(doc);
    expect(run.result.summary.apogee).toBeGreaterThan(200);
    expect(run.result.summary.apogee).toBeLessThan(4000);
    expect(Number.isFinite(run.result.staticMarginCal)).toBe(true);
    expect(run.result.staticMarginCal).toBeGreaterThan(0);
    expect(run.resolutions[0].match?.entry.curve.designation).toBe("J420R");
  });
});
