"use client";

import { useRef, useState } from "react";

import { countWhatIfs, type RecentDesign, type RemovedRecent, type SavedSession } from "@/lib/session";
import { Button, Card } from "./ui";

/** The bundled designs, so the tool is usable before the flyer has a file of their own. One entry
 *  each rather than four near-identical blocks of JSX: they differed only in these three strings, and
 *  a repeated block is where a treatment drifts one copy at a time.
 *
 *  `name` is what the design is called once loaded; `label` is what the control reads. They differ
 *  because the control is a row of chips where the separator does the work, and the loaded name is
 *  prose. */
const SAMPLES: { path: string; name: string; label: string }[] = [
  { path: "/samples/demo-single-deploy.ork", name: "38 mm single-deploy (H128W)", label: "38 mm single-deploy · H128W" },
  { path: "/samples/demo-dual-deploy.ork", name: "54 mm dual-deploy (K550W)", label: "54 mm dual-deploy · K550W" },
  { path: "/samples/demo-multi-config.ork", name: "Motor comparison (H128W / G40W)", label: "Motor comparison · H128W / G40W" },
  { path: "/samples/demo-rocksim.rkt", name: "RockSim 54 mm sport (J420R)", label: "RockSim · 54 mm sport · J420R" },
  // **Two capabilities that had no example at all until 2026-08-08.** The bundled set showed four
  // files but only three airframes, and between them not one transition, boattail or non-trapezoidal
  // fin — so a flyer arriving without a design of their own could not see that Loft handles either.
  // Both of these were already generated from committed source and already loaded; they were simply
  // absent from the samples set. The labels name the CAPABILITY rather than the motor, because that
  // is what distinguishes them from the three above.
  { path: "/samples/demo-boattail.ork", name: "Boattail + elliptical fins (H128W)", label: "Boattail · elliptical fins · H128W" },
  { path: "/samples/demo-payload-separation.ork", name: "Payload separation (F32T)", label: "Payload separation · F32T" },
  // FIRST in the list a stranger reads is still the trainer, but this is the one that flies without
  // a caution: every other bundled design measures 3.06–4.38 cal against an over-stable threshold of
  // 3, so until this existed every one-tap example opened with a warning. 2.07 cal.
  { path: "/samples/demo-stable.ork", name: "Stable trainer (H128W)", label: "Stable trainer · H128W" },
  // The third FORMAT, and until now the one a flyer could only discover by trying it: `.CDX1` has
  // been accepted since the RASAero adapter shipped, and the drop zone said so, but no `.CDX1`
  // existed anywhere in the repo — not as a sample, not even as a test fixture.
  { path: "/samples/demo-rasaero.CDX1", name: "RASAero 4 in sport (K550W)", label: "RASAero · 4 in sport · K550W" },
];

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
          //
          // The generous padding is `sm:` only. Below that the surface is not a drop zone at all —
          // you cannot drag a file onto a phone — so 64 px of vertical padding is spent advertising
          // an affordance the device does not have, and it was spending it directly above the one
          // control a flyer with no file needs. Measured: the first bundled example sat at 753 px
          // on a 390x664 phone, 89 px below the fold.
          "mx-auto max-w-3xl rounded-xl border-2 border-dashed p-4 text-center transition sm:p-8 " +
          (dragging
            ? "border-indigo-400 bg-indigo-50/60 dark:bg-indigo-500/10"
            : "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40")
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/fusion-space-mark.svg" alt="" aria-hidden width={880} height={815} className="mx-auto hidden h-9 w-auto opacity-80 sm:block" />
        <p className="text-base font-medium text-zinc-800 dark:text-zinc-100 sm:mt-4">
          Import an OpenRocket, RockSim or RASAero design
        </p>
        {/* Two sentences for two devices, because "drop a file here" is an instruction a phone
            cannot follow. The desktop copy keeps the drag affordance; the phone copy states the
            formats and the privacy promise, which are the parts that are true everywhere. */}
        <p className="mx-auto mt-1 hidden max-w-md text-sm text-zinc-500 dark:text-zinc-400 sm:block">
          Drop an OpenRocket <code className="font-mono">.ork</code>, RockSim{" "}
          <code className="font-mono">.rkt</code>{" "}or RASAero <code className="font-mono">.CDX1</code>{" "}
          file here, or choose one. Everything runs in your browser — your design is never uploaded.
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500 dark:text-zinc-400 sm:hidden">
          <code className="font-mono">.ork</code>, <code className="font-mono">.rkt</code>{" "}or{" "}
          <code className="font-mono">.CDX1</code>. Runs in your browser — never uploaded.
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
          {/* The peer of the primary beside it, and it used to be visibly taller, at a 4-step
              horizontal pad over a 2.5-step vertical one
              against `Button`'s `px-3 py-1.5`, so the two controls a first-time visitor chooses
              between were different heights on the one surface everybody sees first. */}
          <Button disabled={busy} onClick={onNew}>
            Start a new design
          </Button>
        </div>
        {/* `sm:` only. On a phone this sentence sits between the flyer and the bundled examples,
            which are the better answer to "no file?" — they need no editing at all. */}
        <p className="mx-auto mt-3 hidden max-w-md text-xs text-zinc-500 dark:text-zinc-400 sm:block">
          No file? Start from a stable 54&nbsp;mm sport design and edit it — the same engine flies
          whatever you build.
        </p>
      </div>

      {/* Designs opened before. A flyer working across a build has several on the go, and at the pad
          the file may not be on the phone at all — so what has been opened stays openable. Shown
          only when there is history, so a first visit is not padded with an empty shelf. */}
      {recents.length > 0 && (
        <Card className="mx-auto mt-4 max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Your designs
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {recents.map((r) => (
              <li key={r.id} className="flex min-w-0 items-stretch rounded-md border border-zinc-300 dark:border-zinc-700">
                {/* A split control: the `<li>` owns the outer border and radius, so each half
                    squares off the edge they meet at. `rounded-r-none` / `rounded-l-none` rather
                    than a hand-rolled left-corner radius at the control step — a corner utility
                    overrides the primitive's
                    own all-corner radius, which is what lets a split control be built FROM the
                    primitive instead of beside it. */}
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => onOpenRecent(r.id)}
                  // The visible label is the rocket's name; the accessible name leads with the verb
                  // so the button reads as an action out of context, and still contains the visible
                  // text. The file it came from goes in the title, where the two differ.
                  aria-label={`Reopen ${r.rocket || r.name}`}
                  title={r.name}
                  className="min-w-0 justify-start rounded-r-none border-r-0 text-left"
                >
                  <span className="truncate">{r.rocket || r.name}</span>
                </Button>
                <Button
                  variant="ghost"
                  square
                  disabled={busy}
                  onClick={() => onForgetRecent(r.id)}
                  aria-label={`Remove ${r.rocket || r.name} from your designs`}
                  // A one-glyph destructive control sitting against a 240 px open target: it needs the
                  // 44 px minimum in BOTH directions, not just height, or it stays a 24 px-wide delete
                  // button for a thumb aiming at the row beside it.
                  // No tint override here: `ghost` already IS the de-emphasised weight, and a
                  // `text-zinc-400` beside the variant's own `text-zinc-600` is dead in light mode —
                  // both are bare single-class selectors and Tailwind emits `text-zinc-400` first, so
                  // the variant wins on source order however the attribute is ordered. It looked like
                  // an override, rendered as zinc-600, and left the two themes disagreeing about
                  // which half of the control is muted (dark kept zinc-400 through ghost's own
                  // `dark:` clause). `className` cannot re-tint a variant; that is what variants are.
                  className="rounded-l-none border-l border-l-zinc-200 dark:border-l-zinc-800"
                >
                  <span aria-hidden>×</span>
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Kept in this browser on this device — never uploaded. Reopening one flies it as saved;
            any what-if edits you had set are not part of the design.
          </p>
        </Card>
      )}

      <Card className="mx-auto mt-4 max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Or try a bundled example
        </p>
        {/* One `Button variant="secondary"` each, where these were four byte-identical hand-rolled
            class strings. They carried `bg-white dark:bg-zinc-900`, which `secondary` does not give
            them — §5 defines it as a control border over a transparent fill — and that stray fill was
            doing real work by accident: it was one step lighter than the container's old
            `dark:bg-zinc-900/40`, so the buttons read as raised against it. Putting the container on
            `Card` took it to a true `zinc-900` and the two fills became identical, which is how the
            accidental dependency surfaced. The system's answer is a transparent control on a raised
            surface, which is what every other secondary button in the app already is. */}
        <div className="mt-2 flex flex-wrap gap-2">
          {SAMPLES.map((s) => (
            <Button key={s.path} variant="secondary" disabled={busy} onClick={() => onSample(s.path, s.name)}>
              {s.label}
            </Button>
          ))}
        </div>
      </Card>

      <WhyLoft />

      <WhatItDoes />
    </section>
  );
}

