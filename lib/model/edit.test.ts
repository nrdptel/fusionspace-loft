import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importOrk } from "../ork/import";
import { flattenRocket } from "./geometry";
import {
  applyGeometryEdits,
  primaryFinSpan,
  primaryFinCount,
  primaryFinStation,
  primaryFinChord,
  primaryMotorClusterCount,
  primaryFinRootChord,
  primaryFinTipChord,
  primaryFinSweep,
  primaryFinThickness,
  primaryFinCrossSection,
  primaryFinMaterial,
  FIN_MATERIALS,
  primaryNose,
  primaryNoseShape,
  primaryBodyDiameter,
  primaryBodyTube,
  primaryFinish,
  primaryParachute,
  primaryAirframeMaterial,
  AIRFRAME_MATERIALS,
  unreachableFinSetCount,
  unreachableBodyTubeCount,
  aftmostBodyDiameter,
  unreachableParachuteCount,
  primaryParachutePart,
  aimsOf,
  AIM_SLOTS,
  INERT_EDIT_FIELDS,
  primaryFinGroupIds,
  primaryFinSetPart,
  primaryBodyTubePart,
  aimEditsAt,
  hasGeometryEdits,
} from "./edit";
import type {
  GenericFinSet,
  Transition,
  Parachute,
  Rocket,
  RocketComponent,
  TrapezoidFinSet,
} from "./types";
import { overallLength } from "./geometry";
import { newDesign } from "./starter";
import { runFlight } from "../sim/run";
import { exportOrk } from "../ork/export";
import { defaultPayloadStation } from "./edit";
import { recoverySizing } from "../sim/recovery";

async function load(name: string) {
  const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), "fixtures", name)));
  return (await importOrk(bytes)).rocket;
}

describe("applyGeometryEdits — fin span", () => {
  it("resizes a trapezoidal fin set's span, non-destructively", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const before = primaryFinSpan(rocket)!;
    expect(before).toBeGreaterThan(0);

    const target = before * 1.5;
    const edited = applyGeometryEdits(rocket, { finSpan: target });

    expect(primaryFinSpan(edited)).toBeCloseTo(target, 9);
    // The imported design is untouched — callers keep a pristine model.
    expect(primaryFinSpan(rocket)).toBeCloseTo(before, 9);
    expect(edited).not.toBe(rocket);
  });

  it("scales a generic (elliptical) fin set's stored area with the span", async () => {
    const rocket = await load("demo-boattail.ork");
    const finOf = (r: typeof rocket) =>
      flattenRocket(r)
        .map((p) => p.component)
        .find((c): c is GenericFinSet => c.kind === "ellipticalfinset" || c.kind === "freeformfinset");
    const fin = finOf(rocket);
    expect(fin).toBeTruthy();
    const { height: h0, area: a0 } = fin!;

    const edited = applyGeometryEdits(rocket, { finSpan: h0 * 2 });
    const editedFin = finOf(edited)!;
    // Doubling the span doubles the stored planform area (the shape is preserved).
    expect(editedFin.height).toBeCloseTo(h0 * 2, 9);
    expect(editedFin.area).toBeCloseTo(a0 * 2, 9);
  });

  it("no-ops when the edit is empty or non-positive", async () => {
    const rocket = await load("demo-single-deploy.ork");
    expect(applyGeometryEdits(rocket, {})).toBe(rocket);
    expect(applyGeometryEdits(rocket, { finSpan: 0 })).toBe(rocket);
    expect(applyGeometryEdits(rocket, { noseLength: 0, bodyLength: 0 })).toBe(rocket);
  });
});

describe("applyGeometryEdits — a design with several fin sets", () => {
  /** Clone the design's fin set into a second, larger set on the same stage — the shape a staged
   *  design has in the wild (13 of the 35 corpus designs carry more than one set, and on
   *  OpenRocket's `03.Three-stage.ork` the booster's 108 mm fins sit beside a 19.1 mm sustainer
   *  set). Different station AND different dimensions, so these are two independent sets. */
  async function twoFinSets() {
    const rocket = await load("demo-single-deploy.ork");
    const stage = rocket.stages[0];
    const findFin = (list: RocketComponent[]): TrapezoidFinSet | undefined => {
      for (const c of list) {
        if (c.kind === "trapezoidfinset") return c;
        const inner = findFin(c.children);
        if (inner) return inner;
      }
      return undefined;
    };
    const first = findFin(stage.components)!;
    const second: TrapezoidFinSet = {
      ...first,
      id: `${first.id}-second`,
      name: "Booster fin set",
      height: first.height * 4,
      rootChord: first.rootChord * 2,
      children: [],
    };
    // Appended beside the first set's parent-level siblings so flattenRocket sees both.
    const withTwo = {
      ...rocket,
      stages: [{ ...stage, components: [...stage.components, second] }, ...rocket.stages.slice(1)],
    };
    return { rocket: withTwo, first, second };
  }

  const finSetsOf = (r: Rocket) =>
    flattenRocket(r)
      .map((p) => p.component)
      .filter((c): c is TrapezoidFinSet => c.kind === "trapezoidfinset");

  it("counts the sets the fin fields cannot reach", async () => {
    const { rocket } = await twoFinSets();
    expect(unreachableFinSetCount(rocket)).toBe(1);
    expect(unreachableFinSetCount(await load("demo-single-deploy.ork"))).toBe(0);
  });

  it("edits only the set the fin fields read back, leaving the others alone", async () => {
    const { rocket, second } = await twoFinSets();
    // The panel seeds its fields from the primary (frontmost) set.
    const shown = primaryFinSpan(rocket)!;
    expect(shown).toBeCloseTo(finSetsOf(rocket)[0].height, 9);
    expect(second.height).not.toBeCloseTo(shown, 6);

    const edited = applyGeometryEdits(rocket, { finSpan: shown + 0.01 });
    const [a, b] = finSetsOf(edited);

    // What the field showed is what the field changed...
    expect(a.height).toBeCloseTo(shown + 0.01, 9);
    // ...and the set it never described keeps its own geometry. Before this was scoped, one nudge
    // flattened every set to the single value the panel happened to be showing.
    expect(b.height).toBeCloseTo(second.height, 9);
    expect(b.rootChord).toBeCloseTo(second.rootChord, 9);
  });

  it("scopes every fin SHAPE edit, not just the span", async () => {
    const { rocket, second } = await twoFinSets();
    const edited = applyGeometryEdits(rocket, {
      finCount: 8,
      finRootChord: 0.2,
      finTipChord: 0.05,
      finSweepLength: 0.03,
      finThickness: 0.01,
      finCrossSection: "airfoil",
      finMaterial: FIN_MATERIALS[0].key,
    });
    const [, b] = finSetsOf(edited);
    expect(b.finCount).toBe(second.finCount);
    expect(b.rootChord).toBeCloseTo(second.rootChord, 9);
    expect(b.tipChord).toBeCloseTo(second.tipChord, 9);
    expect(b.sweepLength).toBeCloseTo(second.sweepLength, 9);
    expect(b.thickness).toBeCloseTo(second.thickness, 9);
    expect(b.crossSection).toBe(second.crossSection);
    expect(b.material?.name).toBe(second.material?.name);
  });

  /** The opposite real case: one physical fin ring that the file stores as N single-fin sets, all
   *  identical and at the same station. `ARC payload rocket.ork` in the corpus is exactly this — 3
   *  sets of 1 fin each, all 55.4 mm. Resizing only one would leave the rocket asymmetric, so the
   *  whole ring has to move together. */
  async function splitRing() {
    const rocket = await load("demo-single-deploy.ork");
    const stage = rocket.stages[0];
    const findFin = (list: RocketComponent[]): TrapezoidFinSet | undefined => {
      for (const c of list) {
        if (c.kind === "trapezoidfinset") return c;
        const inner = findFin(c.children);
        if (inner) return inner;
      }
      return undefined;
    };
    const first = findFin(stage.components)!;
    // Same station, same dimensions, different id — indistinguishable on the airframe. They must be
    // siblings of the original inside the same parent, or the axial stacking gives each its own
    // station and they stop being one ring.
    const clone = (n: number): TrapezoidFinSet => ({ ...first, id: `${first.id}-ring${n}`, children: [] });
    const insert = (list: RocketComponent[]): RocketComponent[] =>
      list.flatMap((c) =>
        c.id === first.id
          ? [c, clone(1), clone(2)]
          : [c.children.length ? { ...c, children: insert(c.children) } : c],
      );
    const withRing = {
      ...rocket,
      stages: [{ ...stage, components: insert(stage.components) }, ...rocket.stages.slice(1)],
    };
    return { rocket: withRing, first };
  }

  it("treats a ring stored as several identical sets as one set, and resizes all of it", async () => {
    const { rocket } = await splitRing();
    // Nothing here is out of reach — the fields speak for every fin on the rocket.
    expect(unreachableFinSetCount(rocket)).toBe(0);
    expect(primaryFinGroupIds(rocket).size).toBe(3);

    const shown = primaryFinSpan(rocket)!;
    const edited = applyGeometryEdits(rocket, { finSpan: shown + 0.01 });
    const heights = finSetsOf(edited).map((f) => f.height);
    // All three move together: resizing one third of a fin ring would fly an asymmetric rocket.
    expect(heights).toHaveLength(3);
    for (const h of heights) expect(h).toBeCloseTo(shown + 0.01, 9);
  });

  it("reads back and writes to the SAME set, whichever one is selected", async () => {
    // The failure this guards against is silent and destructive: the panel seeds its fields from
    // one set and the edit lands on another, so a flyer nudges the number they can see and a
    // different fin changes. Every readback and the edit path resolve through one function now, so
    // assert that for both sets rather than trusting the wiring.
    const { rocket, first, second } = await twoFinSets();
    for (const target of [first, second]) {
      const shown = primaryFinSpan(rocket, target.id)!;
      expect(shown).toBeCloseTo(target.height, 9);
      const edited = applyGeometryEdits(rocket, { finSetId: target.id, finSpan: shown + 0.01 });
      const sets = finSetsOf(edited);
      const hit = sets.find((f) => f.id === target.id)!;
      const other = sets.find((f) => f.id !== target.id)!;
      expect(hit.height).toBeCloseTo(target.height + 0.01, 9);
      // …and the set that was not selected is untouched.
      const untouched = target.id === first.id ? second : first;
      expect(other.height).toBeCloseTo(untouched.height, 9);
    }
  });

  it("falls back to the frontmost set when the selection names nothing on this design", async () => {
    // A stale id restored from a session must not disable the fin fields or silently edit nothing.
    const { rocket, first } = await twoFinSets();
    expect(primaryFinSpan(rocket, "no-such-component")).toBeCloseTo(primaryFinSpan(rocket)!, 9);
    const edited = applyGeometryEdits(rocket, { finSetId: "no-such-component", finSpan: first.height + 0.01 });
    const hit = finSetsOf(edited).find((f) => f.id === first.id)!;
    expect(hit.height).toBeCloseTo(first.height + 0.01, 9);
  });

  it("selecting a set is not an edit", async () => {
    // A selection alone must leave the design identical — same object, so nothing re-flies and no
    // stored-tool comparison is withheld for a click that changed no geometry.
    const { rocket, second } = await twoFinSets();
    expect(hasGeometryEdits({ finSetId: second.id })).toBe(false);
    expect(applyGeometryEdits(rocket, { finSetId: second.id })).toBe(rocket);
  });

  it("groups the SELECTED set with the sets indistinguishable from it", async () => {
    // The split-ring rule follows the selection: picking any member of a ring still resizes the
    // whole ring, and the count of out-of-reach sets is relative to what is selected.
    const { rocket } = await splitRing();
    const ids = [...primaryFinGroupIds(rocket)];
    expect(ids.length).toBe(3);
    for (const id of ids) {
      expect(primaryFinGroupIds(rocket, id).size).toBe(3);
      expect(unreachableFinSetCount(rocket, id)).toBe(0);
    }
  });

  it("measures a position edit from the SELECTED set, not the frontmost", async () => {
    // The field shows the selected set's station, so the shift has to be measured from that set.
    // Seeding it from the frontmost turned "nudge this set 10 mm aft" into a shift of the whole
    // inter-set distance — on this fixture, the gap between the two sets — silently, on every fin.
    // A real two-stage file rather than the synthetic fixture above: appending a copy of a nested
    // fin set at stage level inherits its parent-relative placement and resolves to a NEGATIVE
    // station, which `applyGeometryEdits` rightly refuses, so it cannot exercise this at all.
    const doc = await importOrk(new Uint8Array(readFileSync(resolve("e2e/fixtures/two-stage-firm-booster.ork"))));
    const rocket = doc.rocket;
    const sets = flattenRocket(rocket).filter((p) => p.component.kind === "trapezoidfinset");
    expect(sets.length).toBe(2);
    const second = sets[1].component;
    const shown = primaryFinStation(rocket, second.id)!;
    expect(shown).toBeGreaterThan(0);
    // The two sets are a real distance apart; measuring from the wrong one moves everything by it.
    expect(Math.abs(shown - primaryFinStation(rocket)!)).toBeGreaterThan(0.1);
    const before = sets.map((p) => p.xFore);
    const shifted = applyGeometryEdits(rocket, { finSetId: second.id, finStation: shown + 0.01 });
    const after = flattenRocket(shifted)
      .filter((p) => p.component.kind === "trapezoidfinset")
      .map((p) => p.xFore);
    // Every set still moves together — position stays a group-wide delta — but by the 10 mm asked
    // for, not by 10 mm plus the distance between the sets.
    expect(after[0] - before[0]).toBeCloseTo(0.01, 9);
    expect(after[1] - before[1]).toBeCloseTo(0.01, 9);
    expect(primaryFinStation(shifted, second.id)).toBeCloseTo(shown + 0.01, 9);
  });

  it("still slides the whole fin GROUP for a position edit, keeping its spacing", async () => {
    const { rocket } = await twoFinSets();
    const before = flattenRocket(rocket)
      .filter((p) => p.component.kind === "trapezoidfinset")
      .map((p) => p.xFore);
    const station = primaryFinStation(rocket)!;
    const shifted = applyGeometryEdits(rocket, { finStation: station + 0.05 });
    const after = flattenRocket(shifted)
      .filter((p) => p.component.kind === "trapezoidfinset")
      .map((p) => p.xFore);
    // Every set moves by the same delta — position is a delta edit and stays group-wide on
    // purpose, so the design keeps its layout and finStationTrim's slope holds.
    expect(after[0] - before[0]).toBeCloseTo(0.05, 9);
    expect(after[1] - before[1]).toBeCloseTo(0.05, 9);
  });
});

