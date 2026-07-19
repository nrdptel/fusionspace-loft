import { describe, it, expect } from "vitest";
import { barrowman, aeroGeometry, dragCoefficient, skinFriction } from "./aero";
import { Atmosphere } from "./atmosphere";
import { flattenRocket } from "../model/geometry";
import type {
  Rocket,
  NoseCone,
  BodyTube,
  Transition,
  TrapezoidFinSet,
  GenericFinSet,
  NoseShape,
} from "../model/types";

/** A slender rocket whose nose shape/length and fin sweep can be varied, to probe how the
 *  transonic/supersonic wave drag responds to forebody and fin geometry. */
function shapedRocket(opts: { shape?: NoseShape; noseLength?: number; sweep?: number; fins?: boolean }): Rocket {
  const R = 0.05;
  const nose: NoseCone = {
    id: "n", name: "nose", kind: "nosecone", placement: { method: "after", offset: 0 },
    length: opts.noseLength ?? 0.4, aftRadius: R, shape: opts.shape ?? "ogive", shapeParameter: 0, children: [],
  };
  const body: BodyTube = {
    id: "b", name: "body", kind: "bodytube", placement: { method: "after", offset: 0 },
    outerRadius: R, thickness: 0.002, length: 1.2, children: [],
  };
  if (opts.fins) {
    const fins: TrapezoidFinSet = {
      id: "f", name: "fins", kind: "trapezoidfinset", placement: { method: "bottom", offset: 0 },
      finCount: 3, rootChord: 0.15, tipChord: 0.07, height: 0.08, sweepLength: opts.sweep ?? 0, thickness: 0.005, children: [],
    };
    body.children.push(fins);
  }
  return { name: "r", stages: [{ name: "s", components: [nose, body] }], configurations: [], referenceType: "maximum" };
}

function coneRocket(): Rocket {
  const nose: NoseCone = {
    id: "n",
    name: "nose",
    kind: "nosecone",
    placement: { method: "after", offset: 0 },
    length: 0.2,
    aftRadius: 0.025,
    shape: "conical",
    shapeParameter: 0,
    children: [],
  };
  const body: BodyTube = {
    id: "b",
    name: "body",
    kind: "bodytube",
    placement: { method: "after", offset: 0 },
    outerRadius: 0.025,
    thickness: 0.001,
    length: 0.6,
    children: [],
  };
  return {
    name: "cone",
    stages: [{ name: "s", components: [nose, body] }],
    configurations: [],
    referenceType: "maximum",
  };
}

describe("barrowman", () => {
  it("a cone nose has CNα = 2 and CP at 2/3 of its length", () => {
    const rocket = coneRocket();
    const st = barrowman(rocket);
    expect(st.cnAlpha).toBeCloseTo(2, 2);
    // Cone CP from tip = 2/3·L (body tubes add no normal force).
    expect(st.cp).toBeCloseTo((2 / 3) * 0.2, 2);
  });

  it("adding a fin set moves the CP aft and raises CNα", () => {
    const rocket = coneRocket();
    const fins: TrapezoidFinSet = {
      id: "f",
      name: "fins",
      kind: "trapezoidfinset",
      placement: { method: "bottom", offset: 0 },
      finCount: 3,
      rootChord: 0.1,
      tipChord: 0.05,
      height: 0.05,
      sweepLength: 0.05,
      thickness: 0.003,
      children: [],
    };
    rocket.stages[0].components[1].children.push(fins);
    const st = barrowman(rocket);
    expect(st.cnAlpha).toBeGreaterThan(2);
    expect(st.cp).toBeGreaterThan(0.4); // well aft of the nose
  });
});

