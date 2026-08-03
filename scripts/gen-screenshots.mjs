#!/usr/bin/env node
/** Take the README's screenshots from the BUILT EXPORT, so they can be regenerated rather than
 *  going stale by hand.
 *
 *  **P5's *done when* asks that the README show what the tool does with images rather than describing
 *  it.** The trap in that clause is not taking the pictures — it is that hand-captured screenshots
 *  are wrong within a fortnight and nobody notices, because a README image has no test. Making them
 *  the output of a committed script turns "are these current?" into a command anybody can run:
 *
 *  ```bash
 *  npm run build && npx serve -c e2e-serve.json -l 3000 &   # or reuse the e2e server
 *  node scripts/gen-screenshots.mjs
 *  ```
 *
 *  **Dev-only, and deliberately NOT in `prebuild` or `postbuild`.** It needs a browser and a running
 *  server, which the deploy job has neither of, and a build that fails because Chromium is missing
 *  would gate the deploy on something the deploy does not need. The images are committed; this
 *  regenerates them.
 *
 *  **Every shot is driven, not posed.** Each one loads a real bundled sample and waits for the
 *  numbers to be on screen before capturing, so a picture can never show a loading state or an empty
 *  panel — and if the app stops being able to reach that state, this fails loudly instead of writing
 *  a screenshot of the failure.
 *
 *  Determinism: the desktop shots are taken at a fixed 1280x800 with `deviceScaleFactor: 2`, the
 *  phone shot at 390x844. Nothing here reads the clock or the network — the sample designs are
 *  bundled and the flight is computed locally — so re-running on the same commit produces the same
 *  pictures.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "docs/screenshots");
const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

/** Load the bundled 38 mm sample and wait until a flight is actually on screen. */
async function loadSample(page) {
  await page.goto(`${BASE}/`);
  await page.getByRole("button", { name: /38 mm single-deploy/ }).click();
  await page.getByRole("heading", { name: "Flight", exact: true }).waitFor({ timeout: 30_000 });
  // The apogee figure, not just the heading: the heading renders before the solver has run.
  await page.getByText("Apogee", { exact: true }).first().waitFor({ timeout: 30_000 });
}

const SHOTS = [
  {
    file: "landing.png",
    viewport: DESKTOP,
    what: "the first screen, with no file",
    async take(page) {
      await page.goto(`${BASE}/`);
      await page.getByRole("button", { name: /38 mm single-deploy/ }).waitFor({ timeout: 30_000 });
    },
  },
  {
    file: "flight.png",
    viewport: DESKTOP,
    what: "a flown design — the numbers and the curves",
    take: loadSample,
  },
  {
    file: "design.png",
    viewport: DESKTOP,
    what: "the builder: the airframe, its parts, and the fields that reshape it",
    async take(page) {
      await loadSample(page);
      await page.getByRole("link", { name: "Design", exact: true }).click();
      await page.getByRole("region", { name: "Design workspace" }).waitFor({ timeout: 30_000 });
      // The parts disclosure, opened, so the shot shows the component tree rather than a closed
      // summary — it is the thing a stranger is being shown "the builder" to see.
      //
      // NOT `page.locator("svg").first()`: on this route the first svg in DOM order sits inside the
      // HIDDEN flight panel, so waiting for it to be visible times out while the page is perfectly
      // ready. A structural locator that happens to resolve is not the same as one that resolves to
      // the thing you meant.
      const parts = page.locator("summary", { hasText: /Parts ·/ });
      await parts.waitFor({ timeout: 30_000 });
      await parts.click();
      await page.getByRole("table").first().waitFor({ timeout: 30_000 });
      // Opening the disclosure scrolls the page, which cut the airframe in half in the first take.
      // Anchor on the workspace region so the diagram is whole and the parts table starts under it —
      // the shot is meant to show the picture AND the tree, which is the point of this surface.
      await page.evaluate(() => {
        const el = document.querySelector('[aria-label="Design workspace"]');
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 8, behavior: "instant" });
      });
      await page.waitForTimeout(300);
    },
  },
  {
    file: "phone.png",
    viewport: PHONE,
    what: "the same flight, one-handed at the pad",
    take: loadSample,
  },
];

const browser = await chromium.launch();
mkdirSync(outDir, { recursive: true });
let failed = 0;
for (const shot of SHOTS) {
  const context = await browser.newContext({
    viewport: shot.viewport,
    deviceScaleFactor: 2,
    // Light, always: a README renders on a white page on GitHub, and a dark screenshot beside light
    // prose is the same inconsistency the design system exists to prevent.
    colorScheme: "light",
    hasTouch: shot.viewport === PHONE,
    isMobile: shot.viewport === PHONE,
  });
  const page = await context.newPage();
  try {
    await shot.take(page);
    await page.screenshot({ path: resolve(outDir, shot.file), fullPage: false });
    console.log(`gen-screenshots: ${shot.file} — ${shot.what}`);
  } catch (err) {
    failed++;
    console.error(`gen-screenshots: FAILED ${shot.file} — ${err.message.split("\n")[0]}`);
  }
  await context.close();
}
await browser.close();
if (failed) {
  console.error(`gen-screenshots: ${failed} of ${SHOTS.length} could not be taken.`);
  process.exit(1);
}
console.log(`gen-screenshots: ${SHOTS.length} written to docs/screenshots/`);
