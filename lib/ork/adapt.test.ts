import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adaptOrkXml, orkGroundHitFrame } from "./adapt";
import { freeformChordwiseCp } from "../model/planform";
import { importOrk } from "./import";
import { flattenRocket, referenceRadius } from "../model/geometry";
import { barrowman } from "../sim/aero";
import { structurePointMasses, dryMassProperties } from "../sim/mass";

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

  it("carries the simulation and its conditions, but no invented results", () => {
    // A design the app SHIPS as a sample states no flight results: no OpenRocket run produced any,
    // and a fabricated set would be presented as another tool's prediction. The simulation and its
    // launch conditions still import — the flight is flown under them.
    expect(doc.simulations).toHaveLength(1);
    const sim = doc.simulations[0];
    expect(sim.hasResults).toBe(false);
    expect(sim.results.maxAltitude).toBeUndefined();
    expect(sim.conditions.rodLength).toBe(1.2);
  });

  it("reads stored flight results where a design carries them", () => {
    // demo-boattail is a test-only fixture (not shipped as a sample) and keeps a declared set of
    // synthetic stored results, so the comparison path stays covered.
    const withResults = adaptOrkXml(readXml("demo-boattail.ork.xml"));
    const sim = withResults.simulations[0];
    expect(sim.hasResults).toBe(true);
    expect(sim.results.maxAltitude).toBe(1015);
    expect(Number.isFinite(sim.results.maxVelocity ?? NaN)).toBe(true);
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

  it("reads each stage's separation event and delay", () => {
    // A payload rocket: the booster (bottom) separates at its own ejection charge; the top stage
    // (unspecified) keeps Loft's serial-staging default.
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>Sep</name>
          <subcomponents>
            <stage><name>Payload</name><subcomponents>
              <nosecone><length>0.1</length><aftradius>0.02</aftradius><shape>ogive</shape></nosecone>
            </subcomponents></stage>
            <stage><name>Booster</name>
              <separationevent>ejection</separationevent>
              <separationdelay>1.5</separationdelay>
              <subcomponents>
                <bodytube><length>0.3</length><radius>0.02</radius><thickness>0.001</thickness></bodytube>
              </subcomponents>
            </stage>
          </subcomponents>
        </rocket>
      </openrocket>`;
    const doc = adaptOrkXml(xml);
    expect(doc.rocket.stages).toHaveLength(2);
    expect(doc.rocket.stages[0].separationEvent).toBeUndefined(); // top stage: default
    expect(doc.rocket.stages[1].separationEvent).toBe("ejection");
    expect(doc.rocket.stages[1].separationDelay).toBeCloseTo(1.5, 6);
  });

  it("reads per-configuration separation overrides, keyed by config id", () => {
    // OpenRocket writes a <separationconfiguration configid=…> when a stage separates on a
    // different event per motor config. Dropping these carried the booster to apogee on the
    // overriding config instead of dropping it at staging — a large apogee error.
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>SepCfg</name>
          <subcomponents>
            <stage><name>Sustainer</name><subcomponents>
              <nosecone><length>0.1</length><aftradius>0.02</aftradius><shape>ogive</shape></nosecone>
            </subcomponents></stage>
            <stage><name>Booster</name>
              <separationevent>ejection</separationevent>
              <separationdelay>0.0</separationdelay>
              <separationconfiguration configid="cfg-A">
                <separationevent>burnout</separationevent>
                <separationdelay>0.0</separationdelay>
              </separationconfiguration>
              <separationconfiguration configid="cfg-B">
                <separationevent>upperignition</separationevent>
                <separationdelay>0.0</separationdelay>
              </separationconfiguration>
              <subcomponents>
                <bodytube><length>0.3</length><radius>0.02</radius><thickness>0.001</thickness></bodytube>
              </subcomponents>
            </stage>
          </subcomponents>
        </rocket>
      </openrocket>`;
    const doc = adaptOrkXml(xml);
    const booster = doc.rocket.stages[1];
    expect(booster.separationEvent).toBe("ejection"); // stage default is preserved
    expect(booster.separationConfigs?.["cfg-A"]?.event).toBe("burnout");
    expect(booster.separationConfigs?.["cfg-B"]?.event).toBe("upperignition");
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

  it('bores a centring ring whose file says "auto" to the mount it centres, not to nothing', () => {
    // **`auto` on a centring ring's inner radius is not a missing number — it is "the hole the mount
    // needs", and the file writes it precisely because the mount already states the answer.** Read as
    // missing, the fallback was `outerradius − thickness` with thickness defaulting to 0, which is a
    // ring with no hole — and, since the volume is `pi(ro^2 - ri^2)L`, a ring with no METAL. It
    // weighed nothing.
    //
    // Measured on the corpus file this came from, `USLI2025-FULLSCALE-10.15 (2).ork`: four aluminium
    // rings of 152.3 mm outer diameter imported at 0 g against roughly 210 g each — 840 g of a
    // 12,620 g dry mass, 6.7%, at four fixed stations, so the CG and the static margin computed from
    // it were wrong as well as the mass.
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>AutoBore</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.1</length><aftradius>0.0785</aftradius><shape>ogive</shape></nosecone>
            <bodytube><length>0.6</length><radius>0.0785</radius><thickness>0.0023</thickness><subcomponents>
              <innertube><length>0.56</length><outerradius>0.0396875</outerradius><thickness>0.0015875</thickness>
                <motormount><ignitionevent>automatic</ignitionevent></motormount>
              </innertube>
              <centeringring><length>0.00635</length><outerradius>0.0761746</outerradius><innerradius>auto</innerradius>
                <material type="bulk" density="2700">Aluminum 6061</material>
              </centeringring>
            </subcomponents></bodytube>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    const doc = adaptOrkXml(xml);
    const ring = flattenRocket(doc.rocket).find((p) => p.component.kind === "centeringring")!.component;
    if (ring.kind !== "centeringring") throw new Error("no ring");
    // Bored to the motor mount's OUTER radius, which is what the ring is holding.
    expect(ring.innerRadius).toBeCloseTo(0.0396875, 9);
    expect(ring.innerRadius).toBeLessThan(ring.outerRadius);
    // And it therefore weighs what an aluminium ring of those dimensions weighs. pi(ro^2 - ri^2)L*rho
    // = pi(0.0761746^2 - 0.0396875^2) * 0.00635 * 2700 = 0.2277 kg. (The corpus file this is drawn
    // from states 2491 kg/m3 for its own 6061, so its rings are ~210 g rather than ~228 g; this XML
    // states the textbook 2700 and the arithmetic below is against THAT.)
    const m = Math.PI * (ring.outerRadius ** 2 - ring.innerRadius ** 2) * ring.length * 2700;
    expect(m).toBeCloseTo(0.2277, 4);
    // And the ring's mass is really in the rocket's, rather than only computable from its geometry —
    // the whole defect was a part that measured correctly and weighed nothing. The other components
    // here state no stock, so the airframe's dry mass IS this ring.
    expect(dryMassProperties(doc.rocket).mass).toBeCloseTo(m, 6);
  });

  it('leaves an "auto" ring with no mount beneath it SOLID, which is what OpenRocket answers', () => {
    // No inner tube among its siblings, so there is nothing for the bore to match — and OpenRocket's
    // own `CenteringRing.getInnerRadius()` returns 0 in exactly that case, which is a solid ring. The
    // file was written by that tool, so this is reading the file rather than guessing at it: a ring
    // holding nothing has nothing to be bored for. A corpus median ratio was the first answer here
    // and it was an invented number standing where a citable one exists.
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>NoMount</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.1</length><aftradius>0.03</aftradius><shape>ogive</shape></nosecone>
            <bodytube><length>0.4</length><radius>0.03</radius><thickness>0.001</thickness><subcomponents>
              <centeringring><length>0.003</length><outerradius>0.029</outerradius><innerradius>auto</innerradius>
                <material type="bulk" density="680">Cardboard</material>
              </centeringring>
            </subcomponents></bodytube>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    const ring = flattenRocket(adaptOrkXml(xml).rocket).find((p) => p.component.kind === "centeringring")!.component;
    if (ring.kind !== "centeringring") throw new Error("no ring");
    expect(ring.innerRadius).toBe(0);
    // Solid, so it weighs what a disc of that stock weighs — the point being that it weighs
    // SOMETHING. pi * 0.029^2 * 0.003 * 680 = 5.39 g.
    expect(dryMassProperties(adaptOrkXml(xml).rocket).mass).toBeCloseTo(Math.PI * 0.029 ** 2 * 0.003 * 680, 9);
  });

  it("gives a wall to a tube that has none, and says it did", () => {
    // **A zero wall is not a thin wall — it is a tube of zero volume and zero mass**, and flying one
    // reports a loaded weight and a CG computed without a part the design has. Two files reach that
    // state and the fix treats them alike: `02.Two-stage.ork` states `<thickness>0.0</thickness>` on
    // a cardboard motor tube outright, and a file that simply omits the thickness used to be read as
    // stating zero. Neither is flown as-is; both are warned about, because a dimension Loft chose is
    // a different kind of number from one the file stated and the safety posture will not let the
    // two look alike.
    const mk = (thickness: string) => `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>Wall</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.1</length><aftradius>0.03</aftradius><shape>ogive</shape></nosecone>
            <bodytube><length>0.4</length><radius>0.03</radius><thickness>0.001</thickness><subcomponents>
              <innertube><length>0.2</length><outerradius>0.02</outerradius>${thickness}</innertube>
            </subcomponents></bodytube>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    const bore = (xml: string) => {
      const t = flattenRocket(adaptOrkXml(xml).rocket).find((p) => p.component.kind === "innertube")!.component;
      if (t.kind !== "innertube") throw new Error("no tube");
      return t.innerRadius;
    };
    // Both end up with a wall, and that is the point: a zero wall is not a thin wall, it is no part
    // at all.
    expect(bore(mk("<thickness>0.0</thickness>"))).toBeCloseTo(0.02 - 0.0015, 9);
    expect(bore(mk(""))).toBeCloseTo(0.02 - 0.0015, 9);
    // A file that states a real wall is left entirely alone.
    expect(bore(mk("<thickness>0.002</thickness>"))).toBeCloseTo(0.018, 9);

    // **The warning fires for the STATED-but-unusable case and NOT for the silent one**, and that
    // distinction is what keeps it worth reading. A file that says nothing about a wall has been
    // getting Loft's 1.5 mm since long before this rule existed, so warning about it would fire on
    // 16 of the 25 OpenRocket designs in the corpus — three of which come out byte-identical in mass
    // and CG — and tell two-thirds of importers their weight would have been wrong when it would not.
    const warns = (x: string) => adaptOrkXml(x).warnings.some((w) => /no usable bore/i.test(w));
    expect(warns(mk("<thickness>0.0</thickness>")), "a stated zero wall is Loft supplying the number").toBe(true);
    expect(warns(mk("")), "an absent wall is not news, and a caveat that cries wolf is spent").toBe(false);
    expect(warns(mk("<thickness>0.002</thickness>")), "the file stated a usable wall").toBe(false);
  });

  it("keeps a wall the file states even when it leaves the outer radius automatic", () => {
    // **This is how OpenRocket serialises every auto-radius ThicknessRingComponent** — the outer
    // radius comes from the parent, the wall is stated — and the two facts arrive at different
    // moments, so the wall was simply dropped and re-invented at 1.5 mm. This repo's own
    // `fixtures/src/demo-quirks.ork.xml` is one: a coupler that states 2.0 mm imported at 1.5 mm,
    // 24% light. For a centring ring it would have been worse after the bore rule above, which would
    // have bored the part to the mount and ignored a wall the file gave.
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>AutoOuterStatedWall</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.1</length><aftradius>0.0785</aftradius><shape>ogive</shape></nosecone>
            <bodytube><length>0.6</length><radius>0.0785</radius><thickness>0.0023</thickness><subcomponents>
              <innertube><length>0.56</length><outerradius>0.0396875</outerradius><thickness>0.0015875</thickness>
                <motormount><ignitionevent>automatic</ignitionevent></motormount>
              </innertube>
              <centeringring><length>0.00635</length><outerradius>auto</outerradius><thickness>0.002</thickness>
                <material type="bulk" density="2700">Aluminum 6061</material>
              </centeringring>
              <tubecoupler><length>0.1</length><outerradius>auto</outerradius><thickness>0.002</thickness>
                <material type="bulk" density="1850">FG</material>
              </tubecoupler>
            </subcomponents></bodytube>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    const doc = adaptOrkXml(xml);
    const flat = flattenRocket(doc.rocket);
    const outer = 0.0785 - 0.0023; // the host's bore, which is what an auto outer radius resolves to
    for (const kind of ["centeringring", "tubecoupler"]) {
      const c = flat.find((p) => p.component.kind === kind)!.component as unknown as {
        outerRadius: number; innerRadius: number;
      };
      expect(c.outerRadius, `${kind} outer radius`).toBeCloseTo(outer, 9);
      // The FILE's 2 mm, not this file's invented 1.5 mm, and not the mount bore.
      expect(c.outerRadius - c.innerRadius, `${kind} kept the wall the file stated`).toBeCloseTo(0.002, 9);
    }
    // And nothing was supplied, so nothing is claimed to have been.
    expect(doc.warnings.some((w) => /no usable bore/i.test(w))).toBe(false);
  });

  it("does not depend on the order two siblings happen to appear in", () => {
    // A centring ring's `auto` bore is read off the mount BESIDE it, so resolving bores in the same
    // walk that substitutes outer radii made the answer depend on document order — measured at
    // 0.0783 with the ring first and 0.0762 with the mount first, on byte-identical geometry. An
    // importer is a function of the file.
    const mk = (mountFirst: boolean) => {
      const mount = `<innertube><length>0.5</length><outerradius>auto</outerradius><thickness>0.001</thickness>
        <motormount><ignitionevent>automatic</ignitionevent></motormount></innertube>`;
      const ring = `<centeringring><length>0.003</length><outerradius>0.09</outerradius><innerradius>auto</innerradius>
        <material type="bulk" density="680">Cardboard</material></centeringring>`;
      return `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>Order</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.1</length><aftradius>0.095</aftradius><shape>ogive</shape></nosecone>
            <bodytube><length>0.6</length><radius>0.095</radius><thickness>0.001</thickness><subcomponents>
              ${mountFirst ? mount + ring : ring + mount}
            </subcomponents></bodytube>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    };
    const boreOf = (mountFirst: boolean) => {
      const r = flattenRocket(adaptOrkXml(mk(mountFirst)).rocket).find((p) => p.component.kind === "centeringring")!.component;
      if (r.kind !== "centeringring") throw new Error("no ring");
      return r.innerRadius;
    };
    expect(boreOf(true)).toBeCloseTo(boreOf(false), 12);
    // The mount's own outer radius here resolves to the host's bore, 94.0 mm — WIDER than the ring's
    // own 90 mm rim — so the answer is the clamp, exactly as OpenRocket's own
    // `innerRadius = Math.min(innerRadius, getOuterRadius())` gives. A ring cannot be bored past its
    // own edge, and the clamp is why this case is a thin hoop rather than a negative annulus.
    expect(boreOf(false)).toBeCloseTo(0.09, 9);
  });

  it("will not let a bulkhead state a bore past its own rim and then weigh nothing", () => {
    // A bulkhead is the one internal kind OpenRocket always serialises with an explicit
    // `<innerradius>`, and it used to be exempt from the annulus check entirely — so a bore at or
    // past the rim gave `pi(ro^2 - ri^2)L <= 0`, which `massContrib` drops to null. The part simply
    // vanished from the mass budget, silently, at a fixed station.
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>Bulk</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.1</length><aftradius>0.03</aftradius><shape>ogive</shape></nosecone>
            <bodytube><length>0.4</length><radius>0.03</radius><thickness>0.001</thickness><subcomponents>
              <bulkhead><length>0.006</length><outerradius>0.029</outerradius><innerradius>0.05</innerradius>
                <material type="bulk" density="680">Ply</material>
              </bulkhead>
            </subcomponents></bodytube>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    const doc = adaptOrkXml(xml);
    const b = flattenRocket(doc.rocket).find((p) => p.component.kind === "bulkhead")!.component;
    if (b.kind !== "bulkhead") throw new Error("no bulkhead");
    // A disc, which is what a bulkhead is, rather than an impossible annulus.
    expect(b.innerRadius).toBe(0);
    expect(dryMassProperties(doc.rocket).mass).toBeCloseTo(Math.PI * 0.029 ** 2 * 0.006 * 680, 9);
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

  it("imports a tube-fin set as a flown component, not a reduction", () => {
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>TubeFin</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.1</length><aftradius>0.02</aftradius><shape>ogive</shape></nosecone>
            <bodytube><length>0.3</length><radius>0.02</radius><subcomponents>
              <tubefinset><fincount>6</fincount><length>0.08</length><radius>0.02</radius><thickness>0.0005</thickness></tubefinset>
            </subcomponents></bodytube>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    const doc = adaptOrkXml(xml);
    expect(doc.flownAsReduced).toBe(false);
    expect(doc.warnings).toEqual([]);
    const tubes = doc.rocket.stages[0].components[1].children[0];
    expect(tubes.kind).toBe("tubefinset");
    expect(tubes).toMatchObject({ finCount: 6, length: 0.08, outerRadius: 0.02, thickness: 0.0005 });
  });

  it('sizes an "auto"-radius tube-fin set so the tubes close around the body', () => {
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10">
        <rocket><name>TubeFin</name>
          <subcomponents><stage><subcomponents>
            <nosecone><length>0.1</length><aftradius>0.02</aftradius><shape>ogive</shape></nosecone>
            <bodytube><length>0.3</length><radius>0.02</radius><subcomponents>
              <tubefinset><fincount>6</fincount><length>0.08</length><radius>auto</radius><thickness>0.0005</thickness></tubefinset>
            </subcomponents></bodytube>
          </subcomponents></stage></subcomponents>
        </rocket>
      </openrocket>`;
    const tubes = adaptOrkXml(xml).rocket.stages[0].components[1].children[0];
    // r = R·sin(π/6)/(1 − sin(π/6)) = R, so six tubes match the body diameter exactly.
    expect(tubes.kind === "tubefinset" && tubes.outerRadius).toBeCloseTo(0.02, 6);
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

  it("weighs the Upper section as a whole and doesn't double-count its internals", () => {
    // The Upper tube carries <overridemass>0.6</overridemass> with the subcomponents flag: the
    // whole section was weighed at 0.6 kg. Its coupler, av-bay (0.15 kg) and streamer must be
    // folded into that figure, not added on top.
    const pts = structurePointMasses(doc.rocket);
    const upper = pts.find((p) => p.source === "Upper");
    expect(upper?.mass).toBeCloseTo(0.6, 6);
    // None of the subsumed internals appear as their own point masses.
    for (const inside of ["Coupler", "Av-bay", "Streamer"]) {
      expect(pts.some((p) => p.source === inside)).toBe(false);
    }
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

describe("adaptOrkXml — per-configuration airstart ignition", () => {
  // A single mount that carries the same motor in two configurations, one lit at launch and one
  // airstarted 3 s later via a per-config <ignitionconfiguration> override. The mount-level
  // default alone would flatten both to 0; the override must win per configuration.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<openrocket version="1.10" creator="test">
  <rocket>
    <name>Airstart</name>
    <motorconfiguration configid="cfgA"/>
    <motorconfiguration configid="cfgB" default="true"/>
    <subcomponents>
      <stage>
        <name>Stage</name>
        <subcomponents>
          <bodytube>
            <name>Body</name><length>0.6</length><radius>0.025</radius><thickness>0.001</thickness>
            <subcomponents>
              <innertube>
                <name>Mount</name><length>0.2</length><radius>0.019</radius><thickness>0.001</thickness>
                <motormount>
                  <ignitionevent>automatic</ignitionevent>
                  <ignitiondelay>0.0</ignitiondelay>
                  <motor configid="cfgA">
                    <type>reload</type><manufacturer>AeroTech</manufacturer><designation>H128W</designation>
                    <diameter>0.038</diameter><length>0.2</length><delay>none</delay>
                  </motor>
                  <ignitionconfiguration configid="cfgA">
                    <ignitionevent>automatic</ignitionevent><ignitiondelay>0.0</ignitiondelay>
                  </ignitionconfiguration>
                  <motor configid="cfgB">
                    <type>reload</type><manufacturer>AeroTech</manufacturer><designation>H128W</designation>
                    <diameter>0.038</diameter><length>0.2</length><delay>none</delay>
                  </motor>
                  <ignitionconfiguration configid="cfgB">
                    <ignitionevent>automatic</ignitionevent><ignitiondelay>3.0</ignitiondelay>
                  </ignitionconfiguration>
                </motormount>
              </innertube>
            </subcomponents>
          </bodytube>
        </subcomponents>
      </stage>
    </subcomponents>
  </rocket>
</openrocket>`;

  it("reads each configuration's own ignition delay, not just the mount default", () => {
    const doc = adaptOrkXml(xml);
    const cfgA = doc.rocket.configurations.find((c) => c.id === "cfgA")!;
    const cfgB = doc.rocket.configurations.find((c) => c.id === "cfgB")!;
    expect(cfgA.instances[0].ignitionDelay).toBe(0);
    expect(cfgB.instances[0].ignitionDelay).toBe(3);
  });

  it("reads <delay>none</delay> as a plugged motor, not as a missing delay", () => {
    // OpenRocket writes "none" for a plugged reload — a positive statement that no ejection charge
    // exists, as flown with altimeter deployment. A device waiting on that charge never opens.
    const doc = adaptOrkXml(xml);
    for (const cfg of doc.rocket.configurations) {
      expect(cfg.instances[0].motor.plugged).toBe(true);
    }
  });
});

describe("freeform fin exact chordwise CP (Barrowman strip theory)", () => {
  // The trapezoid CP formula the aero uses for a trapezoidal fin, for cross-checking.
  const trapCp = (root: number, tip: number, sweep: number) =>
    (sweep / 3) * ((root + 2 * tip) / (root + tip)) + (1 / 6) * (root + tip - (root * tip) / (root + tip));

  it("reduces to the trapezoid CP formula for a trapezoid outline", () => {
    const root = 0.15, tip = 0.07, sweep = 0.05, span = 0.08;
    // Root LE at origin, going root TE → tip TE → tip LE.
    const pts = [
      { x: 0, y: 0 },
      { x: root, y: 0 },
      { x: sweep + tip, y: span },
      { x: sweep, y: span },
    ];
    expect(freeformChordwiseCp(pts, span, 0)).toBeCloseTo(trapCp(root, tip, sweep), 4);
  });

  it("gives the elliptical fin's 0.288·root chord for a half-ellipse outline", () => {
    const cr = 0.13, s = 0.07;
    const M = 64;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= M; i++) {
      const y = (i / M) * s;
      const h = (cr / 2) * Math.sqrt(Math.max(0, 1 - (y / s) ** 2));
      pts.push({ x: cr / 2 - h, y }); // leading edge
    }
    for (let i = M; i >= 0; i--) {
      const y = (i / M) * s;
      const h = (cr / 2) * Math.sqrt(Math.max(0, 1 - (y / s) ** 2));
      pts.push({ x: cr / 2 + h, y }); // trailing edge
    }
    // Exact half-ellipse chordwise CP is (½ − 2/3π)·cr ≈ 0.2887·cr; polygon sampling lands within ~1%.
    expect(freeformChordwiseCp(pts, s, 0)).toBeCloseTo((0.5 - 2 / (3 * Math.PI)) * cr, 3);
  });

  it("is referenced to the root leading edge, not the points' origin", () => {
    // Same trapezoid, shifted +0.2 m in x: the CP shifts with it, but referenced to the root LE it
    // is unchanged.
    const root = 0.15, tip = 0.07, sweep = 0.05, span = 0.08, off = 0.2;
    const pts = [
      { x: off, y: 0 },
      { x: off + root, y: 0 },
      { x: off + sweep + tip, y: span },
      { x: off + sweep, y: span },
    ];
    expect(freeformChordwiseCp(pts, span, off)).toBeCloseTo(trapCp(root, tip, sweep), 4);
  });

  it("imports a freeform fin with its exact CP, and the aero uses it", () => {
    const finpoints =
      "<finpoints><point x='0' y='0'/><point x='0.05' y='0.06'/><point x='0.09' y='0'/></finpoints>";
    const xml = `<?xml version='1.0'?>
      <openrocket version="1.10"><rocket><name>x</name><subcomponents><stage><subcomponents>
        <nosecone><length>0.15</length><aftradius>0.025</aftradius><shape>ogive</shape></nosecone>
        <bodytube><length>0.6</length><radius>0.025</radius><thickness>0.001</thickness><subcomponents>
          <freeformfinset><name>ff</name><fincount>3</fincount><thickness>0.003</thickness>${finpoints}</freeformfinset>
        </subcomponents></bodytube>
      </subcomponents></stage></subcomponents></rocket></openrocket>`;
    const rocket = adaptOrkXml(xml).rocket;
    const finPos = flattenRocket(rocket).find((p) => p.component.kind === "freeformfinset")!;
    const fin = finPos.component;
    expect(fin.kind).toBe("freeformfinset");
    if (fin.kind !== "freeformfinset") return;
    expect(fin.cpChord).toBeGreaterThan(0);
    // The whole-rocket Barrowman CP places the fin's contribution at the fin's fore station plus its
    // stored chordwise CP — proof the aero flew the exact value, not an equal-area-trapezoid guess.
    const st = barrowman(rocket);
    const finContribution = st.contributions.find((c) => c.source === "ff")!;
    expect(finContribution.x - finPos.xFore).toBeCloseTo(fin.cpChord!, 6);
  });
});

describe("stored per-step flight data", () => {
  // A minimal logged design: a nose + body in one stage, plus a stored simulation whose flight log
  // is the given databranch markup. Enough to exercise the per-step parser without a real GPL file.
  const withBranches = (branches: string) => `<?xml version='1.0'?>
    <openrocket version="1.10">
      <rocket><name>Logged</name><subcomponents><stage><subcomponents>
        <nosecone><length>0.1</length><aftradius>0.02</aftradius><shape>ogive</shape></nosecone>
        <bodytube><length>0.3</length><radius>0.02</radius><thickness>0.001</thickness></bodytube>
      </subcomponents></stage></subcomponents></rocket>
      <simulations><simulation status="loaded">
        <name>Sim 1</name>
        <flightdata maxaltitude="100">${branches}</flightdata>
      </simulation></simulations>
    </openrocket>`;

  it("parses the per-step series, mapping columns by name regardless of order", () => {
    // Column order deliberately scrambled (Cd first, Mach before Altitude) to prove name-based lookup.
    const branch = `<databranch name="Main" types="Drag coefficient,Time,Mach number,Total velocity,Altitude">
      <datapoint>0.55,0.0,0.30,100.0,0.0</datapoint>
      <datapoint>0.50,1.0,0.25,85.0,80.0</datapoint>
      <datapoint>0.48,2.0,0.20,70.0,150.0</datapoint>
    </databranch>`;
    const fd = adaptOrkXml(withBranches(branch)).simulations[0].flightData;
    expect(fd).toBeDefined();
    expect(fd!.branch).toBe("Main");
    expect(fd!.points).toHaveLength(3);
    expect(fd!.points[0]).toMatchObject({ time: 0, altitude: 0, mach: 0.3, velocity: 100, cd: 0.55 });
    expect(fd!.points[2].cd).toBeCloseTo(0.48, 6);
    expect(fd!.points[1].altitude).toBeCloseTo(80, 6);
  });

  it("takes the longest branch (the primary flight) on a staged log", () => {
    const booster = `<databranch name="Booster" types="Time,Altitude,Mach number">
      <datapoint>0,0,0.1</datapoint><datapoint>0.5,10,0.2</datapoint></databranch>`;
    const sustainer = `<databranch name="Sustainer" types="Time,Altitude,Mach number">
      <datapoint>0,0,0.1</datapoint><datapoint>1,50,0.3</datapoint><datapoint>2,120,0.25</datapoint><datapoint>3,150,0.1</datapoint></databranch>`;
    const fd = adaptOrkXml(withBranches(booster + sustainer)).simulations[0].flightData;
    expect(fd!.branch).toBe("Sustainer");
    expect(fd!.points).toHaveLength(4);
  });

  it("leaves an absent Cd column NaN but still reads the trajectory", () => {
    const branch = `<databranch name="Main" types="Time,Altitude,Mach number">
      <datapoint>0,0,0.1</datapoint><datapoint>1,50,0.3</datapoint></databranch>`;
    const p = adaptOrkXml(withBranches(branch)).simulations[0].flightData!.points;
    expect(p).toHaveLength(2);
    expect(Number.isNaN(p[0].cd)).toBe(true);
    expect(p[1].altitude).toBeCloseTo(50, 6);
  });

  it("drops rows whose core fields are unreadable", () => {
    const branch = `<databranch name="Main" types="Time,Altitude,Mach number">
      <datapoint>0,0,0.1</datapoint><datapoint>NaN,NaN,NaN</datapoint><datapoint>2,120,0.25</datapoint></databranch>`;
    expect(adaptOrkXml(withBranches(branch)).simulations[0].flightData!.points).toHaveLength(2);
  });

  it("carries no flight log when the file stores only summary results", () => {
    const doc = adaptOrkXml(withBranches(""));
    expect(doc.simulations[0].flightData).toBeUndefined();
    expect(doc.simulations[0].results.maxAltitude).toBeCloseTo(100, 6);
  });

  it("ignores a branch missing a required column (no Mach)", () => {
    const branch = `<databranch name="Main" types="Time,Altitude,Total velocity">
      <datapoint>0,0,0</datapoint><datapoint>1,50,40</datapoint></databranch>`;
    expect(adaptOrkXml(withBranches(branch)).simulations[0].flightData).toBeUndefined();
  });
});

describe("which quantity a stored landing velocity actually is", () => {
  /** R10 increment 1. OpenRocket interpolates its stored `groundhitvelocity` out of
   *  `TYPE_VELOCITY_TOTAL` at the GROUND_HIT event — logic that is byte-identical across releases —
   *  but what that series HOLDS during descent changed at 24.12. Verified from source rather than
   *  inferred from numbers:
   *
   *    <= 23.09  `AbstractEulerStepper.java:168` — `setValue(TYPE_VELOCITY_TOTAL, airSpeed.length())`
   *              with `airSpeed = getRocketVelocity().add(windSpeed)` — AIR-relative, so under an
   *              open canopy (where the rocket drifts with the air) it is ~the vertical descent rate.
   *    >= 24.12  that stepper contains zero references to the type, and
   *              `SimulationStatus.java:643` — `setValue(TYPE_VELOCITY_TOTAL,
   *              getRocketVelocity().length())` — the GROUND-frame total, drift included.
   *
   *  Loft reports the vertical rate, so the era decides which of Loft's two figures the file should
   *  be scored against. Getting the boundary wrong is worse than not splitting at all, which is why
   *  this pins the versions the corpus actually carries rather than a couple of tidy examples. */
  it("reads the era off the creator string, including the forms the corpus really carries", () => {
    // Air-relative era — every major version the corpus holds below the boundary.
    for (const v of ["OpenRocket 13.05", "OpenRocket 15.03", "OpenRocket 22.02", "OpenRocket 22.02.beta.05", "OpenRocket 23.09"]) {
      expect(orkGroundHitFrame(v), `${v} should read as the air-relative era`).toBe("vertical");
    }
    // Ground-frame era — including a beta and the snapshot whose MINOR is not a number at all.
    for (const v of ["OpenRocket 24.12", "OpenRocket 24.12.beta.01", "OpenRocket 25.01", "OpenRocket 26.xx.SNAPSHOT-3cc62e47d"]) {
      expect(orkGroundHitFrame(v), `${v} should read as the ground-frame era`).toBe("total");
    }
    // The boundary itself, from both sides — an off-by-one here silently mis-scores a whole era.
    expect(orkGroundHitFrame("OpenRocket 24.11")).toBe("vertical");
    expect(orkGroundHitFrame("OpenRocket 24.12")).toBe("total");

    // **Undefined rather than a guess.** A wrong era is worse than no era: it would compare two
    // different quantities while looking deliberate, where `undefined` falls back to the reading
    // Loft has always used and that COMPETITION.md row 34 established empirically.
    for (const v of [undefined, "", "RockSim 9", "OpenRocket", "Some other tool 24.12"]) {
      expect(orkGroundHitFrame(v), `"${v}" should not be assigned an era`).toBeUndefined();
    }
  });

  it("carries the era onto every stored simulation that has a landing velocity", () => {
    const design = (creator: string) =>
      `<openrocket version="1.9" creator="${creator}"><rocket><name>era</name><subcomponents><stage><name>S</name><subcomponents>
        <nosecone><length>0.15</length><aftradius>0.027</aftradius><shape>ogive</shape><thickness>0.002</thickness></nosecone>
        <bodytube><length>0.6</length><radius>0.027</radius><thickness>0.001</thickness></bodytube>
      </subcomponents></stage></subcomponents></rocket>
      <simulations><simulation status="uptodate"><name>S1</name><conditions><launchrodlength>1</launchrodlength></conditions>
      <flightdata maxaltitude="300" groundhitvelocity="6.2" /></simulation></simulations></openrocket>`;

    const older = adaptOrkXml(design("OpenRocket 23.09"));
    expect(older.simulations[0].results.groundHitVelocity).toBeCloseTo(6.2, 6);
    expect(older.simulations[0].groundHitVelocityFrame).toBe("vertical");

    const newer = adaptOrkXml(design("OpenRocket 24.12"));
    expect(newer.simulations[0].results.groundHitVelocity).toBeCloseTo(6.2, 6);
    expect(newer.simulations[0].groundHitVelocityFrame).toBe("total");

    // The VALUE is untouched either way — this records what the number means, it does not convert it.
    expect(newer.simulations[0].results.groundHitVelocity).toBe(
      older.simulations[0].results.groundHitVelocity,
    );
  });
});

describe("whether an .ork says a recovery device came out", () => {
  /** A minimal design with one simulation whose `<flightdata>` carries the given event log. */
  const design = (branch: string) =>
    `<openrocket version="1.9" creator="OpenRocket 24.12"><rocket><name>d</name><subcomponents><stage><name>S</name><subcomponents>
        <nosecone><length>0.15</length><aftradius>0.027</aftradius><shape>ogive</shape><thickness>0.002</thickness></nosecone>
        <bodytube><length>0.6</length><radius>0.027</radius><thickness>0.001</thickness></bodytube>
      </subcomponents></stage></subcomponents></rocket>
      <simulations><simulation status="uptodate"><name>S1</name><conditions><launchrodlength>1</launchrodlength></conditions>
      <flightdata maxaltitude="300" groundhitvelocity="6.2">${branch}</flightdata></simulation></simulations></openrocket>`;

  const branch = (...types: string[]) =>
    `<databranch name="Sustainer" types="Time,Altitude">${types
      .map((t, i) => `<event time="${i}" type="${t}"/>`)
      .join("")}</databranch>`;

  it("reads the deployment out of the event log the format has always written", () => {
    // The `.ork` importer read `<flightdata>`'s summary ATTRIBUTES and never opened its
    // `<databranch>`, so this was filed as "OpenRocket does not state it". It does: 77 of the
    // corpus's 91 stored flights carry this event.
    const doc = adaptOrkXml(design(branch("launch", "burnout", "apogee", "recoverydevicedeployment", "groundhit")));
    expect(doc.simulations[0].recoveryDeployed).toBe(true);
  });

  it("reads an event log with no deployment in it as exactly that", () => {
    // No file in the corpus is this today — every `.ork` that logs events logs a deployment — so it
    // is asserted here rather than measured there. A tumbling descent with nothing out is a normal
    // thing for OpenRocket to record, and it must not read as a canopy.
    const doc = adaptOrkXml(design(branch("launch", "burnout", "apogee", "tumble", "groundhit")));
    expect(doc.simulations[0].recoveryDeployed).toBe(false);
  });

  it("leaves a summary-only save undefined, rather than calling it ballistic", () => {
    // 14 of the corpus's stored `.ork` flights are saved with results and no event log at all.
    // Reading those as "nothing deployed" would move fourteen canopy descents into the ballistic
    // population and take its published median with them.
    expect(adaptOrkXml(design("")).simulations[0].recoveryDeployed).toBeUndefined();
    // A databranch with data points but no events is the same case, not a different one.
    expect(
      adaptOrkXml(design(`<databranch name="Sustainer" types="Time,Altitude"><datapoint>0,0</datapoint></databranch>`))
        .simulations[0].recoveryDeployed,
    ).toBeUndefined();
  });
});
