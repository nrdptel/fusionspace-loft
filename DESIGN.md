# Fusion Space — Design System

**This file is the authority on how the suite looks and behaves.** Where the code disagrees with it,
the code is wrong and fixing it is in scope. Where this file is genuinely wrong, change it here first
and say why — never fork a second convention in a component.

It exists because the alternative failed measurably. With no written system, every session re-derived
"consistent" by reading whichever neighbouring file it happened to open, and the result drifted apart
one component at a time. Measured on 2026-07-30, before this file existed:

- **12+ distinct card treatments** across the suite for what is visually one thing — `rounded-md` /
  `rounded-lg` / `rounded-xl`, `border-zinc-200` / `border-zinc-300`, `bg-white` / `bg-zinc-50`, and
  six padding combinations.
- **The two sibling apps disagreed on base body size.** Loft: 98 `text-sm` to 88 `text-xs`. Debrief:
  212 `text-xs` to 82 `text-sm`. The ECOSYSTEM CONSISTENCY invariant requires they read as one
  author's work; they did not.
- **Debrief had 50 components and no shared primitive layer at all** — zero cross-component imports.
  Every card, chip and button was hand-rolled per file.
- **Loft had a shared `components/ui.tsx` that 5 of 23 components used**, with `Chip` and `Disclosure`
  exported and imported nowhere.

That is precisely the first tell on `MAINTAINING.md`'s own list — "a component that exists once and
matches nothing else; inconsistent spacing, type scale, or button hierarchy across surfaces" — and it
is the mechanism behind an app reading as assembled rather than designed. A checklist cannot fix it,
because a checklist has nothing to check against. This file is the thing to check against.

**Both repos carry an identical copy of this file.** A change to one is a change to both, in the same
run. The suite is one product to a flyer who uses both.

---

## 1. The rule that makes the rest work

**Never write a raw treatment where a primitive exists.** If you find yourself typing
`rounded-xl border border-zinc-200 bg-white p-4`, you want `<Card>`. If the primitive does not exist
yet, create it in `components/ui.tsx` and use it — do not hand-roll "just this once", because every
one of the 12 card treatments above was a just-this-once.

**A new visual treatment is a change to this file.** Inventing a fifth button weight or a third
surface level in a component is how the system erodes. Add it here with its role, or use what exists.

---

## 2. Tokens

Tailwind v4 with the `zinc` neutral ramp and `indigo` as the single accent. No other neutral, no
second accent. Semantic colours are reserved for meaning and never for decoration.

### Surfaces — three levels, no more

| Role | Light | Dark | Use for |
|---|---|---|---|
| `page` | `bg-white` | `dark:bg-zinc-950` | the document background |
| `raised` | `bg-white` | `dark:bg-zinc-900` | cards, panels, dialogs — the default container |
| `sunken` | `bg-zinc-50` | `dark:bg-zinc-900/50` | insets, table headers, code and readout blocks |

A raised surface on a page needs a border to separate it. A sunken surface inside a raised one does
not — the tone change is the separation. Never nest raised inside raised; promote the inner one to
sunken or drop the outer border.

### Elevation — one surface value, and one sanctioned control affordance

| Role | Value | Use for |
|---|---|---|
| `floating` | `shadow-lg` | a SURFACE that leaves the document flow and covers content — a toast, and any dialog anchored over the page |
| `thumb` | `shadow-sm` | the selected option's lift inside `Segmented`, and nothing else |

**`floating` is a claim about behaviour, not a style.** It says the surface is not part of the page
underneath it — which the flyer needs to know, because what is behind it is still there and still
theirs. It follows that a floating surface must not swallow clicks outside its own box: a full-width
positioning wrapper takes `pointer-events-none` and gives the card back `pointer-events-auto`.

**Nothing that sits IN the flow takes `floating`.** A card does not float, and a card with a shadow is
a card pretending to be a dialog.

**`thumb` is the one in-flow shadow, and it is sanctioned by name rather than waved through.** It is
not a surface level: it is the affordance that says which option of a `Segmented` is chosen, at the
scale of a control rather than of a container. Enumerating it here is what lets §9 subtract exactly
it — the enumerate-and-subtract pattern the radius and border greps already use, and the one that
stops a check going stale the moment somebody adds a third value.

**Both were being invented at call sites, and the first draft of this section was wrong about that.**
Added 2026-08-17 with `Toast`. Before it, this file mentioned no shadow token at all — the only
occurrence of the word was §9's prohibition on a `shadow` prop on `Card`. That draft said
`components/ServiceWorker.tsx`'s `shadow-lg` was the only undeclared elevation in the tree. **It was
not**: `Segmented`'s thumb has carried `shadow-sm` throughout, in the same file the draft was written
in, and the pre-push review found it. A section that declares "one value" while two ship is worse
than no section, because the next reader trusts it. Two undeclared values, both now named.

§9's greps could not see either: they enumerate radius, border-colour, spacing and type, and an
elevation nobody declared is not off-scale to any of them. That is the same "wrong text" blindness §9
records about the radius grep, one property over — and it is why this section ships with its own grep
and its own ratchet rather than on discipline.

**The next adopter is already in the tree and has no elevation.** `Popover` renders
`max-sm:fixed max-sm:left-4 max-sm:right-4 max-sm:top-auto max-sm:bottom-4` at `z-30`, so on a phone
it is a dialog covering the page separated from it by a hairline. **The table's `floating` row names
what the token is FOR, not what already carries it** — `Toast` is its only adopter today. Converting
`Popover` is deliberately not done in the same pass as the extraction, so that pass stays an
extraction rather than a repaint.

### Borders

| Role | Value | Use for |
|---|---|---|
| `hairline` | `border-zinc-200 dark:border-zinc-800` | container edges, dividers, table rules |
| `control` | `border-zinc-300 dark:border-zinc-700` | inputs, selects, secondary buttons — anything the flyer acts on |

Two, deliberately. The control border is one step darker so an interactive edge is distinguishable
from a decorative one without reading the element. Do not mix them: a card is `hairline`, an input
inside it is `control`.

**One container border WIDTH — 1 px — whatever the container is for, a drop target included.** This
is about WIDTH, not colour: which of the two colours above a container takes is the rule already
stated ("a card is `hairline`, an input inside it is `control`"), and a drop zone is something the
flyer acts on, so it takes `control` at 1 px. A SIDE rule is not a container edge and is not governed
here — `border-b-2` under the active item of the navigation spine is an underline, the same
distinction the border-colour grep above already draws.

Added 2026-08-18, because this table declared two colours and no width at all, and a second full-width
edge had been shipping at exactly one call site: the import drop zone wrote a 2 px dashed border over
`Card`'s own. **That override only ever worked by
SOURCE ORDER** — measured on the built stylesheet of 2026-08-18, the 1 px rule at byte 16,788 and the
2 px rule at 16,910, same specificity, so the second one wins and would stop winning the day Tailwind
reordered its output. *Those offsets are a measurement of one build and nothing pins them; the
load-bearing fact is the ORDER, and the reason it needs no ratchet is that nothing depends on it any
more — the dependency was deleted rather than pinned.*
The alternatives were both worse than dropping it: a `border` prop on `Card` is the generic escape
hatch §9 refuses one property over, and a width that exists once and matches nothing else is the tell
§5's whole vocabulary exists to remove. **What distinguishes a drop target is its dashed edge, its
sunken fill and the sentence in it** — and, while a file is over it, a border that goes from dashed to
solid and from `control` to `accent`, which is a bigger change than a pixel of width ever was.

A border WIDTH other than the hairline is therefore drift, and §9 has its own count for it —
`containerBorderWidths`, target 0. **It needed one; the first draft of this paragraph claimed the
card-treatment counts already covered it and that was false.** Those two both require `rounded-xl` and
a border token in the SAME string literal, and the hazard named above — a `Card` handed a width
through `className` — writes only the width at the call site, because a `Card` caller never spells the
radius. The rule was declared here with nothing able to contradict it, which is the exact shape §9
records about the elevation table one section up. A spinner ring is not a container and is subtracted
by the literal it lives in (`rounded-full`); `border-0` is a reset, not a width.

