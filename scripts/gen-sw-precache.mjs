// Inject the offline precache manifest into the built service worker (out/sw.js).
//
// Loft is offline-first: the whole simulation runs client-side, so once loaded it must
// work at the pad with no signal. That requires the service worker to precache the app's
// JS/CSS/font build output — on a first visit those chunks load via <script>/<link> tags
// before the worker is installed and controlling, so the runtime stale-while-revalidate
// never sees them and they'd otherwise never be cached. A returning offline visitor would
// then get the shell HTML with no way to hydrate: a dead page.
//
// The chunk filenames carry per-build content hashes, so public/sw.js can't list them
// statically. This postbuild step enumerates out/_next/static/**, injects the list in
// place of the `// __BUILD_ASSETS__` marker, and stamps a build id (a hash of that list)
// into the `// __BUILD_ID__` marker so each deploy lands in a fresh, versioned cache and
// the worker's bytes change whenever an asset does (which is what makes the in-app update
// prompt fire). Deterministic: identical output → identical build id → identical bytes.
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

// Every shipped JS/CSS/font asset, as a root-relative URL, sorted for a stable build id.
const assets = (await walk(staticDir))
  .map((f) => "/" + f.slice(out.length + 1).split("\\").join("/"))
  .sort();

if (assets.length === 0) throw new Error("gen-sw-precache: no assets found under out/_next/static");

const buildId = createHash("sha1").update(assets.join("\n")).digest("hex").slice(0, 12);

let sw = await readFile(swPath, "utf8");

const idMarker = 'const BUILD_ID = "dev"; // __BUILD_ID__';
if (!sw.includes(idMarker)) throw new Error(`gen-sw-precache: build-id marker not found in ${swPath}`);
sw = sw.replace(idMarker, `const BUILD_ID = "${buildId}"; // __BUILD_ID__`);

const assetsMarker = "  // __BUILD_ASSETS__";
if (!sw.includes(assetsMarker)) throw new Error(`gen-sw-precache: assets marker not found in ${swPath}`);
sw = sw.replace(assetsMarker, assets.map((a) => `  ${JSON.stringify(a)},`).join("\n"));

await writeFile(swPath, sw);
console.log(`gen-sw-precache: precached ${assets.length} assets, build ${buildId}`);
