#!/usr/bin/env node
/** Every internal link resolves — in the built export, and in the markdown that describes it.
 *
 *  **P5's *done when* names "link-checking" as half of the milestone's pinning, and this is it.** Two
 *  claims, because there are two ways an internal link dies and only one of them is visible from
 *  inside the app:
 *
 *  1. **Every in-app link points at a document the export actually contains.** A route renamed or
 *     retired leaves anchors behind on pages that were not touched by the change — the docs hub
 *     links five pages, the footer links two more, and every one of them is a literal in a file
 *     nobody edits when a route moves.
 *  2. **Every relative link and image in the repository's markdown points at a file that exists.**
 *     The README shows the tool with images now, and a README image has no test and no 404 — it
 *     renders as a broken-image icon on the project's front page and nobody notices for a fortnight.
 *     `CHANGELOG.md` links the docs pages too.
 *
 *  **A postbuild script rather than a vitest test**, for the reason `scripts/check-routes.mjs` gives
 *  at length: `npm test` runs before `npm run build` in this repo's gate, so a test reading `out/`
 *  would either fail on a clean checkout or — worse — skip itself when the directory is absent, which
 *  prints almost exactly like a pass. This runs where the artifact definitely exists, and exits
 *  non-zero naming what is broken rather than just how many.
 *
 *  **External links are NOT fetched.** A build that fails because someone else's site is down is a
 *  build that teaches a session to ignore it, and this repo's whole safety net is that a red gate
 *  means something. Off-site rot is a real problem and it wants a scheduled check, not this one.
 *
 *  Run after a build: `node scripts/check-links.mjs`.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "out");

function walk(dir, hit, seen = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, hit, seen);
    else if (hit(e.name)) seen.push(p);
  }
  return seen;
}

const problems = [];

// ---- 1. in-app links, over the built export -------------------------------------------------
if (!existsSync(out)) {
  console.error("check-links: out/ is missing — run `npm run build` first.");
  process.exit(1);
}

const htmlFiles = walk(out, (n) => n.endsWith(".html"));

/** Does the export serve this path? `serve` maps `/x` to `out/x.html` or `out/x/index.html`, and the
 *  static export writes the directory form, so both are accepted. A path with an extension is an
 *  asset and is checked as a literal file. */
function servedByExport(p) {
  const clean = p.replace(/[?#].*$/, "").replace(/\/$/, "");
  if (clean === "") return existsSync(join(out, "index.html"));
  const asFile = join(out, clean);
  if (/\.[a-z0-9]+$/i.test(clean)) return existsSync(asFile);
  return existsSync(`${asFile}.html`) || existsSync(join(asFile, "index.html"));
}

const HREF = /(?:href|src)="([^"]+)"/g;
let inAppChecked = 0;
for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  for (const m of html.matchAll(HREF)) {
    const href = m[1];
    // Off-site, in-page, and non-navigational schemes are all out of scope — see the header.
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(href)) continue;
    if (!href.startsWith("/")) continue; // relative asset paths inside the export are emitted by the bundler
    inAppChecked++;
    if (!servedByExport(href)) {
      problems.push(`${file.slice(out.length + 1)} links ${href}, which the export does not serve`);
    }
  }
}

// ---- 2. relative links and images, over the repository's markdown ----------------------------
const MD = ["README.md", "CHANGELOG.md", "CONTRIBUTING.md", "SECURITY.md"].filter((f) =>
  existsSync(resolve(root, f)),
);
const MD_LINK = /!?\[[^\]]*\]\(([^)\s]+)\)|<img[^>]+src="([^"]+)"/g;
let mdChecked = 0;
for (const rel of MD) {
  const file = resolve(root, rel);
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(MD_LINK)) {
    const target = (m[1] ?? m[2]).replace(/[?#].*$/, "");
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target)) continue;
    mdChecked++;
    const abs = normalize(resolve(dirname(file), target));
    // Never let a link escape the repository — a `../` that climbs out is broken for every reader
    // who is not looking at a local checkout.
    if (!abs.startsWith(root)) {
      problems.push(`${rel} links ${target}, which is outside the repository`);
      continue;
    }
    if (!existsSync(abs)) {
      problems.push(`${rel} links ${target}, which does not exist`);
      continue;
    }
    if (statSync(abs).size === 0) problems.push(`${rel} links ${target}, which is empty`);
  }
}

console.log(
  `check-links: ${inAppChecked} in-app link(s) across ${htmlFiles.length} exported document(s), ` +
    `${mdChecked} relative link(s) across ${MD.length} markdown file(s)`,
);

// A check that examined nothing is a false all-clear, which is the specific failure this repo's
// notes warn about most often. Both halves must have had something to look at.
if (inAppChecked === 0) problems.push("no in-app links were checked at all — the scan found none, which cannot be right");
if (mdChecked === 0) problems.push("no relative markdown links were checked at all");

if (problems.length) {
  console.error(`check-links: ${problems.length} broken link(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("check-links: no broken internal links");
