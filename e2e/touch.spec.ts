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

  test("the workspace spine and unit toggle clear it once a design is loaded", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 30_000 });
    for (const name of ["Flight", "Design", "Sweep", "Cross-check"]) {
      const box = await page.getByRole("link", { name, exact: true }).first().boundingBox();
      expect(box?.height ?? 0, `${name} link height`).toBeGreaterThanOrEqual(44);
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

  test("the workspace spine stays reachable however far you scroll", async ({ page }) => {
    // A workspace runs many screens deep on a phone — the flight view alone is over ten thousand
    // pixels — and switching to Design meant scrolling all the way back to the top first.
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    const spine = page.locator('nav[aria-label="Workspace"]');
    await page.mouse.wheel(0, 4000);
    await expect
      .poll(async () => Math.round((await spine.boundingBox())?.y ?? -999))
      .toBeLessThanOrEqual(1);
    // Still usable where it landed, not merely visible.
    await spine.getByRole("link", { name: "Design" }).click();
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeVisible();
  });

  test("no page scrolls horizontally on a phone", async ({ page }) => {
    // Three widths, not one, and the two extra ones are the point. This file runs at the iPhone 13's
    // 390 px, and on 2026-07-31 a header change that fitted there overflowed a 360 px phone by 10 px
    // and a 320 px one by 19 px — with the whole gate green, because nothing ever asked. 360 px is
    // the Galaxy S8/S9 class and 320 px is the narrowest viewport still in the wild (iPhone SE 1st
    // gen); both are real, and the contract in `DESIGN.md` §8 has no width qualifier on it.
    // Measured before the fix: 320 px already overflowed by 19 px and had done for some time.
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of ROUTES) {
        await page.goto(route);
        // Against `clientWidth`, NOT `window.innerWidth`, and that is the whole reason this test
        // could not fail before. Under `isMobile` emulation Chromium widens the LAYOUT viewport to
        // swallow an overflow: measured on the reverted header, a 320 px viewport reported
        // `scrollWidth` 370 and `innerWidth` 370 — equal, so the assertion passed — while
        // `clientWidth` correctly still read 320. The old comparison was therefore green whether the
        // page overflowed or not, at every width, for as long as it has existed. `clientWidth` is the
        // CSS viewport the layout is actually laid out in, so the two sides are the same units.
        const [scrollW, clientW] = await page.evaluate(() => [
          document.documentElement.scrollWidth,
          document.documentElement.clientWidth,
        ]);
        expect(scrollW, `horizontal overflow on ${route} at ${width}px`).toBeLessThanOrEqual(clientW);
      }
    }
  });

  test("no workspace scrolls horizontally once a design is loaded", async ({ page }) => {
    // The check above walks the static ROUTES, every one of which renders with NO design — so the
    // surfaces that only exist once a flight has been computed were never measured at any width. The
    // metric-tile grid is the sharp case: it is `grid-cols-2` of mono numerals, and P1's card
    // conversion repadded it from `p-3` to §4's `p-4`, narrowing the content box by 8 px per tile.
    // That was measured by hand at the time and nothing re-measured it afterwards, which is the gap
    // this test closes.
    // Loaded ONCE and then resized, rather than reloaded per width: the session persists, so a
    // second `goto("/")` restores the design and the import panel — with its sample buttons — is not
    // rendered at all. The first version of this test reloaded each time and timed out on the second
    // width waiting for a control that no longer existed.
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 30000 });

    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 844 });

      for (const tab of ["Flight", "Design", "Sweep", "Cross-check"]) {
        await page.getByRole("link", { name: tab }).click();
        await expect(page.locator('nav[aria-label="Workspace"] a[aria-current="page"]')).toHaveText(tab);
        // CONTROL: the grid must actually be on the page, or this measures an empty workspace and
        // reports no overflow for the best possible reason.
        if (tab === "Flight") {
          await expect(page.getByText("Apogee", { exact: true }).first()).toBeVisible();
        }
        const [scrollW, clientW] = await page.evaluate(() => [
          document.documentElement.scrollWidth,
          document.documentElement.clientWidth,
        ]);
        expect(scrollW, `horizontal overflow on the ${tab} workspace at ${width}px`).toBeLessThanOrEqual(clientW);

        // Page-level overflow is NOT the failure mode for a grid, and finding that out is why this
        // second assertion exists. A negative control that repadded the metric tiles to `p-12` left
        // the page width unchanged and the check above green — the grid columns simply shrank and
        // the numerals overflowed their own tiles instead.
        //
        // Scoped to the tiles rather than to everything in `main`, deliberately. A sweep over every
        // element reports six hits on an untouched tree, all of them correct behaviour: the header's
        // title block is `min-w-0` precisely so it may shrink and truncate (that is the fix that took
        // 320 px to zero overflow in the first place), a text `<input>` reports its full value width,
        // and an SVG `<text>` is not a box at all. An assertion that has to be excused on a clean
        // tree teaches a session to ignore it.
        const clipped = await page.evaluate(() => {
          const tiles = [...document.querySelectorAll("main div.rounded-xl")].filter((el) =>
            el.querySelector(":scope > div.uppercase"),
          );
          const bad: string[] = [];
          for (const tile of tiles) {
            for (const el of [tile, ...tile.querySelectorAll("div")]) {
              if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) {
                bad.push(`"${(el.textContent || "").trim().slice(0, 24)}" needs ${el.scrollWidth}px in ${el.clientWidth}px`);
              }
            }
          }
          return { count: tiles.length, bad };
        });
        // CONTROL: no tiles found means the assertion below passes for the worst possible reason.
        if (tab === "Flight") expect(clipped.count).toBeGreaterThan(8);
        expect(clipped.bad, `a metric tile clips its own value on ${tab} at ${width}px:\n${clipped.bad.join("\n")}`)
          .toHaveLength(0);
      }
    }
  });

  test("the design editor's own controls clear the hit target too", async ({ page }) => {
    // The workspace a pad check actually uses. Its ~20 what-if fields, its material and shape
    // pickers, its zoom buttons and its parts-table headers were all under the project's own 44 px
    // minimum — 34 px for a field, 24 px for a zoom button — while the header and tabs met it.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    const panel = page.locator("#panel-design");
    const short: string[] = [];
    for (const el of await panel.locator("input[type=number], select, button").all()) {
      const box = await el.boundingBox();
      if (!box || box.height === 0) continue; // not laid out (a closed disclosure)
      if (box.height < 44) short.push(`${Math.round(box.width)}x${Math.round(box.height)}`);
    }
    expect(short, `controls under the 44 px hit target: ${short.join(", ")}`).toEqual([]);

    // A one-glyph control needs the minimum in both directions — height alone leaves a 24 px sliver.
    for (const name of ["Zoom in", "Zoom out"]) {
      const box = await panel.getByRole("button", { name }).boundingBox();
      expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
    }
  });

  test("every diagram handle is 44 px and resolves to itself", async ({ page }) => {
    // The one control the direct-manipulation story rests on. At a phone's fit-width the five fin
    // handles landed within 10-22 px of each other, and elementFromPoint at the centre of "Fin
    // position" returned "Fin sweep" — that handle could not be tapped at all, and the reachable
    // ones dragged the wrong dimension about half the time. A bigger circle makes that worse, so a
    // coarse pointer gets ONE fin handle, chosen from a chip row.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Design" }).click();

    const picker = page.getByRole("group", { name: "Fin handle" });
    await expect(picker).toBeVisible();
    // One fin handle, plus the nose and the body-diameter handles, which sit far enough apart to
    // coexist. The body-LENGTH grip is deliberately absent here and present on a mouse layout: this
    // very check is what decided that, by reporting the fin root chord's own centre resolving to
    // "Body length" the moment a fourth grip joined the body. At a phone's fit width the airframe is
    // about eleven pixels tall, so every grip on it is inside every other grip's 44 px target.
    await expect(page.locator('g[role="slider"]')).toHaveCount(3);

    const check = async () => {
      for (const h of await page.locator('g[role="slider"]').all()) {
        const name = await h.getAttribute("aria-label");
        const box = await h.boundingBox();
        expect(box, `${name} has no box`).not.toBeNull();
        expect(Math.round(box!.width), `${name} width`).toBeGreaterThanOrEqual(44);
        expect(Math.round(box!.height), `${name} height`).toBeGreaterThanOrEqual(44);
        // The centre of a handle must belong to that handle — the failure was a silent wrong edit,
        // not a missed tap, so size alone would not have caught it.
        const hit = await page.evaluate(
          ([x, y]) =>
            document.elementFromPoint(x, y)?.closest('g[role="slider"]')?.getAttribute("aria-label") ?? null,
          [box!.x + box!.width / 2, box!.y + box!.height / 2],
        );
        expect(hit, `${name} centre resolves to ${hit}`).toBe(name);
      }
    };
    await check();

    // The chip row aims the handle, and every dimension stays reachable — one at a time, not fewer.
    for (const label of ["Span", "Root", "Tip", "Sweep", "Position"]) {
      await picker.getByRole("button", { name: label }).click();
      await expect(page.locator('g[role="slider"]')).toHaveCount(3);
      await check();
    }
  });

  test("every operable control clears the hit target, on every workspace", async ({ page }) => {
    // The existing case scans the Design panel only. These are the surfaces a pad check actually
    // touches on the way there: the sticky header, the Conditions row, the Sweep run buttons and
    // the motor-sweep sort headers were 30-36 px, and the two disclosure rows 16-20 px.
    //
    // Excluded, deliberately, and each for a reason rather than to make the test pass: an inline
    // prose link is text bound by its line height and carries the WCAG "inline in a block of text"
    // exemption; the file input is 1x1 and sr-only behind a visible 44 px trigger; the skip link is
    // offscreen until focused; and the wordmark is exempted by the header test above.
    //
    // The footer used to be excluded WHOLESALE on that reasoning, and the reasoning did not fit:
    // its `<nav>` row is six standalone navigation links, not words in a sentence, and they measured
    // 16 px tall on a 390x844 phone — five of the thirteen controls under target on the Flight
    // workspace. They are in scope now. The footer's prose credits still are not, and the separate
    // footer test below draws that line by structure rather than by region.
    // BOTH dimensions. The scan measured height alone, so a control 37 px wide and 44 px tall was
    // reported clean — and three were: the parts table's `Type` (37x44) and `Mass` (42x44) sort
    // headers, and the motor sweep's `T:W` (34x44). A 34 px target is under the 44x44 this file's
    // own name asserts, in the axis a thumb misses along on a table of adjacent columns. Both tables
    // already scroll horizontally, so the fix is `TOUCH_TARGET_SQUARE` — which existed for exactly
    // this and was already used on the zoom controls — and not a layout change.
    const scan = () =>
      // `nav[aria-label="Workspace"] a` is in this list because the workspace switcher stopped
      // being a `[role=tab]` and became a row of links: the selector kept matching nothing, so the
      // one scan that measures BOTH dimensions of every phone control stopped seeing the app's
      // primary navigation entirely. Its width is checked nowhere else — the two height assertions
      // elsewhere in this suite would pass a 20 px-wide link.
      page.$$eval(
        'button, input:not([type=hidden]), select, summary, nav[aria-label="Workspace"] a',
        (ns) =>
          ns
            .map((n) => {
              const r = n.getBoundingClientRect();
              if (r.width < 4 || r.height < 4) return null;
              if (r.width >= 44 && r.height >= 44) return null;
              if (n.closest("footer")) return null;
              const name = (n.getAttribute("aria-label") || n.textContent || "")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 30);
              return `${n.tagName.toLowerCase()}"${name}" ${Math.round(r.width)}x${Math.round(r.height)}`;
            })
            .filter(Boolean),
      );

    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    expect(await scan(), "Flight workspace").toEqual([]);

    // A workspace switch is a navigation now, not a `setState`, and `scan()` is a one-shot
    // `$$eval`. Without this wait it measured the workspace just left — and every control still in
    // a `hidden` panel has a zero rect, which this scan's own `width < 4` filter drops, so it
    // reported "Sweep workspace" clean by measuring nothing.
    await page.getByRole("link", { name: "Sweep" }).click();
    await page.waitForURL(/\/sweep\/?$/);
    await expect(page.getByRole("region", { name: "Motor sweep" })).toBeVisible();
    expect(await scan(), "Sweep workspace").toEqual([]);

    // Cross-check too — added when Sweep split, because the scan's own `width < 4` filter drops
    // every zero-rect control in a hidden panel, so a workspace this loop does not visit is a
    // workspace whose hit targets are measured nowhere at all.
    await page.getByRole("link", { name: "Cross-check" }).click();
    await page.waitForURL(/\/validate\/?$/);
    await expect(page.locator("#panel-validate")).toBeVisible();
    expect(await scan(), "Cross-check workspace").toEqual([]);

    await page.getByRole("link", { name: "Sweep" }).click();
    await page.waitForURL(/\/sweep\/?$/);
    // The motor-sweep table's sort headers only exist once a sweep has run.
    const sweep = page.getByRole("region", { name: "Motor sweep" });
    await sweep.getByRole("button", { name: /Run/i }).first().click();
    await sweep.getByRole("table").waitFor({ timeout: 120000 });
    expect(await scan(), "Sweep with the motor-sweep table").toEqual([]);

    // The dispersion panel's OWN fields, which nothing had ever measured. The scan above walks the
    // Sweep workspace with the panels CLOSED, so `NumberField` — the primitive §5 says every numeric
    // input in either app is — was never in it: all seven of its instances rendered 36 px tall while
    // `LoftApp`'s hand-rolled `Num`, the thing it is meant to replace, cleared 44. A check that stops
    // at the Run button cannot see the surface behind it.
    await page.getByRole("link", { name: "Sweep" }).click();
    const disp = page.getByRole("region", { name: /dispersion/i });
    await disp.getByRole("button", { name: /Run dispersion/ }).first().click();
    await expect(disp.locator('[role="status"]')).toHaveCount(0, { timeout: 120000 });
    expect(await scan(), "Sweep with the dispersion panel open").toEqual([]);

    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();
    expect(await scan(), "Design workspace with the parts table open").toEqual([]);
  });
  test("the docs section nav is a row of targets, on every docs route", async ({ page }) => {
    // Found by a phone cold walk of the built export, which is the check the suite did not have: the
    // hit-target passes all load a DESIGN first, so nothing had ever measured the docs routes. All
    // five section links rendered **30 px tall** on all six routes — the largest single group of
    // under-target controls anywhere in the walk, on the pages a flyer reads at the pad.
    //
    // Asserted on the `<nav>` specifically, the same structural line the footer test draws: these are
    // navigation controls and need a target, while a link inside a paragraph of docs prose carries the
    // WCAG "inline in a block of text" exemption and is deliberately not swept up here.
    for (const route of ["/docs", "/docs/methods", "/docs/limitations", "/docs/validation", "/docs/faq"]) {
      await page.goto(route);
      const nav = page.getByRole("navigation", { name: "Docs sections" });
      await expect(nav).toBeVisible();
      const links = nav.getByRole("link");
      const n = await links.count();
      // CONTROL: five sections. A nav that rendered none would pass the size assertion perfectly.
      expect(n, `${route}: docs section links`).toBe(5);
      for (let i = 0; i < n; i++) {
        const box = await links.nth(i).boundingBox();
        const label = (await links.nth(i).innerText()).trim();
        expect(box!.height, `${route}: "${label}" is ${Math.round(box!.height)} px tall`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test("the footer's navigation links are targets, not 16 px of text", async ({ page }) => {
    // The one region the hit-target passes never reached. Measured on a 390x844 phone with a design
    // loaded, before this: GitHub 60x16, Docs 28x16, Motor Finder 71x16, Charge 40x16, Window 44x16
    // — five of the thirteen controls under target on the Flight workspace, on the surface the whole
    // pad check happens on.
    //
    // The line is drawn by STRUCTURE, not by region: a link inside the footer's `<nav>` is a
    // navigation control and needs a target; the credit links further down sit inside sentences and
    // carry the WCAG "inline in a block of text" exemption, so they are read separately and asserted
    // to have been left alone — a blanket footer rule is what let the nav row sit at 16 px.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const sizes = (sel: string) =>
      page.$$eval(sel, (ns) =>
        ns
          .map((n) => n.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => Math.round(r.height)),
      );

    const nav = await sizes("footer nav a");
    expect(nav.length, "the footer has navigation links to measure").toBeGreaterThan(3);
    expect(nav.filter((h) => h < 44), `footer nav link heights: ${nav.join(", ")}`).toEqual([]);

    // The prose credits are deliberately untouched — growing them would put gaps in a sentence.
    const prose = await sizes("footer p a");
    expect(prose.length, "the footer has prose links to measure").toBeGreaterThan(0);
    expect(prose.every((h) => h < 44), `prose link heights: ${prose.join(", ")}`).toBe(true);
  });

  test("the shelf's destructive control is a real target, not a sliver beside a big one", async ({ page }) => {
    // It was 24 px wide against a 230-240 px Reopen in the same row — the only control in the import
    // panel that omitted the repo's own hit-target token, and the one that deletes.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("button", { name: /Import another/ })).toBeVisible();
    await page.getByRole("button", { name: /Import another/ }).click();

    const remove = page.getByRole("button", { name: /^Remove / }).first();
    await expect(remove).toBeVisible();
    const box = (await remove.boundingBox())!;
    expect(Math.round(box.width), "remove is 44 px wide, not a sliver").toBeGreaterThanOrEqual(44);
    expect(Math.round(box.height), "remove is 44 px tall").toBeGreaterThanOrEqual(44);

    // And the row still fits: widening the delete target must not push the page sideways.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(0);
  });
  test("every heavy analysis panel can be closed again, at a real touch size", async ({ page }) => {
    // The dispersion run and the two sweeps opened on a Run button and offered nothing that closed
    // them: `setOpen(true)` with no `setOpen(false)` anywhere. Once opened they stayed open for the
    // session — the dispersion panel alone measured 2,195 px open against 308 px closed on a 390 px
    // phone, and an open panel
    // re-flies on every design edit (2.5 s per nose-ballast change, on the main thread).
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "Sweep" }).click();

    const panels: [string, RegExp][] = [
      ["Motor sweep", /Run motor sweep/],
      ["Parameter sweep", /Run parameter sweep/],
      ["Monte-Carlo dispersion", /Run dispersion/],
    ];

    for (const [label, run] of panels) {
      const panel = page.getByRole("region", { name: label });
      const heightOf = async () =>
        Math.round((await panel.evaluate((el) => el.getBoundingClientRect().height)) as number);

      const closed = await heightOf();
      await panel.getByRole("button", { name: run }).click();
      const close = panel.getByRole("button", { name: /^Close/ });
      await expect(close, `${label} offers no way back out`).toBeVisible();

      const box = (await close.boundingBox())!;
      expect(Math.round(box.height), `${label} Close height`).toBeGreaterThanOrEqual(44);

      // Nothing the open panel adds pushes the phone layout sideways. Measured HERE, with the Close
      // button on screen: after the loop every panel is collapsed and no Close button exists, so the
      // same check down there would be measuring the page as if the feature had been deleted.
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        `${label} open pushed the page sideways`,
      ).toBeLessThanOrEqual(0);

      // Let the run settle before comparing heights. Mid-flight a panel can be SHORTER than closed:
      // opening removes the 56 px Run block and adds only a 32 px status line, so the comparison
      // would be a race against the sweep rather than a statement about opening.
      await expect(panel.locator('[role="status"]')).toHaveCount(0, { timeout: 60_000 });
      expect(await heightOf(), `${label} did not grow when opened`).toBeGreaterThan(closed);
      await close.click();
      // Back to the offer, not to a collapsed panel still holding an answer for a design that can
      // now change underneath it.
      await expect(panel.getByRole("button", { name: run })).toBeVisible();
      // And focus lands on that offer. Closing unmounts the focused button, and a removed element
      // takes focus with it — without this the browser falls back to <body> and a keyboard user is
      // thrown from the bottom of Sweep to the top of the document with nothing saying why.
      // Asserted on the button itself: `document.activeElement.textContent` is no test at all,
      // because when focus HAS fallen back to <body> that string is the whole page, "Run dispersion"
      // included, so the check passed in exactly the case it existed to catch.
      await expect(panel.getByRole("button", { name: run }), `${label} dropped focus on close`).toBeFocused();
      expect(await heightOf(), `${label} did not shrink when closed`).toBeLessThanOrEqual(closed);
    }
  });
});

