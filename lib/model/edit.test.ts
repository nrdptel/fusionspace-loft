import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { importOrk } from "../ork/import";
import { flattenRocket } from "./geometry";
import {
  applyGeometryEdits,
  moveTarget,
  moveSlots,
  isEditedValue,
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
  structureOf,
  transitionDefaults,
  primaryTransition,
  primaryTransitionPart,
  authoredTransitionName,
  mouldLineStep,
  primaryMassObject,
  primaryMassObjectStation,
  aimsClearedByAiming,
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
  removalRefusal,
  newPartId,
  aimsClearedByRemoving,
  hasGeometryEdits,
  canAddStage,
  stageSeedBase,
  addedStageIds,
} from "./edit";
import type {
  BodyTube,
  MassComponent,
  GenericFinSet,
  NoseCone,
  Transition,
  Parachute,
  Rocket,
  RocketComponent,
  TrapezoidFinSet,
} from "./types";
import { overallLength } from "./geometry";
import { newDesign } from "./starter";
import { runFlight } from "../sim/run";
import { dryMassProperties, statedMassHolder } from "../sim/mass";
import { isUuidShaped } from "./id";
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

describe("a motor cluster and a body length on the same tube", () => {
  it("both apply, rather than whichever branch ran first", async () => {
    // A component can be BOTH a motor mount and something else the editor changes: on a
    // minimum-diameter design the mount IS a body tube. The cluster used to be its own early-returning
    // branch below the length branch, so the length won and the cluster was dropped in silence — while
    // the Motors field, which reads the edit bag, went on saying three.
    //
    // Measured on `01.One-stage.ork`, whose mount is a body tube: `motorClusterCount: 3` alone flies
    // three motors at 1,243 m and thrust-to-weight 33.1; the same edit plus a body length on that tube
    // flew ONE, at 692 m and 19.0. Motor count is the number a flyer plans a flight around.
    // `demo-quirks.ork` is the committed fixture of the same shape — its mount is a body tube — so the
    // pin runs where the corpus is absent.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-quirks.ork")));
    const mount = flattenRocket(doc.rocket).find((p) => "motorMount" in p.component && p.component.motorMount)!.component;
    expect(mount.kind, "the fixture's mount must BE a body tube").toBe("bodytube");

    const clusterOnly = applyGeometryEdits(doc.rocket, { motorClusterCount: 3 });
    expect(primaryMotorClusterCount(clusterOnly)).toBe(3);

    const both = applyGeometryEdits(doc.rocket, {
      motorClusterCount: 3,
      bodyTubeId: mount.id,
      bodyLength: (mount as BodyTube).length * 1.5,
    });
    expect(primaryMotorClusterCount(both), "the cluster must survive a length edit on its own tube").toBe(3);
    expect(primaryBodyTube(both, mount.id)!.length).toBeCloseTo((mount as BodyTube).length * 1.5, 9);

    // And it reaches the flight, not just the model: three motors is three motors' thrust.
    const one = runFlight(doc.rocket, {}).result.summary;
    const three = runFlight(both, {}).result.summary;
    expect(three.thrustToWeight).toBeGreaterThan(one.thrustToWeight * 1.5);
    expect(three.apogee).toBeGreaterThan(one.apogee);
  });

  it("leaves a design whose mount is an inner tube exactly as it was", async () => {
    // The control: the defect only ever bit where one component wore both roles.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    expect(flattenRocket(doc.rocket).find((p) => "motorMount" in p.component && p.component.motorMount)!.component.kind).toBe("innertube");
    const tube = primaryBodyTube(doc.rocket)!;
    const both = applyGeometryEdits(doc.rocket, {
      motorClusterCount: 3,
      bodyTubeId: tube.id,
      bodyLength: tube.length * 1.5,
    });
    expect(primaryMotorClusterCount(both)).toBe(3);
    expect(primaryBodyTube(both, tube.id)!.length).toBeCloseTo(tube.length * 1.5, 9);
  });
});

describe("the base a surface reads FROM", () => {
  // Every panel and every sweep axis shows a value to edit FROM and then writes the edit TO whatever
  // the aim resolves to. Read those two off different trees and they name different components: an
  // aim at a part the flyer AUTHORED resolves to nothing in the imported design, so every `primary*`
  // resolver falls back to the design's own primary part. `structureOf` is the one tree where both
  // agree, and this is the invariant that says so.
  it("resolves an aim at an authored part to that part, where the import cannot", async () => {
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const anchor = flattenRocket(doc.rocket).find((p) => p.component.kind === "bodytube")!.component;
    const id = newPartId(doc.rocket, undefined, anchor.id);
    const edits = { added: [{ id, kind: "bodytube" as const, after: anchor.id, length: 0.11 }], bodyTubeId: id };

    // The imported design cannot see the part, so the aim silently falls back.
    const fromImport = primaryBodyTube(doc.rocket, edits.bodyTubeId);
    expect(fromImport).toBeTruthy();
    expect(fromImport!.id).not.toBe(id);

    // The design plus the flyer's structure resolves it, and to the same part the edit lands on.
    const base = structureOf(doc.rocket, edits);
    expect(primaryBodyTube(base, edits.bodyTubeId)!.id).toBe(id);
    expect(primaryBodyTube(base, edits.bodyTubeId)!.length).toBeCloseTo(0.11, 9);
    const flown = applyGeometryEdits(doc.rocket, { ...edits, bodyLength: 0.4 });
    expect(flattenRocket(flown).find((p) => p.component.id === id)!.component).toMatchObject({ length: 0.4 });
    // ...and the part the import would have named is left alone.
    expect(flattenRocket(flown).find((p) => p.component.id === fromImport!.id)!.component).toMatchObject({
      length: fromImport!.length,
    });
  });

  it("leaves the dimension edits out, so it is a base and not the result", async () => {
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const tube = primaryBodyTube(doc.rocket)!;
    const base = structureOf(doc.rocket, { bodyLength: tube.length * 2 });
    expect(primaryBodyTube(base)!.length).toBeCloseTo(tube.length, 9);
  });
});

