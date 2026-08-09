import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { slugify } from "../components/DocsHeading";

/** The built export's docs routes. Counted on the EXPORT rather than on the source, the way
 *  `DESIGN.md` §9's other counts are: what a reader can link into is what shipped, not what a `.tsx`
 *  file intended. Skips when there is no build, so a bare `npm test` stays green.
 *
 *  **And REFUSES to skip in CI, because the graceful skip is how this whole file spent its life
 *  asserting nothing.** `.github/workflows/test.yml` ran `npm test` before `npm run build` and `/out`
 *  is gitignored, so on every pull request since these checks landed `existsSync(out)` was false, all
 *  five returned early, and the job went green. The workflow now builds first; this guard is what
 *  stops the same thing happening silently again if the order is ever changed back, because a skip
 *  and a pass are indistinguishable in a test report and that is exactly the false all-clear the
 *  operating manual warns about. */
function docsPages(): { name: string; html: string }[] {
  const out = resolve(process.cwd(), "out");
  if (!existsSync(out)) {
    if (process.env.CI) {
      throw new Error(
        "no built export at out/ — CI must run `npm run build` before `npm test`, or these checks assert nothing",
      );
    }
    return [];
  }
  const files: string[] = [];
  if (existsSync(join(out, "docs.html"))) files.push(join(out, "docs.html"));
  const dir = join(out, "docs");
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.endsWith(".html")) files.push(join(dir, f));
  return files.map((f) => ({ name: f.slice(out.length + 1), html: readFileSync(f, "utf-8") }));
}

describe("the docs routes can be linked into and navigated", () => {
  const pages = docsPages();

  it("gives every heading on every docs route an anchor", () => {
    // **Measured on the built export before this: 29,204 words across six routes and ONE linkable
    // heading in eighty-nine.** A flyer who wanted to send someone the drag section could send them
    // the page and the word "drag". The count is the whole assertion: a route that gains a section
    // and loses its anchor fails here rather than shipping a heading nobody can point at.
    //
    // **`h3` and `h4` count too, and they did not before — which made the first pass's "32 of 32" a
    // count of the wrong denominator.** Measured on the export at the commit before this increment:
    // **93 headings, 32 linkable** — every `h2` — while **57 `h3` and 4 `h4` carried no id at all**
    // and this check reported full coverage. Chunking a long section into subsections would have
    // added more of them: the run gets shorter and the route gets LESS linkable, with nothing to say
    // so. The `h4`s are the changelog's per-release section names, and they are why the level goes to
    // four rather than stopping at three.
    if (!pages.length) return; // no build in the tree; the gate always has one
    const missing: string[] = [];
    let total = 0;
    for (const p of pages) {
      for (const attrs of p.html.match(/<h[234][^>]*>/g) ?? []) {
        total++;
        if (!/\bid="[^"]+"/.test(attrs)) missing.push(`${p.name}: ${attrs}`);
      }
    }
    console.log(`docs headings across ${pages.length} routes: ${total}, ${total - missing.length} linkable`);
    expect(pages.length, "no docs routes in the export — that branch proves nothing").toBeGreaterThan(4);
    expect(total, "no headings found at all").toBeGreaterThan(20);
    expect(missing, "a docs heading a reader cannot link to").toEqual([]);
  });

  it("holds every docs route inside DESIGN.md section 3's two prose budgets", () => {
    // **§3's chunk, counted the way §9's other numbers are.** A line nobody loses their place on is
    // worth nothing inside a section nobody can find their way back into, so: no run of prose between
    // two headings over 800 rendered words, and at least 2.5 headings per thousand words on a route
    // of running prose.
    //
    // Measured on the built export before this increment: `/docs/limitations` carried a single
    // **3,744-word** run under one heading covering six unrelated subjects, `/docs/methods` ran at
    // **1.8** headings per thousand with a **1,784-word** drag section, and `/docs/validation` —
    // which the roadmap never named — was worse than methods at a **2,252-word** run. Every one of
    // those is the export's own number, from this file's counter; `ROADMAP.md` had quoted 2,800 for
    // the limitations run, measured on the source, and it was low by a third.
    if (!pages.length) return;
    const words = (s: string) => (s.replace(/<[^>]*>/g, " ").match(/[A-Za-z0-9][^\s]*/g) ?? []).length;
    const overLong: string[] = [];
    const underBroken: string[] = [];
    let measured = 0;
    for (const p of pages) {
      const stripped = p.html.replace(/<script[\s\S]*?<\/script>/g, "");
      const body = /<article[\s\S]*?<\/article>/.exec(stripped)?.[0] ?? stripped;
      const total = words(body);
      // The index is a list of links to the other routes, not something anyone reads a paragraph of.
      if (total < 400) continue;
      measured++;
      const at = [...body.matchAll(/<h[234]\b/g)].map((m) => m.index!);
      const per1k = (at.length / total) * 1000;
      if (per1k < 2.5) underBroken.push(`${p.name}: ${per1k.toFixed(1)} headings per 1,000 words`);
      for (let i = 0; i < at.length; i++) {
        const run = words(body.slice(at[i], at[i + 1] ?? body.length));
        if (run > 800) overLong.push(`${p.name}: a ${run}-word run`);
      }
    }
    console.log(`docs prose budgets: ${measured} long-form routes measured on the export`);
    expect(measured, "no long-form route was measured — that branch proves nothing").toBeGreaterThan(3);
    expect(overLong, "a run of prose past the 800-word budget in DESIGN.md section 3").toEqual([]);
    expect(underBroken, "a docs route below the 2.5-headings-per-1,000-words floor").toEqual([]);
  });

  it("keeps every anchor unique within its own route", () => {
    // Two sections sharing a slug is a link that lands on whichever the browser meets first, which
    // is worse than no link at all — it looks like it worked. `Drag` and `drag` would collide, and
    // so would two headings differing only in punctuation.
    if (!pages.length) return;
    const dupes: string[] = [];
    for (const p of pages) {
      const ids = (p.html.match(/<h[234][^>]*\bid="([^"]+)"/g) ?? []).map((m) => /id="([^"]+)"/.exec(m)![1]);
      const seen = new Set<string>();
      for (const id of ids) {
        if (seen.has(id)) dupes.push(`${p.name}#${id}`);
        seen.add(id);
      }
    }
    expect(dupes, "two headings on one route answer to the same anchor").toEqual([]);
  });

  it("keeps the anchor that was already published", () => {
    // `/docs/validation#rocketpy` is stated in the source and has been linkable since before this
    // check existed. A URL that has been shared is a promise, so an explicit id wins over a derived
    // one — and the derived one here would have been `against-rocketpy-an-independent-engine`.
    if (!pages.length) return;
    const v = pages.find((p) => p.name.includes("validation"));
    expect(v, "no validation route in the export").toBeTruthy();
    expect(v!.html).toContain('id="rocketpy"');
  });

  it("derives a slug a reader would guess, and strips what a URL should not carry", () => {
    // The rule every static-site generator uses, so a link behaves the way a reader expects.
    expect(slugify("Drag")).toBe("drag");
    expect(slugify("Mass, CG & inertia")).toBe("mass-cg-inertia");
    expect(slugify("Aerodynamic stability — Barrowman")).toBe("aerodynamic-stability-barrowman");
    expect(slugify("Against the file's own tool")).toBe("against-the-files-own-tool");
    expect(slugify("Known limitations (2026-07)")).toBe("known-limitations-2026-07");
    // No leading or trailing hyphen, whatever the punctuation at the ends.
    expect(slugify("— Staging —")).toBe("staging");
  });
});
