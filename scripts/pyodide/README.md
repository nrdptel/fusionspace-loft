# Self-hosted Pyodide runtime for the in-browser RocketPy second solver

Loft can fly a design in **RocketPy** — an independent 6-DOF engine — right in the browser, as a
cross-check of Loft's own solver, with nothing leaving the machine. RocketPy is Python, so it runs
under **Pyodide** (CPython compiled to WebAssembly). To keep Loft private and offline-capable, the
runtime is **self-hosted**: every byte is served from Loft's own origin, never a CDN.

## Pieces

| file | role |
| --- | --- |
| `scripts/pyodide/vendor.mjs` | Assembles `public/pyodide/` (~40 MB): the pinned Pyodide runtime, the compiled science wheels (numpy/scipy/matplotlib/cftime + deps, resolved as a dependency closure from Pyodide's lock), RocketPy's three pure-python wheels (from PyPI; `simplekml` is built from its sdist), the shared `scripts/rocketpy/fly.py`, and a `manifest.json`. |
| `public/pyodide/` | The vendored runtime. **Git-ignored** — regenerate, don't commit. |
| `public/rocketpy.worker.js` | The Web Worker: boots Pyodide from `/pyodide/`, installs RocketPy, and flies a spec via the shared `fly.py`. Loaded on demand, so the ~40 MB downloads only when a flyer opts in. |
| `lib/validation/rocketpy-engine.ts` | Main-thread API (`runRocketpy(spec)`) that drives the worker. |
| `lib/validation/rocketpy-spec.ts` | Builds the RocketPy spec from a Loft design — shared with the dev cross-check harness, so the browser flies exactly what the dev oracle flies. |

## Regenerate the runtime

```sh
node scripts/pyodide/vendor.mjs        # needs network once (Pyodide CDN + PyPI) and python3+pip
```

Behind Loft's agent proxy, prefix with `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.

## Verify it end-to-end (real browser)

`e2e/rocketpy-selfhosted.spec.ts` boots the worker from the vendored assets and flies a bundled
design, asserting RocketPy's numbers match the committed cross-check reference. It **skips** unless
the runtime has been vendored, so CI stays fast without the 40 MB:

```sh
node scripts/pyodide/vendor.mjs && npm run build && npm run test:e2e
```

The recipe and the WASM-vs-native fidelity proof live in `scripts/rocketpy/pyodide/README.md`.

## Not wired into the shipped app yet

The worker and engine are validated but not yet surfaced in the UI, and `vendor.mjs` is not yet in
the build pipeline — so the shipped app is unchanged and `/pyodide/` isn't deployed. The next step
wires the opt-in "also run RocketPy" panel into the results, adds vendoring to the production build,
and confirms the live deploy serves the runtime.
