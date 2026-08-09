import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** **`DESIGN.md` read as a file, by the gate, rather than by whoever remembers to.**
 *
 *  `DESIGN.md` is binding — `MAINTAINING.md` calls it the authority on tokens, scale, component
 *  vocabulary and states, and says a surface that invents its own treatment is not done. It was also
 *  the only major document in the repo with nothing asserting anything about it. `lib/design-system.
 *  test.ts` is the executable copy of §9's grep block, hand-transcribed and kept in step by hand; it
 *  never opens `DESIGN.md`, so the document and its executable form could disagree indefinitely and
 *  did.
 *
 *  Measured 2026-08-09, before any of this existed: §5's Controls heading read **"three button
 *  weights, and only three"** above four bullets, over the four keys `lib/ui-tokens.ts` ships. §1's
 *  rule — *"inventing a fourth button weight is a change to this file"* — was broken by the file, in
 *  the sentence that governs it. And `Select` and `ClosePanel` shipped, were ratcheted by §9, and
 *  were named nowhere in the vocabulary §5 exists to be.
 *
 *  **The vocabulary gets one mechanical definition here, which is the durable half.** `DESIGN.md` §5
 *  is the declaration and `components/ui.tsx` is the module — so every component that module exports
 *  must be named by §5, and every name §5 declares must resolve to a real exported component
 *  somewhere in `components/`. Two directions, asserted separately, because they fail for opposite
 *  reasons: the first is a primitive that shipped without being declared, the second is a
 *  declaration with nothing behind it. Neither direction is a hand-maintained list — a third list
 *  would drift exactly as the first two did.
 */

const ROOT = process.cwd();
const DESIGN = readFileSync(join(ROOT, "DESIGN.md"), "utf-8");

/** The lines of one top-level section, `## <n>. …` up to the next `## `. */
function section(n: number): string {
  const lines = DESIGN.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## ${n}.`));
  if (start < 0) throw new Error(`DESIGN.md has no section ${n}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return rest.slice(0, end < 0 ? rest.length : end).join("\n");
}

/** Every name §5 declares as a vocabulary entry: the bold-code lead of a bullet. Deliberately not a
 *  free-text search — a primitive MENTIONED in a paragraph is not a primitive DECLARED, and §5 is
 *  full of the former. */
function declaredNames(vocabulary: string): string[] {
  return [...vocabulary.matchAll(/^- \*\*`([A-Za-z][A-Za-z0-9]*)`\*\*/gm)].map((m) => m[1]);
}

/** The `Button variant="x"` bullets, which are one primitive declared four times. */
function declaredVariants(vocabulary: string): string[] {
  return [...vocabulary.matchAll(/^- \*\*`Button variant="([a-z]+)"`\*\*/gm)].map((m) => m[1]);
}

/** Components a module exports — `export function X`, `export const X`, and `export { X } from`.
 *  Hooks are not vocabulary: §5 declares what a surface is BUILT from, and `useReturnFocus` is a
 *  behaviour two primitives share. The `use` prefix is React's own mechanical marker for that, so it
 *  is the rule rather than a name on a list. */
function exportedComponents(file: string): string[] {
  const src = readFileSync(join(ROOT, file), "utf-8");
  const out = [
    ...[...src.matchAll(/^export (?:default )?(?:function|const) ([A-Z][A-Za-z0-9]*)/gm)].map((m) => m[1]),
    ...[...src.matchAll(/^export \{ ([A-Z][A-Za-z0-9]*) \} from/gm)].map((m) => m[1]),
  ];
  return [...new Set(out)].filter((n) => !n.startsWith("use"));
}

/** Every component exported anywhere under `components/`, for the resolve direction. */
function allComponentExports(): Set<string> {
  const out = new Set<string>();
  for (const f of readdirSync(join(ROOT, "components"))) {
    if (!f.endsWith(".tsx") && !f.endsWith(".ts")) continue;
    for (const n of exportedComponents(join("components", f))) out.add(n);
  }
  return out;
}

const NUMBER_WORD: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

describe("DESIGN.md is read by the gate, not just by whoever remembers to", () => {
  const vocabulary = section(5);

  it("states the number of button weights it declares, and ships exactly those", async () => {
    // Three ways to be wrong, and all three have to fail: the heading's number, the bullets under it,
    // and the keys the code ships. Adding a variant without amending the file fails here; amending
    // the file's number without the bullets fails here; both without the code fails here.
    const heading = /^### Controls — ([a-z]+) button weights, and only ([a-z]+)$/m.exec(vocabulary);
    expect(heading, "§5's Controls heading no longer states its own count").toBeTruthy();
    const stated = NUMBER_WORD[heading![1]];
    expect(stated, `"${heading![1]}" is not a number word this check knows`).toBeGreaterThan(0);
    expect(NUMBER_WORD[heading![2]], "the heading states two different numbers").toBe(stated);

    const declared = declaredVariants(vocabulary);
    expect(declared.length, "the heading's count and its bullets disagree").toBe(stated);

    const { BUTTON_VARIANT_NAMES } = await import("./ui-tokens");
    expect([...declared].sort(), "§5's button weights and the shipped variants disagree").toEqual(
      [...BUTTON_VARIANT_NAMES].sort(),
    );
  });

  it("declares every primitive `components/ui.tsx` exports", () => {
    // The direction that catches a primitive shipping without being declared, which is how `Select`
    // and `ClosePanel` came to be ratcheted by §9 while the vocabulary had never heard of them.
    // `Button` is declared by its four variant bullets rather than by its own, which is right: the
    // weight is the vocabulary and a bare `Button` is not a thing a surface may use.
    const declared = new Set([...declaredNames(vocabulary), "Button"]);
    const shipped = exportedComponents("components/ui.tsx");
    expect(shipped.length, "components/ui.tsx exported nothing — this asserted nothing").toBeGreaterThan(10);
    expect(shipped.filter((n) => !declared.has(n)), "primitives that ship but DESIGN.md §5 does not declare").toEqual([]);
  });

  it("declares nothing that does not exist", () => {
    // The opposite failure, and the one a documentation-only edit produces: a vocabulary entry with
    // no component behind it, which a session then hunts for and hand-rolls a second time.
    const exports = allComponentExports();
    const declared = declaredNames(vocabulary);
    expect(declared.length, "§5 declared nothing — this asserted nothing").toBeGreaterThan(10);
    expect(declared.filter((n) => !exports.has(n)), "names DESIGN.md §5 declares with no component behind them").toEqual([]);
  });

  it("keeps §1's rule counting the same weights §5 declares", () => {
    // §1 states the rule ("inventing a Nth button weight is a change to this file") and §5 states the
    // count. They are two sentences about one number, in two sections, and they were already one
    // apart — §1 said a FOURTH would be new while §5's four bullets had shipped.
    const ORDINAL: Record<string, number> = {
      second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8,
    };
    const rule = /Inventing a ([a-z]+) button weight/.exec(DESIGN);
    expect(rule, "DESIGN.md no longer states the rule this check reads").toBeTruthy();
    const stated = ORDINAL[rule![1]];
    expect(stated, `"${rule![1]}" is not an ordinal this check knows`).toBeGreaterThan(0);
    // The rule names the weight that would be NEW, so it is one past what §5 declares.
    expect(stated - 1, "the rule and §5's count are about different numbers of button weights").toBe(
      declaredVariants(vocabulary).length,
    );
  });
});
