import { describe, it, expect } from "vitest";
import { mouldLineSteps, STEP_NOTICE_M } from "./geometry";
import type { Rocket, BodyTube, Transition, NoseCone } from "./types";

const MAT = { name: "massless", density: 0, type: "bulk" as const };

function tube(id: string, outerRadius: number, length = 0.2, offset = 0): BodyTube {
  return {
    id,
    name: id,
    kind: "bodytube",
    placement: { method: "after", offset },
    outerRadius,
    thickness: 0.001,
    length,
    material: MAT,
    children: [],
  };
}

function taper(id: string, foreRadius: number, aftRadius: number, length = 0.05): Transition {
  return {
    id,
    name: id,
    kind: "transition",
    placement: { method: "after", offset: 0 },
    length,
    foreRadius,
    aftRadius,
    shape: "conical",
    children: [],
  };
}

function nose(id: string, aftRadius: number): NoseCone {
  return {
    id,
    name: id,
    kind: "nosecone",
    placement: { method: "after", offset: 0 },
    length: 0.1,
    aftRadius,
    shape: "ogive",
    material: MAT,
    children: [],
  };
}

function rocket(...components: BodyTube[] | (BodyTube | Transition | NoseCone)[]): Rocket {
  return {
    name: "test",
    stages: [{ name: "s", components }],
    configurations: [],
    referenceType: "maximum",
  };
}

describe("mouldLineSteps", () => {
  it("reports a step out and a step in, signed, and says nothing where the joint fairs", () => {
    // 20 mm radius into 30 mm radius: the mould line steps OUT by 20 mm of diameter.
    const out = mouldLineSteps(rocket(tube("a", 0.02), tube("b", 0.03)));
    expect(out).toHaveLength(1);
    expect(out[0].diameterStep).toBeCloseTo(0.02, 12);
    expect(out[0].id).toBe("a");

    // …and the same joint the other way round steps IN, which is a negative step, not an absent one.
    const inward = mouldLineSteps(rocket(tube("a", 0.03), tube("b", 0.02)));
    expect(inward).toHaveLength(1);
    expect(inward[0].diameterStep).toBeCloseTo(-0.02, 12);

    // A joint between two tubes of one diameter is not a step and must not be reported: this is the
    // assertion that keeps the flight's caution off the 22 corpus designs that fair all the way.
    expect(mouldLineSteps(rocket(tube("a", 0.03), tube("b", 0.03)))).toEqual([]);
  });

  it("does not report a diameter change a transition actually takes over", () => {
    // The same 20 mm of diameter, but with a real taper carrying it: the drag model charges this by
    // its own joint angle, so it is exactly the case that must NOT be flagged as uncharged.
    expect(mouldLineSteps(rocket(tube("a", 0.02), taper("t", 0.02, 0.03), tube("b", 0.03)))).toEqual(
      [],
    );
  });

  it("judges only joints the two parts actually share", () => {
    // A part placed with a gap behind the one before it is a different geometry, and one Loft does
    // not model either — so there is no joint to judge rather than a step to report.
    expect(mouldLineSteps(rocket(tube("a", 0.02), tube("b", 0.03, 0.2, 0.05)))).toEqual([]);
  });

  it("ignores parts that are not on the outer mould line", () => {
    // An inner tube inside a body tube never meets the airstream. A walk that descended into
    // children would read its diameter as a step and flag every design with a motor mount.
    const outer = tube("a", 0.03);
    outer.children.push(tube("inner", 0.01));
    expect(mouldLineSteps(rocket(outer, tube("b", 0.03)))).toEqual([]);
  });

  it("reads a nose cone's own base as a joint like any other", () => {
    // A nose is a body: it presents its base radius aft, so a nose into an oversized tube steps.
    const stepped = mouldLineSteps(rocket(nose("n", 0.02), tube("b", 0.03)));
    expect(stepped).toHaveLength(1);
    expect(stepped[0].diameterStep).toBeCloseTo(0.02, 12);
    expect(mouldLineSteps(rocket(nose("n", 0.03), tube("b", 0.03)))).toEqual([]);
  });

  it("puts the notice threshold above the corpus's rounding artefacts", () => {
    // 0.5 mm of diameter sits in the empty gap the corpus measurement found between six rounding
    // artefacts (≤0.292 mm, designs stated in inches) and 27 real steps (≥0.800 mm). A threshold
    // that drifted below it would fire on arithmetic instead of on geometry.
    expect(STEP_NOTICE_M).toBe(0.0005);
    const artefact = mouldLineSteps(rocket(tube("a", 0.03), tube("b", 0.030146)));
    expect(Math.abs(artefact[0].diameterStep)).toBeLessThan(STEP_NOTICE_M);
  });
});
