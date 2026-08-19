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

/** Source with its comments removed — `/* … *\/` anywhere, and `//` only where it starts a line, so
 *  a `https://` inside a string survives.
 *
 *  **Every class-token check below should read this rather than the raw file, and until 2026-08-09
 *  none of them did.** `roundedLg`'s own docblock recorded the consequence as a rule to obey — *"the
 *  name cannot be written even in a comment there, the grep cannot tell a mention from a use"* — which
 *  put the burden on every future author of a comment, forever, and was duly forgotten by the very
 *  commit that widened the radius check: naming the drifted values in the new check's own explanation
 *  made the tree read as 28 violations. A tool that cannot be described in prose beside itself is the
 *  wrong tool. This is the same class error §9 keeps recording — an instrument reading something that
 *  is not the thing it is measuring — and the fix belongs in the instrument.
 *
 *  It is deliberately NOT applied to the card-treatment or adoption checks: those match a whole class
 *  string or an import, neither of which appears in prose. */
function stripComments(text: string): string {
  return (
    text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // A `//` comment anywhere on the line, not just at its start — a TRAILING one survived the
      // first version of this, which is the same failure it was written to fix: quoting a class name
      // in a note beside the code turned the gate red on a comment-only edit. The preceding
      // character is kept and must not be a colon, which is what leaves `https://` alone.
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
  );
}

/** Source with every string and template literal replaced by its own quote character repeated to its
 *  own length — same offsets, no brace or paren inside a literal.
 *
 *  **Both source walks below read this, and an earlier draft had only one of them reading it.** A
 *  brace or paren inside a literal unbalances a counting scan, and the two failure modes are not
 *  symmetrical: `function Bar(label = "a(b") {` makes the paren walk run to end-of-file, so the
 *  component drops out of the scan ENTIRELY and is silently exempt, while `const s = "}"` clips a
 *  body before its `return null`. Both are the instrument reading green over the thing it exists to
 *  find. The tree holds no such literal today — measured 2026-08-12, all 118 function bodies balance
 *  either way — so this is a trap closed rather than a failure fixed, and the reason to close it is
 *  that an inconsistency between two helpers is reintroduced by whoever edits only one. */
function neutraliseLiterals(text: string): string {
  return text.replace(/"[^"\n]*"|'[^'\n]*'|`(?:[^`\\]|\\.)*`/g, (lit) => lit[0].repeat(lit.length));
}

/** A source in two length-identical copies: `raw` keeps string contents and `scan` does not, and both
 *  have their comments blanked at the same offsets.
 *
 *  Two things make this its own helper rather than a call to `stripComments`.
 *
 *  **`stripComments` cuts `//` to end of line inside string literals, and this check is the first
 *  reader that can be silently harmed by it.** A component holding `const href = "//cdn/x";` on the
 *  same line as `if (rows.length === 0) return null;` loses the guard before the scan sees it — the
 *  surface is then counted as inspected and clean, which is the worst of the three ways to be wrong.
 *  Literals are neutralised BEFORE comments are found here, so `//` inside one is not a comment.
 *
 *  **And every offset has to survive.** `stripComments` deletes, so a line number taken from its
 *  output points at the wrong line and the two copies could not be sliced with one span. Everything
 *  here blanks in place: same length, same lines, same offsets in both copies. */
function scannableSource(text: string): { raw: string; scan: string } {
  const neutral = neutraliseLiterals(text);
  const blanks: [number, number][] = [];
  for (const m of neutral.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g)) blanks.push([m.index, m.index + m[0].length]);
  const blank = (s: string) => {
    const chars = [...s];
    for (const [a, b] of blanks) for (let i = a; i < b; i++) if (chars[i] !== "\n") chars[i] = " ";
    return chars.join("");
  };
  return { raw: blank(text), scan: blank(neutral) };
}

/** Every top-level `function Name(…) { … }` in a source, with its body — the unit the empty-state
 *  check below reasons about.
 *
 *  **File granularity is the wrong unit for that check and component granularity is the right one.**
 *  `ResultsView.tsx` renders four data surfaces and eight conditional hints; asking "does this FILE
 *  contain `return null`" answers yes for both kinds and can only ever be noise. Asking it of a
 *  component is answerable.
 *
 *  **Finding the body brace takes two skips, and the first draft did only one of them.** The obvious
 *  `indexOf("{")` lands on the DESTRUCTURING pattern of `function X({ rocket }: { … })`, which is
 *  every component in this tree — that draft matched 0 components in 21 files and reported a clean
 *  sweep, the "compliance command that cannot fail" §9 keeps recording. Walking the parameter list to
 *  its closing paren fixes that and leaves the identical failure one token to the right: a RETURN
 *  TYPE may be braced too, so `function f(…): { v: number } {` hands back the type annotation as the
 *  body. Two live cases when this was measured — `FlightViz`'s `placeLabels` (an 18-character "body"
 *  against a real 667) and `ValidationPanel`'s `convert` (24 against 401) — neither of them a data
 *  surface, so nothing was mis-reported; a component with a braced return type would have been
 *  exempt without saying so.
 *
 *  Arrow-function components are deliberately out of scope: this tree declares its components with
 *  `function`, and a pattern for both would be looser without covering anything that exists. If one
 *  ever lands, the arrow-component assertion below goes red and says so. */
function topLevelFunctions(text: string, raw: string): { name: string; line: number; body: string; scan: string }[] {
  const out: { name: string; line: number; body: string; scan: string }[] = [];
  /** The `}` matching the `{` at `from`, or -1. */
  const matchBrace = (from: number): number => {
    let depth = 0;
    for (let i = from; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0) return i;
    }
    return -1;
  };
  // The generic clause matches a BALANCED angle group, not `<[^>]*>`: that stops at the first `>`, so
  // `function Baz<T extends Record<string, number>>(…)` failed the following `\(` and dropped out of
  // the scan without a word. `DataTable<R>` and `Segmented<T extends string>` survive it only because
  // their type parameters happen to hold no angle brackets.
  const re = /^(?:export\s+)?(?:default\s+)?function\s+([A-Za-z0-9_]+)\s*(?:<(?:[^<>]|<[^<>]*>)*>)?\s*\(/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let parens = 1;
    let j = re.lastIndex;
    for (; j < text.length && parens > 0; j++) {
      if (text[j] === "(") parens++;
      else if (text[j] === ")") parens--;
    }
    // Then the return type, if there is one. What PRECEDES a brace says whether it opens a type or
    // the body: a type's brace follows a token the type is still being built from (`:` `|` `&` `,`
    // `<` `(` `[` `=>`), the body's follows the end of one (`)` when there is no annotation, an
    // identifier, `}`, `>`, `]`).
    //
    // Looking at what FOLLOWS instead is the rule this replaced, and it was wrong on the second case
    // it met: `: { x: 1 } | React.ReactElement | null {` has the braced type followed by `|`, not by
    // the body, so the annotation was handed back as the body again. Its control failed while the
    // other four passed, which is the argument for writing the control before believing the fix.
    // `=>` is the one two-character token here — `>` alone ends a generic (`Array<{ a: 1 }>`) and
    // opens nothing.
    let open = -1;
    for (let guard = 0; guard < 16; guard++) {
      open = text.indexOf("{", j);
      if (open < 0) break;
      let p = open - 1;
      while (p >= 0 && /\s/.test(text[p])) p--;
      const prev = text[p] ?? "";
      const isType = ":|&,<([=".includes(prev) || (prev === ">" && text[p - 1] === "=");
      if (!isType) break;
      const end = matchBrace(open);
      if (end < 0) break;
      j = end + 1;
    }
    if (open < 0) continue;
    const close = matchBrace(open);
    const end = close < 0 ? text.length : close + 1;
    // Neutralisation is LENGTH-PRESERVING, so the span found in the scan copy is the same span in
    // the raw one. That matters: the content tests below must read the raw body, because
    // `as="section"` is a string literal and the scan copy has replaced it with quote characters —
    // the one container in §5's list that neutralisation would otherwise make invisible.
    out.push({ name: m[1], line: text.slice(0, m.index).split("\n").length, body: raw.slice(open, end), scan: text.slice(open, end) });
  }
  return out;
}

/** Does the `{` at `at` open a FUNCTION body rather than a plain block?
 *
 *  Read BACKWARDS from the brace, matching the parameter list as a paren group, because the forward
 *  question ("what does this look like?") has no bounded answer. The lookback-regex version this
 *  replaces asked it with a 400-character window and `\([^()]*\)`, and both limits were reachable in
 *  ordinary code: a nested `function pick(cb: (x: number) => string) {` has nested parens, and this
 *  tree's destructured signatures routinely run past 400 characters. Each miss made a nested helper
 *  read as an `if` block, so its `return null` was attributed to the component around it — a red gate
 *  naming a defect that is not there, on a check whose neighbours record that firing wrongly is how a
 *  check gets disabled.
 *
 *  The rule after the walk is one line: the token before the parameter list decides it. A reserved
 *  block keyword (`if`, `for`, `while`, `switch`, `catch`, `for await`) means a block, and a
 *  `return null` inside a block IS at the component's top level — that is the shape of four of the
 *  five vanishes this check found. Anything else — `function`, a method shorthand, a call being
 *  invoked — is a function. `=>` needs no paren walk at all. */
function opensAFunction(s: string, at: number): boolean {
  const BLOCK_KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "with", "await"]);
  let i = at - 1;
  const skipBack = () => {
    while (i >= 0 && /\s/.test(s[i])) i--;
  };
  skipBack();
  if (s[i] === ">" && s[i - 1] === "=") return true;
  // A return-type annotation can sit between the parameter list and the body. Step back over the
  // type's own tokens — including a braced or generic one — until a `)` or something that is not
  // type-shaped.
  for (let guard = 0; guard < 16 && i >= 0; guard++) {
    if (s[i] === ")") break;
    if (s[i] === "}" || s[i] === ">" || s[i] === "]") {
      const openers: Record<string, string> = { "}": "{", ">": "<", "]": "[" };
      const close = s[i];
      const opener = openers[close];
      let depth = 0;
      for (; i >= 0; i--) {
        if (s[i] === close) depth++;
        else if (s[i] === opener && --depth === 0) break;
      }
      i--;
      skipBack();
      continue;
    }
    if (/[A-Za-z0-9_$.|&:]/.test(s[i])) {
      i--;
      skipBack();
      continue;
    }
    return false;
  }
  if (s[i] !== ")") return false;
  let depth = 0;
  for (; i >= 0; i--) {
    if (s[i] === ")") depth++;
    else if (s[i] === "(" && --depth === 0) break;
  }
  i--;
  skipBack();
  // Optional generic parameter list, e.g. `function Baz<T extends Record<string, number>>(…)`.
  if (s[i] === ">") {
    let d = 0;
    for (; i >= 0; i--) {
      if (s[i] === ">") d++;
      else if (s[i] === "<" && --d === 0) break;
    }
    i--;
    skipBack();
  }
  let end = i + 1;
  while (i >= 0 && /[A-Za-z0-9_$]/.test(s[i])) i--;
  const word = s.slice(i + 1, end);
  if (BLOCK_KEYWORDS.has(word)) return false;
  if (word === "") return false;
  // `for await (…)` reads back as the identifier `await`, already excluded above; `else if (…)` reads
  // back as `if`. A bare `(…) {` with no identifier is not something this tree writes.
  skipBack();
  end = i + 1;
  while (i >= 0 && /[A-Za-z0-9_$]/.test(s[i])) i--;
  return !BLOCK_KEYWORDS.has(s.slice(i + 1, end));
}

