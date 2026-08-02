import { test, expect, type Page, type Locator } from "@playwright/test";

/** P2 clause 3: **no route is more than two screens deep to its primary answer.**
 *
 *  This is the one clause of the milestone with no other home. It cannot be a vitest test — that
 *  suite runs in a `node` environment over `lib/` and `app/`, and depth is a laid-out measurement
 *  that only exists once a browser has done layout. It cannot be the static-export check either,
 *  which reads bytes rather than boxes.
 *
 *  **Depth is not page height.** The two were conflated once already and the record read as a
 *  failure for it: a total scroll height of ~5 phone screens says nothing about how far down the
 *  answer is, because most of that height is what comes AFTER it. What this asserts is the distance
 *  from the top of the document to the top of the one element that answers the question the route
 *  exists to answer — `getBoundingClientRect().top + scrollY`, which does not depend on where the
 *  page happens to be scrolled when it is read.
 *
 *  **One screen is defined here, or the clause is unpinnable.** 900 px on desktop and 664 px on the
 *  phone. 664 rather than Playwright's iPhone-13 844 because 664 is the short phone the app has been
 *  cold-walked on, and it is the stricter number: at 844 every route reads about a fifth shallower
 *  and this check would pass straight through a real regression.
 *
 *  Each route asserts twice. The DEPTH assert is the clause. The CONTROL assert — that the anchor
 *  was found at all — is there because a locator matching nothing is how a check like this passes
 *  for the worst possible reason, and this suite already carries scars from exactly that.
 *
 *  The last test is the one that will actually fire. The worst measured depth is well inside the
 *  threshold, so the per-route asserts tolerate a real regression before they complain. But every
 *  route's depth is built on ONE shared term — the chrome above the workspace spine, which all four
 *  routes carry — so that term is ratcheted directly. Anything added above the spine is added to all
 *  four routes at once, and this is where it gets caught. */

const SAMPLE = /38 mm single-deploy/;

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 664 };

/** Distance from the top of the document to the top of `el`, in CSS pixels. */
const depthOf = (l: Locator): Promise<number> =>
  l.evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY));

/** Load the bundled sample and wait for the flight to be on screen. */
async function loadSample(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: SAMPLE }).click();
  await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 30_000 });
}

/** Go to a workspace route with a design already loaded, and wait for THAT workspace to render.
 *
 *  Every panel is mounted on every route — only `hidden` moves — so the readiness signal has to be
 *  the target route's own panel becoming visible. Waiting on anything from the Flight panel would
 *  wait forever on the other three. */
async function goWorkspace(page: Page, route: string): Promise<Locator> {
  await page.goto(route);
  const panel = page.locator(`#panel-${route.replace(/^\//, "").replace(/\/$/, "")}`);
  await expect(panel, `${route} never showed its own panel`).toBeVisible({ timeout: 30_000 });
  return panel;
}

/** The element that answers each route's question, and what it is.
 *
 *  `sweep` is the awkward one and is handled separately below: its answer does not exist until the
 *  flyer asks for it, so measuring the button would measure the ASK, not the answer. */
const ANCHORS: { route: string; what: string; find: (p: Page) => Locator }[] = [
  {
    route: "/flight",
    what: "the Apogee tile",
    find: (p) => p.locator("#panel-flight").getByText("Apogee", { exact: true }).first(),
  },
  {
    route: "/design",
    what: "the airframe drawing",
    find: (p) => p.locator("#panel-design svg[aria-label*='Scale side-view']").first(),
  },
  {
    // The route's primary answer is the comparison against the tool the file came from. Anchored on
    // the heading rather than a table because a design whose file stores no results still gets this
    // section — it says so, which IS the answer for that design. (The bundled samples are exactly
    // that case: they carry `status="external"` simulations with no flight data, so a `table`
    // locator here would match nothing and the control below would fire.) The RocketPy cross-check
    // sits lower, at 2.14 screens on the short phone, and is not asserted: it calls itself a
    // "Second opinion", which is the definition of not being the primary answer.
    route: "/validate",
    what: "the stored-tool comparison",
    find: (p) => p.locator("#panel-validate").getByRole("heading", { name: /comparison/i }).first(),
  },
];

