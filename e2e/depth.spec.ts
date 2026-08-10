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
    // `hasTouch` on the phone, and it is not cosmetic: without it the context reports
    // `pointer: fine`, so every control carrying `TOUCH_TARGET` (`pointer-coarse:min-h-11`) renders
    // at its 26 px desktop height instead of 44 px. Measured 2026-08-02: that understated the shared
    // chrome above the workspace spine by 97 px — 914 px on a fine pointer against 1011 px on a
    // coarse one — which is the difference between this contract passing and failing. A phone
    // viewport with a mouse pointer is not a phone, and a depth contract DESIGN.md §8 writes for
    // touch has to be measured on one.
    test.use({ viewport: size, hasTouch: size === PHONE });

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
      // CLOSED 2026-08-02, and on a measurement that holds this time.
      //
      // The history is worth keeping because it is the whole lesson of this check. It was a real
      // breach at 2.10 screens; earlier the same day it was declared closed at 914 px of shared
      // chrome and the marker deleted — on a phone-sized viewport reporting `pointer: fine`, which
      // renders every `TOUCH_TARGET` control at 26 px instead of 44 and understated the chrome by
      // 97 px. The marker went back, with the true figure of 2.12 screens on a coarse pointer.
      //
      // Two changes actually closed it, and neither is this panel's copy being "tightened": the
      // design summary's reference figures folded behind a phone-only control (157 px off the
      // shared chrome, on all four routes at once), and the sweep's own explanatory paragraph is
      // now shown only until the sweep has run — after which the TABLE answers the question the
      // prose was answering, and 140 px of preamble sat between the flyer and their result.
      //
      // Measured on a coarse pointer: the first swept-motor row is at 1260 px = 1.90 screens
      // against the 1328 px two screens allow, so 68 px of headroom. Desktop is 898 px = 1.00.
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

// A ratchet, not a limit anybody designed to. Each cap is the measured distance to the workspace
// spine plus a little slack, so a regression fires here — where the cause is named — long before it
// pushes any single route past the two-screen line.
//
// One describe per size, rather than one test that calls `setViewportSize` twice, because the phone
// needs `hasTouch` and that is a CONTEXT option — it cannot be switched mid-test. Measuring the
// phone with a fine pointer is what made this ratchet report 914 px for a chrome that is 1011 px on
// a real touch device.
// **Desktop moved 820 -> 920 on 2026-08-10, deliberately, and this is the note that makes it a
// decision rather than a drift.** The persistent airframe strip (`COMPETITION.md` row 31) is chrome
// above the spine by construction — that is what "persistent" means — so it costs desktop depth and
// nothing else can pay for it. Measured: 773px before, 909px after, for a 72px drawing plus its
// caption, card padding and the stack gap. 920 is that plus the same slack the other caps carry.
//
// **The phone cap did NOT move, and that is the load-bearing half.** Driven at 390x664 the strip put
// the sweep's first answer 2.13 screens down, past the two-screen rule the cases above enforce — so
// the strip is `hidden sm:block` and a phone's chrome is byte-for-byte what it was. If a future
// change makes the strip render below `sm`, the phone cap here goes red before the two-screen rule
// does, which is the ordering this file is built for: fail where the cause is named.
for (const [size, cap] of [
  [DESKTOP, 920],
  [PHONE, 1060],
] as const) {
  const label = size === DESKTOP ? "desktop" : "phone";
  test.describe(`the shared chrome every route's depth is built on — ${label}`, () => {
    test.use({ viewport: size, hasTouch: size === PHONE });

    test(`${label}: the workspace spine stays within ${cap}px of the top`, async ({ page }) => {
      await loadSample(page);
      // Measured on every route rather than one. It comes out identical on all four — 773 px
      // desktop, 1011 px phone ON A COARSE POINTER, measured 2026-08-02. Two corrections landed in
      // that number on the same day: the design summary's reference figures were folded behind a
      // control (worth 157 px, phone chrome had been 1071), and the phone context gained `hasTouch`,
      // which put back 97 px of `TOUCH_TARGET` growth the fine-pointer measurement had never seen.
      // The cap moved 1120 → 1060 with it: down, because the fold really did buy room, but not to
      // the 960 a fine pointer would have justified — that number was measured on a phone that does
      // not exist. This is ONE term every route's depth is built on, so the check should fail on
      // whichever route grows it first rather than trusting that they stay in step.
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
  });
}