/** Does this function body contain a `return null` at ITS OWN top level — outside every callback,
 *  IIFE and nested declaration inside it?
 *
 *  Without the distinction, `RocketDiagram`'s `return null` inside a `.map(…)` callback — one part
 *  that draws nothing — reads identically to a `return null` that vanishes the whole drawing. They
 *  are not the same defect and only one of them is one.
 *
 *  **A single scan, deliberately, because the obvious find-and-blank loop does not terminate.** The
 *  first version replaced each nested body with a marker and re-scanned: the marker it wrote was
 *  still preceded by the `=>` that had matched, so the pattern matched the replacement, and
 *  `DataTable` blanked the same two characters five thousand times without converging. It was capped
 *  at 40 passes, which turned an infinite loop into a SILENT one — the cap was reached, the deeper
 *  callbacks were never blanked, and the check reported their `return null`s as top-level. A bound
 *  that hides non-termination instead of exposing it is worse than no bound.
 *
 *  String and template literals are neutralised first, so a brace inside one cannot unbalance the
 *  count. Each is replaced by its own quote character repeated to its own length, so the scan sees
 *  the same offsets it would have.
 *
 *  **Known limit, stated rather than guarded against:** it reads the STATEMENT form, so
 *  `return cond ? null : <X/>` and `return cond && <X/>` are invisible to it. Measured across
 *  `components/` on 2026-08-12: seven `? null :` and not one of them is a component's return — every
 *  one resolves a data value (a sort key, a station, a wind speed). A guard that fires on zero real
 *  cases is the thing `MAINTAINING.md` calls worse than nothing; when the first real one lands, this
 *  is the note that says where to widen. */
function returnsNullAtTopLevel(s: string): boolean {
  /** Nested-function depth. The component's own body is depth 0 — its opening brace is preceded by
   *  nothing, so it is not counted as a nested one. */
  let fnDepth = 0;
  const kinds: boolean[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "{") {
      const isFn = opensAFunction(s, i);
      kinds.push(isFn);
      if (isFn) fnDepth++;
    } else if (ch === "}") {
      if (kinds.pop()) fnDepth--;
    } else if (fnDepth === 0 && ch === "r" && s.startsWith("return null", i) && !/[A-Za-z0-9_$]/.test(s[i + 11] ?? "")) {
      // The trailing-character test is what `\breturn null\b` gave the version this replaced, and
      // dropping it was a straight precision regression: `return nullable;`, `return nullish(x)` and
      // `return nullSafe(rows)` all read as a vanish. On a hard `toEqual([])` gate that is a red
      // suite naming a defect that does not exist, which is how a check gets disabled.
      return true;
    }
  }
  return false;
}

/** Just the STRING LITERALS of a source — which is where a class token can actually be.
 *
 *  **A class-token pattern run over whole source text reads English prose as CSS.** Measured
 *  2026-08-09: a radius check matching every `rounded-*` token found 18 hits in JSX copy across five
 *  docs routes and three components, every one of them the English word in a sentence like "rounded
 *  to the nearest". `roundedLg` never hit this because it names a hyphenated literal no sentence
 *  contains — which is precisely the narrowness that made it blind.
 *
 *  The sibling's §9 solves this by reading `class="…"` attributes only. That is one step too narrow
 *  here: this app composes most of its class strings through `cx(…)` and template literals, so an
 *  attribute-only scan cannot see the primitives' own classes at all — the very files a design system
 *  most needs to check. Every string literal is the wider net that still excludes prose.
 *
 *  Template literals contribute their literal spans, with `${…}` treated as a break, since an
 *  interpolated value is not a token this can judge. */
