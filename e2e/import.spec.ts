import { test, expect, type Locator, type Page } from "@playwright/test";

/** P18 — `DropZone`, driven as a drop zone.
 *
 *  **This is the layer that can see what the unit layer cannot.** `vitest` runs in `node` here, so
 *  `lib/dropzone.test.tsx` can assert what the primitive renders and nothing about what happens when
 *  a file crosses it. Everything below needs a real `DataTransfer`, which only a browser has.
 *
 *  Three behaviours, and each replaces a defect the hand-rolled version shipped with:
 *   - a file Loft cannot read is refused **in the zone the flyer dropped it on**, in the importer's
 *     own words. The refusal used to render in the page's shared error strip, below everything else
 *     on the route — measured from a COLD load, with only the always-on examples card in between:
 *     765 px under the zone at 1440x900 and 1,654 px on a 390x844 phone, off-screen on both;
 *   - the highlight survives the pointer crossing a child, because the primitive counts enter and
 *     leave rather than toggling on each;
 *   - a text drag does not arm it at all.
 *
 *  And two that are not defects but are the whole point: a real design file, dropped, flies — and it
 *  flies whatever it is CALLED. That last case is here because the first version of this primitive
 *  refused by file name, which is wrong for an importer that reads bytes, and three previously-green
 *  cases went red on it.
 */

const DESKTOP = { width: 1440, height: 900 };

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

/** Dispatch one drag event carrying either files or plain text.
 *
 *  `bubbles` is not optional: React attaches its listeners at the root container, so an event
 *  dispatched on the zone with `bubbles: false` reaches no handler at all and every assertion below
 *  would read as "the feature does not work" when nothing had been delivered. */
