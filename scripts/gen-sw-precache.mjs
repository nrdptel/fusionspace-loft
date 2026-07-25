// Inject the offline precache manifest into the built service worker (out/sw.js).
//
// Loft is offline-first: the whole simulation runs client-side, so once loaded it must
// work at the pad with no signal. That requires the service worker to precache the app's
// JS/CSS/font build output — on a first visit those chunks load via <script>/<link> tags
// before the worker is installed and controlling, so the runtime stale-while-revalidate
// never sees them and they'd otherwise never be cached. A returning offline visitor would
// then get the shell HTML with no way to hydrate: a dead page.
//
// It also enumerates the prerendered routes, so /docs/limitations offline is the limitations
// log rather than the landing page served under someone else's URL. Those pages are the ones
// that say how far to trust a number, and the pad is where that gets asked.
//
// The chunk filenames carry per-build content hashes, so public/sw.js can't list them
// statically. This postbuild step enumerates out/_next/static/** and out/**/*.html, injects
// the two lists in place of the `// __BUILD_ASSETS__` and `// __BUILD_ROUTES__` markers, and
// stamps a build id into the `// __BUILD_ID__` marker so each deploy lands in a fresh,
// versioned cache and the worker's bytes change whenever anything served changes (which is
// what makes the in-app update prompt fire). The id hashes the asset list AND the contents of
// every route's HTML — a docs edit that touches no hashed chunk still has to invalidate the
// cache, or an offline reader keeps the old copy indefinitely.
// Deterministic: identical output → identical build id → identical bytes.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "out");
const swPath = resolve(out, "sw.js");
const staticDir = resolve(out, "_next/static");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = resolve(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

const rel = (f) => "/" + f.slice(out.length + 1).split("\\").join("/");

// Every shipped JS/CSS/font asset, as a root-relative URL, sorted for a stable build id.
const assets = (await walk(staticDir)).map(rel).sort();

if (assets.length === 0) throw new Error("gen-sw-precache: no assets found under out/_next/static");

// Every prerendered route, as the path a visitor navigates to: out/index.html -> "/",
// out/docs.html -> "/docs", out/docs/methods.html -> "/docs/methods". The error pages are
// excluded — 404.html is the host's, and _not-found is Next's internal route for it; neither
// is somewhere a visitor goes, and the worker already answers an uncached route with the shell.
// Vendored payloads (the Pyodide runtime) ship HTML of their own that is not a route.
const ERROR_PAGES = new Set(["/404.html", "/_not-found.html"]);
const NOT_A_ROUTE = /^\/(?:_next|pyodide)\//;
const pages = (await walk(out))
  .map(rel)
  .filter((p) => p.endsWith(".html") && !ERROR_PAGES.has(p) && !NOT_A_ROUTE.test(p))
  .sort();
const routes = pages.map((p) => (p === "/index.html" ? "/" : p.slice(0, -".html".length)));

if (!routes.includes("/")) throw new Error("gen-sw-precache: no index.html found in out/");

// The id has to change whenever anything served changes, not just when a hashed chunk does:
// a docs rewrite touches only HTML, and an unchanged id would leave offline readers on the
// old copy for good. Hash the asset list plus each route's actual bytes.
const pageHashes = await Promise.all(
  pages.map(async (p) => createHash("sha1").update(await readFile(resolve(out, p.slice(1)))).digest("hex")),
);
const buildId = createHash("sha1")
  .update([...assets, ...routes.map((r, i) => `${r} ${pageHashes[i]}`)].join("\n"))
  .digest("hex")
  .slice(0, 12);

let sw = await readFile(swPath, "utf8");

const inject = (marker, list) => {
  if (!sw.includes(marker)) throw new Error(`gen-sw-precache: marker ${marker.trim()} not found in ${swPath}`);
  sw = sw.replace(marker, list.map((a) => `  ${JSON.stringify(a)},`).join("\n"));
};

const idMarker = 'const BUILD_ID = "dev"; // __BUILD_ID__';
if (!sw.includes(idMarker)) throw new Error(`gen-sw-precache: build-id marker not found in ${swPath}`);
sw = sw.replace(idMarker, `const BUILD_ID = "${buildId}"; // __BUILD_ID__`);

inject("  // __BUILD_ASSETS__", assets);
// "/" is already in the worker's list as the shell; don't precache it twice.
inject("  // __BUILD_ROUTES__", routes.filter((r) => r !== "/"));

await writeFile(swPath, sw);
console.log(
  `gen-sw-precache: precached ${assets.length} assets and ${routes.length} routes, build ${buildId}`,
);
