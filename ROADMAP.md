# Loft — Product Roadmap

**This file is the work queue.** `BACKLOG.md` is a defect ledger, not a plan — it records what is
wrong, and left to itself it will absorb every run, because a real corpus and a real UI produce
defects faster than anyone fixes them. What Loft still cannot DO lives here.

Read this at session start, alongside `HANDOFF.md`, `DESIGN.md` and `COMPETITION.md`. See *Each pass*
in `MAINTAINING.md` for how defect work preempts a milestone (Sev-1 only).

## Two tracks, and a run ships from both

**The queue has two tracks, and they alternate.** This replaced a single capability-only queue on
2026-07-30, for a measured reason: the R-track shipped three milestones in two sessions and the app
still read as one long scrolling page with twelve different card treatments on it. Capability was
never the bottleneck. **What a flyer can do** and **what the tool feels like to use** are different
work, and a queue containing only the first can only ever ship the first.

- **R-track — capability.** What a flyer can DO that they could not before. R1–R3 shipped; **R4 is IN
  PROGRESS** (increment 1 of 3 shipped 2026-07-31).
- **P-track — product and craft.** What makes it a tool a stranger picks up, trusts, and keeps using:
  shape, design system, first run, form factor, documentation, discoverability.

**A run takes the next unstarted milestone from EACH track, and ships both.** Not one or the other.
Start with whichever is smaller so something lands early, then take the other. If a run has time for
only one, take the P-track milestone — the R-track has three shipped milestones of momentum and the
P-track has none, and that imbalance is the thing being corrected.

A milestone from either track is finished when **a flyer can do the thing, or see the difference** —
not when the code exists. Within a track, do not skip ahead: each is a prerequisite for the next.

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

**Status:** SHIPPED 2026-07-30 — pinned by `lib/model/id.test.ts` (ids survive an export/re-import round
trip), `lib/model/edit.test.ts` (the `removing a component`, `a part that is not a part` and `what states a
part's mass` suites), `lib/model/history.test.ts` (17 cases over the undo stack), `lib/corpus/sweep.test.ts`'s
*never lets a removal leave a design with no mass, and says so when it moves none* (536 removable parts across
all 35 real designs, and it skips itself where the corpus is absent), and nine e2e cases in
`e2e/smoke.spec.ts`: *removing a part re-flies the design, and the removal is undoable*, *the last body tube
cannot be removed, and it says why*, *a typed dimension is undoable, and redoable*, *one undo takes back a
whole gesture, not one frame of it*, *one undo never takes back two gestures on two different parts*,
*clearing every what-if is itself undoable*, *the keyboard shortcut undoes, and leaves a text box's own undo
alone*, *a removal the design's own stated weight swallows says so, before and after the click*, and *the
point mass that IS a RASAero design's weight cannot be removed, and it says why*. Every one was proved able
to fail by a negative control with its BUILD_EXIT checked.

**Outcome.** The flyer can remove a part and watch the flight answer change.

**Done when** a flyer can select a fin set, a mass object, or an aft body tube, delete it, see
stability, dry mass and apogee move, and undo the deletion back to the exact prior model — and when
deleting the last body tube is refused with a sentence saying why rather than producing a rocket that
cannot fly.

**Notes.** The simplest structural operation: nothing new to author and no placement question, so it
is where the operation-based edit model gets built and proven. **Undo ships with it, not after it** —
parametric edits are recoverable by retyping a number, and a deletion is not. Undo/redo over the
operation list is the whole reason to have an operation list.

**Id stability is DONE** — it was R2's first increment, because an operation list keyed on ids that change
underneath it is not a foundation. `lib/ork/export.ts` writes each component's own id instead of minting a
fresh one; the starter's six ids are literal UUIDs so they are writable; and `lib/model/id.ts` derives a
stable UUID for the positional ids the adapters fall back to and for the ids a structural add mints. Pinned
by `lib/model/id.test.ts`, which asserts the round trip preserves identity, that a stored aim still resolves
through it, and that nothing Loft writes into `<id>` can be malformed.

**Undo over the whole edit history is DONE.** `lib/model/history.ts` is a pure, generic snapshot stack:
every what-if is already a value in one bag applied to a pristine design, so a step is a copy of that bag
and there is nothing to diff or invert. What it adds is what a bare stack does not give you — a LABEL
("Undo removing Payload Bay"), RUN COALESCING so one drag of a diagram handle is one undo rather than the
two hundred frames it fired, and a depth cap. `WhatIf` carries the weather, the scenario and the motor
configuration alongside the edits, because three controls move more than the edit bag in a single act and
an undo that restored two of the three would hand back a rocket that never existed. Two limits, both
disclosed on `/docs/limitations`: 100 steps, and the stack does not survive a reload.

**The mass-object leg is DONE, and it was not a walk — it was two defects**, both found by driving all
56 mass objects in the corpus through the delete surface, and both fixed and pinned:

