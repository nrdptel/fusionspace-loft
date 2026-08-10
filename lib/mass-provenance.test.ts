/** One describer, three surfaces — and a check that it stays that way.
 *
 *  The parts table's *Mass from* column, the identify line under the drawing, and the mass & balance
 *  breakdown all answer "whose number is this". They answered it in one place, then two, then three,
 *  and each addition was a chance for one of them to say something the others do not. This run's own
 *  validation-table defect was exactly that shape: a rule stated on the model, honoured by one
 *  surface, and never asked by the next one built.
 *
 *  So the words live in `lib/mass-provenance.ts` and this asserts that no surface has grown its own
 *  copy of them. */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { massSource, massSourceLabel } from "./mass-provenance";
import type { RocketComponent } from "./model/types";

const part = (massFrom?: string): RocketComponent =>
  ({ id: "x", name: "x", kind: "bodytube", placement: { method: "top", offset: 0 }, children: [], massFrom }) as unknown as RocketComponent;

describe("the mass provenance describer", () => {
  it("names each stated origin, and stays silent for Loft's own", () => {
    expect(massSource(part("stated"))?.label).toBe("stated by the design");
    expect(massSource(part("tool"))?.label).toBe("computed by the source tool");
    expect(massSource(part("flyer"))?.label).toBe("the figure you set");
    // Absence is the ordinary case and makes no claim — it has no mark at all, which is what lets a
    // surface show marks only where there is something to say.
    expect(massSource(part(undefined))).toBeUndefined();
  });

  it("gives every stated origin a DISTINCT mark, or the key cannot be read", () => {
    const marks = (["stated", "tool", "flyer"] as const).map((f) => massSource(part(f))!.mark);
    expect(new Set(marks).size, "two provenances share a mark, so the caption's key is ambiguous").toBe(3);
  });

  it("says 'Loft's own' for an unmarked mass that IS on the row", () => {
    expect(massSourceLabel(part(undefined), true)).toBe("Loft's own");
  });

  /** A part whose mass is counted elsewhere has no provenance to give, and claiming one would be a
   *  statement about a number that is not on the row. The dash matches what its Mass cell says. */
  it("withholds a provenance for a mass counted somewhere else", () => {
    expect(massSourceLabel(part("stated"), false)).toBe("—");
    expect(massSourceLabel(part(undefined), false)).toBe("—");
  });

  /** **The structural half.** A surface that re-implements these strings can drift from the others
   *  silently — the words would still look right in review, one file at a time. */
  it("is the only place in the app that spells these sentences out", () => {
    const roots = ["components", "app", "lib"].map((d) => resolve(process.cwd(), d));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const full = join(dir, e);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e)) files.push(full);
      }
    };
    roots.forEach(walk);
    expect(files.length, "the walk read nothing — it is not reading the tree").toBeGreaterThan(50);

    const OWN = resolve(process.cwd(), "lib/mass-provenance.ts");
    const SELF = resolve(process.cwd(), "lib/mass-provenance.test.ts");
    // Comments are stripped: several files DISCUSS this vocabulary at length, and a mention in a
    // docblock is not a second implementation.
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const offenders = files
      .filter((f) => f !== OWN && f !== SELF)
      // **Tests are allowed to name the words; surfaces are not.** A case asserting that a table
      // renders "computed by the source tool" is a CHECK on this vocabulary, and it goes red if the
      // wording changes — which is the behaviour wanted, not a second implementation to keep in
      // step. `lib/corpus/sweep.test.ts` is the one that does it today.
      .filter((f) => !/\.(test|spec)\.tsx?$/.test(f))
      .filter((f) => /computed by the source tool|stated by the design|the figure you set/.test(strip(readFileSync(f, "utf8"))))
      .map((f) => f.slice(process.cwd().length + 1));
    expect(offenders, "a surface spells out a mass provenance instead of importing the one describer").toEqual([]);
  });
});
