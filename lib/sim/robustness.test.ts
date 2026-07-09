import { describe, it, expect } from "vitest";
import { adaptDesignXml } from "../ork/import";
import { runFromDocument } from "./run";
import { barrowman } from "./aero";
import type { Rocket, NoseCone, BodyTube, TrapezoidFinSet } from "../model/types";

/** Malformed and degenerate designs must degrade gracefully — a clear thrown message on an
 *  unreadable file, and finite, non-absurd flight numbers on a design with broken geometry —
 *  never a crash, a NaN in the summary, or a nonsensical apogee. Real-world files carry all
 *  kinds of quirks; these pin the graceful-degradation contract. */

// A rocket with a real, resolvable motor (H128W) so the flight runs; `parts` injects the
// (possibly degenerate) component(s) under test ahead of the motor tube.
const withMotor = (parts: string) =>
  `<?xml version='1.0'?><openrocket version="1.10"><rocket><name>P</name>` +
  `<motorconfiguration configid="c1" default="true"/>` +
  `<subcomponents><stage><subcomponents>` +
  `<nosecone><length>0.1</length><aftradius>0.019</aftradius><shape>ogive</shape></nosecone>` +
  parts +
  `<bodytube><length>0.3</length><radius>0.019</radius><thickness>0.001</thickness>` +
  `<motormount><ignitionevent>automatic</ignitionevent>` +
  `<motor configid="c1"><manufacturer>AeroTech</manufacturer><designation>H128W</designation>` +
  `<diameter>0.029</diameter><length>0.194</length></motor>` +
  `</motormount></bodytube>` +
  `</subcomponents></stage></subcomponents></rocket></openrocket>`;

describe("unreadable input throws a clear message, never crashes", () => {
  for (const [name, xml] of [
    ["empty string", ""],
    ["whitespace", "   \n  "],
    ["not xml", "not xml at all"],
    ["wrong root", "<html><body/></html>"],
    ["no rocket element", "<?xml version='1.0'?><openrocket version='1.10'></openrocket>"],
  ] as Array<[string, string]>) {
    it(name, () => {
      expect(() => adaptDesignXml(xml)).toThrow();
    });
  }
});

describe("degenerate geometry simulates to finite, non-absurd numbers", () => {
  const degenerate: Array<[string, string]> = [
    ["zero-radius nose", withMotor("<nosecone><length>0.1</length><aftradius>0</aftradius><shape>ogive</shape></nosecone>")],
    ["negative-radius nose", withMotor("<nosecone><length>0.1</length><aftradius>-0.02</aftradius><shape>ogive</shape></nosecone>")],
    ["zero-length body", withMotor("<bodytube><length>0</length><radius>0.019</radius></bodytube>")],
    ["auto/NaN radius token", withMotor("<bodytube><length>0.3</length><radius>NaN</radius></bodytube>")],
    ["degenerate fin set", withMotor("<trapezoidfinset><fincount>0</fincount><rootchord>0</rootchord><tipchord>0</tipchord><height>0</height><thickness>0</thickness></trapezoidfinset>")],
    ["zero-radii transition", withMotor("<transition><length>0.05</length><foreradius>0</foreradius><aftradius>0</aftradius><shape>conical</shape></transition>")],
    ["absurd fin thickness (unit-scale error)", withMotor("<trapezoidfinset><fincount>3</fincount><rootchord>0.1</rootchord><tipchord>0.05</tipchord><height>0.05</height><thickness>10</thickness></trapezoidfinset>")],
    ["negative mass override", withMotor("<masscomponent><mass>-5</mass></masscomponent>")],
  ];
  for (const [name, xml] of degenerate) {
    it(name, () => {
      const run = runFromDocument(adaptDesignXml(xml));
      const s = run.result.summary;
      for (const v of [s.apogee, s.maxVelocity, s.maxMach, s.groundHitVelocity, run.result.cgLoaded, run.result.staticMarginCal, run.result.liftoffMass]) {
        expect(Number.isFinite(v)).toBe(true); // never NaN/Inf
      }
      expect(run.result.liftoffMass).toBeGreaterThan(0);
      expect(s.apogee).toBeLessThan(1e5); // no integrator blow-up to a nonsensical altitude
    });
  }
});

describe("barrowman guards against degenerate parts (no NaN CP or margin)", () => {
  function rocket(fin?: Partial<TrapezoidFinSet>): Rocket {
    const nose: NoseCone = { id: "n", name: "n", kind: "nosecone", placement: { method: "after", offset: 0 }, length: 0.1, aftRadius: 0.02, shape: "ogive", shapeParameter: 0, children: [] };
    const body: BodyTube = { id: "b", name: "b", kind: "bodytube", placement: { method: "after", offset: 0 }, outerRadius: 0.02, thickness: 0.001, length: 0.4, children: [] };
    if (fin) {
      body.children.push({ id: "f", name: "f", kind: "trapezoidfinset", placement: { method: "bottom", offset: 0 }, finCount: 3, rootChord: 0.08, tipChord: 0.04, height: 0.04, sweepLength: 0.04, thickness: 0.003, children: [], ...fin });
    }
    return { name: "r", stages: [{ name: "s", components: [nose, body] }], configurations: [], referenceType: "maximum" };
  }

  it("a zero-count fin set contributes nothing, matching a finless rocket", () => {
    const finless = barrowman(rocket());
    const zeroFins = barrowman(rocket({ finCount: 0, rootChord: 0, tipChord: 0, height: 0 }));
    expect(Number.isFinite(zeroFins.cp)).toBe(true);
    expect(Number.isFinite(zeroFins.cnAlpha)).toBe(true);
    expect(zeroFins.cp).toBeCloseTo(finless.cp, 6);
    expect(zeroFins.cnAlpha).toBeCloseTo(finless.cnAlpha, 6);
  });

  it("a real fin set moves CP aft and keeps everything finite", () => {
    const st = barrowman(rocket({}));
    expect(Number.isFinite(st.cp)).toBe(true);
    expect(st.cnAlpha).toBeGreaterThan(2);
  });
});
