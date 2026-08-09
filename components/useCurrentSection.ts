"use client";

import { useEffect, useState } from "react";

/**
 * Which of the report's sections the reader is currently in.
 *
 * The section strip pins to the top of the viewport, so six screens down it lists eight
 * places without saying which one you are standing in — a map with no "you are here". This
 * supplies that, and nothing else: it never scrolls, never changes the URL, and never moves
 * focus. Following a link is still the only thing that navigates.
 *
 * Measured against the strip"s own bottom edge rather than the viewport"s top, because that
 * is the line a reader actually reads from — the strip covers everything above it. The
 * current section is the LAST one whose heading has passed that line: the one whose content
 * fills the screen. Above the first heading nothing is current, which is the honest answer
 * rather than defaulting to the first — the reader has not reached it yet.
 *
 * A plain scroll listener rather than an IntersectionObserver. The band an observer would
 * need is a thin strip under the pinned bar, and a section shorter than the gap between
 * observations falls through it entirely — the state then depends on scroll velocity, which
 * is not a property of the document. Reading the positions directly is a handful of
 * `getBoundingClientRect` calls on at most eight elements, once per animation frame, and it
 * gives the same answer at any speed.
 */
export function useCurrentSection(ids: string[], stripSelector = 'nav[aria-label^="Jump to a section"]' ): string | null {
  const [current, setCurrent] = useState<string | null>(null);
  // The ids are rebuilt on every render (they depend on what the flight has), so depend on
  // their VALUE rather than the array identity or this re-subscribes on every render.
  const key = ids.join("|");

  useEffect(() => {
    const list = key ? key.split("|") : [];
    if (list.length === 0) return;
    let frame = 0;

    const read = () => {
      frame = 0;
      const strip = document.querySelector(stripSelector);
      const stripBottom = strip ? strip.getBoundingClientRect().bottom : 0;
      let found: string | null = null;
      for (const id of list) {
        const el = document.getElementById(id);
        if (!el) continue;
        // A heading counts as reached once it is at or above the place a JUMP to it would
        // put it — which is its own `scroll-margin-top`, read off the element rather than
        // written down here. That is the number the browser itself uses, so clicking a chip
        // and having it light up is true by construction, and it stays true if the CSS
        // changes. Measuring against the strip's bottom edge instead was off by one section
        // every time, because the margin deliberately parks a jumped-to heading BELOW the
        // strip: the heading you had just jumped to had not crossed the line yet.
        const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
        // …with the strip as the floor, for a target that carries no margin of its own.
        const line = Math.max(margin, stripBottom) + 2;
        if (el.getBoundingClientRect().top <= line) found = id;
        else break; // the ids are in document order, so the first one below the line ends it
      }
      // **At the bottom of the document the LAST section is the one you are in, whatever the
      // line says.** A short final section cannot be scrolled up to the reading line — there is
      // no page left to scroll — so it could never light up, and clicking its own chip left the
      // marker on the section above. Measured 2026-08-08 on `/methods`, whose last group holds
      // one short block: its heading sits 288 px down at maximum scroll on a desktop and 233 px
      // on a phone, against a line at 50. The report has the same shape and the same bug; it was
      // invisible there because its last section is tall.
      //
      // `documentElement` rather than `body` for the scroll position, and a 2 px slack because
      // fractional device pixel ratios make the arithmetic land a hair short of equality.
      const doc = document.documentElement;
      const atBottom = window.scrollY + window.innerHeight >= doc.scrollHeight - 2;
      if (atBottom) {
        const last = [...list].reverse().find((id) => document.getElementById(id));
        if (last) found = last;
      }
      setCurrent(found);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(read);
    };

    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [key, stripSelector]);

  return current;
}
