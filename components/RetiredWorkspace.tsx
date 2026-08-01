"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { resolveWorkspace, workspacePath } from "@/lib/workspaces";

/** Forwards a retired workspace address to whichever workspace took its job over.
 *
 *  A static export cannot answer with a 301, so the forward is a client-side `replace` — which is
 *  also the right shape here: the whole app is client-side, and the flyer's design is restored by
 *  the shell above this route either way. `replace`, not `push`, so Back leaves the app rather than
 *  bouncing off the retired address.
 *
 *  It says what it is doing rather than flashing. The redirect is immediate in practice, but a
 *  blank frame with no explanation is the wrong thing to show anyone whose link just changed
 *  meaning — and it is the only thing a flyer sees if the router is slow or JavaScript never runs. */
export default function RetiredWorkspace({ from }: { from: string }) {
  const router = useRouter();
  const to = resolveWorkspace(from);
  useEffect(() => {
    if (to) router.replace(workspacePath(to));
  }, [to, router]);
  return (
    <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
      That workspace was split in two. Taking you to{" "}
      <a href={to ? workspacePath(to) : "/"} className="underline underline-offset-2">
        {to ? `/${to}` : "the import screen"}
      </a>
      .
    </p>
  );
}
