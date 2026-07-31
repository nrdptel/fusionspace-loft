"use client";

import { useEffect, useState } from "react";
import { Button, Disclosure } from "./ui";

// `beforeinstallprompt` isn't in the standard DOM lib types.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Tells the end user the tool works offline and can be installed — and offers a
 *  one-tap install where the browser supports it (Android / desktop Chromium).
 *  iOS Safari has no install API, so the steps below cover it. */
export default function InstallHint() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // Already running as an installed app?
    if (window.matchMedia?.("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return (
    // `mt-12`, not `mt-8`. Both are on §4's scale and 8 is the value §4 gives a gap BETWEEN sections —
    // but the app's own root is already `mt-8` with a 6 rhythm inside it, so setting this break to 8
    // makes the gap before a whole new region the same as the gap between two rows of one. 12 is the
    // next step up and keeps the hierarchy the off-scale 10 it replaces was expressing.
    <section className="mt-12">
      {/* The primitive, which this block had been duplicating class-for-class — it was the reason
          `Disclosure` sat at zero call sites while its exact treatment was live two files away.
          `print-hide` rides in through `className`: how to install the app is page furniture, not
          part of the design being printed. `mt-0` because the parent section already owns the gap. */}
      <Disclosure summary="Use it offline & install it" className="print-hide mt-0">
        <>
          <p>
            Loft runs entirely in your browser. Once you&apos;ve opened it on a device
            with a connection, it keeps working with no signal — so you can import a design
            and simulate it at the pad. Install it and it opens like any app, full-screen and
            offline.
          </p>

          {installed ? (
            <p className="font-medium text-emerald-700 dark:text-emerald-400">
              Installed — you&apos;re good to go offline.
            </p>
          ) : (
            <>
              {deferred && (
                <Button variant="primary" onClick={install}>
        Install Loft
      </Button>
              )}
              <ul className="space-y-1.5">
                <li>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    iPhone / iPad (Safari):
                  </span>{" "}
                  Share → Add to Home Screen.
                </li>
                <li>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    Android (Chrome):
                  </span>{" "}
                  use the Install button above, or menu (⋮) → Add to Home screen.
                </li>
                <li>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    Desktop (Chrome / Edge):
                  </span>{" "}
                  the install icon in the address bar, or menu → Install Loft.
                </li>
              </ul>
            </>
          )}

          {/* Decision-grade, by the rule this repo already wrote down: "Open it online now and again"
              is an INSTRUCTION — a sentence whose purpose is to change what the flyer does next — not
              a description of something already on screen. It also tells them the one thing that
              decides whether the app keeps working at the pad. */}
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            The motor database and the simulation run on the device, so a design imported
            offline still simulates. Open it online now and again to pick up any updates.
          </p>
        </>
      </Disclosure>
    </section>
  );
}
