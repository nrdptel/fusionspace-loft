"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonClass } from "@/lib/ui-tokens";

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
    // `buttonClass` rather than a hand-rolled string, which is what it exists for: these are
    // `next/link`s that must LOOK like buttons and cannot BE them, the same case the site header
    // already uses it for. It brings §4's control padding and — the reason this was changed — the
    // 44 px touch minimum. Measured on the built export before it, at a 390 px viewport: every one of
    // these five rendered **30 px tall**, on all six docs routes, against §8's contract of 44. They
    // were the largest single group of under-target controls in the whole phone walk.
    //
    // The active item takes the primary weight because it is the one thing on the row that is not an
    // offer — it is where you already are. Only ever one is active, so §5's one-primary-per-surface
    // rule holds by construction.
    <nav aria-label="Docs sections" className="flex flex-wrap gap-2">
      {LINKS.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={buttonClass({ variant: active ? "primary" : "secondary" })}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