1. **Removing the mass object a RASAero import synthesises zeroed the airframe.** Every `.CDX1` import
   mints one `masscomponent` named "Airframe (stated launch weight)" carrying the whole airframe mass,
   because the format states one launch weight and no per-part masses and the internal model has nowhere
   else to hold it. Nothing refused removing it: `Show-off.CDX1` went from 453.6 g dry to **0.0 g** with
   its CG pinned at the nose tip, and `Complex.Two-Stage.CDX1` flipped from +1.78 cal to **−0.92 cal**
   and still reported a confident 1,423 m. 3 of the 4 RASAero designs were in that state. The model now
   marks such a point mass `standsForAirframe` and `removalRefusal` refuses it in a sentence — the same
   class as the last body tube, a structural impossibility rather than an unwise choice. Re-driven after
   the fix: **52 mass objects still removable, 0 leaving a weightless design.**
2. **On a stage-override design a removal sheds no mass at all, and nothing said so.** Where a stage
   carries `overrideMass` + `overrideSubcomponents` the lumped mass is fixed while its CG is recomputed
   from what is left, so removing `EscapeVelocity.ork`'s 141.7 g "Avionics" leaves dry mass at exactly
   2000.0 g while the margin moves 4.461 → 4.312 cal. The model is right — that is what an override
   means — so the fix is the sentence, not the number: `statedMassHolder` names the assembly or stage
   whose stated weight covers a part, the parts panel says so **before** the click, and the mass panel
   says so after, mirroring the notice the add side already had. Re-driven: **1 of 52 removals sheds no
   mass, and it is disclosed.**

Pinned by `lib/model/edit.test.ts` (`a part that is not a part`, `what states a part's mass`) and the
e2e cases *a removal the design's own stated weight swallows says so, before and after the click* and
*the point mass that IS a RASAero design's weight cannot be removed, and it says why*.

**What the *done when* actually did, walked in the built export on a real design.**
`Simulation scripting.ork` — 1 stage, 4 fin sets, 2 mass objects, 3 body tubes, flying 2,348 m at 2.09 cal
on 7.012 kg dry:

| removed | apogee | margin | dry | undo |
|---|---|---|---|---|
| fin set "CONTROL" | 2,458 m | 3.08 cal (flagged HIGH) | 6.957 kg | back to the exact prior model |
| mass object "Nose cone payload" | 2,399 m | 1.58 cal | 6.362 kg | back to the exact prior model |
| aft body tube | no flight, and it says why | — | 4.672 kg | back to the exact prior model |

The aft tube is the interesting one: it carries the motor mount, so removing it leaves a design with no
propulsion — which Loft reports as such rather than inventing a flight for it, exactly as the removal rules
already say it should. On that same design, taking tubes away until one is left refuses the last with
*"This is the only body tube left, and an airframe needs one…"*.

**The gap, which is R3's starting point rather than a reason to re-open this.** Undo is a stack of edit-bag
snapshots, not an operation list. It delivers everything R2's *done when* asks and it is the right shape for
a flat patch — but R3 adds parts, and "add" is the first edit that cannot be expressed as a value in that
bag. The snapshot stack survives the transition unchanged (a snapshot of an operation list is still a
snapshot); what does not is `GeometryEdits`. Two smaller gaps, both filed with measurements in `BACKLOG.md`:
the gesture boundary is still inferred from a clock rather than taken from the drag handle's own
pointer-down/up, and a rename is the one header control that is not on the stack.

**Size.** 3–5 increments. **Took 4.**

---

## R3 — Add a component

**Status:** SHIPPED 2026-07-30 — pinned by `lib/model/edit.test.ts`'s `adding a component` (11 cases),
`authoring a transition` (7) and `authoring a mass object` (4) suites, by `what an aim moving off a part
invalidates` (2), by `lib/corpus/sweep.test.ts`'s *never authors a part that opens a step, floats outside
its host, or cannot be taken back* — which drives **180 authored parts across all 35 real designs** and
skips itself where the corpus is absent — and by six e2e cases: *a flyer can add a body tube the design
never had, and take it back*, *a flyer can add a second fin ring, and the stability panel describes it*,
*a flyer can add a tail cone the design never had, shape it, and take it back*, *a flyer can add a mass
object, weigh it, and slide it along the airframe*, *a mass object can be slid along the airframe on the
diagram, not only typed*, and *the parts panel says where the airframe steps, and how far*. Every one was
proved able to fail by a negative control applied inside the function under test, with its BUILD_EXIT
checked. The operation model is in and **all four kinds its *done
when* names now ship**: a flyer can author a **body tube** behind any tube, a **fin set** onto any tube, a
**transition** behind any tube, and a **mass object** inside any tube, from the diagram or the parts list — and each flies, weighs, draws,
exports, is aimable, is removable and is undoable by name. The fin ring is cloned from the design's own
set rather than derived from invented proportions, which is the only default that is a fact about the
rocket rather than a number somebody chose; all 35 corpus designs carry a set and so does the starter, so
a source always exists. Pinned by `lib/model/edit.test.ts`'s `adding a component` suite (11 cases) and the
e2e cases *a flyer can add a body tube the design never had, and take it back* and *a flyer can add a
second fin ring, and the stability panel describes it*. A tube's length is now draggable on the diagram
too — the one airframe dimension that had no grip — pinned by *a tube's length can be dragged on the
diagram, not only typed*, and a mass object's station is draggable on the diagram too — pinned by *a mass
object can be slid along the airframe on the diagram, not only typed*.

