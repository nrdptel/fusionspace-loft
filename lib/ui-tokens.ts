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
 *  pointer layouts. 44 px is the Apple HIG / WCAG 2.5.5 figure, and it is not a nicety here: the
 *  stated phone use is a pad check with gloves on. Desktop deliberately keeps its tighter spacing —
 *  the two form factors are tuned separately, not stretched from one layout.
 *
 *  **Keyed on the POINTER, not on the viewport width, and that is a correction rather than a
 *  preference.** These read `min-h-11 sm:min-h-0` until 2026-08-01: the floor was released at the
 *  `sm:` breakpoint, 640 px. `DESIGN.md` §8 says "44 px minimum hit target on `pointer: coarse`,
 *  everywhere, not just where it was first measured", and the sentence above this one has claimed
 *  "touch layouts" for as long as it has existed — but width is not touch. **Measured on a Pixel 7
 *  against the built export: 6 controls under 44 px in portrait, and 82 on the same phone rotated to
 *  landscape**, where the viewport is 863 px and every one of these minima switched itself off. A
 *  flyer who turns the phone sideways to read the diagram loses the touch contract entirely.
 *
 *  Desktop is unchanged and that is checked, not assumed: a 1280 px viewport reports `pointer: fine`,
 *  so the floor does not apply there any more than `sm:` did. */
export const TOUCH_TARGET = "pointer-coarse:min-h-11";

/** The same 44 px minimum in BOTH directions, for a control whose text is one glyph — a zoom
 *  &minus;/+ clears the height minimum and still lands at 24 px wide, which is not a target.
 *
 *  **Not only for glyphs, which is what P15 measured.** A SHORT WORD misses the width floor exactly
 *  as a glyph does, and `TOUCH_TARGET` alone says nothing about it: measured on an iPhone 13 viewport
 *  with a coarse pointer, the footer's *Docs* rendered **33x44** and *v0.9.0* **41x44** on all eight
 *  routes — 16 controls that satisfied both the token and the check while being a 33 px-wide tap
 *  target. The rule is about the SIZE OF THE TARGET, not the shape of what is in it, so a standalone
 *  control takes this and a control that fills a row takes `TOUCH_TARGET`. */
export const TOUCH_TARGET_SQUARE = "pointer-coarse:min-h-11 pointer-coarse:min-w-11";

/** Join class strings, dropping the empty ones so a caller can pass `undefined` without a stray space. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** The three button weights, and only three — plus `danger`, which is `secondary`'s geometry in the
 *  refusal colour. `DESIGN.md` §5.
 *
 *  **At most one `primary` per surface.** Two primaries on one screen means neither is. */
/** A control says it is unavailable in one of TWO ways, and hover has to be off for both.
 *
 *  `disabled` is the ordinary one. `aria-disabled` is the one used where the moment of emptying is
 *  the moment a keyboard user needs the control to stay put — undo/redo — because a `disabled`
 *  button leaves the accessibility tree and drops focus to `<body>`.
 *
 *  Gating on only one of them is not theoretical: gating on `aria-disabled` alone shipped for one
 *  commit and made the diagram's zoom −/+ light up with the full secondary treatment at the ends of
 *  their range. Measured on the built export, `disabled=true`: rest `rgba(0,0,0,0)` / zinc-300,
 *  hover `oklab(0.985 …)` / indigo-400. The hand-rolled string this replaced had carried an explicit
 *  `disabled:hover:bg-transparent` that the conversion dropped, so the guard existed and was lost.
 *
 *  Spelled out in full at every site on purpose. Tailwind scans SOURCE for literal class strings, so
 *  hoisting the `not-disabled:not-aria-disabled:` prefix into a constant and interpolating it would
 *  mean the utility never appears contiguously anywhere and no rule is generated — the class would
 *  sit in the served `class` attribute doing nothing, which is the same silent-loss failure this
 *  comment is about. The generated stylesheet is checked after every change to this block. */
const BUTTON_VARIANTS = {
  primary:
    "border border-transparent bg-indigo-600 text-white not-disabled:not-aria-disabled:hover:bg-indigo-500 dark:bg-indigo-500 dark:not-disabled:not-aria-disabled:hover:bg-indigo-400",
  secondary:
    "border border-zinc-300 text-zinc-700 not-disabled:not-aria-disabled:hover:border-indigo-400 not-disabled:not-aria-disabled:hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:not-disabled:not-aria-disabled:hover:bg-zinc-800 dark:not-disabled:not-aria-disabled:hover:text-zinc-100",
  ghost:
    "border border-transparent text-zinc-600 not-disabled:not-aria-disabled:hover:bg-zinc-100 not-disabled:not-aria-disabled:hover:text-zinc-900 dark:text-zinc-400 dark:not-disabled:not-aria-disabled:hover:bg-zinc-800 dark:not-disabled:not-aria-disabled:hover:text-zinc-100",
  danger:
    "border border-red-300 text-red-700 not-disabled:not-aria-disabled:hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:not-disabled:not-aria-disabled:hover:bg-red-500/10",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

/** The weights this app ships, as a value rather than a type — so `lib/design-doc.test.ts` can hold
 *  `DESIGN.md` §5's declaration against what is actually here. A type cannot be read at runtime, and
 *  a hand-written second list would drift from the first, which is the whole failure that check
 *  exists to stop. */
export const BUTTON_VARIANT_NAMES = Object.keys(BUTTON_VARIANTS) as ButtonVariant[];

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

/** --- the workspace spine ------------------------------------------------------------------
 *
 *  Loft's five jobs — import, build/edit, simulate, sweep, cross-check — are distinct ROUTES, and
 *  `DESIGN.md` §7 asks for one navigation spine present on every one of them, showing where the
 *  flyer is. That spine used to be a `Tabs` tablist switching hidden panels behind a fragment, which
 *  §5 forbids for exactly this case: "Tabs switch views over one subject *within* a route. Not for
 *  navigation between jobs; that is a route."
 *
 *  The TREATMENT is unchanged — the same sticky underlined bar, the same 44 px targets — because it
 *  was already right; only the semantics moved from `role="tab"` to a `<nav>` of links. These two
 *  constants exist so the bar and the tablist cannot drift apart now that two components render it:
 *  a second copy of the string is precisely how the twelve card variants happened.
 *
 *  Spelled out as whole literal class names, never assembled from parts. Tailwind v4 scans SOURCE
 *  for contiguous utilities, so a hoisted variant prefix emits no rule at all and the class ships in
 *  the attribute doing nothing. */
export const NAV_BAR =
  "sticky top-0 z-20 -mb-px flex gap-1 overflow-x-auto border-b border-zinc-200 bg-white " +
  "dark:border-zinc-800 dark:bg-zinc-950 sm:static sm:bg-transparent dark:sm:bg-transparent";

/** One item on that bar. `active` is "this is where you are", which the link marks with
 *  `aria-current="page"` and the tablist with `aria-selected` — the same fact in each pattern's own
 *  vocabulary. */
export function navItemClass(active: boolean): string {
  return cx(
    "inline-flex shrink-0 items-center whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium outline-none transition",
    "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400",
    TOUCH_TARGET,
    active
      ? "border-indigo-500 text-zinc-900 dark:border-indigo-400 dark:text-zinc-100"
      : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
  );
}
