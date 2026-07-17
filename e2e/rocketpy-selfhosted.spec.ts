import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Proof that the in-browser RocketPy second solver works end-to-end in a REAL browser, entirely
// from self-hosted assets (no CDN): the Pyodide Web Worker boots CPython-in-WASM, installs RocketPy
// from the vendored wheels under /pyodide/, and flies a real Loft spec — and its numbers match the
// committed cross-check reference. This is the same fidelity we proved in Node, now proven in the
// browser runtime the flyer will actually use.
//
// The ~40 MB runtime is git-ignored (produced by `node scripts/pyodide/vendor.mjs`), so this test
// SKIPS unless the assets have been vendored into the build — CI stays green and fast without them.
// To run locally:  node scripts/pyodide/vendor.mjs && npm run build && npm run test:e2e

const ASSETS_PRESENT = existsSync(resolve(process.cwd(), "out/pyodide/manifest.json"));
const spec = JSON.parse(
  readFileSync(resolve(process.cwd(), "e2e/fixtures/rocketpy-demo-single-deploy.spec.json"), "utf8"),
);

test.describe("in-browser RocketPy (self-hosted Pyodide)", () => {
  test.skip(!ASSETS_PRESENT, "Pyodide runtime not vendored — run scripts/pyodide/vendor.mjs then rebuild");

  test("boots RocketPy in a worker from self-hosted assets and matches the reference", async ({ page }) => {
    // Cold boot (~40 MB download + WASM init) plus a flight — well beyond the default timeout.
    test.setTimeout(180_000);

    await page.goto("/");

    // Drive the real worker (public/rocketpy.worker.js) directly from page context: post the spec,
    // resolve on the result. This exercises the exact runtime path the app UI will use.
    const result = await page.evaluate(async (flightSpec) => {
      return await new Promise((resolve, reject) => {
        const worker = new Worker("/rocketpy.worker.js", { type: "module" });
        const timer = setTimeout(() => {
          worker.terminate();
          reject(new Error("RocketPy worker timed out"));
        }, 160_000);
        worker.onmessage = (e: MessageEvent) => {
          const m = e.data;
          if (m?.type === "result") {
            clearTimeout(timer);
            worker.terminate();
            resolve(m.result);
          } else if (m?.type === "error") {
            clearTimeout(timer);
            worker.terminate();
            reject(new Error(m.message));
          }
        };
        worker.onerror = (e) => {
          clearTimeout(timer);
          reject(new Error(e.message || "worker error"));
        };
        worker.postMessage({ spec: flightSpec });
      });
    }, spec);

    // RocketPy actually flew the design — its numbers land on the committed reference (apogee 994.1 m,
    // rail-exit 22.2 m/s, static margin 4.07 cal), within a hair of the native RocketPy figures.
    const r = result as {
      apogee: number;
      railExitVelocity: number;
      staticMarginLiftoff: number;
      maxVelocity: number;
      maxMach: number;
    };
    expect(r.apogee).toBeGreaterThan(990);
    expect(r.apogee).toBeLessThan(998);
    expect(r.railExitVelocity).toBeCloseTo(22.2, 0);
    expect(r.staticMarginLiftoff).toBeCloseTo(4.07, 1);
    expect(r.maxVelocity).toBeCloseTo(205.2, 0);
    expect(r.maxMach).toBeCloseTo(0.604, 1);
  });
});