describe("applyGeometryEdits — fin position (stability lever)", () => {
  it("moves the fin group to the requested station, non-destructively", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const before = primaryFinStation(rocket)!;
    expect(before).toBeGreaterThan(0);
    const target = before + 0.05; // 5 cm aft
    const edited = applyGeometryEdits(rocket, { finStation: target });
    // The primary fin set's fore edge lands exactly on the requested station.
    expect(primaryFinStation(edited)).toBeCloseTo(target, 9);
    // The pristine design is untouched.
    expect(primaryFinStation(rocket)).toBeCloseTo(before, 9);
  });

  it("moving the fins aft raises the static margin; forward lowers it, apogee ~unchanged", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const s0 = primaryFinStation(rocket)!;
    const nominal = runFlight(rocket, {}).result;
    const aft = runFlight(applyGeometryEdits(rocket, { finStation: s0 + 0.05 }), {}).result;
    const fore = runFlight(applyGeometryEdits(rocket, { finStation: s0 - 0.05 }), {}).result;
    // Fins aft ⇒ centre of pressure aft ⇒ more stable; fins forward ⇒ less stable.
    expect(aft.staticMarginCal).toBeGreaterThan(nominal.staticMarginCal);
    expect(fore.staticMarginCal).toBeLessThan(nominal.staticMarginCal);
    // A longitudinal shift barely touches drag or mass, so it isolates the stability effect — apogee
    // moves less than a per-cent either way.
    expect(Math.abs(aft.summary.apogee - nominal.summary.apogee) / nominal.summary.apogee).toBeLessThan(0.01);
    expect(Math.abs(fore.summary.apogee - nominal.summary.apogee) / nominal.summary.apogee).toBeLessThan(0.01);
  });

  it("shifts every fin set by the same amount, preserving their spacing", async () => {
    // A design with a single fin set: the shift equals the requested delta on that set's placement.
    const rocket = await load("demo-single-deploy.ork");
    const finBefore = flattenRocket(rocket).filter((p) =>
      ["trapezoidfinset", "ellipticalfinset", "freeformfinset"].includes(p.component.kind),
    );
    const s0 = primaryFinStation(rocket)!;
    const edited = applyGeometryEdits(rocket, { finStation: s0 + 0.1 });
    const finAfter = flattenRocket(edited).filter((p) =>
      ["trapezoidfinset", "ellipticalfinset", "freeformfinset"].includes(p.component.kind),
    );
    expect(finAfter.length).toBe(finBefore.length);
    for (let i = 0; i < finBefore.length; i++) {
      expect(finAfter[i].xFore - finBefore[i].xFore).toBeCloseTo(0.1, 9);
    }
  });

  it("no-ops when the station is undefined or non-positive", async () => {
    const rocket = await load("demo-single-deploy.ork");
    expect(applyGeometryEdits(rocket, { finStation: 0 })).toBe(rocket);
    expect(applyGeometryEdits(rocket, { finStation: -1 })).toBe(rocket);
  });

  it("reports the fin root chord, so a caller can keep a moved fin on the airframe", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const chord = primaryFinChord(rocket)!;
    expect(chord).toBeGreaterThan(0);
    // Placing the fin's fore edge at (overall length − chord) puts its trailing edge exactly at the
    // tail — the buildable aft limit the parameter sweep clamps to.
    const aftLimit = overallLength(rocket) - chord;
    const edited = applyGeometryEdits(rocket, { finStation: aftLimit });
    const fin = flattenRocket(edited).find((p) =>
      ["trapezoidfinset", "ellipticalfinset", "freeformfinset"].includes(p.component.kind),
    )!;
    expect(fin.xFore + fin.length).toBeCloseTo(overallLength(edited), 6);
  });
});

