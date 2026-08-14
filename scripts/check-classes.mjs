#!/usr/bin/env node
/** Assert that every class the site SERVES has a rule behind it in the stylesheet it serves.
 *
 *  **This exists because the gate let a visible regression through, on every route, while green.**
 *  Measured 2026-08-13: `components/SiteHeader.tsx` was rewritten from a string literal to a template
 *  literal, and its last class — the `md:` breakpoint variant that sizes the wordmark on desktop —
 *  landed immediately before the `${` interpolation boundary. Tailwind v4 extracts candidates from
 *  raw source text, so it stopped seeing that literal; the header is the only use of the utility in
 *  the tree, so the rule was never generated. The class went on shipping in the served `class`
 *  attribute with nothing behind it, and the desktop wordmark silently dropped from 30 px to 20 px on
 *  every page.
 *
 *  **This docblock deliberately does NOT spell that utility out, and the reason is the sharpest part
 *  of the whole finding.** Tailwind scans prose as readily as code, so naming a class in a comment
 *  GENERATES it. Two attempts to reproduce the bug above failed and very nearly retracted a correct
 *  diagnosis as unreproducible — because the fix's own explanatory comment named the class, and then
 *  this script's first docblock named it again, and each was quietly recreating the rule whose
 *  absence was the bug. `MAINTAINING.md` records this hazard for markdown; `app/globals.css`
 *  excludes `*.md` and test files for it. It applies to every scanned file, `.tsx` comments and
 *  `.mjs` docblocks included. Describe a class here; do not write it.
 *
 *  `npm run lint` passed. `npm test` passed, 1254 tests. `npm run build` succeeded. The e2e suite
 *  passed 268 tests, including the ones that measure that very header — because they run at a phone
 *  viewport, where the `md:` variant does not apply. **Nothing in the gate compared the classes in
 *  the HTML against the rules in the CSS**, so a whole category of regression was invisible: the
 *  class is present, the element is present, the test that reads the DOM is happy, and the pixel is
 *  wrong.
 *
 *  It is a category rather than one bug. Anything that breaks Tailwind's source scanner produces it —
 *  an interpolation boundary, a class built by concatenation, a name assembled from a variable, a
 *  utility moved to a file outside the `@source` globs. Each is invisible in exactly the same way,
 *  and `app/globals.css` already carries `@source not "../**\/*.md"`, so the scanner's reach is a
 *  thing this repo tunes and can therefore mis-tune.
 *
 *  **A postbuild script rather than a vitest test**, for the reason `check-routes.mjs` gives at
 *  length: `npm test` runs before `npm run build`, so a test reading `out/` would either fail on a
 *  clean checkout or skip itself when the directory is absent — and a suite that skips prints almost
 *  exactly like one that passed, which is the false all-clear this repo keeps warning about.
 *
 *  **How it decides.** It reads the class selectors that EXIST in the built stylesheet by scanning
 *  selector context only (the text before each `{`), unescaping Tailwind's `\:` / `\[` / `\.` as it
 *  goes, then walks every served document and reports any class token that is not among them. Doing
 *  it in that direction — collect what the CSS defines, then subtract — rather than escaping each
 *  HTML token and grepping for it, means the escaping rules live in one place and a new special
 *  character cannot silently produce a false pass.
 *
 *  Run after a build: `node scripts/check-classes.mjs`. Prints the counts and exits 1 on any class
 *  with no rule, naming the class and the first document it appears in.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "out");

if (!existsSync(out)) {
  console.error("check-classes: out/ not found — run this after `npm run build`.");
  process.exit(1);
}

/** Classes that legitimately carry no rule of their own. Each is a MARKER read by another selector
 *  or by script, not a utility — so "no rule" is correct for it and always will be. Kept as an
 *  explicit list rather than a pattern: a pattern would grow to cover the next real defect. */
const MARKERS = new Set([
  // Tailwind's variant markers. `group`/`peer` are targets for `group-*:`/`peer-*:` and emit nothing
  // themselves; `dark` is the class clause of this repo's two-clause dark variant.
  "group",
  "peer",
  "dark",
  // Set by `next/font` on <html>; the rule lives in an inline <style> block, not the stylesheet.
  "__variable_ea5f4b",
  "__className_ea5f4b",
]);

function walk(dir, hit, pred) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, hit, pred);
    else if (pred(name)) hit.push(p);
  }
}

/** Every class selector the stylesheet defines. Scans SELECTOR CONTEXT only — the text before each
 *  `{` — so a decimal in a declaration value (`0.5rem`) cannot be mistaken for a class and mask a
 *  real miss. Unescapes as it reads, so an escaped selector yields the plain class name. */
