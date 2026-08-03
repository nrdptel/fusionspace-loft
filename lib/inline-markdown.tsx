import type { ReactNode } from "react";

/** Turn the inline markdown a changelog bullet carries into React elements.
 *
 *  **Deliberately tiny, and deliberately not a markdown library.** `scripts/gen-version.mjs` already
 *  resolves the block structure of `CHANGELOG.md` at build time, so the only thing left at runtime is
 *  the four inline forms a release note actually uses: `**bold**`, `` `code` ``, `[text](url)` and
 *  plain text. A parser for those is thirty lines and one test; a markdown dependency is a package in
 *  a bundle budgeted to 335 KB gzipped, to render one page.
 *
 *  **It returns ELEMENTS, never HTML.** The input is a file in this repository rather than anything a
 *  flyer supplies, so `dangerouslySetInnerHTML` would not be a live injection risk today — but it
 *  would make the changelog the one surface in the app where writing a file is writing markup, and
 *  that is a property that only ever gets discovered later. Everything below builds nodes React
 *  escapes.
 *
 *  Unmatched syntax is left as literal text rather than swallowed: a stray `**` is a typo a human
 *  should see in the rendered page, not a silent formatting change.
 */

/** `[text](url)`, `**bold**`, `` `code` `` — matched in one pass so a link containing bold and a
 *  bold run containing code cannot be split by two independent passes over the same string. */
const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

export function inlineMarkdown(text: string, keyPrefix = ""): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const key = `${keyPrefix}${n++}`;
    if (m[1] !== undefined) {
      const href = m[2];
      // An off-site link opens in a new tab and says so to a screen reader, the same contract every
      // other external link in the app keeps. An in-app one is a plain anchor: these are static
      // routes and a full navigation is what the rest of the docs do.
      const external = /^https?:/i.test(href);
      out.push(
        <a
          key={key}
          href={href}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-zinc-50"
        >
          {m[1]}
        </a>,
      );
    } else if (m[3] !== undefined) {
      // **Recursed, because a bold run in the real file contains links.** Caught by running this
      // over every bullet the shipped changelog actually has rather than over invented examples:
      // `**A candid, dated [limitations log](…)**` rendered the link as literal `[text](url)` inside
      // the bold, which is the parser silently printing its own syntax at a flyer. A bold run cannot
      // contain another `*` by construction, so this recursion can only ever match a link or a code
      // span and terminates in one step.
      out.push(
        <strong key={key} className="font-medium text-zinc-800 dark:text-zinc-100">
          {inlineMarkdown(m[3], `${key}b`)}
        </strong>,
      );
    } else {
      out.push(
        <code key={key} className="font-mono text-[0.95em]">
          {m[4]}
        </code>,
      );
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
