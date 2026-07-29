"use client";

import { useEffect, useId, useRef, useState } from "react";

import { TOUCH_TARGET } from "@/lib/ui-tokens";
import { rangeWords, refusedMessage } from "@/lib/what-if";

export interface Option<T extends string> {
  value: T;
  label: string;
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
      className="inline-flex rounded-lg border border-zinc-300 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-900"
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

/** The way back out of a heavy analysis panel.
 *
 *  The dispersion run and the two sweeps each open on a Run button and, until this existed, offered
 *  nothing that closed them again: once opened they stayed open for the rest of the session. That
 *  cost twice. On a 390 px phone the open dispersion panel measured 2,195 px against 308 px closed —
 *  two and a half screens a flyer scrolls past on every visit to Analyze. And an open panel re-flies whenever the
 *  design changes, so an ordinary nose-ballast edit re-ran hundreds of flights: 2.5 s of blocked
 *  work per edit, per open panel, for a result nobody was reading.
 *
 *  Closing discards the result rather than keeping it. A kept result would be a number computed for
 *  a design the flyer can go on to change, sitting behind a collapsed panel with nothing on screen
 *  saying so — and the panels exist to avoid exactly that. The Run button coming back is what says
 *  it: the panel is offering the run again, not hiding an answer. */
export function ClosePanel({ onClose, what }: { onClose: () => void; what: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={`Close ${what}`}
      className={
        "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition " +
        "hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
        "focus-visible:outline-indigo-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 " +
        TOUCH_TARGET
      }
    >
      Close
    </button>
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
        className={`mt-1.5 flex items-center rounded-lg border bg-white transition dark:bg-zinc-900 ${
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