describe("barrowman — elliptical fin CP (integrated over the elliptical planform)", () => {
  // A half-ellipse fin's chordwise centre of pressure is NOT the equal-area trapezoid's. Integrating
  // the Barrowman quarter-chord aerodynamic centre over the elliptical chord c(y)=cr·√(1−(y/s)²)
  // gives x̄ = (½ − 2/3π)·cr ≈ 0.288·cr from the root leading edge — the value an independent 6-DOF
  // engine (RocketPy) also uses. Reducing the planform to a trapezoid put it near 0.20·cr, too far
  // forward, which under-predicted stability.
  const CR = 0.1;
  const EXPECTED = (0.5 - 2 / (3 * Math.PI)) * CR; // ≈ 0.02878 m

  function ellipticalOnBody(): { rocket: Rocket; finXFore: number } {
    const nose: NoseCone = {
      id: "n", name: "nose", kind: "nosecone", placement: { method: "after", offset: 0 },
      length: 0.2, aftRadius: 0.025, shape: "conical", shapeParameter: 0, children: [],
    };
    const fins: GenericFinSet = {
      id: "f", name: "ellip", kind: "ellipticalfinset", placement: { method: "bottom", offset: 0 },
      finCount: 4, rootChord: CR, height: 0.06, area: (Math.PI * CR * 0.06) / 4,
      sweepLength: 0, thickness: 0.003, children: [],
    };
    const body: BodyTube = {
      id: "b", name: "body", kind: "bodytube", placement: { method: "after", offset: 0 },
      outerRadius: 0.025, thickness: 0.001, length: 0.6, children: [fins],
    };
    const rocket: Rocket = {
      name: "e", stages: [{ name: "s", components: [nose, body] }], configurations: [], referenceType: "maximum",
    };
    const finXFore = flattenRocket(rocket).find((p) => p.component.name === "ellip")!.xFore;
    return { rocket, finXFore };
  }

  it("places the elliptical fin CP at (½ − 2/3π)·cr ≈ 0.288·cr from the root leading edge", () => {
    const { rocket, finXFore } = ellipticalOnBody();
    const fin = barrowman(rocket).contributions.find((c) => c.source === "ellip")!;
    expect(fin.x - finXFore).toBeCloseTo(EXPECTED, 5);
  });

  it("sits aft of the equal-area trapezoid reduction (the old, too-forward estimate)", () => {
    const { rocket, finXFore } = ellipticalOnBody();
    const fin = barrowman(rocket).contributions.find((c) => c.source === "ellip")!;
    // Equal-area/equal-span trapezoid CP (unswept): tip = 2·meanChord − cr, xf via the trapezoid
    // formula — ≈ 0.20·cr. The elliptical value must be further aft (more stabilizing).
    const meanChord = ((Math.PI * CR * 0.06) / 4) / 0.06;
    const tip = 2 * meanChord - CR;
    const trapXf = (1 / 6) * (CR + tip - (CR * tip) / (CR + tip));
    expect(fin.x - finXFore).toBeGreaterThan(trapXf);
    expect(trapXf).toBeCloseTo(0.201 * CR, 2); // sanity on the old reduction value
  });

  it("still uses the trapezoid formula for a rectangular trapezoidal fin (CP at quarter chord)", () => {
    // Control: the change is scoped to elliptical fins. A rectangular fin's CP stays at 0.25·chord.
    const nose: NoseCone = {
      id: "n", name: "nose", kind: "nosecone", placement: { method: "after", offset: 0 },
      length: 0.2, aftRadius: 0.025, shape: "conical", shapeParameter: 0, children: [],
    };
    const fins: TrapezoidFinSet = {
      id: "f", name: "rect", kind: "trapezoidfinset", placement: { method: "bottom", offset: 0 },
      finCount: 3, rootChord: 0.1, tipChord: 0.1, height: 0.05, sweepLength: 0, thickness: 0.003, children: [],
    };
    const body: BodyTube = {
      id: "b", name: "body", kind: "bodytube", placement: { method: "after", offset: 0 },
      outerRadius: 0.025, thickness: 0.001, length: 0.6, children: [fins],
    };
    const rocket: Rocket = {
      name: "t", stages: [{ name: "s", components: [nose, body] }], configurations: [], referenceType: "maximum",
    };
    const finXFore = flattenRocket(rocket).find((p) => p.component.name === "rect")!.xFore;
    const fin = barrowman(rocket).contributions.find((c) => c.source === "rect")!;
    expect(fin.x - finXFore).toBeCloseTo(0.25 * 0.1, 5);
  });
});

