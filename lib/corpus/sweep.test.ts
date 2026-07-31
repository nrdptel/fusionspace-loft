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
import { runFromDocument, overridesFromStored } from "../sim/run";
import { flattenRocket, leadingFaceDiameter } from "../model/geometry";
import type { Rocket, RocketComponent } from "../model/types";
import {
  applyGeometryEdits,
  moveTarget,
  moveSlots,
  canAddStage,
  removalRefusal,
  transitionDefaults,
  newPartId,
  aimEditsAt,
  primaryMassObject,
  primaryNose,
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
    "Third-stage burn still diverges after the ignition-order fix; apogee is within 10% but max " +
    "velocity reads 17% low.",
};

/** The per-metric accuracy the Validation page publishes: median absolute disagreement with each
 *  file's own stored results, across every stored simulation Loft flies completely (known issues
 *  included, so it is the honest picture rather than the flattering one). Keep this and the page in
 *  step — the suite prints the current figures, so an improvement is a one-line update to both. */
const PUBLISHED_MEDIAN_PCT: Record<string, number> = {
  timeToApogee: 1.7,
  launchRodVelocity: 1.9,
  maxMach: 2.1,
  maxVelocity: 2.3,
  optimumDelay: 2.7,
  groundHitVelocity: 3.0,
  maxAltitude: 3.2,
  flightTime: 3.3,
  maxAcceleration: 3.2,
  deploymentVelocity: 5.9,
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
});
