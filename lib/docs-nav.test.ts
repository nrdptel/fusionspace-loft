import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { slugify } from "../components/DocsHeading";

/** The built export's docs routes. Counted on the EXPORT rather than on the source, the way
 *  `DESIGN.md` §9's other counts are: what a reader can link into is what shipped, not what a `.tsx`
 *  file intended. Skips when there is no build, so a bare `npm test` stays green — the gate always
 *  runs `npm run build` before `npm run test:e2e`, and CI does too. */
function docsPages(): { name: string; html: string }[] {
  const out = resolve(process.cwd(), "out");
  if (!existsSync(out)) return [];
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
    if (!pages.length) return; // no build in the tree; the gate always has one
    const missing: string[] = [];
    let total = 0;
    for (const p of pages) {
      for (const attrs of p.html.match(/<h2[^>]*>/g) ?? []) {
        total++;
        if (!/\bid="[^"]+"/.test(attrs)) missing.push(`${p.name}: ${attrs}`);
      }
    }
    console.log(`docs headings across ${pages.length} routes: ${total}, ${total - missing.length} linkable`);
    expect(pages.length, "no docs routes in the export — that branch proves nothing").toBeGreaterThan(4);
    expect(total, "no headings found at all").toBeGreaterThan(20);
    expect(missing, "a docs heading a reader cannot link to").toEqual([]);
  });

  it("keeps every anchor unique within its own route", () => {
    // Two sections sharing a slug is a link that lands on whichever the browser meets first, which
    // is worse than no link at all — it looks like it worked. `Drag` and `drag` would collide, and
    // so would two headings differing only in punctuation.
    if (!pages.length) return;
    const dupes: string[] = [];
    for (const p of pages) {
      const ids = (p.html.match(/<h2[^>]*\bid="([^"]+)"/g) ?? []).map((m) => /id="([^"]+)"/.exec(m)![1]);
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
