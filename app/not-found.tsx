import type { Metadata } from "next";
import Link from "next/link";

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
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Page not found
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
        That page doesn&apos;t exist. Head back to import a design and simulate its flight.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
      >
        <span aria-hidden>←</span>
        Back to Loft
      </Link>
    </main>
  );
}
