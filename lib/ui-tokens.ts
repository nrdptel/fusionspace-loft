/** Shared style tokens — plain constants, deliberately in a module with NO `"use client"`.
 *
 *  A token exported from a client module cannot be read by a server component: Next replaces the
 *  export with a client reference, and interpolating that into a `className` serialises the
 *  reference's throwing stub straight into the served HTML. That is exactly what happened when
 *  `TOUCH_TARGET` lived in `components/ui.tsx` — the server-rendered site header shipped a class
 *  attribute containing `function(){throw Error("Attempted to call TOUCH_TARGET() from the
 *  server…")}` and silently lost the utility it was supposed to add. Tokens live here so both
 *  sides can import them.
 */

/** A 44 px minimum hit target on touch layouts, released back to the design's own density on
 *  pointer layouts (`sm:` and up). 44 px is the Apple HIG / WCAG 2.5.5 figure, and it is not a
 *  nicety here: the stated phone use is a pad check with gloves on. Desktop deliberately keeps its
 *  tighter spacing — the two form factors are tuned separately, not stretched from one layout. */
export const TOUCH_TARGET = "min-h-11 sm:min-h-0";

/** The same 44 px minimum in BOTH directions, for a control whose text is one glyph — a zoom
 *  &minus;/+ clears the height minimum and still lands at 24 px wide, which is not a target. */
export const TOUCH_TARGET_SQUARE = "min-h-11 min-w-11 sm:min-h-0 sm:min-w-0";

/** Join class strings, dropping the empty ones so a caller can pass `undefined` without a stray space. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** The three button weights, and only three — plus `danger`, which is `secondary`'s geometry in the
 *  refusal colour. `DESIGN.md` §5.
 *
 *  **At most one `primary` per surface.** Two primaries on one screen means neither is. */
const BUTTON_VARIANTS = {
  primary:
    "border border-transparent bg-indigo-600 text-white not-aria-disabled:hover:bg-indigo-500 dark:bg-indigo-500 dark:not-aria-disabled:hover:bg-indigo-400",
  secondary:
    "border border-zinc-300 text-zinc-700 not-aria-disabled:hover:border-indigo-400 not-aria-disabled:hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:not-aria-disabled:hover:bg-zinc-800 dark:not-aria-disabled:hover:text-zinc-100",
  ghost:
    "border border-transparent text-zinc-600 not-aria-disabled:hover:bg-zinc-100 not-aria-disabled:hover:text-zinc-900 dark:text-zinc-400 dark:not-aria-disabled:hover:bg-zinc-800 dark:not-aria-disabled:hover:text-zinc-100",
  danger:
    "border border-red-300 text-red-700 not-aria-disabled:hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:not-aria-disabled:hover:bg-red-500/10",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

/** The spacing inside a control, from `DESIGN.md` §4 — `px-3 py-1.5`, and `px-2 py-1` at caption size. */
const BUTTON_SIZES = {
  sm: "px-2 py-1 text-xs",
  md: "px-3 py-1.5 text-sm",
} as const;

export type ButtonSize = keyof typeof BUTTON_SIZES;

/** The button geometry as a class string.
 *
 *  It lives HERE, beside the touch tokens, for the reason at the top of this file: the site header is
 *  a SERVER component, and a helper exported from `components/ui.tsx` — which is `"use client"` —
 *  cannot be called from one. Next replaces the export with a client reference and the build fails
 *  outright ("Attempted to call buttonClass() from the server"), which is the same trap that once put
 *  a throwing stub into a served `class` attribute. `components/ui.tsx`'s `Button` is built from this,
 *  so the component and the class string can never disagree.
 *
 *  Two things need the string rather than the component, and both are navigation: a `next/link` and an
 *  external `<a>`. An anchor is the correct element for those — a `<button>` that navigates is a
 *  keyboard and screen-reader defect — so they take the geometry and keep their own tag. Before this
 *  existed the header carried three verbatim copies of it, which is the same mechanism that produced
 *  the twelve card treatments `DESIGN.md` was written to unwind. */
export function buttonClass({
  variant = "secondary",
  size = "md",
  square = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** The 44 px minimum in BOTH directions, for a control whose label is one glyph. A zoom −/+, an
   *  undo ↶, a shelf's × all clear the height minimum and land around 24–32 px wide, which is not a
   *  target. Every such control in the app hand-rolled `TOUCH_TARGET_SQUARE` onto its own class
   *  string because the primitive had no way to ask for it — which is the same mechanism that
   *  produced the twelve card treatments. */
  square?: boolean;
  className?: string;
} = {}): string {
  return cx(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
    "disabled:cursor-not-allowed disabled:opacity-50",
    // `aria-disabled` is the OTHER way a control says it is unavailable, and it is the right one where
    // the moment of emptying is the moment a keyboard user is stepping back through a mistake: a
    // `disabled` button leaves the accessibility tree and drops focus to `<body>`, so undo/redo
    // announce as unavailable and stay reachable by Tab instead. That treatment was worked out once,
    // in `LoftApp`'s header, and lived in a local class string where no other surface could reuse it.
    "aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    square ? TOUCH_TARGET_SQUARE : TOUCH_TARGET,
    className,
  );
}
