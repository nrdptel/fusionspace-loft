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

    // The second-opinion section lives in the Analyze workspace, offered on this single-stage design.
    await page.getByRole("tab", { name: "Analyze" }).click();
    const panel = page.getByRole("region", { name: "RocketPy cross-check" });
    await expect(panel.getByRole("heading", { name: "Second opinion: RocketPy" })).toBeVisible();

    await panel.getByRole("button", { name: /Run RocketPy/ }).click();

    // The comparison table appears once RocketPy has flown (give the cold boot generous time).
    // Anchor on the row label so "Apogee" doesn't also match the "Time to apogee" row.
    const apogeeRow = panel.getByRole("row", { name: /^Apogee\b/ });
    await expect(apogeeRow).toBeVisible({ timeout: 180_000 });

    const num = async (colIndex: number) =>
      parseFloat((await apogeeRow.locator("td").nth(colIndex).innerText()).replace(/[^\d.]/g, ""));
    const rpApogee = await num(0); // td[0] RocketPy, td[1] Loft, td[2] delta — reference first
    const loftApogee = await num(1);

    // RocketPy actually flew the design: apogee lands on the committed reference (994 m), and Loft's
    // own ballistic apogee agrees with it — the two independent engines converge.
    expect(rpApogee).toBeGreaterThan(985);
    expect(rpApogee).toBeLessThan(1005);
    expect(loftApogee).toBeGreaterThan(985);
    expect(loftApogee).toBeLessThan(1005);
  });

  test("labels a result the config moved out from under, and reuses the warm worker to redo it", async ({ page }) => {
    test.setTimeout(240_000);

    await page.goto("/");
    await page.getByRole("button", { name: /Motor comparison/ }).click();
    await expect(page.getByRole("heading", { name: /Loft Demo/ })).toBeVisible();

    // The RocketPy panel is in the Analyze workspace; it stays selected across the config switch below.
    await page.getByRole("tab", { name: "Analyze" }).click();
    const panel = page.getByRole("region", { name: "RocketPy cross-check" });
    const rpApogee = async () =>
      parseFloat(
        (await panel.getByRole("row", { name: /^Apogee\b/ }).locator("td").nth(0).innerText()).replace(/[^\d.]/g, ""),
      );

    // First run: cold boot on the default configuration (the more powerful H128W).
    await panel.getByRole("button", { name: /Run RocketPy/ }).click();
    await expect(panel.getByRole("row", { name: /^Apogee\b/ })).toBeVisible({ timeout: 180_000 });
    const apogeeDefault = await rpApogee();
    expect(apogeeDefault).toBeGreaterThan(0);

    // Switching motor configuration must never leave that result reading as current. It costs the
    // better part of a minute to produce, so it is kept as the "before" — labelled as being for the
    // previous configuration, with a way to run it again for the new one.
    await page.getByLabel("Motor configuration").selectOption("1");
    await expect(panel.getByText(/has changed since this ran/)).toBeVisible();
    await expect(panel.getByRole("button", { name: /Run RocketPy again/ })).toBeVisible();

    await panel.getByRole("button", { name: /Run RocketPy again/ }).click();
    await expect(panel.getByText(/has changed since this ran/)).toHaveCount(0, { timeout: 60_000 });

    // That second run reused the WARM worker — no ~10 s reboot — and flew the newly selected G40W
    // configuration: its apogee lands on the committed reference (~548 m) and differs clearly from
    // the H128W run above, proving the warm worker flew the right (switched) config.
    await expect(panel.getByRole("row", { name: /^Apogee\b/ })).toBeVisible({ timeout: 60_000 });
    const apogeeG40 = await rpApogee();
    expect(apogeeG40).toBeGreaterThan(510);
    expect(apogeeG40).toBeLessThan(590);
    expect(Math.abs(apogeeDefault - apogeeG40)).toBeGreaterThan(30);
  });

  test("honors an active nose-ballast what-if in both engines", async ({ page }) => {
    test.setTimeout(200_000);

    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    // Add a heavy nose ballast before running the cross-check — a design edit, on the Design
    // workspace where the editing surface now lives.
    await page.getByRole("tab", { name: "Design" }).click();
    await page.getByLabel(/Nose ballast/).fill("500");

    // The RocketPy panel is in the Analyze workspace.
    await page.getByRole("tab", { name: "Analyze" }).click();
    const panel = page.getByRole("region", { name: "RocketPy cross-check" });
    await panel.getByRole("button", { name: /Run RocketPy/ }).click();

    const apogeeRow = panel.getByRole("row", { name: /^Apogee\b/ });
    await expect(apogeeRow).toBeVisible({ timeout: 180_000 });
    const cell = async (i: number) =>
      parseFloat((await apogeeRow.locator("td").nth(i).innerText()).replace(/[^\d.]/g, ""));
    const rpApogee = await cell(0); // reference first, as in the stored-results comparison
    const loftApogee = await cell(1);

    // The base (unballasted) design apogees ~994 m; 500 g of nose ballast drops it well below that
    // in BOTH engines — proving the RocketPy spec and Loft's baseline both fly the ballasted design.
    // And the two independent engines still agree closely on that ballasted flight.
    expect(rpApogee).toBeGreaterThan(300);
    expect(rpApogee).toBeLessThan(950);
    expect(loftApogee).toBeLessThan(950);
    expect(Math.abs(rpApogee - loftApogee) / loftApogee).toBeLessThan(0.05);
  });
});

