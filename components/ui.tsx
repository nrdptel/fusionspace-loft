"use client";

import { useEffect, useId, useRef, useState } from "react";

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
              "rounded-md font-medium transition " +
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
      className="-mb-px flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800"
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
              "shrink-0 whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 " +
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
 *  externally (a unit switch, or loading state from the URL). */
export function NumberField({
  label,
  value,
  onChange,
  unit,
  step,
  min = 0,
  hint,
  placeholder,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  hint?: React.ReactNode;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => display(value));
  const last = useRef(value);
  const unitId = useId();
  const hintId = useId();
  // Point the input at both its unit suffix and its hint, so a screen reader reads the
  // load-bearing guidance ("1.5 = +50%", "doesn't change the estimate") that sighted users
  // see under the field — not just the unit.
  const describedBy =
    [unit ? unitId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(display(value));
    }
  }, [value]);

  return (
    <label className="block">
      <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </span>
      <div className="mt-1.5 flex items-center rounded-lg border border-zinc-300 bg-white transition focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          value={text}
          placeholder={placeholder}
          aria-describedby={describedBy}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            const n = Number.parseFloat(t);
            const v = Number.isFinite(n) ? n : 0;
            last.current = v;
            onChange(v);
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
      {hint && (
        <span id={hintId} className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
          {hint}
        </span>
      )}
    </label>
  );
}
