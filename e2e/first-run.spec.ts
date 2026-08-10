import { test, expect, type Page } from "@playwright/test";

/** P3 — a stranger's first five minutes.
 *
 *  Every other spec in this suite starts by loading a design. This one starts where a stranger
 *  does: a cold browser, empty storage, no file, and no idea what this is. It is the milestone's
 *  own *done when* turned into assertions, so "is P3 finished" has a mechanical answer instead of
 *  an opinion — which is what an unattended run needs, since the alternative is one session
 *  believing it is done and the next disagreeing.
 *
 *  The measurement that matters here is STEPS AND DEAD ENDS, not looks. Each case counts something
 *  a first-timer actually spends: a scroll, a click, a question they cannot get answered from where
 *  they are standing.
 */

const PHONE = { width: 390, height: 664 };
const DESKTOP = { width: 1440, height: 900 };

/** A genuinely cold load: no service worker, no saved session, no recents. `addInitScript` runs
 *  before any page script, so storage is empty at the moment the app first reads it — clearing it
 *  after navigation would be a different test, one where the app had already seen a warm start. */
async function coldLoad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* a browser with storage disabled is still a cold load */
    }
  });
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
}

/** Everything the viewport shows before the flyer scrolls. */
async function visibleWithoutScrolling(page: Page, height: number): Promise<string> {
  return page.evaluate((h) => {
    const parts: string[] = [];
    const walk = (node: Element) => {
      for (const el of node.children) {
        const r = el.getBoundingClientRect();
        if (r.top >= h || r.bottom <= 0 || r.height === 0) continue;
        if (el.children.length === 0) {
          const t = (el.textContent || "").trim();
          if (t) parts.push(t);
        } else {
          walk(el);
        }
      }
    };
    walk(document.body);
    return parts.join(" ").replace(/\s+/g, " ");
  }, height);
}

for (const [label, size] of [
  ["desktop", DESKTOP],
  ["phone", PHONE],
] as const) {
  test.describe(`a stranger's first screen — ${label}`, () => {
    // `hasTouch` on the phone, and it is not cosmetic — the same false pass `depth.spec.ts` records.
    // A phone-sized viewport over the default desktop context reports `pointer: fine`, so every
    // `TOUCH_TARGET` control renders 26 px instead of 44 and the chrome above the fold comes out
    // ~97 px SHORT, in the direction that makes an above-the-fold assertion pass. This file's whole
    // subject is what a stranger sees without scrolling on a phone, so it was the one spec that
    // could least afford to measure the wrong pointer.
    test.use({ viewport: size, hasTouch: size === PHONE, isMobile: size === PHONE });

    test("says what the tool DOES before asking for a file", async ({ page }) => {
      await coldLoad(page);
      const seen = await visibleWithoutScrolling(page, size.height);
      // Not a copy check — a claim check. A stranger who has never heard of Loft has to learn, from
      // the first screen and without scrolling, that this thing PREDICTS a flight. "Import a file"
      // tells them what to do, not what they get, and a tool whose front door only says how to feed
      // it reads as a converter.
      expect(seen, "the first screen never says a flight is what comes out").toMatch(
        /flight|flies|fly|simulat|apogee|predict/i,
      );
    });

    test("offers a real example without a file, on the first screen", async ({ page }) => {
      await coldLoad(page);
      // The milestone's clause is "fly a real example in ONE CLICK without supplying a file". A
      // control that exists but sits below the fold is not one click — it is a scroll the stranger
      // has to know to make, which is the "reachable only by knowing it is there" tell.
      const samples = page.getByRole("button", { name: /·/ });
      const first = samples.first();
      await expect(first, "no bundled example is offered at all").toBeVisible();
      const box = await first.boundingBox();
      expect(box, "the bundled example has no box to measure").not.toBeNull();
      expect(
        box!.y,
        `the first bundled example sits at ${Math.round(box!.y)}px, below the ${size.height}px fold — ` +
          "a stranger has to scroll past the import controls to find the thing that needs no file",
      ).toBeLessThan(size.height);
    });
  });
}

