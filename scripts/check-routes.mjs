#!/usr/bin/env node
/** Assert that the routes `lib/workspaces.ts` promises are actually in the static export.
 *
 *  P2's *done when* asks for "e2e over each route plus a static-export assertion", and this is that
 *  second half. The e2e half proves a workspace BEHAVES; this proves the artifact exists at all — a
 *  different failure, and one the e2e suite structurally cannot see, because it drives a served copy
 *  of whatever `out/` happens to contain rather than checking that `out/` contains what the app
 *  claims. A workspace deleted from the router but left in the vocabulary would serve the shell for
 *  its address and pass every behavioural test.
 *
 *  **A postbuild script rather than a vitest test, deliberately.** `npm test` runs before `npm run
 *  build` in this repo's gate, so a test reading `out/` would either fail on a clean checkout or —
 *  far worse — skip itself when the directory is absent. A suite that skips prints almost exactly
 *  like one that passed, which is the specific false all-clear `MAINTAINING.md` warns about. This
 *  runs where the artifact definitely exists and exits non-zero, so it gates the build itself, in CI
 *  and locally, with nothing to skip.
 *
 *  Four claims, each of which has a way of quietly becoming false:
 *
 *  1. **Every workspace has a document.** Adding one to `WORKSPACES` without adding its `page.tsx`
 *     puts a dead link on the navigation spine.
 *  2. **Every retired workspace still answers.** An address that shipped once is in somebody's
 *     history; letting it 404 is a one-way door for whoever follows it. `/analyze` was live for part
 *     of one day and is already load-bearing for that reason.
 *  3. **No workspace is in the sitemap.** Their content is the flyer's own design, held on their own
 *     device, so the prerendered document is empty by construction — advertising them to a crawler
 *     promises something the page cannot keep.
 *  4. **Every workspace document says `noindex`.** The same claim as (3), made where a crawler that
 *     arrives by a link rather than by the sitemap will actually read it.
 *
 *  Run after a build: `node scripts/check-routes.mjs`. Prints one line per claim and exits 1 on any
 *  failure, naming what is missing rather than just the count.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "out");

if (!existsSync(out)) {
  console.error("check-routes: out/ not found — run this after `npm run build`");
  process.exit(1);
}

/** The vocabulary, read from the source of truth rather than restated here.
 *
 *  Parsed rather than imported because this is a plain Node script and the module is TypeScript.
 *  The regexes are deliberately narrow and the script fails loudly if either finds nothing — a
 *  permissive parse that silently yields an empty list would turn every assertion below into a
 *  vacuous pass over zero routes, which is the failure this whole file exists to prevent. */
const source = readFileSync(resolve(root, "lib/workspaces.ts"), "utf8");

const live = [...(source.match(/export const WORKSPACES = \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([a-z-]+)"/g)].map(
  (m) => m[1],
);
if (live.length === 0) throw new Error("check-routes: could not read WORKSPACES from lib/workspaces.ts");

const retired = [...(source.match(/const RETIRED: Record<string, Workspace> = \{([^}]*)\}/)?.[1] ?? "").matchAll(
  /(\w+):\s*"/g,
)].map((m) => m[1]);

/** A route's prerendered document. A static export writes both `out/x.html` and `out/x/index.html`
 *  depending on the host convention, so accept either — the claim is that the route was exported,
 *  not which shape the exporter chose. */
const documentFor = (route) => {
  for (const p of [`${route}.html`, `${route}/index.html`]) {
    const full = resolve(out, p);
    if (existsSync(full)) return { path: p, html: readFileSync(full, "utf8") };
  }
  return null;
};

const failures = [];

// 1. every workspace has a document
const missing = live.filter((w) => !documentFor(w));
if (missing.length) failures.push(`workspace routes missing from the export: ${missing.join(", ")}`);

// 2. every retired workspace still answers, so an old link is not a dead end
const goneRetired = retired.filter((w) => !documentFor(w));
if (goneRetired.length) {
  failures.push(`retired workspace addresses that would now 404: ${goneRetired.join(", ")}`);
}

// 3. no workspace is advertised in the sitemap
const sitemap = existsSync(resolve(out, "sitemap.xml")) ? readFileSync(resolve(out, "sitemap.xml"), "utf8") : "";
if (!sitemap) failures.push("sitemap.xml is missing from the export");
const advertised = [...live, ...retired].filter((w) => sitemap.includes(`/${w}<`) || sitemap.includes(`/${w}/<`));
if (advertised.length) failures.push(`workspace routes advertised in the sitemap: ${advertised.join(", ")}`);

// 4. …and each says so itself, for a crawler that arrived by a link
const indexable = [];
for (const w of [...live, ...retired]) {
  const doc = documentFor(w);
  if (doc && !/name="robots"[^>]*content="[^"]*noindex/.test(doc.html)) indexable.push(w);
}
if (indexable.length) failures.push(`workspace documents without a noindex robots tag: ${indexable.join(", ")}`);

// The control: the ROOT is a real page and must be indexable, so a bug that marked everything
// noindex — or a parse that returned nothing and made claims 3 and 4 vacuous — fails here.
const home = documentFor("index");
if (!home) failures.push("no index.html in the export");
else if (/name="robots"[^>]*content="[^"]*noindex/.test(home.html)) {
  failures.push("the home page is marked noindex, which cannot be right");
}
if (!sitemap.includes("<loc>") || !/\/docs\b/.test(sitemap)) {
  failures.push("the sitemap advertises no docs route — it is empty or malformed");
}

console.log(
  `check-routes: ${live.length} workspace routes exported (${live.join(", ")}), ` +
    `${retired.length} retired address${retired.length === 1 ? "" : "es"} still answering ` +
    `(${retired.join(", ") || "none"}), none indexed`,
);

if (failures.length) {
  for (const f of failures) console.error(`check-routes: ${f}`);
  process.exit(1);
}
