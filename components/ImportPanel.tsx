"use client";

import { useRef, useState } from "react";

import { TOUCH_TARGET } from "@/lib/ui-tokens";

/** The import surface: a large drop zone / file picker for an OpenRocket `.ork`, RockSim
 *  `.rkt` or RASAero `.CDX1`, plus one-tap buttons to load the bundled sample designs so the tool is usable before
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
          // Capped at the reading measure: this is a landing surface, not the workspace, and a
          // 1600 px drop zone reads as a stretched page rather than a considered one.
          "mx-auto max-w-3xl rounded-xl border-2 border-dashed p-8 text-center transition " +
          (dragging
            ? "border-indigo-400 bg-indigo-50/60 dark:bg-indigo-500/10"
            : "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40")
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/fusion-space-mark.svg" alt="" aria-hidden width={880} height={815} className="mx-auto h-9 w-auto opacity-80" />
        <p className="mt-4 text-base font-medium text-zinc-800 dark:text-zinc-100">
          Import an OpenRocket, RockSim or RASAero design
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
          Drop an OpenRocket <code className="font-mono">.ork</code>, RockSim{" "}
          <code className="font-mono">.rkt</code> or RASAero <code className="font-mono">.CDX1</code>{" "}
          file here, or choose one. Everything runs in your browser — your design is never uploaded.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className={`inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60 ${TOUCH_TARGET}`}
          >
            {busy ? "Working…" : "Choose a file"}
          </button>
          <input
            ref={inputRef}
            type="file"
            aria-label="Choose an OpenRocket .ork, RockSim .rkt or RASAero .CDX1 file"
            accept=".ork,.ork.gz,.rkt,.cdx1,.CDX1,application/zip"
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
            className={`inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:border-indigo-400 hover:text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 ${TOUCH_TARGET}`}
          >
            Start a new design
          </button>
        </div>
        <p className="mx-auto mt-3 max-w-md text-xs text-zinc-500 dark:text-zinc-400">
          No file? Start from a stable 54&nbsp;mm sport design and edit it — the same engine flies
          whatever you build.
        </p>
      </div>

      <div className="mx-auto mt-4 max-w-3xl rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Or try a bundled example
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onSample("/samples/demo-single-deploy.ork", "38 mm single-deploy (H128W)")}
            className={`inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition hover:border-indigo-400 hover:text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 ${TOUCH_TARGET}`}
          >
            38 mm single-deploy · H128W
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSample("/samples/demo-dual-deploy.ork", "54 mm dual-deploy (K550W)")}
            className={`inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition hover:border-indigo-400 hover:text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 ${TOUCH_TARGET}`}
          >
            54 mm dual-deploy · K550W
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSample("/samples/demo-multi-config.ork", "Motor comparison (H128W / G40W)")}
            className={`inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition hover:border-indigo-400 hover:text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 ${TOUCH_TARGET}`}
          >
            Motor comparison · H128W / G40W
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSample("/samples/demo-rocksim.rkt", "RockSim 54 mm sport (J420R)")}
            className={`inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition hover:border-indigo-400 hover:text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 ${TOUCH_TARGET}`}
          >
            RockSim · 54 mm sport · J420R
          </button>
        </div>
      </div>

      <WhatItDoes />
    </section>
  );
}

/** What a flyer can do once a design is loaded.
 *
 *  Everything below is one or two clicks from here and none of it was visible from this page: a
 *  first-time visitor saw a drop zone and could reasonably conclude Loft reads a file and draws an
 *  altitude curve. The builder, the motor comparison, the sweeps, the dispersion, the second solver
 *  and the cross-check against the file's own stored numbers are the reasons to come back a tenth
 *  time, and a capability nobody can find is one that isn't there. Deliberately specific — what
 *  each one computes, not what it feels like. */
const CAPABILITIES: { title: string; body: React.ReactNode }[] = [
  {
    title: "Build and edit, not just view",
    body: (
      <>
        Start from a stable design or reshape an imported one — drag the fins, the body wall, the
        nose on the diagram, or type the numbers. It re-flies as you go.
      </>
    ),
  },
  {
    title: "Compare every fitting motor",
    body: (
      <>
        Fly the airframe on every bundled motor its mount takes, at once: apogee, max speed,
        rail-exit velocity, thrust-to-weight, stability, flutter margin, and the delay to drill.
      </>
    ),
  },
  {
    title: "Sweep one dimension",
    body: <>The response curve behind a single edit — how apogee, speed, stability or flutter margin move as you change it.</>,
  },
  {
    title: "Fly it hundreds of times",
    body: (
      <>
        Monte-Carlo dispersion over your own stated tolerances: the apogee band to expect, the
        landing scatter, and the recovery area to plan for.
      </>
    ),
  },
  {
    title: "Check it against a second engine",
    body: (
      <>
        RocketPy — an independent 6-DOF simulator — flies the same design in your browser, so
        Loft&apos;s answer isn&apos;t the only one you get.
      </>
    ),
  },
  {
    title: "…and against your own file",
    body: (
      <>
        An <code className="font-mono">.ork</code> or <code className="font-mono">.rkt</code>{" "}
        carries its tool&apos;s own stored simulation. Loft shows its result beside those numbers
        rather than asking you to trust one.
      </>
    ),
  },
];

function WhatItDoes() {
  return (
    // Full page width, so it lines up with the heading above and the footer below. The drop zone is
    // deliberately narrower than the page; a third thing at a third width would read as an accident.
    <div className="mt-8">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Once a design is loaded
      </h2>
      <ul className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map((c) => (
          <li key={c.title}>
            <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{c.title}</h3>
            <p className="mt-0.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{c.body}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
        All of it runs on your device — no account, nothing uploaded, and it keeps working at the pad
        with no signal once loaded.
      </p>
    </div>
  );
}
