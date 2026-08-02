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

**Status:** SHIPPED 2026-07-31 — pinned by `lib/model/edit.test.ts` (the `reordering a top-level part`,
`moveTarget` and `moveSlots` suites, 15 cases), by `lib/corpus/sweep.test.ts`'s *never lets a reorder
overlap a part, cross a stage, or fail to come back* (**206 reorders across all 35 real designs**) and
*offers a drag only drops that land exactly where the indicator promised* (**484 drop slots across all
35 designs, 30 of them landing in front of the next stage's first part**) — both of which skip
themselves where the corpus is absent — and by four e2e cases: *a flyer can move a part along the
airframe, and the stations behind it follow*, *a part at the end of its stage is not offered a move it
cannot make*, *a part can be dragged along the airframe and dropped between two others*, and *dragging
a part does not also re-aim the editor at it*. Every one was proved able to fail by a negative control
with its tsc or build exit checked.

**Outcome.** Nose-to-tail order is editable, not fixed at import.

**Done when** a flyer can drag a component along the airframe and drop it between two others, the
station arithmetic of everything aft follows, and the diagram never shows a part overlapping another.

**Increment 3 was a Sev-1 the drag itself created reach to.** Loft takes forebody pressure and wave
drag from whichever component is a nose cone wherever it sits, and has no term at all for a blunt
leading face. Measured on `fixtures/demo-quirks.ork`: nudging the nose one place aft leaves apogee at
1,406.622 m, max velocity at 227.893 m/s and rail exit at 26.023 m/s — every digit identical to the
streamlined design — while the rocket flies a 66 mm flat disc into the airstream. Only the margin moves.
A flight that leads with a flat face now says so, names the diameter, and reports the number as
optimistic; `/docs/limitations` carries it. **0 of the 35 real designs** fire it as imported, which is
the measurement that makes it a warning about a shape the EDITOR can reach rather than a caveat about
the corpus.

**Size.** 3–5 increments. **Took 3.**

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

- **~~The gesture is a pair of buttons, not a drag.~~ SHIPPED as increment 2.** The buttons came first
  deliberately and they stay: they are the keyboard and touch path, which a drag can never be, and the
  diagram's two centreline grips are already fine-pointer-only because at phone fit width the airframe
  is ~11 px tall and every grip sits inside every other's 44 px target.

  **The scoping for that slice was redone on 2026-07-31 and one of its premises was wrong.** This file
  and `HANDOFF.md` both said to freeze the HORIZONTAL frame during the drag because the airframe's
  overall length changes under the pointer. Measured: it does not. `flattenRocket` stacks with a
  running cursor and all 150 top-level components are body parts at `after` + 0, so a permutation
  leaves the sum bit-identical. What moves is `maxExtent` — fin seats re-resolve, so the picture
  shifts VERTICALLY and the existing `vFrameExtent` freeze is the fix — plus one real horizontal case:
  with a boattail what-if set, `addBoattail` returns the rocket unchanged once a narrower tube becomes
  aft-most, so the boattail vanishes mid-drag. `HANDOFF.md` carries the rest, including the three
  hazards that decide the shape: the drag must not route through `onEdit` (which replaces the whole
  `moved` list rather than appending), the pick's click fires on pointerup and would re-aim the fields
  on every reorder, and the drop anchor must come from the tree the operation runs against while the
  pixel comes from the tree on screen.

**What increment 2 shipped against the *done when*.** A flyer grabs a part's own silhouette on the
diagram, drags it along the airframe, and drops it between two others; a rule marks the joint it will
land at while the pointer moves; the stations of everything aft follow; and the drop is one undo step,
named. `moveSlots` is the new model function — every legal landing for a part, each carrying both the
`{ id, after }` entry to commit AND the part it lands in front of. That split is the load-bearing
decision: **the anchor is resolved against the tree the operation runs against, the pixel against the
tree being drawn**, because the shown rocket carries dimension edits that synthesise top-level parts
(a boattail) which `applyMoves` cannot address — an anchor read off the picture names a part the
operation silently ignores while the indicator promised otherwise.

**No live preview.** The picture does not restack until the pointer is released, which is what the
desktop tools' component trees do and what keeps the slot table valid for the whole gesture: a
committed preview moves the boundaries by design, so a target recomputed from the new geometry maps
the same pointer x back to the previous slot and the part oscillates between two positions.

**Four things the pre-push review and the negative controls caught, none of which a unit test could
see:**

1. **A drag also re-aimed the editor.** The grip is the pick surface, so the pointerup synthesises a
   click and the click picks the part — and a pick re-aims the fields, which on a field holding an
   ABSOLUTE value changes the design rather than the selection. Suppressed, with the flag cleared at
   the START of the next gesture rather than left to be consumed by a click that may never arrive: a
   drag that ends over a different element fires its click on the common ancestor instead, and a flag
   left standing then swallows the next genuine pick.
2. **The first version of the "does not re-aim" e2e could not fail**, because it dragged far enough to
   leave the part's own silhouette — so the click landed on the `<svg>` and the suppression was never
   exercised. It now uses a SHORT drag that stays inside the part.
3. **A coordinate captured before an undo lands outside the viewport**, because the page reflows as
   controls appear and disappear around the diagram. The e2e recomputes it each time.
4. **`preventDefault` on the grip's pointerdown was removed on a false diagnosis and put back.** The
   real cause of that failure was (3); the control proved the removal changed nothing, so it stays for
   the reason the other grips have it — stopping the native text selection a drag would start.
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

**Status: SHIPPED 2026-08-01.** Every clause of the *done when* is reachable and pinned by an
automated check. Increment 4 — the last clause, "give it its own motor mount" — landed as
`GeometryEdits.mountAdds`: a tube with no motor mount can be given one, which is what lifts the
refusal that stopped a booster existing at all on such a design. Driven across the corpus: the gesture
is **offered on 24 of the 35 real designs**, and of the **2 that refused a booster outright, 1 is
unblocked by it** (`03.Three-stage.ork`). The other stays refused and correctly so — no motor anywhere
in it resolves, so there is nothing for Loft to put in a mount, and a mount with nothing naming it
never lights.

Pinned by `lib/model/edit.test.ts`'s *authoring a motor mount* suite (7 cases), by
`lib/corpus/sweep.test.ts`'s *authors a motor mount on every real design that can take one, and
unblocks the booster it exists for*, and by the e2e *a flyer can give a tube a motor mount, fly it,
and take it back off*. Two negative controls, both with their build exits checked: removing the
mount-add from `stageSeedBase` fails exactly the unblock assertions, and dropping the configuration
write fails the instance, idempotence and round-trip ones.

**Hazard 1 dissolved rather than needing the pipeline reordered, and the reason is worth keeping.**
`buildStage` picks its seed by set membership and station alone — `flattenRocket(...)` filtered to
body tubes, reduced by `xFore` — and a mount-add creates no component and moves none, so it can
change neither. The three causes of divergence `stageSeedBase` names (an authored tube at the tail, a
removal, a reorder) are every one of them positional. `applyMountAdds` therefore folds into
`stageSeedBase` and runs at two points in the pipeline — before the stages so a booster can be
authored at all, after the adds so a mount can go on a tube the flyer authored — and is idempotent by
construction, which the corpus test asserts directly rather than assuming.

**Hazards 2 and 4 were closed by the same design rather than left open.** `canAddMount` refuses where
the design has no motor to clone, which is what stops an EMPTY mount satisfying a `canAddStage` that
tests only for existence (hazard 2's documented 11.9%-low fallback, reached from a new direction).
Hazard 4 was fixed ahead of this increment as a Sev-1 — see below; its "not reachable today" premise
was false.

**What R5 did NOT deliver, recorded here as the next milestone's starting point rather than left
implied.** A flyer cannot give one mount a different motor from another: `motorSwap` is a whole-design
what-if, so an authored mount flies the design's own motor and a design with several mounts flies the
same motor in all of them. `COMPETITION.md` row 27 sizes it — both OpenRocket and RockSim author a
cluster on the mount you PICKED and build the extra tubes as real components. A per-mount motor
picker is the first increment of whichever milestone takes this forward.

**Increment 1 shipped 2026-07-31:** the operation, the refusal and the control,
pinned by `lib/model/edit.test.ts`'s `authoring a booster stage` suite (8 cases), by
`lib/corpus/sweep.test.ts`'s *authors a booster on every real design, and every one of them separates*
— which drives **33 authored boosters and 2 refusals across all 35 real designs**, flies 30 of them and
asserts that all 29 which reach burnout separate — and by the e2e *a flyer can add a booster stage, fly
the staged flight, and take it back*. Every one was proved able to fail by a negative control with its
build exit checked.

**Outcome.** Multi-stage designs can be built, not only imported.

**Done when** a flyer can add a booster stage to a single-stage design, give it its own motor mount
and fins, and fly a staged flight whose phase table matches what they built — and remove that stage
again.

**Notes.** The solver already flies staged designs and rebuilds per-phase geometry from a sub-rocket,
so this is an authoring milestone rather than a physics one. Confirm that before scoping it.

**Size.** 4–6 increments.

**Confirmed by measurement, which is what those notes asked for.** A stage synthesised in memory — never
from a file — phases, separates, re-derives its per-phase mass and aero, and round-trips through the
exporter. **No physics change is required.** What it needs that nothing else in the edit bag supplies is
a stage-level operation and, for the first time, a write to `rocket.configurations`.

**What increment 1 shipped.**

- **`GeometryEdits.addedStages`, a FOURTH list** rather than a fifth `AddedPart.kind`. `buildAdded`
  returns a component plus where it goes — beside its anchor, or inside it — and a stage is neither: it
  is the level above a component, so it has no anchor to name and nowhere in that return to land.
- **It carries no components of its own.** What a booster is made of is decided at every apply from the
  design as it then stands, which is the rule every other operation in this bag follows and what makes
  replaying the bag from the pristine design the whole of undo.
- **The seed is the design's own aft tube, its motor mount and its fins, and nothing else.** Both
  omissions are measured: a whole-subtree clone drags 150 g of altimeter and parachute into the booster
  (26.4% of the seed's mass), and `lib/sim/setup.ts` collects recovery devices from stage 0 only, so a
  cloned canopy is dead weight the solver never deploys. Across the corpus's 12 real booster stages, 12
  carry a fin set, 10 a motor mount and **0 a nose cone** — tube + mount + fins is what a booster is.
- **A motor goes into EVERY configuration, and that is the operation.** A stage separates only if a
  configuration instance names a mount inside it, so a booster with a mount and no instance never lights
  and never drops: measured on the starter, 993.642 m falling to **621.158 m, a 37.5% loss**, with no
  separation event and nothing on any surface saying why. A design can carry five configurations, and a
  booster present on one and missing from another is the same silent loss on whichever the flyer
  switches to.
- **A booster that cannot burn is REFUSED, not disclosed.** Where the aft tube carries no motor mount to
  clone, the gesture is not offered at all — because appending one anyway produces a confident wrong
  number in the optimistic direction: measured on `03.Three-stage.ork`, apogee went from 1,481.8 m to
  **2,299.2 m, a 55% GAIN** from a stage that can never fire. 2 of the 35 real designs are in that state.
  *(`canAddStage` was exported, tested and swept in increment 1 but never asked by the UI, so on those 2
  designs the control DID render and a click committed an undo step that changed nothing. Wired into
  `onAddStage` in the review pass below; the sentence above is true from that commit, not from
  increment 1's.)*
- **Removal is dropping the entry**, not a `removedIds` list of the booster's parts: the stage exists
  only in the bag, so there is nothing in the pristine design to mark as gone. The aims are cleared the
  same way a component removal clears them.

**The enumeration trap, and one place it stopped.** `HANDOFF.md` records six places a new key on this
bag must be added by hand. Two of the six were `structureOf(…, { added, removedIds, moved })` call sites
that hand-restated the fields — and `structureOf` already picks the structural keys itself. Those call
sites now pass the WHOLE bag, and so does `ParameterSweep`'s `axisBase` dependency list. **That closes
two of the six permanently**: a caller that passes the whole bag cannot be out of date, and a caller
that spells out fields silently can.

**What TWO rounds of second opinion on increment 1 corrected, after it was already pushed.** The first
round found thirteen things; the second, taken on the fixes themselves, found seven more — including
that the first round's headline fix was bypassable and that one of the corrected numbers was still
wrong. Ten are fixed here, four of them wrong numbers on a surface a flyer would act on; the rest are in
`BACKLOG.md` with their measurements. Every figure below was re-derived against the pushed code rather
than quoted from either review, which is the one lesson two of them teach.

- **Sev-1 — the aim fix was bypassable, because the stage was found by its SEED and the seed is
  removable.** `removalRefusal` allows deleting a booster's seed tube; the stage stays, holding whatever
  was authored into it, and a lookup rooted at `seedId` then finds no stage and clears nothing. Measured
  on the starter — booster, a tube authored inside it at 400 mm, seed deleted, stage removed — the
  sustainer's 620 mm tube still became 400 mm: **993.642 → 1105.598 m**, the same wrong number the fix
  was written to stop. `addedStageIds` now diffs the structure with the stage against the structure
  without it, so what the stage accounts for is named by what it HOLDS.
- **Sev-1 — `removedIds` outlived the stage, and `newPartId` is deterministic.** The removal dropped
  `added` and nothing else, while `addStage` names by the current length, so the booster after a removal
  is minted with the SAME seed and mount ids as the one before it. Add a booster (1491.464 m, one
  separation), delete its motor mount (638.973 m, none), remove the stage (993.642 m), add a booster
  again — **the new one reads 638.973 m with zero separation events**, 35.7% below the design's own
  flight, from two clicks that destroy nothing and with nothing on any surface saying why. Every list in
  the bag is now filtered by what the stage held, `removedIds` and `moved` included.
- **The refusal was asked the wrong tree, and disagreed with the operation in 123 corpus states.**
  `applyAddedStages` runs FIRST in the pipeline, on the pristine design plus the stages already authored;
  the gate asked the fully-structured tree, where an authored tube, a removal or a reorder changes which
  tube is aft-most. 121 are false refusals — author one ordinary tube at the tail of the starter and the
  control vanishes from a design that would have given a 2-stage rocket flying 1373.372 m with a
  separation — and 2 go the other way, on `03.Three-stage.ork`, which is the changes-nothing click the
  refusal exists to prevent. `stageSeedBase` names the right tree once, and the e2e that had pinned the
  false refusal as correct behaviour now pins the opposite.
- **The withdrawal notice said "This design flies 1 stages."** `staged` moved to the edited rocket; the
  sentence explaining the withdrawal did not, so it read the file's own stage count — a wrong number and
  a broken sentence on the one piece of copy whose job is to explain what just disappeared. Now
  asserted positively by the e2e, because three `toHaveCount(0)` calls are satisfied by deleting the
  notice outright.

- **Sev-1 — the RocketPy cross-check flew a booster as a coaxial cluster and called it a second
  opinion.** Every Analyze tool gated on "is this design staged?" read `doc.rocket.stages.length`, the
  stage count of the FILE, which a booster in the edit bag never touches. So the cross-check stayed
  offered — and it builds its spec from the EDITED rocket, where `buildRocketpySpec` carries a single
  `motor` and multiplies one curve by `motors.length`. Correct for a cluster; wrong for serial staging.
  Measured on the starter with one booster authored: peak thrust **190.5 → 381.0 N**, propellant
  **0.0941 → 0.1882 kg**, burn time unchanged at 1.293 s — two motors firing together from t=0 on a
  vehicle that never sheds a stage, under a heading whose whole job is to say whether Loft's number can
  be trusted. The gate now asks the rocket on screen. Pinned by an e2e that withdraws the tools with the
  booster and gets them back when it goes.
- **Sev-1 — removing a booster resized the SUSTAINER.** `removeStage` cleared aims by naming the seed
  tube and its children; a part the flyer authored ONTO the seed is a sibling in that stage's list, not
  a child, so it was never named. Measured on the starter: author a booster, add a tube inside it, set
  Body length 400 mm, remove the stage — `bodyTubeId` points at nothing, falls back to the primary tube,
  and the sustainer's 620 mm tube becomes 400 mm: apogee **993.642 → 1105.598 m (+11.3%)** with the
  field still reading 400 and no part on screen that long. The whole stage is named now, and the `added`
  entries that built those parts go with it rather than lingering as an active what-if for a component
  that is nowhere. Pinned by an e2e.

- **The configuration write cloned one field too many.** `ignitionEvent` carried across from the source
  instance, so a booster seeded from a design that air-starts inherited `burnout` — and `lib/sim/setup.ts`
  derives bottom-versus-upper from the STAGE INDEX, where that event resolves to "never lights". Measured
  on `02.Two-stage.ork`: 1,377.957 m became **1,152.856 m (16.3% DOWN)** against the **2,055.479 m** the
  fixed code flies; on `Two stage high power rocket.ork`, 659.262 m became 619.833 m against 855.457 m.
  That is the same silent wrong flight the configuration write exists to prevent, reintroduced by copying
  a field. `ignitionEvent` and `ignitionDelay` are now both omitted and the trigger derives.
  *(This bullet first published 1,548.575 m as the fixed number. That is the OLD motor source with the
  NEW ignition handling — a rocket that exists in no commit. It was caught by the review below, in the
  bullet whose whole subject is quoting a probe of something other than the finished thing.)*
- **And it cloned the wrong motor.** `cfg.instances[0]` is the first instance, not the one in the tube the
  booster was seeded FROM. On `Three stage low power rocket.ork` those are different motors: instance zero
  puts an A8 in a booster whose own mount flies a B6, and apogee reads 294.4 m against 334.2 m — **11.9%
  low**. It now prefers the seed tube's own mount's instance and falls back to the first.
- **The corpus separation assertion could not fail on the multi-stage designs.**
  `some(e => e.type === "separation")` is satisfied by a separation the design ALREADY had, so it was
  structurally blind to both defects above. It now asserts the count rises by **exactly one** — which
  also catches a booster that separates while suppressing one of the design's own. Nine designs are
  multi-stage and 7 of them reach the branch; the other 2 refuse a booster.

  **What it can and cannot catch, driven rather than assumed.** Reverting BOTH motor fixes turns it red
  on 2 designs. Reverting either one ALONE leaves it green: every seed instance in the corpus carries
  `ignitionEvent: "automatic"` or none, which resolves to the serial default anyway, so once the
  seed-mount preference is in place the ignition clone has nothing left to break. The claim first
  published here — "proved able to fail by restoring the ignition-event clone" — was not true of the
  shipped code.

  So each half got the check it actually needs. **The seed-motor preference is pinned by the sweep**:
  the booster's instance must name the motor the seed tube's own mount flies, which catches 6 states
  across 3 designs (`02.Two-stage.ork` G80T for I300T, `Three stage low power rocket.ork` A8 and C6 for
  B6, `Two stage high power rocket.ork` I59WN for I357T). **The ignition omission is pinned by a
  SYNTHETIC unit case**, because no real design exercises it — a design that air-starts off its aft
  mount is a file Loft has not met, and a guard against a file shape the corpus does not contain cannot
  be proved by the corpus. Both proved able to fail by reverting exactly their own half. Writing
  "no corpus design reaches this" beside a guard is worth more than a sweep that passes either way.
- **`canAddStage` was never called.** See the refusal bullet above.
- **A number was wrong in six places.** The no-instance loss was published as *546.813 m, a 45.0% loss*
  across `edit.ts`, `LoftApp.tsx`, `edit.test.ts`, `sweep.test.ts`, `smoke.spec.ts` and this file. That
  figure came from a probe of the whole-subtree clone WITHOUT the configuration write — a different
  rocket from the one that shipped. Re-derived against the shipped code: **621.158 m, a 37.5% loss.**
  Both halves of the seeding rule reduce the apogee, and quoting a scoping probe as a result of the
  finished thing double-counted one of them.

**Increment 2 shipped 2026-07-31 — the PHASE TABLE**, pinned by `lib/corpus/sweep.test.ts`'s *gives every
real staged flight a phase timeline its table can be built from* (9 multi-stage designs, 18 phases, and
**1 boundary where more than one stage leaves at once** — the case the naive row rule gets wrong) and by
the e2e *a staged flight has a phase table that matches what the flyer built*. Both proved able to fail by
negative controls with their build exits checked.

`FlightRun.phases` is the whole model change: `buildRocketDynamics` has always built the staging timeline
and `simulate` has always consumed it, but nothing carried it back out, so no surface could show it. The
table renders one row per REALISED phase — not simply per phase; the review paragraph below is why — with
the stages attached, the interval, what ends it, and the altitude and speed at that boundary, read from the
separation EVENT so the table and the altitude chart cannot drift apart. `FlightViz` now draws separation dots too; it had filtered them out while the altitude chart marked
them, which gave two charts on one page two vocabularies.

**Rows are not stages, and that is the load-bearing decision.** A serial stack parts at ONE joint and takes
everything below it, so `03.Three-stage.ork` has 3 stages, 2 phases and a single separation while
`Three stage low power rocket.ork` has 3 of each. `stageCount` is a COUNT of what remains, not an index of
what left, so a row names its shed stages as the slice `stages[stageCount_p … stageCount_{p-1} - 1]` —
naming only `stages[stageCount]` drops the second stage at the one corpus boundary where two leave together.
Walked in the built export on the starter with a booster: two rows, boundary at 1.3 s / 86 m / 108 m/s.

**The pre-push review rewrote the row derivation, and the reason is the whole lesson of the increment.**
The first version built rows from `phases` — which is the SCHEDULE `buildRocketDynamics` derived from burn
times, not the timeline the flight flew — and ended the last row at apogee. Both were wrong on real files.
A flight can end before reaching a planned separation, and the table then stated a staging event that did
not happen: `ARC payload rocket.ork` with 1 kg of nose ballast lands at 9.64 s having never separated,
while the schedule still put a separation at 10.43 s. And apogee is an event INSIDE a phase, not a boundary
between two — on the payload/dual-section designs that separate at an ejection charge it happens BEFORE the
separation, so the last row printed a "to" earlier than its "from" (`ARC payload rocket.ork`: From 10.4 s,
To 8.1 s; also `Deployable payload.ork` and `fixtures/demo-payload-separation.ork`). Rows are now bounded by
the separations the flight actually LOGGED and the last one runs to the end of the flight. Re-driven across
the corpus: the table renders on 8 designs, **0 backwards rows, 0 withheld cells, 0 schedule/actual
mismatches**. Two smaller things went with it: a design may reuse a stage name (`Three stage low power
rocket.ork` has two called "Booster stage", so both separations read identically) and duplicates are now
numbered, and `FlightViz`'s label map had no `separation` case, so the new dot rendered the raw enum
string.

**A staged design where nothing separates gets one row and a sentence saying so**, which is the state
increment 1's dead-stage warning creates: gutting the booster's mount takes the table from two rows to one
and explains that the stack flew whole. That is the surface's empty-ish state; a genuinely empty one is
unreachable inside the `hasPropulsion` guard the table sits under.

**No competitor has this** — `COMPETITION.md` row 25, added this run. OpenRocket, RockSim and RASAero all
present one row per SIMULATION, and OpenRocket's selectable flight-event list does not include separation
at all.

**Increment 3 shipped 2026-07-31 — a burnout per stage, and the column that shows it**, pinned by
`lib/corpus/sweep.test.ts`'s *logs a burnout for every stage that burns, without moving the burnout it
reports* (9 multi-stage designs, 14 burnout events, and the **5 designs that now log more than one named
exactly** rather than counted) and by the e2e *each phase names the burnout that happened inside it, and
only that one*. Both proved able to fail by negative controls with their build exits checked.

**The dangerous half was never the new events; it was the summary.** The emission and the
`burnoutVelocity` / `burnoutAltitude` latch were ONE guard, so looping it over the stages moves the
reported burnout to the booster's. Measured on `03.Three-stage.ork`: **202.8 m/s at 787.4 m becomes
44.9 m/s at 366.6 m, 77.9% low** — published straight onto the *Burnout velocity* stat a flyer sizes an
ejection delay against. The latch is now separate and the corpus test asserts the sustainer's figure
directly; a negative control that re-merges them fails it at exactly 44.86 m/s. A `some(type ===
"burnout")` assertion stays green through that regression, which is why it is asserted as a range and
not a presence.

**Grouped by `stageIndex`, never by `detachTime`.** `lib/sim/setup.ts` gives every stage leaving at one
joint the same detach time, so grouping by it merges two stages that burned separately —
`03.Three-stage.ork` is that design. `ResolvedMotor` carries `stageIndex` now; it is optional because
the unit fixtures build that literal by hand for single-stage flights, where stage 0 is the right answer.

**The event carries an INDEX, not a name.** The phase table already owns a naming rule — it numbers only
ambiguous stages, as `Booster stage (stage 2)` — and a second rule in the solver would render one stage
two ways on one page. The solver labels separations generically for the same reason.

**The phase window is closed at its end and open at its start.** A burnout and the separation it causes
are the same instant on the default staging rule, so a window closed at both ends puts the booster's
burnout in the row it ends AND the row it begins. Walked in the built export before the fix: the starter
with a booster printed row 2 as *1.3 s Booster · 2.6 s Sustainer*. After: row 1 reads 1.3 s, row 2 reads
2.6 s — which is R5's own *done when* example.

**Where it is a genuinely new number.** On the default rule a stage's burnout EQUALS its separation, so
the column restates the *To* column; on the `ejection` rule it does not, and that gap is what no surface
named — `Complex.Two-Stage.CDX1` burns out at 2.40 s and parts at 4.40 s, `ARC payload rocket.ork` 1.43
against 10.43.

**The gap that remains, which is increment 4 rather than a reason to re-open this.**

- **RESOLVED by increment 3 — per-stage burn intervals were not in the result.** The entry read: only
  ONE burnout event is emitted per flight ever, the last motor's, so a "burnout" column would be blank
  on every row but one — 8 of the 9 multi-stage corpus designs reported exactly 1, including the 3-stage
  design that burns three motors, and the ninth (`rocksimTestRocket2.rkt`) reported 0 because no motor
  resolves and it never flies. It now emits one per stage that burns: **14 events across the 9
  multi-stage designs, 5 of them logging more than one.** The `rocksimTestRocket2.rkt` case is unchanged
  and correct — a stage that never lights has no burnout to report, and the column says *no motor
  burned* rather than leaving a cell blank.
  *(Its own suggestion — group by `detachTime` — would have been wrong: that value is shared by every
  stage leaving at one joint, so it merges two stages that burned separately.)*
- **A separation event names no stage.** `simulate.ts` labels every one `"Stage separation"`, so the table
  derives its names from the phase slice rather than from the event. Filed in `BACKLOG.md`.
- **The table is a sixth bespoke `<table>`.** `DataTable` still does not exist; this one copies
  `MassBreakdown`'s markup deliberately rather than inventing a seventh style, and it does not sort or copy.
  That is P1's last slice, sized by `COMPETITION.md` row 24.
- **"Give it its own motor mount and fins" is inherited, not authored.** The seed carries both because
  it is cloned from a tube that has them; there is no `AddedPart.kind` for a motor mount, so a booster
  cannot be given one it did not inherit. That is why the refusal above exists rather than a gesture.

  **This is increment 4, it is the LAST clause of R5's *done when*, and it was scoped in depth on
  2026-07-31 rather than started — because the scope found five hazards, two of them Sev-1-shaped, and
  a half-landed version of this ships a confident wrong number.** Fins onto a booster already work
  (`buildAdded`, `edit.ts:2027`); the only missing gesture is *add a motor mount to this tube*. Written
  down so the next session starts from the traps rather than finding them:

  1. **The pipeline order is the same guard as the refusal, and this is the load-bearing one.**
     `applyAddedStages` runs FIRST, before `applyAdds` (`edit.ts:2012`, reasoned at `:2004`), so
     `stageSeedBase` (`edit.ts:1882`) passes only `edits.addedStages` and never `edits.added`. A mount
     the flyer authors onto the aft tube is therefore **invisible to `buildStage`**: `canAddStage` still
     refuses and the booster still clones a mount-less tube. On the 2 designs this increment exists for,
     the gesture would appear to work and change nothing. Reordering destroys the anchoring property the
     order exists for — the corpus-measured 123-state justification for ignoring `added` is right for
     every existing kind and points exactly the wrong way for this one. **Resolve this before writing
     any code.**
  2. **`canAddStage` tests that a mount EXISTS, never that an instance names it** (`edit.ts:1744-1788`).
     With mounts authorable, an EMPTY mount satisfies the gate, and `applyAddedStages` then falls back
     to `cfg.instances[0]` (`edit.ts:1844`) — the documented 11.9%-low case, reachable by authoring, on
     `03.Three-stage.ork`, which is one of the two designs the 55%-apogee-gain refusal was written for.
     The refusal must test for a live instance.
  3. **A mount is a FIELD, not a component** — `motorMount?: MotorMount` on `BodyTube` (`types.ts:120`)
     and `InnerTube` (`types.ts:201`). `buildAdded` can express "a new inner tube carrying that field";
     it has **no shape at all** for "set the field on an existing tube", which mutates rather than
     builds.
  4. ~~**Cluster count scales the HOST tube's mass.**~~ **FIXED 2026-08-01 as a Sev-1, ahead of this
     increment, because the premise "today only motor tubes carry a mount, so only a motor tube scales"
     was false: 12 of the 35 real designs carry the mount on a `bodytube`, and the "Motor cluster" field
     has always been offered on them. Typing a 3 on `01.One-stage.ork` moved dry mass +38.7% and CG
     +39.7 mm. `lib/sim/mass.ts` now scales only an `innertube`, pinned by three synthetic cases in
     `mass.test.ts` (no corpus design ships a cluster on a body tube, so the sweep cannot prove it).**
  5. **`primaryMotorClusterCount` reads the FIRST mount in flatten order** (`edit.ts:788`), so a mount
     authored forward of the real one makes the Motors field read 1 while the design flies N.

  **Also moves:** `lib/corpus/sweep.test.ts`'s 33-authored/2-refused split, and `edit.test.ts:2719`,
  which pins `canAddStage === false` for a bag whose only content is `added` — that assertion becomes
  *wrong* rather than stale.

  **Size: 2–3 increments on its own.** It is the last clause of R5, so R5 stays IN PROGRESS until it
  lands; the rest of the *done when* — add a booster, fly a staged flight whose phase table matches what
  was built, and remove the stage again — is shipped and pinned.
- **A stage authored on a design with several configurations flies the same motor in all of them**, and
  a flyer cannot yet pick a different one for the booster. `motorSwap` is a whole-design what-if.
- **Only an AUTHORED stage can be removed.** An imported one cannot: `removalRefusal` counts body tubes
  within a stage, so a flyer cannot empty an imported stage part by part either. A stage-level removal
  for imported stages needs `Stage` to gain an id, which touches all three adapters and the exporter —
  recorded in *Decisions taken without the owner*.

---

## R6 — A built design leaves Loft intact

**Status: DONE — 2026-08-02.** The *done when* is met and asserted: a design authored in Loft — the
starter plus all three flat structural adds — round-trips through `exportOrk` → `importDesign` with
every component, every id, every material and every mass surviving, and the flight it describes
unchanged (`lib/ork/export.test.ts`, "round-trips a design authored in Loft, part for part and id for
id"). **0 of 9 components change identity**, where 3 did before.

The test names what a trip through the file is ALLOWED to change rather than comparing loosely, because
a tolerance wide enough to swallow a real loss is not an assertion. Three things are permitted: a field
that was `undefined` coming back as the default the format writes for it (the file cannot spell
"unset" for `shapeParameter`, `cantAngle` or the shoulder caps); six-decimal rounding, which is the
precision `.ork` is written at; and a canopy's restated `overrideMass`, allowed only where it equals
the mass the canopy already had, and filed. Anything else fails with the field named.

**Not claimed: byte-equivalence for every IMPORTED design.** The milestone's own words are about a
design authored in Loft, and that is what is asserted. A `.rkt` or `.CDX1` is a translation from a
format with different primitives, and the remaining gaps are inventoried below and in `BACKLOG.md`.

**The Sev-1, fixed.** A RASAero file states one launch weight and no per-part masses, so its whole
mass is a single point mass, and `removalRefusal` refuses to delete it — taking it out leaves a rocket
with no mass at all, which Loft would still fly and still report a confident apogee for. That refusal
hung on a `standsForAirframe` flag the RASAero adapter set by hand, and `.ork` has nowhere to write it
down. So Loft's own Download button undid Loft's own safety refusal: save `Show-off.CDX1` as a `.ork`,
reopen it, and the 453.6 g is still there but is now deletable — 453.6 g → 0.0 g, still flying.
`OR vs RAS Test 1.CDX1` went 17145.8 g → 12777.0 g and still reported 7373 m.

It is now **derived rather than remembered**, in the single import funnel, from the thing the refusal
actually claims: *would taking this out leave the stage with no mass at all?* That question can be
asked of any design, from any format, at any point in its life, and there is nothing left to lose in a
file. Per stage, because a staged rocket is several airframes flown in sequence — a whole-design test
sees `Complex.Two-Stage.CDX1`'s two airframe masses holding each other up and flags neither.

Checked against all 35 corpus designs: it reproduces the hand-set flag **exactly**, both as imported
and after a round trip, and does not fire on `EscapeVelocity.ork`, whose stage carries its 2000 g as a
subtree override and whose one mass object is therefore a real part and stays removable. A first
attempt at the predicate — "the stage's structural mass is zero" — DID fire on it, because
`massByComponent` reports 0 for components subsumed by a stage-level override and attributes the
lumped mass to no component at all. Deriving from what removal costs avoids that class of mistake
entirely; deriving from a sum of parts walks into it.

**Second slice, 2026-08-02 — per-configuration ignition and configuration names.** Two losses where
the importer already read what the exporter never wrote, so both were one-sided gaps rather than
format limits.

A design can airstart a mount at a different delay in EACH motor configuration — one
`<ignitionconfiguration configid=…>` block per config — which is exactly how a staggered airstart
study is set up. The exporter wrote only the mount-level pair, taken from the FIRST configuration, so
the round trip applied one config's timing to all of them: `Airstart timing.ork`'s four configurations
at +1 s, +2 s, +4 s and +6 s all came back at +0 s, and its five configurations — which fly 1268.50 m
to 1296.52 m — all flew the identical 1296.52 m. The whole reason that design exists was erased by
saving it. Blocks are written only where a configuration DIFFERS from the mount default, so a design
that never used the feature gains no elements.

And the configuration NAME — how a flyer picks which flight they are looking at — was never written
at all: 29 configurations across 9 corpus designs came back labelled with their own raw ids, and on a
design built here the starter's only motor label "H128W" returned as "cfg-1".

Both pinned by one test built from the small two-stage fixture rather than the 280 kB corpus design
that found them, with a negative control on each half.

**Third slice, 2026-08-02 — a freeform fin keeps its shape.** The largest measured flight-number loss
in the round trip, and the one the exporter's own comment had already named the fix for: stop
discarding the outline. A freeform fin is defined ONLY by its outline, and the model reduced it away
at import to span/area/sweep, so an export had to invent an equal-area trapezoid — whose tip solution
goes negative whenever the planform tapers hard, at which point the clamp writes a fin strictly LARGER
than the one drawn.

The model retains the points now, for the OpenRocket and the RockSim reader alike, and the exporter
writes `<finpoints>` back. All **9 freeform sets across the 8 corpus designs that carry one** survive a
download and re-open with static margin unchanged to three decimals — including
`Pods--airframes and winglets.ork` at 2.134 → 1.449 cal (−32%) before, and `rocksimTestRocket2.rkt`,
which had been losing its `over-stable` warning outright.

**And a near-miss the change itself created, caught by driving it.** Keeping an outline means an edit
that moves the set's `height` and `area` while leaving the points alone would export the fin the flyer
STARTED with — so saving a design would silently undo the edit. Measured before the fix: stretching
`Pods`' "Cockpit" set 7.0 mm → 10.4 mm and downloading gave a file that reopened at 7.0 mm, static
margin 2.077 → 2.134. `applyGeometryEdits` now scales the outline's span with the same factor it
already applies to `area`. Pinned, with a negative control.

The equal-area trapezoid is still what a set with NO outline gets — an elliptical set, or a freeform
set read from a design an older Loft saved — so its two tests stay, relabelled as the fallback.
`/docs/limitations` is rewritten, including why a design saved by an older copy cannot be recovered.

**Fourth slice, 2026-08-02 — a plugged motor stays plugged.** A plugged motor carries no ejection
charge at all; OpenRocket spells it `<delay>none</delay>` and the importer reads it back as `plugged`.
Its `delay` is NaN and `num()` maps NaN to "0", so the round trip turned "this motor cannot deploy
anything" into "it fires at burnout" — 42 instances across 10 designs, two of which carry recovery
devices set to `ejection` alongside a plugged motor, where the difference decides whether the flight is
reported as coming in ballistic. All 42 survive now.

**And one slice deliberately NOT taken, with the measurement that says why.** The exporter invents an
`<overridemass>` for every canopy without one (24 canopies, 18 designs), which then defeats the
builder's parachute resize — the control still moves and nothing re-masses. It reads like a gratuitous
workaround and it is not: removing it drops `A simple model rocket.ork`'s canopy from 7.976 g to
4.736 g, because the importer computes a different mass from the material and packed dimensions the
exporter faithfully writes. The real work is finding out why those two disagree. Filed in `BACKLOG.md`
with both numbers so the next session does not re-derive the dead end.

**Fifth slice — the authored parts keep their identity.** The three flat structural adds minted
readable composite ids (`${tube.id}-boattail`, `-payload`, `-drogue`). Deterministic, but not UUIDs —
and `lib/ork/export.ts` hashes a non-UUID id into a fresh one on the way out, because `.ork` ids are
UUIDs. So all three changed identity every time the design was saved. A design built here is persisted
as its own exported bytes, so that is not an export-only detail: a selection, an aim or an undo naming
one of those parts stopped resolving after a reload — the exact defect R2's id work was meant to close.
They are minted as UUIDs now, seeded from the same host id, so they stay stable AND survive untouched.

Four tests used the composite id as a lookup channel for "which tube did this attach to", which is why
it existed. They assert the relationship where it actually lives now: the payload through the TREE (it
is a child of its tube), the boattail through the GEOMETRY (it is the tube's SIBLING — a transition
added at the tail hangs off nothing, and the composite id was genuinely the only record of its host).

**State of the round trip for IMPORTED designs**, measured rather than guessed: on the first
export → re-import, **0 of 36** designs (35 corpus + the authored starter) reach a byte-equivalent
model — 11 field diffs at best, 146 at worst; the model becomes a fixpoint only on the SECOND trip. So
the next increment is the test that states which fields are allowed to move and which are not, and the
named exceptions are already inventoried: freeform fin sets written back as trapezoids (9 sets, 8
designs, up to −32% static margin), per-configuration ignition collapsing to one delay (all 5 of
`Airstart timing.ork`'s configs become identical), motor-configuration names dropped (29 configs, 9
designs), plugged motors losing `plugged` and reading as a 0 s delay (42 instances), and canopies
acquiring an invented `<overridemass>` that then defeats a later resize (24 canopies, 18 designs).

**Outcome.** What a flyer builds is theirs to keep and to take elsewhere.

**Done when** a design authored in Loft round-trips: export it, re-import it, and get a
byte-equivalent internal model with every authored part, material and mass surviving — asserted by a
test, not by eye.

**Notes.** `downloadOrk` exists and is known to drop `ballastKg` (filed in `BACKLOG.md`). A builder
whose output loses parts is worse than no export, so this milestone is where that gets fixed and
pinned.

**Size.** 2–4 increments.

---

## R7 — Per-set fin drag, and the honest aero the builder needs

**Status: SHIPPED 2026-08-02, with ONE *done when* clause not delivered and the reason measured.**
Increments 1–5. **Do not re-open this milestone, and above all do not re-attempt per-set thickness or
sweep** — that is now four measured rejections, and the fifth would cost a session and land where the
other four did. The undelivered clause and what would unblock it are recorded under *The gap R7
leaves* below; it is the R-track's carried-forward starting point, not a reason to restart.

Increment 1 was the edge **cross-section**,
now charged per fin set. Pinned by `lib/sim/aero.test.ts`'s *fin cross-section is charged per set, not
design-wide* (four cases, including the exact-halfway assertion that a "less drag" under-count could
not satisfy) and by the corpus census, whose published figures were tightened in the same change.

**What moved, measured over 97 stored simulations on 35 real designs:** timeToApogee 1.7% → **1.5%**,
maxMach 2.1% → **2.0%**, maxVelocity 2.3% → **2.2%**, optimumDelay 2.7% → **2.5%**, maxAltitude
3.2% → **3.1%**. One moved the other way and it is published rather than rounded away: deployment
velocity 5.9% → **6.0%**, which arrived with the transonic bound below rather than with the per-set
split. `PUBLISHED_MEDIAN_PCT`, `/docs/validation` and the methods page were all updated in the same
commit — a claim left at its old looser figure is a gate that has stopped gating, in either
direction.

**A second defect, found by reviewing the diff and fixed with it.** The streamlined-edge
compressibility term was unbounded — 4.12 at its M0.99 clamp, against a square edge's stagnation
coefficient capping at 1.06 — so from about M0.95 upward an *airfoil* fin was billed MORE
leading-edge drag than a blunt one. Measured on a real design's geometry, total Cd: at M0.30 square
0.780 / rounded 0.474 / airfoil 0.451, correctly ordered; at M1.20 square 2.216 / rounded 3.219 /
airfoil 3.183, inverted. A flyer using the cross-section what-if on a Mach flight was told that
streamlining the fins costs them apogee. It is now bounded by the stagnation coefficient — the
model's own claim that a stagnation face is the worst case an edge can present — and the ordering is
asserted at ten Mach numbers rather than at one. Pre-existing rather than introduced here; the
per-set split is what made it reachable on a mixed design.

**And the one design it made worse, which is the honest half.** `03.Three-stage.ork` went from apogee
−7.57% to **+10.76%** and max velocity −3.78% to +4.95%. The cause is known rather than mysterious:
three of its five sets are rounded and were being billed square (over-drag), while its leading-edge
sweep is *still* collapsed to one design-wide 22.4° against five real sets at 35.0–70.6° (also
over-drag). The two were partly cancelling and only one is fixed. Recorded in that design's
`KNOWN_ISSUES` entry with both before-and-after numbers.

**Per-set SWEEP was written, measured and reverted in the same increment.** It improved no census
median — optimumDelay went back 2.5% → 2.7% — and it pushed a real design outside the corpus's own
agreement tolerance, which is the same shape as the area-weighted thickness attempt before it. It is
the next slice and it needs its own investigation, not a rider on this one. **Do not simply re-apply
it** — increment 3 below did the investigation and found why both attempts failed.

*Increment 2 — R7's own instrument, fixed.* `runFromDocument` named three of `RunOptions`' twelve
fields and silently dropped the other nine (`ballistic`, `timeStep`, `ballastKg`, `motorSwap`,
`geometry`, `thrustScale`, `massScale`, `dragScale`, `recoveryCdScale`). A caller got a flight, with
no error and no warning, that had ignored what it asked for. Nothing user-facing depended on it — the
app calls `runFlight` directly — but the corpus suite drives this function, so no corpus-wide
sensitivity to any of those nine was measurable at all.

Now spread-then-override, so a field added to `RunOptions` is forwarded the day it is added rather
than the day somebody notices. **The before-and-after, on `03.Three-stage.ork`:** every `dragScale`
from 0.1 to 3.0 previously returned the identical −7.57% apogee error; it now spans **+175.81% to
−36.27%**. Every existing caller passes only the three already-forwarded options, so nothing changed
for any of them — the corpus census is identical to the tenth on all ten metrics. Pinned by
`lib/sim/flight.test.ts`'s *runFromDocument forwards what it is given*, three cases, each pairing a
changed option with the number it must move.

*Increment 3 — the thickness and sweep collapses, measured a third time and REJECTED, with the
reason found.* Both were implemented per-set and both were reverted. **Do not implement either again
without first reading this entry — it is the third attempt and the first one that explains the other
two.**

*What was built and measured.* (a) Fin wetted area banked by (finish, own `1 + 2·(t/c)`) instead of
by finish alone, so each set is charged its own thickness ratio — the same one-key-wider
accumulation the finish already gets, with `finThicknessRatio` becoming the area-weighted mean for
the one whole-vehicle consumer left (wave drag). (b) On top of that, fin frontal area banked by
(edge, own `cos²Λ`). Both typechecked, both left the corpus suite green at 14/14.

*The measurement, over 97 stored simulations on 35 real designs.* Per-set thickness alone moved no
census median toward zero, and moved one away: maxMach **1.9918% → 2.0275%**. Every other median was
identical to four decimals. The two designs R7's *done when* protects both moved the WRONG way —
`Complex.Two-Stage.CDX1` J180T apogee **+4.5254% → +4.9578%** and J90W **+12.3991% → +12.8813%**,
`The Red Hunter.ork` **+4.4441% → +5.3484%**. Adding per-set sweep took `Complex.Two-Stage.CDX1` to
J180T **+13.98%** and J90W **+22.60%** — the J180T configuration is ASSERTED at ±12%, so that is the
gate failure the earlier session recorded, reproduced exactly, along with its optimumDelay **2.4766%
→ 2.6593%**.

*Why — and this is the finding that unblocks the slice.* A collapsed value is **not** biased in one
direction — it lands wherever the last set read puts it, so correcting it adds drag to some designs
and removes it from others. Of the twelve designs the thickness fix changes, eight carry comparable
stored results and they went both ways (`APEX_K_Dart.ork` −18.3845% → −18.4635%, i.e. MORE drag;
`03.Three-stage.ork` +10.7571% → +10.8941%, LESS). What matters is which designs it takes drag away
from: the two that move most are ones Loft **already flies high**, i.e. already under-dragged from
somewhere else. `Complex.Two-Stage.CDX1` starts at +4.5%/+12.4% apogee and its
J90W configuration is already a `KNOWN_ISSUES` entry saying RASAero stores nearly the same apogee for
two very different motors and Loft does not reproduce that. So removing a spurious over-drag moves
these designs FURTHER from their stored results. The two collapses are partly compensating for a
separate, unidentified under-drag — which is why every attempt to fix them in isolation has failed,
and why fixing both together was worse than either.

*A hypothesis tested and refuted along the way.* The `0.35` floor on `cos²Λ` is NOT what breaks
`Complex.Two-Stage.CDX1`: its per-set factors are 0.500/0.640/0.367 against a design-wide 0.640, none
floored. The floor is still worth a source, though, and the scale is now measured: charged per set it
binds **15 of 51 fin surfaces across 13 designs**, against **8 designs** floored design-wide today.

*So the next slice is not a fin slice.* Find the drag `Complex.Two-Stage.CDX1` is missing — a
two-stage RASAero design already at the edge of the corpus's tolerance — and the per-set corrections
land on top of it instead of against it. **The *done when* clause "the corpus census does not regress
on the two designs the reverted area-weighted attempt broke" cannot be met by a fin change alone, and
should be read as pointing at that under-drag rather than as a veto on per-set fin drag.** Published
on `/docs/limitations` in the same increment, with the numbers, rather than left in this file.

*A STRONG LEAD on that under-drag, from a partial investigation — measured but NOT yet verified.*
A read-only fan-out was started on it and **interrupted before its adversarial-verification pass
ran**, so everything here is a first measurement by one agent, not a confirmed finding. It was
salvaged from the transcripts rather than lost, and it is specific enough to re-drive in minutes.
**Re-derive each number before building on it.**

Loft assembles this design's body profile with real diameter STEPS that nothing charges:

```
step at x=18.05 in : 3.000 -> 2.500 in      step at x=55.00 in : 3.000 -> 3.250 in
step at x=18.75 in : 2.500 -> 3.000 in      step at x=64.00 in : 3.250 -> 6.000 in   <- interstage
step at x=71.50 in : 6.000 -> 6.500 in      step at x=72.05 in : 6.500 -> 0.000 in   <- base
```

The 3.25 in → 6 in interstage flare into the booster is the big one, and the shoulder term is very
nearly empty: measured `full shoulderCdA = 5.0671e-4 m²` against a reference area of `2.1408e-2 m²`.
Charging that flare as a real shoulder takes it to `1.2023e-2 m²` — a **ΔCd of 0.5380** on the full
reference area. The apogee effect, measured on both configurations:

| variant | J90W | J180T |
|---|---|---|
| baseline today | **+12.3991%** | **+4.5254%** |
| W1 — interstage flare charged | **−0.7078%** | −9.9212% |
| W2 — the real stepped profile, no protuberances | −4.9641% | −13.5954% |
| W3 — W2 plus the protuberance | −6.2143% | −14.7414% |

So W1 very nearly lands J90W (+12.40% → −0.71%) while over-correcting J180T (+4.53% → −9.92%).
That is not a finished answer, but it is the first change measured that moves the design the RIGHT
way and by the right order of magnitude, which three fin attempts did not. Drag sensitivity for
scale: a uniform `dragScale` of 1.10 takes J90W to +6.73% and J180T to −0.95%, so the two
configurations do not want the same amount of extra drag — whatever is missing is not a flat scale.

*Two loose threads from the same partial run, neither verified.* The file carries
`<UseBooster1> False` while Loft flies the booster as its own stage (it emits a warning saying so) —
worth establishing whether RASAero's stored numbers are a sustainer-only flight, because if they are,
the whole comparison is between two different vehicles. And a probe printed `liftoffMass=NaN` for
both configurations; that is **most likely the probe reading a field that does not exist on
`summary`** rather than a real defect — it printed the summary's key list and `liftoffMass` is not
among them — but a NaN reaching a flyer would be Sev-1, so confirm which it is before dismissing it.

*Increment 4 — the missing drag is found, and deliberately NOT charged.* The under-drag increment 3
sent the next slice looking for is a **bare mould-line step**: a diameter increase the airframe makes
with no transition to make it over. `aero.ts` charges a transition by its joint angle and has no term
for a step, and that silence was already recorded in two code comments and on the limitations page
without ever being closed. It is not rare — 33 of the 115 judgeable joints step, in 13 of the 35
designs; 27 of those, in 9 designs, clear the 0.5 mm threshold at which a step stops being a rounding
artefact, median 12.70 mm and up to 82.55 mm. `Show-off.CDX1` runs a 1.5 in tube straight into a
2.73 in fin can.

**Charging it was tried and reverted, and this is the fourth such measurement on R7 — read it before
trying a fifth.** Taking Niskanen eq. 3.86 to its own abrupt limit (φ=90°, so `0.8·ΔA`) takes
`02.Two-stage.ork` from agreeing to **−35.2%** apogee and `Complex.Two-Stage.CDX1` J180T from +4.5%
to **−20.8%**, failing the corpus. The reason is physical rather than arithmetic: 0.8 is Hoerner's
measured **flat-face** value for a body meeting clean air (Niskanen eq. 3.86 cites NAVWEPS 1488;
Hoerner Fig 3.11 supplies the 0.8 flat / 0.2 rounded / 0.01 spherical values), and a step is an
annulus sitting inside the boundary layer of the body ahead of it. **What would unblock it is a
published forward-facing-step coefficient as a function of step height over boundary-layer
thickness** — that is the source to go looking for, and it is `UNVERIFIED` whether one exists in
citable form. Until it does, the estimate stays withheld and the geometry is reported: a flight of a
stepped airframe now cautions and names the step. Pinned by `lib/model/geometry.test.ts` and by the
corpus's *says so on every real design whose airframe steps*.

Two threads increment 3 left open are settled, both against the file rather than by inference.
`Complex.Two-Stage.CDX1`'s design-level `<UseBooster1>False</UseBooster1>` does **not** mean its
stored results are a sustainer-only flight — every `<Simulation>` carries `<IncludeBooster1>True`
with a booster motor and stack weight, and `lib/rasaero/adapt.ts:339` already reads that flag rather
than the design-level one, so the comparison is between the same vehicle. (Corroborated by
measurement: flying the sustainer alone gives −11.76% / −10.41%, worse on J180T and no better on
J90W.) And `liftoffMass` is not a field on the run summary at all, so the `NaN` a probe once printed
was the probe's bug.

**A correction to this file's own record.** The W2 figures above (−4.96% / −13.60%) do **not**
reproduce. Two independent measurements this run put that variant at **−12.92% / −20.92%**. The W1
figures reproduce to within 0.03 pp. The salvaged table's step list was also mislabelled in two
places: the interstage flare is 2.750→6.000 in, not 3.250→6.000 (a boattail already tapers
3.25→2.75 first), and the 6.000→6.500 entry is not an uncharged step at all — it is a real
transition, and it is the entire 5.0671e-4 m² the design's shoulder term already carries.

*Increment 5 — a Sev-1 found by the opening fan-out, in the same slice's surface.* The RK4 step bound
that keeps an open canopy's stiff drag stable was reachable only after apogee, so a device opening at
or before apogee integrated at the flat boost step unbounded. `FullScaleModelTH.rkt` returned an
apogee of **2.07e13 m** at a recovery size of 5×, and `Complex.Two-Stage.CDX1` a ground-hit speed of
**7.52e32 m/s** and a landing energy of **4.00e65 J** at 10×, under a confident "hard landing"
warning — both from inputs inside the field's own 0.1–10× range. The step now follows the canopy
rather than the clock, and `DESCENT_STEP_MIN` moved 0.002 → 2e-4 because the floor, not the bound,
was binding above ~67 m/s on a 10× canopy. A flight that never lands now withholds its ground-hit
speed and landing energy instead of reporting the solver's sentinel zeros. Census identical on all
ten metrics. Pinned by a corpus assertion that flies all 35 designs at 0.1/2/5/10× — 124 flights.

*Remaining:* the thickness-ratio and sweep collapses, both blocked as above; and the adjacent parse
gaps below.

**The gap R7 leaves, stated so the next session does not re-derive it.**

*Delivered:* the cross-section is charged per fin set; `runFromDocument` forwards all twelve options,
so a drag change is measurable across the corpus at all; the methods page claims nothing per-fin the
code does not do; the limitations page names every remaining collapse with its number; and the census
did not regress on the two designs the reverted area-weighted attempt broke.

*NOT delivered:* the **thickness ratio** and **leading-edge sweep** are still collapsed to one
design-wide value each. Four attempts, four reverts, and the reason is now understood rather than
mysterious: a collapsed value is not biased in one direction, so correcting it removes drag from
designs Loft already flies high — which are already under-dragged from somewhere else. Increment 4
found that somewhere else (the bare mould-line step) and established that it cannot be charged
without a published forward-facing-step coefficient as a function of step height over boundary-layer
thickness. **So the order is fixed: find that source first, charge the step, and only then re-attempt
the fin collapses on top of it.** Attempting them in either order without the source has now failed
four times. If the source turns out not to exist in citable form, the honest end state is the one
shipped here — report the geometry, withhold the estimate — and the fin collapses stay documented
rather than corrected.

**Outcome.** A rocket a flyer just BUILT with two different fin sets is flown with each set's own
drag — and every page that describes the model says what the model actually does.

**Done when** the drag build-up takes each fin set's own cross-section, thickness ratio and
leading-edge sweep instead of one design-wide value; `app/docs/methods` claims nothing per-fin that
the code does not do, and `app/docs/limitations` names every collapse that remains, each with the
number that makes it real; the corpus census does not regress on the two designs the reverted
area-weighted attempt broke; and `runFlight`'s options survive `runFromDocument`, so a drag change can
be measured across the corpus at all. Pinned by a unit test that flies a two-set design whose sets
have different cross-sections and asserts the drag differs from both single-set answers, plus the
existing census gate.

**Notes — this milestone is unusually well measured before it starts.** The opening fan-out re-drove
every number below on 2026-08-02, so they are this run's measurements rather than the ledger's memory.

*Three collapses, not the two `BACKLOG.md` records.*

1. **Thickness ratio** — `lib/sim/aero.ts:517`: `finThicknessRatio` is the MAX thickness across sets
   divided by the LAST set walked's mean chord. It belongs to no real fin, and it changes if the sets
   are reordered without the rocket changing. `Show-off.CDX1` reads **1.00** where both its sets are
   0.50. `Pods--airframes and winglets.ork` reads **0.122** against an area-weighted 0.046.
2. **Leading-edge sweep** — `lib/sim/aero.ts:505`: one angle for the whole design, `atan2(last set's
   sweepLength, max span across sets)`. `Mini Honest John.ork` reads **unswept** because its 1-fin set
   is walked last, while the 4-fin set that does the work sweeps **44.5°**.
3. **Cross-section — the one nobody had filed, and measurably the largest.** `lib/sim/aero.ts:343,523`
   takes the DRAGGIEST edge present across all sets (`square > rounded > airfoil`), so an
   airfoil-sectioned set is billed square-edge stagnation drag because some other set is square. On
   `03.Three-stage.ork` at 100 m/s / 300 m the fin-pressure Cd is **0.6481 of a 1.1745 total**, and
   per-set accumulation takes it to **0.2189**.

*Why the cross-section is the first slice.* It is the only one of the three that is exactly
value-preserving on the two designs the reverted area-weighted fix regressed —
`Complex.Two-Stage.CDX1` (all six sets square) 0.1118 → 0.1118 and `The Red Hunter.ork` 0.3614 →
0.3614 — and on all 22 single-set designs. The design it does move, `03.Three-stage.ork`, is **7.57%
LOW on apogee and 3.78% low on max velocity**, so removing over-stated fin drag moves both toward
zero. And it needs no new source: the code already cites Niskanen/Hoerner for a model that is defined
per fin set, so the defect is applying a per-set published model design-wide.

*A published page currently overstates the model.* `app/docs/methods/page.tsx:347` says the `cos²Λ`
reduction "uses each fin's actual leading-edge sweep". That is false on every multi-set design, and
nothing under `app/docs/` discloses any of the three collapses. Correcting the claim is part of the
first slice, not the last — a docs page that overstates the model is the SAFETY invariant's
false-precision case on a public artifact.

*What is BLOCKED, and it blocks measurement rather than shipping.* `lib/sim/run.ts:242` —
`runFromDocument` forwards only `configId`/`overrides`/`validateAgainst` to `runFlight` and silently
drops `dragScale`, `geometry`, `ballistic`, `timeStep`, `ballastKg`, `motorSwap`, `massScale`,
`thrustScale` and `recoveryCdScale`. Measured: `dragScale` 0.1 and 3.0 both leave
`03.Three-stage.ork` at exactly −7.57%. The corpus suite drives that function, so no corpus-level drag
sensitivity is measurable until it is fixed. Nothing user-facing is affected — the app calls
`runFlight` directly — but this is R7's own instrument and it is broken.

*What NOT to touch without a source.* The `0.35` floor on `cos²Λ` (`aero.ts:529`, silently bounding six
corpus designs) and the `2.0` fin coefficient in the wave-drag term (`aero.ts:744`) have no published
origin recorded in the code or the docs. Making either per-set would be inventing a model rather than
fixing one. `waveDrag` says of itself that it is "a bounded parametric estimate"; leave it saying so.

*Adjacent, already inventoried, and each its own slice at most:* `<cant>`/`<CantAngle>` is parsed into
the model and read by nothing (2 corpus `.ork`, 5 `.rkt` sets state one); `<overridecd>` is ignored
(exactly 1 corpus file, whose own `<comment>` says the technique IS that checkbox); fin tabs are
ignored by both the `.ork` and `.rkt` adapters (6 `.ork`, 5 `.rkt` occurrences); `<filletradius>` is
ignored on 25 fin sets across 24 of the 27 corpus `.ork`, disclosed as a mass gap and never as a drag
one; RASAero's per-fin `<LERadius>` is ignored where it would give a measured leading-edge radius
instead of an inferred edge class.

**Size.** 3–5 increments.

---

## R8 — Component and material catalogues

**Status: IN PROGRESS** — increments 1 and 2 of 3–5 shipped 2026-08-02, along with the
decomposition. The licence question the after-list named as possibly the whole first increment is
**answered up front** so it is not re-litigated. **What remains is increment 3, the picker**, and it
is the only thing between this milestone and its *done when*: the data, its provenance and its query
API all exist and are pinned; nothing in the app imports them yet.

**Outcome.** Authoring becomes SELECTION rather than measurement: a flyer picks a real body tube by
vendor and part number and gets its dimensions and mass, instead of typing eight numbers off a ruler.
Every mass in the model becomes grounded in a stated material rather than a guess.

**Done when** the builder can add a body tube, nose cone, coupler, centering ring or parachute by
choosing a real commercial part; the chosen part's dimensions and material populate the model and the
flight changes accordingly; every material Loft uses carries a density with a cited source; and the
whole catalogue ships as bundled static data with its licence and provenance recorded. Pinned by a
unit test that resolves a known part number to its published dimensions, and by a check that every
material in the catalogue has a non-empty `source`.

**The licence question, settled — VERIFIED by reading the files, 2026-08-02.**

- **`github.com/openrocket/openrocket-database` is Apache-2.0**, not GPL. Repo-root `LICENSE` is the
  verbatim Apache 2.0 text and each vendor `.orc` carries its own copyright header (e.g.
  `loc_precision.orc`: "Copyright 2014-2019 by Dave Cook NAR 21953"). It holds **2,990 parts across
  13 vendors** — 1,012 body tubes, 772 nose cones, 343 centering rings, 314 transitions, 199
  couplers, 140 parachutes, 49 launch lugs, 45 streamers, 34 engine blocks — each with manufacturer,
  part number, description, ID/OD/length and a named material. **This is redistributable in an MIT
  bundle** provided the Apache text ships, the copyright headers are retained, and modifications are
  stated (Apache §4).
- **OpenRocket's own repo is GPLv3 but grants an explicit additional permission** under GPL §7 to
  "package this Program, or any covered work, along with any non-compilable data files (such as
  thrust curves or component databases)". Its build pulls the Apache database in as an external
  resource rather than vendoring it. So the component presets were never the GPL problem they look
  like — but the **~15 `.orc` files committed inside the GPL tree** under
  `datafiles/components/internal/` point at that repo's own LICENSE, and those stay off-limits.
- **OpenRocket's MATERIAL database is off-limits and this is the trap.** It is
  `core/.../database/Databases.java` — 82 rows of **compilable Java**, so the §7 data-file permission
  does not reach it, and its values carry MatWeb source URLs in comments. Do not copy it. **MatWeb's
  own terms forbid redistribution outright** (`UNVERIFIED` — matweb.com returns 403 from the sandbox;
  read them before relying on this).
- **There is no modulus data in the Apache repo at all** — its `generic_materials.orc` has 313 rows
  of DENSITY only. The flutter model's stiffness values have to come from somewhere else.

**And the precedent to copy is already in this repo.** `scripts/gen-motors.mjs` is a dev-only
generator that reads 108 raw `.eng` files plus a hand-maintained `provenance.json` and inlines them
into `lib/motors/catalog.ts`, each entry carrying its ThrustCurve simfile id, info URL and licence.
The component catalogue should reuse that shape exactly — **with one thing deliberately NOT copied**:
60 of those 108 curves carry a licence of `null` or `"?"`, and 3 are `"free"`, which by ThrustCurve's
own definition includes GPL. That is a hole in an existing bundle, it is filed in `BACKLOG.md`, and
the new catalogue must not reproduce it — here the grant is a single explicit Apache-2.0 licence.

**What Loft has today, and it is thinner than it looks.** Three uncited tables:
`lib/model/edit.ts:38` `FIN_MATERIALS` (6 densities), `:51` `AIRFRAME_MATERIALS` (7 densities), and
`lib/sim/flutter.ts:40` `SHEAR_MODULI` (14 rows — the only modulus data in the repo). None carries a
source. The flutter METHOD is cited (NACA TN 4197) while the stiffness values it consumes are not,
which is a credibility gap as much as a licensing one — and several sit suspiciously close to
OpenRocket's GPL table (acrylic 1.15e9 against their 1.7e9, Lexan 0.79e9 against 0.786e9, Delrin
1.0e9 against 0.946e9). **Re-derive them from citable sources regardless of provenance**; that is
increment 1, and it is worth doing first because it is small, it is the honest half, and it does not
depend on any of the above.

*Increment 1 — SHIPPED. Every shear modulus carries its source, and two were wrong.*

`lib/sim/flutter.ts`'s fourteen values were uncited "representative engineering figures" sitting
under a method that cites NACA TN 4197 precisely — a citation gap on the one output in this app that
is a safety estimate. Chasing them established the provenance: they are round US-CUSTOMARY numbers
(3,800 ksi, 6,200 ksi, 89,000 psi, 725,000 psi, 435,000 psi, 13,000 psi), so the table descends from
the hobby fin-flutter literature rather than any primary materials document — and the current version
of that literature (Apogee *Peak of Flight* #615, 2023) disagrees with several of them.

**Corrected against primary sources:**
- **basswood 0.17 → 0.511 GPa** — low by a factor of THREE. USDA Wood Handbook FPL-GTR-282 ch. 5:
  E_L 10,100 MPa (Table 5-3a) × 1.10 × G_LT/E_L 0.046 (Table 5-1).
- **balsa 0.09 → 0.138 GPa.** Same derivation, E_L 3,400 MPa × 1.10 × 0.037.
- **aluminium 26 → 26.2 GPa** and **titanium 44 → 42.75 GPa**, MIL-HDBK-5J Tables 3.6.2.0(b1) and
  5.4.1.0(b). Both US Government works, so no licence question.

The 1.10 is the handbook's own footnote correcting for the shear deflection inside a bending test.
G_LT rather than G_LR because a design tool cannot know whether the flyer's stock is quarter- or
flat-sawn, so Loft takes the lower of the two in-plane constants. (G_RT, rolling shear, is the wrong
constant entirely — balsa's is ~11× smaller.)

**Six rows have no published value and now SAY so** rather than reading like the sourced ones:
phenolic, acrylic, polycarbonate, PLA, ABS, acetal, cardboard. The datasheets publish tensile and
flexural moduli and shear STRENGTH, but not shear modulus. For a wound kraft tube none is likely to
exist — winding angle, ply count, adhesive and paper grade dominate and no vendor states them. Two
more are indefensible as a single number at all: a carbon fin's in-plane modulus spans an order of
magnitude with layup (Loft takes the UD-lamina lower bound), and published G10 runs 2.9–11.7 GPa
(Loft keeps the low end deliberately, because it is also the fallback for unrecognised materials).

**Every error ran the same way** — too little stiffness, so too low a flutter speed, so a margin
reported thinner than it is. That is the right direction for a safety estimate to be wrong in, and it
is still not a number to hand out uncited: a flag that cries wolf teaches flyers to ignore it.

Pinned by `lib/sim/flutter.test.ts` — every row has a non-empty source, an unsourced row must say so
in words, and the two wood values are asserted against the handbook arithmetic rather than against
the constants. Published on `/docs/limitations`.

*Increment 1's second half — SHIPPED. The densities carry their sources too.* `FIN_MATERIALS` and
`AIRFRAME_MATERIALS` in `lib/model/edit.ts` set authored-part MASS, and mass feeds everything
downstream of it, so an uncited figure there is the same claim the shear moduli were making.

**Cited and corrected:** basswood 420 → **414** (Wood Handbook Table 5-3a, SG 0.37 at 12% MC), G10
and fibreglass 1850 → **1770** (Norplex-Micarta NP500A, SG 1.77 by ASTM D792), carbon 1550 → **1570**
(Hexcel HexPly 8552 nominal laminate density 1.56–1.58, the middle of a narrow band that moves with
fibre volume fraction), aluminium 2700 → **2713** (MIL-HDBK-5J, 0.098 lb/in³).

**Left alone, with the reason recorded rather than the number changed:**
- **balsa 130.** The handbook's own *Ochroma pyramidale* sample is SG 0.16 ≈ 185 — DENSER than
  typical contest stock. Balsa is sold graded by density over 100–250, so a single figure is a
  simplification whichever it is; adopting the handbook's would misrepresent what a flyer buys.
- **birch plywood 680.** The handbook has no plywood at all — it is clear-wood only — and its solid
  yellow birch (694) is a different material from Baltic aircraft ply.
- **cardboard 700.** No published density, and the derivation from two LOC tubes' published
  dimensions and weights (847–862) is very sensitive to the 0.050 in wall, which is the difference of
  two 3-decimal diameters: a 0.005 in rounding moves it ~10%. Not moved onto arithmetic that fragile.
- **kraft phenolic 950.** NEMA Grade X paper phenolic is SG 1.40, but that is a hot-pressed
  consolidated sheet, not a convolute-wound tube — citing it would be citing the wrong material.

**Blue Tube 1250 → 1270, and it stops claiming to know what it is made of.** Its `name` was
"vulcanised fibre", which is a GUESS — the vendor publishes no composition, and even Apogee's copy
says only that it is *suspected* to be a vulcanised cellulose fibre. That name is also what the
flutter estimate matches on, so a wrong one is a wrong stiffness under a confident label. The density
is derived from the vendor's own published tube dimensions and weights (1,266 and 1,301 across two
sizes) and recorded as a derivation, not as a material property.

Pinned by `lib/model/edit.test.ts`: every row has a non-empty source, an unsourced row must say so,
and Blue Tube's name must not claim a composition.

*Increment 2 — SHIPPED. 3,445 real parts, and six entries refused for lying.*
`scripts/gen-components.mjs` + `lib/components/catalog.ts` + `lib/components/orc/provenance.json` +
`THIRD-PARTY-NOTICES.md`, modelled on `gen-motors.mjs`. The 16 `.orc` files are vendored verbatim
under `lib/components/orc/` (2.2 MB) so the copyright headers Apache §4 requires travel with the
data; the generator parses them with `lib/ork/xml.ts` — the same parser that reads a flyer's
design — normalises to SI, and records the upstream commit per file. 82 KB gzipped, and nothing in
the app imports it yet, so the bundle is unchanged until the picker lands.

**The roadmap's own figure of "2,990 parts across 13 vendors" was low, and the reason is worth
keeping: it came from a case-sensitive `*.orc` glob that missed `BMS.ORC` and `ROCKETARIUM.ORC`.**
The real database is 16 files and 3,449 entries.

Three properties of the source data turned out to be load-bearing, each measured: a material's unit
comes from its `<Type>` and never from the `UnitsOfMeasure` attribute (six SURFACE rows declare
`g/m2` while carrying kg/m², which would fly canopies a thousand times too light); six material
names are defined more than once with different densities, so resolution is own-file first and then
`generic_materials.orc` by name rather than by filename sort order; and 113 part numbers collide
across manufacturers with 21 colliding inside one, so `findPart` returns nothing rather than a guess.

Six entries are refused rather than shipped, each recorded in the bundle as `REFUSED_MATERIALS` /
`REFUSED_PARTS`: `Paper, bulk` at 0.0011 kg/m³ in two files (lighter than air, referenced by 18 real
parts), an elastic cord typed `BULK`, three parts stating a bore wider than their outside, and one
Estes nose cone stating 4.250 in of wall on a 0.974 in body.

Pinned by `lib/components/db.test.ts` — a part number resolving to its vendor's published
dimensions, the BT-50/BT-60 industry standard reproduced from outside the vendored file, every
source carrying licence/repo/commit, no shipped density outside its physical band, no shipped part
with unbuildable geometry, and a stated mass cross-checked against one computed from geometry and
density.

*Increment 3 — NEXT.* The picker in the builder, and the model wiring: choosing a part populates
dimensions and material, and the flight moves. This is the whole remaining gap to the *done when*.
Two things already known that it should absorb: `materialOf` returns `undefined` for the 18 parts
whose density was refused, and the picker has to surface that rather than substitute a default; and
a vendor-alias table is owed, because the catalogue carries sixteen manufacturer strings for
fourteen companies ("Quest" and "Quest Aerospace", "MPC" and "MRC").

**Size.** 3–5 increments.

**Notes.** `COMPETITION.md` rows 2 and 3. Keep the corpus honest: a catalogue part must produce the
same internal Rocket model an imported one does, or the solver ends up with two shapes of truth.

---

## P1 — One design system, adopted

**Status: DONE — 2026-08-02.** Every §9 count is at its target or its recorded honest floor, all six
tables are on `DataTable`, the hand-rolled `<button>` count is down from 17 to the three primitives
that are not buttons, and the last clause — *fields* — closed when the two numeric-input primitives
became one. `components/LoftApp.tsx`'s `Num` is gone; its 28 call sites and `MonteCarlo`'s 7 are the
same `NumberField`, so §5's "every numeric input in either app is this" is now true rather than
aspirational. `PRIMITIVE_ADOPTERS.NumberField` is 2 and ratcheted.

**What the merge cost, and what it caught.** The rule was *keep the stronger of the two at every
point, never the newer*, and four of the six disagreements went the older primitive's way — see the
table in `components/ui.tsx`. Driving the merged field in the built export then turned up three things
no reading of either implementation would have:

- `display()` rendered a numeric **0 as blank**, which is true of the dispersion panel ("no spread")
  and false of the editor. Typing −30 into Rail angle is pulled to its 0 bound, the bound lands in the
  flight, and the box went empty — a field showing nothing while the flight used the number it had
  just been handed. Blank is now the caller's word: the 7 dispersion fields pass `x || ""` with an
  explicit `placeholder="0"`, so they keep the quiet empty box AND can still say "flying 0" when they
  refuse something.
- The visible hint sat **inside the `<label>`**, so it became part of the field's accessible NAME: one
  box was announced as "Field elev. (m) Height of the launch site above sea level". The guidance and
  the refusal now sit outside the label and are reached by `aria-describedby`, which is what a
  description is for; the name is one stable sentence again.
- Dropping `Num`'s `title` removed the **range words** from 28 fields with nothing put back — they had
  been hover-only, which §8 forbids outright, but hover-only is still more than nothing. A bounded
  field with no hint of its own now states its bounds *visibly*.

The latch that clears a refusal when what is being flown changes was the one behaviour recorded only
in a comment, and it is now pinned by an e2e test with a negative control: disable the latch, rebuild,
and the field stays `aria-invalid` in imperial while quoting a metric value — the one-way door the
comment describes.

| §9 count | target | 2026-08-01 |
|---|---|---|
| `rounded-lg` | 0 | **0** |
| distinct card treatments | 3 (honest floor) | **3** |
| off-scale spacing values | 0 | **0** |
| off-scale type sizes | 0 | **0** |
| files where caption size outnumbers the body default | 0 | **0** |
| components importing `components/ui.tsx` | most of 23 | **16** |
| components importing `Button` | most that have one | **13** |
| tables on `DataTable` | all of them | **6 of 6** |
| hand-rolled `<button>` | 3 (honest floor) | **3**, from 17 |
| font sizes declared in `app/globals.css` off §3's scale | 0 | **0**, from 3 — and now asserted |

**The two honest floors are decisions, not shortfalls, and each is recorded where it is enforced.**
Cards: one of the three IS `<Card>`'s own string; the others are a floating toast and an interactive
drop zone, which want their own named primitives. Buttons: the three left are `Segmented`, `Tabs` and
`DataTable`'s sort header — §5 lists all three as their own primitives with their own geometry, and
forcing any through `buttonClass`'s `px-3 py-1.5 rounded-md` would make it look like a button, which
is the opposite of the point. What they share with `Button` — the focus treatment and the touch
minimum — they already have: verified by tabbing the whole page against the built export, every
control kind renders the same `2px solid rgb(99,102,241)`.

**WHAT IS LEFT — the *fields* clause, and it is the last one.** The *done when* says every component
imports its containers, buttons **and fields** from `components/ui.tsx`. Containers and buttons are
done; fields are not. `components/LoftApp.tsx` carries `Num`, a **second complete numeric-input
primitive** — its own draft buffer, bounds, refusal message and touch target — used at **28 call
sites**, while `ui.tsx`'s `NumberField` is used at **7**, all inside `MonteCarlo`. §5 says "every
numeric input in either app is this". The two already disagree: `Num`'s label is `text-[11px]` and it
bakes the unit into the label string, `NumberField`'s is `text-sm` with a `unit` prop, and
`NumberField` itself carries no touch minimum while `Num` does.

**Done 2026-08-02.** The paragraph below is the plan as it stood; it is kept because the *why* still
governs the merged primitive. What actually shipped differs on one point: the `unit` prop won as
planned, but the 28 converted call sites still bake their unit into the label string, so the prop is
the vocabulary rather than the practice. Converting those is cosmetic and is filed in `BACKLOG.md`.

**Reconcile before converting, and half of that is done.** `Num` owns the refusal behaviour the SAFETY
invariant requires — a value that cannot mean anything physically is bounded at the field rather than
flown into a confident number — so the merged primitive must keep the stronger of the two at every
point, not the newer. On 2026-08-01 `NumberField` took the two things it was BEHIND on: §8's touch
minimum (all seven of its instances measured 36 px on a Pixel 7 while `Num` cleared 44) and the
withhold-at-keystroke rule. **What remains is the conversion itself** — 28 call sites — plus the two
cosmetic disagreements: `Num`'s label is `text-[11px]` against `NumberField`'s `text-sm`, and `Num`
bakes the unit into the label string where `NumberField` has a `unit` prop. §3 does not permit
`text-[11px]` for a field label, so that one is a fix rather than a preference. Sized 2 increments.

*(Original status line: the container and control vocabulary exists and the §9 compliance block is an
executable ratchet — `lib/design-system.test.ts`, 10 cases — so the drift cannot return while the
conversion is still running.)* The container and control vocabulary exists and
the §9 compliance block is now an executable ratchet (`lib/design-system.test.ts`, 7 cases), so the drift
cannot return while the conversion is still running.

**Measured at the start of this milestone (2026-07-31), and after each increment:**

| §9 count | target | before | inc. 1 | inc. 2 | inc. 3 | inc. 4 | inc. 5 | inc. 6 | inc. 7 | inc. 8 |
|---|---|---|---|---|---|---|---|---|---|---|
| `rounded-lg` | 0 | 49 | 46 | 37 | 37 | **35** | 35 | **25** (inc. 6) | **15** (inc. 7) | **0** (inc. 8) |
| distinct card treatments | 3 (see below) | 9 | 3 | 3 | 3 | 3 | 3 |
| off-scale spacing values | 0 | 8 | 8 | 8 | 8 | 8 | **0** (inc. 5) |
| components importing `components/ui.tsx` | most of 23 | 5 | 11 | 12 | 12 | **14** | 14 |
| components importing `Button` | most that have one | 0 | 0 | 6 | 7 | **9** (+1 via `buttonClass`) | 9 |
| hand-rolled indigo primaries | 0 | 16 | 16 | **6** | 6 | 6 | 6 |
| surfaces with two primaries | 0 | 2 | 2 | **0** | 0 | 0 | 0 |
| component files where `text-xs` outnumbers `text-sm` | 0 | 9 | 9 | 9 | 9 | **0** | 0 |
| `text-lg`, a size not on the scale at all | 0 | 14 | 14 | 14 | **0** | 0 | 0 |

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

**What is left, measured rather than estimated.** *(The button and primary figures below were the
measurement when this milestone opened. Re-measured 2026-07-31 after increment 8: **24** hand-rolled
`<button>` elements outside `components/ui.tsx` — `LoftApp` 7, `ImportPanel` 7, `RocketDiagram` 3,
`ServiceWorker` 2, and one each in `GeometryInspector`, `MotorSweep`, `ResultsView`, `RocketpyCrossCheck`
— and 6 hand-rolled indigo primaries. Plan against those, not against the opening figures.)*

`Card`, `Section` and `Button` now exist; `Panel`,
`DataTable`, `Readout`, `Figure`, `EmptyState`, `ErrorState` and `Extrapolated` do not. There are 43
hand-rolled `<button>` elements and 16 hand-rolled indigo primaries across four different padding
variants, none of which is §4's `px-3 py-1.5`; `ImportPanel` and `RocketpyCrossCheck` each carry two
primaries on one surface, which §5 forbids outright. Seven missing primitives plus 23 surface
conversions is more than this milestone's 4–6 increments, so the slice plan is: **`Button` adoption and
the double-primaries next, then the type scale, then off-scale spacing, then `DataTable`** — and
`Panel`, `Readout`, `Figure` and the five state components are deliberately deferred to a successor
milestone rather than half-built here.

**Increment 3 took the type scale to six sizes.** All fourteen `text-lg` are gone — eleven panel
headings to `text-xl font-medium` (which is what `Section` already renders, so the hand-rolled headings
and the primitive now agree) and three prominent values to `text-xl font-semibold`, the weight §3
reserves for the one number a surface exists to show. Asserted at zero, so it is a guard rather than a
ratchet.

**Increment 4 took the per-file caption inversion to zero**, which was the half of the type work that
is a judgement rather than a sweep — nine files, `GeometryInspector` at 10:2, `MonteCarlo` at 9:3,
`ResultsView` at 16:13. The rule applied is worth keeping, because it decides every future site:
**a sentence whose purpose is to change what the flyer does next — an instruction, a refusal, a
warning, an explanation of why a number will not move — is decision-grade and takes the body default.
A sentence that describes something already on screen — a unit, a provenance line, a chart legend, a
footnote, help text — stays at caption size.** Under it `text-xs` across `components/` went **91 → 56**
and `text-sm` **84 → 113**, and nothing that is genuinely a caption moved. Per file:

| file | before | after |
|---|---|---|
| `ResultsView` | 16/13 | 6/23 |
| `GeometryInspector` | 10/2 | 2/8 |
| `MonteCarlo` | 9/3 | 3/9 |
| `DragCrossCheck` | 4/1 | 1/4 |
| `MassBreakdown` | 4/2 | 1/4 |
| `SiteHeader` | 2/1 | 0/1 |
| `Footer` | 1/0 | 1/1 |
| `FusionSpaceBadge` | 1/0 | 0/1 |
| `DownloadCsv` | 1/0 | 0/0 |
| `ThemeToggle` (not inverted, converted for consistency) | 1/1 | 0/0 |

The ones that mattered most:

- **The four advice blocks on the results surface**, each of which tells a flyer what to change on the
  rocket and to what number: stability trim (the nose ballast mass, or the fin shift that reaches the
  same margin without it), the fin-flutter fix, recovery sizing, and the separated-booster descent. All
  four were the smallest text in their own panel.
- **The what-if delta** — the one number the "What-if vs design" card exists to produce, rendered
  smaller than the pair of values it compares.
- **The dispersion study's 5–95% bands and median drift.** A Monte-Carlo's product IS the spread, and
  every band sat at caption size under a `text-xl` median.
- **Landing energy and landing hardness.** The code already colours landing hardness amber above 5%, so
  it was treating the line as a warning while the type scale treated it as a footnote.
- **Two form selects** that rescale an overlaid flight log — the smallest controls in the app at 12 px,
  and the one pair that silently changes what a chart means.
- **The footer's standing disclaimer** — that every figure is a model's estimate and never a go/no-go,
  the one sentence the SAFETY posture requires be visible — which sat a step below body text, in the
  fine print, along with the footer's six nav controls.

**One of the nine was a false positive of the metric rather than a defect**, and is recorded as such:
`FusionSpaceBadge` counts as inverted at 1/0 while containing no text at all — its only `text-xs` is on
an `aria-hidden` decorative glyph. `MassBreakdown`'s disclosure chevron is the same kind of site inside
a file that WAS genuinely inverted. Neither is a number moved to satisfy a count: the footer and the
parts panel already rendered that identical affordance unsized, so both are consistency corrections.

The ratchet is now a **guard at 0**, and it has **no headroom** — `LoftApp` sits at 18/18 and `Footer`,
`InstallHint` and `ThemeToggle`… (`ThemeToggle` is now 0/0) — so one added `text-xs` in `LoftApp` fails
the suite. That is the intended sharpness, but the next session should know the margin is a single
class string rather than discover it.

**Five controls came off hand-rolled class strings onto the primitives in the same pass**, because the
type change made them mismatch their neighbours: the parts panel's four add gestures and its removal
(`Button` and `Button variant="danger"`, which §5 documents as removal-only), the theme toggle, and the
header's two link-buttons. The last of those needed a primitive that did not exist — `buttonClass`,
the button geometry as a class string, for the two things that must LOOK like a button and cannot BE
one, because a `<button>` that navigates is a keyboard and screen-reader defect. `Button` is now built
from it, so the two cannot disagree, and the three verbatim copies of that geometry in the header are
gone.

It lives in `lib/ui-tokens.ts`, not in `components/ui.tsx`, and that is not a filing preference: the
site header is a SERVER component, and a helper exported from a `"use client"` module cannot be called
from one — `npm run build` fails outright with *"Attempted to call buttonClass() from the server"*.
That file's header already carried the warning, from the time `TOUCH_TARGET` lived in the client module
and shipped a throwing stub into a served `class` attribute. **Any future class-string helper belongs
there for the same reason**, and only the components stay in `components/ui.tsx`.

**The type change broke a phone layout, and finding out cost the e2e check its credibility.** Putting
the header's three controls on the type scale took that row from 197 px to 229 px. That fits a 390 px
phone, which is the width `e2e/touch.spec.ts` runs at, and overflowed a 360 px one by 10 px. Chasing it
turned up two things worth more than the fix:

- **A 320 px phone was ALREADY overflowing by 19 px, before any of this.** Both are now 0, at 320, 360
  and 390 px, by letting the title block shrink (`min-w-0`) while the control row holds its three 44 px
  targets (`shrink-0`). `flex-wrap` on the header was tried first and rejected: it fixed the overflow
  and cost **71 px of vertical space on every phone**, because a wrapped flex item will not shrink
  below its content, so the controls dropped to a second row at 390 and 412 px too.
- **The check that should have caught it could never fail.** `no page scrolls horizontally on a phone`
  compared `document.documentElement.scrollWidth` against `window.innerWidth` — and under Playwright's
  `isMobile` emulation Chromium widens the LAYOUT viewport to swallow an overflow, so both sides move
  together. Measured on the reverted header at 320 px: `scrollWidth` 370, `innerWidth` 370, assertion
  green, while `clientWidth` correctly still read 320. It now compares against `clientWidth` and runs at
  320, 360 and 390 px. Proved able to fail by a negative control with its build exit checked: it fires
  *"horizontal overflow on / at 320px — Expected <= 320, Received 370"* and passes again on restore.

**Increment 5 took off-scale spacing to zero**, and measuring it turned up two blind spots in the
check that are filed rather than papered over: §9's pattern cannot match `gap-5` (the character after
`g` is not one of `xytblr`, so the `-` never lines up) and cannot match a half-step. Real numbers: one
`gap-5`, fixed with the rest because it is off the scale whether or not the grep sees it, and **100
half-steps** — of which 49 are `py-1.5`, which §4 itself prescribes as the padding inside a control
four lines after stating that the scale has nothing else in it. Resolving that contradiction is a
sentence in §4, which is a change to a file shared verbatim with the sibling app, so it is filed.

**Increment 6 took `rounded-lg` from 35 to 25**, and it is the mechanical half of that conversion: every
site that is a CONTROL rather than a container, moved to §2's `rounded-md`. Ten sites across five files —
`ImportPanel`'s five hand-rolled secondaries plus the split `<li>` whose two halves carry `rounded-l-lg`
and `rounded-r-lg` (which §9's own grep cannot see, so it would have left a visible seam at a count of
zero), `ServiceWorker`'s update-toast primary, `RocketpyCrossCheck`'s run control, `LoftApp`'s
`HEADER_BUTTON` constant (four call sites) and its second indigo primary. **The print hazard is not
reached by this slice**: `app/globals.css`'s rule keyed on `.rounded-lg` still covers all 25 remaining
sites, every one of which is a container, and the converted controls are hidden on print anyway. That
rule must change in the same commit as the LAST container, which is what makes the semantic-notice slice
the one that has to go last.

**Increment 7 took it to 15 by giving the third surface level a primitive.** `DESIGN.md` §2 names three
surface levels and only two had one, so the sunken inset was written inline **ten times, in three different
paddings, across five files** — `rounded-lg border border-zinc-200 bg-zinc-50 … dark:bg-zinc-900/60` with
`p-3`, `px-3 py-2` or `px-4 py-3`. That is one treatment written ten ways, which is the exact failure this
milestone exists to fix. `CARD_TONES.sunken` now carries it and all ten sites are `<Card tone="sunken">`,
which also puts them on §4's `p-4` and §2's container radius. Walked in the built export: the cards render
on both the Design and Analyze tabs, **0 stale `rounded-lg` + `bg-zinc-50` remain**, and there is no
horizontal scroll at 390 px or 320 px.

The tone keeps its hairline deliberately. §2 says a sunken surface inside a raised one needs no border
because the tone change is the separation — but all ten drew one and several sit directly on the page, so
dropping it is a per-site judgement about each parent. Doing that in the same pass would have made this a
repaint rather than an extraction; it is recorded in *Decisions taken without the owner*.

**Increment 8 took it to 0, and retired the print rule that depended on it.** The last fifteen: 8 semantic
notices onto `<Card tone="warn">` / `tone="danger"` (the tones already existed, so the slice needed no new
one), 4 containers, and 2 route-level sites that could NOT take the primitive — both are server components
and `components/ui.tsx` is `"use client"`, so the 404's call-to-action takes `buttonClass` (which exists
for exactly that) and the methods page's formula block takes §2's sunken tokens directly. `Card`'s `as`
gained `p`, `li` and `label`, because the element is not a styling choice: a warning inside a `<ul>` must
stay an `<li>` or the list stops being one, and the configuration picker is a `<label>` wrapping its own
select. Every converted site kept the element it had.

`app/globals.css`'s print rule came off that class in the same commit, which is what made this slice the
one that had to go last. The ratchet is now a guard at 0.

**The padding change is the part a flyer sees**, and it was measured rather than assumed: notices moved
from `px-3 py-2` / `px-4 py-3` to §4's `p-4`, and the metric tiles from `p-3`. Driven in the built export
at 320, 360 and 390 px with a real design loaded — 14 tiles examined, **0 overflowing, 0 page overflow** at
every width. Worth knowing for the next such change: `e2e/touch.spec.ts`'s overflow check walks the STATIC
routes only, so no grid that needs a loaded design is covered by it at any width.

**Increment 9 built `DataTable`, the last primitive this milestone's *done when* names**, and put the
three tables that offered NOTHING on it: `ValidationPanel`, `RocketpyCrossCheck` and the phase table.
That last one is the surface `COMPETITION.md` row 25 calls a lead no competitor has, and its numbers
could not leave the page at all.

Every table on it gets sort with `aria-sort` and a real `<button>` in the header (so the sort is a
keyboard path, not a click target), a **sticky header** — which §5 asks for and not one of the six
hand-rolled tables had — and copy plus CSV export. Walked in the built export: 8 headers, header
`position: sticky`, `aria-sort` cycling `none → ascending → descending`, the row order actually
reversing on the second click, and both export controls present.

Three decisions inside it worth not re-deriving:

- **`csv` is a separate function from `cell`.** A cell renders nodes — a unit in its own span, an amber
  delta, a *not logged* fallback — and an export wants the number. Deriving one from the other puts
  markup in the CSV or strips meaning from the screen.
- **`empty` is a required prop, not an optional one.** §5 says a surface with no empty state is not
  finished and forbids "No data"; making it required is the only way that survives the next call site.
- **A column with no `sortValue` carries no `aria-sort` attribute at all**, rather than `"none"`.
  `"none"` tells a screen-reader user the column is sortable and currently unsorted, which is a
  different and false claim.

It lives in `components/DataTable.tsx` rather than in `components/ui.tsx`, and that is a constraint
rather than a preference — the same shape as `buttonClass`. It needs `DownloadCsv`/`CopyTable`, and
`components/DownloadCsv.tsx` imports `Button` from `./ui`, so putting the table in `ui.tsx` makes a
cycle. §5's "everything below lives in `components/ui.tsx`" now has two exceptions and wants a sentence
saying so — **filed rather than made, because that file is shared verbatim with the sibling app.**

**Increment 10 took the type scale to six sizes for real, and fixed the check that could not see the
other three.** §9's "a size that is not on the scale at all" assertion grepped `text-lg` ALONE. `text-lg`
was taken to zero in increment 3, and the assertion left behind matched only that token — so it read
zero and passed while **`text-[10px]` stood at 22 uses, `text-2xl` at 4 and `text-[9px]` at 3**. Twenty-
nine live uses of a seventh, eighth and ninth size, under an assertion whose name says none exist.

All 29 are gone, each by role rather than by sweep:

- **12 were SVG diagram and chart annotations** — `RocketDiagram`, `MonteCarlo`, `FlightViz`,
  `LineChart` — and §3 permits `text-[11px]` for exactly that. `MonteCarlo` also pinned the same size
  in an inline `fontSize`, where the class could never have won.
- **10 were HTML chips, unit suffixes and captions** and take `text-xs`, which is what §5 already
  specifies for `Chip`.
- **4 were `text-2xl`.** The wordmark comes DOWN to `text-xl` on mobile (its desktop step already lands
  on `text-3xl`), which also buys back header width at 320 px. The docs and 404 page titles go UP to
  `text-3xl` — §3's page title, once per route, and **neither route had one**: the single `text-3xl` in
  the repo was a breakpoint variant on the mark. The accent stat keeps its prominence through
  `font-semibold`, which is what §3 reserves for the one number a surface exists to show.

**Two files then tripped the caption-inversion guard, and both were real.** `MotorSweep`'s sweep-gap
notice — *"Compare the rows with each other, not with the flight above"* — is an instruction, which is
decision-grade by increment 4's own rule, and it was the smallest text in its own panel. `ValidationPanel`'s
mean-absolute-error figure is a VALUE, and §3 says `text-xs` is for the text around a value, never the
value. Both took the body default.

**The new guard nearly could not fail either, and only its negative control caught that.** A word
boundary after `]` requires a word character beside it, so `/…\[[\d.]+px\]\b/` never matches
`text-[9px]` at all: the first version passed with one reintroduced. The assertion now matches every
Tailwind size token and subtracts the six §3 allows, so a size nobody has thought of yet fails by
default. Both controls fire and name the offending token.

*Owed to both repos:* §9's shell block still says `grep -roh '\btext-lg\b'`. The executable copy has
moved past it, which §9 forbids drifting — but that file is shared verbatim with the sibling app and
`add_repo` was refused again this run. The counts agree today (both read 0); the WORDING does not.

**Increment 11 gave the docs section nav real touch targets**, found by a phone cold walk of the built
export rather than by any test — every hit-target check in the suite loads a DESIGN first, so the docs
routes had never been measured. All five links rendered **30 px** on all six routes against §8's 44.
They are `next/link`s that must look like buttons and cannot be them, so they take `buttonClass`, which
is what the site header already does and which carries the touch minimum with it. `buttonClass`
adoption 1 → 2. Pinned by an e2e over all five routes with a count control, proved able to fail by a
control that overrides the minimum — and the FIRST version of that control did not compile, so the
suite silently re-tested the previous good export. The build exit is part of the control.

**Increment 12 put `MassBreakdown` on the primitive**, which needed one thing the first three did not:
a `footer`. It renders as a `<tfoot>`, which is what a totals row IS semantically and which also keeps
it out of the sort — a dry total that sorted into the middle of the parts it totals would be worse than
no total. The panel keeps its own richer CSV (unit-bearing headers), so no export controls are doubled.
It gains sort on all four columns: heaviest-first stays the initial order because that is the reading
the panel exists for, but a flyer checking an import against a build sheet could not previously get
part order or station order at all. `DataTable` adoption 3 → 4.

**What is left of P1**, measured after increment 12: the **two remaining tables** (`MassBreakdown`,
`MotorSweep`, `GeometryInspector` — each already carries part of the affordance set, which is the
inconsistency the primitive exists to end) and the **24 hand-rolled `<button>` elements**. A seventh
table at `app/docs/validation/page.tsx:259` sits in a SERVER route where a `"use client"` primitive
cannot go, so the conversion is sized at six, not seven. Two findings the type pass turned up are filed in `BACKLOG.md` rather than folded in —
`text-[11px]` has become a seventh size in exactly the way `text-lg` did (32 uses, 25 of them an
uppercase label row), and a motor-resolution chip states a verdict at chip size. A third is a hazard
for whoever takes the `rounded-lg` slice: `app/globals.css` carries a print rule keyed on that class,
so converting the 35 sites breaks print unless the stylesheet changes in the same commit.

**The measurement that made this a milestone** (2026-07-30): 12+ distinct card treatments; three
radius values for one role; `text-xs` and `text-sm` disagreeing between the two sibling apps.

**Size.** 4–6 increments.

---

## P2 — Workspaces as routes

**Status: DONE — 2026-08-02.** All five *done when* clauses met, each pinned by a check that goes red
if it regresses. Increments 1–6 of 4–6. The two-screen clause was briefly and WRONGLY recorded as met
in increment 5 on a fine-pointer measurement; increment 5's entry keeps that correction, and
increment 6 closed it for real on a coarse one. Read both before trusting any px figure in this
section.

*Increment 1.* Flight, Design and Analyze became three real static routes behind one navigation
spine, replacing the URL fragment and the `Tabs` tablist. Pinned by `e2e/smoke.spec.ts`'s *each
workspace is its own route*, *a workspace with no design behind it returns to the import screen* and
*the wordmark cannot strand a loaded design at an address that names no workspace*.

*Increment 2.* `analyze` was one route carrying three of the five jobs the *done when* names, while
the two surfaces that belong beside its second solver sat in the FLIGHT panel a workspace away. It is
now `/sweep` (the motor and parameter sweeps and the dispersion) and `/validate` (the file's own
stored numbers, its step-by-step flight, and the independent solver — every "does anything else
agree?" surface in one place, which North Star #1 asks for and which could not happen while they were
on different routes). Four workspaces plus the import root; a session stored on `analyze` resumes on
`sweep` rather than falling back to the flight.

*Increment 3.* The **static-export assertion** the *done when* names — `scripts/check-routes.mjs`,
run from `postbuild` so it gates every build, in CI and locally. It asserts four things that each have
a way of quietly becoming false: every workspace in the vocabulary has a document in `out/`; every
RETIRED workspace address still answers, so a link that shipped once is never a dead end; no workspace
is advertised in the sitemap; and every workspace document carries its own `noindex`. It reads the
vocabulary from `lib/workspaces.ts` rather than restating it, and fails loudly if that parse yields
nothing — a permissive parse would make every claim a vacuous pass over zero routes, which is the
failure the check exists to prevent. **A postbuild script rather than a vitest test on purpose:**
`npm test` runs before `npm run build`, so a test reading `out/` would skip itself on a clean
checkout, and a suite that skips prints almost exactly like one that passed.

All four claims were driven as negative controls before the check was trusted — remove a workspace
document, remove the retired one, add a workspace to the sitemap, strip a `noindex` — and each fails
with exit 1 naming exactly what broke, against exit 0 restored.

*Increment 4.* The **two-screen clause**, pinned by `e2e/depth.spec.ts` — and pinning it corrected the
record it was going to be judged against. Depth to a route's ANSWER is not page height; `HANDOFF.md`
carried a table of total page heights (flight 6.6 phone screens, design 6.9) labelled "depth", and
that table had been read as a two-screen failure. It is a different quantity. Measured at 390x664
with the bundled sample, depth to each route's primary answer is `/flight` **1.53**, `/design`
**1.55**, `/validate` **1.70** — all inside the contract.

`/sweep` is a **real breach at 2.10**, and it is pinned as a `test.fail` rather than described: the
test still runs and still measures, the gate stays green on a breach that predates the check, and it
goes RED the day it is fixed. A threshold widened to 2.2 screens would never have said anything.

**The cause is not `/sweep`.** It is the **1071 px of shared chrome above the workspace spine** —
header 73, toolbar 68, restore banner 112, collapsed Conditions 44, design summary 508, warnings 74 —
identical on all four routes, and 1.61 of the two screens before any workspace renders a pixel. That
term is now ratcheted directly (≤820 px desktop, ≤1120 px phone, measured + ~5%), because it is the
one number every route's depth is built on and a per-route assert with 0.3 screens of slack would
not catch it moving. DESIGN.md §8 makes this a PHONE contract and says desktop and touch are separate
designs over one model, so collapsing the 508 px summary to a disclosure on a coarse pointer — the
pattern Conditions already uses at 44 px — is the obvious fix and returns ~460 px to all four routes
at once. Filed in `BACKLOG.md` with the breakdown.

*Increment 5 — the chrome fix, and the last open clause closes.* The design summary's ten-field strip
sat above the workspace spine on all four routes and cost a 390 px phone **508 px**. Its three
headline fields — apogee, liftoff mass, static margin — now stay visible on every viewport and the
other seven fold behind a phone-only control, shown outright from `sm:` up. Which three stay is not a
layout preference: static margin is the go/no-go read, liftoff mass is what a flyer checks against
the motor's minimum and their waiver, and apogee is the number two e2e cases exist to prove updates
live while editing on `/design`. `StabilityTrimHint` and `FlutterFixHint` are deliberately OUTSIDE
the fold — they render only when something is wrong and they are the only place the reasoning behind
that flag is written, so folding them would be the "reachable only by knowing it is there" failure.

**Measured, on every route:** the fold took **157 px** out of the shared chrome above the spine, on
all four routes at once rather than just the one that needed it. Desktop is **unchanged at 773 px** —
the split grid first cost 8 px there and the rhythm was restored before anything shipped, because a
P-track increment that trades one form factor for the other has not done its job.

**It did not close the two-screen clause, and the first version of this entry said it did.** The
correction is the more valuable half of the increment. The phone context in `e2e/depth.spec.ts` was
`viewport: PHONE` over `devices["Desktop Chrome"]`, so it reported `pointer: fine` — and every
control carrying `TOUCH_TARGET` (`pointer-coarse:min-h-11`) rendered at its 26 px desktop height
instead of 44 px. **That understated the shared chrome by 97 px**: 914 px measured, 1011 px on a
genuinely coarse pointer. The spec now sets `hasTouch` on the phone, and on that measurement
`/sweep`'s answer sits at **1410 px = 2.12 screens** against the 1328 px two screens allow — **82 px
still owed**. The `test.fail` marker was deleted on the strength of the fine-pointer number and is
**restored**, with the true figure and with the reason it was briefly removed, so the next session
does not repeat it. The phone ratchet moved 1120 → **1060** rather than to the 960 a fine pointer
would have justified: down, because the fold really did buy room, but not to a number measured on a
phone that does not exist.

**Where the remaining 82 px were:** not the shared chrome after all. Increment 6 found them in
`/sweep`'s own panel — see below.

*Increment 6 — the pitch stops competing with the answer.* `MotorSweep`'s opening paragraph explains
what a sweep is and why to run one. That is a question the TABLE answers once the sweep has actually
run, at which point the prose was **140 px of preamble sitting between the flyer and their result**.
It is now shown only until the panel is open; closing the panel brings it back, so it is sequenced
rather than hidden.

**Measured on a coarse pointer**: `/sweep`'s first swept-motor row is at **1260 px = 1.90 screens**
against the 1328 px two screens allow — **68 px of headroom**, where it had been 82 px short.
Desktop is 898 px = 1.00 screens. The `test.fail` marker is deleted, and this time the measurement
underneath it is one a real phone produces.

**The lesson this milestone actually taught**, worth more than the pixels: a contract `DESIGN.md`
writes for touch has to be MEASURED on touch. A phone-sized viewport over `devices["Desktop Chrome"]`
reports `pointer: fine`, and every `TOUCH_TARGET` control renders at 26 px instead of 44 — a 97 px
error, in the direction that makes the app look like it passes. Any future viewport-based contract in
this repo should set `hasTouch` from the first line it is written.

Not a `Disclosure`: that primitive takes a static `open`, and a native `<details>` cannot be talked
out of hiding its content by a media query, so a viewport-driven fold cannot be expressed with it.
The control is a `Button`, so §9's hand-rolled-`<button>` count is unmoved at 3.

**Not done, and deliberately not in this milestone:** the design drawing is still reachable only from
`/design` (`COMPETITION.md` row 31). The strip costs a phone another 130–160 px, which would take the
chrome to ~1050–1075 and put it straight back over the 960 ratchet and `/sweep` back over two
screens. It needs its own budget and its own increment — folding it into P2 would mean re-breaching
the contract this milestone just closed. Carried to the P-track's next milestone as its opening
measurement.

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

**Status: SHIPPED 2026-08-02** — pinned by `e2e/first-run.spec.ts`, seven cases from a cold load with
empty storage, covering all four *done when* clauses.

**Closed on a corrected measurement, which is the part worth keeping.** The spec's phone context was
`test.use({ viewport: size })` with no `hasTouch`, so it reported `pointer: fine` and rendered every
`TOUCH_TARGET` control at 26 px instead of 44 — understating the chrome above the fold by about
97 px, in the direction that makes an above-the-fold assertion pass. This is the same false pass
`depth.spec.ts` records, in the one spec whose entire subject is what a stranger sees without
scrolling on a phone. `hasTouch` and `isMobile` are now set, and **all seven cases still pass on a
real coarse pointer** — so the clauses were genuinely met and the instrument was wrong, rather than
the other way round. A milestone marked shipped on a fine-pointer measurement would have been the
second time that happened here.

*Increment 1 — the walkthrough the milestone asks for, and the three things it found.* `e2e/first-run.spec.ts`
starts where every other spec does not: a cold browser, empty storage, no file. `addInitScript` clears
storage BEFORE any page script runs, so the app reads an empty store on its first read rather than
one cleared after the fact — which would be a warm start wearing a cold one's clothes.

It went red on two real gaps and both are fixed in the same increment:

- **The one-click example was below the fold on a phone** — the first bundled design sat at 753 px
  against a 664 px viewport, so the clause "fly a real example in one click without supplying a file"
  cost a scroll a stranger had to know to make. The cause was that the landing renders a 270 px
  dashed DROP ZONE on a device that cannot drag a file: 64 px of padding, a brand mark, and a
  "drop a file here" instruction a phone cannot follow, all sitting directly above the one control a
  flyer with no file needs. The drop affordance and its instruction are now `sm:` only, with a
  shorter sentence below that stating the formats and the privacy promise — the parts that are true
  on every device.
- **A flown number had no route to how it was computed.** The "see how they're computed" link lives
  on the import screen, so it disappeared at exactly the moment a flyer had a figure in front of them
  to doubt. There is now a link in the design summary's header row — the row the format label already
  occupies, so it costs the shared chrome no height, and it is present on all four workspace routes.

The third clause it checks — that an import says what was and was not understood — already passed,
and is now pinned rather than assumed.

*Increment 2 — a number that left its envelope says so, on the number.* `DESIGN.md` §5 requires the
`Extrapolated` treatment — "the warn treatment plus the reason and the range it left" — **wherever** a
number leaves the envelope its method was validated over. Loft's drag model is validated subsonic,
and above about M0.8 it is a bounded parametric estimate; the flight raised a `transonic` caution
card, but the apogee itself rendered byte-identical whether the rocket went transonic or not. **A
flyer reading the number does not necessarily read the card**, which is the whole reason §5 puts the
treatment on the number.

`Stat` gains an `extrapolated` slot carrying the reason and the range, rendered as an `abbr` — the
same affordance `Field`'s hint already uses, so a pointer, a keyboard and a screen reader all reach
the explanation from the figure itself. Applied to the seven ascent-derived readouts the
extrapolation actually drives, and deliberately NOT to rail-exit velocity (~20 m/s off the rail) or
thrust-to-weight (static), which are inside the validated envelope whatever the flight does later —
a flag that fires on everything teaches a flyer to ignore it on the flight where it matters.

Pinned both ways in `e2e/smoke.spec.ts`: a transonic flight marks numbers and the marker carries its
reason, and a subsonic flight marks nothing. Two DOM lessons paid for on the way, both recorded in
the component: the readouts are located by walking the label's following siblings, so a new sibling
`div` silently broke two unrelated locators; and beside the value the marker pushed a 320 px metric
tile into clipping its own number, so it stacks.

*Increment 3 — all three docs pages reachable from where the question arises.* The clause names
methods, limitations AND validation. Methods landed in increment 2; the other two did not exist on
any path a flyer actually walks. **Limitations** was linked only from inside the NO-MOTOR notice, so
an ordinary flight had no route to it at all — it now sits beside the Flight heading, in the panel
rather than in the shared chrome above the spine (putting it next to the methods link wrapped that
row and took the phone chrome 1060 → 1070 px, which the depth ratchet caught within the same
increment). **Validation** was reachable only when the file carried stored results to compare
against — and none of the three bundled samples does, so every stranger's first run landed on an
empty comparison whose only content was why it was empty. `ToolUnavailable` gained a slot for the
way forward (`DESIGN.md` §5 asks an empty state for one and the primitive had nowhere to put it), and
that notice now says Loft's accuracy is measured against 35 real designs and links to the evidence.

All four *done when* clauses are now pinned by `e2e/first-run.spec.ts`, seven cases from a cold load.

*Remaining:* the "understand what the tool is within one screen" clause is asserted only weakly (the
first screen must mention a flight at all), though the landing paragraph does say Loft "simulates the
flight in your browser — apogee, speed, stability, and recovery". And the README is 4.7 KB against
the sibling app's 27 KB, which is P5's territory as much as P3's.

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

**Status: IN PROGRESS** — increment 1 of 4–6 shipped 2026-08-02, along with the decomposition.

*Increment 1 — SHIPPED. The other half of §8's contract, which nothing had ever measured.*

`DESIGN.md` §8 states the check as two numbers: "at a 390 px viewport, count controls under 44 px
and states unreachable without hover. **Both counts are zero** or the surface is not done." The hit
targets have been asserted for several runs. **The hover count had never been taken.** Taken now, on
a phone with a design loaded, it was **75**.

`e2e/touch.spec.ts` asserts it as an EXACT ratchet, the way §9's counts work — an improvement fails
just as a regression does, so the number in the spec and the number in reality cannot drift apart.
It prints which states it found, because a bare integer would send the next session back to writing
the probe again.

Three things the measurement taught, all of them recorded rather than smoothed over:

- **The first version of the count raced hydration** — 60 on one run and 71 on the next against an
  identical build. An exact ratchet that is racy is worse than no check, because it fails for timing
  and teaches a session to re-run until green. It now waits for the route to render, and is stable.
- **"Has a `title`" is not the same as "unreachable".** A tooltip whose words are also rendered
  nearby costs a touch user nothing, so the check compares the title against the surrounding block's
  visible text. Without that it would have punished the fix for the defect it exists to find.
- **The two halves of §8 can be spent against each other, and must not be.** Writing the stability
  flag's reasoning into the design summary on a coarse pointer took the phone chrome past the
  1060 px ratchet and `/sweep` back over two screens — because that strip is the shared chrome all
  four routes sit under. Reverted, and the reasoning is instead already written in full by
  `StabilityTrimHint`/`FlutterFixHint` below the fold, which render exactly when a flag is raised.
  **Decision recorded:** a `title` is acceptable as a pointer-only convenience where the same
  information is written in words elsewhere on the surface; it is not acceptable as the only route.

Fixed here, taking 75 → **67**: the extrapolated marker's reason and range now render as visible
text on a coarse pointer (`DESIGN.md` §5 defines that treatment as *the warn treatment plus the
reason and the range it left*, and on a phone it was arriving with neither); and `DataTable`'s
per-column `title="Sort by mass"` on a button already reading "Mass" is deleted — a tooltip that
restates its own label is a named tell, and the `aria-label` already carried the verb for assistive
tech on every form factor.

*Increment 2 — NEXT.* Drive the 67 down. The bulk is shared chrome, so it is a small number of
surfaces: the footer and badge `opacity-0 group-hover:opacity-100` external-link arrows are simply
INVISIBLE on touch, so a flyer cannot tell those links leave the site at all; the theme toggle's
`title` carries its current state; and `Undo`/`Redo` explain *why* they are disabled only on hover.

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

- **2026-08-02 — P2's workspaces are mounted in the route-group LAYOUT, not in the route pages.**
  `app/(app)/layout.tsx` renders the design, its chrome and every workspace panel; each
  `app/(app)/<workspace>/page.tsx` carries that route's title, description and canonical, and renders
  nothing itself. A Next layout is not remounted when the flyer moves between the routes under it, so
  the imported design, its edits, the undo stack, a running Monte-Carlo and a RocketPy cross-check all
  survive a navigation.

  **Rejected: moving each panel into its own `page.tsx`, which is the obvious shape.** It unmounts the
  panel on every navigation, and none of those results is persisted anywhere — `MonteCarlo`,
  `MotorSweep`, `ParameterSweep` and `RocketpyCrossCheck` each hold their result in a plain `useState`,
  which is exactly why `ResultsView` has kept the panels mounted-and-hidden since it was written. A
  flyer who glanced at the diagram mid-dispersion would have lost a 300-flight run. That shape becomes
  available once those four results are hoisted or persisted, and until then it trades the milestone's
  own *"the design and its results survive moving between them"* clause for tidier files.

  **Rejected: keeping the fragment and adding routes beside it.** Two mechanisms for one fact is how
  the fragment and the panel got to disagree in the first place; `workspaceFromPath(usePathname())` is
  now the single source of truth and the session's `opensOn` reads from it.

  What the flyer can observe is real either way: five addresses, five titles, Back and Forward, a
  bookmarkable workspace, and one precached document each (the service worker went from 6 routes to 9).
  What is deliberately NOT real is unmounting, and that is the trade.

- **2026-07-31 — `CARD_TONES` gains a `sunken` tone, and P1's remaining `rounded-lg` blocks convert onto
  it.** This is the decision increment 6b was blocked on, taken here so the next session starts rather
  than re-derives it. Twelve of the 25 remaining sites are the same neutral inset written inline —
  `rounded-lg border border-zinc-200 bg-zinc-50 … dark:bg-zinc-900/60` — across `LoftApp` (4),
  `MonteCarlo` (4), `MotorSweep`, `RocketpyCrossCheck` and `ImportPanel`. Rejected folding them into
  `muted`: that tone is dashed on purpose, because it is the EMPTY-state slot, and a readout block is not
  an empty slot. Rejected a `className` override at each site: that is the hand-rolled just-this-once
  §1 forbids, and it is how the twelve card treatments happened in the first place. `sunken` is not a new
  invention — `DESIGN.md` §2 already names it as one of the three surface levels ("insets, table headers,
  code and readout blocks"), so this implements the system rather than extending it.

  **One thing to settle per site rather than globally, and it is why this was not folded into increment
  6:** §2 also says a sunken surface INSIDE a raised one needs no border, because the tone change is the
  separation — while all ten currently draw one. Define the tone WITH the hairline so the conversion is
  visually identical, then drop the border only at the sites whose parent is confirmed raised. Converting
  and re-bordering in one pass is what would make it a repaint rather than an extraction.

  **Measured after increment 7 shipped, so the follow-up has a number rather than a guess:** driving the
  built export, **1 of the 2 sunken cards rendered on the Design tab, and 1 of the 2 on the Analyze tab,
  has a card ancestor** — those are the sites §2 says should lose the hairline. The rest sit directly on
  the page and keep it. This is a PRE-EXISTING divergence, not one increment 7 introduced: the inline
  `<div>`s drew the same border in the same places. The remaining work is a `Card` prop (or a `bare`
  variant of the tone) plus that per-site pass, and the probe to redo the count is a DOM walk for an
  element with `rounded-xl` + `bg-zinc-50` that has a `rounded-xl border` ancestor.
- **2026-07-31 — an authored stage is addressed by its SEED TUBE's id, not by a new `Stage.id` and not
  by an index.** `Stage` has no id in the model and imported stages have never needed one. Rejected
  adding the field: it touches `lib/ork/import.ts`, `lib/rkt/adapt.ts`, `lib/rasaero/adapt.ts` and
  `lib/ork/export.ts`, and buys nothing this milestone needs — the tube is a real component with a
  stable id, it is what R3's gestures anchor onto to grow the booster, and it is what a removal names.
  Rejected addressing by index: an index goes stale the moment a sibling stage operation is undone, and
  the bag is replayed from the pristine design on every apply, so a stale index is reachable rather than
  theoretical. The cost is that only an AUTHORED stage can be removed; an imported one needs the id, and
  that is where the decision would be revisited.
- **2026-07-31 — a booster whose seed tube has no motor mount is REFUSED, not authored with a warning.**
  Rejected disclosing it, which is what the blunt leading face and the mould-line step both do: those
  describe a geometry a real design can legitimately have, and a stage that can never fire is not a
  geometry — it is ballast the solver sheds while reporting a confident number in the OPTIMISTIC
  direction. Measured on `03.Three-stage.ork`: 1,481.8 m to 2,299.2 m, a 55% gain from a stage that
  cannot burn. Rejected synthesising a mount for it: that invents a component the design does not have,
  in the one place where inventing one changes the flight. 2 of the 35 real designs are affected and on
  those the control is simply not offered — true from the review commit that wired `canAddStage` into
  `onAddStage`, not from the increment that wrote the predicate. **A refusal that is exported, unit
  tested and swept across the corpus is still not a refusal until a caller asks it**, and every one of
  those three proofs passed while the button rendered anyway.
- **2026-07-31 — the shelf's delete is undone by a per-removal offer held in memory, not by a
  confirmation dialog and not by a trash that persists.** Rejected a confirm prompt: it is the cheapest
  thing to build and the worst answer here, because it taxes every correct deletion to catch the rare
  wrong one, and a flyer at the pad with gloves on taps through prompts. Rejected persisting the
  removed rows to storage as a trash: the shelf's whole budget is already a cap the add path evicts
  against, and a trash would either eat into it or need a second budget with its own eviction rule —
  a second one-way door to fix the first. Rejected a single pending offer, which is what the reverted
  first attempt held: two removals in a row is what a mis-tap looks like, and it made the first one
  unrecoverable. The offer therefore lives for exactly as long as the screen it was made on, is
  cleared by any design load, and is a list.
- **2026-07-31 — `restoreRecent` REFUSES rather than trimming when the shelf has filled up
  meanwhile.** Rejected capping the list on restore: that is `rememberRecent`'s eviction rule, and
  running it here means the undo for one deletion silently performs another — exactly the failure that
  got the first attempt reverted. Rejected raising `MAX_RECENTS` to make room: the cap exists to keep
  history from spending the origin's storage budget, and a cap that bends for one path is not a cap.
  The refusal is unreachable from a single tab, because the offer is cleared on every design load and
  the shelf can only shrink in between; it exists for the second-tab case, and it says what happened
  and what to do rather than clearing the offer as though it had worked.
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