describe("applyGeometryEdits — payload / mass component", () => {
  it("adds a payload mass that raises the loaded mass and shifts the CG by its station", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const cfg = rocket.configurations[0].id;
    const base = runFlight(rocket, { configId: cfg }).result;

    // A forward payload pulls the CG forward (more stable); an aft one pushes it back (less stable).
    const fwd = runFlight(applyGeometryEdits(rocket, { payloadMassKg: 0.3, payloadStation: 0.3 }), { configId: cfg }).result;
    const aft = runFlight(applyGeometryEdits(rocket, { payloadMassKg: 0.3, payloadStation: 0.85 }), { configId: cfg }).result;
    expect(fwd.liftoffMass).toBeCloseTo(base.liftoffMass + 0.3, 6);
    expect(aft.liftoffMass).toBeCloseTo(base.liftoffMass + 0.3, 6);
    expect(fwd.cgLoaded).toBeLessThan(base.cgLoaded);
    expect(aft.cgLoaded).toBeGreaterThan(base.cgLoaded);
    expect(fwd.staticMarginCal).toBeGreaterThan(aft.staticMarginCal);
    // Extra mass costs apogee, wherever it sits.
    expect(fwd.summary.apogee).toBeLessThan(base.summary.apogee);
  });

  it("defaults an unpositioned payload to the mid-body station", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const mid = defaultPayloadStation(rocket)!;
    const cfg = rocket.configurations[0].id;
    const noStation = applyGeometryEdits(rocket, { payloadMassKg: 0.3 });
    const atMid = applyGeometryEdits(rocket, { payloadMassKg: 0.3, payloadStation: mid });
    const cg = (rk: typeof rocket) => runFlight(rk, { configId: cfg }).result.cgLoaded;
    expect(cg(noStation)).toBeCloseTo(cg(atMid), 6);
  });

  it("the added payload survives an export → re-import round-trip", async () => {
    const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), "fixtures", "demo-single-deploy.ork")));
    const doc = await importOrk(bytes);
    const edited = applyGeometryEdits(doc.rocket, { payloadMassKg: 0.3, payloadStation: 0.5 });
    const reDoc = await importOrk(await exportOrk({ ...doc, rocket: edited }));
    const payload = flattenRocket(reDoc.rocket).find((p) => p.component.name === "Payload");
    expect(payload).toBeDefined();
    expect((payload!.component as { mass: number }).mass).toBeCloseTo(0.3, 6);
    expect(payload!.xFore).toBeCloseTo(0.5, 3);
  });

  it("no-ops when the payload mass is undefined or non-positive, and is non-destructive", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const cfg = rocket.configurations[0].id;
    expect(applyGeometryEdits(rocket, { payloadMassKg: 0 })).toBe(rocket);
    const before = runFlight(rocket, { configId: cfg }).result.liftoffMass;
    applyGeometryEdits(rocket, { payloadMassKg: 0.5 });
    expect(runFlight(rocket, { configId: cfg }).result.liftoffMass).toBeCloseTo(before, 9);
  });
});

describe("applyGeometryEdits — fin cross-section", () => {
  it("sets every fin set's edge profile, non-destructively", async () => {
    const rocket = await load("demo-single-deploy.ork");
    // A finned demo defaults to square when it names no profile.
    expect(primaryFinCrossSection(rocket)).toBe("square");
    const edited = applyGeometryEdits(rocket, { finCrossSection: "airfoil" });
    expect(primaryFinCrossSection(edited)).toBe("airfoil");
    // Original untouched.
    expect(primaryFinCrossSection(rocket)).toBe("square");
    // Every fin set took it (a design can have more than one).
    for (const p of flattenRocket(edited)) {
      if (p.component.kind.endsWith("finset")) {
        expect((p.component as GenericFinSet).crossSection).toBe("airfoil");
      }
    }
  });

  it("is a no-op when undefined", async () => {
    const rocket = await load("demo-single-deploy.ork");
    expect(applyGeometryEdits(rocket, { finCrossSection: undefined })).toBe(rocket);
  });
});

describe("applyGeometryEdits — fin material", () => {
  it("swaps every fin set's material density and name, non-destructively", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const g10 = FIN_MATERIALS.find((m) => m.key === "g10")!;
    const edited = applyGeometryEdits(rocket, { finMaterial: "g10" });
    expect(primaryFinMaterial(edited)).toBe(g10.name);
    for (const p of flattenRocket(edited)) {
      if (p.component.kind.endsWith("finset")) {
        expect((p.component as GenericFinSet).material?.density).toBe(g10.density);
        expect((p.component as GenericFinSet).material?.name).toBe(g10.name);
      }
    }
    // Original untouched.
    expect(primaryFinMaterial(rocket)).not.toBe(g10.name);
  });

  it("is a no-op for an unknown or missing material key", async () => {
    const rocket = await load("demo-single-deploy.ork");
    expect(applyGeometryEdits(rocket, { finMaterial: undefined })).toBe(rocket);
    expect(applyGeometryEdits(rocket, { finMaterial: "unobtainium" })).toBe(rocket);
  });
});

describe("applyGeometryEdits — fin count", () => {
  it("changes the fin count, rounding to a whole number, non-destructively", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const before = primaryFinCount(rocket)!;
    expect(before).toBeGreaterThanOrEqual(3);

    const edited = applyGeometryEdits(rocket, { finCount: before + 1.4 });
    // Fractional counts round to a whole number of fins.
    expect(primaryFinCount(edited)).toBe(before + 1);
    // The imported design is untouched.
    expect(primaryFinCount(rocket)).toBe(before);
    expect(edited).not.toBe(rocket);
  });

  it("changes the count without touching the span", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const span0 = primaryFinSpan(rocket)!;
    const n0 = primaryFinCount(rocket)!;

    const edited = applyGeometryEdits(rocket, { finCount: n0 + 2 });
    expect(primaryFinCount(edited)).toBe(n0 + 2);
    expect(primaryFinSpan(edited)).toBeCloseTo(span0, 9);
  });

  it("applies span and count together in one edit", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const span0 = primaryFinSpan(rocket)!;
    const n0 = primaryFinCount(rocket)!;

    const edited = applyGeometryEdits(rocket, { finSpan: span0 * 1.5, finCount: n0 + 1 });
    expect(primaryFinSpan(edited)).toBeCloseTo(span0 * 1.5, 9);
    expect(primaryFinCount(edited)).toBe(n0 + 1);
  });

  it("no-ops for a count below one", async () => {
    const rocket = await load("demo-single-deploy.ork");
    expect(applyGeometryEdits(rocket, { finCount: 0 })).toBe(rocket);
  });
});

describe("applyGeometryEdits — motor cluster count", () => {
  it("reads the design's current cluster count (1 for a single motor)", () => {
    const rocket = newDesign().rocket;
    expect(primaryMotorClusterCount(rocket)).toBe(1);
    const clustered = applyGeometryEdits(rocket, { motorClusterCount: 3 });
    expect(primaryMotorClusterCount(clustered)).toBe(3);
    // The starter design is untouched.
    expect(primaryMotorClusterCount(rocket)).toBe(1);
  });

  it("flies a cluster harder and heavier — a higher apogee and burnout mass", () => {
    const rocket = newDesign().rocket;
    const single = runFlight(rocket, { configId: "cfg-1" }).result;
    const quad = runFlight(applyGeometryEdits(rocket, { motorClusterCount: 4 }), { configId: "cfg-1" }).result;
    // Four motors ⇒ four times the thrust and four times the loaded propellant/casing mass. The
    // extra impulse dominates the extra mass, so the cluster flies markedly higher.
    expect(quad.summary.apogee).toBeGreaterThan(single.summary.apogee * 1.3);
    // The loaded mass carries the extra three motors.
    expect(quad.liftoffMass).toBeGreaterThan(single.liftoffMass);
  });

  it("a count of 1 de-clusters (clears the cluster) — back to a single motor", () => {
    const rocket = newDesign().rocket;
    const clustered = applyGeometryEdits(rocket, { motorClusterCount: 4 });
    expect(primaryMotorClusterCount(clustered)).toBe(4);
    const single = applyGeometryEdits(clustered, { motorClusterCount: 1 });
    expect(primaryMotorClusterCount(single)).toBe(1);
  });

  it("is a no-op when unset or below one, or the design has no motor mount", () => {
    const rocket = newDesign().rocket;
    expect(applyGeometryEdits(rocket, { motorClusterCount: undefined })).toBe(rocket);
    expect(applyGeometryEdits(rocket, { motorClusterCount: 0 })).toBe(rocket);
    // A design stripped of its motor mount reads no cluster count and is unchanged by the edit.
    const noMount = {
      ...rocket,
      stages: rocket.stages.map((s) => ({
        ...s,
        components: s.components.map(function strip(c): typeof c {
          return { ...c, children: c.children.filter((k) => k.kind !== "innertube").map(strip) };
        }),
      })),
    };
    expect(primaryMotorClusterCount(noMount)).toBeUndefined();
    expect(applyGeometryEdits(noMount, { motorClusterCount: 4 })).toStrictEqual(noMount);
  });
});

