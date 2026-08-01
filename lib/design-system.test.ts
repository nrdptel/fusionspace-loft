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

/** `keep` narrows a broad pattern to the matches that are actually violations — used by the type-size
 *  check, which matches every `text-*` and then subtracts the six sizes the scale allows. Listing what
 *  is PERMITTED and flagging the rest is what stops the check going blind again: a size nobody has
 *  thought of yet fails by default, where an allow-list of known-bad tokens silently passes it. */
function countMatches(
  files: { path: string; text: string }[],
  re: RegExp,
  keep?: (match: string) => boolean,
): { total: number; byFile: string[] } {
  const byFile: string[] = [];
  let total = 0;
  for (const f of files) {
    const all = f.text.match(re) ?? [];
    const hits = keep ? all.filter(keep) : all;
    if (hits.length > 0) {
      total += hits.length;
      byFile.push(`${f.path}: ${hits.length} (${[...new Set(hits)].sort().join(", ")})`);
    }
  }
  return { total, byFile: byFile.sort() };
}

/** The counts as they stand. Each is a ratchet toward the target named beside it; lower it in the same
 *  commit as the conversion that earns it, and never raise one. */
const BUDGET = {
  /** `rounded-lg` is not in the system at all — containers are `xl`, controls are `md`. **At 0**, so
   *  this is a guard rather than a ratchet from here on: the next one to appear is a hand-rolled
   *  treatment, not a leftover. It reached 0 on 2026-07-31 from 49 at the start of P1.
   *
   *  Note this reads `app/globals.css` too, so the name cannot be written even in a comment there —
   *  the grep cannot tell a mention from a use. */
  roundedLg: 0,
  /** Distinct card treatments. One of these is now `<Card>`'s own string, which is the target state;
   *  the other two are a floating toast (`shadow-lg`) and the import drop zone (`border-2 border-dashed`,
   *  an interactive target rather than a container). Both want their own named primitive rather than
   *  being folded into `Card`, so the honest floor here is 3 and not 1 — recorded in `ROADMAP.md`. */
  cardTreatments: 3,
  /** Spacing values off the `1 2 3 4 6 8 12` scale. Target 0. */
  offScaleSpacing: 0,
  /** Components importing the shared primitives. Target: most of the 23. This one only goes UP. */
  uiAdopters: 16,
  /** Component files where caption size OUTNUMBERS the body default. **At the target**, so this is a
   *  guard rather than a ratchet from here on: a file that inverts again is a decision-grade value
   *  that has been put back at caption size. */
  invertedTypeFiles: 0,
  /** Sizes that are not on `DESIGN.md` §3's six-size scale at all. Target 0, and it is AT 0 — this one
   *  is a guard rather than a ratchet. `text-lg` sat between `text-base` and `text-xl`, invented once
   *  and copied fourteen times: eleven panel headings and three prominent values. */
  offScaleType: 0,
  /** `<button>` elements that hand-roll their own geometry instead of taking it from `buttonClass`.
   *
   *  **This is the count P1's *done when* is about, and until 2026-08-01 nothing asserted it.** The
   *  per-primitive adoption count below is necessary and still not sufficient: a file can import
   *  `Button`, satisfy that check, and go on hand-rolling five more buttons beside it — which is
   *  exactly what `LoftApp` and `ImportPanel` were doing while both counted as adopters.
   *
   *  **The first version of this check excluded two whole FILES and that was wrong**, which an
   *  outside reading of it caught the same day. `components/ui.tsx` and `components/DataTable.tsx`
   *  were skipped on the grounds that "a primitive's OWN `<button>` is the thing every other surface
   *  is being converted onto" — but only ONE of the four `<button>` elements in that pair is that
   *  button. The other three hand-roll the geometry rather than calling it: `Segmented` re-types
   *  `buttonClass`'s base line **minus the focus-visible ring entirely**, `Tabs` does the same, and
   *  `DataTable`'s sort header carries its own string. A target of 0 under file exclusions is a state
   *  in which three hand-rolled buttons still ship, permanently invisible — inside the two files most
   *  likely to carry the drift. Worse, it made the ratchet gameable in the exact direction this
   *  milestone is heading: routing `MotorSweep` and `GeometryInspector` through `DataTable` would
   *  take the count 3 → 1 with zero buttons converted onto `Button`, because three identical
   *  hand-rolled sort headers would collapse into one sitting in a skipped file.
   *
   *  So the exclusion is now per-ELEMENT and behavioural: a `<button>` is exempt exactly when its own
   *  opening tag takes its class from `buttonClass`. `Button` is; nothing else is. The count went
   *  3 → 6 the moment that landed, and the extra three are real: `Segmented`, `Tabs` and
   *  `DataTable`'s sort header. That is not a raised budget, it is the same budget on a metric that
   *  can see what it claims to.
   *
   *  Comments are stripped before counting rather than excluded by a lookbehind. The first version
   *  matched `/(?<!`)<button[\s>]/` so that `app/not-found.tsx`'s prose — which explains why a
   *  `<button>` that navigates is a keyboard defect — did not read as a breach. That made an
   *  exact-count assertion depend on where a backtick sits inside an English sentence: fence the
   *  clause instead of the tag and the suite fails on a comment-only edit, pointing a session at a
   *  file with no button in it.
   *
   *  Not in `DESIGN.md` §9's shell block: that file is shared verbatim with the sibling app, and
   *  `add_repo` for it was refused by the harness again this run (the fourth). Adding the grep here
   *  alone would put the two copies out of step, which §9 forbids; it is filed in `BACKLOG.md` with
   *  the two other wordings now owed to both. */
  /** **The honest floor is 3, not 0, and saying so beats carrying an unreachable target** — the same
   *  call `cardTreatments` already makes. The three left are `Segmented`, `Tabs` and `DataTable`'s
   *  sort header, and none is a `Button` in disguise: §5 lists all three as their own primitives with
   *  their own geometry. A segmented option is a raised pill inside a track, a tab is an underline
   *  with a bottom border, a sort header is a header cell that happens to be pressable — forcing any
   *  of them through `buttonClass`'s `px-3 py-1.5 rounded-md` would make it LOOK like a button, which
   *  is the opposite of what the design system asks for.
   *
   *  What they do share with `Button` is the focus treatment and the touch minimum, and both already
   *  reach them: `app/globals.css` carries the app's one focus rule (`button:focus-visible` among
   *  others) and `TOUCH_TARGET` is on each. Verified by tabbing the whole page against the built
   *  export — every control kind renders the same `2px solid rgb(99,102,241)`.
   *
   *  So this is a GUARD at 3 rather than a ratchet toward 0. A fourth means a surface hand-rolled a
   *  control that `Button` covers. */
  handRolledButtons: 3,
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
  Button: 13,
  /** The button geometry as a class, for the two things that must look like a button and cannot BE
   *  one — a `next/link` and an external `<a>`. It is exported from `lib/ui-tokens.ts` rather than
   *  from `components/ui.tsx` because the site header is a SERVER component and cannot call into a
   *  `"use client"` module; the regex below reads both modules for that reason. Counted separately
   *  because a rising number here is not the same win as a rising `Button`: it means a navigation
   *  control stopped hand-copying the geometry, not that a `<button>` was converted. */
  buttonClass: 2,
  /** `DESIGN.md` §5's table primitive — "every table is this one".
   *
   *  It lives in `components/DataTable.tsx` rather than in `components/ui.tsx`, and that is a
   *  technical constraint rather than a filing preference, the same shape as `buttonClass` above:
   *  `DataTable` needs `DownloadCsv`/`CopyTable` for its export controls, and `components/DownloadCsv.tsx`
   *  imports `Button` from `./ui`. Putting the table in `ui.tsx` makes that a cycle
   *  (`ui → DownloadCsv → ui`). §5 says the vocabulary lives in `ui.tsx`; the wording wants a sentence
   *  admitting the two exceptions, and that is a change to a file shared verbatim with the sibling
   *  app, so it is FILED rather than made here. The regex below reads this module for that reason. */
  DataTable: 6,
  Section: 0,
  Segmented: 2,
  /** Zero, and that is the milestone rather than a regression.
   *
   *  `Tabs` had exactly one adopter — the workspace switcher — and `DESIGN.md` §5 says outright what
   *  that was: "Tabs switch views over one subject *within* a route. Not for navigation between
   *  jobs; that is a route (§7)." Flight, Design and Analyze are three JOBS, so on 2026-08-02 they
   *  became three routes and the switcher became `components/WorkspaceNav.tsx`, a `<nav>` of links.
   *  The primitive stays exported for the case it is actually for; nothing renders it today. */
  Tabs: 0,
  /** The tab bar's own treatment, hoisted to a token when two components came to render it — the
   *  tablist and the workspace spine. A second copy of that class string is exactly how the twelve
   *  measured card variants happened, so it is counted like any other adoption. */
  navItemClass: 1,
  NumberField: 2,
  ClosePanel: 3,
  Chip: 0,
  Disclosure: 1,
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
      // `DataTable` is a DEFAULT export from its own module, so it matches neither the named-import
      // regex nor the `./ui` path. Counted on its own for the reason recorded beside it above.
      if (name === "DataTable") {
        counted[name] = components.filter(
          (f) => f.path !== "components/DataTable.tsx" && /from "\.\/DataTable"/.test(f.text),
        ).length;
        continue;
      }
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
    // `DESIGN.md` §3 names exactly six: `text-3xl`, `text-xl`, `text-base`, `text-sm`, `text-xs`, and
    // `text-[11px]` for axis ticks and diagram annotations. Anything else is a seventh size.
    //
    // **This check used to grep `text-lg` ALONE, and that is why it is written the way it is now.**
    // `text-lg` was taken to zero on 2026-07-31 and the assertion left behind matched only that one
    // token — so it read zero, and passed, while `text-[10px]` stood at 22 uses, `text-2xl` at 4 and
    // `text-[9px]` at 3. Twenty-nine live uses of a seventh, eighth and ninth size, under an assertion
    // whose name says none exist. §9's own words are that a compliance command which cannot fail is
    // worse than none, because a session runs it, sees the target, and moves on. This one could not
    // fail for as long as it had existed.
    //
    // It now matches any Tailwind text size and subtracts the six that are allowed, so a size nobody
    // has thought of yet is caught by default rather than needing to be added here.
    // SIZE tokens only — Tailwind's named steps and an arbitrary length. A bare `text-[^\]]+` also
    // matches every colour and alignment utility in the app (`text-zinc-500`, `text-left`), which is
    // 655 hits and no signal at all; that was this check's first draft.
    const ALLOWED = new Set(["text-3xl", "text-xl", "text-base", "text-sm", "text-xs", "text-[11px]"]);
    // NOTE the asymmetry, which is not stylistic: the arbitrary-value branch must NOT end in `\b`.
    // A word boundary after `]` requires a word character on one side of it, and `]` is not one — so
    // `/…\[[\d.]+px\]\b/` never matches `text-[9px]` at all. The first version of this check had that
    // trailing `\b` and its negative control PASSED: a reintroduced `text-[9px]` went unseen. That is
    // the same "compliance command that cannot fail" this whole assertion exists to end, reintroduced
    // inside the fix for it, and only the control caught it.
    const SIZES = /\btext-(?:\[[\d.]+(?:px|rem|em)\]|(?:xs|sm|base|lg|[2-9]?xl)\b)/g;
    const { total, byFile } = countMatches(ui, SIZES, (m) => !ALLOWED.has(m));
    expect(total, `off-scale type sizes, by file:\n${byFile.join("\n")}`).toBe(BUDGET.offScaleType);
  });

  it(`hand-rolls exactly ${BUDGET.handRolledButtons} <button> elements — the three primitives, and nothing else`, () => {
    // Comments first: several of these files explain in prose why a `<button>` that navigates is a
    // keyboard and screen-reader defect, and prose about the rule is not a breach of it.
    const stripComments = (t: string) =>
      t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    // A `<button>` is exempt exactly when its OWN opening tag takes its class from `buttonClass` —
    // that is what "on the primitive" means, and it is the only thing that should be uncountable.
    // Matching the opening tag rather than the file is what stops a hand-rolled treatment hiding by
    // moving into a primitive's module.
    const OPENING_TAG = /<button\b[^>]*>/g;
    const files = uiSources(["components", "app"], [".tsx"]);
    const byFile: string[] = [];
    let total = 0;
    for (const f of files) {
      const hits = (stripComments(f.text).match(OPENING_TAG) ?? []).filter(
        (tag) => !tag.includes("buttonClass("),
      );
      if (hits.length > 0) {
        total += hits.length;
        byFile.push(`${f.path}: ${hits.length}`);
      }
    }
    expect(total, `hand-rolled <button>, by file:\n${byFile.sort().join("\n")}`).toBe(
      BUDGET.handRolledButtons,
    );
  });

  it("declares no font size in the stylesheet that is off the six-size scale", () => {
    // **§9's checks match class NAMES, and a stylesheet declares VALUES** — so everything in
    // `app/globals.css` has been invisible to them for as long as they have existed. That is not
    // theoretical: `.prose-loft` set body text at `0.925rem`, `h2` at `1.2rem` and table text at
    // `0.85rem` — a seventh, eighth and ninth size, on all six docs routes — while `offScaleType`
    // read 0 and passed. It is the same blind spot that let `.eqn` render an 8 px radius at an
    // off-system-radius count of zero.
    //
    // RELATIVE sizes are allowed through and that is deliberate rather than a loophole: `em` means
    // "whatever this sits in", which is a typographic relationship rather than a size on the scale,
    // and inline code and the equation block both want it. Measured against the built export, both
    // land on 12 px. An absolute `rem`/`px` declaration is a size, and has to be one of §3's six.
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
    // §3's six, in rem: text-3xl 1.875, text-xl 1.25, text-base 1, text-sm 0.875, text-xs 0.75,
    // and the 11 px annotation size. `inherit`/`smaller` and the like are not declarations of a size.
    const ALLOWED_REM = new Set(["1.875", "1.25", "1", "0.875", "0.75", "0.6875"]);
    const off: string[] = [];
    for (const m of css.matchAll(/font-size:\s*([^;]+);/g)) {
      const raw = m[1].trim();
      if (/\bem\b/.test(raw) && !/\brem\b/.test(raw)) continue; // relative — see above
      const rem = /^([\d.]+)rem$/.exec(raw);
      const px = /^([\d.]+)px$/.exec(raw);
      const asRem = rem ? rem[1] : px ? String(Number(px[1]) / 16) : null;
      if (asRem === null) continue; // a keyword or a var() — not a size declaration
      if (!ALLOWED_REM.has(asRem.replace(/0+$/, "").replace(/\.$/, ""))) off.push(raw);
    }
    expect(off, "font sizes declared in app/globals.css that are not on DESIGN.md §3's scale").toEqual([]);
  });

  it("keeps the primitives themselves inside the system", () => {
    // The file everything else is converted ONTO cannot itself be off-system, and it was: three
    // `rounded-lg` in `Segmented`, `ClosePanel` and `NumberField`. A primitive that breaks the rule
    // teaches the rule is optional.
    const uiFile = readFileSync(join(ROOT, "components/ui.tsx"), "utf8");
    expect(uiFile.match(/rounded-lg/g) ?? [], "components/ui.tsx must not use rounded-lg").toHaveLength(0);
  });
});
