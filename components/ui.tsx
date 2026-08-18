"use client";

import { useEffect, useId, useRef, useState } from "react";

export { SectionNav } from "./SectionNav";

import {
  NAV_BAR,
  TOUCH_TARGET,
  TOUCH_TARGET_SQUARE,
  buttonClass,
  cx,
  navItemClass,
  type ButtonSize,
  type ButtonVariant,
} from "@/lib/ui-tokens";
import { rangeWords, refusedMessage } from "@/lib/what-if";
import type { Quantity } from "@/lib/display";

export interface Option<T extends string> {
  value: T;
  label: string;
}

/** The tones a container is allowed to take — `DESIGN.md` §2. Each says something; none is decoration.
 *
 *  Measured on 2026-07-31 before this existed: nine distinct `rounded-xl border…` strings across
 *  `components/`, of which twelve occurrences were the same neutral card written two ways (with and
 *  without its padding) and the rest were these four meanings spelled out inline at one site each. */
const CARD_TONES = {
  /** The default raised container. */
  default: "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
  /** The one thing this surface is pointing at — a design being offered back, a what-if against its
   *  design, and (2026-08-18) the transient one: **any card with a file over it**, which is a
   *  `DropZone` on the import route and the altitude chart on the results one. *Named as a class
   *  rather than as `DropZone` alone, because the second such card arrived the same week and this
   *  sentence had already enumerated itself into being wrong — a ledger that lists its users has to
   *  be re-read every time one is added, which is the failure the pre-push review caught here.* That
   *  use is momentary rather than standing, and it is named here rather than left to be inferred,
   *  because on
   *  the import route two persistent accent cards can already be on screen — the discarded session
   *  and a removed design — and a flyer who has learned indigo means "this is the thing being
   *  offered" now also has to read it as "your cursor is here". §2 carries the same sentence. */
  accent:
    "border-indigo-500/30 bg-indigo-500/5 dark:border-indigo-500/40 dark:bg-indigo-500/10",
  /** An estimate outside its envelope, an extrapolation, a caveat. */
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  /** A refusal, or a value that could not be computed. */
  danger: "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200",
  /** An inset within a surface — a readout block, a footnote strip, a group of controls set into a
   *  panel. `DESIGN.md` §2's third surface level, which had no primitive until this existed and was
   *  therefore written inline ten times, in three paddings, across five files.
   *
   *  The dark value is §2's `zinc-900/50`, NOT the `/60` every one of those ten inline copies had
   *  drifted to. Converging on the spec is the point of the primitive; enshrining the drift in the
   *  token that makes the level canonical would have been the opposite.
   *
   *  It keeps the hairline deliberately, and that is the part still owed. §2 says a sunken surface
   *  INSIDE a raised one needs no border, because the tone change is the separation — and in dark mode
   *  it genuinely has none to offer there: over a raised card this composites to the card's own colour,
   *  so the inset is carried entirely by the hairline. Measured on the built export: 1 of the 2 sunken
   *  cards rendered on the Design tab and 1 of the 2 on the sweeps have a card ancestor. Dropping the
   *  border is a per-site judgement about each parent, and doing it in the same pass as the conversion
   *  would make this a repaint rather than an extraction. Recorded in `ROADMAP.md` under *Decisions
   *  taken without the owner*, with the probe that redoes the count. */
  sunken: "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50",
  /** Sunken and dashed: a slot with nothing in it yet. The empty state's container. */
  muted:
    "border-dashed border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400",
} as const;

export type CardTone = keyof typeof CARD_TONES;

/** The raised container — `DESIGN.md` §5. Every card in the app is this one.
 *
 *  `as` exists because a container's ELEMENT is not a style choice: several of these are landmarks the
 *  e2e suite reaches by `getByRole("region", …)`, and silently turning a `<section>` into a `<div>` would
 *  take them out of the accessibility tree. Anything else — `id`, `role`, `aria-label` — passes straight
 *  through, so adopting the primitive never costs a call site an attribute it already had.
 *
 *  `p`, `li` and `label` are on that list for the same reason rather than as styling shorthand: a
 *  one-paragraph notice is a `<p>`, a warning inside a `<ul>` must stay an `<li>` or the list stops
 *  being one, and a container that wraps its own control is a `<label>` so the control keeps its
 *  implicit association. Converting those sites to `<div>` to fit the primitive would have cost each
 *  one real semantics. A `<p>` variant carries the usual HTML restriction — no block content inside
 *  it — so `title`/`actions` are not for that element. */
export function Card({
  as: Tag = "div",
  tone = "default",
  pad = true,
  title,
  actions,
  className,
  children,
  ref,
  ...rest
}: {
  as?: "div" | "section" | "aside" | "details" | "p" | "li" | "label";
  tone?: CardTone;
  /** `p-4` — the card padding from `DESIGN.md` §4. Off only where the card's own content owns its
   *  edges: a disclosure whose summary row has its own gutter, a table that bleeds to the border. */
  pad?: boolean;
  title?: React.ReactNode;
  /** Controls that belong to the title row rather than to the body. */
  actions?: React.ReactNode;
  /** Declared explicitly because `HTMLAttributes` does not carry it. React 19 passes `ref` to a
   *  function component as an ordinary prop, so no forwarding wrapper is needed — but the type has to
   *  say so, and `Popover` needs a handle on the card it renders to answer "did this click land
   *  inside the panel". The sibling repo's `Card` has taken one since its own popover shipped. */
  ref?: React.Ref<HTMLElement>;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={cx(
        "rounded-xl border",
        CARD_TONES[tone],
        pad && "p-4",
        className,
      )}
      {...rest}
    >
      {(title || actions) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          {title && (
            <h3 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
              {title}
            </h3>
          )}
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      )}
      {children}
    </Tag>
  );
}

/** A short, dismissible message that floats over the page — `DESIGN.md` §5.
 *
 *  **A `Card` COMPOSED, not a `Card` with a shadow prop, and §9 draws that line deliberately.** A
 *  generic `elevated` flag would let any surface opt out of §2's rule that a card does not float; a
 *  named primitive says which surfaces may, and there is exactly one kind. Because the treatment
 *  lives in `Card`, this file still holds the only `rounded-xl border` string in the tree.
 *
 *  **What was hand-rolled here, and why the wrapper is the half worth moving.** The service-worker
 *  update prompt spelled the whole thing at its call site: the tone half was character-identical to
 *  `CARD_TONES.default`, so only two things were ever not a card — the elevation, and a tighter pad
 *  than `p-4`. Above the card sat the part a second floating surface would have copied wholesale: the
 *  fixed full-width centring row, the stacking context, `role="status"`, and the bottom pad that adds
 *  the device's own safe-area inset to a scale step. That inset is the one arbitrary spacing value
 *  §9 exempts by name, and it is exempted by EXPRESSION rather than by file, so moving it here keeps
 *  both the arbitrary-spacing count and its floor assertion green.
 *
 *  `role="status"` rather than `alert`: this is announced politely and never steals focus, because a
 *  toast is by definition something the flyer may ignore. **Anything they must act on is not a
 *  toast** — that is `ErrorState`, in the flow, where it cannot be dismissed unread.
 *
 *  The dismiss takes `Button`'s `square` for the reason the parts panel's does: a one-glyph control
 *  floating over the app, beside a much larger button, is otherwise about 24x28 px. */
export function Toast({
  children,
  action,
  onDismiss,
  dismissLabel = "Dismiss",
  className,
  ...rest
}: {
  children: React.ReactNode;
  /** At most one. A toast offering two choices is a dialog and belongs in the flow. */
  action?: React.ReactNode;
  /** Omitted only where the toast dismisses itself; §5 has no undismissable floating surface. */
  onDismiss?: () => void;
  dismissLabel?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    // **`pointer-events-none` on the wrapper, `auto` on the card, and this is a fix rather than a
    // carry-over.** The wrapper is a full-width fixed strip so the card can centre in it, which
    // means without this it swallows every click in roughly 76 px across the whole bottom of the
    // viewport for as long as the toast is up — including on the surfaces behind it. The hand-rolled
    // version had the same hole and one caller, so it went unnoticed; a primitive §5 invites three
    // more callers to use would have institutionalised it. §2 says a floating surface tells the
    // flyer that what is behind it is still theirs, and a surface that eats their clicks is saying
    // the opposite.
    <div
      role="status"
      className={cx(
        "pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]",
        className,
      )}
      {...rest}
    >
      <Card pad={false} className="pointer-events-auto flex items-center gap-3 px-4 py-3 text-sm shadow-lg">
        <span className="text-zinc-700 dark:text-zinc-200">{children}</span>
        {action}
        {onDismiss && (
          // `square`, not a hand-rolled `TOUCH_TARGET_SQUARE` on the class string. `lib/ui-tokens.ts`
          // records that every such control in the app spelled the token itself, which is the reason
          // the prop exists — re-introducing the pattern inside the primitives file would be the
          // clearest possible place to get it wrong.
          <Button variant="ghost" onClick={onDismiss} aria-label={dismissLabel} square>
            <span aria-hidden>✕</span>
          </Button>
        )}
      </Card>
    </div>
  );
}