/** `DESIGN.md` §8's OTHER count, which nothing measured until 2026-08-02.
 *
 *  The contract is two numbers, not one: "at a 390 px viewport, count controls under 44 px and
 *  states unreachable without hover. Both counts are zero or the surface is not done." The hit
 *  targets have been asserted for several runs. The hover count had never been taken, and when it
 *  was, it was **96** on a phone with a design loaded.
 *
 *  A `title` attribute is the main offender: native tooltips do not fire on touch at all, so every
 *  one of them is information a flyer at the pad cannot reach. The two that carried REASONING about
 *  a number — the stability badge's "why", and the extrapolated marker's reason and range — are
 *  fixed in the same change and now render as visible text on a coarse pointer. The rest are
 *  ratcheted rather than fixed in one go, because most restate a visible label ("Sort by mass" on a
 *  button reading "Mass") and the fix for those is deletion, one surface at a time.
 *
 *  **The number is an EXACT ratchet, deliberately**, the same way `DESIGN.md` §9's counts are: an
 *  improvement fails this test just as a regression does, so the figure in this file and the figure
 *  on the page can never drift apart silently. */
const HOVER_ONLY_FLOOR = 67;

test("counts the states a flyer at the pad cannot reach, and holds the number down", async ({ page }) => {
  const ROUTES = ["/flight", "/design", "/sweep", "/validate", "/docs", "/docs/methods"];

  await page.goto("/");
  await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
  await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 30_000 });

  const found: string[] = [];
  for (const route of ROUTES) {
    await page.goto(route);
    // Wait for the route to finish rendering before counting. Without this the count RACES
    // hydration and moves between runs — measured 60 and 71 on two runs of an identical build,
    // which would make an exact ratchet worse than no check at all: it would fail for timing and
    // teach the next session to re-run until green.
    await page.waitForLoadState("networkidle");
    await expect(page.locator("footer")).toBeVisible();
    if (route.startsWith("/docs")) {
      await expect(page.getByRole("heading").first()).toBeVisible();
    } else {
      await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();
    }
    const here = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue; // not rendered, so not reachable either way
        const label = `<${el.tagName.toLowerCase()}> ${(el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24)}`;
        const title = el.getAttribute("title");
        if (title && title.trim()) {
          // "Unreachable without hover" is about the INFORMATION, not the attribute. A tooltip
          // whose text is also rendered visibly nearby costs a touch user nothing — that is exactly
          // what the coarse-pointer reasoning lines do — so the test is whether the title's words
          // appear in the surrounding block. Without this the check would punish the fix for the
          // defect it exists to find.
          const near = (el.closest("dd, li, p, div, section") as HTMLElement | null)?.innerText ?? "";
          const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
          if (!norm(near).includes(norm(title))) out.push(`title · ${label} · ${title.slice(0, 50)}`);
        }
        const cls = typeof el.className === "string" ? el.className : "";
        // A class that only reveals on hover is the same defect wearing CSS: the element is in the
        // DOM at opacity 0 and no touch gesture will ever bring it up.
        if (/(^|\s|:)(group-)?hover:(opacity-100|block|flex)/.test(cls)) {
          out.push(`hover-class · ${label} · ${cls.slice(0, 60)}`);
        }
      }
      return out;
    });
    for (const h of here) found.push(`${route} · ${h}`);
  }

  // Printed, not just counted: the next session driving this number down needs to know WHICH, and a
  // bare integer would send them back to writing this probe again.
  console.log(`hover-only states on a 390 px coarse pointer: ${found.length}`);
  for (const f of found.slice(0, 40)) console.log(`  ${f}`);

  expect(
    found.length,
    found.length > HOVER_ONLY_FLOOR
      ? `hover-only states rose to ${found.length} from ${HOVER_ONLY_FLOOR} — a phone cannot reach any of these`
      : `hover-only states fell to ${found.length}; lower HOVER_ONLY_FLOOR to match, in this commit`,
  ).toBe(HOVER_ONLY_FLOOR);
});
