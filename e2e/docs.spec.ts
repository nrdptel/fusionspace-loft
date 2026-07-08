import { test, expect } from "@playwright/test";

test.describe("Docs", () => {
  test("the docs hub links to the trust pages", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.getByRole("heading", { name: "What Loft is" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Methods" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Limitations log" }).first()).toBeVisible();
  });

  test("methods page cites Barrowman", async ({ page }) => {
    await page.goto("/docs/methods");
    await expect(page.getByText("Barrowman", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/static margin/i).first()).toBeVisible();
  });

  test("validation page shows the build-time comparison table", async ({ page }) => {
    await page.goto("/docs/validation");
    await expect(page.getByRole("heading", { name: "Validation", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bundled sample comparisons" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Apogee", exact: true }).first()).toBeVisible();
  });

  test("docs are reachable from the header", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Docs" }).first().click();
    await expect(page).toHaveURL(/\/docs\/?$/);
  });
});
