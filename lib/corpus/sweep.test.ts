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
import { flattenRocket } from "../model/geometry";
import { applyGeometryEdits, removalRefusal } from "../model/edit";
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
