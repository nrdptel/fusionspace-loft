# Loft — Competitive Ledger

**The purpose of this file is to make "compete with OpenRocket" a tracked gap instead of a mood.**

`MAINTAINING.md` sets the bar as "Loft has to feel like it belongs in that company" and the done-check
asks each run to benchmark one surface against a mature tool. Until this file existed, that benchmark
went into a chat report nobody read and nothing accumulated. Now it lands here, one row at a time, and
the rows are where `ROADMAP.md` milestones come from.

## How to use it

1. **Every run adds or resolves at least one row.** The done-check requires it. A run that benchmarks
   a surface and files nothing here did not benchmark it.
2. **A row is a claim until verified.** Rows marked `UNVERIFIED` are leads, not facts. Verify against
   the tool's own documentation, source, or a real run before you build against one — and change the
   marker when you do, with what you checked. Building a feature to match a competitor capability that
   was misremembered is the expensive version of the failure `MAINTAINING.md` already warns about.
3. **`Verdict` is a decision, and decisions are cheap to reverse but expensive to re-derive.** Use:
   - `GAP` — they have it, we want it, it is not yet on the roadmap.
   - `QUEUED` — on `ROADMAP.md`, with the milestone named.
   - `HAVE` — we do this, at least as well. Say what proves it.
   - `BETTER` — we do it better than they do. Say what proves it, because this is the claim that
     matters and the one most easily kidded about.
   - `REJECT` — deliberately not doing it. **Say why**, in one line. A rejection without a reason gets
     re-litigated every run.
4. **A `GAP` that survives two runs should become a milestone or a `REJECT`.** Standing gaps with no
   decision are how a competitive analysis turns into decoration.
5. **Never copy their code.** The CLEAN-ROOM invariant is absolute. This file tracks *capabilities and
   outcomes a flyer can see* — never implementation. Read published formats and papers; never
   GPL-licensed source.

## The field

| Tool | What it is | Why it matters here |
|---|---|---|
| **OpenRocket** | Free desktop design + simulation, Java, GPL | The default. The editor Loft's North Star #2 benchmarks against, and the format most flyers already have. |
| **RocketPy** | Python 6-DOF simulation library | The accuracy benchmark. Real atmospheric data, Monte Carlo dispersion, the physics ceiling to beat. |
| **RASAero II** | Windows aero prediction + flight sim | The supersonic and drag-accuracy benchmark; fin flutter. |
| **RockSim** | Paid desktop design + simulation | The commercial polish benchmark; `.rkt` is a format Loft ingests. |
| **SpaceCAD** | Paid desktop design | Another format, another editor idiom. |
| **ThrustCurve** | Motor database and API | The motor data source flyers expect to be complete and current. |

---

## Ledger

**Append at the bottom; the numbers are stable references and never renumber.** The header used to say
"newest first" while the table ascended 1..19 from the top, which two runs would have resolved two
different ways. A row's number is how `ROADMAP.md` and this file's own notes cite it, so it outlives its
position. `file:line` or a route where ours lives, so the comparison is reproducible.

