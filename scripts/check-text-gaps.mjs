#!/usr/bin/env node
/** Find the spaces the JSX transform ate, in BOTH kinds of build output.
 *
 *  A JSX text run that spans a line break loses its LEADING space — including a space that sits
 *  mid-line in the source, once the run wraps. The source reads correctly, so lint, unit, build and
 *  e2e are all green on it, and the defect exists only after the transform. This repo has been bitten
 *  repeatedly, so the check lives here rather than in a session's memory. The fix in the source is to
 *  end the line with an explicit space expression rather than trusting the space.
 *
 *  TWO detectors, because there are two kinds of output and only one of them was ever looked at:
 *
 *  1. CLIENT CHUNKS — a rendered value followed immediately by a string literal opening with a whole
 *     lowercase word. That is the interpolation case: an expression, then text.
 *
 *  2. PRERENDERED HTML — a closing inline tag butted straight against a word. That is the ELEMENT
 *     case. Every route here is a static export, so the whole of `/docs` was invisible to detector 1,
 *     and the element form had accumulated freely there.
 *
 *  Run after a build: `node scripts/check-text-gaps.mjs`. Exits 1 on any hit, so it can gate once the
 *  count is zero. React's text-node separator comment is replaced with a space first: it delimits
 *  adjacent text nodes, and a space emitted as its own node sits beside one, which would otherwise
 *  read as a missing space.
 *
 *  **Confirm a hit in the rendered TEXT before fixing it.** Detector 1 in particular reads minified
 *  JavaScript, where an ordinary string concatenation can look like a glued sentence; it is a lead,
 *  not a verdict. Detector 2 reads real served markup and is the reliable one.
 */
import { readdirSync, readFileSync } from "node:fs";

const SEPARATOR = "<!" + "-- -->";

function filesUnder(root, ext, skip) {
  const out = [];
  (function walk(d) {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = `${d}/${f.name}`;
      if (f.isDirectory()) {
        if (!skip || !skip.test(p)) walk(p);
      } else if (f.name.endsWith(ext)) {
        out.push(p);
      }
    }
  })(root);
  return out;
}

const elementHits = [];
const chunkHits = [];

// 2. Prerendered pages: a closing inline tag, then a word. The reliable detector.
for (const f of filesUnder("out", ".html", /_next/)) {
  const s = readFileSync(f, "utf8").split(SEPARATOR).join(" ");
  const re = /<\/(em|strong|kbd|code|b|i|a|span|sub|sup)>([a-z]{2,}\s)/g;
  let m;
  while ((m = re.exec(s))) {
    elementHits.push({ f, text: s.slice(Math.max(0, m.index - 40), m.index + 45) });
  }
}

// 1. Client chunks: a rendered value, then a lowercase word. A lead rather than a verdict — see the
//    header. Reported separately so the two are never added into one misleading total.
for (const f of filesUnder("out/_next/static/chunks", ".js")) {
  const s = readFileSync(f, "utf8");
  const re = /([^"\\]),"([a-z]{2,}(?: [a-z]{2,}){1,4})/g;
  let m;
  while ((m = re.exec(s))) chunkHits.push({ f, text: m[0].slice(0, 70) });
}

for (const h of elementHits) console.log(`${h.f}  ...${h.text}...`);
console.log(`\nserved-markup gaps (detector 2, reliable): ${elementHits.length}`);
console.log(`client-chunk leads (detector 1, verify each in the rendered text): ${chunkHits.length}`);
if (elementHits.length) {
  console.log("\nFix in the SOURCE by ending the line with an explicit space expression rather than");
  console.log("trusting the space. The transform eats it, so the source reads correctly either way.");
}
// Only detector 2 gates. Detector 1 is noisy by construction and would make the exit code useless.
process.exit(elementHits.length ? 1 : 0);
