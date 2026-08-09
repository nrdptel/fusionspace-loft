import type { ReactNode } from "react";

/** Flatten a heading's JSX children to the plain text a slug is made from. Handles the entity
 *  escapes the docs pages use (`&amp;`, `&apos;`, `&mdash;`) because those arrive as their decoded
 *  characters, and the odd nested `<em>`. */
function toText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(toText).join("");
  const el = node as { props?: { children?: ReactNode } };
  return el.props ? toText(el.props.children) : "";
}

/** A heading's own fragment id, derived from its words.
 *
 *  **Derived rather than authored, because eighty-nine headings authored by hand is eighty-nine
 *  chances to typo one and never find out.** Lowercased, non-alphanumerics collapsed to a single
 *  hyphen, ends trimmed — the slug every static-site generator uses, so a link a reader has already
 *  seen elsewhere behaves the way they expect. An explicit `id` still wins: `/docs/validation`
 *  already publishes `#rocketpy`, and a URL that has been shared is a promise. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A docs section heading that can be LINKED TO.
 *
 *  **Measured on the built export before this: 29,204 words across six routes, and one linkable
 *  heading in eighty-nine.** A flyer who wanted to send someone the drag section could send them the
 *  page and the word "drag".
 *
 *  `scroll-mt-12` because the contents strip is sticky: without it a heading jumped to from a link
 *  lands UNDER the strip rather than below it, which reads as the link having gone to the wrong
 *  place. 12 is §4's scale — 48 px against the strip's measured ~44 — and it is the number
 *  `useCurrentSection` reads off the element to decide which section the reader is in, so the marker
 *  lighting up on the chip you just clicked is true by construction rather than by coincidence.
 *
 *  **No hover-revealed anchor icon**, which is the usual treatment and which `DESIGN.md` §8 forbids
 *  outright: a phone has no hover, and the stated use includes reading these pages at a range. The
 *  discovery affordance is the contents list at the top of the route, which is a real control on
 *  every pointer — the heading being linkable is what makes that list work rather than a thing a
 *  reader is expected to find on its own. */
export function DocsH2({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id ?? slugify(toText(children))} className="scroll-mt-12">
      {children}
    </h2>
  );
}
