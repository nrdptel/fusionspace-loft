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
grep -roh 'rounded-xl border[a-z0-9 /-]*' components | sort -u | wc -l   # target: 1

# off-scale spacing
grep -roh '\b[pmg][xytblr]\?-\(5\|7\|9\|10\|11\|14\)\b' components app | wc -l   # target: 0

# decision-grade text at caption size — xs should be the minority
grep -roh 'text-xs' components | wc -l
grep -roh 'text-sm' components | wc -l                             # sm > xs

# primitives actually adopted
grep -rl "from './ui'" components | wc -l                          # target: most components
```

**Pin what you fix.** A drift you correct without a check comes back. The suite-level target is that
these counts are asserted by a test, not re-measured by hand each run.

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
