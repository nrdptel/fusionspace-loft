/** Parent-brand eyebrow. Loft is one of several Fusion Space tools; this small linked
 * lockup sits above the product name to place it under the Fusion Space brand and let
 * people discover the other tools at fusionspace.co. Uses the official FusionSpace
 * wordmark so the family reads as one (the gradient reads on both light and dark).
 * Mirrors the HPR Motor Finder's badge. */
import { TOUCH_TARGET } from "@/lib/ui-tokens";

export default function FusionSpaceBadge({ className = "" }: { className?: string }) {
  return (
    <a
      href="https://fusionspace.co"
      target="_blank"
      rel="noopener noreferrer"
      // See the footer's copy of this link: the deleted tooltip's description moves onto the
      // accessible name rather than off the page.
      aria-label="Fusion Space — free, polished tools for high-power rocketry (opens in a new tab)"
      className={`group inline-flex w-fit items-center gap-1 transition hover:opacity-80 ${TOUCH_TARGET} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/fusion-space-wordmark.svg"
        alt="Fusion Space"
        width={1598}
        height={281}
        className="h-4 w-auto"
      />
      {/* The body default, matching the identical affordance in the footer — that one is unsized and
          inherits the footer's own body size, so this one states the same rather than inheriting a
          header that sets none. Left to inherit, it took the page's 16 px and became the largest
          glyph in the lockup. */}
      {/* Always visible — see the identical mark in the footer, which also explains why the class
          literal it replaced is not named in either comment. `text-zinc-500` is §2's `tertiary`
          role; `text-zinc-400` is 2.57:1 on white and fails WCAG 1.4.11. */}
      <span aria-hidden className="text-sm text-zinc-500 dark:text-zinc-500">
        ↗
      </span>
    </a>
  );
}
