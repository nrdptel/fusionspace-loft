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

    // **The blind spot, reached at last.** Every reading this file has ever taken was with NO part
    // selected, so `GeometryInspector`'s gesture bar — remove, reorder, and the four add controls —
    // contributed nothing to any count while being exactly the kind of state these counts exist to
    // find. The recorded reason nobody reached it was that the parts table is "1,198 px wide inside
    // a 390 px viewport" and "a direct row click times out". **Both were stale.** Measured
    // 2026-08-02 on the built export at 390x664: the table is 418 px inside a 324 px scroller,
    // `getByRole("row")` returns 9, and a row click works. The `DataTable` conversion fixed it and
    // nothing re-measured, so a false measurement kept the gate shut for several runs.
    // The BODY TUBE row specifically, not `nth(1)`: four of the eleven gesture controls render only
    // when the selected part is a body tube (`GeometryInspector` gates the add controls on
    // `kind === "bodytube"`), and row 1 is the nose cone — selecting it renders a strictly smaller
    // bar and the scan would silently cover less than it claims to.
    await page.getByRole("row").filter({ hasText: "Body tube" }).first().click();
    // Assert the surface is actually THERE before measuring it, or a selector that quietly stopped
    // matching would report a clean scan of a bar that never rendered — which is the failure mode
    // this whole test exists to end.
    await expect(page.getByRole("button", { name: /^Add a tube behind this/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Add fins to this tube/i })).toBeVisible();
    expect(await scan(), "Design workspace with a part SELECTED").toEqual([]);
  });
  test("a flick that starts on a diagram grip drags it and does NOT scroll the page away", async ({ page }) => {
    // **The Sev-1 a phone cold walk found, on the surface P4 increment 5 had just worked on.** A
    // one-thumb flick that happened to land on a drag grip did BOTH: it dragged the handle AND
    // scrolled the page. Measured before the fix at this viewport, flicking up 220 px from the
    // body-diameter grip: ⌀38 mm to 205 mm and the page 500 to 731 px, so the airframe was off screen
    // before the numbers settled — a silent design edit with the evidence scrolled out of view.
    //
    // The `<g>` carried `touch-none` the whole time; `touch-action` is simply not honoured on an
    // inner SVG element in Chromium, and `preventDefault()` on the pointerdown does not stop a scroll
    // either. Only a non-passive `touchmove` does.
    //
    // Driven through CDP because this needs REAL touch events: `page.touchscreen` has only `tap`, and
    // synthetic `PointerEvent`s dispatched from the page do not reach the handler at all — a first
    // version of this probe reported "no drag, no scroll" for both, which reads as a pass.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();
    await page.waitForTimeout(1000);

    const cdp = await page.context().newCDPSession(page);
    const flick = async (x: number, y: number, dy: number) => {
      const send = (type: string, py: number) =>
        cdp.send("Input.dispatchTouchEvent", {
          type,
          touchPoints: type === "touchEnd" ? [] : [{ x, y: py }],
        } as never);
      await send("touchStart", y);
      for (let i = 1; i <= 14; i++) {
        await send("touchMove", y + (dy * i) / 14);
        await page.waitForTimeout(16);
      }
      await send("touchEnd", y + dy);
      await page.waitForTimeout(700);
    };

    const grip = page.getByRole("slider", { name: /Body diameter/i });
    const box = (await grip.boundingBox())!;
    // The grip must actually be a 44 px target for this to be the gesture a thumb makes.
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    const valueBefore = await grip.getAttribute("aria-valuenow");
    const scrollBefore = await page.evaluate(() => window.scrollY);

    await flick(box.x + box.width / 2, box.y + box.height / 2, -220);

    // The handle did its job — it is a slider, and a flick along its axis is a drag.
    expect(await grip.getAttribute("aria-valuenow"), "the grip stopped responding to a drag").not.toBe(valueBefore);
    // And the page stayed exactly where it was, which is the whole of the fix.
    expect(
      await page.evaluate(() => window.scrollY),
      "the page scrolled while the grip was being dragged — the flyer loses sight of the edit",
    ).toBe(scrollBefore);

    // **The control that makes the assertion above mean something**: the same flick 60 px away, on
    // plain airframe, must still scroll normally. Without this, a page that had simply stopped
    // scrolling anywhere would pass.
    const stillBefore = await page.evaluate(() => window.scrollY);
    await flick(box.x + box.width / 2 + 60, box.y + box.height / 2, -220);
    expect(
      await page.evaluate(() => window.scrollY),
      "the diagram stopped scrolling everywhere, not just on the grip",
    ).toBeGreaterThan(stillBefore);
  });

  test("every part on the diagram is tappable, and the handles do not steal it", async ({ page }) => {
    // **The diagram was the last surface with no touch target worth the name.** Measured on the
    // built export at this viewport before the fix: the body parts' hit shapes were the SILHOUETTE,
    // which at fit width is about eleven pixels tall — 78x12 and 218x12 px against `DESIGN.md` §8's
    // 44 — and each drag grip's own 44x44 circle sits ON the airframe, so 9 of 19 points sampled
    // across the body tube resolved to a HANDLE rather than the part. Tapping the middle of the body
    // tube left the nose selected.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "Design", exact: true }).click();
    await expect(page.getByLabel(/Scale side-view/)).toBeVisible();

    // Every part's tap area clears the contract in BOTH dimensions. Measured from the rendered
    // boxes, not from the class list — the whole point is what a thumb can actually hit.
    const boxes = await page.locator("svg rect.fill-transparent").evaluateAll((ns) =>
      ns.map((n) => {
        const r = n.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      }),
    );
    expect(boxes.length, "no part tap targets rendered at all").toBeGreaterThan(1);
    // **HEIGHT is the contract this fixes, and it is asserted for every column.** Width is not, and
    // that is a limit rather than an oversight: a column is as wide as the part is LONG on screen,
    // and measured across the 39 corpus files **56 of 150 body parts are under 44 px wide** at this
    // fit width — the narrowest is 0.8 px, a transition on `silsim/rocket.ork`. A part that short
    // cannot be given its own 44 px column without stealing area from its neighbours, and since the
    // later-drawn column wins an overlap the theft would be arbitrary. The diagram's zoom control is
    // the real answer there, and it is already a 44 px target. Asserting width here would pass only
    // because the bundled sample happens to be generous.
    expect(
      boxes.filter((b) => b.h < 44),
      `part tap targets under 44 px tall: ${boxes.map((b) => `${b.w}x${b.h}`).join(", ")}`,
    ).toEqual([]);

    // **How much of each column actually reaches the PART**, measured rather than asserted in the
    // abstract. The drag grips keep their own 44x44 hit circles and legitimately win where they
    // overlap — a grip is a smaller, more specific target the flyer aimed at — so the honest
    // question is what is left. Sampled on a grid over each column with `elementFromPoint`.
    const reach = await page.locator("svg rect.fill-transparent").evaluateAll((ns) =>
      ns.map((n) => {
        const r = n.getBoundingClientRect();
        let part = 0;
        let total = 0;
        for (let i = 1; i < 10; i++) {
          for (let j = 1; j < 10; j++) {
            const x = r.left + (r.width * i) / 10;
            const y = r.top + (r.height * j) / 10;
            const el = document.elementFromPoint(x, y);
            if (!el) continue;
            total++;
            if (el === n) part++;
          }
        }
        return total ? Math.round((100 * part) / total) : 0;
      }),
    );
    // Before the column existed this was ZERO outside an eleven-pixel silhouette — every point in a
    // part's area that was not on the drawn shape reached nothing at all.
    expect(
      reach.filter((pct) => pct < 40),
      `share of each part's column that reaches the part: ${reach.map((p) => `${p}%`).join(", ")}`,
    ).toEqual([]);

    // And it drives the real gesture: tapping a part's column selects THAT part in the parts table,
    // and two different columns select two different parts. Asserted as distinctness rather than
    // against a name string, because that is the property — a column that selected the same part
    // whichever one you tapped would be worse than no target at all, and is exactly what the drag
    // handles used to produce (tapping the body tube left the NOSE selected).
    await page.locator("summary", { hasText: /Parts ·/ }).click();
    await expect(page.locator('tr[aria-selected="true"]')).toHaveCount(0);
    const columns = page.locator("svg rect.fill-transparent");

    await columns.nth(0).click({ position: { x: 8, y: 8 } });
    const first = page.locator('tr[aria-selected="true"]');
    await expect(first, "a tap on a part's column must select that part").toHaveCount(1);
    const firstName = (await first.innerText()).trim();

    await columns.nth(1).click({ position: { x: 8, y: 8 } });
    const second = page.locator('tr[aria-selected="true"]');
    await expect(second).toHaveCount(1);
    const secondName = (await second.innerText()).trim();

    expect(secondName, `both columns selected "${firstName}"`).not.toBe(firstName);

    // **And the columns must not BURY what was already tappable.** Fin sets and mass objects carry
    // their own `hoverProps` and were selectable from the diagram before this existed; a fin's
    // planform sits inside its host tube's x-range and inside the column's full height, so an
    // earlier paint order swallowed it whole and tapping a fin selected "Body tube". The columns are
    // painted FIRST for exactly this reason — anything more specific still wins on top.
    // Clicked on the fin PATH itself rather than its group's bounding box, and via
    // `elementFromPoint` on the path's own centroid, so the point is provably inside the polygon
    // rather than in the box's empty corner.
    // `locator.click()` rather than a raw mouse click at a computed point: it scrolls the element
    // into view first (the diagram sits above the fold once the parts disclosure is open — measured,
    // the fin's box was at y = -178) and it dispatches at a point it has verified belongs to the
    // element, which a trapezoid's bounding-box centre is not guaranteed to be.
    const finGroup = page.locator("svg g[class*='fill-zinc-300'], svg g[class*='fill-indigo-300']").first();
    await expect(finGroup, "no fin planform on the diagram to test").toHaveCount(1);
    const gb = (await finGroup.boundingBox())!;
    // The aft-OUTER corner of the lower fin, not the group's centre and not its top-left. The group's
    // box is the union of the top and bottom planforms, so its middle is the airframe and its
    // top-left is the empty notch ahead of a 45-degree leading edge — and that notch is exactly where
    // the fin-station handle's transparent 44 px circle sits, which would intercept the click and
    // fail as "intercepts pointer events" rather than as the thing being tested.
    await page.mouse.click(gb.x + gb.width - 4, gb.y + gb.height - 6);
    const afterFin = page.locator('tr[aria-selected="true"]');
    await expect(afterFin, "tapping a fin selected nothing — the columns buried it").toHaveCount(1);
    expect(
      (await afterFin.innerText()).toLowerCase(),
      "tapping a fin set selected something else — the columns buried it",
    ).toContain("fin");
  });

  test("the three pad journeys work one-handed, and survive losing signal", async ({ page, context }) => {
    // Three route walks, a fifteen-motor sweep, an undo and an offline reload do not fit the file's
    // 60 s budget (`playwright.config.ts`), and asking for 120 s on a single `expect` inside a 60 s
    // test is a tolerance that can never be reached — the run is killed first, so the failure reads
    // as an opaque "Test timeout exceeded" mid-step rather than as the authored assertion. That is
    // the exact failure mode the config's own comment says it was written to prevent.
    // `test.setTimeout` is how the rest of this suite buys room (see `rocketpy-selfhosted.spec.ts`).
    test.setTimeout(240_000);
    // **P4's *done when*, driven rather than described.** "A flyer can, one-handed and offline on a
    // 390 px viewport, complete the three things a range day actually needs — pick a motor, check
    // stability, sanity-check a delay." The hit-target and hover counts elsewhere in this file are
    // the finish; these three are the substance, and until this nothing had walked them.
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 30_000 });

    // ── CHECK STABILITY ── the healthy one: it sits in the shared chrome, so it is on every
    // workspace route for zero taps and inside the first screen.
    const margin = page.locator("div", { has: page.getByText("Static margin", { exact: true }) }).last();
    await expect(margin, "static margin is on the landing workspace").toBeVisible();
    await expect(margin).toContainText(/cal/);

    // ── SANITY-CHECK A DELAY ──
    await page.getByRole("link", { name: "Flight", exact: true }).click();
    await expect(page.getByText("Optimum delay", { exact: true }).first()).toBeVisible();

    // ── PICK A MOTOR ── from the sweep's own ranking, which is where the decision is made. Before
    // the *Use* column this journey ENDED here: `components/MotorSweep.tsx` held exactly one
    // `<Button>` in the whole file — *Run* — so a flyer who swept fifteen motors had to memorise the
    // designation, walk to /design, and scroll 1,841 px (2.77 screens at this viewport) to re-find
    // it in a sixteen-option select. The sweep itself runs entirely on-device.
    await page.getByRole("link", { name: "Sweep", exact: true }).click();
    await page.getByRole("button", { name: /Run motor sweep/ }).click();
    const sweep = page.getByRole("region", { name: "Motor sweep" });
    const use = sweep.getByRole("button", { name: /^Use / }).first();
    await expect(use, "the sweep can apply a motor").toBeVisible({ timeout: 120_000 });

    // **On screen WITHOUT scrolling, which is the whole claim.** `toBeVisible()` does not test
    // viewport intersection and `click()` auto-scrolls, so as the table's tenth column every Use
    // control sat off the right edge of this 390 px viewport and the journey still passed. The
    // control moved to second — beside the motor's own name — and this is what holds it there.
    const vw = page.viewportSize()!.width;

    // A real target for a thumb, and an accessible name that says WHICH motor — fifteen bare "Use"s
    // would be fifteen anonymous stops for a screen-reader or voice-control user.
    const box = await use.boundingBox();
    expect(Math.round(box!.height), "Use button height").toBeGreaterThanOrEqual(44);
    expect(Math.round(box!.width), "Use button width").toBeGreaterThanOrEqual(44);
    expect(
      Math.round(box!.x + box!.width),
      `Use sits at x=${Math.round(box!.x)} in a ${vw} px viewport — a control a thumb has to scroll a nested scroller to find is the step this column exists to remove`,
    ).toBeLessThanOrEqual(vw);
    const named = (await use.getAttribute("aria-label")) ?? "";
    expect(named, "the Use control says which motor").toMatch(/^Use \S+ —/);
    const chosen = named.replace(/^Use (\S+).*$/, "$1");

    await use.click();

    // It APPLIED, and the Design workspace's own swap control reads it back — one edit bag, not a
    // second mechanism beside the select.
    await page.getByRole("link", { name: "Design", exact: true }).click();
    const swap = page.getByRole("combobox", { name: "Swap motor" });
    await expect(swap, "the swap select reads back the motor chosen in the sweep").toHaveValue(
      new RegExp(chosen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );

    // **And there is a way back FROM THE TABLE ITSELF**, which is where one would hide. The first
    // draft marked "flying now" from the FILE's motor rather than the flown one, so after a tap the
    // label stayed on a motor that was not flying, the applied row still offered a dead button, and
    // the design's own motor became the one row with no control to return to — reachable only by
    // Undo (which stops being one step back the moment any other edit follows) or by the select two
    // routes away, the exact trip this column was added to remove.
    await page.getByRole("link", { name: "Sweep", exact: true }).click();
    await expect(
      sweep.getByRole("button", { name: /go back to this design's own motor/i }),
      "the design's own motor is reachable again from the table",
    ).toBeVisible();
    await expect(
      sweep.getByText("flying now"),
      "exactly one row is marked as flying, and it is the applied one",
    ).toHaveCount(1);

    // Undo is still a way out too, and it lands on the design's own motor.
    await page.getByRole("link", { name: "Design", exact: true }).click();
    await page.getByRole("button", { name: /^Undo/ }).click();
    await expect(swap).toHaveValue("");

    // ── AND IT SURVIVES LOSING SIGNAL ── which is the pad case: the app is open, then the signal
    // goes. Asserted by cutting the network and RELOADING the route in view, so the service worker
    // is genuinely what answers.
    //
    // Deliberately a reload rather than a cross-route walk, and the reason is the local server
    // rather than the app: `serve` answers `/flight` with a redirect to `/flight/` because the RSC
    // segment directory exists beside the document, while `scripts/gen-sw-precache.mjs` precaches
    // the un-slashed form — so an offline spine tap churns between the two under `serve` in a way
    // Cloudflare Pages does not. `e2e/docs.spec.ts` already walks every docs route offline, which
    // covers the cross-route case on paths with no such directory.
    await page.waitForFunction(
      async () => !!navigator.serviceWorker?.controller && !!(await caches.match("/design")),
      null,
      { timeout: 30_000 },
    );
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("navigation", { name: "Workspace" }), "the app renders offline").toBeVisible();
    await expect(
      page.locator("div", { has: page.getByText("Static margin", { exact: true }) }).last(),
      "stability is still readable with no signal",
    ).toBeVisible();
    await context.setOffline(false);
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
 *  on the page can never drift apart silently.
 *
 *  **96 → 75 → 67 → 25 → 1 → 0**, and the zero used to need reading carefully: it was zero on the six
 *  routes this walk visits, with no part selected, while the gesture bar behind a selection went
 *  unmeasured. **That gap is closed** — the loop now picks a part on `/design` and runs the identical
 *  count over the selection-gated surface, having first asserted the bar rendered.
 *
 *  **It found nothing, and that is the honest result rather than a disappointment.** Increment 3 had
 *  already fixed those controls; what was missing was any check able to see them, so a regression
 *  would have read 0 either way. The number did not move because the work was done — but until this
 *  run nothing could have told the difference between that and a surface full of them.
 *
 *  The 67 → 25 step took the whole SHARED CHROME, which is why it is the
 *  large one: every site there renders on all six routes, so five files paid for forty-two of them.
 *  Both invisible-until-hover arrows (footer and badge) are now always drawn — a flyer on a phone
 *  could not previously tell those links leave the site at all; the duplicated brand `title`, the
 *  theme toggle's (its `aria-label` is a superset), and the `title` on a decorative `aria-hidden`
 *  bar are deleted; and the Ko-fi link's destination moved INTO its visible label rather than being
 *  deleted with it, because "Ko-fi" appeared nowhere else on the surface.
 *
 *  **The 25 → 1 step did NOT write anything visibly, and that was the constraint.** Every one of
 *  those 25 sat on the app chrome above the workspace spine — Undo/Redo's disabled reason, the
 *  design-name field, Download .ork, the motor-match badge, the stability hint — so writing any of
 *  them into the page spends the phone chrome ratchet (1060 px, measured 1011 → 49 px of headroom)
 *  and the two-screen depth cap at once, which `ROADMAP.md` records being tried and reverted. They
 *  moved onto the ACCESSIBLE NAME instead: a `title` reaches a mouse only, an `aria-label` reaches
 *  assistive tech on every form factor, and neither costs a pixel. Where the tooltip merely restated
 *  a visible label it was deleted outright; where it carried something real — what a download
 *  omits, an undo's keyboard shortcut, why a stability flag fired — it was kept and relocated. */
const HOVER_ONLY_FLOOR = 0;

test("counts the states a flyer at the pad cannot reach, and holds the number down", async ({ page }) => {
  const ROUTES = ["/flight", "/design", "/sweep", "/validate", "/docs", "/docs/methods"];

  await page.goto("/");
  await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
  await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 30_000 });

  const found: string[] = [];
  for (const route of ROUTES) {
    await page.goto(route);
    // **THE BLIND SPOT THIS USED TO CARRY IS CLOSED — see the `/design` block after the count.**
    // `GeometryInspector`'s gesture bar — remove, reorder, add a tube / fin set / mass object /
    // transition / motor mount — renders only once a part is SELECTED, and this walk did not select
    // one. **Eight** are strictly selection-gated (not eleven: two more need a mount or a stage to
    // exist first, and *Add a booster stage* renders ungated). So those eight contributed 0 to every reading this ratchet had
    // ever taken, while being exactly the kind of state it exists to find.
    //
    // **They are FIXED — and this check did not verify that, which is the point of saying so here.**
    // Each now carries an `aria-label` that BEGINS with its own visible text and then adds what the
    // tooltip said. Getting there took two attempts: a regex sweep that substituted the description
    // for the name shipped first, and fourteen specs caught it by finding those buttons by the words
    // on screen — `aria-label` REPLACES the accessible name where `title` only supplements it, so
    // "Add a tube behind this" had become "Add a body tube immediately behind this one, faired to
    // it, and re-fly the design". That is WCAG 2.5.3, and it is why the form is label-first.
    //
    // **The two "ways of reaching them that failed" recorded here were STALE, and correcting them is
    // most of what closed this.** They said `getByRole("row")` matches nothing for this table and a
    // row click times out because the table is 1,198 px wide inside a 390 px viewport. Measured
    // 2026-08-02 on the built export at 390x664: the table is **418 px inside a 324 px scroller**,
    // `getByRole("row")` returns **9**, and rows click clean on both bundled samples. The
    // `DataTable` conversion fixed all three and nothing re-measured, so a false measurement held
    // the gate shut for several runs.
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

    // **And once more on /design with a part SELECTED, which closes the blind spot above.**
    // The walk visits six routes with nothing picked, so the gesture bar behind a selection has
    // contributed 0 to every reading this ratchet has ever taken. It is reached here rather than
    // described: pick a row, confirm the bar rendered, and run the identical count over it.
    //
    // **What it found is nothing, and that is banked as a measurement rather than claimed as a
    // repair.** The eight strictly selection-gated controls were fixed in increment 3 — their
    // tooltips moved onto label-first accessible names — and this is the first check able to SEE
    // that. A regression on any of them now fails, where before it read 0 either way.
    if (route === "/design") {
      // The table is behind a closed disclosure — `partsOpen` defaults false — so the selection
      // needs two taps, which is itself part of what this blind spot cost.
      await page.locator("summary", { hasText: /Parts ·/ }).click();
      await page.getByRole("row").filter({ hasText: "Body tube" }).first().click();
      await expect(page.getByRole("button", { name: /^Add a tube behind this/i })).toBeVisible();
      const gated = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          const label = `<${el.tagName.toLowerCase()}> ${(el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24)}`;
          const title = el.getAttribute("title");
          if (title && title.trim()) {
            const near = (el.closest("dd, li, p, div, section") as HTMLElement | null)?.innerText ?? "";
            const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
            if (!norm(near).includes(norm(title))) out.push(`title · ${label} · ${title.slice(0, 50)}`);
          }
          const cls = typeof el.className === "string" ? el.className : "";
          if (/(^|\s|:)(group-)?hover:(opacity-100|block|flex)/.test(cls)) {
            out.push(`hover-class · ${label} · ${cls.slice(0, 60)}`);
          }
        }
        return out;
      });
      for (const h of gated) found.push(`/design (part selected) · ${h}`);
    }
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