describe("adding a component", () => {
  const tubes = (r: Rocket) => flattenRocket(r).filter((p) => p.component.kind === "bodytube");

  it("puts an authored tube behind the one it names, faired to it", async () => {
    // R3's capability, and the first edit that is an OPERATION rather than a value: there is no field
    // in the flat patch for a part that does not exist yet. The caliber is inherited rather than typed
    // because a tube that does not fair to the airframe it joins is a step in the outer mould line —
    // a different drag and a different stability, on a design nobody meant to draw.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const before = tubes(doc.rocket);
    expect(before.length).toBe(1);
    const host = before[0].component as BodyTube;

    const id = newPartId(doc.rocket, undefined, host.id);
    const built = applyGeometryEdits(doc.rocket, {
      added: [{ id, kind: "bodytube", after: host.id, length: 0.25 }],
    });

    const after = tubes(built);
    expect(after.length).toBe(2);
    const mine = after.find((p) => p.component.id === id)!;
    expect((mine.component as BodyTube).length).toBeCloseTo(0.25, 9);
    expect((mine.component as BodyTube).outerRadius).toBeCloseTo(host.outerRadius, 9);
    expect(mine.component.material?.name).toBe(host.material?.name);
    expect(mine.component.finish).toBe(host.finish);
    // Behind it, not in front: the airframe is longer by exactly the length authored.
    expect(mine.xFore).toBeGreaterThan(before[0].xFore);
    expect(overallLength(built)).toBeCloseTo(overallLength(doc.rocket) + 0.25, 9);
  });

  it("flies, weighs and balances as a longer rocket", async () => {
    // "Have the stability and mass panels describe the rocket they just built" — asserted through the
    // model the panels read, not by eye. A part that draws but weighs nothing would pass a shape test
    // and fly a lie.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const host = tubes(doc.rocket)[0].component;
    const id = newPartId(doc.rocket, undefined, host.id);
    const built = applyGeometryEdits(doc.rocket, {
      added: [{ id, kind: "bodytube", after: host.id, length: 0.25 }],
    });

    const bare = dryMassProperties(doc.rocket);
    const grown = dryMassProperties(built);
    expect(grown.mass).toBeGreaterThan(bare.mass);
    expect(grown.cg).not.toBeCloseTo(bare.cg, 6);
    // And it actually flies: a heavier, longer, draggier rocket does not climb as high, and it is the
    // stability the panels report that moves, not just a number in the model.
    const flown = runFlight(built, {}).result;
    const bareFlight = runFlight(doc.rocket, {}).result;
    expect(flown.summary.apogee).toBeGreaterThan(0);
    expect(flown.summary.apogee).toBeLessThan(bareFlight.summary.apogee);
    expect(flown.staticMarginCal).not.toBeCloseTo(bareFlight.staticMarginCal, 3);
  });

  it("is editable, removable and aimable exactly like an imported part", async () => {
    // The architecture invariant: authoring produces the SAME model the importers produce, so every
    // mechanism that already exists works on it without knowing it was authored.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const host = tubes(doc.rocket)[0].component;
    const id = newPartId(doc.rocket, undefined, host.id);
    const added = [{ id, kind: "bodytube" as const, after: host.id, length: 0.25 }];

    // Aimed at, and edited.
    const built = applyGeometryEdits(doc.rocket, { added });
    expect(aimEditsAt(built, id).bodyTubeId).toBe(id);
    const longer = applyGeometryEdits(doc.rocket, { added, bodyTubeId: id, bodyLength: 0.4 });
    expect(primaryBodyTube(longer, id)!.length).toBeCloseTo(0.4, 9);

    // Removed by the same list that removes an imported part, and the design is back to one tube.
    const gone = applyGeometryEdits(doc.rocket, { added, removedIds: [id] });
    expect(tubes(gone).length).toBe(1);
    // And it is not the LAST tube, so removing the design's own one is allowed now that there are two.
    expect(removalRefusal(built, host.id)).toBe(null);
  });

  it("keeps an authored part when its neighbour is removed, and drops one whose anchor never existed", async () => {
    // Two different situations, and they must not be confused. Adds are applied BEFORE removals, so a
    // part authored behind a tube is a SIBLING of it: removing that tube leaves the flyer's own part in
    // place and moves it forward, which is the least surprising thing that can happen to a part
    // somebody deliberately made. What IS dropped is an entry whose anchor is not in the design at all
    // — a stale `after` from a restored session — because the anchor is the only thing that says where
    // the part goes, and re-anchoring it at the aft end would move a flyer's part without saying so.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "e2e/fixtures/two-stage-firm-booster.ork")));
    const host = tubes(doc.rocket)[0].component;
    const id = newPartId(doc.rocket, undefined, host.id);
    const added = [{ id, kind: "bodytube" as const, after: host.id, length: 0.2 }];
    expect(tubes(applyGeometryEdits(doc.rocket, { added })).length).toBe(tubes(doc.rocket).length + 1);

    const neighbourGone = applyGeometryEdits(doc.rocket, { added, removedIds: [host.id] });
    expect(flattenRocket(neighbourGone).some((p) => p.component.id === id)).toBe(true);
    expect(flattenRocket(neighbourGone).some((p) => p.component.id === host.id)).toBe(false);

    const stale = applyGeometryEdits(doc.rocket, {
      added: [{ id, kind: "bodytube", after: "a-part-no-design-has", length: 0.2 }],
    });
    expect(flattenRocket(stale).some((p) => p.component.id === id)).toBe(false);
  });

  it("refuses a length that is not a part, and an anchor with no caliber to inherit", async () => {
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const host = tubes(doc.rocket)[0].component;
    const n = tubes(doc.rocket).length;
    for (const length of [0, -0.1, Number.NaN]) {
      const out = applyGeometryEdits(doc.rocket, {
        added: [{ id: "x", kind: "bodytube", after: host.id, length }],
      });
      expect(tubes(out).length, `length ${length} must not build a tube`).toBe(n);
    }
    // A fin set has no diameter to fair to, so there is nothing to inherit and nothing is built.
    const fins = flattenRocket(doc.rocket).find((p) => p.component.kind.endsWith("finset"))!;
    const out = applyGeometryEdits(doc.rocket, {
      added: [{ id: "y", kind: "bodytube", after: fins.component.id, length: 0.2 }],
    });
    expect(tubes(out).length).toBe(n);
  });

  it("mints a stable, UUID-shaped, unique id", async () => {
    // Derived rather than random, so the same sequence of edits produces the same ids — which is what
    // lets a stored aim, a removal and an undo still point at the right part after a reload. And
    // UUID-shaped so the authored part can be exported to `.ork` and re-imported as itself.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const host = tubes(doc.rocket)[0].component;
    const first = newPartId(doc.rocket, undefined, host.id);
    expect(first).toBe(newPartId(doc.rocket, undefined, host.id));
    expect(isUuidShaped(first)).toBe(true);
    const one = [{ id: first, kind: "bodytube" as const, after: host.id, length: 0.2 }];
    const second = newPartId(doc.rocket, one, host.id);
    expect(second).not.toBe(first);
    expect(isUuidShaped(second)).toBe(true);
  });

  it("never gives an authored tube a material without a wall to go with it", async () => {
    // The quietest wrong number this milestone could ship. `lib/sim/mass.ts` models a tube that has a
    // material and no wall thickness as a SOLID ROD — measured on a hand-built part, 2.13x the mass and
    // 72% off the apogee, with no error raised anywhere. Inheritance alone does not protect against it,
    // so the pair travels together by construction.
    //
    // Measured across the corpus: of 90 body tubes, exactly 12 carry neither wall nor material, and all
    // 12 are the RASAero ones — that format states no materials at all and its geometry is deliberately
    // massless, with the weight carried by a separate point mass. So a tube authored on such a design
    // is massless like its neighbours, which is the consistent answer, not a missing one.
    const rasaero = await importOrk(readFileSync(resolve(process.cwd(), "e2e/fixtures/demo-rasaero.CDX1")));
    const host = tubes(rasaero.rocket)[0].component as BodyTube;
    expect(host.thickness, "the fixture's own tubes must be the wall-less kind").toBeFalsy();
    const id = newPartId(rasaero.rocket, undefined, host.id);
    const built = applyGeometryEdits(rasaero.rocket, {
      added: [{ id, kind: "bodytube", after: host.id, length: 0.2 }],
    });
    const mine = flattenRocket(built).find((p) => p.component.id === id)!.component as BodyTube;
    expect(mine.thickness).toBeUndefined();
    expect(mine.material).toBeUndefined();
    // The design still weighs exactly what its stated launch weight says — the authored tube adds
    // geometry, and the file's own figure is what carries the mass, as it does for every other part.
    expect(dryMassProperties(built).mass).toBeCloseTo(dryMassProperties(rasaero.rocket).mass, 9);

    // And where the design DOES state a wall, both come across.
    const ork = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const walled = tubes(ork.rocket)[0].component as BodyTube;
    expect(walled.thickness).toBeGreaterThan(0);
    const id2 = newPartId(ork.rocket, undefined, walled.id);
    const grown = applyGeometryEdits(ork.rocket, {
      added: [{ id: id2, kind: "bodytube", after: walled.id, length: 0.2 }],
    });
    const theirs = flattenRocket(grown).find((p) => p.component.id === id2)!.component as BodyTube;
    expect(theirs.thickness).toBeCloseTo(walled.thickness!, 9);
    expect(theirs.material?.density).toBe(walled.material?.density);
  });

  it("mounts an authored fin set INSIDE the tube it was added to, cloned from the design's own", async () => {
    // Fins are mounted ON a tube, not stacked behind it, so this kind goes inside the anchor rather
    // than beside it. Cloned from the design's own set rather than derived from invented proportions:
    // "another one of these, here" is the gesture, and it is the only default that is a fact about
    // this rocket instead of a number somebody chose. All 35 corpus designs carry at least one set,
    // and so does the starter, so a source exists on every design a flyer can reach.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const src = flattenRocket(doc.rocket).find((p) => p.component.kind === "trapezoidfinset")!
      .component as TrapezoidFinSet;
    const host = flattenRocket(doc.rocket).find((p) => p.component.kind === "bodytube")!.component;

    const id = newPartId(doc.rocket, undefined, host.id);
    const built = applyGeometryEdits(doc.rocket, {
      added: [{ id, kind: "trapezoidfinset", after: host.id, length: 0 }],
    });

    const mine = flattenRocket(built).find((p) => p.component.id === id)!.component as TrapezoidFinSet;
    expect(mine.kind).toBe("trapezoidfinset");
    expect(mine.finCount).toBe(src.finCount);
    expect(mine.rootChord).toBeCloseTo(src.rootChord, 9);
    expect(mine.tipChord).toBeCloseTo(src.tipChord, 9);
    expect(mine.height).toBeCloseTo(src.height, 9);
    expect(mine.thickness).toBe(src.thickness);
    expect(mine.material?.density).toBe(src.material?.density);
    // Inside the tube, not beside it — a fin set in a stage's top-level list is not on the airframe.
    const parent = flattenRocket(built).find((p) => p.component.children.some((c) => c.id === id))!;
    expect(parent.component.id).toBe(host.id);
    // Aft-aligned, so the picture matches the gesture.
    expect(mine.placement.method).toBe("bottom");
  });

  it("makes a design with two fin rings more stable, and it flies", async () => {
    // The reason to author a fin set at all: it is the structural add that moves stability most, and
    // R3's *done when* asks the panels to describe the rocket the flyer just built.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const host = flattenRocket(doc.rocket).find((p) => p.component.kind === "bodytube")!.component;
    const id = newPartId(doc.rocket, undefined, host.id);
    const built = applyGeometryEdits(doc.rocket, {
      added: [{ id, kind: "trapezoidfinset", after: host.id, length: 0 }],
    });

    const before = runFlight(doc.rocket, {}).result;
    const after = runFlight(built, {}).result;
    // More fin area aft is more normal force aft: a thicker static margin.
    expect(after.staticMarginCal).toBeGreaterThan(before.staticMarginCal);
    // And heavier and draggier, so it does not climb as high.
    expect(dryMassProperties(built).mass).toBeGreaterThan(dryMassProperties(doc.rocket).mass);
    expect(after.summary.apogee).toBeGreaterThan(0);
    expect(after.summary.apogee).toBeLessThan(before.summary.apogee);
  });

  it("builds nothing where there is no set to copy, and nothing where the anchor is not a tube", async () => {
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const fins = flattenRocket(doc.rocket).find((p) => p.component.kind === "trapezoidfinset")!.component;
    const n = flattenRocket(doc.rocket).length;
    // Fins do not mount on fins.
    const onFins = applyGeometryEdits(doc.rocket, {
      added: [{ id: "a", kind: "trapezoidfinset", after: fins.id, length: 0 }],
    });
    expect(flattenRocket(onFins).length).toBe(n);
    // And the clone's source is the design as it stood when the part was authored, not after a later
    // removal: adds are applied BEFORE removals — the order that lets an authored part be removed by
    // id — so a flyer who copies a ring and then deletes the original keeps the copy they made. The
    // alternative, cloning from a design the set had already left, would silently build nothing.
    const host = flattenRocket(doc.rocket).find((p) => p.component.kind === "bodytube")!.component;
    const copied = applyGeometryEdits(doc.rocket, {
      added: [{ id: "b", kind: "trapezoidfinset", after: host.id, length: 0 }],
      removedIds: [fins.id],
    });
    const kept = flattenRocket(copied).find((p) => p.component.id === "b")!.component as TrapezoidFinSet;
    expect(kept.rootChord).toBeCloseTo((fins as TrapezoidFinSet).rootChord, 9);
    expect(flattenRocket(copied).some((p) => p.component.id === fins.id)).toBe(false);
  });

  it("counts as an edit, so every surface knows the design is no longer the file's", async () => {
    // `hasGeometryEdits` gates the stored-tool comparison and the "with your edits" badge. A structural
    // add that did not count would leave a rocket with a part the file never had, presented beside the
    // file's own stored numbers as though it were the same design.
    expect(hasGeometryEdits({ added: [{ id: "a", kind: "bodytube", after: "b", length: 0.2 }] })).toBe(true);
    expect(hasGeometryEdits({ added: [] })).toBe(false);
  });
});

