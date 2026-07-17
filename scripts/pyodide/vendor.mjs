/** Vendor the self-hosted Pyodide + RocketPy runtime into public/pyodide/.
 *
 *  The in-browser RocketPy second solver must not touch a CDN at runtime — Loft is private and
 *  offline-first, so every byte the worker loads is served from Loft's own origin. This script
 *  assembles that byte set from pinned sources:
 *    - the Pyodide runtime + the compiled science wheels (numpy/scipy/matplotlib/cftime + deps),
 *      resolved as the dependency closure of a small set of roots from Pyodide's own lock file,
 *      fetched from the pinned Pyodide CDN;
 *    - RocketPy + dill (pure-python wheels Pyodide doesn't distribute), fetched from PyPI;
 *    - simplekml (PyPI ships it as an sdist only, with no wheel), from a committed pre-built wheel
 *      in scripts/pyodide/wheels/ — so this whole step needs only Node + network, never Python/pip
 *      (the production build image can't be assumed to have them);
 *    - the shared flight routine (scripts/rocketpy/fly.py), copied verbatim so the browser flies
 *      exactly what the dev harness flies;
 *    - a manifest.json the worker reads to know the PyPI wheel filenames.
 *
 *  Runs in the production build (prebuild) as well as by hand. Output is git-ignored (~40 MB);
 *  it is fetched fresh each build. Behind Loft's agent proxy, run with
 *  NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt.
 */
import { mkdirSync, writeFileSync, copyFileSync, existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = resolve(REPO, "public/pyodide");
const WHEELS = resolve(HERE, "wheels"); // committed pre-built wheels (simplekml)

// Pinned runtime. Bump deliberately (and re-validate RocketPy) — the browser engine is only as
// reproducible as these pins. 314.0.2 ships Python 3.14 + numpy 2.x (RocketPy 1.12 needs
// numpy.trapezoid, i.e. numpy ≥ 2.0).
const PYODIDE_VERSION = "314.0.2";
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full`;
const CORE_FILES = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
// The Pyodide packages the worker asks for by name; their full dependency closure is resolved from
// the lock so every transitive wheel is vendored too.
const DIST_ROOTS = ["numpy", "scipy", "matplotlib", "cftime", "micropip", "requests", "pytz"];
// RocketPy's pure-python deps Pyodide doesn't distribute, from PyPI wheels. rocketpy is pinned to
// the version the cross-check reference was generated with.
const PYPI = [
  { name: "rocketpy", version: "1.12.1" },
  { name: "dill", version: null },
];
// simplekml has no PyPI wheel (sdist only), so its wheel is pre-built and committed here.
const COMMITTED_WHEELS = ["simplekml-1.3.6-py3-none-any.whl"];

async function fetchBuf(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (i >= tries) throw new Error(`fetch ${url} → ${e.message}`);
      await new Promise((r) => setTimeout(r, 500 * 2 ** (i - 1))); // 0.5s, 1s, 2s
    }
  }
}

/** Fetch → save, skipping a file already present (idempotent for by-hand re-runs). */
async function fetchInto(name, url) {
  const dest = resolve(OUT, name);
  if (existsSync(dest) && statSync(dest).size > 0) return statSync(dest).size;
  const buf = await fetchBuf(url);
  writeFileSync(dest, buf);
  return buf.length;
}

function mb(bytes) {
  return (bytes / 1048576).toFixed(1) + " MB";
}

/** Transitive closure of DIST_ROOTS over the lock's `depends` graph. */
function distClosure(lock) {
  const byName = new Map(Object.values(lock.packages).map((p) => [p.name, p]));
  const norm = (n) => n.toLowerCase().replace(/-/g, "_");
  const find = (n) => byName.get(n) ?? [...byName.values()].find((p) => norm(p.name) === norm(n));
  const seen = new Map();
  const stack = [...DIST_ROOTS];
  while (stack.length) {
    const p = find(stack.pop());
    if (!p || seen.has(p.name)) continue;
    seen.set(p.name, p);
    for (const d of p.depends ?? []) stack.push(d);
  }
  return [...seen.values()];
}

/** The py3-none-any wheel for a PyPI project (requested version, or newest). */
async function pypiWheel({ name, version }) {
  const meta = JSON.parse((await fetchBuf(`https://pypi.org/pypi/${name}/json`)).toString());
  const ver = version ?? meta.info.version;
  const files = meta.releases[ver];
  if (!files) throw new Error(`${name} ${ver} not found on PyPI`);
  const wheel = files.find((f) => f.packagetype === "bdist_wheel" && f.filename.endsWith("-none-any.whl"));
  if (!wheel) throw new Error(`${name} ${ver} has no pure-python wheel`);
  return { filename: wheel.filename, url: wheel.url };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  let total = 0;

  console.log(`Vendoring Pyodide v${PYODIDE_VERSION} runtime + RocketPy into ${OUT}`);
  for (const f of CORE_FILES) {
    total += await fetchInto(f, `${PYODIDE_BASE}/${f}`);
    console.log(`  core   ${f}`);
  }

  const lock = JSON.parse((await fetchBuf(`${PYODIDE_BASE}/pyodide-lock.json`)).toString());
  const dist = distClosure(lock);
  for (const p of dist) {
    total += await fetchInto(p.file_name, `${PYODIDE_BASE}/${p.file_name}`);
    console.log(`  wheel  ${p.file_name}`);
  }

  const pypiWheels = [];
  for (const spec of PYPI) {
    const w = await pypiWheel(spec);
    total += await fetchInto(w.filename, w.url);
    pypiWheels.push(w.filename);
    console.log(`  pypi   ${w.filename}`);
  }
  for (const w of COMMITTED_WHEELS) {
    if (!existsSync(resolve(WHEELS, w))) throw new Error(`committed wheel missing: scripts/pyodide/wheels/${w}`);
    copyFileSync(resolve(WHEELS, w), resolve(OUT, w));
    total += statSync(resolve(OUT, w)).size;
    pypiWheels.push(w);
    console.log(`  local  ${w}`);
  }

  // The shared flight routine, verbatim — the browser flies exactly what run_rocketpy.py flies.
  const flySrc = resolve(REPO, "scripts/rocketpy/fly.py");
  copyFileSync(flySrc, resolve(OUT, "fly.py"));
  total += statSync(flySrc).size;
  console.log("  copy   fly.py");

  const manifest = {
    pyodideVersion: PYODIDE_VERSION,
    indexUrl: "/pyodide/",
    distRoots: DIST_ROOTS,
    pypiWheels,
    flyPy: "fly.py",
    note: "Generated by scripts/pyodide/vendor.mjs — do not edit. Git-ignored; re-run to refresh.",
  };
  writeFileSync(resolve(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`  write  manifest.json`);

  const wheelCount = dist.length + pypiWheels.length;
  console.log(`Done: ${CORE_FILES.length} core + ${wheelCount} wheels, ${mb(total)} total.`);
  if (!existsSync(resolve(OUT, "manifest.json"))) throw new Error("manifest not written");
}

main().catch((e) => {
  console.error("vendor failed:", e.message);
  process.exit(1);
});
