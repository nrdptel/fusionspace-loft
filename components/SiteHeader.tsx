import Link from "next/link";
import FusionSpaceBadge from "./FusionSpaceBadge";
import ThemeToggle from "./ThemeToggle";

/** Page header: the Fusion Space eyebrow over the product name on the left, a Docs link and
 *  the theme toggle on the right. Mirrors the sibling tools' header. */
export default function SiteHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div>
        <FusionSpaceBadge className="mb-1" />
        <div className="flex items-baseline gap-2">
          <Link
            href="/"
            className="text-2xl font-semibold tracking-tight text-zinc-900 hover:opacity-80 dark:text-zinc-100 md:text-3xl"
          >
            Loft
          </Link>
          {!compact && (
            <span className="text-sm text-zinc-500 dark:text-zinc-400">flight simulator</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/docs"
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          Docs
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
