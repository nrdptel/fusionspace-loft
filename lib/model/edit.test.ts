import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { importDesign, importOrk } from "../ork/import";
import { flattenRocket } from "./geometry";
import { findParts, materialOf, partsOfKind } from "../components/db";
import type { CatalogPart } from "../components/db";
import {
  applyGeometryEdits,
  moveTarget,
  moveSlots,
  isEditedValue,
  usableCatalogParachute,
  primaryFinSpan,
  fittingUnitMass,
  primaryFinCount,
  primaryFinStation,
  primaryFinChord,
  primaryMotorClusterCount,
  primaryMountGroupIds,
  unreachableMountCount,
  primaryFinRootChord,
  primaryFinTipChord,
  primaryFinSweep,
  primaryFinThickness,
  primaryFinCrossSection,
  primaryFinMaterial,
  FIN_MATERIALS,
  primaryNose,
  structureOf,
  finStationBounds,
  finStageRoom,
  derivedPartAim,
  derivedPartId,
  DERIVED_PARTS,
  derivedPartRefusal,
  maskAimedDims,
  DIMS_STRUCTURAL,
  type DerivedPartAim,
  transitionDefaults,
  primaryTransition,
  primaryTransitionPart,
  authoredTransitionName,
  mouldLineStep,
  primaryMassObject,
  primaryMassObjectStation,
  aimsClearedByAiming,
  primaryNoseShape,
  usableCatalogNose,
  type PickedNoseCone,
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
  PER_PART_MASS_FIELDS,
  statedAirframeMass,
  stripPerPartMassOnLumpedAirframe,
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
  canAddMount,
  stageSeedBase,
  internalPartDefaults,
  primaryInternalPart,
  primaryInternalPartAim,
  internalPartBounds,
  unreachableInternalCount,
  internalSpanLabel,
  INTERNAL_MAX_BORE_FRACTION,
  primaryFitting,
  fittingHasDrag,
  usableCatalogRing,
  type GeometryEdits,
  type PickedRing,
  addedStageIds,
  addOptionsFor,
} from "./edit";
import type {
  BodyTube,
  MassComponent,
  GenericFinSet,
  NoseCone,
  NoseShape,
  Transition,
  Parachute,
  Rocket,
  RocketComponent,
  RingComponent,
  InnerTube,
  Material,
  TrapezoidFinSet,
} from "./types";
import { overallLength, maxBodyRadius, referenceRadius, canAnchorAfter, aftOuterRadius } from "./geometry";
import { newDesign } from "./starter";
import { runFlight } from "../sim/run";
import { dryMassProperties, localBodyCGx, massByComponent, statedMassHolder, statesOwnAssemblyMass } from "../sim/mass";
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
    // **Placed ABSOLUTE, at a station that is actually on the airframe.** It used to inherit
    // `first`'s `{ method: "bottom", offset: 0 }` — which means "flush with the aft of my PARENT",
    // and this set's parent is the stage rather than the tube `first` hangs on. Resolved against the
    // stage it landed at station **−240 mm**: 240 mm ahead of the nose tip, on a rocket that starts
    // at zero. Nothing noticed, because nothing bounded a fin set until `keepFinsOnAirframe`, and
    // every assertion in this describe held just as well on the unphysical version. Stated rather
    // than quietly corrected: a fixture that cannot be built is a fixture whose failures mean
    // nothing, and this one underpins six cases.
    //
    // 400 mm with a 240 mm root puts it at 400…640 on a 950 mm airframe, forward of `first`'s
    // 830…950 and clear of it — two independent sets at different stations with different
    // dimensions, which is what these cases are about.
    const second: TrapezoidFinSet = {
      ...first,
      id: `${first.id}-second`,
      name: "Booster fin set",
      height: first.height * 4,
      rootChord: first.rootChord * 2,
      placement: { ...first.placement, method: "absolute", offset: 0.4 },
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
    // **Forward, not aft, and that is the fixture rather than the rule.** Both of this design's sets
    // sit flush with the aft end of the stage they are on, which is where fins usually are — so
    // `keepFinsOnAirframe` has nothing to give in that direction and an aft nudge would be measuring
    // the clamp instead of the delta. A forward nudge exercises exactly the same arithmetic.
    const shifted = applyGeometryEdits(rocket, { finSetId: second.id, finStation: shown - 0.01 });
    const after = flattenRocket(shifted)
      .filter((p) => p.component.kind === "trapezoidfinset")
      .map((p) => p.xFore);
    // Every set still moves together — position stays a group-wide delta — but by the 10 mm asked
    // for, not by 10 mm plus the distance between the sets.
    expect(after[0] - before[0]).toBeCloseTo(-0.01, 9);
    expect(after[1] - before[1]).toBeCloseTo(-0.01, 9);
    expect(primaryFinStation(shifted, second.id)).toBeCloseTo(shown - 0.01, 9);

    // **And the aft direction is BOUNDED rather than flown**, which is the half that did not exist
    // before. Asking for a metre aft on a design with no room leaves every set exactly where it was:
    // the group-wide delta is applied and then clamped back, per set, against its own stage.
    const far = applyGeometryEdits(rocket, { finSetId: second.id, finStation: shown + 1 });
    const farAfter = flattenRocket(far)
      .filter((p) => p.component.kind === "trapezoidfinset")
      .map((p) => p.xFore);
    expect(farAfter[0]).toBeCloseTo(before[0], 9);
    expect(farAfter[1]).toBeCloseTo(before[1], 9);
  });

  it("still slides the whole fin GROUP for a position edit, keeping its spacing", async () => {
    const { rocket } = await twoFinSets();
    const before = flattenRocket(rocket)
      .filter((p) => p.component.kind === "trapezoidfinset")
      .map((p) => p.xFore);
    const station = primaryFinStation(rocket)!;
    // Forward, because the primary set is flush with the tail and the aft direction is now bounded —
    // see the note in the case above. The delta is what is under test and its sign is not.
    const shifted = applyGeometryEdits(rocket, { finStation: station - 0.05 });
    const after = flattenRocket(shifted)
      .filter((p) => p.component.kind === "trapezoidfinset")
      .map((p) => p.xFore);
    // Every set moves by the same delta — position is a delta edit and stays group-wide on
    // purpose, so the design keeps its layout and finStationTrim's slope holds.
    expect(after[0] - before[0]).toBeCloseTo(-0.05, 9);
    expect(after[1] - before[1]).toBeCloseTo(-0.05, 9);
  });
});

