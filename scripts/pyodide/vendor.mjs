/** Vendor the self-hosted Pyodide + RocketPy runtime into public/pyodide/.
 *
 *  The in-browser RocketPy second solver must not touch a CDN at runtime — Loft is private and
 *  offline-first, so every byte the worker loads is served from Loft's own origin. This script
 *  assembles that byte set once, from pinned sources:
 *    - the Pyodide runtime + the compiled science wheels (numpy/scipy/matplotlib/cftime + deps),
 *      resolved as the dependency closure of a small set of roots from Pyodide's own lock file,
 *      fetched from the pinned Pyodide CDN;
 *    - RocketPy's three pure-python wheels that Pyodide doesn't carry (rocketpy, simplekml, dill),
 *      fetched from PyPI;
 *    - the shared flight routine (scripts/rocketpy/fly.py), copied verbatim so the browser flies
 *      exactly what the dev harness flies;
 *    - a manifest.json the worker reads to know the PyPI wheel filenames.
 *
 *  Output is git-ignored (~40 MB). Re-run to refresh:  node scripts/pyodide/vendor.mjs
 *  Network is needed once (Pyodide CDN + PyPI). Behind Loft's agent proxy, run with
 *  NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt.
 */
import { mkdirSync, writeFileSync, copyFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = resolve(REPO, "public/pyodide");

// Pinned runtime. Bump deliberately (and re-validate RocketPy) — the browser engine is only as
// reproducible as these pins. 314.0.2 ships Python 3.14 + numpy 2.x (RocketPy 1.12 needs
// numpy.trapezoid, i.e. numpy ≥ 2.0).
const PYODIDE_VERSION = "314.0.2";
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full`;
const CORE_FILES = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
// The Pyodide packages the worker asks for by name; their full dependency closure is resolved from
// the lock so every transitive wheel is vendored too.
const DIST_ROOTS = ["numpy", "scipy", "matplotlib", "cftime", "micropip", "requests", "pytz"];
// RocketPy's pure-python deps Pyodide doesn't distribute. rocketpy 1.12.1 is the version the
// cross-check reference was generated with; simplekml ships an sdist only, so `pip wheel` builds
// it. All three are pure-python (py3-none-any), so a host-built wheel runs unchanged under WASM.
const PIP_SPECS = ["rocketpy==1.12.1", "simplekml", "dill"];

async function fetchBuf(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Fetch → save, skipping a file already present (idempotent; re-runs don't re-download ~40 MB). */
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

/** Build/download the pure-python PyPI wheels with pip (handles simplekml's sdist-only release),
 *  returning their filenames. Idempotent: skips if all three are already present. */
function pipWheels() {
  const existing = readdirSync(OUT).filter((f) => f.endsWith(".whl"));
  const want = PIP_SPECS.map((s) => s.split("==")[0].replace(/-/g, "_"));
  const found = want.map((n) => existing.find((f) => f.toLowerCase().startsWith(n + "-")));
  if (found.every(Boolean)) return found;
  execFileSync("python3", ["-m", "pip", "wheel", "--no-deps", "-w", OUT, ...PIP_SPECS], { stdio: "inherit" });
  return want.map((n) => readdirSync(OUT).find((f) => f.toLowerCase().startsWith(n + "-") && f.endsWith(".whl")));
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

  const pypiWheels = pipWheels();
  for (const w of pypiWheels) {
    total += statSync(resolve(OUT, w)).size;
    console.log(`  pypi   ${w}`);
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

  console.log(`Done: ${CORE_FILES.length} core + ${dist.length} wheels + ${pypiWheels.length} PyPI, ${mb(total)} total.`);
  if (!existsSync(resolve(OUT, "manifest.json"))) throw new Error("manifest not written");
}

main().catch((e) => {
  console.error("vendor failed:", e.message);
  process.exit(1);
});
