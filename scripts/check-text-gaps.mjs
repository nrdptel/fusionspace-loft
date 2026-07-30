#!/usr/bin/env node
/** Find spaces JSX ate, in BOTH kinds of build output.
 *
 *  A JSX text run that spans a line break loses its leading space — including a space that sits mid-line in
 *  the source, once the run wraps. The source reads correctly, so lint, unit, build and e2e are all green on
 *  it; the defect only exists after the transform. This repo has been bitten repeatedly, so the check lives
 *  here rather than in a session's memory.
 *
 *  TWO detectors, because there are two kinds of output and the older one could only see the first:
 *
 *  1. CLIENT CHUNKS — a rendered value followed immediately by a string literal opening with a whole
 *     lowercase word. That is the interpolation case: `{expr}` and then text.
 *
 *  2. PRERENDERED HTML — a closing inline tag butted straight against a word, as in `</em>slides`. That is
 *     the element case. Every route here is a static export, so the whole of `/docs` was invisible to
 *     detector 1 — and 80 live instances had accumulated there by the time this was added.
 *
 *  Run after a build: `node scripts/check-text-gaps.mjs`. Exits 1 when anything is found, so it can gate.
 *  React's text-node separator comment is replaced with a space first: it delimits adjacent text nodes, and
 *  a space emitted as its own node sits beside it, which would otherwise read as a missing space.
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

const hits = [];

// 1. Client chunks: a rendered value, then a lowercase word.
for (const f of filesUnder("out/_next/static/chunks", ".js")) {
  const s = readFileSync(f, "utf8");
  const re = /([^"\\]),"([a-z]{2,}(?: [a-z]{2,}){1,4})/g;
  let m;
  while ((m = re.exec(s))) hits.push({ f, text: m[0].slice(0, 70) });
}

// 2. Prerendered pages: a closing inline tag, then a word.
for (const f of filesUnder("out", ".html", /_next/)) {
  const s = readFileSync(f, "utf8").split(SEPARATOR).join(" ");
  const re = /<\/(em|strong|kbd|code|b|i|a|span|sub|sup)>([a-z]{2,}\s)/g;
  let m;
  while ((m = re.exec(s))) {
    hits.push({ f, text: s.slice(Math.max(0, m.index - 40), m.index + 45) });
  }
}

for (const h of hits) console.log(`${h.f}  ...${h.text}...`);
console.log(`\ntext-gap check: ${hits.length} hit(s)`);
if (hits.length) {
  console.log('Fix in the SOURCE by ending the line with {" "} rather than trusting the space.');
  console.log("The transform eats it, so the source reads correctly either way.");
}
process.exit(hits.length ? 1 : 0);
