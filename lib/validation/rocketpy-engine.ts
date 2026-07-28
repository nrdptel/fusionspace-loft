/** Main-thread API for the in-browser RocketPy second solver. Drives a single, long-lived Pyodide
 *  Web Worker (public/rocketpy.worker.js): it hands the worker a Loft spec (buildRocketpySpec) and
 *  resolves with RocketPy's independent flight result — so a flyer can cross-check Loft's own
 *  numbers against a second engine on their own design, with nothing leaving the browser.
 *
 *  The worker and its ~40 MB of Pyodide/RocketPy assets load only when this is first called. The
 *  worker is then kept WARM for the page session: the ~10 s cold boot is paid once, and later runs
 *  (e.g. after switching motor configuration) reuse the booted runtime and just fly. Because one
 *  worker now serves many runs, each request carries an id so responses can be matched, and runs
 *  are serialized worker-side so they can't race on Pyodide's shared globals.
 *
 *  The one thing that ends a warm worker early is an abort — see `runRocketpy` for why stopping a
 *  run has to go that far.
 *
 *  Browser-only (uses Worker); import it lazily. */

import type { RocketpySpec } from "./rocketpy-spec";

/** RocketPy's ascent metrics for a spec — the same fields fly.py returns. */
export interface RocketpyFlightResult {
  apogee: number; // m AGL
  maxVelocity: number; // m/s
  maxMach: number;
  timeToApogee: number; // s
  railExitVelocity: number; // m/s
  staticMarginLiftoff: number; // calibers
}

export interface RunRocketpyOptions {
  /** Progress labels for the boot/flight steps (the first run downloads and boots the runtime). */
  onProgress?: (stage: string) => void;
  /** Abort the run. A true stop, not just a stop-listening: it ends the runtime doing the work, at
   *  the cost of the boot on the next call. See `runRocketpy`. */
  signal?: AbortSignal;
  /** Override the worker URL. Only honoured on the call that first creates the shared worker (tests). */
  workerUrl?: string;
}

interface Pending {
  resolve: (r: RocketpyFlightResult) => void;
  reject: (e: Error) => void;
  onProgress?: (stage: string) => void;
}

let sharedWorker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(url: string): Worker {
  if (sharedWorker) return sharedWorker;
  const w = new Worker(url, { type: "module" });
  w.onmessage = (e: MessageEvent) => {
    const m = e.data;
    if (!m || typeof m.id !== "number") return;
    const entry = pending.get(m.id);
    if (!entry) return; // an aborted (or already-settled) run — ignore its late messages
    if (m.type === "progress") {
      entry.onProgress?.(m.stage);
    } else if (m.type === "result") {
      pending.delete(m.id);
      entry.resolve(m.result as RocketpyFlightResult);
    } else if (m.type === "error") {
      pending.delete(m.id);
      entry.reject(new Error(m.message));
    }
  };
  w.onerror = (e: ErrorEvent) => {
    // A fatal worker error takes down the shared instance: fail everything in flight and drop the
    // singleton so the next call rebuilds (and re-boots) from scratch.
    const err = new Error(e.message || "The RocketPy worker crashed.");
    teardown(() => err);
  };
  sharedWorker = w;
  return w;
}

/** End the shared worker and fail every run in flight, each with the reason this teardown gives it.
 *  Dropping the singleton is the point: once the runtime is gone nothing can deliver a result, so
 *  the next call has to build and boot a fresh one. Both a fatal worker error and an abort come
 *  through here. */
function teardown(reasonFor: (id: number) => Error): void {
  for (const [id, entry] of [...pending]) {
    pending.delete(id);
    entry.reject(reasonFor(id));
  }
  sharedWorker?.terminate();
  sharedWorker = null;
}

/** Fly a spec in RocketPy under Pyodide and resolve with its result. Rejects on any worker error
 *  (or abort). Reuses one warm worker across calls — until a run is aborted, which ends it.
 *
 *  **An abort ends the runtime, and it has to.** Pyodide cannot be interrupted part-way through a
 *  `runPythonAsync` without a SharedArrayBuffer interrupt buffer, and that needs the cross-origin
 *  isolation a keyless static site cannot adopt without breaking the browser-side APIs it calls.
 *  Meanwhile the worker serialises every run through one chain. So a "stop" that merely dropped this
 *  run's listener would leave the flight running and strand the NEXT run at "Preparing…" for the
 *  remainder of the abandoned one — a stop that visibly stops and secretly doesn't. Terminating the
 *  worker genuinely ends the work. The price is the ~10 s boot again on the next run, which is the
 *  honest cost of a stop, and the caller is expected to say so. */
export function runRocketpy(spec: RocketpySpec, opts: RunRocketpyOptions = {}): Promise<RocketpyFlightResult> {
  const { onProgress, signal, workerUrl = "/rocketpy.worker.js" } = opts;
  return new Promise<RocketpyFlightResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("RocketPy run aborted", "AbortError"));
      return;
    }
    const id = nextId++;
    const onAbort = () => {
      if (!pending.has(id)) return; // already settled — a late abort is a no-op
      teardown((other) =>
        other === id
          ? new DOMException("RocketPy run aborted", "AbortError")
          : new Error("The RocketPy runtime was stopped before this run could finish."),
      );
    };
    pending.set(id, {
      resolve: (r) => {
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve(r);
      },
      reject: (e) => {
        if (signal) signal.removeEventListener("abort", onAbort);
        reject(e);
      },
      onProgress,
    });
    if (signal) signal.addEventListener("abort", onAbort);
    getWorker(workerUrl).postMessage({ id, spec });
  });
}
