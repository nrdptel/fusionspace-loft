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

**A new visual treatment is a change to this file.** Inventing a fourth button weight or a third
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

### Borders

| Role | Value | Use for |
|---|---|---|
| `hairline` | `border-zinc-200 dark:border-zinc-800` | container edges, dividers, table rules |
| `control` | `border-zinc-300 dark:border-zinc-700` | inputs, selects, secondary buttons — anything the flyer acts on |

Two, deliberately. The control border is one step darker so an interactive edge is distinguishable
from a decorative one without reading the element. Do not mix them: a card is `hairline`, an input
inside it is `control`.

### Text

| Role | Value | Use for |
|---|---|---|
| `primary` | `text-zinc-900 dark:text-zinc-100` | values, headings, anything being read |
| `secondary` | `text-zinc-600 dark:text-zinc-400` | labels, units, captions, help |
| `tertiary` | `text-zinc-500 dark:text-zinc-500` | disabled, placeholder, timestamps |

### Accent and meaning

| Role | Value | Means |
|---|---|---|
| `accent` | `indigo-500` (focus, `600` fill) | interactive, selected, the focus ring |
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

### Controls — three button weights, and only three
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

Run these before calling a surface done, and put the counts in the commit message. Numbers, not
adjectives.

```bash
# radius drift — rounded-lg is out of the system; containers are xl, controls md
grep -roh 'rounded-lg' components app | wc -l                      # target: 0

# card treatments hand-rolled instead of <Card>
grep -roh 'rounded-xl border[a-z0-9:/ -]*' components \
  | sed 's/[[:space:]]*$//' | sort -u | wc -l                       # target: 1 (+ any named
                                                                    # non-card primitive, see below)

# off-scale spacing — every spacing utility, minus the scale
grep -rohE '\b((p|m)[xytblr]?|(gap|space)(-[xy])?)-[0-9]+\b' components app \
  | grep -vE -- '-(0|1|2|3|4|6|8|12)$' | wc -l                      # target: 0

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

Copy and tone (`MAINTAINING.md`), physics and method presentation (the methods and limitations
pages), and the roadmap. If a design decision has a product consequence — a route split, a new
workspace — it belongs in `ROADMAP.md` as a milestone, not decided inline here.