/** The drag half of a file target, on its own, so a surface that cannot be a card still gets it.
 *
 *  **Extracted for the flight-log intake, and the extraction is the point.** `DropZone` is a `Card`,
 *  and the second file ingest in the app is an inline control in a toolbar row inside a `Figure`
 *  inside a `Card` — a card-shaped primitive there is a card inside a card and a repaint of the
 *  results toolbar, which is why `ROADMAP.md` split that work out rather than doing it. What that
 *  surface actually lacked was the BEHAVIOUR: no drop path at all, so the one gesture a flyer makes
 *  with a file did nothing on the surface that shows the flight the file belongs to.
 *
 *  Three things it carries, and each is a defect this repo has already paid for once:
 *   - **`dragging` is a DEPTH, not a boolean.** `dragenter` and `dragleave` both bubble, so moving
 *     the pointer from the target onto a child fires a `dragleave` at the container, and a handler
 *     answering it with `false` drops the highlight every time the cursor crosses anything inside.
 *   - **Only a FILE drag arms it.** Dragging selected text or a link across the page fires the same
 *     events, and a target that lights up for a text selection claims something it cannot do.
 *   - **`dragover` is cancelled UNCONDITIONALLY**, with no `Files` test. Without a `preventDefault`
 *     the browser's own default runs: drag a link from another tab onto the surface and Chrome
 *     navigates to it, taking the flyer out of the app and their design with it. Gating this on
 *     `Files` for symmetry with the arming is a real bug that has been written here once already.
 *
 *  Returns the handlers to spread and whether a file is currently over the target, so the caller
 *  decides what that looks like — a tone change on a `Card`, a dashed edge, a tinted row. */
export function useFileDrop(onFile: (file: File) => void): {
  dragging: boolean;
  handlers: Pick<React.HTMLAttributes<HTMLElement>, "onDragEnter" | "onDragOver" | "onDragLeave" | "onDrop">;
} {
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  return {
    dragging,
    handlers: {
      onDragEnter: (e: React.DragEvent) => {
        if (!e.dataTransfer?.types?.includes("Files")) return;
        depth.current += 1;
        setDragging(true);
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.dataTransfer?.types?.includes("Files")) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      },
    },
  };
}

/** A file target — `DESIGN.md` §5. Drop a file on it, or choose one; it says what it takes, and it
 *  says so again, by name, when it is handed something else.
 *
 *  **A `Card` composed, like `Toast`, so the card treatment is written in exactly one place.** The
 *  two states are two of §2's tones and nothing else: `muted` at rest —
 *  "sunken and dashed: a slot with nothing in it yet" — and `accent` while a file is over it, "the
 *  one thing this surface is pointing at". Nothing about the edge is written out here.
 *
 *  **The 2 px border the hand-rolled version carried is GONE, and that is a decision rather than an
 *  oversight.** `ROADMAP.md`'s P18 flagged it as the thing to settle before writing this: a `Card`
 *  handed the 2 px width through `className` beats `Card`'s own `border` only by SOURCE ORDER — the
 *  literal is deliberately not written here, because Tailwind reads raw source text and a class named
 *  in a COMMENT generates a rule nothing asks for. Measured on the
 *  built stylesheet, `.border` at byte 16,788 and `.border-2` at 16,910, equal specificity — which is
 *  the hazard `Popover` documents 1,200 lines below this one for `left`/`inset-x`. Parameterising the
 *  width would have put a second border width in a system whose §2 declares none, at one call site,
 *  which is the "exists once and matches nothing else" tell this milestone exists to close. The
 *  affordance was never carried by the pixel: it is the dashed edge, the sunken fill, the size of the
 *  target and the sentence in it — and the drag state now changes the border's STYLE as well as its
 *  colour and fill, dashed to solid, which is a stronger signal than a width the flyer never sees
 *  change.
 *
 *  **`dragging` is a DEPTH, not a boolean, and the hand-rolled version had the bug.** `dragenter` and
 *  `dragleave` both bubble, so moving the pointer from the zone onto the paragraph inside it fires a
 *  `dragleave` at the container — and a handler that answers it with `setDragging(false)` drops the
 *  highlight every time the cursor crosses a child. Counting entries and exits is the fix; it is one
 *  ref, and it belongs in the primitive rather than in whichever call site notices the flicker.
 *
 *  **The refusal renders IN THE ZONE, and the primitive owns WHERE rather than WHAT.** That split is
 *  the correction a pre-push review forced, and it is worth recording because the first version got
 *  it exactly backwards. That version refused a file whose NAME did not match `accept` — which reads
 *  like the obvious thing for a drop zone to do and is wrong for this app twice over. Loft's importer
 *  does not look at file names at all: it sniffs the bytes, so a renamed `.ork`, an extensionless
 *  download or a share-sheet hand-off all import fine, and a name gate refuses every one of them with
 *  a sentence that is false. And the importer's own refusals are BETTER than anything a name test can
 *  produce — *"That does not look like a rocket design file … a flight log or a spreadsheet goes in
 *  the flight-log box on the results instead"* — so short-circuiting them replaced a message that
 *  says which box the file belongs in with one that only says no. It also broke three e2e cases,
 *  including two round-trips where Playwright hands back a download under a temporary name.
 *
 *  What was genuinely wrong was never the check, it was the PLACE: the parse failure surfaced in the
 *  page's shared error strip, below everything else on the route — measured from a COLD load, where
 *  the only thing between the two is the always-on bundled-examples card, at **765 px** below the
 *  zone at 1440x900 and **1,654 px** on a 390x844 phone. A returning flyer has further to look, not
 *  less: the recents shelf and the undo offers render only once there is history. So the caller keeps
 *  deciding what cannot be read, and this renders what it says as an `ErrorState` where the file
 *  landed. */
export function DropZone({
  accept,
  onFile,
  refusal,
  pickLabel,
  pickVariant = "primary",
  inputLabel,
  refusalNext,
  busy = false,
  busyLabel = "Working…",
  actions,
  footer,
  children,
  className,
  ...rest
}: {
  /** The HTML `accept` list. One string: it drives the picker AND the drop refusal, so the two
   *  cannot disagree — which is exactly how they disagreed before this existed. */
  accept: string;
  onFile: (file: File) => void;
  /** What the caller could not read, in the caller's words — rendered as an `ErrorState` inside the
   *  zone. Null or absent is the resting state. This primitive does not decide what is readable: the
   *  importer sniffs content, and a name test here would refuse files it reads perfectly well. */
  refusal?: React.ReactNode;
  /** The visible text of the picker. */
  pickLabel: string;
  /** The picker's weight. `primary` is right for a surface whose whole job is to take a file, and
   *  wrong the moment a `DropZone` sits on a workspace that already has a primary — §5 allows one per
   *  surface, and `ImportPanel` already reasons about that cap out loud. Hard-coding it would bake a
   *  §5 breach into the adopter this milestone has already queued. */
  pickVariant?: ButtonVariant;
  /** The file input's accessible name — the picker's own label names the ACTION, and a screen
   *  reader landing on the input needs to hear what kind of file it takes. */
  inputLabel: string;
  /** The way forward after a refusal, which is the one of `ErrorState`'s three parts only the call
   *  site knows. */
  refusalNext?: React.ReactNode;
  busy?: boolean;
  busyLabel?: string;
  /** Controls that belong beside the picker — "start a new design", "cancel". */
  actions?: React.ReactNode;
  /** A note under the controls, inside the zone. */
  footer?: React.ReactNode;
} & Omit<
  React.HTMLAttributes<HTMLElement>,
  // All four, not just `onDrop`. `{...rest}` spreads AFTER these handlers, so a call site passing
  // one of them would silently replace the arming, the depth counting or the refusal — and the zone
  // would still look right, which is the worst version of that. A surface that needs its own drag
  // behaviour is not this primitive.
  // `title` is here for a different reason than the four above: `Card` consumes it as its own TITLE
  // prop and renders an `<h3>` header row, so a call site passing the ordinary DOM tooltip attribute
  // would silently get a heading inside its drop zone.
  "onDrop" | "onDragEnter" | "onDragOver" | "onDragLeave" | "title"
>) {
  const inputRef = useRef<HTMLInputElement>(null);
  // The drag behaviour is `useFileDrop`'s, so this primitive and the flight-log intake cannot drift
  // apart on the three things above that each cost a fix once. What stays here is what a CARD-shaped
  // target adds: the tone change, the picker, the refusal's place and the live region.
  const { dragging, handlers } = useFileDrop(take);

  /** One intake for both roads in, so the picker and the drop cannot drift apart — which is how the
   *  hand-rolled version came to enforce `accept` on one and nothing at all on the other.
   *
   *  **Deliberately NOT gated on `busy`.** A first version returned early while a parse was running,
   *  which reads on screen as acceptance: the zone un-highlights, and then nothing happens and
   *  nothing is said — §5's missing state that says nothing, invented by the guard meant to prevent a
   *  race. The picker is taken out of service instead (both the button and the input), and a drop
   *  mid-parse behaves exactly as it did before this primitive existed. The underlying race — two
   *  imports for one design slot — predates this and is filed rather than half-closed here. */
  function take(file: File | undefined) {
    if (!file) return;
    onFile(file);
  }

  return (
    <Card
      // A hook, for the reason the add palette carries one: the zone is otherwise reachable only
      // through the CALL SITE's copy, and the e2e that drives the drag has to name the container
      // rather than a sentence inside it. Asserted present, so it needs no absence gate — the suite
      // is its own alarm if it is renamed (`scripts/check-selectors.mjs` explains which names do).
      data-drop-zone
      tone={dragging ? "accent" : "muted"}
      className={cx("text-center transition", className)}
      {...handlers}
      {...rest}
    >
      {children}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button variant={pickVariant} disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? busyLabel : pickLabel}
        </Button>
        <input
          ref={inputRef}
          type="file"
          aria-label={inputLabel}
          accept={accept}
          disabled={busy}
          // **`tabIndex={-1}`, and that is an accessibility fix rather than a hiding trick.** An
          // `sr-only` input is clipped to 1x1, so the focus ring `app/globals.css` gives it has
          // nowhere to draw: tabbing between "Choose a file" and the control beside it landed on
          // something no sighted keyboard user could see — WCAG 2.4.7, carried in from the
          // hand-rolled version. The button beside it is a real, labelled, visible tab stop that
          // opens the same picker, so the phantom one is removed rather than styled. `setInputFiles`
          // and `getByLabel` both still reach it, which is how the suite drives an import.
          tabIndex={-1}
          className="sr-only"
          onChange={(e) => {
            take(e.target.files?.[0]);
            // So the same file can be chosen again after a refusal or a parse failure — without
            // this, re-picking it fires no `change` at all and the control reads as dead.
            e.target.value = "";
          }}
        />
        {actions}
      </div>
      {/* **The live region is always in the DOM, and only its contents are conditional.** `alert`,
          not `status`: this is the direct answer to something the flyer just did. Rendering the
          region only when there is something in it is the version of this that half of assistive
          technology does not announce — a live region has to be present before the text arrives for
          the change to be observed reliably, and inserting the container and its content together is
          a race the page usually loses. It costs one empty `<div>`. */}
      <div role="alert">
        {refusal && <ErrorState className="mt-4 text-left" what={refusal} next={refusalNext} />}
      </div>
      {footer}
    </Card>
  );
}

