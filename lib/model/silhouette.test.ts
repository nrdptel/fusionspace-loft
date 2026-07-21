import { describe, it, expect } from "vitest";
import { rocketOutline, noseHalfProfile } from "./silhouette";
import { overallLength, maxBodyRadius } from "./geometry";
import { newDesign } from "./starter";
import type { Rocket, NoseShape } from "./types";

const SHAPES: NoseShape[] = ["conical", "ogive", "ellipsoid", "power", "parabolic", "haack"];

describe("noseHalfProfile", () => {
  it("runs from the tip (0,0) to the base (length, radius) for every shape", () => {
    for (const shape of SHAPES) {
      const p = noseHalfProfile(shape, undefined, 0.2, 0.03);
      expect(p[0][0]).toBeCloseTo(0, 6);
      expect(p[0][1]).toBeCloseTo(0, 6); // tip is on the axis
      const last = p[p.length - 1];
      expect(last[0]).toBeCloseTo(0.2, 6);
      expect(last[1]).toBeCloseTo(0.03, 4); // base meets the airframe radius
    }
  });

  it("gives a straight taper for a conical nose", () => {
    const p = noseHalfProfile("conical", undefined, 0.2, 0.03, 4);
    // Halfway along a cone the radius is half the base radius.
    const mid = p[2];
    expect(mid[0]).toBeCloseTo(0.1, 6);
    expect(mid[1]).toBeCloseTo(0.015, 6);
  });

  it("is monotonic non-decreasing in radius (a nose only widens toward its base)", () => {
    for (const shape of SHAPES) {
      const p = noseHalfProfile(shape, undefined, 0.2, 0.03);
      for (let i = 1; i < p.length; i++) {
        expect(p[i][1]).toBeGreaterThanOrEqual(p[i - 1][1] - 1e-9);
      }
    }
  });

  it("a fuller ogive sits outside the cone of the same length and base", () => {
    // At mid-length the tangent ogive is wider than the straight cone (it bulges out).
    const cone = noseHalfProfile("conical", undefined, 0.2, 0.03, 2)[1];
    const ogive = noseHalfProfile("ogive", undefined, 0.2, 0.03, 2)[1];
    expect(ogive[1]).toBeGreaterThan(cone[1]);
  });
});

describe("rocketOutline — from-scratch starter", () => {
  it("matches the model's own length and radius, with fins standing off the body", () => {
    const rocket = newDesign().rocket;
    const o = rocketOutline(rocket);
    expect(o.body.length).toBeGreaterThan(2);
    expect(o.length).toBeCloseTo(overallLength(rocket), 6);
    expect(o.maxRadius).toBeCloseTo(maxBodyRadius(rocket), 6);
    // The starter carries fins, so at least one planform, each a 4-point ring reaching past the body.
    expect(o.fins.length).toBeGreaterThanOrEqual(1);
    for (const fin of o.fins) {
      expect(fin.poly).toHaveLength(4);
      expect(fin.id).toBeTruthy();
    }
    expect(o.maxExtent).toBeGreaterThan(o.maxRadius);
    // Every body part is addressable by its component id (for highlighting from the parts table).
    expect(o.parts.length).toBeGreaterThanOrEqual(2);
    for (const part of o.parts) expect(part.profile.length).toBeGreaterThanOrEqual(2);
  });
});