describe("elliptical fin leading-edge sweep (drag)", () => {
  // A half-ellipse fin's tip sits at mid-root-chord, so its leading edge sweeps back ~cr/2 over the
  // span. Treating it as unswept (its stored sweepLength is 0) over-counts the leading-edge
  // stagnation pressure drag — measured ~+22% on the fins of a real minimum-diameter design
  // (OpenRocket's elliptical_v1.9) against that file's stored per-step Cd. The drag sweep factor
  // must reflect the cr/2 leading-edge sweep.
  const CR = 0.09;
  const SPAN = 0.08;
  function withFin(fin: GenericFinSet | TrapezoidFinSet): Rocket {
    const nose: NoseCone = {
      id: "n", name: "nose", kind: "nosecone", placement: { method: "after", offset: 0 },
      length: 0.2, aftRadius: 0.025, shape: "ogive", shapeParameter: 0, children: [],
    };
    const body: BodyTube = {
      id: "b", name: "body", kind: "bodytube", placement: { method: "after", offset: 0 },
      outerRadius: 0.025, thickness: 0.001, length: 0.6, children: [fin],
    };
    return { name: "x", stages: [{ name: "s", components: [nose, body] }], configurations: [], referenceType: "maximum" };
  }
  const ellip: GenericFinSet = {
    id: "f", name: "e", kind: "ellipticalfinset", placement: { method: "bottom", offset: 0 },
    finCount: 4, rootChord: CR, height: SPAN, area: (Math.PI * CR * SPAN) / 4,
    sweepLength: 0, thickness: 0.003, crossSection: "square", children: [],
  };

  it("applies the cr/2 leading-edge sweep to the drag sweep factor (not unswept)", () => {
    const f = aeroGeometry(withFin(ellip)).finSweepFactor;
    const cosL = Math.cos(Math.atan2(CR / 2, SPAN));
    expect(f).toBeCloseTo(cosL * cosL, 6);
    expect(f).toBeLessThan(1); // NOT treated as an unswept perpendicular edge
  });

  it("drags less than the same fin modelled as an unswept rectangle of equal frontal area", () => {
    const atm = new Atmosphere().sample(0);
    const v = 0.25 * atm.speedOfSound;
    // A rectangular fin of the SAME frontal area (thickness × span) but a genuinely unswept LE.
    const rect: TrapezoidFinSet = {
      id: "f", name: "r", kind: "trapezoidfinset", placement: { method: "bottom", offset: 0 },
      finCount: 4, rootChord: CR, tipChord: CR, height: SPAN, sweepLength: 0, thickness: 0.003,
      crossSection: "square", children: [],
    };
    const ellipP = dragCoefficient(aeroGeometry(withFin(ellip)), atm, v).pressure;
    const rectP = dragCoefficient(aeroGeometry(withFin(rect)), atm, v).pressure;
    expect(ellipP).toBeLessThan(rectP); // the swept elliptical LE stagnates less
  });
});

/** A body-of-revolution segment: nose (fore radius) → transition → aft body (aft radius). The
 *  transition is the piece under test; the tubes carry no normal force so the whole-rocket CNα
 *  and the transition's own contribution coincide. */
function transitionRocket(foreR: number, aftR: number, transLen: number): Rocket {
  const noseLen = 0.1;
  const nose: NoseCone = {
    id: "n", name: "nose", kind: "nosecone", placement: { method: "after", offset: 0 },
    length: noseLen, aftRadius: foreR, shape: "conical", shapeParameter: 0, children: [],
  };
  const trans: Transition = {
    id: "t", name: "trans", kind: "transition", placement: { method: "after", offset: 0 },
    length: transLen, foreRadius: foreR, aftRadius: aftR, shape: "conical", shapeParameter: 0, children: [],
  };
  const body: BodyTube = {
    id: "b", name: "body", kind: "bodytube", placement: { method: "after", offset: 0 },
    outerRadius: Math.max(foreR, aftR), thickness: 0.001, length: 0.5, children: [],
  };
  return { name: "trans", stages: [{ name: "s", components: [nose, trans, body] }], configurations: [], referenceType: "maximum" };
}

describe("barrowman — conical transition (Barrowman body-of-revolution term)", () => {
  // CNα = 2·(r_aft² − r_fore²)/r_ref²; CP from the transition fore end =
  // (L/3)·[1 + (1 − f)/(1 − f²)] with f = r_fore/r_aft. (Barrowman 1967.)
  const contrib = (r: Rocket) => barrowman(r).contributions.find((c) => c.source === "trans")!;

  it("a shoulder (expanding) matches the hand-computed CNα and CP", () => {
    // fore 0.02 → aft 0.04 over 0.1 m; r_ref = 0.04 (the max radius).
    const c = contrib(transitionRocket(0.02, 0.04, 0.1));
    // CNα = 2·(0.04² − 0.02²)/0.04² = 2·0.75 = 1.5.
    expect(c.cnAlpha).toBeCloseTo(1.5, 4);
    // f = 0.5: x̄ = (0.1/3)·(1 + 0.5/0.75) = 0.05556 from the fore end; +0.1 nose ⇒ 0.15556 from tip.
    expect(c.x).toBeCloseTo(0.1 + (0.1 / 3) * (1 + 0.5 / 0.75), 5);
  });

  it("a boattail (contracting) contributes a negative (destabilizing) normal force", () => {
    // fore 0.04 → aft 0.02: CNα = 2·(0.02² − 0.04²)/0.04² = −1.5.
    const c = contrib(transitionRocket(0.04, 0.02, 0.1));
    expect(c.cnAlpha).toBeCloseTo(-1.5, 4);
  });

  it("a fore-radius-zero transition reproduces the cone-nose result (2, 2/3·L)", () => {
    // A transition from a point (r_fore = 0) to R is geometrically a cone — the transition branch
    // must agree with the independently-checked cone-nose term: CNα = 2, CP at 2/3·L from its tip.
    const c = contrib(transitionRocket(0, 0.04, 0.2));
    expect(c.cnAlpha).toBeCloseTo(2, 4);
    expect(c.x).toBeCloseTo(0.1 + (2 / 3) * 0.2, 5); // fore end sits 0.1 behind the tip
  });

  it("a boattail shifts the whole-rocket CP forward — the safety-relevant effect", () => {
    // Same finned rocket, with and without a tail boattail. The boattail's negative normal force
    // at the rear pulls the centre of pressure forward, reducing the static margin.
    const plain = coneRocket();
    const withBoat = coneRocket();
    const boat: Transition = {
      id: "bt", name: "boat", kind: "transition", placement: { method: "after", offset: 0 },
      length: 0.05, foreRadius: 0.025, aftRadius: 0.015, shape: "conical", shapeParameter: 0, children: [],
    };
    const fins: TrapezoidFinSet = {
      id: "f", name: "fins", kind: "trapezoidfinset", placement: { method: "bottom", offset: 0 },
      finCount: 3, rootChord: 0.08, tipChord: 0.04, height: 0.05, sweepLength: 0.03, thickness: 0.003, children: [],
    };
    plain.stages[0].components[1].children.push(fins);
    withBoat.stages[0].components[1].children.push({ ...fins });
    withBoat.stages[0].components.push(boat);
    expect(barrowman(withBoat).cp).toBeLessThan(barrowman(plain).cp);
  });
});