interface PanelBase {
  title: React.ReactNode;
  /** The landmark's accessible name. This is a `<section>`, and much of the e2e suite reaches these
   *  by `getByRole("region", …)`. Optional because one real card is a landmark with no name of its
   *  own — the design-name strip, whose heading IS the name. */
  label?: string;
  /** Whatever sits at the right of the header row: what a run costs, a format label, an agreement
   *  figure.
   *
   *  **Taken as a raw node, with no size imposed, and that is a correction rather than laziness.**
   *  The first version wrapped it in `text-xs`, which is right for "300 flights on your device" and
   *  WRONG for `ValidationPanel`'s mean absolute error — §3 makes `text-sm` the floor for a
   *  decision-grade value and reserves caption size for the text around one. A primitive that
   *  imposes caption size on this slot puts a value there the moment a call site has one. `Figure`
   *  takes its `aside` the same way, for the same reason. */
  aside?: React.ReactNode;
  tone?: CardTone;
}

/** The dismissible form: all four move together, so the type says so. */
interface PanelDismissible extends PanelBase {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The primary button that opens it. `DESIGN.md` §5 allows one primary per surface, and this is
   *  the action the panel exists to perform. */
  run: React.ReactNode;
  /** Named in the close button's accessible name: `Close ${what}`. */
  what: string;
}

interface PanelStatic extends PanelBase {
  open?: never;
  onOpenChange?: never;
  run?: never;
  what?: never;
}

/** A titled card — `DESIGN.md` §5's `Panel`: "a `Card` with a section header row, and optionally a
 *  close affordance for anything dismissible. Owns focus return."
 *
 *  **Ten call sites, and only three of them are dismissible.** That is the discovery this component
 *  went through: it was built for the three heavy analysis panels, and the shape it extracted —
 *  `Card as="section"` + `aria-label` + an `h2 text-xl font-medium tracking-tight` in a baseline flex
 *  row with an optional aside — turned out to be **byte-identical** at seven more sites that have
 *  nothing to dismiss (the two cross-checks, the validation report, the flight-path card, the phase
 *  table, the no-flight refusal and the design-name strip). §5's container vocabulary was missing
 *  the shape the app uses most, and `Card`'s own `title` is a level below it: an `h3 text-base`,
 *  which is a heading inside a card rather than the card's own.
 *
 *  The dismissible half is a union rather than four loose optionals, so a call site cannot ask for a
 *  Close button and forget the Run button that focus returns to.
 *
 *  **Owning focus return is the point of the dismissible half, not the styling.** Each of the three
 *  paired `useReturnFocus()` with a `returnFocusToRun()` inside its own `onClose` — a four-part
 *  contract repeated by hand. `ClosePanel`'s own doc comment records what it cost when a panel had no
 *  way out at all; a panel that closes and drops focus onto the document body is the keyboard version
 *  of the same defect, and it is invisible to every check in this repo.
 *
 *  `children` renders BEFORE the Run button, which sounds wrong and is exactly what the call sites
 *  do: the button follows the panel's pitch paragraph, and the analysis it opens is gated on `open`,
 *  so the two are never on screen together. The rendered order is unchanged in both states. */
export function Panel({
  title,
  label,
  aside,
  tone,
  open,
  onOpenChange,
  run,
  what,
  className,
  children,
  ...rest
}: (PanelDismissible | PanelStatic) & Omit<React.HTMLAttributes<HTMLElement>, "title">) {
  const [runRef, returnFocusToRun] = useReturnFocus();
  const dismissible = onOpenChange !== undefined;
  return (
    <Card as="section" tone={tone} aria-label={label} className={className} {...rest}>
      <SectionHeader
        title={title}
        aside={
          (aside || (dismissible && open)) && (
            <div className="flex items-center gap-3">
              {aside}
              {dismissible && open && (
                <ClosePanel
                  onClose={() => {
                    onOpenChange(false);
                    returnFocusToRun();
                  }}
                  what={what}
                />
              )}
            </div>
          )
        }
      />
      {children}
      {dismissible && !open && (
        <div className="mt-3">
          <Button variant="primary" ref={runRef} onClick={() => onOpenChange(true)}>
            {run}
          </Button>
        </div>
      )}
    </Card>
  );
}

/** The header row a titled region and a titled card share — `Panel` renders it inside a `Card`,
 *  `Section` renders it bare. Extracted so the two cannot drift, which they had already done before
 *  either had a call site: `Section` spelled the heading
 *  `text-xl font-medium text-zinc-900 dark:text-zinc-100` while all ten real headings in the app
 *  spelled it `text-xl font-medium tracking-tight`. The app's spelling won — a primitive with zero
 *  call sites is a proposal, and ten rendered sites are the evidence. */
function SectionHeader({ title, aside }: { title: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-xl font-medium tracking-tight">{title}</h2>
      {aside}
    </div>
  );
}

/** A titled region within a route — `DESIGN.md` §5. What a route is built from, when it is NOT a
 *  raised card; where it is, that is `Panel`.
 *
 *  **It had zero call sites for five runs, and the reason was in its own implementation.** It imposed
 *  an 8-step top margin, zeroed on the first child, plus a 4-step one on the children — rhythm the
 *  routes already own through
 *  `space-y-8` on the workspace, so adopting it would have doubled every gap. A primitive that
 *  cannot be adopted without a repaint does not get adopted; it gets copied. Both margins are gone
 *  and the call site keeps its own spacing class, which is what the two real regions were already
 *  doing.
 *
 *  `aside` rather than `actions`, and raw rather than wrapped, to match `Panel` and `Figure`: one of
 *  the two real sites puts a Download button there and the other a documentation link, and a
 *  primitive that decides their size decides it wrong for one of them. */
export function Section({
  title,
  description,
  aside,
  className,
  children,
  ...rest
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  aside?: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={className} {...rest}>
      <SectionHeader title={title} aside={aside} />
      {description && (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
      )}
      {children}
    </section>
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  square = false,
  unavailable = false,
  className,
  type = "button",
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** `DESIGN.md` §8's 44 px minimum in both directions, for a control whose label is one glyph. See
   *  `buttonClass` — every one-glyph control in the app had hand-rolled this onto its own class
   *  string, which is why the prop exists rather than each site reaching for the token. */
  square?: boolean;
  /** Unavailable, and still meant to be READ — see `buttonClass`. Sets the treatment only; the
   *  caller still says `aria-disabled`. */
  unavailable?: boolean;
  /** Declared explicitly because `ButtonHTMLAttributes` does not carry it. React 19 passes `ref`
   *  to a function component as an ordinary prop, so no forwarding wrapper is needed — but the type
   *  has to say so, and three of the panels hand their Run button a ref to return focus to. */
  ref?: React.Ref<HTMLButtonElement>;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, square, unavailable, className })}
      {...rest}
    >
      {children}
    </button>
  );
}

/** A small segmented toggle, used for mode / deploy / unit switches. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  ariaLabel: string;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex rounded-md border border-zinc-300 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-900"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={
              // `TOUCH_TARGET_SQUARE`, not `TOUCH_TARGET`. A segmented option's label is as short as
              // its shortest word, and the height minimum alone leaves a narrow one under the contract:
              // measured when the diagram's fin-handle picker took this primitive, "Root" rendered
              // 43×44 and "Tip" 33×44 on a Pixel 7 — caught by the suite's own hit-target check, which
              // is what it is for. `DESIGN.md` §8 says 44 px, not 44 px tall.
              "inline-flex items-center justify-center rounded-md font-medium transition " +
              TOUCH_TARGET_SQUARE +
              " " +
              pad +
              " " +
              (active
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** An accessible tab bar — the workspace switcher for a view built from several distinct panels.
 *  Follows the WAI-ARIA tabs pattern: a roving-focus tablist with arrow-key navigation (Left/Right
 *  wrap, Home/End jump), each tab pointing at its panel. The caller renders the panels and toggles
 *  them by `value`, giving each a matching `role="tabpanel"`, `id={`panel-<id>`}`, and
 *  `aria-labelledby={`tab-<id>`}`. Scrolls horizontally rather than wrapping when space is tight, so
 *  it stays a single clean row on a phone. */