describe("applyGeometryEdits — fin chords", () => {
  it("reshapes a trapezoidal fin's root and tip chords, non-destructively", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const root0 = primaryFinRootChord(rocket)!;
    const tip0 = primaryFinTipChord(rocket)!;
    expect(root0).toBeGreaterThan(0);

    const edited = applyGeometryEdits(rocket, { finRootChord: root0 * 1.5, finTipChord: tip0 * 0.5 });
    expect(primaryFinRootChord(edited)).toBeCloseTo(root0 * 1.5, 9);
    expect(primaryFinTipChord(edited)).toBeCloseTo(tip0 * 0.5, 9);
    // Span and count are untouched, and the original design is pristine.
    expect(primaryFinSpan(edited)).toBeCloseTo(primaryFinSpan(rocket)!, 9);
    expect(primaryFinRootChord(rocket)).toBe(root0);
  });

  it("ignores a chord edit on an elliptical fin set (its chord is a reduction, not a dimension)", async () => {
    const rocket = await load("demo-boattail.ork"); // elliptical fins
    expect(primaryFinRootChord(rocket)).toBeUndefined();
    // No trapezoidal fin to reshape ⇒ a chord-only edit leaves the design structurally unchanged
    // (the elliptical fin's dimensions are untouched).
    expect(applyGeometryEdits(rocket, { finRootChord: 0.2 })).toStrictEqual(rocket);
  });

  it("no-ops for a non-positive chord", async () => {
    const rocket = await load("demo-single-deploy.ork");
    expect(applyGeometryEdits(rocket, { finRootChord: 0, finTipChord: 0 })).toBe(rocket);
  });
});

describe("applyGeometryEdits — fin sweep", () => {
  it("reshapes a trapezoidal fin's leading-edge sweep, non-destructively", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const sweep0 = primaryFinSweep(rocket)!;
    expect(sweep0).toBeGreaterThanOrEqual(0);

    const edited = applyGeometryEdits(rocket, { finSweepLength: sweep0 + 0.03 });
    expect(primaryFinSweep(edited)).toBeCloseTo(sweep0 + 0.03, 9);
    // Span, count and chords are untouched, and the original design is pristine.
    expect(primaryFinSpan(edited)).toBeCloseTo(primaryFinSpan(rocket)!, 9);
    expect(primaryFinRootChord(edited)).toBeCloseTo(primaryFinRootChord(rocket)!, 9);
    expect(primaryFinSweep(rocket)).toBeCloseTo(sweep0, 9);
    expect(edited).not.toBe(rocket);
  });

  it("accepts a zero sweep (an unswept, square leading edge)", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const edited = applyGeometryEdits(rocket, { finSweepLength: 0 });
    expect(primaryFinSweep(edited)).toBe(0);
    // A zero sweep is a real edit (unlike a zero span), so a fresh tree is returned.
    expect(edited).not.toBe(rocket);
  });

  it("ignores a sweep edit on an elliptical fin set (it has no leading-edge sweep dimension)", async () => {
    const rocket = await load("demo-boattail.ork"); // elliptical fins
    expect(primaryFinSweep(rocket)).toBeUndefined();
    expect(applyGeometryEdits(rocket, { finSweepLength: 0.05 })).toStrictEqual(rocket);
  });
});

describe("applyGeometryEdits — fin thickness", () => {
  it("resets a trapezoidal fin's thickness, non-destructively", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const t0 = primaryFinThickness(rocket)!;
    expect(t0).toBeGreaterThan(0);

    const edited = applyGeometryEdits(rocket, { finThickness: t0 * 2 });
    expect(primaryFinThickness(edited)).toBeCloseTo(t0 * 2, 9);
    // The planform (span, chords) is untouched, and the original design is pristine.
    expect(primaryFinSpan(edited)).toBeCloseTo(primaryFinSpan(rocket)!, 9);
    expect(primaryFinRootChord(edited)).toBeCloseTo(primaryFinRootChord(rocket)!, 9);
    expect(primaryFinThickness(rocket)).toBeCloseTo(t0, 9);
    expect(edited).not.toBe(rocket);
  });

  it("applies to an elliptical fin set too (unlike a chord edit, thickness is universal)", async () => {
    const rocket = await load("demo-boattail.ork"); // elliptical fins
    const t0 = primaryFinThickness(rocket)!;
    expect(t0).toBeGreaterThan(0);
    // A chord edit is ignored on an elliptical set, but a thickness edit takes effect.
    const edited = applyGeometryEdits(rocket, { finThickness: t0 * 1.5 });
    expect(primaryFinThickness(edited)).toBeCloseTo(t0 * 1.5, 9);
  });

  it("no-ops for a non-positive thickness", async () => {
    const rocket = await load("demo-single-deploy.ork");
    expect(applyGeometryEdits(rocket, { finThickness: 0 })).toBe(rocket);
  });
});

describe("applyGeometryEdits — surface finish", () => {
  it("sets the chosen finish on every component of the airframe", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const edited = applyGeometryEdits(rocket, { finish: "polished" });
    const finishes = new Set(flattenRocket(edited).map((p) => p.component.finish));
    expect(finishes).toEqual(new Set(["polished"]));
    // The original design is untouched.
    expect(flattenRocket(rocket).every((p) => p.component.finish === "polished")).toBe(false);
  });

  it("primaryFinish reports the roughest finish present (what drives the drag)", async () => {
    const rocket = await load("demo-single-deploy.ork");
    // Force a mix: most smooth, one rough — the rough one should win.
    const mixed = applyGeometryEdits(rocket, { finish: "polished" });
    const roughed = {
      ...mixed,
      stages: mixed.stages.map((s, i) =>
        i === 0
          ? { ...s, components: s.components.map((c, j) => (j === 0 ? { ...c, finish: "rough" as const } : c)) }
          : s,
      ),
    };
    expect(primaryFinish(roughed)).toBe("rough");
    expect(primaryFinish(mixed)).toBe("polished");
  });
});

describe("applyGeometryEdits — length", () => {
  it("resizes the primary body tube and stretches the overall airframe", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const tube = primaryBodyTube(rocket)!;
    const len0 = tube.length;
    const overall0 = overallLength(rocket);

    const edited = applyGeometryEdits(rocket, { bodyLength: len0 + 0.1 });
    expect(primaryBodyTube(edited)!.length).toBeCloseTo(len0 + 0.1, 9);
    // A longer main tube makes the whole airframe ~0.1 m longer (downstream parts shift aft).
    expect(overallLength(edited)).toBeCloseTo(overall0 + 0.1, 6);
    // Non-destructive.
    expect(primaryBodyTube(rocket)!.length).toBeCloseTo(len0, 9);
  });

  it("resizes the nose cone", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const nose = primaryNose(rocket)!;
    const len0 = nose.length;

    const edited = applyGeometryEdits(rocket, { noseLength: len0 * 1.5 });
    expect(primaryNose(edited)!.length).toBeCloseTo(len0 * 1.5, 9);
    expect(primaryNose(rocket)!.length).toBeCloseTo(len0, 9);
  });
});

describe("applyGeometryEdits — nose shape", () => {
  it("changes the nose contour and installs the shape's canonical parameter, non-destructively", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const shape0 = primaryNoseShape(rocket)!;
    expect(shape0).toBeTruthy();

    // A Haack nose is the C=0 Sears–Haack / Von Kármán minimum-drag ogive.
    const edited = applyGeometryEdits(rocket, { noseShape: "haack" });
    expect(primaryNoseShape(edited)).toBe("haack");
    expect(primaryNose(edited)!.shapeParameter).toBe(0);
    // Conical/ellipsoid ignore the parameter, so choosing one clears it.
    expect(primaryNose(applyGeometryEdits(rocket, { noseShape: "conical" }))!.shapeParameter).toBeUndefined();
    // The original design is untouched.
    expect(primaryNoseShape(rocket)).toBe(shape0);
    expect(edited).not.toBe(rocket);
  });

  it("changes the nose shape and length together in one edit", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const len0 = primaryNose(rocket)!.length;
    const edited = applyGeometryEdits(rocket, { noseShape: "conical", noseLength: len0 * 1.4 });
    expect(primaryNoseShape(edited)).toBe("conical");
    expect(primaryNose(edited)!.length).toBeCloseTo(len0 * 1.4, 9);
  });
});

describe("applyGeometryEdits — airframe diameter", () => {
  it("scales the whole outer airframe to the target caliber, keeping the mould line faired", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const d0 = primaryBodyDiameter(rocket)!;
    const noseAft0 = primaryNose(rocket)!.aftRadius;
    const target = d0 * 1.4;

    const edited = applyGeometryEdits(rocket, { bodyDiameter: target });
    // The primary tube hits the target, and the nose base scales by the same factor so it still
    // fairs into the tube.
    expect(primaryBodyDiameter(edited)).toBeCloseTo(target, 9);
    expect(primaryNose(edited)!.aftRadius).toBeCloseTo(noseAft0 * 1.4, 9);
    // Original untouched; a fresh tree returned.
    expect(primaryBodyDiameter(rocket)).toBeCloseTo(d0, 9);
    expect(edited).not.toBe(rocket);
  });

  it("keeps the fins' planform (a 'same fins, wider tube' what-if)", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const edited = applyGeometryEdits(rocket, { bodyDiameter: primaryBodyDiameter(rocket)! * 1.5 });
    // Fins are unchanged — the flyer re-uses the same fins on a wider airframe.
    expect(primaryFinSpan(edited)).toBeCloseTo(primaryFinSpan(rocket)!, 9);
    expect(primaryFinRootChord(edited)).toBeCloseTo(primaryFinRootChord(rocket)!, 9);
  });

  it("scales internal tubes and rings too, so a narrowed tube stays the widest part", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const ringR = (r: typeof rocket) =>
      flattenRocket(r)
        .map((p) => p.component)
        .filter((c) => c.kind === "centeringring")
        .map((c) => (c as { outerRadius: number }).outerRadius);
    const before = ringR(rocket);
    expect(before.length).toBeGreaterThan(0);
    const edited = applyGeometryEdits(rocket, { bodyDiameter: primaryBodyDiameter(rocket)! * 0.75 });
    const after = ringR(edited);
    // Every centring ring narrowed by the same 0.75 factor — none is left poking past the tube.
    for (let i = 0; i < before.length; i++) expect(after[i]).toBeCloseTo(before[i] * 0.75, 9);
  });
});

