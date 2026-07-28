import { defineConfig, devices } from "@playwright/test";

// Headless browser (Chromium) end-to-end tests. These cover the interactive
// behavior the vitest unit tests can't — client-side compute, URL sync, the
// theme toggle, the ground-test log, a clean hydration (no console errors), and
// an axe accessibility audit.
//
// Run against the STATIC EXPORT: `npm run build` first (emits out/), then
// `npm run test:e2e`. The webServer serves out/ with `serve` instead of
// `next start` (which doesn't work with output: export), using e2e-serve.json.

export default defineConfig({
  testDir: "./e2e",
  // Playwright's default per-test budget is 30 s, and five tests wait on a session restore with an
  // explicit `{ timeout: 30_000 }` — the WHOLE budget — before doing anything else, so a slow reload
  // left nothing for the steps after it and the test timed out mid-click rather than on a real
  // assertion. Seen once in six full runs on this four-core box, passing 3/3 in isolation; locally
  // `retries: 0`, so it is a hard red. 60 s leaves headroom after the worst restore observed without
  // making a genuinely hung test slow to report.
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // Allow pointing at a pre-installed Chromium (e.g. a sandboxed CI image where
    // `playwright install` can't download). Unset in normal/GitHub CI, where the
    // matching browser is installed via `npx playwright install chromium`.
    ...(process.env.PW_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PW_EXECUTABLE_PATH } }
      : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx serve -c e2e-serve.json -l 3000 --no-clipboard --no-request-logging",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
