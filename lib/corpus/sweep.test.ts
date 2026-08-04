/** The real-design corpus suite.
 *
 *  Loft's sharpest bug-finder is driving actual in-the-wild design files: every `.ork` and `.rkt`
 *  carries its own tool's stored simulation, so each file is a built-in accuracy oracle. Those
 *  files live in a separate private repository — they are other people's designs, under their own
 *  terms — and are never committed here. This suite runs against whatever corpus is present and
 *  **skips itself when there is none**, so a public clone and a fork's CI stay green.
 *
 *  Point it at a corpus with `LOFT_CORPUS_DIR`, or extract one into a gitignored `corpus/` at the
 *  repo root. The layout is one directory per source tool:
 *
 *      corpus/openrocket/*.ork   corpus/rocksim/*.rkt   corpus/rasaero/*.CDX1
 *
 *  What it asserts:
 *   - every design file imports without throwing;
 *   - where Loft flew the complete design and the file stores results, both the apogee AND the max
 *     velocity agree within `TOLERANCE_PCT` — unless the case is listed in `KNOWN_ISSUES` with a
 *     reason. Apogee alone is not the trajectory: a heavier rocket that also drags less reaches a
 *     similar height on a different flight, so the speed it got there at is what separates accuracy
 *     from two errors cancelling.
 *
 *  A file Loft still gets wrong belongs in KNOWN_ISSUES, parsed and flown but not asserted, so the
 *  gap is documented rather than baked in as correct. Fix the cause, then delete the entry to arm
 *  the assert. Never widen the tolerance to make a case pass.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { importDesign } from "../ork/import";
import { resolveMotor, sameCasing } from "../motors/db";
import { runFlight, runFromDocument, overridesFromStored } from "../sim/run";
import { monteCarlo, summarizeSamples } from "../sim/montecarlo";
import {
  flattenRocket,
  leadingFaceDiameter,
  mouldLineSteps,
  STEP_NOTICE_M,
  overallLength,
} from "../model/geometry";
import type { Rocket, RocketComponent } from "../model/types";
import {
  applyGeometryEdits,
  moveTarget,
  moveSlots,
  canAddStage,
  canAddMount,
  stageSeedBase,
  removalRefusal,
  transitionDefaults,
  newPartId,
  aimEditsAt,
  primaryMassObject,
  primaryNose,
  primaryMotorClusterCount,
  primaryMountGroupIds,
  unreachableMountCount,
} from "../model/edit";
import { dryMassProperties, massByComponent, statedMassHolder } from "../sim/mass";

const CORPUS_DIR = process.env.LOFT_CORPUS_DIR ?? resolve(process.cwd(), "corpus");
const TOLERANCE_PCT = 12;

/** Cases Loft does not yet get right, each with why. Keyed `<file>::<simulation name>`; a bare
 *  `<file>` covers every simulation in it. These are flown but not asserted. */
const KNOWN_ISSUES: Record<string, string> = {
  "APEX_K_Dart.ork":
    "Mach 2+ minimum-diameter dart. Above M0.8 the wave-drag model is a bounded parametric " +
    "estimate, not a solved one, and the flight is flagged extrapolated.",
  "OR vs RAS Test 1.ork":
    "Mach 2.3 minimum-diameter N1000. The two reference tools disagree with EACH OTHER by ~60% " +
    "on this design (OpenRocket 45,636 ft vs RASAero 73,409 ft), so there is no single target.",
  "OR vs RAS Test 1.CDX1": "Same design as the .ork above; see that entry.",
  "rocksimTestRocket1.rkt":
    "OpenRocket's synthetic RockSim import-test file. Its stored results don't match its own " +
    "geometry — max acceleration reads 52% off, a pre-deployment number — so it is not a usable " +
    "accuracy oracle.",
  "TubeFins1.rkt::C6-5":
    "Synthetic import-test file whose stored per-part masses weigh the tube fins as solid rods. " +
    "Its apogee happens to land within 6% while max velocity reads 25% and max acceleration 60% " +
    "high — the file flies a much heavier rocket than its own geometry describes, so agreeing " +
    "with its apogee would be two errors cancelling, not accuracy.",
  "Complex.Two-Stage.CDX1::J90W":
    "Two-stage RASAero design, newly flown staged rather than sustainer-only. Its other " +
    "configuration (J180T + I215R) lands at +4.5% apogee and −1.9% max velocity; this one, on the " +
    "long-burn J90W, reads +12.4% and +8.0%. RASAero stores nearly the same apogee for both " +
    "(1326.5 m and 1328.6 m) despite very different motors, which Loft doesn't reproduce. Flying " +
    "the sustainer after separation rather than at booster burnout was tried and made BOTH " +
    "configurations worse (+23.6% and +21.7%), so the timing is not the cause.",
  "Punisher Apprentice.ork::Simulation 10":
    "Largest motor in a nine-simulation sweep; the rest land within 8%.",
  "03.Three-stage.ork":
    "Third-stage burn still diverges after the ignition-order fix. **Re-measured 2026-08-02, and " +
    "the previous text was stale in both halves**: it said apogee was within 10% and max velocity " +
    "read 17% low. Before R7's per-set fin cross-section it was apogee -7.57% and max velocity " +
    "-3.78%; after, apogee +10.76%, max velocity +4.95% and FLIGHT TIME +10.67% (it was -5.6%), " +
    "which is the number a flyer sizes a tracking or recovery window on and is nearly as large as " +
    "the apogee error. This design is the one place in the " +
    "corpus where that fix made an APOGEE error worse. It is not the only design it touched at all: " +
    "02.Two-stage.ork's max-velocity error grew 0.51% -> 0.92% while its apogee error fell -2.15% -> " +
    "-0.38%. The reason here is known rather than mysterious: " +
    "three of its five fin sets are rounded and were being billed as square (over-drag), while its " +
    "leading-edge sweep is still collapsed to one design-wide 22.4 degrees against five real sets at " +
    "35.0-70.6 degrees (also over-drag). The two were partly cancelling, and only one is fixed. " +
    "R7's sweep slice is what closes the other; making it per-set in the same increment was measured " +
    "and reverted, because it moved no census median the right way and pushed a real design outside " +
    "the agreement tolerance.",
};

/** The per-metric accuracy the Validation page publishes: median absolute disagreement with each
 *  file's own stored results, across every stored simulation Loft flies completely (known issues
 *  included, so it is the honest picture rather than the flattering one). Keep this and the page in
 *  step — the suite prints the current figures, so an improvement is a one-line update to both. */
const PUBLISHED_MEDIAN_PCT: Record<string, number> = {
  // Re-measured 2026-08-02 with R7's per-set fin cross-section. Five of the ten improved and none
  // moved the wrong way: timeToApogee 1.7 -> 1.5, maxMach 2.1 -> 2.0, maxVelocity 2.3 -> 2.2,
  // optimumDelay 2.7 -> 2.5, maxAltitude 3.2 -> 3.1. Tightened here in the same change as the
  // engine and the page, because a claim left at its old, looser figure is a gate that has stopped
  // gating.
  // groundHitVelocity 3.0 -> 8.3, and it is the one figure here that got WORSE without the engine
  // getting worse. It used to be measured on the total ground-frame speed, which folds in the
  // horizontal drift the canopy is carrying; every stored figure it is compared against is the
  // vertical descent rate — TRUE of the `.ork` files this note was written from, and it was NOT true
  // of the `.rkt` ones until 2026-08-04. RockSim stores `<VelocityAtLanding>` as the TOTAL
  // (hypot(X, Y, Z) to four decimals on 17 of 17 corpus simulations), so the RockSim half of this
  // metric was vertical-against-total and could only ever read low. Reading `<YVelocityAtLanding>`
  // instead moved the RockSim median 25.7% -> 21.9% with no engine change. On the openrocket files
  // that error ran OPPOSITE to Loft's own
  // descent-rate error and partly cancelled it — `pods--airframes and winglets` reads -14.5%
  // vertical but -3.0% total — so 3.0% was two errors meeting in the middle. Measured on the nine
  // stored sims where wind exceeds 4 m/s, where the two cannot cancel, the vertical figure agrees
  // to a median 0.68% and the total is out by 25.27%. 8.3% is therefore the honest number and the
  // gap it exposes is real: Loft's descent rate under a canopy disagrees with OpenRocket's by more
  // than the old figure ever admitted. Raised here rather than slackened, and said on the page.
  timeToApogee: 1.5,
  launchRodVelocity: 1.9,
  maxMach: 2.0,
  maxVelocity: 2.2,
  optimumDelay: 2.5,
  maxAltitude: 3.1,
  groundHitVelocity: 8.3,
  flightTime: 3.3,
  maxAcceleration: 3.2,
  deploymentVelocity: 6.0,
};

/** How far a metric may drift past its published figure before the page counts as stale. Wide
 *  enough that adding one design to the corpus doesn't fail the suite, tight enough that a real
 *  regression in the engine does. */
const CENSUS_SLACK_PCT = 0.75;

interface Case {
  file: string;
  sim: string;
  pctError: number;
  /** Max velocity, where the file stores one. Apogee alone can agree for the wrong reasons —
   *  a heavier rocket that also drags less reaches a similar height on a different trajectory —
   *  so the speed it got there at is what separates accuracy from cancelling errors. */
  velPctError?: number;
}

function corpusFiles(): { path: string; name: string }[] {
  if (!existsSync(CORPUS_DIR) || !statSync(CORPUS_DIR).isDirectory()) return [];
  const out: { path: string; name: string }[] = [];
  for (const dir of readdirSync(CORPUS_DIR)) {
    const sub = join(CORPUS_DIR, dir);
    if (!statSync(sub).isDirectory()) continue;
    for (const f of readdirSync(sub).sort()) {
      if (/\.(ork|ork\.gz|rkt|cdx1)$/i.test(f)) out.push({ path: join(sub, f), name: f });
    }
  }
  return out;
}

/** The corpus names files `<family>__<source>__<original name>`; the original is what a reader
 *  recognises and what KNOWN_ISSUES is keyed on. */
const shortName = (name: string): string => name.split("__").pop() ?? name;

/** How far the outer mould line steps at the joint immediately behind `id`, in metres of DIAMETER,
 *  computed from the flattened geometry alone.
 *
 *  Deliberately NOT `mouldLineStep`: this suite exists to catch what the app's own adjacency gets
 *  wrong, and asking the suspect where its neighbours are cannot do that. Adjacency here is "the next
 *  body part whose fore station is this one's aft station", which is a fact about the drawing rather
 *  than about any list. 0 when nothing touches it. */
const isBodyPart = (k: string) => k === "nosecone" || k === "bodytube" || k === "transition";

function stepBehind(rocket: Rocket, id: string): number {
  const bodies = flattenRocket(rocket)
    .filter((p) => isBodyPart(p.component.kind))
    .sort((a, b) => a.xFore - b.xFore);
  const self = bodies.find((p) => p.component.id === id);
  if (!self) return 0;
  const aftOf = (c: RocketComponent) =>
    c.kind === "bodytube" ? c.outerRadius : c.kind === "nosecone" || c.kind === "transition" ? c.aftRadius : undefined;
  const foreOf = (c: RocketComponent) =>
    c.kind === "bodytube" ? c.outerRadius : c.kind === "transition" ? c.foreRadius : 0;
  const next = bodies.find(
    (p) => p.component.id !== id && Math.abs(p.xFore - (self.xFore + self.length)) < 1e-6,
  );
  const mine = aftOf(self.component);
  if (!next || mine === undefined) return 0;
  return 2 * (foreOf(next.component) - mine);
}

const files = corpusFiles();
const suite = files.length ? describe : describe.skip;