describe("applyGeometryEdits — add a boattail (structural add)", () => {
  const boattailOf = (r: ReturnType<typeof newDesign>["rocket"]) =>
    flattenRocket(r)
      .map((p) => p.component)
      .find((c): c is Transition => c.kind === "transition");

  it("appends a conical boattail after the primary body tube, non-destructively", () => {
    const rocket = newDesign().rocket;
    expect(boattailOf(rocket)).toBeUndefined(); // the starter has no boattail
    const tube = primaryBodyTube(rocket)!;

    const edited = applyGeometryEdits(rocket, { boattailLength: 0.05, boattailAftDiameter: 0.04 });
    const bt = boattailOf(edited)!;
    expect(bt).toBeTruthy();
    expect(bt.shape).toBe("conical");
    expect(bt.length).toBeCloseTo(0.05, 9);
    // It fairs to the body: fore radius = tube radius, exit = half the requested diameter.
    expect(bt.foreRadius).toBeCloseTo(tube.outerRadius, 9);
    expect(bt.aftRadius).toBeCloseTo(0.02, 9);
    // Non-destructive: the original design still has no boattail.
    expect(boattailOf(rocket)).toBeUndefined();
  });

  it("fairs the boattail to the edited diameter when a caliber what-if is also active", () => {
    const rocket = newDesign().rocket;
    const dia0 = primaryBodyDiameter(rocket)!;
    const edited = applyGeometryEdits(rocket, {
      bodyDiameter: dia0 * 0.5, // halve the airframe…
      boattailLength: 0.05,
      boattailAftDiameter: dia0 * 0.4, // …exit still narrower than the halved body
    });
    const bt = boattailOf(edited)!;
    // Fore radius tracks the halved tube, not the original — the boattail fairs to the final mould line.
    expect(bt.foreRadius).toBeCloseTo((dia0 * 0.5) / 2, 9);
  });

  it("skips a boattail that wouldn't contract (exit ≥ body), keeping a valid design", () => {
    const rocket = newDesign().rocket;
    const dia0 = primaryBodyDiameter(rocket)!;
    const edited = applyGeometryEdits(rocket, { boattailLength: 0.05, boattailAftDiameter: dia0 * 1.2 });
    expect(boattailOf(edited)).toBeUndefined(); // no flared "boattail" is added
  });

  it("raises apogee by cutting base drag — the design lever it exists for", () => {
    const doc = newDesign();
    const base = runFlight(doc.rocket, { configId: "cfg-1" }).result.summary.apogee;
    const withBt = applyGeometryEdits(doc.rocket, { boattailLength: 0.06, boattailAftDiameter: 0.03 });
    const flown = runFlight(withBt, { configId: "cfg-1" }).result.summary.apogee;
    // Contracting the base removes most of the base drag, so the same motor flies higher.
    expect(flown).toBeGreaterThan(base);
  });
});

describe("applyGeometryEdits — dual-deploy recovery", () => {
  const chutesOf = (r: ReturnType<typeof newDesign>["rocket"]) =>
    flattenRocket(r).map((p) => p.component).filter((c): c is Parachute => c.kind === "parachute");

  it("promotes the main to an altitude deployment and adds a drogue at apogee", () => {
    const rocket = newDesign().rocket;
    expect(chutesOf(rocket)).toHaveLength(1); // the starter has a single apogee chute
    const mainD = primaryParachute(rocket)!.diameter;

    const dd = applyGeometryEdits(rocket, { mainDeployAltitude: 150, drogueDiameter: 0.3 });
    const chutes = chutesOf(dd);
    expect(chutes).toHaveLength(2);
    const main = chutes.find((c) => c.name === "Main parachute")!;
    const drogue = chutes.find((c) => c.name === "Drogue")!;
    expect(main.deployEvent).toBe("altitude");
    expect(main.deployAltitude).toBeCloseTo(150, 6);
    expect(main.diameter).toBeCloseTo(mainD, 6); // the main keeps its canopy
    expect(drogue.deployEvent).toBe("apogee");
    expect(drogue.diameter).toBeCloseTo(0.3, 6);
    // The original design is untouched.
    expect(chutesOf(rocket)).toHaveLength(1);
  });

  it("opens the main under the drogue at speed — the dual-deploy safety signature", () => {
    const rocket = newDesign().rocket;
    const single = runFlight(rocket, { configId: "cfg-1" }).result.summary;
    const dd = runFlight(applyGeometryEdits(rocket, { mainDeployAltitude: 150, drogueDiameter: 0.3 }), {
      configId: "cfg-1",
    }).result.summary;
    // A single apogee chute opens at ~0 m/s; the dual-deploy main opens after a drogue descent, so
    // its (worst-case) deployment speed is far higher — the shock that actually matters.
    expect(single.deploymentVelocity ?? 0).toBeLessThan(3);
    expect(dd.deploymentVelocity ?? 0).toBeGreaterThan(8);
    // …yet it still lands gently under the same main.
    expect(dd.groundHitVelocity!).toBeCloseTo(single.groundHitVelocity!, 0);
  });

  it("cuts the wind drift — the reason to fly dual-deploy", () => {
    const rocket = newDesign().rocket;
    const wind = { windSpeed: 6 }; // 6 m/s crosswind
    const single = runFlight(rocket, { configId: "cfg-1", overrides: wind }).result.summary.driftDistance!;
    const dd = runFlight(applyGeometryEdits(rocket, { mainDeployAltitude: 150, drogueDiameter: 0.3 }), {
      configId: "cfg-1",
      overrides: wind,
    }).result.summary.driftDistance!;
    // Falling fast under the drogue until 150 m spends far less time in the wind than drifting all
    // the way down under the main, so the landing is much closer to the pad.
    expect(single).toBeGreaterThan(0);
    expect(dd).toBeLessThan(single * 0.6);
  });
});

describe("applyGeometryEdits — main parachute diameter", () => {
  it("resizes the main canopy and scales its mass with area (∝ diameter²)", () => {
    const rocket = newDesign().rocket;
    const before = primaryParachute(rocket)!;
    const target = before.diameter * 2;

    const edited = applyGeometryEdits(rocket, { mainParachuteDiameter: target });
    const after = primaryParachute(edited)!;
    expect(after.diameter).toBeCloseTo(target, 6);
    // Twice the diameter ⇒ four times the canopy area ⇒ four times the mass.
    expect(after.mass).toBeCloseTo(before.mass * 4, 6);
    // An explicit area (if any) is cleared so the new diameter drives the descent.
    expect(after.area).toBeUndefined();
    // The original design is untouched.
    expect(primaryParachute(rocket)!.diameter).toBeCloseTo(before.diameter, 6);
  });

  it("a bigger main lands softer; a smaller main lands harder", () => {
    const rocket = newDesign().rocket;
    const base = runFlight(rocket, { configId: "cfg-1" }).result.summary.groundHitVelocity!;
    const d0 = primaryParachute(rocket)!.diameter;
    const big = runFlight(applyGeometryEdits(rocket, { mainParachuteDiameter: d0 * 1.5 }), { configId: "cfg-1" })
      .result.summary.groundHitVelocity!;
    const small = runFlight(applyGeometryEdits(rocket, { mainParachuteDiameter: d0 * 0.6 }), { configId: "cfg-1" })
      .result.summary.groundHitVelocity!;
    expect(base).toBeGreaterThan(0);
    expect(big).toBeLessThan(base);
    expect(small).toBeGreaterThan(base);
  });

  it("the recovery-sizing readout's diameter, applied, lands near its target speed", () => {
    // Close the loop the sizing goal-seek opens: resizing the main to the diameter it recommends for
    // a target landing speed should actually fly down at about that speed.
    const rocket = newDesign().rocket;
    const r = runFlight(rocket, { configId: "cfg-1" }).result;
    const refArea = Math.PI * r.stability.refRadius * r.stability.refRadius;
    const target = 4.5; // m/s — a gentle landing
    const sizing = recoverySizing({ descentMass: r.burnoutMass, refArea, airDensity: r.descentAirDensity }, target);
    expect(sizing.diameter).toBeGreaterThan(0);
    const landed = runFlight(applyGeometryEdits(rocket, { mainParachuteDiameter: sizing.diameter }), {
      configId: "cfg-1",
    }).result.summary.groundHitVelocity!;
    expect(landed).toBeCloseTo(target, 0); // within ~0.5 m/s of the target
  });

  it("resizes the main first, so a combined dual-deploy promotes the resized canopy", () => {
    const rocket = newDesign().rocket;
    const d0 = primaryParachute(rocket)!.diameter;
    const edited = applyGeometryEdits(rocket, {
      mainParachuteDiameter: d0 * 1.5,
      mainDeployAltitude: 150,
      drogueDiameter: 0.3,
    });
    const chutes = flattenRocket(edited).map((p) => p.component).filter((c): c is Parachute => c.kind === "parachute");
    const main = chutes.find((c) => c.name === "Main parachute")!;
    expect(main.deployEvent).toBe("altitude");
    expect(main.diameter).toBeCloseTo(d0 * 1.5, 6); // the promoted main is the resized one
  });

  it("is a no-op when unset, zero, or the design has no parachute", () => {
    const rocket = newDesign().rocket;
    expect(applyGeometryEdits(rocket, { mainParachuteDiameter: undefined })).toBe(rocket);
    expect(applyGeometryEdits(rocket, { mainParachuteDiameter: 0 })).toBe(rocket);
    // A design stripped of its parachute is returned unchanged.
    const noChute = {
      ...rocket,
      stages: rocket.stages.map((s) => ({
        ...s,
        components: s.components.map(function strip(c): typeof c {
          return { ...c, children: c.children.filter((k) => k.kind !== "parachute").map(strip) };
        }),
      })),
    };
    expect(primaryParachute(noChute)).toBeUndefined();
    // hasGeometryEdits is true, so the tree is rebuilt, but with no canopy to resize the result is
    // unchanged in substance (deep-equal to the input).
    expect(applyGeometryEdits(noChute, { mainParachuteDiameter: 1.2 })).toStrictEqual(noChute);
  });
});