function classText(text: string): string {
  const out: string[] = [];
  for (const m of text.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
    const body = m[1] ?? m[2] ?? m[3] ?? "";
    out.push(m[3] !== undefined ? body.replace(/\$\{[^}]*\}/g, " ") : body);
  }
  return out.join(" ");
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
  /** Radii that are not in the system at ALL — every `rounded-*` token, minus the three §2 sanctions:
   *  `md` for controls, `xl` for containers, `full` for pills.
   *
   *  **`roundedLg` above named a single literal, and this is the whole class it could not see.**
   *  Measured 2026-08-09 while reconciling this file's §9 with the sibling's: with `roundedLg` at 0
   *  and reading as compliant, the tree held **seven** off-system radii — four `rounded-sm`, one
   *  `rounded-[2px]` and two bare `rounded` — and five of the seven were ONE treatment, a 12x8 px
   *  legend swatch hand-rolled across four files at two different radii. That is the twelve card
   *  treatments in miniature, in the part of the tree the instrument was blind to. `Swatch` is the
   *  primitive it became.
   *
   *  **At 0, and it took a round to get there.** The first version of this budget was 1, sanctioning
   *  the small radius inside `Swatch` and asserting the ownership to hold it there. The exception was
   *  unnecessary: CSS scales a corner radius to what its edge can hold, so on a 12x8 px chip every
   *  radius at or above 4 px renders as exactly 4 px, and `rounded-md` — already sanctioned — is
   *  pixel-identical. A budget of 1 with owner machinery behind it, for zero pixels. */
  offSystemRadius: 0,
  /** Border colours that are not in the system at ALL — every `border-zinc-*` token, minus the four
   *  §2 sanctions: `zinc-200`/`zinc-800` for `hairline` and `zinc-300`/`zinc-700` for `control`.
   *
   *  **§2 says "Two, deliberately" and until 2026-08-11 nothing checked it.** Radius, spacing, type,
   *  `<select>`, chart and focus were all ratcheted; the one token that section calls the readability
   *  signal — *"the control border is one step darker so an interactive edge is distinguishable"* —
   *  had no instrument at all. Measured when one was finally pointed at it: **8 uses of 3 values the
   *  file does not sanction**, `border-zinc-100` x6, `border-zinc-400` x1 and `border-zinc-600` x1.
   *
   *  Six of the eight were one treatment and they are the reason this matters more than it sounds:
   *  every table body row in the app renders `border-zinc-100 dark:border-zinc-800` from
   *  `components/DataTable.tsx`, which pairs a THIRD light value against the hairline dark — so the
   *  same rule was a different weight in light mode than in dark, in the file that draws every table
   *  in the product. The other two were a you-are-here chip on a fourth pair entirely.
   *
   *  At 0, so this is a guard rather than a ratchet: the next one to appear is hand-rolled. */
  offSystemBorder: 0,
  /** Spacing written as an arbitrary value — `p-[13px]`, `gap-[18px]` — which §4 forbids outright and
   *  which `offScaleSpacing`'s named-step pattern cannot express at all.
   *
   *  At 1, and the one is `ServiceWorker`'s `pb-[calc(1rem+env(safe-area-inset-bottom))]`. That is not
   *  a spacing choice: it is `1rem` from the scale plus a DEVICE inset whose value only the browser
   *  knows, and writing it any other way means a toast under a phone's home indicator. Exempted by
   *  the expression naming `env(safe-area-inset-`, so an ordinary arbitrary value still fails. */
  arbitrarySpacing: 1,
  /** Distinct card treatments. **1 as of 2026-08-18, and the one is `<Card>`'s own string** — §9's
   *  stated target, reached rather than exempted.
   *
   *  **3 until 2026-08-17, and the floor recorded here was WRONG.** It read "both want their own
   *  named primitive rather than being folded into `Card`, so the honest floor here is 3 and not 1".
   *  §9 forbids a `shadow` prop on `Card` — a generic escape hatch — and does NOT forbid a named
   *  primitive that RENDERS a `Card`. `Toast` took the toast's string out on 2026-08-17 and
   *  `DropZone` took the drop zone's out on 2026-08-18, both by composing rather than copying.
   *
   *  **The drop zone's string carried `border-2`, and the width did not survive the move** —
   *  deliberately. §2 now declares one border width, because the override only ever beat `Card`'s
   *  own `border` by source order (`.border` at byte 16,788 of the built stylesheet, `.border-2` at
   *  16,910, equal specificity). Parameterising it would have put a second width in the system at
   *  one call site, which is the tell this count exists to remove. */
  cardTreatments: 1,
  /** Card treatments hand-rolled OUTSIDE the primitives file — the count P18 actually moves, and the
   *  one that says what is wrong. `cardTreatments` counts distinct strings wherever they live; a
   *  treatment written at a call site is the "a component that exists once and matches nothing else"
   *  tell, and it is what produced all twelve measured variants.
   *
   *  Scoped by PATH, not by basename: `grep --exclude=ui.tsx` would silently exempt a future
   *  `components/<dir>/ui.tsx`, which is the "wrong scope" shape §9 already records twice. **Target
   *  0, and AT 0 as of 2026-08-18**: 2 before run 18, 1 after `Toast`, 0 after `DropZone`.
   *
   *  A ratchet at its target is not a finished check — it is the one that now fails the moment the
   *  next surface writes a card at a call site, which is the whole point.
   *
   *  **It does NOT carry §2's border-width rule, and the first draft of this comment said it did.**
   *  The predicate needs `rounded-xl` and a border token in ONE literal; a `Card` caller handing a
   *  width through `className` writes only the width, because it never spells the radius. So the
   *  hazard §2 names would have passed this check, and the claim that it would not was written into
   *  a binding document. `containerBorderWidths` above is the check that actually reads it. */
  cardTreatmentsOutsidePrimitives: 0,
  /** Elevations outside §2's two sanctioned values (`shadow-lg` = `floating`, `shadow-sm` = the
   *  `Segmented` thumb). Target 0, and at 0 — but the check is the point rather than the number:
   *  §2's elevation table was written declaring ONE value while two shipped, and nothing in either
   *  repo's gate could say so, because an elevation is not a radius, a border colour, a spacing step
   *  or a type size. */
  /** Container border WIDTHS off §2's one hairline — any `border-<n>` at n >= 1, written anywhere
   *  under `components/` or `app/`, spinner rings excluded because a ring is not a container.
   *
   *  **This check exists because the sentence that replaced it was FALSE.** P18 increment 2 deleted
   *  the app's only second border width and §2 gained a paragraph declaring one — and the first draft
   *  of both this file and §9 claimed the two card counts already policed it: "the literal is matched
   *  on `rounded-xl` beside any `border` token, so a container written with a second width fails
   *  here". They do not. Both counts require `rounded-xl` in the SAME string literal, and the exact
   *  hazard §2 names — a `Card` handed a width through `className` — writes only the width at the
   *  call site, because a `Card` caller never spells the radius. The milestone's central decision was
   *  defended by a control that did not exist. Found by the pre-push review, by simulation.
   *
   *  `border-0` is not counted: it is a RESET, and `LoftApp` uses it seven times to un-border a
   *  `<fieldset>`, which is a browser default rather than a design choice. A side utility
   *  (`border-b-2`) is not counted either — §2 governs a container's edge, and a rule drawn on one
   *  side is a divider, which §9 already says of the border-colour grep. */
  containerBorderWidths: 0,
  offSystemElevation: 0,
  /** Spacing values off the `1 2 3 4 6 8 12` scale. Target 0. */
  offScaleSpacing: 0,
  /** Components importing the shared primitives. Target: most of the 27. This one only goes UP.
   *
   *  **21, raised from 18 on 2026-08-10 when \`Swatch\` brought \`FlightViz\`, \`LineChart\` and
   *  \`RocketDiagram\` in. Before that: 18, raised from 17 on 2026-08-04, and it had been a floor below the real number for at least
   *  a run.** It is a `toBeGreaterThanOrEqual`, so a stale floor cannot fail — it just quietly stops
   *  ratcheting, which is the one failure mode a one-directional check has. Found by running §9's own
   *  grep beside it and getting a different answer. Worth re-running that grep whenever this file is
   *  touched: `grep -rlE "from ['\"](\./ui|@/components/ui)['\"]" components | wc -l`. */
  uiAdopters: 21,
  /** Component files where caption size OUTNUMBERS the body default. **At the target**, so this is a
   *  guard rather than a ratchet from here on: a file that inverts again is a decision-grade value
   *  that has been put back at caption size. */
  invertedTypeFiles: 0,
  /** Sizes that are not on `DESIGN.md` §3's six-size scale at all. Target 0, and it is AT 0 — this one
   *  is a guard rather than a ratchet. `text-lg` sat between `text-base` and `text-xl`, invented once
   *  and copied fourteen times: eleven panel headings and three prominent values. */
  offScaleType: 0,
  /** Uses of `text-[11px]`, which §3 scopes to **"axis ticks and diagram annotations only"**.
   *
   *  On the scale, so `offScaleType` above cannot see it — and that is exactly how it reached 46 uses
   *  across ten files while §3 named two contexts for it. Most are legitimate (`RocketDiagram` 8,
   *  `LineChart` 6, `FlightViz` 5 are all diagram and axis annotation, which is the token's own job);
   *  the rest are field labels, legends and readout sub-lines, which §3 puts at `text-xs`.
   *
   *  **A ratchet, not a target, and it starts at the honest number rather than at zero**: this is
   *  a size with a real use, so it will never be 0, and the point is that it may not GROW while the
   *  known offenders are converted. Measured 2026-08-04, by file:
   *  `LoftApp` 11 (5 legends + 6 field labels), `RocketDiagram` 8, `LineChart` 6, `FlightViz` 5,
   *  `ui` 3, `MonteCarlo` 2, `ParameterSweep` 2, `ResultsView` 2, `RocketpyCrossCheck` 1,
   *  `DataTable` 1. It went 48 → 46 in the commit that added it, when `Readout`'s own label and
   *  sub-line moved to `text-xs` — the design system's primitive had been breaking the design
   *  system, on the treatment a flyer reads every number through. **46 → 42 as `MonteCarlo`'s five
   *  labelled values became `Readout`s**: three local card variants and then the waiver-exceedance
   *  readout inside the inputs card, which is the one a first pass left behind — it is not in the
   *  stat grid, so converting the grid made it the odd one out rather than fixing it. `MonteCarlo`'s
   *  remaining 2 are the histogram's own min/max axis labels, which is the token's job. **42 → 41
   *  when `ResultsView`'s local `Field` was deleted onto `Readout`'s `row` variant**: its `<dt>` was
   *  the last label in the design-summary strip at this size, and 14 call sites went with it.
   *  Adoption is how this number comes down — a label that moves into a primitive stops being
   *  spelled at the call site.
   *
   *  **41 → 33 on 2026-08-09, and it is the same lesson a third time.** `DesignEditor` spelled its
   *  fieldset legend six times and its inline field label six times, character-identical, which made
   *  `LoftApp` eleven of the forty-one on its own. A new fieldset for the internal-structure fields
   *  would have made it a thirteenth spelling and grown a count that is only allowed to shrink — so
   *  the two treatments became two constants in that file and the twelve call sites became two.
   *  `LoftApp` 11 → 3. Deliberately NOT lifted into `components/ui.tsx`: §5 is binding vocabulary
   *  carried identically by both repos, so a primitive there is a `DESIGN.md` change in both, which
   *  is right when a second surface needs the treatment and premature while one does. */
  axisTickSize: 33,
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
 *  is closing. What must not happen is a zero silently BECOMING the finished condition — and on
 *  2026-08-04 P6 answered both of those zeros rather than carrying them a sixth run. `Section` gained
 *  its call sites once its own imposed margins were removed; `Chip` was DELETED, from this list, from
 *  `components/ui.tsx` and from §5, because the app has exactly one token-shaped element and it is
 *  neither the key/value pair `Chip` declared nor the geometry §5 stated. The reasoning is in
 *  `ROADMAP.md` under P6. */
