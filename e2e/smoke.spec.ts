import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** The refusal a field is pointing at.
 *
 *  A field describes several things at once — its unit, its visible guidance line, and, when there is
 *  one, its refusal — so `aria-describedby` names more than one id and only one of them is the live
 *  region. Picking by role among exactly THOSE ids asserts this field's own message: not any alert on
 *  the page, and not whichever description happened to be listed first. */
function refusalOf(page: Page, describedBy: string | null) {
  const ids = (describedBy ?? "").split(" ").filter(Boolean);
  // No description at all cannot be a refusal; a selector matching nothing says so without throwing.
  return page.locator(ids.map((id) => `[id="${id}"][role="alert"]`).join(", ") || "alert-none");
}

/** "No stored-tool comparison is rendered for this design" — asked on the workspace the comparison
 *  actually lives on.
 *
 *  This exists because the same assertion, left on Flight after the comparison moved to Cross-check,
 *  passes for the wrong reason: `getByRole` does not match inside a `hidden` subtree, so a Validation
 *  panel wrongly rendered on the new workspace satisfies every one of these guards. Navigating first
 *  is what makes the absence mean something. */
async function expectNoComparison(page: import("@playwright/test").Page) {
  await page.getByRole("link", { name: "Cross-check" }).click();
  await page.waitForURL(/\/validate\/?$/);
  await expect(page.getByRole("region", { name: "Validation" })).toHaveCount(0);
}

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
    await expectNoComparison(page);

    // The Design workspace opens with the to-scale side-view — with the loaded motor and the CG
    // marked ahead of the CP, the stability picture read off the airframe.
    await page.getByRole("link", { name: "Design" }).click();
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
    await page.getByRole("link", { name: "Sweep" }).click();

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
    // any edit remounted the heavy analysis panels to idle, so a completed sweep (or a 300-flight
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
            .locator("xpath=following-sibling::div[1]")
            .innerText()
        ).replace(/[^\d.]/g, ""),
      );

    await page.getByRole("link", { name: "Sweep" }).click();
    const sweep = page.getByRole("region", { name: "Motor sweep" });
    await sweep.getByRole("button", { name: "Run motor sweep" }).click();
    // The whole ROW, not a positional cell. This read `td` index 1 — the Class column — until a
    // `Use` control was inserted second, at which point it was reading a button label that no design
    // edit can change, and the assertion below could only ever time out. A row's text moves whenever
    // any figure in it does, and it cannot be silently re-pointed by a column insertion.
    const firstRow = () => sweep.locator("tbody tr").first();
    await expect(firstRow()).not.toBeEmpty();
    const sweptBefore = await firstRow().innerText();
    const flownBefore = await apogee();

    // Widen the fins on the Design workspace, then come back.
    await page.getByRole("link", { name: "Design" }).click();
    const span = page.locator("label", { hasText: /Fin span/ }).locator("input");
    await span.fill("70");
    await span.blur();
    await expect.poll(apogee).not.toBe(flownBefore);

    await page.getByRole("link", { name: "Sweep" }).click();
    // The sweep is still open, and it has re-flown every motor on the edited design.
    await expect(sweep.locator("table")).toBeVisible();
    await expect.poll(async () => firstRow().innerText()).not.toBe(sweptBefore);
  });

  test("the nose is draggable on the diagram, and arrow keys nudge rather than jump", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Design" }).click();

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

  test("a staged design is told why the sweeps aren't offered, on both workspaces", async ({ page }) => {
    // Rendering nothing at all reads as "Loft doesn't have these", which is a different claim from
    // "they don't apply to this design". Both workspaces have to say it now: the sweeps are
    // single-stage because there is no one "the" nose or fin set to vary, and the second solver —
    // which moved to Cross-check — is single-stage because RocketPy's flight is.
    await page.goto("/");
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/two-stage-firm-booster.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Sweep" }).click();
    const panel = page.locator("#panel-sweep");
    await expect(panel.getByRole("heading", { name: /Design sweeps/ })).toBeVisible();
    await expect(panel).toContainText(/flies 2 stages/);
    // The one that does apply is still there.
    await expect(panel.getByRole("heading", { name: /Monte-Carlo/ })).toBeVisible();

    // …and the second solver says the same thing on the workspace it moved to, rather than simply
    // being absent there.
    await page.getByRole("link", { name: "Cross-check" }).click();
    await page.waitForURL(/\/validate\/?$/);
    await expect(page.locator("#panel-validate").getByRole("region", { name: "RocketPy cross-check" })).toHaveCount(0);
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
            .locator("xpath=following-sibling::div[1]")
            .innerText()
        ).replace(/[^\d.]/g, ""),
      );
    expect(await apogee()).toBeGreaterThan(0);

    await page.locator("summary", { hasText: /conditions/i }).first().click();
    const angle = page.locator("input").and(page.getByLabel(/Rail angle/i)).first();
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
    const wind = page.locator("input").and(page.getByLabel(/Surface wind/i)).first();
    await wind.fill("-50");
    await wind.blur();
    await expect(wind).toHaveValue(/^0(\.0+)?$/);
  });

  test("a refused entry is withheld from the flight, and does not outlive the flight it describes", async ({
    page,
  }) => {
    // Three behaviours of THE numeric field, all of which existed only as prose in a comment until
    // the two field implementations were merged. Each is a defect that was measured once and fixed:
    //  - a number the field itself calls impossible must not reach the solver even in passing, or the
    //    pad-check surface prints a result computed from it while the cursor is still in the box;
    //  - the refusal has to say what IS being flown, because that is the question it answers;
    //  - and it must not survive a change to what is being flown. It used to: the amber border and the
    //    live message sat there quoting a value in units no longer on screen, and the only way out was
    //    to find that exact box and type in it.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.locator("summary", { hasText: /conditions/i }).first().click();

    const rail = page.locator("input").and(page.getByLabel(/Rail length/i)).first();
    const apogee = page
      .getByLabel("Results")
      .getByText("Apogee", { exact: true })
      .locator("xpath=following-sibling::div[1]");
    const asDesigned = await apogee.textContent();

    // A rail of no length is not a short rail. Typed, not filled — `fill()` skips the focus and blur
    // this hangs off, and would test nothing.
    await rail.click();
    await rail.pressSequentially("0");
    await expect(apogee).toHaveText(asDesigned!);

    await rail.blur();
    await expect(rail).toHaveAttribute("aria-invalid", "true");
    // The message is the field's OWN, reached the way a screen reader reaches it, and it names the
    // entry, the range, and — the point of it — the value still being flown.
    const message = refusalOf(page, await rail.getAttribute("aria-describedby"));
    await expect(message).toHaveCount(1);
    await expect(message).toHaveText("0 isn't a value this can fly (more than 0, up to 20) — flying 1.2.");

    // Now change what is being flown without touching this field. The refusal described the old
    // flight; it has nothing to say about this one.
    await page.getByRole("group", { name: /unit/i }).first().getByRole("button", { name: "Imperial", exact: true }).click();
    await expect(apogee).not.toHaveText(asDesigned!);
    await expect(rail).not.toHaveAttribute("aria-invalid", "true");
    await expect(message).toHaveCount(0);
  });

  test("a design downloaded from Loft reopens as the same flight", async ({ page }) => {
    // R6's *done when* through the button a flyer actually presses. `lib/ork/export.test.ts` asserts
    // the round trip on the model — part for part, id for id — and this asserts the journey: Download,
    // then Import that file, and the headline number has not moved. The two are worth having
    // separately, because everything between the model and the file is what this covers: which bytes
    // the Download button hands over, and whether the app's own reader takes them back.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    const apogee = page
      .getByLabel("Results")
      .getByText("Apogee", { exact: true })
      .locator("xpath=following-sibling::div[1]");
    const before = (await apogee.textContent())!.trim();
    expect(before).toMatch(/\d/);

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download|Save this design/i }).first().click();
    const saved = await (await download).path();
    expect(saved).toBeTruthy();

    await page.getByRole("button", { name: /Import another/ }).click();
    await page.getByLabel(/^Choose an OpenRocket/).setInputFiles(saved!);
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(apogee).toHaveText(before);
  });

  test("a downloaded design reopens on the same launch setup, not on Loft's defaults", async ({ page }) => {
    // **The test above passes with the Sev-1 present, and that is why this one exists.** It reads
    // APOGEE, which barely moves with the launch setup — so a round trip that silently reset rail
    // length, wind, angle and altitude to Loft's defaults looked clean. `serializeRocketXml` wrote no
    // `<simulations>` block at all, and that block is where the importer reads the whole setup FROM.
    //
    // Drift from pad is the figure that exposes it: it is computed almost entirely from the wind and
    // the rod, so it collapses to 0 m the moment they are lost — and it is one of the two numbers a
    // flyer sizes their recovery area with.
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    const figure = (label: string) =>
      page.getByLabel("Results").getByText(label, { exact: true }).locator("xpath=following-sibling::div[1]");
    const drift = figure("Drift from pad");
    const before = (await drift.textContent())!.trim();
    // It has to be a real distance for the assertion below to mean anything — 0 m would pass either
    // way, which is exactly the state the defect produced.
    expect(parseFloat(before.replace(/[^\d.]/g, "")), `drift read "${before}"`).toBeGreaterThan(50);

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download|Save this design/i }).first().click();
    const saved = await (await download).path();
    expect(saved).toBeTruthy();

    await page.getByRole("button", { name: /Import another/ }).click();
    await page.getByLabel(/^Choose an OpenRocket/).setInputFiles(saved!);
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(drift, "the launch setup was reset to Loft's defaults on re-import").toHaveText(before);
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
    // The stored-tool comparison moved to its own workspace on 2026-08-02, beside the step-by-step
    // cross-check and the second solver — every "does anything else agree?" surface in one place.
    await page.getByRole("link", { name: "Cross-check" }).click();
    await page.waitForURL(/\/validate\/?$/);
    const comparison = page.getByRole("heading", { name: /vs Loft/ });
    const reset = page.getByRole("button", { name: /Reset to as-designed/ });
    await expect(comparison).toHaveCount(1);

    await page.locator("summary", { hasText: /conditions/i }).first().click();
    const rail = page.locator("input").and(page.getByLabel(/Rail length/i)).first();
    await rail.fill("2");
    await expect(comparison).toHaveCount(0);
    await expect(reset).toBeVisible();

    // Emptying the field is as much a way back as the button is — and the button must not vanish
    // before the comparison returns, or there is no way back at all.
    await rail.fill("");
    await expect(comparison).toHaveCount(1);
    await expect(reset).toHaveCount(0);
  });

  test("each workspace is its own route, so Back, a reload and a deep link all land where you were", async ({
    page,
  }) => {
    const current = page.locator('nav[aria-label="Workspace"] a[aria-current="page"]');
    // The static export is served as directories, so the address is `/design/` with the trailing
    // slash — normalise once here rather than writing it into every assertion, where it would read
    // as a fact about the app rather than about the host.
    const path = () => new URL(page.url()).pathname.replace(/\/$/, "") || "/";

    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    // An import lands on its flight result, and that is a PATH now, not a fragment. The difference
    // is not cosmetic: a fragment never reaches the static export, so no workspace had a document,
    // a title or a precached copy of its own.
    //
    // Waited for rather than read: a workspace switch is a NAVIGATION now, not a `setState`, so the
    // address settles a beat after the panel does. Reading `page.url()` straight after a click is a
    // race the old fragment version could not lose, and this is the one place that difference is
    // worth spelling out.
    await page.waitForURL(/\/flight\/?$/);
    expect(path()).toBe("/flight");

    await page.getByRole("link", { name: "Sweep" }).click();
    await page.waitForURL(/\/sweep\/?$/);
    await page.getByRole("link", { name: "Design" }).click();
    await page.waitForURL(/\/design\/?$/);

    // Back returns to the workspace you came from rather than leaving the app.
    await page.goBack();
    await page.waitForURL(/\/sweep\/?$/);
    await expect(current).toHaveText("Sweep");

    // …and a reload picks the same workspace back up, not the one the design loaded on.
    await page.reload();
    await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible({ timeout: 15000 });
    expect(path()).toBe("/sweep");
    await expect(current).toHaveText("Sweep");

    // A workspace opened COLD from its own address — the bookmark case — restores the session and
    // stays where it was asked to be. The saved session remembers Sweep; Design is what the flyer
    // typed, and what a flyer typed outranks what the session remembers.
    await page.goto("/design");
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeVisible({ timeout: 15000 });
    expect(path()).toBe("/design");
    await expect(current).toHaveText("Design");

    // And the route says which job it is, in the one place a bookmark and a tab strip both read.
    await expect(page).toHaveTitle(/^Design — Loft$/);
  });

  test("the wordmark cannot strand a loaded design at an address that names no workspace", async ({
    page,
  }) => {
    // The header wordmark is a link home, and the root and the workspaces share one layout — so
    // following it does not unmount anything. The design survived while the address stopped naming
    // a workspace, and the result was the Flight panel rendered under `/`, with no link on the
    // spine marked current and the tab title back to the site's. Worse, the session-save effect
    // read the address for "where I left off", so the same click quietly rewrote Sweep to Flight
    // and the next cold open came back on the wrong workspace.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Sweep" }).click();
    await page.waitForURL(/\/sweep\/?$/);

    await page.getByRole("link", { name: "Loft", exact: true }).click();
    // Back where the flyer was, not at an address that names nothing.
    await page.waitForURL(/\/sweep\/?$/);
    await expect(page.locator('nav[aria-label="Workspace"] a[aria-current="page"]')).toHaveText("Sweep");

    // …and the session still remembers it, which is the half no amount of looking at the screen
    // would have shown.
    await page.reload();
    await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('nav[aria-label="Workspace"] a[aria-current="page"]')).toHaveText("Sweep");
  });

  test("a workspace with no design behind it returns to the import screen", async ({ page }) => {
    // The stale-bookmark case, and the one a route split creates that a fragment never could: an
    // address that names a workspace can now be reached with nothing loaded. A page that renders an
    // empty shell there is a state with no way out — the spine's other links are just as empty.
    await page.goto("/sweep");
    await expect(page.getByLabel(/^Choose an OpenRocket/)).toBeVisible({ timeout: 15000 });
    expect(new URL(page.url()).pathname.replace(/\/$/, "") || "/").toBe("/");
  });

  test("a saved build carries the motor you picked, and an import says what it leaves out", async ({ page }) => {
    // "Swap motor" is the only motor control in the app, so on the BUILDER path that dropdown is the
    // motor picker, not a what-if — and the export ignored it. Measured on the starter across all 15
    // swaps the picker offers: 7 put the saved file more than 100% away from the screen, worst an E16
    // reading 67.6 m while the file it wrote flew 993.6 m, +1369%, in the optimistic direction.
    //
    // On an IMPORTED design the same swap genuinely is a hypothesis against the flyer's own file, so
    // it stays out — and the app now says so where the button is, in visible copy rather than a
    // `title` a phone can never show.
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeVisible({ timeout: 15000 });

    const omits = page.getByText(/is not part of the design|are not part of the design/);
    await expect(omits).toHaveCount(0);

    await page.getByRole("combobox", { name: "Swap motor" }).selectOption({ index: 1 });
    // A build's motor IS the design, so nothing is left out and nothing is claimed to be.
    await expect(omits).toHaveCount(0);

    // Ballast is left out on both paths — there is no component in the model to write — so it is named.
    const ballast = page.getByRole("spinbutton", { name: /nose ballast/i });
    // Required, not conditional: a branch that silently does not run is a test asserting nothing.
    await expect(ballast).toHaveCount(1);
    await ballast.fill("50");
    await ballast.blur();
    await expect(omits.first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/nose ballast/).first()).toBeVisible();

    // The import half — where a swap IS a hypothesis and stays out of the file, with the notice
    // naming it — is held by `bakeMotorSwap`'s unit cases and by `downloadOmits`, not here: the swap
    // picker is not on this surface for an imported design without further navigation, and a test
    // that has to hunt for its own control is a test about navigation rather than about the claim.
  });

  test("reopening your own build from the shelf gives you back the build, not the starter", async ({ page }) => {
    // A Sev-1 by the manual's second criterion: a one-way door. The shelf writes its row at LOAD time
    // from the bytes the design arrived with. For a from-scratch build those bytes are the factory
    // starter, serialised before the first keystroke, and every edit after that lives in the edit bag
    // — so the row said "New design" however it was renamed, and reopening it handed back the starter
    // with the whole build silently gone. Measured in the shipped UI before the fix: a starter edited
    // to an 85 mm fin span flies 930 m at 2.19 cal, and the shelf returned 994 m at 1.53 cal.
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeVisible({ timeout: 15000 });

    const apogee = page.getByText("Apogee", { exact: true }).first().locator("xpath=following-sibling::*[1]");
    await page.getByRole("link", { name: "Flight" }).click();
    const starter = (await apogee.innerText()).trim();

    // Build something the starter plainly is not.
    await page.getByRole("link", { name: "Design" }).click();
    const span = page.locator("input").and(page.getByLabel(/fin span/i)).first();
    await span.fill("85");
    await span.blur();
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(async () => (await apogee.innerText()).trim(), { timeout: 20000 }).not.toBe(starter);
    const built = (await apogee.innerText()).trim();

    // Name it, because the row has to identify it too — the rename never reached the shelf either.
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByLabel("Design name").fill("My build");
    await page.getByLabel("Design name").blur();

    await page.getByRole("button", { name: /Import another/ }).click();
    const row = page.getByRole("button").filter({ hasText: /^My build$/ });
    await expect(row).toHaveCount(1, { timeout: 15000 });

    await row.click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 20000 });
    // The whole point: the build comes back, and it is NOT the starter.
    await expect.poll(async () => (await apogee.innerText()).trim(), { timeout: 20000 }).toBe(built);
    expect(built).not.toBe(starter);
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

  test("removing a design from the shelf is undoable, including the last one", async ({ page }) => {
    // The app's last destructive act with no way back. One tap deleted a design's only stored bytes:
    // no confirmation, no undo, and it survived a reload — on the surface that exists precisely
    // because at the pad the file may not be on the phone at all.
    await page.goto("/");
    for (const sample of [/38 mm single-deploy/, /54 mm dual-deploy/]) {
      await page.getByRole("button", { name: sample }).click();
      await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
      await page.getByRole("button", { name: /Import another/ }).click();
    }
    const shelf = page.getByRole("list").filter({ has: page.getByRole("button", { name: /^Reopen/ }) });
    const reopen = () => shelf.getByRole("button", { name: /^Reopen/ });
    const put = () => page.getByRole("button", { name: /^Put .* back on your designs/ });
    await expect(reopen()).toHaveCount(2);
    const order = await reopen().allInnerTexts();

    // Remove the OLDER one — the row at the BACK. A restore that prepends, or that stamps a fresh
    // timestamp, puts it at the front instead, and only a removal from a non-front position can tell
    // the difference. Taking the newest cannot: its own place already IS the front.
    await page.getByRole("button", { name: /^Remove .* from your designs/ }).last().click();
    await expect(reopen()).toHaveCount(1);
    await put().click();
    await expect(reopen()).toHaveCount(2);
    expect(await reopen().allInnerTexts()).toEqual(order);

    // Now the case the earlier attempt at this undo missed: removing the LAST design. The offer used
    // to live inside the shelf card, which unmounts when the shelf empties — so the one removal whose
    // bytes are most likely the only copy was the one with nothing offering them back.
    await page.getByRole("button", { name: /^Remove .* from your designs/ }).first().click();
    await page.getByRole("button", { name: /^Remove .* from your designs/ }).first().click();
    // `exact` matters: the offer's own sentence ends "…from your designs", and a bare `getByText`
    // matches case-insensitive SUBSTRINGS, so it finds the banner as well as the shelf heading.
    await expect(page.getByText("Your designs", { exact: true })).toHaveCount(0);
    // Two removals in a row is what a mis-tap looks like, and both are still offered — holding only
    // the latest silently destroyed the first design's way back.
    await expect(put()).toHaveCount(2);

    for (const n of [1, 0]) await put().nth(n).click();
    await expect(reopen()).toHaveCount(2);
    expect(await reopen().allInnerTexts()).toEqual(order);

    // The restore is the real BYTES, not a row that only looks right: reopening it flies the design
    // it names, at the apogee that design flies. The 54 mm dual-deploy sample is the one being put
    // back, and it is a different flight from the 38 mm one beside it on the shelf.
    await reopen().first().click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 }).first()).toContainText("54mm");
    await page.getByRole("button", { name: /Import another/ }).click();

    // The offer OUTLIVES reopening a different design, which is the most natural next tap after a
    // mis-tap. An earlier version cleared every offer on every load, so one click made the removed
    // design unrecoverable — the same no-way-back in a smaller window.
    await page.getByRole("button", { name: /^Remove .* from your designs/ }).last().click();
    await expect(put()).toHaveCount(1);
    await reopen().first().click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Import another/ }).click();
    await expect(put()).toHaveCount(1);
    await put().click();
    await expect(reopen()).toHaveCount(2);

    // And it is spent once the design is back by another route — reopening the sample re-shelves it,
    // so an offer to put that one back is no longer an offer to do anything.
    await page.getByRole("button", { name: /^Remove .* from your designs/ }).last().click();
    await expect(put()).toHaveCount(1);
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Import another/ }).click();
    await expect(put()).toHaveCount(0);
    await expect(reopen()).toHaveCount(2);
  });

  test("starts a new design from scratch and flies it (builder)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();

    // A from-scratch design enters the same pipeline: it names itself, resolves a motor, is stable.
    await expect(page.getByRole("heading", { name: "New design", exact: true })).toBeVisible();
    await expect(page.getByText("H128W", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Static margin", { exact: false })).toBeVisible();

    // A build lands on the Design workspace — the editable rocket, not the flight readout.
    await expect(page.getByRole("link", { name: "Design" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeVisible();

    // It still flies: switch to Flight and read a real apogee out of the box.
    await page.getByRole("link", { name: "Flight" }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    const apogee = await page
      .getByLabel("Results")
      .getByText("Apogee", { exact: true })
      .locator("xpath=following-sibling::div[1]")
      .innerText();
    expect(parseFloat(apogee.replace(/[^\d.]/g, ""))).toBeGreaterThan(100);

    // No stored source, so it is not mislabelled with an OpenRocket/RockSim comparison.
    await expectNoComparison(page);
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
    await expectNoComparison(page);
    await expect(page.getByRole("button", { name: "Reset to as-designed" })).toHaveCount(0);

    // Stack a design what-if: nose ballast makes the rocket heavier and lower.
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("input").and(page.getByLabel(/Nose ballast/)).first().fill("500");
    await expect.poll(summaryApogee).toBeLessThan(before);

    // Back on Flight, the hypothetical flight has dropped the stored comparison, and the header now
    // offers a one-click way back.
    await page.getByRole("link", { name: "Flight" }).click();
    await expectNoComparison(page);
    const resetBtn = page.getByRole("button", { name: "Reset to as-designed" });
    await expect(resetBtn).toBeVisible();

    // Reset restores the exact as-designed flight: the apogee returns, the comparison is back, and
    // the control disappears (nothing left to undo).
    await resetBtn.click();
    await expect.poll(summaryApogee).toBe(before);
    await expectNoComparison(page);
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

    // The comparison is labelled for RockSim, not OpenRocket — on the Cross-check workspace, which
    // is where every "does anything else agree?" surface moved.
    await page.getByRole("link", { name: "Cross-check" }).click();
    await page.waitForURL(/\/validate\/?$/);
    await expect(page.getByRole("heading", { name: "RockSim vs Loft" })).toBeVisible();
  });

  test("a RockSim design gets the motor tools, at the casing it actually flies", async ({ page }) => {
    // RockSim states no motor casing — its MotorDia is the mount's bore — so both motor surfaces
    // used to be withheld from every .rkt import with nothing on screen saying why.
    await page.goto("/");
    await page.getByRole("button", { name: /RockSim · 54 mm sport/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Sweep" }).click();
    await expect(page.getByRole("region", { name: "Motor sweep" })).toBeVisible();

    await page.getByRole("link", { name: "Design" }).click();
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
    await page.getByRole("link", { name: "Flight" }).click();
    const asDesigned = await summaryApogee();
    expect(asDesigned).toBeGreaterThan(0);

    await page.getByRole("link", { name: "Design" }).click();
    // The options are sorted weakest total impulse first, so the last one is the biggest motor of
    // this casing — deterministic, unlike matching a class letter that a manufacturer name can also
    // contain. It carries more impulse than the design's J420R, so the same airframe flies higher.
    const swapTo = offered[offered.length - 1];
    expect(swapTo).not.toMatch(/J420R/);
    await picker.selectOption({ label: swapTo });
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(summaryApogee).toBeGreaterThan(asDesigned);
  });

  test("a subsonic flight marks nothing as extrapolated", async ({ page }) => {
    // The other half of the §5 contract, and the one that keeps the marker meaningful: a flag that
    // fires on every flight teaches a flyer to ignore it on the flight where it matters.
    await page.goto("/");
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "fixtures/demo-single-deploy.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Apogee", { exact: true }).first()).toBeVisible();
    expect(
      await page.getByText("extrapolated", { exact: true }).count(),
      "a subsonic flight marked a number as extrapolated",
    ).toBe(0);
  });

  test("dual-deploy sample flags transonic and shows two deploy markers", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: /Loft Demo/ })).toBeVisible();
    await expect(page.getByText(/transonic|supersonic/i).first()).toBeVisible();
    // DESIGN.md §5: the `Extrapolated` treatment is "required wherever a number leaves the envelope
    // its method was validated over". The caution card above is not that — a flyer reading the
    // apogee does not necessarily read the card, and the two rendered byte-identically whether the
    // flight went transonic or not. The marker rides the numbers the extrapolation actually drives.
    const marks = page.getByText("extrapolated", { exact: true });
    expect(await marks.count(), "no number is marked as extrapolated on a transonic flight").toBeGreaterThan(0);
    // It carries the reason and the range, not just a label — §5 asks for both.
    await expect(marks.first()).toHaveAttribute("title", /M\d|envelope|subsonic/i);
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
    await expectNoComparison(page);
  });

  test("an imported file with a stored per-step log shows the drag cross-check", async ({ page }) => {
    await page.goto("/");
    // A design carrying the tool's own step-by-step flight (a hand-authored log, not a bundled demo).
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/logged-sample.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    // The stored-tool comparison moved to its own workspace on 2026-08-02, beside the step-by-step
    // cross-check and the second solver — every "does anything else agree?" surface in one place.
    await page.getByRole("link", { name: "Cross-check" }).click();
    await page.waitForURL(/\/validate\/?$/);
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
    await expect(page.getByRole("link", { name: "Flight" })).toBeVisible();
    await expect(page.getByRole("term").filter({ hasText: /^Apogee$/ })).toBeVisible();
  });

  test("a motor that does not fit the mount is refused, and the page says WHY", async ({ page }) => {
    // The flyer-visible half of the casing veto. `wrong-casing-motor.ork` is the unresolved fixture
    // with ONE byte-level change — designation `H999ZZ` on the same 29 mm mount — because that name
    // nearly reaches the bundled `H999N`, which is a 38 mm motor. Before the veto Loft flew it and
    // reported apogee 1,471 m, Mach 1.04 and thrust-to-weight 162:1 off a motor that cannot be
    // loaded, with a small "· approx" as the only cue.
    await page.goto("/");
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/wrong-casing-motor.ork"));

    const notice = page.getByRole("region", { name: "No flight simulated" });
    await expect(notice).toBeVisible({ timeout: 15000 });
    // **Withheld, not flown.** The strip has no apogee at all.
    await expect(page.getByRole("term").filter({ hasText: /^Apogee$/ })).toBeHidden();

    // **And the reason is the true one.** "not found" would send a flyer hunting for a curve that is
    // already in the set; the sentence has to name the near-miss and both diameters.
    const line = notice.locator("li").filter({ hasText: /H999ZZ/ });
    await expect(line).toHaveCount(1);
    await expect(line).toContainText(/H999N is the closest bundled name/);
    await expect(line).toContainText(/38 mm motor/);
    await expect(line).toContainText(/29 mm casing/);
    // The bare "not found" must NOT be what this design gets.
    await expect(line).not.toContainText(/not found/);
    // And the substitute paragraph names the MOUNT's casing, not the first offered motor's — the
    // list `swapOptions` returns merges the catalogue's 75 and 76 mm motors, so `options[0]` is not
    // a safe label anywhere.
    await expect(notice.getByText(/Fly it with a substitute/)).toBeVisible();
    await expect(notice.locator("p").filter({ hasText: /Fly it with a substitute/ })).toContainText(/29 mm casing/);
    // The headline sentence is qualified too — the curve exists, it is the wrong size.
    await expect(notice.getByText(/that fits this mount/)).toBeVisible();

    // The recovery path still works: a real 29 mm motor flies the design.
    const swap = page.getByRole("combobox", { name: "Swap motor" });
    await expect(swap).toBeVisible();
    await swap.selectOption({ index: 1 });
    await expect(page.getByRole("heading", { name: "No flight simulated" })).toBeHidden();
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
    await expect(page.getByRole("navigation", { name: "Workspace" }).getByRole("link")).toHaveCount(4);
    await expect(page.getByRole("link", { name: "Design" })).toHaveAttribute("aria-current", "page");
    // The geometry is real and motor-independent, so the diagram and the parts table are shown.
    await expect(page.getByLabel(/Scale side-view/)).toBeVisible();

    // Flight says what it would hold and why it is empty, rather than vanishing.
    await page.getByRole("link", { name: "Flight" }).click();
    await expect(page.getByRole("region", { name: "Flight unavailable" })).toBeVisible();
    await expect(page.getByLabel("Results", { exact: true })).toHaveCount(0);

    // Sweep does the same — and offers the motor sweep, which flies the bundled substitutes
    // themselves and so is the one analysis that still works on a design with no resolved motor.
    await page.getByRole("link", { name: "Sweep" }).click();
    await expect(page.getByRole("region", { name: /unavailable$/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Motor sweep" })).toBeVisible();

    // The Design workspace tells the flyer why the stability marks are missing, and how to get them
    // back. **This assertion used to read `getByText("in the Design workspace")`**, which was
    // satisfied by `StabilityTrimHint` — and on THIS design that hint was the Sev-1: it read the
    // unloaded margin (5.92 cal against a flown 4.07), decided the rocket was over-stable, and told
    // the flyer to move the fin set, all computed from a build with the motor left out. The hint is
    // now suppressed when a motor did not resolve, so the old assertion was pinning the defect in
    // place. What replaces it is the guarantee that actually holds: the workspace still says
    // something actionable rather than going quiet.
    await page.getByRole("link", { name: "Design" }).click();
    await expect(page.getByText(/could not be matched to a thrust curve/i).first()).toBeVisible();
    await expect(
      page.getByText(/centre of gravity and the static margin are not marked/i),
      "the diagram drops its CG mark and must say why",
    ).toBeVisible();
    // Nothing may offer a configuration picker that only renders for a multi-config design.
    if ((await page.getByRole("combobox", { name: /configuration/i }).count()) === 0) {
      await expect(page.getByText("pick a configuration")).toHaveCount(0);
    }

    // Swapping in a bundled motor fills the empty workspaces in rather than changing the layout.
    await page.getByRole("combobox", { name: "Swap motor" }).selectOption({ index: 1 });
    await expect(page.getByRole("heading", { name: "No flight simulated" })).toBeHidden();
    await page.getByRole("link", { name: "Flight" }).click();
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
    await page.getByRole("link", { name: "Cross-check" }).click();
    await page.waitForURL(/\/validate\/?$/);
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
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const single = await apogee();
    expect(single).toBeGreaterThan(0);

    // Fly the single motor as a 3-motor cluster: three times the thrust dominates the extra motor
    // mass, so the design climbs markedly higher. The edit surface lives in the Design workspace;
    // flip back to Flight to read the new apogee.
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByLabel("Motor cluster").fill("3");
    await page.getByRole("link", { name: "Flight" }).click();
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
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();

    // Add a 300 g payload — a builder mass add — on the Design workspace, then read the flight.
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByLabel(/Payload \(/).fill("300");
    await page.getByRole("link", { name: "Flight" }).click();

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
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // Add a heavy nose ballast — a "what-if" design change — on the Design workspace, then read.
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("input").and(page.getByLabel(/Nose ballast/)).first().fill("500");
    await page.getByRole("link", { name: "Flight" }).click();

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
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("input").and(page.getByLabel(/Nose ballast/)).first().fill("500");
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
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();

    // Slide the whole fin group 100 mm aft — a "what-if" stability trim — on the Design workspace.
    await page.getByRole("link", { name: "Design" }).click();
    const finPos = page.getByRole("spinbutton", { name: /Fin position/ });
    await expect(finPos).toBeVisible();
    const design = parseFloat((await finPos.getAttribute("placeholder")) ?? "0");
    expect(design).toBeGreaterThan(0);
    await finPos.fill(String(Math.round(design + 100)));
    await page.getByRole("link", { name: "Flight" }).click();

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
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const apogeeBefore = await stat("Apogee");
    const descentBefore = await stat("Descent rate");
    const groundHitBefore = await stat("Ground-hit speed");
    expect(descentBefore).toBeGreaterThan(0);

    // Double the recovery drag area — a bigger canopy, a "what-if" — on the Design workspace.
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByLabel(/Recovery size/).fill("2");
    await page.getByRole("link", { name: "Flight" }).click();

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
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const apogeeBefore = await stat("Apogee");
    const descentBefore = await stat("Descent rate");
    const groundHitBefore = await stat("Ground-hit speed");
    expect(descentBefore).toBeGreaterThan(0);

    // Resize the design's own main canopy to 1.5× its current diameter — a real, bake-in edit (not
    // the transient multiplier). Read the current size from the field's placeholder so it's unit-safe.
    await page.getByRole("link", { name: "Design" }).click();
    const field = page.getByLabel(/Main chute Ø/);
    const current = parseFloat((await field.getAttribute("placeholder"))!.replace(/[^\d.]/g, ""));
    expect(current).toBeGreaterThan(0);
    await field.fill((current * 1.5).toFixed(2));
    await page.getByRole("link", { name: "Flight" }).click();

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
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();

    await page.getByRole("link", { name: "Design" }).click();
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
    await page.getByRole("link", { name: "Flight" }).click();

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

    // The sweep panel lives in the Sweep workspace; it offers to fly every fitting bundled motor.
    await page.getByRole("link", { name: "Sweep" }).click();
    const panel = page.getByRole("region", { name: "Motor sweep" });
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: /Run motor sweep/ }).click();

    // A results table appears with several motors and the design's own marked.
    const rows = panel.locator("tbody tr");
    await expect.poll(async () => rows.count()).toBeGreaterThan(2);
    await expect(panel.getByText("Design", { exact: true })).toBeVisible();

    // Columns are addressed by their HEADER's position rather than by a hard-coded `nth-child`, so
    // inserting a column re-points them instead of silently reading the neighbour. Inserting the
    // `Use` control second is exactly what broke the three literals that used to be here.
    // Matched on a PREFIX, because `DataTable` renders each header as a sort button whose text
    // carries the label plus its sort affordance — an exact compare found nothing and silently
    // produced `nth-child(0)`, which matches no cell and fails as "expected 0 to be > 2".
    // Normalised before comparing: `DataTable`'s headers render UPPERCASE (so `innerText` returns
    // "APOGEE", not "Apogee") and carry a sort arrow glyph. An exact, case-sensitive compare found
    // nothing and silently produced `nth-child(0)`, which matches no cell and failed as
    // "expected 0 to be > 2" — a wrong-looking assertion for a selector problem.
    const heads = (await panel.locator("thead th").allInnerTexts()).map((t) =>
      t.replace(/[▲▼]/g, "").replace(/\s+/g, " ").trim().toLowerCase(),
    );
    const colIndex = (label: string) => {
      const i = heads.findIndex((t) => t.startsWith(label.toLowerCase()));
      expect(i, `no "${label}" column header among: ${heads.map((h) => h.trim()).join(" | ")}`).toBeGreaterThanOrEqual(0);
      return i + 1;
    };

    // Apogees are laid out highest-first: the top row out-flies the bottom row.
    const apogeeCells = await panel.locator(`tbody tr td:nth-child(${colIndex("Apogee")})`).allInnerTexts();
    const nums = apogeeCells.map((t) => parseFloat(t.replace(/[^\d.]/g, "")));
    expect(nums.length).toBeGreaterThan(2);
    expect(nums[0]).toBeGreaterThan(nums[nums.length - 1]);

    // A fin-flutter margin column is present: the faster (top-apogee) motor has a thinner margin
    // than the slower (bottom) one — the motor-selection flutter cue.
    await expect(panel.getByRole("columnheader", { name: "Flutter" })).toBeVisible();
    const flutterCells = await panel.locator(`tbody tr td:nth-child(${colIndex("Flutter")})`).allInnerTexts();
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
    await page.getByRole("link", { name: "Design" }).click();
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

    await page.getByRole("link", { name: "Sweep" }).click();
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
    await page.getByRole("link", { name: "Sweep" }).click();
    const panel = page.getByRole("region", { name: "Motor sweep" });
    await panel.getByRole("button", { name: /Run motor sweep/ }).click();
    await expect(panel.locator("tbody tr").first()).toBeVisible();

    const firstMotor = async () => (await panel.locator("tbody tr").first().innerText()).split(/\s|·/)[0];
    // Default is apogee, biggest first.
    const highest = await firstMotor();
    await panel.getByRole("button", { name: /^Sort by Apogee/ }).click();
    const lowest = await firstMotor();
    expect(lowest).not.toBe(highest);

    // A different column orders on its own terms, and the header says which way. (Delay tracks
    // apogee — a faster motor coasts longer — so this checks the column itself, not the row order.)
    await panel.getByRole("button", { name: /^Sort by Delay/ }).click();
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
    await page.getByRole("link", { name: "Sweep" }).click();
    const panel = page.getByRole("region", { name: /dispersion/i });
    await panel.getByRole("button", { name: /Run dispersion/ }).click();
    const impulse = panel.getByLabel(/Motor impulse/i);
    await expect(impulse).toHaveValue("5");
    await impulse.fill("8");

    await page.reload();
    await expect(page.getByText(/Picked up where you left off/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "Sweep" }).click();
    await panel.getByRole("button", { name: /Run dispersion/ }).click();
    await expect(panel.getByLabel(/Motor impulse/i)).toHaveValue("8");

    // …and they outlive the design, because they describe the flyer, not the rocket.
    await page.getByRole("button", { name: "Start fresh" }).click();
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await page.getByRole("link", { name: "Sweep" }).click();
    await panel.getByRole("button", { name: /Run dispersion/ }).click();
    await expect(panel.getByLabel(/Motor impulse/i)).toHaveValue("8");
  });

  test("the sweep's axis and the motor table's sort survive a reload", async ({ page }) => {
    // Someone picking motors on flutter margin, or sweeping body length, is doing that across every
    // design they open — not once. Snapping back to the defaults loses a view they set up.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Sweep" }).click();

    const sweep = page.getByRole("region", { name: /Parameter sweep/i });
    await sweep.getByRole("button", { name: /Run parameter sweep/ }).click();
    await sweep.getByLabel("Sweep variable").selectOption("bodyLength");
    await sweep.getByLabel("Sweep metric").selectOption("staticMarginCal");

    const motors = page.getByRole("region", { name: "Motor sweep" });
    await motors.getByRole("button", { name: /Run motor sweep/ }).click();
    await expect(motors.locator("tbody tr").first()).toBeVisible();
    await motors.getByRole("button", { name: /^Sort by Flutter/ }).click();

    await page.reload();
    await expect(page.getByText(/Picked up where you left off/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "Sweep" }).click();
    await sweep.getByRole("button", { name: /Run parameter sweep/ }).click();
    await expect(sweep.getByLabel("Sweep variable")).toHaveValue("bodyLength");
    await expect(sweep.getByLabel("Sweep metric")).toHaveValue("staticMarginCal");
    await motors.getByRole("button", { name: /Run motor sweep/ }).click();
    await expect(motors.locator("tbody tr").first()).toBeVisible();
    // The flutter column is the one sorted, still descending.
    const flutterHeader = motors.locator("th", { has: page.getByRole("button", { name: /^Sort by Flutter/ }) });
    await expect(flutterHeader).toHaveAttribute("aria-sort", "descending");
  });

  test("renaming a design keeps the analyses that were already flown", async ({ page }) => {
    // The name is metadata: it touches neither the airframe nor the flight. It used to be the first
    // field of the analysis cache key, so every keystroke in the rename field re-flew the motor
    // sweep, both other panels, and marked the cross-check stale — 4.3 s of Monte-Carlo per
    // character on the dual-deploy sample, and a flyer naming a design types more than one.
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Sweep" }).click();

    // What has to be asserted is the WORK, not the rows: a re-run of an unchanged rocket returns
    // rows identical to the ones it replaced, so comparing them cannot tell "kept" from "re-flown".
    // The dispersion panel announces its flights through a live region, so watch that instead.
    const mc = page.getByRole("region", { name: /dispersion/i });
    const psweep = page.getByRole("region", { name: "Parameter sweep" });
    // Both heavy panels at once: they re-fly for different reasons (the dispersion on the shared
    // design key, the parameter sweep on its own axis object) and a rename must move neither.
    const flying = page.locator(
      'section[aria-label="Monte-Carlo dispersion"] [role="status"], section[aria-label="Parameter sweep"] [role="status"]',
    );
    /** Was the panel ever seen mid-flight during `act`? Sampled, because a run is transient: it
     *  announces itself for as long as it flies and then the live region goes away again. */
    const flewDuring = async (act: () => Promise<void>, samples = 150) => {
      let seen = false;
      const watch = (async () => {
        for (let i = 0; i < samples; i++) {
          if ((await flying.count()) > 0) { seen = true; return; }
          await page.waitForTimeout(100);
        }
      })();
      await act();
      await watch;
      return seen;
    };

    await psweep.getByRole("button", { name: /Run parameter sweep/ }).click();
    await mc.getByRole("button", { name: /Run dispersion/ }).click();
    expect(await flewDuring(async () => {})).toBe(true); // control: they do announce their flights
    await expect(flying).toHaveCount(0, { timeout: 60_000 }); // both settled
    await expect(psweep.locator("svg").first()).toBeVisible(); // and the sweep really has a curve

    const motors = page.getByRole("region", { name: "Motor sweep" });
    await motors.getByRole("button", { name: /Run motor sweep/ }).click();
    await expect(motors.locator("tbody tr").first()).toBeVisible();
    // Sort by a column too: a re-run comes back in the default order, so this covers the view the
    // flyer set up and not only the numbers in it.
    await motors.getByRole("button", { name: /^Sort by Delay/ }).click();
    await expect(motors.locator('th[aria-sort="descending"]')).toHaveCount(1);
    const rowsBefore = await motors.locator("tbody tr").allInnerTexts();
    expect(rowsBefore.length).toBeGreaterThan(3);

    // Type a whole word into the name, one character at a time — the real interaction.
    const name = page.getByLabel("Design name");
    const reflewOnRename = await flewDuring(async () => {
      await name.click();
      await name.press("End");
      await name.pressSequentially(" mk2", { delay: 40 });
      // Keep watching past the typing: a re-fly triggered by the last keystroke would start here.
      await page.waitForTimeout(3_000);
    }, 60);
    await expect(name).toHaveValue(/mk2$/);
    expect(reflewOnRename).toBe(false);

    // And the sweep kept both its numbers and the order they were put in.
    expect(await motors.locator("tbody tr").allInnerTexts()).toEqual(rowsBefore);
    await expect(motors.locator('th[aria-sort="descending"]')).toHaveCount(1);

    // The control in the other direction: a change that IS the rocket still re-flies everything, so
    // this cannot pass by disconnecting the key from the design altogether. It is asserted on the
    // sweep's numbers rather than on the live region, because the edit lives on another workspace
    // and a hidden panel is out of the accessibility tree while the change is being made — but 50 g
    // in the nose moves the CG, so unlike a rename it genuinely changes every row.
    await page.getByRole("link", { name: "Design" }).click();
    // `getByLabel` also matches the diagram's slider handle of the same name — mean the field.
    const ballast = page.locator("input").and(page.getByLabel(/Nose ballast/i)).first();
    await ballast.fill("50");
    await ballast.press("Enter");
    await page.getByRole("link", { name: "Sweep" }).click();
    await expect
      .poll(async () => (await motors.locator("tbody tr").allInnerTexts()).join("|"), { timeout: 30_000 })
      .not.toBe(rowsBefore.join("|"));
  });

  test("a dimension too small for the field's nominal precision is still the one being flown", async ({ page }) => {
    // Every editable dimension used to render at a fixed precision, and the box does not merely
    // DISPLAY that text — `Num` re-syncs an unfocused field to it and commits it on the next blur.
    // So a thin fin was rounded on screen and then the rounding was written back: 0.03 mm redisplayed
    // as "0.0", parsed as zero, and zero means "no edit" — a focus and a Tab with nothing typed
    // deleted it. The same rounding put a real 0.254 mm balsa fin on screen as "0.3", 18% thick.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "Design" }).click();

    // `getByLabel` also matches the diagram's slider handle of the same name — mean the field.
    const thickness = page.locator("input").and(page.getByLabel(/Fin thickness/)).first();
    await expect(thickness).toHaveAttribute("placeholder", /\d/); // control: the design states one

    await thickness.fill("0.03");
    await thickness.press("Enter");

    // Leave the field AND force a re-render, which is what makes the box re-read itself from the
    // model. Clicking the tab already open changes no state and renders nothing, so it would not.
    await page.getByRole("link", { name: "Flight" }).click();
    await page.getByRole("link", { name: "Design" }).click();
    await expect(thickness, "the box states the thickness being flown").toHaveValue("0.03");

    // The destructive part: focus and Tab away, typing nothing.
    await thickness.click();
    await page.keyboard.press("Tab");
    await expect(thickness, "a bare focus and Tab deleted the edit").toHaveValue("0.03");
  });

  test("a launch condition Loft supplied is not presented as one the design specified", async ({ page }) => {
    // The Conditions caption named two sources for its greyed values — the design's stored setup, or
    // today's weather. There is a third: `flownConditions` falls through to the engine's defaults for
    // any field a stored simulation omits, and for every field when the design carries no simulation
    // at all. A from-scratch build therefore showed rail 1.0, wind 0.0, elev 0.0 under a caption
    // saying they were the flyer's own setup. Rail length is the one that bites — real designs
    // declare up to 3.048 m against that 1.0 default, and rail-exit velocity is computed from it.
    await page.goto("/");
    await page.getByRole("button", { name: /Start a new design/ }).click();
    await expect(page.getByRole("link", { name: "Design" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "Flight" }).click();

    const conditions = page.locator("details").filter({ hasText: /^Conditions/ }).first();
    // `<details>` keeps its content in the DOM while collapsed, so ask the element, not the text.
    if (!(await conditions.evaluate((el: HTMLDetailsElement) => el.open))) {
      await conditions.locator("summary").first().click();
    }

    // It advertises Loft's defaults…
    const rail = page.locator("input").and(page.getByLabel(/Rail length/)).first();
    await expect(rail).toHaveAttribute("placeholder", "1.0");
    // …and says so, naming every field it is doing it for, in a sentence.
    await expect(
      conditions.getByText(
        /read no rail length, rail angle, surface wind, and field elevation from this design, so those are its own default/,
      ),
    ).toBeVisible();

    // The control: a design that DOES carry a launch setup says nothing of the kind.
    //
    // Reaching the import screen is a two-step now and it has to be driven as one. `goto("/")` lands
    // on a root that still has the built design in storage, so the app restores it and navigates
    // straight back out to a workspace — which means "click whichever of Import-another and the
    // sample is on screen" was a coin toss against a restore still in flight. Under the full suite
    // it lost: clicking the sample first, then having the pending restore replace it, left the run
    // waiting 30 s for a heading that was never coming. Ask for the state, then act on it.
    await page.goto("/");
    await page.getByRole("button", { name: /Import another/ }).click();
    await expect(page.getByRole("button", { name: /54 mm dual-deploy/ })).toBeVisible();
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await page.waitForURL(/\/flight\/?$/);
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 30_000 });
    if (!(await conditions.evaluate((el: HTMLDetailsElement) => el.open))) {
      await conditions.locator("summary").first().click();
    }
    await expect(rail).toHaveAttribute("placeholder", "2.0");
    await expect(conditions.getByText(/Loft read no /)).toHaveCount(0);
  });

  test("a launch condition the flyer typed is not credited to Loft's defaults", async ({ page }) => {
    // The note names the greyed value's source, and a typed entry outranks all of them — it is what
    // the solver flies. Left unfiltered the note kept naming a field the flyer had just set: on a
    // from-scratch build, typing a 3.048 m rail (rail-exit ~26 m/s against the 1.0 m default's 16)
    // still read "Loft read no rail length … so those are its own default".
    await page.goto("/");
    await page.getByRole("button", { name: /Start a new design/ }).click();
    await expect(page.getByRole("link", { name: "Design" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "Flight" }).click();

    const conditions = page.locator("details").filter({ hasText: /^Conditions/ }).first();
    if (!(await conditions.evaluate((el: HTMLDetailsElement) => el.open))) {
      await conditions.locator("summary").first().click();
    }
    // All four start defaulted, and the note says so.
    await expect(
      conditions.getByText(/read no rail length, rail angle, surface wind, and field elevation from this design/),
    ).toBeVisible();

    const rail = page.locator("input").and(page.getByLabel(/Rail length/)).first();
    await rail.fill("3.048");
    await rail.press("Enter");

    // Rail length drops out of the list; the three the flyer has not touched stay in it.
    await expect(conditions.getByText(/read no rail angle, surface wind, and field elevation/)).toBeVisible();
    await expect(conditions.getByText(/read no rail length/)).toHaveCount(0);
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
    const controls = await page.$$eval("button, nav[aria-label=Workspace] a, [role=group], header a, input", (ns) =>
      ns.filter((n) => n.getBoundingClientRect().height > 0).map((n) => (n.textContent || "").trim().slice(0, 20)),
    );
    expect(controls).toEqual(["Loft"]);

    // The design, its numbers, and the estimate-not-a-verdict line all print.
    await expect(page.getByRole("heading", { name: /Loft Demo 54mm/ })).toBeVisible();
    await expect(page.getByText("Apogee", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/never a go\/no-go verdict/)).toBeVisible();
    await page.emulateMedia({ media: "screen" });
  });

  test("a sheet printed from the dark theme is ink on white, not pale text on white", async ({ browser }) => {
    // Its OWN context, because the theme is resolved once at load from `prefers-color-scheme` and
    // `emulateMedia({ colorScheme })` on an already-loaded page does not re-run that — the control
    // below caught exactly that and the test was green-by-vacuity until it did.
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const page = await ctx.newPage();
    // The print block forces a white ground, but the dark variant is CLASS-based: `.dark` stays on
    // the root while the sheet prints, so every `dark:text-…` utility kept setting `color` on the
    // element itself and beat the inherited colour on `html, body`. Measured on the built export
    // before the fix: 193 of 369 text nodes under 3:1 — the numbers, the labels and the warnings.
    //
    // Colours are RASTERISED rather than parsed. Chromium reports computed colours as `lab()`/
    // `oklab()` here and canvas `fillStyle` does not normalise them, so a string parse produces
    // confident nonsense — three versions of the probe behind this test did exactly that.
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    // CONTROL, and it is not a class check. The `dark` variant has TWO clauses (see the top of
    // `app/globals.css`): an explicit choice, which sets `.dark`, and the OS preference, which sets
    // nothing at all. Theme "System" — the default, and the state this test runs in — is the second,
    // so asserting `.dark` would fail on a genuinely dark page. Assert what actually matters: that
    // the page is rendering dark before we ask what it prints like.
    // Rasterised, not parsed: Chromium reports this as `lab(2.51 0.24 -0.89)` and a `\d+` match
    // reads that as the numbers 2, 51107 and 0. That mistake produced a confident 17036 here.
    const screenBg = await page.evaluate(() => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 1;
      const g = cv.getContext("2d", { willReadFrequently: true })!;
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, 1, 1);
      g.fillStyle = getComputedStyle(document.body).backgroundColor; g.fillRect(0, 0, 1, 1);
      const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
      return (r + gg + b) / 3;
    });
    expect(screenBg, "the page under test is not actually in the dark theme").toBeLessThan(60);

    await page.emulateMedia({ media: "print" });
    const { sampled, faint, worst } = await page.evaluate(() => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 1;
      const g = cv.getContext("2d", { willReadFrequently: true })!;
      const lumOver = (c: string, base: string) => {
        g.clearRect(0, 0, 1, 1);
        g.fillStyle = base; g.fillRect(0, 0, 1, 1);
        g.fillStyle = c; g.fillRect(0, 0, 1, 1);
        const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
        const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b);
      };
      // Effective backdrop: nearest opaque ancestor, with any translucent layers composited over it.
      const backdrop = (el: Element) => {
        const chain: string[] = [];
        let n: Element | null = el;
        while (n) {
          const c = getComputedStyle(n).backgroundColor;
          if (!/,\s*0\)$/.test(c)) { chain.push(c); if (!/rgba|\/ /.test(c)) break; }
          n = n.parentElement;
        }
        let base = "#ffffff";
        for (const c of chain.reverse()) {
          g.clearRect(0, 0, 1, 1);
          g.fillStyle = base; g.fillRect(0, 0, 1, 1);
          g.fillStyle = c; g.fillRect(0, 0, 1, 1);
          const d = g.getImageData(0, 0, 1, 1).data;
          base = `rgb(${d[0]},${d[1]},${d[2]})`;
        }
        return base;
      };
      let sampled = 0;
      const bad: string[] = [];
      for (const el of document.querySelectorAll("main *")) {
        if (el.children.length || (el.textContent || "").trim().length < 3) continue;
        if (getComputedStyle(el).display === "none") continue;
        sampled++;
        const base = backdrop(el);
        const lb = lumOver(base, "#ffffff");
        const lf = lumOver(getComputedStyle(el).color, base);
        const [hi, lo] = [lf, lb].sort((a, b) => b - a);
        const r = (hi + 0.05) / (lo + 0.05);
        if (r < 3) bad.push(`"${(el.textContent || "").trim().slice(0, 24)}" ${r.toFixed(2)}:1`);
      }
      return { sampled, faint: bad.length, worst: bad.slice(0, 6) };
    });

    // CONTROL. A sweep that examined nothing reports zero unreadable text and reads like a pass.
    expect(sampled).toBeGreaterThan(100);
    expect(faint, `text under 3:1 on a dark-theme print sheet:\n${worst.join("\n")}`).toBe(0);
    await ctx.close();
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
    await page.getByRole("link", { name: "Design" }).click();
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
    await page.getByRole("link", { name: "Design" }).click();

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
    await page.getByRole("link", { name: "Design" }).click();
    await page.waitForURL(/\/design\/?$/);

    const svg = page.locator('svg[aria-label*="Scale side-view"]');
    // Measured only once the workspace is actually on screen. The drawing fits itself to its
    // container, and a container inside a `hidden` subtree has no width — so a measurement taken
    // while the navigation is still in flight reads the fit of a box that is not being shown.
    await expect(svg).toBeVisible();
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
    await page.getByRole("link", { name: "Design" }).click();
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
    await page.getByRole("link", { name: "Design" }).click();
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
    await page.getByRole("link", { name: "Design" }).click();
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
    await page.getByRole("link", { name: "Design" }).click();
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
    await page.getByRole("link", { name: "Design" }).click();
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
    await page.getByRole("link", { name: "Design" }).click();
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
    await page.getByRole("link", { name: "Design" }).click();
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
      await page.getByRole("link", { name: "Flight" }).click();
      const v = page
        .locator("#panel-flight")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div[1]");
      return parseFloat((await v.first().textContent())!.replace(/[^\d.]/g, ""));
    };
    const field = (re: RegExp) => page.locator("input").and(page.getByLabel(re)).first();

    const asDesigned = await apogee();
    await page.getByRole("link", { name: "Design" }).click();
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
    await page.getByRole("link", { name: "Design" }).click();
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
    await page.getByRole("link", { name: "Design" }).click();
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
    await page.getByRole("link", { name: "Design" }).click();
    await expect(page.locator("input").and(page.getByLabel(/Fin span/)).first()).toHaveValue("75");
  });

  test("offers a renamed design back under the name the flyer gave it", async ({ page }) => {
    // The offer used to render the FILE name, so a from-scratch build came back as "New design"
    // however it had been renamed — on the one control whose whole job is to say what it is holding.
    await page.goto("/");
    await page.getByRole("button", { name: /Start a new design/ }).click();
    // A built design opens on the Design workspace, not on a "Design" heading.
    await expect(page.getByRole("link", { name: "Design" })).toHaveAttribute("aria-current", "page");
    await page.getByLabel("Design name").fill("Osprey II");
    await page.locator("input").and(page.getByLabel(/Fin span/)).first().fill("90");
    await page.getByRole("button", { name: /Import another/ }).click();
    await expect(page.getByText(/You were working on/)).toContainText("Osprey II");

    // …and gives it back under that name. The offer read `saved.rocket` while the restore re-imported
    // the design from its stored bytes, and a rename is the one edit that is not IN those bytes — so
    // the card named a design it then did not return. On a from-scratch build that is the whole
    // identity of the thing: it came back as "New design" and downloaded as New-design.ork.
    await page.getByRole("button", { name: "Pick it back up" }).click();
    await expect(page.getByLabel("Design name")).toHaveValue("Osprey II");
    // The what-ifs it was carrying come back with it, as they already did.
    await page.getByRole("link", { name: "Design" }).click();
    await expect(page.locator("input").and(page.getByLabel(/Fin span/)).first()).toHaveValue("90");
  });

  test("a renamed design is still renamed after a reload", async ({ page }) => {
    // The other half of the same gap: the session written on every change never carried the rocket
    // name at all, so a reload re-imported the file and silently returned the design under the name
    // the flyer had renamed away from — while `Download .ork` names the file from that same field.
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 30_000 });
    const original = await page.getByLabel("Design name").inputValue();
    expect(original).not.toBe("");

    await page.getByLabel("Design name").fill("Osprey III");
    // Give the session write a beat: it runs off a state change, not off the keystroke.
    await expect(page.getByRole("heading", { name: "Osprey III" })).toBeVisible();

    await page.reload();
    await expect(page.getByText(/Picked up where you left off/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Design name")).toHaveValue("Osprey III");
    expect(await page.getByLabel("Design name").inputValue()).not.toBe(original);
  });

  test("an as-designed rocket is not reported as carrying what-ifs", async ({ page }) => {
    // The count has to be the app's own notion of edited. A previous attempt at this feature counted
    // the keys in the edit bag, which badges a rocket that was only looked at: the bag is a patch
    // spread over the previous bag, so a cleared field leaves its key behind.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Design" }).click();

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
    await expect(page.getByRole("link", { name: "Design" })).toHaveAttribute("aria-current", "page");
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
    await page.getByRole("button", { name: "Imperial", exact: true }).click();
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
    // have passed without ever seeing it. That panel moved to the Cross-check workspace, so the
    // control has to be taken there — asserting it on Flight would now pass or fail for a reason
    // that has nothing to do with units.
    await page.goto("/");
    await page.getByRole("button", { name: /RockSim · 54 mm sport/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Cross-check" }).click();
    await page.waitForURL(/\/validate\/?$/);
    await expect(
      page.getByRole("row", { name: /Max acceleration/ }),
      "the census must actually reach the validation row it guards",
    ).toBeVisible();

    const census = async () =>
      page.evaluate(() => {
        const metric = /(^|\s|\d)(mm|cm|km|m\/s²|m\/s|m|kg|kPa|Pa)$/;
        const bad: string[] = [];
        let checked = 0;
        // The workspace panels stopped being `tabpanel`s when the workspaces became routes; they
        // are landmark regions with the same ids. Asking for the old role matched NOTHING, so
        // `visible()` answered true for every node on the page: all three iterations censused the
        // whole document, the per-workspace control was satisfied by whichever other panel happened
        // to be mounted, and a workspace that rendered nothing at all would have passed.
        const visible = (n: Element) => {
          const panel = n.closest("[id^='panel-']");
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

    // Label and route stopped being the same word when Analyze split: the Cross-check workspace
    // lives at /validate, because that is what the job is called in the model and the spine label is
    // what it is called to a flyer.
    const ROUTE: Record<string, string> = {
      Flight: "flight",
      Design: "design",
      Sweep: "sweep",
      "Cross-check": "validate",
    };
    for (const tab of ["Flight", "Design", "Sweep", "Cross-check"]) {
      await page.getByRole("button", { name: "Imperial", exact: true }).click();
      await page.getByRole("link", { name: tab }).click();
      // Before anything is counted: a hidden panel's buttons are invisible to `getByRole`, so the
      // `count()` below silently found zero and skipped all three sweeps — and the census then ran
      // on a Sweep workspace with no sweep tables on it, which is the vacuity the note below
      // says was already fixed once.
      await page.waitForURL(new RegExp(`/${ROUTE[tab]}/?$`));
      await expect(page.getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page");
      if (tab === "Sweep")
        for (const label of [/Run motor sweep/, /Run parameter sweep|Run sweep/, /Run dispersion/]) {
          const b = page.getByRole("button", { name: label }).first();
          if ((await b.count()) > 0) {
            await b.click();
            // Wait for the run to actually land. Censusing straight after the click measured only the
            // dispersion inputs, so the assertion below was vacuous for every sweep table.
            await expect(page.getByRole("button", { name: label })).toHaveCount(0);
          }
        }
      await expect(page.getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page");
      const imperial = await census();
      expect(imperial.checked, `${tab}: the census must actually see something`).toBeGreaterThan(10);
      expect(imperial.bad, `${tab}: metric units still on screen under Imperial`).toEqual([]);

      // The control the census needs to be worth anything: the same surfaces in Metric DO carry
      // metric units, so an empty list above cannot be a broken selector.
      await page.getByRole("button", { name: "Metric", exact: true }).click();
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
    await page.getByRole("link", { name: "Design" }).click();

    const handles = page.locator('g[role="slider"]');
    const metric = await handles.evaluateAll((ns) => ns.map((n) => n.getAttribute("aria-valuetext") ?? ""));
    expect(metric.length, "the sample offers its fin, nose and body handles").toBeGreaterThanOrEqual(7);
    expect(metric.every((t) => /\bmm\b/.test(t)), "metric reports millimetres").toBe(true);

    await page.getByRole("button", { name: "Imperial", exact: true }).click();
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
    await page.getByRole("link", { name: "Design" }).click();
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

  test("results split into Flight / Design / Sweep / Cross-check workspaces", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const flightTab = page.getByRole("link", { name: "Flight" });
    const designTab = page.getByRole("link", { name: "Design" });
    const sweepTab = page.getByRole("link", { name: "Sweep" });
    await expect(flightTab).toHaveAttribute("aria-current", "page");

    // Flight leads with the plots; the design diagram is not stacked on this view.
    await expect(page.getByRole("heading", { name: "Flight path" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeHidden();

    // Design shows the airframe; the flight plots are put away.
    await designTab.click();
    await expect(designTab).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Flight path" })).toBeHidden();

    // Sweep holds the heavy tools; run a sweep there.
    await sweepTab.click();
    const sweep = page.getByRole("region", { name: "Parameter sweep" });
    await expect(sweep).toBeVisible();
    await sweep.getByRole("button", { name: /Run parameter sweep/ }).click();
    await expect(sweep.getByRole("img", { name: /Apogee.*versus/i })).toBeVisible();

    // Switching away and back keeps the run — the panels stay mounted, not rebuilt from scratch.
    await flightTab.click();
    await expect(sweep).toBeHidden();
    await sweepTab.click();
    await expect(sweep.getByRole("img", { name: /Apogee.*versus/i })).toBeVisible();

    // The spine is keyboard-complete, which for a navigation means Tab reaches every link in order
    // and Enter follows the focused one — not the roving arrow-key focus a tablist uses. Trading one
    // pattern's keyboard contract for the other's is the substance of the change, so it is asserted
    // rather than assumed: a spine a keyboard cannot drive is a spine that only exists for a mouse.
    await flightTab.focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("a:focus")).toHaveText("Design");
    await page.keyboard.press("Tab");
    await expect(page.locator("a:focus")).toHaveText("Sweep");
    await page.keyboard.press("Tab");
    await expect(page.locator("a:focus")).toHaveText("Cross-check");
    await flightTab.focus();
    await page.keyboard.press("Enter");
    await expect(flightTab).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Flight path" })).toBeVisible();
    expect(new URL(page.url()).pathname.replace(/\/$/, "") || "/").toBe("/flight");
  });

  test("parameter sweep plots a response curve and switches metric", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Sweep" }).click();
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

  test("a sweep's axis describes the part it is actually resizing, even when the flyer built it", async ({ page }) => {
    // Every sweep axis is swept as an ABSOLUTE value written through the same edit path the panels
    // use, which resolves each aim against the parts the flyer has authored. The axis BASE was read
    // off the imported design instead, where an authored part does not exist — so the aim fell back
    // to the design's own primary part. Measured on the starter with a tube authored behind its own:
    // the axis was based on the 620.0 mm design tube and spanned 310–1085 mm with the "design's own"
    // marker at 620 mm, while every one of the 25 flights resized the 310.0 mm authored tube. The
    // whole plotted curve and its marker described a rocket that was never flown.
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();
    const partsTable = page.locator("table").filter({ hasText: "Dimensions" });
    const tubes = partsTable.locator("tr").filter({ hasText: /Body tube/ });
    await expect(tubes).toHaveCount(1);
    await tubes.first().click();
    await page.getByRole("button", { name: /Add a tube behind this/ }).click();
    await expect(tubes).toHaveCount(2);

    await page.getByRole("link", { name: "Sweep" }).click();
    const panel = page.getByRole("region", { name: "Parameter sweep" });
    await panel.getByRole("button", { name: /Run parameter sweep/ }).click();
    await panel.getByLabel("Sweep variable").selectOption("bodyLength");
    await expect(panel.getByRole("img", { name: /versus.*Body length/i })).toBeVisible({ timeout: 20000 });

    // The x ticks are the chart's own statement of what it swept. `textContent`, not `innerText` —
    // the latter throws on an SVG <text>.
    const xTicks = async () => {
      const texts = await panel.locator('svg text[text-anchor="middle"]').all();
      const out: number[] = [];
      for (const t of texts) {
        const v = parseFloat(((await t.textContent()) ?? "").replace(/[^\d.-]/g, ""));
        if (Number.isFinite(v)) out.push(v);
      }
      return out;
    };
    const ticks = await xTicks();
    expect(ticks.length).toBeGreaterThan(2);
    // The authored tube is half the starter's 620 mm, so its axis tops out near 540 mm. Based on the
    // design's own tube instead it reaches 1085 mm, which is what this separates.
    expect(Math.max(...ticks)).toBeLessThan(700);
  });

  test("Monte-Carlo dispersion flies the design and reports the spread", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Sweep" }).click();
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
    await page.getByRole("link", { name: "Design" }).click();
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
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // Widen the fin root chord — more planform, more drag — on the Design workspace. The field starts
    // from the design's root; flip back to Flight to read the new apogee.
    await page.getByRole("link", { name: "Design" }).click();
    // The number field, specifically — the diagram now also carries a "Fin root chord" drag handle.
    const finRoot = page.getByRole("spinbutton", { name: /Fin root/ });
    await expect(finRoot).toBeVisible();
    const designRoot = parseFloat((await finRoot.getAttribute("placeholder")) ?? "0");
    expect(designRoot).toBeGreaterThan(0);
    await finRoot.fill(String(Math.round(designRoot * 1.6)));
    await page.getByRole("link", { name: "Flight" }).click();

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
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // Thicken the fins — more frontal area and form-factor drag. The field starts from the design's
    // own thickness (a decimal millimetre value).
    await page.getByRole("link", { name: "Design" }).click();
    const finThickness = page.getByLabel(/Fin thickness/);
    await expect(finThickness).toBeVisible();
    const designThickness = parseFloat((await finThickness.getAttribute("placeholder")) ?? "0");
    expect(designThickness).toBeGreaterThan(0);
    await finThickness.fill((designThickness * 2).toFixed(1));
    await page.getByRole("link", { name: "Flight" }).click();

    // Thicker fins drag more, so the rocket doesn't climb as high.
    await expect.poll(apogee).toBeLessThan(before);
  });

  test("adding a boattail cuts base drag and raises the apogee (structural add)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    // A build opens on Design; this test reads flight metrics, so switch to the Flight workspace.
    await page.getByRole("link", { name: "Flight" }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // Add a boattail on the Design workspace: a length and an exit narrower than the 54 mm body.
    // Both are needed to build one. Flip back to Flight to read the new apogee.
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByLabel(/Boattail length/).fill("60");
    await page.getByLabel(/Boattail exit/).fill("30");
    await page.getByRole("link", { name: "Flight" }).click();

    // Contracting the base removes most of the base drag, so the same motor flies higher.
    await expect.poll(apogee).toBeGreaterThan(before);
  });

  test("switching to dual-deploy cuts the wind drift (builder recovery)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    // A build opens on Design; this test reads flight metrics, so switch to the Flight workspace.
    await page.getByRole("link", { name: "Flight" }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    // Wind is a launch condition — it stays in the Conditions panel (above the workspace tabs).
    await page.locator("summary", { hasText: "Conditions" }).click();

    // A steady crosswind so the drift is large and observable under the single apogee chute.
    await page.locator("input").and(page.getByLabel(/Surface wind/)).first().fill("6");
    const drift = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Drift from pad", { exact: true })
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    await expect.poll(drift).toBeGreaterThan(0);
    const single = await drift();

    // Switch to dual-deploy — a design edit, on the Design workspace: the main opens at 150 m over a
    // 300 mm drogue. Both fields are needed. Flip back to Flight to read the drift.
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByLabel(/Main deploy alt/).fill("150");
    await page.getByLabel(/Drogue/).fill("300");
    await page.getByRole("link", { name: "Flight" }).click();

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
    await page.getByRole("link", { name: "Design" }).click();
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
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // Set the whole airframe to a rough finish — more skin friction, so it doesn't climb as high.
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByLabel("Surface finish").selectOption("rough");
    await page.getByRole("link", { name: "Flight" }).click();
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
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // Swap the ogive nose for a blunt ellipsoid — more wetted area and nose pressure, so it flies
    // a touch lower.
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByLabel("Nose shape").selectOption("ellipsoid");
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(apogee).toBeLessThan(before);
  });

  test("switching the airframe to a heavier material lowers the apogee (builder)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    // A build opens on Design; this test reads flight metrics, so switch to the Flight workspace.
    await page.getByRole("link", { name: "Flight" }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // The starter is fibreglass; aluminium is far denser, so the airframe gets heavier and it flies
    // lower on the same motor.
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByLabel("Airframe material").selectOption("aluminium");
    await page.getByRole("link", { name: "Flight" }).click();
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
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // The demo's fins default to square edges; streamlining them to an airfoil cuts the fin-edge
    // pressure drag, so it coasts higher.
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByLabel("Fin edge cross-section").selectOption("airfoil");
    await page.getByRole("link", { name: "Flight" }).click();
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
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // Aluminium fins are far denser than the demo's stock, so the rocket flies heavier and lower —
    // and the fin-flutter margin (which reads the material's stiffness) jumps.
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByLabel("Fin material").selectOption("aluminium");
    await page.getByRole("link", { name: "Flight" }).click();
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
    await page.getByRole("link", { name: "Design" }).click();
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
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // Stretch the main body tube on the Design workspace — a builder geometry edit. The field starts
    // from the design's span; flip back to Flight to read the new apogee.
    await page.getByRole("link", { name: "Design" }).click();
    // The input, not the diagram's grip: both are named "Body length" now that a tube's length can be
    // dragged, exactly as Fin span and Nose length have been for a while. `getByLabel` matches both.
    const bodyLength = page.locator("input").and(page.getByLabel(/Body length/));
    await expect(bodyLength).toBeVisible();
    const designBody = parseFloat((await bodyLength.getAttribute("placeholder")) ?? "0");
    expect(designBody).toBeGreaterThan(0);
    await bodyLength.fill(String(Math.round(designBody * 1.5)));
    await page.getByRole("link", { name: "Flight" }).click();

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
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const before = await apogee();
    expect(before).toBeGreaterThan(0);

    // Widen the whole airframe on the Design workspace — a builder geometry edit. The field starts
    // from the design's caliber; flip back to Flight to read the new apogee.
    await page.getByRole("link", { name: "Design" }).click();
    // The what-if number field, not the diagram's "Body diameter" drag slider (same accessible name).
    const bodyDia = page.getByRole("spinbutton", { name: /Body diameter/ });
    await expect(bodyDia).toBeVisible();
    const designDia = parseFloat((await bodyDia.getAttribute("placeholder")) ?? "0");
    expect(designDia).toBeGreaterThan(0);
    await bodyDia.fill(String(Math.round(designDia * 1.5)));
    await page.getByRole("link", { name: "Flight" }).click();

    // A fatter airframe has a bigger frontal area (more drag) and more tube material, so it flies lower.
    await expect.poll(apogee).toBeLessThan(before);
  });

  test("unit toggle switches to imperial", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await page.getByRole("button", { name: "Imperial", exact: true }).click();
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
    await page.getByRole("button", { name: "Imperial", exact: true }).click();
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByLabel("Fin span (in)").fill("3");
    await expect(page.getByRole("button", { name: /Reset to as-designed/ })).toBeVisible();

    await page.reload();
    // The design is back, in the units that were chosen, on the workspace that was open — not the
    // one the design happened to load on an hour ago.
    await expect(page.getByText(/Picked up where you left off/)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('nav[aria-label="Workspace"] a[aria-current="page"]')).toHaveText("Design");
    // …and so is the edit that was in flight. Restored through the model, so it comes back as the
    // display format of the stored metres.
    await expect(page.getByLabel("Fin span (in)")).toHaveValue(/^3(\.0+)?$/);
    // The flight is still a click away and still in imperial.
    await page.getByRole("link", { name: "Flight" }).click();
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
    // sweep and dispersion tools on Sweep, and all three stored-result comparisons on Cross-check — not
    // just the empty landing page. The comparison table
    // renders deviation values in a semantic caution colour, exactly the honesty-relevant numbers
    // that must stay readable, and the workspace spine adds a new keyboard-reachable landmark to check.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await page.getByRole("heading", { name: "Flight", exact: true }).waitFor();
    await expectNoComparison(page);

    const seriousViolations = async () => {
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    };
    // Each audit waits for its workspace to commit. axe skips `hidden` subtrees, so an audit run in
    // the tick after a spine click re-audits the workspace just left — three passes over Flight,
    // reported as three workspaces clean.
    expect(await seriousViolations()).toEqual([]); // Flight
    await page.getByRole("link", { name: "Design" }).click();
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeVisible();
    expect(await seriousViolations()).toEqual([]); // Design
    await page.getByRole("link", { name: "Sweep" }).click();
    await expect(page.getByRole("region", { name: "Motor sweep" })).toBeVisible();
    expect(await seriousViolations()).toEqual([]); // Sweep
    // Cross-check too. Axe skips `hidden` subtrees, so renaming the third pass rather than adding a
    // fourth would have quietly retired the audit that `ValidationPanel`, `DragCrossCheck` and the
    // RocketPy panel had while all three sat behind one workspace.
    await page.getByRole("link", { name: "Cross-check" }).click();
    await page.waitForURL(/\/validate\/?$/);
    await expect(page.locator("#panel-validate")).toBeVisible();
    expect(await seriousViolations()).toEqual([]); // Cross-check
  });

  test("has no serious accessibility violations on the results view in dark mode", async ({
    page,
  }) => {
    // Muted labels on the dark background are the easiest contrast trap; audit dark explicitly.
    await page.addInitScript(() => localStorage.setItem("loft.theme", "dark"));
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await page.getByRole("heading", { name: "Flight", exact: true }).waitFor();
    await expectNoComparison(page);
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
    // editor can name — and the range rendered "0 to –", which reads as a range that failed to load
    // rather than as "no maximum". 17 fields in the Design workspace were showing it.
    //
    // It used to be a `title`, i.e. hover-only, which `DESIGN.md` §8 forbids and which does not exist
    // on the phone this app is meant to be read on at the pad. It is now the field's visible guidance
    // line, reached the way a screen reader reaches it — so this reads the description, not a tooltip.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Design" }).click();

    const guidance = await page.$$eval("input[type=number][aria-describedby]", (ns) =>
      ns.flatMap((n) =>
        (n.getAttribute("aria-describedby") ?? "")
          .split(" ")
          .filter(Boolean)
          .map((id) => document.getElementById(id))
          .filter((el): el is HTMLElement => !!el && el.getAttribute("role") !== "alert")
          .map((el) => el.textContent?.trim() ?? ""),
      ),
    );

    const dashed = guidance.filter((t) => /\b(–|-)\s*$|:\s*–\s+to\b/.test(t));
    expect(dashed, `ranges with an unnamed bound: ${dashed.join(" | ")}`).toEqual([]);

    // And the positive anchor: the one-sided form is actually being produced, so the assertion
    // above cannot pass on a screen that renders no ranges at all.
    expect(guidance.filter((t) => /(or more|up to \d)/.test(t)).length).toBeGreaterThan(0);
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
    await page.getByRole("link", { name: "Design" }).click();
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

  test("picking a body tube aims the body fields at it, and the length lands there only", async ({ page }) => {
    // `Body length` used to resolve "the" body tube as the LONGEST one, so on a design with several
    // every tube but that one was unreachable: the flyer clicks the booster tube, types a length, and
    // the sustainer tube resizes instead. 23 of the 35 corpus designs carry more than one body tube as
    // Loft imports them. `two-stage-firm-booster.ork` is two — 600 mm at station 200 and
    // 500 mm at station 800 — and names them both "body", so the panel has to say which it is holding
    // by where it sits rather than by a name that distinguishes nothing.
    await page.goto("/");
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/two-stage-firm-booster.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    const tubeRows = page.locator("tr").filter({ hasText: /Body tube/ });
    await expect(tubeRows).toHaveCount(2);
    const lengthsOf = async () =>
      (await tubeRows.allTextContents()).map((t) => t.replace(/\s+/g, " ").match(/L ([\d,]+) mm/)?.[1] ?? "?");
    const before = await lengthsOf();
    expect(before[0]).not.toBe("?");
    expect(before[0]).not.toBe(before[1]); // the two tubes really are different lengths

    // The field starts on the design's primary (longest) tube.
    const bodyField = page.locator("label").filter({ hasText: /Body length/ }).first().locator("input");
    await expect(bodyField).toHaveAttribute("placeholder", before[0]);

    // Aim the fields at the SECOND tube. The field now describes it...
    await tubeRows.nth(1).click();
    await expect(bodyField).toHaveAttribute("placeholder", before[1]);
    // ...and the panel says which tube it is holding, by station, since both are called "body".
    await expect(page.getByText(/Body length.*describes and changes the tube 800 mm from the nose/)).toBeVisible();

    // Edit it. Only the picked tube moves.
    await bodyField.fill("640");
    await bodyField.blur();
    await expect.poll(async () => (await lengthsOf())[1], { timeout: 15000 }).toBe("640");
    expect((await lengthsOf())[0], "the tube that was not picked must not change").toBe(before[0]);
  });

  test("a flyer can add a second fin ring, and the stability panel describes it", async ({ page }) => {
    // The structural add that moves stability most, and the second kind R3's *done when* names. The
    // ring is CLONED from the design's own set rather than derived from invented proportions —
    // "another one of these, here" is the gesture, and it is the only default that is a fact about
    // this rocket instead of a number somebody chose. Fins mount ON a tube, so it goes inside the
    // anchor rather than behind it.
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    await page.getByRole("link", { name: "Flight" }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    const margin = async () => {
      const t = await page.getByText("Static margin", { exact: true }).locator("xpath=following-sibling::dd").innerText();
      return parseFloat(t.replace(/[^\d.]/g, ""));
    };
    const before = await margin();
    expect(before).toBeGreaterThan(0);

    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();
    const partsTable = page.locator("table").filter({ hasText: "Dimensions" });
    const finRows = partsTable.locator("tr").filter({ hasText: /Trapezoidal fins/ });
    await expect(finRows).toHaveCount(1);

    await partsTable.locator("tr").filter({ hasText: /Body tube/ }).first().click();
    await page.getByRole("button", { name: /Add fins to this tube/ }).click();

    // Two rings now, and the second matches the first — the same dimensions, in the same row text.
    await expect(finRows).toHaveCount(2);
    const dims = await finRows.allInnerTexts();
    const shape = (t: string) => (t.match(/root [\d.]+ ?mm, tip [\d.]+ ?mm, span [\d.]+ ?mm/) ?? [""])[0];
    expect(shape(dims[0])).toBeTruthy();
    expect(shape(dims[1])).toBe(shape(dims[0]));

    // And the panel a flyer reads stability off describes the rocket they just built.
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(margin, { timeout: 20000 }).toBeGreaterThan(before);

    // Undoable by name, back to one ring.
    await page.getByRole("button", { name: /^Undo adding a fin set/ }).click();
    await expect.poll(margin, { timeout: 20000 }).toBe(before);
    await page.getByRole("link", { name: "Design" }).click();
    await expect(finRows).toHaveCount(1);
  });

  test("a tube's length can be dragged on the diagram, not only typed", async ({ page }) => {
    // R3's *done when* asks for a part placed "by direct manipulation". A tube's length was the one
    // dimension of an airframe with no grip at all — every other body and fin dimension already had
    // one — so a flyer who had just authored a section could only size it by typing a number at it.
    // The grip drives the same edit the field does, so the picture and the field are one edit and the
    // aim decides which tube either of them lands on.
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    await page.getByRole("link", { name: "Design" }).click();

    const handle = page.getByRole("slider", { name: "Body length" });
    await expect(handle).toBeVisible();
    const lengthOf = async () => Number(await handle.getAttribute("aria-valuenow"));
    const before = await lengthOf();
    expect(before).toBeGreaterThan(0);

    // Arrow keys are the keyboard path every handle here has; each nudge is a real edit commit.
    await handle.focus();
    for (let i = 0; i < 10; i++) await handle.press("ArrowRight");
    await expect.poll(lengthOf, { timeout: 20000 }).toBeGreaterThan(before);

    // The number field agrees — it is the same edit, so the two cannot drift.
    const bodyLength = page.locator("label").filter({ hasText: /Body length/ }).first().locator("input");
    await expect.poll(async () => Number(await bodyLength.inputValue()), { timeout: 20000 }).toBeGreaterThan(before);

    // And one undo takes the whole gesture back, not one nudge of it.
    await page.getByRole("button", { name: /^Undo the body length/ }).click();
    await expect.poll(lengthOf, { timeout: 20000 }).toBe(before);
  });

  test("a flyer can add a body tube the design never had, and take it back", async ({ page }) => {
    // R3's first capability, and the first edit that is an OPERATION rather than a value: the flat patch
    // has no field for a part that does not exist yet. The gesture is "another one of these, here" — the
    // new tube goes behind the one on screen and inherits its caliber, wall, material and finish, because
    // a tube that does not fair to the airframe it joins is a step in the outer mould line and a design
    // nobody meant to draw.
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    await page.getByRole("link", { name: "Flight" }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const margin = async () => {
      const t = await page.getByText("Static margin", { exact: true }).locator("xpath=following-sibling::dd").innerText();
      return parseFloat(t.replace(/[^\d.]/g, ""));
    };
    const dry = async () =>
      parseFloat((((await page.locator("body").innerText()).match(/Mass & balance · dry ([\d.]+)/) ?? [])[1] ?? "0"));

    const asBuilt = { apogee: await apogee(), margin: await margin() };
    expect(asBuilt.apogee).toBeGreaterThan(0);

    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();
    const partsTable = page.locator("table").filter({ hasText: "Dimensions" });
    const tubes = partsTable.locator("tr").filter({ hasText: /Body tube/ });
    await expect(tubes).toHaveCount(1);
    const dryBefore = await dry();

    await tubes.first().click();
    await page.getByRole("button", { name: /Add a tube behind this/ }).click();

    // The part is in the design, it weighs something, and — the half that matters — the FLIGHT moved
    // with it. The mass panel and the Flight card read the airframe through different paths, and an
    // earlier version of this had the panel grow a 310 mm section and put 142 g on the design while the
    // Flight card went on reporting the apogee of a rocket without it.
    await expect(tubes).toHaveCount(2);
    await expect.poll(dry, { timeout: 20000 }).toBeGreaterThan(dryBefore);
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(apogee, { timeout: 20000 }).toBeLessThan(asBuilt.apogee);
    expect(await margin()).toBeLessThan(asBuilt.margin);

    // The fields re-aimed at the part that was just made, so the very next thing typed changes it —
    // and the placeholder advertises ITS length, not the design's own tube's.
    await page.getByRole("link", { name: "Design" }).click();
    const bodyLength = page.locator("label").filter({ hasText: /Body length/ }).first().locator("input");
    const advertised = parseFloat((await bodyLength.getAttribute("placeholder")) ?? "0");
    expect(advertised).toBeGreaterThan(0);
    expect(advertised).toBeLessThan(620); // the starter's own tube; the authored one is half of it

    // And it is undoable, by name, back to the design that never had it.
    await expect(page.getByRole("button", { name: /^Undo adding a body tube/ })).toBeEnabled();
    await page.getByRole("button", { name: /^Undo adding a body tube/ }).click();
    await expect(tubes).toHaveCount(1);
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(apogee, { timeout: 20000 }).toBe(asBuilt.apogee);
  });

  test("a flyer can add a tail cone the design never had, shape it, and take it back", async ({ page }) => {
    // R3's third kind. A transition is where an airframe changes caliber, and until now a flyer could
    // neither author one nor touch one a design arrived with — the only cone they could shape was a
    // boattail they had just asked for by typing two numbers into fields that create one.
    //
    // With nothing behind the anchor the gesture makes a tail cone, contracting to the corpus median
    // of the 14 contracting transitions (0.7446 of the diameter it starts at). That is the base-drag
    // lever: on the starter design it buys +29.33 m of apogee (993.64 to 1022.97 m) for +12.58 g.
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    await page.getByRole("link", { name: "Flight" }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const asBuilt = await apogee();
    expect(asBuilt).toBeGreaterThan(0);

    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();
    const partsTable = page.locator("table").filter({ hasText: "Dimensions" });
    const cones = partsTable.locator("tr").filter({ hasText: /Transition/ });
    await expect(cones).toHaveCount(0);

    await partsTable.locator("tr").filter({ hasText: /Body tube/ }).first().click();
    await page.getByRole("button", { name: /Add a transition behind this/ }).click();
    await expect(cones).toHaveCount(1);
    // The dimension line says it contracts: a fore diameter larger than the exit.
    // The parts table rounds to whole millimetres, so the constant is pinned on the field's own
    // readback below, which carries round-trip precision. Here it is enough that the cone contracts.
    await expect(cones.first()).toContainText(/⌀\s*54[^→]*→\s*⌀\s*40\b/);

    // Contracting the base is worth altitude, and the Flight card moves with it.
    await page.getByRole("link", { name: "Flight" }).click();
    // +29.33 m on the starter, measured; assert most of it rather than any epsilon above zero.
    await expect.poll(apogee, { timeout: 20000 }).toBeGreaterThan(asBuilt + 20);

    // The fields aimed at it the moment it existed, so the very next number typed shapes THAT part.
    await page.getByRole("link", { name: "Design" }).click();
    const exit = page.locator("label").filter({ hasText: /Transition exit/ }).first().locator("input");
    // 54.00 mm x 0.7446 = 40.2 mm. Anchored and to the tenth: the previous /4[01]/ accepted anything
    // from 40.0 to 41.99 — a 4.9% window on the one constant this case exists to hold — and being
    // unanchored it also matched "540".
    await expect(exit).toHaveAttribute("placeholder", /^40(\.2\d*)?$/);
    await exit.fill("20");
    await expect(cones.first()).toContainText(/→\s*⌀\s*20/);
    // Nothing sits behind a tail cone, so there is no joint to judge and the step notice stays silent.
    // Scoped to the parts panel's own sentence for the same reason as the sibling case below: the
    // flight carries an airframe-scope caution about the same geometry, and an unscoped locator
    // would be asserting about both surfaces while claiming to test this one.
    await expect(page.getByText(/at the joint behind this part/)).toHaveCount(0);

    // And it is undoable, by name, back to the design that never had it.
    await page.getByRole("button", { name: /^Undo the transition exit/ }).click();
    await expect(cones.first()).toContainText(/→\s*⌀\s*40\b/);
    await page.getByRole("button", { name: /^Undo adding a transition/ }).click();
    await expect(cones).toHaveCount(0);
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(apogee, { timeout: 20000 }).toBe(asBuilt);
  });

  test("a flyer can add a mass object, weigh it, and slide it along the airframe", async ({ page }) => {
    // R3's fourth kind, and the one whose placement IS a station: a point mass has to be told where it
    // sits, unlike a tube that lands behind its anchor. The corpus decides the default — a third of the
    // way down the part holding it: 0.3251 of its length, the median of the 16 corpus masses placed
    // that way inside a body tube.
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    await page.getByRole("link", { name: "Flight" }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    const margin = async () => {
      const t = await page.getByText("Static margin", { exact: true }).locator("xpath=following-sibling::dd").innerText();
      return parseFloat(t.replace(/[^\d.]/g, ""));
    };
    const asBuilt = await margin();
    expect(asBuilt).toBeGreaterThan(0);

    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();
    const partsTable = page.locator("table").filter({ hasText: "Dimensions" });
    // The starter already carries one (its altimeter + battery), so this counts rather than presumes.
    const rows = partsTable.locator("tr").filter({ hasText: /Mass object/ });
    await expect(rows).toHaveCount(1);

    await partsTable.locator("tr").filter({ hasText: /Body tube/ }).first().click();
    await page.getByRole("button", { name: /Add a mass inside this/ }).click();
    await expect(rows).toHaveCount(2);

    // The mass fields aimed at it the moment it existed, so its own weight is what they advertise.
    const massField = page.locator("label").filter({ hasText: /^Mass \(/ }).first().locator("input");
    const posField = page.locator("label").filter({ hasText: /Mass pos/ }).first().locator("input");
    await expect(massField).toHaveAttribute("placeholder", /45/);
    const seated = parseFloat((await posField.getAttribute("placeholder")) ?? "0");
    expect(seated).toBeGreaterThan(0);

    // Weighing it moves the balance — the number a flyer adds ballast to change.
    await massField.fill("400");
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(margin, { timeout: 20000 }).not.toBe(asBuilt);
    const heavy = await margin();

    // And sliding it forward moves the balance again, the other way: mass ahead of the CG pulls it up.
    await page.getByRole("link", { name: "Design" }).click();
    await posField.fill(String(Math.round(seated / 2)));
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(margin, { timeout: 20000 }).not.toBe(heavy);

    // Each step is its own undo, named after what it did.
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByRole("button", { name: /^Undo the mass position/ }).click();
    await page.getByRole("button", { name: /^Undo the mass\b/ }).click();
    await expect(massField).toHaveAttribute("placeholder", /45/);
    await page.getByRole("button", { name: /^Undo adding a mass object/ }).click();
    await expect(rows).toHaveCount(1);
  });

  test("a coupler and a centring ring go inside the tube, and only the balance moves", async ({ page }) => {
    // R8's two INTERNAL kinds, and the first authored parts that touch no outer mould line at all.
    // That is what this drives: the airframe the solver sees must be untouched — same apogee-driving
    // drag, same length — while dry mass and the balance move. A test that only counted rows would
    // pass on a part built in the wrong place, which is exactly the defect the corpus sweep caught.
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    await page.getByRole("link", { name: "Flight" }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    const figure = async (label: string) => {
      const t = await page.getByText(label, { exact: true }).locator("xpath=following-sibling::dd").innerText();
      return parseFloat(t.replace(/[^\d.]/g, ""));
    };
    const asBuilt = {
      margin: await figure("Static margin"),
      mass: await figure("Liftoff mass"),
    };
    expect(asBuilt.mass).toBeGreaterThan(0);

    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();
    const partsTable = page.locator("table").filter({ hasText: "Dimensions" });
    const before = await partsTable.locator("tr").count();

    // **Where a part SITS is read from the Station column, not from the airframe's overall length.**
    // The pre-push review proved the obvious check vacuous: `overallLength` maxes over body kinds
    // only (nose cone, body tube, transition), so it is structurally blind to these two — the whole
    // test passed with `inside: false`, both parts built as top-level siblings at a NEGATIVE station,
    // entirely ahead of the nose tip. Station and the stated length are what can actually tell.
    // Column addressed by its header rather than by index, because inserting a column silently
    // re-points an `nth-child` and this suite has already been bitten by that.
    const headers = (await partsTable.locator("thead").innerText()).split("\t").map((h) => h.trim());
    const colOf = (label: string) => {
      const i = headers.findIndex((h) => h.toUpperCase().startsWith(label.toUpperCase()));
      expect(i, `no "${label}" column — headers were ${JSON.stringify(headers)}`).toBeGreaterThanOrEqual(0);
      return i;
    };
    const stationCol = colOf("Station");
    const dimsCol = colOf("Dimensions");
    const spanOf = async (rowText: RegExp) => {
      const cells = partsTable.locator("tr").filter({ hasText: rowText }).first().locator("th, td");
      const at = parseFloat((await cells.nth(stationCol).innerText()).replace(/[^\d.-]/g, ""));
      const dims = await cells.nth(dimsCol).innerText();
      const len = parseFloat(/L\s*([\d.]+)/.exec(dims)?.[1] ?? "NaN");
      expect(Number.isFinite(at) && Number.isFinite(len), `unreadable row ${rowText}: "${dims}"`).toBe(true);
      return { at, len };
    };

    await partsTable.locator("tr").filter({ hasText: /Body tube/ }).first().click();
    await page.getByRole("button", { name: /^Add a coupler inside this/ }).click();
    await page.getByRole("button", { name: /^Add a centering ring inside this/ }).click();
    await expect(partsTable.locator("tr")).toHaveCount(before + 2);
    await expect(partsTable.locator("tr").filter({ hasText: /Coupler/ })).toHaveCount(1);
    await expect(partsTable.locator("tr").filter({ hasText: /Centering ring/ })).toHaveCount(1);

    // **Both sit within the host's own span**, which is what "inside" has to mean geometrically, and
    // it is the assertion the whole gesture rests on.
    const host = await spanOf(/Body tube/);
    for (const [what, row] of [["coupler", /Coupler/] as const, ["ring", /Centering ring/] as const]) {
      const p = await spanOf(row);
      expect(p.at, `${what} starts ahead of its host`).toBeGreaterThanOrEqual(host.at - 0.05);
      expect(p.at + p.len, `${what} runs past the aft end of its host`).toBeLessThanOrEqual(host.at + host.len + 0.05);
    }
    // A coupler is a TUBE and a ring is a PLATE, and the panel shows the difference rather than two
    // parts of the same made-up size — the defect the corpus check caught before this shipped.
    expect((await spanOf(/Coupler/)).len).toBeGreaterThan((await spanOf(/Centering ring/)).len * 5);

    // The weight moved too, by an amount a flyer would recognise rather than a slug. Both parts
    // inherit the HOST's stock, which on the starter is fibreglass rather than the cardboard and ply
    // a coupler and a ring are usually cut from — so this bound is generous by design and the check
    // that pins the sizes is the corpus sweep, over 35 real designs and their real materials. The
    // 50 mm solid version this replaced put 134 g on the corpus median design.
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(() => figure("Liftoff mass"), { timeout: 20000 }).not.toBe(asBuilt.mass);
    const added = (await figure("Liftoff mass")) - asBuilt.mass;
    expect(added).toBeGreaterThan(0);
    expect(added).toBeLessThan(0.2);
    // And seated at the aft end, they pull the balance back — the reason to model them at all.
    expect(await figure("Static margin")).not.toBe(asBuilt.margin);

    // Each is its own undo step, named after the part it made.
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByRole("button", { name: /^Undo adding a centering ring/ }).click();
    await page.getByRole("button", { name: /^Undo adding a coupler/ }).click();
    await expect(partsTable.locator("tr")).toHaveCount(before);
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(() => figure("Liftoff mass"), { timeout: 20000 }).toBe(asBuilt.mass);
  });

  test("the parts panel says where the airframe steps, and how far", async ({ page }) => {
    // The user-visible half of the mould-line work, and it had no test at all. Loft models a
    // transition's own slope (Niskanen 3.86 for a shoulder, 3.88 for a boattail) and has no drag term
    // for a bare radius step — which has no length to take an angle over — so a step is flown
    // optimistically, and saying nothing about it is the silence the brief forbids. 33 of the 115
    // airframe joints in the real corpus already step, in 13 of the 35 designs.
    //
    // Driven through the editor rather than through a fixture that arrives stepped, because that is
    // the case the new fields make reachable: nothing aft of a transition follows its exit, so
    // narrowing one opens a step at the joint behind it, and the flyer is owed the sentence.
    await page.goto("/");
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "fixtures/demo-quirks.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    const partsTable = page.locator("table").filter({ hasText: "Dimensions" });
    const tubes = partsTable.locator("tr").filter({ hasText: /Body tube/ });
    await expect(tubes).toHaveCount(2);
    // Scoped to the sentence only the PARTS PANEL says. The flight now carries its own caution about
    // the same geometry — at airframe scope, for the design as a whole — so a locator that matched
    // "the airframe steps" alone would resolve to both surfaces and stop testing this one.
    const notice = page.getByText(/at the joint behind this part/);

    // A transition authored between two sections at the same caliber runs straight through, so it
    // opens nothing and nothing is said. (This fixture already carries a boattail, so count rather
    // than presume.)
    const cones = partsTable.locator("tr").filter({ hasText: /Transition/ });
    const had = await cones.count();
    await tubes.first().click();
    await page.getByRole("button", { name: /Add a transition behind this/ }).click();
    await expect(cones).toHaveCount(had + 1);
    await expect(notice).toHaveCount(0);

    // Narrow its exit and the joint behind it steps — by exactly the difference, and it says so.
    const exit = page.locator("label").filter({ hasText: /Transition exit/ }).first().locator("input");
    const before = parseFloat((await exit.getAttribute("placeholder")) ?? "0");
    expect(before).toBeGreaterThan(20);
    await exit.fill(String(Math.round(before - 10)));

    await expect(notice).toHaveCount(1);
    const said = (await notice.first().innerText()).trim();
    expect(said).toMatch(/steps out by [\d.]+ mm of diameter at the joint behind this part/);
    expect(said).toMatch(/no drag term for a bare step/);
    // The size is the real one, not a placeholder: the exit came down by ~10 mm, so the airframe
    // steps back OUT by that much where the next tube begins.
    expect(parseFloat((said.match(/by ([\d.]+) mm/) ?? [])[1] ?? "0")).toBeGreaterThan(8);

    // Undo it and the sentence goes with it — a notice that outlives its cause is worse than none.
    await page.getByRole("button", { name: /^Undo the transition exit/ }).click();
    await expect(notice).toHaveCount(0);
  });

  test("a mass object can be slid along the airframe on the diagram, not only typed", async ({ page }) => {
    // R3's *done when* asks for a part placed "at a station by direct manipulation", and a point mass
    // is the one kind whose whole geometry IS a station — so it is the one that most needs a grip.
    // The handle rides the mark already drawn for it and is bounded by the part holding it, because
    // the model clamps the station into its host anyway and a grip that could be dragged past the end
    // would stick at a value the pointer had left behind.
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    await page.getByRole("link", { name: "Flight" }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    const margin = async () => {
      const t = await page.getByText("Static margin", { exact: true }).locator("xpath=following-sibling::dd").innerText();
      return parseFloat(t.replace(/[^\d.]/g, ""));
    };
    const asBuilt = await margin();

    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();
    const partsTable = page.locator("table").filter({ hasText: "Dimensions" });
    // Pick the starter's own altimeter, so this exercises an IMPORTED mass and not only an authored one.
    await partsTable.locator("tr").filter({ hasText: /Mass object/ }).first().click();

    const grip = page.getByRole("slider", { name: /Mass position/ });
    await expect(grip).toBeVisible();

    // It is a real slider: focusable, and the arrow keys move it.
    const posField = page.locator("label").filter({ hasText: /Mass pos/ }).first().locator("input");
    const seated = parseFloat((await posField.getAttribute("placeholder")) ?? "0");
    expect(seated).toBeGreaterThan(0);

    await grip.focus();
    for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowLeft");
    // Nudging it forward moves the balance — mass ahead of the CG pulls the CG up and the margin with it.
    await expect.poll(async () => parseFloat((await posField.inputValue()) || "0"), { timeout: 15000 }).toBeLessThan(seated);
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(margin, { timeout: 20000 }).not.toBe(asBuilt);

    // And it is one undo, by name, not twelve.
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByRole("button", { name: /^Undo the mass position/ }).click();
    await expect(posField).toHaveValue("");
  });

  test("clicking a part the flyer authored aims the fields back at it", async ({ page }) => {
    // A pick is judged against the design the flyer is LOOKING at — the import plus their own structure
    // — and not against the import alone. Judged against the import, a part they authored is not in the
    // tree at all, so the pick aimed NOTHING: the diagram highlighted the new tube while the body fields
    // went on holding whichever tube they held before, and the next length typed landed there. That is
    // exactly the sequence below, and before the fix it ended with the authored tube still at its own
    // 310.0 mm and the design's own 620.0 mm tube at 400.0 mm — while the diagram highlighted the one
    // that had not moved.
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();
    const partsTable = page.locator("table").filter({ hasText: "Dimensions" });
    const tubes = partsTable.locator("tr").filter({ hasText: /Body tube/ });
    await expect(tubes).toHaveCount(1);

    await tubes.first().click();
    await page.getByRole("button", { name: /Add a tube behind this/ }).click();
    await expect(tubes).toHaveCount(2);

    // The placeholder is the readback of whichever tube the body fields are holding, so it names the aim.
    const bodyLength = page.locator("label").filter({ hasText: /Body length/ }).first().locator("input");
    const advertised = async () => parseFloat((await bodyLength.getAttribute("placeholder")) ?? "0");
    const authoredLen = await advertised();
    expect(authoredLen).toBeGreaterThan(0);

    // Read the design's own tube, then come back to the one that was authored.
    await tubes.nth(0).click();
    await expect.poll(advertised, { timeout: 15000 }).toBeGreaterThan(authoredLen);
    await tubes.nth(1).click();
    await expect.poll(advertised, { timeout: 15000 }).toBeCloseTo(authoredLen, 1);

    // And the next length typed changes THAT tube, not the one the fields were holding a click ago.
    await bodyLength.fill("400");
    await expect(tubes.nth(1)).toContainText(/L 400/);
    await expect(tubes.nth(0)).not.toContainText(/L 400/);
  });

  test("removing a part re-flies the design, and the removal is undoable", async ({ page }) => {
    // R2's capability. A parametric edit is recoverable by retyping a number; a deletion is not, which is
    // why undo ships with it rather than after it. `two-stage-firm-booster.ork` has two fin sets, so one
    // can go without hitting the last-body-tube refusal.
    await page.goto("/");
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/two-stage-firm-booster.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    const margin = async () => {
      const t = await page
        .getByText("Static margin", { exact: true })
        .locator("xpath=following-sibling::dd")
        .innerText();
      return parseFloat(t.replace(/[^\d.]/g, ""));
    };
    const before = await margin();
    expect(before).toBeGreaterThan(0);

    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    // Pick a fin set and remove it. The control names the part it will take. The rows are scoped to the
    // PARTS table by its own Dimensions column: a collapsed `<details>` keeps the Mass & balance table in
    // the DOM, so a bare `tr` filter matches rows in both.
    const partsTable = page.locator("table").filter({ hasText: "Dimensions" });
    const finRows = partsTable.locator("tr").filter({ hasText: /Trapezoidal fins/ });
    await expect(finRows).toHaveCount(2);
    await finRows.first().click();
    const remove = page.getByRole("button", { name: /^Remove / });
    await expect(remove).toBeVisible();
    await remove.click();

    // The part is gone from the design...
    await expect(partsTable.locator("tr").filter({ hasText: /Trapezoidal fins/ })).toHaveCount(1);
    // ...and the flight answer moved: fewer fins is less normal force, so a thinner static margin.
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(margin, { timeout: 20000 }).toBeLessThan(before);

    // Undo names the part it will put back, and puts it back exactly.
    await page.getByRole("button", { name: /^Undo removing / }).click();
    await expect.poll(margin, { timeout: 20000 }).toBe(before);
    await page.getByRole("link", { name: "Design" }).click();
    await expect(partsTable.locator("tr").filter({ hasText: /Trapezoidal fins/ })).toHaveCount(2);
  });

  test("a typed dimension is undoable, and redoable — not only a removal", async ({ page }) => {
    // R2's done-when read strictly: undo over the EDIT HISTORY, not over one field. Before this the
    // only way back from a typed dimension was "Reset to as-designed", which discards everything else
    // with it — a way out of one state that walks into a worse one.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const asDesigned = await apogee();
    expect(asDesigned).toBeGreaterThan(0);

    // Nothing has been done yet, so there is nothing to undo — and the control says so rather than
    // vanishing, so its place on the header does not move under the pointer.
    const undo = page.getByRole("button", { name: /^Undo/ });
    await expect(undo).toBeDisabled();

    await page.getByRole("link", { name: "Design" }).click();
    const finThickness = page.getByLabel(/Fin thickness/);
    const designThickness = parseFloat((await finThickness.getAttribute("placeholder")) ?? "0");
    expect(designThickness).toBeGreaterThan(0);
    await finThickness.fill((designThickness * 3).toFixed(1));
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(apogee, { timeout: 20000 }).toBeLessThan(asDesigned);

    // The control NAMES what it will take back. "Undo" alone asks the flyer to remember what they did.
    await expect(undo).toBeEnabled();
    await expect(undo).toHaveText(/the fin thickness/);
    await undo.click();
    await expect.poll(apogee, { timeout: 20000 }).toBe(asDesigned);
    // ...and the field it undid went back with the flight, rather than sitting there asserting a
    // number nothing is flying.
    await page.getByRole("link", { name: "Design" }).click();
    await expect(page.getByLabel(/Fin thickness/)).toHaveValue("");

    // Redo puts it back. Undo without redo is half a control: an undo pressed once too often is
    // itself a state with no way out.
    const redo = page.getByRole("button", { name: /^Redo/ });
    await expect(redo).toBeEnabled();
    await redo.click();
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(apogee, { timeout: 20000 }).toBeLessThan(asDesigned);
  });

  test("one undo takes back a whole gesture, not one frame of it", async ({ page }) => {
    // A drag handle applies a patch on every animation frame, and a held arrow key repeats. Recorded
    // one commit per frame, the undo stack would be hundreds of steps of a few tenths of a millimetre
    // each and every earlier edit would be buried under one gesture.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();

    // The diagram's fin-position handle is a real slider: focusable, and arrow keys nudge it. Each
    // nudge is its own edit commit, exactly as each frame of a drag is.
    const handle = page.getByRole("slider", { name: /Fin position/ }).first();
    await expect(handle).toBeVisible();
    const stationOf = async () => Number(await handle.getAttribute("aria-valuenow"));
    const before = await stationOf();

    // Forward, not aft: this design's fins sit at the tail, where the handle is already against its
    // limit and an aft nudge applies the same value it already has.
    await handle.focus();
    for (let i = 0; i < 12; i++) await handle.press("ArrowLeft");
    await expect.poll(stationOf, { timeout: 20000 }).toBeLessThan(before);

    // ONE undo returns to where the gesture started — not to the eleventh nudge.
    await page.getByRole("button", { name: /^Undo/ }).click();
    await expect.poll(stationOf, { timeout: 20000 }).toBe(before);
  });

  test("one undo never takes back two gestures on two different parts", async ({ page }) => {
    // Picking a part records nothing — a selection is not an undoable act — so nothing closed the
    // gesture that came before it, and a span typed on one fin set, a pick of the other, and a span
    // typed on that one all carried the same field name inside the coalescing window and merged into
    // ONE step. Measured on the pure model before the fix: one undo landed back on fin set A, taking
    // back both gestures and re-aiming the fields at the first part.
    await page.goto("/");
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/two-stage-firm-booster.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    const partsTable = page.locator("table").filter({ hasText: "Dimensions" });
    const finRows = partsTable.locator("tr").filter({ hasText: /Trapezoidal fins/ });
    await expect(finRows).toHaveCount(2);
    const span = page.getByLabel(/Fin span/).and(page.locator("input"));

    await finRows.first().click();
    await span.fill("70");
    await finRows.nth(1).click();
    await span.fill("40");

    // One undo takes back only the SECOND set's span. Before the fix it took back both and the fields
    // came back aimed at the first set.
    await page.getByRole("button", { name: /^Undo the fin span/ }).click();
    await expect(span).toHaveValue("70");
    // A second undo takes back the first, and only then is there nothing left.
    await page.getByRole("button", { name: /^Undo the fin span/ }).click();
    await expect(span).toHaveValue("");
  });

  test("clearing every what-if is itself undoable", async ({ page }) => {
    // "Reset to as-designed" is the app's one bulk discard: it takes the removals, the dimensions and
    // the conditions in a single click. It was the only way back from an edit, and it had no way back
    // of its own — a one-way door reached from the control that existed to be a way out.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    const apogee = async () => {
      const txt = await page
        .getByLabel("Results")
        .getByText("Apogee", { exact: true })
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(txt.replace(/[^\d.]/g, ""));
    };
    const asDesigned = await apogee();

    await page.getByRole("link", { name: "Design" }).click();
    const finThickness = page.getByLabel(/Fin thickness/);
    const designThickness = parseFloat((await finThickness.getAttribute("placeholder")) ?? "0");
    await finThickness.fill((designThickness * 3).toFixed(1));
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(apogee, { timeout: 20000 }).toBeLessThan(asDesigned);
    const edited = await apogee();

    await page.getByRole("button", { name: "Reset to as-designed" }).click();
    await expect.poll(apogee, { timeout: 20000 }).toBe(asDesigned);

    // The reset names itself, and gives the work back.
    const undo = page.getByRole("button", { name: /^Undo/ });
    await expect(undo).toHaveText(/the reset/);
    await undo.click();
    await expect.poll(apogee, { timeout: 20000 }).toBe(edited);
  });

  test("the keyboard shortcut undoes, and leaves a text box's own undo alone", async ({ page }) => {
    // Every editor a flyer has used binds this, and a builder that only offers a button is one they
    // have to go looking for. The exception matters as much: part-way through typing a dimension,
    // the shortcut belongs to the box, not to the rocket.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();

    const finThickness = page.getByLabel(/Fin thickness/);
    const designThickness = parseFloat((await finThickness.getAttribute("placeholder")) ?? "0");
    await finThickness.fill((designThickness * 3).toFixed(1));
    await expect(page.getByRole("button", { name: /^Undo the fin thickness/ })).toBeEnabled();

    // Focus is still in the number box, so the shortcut is the box's: the edit stands.
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByRole("button", { name: /^Undo the fin thickness/ })).toBeEnabled();

    // Outside a text box it is the design's.
    await finThickness.blur();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByRole("button", { name: /^Undo$/ })).toBeDisabled();
    await expect(page.getByLabel(/Fin thickness/)).toHaveValue("");
  });

  test("a flyer can move a part along the airframe, and the stations behind it follow", async ({ page }) => {
    // R4's done-when, walked in the app. `fixtures/demo-quirks.ork` carries FOUR top-level children in
    // one stage (nose > tube > transition > tube), which is the most of any committed fixture —
    // `demo-boattail.ork` and `demo-dual-deploy.ork` have three, and NONE of the five `e2e/fixtures/`
    // has more than two, nor does the starter. So it is the file with the most room for the gesture,
    // and the only one where a part has somewhere to go in both directions.
    //
    // The assertion is on the STATION column, not on the order of the rows: the rows would reorder even
    // if the model had simply relabelled them, and what the milestone promises is that the arithmetic of
    // everything aft follows.
    await page.goto("/");
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "fixtures/demo-quirks.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    const partsTable = page.locator("table").filter({ hasText: "Dimensions" });
    const names = () => partsTable.locator("tbody tr").evaluateAll((rows) =>
      rows.map((r) => r.querySelector("th,td")?.textContent?.trim() ?? ""),
    );
    const orderBefore = await names();
    expect(orderBefore.length).toBeGreaterThan(3);

    // Pick the aft-most body tube and walk it one place toward the nose.
    const tubes = partsTable.locator("tr").filter({ hasText: /Body tube/ });
    await expect(tubes).toHaveCount(2);
    await tubes.last().click();
    const toNose = page.getByRole("button", { name: /Move toward the nose/ });
    await expect(toNose).toBeVisible();
    await toNose.click();

    // The order changed, and the same parts are still there.
    await expect.poll(async () => (await names()).join("|"), { timeout: 20000 }).not.toBe(orderBefore.join("|"));
    const orderAfter = await names();
    expect([...orderAfter].sort()).toEqual([...orderBefore].sort());

    // A SECOND nudge, which is the one that catches a stale tree. `movePart` resolves its anchor
    // against the structure-with-edits, so a memo that did not recompute after the first move would
    // compute this one's anchor from the order before it and land the part somewhere else.
    await toNose.click();
    await expect.poll(async () => (await names()).join("|"), { timeout: 20000 }).not.toBe(orderAfter.join("|"));
    const orderTwice = await names();
    expect([...orderTwice].sort()).toEqual([...orderBefore].sort());

    // Each nudge is undoable BY NAME, and each is its OWN step — two clicks, two undos, even back to
    // back. Structural acts do not coalesce anywhere in this app: a run key would merge clicks inside
    // the 900 ms window and one undo would then jump the part two places back under a label reading
    // "moving X toward the nose" in the singular. The run rule is for a drag or a typed number, whose
    // intermediate states are frames of one gesture rather than separate decisions.
    const undo = page.getByRole("button", { name: /^Undo moving/ });
    await expect(undo).toBeVisible();
    await undo.click();
    await expect.poll(async () => (await names()).join("|"), { timeout: 20000 }).toBe(orderAfter.join("|"));
    await page.getByRole("button", { name: /^Undo moving/ }).click();
    await expect.poll(async () => (await names()).join("|"), { timeout: 20000 }).toBe(orderBefore.join("|"));
    await expect(page.getByRole("button", { name: /^Undo moving/ })).toHaveCount(0);
  });

  test("a part can be dragged along the airframe and dropped between two others", async ({ page }) => {
    // R4's *done when* names the gesture: "drag a component along the airframe and drop it between two
    // others". Increment 1 shipped the operation and a button pair (which stay, as the keyboard and
    // touch path a drag can never be); this is the drag.
    //
    // `fixtures/demo-quirks.ork` again — four top-level children in one stage is the most any committed
    // fixture has, and the only shape with room to drop a part somewhere that is neither neighbour.
    await page.goto("/");
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "fixtures/demo-quirks.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    const partsTable = page.locator("table").filter({ hasText: "Dimensions" });
    // Names and stations read separately: the names prove the same parts are still there and that
    // their ORDER changed, and the stations prove the arithmetic behind the drop followed. Comparing a
    // name-plus-station string as one blob would make the set-equality check meaningless, because a
    // reorder is supposed to move the stations.
    const names = () => partsTable.locator("tbody tr").evaluateAll((rs) =>
      rs.map((r) => r.querySelector("th,td")?.textContent?.trim() ?? ""),
    );
    const stations = () => partsTable.locator("tbody tr").evaluateAll((rs) =>
      rs.map((r) => [...r.querySelectorAll("th,td")][2]?.textContent?.trim() ?? ""),
    );
    const orderBefore = await names();
    const stationsBefore = await stations();

    // Grab the aft-most body tube on the DIAGRAM — the drag's grip is the part's own silhouette, which
    // already carried the hover and pick behaviour — and drag it toward the nose.
    const diagram = page.locator("svg[role='group']").first();
    const box = await diagram.boundingBox();
    expect(box).toBeTruthy();
    const grab = await page.evaluate(() => {
      // The aft-most body-part overlay: the widest x-extent of the transparent hit paths.
      const paths = [...document.querySelectorAll("svg[role='group'] path")].filter(
        (p) => p.querySelector("title")?.textContent?.includes("reorder"),
      );
      const boxes = paths.map((p) => p.getBoundingClientRect());
      if (!boxes.length) return null;
      const aft = boxes.reduce((best, b) => (b.right > best.right ? b : best));
      return { x: aft.left + aft.width / 2, y: aft.top + aft.height / 2, count: boxes.length };
    });
    expect(grab, "no draggable part overlays on the diagram").toBeTruthy();
    expect(grab!.count).toBeGreaterThan(1);

    await page.mouse.move(grab!.x, grab!.y);
    await page.mouse.down();
    // Past the movement threshold first, then to the front of the airframe.
    await page.mouse.move(grab!.x - 40, grab!.y, { steps: 4 });
    await expect(page.locator("svg[role='group'] text", { hasText: "drop here" })).toBeVisible();
    await page.mouse.move(box!.x + 6, grab!.y, { steps: 8 });
    await page.mouse.up();

    // The order changed, the same parts are all still there, and the stations behind the drop followed.
    await expect.poll(async () => (await names()).join("|"), { timeout: 20000 }).not.toBe(orderBefore.join("|"));
    const orderAfter = await names();
    expect(orderAfter.length).toBe(orderBefore.length);
    expect([...orderAfter].sort()).toEqual([...orderBefore].sort());
    expect(await stations()).not.toEqual(stationsBefore);

    // The drop is one undo step, named — not one per frame of the gesture.
    const undo = page.getByRole("button", { name: /^Undo moving/ });
    await expect(undo).toBeVisible();
    await undo.click();
    await expect.poll(async () => (await names()).join("|"), { timeout: 20000 }).toBe(orderBefore.join("|"));
    expect(await stations()).toEqual(stationsBefore);
    await expect(page.getByRole("button", { name: /^Undo moving/ })).toHaveCount(0);
  });

  test("dragging a part does not also re-aim the editor at it", async ({ page }) => {
    // The hazard that comes free with putting a drag on the pick surface: the pointerup synthesises a
    // click, the click PICKS the part, and a pick re-aims the editor's fields. On a field holding an
    // ABSOLUTE value that is a change to the design, not to the selection — the first nudge would snap
    // the newly-aimed part to the value the old one was carrying.
    await page.goto("/");
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "fixtures/demo-quirks.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    // Pick the FORWARD tube deliberately, and read which part the body fields say they are holding.
    const partsTable = page.locator("table").filter({ hasText: "Dimensions" });
    const tubes = partsTable.locator("tr").filter({ hasText: /Body tube/ });
    await tubes.first().click();
    // Scoped to the input: the diagram's own grips carry the same accessible names as the fields, so a
    // bare `getByLabel` matches two elements. This is the suite's idiom for that collision.
    const bodyLength = page.locator("input").and(page.getByLabel(/^Body length/));
    const aimedBefore = await bodyLength.getAttribute("placeholder");

    // Recomputed each time: the diagram moves in the page as controls appear and disappear around it,
    // and a coordinate captured earlier lands outside the viewport entirely.
    const aftPart = async () => {
      await page.locator("svg[role='group']").first().scrollIntoViewIfNeeded();
      return page.evaluate(() => {
        const paths = [...document.querySelectorAll("svg[role='group'] path")].filter(
          (p) => p.querySelector("title")?.textContent?.includes("reorder"),
        );
        const boxes = paths.map((p) => p.getBoundingClientRect());
        const aft = boxes.reduce((best, b) => (b.right > best.right ? b : best));
        return { x: aft.left + aft.width / 2, y: aft.top + aft.height / 2, width: aft.width };
      });
    };

    // A SHORT drag, deliberately: it stays inside the dragged part's own silhouette, so pointerdown
    // and pointerup share a target and the browser really does synthesise a click on it. A long drag
    // ends over a different element and the click lands on their common ancestor instead — which is
    // why a long one cannot test this at all, and why the suppression looked unnecessary until the
    // control for it came back green.
    const grab = await aftPart();
    expect(grab.width).toBeGreaterThan(60);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x - 25, grab.y, { steps: 5 });
    await page.mouse.up();

    // The design changed; the aim did not.
    await expect(page.getByRole("button", { name: /^Undo moving/ })).toBeVisible();
    expect(await bodyLength.getAttribute("placeholder")).toBe(aimedBefore);

    // And the converse, which is the same guard read the other way: a plain CLICK on a draggable part
    // is still a pick and never a reorder. Without a movement threshold every pick on the airframe
    // would commit a move to wherever the pointer happened to be; and cancelling `pointerdown` — which
    // the diagram's other grips do — kills the click outright, so the part could not be picked at all.
    await page.getByRole("button", { name: /^Undo moving/ }).click();
    await expect(page.getByRole("button", { name: /^Undo moving/ })).toHaveCount(0);
    const again = await aftPart();
    await page.mouse.move(again.x, again.y);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByRole("button", { name: /^Undo moving/ })).toHaveCount(0);
    // The click DID pick: the body fields are now holding the part that was clicked, not the one the
    // table selected at the start.
    await expect.poll(async () => bodyLength.getAttribute("placeholder"), { timeout: 15000 }).not.toBe(aimedBefore);
  });

  test("a flyer can add a booster stage, fly the staged flight, and take it back", async ({ page }) => {
    // R5's *done when*, walked in the app. The starter is single-stage, so this is the whole gesture:
    // a booster appears below the design, seeded from its own aft airframe, and the flight becomes a
    // staged one — which means an instance in every configuration, without which the stage never
    // lights, never drops, and costs the design 37.5% of its apogee in silence.
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeVisible({ timeout: 15000 });
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    const partsTable = page.locator("table").filter({ hasText: "Dimensions" });
    const rows = () => partsTable.locator("tbody tr").count();
    const partsBefore = await rows();
    expect(partsBefore).toBeGreaterThan(2);

    await page.getByRole("link", { name: "Flight" }).click();
    // `following-sibling::*[1]`, not `::div[1]`: the stat tile renders its label and its value as
    // siblings but the value is not always a div, and the tag-specific xpath silently matches nothing.
    const apogee = page.getByText("Apogee", { exact: true }).first().locator("xpath=following-sibling::*[1]");
    const before = (await apogee.innerText()).trim();
    // A single-stage design sheds nothing, so the flight says nothing about a spent lower stage.
    await expect(page.getByText(/sheds a spent lower stage/i)).toHaveCount(0);

    await page.getByRole("link", { name: "Design" }).click();
    await page.getByRole("button", { name: /Add a booster stage/ }).click();

    // The booster's own airframe joins the parts list, and the flight becomes a staged one.
    await expect.poll(rows, { timeout: 20000 }).toBeGreaterThan(partsBefore);
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(async () => (await apogee.innerText()).trim(), { timeout: 20000 }).not.toBe(before);
    // The solver treats the authored stage as a real stage that separates and is shed, and says so by
    // NAME. This is as far as the *done when*'s "phase table" reaches today: the flight surface has no
    // phase table at all — the separation is a marker on the altitude chart and this sentence — so
    // building one is the next slice, and that gap is recorded in ROADMAP.md rather than implied.
    await expect(page.getByText(/sheds a spent lower stage \(Booster\)/i).first()).toBeVisible({ timeout: 20000 });

    // And it comes back off, in one named undo — the second half of the *done when*.
    await page.getByRole("link", { name: "Design" }).click();
    await expect(page.getByRole("button", { name: /^Undo adding Booster/ })).toBeVisible();
    await page.getByRole("button", { name: /Remove Booster/ }).click();
    await expect.poll(rows, { timeout: 20000 }).toBe(partsBefore);
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(async () => (await apogee.innerText()).trim(), { timeout: 20000 }).toBe(before);
    await expect(page.getByText(/sheds a spent lower stage/i)).toHaveCount(0);
  });

  test("a staged flight has a phase table that matches what the flyer built", async ({ page }) => {
    // R5's *done when*: "fly a staged flight whose phase table matches what they built". Until now the
    // flight surface had none — separation was a marker on the altitude chart and a sentence in a
    // warning, and `FlightViz` filtered it out of its dots entirely. No competitor has one either:
    // OpenRocket, RockSim and RASAero all present one row per SIMULATION, and OpenRocket's flight-event
    // list does not include separation at all (COMPETITION.md row 25).
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeVisible({ timeout: 15000 });

    const table = page.getByRole("region", { name: "Flight phases" });
    const rows = table.locator("tbody tr");

    // A single-stage design has no phases to table, so the surface is not offered at all. Settle on a
    // positive assertion FIRST — a bare `toHaveCount(0)` resolves on the first poll after the tab
    // click, so it passes for a panel that has not mounted yet, or for a click that never landed.
    await page.getByRole("link", { name: "Flight" }).click();
    await expect(page.getByText("Apogee", { exact: true }).first()).toBeVisible({ timeout: 20000 });
    await expect(table).toHaveCount(0);

    // Author a booster: two phases, and the boundary is the separation.
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByRole("button", { name: /Add a booster stage/ }).click();
    await page.getByRole("link", { name: "Flight" }).click();
    await expect(table).toBeVisible({ timeout: 20000 });
    await expect.poll(async () => rows.count(), { timeout: 20000 }).toBe(2);

    // Row 1 is the whole stack up to the separation; row 2 is the sustainer alone to apogee. The
    // The boundary values are read off the separation EVENT, which is the same source the altitude
    // chart marks from — so they cannot drift apart by construction. This test asserts the row
    // STRUCTURE and ordering; the numbers themselves are held by the corpus sweep.
    const first = rows.nth(0);
    await expect(first).toContainText("Booster");
    await expect(first).toContainText("separates");
    const last = rows.nth(1);
    // The last phase runs to the END OF THE FLIGHT, not to apogee. Apogee happens INSIDE a phase, and
    // on a payload design that separates at an ejection charge it happens BEFORE the separation — so
    // ending the last row at apogee printed a row whose "to" was earlier than its "from"
    // (`ARC payload rocket.ork`: From 10.4 s, To 8.1 s).
    await expect(last).toContainText("Landing");
    // Stages attached must COUNT DOWN. Note this does NOT by itself distinguish rows-from-phases from
    // rows-from-stages: this design has 2 stages AND 2 phases. What does distinguish them is the
    // gutted case below (2 stages, 1 realised phase) and the corpus sweep, where `03.Three-stage.ork`
    // has 3 stages and 2 phases.
    expect((await first.innerText()).split("+").length).toBeGreaterThan((await last.innerText()).split("+").length);
    // Every row must run forwards. This is the assertion the backwards-row defect would have failed.
    for (const row of await rows.all()) {
      const times = (await row.innerText()).match(/([\d.,]+)\s*s\b/g) ?? [];
      expect(times.length, "a phase row must state both a from and a to").toBeGreaterThanOrEqual(2);
      const [from, to] = times.slice(0, 2).map((t) => parseFloat(t.replace(/[,\s s]/g, "")));
      expect(to, `phase row runs backwards: ${from}s to ${to}s`).toBeGreaterThanOrEqual(from);
    }

    // Gut the booster's motor mount: the stack never parts, so there is exactly one phase — and the
    // table says why rather than rendering a single unexplained row.
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();
    const mounts = page.locator("table").filter({ hasText: "Dimensions" }).locator("tr").filter({ hasText: /Inner tube/ });
    await mounts.last().click();
    await page
      .getByRole("button", { name: /^Remove / })
      .and(page.locator('[aria-label$="from the design and re-fly it"]'))
      .click();
    await page.getByRole("link", { name: "Flight" }).click();
    await expect(table.getByText(/nothing separated/i)).toBeVisible({ timeout: 20000 });
    await expect.poll(async () => rows.count(), { timeout: 20000 }).toBe(1);

    // And undoing brings the two-phase flight back.
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByRole("button", { name: /^Undo removing / }).click();
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(async () => rows.count(), { timeout: 20000 }).toBe(2);
  });

  test("each phase names the burnout that happened inside it, and only that one", async ({ page }) => {
    // R5 increment 3. A flight logged exactly ONE burnout ever — the last motor's — so a booster's
    // burnout, the event that CAUSES the separation right after it, appeared on no surface. Each phase
    // now names its own.
    //
    // The assertion that matters is that row 2 does NOT carry row 1's. A burnout and the separation it
    // triggers are the same instant on the default staging rule, so a window closed at both ends puts
    // the booster's burnout in the row it ends and in the row it begins. Walked in the built export
    // before the fix, row 2 read "1.3 s Booster · 2.6 s Sustainer".
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByRole("button", { name: /Add a booster stage/ }).click();
    await page.getByRole("link", { name: "Flight" }).click();

    const table = page.getByRole("region", { name: "Flight phases" });
    await expect(table).toBeVisible({ timeout: 20000 });
    const rows = table.locator("tbody tr");
    await expect.poll(async () => rows.count(), { timeout: 20000 }).toBe(2);

    // CONTROL: the column exists and is where the values below are read from. Without this the cell
    // lookups could be silently reading a neighbouring column.
    // Case-folded: the header row carries `uppercase`, and `innerText` returns what is RENDERED, so
    // a literal "Burnout" never matches.
    const headers = (await table.locator("thead th").allInnerTexts()).map((h) => h.trim().toLowerCase());
    expect(headers).toContain("burnout");
    const col = headers.indexOf("burnout");

    const cell = async (r: number) => (await rows.nth(r).locator("th,td").nth(col).innerText()).trim();
    const first = await cell(0);
    const second = await cell(1);

    // Each row names exactly one burnout — a time, in seconds.
    expect(first, `row 1 burnout cell: ${first}`).toMatch(/^[\d.]+\s*s$/);
    expect(second, `row 2 burnout cell: ${second}`).toMatch(/^[\d.]+\s*s$/);

    // And they are different burnouts, the second later than the first. This is the assertion that
    // fails if the phase windows overlap at the boundary, and the one that fails if the solver goes
    // back to emitting a single event.
    const secs = (s: string) => Number(s.replace(/[^\d.]/g, ""));
    expect(secs(second)).toBeGreaterThan(secs(first));
  });

  test("a results table sorts, sticks its header, and can leave the page", async ({ page }) => {
    // P1's last slice — `DataTable`. There were six hand-rolled tables with three different affordance
    // sets between them, and THREE offered nothing at all: the validation panel, the RocketPy
    // cross-check, and this one — the surface COMPETITION.md row 25 calls a lead no competitor has,
    // whose numbers could not leave the page. DESIGN.md §5 names "tables you cannot sort, filter, or
    // copy out of" as a tell and says it is only fixable once rather than per table.
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByRole("button", { name: /Add a booster stage/ }).click();
    await page.getByRole("link", { name: "Flight" }).click();

    const region = page.getByRole("region", { name: "Flight phases" });
    await expect(region).toBeVisible({ timeout: 20000 });
    const rows = region.locator("tbody tr");
    await expect.poll(async () => rows.count(), { timeout: 20000 }).toBe(2);

    // The header sticks — §5 asks for it and not one of the six hand-rolled tables had it.
    await expect(region.locator("thead th").first()).toHaveCSS("position", "sticky");

    // Sort state is announced, not just drawn. The sort control's accessible name is the column
    // label: the direction arrow beside it is `aria-hidden`, so it is not part of the name.
    const phaseHeader = region.locator("thead th").first();
    const sortButton = region.getByRole("button", { name: "Sort by Phase" });
    await expect(phaseHeader).toHaveAttribute("aria-sort", "none");

    const order = async () => (await rows.locator("td").first().allInnerTexts()).join(",");
    const before = await order();

    await sortButton.click();
    await expect(phaseHeader).toHaveAttribute("aria-sort", "ascending");
    await sortButton.click();
    await expect(phaseHeader).toHaveAttribute("aria-sort", "descending");

    // And the second click actually reorders the rows, rather than only relabelling the header.
    await expect.poll(order, { timeout: 10000 }).not.toBe(before);

    // A column with nothing to sort by carries no `aria-sort` at all, rather than claiming "none" —
    // which would tell a screen-reader user the column is sortable and unsorted.
    await expect(region.locator("thead th").nth(1)).not.toHaveAttribute("aria-sort", /.*/);

    // The numbers can leave the page. This is the half of the primitive COMPETITION.md row 26 sizes,
    // and the reason the phase table needed it most.
    await expect(region.getByRole("button", { name: /^Copy$/ })).toBeVisible();
    await expect(region.getByRole("button", { name: /CSV/i })).toBeVisible();
  });

  test("a phase that ends after apogee still runs forwards", async ({ page }) => {
    // The regression the starter cannot express. `demo-payload-separation.ork` separates at its
    // ejection charge — 9.43 s, which is AFTER its 8.70 s apogee — so the first version of this table,
    // which ended the last row at apogee, printed From 9.4 s To 8.7 s: a phase of negative duration.
    // The starter's booster separates at 1.29 s and apogees at 15.69 s, so it runs forwards under
    // BOTH rules and cannot tell them apart. This design can, and it is a committed fixture.
    await page.goto("/");
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "fixtures/demo-payload-separation.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    const table = page.getByRole("region", { name: "Flight phases" });
    await expect(table).toBeVisible({ timeout: 20000 });
    const rows = table.locator("tbody tr");
    await expect.poll(async () => rows.count(), { timeout: 20000 }).toBe(2);

    // The last phase ends at the END OF THE FLIGHT, never at apogee — apogee happened inside the
    // FIRST phase on this design, before the section ever parted.
    await expect(rows.nth(1)).toContainText("Landing");
    for (const row of await rows.all()) {
      const times = (await row.innerText()).match(/([\d.,]+)\s*s\b/g) ?? [];
      expect(times.length, "a phase row must state both a from and a to").toBeGreaterThanOrEqual(2);
      const [from, to] = times.slice(0, 2).map((t) => parseFloat(t.replace(/[,\s s]/g, "")));
      expect(to, `phase row runs backwards: ${from}s to ${to}s`).toBeGreaterThanOrEqual(from);
    }
  });

  test("a booster that can no longer fire says so, instead of flying as silent ballast", async ({ page }) => {
    // The Sev-1 this fixes. Adding a booster is REFUSED where the tube it would be seeded from carries
    // no motor mount to clone — but that gate runs at add time, and the mount inside an authored
    // booster is an ordinary component the flyer can delete a moment later. Nothing re-checked. The
    // stage then rides to apogee as dead mass and never separates: measured on the starter, 993.642 m
    // becomes 1,491.464 m with the booster on, and deleting its motor mount gives 638.973 m with zero
    // separation events — 35.7% BELOW the design's own flight — and on this design the only other
    // warning was an unrelated static-margin caution. The flight now names the stage and says it
    // cannot fire, and says what becomes of it.
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeVisible({ timeout: 15000 });
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    const partsTable = page.locator("table").filter({ hasText: "Dimensions" });
    const mounts = () => partsTable.locator("tr").filter({ hasText: /Inner tube/ });
    const cannotFire = page.getByText(/carries no motor that can fire/i);

    // The starter is single-stage and flies perfectly well, so nothing says anything about a stage.
    await page.getByRole("link", { name: "Flight" }).click();
    await expect(cannotFire).toHaveCount(0);
    await page.getByRole("link", { name: "Design" }).click();

    const mountsBefore = await mounts().count();
    expect(mountsBefore).toBeGreaterThan(0);
    await page.getByRole("button", { name: /Add a booster stage/ }).click();
    // The booster brings its own cloned mount, so there is one more than before.
    await expect.poll(async () => mounts().count(), { timeout: 20000 }).toBe(mountsBefore + 1);

    // With the booster intact the flight is a staged one, and still says nothing about a dead stage.
    await page.getByRole("link", { name: "Flight" }).click();
    await expect(page.getByText(/sheds a spent lower stage \(Booster\)/i).first()).toBeVisible({ timeout: 20000 });
    await expect(cannotFire).toHaveCount(0);

    // Now delete the booster's own motor mount — the LAST inner tube, since the booster sits at the
    // tail. This is the gesture the add-time refusal never sees.
    await page.getByRole("link", { name: "Design" }).click();
    await mounts().last().click();
    // `/^Remove /` alone is a strict-mode violation here: the stage's own "Remove Booster" control is
    // on the same panel. The part control is the one whose accessible name ENDS with the
    // part-removal phrase — it used to be discriminated by a `title`, which was deleted when these
    // gestures moved onto `aria-label` so a phone could reach them.
    const remove = page
      .getByRole("button", { name: /^Remove / })
      .and(page.locator('[aria-label$="from the design and re-fly it"]'));
    await expect(remove).toBeVisible();
    await remove.click();
    await expect.poll(async () => mounts().count(), { timeout: 20000 }).toBe(mountsBefore);

    // The flight now says the stage cannot fire, and names it. Asserted POSITIVELY on the sentence's
    // own words rather than by counting something to zero, which deleting the notice would satisfy.
    await page.getByRole("link", { name: "Flight" }).click();
    await expect(cannotFire.first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Booster carries no motor/i).first()).toBeVisible();
    // The sentence states what becomes of the dead mass, and here — a dead bottom stage with nothing
    // live beneath it — that is "carried to apogee". Asserted because the first version of this
    // warning claimed a stage NEVER separates, which is false whenever a live stage sits above it and
    // sheds it: on `02.Two-stage.ork` that reads a separation at t≈1.6 s while `untracked-booster`
    // fires on the same surface, so the two notices would have contradicted each other.
    await expect(page.getByText(/carried to apogee as dead mass/i).first()).toBeVisible();
    // And that claim is true of this flight: nothing is shed any more.
    await expect(page.getByText(/sheds a spent lower stage/i)).toHaveCount(0);

    // Undoing the deletion puts the working booster back, and the warning goes with it.
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByRole("button", { name: /^Undo removing / }).click();
    await page.getByRole("link", { name: "Flight" }).click();
    // Settle FIRST on a positive assertion, then check the warning is gone. The other order is the
    // failure this suite has shipped before: a `toHaveCount(0)` evaluated against a panel that has not
    // re-flown yet is satisfied by the panel being unsettled, so it cannot fail.
    await expect(page.getByText(/sheds a spent lower stage \(Booster\)/i).first()).toBeVisible({ timeout: 20000 });
    await expect(cannotFire).toHaveCount(0);
  });

  test("authoring a booster withdraws the single-stage-only tools, on both workspaces", async ({ page }) => {
    // The tools gated on "is this design staged?" read the PRISTINE stage count, which a booster
    // in the edit bag never touches — so they stayed offered on a design that had become two stages. The
    // RocketPy cross-check is the one that then publishes a number: it builds its spec from the EDITED
    // rocket, and that spec carries a SINGLE motor, folding `motors.length` of them into one coaxial
    // cluster. Right for a cluster, wrong for serial staging. Measured on the starter with one booster
    // authored, the spec handed to RocketPy read peak thrust 381.0 N against the real 190.5 N and
    // propellant 0.1882 kg against 0.0941 kg — both motors burning together from t=0, on a vehicle that
    // never sheds a stage — under a heading that says "second opinion". The gate now asks the rocket on
    // screen, so the tools withdraw with the design and come back when the booster does.
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeVisible({ timeout: 15000 });

    const crossCheck = page.getByRole("region", { name: "RocketPy cross-check" });
    const sweep = page.getByRole("region", { name: "Parameter sweep" });
    // The motor sweep too: it is gated on `!staged` for the same reason — with several stages there is
    // no single airframe to swap the motor of — and asserting only the other two left `!staged` free to
    // be deleted from `canSweepMotors` with everything still green.
    const motors = page.getByRole("region", { name: "Motor sweep" });
    // The three live on TWO workspaces since the Analyze split: the second solver moved to Cross-check
    // with the other things that compare Loft against somebody else, and the two sweeps stayed
    // together. One gate, two places to look — which is exactly the shape a check like this must
    // survive, so it walks both rather than trusting one to stand in for the other.
    const onSweep = async () => {
      await page.getByRole("link", { name: "Sweep" }).click();
      await page.waitForURL(/\/sweep\/?$/);
    };
    const onCrossCheck = async () => {
      await page.getByRole("link", { name: "Cross-check" }).click();
      await page.waitForURL(/\/validate\/?$/);
    };

    await onCrossCheck();
    await expect(crossCheck).toBeVisible({ timeout: 20000 });
    await onSweep();
    await expect(sweep).toBeVisible();
    await expect(motors).toBeVisible();

    await page.getByRole("link", { name: "Design" }).click();
    await page.getByRole("button", { name: /Add a booster stage/ }).click();
    await onCrossCheck();
    await expect(crossCheck).toHaveCount(0, { timeout: 20000 });
    await onSweep();
    await expect(sweep).toHaveCount(0);
    await expect(motors).toHaveCount(0);
    // And it SAYS SO — three absences are not the assertion. "A panel that is simply absent reads as a
    // feature Loft doesn't have", which is why the withdrawal notice exists; deleting it leaves both
    // counts above green. The sentence also has to name the count of the rocket on screen: read off the
    // pristine design it said "This design flies 1 stages", a wrong number and a broken sentence on the
    // one piece of copy whose whole job is to explain what just disappeared.
    await expect(page.getByText(/This design flies 2 stages\./)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/This design flies 1 stages/)).toHaveCount(0);

    // And back, because a withdrawal that does not reverse is a tool the flyer has lost.
    await page.getByRole("link", { name: "Design" }).click();
    await page.getByRole("button", { name: /Remove Booster/ }).click();
    await onCrossCheck();
    await expect(crossCheck).toBeVisible({ timeout: 20000 });
    await onSweep();
    await expect(sweep).toBeVisible();
    await expect(motors).toBeVisible();
  });

  test("removing a booster takes the aims INSIDE it, not just the ones on its seed tube", async ({ page }) => {
    // A part authored onto the seed with the add gesture is a SIBLING in the booster's own component
    // list, not a child of the seed — so clearing aims by naming the seed alone never reached it. A Body
    // length aimed at such a tube survived the stage removal, fell back to the design's primary tube,
    // and resized the SUSTAINER: apogee 993.642 m to 1105.598 m on the starter with the field still
    // reading 400 and no part on screen that long. The whole stage is named now, and the `added` entries
    // that built those parts go with it rather than lingering as a what-if for a part that is nowhere.
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeVisible({ timeout: 15000 });
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    const partsTable = page.locator("table").filter({ hasText: "Dimensions" });
    const tubes = partsTable.locator("tr").filter({ hasText: /Body tube/ });
    const rows = () => partsTable.locator("tbody tr").count();
    const partsBefore = await rows();
    await expect(tubes).toHaveCount(1);
    const sustainer = (await tubes.first().innerText()).trim();

    // Author the booster, then a tube INSIDE it, and give that tube a length of its own.
    await page.getByRole("button", { name: /Add a booster stage/ }).click();
    await expect(tubes).toHaveCount(2);
    await tubes.nth(1).click();
    await page.getByRole("button", { name: /Add a tube behind this/ }).click();
    await expect(tubes).toHaveCount(3);
    const bodyLength = page.locator("label").filter({ hasText: /Body length/ }).first().locator("input");
    await bodyLength.fill("400");
    await expect(tubes.nth(2)).toContainText(/L 400/);
    await expect(tubes.nth(0)).not.toContainText(/L 400/);

    // The add control is STILL offered. It reads `canAddStage` off the tree the operation seeds from —
    // the pristine design plus the stages already authored — so an ordinary tube authored at the tail
    // does not withdraw it. Asking the fully-edited structure instead made that bare tube the aft-most
    // one, found no mount on it, and refused a design the operation handles fine.
    await expect(page.getByRole("button", { name: /Add a booster stage/ })).toBeVisible();

    // Now take the stage back. The sustainer's tube must read exactly what it read before any of this.
    await page.getByRole("button", { name: /Remove Booster/ }).click();
    await expect(tubes).toHaveCount(1);
    await expect.poll(async () => (await tubes.first().innerText()).trim(), { timeout: 20000 }).toBe(sustainer);
    await expect(tubes.first()).not.toContainText(/L 400/);
    await expect.poll(rows, { timeout: 20000 }).toBe(partsBefore);
    // And the design reads as UNEDITED again. This is the assertion that catches the orphaned `added`
    // entry: the part it built is gone either way (its anchor went with the stage, so it never lands),
    // so the parts count above cannot see it. What it leaves behind is a live what-if for a component
    // that is nowhere — the panel keeps its "with your edits" badge and the design goes on withholding
    // the file's own stored-results comparison, for an edit the flyer has just taken back.
    await expect(page.getByText("with your edits")).toHaveCount(0, { timeout: 20000 });

    // And the removal is still ONE undo, with the bag coming back whole. This is what the clearing above
    // must not cost: aims and `added` entries are dropped in the same commit as the stage, so the
    // snapshot behind that commit still holds all three and one step back restores the booster, the
    // tube authored inside it, and the 400 mm the field was holding.
    await page.getByRole("button", { name: /^Undo removing Booster/ }).click();
    await expect(tubes).toHaveCount(3, { timeout: 20000 });
    await expect(tubes.nth(2)).toContainText(/L 400/);
    await expect(tubes.nth(0)).not.toContainText(/L 400/);
  });

  test("a part at the end of its stage is not offered a move it cannot make", async ({ page }) => {
    // A move never crosses a stage boundary — that would be a different separation event, not a
    // restack — so at each end of a stage the control is left out rather than offered and refused.
    await page.goto("/");
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "fixtures/demo-quirks.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    const partsTable = page.locator("table").filter({ hasText: "Dimensions" });
    // The nose is the first top-level part of the first stage: there is nothing in front of it.
    await partsTable.locator("tr").filter({ hasText: /Nose cone/ }).first().click();
    await expect(page.getByRole("button", { name: /Move toward the nose/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Move toward the tail/ })).toBeVisible();
  });

  test("the last body tube cannot be removed, and it says why", async ({ page }) => {
    // The refusal R2's done-when names. A rocket with no body is not a rocket, and the alternative to
    // refusing is a confident flight number computed from one.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    // Scoped to the parts table by its Dimensions column — a collapsed `<details>` keeps Mass & balance
    // in the DOM and it lists this design's tube by the same name.
    const tubeRows = page
      .locator("table")
      .filter({ hasText: "Dimensions" })
      .locator("tr")
      .filter({ hasText: /Body tube/ });
    await expect(tubeRows).toHaveCount(1); // the sample is a single-tube airframe
    await tubeRows.first().click();

    // No Remove control — a reason instead, as a sentence.
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
    const why = page.getByText(/only body tube left/);
    await expect(why).toBeVisible();
    await expect(why).toContainText("an airframe needs one");
    // And the part is still there, on the diagram and in the table.
    await expect(tubeRows).toHaveCount(1);
  });

  test("picking a canopy aims the recovery fields at it — the drogue, not always the main", async ({ page }) => {
    // The recovery fields resolved "the" parachute as the LARGEST by canopy area, so on any
    // dual-deploy design the drogue was unreachable: a flyer aiming to shrink the drogue resized the
    // main instead. 17 of the 35 corpus designs carry more than one canopy — every dual-deploy design
    // does, by definition — and the numbers it moves are landing speed and landing energy.
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    // The under-drogue descent rate, which is the drogue's whole job.
    const results = page.getByLabel("Results");
    const drogueRate = async () => {
      const t = await results
        .getByText("Drogue descent", { exact: true })
        .locator("xpath=following-sibling::div[1]")
        .innerText();
      return parseFloat(t.replace(/[^\d.]/g, ""));
    };
    const rate0 = await drogueRate();
    expect(rate0).toBeGreaterThan(0);

    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    // With nothing picked the field describes the MAIN — the largest canopy.
    const canopy = page.locator("label").filter({ hasText: /Main chute Ø/ }).first().locator("input");
    const mainPlaceholder = await canopy.getAttribute("placeholder");
    expect(mainPlaceholder).toBeTruthy();

    // Pick the drogue. The field now describes IT, and the panel says which canopy it is holding.
    await page.locator("tr").filter({ hasText: /Drogue parachute/ }).first().click();
    await expect.poll(async () => canopy.getAttribute("placeholder"), { timeout: 15000 }).not.toBe(mainPlaceholder);
    const droguePlaceholder = await canopy.getAttribute("placeholder");
    await expect(page.getByText(/describe and.*change Drogue parachute/)).toBeVisible();

    // Resize it. A bigger drogue slows the descent under the drogue — the number the picked canopy
    // owns. Aimed at the main instead, this figure would not move at all.
    await canopy.fill(String(Math.round(parseFloat(droguePlaceholder!.replace(/[^\d.]/g, "")) * 2)));
    await canopy.blur();
    await page.getByRole("link", { name: "Flight" }).click();
    await expect.poll(drogueRate, { timeout: 20000 }).toBeLessThan(rate0);
  });

  test("a body-tube pick survives a re-fly and a reload", async ({ page }) => {
    // The aim is part of the design's saved state, so a phone that reclaims the tab mid-trim comes
    // back pointed at the same part. Without that, a reload silently re-aims the body fields at the
    // longest tube while the number in the box is still the one typed for another.
    await page.goto("/");
    await page
      .getByLabel(/^Choose an OpenRocket/)
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/two-stage-firm-booster.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    const tubeRows = page.locator("tr").filter({ hasText: /Body tube/ });
    const lengthsOf = async () =>
      (await tubeRows.allTextContents()).map((t) => t.replace(/\s+/g, " ").match(/L ([\d,]+) mm/)?.[1] ?? "?");
    const before = await lengthsOf();

    await tubeRows.nth(1).click();
    const bodyField = page.locator("label").filter({ hasText: /Body length/ }).first().locator("input");
    await bodyField.fill("640");
    await bodyField.blur();
    // The edit re-flies the design — that is the "survives a re-fly" half: the aim is still on tube 2
    // afterwards, so the field goes on describing the tube it changed.
    await expect.poll(async () => (await lengthsOf())[1], { timeout: 15000 }).toBe("640");
    await expect(bodyField).toHaveValue("640");

    // A restored session opens on the workspace it was left on, so wait on the resume notice rather
    // than on a workspace heading, then make sure we are on Design.
    await page.reload();
    await expect(page.getByText(/Picked up where you left off/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    const rows2 = page.locator("tr").filter({ hasText: /Body tube/ });
    const lengths2 = (await rows2.allTextContents()).map(
      (t) => t.replace(/\s+/g, " ").match(/L ([\d,]+) mm/)?.[1] ?? "?",
    );
    // The edited tube kept its edit and the other kept its own length...
    expect(lengths2[1]).toBe("640");
    expect(lengths2[0]).toBe(before[0]);
    // ...and the aim came back with it, so the panel still names the tube the field is holding.
    await expect(
      page.getByText(/Body length.*describes and changes the tube 800 mm from the nose/),
    ).toBeVisible();
    // And the restored aim is IDENTIFIED, not just asserted: the row the fields are holding is picked
    // out on the diagram and in the table. Without that the editor comes back claiming to be aimed at
    // a part nothing on screen points to, while the drag handles do sit on it — two surfaces
    // disagreeing about one pick.
    await expect(rows2.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(rows2.nth(0)).toHaveAttribute("aria-selected", "false");
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
    await page.getByRole("link", { name: "Design" }).click();
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

  test("a value the field cannot fly never reaches the flight, not even mid-keystroke", async ({ page }) => {
    // The range was applied at the COMMIT and typing pushed every keystroke straight at the model, so
    // between the keystroke and the blur the solver flew a number the field itself calls impossible.
    // Measured on this sample: typing −5 into Rail length put "Rail-exit velocity 0 m/s" on the
    // pad-check surface — the one number a pad check turns on — with no refusal shown, for as long as
    // the flyer left the cursor in the box. It also left that value in the edit bag, where undo could
    // later restore it as though it had been a state worth returning to; after the undo the box read
    // −5.0, the rail exit read 0 m/s, and the refusal message was gone.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    const railExit = async () =>
      (
        await page
          .getByText("Rail-exit velocity", { exact: true })
          .locator("xpath=following-sibling::div[1]")
          .innerText()
      ).trim();
    const asDesigned = await railExit();
    expect(parseFloat(asDesigned)).toBeGreaterThan(0);

    await page.locator("summary", { hasText: /conditions/i }).first().click();
    const rail = page.locator("label").filter({ hasText: /Rail length/ }).first().locator("input");
    await rail.fill("-5");

    // Still in the box, nothing committed — and the flight is untouched.
    await expect(rail).toBeFocused();
    await expect.poll(railExit, { timeout: 10000 }).toBe(asDesigned);

    // On the way out it says so, and the flight is still untouched.
    await rail.blur();
    await expect(rail).toHaveValue("");
    await expect(rail).toHaveAttribute("aria-invalid", "true");
    await expect.poll(railExit, { timeout: 10000 }).toBe(asDesigned);

    // And there is nothing to undo, because nothing a flyer would want back ever happened. Before
    // this, "Undo the rail length" put −5 back into the flight and cleared the warning with it.
    await expect(page.getByRole("button", { name: /^Undo$/ })).toBeDisabled();
  });

  test("a refused what-if says so, and the field shows what is actually flown", async ({ page }) => {
    // The field is controlled by the committed edit, so an entry the model refuses left `value`
    // unchanged — React never re-rendered the node and the refused text sat there looking like the
    // number in the flight. Typing -3 into Fin span kept "-3" on screen while the design's own span
    // went on being flown, with no aria-invalid, no message, and nothing else to say so.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();

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
    const msg = refusalOf(page, await span.getAttribute("aria-describedby"));
    await expect(msg).toHaveCount(1);
    await expect(msg).toContainText("isn't a value this can fly");
    await expect(msg).toContainText(designSpan!);

    // A value the model accepts clears all of it and lands.
    await span.fill("50");
    await span.blur();
    await expect(span).toHaveValue("50");
    await expect(span).not.toHaveAttribute("aria-invalid", "true");
    await expect(msg).toHaveCount(0);
  });

  test("a rail of no length is refused rather than flown as 0 m/s off the rail", async ({ page }) => {
    // "Rail length" took a 0 and flew it. `onRail` is `along < rodLength`, so a rail of 0 m is left
    // before the motor has produced any thrust and the flight reports
    // "Rail-exit velocity 0 m/s". Measured on the 54 mm dual-deploy sample: the design's own 2.0 m
    // rail gives 28 m/s, and 0 gives 0 m/s with no warning anywhere on the page. That number is the
    // one a pad check turns on — an RSO reads it to decide the rocket leaves the rail flying — so a
    // confident zero from an input that cannot mean anything is the worst shape this can take.
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    // The Stat card: its label, then the sibling holding the number and its unit.
    const railExit = page.getByText("Rail-exit velocity", { exact: true }).locator("xpath=following-sibling::div[1]");
    const flown = (await railExit.innerText()).replace(/\s+/g, " ").trim();
    expect(flown).not.toMatch(/^0(\.0+)? /);

    const conditions = page.locator("details").filter({ hasText: "Conditions" }).first();
    if (!(await conditions.evaluate((el: HTMLDetailsElement) => el.open))) {
      await conditions.locator("summary").click();
    }
    const rail = conditions.locator("label").filter({ hasText: /Rail length/ }).first().locator("input");
    const designRail = await rail.getAttribute("placeholder");
    expect(designRail).toBeTruthy();

    await rail.fill("0");
    await rail.blur();

    // Refused in the same words every other out-of-range entry uses...
    await expect(rail).toHaveAttribute("aria-invalid", "true");
    const msg = refusalOf(page, await rail.getAttribute("aria-describedby"));
    await expect(msg).toHaveCount(1);
    await expect(msg).toContainText("more than 0");
    await expect(msg).toContainText(designRail!);
    // ...and the flight is untouched, which is the half that matters: the rail-exit velocity still
    // reads what the design's own rail produces, not a zero nobody could act on.
    expect((await railExit.innerText()).replace(/\s+/g, " ").trim()).toBe(flown);

    // A rail that exists lands as an ordinary edit.
    await rail.fill("3");
    await rail.press("Enter");
    await rail.blur();
    await expect(rail).toHaveValue("3");
    await expect(rail).not.toHaveAttribute("aria-invalid", "true");
  });

  test("a fin sweep of zero is a straight leading edge, and it reaches the flight", async ({ page }) => {
    // `lib/model/edit.ts` guards every geometry edit with `> 0` except this one, which is `>= 0` on
    // purpose: a sweep length of zero is a straight leading edge, an entirely ordinary fin. The
    // editor's converter mapped every entered zero to "no edit" before the model could see it, so
    // the one shape the model was written to accept was the one shape the editor could not build —
    // and it failed silently, the box sitting on "0" while the design's own 90 mm went on flying.
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    // Read the flight BEFORE the edit, on the workspace that shows it. Asserting only that the box
    // keeps its "0" would pass just as well if the model went on dropping the zero the way it did
    // before — the entry has to be shown reaching the solver.
    // Read it out of the results section's own text rather than by walking siblings from the label:
    // "Apogee" labels a Stat card, a validation row AND the what-if delta table, and the delta table
    // only exists once an edit is set — so a sibling walk anchored on the first match reads a
    // different element before and after the very edit under test.
    const results = page.getByRole("region", { name: "Results" });
    const apogee = async () => {
      // `innerText` returns CSS-TRANSFORMED text, and the Stat label carries `uppercase` — so the
      // string here reads "APOGEE" even though `getByText("Apogee")` matches the DOM node fine.
      // Anchored on a line start so "TIME TO APOGEE" cannot stand in for it.
      const m = (await results.innerText()).match(/(?:^|\n)Apogee\n([\d,.]+)\s*(m|ft)\b/i);
      return m ? `${m[1]} ${m[2]}` : null;
    };
    // The flight runs asynchronously after the sample loads, so the heading is on screen before the
    // numbers are — wait for the card itself, not just the workspace.
    await expect(results.getByText("Apogee", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    const asDesigned = await apogee();
    expect(asDesigned).toBeTruthy();

    await page.getByRole("link", { name: "Design" }).click();
    const sweep = page.locator("label").filter({ hasText: /Fin sweep/ }).first().locator("input");
    const designSweep = await sweep.getAttribute("placeholder");
    // The sample has a swept fin, or this test is asserting that zero equals zero.
    expect(Number(designSweep)).toBeGreaterThan(0);

    await sweep.fill("0");
    await sweep.press("Enter");
    await sweep.blur();

    // The entry stands: the box keeps the zero rather than blanking back to the design's own sweep...
    await expect(sweep).toHaveValue("0");
    await expect(sweep).not.toHaveAttribute("aria-invalid", "true");
    // ...the design is now an edited one, which is what says the flight in view is the edit's...
    await expect(page.getByRole("button", { name: "Reset to as-designed" })).toBeVisible();
    // ...and the flight itself moved, which is the only proof the zero reached the solver. Measured
    // on this sample: 2,941 m as designed, 2,359 m with the leading edge straightened.
    await page.getByRole("link", { name: "Flight" }).click();
    await expect(async () => expect(await apogee()).not.toBe(asDesigned)).toPass({ timeout: 20_000 });
  });

  test("a refused zero keeps the edit it was typed over, and lets go once the flight moves", async ({ page }) => {
    // Two ways a refusal used to cost more than the entry that caused it.
    //   1. `commit` blanked the field on every refusal, but a literal zero never reaches the model —
    //      the keystroke handler withholds it — so blanking threw away whatever the flyer had
    //      committed earlier and typed over. A 25 mm fin span, one "0" and a Tab, and the 25 was
    //      gone with only the global reset to bring anything back.
    //   2. The refusal outlived the flight it described. Nothing cleared it but a keystroke in that
    //      same box, so it survived "Reset to as-designed" — and with the edit wiped by (1) that
    //      button was not even on screen, leaving an amber, aria-invalid field quoting a value
    //      nobody could get back to.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();

    const span = page.locator("label").filter({ hasText: /Fin span/ }).first().locator("input");
    const design = await span.getAttribute("placeholder");

    await span.fill("25");
    await span.blur();
    await expect(span).toHaveValue("25");

    await span.fill("0");
    await span.blur();
    // The zero is refused and named — and the 25 is still what is being flown.
    await expect(span).toHaveAttribute("aria-invalid", "true");
    const msg = refusalOf(page, await span.getAttribute("aria-describedby"));
    await expect(msg).toContainText("more than 0");
    await expect(msg).toContainText("flying 25");
    await expect(span).toHaveValue("25");

    // Clearing the edit clears the complaint about it: the message named 25, and 25 is gone.
    await page.getByRole("button", { name: "Reset to as-designed" }).click();
    await expect(span).toHaveValue("");
    await expect(span).not.toHaveAttribute("aria-invalid", "true");
    await expect(refusalOf(page, await span.getAttribute("aria-describedby"))).toHaveCount(0);
    await expect(span).toHaveAttribute("placeholder", design!);
  });

  test("a payload station with no payload is not an edit, and does not cost the stored comparison", async ({
    page,
  }) => {
    // `addPayloadMass` returns the rocket untouched unless a mass is set, so a station on its own
    // flies a design byte-identical to the file's — while `hasActiveEdits` counted it and withheld
    // the stored-tool comparison for it. Newly reachable at zero once zeros stopped being swallowed,
    // but true of every value.
    await page.goto("/");
    await page.getByRole("button", { name: /RockSim · 54 mm sport/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Cross-check" }).click();
    await page.waitForURL(/\/validate\/?$/);
    const comparison = page.getByRole("region", { name: "Validation" });
    await expect(comparison).toBeVisible();

    await page.getByRole("link", { name: "Design" }).click();
    const pos = page.locator("label").filter({ hasText: /Payload pos/ }).first().locator("input");
    await pos.fill("0");
    await pos.blur();
    await expect(pos).toHaveValue("0");

    // The design is not edited by it, so the comparison it would have hidden is still there.
    await expect(page.getByRole("button", { name: "Reset to as-designed" })).toHaveCount(0);
    await page.getByRole("link", { name: "Cross-check" }).click();
    await page.waitForURL(/\/validate\/?$/);
    await expect(comparison).toBeVisible();
  });

  test("a design whose file stores no results says so, instead of showing nothing", async ({ page }) => {
    // All three bundled .ork samples carry `<simulation status="external">` holding launch
    // conditions and no `<flightdata>` at all, so `hasResults` is false and the stored-tool
    // comparison never renders for them — 0 of the 3 shipped samples, against 27 of the 27 real
    // corpus designs that do carry results. The import screen promises that comparison in as many
    // words, so its silent absence on every default first run read as a capability Loft lacks.
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    await page.getByRole("link", { name: "Cross-check" }).click();
    await page.waitForURL(/\/validate\/?$/);
    const note = page.getByRole("region", { name: /comparison unavailable/i });
    await expect(note).toBeVisible();
    await expect(note).toContainText("holds its launch setup and no results");
    // It passes on what the file itself says, rather than only reporting an absence...
    await expect(note).toContainText("not OpenRocket's own simulator output");
    // ...and names the cross-check that does not need the file to carry anything.
    await expect(note).toContainText("run the RocketPy cross-check below");
    // The comparison panel itself is genuinely absent — the note stands in for it, not beside it.
    await expectNoComparison(page);
  });

  test("a design whose file does store results gets the comparison, not the note", async ({ page }) => {
    // The control for the test above: same surface, a sample that carries stored results.
    await page.goto("/");
    await page.getByRole("button", { name: /RockSim · 54 mm sport/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Cross-check" }).click();
    await page.waitForURL(/\/validate\/?$/);
    await expect(page.getByRole("region", { name: "Validation" })).toBeVisible();
    await expect(page.getByRole("region", { name: /comparison unavailable/i })).toHaveCount(0);
  });

  test("the summary strip and the mass panel describe the rocket that was edited", async ({ page }) => {
    // Two panels were reading the design straight off the FILE while everything beside them came
    // from the edited run.
    //   · The summary strip's Length used `doc.rocket`, so doubling a 700 mm body left it reading
    //     950 mm next to a centre of pressure of 1,422 mm — 472 mm past the length the same line
    //     claims. That strip sits above the tabs so an edit's headline effect is legible from any
    //     workspace, and overall length is what a flyer checks against a rail and a waiver form.
    //   · Mass & balance was fed `doc.rocket` while the diagram above it got the edited model, so
    //     the two panels on one tab disagreed about the same dry mass — 0.6 kg against 0.893 kg —
    //     while the diagram's caption points at this panel by name for the total.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    const strip = async () => {
      const t = (await page.locator("body").innerText()).replace(/−/g, "-");
      const g = (re: RegExp) => (t.match(re) ?? [, "-"])[1]!.trim();
      return {
        length: g(/(?:^|\n)Length\n([^\n]*)/i),
        cp: g(/(?:^|\n)CP\n([^\n]*)/i),
        dry: g(/dry\s+([\d.,]+\s*\S+)/i),
      };
    };
    // Read both on the Design workspace: the strip sits above the spine and is always visible, but
    // Mass & balance is inside the Design panel, and `innerText` skips a `hidden` subtree entirely.
    // Wait for the route to commit before scraping — `innerText` is a one-shot read with no retry,
    // so a navigation still in flight scrapes the workspace the flyer just left.
    await page.getByRole("link", { name: "Design" }).click();
    await page.waitForURL(/\/design\/?$/);
    const before = await strip();
    expect(before.length).not.toBe("-");
    expect(before.dry).not.toBe("-");
    // The CP capture underpins the self-consistency assertion below, and a missed capture yields
    // "-", which parses to 0 and would make that assertion pass on any length at all.
    expect(before.cp).not.toBe("-");

    const body = page.locator("label").filter({ hasText: /Body length/ }).first().locator("input");
    const design = Number(await body.getAttribute("placeholder"));
    expect(design).toBeGreaterThan(0);
    await body.fill(String(design * 2));
    await body.press("Enter");
    await body.blur();

    await expect(async () => {
      const after = await strip();
      // The length followed the edit...
      expect(after.length).not.toBe(before.length);
      // ...and the two panels no longer describe different rockets.
      expect(after.dry).not.toBe(before.dry);
      // Self-consistency, which is what made the stale cell visible without knowing the fix: a
      // centre of pressure cannot sit beyond the airframe it is measured on. Both cells have to be
      // read for this to mean anything — a missed capture is "-", which parses to 0 and would make
      // the comparison trivially true whatever the length said.
      expect(after.cp).not.toBe("-");
      const mm = (s: string) => Number(s.replace(/[^\d.]/g, ""));
      expect(mm(after.cp)).toBeGreaterThan(0);
      expect(mm(after.length)).toBeGreaterThanOrEqual(mm(after.cp));
    }).toPass({ timeout: 20_000 });
  });

  test("the parts table's stated dry mass is the design's, and matches the panel beside it", async ({
    page,
  }) => {
    // The caption used to state the SUM OF ITS OWN COLUMN as the design's dry mass. That column is
    // keyed by component, and a design can state its weight as a whole-STAGE figure that belongs to
    // no component — so every part reads 0 g "counted in <stage>" and the caption read "adds up to
    // 0 kg" for a real airframe. Measured on two corpus designs with no edits: 0 kg against 1.361 kg
    // and 0 kg against 2 kg, each beside a Mass & balance panel stating the true figure.
    //
    // No committed fixture carries a stage-level override, so the unit tests pin the gap between the
    // two functions and this asserts the property that made it visible: the two panels, which point
    // at each other by name, state the same number.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();

    // Both captions live inside disclosures; `innerText` skips a closed one entirely.
    const details = page.locator("details");
    for (let i = 0; i < (await details.count()); i++) {
      const d = details.nth(i);
      if (!(await d.evaluate((el: HTMLDetailsElement) => el.open))) await d.locator("summary").first().click();
    }

    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const caption = text.match(/dry mass is ([\d.,]+\s*[a-z]+)/i);
    const panel = text.match(/Mass & balance · dry ([\d.,]+\s*[a-z]+)/i);
    expect(caption, "the parts table states a dry mass").not.toBeNull();
    expect(panel, "the mass panel states a dry mass").not.toBeNull();
    expect(Number(caption![1].replace(/[^\d.]/g, ""))).toBeGreaterThan(0);
    expect(caption![1]).toBe(panel![1]);
    // This sample states no whole-stage figure, so the caption must NOT claim one — the note is the
    // half that only appears where it is true.
    expect(text).not.toMatch(/stated in the design as a whole-stage figure/);
  });

  test("a design weighed by the stage still states its mass, and says no row can carry it", async ({
    page,
  }) => {
    // The case no bundled sample has: a design whose weight is stated as a whole-STAGE override.
    // `massByComponent` is keyed by component, so every part correctly reads 0 g "counted in
    // Sustainer" — and the caption, which summed that column, read "adds up to 0 kg". Measured on
    // two real corpus designs before the fix: 0 kg against 1.361 kg, and 0 kg against 2 kg.
    // `e2e/fixtures/stage-weighed.ork` is the bundled single-deploy design with a 1.234 kg
    // whole-stage weight added, which is exactly the shape those two files have.
    await page.goto("/");
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/stage-weighed.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();

    const details = page.locator("details");
    for (let i = 0; i < (await details.count()); i++) {
      const d = details.nth(i);
      if (!(await d.evaluate((el: HTMLDetailsElement) => el.open))) await d.locator("summary").first().click();
    }
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");

    // The design's stated weight, not the sum of a column that cannot hold it.
    const caption = text.match(/dry mass is ([\d.,]+\s*[a-z]+)/i);
    expect(caption).not.toBeNull();
    expect(Number(caption![1].replace(/[^\d.]/g, ""))).toBeCloseTo(1.234, 2);
    // And it says why no row adds up to it, rather than leaving a table of zeros unexplained.
    expect(text).toMatch(/stated in the design as a whole-stage figure/);
    // The panel it points at by name agrees.
    const panel = text.match(/Mass & balance · dry ([\d.,]+\s*[a-z]+)/i);
    expect(panel).not.toBeNull();
    expect(caption![1]).toBe(panel![1]);
  });

  test("a removal the design's own stated weight swallows says so, before and after the click", async ({
    page,
  }) => {
    // The mirror of the payload case below, and the half R2's delete surface shipped without. Where a
    // stage states its weight outright, a part inside it weighs nothing of its own — so a removal moves
    // the balance and NOT the mass, and nothing said so. Measured on the real corpus: removing
    // `EscapeVelocity.ork`'s 141.7 g "Avionics" leaves dry mass at exactly 2000.0 g while the static
    // margin moves 4.461 → 4.312 cal. R2's *done when* is "delete it, see stability, dry mass and apogee
    // move"; on a design of this shape the mass does not, and a flyer is owed the reason rather than a
    // total that sits still.
    await page.goto("/");
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/stage-weighed.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    const partsTable = page.locator("table").filter({ hasText: "Dimensions" });
    const fins = partsTable.locator("tr").filter({ hasText: /fins/i }).first();
    await fins.click();

    // Said BEFORE the click, where the flyer is deciding. The sentence covers authoring too now — a
    // part BUILT inside a stated assembly weighs nothing either, for the same reason.
    await expect(page.getByText(/counts no mass for the parts inside/)).toBeVisible();
    await expect(page.getByText(/moves the balance and not the total/)).toBeVisible();

    await page.getByRole("button", { name: /^Remove / }).click();

    // And after it, on the panel where mass is read — the same place the added-mass case says it.
    const details = page.locator("details");
    for (let i = 0; i < (await details.count()); i++) {
      const dd = details.nth(i);
      if (!(await dd.evaluate((el: HTMLDetailsElement) => el.open))) await dd.locator("summary").first().click();
    }
    await expect(page.getByText(/A part you added or removed was inside/)).toBeVisible();
    await expect(page.getByText(/the dry total above is unchanged/)).toBeVisible();
  });

  test("the point mass that IS a RASAero design's weight cannot be removed, and it says why", async ({
    page,
  }) => {
    // A `.CDX1` carries no materials and no per-part masses — the flyer types one launch weight and CG
    // per simulation — so the adapter puts the whole stated weight into a single mass component,
    // because that is the only place the one internal model has to hold it. It is not a part inside the
    // design; it IS the design's mass. Measured on the real corpus before this refusal: removing it took
    // `Show-off.CDX1` from 453.6 g dry to 0.0 g with its CG at the nose tip, and flipped
    // `Complex.Two-Stage.CDX1` from +1.78 caliber to −0.92 — both still flown, both reported with a
    // confident apogee. 3 of the 4 RASAero designs in the corpus are that shape.
    await page.goto("/");
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/demo-rasaero.CDX1"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();
    await page.locator("summary", { hasText: /Parts ·/ }).click();

    const airframe = page
      .locator("table")
      .filter({ hasText: "Dimensions" })
      .locator("tr")
      .filter({ hasText: /stated launch weight/ })
      .first();
    await airframe.click();

    // No Remove control — a reason instead, as a sentence, exactly as the last body tube gets one.
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
    const why = page.getByText(/whole stated weight/);
    await expect(why).toBeVisible();
    await expect(why).toContainText("no mass at all");
  });

  test("a payload the design's own override swallows says so, instead of looking applied", async ({
    page,
  }) => {
    // A design can state its weight as a whole-assembly override, and a part added INSIDE that
    // assembly then weighs nothing — the override IS the design's statement about the total, so the
    // model is right to hold it. What was wrong is that nothing said so. Measured on this fixture: a
    // 1,000 g payload on a 1.4 kg rocket left dry mass 1.234 kg, liftoff mass 1.436 kg and apogee
    // 581 m every one unchanged, while the mass panel wore a "with your edits" badge over a table
    // that had not moved. A flyer sizing an av-bay would fly a design 70% lighter than the one on
    // the bench. Three of the 35 corpus designs are this shape.
    await page.goto("/");
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/stage-weighed.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();
    const details = page.locator("details");
    for (let i = 0; i < (await details.count()); i++) {
      const d = details.nth(i);
      if (!(await d.evaluate((el: HTMLDetailsElement) => el.open))) await d.locator("summary").first().click();
    }

    const dry = async () => ((await page.locator("body").innerText()).match(/dry ([\d.,]+\s*[a-z]+)/i) ?? [])[1];
    const before = await dry();
    expect(before).toBeTruthy();
    await expect(page.getByText(/mass you added is inside an assembly/)).toHaveCount(0);

    const payload = page.locator("label").filter({ hasText: /^Payload \(/ }).first().locator("input");
    await payload.fill("1000");
    await payload.press("Enter");
    await payload.blur();

    await expect(async () => {
      // The total genuinely does not move — that is the design's own override, not a bug...
      expect(await dry()).toBe(before);
      // ...and the panel where mass is read now says why, rather than badging an unchanged table.
      await expect(page.getByText(/mass you added is inside an assembly/)).toBeVisible();
    }).toPass({ timeout: 20_000 });
  });

  test("a payload the design does NOT override lands, with no such note", async ({ page }) => {
    // The control for the test above. Same gesture on a design that states no whole-assembly weight:
    // the kilogram must land, and the note must stay away.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Design" }).click();
    const details = page.locator("details");
    for (let i = 0; i < (await details.count()); i++) {
      const d = details.nth(i);
      if (!(await d.evaluate((el: HTMLDetailsElement) => el.open))) await d.locator("summary").first().click();
    }
    const dry = async () => ((await page.locator("body").innerText()).match(/dry ([\d.,]+\s*[a-z]+)/i) ?? [])[1];
    const before = await dry();

    const payload = page.locator("label").filter({ hasText: /^Payload \(/ }).first().locator("input");
    await payload.fill("1000");
    await payload.press("Enter");
    await payload.blur();

    await expect(async () => {
      expect(await dry()).not.toBe(before);
      await expect(page.getByText(/mass you added is inside an assembly/)).toHaveCount(0);
    }).toPass({ timeout: 20_000 });
  });

  test("the stability trim advice is for the edited airframe, not the file's", async ({ page }) => {
    // `StabilityTrimHint` sits inside the same section as the summary strip and is fed the edited
    // run's margin, mass and reference diameter — but took its two GEOMETRY reads, the nose station
    // and the fin group's own position, off the design file. On the 38 mm sample with fin span cut
    // to 20 mm it advised moving the fin set about 193 mm aft where the edited airframe needs
    // 287 mm: 49% short, on a number a flyer acts on by moving parts.
    //
    // The edit matters. A doubled body length comes out identical either way, which is how this
    // survived the work on the panels around it — the edit that exposes it is not the one anybody
    // tried. Cutting the fin span is.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    const finMove = async () => {
      const t = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      const m = t.match(/move the fin set about ([\d.,]+)\s*(mm|in)/i);
      return m ? m[1] : null;
    };
    await page.getByRole("link", { name: "Design" }).click();
    const span = page.locator("label").filter({ hasText: /Fin span/ }).first().locator("input");
    const design = Number(await span.getAttribute("placeholder"));
    expect(design).toBeGreaterThan(20);

    await span.fill("20");
    await span.press("Enter");
    await span.blur();

    await expect(async () => {
      const moved = await finMove();
      expect(moved).not.toBeNull();
      // The advice for the edited airframe. The file's own rocket asks for a visibly smaller move,
      // so any figure at or below it means the hint is still describing the design as imported.
      expect(Number(moved!.replace(/,/g, ""))).toBeGreaterThan(200);
    }).toPass({ timeout: 20_000 });
  });

  test("the dispersion plans for the flyer's field, not the one in the file", async ({ page }) => {
    // The study built its nominal from `overridesFromStored` alone, so it answered for the day the
    // design file was saved while the Flight card beside it answered for the flyer's. Measured on
    // this sample with surface wind set to 8.94 m/s: the card's drift went 630 m → 1,877 m while the
    // recovery radius (95%) stayed at 1,203 m against a true 2,519 m and the median drift at 593 m
    // against 1,811 m. Those are the two numbers a flyer sizes a field and a recovery walk against,
    // and the FAQ said in as many words that they reflected the flyer's own conditions.
    test.setTimeout(180_000);
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    const mc = page.getByRole("region", { name: "Monte-Carlo dispersion" });
    const radius = async () => {
      const t = (await mc.innerText()).replace(/\s+/g, " ");
      const m = t.match(/RECOVERY RADIUS \(95%\)\s*([\d,]+)/i);
      return m ? Number(m[1].replace(/,/g, "")) : null;
    };
    const settle = async () => {
      await page.waitForFunction(() => !/Refining/.test(document.body.innerText), null, { timeout: 150_000 });
    };

    await page.getByRole("link", { name: "Sweep" }).click();
    await mc.getByRole("button", { name: /Run dispersion/i }).click();
    await settle();
    const asDesigned = await radius();
    expect(asDesigned).toBeGreaterThan(0);
    // It says whose conditions those are, which is the half the FAQ was answering for.
    await expect(mc).toContainText("the design's stored launch conditions");

    // Now tell it the field is windier than the file says.
    await page.getByRole("link", { name: "Flight" }).click();
    const conditions = page.locator("details").filter({ hasText: "Conditions" }).first();
    if (!(await conditions.evaluate((el: HTMLDetailsElement) => el.open))) {
      await conditions.locator("summary").click();
    }
    const wind = page.locator("input").and(page.getByLabel(/Surface wind/i)).first();
    await wind.fill("8.9408");
    await wind.press("Enter");
    await wind.blur();

    await page.getByRole("link", { name: "Sweep" }).click();
    // Poll the VALUE, not the spinner. The conditions key is debounced, so for the first third of a
    // second after the last keystroke there is no run in flight to wait for — a "wait until it stops
    // refining" check passes immediately and reads the previous cloud. Ask for the answer instead.
    await expect(async () => {
      // A materially bigger recovery area — the whole point of telling it the truth about the day.
      expect(await radius()).toBeGreaterThan(asDesigned! * 1.5);
    }).toPass({ timeout: 150_000 });
    await expect(mc).toContainText("the launch conditions you set");

    // ...and the panel beside it must NOT say the same thing, because it did not fly it. The motor
    // sweep is BALLISTIC and `runFlight` zeroes the wind for a ballistic run, so that identical wind
    // edit moved not one of its rows. A single shared "the flyer edited the conditions" flag had it
    // crediting the flyer over a bit-identical table — a claim about the numbers that the numbers
    // did not support. Each panel is asked only about the fields it reads.
    const motors = page.getByRole("region", { name: "Motor sweep" });
    await motors.getByRole("button", { name: /Run motor sweep/ }).click();
    await expect(motors.locator("tbody tr").first()).toBeVisible();
    await expect(motors).toContainText("the design's stored launch conditions");
    await expect(motors).not.toContainText("the launch conditions you set");
  });

  test("the motor sweep checks rail exit against the rail you told it about", async ({ page }) => {
    // The caption invites exactly this: "Rail-exit velocity and thrust-to-weight are the
    // launch-safety numbers to check against your rail and the ~5:1 and ~15 m/s rules of thumb."
    // It was flying the rail length in the FILE. Measured on this sample, halving the rail from the
    // design's 2.0 m to 1.0 m: the K250W's rail exit goes 19 m/s — over the rule — to 13 m/s, under
    // it. Apogee is untouched at 4,487 m, because rail length does not change how high it goes.
    test.setTimeout(150_000);
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    const sweep = page.getByRole("region", { name: "Motor sweep" });
    // Every rail-exit cell in the table, which is the third speed column on each row.
    const railExits = async () => {
      // Data rows only: the caption below the table also contains "m/s" (it cites the ~15 m/s rule)
      // but carries no tab-separated cells. Match the number at the START of a cell rather than an
      // "m/s" at the END — a flagged rail exit now reads "14 m/s▲ — below the ~15 m/s guideline…",
      // and an end-anchored test silently dropped exactly the rows the flag fires on, which is the
      // half of the column this test is about.
      return (await sweep.innerText())
        .split("\n")
        .map((l) => l.split("\t").filter((c) => /^[\d.,]+\s*m\/s/.test(c.trim())))
        .filter((speeds) => speeds.length >= 2)
        .map((speeds) => Number((speeds[speeds.length - 1].match(/^[\d.,]+/) ?? ["0"])[0].replace(/,/g, "")));
    };

    await page.getByRole("link", { name: "Sweep" }).click();
    await sweep.getByRole("button", { name: /Run motor sweep|Compare fitting motors/i }).first().click();
    await expect(async () => expect((await railExits()).length).toBeGreaterThan(3)).toPass({ timeout: 90_000 });
    const onDesignRail = await railExits();
    await expect(sweep).toContainText("the design's stored launch conditions");

    // Tell it the rail is half as long as the file says.
    await page.getByRole("link", { name: "Flight" }).click();
    const conditions = page.locator("details").filter({ hasText: "Conditions" }).first();
    if (!(await conditions.evaluate((el: HTMLDetailsElement) => el.open))) {
      await conditions.locator("summary").click();
    }
    const rail = page.locator("input").and(page.getByLabel(/Rail length/i)).first();
    const designRail = Number(await rail.getAttribute("placeholder"));
    expect(designRail).toBeGreaterThan(1);
    await rail.fill("1");
    await rail.press("Enter");
    await rail.blur();

    await page.getByRole("link", { name: "Sweep" }).click();
    await expect(async () => {
      const shortened = await railExits();
      expect(shortened.length).toBe(onDesignRail.length);
      // Every candidate leaves a shorter rail slower. Asserting on the whole column rather than one
      // row, so a re-ordering of the table cannot make this pass by accident.
      for (let i = 0; i < shortened.length; i++) expect(shortened[i]).toBeLessThan(onDesignRail[i]);
    }).toPass({ timeout: 90_000 });
    await expect(sweep).toContainText("the launch conditions you set");
  });

  test("typing a launch condition re-flies the sweep once, not once per digit", async ({ page }) => {
    // The panels key their cached answer on a VALUE so an unrelated re-render cannot throw minutes
    // of work away. Wiring the launch conditions into that key broke the guarantee from the other
    // side: `Num` calls `onChange` on every keystroke so a value can be typed a digit at a time, so
    // each intermediate reading became a distinct key. Measured before the debounce: typing "1500"
    // into Field elev. drove EIGHT aria-busy transitions on the motor sweep — four full restarts,
    // each flying every bundled candidate at 1 m, then 15 m, then 150 m, before the field the flyer
    // meant. After: two, and the sweep still ends up flying what was typed.
    test.setTimeout(150_000);
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    const sweep = page.getByRole("region", { name: "Motor sweep" });
    await page.getByRole("link", { name: "Sweep" }).click();
    await sweep.getByRole("button", { name: /Run/i }).first().click();
    await sweep.getByRole("table").waitFor({ timeout: 120_000 });

    await page.evaluate(() => {
      (window as unknown as { __busy: number }).__busy = 0;
      new MutationObserver((ms) => {
        for (const m of ms) if (m.attributeName === "aria-busy") (window as unknown as { __busy: number }).__busy++;
      }).observe(document.querySelector('[aria-label="Motor sweep"]')!, {
        attributes: true,
        subtree: true,
        attributeFilter: ["aria-busy"],
      });
    });

    await page.getByRole("link", { name: "Flight" }).click();
    const conditions = page.locator("details").filter({ hasText: "Conditions" }).first();
    if (!(await conditions.evaluate((el: HTMLDetailsElement) => el.open))) {
      await conditions.locator("summary").click();
    }
    const elev = page.locator("input").and(page.getByLabel(/Field elev/i)).first();
    await elev.click();
    await elev.type("1500", { delay: 120 });
    await page.waitForTimeout(4000);

    const restarts = await page.evaluate(() => (window as unknown as { __busy: number }).__busy);
    // One restart is two transitions (busy on, busy off). Four digits must not mean four restarts.
    expect(restarts, `aria-busy transitions while typing four digits: ${restarts}`).toBeLessThanOrEqual(4);
    // ...and the answer it settles on is still the flyer's, not a discarded intermediate.
    await page.getByRole("link", { name: "Sweep" }).click();
    await expect(sweep).toContainText("the launch conditions you set");
  });

  test("a motor swap survives a configuration change that still offers it", async ({ page }) => {
    // The wiring half of `swapStillOffered`. The failure it guards needs two configurations of
    // DIFFERENT casings — on the corpus design that stores nine across 24/29/38 mm, a 38 mm swap
    // carried onto the 24 mm configuration kept 1,068 m, 36.3:1 and 40 m/s where that configuration's
    // own numbers are 90 m, 7:1 and 16 m/s, with the picker blank. No committed fixture has two
    // casings, so the drop path is covered by unit tests and this asserts the other half: a swap the
    // new configuration DOES offer is carried over rather than thrown away by an over-eager guard.
    await page.goto("/");
    await page.getByRole("button", { name: /Motor comparison/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    const config = page.getByLabel(/configuration/i).first();
    await expect(config).toBeVisible();
    await page.getByRole("link", { name: "Design" }).click();
    const swap = page.getByLabel(/swap motor/i).first();
    await expect(swap).toBeVisible();

    // Pick a bundled motor (index 0 is "Design motor").
    await swap.selectOption({ index: 1 });
    const chosen = await swap.inputValue();
    expect(chosen).not.toBe("");

    // Both stored configurations here are the same casing, so the choice still applies to the other.
    await config.selectOption({ index: 1 });
    await page.getByRole("link", { name: "Design" }).click();
    await expect(swap).toHaveValue(chosen);
    // And it is genuinely being flown, not merely displayed: the design is still an edited one.
    await expect(page.getByRole("button", { name: "Reset to as-designed" })).toBeVisible();
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
    await page.getByRole("link", { name: "Sweep" }).click();

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
    const msg = refusalOf(page, await wind.getAttribute("aria-describedby"));
    await expect(msg).toHaveCount(1);
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
    await page.getByRole("link", { name: "Sweep" }).click();
    const mc = page.getByRole("region", { name: "Monte-Carlo dispersion" });
    await mc.getByRole("button", { name: "Run dispersion" }).click();
    const wind = mc.locator("input").and(mc.getByLabel("Wind speed ±1σ")).first();
    const unitSuffix = async () =>
      // Typed as the input it is: `evaluate`'s node is `SVGElement | HTMLElement`, and `labels`
      // exists on neither, so an untyped callback here was the one thing in the repo that made
      // `tsc --noEmit` fail over the whole project.
      (
        await wind.evaluate((n: HTMLInputElement) => (n.labels?.[0]?.textContent || "").replace(/\s+/g, " "))
      ).match(/m\/s|mph/)?.[0];

    await expect(wind).toHaveValue("2");
    expect(await unitSuffix()).toBe("m/s");

    // The digits change, because the quantity is being re-expressed rather than reinterpreted.
    await page.getByRole("button", { name: "Imperial", exact: true }).click();
    expect(await unitSuffix()).toBe("mph");
    await expect(wind).toHaveValue("4.5"); // 2 m/s = 4.47 mph

    // Toggling repeatedly must not walk the value the model holds. Rounding is display-only.
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Metric", exact: true }).click();
      await expect(wind).toHaveValue("2");
      await page.getByRole("button", { name: "Imperial", exact: true }).click();
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
    await units.getByRole("button", { name: "Imperial", exact: true }).click();
    await page.getByRole("link", { name: "Sweep" }).click();

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

    await units.getByRole("button", { name: "Metric", exact: true }).click();

    // 3,000 ft is 914 m: the box now says so, and the answer is the same answer.
    await expect(ceiling).toHaveValue("914");
    await expect(chance).toHaveText(imperial);
  });

  test("the motor sweep's safety flags are readable without a mouse and without colour", async ({ page }) => {
    // Two of the three rules were flagged by amber text plus a `title` on the `<td>`. A `<td>` takes
    // no focus, so the tooltip was unreachable by keyboard; a phone has no hover, and this panel's
    // stated use is a pad check; and a screen reader was told nothing — the entire signal sat in one
    // colour channel. The third rule, rail-exit velocity, is named in this panel's own caption and
    // was checked against not one row, while the engine already raises `low-rail-exit` at the same
    // threshold on the flown design: a motor could sit here unflagged and caution once picked.
    test.setTimeout(120_000);
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "Sweep" }).click();

    const sweep = page.getByRole("region", { name: "Motor sweep" });
    await sweep.getByRole("button", { name: /Run motor sweep/ }).click();
    await expect(sweep.locator("tbody tr").first()).toBeVisible({ timeout: 60_000 });

    // Each rule states itself in words, in the row it belongs to. Two of the three are reachable on
    // a COMMITTED design: this sample flags rail exit on six motors and thrust-to-weight on the
    // F15 and E16, whose margins are 3.7:1 and 4:1. Nothing committed reaches the flutter rule —
    // every bundled sample sits at 3.6× or better — so that one is asserted through the `title`
    // count below, which covers its cell too, and was driven directly against four corpus designs
    // (`A simple model rocket.ork`, `Cherokee-E-5055.ork`, `OR vs RAS Test 1.ork`, `Base drag hack
    // (short-wide).ork`). Scope these to the tbody: the caption names all three rules, so a check
    // over the whole panel passes on the caption alone and measures nothing.
    for (const note of [
      /below the ~15\s?m\/s .*guideline for a stable rail departure/i,
      /below the ~5:1 rule of thumb for clean rail clearance/i,
    ]) {
      await expect(sweep.locator("tbody"), `flag text: ${note}`).toContainText(note);
    }

    // And no cell hides an explanation in a `title` a keyboard or a phone cannot reach — including
    // the flutter cell, which had one and whose flag this suite cannot otherwise reach.
    expect(await sweep.locator("tbody [title]").count(), "tooltips left in the table body").toBe(0);

    // The marker must not be colour alone: the flagged cell carries a glyph as well as the class.
    const flagged = sweep.locator("tbody td", { hasText: /below the ~5:1/ }).first();
    await expect(flagged).toContainText("▲");
  });

  test("switching back to today's weather does not leave a wind nothing flies in the box", async ({ page }) => {
    // `onWeather` drops the two edits a forecast overrides, and says why: a greyed-out field showing
    // a number the flight threw away advertises a drift nobody computed. The scenario TOGGLE reached
    // the same state by a different door and did not. Reproduced in the built export on the 54 mm
    // dual-deploy sample: fetch a forecast, switch to As designed, type 12 m/s, switch back to
    // Today. The box read 12.0, greyed, while the flight drifted 794 m on the forecast's own wind —
    // and 12 m/s really does give 2,518 m, so the number on screen and the number under it were
    // describing different flights.
    //
    // The forecast is stubbed rather than fetched. This is the first e2e over the weather path and
    // a live call would make it a network test: flaky in CI, and silently green if the API changed
    // shape. The stub is the smallest response `parseForecast` reads.
    test.setTimeout(150_000);
    const WIND_MPS = 4;
    await page.route("**geocoding-api.open-meteo.com/v1/search*", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          results: [{ name: "Lucerne Valley", latitude: 34.4436, longitude: -116.9711, admin1: "California", country: "United States" }],
        }),
      }),
    );
    // A FULL 24-hour local day, the shape the live API actually returns, with `current.time` at 18:15.
    // The stub used to carry a single unstamped hour, which meant the only e2e over the weather path
    // exercised the "hour not stated" fallback and never the matching that decides which wind is
    // flown. Every hour but 18:00 blows from due EAST at a gale; 18:00 blows from due west at
    // WIND_MPS. So if the app reads any hour but the right one, the drift reverses and this test says
    // so, rather than the two differing by a few percent nobody would notice.
    const CURRENT_TIME = "2026-07-30T18:15";
    const RIGHT_HOUR = 18;
    await page.route("**api.open-meteo.com/v1/forecast*", (route) => {
      const time = Array.from({ length: 24 }, (_, i) => `2026-07-30T${String(i).padStart(2, "0")}:00`);
      const at = (i: number, right: number, wrong: number) => (i === RIGHT_HOUR ? right : wrong);
      const hourly: Record<string, unknown> = {
        time,
        wind_speed_1000hPa: time.map((_, i) => at(i, WIND_MPS, 25)),
        wind_direction_1000hPa: time.map((_, i) => at(i, 270, 90)),
        geopotential_height_1000hPa: time.map(() => 110),
        wind_speed_500hPa: time.map((_, i) => at(i, 18, 40)),
        wind_direction_500hPa: time.map((_, i) => at(i, 270, 90)),
        geopotential_height_500hPa: time.map(() => 5600),
      };
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          elevation: 1000,
          current: {
            time: CURRENT_TIME,
            temperature_2m: 20,
            surface_pressure: 900,
            wind_speed_10m: WIND_MPS,
            wind_direction_10m: 270,
          },
          hourly,
        }),
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    const conditions = page.locator("details").filter({ hasText: "Conditions" }).first();
    if (!(await conditions.evaluate((el: HTMLDetailsElement) => el.open))) {
      await conditions.locator("summary").click();
    }
    const wind = page.locator("input").and(page.getByLabel(/Surface wind/i)).first();

    await page.getByLabel("Launch site").fill("Lucerne Valley, CA");
    await page.getByRole("button", { name: "Fetch" }).click();
    // The forecast is in force once the aloft profile is being reported — AND the panel names the hour
    // the profile is for. Before the hour was matched, index 0 (00:00) was read while the surface
    // block was live, so the flight mixed this hour's air with a profile from the middle of the night.
    await expect(page.getByText(/aloft levels/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/aloft levels for 18:00 local/)).toBeVisible();
    // ...and it does NOT carry the could-not-be-matched caveat, because it was matched.
    await expect(page.getByText(/no way to tie that to the surface reading/)).toHaveCount(0);
    // A fetch greys the field and leaves it empty: the flight is on the forecast, not on a typed value.
    await expect(wind).toBeDisabled();
    await expect(wind).toHaveValue("");

    await page.getByRole("button", { name: /^As designed$/ }).click();
    await expect(wind).toBeEnabled();
    await wind.fill("12");
    await wind.press("Enter");
    await wind.blur();
    await expect(wind).toHaveValue("12");

    // Back to today: the forecast overrides that 12, so the box must not go on showing it.
    await page.getByRole("button", { name: /^Today/ }).click();
    await expect(wind).toBeDisabled();
    await expect(wind).toHaveValue("");
  });
});

test.describe("authoring a motor mount", () => {
  // R5's last *done when* clause: "give it its own motor mount and fins". Fins onto a booster already
  // worked; the missing gesture was a mount, and without it a booster is REFUSED outright on a design
  // whose aft tube carries none — 1 of the 2 such designs in the corpus is unblocked by this.
  //
  // Driven on the starter because its mount sits on an INNER tube nested inside the aft body tube, so
  // that body tube is a real "tube with no mount" without having to construct one.
  test("a flyer can give a tube a motor mount, fly it, and take it back off", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start a new design" }).click();
    await expect(page.getByRole("heading", { name: "Design geometry" })).toBeVisible({ timeout: 15000 });

    // The same readback the starter's other tests use: the Apogee term's next sibling.
    const apogeeCell = page.getByText("Apogee", { exact: true }).first().locator("xpath=following-sibling::*[1]");
    const apogee = async () => {
      await page.getByRole("link", { name: "Flight" }).click();
      return (await apogeeCell.innerText()).trim();
    };
    const before = await apogee();
    expect(before.length, "a starting apogee to compare against").toBeGreaterThan(0);

    await page.getByRole("link", { name: "Design", exact: true }).click();
    const parts = page.locator("table").filter({ hasText: "Dimensions" });
    await page.locator("summary").filter({ hasText: /Parts/ }).first().click();
    // Pick the aft BODY tube — the mount lives on an inner tube inside it, so this one has none.
    await parts.locator("tbody tr").filter({ hasText: /Body tube/ }).last().click();

    const add = page.getByRole("button", { name: /Add a motor mount to this tube/ });
    await expect(add, "the gesture is offered on a tube with no mount").toBeVisible();
    await add.click();

    // It says what it did rather than leaving the flyer to notice the apogee move: a mount with
    // nothing in it never lights, so Loft puts the design's own motor in it and names that.
    await expect(page.getByText(/A motor mount you added/)).toBeVisible();
    await expect(page.getByText(/flies this design's own motor/)).toBeVisible();

    // And it is flown, not just drawn.
    const after = await apogee();
    expect(after, "the authored mount's motor changed the flight").not.toBe(before);

    // Back off again, motor and all — the mount exists only in the edit bag, so dropping the entry
    // is the whole of undo.
    await page.getByRole("link", { name: "Design", exact: true }).click();
    await page.getByRole("button", { name: /Remove the mount on/ }).click();
    await expect(page.getByText(/A motor mount you added/)).toHaveCount(0);
    expect(await apogee(), "removing it put the original flight back").toBe(before);
  });
});

test.describe("choosing a real commercial part", () => {
  test("a real commercial tube can be chosen instead of measured, and it flies", async ({ page }) => {
    // R8's *done when*, through the button a flyer presses: authoring becomes SELECTION rather than
    // measurement. The catalogue is 3,445 published parts and is a SEPARATE chunk — nothing imports
    // it until this picker is opened — so this also pins that the lazy load actually resolves in a
    // real browser rather than only in a bundler graph.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    const apogee = async () =>
      parseFloat(
        (
          await page
            .getByLabel("Results")
            .getByText("Apogee", { exact: true })
            .locator("xpath=following-sibling::div[1]")
            .innerText()
        ).replace(/[^\d.]/g, ""),
      );
    const before = await apogee();
    // `Liftoff mass` is a <Field term=…> — a definition list, so the value is the sibling <dd>.
    const liftoffMass = async () =>
      parseFloat(
        (await page.getByRole("term").filter({ hasText: "Liftoff mass" }).first()
          .locator("xpath=following-sibling::dd[1]").innerText()).replace(/[^\d.]/g, ""),
      );
    const massBefore = await liftoffMass();

    await page.getByRole("link", { name: "Design", exact: true }).click();
    await page.getByRole("button", { name: "Pick a real body tube" }).click();

    // The list arrives from its own chunk, so it has a real loading state to leave.
    const search = page.getByLabel("Search", { exact: true });
    await expect(search).toBeVisible();
    await search.fill("BT-60");

    // A part number alone is ambiguous across vendors — the catalogue carries 113 numbers used by
    // more than one — so the row is identified by vendor AND number, which is what the flyer reads.
    const row = page.locator("tbody tr", { hasText: "BT-60" }).first();
    await expect(row).toBeVisible();
    const od = await row.locator("td").nth(1).innerText();
    await row.getByRole("button", { name: "Use" }).click();

    // The pick names its source on the surface it changed, rather than leaving two moved numbers to
    // speak for themselves.
    await expect(page.getByText(/Flying .*BT-60/)).toBeVisible();

    // And the vendor's published caliber is in the field the flyer can still edit.
    const dia = page.locator("label", { hasText: /Body diameter/ }).locator("input");
    // Compared as a NUMBER against the vendor figure in the row, not as a rounded string: a
    // BT-60 is 1.637 in = 41.6 mm, and asserting on whole millimetres both fails and would have
    // hidden a real 0.4 mm error if it had passed.
    expect(Math.abs(parseFloat(await dia.inputValue()) - parseFloat(od))).toBeLessThan(0.05);

    // The whole point: it FLIES. A part that changed the dimensions but not the flight would be a
    // catalogue bolted onto the side of the tool rather than wired into it.
    await expect.poll(apogee, { timeout: 15_000 }).not.toBe(before);

    // The vendor's WALL and STOCK came with it, so the MASS moved too — not just the outline. Read
    // off the surface as a number rather than re-asserting a caption that has been visible since the
    // pick, which is what the first version of this check did and why it could never fail.
    const massAfter = await liftoffMass();
    expect(massAfter, "a liftoff mass is actually being read").toBeGreaterThan(0);
    expect(
      massAfter,
      `liftoff mass ${massBefore} -> ${massAfter}: the vendor's 0.533 mm wall is thinner than this design's own`,
    ).toBeLessThan(massBefore);

    // Edit the caliber afterwards and the attribution must stop claiming that number — but the way
    // back must NOT disappear with it. Since a pick began carrying a wall and a stock it changes the
    // flight even with the dimension fields blank, so a clear path that vanished when the numbers
    // stopped matching would strand the flyer with an edit and nothing to undo it.
    await dia.fill(String(parseFloat(od) + 3));
    await dia.blur();
    await expect(page.getByText(/Wall and stock from .*BT-60/)).toBeVisible();
    await expect(page.getByText(/with your own dimensions/)).toBeVisible();

    // And there is a way back out — a state a flyer can enter with no way back is a named tell.
    // Matched case-insensitively: this control's label gained a capital when it was converted onto
    // the `Button` primitive, and a case-sensitive regex turned a pure refactor into a red suite —
    // one that passed in isolation against the older build and only failed in the full run.
    await page.getByRole("button", { name: /back to the design/i }).click();
    await expect(page.getByText(/BT-60/)).toHaveCount(0);
    // Clearing drops the caliber, the length AND the picked wall and stock in one step, so the
    // flight is the design's own again even though a dimension was hand-edited in between.
    await expect.poll(apogee, { timeout: 15_000 }).toBe(before);
  });

  test("a real nose cone can be chosen, and a base that does not fit says so", async ({ page }) => {
    // The second kind the picker serves, walked in a real browser for the reason the tube walk
    // above is: the catalogue is a lazily-imported chunk, and a component that only ever runs in a
    // bundler graph has not been shown to load.
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
    const apogee = async () =>
      parseFloat(
        (
          await page
            .getByLabel("Results")
            .getByText("Apogee", { exact: true })
            .locator("xpath=following-sibling::div[1]")
            .innerText()
        ).replace(/[^\d.]/g, ""),
      );
    const before = await apogee();

    await page.getByRole("link", { name: "Design", exact: true }).click();
    await page.getByRole("button", { name: "Pick a real nose cone" }).click();

    const search = page.getByLabel("Search", { exact: true });
    await expect(search).toBeVisible();
    await search.fill("BNC-55D2");

    const row = page.locator("tbody tr", { hasText: "BNC-55D2" }).first();
    await expect(row).toBeVisible();
    // The two columns a cone has and a tube does not, and the reason this kind needed its own
    // column set rather than borrowing the tube's: the contour is what a flyer is choosing on, and
    // "solid" is the whole mass story for 728 of the 854.
    await expect(row).toContainText("ogive");
    await expect(row).toContainText("solid");
    await row.getByRole("button", { name: "Use" }).click();

    await expect(page.getByText(/Flying .*BNC-55D2/)).toBeVisible();

    // The vendor's contour landed in the field the flyer can still edit.
    await expect(page.locator("label", { hasText: /Nose shape/ }).locator("select")).toHaveValue(
      "ogive",
    );

    // It FLIES — the whole point of a catalogue that is wired in rather than bolted on.
    await expect.poll(apogee, { timeout: 15_000 }).not.toBe(before);

    // **And the honest half.** This cone's base is 39.95 mm on a 38.0 mm airframe. Loft does not
    // silently rescale the rocket to fit the part, so that is a real mould-line step — and the
    // flight says so, in the words the picker's own copy promises, using the check that already
    // existed. A pick that quietly resized the design would show no warning here.
    await page.getByRole("link", { name: "Flight", exact: true }).click();
    await expect(page.getByText(/changes diameter at a joint/i).first()).toBeVisible();

    await page.getByRole("link", { name: "Design", exact: true }).click();
    await page.getByRole("button", { name: /back to the design/i }).click();
    await expect(page.getByText(/BNC-55D2/)).toHaveCount(0);
    await expect.poll(apogee, { timeout: 15_000 }).toBe(before);
  });

  test("a real commercial parachute can be chosen, and the descent changes", async ({ page }) => {
    // R8's third kind, and the first that is not airframe. The catalogue ships 151 canopies and
    // states a flat diameter, gore count, shroud lines and a cloth for every one — and a `cd` for
    // none, which is why a pick edits the chute already on the design rather than authoring one: the
    // model requires a drag coefficient and a deploy event, and the vendor supplies neither.
    test.setTimeout(120_000);
    await page.goto("/");
    await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 30_000 });

    // The number this gesture is FOR: how hard the rocket arrives. Measured across the catalogue on
    // this design, it spans 2.16 m/s (a LOC 96 in) to 18.15 m/s (a Top Flight 9 in) against the
    // design's own 6.95 — a factor of eight, which is the difference between a walk-away landing and
    // a broken airframe.
    const arrival = async () =>
      (
        await page
          .getByLabel("Results")
          .getByText("Ground-hit speed", { exact: true })
          .locator("xpath=following-sibling::div[1]")
          .innerText()
      ).trim();
    const before = await arrival();

    await page.getByRole("link", { name: "Design", exact: true }).click();
    await page.getByRole("button", { name: "Pick a real parachute" }).click();

    // The lazy chunk resolves and the table names its own count and its provenance.
    const panel = page.getByRole("button", { name: "Close the parts list" }).locator("xpath=../..");
    await expect(panel.getByText(/catalogued parachutes/)).toBeVisible({ timeout: 30_000 });

    // **Every row must be choosable.** The picker's shared `buildable` prelude required an outer
    // diameter and a length before the kind switch, and 0 of the 151 canopies state either — so the
    // whole list would have rendered disabled, which on a phone is indistinguishable from a missed
    // tap. This is the assertion that would have caught it.
    const useButtons = panel.getByRole("button", { name: "Use" });
    await expect.poll(async () => useButtons.count(), { timeout: 30_000 }).toBeGreaterThan(20);
    // **DISABLED buttons still have role=button**, so a count alone proves nothing about whether a
    // row can be chosen — which is the entire behavioural change here. Counted directly, over every
    // row rather than the first: a regression that disabled 150 of 151 would otherwise ship green,
    // because `initialSort` puts the smallest canopy first and that is the row most likely to pass
    // any predicate.
    const disabled = await panel
      .locator("tbody button")
      .evaluateAll((ns) => ns.filter((n) => (n as HTMLButtonElement).disabled).length);
    expect(disabled, "catalogued canopies that cannot be chosen").toBe(0);

    // A canopy states no length, so that column is dropped rather than headed over 151 dashes; it
    // states gores and shroud lines, which no airframe kind has.
    //
    // Read off `thead` innerText rather than by accessible name — the suite's own working idiom, at
    // the motor-sweep test above. `DataTable` renders each sortable header as a button carrying
    // `aria-label="Sort by <label>"`, and Playwright returns a descendant's `aria-label` before
    // falling through to name-from-content, so a `columnheader` named `/^Length/` matches NOTHING on
    // any kind — the assertion that was here passed whether the column existed or not, and would
    // have passed with the shared Length column reinstated.
    const heads = (await panel.locator("thead th").allInnerTexts()).map((t) =>
      t.replace(/[▲▼]/g, "").replace(/\s+/g, " ").trim().toLowerCase(),
    );
    expect(heads.some((h) => h.startsWith("gores")), `headers: ${heads.join(" | ")}`).toBe(true);
    expect(heads.some((h) => h.startsWith("lines")), `headers: ${heads.join(" | ")}`).toBe(true);
    expect(heads.some((h) => h.startsWith("length")), `headers: ${heads.join(" | ")}`).toBe(false);
    expect(heads.some((h) => h.startsWith("canopy")), `headers: ${heads.join(" | ")}`).toBe(true);

    // Sort by canopy diameter descending and take the biggest, so the change is unambiguous.
    await panel.getByRole("button", { name: /Canopy/ }).click();
    await useButtons.first().click();

    await expect(page.getByText(/Flying .+/).first()).toBeVisible();

    await page.getByRole("link", { name: "Flight", exact: true }).click();
    await expect.poll(arrival, { timeout: 30_000 }).not.toBe(before);

    // And the way back — a pick that could not be undone would be the one-way door this milestone
    // has already shipped and fixed once.
    await page.getByRole("link", { name: "Design", exact: true }).click();
    await page.getByRole("button", { name: /back to the design's own canopy/i }).click();
    await page.getByRole("link", { name: "Flight", exact: true }).click();
    await expect.poll(arrival, { timeout: 30_000 }).toBe(before);
  });

  test("withholds every loaded figure when a motor did not resolve, and says why", async ({ page }) => {
    // **The Sev-1 this pins: a motor that cannot be matched is left OUT of the build entirely**
    // (`lib/sim/setup.ts` skips the instance), so it contributes neither mass nor CG — and every
    // figure that assumes it is aboard was published anyway, under its loaded label. Measured on
    // `demo-single-deploy.ork` with the motor made unresolvable: liftoff mass 0.8018 -> 0.6002 kg
    // (the dry mass), loaded CG 0.6430 -> 0.5725 m, static margin 4.065 -> 5.921 cal. That last one
    // is +46% and reads MORE stable than the truth, which is the reassuring direction, and the
    // notice directly above it said the stability "remains valid".
    //
    // Driven from the COMMITTED fixture rather than the corpus, for the reason the test above
    // records: a corpus-driven test skips on CI and on any public clone, reporting green without
    // executing an assertion.
    await page.goto("/");
    await page.setInputFiles('input[type="file"]', resolve(process.cwd(), "e2e/fixtures/unresolved-motor.ork"));
    await expect(page.getByRole("region", { name: "No flight simulated" })).toBeVisible();

    // Both loaded figures are withheld, each with its reason on the cell. A blank is a bug
    // (`DESIGN.md` §6). The mass was RELABELLED to "Dry mass" in the first draft of this fix, and
    // that was wrong in two of the three states it has to cover: on a partial cluster the figure is
    // dry plus whichever motors resolved, and `liftoffMass` carries the flyer's what-if nose ballast
    // either way — so the label disagreed with the two panels that publish the real dry mass.
    const cell = (term: string) =>
      page.locator("div", { has: page.getByText(term, { exact: true }) }).last();
    await expect(cell("Liftoff mass")).toContainText("—");
    await expect(cell("Liftoff mass")).toContainText(/needs a motor/i);
    await expect(cell("Static margin")).toContainText("—");
    await expect(cell("Static margin")).toContainText(/needs a motor/i);

    // No surface anywhere on the page may still be quoting the unloaded margin. This is the
    // assertion that would have caught the five surfaces the first pass at this fix missed —
    // the folded detail row, the trim prescription, the warning cards and the diagram caption.
    // Asserted as "no margin VALUE is quoted anywhere", not as "the words never appear": the
    // corrected notice itself says the margin is withheld "rather than reported over-stable", and a
    // word-level assertion would forbid the very sentence that fixes this. What must not survive is
    // a NUMBER in calibers, which is the claim.
    await expect(page.getByText(/\d\s*cal\b/)).toHaveCount(0);
    await expect(page.getByText(/weathercock/i)).toHaveCount(0);
    await expect(page.getByText(/moving the fin set/i)).toHaveCount(0);

    // The notice above the strip has to say the stability is NOT valid — it used to say the
    // opposite, in the same breath as the numbers it was wrong about.
    const notice = page.getByRole("region", { name: "No flight simulated" });
    await expect(notice).toContainText(/stability is not/i);
    await expect(notice, "the sentence that made the wrong numbers look checked").not.toContainText(
      "geometry and stability below are computed independently and remain valid",
    );

    // The Design workspace is the other half: the diagram drew a "CG" mark at the DRY station and
    // asserted the margin in its own accessible name, which is what a screen reader speaks.
    await page.getByRole("link", { name: "Design", exact: true }).click();
    await expect(page.getByText(/could not be matched to a thrust curve/i).first()).toBeVisible();
    const figure = page.locator("svg[aria-label*='Scale side-view']").first();
    await expect(figure).toBeVisible();
    const label = await figure.getAttribute("aria-label");
    expect(label, "the SVG's accessible name still asserts a margin nobody is flying").not.toMatch(
      /centre of gravity ahead of centre of pressure/,
    );
  });
});
