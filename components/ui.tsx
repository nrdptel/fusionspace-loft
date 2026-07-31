"use client";

import { useEffect, useId, useRef, useState } from "react";

import { TOUCH_TARGET, buttonClass, cx, type ButtonSize, type ButtonVariant } from "@/lib/ui-tokens";
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
  accent: "border-indigo-500/30 bg-indigo-500/5 dark:border-indigo-500/40 dark:bg-indigo-500/10",
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
   *  cards rendered on the Design tab and 1 of the 2 on Analyze have a card ancestor. Dropping the
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
 *  through, so adopting the primitive never costs a call site an attribute it already had. */
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
  as?: "div" | "section" | "aside" | "details";
  tone?: CardTone;
  /** `p-4` — the card padding from `DESIGN.md` §4. Off only where the card's own content owns its
   *  edges: a disclosure whose summary row has its own gutter, a table that bleeds to the border. */
  pad?: boolean;
  title?: React.ReactNode;
  /** Controls that belong to the title row rather than to the body. */
  actions?: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cx("rounded-xl border", CARD_TONES[tone], pad && "p-4", className)} {...rest}>
      {(title || actions) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          {title && <h3 className="text-base font-medium text-zinc-900 dark:text-zinc-100">{title}</h3>}
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
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
          <h2 className="text-xl font-medium text-zinc-900 dark:text-zinc-100">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Declared explicitly because `ButtonHTMLAttributes` does not carry it. React 19 passes `ref`
   *  to a function component as an ordinary prop, so no forwarding wrapper is needed — but the type
   *  has to say so, and three of the panels hand their Run button a ref to return focus to. */
  ref?: React.Ref<HTMLButtonElement>;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={buttonClass({ variant, size, className })} {...rest}>
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
              "inline-flex items-center justify-center rounded-md font-medium transition " +
              TOUCH_TARGET +
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
    const btns = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
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
      className={
        "sticky top-0 z-20 -mb-px flex gap-1 overflow-x-auto border-b border-zinc-200 bg-white " +
        "dark:border-zinc-800 dark:bg-zinc-950 sm:static sm:bg-transparent dark:sm:bg-transparent"
      }
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
            className={
              "inline-flex shrink-0 items-center whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 " +
              TOUCH_TARGET +
              " " +
              (active
                ? "border-indigo-500 text-zinc-900 dark:border-indigo-400 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200")
            }
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
      <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        {label}
      </div>
      <div className="font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
        {value}
      </div>
    </div>
  );
}

/** Hand focus to the control that REPLACES the one that just vanished.
 *
 *  Closing a panel unmounts the Close button while it is the focused element, and a removed element
 *  takes focus with it: the browser falls back to `<body>`, so a keyboard or screen-reader user who
 *  closed a panel near the bottom of Analyze was thrown back to the top of the document with no way
 *  to tell what had happened. The Run button that takes its place does not exist until the state
 *  change has rendered, so the focus is asked for and then applied on the render that produces it.
 *
 *  Wire it as: `ref` on the Run button, `returnFocus()` in the Close handler. */
export function useReturnFocus(): [React.RefObject<HTMLButtonElement | null>, () => void] {
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
 *  — two and a half screens a flyer scrolls past on every visit to Analyze. And an open panel
 *  re-flies whenever the design changes, so an ordinary nose-ballast edit re-ran hundreds of
 *  flights: 2.5 s of blocked work per edit, per open panel, for a result nobody was reading.
 *
 *  Closing discards the result rather than keeping it. A kept result would be a number computed for
 *  a design the flyer can go on to change, sitting behind a collapsed panel with nothing on screen
 *  saying so — and the panels exist to avoid exactly that. The Run button coming back is what says
 *  it: the panel is offering the run again, not hiding an answer. */
export function ClosePanel({ onClose, what }: { onClose: () => void; what: string }) {
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
  children,
}: {
  summary: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/50"
    >
      <summary className="cursor-pointer select-none font-medium text-zinc-700 dark:text-zinc-300">
        {summary}
      </summary>
      <div className="mt-3 space-y-4 text-zinc-600 dark:text-zinc-400">{children}</div>
    </details>
  );
}

