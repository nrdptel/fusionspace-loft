import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// End-to-end proof of the in-browser RocketPy second solver, driven through the real UI: import a
// bundled design, tap "Run RocketPy", and the app boots CPython-in-WASM in a Web Worker from
// self-hosted assets (no CDN), installs RocketPy from the vendored wheels, flies the design, and
// shows the Loft-vs-RocketPy comparison. This exercises the whole vertical slice — spec builder,
// worker, engine, and UI — and asserts RocketPy's numbers land on the committed reference.
//
// The ~40 MB runtime is produced by the build (prebuild → scripts/pyodide/vendor.mjs). If it wasn't
// vendored (e.g. `next build` skipped), this SKIPS rather than fail.

const ASSETS_PRESENT = existsSync(resolve(process.cwd(), "out/pyodide/manifest.json"));

test.describe("in-browser RocketPy second solver (self-hosted Pyodide)", () => {
  test.skip(!ASSETS_PRESENT, "Pyodide runtime not vendored — run `npm run build` (prebuild vendors it)");

  test("runs RocketPy on the design and matches the cross-check reference", async ({ page }) => {
    // Cold boot (~40 MB local load + WASM init) plus a flight — well beyond the default timeout.
    test.setTimeout(200_000);

    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    // The second-opinion section is offered on this single-stage design.
    const panel = page.getByRole("region", { name: "RocketPy cross-check" });
    await expect(panel.getByRole("heading", { name: "Second opinion: RocketPy" })).toBeVisible();

    await panel.getByRole("button", { name: /Run RocketPy/ }).click();

    // The comparison table appears once RocketPy has flown (give the cold boot generous time).
    // Anchor on the row label so "Apogee" doesn't also match the "Time to apogee" row.
    const apogeeRow = panel.getByRole("row", { name: /^Apogee\b/ });
    await expect(apogeeRow).toBeVisible({ timeout: 180_000 });

    const num = async (colIndex: number) =>
      parseFloat((await apogeeRow.locator("td").nth(colIndex).innerText()).replace(/[^\d.]/g, ""));
    const loftApogee = await num(0); // td[0] Loft, td[1] RocketPy, td[2] delta
    const rpApogee = await num(1);

    // RocketPy actually flew the design: apogee lands on the committed reference (994 m), and Loft's
    // own ballistic apogee agrees with it — the two independent engines converge.
    expect(rpApogee).toBeGreaterThan(985);
    expect(rpApogee).toBeLessThan(1005);
    expect(loftApogee).toBeGreaterThan(985);
    expect(loftApogee).toBeLessThan(1005);
  });

  test("resets the RocketPy panel when the motor configuration changes", async ({ page }) => {
    test.setTimeout(200_000);

    await page.goto("/");
    await page.getByRole("button", { name: /Motor comparison/ }).click();
    await expect(page.getByRole("heading", { name: /Loft Demo/ })).toBeVisible();

    const panel = page.getByRole("region", { name: "RocketPy cross-check" });
    await panel.getByRole("button", { name: /Run RocketPy/ }).click();

    // A result table appears for the current configuration.
    await expect(panel.getByRole("row", { name: /^Apogee\b/ })).toBeVisible({ timeout: 180_000 });

    // Switching motor configuration must drop that stale result: the panel remounts back to idle,
    // so the comparison table is gone and the "Run RocketPy" button is offered again for the new
    // configuration (rather than showing the previous config's numbers).
    await page.getByLabel("Motor configuration").selectOption("1");
    await expect(panel.getByRole("button", { name: /Run RocketPy/ })).toBeVisible();
    await expect(panel.getByRole("row", { name: /^Apogee\b/ })).toHaveCount(0);
  });
});