| # | Tool | Capability | Where ours is | Verdict | Note |
|---|---|---|---|---|---|
| 1 | OpenRocket | **Tabbed workspace** — design, motors & configuration, flight simulations are separate tabs, each dense and complete | One scrolling page (`components/LoftApp.tsx`, 2577 lines) carries import, edit, simulate, sweep, Monte-Carlo and cross-check | `QUEUED` | P2 — Workspaces as routes. This is the single largest structural reason Loft reads as a demo rather than a tool. The PRODUCT SHAPE invariant already forbids the current shape. **Depends on P1** (row 21): converting surfaces onto shared primitives first means the split moves components rather than rewriting them, so P1's progress is partial payment on this row. |
| 2 | OpenRocket | **Component presets** — a database of real commercial parts (tubes, nose cones, couplers) by vendor and part number, picked rather than typed | Every dimension typed by hand | `GAP` | High leverage: a flyer building a real rocket is holding a catalogue part. Turns authoring from measurement into selection. Needs a licence-clean data source — verify before scoping. |
| 3 | OpenRocket | **Materials database** with density by material, so component mass is derived rather than entered | Mass entered or defaulted | `GAP` | Prerequisite for presets (2) being useful. Small, and it makes every mass number better grounded. |
| 4 | OpenRocket | **Printable templates** — fin planforms, centring rings and transition wraps exported to scale for cutting | Nothing | `GAP` | `UNVERIFIED` at the detail level; the capability exists. Genuinely differentiating and entirely client-side. A flyer prints these and builds against them. |
| 5 | OpenRocket | **Design warnings panel** — a standing list of what is wrong or questionable about the design, updated live | Validation exists but is not a persistent live panel over the design | `GAP` | Fits the SAFETY posture exactly: honest flags, no verdict. |
| 6 | OpenRocket | **Undo/redo across the whole design** | Shipped — `lib/model/history.test.ts`, 17 cases | `HAVE` | R2. Verified by e2e including gesture coalescing. |
| 7 | OpenRocket | **Component tree: add, remove, reorder, restack** | Add and remove shipped (R2, R3); reorder is R4 | `QUEUED` | R4. |
| 8 | RocketPy | **Monte Carlo dispersion with real atmospheric data** (reanalysis / forecast wind profiles), not a synthetic distribution | `components/MonteCarlo.tsx` runs dispersion; wind model is not real-data driven | `GAP` | The keyless-browser-API constraint makes this awkward but not impossible. North Star #1 work. Verify which sources are CORS-reachable and keyless before scoping. |
| 9 | RocketPy | **Full 6-DOF rigid body dynamics** | Loft's state is 6-DOF-*ready*; the solver is not yet 6-DOF | `QUEUED` | Named in the North Star. Belongs on the roadmap explicitly rather than as an aspiration — decompose when the fundamentals justify it. |
| 10 | RocketPy | **Sensitivity analysis** — which input drives the outcome | Parameter sweep exists (`components/ParameterSweep.tsx`); ranked sensitivity does not | `GAP` | Cheap on top of the existing sweep, and it is the question a flyer actually has. |
| 11 | RASAero II | **Fin flutter prediction** | Nothing | `GAP` | Safety-relevant and frequently asked. Must ship with its method cited and its envelope stated, or not at all. |
| 12 | RASAero II | **Validated supersonic drag** | Loft's drag model — see `/docs/limitations` | `GAP` | `UNVERIFIED` how large the gap is. Measure ours against RASAero output on a corpus design before scoping; the measurement is the increment. |
| 13 | RockSim / OpenRocket | **Unit preference honoured everywhere**, set once | Units control exists | `HAVE` | Confirm on every new surface — this is the kind of thing that regresses one component at a time. |
| 14 | All desktop tools | **The design is a file the flyer owns**, saved and reopened losslessly | `.ork` export exists and is known to drop `ballastKg` | `QUEUED` | R6. A builder whose output loses parts is worse than no export. |
| 15 | ThrustCurve | **Complete, current motor data** including updates | Bundled offline catalogue (`lib/motors/catalog.ts`) | `GAP` | Offline-first is correct and is a real advantage. The gap is staleness: nothing tells a flyer how old the catalogue is or refreshes it. Say the date at minimum. |
| 16 | OpenRocket, RockSim | **3D / photo-realistic view of the design** | 2D diagram (`components/RocketDiagram.tsx`) | `REJECT` for now | The 2D diagram is the direct-manipulation surface and it is not finished. 3D is decoration until the editor is complete; revisit after the P-track. |
| 17 | All | **Runs offline, installs, costs nothing, needs no account** | PWA, fully client-side, MIT | `BETTER` | Every desktop competitor is an install; RocketPy needs Python. This is Loft's genuine structural advantage and it is under-sold on the landing surface. |
| 18 | All | **Reads several design formats into one model** — `.ork`, `.rkt`, RASAero | `lib/ork`, `lib/rkt`, `lib/rasaero` | `BETTER` | No competitor reads its rivals' files. Under-sold: a flyer does not know this until they try. |
| 19 | All | **Shows another tool's stored results beside its own as a cross-check** | Import carries stored results through; `components/RocketpyCrossCheck.tsx`, `components/DragCrossCheck.tsx` | `BETTER` | North Star #1's differentiator, and nothing else in the field does it. Wants R10 to become a first-class view. |
| 20 | OpenRocket, RockSim | **A move that cannot be made is refused, and a move that can is re-checked.** Drag-drop reorder in the component tree has shipped in OpenRocket since 1.1.3 and is re-listed in 12.09 and 22.02; 22.02 also added tree context menus, multi-select copy/paste, and *"additional warnings for inline pods, gaps and overlaps in airframe"*. RockSim relocates a dragged part only *"if you dropped the component onto a valid location"* | Nothing reorders yet (`lib/model/edit.ts` places by anchor only), and `lib/validation/` carries no gap or overlap rule at all | `QUEUED` | R4. This is the half of row 7 that row 7 does not name: reorder is not the mechanic, it is the mechanic **plus** a legality rule and a post-move airframe re-check. Verified from OpenRocket's own `ReleaseNotes.md`, its wiki Tips page, and the readthedocs getting-started layout. What either tool SHOWS on a refused drop is `UNVERIFIED` — OpenRocket's docs describe disabled add-buttons for an invalid parent but say nothing about drag feedback, and RockSim's sentence implies a silent snap-back. So the differentiating move is not catching up: it is a drop that says **why** it cannot land there. |
| 21 | OpenRocket | **One look-and-feel engine driving every surface, with density as a user-adjustable global.** 22.02 shipped dark mode (normal and high-contrast) and custom UI font size; 24.12 moved every theme onto one engine and added UI Scale, Font Size and Character Spacing | `components/ui.tsx` is the token layer and P1 is converting onto it; 11 of 23 components import it, 9 of those import only `Card` | `QUEUED` | P1, then P2. Verified from `ReleaseNotes.md`. The bar a mature hobby sim sets is not "consistent-looking" — it is one engine, tweakable globally, which is exactly P1's "extraction, not a repaint". It also says the tokens must be a single source rather than per-component class strings. RockSim has no documented equivalent (`UNVERIFIED`). |

---

## Standing conclusion — where Loft actually wins

Keep this honest and current; it is what the landing surface and the README should say, and right now
they do not say it.

1. **Nothing to install, nothing to pay, nothing to sign up for, and it works offline.**
2. **It reads the file you already have** — whichever tool made it.
3. **It shows you more than one answer** — its own, the file's, an external oracle's — and flags
   disagreement instead of hiding it.

Where it loses today: the editor is younger than OpenRocket's, there is no parts or materials
catalogue, the physics is not yet 6-DOF, and — the one a flyer sees first — **it is shaped like one
long page instead of an application.**