export function Tabs({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  const move = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = tabs.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = i === last ? 0 : i + 1;
    else if (e.key === "ArrowLeft") next = i === 0 ? last : i - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return;
    e.preventDefault();
    onChange(tabs[next].id);
    const btns =
      e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      );
    btns?.[next]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      // Sticky on a phone, where one workspace runs many screens deep and the only way back to the
      // tab bar was to scroll to the top of the page. A pointer layout has a wheel and the height
      // to spare, so above `sm` the tabs stay in the flow exactly as before. The background is the
      // page's own, solid: content scrolls underneath, and a translucent bar just shows it through.
      // The string itself lives in `lib/ui-tokens.ts` because the workspace spine renders the same
      // bar as a `<nav>` of links, and two copies of a treatment is how a treatment drifts.
      className={NAV_BAR}
    >
      {tabs.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active}
            aria-controls={`panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => move(e, i)}
            className={navItemClass(active)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}


/** `DESIGN.md` §5's `Extrapolated` — "the warn treatment plus the reason and the range it left",
 *  required wherever a number leaves the envelope its method was validated over.
 *
 *  **It existed on exactly one surface, and that is what made it a defect rather than a gap.** The
 *  treatment was written inline inside `ResultsView`'s local `Stat`, so the flight card marked a
 *  transonic apogee and the Monte-Carlo, both sweeps and the drag cross-check — every one of which
 *  flies the SAME solver over the SAME design — rendered their numbers byte-identically to a
 *  validated flight. Measured across the corpus: 9 of 109 flown stored simulations leave the drag
 *  model's subsonic envelope, reaching M1.67 on one, so a flyer choosing a motor or sizing recovery
 *  on those designs read an unqualified figure on four surfaces and a qualified one on a fifth. A
 *  caveat in one place and a confident claim in another is worse than either alone.
 *
 *  Two renderings of one fact, because the affordance a pointer has is not the one a phone has. The
 *  `abbr` carries the reason on hover, on focus and to a screen reader; the block beneath it writes
 *  the same sentence out where there is no hover to reveal it. Both are the primitive's, so a new
 *  surface cannot adopt half the treatment.
 *
 *  `inline` is for use INSIDE a value's own element — the flight card's metric tiles locate their
 *  readouts by walking the label's following siblings, so the marker has to live within the value
 *  rather than beside it. Everywhere else it stands on its own line above the numbers it qualifies. */
export function Extrapolated({
  reason,
  inline,
  className,
}: {
  /** Why this number left its envelope, and the range it left — one sentence, shown as written. */
  reason: string;
  inline?: boolean;
  className?: string;
}) {
  return (
    <>
      {/* The reason is named ONCE, and which mechanism names it depends on whether it is visible.
          Standing on its own line the sentence below is real text, so an `aria-label` here made a
          screen reader read the whole thing twice — once as the badge's name and again as the
          paragraph. Inline inside a metric tile the sentence is `display: none` to a fine pointer,
          so there the label is the only thing carrying it and it stays.

          (`abbr` has no implicit role, which makes `aria-label` discouraged on it; axe returns
          *incomplete* rather than a violation because the element has text, so the suite's own audit
          cannot see it either way. Kept for the inline case because dropping it there would leave a
          desktop screen-reader user the bare word "extrapolated" with no reason at all, and a
          visually-hidden sibling is not an option: the flight card's readouts are read with
          `innerText`, which returns `sr-only` text and would fold this sentence's digits into the
          number being parsed.) */}
      <abbr
        title={reason}
        aria-label={inline ? `Extrapolated — ${reason}` : undefined}
        className={cx(
          "block w-fit cursor-help rounded-md bg-amber-500/10 px-2 py-1 font-sans text-[11px] font-medium uppercase tracking-wide text-amber-700 no-underline dark:text-amber-400",
          inline ? "mt-1" : "",
          className,
        )}
      >
        extrapolated
      </abbr>
      <div
        className={cx(
          "text-xs font-sans font-normal text-zinc-600 dark:text-zinc-400",
          // Written out where there is no hover to reveal the `title`. Kept `hidden` rather than
          // `sr-only` on a fine pointer for the `innerText` reason above — the inline marker renders
          // inside the value element the flight card's tests read the number out of.
          inline ? "hidden pointer-coarse:block" : "mt-1",
        )}
      >
        {reason}
      </div>
    </>
  );
}

/** The no-card frame for a `Readout` that already sits inside a container. It takes and ignores
 *  `tone`, so the two frames are interchangeable at the call site rather than each needing their own
 *  branch — a surface is either sunken or it is not, and a bare readout inherits whatever it sits
 *  in. */
function BareFrame({ children }: { tone?: CardTone; children: React.ReactNode }) {
  return <div>{children}</div>;
}

/** `DESIGN.md` §5's `Readout` — "a labelled value with its unit, provenance and optional caveat; the
 *  unit is never baked into the label string".
 *
 *  **Lifted rather than designed.** This is `ResultsView`'s own local `Stat`, moved verbatim: it had
 *  already grown every axis §5 asks for — the unit in its own span, the accent for the one number a
 *  surface exists to show, the withheld state that replaces a value with an em dash and says why,
 *  and the extrapolated caveat. Re-deciding the API here would have thrown away the four separate
 *  occasions that shaped it. What was wrong was only that sixteen readouts on one page could reach
 *  it and the rest of the app could not, so every other surface hand-rolled the same treatment.
 *
 *  **The label div is immediately followed by the value div, and that ordering is a contract**: the
 *  e2e suite locates several readouts by `following-sibling::div[1]` off the label, so anything added
 *  here goes BELOW the value, never between it and the label. The extraction itself changed no class;
 *  what has changed since is recorded at each prop. */
export function Readout({
  label,
  q,
  sub,
  figure,
  tone,
  accent,
  withheld,
  extrapolated,
  caution,
  flag,
  variant = "tile",
}: {
  label: string;
  q: Quantity;
  /** The text AROUND the value — its provenance, its qualifier, the phase it was taken at. `text-xs`,
   *  because §3 puts the text around a decision-grade value one size below it. A SECOND number goes
   *  in `figure`, not here. */
  sub?: string;
  /** A second decision-grade figure beneath the value — a percentile band, a companion statistic.
   *  `text-sm`, the floor §3 sets for anything a flyer reads to make a decision, and mono so its
   *  digits line up with the value above it.
   *
   *  **This slot exists because `sub` could not be both sizes, and that was the last thing blocking
   *  P6.** `MonteCarlo` put a 5-95% dispersion band in its own equivalent of `sub` at `text-sm`, and
   *  a recovery band IS a figure a flyer sizes a recovery area from — §3's own rule makes it
   *  `text-sm` and makes a caption `text-xs`, so one slot could not serve both without breaking one
   *  of them. Splitting the slot is what the six real call sites asked for rather than what was
   *  convenient: three want a band (`q` … `to`), one wants a labelled companion (`lead` + `q`), and
   *  two want neither and take `withheld` instead.
   *
   *  `to` renders the pair as a range under ONE unit — "1,234 – 1,456 m", not "1,234 m – 1,456 m" —
   *  because the two ends of a band are one quantity, and repeating its unit reads as two. `lead`
   *  and `note` stay sans: they are words about the figure, not part of it. */
  figure?: { lead?: string; q: Quantity; to?: Quantity; note?: string };
  /** The card surface, for a readout that sits INSIDE another container. The dispersion panel's
   *  cards are `sunken` so they read as contents of the panel rather than as siblings of it. */
  tone?: CardTone;
  /** §3: `font-semibold` and the accent colour are for "the one number a surface exists to show" —
   *  ONE per surface. A grid where every card is semibold has no lead number, which is the state
   *  the dispersion panel was in before it adopted this primitive. */
  accent?: boolean;
  /** Why this figure is not being shown. When set, the value is replaced by an em dash and this
   *  reason takes the place of `sub` — the house rule is "withheld rather than shown as zeros", and
   *  a withheld estimate has to say why (see the no-propulsion notice, which does the same thing for
   *  the whole panel). Used where the solver carries a sentinel that is not a measurement. */
  withheld?: string;
  /** The envelope this number left, when it left one. `DESIGN.md` §5 requires the `Extrapolated`
   *  treatment — "the warn treatment plus the reason and the range it left" — WHEREVER a number
   *  leaves the envelope its method was validated over, and until now a transonic apogee rendered
   *  byte-identical to a subsonic one, with the caveat surfacing only as a separate card further up
   *  the page. A flyer reading the number does not necessarily read the card. */
  extrapolated?: string;
  /** A threshold this value has crossed, and WHY that matters — rendered as the warn colour on the
   *  value plus the reason on the caption line.
   *
   *  **The reason is not optional, and that is the point.** `MAINTAINING.md` names "a badge reading
   *  HIGH beside a number" as a verdict with no reasoning attached, and a value that silently turns
   *  amber past a threshold is the same thing with fewer words. The one site this was extracted from
   *  — the dispersion panel's waiver-ceiling exceedance — turned amber above 5% and said nothing
   *  about what 5% was or why it mattered. Typing the prop as a string rather than a boolean is what
   *  makes that impossible to reintroduce. */
  caution?: string;
  /** The DENSITY this labelled value is rendered at. The treatment — the uppercase label, the mono
   *  tabular value, the unit in its own span, the withheld em dash, the caveat — is the same in all
   *  three; what changes is the container and the size of the number.
   *
   *  | variant | container | value | used by |
   *  |---|---|---|---|
   *  | `tile` | its own `Card` | `text-xl` | the flight card's 16 metrics, the dispersion grid's 4 |
   *  | `bare` | none — it already sits in one | `text-xl` | the waiver-exceedance readout inside the dispersion panel's input card |
   *  | `row` | none, and it renders `<dt>`/`<dd>` | `text-sm` | the design-summary strip, 14 fields of dense shared chrome |
   *
   *  **`row` is why P6's last clause took three increments rather than one.** The measured queue of
   *  "hand-rolled labelled values" was never one treatment written many ways — it was one treatment
   *  at two densities, and a card-shaped primitive could not reach the dense half without repainting
   *  the shared chrome into 14 cards. §3 sanctions both sizes: `text-xl` is "an analyzer's big
   *  readout", `text-sm` is "the body default — every label, value, control and table cell".
   *
   *  `<dt>`/`<dd>` is not cosmetic in `row`: the strip is a real `<dl>`, and 19 of the e2e suite's
   *  21 `following-sibling::dd` locators walk off these labels. A `row` that rendered divs would be
   *  a repaint of the DOM contract as well as of the markup. */
  variant?: "tile" | "bare" | "row";
  /** A short flag beside the value, with the reason it means something. `row` only — a tile has room
   *  for `Extrapolated`'s full treatment and uses it.
   *
   *  **The reason is required, for the rule `MAINTAINING.md` states**: "a badge reading HIGH beside a
   *  number is a verdict with no reasoning attached, which is the one thing this tool is not supposed
   *  to hand out." Three real uses — `low` and `high` on the static margin, and `extrapolated` on
   *  apogee — and all three were already spelling this pair by hand. */
  flag?: { text: string; why: string };
}) {
  // **`text-xs`, not `text-[11px]`, on both the label and the sub-line.** §3 scopes that token to
  // "axis ticks and diagram annotations only" and this is neither: it is the eyebrow naming a value
  // and the line carrying that value's provenance or its withheld REASON, which §3 puts squarely in
  // "captions, units, footnotes". The violation arrived WITH the primitive on 2026-08-04 — lifted
  // verbatim from `ResultsView`'s local `Stat`, which is exactly how a divergence survives an
  // extraction — so it was the design system's own primitive breaking the design system, on the
  // treatment a flyer reads every number through. Filed, confirmed by a refuter, then fixed here.
  //
  // `text-xs` and not `text-sm`, deliberately: §3 makes `text-sm` the floor for anything a flyer
  // reads to make a DECISION and `text-xs` the size for the text around such a value. The label
  // names the value; the sub-line qualifies it. **The case that argued otherwise is answered by
  // `figure` rather than by widening this slot** — see that prop's own note.
  //
  // `font-medium` on the label because §3's weight rule says so — "`font-medium` for labels and
  // headings" — and because the sites converting onto this primitive already spelled it that way.
  // Adopting a primitive must not cost a call site its compliance with the file the primitive
  // exists to enforce.
  // `caution` and `accent` are mutually exclusive in effect, and caution wins: the accent marks the
  // number a surface exists to show, and a threshold that has been crossed is the more urgent fact
  // about it. No call site asks for both today; if one ever does, this is the answer it gets.
  const valueTone = caution
    ? "text-xl font-semibold text-amber-700 dark:text-amber-300"
    : accent
      ? "text-xl font-semibold text-indigo-600 dark:text-indigo-400"
      : "text-xl text-zinc-900 dark:text-zinc-100";
  // The dense row is a different ELEMENT set as well as a different size — see `variant`. Split here
  // rather than threaded through the tile branch below, because almost nothing is shared once the
  // container, the tags and the value size all change: pretending otherwise would have produced one
  // component with a ternary on every line.
  if (variant === "row") {
    return (
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</dt>
        <dd className="font-mono text-sm tabular-nums text-zinc-800 dark:text-zinc-200">
          {withheld ? (
            <span aria-label={`${label} withheld: ${withheld}`}>&mdash;</span>
          ) : (
            <>
              {q.value}
              {q.unit && <span className="ml-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">{q.unit}</span>}
            </>
          )}
          {/* **The marker here is a plain span with an accessible name, NOT the `Extrapolated`
              primitive, and that is a measurement rather than an inconsistency.** `Extrapolated`
              renders an `<abbr title>` plus a reason line that a coarse pointer unhides. Both are
              wrong in this density: a `title` is unreachable on touch and this strip renders in the
              shared chrome on all four routes, so adopting it took the phone suite's hover-only-state
              count from 0 to 5 — and the written-out line took the chrome past its 1060 px ratchet
              and `/sweep` back over the two screens §8 allows. Both halves of §8 are contracts and
              neither is spent on the other. The reason travels by accessible name, and in full words
              by the hint components below the fold, which render exactly when a flag is raised. */}
          {(flag ?? (extrapolated ? { text: "extrapolated", why: extrapolated } : undefined)) && (
            <span
              aria-label={((f) => `${f!.text} — ${f!.why}`)(
                flag ?? { text: "extrapolated", why: extrapolated! },
              )}
              className="ml-1 text-xs uppercase text-amber-700 no-underline dark:text-amber-400"
            >
              {(flag ?? { text: "extrapolated" }).text}
            </span>
          )}
          {(withheld ?? sub) && (
            <div className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{withheld ?? sub}</div>
          )}
        </dd>
      </div>
    );
  }
  const Frame = variant === "bare" ? BareFrame : Card;
  return (
    <Frame tone={tone}>
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</div>
      {withheld ? (
        <div className="mt-1 font-mono text-xl tabular-nums text-zinc-400 dark:text-zinc-500" aria-label={`${label} withheld: ${withheld}`}>
          —
        </div>
      ) : (
        <div className={"mt-1 font-mono tabular-nums " + valueTone}>
          {q.value}
          <span className="ml-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">{q.unit}</span>
          {/* Inside the value's own line, not a sibling of it — hence `inline`. The readouts are
              located by walking the label's following siblings, and a new sibling div silently broke
              two of those locators; block rather than inline-flow, because beside the value it
              pushed a 320 px metric tile into clipping its own number. The treatment itself is
              `components/ui.tsx`'s, not this file's: it was written here first and four other
              surfaces then flew the same extrapolated solver with no marker at all. */}
          {extrapolated && <Extrapolated reason={extrapolated} inline />}
        </div>
      )}
      {/* The decision-grade line sits directly under the value and above any caption, because it is
          the closer of the two to being part of the number. A withheld value has neither: there is
          no band around a figure that does not exist, and the reason takes the caption line. */}
      {!withheld && figure && (
        <div className="mt-0.5 font-mono text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
          {figure.lead && <span className="font-sans">{figure.lead} </span>}
          {figure.q.value}
          {figure.to && <> – {figure.to.value}</>}
          <span className="ml-1 text-xs font-normal">{figure.q.unit}</span>
          {figure.note && (
            <span className="ml-1 font-sans text-xs text-zinc-400 dark:text-zinc-500">{figure.note}</span>
          )}
        </div>
      )}
      {(withheld ?? caution ?? sub) && (
        <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{withheld ?? caution ?? sub}</div>
      )}
    </Frame>
  );
}

/** `DESIGN.md` §5's `Select` — the one dropdown treatment in the app.
 *
 *  **Twelve `<select>` elements hand-rolled FIVE class strings before this existed**, across
 *  `LoftApp` (7), `ResultsView` (2), `ParameterSweep` (2) and `PartPicker` (1). Four of the five were
 *  the same control written slightly differently; the fifth was a genuine defect, and it is the
 *  reason this is worth more than tidiness: `ResultsView`'s two unit pickers carried no
 *  `TOUCH_TARGET` at all, so on a phone they rendered below §8's 44 px minimum on the workspace
 *  whose whole point is being usable at the pad. A treatment copied by hand is a treatment that
 *  drifts, and the drift lands where nobody re-measures.
 *
 *  It renders the `<select>` and nothing else — deliberately. Several call sites wrap it in their
 *  own `<label>` with a visible `<span>`, and the e2e suite reaches those by `getByLabel`, so a
 *  primitive that invented its own label markup would have moved the accessible name of every one
 *  of them. Options stay as children, so each site's existing `<option>` block — several of which
 *  compute their text from the design — moves across verbatim.
 *
 *  `className` is for LAYOUT only (`w-full`, `flex-1`, `mt-1`): the border, padding, type size,
 *  focus ring and touch minimum belong to the primitive, and a site that needs one of those
 *  different is a change to this component or to `DESIGN.md`, not a class at the call site. */
export function Select({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        "rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
        TOUCH_TARGET,
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

/** `DESIGN.md` §5's `EmptyState` — "says what would fill it *and* the one action that does. Never
 *  'No data'."
 *
 *  **A surface with no empty state is not finished; it is the state a flyer sees first.** Measured on
 *  the real-design corpus: `structurePointMasses` returns nothing for
 *  `Three-stage rocket.CDX1`, so `MassBreakdown` hit `return null` and the whole Mass & balance panel
 *  VANISHED — a hole where a panel was, on 1 of the 35 corpus designs, with no way to tell a surface
 *  that has nothing to show from one that failed to render.
 *
 *  `what` is the sentence, `action` the control that fills it. The action is optional because it is
 *  sometimes genuinely absent — a design that states no structural mass needs a different FILE, not a
 *  button — and inventing one would be worse than omitting it. What is never optional is saying what
 *  would fill the surface, which is why `what` is required and "No data" is not an acceptable value
 *  for it.
 *
 *  `muted` is the tone `DESIGN.md` §2 already names for this: "sunken and dashed: a slot with nothing
 *  in it yet. The empty state's container." */
export function EmptyState({
  what,
  action,
  className,
}: {
  /** What would fill this surface, in a sentence a flyer can act on. Never "No data". */
  what: React.ReactNode;
  /** The one action that fills it, where one exists. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card tone="muted" className={cx("text-sm", className)}>
      <div>{what}</div>
      {action && <div className="mt-3">{action}</div>}
    </Card>
  );
}

/** `DESIGN.md` §5's `ErrorState` — "names the file or field that failed, what was expected, and the
 *  way forward. An error that names something not on the page is a named tell."
 *
 *  Three required parts, and they are separate props rather than one string on purpose: a message
 *  assembled at the call site drops one of the three about as often as not, and the three are what
 *  make an error actionable rather than an apology. `what` names the thing — a file, a field, a
 *  parse — `expected` says what should have been there, and `next` is what the flyer can do.
 *
 *  It renders `danger`, which §2 reserves for "a refusal, or a value that could not be computed".
 *  That is deliberately NOT the same tone as `EmptyState`: a surface with nothing to show and a
 *  surface that broke are different facts, and rendering them alike is how a flyer learns to ignore
 *  both. */
export function ErrorState({
  what,
  expected,
  next,
  className,
}: {
  /** The file, field or step that failed — named, so it is findable on the page. */
  what: React.ReactNode;
  /** What was expected instead. */
  expected?: React.ReactNode;
  /** The way forward. */
  next?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card tone="danger" className={cx("text-sm", className)}>
      <div>{what}</div>
      {expected && <div className="mt-1">{expected}</div>}
      {next && <div className="mt-1">{next}</div>}
    </Card>
  );
}

/** `DESIGN.md` §5's `Swatch` — the colour sample that says which series or marker a legend row is
 *  about.
 *
 *  **Eight sites across five files, one treatment, hand-rolled at TWO radii — and §9's radius check
 *  could not see any of it.** Measured 2026-08-09: five bar swatches (`inline-block h-2 w-3`) wrote
 *  the sm radius step four times and a 2 px arbitrary radius once, for the same 12x8 px chip; three marker dots
 *  wrote `h-2 w-2 rounded-full`, one of them with a border instead of a fill. The old radius grep
 *  named a single literal — the lg step — so every one of them read as compliant. This is the twelve
 *  card treatments in miniature, in the part of the tree the instrument was blind to.
 *
 *  **`bar` for a series, `dot` for a marker**, because that is the distinction the legends already
 *  drew: a line on a chart is a length of colour, and a CG or CP annotation is a point. Anything
 *  else is a third shape, which is a change to `DESIGN.md` rather than a prop.
 *
 *  `color` is for a colour that comes from DATA — a chart series picks its own, so it cannot be a
 *  class — and `className` is for one the palette names. A site passing both is describing two
 *  colours for one chip, so the style wins and the class should not be there.
 *
 *  **The motor chip on the rocket diagram converged and its corners moved**, from a hand-written 2 px
 *  to the 4 px every `bar` renders. It had been tracking the drawn mark's own `rx`, which is a real
 *  argument and not enough of one: a legend chip is a colour SAMPLE beside a label, not a scale
 *  drawing of the part, and the four chart-series bars beside it are the same kind of thing. A third
 *  shape for one adopter is what §5 declines to do elsewhere. */
export function Swatch({
  shape = "bar",
  color,
  className,
}: {
  shape?: "bar" | "dot";
  /** A CSS colour a series carries as data. Rendered as a background, since Tailwind cannot. */
  color?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      // **§2's control radius, and on this box it is free.** CSS scales a corner radius to what its
      // edge can hold (Backgrounds 3, §5.5: every radius scales by the smallest of edge-length over
      // the sum of its two radii), so on a 12x8 px chip every radius at or above 4 px renders as
      // exactly 4 px — the control, container and pill radii are pixel-identical here. A first
      // version wrote the small radius and bought the binding document a permanent exception, §9 a
      // budget of one and this suite an owner-exemption assertion, for zero pixels. The pre-push
      // review measured that; the arithmetic is why it was worth undoing rather than defending.
      className={cx(
        "inline-block",
        shape === "dot" ? "h-2 w-2 rounded-full" : "h-2 w-3 rounded-md",
        className,
      )}
      style={color ? { background: color } : undefined}
    />
  );
}

/** `DESIGN.md` §5's `Figure` — "a chart with its title, legend, axis units, and its own empty and
 *  extrapolated states."
 *
 *  Nine call sites in four files spelled this four ways. `ResultsView` had a local `Plot` (a `Card`,
 *  an `h3`, an `overflow-x-auto` wrapper); `MonteCarlo` repeated that exact heading string without
 *  the wrapper; `DragCrossCheck` used a `<p>` where a heading belongs, one shade off at
 *  `text-zinc-600`, with an aside beside it; and `ParameterSweep` had the caveat above the chart and
 *  the caption below it and no heading at all. The heading is the primitive's, so the `<p>` becomes a
 *  real `h3` and the shade converges — `DESIGN.md`'s *Notes* say the primitive wins and the
 *  difference is the defect.
 *
 *  Legend and axis units are NOT here on purpose: `LineChart` already owns both, draws the legend
 *  from each series' own label, and takes `xLabel`/`yLabel`. §5 lists them as things a figure must
 *  HAVE, not as things this wrapper must render, and moving them up would mean every chart declaring
 *  its axes twice.
 *
 *  `title` is optional because one real site has none — the parameter sweep's chart sits directly
 *  under the panel heading that names it, and a second heading would be a heading about a heading.
 *  What is not optional is that the caveat and the caption have ONE place to go, which is what makes
 *  the extrapolated state a state rather than a paragraph somebody remembered.
 *
 *  `empty` renders when `children` is null or undefined. A chart with nothing to draw is the state
 *  §5 says a surface without is not finished, and `return null` — a hole where a figure was — is the
 *  version of it that teaches nothing. */
export function Figure({
  title,
  aside,
  extrapolated,
  caption,
  empty,
  className,
  children,
  ...rest
}: {
  title?: React.ReactNode;
  /** A note in the title row: what the figure agrees to, what it covers. */
  aside?: React.ReactNode;
  /** The reason this figure leaves the envelope its method was validated over. Rendered above the
   *  chart, because a caveat under a chart is read after the number it is about. */
  extrapolated?: string;
  /** The small print: what was flown, over what, and how to read it. */
  caption?: React.ReactNode;
  /** What would fill this figure, for when nothing does. */
  empty?: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "title">) {
  return (
    <figure className={className} {...rest}>
      {/* The title row is a flex row only when there is something to sit BESIDE the heading. A
       *  wrapper around a lone `<h3>` is markup nobody asked for, and it is not free: two e2e cases
       *  reach this figure's caption by `heading → xpath=..`, which is the whole figure when the
       *  heading's parent is the `<figure>` and is the empty title row when it is not. Both went red
       *  on the first draft of this component, which is the useful kind of red — an extra div is
       *  invisible to a screenshot and not to a traversal. */}
      {aside ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          {title && <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</h3>}
          {aside}
        </div>
      ) : (
        title && <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</h3>
      )}
      {extrapolated && (
        <div className="mt-2">
          <Extrapolated reason={extrapolated} />
        </div>
      )}
      <div className="mt-2 overflow-x-auto">
        {children ?? <EmptyState what={empty ?? "Nothing to plot yet."} />}
      </div>
      {caption && (
        <figcaption className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{caption}</figcaption>
      )}
    </figure>
  );
}

/** Hand focus to the control that REPLACES the one that just vanished.
 *
 *  Closing a panel unmounts the Close button while it is the focused element, and a removed element
 *  takes focus with it: the browser falls back to `<body>`, so a keyboard or screen-reader user who
 *  closed a panel near the bottom of a long workspace was thrown back to the top of the document with no way
 *  to tell what had happened. The Run button that takes its place does not exist until the state
 *  change has rendered, so the focus is asked for and then applied on the render that produces it.
 *
 *  Wire it as: `ref` on the Run button, `returnFocus()` in the Close handler. */
export function useReturnFocus(): [
  React.RefObject<HTMLButtonElement | null>,
  () => void,
] {
  const ref = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending) return;
    ref.current?.focus();
    setPending(false);
  }, [pending]);
  // A pair rather than an object: reading `x.ref` in the JSX below is a property access during
  // render, which the react-hooks rules refuse ("Cannot access refs during render"). Destructured
  // from a tuple at the call site it is an ordinary binding the caller only ever hands to `ref=`.
  return [ref, () => setPending(true)];
}

/** The way back out of a heavy analysis panel.
 *
 *  The dispersion run and the two sweeps each open on a Run button and, until this existed, offered
 *  nothing that closed them again: once opened they stayed open for the rest of the session. That
 *  cost twice. On a 390 px phone the open dispersion panel measured 2,195 px against 308 px closed
 *  — two and a half screens a flyer scrolls past on every visit to the sweeps. And an open panel
 *  re-flies whenever the design changes, so an ordinary nose-ballast edit re-ran hundreds of
 *  flights: 2.5 s of blocked work per edit, per open panel, for a result nobody was reading.
 *
 *  Closing discards the result rather than keeping it. A kept result would be a number computed for
 *  a design the flyer can go on to change, sitting behind a collapsed panel with nothing on screen
 *  saying so — and the panels exist to avoid exactly that. The Run button coming back is what says
 *  it: the panel is offering the run again, not hiding an answer. */
export function ClosePanel({
  onClose,
  what,
}: {
  onClose: () => void;
  what: string;
}) {
  return (
    <Button variant="secondary" onClick={onClose} aria-label={`Close ${what}`}>
      Close
    </Button>
  );
}

/** Every focusable descendant of `root`, in tab order, skipping anything not rendered.
 *
 *  Deliberately a query rather than a library: the set of focusable elements this app actually
 *  produces is small and closed — the primitives in this file plus native inputs — and a dependency
 *  for one component is a dependency the bundle carries on every route. `offsetParent` is the
 *  cheapest "is it visible" test that works for `display: none` and detached subtrees alike. */
function focusableWithin(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  const sel =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter((el) => el.offsetParent !== null);
}

/** An explanation or a small set of controls, shown OVER the surface rather than in it —
 *  `DESIGN.md` §5, whose entry is the contract and is shared verbatim with the sibling repo.
 *
 *  **The sibling already had this word, and Loft did not know.** Both apps' owners asked for the same
 *  pattern on the same day (`ON-5` here, `ON-3` there), and the entry in `DESIGN.md` is that repo's,
 *  adopted rather than rewritten — a primitive invented twice is the "assembled by many hands"
 *  failure the design system exists to prevent, and this one came within a commit of happening.
 *  Loft's version meets the contract; its API is narrower, and closing that gap is the shared-file
 *  reconciliation filed in `BACKLOG.md`.
 *
 *  Every clause below is a defect somebody already shipped, in one app or the other:
 *  - **`Escape` is bound to the DOCUMENT.** Bound to the surface it only fires while focus is inside
 *    it, and focus leaves — a `blur()`, a control that removes itself, a stray click. The way out
 *    then stops working while the surface is still open, which is the one-way door this component
 *    exists not to be. Loft's e2e case for the first adopter caught exactly that.
 *  - **Both exits leave focus somewhere real.** Focus moves INTO the panel on open, so the panel owes
 *    focus a home when it goes. `Escape` returns it to the trigger; an outside click returns it only
 *    when focus would otherwise be lost, because a click that landed on something focusable is where
 *    the reader meant to go.
 *  - **The trigger's visible words ARE its accessible name.** An `aria-label` REPLACES them, so a
 *    button reading "Properties" named "Edit the properties of the main parachute" fails WCAG 2.5.3
 *    *Label in Name* and stops answering to voice control. The panel's own name carries the subject.
 *  - **The heading stays put and the BODY scrolls.** Capping the whole card instead scrolls the close
 *    control off the top on a phone, which is the way out disappearing.
 *  - **`Card`'s own title/actions row**, never a hand-rolled one — a popover is not a licence for a
 *    thirteenth card treatment, and writing that row out inside the primitive whose job is to prevent
 *    exactly that is the same failure one level down.
 *  - **`aria-haspopup="dialog"`**: `aria-expanded` alone is the DISCLOSURE pattern's attribute, and a
 *    screen reader announcing "collapsed" for a dialog names the wrong widget.
 *  - **The panel resets inherited typography.** `text-transform` and `letter-spacing` inherit, so a
 *    popover opened from inside an uppercase caption renders its whole body in capitals — measured in
 *    the sibling at 764 words of ALL CAPS, invisible to every text assertion in its suite because
 *    `innerText` is identical either way. Loft's first adopter does not currently sit under one —
 *    measured, its ancestors resolve to `text-transform: none` — so here the reset is precautionary,
 *    kept because the cost is one class and the sibling has already paid for finding out.
 *  - **`aria-modal` is deliberately NOT set.** It claims the rest of the page is inert and nothing
 *    makes that true, so it would be a lie told to exactly the users least able to check it. Earning
 *    it means marking the app root `inert`; that belongs to whichever milestone wants a genuinely
 *    modal dialog.
 *
 *  Positioning is CSS, not measurement: no layout effect, nothing to disagree with the server's HTML.
 *  Below `sm` the panel is anchored to the VIEWPORT rather than to its trigger, because a panel
 *  right-anchored to a control near the edge runs off the side and takes its own labels with it. */
export function Popover({
  trigger,
  title,
  what,
  className,
  children,
}: {
  /** The trigger's visible label — and its accessible name. See the note above before adding an
   *  `aria-label`: on a trigger that shows words it replaces them. */
  trigger: React.ReactNode;
  /** The panel's heading, and its accessible name. Required: a panel that does not say what it is has
   *  failed at the one job it has, and `Card`'s `justify-between` row would put the close control at
   *  the left edge with nothing opposite it. */
  title: string;
  /** What the Close button closes, for its accessible name. */
  what: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [triggerRef, returnFocusToTrigger] = useReturnFocus();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = () => {
    setOpen(false);
    returnFocusToTrigger();
  };

  // Focus the first thing in the BODY on open — deliberately not the panel, because a flyer opening
  // a property surface is going to type into it and landing on the heading costs them a Tab every
  // time.
  //
  // **The body rather than the panel, and that is a correction a review caught.** `Card` renders its
  // `actions` row before `children`, so the first focusable in the whole panel is always the Close
  // button: every open landed on "Close" while this comment claimed it landed on the first field.
  // Falling back to the panel keeps the trap somewhere to hold when the body has nothing focusable.
  useEffect(() => {
    if (!open) return;
    const items = focusableWithin(bodyRef.current);
    (items[0] ?? panelRef.current)?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
      // Only where the click would otherwise strand focus on `<body>` — which is the bug
      // `useReturnFocus` exists to prevent. After the click has settled, so `activeElement` is
      // whatever the browser gave it.
      requestAnimationFrame(() => {
        const el = document.activeElement;
        if (!el || el === document.body) triggerRef.current?.focus();
      });
    };
    // `capture`, so a handler inside the page that stops propagation cannot leave this stranded open.
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, triggerRef]);

  useEffect(() => {
    if (!open) return;
    // Bubble phase, and NOT `stopPropagation`: in capture this would run ahead of the panel's own
    // content — a native `<select>` open inside it takes Escape first and should — and swallowing the
    // key would take it from every ancestor on a surface that is not this one.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const items = focusableWithin(panelRef.current);
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !panelRef.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <span className={cx("relative inline-flex print:hidden", className)}>
      <Button
        ref={triggerRef}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {trigger}
      </Button>
      {open && (
        <Card
          id={panelId}
          ref={panelRef as React.Ref<HTMLElement>}
          role="dialog"
          aria-label={title}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          title={title}
          actions={<ClosePanel onClose={close} what={what} />}
          className={cx(
            "absolute top-full z-30 mt-2 text-left normal-case tracking-normal outline-none",
            // Anchored to the VIEWPORT below `sm` and to the trigger above it. Both edges are named
            // explicitly rather than through an inset-x utility plus an override: a zero-left
            // utility and an inset-x at a step both set `left` at equal specificity, so which wins is
            // source order in the generated
            // stylesheet, and measured on a 390 px phone the panel came out at x=0 with only the
            // right gutter applied.
            "max-sm:fixed max-sm:left-4 max-sm:right-4 max-sm:top-auto max-sm:bottom-4",
            "sm:left-0 sm:w-[min(42rem,calc(100vw-2rem))]",
          )}
        >
          {/* The BODY scrolls; the heading and the close control above it do not. */}
          <div ref={bodyRef} className="max-h-[60vh] overflow-y-auto">
            {children}
          </div>
        </Card>
      )}
    </span>
  );
}

/** A collapsible "show your work" disclosure — the transparency pattern used throughout. */
export function Disclosure({
  summary,
  defaultOpen = false,
  className,
  children,
}: {
  summary: string;
  defaultOpen?: boolean;
  /** Merged onto the `<details>`. Needed by real call sites for things that are not styling — a
   *  `print-hide` marker, or overriding the default top margin where the parent already owns the
   *  rhythm. Without it this primitive could not be adopted at all, which is most of why it sat at
   *  zero call sites while a component two files away duplicated its class string verbatim. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className={cx(
        "group mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/50",
        className,
      )}
    >
      {/* `TOUCH_TARGET` because a summary IS the control that opens the panel, and this primitive
          shipped without one — so every future adopter would have inherited a sub-44 px target on a
          phone. §8 has no exemption for a disclosure. */}
      <summary
        className={cx(
          "flex cursor-pointer select-none items-center font-medium text-zinc-700 dark:text-zinc-300",
          TOUCH_TARGET,
        )}
      >
        {summary}
      </summary>
      <div className="mt-3 space-y-4 text-zinc-600 dark:text-zinc-400">
        {children}
      </div>
    </details>
  );
}

/** What the box shows for a committed value: exactly that value, and for a number that includes ZERO.
 *
 *  It used to render 0 as blank, so that an untouched dispersion field showed its placeholder rather
 *  than a 0 nobody typed. That is a true statement about the dispersion panel, where 0 means "no
 *  spread" and blank says it more quietly — and a false one everywhere else, because to the design
 *  editor 0 is a value a flyer committed. Measured once both families shared this function: typing
 *  −30 into "Rail angle" is pulled to its 0 bound, the bound lands in the flight, and the box then
 *  went BLANK — the field showing nothing while the flight used the 0 it had just been given.
 *
 *  Blank is the caller's word, not this one's: the seven dispersion fields pass `x || ""` and keep
 *  their quiet placeholder, and no field is told that a number it holds is not worth showing. */
function display(value: string | number): string {
  return typeof value === "string" ? value : String(value);
}

/** THE numeric input — `DESIGN.md` §5, "every numeric input in either app is this".
 *
 *  **This is a merge of two complete implementations, and the rule applied was: keep the STRONGER of
 *  the two at every point, never the newer.** Until 2026-08-02 `components/LoftApp.tsx` carried a
 *  second field called `Num` at 28 call sites — the design editor's whole what-if vocabulary — while
 *  this one served 7, all in the dispersion panel. They disagreed on six things, and on four of them
 *  the older, un-primitive one was ahead. What each side contributed:
 *
 *  | behaviour | came from | why it won |
 *  |---|---|---|
 *  | a STRING value/onChange contract | `Num` | strictly richer — it can express blank, which a number cannot. Blank means "use the design's own value" to the editor and "zero spread" to the dispersion panel; that is the CALLER's semantics, not the field's, so the field hands back what was typed and each caller reads its own meaning into `""`. |
 *  | `positive` | `Num` | a rail with no length, a tube with no diameter: zero is not a small value of those, and there is no nearest legal bound to pull it to, so it is refused in words rather than flown. |
 *  | `wouldNotFly` — withholding at the KEYSTROKE | `Num` | typing pushes every keystroke at the flight, so a range applied only at the commit lets the solver hold a number the field itself calls impossible. Measured on the 38 mm sample: typing −5 into Rail length printed "Rail-exit velocity 0 m/s" on the pad-check surface for as long as the cursor stayed in the box. |
 *  | the `against` latch | `Num` | a refusal is about ONE entry against ONE value in the flight. Without it the amber border, `aria-invalid` and a live `role="alert"` survived a units switch and a "Reset to as-designed", still quoting the old value in the old units, and the only way to clear it was to find that exact box and type — a state a flyer walks into with no way back out. |
 *  | a `unit` prop, rendered in its own span | this one | `Num` baked the unit into the label string, so a unit switch could not reach it and a screen reader read it as part of the field's name. |
 *  | a VISIBLE `hint` | this one | `Num` rendered its hint as a `title`, which is hover-only — `DESIGN.md` §8 forbids that outright, and the stated phone use is a pad check with gloves on. All 7 of its hinted fields were guidance no touch user could ever see. |
 *
 *  The label is `text-sm`, which is §3's body default for "every label, value, control". `Num`'s was
 *  `text-[11px]`, a size §3 scopes to "axis ticks and diagram annotations only" — 28 field labels on
 *  the app's most-used surface, one step below the smallest caption size.
 */
export function NumberField({
  label,
  value,
  onChange,
  unit,
  step,
  min = 0,
  max,
  hint,
  placeholder,
  disabled,
  positive,
}: {
  label: string;
  /** Accepts either, because both call-site families already had one. Rendered through `display`. */
  value: string | number;
  /** **The typed text, not a number.** `""` is a real answer and its meaning belongs to the caller:
   *  the editor reads it as "use the design's own value" (which is what `placeholder` shows), the
   *  dispersion panel as "zero spread". A number contract cannot tell those apart from a typed 0. */
  onChange: (v: string) => void;
  /** Shown in its own span and pointed at by `aria-describedby`, never concatenated into `label` —
   *  a unit inside the accessible name is a name that changes when the units toggle does. */
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  /** Rendered VISIBLY under the field. Never a `title`: hover-only guidance does not exist on a
   *  phone, and `DESIGN.md` §8 forbids it. */
  hint?: React.ReactNode;
  /** What the design's own value is, so blank has something to mean. */
  placeholder?: string;
  /** The value this field states cannot be applied to what is being flown, so it is greyed with a
   *  hint saying why. A control that demonstrably does nothing must not sit there looking as though
   *  it does. */
  disabled?: boolean;
  /** The field describes a part that has to be THERE: a rail with length, a tube with a diameter, a
   *  fin with thickness. Zero is not a small value of any of those and the model will not fly one, so
   *  it is refused in words rather than handed over and dropped somewhere the flyer cannot see. Leave
   *  it off wherever zero is a real answer — a fin sweep of zero is a straight leading edge, and a
   *  payload at station zero sits at the top of the tube. */
  positive?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  /** What the box shows. NOT simply `value`: while the field has focus the flyer owns the text, so it
   *  can pass through states the model would reject ("1" on the way to "12", "-" on the way to "-3").
   *  The moment focus leaves it goes back to what is being flown — see the effect below. */
  const [draft, setDraft] = useState(() => display(value));
  /** The entry that was refused, kept only to say so. Cleared as soon as the flyer types again. */
  const [refused, setRefused] = useState<string | null>(null);
  /** What that message's "flying …" named when it was written. A refusal has to outlive the commit
   *  that raised it — the box has already re-synced by then — but not outlive the flight it describes.
   *  `null` is "not latched yet"; the latched value is whatever `flown` was, which is `undefined` on a
   *  field with no placeholder and nothing edited — a real state, and distinct from not-latched. */
  const against = useRef<string | undefined | null>(null);
  const unitId = useId();
  const hintId = useId();
  const msgId = useId();

  /** What the flight is actually using: the committed edit if there is one, else the design's own
   *  value, which is what the placeholder shows. Naming it is the whole point of the message — the
   *  complaint a refusal answers is not "that was rejected", it is "then what is being flown?". */
  const flown = display(value) || placeholder;

  const ranged = rangeWords(min, max, positive);

  /** What is said under the field. A bounded field with nothing else to say states its bounds, which
   *  is the information the old `title` carried and the reason to keep it — but VISIBLY. Hover-only
   *  guidance does not exist on a phone, `DESIGN.md` §8 forbids it outright, and the stated use is a
   *  pad check with gloves on. A field that already explains itself in words is not also made to
   *  recite its arithmetic; that was the old precedence too, and doubling it on all 28 design fields
   *  would be noise rather than help. */
  const guidance = hint ?? ranged;

  const describedBy =
    [
      unit ? unitId : null,
      guidance ? hintId : null,
      refused !== null ? msgId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  /** The field must never show a number that is not the one in the flight. It could: the input is
   *  controlled by `value`, and an entry the model refuses leaves `value` unchanged, so React sees the
   *  same prop, never re-renders the node, and the refused text stays on screen — typing −3 into Fin
   *  span left "-3" in the box while the design's own 19 mm went on being flown, with nothing saying
   *  so. Re-syncing whenever the field is not focused converges on the truth however the parent
   *  resolved the entry: accepted, clamped, or dropped. */
  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(display(value));
    // Latch on the render AFTER the refusal, so it records where the commit LEFT the flight rather
    // than where it found it — `commit` can call `onChange` on its way out, and React batches that
    // with `setRefused` into one render.
    if (refused === null) against.current = null;
    else if (against.current === null) against.current = flown;
    else if (against.current !== flown) setRefused(null);
  });

  /** Would this entry be refused or pulled to a bound? Then it must not reach the model even in
   *  passing. Digit-by-digit entry is untouched — "1" on the way to "12" is inside the range and lands
   *  as before. What is withheld is a COMPLETE number the field would not accept: the same rule the
   *  commit path applies, asked one step earlier. */
  const wouldNotFly = (raw: string) => {
    if (raw === "") return false;
    const n = Number(raw);
    if (!Number.isFinite(n)) return true;
    const bounded =
      min !== undefined && n < min
        ? min
        : max !== undefined && n > max
          ? max
          : n;
    return bounded !== n || (positive === true && bounded <= 0);
  };

  /** Commit the typed text. What the model is asked for is not always what was typed: a value outside
   *  the range is pulled to the nearest bound rather than refused outright, because the flyer's intent
   *  ("as thin as it goes") is legible and a bound is a real answer. */
  const commit = (raw: string) => {
    if (raw === "") {
      setRefused(null);
      onChange("");
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setRefused(raw);
      return;
    }
    const bounded =
      min !== undefined && n < min
        ? min
        : max !== undefined && n > max
          ? max
          : n;
    // Zero on a field that needs a part to be there is REFUSED, not pulled to a bound — there is no
    // nearest legal value, and the model would take it and drop it. Nothing to undo at the model:
    // `wouldNotFly` withheld this entry at the keystroke, so it never reached the flight. Blanking
    // anyway would throw away a good edit the flyer made earlier and typed over.
    if (positive && bounded === 0) {
      setRefused(raw);
      return;
    }
    setRefused(bounded !== n ? raw : null);
    if (String(bounded) !== raw) onChange(String(bounded));
  };

  return (
    // The `<label>` closes after the input's box, and the guidance and the refusal sit OUTSIDE it.
    // Everything inside a `<label>` is part of the control's accessible NAME, so while they were in
    // there one field was announced as "Field elev. (m) Height of the launch site above sea level" —
    // its description read out as its title, and a name that changed every time the message did.
    // `aria-describedby` reaches them by id from anywhere in the document, so nothing is lost by
    // moving them out, and the name goes back to being the one stable sentence a name has to be.
    <div className="block">
      <label className="block">
        <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label}
        </span>
        <div
          className={`mt-1.5 flex items-center rounded-md border bg-white transition dark:bg-zinc-900 ${
            refused !== null
              ? "border-amber-500 dark:border-amber-500"
              : "border-zinc-300 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 dark:border-zinc-700"
          }`}
        >
          <input
            ref={ref}
            type="number"
            inputMode="decimal"
            step={step}
            min={min}
            max={max}
            value={draft}
            disabled={disabled}
            placeholder={placeholder}
            aria-invalid={refused !== null || undefined}
            aria-describedby={describedBy}
            onChange={(e) => {
              const t = e.target.value;
              setDraft(t);
              setRefused(null);
              // A value this field would not accept never reaches the flight, not even in passing.
              if (wouldNotFly(t)) return;
              onChange(t);
            }}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit(e.currentTarget.value);
            }}
            className={cx(
              "w-full bg-transparent px-3 py-2 text-sm tabular-nums outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600",
              TOUCH_TARGET,
            )}
          />
          {unit && (
            <span
              id={unitId}
              className="shrink-0 px-3 text-xs text-zinc-500 dark:text-zinc-400"
            >
              {unit}
            </span>
          )}
        </div>
      </label>
      {refused !== null && (
        <span
          id={msgId}
          role="alert"
          className="mt-1 block text-xs text-amber-700 dark:text-amber-400"
        >
          {refusedMessage(refused, ranged, flown ?? "the design's own value")}
        </span>
      )}
      {guidance && (
        <span
          id={hintId}
          className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400"
        >
          {guidance}
        </span>
      )}
    </div>
  );
}