**The transition leg is DONE**, and it brought transitions into the editor at all — they were
role-addressed, unaimable and had no field, so on the 12 of 35 corpus designs that carry one (25 in
total) not a single one could be touched. `AIM_SLOTS.transitionId` aims a `transitionLength` and a
`transitionAftDiameter` at the picked one; the exit is applied AFTER the whole-airframe caliber scale, so
an absolute diameter typed there is the one flown even when `bodyDiameter` is also set.

The authored transition's exit is decided by the airframe and never invented. Driving all **91** body
tubes across the starter and the corpus found exactly three positions an anchor can be in, and the first
version of the default was wrong on 38 of them:

| position | n | what it builds |
|---|---|---|
| nothing behind the anchor | 28 | a tail cone, contracting to the corpus median 0.7446 of its fore diameter over γ = 2.2938 |
| a part behind it at another caliber | 17 | fairs exactly to that part, closing a step the design already had |
| a part behind it at the same caliber | 46 | straight through — contracting here opened a step at the joint BEHIND the new part |

That last row is the measurement worth keeping: a contraction there produced a stepped airframe nobody
drew on half the positions the gesture is offered. A zero-taper transition is not a contrivance to avoid
it — 4 of the 25 corpus transitions are exactly that, a section in the mould line. Re-driven after the
fix: 91/91 build, 91/91 removable, 91/91 aimable, **0 open a step**. On the starter a tail cone buys
**+29.33 m** of apogee (993.64 → 1022.97 m) for +12.58 g.

**The census above is the CORRECTED one, and the correction is the interesting part.** `nextTopLevel`
originally searched a single stage's top-level list, so the last tube of a booster read as having nothing
behind it and the gesture built a contracting tail cone in the MIDDLE of a multi-stage rocket. Measured:
all 12 stage boundaries in the corpus are joined end to end with no gap, 10 of the 91 anchors were
mis-read, and 10 authored transitions opened a real step — the worst 77.4 mm on `02.Two-stage.ork`. The
same bug made `mouldLineStep` silent at every one of those 12 boundaries, including the 82.55 mm step
that is the largest in the corpus and the one the docs quote. Found by the pre-push review, not by the
gate.

**And the step itself is now stated.** Loft models a transition's own slope (Niskanen eq. 3.86 for a
shoulder, 3.88 for a boattail) and has **no drag term at all for a bare radius step**, which has no length
to take an angle over — OpenRocket warns on exactly this and Loft never said a word. `mouldLineStep` names
the step behind the picked part and the panel says by how much and that the drag there is optimistic. It
is not a state the editor invents: **33 of the 115** joints it can judge already step, in 13 of the 35
designs, by a median 11.75 mm of diameter and up to 82.55 mm. The notice fires above 0.5 mm, which is read
off the data rather than chosen: the 33 fall into six of 0.0004–0.292 mm (rounding artefacts of designs
stated in inches) and 27 of 0.800 mm and up, median 12.70 mm, with nothing in between.

**The mass-object leg is DONE.** A point mass is the dominant non-structural weight on most designs and
the one kind whose placement IS a station — it mounts INSIDE the part that carries it, which 56 of the 56
corpus mass objects do (none is a top-level stage child). Both defaults are the corpus's medians: the
weight is 45 g (the median of the 52 that are real parts rather than a stated airframe weight; q25 5 g,
q75 498 g) and the station is 0.3251 of the host's length — the median offset among the 16 placed `top`
inside a body tube, and where an av-bay actually sits. `top` rather than `absolute` (12 of 56) because an
absolute station pins a mass in space while the airframe moves underneath it.

`AIM_SLOTS.massObjectId` aims a `massObjectMass` and a `massObjectStation` at the picked one — 26 of 35
designs carry a mass object and not one could be reached before. The station is expressed as a station
from the nose tip, which is what a flyer reads off the diagram, and clamped into the part holding it: a
point mass outside the airframe would still be FLOWN, since the solver puts mass wherever the tree says.
The fallback deliberately skips a point mass that stands for a whole airframe's stated weight — on 3 of
the 4 RASAero designs that is also the heaviest thing in the model, so an unguarded "heaviest" would land
on it every time and offer a design's own measurement as a what-if.

