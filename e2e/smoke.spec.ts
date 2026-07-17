import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Loft", () => {
  test("loads with a clean hydration and the heading", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Loft", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("imports a bundled sample and simulates the flight", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();

    // The rocket summary and results appear.
    await expect(page.getByRole("heading", { name: /Loft Demo/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await expect(page.getByLabel("Results").getByText("Apogee", { exact: true })).toBeVisible();

    // The motor resolved exactly (pill with the designation).
    await expect(page.getByText("H128W", { exact: false }).first()).toBeVisible();

    // A plot renders.
    await expect(page.getByRole("heading", { name: /Altitude \(m\) vs time/ })).toBeVisible();

    // The OpenRocket comparison renders.
    await expect(page.getByRole("heading", { name: "OpenRocket vs Loft" })).toBeVisible();
  });

  test("imports the RockSim .rkt sample and simulates the flight", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /RockSim · 54 mm sport/ }).click();

    // The RockSim design imports and flies through the same engine.
    await expect(page.getByRole("heading", { name: /54 mm sport/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await expect(page.getByLabel("Results").getByText("Apogee", { exact: true })).toBeVisible();

    // The J420R resolved from the EngineSet, and the footer names the RockSim format.
    await expect(page.getByText("J420R", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/RockSim format/).first()).toBeVisible();

    // The comparison is labelled for RockSim, not OpenRocket.
    await expect(page.getByRole("heading", { name: "RockSim vs Loft" })).toBeVisible();
  });

  test("dual-deploy sample flags transonic and shows two deploy markers", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: /Loft Demo/ })).toBeVisible();
    await expect(page.getByText(/transonic|supersonic/i).first()).toBeVisible();
  });

  test("multi-config sample lets you switch motor configuration", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Motor comparison/ }).click();
    await expect(page.getByRole("heading", { name: /Loft Demo/ })).toBeVisible();

    // The picker appears and the default configuration (H128W) is flown.
    const picker = page.getByLabel("Motor configuration");
    await expect(picker).toBeVisible();
    await expect(page.getByText("H128W", { exact: false }).first()).toBeVisible();

    // Switching to the G40W configuration re-flies and shows that motor.
    await picker.selectOption("1");
    await expect(page.getByText("G40W", { exact: false }).first()).toBeVisible();

    // Each configuration compares against its own stored OpenRocket results.
    await expect(page.getByRole("heading", { name: "OpenRocket vs Loft" })).toBeVisible();
  });

  test("nose ballast re-flies the design heavier — a lower apogee", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // Open the edit panel and add a heavy nose ballast — a "what-if" design change.
    await page.locator("summary", { hasText: "Conditions" }).click();
    await page.getByLabel(/Nose ballast/).fill("500");

    // Re-flies on change: the heavier rocket doesn't reach as high.
    await expect.poll(apogee).toBeLessThan(before);
  });

  test("unit toggle switches to imperial", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await page.getByRole("button", { name: "Imperial" }).click();
    // The altitude plot title becomes "Altitude (ft) vs time".
    await expect(page.getByRole("heading", { name: /Altitude \(ft\) vs time/ })).toBeVisible();
  });

  test("has no serious accessibility violations on the home page", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });

  test("has no serious accessibility violations on the results view", async ({ page }) => {
    // Audit the full results state — stat grid, warnings, plots, and the design-tool comparison
    // table — not just the empty landing page. The comparison table renders deviation values in a
    // semantic caution colour, exactly the honesty-relevant numbers that must stay readable.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await page.getByRole("heading", { name: "Flight", exact: true }).waitFor();
    await expect(page.getByRole("heading", { name: "OpenRocket vs Loft" })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });

  test("has no serious accessibility violations on the results view in dark mode", async ({
    page,
  }) => {
    // Muted labels on the dark background are the easiest contrast trap; audit dark explicitly.
    await page.addInitScript(() => localStorage.setItem("loft.theme", "dark"));
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await page.getByRole("heading", { name: "Flight", exact: true }).waitFor();
    await expect(page.getByRole("heading", { name: "OpenRocket vs Loft" })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });

  test("works offline after an online visit — shell, sample import, and sim", async ({
    page,
    context,
  }) => {
    // The pad has no cell signal; once Loft has loaded online it must run with the network cut.
    await page.goto("/", { waitUntil: "networkidle" });
    // Wait for the real readiness signal, not a proxy: the worker controls the page AND
    // everything needed to run offline is actually in CacheStorage — every /_next/ build asset
    // the shell references (so the app can hydrate after an offline reload) plus the sample (so
    // the offline click resolves from cache). Asserting the cached artifacts directly makes this
    // independent of the HTTP disk cache, which is the only reason a shell-only precache appeared
    // to work locally while failing on the CI Chromium.
    await page.waitForFunction(
      async () => {
        if (!navigator.serviceWorker?.controller) return false;
        const referenced = [...document.querySelectorAll("script[src], link[href]")]
          .map((n) => n.getAttribute("src") || n.getAttribute("href"))
          .filter((u): u is string => u != null && u.includes("/_next/"));
        const needed = [...referenced, "/samples/demo-single-deploy.ork"];
        for (const u of needed) {
          if (!(await caches.match(new URL(u, location.origin).pathname))) return false;
        }
        return true;
      },
      null,
      { timeout: 15000 },
    );

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });

    // The app shell loads from cache.
    await expect(page.getByRole("button", { name: /38 mm single-deploy/ })).toBeVisible();

    // A bundled sample — fetched on demand, never clicked while online — still imports and
    // simulates with no connection, because the service worker precached the sample designs.
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByLabel("Results").getByText("Apogee", { exact: true })).toBeVisible();

    await context.setOffline(false);
  });
});
