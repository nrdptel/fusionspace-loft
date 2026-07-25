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