// What the flyer gets when RocketPy stops. Verbatim from a real run: the vendored in-browser
// RocketPy, handed a design whose fins have no root chord, replies with this Python traceback
// through the worker (the real one runs to 30 lines; the frames that matter are kept).
//
// These stand in the worker rather than the network — swapping the worker SCRIPT does not work,
// because Chromium fetches it outside the page's request interception, and letting the real one
// load starts a ~40 MB boot. So `Worker` itself is replaced, which is precisely the seam the panel
// meets the engine at. That means these prove what the panel does with a failure, not that RocketPy
// produces one; the tests above, which fly the real thing, are what cover the stack. They also run
// whether or not the runtime was vendored — the failure path had no coverage at all before.
const REAL_TRACEBACK = [
  "Traceback (most recent call last):",
  '  File "/lib/python314.zip/_pyodide/_base.py", line 597, in eval_code_async',
  "    await CodeRunner(",
  '  File "<exec>", line 2, in <module>',
  '  File "/loft/fly.py", line 72, in fly',
  "    rocket.add_trapezoidal_fins(",
  "    ~~~~~~~~~~~~~~~~~~~~~~~~~~~^",
  '  File "/lib/python3.14/site-packages/rocketpy/rocket/aero_surface/fins/trapezoidal_fins.py", line 274, in evaluate_geometrical_parameters',
  "    lambda_ = self.tip_chord / self.root_chord",
  "              ~~~~~~~~~~~~~~~^~~~~~~~~~~~~~~~~",
  "ZeroDivisionError: division by zero",
].join("\n");