function definedClasses(css) {
  const found = new Set();
  for (const chunk of css.split("{")) {
    // The selector list is the tail of the chunk, after the previous rule's closing brace.
    const sel = chunk.slice(chunk.lastIndexOf("}") + 1);
    for (let i = 0; i < sel.length; i++) {
      if (sel[i] !== ".") continue;
      let name = "";
      let j = i + 1;
      while (j < sel.length) {
        const c = sel[j];
        if (c === "\\" && j + 1 < sel.length) {
          // **CSS has TWO escape forms and only handling one produces a confident false report.**
          // A class may not begin with a digit unescaped, so Tailwind writes `2xl:…` as
          // `.\32 xl\:…` — a HEX escape, up to six digits, terminated by an optional single space
          // that is part of the escape rather than part of the selector. Reading it as the literal
          // characters `3` and `2` yields "32", and this script's first run duly reported the
          // app's own 2xl max-width utility as having no rule when the rule was right there. A checker that
          // cries wolf on its first run is worse than no checker, which is why this is spelled out.
          const hex = /^[0-9a-fA-F]{1,6}/.exec(sel.slice(j + 1));
          if (hex) {
            name += String.fromCodePoint(parseInt(hex[0], 16));
            j += 1 + hex[0].length;
            if (sel[j] === " ") j++; // the escape's own terminator, not a selector boundary
            continue;
          }
          name += sel[j + 1];
          j += 2;
          continue;
        }
        if (/[A-Za-z0-9_-]/.test(c)) {
          name += c;
          j++;
          continue;
        }
        break;
      }
      if (name) found.add(name);
      i = j - 1;
    }
  }
  return found;
}

const cssFiles = [];
walk(out, cssFiles, (n) => n.endsWith(".css"));
const defined = new Set();
for (const f of cssFiles) for (const c of definedClasses(readFileSync(f, "utf8"))) defined.add(c);

const htmlFiles = [];
walk(out, htmlFiles, (n) => n.endsWith(".html"));

const missing = new Map(); // class -> first document it appears in
let tokens = 0;
for (const f of htmlFiles) {
  const html = readFileSync(f, "utf8");
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    for (const raw of m[1].split(/\s+/)) {
      // Server-rendered markup carries HTML entities; a class attribute written through JSX can hold
      // `&quot;` and friends. Only `&amp;` can appear inside a class token in practice.
      const cls = raw.replace(/&amp;/g, "&").trim();
      if (!cls) continue;
      tokens++;
      if (defined.has(cls) || MARKERS.has(cls)) continue;
      if (!missing.has(cls)) missing.set(cls, relative(out, f));
    }
  }
}

console.log(
  `check-classes: ${tokens} class use(s) across ${htmlFiles.length} document(s), against ${defined.size} selector(s) in ${cssFiles.length} stylesheet(s)`,
);

// **A pass over nothing is the failure this whole milestone is named after, and this script shipped
// without the guard against it** — the only one of the five postbuild checks missing it, in the
// increment that introduced the milestone about instruments that certify nothing. With no documents
// or no stylesheet, `tokens` is 0, `missing` is empty, and it prints "every served class has a rule"
// and exits 0. `check-links.mjs` refuses the same shape in the same words. The floors are an order of
// magnitude below the real figures (6,163 uses across 14 documents against 500 selectors), so they
// catch an empty or truncated export without becoming a ratchet on every legitimate addition.
if (!htmlFiles.length || !cssFiles.length || tokens < 100 || defined.size < 50) {
  console.error(
    "check-classes: this examined almost nothing, which cannot be right — " +
      `${htmlFiles.length} document(s), ${cssFiles.length} stylesheet(s), ${tokens} class use(s), ${defined.size} selector(s). ` +
      "A pass over an empty or partial export is the false all-clear, not a result.",
  );
  process.exit(1);
}

if (missing.size) {
  console.error(`check-classes: ${missing.size} class(es) served with NO rule behind them:`);
  for (const [cls, where] of [...missing].sort()) console.error(`  ${cls}  (first seen in ${where})`);
  console.error(
    "\nA class in the markup with no rule in the stylesheet is a style that silently does nothing.\n" +
      "The usual cause is Tailwind's source scanner failing to see the literal: a class sitting\n" +
      "immediately before a `${` interpolation, or built by concatenation, or in a file the\n" +
      "`@source` globs exclude. Write the class as a plain literal. If it is genuinely a marker\n" +
      "read by another selector, add it to MARKERS in this script with the reason.",
  );
  process.exit(1);
}
console.log("check-classes: every served class has a rule");
