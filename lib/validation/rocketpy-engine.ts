/** Main-thread API for the in-browser RocketPy second solver. Spawns the Pyodide Web Worker
 *  (public/rocketpy.worker.js), hands it a Loft spec (buildRocketpySpec), and resolves with
 *  RocketPy's independent flight result — so a flyer can cross-check Loft's own numbers against a
 *  second engine on their own design, with nothing leaving the browser.
 *
 *  The worker and its ~40 MB of Pyodide/RocketPy assets load only when this is first called, so
 *  the base app is never weighed down. Browser-only (uses Worker); import it lazily. */

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
  /** Abort the run and tear down the worker. */
  signal?: AbortSignal;
  /** Override the worker URL (tests). */
  workerUrl?: string;
}

/** Fly a spec in RocketPy under Pyodide and resolve with its result. Rejects on any worker error
 *  (or abort). Each call uses a fresh worker and tears it down when done — simple and leak-free;
 *  a warm-worker pool can come later if repeated runs need the cold-boot amortised. */
export function runRocketpy(spec: RocketpySpec, opts: RunRocketpyOptions = {}): Promise<RocketpyFlightResult> {
  const { onProgress, signal, workerUrl = "/rocketpy.worker.js" } = opts;
  return new Promise<RocketpyFlightResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("RocketPy run aborted", "AbortError"));
      return;
    }
    const worker = new Worker(workerUrl, { type: "module" });
    const settle = (fn: () => void) => {
      worker.terminate();
      if (signal) signal.removeEventListener("abort", onAbort);
      fn();
    };
    const onAbort = () => settle(() => reject(new DOMException("RocketPy run aborted", "AbortError")));

    worker.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m?.type === "progress") onProgress?.(m.stage);
      else if (m?.type === "result") settle(() => resolve(m.result as RocketpyFlightResult));
      else if (m?.type === "error") settle(() => reject(new Error(m.message)));
    };
    worker.onerror = (e: ErrorEvent) =>
      settle(() => reject(new Error(e.message || "The RocketPy worker failed to start.")));

    if (signal) signal.addEventListener("abort", onAbort);
    worker.postMessage({ spec });
  });
}
