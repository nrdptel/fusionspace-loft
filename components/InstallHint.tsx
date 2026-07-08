"use client";

import { useEffect, useState } from "react";

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
    <section className="mt-10">
      <details className="group rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/50">
        <summary className="cursor-pointer select-none font-medium text-zinc-700 dark:text-zinc-300">
          Use it offline &amp; install it
        </summary>
        <div className="mt-3 space-y-3 text-zinc-600 dark:text-zinc-400">
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
                <button
                  type="button"
                  onClick={install}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
                >
                  Install Loft
                </button>
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

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            The motor database and the simulation run on the device, so a design imported
            offline still simulates. Open it online now and again to pick up any updates.
          </p>
        </div>
      </details>
    </section>
  );
}