### Text

| Role | Value | Use for |
|---|---|---|
| `primary` | `text-zinc-900 dark:text-zinc-100` | values, headings, anything being read |
| `secondary` | `text-zinc-600 dark:text-zinc-400` | labels, units, captions, help |
| `tertiary` | `text-zinc-500 dark:text-zinc-500` | disabled, placeholder, timestamps |

### Accent and meaning

| Role | Value | Means |
|---|---|---|
| `accent` | `indigo-500` (focus, `600` fill) | interactive, selected, the focus ring, and a drop target with a file over it |
| `warn` | `amber-600` / `amber-50` bg | an estimate outside its envelope, an extrapolation, a caveat |
| `danger` | `red-600` / `red-50` bg | a refusal, a value that cannot be computed, destructive |
| `good` | `emerald-600` | agreement between independent sources, a passing check |

**Never colour a number by whether it is large.** Colour carries a claim; a claim needs a basis. Green
on a number a flyer would act on reads as endorsement, and the SAFETY invariant forbids a verdict.

**These meanings are about VALUES AND STATES, and NO chrome takes a semantic ramp — not one control,
not the Tip jar, not as an exception.** The rule is checked rather than intended
(`lib/design-system.test.ts`, *"lets no chrome wear a semantic ramp"*), because it has already been
broken once in this family and reverted for a reason worth keeping: Debrief's Ko-fi link used to be
amber *"so it reads as a tip jar, distinct from the neutral theme control"*, and
`components/KofiButton.tsx` there now records why that was wrong — every other amber in either tree is
a real caveat, so **a flyer learns amber means "this number is qualified", and spending it on a tip
jar in the persistent header devalues the one signal the safety posture leans on.** What distinguishes
the control is its GLYPH, and a glyph costs the colour system nothing.

### Radius

`rounded-md` for controls (buttons, inputs, chips). `rounded-xl` for containers (cards, panels,
dialogs). `rounded-full` only for pills and spinners. **`rounded-lg` is not in the system** — it is
the middle value that caused most of the measured drift; convert on sight.

**Three, and no exceptions — which took one round to get right.** Written 2026-08-09, after the check
that could see this was built. The rule above named a single literal, the middle radius, so it was
blind to every other off-system value: the tree held **seven** — four small, one arbitrary `[2px]`,
two bare — and five of the seven were one treatment, a legend swatch hand-rolled across four files at
two different radii. `Swatch` is what it became.

*The first version of this paragraph sanctioned the small radius inside that primitive, with an
owner-exemption check to hold it there. It was unnecessary, and the reason is arithmetic rather than
taste: CSS scales a corner radius to what its edge can hold, so on a 12x8 px chip every radius at or
above 4 px renders as exactly 4 px. `rounded-md` is pixel-identical there. The binding document had
gained a permanent carve-out for zero pixels, on a stated reason that was false — caught by the
pre-push review, which measured it rather than reading it.*

---

## 3. Type scale

Six sizes, each with one job. Geist Sans throughout; Geist Mono for numerals that are compared.

| Size | Role |
|---|---|
| `text-3xl` | page title, once per route |
| `text-xl` | section heading |
| `text-base` | subsection heading, and prose in docs |
| `text-sm` | **the body default — every label, value, control and table cell** |
| `text-xs` | captions, units, footnotes, dense table metadata |
| `text-[11px]` | axis ticks and diagram annotations only |

**Six means six**, and the sizes that break it are the ones that read as "a bit bigger" rather than as
a decision — `text-lg` between `text-base` and `text-xl`, `text-2xl` between `text-xl` and `text-3xl`.
Measured 2026-07-31: Loft had reached **fourteen** `text-lg` (eleven panel headings and three prominent
values), and Debrief **twenty** across `text-lg`, `text-2xl` and `text-4xl`, five of them page titles
where this table says `text-3xl`. That is a heading rhythm that is not a rhythm. Both apps count and
ratchet it toward zero; neither may let it grow.

**An analyzer's big readout is `text-xl`, not a seventh size.** The number a metric tile exists to show
wants weight, and `font-semibold` plus `font-mono` at `text-xl` gives it that against `text-base`
siblings. Reaching for `text-2xl` because it looks better in isolation is how the scale acquired its
seventh entry in the first place.

**`text-sm` is the floor for anything a flyer reads to make a decision.** `text-xs` is for the text
*around* such a value — its unit, its provenance, its caveat — never the value. Debrief's 212-to-82
inversion is the bug this rule fixes: a whole app of decision-grade numbers rendered at caption size.

**Weight:** `font-medium` for labels and headings, `font-normal` for values and prose,
`font-semibold` for the one number a surface exists to show. No `font-bold`.

**Numerals:** any number a flyer compares against another number — a table column, a cross-check row,
a readout — is `font-mono tabular-nums`. Digits must line up vertically. Prose numbers stay sans.

**Long-form reading has a MEASURE, and it is a count of characters rather than a width.** Running
prose — the methods page, the validation notes, anything a flyer reads a paragraph of rather than
scans — renders at `text-base` (the table above already says so) and its line is held to **45–75
rendered characters**, the range every typographic reference agrees on, with the middle of it the
target. Below 45 the eye returns too often; above 75 it loses the line on the way back.

**Do NOT express that cap in `ch`, and this is the trap it exists to name.** The CSS `ch` unit is the
advance width of `0`, and in Geist Sans a `0` is far wider than the average prose character — measured
2026-08-08 on the built methods page, **1ch = 11.0 px at 16 px while the average prose character is
7.10 px**. So Tailwind's `max-w-prose` (65ch) renders about **101** characters per line, half again the
upper bound, while reading like a rule was applied. Cap in `rem`, pick the number by measuring
rendered characters, and say in the class comment which measurement it came from.

**A multi-column layout owns this too, and it is where the rule is actually broken.** Columns divide
the width, so a two-column grid can make a wide screen read *narrower than a phone*. Measured on the
methods page before this rule existed: **58 characters at 390 px in one column, 46 at 640 px in two,
55 at 768 px, 76 at 1024 px** — non-monotonic in viewport width, with the 640 px band the worst on the
page. Choose the breakpoint at which a second column appears from the measure it leaves each column,
never from the breakpoint that happens to be next in the scale.

**And long-form reading has a CHUNK, which is the measure's vertical twin.** A line nobody loses their
place on is worth nothing inside a section nobody can find their way back into. **No run of prose
between two headings exceeds 800 rendered words**, and a route of running prose carries **at least 2.5
headings per thousand words**. Both are counted on the built export by §9, not judged by eye.

The numbers come from what the docs already do rather than from a style guide, and they are the
BUILT EXPORT's own — measured 2026-08-09 with the block in §9 below, so the justification and the
ratchet cannot quote different figures. `/docs/faq` is 4,712 words at **5.9** headings per thousand
with a worst run of **431**, and it is the one route nobody has ever complained about; `/docs/methods`
was 7,850 at **1.8** with five sections over 700 words; `/docs/limitations` was 11,247 at **2.4** with
a single **3,744-word** run under one `h3` covering six unrelated subjects. 800 words is roughly two
screens of `text-base` prose on a laptop and the point at which the contents list stops being able to
tell a reader where they are; 2.5 per thousand is comfortably under what the good route already
manages, so it is a floor rather than a target.

**Chunking is heading work, not rewriting.** The prose is good; what is missing is the structure over
it. A section break that needed a paragraph written to justify it is a section break in the wrong
place — find the one already there. And **every heading a chunk introduces carries an anchor**, via the
heading primitives, or the run has been split at the cost of the route's anchor coverage, which is the
other half of the same milestone.

---

## 4. Spacing

