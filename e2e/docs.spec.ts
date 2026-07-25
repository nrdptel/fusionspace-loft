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

  test("validation page is explicit about what the samples do and don't show", async ({ page }) => {
    await page.goto("/docs/validation");
    await expect(page.getByRole("heading", { name: "Validation", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /What the bundled samples/ })).toBeVisible();
    // The real cross-check — an independent engine over the same designs — is still tabulated.
    await expect(page.getByRole("heading", { name: /Against RocketPy/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Apogee", exact: true }).first()).toBeVisible();
  });

  test("docs are reachable from the header", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Docs" }).first().click();
    await expect(page).toHaveURL(/\/docs\/?$/);
  });

  test("every docs page is readable offline, and each is itself", async ({ page, context }) => {
    // The pad has no signal, and the pad is exactly where "how far do I trust this number?"
    // gets asked. Each page must come back as ITSELF offline — a shell fallback that answers
    // every /docs/* URL with the landing page is worse than a plain error, because it reads
    // as though the limitations log simply has nothing to say.
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForFunction(
      async () => {
        if (!navigator.serviceWorker?.controller) return false;
        for (const u of ["/", "/docs", "/docs/methods", "/docs/limitations", "/docs/validation", "/docs/faq"]) {
          if (!(await caches.match(u))) return false;
        }
        return true;
      },
      null,
      { timeout: 20000 },
    );

    await context.setOffline(true);

    // A phrase that appears on that page and nowhere else in the docs.
    const pages: [string, RegExp][] = [
      ["/docs", /The three pages that matter/],
      ["/docs/methods", /Aerodynamic stability — Barrowman/],
      ["/docs/limitations", /^Known limitations/],
      ["/docs/validation", /Against RocketPy/],
      ["/docs/faq", /^FAQ$/],
    ];
    for (const [path, mark] of pages) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: mark }).first(), `${path} offline`).toBeVisible();
    }

    // And the reverse: visiting the docs must not leave the home page cached as a docs page.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /38 mm single-deploy/ })).toBeVisible();

    await context.setOffline(false);
  });
});