describe("dragCoefficient", () => {
  it("produces a sane subsonic Cd₀ and flags transonic", () => {
    const geom = aeroGeometry(coneRocket());
    const atm = new Atmosphere().sample(0);
    const sub = dragCoefficient(geom, atm, 100);
    expect(sub.cd).toBeGreaterThan(0.2);
    expect(sub.cd).toBeLessThan(1.2);
    expect(sub.extrapolated).toBe(false);
    const trans = dragCoefficient(geom, atm, 340);
    expect(trans.extrapolated).toBe(true);
  });

  it("applies the full base drag (not reduced during boost), matching OpenRocket's stored drag", () => {
    // OpenRocket's stored per-step drag carries the full 0.12 + 0.13·M² base drag throughout the
    // flight, powered or coasting; a blanket boost reduction under-drags a large-body / small-motor
    // design ~6× (a 195 mm body flying a 54 mm motor). Base drag is the full coefficient referenced
    // to the base area over the reference area, with no thrust-phase discount.
    const geom = aeroGeometry(coneRocket());
    const atm = new Atmosphere().sample(0);
    const mach = 80 / atm.speedOfSound;
    const base = dragCoefficient(geom, atm, 80).base;
    expect(base).toBeCloseTo((0.12 + 0.13 * mach * mach) * (geom.baseArea / geom.refArea), 6);
    expect(base).toBeGreaterThan(0);
  });
});

describe("fin cross-section pressure drag", () => {
  const atm = new Atmosphere().sample(0);
  const finned = (cs?: "square" | "rounded" | "airfoil"): Rocket => {
    const r = shapedRocket({ fins: true, sweep: 0.02 });
    const fins = r.stages[0].components[1].children[0] as TrapezoidFinSet;
    fins.crossSection = cs;
    return r;
  };

  it("defaults an unspecified fin cross-section to square", () => {
    expect(aeroGeometry(finned(undefined)).finCrossSection).toBe("square");
  });

  it("orders pressure drag square > rounded > airfoil for the same fin", () => {
    const cd = (cs?: "square" | "rounded" | "airfoil") =>
      dragCoefficient(aeroGeometry(finned(cs)), atm, 0.25 * atm.speedOfSound).pressure;
    const square = cd("square");
    const rounded = cd("rounded");
    const airfoil = cd("airfoil");
    expect(square).toBeGreaterThan(rounded);
    expect(rounded).toBeGreaterThan(airfoil);
    // A square edge is a first-order pressure-drag contributor, not a rounding error: it should
    // add well more than the airfoil case, which has only the small transonic rise (≈0 here).
    expect(square - airfoil).toBeGreaterThan(0.05);
  });

  it("a swept leading edge reduces square-fin pressure drag (cos²Λ)", () => {
    const straight = shapedRocket({ fins: true, sweep: 0 });
    const swept = shapedRocket({ fins: true, sweep: 0.08 });
    const p = (r: Rocket) => dragCoefficient(aeroGeometry(r), atm, 0.25 * atm.speedOfSound).pressure;
    expect(p(swept)).toBeLessThan(p(straight));
  });
});