describe("rocketOutline — exact geometry on a hand-built rocket", () => {
  const rocket: Rocket = {
    name: "T",
    stages: [
      {
        name: "Sustainer",
        components: [
          {
            id: "nose", name: "Nose", kind: "nosecone", placement: { method: "top", offset: 0 },
            length: 0.1, aftRadius: 0.025, shape: "conical", children: [],
          },
          {
            id: "tube", name: "Body", kind: "bodytube", placement: { method: "after", offset: 0 },
            length: 0.4, outerRadius: 0.025,
            children: [
              {
                id: "fins", name: "Fins", kind: "trapezoidfinset", placement: { method: "bottom", offset: 0 },
                finCount: 3, rootChord: 0.08, tipChord: 0.04, height: 0.05, sweepLength: 0.04, thickness: 0.003,
                children: [],
              },
            ],
          },
        ],
      },
    ],
    configurations: [{ id: "c", instances: [] }],
    referenceType: "maximum",
  };

  it("frames the whole airframe to scale", () => {
    const o = rocketOutline(rocket);
    expect(o.length).toBeCloseTo(0.5, 6); // 0.1 nose + 0.4 tube
    expect(o.maxRadius).toBeCloseTo(0.025, 6);
    // Fin tip reaches the body radius plus the fin height.
    expect(o.maxExtent).toBeCloseTo(0.025 + 0.05, 6);
  });

  it("splits the body into addressable parts by component id", () => {
    const o = rocketOutline(rocket);
    expect(o.parts.map((p) => p.id)).toEqual(["nose", "tube"]);
    expect(o.parts[0].kind).toBe("nosecone");
  });

  it("places the fin planform at the aft of the tube, seated on the body radius", () => {
    const o = rocketOutline(rocket);
    expect(o.fins).toHaveLength(1);
    expect(o.fins[0].id).toBe("fins");
    const [rootLE, tipLE, tipTE, rootTE] = o.fins[0].poly;
    // Root LE sits rootChord ahead of the tube aft (0.5): 0.5 - 0.08 = 0.42, on the body radius.
    expect(rootLE[0]).toBeCloseTo(0.42, 6);
    expect(rootLE[1]).toBeCloseTo(0.025, 6);
    // Root TE at the tube aft.
    expect(rootTE[0]).toBeCloseTo(0.5, 6);
    // Tip swept aft by 0.04, reaching r = body + height, tip chord 0.04 wide.
    expect(tipLE[0]).toBeCloseTo(0.46, 6);
    expect(tipLE[1]).toBeCloseTo(0.075, 6);
    expect(tipTE[0]).toBeCloseTo(0.5, 6);
  });
});

describe("rocketOutline — boattail transition and elliptical fins", () => {
  const rocket: Rocket = {
    name: "BT",
    stages: [
      {
        name: "Sustainer",
        components: [
          {
            id: "nose", name: "Nose", kind: "nosecone", placement: { method: "top", offset: 0 },
            length: 0.1, aftRadius: 0.027, shape: "ogive", children: [],
          },
          {
            id: "tube", name: "Body", kind: "bodytube", placement: { method: "after", offset: 0 },
            length: 0.3, outerRadius: 0.027,
            children: [
              {
                id: "efins", name: "Elliptical fins", kind: "ellipticalfinset", placement: { method: "bottom", offset: 0 },
                finCount: 3, rootChord: 0.1, area: 0.004, height: 0.05, sweepLength: 0.02, thickness: 0.003,
                children: [],
              },
            ],
          },
          {
            id: "boat", name: "Boattail", kind: "transition", placement: { method: "after", offset: 0 },
            length: 0.05, foreRadius: 0.027, aftRadius: 0.018, shape: "conical", children: [],
          },
        ],
      },
    ],
    configurations: [{ id: "c", instances: [] }],
    referenceType: "maximum",
  };

  it("tapers the body through the boattail (fore radius to a narrower aft radius)", () => {
    const o = rocketOutline(rocket);
    expect(o.length).toBeCloseTo(0.45, 6); // 0.1 + 0.3 + 0.05
    // The boattail contributes its two radii; the aft end is the narrower one.
    const aft = o.body[o.body.length - 1];
    expect(aft[0]).toBeCloseTo(0.45, 6);
    expect(aft[1]).toBeCloseTo(0.018, 6);
    expect(o.maxRadius).toBeCloseTo(0.027, 6); // the wider fore radius still sets the max
    // Nose, tube, and boattail are each their own addressable part.
    expect(o.parts.map((p) => p.id)).toEqual(["nose", "tube", "boat"]);
  });

  it("draws a generic (elliptical) fin as its equal-area trapezoid", () => {
    const o = rocketOutline(rocket);
    expect(o.fins).toHaveLength(1);
    const [rootLE, tipLE, tipTE, rootTE] = o.fins[0].poly;
    // Root spans the fin's rootChord seated on the body; root LE at tube aft - rootChord = 0.4 - 0.1.
    expect(rootLE[0]).toBeCloseTo(0.3, 6);
    expect(rootTE[0]).toBeCloseTo(0.4, 6);
    // Equal-area tip chord = 2·area/height − rootChord = 2·0.004/0.05 − 0.1 = 0.06, swept aft 0.02.
    expect(tipLE[0]).toBeCloseTo(0.32, 6);
    expect(tipTE[0]).toBeCloseTo(0.38, 6);
    expect(tipLE[1]).toBeCloseTo(0.027 + 0.05, 6);
  });
});
