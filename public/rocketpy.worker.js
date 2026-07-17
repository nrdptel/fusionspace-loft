// In-browser RocketPy second solver — the Web Worker that boots Pyodide (CPython-in-WASM),
// installs RocketPy, and flies a Loft spec, entirely from self-hosted assets under /pyodide/
// (no CDN, no design data leaving the browser). It runs off the UI thread because a cold boot
// is ~10 s and a flight another several seconds.
//
// This is a module worker loaded on demand ( new Worker('/rocketpy.worker.js', {type:'module'}) ),
// so its ~40 MB of assets download only when the flyer opts in — never as part of the base app.
// The heavy assets (public/pyodide/) are produced by scripts/pyodide/vendor.mjs.
//
// Protocol: the main thread posts { spec }. The worker replies with
//   { type: 'progress', stage }   — a human label for the current boot/flight step
//   { type: 'result', result }    — { apogee, maxVelocity, maxMach, timeToApogee, railExitVelocity, staticMarginLiftoff }
//   { type: 'error', message }    — anything that went wrong

let bootPromise = null;

async function boot(post) {
  const manifest = await (await fetch("/pyodide/manifest.json")).json();

  post("Loading the Python runtime…");
  const { loadPyodide } = await import("/pyodide/pyodide.mjs");
  const pyodide = await loadPyodide({ indexURL: manifest.indexUrl });

  post("Loading the science libraries…");
  // loadPackage resolves each root's full dependency closure from the self-hosted lock file.
  await pyodide.loadPackage(manifest.distRoots);

  post("Installing RocketPy…");
  const wheels = manifest.pypiWheels.map((w) => manifest.indexUrl + w);
  pyodide.globals.set("wheel_urls", JSON.stringify(wheels));
  await pyodide.runPythonAsync(`
import sys, types, json, micropip

# netCDF4 has no WASM wheel and RocketPy imports it eagerly, but its only call sites read
# forecast/.nc atmospheres we never touch — so a stub module is safe and keeps the import working.
_nc = types.ModuleType("netCDF4")
def _nc_unavailable(*a, **k):
    raise RuntimeError("netCDF4 is unavailable in the browser build (forecast/.nc atmospheres unsupported)")
_nc.Dataset = _nc.date2num = _nc.num2date = _nc_unavailable
sys.modules["netCDF4"] = _nc

# RocketPy + its pure-python deps, from self-hosted wheels (deps already satisfied above).
await micropip.install(json.loads(wheel_urls), deps=False)
`);

  post("Preparing the flight…");
  const flySrc = await (await fetch(manifest.indexUrl + manifest.flyPy)).text();
  pyodide.FS.mkdirTree("/loft");
  pyodide.FS.writeFile("/loft/fly.py", flySrc);
  await pyodide.runPythonAsync("import sys\nif '/loft' not in sys.path: sys.path.insert(0, '/loft')\nfrom fly import fly");

  return pyodide;
}

self.onmessage = async (e) => {
  const post = (stage) => self.postMessage({ type: "progress", stage });
  try {
    const { spec } = e.data || {};
    if (!spec) throw new Error("no spec supplied to RocketPy worker");
    if (!bootPromise) bootPromise = boot(post);
    const pyodide = await bootPromise;

    post("Flying in RocketPy…");
    pyodide.globals.set("spec_json", JSON.stringify(spec));
    const out = await pyodide.runPythonAsync("import json\njson.dumps(fly(json.loads(spec_json)))");
    self.postMessage({ type: "result", result: JSON.parse(out) });
  } catch (err) {
    // A failed boot shouldn't wedge every later run — let the next request try again.
    bootPromise = null;
    self.postMessage({ type: "error", message: String((err && err.message) || err) });
  }
};
