"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/methods", label: "Methods" },
  { href: "/docs/limitations", label: "Limitations log" },
  { href: "/docs/validation", label: "Validation" },
  { href: "/docs/faq", label: "FAQ" },
];

export default function DocsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Docs sections" className="flex flex-wrap gap-1.5">
      {LINKS.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={
              "rounded-md px-2.5 py-1 text-sm transition " +
              (active
                ? "bg-indigo-600 text-white"
                : "border border-zinc-300 bg-white text-zinc-700 hover:border-indigo-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100")
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