Driven across all 91 body tubes in the starter and the corpus: 91/91 build, 91/91 removable, 91/91
aimable, **0 placed outside the part holding them**, station median 0.3251 of the host. **10 of the 91 add
no mass at all** — the design states that assembly's weight as a whole — and that is now said on the
parts panel before the click and on the mass panel after it, where only the removal half was stated
before.

**The shape, decided and shipped.** `GeometryEdits.added` is an ordered list of `AddedPart` — an id, a
kind, the id of the component it sits behind, and the one dimension no neighbour can supply. Everything
else is inherited from that neighbour, which is what makes the gesture "another one of these, here"
rather than a modal wall of number fields. Two things it gets right that the three existing flat adds
(boattail, drogue, payload) do not, and both were measured on real designs:

- **Identity.** The flat adds derive their id from their anchor (`${tube.id}-boattail`), so removing the
  anchor silently renames the part: on `01.One-stage.ork`, removing the aft tube moves the boattail to
  station 0.4429 with the id `c2-boattail` instead of `c4-boattail`. A part whose id moves cannot be
  aimed at, removed or undone. `AddedPart` mints its own, derived from the design so it survives a reload.
- **An anchor that is a part, not a role.** The payload anchors on "the longest tube", so an unaimed
  `bodyLength` moves it: on the same design, shrinking one tube jumps the payload from station 816 mm to
  316 mm while the field goes on advertising 816.

Applied BEFORE removals, so an authored part can be removed by id like any other, and before the
dimension edits, so `bodyTubeId` can aim at it and `bodyLength` can change it.

**Outcome. The milestone that makes Loft a builder.** The flyer can grow an airframe that did not
come from a file.

**Done when** a flyer can start from the starter design, add a second body tube, a transition, a fin
set and a mass object, place each at a station by direct manipulation, fly the result, and have the
stability and mass panels describe the rocket they just built.

**Notes.** Needs a placement model (where does a new part go, and what happens to the parts aft of
it), sane material and dimension defaults inherited from the neighbouring part, and a refusal path
for a geometry that cannot fly. Resist a modal wall of number fields: the add gesture belongs on the
diagram, with the numbers as confirmation.

**What shipped against the *done when*.** A flyer can start from the starter design, add a second body
tube, a transition, a fin set and a mass object; place the mass object at a station by dragging it along
the diagram; fly the result; and read the rocket they built in the stability and mass panels. Measured on
the starter: a tail cone buys +29.33 m of apogee (993.64 → 1022.97 m) for +12.58 g, and a 45 g mass object
moves the static margin by sliding alone.

**The gap, which is R4's starting point rather than a reason to re-open this.**

- **Only a mass object has a station to drag.** The other three kinds are placed by choosing an ANCHOR —
  "behind this part", "onto this tube" — and then sized where they landed. That is the honest reading of
  the *done when* for a stacked airframe, where a body part's station is not a free variable but the sum of
  what is in front of it; moving one is reordering, which is exactly R4. A mass object is different
  because it mounts INSIDE a part, so its station is a real degree of freedom, and that is the one the
  diagram now exposes.
- **An authored part can still only go in a stage's TOP-LEVEL list** for the kinds that stack beside their
  anchor. A mass object, which mounts inside, has no such limit. Real designs nest, so "add a part inside
  this bay" needs the ceiling lifted; filed in `BACKLOG.md`.
- **A nose cone is still role-addressed**, deliberately: no corpus design has more than one after import,
  so an id would address nothing.

**Size.** 5–8 increments. **Took 7.**

---

## R4 — Reorder and restack

**Status:** IN PROGRESS — the current R-track milestone. The operation, the refusal and the
keyboard/touch path are in and pinned by `lib/model/edit.test.ts` (the `reordering a top-level part`
and `moveTarget` suites, 9 cases), by `lib/corpus/sweep.test.ts`'s *never lets a reorder overlap a
part, cross a stage, or fail to come back* — which drives **206 reorders across all 35 real designs**
and skips itself where the corpus is absent — and by two e2e cases: *a flyer can move a part along the
airframe, and the stations behind it follow* and *a part at the end of its stage is not offered a move
it cannot make*. Every one was proved able to fail by a negative control with its tsc or build exit
checked.

**Outcome.** Nose-to-tail order is editable, not fixed at import.

**Done when** a flyer can drag a component along the airframe and drop it between two others, the
station arithmetic of everything aft follows, and the diagram never shows a part overlapping another.

**Size.** 3–5 increments.

