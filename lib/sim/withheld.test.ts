import { describe, it, expect } from "vitest";

import { descentRoughWhy } from "./withheld";
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