describe("authoring a transition", () => {
  const SINGLE = "fixtures/demo-single-deploy.ork";
  const load = async (f: string) => importOrk(readFileSync(resolve(process.cwd(), f)));
  const trans = (r: Rocket) => flattenRocket(r).filter((p) => p.component.kind === "transition");
  const author = (r: Rocket, after: string, name?: string) => {
    const id = newPartId(r, undefined, after);
    const d = transitionDefaults(r, after)!;
    // The name is decided ONCE at authoring, exactly as the app does it, so a cone with nothing behind
    // it is a "Tail cone" and one between two sections is a "Transition".
    const label = name ?? authoredTransitionName(r, after);
    return { id, edits: { added: [{ id, kind: "transition" as const, after, length: d.length, name: label }] } };
  };

  it("names what it built: a tail cone where nothing follows, a transition where something does", () => {
    const mk = (id: string, r: number): BodyTube => ({
      id, name: id, kind: "bodytube", placement: { method: "after", offset: 0 },
      length: 0.3, outerRadius: r, children: [],
    });
    const one: Rocket = { name: "one", stages: [{ name: "S", components: [mk("a", 0.03)] }], configurations: [], referenceType: "maximum" };
    const two: Rocket = { name: "two", stages: [{ name: "S", components: [mk("a", 0.03), mk("b", 0.02)] }], configurations: [], referenceType: "maximum" };
    expect(authoredTransitionName(one, "a")).toBe("Tail cone");
    expect(authoredTransitionName(two, "a")).toBe("Transition");
    // Across a STAGE boundary the airframe still continues, so the last tube of a booster is not the
    // end of the rocket — the case that shipped a contracting cone into the middle of a stack.
    const staged: Rocket = {
      name: "staged",
      stages: [{ name: "Sustainer", components: [mk("a", 0.03)] }, { name: "Booster", components: [mk("b", 0.05)] }],
      configurations: [],
      referenceType: "maximum",
    };
    expect(authoredTransitionName(staged, "a")).toBe("Transition");
    expect(transitionDefaults(staged, "a")!.aftRadius).toBeCloseTo(0.05, 9);
  });

  it("builds a tail cone where nothing sits behind the anchor, and the flight follows it", async () => {
    // The base-drag lever. A blunt-based rocket loses most of its pressure drag to the base, and
    // contracting it is the classic fix — so this is the one position where a contraction is what the
    // gesture is asking for. The exit is the corpus median of the 14 contracting transitions, 0.7446
    // of the diameter it starts at, over a slenderness of 2.2938; both are facts about real designs
    // rather than numbers anyone chose.
    const doc = await load(SINGLE);
    const tube = primaryBodyTube(doc.rocket)!;
    const { id, edits } = author(doc.rocket, tube.id);
    const built = applyGeometryEdits(doc.rocket, edits);

    const made = trans(built).find((p) => p.component.id === id)!.component as Transition;
    expect(made.shape).toBe("conical");
    expect(made.foreRadius).toBeCloseTo(tube.outerRadius, 9);
    expect(made.aftRadius).toBeCloseTo(tube.outerRadius * 0.7446, 6);
    expect(made.aftRadius).toBeLessThan(made.foreRadius);
    // It weighs something and it makes the rocket longer by its own length.
    expect(dryMassProperties(built).mass).toBeGreaterThan(dryMassProperties(doc.rocket).mass);
    expect(overallLength(built)).toBeCloseTo(overallLength(doc.rocket) + made.length, 9);
  });

  it("fairs exactly to the part behind it, closing a step the design already had", () => {
    // 17 of the 91 body tubes across the starter and the corpus have a neighbour at another caliber.
    // Nothing is chosen there: the exit is read off that neighbour, so the transition closes a step
    // rather than adding one.
    const nose: NoseCone = {
      id: "n", name: "Nose", kind: "nosecone", placement: { method: "top", offset: 0 },
      length: 0.1, aftRadius: 0.03, shape: "ogive", children: [],
    };
    const fore: BodyTube = {
      id: "fore", name: "Fore", kind: "bodytube", placement: { method: "after", offset: 0 },
      length: 0.3, outerRadius: 0.03, thickness: 0.001, children: [],
    };
    const aft: BodyTube = {
      id: "aft", name: "Aft", kind: "bodytube", placement: { method: "after", offset: 0 },
      length: 0.3, outerRadius: 0.02, thickness: 0.001, children: [],
    };
    const rocket: Rocket = {
      name: "stepped", stages: [{ name: "S", components: [nose, fore, aft] }],
      configurations: [], referenceType: "maximum",
    };
    // The design steps 60 mm down to 40 mm at that joint, and says so.
    expect(mouldLineStep(rocket, "fore")).toBeCloseTo(-0.02, 9);

    const { id, edits } = author(rocket, "fore");
    const built = applyGeometryEdits(rocket, edits);
    const made = trans(built).find((p) => p.component.id === id)!.component as Transition;
    expect(made.foreRadius).toBeCloseTo(0.03, 9);
    expect(made.aftRadius).toBeCloseTo(0.02, 9);
    // ...and the joint behind the new part now fairs, which is the whole point.
    expect(mouldLineStep(built, id)).toBeCloseTo(0, 9);
  });

  it("runs straight through between two parts already at the same caliber, opening no step", () => {
    // 46 of those 91 positions. Contracting here would put a step at the joint BEHIND the new part —
    // a stepped airframe nobody drew. A zero-taper transition is not a contrivance to avoid that:
    // 4 of the 25 corpus transitions are exactly this, a section in the mould line. The exit field is
    // aimed at it the moment it exists, so the next keystroke is what shapes it.
    const nose: NoseCone = {
      id: "n", name: "Nose", kind: "nosecone", placement: { method: "top", offset: 0 },
      length: 0.1, aftRadius: 0.03, shape: "ogive", children: [],
    };
    const mk = (id: string): BodyTube => ({
      id, name: id, kind: "bodytube", placement: { method: "after", offset: 0 },
      length: 0.3, outerRadius: 0.03, thickness: 0.001, children: [],
    });
    const rocket: Rocket = {
      name: "even", stages: [{ name: "S", components: [nose, mk("fore"), mk("aft")] }],
      configurations: [], referenceType: "maximum",
    };
    const { id, edits } = author(rocket, "fore");
    const built = applyGeometryEdits(rocket, edits);
    const made = trans(built).find((p) => p.component.id === id)!.component as Transition;
    expect(made.foreRadius).toBeCloseTo(made.aftRadius, 12);
    expect(made.length).toBeGreaterThan(0);
    expect(mouldLineStep(built, id)).toBeCloseTo(0, 12);
    expect(mouldLineStep(built, "fore")).toBeCloseTo(0, 12);
  });

  it("is a part like any other: aimable, editable, removable", async () => {
    const doc = await load(SINGLE);
    const tube = primaryBodyTube(doc.rocket)!;
    const { id, edits } = author(doc.rocket, tube.id);
    const built = applyGeometryEdits(doc.rocket, edits);

    // Picking it aims the transition fields at it, and nothing else.
    expect(aimEditsAt(built, id)).toEqual({ transitionId: id });
    expect(primaryTransition(built, id)!.id).toBe(id);
    // The panel names the part it is holding, by the design's own name where that distinguishes it.
    expect(primaryTransitionPart(built, id)?.name).toBe("Tail cone");
    expect(primaryTransitionPart(built, id)?.station).toBeCloseTo(
      flattenRocket(built).find((p) => p.component.id === id)!.xFore,
      9,
    );

    // Both fields change exactly that part.
    const shaped = applyGeometryEdits(doc.rocket, {
      ...edits, transitionId: id, transitionLength: 0.08, transitionAftDiameter: 0.02,
    });
    const made = trans(shaped).find((p) => p.component.id === id)!.component as Transition;
    expect(made.length).toBeCloseTo(0.08, 9);
    expect(made.aftRadius).toBeCloseTo(0.01, 9);
    // The fore end is the joint with the part in front and is left alone.
    expect(made.foreRadius).toBeCloseTo(tube.outerRadius, 9);
    // Everything aft restacks off the new length rather than overlapping it.
    expect(overallLength(shaped)).toBeCloseTo(overallLength(doc.rocket) + 0.08, 9);

    // And it comes back out.
    expect(removalRefusal(built, id)).toBeNull();
    const gone = applyGeometryEdits(doc.rocket, { ...edits, removedIds: [id] });
    expect(trans(gone).find((p) => p.component.id === id)).toBeUndefined();
  });

  it("flies the exit diameter that was typed, even under a whole-airframe caliber change", async () => {
    // `bodyDiameter` scales the entire outer airframe to keep the mould line faired, transitions
    // included. An exit typed as an absolute number has to survive that or the field is sitting there
    // showing a diameter nothing is flying — which is the one thing a number box may never do.
    const doc = await load(SINGLE);
    const tube = primaryBodyTube(doc.rocket)!;
    const { id, edits } = author(doc.rocket, tube.id);
    const both = applyGeometryEdits(doc.rocket, {
      ...edits, transitionId: id, transitionAftDiameter: 0.022, bodyDiameter: tube.outerRadius * 2 * 1.4,
    });
    const made = trans(both).find((p) => p.component.id === id)!.component as Transition;
    expect(made.aftRadius).toBeCloseTo(0.011, 9);
    // The fore end DID follow the airframe, so the cone still fairs to the tube in front of it.
    expect(made.foreRadius).toBeCloseTo(tube.outerRadius * 1.4, 9);
  });

  it("says where the mould line steps, and stays quiet where it does not", async () => {
    // Loft models a transition's own slope (Niskanen 3.86 for a shoulder, 3.88 for a boattail) and has
    // no drag term at all for a bare radius step, which has no length to take an angle over. Measured
    // across the 35-design corpus, 33 of the 115 joints it can judge already step, in 13 designs, by a
    // median 11.75 mm of diameter — so this is a sentence the imported designs needed too.
    const doc = await load(SINGLE);
    const tube = primaryBodyTube(doc.rocket)!;
    const { id, edits } = author(doc.rocket, tube.id);
    const built = applyGeometryEdits(doc.rocket, edits);
    // Assert the part is THERE before asking about its joint: `mouldLineStep` returns undefined for a
    // component it cannot find, so this assertion passes for the wrong reason on a build that never
    // made the cone at all.
    expect(flattenRocket(built).find((p) => p.component.id === id)).toBeTruthy();
    // A tail cone has nothing behind it, so there is no joint to judge.
    expect(mouldLineStep(built, id)).toBeUndefined();
    // The tube in front of it fairs to it exactly.
    expect(mouldLineStep(built, tube.id)).toBeCloseTo(0, 9);
    // And a joint that DOES step is reported, with its size and its sign.
    const stepped: Rocket = {
      name: "stepped",
      stages: [
        {
          name: "S",
          components: [
            { id: "n", name: "Nose", kind: "nosecone", placement: { method: "top", offset: 0 }, length: 0.1, aftRadius: 0.03, shape: "ogive", children: [] } as NoseCone,
            { id: "wide", name: "Wide", kind: "bodytube", placement: { method: "after", offset: 0 }, length: 0.3, outerRadius: 0.03, children: [] } as BodyTube,
            { id: "narrow", name: "Narrow", kind: "bodytube", placement: { method: "after", offset: 0 }, length: 0.3, outerRadius: 0.02, children: [] } as BodyTube,
          ],
        },
      ],
      configurations: [],
      referenceType: "maximum",
    };
    expect(mouldLineStep(stepped, "wide")).toBeCloseTo(-0.02, 9); // steps IN by 20 mm of diameter
    expect(mouldLineStep(stepped, "narrow")).toBeUndefined(); // nothing behind it
    expect(mouldLineStep(stepped, "n")).toBeCloseTo(0, 9); // the nose fairs to the tube
  });
});