test.describe("a stranger's first five minutes", () => {
  test.use({ viewport: DESKTOP });

  test("reaches a flown, explained flight in one click from a cold load", async ({ page }) => {
    await coldLoad(page);
    const sample = page.getByRole("button", { name: /·/ }).first();
    await expect(sample).toBeVisible();

    await sample.click();

    // A flown result, not merely a loaded design: the apogee is the answer they came for.
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({
      timeout: 20000,
    });
    const apogee = page.getByText("Apogee", { exact: true }).first();
    await expect(apogee, "no apogee reached the screen after one click").toBeVisible();

    // …and EXPLAINED. A number with no route to how it was computed is the thing this tool exists
    // not to be, and the milestone says those pages must be findable "from where the question
    // arises rather than from a footer".
    const methods = page.getByRole("link", { name: /how (they.re|these are) computed|methods/i });
    await expect(
      methods.first(),
      "a flown number is on screen with no link to how it was computed",
    ).toBeVisible();
    // The clause names three pages, not one: "the methods, limitations and validation pages from
    // where the question arises rather than from a footer".
    await expect(
      page.getByRole("link", { name: /where it.s weak|limitations/i }).first(),
      "a flown number is on screen with no link to where the model is weak",
    ).toBeVisible();
  });

  test("offers the accuracy evidence from the surface that compares against it", async ({ page }) => {
    // Validation answers "how far off is Loft, generally?" — a question that arises where the
    // file's own stored numbers sit beside Loft's, which is `/validate`. Asserted there rather than
    // on the flight, because a link to an accuracy census is noise until you are looking at a
    // comparison.
    await coldLoad(page);
    await page.getByRole("button", { name: /·/ }).first().click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({
      timeout: 20000,
    });
    await page.getByRole("link", { name: "Cross-check" }).click();
    await expect(
      page.getByRole("link", { name: /how this is measured|validation/i }).first(),
      "the cross-check offers no route to how Loft's accuracy is measured",
    ).toBeVisible();
  });

  test("tells an importing stranger what was and was not understood about their file", async ({
    page,
  }) => {
    await coldLoad(page);
    // A real design that Loft reads with reservations — the honest case, not the clean one. This
    // fixture's own notes are what a first-timer needs to see: not an error, but a plain statement
    // of how their file was read.
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles("fixtures/demo-quirks.ork");
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({
      timeout: 20000,
    });
    // Either "how Loft read this design" or the warnings card — one of the two must speak. A design
    // that imports silently has told the stranger nothing about what was assumed on their behalf.
    const read = page.getByText(/How Loft read this design|weren.t fully understood/i);
    await expect(
      read.first(),
      "the import said nothing about how the file was read",
    ).toBeVisible();
  });

  test("says the three things it does that no other tool does, before a stranger has to find them", async ({
    page,
  }) => {
    // **P5: the landing surface states `COMPETITION.md`'s standing conclusion.** That file has said
    // for several runs that the three differentiators are "what the landing surface and the README
    // should say, and right now they do not". Measured before this shipped: the page stated the
    // formats and "never uploaded" — claim 2 and half of claim 1 — and said nothing at all about the
    // multi-answer cross-check, which is the one no other hobby tool offers at all.
    //
    // Asserted as three CLAIMS rather than three strings, so a rewrite that keeps the meaning passes
    // and a deletion fails. Each regex names the load-bearing idea, not the sentence.
    await coldLoad(page);
    const why = page.getByRole("heading", { name: "Why Loft" });
    await expect(why, "the landing surface makes no case for itself").toBeVisible();

    const claims: [string, RegExp][] = [
      ["free / no install / offline", /Nothing to install, nothing to pay, nothing to sign up for/],
      ["reads the file you already have", /reads the file you already have/i],
      ["more than one answer", /shows you more than one answer/i],
    ];
    for (const [what, mark] of claims) {
      await expect(page.getByText(mark).first(), `the landing surface never claims: ${what}`).toBeVisible();
    }

    // The substance behind each headline, because a heading with nothing under it is a slogan. The
    // offline claim and the disagreement claim are the two a sceptic would test.
    await expect(page.getByText(/keeps working with no signal/i).first()).toBeVisible();
    await expect(page.getByText(/Where they disagree it says so/i).first()).toBeVisible();
    // And the format list has to be the one Loft actually reads: the THREE the drop zone names.
    //
    // **This assertion used to demand five, and its own comment explained why — "because RocketPy and
    // SpaceCAD import too and a stranger comparing tools counts them". Neither imports.** The file
    // input accepts `.ork`, `.rkt` and `.CDX1`; `lib/ork/import.ts`'s refusal names the same three;
    // `lib/validation/rocketpy-spec.ts` builds a spec FROM a Loft design for the in-browser second
    // solver, which is the export direction; and there is no SpaceCAD code in the repo at all. So a
    // check written to stop the landing surface going stale was holding a false claim IN PLACE, which
    // is how it survived on the front door and in the changelog for four months. A check that asserts
    // a capability the code does not have is worse than no check: it converts the fix into a
    // regression. `lib/version.test.ts` now asserts the other direction against the accept list
    // itself, so this list cannot drift from the importer again in either direction.
    for (const fmt of [".ork", ".rkt", ".CDX1"]) {
      await expect(
        page.getByRole("definition").filter({ hasText: /OpenRocket/ }).first(),
        `the format claim omits ${fmt}`,
      ).toContainText(fmt);
    }

    // It must not cost the fold. The primary control a flyer with no file needs stays reachable
    // without hunting: this block sits after the examples deliberately, so the examples must still
    // come first in the document.
    const exampleY = await page.getByRole("button", { name: /38 mm single-deploy/ }).first().evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
    const whyY = await why.evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
    expect(whyY, "the Why Loft block was pushed above the bundled examples").toBeGreaterThan(exampleY);
  });
});