describe("fins split across single-fin sets (real-file pattern)", () => {
  const atm = new Atmosphere().sample(0);
  // Some designs model N fins as N separate one-fin sets rather than one N-fin set (e.g. the
  // OpenRocket "ARC payload" example: three trapezoid sets, fincount 1 each). Their fin frontal
  // area — hence fin pressure drag — must match the equivalent single N-fin set. Deriving it from
  // the largest single set alone (the old max·thickness·span) under-counted such a design ~N×,
  // reading ~60% low on the ARC design's coast pressure against OpenRocket's stored per-step Cd.
  const oneSet = shapedRocket({ fins: true });
  const threeSets = shapedRocket({ fins: true });
  {
    const body = threeSets.stages[0].components[1] as BodyTube;
    const one = body.children[0] as TrapezoidFinSet;
    body.children = [0, 1, 2].map((i) => ({ ...one, id: `f${i}`, finCount: 1 }));
  }

  it("sums fin frontal area over sets, matching one N-fin set", () => {
    expect(aeroGeometry(threeSets).finFrontalArea).toBeCloseTo(aeroGeometry(oneSet).finFrontalArea, 10);
  });

  it("gives the same fin wetted area and pressure drag as one N-fin set", () => {
    expect(aeroGeometry(threeSets).finWettedArea).toBeCloseTo(aeroGeometry(oneSet).finWettedArea, 10);
    const p = (r: Rocket) => dragCoefficient(aeroGeometry(r), atm, 0.25 * atm.speedOfSound).pressure;
    expect(p(threeSets)).toBeCloseTo(p(oneSet), 10);
  });

  it("counts more than the single largest set (guards the old max-only bug)", () => {
    // Each split set has one fin; the frontal area must exceed a single fin's, i.e. it is summed.
    const oneFin = shapedRocket({ fins: true });
    (oneFin.stages[0].components[1] as BodyTube).children[0] = {
      ...(oneFin.stages[0].components[1] as BodyTube).children[0],
      finCount: 1,
    } as TrapezoidFinSet;
    expect(aeroGeometry(threeSets).finFrontalArea).toBeGreaterThan(
      aeroGeometry(oneFin).finFrontalArea * 2.5,
    );
  });
});

describe("shoulder pressure drag (Niskanen eq. 3.86)", () => {
  const atm = new Atmosphere().sample(0);
  // Cd·A = 0.8·sin²φ·(A_aft − A_fore), φ = atan((r_aft − r_fore)/L), over an expanding transition.
  it("matches the hand-computed 0.8·sin²φ·ΔA for a shoulder", () => {
    const geom = aeroGeometry(transitionRocket(0.02, 0.04, 0.1)); // fore 0.02 → aft 0.04 over 0.1 m
    const phi = Math.atan2(0.04 - 0.02, 0.1);
    const dA = Math.PI * (0.04 ** 2 - 0.02 ** 2);
    expect(geom.shoulderPressureCdA).toBeCloseTo(0.8 * Math.sin(phi) ** 2 * dA, 8);
  });

  it("adds nothing for a boattail (contracting transition)", () => {
    // A boattail's drag effect is the reduced base area, handled separately — no shoulder term.
    expect(aeroGeometry(transitionRocket(0.04, 0.02, 0.1)).shoulderPressureCdA).toBe(0);
  });

  it("grows as the shoulder gets steeper (shorter for the same rise)", () => {
    const gentle = aeroGeometry(transitionRocket(0.02, 0.04, 0.2)).shoulderPressureCdA;
    const steep = aeroGeometry(transitionRocket(0.02, 0.04, 0.05)).shoulderPressureCdA;
    expect(steep).toBeGreaterThan(gentle);
  });

  it("approaches the 0.8·ΔA stagnation limit for a near-flat step", () => {
    // φ → 90° (a step) ⇒ sin²φ → 1 ⇒ Cd·A → 0.8·ΔA.
    const geom = aeroGeometry(transitionRocket(0.02, 0.04, 0.001));
    const dA = Math.PI * (0.04 ** 2 - 0.02 ** 2);
    expect(geom.shoulderPressureCdA).toBeCloseTo(0.8 * dA, 4);
  });

  it("raises total pressure drag for a shoulder over a plain (transition-free) body", () => {
    const cd = (r: Rocket) => dragCoefficient(aeroGeometry(r), atm, 0.3 * atm.speedOfSound).pressure;
    const plain = cd(shapedRocket({})); // nose + body, no transition
    const shoulder = cd(transitionRocket(0.02, 0.04, 0.1));
    expect(shoulder).toBeGreaterThan(plain);
  });
});

