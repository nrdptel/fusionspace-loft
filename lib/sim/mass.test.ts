import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { combine, dryMassProperties, finChordCentroid, massByComponent, structurePointMasses } from "./mass";
import { flattenRocket } from "../model/geometry";
import { importOrk, importDesign } from "../ork/import";
import type { Rocket, BodyTube, InnerTube, MassComponent, GenericFinSet, NoseCone } from "../model/types";

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

  it("leaves a stage override out of the per-component map, so summing it is not the dry mass", () => {
    // `massByComponent` is keyed by component id, and a STAGE override belongs to no component: it
    // is pushed as a lumped point mass with no id. Every part under it correctly reads 0 with
    // `subsumedBy` — but the parts table's caption used to state the SUM OF THAT COLUMN as the
    // design's dry mass, so a rocket whose whole weight is a stage override read "adds up to 0 kg".
    // Measured in the built export on two corpus designs with no edits applied: `Dual parachute
    // deployment.ork` said 0 kg for a real 1.361 kg airframe and `EscapeVelocity.ork` 0 kg for 2 kg.
    // The caption now states `dryMassProperties` and names the difference; this pins the gap the two
    // functions genuinely have, so the caption cannot quietly go back to summing the column.
    const root = tube({}, [ballast(3.0, 0.2)]);
    const rocket: Rocket = {
      name: "t",
      stages: [{ name: "s", components: [root], overrideMass: 1.5, overrideSubcomponents: true }],
      configurations: [],
      referenceType: "maximum",
    };
    const columnTotal = [...massByComponent(rocket).values()].reduce((a, m) => a + m.mass, 0);
    expect(columnTotal).toBeCloseTo(0, 6);
    expect(dryMassProperties(rocket).mass).toBeCloseTo(1.5, 6);
    // Every component IS listed — at zero, saying where its mass is counted — so the table is not
    // missing rows, it is missing a row it cannot have.
    const ids = massByComponent(rocket);
    expect(ids.get("b")?.subsumedBy).toBe("s");

    // The control: with no stage override, the column and the dry mass agree, so a caption that
    // states the dry mass is not silently different from the column on an ordinary design.
    const plain: Rocket = { ...rocket, stages: [{ name: "s", components: [root] }] };
    const plainColumn = [...massByComponent(plain).values()].reduce((a, m) => a + m.mass, 0);
    expect(plainColumn).toBeCloseTo(dryMassProperties(plain).mass, 6);
    expect(plainColumn).toBeGreaterThan(0);
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

describe("massByComponent", () => {
  /** A body tube with two ballast masses inside — three parts that each carry their own mass. */
  const parted = () => rocketOf(tube({ id: "body" }, [ballast(0.2, 0.1), { ...ballast(0.3, 0.4), id: "m2" }]));

  it("gives every load-bearing part its own mass, keyed by component id", () => {
    const rocket = parted();
    const byId = massByComponent(rocket);
    const flat = flattenRocket(rocket);
    expect(byId.size).toBeGreaterThan(0);
    // The per-component masses add up to the dry total the simulator flies.
    let sum = 0;
    for (const p of flat) sum += byId.get(p.component.id)?.mass ?? 0;
    expect(sum).toBeCloseTo(dryMassProperties(rocket).mass, 9);
  });

  it("says which assembly swallowed a subsumed part rather than reporting zero silently", () => {
    const rocket = parted();
    const stage = rocket.stages[0];
    stage.overrideMass = 1.5;
    stage.overrideSubcomponents = true;
    stage.name = "Sustainer";
    const byId = massByComponent(rocket);
    for (const p of flattenRocket(rocket)) {
      const m = byId.get(p.component.id);
      expect(m).toBeDefined();
      expect(m!.mass).toBe(0);
      expect(m!.subsumedBy).toBe("Sustainer");
    }
    expect(dryMassProperties(rocket).mass).toBeCloseTo(1.5, 9);
  });
});

describe("a clustered motor mount scales the motor tubes, never the airframe", () => {
  /** An inner tube carrying the mount — one of the N motor tubes a cluster actually is. */
  function motorTube(clusterCount?: number): InnerTube {
    return {
      id: "mt",
      name: "motor tube",
      kind: "innertube",
      placement: { method: "bottom", offset: 0 },
      material: MAT,
      outerRadius: 0.015,
      innerRadius: 0.014,
      length: 0.2,
      motorMount: { overhang: 0, clusterCount },
      children: [],
    };
  }

  it("triples an inner tube's own mass, because three motor tubes are three tubes", () => {
    const single = dryMassProperties({
      name: "t",
      stages: [{ name: "s", components: [{ ...tube({}), children: [motorTube()] }] }],
      configurations: [],
      referenceType: "maximum",
    });
    const clustered = dryMassProperties({
      name: "t",
      stages: [{ name: "s", components: [{ ...tube({}), children: [motorTube(3)] }] }],
      configurations: [],
      referenceType: "maximum",
    });
    const tubeOnly = dryMassProperties({
      name: "t",
      stages: [{ name: "s", components: [tube({})] }],
      configurations: [],
      referenceType: "maximum",
    });
    // The airframe is untouched; the inner tube's contribution is exactly tripled.
    const oneMotorTube = single.mass - tubeOnly.mass;
    expect(clustered.mass - tubeOnly.mass).toBeCloseTo(oneMotorTube * 3, 9);
  });

  it("leaves the AIRFRAME alone when the mount sits on the body tube itself", () => {
    // The defect this pins: `motorMount` also lives on a `BodyTube`, and a cluster of three motors
    // inside one 50 mm airframe is three motor tubes inside ONE airframe. Scaling the host regardless
    // was reachable from the "Motor cluster" field on 12 of the 35 real designs — measured on
    // `01.One-stage.ork`, dry mass +38.7% and CG +39.7 mm from typing a 3. CG is what the static
    // margin is measured from, so it published a wrong stability number from a legal edit.
    //
    // No real design exercises it: both corpus files that SHIP a cluster carry it on an `innertube`.
    // That is why this case is synthetic rather than a corpus assertion.
    const plain = dryMassProperties(rocketOf(tube({})));
    const withCluster = dryMassProperties(
      rocketOf(tube({ motorMount: { overhang: 0, clusterCount: 3 } })),
    );
    expect(withCluster.mass).toBeCloseTo(plain.mass, 12);
    expect(withCluster.cg).toBeCloseTo(plain.cg, 12);
    expect(withCluster.inertia).toBeCloseTo(plain.inertia, 12);
  });

  it("does not multiply a STATED mass either", () => {
    // The scale ran after the override, so a part whose weight the file states outright had that
    // stated figure multiplied too — a number the design says is 120 g reported as 360 g.
    const stated = dryMassProperties(
      rocketOf(tube({ overrideMass: 0.12, motorMount: { overhang: 0, clusterCount: 3 } })),
    );
    expect(stated.mass).toBeCloseTo(0.12, 9);
  });
});

describe("a design that states no structural mass", () => {
  /** Why `MassBreakdown` stopped returning null — and, stated precisely, what this does and does NOT
   *  establish.
   *
   *  It establishes that the INPUT is real: one corpus design states no structural point mass at all,
   *  so the branch is not hypothetical arithmetic.
   *
   *  **It does not establish that a flyer sees it, and driving the app proved they do not.** Loaded
   *  through the UI, that design has no motor assigned, so `ResultsView` renders its "No flight
   *  simulated" card and withholds everything below — `MassBreakdown` included. Reaching the empty
   *  panel needs a design that BOTH flies and states no structural mass, and nothing in the corpus is
   *  both. So removing the `return null` is defensive rather than a visible fix, and the claim to
   *  make about it is that a data surface no longer has a branch where it silently disappears —
   *  not that a hole was patched. Written down because the first version of this comment said the
   *  latter, and a commit message nearly shipped saying it too. */
  it("exists in the real corpus, so the empty branch is not hypothetical", async () => {
    const dir = process.env.LOFT_CORPUS_DIR ?? resolve(process.cwd(), "corpus");
    if (!existsSync(dir)) {
      // The corpus is gitignored and absent on a public clone; skipping is correct there, and the
      // suite says so rather than reporting a pass it did not earn.
      console.log("no corpus present — skipping the reachability check");
      return;
    }
    const found: string[] = [];
    let flown = 0;
    for (const tool of ["openrocket", "rocksim", "rasaero", "rocketpy", "spacecad"]) {
      const p = join(dir, tool);
      if (!existsSync(p)) continue;
      for (const name of readdirSync(p)) {
        if (!/\.(ork|rkt|CDX1)$/i.test(name)) continue;
        let doc;
        try {
          doc = await importDesign(new Uint8Array(readFileSync(join(p, name))));
        } catch {
          continue;
        }
        flown++;
        if (structurePointMasses(doc.rocket).length === 0) found.push(name);
      }
    }
    // The denominator matters: a check that examined nothing would report the same "found 0".
    expect(flown, "no corpus design was read, so this proves nothing").toBeGreaterThan(20);
    console.log(`structural-mass-free designs: ${found.length} of ${flown} — ${found.join(", ") || "none"}`);
    expect(
      found.length,
      "no corpus design produces an empty structural-mass set any more; if that is a real improvement, this check has served its purpose and the empty state is now speculative — say so rather than deleting it silently",
    ).toBeGreaterThan(0);
  }, 300_000);
});