The scale is `1 2 3 4 6 8 12` (Tailwind units). Nothing else — no `5`, `7`, `9`, `10`, no arbitrary
values.

| Context | Value |
|---|---|
| inside a control | `px-3 py-1.5` (`px-2 py-1` for `text-xs` chips) |
| inside a card | `p-4` |
| between related rows | `gap-2` |
| between fields in a group | `gap-3` |
| between cards | `gap-4` |
| between sections | `gap-8` or `mt-8` |
| page gutter | `px-4 md:px-6` |

**Density is the point.** This audience reads dense, precise instruments — OpenRocket, RASAero, a
logger's own software. Generous whitespace reads as a marketing page, which is the exact charge
`MAINTAINING.md` says the tool must never invite. When in doubt, tighten.

---

## 5. Component vocabulary

Everything below lives in `components/ui.tsx` and is imported. A surface that needs one of these and
hand-rolls it instead is not done.

### Containers
- **`Card`** — the raised container. `rounded-xl border-hairline bg-raised p-4`. Optional `title` and
  `actions` slot. This replaces all 12 measured variants.
- **`Toast`** — a short, dismissible message that floats over the page: a new build is ready, a save
  landed, a background run finished. Renders a `Card` at §2's `floating` elevation, pinned to the
  bottom of the viewport clear of the device inset, with `role="status"` so it is announced without
  stealing focus. Takes one action at most and a dismiss. **It is a `Card` composed, not a `Card`
  with a shadow** — §9 forbids the second, because a generic elevation prop lets any surface opt out
  of "a card does not float". Never use it for an error the flyer must act on: that is `ErrorState`,
  in the flow, where it cannot be dismissed unread.
- **`DropZone`** — a file target: drop a file on it, or choose one. Renders a `Card` at §2's `muted`
  tone at rest and `accent` while a file is over it, so the edge goes dashed-grey to solid-accent and
  the fill tints — the state change is two tokens, and nothing about the treatment is written at the
  call site. Owns the file input and the picker button, because a drop zone with no click-to-pick is
  broken on every touch device. **Owns the refusal too, and that is the half worth having**: one
  `accept` list drives the PICKER, and the refusal is the reader's — named in an `ErrorState`
  **inside the zone** rather than handed to whatever is downstream. *(It does not gate the drop, and
  saying it did was wrong in this file for a week: the primitive checks no extension on a dropped
  file, deliberately, because Loft's importer sniffs bytes and a name gate refuses a renamed `.ork`,
  an extensionless download and a share-sheet hand-off with a sentence that is false. That gate was
  written once and reverted by a pre-push review; this sentence outlived it.)* The drag highlight
  counts enter and leave rather than toggling, or it drops every time the pointer crosses a child.
  **A file target that cannot be a card takes `useFileDrop` instead** — the drag half on its own,
  which is what `DropZone` is built from. The flight-log intake is that case: an inline control in a
  toolbar row inside a `Figure` inside a `Card`, where the card-shaped primitive would be a card
  inside a card. One behaviour, two presentations, so the three things a drop target has to get right
  — depth-counted highlight, `Files`-only arming, and an unconditional `dragover` cancel so a dragged
  link cannot navigate the app away — are written once. A surface that needs its own drag handling
  beyond that is not a file target and should not have one.
- **`Panel`** — a `Card` with a section header row — an `h2`, and an optional `aside` beside it —
  and, for anything dismissible, a close affordance. Owns focus return (see `useReturnFocus`).
  **Ten call sites and only three are dismissible**: it was extracted for the three heavy analysis
  panels and the shape turned out to be byte-identical at seven cards that have nothing to dismiss.
  `Card`'s own `title` is a level below this — an `h3` *inside* a card rather than the card's own
  heading.
- **`Section`** — the same header row, bare: a titled region within a route that is not a raised
  card. Heading, optional `aside`, optional description, children. **It imposes no margins**, which is
  why it sat at zero adopters for five runs: it used to add `mt-8` to itself and `mt-4` to its
  children, rhythm the routes already own through `space-y-8`, so adopting it would have doubled
  every gap. A primitive that cannot be adopted without a repaint gets copied instead. Both it and
  `Panel` render one shared header, so the two cannot drift — they already had, before either had a
  call site.
- **`Disclosure`** — progressive detail. The label says what is inside, never "More".
- **`SectionNav`** — a pinned strip of in-page links with a **you-are-here** marker, for a surface
  longer than a couple of screens. A map with no "you are here" is a list of place names.

  **Lifted out of `components/FlightReport.tsx` on 2026-08-08, where it was hand-rolled — because
  the surface that needed it most did not have it.** The report grew this when it reached nine
  screens on a phone; `app/methods/page.tsx` is ~12,700 words in 51 blocks and had no in-page
  navigation of any kind. One surface solving a problem privately while the worse instance of it
  goes unserved is the case a primitive layer exists for, and it is the same shape as `Popover`
  one entry down: the vocabulary was short a word, so the first site to need it wrote its own.

  `sticky`, not `fixed`: until the reader has scrolled past where it already sat it costs nothing.
  It scrolls sideways rather than wrapping, because a jump bar that takes a screen of its own to
  read is not a fix for a long page. Targets carry a `scroll-margin-top` so a heading lands below
  it rather than under it.

  **The marker must be able to reach the LAST section, and for two surfaces it could not.** A short
  final section cannot be scrolled up to the reading line — there is no page left — so it never lit
  up and clicking its own chip left the mark on the section above. `useCurrentSection` treats the
  bottom of the document as the last section. Measured on `/methods`, whose last group holds one
  short block: its heading sits 288 px down at maximum scroll on a desktop. The report had the same
  bug and hid it behind a tall final section.