describe("applyGeometryEdits — airframe material", () => {
  const shellMats = (r: ReturnType<typeof newDesign>["rocket"]) =>
    flattenRocket(r)
      .map((p) => p.component)
      .filter((c) => c.kind === "nosecone" || c.kind === "bodytube" || c.kind === "transition")
      .map((c) => (c as { material?: { name: string } }).material?.name);

  it("sets the chosen stock on the nose/body/transitions and leaves the fins alone", () => {
    const rocket = newDesign().rocket;
    const finMatBefore = primaryFinMaterial(rocket);

    const edited = applyGeometryEdits(rocket, { airframeMaterial: "aluminium" });
    expect(new Set(shellMats(edited))).toEqual(new Set(["aluminium"]));
    // Fins keep their own material — an airframe swap isn't a fin swap.
    expect(primaryFinMaterial(edited)).toBe(finMatBefore);
    // Non-destructive: the original still reads its own airframe material.
    expect(primaryAirframeMaterial(rocket)).toBe("fibreglass");
  });

  it("re-masses the airframe: a heavier stock lowers apogee, a lighter one raises it", () => {
    const rocket = newDesign().rocket;
    const base = runFlight(rocket, { configId: "cfg-1" }).result;
    const heavy = runFlight(applyGeometryEdits(rocket, { airframeMaterial: "aluminium" }), { configId: "cfg-1" }).result;
    const light = runFlight(applyGeometryEdits(rocket, { airframeMaterial: "cardboard" }), { configId: "cfg-1" }).result;
    const dryOf = (r: ReturnType<typeof runFlight>["result"]) => r.summary.apogee; // apogee proxies the mass change
    // Aluminium adds mass ⇒ lower apogee; cardboard sheds it ⇒ higher.
    expect(dryOf(heavy)).toBeLessThan(dryOf(base));
    expect(dryOf(light)).toBeGreaterThan(dryOf(base));
  });

  it("ignores an unknown material key (leaves the design as-is)", () => {
    const rocket = newDesign().rocket;
    const edited = applyGeometryEdits(rocket, { airframeMaterial: "unobtanium" });
    expect(new Set(shellMats(edited))).toEqual(new Set([primaryAirframeMaterial(rocket)]));
  });

  it("offers a sane material list", () => {
    expect(AIRFRAME_MATERIALS.length).toBeGreaterThan(3);
    expect(AIRFRAME_MATERIALS.map((m) => m.key)).toContain("fibreglass");
    for (const m of AIRFRAME_MATERIALS) expect(m.density).toBeGreaterThan(0);
  });
});

describe("body tubes are addressed by identity, not by role", () => {
  /** Every body tube on a design, nose-to-tail, with the station the flatten puts it at. */
  const tubesOf = (r: Rocket) => flattenRocket(r).filter((p) => p.component.kind === "bodytube");
  const lenOf = (p: { component: RocketComponent }) => (p.component as { length: number }).length;

  it("resolves the picked tube, and falls back to the longest without a pick", async () => {
    // Measured, not assumed: `demo-quirks.ork` imports as two body tubes — Upper, 0.50 m at
    // ⌀66 mm, and Motor mount body, 0.45 m at ⌀44 mm, with a transition between them. (The file's
    // third tube is inside a pod assembly the importer does not carry through.) The longest is
    // Upper, so that is what "the primary body tube" has always meant.
    const rocket = await load("demo-quirks.ork");
    const tubes = tubesOf(rocket);
    expect(tubes.length).toBe(2);

    expect(primaryBodyTube(rocket)!.name).toBe("Upper");
    for (const t of tubes) expect(primaryBodyTube(rocket, t.component.id)!.id).toBe(t.component.id);
    // A stale id from a restored session must not disable the body fields — it falls back rather
    // than resolving to nothing.
    expect(primaryBodyTube(rocket, "no-such-component")!.name).toBe("Upper");
  });

  it("resizes the PICKED tube and leaves every other tube alone", async () => {
    const rocket = await load("demo-quirks.ork");
    const target = tubesOf(rocket).find((p) => p.component.name === "Motor mount body")!;
    const other = tubesOf(rocket).find((p) => p.component.name === "Upper")!;
    const otherLen0 = lenOf(other);

    const edited = applyGeometryEdits(rocket, { bodyTubeId: target.component.id, bodyLength: 0.8 });

    // The picked tube took the value...
    expect(primaryBodyTube(edited, target.component.id)!.length).toBeCloseTo(0.8, 9);
    // ...and the tube the edit was NOT aimed at is untouched — including the longest one, which is
    // what the edit used to hit whatever the flyer had picked.
    expect(primaryBodyTube(edited, other.component.id)!.length).toBeCloseTo(otherLen0, 9);
    // The whole airframe stretches by the same 0.35 m, so the edit really did reach the flight.
    expect(overallLength(edited)).toBeCloseTo(overallLength(rocket) + 0.35, 6);
    // Non-destructive.
    expect(lenOf(tubesOf(rocket).find((p) => p.component.id === target.component.id)!)).toBeCloseTo(0.45, 9);
  });

  it("without a pick still resizes the longest tube — the old behaviour is the default", async () => {
    const rocket = await load("demo-quirks.ork");
    const upper = tubesOf(rocket).find((p) => p.component.name === "Upper")!;
    const mount = tubesOf(rocket).find((p) => p.component.name === "Motor mount body")!;
    const edited = applyGeometryEdits(rocket, { bodyLength: 0.9 });
    expect(primaryBodyTube(edited, upper.component.id)!.length).toBeCloseTo(0.9, 9);
    expect(primaryBodyTube(edited, mount.component.id)!.length).toBeCloseTo(0.45, 9);
  });

  it("seeds the caliber scale from the picked tube, so that tube hits the target diameter", async () => {
    const rocket = await load("demo-quirks.ork");
    const mount = tubesOf(rocket).find((p) => p.component.name === "Motor mount body")!;
    const mountDia0 = primaryBodyDiameter(rocket, mount.component.id)!;
    const upperDia0 = primaryBodyDiameter(rocket)!;
    expect(mountDia0).toBeCloseTo(0.044, 9);
    expect(upperDia0).toBeCloseTo(0.066, 9); // the two calibers really do differ

    const target = 0.06;
    const edited = applyGeometryEdits(rocket, { bodyTubeId: mount.component.id, bodyDiameter: target });
    // The tube the field was reading is the tube that lands on the number typed into it. Seeded from
    // the longest tube instead, this came out at 0.040 m — the flyer types 60 mm and gets 40.
    expect(primaryBodyDiameter(edited, mount.component.id)).toBeCloseTo(target, 9);
    // The rest of the outer airframe follows by the SAME factor, so the mould line stays faired —
    // this edit is deliberately group-wide, and the panel says so.
    const f = target / mountDia0;
    expect(primaryBodyDiameter(edited)!).toBeCloseTo(upperDia0 * f, 9);
  });

  it("a body-tube pick on its own is not an edit and flies the design untouched", async () => {
    const rocket = await load("demo-quirks.ork");
    const mount = tubesOf(rocket).find((p) => p.component.name === "Motor mount body")!;
    expect(hasGeometryEdits({ bodyTubeId: mount.component.id })).toBe(false);
    expect(applyGeometryEdits(rocket, { bodyTubeId: mount.component.id })).toBe(rocket);
  });

  it("counts the tubes the body fields cannot reach without a pick", async () => {
    expect(unreachableBodyTubeCount(await load("demo-quirks.ork"))).toBe(1);
    expect(unreachableBodyTubeCount(await load("demo-single-deploy.ork"))).toBe(0);
  });
});