for (const size of [DESKTOP, PHONE]) {
  const label = size === DESKTOP ? "desktop" : "phone";
  const screens = (px: number) => +(px / size.height).toFixed(2);

  test.describe(`${label} ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test("no route is more than two screens deep to its primary answer", async ({ page }) => {
      await loadSample(page);
      const tooDeep: string[] = [];
      const missing: string[] = [];
      for (const a of ANCHORS) {
        await goWorkspace(page, a.route);
        const el = a.find(page);
        // The control: a missing anchor is not a pass, it is a broken check.
        if ((await el.count()) === 0) {
          missing.push(`${a.route}: ${a.what} was not found`);
          continue;
        }
        const px = await depthOf(el);
        if (px > 2 * size.height) tooDeep.push(`${a.route}: ${a.what} at ${px}px = ${screens(px)} screens`);
      }
      expect(missing, "an anchor was not found, so its route was never actually measured").toEqual([]);
      expect(tooDeep, `more than two ${size.height}px screens deep to the primary answer`).toEqual([]);
    });

    test("the sweep's answer, not just the button that asks for it, is within two screens", async ({ page }) => {
      // WAS a known breach on the phone, pinned with `test.fail` rather than described: measured
      // 2026-08-01 at 390x664 the first swept-motor row landed at 1393 px = 2.10 screens, against a
      // gap of 65 px. The cause was never this panel — it was the 1071 px of shared chrome above the
      // workspace spine (header 73, toolbar 68, restore banner 112, collapsed Conditions 44, design
      // summary 508, warnings 74), 1.61 screens before any workspace rendered a pixel.
      //
      // CLOSED 2026-08-02 by folding the design summary's reference figures behind a phone-only
      // control, which took the shared chrome to 914 px — identical on all four routes, so every one
      // of them got the 157 px back, not just this one. The marker is deleted rather than left
      // passing-as-failing, which is what the comment it replaces asked the next session to do.
      // Desktop is unchanged at 773 px, re-measured after the fold to make sure the split grid did
      // not cost width what it saved in height.
      await loadSample(page);
      await goWorkspace(page, "/sweep");
      const run = page.getByRole("button", { name: /Run motor sweep/ });
      await expect(run, "the motor sweep is this route's primary answer and must be offered").toBeVisible();
      await run.click();
      const row = page.locator("#panel-sweep table tbody tr").first();
      await expect(row, "the motor sweep produced no rows, so there is no answer to measure").toBeVisible({
        timeout: 60_000,
      });
      const px = await depthOf(row);
      expect(px, `the first swept motor sits ${screens(px)} screens down, past two ${size.height}px screens`)
        .toBeLessThanOrEqual(2 * size.height);
    });
  });
}

test.describe("the shared chrome every route's depth is built on", () => {
  // A ratchet, not a limit anybody designed to. Each cap is the measured distance to the workspace
  // spine plus a little slack, so a regression fires here — where the cause is named — long before
  // it pushes any single route past the two-screen line.
  // Caps are the measured value plus ~5%: tight enough that the design summary growing a line
  // fires them, loose enough that a font-metric difference does not.
  for (const [size, cap] of [
    [DESKTOP, 820],
    [PHONE, 960],
  ] as const) {
    const label = size === DESKTOP ? "desktop" : "phone";
    test(`${label}: the workspace spine stays within ${cap}px of the top`, async ({ page }) => {
      await page.setViewportSize(size);
      await loadSample(page);
      // Measured on every route rather than one. It comes out identical on all four — 773 px
      // desktop, 914 px phone, re-measured 2026-08-02 after the design summary's reference figures
      // were folded behind a phone-only control (the phone term was 1071 px before that, and the
      // cap 1120). This is ONE term every route's depth is built on, so the check should fail on
      // whichever route grows it first rather than trusting that they stay in step. The phone cap
      // came down with the measurement: a ratchet left at its old value has stopped ratcheting.
      const deepest: string[] = [];
      for (const route of ["/flight", "/design", "/sweep", "/validate"]) {
        await goWorkspace(page, route);
        const spine = page.locator("nav[aria-label='Workspace']").first();
        await expect(spine, `the workspace spine was not found on ${route}`).toBeVisible();
        const px = await depthOf(spine);
        if (px > cap) deepest.push(`${route}: spine at ${px}px`);
      }
      expect(deepest, `the chrome above the spine grew past ${cap}px — every route's depth grew with it`).toEqual([]);
    });
  }
});
