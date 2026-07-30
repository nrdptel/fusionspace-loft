# Loft — Product Roadmap

**This file is the work queue.** `BACKLOG.md` is a defect ledger, not a plan — it records what is
wrong, and left to itself it will absorb every run, because a real corpus and a real UI produce
defects faster than anyone fixes them. What Loft still cannot DO lives here.

Read this at session start, alongside `HANDOFF.md`. Unless the owner names something else, the next
unstarted milestone below is the run's goal. See *Each pass* in `MAINTAINING.md` for how defect work
preempts it (Sev-1 only) and how much of a run it may take (one increment in four).

One milestone at a time, in order. Do not skip ahead: each one is a prerequisite for the next, and
that is why they are ordered rather than listed. A milestone is finished when a flyer can do the
thing — not when the code exists.

**This file is the run's only state.** The prompt is deliberately stateless — it says "the next
unstarted milestone", never a number — because the same prompt is run for a week or two unattended and
a prompt naming R1 is wrong the day R1 ships. So the `Status:` lines below are the baton. Update them
in the same commit as the work, never in a later one.

**Status vocabulary**, and nothing else: `NOT STARTED` · `IN PROGRESS` · `SHIPPED <date> — <pinning
check>`. A milestone may only be marked `SHIPPED` once an automated check exists that fails if the
capability regresses; name that check on the status line. This is what stops one run believing a
milestone is done and the next redoing it. Where a *done when* truly cannot be automated, mark it
`SHIPPED <date> — NOT PINNED: <reason>` so the gap is visible rather than implied.

---

## Where the editor actually is (measured, 2026-07-29)

Loft is a **parametric tweaker over a fixed component tree**. That is the honest description, and it
is the gap.

- **24 editable fields**, all of them modifiers on parts that already exist: `finSpan`, `finCount`,
  `noseLength`, `noseShape`, `bodyLength`, `bodyDiameter`, `boattailLength`, `payloadMassKg`, and so
  on (`GeometryEdits` in `lib/model/edit.ts`).
- **Components are addressed by ROLE, not identity.** `primaryNose`, `primaryBodyTube`,
  `primaryFinSet` — "the" nose, "the" body tube. Fin sets alone carry an id (`finSetId`), added
  recently, which is the pattern the rest should follow.
- **Zero structural mutation.** Nothing in `lib/` or `components/` adds, removes, inserts, or
  reorders a component. Verified by search, not assumption.
- **"Start fresh" exists but is not authoring.** `lib/model/starter.ts` hands over a fixed starter
  rocket that flies immediately — deliberately, so nobody stares at a blank slate. But the flyer can
  only turn its 24 knobs. They cannot give it a second body tube, a transition, a payload bay, another
  fin set, or another stage.

So a flyer can change a rocket's **dimensions** and cannot change its **topology**. Every milestone
below is about closing that.

### The architectural pivot, named up front

`GeometryEdits` is a **flat patch of 24 optional scalars**. That shape cannot express "add a body
tube" — there is no field for a part that does not exist yet, and no way to say *which* of three
tubes. Structural editing needs edits that are **operations on a component tree** (`insert`, `remove`,
`move`, `set` — each addressing a component id), not a patch of named roles.

This is the hard part of R1 and R2, and it is worth doing properly rather than bolting a second
mechanism beside the first. Both importers and the builder must keep producing the one internal
`Rocket` model the solver consumes. Expect the flat patch and the operation list to coexist for a
while: keep the 24 fields working while the operation path grows underneath, and retire them only
when the new path covers them.

---

## R1 — Address components by identity, not by role

**Status:** SHIPPED 2026-07-30 — pinned by `lib/model/edit.test.ts` (the `body tubes are addressed by
identity`, `the recovery fields address the canopy you picked`, `aimEditsAt`, `naming the part the fields
are holding` and `the aim registry is the one list` suites) and by three e2e cases in `e2e/smoke.spec.ts`:
*picking a body tube aims the body fields at it*, *a body-tube pick survives a re-fly and a reload*, and
*picking a canopy aims the recovery fields at it*. Every one was proved able to fail by a negative control
with its BUILD_EXIT checked.

**Outcome.** The editor edits the part the flyer picked, on every design, including ones with several
tubes, transitions, or fin sets.

**Done when** a flyer can open `Two stage high power rocket.ork` or
`Pods--airframes and winglets.ork`, click any body tube or fin set on the diagram, and edit *that*
one — with the panel naming which part it is holding, and the selection surviving a re-fly and a
reload.

