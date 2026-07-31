"use client";

import { useEffect, useRef, useState } from "react";

import { TOUCH_TARGET_SQUARE } from "@/lib/ui-tokens";
import { Button } from "./ui";

/**
 * Registers the service worker (public/sw.js) for offline use, and — because an offline
 * app can otherwise sit on a stale version indefinitely — prompts to refresh when a new
 * build has been deployed. Production only; renders the prompt (a small toast) when an
 * update is waiting, otherwise nothing. All client-side; no server involved.
 */
export default function ServiceWorker() {
  const [updateReady, setUpdateReady] = useState(false);
  const waitingRef = useRef<ServiceWorker | null>(null);
  const acceptedRef = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // Reload once the user-accepted update takes control. The flag keeps the very first
    // activation (no prior controller) from triggering an unwanted reload.
    const onControllerChange = () => {
      if (acceptedRef.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const offer = (worker: ServiceWorker | null) => {
      if (worker && navigator.serviceWorker.controller) {
        waitingRef.current = worker;
        setUpdateReady(true);
      }
    };

    // Offer a worker once it's installed (or now, if it already is). Used for both a
    // future update (updatefound) and an install already in flight when we register —
    // that in-flight case could otherwise fire updatefound before this listener attaches.
    const track = (worker: ServiceWorker | null) => {
      if (!worker) return;
      if (worker.state === "installed") offer(worker);
      else
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed") offer(worker);
        });
    };

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        offer(reg.waiting); // an update may already be waiting from a prior load
        track(reg.installing); // …or already installing when we registered (the race)
        reg.addEventListener("updatefound", () => track(reg.installing));
      } catch {
        /* offline support is a progressive enhancement; ignore failures */
      }
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <span className="text-zinc-700 dark:text-zinc-200">
          A new version of Loft is available.
        </span>
        {/* Both on the primitive. Hand-rolled, they reproduced `Button`'s primary fill character for
            character while dropping the two things that are not decoration: the focus-visible ring, so
            the toast's own action was invisible to a keyboard user, and the 44 px touch minimum. The
            dismiss was the worse of the two — a one-glyph control at roughly 24x28 px, floating over
            the app, next to a much larger button. `TOUCH_TARGET_SQUARE` is what the parts panel already
            uses for exactly that shape. */}
        <Button
          variant="primary"
          onClick={() => {
            acceptedRef.current = true;
            waitingRef.current?.postMessage({ type: "SKIP_WAITING" });
          }}
        >
          Refresh
        </Button>
        <Button
          variant="ghost"
          onClick={() => setUpdateReady(false)}
          aria-label="Dismiss"
          className={TOUCH_TARGET_SQUARE}
        >
          <span aria-hidden>✕</span>
        </Button>
      </div>
    </div>
  );
}
