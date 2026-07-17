# RocketPy under Pyodide — the in-browser second solver

Loft's North Star for accuracy is **multiple independent results, disagreement surfaced not
hidden**: Loft's own solver, the design tool's stored numbers, and — the point of this directory —
an independent RocketPy flight the flyer can run on their *own* design, in the browser, with
nothing leaving their machine.

RocketPy is Python, so "in the browser" means **Pyodide** (CPython compiled to WebAssembly). This
directory is the proof that works and the seed of the shipped worker: `run_pyodide.mjs` boots
Pyodide, installs RocketPy, and flies a Loft-emitted spec by loading the **shared** `../fly.py`
into the WASM filesystem — the exact routine the native dev harness (`../run_rocketpy.py`) uses.

## Feasibility — proven

Running `../out/demo-single-deploy.spec.json` (a real bundled Loft design) through WASM RocketPy
and diffing against **native** RocketPy on the identical spec:

| metric | native | WASM | rel. diff |
| --- | --- | --- | --- |
| apogee (m) | 994.118759 | 994.112923 | 5.9e-04 % |
| max velocity (m/s) | 205.243074 | 205.243074 | 0 |
| max Mach | 0.604021 | 0.604021 | 0 |
| time to apogee (s) | 12.793544 | 12.793409 | 1.0e-03 % |
| rail-exit velocity (m/s) | 22.244721 | 22.244721 | 0 |
| static margin (cal) | 4.065024 | 4.065024 | 0 |

Worst-case **1.0e-03 %** — floating-point scheduling noise between the two OpenBLAS builds. In the
browser, RocketPy *is* RocketPy, not an approximation. (RocketPy ≈ 17 s cold in Node here: ~7 s to
fetch/boot the wheels, ~10 s for the flight; the browser is comparable after the one-time download.)

## The recipe (what the worker must do)

1. **Pyodide ≥ 0.27 (numpy 2.x).** RocketPy 1.12 calls `numpy.trapezoid`, added in numpy 2.0, so
   an older Pyodide that ships numpy 1.26 fails at import. `pyodide@latest` (a `314.x` build) is
   what this proof runs on.
2. **Compiled Pyodide-distribution wheels** via `loadPackage`: `numpy`, `scipy`, `matplotlib`,
   `cftime`. (`cftime` is pulled in by `rocketpy.tools`; it ships as a Pyodide wasm wheel.)
3. **Pure-python deps** via `micropip.install`: `pytz`, `simplekml`, `dill`, `requests`.
4. **`micropip.install("rocketpy", deps=False)`** — deps off so micropip doesn't try to resolve the
   wheel-less `netCDF4`.
5. **Stub `netCDF4`** in `sys.modules` *before* importing rocketpy. `rocketpy.environment` imports
   it eagerly, but its only call sites read forecast/`.nc` atmospheres — code paths the cross-check
   never touches (it flies a standard atmosphere, or Loft's own profile). A stub module is safe.

## Packaging notes for the shipped browser build

The shipped app is a static, offline-capable, private site — so the browser worker must **not**
fetch from a CDN (the `cdn.jsdelivr.net` this dev proof uses). Instead:

- **Self-host** the Pyodide runtime + the exact wheel set above under a non-precached path, so the
  base app stays lean and the ~25–30 MB download happens **only** when the flyer opts in to "also
  run RocketPy". The base offline experience (Loft's own solver) never pulls it in.
- Run it in a **Web Worker** so the ~10 s flight never blocks the UI thread.
- Ship the same `fly.py` and build the spec with `lib/validation/rocketpy-spec.ts` — identical to
  this harness — so the browser result is the dev-validated result.
- The design never leaves the browser: Pyodide runs locally, and the one network touch is the
  one-time runtime download (static assets, no design data).

## Running this proof

Dev-only, like `run_rocketpy.py`. Needs the `pyodide` npm package and network the first time (to
fetch the Python wheels from the Pyodide CDN):

```sh
cd scripts/rocketpy/pyodide
npm i -D pyodide
# emit specs first (from the repo root): npx vitest run --config scripts/rocketpy/vitest.config.ts scripts/rocketpy/emit.ts
node run_pyodide.mjs                       # defaults to ../out/demo-single-deploy.spec.json
node run_pyodide.mjs ../out/demo-boattail.spec.json
```

`node_modules/`, the generated `package.json`/lock, and `last-result.json` are git-ignored here.
