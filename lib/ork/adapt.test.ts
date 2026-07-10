import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adaptOrkXml } from "./adapt";
import { importOrk } from "./import";
import { flattenRocket, referenceRadius } from "../model/geometry";
import { barrowman } from "../sim/aero";

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

  it("derives a freeform fin's span, root chord and area from its outline points", () => {
    // A freeform fin carries NO <rootchord>/<height> — only <finpoints>. If those aren't
    // derived, the fin reads as zero-span and contributes no normal force, so a design flips
    // to wildly unstable (real regression: a competition design read as -9.5 cal). Triangle:
    // root leading edge (0,0), tip (0.05,0.06), root trailing edge (0.09,0).
    const finpoints =
      "<finpoints><point x='0' y='0'/><point x='0.05' y='0.06'/><point x='0.09' y='0'/></finpoints>";
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>FF</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.15</length><aftradius>0.025</aftradius><shape>ogive</shape></nosecone>
            <bodytube><length>0.6</length><radius>0.025</radius><thickness>0.001</thickness><subcomponents>
              <freeformfinset><fincount>3</fincount><thickness>0.003</thickness>${finpoints}</freeformfinset>
            </subcomponents></bodytube>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    const doc = adaptOrkXml(xml);
    const fin = flattenRocket(doc.rocket).find((p) => p.component.kind === "freeformfinset")!.component;
    expect(fin.kind).toBe("freeformfinset");
    if (fin.kind === "freeformfinset") {
      expect(fin.finCount).toBe(3);
      expect(fin.height).toBeCloseTo(0.06, 6); // semi-span = max y
      expect(fin.rootChord).toBeCloseTo(0.09, 6); // root edge x-extent at y≈0
      expect(fin.area).toBeCloseTo(0.5 * 0.09 * 0.06, 6); // triangle area
    }
  });

  it("a freeform fin set actually contributes to stability (moves CP aft)", () => {
    const finpoints =
      "<finpoints><point x='0' y='0'/><point x='0.05' y='0.06'/><point x='0.09' y='0'/></finpoints>";
    const body = (fins: string) => `<?xml version='1.0'?>
      <openrocket version="1.10"><rocket><name>x</name><subcomponents><stage><subcomponents>
        <nosecone><length>0.15</length><aftradius>0.025</aftradius><shape>ogive</shape></nosecone>
        <bodytube><length>0.6</length><radius>0.025</radius><thickness>0.001</thickness><subcomponents>${fins}</subcomponents></bodytube>
      </subcomponents></stage></subcomponents></rocket></openrocket>`;
    const finless = barrowman(adaptOrkXml(body("")).rocket);
    const withFins = barrowman(
      adaptOrkXml(body(`<freeformfinset><fincount>3</fincount><thickness>0.003</thickness>${finpoints}</freeformfinset>`)).rocket,
    );
    expect(withFins.cnAlpha).toBeGreaterThan(finless.cnAlpha + 2); // fins add real normal force
    expect(withFins.cp).toBeGreaterThan(finless.cp); // CP moves aft — the rocket is more stable
  });

  it("captures launch-lug and rail-button frontal size for protuberance drag", () => {
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>Lugged</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.1</length><aftradius>0.025</aftradius><shape>ogive</shape></nosecone>
            <bodytube><length>0.4</length><radius>0.025</radius><thickness>0.001</thickness><subcomponents>
              <launchlug><radius>0.004</radius><length>0.03</length><thickness>0.0005</thickness></launchlug>
              <railbutton><outerdiameter>0.01</outerdiameter><height>0.006</height><instancecount>2</instancecount></railbutton>
            </subcomponents></bodytube>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    const doc = adaptOrkXml(xml);
    const flat = flattenRocket(doc.rocket);
    const lug = flat.find((p) => p.component.kind === "launchlug")!.component;
    const button = flat.find((p) => p.component.kind === "railbutton")!.component;
    expect("radius" in lug && lug.radius).toBeCloseTo(0.004, 6);
    expect("radius" in button && button.radius).toBeCloseTo(0.005, 6); // OD 10 mm → r 5 mm
    expect("instanceCount" in button && button.instanceCount).toBe(2);
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

  it("falls back to the largest known radius when a whole airframe is auto", () => {
    // A body whose only dimensioned radius is a boat-tail's aft end (its fore is auto, so it
    // can't seed the tubes ahead of it): every tube and the nose base are "auto" with no
    // neighbour to inherit from. Rather than collapse the airframe to zero — which would fly it
    // as a drag-free, near-massless needle with a borrowed reference area — the tubes take the
    // rocket's largest known radius so the model stays self-consistent and is flagged.
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>AllAuto</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.15</length><aftradius>auto</aftradius><shape>ogive</shape></nosecone>
            <bodytube><length>0.3</length><radius>auto</radius></bodytube>
            <transition><length>0.05</length><foreradius>auto</foreradius><aftradius>0.02</aftradius><shape>conical</shape></transition>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    const doc = adaptOrkXml(xml);
    const flat = flattenRocket(doc.rocket);
    const tube = flat.find((p) => p.component.kind === "bodytube")!.component;
    const nose = flat.find((p) => p.component.kind === "nosecone")!.component;
    // The 20 mm boat-tail aft is the only dimensioned radius, so it becomes the airframe's size.
    if (tube.kind === "bodytube") expect(tube.outerRadius).toBeCloseTo(0.02, 4);
    if (nose.kind === "nosecone") expect(nose.aftRadius).toBeCloseTo(0.02, 4);
    expect(referenceRadius(doc.rocket)).toBeCloseTo(0.02, 4);
    // The substitution is surfaced, not silent.
    expect(doc.warnings.some((w) => /largest known radius/i.test(w))).toBe(true);
  });

  it("gives a shock cord and launch lug their material mass (OpenRocket stores no explicit mass)", () => {
    // The shock cord's line material is kg/m ⇒ mass = density × cord length; the lug's bulk
    // material is kg/m³ ⇒ mass over its tube-wall volume. Both are stored as material+geometry,
    // not an explicit <mass>, so dropping them would silently lose real (CG-shifting) mass.
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>Harness</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.1</length><aftradius>0.025</aftradius><shape>ogive</shape></nosecone>
            <bodytube><length>0.4</length><radius>0.025</radius><subcomponents>
              <shockcord><cordlength>5.0</cordlength><packedlength>0.06</packedlength>
                <material type="line" density="0.02">Tubular nylon</material></shockcord>
              <launchlug><length>0.05</length><radius>0.006</radius><thickness>0.001</thickness>
                <material type="bulk" density="1200">Plastic</material></launchlug>
            </subcomponents></bodytube>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    const doc = adaptOrkXml(xml);
    const flat = flattenRocket(doc.rocket);
    const cord = flat.find((p) => p.component.kind === "shockcord")!.component;
    const lug = flat.find((p) => p.component.kind === "launchlug")!.component;
    // 5 m of 0.02 kg/m line = 100 g — a real high-power harness mass, not a rounding error.
    if (cord.kind === "shockcord") expect(cord.mass).toBeCloseTo(0.1, 4);
    // π(0.006² − 0.005²) × 0.05 × 1200 ≈ 2.07 g.
    if (lug.kind === "launchlug") expect(lug.mass!).toBeCloseTo(Math.PI * (0.006 ** 2 - 0.005 ** 2) * 0.05 * 1200, 5);
  });

  it("lets an explicit shock-cord mass override the material computation", () => {
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>Explicit</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.1</length><aftradius>0.025</aftradius><shape>ogive</shape></nosecone>
            <bodytube><length>0.4</length><radius>0.025</radius><subcomponents>
              <shockcord><cordlength>5.0</cordlength><mass>0.03</mass>
                <material type="line" density="0.02">Tubular nylon</material></shockcord>
            </subcomponents></bodytube>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    const cord = flattenRocket(adaptOrkXml(xml).rocket).find((p) => p.component.kind === "shockcord")!.component;
    if (cord.kind === "shockcord") expect(cord.mass).toBeCloseTo(0.03, 4);
  });

  it("reads the fin edge cross-section", () => {
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>Fins</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.1</length><aftradius>0.02</aftradius><shape>ogive</shape></nosecone>
            <bodytube><length>0.3</length><radius>0.02</radius><subcomponents>
              <trapezoidfinset><fincount>3</fincount><rootchord>0.05</rootchord><tipchord>0.03</tipchord>
                <height>0.04</height><thickness>0.003</thickness><crosssection>airfoil</crosssection></trapezoidfinset>
            </subcomponents></bodytube>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    const doc = adaptOrkXml(xml);
    const fins = flattenRocket(doc.rocket).find((p) => p.component.kind === "trapezoidfinset")!.component;
    if (fins.kind === "trapezoidfinset") expect(fins.crossSection).toBe("airfoil");
  });

  it("reads a motor cluster count onto the mount and does not treat it as reduced", () => {
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
    const inner = flattenRocket(doc.rocket).find((p) => p.component.kind === "innertube")!.component;
    if (inner.kind === "innertube") expect(inner.motorMount?.clusterCount).toBe(4);
    // A cluster is simulated (not simplified), so it isn't flagged reduced.
    expect(doc.flownAsReduced).toBe(false);
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
    const inner = flattenRocket(doc.rocket).find((p) => p.component.kind === "innertube")!.component;
    // "single" is not a cluster: no count set, and the flight isn't flagged reduced.
    if (inner.kind === "innertube") expect(inner.motorMount?.clusterCount).toBeUndefined();
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