describe("boattail pressure drag (Niskanen eq. 3.88)", () => {
  const atm = new Atmosphere().sample(0);
  // A boattail at the tail: nose → body(R) → contracting transition(R → aftR) over L. Omitting
  // the transition (L = 0) gives the plain body it collapses to.
  const boattailTail = (bodyR: number, aftR: number, L: number): Rocket => {
    const nose: NoseCone = { id: "n", name: "n", kind: "nosecone", placement: { method: "after", offset: 0 }, length: 0.1, aftRadius: bodyR, shape: "ogive", shapeParameter: 0, children: [] };
    const body: BodyTube = { id: "b", name: "b", kind: "bodytube", placement: { method: "after", offset: 0 }, outerRadius: bodyR, thickness: 0.001, length: 0.4, children: [] };
    const boat: Transition = { id: "t", name: "boat", kind: "transition", placement: { method: "after", offset: 0 }, length: L, foreRadius: bodyR, aftRadius: aftR, shape: "conical", shapeParameter: 0, children: [] };
    const components = L > 0 ? [nose, body, boat] : [nose, body];
    return { name: "bt", stages: [{ name: "s", components }], configurations: [], referenceType: "maximum" };
  };

  it("matches the hand-computed f(γ)·ΔA geometry factor", () => {
    // fore 0.04 → aft 0.02 over 0.1 m: γ = L/(d_fore − d_aft) = 0.1/0.04 = 2.5 ⇒ f = (3−2.5)/2 = 0.25.
    const geom = aeroGeometry(boattailTail(0.04, 0.02, 0.1));
    const dA = Math.PI * (0.04 ** 2 - 0.02 ** 2);
    expect(geom.boattailPressureArea).toBeCloseTo(0.25 * dA, 8);
  });

  it("adds nothing for a shoulder, or for a gentle boattail (γ ≥ 3)", () => {
    expect(aeroGeometry(transitionRocket(0.02, 0.04, 0.1)).boattailPressureArea).toBe(0); // shoulder
    // γ = 0.2/0.04 = 5 ≥ 3 ⇒ f = 0.
    expect(aeroGeometry(boattailTail(0.04, 0.02, 0.2)).boattailPressureArea).toBe(0);
  });

  it("grows as the boattail gets steeper (shorter for the same reduction)", () => {
    const gentle = aeroGeometry(boattailTail(0.04, 0.02, 0.1)).boattailPressureArea; // γ=2.5, f=0.25
    const steep = aeroGeometry(boattailTail(0.04, 0.02, 0.02)).boattailPressureArea; // γ=0.5, f=1
    expect(steep).toBeGreaterThan(gentle);
  });

  it("a vanishingly short boattail nets to no base+pressure change (the eq. 3.88 limit)", () => {
    // At L → 0 the boattail pressure drag exactly recovers the base drag the contraction removes,
    // so base + pressure matches the plain full-width body. (γ → 0 ⇒ f = 1.) Only the slant
    // surface's own skin friction — a separate term — distinguishes them, so compare base+pressure.
    const bp = (r: Rocket) => {
      const d = dragCoefficient(aeroGeometry(r), atm, 0.3 * atm.speedOfSound);
      return d.base + d.pressure;
    };
    const plain = bp(boattailTail(0.04, 0.02, 0)); // no transition — base on the full 0.04 body
    const shortBoat = bp(boattailTail(0.04, 0.02, 1e-4)); // base shrinks to 0.02, boattail makes it up
    expect(shortBoat).toBeCloseTo(plain, 4);
  });

  it("a moderate boattail raises Cd over a gentle (drag-free) one of the same reduction", () => {
    const cd = (r: Rocket) => dragCoefficient(aeroGeometry(r), atm, 0.3 * atm.speedOfSound).pressure;
    expect(cd(boattailTail(0.04, 0.02, 0.05))).toBeGreaterThan(cd(boattailTail(0.04, 0.02, 0.2)));
  });
});

describe("nose pressure drag (Niskanen eq. 3.86)", () => {
  const atm = new Atmosphere().sample(0);
  // shapedRocket uses a base radius of 0.05 m; noseLength varies the fineness.
  const R = 0.05;

  it("is zero for a tangent nose (ogive, ellipsoid, Haack)", () => {
    for (const shape of ["ogive", "ellipsoid", "haack"] as const) {
      expect(aeroGeometry(shapedRocket({ shape, noseLength: 0.2 })).nosePressureCdA).toBeCloseTo(0, 6);
    }
  });

  it("matches 0.8·sin²φ·A_base for a cone, φ = atan(R/L)", () => {
    const L = 0.2;
    const geom = aeroGeometry(shapedRocket({ shape: "conical", noseLength: L }));
    const s = R / L; // tan φ
    const expected = 0.8 * ((s * s) / (1 + s * s)) * Math.PI * R * R;
    expect(geom.nosePressureCdA).toBeCloseTo(expected, 7);
  });

  it("grows as a cone gets blunter (shorter for the same base)", () => {
    const slender = aeroGeometry(shapedRocket({ shape: "conical", noseLength: 0.4 })).nosePressureCdA;
    const blunt = aeroGeometry(shapedRocket({ shape: "conical", noseLength: 0.1 })).nosePressureCdA;
    expect(blunt).toBeGreaterThan(slender);
  });

  it("raises total pressure drag for a cone nose over an ogive of the same size", () => {
    const p = (shape: "conical" | "ogive") =>
      dragCoefficient(aeroGeometry(shapedRocket({ shape, noseLength: 0.2 })), atm, 0.3 * atm.speedOfSound).pressure;
    expect(p("conical")).toBeGreaterThan(p("ogive"));
  });
});

