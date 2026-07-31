import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** `DESIGN.md` §9, as an assertion instead of a command a session may or may not run.
 *
 *  The design system is binding, and before this file existed the only thing enforcing it was a block
 *  of shell in a markdown file. That is why the counts below were 49, 9 and 8 rather than 0, 1 and 0:
 *  every one of them is a treatment somebody hand-rolled just this once, on a day when nobody happened
 *  to run the block. `DESIGN.md` §9 says outright that the target is for these to be asserted by a
 *  test, and P1 ("one design system, adopted") is that milestone.
 *
 *  **The budgets are EXACT, not upper bounds, and that is deliberate.** An upper bound goes slack: a
 *  conversion that removes eleven treatments leaves a budget with eleven units of room in it, and the
 *  next hand-rolled card lands inside that room without failing anything. An exact count fails on an
 *  improvement too, which forces the new number into the same commit as the work — so the diff itself
 *  records the progress, which is what `DESIGN.md` §9 asks for when it says to put the counts in the
 *  commit message. When one of these fails after a deliberate conversion, lower the budget; when it
 *  fails after anything else, you hand-rolled a treatment that has a primitive.
 *
 *  The greps are `DESIGN.md` §9's own, kept in step with it deliberately — this file is the executable
 *  copy of that block and neither is allowed to drift from the other.
 */

const ROOT = process.cwd();

function sourcesUnder(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  (function walk(d: string) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
    }
  })(join(ROOT, dir));
  return out;
}

/** Everything that can carry a class name. `app` holds the routes, `components` the surfaces — and
 *  `app/globals.css` holds the `@apply`-style rules, which is why `.css` is in here: §9's own greps
 *  have no extension filter, and a `rounded-lg` in the stylesheet is the same drift as one in a
 *  component. Reading only `.tsx` would have under-counted by one and called it progress. */
function uiSources(dirs: string[], exts: string[] = [".tsx", ".css"]): { path: string; text: string }[] {
  return dirs
    .flatMap((d) => sourcesUnder(d, exts))
    .map((p) => ({ path: p.slice(ROOT.length + 1), text: readFileSync(p, "utf8") }));
}

function countMatches(files: { path: string; text: string }[], re: RegExp): { total: number; byFile: string[] } {
  const byFile: string[] = [];
  let total = 0;
  for (const f of files) {
    const n = f.text.match(re)?.length ?? 0;
    if (n > 0) {
      total += n;
      byFile.push(`${f.path}: ${n}`);
    }
  }
  return { total, byFile: byFile.sort() };
}

/** The counts as they stand. Each is a ratchet toward the target named beside it; lower it in the same
 *  commit as the conversion that earns it, and never raise one. */
const BUDGET = {
  /** `rounded-lg` is not in the system at all — containers are `xl`, controls are `md`. Target 0. */
  roundedLg: 15,
  /** Distinct card treatments. One of these is now `<Card>`'s own string, which is the target state;
   *  the other two are a floating toast (`shadow-lg`) and the import drop zone (`border-2 border-dashed`,
   *  an interactive target rather than a container). Both want their own named primitive rather than
   *  being folded into `Card`, so the honest floor here is 3 and not 1 — recorded in `ROADMAP.md`. */
  cardTreatments: 3,
  /** Spacing values off the `1 2 3 4 6 8 12` scale. Target 0. */
  offScaleSpacing: 0,
  /** Components importing the shared primitives. Target: most of the 23. This one only goes UP. */
  uiAdopters: 14,
  /** Component files where caption size OUTNUMBERS the body default. **At the target**, so this is a
   *  guard rather than a ratchet from here on: a file that inverts again is a decision-grade value
   *  that has been put back at caption size. */
  invertedTypeFiles: 0,
  /** Sizes that are not on `DESIGN.md` §3's six-size scale at all. Target 0, and it is AT 0 — this one
   *  is a guard rather than a ratchet. `text-lg` sat between `text-base` and `text-xl`, invented once
   *  and copied fourteen times: eleven panel headings and three prominent values. */
  offScaleType: 0,
} as const;

/** How many components import EACH primitive by name.
 *
 *  The file-level adopter count above is necessary and nowhere near sufficient, and it took an outside
 *  reading of this test to see why: eleven files import `components/ui.tsx` and nine of them import
 *  nothing but `Card`. A ratchet that only counts FILES is satisfied for the rest of the milestone by
 *  adding one more `Card` import, while all 43 hand-rolled `<button>` elements and every section
 *  heading stay exactly where they are — which is P1's actual gap. Depth, not breadth.
 *
 *  A zero here is not a failure; it is a primitive that exists and is not yet adopted, which is the
 *  state `DESIGN.md` recorded for `Chip` and `Disclosure` on 2026-07-30 and the state this milestone
 *  is closing. What must not happen is a zero silently BECOMING the finished condition. */
