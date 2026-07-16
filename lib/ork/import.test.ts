/** Import robustness: malformed, corrupt, and absurd inputs must degrade gracefully — a clear
 *  (non-empty) error or a withheld result, never a crash and never a silent garbage number. This
 *  is the front door every user hits; a corrupt file or a unit error must not produce false
 *  precision on a safety-relevant altitude. */

import { describe, it, expect } from "vitest";
import { adaptDesignXml, importDesign } from "./import";
import { runFromDocument } from "../sim/run";

const ork = (inner: string) =>
  `<?xml version="1.0"?><openrocket version="1.10" creator="t"><rocket><name>T</name>${inner}</rocket></openrocket>`;
const stage = (comps: string) => `<subcomponents><stage><name>S</name><subcomponents>${comps}</subcomponents></stage></subcomponents>`;

describe("import robustness — malformed XML", () => {
  const cases: Array<[string, string]> = [
    ["empty string", ""],
    ["whitespace", "   \n "],
    ["non-XML text", "not a rocket file"],
    ["wrong root", `<?xml version="1.0"?><foo><bar/></foo>`],
    ["html", `<!DOCTYPE html><html><body>hi</body></html>`],
    ["openrocket, no rocket", `<openrocket version="1.10"></openrocket>`],
    ["truncated tags", `<?xml version="1.0"?><openrocket><rocket><name>T</name><subcomponents><stage>`],
  ];
  for (const [name, xml] of cases) {
    it(`rejects ${name} with a clear message`, () => {
      let err: Error | undefined;
      try {
        const doc = adaptDesignXml(xml);
        // If it parsed, simulating an empty design must still fail cleanly, not crash.
        runFromDocument(doc);
      } catch (e) {
        err = e as Error;
      }
      expect(err).toBeInstanceOf(Error);
      expect(err!.message.trim().length).toBeGreaterThan(0); // never a blank error
    });
  }
});

describe("import robustness — corrupt bytes", () => {
  const cases: Array<[string, Uint8Array]> = [
    ["empty bytes", new Uint8Array(0)],
    ["random garbage", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x1, 0xff])],
    ["truncated gzip", new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00])],
    ["truncated zip", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])],
  ];
  for (const [name, bytes] of cases) {
    it(`rejects ${name} with a non-empty message`, async () => {
      await expect(importDesign(bytes)).rejects.toThrow();
      const err = await importDesign(bytes).catch((e: Error) => e);
      expect((err as Error).message.trim().length).toBeGreaterThan(0);
    });
  }
});

describe("import robustness — degenerate geometry with a valid motor", () => {
  const design = (nose: string, body: string) => ork(
    stage(
      `${nose}<bodytube>${body}<subcomponents>` +
        `<innertube><length>0.07</length><radius>0.009</radius><thickness>0.0005</thickness>` +
        `<motormount><ignitionevent>automatic</ignitionevent><ignitiondelay>0.0</ignitiondelay>` +
        `<motor configid="c"><type>single-use</type><manufacturer>Estes</manufacturer><designation>C6</designation><diameter>0.018</diameter><length>0.07</length><delay>5</delay></motor>` +
        `</motormount></innertube>` +
        `<trapezoidfinset><fincount>3</fincount><rootchord>0.05</rootchord><tipchord>0.02</tipchord><height>0.03</height><sweeplength>0.02</sweeplength><thickness>0.002</thickness><position type="bottom">0</position></trapezoidfinset>` +
        `</subcomponents></bodytube>`,
    ),
  ).replace("<rocket>", `<rocket><motorconfiguration configid="c" default="true"/>`);
  const N = (l: string, r: string) => `<nosecone><length>${l}</length><aftradius>${r}</aftradius><shape>ogive</shape></nosecone>`;
  const B = (l: string, r: string) => `<length>${l}</length><radius>${r}</radius><thickness>0.0005</thickness>`;

  it("never flies to a NaN or absurd altitude", () => {
    const finiteCases = [
      N("0.1", "0.0125") + "|" + B("0.3", "0.0125"), // sane
      N("-0.1", "0.0125") + "|" + B("0.3", "0.0125"), // negative nose length
      N("0.1", "0") + "|" + B("0.3", "0.0125"), // zero nose radius
      N("0.1", "0") + "|" + B("0.3", "0"), // all zero radius
      N("0.1", "-0.0125") + "|" + B("0.3", "-0.0125"), // negative radius
      N("0.1", "0.0125") + "|" + B("0", "0.0125"), // zero-length body
    ];
    for (const c of finiteCases) {
      const [nose, body] = c.split("|");
      const run = runFromDocument(adaptDesignXml(design(nose, body)));
      const s = run.result.summary;
      for (const n of [s.apogee, s.maxVelocity, s.maxMach, run.result.staticMarginCal, run.result.liftoffMass]) {
        expect(Number.isFinite(n)).toBe(true);
      }
      expect(s.apogee).toBeLessThan(1e5); // no hobby rocket reaches the Kármán line
      expect(s.maxVelocity).toBeLessThan(5000);
    }
  });

  it("refuses an implausibly large airframe (unit error) with a clear message", () => {
    const huge = design(N("0.1", "1000"), B("0.3", "1000"));
    let err: Error | undefined;
    try {
      runFromDocument(adaptDesignXml(huge));
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toMatch(/implausibly large|unit error/i);
  });
});
