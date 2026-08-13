import Link from "next/link";
import { KOFI_URL } from "@/lib/links";
import FusionSpaceBadge from "./FusionSpaceBadge";
import ThemeToggle from "./ThemeToggle";
import { buttonClass, TOUCH_TARGET_SQUARE } from "@/lib/ui-tokens";

/** Page header: the Fusion Space eyebrow over the product name on the left, a Ko-fi tip link,
 *  a Docs link and the theme toggle on the right. Mirrors the sibling tools' header.
 *
 *  `compact` marks a page that titles itself (the docs section): there the product name is a link
 *  home, and that page's own <h1> is its title. On the app itself nothing else names the page, so
 *  the product name IS the heading — a document whose outline starts at <h2> has no top. */
export default function SiteHeader({ compact = false }: { compact?: boolean }) {
  // **This string stays a plain literal, and that is not style.** Tailwind v4 extracts candidates
  // from raw source text, so a class sitting immediately before a `${` interpolation boundary is not
  // extracted. Writing this inline as `…md:text-3xl${compact ? … : ""}` shipped `md:text-3xl` in the
  // served `class` attribute with **no rule behind it** — this file is the only use of that utility
  // in the tree, so the rule was never generated and the desktop wordmark silently dropped from 30 px
  // to 20 px on every route. The gate did not see it: `npm run build` succeeds, every test passes,
  // and the class is present in the HTML. Caught by reading the stylesheet back
  // (`grep 'md\:text-3xl' out/_next/static/chunks/*.css` → 0 while `md\:px-6` → 1). Keep the
  // interpolation out of the literal.
  const WORDMARK = "text-xl font-semibold tracking-tight text-zinc-900 hover:opacity-80 dark:text-zinc-100 md:text-3xl";
  const name = (
    // The wordmark measured **37x28** on an iPhone 13 with a coarse pointer, on every route, and
    // `e2e/touch.spec.ts` did not report it, because the header assertion excluded it by matching its
    // own label text. P15's increment 2 is that pair: a control under target, and the filter that hid
    // it.
    //
    // **It takes the target in the docs section and is a KNOWN, FILED GAP on the app.** The split is
    // not a design preference; it is where a measurement stopped it.
    //
    //  - **`compact` (docs): it takes the target.** It is the only route back to the app in the
    //    shared header, on all six docs routes, and those routes carry no workspace spine — so the
    //    16 px it costs is not metered by anything.
    //  - **Not compact (the app): it stays 37x28, against `DESIGN.md` §8, because the depth ratchet
    //    refuses the fix.** Applying the same token there put the workspace spine at **1071 px**
    //    against `e2e/depth.spec.ts`'s **1060 px** phone cap, on all four workspace routes. The
    //    headroom is **5 px** (baseline 1055) — not the 49 px a stale comment further down this file
    //    still implies. Widening a ratchet to admit a regression is what a ratchet exists to prevent,
    //    so the floor is not met here and that is recorded as a gap in `BACKLOG.md` and `ROADMAP.md`
    //    rather than dressed up as an exemption.
    //
    // **Two justifications were tried for calling the app side exempt rather than blocked, and both
    // were refuted — they are written down so they are not re-derived.** (1) *WCAG 2.5.8's
    // "Equivalent" exception, on the grounds that ← Import another reaches the same place.* It does
    // not: `LoftApp.tsx`'s router effect bounces `/` straight back to the last workspace whenever a
    // design is open, and `← Import another` is `reset()`, which clears the doc, the edits, the undo
    // history and the session. That is a destructive act, not this link's function, and *Equivalent*
    // requires the same function. (2) *That 2.5.8 is the governing criterion at all.* It is not —
    // 2.5.8 is the 24x24 AA floor, which 37x28 already clears; the 44 px figure this repo works to is
    // **2.5.5 (AAA)**, as `lib/ui-tokens.ts` states.
    //
    // `inline-flex items-center` is load-bearing where it applies: `min-h`/`min-w` do nothing to an
    // inline box, so the token alone would have reported 37x28 while looking applied.
    <Link href="/" className={compact ? `${WORDMARK} inline-flex items-center justify-center ${TOUCH_TARGET_SQUARE}` : WORDMARK}>
      Loft
    </Link>
  );
  return (
    // The control row never shrinks; the title block does. Putting the header's controls on the type
    // scale took that row from 197 px to 229 px, which fits a 390 px phone and overflowed a 360 px one
    // (Galaxy S8/S9 class) by 10 px — a real width the touch suite does not cover, so nothing in the
    // gate saw it. `flex-wrap` on the header fixed the overflow and cost 71 px of vertical space on
    // EVERY phone, because a wrapped flex item will not shrink below its content: the title dropped
    // the controls to a second row at 390 and 412 px too, where they had always fitted. So the give is
    // where it was before — `min-w-0` lets "flight simulator" wrap under the wordmark on the narrowest
    // phones, and `shrink-0` holds all three 44 px targets at full size at every width.
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <FusionSpaceBadge className="mb-1" />
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          {compact ? name : <h1 className="contents">{name}</h1>}
          {!compact && (
            <span className="text-sm text-zinc-500 dark:text-zinc-400">flight simulator</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <a
          href={KOFI_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Tip the project — buy me a coffee on Ko-fi"
          className={buttonClass()}
        >
          {/* The suite's tip mark — a coffee cup, not the `♥` this carried. Both siblings already
              draw this exact path: `motor.fusionspace.co` renders it in its header, and Debrief's
              `components/KofiButton.tsx` carries it byte-for-byte. Loft was the only one of the
              three with a different glyph, which is what `ON-B1` is about.

              `h-4 w-4` where both siblings have `h-3.5 w-3.5`: the glyph is sized to the label
              beside it, and Loft's label is `text-sm` where theirs are `text-xs`. */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="h-4 w-4"
          >
            <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
            <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
            <line x1="6" x2="6" y1="1" y2="4" />
            <line x1="10" x2="10" y1="1" y2="4" />
            <line x1="14" x2="14" y1="1" y2="4" />
          </svg>
          {/* The destination rides the ACCESSIBLE NAME, and ONLY that. The wording is the siblings' —
              it says where the link goes and what it buys, where Loft's said only where — but the
              mechanism is not: both siblings carry it on a `title`, and Loft may not.

              **That was tried in this same increment and the touch suite refused it.**
              `e2e/touch.spec.ts`'s *"counts the states a flyer at the pad cannot reach"* counts any
              `title` whose text is not already on screen beside it, and holds the total at
              `HOVER_ONLY_FLOOR = 0`. Adding this one took it to 1 — correctly: the visible label is
              "Tip", the tooltip is a sentence, and a phone gets no tooltip at all. An `aria-label`
              reaches assistive tech on every form factor; a `title` reaches a mouse and nothing else.
              `DESIGN.md` §10 records this as the one part of the control that deliberately does not
              converge.

              Writing "Tip on Ko-fi" VISIBLY instead was measured and rejected too: it cost 63 px,
              wrapped the header on a 390 px phone and took the shared chrome from 1011 px to 1074,
              past the 1060 px cap every route's depth is built on. Recorded in `ROADMAP.md` under
              decisions taken without the owner.

              **The 1011 px in the line above is that day's measurement and is no longer the
              headroom.** Re-measured 2026-08-13 against the built export: the spine sits at
              **1055 px**, so the cap leaves **5 px**, not 49. Nothing here is wrong — the chrome grew
              between the two dates — but a later session read "1011" as current headroom, spent 16 px
              of it on the wordmark, and only the depth ratchet caught it at 1071. Quote the ratchet,
              not this line. */}
          Tip
        </a>
        <Link
          href="/docs"
          className={buttonClass()}
        >
          Docs
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
