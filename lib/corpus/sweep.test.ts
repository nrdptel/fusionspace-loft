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
 *   - where Loft flew the complete design and the file stores results, the apogee agrees within
 *     `TOLERANCE_PCT` — unless the case is listed in `KNOWN_ISSUES` with a reason.
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
  "FullScaleModelTH.rkt::L1940X-0":
    "Zero-delay configuration: the charge fires at burnout at 236 m/s and the canopy opens while " +
    "still climbing. Loft models the deployment but not the shredding that RockSim's numbers imply.",
  "Punisher Apprentice.ork::Simulation 10":
    "Largest motor in a nine-simulation sweep; the rest land within 8%.",
  "03.Three-stage.ork":
    "Third-stage burn still diverges after the ignition-order fix; apogee is within 10% but max " +
    "velocity reads 17% low.",
};

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

  it("flies every stored simulation and agrees on apogee", async () => {
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
    expect(breaches, `apogee outside ±${TOLERANCE_PCT}%`).toEqual([]);
  }, 900_000);
});