/** The ids a component holds directly, so a test can say a part is a CHILD and not a sibling. */
function tubeChildren(r: Rocket, id: string): string[] {
  return flattenRocket(r).find((p) => p.component.id === id)?.component.children.map((c) => c.id) ?? [];
}

describe("what an aim moving off a part invalidates", () => {
  it("keeps a whole-airframe caliber, and drops the dimensions that described the part it left", async () => {
    // Re-aiming clears the absolute values the old aim was pointing, because they described a part the
    // fields are no longer holding. `bodyDiameter` is the exception in the registry and the reason the
    // registry needed a way to say so: it reads the picked tube's caliber but scales the WHOLE outer
    // airframe to hit it, deliberately, so it goes on meaning the same thing after the aim moves.
    // Clearing it made authoring a tube snap the airframe back to its imported caliber — measured on
    // `OR vs RAS Test 1.ork`, 142.2 mm reverting to 101.6 mm and apogee 5,938 m to 7,276 m.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const tube = primaryBodyTube(doc.rocket)!;
    const held = { bodyTubeId: tube.id, bodyLength: 0.4, bodyDiameter: 0.08, finSpan: 0.06 };
    const moved = aimsClearedByAiming(held, { bodyTubeId: "somewhere-else" });

    expect(moved).toHaveProperty("bodyLength", undefined); // described the tube the aim left
    expect(moved).not.toHaveProperty("bodyDiameter"); // describes the whole airframe, so it stays
    expect(moved).not.toHaveProperty("finSpan"); // a different slot entirely

    // And it really does survive the round trip through the model.
    const after = applyGeometryEdits(doc.rocket, { ...held, ...moved, bodyTubeId: tube.id });
    expect(primaryBodyDiameter(after, tube.id)).toBeCloseTo(0.08, 9);
  });

  it("moves nothing when the aim has not actually changed", async () => {
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const tube = primaryBodyTube(doc.rocket)!;
    const held = { bodyTubeId: tube.id, bodyLength: 0.4 };
    expect(aimsClearedByAiming(held, { bodyTubeId: tube.id })).toEqual({});
    expect(aimsClearedByAiming(held, {})).toEqual({});
  });
});

describe("authoring a mass object", () => {
  const SINGLE = "fixtures/demo-single-deploy.ork";
  const load = async (f: string) => importOrk(readFileSync(resolve(process.cwd(), f)));
  const masses = (r: Rocket) => flattenRocket(r).filter((p) => p.component.kind === "masscomponent");
  const author = (r: Rocket, after: string) => {
    const id = newPartId(r, undefined, after);
    return { id, edits: { added: [{ id, kind: "masscomponent" as const, after, length: 0, name: "Mass object" }] } };
  };

  it("mounts inside the part it names, a third of the way down it", async () => {
    // A point mass is the one kind whose placement IS a station, so unlike a tube it cannot land at
    // {after, 0}. The corpus supplies the answer: of the 56 mass objects in it, 31 are placed `top`
    // inside their parent, and the median offset among the 16 inside a body tube is 0.3251 of that
    // tube's length — a third of the way down, which is where an av-bay actually sits. `top` rather
    // than `absolute` (12 of 56) because an absolute station pins the mass in space while the airframe
    // moves underneath it.
    const doc = await load(SINGLE);
    const tube = primaryBodyTube(doc.rocket)!;
    const host = flattenRocket(doc.rocket).find((p) => p.component.id === tube.id)!;
    const { id, edits } = author(doc.rocket, tube.id);
    const built = applyGeometryEdits(doc.rocket, edits);

    const made = masses(built).find((p) => p.component.id === id)!;
    expect(made.component.placement.method).toBe("top");
    expect(made.xFore).toBeCloseTo(host.xFore + host.length * 0.3251, 9);
    // Inside its host, not hanging off the airframe.
    expect(made.xFore).toBeGreaterThanOrEqual(host.xFore);
    expect(made.xFore).toBeLessThanOrEqual(host.xFore + host.length);
    // And it is a child of that tube rather than a sibling, which is what 56 of 56 corpus masses are.
    expect(tubeChildren(built, tube.id)).toContain(id);
  });

  it("weighs the corpus median until the flyer says otherwise, and the flight follows", async () => {
    const doc = await load(SINGLE);
    const tube = primaryBodyTube(doc.rocket)!;
    const { id, edits } = author(doc.rocket, tube.id);
    const built = applyGeometryEdits(doc.rocket, edits);

    const bare = dryMassProperties(doc.rocket);
    const withIt = dryMassProperties(built);
    expect(withIt.mass - bare.mass).toBeCloseTo(0.045, 9);
    // It pulls the balance toward where it sits.
    expect(withIt.cg).not.toBeCloseTo(bare.cg, 6);

    // Stating a weight replaces it, and nothing else moves.
    const stated = applyGeometryEdits(doc.rocket, { ...edits, massObjectId: id, massObjectMass: 0.4 });
    expect(dryMassProperties(stated).mass - bare.mass).toBeCloseTo(0.4, 9);
    expect(overallLength(stated)).toBeCloseTo(overallLength(doc.rocket), 9);
  });

  it("takes a station from the nose tip, clamped to stay inside the part holding it", async () => {
    // The field speaks the number a flyer reads off the diagram — a station from the nose — and the
    // model stores an offset inside the host. A mass placed outside the airframe would still be FLOWN,
    // because the solver puts mass wherever the tree says, so the clamp is the difference between a CG
    // that can be trusted and one computed from a rocket nobody could build.
    const doc = await load(SINGLE);
    const tube = primaryBodyTube(doc.rocket)!;
    const host = flattenRocket(doc.rocket).find((p) => p.component.id === tube.id)!;
    const { id, edits } = author(doc.rocket, tube.id);
    const at = (station: number) => {
      const out = applyGeometryEdits(doc.rocket, { ...edits, massObjectId: id, massObjectStation: station });
      return flattenRocket(out).find((p) => p.component.id === id)!.xFore;
    };
    // Asked for a station inside the host, it goes exactly there.
    const inside = host.xFore + host.length * 0.6;
    expect(at(inside)).toBeCloseTo(inside, 9);
    // Ahead of the host, it stops at its fore end; behind it, at its aft end.
    expect(at(0)).toBeCloseTo(host.xFore, 9);
    expect(at(overallLength(doc.rocket) * 4)).toBeCloseTo(host.xFore + host.length, 9);
    // The readback is the same station the edit produced, so the field cannot show one and fly another.
    const out = applyGeometryEdits(doc.rocket, { ...edits, massObjectId: id, massObjectStation: inside });
    expect(primaryMassObjectStation(out, id)).toBeCloseTo(inside, 9);
  });

  it("is aimable, and never falls back to a point mass that IS a design's stated weight", async () => {
    // A RASAero `.CDX1` states one launch weight and no per-part masses, so its adapter mints a single
    // point mass to hold the whole airframe. Offering to retype that as if it were ballast would
    // present a design's own measurement as a what-if — and on 3 of the 4 RASAero designs it is also
    // the heaviest thing in the model, so an unguarded "heaviest" fallback lands on it every time.
    const doc = await load(SINGLE);
    const tube = primaryBodyTube(doc.rocket)!;
    const { id, edits } = author(doc.rocket, tube.id);
    const built = applyGeometryEdits(doc.rocket, edits);
    expect(aimEditsAt(built, id)).toEqual({ massObjectId: id });
    expect(primaryMassObject(built, id)!.id).toBe(id);
    expect(removalRefusal(built, id)).toBeNull();

    const airframe: MassComponent = {
      id: "stated", name: "Airframe (stated launch weight)", kind: "masscomponent",
      placement: { method: "top", offset: 0 }, mass: 5, standsForAirframe: true, children: [],
    };
    const holder: BodyTube = {
      id: "b", name: "Body", kind: "bodytube", placement: { method: "after", offset: 0 },
      length: 0.5, outerRadius: 0.03, children: [airframe],
    };
    const rasaero: Rocket = {
      name: "stated", stages: [{ name: "S", components: [holder] }],
      configurations: [], referenceType: "maximum",
    };
    // Nothing to aim at: the only point mass in the design is the design's own weight.
    expect(primaryMassObject(rasaero)).toBeUndefined();
    // Picking it still refuses removal, which is R2's rule and unchanged.
    expect(removalRefusal(rasaero, "stated")).not.toBeNull();
  });
});