- **`Popover`** — an explanation or a small set of controls, opened from a trigger and shown **over**
  the surface rather than in it. Use it where `Disclosure` would push the thing the reader is looking
  at off the screen, and where navigating away would cost them their place.

  **It is not a tooltip and the distinction is the reason it exists.** A tooltip is hover-only, which
  is nothing at all on a phone, and it carries a phrase. This is click- and tap-activated, keyboard
  reachable, dismissible, and carries a paragraph. **Never add a hover-only affordance to either
  app** — §8's form-factor contract rules it out before this section does.

  The contract, all of it owned by the primitive rather than by call sites:
  - the trigger is a `Button` — any weight, and **`link` is the right one for a `?` inside a label**,
    since §5 already defines `link` as the weight that sits inside a sentence;
  - **the trigger's visible words ARE its accessible name.** An `aria-label` is for a trigger whose
    content is a glyph — a `?`, an icon — and never for one that shows words, because it *replaces*
    the visible text: a button reading "per quantity" named "Choose the unit for each quantity…"
    fails WCAG 2.5.3 *Label in Name* and stops answering to voice control. The long sentence is a
    `title`. The `<details>` this replaced had exactly this right, natively, and the first version
    of the primitive undid it at the only call site there was;
  - **`Escape` closes it from anywhere on the page, not only while focus is inside it.** Bound to
    the primitive's own wrapper, the key silently stops working two Tabs later — which is the
    state-with-no-way-out this entry exists to prevent, for the one user `<details>` served
    correctly;
  - **both exits leave focus somewhere real.** The primitive moves focus INTO the panel on open, so
    it owes focus a home when the panel goes: `Escape` returns it to the trigger, and a click
    outside returns it too *when focus would otherwise be lost* — but not when the click landed on
    something focusable, because that is where the reader meant to go. A drop to `<body>` is what
    `useReturnFocus` exists to prevent and the first version of this primitive did it;
  - it carries a visible close control, because a surface a flyer can open and not obviously shut is
    the "state with no way back out" the craft bar names — and on touch there is no `Escape` key to
    fall back on;
  - **the BODY scrolls and the heading does not.** A panel that can grow taller than the window is
    one a flyer cannot get out of on a phone, because the close control ends up off-screen above
    them. Capping the body rather than the whole card is what keeps the way out pinned in view. The
    longest content this carries is a methods block, and those run to 764 words;
  - the panel is a `Card`, **including its title row**: the heading and the close control are
    `Card`'s own `title` and `actions`. A popover is not a licence for a thirteenth card treatment,
    and writing that row out by hand inside the primitive — which the first version did, at
    `text-sm` against every other card heading's `text-base` — is the same failure one level down;
  - the trigger says `aria-haspopup="dialog"`. `aria-expanded` alone is the *disclosure* pattern's
    attribute, and a screen reader announcing "collapsed" for a dialog names the wrong widget;
  - **on a narrow viewport it is anchored to the VIEWPORT, not to its trigger.** Measured 2026-08-04:
    the units panel, right-anchored to a control near the right edge, ran from −39 px to 201 at 375 px
    and cut off the entire left column of its own labels. The page never scrolled sideways, so nothing
    watching document width could see it. That belongs in the primitive; it was a per-call-site fix at
    the one site that had been measured.

  **Added 2026-08-08 from owner note `ON-3`, and the census is the story again.** The vocabulary had
  `Disclosure` and no overlay word at all, so two surfaces reached past it in opposite directions:
  `components/UnitsControl.tsx` hand-rolled one out of `<details>` plus an absolutely-positioned
  `Card` with bespoke viewport anchoring, and `components/MetricGrid.tsx` gave up on showing anything
  in place and sent the flyer to another route in another tab — 21 readings, all 21 navigating away.
  Sites reaching for the same missing word is the vocabulary being short, not surfaces being
  undisciplined; it is the third time §5 has recorded that shape, after `link` and `ChipButton`.

  **Loft has this primitive too as of 2026-08-08, and it meets this CONTRACT without matching this
  API.** Its version has no `description`, `align` or `width`, builds its close control from
  `ClosePanel` rather than an `IconButton` it does not have, and calls a two-value `useReturnFocus()`
  rather than this repo's `useReturnFocus(open, close)`. Those are the shared-file drift, not a
  disagreement about the pattern — filed in Loft's `BACKLOG.md` as part of reconciling the two copies
  of this document. **What it does meet is every clause above that is a defect rather than an API
  choice**, and it arrived at the document-level `Escape` independently, the same week, from the same
  symptom. That is the entry earning its place: the app that wrote it second did not have to
  rediscover the other six.

### Controls — four button weights, and only four
*The heading said **three** until 2026-08-09, above these same four bullets, over the same four keys
in `lib/ui-tokens.ts`'s `BUTTON_VARIANTS`. §2's rule that inventing a new weight is a change to this
file was therefore already broken by this file, in the sentence that governs it — and nothing could
notice, because nothing read this document. `lib/design-doc.test.ts` reads it now: the number in this
heading, the bullets under it and the shipped variants have to agree, in all three directions.
`danger` is a real weight and keeps its place — it is secondary geometry in the danger ramp, and a
removal that looks like every other button is the tell §2 is written against.*
- **`Button variant="primary"`** — indigo fill. **At most one per surface**, and only for the action
  the surface exists to perform. Two primaries on one screen means neither is.
- **`Button variant="secondary"`** — `control` border, transparent fill. The default for everything
  else.
- **`Button variant="ghost"`** — no border. Toolbar and in-table actions only.
- **`Button variant="danger"`** — secondary geometry, `danger` text and border. Removal only.
- **`Segmented`** — 2–5 mutually exclusive options, all visible. Preferred over a select at that size.
- **`Tabs`** — switching views over one subject *within* a route. Not for navigation between jobs;
  that is a route (§7).
- **`NumberField`** — a numeric input with its unit, min/max, and step. **Every numeric input in
  either app is this.** It owns the refusal behaviour the SAFETY invariant requires: a value that
  cannot mean anything physically is bounded or refused at the field, not flown into a confident
  number downstream.
- **`Select`** — one option out of more than five, or out of a list that grows. Below that count use
  `Segmented`, which shows them all. It carries the touch-target floor §8 states, so a select is
  never the control that fails it.
- **`ClosePanel`** — the way back out of a heavy panel that a Run button opened. **Every surface a
  flyer can open must have one**, which is the "state a flyer can enter with no way back" tell in its
  smallest form; it discards the result rather than hiding it, so the Run button coming back is what
  says the panel is offering the run again rather than concealing an answer.

### Data
- **`DataTable`** — sortable by any column, keyboard-navigable, copyable, with a sticky header. Every
  table is this one. "Tables you cannot sort, filter, or copy out of" is a named tell, and it is only
  fixable once rather than per table.
