/** Run RocketPy under Pyodide (CPython-in-WASM) on a Loft-emitted spec — the proof and seed for
 *  the in-browser RocketPy second solver.
 *
 *  This loads the SHARED flight routine (../fly.py) into the WASM filesystem and calls fly(spec),
 *  so what runs here is byte-for-byte what the native dev harness (run_rocketpy.py) runs and what
 *  the browser worker will run. It confirms two things: (1) RocketPy imports and flies under
 *  Pyodide at all, and (2) its numbers match native RocketPy.
 *
 *  Dev-only — like run_rocketpy.py, this is not shipped and not in CI. It needs the `pyodide` npm
 *  package (`npm i -D pyodide` in this directory) and network access the first time to fetch the
 *  Python wheels from the Pyodide CDN. See README.md for the full recipe and the packaging notes
 *  the shipped browser build will follow (self-hosted wheels, no CDN, lazy-loaded).
 *
 *  Usage:  node run_pyodide.mjs [path/to/design.spec.json]   (default: ../out/demo-single-deploy.spec.json)
 */
import { loadPyodide } from "pyodide";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const specPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(HERE, "../out/demo-single-deploy.spec.json");
const flyPath = resolve(HERE, "../fly.py");

const t0 = Date.now();
const log = (m) => console.error(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

const spec = JSON.parse(readFileSync(specPath, "utf8"));
const flySrc = readFileSync(flyPath, "utf8");

const py = await loadPyodide({ stdout: () => {}, stderr: () => {} });
log("pyodide loaded");

// The recipe (keep in sync with README.md and the future browser worker):
//  - compiled Pyodide-distribution wheels: numpy(≥2), scipy, matplotlib, cftime
//  - pure-python deps via micropip: pytz, simplekml, dill, requests
//  - rocketpy installed with deps=False (so micropip doesn't try the wheel-less netCDF4)
//  - netCDF4 stubbed in sys.modules before import (only used for forecast/.nc atmospheres we
//    never touch)
await py.loadPackage(["micropip", "numpy", "scipy", "matplotlib", "cftime"]);
log("loaded compiled wheels");

py.FS.writeFile("/tmp/fly.py", flySrc);
py.globals.set("spec_json", JSON.stringify(spec));

const resultJson = await py.runPythonAsync(`
import sys, types, json

# Stub the compiled deps that have no WASM wheel and that fly() never calls.
nc = types.ModuleType("netCDF4")
def _unavailable(*a, **k):
    raise RuntimeError("netCDF4 is stubbed in the browser build (forecast/.nc atmospheres unsupported)")
nc.Dataset = nc.date2num = nc.num2date = _unavailable
sys.modules["netCDF4"] = nc

import micropip
await micropip.install(["pytz", "simplekml", "dill", "requests"])
await micropip.install("rocketpy", deps=False)

sys.path.insert(0, "/tmp")
from fly import fly

json.dumps(fly(json.loads(spec_json)))
`);

log("flight complete");
const result = JSON.parse(resultJson);
writeFileSync(resolve(HERE, "last-result.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