describe("a part that is not a part", () => {
  it("refuses to remove the point mass that stands for a whole airframe", async () => {
    // A RASAero `.CDX1` carries no materials and no per-part masses — the flyer types one launch
    // weight and CG per simulation — so the adapter puts the whole stated weight into a single mass
    // component, which is the only place the one internal model has to hold it. Removing it is not an
    // unwise edit a flyer is entitled to make; it leaves a rocket with no mass at all. Measured on the
    // real corpus before the refusal: `Show-off.CDX1` went 453.6 g dry → 0.0 g with its CG at the nose
    // tip, `OR vs RAS Test 1.CDX1` 4368.8 g → 0.0 g, and `Complex.Two-Stage.CDX1` flipped +1.78 cal →
    // −0.92 cal and was still flown, reporting a confident 1,423 m. 3 of the 4 RASAero designs in the
    // corpus are that shape. Pinned on the committed fixture, not on `corpus/`, which is absent on
    // every fork and public clone.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "e2e/fixtures/demo-rasaero.CDX1")));
    const airframe = flattenRocket(doc.rocket).find((p) => p.component.name.includes("stated launch weight"))!;
    expect(airframe, "the fixture must carry the synthesised airframe mass").toBeTruthy();
    expect((airframe.component as { standsForAirframe?: boolean }).standsForAirframe).toBe(true);

    const why = removalRefusal(doc.rocket, airframe.component.id);
    expect(why).toMatch(/whole stated weight/);
    expect(why).toMatch(/no mass at all/);

    // And the design still weighs what it weighed — the guard is the refusal, so this is the number
    // the refusal exists to protect.
    expect(dryMassProperties(doc.rocket).mass).toBeGreaterThan(0);
  });

  it("still allows removing an ordinary mass object", async () => {
    // The control: the refusal is about the synthesised airframe alone. A real payload or ballast is
    // a part, and 26 of the 35 corpus designs carry at least one.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-quirks.ork")));
    const masses = flattenRocket(doc.rocket).filter((p) => p.component.kind === "masscomponent");
    expect(masses.length, "the fixture must carry a mass object").toBeGreaterThan(0);
    for (const m of masses) expect(removalRefusal(doc.rocket, m.component.id)).toBe(null);
  });
});

describe("what states a part's mass", () => {
  it("names the stage whose stated weight covers a part inside it", async () => {
    // The disclosure R2's delete surface needed. Where a stage states its own weight, a part inside it
    // weighs nothing of its own — so a removal moves the balance and NOT the total, and before this
    // nothing said so. Measured on the real corpus: removing `EscapeVelocity.ork`'s 141.7 g "Avionics"
    // leaves dry mass at exactly 2000.0 g while the static margin moves 4.461 → 4.312 cal.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "e2e/fixtures/stage-weighed.ork")));
    const inside = flattenRocket(doc.rocket).find((p) => p.component.kind === "bodytube")!;
    const holder = statedMassHolder(doc.rocket, inside.component.id);
    expect(holder, "the fixture's stage must state its own weight").toBeTruthy();

    // And the claim the sentence makes is true of the model: the mass does not move, the balance does.
    const before = dryMassProperties(doc.rocket);
    const fins = flattenRocket(doc.rocket).find((p) => p.component.kind.endsWith("finset"))!;
    const after = dryMassProperties(applyGeometryEdits(doc.rocket, { removedIds: [fins.component.id] }));
    expect(after.mass).toBeCloseTo(before.mass, 9);
    expect(after.cg).not.toBeCloseTo(before.cg, 6);
  });

  it("says nothing about a design that states no assembly weight", async () => {
    // The control, and the reason this asks the model rather than watching for a total that did not
    // move: a genuinely weightless part coming out must not raise a notice about an override that is
    // not there.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    for (const p of flattenRocket(doc.rocket)) expect(statedMassHolder(doc.rocket, p.component.id)).toBe(null);
  });

  it("does not name a component's own override — that figure goes with it", () => {
    // Only an ANCESTOR's stated weight covers a part. A component that states its own subtree mass
    // still takes that figure away when it is removed, so naming it as the holder would be the
    // opposite of the truth. Built here rather than read from a fixture because no committed design
    // carries a component-level whole-assembly override, and the distinction is worth pinning.
    const inner = {
      id: "inner",
      name: "Avionics",
      kind: "masscomponent" as const,
      placement: { method: "absolute" as const, offset: 0.2 },
      mass: 0.1,
      children: [],
    };
    const bay = {
      id: "bay",
      name: "Payload Bay",
      kind: "bodytube" as const,
      placement: { method: "after" as const, offset: 0 },
      length: 0.3,
      outerRadius: 0.03,
      overrideMass: 0.5,
      overrideSubcomponents: true,
      children: [inner],
    };
    const rocket = { name: "t", stages: [{ name: "Sustainer", components: [bay] }] } as unknown as Rocket;
    expect(statedMassHolder(rocket, "inner")).toBe("Payload Bay");
    expect(statedMassHolder(rocket, "bay")).toBe(null);
    expect(statedMassHolder(rocket, "nothing-here")).toBe(null);
  });
});

describe("removing a component", () => {
  const parts = (r: Rocket) => flattenRocket(r).map((p) => p.component);
  const ids = (r: Rocket) => parts(r).map((c) => c.id);
  const byName = (r: Rocket, name: string) => parts(r).find((c) => c.name === name)!;

  it("takes the part and everything mounted inside it", async () => {
    // `demo-quirks.ork`'s forward tube holds a coupler, a mass object and a streamer. Deleting the tube
    // has to take them: a part cannot stay mounted inside something that is gone.
    const rocket = await load("demo-quirks.ork");
    const upper = byName(rocket, "Upper");
    const inside = upper.children.map((c) => c.id);
    expect(inside.length).toBeGreaterThan(1);

    const after = applyGeometryEdits(rocket, { removedIds: [upper.id] });
    expect(ids(after)).not.toContain(upper.id);
    for (const id of inside) expect(ids(after), `${id} was mounted inside the removed tube`).not.toContain(id);
    // Everything else survives.
    expect(ids(after)).toContain(byName(rocket, "Motor mount body").id);
    // Non-destructive.
    expect(ids(rocket)).toContain(upper.id);
  });

  it("changes the flight — mass, stability and apogee all move", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const fins = parts(rocket).find((c) => c.kind === "trapezoidfinset")!;
    const gone = applyGeometryEdits(rocket, { removedIds: [fins.id] });
    const before = runFlight(rocket, {}).result;
    const after = runFlight(gone, {}).result;
    // Losing the fins sheds their structural mass...
    expect(dryMassProperties(gone).mass).toBeLessThan(dryMassProperties(rocket).mass);
    expect(after.liftoffMass).toBeLessThan(before.liftoffMass);
    // ...and their normal force, so the rocket is far less stable and flies higher on less drag and mass.
    expect(after.staticMarginCal).toBeLessThan(before.staticMarginCal);
    expect(after.summary.apogee).toBeGreaterThan(before.summary.apogee);
  });

  it("drops a motor left without its mount rather than flying it at the nose tip", async () => {
    // The silent-wrong-flight case. `lib/sim/setup.ts` resolves an unknown mount to undefined and places
    // the motor's mass at station 0, so a dangling instance is worse than no motor at all.
    const rocket = await load("demo-single-deploy.ork");
    const mount = parts(rocket).find((c) => "motorMount" in c && c.motorMount)!;
    const referenced = rocket.configurations.flatMap((c) => c.instances).filter((i) => i.mountId === mount.id);
    expect(referenced.length).toBeGreaterThan(0);

    const after = applyGeometryEdits(rocket, { removedIds: [mount.id] });
    expect(after.configurations.flatMap((c) => c.instances).map((i) => i.mountId)).not.toContain(mount.id);
    // The configuration itself stays, so the picker still lists it and the run says what is missing.
    expect(after.configurations.length).toBe(rocket.configurations.length);
    // And the flight reports no propulsion rather than a motor at the nose.
    expect(runFlight(after, {}).hasPropulsion).toBe(false);
  });

  it("re-resolves every role against what is left", async () => {
    // Delete the longest tube and the body fields must describe the longest of the REST, not a part that
    // is gone — the roles resolve after the prune, which is the whole reason removals are applied first.
    const rocket = await load("demo-quirks.ork");
    const upper = byName(rocket, "Upper");
    expect(primaryBodyTube(rocket)!.id).toBe(upper.id);
    const after = applyGeometryEdits(rocket, { removedIds: [upper.id] });
    expect(primaryBodyTube(after)!.name).toBe("Motor mount body");
    // An aim naming the removed part falls back rather than resolving to nothing.
    expect(primaryBodyTube(after, upper.id)!.name).toBe("Motor mount body");
  });

  it("is undone exactly by dropping the last id — the design comes back identical", async () => {
    // Undo, and why the removals are an ordered LIST. The model is always rebuilt from the pristine design
    // plus the bag, so popping an entry restores the design before that deletion with nothing to diff.
    const rocket = await load("demo-quirks.ork");
    const a = byName(rocket, "Motor mount body").id;
    const b = parts(rocket).find((c) => c.kind === "tubecoupler")!.id;

    const one = applyGeometryEdits(rocket, { removedIds: [b] });
    const two = applyGeometryEdits(rocket, { removedIds: [b, a] });
    expect(ids(two).length).toBeLessThan(ids(one).length);

    // Undo the second deletion: back to exactly the one-deletion model.
    const undone = applyGeometryEdits(rocket, { removedIds: [b] });
    expect(ids(undone)).toEqual(ids(one));
    expect(JSON.stringify(undone)).toBe(JSON.stringify(one));
    // Undo the first too: back to the pristine design, part for part.
    expect(ids(applyGeometryEdits(rocket, { removedIds: [] }))).toEqual(ids(rocket));
  });

  it("refuses the last body tube, with a sentence saying why", async () => {
    const rocket = await load("demo-quirks.ork");
    const upper = byName(rocket, "Upper").id;
    const mount = byName(rocket, "Motor mount body").id;
    // Two tubes: either may go.
    expect(removalRefusal(rocket, upper)).toBeNull();
    expect(removalRefusal(rocket, mount)).toBeNull();

    // One gone, and the other is refused — judged against the design AS SHOWN, not the pristine one.
    const oneLeft = applyGeometryEdits(rocket, { removedIds: [upper] });
    const why = removalRefusal(oneLeft, mount);
    expect(why).toBeTruthy();
    expect(why).toMatch(/only body tube/);
    expect(why).toMatch(/[.!]$/); // a sentence, not a code
  });

  it("allows the parts a refusal would be a verdict about", async () => {
    // The nose (a flat-faced tube is buildable) and the only motor mount (no propulsion is a fact Loft
    // already reports). Refusing either would be Loft issuing a go/no-go, which it does not do.
    const rocket = await load("demo-single-deploy.ork");
    const nose = parts(rocket).find((c) => c.kind === "nosecone")!;
    const mount = parts(rocket).find((c) => "motorMount" in c && c.motorMount)!;
    expect(removalRefusal(rocket, nose.id)).toBeNull();
    expect(removalRefusal(rocket, mount.id)).toBeNull();
    expect(removalRefusal(rocket, "no-such-component")).toMatch(/no longer in this design/);
  });

  it("counts as an edit, so nothing presents the design as unmodified", async () => {
    const rocket = await load("demo-quirks.ork");
    const coupler = parts(rocket).find((c) => c.kind === "tubecoupler")!;
    expect(hasGeometryEdits({ removedIds: [coupler.id] })).toBe(true);
    expect(hasGeometryEdits({ removedIds: [] })).toBe(false);
    expect(INERT_EDIT_FIELDS.has("removedIds"), "a removal is a change, not a selection").toBe(false);
  });
});

