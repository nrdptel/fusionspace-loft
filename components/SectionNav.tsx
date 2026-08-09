"use client";

import { useCurrentSection } from "./useCurrentSection";
import { cx } from "@/lib/ui-tokens";

export function SectionNav({
  label,
  items,
  className,
}: {
  /** Names the landmark: "Jump to a section of this report". */
  label: string;
  items: { id: string; label: string }[];
  className?: string;
}) {
  // The hook measures from the strip"s own bottom edge, because that is the line a reader
  // actually reads from — the strip covers everything above it. Its default selector is
  // `nav[aria-label^="Jump to a section"]`, which matched the report"s label and NOT this
  // page"s ("Jump to a subject on this page"), so the you-are-here marker would have measured
  // against the viewport top on the surface it was added for and drifted by the strip"s height.
  // Handing it this nav"s exact label cannot go stale the way a shared prefix can.
  const current = useCurrentSection(
    items.map((i) => i.id),
    `nav[aria-label="${label}"]`,
  );
  if (items.length === 0) return null;
  return (
    <nav
      aria-label={label}
      className={cx(
        "sticky top-0 z-20 -mx-1 overflow-x-auto bg-white px-1 py-2 print:hidden dark:bg-zinc-950",
        className,
      )}
    >
      {/* **`text-sm`, and the padding that goes with it — where Loft's copy of this primitive
          diverges from the sibling's, and §9 is what found it.** The sibling renders these chips at
          `text-xs` with `px-2 py-1`; adopting that verbatim tripped *has exactly 0 files where
          caption size outnumbers the body default*, because this component is nothing but chips. The
          check is right and the divergence is the fix rather than the problem: §3 scopes `text-xs` to
          "captions, units, footnotes" and puts "every label, value, body" at `text-sm`, and a
          section's own name is a LABEL — it is the thing being navigated to, not a footnote about
          it. §4 then prescribes `px-3 py-1.5` inside a control at that size, reserving `px-2 py-1`
          for `text-xs` chips. It reads larger and it is a bigger target on a phone, both of which are
          the right direction for a jump list. Filed for the sibling in `BACKLOG.md`. */}
      <ul className="flex w-max items-center gap-1.5 text-sm">
        {items.map((j) => {
          const here = j.id === current;
          return (
            <li key={j.id}>
              <a
                href={`#${j.id}`}
                // `location`, not `page` or `true`: this marks where in the document the reader
                // is, which is exactly what the token means. A screen reader then says "current
                // location" on the one chip that is, and nothing on the rest.
                {...(here ? { "aria-current": "location" as const } : {})}
                className={cx(
                  "inline-flex shrink-0 items-center rounded-md border px-3 py-1.5 font-medium transition",
                  here
                    ? "border-zinc-400 bg-zinc-100 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                )}
              >
                {j.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** An explanation or a small set of controls, opened from a trigger and shown OVER the surface —
 *  `DESIGN.md` §5.
 *
 *  **Not a tooltip.** A tooltip is hover-only, which is nothing on a phone, and it carries a phrase.
 *  This is click- and tap-activated, keyboard-reachable and dismissible, and it carries a paragraph.
 *
 *  Three things it owns so no call site has to get them right:
 *
 *  1. **Dismissal tells the two exits apart.** `Escape` returns focus to the trigger, because the
 *     reader asked to leave and has nowhere else to be. A click outside does NOT, because they have
 *     already put their focus somewhere deliberately and yanking it back is the more surprising of
 *     the two. `useReturnFocus` supplies the first; the second is a plain close.
 *  2. **Below `sm` it anchors to the VIEWPORT, not to the trigger.** Measured 2026-08-04 on the units
 *     panel this replaces: right-anchored to a control near the right edge, it ran from −39 px to 201
 *     at a 375 px viewport and cut off the whole left column — the one holding "Altitude", "Speed"
 *     and the rest of the labels. The page itself never scrolled sideways, so nothing watching
 *     document width could see it. It was fixed at the one call site that had been measured; it
 *     belongs here.
 *  3. **A visible way out.** A surface a flyer can open and not obviously shut is the craft bar"s
 *     "state with no way back out", and on touch there is no `Escape` key to fall back on. */
