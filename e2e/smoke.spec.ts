import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test.describe("Loft", () => {
  test("loads with a clean hydration and the heading", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Loft", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("imports a bundled sample and simulates the flight", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();

    // The rocket summary and results appear.
    await expect(page.getByRole("heading", { name: /Loft Demo/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await expect(page.getByLabel("Results").getByText("Apogee", { exact: true })).toBeVisible();

    // The recovery-adequacy readout is present and a real positive energy (½·m·v²).
    const landing = page
      .getByLabel("Results")
      .getByText("Landing energy", { exact: true })
      .locator("xpath=following-sibling::div[1]");
    await expect(landing).toBeVisible();
    expect(parseFloat((await landing.innerText()).replace(/[^\d.]/g, ""))).toBeGreaterThan(0);

    // The motor resolved exactly (pill with the designation).
    await expect(page.getByText("H128W", { exact: false }).first()).toBeVisible();

    // A plot renders.
    await expect(page.getByRole("heading", { name: /Altitude \(m\) vs time/ })).toBeVisible();

    // The OpenRocket comparison renders.
    await expect(page.getByRole("region", { name: "Validation" })).toHaveCount(0);

    // The Design workspace opens with the to-scale side-view — with the loaded motor and the CG
    // marked ahead of the CP, the stability picture read off the airframe.
    await page.getByRole("tab", { name: "Design" }).click();
    await expect(
      page.getByRole("group", { name: /motor H128W.*centre of gravity ahead of centre of pressure/ }),
    ).toBeVisible();

    // The part-by-part table is opt-in; expanding it, hovering a row links to the diagram.
    await page.locator("summary", { hasText: /Parts ·/ }).click();
    const finRow = page.locator("tr", { hasText: /Trapezoidal fins/ }).first();
    await finRow.hover();
    await expect(finRow).toHaveClass(/bg-indigo/);
    // The link is keyboard-accessible too: the row is focusable and lights up on focus.
    await page.mouse.move(0, 0);
    await finRow.focus();
    await expect(finRow).toHaveClass(/bg-indigo/);

    // Each part carries its own dry mass beside its dimensions, and the column sorts heaviest-first
    // — the "where is my mass going?" question answered on the part you are looking at.
    const table = page.locator("table").first();
    const massOf = async (row: number) =>
      parseFloat((await table.locator("tbody tr").nth(row).locator("td").nth(2).innerText()).replace(/[^\d.]/g, ""));
    await table.getByRole("button", { name: /Mass/ }).click();
    const heaviest = await massOf(0);
    expect(heaviest).toBeGreaterThan(0);
    expect(heaviest).toBeGreaterThanOrEqual(await massOf(1));
    // Clicking the active heading returns to the design's own nose-to-tail order.
    await table.getByRole("button", { name: /Mass/ }).click();
    await expect(table.locator("tbody tr").first()).toContainText("Nose cone");

    // Pointing at a part on the diagram says what it weighs, not just what it is.
    await finRow.hover();
    await expect(page.locator("p[aria-live='polite']").first()).toContainText(/Trapezoidal fins.*from the nose.*kg/);
  });

  test("an explanation of how a design was read isn't dressed as a parse failure", async ({ page }) => {
    // "This design has 2 stages, flown serially…" is Loft saying it understood the design, not that
    // it didn't. It sat under an amber "Some parts of this design weren't fully understood".
    await page.goto("/");
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/two-stage-firm-booster.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    const note = page.getByText("How Loft read this design");
    await expect(note).toBeVisible();
    await expect(page.getByText(/weren't fully understood/)).toHaveCount(0);
    await expect(page.getByText(/flown serially/)).toBeVisible();
  });

  test("an analysis table can be copied straight out, not just downloaded", async ({ page }) => {
    // A file download is the right shape for archiving a run and the wrong one for pasting a motor
    // comparison into a spreadsheet or a build thread, which is what this audience does with it.
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Analyze" }).click();

    const sweep = page.getByRole("region", { name: "Motor sweep" });
    await sweep.getByRole("button", { name: "Run motor sweep" }).click();
    await expect(sweep.locator("table")).toBeVisible();
    await sweep.getByRole("button", { name: "Copy" }).click();
    await expect(sweep.getByRole("button", { name: "Copied" })).toBeVisible();

    const text = await page.evaluate(() => navigator.clipboard.readText());
    const lines = text.split("\n");
    expect(lines[0]).toContain("Motor\tManufacturer");
    expect(lines.length).toBeGreaterThan(2); // header plus a row per fitting motor
    // Tab-separated, so a paste lands in columns rather than in one cell.
    expect(lines[1].split("\t").length).toBe(lines[0].split("\t").length);
  });

  test("a design edit re-runs an open sweep instead of throwing it away", async ({ page }) => {
    // The workbench loop: change something, see how the comparison moved. It used to be impossible —
    // any edit remounted the Analyze panels to idle, so a completed sweep (or a 300-flight
    // Monte-Carlo) vanished with no notice and the "before" was gone.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    const apogee = async () =>
      parseFloat(
        (
          await page
            .getByLabel("Results")
            .getByText("Apogee", { exact: true })
            .locator("xpath=following-sibling::div")
            .innerText()
        ).replace(/[^\d.]/g, ""),
      );

    await page.getByRole("tab", { name: "Analyze" }).click();
    const sweep = page.getByRole("region", { name: "Motor sweep" });
    await sweep.getByRole("button", { name: "Run motor sweep" }).click();
    const firstRow = () => sweep.locator("tbody tr").first().locator("td").nth(1);
    await expect(firstRow()).not.toBeEmpty();
    const sweptBefore = await firstRow().innerText();
    const flownBefore = await apogee();

    // Widen the fins on the Design workspace, then come back.
    await page.getByRole("tab", { name: "Design" }).click();
    const span = page.locator("label", { hasText: /Fin span/ }).locator("input");
    await span.fill("70");
    await span.blur();
    await expect.poll(apogee).not.toBe(flownBefore);

    await page.getByRole("tab", { name: "Analyze" }).click();
    // The sweep is still open, and it has re-flown every motor on the edited design.
    await expect(sweep.locator("table")).toBeVisible();
    await expect.poll(async () => firstRow().innerText()).not.toBe(sweptBefore);
  });

  test("the nose is draggable on the diagram, and arrow keys nudge rather than jump", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Design" }).click();

    // The import screen promises you can drag the nose. It has to be there.
    const nose = () => page.getByRole("slider", { name: "Nose length" });
    await expect(nose()).toBeVisible();
    const at = async () => Number(await nose().getAttribute("aria-valuenow"));
    const before = await at();
    expect(before).toBeGreaterThan(0);

    // A step scaled to the handle's own range: an arrow is a nudge, Shift is the bigger move — the
    // fixed 10 mm arrow / 50 mm Shift pair had it the wrong way round and could not reach a value
    // between two steps on a small airframe.
    await nose().focus();
    await page.keyboard.press("ArrowRight");
    const nudged = await at();
    expect(nudged).toBeGreaterThan(before);
    await nose().focus();
    await page.keyboard.press("Shift+ArrowRight");
    expect((await at()) - nudged).toBeGreaterThan(nudged - before);

    // Dragging the nose re-flies the design — it is a design change, not a drawing change.
    await expect(page.getByRole("button", { name: /Reset to as-designed/ })).toBeVisible();
  });

  test("the page has a top, and a keyboard reaches the workspace first", async ({ page }) => {
    await page.goto("/");
    // The app page titles itself. An outline that starts at <h2> has no top for a screen reader to
    // land on, and the app is the page people actually use.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Loft");
    // …and the docs section, which titles itself, still has exactly one of its own.
    await page.goto("/docs");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Documentation");

    // Reaching the workspace by keyboard used to mean tabbing through the whole header, starting
    // with a link off to another site.
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeVisible();
  });

  test("a staged design is told why three Analyze tools aren't offered", async ({ page }) => {
    // Three of the four are single-stage only. Rendering nothing at all reads as "Loft doesn't have
    // these", which is a different claim from "they don't apply to this design".
    await page.goto("/");
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/two-stage-firm-booster.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("tab", { name: "Analyze" }).click();
    const panel = page.locator("#panel-analyze");
    await expect(panel.getByRole("heading", { name: /Second solver and design sweeps/ })).toBeVisible();
    await expect(panel).toContainText(/flies 2 stages/);
    // The one that does apply is still there.
    await expect(panel.getByRole("heading", { name: /Monte-Carlo/ })).toBeVisible();
  });

  test("a file Loft can't read says so in the flyer's words", async ({ page }) => {
    // The front door of the app. A parser internal on screen ("zip: end-of-central-directory not
    // found") tells someone holding the wrong file nothing about which file to reach for instead.
    await page.goto("/");
    const input = page.getByLabel(/^Choose an OpenRocket/);
    const error = page.locator("div.border-red-500\\/30").first();

    await input.setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: Buffer.from("\x89PNG\r\n\x1a\n....", "binary") });
    await expect(error).toContainText(/looks like an image/i);
    await expect(error).toContainText(/\.ork/);

    await input.setInputFiles({ name: "broken.ork", mimeType: "application/zip", buffer: Buffer.from("PK\x03\x04truncated", "binary") });
    await expect(error).toContainText(/truncated or corrupt/i);

    await expect(page.getByText(/^zip:|^xml:|end-of-central-directory/)).toHaveCount(0);
  });

  test("a what-if outside its physical range is brought back into it, not flown", async ({ page }) => {
    // A rail angle of 120° is a typo, not a launch. The solver still returns a number for it — it
    // returned an apogee of zero — and a confident zero from a mistyped field is worse than no
    // figure at all. Every what-if carries the range in which it means something.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    const apogee = async () =>
      parseFloat(
        (
          await page
            .getByLabel("Results")
            .getByText("Apogee", { exact: true })
            .locator("xpath=following-sibling::div")
            .innerText()
        ).replace(/[^\d.]/g, ""),
      );
    expect(await apogee()).toBeGreaterThan(0);

    await page.locator("summary", { hasText: /conditions/i }).first().click();
    const angle = page.getByLabel(/Rail angle/i).first();
    await angle.fill("120");
    await angle.blur();
    await expect(angle).toHaveValue("45");
    expect(await apogee()).toBeGreaterThan(0);

    // A negative tilt is not a tilt the other way — direction is not this field's job.
    await angle.fill("-30");
    await angle.blur();
    await expect(angle).toHaveValue("0");

    // Nor is a negative wind speed a wind from the other side.
    await angle.fill("");
    await angle.blur();
    const wind = page.getByLabel(/Surface wind/i).first();
    await wind.fill("-50");
    await wind.blur();
    await expect(wind).toHaveValue(/^0(\.0+)?$/);
  });

  test("clearing a what-if brings the stored-tool comparison back", async ({ page }) => {
    // A what-if means Loft is no longer flying the design the file describes, so the stored-results
    // comparison is withheld. Clearing it again must restore it — the edit fields are the surface
    // the app invites you to use, and a one-way door out of its headline check is not honest.
    await page.goto("/");
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/logged-sample.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    const comparison = page.getByRole("heading", { name: /vs Loft/ });
    const reset = page.getByRole("button", { name: /Reset to as-designed/ });
    await expect(comparison).toHaveCount(1);

    await page.locator("summary", { hasText: /conditions/i }).first().click();
    const rail = page.getByLabel(/Rail length/i).first();
    await rail.fill("2");
    await expect(comparison).toHaveCount(0);
    await expect(reset).toBeVisible();

    // Emptying the field is as much a way back as the button is — and the button must not vanish
    // before the comparison returns, or there is no way back at all.
    await rail.fill("");
    await expect(comparison).toHaveCount(1);
    await expect(reset).toHaveCount(0);
  });

  test("the open workspace is in the address, so Back and a reload land where you were", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    // An import lands on its flight result, and says so in the address.
    expect(new URL(page.url()).hash).toBe("#flight");

    await page.getByRole("tab", { name: "Analyze" }).click();
    expect(new URL(page.url()).hash).toBe("#analyze");
    await page.getByRole("tab", { name: "Design" }).click();
    expect(new URL(page.url()).hash).toBe("#design");

    // Back returns to the workspace you came from rather than leaving the app.
    await page.goBack();
    expect(new URL(page.url()).hash).toBe("#analyze");
    await expect(page.getByRole("tab", { selected: true })).toHaveText("Analyze");

    // …and a reload picks the same workspace back up, not the one the design loaded on.
    await page.reload();
    await expect(page.getByRole("tablist")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("tab", { selected: true })).toHaveText("Analyze");
  });

  test("keeps the designs you have opened on a shelf you can reopen from", async ({ page }) => {
    await page.goto("/");
    // A first visit has no history, so the shelf isn't shown at all.
    await expect(page.getByText("Your designs")).toHaveCount(0);

    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Import another/ }).click();
    const shelf = page.getByRole("list").filter({ has: page.getByRole("button", { name: /^Reopen/ }) });
    await expect(shelf.getByRole("button", { name: /^Reopen/ })).toHaveCount(1);

    // A second design joins it, newest first.
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Import another/ }).click();
    await expect(shelf.getByRole("button", { name: /^Reopen/ }).first()).toContainText("54mm");

    // The shelf survives a reload — it is the point of it at the pad — even though "Import another"
    // ended the session, so there is nothing to restore. Reopening flies the design straight away.
    await page.reload();
    await expect(shelf.getByRole("button", { name: /^Reopen/ })).toHaveCount(2);
    await shelf.getByRole("button", { name: /^Reopen/ }).nth(1).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 }).first()).toContainText("38mm");

    // And a design can be dropped from it.
    await page.getByRole("button", { name: /Import another/ }).click();
    await page.getByRole("button", { name: /^Remove .* from your designs/ }).first().click();
    await expect(shelf.getByRole("button", { name: /^Reopen/ })).toHaveCount(1);
  });

  test("starts a new design from scratch and flies it (builder)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();

    // A from-scratch design enters the same pipeline: it names itself, resolves a motor, is stable.
    await expect(page.getByRole("heading", { name: "New design", exact: true })).toBeVisible();
    await expect(page.getByText("H128W", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Static margin", { exact: false })).toBeVisible();

    // A build lands on the Design workspace — the editable rocket, not the flight readout.
    await expect(page.getByRole("tab", { name: "Design" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeVisible();

    // It still flies: switch to Flight and read a real apogee out of the box.
    await page.getByRole("tab", { name: "Flight" }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    const apogee = await page
      .getByLabel("Results")
      .getByText("Apogee", { exact: true })
      .locator("xpath=following-sibling::div")
      .innerText();
    expect(parseFloat(apogee.replace(/[^\d.]/g, ""))).toBeGreaterThan(100);

    // No stored source, so it is not mislabelled with an OpenRocket/RockSim comparison.
    await expect(page.getByRole("region", { name: "Validation" })).toHaveCount(0);
  });

  test("exports the current design as a downloadable .ork", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    // The design summary and its Download control sit above the workspace tabs, so they're reachable
    // whichever workspace a build opens on.
    await expect(page.getByRole("heading", { name: "New design", exact: true })).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download .ork" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.ork$/);
  });

  test("exports the flight trajectory as a CSV", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    // The download sits in the Flight workspace's Plots section, beside the charts it exports.
    const plots = page.getByRole("region", { name: "Plots" });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      plots.getByRole("button", { name: /Download flight data/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/flight-data\.csv$/);
    const csv = readFileSync(await download.path(), "utf8");
    const lines = csv.split(/\r?\n/);
    // The header names the columns; the body is the sample-by-sample trajectory (hundreds of rows).
    expect(lines[0]).toContain("Altitude (m)");
    expect(lines[0]).toContain("Mach");
    expect(lines[0]).toContain("Thrust (N)");
    expect(lines.length).toBeGreaterThan(50);
    // The flight starts on the pad (the first sample is early, still on the rail) and runs through
    // powered and coasting flight.
    const first = lines[1].split(",");
    expect(Number(first[0])).toBeLessThan(0.1); // time near zero
    expect(first[1]).toBe("rod"); // phase column: still on the launch rail
    expect(csv).toContain(",boost,");
    expect(csv).toContain(",coast,");
  });

  test("resets every what-if back to the as-designed flight", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const summaryApogee = async () => {
      const dd = page.getByText("Apogee", { exact: true }).first().locator("xpath=following-sibling::dd");
      return parseFloat((await dd.innerText()).replace(/[^\d.]/g, ""));
    };
    const before = await summaryApogee();
    expect(before).toBeGreaterThan(0);
    // The as-designed flight shows the OpenRocket comparison and offers no reset (nothing to undo).
    await expect(page.getByRole("region", { name: "Validation" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reset to as-designed" })).toHaveCount(0);

    // Stack a design what-if: nose ballast makes the rocket heavier and lower.
    await page.getByRole("tab", { name: "Design" }).click();
    await page.getByLabel(/Nose ballast/).fill("500");
    await expect.poll(summaryApogee).toBeLessThan(before);

    // Back on Flight, the hypothetical flight has dropped the stored comparison, and the header now
    // offers a one-click way back.
    await page.getByRole("tab", { name: "Flight" }).click();
    await expect(page.getByRole("region", { name: "Validation" })).toHaveCount(0);
    const resetBtn = page.getByRole("button", { name: "Reset to as-designed" });
    await expect(resetBtn).toBeVisible();

    // Reset restores the exact as-designed flight: the apogee returns, the comparison is back, and
    // the control disappears (nothing left to undo).
    await resetBtn.click();
    await expect.poll(summaryApogee).toBe(before);
    await expect(page.getByRole("region", { name: "Validation" })).toHaveCount(0);
    await expect(resetBtn).toHaveCount(0);
  });

  test("overlays an uploaded flight log on the altitude plot", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const plots = page.getByRole("region", { name: "Plots" });
    // Before upload: just Loft's own altitude curve — no "flight log" series in the legend.
    await expect(plots.getByText("flight log", { exact: true })).toHaveCount(0);

    // Upload an altimeter CSV (parsed in the browser); its curve overlays the prediction. The fixture
    // carries both altitude and velocity columns, so the "flight log" series appears on both plots.
    await plots.getByLabel("Flight log CSV").setInputFiles(resolve(process.cwd(), "e2e/fixtures/flight-log.csv"));
    await expect(plots.getByText("flight log", { exact: true })).toHaveCount(2);
    // The file named feet and ft/s, so both unit pickers read those — and can be corrected.
    await expect(plots.getByLabel("Flight log altitude unit")).toHaveValue("ft");
    await expect(plots.getByLabel("Flight log speed unit")).toHaveValue("ft/s");
    await expect(plots.getByText(/\d+ points/)).toBeVisible();
    // The concrete payoff on each plot: the log's own peak beside Loft's prediction.
    await expect(plots.getByText(/Log peak/).first()).toBeVisible();
    await expect(plots.getByText(/Loft predicted/)).toHaveCount(2); // apogee and max-velocity comparisons

    // Removing it clears both overlays.
    await plots.getByRole("button", { name: "Remove" }).click();
    await expect(plots.getByText("flight log", { exact: true })).toHaveCount(0);
    await expect(plots.getByLabel("Flight log speed unit")).toHaveCount(0);
  });

  test("rejects an unreadable flight log with a helpful message", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const plots = page.getByRole("region", { name: "Plots" });
    // A .ork (not a time/altitude CSV) can't be read as a flight log — say so, don't draw a wrong curve.
    await plots.getByLabel("Flight log CSV").setInputFiles(resolve(process.cwd(), "e2e/fixtures/logged-sample.ork"));
    await expect(plots.getByText(/couldn't|no data rows|numeric/i)).toBeVisible();
    await expect(plots.getByText("flight log", { exact: true })).toHaveCount(0);
  });

  test("renames the design and the results title and .ork filename follow", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();

    // The results title (above the workspace tabs) starts as the design's own name.
    await expect(page.getByRole("heading", { name: "New design", exact: true })).toBeVisible();

    // Renaming updates the title live — pure metadata, no re-fly needed.
    await page.getByLabel("Design name").fill("Blue Streak");
    await expect(page.getByRole("heading", { name: "Blue Streak", exact: true })).toBeVisible();

    // …and the saved file is named for the design, so variants don't clobber each other.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download .ork" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("Blue-Streak.ork");
  });

  test("imports the RockSim .rkt sample and simulates the flight", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /RockSim · 54 mm sport/ }).click();

    // The RockSim design imports and flies through the same engine.
    await expect(page.getByRole("heading", { name: /54 mm sport/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await expect(page.getByLabel("Results").getByText("Apogee", { exact: true })).toBeVisible();

    // The J420R resolved from the EngineSet, and the footer names the RockSim format.
    await expect(page.getByText("J420R", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/RockSim format/).first()).toBeVisible();

    // The comparison is labelled for RockSim, not OpenRocket.
    await expect(page.getByRole("heading", { name: "RockSim vs Loft" })).toBeVisible();
  });

  test("a RockSim design gets the motor tools, at the casing it actually flies", async ({ page }) => {
    // RockSim states no motor casing — its MotorDia is the mount's bore — so both motor surfaces
    // used to be withheld from every .rkt import with nothing on screen saying why.
    await page.goto("/");
    await page.getByRole("button", { name: /RockSim · 54 mm sport/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Analyze" }).click();
    await expect(page.getByRole("region", { name: "Motor sweep" })).toBeVisible();

    await page.getByRole("tab", { name: "Design" }).click();
    const picker = page.getByRole("combobox", { name: "Swap motor" });
    await expect(picker).toBeVisible();

    // At the casing the design ALREADY FLIES, not the 54 mm bore its mount declares. Asserted by
    // what is offered: its own 38 mm J420R is there to swap back to, and the 24 mm C11 that the
    // OpenRocket sample flies is not — a bore-derived list would have neither.
    const offered = await picker.locator("option").allTextContents();
    expect(offered.some((o) => /J420R/.test(o))).toBe(true);
    expect(offered.some((o) => /\bC11\b/.test(o))).toBe(false);
    expect(offered.length).toBeGreaterThan(2);

    // And the picker flies the swap, rather than merely rendering. A control that appears but
    // changes nothing is worse than one that is honestly absent.
    const summaryApogee = async () => {
      const dd = page.getByText("Apogee", { exact: true }).first().locator("xpath=following-sibling::dd");
      return parseFloat((await dd.innerText()).replace(/[^\d.]/g, ""));
    };
    await page.getByRole("tab", { name: "Flight" }).click();
    const asDesigned = await summaryApogee();
    expect(asDesigned).toBeGreaterThan(0);

    await page.getByRole("tab", { name: "Design" }).click();
    // The options are sorted weakest total impulse first, so the last one is the biggest motor of
    // this casing — deterministic, unlike matching a class letter that a manufacturer name can also
    // contain. It carries more impulse than the design's J420R, so the same airframe flies higher.
    const swapTo = offered[offered.length - 1];
    expect(swapTo).not.toMatch(/J420R/);
    await picker.selectOption({ label: swapTo });
    await page.getByRole("tab", { name: "Flight" }).click();
    await expect.poll(summaryApogee).toBeGreaterThan(asDesigned);
  });

  test("dual-deploy sample flags transonic and shows two deploy markers", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: /Loft Demo/ })).toBeVisible();
    await expect(page.getByText(/transonic|supersonic/i).first()).toBeVisible();
    // A dual-deploy flight reports two descent rates: the fast phase under the drogue and the slower
    // final descent under the main — a single-deploy flight shows only the one.
    const results = page.getByLabel("Results");
    await expect(results.getByText("Drogue descent")).toBeVisible();
    await expect(results.getByText("under drogue")).toBeVisible();
    await expect(results.getByText("under main")).toBeVisible();
  });

  test("multi-config sample lets you switch motor configuration", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Motor comparison/ }).click();
    await expect(page.getByRole("heading", { name: /Loft Demo/ })).toBeVisible();

    // The picker appears and the default configuration (H128W) is flown.
    const picker = page.getByLabel("Motor configuration");
    await expect(picker).toBeVisible();
    await expect(page.getByText("H128W", { exact: false }).first()).toBeVisible();

    // Switching to the G40W configuration re-flies and shows that motor.
    await picker.selectOption("1");
    await expect(page.getByText("G40W", { exact: false }).first()).toBeVisible();

    // A shipped sample states no flight results, so no comparison panel appears for it — there is
    // nothing to compare against, and inventing something to show would be the wrong answer.
    await expect(page.getByRole("region", { name: "Validation" })).toHaveCount(0);
  });

  test("an imported file with a stored per-step log shows the drag cross-check", async ({ page }) => {
    await page.goto("/");
    // A design carrying the tool's own step-by-step flight (a hand-authored log, not a bundled demo).
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/logged-sample.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    // Loft overlays its own solver on the file's stored per-step flight: an altitude curve and a
    // drag-coefficient curve, the latter quantified with a mean-gap figure.
    const panel = page.getByRole("region", { name: "Stored-flight cross-check" });
    await expect(panel).toBeVisible();
    await expect(panel.locator("svg")).toHaveCount(2);
    await expect(panel.getByText(/mean gap/)).toBeVisible();
  });

  test("a design whose motor isn't bundled can be flown with a substitute", async ({ page }) => {
    await page.goto("/");
    // A real-world snag: the file names a motor Loft doesn't carry a thrust curve for, so nothing
    // flies. Rather than dead-end, the notice points at the same-casing substitutes in the design
    // tools, and swapping one in re-flies the design.
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/unresolved-motor.ork"));

    const notice = page.getByRole("region", { name: "No flight simulated" });
    await expect(notice).toBeVisible({ timeout: 15000 });
    // The recovery path is spelled out — a substitute of the same casing, picked in the design tools.
    await expect(notice.getByText(/Fly it with a substitute/)).toBeVisible();
    await expect(notice.getByText(/29 mm casing/)).toBeVisible();

    // The "Swap motor" picker sits right below, listing bundled 29 mm motors. Pick the first one.
    const swap = page.getByRole("combobox", { name: "Swap motor" });
    await expect(swap).toBeVisible();
    await swap.selectOption({ index: 1 });

    // With a real curve behind it the design flies. The swap happens on Design and the view stays
    // there — the flyer is at the editing surface — so the payoff has to be legible without moving:
    // the no-flight notice clears and the summary strip above the tabs gains its apogee.
    await expect(page.getByRole("heading", { name: "No flight simulated" })).toBeHidden();
    await expect(page.getByRole("tab", { name: "Flight" })).toBeVisible();
    await expect(page.getByRole("term").filter({ hasText: /^Apogee$/ })).toBeVisible();
  });

  test("a design that can't fly still gets the whole navigation spine", async ({ page }) => {
    await page.goto("/");
    // A design whose motor isn't bundled used to lose the workspace tabs entirely, and with them the
    // diagram, the parts table and the mass breakdown — everything that answers "did Loft read my
    // rocket right?", which is exactly the question a file that didn't fly raises.
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/unresolved-motor.ork"));
    await expect(page.getByRole("region", { name: "No flight simulated" })).toBeVisible({ timeout: 15000 });

    // All three workspaces are there, and it lands on Design — the one with something in it.
    await expect(page.getByRole("tab")).toHaveCount(3);
    await expect(page.getByRole("tab", { name: "Design" })).toHaveAttribute("aria-selected", "true");
    // The geometry is real and motor-independent, so the diagram and the parts table are shown.
    await expect(page.getByLabel(/Scale side-view/)).toBeVisible();

    // Flight says what it would hold and why it is empty, rather than vanishing.
    await page.getByRole("tab", { name: "Flight" }).click();
    await expect(page.getByRole("region", { name: "Flight unavailable" })).toBeVisible();
    await expect(page.getByLabel("Results", { exact: true })).toHaveCount(0);

    // Analyze does the same — and offers the motor sweep, which flies the bundled substitutes
    // themselves and so is the one analysis that still works on a design with no resolved motor.
    await page.getByRole("tab", { name: "Analyze" }).click();
    await expect(page.getByRole("region", { name: /unavailable$/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Motor sweep" })).toBeVisible();

    // Advice points at the Design workspace, which now exists on every design.
    await page.getByRole("tab", { name: "Design" }).click();
    await expect(page.getByText("in the Design workspace").first()).toBeVisible();
    // Nothing may offer a configuration picker that only renders for a multi-config design.
    if ((await page.getByRole("combobox", { name: /configuration/i }).count()) === 0) {
      await expect(page.getByText("pick a configuration")).toHaveCount(0);
    }

    // Swapping in a bundled motor fills the empty workspaces in rather than changing the layout.
    await page.getByRole("combobox", { name: "Swap motor" }).selectOption({ index: 1 });
    await expect(page.getByRole("heading", { name: "No flight simulated" })).toBeHidden();
    await page.getByRole("tab", { name: "Flight" }).click();
    await expect(page.getByLabel("Results").getByText("Apogee", { exact: true })).toBeVisible();
  });

  test("the thrust curve is annotated with the motor's impulse, thrust, and burn stats", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    // Below the thrust curve, the numbers a flyer reads it for: delivered total impulse and class,
    // peak and average thrust, burn time, and propellant mass — here the demo's AeroTech H128W.
    const thrust = page.getByRole("heading", { name: "Motor thrust (N) vs time" }).locator("xpath=..");
    await expect(thrust).toBeVisible();
    await expect(thrust.getByText("total impulse")).toBeVisible();
    await expect(thrust.getByText("177.8 N·s (H)")).toBeVisible();
    await expect(thrust.getByText("190 N")).toBeVisible();
    await expect(thrust.getByText("1.3 s")).toBeVisible();
    await expect(thrust.getByText("94 g")).toBeVisible();
  });

  test("a RASAero .CDX1 imports and flies through the same solver", async ({ page }) => {
    // A third design format, read by its XML root like the others. RASAero carries no materials or
    // per-part masses, so this also exercises the stated-launch-weight path end to end.
    await page.goto("/");
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/demo-rasaero.CDX1"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel("Results").getByText("Apogee", { exact: true })).toBeVisible();
    // The import says plainly that the flight uses the weight and CG the file states.
    await expect(page.getByText(/no materials or per-part masses/i).first()).toBeVisible();
    // The file's own stored numbers are attributed to RASAero, not to OpenRocket — as is the
    // format stamp. A prediction belongs to the tool that made it.
    await expect(page.getByText(/RASAero format 2/).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "RASAero vs Loft" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "OpenRocket vs Loft" })).toHaveCount(0);
    await expect(page.getByText(/OpenRocket format \d/)).toHaveCount(0);
  });

  test("a two-stage design with an undersized booster chute is flagged for a firm booster landing", async ({ page }) => {
    await page.goto("/");
    // A serial two-stage rocket whose booster recovers under its own (too-small) canopy: it lands
    // firm, which the range-safety readout must flag even though only the top stage is flown down.
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/two-stage-firm-booster.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    // The booster's own descent is reported and, because it comes in fast, called out by name.
    await expect(page.getByText(/separated lower stage lands (firm|hard)/i)).toBeVisible();
    await expect(page.getByText(/Booster at about [\d.]+ m\/s/)).toBeVisible();
    // The descent readout gives the booster's own landing speed and energy under its canopy.
    await expect(page.getByText(/comes down at about [\d.]+ m\/s \([\d.]+ [J]\) under its own canopy/)).toBeVisible();
  });

  test("clustering the motor re-flies the design harder — a higher apogee (builder)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const single = await apogee();
    expect(single).toBeGreaterThan(0);

    // Fly the single motor as a 3-motor cluster: three times the thrust dominates the extra motor
    // mass, so the design climbs markedly higher. The edit surface lives in the Design workspace;
    // flip back to Flight to read the new apogee.
    await page.getByRole("tab", { name: "Design" }).click();
    await page.getByLabel("Motor cluster").fill("3");
    await page.getByRole("tab", { name: "Flight" }).click();
    await expect.poll(apogee).toBeGreaterThan(single * 1.3);
  });

  test("adding a payload mass re-flies the design — lower, and CG-shifted", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();

    // Add a 300 g payload — a builder mass add — on the Design workspace, then read the flight.
    await page.getByRole("tab", { name: "Design" }).click();
    await page.getByLabel(/Payload \(/).fill("300");
    await page.getByRole("tab", { name: "Flight" }).click();

    // Re-flies heavier: the added mass costs apogee, and a "what-if vs design" delta appears with a
    // stability change (the payload shifts the CG).
    await expect.poll(apogee).toBeLessThan(before);
    const panel = page.getByRole("group", { name: "What-if vs design" });
    await expect(panel).toBeVisible();
    await expect(panel.locator("div", { hasText: /^Apogee/ }).getByText(/−[\d.]+%/)).toBeVisible();
    await expect(panel.getByText(/[+−][\d.]+ cal/)).toBeVisible();
  });

  test("nose ballast re-flies the design heavier — a lower apogee", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // Add a heavy nose ballast — a "what-if" design change — on the Design workspace, then read.
    await page.getByRole("tab", { name: "Design" }).click();
    await page.getByLabel(/Nose ballast/).fill("500");
    await page.getByRole("tab", { name: "Flight" }).click();

    // Re-flies on change: the heavier rocket doesn't reach as high.
    await expect.poll(apogee).toBeLessThan(before);

    // A "what-if vs design" delta appears, spelling out the trade against the unballasted design:
    // added nose weight raises stability (a positive caliber delta) and costs apogee (a negative %).
    const panel = page.getByRole("group", { name: "What-if vs design" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/vs the design under the same conditions/)).toBeVisible();
    // Stability rose: a positive caliber delta (only the banner shows a signed "+… cal").
    await expect(panel.getByText(/\+[\d.]+ cal/)).toBeVisible();
    // Apogee fell: its row shows a negative percentage change (U+2212 minus).
    const apogeeRow = panel.locator("div", { hasText: /^Apogee/ });
    await expect(apogeeRow.getByText(/−[\d.]+%/)).toBeVisible();
  });

  test("apogee shows in the summary above the tabs and updates while editing on Design", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    // The summary strip sits above the workspace tabs, so its Apogee is the first one in the DOM
    // (the Flight panel's Results section renders below). Read it there — no tab switch.
    const summaryApogee = async () => {
      const dd = page
        .getByText("Apogee", { exact: true })
        .first()
        .locator("xpath=following-sibling::dd");
      return parseFloat((await dd.innerText()).replace(/[^\d.]/g, ""));
    };
    const before = await summaryApogee();
    expect(before).toBeGreaterThan(0);

    // Edit on the Design workspace and stay there: the above-tabs apogee re-flies live, so the
    // heavier rocket's lower apogee is visible without leaving the editing surface.
    await page.getByRole("tab", { name: "Design" }).click();
    await page.getByLabel(/Nose ballast/).fill("500");
    await expect.poll(summaryApogee).toBeLessThan(before);
  });

  test("moving the fins aft re-flies the design stiffer — a higher static margin", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();

    // Slide the whole fin group 100 mm aft — a "what-if" stability trim — on the Design workspace.
    await page.getByRole("tab", { name: "Design" }).click();
    const finPos = page.getByRole("spinbutton", { name: /Fin position/ });
    await expect(finPos).toBeVisible();
    const design = parseFloat((await finPos.getAttribute("placeholder")) ?? "0");
    expect(design).toBeGreaterThan(0);
    await finPos.fill(String(Math.round(design + 100)));
    await page.getByRole("tab", { name: "Flight" }).click();

    // A "what-if vs design" delta appears: fins aft move the centre of pressure aft, so the static
    // margin rises (a positive caliber delta in the banner).
    const panel = page.getByRole("group", { name: "What-if vs design" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/\+[\d.]+ cal/)).toBeVisible();
    // The shift barely touches drag or mass, so apogee holds within a couple of per-cent.
    const after = await apogee();
    expect(Math.abs(after - before) / before).toBeLessThan(0.03);
  });

  test("a bigger recovery canopy re-flies the design — a slower, softer descent, same apogee", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const stat = async (label: string) => {
      const txt = await page
        .getByLabel("Results")
        .getByText(label, { exact: true })
        .locator("xpath=following-sibling::div")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const apogeeBefore = await stat("Apogee");
    const descentBefore = await stat("Descent rate");
    const groundHitBefore = await stat("Ground-hit speed");
    expect(descentBefore).toBeGreaterThan(0);

    // Double the recovery drag area — a bigger canopy, a "what-if" — on the Design workspace.
    await page.getByRole("tab", { name: "Design" }).click();
    await page.getByLabel(/Recovery size/).fill("2");
    await page.getByRole("tab", { name: "Flight" }).click();

    // Re-flies on change: the bigger canopy brings it down slower and lands softer...
    await expect.poll(() => stat("Descent rate")).toBeLessThan(descentBefore);
    await expect.poll(() => stat("Ground-hit speed")).toBeLessThan(groundHitBefore);
    // ...while the ascent is untouched — same apogee (recovery scales only the descent).
    expect(Math.abs((await stat("Apogee")) - apogeeBefore)).toBeLessThan(1);
  });

  test("enlarging the main parachute (builder) lands the design softer", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const stat = async (label: string) => {
      const txt = await page
        .getByLabel("Results")
        .getByText(label, { exact: true })
        .locator("xpath=following-sibling::div")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const apogeeBefore = await stat("Apogee");
    const descentBefore = await stat("Descent rate");
    const groundHitBefore = await stat("Ground-hit speed");
    expect(descentBefore).toBeGreaterThan(0);

    // Resize the design's own main canopy to 1.5× its current diameter — a real, bake-in edit (not
    // the transient multiplier). Read the current size from the field's placeholder so it's unit-safe.
    await page.getByRole("tab", { name: "Design" }).click();
    const field = page.getByLabel(/Main chute Ø/);
    const current = parseFloat((await field.getAttribute("placeholder"))!.replace(/[^\d.]/g, ""));
    expect(current).toBeGreaterThan(0);
    await field.fill((current * 1.5).toFixed(2));
    await page.getByRole("tab", { name: "Flight" }).click();

    // A bigger canopy brings it down slower and lands softer...
    await expect.poll(() => stat("Descent rate")).toBeLessThan(descentBefore);
    await expect.poll(() => stat("Ground-hit speed")).toBeLessThan(groundHitBefore);
    // ...and, unlike the transient recovery-size multiplier, this bakes in the heavier (area-scaled)
    // canopy, so it also carries a little more mass up — a slightly lower apogee, not a higher one.
    expect(await stat("Apogee")).toBeLessThanOrEqual(apogeeBefore);
  });

  test("swapping the motor re-flies the design on a different motor", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();

    await page.getByRole("tab", { name: "Design" }).click();
    const select = page.getByLabel("Swap motor");
    await expect(select).toBeVisible();
    // Pick a fitting motor that isn't the design's own H128W (the largest same-diameter option).
    const value = await select
      .locator("option")
      .evaluateAll(
        (opts) =>
          (opts as HTMLOptionElement[])
            .map((o) => o.value)
            .filter((v) => v && !v.includes("H128W"))
            .pop() ?? "",
      );
    expect(value).not.toEqual("");
    await select.selectOption(value);
    await page.getByRole("tab", { name: "Flight" }).click();

    // Re-flies on the swapped motor — a different apogee.
    await expect.poll(apogee).not.toBe(before);

    // The "what-if vs design" delta appears and names the motor change against the design's own.
    const panel = page.getByRole("group", { name: "What-if vs design" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/design flew/)).toBeVisible();
  });

  test("motor sweep flies every fitting motor and marks the design's own", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    // The sweep panel lives in the Analyze workspace; it offers to fly every fitting bundled motor.
    await page.getByRole("tab", { name: "Analyze" }).click();
    const panel = page.getByRole("region", { name: "Motor sweep" });
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: /Run motor sweep/ }).click();

    // A results table appears with several motors and the design's own marked.
    const rows = panel.locator("tbody tr");
    await expect.poll(async () => rows.count()).toBeGreaterThan(2);
    await expect(panel.getByText("Design", { exact: true })).toBeVisible();

    // Apogees are laid out highest-first: the top row out-flies the bottom row.
    const apogeeCells = await panel.locator("tbody tr td:nth-child(3)").allInnerTexts();
    const nums = apogeeCells.map((t) => parseFloat(t.replace(/[^\d.]/g, "")));
    expect(nums.length).toBeGreaterThan(2);
    expect(nums[0]).toBeGreaterThan(nums[nums.length - 1]);

    // A fin-flutter margin column is present: the faster (top-apogee) motor has a thinner margin
    // than the slower (bottom) one — the motor-selection flutter cue.
    await expect(panel.getByRole("columnheader", { name: "Flutter" })).toBeVisible();
    const flutterCells = await panel.locator("tbody tr td:nth-child(8)").allInnerTexts();
    const fl = flutterCells.map((t) => parseFloat(t.replace(/[^\d.]/g, "")));
    expect(fl[0]).toBeLessThan(fl[fl.length - 1]);

    // An optimum-delay column is present too — each motor's burnout-to-apogee delay (the last
    // column), so a flyer sees which delay to buy for each candidate. Every flying motor has one.
    await expect(panel.getByRole("columnheader", { name: "Delay" })).toBeVisible();
    const delayCells = await panel.locator("tbody tr td:last-child").allInnerTexts();
    const dl = delayCells.map((t) => parseFloat(t.replace(/[^\d.]/g, "")));
    expect(dl.length).toBeGreaterThan(2);
    expect(dl.every((v) => v > 0)).toBe(true);
  });

  test("an over-stable design gets a weight-free fin-position trim suggestion", async ({ page }) => {
    await page.goto("/");
    // The 38 mm single-deploy sample sits over-stable (~4 cal), so the trim hint offers the one fix
    // nose ballast can't do: move the fins forward.
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    const hint = page.locator("p").filter({ hasText: "Stability trim:" });
    await expect(hint).toBeVisible();
    await expect(hint).toContainText(/over-stable/);
    // It names a concrete distance to move the fins forward (mm) — the actionable part.
    await expect(hint).toContainText(/\d+\s*mm forward/);
  });

  test("mass breakdown lists parts that sum to the dry total", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    // Mass & balance lives in the Design workspace; expand its disclosure.
    await page.getByRole("tab", { name: "Design" }).click();
    const summary = page.locator("summary", { hasText: "Mass & balance" });
    await expect(summary).toBeVisible();
    await summary.click();

    // Several component rows and a dry total appear.
    const table = page.locator("table", { has: page.getByText("Dry total") });
    await expect(table.getByText("Dry total")).toBeVisible();
    await expect(table.getByRole("row").filter({ hasText: /g|kg/ })).not.toHaveCount(0);
    // The heaviest structural part of this sample is the body tube.
    await expect(table.getByText("Body tube", { exact: true })).toBeVisible();
  });

  test("motor sweep exports the comparison as a CSV", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Analyze" }).click();
    const panel = page.getByRole("region", { name: "Motor sweep" });
    await panel.getByRole("button", { name: /Run motor sweep/ }).click();
    await expect(panel.locator("tbody tr").first()).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      panel.getByRole("button", { name: /Download CSV/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/motor-sweep\.csv$/);
    const path = await download.path();
    const csv = readFileSync(path, "utf8");
    // Header names the columns, and the design's own motor is a row.
    expect(csv.split(/\r?\n/)[0]).toContain("Apogee");
    expect(csv).toContain("H128W");
  });

  test("the motor comparison sorts by any column, and the export follows it", async ({ page }) => {
    // "Which motor gets me to my target?" is only the first question this table answers. Which one
    // clears the rail fastest, which leaves the most flutter margin, which needs the shortest delay
    // — each is a real reason to pick a motor, and each was unreachable in a fixed-order table.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Analyze" }).click();
    const panel = page.getByRole("region", { name: "Motor sweep" });
    await panel.getByRole("button", { name: /Run motor sweep/ }).click();
    await expect(panel.locator("tbody tr").first()).toBeVisible();

    const firstMotor = async () => (await panel.locator("tbody tr").first().innerText()).split(/\s|·/)[0];
    // Default is apogee, biggest first.
    const highest = await firstMotor();
    await panel.getByRole("button", { name: /^Apogee/ }).click();
    const lowest = await firstMotor();
    expect(lowest).not.toBe(highest);

    // A different column orders on its own terms, and the header says which way. (Delay tracks
    // apogee — a faster motor coasts longer — so this checks the column itself, not the row order.)
    await panel.getByRole("button", { name: /^Delay/ }).click();
    await expect(panel.locator('th[aria-sort="descending"]')).toHaveCount(1);
    const delays = (await panel.locator("tbody tr td:last-child").allInnerTexts()).map((t) => parseFloat(t));
    expect(delays.length).toBeGreaterThan(3);
    expect(delays).toEqual([...delays].sort((a, b) => b - a));
    const byDelay = await firstMotor();

    // The CSV comes out in the order on screen, not the order it was computed in.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      panel.getByRole("button", { name: /Download CSV/ }).click(),
    ]);
    const csv = readFileSync(await download.path(), "utf8").split(/\r?\n/);
    expect(csv[1]).toContain(byDelay);
  });

  test("the dispersion tolerances are remembered across designs and reloads", async ({ page }) => {
    // These are the flyer's own standing assumptions about their build quality and their field —
    // not a result. Re-entering them for every design and every reload is the kind of forgetting
    // that makes a tool feel like a demo.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Analyze" }).click();
    const panel = page.getByRole("region", { name: /dispersion/i });
    await panel.getByRole("button", { name: /Run dispersion/ }).click();
    const impulse = panel.getByLabel(/Motor impulse/i);
    await expect(impulse).toHaveValue("5");
    await impulse.fill("8");

    await page.reload();
    await expect(page.getByText(/Picked up where you left off/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("tab", { name: "Analyze" }).click();
    await panel.getByRole("button", { name: /Run dispersion/ }).click();
    await expect(panel.getByLabel(/Motor impulse/i)).toHaveValue("8");

    // …and they outlive the design, because they describe the flyer, not the rocket.
    await page.getByRole("button", { name: "Start fresh" }).click();
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await page.getByRole("tab", { name: "Analyze" }).click();
    await panel.getByRole("button", { name: /Run dispersion/ }).click();
    await expect(panel.getByLabel(/Motor impulse/i)).toHaveValue("8");
  });

  test("the sweep's axis and the motor table's sort survive a reload", async ({ page }) => {
    // Someone picking motors on flutter margin, or sweeping body length, is doing that across every
    // design they open — not once. Snapping back to the defaults loses a view they set up.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Analyze" }).click();

    const sweep = page.getByRole("region", { name: /Parameter sweep/i });
    await sweep.getByRole("button", { name: /Run parameter sweep/ }).click();
    await sweep.getByLabel("Sweep variable").selectOption("bodyLength");
    await sweep.getByLabel("Sweep metric").selectOption("staticMarginCal");

    const motors = page.getByRole("region", { name: "Motor sweep" });
    await motors.getByRole("button", { name: /Run motor sweep/ }).click();
    await expect(motors.locator("tbody tr").first()).toBeVisible();
    await motors.getByRole("button", { name: /^Flutter/ }).click();

    await page.reload();
    await expect(page.getByText(/Picked up where you left off/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("tab", { name: "Analyze" }).click();
    await sweep.getByRole("button", { name: /Run parameter sweep/ }).click();
    await expect(sweep.getByLabel("Sweep variable")).toHaveValue("bodyLength");
    await expect(sweep.getByLabel("Sweep metric")).toHaveValue("staticMarginCal");
    await motors.getByRole("button", { name: /Run motor sweep/ }).click();
    await expect(motors.locator("tbody tr").first()).toBeVisible();
    // The flutter column is the one sorted, still descending.
    const flutterHeader = motors.locator("th", { has: page.getByRole("button", { name: /^Flutter/ }) });
    await expect(flutterHeader).toHaveAttribute("aria-sort", "descending");
  });

  test("printing a design gives a flight card, not the whole web page", async ({ page }) => {
    // Printing a design is range paperwork — a card for the RSO, a page for the build notebook.
    // Without print rules it came out as the site: navigation, theme toggle, buttons nobody can
    // press on paper. What must survive is the design, its numbers, and the disclaimer.
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.emulateMedia({ media: "print" });

    // No controls survive except the wordmark, which says which tool produced the sheet.
    const controls = await page.$$eval("button, [role=tablist], [role=group], header a, input", (ns) =>
      ns.filter((n) => n.getBoundingClientRect().height > 0).map((n) => (n.textContent || "").trim().slice(0, 20)),
    );
    expect(controls).toEqual(["Loft"]);

    // The design, its numbers, and the estimate-not-a-verdict line all print.
    await expect(page.getByRole("heading", { name: /Loft Demo 54mm/ })).toBeVisible();
    await expect(page.getByText("Apogee", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/never a go\/no-go verdict/)).toBeVisible();
    await page.emulateMedia({ media: "screen" });
  });

  test("reports a fin-flutter estimate in the stability readout", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    // The stability panel carries a fin-flutter estimate: a speed and a margin.
    const term = page.getByText("Fin flutter (est.)", { exact: true });
    await expect(term).toBeVisible();
    const value = await term.locator("xpath=following-sibling::dd").innerText();
    expect(value).toMatch(/\d/); // e.g. "1074 m/s"
    await expect(page.getByText(/× margin/).first()).toBeVisible();
  });

  test("design geometry inspector lists parsed components with dimensions", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    // The Design workspace leads with the diagram; the parts table is behind a toggle.
    await page.getByRole("tab", { name: "Design" }).click();
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeVisible();
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    const table = page.locator("table", { has: page.getByText("Station") });
    // The parsed nose cone and body tube appear as rows.
    await expect(table.getByText("Nose cone", { exact: true }).first()).toBeVisible();
    await expect(table.getByText("Body tube", { exact: true }).first()).toBeVisible();
    // A diameter is spelled out (the ⌀ marker), proving dimensions render.
    await expect(table.getByText(/⌀/).first()).toBeVisible();
  });

  test("picking a part on the diagram says what it is and finds it in the parts list", async ({ page }) => {
    // Hover alone can't answer "what is this?" — the pointer has to leave the shape before you can
    // read anything, and the only place that said so was behind a closed disclosure.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Design" }).click();

    const section = page.locator("section", { has: page.getByRole("heading", { name: "Design geometry" }) });
    const readout = section.locator('p[aria-live="polite"]');
    await expect(readout).toHaveText(/Point at a part of the airframe/);

    // Click the airframe about a tenth of the way along — the nose or forward body, either way a
    // part. Positioned relative to the element so the click resolves against its live box (the
    // diagram measures itself on mount, so an absolute point read too early goes stale).
    const svg = page.locator('svg[aria-label*="Scale side-view"]');
    const box = (await svg.boundingBox())!;
    await svg.click({ position: { x: box.width * 0.1, y: box.height / 2 } });

    // It names the part and where it sits…
    await expect(readout).toHaveText(/· at .* from the nose/);
    // …and the parts list opens itself at the row for it.
    await expect(section.locator("table")).toBeVisible();
    await expect(section.locator('tr[aria-selected="true"]')).toHaveCount(1);
  });

  test("the diagram zooms, and the airframe grows with it", async ({ page }) => {
    // Fit-to-width is the only way to see a 29:1 airframe whole and the worst way to see any of it.
    // Zooming has to actually magnify the drawing — not restretch the same picture — so this asserts
    // the rendered SVG gets wider than its column while the column itself does not.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Design" }).click();

    const svg = page.locator('svg[aria-label*="Scale side-view"]');
    const fit = (await svg.boundingBox())!;
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    const zoomed = (await svg.boundingBox())!;
    expect(zoomed.width).toBeGreaterThan(fit.width * 1.5);
    expect(zoomed.height).toBeGreaterThan(fit.height * 1.5);
    // The page must not grow with it — the drawing scrolls inside its own container.
    const [scrollW, innerW] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scrollW).toBeLessThanOrEqual(innerW);

    await page.getByRole("button", { name: "Zoom out" }).click();
    await page.getByRole("button", { name: "Zoom out" }).click();
    expect((await svg.boundingBox())!.width).toBeCloseTo(fit.width, 0);
  });

  test("dragging the fins forward on the diagram re-flies the design less stable", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const staticMargin = async () => {
      const txt = await page
        .getByText("Static margin", { exact: true })
        .locator("xpath=following-sibling::dd")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await staticMargin();
    expect(before).toBeGreaterThan(0);

    // The Design workspace's diagram carries a drag handle sitting on the fins — direct manipulation.
    // Grab it and slide it toward the nose (screen-left): fins forward pulls the centre of pressure
    // forward, so the design flies less stable and the margin (shown above, on every tab) drops.
    await page.getByRole("tab", { name: "Design" }).click();
    const handle = page.getByRole("slider", { name: /Fin position/ });
    await expect(handle).toBeVisible();
    await handle.scrollIntoViewIfNeeded(); // raw page.mouse uses viewport coords — bring it on-screen
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 70, cy, { steps: 12 });
    await page.mouse.up();

    // Re-fly settles to a lower static margin, and the panel flags the active edit.
    await expect.poll(staticMargin).toBeLessThan(before);
    await expect(page.getByText("with your edits").first()).toBeVisible();
  });

  test("the fin handle is a keyboard slider — arrow keys re-fly the design", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const staticMargin = async () => {
      const txt = await page
        .getByText("Static margin", { exact: true })
        .locator("xpath=following-sibling::dd")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await staticMargin();
    expect(before).toBeGreaterThan(0);

    // The handle is a real slider: focus it and report its station as a value. This design's fins
    // already sit at the aft limit, so Arrow-Left nudges them forward (the accessible counterpart of
    // dragging), pulling the centre of pressure forward — the static margin drops, no mouse needed.
    await page.getByRole("tab", { name: "Design" }).click();
    const handle = page.getByRole("slider", { name: /Fin position/ });
    const startMm = parseFloat((await handle.getAttribute("aria-valuenow")) ?? "0");
    expect(startMm).toBeGreaterThan(0);
    await handle.focus();
    for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowLeft");

    await expect.poll(async () => parseFloat((await handle.getAttribute("aria-valuenow")) ?? "0")).toBeLessThan(
      startMm,
    );
    await expect.poll(staticMargin).toBeLessThan(before);
  });

  test("raking the fin tip aft on the diagram re-flies the design stiffer", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const staticMargin = async () => {
      const txt = await page
        .getByText("Static margin", { exact: true })
        .locator("xpath=following-sibling::dd")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await staticMargin();
    expect(before).toBeGreaterThan(0);

    // A second handle sits on the fin tip: dragging it aft (screen-right) rakes the leading edge
    // back, carrying the fins' lift aft — the centre of pressure moves aft and the design flies
    // stiffer, all without adding fin area. The slider reports the rake in mm as it moves.
    await page.getByRole("tab", { name: "Design" }).click();
    const sweep = page.getByRole("slider", { name: "Fin sweep" });
    await expect(sweep).toBeVisible();
    const startMm = parseFloat((await sweep.getAttribute("aria-valuenow")) ?? "0");
    await sweep.scrollIntoViewIfNeeded();
    const box = await sweep.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 40, box!.y + box!.height / 2, { steps: 10 });
    await page.mouse.up();

    await expect.poll(async () => parseFloat((await sweep.getAttribute("aria-valuenow")) ?? "0")).toBeGreaterThan(
      startMm,
    );
    await expect.poll(staticMargin).toBeGreaterThan(before);
    await expect(page.getByText("with your edits").first()).toBeVisible();
  });

  test("a focused fin handle shows its live value on the diagram", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    // The diagram, and its handles, live in the Design workspace.
    await page.getByRole("tab", { name: "Design" }).click();
    // The mm readout is a diagram-layer <text> shown only while a handle is in use; the CG/CP marks
    // are the only other SVG text, and they aren't "### mm", so this locator is just the readout.
    const readout = page.locator("svg text").filter({ hasText: /^\d+ mm$/ });
    await expect(readout).toHaveCount(0); // hidden at rest

    const handle = page.getByRole("slider", { name: "Fin position" });
    await handle.focus();
    await expect(readout).toHaveCount(1);
    await expect(readout).toBeVisible();

    // Nudging the focused handle updates the shown value in step with the edit.
    const shown = async () => parseInt(((await readout.textContent()) ?? "").replace(/[^\d]/g, ""), 10);
    const first = await shown();
    expect(first).toBeGreaterThan(0);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(shown).toBeLessThan(first);

    // Blurring puts it away again.
    await handle.blur();
    await expect(readout).toHaveCount(0);
  });

  test("resizing the fin root chord on the diagram re-flies the design", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    // The above-tabs summary apogee re-flies live, so the edit's effect shows without leaving Design.
    const summaryApogee = async () => {
      const dd = page.getByText("Apogee", { exact: true }).first().locator("xpath=following-sibling::dd");
      return parseFloat((await dd.innerText()).replace(/[^\d.]/g, ""));
    };
    const before = await summaryApogee();
    expect(before).toBeGreaterThan(0);

    // A third handle sits on the fin's root trailing-edge corner: dragging it forward (screen-left)
    // shortens the root chord, shedding fin planform — less drag, so the rocket flies higher. The
    // slider reports the root chord in mm as it moves. (This demo's fin root already reaches the tail,
    // so forward is the available direction — the accessible drag counterpart of shrinking the fin.)
    await page.getByRole("tab", { name: "Design" }).click();
    const root = page.getByRole("slider", { name: "Fin root chord" });
    await expect(root).toBeVisible();
    const startMm = parseFloat((await root.getAttribute("aria-valuenow")) ?? "0");
    expect(startMm).toBeGreaterThan(0);
    await root.scrollIntoViewIfNeeded();
    const box = await root.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 - 40, box!.y + box!.height / 2, { steps: 10 });
    await page.mouse.up();

    await expect.poll(async () => parseFloat((await root.getAttribute("aria-valuenow")) ?? "0")).toBeLessThan(
      startMm,
    );
    await expect.poll(summaryApogee).toBeGreaterThan(before);
    await expect(page.getByText("with your edits").first()).toBeVisible();
  });

  test("resizing the fin tip chord on the diagram re-flies the design", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const summaryApogee = async () => {
      const dd = page.getByText("Apogee", { exact: true }).first().locator("xpath=following-sibling::dd");
      return parseFloat((await dd.innerText()).replace(/[^\d.]/g, ""));
    };
    const before = await summaryApogee();
    expect(before).toBeGreaterThan(0);

    // The fourth fin handle sits on the tip's trailing-edge corner: dragging it forward (screen-left)
    // shortens the tip chord toward a delta, shedding planform — less drag, so the rocket flies
    // higher. The slider reports the tip chord in mm as it moves.
    await page.getByRole("tab", { name: "Design" }).click();
    const tip = page.getByRole("slider", { name: "Fin tip chord" });
    await expect(tip).toBeVisible();
    const startMm = parseFloat((await tip.getAttribute("aria-valuenow")) ?? "0");
    expect(startMm).toBeGreaterThan(0);
    await tip.scrollIntoViewIfNeeded();
    const box = await tip.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 - 40, box!.y + box!.height / 2, { steps: 10 });
    await page.mouse.up();

    await expect.poll(async () => parseFloat((await tip.getAttribute("aria-valuenow")) ?? "0")).toBeLessThan(
      startMm,
    );
    await expect.poll(summaryApogee).toBeGreaterThan(before);
    await expect(page.getByText("with your edits").first()).toBeVisible();
  });

  test("dragging the fin span up on the diagram re-flies the design stiffer", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const staticMargin = async () => {
      const txt = await page
        .getByText("Static margin", { exact: true })
        .locator("xpath=following-sibling::dd")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await staticMargin();
    expect(before).toBeGreaterThan(0);

    // The fin span is the one handle that drags VERTICALLY: it sits above the tip and pulling it up
    // grows the semi-span. Bigger fins carry more lift aft — the centre of pressure moves back and the
    // design flies stiffer. The reserved headroom and drag-frozen frame keep the tip under the pointer.
    await page.getByRole("tab", { name: "Design" }).click();
    const span = page.getByRole("slider", { name: "Fin span" });
    await expect(span).toBeVisible();
    const startMm = parseFloat((await span.getAttribute("aria-valuenow")) ?? "0");
    expect(startMm).toBeGreaterThan(0);
    await span.scrollIntoViewIfNeeded();
    const box = await span.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 - 30, { steps: 12 });
    await page.mouse.up();

    await expect.poll(async () => parseFloat((await span.getAttribute("aria-valuenow")) ?? "0")).toBeGreaterThan(
      startMm,
    );
    await expect.poll(staticMargin).toBeGreaterThan(before);
    // The keyboard slider works too: it's a vertical orientation, and arrow-down shrinks the span.
    await span.focus();
    const afterDrag = parseFloat((await span.getAttribute("aria-valuenow")) ?? "0");
    await page.keyboard.press("ArrowDown");
    await expect.poll(async () => parseFloat((await span.getAttribute("aria-valuenow")) ?? "0")).toBeLessThan(afterDrag);
  });

  test("leaving a design is undoable, and the undo brings the what-ifs with it", async ({ page }) => {
    // "Import another" is a text-link-styled button 12 px from the design-name input, and one click on
    // it discarded the loaded design, every what-if on it and the session, with no confirmation and no
    // way back. Measured on this sample: a 75 mm fin span and 20 g of nose ballast move apogee
    // 993 m -> 881 m, and that click took all of it.
    //
    // The fix is deliberately NOT the recents shelf, which was tried and reverted: hanging per-design
    // state on a name-and-size-keyed list with an eviction rule made the entry holding the work the
    // first one evicted. This is one slot holding the session that was just discarded, so restoring it
    // is the same operation as resuming one.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const apogee = async () => {
      await page.getByRole("tab", { name: "Flight" }).click();
      const v = page
        .locator("#panel-flight")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div[1]");
      return parseFloat((await v.first().textContent())!.replace(/[^\d.]/g, ""));
    };
    const field = (re: RegExp) => page.locator("input").and(page.getByLabel(re)).first();

    const asDesigned = await apogee();
    await page.getByRole("tab", { name: "Design" }).click();
    await field(/Fin span/).fill("75");
    await field(/Nose ballast/).fill("20");
    const edited = await apogee();
    expect(edited, "the what-ifs actually move the flight").toBeLessThan(asDesigned - 50);

    await page.getByRole("button", { name: /Import another/ }).click();

    // The offer names the design and what it is holding, rather than making the flyer press it to
    // find out — and it counts by the app's own definition of edited, not by keys in a bag.
    await expect(page.getByText(/You were working on/)).toBeVisible();
    await expect(page.getByText(/with 2 what-ifs set/)).toBeVisible();

    // It survives a reload of the import screen. That is the pad case: the phone reclaimed the tab and
    // the design file may not even be on the device.
    await page.reload();
    await expect(page.getByText(/You were working on/)).toBeVisible();

    await page.getByRole("button", { name: "Pick it back up" }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    expect(await apogee(), "the undo restores the flight that was thrown away").toBeCloseTo(edited, 0);
    await page.getByRole("tab", { name: "Design" }).click();
    await expect(field(/Fin span/)).toHaveValue("75");
    await expect(field(/Nose ballast/)).toHaveValue("20");

    // Consumed — checked in STORAGE, not on screen. The import panel only renders when no design is
    // loaded, so asserting the offer is absent right after restoring one is vacuous: it could not be
    // visible whatever the slot holds.
    expect(
      await page.evaluate(() => localStorage.getItem("loft.session.discarded")),
      "restoring consumes the slot rather than leaving a stale offer",
    ).toBeNull();
  });

  test("a design carrying nothing does not evict the one that was carrying work", async ({ page }) => {
    // The natural recovery move after a mis-click is to open something else to get oriented. If
    // leaving THAT overwrote the slot, the move that looks like recovery would be what destroys the
    // work — so a session with no what-ifs and the design's own motor configuration never displaces
    // one that has them. The design itself is on the recents shelf either way; the trims are not.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Design" }).click();
    await page.locator("input").and(page.getByLabel(/Fin span/)).first().fill("75");
    await page.getByRole("button", { name: /Import another/ }).click();
    await expect(page.getByText(/with 1 what-if set/)).toBeVisible();

    // Open a different design, change nothing, and leave it again.
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Import another/ }).click();

    // The offer still holds the edited design, not the untouched one.
    await expect(page.getByText(/with 1 what-if set/)).toBeVisible();
    await page.getByRole("button", { name: "Pick it back up" }).click();
    await page.getByRole("tab", { name: "Design" }).click();
    await expect(page.locator("input").and(page.getByLabel(/Fin span/)).first()).toHaveValue("75");
  });

  test("offers a renamed design back under the name the flyer gave it", async ({ page }) => {
    // The offer used to render the FILE name, so a from-scratch build came back as "New design"
    // however it had been renamed — on the one control whose whole job is to say what it is holding.
    await page.goto("/");
    await page.getByRole("button", { name: /Start a new design/ }).click();
    // A built design opens on the Design workspace, not on a "Design" heading.
    await expect(page.getByRole("tab", { name: "Design" })).toHaveAttribute("aria-selected", "true");
    await page.getByLabel("Design name").fill("Osprey II");
    await page.locator("input").and(page.getByLabel(/Fin span/)).first().fill("90");
    await page.getByRole("button", { name: /Import another/ }).click();
    await expect(page.getByText(/You were working on/)).toContainText("Osprey II");
  });

  test("an as-designed rocket is not reported as carrying what-ifs", async ({ page }) => {
    // The count has to be the app's own notion of edited. A previous attempt at this feature counted
    // the keys in the edit bag, which badges a rocket that was only looked at: the bag is a patch
    // spread over the previous bag, so a cleared field leaves its key behind.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Design" }).click();

    // Set a what-if and clear it again — as-designed, by the app's own gate.
    const span = page.locator("input").and(page.getByLabel(/Fin span/)).first();
    await span.fill("75");
    await span.fill("");
    await expect(page.getByRole("button", { name: /Reset to as-designed/ })).toHaveCount(0);

    await page.getByRole("button", { name: /Import another/ }).click();
    // Scoped to the offer itself: the shelf's own caption further down the same screen mentions
    // what-if edits too, and matching that would make this pass for the wrong reason.
    const offer = page.getByText(/You were working on/);
    await expect(offer).toBeVisible();
    await expect(offer).not.toContainText("what-if");
  });

  test("the Conditions placeholders advertise the setup that is actually being flown", async ({ page }) => {
    // They were hardcoded literals — "1.2", "0", "0", "0" — under a caption saying blank fields use
    // the design's stored launch conditions, and `Num` treats a placeholder as a claim about what is
    // flown: it prints it verbatim as "flying X" when it refuses an entry. 25 of the 27 corpus .ork
    // files declare a rod length. On one storing 3.048 m, rail-exit reads 26 m/s as flown and 16 m/s
    // if the flyer types the advertised 1.2 — a 1.6x gap on the launch-safety number the app's own
    // ~15 m/s rule of thumb is checked against.
    await page.goto("/");
    // A from-scratch design stores no simulations, so the ENGINE's defaults are what fly: 1 m rail,
    // no wind. That is the number the field must advertise, not a literal that matches neither.
    await page.getByRole("button", { name: /Start a new design/ }).click();
    await expect(page.getByRole("tab", { name: "Design" })).toHaveAttribute("aria-selected", "true");
    const conditions = page.getByText(/^Conditions ·/).first();
    await conditions.click();

    const field = (re: RegExp) => page.locator("input").and(page.getByLabel(re)).first();
    await expect(field(/Rail length/)).toHaveAttribute("placeholder", "1.0");
    await expect(field(/Surface wind/)).toHaveAttribute("placeholder", "0.0");

    // And — the case that actually guards the fix — a design that STORES its own conditions. Without
    // this the test passes with the resolver replaced by defaultConditions(), i.e. with the reported
    // defect fully reintroduced for the 25 of 27 corpus .ork files that declare a rod length.
    await page.getByRole("button", { name: /Import another/ }).click();
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByText(/^Conditions ·/).first().click();
    const storedRail = await field(/Rail length/).getAttribute("placeholder");
    const storedWind = await field(/Surface wind/).getAttribute("placeholder");
    expect(parseFloat(storedRail!), "the design's own rail, not the engine default").toBeGreaterThan(1.05);
    expect(parseFloat(storedWind!), "the design's own wind, not a hardcoded 0").toBeGreaterThan(0);

    // And it converts with the unit toggle, like the label and the max beside it already did —
    // checked against the metric reading of the SAME design rather than a hardcoded figure, so this
    // keeps holding if the sample's stored rail ever changes.
    await page.getByRole("button", { name: "Imperial" }).click();
    await expect(page.getByLabel(/Rail length \(ft\)/).first()).toBeVisible();
    const railImperial = parseFloat((await field(/Rail length/).getAttribute("placeholder"))!);
    expect(railImperial, "the same rail, in feet").toBeCloseTo(parseFloat(storedRail!) * 3.28084, 0);
  });

  test("says a motor could NOT be matched, rather than the opposite", async ({ page }) => {
    // The two branches shared the clause "could be matched", which only reads correctly after
    // "None of …". The singular subject took it verbatim: "This configuration's motor could be
    // matched to a thrust curve in the bundled database, so there is no thrust to fly" — the opposite
    // of what happened, contradicting itself in the same sentence, on the panel whose whole job is to
    // explain why there is no flight.
    // The COMMITTED fixture, not a corpus file: the corpus is gitignored, so a corpus-driven test
    // skips on CI and on any public clone — reporting green without executing an assertion, which is
    // exactly where a reintroduced inverted sentence would go unnoticed.
    await page.goto("/");
    await page.setInputFiles('input[type="file"]', resolve(process.cwd(), "e2e/fixtures/unresolved-motor.ork"));
    const panel = page.getByRole("region", { name: "No flight simulated" });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("could not be matched to a thrust curve");
    await expect(panel, "the inverted sentence is gone").not.toContainText(
      "motor could be matched to a thrust curve",
    );
  });

  test("no value surface is left in metric when Imperial is selected", async ({ page }) => {
    // The class this closes, rather than the four instances of it: a value that never converts at all
    // was invisible to the grep that policed this before, because that grep looked for display->SI
    // conversions and these sites had none. So the check is a census of what is actually on screen.
    //
    // Deliberately scoped to VALUE surfaces — stat tiles, table cells, and the unit suffix beside an
    // input — not to prose, which quotes the ~15 m/s (=50 ft/s) rail-exit rule of thumb in both
    // systems on purpose.
    // The RockSim sample deliberately, NOT the 38 mm one: only a design carrying stored results
    // renders the Validation panel, and that panel holds the "Max acceleration" row which was one of
    // the surfaces this guards. On the bundled .ork samples the panel is absent, so the census would
    // have passed without ever seeing it.
    await page.goto("/");
    await page.getByRole("button", { name: /RockSim · 54 mm sport/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await expect(
      page.getByRole("row", { name: /Max acceleration/ }),
      "the census must actually reach the validation row it guards",
    ).toBeVisible();

    const census = async () =>
      page.evaluate(() => {
        const metric = /(^|\s|\d)(mm|cm|km|m\/s²|m\/s|m|kg|kPa|Pa)$/;
        const bad: string[] = [];
        let checked = 0;
        const visible = (n: Element) => {
          const panel = n.closest("div[role='tabpanel']");
          return !(panel && panel.hasAttribute("hidden"));
        };
        // Stat tiles and input suffixes put the unit in its own trailing <span>; table cells carry
        // "<number> <unit>" together.
        for (const n of document.querySelectorAll("span, td")) {
          if (!visible(n) || n.children.length > 0) continue;
          const t = (n.textContent || "").trim();
          if (!t || t.length > 24) continue;
          checked++;
          if (metric.test(t)) bad.push(t);
        }
        return { checked, bad };
      });

    for (const tab of ["Flight", "Design", "Analyze"]) {
      await page.getByRole("button", { name: "Imperial" }).click();
      await page.getByRole("tab", { name: tab }).click();
      if (tab === "Analyze")
        for (const label of [/Run motor sweep/, /Run parameter sweep|Run sweep/, /Run dispersion/]) {
          const b = page.getByRole("button", { name: label }).first();
          if ((await b.count()) > 0) {
            await b.click();
            // Wait for the run to actually land. Censusing straight after the click measured only the
            // dispersion inputs, so the assertion below was vacuous for every sweep table.
            await expect(page.getByRole("button", { name: label })).toHaveCount(0);
          }
        }
      await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
      const imperial = await census();
      expect(imperial.checked, `${tab}: the census must actually see something`).toBeGreaterThan(10);
      expect(imperial.bad, `${tab}: metric units still on screen under Imperial`).toEqual([]);

      // The control the census needs to be worth anything: the same surfaces in Metric DO carry
      // metric units, so an empty list above cannot be a broken selector.
      await page.getByRole("button", { name: "Metric" }).click();
      const metric = await census();
      expect(metric.bad.length, `${tab}: control — metric units present under Metric`).toBeGreaterThan(0);
    }
  });

  test("every diagram handle reports in the flyer's own units, not always millimetres", async ({ page }) => {
    // Direct manipulation is the one surface where the number IS the feedback: while a handle is
    // being dragged there is nothing else to read. All seven used to report millimetres in both unit
    // systems — byte-identical strings — while the caption on the same figure said inches and the
    // typed field 40 px below said inches, so an imperial flyer trimming a fin got a metric number on
    // the picture and an imperial one in the box for the same dimension.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Design" }).click();

    const handles = page.locator('g[role="slider"]');
    const metric = await handles.evaluateAll((ns) => ns.map((n) => n.getAttribute("aria-valuetext") ?? ""));
    expect(metric.length, "the sample offers its fin, nose and body handles").toBeGreaterThanOrEqual(7);
    expect(metric.every((t) => /\bmm\b/.test(t)), "metric reports millimetres").toBe(true);

    await page.getByRole("button", { name: "Imperial" }).click();
    const imperial = await handles.evaluateAll((ns) => ns.map((n) => n.getAttribute("aria-valuetext") ?? ""));
    expect(imperial.filter((t) => /\bmm\b/.test(t)), "no handle still says mm in imperial").toEqual([]);
    expect(imperial.every((t) => /\bin\b/.test(t)), "every handle reports inches").toBe(true);
    expect(
      imperial.filter((t, i) => t === metric[i]),
      "no handle's readout is unchanged by the unit toggle",
    ).toEqual([]);

    // The numeric trio agrees with the text it sits beside, rather than staying on the mm scale.
    const span = page.getByRole("slider", { name: "Fin span" });
    const now = parseFloat((await span.getAttribute("aria-valuenow")) ?? "0");
    const shown = parseFloat(((await span.getAttribute("aria-valuetext")) ?? "").replace(/[^\d.]/g, ""));
    expect(now).toBeCloseTo(shown, 1);
    expect(now, "an inch figure, not a millimetre one, for a 60 mm semi-span").toBeLessThan(10);

    // And the label drawn on the airframe while the handle is driven says the same thing the field
    // below it does — this is the pair that used to read "61 mm" against "2.39".
    await span.focus();
    await page.keyboard.press("ArrowUp");
    // textContent, not innerText: an SVG <text> is not an HTMLElement and innerText throws on it.
    const onCanvas = page.locator("svg text").filter({ hasText: /\bin$/ });
    await expect(onCanvas.first()).toBeVisible();
    const canvasIn = parseFloat(((await onCanvas.first().textContent()) ?? "").replace(/[^\d.]/g, ""));
    const field = page.locator("input").and(page.getByLabel(/Fin span/)).first();
    expect(canvasIn, "the picture and the field agree on the dimension").toBeCloseTo(
      parseFloat((await field.inputValue()) || (await field.getAttribute("placeholder")) || "0"),
      1,
    );
  });

  test("dragging the body wall out on the diagram widens the caliber and re-flies less stable", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const staticMargin = async () => {
      const txt = await page
        .getByText("Static margin", { exact: true })
        .locator("xpath=following-sibling::dd")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await staticMargin();
    expect(before).toBeGreaterThan(0);

    // The body-diameter handle sits on the airframe wall and drags VERTICALLY, like the span. Pulling
    // it up scales the whole outer airframe to a wider caliber: the fins keep their size but grow
    // relatively smaller against the bigger reference diameter, so the centre of pressure moves forward
    // and — with more calibers in the denominator — the static margin drops. The reserved headroom and
    // drag-frozen frame keep the wall under the pointer.
    await page.getByRole("tab", { name: "Design" }).click();
    const dia = page.getByRole("slider", { name: "Body diameter" });
    await expect(dia).toBeVisible();
    const startMm = parseFloat((await dia.getAttribute("aria-valuenow")) ?? "0");
    expect(startMm).toBeGreaterThan(0);
    await dia.scrollIntoViewIfNeeded();
    const box = await dia.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 - 30, { steps: 12 });
    await page.mouse.up();

    await expect.poll(async () => parseFloat((await dia.getAttribute("aria-valuenow")) ?? "0")).toBeGreaterThan(
      startMm,
    );
    await expect.poll(staticMargin).toBeLessThan(before);
    // The keyboard slider works too: vertical orientation, and arrow-down narrows the caliber back.
    await dia.focus();
    const afterDrag = parseFloat((await dia.getAttribute("aria-valuenow")) ?? "0");
    await page.keyboard.press("ArrowDown");
    await expect.poll(async () => parseFloat((await dia.getAttribute("aria-valuenow")) ?? "0")).toBeLessThan(afterDrag);
  });

  test("results split into Flight / Design / Analyze workspaces", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const flightTab = page.getByRole("tab", { name: "Flight" });
    const designTab = page.getByRole("tab", { name: "Design" });
    const analyzeTab = page.getByRole("tab", { name: "Analyze" });
    await expect(flightTab).toHaveAttribute("aria-selected", "true");

    // Flight leads with the plots; the design diagram is not stacked on this view.
    await expect(page.getByRole("heading", { name: "Flight path" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeHidden();

    // Design shows the airframe; the flight plots are put away.
    await designTab.click();
    await expect(designTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Flight path" })).toBeHidden();

    // Analyze holds the heavy tools; run a sweep there.
    await analyzeTab.click();
    const sweep = page.getByRole("region", { name: "Parameter sweep" });
    await expect(sweep).toBeVisible();
    await sweep.getByRole("button", { name: /Run parameter sweep/ }).click();
    await expect(sweep.getByRole("img", { name: /Apogee.*versus/i })).toBeVisible();

    // Switching away and back keeps the run — the panels stay mounted, not rebuilt from scratch.
    await flightTab.click();
    await expect(sweep).toBeHidden();
    await analyzeTab.click();
    await expect(sweep.getByRole("img", { name: /Apogee.*versus/i })).toBeVisible();

    // The tablist is keyboard-navigable: arrow keys move the selection (and wrap).
    await analyzeTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(flightTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Flight path" })).toBeVisible();
  });

  test("parameter sweep plots a response curve and switches metric", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Analyze" }).click();
    const panel = page.getByRole("region", { name: "Parameter sweep" });
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: /Run parameter sweep/ }).click();

    // A response curve appears — default is apogee vs fin span.
    await expect(panel.getByRole("img", { name: /Apogee.*versus.*Fin span/i })).toBeVisible();

    // Switching the Y-axis metric re-labels the same chart without re-running.
    await panel.getByLabel("Sweep metric").selectOption("staticMarginCal");
    await expect(panel.getByRole("img", { name: /Static margin.*versus.*Fin span/i })).toBeVisible();

    // Switching the variable sweeps a different dimension.
    await panel.getByLabel("Sweep variable").selectOption("bodyLength");
    await expect(panel.getByRole("img", { name: /Static margin.*versus.*Body length/i })).toBeVisible();

    // Nose ballast is a sweep axis too — the classic stability-trim curve.
    await panel.getByLabel("Sweep variable").selectOption("ballastKg");
    await expect(panel.getByRole("img", { name: /Static margin.*versus.*Nose ballast/i })).toBeVisible();

    // Fin position is a sweep axis: sliding the fins aft against the static margin traces the
    // stability lever's response curve — the CP-location counterpart to the ballast (CG) trim.
    await panel.getByLabel("Sweep variable").selectOption("finStation");
    await expect(panel.getByRole("img", { name: /Static margin.*versus.*Fin position/i })).toBeVisible();

    // Fin thickness is a sweep axis and fin-flutter margin a metric — the flutter design tool:
    // sweep thickness and read where the margin clears the safe line.
    await panel.getByLabel("Sweep variable").selectOption("finThickness");
    await panel.getByLabel("Sweep metric").selectOption("flutterMargin");
    await expect(panel.getByRole("img", { name: /Fin flutter margin.*versus.*Fin thickness/i })).toBeVisible();

    // Fin root chord is a sweep axis too — the fin-area lever you can also shape on the diagram,
    // here traced against apogee (the classic "how big should my fins be?" curve).
    await panel.getByLabel("Sweep variable").selectOption("finRootChord");
    await panel.getByLabel("Sweep metric").selectOption("apogee");
    await expect(panel.getByRole("img", { name: /Apogee.*versus.*Fin root chord/i })).toBeVisible();
  });

  test("Monte-Carlo dispersion flies the design and reports the spread", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Analyze" }).click();
    const panel = page.getByRole("region", { name: "Monte-Carlo dispersion" });
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: /Run dispersion/ }).click();

    // The distribution appears: a percentile card, an apogee histogram, and a landing scatter.
    await expect(panel.getByText("Recovery radius (95%)")).toBeVisible({ timeout: 15000 });
    await expect(panel.getByRole("img", { name: /Apogee distribution histogram/i })).toBeVisible();
    await expect(panel.getByRole("img", { name: /Landing scatter/i })).toBeVisible();

    // The landing-energy band (the field/waiver recovery-adequacy figure) reports a median and a
    // worst-case in energy units.
    const energy = panel.locator("p").filter({ hasText: "Landing energy:" });
    await expect(energy).toBeVisible();
    await expect(energy).toContainText(/worst-case/);
    await expect(energy).toContainText(/\d+\s*J/);

    // Widening the wind spread re-runs and grows the recovery radius.
    const radius = async () => {
      const txt = await panel.getByText("Recovery radius (95%)").locator("xpath=following-sibling::div[1]").innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await radius();
    expect(before).toBeGreaterThan(0);
    const wind = panel.getByLabel(/Wind speed/);
    await wind.fill("10");
    await expect(panel.getByRole("img", { name: /Apogee distribution histogram/i })).toBeVisible({ timeout: 15000 });
    await expect.poll(radius, { timeout: 15000 }).toBeGreaterThan(before);

    // A waiver ceiling well below the design's apogee reports (nearly) every flight over it — a
    // post-hoc check that doesn't re-fly.
    await panel.getByLabel(/Waiver ceiling/).fill("100");
    await expect(panel.getByText("Chance over ceiling")).toBeVisible();
    await expect(panel.getByText("100%", { exact: true })).toBeVisible();
  });

  test("resizing the fins rebuilds the design and changes the stability margin", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const staticMargin = async () => {
      const txt = await page
        .getByText("Static margin", { exact: true })
        .locator("xpath=following-sibling::dd")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await staticMargin();
    expect(before).toBeGreaterThan(0);

    // Enlarge the fins on the Design workspace — a builder geometry edit. The field starts from the
    // design's own span (its placeholder), so read that and grow it. (Static margin sits above the
    // workspace tabs, so it stays readable without leaving Design.)
    await page.getByRole("tab", { name: "Design" }).click();
    // The number field, specifically — the diagram now also carries a vertical "Fin span" drag handle.
    const finSpan = page.getByRole("spinbutton", { name: /Fin span/ });
    await expect(finSpan).toBeVisible();
    const designSpan = parseFloat((await finSpan.getAttribute("placeholder")) ?? "0");
    expect(designSpan).toBeGreaterThan(0);
    await finSpan.fill(String(Math.round(designSpan * 1.6)));

    // Bigger fins move the centre of pressure aft, so the rocket flies more stable.
    await expect.poll(staticMargin).toBeGreaterThan(before);
  });

  test("reshaping the fin root chord rebuilds the design and changes the apogee", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // Widen the fin root chord — more planform, more drag — on the Design workspace. The field starts
    // from the design's root; flip back to Flight to read the new apogee.
    await page.getByRole("tab", { name: "Design" }).click();
    // The number field, specifically — the diagram now also carries a "Fin root chord" drag handle.
    const finRoot = page.getByRole("spinbutton", { name: /Fin root/ });
    await expect(finRoot).toBeVisible();
    const designRoot = parseFloat((await finRoot.getAttribute("placeholder")) ?? "0");
    expect(designRoot).toBeGreaterThan(0);
    await finRoot.fill(String(Math.round(designRoot * 1.6)));
    await page.getByRole("tab", { name: "Flight" }).click();

    // A bigger fin planform drags more, so the rocket doesn't reach as high.
    await expect.poll(apogee).toBeLessThan(before);
  });

  test("thickening the fins rebuilds the design and lowers the apogee", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // Thicken the fins — more frontal area and form-factor drag. The field starts from the design's
    // own thickness (a decimal millimetre value).
    await page.getByRole("tab", { name: "Design" }).click();
    const finThickness = page.getByLabel(/Fin thickness/);
    await expect(finThickness).toBeVisible();
    const designThickness = parseFloat((await finThickness.getAttribute("placeholder")) ?? "0");
    expect(designThickness).toBeGreaterThan(0);
    await finThickness.fill((designThickness * 2).toFixed(1));
    await page.getByRole("tab", { name: "Flight" }).click();

    // Thicker fins drag more, so the rocket doesn't climb as high.
    await expect.poll(apogee).toBeLessThan(before);
  });

  test("adding a boattail cuts base drag and raises the apogee (structural add)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    // A build opens on Design; this test reads flight metrics, so switch to the Flight workspace.
    await page.getByRole("tab", { name: "Flight" }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // Add a boattail on the Design workspace: a length and an exit narrower than the 54 mm body.
    // Both are needed to build one. Flip back to Flight to read the new apogee.
    await page.getByRole("tab", { name: "Design" }).click();
    await page.getByLabel(/Boattail length/).fill("60");
    await page.getByLabel(/Boattail exit/).fill("30");
    await page.getByRole("tab", { name: "Flight" }).click();

    // Contracting the base removes most of the base drag, so the same motor flies higher.
    await expect.poll(apogee).toBeGreaterThan(before);
  });

  test("switching to dual-deploy cuts the wind drift (builder recovery)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    // A build opens on Design; this test reads flight metrics, so switch to the Flight workspace.
    await page.getByRole("tab", { name: "Flight" }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    // Wind is a launch condition — it stays in the Conditions panel (above the workspace tabs).
    await page.locator("summary", { hasText: "Conditions" }).click();

    // A steady crosswind so the drift is large and observable under the single apogee chute.
    await page.getByLabel(/Surface wind/).fill("6");
    const drift = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Drift from pad", { exact: true })
        .locator("xpath=following-sibling::div")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    await expect.poll(drift).toBeGreaterThan(0);
    const single = await drift();

    // Switch to dual-deploy — a design edit, on the Design workspace: the main opens at 150 m over a
    // 300 mm drogue. Both fields are needed. Flip back to Flight to read the drift.
    await page.getByRole("tab", { name: "Design" }).click();
    await page.getByLabel(/Main deploy alt/).fill("150");
    await page.getByLabel(/Drogue/).fill("300");
    await page.getByRole("tab", { name: "Flight" }).click();

    // Falling fast under the drogue until 150 m spends far less time in the wind, so it lands closer.
    await expect.poll(drift).toBeLessThan(single * 0.7);
  });

  test("sweeping the fins back rebuilds the design and raises the stability margin", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const staticMargin = async () => {
      const txt = await page
        .getByText("Static margin", { exact: true })
        .locator("xpath=following-sibling::dd")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await staticMargin();
    expect(before).toBeGreaterThan(0);

    // Sweep the fin leading edge further aft on the Design workspace — the field starts from the
    // design's own sweep. (Static margin sits above the tabs, readable without leaving Design.)
    await page.getByRole("tab", { name: "Design" }).click();
    const finSweep = page.getByRole("spinbutton", { name: /Fin sweep/ });
    await expect(finSweep).toBeVisible();
    const designSweep = parseFloat((await finSweep.getAttribute("placeholder")) ?? "0");
    expect(designSweep).toBeGreaterThan(0);
    await finSweep.fill(String(Math.round(designSweep * 1.8)));

    // A more swept fin carries its CP aft, moving the rocket's CP aft, so it flies more stable.
    await expect.poll(staticMargin).toBeGreaterThan(before);
  });

  test("a rougher surface finish drags more and lowers the apogee", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // Set the whole airframe to a rough finish — more skin friction, so it doesn't climb as high.
    await page.getByRole("tab", { name: "Design" }).click();
    await page.getByLabel("Surface finish").selectOption("rough");
    await page.getByRole("tab", { name: "Flight" }).click();
    await expect.poll(apogee).toBeLessThan(before);
  });

  test("changing the nose shape rebuilds the design and changes the apogee", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // Swap the ogive nose for a blunt ellipsoid — more wetted area and nose pressure, so it flies
    // a touch lower.
    await page.getByRole("tab", { name: "Design" }).click();
    await page.getByLabel("Nose shape").selectOption("ellipsoid");
    await page.getByRole("tab", { name: "Flight" }).click();
    await expect.poll(apogee).toBeLessThan(before);
  });

  test("switching the airframe to a heavier material lowers the apogee (builder)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    // A build opens on Design; this test reads flight metrics, so switch to the Flight workspace.
    await page.getByRole("tab", { name: "Flight" }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // The starter is fibreglass; aluminium is far denser, so the airframe gets heavier and it flies
    // lower on the same motor.
    await page.getByRole("tab", { name: "Design" }).click();
    await page.getByLabel("Airframe material").selectOption("aluminium");
    await page.getByRole("tab", { name: "Flight" }).click();
    await expect.poll(apogee).toBeLessThan(before);
  });

  test("airfoiling the fin edges rebuilds the design and raises the apogee", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // The demo's fins default to square edges; streamlining them to an airfoil cuts the fin-edge
    // pressure drag, so it coasts higher.
    await page.getByRole("tab", { name: "Design" }).click();
    await page.getByLabel("Fin edge cross-section").selectOption("airfoil");
    await page.getByRole("tab", { name: "Flight" }).click();
    await expect.poll(apogee).toBeGreaterThan(before);
  });

  test("swapping the fin material to a heavier stock rebuilds and lowers the apogee", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // Aluminium fins are far denser than the demo's stock, so the rocket flies heavier and lower —
    // and the fin-flutter margin (which reads the material's stiffness) jumps.
    await page.getByRole("tab", { name: "Design" }).click();
    await page.getByLabel("Fin material").selectOption("aluminium");
    await page.getByRole("tab", { name: "Flight" }).click();
    await expect.poll(apogee).toBeLessThan(before);
  });

  test("adding fins rebuilds the design and raises the stability margin", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const staticMargin = async () => {
      const txt = await page
        .getByText("Static margin", { exact: true })
        .locator("xpath=following-sibling::dd")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await staticMargin();
    expect(before).toBeGreaterThan(0);

    // Add fins on the Design workspace — a builder geometry edit. The field starts from the design's
    // own fin count (its placeholder), so read that and add two. (Static margin sits above the tabs.)
    await page.getByRole("tab", { name: "Design" }).click();
    const finCount = page.getByLabel("Fin count", { exact: true });
    await expect(finCount).toBeVisible();
    const designCount = parseInt((await finCount.getAttribute("placeholder")) ?? "0", 10);
    expect(designCount).toBeGreaterThanOrEqual(3);
    await finCount.fill(String(designCount + 2));

    // More fins add normal-force surface aft, moving the CP aft, so the rocket flies more stable.
    await expect.poll(staticMargin).toBeGreaterThan(before);
  });

  test("lengthening the body tube re-flies a heavier, lower-flying rocket", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // Stretch the main body tube on the Design workspace — a builder geometry edit. The field starts
    // from the design's span; flip back to Flight to read the new apogee.
    await page.getByRole("tab", { name: "Design" }).click();
    const bodyLength = page.getByLabel(/Body length/);
    await expect(bodyLength).toBeVisible();
    const designBody = parseFloat((await bodyLength.getAttribute("placeholder")) ?? "0");
    expect(designBody).toBeGreaterThan(0);
    await bodyLength.fill(String(Math.round(designBody * 1.5)));
    await page.getByRole("tab", { name: "Flight" }).click();

    // A longer tube is heavier and has more drag, so it doesn't reach as high.
    await expect.poll(apogee).toBeLessThan(before);
  });

  test("widening the airframe diameter re-flies a draggier, lower-flying rocket", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // Widen the whole airframe on the Design workspace — a builder geometry edit. The field starts
    // from the design's caliber; flip back to Flight to read the new apogee.
    await page.getByRole("tab", { name: "Design" }).click();
    // The what-if number field, not the diagram's "Body diameter" drag slider (same accessible name).
    const bodyDia = page.getByRole("spinbutton", { name: /Body diameter/ });
    await expect(bodyDia).toBeVisible();
    const designDia = parseFloat((await bodyDia.getAttribute("placeholder")) ?? "0");
    expect(designDia).toBeGreaterThan(0);
    await bodyDia.fill(String(Math.round(designDia * 1.5)));
    await page.getByRole("tab", { name: "Flight" }).click();

    // A fatter airframe has a bigger frontal area (more drag) and more tube material, so it flies lower.
    await expect.poll(apogee).toBeLessThan(before);
  });

  test("unit toggle switches to imperial", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await page.getByRole("button", { name: "Imperial" }).click();
    // The altitude plot title becomes "Altitude (ft) vs time".
    await expect(page.getByRole("heading", { name: /Altitude \(ft\) vs time/ })).toBeVisible();
  });

  test("a reload picks up the design, the units, and the edits where they were left", async ({ page }) => {
    // Losing the loaded design on a refresh is worst exactly where this tool is meant to be used:
    // a phone at the pad, offline, whose backgrounded tab the OS reclaimed — and the design file
    // that would let you import again may not be on the phone at all.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Imperial" }).click();
    await page.getByRole("tab", { name: "Design" }).click();
    await page.getByLabel("Fin span (in)").fill("3");
    await expect(page.getByRole("button", { name: /Reset to as-designed/ })).toBeVisible();

    await page.reload();
    // The design is back, in the units that were chosen, on the workspace that was open — not the
    // one the design happened to load on an hour ago.
    await expect(page.getByText(/Picked up where you left off/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("tab", { selected: true })).toHaveText("Design");
    // …and so is the edit that was in flight. Restored through the model, so it comes back as the
    // display format of the stored metres.
    await expect(page.getByLabel("Fin span (in)")).toHaveValue(/^3(\.0+)?$/);
    // The flight is still a click away and still in imperial.
    await page.getByRole("tab", { name: "Flight" }).click();
    await expect(page.getByRole("heading", { name: /Altitude \(ft\) vs time/ })).toBeVisible();

    // "Start fresh" really does forget it.
    await page.getByRole("button", { name: "Start fresh" }).click();
    await expect(page.getByRole("button", { name: /38 mm single-deploy/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: /38 mm single-deploy/ })).toBeVisible();
    await expect(page.getByText(/Picked up where you left off/)).toHaveCount(0);
  });

  test("has no serious accessibility violations on the home page", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });

  test("has no serious accessibility violations on the results view", async ({ page }) => {
    // Audit the full results state across all three workspaces — stat grid, warnings, plots, and the
    // design-tool comparison table on Flight; the editable diagram (a slider group) on Design; the
    // sweep and dispersion tools on Analyze — not just the empty landing page. The comparison table
    // renders deviation values in a semantic caution colour, exactly the honesty-relevant numbers
    // that must stay readable, and the tablist adds a new keyboard-navigable control to check.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await page.getByRole("heading", { name: "Flight", exact: true }).waitFor();
    await expect(page.getByRole("region", { name: "Validation" })).toHaveCount(0);

    const seriousViolations = async () => {
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    };
    expect(await seriousViolations()).toEqual([]); // Flight
    await page.getByRole("tab", { name: "Design" }).click();
    expect(await seriousViolations()).toEqual([]); // Design
    await page.getByRole("tab", { name: "Analyze" }).click();
    expect(await seriousViolations()).toEqual([]); // Analyze
  });

  test("has no serious accessibility violations on the results view in dark mode", async ({
    page,
  }) => {
    // Muted labels on the dark background are the easiest contrast trap; audit dark explicitly.
    await page.addInitScript(() => localStorage.setItem("loft.theme", "dark"));
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await page.getByRole("heading", { name: "Flight", exact: true }).waitFor();
    await expect(page.getByRole("region", { name: "Validation" })).toHaveCount(0);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toEqual([]);
  });

  test("works offline after an online visit — shell, sample import, and sim", async ({
    page,
    context,
  }) => {
    // The pad has no cell signal; once Loft has loaded online it must run with the network cut.
    await page.goto("/", { waitUntil: "networkidle" });
    // Wait for the real readiness signal, not a proxy: the worker controls the page AND
    // everything needed to run offline is actually in CacheStorage — every /_next/ build asset
    // the shell references (so the app can hydrate after an offline reload) plus the sample (so
    // the offline click resolves from cache). Asserting the cached artifacts directly makes this
    // independent of the HTTP disk cache, which is the only reason a shell-only precache appeared
    // to work locally while failing on the CI Chromium.
    await page.waitForFunction(
      async () => {
        if (!navigator.serviceWorker?.controller) return false;
        const referenced = [...document.querySelectorAll("script[src], link[href]")]
          .map((n) => n.getAttribute("src") || n.getAttribute("href"))
          .filter((u): u is string => u != null && u.includes("/_next/"));
        const needed = [...referenced, "/samples/demo-single-deploy.ork"];
        for (const u of needed) {
          if (!(await caches.match(new URL(u, location.origin).pathname))) return false;
        }
        return true;
      },
      null,
      { timeout: 15000 },
    );

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });

    // The app shell loads from cache.
    await expect(page.getByRole("button", { name: /38 mm single-deploy/ })).toBeVisible();

    // A bundled sample — fetched on demand, never clicked while online — still imports and
    // simulates with no connection, because the service worker precached the sample designs.
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByLabel("Results").getByText("Apogee", { exact: true })).toBeVisible();

    await context.setOffline(false);
  });

  test("a field with only one bound says so in words, not with a dash", async ({ page }) => {
    // Most design fields are floored at zero and open above — a dimension has no upper limit the
    // editor can name — and the range tooltip rendered "0 to –", which reads as a range that failed
    // to load rather than as "no maximum". 17 fields in the Design workspace were showing it.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Design" }).click();

    const dashed = await page.$$eval("[title]", (ns) =>
      ns.map((n) => n.getAttribute("title") ?? "").filter((t) => /\b(–|-)\s*$|:\s*–\s+to\b/.test(t)),
    );
    expect(dashed, `range tooltips with an unnamed bound: ${dashed.join(" | ")}`).toEqual([]);

    // And the positive anchor: the one-sided form is actually being produced, so the assertion
    // above cannot pass on a screen that renders no ranges at all.
    const ranges = await page.$$eval("[title]", (ns) =>
      ns.map((n) => n.getAttribute("title") ?? "").filter((t) => /(or more|up to \d)/.test(t)),
    );
    expect(ranges.length).toBeGreaterThan(0);
  });

  test("picking a fin set aims the fin fields at it, and the edit lands there only", async ({ page }) => {
    // Every fin what-if used to resolve "the" fin set as the frontmost one, so on a design with
    // several the others could not be edited at all — 19 sets across 10 corpus designs. The value
    // the field shows and the set the edit writes to must be the same set, which is the half that
    // fails silently: nudge the number you can see and a different fin changes.
    await page.goto("/");
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/two-stage-firm-booster.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("tab", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    const finRows = page.locator("tr").filter({ hasText: /Trapezoidal fins/ });
    await expect(finRows).toHaveCount(2);
    const spanOf = async () =>
      (await finRows.allTextContents()).map((t) => t.replace(/\s+/g, " ").match(/span ([\d,]+) mm/)?.[1] ?? "?");
    const before = await spanOf();
    expect(before[0]).not.toBe("?");

    // Aim the fields at the SECOND set and confirm they now describe it.
    await finRows.nth(1).click();
    const spanField = page.locator("label").filter({ hasText: /Fin span/ }).first().locator("input");
    await expect(spanField).toHaveAttribute("placeholder", before[1]);

    // Edit it. Only the picked set moves.
    await spanField.fill("77");
    await spanField.blur();
    await expect
      .poll(async () => (await spanOf())[1], { timeout: 15000 })
      .toBe("77");
    expect((await spanOf())[0], "the set that was not picked must not change").toBe(before[0]);
  });

  test("an active fin edit stays on its set when you click something else", async ({ page }) => {
    // The destructive version of this is silent: with the fin fields aimed at set 2 and a span set,
    // clicking a body tube to read it cleared the target, so the same 77 mm re-applied to set 1 —
    // a different fin changed, with the field still reading 77.
    await page.goto("/");
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/two-stage-firm-booster.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("tab", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    const finRows = page.locator("tr").filter({ hasText: /Trapezoidal fins/ });
    const spanOf = async () =>
      (await finRows.allTextContents()).map((t) => t.replace(/\s+/g, " ").match(/span ([\d,]+) mm/)?.[1] ?? "?");
    const before = await spanOf();

    await finRows.nth(1).click();
    const spanField = page.locator("label").filter({ hasText: /Fin span/ }).first().locator("input");
    await spanField.fill("77");
    await spanField.blur();
    await expect.poll(async () => (await spanOf())[1], { timeout: 15000 }).toBe("77");

    // Read a different part. The edit must not follow the pick.
    await page.locator("tr").filter({ hasText: /Body tube/ }).first().click();
    await page.waitForTimeout(600);
    const after = await spanOf();
    expect(after[1], "the edited set keeps its edit").toBe("77");
    expect(after[0], "the set that was never picked must not inherit it").toBe(before[0]);
  });

  test("a refused what-if says so, and the field shows what is actually flown", async ({ page }) => {
    // The field is controlled by the committed edit, so an entry the model refuses left `value`
    // unchanged — React never re-rendered the node and the refused text sat there looking like the
    // number in the flight. Typing -3 into Fin span kept "-3" on screen while the design's own span
    // went on being flown, with no aria-invalid, no message, and nothing else to say so.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("tab", { name: "Design" }).click();

    const span = page.locator("label").filter({ hasText: /Fin span/ }).first().locator("input");
    const designSpan = await span.getAttribute("placeholder");
    expect(designSpan).toBeTruthy();

    await span.fill("-3");
    await span.blur();

    // The box goes back to what is being flown rather than keeping the refused entry...
    await expect(span).toHaveValue("");
    // ...it is marked invalid for assistive tech...
    await expect(span).toHaveAttribute("aria-invalid", "true");
    // ...and it says plainly what is being flown instead, naming that value. Located through the
    // field's own aria-describedby rather than by role, so this asserts THIS field's message.
    const msgId = await span.getAttribute("aria-describedby");
    expect(msgId).toBeTruthy();
    const msg = page.locator(`#${msgId}`);
    await expect(msg).toHaveAttribute("role", "alert");
    await expect(msg).toContainText("isn't a value this can fly");
    await expect(msg).toContainText(designSpan!);

    // A value the model accepts clears all of it and lands.
    await span.fill("50");
    await span.blur();
    await expect(span).toHaveValue("50");
    await expect(span).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.locator(`#${msgId}`)).toHaveCount(0);
  });

  test("a refused dispersion says so too, and does not quietly shrink the recovery area", async ({ page }) => {
    // The same defect, one component over and with more riding on it. `NumberField` declared
    // `min={0}` on the input and enforced it nowhere, so a negative ±1σ stayed in the box while
    // `MonteCarlo.tsx` floored it to zero for the study. Measured on this design: "Wind speed ±1σ"
    // typed as -5 returned a 95% recovery radius of 366 m — identical to leaving the field blank —
    // where the ±5 asked for gives 1,259 m and the default ±2 gives 671 m. The one number on the
    // page whose job is to say how much ground to search came back 3.4x too small, silently.
    test.setTimeout(120_000);
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("tab", { name: "Analyze" }).click();

    const mc = page.getByRole("region", { name: "Monte-Carlo dispersion" });
    await mc.getByRole("button", { name: "Run dispersion" }).click();
    const wind = mc.getByLabel("Wind speed ±1σ");
    await expect(wind).toHaveValue("2");

    await wind.fill("-5");
    await wind.blur();

    // The box shows the spread actually being flown — zero, which this field renders blank...
    await expect(wind).toHaveValue("");
    await expect(wind).toHaveAttribute("aria-invalid", "true");
    // ...and it names that value, in the same words the design editor's fields use.
    const ids = (await wind.getAttribute("aria-describedby"))!.split(" ");
    const msg = mc.locator(ids.map((id) => `#${id}`).join(", ")).filter({ hasText: "isn't a value this can fly" });
    await expect(msg).toHaveAttribute("role", "alert");
    await expect(msg).toHaveText("-5 isn't a value this can fly (0 or more) — flying 0.");

    // A value it will fly clears the whole state and lands.
    await wind.fill("5");
    await wind.blur();
    await expect(wind).toHaveValue("5");
    await expect(wind).not.toHaveAttribute("aria-invalid", "true");
    await expect(mc.getByText("isn't a value this can fly")).toHaveCount(0);
  });

  test("the wind dispersion follows the unit toggle without the toggle changing what is flown", async ({
    page,
  }) => {
    // It was the one unit-bearing input on the page that ignored the toggle: it said "m/s" honestly
    // enough, but it said it directly beside a Waiver ceiling reading "ft" and a Conditions wind field
    // reading "mph". Converting it puts a parent between the field and its state, which is the shape
    // that broke the refusal above — so both properties are asserted together here.
    test.setTimeout(120_000);
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("tab", { name: "Analyze" }).click();
    const mc = page.getByRole("region", { name: "Monte-Carlo dispersion" });
    await mc.getByRole("button", { name: "Run dispersion" }).click();
    const wind = mc.locator("input").and(mc.getByLabel("Wind speed ±1σ")).first();
    const unitSuffix = async () =>
      (await wind.evaluate((n) => (n.labels?.[0]?.textContent || "").replace(/\s+/g, " "))).match(/m\/s|mph/)?.[0];

    await expect(wind).toHaveValue("2");
    expect(await unitSuffix()).toBe("m/s");

    // The digits change, because the quantity is being re-expressed rather than reinterpreted.
    await page.getByRole("button", { name: "Imperial" }).click();
    expect(await unitSuffix()).toBe("mph");
    await expect(wind).toHaveValue("4.5"); // 2 m/s = 4.47 mph

    // Toggling repeatedly must not walk the value the model holds. Rounding is display-only.
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Metric" }).click();
      await expect(wind).toHaveValue("2");
      await page.getByRole("button", { name: "Imperial" }).click();
      await expect(wind).toHaveValue("4.5");
    }

    // An entry typed in imperial is stored as the SI value it means: 10 mph = 4.4704 m/s.
    await wind.fill("10");
    await wind.blur();
    await expect(wind).toHaveValue("10");
    expect(
      Number(await page.evaluate(() => localStorage.getItem("loft.pref.mc.windSpeedMps"))),
    ).toBeCloseTo(4.4704, 3);

    // And the refusal still refuses on this side of the toggle — the box does not keep a value that
    // is not the one being flown.
    await wind.fill("-5");
    await wind.blur();
    await expect(wind).toHaveValue("");
    await expect(wind).toHaveAttribute("aria-invalid", "true");
    await expect(mc.getByText("isn't a value this can fly")).toBeVisible();
  });

  test("a waiver ceiling keeps meaning the same altitude when the units change", async ({ page }) => {
    // The ceiling was held in whatever units were on screen, so the unit toggle silently
    // reinterpreted it. Measured on this design (apogee ~3,230 ft / ~985 m): a 3,000 ft waiver read
    // "Chance over ceiling 86%", and switching to metric left 3000 in the box — now meaning
    // 3,000 m — and the same rocket read 0%. A waiver bust reading as clean, from a gesture nobody
    // expects to change what they typed. This asserts the ALTITUDE survives, not the digits.
    test.setTimeout(120_000);
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    const units = page.getByRole("group", { name: /unit/i }).first();
    await units.getByRole("button", { name: "Imperial" }).click();
    await page.getByRole("tab", { name: "Analyze" }).click();

    const mc = page.getByRole("region", { name: "Monte-Carlo dispersion" });
    await mc.getByRole("button", { name: "Run dispersion" }).click();
    const ceiling = mc.getByLabel("Waiver ceiling");
    await expect(ceiling).toBeVisible({ timeout: 90_000 });

    // The reading is the value under the "Chance over ceiling" heading.
    const chance = mc.locator("div").filter({ hasText: /^Chance over ceiling$/ }).first().locator("+ div");

    await ceiling.fill("3000");
    await ceiling.blur();
    // Let every flight land first. The panel refines its figures in place as samples arrive, so a
    // reading taken mid-run drifts by a few points and would make this look flaky rather than
    // wrong. Once it has settled, switching units re-reads the SAME samples — this is post-hoc, it
    // never re-flies — so the two readings have to be identical, not merely close.
    await expect(mc.getByText(/Refining|Flying \d/)).toHaveCount(0, { timeout: 90_000 });
    await expect(chance).not.toHaveText("");
    const imperial = await chance.innerText();
    // This design tops 3,000 ft on most flights, so the honest answer is a large percentage.
    expect(parseInt(imperial, 10), "chance of busting a 3,000 ft waiver").toBeGreaterThan(50);

    await units.getByRole("button", { name: "Metric" }).click();

    // 3,000 ft is 914 m: the box now says so, and the answer is the same answer.
    await expect(ceiling).toHaveValue("914");
    await expect(chance).toHaveText(imperial);
  });
});