describe("a removal cannot re-land an edit on a different part", () => {
  it("drops the aim AND the values it was pointing, so the surviving part is untouched", async () => {
    // The destructive case, and it is silent. The role fallback is deliberate — a stale id from a restored
    // session must not disable the fields — so an aim naming a removed part falls back to the primary one,
    // and an ABSOLUTE value then lands there. Measured before the fix on this fixture: aim the fin fields
    // at the second set, type a 77 mm span, remove that set, and the surviving 50.0 mm set became 77.0 mm
    // with the field still reading 77. Clearing the aim alone does NOT fix it: unaimed, the span still
    // resolves to the primary set. The values have to go with the aim.
    const bytes = new Uint8Array(
      readFileSync(resolve(process.cwd(), "e2e/fixtures", "two-stage-firm-booster.ork")),
    );
    const rocket = (await importOrk(bytes)).rocket;
    const fins = flattenRocket(rocket).filter((p) => p.component.kind === "trapezoidfinset");
    expect(fins.length).toBe(2);
    const [a, b] = fins.map((p) => p.component as TrapezoidFinSet);
    const survivorSpan = a.height;

    // The aim works: only the second set moves.
    const aimed = applyGeometryEdits(rocket, { finSetId: b.id, finSpan: 0.077 });
    const aimedSpans = flattenRocket(aimed)
      .filter((p) => p.component.kind === "trapezoidfinset")
      .map((p) => (p.component as TrapezoidFinSet).height);
    expect(aimedSpans).toContain(0.077);
    expect(aimedSpans.filter((h) => Math.abs(h - survivorSpan) < 1e-9).length).toBe(1);

    // Remove the aimed set while that span is live. The survivor must not inherit it.
    const gone = applyGeometryEdits(rocket, { finSetId: b.id, finSpan: 0.077, removedIds: [b.id] });
    const left = flattenRocket(gone).filter((p) => p.component.kind === "trapezoidfinset");
    expect(left.length).toBe(1);
    expect((left[0].component as TrapezoidFinSet).height).toBeCloseTo(survivorSpan, 9);
    // And the readback agrees, so no surface shows a number that is not being flown.
    expect(primaryFinSpan(gone, b.id)).toBeCloseTo(survivorSpan, 9);
  });

  it("clears every field the aim targeted, for every slot in the registry", async () => {
    const rocket = await load("demo-dual-deploy.ork");
    const chute = flattenRocket(rocket).find((p) => p.component.kind === "parachute")!.component;
    const patch = aimsClearedByRemoving(rocket, { parachuteId: chute.id, mainParachuteDiameter: 1.4 }, chute.id);
    expect(patch.parachuteId).toBeUndefined();
    for (const f of AIM_SLOTS.parachuteId.targets) {
      expect(Object.prototype.hasOwnProperty.call(patch, f), `${f} must be cleared too`).toBe(true);
    }
    // An aim pointing elsewhere is left alone: removing one part must not disarm another role's edit.
    const other = aimsClearedByRemoving(rocket, { finSetId: "some-fin", finSpan: 0.05 }, chute.id);
    expect(Object.keys(other)).toEqual([]);
  });

  it("clears an aim naming a part that goes as a CHILD of the removed one", async () => {
    // Removing a body tube takes its fin set, and the fin aim names the fin set rather than the tube.
    const rocket = await load("demo-single-deploy.ork");
    const tube = flattenRocket(rocket).find((p) => p.component.kind === "bodytube")!.component;
    const fin = flattenRocket(rocket).find((p) => p.component.kind === "trapezoidfinset")!.component;
    expect(tube.children.some((c) => c.id === fin.id), "the fixture must mount the fins in the tube").toBe(true);
    const patch = aimsClearedByRemoving(rocket, { finSetId: fin.id, finSpan: 0.077 }, tube.id);
    expect(patch.finSetId).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(patch, "finSpan")).toBe(true);
  });
});

describe("the last body tube is counted per STAGE", () => {
  it("refuses a stage's only tube even when the design has others", async () => {
    // A staged rocket is several airframes flown in sequence, so "the design still has a tube" is no
    // comfort to a sustainer that no longer does. `two-stage-firm-booster.ork` carries one tube per stage,
    // and a whole-design count found two and allowed the removal that left a stage with none.
    const bytes = new Uint8Array(
      readFileSync(resolve(process.cwd(), "e2e/fixtures", "two-stage-firm-booster.ork")),
    );
    const rocket = (await importOrk(bytes)).rocket;
    expect(rocket.stages.length).toBe(2);
    const tubes = flattenRocket(rocket).filter((p) => p.component.kind === "bodytube");
    expect(tubes.length).toBe(2);

    for (const t of tubes) {
      const why = removalRefusal(rocket, t.component.id);
      expect(why, "every stage's only tube is refused").toBeTruthy();
      expect(why).toMatch(/only body tube/);
      // It names WHICH stage, since "the only one" is false of the design as a whole.
      expect(why).toMatch(/Sustainer|Booster/);
    }
  });

  it("says nothing about a stage on a single-stage design", async () => {
    const rocket = await load("demo-quirks.ork");
    expect(rocket.stages.length).toBe(1);
    const upper = flattenRocket(rocket).find((p) => p.component.name === "Upper")!.component.id;
    expect(removalRefusal(rocket, upper)).toBeNull(); // two tubes in the one stage
    const oneLeft = applyGeometryEdits(rocket, { removedIds: [upper] });
    const mount = flattenRocket(oneLeft).find((p) => p.component.kind === "bodytube")!.component.id;
    const why = removalRefusal(oneLeft, mount)!;
    expect(why).toMatch(/only body tube left, and an airframe needs one/);
    expect(why).not.toMatch(/ in /); // no stage clause where there is only one stage
  });
});

describe("reordering a top-level part", () => {
  // R4. A top-level part's station is DERIVED — `flattenRocket` walks each stage's list with a running
  // cursor — so reordering the list IS the reorder and there is no station arithmetic to do. Measured
  // over the whole corpus before this shipped: all 150 top-level components across all 35 designs use
  // placement `after` with offset 0, so no imported design can defeat a reorder expressed this way.
  const threePart = (): Rocket => {
    const doc = newDesign();
    const stage = doc.rocket.stages[0];
    // nose, body — plus a second tube behind the first, so there are three to permute.
    const body = stage.components[1];
    stage.components = [
      ...stage.components,
      { ...structuredClone(body), id: "tube2", name: "Aft tube", children: [] },
    ];
    return doc.rocket;
  };
  const order = (r: Rocket) => r.stages.flatMap((s) => s.components.map((c) => c.id));

  it("moves a part behind another, and the stations of everything aft follow", () => {
    const r = threePart();
    const before = order(r);
    expect(before).toHaveLength(3);
    const moved = applyGeometryEdits(r, { moved: [{ id: "tube2", after: before[0] }] });
    expect(order(moved)).toEqual([before[0], "tube2", before[1]]);

    // The point of the milestone: the arithmetic follows for free. The part that was last is now
    // second, and the one that was second starts where the moved part ends.
    const flat = flattenRocket(moved);
    const at = (id: string) => flat.find((p) => p.component.id === id)!;
    expect(at("tube2").xFore).toBeCloseTo(at(before[0]).xFore + at(before[0]).length, 9);
    expect(at(before[1]).xFore).toBeCloseTo(at("tube2").xFore + at("tube2").length, 9);
    // ...and nothing overlaps, which is the other half of the done-when.
    const tops = order(moved).map((id) => at(id));
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i].xFore).toBeGreaterThanOrEqual(tops[i - 1].xFore + tops[i - 1].length - 1e-9);
    }
  });

  it("moves a part to the nose end of its stage with a null anchor", () => {
    const r = threePart();
    const before = order(r);
    const moved = applyGeometryEdits(r, { moved: [{ id: "tube2", after: null }] });
    expect(order(moved)).toEqual(["tube2", before[0], before[1]]);
    expect(flattenRocket(moved).find((p) => p.component.id === "tube2")!.xFore).toBeCloseTo(0, 9);
  });

  it("lands in the same place whichever direction the part came from", () => {
    // The off-by-one this shape exists to avoid: the destination index is computed AFTER the removal,
    // so "behind X" means one thing, not two. Moving forward then back returns the original order.
    const r = threePart();
    const before = order(r);
    const fwd = applyGeometryEdits(r, { moved: [{ id: before[1], after: "tube2" }] });
    expect(order(fwd)).toEqual([before[0], "tube2", before[1]]);
    const back = applyGeometryEdits(r, {
      moved: [{ id: before[1], after: "tube2" }, { id: before[1], after: before[0] }],
    });
    expect(order(back)).toEqual(before);
  });

  it("composes a run of moves in the order they were made, so dropping the last steps one back", () => {
    const r = threePart();
    const before = order(r);
    const two = [{ id: "tube2", after: null }, { id: before[1], after: null }];
    expect(order(applyGeometryEdits(r, { moved: two }))).toEqual([before[1], "tube2", before[0]]);
    // Undo is dropping the last entry — the same property `removedIds` and `added` have.
    expect(order(applyGeometryEdits(r, { moved: two.slice(0, 1) }))).toEqual(["tube2", before[0], before[1]]);
  });

  it("does nothing rather than throwing when the part or the anchor is gone", () => {
    // Every one of these is a state a bag restored from `localStorage` can legitimately be in, so a
    // loud refusal would turn a stale session into a broken one.
    const r = threePart();
    const before = order(r);
    expect(order(applyGeometryEdits(r, { moved: [{ id: "nope", after: before[0] }] }))).toEqual(before);
    expect(order(applyGeometryEdits(r, { moved: [{ id: "tube2", after: "nope" }] }))).toEqual(before);
    expect(order(applyGeometryEdits(r, { moved: [{ id: "tube2", after: "tube2" }] }))).toEqual(before);
    // ...including when a removal in the same bag took the anchor out from under it.
    const withRemoval = applyGeometryEdits(r, {
      removedIds: [before[0]],
      moved: [{ id: "tube2", after: before[0] }],
    });
    expect(order(withRemoval)).toEqual([before[1], "tube2"]);
  });

  it("counts as a real edit, so the stored-tool comparison is withheld", () => {
    // `moved` must NOT be in `INERT_EDIT_FIELDS`: a reorder is a different rocket, so a panel comparing
    // against the file's own stored results would be comparing two different airframes.
    expect(isEditedValue("moved", [{ id: "a", after: null }])).toBe(true);
    expect(isEditedValue("moved", [])).toBe(false);
    expect(INERT_EDIT_FIELDS.has("moved")).toBe(false);
  });
});

