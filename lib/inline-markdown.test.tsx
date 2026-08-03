import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

import { inlineMarkdown } from "./inline-markdown";
import { RELEASES } from "./version";

const html = (nodes: ReactNode[]) => renderToStaticMarkup(<>{nodes}</>);

/** The four inline forms a release note uses, and the two properties that make this safe to point at
 *  a file rather than at a hand-written page: it escapes, and it never swallows what it cannot
 *  parse. */
describe("inline markdown", () => {
  it("renders the four forms it claims to", () => {
    expect(html(inlineMarkdown("plain"))).toBe("plain");
    expect(html(inlineMarkdown("a **bold** b"))).toContain("<strong");
    expect(html(inlineMarkdown("a **bold** b"))).toContain("bold</strong>");
    expect(html(inlineMarkdown("a `code` b"))).toContain("<code");
    const link = html(inlineMarkdown("see [the docs](/docs/limitations) now"));
    expect(link).toContain('href="/docs/limitations"');
    expect(link).toContain(">the docs</a>");
    // An in-app link is a plain anchor; an off-site one opens in a new tab, the contract every other
    // external link in the app keeps.
    expect(link).not.toContain("target=");
    expect(html(inlineMarkdown("[out](https://example.com)"))).toContain('target="_blank"');
    expect(html(inlineMarkdown("[out](https://example.com)"))).toContain('rel="noopener noreferrer"');
  });

  it("escapes rather than emitting markup", () => {
    // The whole reason this returns elements instead of `dangerouslySetInnerHTML`. The input is a
    // file in this repository today, so this is not a live injection path — it is the property that
    // stops the changelog becoming the one surface where writing a file is writing markup.
    const out = html(inlineMarkdown('<img src=x onerror="alert(1)"> **b**'));
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
    expect(out).toContain("<strong");
    // Inside each construct too, not only around them.
    expect(html(inlineMarkdown("**<script>**"))).not.toContain("<script>");
    expect(html(inlineMarkdown("`<script>`"))).not.toContain("<script>");
  });

  it("leaves syntax it cannot parse as literal text", () => {
    // A stray marker is a typo a human should see in the rendered page, not a silent formatting
    // change that hides the mistake.
    for (const stray of ["a ** b", "a ` b", "a [b](c d) e", "a [b] c"]) {
      expect(html(inlineMarkdown(stray)), stray).toContain(stray.replace(/&/g, "&amp;"));
    }
  });

  it("renders every bullet the shipped changelog actually contains", () => {
    // The real corpus for this parser is the file it exists to render, so run it over all of it. The
    // claim is not that the output looks a particular way — it is that nothing throws, nothing comes
    // back empty, and no bullet loses its text.
    let bullets = 0;
    for (const r of RELEASES) {
      for (const s of r.sections) {
        for (const item of s.items) {
          bullets++;
          const out = html(inlineMarkdown(item));
          expect(out.length, `empty render: ${item}`).toBeGreaterThan(0);
          // Every word outside the markup survives. Stripping tags and entities has to give back the
          // source with only its syntax characters removed.
          const text = out
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#x27;/g, "'")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">");
          const stripped = item.replace(/\*\*/g, "").replace(/`/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
          expect(text, `text lost from: ${item}`).toBe(stripped);
        }
      }
    }
    expect(bullets, "the changelog has no bullets, so this asserted nothing").toBeGreaterThan(10);
  });
});
