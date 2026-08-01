import { test, expect, devices } from "@playwright/test";

/** The touch contract on a phone the flyer has TURNED SIDEWAYS.
 *
 *  Its own file because `test.use` with a device has to sit at the top level — the same reason
 *  `touch.spec.ts` says — and this one needs a different viewport from that one.
 *
 *  **Why it exists.** `DESIGN.md` §8 makes 44 px the minimum "on `pointer: coarse`, everywhere, not
 *  just where it was first measured". Until 2026-08-01 `TOUCH_TARGET` was `min-h-11 sm:min-h-0`,
 *  which releases the floor at a 640 px VIEWPORT — and a Pixel 7 in landscape is 863 px. Measured
 *  against the built export before the fix: **6** controls under 44 px in portrait and **82** on the
 *  same phone rotated. Every hit-target test in the suite ran portrait-only, so nothing could see it.
 *
 *  The width the flyer holds the phone at is not a statement about their finger. */
test.use({
  viewport: devices["Pixel 7 landscape"].viewport,
  userAgent: devices["Pixel 7 landscape"].userAgent,
  hasTouch: true,
  isMobile: true,
});

/** Every control the walk measured, minus the ones §8 and WCAG genuinely exempt. Kept as a named
 *  list rather than a filter buried in the assertion, because an exemption nobody can see is how a
 *  check quietly stops meaning anything. */
const EXEMPT = [
  // WCAG 2.5.8's "inline in a block of text" exemption — a link inside a sentence cannot be padded
  // to 44 px without breaking the line it sits in. The footer's and the docs nav's links are NOT
  // exempt and are asserted by `touch.spec.ts`; these are prose.
  "inline-prose-link",
  // A heading that happens to link home, not a control to hit — `touch.spec.ts` exempts it too.
  "Loft",
  // Visually hidden until focused, and its own size is not a touch surface.
  "Skip to content",
];

test.describe("phone layout, landscape", () => {
  test("the pointer decides the hit target, not the viewport width", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "Design", exact: true }).click();
    // The one-shot `$$eval` below measures whatever is on screen when it runs, and a workspace
    // switch is a navigation: without this it could census the workspace just left, or a panel
    // still hidden (every rect zero), and report no short controls for the wrong reason.
    await page.waitForURL(/\/design\/?$/);
    await expect(page.getByLabel(/Scale side-view/)).toBeVisible();

    const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
    expect(coarse, "this context must report a coarse pointer or the test proves nothing").toBe(true);
    const width = await page.evaluate(() => window.innerWidth);
    expect(width, "and it must be WIDER than the sm: breakpoint, which is the whole point").toBeGreaterThan(640);

    const short = await page.$$eval(
      'header button, header a[href], main button, main select, nav[aria-label="Workspace"] a',
      (ns, exempt) =>
        ns
          .map((n) => {
            const r = n.getBoundingClientRect();
            const name = (n.getAttribute("aria-label") || n.textContent || "").trim().replace(/\s+/g, " ");
            return { name: name.slice(0, 32), w: Math.round(r.width), h: Math.round(r.height) };
          })
          .filter((x) => x.w > 0 && x.h > 0 && x.h < 44 && !exempt.includes(x.name)),
      EXEMPT,
    );
    expect(short, "controls under the 44 px touch minimum on a landscape phone").toEqual([]);
  });

  test("nothing pushes the page sideways when the phone is turned", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 30_000 });
    for (const tab of ["Flight", "Design", "Sweep", "Cross-check"]) {
      await page.getByRole("link", { name: tab, exact: true }).click();
      // Gated on the address, because a workspace switch is a navigation and `page.evaluate` below
      // is a one-shot read: without it, Design and Sweep could both measure the workspace just
      // left, and a landscape overflow on either would ship green.
      await page.waitForURL(new RegExp(`/${tab === "Cross-check" ? "validate" : tab.toLowerCase()}/?$`));
      await expect(page.locator(`nav[aria-label="Workspace"] a[aria-current="page"]`)).toHaveText(tab);
      // `clientWidth`, never `innerWidth`: under Playwright's mobile emulation Chromium widens the
      // LAYOUT viewport to swallow an overflow, so both sides of an `innerWidth` comparison move
      // together and the assertion cannot fail. `touch.spec.ts` records the measurement.
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over, `${tab} pushed the page sideways in landscape`).toBeLessThanOrEqual(0);
    }
  });
});