describe("wave drag is geometry-aware", () => {
  const atm = new Atmosphere().sample(2000);
  const waveAt = (r: Rocket, M: number) =>
    dragCoefficient(aeroGeometry(r), atm, M * atm.speedOfSound).wave;

  it("ranks nose contours by published wave-drag order (Von Kármán lowest, cone highest)", () => {
    // Same fineness, only the contour differs. Ordering follows the published nose-shape drag
    // comparison: Haack/Von Kármán < parabolic < power < ogive < ellipsoid < conical.
    const order: NoseShape[] = ["haack", "parabolic", "power", "ogive", "ellipsoid", "conical"];
    for (const M of [1.15, 2]) {
      const waves = order.map((shape) => waveAt(shapedRocket({ shape, noseLength: 0.4 }), M));
      for (let i = 1; i < waves.length; i++) {
        expect(waves[i]).toBeGreaterThan(waves[i - 1]);
      }
    }
  });

  it("falls as the nose gets more slender (higher fineness)", () => {
    let prev = Infinity;
    for (const noseLength of [0.2, 0.3, 0.4, 0.6, 0.8]) {
      const w = waveAt(shapedRocket({ shape: "ogive", noseLength }), 1.15);
      expect(w).toBeLessThan(prev);
      prev = w;
    }
    // A stubby (fineness 2) nose has markedly more wave drag than a slender (fineness 8) one.
    expect(waveAt(shapedRocket({ shape: "ogive", noseLength: 0.2 }), 1.15)).toBeGreaterThan(
      1.8 * waveAt(shapedRocket({ shape: "ogive", noseLength: 0.8 }), 1.15),
    );
  });

  it("reduces fin wave drag as the leading edge sweeps back", () => {
    const straight = waveAt(shapedRocket({ fins: true, sweep: 0 }), 1.15);
    const swept = waveAt(shapedRocket({ fins: true, sweep: 0.15 }), 1.15);
    expect(swept).toBeLessThan(straight);
  });

  it("stays zero below the critical Mach and bounded through supersonic", () => {
    const r = shapedRocket({ shape: "conical", noseLength: 0.2, fins: true, sweep: 0 });
    expect(waveAt(r, 0.7)).toBe(0);
    for (const M of [0.85, 1.15, 2, 3.5, 5]) {
      const w = waveAt(r, M);
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThanOrEqual(1.2);
    }
  });
});

describe("protuberance (launch-lug / rail-button) drag", () => {
  const atm = new Atmosphere().sample(0);
  // A small model rocket (24 mm body) with an optional launch lug of the given outer radius.
  function withLug(lugRadius?: number, count = 1): Rocket {
    const R = 0.012;
    const nose: NoseCone = {
      id: "n", name: "n", kind: "nosecone", placement: { method: "after", offset: 0 },
      length: 0.07, aftRadius: R, shape: "ogive", shapeParameter: 0, children: [],
    };
    const body: BodyTube = {
      id: "b", name: "b", kind: "bodytube", placement: { method: "after", offset: 0 },
      outerRadius: R, thickness: 0.0005, length: 0.3, children: [],
    };
    if (lugRadius) {
      body.children.push({
        id: "l", name: "lug", kind: "launchlug", placement: { method: "top", offset: 0.15 },
        radius: lugRadius, instanceCount: count, children: [],
      });
    }
    return { name: "r", stages: [{ name: "s", components: [nose, body] }], configurations: [], referenceType: "maximum" };
  }
  const cdAt = (r: Rocket, v = 60) => dragCoefficient(aeroGeometry(r), atm, v);

  it("adds no protuberance area when the design has no fittings", () => {
    expect(aeroGeometry(withLug()).protuberanceArea).toBe(0);
  });

  it("a launch lug raises Cd over the same rocket without one", () => {
    const bare = cdAt(withLug());
    const lugged = cdAt(withLug(0.003));
    expect(lugged.cd).toBeGreaterThan(bare.cd);
    // The extra drag lands in the pressure/parasitic term, not friction or base.
    expect(lugged.pressure).toBeGreaterThan(bare.pressure);
    expect(lugged.friction).toBeCloseTo(bare.friction, 6);
    expect(lugged.base).toBeCloseTo(bare.base, 6);
  });

  it("bigger lugs and more of them add more drag (monotonic in frontal area)", () => {
    const cds = [0.002, 0.003, 0.004].map((r) => cdAt(withLug(r)).cd);
    expect(cds[1]).toBeGreaterThan(cds[0]);
    expect(cds[2]).toBeGreaterThan(cds[1]);
    // Frontal area scales with instance count.
    expect(aeroGeometry(withLug(0.003, 2)).protuberanceArea).toBeCloseTo(
      2 * aeroGeometry(withLug(0.003, 1)).protuberanceArea,
      9,
    );
  });

  it("is a small fraction on a slender HPR body but a real bite on a small rocket", () => {
    // Same 3 mm lug: on a 24 mm model rocket it is a few percent of Cd; on a wide body it is
    // negligible — the drag is self-targeting to the small, drag-dominated designs.
    const modelDelta = cdAt(withLug(0.003)).cd - cdAt(withLug()).cd;
    expect(modelDelta).toBeGreaterThan(0.01);
    expect(modelDelta).toBeLessThan(0.1);
  });
});