**The measurement that made this a 3-increment milestone rather than a placement-model rewrite.**
A top-level part's station is DERIVED, never stored — `flattenRocket` walks each stage's list with a
running cursor — so *"the station arithmetic of everything aft follows"* is **free** the moment the
list order changes. And **all 150 top-level components across all 35 corpus designs use placement
`after` with offset 0**, zero exceptions, so no imported design can defeat a reorder expressed as a
list permutation. Neither fact was assumed; both were driven through the real importer.

**What shipped against the *done when*.** The operation (`GeometryEdits.moved`, an ordered list of
`{ id, after }` applied after removals and before the dimension edits), the stage-boundary refusal, and
the parts panel's move-toward-the-nose / move-toward-the-tail pair — undoable by name like every other
structural act. Driven on `fixtures/demo-quirks.ork`: the aft tube walks forward, the stations behind it
follow, the same parts are still there, and one undo puts the order back.

**A single-entry `{ id, after }` list, not a full ordered id list per stage** — recorded in *Decisions
taken without the owner*.

**The gap, which is the next increment rather than a reason to re-open this.**

- **The gesture is a pair of buttons, not a drag.** The *done when* says "drag a component along the
  airframe and drop it between two others", and that is the next slice. The buttons came first
  deliberately: they are the keyboard and touch path, which a drag can never be, and the diagram's two
  centreline grips are already fine-pointer-only because at phone fit width the airframe is ~11 px tall
  and every grip sits inside every other's 44 px target. Building the drag first would have left the
  accessible path unbuilt and `e2e/touch.spec.ts` to discover it.
- **Reordering is top-level only.** A part nested inside another (a fin set on a tube, a mass object in
  a bay) has no place in the stack order, and `moveTarget` returns null for it. Real designs nest, so
  "move this part into that bay" is a real gesture — it is the same ceiling `added` still has, filed in
  `BACKLOG.md`.
- **A reorder can open a mould-line step, and `mouldLineStep` already names it** — no new work, but it
  has not been walked on a design where a reorder creates one.

**Four defects the pre-push review found in this increment, all fixed here rather than filed**, and
three of them are the same shape — a new key on `GeometryEdits` has to be added in places the type
system cannot see:

1. **`hasGeometryEdits` did not know about `moved`**, and it decides whether `applyGeometryEdits` is
   called at all — so a design with only a reorder was shown, flown and exported as the pristine one.
   Caught by the e2e; every unit test was green through it, because they call the applier directly.
2. **`removableFrom`'s memo did not depend on `edits.moved`**, so the second nudge computed its anchor
   from the order before the first: a part could be moved exactly one place and no further, with the
   button still lit. The e2e now walks two moves.
3. **`ParameterSweep`'s axis base did not either**, which is the one that publishes a number: measured
   on the starter with an aft tube moved forward, the fin-position base read 0.700 m against the
   1.000 m every swept point was written into — 300 mm, on the axis that drives static margin.
4. **Two different trees answered "can this move?"** — the panel asked the fully-edited rocket, whose
   dimension edits synthesise a top-level boattail, while the app applied against the structure. That
   offered moves on and around a part the operation cannot address: buttons that did nothing. The panel
   now asks the app, exactly as it already asks `refuseRemoval`, and for the reason that prop's own
   comment gives.

**And the corpus sweep's undo rule could not fail.** It applied `{ moved: [] }` and compared, which
`applyMoves` returns untouched — deleting the whole function left it green. It now drives the INVERSE
move and asserts every one of the 206 actually permuted the list.

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

## P1 — One design system, adopted

**Status:** IN PROGRESS — the current P-track milestone. The container and control vocabulary exists and
the §9 compliance block is now an executable ratchet (`lib/design-system.test.ts`, 7 cases), so the drift
cannot return while the conversion is still running.

**Measured at the start of this milestone (2026-07-31), and after each increment:**

| §9 count | target | before | inc. 1 | inc. 2 |
|---|---|---|---|---|
| `rounded-lg` | 0 | 49 | 46 | **37** |
| distinct card treatments | 3 (see below) | 9 | 3 | 3 |
| off-scale spacing values | 0 | 8 | 8 | 8 |
| components importing `components/ui.tsx` | most of 23 | 5 | 11 | **12** |
| components importing `Button` | most that have one | 0 | 0 | **6** |
| hand-rolled indigo primaries | 0 | 16 | 16 | **6** |
| surfaces with two primaries | 0 | 2 | 2 | **0** |
| component files where `text-xs` outnumbers `text-sm` | 0 | 9 | 9 | 9 |

**The suite-wide `text-sm` vs `text-xs` ratio was retired from §9 in increment 2, and the reason is
a measurement.** Converting nine hand-rolled buttons onto `Button` moved the totals from 91/88 to
84/89 — an inversion by the metric — while **not one glyph on screen changed size**, because the
`text-sm` moved into `BUTTON_SIZES`. Adoption drives the suite ratio the wrong way for the right
reason, which makes it useless during exactly the milestone that raises adoption. The per-file
inversion count replaces it, and it is the one that was catching something all along: 9 of 23 files
are individually inverted while the suite total passed by three.

