"use client";

import { useRef, useState } from "react";

/** The import surface: a large drop zone / file picker for an OpenRocket `.ork` or RockSim
 *  `.rkt`, plus one-tap buttons to load the bundled sample designs so the tool is usable before
 *  you have a file. Mobile first — the whole thing is tap-friendly and one-handed. */
export default function ImportPanel({
  onFile,
  onSample,
  onNew,
  busy,
}: {
  onFile: (file: File) => void;
  onSample: (path: string, label: string) => void;
  onNew: () => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <section aria-label="Import a design">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={
          "rounded-xl border-2 border-dashed p-8 text-center transition " +
          (dragging
            ? "border-indigo-400 bg-indigo-50/60 dark:bg-indigo-500/10"
            : "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40")
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/fusion-space-mark.svg" alt="" aria-hidden width={880} height={815} className="mx-auto h-9 w-auto opacity-80" />
        <p className="mt-4 text-base font-medium text-zinc-800 dark:text-zinc-100">
          Import an OpenRocket or RockSim design
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
          Drop an OpenRocket <code className="font-mono">.ork</code> or RockSim{" "}
          <code className="font-mono">.rkt</code> file here, or choose one. Everything runs in
          your browser — your design is never uploaded.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {busy ? "Working…" : "Choose a file"}
          </button>
          <input
            ref={inputRef}
            type="file"
            aria-label="Choose an OpenRocket .ork or RockSim .rkt file"
            accept=".ork,.ork.gz,.rkt,application/zip"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={onNew}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:border-indigo-400 hover:text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            Start a new design
          </button>
        </div>
        <p className="mx-auto mt-3 max-w-md text-xs text-zinc-500 dark:text-zinc-400">
          No file? Start from a stable 54&nbsp;mm sport design and edit it — the same engine flies
          whatever you build.
        </p>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Or try a bundled example
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onSample("/samples/demo-single-deploy.ork", "38 mm single-deploy (H128W)")}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition hover:border-indigo-400 hover:text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            38 mm single-deploy · H128W
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSample("/samples/demo-dual-deploy.ork", "54 mm dual-deploy (K550W)")}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition hover:border-indigo-400 hover:text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            54 mm dual-deploy · K550W
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSample("/samples/demo-multi-config.ork", "Motor comparison (H128W / G40W)")}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition hover:border-indigo-400 hover:text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            Motor comparison · H128W / G40W
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSample("/samples/demo-rocksim.rkt", "RockSim 54 mm sport (J420R)")}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition hover:border-indigo-400 hover:text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            RockSim · 54 mm sport · J420R
          </button>
        </div>
      </div>
    </section>
  );
}
