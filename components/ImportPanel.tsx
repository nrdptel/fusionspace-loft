"use client";

import { useRef, useState } from "react";

import { TOUCH_TARGET, TOUCH_TARGET_SQUARE } from "@/lib/ui-tokens";
import { countWhatIfs, type RecentDesign, type RemovedRecent, type SavedSession } from "@/lib/session";
import { Button, Card } from "./ui";

/** The import surface: a large drop zone / file picker for an OpenRocket `.ork`, RockSim
 *  `.rkt` or RASAero `.CDX1`, plus one-tap buttons to load the bundled sample designs so the tool is usable before
 *  you have a file. Mobile first — the whole thing is tap-friendly and one-handed. */
export default function ImportPanel({
  onFile,
  onSample,
  onNew,
  busy,
  recents,
  onOpenRecent,
  onForgetRecent,
  removedRecents,
  onRestoreRecent,
  discarded,
  onRestoreDiscarded,
}: {
  onFile: (file: File) => void;
  onSample: (path: string, label: string) => void;
  onNew: () => void;
  busy: boolean;
  /** The session the last "Import another" / "Start fresh" threw away, or null. Offered back here
   *  because this screen is exactly where a flyer lands after that click and realises what it cost. */
  discarded: SavedSession | null;
  onRestoreDiscarded: () => void;
  /** Designs opened before, newest first — kept on this device so a build's variants are one tap
   *  away without the file. Empty on a first visit, and on a device with storage turned off. */
  recents: RecentDesign[];
  onOpenRecent: (id: string) => void;
  onForgetRecent: (id: string) => void;
  /** Designs taken off the shelf, newest first, each still puttable back. */
  removedRecents: RemovedRecent[];
  onRestoreRecent: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const carried = discarded ? countWhatIfs(discarded) : 0;

  return (
    <section aria-label="Import a design">
      {/* The way back from the one destructive click in the app. It sits ABOVE the drop zone because
          a flyer who has just lost their work is not looking for a file picker, and it names what it
          is holding rather than making them press it to find out. */}
      {discarded && (
        <Card tone="accent" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="min-w-0 flex-1 text-sm text-zinc-700 dark:text-zinc-200">
            You were working on{" "}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {/* The rocket's own name, which a rename changes — the file name would offer a build back
                  as "New design" however the flyer renamed it. */}
              {discarded.rocket || discarded.name || "a design"}
            </span>
            {carried > 0 ? (
              <>
                {" "}
                with {carried} what-if{carried === 1 ? "" : "s"} set
              </>
            ) : null}
            .
          </p>
          {/* SECONDARY, not primary. `DESIGN.md` §5 allows one primary per surface, and this screen's
              is "Choose a file" — the job the surface exists to do. Two indigo fills here meant
              neither read as the main action, on the first screen a flyer ever sees. */}
          <Button variant="secondary" disabled={busy} onClick={onRestoreDiscarded}>
            Pick it back up
          </Button>
        </Card>
      )}
      {/* The way back from the shelf's "×". It is deliberately NOT inside the shelf card below: that
          card unmounts when the shelf empties, so nesting the offer in it withheld the undo in the one
          case where the deleted bytes are most likely the only copy — removing the last design. One
          row per removal rather than one pending offer, because holding only the latest meant a second
          tap destroyed the first design's way back, and two taps in a row is what a mis-tap looks
          like. Cleared whenever a design loads, so it can never resurface pointing at an old shelf. */}
      {removedRecents.length > 0 && (
        // `role="status"` because pressing "×" destroys the focused control and renders this
        // somewhere else on the page: without it a keyboard or screen-reader user gets no signal that
        // an undo exists at all, and focus has already fallen to the document body.
        <Card tone="accent" className="mb-4" role="status">
          <ul className="flex flex-col gap-3">
            {removedRecents.map(({ entry, refusal }) => (
              <li key={entry.id}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="min-w-0 flex-1 text-sm text-zinc-700 dark:text-zinc-200">
                    Removed{" "}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {entry.rocket || entry.name}
                    </span>{" "}
                    from your designs — the copy Loft was keeping on this device is gone.
                  </p>
                  <Button
                    disabled={busy}
                    onClick={() => onRestoreRecent(entry.id)}
                    aria-label={`Put ${entry.rocket || entry.name} back on your designs`}
                  >
                    Put it back
                  </Button>
                </div>
                {/* Beside the control, not in the page's shared error strip: that renders below this
                    whole fragment, so a refusal reported there reads on screen as the button doing
                    nothing at all. */}
                {refusal && (
                  <p className="mt-1.5 text-sm text-amber-700 dark:text-amber-400">{refusal}</p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
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
          <code className="font-mono">.rkt</code>{" "}or RASAero <code className="font-mono">.CDX1</code>{" "}
          file here, or choose one. Everything runs in your browser — your design is never uploaded.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button variant="primary" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? "Working…" : "Choose a file"}
          </Button>
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

      {/* Designs opened before. A flyer working across a build has several on the go, and at the pad
          the file may not be on the phone at all — so what has been opened stays openable. Shown
          only when there is history, so a first visit is not padded with an empty shelf. */}
      {recents.length > 0 && (
        <div className="mx-auto mt-4 max-w-3xl rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Your designs
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {recents.map((r) => (
              <li key={r.id} className="flex min-w-0 items-stretch rounded-lg border border-zinc-300 dark:border-zinc-700">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onOpenRecent(r.id)}
                  // The visible label is the rocket's name; the accessible name leads with the verb
                  // so the button reads as an action out of context, and still contains the visible
                  // text. The file it came from goes in the title, where the two differ.
                  aria-label={`Reopen ${r.rocket || r.name}`}
                  title={r.name}
                  className={`inline-flex min-w-0 items-center rounded-l-lg bg-white px-3 py-1.5 text-left text-sm text-zinc-700 transition hover:text-zinc-900 disabled:opacity-60 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 ${TOUCH_TARGET}`}
                >
                  <span className="truncate">{r.rocket || r.name}</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onForgetRecent(r.id)}
                  aria-label={`Remove ${r.rocket || r.name} from your designs`}
                  // A one-glyph destructive control sitting against a 240 px open target: it needs the
                  // 44 px minimum in BOTH directions, not just height, or it stays a 24 px-wide delete
                  // button for a thumb aiming at the row beside it.
                  className={`flex items-center justify-center rounded-r-lg border-l border-zinc-200 px-2 text-sm text-zinc-400 transition hover:bg-zinc-50 hover:text-zinc-700 disabled:opacity-60 dark:border-zinc-800 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200 ${TOUCH_TARGET_SQUARE}`}
                >
                  <span aria-hidden>×</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Kept in this browser on this device — never uploaded. Reopening one flies it as saved;
            any what-if edits you had set are not part of the design.
          </p>
        </div>
      )}

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
        {/* Not "every motor its mount takes" — the list is the CASING the design already flies, which
            is a narrower and checkable claim. A 54 mm mount can fly a 38 mm motor in an adapter, and it
            is the 38 mm ones that are offered, so the wider claim was false against the design file,
            which states the bore outright. The same sentence was corrected on the sweep itself, the
            picker's help and the FAQ; this was the last copy of it. */}
        Fly the airframe on every bundled motor of the casing it already flies, at once: apogee, max speed,
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
        An <code className="font-mono">.ork</code>{" "}or <code className="font-mono">.rkt</code>{" "}
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