**The card target is 3, not 1, and the difference is a decision rather than a shortfall.** One of the
three is `<Card>`'s own string, which IS the target state. The other two are a floating update toast
(`shadow-lg`, `components/ServiceWorker.tsx`) and the import drop zone (`border-2 border-dashed`, an
interactive target rather than a container). Folding either into `Card` would give the primitive a
`shadow` and a `dashed-2` prop that mean nothing to a card; they want their own named primitives, which
is a later increment of this milestone rather than a reason to distort this one.

**Outcome.** The app reads as one considered product rather than a collection of surfaces built on
different days.

**Done when** `DESIGN.md`'s compliance block (§9) runs clean and is **pinned by a test**: zero
`rounded-lg`, **one card treatment plus any named non-card primitive** (see the note below — the honest
floor is 3, not 1), zero off-scale spacing values, `text-sm` outnumbering `text-xs` **in every component
file rather than only in the total**, and every component importing its containers, buttons and fields
from `components/ui.tsx` rather than hand-rolling them — counted **per primitive**, not per file. A
flyer sees consistent spacing, one button hierarchy, and the same card everywhere.

**Three clauses of that *done when* were sharpened on 2026-07-31, each because the looser version could
be satisfied without doing the work.** "One card treatment" would have meant folding a floating toast
and an interactive drop zone into `Card`; "`text-sm` outnumbering `text-xs`" passed by three while nine
of twenty-three files were individually inverted; and an adoption count by FILE is satisfied for the
rest of the milestone by adding one more `Card` import while all 43 hand-rolled `<button>` elements stay
exactly where they are. All three are now asserted the sharpened way in `lib/design-system.test.ts`.

**Notes.** Not a repaint — an extraction. The work is to grow `components/ui.tsx` into the vocabulary
`DESIGN.md` §5 names (`Card`, `Panel`, `Section`, `Button` with its three weights, `DataTable`,
`Readout`, `Figure`, the five states), then convert surfaces onto it. Convert in slices — one surface
per increment, each shipped green — never one sweeping diff. **Ship the lint rule or test with the first
slice**, so the drift cannot return while the conversion is still in progress. *Done: the ratchet shipped
with increment 1.*

**What is left, measured rather than estimated.** `Card`, `Section` and `Button` now exist; `Panel`,
`DataTable`, `Readout`, `Figure`, `EmptyState`, `ErrorState` and `Extrapolated` do not. There are 43
hand-rolled `<button>` elements and 16 hand-rolled indigo primaries across four different padding
variants, none of which is §4's `px-3 py-1.5`; `ImportPanel` and `RocketpyCrossCheck` each carry two
primaries on one surface, which §5 forbids outright. Seven missing primitives plus 23 surface
conversions is more than this milestone's 4–6 increments, so the slice plan is: **`Button` adoption and
the double-primaries next, then the type scale, then off-scale spacing, then `DataTable`** — and
`Panel`, `Readout`, `Figure` and the five state components are deliberately deferred to a successor
milestone rather than half-built here.

**The measurement that made this a milestone** (2026-07-30): 12+ distinct card treatments; three
radius values for one role; `text-xs` and `text-sm` disagreeing between the two sibling apps.

**Size.** 4–6 increments.

---

## P2 — Workspaces as routes

**Status:** NOT STARTED

**Outcome.** Loft is shaped like an application, not a scrolling page.

**Done when** import, build/edit, simulate, sweep/Monte-Carlo and validate/cross-check are distinct
static routes with one navigation spine that shows where the flyer is; the design and its results
survive moving between them; every route deep-links and reloads into the same state; and no route is
more than two screens deep to its primary answer. Pinned by e2e over each route plus a static-export
assertion.

**Notes.** This was R8, five milestones away, and it is the single largest structural reason the app
reads as assembled. It is also what the PRODUCT SHAPE invariant already requires and what
`MAINTAINING.md`'s orchestration section names as the blocker on parallel authoring — "parallel
authoring is impossible while two files are the whole app." `components/LoftApp.tsx` is 2577 lines
and carries every job. Moving it up is the highest-leverage single change on either track.

Keep navigation and layout above the model: the core and solver stay ignorant of pages, tabs and form
factor. Multi-view is multi-route, never multi-server.

**Depends on** P1 — converting surfaces onto shared primitives first means the split moves components
rather than rewriting them.

**Size.** 4–6 increments.

---

## P3 — A stranger's first five minutes

**Status:** NOT STARTED

**Outcome.** Someone who has never heard of Loft gets to a flight they believe in, without being told
how.

**Done when** a first-time visitor can, without instruction: understand what the tool is within one
screen; fly a real example in one click without supplying a file; import their own design and be told
plainly what was and was not understood about it; and find the methods, limitations and validation
pages from where the question arises rather than from a footer. Pinned by an e2e walkthrough that
starts at a cold load with empty storage and reaches a flown, explained result.

