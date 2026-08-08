import { test, expect } from "@playwright/test";

/** **Is the text readable in the theme the visitor is actually in?**
 *
 *  Nothing asked that until this file existed, and the gap was not theoretical. The `dark` variant
 *  at the top of `app/globals.css` has two clauses — the `.dark` class an explicit choice sets, and
 *  the OS preference for a visitor who has chosen neither — and every `dark:` utility gets both.
 *  A hand-written stylesheet rule gets only what it asks for, and the eleven `.prose-loft` rules
 *  asked for the class alone. "System" is the DEFAULT theme and sets no class, so the six docs
 *  routes served their LIGHT palette on the dark ground `html` paints: body text at 1.91:1,
 *  headings and bold at 1.12:1, formulas as white cards on black.
 *
 *  `DESIGN.md` §9 counted radius drift, off-scale spacing and caption-size text. It counted nothing
 *  about contrast, in either theme, so every one of those numbers was green while the docs were
 *  unreadable. **A grep over class names cannot see this class of defect at all** — the same blind
 *  spot §9 already records for the `.eqn` radius and the docs type scale — because what is wrong is
 *  a rendered colour, not a spelling. So this check measures the rendered result.
 *
 *  Three things make it a real check rather than a reassuring one:
 *
 *  1. **Its own browser context per theme.** The theme resolves once, at load, from
 *     `prefers-color-scheme`; `emulateMedia()` on a loaded page does not re-run it. `smoke.spec.ts`
 *     records a version of this test that was green by vacuity for exactly that reason.
 *  2. **Colours are RASTERISED, never parsed.** Chromium reports computed colours as `lab()` and
 *     `oklab()` here, and a `\d+` match over `lab(2.51 0.24 -0.89)` reads the numbers 2, 51 and 0.
 *     Painting onto a 1×1 canvas is what makes a translucent layer composite correctly too.
 *  3. **A control that fails when the sweep examines nothing.** A walk that sampled no text reports
 *     zero unreadable nodes and prints exactly like a pass — the false all-clear `MAINTAINING.md`
 *     warns about. Every case below asserts its own sample count first.
 */

/** Every route a visitor can reach, with what has to be on screen before the walk starts. The app
 *  routes need a design flown first: with none imported they redirect to the import screen, so a
 *  walk that skipped the click would audit that screen six times and report six passes. */
const DOCS_ROUTES = [
  "/docs",
  "/docs/methods",
  "/docs/limitations",
  "/docs/validation",
  "/docs/faq",
  "/docs/changelog",
] as const;

/** WCAG 2.1 AA: 4.5:1 for body text, 3:1 for large text (>=24px, or >=18.66px bold). The walk
 *  applies the size-aware threshold per node rather than one blanket number, so a legitimately
 *  large heading is not held to a standard the spec does not set for it. */
const AA_BODY = 4.5;
const AA_LARGE = 3;

/** The walker. Returns every text node whose contrast against its own composited backdrop is under
 *  the threshold its size earns. Runs in the page; everything it needs is inlined because it is
 *  serialised across the boundary. */
