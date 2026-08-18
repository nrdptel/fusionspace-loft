import { test, expect, type Page } from "@playwright/test";

/** Offline, with a design open — the case the whole offline claim is sold on.
 *
 *  **The suite already had an offline test and it could not fail for this.** `e2e/smoke.spec.ts`
 *  goes offline with NO design loaded, which is the one path that stays stable, and then asserts
 *  something is visible — true during the loop's visible phase whether the app loops or not. So the
 *  claim in `MAINTAINING.md` and `DESIGN.md` that Loft works at the pad with no signal rested on a
 *  check that never entered the state it is about.
 *
 *  **Measured 2026-08-18, before the fix:** with a design open and the network off, reloading a
 *  workspace ran **38 main-frame navigations in 3 seconds** and **50 in 4**, and did not stop. The
 *  client router asks for `<route>.txt` on every client-side navigation; none was precached, so the
 *  worker answered its own synthetic 504, the router downgraded to a hard navigation, the reload
 *  re-ran the session restore, and the restore issued the same navigation again.
 *
 *  **Two fixes, and EACH ONE ALONE stops the loop** — measured by removing them in turn, which is
 *  why they get separate cases rather than one. `scripts/gen-sw-precache.mjs` precaches the payloads,
 *  so the navigation succeeds; and the restore no longer navigates to the route the address already
 *  names, so it is not issued. The loop needed both conditions, so *"reloading a workspace settles"*
 *  goes green with either fix in place and cannot speak for the other: the payload cache is pinned by
 *  its own case reading the cache directly, and the guard by an ONLINE navigation count, in the units
 *  it actually moves. Recorded rather than papered over — a single check credited with two fixes is
 *  how one of them gets quietly removed later.
 *
 *  Everything here needs a real service worker, so it runs against the built export the way a flyer
 *  meets it — `npm run build` first, which the suite's `webServer` serves.
 */

const PHONE = { width: 390, height: 844 };

/** A design open, a worker installed, and the network gone. */
async function pinnedOffline(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
  await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({
    timeout: 20000,
  });
  await page.context().setOffline(true);
}