const PRIMITIVE_ADOPTERS: Record<string, number> = {
  /** 11, down from 12, and the same for `Button` at 12 from 14 and `ClosePanel` at 0 from 3 — all
   *  three fell on 2026-08-04 for the reason §9 records under *count what a file RENDERS*: `Panel`
   *  absorbed the container, the Run button and the close affordance of the three heavy analysis
   *  panels, so two files stopped importing what they still render. Adoption moving a count DOWN is
   *  the system working. What would be a regression is a file rendering one of these and importing
   *  neither it nor a primitive that owns it. */
  // 11 on 2026-08-10: `components/AirframeStrip.tsx` is a new surface and it took the primitive
  // rather than hand-rolling a band — which is the number moving in the direction §9 wants. A new
  // file that rendered its own bordered box would have left this at 10 and shown up in the
  // off-system counts instead.
  Card: 11,
  /** §5's `Toast` — the floating, dismissible message. One adopter, the service-worker update
   *  prompt, which is the surface it was extracted from. Ratcheted from the day it exists rather
   *  than later: an unratcheted primitive is the state `Section` sat in for five runs at zero
   *  adopters with nothing failing.
   *
   *  **`Card` did NOT move when this arrived, and the reason is not the one the note above this map
   *  gives.** That note says the map "counts what a file RENDERS". It does not — the check below
   *  matches the IMPORT LIST of `./ui` per file, so a component that imports a primitive and renders
   *  nothing still counts, and one that renders a primitive through another primitive does not.
   *  Corrected here rather than left to mislead the next session reasoning about a
   *  composition-driven count. `Card` stays at 11 because `ServiceWorker` imports `Toast` and never
   *  imported `Card`; the composition is real, but it is not what this number measures. */
  Toast: 1,
  /** §5's `DropZone` — the file target. One adopter, `components/ImportPanel.tsx`, which is the
   *  surface it was extracted from. Ratcheted from the day it exists, for the reason `Toast` records
   *  one entry up.
   *
   *  **`Card` does not move for this one either**, and this time it is because `ImportPanel` already
   *  imported `Card` for the three cards around the zone. The count is over a file's IMPORT LIST, not
   *  over what it renders. */
  DropZone: 1,
  Button: 12,
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
  DataTable: 7,
  /** One adopter, and the zero it replaced had stood for five runs. §5 declares `Section` as "what a
   *  route is built from" and it had never been rendered — because it imposed `mt-8` on itself and
   *  `mt-4` on its children, rhythm the two real bare regions already own through the workspace's own
   *  `space-y-8`, so adopting it would have doubled every gap. **A primitive that cannot be adopted
   *  without a repaint does not get adopted; it gets copied**, and that is what both sites did. Both
   *  margins are gone and it shares one header component with `Panel`, which is the other half of the
   *  same fix: the two had already drifted — `Section` spelled the heading with explicit zinc colours
   *  where all ten rendered headings in the app used `tracking-tight` — before either had a call
   *  site to keep them honest. */
  Section: 1,
  Segmented: 2,
  /** Zero, and that is the milestone rather than a regression.
   *
   *  `Tabs` had exactly one adopter — the workspace switcher — and `DESIGN.md` §5 says outright what
   *  that was: "Tabs switch views over one subject *within* a route. Not for navigation between
   *  jobs; that is a route (§7)." Flight, Design, Sweep and Cross-check are four JOBS, so on
   *  2026-08-02 they became four routes and the switcher became `components/WorkspaceNav.tsx`, a
   *  `<nav>` of links.
   *  The primitive stays exported for the case it is actually for; nothing renders it today. */
  Tabs: 0,
  /** The tab bar's own treatment, hoisted to a token when two components came to render it — the
   *  tablist and the workspace spine. A second copy of that class string is exactly how the twelve
   *  measured card variants happened, so it is counted like any other adoption. */
  navItemClass: 1,
  NumberField: 2,
  /** Zero, and it is `Panel` below that holds the line now. The close affordance was never the
   *  problem — every panel that had one used this — but it was gated on `open` by hand at each site
   *  and paired with a `useReturnFocus()` the call site also had to wire. `Panel` owns both. A
   *  fourth dismissible surface that reaches for `ClosePanel` directly is not wrong, and this
   *  leaving zero is what would tell the next audit it went that way rather than through `Panel`. */
  ClosePanel: 0,
  Disclosure: 1,
  /** §5's `Extrapolated` — "the warn treatment plus the reason and the range it left".
   *
   *  Six adopters on the run that created it, which is the whole point of the count: the treatment
   *  had existed for weeks inside `ResultsView`'s local `Stat`, so exactly ONE surface marked a
   *  number that left the drag model's envelope while five others flying the same solver rendered
   *  theirs as validated. Nothing here could see that, because a treatment written inline is
   *  invisible to a check that counts imports. A seventh surface must import it rather than
   *  re-spell it.
   *
   *  Four now, down from six, and both losses are the same thing rather than a retreat. `ResultsView`
   *  was the file the treatment was born in and stopped importing it directly when `Readout` took it
   *  over; `ParameterSweep` stopped when `Figure` did. **A treatment reaching a surface THROUGH
   *  another primitive is adoption working, not adoption lost** — the same rule §9 records for the
   *  caption-vs-body count, arriving here by a different route. A FIFTH surface that needs the
   *  caveat and reaches neither of those two must still import this.
   *
   *  **Five as of 2026-08-19, and the fifth is the sentence above coming true.** `ValidationPanel`
   *  publishes `mean abs. error N%` — the one figure a flyer quotes as Loft's accuracy — and had
   *  rendered it bare for its whole life, on a flight that may lie entirely outside the validated
   *  drag model, while `DragCrossCheck` said so directly below it off the same flight. It reaches
   *  neither `Readout` nor `Figure`, so it imports this, exactly as the paragraph above says a fifth
   *  surface must. The census that would have CAUGHT it — rather than counted it afterwards — is
   *  `lib/envelope-surfaces.test.ts`, which reads the set of flight-fed surfaces out of
   *  `ResultsView`'s own JSX instead of enumerating imports. */
  Extrapolated: 5,
  /** §5's `Readout` — the labelled-value-with-unit treatment, and the one a flyer reads every number
   *  through.
   *
   *  Two adopters. `ResultsView`'s sixteen readouts came first — this is that file's own `Stat`
   *  lifted into the vocabulary — and `MonteCarlo`'s six followed once the API could express what
   *  they were doing.
   *
   *  **The queue this milestone measured, and where each shape stands.** `MonteCarlo`'s
   *  `StatCard`/`WithheldCard`/`RadiusCard` (6) are converted: the three variants differed only in
   *  what went under the median, so `figure` (a second decision-grade number) now sits beside `sub`
   *  (a caption) and `withheld` (a reason), and the three local components are deleted.
   *  `ResultsView`'s `Field` (14) is converted too, by the `row` variant — the queue was never one
   *  treatment written many ways, it was one treatment at two DENSITIES, and a card-shaped primitive
   *  could not reach the dense half without repainting the shared chrome into 14 cards. The what-if
   *  delta rows (5) are the last shape: a before → after → change the API does not express, and the
   *  only one of the four that is a different THING rather than a different size.
   *
   *  Raising this number is the milestone; lowering it is a regression. */
  Readout: 2,
  /** §5's `Select`. Four adopters, covering all twelve `<select>` elements in the app.
   *
   *  Those twelve hand-rolled FIVE class strings before this existed, and the fifth was a real
   *  defect rather than untidiness: `ResultsView`'s two unit pickers carried no `TOUCH_TARGET` at
   *  all, so they rendered under §8's 44 px minimum on a phone. That is what a copied treatment
   *  costs — the copy drifts, and it drifts where nobody re-measures. */
  Select: 4,
  /** §5's `EmptyState`. Five adopters, and the first is still the one that matters most: `DataTable`
   *  is "every table in the app" (7 files), so that single branch is the empty state of all of them.
   *
   *  `MassBreakdown` also stopped returning null. Stated precisely, because driving the app corrected
   *  the first version of this note: one corpus design (`Three-stage rocket.CDX1`, 1 of 35) produces
   *  an empty structural-mass set, but loaded through the UI it has no motor, so `ResultsView`
   *  withholds everything below its "No flight simulated" card and the panel is never reached. That
   *  change is defensive — a data surface with no branch that silently disappears — not a hole a
   *  flyer was falling into.
   *
   *  **1 → 5 on 2026-08-12, and the four are what the vanish check found once it stopped reading a
   *  hand-typed list of two file names.** `FlightViz`, `GeometryInspector`, `ParameterSweep` and
   *  `RocketDiagram` each had a top-level `return null` that took a whole surface off the page:
   *  the flight path, the design-geometry section, `/sweep`'s only panel, and the airframe drawing
   *  that `AirframeStrip` keeps on screen across every route. Three were named in `ROADMAP.md`; the
   *  general instrument found two the enumerative one could not, of which this is one. `PhaseTable`
   *  is a fifth conversion that adds nothing here — its `DataTable` already carried the copy, and
   *  the fix was deleting the guard that made it unreachable. */
  EmptyState: 5,
  /** §5's `ErrorState`. One adopter today — the app's own error card, which carries both an import
   *  failure and a refused edit.
   *
   *  `components/RocketpyCrossCheck.tsx`'s `Failure` is the known next site and is deliberately not
   *  converted yet: it composes an offline note, the engine's own headline and a collapsible full
   *  report, in a documented order (the browser's fact before the engine's). Forcing it through three
   *  named slots would either reorder it or add a `children` escape hatch that makes the primitive
   *  mean nothing. It is filed rather than rushed. */
  ErrorState: 1,
  /** §5's `Panel` — "a `Card` with a header row and a close affordance, for anything dismissible.
   *  Owns focus return."
   *
   *  Three adopters, and it started at three: the parameter sweep, the motor sweep and the dispersion
   *  run had hand-rolled the identical landmark, header row, `text-xl` heading, `text-xs` caption,
   *  `open`-gated close button and `!open` Run block. Unlike the other primitives on this list it
   *  carries BEHAVIOUR, not just a treatment — the `useReturnFocus()` pairing was a four-part contract
   *  each call site re-derived, and a panel that closes and drops focus onto `<body>` is invisible to
   *  every check in this repo. A fourth heavy panel must import this.
   *
   *  **Seven, up from three, and the four new ones have nothing to dismiss.** The shape extracted for
   *  the three analysis panels — `Card as="section"` + `aria-label` + an `h2 text-xl font-medium
   *  tracking-tight` in a baseline row with an optional aside — turned out to be byte-identical at
   *  seven more sites: both cross-checks, the validation report, the flight-path card, the phase
   *  table, the no-flight refusal and the design-name strip. §5's container vocabulary was missing the
   *  shape the app uses MOST, and `Card`'s own `title` is a level below it (an `h3 text-base`, a
   *  heading inside a card rather than the card's own). The dismissible half is a type union rather
   *  than four loose optionals, so a call site cannot ask for a Close button and forget the Run button
   *  focus returns to. */
  Panel: 7,
  /** §5's `Figure` — "a chart with its title, legend, axis units, and its own empty and extrapolated
   *  states."
   *
   *  Four adopters, nine call sites, and four disagreeing treatments before it: `ResultsView`'s local
   *  `Plot` (a `Card`, an `h3`, an `overflow-x-auto` wrapper), `MonteCarlo` repeating that exact
   *  heading string without the wrapper, `DragCrossCheck` using a `<p>` where a heading belongs and
   *  one shade off at `text-zinc-600`, and `ParameterSweep` with the caveat above and the caption
   *  below and no heading at all. The last of those is why the primitive takes `extrapolated` and
   *  `caption` as slots: the caveat had exactly one home, and a home is what makes it a STATE rather
   *  than a paragraph somebody remembered.
   *
   *  Legend and axis units are deliberately NOT this primitive's: `LineChart` owns both already, and
   *  hoisting them would make every chart declare its axes twice. §5 lists them as things a figure
   *  must HAVE, not as things this wrapper must render. */
  Figure: 4,
  /** §5's `Popover` — "a surface overlaid on the page, anchored to the control that opened it".
   *
   *  **One adopter, and it shipped WITH that adopter rather than before it.** That is the rule this
   *  file learned from `Chip`, which declared a shape, found zero call sites for its whole life and
   *  was deleted: a primitive with no user is a proposal. The user here is the picked part's
   *  Properties surface on `/design` — R12, from `ON-5`.
   *
   *  Like `Panel` it carries BEHAVIOUR rather than a treatment: the focus trap, the Escape handler,
   *  the outside-press close and the focus return are a five-part contract, and every one of them is
   *  the difference between a popover and a one-way door. **None of it existed in THIS repo before
   *  — measured 2026-08-08, the tree contained zero `role="dialog"`, zero `aria-modal`, zero focus
   *  traps and no `Escape` handler of any kind.** The sibling repo is the opposite case and is the
   *  reason §5's entry is written the way it is: it had already shipped this primitive, and Loft's
   *  was built to its entry rather than to a fresh idea. A second overlay surface in either app
   *  imports the local one rather than re-deriving the contract. */
  Popover: 1,
};