async function faintText(page: import("@playwright/test").Page, scope: string) {
  // The thresholds are PASSED IN rather than closed over, because the walker is serialised into the
  // page and cannot reach a module-level constant. They were written as bare literals inside it at
  // first, which left the two named constants above unreferenced — invisible to `npm run build`,
  // which does not type-check `e2e/`, and caught by `tsc --noEmit`. Run that too before pushing a
  // spec: the build's `noUnusedLocals` does not cover this directory.
  return page.evaluate(([sel, aaBody, aaLarge]: [string, number, number]) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const g = cv.getContext("2d", { willReadFrequently: true })!;
    const rgbOver = (c: string, base: string) => {
      g.clearRect(0, 0, 1, 1);
      g.fillStyle = base;
      g.fillRect(0, 0, 1, 1);
      g.fillStyle = c;
      g.fillRect(0, 0, 1, 1);
      const d = g.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]] as const;
    };
    const lum = ([r, gg, b]: readonly [number, number, number]) => {
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b);
    };
    // Effective backdrop: walk to the nearest opaque ancestor, then composite every translucent
    // layer back down over it. A `bg-zinc-900/50` panel on a zinc-950 page is a real colour, and
    // taking either end of it alone gets the ratio wrong in both directions.
    const backdrop = (el: Element) => {
      const chain: string[] = [];
      let n: Element | null = el;
      while (n) {
        const c = getComputedStyle(n).backgroundColor;
        if (!/,\s*0\)$/.test(c)) {
          chain.push(c);
          if (!/rgba|\/ /.test(c)) break;
        }
        n = n.parentElement;
      }
      let base: readonly [number, number, number] = [255, 255, 255];
      for (const c of chain.reverse()) base = rgbOver(c, `rgb(${base[0]},${base[1]},${base[2]})`);
      return base;
    };

    let sampled = 0;
    const bad: { text: string; ratio: number; need: number; color: string }[] = [];
    for (const el of document.querySelectorAll(`${sel} *`)) {
      // Leaf text only. A node with element children has its text measured on those children, and
      // measuring the parent too would double-count and attribute a child's colour to it.
      if (el.children.length) continue;
      const text = (el.textContent || "").trim();
      if (text.length < 3) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;

      sampled++;
      const px = parseFloat(cs.fontSize);
      const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
      const need = px >= 24 || (bold && px >= 18.66) ? aaLarge : aaBody;
      const base = backdrop(el);
      const lb = lum(base);
      const lf = lum(rgbOver(cs.color, `rgb(${base[0]},${base[1]},${base[2]})`));
      const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf];
      const ratio = (hi + 0.05) / (lo + 0.05);
      if (ratio < need) bad.push({ text: text.slice(0, 40), ratio: +ratio.toFixed(2), need, color: cs.color });
    }
    return { sampled, bad };
  }, [scope, AA_BODY, AA_LARGE] as [string, number, number]);
}

const report = (bad: { text: string; ratio: number; need: number; color: string }[]) =>
  bad
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 10)
    .map((b) => `  ${b.ratio}:1 (needs ${b.need}) ${b.color} — "${b.text}"`)
    .join("\n");

// --- the docs, in the theme that was broken -------------------------------------------------

