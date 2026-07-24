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
    await expect(page.getByRole("heading", { name: "OpenRocket vs Loft" })).toBeVisible();

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
    await expect(page.getByRole("heading", { name: "OpenRocket vs Loft" })).toHaveCount(0);
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
    await expect(page.getByRole("heading", { name: "OpenRocket vs Loft" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset to as-designed" })).toHaveCount(0);

    // Stack a design what-if: nose ballast makes the rocket heavier and lower.
    await page.getByRole("tab", { name: "Design" }).click();
    await page.getByLabel(/Nose ballast/).fill("500");
    await expect.poll(summaryApogee).toBeLessThan(before);

    // Back on Flight, the hypothetical flight has dropped the stored comparison, and the header now
    // offers a one-click way back.
    await page.getByRole("tab", { name: "Flight" }).click();
    await expect(page.getByRole("heading", { name: "OpenRocket vs Loft" })).toHaveCount(0);
    const resetBtn = page.getByRole("button", { name: "Reset to as-designed" });
    await expect(resetBtn).toBeVisible();

    // Reset restores the exact as-designed flight: the apogee returns, the comparison is back, and
    // the control disappears (nothing left to undo).
    await resetBtn.click();
    await expect.poll(summaryApogee).toBe(before);
    await expect(page.getByRole("heading", { name: "OpenRocket vs Loft" })).toBeVisible();
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

  test("dual-deploy sample flags transonic and shows two deploy markers", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: /Loft Demo/ })).toBeVisible();
    await expect(page.getByText(/transonic|supersonic/i).first()).toBeVisible();
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

    // Each configuration compares against its own stored OpenRocket results — and is labelled with
    // the flown configuration's simulation, not always the first one.
    await expect(page.getByRole("heading", { name: "OpenRocket vs Loft" })).toBeVisible();
    const validation = page.getByRole("region", { name: "Validation" });
    await expect(validation.getByText("G40W", { exact: false })).toBeVisible();
    await expect(validation.getByText("H128W", { exact: false })).toHaveCount(0);
  });

  test("an imported file with a stored per-step log shows the drag cross-check", async ({ page }) => {
    await page.goto("/");
    // A design carrying the tool's own step-by-step flight (a hand-authored log, not a bundled demo).
    await page
      .getByLabel(/Choose an OpenRocket .ork or RockSim .rkt file/)
      .setInputFiles(resolve(process.cwd(), "e2e/fixtures/logged-sample.ork"));
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible({ timeout: 15000 });

    // Loft overlays its own solver on the file's stored per-step flight: an altitude curve and a
    // drag-coefficient curve, the latter quantified with a mean-gap figure.
    const panel = page.getByRole("region", { name: "Stored-flight cross-check" });
    await expect(panel).toBeVisible();
    await expect(panel.locator("svg")).toHaveCount(2);
    await expect(panel.getByText(/mean gap/)).toBeVisible();
  });

  test("a two-stage design with an undersized booster chute is flagged for a firm booster landing", async ({ page }) => {
    await page.goto("/");
    // A serial two-stage rocket whose booster recovers under its own (too-small) canopy: it lands
    // firm, which the range-safety readout must flag even though only the top stage is flown down.
    await page
      .getByLabel(/Choose an OpenRocket .ork or RockSim .rkt file/)
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
    await expect(page.getByRole("heading", { name: "OpenRocket vs Loft" })).toBeVisible();

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
    await expect(page.getByRole("heading", { name: "OpenRocket vs Loft" })).toBeVisible();
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
});
