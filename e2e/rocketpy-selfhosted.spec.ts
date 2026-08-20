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

    // The second-opinion section lives in the Cross-check workspace, offered on this single-stage design.
    await page.getByRole("link", { name: "Cross-check" }).click();
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

  test("a finished cross-check survives the docs link, and is not relabelled as another rocket's", async ({ page }) => {
    // **P17's third clause.** The panel sits under a table comparing two solvers and the app plants
    // links to the methods and limitations pages directly beside it — so the gesture that destroyed
    // the comparison is the one the product invites. Held in a plain `useState`, it was gone.
    //
    // It lives here rather than in `smoke.spec.ts` because a real comparison needs the real runtime,
    // and this file is already gated on the vendored Pyodide. The READ path is pinned separately and
    // cheaply in `lib/session.test.ts`; what this pins is the journey.
    test.setTimeout(240_000);

    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Cross-check" }).click();
    const panel = page.getByRole("region", { name: "RocketPy cross-check" });
    await panel.getByRole("button", { name: /Run RocketPy/ }).click();

    const apogeeRow = () => panel.getByRole("row", { name: /^Apogee\b/ });
    await expect(apogeeRow()).toBeVisible({ timeout: 180_000 });
    const before = (await apogeeRow().innerText()).trim();

    // Out through a link the app itself planted, and back the way a flyer goes.
    await page.getByRole("link", { name: "Flight" }).click();
    await page.getByRole("link", { name: "where it's weak" }).click();
    await expect(page).toHaveURL(/\/docs\/limitations/);
    await page.goBack();
    await page.getByRole("link", { name: "Cross-check" }).click();

    // The comparison is back, with no Run click on this side of the navigation…
    await expect(apogeeRow(), "the cross-check did not survive the docs link").toBeVisible({ timeout: 30_000 });
    expect((await apogeeRow().innerText()).trim(), "the restored comparison is the one that was run").toBe(before);

    // …and it is NOT labelled as belonging to another rocket. `ranFor` is compared against a key
    // whose leading field is a per-mount load counter, so restoring it verbatim would mark every
    // restored comparison stale — a banner saying these numbers are for a different design, about
    // the design in front of the flyer.
    await expect(
      panel.getByText(/different rocket|no longer|since this ran/i),
      "a restored comparison was labelled stale against the design it was actually run for",
    ).toHaveCount(0);
  });

  test("labels a result the config moved out from under, and reuses the warm worker to redo it", async ({ page }) => {
    test.setTimeout(240_000);

    await page.goto("/");
    await page.getByRole("button", { name: /Motor comparison/ }).click();
    await expect(page.getByRole("heading", { name: /Loft Demo/ })).toBeVisible();

    // The RocketPy panel is in the Cross-check workspace; it stays selected across the config switch below.
    await page.getByRole("link", { name: "Cross-check" }).click();
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
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("input").and(page.getByLabel(/Nose ballast/)).first().fill("500");

    // The RocketPy panel is in the Cross-check workspace.
    await page.getByRole("link", { name: "Cross-check" }).click();
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
  // A phone, declared as one. It used to set only the VIEWPORT, which made Chromium report
  // `pointer: fine` — so the 44 px assertions below were passing off the old width-keyed
  // `TOUCH_TARGET` (`min-h-11 sm:min-h-0`) rather than off the touch contract they name. With the
  // token keyed on `pointer: coarse` (`DESIGN.md` §8's actual words) a narrow desktop window is
  // correctly no longer a phone, and these have to say which they meant.
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

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
    await page.getByRole("link", { name: "Cross-check" }).click();
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

  test("names the connection when the run fails with no signal", async ({ page }) => {
    // RocketPy's ~40 MB runtime is not precached — the service worker excludes /pyodide/, and the
    // worker script with it — so with no signal the run cannot start and the engine's own words for
    // that are "The RocketPy worker crashed.", which reads as a defect in the tool or the design. On
    // the form factor this project describes as a pad check with no signal, that is the difference
    // between abandoning a cross-check and walking back to the car. The weather control on the same
    // screen already names the connection.
    await standInWorker(page, { type: "error", message: "The RocketPy worker crashed." });
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Cross-check" }).click();

    // Wait for the worker to be CONTROLLING before the network goes, exactly as `e2e/docs.spec.ts`
    // and `e2e/offline.spec.ts` do. Without it this was the only offline case in the suite that
    // flipped the switch on an uncontrolled page, and it failed under in-shard parallelism while
    // passing alone — the app's own chrome is served from the cache like everything else, so an
    // offline page with no controller has nothing to render from.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 20000 });

    await page.context().setOffline(true);
    const panel = page.getByRole("region", { name: "RocketPy cross-check" });
    await panel.getByRole("button", { name: "Run RocketPy" }).click();

    await expect(panel.getByText(/Your device is offline/)).toBeVisible();
    await expect(panel.getByText(/about 40 MB the first time/)).toBeVisible();
    // The engine's own words are still there, unchanged and in full — this adds a fact, it does not
    // reinterpret one, and a flyer reporting the problem needs RocketPy's message rather than a
    // paraphrase of it.
    await expect(panel.getByText("RocketPy couldn't run: The RocketPy worker crashed.")).toBeVisible();

    // Back online, the same failure says nothing about the connection: it is a fact about the moment,
    // not a diagnosis of the failure.
    await page.context().setOffline(false);
    await panel.getByRole("button", { name: "Try RocketPy again" }).click();
    await expect(panel.getByText("RocketPy couldn't run: The RocketPy worker crashed.")).toBeVisible();
    await expect(panel.getByText(/Your device is offline/)).toHaveCount(0);
  });

  test("says the one-line failures plainly, with nothing to expand onto themselves", async ({ page }) => {
    // The worker's fallback when a fatal error carries no message of its own. It is not a download
    // failure and is not diagnosed as one — it is repeated exactly, and there is nothing behind it.
    const panel = await failThePanel(page, "The RocketPy worker crashed.");
    await expect(panel.getByText("RocketPy couldn't run: The RocketPy worker crashed.")).toBeVisible();
    await expect(panel.getByText("What RocketPy reported")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Try RocketPy again" })).toBeVisible();
  });

  // A run that cannot be stopped is a one-way door: the flight is the better part of a minute (15 s
  // with the runtime already local, ~50 s over a real network), and until now the only exit was a
  // reload, which drops the loaded design and every what-if set on it.
  test.describe("stopping a run in flight", () => {
    // A phone, because that is where the running row had nothing to spare: the stage label and its
    // aside already filled 390 px, so a Stop beside them is only safe if the row wraps.
    // A phone, declared as one. It used to set only the VIEWPORT, which made Chromium report
  // `pointer: fine` — so the 44 px assertions below were passing off the old width-keyed
  // `TOUCH_TARGET` (`min-h-11 sm:min-h-0`) rather than off the touch contract they name. With the
  // token keyed on `pointer: coarse` (`DESIGN.md` §8's actual words) a narrow desktop window is
  // correctly no longer a phone, and these have to say which they meant.
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    /** A stand-in worker that reports it has started and then never answers, so the run stays in
     *  flight for as long as the test needs. It counts its own constructions and terminations, since
     *  "the runtime actually ended" is the whole claim being tested.
     *
     *  The progress message matters: Stop is deliberately withheld until the engine has the run, so a
     *  worker that said nothing at all would never offer one — which is the correct behaviour and
     *  would make this a test of the wrong thing. */
    const silentWorker = (page: import("@playwright/test").Page) =>
      page.addInitScript(() => {
        const w = window as unknown as { __rp: { built: number; killed: number }; Worker: unknown };
        w.__rp = { built: 0, killed: 0 };
        w.Worker = class {
          onmessage: ((e: { data: unknown }) => void) | null = null;
          onerror: ((e: unknown) => void) | null = null;
          constructor() {
            w.__rp.built++;
          }
          postMessage(m: { id: number }) {
            // Boot far enough to be stoppable, then go quiet — the flight never comes back.
            setTimeout(
              () => this.onmessage?.({ data: { id: m.id, type: "progress", stage: "Loading the Python runtime…" } }),
              0,
            );
          }
          terminate() {
            w.__rp.killed++;
          }
        };
      });

    const startARun = async (page: import("@playwright/test").Page) => {
      await silentWorker(page);
      await page.goto("/");
      await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
      await page.getByRole("link", { name: "Cross-check" }).click();
      const panel = page.getByRole("region", { name: "RocketPy cross-check" });
      await panel.getByRole("button", { name: "Run RocketPy" }).click();
      await expect(panel.getByRole("button", { name: "Stop" })).toBeVisible();
      return panel;
    };

    const counters = (page: import("@playwright/test").Page) =>
      page.evaluate(() => (window as unknown as { __rp: { built: number; killed: number } }).__rp);

    test("ends the runtime, says so, and leaves a way back that is not a reload", async ({ page }) => {
      const panel = await startARun(page);
      expect((await counters(page)).killed, "nothing terminated before Stop").toBe(0);

      const stop = panel.getByRole("button", { name: "Stop" });
      expect(Math.round((await stop.boundingBox())!.height), "Stop's hit target").toBeGreaterThanOrEqual(44);
      // The row wraps rather than pushing the page sideways.
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        "page overflow while a run is stoppable",
      ).toBeLessThanOrEqual(0);

      await stop.click();

      // The claim: the worker is genuinely gone. Merely dropping the listener would leave it running
      // and strand the next run behind the abandoned flight.
      expect((await counters(page)).killed, "Stop must end the runtime, not just the wait").toBe(1);

      // A stop is not a failure and must not be dressed as one.
      // The stage is named: a cold run is mostly downloading and installing, not flying.
      await expect(panel.getByText(/Stopped at .Loading the Python runtime/)).toBeVisible();
      await expect(panel.getByText(/RocketPy couldn't run/)).toHaveCount(0);
      // The cost of stopping is stated rather than discovered on the next run.
      await expect(panel.getByText(/starts it from scratch, so it costs what the first run did/)).toBeVisible();
      await expect(panel.getByRole("button", { name: "Run RocketPy again" })).toBeVisible();
      await expect(panel.getByRole("button", { name: "Stop" })).toHaveCount(0);
    });

    test("gives the next run a fresh runtime rather than queueing it behind the abandoned flight", async ({
      page,
    }) => {
      const panel = await startARun(page);
      expect((await counters(page)).built).toBe(1);
      await panel.getByRole("button", { name: "Stop" }).click();
      await expect(panel.getByRole("button", { name: "Run RocketPy again" })).toBeVisible();

      await panel.getByRole("button", { name: "Run RocketPy again" }).click();

      // A second worker, built from scratch: this is what stops the run after a stop from sitting at
      // "Preparing…" for the remainder of the flight nobody is waiting for any more.
      await expect(panel.getByRole("button", { name: "Stop" })).toBeVisible();
      expect((await counters(page)).built, "the run after a stop boots its own runtime").toBe(2);
    });

    test("keeps the comparison the panel promised to keep", async ({ page }) => {
      // The panel's whole reason for holding a result across an edit is that it costs the better part
      // of a minute: it labels it as the previous design's rather than clearing it, so it can be the
      // "before" while a flyer edits toward a target. Stop is the one button pressed expecting no side
      // effects, so it must not be the thing that throws that away.
      await page.addInitScript(() => {
        const w = window as unknown as { __rp: { built: number; killed: number }; __answer: boolean; Worker: unknown };
        w.__rp = { built: 0, killed: 0 };
        w.__answer = true;
        w.Worker = class {
          onmessage: ((e: { data: unknown }) => void) | null = null;
          onerror: ((e: unknown) => void) | null = null;
          constructor() {
            w.__rp.built++;
          }
          postMessage(m: { id: number }) {
            setTimeout(
              () => this.onmessage?.({ data: { id: m.id, type: "progress", stage: "Loading the Python runtime…" } }),
              0,
            );
            // The second run is left hanging on purpose, so it can be stopped.
            if (w.__answer)
              setTimeout(
                () =>
                  this.onmessage?.({
                    data: {
                      id: m.id,
                      type: "result",
                      result: {
                        apogee: 994,
                        maxVelocity: 180,
                        maxMach: 0.53,
                        timeToApogee: 13.7,
                        railExitVelocity: 22,
                        staticMarginLiftoff: 2.1,
                      },
                    },
                  }),
                10,
              );
          }
          terminate() {
            w.__rp.killed++;
          }
        };
      });
      await page.goto("/");
      await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
      await page.getByRole("link", { name: "Cross-check" }).click();
      const panel = page.getByRole("region", { name: "RocketPy cross-check" });

      await panel.getByRole("button", { name: "Run RocketPy" }).click();
      const apogee = panel.getByRole("row", { name: /^Apogee\b/ });
      await expect(apogee).toBeVisible();

      // Edit the design so the kept result is explicitly labelled as the previous one, then re-run
      // from that banner and stop it.
      await page.evaluate(() => {
        (window as unknown as { __answer: boolean }).__answer = false;
      });
      await page.getByRole("link", { name: "Design" }).click();
      await page.locator("input").and(page.getByLabel(/Nose ballast/)).first().fill("250");
      await page.getByRole("link", { name: "Cross-check" }).click();
      await expect(panel.getByText(/has changed since this ran/)).toBeVisible();

      await panel.getByRole("button", { name: "Run RocketPy again" }).click();
      await panel.getByRole("button", { name: "Stop" }).click();

      // Stopped, and the earlier figures are still there — said out loud, not left to be noticed.
      await expect(panel.getByText(/Stopped at /)).toBeVisible();
      await expect(panel.getByText(/the comparison below is the earlier run/)).toBeVisible();
      await expect(apogee, "the result that cost a minute survives the Stop").toBeVisible();
      await expect(panel.getByText(/has changed since this ran/)).toBeVisible();
    });

    test("ends the run when the flyer leaves the design instead of stranding the next one", async ({ page }) => {
      // The abandoned flight used to keep the worker's single run chain busy, so the NEXT design's
      // cross-check sat on "Preparing…" until it finished — 13.5 s when measured, and longer the
      // earlier the flyer walks away. Workspace tabs keep the panel mounted, so only leaving the
      // design entirely does this.
      const panel = await startARun(page);
      expect((await counters(page)).killed).toBe(0);
      await expect(panel.getByRole("button", { name: "Stop" })).toBeVisible();

      await page.getByRole("button", { name: /Import another/ }).click();
      await expect(page.getByRole("button", { name: /38 mm single-deploy/ })).toBeVisible();
      expect(
        (await counters(page)).killed,
        "leaving the design ends the run rather than leaving it to block the next one",
      ).toBe(1);
    });
  });
});