describe("authoring a booster stage", () => {
  /** The starter plus one authored booster, and the ids the app would mint for it. */
  const withBooster = (name = "Booster") => {
    const doc = newDesign();
    const seedId = newPartId(doc.rocket, [], "stage:1");
    const mountId = newPartId(doc.rocket, [{ id: seedId } as never], "mount:1");
    const edits = { addedStages: [{ seedId, mountId, name }] };
    return { doc, edits, seedId, mountId, staged: applyGeometryEdits(doc.rocket, edits) };
  };

  it("appends a stage seeded from the design's own aft airframe", () => {
    const { doc, staged } = withBooster();
    expect(doc.rocket.stages).toHaveLength(1);
    expect(staged.stages).toHaveLength(2);
    expect(staged.stages[1].name).toBe("Booster");
    // Appended, not prepended: stages stack nose-to-tail, so a booster goes BELOW everything already
    // in the stack, and `slice(0, stageCount)` is what sheds it.
    expect(staged.stages[0]).toEqual(doc.rocket.stages[0]);
    const seed = staged.stages[1].components[0];
    expect(seed.kind).toBe("bodytube");
  });

  it("carries the mount and the fins across and leaves the avionics and the recovery behind", () => {
    // The measurement this rule comes from: a whole-subtree clone of the starter's aft tube drags
    // 150 g of altimeter and parachute into the booster, and `lib/sim/setup.ts` collects recovery
    // devices from stage 0 only — so a cloned canopy is dead weight the solver never deploys.
    const { doc, staged } = withBooster();
    const src = doc.rocket.stages[0].components.find((c) => c.kind === "bodytube")!;
    expect(src.children.map((c) => c.kind).sort()).toEqual(
      ["innertube", "masscomponent", "parachute", "trapezoidfinset"].sort(),
    );
    const kinds = staged.stages[1].components[0].children.map((c) => c.kind).sort();
    expect(kinds).toEqual(["innertube", "trapezoidfinset"]);
  });

  it("puts a motor in EVERY configuration, which is what makes the stage separate at all", () => {
    // The whole operation. A stage separates only if a configuration instance names a mount inside it,
    // so a booster with a mount and no instance never lights and never drops — measured on the starter
    // as 993.642 m falling to 621.158 m, a 37.5% loss, with no separation event and nothing said.
    const { doc, staged, mountId } = withBooster();
    expect(doc.rocket.configurations.length).toBeGreaterThan(0);
    for (const cfg of doc.rocket.configurations) expect(cfg.instances.some((i) => i.mountId === mountId)).toBe(false);
    for (const cfg of staged.configurations) {
      const added = cfg.instances.find((i) => i.mountId === mountId);
      expect(added, "every configuration must gain an instance in the new mount").toBeTruthy();
      // The design's own motor, not one Loft chose.
      expect(added!.motor.designation).toBe(cfg.instances[0].motor.designation);
    }
  });

  it("gives every authored stage its own ids, so two boosters are two stages", () => {
    const doc = newDesign();
    const a = { seedId: newPartId(doc.rocket, [], "stage:1"), mountId: newPartId(doc.rocket, [], "mount:1"), name: "Booster" };
    const b = { seedId: newPartId(doc.rocket, [], "stage:2"), mountId: newPartId(doc.rocket, [], "mount:2"), name: "Booster 2" };
    expect(a.seedId).not.toBe(b.seedId);
    const staged = applyGeometryEdits(doc.rocket, { addedStages: [a, b] });
    expect(staged.stages).toHaveLength(3);
    expect(staged.stages.map((s) => s.name)).toEqual(["Sustainer", "Booster", "Booster 2"]);
    // The second booster is seeded from the FIRST one's tube, because that is now the aft airframe —
    // the same rule every other operation follows: the design as it then stands.
    expect(new Set(staged.stages.flatMap((s) => s.components.map((c) => c.id))).size).toBe(
      staged.stages.flatMap((s) => s.components).length,
    );
  });

  it("is taken back by dropping the entry, with nothing left behind", () => {
    // Removal is not a `removedIds` list of the booster's parts: the stage exists only in the bag, so
    // there is nothing in the pristine design to mark as gone.
    const { doc, staged } = withBooster();
    expect(staged.stages).toHaveLength(2);
    const back = applyGeometryEdits(doc.rocket, { addedStages: [] });
    expect(back.stages).toEqual(doc.rocket.stages);
    expect(back.configurations).toEqual(doc.rocket.configurations);
  });

  it("counts as an edit, so the design is not shown and flown as the pristine one", () => {
    // The trap every operation in this bag has fallen into: `hasGeometryEdits` decides whether
    // `applyGeometryEdits` runs AT ALL, and a miss here is invisible rather than loud.
    const { edits } = withBooster();
    expect(hasGeometryEdits(edits)).toBe(true);
    expect(hasGeometryEdits({ addedStages: [] })).toBe(false);
  });

  it("is part of the STRUCTURE, so aims and removals resolve against a tree that has it", () => {
    // `structureOf` is the one place the structural keys are named. A key missing from it means every
    // aim and every removal is judged against a tree the booster is not in.
    const { doc, edits, seedId } = withBooster();
    const structure = structureOf(doc.rocket, edits);
    expect(structure.stages).toHaveLength(2);
    expect(flattenRocket(structure).some((p) => p.component.id === seedId)).toBe(true);
  });

  it("gives R3's gestures something to grow the booster with", () => {
    // The seed must be a BODY TUBE or none of the add gestures can touch the booster afterwards —
    // `addPartAfter` refuses any anchor that is not one.
    const { doc, edits, seedId } = withBooster();
    const structure = structureOf(doc.rocket, edits);
    const seed = flattenRocket(structure).find((p) => p.component.id === seedId)!;
    expect(seed.component.kind).toBe("bodytube");
    const added = { id: "added-tube", kind: "bodytube" as const, after: seedId, length: 0.2 };
    const grown = applyGeometryEdits(doc.rocket, { ...edits, added: [added] });
    expect(grown.stages[1].components.map((c) => c.id)).toEqual([seedId, "added-tube"]);
  });

  it("accounts for a stage by what it HOLDS, not by walking down from its seed", () => {
    // The seed is an ordinary removable component — `removalRefusal` returns null for it — and deleting
    // it leaves the stage standing, holding whatever the flyer authored into it. A walk rooted at
    // `seedId` then finds nothing, so a removal built on one clears nothing: the aim at the tube inside
    // the booster survives, falls back to the design's primary tube, and resizes the SUSTAINER.
    const { doc, edits, seedId } = withBooster();
    const added = { id: "grown-tube", kind: "bodytube" as const, after: seedId, length: 0.31 };
    const bag = { ...edits, added: [added], removedIds: [seedId], bodyTubeId: "grown-tube", bodyLength: 0.4 };
    // The seed is gone from the tree, so a seed-rooted lookup finds no stage at all...
    const structure = structureOf(doc.rocket, bag);
    expect(structure.stages.find((s) => s.components.some((c) => c.id === seedId))).toBeUndefined();
    // ...while the stage is still there, and still holds both.
    const gone = addedStageIds(doc.rocket, bag, seedId);
    expect(gone.has(seedId)).toBe(true);
    expect(gone.has("grown-tube")).toBe(true);
    const sustainerTube = flattenRocket(doc.rocket).find((p) => p.component.kind === "bodytube")!.component.id;
    expect(gone.has(sustainerTube)).toBe(false);
  });

  it("counts a part of the stage the flyer has ALREADY deleted, because its removal entry must go too", () => {
    // `newPartId` is deterministic and `addStage` names by the current length, so the booster after a
    // removal is minted with the SAME seed and mount ids as the one before it. A `removedIds` entry that
    // outlives the stage therefore lands on the NEXT booster: measured on the starter, add a booster
    // (1491.464 m, one separation), delete its motor mount (638.973 m, none), remove the stage, add a
    // booster again — and the new one is born with its mount already deleted, 638.973 m with zero
    // separation events, 35.7% below the design's own flight, from two clicks that destroy nothing.
    const { doc, edits, seedId, mountId } = withBooster();
    const bag = { ...edits, removedIds: [mountId] };
    // The mount is not in the tree — it has been removed — and it still belongs to the stage.
    expect(flattenRocket(structureOf(doc.rocket, bag)).some((p) => p.component.id === mountId)).toBe(false);
    expect(addedStageIds(doc.rocket, bag, seedId).has(mountId)).toBe(true);
  });

  it("does NOT carry the seed instance's ignition event onto the new bottom stage", () => {
    // The one guard in this operation no corpus design exercises, so it is pinned here instead. Every
    // seed instance across all 35 real files carries `ignitionEvent: "automatic"` or none, and
    // `ignitionTrigger` maps both to `launch` on the bottom stage — so on real data restoring the clone
    // changes nothing, and the sweep cannot see it. The FIELD is what makes a design air-start, it is
    // read straight off the file, and a design that sets one on its aft mount is a file Loft has not
    // met yet: cloned onto the new BOTTOM stage, `burnout` resolves to "never lights", which is the
    // silent wrong flight the configuration write exists to prevent.
    const base = newDesign();
    const doc = {
      ...base,
      rocket: {
        ...base.rocket,
        configurations: base.rocket.configurations.map((cfg) => ({
          ...cfg,
          instances: cfg.instances.map((i) => ({ ...i, ignitionEvent: "burnout", ignitionDelay: 2 })),
        })),
      },
    };
    const seedId = newPartId(doc.rocket, [], "stage:1");
    const mountId = newPartId(doc.rocket, [{ id: seedId } as never], "mount:1");
    const staged = applyGeometryEdits(doc.rocket, { addedStages: [{ seedId, mountId, name: "Booster" }] });
    const seed = staged.stages[staged.stages.length - 1].components[0];
    const effective = seed.children.some((c) => c.id === mountId) ? mountId : seed.id;
    for (const cfg of staged.configurations) {
      const booster = cfg.instances.find((i) => i.mountId === effective)!;
      expect(booster).toBeDefined();
      // The motor comes across; the trigger does not, and derives from the stage index instead.
      expect(booster.motor.designation).toBe(cfg.instances[0].motor.designation);
      expect(booster.ignitionEvent).toBeUndefined();
      expect(booster.ignitionDelay).toBeUndefined();
    }
  });

  it("is offered against the tree the operation SEEDS from, which is not the edited structure", () => {
    // `applyAddedStages` runs first in the pipeline, on the pristine rocket, so the aft tube it clones is
    // the pristine design's. Asking `canAddStage` the fully-structured tree instead asks about a rocket
    // the operation never sees: author one ordinary tube at the tail and the structured tree's aft-most
    // tube is that bare one, which has no mount to clone, so the gate refuses a design the operation
    // handles — it would have given a 2-stage rocket that flies and separates.
    const doc = newDesign();
    const aft = flattenRocket(doc.rocket)
      .filter((p) => p.component.kind === "bodytube")
      .reduce((best, p) => (p.xFore > best.xFore ? p : best)).component.id;
    const bag = { added: [{ id: "tail-tube", kind: "bodytube" as const, after: aft, length: 0.3 }] };
    expect(canAddStage(structureOf(doc.rocket, bag))).toBe(false);
    expect(canAddStage(stageSeedBase(doc.rocket, bag))).toBe(true);
    // And the operation the gate is speaking for does succeed.
    const seedId = newPartId(doc.rocket, [], "stage:1");
    const mountId = newPartId(doc.rocket, [{ id: seedId } as never], "mount:1");
    const built = applyGeometryEdits(doc.rocket, { ...bag, addedStages: [{ seedId, mountId, name: "Booster" }] });
    expect(built.stages).toHaveLength(2);
  });
});

