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

**Size.** 2–4 increments.

---

## R2 — Delete a component, and undo it

**Outcome.** The flyer can remove a part and watch the flight answer change.

**Done when** a flyer can select a fin set, a mass object, or an aft body tube, delete it, see
stability, dry mass and apogee move, and undo the deletion back to the exact prior model — and when
deleting the last body tube is refused with a sentence saying why rather than producing a rocket that
cannot fly.

**Notes.** The simplest structural operation: nothing new to author and no placement question, so it
is where the operation-based edit model gets built and proven. **Undo ships with it, not after it** —
parametric edits are recoverable by retyping a number, and a deletion is not. Undo/redo over the
operation list is the whole reason to have an operation list.

**Size.** 3–5 increments.

---

## R3 — Add a component

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

**Outcome.** Nose-to-tail order is editable, not fixed at import.

**Done when** a flyer can drag a component along the airframe and drop it between two others, the
station arithmetic of everything aft follows, and the diagram never shows a part overlapping another.

**Size.** 3–5 increments.

---

## R5 — Author a staged rocket

**Outcome.** Multi-stage designs can be built, not only imported.

**Done when** a flyer can add a booster stage to a single-stage design, give it its own motor mount
and fins, and fly a staged flight whose phase table matches what they built — and remove that stage
again.

**Notes.** The solver already flies staged designs and rebuilds per-phase geometry from a sub-rocket,
so this is an authoring milestone rather than a physics one. Confirm that before scoping it.

**Size.** 4–6 increments.

---

## R6 — A built design leaves Loft intact

**Outcome.** What a flyer builds is theirs to keep and to take elsewhere.

**Done when** a design authored in Loft round-trips: export it, re-import it, and get a
byte-equivalent internal model with every authored part, material and mass surviving — asserted by a
test, not by eye.

**Notes.** `downloadOrk` exists and is known to drop `ballastKg` (filed in `BACKLOG.md`). A builder
whose output loses parts is worse than no export, so this milestone is where that gets fixed and
pinned.

**Size.** 2–4 increments.

---

## After R6

Not scheduled, and deliberately not decomposed yet — decompose whichever the owner picks, the way the
editor is decomposed above:

- **A touch-native builder.** R1–R6 target the desktop workbench, where direct manipulation is
  precise. A thumb at the range is a different tool; per `MAINTAINING.md`'s two-form-factor rule it
  gets its own considered design rather than a rescaled one. Ask what a flyer needs to DO at the pad
  before shaping it.
- **Workspaces as routes.** Splitting the single scrolling page into distinct static routes per job.
  Unblocks parallel authoring, ships little visible capability alone — best folded into whichever
  milestone next makes a page unmanageable.
- **Deeper physics and the multi-solver cross-check.** North Star #1: per-set fin drag (see the
  measured fin-set entry in `BACKLOG.md`), the unread `<overridecd>` and fin-tab tags, and presenting
  Loft's result beside the file's own and an external oracle's.

---

## Keeping this file honest

- When a milestone ships, mark it and say what it actually delivered versus its *done when* — the gap
  is the next session's starting point.
- A defect found while building goes to `BACKLOG.md` unless it is Sev-1 or blocks the milestone.
  Filing it is not deferring the work; absorbing the run into it is.
- If a milestone turns out to be wrongly ordered or wrongly sized, re-order it here and say why.
  Discovering that is progress, and the next session should inherit it rather than repeat it.