**Notes.** Sample designs already exist in `public/samples/` and are under-used. The measurement that
matters is steps and dead ends, not looks: count the clicks from cold load to a flown flight, and
count the states a first-timer can reach that explain nothing. The README is 4.7 KB against the
sibling app's 27 KB — the front door is thin in both senses.

**Size.** 3–4 increments.

---

## P4 — A touch-native builder

**Status:** NOT STARTED

**Outcome.** A phone at the pad is a first-class tool, not a rescaled desktop.

**Done when** a flyer can, one-handed and offline on a 390 px viewport, complete the three things a
range day actually needs — pick a motor, check stability, sanity-check a delay — with zero controls
under 44 px and zero states reachable only by hover. Pinned by a mobile-viewport e2e that asserts both
counts and walks all three journeys.

**Notes.** This was R7. Decompose by what a flyer needs to DO at the pad, not by auditing the desktop
layout at a narrow width — capability first, hit targets are the finish rather than the substance.
`DESIGN.md` §8 is the contract.

**Size.** 4–6 increments.

---

## P5 — Ready for the public

**Status:** NOT STARTED

**Outcome.** Someone can find Loft, understand it, use it, trust it, and tell someone else about it.

**Done when** the README shows what the tool does with images rather than describing it; the landing
surface states the three things Loft does that no competitor does (`COMPETITION.md`'s standing
conclusion) instead of leaving a flyer to discover them; there is a visible changelog and a versioned
release the flyer can see in the UI; a limitations page a sceptic can read before trusting a number;
and a working way to report a bug or request a format from inside the app. Pinned by link-checking and
a build-time assertion that the version shown matches the release.

**Notes.** The suite is free, client-side and genuinely differentiated, and none of that is legible
from outside. This is the milestone that converts the work into users. Keep the ecosystem consistency
invariant: whatever ships here ships in both apps.

**Size.** 3–5 increments.

---

## After R6 and P5 — extend this file yourself, in this order

**Do not ask which of these to do, and do not fall back to the defect ledger because the list above
is finished.** When a track's last milestone ships, take the next from that track's order below and
decompose it here to the same shape — outcome, *done when*, size, notes — then start it. That
decomposition is one increment's work and it IS the work when a track is dry. **A dry R-track is not a
reason to skip the P-track or vice versa** — extend the dry one and keep alternating. The order is a
standing decision, changeable by the owner at any time; absent that, it holds.

### R-track, after R6

**R7 — Per-set fin drag, and the honest aero the builder needs.** Once a flyer can add fin sets, the
model that collapses every set into one equivalent fin is no longer a modelling nicety — it is wrong
about a rocket they just built. The measurement is already in `BACKLOG.md`: t/c of 1.00 on a real
file, an unswept flag on 44.5° fins, and a naive area-weighted fix that doubles the error on a
six-set design. Also the unread `<overridecd>` and fin-tab tags.

**R8 — Component and material catalogues.** `COMPETITION.md` rows 2 and 3: OpenRocket picks real
commercial parts by vendor and part number and derives mass from a material's density; Loft types
every dimension by hand. This turns authoring from measurement into selection and grounds every mass
number. Needs a licence-clean data source — establish that first, it may be the whole first increment.

**R9 — The multi-solver cross-check as a first-class view.** North Star #1: Loft's result beside the
file's own stored numbers and an external oracle's, agreement building confidence and disagreement
flagged rather than hidden. Wants P2's routes to live on. `COMPETITION.md` row 19 — this is the thing
nothing else in the field does, and today it is a panel rather than a view.

**R10 — Toward 6-DOF.** `COMPETITION.md` row 9. The state is already 6-DOF-ready. Decompose only when
the fundamentals justify it, and only against published, citable sources.

### P-track, after P5

**P6 — Instrument what flyers actually hit.** Client-side, keyless, privacy-preserving: which imports
fail, which formats arrive, where a journey is abandoned. Today every priority is inferred from a
corpus and a cold walk rather than from use. This is deliberately after P5, because it needs users to
have something to measure.

**P7 — The suite as one product.** Loft and Debrief cross-refer, share a design system and a nav
idiom, and a flyer who designs in one and analyses in the other never feels they changed tools. Some
of this lands earlier in `DESIGN.md` §10; this is the milestone that finishes it.

Beyond these, decompose from the North Star in `MAINTAINING.md` and from `COMPETITION.md`'s standing
`GAP` rows, and record why you chose what you chose.

---

## Decisions taken without the owner

Unattended runs do not stop to ask (see *Unattended operation* in `MAINTAINING.md`). Every decision
that would otherwise have been a question goes here, with the option rejected, so it can be reversed
cheaply instead of re-derived. Newest first.

