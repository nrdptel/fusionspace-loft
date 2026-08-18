import { describe, it, expect } from "vitest";

import { descentRoughWhy, noCpWhy } from "./withheld";
import type { Parachute, Rocket, RocketComponent } from "../model/types";

/** The shared reasons a surface withholds or qualifies a figure — `lib/sim/withheld.ts`.
 *
 *  `notLandedWhy` and `noDeploymentWhy` are driven over real flights by the corpus sweep.
 *  `descentRoughWhy` is a predicate over a ROCKET rather than a flight, so it is testable here, and
 *  it is tested here because of what it is for: **the same caveat has now gone missing from two
 *  surfaces in turn.** The validation table published landing sentinels the flight card was
 *  withholding, which is why the other two reasons moved into that module; and on 2026-08-18 the
 *  dispersion panel was found publishing RECOVERY RADIUS (95%) and a landing-speed band with no
 *  caveat while /flight badged the identical quantities EXTRAPOLATED, and /flight's own DRIFT FROM
 *  PAD tile sat between two badged neighbours carrying nothing. One condition, one wording, one
 *  module, and this file is what says the condition is right. */
function canopy(cdFrom: Parachute["cdFrom"]): Parachute {
  return {
    id: "chute",
    name: "Main",
    kind: "parachute",
    placement: { method: "top", offset: 0 },
    diameter: 0.6,
    cd: 0.8,
    cdFrom,
    deployEvent: "apogee",
    children: [],
  };
}

function withComponents(children: RocketComponent[]): Rocket {
  return {
    name: "probe",
    stages: [
      {
        name: "S",
        components: [
          {
            id: "tube",
            name: "Body",
            kind: "bodytube",
            placement: { method: "after", offset: 0 },
            length: 0.5,
            outerRadius: 0.019,
            children,
          },
        ],
      },
    ],
    configurations: [],
    referenceType: "maximum",
  };
}

describe("descentRoughWhy", () => {
  it("qualifies a descent flown on Loft's own canopy coefficient", () => {
    const why = descentRoughWhy(withComponents([canopy("default")]));
    expect(why).toBeTruthy();
    // Three things the sentence has to do, because `DESIGN.md` §5 says an extrapolated treatment
    // carries "the reason and the range it left": say whose number it is, say what follows from it,
    // and say where to change it.
    expect(why).toMatch(/fallback/i);
    expect(why).toMatch(/rough/i);
    expect(why).toMatch(/design/i);
  });

  it("says nothing about a coefficient the design or the flyer states", () => {
    // The whole point of `cdFrom`. A Cd the designer typed is the designer's claim and not Loft's to
    // caveat; marking every canopy would make the flag mean nothing, which is the failure mode
    // `Extrapolated` exists to avoid.
    expect(descentRoughWhy(withComponents([canopy("file")]))).toBeUndefined();
    expect(descentRoughWhy(withComponents([canopy("flyer")]))).toBeUndefined();
  });

  it("finds a fallback canopy wherever it sits in the tree, and reports nothing for no canopy", () => {
    // Nested, because a chute is a child of a tube or a payload bay rather than a top-level part on
    // every real design — a walk that only read the stage's own list would answer `undefined` for
    // every one of them and read exactly like a design that states its own Cd.
    const nested = withComponents([
      {
        id: "inner",
        name: "Payload bay",
        kind: "innertube",
        placement: { method: "top", offset: 0.1 },
        length: 0.2,
        outerRadius: 0.018,
        innerRadius: 0.017,
        children: [canopy("default")],
      },
    ]);
    expect(descentRoughWhy(nested)).toBeTruthy();

    // A design with nothing to descend under has no descent figures to qualify.
    expect(descentRoughWhy(withComponents([]))).toBeUndefined();
    expect(descentRoughWhy(null)).toBeUndefined();
    expect(descentRoughWhy(undefined)).toBeUndefined();
  });
});