test.describe("readable in the theme the visitor is actually in", () => {
  test("every docs route is readable with a dark OS and no theme chosen", async ({ browser }) => {
    // THE CASE THE OWNER HIT. `colorScheme: "dark"` with nothing in localStorage is theme "System"
    // on a dark-OS device — neither `.dark` nor `.light` on the root — which is the default state
    // for every first-time visitor and the one the eleven class-only rules missed.
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const page = await ctx.newPage();

    for (const route of DOCS_ROUTES) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("article.prose-loft")).toBeVisible();

      // CONTROL, and it is not a class check: theme "System" sets no class, so asserting `.dark`
      // would fail on a page that is genuinely dark. Assert what matters — that the ground really
      // is dark before asking what the text on it reads like.
      const ground = await page.evaluate(() => {
        const cv = document.createElement("canvas");
        cv.width = cv.height = 1;
        const g = cv.getContext("2d", { willReadFrequently: true })!;
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, 1, 1);
        g.fillStyle = getComputedStyle(document.body).backgroundColor;
        g.fillRect(0, 0, 1, 1);
        const d = g.getImageData(0, 0, 1, 1).data;
        return (d[0] + d[1] + d[2]) / 3;
      });
      expect(ground, `${route} is not actually rendering dark`).toBeLessThan(60);

      const { sampled, bad } = await faintText(page, "article.prose-loft");
      expect(sampled, `${route} sampled no prose — the walk examined nothing`).toBeGreaterThan(10);
      expect(bad.length, `${route} — text below WCAG AA on a dark OS with no theme chosen:\n${report(bad)}`).toBe(0);
    }
    await ctx.close();
  });

  test("every docs route is readable with an explicitly chosen Dark theme", async ({ browser }) => {
    // The other clause. This one was always correct; it is here so a future fix cannot repair the
    // OS-preference case by breaking the class case, which is the failure mode a one-sided check
    // invites.
    const ctx = await browser.newContext({ colorScheme: "light" });
    const page = await ctx.newPage();
    await page.goto("/docs", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.setItem("loft.theme", "dark"));

    for (const route of DOCS_ROUTES) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("html.dark")).toHaveCount(1);
      const { sampled, bad } = await faintText(page, "article.prose-loft");
      expect(sampled, `${route} sampled no prose`).toBeGreaterThan(10);
      expect(bad.length, `${route} — text below WCAG AA with Dark chosen:\n${report(bad)}`).toBe(0);
    }
    await ctx.close();
  });

  test("every docs route is readable in light", async ({ browser }) => {
    // The third corner, and the one a `light-dark()` conversion can break by transposing a pair.
    const ctx = await browser.newContext({ colorScheme: "light" });
    const page = await ctx.newPage();
    for (const route of DOCS_ROUTES) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const { sampled, bad } = await faintText(page, "article.prose-loft");
      expect(sampled, `${route} sampled no prose`).toBeGreaterThan(10);
      expect(bad.length, `${route} — text below WCAG AA in light:\n${report(bad)}`).toBe(0);
    }
    await ctx.close();
  });

  // --- and the app itself, which is where the numbers are ------------------------------------

  test("every workspace is readable with a dark OS and no theme chosen", async ({ browser }) => {
    // The docs are what the owner named, but the note is about the missing CHECK, and a check that
    // only ever looked at prose would let the same defect land on a surface carrying an apogee.
    // All four workspaces, because they are where the numbers a flyer acts on live — and they need
    // a design flown first, or each redirects to the import screen and this audits that one screen
    // four times and reports four passes.
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
    await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();

    for (const [link, url] of [
      ["Flight", /\/flight\/?$/],
      ["Design", /\/design\/?$/],
      ["Sweep", /\/sweep\/?$/],
      ["Cross-check", /\/validate\/?$/],
    ] as const) {
      await page.getByRole("link", { name: link }).click();
      await page.waitForURL(url);
      const { sampled, bad } = await faintText(page, "main");
      expect(sampled, `${link} sampled nothing — the walk examined an empty workspace`).toBeGreaterThan(40);
      expect(
        bad.length,
        `${link} workspace — text below WCAG AA on a dark OS with no theme chosen:\n${report(bad)}`,
      ).toBe(0);
    }
    await ctx.close();
  });
  test("the design workspace stays readable with a part PICKED, in light and in dark", async ({ browser }) => {
    // **Every contrast case in this file walks a surface in its RESTING state, and that is a hole
    // this milestone drove straight through.** Picking a part paints its row `bg-indigo-50`, and the
    // row's kind cell was `text-zinc-500` — 4.32:1 on that ground against AA's 4.5, where the same
    // cell reads 4.83:1 on white and passes. So the defect existed only in a state no check entered,
    // on the gesture the design workspace is now built around: R12 makes selecting a part how you
    // edit it, so a flyer is in this state whenever they are working.
    //
    // Both themes, because the highlight has a light and a dark value and only one of them was
    // measured when this was found.
    for (const colorScheme of ["light", "dark"] as const) {
      const ctx = await browser.newContext({ colorScheme });
      const page = await ctx.newPage();
      await page.goto("/");
      await page.getByRole("button", { name: /54 mm dual-deploy/ }).click();
      await expect(page.getByRole("heading", { name: "Flight", exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Design" }).click();
      await page.waitForURL(/\/design\/?$/);

      const table = page.locator("table").filter({ hasText: "Dimensions" });
      if (!(await table.isVisible().catch(() => false))) {
        await page.locator("summary", { hasText: /Parts ·/ }).click();
      }
      await expect(table).toBeVisible();
      const row = page.getByRole("row").filter({ hasText: /Body tube/ }).first();
      await row.click();
      // The control: the row really is picked, so this is auditing the highlighted state and not the
      // resting one all over again.
      await expect(row).toHaveAttribute("aria-selected", "true");

      const { sampled, bad } = await faintText(page, "main");
      expect(sampled, `${colorScheme}: the walk examined nothing`).toBeGreaterThan(40);
      expect(
        bad.length,
        `${colorScheme}, a part picked — text below WCAG AA:\n${report(bad)}`,
      ).toBe(0);
      await ctx.close();
    }
  });
});