function display(value: number): string {
  return value === 0 ? "" : String(value);
}

/** Numeric input with a label and a unit suffix. Keeps an internal text buffer so
 *  partial entries like "0." survive a render, and re-syncs when the value changes
 *  externally (a unit switch, or loading state from the URL).
 *
 *  It also refuses an out-of-range entry out loud, the same way the design editor's what-if fields
 *  do. `min` used to be declared on the input and enforced nowhere: the seven dispersion inputs
 *  read a ±1σ spread, every one of them is floored at zero by `MonteCarlo.tsx`, and typing a
 *  NEGATIVE one left the minus sign sitting in the box while the study flew zero. Measured on the
 *  38 mm sample: "Wind speed ±1σ" typed as -5 gave a 95% recovery radius of 366 m — the same as
 *  leaving it blank — where the ±5 the flyer asked for gives 1,259 m and the default ±2 gives
 *  671 m. A mistyped sign quietly shrank the recovery area to plan for by 3.4x, on the surface
 *  whose entire job is to say how wide that area might be. */
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
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  hint?: React.ReactNode;
  placeholder?: string;
  /** The spread this field states cannot be applied to what is being flown, so it is greyed with a
   *  hint saying why — the same shape the Conditions panel uses when today's weather takes over a
   *  field. A control that demonstrably does nothing must not sit there looking as though it does. */
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => display(value));
  /** The refused entry and the value flown in its place, kept only to say so. Both are needed: the
   *  complaint a refusal answers is not "that was rejected", it is "then what is being flown?".
   *  Cleared as soon as the flyer types again. */
  const [refused, setRefused] = useState<{ entry: string; flown: number } | null>(null);
  const last = useRef(value);
  const unitId = useId();
  const hintId = useId();
  const msgId = useId();
  // Point the input at its unit suffix, its hint, and any refusal, so a screen reader reads the
  // load-bearing guidance ("1.5 = +50%", "doesn't change the estimate") that sighted users
  // see under the field — not just the unit.
  const describedBy =
    [unit ? unitId : null, hint ? hintId : null, refused !== null ? msgId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(display(value));
    }
  }, [value]);

  const ranged = rangeWords(min, max);
  /** Apply the range to the typed text. Out of range is pulled to the nearest bound rather than
   *  dropped, because "as much as it takes" is a legible intent and a bound is a real answer.
   *
   *  Unlike the design editor's field, this one needs no re-sync effect to catch a parent that
   *  quietly resolved the entry some other way: the bound is applied HERE, so the box, the parent's
   *  state and the message are all written from one value in one place. */
  const commit = (raw: string) => {
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) {
      // Blank is a real answer here — zero spread — and reads back as blank, so nothing is hidden.
      // (A partial entry like "-" is reported as "" by a number input, so it lands here too.)
      setRefused(null);
      return;
    }
    const bounded = min !== undefined && n < min ? min : max !== undefined && n > max ? max : n;
    if (bounded === n) {
      setRefused(null);
      return;
    }
    setRefused({ entry: raw, flown: bounded });
    last.current = bounded;
    setText(display(bounded));
    onChange(bounded);
  };

  return (
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
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={refused !== null || undefined}
          aria-describedby={describedBy}
          // Typing is left alone so a value can be entered digit by digit; the range is applied
          // when the field is committed — blurred, or Enter pressed.
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            setRefused(null);
            const n = Number.parseFloat(t);
            const v = Number.isFinite(n) ? n : 0;
            last.current = v;
            onChange(v);
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(e.currentTarget.value);
          }}
          className="w-full bg-transparent px-3 py-2 text-sm tabular-nums outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
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
      {refused !== null && (
        <span id={msgId} role="alert" className="mt-1 block text-xs text-amber-700 dark:text-amber-400">
          {refusedMessage(refused.entry, ranged, String(refused.flown))}
        </span>
      )}
      {hint && (
        <span id={hintId} className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
          {hint}
        </span>
      )}
    </label>
  );
}