- **`Readout`** — a labelled value with its unit, provenance and optional caveat. The unit is never
  baked into the label string; it comes from the units context so a unit switch reaches every value.
  **Below the value it has two slots, and which one a caller wants is decided by §3 rather than by
  taste**: a *caption* (`text-xs` — the value's provenance, its phase, its withheld reason) and a
  *figure* (`text-sm`, mono — a SECOND number the flyer reads to make a decision, such as a
  percentile band or a companion statistic). One slot could not be both sizes, and trying to make it
  both is what held this primitive at one adopter: the dispersion panel puts a 5–95% band under
  every median, and a band a flyer sizes a recovery area from is decision-grade by §3's own rule,
  while "liftoff" or "burnout → apogee" is not. Added 2026-08-05, from the six real call sites.

  **It renders at two DENSITIES, and that is the other thing this vocabulary was missing.** A `tile`
  is a card with a `text-xl` value — "an analyzer's big readout", §3's own phrase. A `row` is a
  `<dt>`/`<dd>` pair with a `text-sm` value, for a dense strip of reference figures. §3 sanctions both
  sizes and the app had real users of each; what it did not have was one component serving both, so
  the dense half was hand-rolled and drifted. `bare` is the third case: a tile that already sits
  inside a container and must not nest a card in one. **In `row` the out-of-envelope marker is a plain
  flag with an accessible name rather than the `Extrapolated` treatment** — that one needs a `title`
  and a written line, and this density renders in shared chrome where §8's hover-only and depth
  contracts both forbid them.

  **A before → after → change row is NOT a `Readout`, and the reason is the one that deleted `Chip`.**
  The what-if comparison shows a design's figure, the what-if's figure and the signed change in one
  cell. That is three values and a comparison, not a labelled value — `q` would have to become a
  triple, and the change carries its own sign, unit and colour rules. Five call sites in one component
  are the only possible user, and designing a vocabulary entry around its sole adopter is what this
  file already declined to do once. If a second comparison surface arrives, those rows are the shape
  to extract, and the entry should be written from both.
- **`Figure`** — a chart with its title, legend, axis units, and its own empty and extrapolated
  states.
- **`Swatch`** — the colour sample that says which series or marker a legend row is about. Two
  shapes, because that is the distinction the legends already drew: a `bar` for a series (a line on a
  chart is a length of colour) and a `dot` for a marker (a CG or CP annotation is a point). A third
  shape is a change to this file, not a prop. It takes a `color` for a colour that comes from DATA —
  a chart series picks its own, so it cannot be a class — and a `className` for one the palette
  names. It exists as a primitive rather than as a rule because eight sites across five files had
  hand-rolled it at two different radii and two shapes, and §9's radius grep could not see any of it.

**`Chip` was deleted on 2026-08-04, and the reason is worth keeping so it is not re-added by
memory.** It declared "a compact key/value or filter token" and had zero call sites for its whole
life, in a codebase where every other primitive here found between one and seven on the day it was
built. The key/value half is `Readout`'s, which has adopters. And the app contains **exactly one**
token-shaped element — the motor-resolution pills in `ResultsView` — which is a single-label STATE
pill, not a key/value, in a geometry (`rounded-full px-2.5 py-0.5`) that is not the one this file
stated. Adopting it there would have meant rewriting both the API and the spec to fit the only
possible user, which is designing a vocabulary item around its own sole adopter. If a second token
surface ever arrives, that pill strip is the shape to extract, and this entry should be written from
it rather than before it.

### States — every data surface implements all five
`empty` · `loading` · `error` · `offline` · `extrapolated / out-of-envelope`

- **`EmptyState`** — says what would fill it *and* the one action that does. Never "No data".
- **`ErrorState`** — names the file or field that failed, what was expected, and the way forward.
  An error that names something not on the page is a named tell.
- **`Extrapolated`** — the warn treatment plus the reason and the range it left. Required wherever a
  number leaves the envelope its method was validated over.

**A surface with no empty state is not finished.** It is the state a flyer sees first.

---

## 6. Presenting numbers

This is the part of the design system that is also a safety rule, and it outranks aesthetics.

- **A value never appears without its unit**, and the unit comes from the units context.
- **Precision reflects the method, not the float.** Three significant figures unless the method
  justifies more. `1247.8823 m` is a tell — it claims precision the model does not have.
- **Every reference value names its source** — the tool that produced it, and any caveat that tool
  attached. A stored simulation the source tool marked outdated is labelled as such.
- **Independent estimates are shown side by side and never averaged.** Agreement is confidence;
  disagreement is a flag. A consensus dressed as one number is forbidden.
- **A withheld value says why, and what would restore it.** A blank cell is a bug.

---

## 7. Product shape

**Distinct jobs are distinct routes.** Import, build/edit, simulate, sweep, validate/cross-check, docs
— each its own static route over the one internal model. Tabs switch views *within* a job; routes
separate jobs. One endless scrolling page is the "landing page with a chart bolted on" charge, and it
is what both apps must grow out of.

Every route is a static export. Multi-view is multi-route, never multi-server.

**Navigation is one spine**, present on every route, showing where the flyer is. A feature reachable
only by knowing it is there is a named tell.

---

## 8. Form factors

Desktop and touch are separate designs over one model, not one layout stretched.

**Desktop** — dense, keyboard-complete, direct-manipulation. Every action has a keyboard path. Tables
sort and copy. Drag has an arrow-key equivalent and an undo.

**Touch** — 44 px minimum hit target on `pointer: coarse`, everywhere, not just where it was last
measured. No hover-only state. No horizontal scroll on the page body; wide content scrolls inside its
own container. A phone journey is at most two screens deep to its answer.

**A DRAWING OF THE SUBJECT IS ORIENTED TO THE SCREEN, NOT TO THE PAGE.** A scale drawing of something
long and thin — a rocket, a booster, an airframe — is laid along the screen's LONG axis. On a phone
held upright that is vertical. Measured on Loft at a 390 px viewport, where the drawing column is
324 px: the bundled 38 mm single-deploy airframe renders **296 px long and 11.8 px tall**, 3.86:1 in
a box that is nearly square. It is to scale and it is unreadable as a rocket. Dual-deploy is 10.3 px,
the from-scratch starter 19.0 px.

Three things this rule is NOT, each of which is an obvious wrong turn from it:

- **It is not a hit-target fix.** Rotating buys about 1.62x on Loft's numbers — 11.8 px to 19.2 px on
  a 500 px height budget — and none of the bundled designs reaches this section's 44 px that way. The
  hit targets stay the tap columns' job. Sell it as legibility, which is what it is.
- **It is not keyed on a coarse pointer alone.** It is keyed on `(orientation: portrait)` AND coarse.
  A phone in landscape gives a horizontal drawing far more room than a vertical one — 863x360 gives
  ~831 px of width against at most ~340 px of height — so rotating there is strictly worse.
- **It is not keyed on viewport width.** Width is not orientation and it is not pointer type.

**AN INTERACTIVE CONTROL ON A DRAWING IS DEFINED ON THE MODEL'S AXIS, NEVER THE SCREEN'S.** A grip
that resizes a length is a LENGTH grip; whether that runs across the screen or down it is a rendering
detail decided later. State the model axis at the call site and derive everything the screen needs
from it — the value mapping, the resize cursor, `aria-orientation`, the arrow-key direction, and any
arrow glyph drawn on the grip.

**This is written as a rule because the alternative has a specific, silent failure.** A prop named
`axis` that means the SCREEN axis reads exactly the same at the call site and inverts every control
the moment the drawing rotates: a drag toward the nose lengthens the fin root, and a screen reader
announces the opposite of the gesture. Nothing goes red — the roles and the accessible names are
unchanged. The same mistake has a second home in the tap targets, whose minimum must be asserted on
the model axis too, or a rotation turns a passing assert into a vacuous one rather than a failing one.

**A drawing that is scaled to fit needs a budget on BOTH axes.** Fitting to width alone is what
produces the hairline above. Name the height budget as a constant with the measurement behind it
rather than discovering it mid-implementation, and do not derive it from `100vh` — that cannot be
read during render without a hydration mismatch.

**The check is a measurement, not a look:** at a 390 px viewport, count controls under 44 px and
states unreachable without hover. Both counts are zero or the surface is not done.

---

## 9. Compliance — how a session verifies

**Some of this file is now READ by the gate, and that half needs no command.** `lib/design-doc.test.ts`
opens this document and holds §5 against the code: the number the Controls heading states, the button
weights declared under it and the variants `lib/ui-tokens.ts` ships must agree in all three
directions; every primitive `components/ui.tsx` exports must be declared by §5; and every name §5
declares must resolve to a component that exists. The blocks below are the half that still cannot be
read from prose — they count treatments across the tree, not statements in this file — and
`lib/design-system.test.ts` is their executable copy, transcribed by hand and kept in step by hand.
**When that transcription and this file disagree, the test is right and this block is what to
regenerate.** Added 2026-08-09 with P13; before it, nothing in either repo opened this document, and
the Controls heading had contradicted its own bullets for long enough that nobody could say when it
started.

Run these before calling a surface done, and put the counts in the commit message. Numbers, not
adjectives.

**Two of these were provably blind until 2026-08-09, and the correction found real drift rather than
hypothetical drift.** The radius grep named one literal, so it reported 0 while seven off-system radii
stood in the tree; the spacing grep matched named steps only, so an arbitrary value was not off-scale
to it but invisible. Both are corrected below and both are asserted, and the class error is the one
this section keeps recording about itself: an instrument that enumerates what it already knows about
reads green over the class it was never told to look for. The sibling repo corrected the same two on
2026-08-04 from a fixture rather than from live drift, and its version reads `class="…"` attributes;
this one reads every string literal, because an attribute-only scan cannot see a class composed
through `cx(…)` — which is how the primitives' own are written.

**Three more holes the pre-push review found in the corrected greps, all fixed the same day and all
worth stating because each is a different SHAPE of blindness.** *Wrong scope:* the checks read
`components/` and `app/`, and `lib/ui-tokens.ts` — which spells the control radius for every button in
the app — is in neither, so that one line could have been set to the forbidden radius with the suite
green. *Wrong text:* a stylesheet declares radii as VALUES, and these match class NAMES, so
`app/globals.css` contributed nothing; `.prose-loft code` was sitting at a fifth radius, exactly as
`.eqn` sat at 8 px while the class-name count read zero. *Wrong granularity:* the one sanctioned
radius was asserted to be in `components/ui.tsx` rather than in the primitive that owns it, so moving
it onto another primitive in the same file read as the exception. A grep can be right about the
pattern and wrong about what it reads, where it reads it, and how precisely it says so.

```bash
# radius drift — every radius token, MINUS the three §2 sanctions. Reads string literals rather
# than raw text: this app composes most classes through `cx(…)`, so an attribute-only scan cannot
# see the primitives' own; and a raw scan reads the English word in prose (18 such hits across the
# docs routes). `lib/design-system.test.ts` is the exact form, including the side/corner split and
# the one owner exemption — this is the readable statement of it.
strs() { grep -rohE '"[^"]*"' components app --include='*.tsx' \
  | sed 's/^"//; s/"$//' | tr ' ' '\n' | grep -v '^$'; }
strs | grep -xE 'rounded(-(sm|md|lg|xl|2xl|3xl|full|none|\[[^]]+\]))?' \
     | grep -vxE 'rounded-(md|xl|full)' | wc -l                     # target: 0

# border drift — every border-zinc token, MINUS §2's four (hairline 200/800, control 300/700).
# Enumerate-and-subtract for the same reason the radius grep does it: a check listing known-bad
# values passes the one nobody has thought of. Colour only — a SIDE utility (border-t, border-x)
# says where the rule is drawn, which §2 does not govern.
strs | grep -xE 'border-zinc-[0-9]{2,3}' \
     | grep -vxE 'border-zinc-(200|800|300|700)' | wc -l            # target: 0

# ...and the two pairs must be used AS pairs, which the count above cannot see. Every violation
# found when this was first run was `border-zinc-100 dark:border-zinc-800` — an unsanctioned light
# against a sanctioned dark — so fixing only the light half reaches 0 with the rule still a
# different rung in each theme. `lib/design-system.test.ts` is the exact form: it reads one class
# string at a time, counts RESTING tokens only (a hover: variant is a different state), and skips
# a string holding more than one light or dark, where the pairing cannot be attributed.
                                                                    # target: 0 mismatched pairs

# card treatments hand-rolled instead of <Card>
grep -roh 'rounded-xl border[a-z0-9:/ -]*' components \
  | sed 's/[[:space:]]*$//' | sort -u | wc -l                       # target: 1

# ...and the one that says what is actually WRONG, which the count above cannot. That one counts
# DISTINCT treatments wherever they live; a treatment inside `components/ui.tsx` is the vocabulary,
# and the same string in a feature component is the vocabulary being re-invented. Excluded by PATH,
# not by basename: `--exclude=ui.tsx` matches a basename anywhere in the subtree, so a future
# `components/<dir>/ui.tsx` would be exempted silently — the third "wrong scope" this block records.
grep -rn 'rounded-xl border' components --include='*.tsx' \
  | grep -v '^components/ui\.tsx:' | wc -l                          # target: 0

# a container border WIDTH off §2's one hairline. Its own check, because the two card counts above
# cannot see it: they need `rounded-xl` and a border token in ONE literal, and a `Card` handed a
# width through `className` writes only the width — the caller never spells the radius. A spinner
# ring is subtracted by its own literal rather than by file, so a feature component that draws one
# does not thereby get a licence to draw a bordered container too. `border-0` is a reset.
strs | grep -xE 'border-[1-9][0-9]*' | wc -l                        # target: 0
                                                                    # (the test is the authority;
                                                                    #  it subtracts `rounded-full`
                                                                    #  per literal, which a shell
                                                                    #  one-liner cannot express)

# elevation off the two §2 sanctions. Enumerate-and-subtract, like the radius and border greps, so
# a third value nobody has thought of fails rather than passing unnamed. `shadow-lg` is `floating`
# and `shadow-sm` is `Segmented`'s thumb; anything else is drift.
# **This grep exists because the section it enforces shipped WRONG without one.** §2's elevation
# table was written on 2026-08-17 claiming one value while two shipped, and no check in either repo
# could contradict it — an elevation is not a radius, a border colour, a spacing step or a type
# size, so every other command here reads past it.
strs | grep -xE 'shadow(-(2xs|xs|sm|md|lg|xl|2xl|inner|none|\[[^]]+\]))?' \
     | grep -vxE 'shadow-(lg|sm)' | wc -l                            # target: 0

# a data surface that VANISHES instead of saying why — §5's "a surface with no empty state is not
# finished". Two questions, and both have to be asked of a COMPONENT rather than of a file:
# `ResultsView.tsx` holds four data surfaces and eight conditional hints, and "does this file
# contain `return null`" answers yes for both kinds.
#   1. Is it a data surface? — it renders one of §5's DATA containers (DataTable, Figure, <table>),
#      or renders a dataset into one of its general ones (Panel, <svg>, Card as="section"). Nothing
#      renders a table or a figure for a single value, so those three need no second test; the other
#      three are shapes anything can take, and without one `<svg>` matches every icon in the app.
#   2. Does it `return null` at its OWN top level? — outside every callback and IIFE. A `return null`
#      inside a `.map(…)` is one row drawing nothing, which is not this defect.
#
# THERE IS NO SHELL FORM OF THIS ONE, and that is stated rather than approximated. Both questions
# need brace matching, and a `grep -c 'return null'` prints a number unrelated to either target —
# most of this app's `return null`s are conditional advice and are correct. A line in this block
# whose output does not mean its target trains a session to distrust the block, which is the same
# reflex §9 exists to fight. `lib/design-system.test.ts` is the only form:
#
#   npx vitest run lib/design-system.test.ts -t vanish

# states a phone cannot reach — a tooltip is a hover, and a hover is a state a flyer at the pad
# does not have. Counts BOTH forms: the `title` attribute and the SVG `<title>` CHILD element, which
# renders the identical native tooltip and which an attribute-only scan cannot see. The child is
# attributed to its PARENT — a `<title>` element has no rect of its own, so a probe that skips
# zero-size elements discards it before it is ever tested. Driven at 390 px on a coarse pointer,
# because half of these render only on one form factor.
#
#   npx playwright test -g "counts the states a flyer at the pad cannot reach"
#                                                                    # target: 0
#                                                                    # target: 0 offenders, and
#                                                                    #         >= 22 surfaces SEEN

# off-scale spacing — every spacing utility, minus the scale
grep -rohE '\b((p|m)[xytblr]?|(gap|space)(-[xy])?)-[0-9]+\b' components app \
  | grep -vE -- '-(0|1|2|3|4|6|8|12)$' | wc -l                      # target: 0

# spacing written as an ARBITRARY value, which §4 forbids and which the named-step pattern above
# cannot express at all. The one legitimate case is a device inset, exempted by naming the function.
strs | grep -xE '((p|m)[xytblr]?|(gap|space)(-[xy])?)-\[[^]]+\]' \
     | grep -v 'env(safe-area-inset-' | wc -l                       # target: 0

# a size that is not on the scale at all — anything but the six in §3
grep -rohE '\btext-(xs|sm|base|lg|xl|[0-9]xl)\b' components app \
  | grep -vxE 'text-(xs|sm|base|xl|3xl)' | wc -l                   # target: 0

# decision-grade text at caption size — count the INVERTED FILES, and credit the primitives a file
# uses, because each of them renders `text-sm` the grep cannot see (see below)
for f in components/*.tsx; do xs=$(grep -oh 'text-xs' "$f" | wc -l); \
  sm=$(grep -oh 'text-sm' "$f" | wc -l); \
  p=$(grep -ohE '<(Select|NumberField|Readout|Button|Segmented)\b' "$f" | wc -l); \
  [ "$f" = components/ui.tsx ] && p=0; \
  [ "$xs" -gt $((sm + p)) ] && echo "$f $xs/$sm+$p"; done | wc -l
                                                                   # target: 0 inverted files

# every dropdown is the primitive — counted on source, since adoption cannot see a NEW hand-rolled one
grep -rn '<select' components app --include='*.tsx' | grep -v 'components/ui.tsx' | wc -l   # target: 0
                                                                   # (matches inside prose comments
                                                                   # do not count — strip them first)

# long-form chunking — §3's two prose counts, on the BUILT export rather than the source, because
# what a reader meets is the rendered page. Asserted by `lib/docs-nav.test.ts`, which is the copy to
# trust: this block is the readable statement of the rule, that file is the ratchet.
node -e '
  const {readFileSync,readdirSync}=require("fs"),{join}=require("path");
  for (const f of readdirSync("out/docs").filter(f=>f.endsWith(".html"))) {
    const h=readFileSync(join("out/docs",f),"utf8").replace(/<script[\s\S]*?<\/script>/g,"");
    const body=(h.match(/<article[\s\S]*?<\/article>/)||[h])[0];
    const words=s=>(s.replace(/<[^>]*>/g," ").match(/[A-Za-z0-9][^\s]*/g)||[]).length;
    const heads=[...body.matchAll(/<h[234]\b/g)].map(m=>m.index);
    const total=words(body); if (total<400) continue;   // the index is a link list, not long-form
    const runs=heads.map((s,i)=>words(body.slice(s,heads[i+1]??body.length)));
    console.log(`${f} ${total}w  heads/1kw ${(heads.length/total*1000).toFixed(1)}  worst ${Math.max(...runs)}w`);
  }'
                                                                   # target: every worst run <= 800,
                                                                   # every heads/1kw >= 2.5
                                                                   # (needs a build; `out/` is not
                                                                   # cleaned between runs, so
                                                                   # `rm -rf out .next` first)

# primitives actually adopted
grep -rlE "from ['\"](\./ui|@/components/ui)['\"]" components | wc -l   # target: most components
```

**The suite-wide ratio was removed on 2026-07-31, and the reason is worth keeping.** It hid what it
was for and then actively misled. It hid: 88 `text-xs` against 91 `text-sm` passed `sm > xs` by three
while **9 of 23 component files were individually inverted**, `GeometryInspector` at 9:2 and
`MonteCarlo` at 9:4 — a global ratio passing by a hair while the surfaces a flyer reads numbers on sit
at caption size is exactly the inversion §3 exists to prevent. Then it misled: converting nine
hand-rolled buttons onto `Button` moved the totals to **84/89**, an inversion by the metric, while not
one glyph on screen changed size — the `text-sm` had moved INTO the primitive. **Adoption drives the
suite ratio the wrong way for the right reason**, which makes it useless during exactly the milestone
that raises adoption. Count the inverted FILES.

**The same distortion repeats one level down, and on 2026-08-04 it bit the per-file count too.**
The note above records that adoption moved the SUITE totals to 84/89 while nothing on screen changed
size, because the `text-sm` had moved into the primitive — and concludes "count the inverted FILES".
That conclusion is right and incomplete: a file's own count moves the same way for the same reason.
Converting `LoftApp`'s twelve `<select>` elements onto `Select` took it from 17/16 to 17/9 without a
rendered pixel changing, and read as a file that had suddenly gone all-captions. So the count credits
the body-default primitives a file uses — they each render `text-sm` — from an EXPLICIT list, so a
new primitive cannot silently buy a file out of an inversion. It keeps its teeth: measured the day it
changed, every other component still passed on raw counts alone, and `LoftApp` was the only file the
credit rescued, at 17 captions against 53 body-default renderings. **The rule underneath, for
whatever the next milestone extracts: a check that counts a file's own class strings will always
penalise adoption, so it has to count what the file RENDERS, not what it spells.**

**The adoption grep used to carry a hard-coded quote character**, and it could only ever be right in
one of the two repos: Loft's imports are double-quoted and Debrief's are single-quoted, so whichever
form this shared file picked, the other app got a command that answered **0** whether adoption was 0%
or 100%. It was written `from './ui'` while Loft was double-quoted (corrected 2026-07-31), then
`from "./ui"` while Debrief was single-quoted, which is the same bug pointing the other way. It is
quote-agnostic now, and any grep added here must be. A compliance command that cannot fail is worse
than none, because a session runs it, sees the target, and moves on.

**The off-scale-type grep was widened for the same reason.** It named `text-lg` because that is the
one Loft had. Run against Debrief on 2026-07-31 it reported **5** where the true count was **19** —
`text-2xl` used 13 times, including five of six page titles where §3 says `text-3xl`, and one
`text-4xl` — and called the other 14 compliant. A grep that names one instance of a class of drift
will always be read as covering the class. It matches every `text-` size and subtracts the six.

**Two more greps were generalised on 2026-07-31, and both had the same shape as the two above: a
pattern that named the drift somebody had in front of them rather than the class it belongs to.**

- **The card grep's character class had no `:`,** so every treatment truncated at the first
  `dark:` variant and two cards differing only in their dark surface counted as one. **The count
  does not move — 7 before, 7 after** — because today's seven strings happen to differ before their
  first `dark:` as well; what the fix buys is what the metric is able to *distinguish* for the rest
  of the milestone, not a correction banked now. Say that rather than claim a number that did not
  change. **The `sed` is part of the rule, not tidiness:** one call site ends its class string with
  a space before an interpolation, so untrimmed the shell answers 8 where the test answers 7, and
  the two copies of this block have to agree or neither is the authority.
- **The spacing grep enumerated forbidden values, and the enumeration stopped at 14.** Two whole
  prefixes were never matched at all — `gap-` and `space-{x,y}-` are the same scale applied to a
  different property — and nothing above 14 was named. It reported **0** while 8 occurrences over 6
  sites remained: `mt-20 md:mt-28` twice, `mt-16`, `space-y-5`, `gap-5`, `gap-y-5`. Enumerating what
  is allowed and subtracting it cannot go stale the way enumerating what is forbidden does, which is
  the same correction the off-scale-type grep already took.

  **`gap`/`space` need their own prefix branch, and the first draft of this very fix got that
  wrong.** They take the axis as a separate segment (`gap-y-5`) where padding and margin fold it in
  (`py-5`), so a shared `[xytblr]?` cannot match both. Written as one pattern it reported 0 again,
  with `gap-y-5` sitting live in `app/methods/page.tsx` — a second false green inside the commit
  that existed to remove the first. Caught by review, not by the grep.

**Half-steps are deliberately out of this grep's scope, and that is a decision rather than an
oversight.** §4's own table sanctions `px-3 py-1.5` and `px-2 py-1`, so `-1.5` is *in* the system and
a grep that forbade every half-step would contradict the section it enforces. The unsanctioned ones
(`-0.5` ×48, `-2.5` ×21, `-3.5` ×1; `-1.5` ×78 is sanctioned) are recorded in `BACKLOG.md` rather than
silently swept in or silently ignored; settling them means saying in §4 which half-steps are on the
scale, and that is a change to this file in both repos.

**The two copies of this block had DRIFTED, and the weaker side hid real drift in its app.**
Reconciled 2026-08-02 — the first session in which both repos could be attached at once and the
copies actually compared, which is why it stood for six runs. Three of Loft's greps were the weaker
side: the spacing one listed a handful of off-scale values to hunt for instead of enumerating the
scale and subtracting it, so it could not see a `gap-*`, a half-step, or anything past its largest
alternative — and Loft's footer had sat two steps outside the scale on both top margins, reading as
compliant, for as long as the check existed. The type one matched a single size name, so a seventh
or eighth size under any other name passed. The card one could not survive a trailing space or a
`dark:` variant. **The lesson is not "Loft was behind"** — Debrief's adoption grep was the weaker
side of the same coin a run earlier. It is that a file shared verbatim between two repos cannot be
verified from inside one of them, so whichever session next has both attached should diff them
first, before trusting either copy.

**Pin what you fix.** A drift you correct without a check comes back. The suite-level target is that
these counts are asserted by a test, not re-measured by hand each run — and in both apps they now
are: `lib/design-system.test.ts` is the executable copy of this block, with each count an EXACT
ratchet so that an improvement and a regression both fail until the number is updated in the same
commit as the work. Neither file may drift from the other, and neither may drift from its sibling.

**Where the card target is not 1, say so rather than quietly missing it.** A treatment that matches the
grep but is genuinely not a card — a floating toast that needs elevation, an interactive drop zone —
gets its own named primitive rather than a `shadow` prop on `Card`. Record the honest floor and what
each remaining string is, on the milestone that owns the conversion.

### Contrast — the one thing every grep above is blind to

**Every count above matches a class NAME, and readability is a rendered COLOUR.** So all of them can
read zero while text on a live route is unreadable, and on 2026-08-08 that is exactly what had
happened: the owner reported the docs "keep the font color as grey in dark mode, incredibly hard to
read", and every §9 number was at target. Measured on the built export: body prose at **1.91:1**,
`h2` and `strong` at **1.12:1**, links at 3.16:1, blockquotes at 2.57:1 — against WCAG AA's 4.5:1.
It had shipped, on all six docs routes, for as long as those routes existed.

**The mechanism is worth stating, because it is a trap this system sets for itself.** The `dark`
variant has TWO clauses — the `.dark` class an explicit choice sets, and `prefers-color-scheme` for a
visitor who has chosen neither — and every `dark:` UTILITY gets both. A rule written by hand in a
stylesheet gets only the one it asks for, and "System" is the DEFAULT theme, setting no class at all.
So a hand-written `:where(.dark)` rule is correct for everyone who has visited the theme toggle and
wrong for everyone who has not.

Two rules follow, and they are binding:

- **A hand-written rule states its colour with `light-dark()`, never with `.dark` alone.** It
  resolves against the element's used `color-scheme`, which is already set per clause on the root, so
  one function covers both with no media query to forget. Keep the bare light value as a preceding
  declaration — that is the fallback for a browser without `light-dark()`, and it costs nothing.
- **Contrast is measured on the RENDERED page, in every theme a visitor can be in** — light, Dark
  chosen, and a dark OS with nothing chosen. That third state is the default and is the one that was
  broken.

```bash
# the rendered check — three themes, every docs route, plus the workspace carrying the numbers
npx playwright test e2e/contrast.spec.ts        # target: 0 nodes below WCAG AA, 4 cases green

# the source check — no hand-written rule may answer the class clause alone
npx vitest run lib/design-system.test.ts -t "class half of the dark variant"   # target: green
```

Both are ratcheted into the suite. Colours are **rasterised onto a 1×1 canvas, never parsed**:
Chromium reports computed colours as `lab()`/`oklab()` here, and a digit match over
`lab(2.51 0.24 -0.89)` yields confident nonsense. And each case asserts its own sample count first —
a walk that examined nothing reports zero unreadable nodes and prints exactly like a pass.

---

## 10. Suite consistency

Loft and Debrief are one product family. A flyer who designs in Loft and analyses in Debrief must not
feel they changed tools. Shared and non-negotiable: this file, the neutral and accent ramps, the type
scale, the spacing scale, the component vocabulary and its names, the header/footer/nav pattern, the
theme toggle and its tri-state behaviour, the units control, the brand mark and wordmark, the PWA and
offline posture, the MIT licence.

**Divergence is a bug in whichever app diverged**, and the fix lands in both repos in the same run.
Where the apps genuinely need different components — a rocket diagram, a flight chart — they still
share tokens, scale, states and vocabulary.

**A digest holds the shared span, in both repos, as of 2026-08-09.** *"The fix lands in both repos in
the same run"* was a rule with nothing behind it, and the two copies of this file had drifted 12 hunks
apart while both apps called it binding. `lib/design-shared.test.ts` computes a SHA-256 over
**§4, §6, §7, §8 and §10** — the sections that are shared by nature and were already byte-identical,
9,944 bytes of them — and compares it against a constant committed in both repos. A change to one
copy that is not made to the other fails that repo's gate rather than drifting silently.

**The span is deliberately narrow, and it can only grow.** §5 and §9 are excluded because the two
apps genuinely ship different primitives and count different treatments — this repo deleted `Chip`
and the sibling defines it — so demanding identity there would demand a lie. §1, §2, §3 and §11
differ only in clauses one copy has and the other has not yet taken, so they are the next to join.
**Widening the span is what "reconciled" means here**: move a section into the list, make both copies
identical, and update the digest in both, in one change.


### The suite is THREE tools, and the reference is whichever one meets this file

**Named here because until 2026-08-08 this section named none, and "shared and non-negotiable" with no
reference resolves to whichever app a session happens to be sitting in.** The third tool is the Hobby
Rocket Motor Finder (`motor.fusionspace.co`, `nrdptel/Hobby-Rocket-Motor-Finder`) — live, polished, and
the one a flyer has most likely just come from. It is a reference, **not the authority**: where a
shared control differs, the app that matches this file wins and the others move. Establish which that
is by MEASURING all three, not by assuming the oldest is right.

**The theme control — already identical, do not "align" it.** Verified from the motor finder's rendered
markup: same tri-state cycle, same `System / Light / Dark` labels, the same `◐ ☀ ☾` icons, and the
identical accessible name `Color theme: X. Click to change.` Only the storage key differs, correctly.
A session reading `ON-B1` as a rewrite instruction would be undoing a match.

**The Tip control — one Ko-fi link, and the colour question is SETTLED against the motor finder.**
It renders an amber pill; Debrief and Loft render a neutral `secondary`. Amber is `warn` (§2), and
Debrief's `components/KofiButton.tsx` carries the reasoning in full because it *used* to be amber and
was deliberately changed: spending the caveat colour on a tip jar in the persistent header devalues
the one signal the safety posture leans on. **Two of the three agree, and they are the two that meet
§2** — so the motor finder is the app that should move on colour.

What DOES converge is the **glyph and the wording**: a coffee cup on the same path, and the sentence
*"Tip the project — buy me a coffee on Ko-fi"*. Loft carried a `♥` and a shorter accessible name until
2026-08-08 and was the odd one out; it is not now.

**The MECHANISM that sentence rides on does not converge, and that is a measurement rather than a
preference.** Both siblings put it on a `title`. Loft puts it on `aria-label` alone, because
`e2e/touch.spec.ts` counts any `title` whose text is not already on screen beside it as a state a
flyer at the pad cannot reach, and holds that total at zero. Adding the `title` here took it to 1 and
failed the suite — correctly: the visible label is "Tip", the tooltip is a sentence, and a phone gets
no tooltip at all. So the rule for the family is **the accessible name carries the destination, and a
`title` may only repeat what is already rendered.**

**Geometry stays each app's own, and Loft's is the one to copy**: the motor finder renders
`px-2.5 py-1 text-xs` with no `focus-visible` ring and no touch minimum — about 26 px against §8's
44 px floor on `pointer: coarse`. Debrief's is `size="sm"`. Loft's is `buttonClass()`'s `md` with the
ring and the floor. A check holds that line (`lib/design-system.test.ts`, *"keeps Loft's touch floor
and focus ring on the suite's Tip control"*).

**Still open and the owner's:** the header's SHAPE — two right-aligned rows on the motor finder with
Tip last, a single row in Loft with Tip first. Parked in Loft's `OWNER-NOTES.md` under *Awaiting the
owner*.

**And the method, which is the transferable half.** The motor finder's repo is not attachable to these
sessions, so its behaviour is verifiable from the live site and its implementation is not — say which
of the two you did. **Debrief's is attachable, in one tool call, and this whole entry is what that
bought:** a run that had only Loft and the live motor finder measured two tools, concluded amber, and
was about to ship a semantic colour into the persistent header. Attach the sibling before deciding
anything this section governs.

---

## 11. What this file does not cover

Copy and tone (`MAINTAINING.md`), the SUBSTANCE of physics and method presentation — which method is
used, how it is derived, what it is compared against — and the roadmap. If a design decision has a
product consequence — a route split, a new workspace — it belongs in `ROADMAP.md` as a milestone, not
decided inline here.

**The methods and limitations pages used to be out of scope entirely, and that was too wide a cut.**
It exempted 19,083 of the docs' 29,204 words from every rule in this file, including the two that
exist for exactly that kind of text — the measure and the chunk in §3. What those pages SAY is theirs;
how they are set — line length, section size, heading rhythm, anchors, the primitives they are built
from — is this file's, the same as any other surface. Amended 2026-08-09 for `P11`, whose *done when*
could not be met while the clause it needed was scoped out of the pages it was written for.
