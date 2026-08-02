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
- **`Panel`** — a `Card` with a header row and a close affordance, for anything dismissible. Owns
  focus return (see `useReturnFocus`).
- **`Section`** — a titled region within a route: heading, optional description, children. This is
  what a route is built from.
- **`Disclosure`** — progressive detail. The label says what is inside, never "More".

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
- **`Chip`** — a compact key/value or filter token. `text-xs`, `rounded-md`, `px-2 py-1`.

### Data
- **`DataTable`** — sortable by any column, keyboard-navigable, copyable, with a sticky header. Every
  table is this one. "Tables you cannot sort, filter, or copy out of" is a named tell, and it is only
  fixable once rather than per table.
- **`Readout`** — a labelled value with its unit, provenance and optional caveat. The unit is never
  baked into the label string; it comes from the units context so a unit switch reaches every value.
- **`Figure`** — a chart with its title, legend, axis units, and its own empty and extrapolated
  states.

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

# decision-grade text at caption size — count the INVERTED FILES, not the suite total
for f in components/*.tsx; do xs=$(grep -oh 'text-xs' "$f" | wc -l); \
  sm=$(grep -oh 'text-sm' "$f" | wc -l); [ "$xs" -gt "$sm" ] && echo "$f $xs/$sm"; done | wc -l
                                                                   # target: 0 inverted files

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

---

## 11. What this file does not cover

Copy and tone (`MAINTAINING.md`), physics and method presentation (the methods and limitations
pages), and the roadmap. If a design decision has a product consequence — a route split, a new
workspace — it belongs in `ROADMAP.md` as a milestone, not decided inline here.