describe("skinFriction", () => {
  it("decreases with Reynolds number in the turbulent regime", () => {
    const a = skinFriction(1e6, 1e-6, 1, 0);
    const b = skinFriction(1e7, 1e-6, 1, 0);
    expect(b).toBeLessThan(a);
    expect(a).toBeGreaterThan(0);
  });

  it("rises at low Reynolds number — a rocket boundary layer is turbulent, not laminar", () => {
    // A small, slow rocket's coast friction climbs as it slows. With a realistic painted finish the
    // smooth turbulent Cf overtakes the roughness floor at low Re, so friction there is materially
    // higher than at high speed — matching OpenRocket's stored per-step drag. (The removed laminar
    // 1.328/√Re branch would instead dip below the floor and wrongly pin friction flat.)
    const rough = 60e-6;
    const L = 0.4;
    const cfLowRe = skinFriction(1.3e5, rough, L, 0);
    const cfHighRe = skinFriction(2e6, rough, L, 0);
    expect(cfLowRe).toBeGreaterThan(cfHighRe * 1.15);
  });

  it("never dips as Reynolds falls (no laminar branch)", () => {
    // Regression against the old laminar branch, which made Cf non-monotonic — a drop below the
    // roughness floor around Re 5e5. Near-smooth so the floor doesn't mask the shape.
    let prev = 0;
    for (const re of [5e6, 1e6, 5e5, 2e5, 1e5, 5e4, 2e4]) {
      const cf = skinFriction(re, 1e-7, 0.4, 0);
      expect(cf).toBeGreaterThanOrEqual(prev - 1e-9); // non-decreasing as Re drops
      prev = cf;
    }
  });

  it("stays strictly positive across the full Mach range (never negative supersonic)", () => {
    // Regression: the compressibility correction must not drive friction negative — a naive
    // (1 − 0.1·M²) factor went negative past ~Mach 3.16.
    for (const M of [0, 0.5, 1, 2, 3.2, 4, 5]) {
      const cf = skinFriction(5e6, 20e-6, 0.9, M);
      expect(cf).toBeGreaterThan(0);
      expect(Number.isFinite(cf)).toBe(true);
    }
  });

  it("total Cd stays positive and finite from subsonic through supersonic", () => {
    const geom = aeroGeometry(coneRocket());
    const atm = new Atmosphere().sample(3000);
    for (const M of [0.3, 0.8, 1.5, 2.5, 3.2, 4, 5]) {
      const cd = dragCoefficient(geom, atm, M * atm.speedOfSound).cd;
      expect(cd).toBeGreaterThan(0);
      expect(Number.isFinite(cd)).toBe(true);
    }
  });

  it("follows the published Cd–Mach shape: subsonic flat, transonic peak, supersonic decline", () => {
    const geom = aeroGeometry(coneRocket());
    const atm = new Atmosphere().sample(2000);
    const cdAt = (M: number) => dragCoefficient(geom, atm, M * atm.speedOfSound).cd;

    // Find the peak over a Mach sweep; it must sit in the transonic band, not at M5.
    let peakM = 0;
    let peakCd = 0;
    for (let M = 0.2; M <= 5; M += 0.05) {
      const cd = cdAt(M);
      if (cd > peakCd) { peakCd = cd; peakM = M; }
    }
    expect(peakM).toBeGreaterThan(1.0);
    expect(peakM).toBeLessThan(1.5);

    // Subsonic is a sane rocket Cd₀; the peak is bounded; supersonic declines below it.
    expect(cdAt(0.3)).toBeGreaterThan(0.3);
    expect(cdAt(0.3)).toBeLessThan(0.9);
    expect(peakCd).toBeLessThan(1.5);
    expect(cdAt(3)).toBeLessThan(peakCd);
    expect(cdAt(5)).toBeLessThan(cdAt(3)); // still declining, not growing
    expect(cdAt(5)).toBeGreaterThan(0.2); // toward a physical slender-body plateau
  });
});
