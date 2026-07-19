import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { combine, dryMassProperties, finChordCentroid, structurePointMasses } from "./mass";
import { flattenRocket } from "../model/geometry";
import { importOrk } from "../ork/import";
import type { Rocket, BodyTube, MassComponent, GenericFinSet, NoseCone } from "../model/types";

const MAT = { name: "x", density: 1000, type: "bulk" as const };

/** A 1 m body tube (OD 0.05, wall 0.001) whose geometric mass is small next to the
 *  overrides under test, so the assertions read cleanly. */
function tube(over: Partial<BodyTube>, children: MassComponent[] = []): BodyTube {
  return {
    id: "b",
    name: "tube",
    kind: "bodytube",
    placement: { method: "after", offset: 0 },
    material: MAT,
    outerRadius: 0.025,
    thickness: 0.001,
    length: 1.0,
    children,
    ...over,
  };
}

function ballast(mass: number, offset: number): MassComponent {
  return {
    id: "m",
    name: "ballast",
    kind: "masscomponent",
    placement: { method: "top", offset },
    mass,
    length: 0.05,
    children: [],
  };
}

function rocketOf(root: BodyTube): Rocket {
  return {
    name: "t",
    stages: [{ name: "s", components: [root] }],
    configurations: [],
    referenceType: "maximum",
  };
}

describe("combine", () => {
  it("computes CG as a mass-weighted mean and inertia by parallel axis", () => {
    const mp = combine([
      { mass: 1, cg: 0, ownInertia: 0, source: "a" },
      { mass: 1, cg: 2, ownInertia: 0, source: "b" },
    ]);
    expect(mp.mass).toBe(2);
    expect(mp.cg).toBe(1);
    // Two 1 kg points at ±1 m from the CG → I = 2·(1·1²) = 2.
    expect(mp.inertia).toBeCloseTo(2, 6);
  });
});

describe("finChordCentroid", () => {
  it("is at mid-chord for a rectangular fin with no sweep", () => {
    expect(finChordCentroid(0.1, 0.1, 0)).toBeCloseTo(0.05, 6);
  });
  it("moves aft with leading-edge sweep", () => {
    expect(finChordCentroid(0.1, 0.05, 0.05)).toBeGreaterThan(0.05);
  });
});

describe("dryMassProperties", () => {
  it("computes a hollow body tube's mass from geometry", () => {
    // 1 m tube, OD 0.05 m, wall 0.001 m, density 1000 kg/m³.
    const ro = 0.025;
    const ri = ro - 0.001;
    const expected = Math.PI * (ro * ro - ri * ri) * 1.0 * 1000;
    const tube: BodyTube = {
      id: "b",
      name: "tube",
      kind: "bodytube",
      placement: { method: "after", offset: 0 },
      material: { name: "x", density: 1000, type: "bulk" },
      outerRadius: ro,
      thickness: 0.001,
      length: 1.0,
      children: [],
    };
    const rocket: Rocket = {
      name: "t",
      stages: [{ name: "s", components: [tube] }],
      configurations: [],
      referenceType: "maximum",
    };
    const mp = dryMassProperties(rocket);
    expect(mp.mass).toBeCloseTo(expected, 5);
    expect(mp.cg).toBeCloseTo(0.5, 3); // mid-length
  });
});