describe("noCpWhy", () => {
  /** Barrowman contributions as the solver produces them: a normal-force slope and the station it
   *  acts at. Built by hand rather than flown, because the whole point of the rule is the ARITHMETIC
   *  of the quotient, and a hand-built set is the only way to walk it either side of the boundary. */
  const st = (cs: { cnAlpha: number; x: number }[]) => {
    const cnAlpha = cs.reduce((a, c) => a + c.cnAlpha, 0);
    const moment = cs.reduce((a, c) => a + c.cnAlpha * c.x, 0);
    return { cnAlpha, cp: cnAlpha !== 0 ? moment / cnAlpha : 0, contributions: cs };
  };

  it("says nothing about an ordinary rocket, boattail and all", () => {
    // The starter design's own shape, measured: nose 2.000 at 102.2 mm, fins 8.892 at 752.3 mm, and
    // a 150 mm boattail closing to 20 mm. The taper is negative and the answer is still a point on
    // the rocket, which is the case that must not be caveated — a flag every design wears means
    // nothing, which is the failure mode `DESIGN.md` §5 names for the whole withheld/extrapolated
    // vocabulary.
    expect(noCpWhy(st([{ cnAlpha: 2.0, x: 0.1022 }, { cnAlpha: 8.892, x: 0.7523 }]))).toBeUndefined();
    expect(noCpWhy(st([{ cnAlpha: 2.0, x: 0.1022 }, { cnAlpha: 6.5, x: 0.7523 }, { cnAlpha: -1.7, x: 0.9035 }]))).toBeUndefined();
  });

  it("withholds when the taper leaves the resultant off the parts that make it", () => {
    // The measured editor case: the starter with a 150 mm boattail closing to 20 mm and the fin span
    // taken to 20 mm — two typed fields, both in range. CNα is still POSITIVE at 1.545 and the CP
    // lands at −258.0 mm, 258 mm ahead of a nose tip at 102.2 mm. A test on the sign of CNα alone
    // reads this as fine, which is why the rule is the hull and not the sign.
    const why = noCpWhy(st([{ cnAlpha: 2.0, x: 0.1022 }, { cnAlpha: 1.245, x: 0.7523 }, { cnAlpha: -1.7, x: 0.9035 }]));
    expect(why).toBeTruthy();
    expect(why).toMatch(/taper/);
    expect(why).toMatch(/CN/);
    // It says what to change. A withheld figure with no route back is a dead end, and this one has
    // two — the same two fields that reached it.
    expect(why).toMatch(/fin area/);

    // And the negative-sum arm, which is where the corpus lands: `Show-off.CDX1`, CNα −1.93 /rad,
    // CP 913.4 mm against contributions spanning 9.8–583.3 mm, published until now as 12.81 cal.
    const showoff = st([
      { cnAlpha: 0.6038, x: 0.0098 },
      { cnAlpha: 1.0519, x: 0.2349 },
      { cnAlpha: -1.9832, x: 0.5512 },
      { cnAlpha: -1.9832, x: 0.5766 },
      { cnAlpha: 0.385, x: 0.5833 },
    ]);
    expect(showoff.cnAlpha).toBeLessThan(0);
    expect(noCpWhy(showoff)).toBeTruthy();
  });

  it("does NOT withhold a CP that is off the AIRFRAME but inside its own contributions", () => {
    // **The control on the rule's own scope, and the case that corrected it.** `parameterSweep`
    // slides a fin set to 1,005 mm on a 950 mm rocket; the CP follows to 953.6 mm, past the tail,
    // with every contribution positive and CNα a healthy 18.5 /rad. That CP is arithmetically right
    // for the rocket being described. What is wrong there is that the editor let a fin set hang in
    // space behind the airframe — a different defect, filed as one — and a first version of this
    // rule tested the airframe's LENGTH and would have hidden it behind a caveat about couples.
    expect(noCpWhy(st([{ cnAlpha: 2.0, x: 0.1022 }, { cnAlpha: 16.5, x: 1.005 }]))).toBeUndefined();
  });

  it("says the other true thing when nothing carries normal force at all", () => {
    // Reachable by removing the nose cone and the fin set. "Less taper" is advice this design cannot
    // act on, so it gets its own sentence rather than the taper one.
    const why = noCpWhy({ cnAlpha: 0, cp: 0, contributions: [] });
    expect(why).toMatch(/nothing on this design carries normal force/i);
    expect(why).not.toMatch(/taper/);
    // A tube-only design whose one contribution is a degenerate zero reads the same way — the walk
    // has to filter zero-weight terms, or the hull collapses onto a station nothing acts at.
    expect(noCpWhy({ cnAlpha: 0, cp: 0, contributions: [{ cnAlpha: 0, x: 0.4 }] })).toMatch(/nothing on this design/i);
  });

  it("keeps a single-contribution design, where the CP IS the hull", () => {
    // A nose cone and nothing else: lo === hi === cp, so a strict inequality would withhold every
    // one of them. The boundary is inclusive with a micron of slack, and this is what says so.
    expect(noCpWhy(st([{ cnAlpha: 2.0, x: 0.1022 }]))).toBeUndefined();
  });
});
