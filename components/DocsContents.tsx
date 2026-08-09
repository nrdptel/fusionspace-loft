"use client";

import { useEffect, useState } from "react";
import { SectionNav } from "./ui";

/** The contents list for a docs route, built from the headings the route actually rendered.
 *
 *  **Read from the DOM rather than authored per page, and that is the whole design.** Six routes,
 *  thirty-two headings, and a hand-kept list beside each one is thirty-two chances for a page to gain
 *  a section the list does not name — which is exactly how `README.md` went stale for four months
 *  and what `P10` is still cleaning up. A list derived from the document cannot disagree with it.
 *
 *  Client-side because that is where the headings are, and the routes are static exports with no
 *  build step that could inject this. The cost is that a reader with no JavaScript sees no contents
 *  list; they see the page, complete, exactly as they did before — the prose is server-rendered and
 *  every heading still carries its id, so a link INTO a section keeps working. That is the right
 *  failure for an enhancement.
 *
 *  `label` is passed through to `SectionNav`, which hands it to `useCurrentSection` as the selector
 *  for its own strip — the marker measures from the strip's bottom edge, and a shared label prefix is
 *  how that silently measured against the wrong element in the sibling. */
export default function DocsContents({ label = "Jump to a section of this page" }: { label?: string }) {
  const [items, setItems] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    const read = (sel: string) =>
      Array.from(document.querySelectorAll<HTMLHeadingElement>(sel)).map((h) => ({
        id: h.id,
        label: (h.textContent ?? "").trim(),
      }));
    // **`h2` normally, but a route whose sections ARE its `h3`s falls back to those.** `/docs/faq` is
    // 4,712 words under a single `h2` and twenty-eight questions, so the h2-only rule left the route
    // with the most subsections in the docs showing no contents list at all — while `DocsH3`'s own
    // reasoning for keeping `h3` out of the strip is that the strip is where discovery happens. It
    // cannot be both. The fallback fires only where the top level does not divide the page.
    const h2 = read("article h2[id]");
    const found = h2.length > 1 ? h2 : read("article h3[id]");
    // One heading is a route with no sections to jump between, and a contents list naming the page
    // you are already on is furniture. `SectionNav` returns null for an empty list; this decides the
    // threshold, because "has sections" starts at two.
    setItems(found.length > 1 ? found : []);
  }, []);
  return <SectionNav label={label} items={items} className="mb-6" />;
}
