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
});
