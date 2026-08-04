"use client";

import { useEffect, useId, useRef, useState } from "react";

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
  /** The one thing this surface is pointing at — a design being offered back, a what-if against its design. */
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
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
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

/** A titled region within a route — `DESIGN.md` §5. What a route is built from. */
export function Section({
  title,
  description,
  actions,
  className,
  children,
  ...rest
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx("mt-8 first:mt-0", className)} {...rest}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium text-zinc-900 dark:text-zinc-100">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  square = false,
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
  /** Declared explicitly because `ButtonHTMLAttributes` does not carry it. React 19 passes `ref`
   *  to a function component as an ordinary prop, so no forwarding wrapper is needed — but the type
   *  has to say so, and three of the panels hand their Run button a ref to return focus to. */
  ref?: React.Ref<HTMLButtonElement>;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, square, className })}
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

/** A small labelled value, used for the result read-outs (volume, pressure, …). */
export function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        {label}
      </div>
      {/* `text-sm`, not `text-xs`. §3 is explicit that caption size is for the text AROUND a value —
          "its unit, its provenance, its caveat — never the value" — and this is the value.
          Surfaced by the inversion check in `lib/design-system.test.ts` when a legitimate caveat
          caption tipped this file's ratio; correcting the real violation was the honest way past it
          rather than another point of budget. Worth being plain that it changes no rendered pixel:
          `Chip` has zero call sites, which the same file records as `Chip: 0`. It is the spec being
          made true before P6 decides whether this primitive gains adopters or is deleted. */}
      <div className="font-mono text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
        {value}
      </div>
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