**Notes.** Extend the `finSetId` / `selectedFinSetId` pattern to nose, tubes, transitions and mass
objects. This ships visible value on multi-part designs (today they silently edit the frontmost part)
while being the prerequisite for everything after it. `primaryFinSetName`'s positional fallback has a
known defect filed in `BACKLOG.md` — fix it here, since this milestone owns that code.

**Size.** 2–4 increments. **Took 4.**

**What shipped against the *done when*.** A flyer can open `Two stage high power rocket.ork`, click any
of its 8 body tubes or either fin set on the diagram or in the parts list, and edit *that* one; the panel
names which part it is holding; and the aim survives a re-fly and a reload. Measured on that design:
8/8 tubes clickable, 8/8 edits landing on exactly the picked tube, each named by the design's own name
("Payload Bay", "Sustainer Forward Airframe", …). Canopies came too — 17 of 35 designs carry more than
one and the drogue was unreachable on all of them.

**The gap, which is R2's starting point rather than a reason to re-open this.**

- **`Pods--airframes and winglets.ork` is only partly reachable, and not for an editor reason.** The file
  declares 3 body tubes, 3 nose cones and 6 fin sets; the importer carries through 1, 1 and 5, because
  `<podset>` assemblies are not simulated. That omission is already disclosed at import ("This design has
  pods, which aren't simulated yet — only the primary stack was flown"), so nothing is silently missing —
  but a part that is not imported is not a part a flyer can click. Pods are an ingestion feature, and they
  belong on the roadmap in their own right rather than inside an editor milestone.
- **Nose cones, transitions and mass objects are still role-addressed.** Deliberate, and measured: no
  corpus design has more than one nose cone after import, so a `noseId` would address nothing; and
  transitions (7 designs) and mass objects (15) have no editor field at all, so there is nothing yet to
  aim. They arrive with the field that edits them, which is R3/R4 work.
- **A field holds one value, so picking another part of the same kind re-aims a live edit onto it.**
  Inherent to a flat patch of absolute values and identical on fins, which shipped earlier. It is visible
  rather than silent — the panel names the part it is holding — and it is what R2's operation list makes
  go away.
- **A from-scratch design's component ids do not survive a reload.** Measured: the starter's ids are
  `nose`, `body`, `av`, `chute`, `mount`; a built design's session bytes are `exportOrk(document)`, which
  writes freshly minted `10f70000-…` ids, so the re-imported model carries different ids and a stored aim
  matches nothing. Harmless today because the starter has one tube and one fin set, and a hard blocker for
  R2: an operation list addresses ids. **Fix this first in R2.** Filed in `BACKLOG.md` with the probe.

---

## R2 — Delete a component, and undo it

**Status:** SHIPPED 2026-07-30 — pinned by `lib/model/edit.test.ts` (the `removing a component`,
`a removal cannot re-land an edit on a different part` and `the last body tube is counted per STAGE` suites),
`lib/model/edit-history.test.ts` (14 cases over undo, redo, coalescing and the bounded stack) and
`lib/model/id.test.ts` (identity through a save, which the operation had to stand on). Five e2e cases:
*removing a part re-flies the design, and the removal is undoable*, *the last body tube cannot be removed, and
it says why*, *a typed edit and a drag are both undoable, and redoable*, *Reset to as-designed is no longer a
one-way door*, and *Ctrl+Z steps back a change made on the diagram*. Every one was proved able to fail by a
negative control with its BUILD_EXIT checked.

**Outcome.** The flyer can remove a part and watch the flight answer change.

**Done when** a flyer can select a fin set, a mass object, or an aft body tube, delete it, see
stability, dry mass and apogee move, and undo the deletion back to the exact prior model — and when
deleting the last body tube is refused with a sentence saying why rather than producing a rocket that
cannot fly.

**Size.** 3–5 increments. **Took 4.**

**What shipped against the *done when*.** All of it, and walked on real corpus designs rather than only on
fixtures: a **mass object** removes and restores by name on `USLI2025-FULLSCALE-10.15 (2).ork` (7 → 6), an
**aft body tube** on `03.Three-stage.ork` (still flies, 1,483 m), a **fin set** in the e2e with the static
margin measured before and after. Undo returns the exact prior model — the test asserts structural equality,
not just the visible numbers — because the model is rebuilt from the pristine design plus the edit bag.

Undo went wider than the *done when* asked, and the milestone's notes are why: "undo/redo over the operation
list is the whole reason to have an operation list." It covers **every** edit now, not just removals — a
typed dimension, a drag handle, a motor swap, and "Reset to as-designed" itself.

**The gap, which is R3's starting point rather than a reason to re-open this.**

- **Six review findings are filed in `BACKLOG.md`, none of them a wrong number a flyer would act on.** The
  sharpest: the parameter sweep resolves its axes from the PRISTINE design, so an axis outlives the part it
  varies and plots a flat line as a response curve. It wants the shown rocket threaded into the sweep, which
  is its own increment.
- **A nose-less design is flown at a fineness-3 ogive's nose drag.** `lib/sim/aero.ts` has no flat-face term.
  Reachable by a deliberate act now that a nose can be removed, so it is stated on `/docs/limitations`
  instead of left implicit — but it is real optimism in a number, and it belongs in the aero work R9 holds.
- **The operation model is a removal list, not a general `insert`/`move`/`set`.** That is deliberate and
  sufficient here: removals are the only structural operation R2 needs, and an ordered list of them IS an
  operation list with undo over it. R3 (add) and R4 (reorder) are where the other operations arrive, and the
  history module is already general over the whole bag rather than over removals.

---

## R3 — Add a component

**Status:** NOT STARTED

**Outcome. The milestone that makes Loft a builder.** The flyer can grow an airframe that did not
come from a file.

**Done when** a flyer can start from the starter design, add a second body tube, a transition, a fin
set and a mass object, place each at a station by direct manipulation, fly the result, and have the
stability and mass panels describe the rocket they just built.

**Notes.** Needs a placement model (where does a new part go, and what happens to the parts aft of
it), sane material and dimension defaults inherited from the neighbouring part, and a refusal path
for a geometry that cannot fly. Resist a modal wall of number fields: the add gesture belongs on the
diagram, with the numbers as confirmation.

**Size.** 5–8 increments.

---

## R4 — Reorder and restack

**Status:** NOT STARTED

**Outcome.** Nose-to-tail order is editable, not fixed at import.

**Done when** a flyer can drag a component along the airframe and drop it between two others, the
station arithmetic of everything aft follows, and the diagram never shows a part overlapping another.

**Size.** 3–5 increments.

---

## R5 — Author a staged rocket

**Status:** NOT STARTED

**Outcome.** Multi-stage designs can be built, not only imported.

**Done when** a flyer can add a booster stage to a single-stage design, give it its own motor mount
and fins, and fly a staged flight whose phase table matches what they built — and remove that stage
again.

**Notes.** The solver already flies staged designs and rebuilds per-phase geometry from a sub-rocket,
so this is an authoring milestone rather than a physics one. Confirm that before scoping it.

**Size.** 4–6 increments.

---

## R6 — A built design leaves Loft intact

**Status:** NOT STARTED

**Outcome.** What a flyer builds is theirs to keep and to take elsewhere.

**Done when** a design authored in Loft round-trips: export it, re-import it, and get a
byte-equivalent internal model with every authored part, material and mass surviving — asserted by a
test, not by eye.

**Notes.** `downloadOrk` exists and is known to drop `ballastKg` (filed in `BACKLOG.md`). A builder
whose output loses parts is worse than no export, so this milestone is where that gets fixed and
pinned.

**Size.** 2–4 increments.

---

## After R6 — extend this file yourself, in this order

**Do not ask which of these to do, and do not fall back to the defect ledger because the list above
is finished.** When R6 ships, take R7 from the order below and decompose it here to the same shape as
R1–R6 — outcome, *done when*, size, notes — then start it. That decomposition is one increment's work
and it IS the work when the roadmap is dry. The order is a standing decision, changeable by the owner
at any time; absent that, it holds.

**R7 — A touch-native builder.** R1–R6 target the desktop workbench, where direct manipulation is
precise. A thumb at the range is a different tool, and `MAINTAINING.md`'s two-form-factor rule says it
gets its own considered design rather than a rescaled one. Decompose it by asking what a flyer needs
to DO at the pad — pick a motor, check stability, sanity-check a delay — not by auditing the desktop
layout at 390 px. First it is a capability question; hit targets are the finish, not the substance.

**R8 — Workspaces as routes.** Split the single scrolling page into distinct static routes per job:
import, build, simulate, sweep, validate. This ships little visible capability by itself, which is why
it is not first — but by R7 the builder will have made the main page unmanageable, and that is the
moment it pays for itself. Multi-view is multi-route, never multi-server.

**R9 — Per-set fin drag, and the honest aero the builder needs.** Once a flyer can add fin sets, the
model that collapses every set into one equivalent fin is no longer a modelling nicety — it is wrong
about a rocket they just built. The measurement is already in `BACKLOG.md`: t/c of 1.00 on a real
file, an unswept flag on 44.5° fins, and a naive area-weighted fix that doubles the error on a
six-set design. Also the unread `<overridecd>` and fin-tab tags.

**R10 — The multi-solver cross-check as a first-class view.** North Star #1: Loft's result beside the
file's own stored numbers and an external oracle's, agreement building confidence and disagreement
flagged rather than hidden. Wants R8's routes to live on.

Beyond R10, decompose from the North Star in `MAINTAINING.md` and record why you chose what you chose.

---

## Decisions taken without the owner

Unattended runs do not stop to ask (see *Unattended operation* in `MAINTAINING.md`). Every decision
that would otherwise have been a question goes here, with the option rejected, so it can be reversed
cheaply instead of re-derived. Newest first.

- **2026-07-30 — R1 aimed body tubes, fin sets and canopies, and deliberately NOT nose cones,
  transitions or mass objects.** R1's notes named "nose, tubes, transitions and mass objects". Measured
  after import across the 35-design corpus: 23 designs carry several body tubes, 17 several parachutes,
  13 several fin sets — and **0** carry more than one nose cone. Rejected adding a `noseId`: it is a
  mechanism with nothing to address, and the count is what decides that, not the symmetry of the list.
  Transitions (7 designs) and mass objects (15) were rejected for a different reason: no editor field
  addresses either, so aiming precedes the thing being aimed. Parachutes replaced them in the slice
  because they were the widest-reaching case of all and they move landing speed and landing energy.
- **2026-07-30 — the aim of each role is its own field, not one shared selection.** Rejected a single
  `selectedId`: with edits keyed only by role, picking a body tube would move the one aim off the fin set,
  and an absolute fin span already typed would then resolve against a tube — the field blanks while the
  value goes on being flown. The per-role aims are what let a flyer read one part while editing another,
  and there is an e2e pinning exactly that. The cost is one registry row per role, and `AIM_SLOTS` is the
  registry so it is one row and not four hand-maintained lists.
- **2026-07-30 — pins live in committed fixtures, never in `corpus/`.** A test reading `corpus/` fails
  with ENOENT wherever the corpus is absent — every fork, every public clone — so it cannot be a
  milestone's proof. Rejected pinning R1 on the two designs its *done when* names; the corpus measurement
  is quoted in the test's comment and the assertion runs on `fixtures/demo-quirks.ork` and
  `e2e/fixtures/two-stage-firm-booster.ork`, which reproduce the same shape.
- **2026-07-29 — the `e2e` CI job is left without a corpus fetch.** `FIXTURES_TOKEN` is set and the
  `frontend` job now fetches and gates on all 35 real designs, but the `e2e` job still has no fetch
  step, so e2e tests continue to need committed fixtures. Adding it is two lines. Rejected doing it
  now: no e2e test uses a corpus design, so the step would enable nothing today, and shipping a CI
  step that changes no outcome is exactly the speculative work `MAINTAINING.md` forbids. Whichever
  test first needs a real design should add the step *and* skip itself when the corpus is absent —
  without that, every fork's CI goes red, since forks have no secret.
- **2026-07-29 — R1–R6 ordered editor-first, structural before visual polish.** The owner chose
  "in-browser builder/editor" as the milestone and a Sev-1-only defect quota; the decomposition into
  six milestones, their order, and their sizes are mine. Rejected: starting at R3 (add a component)
  because it is the milestone that visibly makes Loft a builder — but it needs identity-addressed
  components and an operation-based edit model underneath, so starting there would have meant building
  both anyway with no shippable increment for several passes.
- **2026-07-29 — the post-R6 order above (touch builder, then routes, then aero, then cross-check).**
  Rejected: routes first, which is more architecturally tidy but ships nothing a flyer can see, and
  the whole point of this file is that a run ends with a capability.

---

## Keeping this file honest

- **Update the `Status:` line in the same commit as the work.** It is the only thing telling the next
  run where the baton is, and a status updated "later" is a status the next run reads wrong.
- When a milestone ships, mark it `SHIPPED <date> — <pinning check>` and say what it actually delivered
  versus its *done when*. The gap is the next session's first increment — work it forward rather than
  re-opening the milestone.
- A defect found while building goes to `BACKLOG.md` unless it is Sev-1 or blocks the milestone.
  Filing it is not deferring the work; absorbing the run into it is.
- If a milestone turns out wrongly ordered or wrongly sized, re-order or re-split it here and say why,
  in *Decisions taken without the owner*. Discovering that is progress; the next run should inherit it
  rather than rediscover it.
- **This file must never be dry.** If the last milestone is `SHIPPED`, decomposing the next one is the
  run's first increment. A dry roadmap is not permission to go back to the defect ledger.
