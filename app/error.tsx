"use client";

import Link from "next/link";

// Route error boundary. The simulator shouldn't throw in normal use, but if something
// unexpected happens during render we show a friendly, on-brand recovery instead of Next's
// bare error screen — and deliberately don't render the error message, to avoid leaking
// internals.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Something went wrong
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        That&apos;s on us, not on you. Try again, or re-import your design.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          Try again
        </button>
        <Link
          href="/"
          className="text-sm text-zinc-600 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
        >
          Reload Loft
        </Link>
      </div>
    </main>
  );
}