test.describe("when the second solver stops", () => {
  // A phone, because the traceback's longest frame path is one unbreakable 86-character token and
  // the damage it did was to the page's width, not just to this panel.
  test.use({ viewport: { width: 390, height: 844 } });

  type Page = import("@playwright/test").Page;
  /** What the stand-in worker replies with next. The engine keeps ONE warm worker per page, so a
   *  second run reaches the same instance — the reply has to be swappable, not baked in. */
  type Reply = { type: "error"; message: string } | { type: "result"; result: Record<string, number> };

  const replyWith = (page: Page, reply: Reply) =>
    page.evaluate((r) => {
      (window as unknown as { __rpReply: Reply }).__rpReply = r as Reply;
    }, reply);

  const standInWorker = (page: Page, first: Reply) =>
    page.addInitScript((r) => {
      const w = window as unknown as { __rpReply: unknown; Worker: unknown };
      w.__rpReply = r;
      w.Worker = class {
        onmessage: ((e: { data: unknown }) => void) | null = null;
        onerror: ((e: unknown) => void) | null = null;
        postMessage(m: { id: number }) {
          setTimeout(() => this.onmessage?.({ data: { id: m.id, ...(w.__rpReply as object) } }), 0);
        }
        terminate() {}
      };
    }, first);

  const failThePanel = async (page: Page, message: string) => {
    await standInWorker(page, { type: "error", message });
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Analyze" }).click();
    const panel = page.getByRole("region", { name: "RocketPy cross-check" });
    await panel.getByRole("button", { name: "Run RocketPy" }).click();
    await expect(panel.getByText(/RocketPy couldn't run/)).toBeVisible();
    return panel;
  };

  test("leads with what went wrong, keeps the report, and never widens the page", async ({ page }) => {
    const panel = await failThePanel(page, REAL_TRACEBACK);

    // The line that says what happened is Python's last, not its first — and it is the whole of
    // what the panel says out loud. The frames are still there, folded.
    await expect(panel.getByText("RocketPy couldn't run: ZeroDivisionError: division by zero")).toBeVisible();
    await expect(panel.locator("pre"), "the frames start folded away").toBeHidden();

    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow(), "page overflow with the traceback folded").toBeLessThanOrEqual(0);

    const report = panel.locator("summary");
    await expect(report).toHaveText(/What RocketPy reported/);
    expect(Math.round((await report.boundingBox())!.height), "report toggle height").toBeGreaterThanOrEqual(44);
    await report.click();

    // Unfolded, the report is complete and Python's caret row still sits under the code it points
    // at — a traceback reflowed to fit is a traceback that has lost the thing it was drawing.
    const pre = panel.locator("pre");
    await expect(pre).toContainText("lambda_ = self.tip_chord / self.root_chord");
    await expect(pre).toContainText("~~~~~~~~~~~~~~~^~~~~~~~~~~~~~~~~");
    expect(await pre.evaluate((n) => getComputedStyle(n).whiteSpace)).toBe("pre");

    // The 86-character path scrolls inside the report's own box. The page does not move.
    expect(await pre.evaluate((n) => n.scrollWidth > n.clientWidth), "report scrolls itself").toBe(true);
    expect(await overflow(), "page overflow with the traceback open").toBeLessThanOrEqual(0);
  });

  test("leaves a way back that does not need the page reloaded", async ({ page }) => {
    // Every failure used to end the panel for the life of the page: the run button lived behind an
    // idle-only gate, so the only route back was a reload, which drops the loaded design.
    const panel = await failThePanel(page, REAL_TRACEBACK);
    const again = panel.getByRole("button", { name: "Try RocketPy again" });
    await expect(again).toBeVisible();

    // Nothing about the failed attempt is claimed to have succeeded — in particular the panel no
    // longer offers the first-run download note, which it cannot know is still true.
    await expect(panel.getByText("downloads ~40 MB the first time")).toHaveCount(0);

    // A second attempt genuinely re-runs: this one is allowed to succeed and the comparison lands.
    await replyWith(page, {
      type: "result",
      result: {
        apogee: 994,
        maxVelocity: 180,
        maxMach: 0.53,
        timeToApogee: 13.7,
        railExitVelocity: 22,
        staticMarginLiftoff: 2.4,
      },
    });
    await again.click();
    await expect(panel.getByRole("row", { name: /^Apogee\b/ })).toBeVisible();
    await expect(panel.getByText(/RocketPy couldn't run/)).toHaveCount(0);
  });

  test("says the one-line failures plainly, with nothing to expand onto themselves", async ({ page }) => {
    // The worker's fallback when a fatal error carries no message of its own. It is not a download
    // failure and is not diagnosed as one — it is repeated exactly, and there is nothing behind it.
    const panel = await failThePanel(page, "The RocketPy worker crashed.");
    await expect(panel.getByText("RocketPy couldn't run: The RocketPy worker crashed.")).toBeVisible();
    await expect(panel.getByText("What RocketPy reported")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Try RocketPy again" })).toBeVisible();
  });
});