describe("aimEditsAt — which fields a pick re-aims", () => {
  it("aims the body fields at a body tube and the fin fields at a fin set", async () => {
    const rocket = await load("demo-quirks.ork");
    const parts = flattenRocket(rocket);
    const tube = parts.find((p) => p.component.kind === "bodytube")!;
    const fin = parts.find((p) => p.component.kind.endsWith("finset"))!;

    expect(aimEditsAt(rocket, tube.component.id)).toEqual({ bodyTubeId: tube.component.id });
    expect(aimEditsAt(rocket, fin.component.id)).toEqual({ finSetId: fin.component.id });
  });

  it("re-aims nothing for a part no field describes, or for an id the design does not have", async () => {
    // `demo-quirks.ork` carries a tube coupler, a mass object, a streamer and a transition — parts a
    // flyer reads on the diagram and that no editor field describes. Reading one must move no aim.
    const rocket = await load("demo-quirks.ork");
    const coupler = flattenRocket(rocket).find((p) => p.component.kind === "tubecoupler")!;
    expect(coupler, "the fixture needs a part that drives no field").toBeTruthy();
    expect(aimEditsAt(rocket, coupler.component.id)).toEqual({});
    expect(aimEditsAt(rocket, "no-such-component")).toEqual({});
  });

  it("leaves the other aim alone, so an active edit cannot follow an unrelated pick", async () => {
    // The destructive version of this is silent: with the fin fields aimed at one set and a span set,
    // a body-tube pick that cleared the fin aim would re-apply that span to the frontmost set — a
    // different fin changes, with the field still reading the value the flyer typed.
    const rocket = await load("demo-quirks.ork");
    const parts = flattenRocket(rocket);
    const fin = parts.find((p) => p.component.kind.endsWith("finset"))!;
    const tube = parts.find((p) => p.component.kind === "bodytube")!;
    const merged = { finSetId: fin.component.id, ...aimEditsAt(rocket, tube.component.id) };
    expect(merged.finSetId).toBe(fin.component.id);
    expect(merged.bodyTubeId).toBe(tube.component.id);
  });
});

describe("naming the part the fields are holding", () => {
  it("uses the design's own name when it tells the part apart", async () => {
    const rocket = await load("demo-quirks.ork");
    const mount = flattenRocket(rocket).find((p) => p.component.name === "Motor mount body")!;
    expect(primaryBodyTubePart(rocket, mount.component.id)!.name).toBe("Motor mount body");
    expect(primaryBodyTubePart(rocket)!.name).toBe("Upper");
  });

  it("names by station when the design names every tube alike", async () => {
    // Real files do: `two-stage-firm-booster.ork` calls both of its tubes "body". A shared name
    // distinguishes nothing, so the label falls back to where the part sits — which, unlike the
    // positional name this replaced, stays true however the parts table beside it is sorted.
    const bytes = new Uint8Array(
      readFileSync(resolve(process.cwd(), "e2e/fixtures", "two-stage-firm-booster.ork")),
    );
    const rocket = (await importOrk(bytes)).rocket;
    const tubes = flattenRocket(rocket).filter((p) => p.component.kind === "bodytube");
    expect(tubes.length).toBe(2);
    expect(new Set(tubes.map((p) => p.component.name)).size).toBe(1); // both called the same thing

    for (const t of tubes) {
      const part = primaryBodyTubePart(rocket, t.component.id)!;
      expect(part.name).toBeUndefined();
      expect(part.station).toBeCloseTo(t.xFore, 9);
      expect(part.covers).toBe(1);
    }
    // And the two stations differ, so the two labels differ — the whole point of naming by station.
    expect(primaryBodyTubePart(rocket, tubes[0].component.id)!.station).toBeCloseTo(0.2, 6);
    expect(primaryBodyTubePart(rocket, tubes[1].component.id)!.station).toBeCloseTo(0.8, 6);
  });

  it("states how many fin sets the fin fields change, rather than naming one and changing several", async () => {
    // `ARC payload rocket.ork` in the corpus is one 3-fin ring stored as three 1-fin sets: the fin
    // fields must move all three together, and a label naming one set claimed they moved one.
    // Reproduced here by duplicating a ring at its own station.
    const rocket = await load("demo-single-deploy.ork");
    const fin = flattenRocket(rocket).find((p) => p.component.kind === "trapezoidfinset")!;
    const addTwin = (list: RocketComponent[]): RocketComponent[] =>
      list.map((c) =>
        c.children.some((ch) => ch.id === fin.component.id)
          ? {
              ...c,
              children: [
                ...c.children,
                { ...(fin.component as TrapezoidFinSet), id: `${fin.component.id}-twin` },
              ],
            }
          : c.children.length
            ? { ...c, children: addTwin(c.children) }
            : c,
      );
    const twinned: Rocket = {
      ...rocket,
      stages: rocket.stages.map((s) => ({ ...s, components: addTwin(s.components) })),
    };
    expect(primaryFinGroupIds(twinned, fin.component.id).size).toBe(2);
    expect(primaryFinSetPart(twinned, fin.component.id)!.covers).toBe(2);
    // A single-set design says 1, so the caller only has something to disclose when there is one.
    expect(primaryFinSetPart(rocket, fin.component.id)!.covers).toBe(1);
  });

  it("is undefined on a design with no such part", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const strip = (list: RocketComponent[]): RocketComponent[] =>
      list
        .filter((c) => !c.kind.endsWith("finset"))
        .map((c) => (c.children.length ? { ...c, children: strip(c.children) } : c));
    const finless: Rocket = {
      ...rocket,
      stages: rocket.stages.map((s) => ({ ...s, components: strip(s.components) })),
    };
    expect(primaryFinSetPart(finless)).toBeUndefined();
    expect(primaryBodyTubePart(finless)).toBeDefined();
  });
});

describe("the recovery fields address the canopy you picked", () => {
  const chutesOf = (r: Rocket) => flattenRocket(r).filter((p) => p.component.kind === "parachute");
  /** The design's canopies by name, so a test can say which one it meant. */
  const byName = (r: Rocket, name: string) =>
    chutesOf(r).find((p) => p.component.name === name)!.component as Parachute;

  it("resolves the picked canopy, and falls back to the largest without a pick", async () => {
    // `demo-dual-deploy.ork`: a 1.22 m main and a 0.46 m drogue — the shape 17 of the 35 corpus
    // designs have, since every dual-deploy design carries two canopies by definition.
    const rocket = await load("demo-dual-deploy.ork");
    expect(chutesOf(rocket).length).toBe(2);

    expect(primaryParachute(rocket)!.name).toBe("Main parachute");
    for (const c of chutesOf(rocket)) {
      expect(primaryParachute(rocket, c.component.id)!.id).toBe(c.component.id);
    }
    // A stale id must not disable the recovery fields.
    expect(primaryParachute(rocket, "no-such-component")!.name).toBe("Main parachute");
  });

  it("resizes the PICKED canopy and leaves the other alone", async () => {
    const rocket = await load("demo-dual-deploy.ork");
    const drogue = byName(rocket, "Drogue parachute");
    const mainD0 = byName(rocket, "Main parachute").diameter;

    const edited = applyGeometryEdits(rocket, {
      parachuteId: drogue.id,
      mainParachuteDiameter: 0.9,
    });
    // The canopy the field was reading is the one that took the number. Without the aim this landed
    // on the main instead — the flyer shrinks a drogue and the main changes.
    expect(primaryParachute(edited, drogue.id)!.diameter).toBeCloseTo(0.9, 9);
    expect(byName(edited, "Main parachute").diameter).toBeCloseTo(mainD0, 9);
    // Canopy mass scales with area, so the resized chute got heavier by (0.9/0.46)².
    expect(primaryParachute(edited, drogue.id)!.mass).toBeCloseTo(drogue.mass * (0.9 / drogue.diameter) ** 2, 9);
    // Non-destructive.
    expect(byName(rocket, "Drogue parachute").diameter).toBeCloseTo(drogue.diameter, 9);
  });

  it("without a pick still resizes the largest canopy — the old behaviour is the default", async () => {
    const rocket = await load("demo-dual-deploy.ork");
    const drogueD0 = byName(rocket, "Drogue parachute").diameter;
    const edited = applyGeometryEdits(rocket, { mainParachuteDiameter: 1.6 });
    expect(byName(edited, "Main parachute").diameter).toBeCloseTo(1.6, 9);
    expect(byName(edited, "Drogue parachute").diameter).toBeCloseTo(drogueD0, 9);
  });

  it("changes the flight: resizing the picked canopy moves the landing speed", async () => {
    // The reason this matters rather than being tidy. Landing speed and landing energy are what
    // recovery sizing exists to get right, and the drogue sets the descent from apogee to the main.
    const rocket = await load("demo-dual-deploy.ork");
    const drogue = byName(rocket, "Drogue parachute");
    const base = runFlight(rocket, {}).result;
    const bigger = runFlight(
      applyGeometryEdits(rocket, { parachuteId: drogue.id, mainParachuteDiameter: drogue.diameter * 2 }),
      {},
    ).result;
    // A larger drogue slows the descent, so the flight lasts longer.
    expect(bigger.summary.flightTime).toBeGreaterThan(base.summary.flightTime);
  });

  it("promotes the canopy you picked to the altitude deployment", async () => {
    const rocket = await load("demo-dual-deploy.ork");
    const drogue = byName(rocket, "Drogue parachute");
    const edited = applyGeometryEdits(rocket, {
      parachuteId: drogue.id,
      mainDeployAltitude: 200,
      drogueDiameter: 0.3,
    });
    const promoted = primaryParachute(edited, drogue.id)!;
    expect(promoted.deployEvent).toBe("altitude");
    expect(promoted.deployAltitude).toBeCloseTo(200, 9);
  });

  it("a canopy pick on its own is not an edit and flies the design untouched", async () => {
    const rocket = await load("demo-dual-deploy.ork");
    const drogue = byName(rocket, "Drogue parachute");
    expect(hasGeometryEdits({ parachuteId: drogue.id })).toBe(false);
    expect(applyGeometryEdits(rocket, { parachuteId: drogue.id })).toBe(rocket);
  });

  it("counts the canopies the recovery fields cannot reach without a pick", async () => {
    expect(unreachableParachuteCount(await load("demo-dual-deploy.ork"))).toBe(1);
    expect(unreachableParachuteCount(await load("demo-single-deploy.ork"))).toBe(0);
  });

  it("names the canopy it is holding", async () => {
    const rocket = await load("demo-dual-deploy.ork");
    const drogue = byName(rocket, "Drogue parachute");
    expect(primaryParachutePart(rocket, drogue.id)!.name).toBe("Drogue parachute");
    expect(primaryParachutePart(rocket)!.name).toBe("Main parachute");
    expect(primaryParachutePart(rocket, drogue.id)!.covers).toBe(1);
  });

  it("aims the recovery fields at a canopy and nothing else at one", async () => {
    const rocket = await load("demo-dual-deploy.ork");
    const drogue = byName(rocket, "Drogue parachute");
    expect(aimEditsAt(rocket, drogue.id)).toEqual({ parachuteId: drogue.id });
  });
});