const PRIMITIVE_ADOPTERS: Record<string, number> = {
  Card: 11,
  Button: 9,
  /** The button geometry as a class, for the two things that must look like a button and cannot BE
   *  one — a `next/link` and an external `<a>`. It is exported from `lib/ui-tokens.ts` rather than
   *  from `components/ui.tsx` because the site header is a SERVER component and cannot call into a
   *  `"use client"` module; the regex below reads both modules for that reason. Counted separately
   *  because a rising number here is not the same win as a rising `Button`: it means a navigation
   *  control stopped hand-copying the geometry, not that a `<button>` was converted. */
  buttonClass: 1,
  Section: 0,
  Segmented: 1,
  Tabs: 1,
  NumberField: 1,
  ClosePanel: 3,
  Chip: 0,
  Disclosure: 0,
};

describe("DESIGN.md §9 — the design system is binding, and this is what checks it", () => {
  const ui = uiSources(["components", "app"]);
  const components = uiSources(["components"], [".tsx"]);

  it("has sources to read at all", () => {
    // A denominator. Every assertion below counts occurrences, so a walk that found nothing would
    // report a perfectly compliant app that does not exist.
    expect(ui.length).toBeGreaterThan(25);
    expect(components.length).toBeGreaterThan(20);
  });

  it(`uses rounded-lg exactly ${BUDGET.roundedLg} times, on the way to none`, () => {
    // `rounded-lg` is the middle radius, and it is the single value that caused most of the measured
    // drift: it reads as "a bit rounder", so it lands on containers and controls alike and blurs the
    // one distinction the radius scale exists to make.
    const { total, byFile } = countMatches(ui, /rounded-lg/g);
    expect(total, `rounded-lg, by file:\n${byFile.join("\n")}`).toBe(BUDGET.roundedLg);
  });

  it(`hand-rolls exactly ${BUDGET.cardTreatments} distinct card treatments, on the way to one`, () => {
    // The measurement that made P1 a milestone. Each distinct string is one card somebody wrote out
    // by hand rather than importing, and every one of them was a just-this-once.
    const treatments = new Set<string>();
    for (const f of components) {
      for (const m of f.text.match(/rounded-xl border[a-z0-9 /-]*/g) ?? []) treatments.add(m.trim());
    }
    expect(
      treatments.size,
      `distinct card treatments:\n${[...treatments].sort().join("\n")}`,
    ).toBe(BUDGET.cardTreatments);
  });

  it(`uses exactly ${BUDGET.offScaleSpacing} off-scale spacing values, on the way to none`, () => {
    // The scale is 1 2 3 4 6 8 12. A `mt-5` between two things that are `mt-4` apart everywhere else
    // is invisible on its own page and is exactly how a layout stops lining up across surfaces.
    //
    // AT the target, so this is a guard rather than a ratchet from here. THREE blind spots in the
    // pattern are measured and filed in `BACKLOG.md` rather than silently counted as clean: it cannot
    // match a `gap-*` (the character after `g` is not one of `xytblr`, so the `-` never lines up), it
    // cannot match a half-step, and its alternation stops at 14 so nothing larger is seen either. The
    // single `gap-5` was fixed with the rest; 98 half-steps and two values above 14 are left, because
    // §4 states the scale and then prescribes a half-step as the padding inside a control — so half of
    // them are the file's own instruction. Widening this regex without widening §9's would put the two
    // out of step, and §9 is shared verbatim with the sibling app.
    const { total, byFile } = countMatches(ui, /\b[pmg][xytblr]?-(?:5|7|9|10|11|14)\b/g);
    expect(total, `off-scale spacing, by file:\n${byFile.join("\n")}`).toBe(BUDGET.offScaleSpacing);
  });

  // The SUITE-WIDE `text-sm` vs `text-xs` ratio is deliberately NOT asserted, and the reason is a
  // measurement rather than an opinion. `DESIGN.md` §9 counts occurrences of the class string, and a
  // primitive collapses many occurrences into one: converting nine hand-rolled buttons onto `Button`
  // moved the totals from 91/88 to 84/89 — an inversion by the metric — while not one glyph on screen
  // changed size, because the `text-sm` moved INTO `BUTTON_SIZES`. Adoption therefore drives the
  // suite ratio the wrong way for the right reason, which makes it useless exactly during the
  // milestone that raises adoption. The per-file count below is the one that means something.

  it(`has exactly ${BUDGET.invertedTypeFiles} files where caption size outnumbers the body default`, () => {
    // The suite total above passes by THREE (91 to 88), and that margin was hiding nine files that
    // were individually inverted — `GeometryInspector` at 10:2, `MonteCarlo` at 9:3, `ResultsView` at
    // 16:13. A flyer does not read the suite total; they read one surface, and on nine of them the
    // numbers were at caption size. This is the count that means something, which is why `DESIGN.md`
    // §9 now carries it too.
    //
    // Taken to zero on 2026-07-31 by moving what `DESIGN.md` §3 calls decision-grade — a value a
    // flyer reads to decide — up to the body default, and leaving genuine captions where they were.
    // The sites that moved were, in order of how load-bearing they are: the four ResultsView advice
    // blocks that each tell a flyer what to change on the rocket and to what number (stability trim,
    // fin-flutter fix, recovery sizing, the log-vs-prediction peak comparison); the what-if delta
    // that is the whole point of making an edit; the dispersion study's 5–95% bands and median drift,
    // which ARE the subject of a Monte-Carlo; the mould-line step notice and the stated-mass notice,
    // both of which exist to stop a number being misread; and the cross-check's mean drag gap.
    // Nothing that is a unit, a provenance line, a chart legend or a footnote moved.
    const inverted = components
      .map((f) => ({
        path: f.path,
        xs: f.text.match(/text-xs/g)?.length ?? 0,
        sm: f.text.match(/text-sm/g)?.length ?? 0,
      }))
      .filter((f) => f.xs > f.sm);
    expect(
      inverted.length,
      `inverted files:\n${inverted.map((f) => `${f.path} ${f.xs}/${f.sm}`).join("\n")}`,
    ).toBe(BUDGET.invertedTypeFiles);
  });

  it(`has at least ${BUDGET.uiAdopters} components importing the shared primitives`, () => {
    // The direction that matters: this number only ever goes up, and it is what "adopted" means.
    const adopters = components.filter((f) => /from "(?:\.\/ui|@\/components\/ui)"/.test(f.text));
    expect(
      adopters.length,
      `importing components/ui.tsx:\n${adopters.map((f) => f.path).join("\n")}`,
    ).toBeGreaterThanOrEqual(BUDGET.uiAdopters);
  });

  it("counts adoption per PRIMITIVE, not just per file", () => {
    // Nine of the eleven adopters import only `Card`. Without this, the milestone's remaining
    // increments can go green while every button in the app is still a hand-rolled class string.
    const counted: Record<string, number> = {};
    for (const name of Object.keys(PRIMITIVE_ADOPTERS)) {
      // The import list of `./ui`, per file — not a bare mention, which would match the component's
      // own local helper of the same name.
      // `@/lib/ui-tokens` is in here because the button geometry had to live there — see
      // `buttonClass` above. `components/ui.tsx` itself is excluded: `Button` is BUILT from
      // `buttonClass`, and a primitive using its own token is not a surface adopting it.
      const re = /import \{([^}]*)\} from "(?:\.\/ui|@\/components\/ui|@\/lib\/ui-tokens)"/g;
      counted[name] = components.filter((f) => {
        if (f.path === "components/ui.tsx") return false;
        return [...f.text.matchAll(re)].some((m) =>
          m[1].split(",").some((n) => n.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0] === name),
        );
      }).length;
    }
    expect(counted, "adoption per primitive (see PRIMITIVE_ADOPTERS)").toEqual(PRIMITIVE_ADOPTERS);
  });

  it("uses no type size that is off the six-size scale", () => {
    // `DESIGN.md` §3 names exactly six. `text-lg` is not one of them, and it had reached fourteen uses
    // — a seventh size sitting between `text-base` and `text-xl`, which is how a heading rhythm stops
    // being a rhythm. At zero this is a guard, not a ratchet: it should never go up again.
    const { total, byFile } = countMatches(ui, /\btext-lg\b/g);
    expect(total, `off-scale type sizes, by file:\n${byFile.join("\n")}`).toBe(BUDGET.offScaleType);
  });

  it("keeps the primitives themselves inside the system", () => {
    // The file everything else is converted ONTO cannot itself be off-system, and it was: three
    // `rounded-lg` in `Segmented`, `ClosePanel` and `NumberField`. A primitive that breaks the rule
    // teaches the rule is optional.
    const uiFile = readFileSync(join(ROOT, "components/ui.tsx"), "utf8");
    expect(uiFile.match(/rounded-lg/g) ?? [], "components/ui.tsx must not use rounded-lg").toHaveLength(0);
  });
});
