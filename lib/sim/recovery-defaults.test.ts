import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { RECOVERY_CD_DEFAULTS, ORK_PARACHUTE_CD, RASAERO_PARACHUTE_CD } from "./recovery-defaults";
import { DESCENT_BODY_CDA_FACTOR, DESCENT_BODY_CDA_SOURCE } from "./recovery";

const read = (f: string) => readFileSync(resolve(process.cwd(), f), "utf8");

/** R9 increment 1 and 2: every figure the descent is computed from is in ONE place and says where it
 *  came from — or says plainly that nothing publishes one.
 *
 *  These are reference values in the strictest sense `DESIGN.md` §6 means: they set descent rate,
 *  arrival speed and landing energy, which is the number an RSO and a waiver check. Five of them were
 *  bare literals in `parseNum(..., 0.8)` arguments across three adapters, and a sixth existed as three
 *  copies of the same number, one of which claimed in a comment to be the source of the other two. */
describe("the figures the descent is computed from", () => {
  it("puts the airframe's descent drag in one place, and nothing re-types it", () => {
    // The three copies this collapses: `recovery.ts`'s constant, and two bare `* 0.5` literals in
    // `simulate.ts` — at the drag term and at the descent step-size limiter. Nothing enforced the
    // match, so changing the constant would have re-sized every canopy while leaving every flown
    // descent alone, and the two would have disagreed with no test able to see it.
    const sim = read("lib/sim/simulate.ts");
    expect(sim, "simulate.ts does not import the descent body-drag constant").toContain(
      "DESCENT_BODY_CDA_FACTOR",
    );
    // Both descent cdA expressions must go through the constant. Matching the SHAPE rather than the
    // literal, because the literal is what this test exists to forbid.
    const descentCdA = [...sim.matchAll(/refArea \* ([A-Za-z0-9_.]+)/g)].map((m) => m[1]);
    expect(descentCdA.length, "the descent cdA expressions were not found — this test is asserting nothing").toBe(2);
    for (const term of descentCdA) {
      expect(term, `a descent cdA term re-types the factor as ${term}`).toBe("DESCENT_BODY_CDA_FACTOR");
    }
    expect(DESCENT_BODY_CDA_FACTOR).toBeGreaterThan(0);
    // And it says, in a value rather than only in prose, that it is not a sourced figure.
    expect(DESCENT_BODY_CDA_SOURCE).toBeNull();
  });

  it("gives every importer's Cd fallback a source or an explicit statement that there is none", () => {
    expect(RECOVERY_CD_DEFAULTS.length, "the fallback set is empty").toBe(5);
    for (const d of RECOVERY_CD_DEFAULTS) {
      expect(d.cd, `${d.basis}: not a physical coefficient`).toBeGreaterThan(0);
      expect(d.cd).toBeLessThan(3);
      // `source: null` is a real answer — the same shape `lib/sim/flutter.ts` uses for the six shear
      // moduli nothing publishes. What is forbidden is a value that says NEITHER.
      expect(typeof d.basis, "a fallback with no basis at all").toBe("string");
      expect(d.basis.length, "an empty basis is the same as no basis").toBeGreaterThan(40);
      if (d.source === null) {
        expect(d.basis, "an unsourced value must say so in words").toMatch(/no published basis/i);
      } else {
        expect(d.source.length).toBeGreaterThan(10);
      }
    }
    // Exactly one of the five is defensibly sourced, and it is the .ork one — because `auto` means
    // "use OpenRocket's default", so Loft is resolving a value the file delegated rather than
    // choosing one. If that ever stops being the only sourced entry, this number should move
    // deliberately rather than by accident.
    expect(RECOVERY_CD_DEFAULTS.filter((d) => d.source !== null).length).toBe(1);
    expect(ORK_PARACHUTE_CD.source).toMatch(/OpenRocket/);
  });

  it("keeps the adapters from re-typing a coefficient beside the one that is documented", () => {
    // The defect this closes: five bare literals, each invisible to a reader of the descent model.
    // Asserted on the source, because a value that is correct today and hand-typed tomorrow is the
    // whole failure mode.
    for (const f of ["lib/ork/adapt.ts", "lib/rkt/adapt.ts", "lib/rasaero/adapt.ts"]) {
      const src = read(f);
      expect(src, `${f} does not import the documented recovery defaults`).toMatch(
        /from "\.\.\/sim\/recovery-defaults"/,
      );
      // No bare 0.8/0.75 left in a recovery-Cd position. Narrow on purpose: these two literals appear
      // elsewhere in these files for unrelated reasons, so the check is anchored to the `cd` field.
      const bare = [...src.matchAll(/\bcd:\s*[^,\n]*\b0\.(?:8|75)\b/g)];
      expect(bare.map((m) => m[0]), `${f} still types a recovery Cd by hand`).toEqual([]);
    }
  });

  it("records how often each fallback is actually reached, and RASAero's disagreement with its own tool", () => {
    // **A default that fires on nothing is not a lever.** This is what stops the next session
    // "fixing" the RASAero value: its own tool documents 1.33 with a stated basis and Loft falls back
    // to 0.8, which looks like an obvious correction — and would change no flown number, because
    // every RASAero recovery device in the corpus states its own Cd. `MAINTAINING.md` is explicit
    // that a change firing on zero real files is worse than none.
    for (const d of RECOVERY_CD_DEFAULTS) {
      expect(d.corpusHits, "a fallback with no measurement of how often it fires").toBeGreaterThanOrEqual(0);
    }
    // Measured 2026-08-03 over the real corpus: 17 of the 24 .ork canopies say `auto`.
    expect(ORK_PARACHUTE_CD.corpusHits).toBe(17);
    // And the four other fallbacks are reached by nothing at all.
    expect(RECOVERY_CD_DEFAULTS.filter((d) => d.corpusHits === 0).length).toBe(4);
    // The discrepancy is written down rather than shelved, so it is not rediscovered and re-parked.
    expect(RASAERO_PARACHUTE_CD.basis).toMatch(/1\.33/);
  });
});