/** The three things Loft does that no competitor does, on the surface a stranger sees first.
 *
 *  **This is `COMPETITION.md`'s standing conclusion, verbatim in substance**, and that file says of
 *  it: "it is what the landing surface and the README should say, and right now they do not." The
 *  gap was measured rather than assumed — before this, the landing surface stated the formats and
 *  "never uploaded", which is claim 2 and half of claim 1, and said nothing at all about the
 *  multi-answer cross-check, which is the one no other hobby tool offers.
 *
 *  **Placed after the examples rather than under the headline, deliberately.** The primary controls
 *  and the bundled samples are what a flyer with a file or without one actually came for, and the
 *  first example already sits 89 px below the fold on a 390x664 phone — a claim strip above them
 *  would push the one control that needs no reading further out of sight to make an argument to
 *  someone who has not yet decided to read one. It sits immediately before `WhatItDoes`, so the
 *  scroll reads: try it · why it is different · what it can do.
 *
 *  Three items, not a list of everything true about Loft. Free, offline and no-account are ONE claim
 *  because they are one decision — everything runs on the flyer's device — and splitting them would
 *  dilute the two that follow. */
const DIFFERENTIATORS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Nothing to install, nothing to pay, nothing to sign up for",
    body: (
      <>
        It runs on your device, in a tab. No account, no upload, no tracking. Install it to your home
        screen and it keeps working with no signal — at the pad, in a field, on a phone.
      </>
    ),
  },
  {
    title: "It reads the file you already have",
    body: (
      <>
        OpenRocket <code className="font-mono">.ork</code>, RockSim{" "}
        <code className="font-mono">.rkt</code> and RASAero <code className="font-mono">.CDX1</code>{" "}
        — each into the same model, so a design you imported and one you built here are edited and
        flown by exactly the same tools.
      </>
    ),
  },
  {
    title: "It shows you more than one answer",
    body: (
      <>
        Loft&apos;s own solver, the numbers the file already stores from the tool that made it, and an
        independent RocketPy run in your browser — side by side. Where they disagree it says so
        instead of picking one and looking confident.
      </>
    ),
  },
];

function WhyLoft() {
  return (
    <Card className="mx-auto mt-4 max-w-3xl">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Why Loft
      </h2>
      {/* A definition list, because that is the shape: three terms and what each one means. It also
          gives the headings a structure a screen reader can move through, which a stack of styled
          paragraphs does not. */}
      <dl className="mt-2 grid gap-4 sm:grid-cols-3">
        {DIFFERENTIATORS.map((d) => (
          <div key={d.title}>
            <dt className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{d.title}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">{d.body}</dd>
          </div>
        ))}
      </dl>
    </Card>
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