- **2026-07-31 — a reorder is an ordered list of single `{ id, after }` moves, not a full ordered id
  list per stage.** Rejected the full list: it is a SNAPSHOT rather than a patch, and every other edit
  in the bag is a patch for one reason — the model is always rebuilt from the pristine design plus the
  bag, so undo is dropping the last entry. A snapshot goes stale the instant `added` or `removedIds`
  changes the membership (a part authored after it was taken is absent from it, so it would be dropped
  or silently appended), it cannot be stepped back one move at a time, and `lib/session.ts` restores the
  whole bag from `localStorage`, which makes the stale case reachable rather than theoretical. A
  `{ id, after }` entry naming a part that is no longer there simply does nothing, exactly as an `added`
  entry with a missing anchor already does.
- **2026-07-31 — a move never crosses a stage boundary, and the control is left out rather than shown
  and refused.** Rejected allowing it: `nextTopLevel` flattens across stages, so a part let out of its
  own stage re-stages itself silently — a different separation event and a different flight, with
  nothing on any surface saying so. Rejected showing a disabled button with a reason: at the ends of a
  stage there is nothing to explain, because moving a part between stages is not a thing this milestone
  offers at all; a disabled control implies it is coming.
- **2026-07-30 — the queue was split into two alternating tracks, and product/craft work was made
  queue-legal rather than quota-capped.** The owner directed the shift: the products "still look and
  feel like thrown together" projects rather than something the public can pick up, against
  OpenRocket, RocketPy and the vendor tools. The decomposition is mine. Rejected raising the old
  one-in-four polish quota to a half: the quota was never the real constraint — `ROADMAP.md` was, and
  it contained no polish milestone to spend a quota on, so raising the cap would have licensed more
  defect-clearing rather than more product work. Rejected appending the P-track after R6, which is
  where the equivalent items already sat as R7/R8 and where they had been sitting untouched while
  three R-milestones shipped past them. Alternation is mechanical, which is the property that makes a
  rule survive an unattended run; a preference is not. Old R7 (touch) became P4 and old R8 (routes)
  became P2 and moved up sharply — routes are an invariant violation today and the named blocker on
  parallel authoring, so they were the wrong thing to have scheduled fifth.
- **2026-07-30 — an authored transition between two same-caliber sections runs STRAIGHT THROUGH rather
  than contracting.** Rejected contracting by the corpus median everywhere: measured over all 91 body
  tubes in the starter plus the corpus, 38 of them have a neighbour behind at the same caliber, and
  contracting there put a step at the joint BEHIND the new part — a stepped airframe nobody drew, on
  42% of the positions the gesture is offered, every time. Also rejected not offering the gesture in
  that position at all (OpenRocket greys out what cannot attach): a flyer inserting a transition
  mid-airframe wants to step the caliber, and the exit field is aimed at the new part the moment it
  exists, so one keystroke shapes it. The zero-taper part is real, not a placeholder — 4 of the 25
  corpus transitions are exactly that.
- **2026-07-30 — changing a transition's exit does NOT resize anything aft of it; the step is disclosed
  instead.** Rejected scaling the airframe behind the transition to follow, which is what OpenRocket's
  `auto` diameters do: Loft has no auto binding, and re-calibering parts the flyer did not pick from a
  single field is a bigger surprise than a visible step. Rejected refusing the value: a step is a real
  geometry that real designs have — 31 of 115 corpus joints already step. So the step is measured and
  said, on the part panel and on `/docs/limitations`, along with the fact that Loft's drag model has no
  term for one.
- **2026-07-30 — the undo stack is not persisted across a reload, and a pick is not an undo step.**
  Rejected persisting it: the saved session is written to `localStorage` on every keystroke and
  `writeSlot` caps only the design bytes, so an unbounded stack of snapshots fails at the quota — and
  that failure is caught and returns false, losing the WHOLE session write rather than just the stack.
  The desktop tools do not persist undo across a save either. Rejected recording picks: a selection
  changes no geometry (it is already in `INERT_EDIT_FIELDS`), no editor a flyer has used makes selection
  undoable, and recording it would bury the edits under the clicks that led to them. Both are stated on
  `/docs/limitations` rather than left to be discovered.
- **2026-07-30 — a gesture boundary is inferred from the patch's field names plus a 900 ms window, not
  taken from the drag handle's own pointer-down/up.** `RocketDiagram`'s `onActiveChange` reports the real
  boundary and is wired to only 2 of the 7 handles, for freezing the SVG frame. Rejected threading it
  through all seven and into the history for now: the inference is right for every gesture measured, and
  the one case where it was wrong — a pick between two drags on the same field merging them into one step
  — is fixed at the real cause (`endRun`, called by any change that records nothing) rather than by
  guessing at a clock. Taking the true boundaries is the better design and belongs with the field-blur
  boundary too; filed rather than half-done.
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