describe("the aim registry is the one list", () => {
  it("makes every selection field inert, so a pick is never counted as a what-if", () => {
    for (const slot of Object.keys(AIM_SLOTS)) {
      expect(INERT_EDIT_FIELDS.has(slot), `${slot} must be inert`).toBe(true);
      expect(hasGeometryEdits({ [slot]: "some-id" })).toBe(false);
    }
    // And the one inert field that is not an aim stays inert.
    expect(INERT_EDIT_FIELDS.has("payloadStation")).toBe(true);
  });

  it("gives every slot at least one value field, and never shares one between slots", () => {
    const seen = new Map<string, string>();
    for (const [slot, def] of Object.entries(AIM_SLOTS)) {
      expect(def.targets.length, `${slot} aims nothing`).toBeGreaterThan(0);
      expect(def.kinds.length, `${slot} matches no kind`).toBeGreaterThan(0);
      for (const t of def.targets) {
        // A field aimed by two slots would have two answers to "which part does this land on".
        expect(seen.has(t), `${t} is aimed by both ${seen.get(t)} and ${slot}`).toBe(false);
        seen.set(t, slot);
      }
    }
  });

  it("never routes one component kind to two slots", () => {
    const seen = new Map<string, string>();
    for (const [slot, def] of Object.entries(AIM_SLOTS)) {
      for (const k of def.kinds) {
        expect(seen.has(k), `${k} would aim both ${seen.get(k)} and ${slot}`).toBe(false);
        seen.set(k, slot);
      }
    }
  });

  it("projects only the aims out of an edit bag, never a value", async () => {
    const rocket = await load("demo-dual-deploy.ork");
    const chute = flattenRocket(rocket).find((p) => p.component.kind === "parachute")!.component.id;
    const aims = aimsOf({ parachuteId: chute, finSpan: 0.05, bodyLength: 0.4, payloadStation: 0.2 });
    expect(aims.parachuteId).toBe(chute);
    expect(aims.finSetId).toBeUndefined();
    // The values must not leak through: a view watching this map for "the aim moved" would otherwise
    // fire on a typed span, with a number where a component id belongs.
    expect(Object.keys(aims).sort()).toEqual(Object.keys(AIM_SLOTS).sort());
    for (const v of Object.values(aims)) expect(typeof v === "string" || v === undefined).toBe(true);
  });
});

describe("a structural add stays where it belongs, whatever tube is picked", () => {
  /** Every component's station, keyed by id, so a test can say where a part landed. */
  const stations = (r: Rocket) => new Map(flattenRocket(r).map((p) => [p.component.id, p.xFore]));

  it("puts the boattail on the tail even when a picked tube is lengthened past the longest", async () => {
    // `demo-quirks.ork` is a 500 mm forward tube ahead of a 450 mm aft tube, so the LONGEST tube is
    // already the forward one — the committed fixture that reproduces the shape without the corpus,
    // which is gitignored and absent on a fork.
    //
    // The live version was measured on `01.One-stage.ork` (a 254 mm payload tube ahead of a 610 mm body
    // tube, where "longest" did stand in for "aft" until `bodyLength` became aimed): picking the
    // forward tube and taking it to 700 mm made it the longest, and the tail cone moved with it to
    // station 889 mm, contracting 54 mm to 40 mm and re-expanding through the transition behind it.
    // The solver flies that, so base drag, CP, CG and apogee all came from a rocket nobody asked for.
    const rocket = await load("demo-quirks.ork");
    const tubes = flattenRocket(rocket).filter((p) => p.component.kind === "bodytube");
    expect(tubes.length).toBe(2);
    const fwd = tubes[0].component.id;
    const aft = tubes[1].component.id;

    const add = { boattailLength: 0.05, boattailAftDiameter: 0.03 };
    const noPick = applyGeometryEdits(rocket, add);
    const picked = applyGeometryEdits(rocket, { ...add, bodyTubeId: fwd, bodyLength: 0.9 });

    // Either way the boattail hangs off the AFT tube, never the forward one.
    expect(stations(noPick).has(`${aft}-boattail`)).toBe(true);
    expect(stations(picked).has(`${aft}-boattail`)).toBe(true);
    expect(stations(picked).has(`${fwd}-boattail`)).toBe(false);
    // And it sits behind the aft tube's own trailing edge, not part-way up the airframe.
    const st = stations(picked);
    const aftPlaced = flattenRocket(picked).find((p) => p.component.id === aft)!;
    expect(st.get(`${aft}-boattail`)!).toBeCloseTo(aftPlaced.xFore + aftPlaced.length, 6);
    // The forward tube really did grow past the aft one, so the case is live rather than side-stepped.
    expect(flattenRocket(picked).find((p) => p.component.id === fwd)!.length).toBeCloseTo(0.9, 9);
  });

  it("puts the payload in the tube that is picked, and says where that is", async () => {
    const rocket = await load("demo-quirks.ork");
    const tubes = flattenRocket(rocket).filter((p) => p.component.kind === "bodytube");
    const mount = tubes.find((p) => p.component.name === "Motor mount body")!.component.id;
    const upper = tubes.find((p) => p.component.name === "Upper")!.component.id;

    // Blank station, no pick: the bay goes in the primary (longest) tube, as it always has.
    const none = applyGeometryEdits(rocket, { payloadMassKg: 0.3 });
    expect(stations(none).has(`${upper}-payload`)).toBe(true);

    // Blank station with the aft tube picked: the bay goes THERE...
    const aimed = applyGeometryEdits(rocket, { bodyTubeId: mount, payloadMassKg: 0.3 });
    expect(stations(aimed).has(`${mount}-payload`)).toBe(true);
    expect(stations(aimed).has(`${upper}-payload`)).toBe(false);
    // ...and the field's placeholder names the same tube's mid-point, so a blank and what a blank does
    // agree. They did not: the station field went on advertising the primary tube's mid-point.
    const placeholder = defaultPayloadStation(rocket, mount)!;
    expect(stations(aimed).get(`${mount}-payload`)!).toBeCloseTo(placeholder, 9);
    expect(defaultPayloadStation(rocket)).not.toBeCloseTo(placeholder, 6);
  });

  it("resolves the aft-most tube by station, not by length", async () => {
    // The distinction is the whole fix: `demo-quirks.ork`'s aft tube (450 mm) is SHORTER than its
    // forward one (500 mm), so anything resolving "longest" picks the wrong end unaided.
    const rocket = await load("demo-quirks.ork");
    const tubes = flattenRocket(rocket).filter((p) => p.component.kind === "bodytube");
    const aft = tubes.reduce((a, b) => (b.xFore > a.xFore ? b : a));
    expect(aft.component.name).toBe("Motor mount body");
    expect(primaryBodyTube(rocket)!.name).toBe("Upper"); // the longest is the FORWARD one
    const edited = applyGeometryEdits(rocket, { boattailLength: 0.04, boattailAftDiameter: 0.03 });
    expect(stations(edited).has(`${aft.component.id}-boattail`)).toBe(true);
  });
});

describe("the boattail's advertised bound is the bound that is enforced", () => {
  it("quotes the tube the cone attaches to, not the tube that happens to be picked", async () => {
    // The exit is validated against the tube the cone attaches to (`aftRadius < tube.outerRadius`), so a
    // field quoting a DIFFERENT component's caliber promises a limit the validator never applies — and a
    // value inside the advertised range is then a silent no-op, the worst of the three outcomes.
    // `demo-quirks.ork`: the aft tube is ⌀44 mm, the forward (and longest) one ⌀66 mm.
    const rocket = await load("demo-quirks.ork");
    const tubes = flattenRocket(rocket).filter((p) => p.component.kind === "bodytube");
    const fwd = tubes[0].component.id;

    const fairsTo = aftmostBodyDiameter(rocket)!;
    expect(fairsTo).toBeCloseTo(0.044, 9);
    // Not the same as the picked tube's caliber, so the two really can disagree.
    expect(primaryBodyDiameter(rocket, fwd)).toBeCloseTo(0.066, 9);

    // A value under the ADVERTISED bound is accepted and builds a cone...
    const ok = applyGeometryEdits(rocket, { boattailLength: 0.05, boattailAftDiameter: fairsTo * 0.8 });
    expect(flattenRocket(ok).some((p) => p.component.id.endsWith("-boattail"))).toBe(true);
    // ...and one at or above it is refused, which is exactly why the field must not advertise the wider
    // tube: 60 mm sits inside the forward tube's 66 mm and is silently dropped.
    const refused = applyGeometryEdits(rocket, { boattailLength: 0.05, boattailAftDiameter: 0.06 });
    expect(flattenRocket(refused).some((p) => p.component.id.endsWith("-boattail"))).toBe(false);
  });
});