async function drag(
  target: Locator,
  type: "dragenter" | "dragover" | "dragleave" | "drop",
  payload: { files?: { name: string; mime: string; url?: string; content?: number[] }[]; text?: string },
): Promise<void> {
  await target.evaluate(async (el, { type, payload }) => {
    const dt = new DataTransfer();
    for (const f of payload.files ?? []) {
      // `url` fetches real bytes off the origin the suite serves; `content` spells them literally,
      // for the cases where WHAT THE BYTES ARE is the thing under test — the importer reads them and
      // says so, and a stub would only ever produce its generic refusal.
      const bytes = f.url
        ? new Uint8Array(await (await fetch(f.url)).arrayBuffer())
        : new Uint8Array(f.content ?? [1, 2, 3]);
      dt.items.add(new File([bytes], f.name, { type: f.mime }));
    }
    if (payload.text !== undefined) dt.setData("text/plain", payload.text);
    el.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { type, payload });
}

/** Dispatch one drag event and report whether the app cancelled it — `preventDefault` is the only
 *  observable of `onDragOver`, and it is load-bearing twice: uncancelled, no `drop` ever fires, and
 *  the browser navigates to a dragged link. */
async function cancelled(
  target: Locator,
  type: "dragover",
  payload: { files?: { name: string; mime: string }[]; text?: string },
): Promise<boolean> {
  return target.evaluate((el, { type, payload }) => {
    const dt = new DataTransfer();
    for (const f of payload.files ?? []) dt.items.add(new File([new Uint8Array([1])], f.name, { type: f.mime }));
    if (payload.text !== undefined) dt.setData("text/plain", payload.text);
    const ev = new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  }, { type, payload });
}

/** The zone's own class attribute. §2's tones are the state: `border-zinc-300` dashed at rest,
 *  `border-indigo-500/30` while a file is over it. Read as the container's classes rather than as a
 *  substring of the document, or "the page contains an indigo border somewhere" passes for it. */
async function zoneClasses(zone: Locator): Promise<string> {
  return (await zone.getAttribute("class")) ?? "";
}

test.describe("the import drop zone", () => {
  test.use({ viewport: DESKTOP });

  test("refuses a file it cannot read where the flyer dropped it, in the importer's words", async ({
    page,
  }) => {
    await coldLoad(page);
    const zone = page.locator("[data-drop-zone]");
    await expect(zone).toBeVisible();

    // A real PNG header, dropped. The bytes are spelled out rather than stubbed because the point is
    // that the importer READS them: it says what the file looks like and which box it belongs in,
    // where a name test could only ever say no — and would say it wrongly for a renamed design file.
    const png = { name: "shot.png", mime: "image/png", content: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00] };
    await drag(zone, "dragenter", { files: [png] });
    await drag(zone, "drop", { files: [png] });

    const refusal = zone.getByRole("alert");
    await expect(refusal, "the zone did not pass on what the importer read").toContainText(
      /looks like an image/i,
    );
    await expect(refusal, "…and it names what this surface does take").toContainText(/\.ork/);
    await expect(refusal, "…and the way forward").toContainText(/Choose another file/i);

    // **The assertion this whole case exists for.** The refusal is INSIDE the zone, not in the page
    // strip below the samples card. A `toContainText` on the page passes either way, so the
    // containment is what is asserted — and the page-wide count says there is only the one, so the
    // move cannot read green while the old strip still renders a second copy below the fold.
    await expect(
      zone.locator("div.border-red-500\\/30"),
      "the refusal rendered somewhere other than where the file landed",
    ).toHaveCount(1);
    await expect(
      page.locator("div.border-red-500\\/30"),
      "the refusal is in two places at once",
    ).toHaveCount(1);
  });

  test("arms for a file drag, and stays armed when the pointer crosses its own contents", async ({
    page,
  }) => {
    await coldLoad(page);
    const zone = page.locator("[data-drop-zone]");
    const design = [{ name: "rocket.ork", mime: "application/zip" }];

    expect(await zoneClasses(zone), "at rest the zone is §2's muted tone").toContain("border-zinc-300");

    await drag(zone, "dragenter", { files: design });
    const armed = await zoneClasses(zone);
    expect(armed, "a file over the zone did not arm it").toContain("border-indigo-500/30");
    // **The dashed→solid change is what §2 offers in place of the deleted 2 px width, so it is
    // asserted rather than assumed.** It works because `muted` sets `border-dashed` and `accent` sets
    // no border-style at all, so the armed edge falls back to the registered initial value — which is
    // "wins because nothing else happens to be there", the same shape this milestone deleted from the
    // width. A style utility added to `Card`'s base or to another tone would silently leave the armed
    // edge dashed, and this is the line that goes red.
    expect(armed, "the armed edge is still dashed — §2 promises it goes solid").not.toContain(
      "border-dashed",
    );

    // **`dragover` is dispatched and its cancellation asserted, because nothing else covers it.**
    // `onDragOver`'s `preventDefault` is the single line without which no `drop` fires in a real
    // browser at all — and without which a dragged LINK navigates the page away. A first version of
    // this spec never sent a `dragover`, so deleting that handler left drag-and-drop completely dead
    // with every case here green.
    expect(
      await cancelled(zone, "dragover", { files: design }),
      "dragover was not cancelled, so no drop can ever fire",
    ).toBe(true);
    expect(
      await cancelled(zone, "dragover", { text: "a link from another tab" }),
      "a non-file dragover was left to the browser, which navigates away from the app",
    ).toBe(true);

    // The flicker. `dragenter` and `dragleave` both bubble, so moving onto the paragraph inside the
    // zone fires an enter at the child and a leave at the zone — and a handler that answers the
    // leave with `false` drops the highlight every time the cursor crosses a word. The primitive
    // counts; this is the control that says so.
    const inner = zone.getByText("Import an OpenRocket, RockSim or RASAero design");
    await drag(inner, "dragenter", { files: design });
    await drag(zone, "dragleave", { files: design });
    expect(
      await zoneClasses(zone),
      "the highlight dropped when the pointer crossed the zone's own copy",
    ).toContain("border-indigo-500/30");

    // …and leaving for real disarms it, or the state above would be unfalsifiable.
    await drag(zone, "dragleave", { files: design });
    expect(await zoneClasses(zone), "leaving the zone left it armed").toContain("border-zinc-300");
  });

  test("does not arm for a drag that is not a file, and the event really was delivered", async ({
    page,
  }) => {
    await coldLoad(page);
    const zone = page.locator("[data-drop-zone]");
    // Dragging a selection across the page fires the same events. A target that lights up for text
    // is claiming it can do something it cannot.
    await drag(zone, "dragenter", { text: "some selected words" });
    expect(await zoneClasses(zone), "a text drag armed the file target").toContain("border-zinc-300");

    // **The positive control this case needs, in the same case.** "Still at rest" is exactly what an
    // UNDELIVERED event produces — wrong target, wrong bubbling, React not listening — and this
    // file's own `drag()` docblock warns about that failure mode. Arming with a file immediately
    // afterwards proves the channel works, so the reading above is a refusal rather than a silence.
    await drag(zone, "dragenter", { files: [{ name: "rocket.ork", mime: "application/zip" }] });
    expect(await zoneClasses(zone), "the drag channel is not delivering at all").toContain(
      "border-indigo-500/30",
    );
  });

  test("flies a real design dropped on it", async ({ page }) => {
    await coldLoad(page);
    const zone = page.locator("[data-drop-zone]");
    // A bundled sample, fetched from the origin the suite is serving, so the bytes are a genuine
    // OpenRocket file rather than a stub. This is the positive control for all three cases above:
    // without it they could all pass on a zone that refuses everything.
    const design = [
      { name: "demo-single-deploy.ork", mime: "application/zip", url: "/samples/demo-single-deploy.ork" },
    ];
    await drag(zone, "dragenter", { files: design });
    await drag(zone, "drop", { files: design });

    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({
      timeout: 20000,
    });
  });

  test("flies a design whose NAME the accept list does not cover", async ({ page }) => {
    // **The regression a pre-push review found in the first version of this primitive, kept as a
    // permanent case.** That version refused a file whose name did not match `accept`. Loft's
    // importer never looks at the name — it sniffs the bytes — so a renamed `.ork`, an extensionless
    // download or a share-sheet hand-off all import perfectly well, and refusing them produces a
    // sentence that is false on the front door of the app. Two round-trip cases in
    // `e2e/smoke.spec.ts` went red on it, because Playwright hands a download back under a temporary
    // name.
    await coldLoad(page);
    const zone = page.locator("[data-drop-zone]");
    const design = [
      { name: "downloaded-file", mime: "", url: "/samples/demo-single-deploy.ork" },
    ];
    await drag(zone, "drop", { files: design });

    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({
      timeout: 20000,
    });
  });
});