describe("moveSlots — every place a drag can drop a part", () => {
  /** Three top-level parts in one stage: nose, body, aft tube. */
  const oneStage = (): Rocket => {
    const doc = newDesign();
    const s = doc.rocket.stages[0];
    const body = s.components[1];
    s.components = [...s.components, { ...structuredClone(body), id: "tube2", name: "Aft tube", children: [] }];
    return doc.rocket;
  };

  it("offers every gap except the two that leave the part where it is", () => {
    const r = oneStage();
    const [a, b, c] = r.stages[0].components.map((x) => x.id);
    expect([a, b, c].every(Boolean)).toBe(true);
    // Dragging the MIDDLE part: the gaps in front of it and behind it are the same position, so a
    // three-part stage has four gaps and exactly two of them are on offer.
    expect(moveSlots(r, b)).toEqual([
      { move: { id: b, after: null }, before: a },
      { move: { id: b, after: c }, before: null },
    ]);
  });

  it("names the part each drop lands in front of, and null for the aft end", () => {
    const r = oneStage();
    const [a, b, c] = r.stages[0].components.map((x) => x.id);
    expect(moveSlots(r, a)).toEqual([
      { move: { id: a, after: b }, before: c },
      { move: { id: a, after: c }, before: null },
    ]);
    expect(moveSlots(r, c)).toEqual([
      { move: { id: c, after: null }, before: a },
      { move: { id: c, after: a }, before: b },
    ]);
  });

  it("agrees with moveTarget wherever moveTarget has an answer", () => {
    // Two functions answering "where can this go" is how a control comes to offer a move the operation
    // cannot make. Every nudge must be one of the slots.
    const r = oneStage();
    for (const c of r.stages[0].components) {
      const slots = moveSlots(r, c.id).map((s) => JSON.stringify(s.move));
      for (const dir of [-1, 1] as const) {
        const nudge = moveTarget(r, c.id, dir);
        if (nudge) expect(slots).toContain(JSON.stringify(nudge));
      }
    }
  });

  it("never leaves the part's own stage, and points the aft-end drop at the next stage's first part", () => {
    const r = oneStage();
    const [, b, c] = r.stages[0].components.map((x) => x.id);
    const booster = { ...structuredClone(r.stages[0]), components: [{ ...structuredClone(r.stages[0].components[1]), id: "boost", children: [] }] };
    const staged: Rocket = { ...r, stages: [r.stages[0], booster] };
    const slots = moveSlots(staged, b);
    // Not one anchor is the booster's part: a move that crossed the boundary would re-stage the part
    // silently — a different separation event and a different flight.
    expect(slots.map((s) => s.move.after)).toEqual([null, c]);
    // But the AFT-END drop of the upper stage lands in front of the booster's first part, because the
    // stack is one continuous airframe and that is where the indicator belongs.
    expect(slots.find((s) => s.move.after === c)!.before).toBe("boost");
    // And the booster's own part has nowhere to go inside a stage of one.
    expect(moveSlots(staged, "boost")).toEqual([]);
  });

  it("returns nothing for a part that is not top-level, or is not there at all", () => {
    const r = oneStage();
    const inner = r.stages[0].components[1].children[0];
    expect(inner).toBeTruthy();
    expect(moveSlots(r, inner.id)).toEqual([]);
    expect(moveSlots(r, "no-such-part")).toEqual([]);
  });

  it("produces entries applyGeometryEdits actually honours, on every slot it offers", () => {
    // The check that matters: a slot is a promise that the drop will land there. Drive each one
    // through the real applier and read the order back.
    const r = oneStage();
    for (const c of r.stages[0].components) {
      for (const slot of moveSlots(r, c.id)) {
        const after = applyGeometryEdits(r, { moved: [slot.move] });
        const order = after.stages[0].components.map((x) => x.id);
        const landed = order.indexOf(c.id);
        expect(order.length).toBe(3);
        // "before X" means the dragged part sits immediately in front of X; a null `before` means last.
        if (slot.before === null) expect(landed).toBe(order.length - 1);
        else expect(order[landed + 1]).toBe(slot.before);
      }
    }
  });
});

describe("moveTarget — where a nudge lands, and when there is nowhere to go", () => {
  const threeStage = (): Rocket => {
    const doc = newDesign();
    const s = doc.rocket.stages[0];
    const body = s.components[1];
    s.components = [...s.components, { ...structuredClone(body), id: "tube2", name: "Aft tube", children: [] }];
    return doc.rocket;
  };

  it("nudges toward the tail by naming the part that was next", () => {
    const r = threeStage();
    const ids = r.stages[0].components.map((c) => c.id);
    expect(moveTarget(r, ids[0], 1)).toEqual({ id: ids[0], after: ids[1] });
  });

  it("nudges toward the nose by naming the part two places up, or the nose end", () => {
    const r = threeStage();
    const ids = r.stages[0].components.map((c) => c.id);
    expect(moveTarget(r, ids[2], -1)).toEqual({ id: ids[2], after: ids[0] });
    expect(moveTarget(r, ids[1], -1)).toEqual({ id: ids[1], after: null });
  });

  it("returns null at each end of a stage, and for a part that is not top-level", () => {
    const r = threeStage();
    const ids = r.stages[0].components.map((c) => c.id);
    expect(moveTarget(r, ids[0], -1)).toBeNull();
    expect(moveTarget(r, ids[2], 1)).toBeNull();
    // A fin set lives INSIDE a tube, so it has no place in the top-level order at all.
    const inner = r.stages[0].components[1].children[0];
    expect(inner).toBeTruthy();
    expect(moveTarget(r, inner.id, 1)).toBeNull();
    expect(moveTarget(r, "nope", 1)).toBeNull();
  });

  it("never steps into the neighbouring stage", () => {
    // A part that left its stage would separate at a different moment and fly a different flight. At a
    // boundary the honest answer is that there is nowhere to go, not a silent re-staging.
    const doc = newDesign();
    const first = doc.rocket.stages[0];
    doc.rocket.stages = [
      first,
      { ...first, name: "Booster", components: [{ ...structuredClone(first.components[1]), id: "boost", children: [] }] },
    ];
    const last = first.components[first.components.length - 1].id;
    expect(moveTarget(doc.rocket, last, 1)).toBeNull();
    expect(moveTarget(doc.rocket, "boost", -1)).toBeNull();
  });
});
