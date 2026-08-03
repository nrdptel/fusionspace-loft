import { test, expect } from "@playwright/test";

// **A STATIC import, and it has to be.** Both cases below first read this module with a dynamic
// `await import("../lib/version")`, which works locally and fails in CI with
// `SyntaxError: Unexpected token 'export'`: a dynamic import is resolved at RUNTIME, so Playwright's
// TypeScript transform never sees the file and Node is handed `export interface` to parse. A static
// import goes through the transform like every other import in this suite.
import { RELEASES, VERSION, RELEASED } from "../lib/version";

test.describe("Docs", () => {
  test("the docs hub links to the trust pages", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.getByRole("heading", { name: "What Loft is" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Methods" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Limitations log" }).first()).toBeVisible();
  });

  test("methods page cites Barrowman", async ({ page }) => {
    await page.goto("/docs/methods");
    await expect(page.getByText("Barrowman", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/static margin/i).first()).toBeVisible();
  });

  test("validation page is explicit about what the samples do and don't show", async ({ page }) => {
    await page.goto("/docs/validation");
    await expect(page.getByRole("heading", { name: "Validation", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /What the bundled samples/ })).toBeVisible();
    // The real cross-check — an independent engine over the same designs — is still tabulated.
    await expect(page.getByRole("heading", { name: /Against RocketPy/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Apogee", exact: true }).first()).toBeVisible();
  });

  test("docs are reachable from the header", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Docs" }).first().click();
    await expect(page).toHaveURL(/\/docs\/?$/);
  });

  test("every docs page is readable offline, and each is itself", async ({ page, context }) => {
    // The pad has no signal, and the pad is exactly where "how far do I trust this number?"
    // gets asked. Each page must come back as ITSELF offline — a shell fallback that answers
    // every /docs/* URL with the landing page is worse than a plain error, because it reads
    // as though the limitations log simply has nothing to say.
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForFunction(
      async () => {
        if (!navigator.serviceWorker?.controller) return false;
        for (const u of ["/", "/docs", "/docs/methods", "/docs/limitations", "/docs/validation", "/docs/faq"]) {
          if (!(await caches.match(u))) return false;
        }
        return true;
      },
      null,
      { timeout: 20000 },
    );

    await context.setOffline(true);

    // A phrase that appears on that page and nowhere else in the docs.
    const pages: [string, RegExp][] = [
      ["/docs", /The three pages that matter/],
      ["/docs/methods", /Aerodynamic stability — Barrowman/],
      ["/docs/limitations", /^Known limitations/],
      ["/docs/validation", /Against RocketPy/],
      ["/docs/faq", /^FAQ$/],
      ["/docs/changelog", /^Changelog$/],
    ];
    for (const [path, mark] of pages) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: mark }).first(), `${path} offline`).toBeVisible();
    }

    // And the reverse: visiting the docs must not leave the home page cached as a docs page.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /38 mm single-deploy/ })).toBeVisible();

    await context.setOffline(false);
  });

  test("the changelog is a page in the app, and it is the file in the repository", async ({ page }) => {
    // **P5: a visible changelog.** It renders from `lib/version.ts` — generated from `CHANGELOG.md`
    // and refused by the build when it disagrees with `package.json` — so the page, the version in
    // the chrome and the file in the repository are one source with two readers rather than three
    // things somebody has to keep in step.
    await page.goto("/docs/changelog");
    await expect(page.getByRole("heading", { name: "Changelog", exact: true })).toBeVisible();

    // Every release in the file is on the page, with its date machine-readable.
    for (const r of RELEASES) {
      await expect(page.getByRole("heading", { name: new RegExp(`^${r.version.replace(/\./g, "\\.")}`) })).toBeVisible();
      await expect(page.locator(`time[datetime="${r.date}"]`)).toBeVisible();
    }

    // And the entry's own content, not just its heading — a changelog page that lists versions and
    // says nothing about them is a version list.
    const newest = RELEASES[0];
    const bullets = newest.sections.flatMap((s) => s.items);
    expect(bullets.length, "the newest release has no bullets, so this asserted nothing").toBeGreaterThan(10);
    await expect(page.getByRole("listitem").filter({ hasText: /reads the file you already have|five formats|OpenRocket/ }).first()).toBeVisible();
    for (const s of newest.sections.filter((x) => x.heading)) {
      await expect(page.getByRole("heading", { name: s.heading, exact: true })).toBeVisible();
    }

    // **The inline markdown is rendered, not printed.** The parser had a real bug here — a link
    // inside a bold run came out as literal `[text](url)` — so this asserts the page carries no
    // unrendered link syntax at all.
    await expect(page.getByText(/\]\(http/)).toHaveCount(0);
    await expect(page.getByText(/\*\*/)).toHaveCount(0);

    // It is reachable from the docs hub as well as from the footer, because a page only the chrome
    // links to is a page most flyers meet by accident.
    await page.goto("/docs");
    await page.getByRole("link", { name: "changelog", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Changelog", exact: true })).toBeVisible();
    await expect(page.getByText(new RegExp(VERSION.replace(/\./g, "\\.")))).toHaveCount(2, { timeout: 10000 });
  });

  test("a flyer can report a bug or ask for a format from any route, not only from the docs", async ({ page }) => {
    // **P5's last reachability clause.** Before this the issues link existed on three docs pages and
    // the docs hub only, and the footer's GitHub link went to the repository ROOT — so a flyer whose
    // import went wrong on `/flight` had to find the documentation before they could say so.
    // Asserted on every workspace route, because that is the whole claim.
    for (const path of ["/", "/design", "/flight", "/sweep", "/validate", "/docs"]) {
      await page.goto(path);
      const report = page.getByRole("link", { name: /Report a bug, or ask for a rocket file format/ });
      await expect(report, `no way to report a bug from ${path}`).toBeVisible();
      await expect(report).toHaveAttribute("href", /\/issues\/new$/);
      // The accessible name has to name BOTH jobs: asking for an unsupported format is the request a
      // flyer is least likely to guess is welcome, and ingestion breadth is a stated goal.
      await expect(report).toHaveAttribute("aria-label", /ask for a rocket file format/);
      // It leaves the site, and says so — the contract every other external link here keeps.
      await expect(report).toHaveAttribute("target", "_blank");
      await expect(report).toHaveAttribute("aria-label", /opens in a new tab/);
    }
  });

  test("the version a flyer is running is on every route, and it is the released one", async ({ page }) => {
    // **P5: a versioned release the flyer can see in the UI.** A tool that shows no version cannot be
    // told apart from a stale cached copy of itself, and this one is installable and served by a
    // service worker, so "which build am I looking at" is a question a flyer can genuinely have.
    //
    // The version is read from `lib/version.ts`, which `scripts/gen-version.mjs` derives from
    // `CHANGELOG.md` and refuses to emit when `package.json` disagrees — so this test asserts
    // REACHABILITY, and `lib/version.test.ts` asserts AGREEMENT. Neither claim covers the other: a
    // version can be correct in three files and rendered nowhere, which is exactly the state before
    // this shipped.
    // Every workspace route plus the docs, because the footer renders on all of them and a version
    // that appears on the landing surface only is a version most sessions never see.
    for (const path of ["/", "/design", "/flight", "/sweep", "/validate", "/docs"]) {
      await page.goto(path);
      const link = page.getByRole("link", { name: new RegExp(`^Version ${VERSION.replace(/\./g, "\\.")}`) });
      await expect(link, `no version on ${path}`).toBeVisible();
      await expect(link).toHaveText(`v${VERSION}`);
      // The release DATE rides on the accessible name rather than as a second visible token — the
      // phone chrome ratchet has 49 px of headroom and this renders on six routes at once — so it
      // has to be asserted there or it is asserted nowhere.
      await expect(link).toHaveAttribute("aria-label", new RegExp(`released ${RELEASED}`));
      // And it goes somewhere: a version string with no way to find out what is in it is a number
      // for its own sake.
      await expect(link).toHaveAttribute("href", "/docs/changelog");
    }
  });
});