describe("DESIGN.md §9 — the design system is binding, and this is what checks it", () => {
  const ui = uiSources(["components", "app"]);
  const tokenSource = () => [
    { path: "lib/ui-tokens.ts", text: readFileSync(join(ROOT, "lib/ui-tokens.ts"), "utf8") },
  ];
  /** The same sources with comments removed — see `stripComments`. Every check that matches a CLASS
   *  TOKEN reads this, so the rule can be explained in prose beside the check that enforces it. */
  /** **`lib/ui-tokens.ts` is scanned too, and leaving it out was a hole big enough to drive the whole
   *  app through.** `buttonClass` spells the control radius for every `<Button>`, every link-button
   *  and the header's external anchor, and it lives in neither `components/` nor `app/` — so with the
   *  radius check reading those two directories, that one line could be set to the radius §2 forbids
   *  by name with the suite green. Found by the pre-push review, by simulation rather than by
   *  reading. `MAINTAINING.md` already says `lib/` holds real class strings that components
   *  interpolate; this is the file it means. */
  const uiCode = [...ui, ...tokenSource()].map((f) => ({
    path: f.path,
    // CSS has no string literals to speak of, and its whole body is class position, so it passes
    // through: `app/globals.css` is where an `@apply`-style rule would hide a radius.
    text: f.path.endsWith(".css") ? stripComments(f.text) : classText(stripComments(f.text)),
  }));
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
    const { total, byFile } = countMatches(uiCode, /rounded-lg/g);
    expect(total, `rounded-lg, by file:\n${byFile.join("\n")}`).toBe(BUDGET.roundedLg);
  });

  it(`uses exactly ${BUDGET.offSystemRadius} radii outside the system`, () => {
    // **The check above names ONE literal, so it is blind to every other off-system radius**, which
    // is the identical mistake it was written to catch elsewhere: `offScaleType`'s own docblock says
    // a check that enumerates known-bad tokens passes the size nobody has thought of yet. Measured
    // 2026-08-09 with `roundedLg` sitting at 0: seven live violations, five of them one treatment.
    //
    // Enumerate every radius token and SUBTRACT §2's three, so a value nobody has thought of fails by
    // default. The bare `rounded` counts: Tailwind gives it its own value, so it is a fourth radius
    // written as if it were the default.
    // Side and corner utilities are part of the token, and judging the whole string would read
    // `rounded-r-none` — which SQUARES the edge two adjacent controls meet at, a documented pattern
    // in `ImportPanel` — as a fourth radius. Split it: the value is what §2 governs, the side is
    // where it applies.
    const SIDE = "t|r|b|l|tl|tr|br|bl|s|e|ss|se|es|ee";
    const VALUE = "none|sm|md|lg|xl|2xl|3xl|full|\\[[^\\]]+\\]";
    const RADII = new RegExp(`\\brounded(?:-(?:${SIDE}))?(?:-(?:${VALUE}))?\\b`, "g");
    const offSystem = (m: string) => {
      const value = new RegExp(`-(${VALUE})$`).exec(m)?.[1];
      // A bare `rounded` — or a bare `rounded-b` — is Tailwind's own default value, which is a
      // radius the system never chose, written as if it were not a choice.
      if (value === undefined) return true;
      if (value === "md" || value === "xl" || value === "full") return false;
      // `none` removes a radius rather than picking one, and only makes sense per side.
      return !(value === "none" && new RegExp(`^rounded-(${SIDE})-none$`).test(m));
    };
    const { total, byFile } = countMatches(uiCode, RADII, offSystem);
    expect(total, `off-system radii, by file:\n${byFile.join("\n")}`).toBe(BUDGET.offSystemRadius);
    // No exemption, by owner or by value — which is the whole point of the round this took to reach.
    // An exception written into the binding document is a permanent cost; this one bought nothing.
  });

  it(`uses exactly ${BUDGET.offSystemBorder} border colours outside the system`, () => {
    // §2 defines two border pairs and says "Two, deliberately" — and nothing read that sentence until
    // this check existed. Written in the same shape as the radius check above, and for the reason
    // that one's docblock gives: a check enumerating known-bad tokens passes the value nobody has
    // thought of yet, so enumerate every `border-zinc-*` and SUBTRACT §2's four.
    //
    // Colour only. A side utility (`border-t`, `border-x`) says WHERE the rule is drawn, which §2
    // does not govern — the same split the radius check makes between value and side. A bare
    // `border` sets width, not colour, and inherits whatever the cascade gives it.
    const BORDERS = /\bborder-zinc-[0-9]{2,3}\b/g;
    const SANCTIONED = new Set(["border-zinc-200", "border-zinc-800", "border-zinc-300", "border-zinc-700"]);
    const offSystem = (m: string) => !SANCTIONED.has(m);
    const { total, byFile } = countMatches(uiCode, BORDERS, offSystem);
    expect(total, `off-system border colours, by file:\n${byFile.join("\n")}`).toBe(BUDGET.offSystemBorder);
  });

  /** **The two sanctioned pairs must also be USED as pairs**, which the count above cannot see.
   *
   *  Every violation found when the border check was first pointed at the tree was `border-zinc-100
   *  dark:border-zinc-800` — a light value §2 does not sanction against the dark value it does. Fix
   *  only the light half and the count reaches 0 while the rule is still a different rung in each
   *  theme; §2's whole purpose is that an interactive edge reads as one without inspecting the
   *  element, and a pair that changes rung between themes breaks exactly that.
   *
   *  **Deliberately conservative, because the first version of this was noisy and a noisy check gets
   *  disabled.** Scanning by LINE reported `components/SectionNav.tsx:60` — `border-zinc-200 …
   *  hover:border-zinc-300 … dark:border-zinc-800`, which is the hairline resting and the control on
   *  hover, exactly right — and three more lines that simply carried two elements' classes. So this
   *  reads ONE class string at a time, counts only RESTING tokens (a `hover:`/`focus:`/`group-*`
   *  variant is a different state, not this element's edge), and skips any string holding more than
   *  one light or more than one dark, where the pairing cannot be attributed. It fires only where the
   *  answer is unambiguous, and the two it does fire on are real. */
  it("never pairs one border rung with the other's dark half", () => {
    const PAIR: Record<string, string> = { "border-zinc-200": "border-zinc-800", "border-zinc-300": "border-zinc-700" };
    const mismatched: string[] = [];
    for (const f of ui) {
      if (f.path.endsWith(".css")) continue;
      for (const m of stripComments(f.text).matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
        const s = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " ");
        // A resting token owns no variant prefix. `dark:` alone is the theme half of the same edge.
        const light = [...s.matchAll(/(?:^|\s)(border-zinc-[0-9]{2,3})\b/g)].map((x) => x[1]);
        const dark = [...s.matchAll(/(?:^|\s)dark:(border-zinc-[0-9]{2,3})\b/g)].map((x) => x[1]);
        if (light.length !== 1 || dark.length !== 1) continue;
        const want = PAIR[light[0]];
        if (want && dark[0] !== want) mismatched.push(`${f.path}: ${light[0]} paired with dark:${dark[0]}`);
      }
    }
    expect(mismatched, `border pairs that change rung between themes:\n${mismatched.join("\n")}`).toEqual([]);
  });

  it(`writes exactly ${BUDGET.arbitrarySpacing} arbitrary spacing value, and it is a device inset`, () => {
    // §4 states a scale and forbids arbitrary values, and `offScaleSpacing`'s pattern ends in
    // `[0-9]+\b` — so `p-[13px]` is not off-scale to it, it is invisible. The sibling's §9 carries a
    // fixture proof of exactly this: seven live violations, three of them arbitrary, reported as
    // zero. Loft's copy of that block was the stale one.
    //
    // `env(safe-area-inset-*)` is the one legitimate arbitrary expression — a length only the browser
    // knows — and it is exempted by naming the function rather than by naming the file, so a second
    // device inset needs no change here and an ordinary `p-[13px]` still fails.
    const ARBITRARY = /\b((?:p|m)[xytblr]?|(?:gap|space)(?:-[xy])?)-\[[^\]]+\]/g;
    const { total, byFile } = countMatches(uiCode, ARBITRARY, (m) => !m.includes("env(safe-area-inset-"));
    expect(total, `arbitrary spacing values, by file:\n${byFile.join("\n")}`).toBe(
      BUDGET.arbitrarySpacing - 1,
    );
    // The exemption is asserted rather than assumed: a check that only ever counts the failures
    // cannot tell "the inset is still there" from "somebody deleted the safe-area padding". A FLOOR
    // rather than an exact count, because the exemption is by expression and not by file — a notch
    // clearance on the header is the same legitimate thing, and an exact count would fail it with a
    // message saying the toast had lost its padding, which is the opposite of what happened.
    const insets = countMatches(uiCode, ARBITRARY, (m) => m.includes("env(safe-area-inset-"));
    expect(insets.total, "the phone toast lost its safe-area inset").toBeGreaterThanOrEqual(1);
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

  it(`hand-rolls exactly ${BUDGET.cardTreatmentsOutsidePrimitives} card treatments outside the primitives file, on the way to none`, () => {
    // **P18's own count.** The one above says how many DISTINCT treatments exist; this says how many
    // OCCURRENCES are written somewhere a call site can copy. A treatment inside `components/ui.tsx`
    // is the vocabulary; the same string in a feature component is the vocabulary being re-invented,
    // which is what produced all twelve measured variants.
    //
    // **Occurrences, not distinct strings, and the first draft got that wrong.** It keyed a Map by
    // the treatment, so two files hand-rolling the SAME string counted as one and the failure named
    // only the last of them — the copy-paste case this check exists to catch was the one case it
    // could not see. Caught by the pre-push review.
    //
    // **Reads STRIPPED source**, like every other class-token check here (see `uiCode` above). The
    // draft read raw text, so writing the words `rounded-xl border` in a prose comment in any feature
    // component would have failed it — and this very diff added such a comment one file over. The
    // card check above is exempted from that rule on the argument that the string "does not appear
    // in prose", which stopped being true the moment a milestone was written about it.
    //
    // **Matched on the FILE PATH, not a basename**, because `--exclude=ui.tsx` would exempt a future
    // `components/<anything>/ui.tsx` without saying so.
    //
    // **Read one STRING LITERAL at a time, not as a regex over the joined text — and the first
    // attempt at this fix got that wrong too.** `classText` concatenates every literal in a file
    // with spaces, so a greedy pattern runs straight through the join: on `ImportPanel` it swallowed
    // eleven unrelated class strings into one match, and two genuine hand-rolls in one file would
    // have counted as ONE — which is the very defect this rewrite exists to remove, reintroduced by
    // the tool used to remove it. Caught by its own control.
    //
    // **A literal counts when it carries BOTH `rounded-xl` and a `border` token, in any order.** The
    // old pattern was anchored on the literal sequence `rounded-xl border`, so a call site writing
    // `rounded-xl bg-white border border-zinc-200` — the same hand-roll with the words rearranged —
    // matched nothing at all. §9 records fixing the identical stale-pattern problem in the shell
    // copy (a missing `:`); cloning that form into a new check is how the fix gets undone.
    const found: string[] = [];
    for (const f of components) {
      if (f.path === "components/ui.tsx") continue;
      for (const m of stripComments(f.text).matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
        const lit = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " ");
        const tokens = lit.split(/\s+/).filter(Boolean);
        if (tokens.includes("rounded-xl") && tokens.some((t) => /^border(-|$)/.test(t))) {
          found.push(`${f.path}: ${lit.trim()}`);
        }
      }
    }
    expect(
      found.length,
      `card treatments outside components/ui.tsx:\n${found.sort().join("\n")}`,
    ).toBe(BUDGET.cardTreatmentsOutsidePrimitives);
  });

  it(`writes exactly ${BUDGET.containerBorderWidths} container border widths off §2's hairline`, () => {
    // Reads STRIPPED source one STRING LITERAL at a time, like every other class-token check here:
    // a width named in a prose comment is a mention, and this very run had to stop a docblock
    // spelling one — Tailwind reads raw text, so the comment regenerated a rule nothing asked for.
    //
    // A spinner ring is subtracted by the literal it lives in (`rounded-full`), not by file, because
    // the five that exist are spread across five feature components and a file-level exemption would
    // hand each of them a licence to draw a bordered container as well.
    const found: string[] = [];
    for (const f of [...uiSources(["components", "app"], [".tsx"])]) {
      for (const m of stripComments(f.text).matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
        const lit = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " ");
        const tokens = lit.split(/\s+/).filter(Boolean);
        if (tokens.includes("rounded-full")) continue;
        if (tokens.some((t) => /^border-[1-9]\d*$/.test(t))) found.push(`${f.path}: ${lit.trim()}`);
      }
    }
    expect(
      found.length,
      `container border widths off §2's hairline:\n${found.sort().join("\n")}`,
    ).toBe(BUDGET.containerBorderWidths);
  });

  it(`uses exactly ${BUDGET.offSystemElevation} elevations outside §2's two`, () => {
    // **§2's elevation table shipped WRONG because nothing could contradict it.** Written
    // 2026-08-17 declaring one value while two shipped — `shadow-lg` on the toast and `shadow-sm` on
    // `Segmented`'s thumb, in the same file the section was written in. Every other check here reads
    // radius, border colour, spacing or type; an elevation is none of those, so all of them read past
    // it. This is the instrument that section now ships with.
    //
    // Enumerate-and-subtract, like the radius and border greps: `shadow-lg` is `floating` and
    // `shadow-sm` is the thumb, and a third value fails rather than passing unnamed.
    const { total, byFile } = countMatches(
      uiCode,
      /\bshadow-(?!lg\b|sm\b)(?:2xs|xs|md|xl|2xl|inner|none|\[[^\]]+\])\b/g,
    );
    expect(total, `elevations outside §2:\n${byFile.join("\n")}`).toBe(BUDGET.offSystemElevation);
  });

  it(`uses exactly ${BUDGET.offScaleSpacing} off-scale spacing values, on the way to none`, () => {
    // The scale is 1 2 3 4 6 8 12. A `mt-5` between two things that are `mt-4` apart everywhere else
    // is invisible on its own page and is exactly how a layout stops lining up across surfaces.
    //
    // **The pattern ENUMERATES the scale and subtracts it, rather than listing off-scale values to
    // look for — and that change found real drift the old one could not.** It used to alternate over
    // six hand-picked numbers (5, 7, 9, 10, 11, 14), which left three blind spots its own comment
    // recorded: no `gap-*`, no half-steps, and nothing above 14. The footer sat two steps outside the
    // scale on both of its top margins and read as compliant for as long as this check has existed.
    //
    // The reason it was left narrow is worth correcting rather than deleting, because it was exactly
    // backwards: the old note said widening it "would put the two out of step, and §9 is shared
    // verbatim with the sibling app". The SIBLING'S §9 already carried this wider form. Loft's copy
    // was the stale one, so widening it CONVERGED the two rather than forking them — which is what
    // §10 asks for, and which could not be checked until both repos were attached in one session
    // (2026-08-02, the first time that was possible).
    //
    // Half-steps still pass, by construction rather than by exemption: `py-1.5` matches at `py-1`,
    // and 1 is on the scale. §4 states the scale and then prescribes `px-3 py-1.5` as the padding
    // inside a control, so a check that failed on half-steps would be failing the file's own
    // instruction.
    const { total, byFile } = countMatches(
      ui,
      /\b((p|m)[xytblr]?|(gap|space)(-[xy])?)-(?!(0|1|2|3|4|6|8|12)\b)[0-9]+\b/g,
    );
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
    // **A primitive counts as body default, and without that this check punishes the very direction
    // P6 exists to push.** Every control primitive renders `text-sm` — `Select`, `NumberField`,
    // `Readout`, `Button` — so converting a hand-rolled control REMOVES a `text-sm` from the call
    // site and adds nothing back that a source grep can see. Measured when `Select` landed:
    // `LoftApp` went from 17/16 to 17/9 without one rendered pixel changing size, and read as a
    // file that had suddenly gone all-captions. Counting the primitive's own usage restores what the
    // extraction moved, and it does not blunt the guard: a file full of raw captions and no controls
    // still trips, which is the case the check was written for (Debrief's 212-to-82).
    //
    // Listed explicitly rather than matched as "any capitalised JSX tag", so a new primitive has to
    // be added here deliberately and cannot silently buy a file its way out of an inversion.
    const BODY_DEFAULT_PRIMITIVES = /<(Select|NumberField|Readout|Button|Segmented)\b/g;
    const inverted = components
      .map((f) => ({
        path: f.path,
        xs: f.text.match(/text-xs/g)?.length ?? 0,
        sm:
          (f.text.match(/text-sm/g)?.length ?? 0) +
          (f.path === "components/ui.tsx" ? 0 : f.text.match(BODY_DEFAULT_PRIMITIVES)?.length ?? 0),
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

  it("hand-rolls exactly 0 <select> elements — every dropdown is the primitive", () => {
    // `DESIGN.md` §5: one treatment per thing. Twelve `<select>` elements across four files spelled
    // five different class strings, and one of those five had lost its touch minimum entirely — the
    // failure mode is never that a copy looks wrong on the day it is made, it is that nobody
    // re-measures the copy.
    //
    // Counted on the SOURCE rather than by adoption, because adoption cannot see a thirteenth
    // `<select>` added tomorrow beside the primitive. `components/ui.tsx` is excluded: it holds the
    // one that every other file is meant to reach.
    //
    // Comments are stripped first. Two files discuss `<select>` in prose — `LoftApp` explaining why
    // a change event does not fire, and `MotorSweep` on scrolling a sixteen-option list — and a
    // grep that counted those would report 14 and make the next session hunt two that do not exist.
    const raw = components
      .filter((f) => f.path !== "components/ui.tsx")
      .flatMap((f) => {
        const stripped = f.text
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .split("\n")
          .filter((l) => !/^\s*(\/\/|\*)/.test(l))
          .join("\n");
        return [...stripped.matchAll(/<select[\s>]/g)].map(() => f.path);
      });
    expect(raw, `hand-rolled <select> elements:\n  ${raw.join("\n  ")}`).toEqual([]);
  });

  it("renders no chart outside a `Figure`", () => {
    // `DESIGN.md` §5: a figure is "a chart with its title, legend, axis units, and its own empty and
    // extrapolated states". Nine call sites in four files spelled the frame four ways before
    // 2026-08-04, and the differences were not cosmetic: one used a `<p>` where a heading belongs,
    // and one put the out-of-envelope caveat somewhere the others had no place for at all.
    //
    // **This is a FILE-level check and it says so.** It catches the next component that adds a chart
    // and frames it by hand — the way all four of these started. It cannot see a second chart added
    // inside a file that already adopts `Figure`, and that limit is why the per-primitive ratchet
    // above is kept as well: this one goes red on a new file, that one goes red on a file that stops.
    const CHARTS = ["<LineChart", "<Histogram", "<Scatter", "<FlightViz"];
    const offenders = components
      .filter((f) => f.path !== "components/ui.tsx")
      .filter((f) => {
        const stripped = f.text
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .split("\n")
          .filter((l) => !/^\s*(\/\/|\*)/.test(l))
          .join("\n");
        if (!CHARTS.some((c) => stripped.includes(c))) return false;
        return !/import \{[^}]*\bFigure\b[^}]*\} from "(?:\.\/ui|@\/components\/ui)"/.test(stripped);
      })
      .map((f) => f.path);
    expect(offenders, `components rendering a chart without \`Figure\`:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });

  it("wires focus return in exactly 0 places — `Panel` owns it", () => {
    // `DESIGN.md` §5 says `Panel` "owns focus return", and until 2026-08-04 nothing did: the three
    // heavy panels each declared `useReturnFocus()`, put the ref on their own Run button, and called
    // the returner from inside their own close handler. Four steps, by hand, three times.
    //
    // The same source-count reasoning as the `<select>` check above: adoption counts imports, so it
    // can see a fourth panel that imports `Panel` but not a fourth panel that re-derives the wiring
    // beside it. This is the assertion that goes red for the second kind.
    //
    // Scoped to the HOOK rather than to the whole pattern deliberately. A future surface with a real
    // reason to return focus somewhere `Panel` does not render — a modal, a drawer — is not a defect,
    // and this check is where that argument gets made: the hook stays exported, and taking it means
    // changing this number with the reason beside it, not quietly copying four lines.
    const callers = components
      .filter((f) => f.path !== "components/ui.tsx")
      .filter((f) =>
        f.text
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .split("\n")
          .filter((l) => !/^\s*(\/\/|\*)/.test(l))
          .join("\n")
          .includes("useReturnFocus("),
      )
      .map((f) => f.path);
    expect(callers, `hand-wired focus return:\n  ${callers.join("\n  ")}`).toEqual([]);
  });

  it("lets no data surface vanish instead of saying why", () => {
    // `DESIGN.md` §5: "A surface with no empty state is not finished. It is the state a flyer sees
    // first." A `return null` on a DATA surface is the worst version of that — not a bad empty
    // state, but a hole where a panel was, indistinguishable from a render that failed.
    //
    // Measured: `MassBreakdown` did exactly this on 1 of the 35 corpus designs
    // (`Three-stage rocket.CDX1` states no structural point masses), and its `empty` copy was
    // already written and provably unreachable behind the guard.
    //
    // The distinction that has to be drawn is whether the surface exists to show data a flyer came
    // looking for. Most of this app's `return null`s are conditional ADVICE — a flutter hint, a
    // stability-trim note, a booster-descent line — and a hint that does not apply must not render an
    // empty box saying so. A blanket "no `return null`" would fire on all eleven of those.
    //
    // **This check used to draw that line with a two-name list, and that made it structurally unable
    // to find anything.** `DATA_SURFACES` was `["components/MassBreakdown.tsx", "components/DataTable.tsx"]`
    // — the two surfaces somebody had already fixed — so every data surface added since was exempt by
    // construction and the count could only ever read 0. It is the same class error §9 records about
    // the radius and spacing greps, and about the type-size one: an instrument that enumerates what
    // it already knows about reads green over the class it was never told to look for. Pointed at the
    // tree as a DERIVED rule it found five, of which `ROADMAP.md` had guessed three.
    //
    // **The rule: a data surface is a component that renders one of §5's DATA containers, or renders
    // a dataset into one of its general containers.** The container is what makes it a surface a
    // flyer navigated to rather than a line of advice that appeared beside one.
    //
    // **The containers split into two kinds, and an earlier draft required the dataset tell of
    // both.** `DataTable`, `Figure` and `<table>` ARE a dataset — §5 puts all three under *Data*, and
    // nothing renders one for a single value. The other three are shapes anything can take: `Panel`
    // is the primitive itself, `<svg>` is every icon in the app, `Card as="section"` is any section.
    // Those need a second tell before they mean data.
    //
    // Requiring it of all six cost real coverage, and the review that found it demonstrated the gap
    // rather than argued it: `RocketpyCrossCheck`'s `Comparison` builds six solver-comparison rows as
    // an array literal and renders them into a `DataTable`, and `MotorSweep` passes rows straight
    // through — neither types `.map(` anywhere in its own body, so a `return null` added to either
    // would have shipped green. That is the enumerate-what-we-know error one layer down: the old
    // check exempted by NAME, and a spelling test exempts by VOCABULARY.
    const STRONG: [string, RegExp][] = [
      ["DataTable", /<DataTable[\s/>]/],
      ["Figure", /<Figure[\s/>]/],
      ["table", /<table[\s/>]/],
    ];
    const WEAK: [string, RegExp][] = [
      ["Panel", /<Panel[\s/>]/],
      ["svg", /<svg[\s/>]/],
      ['Card as="section"', /<Card[^>]*as="section"/],
    ];
    // Several spellings, because a dataset arrives by more than one. Still a list, and still the
    // narrower half of the rule — but it only ever decides the three weak containers.
    const DATASET = /\.(?:map|flatMap|filter|slice|sort|entries)\(|Array\.from\(|\brows=|\bdata=|\bseries=|\bfor \(/;
    const surfaces: string[] = [];
    const offenders: string[] = [];
    for (const f of components.filter((x) => x.path.endsWith(".tsx"))) {
      const { raw, scan } = scannableSource(f.text);
      for (const fn of topLevelFunctions(scan, raw)) {
        const strong = STRONG.some(([, re]) => re.test(fn.body));
        if (!strong && !(WEAK.some(([, re]) => re.test(fn.body)) && DATASET.test(fn.body))) continue;
        // Reported against the ORIGINAL file, not the comment-stripped copy `topLevelFunctions` read:
        // `stripComments` deletes block comments outright, so its line numbers are short by however
        // much docblock precedes the component — 46 lines on `AirframeStrip`. A failure message that
        // points at the wrong line is a failure message a session has to distrust.
        const found = f.text.search(new RegExp(`^(?:export\\s+)?(?:default\\s+)?function\\s+${fn.name}\\b`, "m"));
        // Guarded, because `search` returns -1 and `slice(0, -1)` then answers with the file's LAST
        // line — a plausible number pointing at the wrong place, which is the one outcome the lines
        // above exist to prevent. An unresolvable name is a fact to state, not to round off.
        expect(found, `${f.path}: cannot locate \`function ${fn.name}\` in the original source`).toBeGreaterThanOrEqual(0);
        const at = f.text.slice(0, found).split("\n").length;
        surfaces.push(`${f.path}:${at} ${fn.name}`);
        if (returnsNullAtTopLevel(fn.scan)) offenders.push(`${f.path}:${at} ${fn.name}`);
      }
    }
    // How much of the tree the instrument can SEE — the number that was 2 before this check was
    // derived, and that a future narrowing would quietly take back down.
    //
    // **Written `>=` and pinned AT the measured count, which makes it a ratchet like every other one
    // in this file — say that rather than claim otherwise.** An earlier draft argued the `>=` bought
    // room for a surface to be deleted without a red gate. At 22 of 22 it buys none, and pretending
    // it does is worse than the exact form: a session meeting the failure would be told the
    // instrument had gone blind when it had in fact done its job. If a surface is genuinely removed,
    // lower this number in the same commit, with the reason — exactly as the treatment counts ask.
    // The `>=` is kept only so that WIDENING the rule is not itself a failure.
    //
    // Two of the 22 are honest over-reach, named rather than carved out: `Footer` maps links into a
    // layout that holds an `<svg>`, and `NoPropulsionNotice` is the "No flight simulated" card, which
    // is advice in a `Panel`. Neither can vanish, both would be a hole if they did, and a carve-out
    // list is how the version of this check that could not fail was built.
    expect(surfaces.length, `data surfaces the instrument can see:\n  ${surfaces.join("\n  ")}`).toBeGreaterThanOrEqual(22);
    expect(
      offenders,
      `a data surface returns null instead of an empty state:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("declares its components with the `function` keyword, which is what the check above can read", () => {
    // `topLevelFunctions` reads `function Name(…)` and nothing else, so an arrow-function component
    // would be invisible to the empty-state check rather than exempt from it — the silent kind of
    // blindness, which is the whole subject of P14. This is the assertion that makes it loud.
    //
    // Scoped to a CapitalCamelCase name, which is React's own rule for what may appear in JSX:
    // `const cx = (…) => …` and every hook and helper in this tree is an arrow and is not a
    // component. The lowercase letter in the pattern is what excludes SCREAMING_CASE — an early draft
    // flagged `PART_COLUMNS` and `MOTOR_GAP_SHORT`, both arrow-valued constants and neither a
    // component. A check that fires wrongly is one somebody disables.
    //
    // **It matches the VALUE loosely on purpose, and an earlier draft matched only `= (…) =>`.**
    // That draft was handed four vanishing surfaces written as `memo(…)`, `forwardRef(…)`, a generic
    // arrow and a plain function expression, and stayed green on all four — while `topLevelFunctions`
    // could not see them either. Two instruments, one blind spot, reading as coverage. The forms
    // below are the ones a React component actually stops being a `function` declaration by; matching
    // `const Name =` followed by anything function-shaped is deliberately wider than the list of
    // shapes anyone has used, because that is the half that has already gone wrong twice.
    //
    // `export default (…) => …` is caught separately: it has no name to be CapitalCamelCase.
    const arrows: string[] = [];
    for (const f of components.filter((x) => x.path.endsWith(".tsx"))) {
      const { scan } = scannableSource(f.text);
      for (const m of scan.matchAll(
        /^(?:export\s+)?const\s+([A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*)\s*(?::[^=\n]*)?=\s*(?:async\s+)?(?:memo\s*\(|forwardRef\s*\(|function\b|<|\(|[A-Za-z0-9_$]+\s*=>)/gm,
      )) {
        arrows.push(`${f.path}: ${m[1]}`);
      }
      for (const m of scan.matchAll(/^export\s+default\s+(?:async\s+)?(?:\(|[A-Za-z0-9_$]+\s*=>|memo\s*\(|forwardRef\s*\()/gm)) {
        arrows.push(`${f.path}: anonymous default export at offset ${m.index}`);
      }
    }
    expect(
      arrows,
      `a component the empty-state check cannot see, because it is not a \`function\` declaration:\n  ${arrows.join("\n  ")}`,
    ).toEqual([]);
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

  it(`holds \`text-[11px]\` at ${BUDGET.axisTickSize} uses and does not let it grow`, () => {
    // §3 scopes this token to "axis ticks and diagram annotations only". It is ON the six-size
    // scale, so the off-scale check above is blind to it by design — and that is how it reached 46
    // uses across ten files while the spec named two contexts for it.
    //
    // **A ratchet from the honest number, not a target of zero.** The token has a real job:
    // `RocketDiagram` (8), `LineChart` (6) and `FlightViz` (5) are all genuine axis and diagram
    // annotation. The offenders are field labels, legends and readout sub-lines — `LoftApp`'s 11 are
    // 5 `<legend>` and 6 field labels — which §3 puts at `text-xs`. Lower this as they convert; the
    // failure it exists to catch is the number going UP while nobody is looking, which is exactly how
    // it got here.
    const { total, byFile } = countMatches(ui, /\btext-\[11px\]/g);
    expect(total, `text-[11px] uses, by file:\n${byFile.join("\n")}`).toBe(BUDGET.axisTickSize);
  });

  it(`hand-rolls exactly ${BUDGET.handRolledButtons} <button> elements — the three primitives, and nothing else`, () => {
    // Comments first: several of these files explain in prose why a `<button>` that navigates is a
    // keyboard and screen-reader defect, and prose about the rule is not a breach of it.
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

  it("declares no radius in the stylesheet that is off the system", () => {
    // **The same blind spot the font-size check below exists to close, on the other half of §2.**
    // The radius checks above match class NAMES and a stylesheet declares VALUES, so everything in
    // `app/globals.css` was invisible to them — which is how `.eqn` shipped 8 px corners on all six
    // docs routes at an off-system-radius count of zero. That one was fixed by hand and the hole it
    // came through was not; the pre-push review found `.prose-loft code` still sitting at 4 px, a
    // fifth radius nothing could see. It is 6 px now, and this is what holds it there.
    //
    // §2's three, in px: 6 (control), 12 (container), and a pill, which CSS spells as a huge value.
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
    const ALLOWED_PX = new Set([6, 12, 9999]);
    const off: string[] = [];
    // Blocks, so a declaration can be judged by the rule it sits in. The focus ring is the one
    // exemption and it is by SELECTOR: an outline drawn around a control is not the control's own
    // corner, and §2 governs the component, not the ring the browser paints outside it.
    for (const block of css.split("}")) {
      const [selector, body] = block.split("{");
      if (!body) continue;
      if (/focus-visible/.test(selector)) continue;
      for (const m of body.matchAll(/border-radius:\s*([^;]+);/g)) {
        const raw = m[1].trim();
        if (/^(inherit|initial|unset|revert)$/.test(raw)) continue;
        const rem = /^([\d.]+)rem$/.exec(raw);
        const px = /^([\d.]+)px$/.exec(raw);
        const asPx = rem ? Number(rem[1]) * 16 : px ? Number(px[1]) : NaN;
        if (!ALLOWED_PX.has(asPx)) off.push(`${selector.trim().slice(0, 40)} → ${raw}`);
      }
    }
    expect(off, "radii declared in app/globals.css that are not §2's").toEqual([]);
    // The control: a stylesheet with no radius at all would pass the line above having read nothing.
    expect(
      [...css.matchAll(/border-radius:/g)].length,
      "no radius is declared in the stylesheet at all — this asserted nothing",
    ).toBeGreaterThan(1);
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

  it("lets no hand-written rule answer only the class half of the dark variant", () => {
    // **The `dark` variant has TWO clauses and a hand-written rule only gets the one it asks for.**
    // `@custom-variant dark` at the top of `app/globals.css` gives every `dark:` UTILITY both: the
    // `.dark` class an explicit choice sets, and `prefers-color-scheme` for a visitor who has chosen
    // neither. A rule written by hand as `:where(.dark) X { color: … }` answers the first and misses
    // the second — and "System" is the DEFAULT theme, setting no class at all.
    //
    // That is not a hypothetical. All eleven `.prose-loft` rules were exactly this shape, so every
    // first-time visitor on a dark-OS device read all six docs routes in the LIGHT palette on the
    // dark ground `html` paints: body text at 1.91:1, `h2` and `strong` at 1.12:1, links at 3.16:1,
    // formulas as white cards on black. WCAG AA wants 4.5:1. The owner reported it from the live
    // site as "the font color stays grey in dark mode, incredibly hard to read".
    //
    // The fix is `light-dark()`, which resolves against the element's USED `color-scheme` — and the
    // three `html` rules above already set that per clause, so one function covers both with no
    // media query to forget. This check is what stops the old shape coming back: for every property
    // a `:where(.dark)` rule sets, the base rule for the same selector must state that property with
    // `light-dark()`. The `:where(.dark)` rules themselves are welcome to stay — they are the
    // fallback for a browser without `light-dark()`, and there they carry the explicit choice.
    //
    // Only TOP-LEVEL rules are examined. Anything already inside an at-rule is either the variant
    // itself or the print block, both of which resolve the clause by other means.
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

    // Walk the text tracking brace depth, so an `@media` body is skipped whole rather than
    // mis-parsed by a regex that cannot count braces.
    const rules: { selector: string; body: string }[] = [];
    let depth = 0;
    let prelude = "";
    let atRuleDepth = -1;
    let i = 0;
    while (i < css.length) {
      const ch = css[i];
      if (ch === "{") {
        const sel = prelude.trim();
        if (depth === 0 && sel.startsWith("@")) atRuleDepth = depth;
        else if (depth === 0) {
          // A style rule at the top level: capture its body, which contains no nested braces.
          const end = css.indexOf("}", i);
          rules.push({ selector: sel, body: css.slice(i + 1, end) });
          prelude = "";
          i = end + 1;
          continue;
        }
        depth++;
        prelude = "";
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && atRuleDepth === 0) atRuleDepth = -1;
        prelude = "";
      } else prelude += ch;
      i++;
    }

    const props = (body: string) =>
      new Set(
        [...body.matchAll(/(^|;)\s*([a-z-]+)\s*:/g)]
          .map((m) => m[2])
          .filter((p) => !p.startsWith("--")),
      );
    // A rule may be split across several declarations of the same property (the bare fallback and
    // the `light-dark()` one), so collect every base declaration for a selector, not just the first.
    const baseBySelector = new Map<string, string>();
    for (const r of rules) {
      if (r.selector.includes(".dark") || r.selector.includes(".light")) continue;
      for (const part of r.selector.split(",")) {
        const key = part.trim().replace(/\s+/g, " ");
        baseBySelector.set(key, (baseBySelector.get(key) ?? "") + ";" + r.body);
      }
    }

    const unpaired: string[] = [];
    for (const r of rules) {
      if (!/:where\(\.dark\)|(^|\s)\.dark(\s|$)/.test(r.selector)) continue;
      for (const part of r.selector.split(",")) {
        const bare = part
          .trim()
          .replace(/:where\(\.dark\)\s*/g, "")
          .replace(/(^|\s)\.dark\s+/g, "$1")
          .replace(/\s+/g, " ")
          .trim();
        if (!bare) continue; // a rule ON the root itself (html.dark) — it IS the clause, not a user of it
        const baseBody = baseBySelector.get(bare);
        for (const p of props(r.body)) {
          const declared = baseBody ? new RegExp(`(^|;)\\s*${p}\\s*:[^;]*light-dark\\(`, "m").test(baseBody) : false;
          if (!declared) unpaired.push(`${part.trim()} { ${p} } — no light-dark() for "${p}" on "${bare}"`);
        }
      }
    }
    expect(
      unpaired.sort(),
      "hand-written dark rules in app/globals.css that answer the class clause only, so a visitor on\n" +
        "a dark OS who has chosen no theme gets the LIGHT value. State the property with light-dark()\n" +
        "on the base rule:\n" +
        unpaired.sort().join("\n"),
    ).toEqual([]);

    // CONTROL. If the parse found no dark rules at all this passes vacuously, which is the exact
    // false all-clear the check exists to prevent.
    const darkRules = rules.filter((r) => /:where\(\.dark\)/.test(r.selector));
    expect(darkRules.length, "the parse found no :where(.dark) rules — it is not reading the file").toBeGreaterThan(8);
  });

  it("keeps the primitives themselves inside the system", () => {
    // The file everything else is converted ONTO cannot itself be off-system, and it was: three
    // `rounded-lg` in `Segmented`, `ClosePanel` and `NumberField`. A primitive that breaks the rule
    // teaches the rule is optional.
    const uiFile = stripComments(readFileSync(join(ROOT, "components/ui.tsx"), "utf8"));
    expect(uiFile.match(/rounded-lg/g) ?? [], "components/ui.tsx must not use rounded-lg").toHaveLength(0);
  });
});

/** `DESIGN.md` §10, for the one control the suite has a live reference implementation of.
 *
 *  §10 was prose with no assertion behind it for as long as it existed, which is how two tools in one
 *  family ended up rendering the same Ko-fi link two ways — an amber pill with a coffee cup on
 *  `motor.fusionspace.co`, a neutral grey `♥` here — until the owner said so from the outside
 *  (`ON-B1`). The alignment is cheap to make and cheap to lose, so both halves of it are pinned: the
 *  half that converges on the sibling, and the half that deliberately does NOT.
 */
describe("DESIGN.md §10 — one suite, one set of chrome", () => {
  const header = readFileSync(join(ROOT, "components/SiteHeader.tsx"), "utf8");
  const tokens = readFileSync(join(ROOT, "lib/ui-tokens.ts"), "utf8");

  it("keeps Loft's touch floor and focus ring on the suite's Tip control", () => {
    // The motor finder renders its tip pill at `px-2.5 py-1 text-xs` with neither a focus ring nor a
    // touch minimum — about 26 px against §8's 44 px floor — and Debrief's is `size="sm"`. Aligning
    // the GLYPH toward them must not drag the geometry along, and the only thing standing between
    // the two is that the link goes through `buttonClass` at its default size. Written as a source
    // assertion rather than a rendered one because the rendered height still passes on a fine
    // pointer, where `pointer-coarse:` does not apply — so a browser check would not see the loss.
    expect(header, "the Tip link must take its geometry from buttonClass, not a hand-rolled string")
      .toMatch(/className=\{buttonClass\(\)\}/);
    // And `buttonClass` must still be the thing that carries the two contracts. **Scoped to that
    // function's own body, which the first draft was not**: `TOUCH_TARGET,` appears twice in the file
    // — once in `buttonClass` and once in `navItemClass` — so a whole-file `toMatch` stayed green
    // with the floor deleted from the button, i.e. a check that could not fail for the regression it
    // names. §9 says that is worse than no check at all, because a session runs it and moves on.
    const buttonClassBody = tokens.slice(tokens.indexOf("export function buttonClass"));
    expect(buttonClassBody, "buttonClass must keep the focus-visible ring").toMatch(/focus-visible:outline-indigo-500/);
    expect(
      buttonClassBody.slice(0, buttonClassBody.indexOf("--- the workspace spine")),
      "buttonClass must keep the 44 px coarse-pointer floor",
    ).toMatch(/square \? TOUCH_TARGET_SQUARE : TOUCH_TARGET/);
  });

  it("draws the Tip control with the suite's coffee-cup glyph, which is what makes it recognisable", () => {
    // §10: the glyph is what converges, because it is what a flyer recognises and it costs the
    // colour system nothing. Both siblings draw this exact path; Loft carried a `♥` until
    // 2026-08-08. Asserted on the distinctive segment of the cup rather than the whole path, so a
    // re-indent or an added attribute does not fail it.
    expect(header, "the Tip control must carry the suite's coffee-cup glyph").toMatch(
      /M17 8h1a4 4 0 1 1 0 8h-1/,
    );
    // The siblings carry this sentence on a `title`; Loft may not — `e2e/touch.spec.ts` counts a
    // `title` whose text is not already on screen as a state a phone cannot reach, and holds that at
    // zero. So the sentence rides the accessible name alone, and BOTH halves are asserted: that it is
    // there, and that a `title` has not crept back onto the control beside it.
    expect(header, "the suite's tooltip sentence, carried by the accessible name").toMatch(
      /aria-label="Tip the project — buy me a coffee on Ko-fi"/,
    );
    expect(
      header.slice(header.indexOf("KOFI_URL"), header.indexOf("Docs")),
      "a `title` on the Tip control is a hover-only state — the accessible name carries it instead",
    ).not.toMatch(/title=/);
  });

  it("lets no chrome wear a semantic ramp", () => {
    // §2's amber means "an estimate outside its envelope, an extrapolation, a caveat" — a statement
    // about a VALUE, never about a control. **This has been broken once in this family and reverted,
    // which is why it is a check and not a note:** Debrief's Ko-fi link used to be amber "so it reads
    // as a tip jar", and `components/KofiButton.tsx` there records why that was wrong — every other
    // amber in either tree is a real caveat, so spending it on a tip jar in the persistent header
    // devalues the one signal the safety posture leans on.
    //
    // Counted on the chrome — the header, the footer and the workspace spine — not on the app, where
    // amber legitimately marks warnings on numbers.
    const chrome = ["components/SiteHeader.tsx", "components/Footer.tsx", "components/WorkspaceNav.tsx"];
    const wearing = chrome.flatMap((f) => {
      const src = readFileSync(join(ROOT, f), "utf8");
      return [
        ...(src.match(/\b(?:border|bg|text|ring)-(?:amber|red|emerald)-\d+/g) ?? []).map((m) => `${f}: ${m}`),
        ...(src.match(/variant[:=]\s*"(?:danger)"/g) ?? []).map((m) => `${f}: ${m}`),
      ];
    });
    expect(wearing, "semantic colour in the shared chrome").toEqual([]);
  });

  it("takes the theme control's accessible name from the reference implementation, unchanged", () => {
    // Measured against `motor.fusionspace.co`'s rendered markup on 2026-08-08: the two toggles
    // already agreed, down to this string. It is asserted so that a later run "aligning" `ON-B1`
    // cannot rewrite the half that was never divergent — which is the likeliest way this note gets
    // mis-served.
    const toggle = readFileSync(join(ROOT, "components/ThemeToggle.tsx"), "utf8");
    expect(toggle).toMatch(/Color theme: \$\{LABEL\[shown\]\}\. Click to change\./);
    expect(toggle, "the tri-state cycle and its icons are the sibling's").toMatch(
      /system: "◐", light: "☀", dark: "☾"/,
    );
  });
});