describe("nose/transition shoulder mass", () => {
  const MAT2 = { name: "x", density: 1200, type: "bulk" as const };
  const noseBase = (over: Partial<NoseCone> = {}): NoseCone => ({
    id: "n",
    name: "nose",
    kind: "nosecone",
    placement: { method: "top", offset: 0 },
    material: MAT2,
    length: 0.1,
    aftRadius: 0.0125,
    thickness: 0.002,
    shape: "ogive",
    children: [],
    ...over,
  });
  const massOf = (n: NoseCone) =>
    dryMassProperties({ name: "t", stages: [{ name: "s", components: [n] }], configurations: [], referenceType: "maximum" }).mass;

  it("adds a shoulder's tube mass, isolated as the delta from the same nose without one", () => {
    const r = 0.0119, len = 0.02, t = 0.0022;
    const ri = r - t;
    const expected = Math.PI * (r * r - ri * ri) * len * MAT2.density; // hollow collar
    const delta = massOf(noseBase({ aftShoulderRadius: r, aftShoulderLength: len, aftShoulderThickness: t })) - massOf(noseBase());
    expect(delta).toBeCloseTo(expected, 6);
  });

  it("a capped shoulder adds the bulkhead disc", () => {
    const r = 0.0119, len = 0.02, t = 0.0022;
    const open = massOf(noseBase({ aftShoulderRadius: r, aftShoulderLength: len, aftShoulderThickness: t }));
    const capped = massOf(noseBase({ aftShoulderRadius: r, aftShoulderLength: len, aftShoulderThickness: t, aftShoulderCapped: true }));
    const ri = r - t;
    const expectedCap = Math.PI * ri * ri * Math.min(t, len) * MAT2.density;
    expect(capped - open).toBeCloseTo(expectedCap, 6);
  });

  it("shifts the CG aft (the collar sits below the nose base)", () => {
    const withS = dryMassProperties({
      name: "t",
      stages: [{ name: "s", components: [noseBase({ aftShoulderRadius: 0.0119, aftShoulderLength: 0.02, aftShoulderThickness: 0.0022 })] }],
      configurations: [],
      referenceType: "maximum",
    });
    const without = dryMassProperties({
      name: "t",
      stages: [{ name: "s", components: [noseBase()] }],
      configurations: [],
      referenceType: "maximum",
    });
    expect(withS.cg).toBeGreaterThan(without.cg);
  });

  it("no shoulder ⇒ no change", () => {
    expect(massOf(noseBase({ aftShoulderLength: 0 }))).toBeCloseTo(massOf(noseBase()), 9);
  });
});

describe("elliptical fin mass CG", () => {
  it("places the CG at the symmetric half-ellipse area centroid, 0.5·root chord", () => {
    // Every spanwise strip of a symmetric half-ellipse fin is centred at c_root/2, so the whole
    // fin's chordwise area centroid is exactly 0.5·c_root — not the ~0.42·c_root the fin set once
    // shared with freeform planforms.
    const CR = 0.12;
    const fin: GenericFinSet = {
      id: "f", name: "ellip", kind: "ellipticalfinset", placement: { method: "bottom", offset: 0 },
      material: MAT, finCount: 3, rootChord: CR, height: 0.06, area: (Math.PI * CR * 0.06) / 4,
      sweepLength: 0, thickness: 0.004, children: [],
    };
    const body = tube({});
    body.children = [fin];
    const rocket = rocketOf(body);
    const finXFore = flattenRocket(rocket).find((p) => p.component.name === "ellip")!.xFore;
    const finPt = structurePointMasses(rocket).find((p) => p.source === "ellip")!;
    expect(finPt.cg - finXFore).toBeCloseTo(0.5 * CR, 6);
  });
});