test.describe("offline, with a design open", () => {
  test.use({ viewport: PHONE });

  test("reloading a workspace settles instead of looping", async ({ page }) => {
    await pinnedOffline(page);

    let navigations = 0;
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) navigations += 1;
    });

    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {
      /* offline, the reload itself may reject; the worker answers and the count is what matters */
    });
    await page.waitForTimeout(3000);
    const afterThree = navigations;
    await page.waitForTimeout(3000);

    // **The number that matters is that it STOPS**, not its exact value: a reload plus a possible
    // trailing-slash redirect is two, and the pre-fix reading was 38 in the first three seconds and
    // still climbing. A ceiling of 6 is far above the correct answer and far below a loop.
    expect(afterThree, "the workspace is reloading itself offline").toBeLessThanOrEqual(6);
    expect(
      navigations - afterThree,
      "still navigating three seconds later — this is the loop, not a slow settle",
    ).toBe(0);

    // …and it settled on something real, not on a shell. A stopped loop that ended on a blank page
    // would satisfy the counts above.
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
  });

  test("restoring a session does not navigate to the route the address already names", async ({
    page,
  }) => {
    // **ONLINE, deliberately — this is the half of the fix the offline test cannot see.** Measured
    // 2026-08-18 by removing each fix in turn: with the payloads precached, dropping this guard
    // leaves every case above green, because the redundant navigation is then a cheap soft one. Each
    // fix alone is enough to stop the loop; the loop needed both conditions. So the guard gets its
    // own assertion, in the units it actually moves, rather than being credited to a check that
    // passes without it.
    //
    // Reloading `/flight` restores a session whose landing IS `flight`, so the restore used to issue
    // a navigation to the route the flyer was already on: **3 main-frame navigations, against 2 with
    // the guard.** The third is the replace.
    // **The worker is kept out of this one**, and that is not a convenience. On a first-ever visit
    // it activates immediately and calls `clients.claim()`, the page reloads on `controllerchange`,
    // and that reload is a third main-frame navigation with nothing to do with the router. Counting
    // it would put the bound one above the number the guard moves, which is a check that cannot
    // fail. Every other case in this file needs the worker; this one is about the router alone.
    await page.route("**/sw.js", (r) => r.abort());

    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({
      timeout: 20000,
    });
    // **Wait for the ADDRESS, not just the panel.** The flight renders while the URL still says
    // `/` — `components/LoftApp.tsx` documents that window — so reloading on the heading alone
    // reloads the root, where the restore is SUPPOSED to navigate and the count is 3 whatever this
    // guard does. Getting that wrong is how this case first read as a failure.
    await page.waitForURL(/\/flight\/?$/, { timeout: 20000 });

    let navigations = 0;
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) navigations += 1;
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({
      timeout: 20000,
    });
    await page.waitForTimeout(2000);

    expect(
      navigations,
      "the session restore navigated to the workspace the address already named",
    ).toBeLessThanOrEqual(2);
  });

  test("every workspace is still reachable, and reads as itself", async ({ page }) => {
    await pinnedOffline(page);
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});

    // One per workspace, each a HEADING only that workspace renders. All four panels are in the
    // document at once — `#panel-flight` … `#panel-validate` are always present and hidden by CSS —
    // so a text search would resolve against a hidden sibling and a character count would pass on
    // four copies of the same thing. A heading, matched by role, is what a flyer would look at.
    //
    // (`getByText(/Apogee/i)` was the first draft for the flight panel and it resolved to a hidden
    // paragraph on the weather control, on every workspace. Corrected by running it.)
    const marks: [string, RegExp][] = [
      ["design", /^Design geometry$/],
      ["sweep", /^Compare fitting motors$/],
      ["validate", /^OpenRocket comparison$/],
      ["flight", /^Flight path$/],
    ];
    for (const [w, mark] of marks) {
      await page.locator(`nav a[href="/${w}"]`).first().click();
      await expect(
        page.getByRole("heading", { name: mark }).first(),
        `offline, /${w} did not render its own content`,
      ).toBeVisible({ timeout: 15000 });
    }
  });

  test("serves the brand marks it draws, rather than a hole where they were", async ({ page }) => {
    // The precache walk read `out/_next/static` only, so nothing else in `out/` was ever cached:
    // measured 2026-08-18, both brand SVGs returned the worker's synthetic 504 offline and the app
    // came back at the pad with no logo. Asserted through the worker rather than by looking at the
    // page, because a broken <img> is invisible to a text assertion.
    await pinnedOffline(page);
    for (const asset of ["/brand/fusion-space-wordmark.svg", "/brand/fusion-space-mark.svg", "/manifest.webmanifest"]) {
      const status = await page.evaluate(
        async (u) => (await fetch(u)).status,
        asset,
      );
      expect(status, `${asset} is not available offline`).toBe(200);
    }
  });

  test("has the router payload for every workspace route in its cache", async ({ page }) => {
    // The direct statement of the root cause, so a future build that stops emitting these — or a
    // precache list that stops collecting them — fails here rather than as a loop somebody has to
    // reproduce. Read with `ignoreSearch`, which is how the worker answers them: the router appends
    // a per-build `?_rsc=` cache-buster that the precached entry does not carry.
    await pinnedOffline(page);
    const missing = await page.evaluate(async () => {
      const out: string[] = [];
      for (const p of ["/flight.txt", "/design.txt", "/sweep.txt", "/validate.txt"]) {
        const hit = await caches.match(p, { ignoreSearch: true });
        if (!hit) out.push(p);
      }
      return out;
    });
    expect(missing, "router payloads missing from the offline cache").toEqual([]);
  });
});
