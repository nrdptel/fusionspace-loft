import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass } from "@/lib/ui-tokens";

export const metadata: Metadata = {
  title: "Page not found — Loft",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/fusion-space-mark.svg"
        alt=""
        aria-hidden
        width={880}
        height={815}
        className="h-10 w-auto opacity-80"
      />
      <p className="mt-6 font-mono text-sm text-indigo-600 dark:text-indigo-400">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Page not found
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
        That page doesn&apos;t exist. Head back to import a design and simulate its flight.
      </p>
      {/* A link that must LOOK like a button and cannot BE one — a `<button>` that navigates is a
          keyboard and screen-reader defect — so it takes the geometry as a class rather than the
          primitive. `buttonClass` lives in `lib/ui-tokens.ts` precisely so a server component can
          call it; `components/ui.tsx` is `"use client"` and this route is not. */}
      <Link href="/" className={buttonClass({ variant: "primary", className: "mt-8" })}>
        <span aria-hidden>←</span>
        Back to Loft
      </Link>
    </main>
  );
}