describe("override-subcomponents mass (OpenRocket assembly weight)", () => {
  it("subsumes children's mass into the stated assembly mass — no double-count", () => {
    // A section weighed as a whole: the tube states 0.5 kg for the assembly and carries a
    // 2 kg ballast inside. OpenRocket's "override mass of all subcomponents" makes 0.5 kg the
    // WHOLE section's mass; the ballast must not be added on top.
    const root = tube(
      { overrideMass: 0.5, overrideSubcomponents: true },
      [ballast(2.0, 0.2)],
    );
    const mp = dryMassProperties(rocketOf(root));
    expect(mp.mass).toBeCloseTo(0.5, 6);
    // The lumped mass sits at the overriding component's own CG (mid-tube), matching OpenRocket.
    expect(mp.cg).toBeCloseTo(0.5, 6);
  });

  it("adds the child's mass when the override is NOT flagged for subcomponents", () => {
    // Same numbers, but the override applies only to the tube itself — the ballast counts too.
    const root = tube({ overrideMass: 0.5 }, [ballast(2.0, 0.2)]);
    const mp = dryMassProperties(rocketOf(root));
    expect(mp.mass).toBeCloseTo(2.5, 6);
  });

  it("lets the outermost subtree override win over a nested one", () => {
    // Root overrides its whole subtree at 1 kg; an inner section separately claims 5 kg with
    // its own subcomponents override. The outer override subsumes everything — total is 1 kg.
    const inner = tube(
      { id: "inner", name: "inner", overrideMass: 5, overrideSubcomponents: true, placement: { method: "top", offset: 0.3 } },
      [ballast(3.0, 0.1)],
    );
    const root = tube({ overrideMass: 1, overrideSubcomponents: true });
    root.children = [inner];
    const mp = dryMassProperties(rocketOf(root));
    expect(mp.mass).toBeCloseTo(1, 6);
  });

  it("honours a mass override placed on the STAGE assembly (not a component)", () => {
    // A stage is a component assembly in OpenRocket, so it can state a measured weight for the
    // whole stage. Here the stage carries a 2 kg tube and a 3 kg ballast (5 kg of parts) but is
    // overridden to weigh 1.5 kg for the assembly — the parts must not be added on top.
    const root = tube({}, [ballast(3.0, 0.2)]); // ~heavy parts inside
    const rocket: Rocket = {
      name: "t",
      stages: [{ name: "s", components: [root], overrideMass: 1.5, overrideSubcomponents: true }],
      configurations: [],
      referenceType: "maximum",
    };
    const mp = dryMassProperties(rocket);
    expect(mp.mass).toBeCloseTo(1.5, 6);
    // The CG stays at the parts' natural centroid (the override replaces only the total mass).
    const natural = combine(structurePointMasses({ ...rocket, stages: [{ name: "s", components: [root] }] }));
    expect(mp.cg).toBeCloseTo(natural.cg, 6);
  });

  it("a stage override CG relocates the lumped mass when the design gives one", () => {
    const root = tube({}, [ballast(3.0, 0.2)]);
    const rocket: Rocket = {
      name: "t",
      stages: [{ name: "s", components: [root], overrideMass: 1.5, overrideCGx: 0.25, overrideSubcomponents: true }],
      configurations: [],
      referenceType: "maximum",
    };
    const mp = dryMassProperties(rocket);
    expect(mp.mass).toBeCloseTo(1.5, 6);
    // Override CG is measured from the stage's fore station (here the nose tip, x=0).
    expect(mp.cg).toBeCloseTo(0.25, 6);
  });
});

describe("mass breakdown invariant (per-component sums to the dry total)", () => {
  // The Mass & balance panel lists structurePointMasses and shows combine() of them as the total.
  // That total must equal dryMassProperties for the rows to honestly add up to what's displayed.
  for (const f of ["demo-single-deploy.ork", "demo-boattail.ork", "demo-dual-deploy.ork"]) {
    it(`${f}: structure point masses combine to the dry mass and CG`, async () => {
      const doc = await importOrk(new Uint8Array(readFileSync(new URL(`../../fixtures/${f}`, import.meta.url))));
      const points = structurePointMasses(doc.rocket);
      expect(points.length).toBeGreaterThan(0);
      const summed = combine(points);
      const dry = dryMassProperties(doc.rocket);
      expect(summed.mass).toBeCloseTo(dry.mass, 9);
      expect(summed.cg).toBeCloseTo(dry.cg, 9);
      // Every listed part carries real mass and a finite station.
      for (const p of points) {
        expect(p.mass).toBeGreaterThan(0);
        expect(Number.isFinite(p.cg)).toBe(true);
      }
    });
  }
});