/** **The app's SECOND file ingest, and it had no drop path at all until 2026-08-18.**
 *
 *  `ROADMAP.md`'s P18 increment 3. The flight-log picker is an inline control in a toolbar row inside
 *  a `Figure` inside a `Card`, so it is not a `DropZone` — that primitive IS a card, and a card
 *  inside a card is a repaint of the results toolbar rather than an extraction, which is why the
 *  milestone split this out. What was missing was the BEHAVIOUR: the one gesture a flyer makes with
 *  a file did nothing on the surface that shows the flight the file belongs to.
 *
 *  `useFileDrop` is that behaviour, extracted from `DropZone` so the two cannot drift, and these
 *  cases drive the three defects it carries the fix for — on the second surface, where none of the
 *  cases above reach. */
test.describe("the flight log takes a drop, on the card that shows the flight", () => {
  async function flightWithPlots(page: import("@playwright/test").Page) {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 20000 });
    const plots = page.getByRole("region", { name: "Plots" });
    await expect(plots).toBeVisible();
    return page.locator("[data-log-drop]");
  }

  const LOG = [
    { name: "flight.csv", mime: "text/csv", content: [...new TextEncoder().encode("Time (s),Altitude (ft)\n0,0\n1,120\n2,300\n3,410\n4,300\n5,0\n")] },
  ];

  test("a dropped log is read and overlaid, exactly as a picked one is", async ({ page }) => {
    const card = await flightWithPlots(page);
    const plots = page.getByRole("region", { name: "Plots" });
    // The affordance: the surface says the gesture exists before anyone tries it. It used to read
    // "a CSV with time and altitude columns — its curve overlays here", which never mentions a drop
    // and, once `accept` widened to tab-separated exports, no longer said what the control takes.
    await expect(plots.getByText(/Drop one on this chart/)).toBeVisible();
    await expect(plots.getByText(/tab-separated/)).toBeVisible();

    // **The `accept` list matches what the PARSER takes**, which is the milestone's third clause and
    // was pinned by nothing until this line: `lib/flightlog.ts` tries a comma AND a tab delimiter, so
    // a `.tsv` it reads perfectly well was hidden by the OS dialog — a refusal made by the file
    // picker on the parser's behalf, and a wrong one. Reverting the widening fails here.
    const accept = await plots.getByLabel("Flight log file").getAttribute("accept");
    expect(accept, "the picker must offer what the parser can read").toContain(".tsv");
    expect(accept).toContain(".csv");

    await drag(card, "dragenter", { files: LOG });
    await drag(card, "drop", { files: LOG });

    // The overlay's own readouts — the point count and the peak comparison — are what prove the file
    // was PARSED rather than merely accepted.
    await expect(plots.getByText(/6 points/)).toBeVisible();
    await expect(plots.getByText(/Log peak/)).toBeVisible();
  });

  test("a file the parser cannot read is refused where the flyer is looking", async ({ page }) => {
    const card = await flightWithPlots(page);
    const plots = page.getByRole("region", { name: "Plots" });
    const junk = [{ name: "photo.png", mime: "image/png", content: [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13] }];

    await drag(card, "dragenter", { files: junk });
    await drag(card, "drop", { files: junk });

    // The parser's OWN sentence, in the row under the chart the file was dropped on — not a generic
    // "wrong file type", which is what a name gate would have produced and which says less.
    // The PARSER's own sentence specifically — `/couldn't/i` alone also matches the FileReader's
    // "Couldn't read that file.", so it could not tell "the parser refused it" from "the bytes never
    // arrived". Both name the columns the parser wanted, which is the actionable half.
    await expect(plots.getByText(/time and an altitude column|no data rows|numeric time\/altitude/i)).toBeVisible();
    // ...and nothing was drawn from it.
    await expect(plots.getByText(/Log peak/)).toHaveCount(0);
  });

  test("the highlight does not flicker, and a text drag never arms it", async ({ page }) => {
    const card = await flightWithPlots(page);

    // `dragenter` and `dragleave` both bubble, so crossing onto a child fires a leave at the card.
    // Counting depth is the fix; toggling drops the highlight every time the cursor crosses anything.
    // **Asserted on the ACCENT tone specifically, not on "has a border".** A first draft matched
    // `/bg-|border-/`, which every `Card` carries at rest — so it passed with the depth counting
    // replaced by a plain toggle, i.e. it could not fail. Caught by running that control.
    const ARMED = /border-indigo-500/;
    await expect(card, "the card must not be armed before anything is dragged").not.toHaveClass(ARMED);
    await drag(card, "dragenter", { files: LOG });
    await expect(card, "a file drag must arm the target").toHaveClass(ARMED);

    const child = card.locator("svg").first();
    await drag(child, "dragenter", { files: LOG });
    await drag(child, "dragleave", { files: LOG });
    await expect(card, "the highlight dropped when the pointer crossed a child").toHaveClass(ARMED);

    // ...and the matching leave at the card itself DOES disarm it, or "never disarms" would pass too.
    await drag(card, "dragleave", { files: LOG });
    await expect(card, "leaving the target must disarm it").not.toHaveClass(ARMED);

    // A text drag fires the same events and must not arm a target that cannot take one.
    await drag(card, "dragenter", { text: "some selected words" });
    await expect(card, "a text drag armed the file target").not.toHaveClass(ARMED);

    // **And a text drag must not DISARM one either** — the `Files` guard on `dragleave` is the third
    // of the hook's three and was the one with no control: every leg above carries `Files`, so
    // deleting that guard left all of them green. Dragging a selection out of an armed target is how
    // it fires.
    await drag(card, "dragenter", { files: LOG });
    await expect(card).toHaveClass(ARMED);
    await drag(card, "dragleave", { text: "some selected words" });
    await expect(card, "a text drag disarmed the file target").toHaveClass(ARMED);
  });

  test("cancels a dragover so a dragged link cannot navigate the app away", async ({ page }) => {
    // The one observable of `onDragOver`. Uncancelled, no `drop` ever fires AND the browser follows a
    // dragged link — taking the flyer out of the app, and their design with it.
    const card = await flightWithPlots(page);
    expect(await cancelled(card, "dragover", { files: LOG })).toBe(true);
    expect(await cancelled(card, "dragover", { text: "https://example.com" })).toBe(true);
  });
});
