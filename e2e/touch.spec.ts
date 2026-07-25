import { test, expect, devices } from "@playwright/test";

/** Phone-layout checks. The stated mobile use is a pad check with gloves on, so the primary
 *  controls have to be genuinely tappable — and the markup has to be clean, which is not a given
 *  when a style token is shared between server and client components. */

const ROUTES = ["/", "/docs", "/docs/methods", "/docs/limitations", "/docs/validation", "/docs/faq"];

// Phone viewport for the whole file. `test.use` with a device has to sit at the top level —
// inside a describe it would force a new worker, which Playwright rejects.
test.use({ viewport: devices["iPhone 13"].viewport, userAgent: devices["iPhone 13"].userAgent, hasTouch: true, isMobile: true });

test.describe("phone layout", () => {
  test("no client-reference stub leaks into a class attribute", async ({ page }) => {
    // A token exported from a `"use client"` module and interpolated into a `className` by a
    // SERVER component serialises Next's throwing stub straight into the HTML — the site shipped
    // `class="… function(){throw Error("Attempted to call TOUCH_TARGET() from the server…")}"` on
    // every page's header, which silently dropped the utility it was meant to add. Cheap to check,
    // and it fires on any future token that drifts back into a client module.
    for (const route of ROUTES) {
      await page.goto(route);
      const bad = await page.$$eval("[class]", (ns) =>
        ns
          .map((n) => (typeof n.className === "string" ? n.className : ""))
          .filter((c) => /Attempted to call|function\s*\(|\[object /.test(c))
          .slice(0, 3),
      );
      expect(bad, `serialised stub in a class attribute on ${route}`).toEqual([]);
    }
  });

  test("the header and import controls clear a 44 px hit target", async ({ page }) => {
    await page.goto("/");
    const short = await page.$$eval("header a, header button, main button", (ns) =>
      ns
        .map((n) => {
          const r = n.getBoundingClientRect();
          return { t: (n.textContent || "").trim().replace(/\s+/g, " ").slice(0, 28), h: Math.round(r.height) };
        })
        // The wordmark is a heading that happens to link home, not a control to hit.
        .filter((x) => x.t && x.t !== "Loft" && x.h > 0 && x.h < 44),
    );
    expect(short, "controls under the 44 px touch minimum").toEqual([]);
  });

  test("the workspace tabs and unit toggle clear it once a design is loaded", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 30_000 });
    for (const name of ["Flight", "Design", "Analyze"]) {
      const box = await page.getByRole("tab", { name, exact: true }).first().boundingBox();
      expect(box?.height ?? 0, `${name} tab height`).toBeGreaterThanOrEqual(44);
    }
    for (const name of ["Metric", "Imperial"]) {
      const box = await page.getByRole("button", { name, exact: true }).first().boundingBox();
      expect(box?.height ?? 0, `${name} height`).toBeGreaterThanOrEqual(44);
    }
  });

  test("plot and flight-path labels render at the size they claim", async ({ page }) => {
    // An SVG with a fixed viewBox scales its type with the container: the plots declared 640 user
    // units inside a ~330 px phone column, so a 10 px axis label came out at ~5 px and every plot
    // was unreadable on the form factor the pad check happens on. The charts now measure
    // themselves so a user unit IS a CSS pixel; this asserts the rendered result, not the code.
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 30_000 });
    const smallest = await page.$$eval("figure svg text", (ns) =>
      ns
        .filter((n) => (n.textContent || "").trim().length > 0 && n.getBoundingClientRect().height > 0)
        .map((n) => {
          // The declared font-size scaled by however the viewBox maps onto the rendered box.
          const svg = n.closest("svg")!;
          const vb = svg.viewBox.baseVal;
          const scale = vb && vb.width ? svg.getBoundingClientRect().width / vb.width : 1;
          return Math.round(parseFloat(getComputedStyle(n).fontSize) * scale * 10) / 10;
        })
        .sort((a, b) => a - b)
        .slice(0, 3),
    );
    expect(smallest.length, "no chart labels found").toBeGreaterThan(0);
    for (const size of smallest) expect(size, "chart label effective font size (px)").toBeGreaterThanOrEqual(8.5);
  });

  test("the workspace tabs stay reachable however far you scroll", async ({ page }) => {
    // A workspace runs many screens deep on a phone — the flight view alone is over ten thousand
    // pixels — and switching to Design meant scrolling all the way back to the top first.
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    const tabs = page.locator('[role="tablist"]');
    await page.mouse.wheel(0, 4000);
    await expect
      .poll(async () => Math.round((await tabs.boundingBox())?.y ?? -999))
      .toBeLessThanOrEqual(1);
    // Still usable where it landed, not merely visible.
    await tabs.getByRole("tab", { name: "Design" }).click();
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeVisible();
  });

  test("no page scrolls horizontally on a phone", async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route);
      const [scrollW, innerW] = await page.evaluate(() => [
        document.documentElement.scrollWidth,
        window.innerWidth,
      ]);
      expect(scrollW, `horizontal overflow on ${route}`).toBeLessThanOrEqual(innerW);
    }
  });
});
