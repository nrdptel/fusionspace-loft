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
  // The wordmark, and this entry is a KNOWN GAP rather than an exemption. It renders 37x28 on the
  // app routes and is short of `DESIGN.md` §8; what blocks the fix is `e2e/depth.spec.ts`'s 1060 px
  // phone chrome cap, which the 16 px it costs would breach on all four workspaces (measured
  // 2026-08-13: baseline 1055, with the fix 1071). `ROADMAP.md` P15 and `BACKLOG.md` carry it.
  //
  // **It is matched by LABEL here, and `touch.spec.ts` no longer does that.** P15 increment 2
  // replaced the sibling filter with `header h1 > a`, because keying an exemption on a control's own
  // visible label silently un-exempts it when the label is reworded and silently exempts anything
  // else that comes to share it. This file's exclusion list is label-keyed by construction — every
  // entry in it is a string — so converting this one properly means changing the list's shape, which
  // is its own increment and is filed. Left label-keyed, deliberately and visibly, rather than
  // quietly.
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

test("a phone turned sideways keeps the rocket lying down", async ({ page }) => {
  // **`DESIGN.md` §8's orientation rule is keyed on portrait AND coarse, and this is the half that
  // says why.** A drawing is laid along the screen's LONG axis; turned sideways, that is horizontal
  // again. At this viewport (863x360) the drawing column gives a horizontal airframe ~831 px of
  // width, where a vertical one would get at most ~340 px of height — so rotating here is not a
  // smaller win, it is a loss, and keying the rule on a coarse pointer alone would have taken it.
  //
  // Asserted on the drawn box rather than on a media query, because the media query is the mechanism
  // and the shape on screen is the promise.
  await page.goto("/");
  await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
  await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Design", exact: true }).click();
  const svg = page.getByLabel(/Scale side-view/).first();
  await expect(svg).toBeVisible();
  const b = (await svg.boundingBox())!;
  expect(
    b.width,
    `the airframe stood up in landscape: ${Math.round(b.width)}x${Math.round(b.height)}`,
  ).toBeGreaterThan(b.height);
  // And it is using the width it has, rather than being drawn small in a wide box.
  expect(b.width).toBeGreaterThan(600);
});
