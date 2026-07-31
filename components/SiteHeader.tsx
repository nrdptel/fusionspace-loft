import Link from "next/link";
import { KOFI_URL } from "@/lib/links";
import FusionSpaceBadge from "./FusionSpaceBadge";
import ThemeToggle from "./ThemeToggle";
import { buttonClass } from "@/lib/ui-tokens";

/** Page header: the Fusion Space eyebrow over the product name on the left, a Ko-fi tip link,
 *  a Docs link and the theme toggle on the right. Mirrors the sibling tools' header.
 *
 *  `compact` marks a page that titles itself (the docs section): there the product name is a link
 *  home, and that page's own <h1> is its title. On the app itself nothing else names the page, so
 *  the product name IS the heading — a document whose outline starts at <h2> has no top. */
export default function SiteHeader({ compact = false }: { compact?: boolean }) {
  const name = (
    <Link
      href="/"
      className="text-xl font-semibold tracking-tight text-zinc-900 hover:opacity-80 dark:text-zinc-100 md:text-3xl"
    >
      Loft
    </Link>
  );
  return (
    // The control row never shrinks; the title block does. Putting the header's controls on the type
    // scale took that row from 197 px to 229 px, which fits a 390 px phone and overflowed a 360 px one
    // (Galaxy S8/S9 class) by 10 px — a real width the touch suite does not cover, so nothing in the
    // gate saw it. `flex-wrap` on the header fixed the overflow and cost 71 px of vertical space on
    // EVERY phone, because a wrapped flex item will not shrink below its content: the title dropped
    // the controls to a second row at 390 and 412 px too, where they had always fitted. So the give is
    // where it was before — `min-w-0` lets "flight simulator" wrap under the wordmark on the narrowest
    // phones, and `shrink-0` holds all three 44 px targets at full size at every width.
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <FusionSpaceBadge className="mb-1" />
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          {compact ? name : <h1 className="contents">{name}</h1>}
          {!compact && (
            <span className="text-sm text-zinc-500 dark:text-zinc-400">flight simulator</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <a
          href={KOFI_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Tip the project — buy me a coffee on Ko-fi"
          className={buttonClass()}
        >
          <span aria-hidden className="leading-none">♥</span>
          Tip
        </a>
        <Link
          href="/docs"
          className={buttonClass()}
        >
          Docs
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