suite("real-design corpus", () => {
  it(`imports every design file (${files.length} present)`, async () => {
    const failures: string[] = [];
    for (const f of files) {
      try {
        const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
        expect(doc.rocket.stages.length, `${f.name} has no stages`).toBeGreaterThan(0);
      } catch (e) {
        failures.push(`${shortName(f.name)}: ${(e as Error).message}`);
      }
    }
    expect(failures, "design files that failed to import").toEqual([]);
  }, 300_000);

  it("never lets a removal leave a design with no mass, and says so when it moves none", async () => {
    // R2's delete surface, held to its *done when* — "delete it, see stability, dry mass and apogee
    // move" — across every real design rather than the two committed fixtures. It runs here, in the
    // corpus suite, precisely because it needs real files: the case it exists for was only reachable
    // on formats and overrides the synthetic fixtures do not have. On a clone with no corpus this
    // whole suite skips itself, so a fork's CI stays green.
    //
    // Two rules, and both were broken when this was first driven over all 56 mass objects:
    //   1. no removal may leave a weightless design. Every `.CDX1` import mints one point mass
    //      carrying the entire stated launch weight, and removing it took `Show-off.CDX1` to 0.0 g
    //      dry with its CG at the nose tip and flipped `Complex.Two-Stage.CDX1` to −0.92 caliber,
    //      both still flown with a confident apogee;
    //   2. a removal that sheds NO mass must be explained by something in the model — a stated
    //      whole-assembly weight — rather than being a total that silently sits still.
    const weightless: string[] = [];
    const unexplained: string[] = [];
    let driven = 0;

    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const before = dryMassProperties(doc.rocket);
      if (!(before.mass > 0)) continue; // a design with no mass to begin with proves nothing here
      for (const p of flattenRocket(doc.rocket)) {
        if (removalRefusal(doc.rocket, p.component.id)) continue;
        driven++;
        const after = dryMassProperties(applyGeometryEdits(doc.rocket, { removedIds: [p.component.id] }));
        const where = `${shortName(f.name)} · "${p.component.name}" (${p.component.kind})`;
        if (!(after.mass > 0)) weightless.push(where);
        // Only a part that HAD mass is expected to shed any — a launch lug or a coupler weighing
        // nothing sheds nothing for an honest reason, and a notice about an override that is not
        // there would be worse than silence.
        const own = massByComponent(doc.rocket).get(p.component.id)?.mass ?? 0;
        if (own > 1e-9 && Math.abs(before.mass - after.mass) < 1e-9 && !statedMassHolder(doc.rocket, p.component.id)) {
          unexplained.push(`${where} — ${(own * 1000).toFixed(1)} g removed, dry total unmoved`);
        }
      }
    }

    // The denominator, printed so a run that examined nothing cannot read like a pass.
    console.log(`removable parts driven across ${files.length} design files: ${driven}`);
    expect(driven, "no removable part was driven — the sweep proves nothing").toBeGreaterThan(100);
    expect(weightless, "removals that left a design with no mass at all").toEqual([]);
    expect(unexplained, "removals that shed a part's mass without the total moving, and nothing says why").toEqual([]);
  }, 300_000);

  it("never authors a part that opens a step, floats outside its host, or cannot be taken back", async () => {
    // R3's authoring surface, held across every real design rather than the two committed fixtures —
    // and it exists because the synthetic fixtures could not have caught what shipped. Every unit test
    // in `edit.test.ts` authors onto a single-stage design or a hand-built three-component literal, so
    // a bug that only appears where a STAGE ENDS passed a full green gate: `nextTopLevel` searched one
    // stage's list, the last tube of a booster read as having nothing behind it, and "add a transition"
    // built a contracting tail cone in the middle of a multi-stage rocket — 10 of 91 anchors, worst
    // opening a 77.4 mm step on `02.Two-stage.ork`. Real files are the only place that is reachable:
    // 9 of the 35 corpus designs are multi-stage and 12 stage boundaries sit between their sections.
    //
    // Four rules, one per way an authored part can be wrong:
    //   1. a transition never opens a mould-line step that was not already there. Loft has no drag
    //      term for a bare radius step, so a shape the gesture INVENTS is a shape flown optimistically;
    //   2. a mass object sits inside the part holding it — the solver puts mass wherever the tree says,
    //      so one placed outside the airframe is still flown, at a CG nobody could build;
    //   3. everything authored is removable, or the flyer is in a state with no way back;
    //   4. everything authored is aimable, or the fields silently edit some other part.
    const openedAStep: string[] = [];
    const floating: string[] = [];
    const stuck: string[] = [];
    const unaimable: string[] = [];
    const misplaced: string[] = [];
    const shapeless: string[] = [];
    const misanchored: string[] = [];
    let driven = 0;
    let transMade = 0;
    let massMade = 0;
    let stations = 0;

    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const pristine = doc.rocket;
      for (const anchor of flattenRocket(pristine)) {
        if (anchor.component.kind !== "bodytube") continue;
        const where = `${shortName(f.name)} · behind "${anchor.component.name}"`;

        // --- a transition -------------------------------------------------------------------
        const d = transitionDefaults(pristine, anchor.component.id);
        if (d) {
          const id = newPartId(pristine, undefined, anchor.component.id);
          const built = applyGeometryEdits(pristine, {
            added: [{ id, kind: "transition", after: anchor.component.id, length: d.length }],
          });
          const made = flattenRocket(built).find((p) => p.component.id === id);
          if (made) {
            driven++;
            transMade++;
            // Measured from the flattened STATIONS, not through `mouldLineStep` — a test that shares
            // the helper under suspicion is blind in exactly the way the code is. Proved: reverting
            // `nextTopLevel` to its single-stage search leaves this suite green if the step is asked
            // of `mouldLineStep`, because that function goes blind at the same boundary. Walking the
            // geometry instead catches all 10 mis-read anchors.
            //
            // BOTH joints, and with no excuse for a design that already stepped. An earlier version
            // only judged the aft joint and only when the step grew, which excused exactly the 17
            // step-closing anchors the fairing branch exists for — deleting that branch outright fired
            // the rule at 0 of 90. The rule is simply that an authored transition fairs at both ends:
            // to its anchor in front, and to whatever follows it, or nothing follows and there is no
            // joint to judge.
            const nowThere = stepBehind(built, id);
            if (Math.abs(nowThere) > 0.0005) {
              openedAStep.push(`${where} — aft joint steps ${(Math.abs(nowThere) * 1000).toFixed(1)} mm of diameter`);
            }
            const foreJoint = stepBehind(built, anchor.component.id);
            if (Math.abs(foreJoint) > 0.0005) {
              openedAStep.push(`${where} — fore joint steps ${(Math.abs(foreJoint) * 1000).toFixed(1)} mm of diameter`);
            }
            // What was built has to BE a transition: a positive length, and — where nothing follows —
            // an exit narrower than its entry, which is the base-drag lever the part exists for.
            const c = made.component as { length: number; foreRadius: number; aftRadius: number };
            if (!(c.length > 0)) shapeless.push(`${where} — length ${(c.length * 1000).toFixed(2)} mm`);
            if (!(c.foreRadius > 0) || !(c.aftRadius > 0)) {
              shapeless.push(`${where} — radii ${(c.foreRadius * 2000).toFixed(1)}→${(c.aftRadius * 2000).toFixed(1)} mm`);
            }
            const follows = flattenRocket(built).some(
              (q) => Math.abs(q.xFore - (made.xFore + made.length)) < 1e-6 && isBodyPart(q.component.kind),
            );
            if (!follows && !(c.aftRadius < c.foreRadius - 1e-9)) {
              shapeless.push(`${where} — a tail cone that does not contract (${(c.foreRadius * 2000).toFixed(1)}→${(c.aftRadius * 2000).toFixed(1)} mm)`);
            }
            // And it sits immediately behind the part it names, not merely somewhere in the stage.
            if (Math.abs(made.xFore - (anchor.xFore + anchor.length)) > 1e-6) {
              misanchored.push(`${where} — landed at ${(made.xFore * 1000).toFixed(1)} mm, anchor ends at ${((anchor.xFore + anchor.length) * 1000).toFixed(1)} mm`);
            }
            if (removalRefusal(built, id)) stuck.push(`${where} (transition)`);
            if (aimEditsAt(built, id).transitionId !== id) unaimable.push(`${where} (transition)`);
          }
        }

        // --- a mass object ------------------------------------------------------------------
        const mid = newPartId(pristine, undefined, anchor.component.id);
        const withMass = applyGeometryEdits(pristine, {
          added: [{ id: mid, kind: "masscomponent", after: anchor.component.id, length: 0 }],
        });
        const mass = flattenRocket(withMass).find((p) => p.component.id === mid);
        if (!mass) continue;
        driven++;
        massMade++;
        const host = flattenRocket(withMass).find((p) => p.component.id === anchor.component.id)!;
        if (mass.xFore < host.xFore - 1e-9 || mass.xFore > host.xFore + host.length + 1e-9) {
          floating.push(`${where} — station ${(mass.xFore * 1000).toFixed(1)} mm, host ${(host.xFore * 1000).toFixed(1)}–${((host.xFore + host.length) * 1000).toFixed(1)} mm`);
        }
        // A mass object with no mass is not a mass object, and it is the one number the part is for.
        const built = mass.component as { mass: number };
        if (!(built.mass > 0)) shapeless.push(`${where} — a mass object weighing ${(built.mass * 1000).toFixed(2)} g`);
        if (removalRefusal(withMass, mid)) stuck.push(`${where} (mass object)`);
        if (aimEditsAt(withMass, mid).massObjectId !== mid) unaimable.push(`${where} (mass object)`);
      }

      // --- a mass object's STATION, on the design's OWN masses ------------------------------
      // Rule 5, and the one the first version of this sweep could not see: the grip and the field
      // both speak an absolute station from the nose tip, so the station a flyer asks for must be
      // the station that is flown — or, where it falls outside the part holding the mass, the
      // nearest point inside it. Driven on the design's own mass objects rather than an authored
      // one, because the failure was in how the HOST is resolved and imported masses use all four
      // placement methods (31 top, 12 absolute, 8 bottom, 5 middle across the corpus) where an
      // authored one is always `top`. Driven with a length edit live underneath, because the other
      // half of the failure was reading the host's extent from the pre-edit tree — and shaping the
      // airframe before placing the mass is the ordinary build order.
      const own = primaryMassObject(pristine);
      const ownHost = own
        ? flattenRocket(pristine).find((p) => p.component.children.some((c) => c.id === own.id))
        : undefined;
      if (!own || !ownHost || !(ownHost.length > 0)) continue;
      const nose = primaryNose(pristine);
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const want = ownHost.xFore + ownHost.length * t;
        for (const alsoEdit of [{}, nose ? { noseLength: nose.length * 1.6 } : {}]) {
          stations++;
          const moved = applyGeometryEdits(pristine, {
            ...alsoEdit,
            massObjectId: own.id,
            massObjectStation: want,
          });
          const at = flattenRocket(moved).find((p) => p.component.id === own.id)?.xFore;
          const host = flattenRocket(moved).find((p) => p.component.children.some((c) => c.id === own.id));
          if (at === undefined || !host) continue;
          const clamped = Math.max(host.xFore, Math.min(host.xFore + host.length, want));
          if (Math.abs(at - clamped) > 1e-6) {
            misplaced.push(
              `${shortName(f.name)} · "${own.name}" (${own.placement.method}) — asked ${(want * 1000).toFixed(1)} mm, flown ${(at * 1000).toFixed(1)} mm, host ${(host.xFore * 1000).toFixed(1)}–${((host.xFore + host.length) * 1000).toFixed(1)} mm`,
            );
          }
        }
      }
    }

    // The denominator, printed so a run that examined nothing cannot read like a pass.
    // Denominators PER BRANCH, printed and asserted separately. One merged counter passed at 135 with
    // the transition branch half dead, and could not say which half.
    console.log(`authored parts driven across ${files.length} design files: ${driven} (${transMade} transitions, ${massMade} mass objects)`);
    console.log(`mass-object stations driven across ${files.length} design files: ${stations}`);
    expect(transMade, "no transition was authored — that branch proves nothing").toBeGreaterThan(80);
    expect(massMade, "no mass object was authored — that branch proves nothing").toBeGreaterThan(80);
    expect(stations, "no mass station was driven — that branch proves nothing").toBeGreaterThan(100);
    expect(openedAStep, "authored transitions that opened a mould-line step the design did not have").toEqual([]);
    expect(floating, "authored mass objects placed outside the part holding them").toEqual([]);
    expect(stuck, "authored parts that cannot be removed again").toEqual([]);
    expect(unaimable, "authored parts the editor's fields cannot be aimed at").toEqual([]);
    expect(misplaced, "mass objects flown at a station other than the one asked for").toEqual([]);
    expect(shapeless, "authored parts built without the dimension that makes them that part").toEqual([]);
    expect(misanchored, "authored parts that did not land immediately behind the part they name").toEqual([]);
  }, 300_000);

  it("authors a booster on every real design, and every one of them separates", async () => {
    // R5's operation, held across every real airframe rather than the starter's two-part stack. The
    // load-bearing half is the CONFIGURATION write: a stage separates only if a configuration instance
    // names a mount inside it, so a booster with a mount and no instance never lights and never drops —
    // measured on the starter as a 37.5% apogee loss with no separation event and nothing said. Designs
    // carry up to five configurations, so an instance added to one and missing from another is the same
    // silent loss on whichever the flyer switches to.
    //
    // Four rules, one per way an authored stage can be wrong:
    //   1. the stack grows by exactly one, and the stages above it are untouched;
    //   2. every configuration gains an instance in the new mount — not just the flown one;
    //   3. the booster carries no recovery device, which the solver would never deploy from a lower
    //      stage and which a whole-subtree clone produces silently;
    //   4. dropping the entry restores the design exactly, which is what makes it undoable.
    const wrongCount: string[] = [];
    const missedConfig: string[] = [];
    const cloned: string[] = [];
    const notRestored: string[] = [];
    const refusedButOffered: string[] = [];
    const neverSeparated: string[] = [];
    const wrongMotor: string[] = [];
    let authored = 0;
    let refused = 0;
    let burnedOut = 0;
    let separated = 0;
    let flown = 0;

    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const seedId = newPartId(doc.rocket, [], "stage:1");
      const mountId = newPartId(doc.rocket, [{ id: seedId } as never], "mount:1");
      const edits = { addedStages: [{ seedId, mountId, name: "Booster" }] };
      const staged = applyGeometryEdits(doc.rocket, edits);
      // Refused where there is nothing to seed a FLYABLE booster from — no body tube, or an aft tube
      // with no motor mount to clone. `canAddStage` is the predicate the control is offered on, and it
      // must agree with what the operation actually does or the button does nothing.
      const offered = canAddStage(doc.rocket);
      if (staged.stages.length === doc.rocket.stages.length) {
        if (offered) refusedButOffered.push(`${f.name}: the control is offered and the operation refuses`);
        refused++;
        continue;
      }
      if (!offered) refusedButOffered.push(`${f.name}: the operation authored a stage the control hides`);
      authored++;

      // 1
      if (staged.stages.length !== doc.rocket.stages.length + 1) {
        wrongCount.push(`${f.name}: ${doc.rocket.stages.length} -> ${staged.stages.length} stages`);
      }
      if (JSON.stringify(staged.stages.slice(0, -1)) !== JSON.stringify(doc.rocket.stages)) {
        wrongCount.push(`${f.name}: authoring a booster changed a stage above it`);
      }
      // 2 — the effective mount is the entry's own id, or the seed tube itself on a min-diameter clone.
      const seed = staged.stages[staged.stages.length - 1].components[0];
      const effective = seed.children.some((c) => c.id === mountId) ? mountId : seed.id;
      // The mount the SOURCE tube used, which is what the booster's motor must be copied from.
      const src = flattenRocket(doc.rocket)
        .filter((p) => p.component.kind === "bodytube")
        .reduce((best, p) => (p.xFore > best.xFore ? p : best)).component;
      const srcMountId = src.children.find((c) => "motorMount" in c && c.motorMount !== undefined)?.id ?? src.id;
      for (const cfg of staged.configurations) {
        // A configuration the design says flies nothing stays flying nothing — see `applyAddedStages`.
        if (cfg.instances.length <= 1) continue;
        const inBooster = cfg.instances.find((i) => i.mountId === effective);
        if (!inBooster) {
          missedConfig.push(`${f.name}: configuration ${cfg.id} has no motor in the booster`);
          continue;
        }
        // And it is the motor the SEED TUBE'S OWN MOUNT flies, not whichever instance happens to be
        // first. On a design whose first instance sits in an upper stage those are different motors:
        // `Three stage low power rocket.ork` puts an A8 in a booster whose own mount flies a B6, and
        // apogee reads 294.4 m against the 334.2 m the aft mount gives — 11.9% low, with nothing said.
        // The separation assertion below cannot see this: the wrong motor still lights and still drops.
        const fromSeed = cfg.instances.find((i) => i.mountId === srcMountId);
        const designation = (i: { motor: { designation?: string } }) => i.motor?.designation ?? "";
        if (fromSeed && designation(inBooster) !== designation(fromSeed)) {
          wrongMotor.push(`${f.name}: booster flies ${designation(inBooster)} where its seed tube flies ${designation(fromSeed)}`);
        }
      }
      // 3
      if (seed.children.some((c) => c.kind === "parachute" || c.kind === "streamer")) {
        cloned.push(`${f.name}: a recovery device was cloned into the booster`);
      }
      // 4
      if (JSON.stringify(applyGeometryEdits(doc.rocket, { addedStages: [] })) !== JSON.stringify(doc.rocket)) {
        notRestored.push(`${f.name}: dropping the entry did not restore the design`);
      }

      // And it FLIES, with a separation event — the claim the other three exist to support. Only where
      // the design has propulsion at all; a design whose motor Loft cannot resolve has nothing to burn.
      const run = runFromDocument({ ...doc, rocket: staged }, {});
      if (run.hasPropulsion) {
        flown++;
        // Only a flight that reaches BURNOUT can separate, because the serial-staging default is to
        // separate when the stage finishes burning. One real design never gets there with a booster on
        // it and that is not a defect: `rocksimTestRocket1.rkt` is a 692 g airframe on an E6 at a 2.96
        // thrust-to-weight, and the extra stage takes its apogee from 141.6 m to 15.8 m — it reaches
        // the top of a 3.1 s flight while still burning. It is counted and named rather than dropped,
        // because a silently excluded case is how a rule stops meaning anything.
        if (run.result.events.some((e) => e.type === "burnout")) {
          burnedOut++;
          // The design's OWN separations, flown only where the branch needs them: a second full flight
          // for every design — including the 5 with no propulsion and the 1 that never burns out — is
          // what pushed this test past the 5 s default and turned CI red while the local gate stayed
          // green. Inside the branch it costs the 29 flights the comparison actually uses.
          const separationsBefore = runFromDocument(doc, {}).result.events.filter((e) => e.type === "separation").length;
          // EXACTLY one more than the design already had. `some(separation)` is satisfied by a
          // separation the design came with, so on the 9 multi-stage designs it was structurally blind
          // to the very defect this test exists to catch: a booster that never lights leaves the
          // pre-existing separations firing and the assertion green. `> before` fixes that half;
          // `=== before + 1` also catches a booster that separates while SUPPRESSING one of the
          // design's own, which is the same class of silent wrong flight in the other direction.
          const after = run.result.events.filter((e) => e.type === "separation").length;
          if (after === separationsBefore + 1) separated++;
          else neverSeparated.push(`${f.name}: burned out and the separation count did not rise by exactly one (${separationsBefore} -> ${after})`);
        }
      }
    }

    console.log(
      `boosters authored across ${files.length} design files: ${authored} authored, ${refused} refused; ` +
        `${flown} had propulsion, ${burnedOut} of those reached burnout, and ${separated} of THOSE separated ` +
        `(${flown - burnedOut} never burned out — too marginal to fly with a booster on it)`,
    );
    expect(authored, "no booster was authored — that branch proves nothing").toBeGreaterThan(20);
    expect(refusedButOffered, "the control and the operation disagree about whether a booster can be added").toEqual([]);
    expect(wrongCount, "an authored stage that did not append cleanly").toEqual([]);
    expect(missedConfig, "a configuration left without a motor in the booster").toEqual([]);
    expect(wrongMotor, "a booster flying a motor its own seed tube does not").toEqual([]);
    expect(cloned, "a recovery device cloned into a stage the solver never deploys from").toEqual([]);
    expect(notRestored, "dropping the entry did not restore the design").toEqual([]);
    // Every design that reaches burnout must stage. This is the assertion the configuration write
    // exists for: without an instance in the booster's mount the stage's burn duration is zero, it
    // never lights, and it never drops.
    expect(neverSeparated, "a design that burned out and still did not separate").toEqual([]);
    expect(separated, "no authored booster separated").toBe(burnedOut);
    expect(burnedOut, "no authored booster reached burnout — that branch proves nothing").toBeGreaterThan(20);
    // Two full flights per design — the pristine one for its separation count, and the staged one —
    // so this needs the same explicit budget its neighbours take rather than the 5 s default.
  }, 300_000);

  it("authors a motor mount on every real design that can take one, and unblocks the booster it exists for", async () => {
    // R5's last *done when* clause. The operation exists for the designs whose aft tube carries no
    // mount to clone, where `canAddStage` refuses a booster outright — so the assertion that matters
    // is not "the field got set", it is "the refusal it was written to lift is lifted".
    const offered: string[] = [];
    const refusedBooster: string[] = [];
    const unblocked: string[] = [];
    const stillRefused: string[] = [];
    const doubled: string[] = [];
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const tubes = flattenRocket(doc.rocket).filter((p) => p.component.kind === "bodytube");
      if (!tubes.length) continue;
      const aft = tubes.reduce((b, p) => (p.xFore > b.xFore ? p : b)).component;
      if (!canAddMount(doc.rocket, aft.id)) {
        if (!canAddStage(doc.rocket)) stillRefused.push(`${f.name}: no mount offered either`);
        continue;
      }
      offered.push(f.name);
      const bag = { mountAdds: [{ hostId: aft.id }] };
      const built = applyGeometryEdits(doc.rocket, bag);

      // The mount landed exactly once, and so did its motor. `applyMountAdds` runs at TWO points in
      // the pipeline, so a doubled instance would fly the design's motor twice on every design here.
      const holders = flattenRocket(built)
        .map((p) => p.component)
        .filter((c) => "motorMount" in c && (c as { motorMount?: unknown }).motorMount !== undefined)
        .filter((c) => c.id === aft.id);
      if (holders.length !== 1) doubled.push(`${f.name}: ${holders.length} mounts on one tube`);
      for (const cfg of built.configurations) {
        const n = cfg.instances.filter((i) => i.mountId === aft.id).length;
        if (n > 1) doubled.push(`${f.name}: ${n} instances naming one mount`);
      }

      if (!canAddStage(doc.rocket)) {
        refusedBooster.push(f.name);
        if (canAddStage(stageSeedBase(doc.rocket, bag))) unblocked.push(f.name);
        else stillRefused.push(`${f.name}: mount added, booster still refused`);
      }
    }
    console.log(
      `motor mounts authored across ${files.length} design files: offered on ${offered.length}; ` +
        `${refusedBooster.length} refused a booster before, ${unblocked.length} unblocked by a mount` +
        (stillRefused.length ? ` — still refused: ${stillRefused.join("; ")}` : ""),
    );
    expect(offered.length, "no design offered the gesture — that branch proves nothing").toBeGreaterThan(10);
    expect(doubled, "a mount or its motor landed more than once").toEqual([]);
    // The designs the operation was written for must actually be reachable by it. One of the two that
    // refuse a booster has no motor anywhere for Loft to put in a mount, so it refuses the mount too
    // and stays refused — which is the honest answer, not a gap.
    expect(unblocked.length, "the mount gesture unblocked no design that a booster was refused on").toBeGreaterThan(0);
  });

  it("changes only the motor mounts the cluster field says it is changing", async () => {
    // The field reads back off ONE mount and used to write to ALL of them, so a design whose mounts
    // hold different counts had its unmentioned mount silently rewritten. This drives the real
    // denominator: how many designs carry mounts that disagree, and what the edit does to them.
    const disagreeing: string[] = [];
    const rewritten: string[] = [];
    let mountsSeen = 0;
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const mounts = (r: typeof doc.rocket) =>
        flattenRocket(r)
          .map((p) => p.component)
          .filter((c) => "motorMount" in c && (c as { motorMount?: unknown }).motorMount !== undefined);
      const before = mounts(doc.rocket);
      if (!before.length) continue;
      mountsSeen += before.length;
      const outside = unreachableMountCount(doc.rocket);
      if (outside > 0) {
        disagreeing.push(
          `${f.name}: ${outside} of ${before.length} mount(s) outside the group the field reads ` +
            `(${primaryMotorClusterCount(doc.rocket)})`,
        );
      }
      // Commit a value the field could offer and check nothing outside the group moved.
      const group = primaryMountGroupIds(doc.rocket);
      const after = mounts(applyGeometryEdits(doc.rocket, { motorClusterCount: 2 }));
      const countOf = (c: (typeof after)[number]) =>
        ((c as { motorMount?: { clusterCount?: number } }).motorMount?.clusterCount ?? 1);
      for (let i = 0; i < before.length; i++) {
        if (group.has(before[i].id)) continue;
        if (countOf(after[i]) !== countOf(before[i])) {
          rewritten.push(
            `${f.name}: ${before[i].name} was ${countOf(before[i])}, became ${countOf(after[i])} ` +
              `from an edit describing ${primaryMotorClusterCount(doc.rocket)}`,
          );
        }
      }
    }
    console.log(
      `motor mounts across ${files.length} design files: ${mountsSeen} mounts, ` +
        `${disagreeing.length} design(s) whose mounts disagree — ${disagreeing.join("; ") || "none"}`,
    );
    expect(mountsSeen, "no mount was read — that branch proves nothing").toBeGreaterThan(20);
    // The one design that has the shape must still HAVE it, or this assertion is watching nothing.
    expect(disagreeing.length, "no real design carries mounts with different counts").toBeGreaterThan(0);
    expect(rewritten, "a mount the field never described was rewritten by it").toEqual([]);
  });

  it("costs no real design its motor, and finds none that was already flying a misfit", async () => {
    // **This is a NO-REGRESSION check and it is named as one**, because it cannot honestly be more
    // than that. A first version was called "never substitutes a motor that could not fit" and
    // asserted `lost`/`misfit` empty — which they are whether the veto exists or not, as the pre-push
    // review proved by deleting it and watching this stay green.
    //
    // The bite cannot be driven from the corpus, and the measurement says why: **0 of the catalogue's
    // 102 designation cores span more than one casing class**, so a loose match can only ever land on
    // the size its own family is made in. The reported defect needed a FILE whose stated casing
    // disagreed with the motor its designation nearly names — 29 mm stated, `H999ZZ` reaching the
    // 38 mm `H999N` — and no corpus design does that. Manufacturing one here would be a test of a
    // string I chose. `lib/motors/db.test.ts` pins the bite on the real reported case instead.
    //
    // What this DOES establish is the thing that check cannot: that arming the veto changes no real
    // flight, over every motor instance in 35 in-the-wild files.
    let stated = 0;
    let silent = 0;
    let loose = 0;
    const lost: string[] = [];
    const misfit: string[] = [];
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      for (const cfg of doc.rocket.configurations) {
        for (const inst of cfg.instances) {
          const m = inst.motor;
          if (!m.designation) continue;
          const casing = Math.round((m.diameter ?? 0) * 1000);
          if (casing > 0) stated++; else silent++;
          const name = `${shortName(f.name)}/${m.designation}`;
          const withFit = resolveMotor(m);
          const ignoringFit = resolveMotor({ designation: m.designation, manufacturer: m.manufacturer });
          // Where the veto is even CONSULTED: an exact match is exempt, so this is the honest reach
          // figure rather than the count of files that state a casing at all.
          if (ignoringFit && ignoringFit.quality !== "exact" && casing > 0) loose++;
          // Nothing a real file describes may be lost.
          if (ignoringFit && !withFit) {
            lost.push(`${name}: ${casing} mm stated, ${Math.round(ignoringFit.entry.curve.diameterMm)} mm matched`);
          }
          // Computed from the PRE-veto resolution. Asking the post-veto one is a tautology — the veto
          // is precisely what makes that answer impossible — which is what the first version did.
          if (ignoringFit && casing > 0 && ignoringFit.quality !== "exact") {
            const got = Math.round(ignoringFit.entry.curve.diameterMm);
            if (got > 0 && !sameCasing(got, casing)) misfit.push(`${name}: would fly ${got} mm in ${casing} mm`);
          }
        }
      }
    }
    console.log(
      `motor instances across ${files.length} design files: ${stated} state a casing, ${silent} do not ` +
        `(RockSim states the mount's bore, RASAero the nozzle); ${loose} resolve loosely enough for the ` +
        `veto to be consulted at all, and ${misfit.length} of those disagree on casing`,
    );
    expect(stated, "no corpus file states a casing — nothing here would be exercised").toBeGreaterThan(10);
    expect(lost, "the casing veto dropped a motor a real design was flying").toEqual([]);
    expect(misfit, "a real design was already flying a motor that does not fit its own stated casing").toEqual([]);
  }, 300_000);

  it("says so on every real design that loses a motor, clustered or not", async () => {
    // A motor that does not resolve is left OUT of the build (`lib/sim/setup.ts` skips it), so the
    // flight runs on less thrust and less mass than the design calls for and reads low. One warning
    // exists to say that — and for as long as it has existed it could not fire on a clustered
    // design, because it compared the cluster-EXPANDED flown count against the UN-EXPANDED instance
    // count. Any cluster made the left side the larger one.
    //
    // Driven by CONSTRUCTION rather than against a threshold: break exactly one instance of every
    // configuration on every real design, and require the result to say a motor is missing. The
    // clustered subset is counted and asserted non-empty, because it is the subset the defect lived
    // in and an assertion that never reaches it is watching nothing.
    const silent: string[] = [];
    const clustered: string[] = [];
    let broken = 0;
    let wouldHaveBeenMissed = 0;
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      for (const cfg of doc.rocket.configurations) {
        if (cfg.instances.length === 0) continue;
        // The expanded count the design calls for, read the way the solver reads it: a mount's
        // `clusterCount`, not the length of the instance list.
        const mountCount = new Map<string, number>();
        for (const p of flattenRocket(doc.rocket)) {
          const mm = (p.component as { motorMount?: { clusterCount?: number } }).motorMount;
          if (mm) mountCount.set(p.component.id, Math.max(1, Math.round(mm.clusterCount ?? 1)));
        }
        const expanded = cfg.instances.reduce((s, i) => s + (mountCount.get(i.mountId) ?? 1), 0);
        if (expanded > cfg.instances.length) clustered.push(`${shortName(f.name)}/${cfg.name ?? cfg.id}`);
        for (let k = 0; k < cfg.instances.length; k++) {
          const rocket = {
            ...doc.rocket,
            configurations: doc.rocket.configurations.map((c) =>
              c.id !== cfg.id
                ? c
                : {
                    ...c,
                    instances: c.instances.map((inst, i) =>
                      i === k ? { ...inst, motor: { ...inst.motor, designation: "ZZ-NOT-A-MOTOR" } } : inst,
                    ),
                  },
            ),
          };
          let run;
          try {
            run = runFlight(rocket, { configId: cfg.id });
          } catch {
            continue; // a design with nothing left to fly is another test's business
          }
          broken++;
          const codes = run.result.warnings.map((w) => w.code);
          const said = codes.includes("partial-cluster") || codes.includes("no-motor");
          if (!said) {
            silent.push(
              `${shortName(f.name)}/${cfg.name ?? cfg.id}: broke instance ${k + 1} of ` +
                `${cfg.instances.length} (${expanded} expanded) and the flight said nothing — ${codes.join(", ") || "no warnings at all"}`,
            );
          }
          // The negative control, computed rather than asserted: how many of these the OLD
          // comparison (`placed < instances.length`) would have let through in silence. It is the
          // clustered ones, and it is printed so a future reader can see the defect's real size.
          const placed = run.resolutions.reduce((s, r) => s + (r.match ? (r.count ?? 1) : 0), 0);
          if (placed > 0 && placed < expanded && !(placed < cfg.instances.length)) wouldHaveBeenMissed++;
        }
      }
    }
    console.log(
      `lost-motor check across ${files.length} design files: ${broken} single-motor removals driven, ` +
        `${new Set(clustered).size} clustered configuration(s), ` +
        `${wouldHaveBeenMissed} that the pre-fix comparison would have passed over in silence`,
    );
    expect(broken, "no motor was ever broken — this test proves nothing").toBeGreaterThan(20);
    expect(
      new Set(clustered).size,
      "no real design carries a cluster, so the branch the defect lived in is untested",
    ).toBeGreaterThan(0);
    expect(wouldHaveBeenMissed, "the negative control found nothing the old code missed").toBeGreaterThan(0);
    expect(silent, "a design flew on a missing motor and said nothing").toEqual([]);
  }, 300_000);

  it("authors a coupler and a centring ring on every real design, inside the tube and massing something", async () => {
    // The two INTERNAL kinds. Unlike every previously authorable part they touch no outer mould line
    // at all — so the check is the mirror image of the authored-part sweep above: the airframe must
    // NOT move, and the dry mass must.
    const stepped: string[] = [];
    const weightless: string[] = [];
    const outside: string[] = [];
    const solid: string[] = [];
    const wrongShape: string[] = [];
    const addedG: Record<string, number[]> = { tubecoupler: [], centeringring: [] };
    let authored = 0;
    let eligible = 0;
    let exempt = 0;
    let clamped = 0;
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const rocket = doc.rocket;
      const tubes = flattenRocket(rocket).filter((p) => p.component.kind === "bodytube");
      if (!tubes.length) continue;
      eligible++;
      const host = tubes[0];
      const beforeLen = overallLength(rocket);
      const beforeMass = dryMassProperties(rocket).mass;
      for (const kind of ["tubecoupler", "centeringring"] as const) {
        const id = newPartId(rocket, undefined, host.component.id);
        // `length: 0` is what the button sends — the size is the corpus figure, resolved against the
        // host by `internalPartDefaults`. Driving the default path is the point: a test that names its
        // own length checks the clamp and nothing about the part a flyer would actually get.
        const built = applyGeometryEdits(rocket, {
          added: [{ id, kind, after: host.component.id, length: 0 }],
        });
        const made = flattenRocket(built).find((p) => p.component.id === id);
        if (!made) continue;
        authored++;
        const name = `${shortName(f.name)}/${kind}`;
        // 1. It goes INSIDE the host, not behind it — so the rocket is exactly as long as it was.
        if (Math.abs(overallLength(built) - beforeLen) > 1e-9) stepped.push(`${name}: length moved`);
        // 2. It sits within the host's own span, which is what "inside" has to mean geometrically.
        if (made.xFore < host.xFore - 1e-9 || made.xFore + made.length > host.xFore + host.length + 1e-9) {
          outside.push(`${name}: ${made.xFore.toFixed(4)}..${(made.xFore + made.length).toFixed(4)} outside host ${host.xFore.toFixed(4)}..${(host.xFore + host.length).toFixed(4)}`);
        }
        // 3. It weighs something wherever the host states a stock AND the design counts per-part
        //    mass at all. A part that adds nothing is an edit that changes no number — the "controls
        //    that forget" tell — but there is a legitimate exemption and it is the majority on some
        //    files: a design whose enclosing ASSEMBLY states its own weight subsumes everything
        //    inside it, so adding a part there moves the balance and not the total. That is exactly
        //    what `statedMassHolder` reports, and what the parts panel already tells the flyer in
        //    words. Counted rather than waved through, so the exemption is visible.
        const c = made.component as { material?: unknown; innerRadius: number; outerRadius: number };
        const subsumed = statedMassHolder(built, id);
        if (subsumed) {
          exempt++;
        } else if (c.material !== undefined && dryMassProperties(built).mass <= beforeMass + 1e-12) {
          weightless.push(`${name}: stock but no mass`);
        }
        addedG[kind].push((dryMassProperties(built).mass - beforeMass) * 1000);
        // 4. **A ring is bored and a coupler is long, and neither is negotiable.** Both kinds are the
        //    same `RingComponent`, so the one way to author them wrong is to size them alike — which
        //    the first draft did, giving every ring a 50 mm SOLID slug at 134 g median and 1.74 kg at
        //    worst. 0 of the 83 real centring rings in the corpus have a zero bore, and none of the 31
        //    real couplers is shorter than 1.0537 calibers.
        if (kind === "centeringring") {
          if (!(c.innerRadius > 0)) solid.push(`${name}: bore 0 — that is a bulkhead, not a ring`);
          if (made.length > 0.033) wrongShape.push(`${name}: ${(made.length * 1000).toFixed(1)} mm thick, past the corpus's thickest ring`);
        } else if (made.length < 1.05 * 2 * c.outerRadius - 1e-9) {
          // Below the corpus floor ONLY where the host is too short to hold one — the clamp, which
          // has to win, since a coupler past the fore end is the defect that clamp exists for.
          if (made.length >= host.length - 1e-9) clamped++;
          else wrongShape.push(`${name}: ${(made.length / (2 * c.outerRadius)).toFixed(2)} calibers in a host with room for more`);
        }
      }
    }
    const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    console.log(
      `internal parts authored across ${files.length} design files: ${authored} ` +
        `(coupler + centring ring on every design with a body tube), ` +
        `${exempt} inside an assembly whose stated weight already subsumes them, ` +
        `${clamped} couplers cut down to a host too short to hold one; ` +
        `median added mass ${med(addedG.tubecoupler).toFixed(2)} g coupler, ` +
        `${med(addedG.centeringring).toFixed(2)} g ring`,
    );
    // **Both kinds on every eligible design, counted exactly.** This read `> 40` against an actual 70
    // — 43% of slack, so half the corpus could stop building and every list below would still be
    // empty for the wrong reason, since each one is filled behind `if (!made) continue`. Every corpus
    // file has a body tube, so the number is 2 per file and there is no reason to leave it loose.
    expect(eligible, "no design had a body tube — the corpus is not loaded").toBe(files.length);
    expect(authored, "a design refused to build one of the two internal kinds").toBe(eligible * 2);
    expect(stepped, "an internal part changed the airframe's length").toEqual([]);
    expect(outside, "an internal part sits outside the tube that holds it").toEqual([]);
    expect(weightless, "an internal part with a stock added no mass").toEqual([]);
    expect(solid, "a centring ring was authored with no bore").toEqual([]);
    expect(wrongShape, "an internal part was authored at a size no real one has").toEqual([]);
    // The mass a ring adds is what the sizing is FOR, so it is asserted rather than only printed: a
    // 1/8 inch bored plate is single-digit grams, and the solid 50 mm slug this replaced was 134.
    expect(med(addedG.centeringring), "the median centring ring is heavier than a plate of ply").toBeLessThan(20);
    expect(med(addedG.centeringring), "the median centring ring weighs nothing at all").toBeGreaterThan(0);
  }, 300_000);

  it("finds no real design that leads with anything but a nose cone", async () => {
    // The denominator behind the blunt-face warning R4's drag made necessary. Loft takes forebody
    // pressure and wave drag from whichever component is a nose cone wherever it sits, and has no term
    // at all for a flat leading face — so the warning has to fire on a reordered airframe and must
    // never fire on a design as a file describes it. This is the half of that claim only the corpus
    // can hold: a shape the editor can reach and no file produces.
    const leading: string[] = [];
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const face = leadingFaceDiameter(doc.rocket);
      if (face > 0) leading.push(`${f.name}: ${(face * 1000).toFixed(1)} mm flat face as imported`);
    }
    console.log(`leading-face check across ${files.length} design files: ${leading.length} lead with a flat face`);
    expect(files.length, "no design was read — that branch proves nothing").toBeGreaterThan(20);
    expect(leading, "a real design that the blunt-face warning would fire on as imported").toEqual([]);
  });

  it("names exactly the real designs whose lower stage cannot fire, and no dart", async () => {
    // The denominator behind the dead-stage warning, taken from the FLOWN flight rather than from the
    // predicate, so this test cannot be satisfied by a predicate that agrees with itself.
    //
    // Exactly ONE real design is in this state, and it is a genuine one rather than an artefact:
    // `03.Three-stage.ork` puts a `burnout` ignition event on its bottom-most stage, where nothing
    // below it ever burns out, so that J315R never lights and the stage is carried. Loft has always
    // flown it that way — `ignitionTrigger` has a comment saying the file's own stored flight agrees —
    // and until this warning nothing said so on any surface.
    //
    // Two traps this pins. First the DART: an unpowered TOP stage is a legitimate design and 3 of
    // these files are exactly that (`APEX_K_Dart.ork`, `ARC payload rocket.ork`,
    // `Deployable payload.ork`), so a rule of "every stage needs a motor" would name 4 files here, not
    // 1. Second, `shed`: a dead stage under a live one is still dropped by that stage's separation, so
    // a warning claiming it is carried would contradict the `untracked-booster` notice beside it.
    const dead: string[] = [];
    let multiStage = 0;
    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      if (doc.rocket.stages.length > 1) multiStage++;
      const run = runFromDocument(doc, {});
      if (run.result.warnings.some((w) => w.code === "dead-stage")) dead.push(shortName(f.name));
    }
    console.log(
      `dead-stage check across ${files.length} design files: ${dead.length} fly a lower stage that cannot fire ` +
        `(${multiStage} of the files are multi-stage) — ${dead.join(", ") || "none"}`,
    );
    expect(files.length, "no design was read — that branch proves nothing").toBeGreaterThan(20);
    expect(multiStage, "no multi-stage design was read — the predicate's whole branch is untested").toBeGreaterThan(0);
    expect(dead.sort()).toEqual(["03.Three-stage.ork"]);
    // A full flight per design needs the same explicit budget its neighbours take. Measured 488 ms
    // locally and 5,186 ms on the CI runner, which overran vitest's 5 s default and turned the build
    // red on a commit whose local gate was green.
  }, 300_000);

  it("gives every real staged flight a phase timeline its table can be built from", async () => {
    // This holds the ASSUMPTIONS R5's phase table is built on, against real files — it does not render
    // the table (the e2e does that). The table draws one row per PHASE and names each row's shed stages
    // as the slice `stages[stageCount_p … stageCount_{p-1} - 1]`; if the timeline underneath does not
    // have the shape asserted here, those rows are wrong however the component is written. Both traps
    // are ones a synthetic fixture cannot expose:
    //
    //   - rows are NOT stages. `03.Three-stage.ork` has 3 stages, 2 phases and ONE separation, because
    //     a serial stack parts at one joint and takes everything below it; `Three stage low power
    //     rocket.ork` has 3 of each. A table built from `rocket.stages` prints a phase that never was.
    //   - `stageCount` is a COUNT of what remains, not an index of what left. Naming only
    //     `stages[stageCount]` would drop the second stage at any boundary where two joints part.
    const shapes: string[] = [];
    let multiStage = 0;
    let totalPhases = 0;
    let boundariesWhereTwoStagesLeft = 0;

    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const n = doc.rocket.stages.length;
      if (n < 2) continue;
      multiStage++;
      const run = runFromDocument(doc, {});
      const phases = run.phases;
      totalPhases += phases.length;
      const name = shortName(f.name);

      if (phases.length === 0) { shapes.push(`${name}: no phases at all`); continue; }
      if (phases[0].stageCount !== n) shapes.push(`${name}: first phase holds ${phases[0].stageCount} of ${n} stages`);
      if (phases[0].startTime !== 0) shapes.push(`${name}: first phase starts at ${phases[0].startTime}`);

      const shedTotal: number[] = [];
      for (let i = 1; i < phases.length; i++) {
        const prev = phases[i - 1].stageCount;
        const here = phases[i].stageCount;
        if (here >= prev) shapes.push(`${name}: phase ${i + 1} holds ${here}, not fewer than ${prev}`);
        if (phases[i].startTime < phases[i - 1].startTime) shapes.push(`${name}: phase ${i + 1} begins before phase ${i}`);
        for (let k = here; k < prev; k++) shedTotal.push(k);
        if (prev - here > 1) boundariesWhereTwoStagesLeft++;
        // Every boundary a row draws its altitude and speed from must have an event behind it, or the
        // table renders "not logged" where a real number belongs.
        const ev = run.result.events.find((e) => e.type === "separation" && Math.abs(e.time - phases[i].startTime) < 1e-6);
        if (!ev) shapes.push(`${name}: phase boundary at ${phases[i].startTime.toFixed(3)} s has no separation event`);
      }
      // Each shed stage is named exactly once, and every stage below the final count is accounted for.
      // (Given the two checks above this is arithmetically implied, so it is kept as a cheap guard on
      // those checks rather than sold as the guard on the slice rule.)
      const expected = Array.from({ length: n - phases[phases.length - 1].stageCount }, (_, k) => phases[phases.length - 1].stageCount + k);
      if (JSON.stringify([...shedTotal].sort((a, b) => a - b)) !== JSON.stringify(expected)) {
        shapes.push(`${name}: shed slices ${JSON.stringify(shedTotal)} do not cover ${JSON.stringify(expected)} exactly once`);
      }

      // What the TABLE actually depends on, which nothing asserted before: it pairs `seps[i]` with
      // `phases[i + 1]` POSITIONALLY and truncates to `seps.length + 1` rows. That is only sound if
      // separations arrive in phase order and never outnumber the phases — otherwise a row's "to" and
      // the next row's "from" silently disagree.
      const sepEvents = run.result.events.filter((e) => e.type === "separation");
      if (sepEvents.length + 1 > phases.length) {
        shapes.push(`${name}: ${sepEvents.length} separations logged against ${phases.length} phases`);
      }
      sepEvents.forEach((e, k) => {
        const planned = phases[k + 1];
        if (!planned) return;
        if (Math.abs(e.time - planned.startTime) > 1e-6) {
          shapes.push(`${name}: separation ${k + 1} at ${e.time.toFixed(3)} s does not match phase ${k + 2} at ${planned.startTime.toFixed(3)} s`);
        }
      });
    }

    console.log(
      `phase timelines across ${files.length} design files: ${multiStage} multi-stage, ${totalPhases} phases, ` +
        `${boundariesWhereTwoStagesLeft} boundaries where more than one stage left at once`,
    );
    expect(multiStage, "no multi-stage design was read — this suite proves nothing").toBeGreaterThan(0);
    expect(boundariesWhereTwoStagesLeft, "no boundary sheds two stages — the slice rule is untested").toBeGreaterThan(0);
    expect(shapes).toEqual([]);
    // Flies every multi-stage design; same explicit budget, same reason as above.
  }, 300_000);

  it("logs a burnout for every stage that burns, without moving the burnout it reports", async () => {
    // R5 increment 3. A flight used to log exactly ONE burnout ever — `burnoutTime`'s max over every
    // lit motor — so a booster's burnout, the event that CAUSES the separation right after it, was
    // never recorded. 8 of the 9 multi-stage designs reported 1, including the one that burns three.
    //
    // The dangerous half of this change is NOT the new events; it is the summary. The emission and
    // the `burnoutVelocity` / `burnoutAltitude` latch were one guard, so looping it over the stages
    // moves the reported burnout to the BOOSTER's — on `03.Three-stage.ork` the sustainer's burnout
    // becomes the booster's, which under the drag model of the day was 202.8 m/s at 787.4 m becoming
    // 44.9 m/s at 366.6 m, 77.9% low, published onto the Burnout velocity stat a flyer sizes an
    // ejection delay against. (Those two pairs are that model's; re-measured 2026-08-02 the same
    // swap is 224.4 m/s at 845.8 m becoming 52.2 m/s at 390.5 m. The ratio is the point, not the
    // absolute numbers — the guard below carries the current ones.) Both halves are asserted here, and the summary half is the one worth
    // having: a `some(type === "burnout")` check stays green through exactly that regression.
    const multi: string[] = [];
    const gained: string[] = [];
    let totalBurnouts = 0;
    let summary: { v: number; alt: number } | undefined;

    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      if (doc.rocket.stages.length < 2) continue;
      const name = shortName(f.name);
      multi.push(name);
      const run = runFromDocument(doc, {});
      const bos = run.result.events.filter((e) => e.type === "burnout");
      totalBurnouts += bos.length;
      if (bos.length > 1) gained.push(name);

      // Ordered in time, and each attributed to a stage — the table matches them into its rows.
      for (let k = 1; k < bos.length; k++) {
        expect(bos[k].time, `${name}: burnouts out of time order`).toBeGreaterThanOrEqual(bos[k - 1].time);
      }
      for (const b of bos) {
        expect(b.stageIndex, `${name}: a burnout names no stage, so no row can claim it`).toBeDefined();
        expect(b.stageIndex!).toBeLessThan(doc.rocket.stages.length);
      }
      // No stage may report two burnouts: one per stage is the whole contract.
      const perStage = bos.map((b) => b.stageIndex);
      expect(new Set(perStage).size, `${name}: two burnouts for one stage`).toBe(perStage.length);

      if (name === "03.Three-stage.ork") {
        summary = { v: run.result.summary.burnoutVelocity, alt: run.result.summary.burnoutAltitude };
      }
    }

    console.log(
      `burnouts across ${files.length} design files: ${multi.length} multi-stage, ${totalBurnouts} burnout ` +
        `events, ${gained.length} designs logging more than one`,
    );

    // Named exactly, not counted. `toEqual([])` or a bare count would accept the emission going blind
    // again, which is the failure this repo has already had once on a sweep of this shape.
    expect(gained.sort()).toEqual(
      [
        "02.Two-stage.ork",
        "03.Three-stage.ork",
        "Complex.Two-Stage.CDX1",
        "Three stage low power rocket.ork",
        "Two stage high power rocket.ork",
      ].sort(),
    );
    expect(multi.length, "no multi-stage design was read — this suite proves nothing").toBe(9);

    // THE REGRESSION GUARD. This is the sustainer's burnout, and it must not become the booster's.
    //
    // **Re-centred 2026-08-02, on a measurement, when R7's per-set fin cross-section moved the
    // flight.** The window was 200–205 m/s and 780–795 m — this design's numbers under the old drag
    // model, not anything about which stage is being reported. Charging each fin set its own edge
    // section instead of the draggiest present took the sustainer's burnout to 224.4 m/s at 845.8 m.
    //
    // Driven this run, both burnout events on this design:
    //
    //     booster    52.2 m/s at 390.5 m
    //     sustainer 224.4 m/s at 845.8 m
    //
    // **The two halves of this band do different jobs, and saying so is what stops the next
    // re-centring from quietly becoming a loosening.** The LOWER bounds are the discriminator: the
    // booster's 52.2 m/s and 390.5 m are 4.1× and 2.1× below them, so reporting the booster fails
    // both. The UPPER bounds discriminate nothing — a booster is slower and lower, so no ceiling can
    // catch it — and exist only to stop the number drifting unnoticed. They are therefore kept
    // TIGHT rather than generous: ±5%, against the ±1.2% they had before and the ±10% a first
    // attempt at this re-centring used. At ±10% the Burnout velocity a flyer sizes an ejection delay
    // against could move 9% with the suite green, which is a worse guard than the one being replaced.
    expect(summary, "03.Three-stage.ork was not read").toBeDefined();
    expect(summary!.v).toBeGreaterThan(213);
    expect(summary!.v).toBeLessThan(236);
    expect(summary!.alt).toBeGreaterThan(803);
    expect(summary!.alt).toBeLessThan(888);
    // Flies every multi-stage design; same explicit budget, same reason as the sweeps above.
  }, 300_000);

  it("offers a drag only drops that land exactly where the indicator promised", async () => {
    // R4's drag reads `moveSlots` for every place a part can go, draws an indicator at each, and
    // commits the one the pointer was nearest. A slot is therefore a PROMISE about where the part will
    // land, made before the flyer lets go — so the property to hold across real airframes is that
    // applying a slot puts the part immediately in front of the part the slot named, every time.
    //
    // Driven on the corpus rather than a fixture for the reason the reorder sweep gives: a stage
    // boundary is where the synthetic shapes cannot reach, and the aft-end slot of a non-final stage is
    // the one case where the part a drop lands in front of belongs to a DIFFERENT stage than the anchor.
    const misplaced: string[] = [];
    const crossed: string[] = [];
    const disagreed: string[] = [];
    let slots = 0;
    let designsWithASlot = 0;
    let acrossABoundary = 0;

    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const stageOf = (r: Rocket, id: string) =>
        r.stages.findIndex((s) => s.components.some((c) => c.id === id));
      let any = false;

      for (const stage of doc.rocket.stages) {
        for (const c of stage.components) {
          const offered = moveSlots(doc.rocket, c.id);

          // Every nudge the buttons offer must be one of the drag's slots. Two functions answering
          // "where can this go" is exactly how a control comes to offer a move the operation cannot
          // make, which cost this milestone an increment already.
          for (const dir of [-1, 1] as const) {
            const mv = moveTarget(doc.rocket, c.id, dir);
            if (mv && !offered.some((s) => s.move.after === mv.after)) {
              disagreed.push(`${f.name}: ${c.id} can nudge ${dir} to a slot the drag does not offer`);
            }
          }

          for (const slot of offered) {
            any = true;
            slots++;
            const after = applyGeometryEdits(doc.rocket, { moved: [slot.move] });
            if (stageOf(after, c.id) !== stageOf(doc.rocket, c.id)) {
              crossed.push(`${f.name}: ${c.id} left its stage`);
              continue;
            }
            // The promise: read the whole airframe's top-level order and check the dragged part sits
            // immediately in front of the part the slot named. Walked from the stages directly rather
            // than asked of `moveSlots` itself — a test that asks the function under suspicion is blind
            // exactly where the code is.
            const line = after.stages.flatMap((s) => s.components.map((x) => x.id));
            const at = line.indexOf(c.id);
            const landed = slot.before === null ? at === line.length - 1 : line[at + 1] === slot.before;
            if (!landed) {
              misplaced.push(
                `${f.name}: ${c.id} dropped before ${slot.before ?? "the tail"} landed in front of ${line[at + 1] ?? "nothing"}`,
              );
            }
            if (slot.before !== null && stageOf(doc.rocket, slot.before) !== stageOf(doc.rocket, c.id)) {
              acrossABoundary++;
            }
          }
        }
      }
      if (any) designsWithASlot++;
    }

    console.log(
      `drag drop-slots driven across ${files.length} design files: ${slots} (on ${designsWithASlot} designs), ` +
        `${acrossABoundary} landing in front of the next stage's first part`,
    );
    expect(slots, "no drop slot was driven — that branch proves nothing").toBeGreaterThan(100);
    expect(disagreed, "a nudge the drag does not offer as a slot").toEqual([]);
    expect(crossed, "a drop that moved a part into another stage").toEqual([]);
    expect(misplaced, "a drop that did not land where its indicator promised").toEqual([]);
  });

  it("never lets a reorder overlap a part, cross a stage, or fail to come back", async () => {
    // R4's operation, held across every real design rather than the starter's two-part stack. The
    // authoring sweep above exists because a stage boundary is where the synthetic fixtures could not
    // reach; the same is true here. A reorder is only interesting where a stage has three or more
    // top-level children, which **21 of the 35 corpus designs** have against three of the six committed
    // `fixtures/` (max 4 children) and none of the five `e2e/fixtures/` (max 2). So the committed set
    // can prove the gesture works and only the corpus can prove it holds across real airframes.
    //
    // Four rules, one per way a reorder can be wrong:
    //   1. no two top-level parts overlap afterwards — the done-when says the diagram never shows it,
    //      and since stations are derived from a running cursor the way to break it is to rewrite a
    //      `placement` instead of permuting the list;
    //   2. no part changes stage. `nextTopLevel` flattens across stage boundaries, so a part let out of
    //      its own stage re-stages itself silently — a different separation event and a different flight;
    //   3. the same set of parts is present afterwards, in a different order — a reorder must not add
    //      or drop anything;
    //   4. dropping the entry restores the original order exactly, which is what makes it undoable.
    const overlapped: string[] = [];
    const restaged: string[] = [];
    const lost: string[] = [];
    const stuck: string[] = [];
    let moves = 0;
    let changed = 0;
    let designsWithSomewhereToGo = 0;

    for (const f of files) {
      const doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      const stageOf = (r: Rocket, id: string) =>
        r.stages.findIndex((s) => s.components.some((c) => c.id === id));
      const topIds = (r: Rocket) => r.stages.map((s) => s.components.map((c) => c.id));
      const before = topIds(doc.rocket);
      let any = false;

      for (const stage of doc.rocket.stages) {
        for (const c of stage.components) {
          for (const dir of [-1, 1] as const) {
            const mv = moveTarget(doc.rocket, c.id, dir);
            if (!mv) continue;
            any = true;
            moves++;
            const after = applyGeometryEdits(doc.rocket, { moved: [mv] });

            // 3 — same parts, per stage.
            const now = topIds(after);
            if (
              now.length !== before.length ||
              now.some((ids, i) => [...ids].sort().join() !== [...before[i]].sort().join())
            ) {
              lost.push(`${f.name}: moving ${c.id} ${dir} changed which parts exist`);
            }
            // 2 — nothing changed stage.
            if (stageOf(after, c.id) !== stageOf(doc.rocket, c.id)) {
              restaged.push(`${f.name}: ${c.id} moved out of its stage`);
            }
            // 1 — no overlap. Walked from the flattened stations directly rather than asked of any
            // helper the reorder itself uses: a test that shares the function under suspicion is blind
            // exactly where the code is, which this suite has already been bitten by once.
            const flat = flattenRocket(after);
            const tops = new Set(after.stages.flatMap((s) => s.components.map((x) => x.id)));
            const line = flat.filter((x) => tops.has(x.component.id)).sort((a, b) => a.xFore - b.xFore);
            for (let i = 1; i < line.length; i++) {
              if (line[i].xFore < line[i - 1].xFore + line[i - 1].length - 1e-6) {
                overlapped.push(
                  `${f.name}: moving ${c.id} ${dir} overlapped ${line[i - 1].component.id} and ${line[i].component.id}`,
                );
                break;
              }
            }
            // 4 — the move CHANGED the order, and nudging it back restores it exactly.
            //
            // The obvious spelling of this rule — apply `{ moved: [] }` and compare — cannot fail:
            // `applyMoves` returns the rocket untouched on an empty list, so it asserts nothing about
            // the operation at all. Deleting the whole body of `applyMoves` would leave it green.
            // Driving the INVERSE move is the property that means something, and it needs the order to
            // have actually moved first, which is the `changed` counter below.
            if (JSON.stringify(now) === JSON.stringify(before)) {
              stuck.push(`${f.name}: moving ${c.id} ${dir} changed nothing`);
            } else {
              changed++;
              const back = moveTarget(after, c.id, dir === 1 ? -1 : 1);
              if (!back) {
                stuck.push(`${f.name}: ${c.id} could not be nudged back after moving ${dir}`);
              } else if (JSON.stringify(topIds(applyGeometryEdits(doc.rocket, { moved: [mv, back] }))) !== JSON.stringify(before)) {
                stuck.push(`${f.name}: nudging ${c.id} ${dir} and back did not restore the order`);
              }
            }
          }
        }
      }
      if (any) designsWithSomewhereToGo++;
    }

    console.log(
      `reorders driven across ${files.length} design files: ${moves} (on ${designsWithSomewhereToGo} designs), ` +
        `${changed} permuted the list and were nudged back`,
    );
    expect(moves, "no reorder was driven — that branch proves nothing").toBeGreaterThan(100);
    // Every driven move must have permuted the list. Without this the three rules above are satisfied
    // by an `applyMoves` that does nothing at all.
    expect(changed, "reorders that were applied but permuted nothing").toBe(moves);
    expect(overlapped, "reorders that made two top-level parts overlap").toEqual([]);
    expect(restaged, "reorders that moved a part into another stage").toEqual([]);
    expect(lost, "reorders that added or dropped a part").toEqual([]);
    expect(stuck, "reorders that could not be taken back").toEqual([]);
  }, 300_000);

  it("flies every stored simulation and agrees on apogee and speed", async () => {
    const asserted: Case[] = [];
    const excused: Case[] = [];
    const breaches: string[] = [];

    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue; // the import test above owns this failure
      }
      for (const sim of doc.simulations) {
        let run;
        try {
          run = runFromDocument(doc, {
            configId: sim.conditions.configId,
            // A reduced flight is a different vehicle, so its stored numbers aren't comparable.
            validateAgainst: doc.flownAsReduced ? undefined : sim,
            overrides: overridesFromStored(sim),
          });
        } catch (e) {
          breaches.push(`${shortName(f.name)} [${sim.name}] threw: ${(e as Error).message}`);
          continue;
        }
        const apogee = run.validation?.comparisons.find((c) => c.key === "maxAltitude");
        if (!run.hasPropulsion || !apogee || !Number.isFinite(apogee.pctError)) continue;
        const vel = run.validation?.comparisons.find((c) => c.key === "maxVelocity");
        const short = shortName(f.name);
        const known = KNOWN_ISSUES[`${short}::${sim.name}`] ?? KNOWN_ISSUES[short];
        const c: Case = {
          file: short,
          sim: sim.name,
          pctError: apogee.pctError,
          velPctError: vel && Number.isFinite(vel.pctError) ? vel.pctError : undefined,
        };
        if (known) {
          excused.push(c);
          continue;
        }
        asserted.push(c);
        if (Math.abs(apogee.pctError) > TOLERANCE_PCT) {
          breaches.push(
            `${short} [${sim.name}] apogee ${apogee.pctError.toFixed(1)}% ` +
              `(stored ${apogee.stored.toFixed(1)} m, Loft ${apogee.simulated.toFixed(1)} m)`,
          );
        }
        // Apogee alone is not the trajectory. A heavier rocket that also drags less reaches a
        // similar height on a different flight, so agreeing on the peak can be two errors
        // cancelling — this suite already refuses to *un-excuse* a case on apogee alone for
        // exactly that reason. Holding max velocity to the same tolerance makes that a gate
        // rather than a hint, and the speed it got there at is the number that separates the two.
        if (vel && Number.isFinite(vel.pctError) && Math.abs(vel.pctError) > TOLERANCE_PCT) {
          breaches.push(
            `${short} [${sim.name}] max velocity ${vel.pctError.toFixed(1)}% ` +
              `(stored ${vel.stored.toFixed(1)} m/s, Loft ${vel.simulated.toFixed(1)} m/s)`,
          );
        }
      }
    }

    // A known issue that has quietly come good should be un-excused rather than left hidden.
    // Apogee alone isn't enough to say so: several of these files store results their own
    // geometry can't produce, and one of them agrees on apogee while reading 25% high on speed.
    // Requiring the trajectory to agree too keeps the nudge from arming a coincidence.
    const fixed = excused.filter(
      (c) =>
        Math.abs(c.pctError) <= TOLERANCE_PCT / 2 &&
        c.velPctError !== undefined &&
        Math.abs(c.velPctError) <= TOLERANCE_PCT,
    );
    if (fixed.length) {
      console.log(
        `corpus: ${fixed.length} known-issue case(s) now agree on apogee AND speed — ` +
          `consider dropping their KNOWN_ISSUES entry:\n` +
          fixed
            .map(
              (c) =>
                `  ${c.file} [${c.sim}] apogee ${c.pctError.toFixed(1)}%, ` +
                `max velocity ${c.velPctError!.toFixed(1)}%`,
            )
            .join("\n"),
      );
    }

    expect(asserted.length, "no comparable simulations found — is the corpus complete?").toBeGreaterThan(0);
    expect(breaches, `apogee or max velocity outside ±${TOLERANCE_PCT}%`).toEqual([]);
  }, 900_000);

  it("still meets the accuracy the Validation page claims", async () => {
    // The docs publish a per-metric census of how far Loft lands from the numbers real design files
    // already carry. A published accuracy figure with nothing holding it to account goes quietly
    // stale the first time the engine changes — so it is asserted here, against the same corpus it
    // was measured on. One-directional on purpose: getting better is always allowed, and the run
    // logs the current figures so the page can be updated when it does.
    const errs = new Map<string, number[]>();
    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      for (const sim of doc.simulations) {
        let run;
        try {
          run = runFromDocument(doc, {
            configId: sim.conditions.configId,
            validateAgainst: doc.flownAsReduced ? undefined : sim,
            overrides: overridesFromStored(sim),
          });
        } catch {
          continue;
        }
        if (!run.hasPropulsion || !run.validation) continue;
        for (const c of run.validation.comparisons) {
          if (!Number.isFinite(c.pctError)) continue;
          const list = errs.get(c.key) ?? [];
          list.push(Math.abs(c.pctError));
          errs.set(c.key, list);
        }
      }
    }
    const median = (a: number[]) => {
      const s = [...a].sort((x, y) => x - y);
      return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    };
    const measured = [...errs.entries()].map(([k, v]) => ({ key: k, n: v.length, med: median(v) }));
    console.log(
      "corpus census (median |Δ| vs each file's stored results, known issues included):\n" +
        measured
          .sort((a, b) => b.med - a.med)
          .map((m) => `  ${m.key.padEnd(20)} n=${String(m.n).padStart(3)}  ${m.med.toFixed(1)}%`)
          .join("\n"),
    );
    const stale: string[] = [];
    for (const m of measured) {
      const claim = PUBLISHED_MEDIAN_PCT[m.key];
      if (claim === undefined) continue;
      if (m.med > claim + CENSUS_SLACK_PCT) {
        stale.push(`${m.key} median |Δ| ${m.med.toFixed(1)}% > the ${claim}% on /docs/validation`);
      }
    }
    expect(stale, "the Validation page's accuracy census no longer holds — remeasure and update it").toEqual([]);
  }, 900_000);

  /** **R9 increment 3: attribute the ground-hit-velocity error before moving any coefficient.**
   *
   *  `groundHitVelocity` is the metric Loft agrees with the corpus least on — 8.3% median against
   *  apogee's 3.1% — and the obvious lever is the parachute drag coefficient. This test exists to
   *  establish whether that is actually where the error lives, because the alternative is a session
   *  tuning a number until the census improves, which is fitting rather than fixing.
   *
   *  **The discriminating split is where the coefficient CAME FROM.** A design whose file states a
   *  Cd is flown on the designer's own figure; one that states none is flown on a Loft fallback. If
   *  the fallback group is markedly worse, the coefficient is the lever. If the two groups agree,
   *  the error is somewhere else entirely — the descent model, the wind, or the stored figures — and
   *  R9's later increments have to be re-aimed rather than spent.
   *
   *  It PRINTS the attribution and asserts only that the measurement was actually taken, because the
   *  finding is the output. A threshold here would be inventing a target for a number nobody has
   *  explained yet. */
  it("says where the ground-hit-velocity error actually lives, split by where the coefficient came from", async () => {
    const rows: { file: string; tool: string; from: string; pct: number }[] = [];
    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      // Every recovery device this design carries, and whether ANY of them took a Loft fallback.
      const chutes = flattenRocket(doc.rocket)
        .map((p) => p.component)
        .filter((c) => c.kind === "parachute" || c.kind === "streamer") as { cdFrom?: string }[];
      if (!chutes.length) continue;
      const from = chutes.every((c) => c.cdFrom === "file")
        ? "file"
        : chutes.every((c) => c.cdFrom === "default")
          ? "default"
          : "mixed";
      for (const sim of doc.simulations) {
        let run;
        try {
          run = runFromDocument(doc, {
            configId: sim.conditions.configId,
            validateAgainst: doc.flownAsReduced ? undefined : sim,
            overrides: overridesFromStored(sim),
          });
        } catch {
          continue;
        }
        if (!run.hasPropulsion || !run.validation) continue;
        const c = run.validation.comparisons.find((x) => x.key === "groundHitVelocity");
        if (!c || !Number.isFinite(c.pctError)) continue;
        // The writing tool, from the extension rather than from a field the corpus record does not
        // carry — the first version read `f.tool`, which is `undefined`, so all three per-tool rows
        // printed `n=0` and looked exactly like "no design of that kind disagrees".
        const tool = /\.ork(\.gz)?$/i.test(f.name) ? "openrocket" : /\.rkt$/i.test(f.name) ? "rocksim" : "rasaero";
        rows.push({ file: f.name, tool, from, pct: c.pctError });
      }
    }

    const median = (xs: number[]) => {
      if (!xs.length) return NaN;
      const a = [...xs].sort((p, q) => p - q);
      const m = a.length >> 1;
      return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    };
    const group = (name: string, sel: (r: (typeof rows)[number]) => boolean) => {
      const g = rows.filter(sel);
      const abs = g.map((r) => Math.abs(r.pct));
      // The SIGNED median matters as much as the absolute one: a coefficient that is wrong in one
      // direction shows as a one-sided error, while a scattered one points at the model instead.
      const signed = g.map((r) => r.pct);
      const low = g.filter((r) => r.pct < 0).length;
      return `${name.padEnd(22)} n=${String(g.length).padStart(3)}  |Δ| ${median(abs).toFixed(1).padStart(5)}%  signed ${median(signed).toFixed(1).padStart(6)}%  ${low}/${g.length} descend SLOWER than stored`;
    };

    console.log(
      "ground-hit velocity, attributed (R9 increment 3):\n" +
        [
          group("all", () => true),
          group("Cd from the file", (r) => r.from === "file"),
          group("Cd from a fallback", (r) => r.from === "default"),
          group("mixed", (r) => r.from === "mixed"),
          group("openrocket", (r) => r.tool === "openrocket"),
          group("rocksim", (r) => r.tool === "rocksim"),
          group("rasaero", (r) => r.tool === "rasaero"),
        ].join("\n") +
        "\n  worst 5: " +
        [...rows]
          .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
          .slice(0, 5)
          .map((r) => `${r.file} ${r.pct.toFixed(1)}% (${r.from})`)
          .join(", "),
    );

    // The measurement has to have HAPPENED — a split that examined nothing prints three tidy `n=0`
    // lines and reads exactly like a result.
    expect(rows.length, "no ground-hit comparisons were measured at all").toBeGreaterThan(50);
    expect(
      rows.filter((r) => r.from === "file").length,
      "no design flew a file-stated coefficient, so the split cannot discriminate",
    ).toBeGreaterThan(10);
    expect(
      rows.filter((r) => r.from !== "file").length,
      "no design flew a fallback coefficient, so the split cannot discriminate",
    ).toBeGreaterThan(5);
  }, 900_000);
  /** Every design whose airframe steps says so, and no design that fairs does.
   *
   *  The drag build-up charges a transition by its own joint angle and has no term at all for a
   *  bare step, so a stepped design flies optimistically by an amount Loft cannot state. The editor
   *  has said this since a flyer could author one, but only about the part they had SELECTED — so
   *  an imported design carried it silently. This pins the flight's own caution against the real
   *  corpus rather than against a synthetic two-tube case.
   *
   *  Measured across these 35 designs: 33 joints step in 13 designs; 27 of those steps in 9 designs
   *  clear the 0.5 mm notice threshold, median 12.70 mm of diameter and up to 82.55 mm. The other
   *  six are rounding artefacts of designs stated in inches. */
  it("says so on every real design whose airframe steps, and stays quiet on the rest", async () => {
    const stepped: string[] = [];
    const wrong: string[] = [];
    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      const steps = mouldLineSteps(doc.rocket).filter(
        (s) => Math.abs(s.diameterStep) > STEP_NOTICE_M,
      );
      let run;
      try {
        run = runFromDocument(doc);
      } catch {
        continue;
      }
      const said = run.result.warnings.some((w) => w.code === "mould-line-step");
      if (steps.length > 0) stepped.push(`${shortName(f.name)} (${steps.length})`);
      // The caution has to track the geometry in BOTH directions: a design that steps and says
      // nothing is the silence this closes, and one that fairs and cries wolf teaches flyers to
      // ignore the flag — which the brief calls out by name.
      if (steps.length > 0 && !said) wrong.push(`${shortName(f.name)}: steps but says nothing`);
      if (steps.length === 0 && said) wrong.push(`${shortName(f.name)}: fairs but cautions anyway`);
    }
    console.log(
      `mould-line steps across ${files.length} design files: ${stepped.length} designs step above the ` +
        `${STEP_NOTICE_M * 1000} mm notice threshold — ${stepped.join(", ")}`,
    );
    expect(wrong, "designs whose step caution disagrees with their geometry").toEqual([]);
    // A floor, not an equality: a re-cut corpus may add designs. Zero would mean the walk broke.
    expect(stepped.length).toBeGreaterThanOrEqual(9);
  }, 300_000);
  /** No recovery size the field offers may return a number physics cannot produce.
   *
   *  The step bound that keeps an open canopy's stiff drag inside RK4's stability region was
   *  reachable only once the flight had passed apogee, so a device opening at or before apogee was
   *  integrated at the flat boost step with no bound. Two designs here diverged from inputs inside
   *  the `Recovery size (×)` field's own advertised 0.1–10× range: `FullScaleModelTH.rkt`, which
   *  ejects half a second before apogee at 250 m/s, returned an apogee of 2.07e13 m at 5× (3.30e2 m
   *  at 4×); and `Complex.Two-Stage.CDX1`, whose drogue opens exactly AT apogee so a single
   *  unbounded step is enough, returned a ground-hit speed of 7.52e32 m/s and a landing energy of
   *  4.00e65 J at 10× — under a confident "hard landing" warning.
   *
   *  Driven across every design rather than the two known ones: the bug was reachable on any design
   *  whose recovery opens early, and which those are is a property of the corpus, not a constant. */
  it("returns a physical flight at every recovery size the field offers, on every design", async () => {
    const absurd: string[] = [];
    let flown = 0;
    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      for (const scale of [0.1, 2, 5, 10]) {
        let run;
        try {
          run = runFromDocument(doc, { recoveryCdScale: scale });
        } catch {
          continue;
        }
        if (!run.hasPropulsion) continue;
        flown++;
        const s = run.result.summary;
        // Ceilings a real hobby flight cannot reach, not tolerances: the Kármán line for altitude
        // and roughly orbital speed. A number past either is the integrator, not the rocket.
        const bad: string[] = [];
        if (!Number.isFinite(s.apogee) || s.apogee > 100_000) bad.push(`apogee ${s.apogee.toExponential(3)} m`);
        if (!Number.isFinite(s.maxVelocity) || s.maxVelocity > 8_000)
          bad.push(`max velocity ${s.maxVelocity.toExponential(3)} m/s`);
        if (!Number.isFinite(s.groundHitVelocity) || s.groundHitVelocity > 8_000)
          bad.push(`ground-hit ${s.groundHitVelocity.toExponential(3)} m/s`);
        if (!Number.isFinite(s.landingEnergy) || s.landingEnergy > 1e9)
          bad.push(`landing energy ${s.landingEnergy.toExponential(3)} J`);
        if (bad.length) absurd.push(`${shortName(f.name)} at ${scale}×: ${bad.join(", ")}`);
      }
    }
    console.log(`recovery-size sweep across ${files.length} design files: ${flown} flights at 0.1/2/5/10×`);
    expect(flown, "no design flew, so this asserted nothing").toBeGreaterThan(50);
    expect(absurd, "a legal recovery size produced a number physics cannot produce").toEqual([]);
  }, 900_000);

  /** A dispersion never reports a landing that did not happen.
   *
   *  `groundHitVelocity` and `landingEnergy` are 0 on a flight still airborne at the 1,200 s cap —
   *  a sentinel the solver documents as such — and the Monte-Carlo summary averaged them in
   *  alongside real landings. Measured on `Complex.Two-Stage.CDX1` at `recoveryCdScale: 5`, inside
   *  the field's own advertised 0.1–10x range: **40 of 40 samples were sentinels**, the panel read
   *  a median landing speed of 0.00 m/s and 0.0 J of landing energy, and the firm-landing chance
   *  came out 0.0% — the most flattering possible reading of a flight that never finished. The
   *  flight card one route away withholds those exact two figures with a reason, so two surfaces
   *  disagreed about whether the number existed at all.
   *
   *  Driven as a NEGATIVE CONTROL: summarise over `samples` instead of the landed ones and this
   *  names the designs and the recovery sizes whose landing statistics are pure sentinel. */
  it("never averages a landing that never happened into a dispersion", async () => {
    const sentinels: string[] = [];
    let checked = 0;
    let sawUnlanded = 0;
    // Counted and printed separately because the two new drift checks below sit on opposite
    // branches: one fires only where NOTHING landed, the other only where some did. A corpus that
    // happened to contain only one shape would leave the other silently vacuous, and this file's own
    // convention is that a check which cannot fail is worse than none.
    let sawNoneLanded = 0;
    let sawPartial = 0;
    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      // 5x is a legal entry in the recovery-size field, and it is where flights stop landing.
      for (const scale of [1, 5]) {
        let mc;
        try {
          mc = monteCarlo(doc.rocket, {
            n: 12,
            seed: 11,
            dispersions: { impulseFrac: 0.05, massFrac: 0.03, rodAngleDeg: 1 },
            recoveryCdScale: scale,
          });
        } catch {
          continue;
        }
        if (mc.n === 0) continue;
        checked++;
        if (mc.landedN < mc.n) sawUnlanded++;
        if (mc.landedN === 0) sawNoneLanded++;
        else if (mc.landedN < mc.n) sawPartial++;
        // Where nothing landed, both figures must be absent rather than zero. Where some did, the
        // summary must describe those and only those — a zero surviving into the band is a sample
        // that never reached the ground being counted as the softest landing in the set.
        if (mc.landedN === 0) {
          if (Number.isFinite(mc.landingSpeed.p50) || Number.isFinite(mc.landingEnergy.p50)) {
            sentinels.push(
              `${shortName(f.name)} at ${scale}x: nothing landed, yet landing speed reads ` +
                `${mc.landingSpeed.p50} m/s and energy ${mc.landingEnergy.p50} J`,
            );
          }
        } else if (mc.landingSpeed.min === 0) {
          sentinels.push(
            `${shortName(f.name)} at ${scale}x: ${mc.n - mc.landedN} of ${mc.n} never landed and a ` +
              `0 m/s sentinel reached the band`,
          );
        }
        // **Drift and the recovery radius ride the same population**, and until 2026-08-02 they did
        // not — they were summarised over every sample while the two figures above were already
        // filtered. The reason it survived that fix is that a sentinel drift is not a zero: it is
        // the distance the flight had covered when the cap stopped it, so it reads as a plausible
        // smaller number from a rocket that was still going downwind. Understated, on the figure a
        // flyer sizes a recovery area from.
        //
        // Asserted by CONSTRUCTION rather than by threshold: re-summarising the landed subset alone
        // must give the same drift band and the same radius as summarising the whole set does, which
        // is only true if the whole-set summary already ignores the un-landed ones. As a negative
        // control the old code fails this on the first design that hits the cap.
        if (mc.landedN > 0 && mc.landedN < mc.n) {
          const landedOnly = summarizeSamples(mc.samples.filter((x) => x.landed));
          const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
          if (
            !same(landedOnly.driftDistance.p50, mc.driftDistance.p50) ||
            !same(landedOnly.landingRadiusP95, mc.landingRadiusP95)
          ) {
            sentinels.push(
              `${shortName(f.name)} at ${scale}x: ${mc.n - mc.landedN} of ${mc.n} never landed, and ` +
                `their mid-air positions moved the drift band (${mc.driftDistance.p50.toFixed(1)} vs ` +
                `${landedOnly.driftDistance.p50.toFixed(1)} m) or the recovery radius ` +
                `(${mc.landingRadiusP95.toFixed(1)} vs ${landedOnly.landingRadiusP95.toFixed(1)} m)`,
            );
          }
        }
        // Where NOTHING landed there is no radius to draw at all, so both must be absent rather than
        // describing twelve rockets that were still in the air. Reproduced on
        // `Complex.Two-Stage.CDX1` at 5x: 0 of 12 landed, landing speed correctly withheld, and a
        // 58.0 m median drift and 121.4 m radius printed beside it.
        if (mc.landedN === 0 && (Number.isFinite(mc.driftDistance.p50) || Number.isFinite(mc.landingRadiusP95))) {
          sentinels.push(
            `${shortName(f.name)} at ${scale}x: nothing landed, yet median drift reads ` +
              `${mc.driftDistance.p50} m and the recovery radius ${mc.landingRadiusP95} m`,
          );
        }
      }
    }
    console.log(
      `dispersion landing sentinels across ${files.length} design files: ${checked} dispersions, ` +
        `${sawUnlanded} with at least one flight still airborne at the cap ` +
        `(${sawNoneLanded} where NONE landed, ${sawPartial} where some did) `,
    );
    expect(checked, "no dispersion ran, so this asserted nothing").toBeGreaterThan(10);
    expect(
      sawUnlanded,
      "no dispersion had an unlanded flight, so the sentinel path was never exercised",
    ).toBeGreaterThan(0);
    expect(sentinels, "a flight that never landed was reported as a landing").toEqual([]);
  }, 900_000);

  /** A fin set is judged for flutter only over the flight its own stage was still attached for.
   *
   *  `analyzeFlutter` walked the whole ascent for every fin set, so on a staged design a booster's
   *  fins were charged with the speed the SUSTAINER reached after they were already on the ground —
   *  and `results.reduce` made that the `worst` the entire flutter surface reports. Measured before
   *  the fix, every fin set on `Three stage low power rocket.ork` reported the identical 77.1 m/s at
   *  95 m, and the 0.68 margin lighting the red warning belonged to a fin set shed at 0.86 s; judged
   *  over its own flight it is 2.11. Flutter speed is the one safety estimate this app produces, and
   *  the worst fin set is also the one `FlutterFixHint` names and thickens.
   *
   *  Driven as a NEGATIVE CONTROL: drop the `phases` argument at the `analyzeFlutter` call in
   *  `simulate.ts` and this names every design whose fin sets collapse onto one sample. */
  it("judges each fin set over the flight its own stage was attached for", async () => {
    /** Which stage each fin set sits on, read from the MODEL rather than from the solver, so this
     *  is an independent derivation and not a restatement of the implementation. */
    const finStageOf = (rocket: Rocket): Map<string, number> => {
      const m = new Map<string, number>();
      const walk = (cs: RocketComponent[], stage: number) => {
        for (const c of cs) {
          if (
            c.kind === "trapezoidfinset" ||
            c.kind === "ellipticalfinset" ||
            c.kind === "freeformfinset"
          ) {
            m.set(c.id, stage);
          }
          walk(c.children, stage);
        }
      };
      rocket.stages.forEach((s, i) => walk(s.components, i));
      return m;
    };

    const late: string[] = [];
    let checked = 0;
    for (const f of files) {
      let doc;
      let run;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
        run = runFromDocument(doc);
      } catch {
        continue;
      }
      if (!run.hasPropulsion) continue;
      const flutter = run.result.flutter;
      // Detach times from the phase timeline the run reports, read through `StagePhase`'s own
      // documented meaning: `stageCount` is how many stages are still attached counting from the
      // nose, so stage `s` is gone from the first phase whose count has fallen to or below `s`.
      //
      // Counting separation EVENTS instead does not work, and getting that wrong made this test
      // silently weaker rather than louder: a serial stack can part at ONE joint and shed two
      // stages on a single event — `03.Three-stage.ork` does exactly that, phases
      // [{0,3},{7.33,1}] — so "the i-th separation removes stage n-i" assigned stage 1 an infinite
      // detach time and skipped the very fin set most likely to be judged out of its window.
      const phases = run.phases;
      if (!flutter || phases.length < 2) continue;
      const stageOf = finStageOf(doc.rocket);
      const detachOf = (stage: number): number =>
        phases.find((p) => p.stageCount <= stage)?.startTime ?? Infinity;

      // Narrowing a fin set's window can empty it: a stage shed before the rocket ever exceeds
      // 1 m/s leaves that set with no sample, and it then drops out of `finSets` with no error and
      // no marker — and if every fin-bearing stage went that early the whole flutter surface would
      // vanish from the flight card rather than say why. Nothing on today's corpus reaches it, and
      // this is what keeps it that way.
      if (flutter.finSets.length !== stageOf.size) {
        late.push(
          `${shortName(f.name)}: the design has ${stageOf.size} fin set(s) but flutter reports ` +
            `${flutter.finSets.length} — one was judged over an empty window and vanished silently`,
        );
      }

      for (const s of flutter.finSets) {
        const stage = stageOf.get(s.finId);
        if (stage === undefined || s.time === undefined) continue;
        const until = detachOf(stage);
        if (!Number.isFinite(until)) continue; // still attached at the end — nothing to check
        checked++;
        // A tenth of a second of slack: the trajectory is sampled, so the last sample before
        // separation can sit fractionally either side of the event's own timestamp.
        if (s.time > until + 0.1) {
          late.push(
            `${shortName(f.name)}: "${s.finName}" (stage ${stage}, shed at ${until.toFixed(2)} s) ` +
              `judged at t=${s.time.toFixed(2)} s, ${s.velocity.toFixed(1)} m/s, margin ${s.margin.toFixed(2)}`,
          );
        }
      }
    }
    console.log(
      `flutter stage-attachment across ${files.length} design files: ${checked} fin sets on stages that were shed`,
    );
    expect(checked, "no fin set was ever shed, so this asserted nothing").toBeGreaterThan(3);
    expect(late, "a shed stage's fins were judged at a speed they never saw").toEqual([]);
  }, 900_000);

  /** The landing speed a canopy is judged by does not change because the wind got up.
   *
   *  `groundHitVelocity` was the full ground-frame speed, `mag(state.vel)`, so under an open canopy
   *  it carried the horizontal drift — which IS the wind. The figure it is compared against, and
   *  the 25 ft/s and 35 ft/s rules of thumb it feeds, and the per-section landing energy a waiver
   *  cites, are all descent rates. On `USLI2025-FULLSCALE-10.15` it read 10.46 m/s at 20 mph
   *  against the file's own 5.61 at every wind, and the landing energy built on it was 3.7x too
   *  large — on the surface a flyer sizes a canopy from.
   *
   *  Driven as a NEGATIVE CONTROL: restore `mag(state.vel)` at the `groundHitVelocity` assignment
   *  and this names the designs and the exact speeds it moved to. The total is asserted to move in
   *  the same breath, so the test cannot be satisfied by making both wind-blind. */
  it("judges a canopy by its descent rate, which the wind does not change", async () => {
    const WINDS = [0, 4, 9];
    const drifted: string[] = [];
    let checked = 0;
    let sawTotalRise = 0;
    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      const runs = WINDS.map((windSpeed) => {
        try {
          return runFromDocument(doc, { overrides: { windSpeed } });
        } catch {
          return undefined;
        }
      });
      if (runs.some((r) => !r?.hasPropulsion)) continue;
      const sums = runs.map((r) => r!.result.summary);
      // Only designs that actually come down under a canopy: a ballistic arrival is dominated by
      // the vertical term anyway, so it cannot tell the two conventions apart.
      if (!sums.every((s) => s.landed && s.groundHitVelocity > 0 && s.groundHitVelocity < 30)) continue;
      checked++;

      const calm = sums[0].groundHitVelocity;
      for (let i = 1; i < sums.length; i++) {
        const moved = Math.abs(sums[i].groundHitVelocity - calm) / calm;
        // 2% covers the genuine second-order effect of a longer, wind-lengthened descent; the
        // defect moved it by 93% on the worst design.
        if (moved > 0.02) {
          drifted.push(
            `${shortName(f.name)}: descent rate ${calm.toFixed(2)} m/s calm -> ` +
              `${sums[i].groundHitVelocity.toFixed(2)} m/s at ${WINDS[i]} m/s of wind (+${(moved * 100).toFixed(0)}%)`,
          );
        }
      }
      // The drift is not discarded — it is reported as the arrival speed, and that one MUST rise.
      if (sums[sums.length - 1].groundHitTotalVelocity > sums[0].groundHitTotalVelocity * 1.05) {
        sawTotalRise++;
      }
    }
    console.log(
      `landing-speed wind invariance across ${files.length} design files: ${checked} designs flown at ` +
        `${WINDS.join("/")} m/s, ${sawTotalRise} whose arrival speed rises with the wind`,
    );
    expect(checked, "no design came down under a canopy, so this asserted nothing").toBeGreaterThan(5);
    expect(drifted, "the descent rate a canopy is judged by moved with the wind").toEqual([]);
    expect(
      sawTotalRise,
      "no design's arrival speed rose with the wind — the drift term has been dropped, not separated",
    ).toBeGreaterThan(0);
  }, 900_000);
  /** The optimum delay describes the vehicle on screen, not the one in the file.
   *
   *  When a design deploys before apogee its own apogee time reads low, so the delay is recomputed
   *  from a recovery-free coast. That recompute used the RAW build rather than the flight actually
   *  flown, and silently dropped every caller option — nose ballast, and the thrust/mass/drag scales
   *  and time step. Measured on `The Red Hunter.ork`: the delay sat at exactly 4.66 s for ballast 0,
   *  0.01, 0.02, 0.05 and 0.1 kg while apogee fell 258.5 → 147.4 m; the correct figures are
   *  4.66 / 4.99 / 5.20 / 5.31 / 4.58, so at 0.05 kg a flyer was told 4.66 s for a rocket that wants
   *  5.31 — on a number they set on the motor itself.
   *
   *  The invariant, which does not depend on any one design: the delay a run reports must equal the
   *  delay of the SAME run flown ballistic. Anything else means the two describe different vehicles. */
  it("reports an optimum delay for the vehicle it flew, ballast and all", async () => {
    const wrong: string[] = [];
    let exercised = 0;
    for (const f of files) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      for (const ballastKg of [0, 0.05]) {
        let run;
        let ballistic;
        try {
          run = runFromDocument(doc, { ballastKg });
          ballistic = runFromDocument(doc, { ballastKg, ballistic: true });
        } catch {
          continue;
        }
        // Only designs that actually take the recompute branch can say anything here.
        if (!run.hasPropulsion || !run.result.deployedBeforeApogee) continue;
        const shown = run.result.summary.optimumDelay;
        const truth = ballistic.result.summary.optimumDelay;
        if (!Number.isFinite(shown) || !Number.isFinite(truth)) continue;
        exercised++;
        if (Math.abs(shown - truth) > 0.01) {
          wrong.push(
            `${shortName(f.name)} @ ${ballastKg} kg: shows ${shown.toFixed(2)} s, flew a rocket wanting ${truth.toFixed(2)} s`,
          );
        }
      }
    }
    console.log(`optimum delay checked on ${exercised} early-deploying flights across ${files.length} design files`);
    // Non-vacuous: if nothing deploys early the assert below proves nothing at all.
    expect(exercised, "no corpus design deployed before apogee, so this asserted nothing").toBeGreaterThan(0);
    expect(wrong, "the optimum delay describes a different vehicle than the flight beside it").toEqual([]);
  }, 300_000);
  /** The waiver number a flyer actually acts on, over real designs.
   *
   *  "Chance over ceiling" is the most actionable figure in the app. Its inputs are dispersed
   *  samples, and the sample filter used to ask only whether the apogee was FINITE — which a
   *  diverged integration is. Measured before the fix, on `FullScaleModelTH.rkt` at the panel's own
   *  default dispersions with a nominal recovery size of 4x: apogee p50 332 m but p95 4.881e18 m,
   *  and exceedance against a 1,000 m ceiling read 17.5% where the truth is 0%.
   *
   *  Driven at a recovery scale in the region that used to diverge, because that is the input that
   *  produced it — a Monte-Carlo at nominal settings would have passed throughout. */
  it("gives a dispersion a flyer could act on, at a recovery size that used to diverge", async () => {
    const bad: string[] = [];
    let checked = 0;
    for (const f of files.slice(0, 12)) {
      let doc;
      try {
        doc = await importDesign(new Uint8Array(readFileSync(f.path)));
      } catch {
        continue;
      }
      let res;
      try {
        res = monteCarlo(doc.rocket, {
          n: 40,
          seed: 12345,
          recoveryCdScale: 4,
          dispersions: {
            impulseFrac: 0.05,
            massFrac: 0.03,
            dragFrac: 0.1,
            recoveryFrac: 0.15,
            rodAngleDeg: 2,
            windSpeedMps: 2,
          },
        });
      } catch {
        continue;
      }
      if (res.samples.length === 0) continue;
      checked++;
      // The band, not just the median: a single diverged sample moves p95 and leaves p50 alone,
      // which is exactly how this hid.
      for (const [name, stat] of [
        ["apogee", res.apogee],
        ["landing speed", res.landingSpeed],
      ] as const) {
        for (const [k, v] of Object.entries(stat)) {
          if (typeof v !== "number") continue;
          if (!Number.isFinite(v) || Math.abs(v) > 100_000) {
            bad.push(`${shortName(f.name)} ${name}.${k} = ${v.toExponential(3)}`);
          }
        }
      }
    }
    console.log(`dispersion bands checked on ${checked} designs at 4x recovery, 40 samples each`);
    expect(checked, "no design produced a dispersion, so this asserted nothing").toBeGreaterThan(0);
    expect(bad, "a dispersion band contains a figure physics cannot produce").toEqual([]);
  }, 900_000);
});
