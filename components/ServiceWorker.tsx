"use client";

import { useEffect, useRef, useState } from "react";

import { Button, Toast } from "./ui";

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

  // The whole floating surface is `Toast` now — `DESIGN.md` §5. This file used to spell it: the
  // fixed centring row, the safe-area pad, `role="status"`, the card treatment and the dismiss's
  // touch minimum were all written here, and the card half was character-identical to
  // `CARD_TONES.default` with `shadow-lg` added. What is left is the only part that is about a
  // service worker: the sentence, and the button that tells the waiting worker to take over.
  return (
    <Toast
      onDismiss={() => setUpdateReady(false)}
      action={
        // On the primitive. Hand-rolled, this reproduced `Button`'s primary fill character for
        // character while dropping the focus-visible ring, so the toast's own action was invisible
        // to a keyboard user.
        <Button
          variant="primary"
          onClick={() => {
            acceptedRef.current = true;
            waitingRef.current?.postMessage({ type: "SKIP_WAITING" });
          }}
        >
          Refresh
        </Button>
      }
    >
      A new version of Loft is available.
    </Toast>
  );
}