describe("applyGeometryEdits — fin position (stability lever)", () => {
  it("moves the fin group to the requested station, non-destructively", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const before = primaryFinStation(rocket)!;
    expect(before).toBeGreaterThan(0);
    // **5 cm FORWARD, because this design's fins are already flush with the tail** — 830 mm with a
    // 120 mm root on a 950 mm airframe, which is where fins normally are and is true of all seven
    // committed fixtures. An aft request is now bounded by `keepFinsOnAirframe`, so it would measure
    // the clamp rather than the placement, and the case below is where the clamp belongs.
    const target = before - 0.05;
    const edited = applyGeometryEdits(rocket, { finStation: target });
    // The primary fin set's fore edge lands exactly on the requested station.
    expect(primaryFinStation(edited)).toBeCloseTo(target, 9);
    // The pristine design is untouched.
    expect(primaryFinStation(rocket)).toBeCloseTo(before, 9);
  });

  it("cuts a root longer than its stage rather than sliding the fin off the back", async () => {
    // **The hole in this bound's FIRST version, and the reason a cut and a shift cannot share a
    // measurement.** 42 of the 62 bounded corpus fin sets and all seven committed fixtures are placed
    // `bottom`, which measures from the parent's aft face — so shortening a root slides the fore edge
    // AFT by exactly what was removed. Computing the group correction from the flatten taken BEFORE
    // the cut and applying both together put a 1900 mm root, cut to 950 mm, at station 950 mm on a
    // 950 mm airframe: **the entire fin set behind the tail**, from one typed number, through the
    // pass written to prevent that. `barrowman` then reported a CP at 1006.7 mm and the sweep plotted
    // +2.02 cal for it — the Sev-1 this increment closes, re-opened through a different field.
    // Cut, re-flatten, then correct.
    const rocket = await load("demo-single-deploy.ork");
    const room = finStageRoom(rocket)!;
    expect(room).toBeGreaterThan(0);
    for (const asked of [room * 1.05, room * 2, room * 5]) {
      const edited = applyGeometryEdits(rocket, { finRootChord: asked });
      const set = flattenRocket(edited).find((p) => p.component.kind === "trapezoidfinset")!;
      // On the airframe at BOTH ends, asserted from the flattened geometry rather than from the
      // number that was clamped.
      expect(set.xFore, `root ${asked} landed at ${set.xFore}`).toBeGreaterThanOrEqual(-1e-9);
      expect(set.xFore + set.length).toBeLessThanOrEqual(overallLength(edited) + 1e-9);
      // ...and it is still a trapezoid: the tip came down with the root, so the fin keeps its shape
      // rather than becoming one whose tip is longer than its root — which both the planform and the
      // flutter estimate read.
      const c = set.component as { rootChord: number; tipChord: number };
      expect(c.rootChord).toBeCloseTo(room, 9);
      expect(c.tipChord).toBeLessThanOrEqual(c.rootChord + 1e-9);
      expect(c.tipChord).toBeGreaterThan(0);
    }

    // **The control.** A root that FITS is applied verbatim and the set is not moved off its seat —
    // the cut must not be a blanket rewrite, or every assertion above passes on a no-op.
    const fits = room * 0.5;
    const ok = applyGeometryEdits(rocket, { finRootChord: fits });
    const set = flattenRocket(ok).find((p) => p.component.kind === "trapezoidfinset")!;
    expect((set.component as { rootChord: number }).rootChord).toBeCloseTo(fits, 9);
    expect(set.xFore + set.length).toBeCloseTo(overallLength(ok), 9);
  });

  it("refuses to hang the fins off the tail, however far aft they are asked for", async () => {
    // **The Sev-1 this bound exists for, and it was reachable in two typed fields.** Before
    // `keepFinsOnAirframe`, a Fin position of 1030 mm on this 950 mm design put the whole fin set 80
    // mm behind the airframe and the Flight card restated CG, CP and static margin from it — an
    // arithmetically correct answer about a rocket nobody can build, with no flag of any kind. The
    // Design wall's field had `min={0} positive` and no `max`, while the diagram's own grip and the
    // sweep panel both already clamped: one rule, three places, and the applier — the only one every
    // caller goes through — enforced none of it.
    const rocket = await load("demo-single-deploy.ork");
    const bounds = finStationBounds(rocket)!;
    // The bound is the stage's aft end less the root chord, and on this design the fins already sit
    // exactly on it — so there is no room aft at all, which is what makes the case sharp. Spelled
    // out from the geometry rather than trusting the bound, so a bound that agrees with itself and
    // not with the rocket still fails.
    const set0 = flattenRocket(rocket).find((p) => p.component.kind === "trapezoidfinset")!;
    expect(set0.xFore + set0.length).toBeCloseTo(overallLength(rocket), 9);
    expect(bounds.hi).toBeCloseTo(primaryFinStation(rocket)!, 9);

    for (const asked of [bounds.hi + 0.001, bounds.hi + 0.08, bounds.hi + 1]) {
      const edited = applyGeometryEdits(rocket, { finStation: asked });
      const at = primaryFinStation(edited)!;
      expect(at, `asked for ${asked}, landed at ${at}`).toBeLessThanOrEqual(bounds.hi + 1e-9);
      expect(at).toBeGreaterThanOrEqual(bounds.lo - 1e-9);
      // ...and the trailing edge is genuinely on the airframe, which is the thing the bound is FOR.
      // Asserted from the flattened geometry rather than from the number just clamped, so a bound
      // that is arithmetically self-consistent and physically wrong still fails.
      const set = flattenRocket(edited).find((p) => p.component.kind === "trapezoidfinset")!;
      expect(set.xFore + set.length).toBeLessThanOrEqual(overallLength(edited) + 1e-9);
    }

    // **The forward end, on a design where it is not zero.** A first draft asked for 0.0001 mm on
    // this fixture, where `lo` IS zero and `applyDimensionEdits` ignores a non-positive station
    // anyway — so no clamp could fire and the assertion could not fail. A staged design is where the
    // fore bound means something: a sustainer's fins cannot be slid ahead of the stage they are on.
    const staged = await importOrk(new Uint8Array(readFileSync(resolve("e2e/fixtures/two-stage-firm-booster.ork"))));
    const sBounds = finStationBounds(staged.rocket)!;
    expect(sBounds.lo, "this fixture's fore bound is zero — the case would prove nothing").toBeGreaterThan(0);
    const forced = applyGeometryEdits(staged.rocket, { finStation: sBounds.lo / 2 });
    for (const p of flattenRocket(forced)) {
      if (p.component.kind !== "trapezoidfinset") continue;
      expect(p.xFore, `${p.component.name} was slid ahead of its stage`).toBeGreaterThanOrEqual(-1e-9);
    }
    expect(primaryFinStation(forced)!).toBeGreaterThanOrEqual(sBounds.lo - 1e-9);

    // **The control.** A station inside the bound is applied verbatim — the clamp must not be a
    // blanket refusal, or every one of the assertions above would pass on a no-op.
    const inside = bounds.hi - 0.05;
    expect(primaryFinStation(applyGeometryEdits(rocket, { finStation: inside }))).toBeCloseTo(inside, 9);
  });

  it("moving the fins aft raises the static margin; forward lowers it, apogee ~unchanged", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const s0 = primaryFinStation(rocket)!;
    // **Measured from a station 100 mm forward of where this design carries its fins**, so that BOTH
    // directions have room. The fins sit flush with the tail as designed — 830 mm with a 120 mm root
    // on a 950 mm airframe — so "5 cm aft of as-designed" is off the airframe and
    // `keepFinsOnAirframe` now bounds it. Comparing a clamped station against an unclamped one would
    // be comparing one rocket with itself. Both edits below are inside the bound, so the physics
    // under test is untouched and the three flights are three different rockets.
    const mid = s0 - 0.1;
    const nominal = runFlight(applyGeometryEdits(rocket, { finStation: mid }), {}).result;
    const aft = runFlight(applyGeometryEdits(rocket, { finStation: mid + 0.05 }), {}).result;
    const fore = runFlight(applyGeometryEdits(rocket, { finStation: mid - 0.05 }), {}).result;
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
    // Forward: this design's fins are flush with the tail, so an aft delta is bounded — see the
    // fin-position bound case above. The sign is not what is under test; the equality of the delta
    // across every set is.
    const edited = applyGeometryEdits(rocket, { finStation: s0 - 0.1 });
    const finAfter = flattenRocket(edited).filter((p) =>
      ["trapezoidfinset", "ellipticalfinset", "freeformfinset"].includes(p.component.kind),
    );
    expect(finAfter.length).toBe(finBefore.length);
    for (let i = 0; i < finBefore.length; i++) {
      expect(finAfter[i].xFore - finBefore[i].xFore).toBeCloseTo(-0.1, 9);
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

describe("authoring a motor mount", () => {
  const mountsOf = (r: Rocket) =>
    flattenRocket(r)
      .map((p) => p.component)
      .filter((c) => "motorMount" in c && (c as { motorMount?: unknown }).motorMount !== undefined);

  const aftTube = (r: Rocket) => {
    const tubes = flattenRocket(r).filter((p) => p.component.kind === "bodytube");
    return tubes.reduce((b, p) => (p.xFore > b.xFore ? p : b)).component;
  };

  /** The starter with every motor mount removed, at any depth — its own sits on an INNER tube nested
   *  inside the aft body tube, so a top-level strip misses it entirely. That is the shape of the 2
   *  real designs this operation exists for. */
  const stripMounts = (r: Rocket): Rocket => {
    const strip = (list: RocketComponent[]): RocketComponent[] =>
      list.map((c) => {
        const kids = c.children.length ? strip(c.children) : c.children;
        return "motorMount" in c ? { ...c, motorMount: undefined, children: kids } : { ...c, children: kids };
      });
    return { ...r, stages: r.stages.map((st) => ({ ...st, components: strip(st.components) })) };
  };

  it("sets the field on the named tube and gives it a motor in every configuration", () => {
    const rocket = newDesign().rocket;
    const bare = stripMounts(rocket);
    const host = aftTube(bare);
    expect(mountsOf(bare).length).toBe(0);
    expect(canAddMount(bare, host.id)).toBe(true);

    const out = applyGeometryEdits(bare, { mountAdds: [{ hostId: host.id }] });
    expect(mountsOf(out).map((c) => c.id)).toEqual([host.id]);
    // A mount with nothing naming it never lights — the instance IS the operation.
    for (const cfg of out.configurations) {
      expect(cfg.instances.some((i) => i.mountId === host.id), "every configuration gets an instance").toBe(true);
    }
  });

  it("refuses a part that cannot carry one, one that already has one, and a design with no motor", () => {
    const rocket = newDesign().rocket;
    // Already has one. Read the mount's actual HOST rather than assuming it is the aft body tube —
    // on the starter it is an INNER tube nested inside that tube, which is the ordinary shape.
    const held = mountsOf(rocket)[0];
    expect(held, "the starter must carry a mount or this case proves nothing").toBeDefined();
    expect(canAddMount(rocket, held.id)).toBe(false);
    // Not a tube.
    const nose = flattenRocket(rocket).find((p) => p.component.kind === "nosecone")!.component;
    expect(canAddMount(rocket, nose.id)).toBe(false);
    // Not a part at all.
    expect(canAddMount(rocket, "nope")).toBe(false);
    // Nothing to fly: a mount Loft cannot put a motor in is dead weight that would still satisfy a
    // `canAddStage` testing only for a mount's existence.
    const bare: Rocket = {
      ...stripMounts(rocket),
      configurations: rocket.configurations.map((c) => ({ ...c, instances: [] })),
    };
    expect(canAddMount(bare, aftTube(bare).id)).toBe(false);
  });

  it("is what unblocks a booster on a design whose aft tube has no mount", () => {
    // The whole reason this operation exists. `canAddStage` refuses where there is no mount to clone,
    // and `stageSeedBase` is the only tree it may be asked of — so the mount-add has to be visible
    // there, which is why `applyMountAdds` runs BEFORE `applyAddedStages`.
    const rocket = newDesign().rocket;
    const bare = stripMounts(rocket);
    expect(canAddStage(bare)).toBe(false);
    const bag: GeometryEdits = { mountAdds: [{ hostId: aftTube(bare).id }] };
    expect(canAddStage(stageSeedBase(bare, bag))).toBe(true);
  });

  it("comes back off by dropping the entry, motor and all", () => {
    const rocket = newDesign().rocket;
    const bare = stripMounts(rocket);
    const host = aftTube(bare);
    const withMount = applyGeometryEdits(bare, { mountAdds: [{ hostId: host.id }] });
    expect(mountsOf(withMount).length).toBe(1);
    // Replaying the bag WITHOUT the entry is the whole of undo — nothing to unwind by hand, because
    // the mount only ever existed in the bag.
    const back = applyGeometryEdits(bare, { mountAdds: [] });
    expect(mountsOf(back).length).toBe(0);
    expect(back.configurations.every((c) => c.instances.every((i) => i.mountId !== host.id))).toBe(true);
  });

  it("is idempotent, so applying it at both pipeline points cannot double anything", () => {
    // `applyMountAdds` runs before the stages AND after the adds. The second pass must find the field
    // already set and do nothing — otherwise a second instance lands in every configuration and the
    // design flies the motor twice.
    const rocket = newDesign().rocket;
    const bare = stripMounts(rocket);
    const host = aftTube(bare);
    const out = applyGeometryEdits(bare, { mountAdds: [{ hostId: host.id }] });
    for (const cfg of out.configurations) {
      expect(cfg.instances.filter((i) => i.mountId === host.id).length, "exactly one instance").toBe(1);
    }
  });

  it("round-trips through the exporter", async () => {
    // A mount is keyed by its HOST's id in both the solver and the exporter, so an authored one is
    // indistinguishable from an imported one by the time it reaches either. Proving it here is what
    // stops the builder shipping a design whose export loses the thing that was just built —
    // `ROADMAP.md` R6 exists because `downloadOrk` has already dropped a field once.
    const doc = newDesign();
    const bare = stripMounts(doc.rocket);
    const host = aftTube(bare);
    const built = applyGeometryEdits(bare, { mountAdds: [{ hostId: host.id }] });
    expect(mountsOf(built).length).toBe(1);

    const reDoc = await importOrk(await exportOrk({ ...doc, rocket: built }));
    const reMounts = mountsOf(reDoc.rocket);
    expect(reMounts.length, "the authored mount survived the round trip").toBe(1);
    // And so did the motor in it — a mount that comes back empty never lights, which is the same
    // 37.5%-in-silence the stage operation exists to prevent.
    expect(
      reDoc.rocket.configurations.some((c) => c.instances.some((i) => i.mountId === reMounts[0].id)),
      "the motor came back with it",
    ).toBe(true);
  });

  it("counts as an edit, so a design carrying only one is not flown as the file describes it", () => {
    const rocket = newDesign().rocket;
    expect(hasGeometryEdits({ mountAdds: [{ hostId: aftTube(rocket).id }] })).toBe(true);
    expect(hasGeometryEdits({ mountAdds: [] })).toBe(false);
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

  it("writes only the mounts the field's own value describes", () => {
    // The reader takes the FIRST mount and the writer used to take ALL of them, so on a design whose
    // mounts differ the field stated one number and changed another. Synthetic because the shape is
    // rare — one of the 35 real designs has it (`Airstart timing.ork`: a `54mm center` holding 1
    // beside a `38mm airstart` holding 3) — and a guard against a file shape the corpus barely
    // contains is better proved here than by a sweep that would pass either way.
    const base = newDesign().rocket;
    const mounts = flattenRocket(base)
      .map((p) => p.component)
      .filter((c) => "motorMount" in c && c.motorMount);
    expect(mounts.length).toBe(1);

    // Give the starter a second mount already holding 3 — the air-start pod's shape.
    // `mounts[0]` is a `RocketComponent`, a union whose members do not all carry `motorMount` — so a
    // literal that spreads it and re-states the field is rejected against the union as a whole. Only
    // `BodyTube` and `InnerTube` have one, and only those two can be here.
    const host = mounts[0] as BodyTube;
    const pod: BodyTube = {
      ...structuredClone(host),
      id: "pod",
      name: "airstart pod",
      motorMount: { overhang: 0, clusterCount: 3 },
      children: [],
    };
    const two: Rocket = {
      ...base,
      stages: base.stages.map((st, i) =>
        i === 0 ? { ...st, components: [...st.components, pod] } : st,
      ),
    };

    const countOf = (r: Rocket, id: string) => {
      const c = flattenRocket(r).find((p) => p.component.id === id)?.component as
        | { motorMount?: { clusterCount?: number } }
        | undefined;
      return c?.motorMount?.clusterCount ?? 1;
    };

    expect(primaryMotorClusterCount(two)).toBe(1);
    expect(primaryMountGroupIds(two).has(host.id)).toBe(true);
    expect(primaryMountGroupIds(two).has("pod")).toBe(false);
    expect(unreachableMountCount(two)).toBe(1);

    const edited = applyGeometryEdits(two, { motorClusterCount: 2 });
    // The mount the field described takes the new value...
    expect(countOf(edited, host.id)).toBe(2);
    // ...and the one it never mentioned keeps its own. Before this, it read 3 and became 2.
    expect(countOf(edited, "pod")).toBe(3);
  });

  it("speaks for every mount when they already agree, and says so", () => {
    const base = newDesign().rocket;
    expect(unreachableMountCount(base)).toBe(0);
    // Two mounts both at 1: the field's value is true of both, so both move together.
    const host = flattenRocket(base)
      .map((p) => p.component)
      .find((c) => "motorMount" in c && c.motorMount)!;
    const twin: BodyTube = { ...(structuredClone(host) as BodyTube), id: "twin", name: "twin", children: [] };
    const two: Rocket = {
      ...base,
      stages: base.stages.map((st, i) =>
        i === 0 ? { ...st, components: [...st.components, twin] } : st,
      ),
    };
    expect(unreachableMountCount(two)).toBe(0);
    const edited = applyGeometryEdits(two, { motorClusterCount: 4 });
    const counts = flattenRocket(edited)
      .map((p) => p.component)
      .filter((c) => "motorMount" in c && c.motorMount)
      .map((c) => (c as { motorMount?: { clusterCount?: number } }).motorMount?.clusterCount ?? 1);
    expect(counts).toEqual([4, 4]);
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
    // `demo-quirks.ork` carries a streamer, which no editor field describes: `parachuteId`'s kinds
    // are `["parachute"]` alone and a streamer is its own type in `types.ts`. Reading one must move
    // no aim.
    //
    // **This case used to use the fixture's TUBE COUPLER, and the `internalId` slot took that away**
    // — a coupler now moves an aim like any other part, which is the capability rather than a
    // regression. The case survives on a different kind because the rule it checks is unchanged:
    // 55 parts across the corpus (24 shock cords, 19 launch lugs, 11 rail buttons, 1 streamer) still
    // have no field, and picking one must not silently re-point a field at something else.
    const rocket = await load("demo-quirks.ork");
    const unaimed = flattenRocket(rocket).find((p) => p.component.kind === "streamer")!;
    expect(unaimed, "the fixture needs a part that drives no field").toBeTruthy();
    expect(aimEditsAt(rocket, unaimed.component.id)).toEqual({});
    expect(aimEditsAt(rocket, "no-such-component")).toEqual({});
    // And the coupler beside it DOES aim now, which is what this increment added.
    const coupler = flattenRocket(rocket).find((p) => p.component.kind === "tubecoupler")!;
    expect(aimEditsAt(rocket, coupler.component.id)).toEqual({ internalId: coupler.component.id });
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

  /** **Every field that writes a weight onto ONE part has to be in `PER_PART_MASS_FIELDS`**, because
   *  that list is what the lumped-airframe refusal reads. A design that states one weight for the
   *  whole airframe already contains every part, so a mass key missing from the list is a weight
   *  ADDED to a figure that already includes it — which is exactly how `parachuteMass` and
   *  `fittingMass` went on double-counting after the same guard was written for the nose and tube.
   *
   *  The naming convention is the mechanism: a key ending in `Mass` writes a mass. That is a weak
   *  rule on its own, which is why the corpus sweep asserts the BEHAVIOUR over real files as well —
   *  this case catches the omission at the point it is made, in the file where it is made. */
  it("declares every per-part mass field, so the lumped-airframe refusal cannot miss one", () => {
    // The aim registry's own targets are the authority on which value fields exist.
    const aimedMassFields = Object.values(AIM_SLOTS)
      .flatMap((def) => def.targets)
      .filter((t) => t.endsWith("Mass"));
    // The nose has no slot, so its mass field is named directly — the same exception `AIM_FIELDS`
    // carries in `components/LoftApp.tsx`.
    const expected = new Set([...aimedMassFields, "noseMass"]);
    const declared = new Set<string>(Object.keys(PER_PART_MASS_FIELDS));
    for (const f of expected) {
      expect(declared.has(f), `${f} writes a per-part weight but PER_PART_MASS_FIELDS omits it`).toBe(true);
    }
    for (const f of declared) {
      expect(expected.has(f), `PER_PART_MASS_FIELDS names ${f}, which no aim target and no exception provides`).toBe(
        true,
      );
    }
  });

  /** The refusal itself, at the one choke point, on the BUNDLED RASAero sample rather than on a
   *  hand-built lump — a real file of the format that causes this, reachable from the front door and
   *  present in CI whether or not the private corpus is. Every key in the registry must come back out
   *  of the bag; nothing else may be touched. */
  it("strips every per-part weight from a lumped-airframe design, and nothing else", async () => {
    const lumped = (await importDesign(new Uint8Array(readFileSync(resolve("public/samples/demo-rasaero.CDX1")))))
      .rocket;
    expect(statedAirframeMass(lumped), "the bundled RASAero sample no longer states one lumped weight").toBeDefined();
    const perPart = await load("demo-dual-deploy.ork");
    expect(statedAirframeMass(perPart), "the control design must state its masses per part").toBeUndefined();

    const keys = Object.keys(PER_PART_MASS_FIELDS);
    const bag = Object.fromEntries(keys.map((k) => [k, 0.5]));
    const fileIds = new Set(flattenRocket(lumped).map((p) => p.component.id));
    const stripped = stripPerPartMassOnLumpedAirframe(lumped, { ...bag, bodyLength: 0.4, finSpan: 0.05 }, fileIds);
    // Only the fields that actually resolve to a part of the FILE are taken: this design carries no
    // internal structure, so `internalMass` has no target and is left alone rather than swallowed.
    for (const k of ["noseMass", "bodyTubeMass", "parachuteMass", "fittingMass"]) {
      expect(stripped[k as keyof typeof stripped], `${k} survived the strip`).toBeUndefined();
    }
    // A dimension is not a weight: the refusal must not swallow the rest of the flyer's what-if.
    expect(stripped.bodyLength).toBe(0.4);
    expect(stripped.finSpan).toBe(0.05);
    // And on a design that states its masses per part, the bag comes back untouched — by identity,
    // so the common path allocates nothing.
    const normal = { ...bag, bodyLength: 0.4 };
    expect(stripPerPartMassOnLumpedAirframe(perPart, normal, new Set())).toBe(normal);
  });

  /** **The material select is the OTHER route to the same double-count, and it is the larger one.**
   *
   *  A format that states one launch weight and no per-part masses leaves every shell massless on
   *  purpose — `lib/sim/mass.ts` reads `c.material?.density ?? 0` — so the stated figure is the whole
   *  of it. Handing those parts a density computes a second airframe and adds it on top, and a
   *  RASAero tube states no wall thickness either, so each is flown as a SOLID rod. Measured on the
   *  bundled sample before the fix, against a stated 8.2649 kg: cardboard **15.1164 kg**, plywood
   *  14.9207, kraft-phenolic 17.5634, blue tube 20.6955, carbon 23.6319, fibreglass **25.5895** — a
   *  tripling — and in the running app the stability margin moved 3.06 → 4.1 cal through a live,
   *  enabled select one click from the front door.
   *
   *  Picking your airframe stock is the most ordinary thing on that surface, and on the one format
   *  that names no material at all it is the likeliest thing a flyer does. */
  it("gives a lumped design's own shells no material weight, and an authored shell its own", async () => {
    const doc = await importDesign(new Uint8Array(readFileSync(resolve("public/samples/demo-rasaero.CDX1"))));
    const rocket = doc.rocket;
    expect(statedAirframeMass(rocket)).toBeDefined();
    const base = dryMassProperties(rocket).mass;
    for (const key of ["cardboard", "plywood", "kraft-phenolic", "bluetube", "carbon", "fibreglass"]) {
      const after = dryMassProperties(applyGeometryEdits(rocket, { airframeMaterial: key })).mass;
      expect(after, `${key} added a second airframe to a design that states its whole weight`).toBeCloseTo(base, 9);
    }
    // The control: on a design that states its masses per part, the material still moves the mass —
    // otherwise this would pass by having broken the feature everywhere.
    const perPart = await load("demo-dual-deploy.ork");
    const perPartBase = dryMassProperties(perPart).mass;
    const perPartAfter = dryMassProperties(applyGeometryEdits(perPart, { airframeMaterial: "fibreglass" })).mass;
    expect(perPartAfter, "the material edit stopped working on a normal design").not.toBeCloseTo(perPartBase, 6);
  });

  /** **A part the flyer AUTHORED is not inside a weight the file stated before it existed**, so the
   *  refusal must be about the part and not about the design.
   *
   *  The first version of this guard stripped every per-part weight from any design carrying a lump,
   *  and that broke authoring on exactly the format where authoring matters most: RASAero states no
   *  per-part masses at all, so a flyer's own scale is the only possible source of one. Reproduced
   *  before the fix on the bundled sample — add a mass object to a body tube and it lands at the
   *  0.045 kg default whose stated purpose is that "the next keystroke replaces the starting weight";
   *  that keystroke did nothing and dry mass stayed at 8.3099 kg, with the control greyed out.
   *
   *  Found by the pre-push agent review, which is the only thing that looked at it: the gate was
   *  fully green, because every check written for this guard asked whether an IMPORTED part could be
   *  double-counted and none asked whether an authored one could still be weighed. */
  it("still weighs a part the flyer authored on a lumped-airframe design", async () => {
    const doc = await importDesign(new Uint8Array(readFileSync(resolve("public/samples/demo-rasaero.CDX1"))));
    const rocket = doc.rocket;
    expect(statedAirframeMass(rocket)).toBeDefined();
    const tube = flattenRocket(rocket).find((p) => p.component.kind === "bodytube")!;
    const added = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "masscomponent" as const,
        after: tube.component.id,
        length: 0,
        name: "Altimeter bay",
        mass: 0.045,
      },
    ];
    const base = dryMassProperties(applyGeometryEdits(rocket, { added })).mass;
    const weighed = dryMassProperties(applyGeometryEdits(rocket, { added, massObjectMass: 0.3 })).mass;
    // The authored part's own default (0.045) is replaced by the typed weight (0.3), so the design
    // gains exactly the difference. It must not gain zero, which is what a design-wide strip gave.
    expect(weighed - base, "a weight typed on a part the flyer authored did not reach the flight").toBeCloseTo(
      0.3 - 0.045,
      9,
    );
    // And the imported cone on the SAME design is still refused, so this did not simply reopen it.
    const cone = dryMassProperties(applyGeometryEdits(rocket, { added, noseMass: 0.5 })).mass;
    expect(cone, "an imported part's weight is still added to the stated lump").toBeCloseTo(base, 9);
  });

  /** The behaviour the strip exists for, end to end and in the units a flyer reads: on the bundled
   *  lumped design NO per-part weight may move the dry mass, and on a per-part design every one of
   *  them that has a part to land on still must. The second half is the negative control — a strip
   *  that refused everywhere would pass the first half alone. */
  it("moves no mass on a lumped design, and still moves it on a per-part one", async () => {
    const lumped = (await importDesign(new Uint8Array(readFileSync(resolve("public/samples/demo-rasaero.CDX1")))))
      .rocket;
    const lumpedBase = dryMassProperties(lumped).mass;
    for (const k of Object.keys(PER_PART_MASS_FIELDS)) {
      const after = dryMassProperties(applyGeometryEdits(lumped, { [k]: 0.5 })).mass;
      expect(after, `${k} moved dry mass on a design whose whole weight is one lump`).toBeCloseTo(lumpedBase, 9);
    }
    const perPart = await load("demo-dual-deploy.ork");
    const perPartBase = dryMassProperties(perPart).mass;
    const landed = Object.keys(PER_PART_MASS_FIELDS).filter(
      (k) => Math.abs(dryMassProperties(applyGeometryEdits(perPart, { [k]: 0.5 })).mass - perPartBase) > 1e-9,
    );
    // Not all six: this fixture carries no fitting and no internal structure to weigh. The point is
    // that the strip is what silences them on the lumped file, not that they are inert everywhere.
    expect(landed.length, "no per-part weight lands on a design that states its masses per part").toBeGreaterThan(0);
  });
});

describe("a structural add stays where it belongs, whatever tube is picked", () => {
  /** Where a tube's trailing edge is — which is what "the boattail attached to THIS tube" means for a
   *  part that is the tube's SIBLING rather than its child. A transition added at the tail hangs off no
   *  component in the tree; until 2026-08-02 the only record of which tube it belonged to was the
   *  readable composite id the add minted (`<tube>-boattail`), and these tests read it back out of
   *  there. That id could not survive an export — `.ork` ids are UUIDs and a non-UUID is hashed into a
   *  fresh one on the way out — so the adds mint UUIDs now and the relationship is asserted where it
   *  actually lives: in the geometry. */
  const trailingEdgeOf = (r: Rocket, id: string) => {
    const p = flattenRocket(r).find((x) => x.component.id === id)!;
    return p.xFore + p.length;
  };

  /** The id of the component an added part hangs off, for the adds that ARE children (the payload
   *  sits inside its tube). Found through the TREE rather than read out of the added part's own id. These tests used to assert `\`${tube}-boattail\`` was present, which
   *  worked only because the add minted a readable composite id — and that id could not survive an
   *  export, since `.ork` ids are UUIDs and a non-UUID gets hashed into a fresh one on the way out.
   *  The adds mint UUIDs now, so the host has to be asked for directly. */
  const hostOf = (r: Rocket, name: string): string | undefined => {
    const walk = (cs: readonly RocketComponent[], parent?: string): string | undefined => {
      for (const c of cs) {
        if (c.name === name) return parent;
        const hit = walk(c.children, c.id);
        if (hit !== undefined) return hit;
      }
      return undefined;
    };
    for (const st of r.stages) {
      const hit = walk(st.components);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };

  /** An added part's station, by name. */
  const stationOf = (r: Rocket, name: string) =>
    flattenRocket(r).find((p) => p.component.name === name)?.xFore;

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
    expect(stationOf(noPick, "Boattail")!).toBeCloseTo(trailingEdgeOf(noPick, aft), 9);
    expect(stationOf(picked, "Boattail")!).toBeCloseTo(trailingEdgeOf(picked, aft), 9);
    expect(stationOf(picked, "Boattail")!).not.toBeCloseTo(trailingEdgeOf(picked, fwd), 6);
    // And it sits behind the aft tube's own trailing edge, not part-way up the airframe.
    const aftPlaced = flattenRocket(picked).find((p) => p.component.id === aft)!;
    expect(stationOf(picked, "Boattail")!).toBeCloseTo(aftPlaced.xFore + aftPlaced.length, 6);
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
    expect(hostOf(none, "Payload")).toBe(upper);

    // Blank station with the aft tube picked: the bay goes THERE...
    const aimed = applyGeometryEdits(rocket, { bodyTubeId: mount, payloadMassKg: 0.3 });
    expect(hostOf(aimed, "Payload")).toBe(mount);
    expect(hostOf(aimed, "Payload")).not.toBe(upper);
    // ...and the field's placeholder names the same tube's mid-point, so a blank and what a blank does
    // agree. They did not: the station field went on advertising the primary tube's mid-point.
    const placeholder = defaultPayloadStation(rocket, mount)!;
    expect(stationOf(aimed, "Payload")!).toBeCloseTo(placeholder, 9);
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
    expect(stationOf(edited, "Boattail")!).toBeCloseTo(aft.xFore + aft.length, 9);
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
    expect(flattenRocket(ok).some((p) => p.component.name === "Boattail")).toBe(true);
    // ...and one at or above it is refused, which is exactly why the field must not advertise the wider
    // tube: 60 mm sits inside the forward tube's 66 mm and is silently dropped.
    const refused = applyGeometryEdits(rocket, { boattailLength: 0.05, boattailAftDiameter: 0.06 });
    expect(flattenRocket(refused).some((p) => p.component.name === "Boattail")).toBe(false);
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

  it("stays inside its host when the host is resized under it", async () => {
    // **SEV-1, 2026-08-18.** `buildAdded` derives the station from the length the host has when
    // `applyAdds` runs — the FILE's length — and `applyDimensionEdits` resizes the host afterwards.
    // `resolveChildFore`'s `top` arm never clamps, so the mass did not move with the shrinking host:
    // it hung out of the back of it and the solver flew it there, with the wrong CG and the wrong
    // static margin printed unlabelled on every surface that reads them.
    //
    // Reachable in ONE drag: `components/RocketDiagram.tsx` gives the Body-length grip a 20 mm floor
    // on every tube, so no typing and no unusual number is needed.
    const doc = await load(SINGLE);
    const tube = primaryBodyTube(doc.rocket)!;
    const fileLen = flattenRocket(doc.rocket).find((p) => p.component.id === tube.id)!.length;
    const { id, edits } = author(doc.rocket, tube.id);

    const shrunk = applyGeometryEdits(doc.rocket, { ...edits, bodyTubeId: tube.id, bodyLength: 0.02 });
    const flat = flattenRocket(shrunk);
    const m = flat.find((p) => p.component.id === id)!;
    const host = flat.find((p) => p.component.id === tube.id)!;

    expect(host.length, "the host really did shrink").toBeCloseTo(0.02, 9);
    // Inside the host it names, both ends.
    expect(m.xFore, "the mass hangs out of the front of its host").toBeGreaterThanOrEqual(host.xFore - 1e-9);
    expect(m.xFore, "the mass hangs out of the back of its host").toBeLessThanOrEqual(
      host.xFore + host.length + 1e-9,
    );
    // …and it keeps its FRACTION, which is what `buildAdded`'s own comment promises: "a bay stays a
    // third of the way down the tube that holds it when that tube is later resized". Asserting the
    // fraction rather than only the bound is what separates "clamped to the edge" from "moved with
    // its host" — a clamp would satisfy the two bounds above and park the bay at the tail.
    expect((m.xFore - host.xFore) / host.length).toBeCloseTo(0.3251, 6);
    // A first draft closed with `expect(fileLen * 0.3251).toBeGreaterThan(host.length)` — two fixture
    // constants compared to each other, inert with respect to the code under test and reading as a
    // check on it. The scale it was reaching for belongs in prose: the file's tube is
    // ${(fileLen * 1000).toFixed(0)} mm, so the frozen station was ${(fileLen * 325.1).toFixed(0)} mm
    // down a 20 mm host. Removed rather than kept.
    void fileLen;
  });

  it("keeps a station the flyer typed, and clamps it rather than re-deriving it", async () => {
    // Two masses, two rules. An authored mass the flyer has NOT stationed tracks its host's length;
    // one they HAVE stationed keeps their number, clamped to the host it ends up in. Re-deriving the
    // typed one would overwrite a number the flyer chose, which is the opposite failure.
    //
    // **What this case does and does NOT control, stated because a reader would assume otherwise.**
    // It passes verbatim with `seatAddedMasses` deleted: `withMassStation` already clamps against the
    // post-dimension-edit tree, so on a BODY-TUBE host the pinned arm computes a no-op. What it
    // catches is the pass over-reaching — re-deriving the typed station instead of clamping it, which
    // fails this case with `0.006502` against `0.02`. The pinned arm's own live path is a mass
    // authored inside an authored COUPLER, the one host `fitAddedInternalParts` shortens after that
    // clamp, and there is no check for it anywhere: filed, not claimed.
    const doc = await load(SINGLE);
    const tube = primaryBodyTube(doc.rocket)!;
    const host0 = flattenRocket(doc.rocket).find((p) => p.component.id === tube.id)!;
    const { id, edits } = author(doc.rocket, tube.id);

    // Ask for a station a quarter of the way down the FILE's tube, then shrink the tube under it.
    const station = host0.xFore + host0.length * 0.25;
    const out = applyGeometryEdits(doc.rocket, {
      ...edits,
      massObjectId: id,
      massObjectStation: station,
      bodyTubeId: tube.id,
      bodyLength: 0.02,
    });
    const flat = flattenRocket(out);
    const m = flat.find((p) => p.component.id === id)!;
    const host = flat.find((p) => p.component.id === tube.id)!;

    expect(m.xFore).toBeLessThanOrEqual(host.xFore + host.length + 1e-9);
    expect(m.xFore).toBeGreaterThanOrEqual(host.xFore - 1e-9);
    // Clamped to the aft face, NOT re-derived to the 32.51% default — those are different answers
    // and only one of them respects what the flyer asked for.
    expect(m.xFore - host.xFore).toBeCloseTo(host.length, 9);
    expect((m.xFore - host.xFore) / host.length).not.toBeCloseTo(0.3251, 4);
  });

  it("leaves a mass the DESIGN FILE brought exactly where the file put it — including where that is wrong", async () => {
    // **The reason this is a rule about AUTHORED masses and not a blanket clamp.** 12 of the 56
    // design-arrived mass objects in the corpus already leave their host's span as their own file
    // states them — `APEX_K_Dart.ork`'s "Avionics 1" and "Ejection Charge" among them. A clamp over
    // every mass would silently rewrite another tool's geometry, which is the one thing Loft does not
    // do to a number a file states.
    //
    // **READ THIS BEFORE TRUSTING THE NAME: on this fixture, the position this case pins is one the
    // flyer cannot build.** The pre-push review caught it. The starter's own mass sits at `top` 0.15
    // in a 0.70 m tube; shrink that tube to 20 mm and the assertion below green-checks a 70 g point
    // mass roughly 130 mm BEHIND the tail, with CG and static margin carrying it. That is the same
    // Sev-1 this file's other cases close for authored masses, still live for design-arrived ones,
    // and **nothing in the app owns it** — the shrink clamp is `isRing` and `RING_KINDS` has no
    // `masscomponent`. It is in `BACKLOG.md`.
    //
    // The case is kept as written anyway, because what it controls is the seating pass OVER-reaching,
    // and that control has to assert the file's number survives. What is added is this paragraph: an
    // assertion that passes BECAUSE a defect is present, under a name that reads like coverage, is
    // worse than no assertion — so the name and the comment both say which it is.
    const doc = await load(SINGLE);
    const tube = primaryBodyTube(doc.rocket)!;
    const before = new Map(
      flattenRocket(doc.rocket)
        .filter((p) => p.component.kind === "masscomponent")
        .map((p) => [p.component.id, p.xFore - (flattenRocket(doc.rocket).find((q) => q.component.children.some((c) => c.id === p.component.id))?.xFore ?? 0)]),
    );
    const { edits } = author(doc.rocket, tube.id);
    const out = applyGeometryEdits(doc.rocket, { ...edits, bodyTubeId: tube.id, bodyLength: 0.02 });
    let checked = 0;
    for (const p of flattenRocket(out)) {
      if (p.component.kind !== "masscomponent") continue;
      const was = before.get(p.component.id);
      if (was === undefined) continue; // the authored one, which is the other two cases' business
      const host = flattenRocket(out).find((q) => q.component.children.some((c) => c.id === p.component.id));
      checked++;
      expect(p.xFore - (host?.xFore ?? 0), `${p.component.name} was moved by the seating pass`).toBeCloseTo(was, 9);
    }
    // **The denominator, because every assertion above sits behind a `continue`.** This fixture
    // carries one design-arrived mass ("Altimeter + battery"); a fixture that lost it would run zero
    // assertions and stay green, which is the shape the corpus sweep already guards against with its
    // own per-branch counters. It is the only control for "do not rewrite another tool's geometry".
    expect(checked, "no design-arrived mass was examined — this case proves nothing").toBeGreaterThan(0);
  });
});

describe("a part the DIMENSION FIELDS made", () => {
  const SINGLE2 = "fixtures/demo-single-deploy.ork";
  const load2 = async (f: string) => importOrk(readFileSync(resolve(process.cwd(), f)));

  it("takes no authoring gesture, and says why instead of saying it is gone", async () => {
    // **R12 increment 24.** A boattail from `boattailLength`/`boattailAftDiameter`, a drogue from the
    // dual-deploy pair and a payload bay from `payloadMassKg` are appended by `applyDimensionEdits`,
    // AFTER `structureOf` has run — so they are in the tree the diagram draws and NOT in the tree
    // `addPartAfter` resolves an anchor against. Asked of the flown tree alone, `addOptionsFor`
    // answered "offered" for three of the six kinds, the panel drew live controls, and every click
    // returned in silence: no part, no refusal, no undo step. **3 dead controls on every design.**
    const doc = await load2(SINGLE2);
    const edits = { boattailLength: 0.06, boattailAftDiameter: 0.02 };
    const flown = applyGeometryEdits(doc.rocket, edits);
    const structural = structureOf(doc.rocket, edits);

    const addressable = new Set(flattenRocket(structural).map((p) => p.component.id));
    const boattail = flattenRocket(flown).find((p) => !addressable.has(p.component.id));
    expect(boattail, "the dimension edits synthesised no part — this case would prove nothing").toBeTruthy();

    // Without the addressable set — today's behaviour for any caller that has none — the flown tree
    // says yes to three kinds. This is the control living inside the case: it fails if the defect
    // stops being reachable, so the assertion below cannot quietly become vacuous.
    const blind = addOptionsFor(flown, boattail!.component.id);
    expect(blind.filter((o) => o.offered).length).toBeGreaterThan(0);

    // With it, every kind is refused, and the reason names what the part IS.
    const seen = addOptionsFor(flown, boattail!.component.id, addressable);
    expect(seen.every((o) => !o.offered)).toBe(true);
    for (const o of seen) {
      expect(o.reason).toContain("made by the design fields");
      // NOT "no longer in this design" — the diagram is drawing it, so that sentence is one the
      // flyer can see is false, and it is what the remove control used to say about the same part.
      expect(o.reason).not.toContain("no longer in this design");
    }

    // A part the design DOES carry is unaffected, or the rule would have closed the editor.
    const tube = primaryBodyTube(flown)!;
    expect(addOptionsFor(flown, tube.id, addressable).some((o) => o.offered)).toBe(true);
  });

  it("is reachable from the part itself, on the one of the three that has a panel, by the fields that make it", async () => {
    // **R12 increment 25.** Increment 24 stopped the add and remove controls lying about these three;
    // this is the half that gives the flyer something instead. `propertiesFor` resolved a picked id
    // against `structureOf`'s tree alone and these parts are not in it, so it returned null — and a
    // null there means NO Properties control at all. A flyer could see a Boattail on the diagram,
    // click it, and be offered nothing, on every design that sets one of the six fields.
    //
    // Driven on all three at once, because they are three synthesisers with one shape and increment
    // 24's defect was that a rule applied to some of them and not the rest.
    const doc = await load2(SINGLE2);
    const edits = {
      boattailLength: 0.06,
      boattailAftDiameter: 0.02,
      payloadMassKg: 0.12,
      mainDeployAltitude: 150,
      drogueDiameter: 0.25,
    };
    const flown = applyGeometryEdits(doc.rocket, edits);
    const structural = structureOf(doc.rocket, edits);
    const addressable = new Set(flattenRocket(structural).map((p) => p.component.id));

    // Every part the flown tree carries that the structural one does not — the synthesised set, found
    // by difference rather than by name, so a fourth one added later joins this case automatically
    // instead of being silently exempt from it.
    const synthesised = flattenRocket(flown).filter((p) => !addressable.has(p.component.id));
    expect(synthesised.map((p) => p.component.name).sort()).toEqual(["Boattail", "Drogue", "Payload"]);

    // **Every synthesised part is ADDRESSABLE — the registry accounts for all three.** Separate from
    // the aim below, and it is the half that must never regress: a fourth synthesised part with no
    // registry entry is the increment-24 defect returning, and it would show up here rather than in
    // the aim loop, which only speaks for the parts that have a panel.
    for (const p of synthesised) {
      const entry = DERIVED_PARTS.find((d) => derivedPartId(
        flattenRocket(flown).find((q) => q.component.id !== p.component.id &&
          derivedPartId(q.component.id, d.suffix) === p.component.id)?.component.id ?? "",
        d.suffix,
      ) === p.component.id);
      expect(entry, `${p.component.name} is synthesised and no DERIVED_PARTS entry mints its id`).toBeTruthy();
    }

    // **All three have a property surface as of increment 27**, and the list is asserted rather than
    // the count, so this line says WHICH parts the capability reaches rather than how many. It read
    // `["Boattail"]` from increment 25 until 27: 25 shipped the boattail and WITHDREW the other two at
    // its own pre-push review, because the per-aim mask blanked `designDims` by subtraction and would
    // have carried the MAIN canopy's `Cd` onto a drogue panel. 27 made the mask an allowlist, which is
    // what let the other two land. The loop below is the reason this matters: it now runs three times
    // instead of once, and each pass is a different part proving its own fields make it.
    const aimed = synthesised.filter((p) => derivedPartAim(flown, p.component.id) !== null);
    // Tree order, not registry order: `flattenRocket` reaches the drogue beside the main canopy, then
    // the payload inside its tube, then the boattail appended at the aft end. The first draft wrote
    // the registry's order and went red, which is the assertion doing its job on its own author.
    expect(aimed.map((p) => p.component.name)).toEqual(["Drogue", "Payload", "Boattail"]);

    for (const p of aimed) {
      const aim = derivedPartAim(flown, p.component.id);
      expect(aim, `${p.component.name} resolves to no field group, so it gets no Properties panel`).toBeTruthy();
      // **The group named has to be the group WITHOUT WHICH this part does not exist**, not merely a
      // group — a resolver answering "boattail" for everything satisfies a truthiness check and then
      // opens the wrong two fields. Asserted behaviourally rather than by comparing names: clearing
      // exactly this aim's fields has to make exactly this part stop existing, and leave the other
      // two standing.
      //
      // *Stated that way rather than as "the group that MAKES it", which is what a first draft said
      // and is stronger than what this checks: the whole list is cleared at once, so an entry
      // carrying a field that makes nothing on its own still passes. `payload` is exactly that case
      // — `payloadStation` positions the bay and a station with no mass makes nothing — and the
      // registry's own docblock says so.*
      const entry = DERIVED_PARTS.find((e) => e.aim === aim)!;
      const without: Record<string, unknown> = { ...edits };
      for (const f of entry.fields) delete without[f];
      const rebuilt = flattenRocket(applyGeometryEdits(doc.rocket, without as typeof edits));
      expect(
        rebuilt.some((q) => q.component.id === p.component.id),
        `clearing ${entry.fields.join(" and ")} left ${p.component.name} standing, so that is not what makes it`,
      ).toBe(false);
      // ...and the other two survive it, or "clearing these fields removes this part" would be true
      // of a bag that cleared everything.
      for (const other of synthesised) {
        if (other.component.id === p.component.id) continue;
        expect(
          rebuilt.some((q) => q.component.id === other.component.id),
          `clearing the ${aim} fields also took ${other.component.name} away`,
        ).toBe(true);
      }
    }

    // A part with a `null` aim gets NO Properties control rather than one that opens on nothing —
    // asserted directly, because "the popover is empty" and "there is no popover" look identical in
    // a screenshot and are opposite outcomes. `propertiesFor` returns null on a null aim, and null
    // there is what makes `GeometryInspector` draw no trigger at all.
    for (const p of synthesised) {
      if (aimed.includes(p)) continue;
      expect(derivedPartAim(flown, p.component.id), `${p.component.name} must answer null, not an aim with no panel`).toBeNull();
    }

    // **The control, over EVERY part the design itself carries rather than one of them.** A resolver
    // answering "boattail" for anything it is handed passes a single-part check by luck; it cannot
    // pass this. `aimEditsAt` is what answers for these, and it still does.
    for (const p of flattenRocket(structural)) {
      expect(
        derivedPartAim(flown, p.component.id),
        `${p.component.name || p.component.kind} is a part the design carries and resolved to a derived aim`,
      ).toBeNull();
    }
    const tube2 = primaryBodyTube(flown)!;
    expect(Object.keys(aimEditsAt(structural, tube2.id))).toEqual(["bodyTubeId"]);

    // And an id belonging to nothing answers null rather than throwing — the ordinary case for a
    // moment after a removal, exactly as `addOptionsFor` documents for its own lookup.
    expect(derivedPartAim(flown, "not-a-part")).toBeNull();
  });

  it("only promises a Properties panel on the part that has one", async () => {
    // **The sentence has two arms and each is wrong on the other's part.** A boattail's refusal says
    // "Its own fields are under Properties" and that is where they are; the drogue's and the
    // payload's say the same thing over a part `GeometryInspector` draws NO trigger for, because
    // `derivedPartAim` returns null and `propertiesFor` returns null with it. Advice pointing at a
    // control that is not on screen is the same defect increment 24 fixed, pointing the other way —
    // and the first draft of increment 25 shipped it. Caught by its own pre-push review.
    const doc = await load2(SINGLE2);
    const edits = {
      boattailLength: 0.06,
      boattailAftDiameter: 0.02,
      payloadMassKg: 0.12,
      mainDeployAltitude: 150,
      drogueDiameter: 0.25,
    };
    const flown = applyGeometryEdits(doc.rocket, edits);
    const structural = structureOf(doc.rocket, edits);
    const addressable = new Set(flattenRocket(structural).map((p) => p.component.id));
    const synthesised = flattenRocket(flown).filter((p) => !addressable.has(p.component.id));

    for (const p of synthesised) {
      const name = p.component.name;
      const hasPanel = derivedPartAim(structural, p.component.id) !== null;
      const [seen] = addOptionsFor(flown, p.component.id, addressable);
      // Both arms name the part and both refuse all three gestures — that half does not vary.
      expect(seen.reason).toContain(name);
      expect(seen.reason).toContain("attached to it, taken off it, or moved here");
      if (hasPanel) {
        expect(seen.reason, `${name} has a panel and its refusal does not send the flyer to it`).toContain("under Properties");
      } else {
        expect(seen.reason, `${name} has NO panel and its refusal points at one`).not.toContain("under Properties");
        expect(seen.reason).toContain("Clear the field that creates it");
      }
    }
    // **Every synthesised part falls on the panel arm now, and that is asserted rather than left to
    // the loop's silence.** Until increment 27 this line read `arms.size === 2` — a control saying the
    // loop above had exercised BOTH branches, which it could, because two of the three parts had no
    // panel. With all three panelled that control can no longer hold, and keeping it would have meant
    // withholding a panel to satisfy a test. It is replaced by the stronger statement the increment
    // actually earns: nothing synthesised is refused with the no-panel sentence any more.
    const arms = new Set(synthesised.map((p) => derivedPartAim(structural, p.component.id) !== null));
    expect([...arms], "a synthesised part has no property panel").toEqual([true]);
    // ...and the arm that is now unreachable through the registry is still RIGHT, driven directly.
    // `derivedPartRefusal` keeps both because a fourth field-made part will land addressable before it
    // lands editable, exactly as these three did — and an arm nothing drives is an arm that rots.
    const noPanel = derivedPartRefusal("Streamer", false);
    expect(noPanel).toContain("Streamer");
    expect(noPanel).not.toContain("under Properties");
    expect(noPanel).toContain("Clear the field that creates it");
  });

  it("shows a field-made part its own dimensions and blanks every other component's", () => {
    // **The mask is what increment 25 had to withdraw two panels over, and it could not be driven.**
    // It was an inline expression inside a component, in a repo with no component tests, so the only
    // thing that could catch `mainParachuteCd` surviving a drogue popover was a human opening one.
    // `maskAimedDims` is that expression extracted; this is the case that drives it.
    //
    // **The key space is READ OUT of the type rather than listed here.** A second copy of 67 field
    // names is precisely the drift `AIM_SLOTS`' docblock records, and a hand-written copy would go on
    // passing while the real type grew a key the allowlist had never heard of — which is the exact
    // shape of the defect this increment exists to remove. Parsed from `components/LoftApp.tsx`, for
    // the same reason the case below reads its `only ===` gates from there: that is where it lives.
    const src = readFileSync(resolve(process.cwd(), "components", "LoftApp.tsx"), "utf8");
    const start = src.indexOf("  designDims: {");
    const block = src.slice(start, src.indexOf("\n  };\n}) {", start));
    const decl = [...block.matchAll(/^\s{4}(\w+)(\?)?:/gm)].map((m) => ({ key: m[1], optional: !!m[2] }));
    expect(decl.length, "no designDims keys parsed out of LoftApp.tsx — this case would prove nothing").toBeGreaterThan(50);

    // Every key set to a sentinel, so a surviving value is distinguishable from a blanked one by
    // identity rather than by whether it happens to be falsy.
    const full = Object.fromEntries(decl.map((d) => [d.key, `<${d.key}>`]));
    const survivors = (aim: string) =>
      Object.entries(maskAimedDims(full, aim, { finSetId: ["finSpan", "finStation"], nose: ["noseLength"] }))
        .filter(([, v]) => v !== undefined)
        .map(([k]) => k)
        .sort();

    // 1. A derived aim keeps its own `dims` and the structural keys, and NOTHING else. Asserted as an
    //    exact set, because "the leak is gone" is a claim about what is absent.
    for (const entry of DERIVED_PARTS) {
      if (entry.aim === null) continue;
      expect(survivors(entry.aim), `the ${entry.aim} panel sees the wrong dimensions`).toEqual(
        [...DIMS_STRUCTURAL, ...entry.dims].sort(),
      );
    }

    // 2. The four keys that made increment 25 withdraw the drogue's panel are the reason for the case.
    //    Named individually rather than left to the set comparison above, so a failure says WHICH.
    for (const leak of ["mainParachuteCd", "mainParachuteMass", "mainParachuteCdFrom", "mainParachuteMassFrom"]) {
      expect(decl.some((d) => d.key === leak), `${leak} is no longer a designDims key — re-point this case`).toBe(true);
      expect(survivors("drogue"), `the drogue's panel carries the MAIN canopy's ${leak}`).not.toContain(leak);
    }

    // 3. CONTROL, and it is the one that matters: every key the type declares NON-OPTIONAL survives
    //    every aim. `massCarriedBy` is read as `designDims.massCarriedBy.<x>` at thirty-odd sites with
    //    no guard, so an allowlist that forgot it renders a TypeError rather than a thin panel — a
    //    worse outcome than the leak. The list is checked against the type, not against itself.
    const required = decl.filter((d) => !d.optional).map((d) => d.key).sort();
    expect(required, "a non-optional designDims key is missing from DIMS_STRUCTURAL").toEqual([...DIMS_STRUCTURAL].sort());

    // 4. And the SLOT aims still work by subtraction, unchanged — a fin popover keeps its own two
    //    fields and drops the nose's, while every unaimed key rides along, which is what the
    //    hand-written fieldset gates rely on. Without this the case would say nothing about the nine
    //    surfaces the increment did not touch.
    expect(survivors("finSetId")).toContain("finSpan");
    expect(survivors("finSetId")).toContain("massCarriedBy");
    expect(survivors("finSetId")).not.toContain("noseLength");
    expect(survivors("finSetId")).toContain("mainParachuteCd");
  });

  it("names an aim the editor actually has a fieldset for", () => {
    // **The registry and the JSX are two files, and nothing else holds them together.** The aim is a
    // plain string: `DERIVED_PARTS`' `aim` feeds `AIM_FIELDS`, and the fieldsets that render the
    // group are gated by hand-written `only === "<aim>"` comparisons in `components/LoftApp.tsx`.
    // Rename the registry entry and every assertion in this file still passes — `derivedPartAim`
    // returns the new spelling, the test looks the entry back up by it, and the popover opens empty
    // on the one part this milestone exists to give a panel to. Asserted against the source text
    // because that is where the other half of the pair lives; there is nowhere else to read it from.
    const src = readFileSync(resolve(process.cwd(), "components", "LoftApp.tsx"), "utf8");
    const aims = DERIVED_PARTS.map((d) => d.aim).filter((a): a is DerivedPartAim => a !== null);
    expect(aims.length, "no derived part has a panel — this case would prove nothing").toBeGreaterThan(0);
    for (const aim of aims) {
      expect(
        src.includes(`only === "${aim}"`),
        `DERIVED_PARTS names the aim "${aim}" and no fieldset in LoftApp.tsx is gated on it`,
      ).toBe(true);
    }
    // And the reverse, so a gate cannot outlive the entry that justified it: every `only === "x"` in
    // that file has to be an AIM_SLOTS key, "nose", or a registry aim. A stale gate is dead JSX that
    // reads as a live capability to whoever finds it next.
    const gated = [...src.matchAll(/only === "([a-zA-Z]+)"/g)].map((m) => m[1]);
    const known = new Set([...Object.keys(AIM_SLOTS), "nose", ...aims]);
    for (const g of new Set(gated)) {
      expect(known.has(g), `LoftApp.tsx gates a fieldset on only === "${g}", which is nobody's aim`).toBe(true);
    }
  });

  it("keeps the id a synthesised part is addressed by identical to the one it is built with", async () => {
    // The spelling used to be written out at all three synthesis sites and nowhere else, so a
    // resolver had to restate it a fourth time. `derivedPartId` is the one spelling now; this asserts
    // the two directions still meet, which is the only thing standing between a picked boattail and
    // a popover that opens on nothing.
    const doc = await load2(SINGLE2);
    const edits = { boattailLength: 0.06, boattailAftDiameter: 0.02 };
    const flown = applyGeometryEdits(doc.rocket, edits);
    const tube = primaryBodyTube(doc.rocket)!;
    const built = flattenRocket(flown).find((p) => p.component.name === "Boattail")!;
    expect(built.component.id).toBe(derivedPartId(tube.id, "boattail"));
    // **The round trip, which is the half the line above cannot pin.** `addBoattail` now calls the
    // same `derivedPartId` with the same literal, so a changed suffix or a changed hash moves both
    // sides of that equality together and it stays green — all it really asserts is that the host is
    // the aft-most tube. Asking the RESOLVER instead closes the loop the popover actually walks.
    expect(derivedPartAim(flown, built.component.id)).toBe("boattail");
    expect(derivedPartAim(structureOf(doc.rocket, edits), built.component.id)).toBe("boattail");
    // UUID-shaped, because `lib/ork/export.ts` rewrites anything else on the way out and a design
    // built here is persisted as its own exported bytes — so a non-UUID id changes on every save and
    // the selection, the aim and the undo naming this part all stop resolving after a reload.
    expect(built.component.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
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

describe("where a mass came from, after an edit replaces it", () => {
  /** **The provenance has to move with the number, and in a first version it did not.** The field is
   *  set by the three importers, and every path that REPLACES a mass afterwards has to say so or the
   *  old claim stands over the new figure: a canopy the design stated 100 g for went on reading
   *  "stated by the design" at the catalogue's weight, and a lug the flyer weighed themselves went on
   *  being credited to the source tool. Both were found by the pre-push review, by rendering the row
   *  rather than by reading the caller — the fitting one because `withFitting`'s parameter list
   *  omitted the field while its caller computed it, so it was dropped in silence. */
  it("credits a typed fitting mass to the flyer, not to the importer", () => {
    const doc = newDesign();
    const aft = doc.rocket.stages[0].components.filter((c) => c.kind === "bodytube").at(-1)!;
    const lug: RocketComponent = {
      id: "lug-1", name: "Rail guide", kind: "launchlug",
      placement: { method: "bottom", offset: -0.05 },
      mass: 0.006, massFrom: "tool", radius: 0.005, length: 0.02, instanceCount: 1, children: [],
    } as RocketComponent;
    aft.children.push(lug);
    const after = applyGeometryEdits(doc.rocket, { fittingId: "lug-1", fittingMass: 0.004 });
    const out = flattenRocket(after).find((p) => p.component.id === "lug-1")!.component as {
      mass?: number; massFrom?: string;
    };
    expect(out.mass).toBeCloseTo(0.004, 9);
    expect(out.massFrom, "the source tool was credited with a figure the flyer typed").toBe("flyer");
  });

  it("credits a catalogued canopy's published weight to the pick, not to the design", () => {
    const doc = newDesign();
    const chute = flattenRocket(doc.rocket).find((p) => p.component.kind === "parachute")!.component as {
      id: string; mass: number; massFrom?: string;
    };
    chute.massFrom = "stated";
    const after = applyGeometryEdits(doc.rocket, {
      parachuteId: chute.id,
      catalogParachute: {
        manufacturer: "Fruity Chutes", partNumber: "IFC-36", diameter: 0.914, mass: 0.1,
      } as never,
    });
    const out = flattenRocket(after).find((p) => p.component.id === chute.id)!.component as {
      mass: number; massFrom?: string;
    };
    expect(out.mass, "the vendor's published weight must land").toBeCloseTo(0.1, 9);
    expect(out.massFrom, "the design was credited with the catalogue's figure").toBe("flyer");
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

  it("does not put the flyer's note on a part Loft invented", () => {
    // **The note travels with `structuredClone`, and `lib/ork/export.ts` now writes it out.** The
    // seed tube and its kept children are cloned from the design's own aft tube, whose author may
    // have written on them: 40 non-empty `<comment>` elements across 18 of the 27 corpus `.ork`
    // designs, and `Dual parachute deployment.ork`'s sits on the fin set hanging off exactly that
    // tube. Cloned through, a booster the flyer authored comes out annotated with prose about a
    // component that has never existed — over their name, in a file they hand to someone else.
    const doc = newDesign();
    const aft = doc.rocket.stages[0].components.filter((c) => c.kind === "bodytube").at(-1)!;
    aft.comment = "Blue Tube 2.0 — this one is the flight-proven tube.";
    for (const k of aft.children) k.comment = `note on ${k.name}`;
    const seedId = newPartId(doc.rocket, [], "stage:1");
    const mountId = newPartId(doc.rocket, [{ id: seedId } as never], "mount:1");
    const staged = applyGeometryEdits(doc.rocket, { addedStages: [{ seedId, mountId, name: "Booster" }] });

    const booster = staged.stages.at(-1)!;
    const notes: string[] = [];
    const walk = (comps: readonly RocketComponent[]): void => {
      for (const c of comps) {
        if (c.comment) notes.push(`${c.kind} "${c.name}": ${c.comment}`);
        walk(c.children);
      }
    };
    walk(booster.components);
    expect(notes, "notes carried onto parts Loft authored").toEqual([]);
    // The control: the design's OWN parts keep theirs, so this is not passing by there being none.
    const kept: string[] = [];
    const walkKept = (comps: readonly RocketComponent[]): void => {
      for (const c of comps) {
        if (c.comment) kept.push(c.comment);
        walkKept(c.children);
      }
    };
    walkKept(staged.stages[0].components);
    expect(kept.length, "the design's own notes must survive the same edit").toBeGreaterThan(1);
  });

  it("gives every part it mints its own id, even when the seed tube carries two mounts", () => {
    // **A design's aft tube can hold more than one motor mount**, and `Airstart timing.ork` in the
    // corpus does: a 54 mm centre and a 38 mm airstart, side by side. Every kept mount used to take
    // the entry's single `mountId`, so the booster came out holding two components indistinguishable
    // by the only handle anything outside the tree has — and `lib/sim/setup.ts` resolved the
    // booster's K550W instance to whichever of the pair its id map kept. A 54 mm motor loaded into a
    // 38.7 mm bore, on a stage Loft had just authored, flown as a normal flight.
    //
    // Built here rather than read from the corpus so the case is pinned in the committed suite,
    // where CI can see it: the corpus is not fetched for every job.
    const base = newDesign();
    const aft = base.rocket.stages[0].components.filter((c) => c.kind === "bodytube").at(-1)!;
    const mount = aft.children.find((c) => "motorMount" in c && c.motorMount !== undefined)!;
    const twoMount = structuredClone(base.rocket);
    const twoAft = twoMount.stages[0].components.filter((c) => c.kind === "bodytube").at(-1)!;
    twoAft.children = [
      ...twoAft.children,
      { ...structuredClone(mount), id: `${mount.id}-second`, name: "second mount" },
    ];

    const seedId = newPartId(twoMount, [], "stage:1");
    const mountId = newPartId(twoMount, [{ id: seedId } as never], "mount:1");
    const staged = applyGeometryEdits(twoMount, { addedStages: [{ seedId, mountId, name: "Booster" }] });

    const ids: string[] = [];
    const walk = (comps: typeof staged.stages[0]["components"]): void => {
      for (const c of comps) {
        ids.push(c.id);
        if (c.children.length) walk(c.children);
      }
    };
    staged.stages.forEach((st) => walk(st.components));
    const duplicated = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(duplicated, "the authored stage minted two parts with the same id").toEqual([]);

    // And the booster really did carry both mounts across — a fix that silently dropped the second
    // one would also produce no duplicates, and would be a different bug wearing this test's pass.
    const boosterMounts = staged.stages[1].components[0].children.filter(
      (c) => "motorMount" in c && c.motorMount !== undefined,
    );
    expect(boosterMounts).toHaveLength(2);
    expect(boosterMounts[0].id).toBe(mountId);
    expect(boosterMounts[1].id).not.toBe(mountId);
  });

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

describe("material catalogues carry their provenance", () => {
  /** The densities set authored-part mass, and mass feeds every number downstream of it. Until
   *  2026-08-02 they were "representative engineering figures" with nothing behind them, in a repo
   *  whose physics is otherwise cited line by line. The rule is not that every figure must be
   *  sourced — several of these genuinely cannot be, because a wound rocketry tube's density is set
   *  by its winding rather than by a material anyone publishes — but that a figure with nothing
   *  behind it must SAY so rather than read like the ones that do. */
  for (const [name, table] of [
    ["FIN_MATERIALS", FIN_MATERIALS],
    ["AIRFRAME_MATERIALS", AIRFRAME_MATERIALS],
  ] as const) {
    it(`${name}: every row says where its density came from`, () => {
      expect(table.length).toBeGreaterThan(0);
      for (const row of table) {
        expect(row.source.trim().length, `${row.label} has no source`).toBeGreaterThan(0);
        expect(row.density, `${row.label} has a non-positive density`).toBeGreaterThan(0);
        if (!row.sourced) {
          expect(row.source, `${row.label} is unsourced but does not say so`).toMatch(
            /NO PUBLISHED|typical|representative|as FIN_MATERIALS/i,
          );
        }
      }
    });
  }

  it("keeps Blue Tube's composition an open question rather than a guess", () => {
    // Its name was "vulcanised fibre", which is a guess — the vendor publishes no composition, and
    // Apogee's own copy says only that it is *suspected* to be a vulcanised cellulose fibre. The
    // name is also what the flutter estimate matches on, so a wrong one is a wrong stiffness with a
    // confident label on it.
    const blue = AIRFRAME_MATERIALS.find((m) => m.key === "bluetube");
    expect(blue).toBeDefined();
    expect(blue!.name).not.toMatch(/vulcanis|vulcaniz/i);
    expect(blue!.source).toMatch(/publishes no composition/i);
  });
});

describe("a catalogued part's published wall and stock", () => {
  const tube = (r: Rocket) =>
    flattenRocket(r).find((x) => x.component.kind === "bodytube")!.component as BodyTube;

  // **Read out of the shipped catalogue rather than typed here**, because a hand-written "vendor's
  // figure" is not one. The first draft of this test invented a density (848.98) that appears in no
  // row, and the roadmap entry it produced quoted a 0.27 mm wall where the real one is 0.533 —
  // numbers that were arithmetically self-consistent and reproducible from nothing.
  const PART = (() => {
    const p = findParts("BT-60")[0];
    if (!p || p.outerDiameter === undefined || p.innerDiameter === undefined || p.length === undefined) {
      throw new Error("BT-60 missing from the catalogue — this test asserts against real data");
    }
    const m = materialOf(p);
    return {
      manufacturer: p.manufacturer,
      partNumber: p.partNumber,
      outerDiameter: p.outerDiameter,
      innerDiameter: p.innerDiameter,
      length: p.length,
      ...(m ? { material: { name: m.name, density: m.density } } : {}),
      ...(p.mass !== undefined ? { mass: p.mass } : {}),
    };
  })();

  it("lands on the tube the body fields are aimed at, and changes its mass", async () => {
    // R8's *done when*: the chosen part's dimensions AND MATERIAL populate the model. The material
    // half needs its own field because the catalogue's names have zero overlap with the seven
    // `AIRFRAME_MATERIALS` keys, so a pick cannot travel through `airframeMaterial` without being
    // snapped onto a generic figure.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const before = tube(doc.rocket);

    const built = applyGeometryEdits(doc.rocket, {
      bodyDiameter: PART.outerDiameter,
      bodyLength: PART.length,
      catalogBodyTube: PART,
    });
    const after = tube(built);

    expect(after.material?.name, "the vendor's own stock, not a category").toBe(PART.material!.name);
    // 782.88 kg/m3 — Rocketarium's spiral kraft glassine, read from the catalogue above.
    expect(after.material?.density).toBe(PART.material!.density);
    expect(after.material?.density).toBeCloseTo(782.88, 2);
    // The wall is DERIVED from the two published diameters — the catalogue states no thickness for
    // any of its 1,089 body tubes. A BT-60's is 0.533 mm.
    expect(after.thickness).toBeCloseTo((PART.outerDiameter - PART.innerDiameter) / 2, 9);
    expect((after.thickness ?? 0) * 1000).toBeCloseTo(0.533, 2);
    expect(after.outerRadius).toBeCloseTo(PART.outerDiameter / 2, 9);
    expect(after.thickness).not.toBe(before.thickness);
  });

  it("is not scaled by the caliber what-if, because a real tube's wall is not a ratio", () => {
    // Asserted against `scaleAirframeRadii`'s OWN behaviour rather than against the assignment that
    // happens to run after it: the caliber edit below more than doubles the tube, so a wall that
    // scaled would be unmistakable, and the published figure is what must survive.
    // `scaleAirframeRadii` multiplies `outerRadius` and never `thickness`. That is load-bearing
    // here rather than incidental: an Estes BT-60's wall is 0.27 mm whatever else the airframe does,
    // so a wall that scaled with a caliber edit would report a mass the vendor never published.
    const r: Rocket = {
      name: "Wall test",
      configurations: [],
      referenceType: "maximum",
      stages: [
        {
          name: "S",
          components: [
            {
              id: "t", name: "Body", kind: "bodytube", placement: { method: "after", offset: 0 },
              length: 0.3, outerRadius: 0.02, thickness: 0.001, children: [],
            } as BodyTube,
          ],
        },
      ],
    };
    const built = applyGeometryEdits(r, {
      bodyTubeId: "t",
      bodyDiameter: PART.outerDiameter,
      bodyLength: PART.length,
      catalogBodyTube: PART,
    });
    const t = tube(built);
    expect(t.thickness).toBeCloseTo((PART.outerDiameter - PART.innerDiameter) / 2, 9);
  });

  it("keeps the design's own stock when the pick carries no usable density", async () => {
    // 18 catalogued parts state a density that cannot describe matter and `materialOf` refuses them.
    // **None of the 18 is a body tube** — measured, 0 of 1,089 — so this path is defence rather than
    // a state today's picker can reach, and saying so is the point: the roadmap first claimed the
    // picker surfaces it for tubes, which is not true. It is asserted because the catalogue is
    // re-cut against newer upstream commits and a refused density can arrive on a tube at any time,
    // and because a pick with a material and no WALL flies as a SOLID ROD in `lib/sim/mass.ts`.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const before = tube(doc.rocket);
    const built = applyGeometryEdits(doc.rocket, {
      bodyDiameter: PART.outerDiameter,
      bodyLength: PART.length,
      catalogBodyTube: { ...PART, material: undefined },
    });
    const after = tube(built);
    expect(after.material?.name).toBe(before.material?.name);
    expect(after.thickness).toBe(before.thickness);
  });

  it("refuses a wall at least as wide as the tube it lands on", () => {
    // Reachable without any bad data: `bodyDiameter` scales the whole airframe and is also a sweep
    // axis, so a flyer who picks a wide tube and then narrows the design crosses it. Left unguarded,
    // `lib/sim/mass.ts` clamps the inner radius at 0 and flies a SOLID ROD — the exact failure the
    // wall exists to prevent, from the other side.
    const r: Rocket = {
      name: "Guard", configurations: [], referenceType: "maximum",
      stages: [{ name: "S", components: [{
        id: "t", name: "Body", kind: "bodytube", placement: { method: "after", offset: 0 },
        length: 0.3, outerRadius: 0.02, thickness: 0.001, children: [],
      } as BodyTube] }],
    };
    // An 8.94 mm wall (a real row: Estes 31361, OD 48.8 / ID 30.9) on a tube taken down to 17 mm.
    const wide = { ...PART, outerDiameter: 0.048768, innerDiameter: 0.030886 };
    const built = applyGeometryEdits(r, { bodyTubeId: "t", bodyDiameter: 0.017, catalogBodyTube: wide });
    const t = tube(built);
    expect(t.thickness, "the impossible wall is refused, not clamped downstream").toBe(0.001);
    expect(t.material?.name, "the stock still lands").toBe(PART.material!.name);
  });

  it("flies the vendor's OWN published weight where they publish one", async () => {
    // Seven body tubes state a mass and every one disagrees with the figure derived from their own
    // geometry and stock by 3-5x — PS-7.5 publishes 589.7 g against 116.7 g derived. The vendor's is
    // the number they will weigh, and the derived one under a caption naming the part would be a
    // confident wrong mass on the figure CG, stability and apogee all sit on.
    const pml = findParts("PS-7.5")[0];
    expect(pml?.mass, "the fixture this asserts against still publishes a mass").toBeDefined();
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const built = applyGeometryEdits(doc.rocket, {
      catalogBodyTube: {
        manufacturer: pml.manufacturer, partNumber: pml.partNumber,
        outerDiameter: pml.outerDiameter!, innerDiameter: pml.innerDiameter!,
        length: pml.length!, mass: pml.mass,
        ...(materialOf(pml) ? { material: { name: materialOf(pml)!.name, density: materialOf(pml)!.density } } : {}),
      },
    });
    // `overrideMass`, not a replacement for the subtree — the tube carries its mount, fins and
    // parachute as children and swallowing those would be a far larger error than the one this fixes.
    expect(tube(built).overrideMass).toBe(pml.mass);
    expect(tube(built).overrideSubcomponents).toBeUndefined();
  });

  it("counts as an edit even with both dimension fields blank", () => {
    // It stopped being a pure provenance record the moment it began carrying a wall and a stock, so
    // it came out of `INERT_EDIT_FIELDS` in the same change. If this ever reads false again, a flyer
    // can reach a design that is edited while the app believes it is pristine.
    expect(hasGeometryEdits({ catalogBodyTube: PART })).toBe(true);
    expect(INERT_EDIT_FIELDS.has("catalogBodyTube")).toBe(false);
    // ...but a bag written before the field carried a bore applies nothing, so it must NOT read as
    // edited — otherwise replaying one calls an untouched design edited and withholds the file's own
    // stored-simulation comparison.
    const legacy = { manufacturer: "X", partNumber: "Y", outerDiameter: 0.04, length: 0.3 } as unknown as typeof PART;
    expect(hasGeometryEdits({ catalogBodyTube: legacy })).toBe(false);
    expect(isEditedValue("catalogBodyTube", legacy)).toBe(false);
    expect(isEditedValue("catalogBodyTube", PART)).toBe(true);
  });

});

describe("a catalogued nose cone's published contour, shoulder and stock", () => {
  const nose = (r: Rocket) =>
    flattenRocket(r).find((x) => x.component.kind === "nosecone")!.component as NoseCone;

  // Read out of the shipped catalogue at runtime, for the reason the tube suite above records at
  // length: a hand-written "vendor's figure" is not one, and the first version of that suite quoted
  // a wall and a density that appear in no row.
  const pick = (want: (p: CatalogPart) => boolean): PickedNoseCone => {
    const p = partsOfKind("nosecone").find(want);
    if (
      !p ||
      p.outerDiameter === undefined ||
      p.length === undefined ||
      p.shape === undefined ||
      p.shoulderDiameter === undefined ||
      p.shoulderLength === undefined
    ) {
      throw new Error("no catalogued nose cone matches — this test asserts against real data");
    }
    const m = materialOf(p);
    return {
      manufacturer: p.manufacturer,
      partNumber: p.partNumber,
      outerDiameter: p.outerDiameter,
      length: p.length,
      shape: p.shape,
      shoulderDiameter: p.shoulderDiameter,
      shoulderLength: p.shoulderLength,
      ...(p.filled !== true && p.thickness !== undefined && p.thickness > 0
        ? { thickness: p.thickness }
        : {}),
      ...(p.mass !== undefined && p.mass > 0 ? { mass: p.mass } : {}),
      ...(m ? { material: { name: m.name, density: m.density } } : {}),
    };
  };

  /** **The placeholder must be a FIXED POINT on EVERY catalogued cone, not just the corpus's.**
   *
   *  The corpus sweep already asserts this, and it could not have caught the defect this test exists
   *  for: it drives real design files, and **0 of the 35 carry a cone whose whole-part balance point
   *  sits behind its own base**. The catalogue does — 854 cones, and the shipped vendor geometry puts
   *  some of their balance points into the shoulder. A cone pick is one click from the front door, so
   *  that is the reachable population and this is where the check belongs.
   *
   *  What it caught, on the increment that introduced it: `overrideCGx` became the WHOLE part's
   *  centroid, and both the read clamp (`localBodyCGx`) and the write clamp (`withStatedCG`) still
   *  bounded it by the BODY's length. So the panel showed a balance point the part does not have, and
   *  committing the figure the box already displayed moved the design's CG — the exact
   *  non-idempotency the stated-CG control exists not to have, reintroduced by the change that
   *  claimed to remove it. Bounds are `statedCGBounds` now, drawn around the part that physically
   *  exists.
   *
   *  Mass properties only, no flight: 854 designs is cheap to weigh and expensive to fly. */
  it("every catalogued cone's shown balance point is one the design actually flies at", async () => {
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const all = partsOfKind("nosecone").filter(
      (p) =>
        p.outerDiameter !== undefined &&
        p.length !== undefined &&
        p.shape !== undefined &&
        p.shoulderDiameter !== undefined &&
        p.shoulderLength !== undefined,
    );
    expect(all.length, "the catalogue is present").toBeGreaterThan(500);

    const moved: string[] = [];
    let shouldered = 0;
    let pastBase = 0;
    for (const raw of all) {
      const cone = pick((p) => p === raw);
      if ((cone.shoulderLength ?? 0) > 0) shouldered++;
      const built = applyGeometryEdits(doc.rocket, {
        noseLength: cone.length,
        noseShape: cone.shape,
        catalogNoseCone: cone,
      });
      const id = nose(built).id;
      const shown = localBodyCGx(built, id);
      if (shown === undefined) continue;
      if (shown > cone.length + 1e-9) pastBase++;
      const before = dryMassProperties(built).cg;
      const after = dryMassProperties(applyGeometryEdits(built, { noseCGx: shown })).cg;
      if (Number.isFinite(before) && Number.isFinite(after) && Math.abs(after - before) > 1e-6)
        moved.push(
          `${cone.manufacturer} ${cone.partNumber}: shown ${(shown * 1000).toFixed(2)} mm on a ${((cone.length ?? 0) * 1000).toFixed(2)} mm cone moved the design CG by ${((after - before) * 1000).toFixed(3)} mm`,
        );
    }
    // Stated so an empty population is visible rather than silently passing: if the catalogue ever
    // stops shipping cones whose balance point sits behind their base, this check stops testing
    // anything and the count says so.
    // The direct claim first, so a real non-idempotency reports as one rather than as an empty
    // population; the two counts below then catch the other failure mode, where a bound quietly
    // clamps the interesting cones out of existence and the check above passes by testing nothing.
    expect(moved.slice(0, 5), `the shown balance point is not a fixed point on ${moved.length} cone(s)`).toEqual([]);
    expect(shouldered, "catalogued cones carrying a shoulder").toBeGreaterThan(100);
    expect(pastBase, "cones balancing behind their own base — the population under test").toBeGreaterThan(0);
  });

  /** A SOLID cone — 728 of the 854 are, and it is the case a tube can never be. */
  const SOLID = pick((p) => p.filled === true && p.shoulderLength !== undefined && p.shoulderLength > 0);
  /** One of the 126 that publish a wall instead. */
  const HOLLOW = pick((p) => p.filled !== true && p.thickness !== undefined && p.thickness > 0);
  /** One of the 50 that BUTT rather than plug. */
  const BUTTED = pick((p) => p.shoulderLength === 0);

  it("the catalogue really does state a contour, a base, a shoulder and a stock for every cone", () => {
    // The premise the whole increment rests on, asserted rather than remembered — if a re-cut of the
    // catalogue ever loosens it, the picker's claim ("the whole part as the vendor publishes it")
    // becomes false and this says so before a flyer reads it.
    const cones = partsOfKind("nosecone");
    expect(cones.length).toBeGreaterThan(800);
    for (const c of cones) {
      expect(c.shape, `${c.manufacturer} ${c.partNumber}`).toBeDefined();
      expect(c.outerDiameter).toBeGreaterThan(0);
      expect(c.length).toBeGreaterThan(0);
      expect(c.shoulderDiameter).toBeGreaterThan(0);
      expect(c.shoulderLength).toBeGreaterThanOrEqual(0);
      expect(materialOf(c), "no cone's density was refused").toBeDefined();
      // Solid or walled, exhaustive and disjoint — the fact `PickedNoseCone.thickness` encodes as
      // one optional field rather than a wall plus a flag.
      expect(c.filled === true).not.toBe(c.thickness !== undefined);
    }
  });

  it("resolves a catalogue parachute, and every row it offers can be built", () => {
    const chutes = partsOfKind("parachute");
    console.log(`catalogued parachutes: ${chutes.length}`);
    expect(chutes.length, "no parachute in the bundle").toBeGreaterThan(100);
    let stated = 0;
    let derivable = 0;
    for (const c of chutes) {
      // The two fields the model needs from a canopy, on every row: a flat diameter, and a mass
      // path. Nothing states a `cd`, a packed size, a length or an outer diameter — which is why the
      // picker's shared outer-diameter/length prelude had to move into the per-kind arms, and why a
      // pick edits the chute already on the design rather than authoring a new one.
      expect(c.diameter, `${c.manufacturer} ${c.partNumber} states no diameter`).toBeGreaterThan(0);
      expect(c.length, "a canopy has no length in this catalogue").toBeUndefined();
      expect(c.outerDiameter, "a canopy has no outer diameter in this catalogue").toBeUndefined();
      if (c.mass !== undefined && c.mass > 0) stated++;
      const d = materialOf(c)?.density;
      if (d !== undefined && d > 0) derivable++;
      expect(
        (c.mass !== undefined && c.mass > 0) || (d !== undefined && d > 0),
        `${c.manufacturer} ${c.partNumber} has neither a stated mass nor a usable stock`,
      ).toBe(true);
    }
    console.log(`  ${stated} state a mass, ${derivable} carry a usable canopy stock`);
    expect(stated, "no vendor publishes a canopy weight").toBeGreaterThan(0);
  });

  it("puts a real canopy on the design, keeps the cd it cannot know, and clears the old weighed mass", async () => {
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const chute = (r: Rocket) =>
      flattenRocket(r)
        .map((p) => p.component)
        .find((c) => c.kind === "parachute") as Parachute;
    const before = chute(doc.rocket);

    // Resolved through the shipped data at run time rather than hand-typed. A previous increment
    // asserted "the vendor's published figures" against numbers that appear in no row of the
    // catalogue — arithmetically self-consistent and reproducible from nothing.
    const part = partsOfKind("parachute").find((c) => c.mass !== undefined && c.mass > 0)!;
    expect(part, "no catalogued canopy publishes a weight").toBeDefined();
    const material = materialOf(part)!;
    const picked = {
      manufacturer: part.manufacturer,
      partNumber: part.partNumber,
      diameter: part.diameter!,
      mass: part.mass!,
      material: { name: material.name, density: material.density },
      lineCount: part.lineCount,
      lineLength: part.lineLength,
    };
    expect(usableCatalogParachute(picked)).toBe(true);

    // **The design's canopy is given a weighed mass first**, which is the state 20 of the 37
    // parachute nodes across the corpus are actually in (11 of the 27 `.ork` files). `overrideMass`
    // wins outright in `lib/sim/mass.ts`, so a pick that set `mass` and left it would take the
    // vendor's diameter while flying the OLD weight under a caption naming the new part — the exact
    // Sev-1 the nose-cone increment shipped and had to fix.
    const withOverride: Rocket = {
      ...doc.rocket,
      stages: doc.rocket.stages.map((st) => ({
        ...st,
        components: st.components.map(function tag(c): typeof c {
          if (c.kind === "parachute") return { ...c, overrideMass: 0.0879, overrideCGx: 0.1 };
          return c.children.length ? { ...c, children: c.children.map(tag) } : c;
        }),
      })),
    };
    const tagged = chute(withOverride);
    expect(tagged.overrideMass, "the fixture state this test depends on").toBe(0.0879);

    const built = applyGeometryEdits(withOverride, { catalogParachute: picked });
    const after = chute(built);

    expect(after.diameter).toBeCloseTo(picked.diameter, 9);
    expect(after.area, "a stale reference area would fly the old canopy's drag").toBeUndefined();
    expect(after.mass).toBeCloseTo(picked.mass, 9);
    expect(after.overrideMass, "the replaced canopy's weighed mass must not survive").toBeUndefined();
    expect(after.overrideCGx).toBeUndefined();
    // The coefficient is the design's own, because no vendor in this catalogue publishes one.
    expect(after.cd, "the pick must not invent a drag coefficient").toBe(before.cd);
    expect(after.deployEvent, "a pick changes the canopy, not when it opens").toBe(before.deployEvent);
    expect(after.deployAltitude).toBe(before.deployAltitude);
    console.log(
      `parachute pick: ${picked.manufacturer} ${picked.partNumber} — ` +
        `Ø ${(before.diameter * 1000).toFixed(1)} → ${(after.diameter * 1000).toFixed(1)} mm, ` +
        `mass ${(tagged.overrideMass! * 1000).toFixed(1)} g (overridden) → ${(after.mass * 1000).toFixed(1)} g, ` +
        `cd ${after.cd} unchanged`,
    );
  });

  it("keeps all three recovery edits on ONE canopy, even when the pick makes it the smaller one", async () => {
    // **The defect this pins is the one the applier's own comment used to claim its ordering
    // prevented.** All three recovery edits resolved `primaryParachute` independently, and with no
    // explicit aim that falls back to "the largest canopy". A pick can make the aimed canopy
    // SMALLER than another — 62 of the 151 catalogued canopies are under 460 mm — so the target
    // moved out from under the two steps that follow it: on a dual-deploy design the "Main chute Ø"
    // field, whose placeholder names the main, resized the DROGUE instead and quadrupled its mass.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-dual-deploy.ork")));
    const chutes = (r: Rocket) =>
      flattenRocket(r)
        .map((p) => p.component)
        .filter((c): c is Parachute => c.kind === "parachute");
    const before = chutes(doc.rocket);
    expect(before.length, "the fixture this test needs has two canopies").toBeGreaterThan(1);

    // The largest is the one the unaimed fields resolve to; pick something smaller than the other.
    const main = [...before].sort((a, b) => b.diameter - a.diameter)[0];
    const other = [...before].sort((a, b) => b.diameter - a.diameter)[1];
    const small = partsOfKind("parachute")
      .filter((c) => c.diameter !== undefined && c.diameter < other.diameter)
      .find((c) => c.mass !== undefined && c.mass > 0)!;
    expect(small, "no catalogued canopy is smaller than this design's second chute").toBeDefined();
    const m = materialOf(small)!;
    const picked = {
      manufacturer: small.manufacturer,
      partNumber: small.partNumber,
      diameter: small.diameter!,
      mass: small.mass!,
      material: { name: m.name, density: m.density },
    };

    const typed = 0.9;
    const built = applyGeometryEdits(doc.rocket, {
      catalogParachute: picked,
      mainParachuteDiameter: typed,
    });
    const after = chutes(built);
    const movedMain = after.find((c) => c.id === main.id)!;
    const untouched = after.find((c) => c.id === other.id)!;

    // The typed diameter landed on the canopy the pick was made for — the one the panel names —
    // and the other chute is exactly as the file had it.
    expect(movedMain.diameter).toBeCloseTo(typed, 9);
    expect(untouched.diameter).toBeCloseTo(other.diameter, 9);
    expect(untouched.mass).toBeCloseTo(other.mass, 9);
    // And its weight is the vendor's, scaled from the PICKED size rather than the file's.
    expect(movedMain.mass).toBeCloseTo(picked.mass * (typed / picked.diameter) ** 2, 9);
  });

  it("leaves a massless canopy massless, so a RASAero design is not charged for it twice", async () => {
    // `.CDX1` states no per-part masses at all — the whole design's weight rides in one point mass
    // and `lib/rasaero/adapt.ts` gives every canopy `mass: 0` on purpose. `withMainParachuteDiameter`
    // preserved that for free because it SCALES; an applier that assigns has to say so, or the
    // canopy is counted twice. Driven over the real corpus rather than a constructed rocket, and
    // skipped rather than faked when the corpus is absent.
    const dir = process.env.LOFT_CORPUS_DIR ?? resolve(process.cwd(), "corpus");
    const rasaero = resolve(dir, "rasaero");
    if (!existsSync(rasaero)) return;
    const files = readdirSync(rasaero).filter((f) => f.toLowerCase().endsWith(".cdx1"));
    const part = partsOfKind("parachute").find((c) => c.mass !== undefined && c.mass > 0)!;
    const m = materialOf(part)!;
    const picked = {
      manufacturer: part.manufacturer,
      partNumber: part.partNumber,
      diameter: part.diameter!,
      mass: part.mass!,
      material: { name: m.name, density: m.density },
    };
    let checked = 0;
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(resolve(rasaero, f))));
      const canopies = flattenRocket(doc.rocket)
        .map((p) => p.component)
        .filter((c): c is Parachute => c.kind === "parachute");
      if (!canopies.length) continue;
      const dryBefore = dryMassProperties(doc.rocket).mass;
      const built = applyGeometryEdits(doc.rocket, { catalogParachute: picked });
      const after = flattenRocket(built)
        .map((p) => p.component)
        .filter((c): c is Parachute => c.kind === "parachute");
      const target = after.find((c) => Math.abs(c.diameter - picked.diameter) < 1e-9);
      expect(target, `${f}: the pick did not land`).toBeDefined();
      expect(target!.mass, `${f}: a massless canopy took on a weight the design already counts`).toBe(0);
      expect(dryMassProperties(built).mass, `${f}: dry mass moved`).toBeCloseTo(dryBefore, 9);
      checked++;
    }
    console.log(`massless-canopy check: ${checked} RASAero design(s) with a canopy`);
    expect(checked, "no RASAero design carried a canopy — this test watched nothing").toBeGreaterThan(0);
  });

  it("drops a canopy pick when the canopy it was made for is removed", async () => {
    // Unaimed, the fields resolve through "the largest canopy" — so removing the chute a pick was
    // made for silently re-landed the vendor's diameter AND weight on the next-largest one, with the
    // provenance line still reading "Flying <part>". Third incarnation of the `withCatalogTube`
    // migration defect, and the worst of them, because a pick rewrites mass as well as size.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-dual-deploy.ork")));
    const all = flattenRocket(doc.rocket)
      .map((p) => p.component)
      .filter((c): c is Parachute => c.kind === "parachute");
    const main = [...all].sort((a, b) => b.diameter - a.diameter)[0];
    const part = partsOfKind("parachute").find((c) => c.mass !== undefined && c.mass > 0)!;
    const m = materialOf(part)!;
    const picked = {
      manufacturer: part.manufacturer,
      partNumber: part.partNumber,
      diameter: part.diameter!,
      mass: part.mass!,
      material: { name: m.name, density: m.density },
    };
    const cleared = aimsClearedByRemoving(doc.rocket, { catalogParachute: picked }, main.id);
    expect(
      Object.keys(cleared),
      "removing the picked canopy must take the pick with it",
    ).toContain("catalogParachute");
  });

  it("lets a typed diameter beat the pick, scaling the vendor's own weight rather than the file's", async () => {
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const chute = (r: Rocket) =>
      flattenRocket(r)
        .map((p) => p.component)
        .find((c) => c.kind === "parachute") as Parachute;
    const part = partsOfKind("parachute").find((c) => c.mass !== undefined && c.mass > 0)!;
    const material = materialOf(part)!;
    const picked = {
      manufacturer: part.manufacturer,
      partNumber: part.partNumber,
      diameter: part.diameter!,
      mass: part.mass!,
      material: { name: material.name, density: material.density },
    };

    // The order the applier runs them in is the whole of this test: pick, THEN resize. Applied the
    // other way the pick would discard a figure the flyer had typed; applied this way "that part,
    // but cut down" scales a plausible weight for that part instead of for whatever canopy the file
    // happened to ship.
    const cut = picked.diameter * 0.5;
    const built = applyGeometryEdits(doc.rocket, {
      catalogParachute: picked,
      mainParachuteDiameter: cut,
    });
    const after = chute(built);
    expect(after.diameter).toBeCloseTo(cut, 9);
    // Area scales as diameter², so half the diameter is a quarter of the vendor's weight.
    expect(after.mass).toBeCloseTo(picked.mass * 0.25, 9);
  });

  it("lands the vendor's whole part on the design's nose, and the mass moves with it", async () => {
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const before = nose(doc.rocket);

    const built = applyGeometryEdits(doc.rocket, {
      noseLength: HOLLOW.length,
      noseShape: HOLLOW.shape,
      catalogNoseCone: HOLLOW,
    });
    const after = nose(built);

    expect(after.shape).toBe(HOLLOW.shape);
    expect(after.length).toBeCloseTo(HOLLOW.length, 9);
    expect(after.aftRadius).toBeCloseTo(HOLLOW.outerDiameter / 2, 9);
    expect(after.aftShoulderRadius).toBeCloseTo(HOLLOW.shoulderDiameter / 2, 9);
    expect(after.aftShoulderLength).toBeCloseTo(HOLLOW.shoulderLength, 9);
    expect(after.thickness).toBeCloseTo(HOLLOW.thickness!, 9);
    expect(after.material?.name, "the vendor's own stock, not a category").toBe(HOLLOW.material!.name);
    expect(after.material?.density).toBe(HOLLOW.material!.density);
    // The point of the milestone: the number a flyer acts on actually moved.
    expect(after.aftRadius).not.toBeCloseTo(before.aftRadius, 6);
  });

  it("the flight changes accordingly, and a base that does not fit says so", async () => {
    // R8's *done when* in one case — "the chosen part's dimensions and material populate the model
    // and the flight changes accordingly" — plus the claim the picker's own copy makes about what
    // happens when the cone does not match the tube behind it.
    //
    // Measured on `demo-single-deploy.ork`, whose nose is a 250 mm fibreglass ogive (1850 kg/m3,
    // 3 mm wall) on a 38.0 mm airframe. Picking SEMROC BNC-55D2 — an ogive, 39.95 mm at the base,
    // 76.2 mm long, SOLID balsa at 112 kg/m3 — takes the dry mass 600.2 g -> 525.6 g, the CG
    // 572.5 mm -> 457.1 mm, the static margin 4.065 -> 2.7095 cal, the apogee 992.8 -> 1043.8 m
    // (CG and margin re-measured 2026-08-13 with the corrected override semantics — a vendor's
    // published cone weight now balances where the part's geometry says, shoulder included)
    // and max velocity 205.2 -> 225.1 m/s. A shorter, far lighter nose on a rocket that was already
    // over-stable: every number moves in the direction it should.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const cone = pick((p) => p.manufacturer === "SEMROC" && p.partNumber === "BNC-55D2");
    const built = applyGeometryEdits(doc.rocket, {
      noseLength: cone.length,
      noseShape: cone.shape,
      catalogNoseCone: cone,
    });

    const m0 = dryMassProperties(doc.rocket);
    const m1 = dryMassProperties(built);
    expect(m0.mass).toBeCloseTo(0.6002, 4);
    expect(m1.mass).toBeCloseTo(0.5256, 4);
    const f0 = runFlight(doc.rocket, {}).result;
    const f1 = runFlight(built, {}).result;
    expect(f0.summary.apogee).toBeCloseTo(992.79, 1);
    expect(f1.summary.apogee).toBeCloseTo(1043.84, 1);
    expect(f0.staticMarginCal).toBeCloseTo(4.065, 3);
    // **2.712 → 2.7095 on 2026-08-13, and the 0.0025 cal is a correction rather than drift.**
    // `withCatalogNose` writes the vendor's published weight as `overrideMass`, and every commercial
    // cone plugs in on a shoulder — so this is the most reachable instance there is of the defect
    // R12 increment 15 fixed: a stated mass used to drop the shoulder from the CG entirely and place
    // the whole published weight at the SHELL centroid, forward of where the part balances.
    // OpenRocket keeps the shoulder-inclusive centroid and rescales the weight only
    // (`RocketComponent.getCG()`), which is what happens here now. The CG moves aft, so the margin
    // falls: Loft was reporting this pick as very slightly MORE stable than it is. `f0` is untouched
    // at 4.065 because the design's own cone carries no shoulder and no override, and `m1.mass`
    // above is unchanged at 0.5256 because a CG fix moves no mass — the two together are what say
    // this is the intended change and not a new one.
    expect(f1.staticMarginCal).toBeCloseTo(2.7095, 3);

    // **The base is NOT scaled onto the airframe, and this is what makes that honest.** A 39.95 mm
    // cone on a 38.0 mm tube is a real mould-line step, and the flight already walks the airframe
    // for those. So the flyer is not silently handed a resized rocket, and not silently handed an
    // optimistic number either — the existing check names the step and says the drag reads light.
    // If a future change starts rescaling the airframe to fit a pick, this goes red.
    expect(built).not.toBe(doc.rocket);
    const stepped = f1.warnings.map((w) => JSON.stringify(w)).join(" ");
    expect(stepped, "the step caution the picker's copy promises").toMatch(/changes diameter at a joint/i);
    expect(stepped).toMatch(/under-counted/i);
    const clean = f0.warnings.map((w) => JSON.stringify(w)).join(" ");
    expect(clean, "and it was not already saying that").not.toMatch(/changes diameter at a joint/i);
  });

  it("a cone the vendor calls SOLID is flown solid, not as a shell with no wall", () => {
    // The trap this inverts: `lib/sim/mass.ts` flies a shell with a material and no wall as a solid
    // rod, which is a DEFECT for a tube (the reason `usableCatalogTube` refuses a bore-less pick)
    // and the CORRECT answer for a turned balsa cone. So the same absence has to mean opposite
    // things for the two kinds, and this is the assertion that says the cone side is deliberate.
    expect(SOLID.thickness).toBeUndefined();
    expect(usableCatalogNose(SOLID)).toBe(true);
  });

  it("a cone that butts rather than plugs gets no shoulder at all", async () => {
    // 50 of the 854 publish a shoulder length of 0. Writing that through as a zero-length shoulder
    // would add a ring of mass at the very front of the rocket that the vendor does not sell — and
    // the front is where a gram moves the CG most.
    expect(BUTTED.shoulderLength).toBe(0);
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const built = applyGeometryEdits(doc.rocket, {
      noseLength: BUTTED.length,
      noseShape: BUTTED.shape,
      catalogNoseCone: BUTTED,
    });
    expect(nose(built).aftShoulderLength).toBeUndefined();
    expect(nose(built).aftShoulderRadius).toBeUndefined();
  });

  it("does not inherit the replaced cone's shoulder wall or end cap", async () => {
    // Found by reading `shoulderContribs` in `lib/sim/mass.ts` rather than by any failing test: it
    // reads `aftShoulderThickness` and `aftShoulderCapped`, and the applier originally left both
    // alone while replacing the shoulder's radius and length around them. So a cone picked onto a
    // design whose own nose had a capped or separately-walled shoulder kept those — a bulkhead disc
    // and a wall the vendor never published, at the very front of the rocket where a gram moves the
    // CG furthest. The catalogue states neither for any of the 854.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const n0 = nose(doc.rocket);
    // Give the design's own cone both, so the assertion is about them being CLEARED rather than
    // about them having been absent all along.
    const dirty: Rocket = {
      ...doc.rocket,
      stages: doc.rocket.stages.map((st) => ({
        ...st,
        components: st.components.map((c) =>
          c.id === n0.id ? { ...c, aftShoulderThickness: 0.004, aftShoulderCapped: true } : c,
        ),
      })),
    };
    expect(nose(dirty).aftShoulderCapped).toBe(true);

    const built = applyGeometryEdits(dirty, {
      noseLength: SOLID.length,
      noseShape: SOLID.shape,
      catalogNoseCone: SOLID,
    });
    expect(nose(built).aftShoulderThickness).toBeUndefined();
    expect(nose(built).aftShoulderCapped).toBeUndefined();
    // And the mass really did depend on them — otherwise this is asserting a field nobody reads.
    expect(dryMassProperties(built).mass).not.toBeCloseTo(dryMassProperties(dirty).mass, 6);
  });

  it("does not fly the replaced cone's weighed mass or its measured CG", async () => {
    // **The pre-push review found this and it is the increment's Sev-1.** `overrideMass` wins
    // outright in `lib/sim/mass.ts`, so a design whose
    // nose carried one took the vendor's whole geometry and went on flying the OLD mass — under a
    // caption reading "Flying <vendor> <part>". Reproduced on `rocksimTestRocket1.rkt`, whose nose
    // is overridden to 126.438 g with a CG measured 65.4 mm from the tip of a 396.9 mm cone:
    // dry mass 387.736 g before the pick and 387.736 g after, identical to the digit. Picking a
    // 233.7 mm cone would then have pinned that 65.4 mm CG onto it.
    //
    // 10 of the 41 corpus designs with a nose carry the mass override and 5 carry the CG one, so
    // this is the common case rather than an edge — `<overridemass>` is how a real file records a
    // cone somebody put on a scale.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const n0 = nose(doc.rocket);
    const weighed: Rocket = {
      ...doc.rocket,
      stages: doc.rocket.stages.map((st) => ({
        ...st,
        components: st.components.map((c) =>
          c.id === n0.id ? { ...c, overrideMass: 0.126438, overrideCGx: 0.0654 } : c,
        ),
      })),
    };
    const massBefore = dryMassProperties(weighed).mass;

    // The cone this picks publishes no weight of its own, which is the case that exposed it: 717 of
    // the 854 do not, so the pick has nothing to overwrite the stale figure with.
    expect(SOLID.mass).toBeUndefined();
    const built = applyGeometryEdits(weighed, {
      noseLength: SOLID.length,
      noseShape: SOLID.shape,
      catalogNoseCone: SOLID,
    });
    expect(nose(built).overrideMass, "the replaced cone's weighed mass").toBeUndefined();
    expect(nose(built).overrideCGx, "a CG measured on a cone that is gone").toBeUndefined();
    expect(dryMassProperties(built).mass, "the mass actually moved").not.toBeCloseTo(massBefore, 6);

    // And where the vendor DOES publish a weight, that is the one flown — the override is replaced
    // rather than merely dropped.
    const withMass = pick((p) => p.mass !== undefined && p.mass > 0);
    const built2 = applyGeometryEdits(weighed, {
      noseLength: withMass.length,
      noseShape: withMass.shape,
      catalogNoseCone: withMass,
    });
    expect(nose(built2).overrideMass).toBeCloseTo(withMass.mass!, 9);
    expect(nose(built2).overrideCGx).toBeUndefined();
  });

  it("keeps a balance point the flyer typed THIS edit, even when the same edit picks a new cone", async () => {
    // The case above is about a STALE mark: a station measured on a cone that has since been
    // replaced describes nothing, so the pick clears it. This is the other direction, and the two
    // are one line apart in the applier: a station typed in the SAME edit as the pick is a
    // measurement of the cone now in hand, and it has to win.
    //
    // That is what makes the writers' position load-bearing rather than tidy. `withStatedCG` runs
    // last of everything, after the pick has cleared the field and after a caliber scale has moved
    // the geometry the centroid comes from — the same precedence `withStatedMass` already has, and
    // for the same reason. Applied any earlier, the pick would silently delete a number the flyer
    // had just read off a knife edge, which is the shape of a defect this file has already recorded
    // twice on the mass side.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const n0 = nose(doc.rocket);
    const built = applyGeometryEdits(doc.rocket, {
      noseLength: SOLID.length,
      noseShape: SOLID.shape,
      catalogNoseCone: SOLID,
      noseCGx: 0.02,
    });
    expect(nose(built).overrideCGx, "a station typed in the same edit as the pick").toBeCloseTo(0.02, 9);
    expect(nose(built).cgFrom, "and marked as the flyer's, so no surface captions it Loft's own").toBe("flyer");
    expect(nose(built).id, "the pick still happened").toBe(n0.id);
  });

  it("bounds a stated balance point to the part it is a station on", () => {
    // A mass has no host to fit inside; a station does. `MAINTAINING.md`'s safety posture is explicit
    // that an input which cannot mean anything physically is refused or bounded rather than flown
    // into a confident number, and a balance point past the end of a nose cone is exactly that.
    //
    // Bounded at the APPLIER rather than only in the panel, because the bag is persisted and
    // replayed (`lib/session.ts`) and a sweep drives an axis with no panel involved — and because a
    // catalogue pick or a caliber scale can move the part's length underneath a station typed before
    // it. The clamp reads the length being WRITTEN, not the one that was measured.
    const rocket: Rocket = {
      name: "t",
      stages: [
        {
          name: "s",
          components: [
            { id: "n", name: "Nose", kind: "nosecone", shape: "ogive", length: 0.2, aftRadius: 0.03, children: [], placement: { method: "top", offset: 0 } },
            { id: "b", name: "Tube", kind: "bodytube", length: 0.5, outerRadius: 0.03, children: [], placement: { method: "after", offset: 0 } },
          ] as RocketComponent[],
        },
      ],
      configurations: [],
      referenceType: "maximum",
    };
    const at = (r: Rocket, id: string) =>
      flattenRocket(r).find((p) => p.component.id === id)!.component as { overrideCGx?: number; cgFrom?: string };

    expect(at(applyGeometryEdits(rocket, { noseCGx: 5 }), "n").overrideCGx, "past the tip end").toBeCloseTo(0.2, 9);
    expect(at(applyGeometryEdits(rocket, { noseCGx: 0 }), "n").overrideCGx, "AT the tip is an ordinary answer — lead in the nose").toBe(0);
    expect(at(applyGeometryEdits(rocket, { noseCGx: 0 }), "n").cgFrom, "and it is still the flyer's figure").toBe("flyer");
    expect(at(applyGeometryEdits(rocket, { bodyTubeCGx: 9 }), "b").overrideCGx).toBeCloseTo(0.5, 9);
    // Zero is a real station, so `hasGeometryEdits` must count it — `> 0` would silently discard the
    // one case the field most exists for.
    expect(hasGeometryEdits({ noseCGx: 0 }), "a balance point at the tip is an edit").toBe(true);
    expect(hasGeometryEdits({ bodyTubeCGx: 0 })).toBe(true);
  });

  it("refuses a shoulder length the applier would otherwise install", () => {
    // `withCatalogNose` reads `shoulderLength` as both the gate and the value, so the predicate has
    // to bound it. A replayed record carrying 1.5 m installed a collar longer than the rocket
    // (600.2 g -> 670.8 g on the demo design); NaN and a negative dropped the shoulder silently
    // while the record still counted as an edit.
    for (const bad of [undefined, Number.NaN, -0.02, SOLID.length * 2]) {
      const rec = { ...SOLID, shoulderLength: bad as unknown as number };
      expect(usableCatalogNose(rec), `shoulderLength ${String(bad)}`).toBe(false);
      expect(isEditedValue("catalogNoseCone", rec), `shoulderLength ${String(bad)}`).toBe(false);
    }
    expect(usableCatalogNose({ ...SOLID, shoulderLength: 0 }), "zero is a cone that butts").toBe(true);
  });

  it("does not land a wall without the stock that makes it a mass", async () => {
    // The rule `withCatalogTube` already enforced by refusing both without a material, which the
    // cone applier originally broke from the other side: a SOLID cone's absent thickness landing on
    // the design's OWN density turns a 3 mm-walled fibreglass cone into a solid one. No catalogued
    // cone reaches this today — 0 of 854 had its density refused — but the catalogue is re-cut
    // against newer upstream commits, so it is one regeneration away.
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-single-deploy.ork")));
    const before = nose(doc.rocket);
    expect(before.thickness, "the fixture's own cone is walled").toBeGreaterThan(0);
    const built = applyGeometryEdits(doc.rocket, {
      noseLength: SOLID.length,
      noseShape: SOLID.shape,
      catalogNoseCone: { ...SOLID, material: undefined },
    });
    expect(nose(built).thickness, "kept, because no stock came with the pick").toBe(before.thickness);
    expect(nose(built).material?.name).toBe(before.material?.name);
    // The geometry the catalogue DOES state still lands — this is narrower than the tube's refusal,
    // and deliberately so: a base and a shoulder are not a mass claim.
    expect(nose(built).aftRadius).toBeCloseTo(SOLID.outerDiameter / 2, 9);
  });

  it("counts as an edit, and a record that cannot be applied does not", () => {
    expect(hasGeometryEdits({ catalogNoseCone: SOLID })).toBe(true);
    expect(INERT_EDIT_FIELDS.has("catalogNoseCone")).toBe(false);
    expect(isEditedValue("catalogNoseCone", SOLID)).toBe(true);
    // Every way a stored record can fail to describe a buildable cone. Each of these is reachable
    // from a bag persisted by an older build, which `lib/session.ts` replays on the next visit —
    // and one that reads as edited while the applier refuses it withholds the imported file's own
    // stored-simulation comparison on a design nothing changed.
    const bad: Record<string, PickedNoseCone> = {
      "no shape": { ...SOLID, shape: undefined as unknown as NoseShape },
      "unknown shape": { ...SOLID, shape: "cylinder" as unknown as NoseShape },
      "no base": { ...SOLID, outerDiameter: 0 },
      "no length": { ...SOLID, length: 0 },
      "no shoulder diameter": { ...SOLID, shoulderDiameter: 0 },
      "shoulder wider than the base": { ...SOLID, shoulderDiameter: SOLID.outerDiameter * 1.5 },
      "a wall that leaves no bore": { ...SOLID, thickness: SOLID.outerDiameter / 2 },
    };
    for (const [why, rec] of Object.entries(bad)) {
      expect(usableCatalogNose(rec), why).toBe(false);
      expect(hasGeometryEdits({ catalogNoseCone: rec }), why).toBe(false);
      expect(isEditedValue("catalogNoseCone", rec), why).toBe(false);
    }
  });
});

describe("authoring a coupler and a centring ring", () => {
  const SINGLE = "fixtures/demo-single-deploy.ork";
  const load = async (f: string) => importOrk(readFileSync(resolve(process.cwd(), f)));
  const author = (r: Rocket, after: string, kind: "tubecoupler" | "centeringring") => {
    // `length: 0` is exactly what `addPartAfter` sends: the size is the corpus figure resolved
    // against the host, so the button and this test build the same part rather than two that agree
    // by argument.
    const id = newPartId(r, undefined, after);
    return { id, edits: { added: [{ id, kind, after, length: 0 }] } };
  };
  const firstTube = (r: Rocket) => flattenRocket(r).find((p) => p.component.kind === "bodytube")!.component as BodyTube;

  it("makes a coupler a tube and a ring a plate, from the same shape and the same host", async () => {
    // **The one way to author these wrong is to size them alike.** Both are `RingComponent` in the
    // model, and a first draft did exactly that: a 50 mm slug for each. A coupler really is 1.86
    // calibers (corpus median of 31, never below 1.0537) and a ring really is 3.18 mm — 1/8 inch ply,
    // the corpus median of 83. So on one host they come out ~20x apart, and the gap WIDENS with
    // diameter, because one figure scales with the tube and the other is a sheet thickness that does
    // not. That divergence is the reason a single default could not have served both.
    const doc = await load(SINGLE);
    const host = firstTube(doc.rocket);
    const co = author(doc.rocket, host.id, "tubecoupler");
    const ri = author(doc.rocket, host.id, "centeringring");
    const coupler = flattenRocket(applyGeometryEdits(doc.rocket, co.edits)).find((p) => p.component.id === co.id)!;
    const ring = flattenRocket(applyGeometryEdits(doc.rocket, ri.edits)).find((p) => p.component.id === ri.id)!;
    expect(coupler.component.kind).toBe("tubecoupler");
    expect(ring.component.kind).toBe("centeringring");
    // The coupler's length is a multiple of ITS OWN diameter, and it fits the host it was cut for.
    const cr = (coupler.component as RingComponent).outerRadius;
    expect(coupler.length / (2 * cr)).toBeCloseTo(1.859, 3);
    expect(coupler.length).toBeLessThanOrEqual(host.length + 1e-9);
    // The ring's thickness is ABSOLUTE — a sheet of ply, not a fraction of anything.
    expect(ring.length).toBeCloseTo(0.003175, 9);
    expect(coupler.length / ring.length).toBeGreaterThan(15);
    // And the gap really does widen with the tube: on a host twice as wide the coupler grows and the
    // plate does not move at all. Asserted rather than argued, because it is what makes a ratio wrong
    // for a ring and an absolute wrong for a coupler. The coupler tracks the host's BORE rather than
    // its outer radius — doubling the radius leaves the wall where it was, so the bore grows by more
    // than double — and the constant it holds is the corpus figure on both.
    const wide: BodyTube = { ...host, outerRadius: host.outerRadius * 2 };
    const cw = internalPartDefaults("tubecoupler", wide);
    const cn = internalPartDefaults("tubecoupler", host);
    const bore = (t: BodyTube) => t.outerRadius - (t.thickness ?? 0);
    expect(cw.length).toBeGreaterThan(cn.length * 1.9);
    expect(cw.length / (2 * bore(wide))).toBeCloseTo(cn.length / (2 * bore(host)), 9);
    expect(internalPartDefaults("centeringring", wide).length).toBeCloseTo(internalPartDefaults("centeringring", host).length, 12);
  });

  it("bores a ring to the mount it centres, and never leaves it solid", async () => {
    // **0 of the 83 real centring rings in the corpus have a zero bore** — a disc with no hole is a
    // bulkhead, a different part doing a different job. Where the host carries the `innertube` that
    // IS the motor mount, the bore is read off it exactly; where it does not, the corpus median
    // ratio stands in rather than a solid slug.
    const doc = await load(SINGLE);
    const host = firstTube(doc.rocket);
    const bare: BodyTube = { ...host, children: host.children.filter((c) => c.kind !== "innertube") };
    const mounted: BodyTube = {
      ...bare,
      children: [
        ...bare.children,
        { id: "mnt", name: "Motor tube", kind: "innertube", length: 0.2, outerRadius: 0.0145, innerRadius: 0.0135, children: [] },
      ],
    };
    const withMount = internalPartDefaults("centeringring", mounted);
    const without = internalPartDefaults("centeringring", bare);
    expect(withMount.innerRadius).toBeCloseTo(0.0145, 9);
    expect(without.innerRadius).toBeGreaterThan(0);
    // Negative control on the rule this replaced: the fallback is not, and must not be, a solid disc.
    expect(without.innerRadius / internalPartDefaults("tubecoupler", bare).innerRadius).toBeGreaterThan(0.5);
    // A coupler ignores the mount entirely — it is bored by its own wall, not by what it surrounds.
    expect(internalPartDefaults("tubecoupler", mounted).innerRadius)
      .toBeCloseTo(internalPartDefaults("tubecoupler", bare).innerRadius, 12);
  });

  it("weighs what a coupler and a ring weigh, which is not what a slug weighs", async () => {
    // The mass is the whole point: these two kinds change no outer mould line, so dry mass and CG are
    // the ONLY numbers they move. A ring is single-digit grams. The solid 50 mm version this replaced
    // was 134 g at the corpus median — heavier than most of the airframes it was being added to.
    const doc = await load(SINGLE);
    const host = firstTube(doc.rocket);
    const before = dryMassProperties(doc.rocket);
    const ri = author(doc.rocket, host.id, "centeringring");
    const built = applyGeometryEdits(doc.rocket, ri.edits);
    const added = (dryMassProperties(built).mass - before.mass) * 1000;
    expect(added).toBeGreaterThan(0);
    expect(added).toBeLessThan(20);
    // And it goes INSIDE: the airframe is exactly as long as it was.
    expect(overallLength(built)).toBeCloseTo(overallLength(doc.rocket), 12);
  });

  it("shrinks with the tube when the tube is shortened under it", async () => {
    // **The order of the pipeline is what makes this reachable**: `applyAdds` runs before
    // `applyDimensionEdits`, so the birth clamp measured the host at its PRISTINE length. Typing a
    // shorter body length afterwards resizes the tube underneath a part already seated flush with its
    // aft end — and a `bottom` placement grows FORWARD, so the overhang goes out of the fore end into
    // the nose cone, carrying its full un-shrunk mass at a station it is not at.
    const doc = await load(SINGLE);
    const host = firstTube(doc.rocket);
    const co = author(doc.rocket, host.id, "tubecoupler");
    const full = flattenRocket(applyGeometryEdits(doc.rocket, co.edits)).find((p) => p.component.id === co.id)!;
    expect(full.length).toBeGreaterThan(0.02);

    // Shorter than the coupler it now contains.
    const short = 0.02;
    const built = applyGeometryEdits(doc.rocket, { ...co.edits, bodyLength: short });
    const parts = flattenRocket(built);
    const tube = parts.find((p) => p.component.id === host.id)!;
    const made = parts.find((p) => p.component.id === co.id)!;
    expect(tube.length).toBeCloseTo(short, 9);
    expect(made.length).toBeLessThanOrEqual(tube.length + 1e-9);
    expect(made.xFore).toBeGreaterThanOrEqual(tube.xFore - 1e-9);
    expect(made.xFore + made.length).toBeLessThanOrEqual(tube.xFore + tube.length + 1e-9);
    // The mass follows the geometry rather than staying at the un-shrunk figure.
    const shrunkMass = dryMassProperties(built).mass;
    const unshrunk = dryMassProperties(applyGeometryEdits(doc.rocket, co.edits)).mass;
    expect(shrunkMass).toBeLessThan(unshrunk);
    // Typing the length FIRST and authoring after must land in the same place — the bag is a set, not
    // a sequence, and `structureOf` deliberately hides dimension edits from the add's anchor.
    const other = applyGeometryEdits(doc.rocket, { bodyLength: short, ...co.edits });
    expect(dryMassProperties(other).mass).toBeCloseTo(shrunkMass, 12);
  });

  it("refuses a host that is not a tube, and comes back when taken away", async () => {
    const doc = await load(SINGLE);
    const nose = flattenRocket(doc.rocket).find((p) => p.component.kind === "nosecone")!.component;
    const bad = author(doc.rocket, nose.id, "tubecoupler");
    // A coupler slides inside a tube's bore; a nose cone has no bore to state. Refused rather than
    // built somewhere arbitrary.
    expect(flattenRocket(applyGeometryEdits(doc.rocket, bad.edits)).find((p) => p.component.id === bad.id)).toBeUndefined();
    // Paired with the positive case on the SAME design, so the refusal above cannot be passing
    // because the whole build path is dead.
    const host = firstTube(doc.rocket);
    const co = author(doc.rocket, host.id, "tubecoupler");
    const built = applyGeometryEdits(doc.rocket, co.edits);
    expect(flattenRocket(built).find((p) => p.component.id === co.id)).toBeDefined();

    // **Undo is a replay of the bag with the entry dropped, so the state it has to return to is the
    // BUILT one minus the part** — not the pristine design compared with itself, which is what this
    // asserted first time round and would have passed with the feature deleted. The built design has
    // to differ before returning to pristine means anything.
    const pristineMass = dryMassProperties(doc.rocket).mass;
    expect(dryMassProperties(built).mass).toBeGreaterThan(pristineMass);
    expect(flattenRocket(built).length).toBe(flattenRocket(doc.rocket).length + 1);
    const back = applyGeometryEdits(doc.rocket, { ...co.edits, added: [] });
    expect(dryMassProperties(back).mass).toBeCloseTo(pristineMass, 12);
    expect(flattenRocket(back).length).toBe(flattenRocket(doc.rocket).length);
  });

  it("builds the ring at the bore the helper resolved, not just reports it", async () => {
    // The bore rule is the ring's headline claim, and it was pinned only on `internalPartDefaults`.
    // A wiring mistake between the helper and `buildAdded` — the arm reading `ro * 0.87` directly, or
    // dropping `geom.innerRadius` — would leave every one of those assertions green while the part a
    // flyer actually gets is bored somewhere else. So this asserts on the BUILT component.
    const doc = await load(SINGLE);
    const host = firstTube(doc.rocket);
    // A radius the design does not already contain — this fixture ships its own 14.5 mm motor tube,
    // so reusing that number would have made both halves of this pass on the pristine file.
    const R = 0.0111;
    const mount: InnerTube = {
      id: "mnt", name: "Motor tube", kind: "innertube",
      length: 0.2, outerRadius: R, innerRadius: R - 0.001,
      placement: { method: "bottom", offset: 0 },
      motorMount: { designation: "H128W" }, children: [],
    };
    // Nested one level down, which is where 41 corpus body tubes actually keep theirs.
    const sleeve: RingComponent = {
      id: "slv", name: "Sleeve", kind: "tubecoupler",
      length: 0.05, outerRadius: 0.018, innerRadius: 0.017,
      placement: { method: "bottom", offset: 0 },
      children: [mount],
    };
    const rehost = (children: RocketComponent[]): Rocket => ({
      ...doc.rocket,
      stages: doc.rocket.stages.map((s) => ({
        ...s,
        components: s.components.map((c) => (c.id === host.id ? { ...c, children } : c)),
      })),
    });
    const strip = (c: RocketComponent) => c.kind !== "innertube";
    const withMount = rehost([...host.children.filter(strip), sleeve]);
    const ri = author(withMount, host.id, "centeringring");
    const made = flattenRocket(applyGeometryEdits(withMount, ri.edits)).find((p) => p.component.id === ri.id)!;
    expect((made.component as RingComponent).innerRadius).toBeCloseTo(R, 9);

    // Negative control on the SAME host with the sleeve gone: no mount anywhere, so the bore falls to
    // the corpus ratio and lands somewhere else entirely. Without this the assertion above would pass
    // on any implementation that happened to produce R.
    const bareRocket = rehost(host.children.filter(strip));
    const bare = author(bareRocket, host.id, "centeringring");
    const plain = flattenRocket(applyGeometryEdits(bareRocket, bare.edits)).find((p) => p.component.id === bare.id)!;
    expect((plain.component as RingComponent).innerRadius).not.toBeCloseTo(R, 4);
    expect((plain.component as RingComponent).innerRadius).toBeGreaterThan(0);
  });

  it("cuts a coupler down to a host too short to hold one, rather than overhanging it", async () => {
    // The birth clamp, which was inert on this fixture — its 620 mm tube swallows a 94.8 mm coupler
    // whole, so deleting the clamp left every case green. 3 of the 35 corpus designs are genuinely
    // this short; `02.Two-stage.ork`'s first tube is 7.5 mm.
    const doc = await load(SINGLE);
    const host = firstTube(doc.rocket);
    const stub: Rocket = {
      ...doc.rocket,
      stages: doc.rocket.stages.map((s) => ({
        ...s,
        components: s.components.map((c) => (c.id === host.id ? { ...c, length: 0.0075 } : c)),
      })),
    };
    const co = author(stub, host.id, "tubecoupler");
    const parts = flattenRocket(applyGeometryEdits(stub, co.edits));
    const tube = parts.find((p) => p.component.id === host.id)!;
    const made = parts.find((p) => p.component.id === co.id)!;
    expect(tube.length).toBeCloseTo(0.0075, 9);
    // Without the clamp this is 94.8 mm in a 7.5 mm tube, 87.3 mm of it forward of the fore end.
    expect(made.length).toBeLessThanOrEqual(tube.length + 1e-9);
    expect(made.xFore).toBeGreaterThanOrEqual(tube.xFore - 1e-9);
    expect(made.length).toBeGreaterThan(0);
  });
});

describe("picking a real coupler or centring ring", () => {
  const SINGLE = "fixtures/demo-single-deploy.ork";
  const load = async (f: string) => importOrk(readFileSync(resolve(process.cwd(), f)));
  const firstTube = (r: Rocket) => flattenRocket(r).find((p) => p.component.kind === "bodytube")!.component as BodyTube;
  const PLY: Material = { name: "Plywood, light, bulk", density: 352, type: "bulk" };
  /** A real catalogued ring that **fits `SINGLE`'s bore**, and the fit is the load-bearing half.
   *
   *  This was `SEMROC CR-9-175P`, 44.4 mm across, in a fixture whose one body tube is 38 mm outside
   *  with a 2 mm wall — a **34 mm bore**. So every case below was driving a ring wider than the whole
   *  rocket it was being fitted into, and passing: an over-wide internal part is invisible on the
   *  diagram but is read by `maxBodyRadius`, so the fixture was quietly exercising the caliber defect
   *  rather than the behaviour each case names. The five that used it went red the moment the model
   *  started refusing that part, which is how it was found.
   *
   *  `CR-10-13P` is the same manufacturer, the same plywood stock and the same 3.175 mm length, so
   *  every assertion below still means what it meant — a real vendor part, in a stock the host does
   *  not share, at dimensions Loft would not have derived — and now describes a part that can exist
   *  inside this design. */
  const PICK: PickedRing = {
    manufacturer: "SEMROC",
    partNumber: "CR-10-13P",
    outerDiameter: 0.0329692,
    innerDiameter: 0.0264668,
    length: 0.003175,
    material: PLY,
  };

  it("replaces every dimension AND the stock, rather than three of the four", async () => {
    // A derived ring is Loft's estimate of what a flyer would fit; a catalogued one is a real object
    // with a published bore, outer diameter, length and material. Taking the geometry and keeping the
    // host's stock would fly a part that exists nowhere — and every catalogue row states all four
    // (236 of 236 couplers, 497 of 497 rings), so there is no partial case.
    const doc = await load(SINGLE);
    const host = firstTube(doc.rocket);
    const id = newPartId(doc.rocket, undefined, host.id);
    const derived = flattenRocket(
      applyGeometryEdits(doc.rocket, { added: [{ id, kind: "centeringring", after: host.id, length: 0 }] }),
    ).find((p) => p.component.id === id)!.component as RingComponent;
    const picked = flattenRocket(
      applyGeometryEdits(doc.rocket, { added: [{ id, kind: "centeringring", after: host.id, length: 0, pick: PICK }] }),
    ).find((p) => p.component.id === id)!.component as RingComponent;

    expect(picked.outerRadius).toBeCloseTo(PICK.outerDiameter / 2, 9);
    expect(picked.innerRadius).toBeCloseTo(PICK.innerDiameter / 2, 9);
    expect(picked.length).toBeCloseTo(PICK.length, 9);
    expect(picked.material?.name).toBe(PLY.name);
    // And it really is a different part from the derived one, so none of the above passes by matching
    // what Loft would have chosen anyway.
    expect(picked.outerRadius).not.toBeCloseTo(derived.outerRadius, 4);
    expect(picked.material?.name).not.toBe(derived.material?.name);
  });

  it("refuses a picked part too long for its host rather than cutting it down", async () => {
    // The DERIVED length is Loft's own number and clamping it is honest. A picked one carries a
    // vendor's part number on the parts row, and silently flying a shortened version of a named
    // product is a wrong number under a label naming a real part. Couplers run to 1.2192 m in the
    // catalogue, so this is reachable rather than theoretical.
    const doc = await load(SINGLE);
    const host = firstTube(doc.rocket);
    const id = newPartId(doc.rocket, undefined, host.id);
    const tooLong: PickedRing = { ...PICK, partNumber: "C5-34", length: host.length * 2 };
    const built = applyGeometryEdits(doc.rocket, {
      added: [{ id, kind: "tubecoupler", after: host.id, length: 0, pick: tooLong }],
    });
    expect(flattenRocket(built).find((p) => p.component.id === id), "a coupler twice its host's length was built").toBeUndefined();
    // The same pick at a length that fits does build, so the refusal is about the length and not
    // about picks in general.
    const fits: PickedRing = { ...tooLong, length: host.length / 2 };
    const ok = applyGeometryEdits(doc.rocket, {
      added: [{ id, kind: "tubecoupler", after: host.id, length: 0, pick: fits }],
    });
    expect(flattenRocket(ok).find((p) => p.component.id === id)).toBeDefined();
  });

  /** **A picked part wider than its host was reported as the whole rocket's caliber.**
   *
   *  A coupler and a centring ring are invisible on the diagram — the silhouette only walks the
   *  airframe — but `maxBodyRadius` maxes `outerRadius()` over every component, internals included.
   *  So an over-wide one became `referenceRadius`, and through it the diameter `staticMarginCal` is
   *  quoted in calibers OF and the reference area every drag coefficient is computed from. The typed
   *  field has been clamped against exactly this since the panel gained it; the PICK path was not.
   *
   *  Measured on the bundled starter, 54 mm airframe: 123 of the 236 catalogued couplers and 243 of
   *  the 497 rings are wider than the entire rocket, so it is the common case.
   *
   *  Asserted on the REFERENCE RADIUS rather than on the part, because that is the quantity that was
   *  wrong and the one a flyer reads through. The airframe's own radius is read off the design rather
   *  than written here, so the assertion cannot pass by agreeing with a constant. */
  /** **"Another one of these, here" was refused on the nose cone of every design.**
   *
   *  A part authored BEHIND another needs an aft face to fair to; a part authored INSIDE it, or
   *  mounted ON it, needs a tube. Both rules were spelled as one body-tube test, in the panel and in
   *  the applier — and `buildAdded`'s tube arm and `transitionDefaults` have always sized themselves
   *  through `aftOuterRadius`, which answers for a nose cone and a transition too. So the guard was
   *  narrower than the code behind it, on the first part a from-scratch build has.
   *
   *  **This case documents that the MODEL was already capable and pins the new predicate; it does
   *  NOT pin the guard change, and saying so matters.** `applyGeometryEdits` builds a tube behind a
   *  nose cone with or without this run's change, because `buildAdded` never consulted the anchor's
   *  kind — which is exactly the finding. What changed is the two guards in front of it, and the
   *  only thing that can pin those is the e2e case that picks a nose cone and looks for the button.
   *  A model test that passes before and after is evidence about the model, not about the fix. */
  it("authors a tube behind a nose cone, which the aft face has always supported", async () => {
    const doc = await load(SINGLE);
    const nose = flattenRocket(doc.rocket).find((p) => p.component.kind === "nosecone")!.component;
    expect(canAnchorAfter(nose), "a nose cone presents an aft face").toBe(true);

    const id = newPartId(doc.rocket, undefined, nose.id);
    const faceR = aftOuterRadius(nose)!;
    const built = applyGeometryEdits(doc.rocket, {
      added: [{ id, kind: "bodytube", after: nose.id, length: Math.max((nose as { length: number }).length / 2, 2 * faceR) }],
    });
    const made = flattenRocket(built).find((p) => p.component.id === id);
    expect(made, "a tube behind the nose cone must build").toBeDefined();
    // Faired to the face it follows, which is what makes it "another one of these".
    expect((made!.component as { outerRadius: number }).outerRadius).toBeCloseTo(faceR, 9);

    // And the parts that go INSIDE a tube are still refused there — the widening is one rule, not both.
    for (const kind of ["tubecoupler", "centeringring"] as const) {
      const inner = newPartId(built, undefined, nose.id);
      const out = applyGeometryEdits(doc.rocket, { added: [{ id: inner, kind, after: nose.id, length: 0 }] });
      expect(flattenRocket(out).find((p) => p.component.id === inner), `${kind} must not go inside a nose cone`).toBeUndefined();
    }
  });

  it("says which parts can take one behind them, across every corpus design", async () => {
    // The population the widening is about, measured rather than asserted from memory: body tubes are
    // a sixth of the parts a flyer can pick, and the three kinds with an aft face are a quarter.
    // A count that reads 0 would mean the corpus never loaded.
    const doc = await load(SINGLE);
    const parts = flattenRocket(doc.rocket);
    const anchors = parts.filter((p) => canAnchorAfter(p.component));
    const tubes = parts.filter((p) => p.component.kind === "bodytube");
    expect(tubes.length, "the fixture must carry a tube").toBeGreaterThan(0);
    expect(anchors.length, "and strictly more parts can anchor than are tubes").toBeGreaterThan(tubes.length);
    // Every anchor is one of exactly the three kinds that present an aft face.
    for (const a of anchors) {
      expect(["bodytube", "nosecone", "transition"], `${a.component.kind} answered the aft-face question`).toContain(a.component.kind);
    }
  });

  it("refuses a picked part wider than its host, so the design's caliber stays the airframe's", async () => {
    const doc = await load(SINGLE);
    const host = firstTube(doc.rocket);
    const id = newPartId(doc.rocket, undefined, host.id);
    const before = referenceRadius(doc.rocket);
    // Deliberately wider than the whole airframe, and short enough that the LENGTH guard cannot be
    // what refuses it — otherwise this would pass for the wrong reason.
    const tooWide: PickedRing = { ...PICK, partNumber: "CT-11.4", outerDiameter: host.outerRadius * 6, innerDiameter: host.outerRadius * 5, length: host.length / 4 };
    const built = applyGeometryEdits(doc.rocket, {
      added: [{ id, kind: "tubecoupler", after: host.id, length: 0, pick: tooWide }],
    });
    expect(flattenRocket(built).find((p) => p.component.id === id), "a coupler six times the airframe's radius was built").toBeUndefined();
    expect(referenceRadius(built), "the design's reference radius must still be the airframe's").toBeCloseTo(before, 12);

    // The same pick inside the bore does build, so the refusal is about the width and not about picks
    // in general — and the reference radius is still the airframe's, because it fits.
    const wall = host.thickness && host.thickness > 0 ? host.thickness : 0;
    const bore = host.outerRadius - wall;
    const fits: PickedRing = { ...tooWide, outerDiameter: bore * 2 * 0.98, innerDiameter: bore * 2 * 0.9 };
    const ok = applyGeometryEdits(doc.rocket, {
      added: [{ id, kind: "tubecoupler", after: host.id, length: 0, pick: fits }],
    });
    expect(flattenRocket(ok).find((p) => p.component.id === id), "a coupler inside the bore was refused").toBeDefined();
    expect(referenceRadius(ok)).toBeCloseTo(before, 12);
  });

  it("weighs the part the vendor describes, and comes back when the pick is dropped", async () => {
    const doc = await load(SINGLE);
    const host = firstTube(doc.rocket);
    const id = newPartId(doc.rocket, undefined, host.id);
    const entry = { id, kind: "centeringring" as const, after: host.id, length: 0 };
    const bare = dryMassProperties(doc.rocket).mass;
    const withPick = dryMassProperties(applyGeometryEdits(doc.rocket, { added: [{ ...entry, pick: PICK }] })).mass;
    const derived = dryMassProperties(applyGeometryEdits(doc.rocket, { added: [entry] })).mass;
    // Neither kind states a mass anywhere in the catalogue, so the weight is computed from geometry
    // and stock by the same path a hand-typed ring goes through — but it must be the PICK's geometry.
    expect(withPick).toBeGreaterThan(bare);
    expect(withPick).not.toBeCloseTo(derived, 6);
    // Dropping the pick returns the derived part exactly: the pick rides on the entry, so there is no
    // second place for it to survive.
    expect(dryMassProperties(applyGeometryEdits(doc.rocket, { added: [entry] })).mass).toBeCloseTo(derived, 12);
  });

  it("drops a picked part when the host is shortened under it, and still clamps a derived one", async () => {
    // **The refusal above is unreachable by the route a flyer actually takes, and this is that
    // route.** `applyAdds` runs BEFORE `applyDimensionEdits`, so a pick is judged against the host's
    // PRISTINE length — pick a coupler that fits, then type a smaller number into Body length and the
    // birth-time guard has already passed. What then reached the part was the shrink clamp, which
    // cut it to the new host length: measured on the starter before this fix, a 203.2 mm Always
    // Ready Rocketry TC_2.15_8 was flown at 200.0 mm with the panel still captioned "Flying Always
    // Ready Rocketry TC_2.15_8". A vendor's part number over a length that vendor never published is
    // the wrong-number-under-a-real-label case, so the part is left out instead.
    const doc = await load(SINGLE);
    const host = firstTube(doc.rocket);
    const id = newPartId(doc.rocket, undefined, host.id);
    // A pick that fits the tube as it stands, so the birth guard passes and only the clamp can act.
    const fits: PickedRing = { ...PICK, partNumber: "TC_2.15_8", length: host.length * 0.6 };
    const entry = { id, kind: "tubecoupler" as const, after: host.id, length: 0, pick: fits };
    const asIs = flattenRocket(applyGeometryEdits(doc.rocket, { added: [entry] })).find((p) => p.component.id === id);
    expect(asIs, "the pick did not build even before the host was touched").toBeDefined();
    expect(asIs!.component.length).toBeCloseTo(fits.length, 9);

    // Now shrink the host under it — the whole tube, to half the picked part's length.
    const shrunk = { added: [entry], bodyTubeId: host.id, bodyLength: fits.length / 2 };
    const after = flattenRocket(applyGeometryEdits(doc.rocket, shrunk));
    expect(after.find((p) => p.component.id === host.id)!.component.length ?? 0).toBeCloseTo(fits.length / 2, 9);
    expect(
      after.find((p) => p.component.id === id),
      "a picked coupler was flown at a length its vendor never published",
    ).toBeUndefined();

    // **The negative control, and it is the half that makes this a rule rather than a deletion.** The
    // SAME entry with no pick is Loft's own derived part, and that one is still clamped rather than
    // dropped — shortening it is honest, because the length was never anybody's published figure.
    const derivedEntry = { id, kind: "tubecoupler" as const, after: host.id, length: 0 };
    const derivedAfter = flattenRocket(
      applyGeometryEdits(doc.rocket, { added: [derivedEntry], bodyTubeId: host.id, bodyLength: fits.length / 2 }),
    ).find((p) => p.component.id === id);
    expect(derivedAfter, "a derived coupler was dropped instead of clamped").toBeDefined();
    expect(derivedAfter!.component.length).toBeLessThanOrEqual(fits.length / 2 + 1e-9);
    expect(derivedAfter!.component.length).toBeGreaterThan(0);

    // And lengthening the tube again brings the picked part back at its published length — the way
    // out the panel tells the flyer about.
    const back = flattenRocket(
      applyGeometryEdits(doc.rocket, { added: [entry], bodyTubeId: host.id, bodyLength: host.length }),
    ).find((p) => p.component.id === id);
    expect(back, "the picked part did not come back when the tube was lengthened again").toBeDefined();
    expect(back!.component.length).toBeCloseTo(fits.length, 9);
  });

  it("judges the fit against the tube being FLOWN, not the one the file described", async () => {
    // **The other direction, and the pre-push review found it after the first fix was already
    // green.** Fitting was decided in two places against two different rockets: `buildAdded` judged
    // a pick against the host's PRISTINE length, and the shrink clamp judged it against the edited
    // one. Shortening was caught by the clamp; LENGTHENING was caught by nobody, and it fails the
    // opposite way — a coupler that fits the tube on screen perfectly well is refused for not
    // fitting a tube that no longer exists, and `applyAdds` then drops the entry, so the part the
    // flyer just chose disappears. Both gates are now one, run over the finished tree.
    const doc = await load(SINGLE);
    const host = firstTube(doc.rocket);
    const id = newPartId(doc.rocket, undefined, host.id);
    // Longer than the tube the FILE describes, comfortably inside the tube the flyer is flying.
    const longPick: PickedRing = { ...PICK, partNumber: "TC_2.15_48", length: host.length * 1.5 };
    const entry = { id, kind: "tubecoupler" as const, after: host.id, length: 0, pick: longPick };

    const lengthened = flattenRocket(
      applyGeometryEdits(doc.rocket, { added: [entry], bodyTubeId: host.id, bodyLength: host.length * 3 }),
    ).find((p) => p.component.id === id);
    expect(
      lengthened,
      "a coupler that fits the tube on screen was refused for not fitting the one in the file",
    ).toBeDefined();
    expect(lengthened!.component.length).toBeCloseTo(longPick.length, 9);

    // The same pick with no length edit at all is still refused, because then the tube being flown
    // IS the file's — so this is one rule reading one rocket, not a relaxation.
    expect(
      flattenRocket(applyGeometryEdits(doc.rocket, { added: [entry] })).find((p) => p.component.id === id),
      "the refusal stopped working when there was no length edit to hide behind",
    ).toBeUndefined();
  });

  it("refuses a stored pick a build cannot use", async () => {
    // Reachable from a bag persisted by an older build, which `lib/session.ts` replays on the next
    // visit. A record that reads as picked while the applier refuses it is a pick that appears to
    // work and changes no number.
    const bad: Record<string, PickedRing> = {
      "no part number": { ...PICK, partNumber: "" },
      "no outer diameter": { ...PICK, outerDiameter: 0 },
      "bore wider than the part": { ...PICK, innerDiameter: PICK.outerDiameter },
      "no length": { ...PICK, length: 0 },
      "a stock with no density": { ...PICK, material: { ...PLY, density: 0 } },
    };
    for (const [why, rec] of Object.entries(bad)) expect(usableCatalogRing(rec), why).toBe(false);
    expect(usableCatalogRing(PICK)).toBe(true);
    // A solid plug is LEGAL, not a defect: 7 of the 236 catalogued couplers state a zero bore, and
    // `lib/sim/mass.ts` already flies one as a solid cylinder.
    expect(usableCatalogRing({ ...PICK, innerDiameter: 0 }), "a solid balsa plug was refused").toBe(true);
  });
});

describe("applyGeometryEdits — the canopy's drag coefficient", () => {
  /** R9 increment 5. The one input in the recovery chain a flyer could not reach, and the one that
   *  sets descent rate, arrival speed and landing energy — the pair an RSO and a waiver check. */
  it("sets the aimed canopy's Cd, records that the figure is the flyer's, and leaves its mass alone", () => {
    const rocket = newDesign().rocket;
    const before = primaryParachute(rocket)!;
    expect(before.cd).toBeGreaterThan(0);

    const edited = applyGeometryEdits(rocket, { parachuteCd: 1.4 });
    const after = primaryParachute(edited)!;
    expect(after.cd).toBeCloseTo(1.4, 6);
    // **The provenance moves with the number.** Leaving `cdFrom` alone would have left the surface
    // reporting the file's figure — or Loft's — beside a coefficient neither of them chose, which
    // is the exact class of wrongness the field was added to prevent, arriving from the other side.
    expect(after.cdFrom).toBe("flyer");
    // Mass is a property of how much fabric is in the canopy, not of its shape and porosity: two
    // canopies of the same diameter and different Cd weigh the same. Unlike the resize beside it.
    expect(after.mass).toBeCloseTo(before.mass, 9);
    expect(after.diameter).toBeCloseTo(before.diameter, 9);
    // The original design is untouched.
    expect(primaryParachute(rocket)!.cd).toBeCloseTo(before.cd, 9);
  });

  it("refuses a coefficient that cannot mean anything, rather than flying it", () => {
    const rocket = newDesign().rocket;
    const before = primaryParachute(rocket)!;
    // Zero is a canopy that is not there; a negative one is thrust. Both leave the design alone
    // rather than producing a confident descent from an impossible input.
    for (const cd of [0, -1]) {
      const after = primaryParachute(applyGeometryEdits(rocket, { parachuteCd: cd }))!;
      expect(after.cd).toBeCloseTo(before.cd, 9);
      expect(after.cdFrom).toBe(before.cdFrom);
    }
  });

  it("changes the flight it is supposed to change, and in the right direction", () => {
    const rocket = newDesign().rocket;
    const base = primaryParachute(rocket)!.cd;
    const fly = (cd: number) =>
      runFlight(applyGeometryEdits(rocket, { parachuteCd: cd }), {}).result.summary.groundHitVelocity;

    const draggier = fly(base * 2);
    const slippier = fly(base * 0.5);
    // More drag under the canopy is a slower arrival. Asserted as an ordering rather than a number,
    // so it holds if the starter design changes — and both against a real flight, because an edit
    // that reaches the model and not the solver is the failure this catches.
    expect(draggier).toBeGreaterThan(0);
    expect(slippier).toBeGreaterThan(draggier);
    // A coefficient IS the lever it is advertised as: doubling it must move the arrival speed
    // materially, not by a rounding.
    expect(slippier / draggier).toBeGreaterThan(1.2);
  });
});

/** R12's mass override, on the kind that carries most of them.
 *
 *  Loft derives a canopy's mass from its diameter and a surface density, and a real canopy arrives
 *  with line, a swivel and a deployment bag that no diameter can see. 22 of the corpus's 64
 *  `<overridemass>` elements sit on parachutes — more than on any other kind — so this is the field
 *  designers reach for most, and Loft could read it from the first importer and never write one. */
describe("applyGeometryEdits — the canopy's mass", () => {
  it("sets the aimed canopy's mass, records the figure as the flyer's, and leaves its shape alone", () => {
    const rocket = newDesign().rocket;
    const before = primaryParachute(rocket)!;

    const after = primaryParachute(applyGeometryEdits(rocket, { parachuteMass: 0.042 }))!;
    expect(after.mass).toBeCloseTo(0.042, 9);
    // The provenance moves with the number, exactly as `cdFrom` does beside it — otherwise the parts
    // table captions a hand-typed weight "stated by the design".
    expect(after.massFrom).toBe("flyer");
    // A weight is not a shape: the canopy is the same size and the same porosity as before.
    expect(after.diameter).toBeCloseTo(before.diameter, 9);
    expect(after.cd).toBeCloseTo(before.cd, 9);
    expect(primaryParachute(rocket)!.mass).toBeCloseTo(before.mass, 9);
  });

  /** **0 is a value here and an absence everywhere else in this bag**, which is the one thing about
   *  this field a future reader is most likely to "fix". A canopy weighed at nothing worth counting
   *  is a real answer; the EMPTY FIELD is what means "leave it alone". */
  it("takes a weighed zero as an answer rather than as an empty field", () => {
    const rocket = newDesign().rocket;
    const after = primaryParachute(applyGeometryEdits(rocket, { parachuteMass: 0 }))!;
    expect(after.mass).toBe(0);
    expect(after.massFrom).toBe("flyer");
  });

  it("refuses a mass that cannot mean anything, rather than flying it", () => {
    const rocket = newDesign().rocket;
    const before = primaryParachute(rocket)!;
    for (const kg of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const after = primaryParachute(applyGeometryEdits(rocket, { parachuteMass: kg }))!;
      expect(after.mass).toBeCloseTo(before.mass, 9);
      expect(after.massFrom).toBe(before.massFrom);
    }
  });

  /** **The ordering, which is the part that is load-bearing rather than tidy.** A resize SCALES the
   *  canopy's mass by (new/old)² — right for a mass Loft is estimating, wrong for one the flyer put
   *  on a scale. Applied in the other order the resize would silently multiply the flyer's own
   *  measurement, and the number on screen would not be the number they typed. */
  it("gives the flyer's weighed mass the last word over a resize in the same edit", () => {
    const rocket = newDesign().rocket;
    const before = primaryParachute(rocket)!;
    const bigger = before.diameter * 2;

    // Resize alone scales the mass — the behaviour being protected, asserted so this test fails if
    // that scaling ever quietly disappears and makes the ordering moot.
    const resizedOnly = primaryParachute(applyGeometryEdits(rocket, { mainParachuteDiameter: bigger }))!;
    expect(resizedOnly.mass).toBeGreaterThan(before.mass * 3);

    const both = primaryParachute(
      applyGeometryEdits(rocket, { mainParachuteDiameter: bigger, parachuteMass: 0.042 }),
    )!;
    expect(both.diameter).toBeCloseTo(bigger, 9);
    expect(both.mass).toBeCloseTo(0.042, 9); // the typed figure, NOT 0.042 x 4
    expect(both.massFrom).toBe("flyer");
  });

  it("reaches the solver, not just the model", () => {
    const rocket = newDesign().rocket;
    const apogee = (kg: number) =>
      runFlight(applyGeometryEdits(rocket, { parachuteMass: kg }), {}).result.summary.apogee;
    // A kilogram of canopy is dead weight the motor has to lift. Asserted as an ordering against a
    // real flight, because an edit that reaches the model and not the solver is the failure here.
    expect(apogee(1)).toBeLessThan(apogee(0.001));
  });

  it("counts as an edit, and is aimed by the same slot as the rest of the canopy's fields", () => {
    expect(hasGeometryEdits({ parachuteMass: 0.042 })).toBe(true);
    // Zero counts too — it is a figure the flyer typed, and a design flying it is edited.
    expect(hasGeometryEdits({ parachuteMass: 0 })).toBe(true);
    expect(hasGeometryEdits({})).toBe(false);

    const rocket = newDesign().rocket;
    const chute = primaryParachute(rocket)!;
    // Selecting the canopy aims the canopy slot — the one this field is listed under.
    expect(aimEditsAt(rocket, chute.id)).toEqual({ parachuteId: chute.id });

    // **And being listed under it is what makes a weighed figure die with its canopy.** An absolute
    // mass left behind when its part is removed still resolves through "the largest canopy", so it
    // would silently re-land on a different chute — the migration defect `catalogParachute` was
    // added to this slot's targets to prevent. Asserted through the real clearing path rather than
    // by reading the table, so an entry deleted from `targets` fails here.
    const cleared = aimsClearedByRemoving(
      rocket,
      { parachuteId: chute.id, parachuteMass: 0.042, parachuteCd: 1.4 },
      chute.id,
    );
    expect(cleared).toHaveProperty("parachuteMass", undefined);
    expect("parachuteMass" in cleared).toBe(true); // present-and-undefined, i.e. actively cleared
  });

  /** **The aim has to be RESOLVED for a mass typed on its own, and it very nearly was not.**
   *
   *  `applyDimensionEdits` computes the canopy's target id only when one of the canopy fields is
   *  present, and a new field left off that list silently gets `undefined` — which makes the applier
   *  fall back to "the largest canopy". On a single-canopy design that fallback is the right answer,
   *  so nothing fails; on a dual-deploy design a flyer who selected the DROGUE and typed only a
   *  weight would weigh the MAIN instead. That is the mirror image of the resize defect the block's
   *  own comment documents, and it was live in this increment until a pre-push read of the diff.
   *
   *  Driven with `parachuteMass` as the ONLY edit, deliberately: adding any other canopy field would
   *  resolve the aim for it and the test would pass with the bug in place. */
  it("weighs the canopy the flyer selected, even when the mass is the only edit", async () => {
    const doc = await importOrk(readFileSync(resolve(process.cwd(), "fixtures/demo-dual-deploy.ork")));
    const rocket = doc.rocket;
    const chutes = flattenRocket(rocket)
      .filter((p) => p.component.kind === "parachute")
      .map((p) => p.component as Parachute);
    expect(chutes.length, "this case needs a design with two canopies").toBeGreaterThan(1);
    const main = chutes.reduce((a, b) => (b.diameter > a.diameter ? b : a));
    const drogue = chutes.reduce((a, b) => (b.diameter < a.diameter ? b : a));
    expect(drogue.id).not.toBe(main.id);

    const edited = applyGeometryEdits(rocket, { parachuteId: drogue.id, parachuteMass: 0.042 });
    const after = flattenRocket(edited)
      .filter((p) => p.component.kind === "parachute")
      .map((p) => p.component as Parachute);

    expect(after.find((c) => c.id === drogue.id)!.mass).toBeCloseTo(0.042, 9);
    expect(after.find((c) => c.id === drogue.id)!.massFrom).toBe("flyer");
    // And the main is untouched — the half that actually fails when the aim is not resolved.
    expect(after.find((c) => c.id === main.id)!.mass).toBeCloseTo(main.mass, 9);
    expect(after.find((c) => c.id === main.id)!.massFrom).toBe(main.massFrom);
  });
});

/** The mass override on the slot that covers the largest remaining population.
 *
 *  Measured over the 35-design corpus by kind, counting every mass the design or its source tool
 *  supplied rather than Loft: the five kinds this one slot addresses carry **45** between them —
 *  22 centring rings, 9 inner tubes, 8 couplers, 3 bulkheads, 3 engine blocks — against 26 for the
 *  nose cone and 13 for the body tube. One field, one slot, the biggest gap.
 *
 *  **Written to `overrideMass`, which is the real difference from the canopy.** A parachute has a
 *  mass of its own that `lib/sim/mass.ts` reads directly; a ring has none — its mass is computed from
 *  geometry and material every time — so the only way to state one is the override both importers
 *  already read. */
describe("applyGeometryEdits — an internal part's mass", () => {
  const ringDesign = (): Rocket => {
    const r = newDesign().rocket;
    const tube = flattenRocket(r).find((p) => p.component.kind === "bodytube")!.component;
    // Built as a real `RingComponent` rather than cast: the cast hid a missing `Material.type`, and
    // a fixture the compiler cannot check is a fixture that can drift away from the model it stands in
    // for — which is the whole reason `lib/model/edit.test.ts`'s type errors are on the ledger.
    const ring: RingComponent = {
      id: "ring-1",
      name: "Centring ring",
      kind: "centeringring",
      placement: { method: "top", offset: 0.01 },
      length: 0.005,
      outerRadius: 0.018,
      innerRadius: 0.009,
      material: { name: "Plywood", density: 630, type: "bulk" },
      children: [],
    };
    const withRing = (list: RocketComponent[]): RocketComponent[] =>
      list.map((c) =>
        c.id === tube.id ? { ...c, children: [...c.children, ring] } : { ...c, children: withRing(c.children) },
      );
    return { ...r, stages: r.stages.map((st) => ({ ...st, components: withRing(st.components) })) };
  };
  const ringOf = (r: Rocket) =>
    flattenRocket(r).find((p) => p.component.id === "ring-1")!.component as RocketComponent & {
      overrideMass?: number;
      massFrom?: string;
      outerRadius: number;
      length: number;
    };

  it("states the aimed part's mass as an override, and records the figure as the flyer's", () => {
    const rocket = ringDesign();
    const before = ringOf(rocket);
    expect(before.overrideMass).toBeUndefined(); // computed from geometry and stock until now

    const after = ringOf(applyGeometryEdits(rocket, { internalId: "ring-1", internalMass: 0.012 }));
    expect(after.overrideMass).toBeCloseTo(0.012, 9);
    expect(after.massFrom).toBe("flyer");
    // A weight is not a dimension: the ring is the same size as before.
    expect(after.outerRadius).toBeCloseTo(before.outerRadius, 9);
    expect(after.length).toBeCloseTo(before.length, 9);
  });

  it("takes a weighed zero as an answer rather than as an empty field", () => {
    const after = ringOf(applyGeometryEdits(ringDesign(), { internalId: "ring-1", internalMass: 0 }));
    expect(after.overrideMass).toBe(0);
    expect(after.massFrom).toBe("flyer");
  });

  it("refuses a mass that cannot mean anything", () => {
    for (const kg of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const after = ringOf(applyGeometryEdits(ringDesign(), { internalId: "ring-1", internalMass: kg }));
      expect(after.overrideMass).toBeUndefined();
      expect(after.massFrom).toBeUndefined();
    }
  });

  /** The override has to beat the geometry, which is the whole point of it — and the two are applied
   *  in one pass, so a resize in the same edit must not win. */
  it("overrules the geometry it is set alongside", () => {
    const edited = applyGeometryEdits(ringDesign(), {
      internalId: "ring-1",
      internalOuterDiameter: 0.05,
      internalMass: 0.012,
    });
    const after = ringOf(edited);
    expect(after.overrideMass).toBeCloseTo(0.012, 9);
    expect(after.outerRadius).toBeGreaterThan(0.018); // the resize landed too
    expect(dryMassProperties(edited).mass).toBeGreaterThan(0);
  });

  it("reaches the mass model, not just the tree", () => {
    const base = dryMassProperties(ringDesign()).mass;
    const heavy = dryMassProperties(applyGeometryEdits(ringDesign(), { internalId: "ring-1", internalMass: 1 })).mass;
    // A kilogram of centring ring is a kilogram the design now carries.
    expect(heavy).toBeGreaterThan(base + 0.9);
  });

  it("counts as an edit, and dies with the part it is aimed at", () => {
    expect(hasGeometryEdits({ internalMass: 0.012 })).toBe(true);
    expect(hasGeometryEdits({ internalMass: 0 })).toBe(true);
    expect(AIM_SLOTS.internalId.targets).toContain("internalMass");
    // Listed in the slot's targets, so removing the part clears the weighed figure with it rather
    // than migrating it onto whatever the primary-internal fallback finds next.
    const cleared = aimsClearedByRemoving(ringDesign(), { internalId: "ring-1", internalMass: 0.012 }, "ring-1");
    expect("internalMass" in cleared).toBe(true);
    expect(cleared.internalMass).toBeUndefined();
  });
});

/** The stated weight on the two kinds every rocket has.
 *
 *  Measured over the 35-design corpus by kind, counting every mass the design or its source tool
 *  supplied rather than Loft: **13 body tubes and 10 nose cones**. Those were the last airframe parts
 *  a flyer could read a scale onto and not type it in — the internal structure, the fittings, the
 *  canopies and the mass objects all gained the control first.
 *
 *  **Written to `overrideMass`, like the internal structure and unlike the canopy.** Neither kind has
 *  a mass field of its own: `lib/sim/mass.ts` derives a cone from its contour and a tube from its wall
 *  and stock, and `overrideMass` is the one thing it honours over that. */
describe("applyGeometryEdits — the airframe's own stated weight", () => {
  const partOf = (r: Rocket, id: string) =>
    flattenRocket(r).find((p) => p.component.id === id)!.component as RocketComponent & {
      overrideMass?: number;
      overrideSubcomponents?: boolean;
      massFrom?: string;
    };
  const noseOf = (r: Rocket) => flattenRocket(r).find((p) => p.component.kind === "nosecone")!.component;
  const tubesOf = (r: Rocket) =>
    flattenRocket(r).filter((p) => p.component.kind === "bodytube").map((p) => p.component);

  it("states the nose cone's mass as an override, and records the figure as the flyer's", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const nose = noseOf(rocket);
    const after = partOf(applyGeometryEdits(rocket, { noseMass: 0.089 }), nose.id);
    expect(after.overrideMass).toBeCloseTo(0.089, 9);
    expect(after.massFrom).toBe("flyer");
    // A weight is not a dimension: the cone is the same length as before.
    expect((after as unknown as { length: number }).length).toBeCloseTo(
      (nose as unknown as { length: number }).length,
      9,
    );
  });

  it("puts the tube's weight on the AIMED tube, and leaves the other alone", async () => {
    // The half that actually fails when the aim is not resolved. `demo-quirks.ork` carries two tubes
    // in one stage, so a fallback to "the primary tube" is visible rather than invisible — which is
    // exactly how the canopy's own aim bug reached a green gate once.
    const rocket = await load("demo-quirks.ork");
    const tubes = tubesOf(rocket);
    expect(tubes.length, "the fixture must carry more than one tube").toBeGreaterThan(1);
    const aimed = tubes[1];
    const other = tubes[0];
    const edited = applyGeometryEdits(rocket, { bodyTubeId: aimed.id, bodyTubeMass: 0.234 });
    expect(partOf(edited, aimed.id).overrideMass).toBeCloseTo(0.234, 9);
    expect(partOf(edited, aimed.id).massFrom).toBe("flyer");
    // Unchanged rather than absent: this fixture's OTHER tube states a weight of its own, which is
    // what makes it the right control — a fallback would overwrite a real stated figure, not fill a
    // blank, and the flyer would never see which of the two they had actually weighed.
    const before = other as RocketComponent & { overrideMass?: number; massFrom?: string };
    expect(before.overrideMass, "the fixture's other tube must state its own weight").toBeDefined();
    expect(partOf(edited, other.id).overrideMass).toBeCloseTo(before.overrideMass!, 9);
    expect(partOf(edited, other.id).massFrom).toBe(before.massFrom);
  });

  it("weighs the tube alone, and never the assembly inside it", async () => {
    // A tube is the one kind whose children are the norm, and `overrideSubcomponents` is what would
    // make a stated figure swallow them. Never SET here: OpenRocket's Override tab defaults to the
    // component alone, and the field says so.
    //
    // **Rewritten after a pre-push review showed the first version pinned nothing.** It asserted
    // `overrideSubcomponents` was `undefined` on a fixture whose tube never had one, and a dry mass
    // "greater than 0.3" that the design already exceeded — so it passed with `bodyTubeMass`
    // completely unimplemented. It now measures the SHIFT the edit causes, which cannot pass without
    // the feature: the tube's own contribution moves to the stated figure and every child's mass is
    // unchanged, so the design's total moves by exactly the difference.
    const rocket = await load("demo-single-deploy.ork");
    const tube = tubesOf(rocket)[0];
    expect(tube.children.length, "the fixture's tube must hold something").toBeGreaterThan(0);
    const before = massByComponent(rocket);
    const tubeWas = before.get(tube.id)!.mass;
    const kidsWere = tube.children.map((c) => before.get(c.id)?.mass ?? 0);
    const totalWas = dryMassProperties(rocket).mass;
    expect(tubeWas, "the fixture's tube must weigh something to begin with").toBeGreaterThan(0);

    const edited = applyGeometryEdits(rocket, { bodyTubeId: tube.id, bodyTubeMass: tubeWas + 0.25 });
    expect(partOf(edited, tube.id).overrideSubcomponents).toBeUndefined();
    const after = massByComponent(edited);
    // The tube now weighs exactly what was stated — the assertion that fails without the feature.
    expect(after.get(tube.id)!.mass).toBeCloseTo(tubeWas + 0.25, 9);
    // Every child keeps its own mass, unchanged and unsubsumed.
    tube.children.forEach((child, i) => {
      expect(after.get(child.id)?.subsumedBy, `${child.kind} must not be subsumed`).toBeUndefined();
      expect(after.get(child.id)?.mass ?? 0, `${child.kind} must keep its own mass`).toBeCloseTo(kidsWere[i], 9);
    });
    // So the design moved by the difference and by nothing else.
    expect(dryMassProperties(edited).mass).toBeCloseTo(totalWas + 0.25, 6);
  });

  it("leaves a tube that states its OWN assembly weight covering that assembly", async () => {
    // The case a pre-push review found on a BUNDLED fixture after the docblock had generalised a
    // corpus-only measurement to "any real design". `demo-quirks.ork`'s "Upper" carries
    // `overrideMass` WITH `overrideSubcomponents`, so its 600 g is the tube plus what is inside it.
    // `statedMassHolder` answers only the ancestor question and reports nothing for such a part, so
    // the field stays live — correctly, the flyer may restate that figure — and what the surface
    // must not do is call it the tube alone.
    const rocket = await load("demo-quirks.ork");
    const upper = tubesOf(rocket).find(
      (t) => (t as RocketComponent & { overrideSubcomponents?: boolean }).overrideSubcomponents,
    );
    expect(upper, "the fixture must carry a tube stating its own assembly weight").toBeTruthy();
    expect(statedMassHolder(rocket, upper!.id), "nothing ABOVE it states its weight").toBeNull();
    expect(statesOwnAssemblyMass(rocket, upper!.id), "but it states its own").toBe(true);
    // The figure on the surface is the assembly's, which is why the sentence beside it had to change.
    expect(massByComponent(rocket).get(upper!.id)!.mass).toBeCloseTo(0.6, 9);
    expect(upper!.children.length, "and it really does hold parts").toBeGreaterThan(0);
    // Restating it keeps the flag, so the number goes on meaning what it meant.
    const edited = applyGeometryEdits(rocket, { bodyTubeId: upper!.id, bodyTubeMass: 0.8 });
    expect(partOf(edited, upper!.id).overrideSubcomponents).toBe(true);
    expect(massByComponent(edited).get(upper!.id)!.mass).toBeCloseTo(0.8, 9);
  });

  it("takes a weighed zero as an answer, and refuses a mass that cannot mean anything", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const nose = noseOf(rocket);
    expect(partOf(applyGeometryEdits(rocket, { noseMass: 0 }), nose.id).overrideMass).toBe(0);
    for (const kg of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const after = partOf(applyGeometryEdits(rocket, { noseMass: kg }), nose.id);
      expect(after.overrideMass).toBeUndefined();
      expect(after.massFrom).not.toBe("flyer");
    }
  });

  it("reaches the mass model, not just the tree", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const base = dryMassProperties(rocket).mass;
    const heavy = dryMassProperties(applyGeometryEdits(rocket, { noseMass: 1 })).mass;
    // A kilogram of nose cone is a kilogram the design now carries.
    expect(heavy).toBeGreaterThan(base + 0.9);
  });

  /** The precedence that makes the field worth having: a scale reading is the flyer's own
   *  measurement, and nothing computed in the same patch may quietly replace it. */
  it("beats the caliber scale it is typed alongside", async () => {
    const rocket = await load("demo-single-deploy.ork");
    const tube = tubesOf(rocket)[0];
    const edited = applyGeometryEdits(rocket, {
      bodyTubeId: tube.id,
      bodyDiameter: (tube as unknown as { outerRadius: number }).outerRadius * 4,
      bodyTubeMass: 0.234,
    });
    expect(partOf(edited, tube.id).overrideMass).toBeCloseTo(0.234, 9);
    // The scale landed too — the two compose rather than compete.
    expect((partOf(edited, tube.id) as unknown as { outerRadius: number }).outerRadius).toBeGreaterThan(
      (tube as unknown as { outerRadius: number }).outerRadius,
    );
  });

  it("counts as an edit, and the tube's dies with the tube it is aimed at", async () => {
    expect(hasGeometryEdits({ noseMass: 0.089 })).toBe(true);
    expect(hasGeometryEdits({ noseMass: 0 })).toBe(true);
    expect(hasGeometryEdits({ bodyTubeMass: 0.234 })).toBe(true);
    expect(hasGeometryEdits({ bodyTubeMass: 0 })).toBe(true);
    expect(AIM_SLOTS.bodyTubeId.targets).toContain("bodyTubeMass");
    // The nose is deliberately NOT in a slot — there is none — so it cannot migrate: `primaryNose`
    // is what `noseLength`, `noseShape` and the catalogue pick already resolve through.
    expect(Object.values(AIM_SLOTS).some((d) => d.targets.includes("noseMass"))).toBe(false);
    const rocket = await load("demo-quirks.ork");
    const aimed = tubesOf(rocket)[1];
    const cleared = aimsClearedByRemoving(
      rocket,
      { bodyTubeId: aimed.id, bodyTubeMass: 0.234 },
      aimed.id,
    );
    expect("bodyTubeMass" in cleared).toBe(true);
    expect(cleared.bodyTubeMass).toBeUndefined();
  });
});

describe("the internal structure is a part like any other", () => {
  // The largest unreachable population in the model until now. Measured over the 35-design corpus:
  // 249 of 569 parts (43.8%) had no field describing them, and 194 of those 249 are these five
  // kinds — 83 centring rings, 37 inner tubes, 31 couplers, 29 bulkheads, 14 engine blocks.
  const SINGLE = "fixtures/demo-single-deploy.ork";
  const load = async (f: string) => importOrk(readFileSync(resolve(process.cwd(), f)));

  /** A design with one body tube holding one coupler, built by hand so every number under test is
   *  stated here rather than read off a fixture that may change underneath it. */
  const hosted = (part: Partial<RingComponent & InnerTube> & { kind: RocketComponent["kind"] }): Rocket => {
    const inner = {
      id: "inner", name: "Coupler", placement: { method: "top" as const, offset: 0.05 },
      length: 0.1, outerRadius: 0.024, innerRadius: 0.022, children: [],
      // A stated stock, because these kinds reach the flight through mass alone and mass is
      // geometry x density: with no material the density is 0 and every assertion below would pass
      // over a part that weighs nothing however it is sized.
      material: { name: "cardboard", density: 680, type: "bulk" } as Material, ...part,
    } as unknown as RocketComponent;
    const tube: BodyTube = {
      id: "tube", name: "Body", kind: "bodytube", placement: { method: "after", offset: 0 },
      length: 0.4, outerRadius: 0.025, thickness: 0.001, children: [inner],
      material: { name: "cardboard", density: 680, type: "bulk" },
    };
    return { name: "t", stages: [{ name: "S", components: [tube] }], configurations: [], referenceType: "maximum" };
  };

  it("aims all five kinds at one slot, and nothing else at it", () => {
    for (const kind of ["tubecoupler", "centeringring", "bulkhead", "engineblock", "innertube"] as const) {
      const r = hosted({ kind });
      expect(aimEditsAt(r, "inner")).toEqual({ internalId: "inner" });
      expect(primaryInternalPart(r, "inner")!.id).toBe("inner");
    }
    // A body tube is not internal structure, however much of it is inside the airframe.
    expect(aimEditsAt(hosted({ kind: "tubecoupler" }), "tube")).toEqual({ bodyTubeId: "tube" });
  });

  it("edits the part it names, and reaches the flight through its mass", () => {
    const r = hosted({ kind: "tubecoupler" });
    const before = dryMassProperties(r).mass;
    const grown = applyGeometryEdits(r, { internalId: "inner", internalLength: 0.2 });
    const made = flattenRocket(grown).find((p) => p.component.id === "inner")!.component as RingComponent;
    expect(made.length).toBeCloseTo(0.2, 9);
    // Twice the coupler is twice the coupler's mass, and the airframe around it has not moved: these
    // kinds carry no aerodynamic term at all, so mass is the ONLY route to the flight and a change
    // that did not move it would be a field that does nothing.
    expect(dryMassProperties(grown).mass).toBeGreaterThan(before);
    expect(overallLength(grown)).toBeCloseTo(overallLength(r), 9);
  });

  it("holds a part to the one holding it, and advertises exactly the bound it enforces", () => {
    const r = hosted({ kind: "tubecoupler" });
    const bounds = internalPartBounds(r, "inner");
    // The host is 400 mm long and bores to 24 mm (25 mm outer less a 1 mm wall).
    expect(bounds.maxLength).toBeCloseTo(0.4, 9);
    expect(bounds.maxOuterDiameter).toBeCloseTo(0.048, 9);

    // Past either bound the model takes the bound — the same number the panel advertises. A coupler
    // longer than its tube, or wider than its tube's bore, is not a rocket anyone built.
    const over = applyGeometryEdits(r, {
      internalId: "inner", internalLength: 5, internalOuterDiameter: 0.5,
    });
    const made = flattenRocket(over).find((p) => p.component.id === "inner")!.component as RingComponent;
    expect(made.length).toBeCloseTo(bounds.maxLength!, 9);
    expect(made.outerRadius * 2).toBeCloseTo(bounds.maxOuterDiameter!, 9);
  });

  it("never flies a part made of nothing, however the bore is typed", () => {
    const r = hosted({ kind: "centeringring" });
    // A bore at or above the outer diameter is a zero wall and a zero mass, and the CG the flight
    // reports would come from a component that cannot exist. The cap is a clamp rather than a
    // refusal — "as thin as it goes" is legible intent — and it is the ONE constant both the panel
    // and the applier read.
    const flat = applyGeometryEdits(r, { internalId: "inner", internalInnerDiameter: 0.2 });
    const ring = flattenRocket(flat).find((p) => p.component.id === "inner")!.component as RingComponent;
    expect(ring.innerRadius).toBeLessThan(ring.outerRadius);
    expect(ring.innerRadius).toBeCloseTo(ring.outerRadius * INTERNAL_MAX_BORE_FRACTION, 9);
    expect(dryMassProperties(flat).mass).toBeGreaterThan(0);

    // A bore of ZERO is a real answer and the only field in the editor for which it is: a disc with
    // no hole is what a bulkhead is.
    const solid = applyGeometryEdits(r, { internalId: "inner", internalInnerDiameter: 0 });
    const disc = flattenRocket(solid).find((p) => p.component.id === "inner")!.component as RingComponent;
    expect(disc.innerRadius).toBe(0);
    expect(dryMassProperties(solid).mass).toBeGreaterThan(dryMassProperties(r).mass);
  });

  it("measures the bore against the outer diameter BEING FLOWN, not the one on file", () => {
    // Both fields in one commit: the part narrows to 20 mm and the bore is typed at 22 mm. Measured
    // against the file's own 24 mm the bore passes and the part flies inside out; measured against
    // the 20 mm actually being flown it is capped under it, which is what the panel promises.
    const r = hosted({ kind: "tubecoupler" });
    const both = applyGeometryEdits(r, {
      internalId: "inner", internalOuterDiameter: 0.02, internalInnerDiameter: 0.022,
    });
    const made = flattenRocket(both).find((p) => p.component.id === "inner")!.component as RingComponent;
    expect(made.outerRadius * 2).toBeCloseTo(0.02, 9);
    expect(made.innerRadius).toBeLessThan(made.outerRadius);
    expect(made.innerRadius * 2).toBeCloseTo(0.02 * INTERNAL_MAX_BORE_FRACTION, 9);
  });

  it("keeps the wall the design drew when only the outside is narrowed", () => {
    // The flyer narrowed the part and said nothing about the hole. Leaving the bore where it was
    // would fly a part inside out; taking the bore cap would silently turn a 2 mm wall into foil.
    const r = hosted({ kind: "tubecoupler" }); // 24 mm outer radius, 22 mm bore ⇒ a 2 mm wall
    const thin = applyGeometryEdits(r, { internalId: "inner", internalOuterDiameter: 0.03 });
    const made = flattenRocket(thin).find((p) => p.component.id === "inner")!.component as RingComponent;
    expect(made.outerRadius).toBeCloseTo(0.015, 9);
    expect(made.outerRadius - made.innerRadius).toBeCloseTo(0.002, 9);
  });

  it("names the part the fields are holding, told apart from every other internal part", async () => {
    const doc = await load(SINGLE);
    const aim = primaryInternalPartAim(doc.rocket);
    // The fixture may or may not carry internal structure; where it does, the caption resolves and
    // the count agrees with the flatten. Where it does not, both say so, which is also correct.
    const all = flattenRocket(doc.rocket).filter((p) =>
      ["tubecoupler", "centeringring", "bulkhead", "engineblock", "innertube"].includes(p.component.kind),
    );
    if (!all.length) {
      expect(aim).toBeUndefined();
      expect(unreachableInternalCount(doc.rocket)).toBe(0);
      return;
    }
    expect(aim).toBeTruthy();
    expect(unreachableInternalCount(doc.rocket)).toBe(all.length - 1);
  });

  it("calls a plate a thickness and a tube a length", () => {
    // One model field, two flyers' words, and OpenRocket's own dialogs make the same split. A single
    // label would be wrong for one of the two on every design that carries both.
    expect(internalSpanLabel("centeringring")).toBe("Thickness");
    expect(internalSpanLabel("bulkhead")).toBe("Thickness");
    expect(internalSpanLabel("engineblock")).toBe("Thickness");
    expect(internalSpanLabel("tubecoupler")).toBe("Length");
    expect(internalSpanLabel("innertube")).toBe("Length");
  });

  it("never flies a part inside out or wider than its tube, under a caliber change too", () => {
    // **Both halves of this were real and both were found by review over a green gate**, and they are
    // the same defect: the bounds are measured on the PRISTINE tree while the edit is written after
    // `scaleAirframeRadii`, which moves the very radii those bounds were measured against.
    const r = hosted({ kind: "tubecoupler" }); // host D50 x 1 mm wall; coupler D48, bore D44
    const scale = 0.5;
    const bodyDiameter = 0.05 * scale;

    // 1. **The bore.** Type a bore just under the coupler's own 48 mm, then halve the airframe. The
    //    coupler scales with the caliber, so the bore typed against 48 mm would be wider than the
    //    24 mm part it is cut in — a part with a negative wall, which the mass model drops to
    //    nothing at a fixed station.
    const both = applyGeometryEdits(r, {
      internalId: "inner", internalInnerDiameter: 0.047, bodyDiameter,
    });
    const c1 = flattenRocket(both).find((p) => p.component.id === "inner")!.component as RingComponent;
    expect(c1.innerRadius, "the bore ended up at or past the wall it is cut in").toBeLessThan(c1.outerRadius);
    expect(dryMassProperties(both).mass).toBeGreaterThan(0);

    // 2. **The outer diameter.** Type the coupler's own 48 mm — which the panel offers, it is the
    //    placeholder — then halve the airframe. The host's bore is now 24 mm, so a 48 mm coupler is
    //    wider than the tube around it, and `outerRadius` reads the WIDEST part: the reference area
    //    the whole flight is computed against would come from a part inside the airframe.
    const wide = applyGeometryEdits(r, {
      internalId: "inner", internalOuterDiameter: 0.048, bodyDiameter,
    });
    const c2 = flattenRocket(wide).find((p) => p.component.id === "inner")!.component as RingComponent;
    const host = flattenRocket(wide).find((p) => p.component.id === "tube")!.component as BodyTube;
    expect(
      c2.outerRadius,
      "an internal part is wider than the tube holding it, so it sets the reference area",
    ).toBeLessThanOrEqual(host.outerRadius + 1e-12);
  });

  it("takes its values with it when the aim moves, and when the part is removed", () => {
    const r = hosted({ kind: "tubecoupler" });
    const held = { internalId: "inner", internalLength: 0.2, internalOuterDiameter: 0.02 };
    // Re-aiming at a part just authored clears the absolute numbers that described the old one —
    // exactly as every other slot does, because both rules read `AIM_SLOTS` rather than a list.
    const moved = aimsClearedByAiming(held, { internalId: "other" });
    expect(moved.internalLength).toBeUndefined();
    expect(moved.internalOuterDiameter).toBeUndefined();
    // And a removal takes the aim AND the values, so no unaimed absolute lands on a surviving part.
    const cleared = aimsClearedByRemoving(r, held, "inner");
    expect(cleared.internalId).toBeUndefined();
    expect(cleared.internalLength).toBeUndefined();
    expect(cleared.internalOuterDiameter).toBeUndefined();
  });
});

describe("the external fittings are parts like any other", () => {
  // The LAST kinds in the model with no field. 54 parts across the 35-design corpus after the
  // internal structure was covered — 24 shock cords on 21 designs, 19 launch lugs on 14, 11 rail
  // buttons on 9 — and two of the three reach the flight through DRAG as well as through mass.
  const mk = (kind: "shockcord" | "launchlug" | "railbutton"): Rocket => {
    const fitting = {
      id: "fit", name: "Lug", kind, placement: { method: "top" as const, offset: 0.1 },
      mass: 0.002, length: 0.05, radius: 0.004, instanceCount: 1, children: [],
    } as unknown as RocketComponent;
    const tube: BodyTube = {
      id: "tube", name: "Body", kind: "bodytube", placement: { method: "after", offset: 0 },
      length: 0.5, outerRadius: 0.025, thickness: 0.001, children: [fitting],
      material: { name: "cardboard", density: 680, type: "bulk" },
    };
    const nose: NoseCone = {
      id: "nose", name: "Nose", kind: "nosecone", placement: { method: "top", offset: 0 },
      length: 0.1, aftRadius: 0.025, shape: "ogive", children: [],
      material: { name: "cardboard", density: 680, type: "bulk" },
    };
    return { name: "t", stages: [{ name: "S", components: [nose, tube] }], configurations: [], referenceType: "maximum" };
  };

  it("aims all three kinds at one slot", () => {
    for (const kind of ["shockcord", "launchlug", "railbutton"] as const) {
      expect(aimEditsAt(mk(kind), "fit")).toEqual({ fittingId: "fit" });
      expect(primaryFitting(mk(kind), "fit")!.id).toBe("fit");
    }
    // A streamer is a recovery device, not a fitting, and is deliberately outside this slot.
    expect(fittingHasDrag("launchlug")).toBe(true);
    expect(fittingHasDrag("railbutton")).toBe(true);
    expect(fittingHasDrag("shockcord")).toBe(false);
  });

  it("changes the four numbers it names, and the count multiplies rather than replaces", () => {
    const r = mk("railbutton");
    const out = applyGeometryEdits(r, {
      fittingId: "fit", fittingMass: 0.004, fittingLength: 0.02, fittingDiameter: 0.012, fittingCount: 2,
    });
    const f = flattenRocket(out).find((p) => p.component.id === "fit")!.component as unknown as {
      mass: number; length: number; radius: number; instanceCount: number;
    };
    // The mass field is PER INSTANCE, so two at 4 g each are stored as the 8 g total the model flies.
    expect(f.mass).toBeCloseTo(0.008, 9);
    expect(fittingUnitMass(out, "fit")).toBeCloseTo(0.004, 9);
    expect(f.length).toBeCloseTo(0.02, 9);
    expect(f.radius).toBeCloseTo(0.006, 9);
    expect(f.instanceCount).toBe(2);
  });

  it("reaches the FLIGHT through drag, not only through mass", () => {
    // The claim that makes this more than a completeness exercise. `lib/sim/aero.ts` sums
    // `count x pi x radius^2` over every lug and button into the protuberance area, so a pair of
    // buttons entered as one is drag the flight is not carrying. Driven against a real flight,
    // because an edit that reaches the model and not the solver is the failure this catches.
    // The STARTER design rather than the hand-built one above, because this needs a rocket that
    // actually flies — a motor, a canopy, the lot — and a pair of rail buttons bolted onto its body
    // tube is exactly what a real design carries.
    const starter = newDesign().rocket;
    const host = flattenRocket(starter).find((p) => p.component.kind === "bodytube")!.component;
    const button = {
      id: "fit", name: "Rail button", kind: "railbutton",
      placement: { method: "top" as const, offset: 0.1 },
      mass: 0.002, length: 0.01, radius: 0.004, instanceCount: 1, children: [],
    } as unknown as RocketComponent;
    const withButton = JSON.parse(JSON.stringify(starter)) as Rocket;
    const hostIn = flattenRocket(withButton).find((p) => p.component.id === host.id)!.component;
    hostIn.children = [...hostIn.children, button];
    const r = withButton;
    const fly = (e: GeometryEdits) => runFlight(applyGeometryEdits(r, e), {}).result.summary.apogee;
    const base = fly({});
    expect(base).toBeGreaterThan(0);
    // **Each of the two drag inputs moved ON ITS OWN**, because together they cannot tell which one
    // is doing the work — a first version varied both and passed with the count wired to nothing.
    const wider = fly({ fittingId: "fit", fittingDiameter: 0.02 });
    expect(wider, "a wider protuberance did not cost the flight any apogee").toBeLessThan(base);
    const more = fly({ fittingId: "fit", fittingCount: 8 });
    expect(more, "eight of the fitting drag no more than one — the count reaches nothing").toBeLessThan(base);
  });

  it("refuses a fitting wider than the airframe it is bolted to, and a count below one", () => {
    const r = mk("launchlug");
    // The airframe is 50 mm; a 200 mm lug on it would put more frontal area outside the rocket than
    // the rocket has.
    const wide = applyGeometryEdits(r, { fittingId: "fit", fittingDiameter: 0.2 });
    const f = flattenRocket(wide).find((p) => p.component.id === "fit")!.component as unknown as { radius: number };
    expect(f.radius).toBeCloseTo(0.025, 9);
    // A count below one is a removal, which the editor has a verb for, so it is not an edit here.
    const none = applyGeometryEdits(r, { fittingId: "fit", fittingCount: 0 });
    const g = flattenRocket(none).find((p) => p.component.id === "fit")!.component as unknown as { instanceCount: number };
    expect(g.instanceCount).toBe(1);
    // And a fractional count is rounded rather than flown as it stands.
    const half = applyGeometryEdits(r, { fittingId: "fit", fittingCount: 2.4 });
    const h = flattenRocket(half).find((p) => p.component.id === "fit")!.component as unknown as { instanceCount: number };
    expect(h.instanceCount).toBe(2);
  });

  it("carries the mass with the count, because a fitting's mass is the total across its instances", () => {
    // Every other consumer already reads `mass` as the total: `lib/sim/aero.ts` multiplies the frontal
    // area by the count, `lib/ork/export.ts` divides by it to write a per-instance `<mass>`, and
    // `lib/ork/adapt.ts` multiplies the computed per-instance mass by it on the way in. The applier
    // did not, so a design imported at count 4 and the same design edited to count 4 were two
    // different rockets — the drag agreed and the mass did not.
    const r = mk("railbutton");
    const massAt = (e: GeometryEdits) => dryMassProperties(applyGeometryEdits(r, e)).mass;
    const one = massAt({ fittingId: "fit", fittingCount: 1 });
    const four = massAt({ fittingId: "fit", fittingCount: 4 });
    const own = flattenRocket(r).find((p) => p.component.id === "fit")!.component as unknown as { mass: number };
    expect(four - one, "three more rail buttons weighed nothing").toBeCloseTo(own.mass * 3, 9);
    // Negative control: without the count carrying the mass, this delta is exactly zero.
    expect(four).not.toBeCloseTo(one, 9);
    // A mass typed in the SAME edit wins outright — the flyer has answered with a scale, and that
    // answer is the total, not a per-instance figure to be multiplied again.
    const typed = applyGeometryEdits(r, { fittingId: "fit", fittingCount: 4, fittingMass: 0.01 });
    const t = flattenRocket(typed).find((p) => p.component.id === "fit")!.component as unknown as { mass: number };
    expect(t.mass, "four at 10 g each is a 40 g total").toBeCloseTo(0.04, 9);
    // And it reads straight back out as the number that was typed, which is the property that makes
    // this field safe to retype: the panel can never advertise a figure the flight is not using.
    expect(fittingUnitMass(typed, "fit")).toBeCloseTo(0.01, 9);
  });

  it("never advertises a fitting mass the flight is not using, however the count moves", () => {
    // The property that makes the per-instance field safe, and the one a first version broke: the
    // readback is what the panel puts in front of the flyer as "the design's own", and the obvious
    // next gesture is to type it back. With the stored TOTAL on that field, a count of four turned
    // retyping the advertised number into a silent divide-by-four of the fitting's mass.
    const r = mk("railbutton");
    const advertised = fittingUnitMass(r, "fit")!;
    for (const count of [1, 2, 5, 16]) {
      const out = applyGeometryEdits(r, { fittingId: "fit", fittingCount: count });
      expect(fittingUnitMass(out, "fit"), `the count ${count} moved what one of them weighs`)
        .toBeCloseTo(advertised, 9);
      // Retyping the advertised figure at that count is a no-op on the flown mass — the whole point.
      const retyped = applyGeometryEdits(r, { fittingId: "fit", fittingCount: count, fittingMass: advertised });
      expect(dryMassProperties(retyped).mass, `retyping the advertised mass at count ${count} moved the rocket`)
        .toBeCloseTo(dryMassProperties(out).mass, 9);
    }
  });

  it("carries a STATED mass with the count too, which on a RockSim design is the only mass there is", () => {
    // `componentPointMass` reads `overrideMass` in preference to `mass`, and `lib/rkt/adapt.ts`
    // synthesises one on every structural part — so on a `.rkt` fitting the mass edit above lands on a
    // field nothing reads. Two real launch lugs on `FullScaleModelTH.rkt` are exactly this, and the
    // corpus sweep found them after the unit case above was already green.
    const base = mk("launchlug");
    const withOverride = JSON.parse(JSON.stringify(base)) as Rocket;
    const lug = flattenRocket(withOverride).find((p) => p.component.id === "fit")!.component as unknown as {
      overrideMass?: number; instanceCount?: number;
    };
    lug.overrideMass = 0.008;
    lug.instanceCount = 2;
    const massAt = (e: GeometryEdits) => dryMassProperties(applyGeometryEdits(withOverride, e)).mass;
    const two = massAt({ fittingId: "fit", fittingCount: 2 });
    const six = massAt({ fittingId: "fit", fittingCount: 6 });
    // Three times as many, so three times the stated total: 8 g becomes 24 g, a 16 g delta.
    expect(six - two, "a stated mass ignored the count that tripled it").toBeCloseTo(0.016, 9);
    // And typing a mass CLEARS the override, because a figure the flyer just weighed must not be
    // shadowed by one the importer synthesised.
    const answered = applyGeometryEdits(withOverride, { fittingId: "fit", fittingMass: 0.005 });
    const a = flattenRocket(answered).find((p) => p.component.id === "fit")!.component as unknown as {
      mass: number; overrideMass?: number;
    };
    expect(a.overrideMass).toBeUndefined();
    // The field is PER INSTANCE and the design carries two, so the stored total is twice what was
    // typed — and `fittingUnitMass` reads it back as the 5 g that was entered.
    expect(a.mass).toBeCloseTo(0.010, 9);
    expect(fittingUnitMass(answered, "fit")).toBeCloseTo(0.005, 9);
  });

  it("holds the diameter to the airframe it is FLYING, not the one it was designed at", () => {
    // The ceiling is measured on the pristine tree and applied after `scaleAirframeRadii`, so it has
    // to carry the caliber factor — the same correction `internalGeometryEdit` already makes. Without
    // it the panel advertised the widened diameter while this clamped to the old one, and the field
    // sat showing a number the flight did not use.
    const r = mk("railbutton");
    const pristine = 2 * maxBodyRadius(r);
    const widened = pristine * 2;
    // Typed between the old ceiling and the new one: it is legal against the airframe being flown.
    const inside = pristine * 1.5;
    const out = applyGeometryEdits(r, { bodyDiameter: widened, fittingId: "fit", fittingDiameter: inside });
    const f = flattenRocket(out).find((p) => p.component.id === "fit")!.component as unknown as { radius: number };
    expect(f.radius * 2, "clamped to the airframe's PRE-scale diameter").toBeCloseTo(inside, 9);
    expect(2 * maxBodyRadius(out)).toBeCloseTo(widened, 9);
    // And the ceiling still bites: above the flown airframe it clamps to the flown airframe.
    const over = applyGeometryEdits(r, { bodyDiameter: widened, fittingId: "fit", fittingDiameter: widened * 2 });
    const g = flattenRocket(over).find((p) => p.component.id === "fit")!.component as unknown as { radius: number };
    expect(g.radius * 2).toBeCloseTo(widened, 9);
    // A narrowing what-if tightens it in the same way, so the bound is never stale in either direction.
    const narrow = pristine * 0.5;
    const tight = applyGeometryEdits(r, { bodyDiameter: narrow, fittingId: "fit", fittingDiameter: pristine });
    const h = flattenRocket(tight).find((p) => p.component.id === "fit")!.component as unknown as { radius: number };
    expect(h.radius * 2).toBeCloseTo(narrow, 9);
  });

  it("takes its values with it when the aim moves or the part is removed", () => {
    const r = mk("launchlug");
    const held = { fittingId: "fit", fittingMass: 0.01, fittingDiameter: 0.01 };
    const moved = aimsClearedByAiming(held, { fittingId: "other" });
    expect(moved.fittingMass).toBeUndefined();
    expect(moved.fittingDiameter).toBeUndefined();
    const cleared = aimsClearedByRemoving(r, held, "fit");
    expect(cleared.fittingId).toBeUndefined();
    expect(cleared.fittingMass).toBeUndefined();
  });
});
