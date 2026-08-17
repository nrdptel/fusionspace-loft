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

- **R-track — capability.** What a flyer can DO that they could not before. **R1–R11 shipped**
  (R10 closed 2026-08-09 on its last item, `maxAcceleration`); **R12 is IN PROGRESS** — the first of
  its members is met as of 2026-08-08, increments 3 and 4 took the components no field describes
  from 249 of 569 corpus parts to ONE on 2026-08-09, increment 5 stopped the file half of the per-part
  comment being destroyed on 2026-08-09, and increment 7 made the parts table say which masses the
  design stated on 2026-08-10. R11 and R12 were both born from `OWNER-NOTES.md`. *(This line read "R1–R3
  shipped; R4 is IN PROGRESS" until 2026-08-08, six milestones after it stopped being true — and it
  then went stale again inside the very commit that added this warning, caught by review rather than
  by anyone reading it. It is the queue's own state line: update it in the same commit as the status
  line it summarises, or it becomes the most misleading sentence in the file.)*
- **P-track — product and craft.** What makes it a tool a stranger picks up, trusts, and keeps using:
  shape, design system, first run, form factor, documentation, discoverability. **P1–P9 and P12
  shipped** (P8 on 2026-08-09, P11 on 2026-08-09); **P10 is IN PROGRESS at 2 of 3** with its
  remaining increment blocked on a repository SETTING no session can edit; **P13 is SHIPPED
  (2026-08-09)**, its *done when* met in Loft.

  **Corrected 2026-08-11: this line said "P13 is the next unstarted one" while P13's own Status said
  3 of 3 shipped, and it said P10 was "1 of 2" while P10's body recorded increment 2 shipped on
  2026-08-11.** This paragraph is the baton — the file says so four lines below — and a stale baton
  sends the next run hunting for work that is done. Both were found by an agent reading the file
  against itself rather than by anyone re-reading their own edit. **The next unstarted P milestone is
  P14** ("the checks that can only see what they already know"), written this run because the track
  had otherwise run dry; increment 1 of 3 shipped the same day.

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

**One input reorders this queue: `OWNER-NOTES.md`.** It is the owner's inbox — rough direction dropped
between runs — and it is read before this file at session start, because a note can change what the
next milestone is. It is usually empty, in which case nothing here changes. When it is not, a triaged
note becomes a milestone **in this file, in the normal shape** — outcome, *done when*, size, notes,
pinning check — and cites its origin in the heading: `R12 (from ON-6)`. Keep that tag. It is how a run
six weeks from now can tell which milestones came from the owner walking the live site and which the
queue generated itself, and the two are worth different things when something has to be cut.

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

> **2026-08-08 — the INTERACTION this milestone shipped has since been withdrawn by the owner
> (`OWNER-NOTES.md` `ON-4`: *"no one is actually designing a rocket by dragging parts"*). The
> milestone is NOT re-opened and this text is NOT rewritten** — it is the accurate record of what was
> built and pinned, and `MAINTAINING.md` forbids re-opening a shipped milestone. The withdrawal is
> carried forward by **R12**, whose select-and-edit tree is the replacement. Until that tree can do
> the same job, nothing here is removed: the capability stays reachable, which is what
> SHIPPED-MEANS-REACHABLE and *"a state a flyer can enter with no way back"* both argue for. What
> changed is that drag is no longer EXTENDED, not that it is deleted.

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

**Status: SHIPPED 2026-08-03** — pinned by `lib/model/edit.test.ts`'s `picking a real coupler or
centring ring` (5 cases, including `drops a picked part when the host is shortened under it, and
still clamps a derived one`, proved able to fail by reverting the clamp arm alone) and by
`e2e/smoke.spec.ts`'s *a real coupler can be chosen for the part you authored, and it leaves rather
than fly short*, proved able to fail by cutting the `added` prop at the `ResultsView` call site.
**All five kinds the *done when* names are pickable**, the last two as of increment 8.
The licence question the after-list named as possibly the whole first increment is **answered up
front** so it is not re-litigated.

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

*Increment 3 — SHIPPED. The picker exists, and a chosen tube flies.*

`components/PartPicker.tsx`: a flyer opens the Design workspace, searches 1,089 published body tubes
by number or description, filters by vendor or to their own caliber, and picks one. The vendor's
outer diameter and length land in `bodyDiameter` and `bodyLength` — the two fields that were already
there — and the flight moves. Pinned by `e2e/smoke.spec.ts`'s *a real commercial tube can be chosen
instead of measured, and it flies*, which drives the whole gesture in a browser: the lazy chunk
resolves, a BT-60 is found, the caliber field reads the vendor's 41.6 mm, apogee changes, and the
clear path puts the original flight back.

**The catalogue is a SEPARATE CHUNK, and that had to be established rather than assumed.** It is
85 KB gzipped against a 343 KB whole-app budget — a quarter more JS on every first load, carried for
a table most sessions never open. `PartPicker` reaches it through the app's first dynamic `import()`,
and the split was verified from the built export rather than from the bundler's intent: the chunk
carrying `BT-60` is referenced by **no prerendered document**. The service worker precaches
everything under `_next/static`, so offline is unaffected.

**What it deliberately does NOT do, said on the surface rather than left to be inferred.** The pick
sets the caliber and the length; the wall and the material stay the design's own, so the resulting
MASS is Loft's scaled figure and not the vendor's published weight. The panel says exactly that,
because the material column sits right beside it and a flyer could otherwise reasonably read the mass
as published. Carrying the vendor's density is increment 4, and it needs a new edit field: measured
this run, the catalogue's 39 material strings for body tubes have **zero** overlap with
`AIRFRAME_MATERIALS`' seven keys, and `airframeMaterial` takes a key — so the published figure cannot
travel through it without being snapped to a generic one, which is the substitution
`lib/components/db.ts` explicitly refuses to make. Filed in `BACKLOG.md` with the measurement.

Two things this increment did NOT need, and the reason is worth keeping: it drives the EXISTING
`bodyDiameter`/`bodyLength` edits rather than building a new part, so it inherits the whole-airframe
caliber scale and never creates the mould-line step `buildAdded` argues at length against — and it
never hands a tube a material without a wall, which `lib/sim/mass.ts` would fly as a solid rod
(measured previously at 2.13× the mass).

*Increment 4 — SHIPPED. The vendor's wall and stock, and the mass moves with them.*

The *done when*'s "and material" clause. `PickedBodyTube` now carries the published bore and the
vendor's own stock by value, and `withCatalogTube` puts both on the tube the body fields are aimed
at — never the whole airframe, because a pick is a statement about ONE part.

**Measured on the demo design with the catalogue's own Rocketarium BT-60 — 41.58 mm OD, 40.51 mm ID,
so a 0.533 mm wall at 782.88 kg/m³: 528.0 g with the dimensions alone, 342.3 g once the vendor's wall
and stock land. A 35% change in dry mass**, which moves CG, stability and apogee with it.

**The first version of that measurement was wrong, and the way it was wrong is the lesson.** It
quoted a 0.27 mm wall and a density of 848.98 — a figure that appears in no row of the catalogue —
because the probe and the unit test both hand-typed "the vendor's published figures" instead of
reading them out of the shipped data. The numbers were arithmetically self-consistent and
reproducible from nothing. The test now resolves the part through `findParts`/`materialOf` at run
time, so a hand-typed figure cannot be asserted against again.

Three things it had to get right, each recorded because each is a way to ship a wrong number:

- **The wall is DERIVED, not read.** The catalogue states an inner and an outer diameter and never a
  thickness — 0 of 1,089 body tubes carry one — so it is `(OD − ID) / 2`.
- **The wall and the stock travel together or neither travels.** `lib/sim/mass.ts` flies a tube that
  has a material and no wall as a SOLID ROD, previously measured at 2.13× the mass and 72% off the
  apogee with no error anywhere. A pick with no usable density therefore keeps the design's own wall
  AND stock. **None of the 18 parts whose upstream density was refused is a body tube** — measured, 0
  of 1,089 — so that path is defence against a future re-cut rather than a state today's picker can
  reach, and an earlier draft of this entry claimed otherwise.
- **The same clamp is reachable from the other side, and now is not.** A wall at least as wide as the
  tube's own radius makes `lib/sim/mass.ts` clamp the inner radius to 0 and fly a solid rod. It needs
  no bad data: `bodyDiameter` scales the whole airframe and is also a sweep axis, so picking a
  48.8 mm tube and then narrowing the design under ~17.9 mm crosses it. The wall is refused in that
  case and the stock still lands.
- **The vendor's own published WEIGHT beats the derived one.** Seven body tubes state a mass, all
  Public Missiles, and every one disagrees with the figure computed from its own geometry and stock
  by 3–5× — PS-7.5 publishes 589.7 g against 116.7 g derived. Applied as `overrideMass`, which
  replaces the component's own mass and NOT its subtree: a tube carries its mount, fins and parachute
  as children, and swallowing those would be a far larger error than the one it fixes.
- **It is not scaled by the caliber what-if.** `scaleAirframeRadii` touches `outerRadius` and never
  `thickness`, which is right rather than incidental: a real tube's wall is a property of the tube,
  not a ratio of its diameter.

**And a pick is a body-tube FIELD, not a free-standing record — which the first draft got wrong in a
way worth recording.** `withCatalogTube` resolves its target through the `bodyTubeId` aim at apply
time, so a pick that outlived its aim migrated: removing the tube it was made for re-landed the
vendor's wall and stock on whatever the primary-tube fallback found (measured on a two-tube design,
411.6 g → 53.9 g), and merely clicking another tube to READ it moved them there too (305.4 g →
129.1 g), with the caption still naming the part in both. `catalogBodyTube` is now a `targets` entry
on that aim, so it clears exactly when `bodyLength` and `bodyDiameter` do.

It also stopped being inert. A pick now changes the flight with both dimension fields blank, so
`catalogBodyTube` left `INERT_EDIT_FIELDS` and `hasGeometryEdits` counts it — and the picker's clear
path now appears whenever a part is set rather than only while the numbers still match, because the
narrower rule would have re-created the one-way door increment 3 shipped and fixed. The attribution
is what narrows instead: "Flying Estes BT-60" while the figures are the vendor's, "Wall and stock
from Estes BT-60, with your own dimensions" once they are not.

Pinned by four cases in `lib/model/edit.test.ts` and by the e2e, which now drives the whole arc —
pick, read the vendor's caliber back, edit it, watch the claim narrow without the way out
disappearing, then clear and land back on the design's own flight.

*Increment 5 — SHIPPED. The second kind, and the catalogue turns out to describe it far better.*

The *done when* names five kinds. Nose cones are the second, and picking one takes the WHOLE
published part rather than two figures out of it — because the data supports that and for a tube it
does not. Measured over all 854 catalogued cones: every one states a contour, a base diameter, a
length, a shoulder diameter, a shoulder length and a density that survived the refusal pass. 854 of
854 on each, against 0 of 1,089 tubes stating a wall at all. Contours: 464 ogive, 233 ellipsoid, 135
conical, 12 parabolic, 10 Haack, 0 power.

**Measured on `demo-single-deploy.ork`** — a 250 mm fibreglass ogive (1850 kg/m³, 3 mm wall) on a
38.0 mm airframe. Picking SEMROC BNC-55D2, an ogive 39.95 mm at the base, 76.2 mm long, SOLID balsa
at 112 kg/m³:

| | before | after |
|---|---|---|
| dry mass | 600.2 g | 525.6 g |
| CG | 572.5 mm | 457.1 mm |
| static margin | 4.065 cal | 2.7095 cal |
| apogee | 992.79 m | 1043.84 m |
| max velocity | 205.2 m/s | 225.1 m/s |

**The design decision worth recording, because it is the opposite of the tube's.** A tube pick
rescales the whole airframe to the caliber chosen — a body tube IS the caliber. A cone pick
deliberately does NOT: resizing a whole rocket to fit a part costing a few pounds is the tail wagging
the airframe. So the vendor's base lands on the nose and nothing else moves, which means a 39.95 mm
cone on a 38.0 mm tube leaves a real 2 mm mould-line step — and Loft **already** walks the airframe
for those. The flight says, in the words it already had: *"This airframe changes diameter at a joint
with no transition to take the change over… the drag is under-counted and the apogee and speeds above
read optimistically."* Reproduced before the copy claiming it was written, and pinned by both the unit
test and the e2e. That is the honest answer to what OpenRocket solves by filtering its presets to
what fits the parent: offer the part, take it faithfully, and let the check that already exists name
the consequence.

**Solid is the majority case, and it inverts a trap.** 728 of the 854 state `filled`, the other 126
state a thickness; none states both and none states neither, which is why `PickedNoseCone.thickness`
is one optional field rather than a wall plus a flag. `lib/sim/mass.ts` flies a shell with a material
and no wall as a solid rod — the DEFECT that `usableCatalogTube` exists to refuse, and the CORRECT
answer for a turned balsa cone. The same absence has to mean opposite things for the two kinds, and
a test asserts the cone side is deliberate. 50 cones publish a shoulder length of 0 — they butt
rather than plug — and that is written through as no shoulder rather than as a missing field, because
a ring of mass at the very front is where a gram moves the CG most.

**The pre-push review found a Sev-1 in this increment, and it is the one worth reading.** A pick
never cleared the replaced cone's own `overrideMass` / `overrideCGx`. `overrideMass` wins outright in
`lib/sim/mass.ts` and additionally suppresses the shoulder, so a design whose nose carried one took
the vendor's whole geometry and went on flying the OLD mass — measured on `rocksimTestRocket1.rkt`
(nose overridden to 126.438 g): **dry mass 387.736 g before the pick and 387.736 g after, identical
to the digit**, under a caption reading "Flying SEMROC BNC-70HAC" and a panel claiming "the whole
part as the vendor publishes it". `overrideCGx` was worse than stale — 65.4 mm, measured on a
396.9 mm cone, about to be pinned onto the 233.7 mm one replacing it. **10 of the 41 corpus designs
with a nose carry the mass override and 5 carry the CG one**, so it is the common case: an
`<overridemass>` on a nose is how a real file records a cone somebody put on a scale. Both are now
cleared, with the vendor's published weight still winning where they publish one — and
`withCatalogTube` had the identical hole, which SHIPPED, so it was fixed in the same change.

Three more from the same review, each a real defect and none of them a wrong number today: the
predicate did not validate `shoulderLength` although the applier reads it as both gate and value (a
replayed 1.5 m installed a collar longer than the rocket, 600.2 g → 670.8 g); the wall was written
outside the material guard, so a materialless record would turn a 3 mm-walled fibreglass cone solid
(600.2 g → 826.7 g, +37.7%) — the mirror of the rule the tube applier already enforced; and the
narrowed caption used the tube's wording, which is false for a cone because the base and shoulder
have no fields to retype. **The agreement between the picker's `buildable()` and the model's two
predicates is now pinned** by a walk of all 3,445 catalogue rows: 0 disagreements.

**One picker, not two.** `PartPicker` took a `kind` and a per-kind table of copy and columns rather
than being copied; the fetch, the failed-fetch state, the search, the vendor and caliber filters, the
provenance line and the table are shared. A cone's row states its contour, its shoulder (diameter ×
length, or "no shoulder") and its wall ("solid" or a thickness) where a tube's states a bore — the
bore column would have been a dash on 96% of cone rows. Both walks are green, so the refactor did not
disturb the tube path.

**What this did NOT fix, measured rather than assumed:** the caliber filter finds **0 of 854** cones
within the picker's own 0.5 mm of this design's 38.0 mm — 0 at 1 mm, 18 at 2 mm, 231 at 5 mm. The
catalogue's cones are imperial stock (SEMROC 573, Estes 95, BalsaMachining 76) across 103 distinct
base diameters from 7.14 mm to 296.16 mm, so a metric HPR airframe matches nothing. The filter is
off by default and the empty state says how to clear it, which is correct behaviour on a real gap —
but it is a gap, and widening the tolerance to hide it would be inventing a fit the vendor does not
publish. Filed in `BACKLOG.md`.

*Increment 6 — SHIPPED. The parachute, which is the third kind and the first that is not airframe.*

**It was the right one of the three to take first, and the reason is structural rather than a
preference.** A parachute is the only remaining kind the design ALREADY HAS — so, like the nose cone,
a pick edits the part that is there instead of authoring a new one. That means no new `AddedPart`
kind, no `buildAdded` arm, no placement rule and no inspector button: the aim slot (`parachuteId`),
the applier's neighbourhood and the recovery fieldset all existed. A coupler or a centring ring is a
full new build path for a median 34.4 g and 1.52 g respectively; a canopy moves the number a recovery
setup is judged on.

**What the catalogue states, measured over all 151 canopies rather than assumed.** Diameter, gore
count, line count, line length and a SURFACE material on 151 of 151; a line material on 145; a stated
mass on 21. Diameters run 203.2 mm to 3,657.6 mm, stated masses 4.0 g to 793.8 g, cloth densities
0.00705 to 0.06685 kg/m². **And, on 0 of 151: a drag coefficient, a packed size, a length, an outer
diameter.**

**So the `cd` comes from the chute being replaced, and that is the honest answer rather than the
convenient one.** A drag coefficient is a property of a canopy's cut and porosity that no vendor in
this database publishes. Inventing one would put a number nobody stands behind directly underneath a
landing speed. The design's own is real: 22 of the 37 parachute nodes across the corpus state one
explicitly (1.5 ×10, 1.55 ×4, 0.75 ×4, 2.2 ×2, 1.34, 0.61), the rest saying `auto`, which the
importer maps to 0.8. A pick therefore changes the canopy's SIZE and MASS and leaves the coefficient,
the deploy event, the altitude and the delay exactly where the flyer's own file put them — and the
panel says so in those words rather than leaving it to be inferred.

**Measured on `demo-single-deploy.ork`** — a 610.0 mm canopy, 26.1 g, cd 0.8, arriving at 6.95 m/s
after 152.7 s:

| pick | canopy | mass | ground-hit | flight time |
|---|---|---|---|---|
| the design's own | 610.0 mm | 26.1 g | 6.95 m/s | 152.7 s |
| LOC Precision LP-96-2022 | 2,438.4 mm | 411.6 g (derived) | **2.16 m/s** | 347.5 s |
| Top Flight PAR-9 | 228.6 mm | 4.4 g (derived) | **18.15 m/s** | 68.2 s |

A factor of **8.4** across the catalogue on one design, which is the difference between walking away
and rebuilding.

**Three things it had to get right, each a way to ship a wrong number:**

- **The vendor's published weight beats the derived one, and they disagree wildly.** Over the 21 that
  state both, Public Missiles' three agree within 4% (PAR-54 0.99×, PAR-48 1.04×, PAR-18 1.01×) while
  Giant Leap's run 3.9–7.9× heavier than geometry implies (TAC-24 7.85×). Hem, spill hole, swivel and
  shroud attachment are invisible to a diameter and a surface density. The derivation is the fallback
  and it reuses the `.ork` importer's OWN arithmetic (`parachuteMass`) rather than a second copy, so
  a catalogue canopy and a hand-typed one stay on one model.
- **The replaced canopy's `overrideMass` is cleared, and on this kind it is the MAJORITY case.** 20
  of the 37 corpus parachute nodes carry one (11 of the 27 `.ork` files). `overrideMass` wins outright
  in `lib/sim/mass.ts`, so a pick that set `mass` and left it would take the vendor's diameter — moving
  the descent rate — while flying the old weight under a caption naming the new part. That is the
  identical Sev-1 the nose-cone increment shipped and had to fix, lying in wait on the one kind where
  it is the common case. Asserted directly: the test gives the design an 87.9 g override first, and
  the pick takes it to the vendor's 4.0 g.
- **An explicit reference `area` is cleared too, and it is defensive rather than live.** The solver
  prefers `Parachute.area` over the diameter where one is present, so a stale one would fly the old
  canopy's drag under the new part's name. Measured: **no importer sets that field today** — all
  three adapters supply a diameter — so no loadable design reaches the branch. Cleared anyway,
  because the field exists for a format that states one and the solver already honours it; an
  applier that left it would be a wrong number waiting on an adapter change.

**The picker's shared prelude was the blocker, and it would have failed silently.** `buildable()`
returned false unless `outerDiameter > 0 && length > 0` BEFORE the kind switch, and 0 of 151 canopies
state either — so every row would have rendered disabled, which on a phone is indistinguishable from
a missed tap. The prelude moved into the per-kind arms, and the e2e asserts more than twenty rows are
present AND that the first is enabled.

**Order matters between the pick and the diameter field, in both directions.** The pick applies
BEFORE `withMainParachuteDiameter`, so a diameter typed afterwards scales the mass from the VENDOR's
figures — "that part, but cut down" flies a plausible weight for a cut-down PAR-18 rather than for
whatever canopy the file shipped. Applied the other way the pick would silently discard a number the
flyer had typed. It also runs before the dual-deploy promotion, for the reason the resize already
does: both resolve the same aim, so a pick that made a different canopy the largest could otherwise
send the altitude deployment to a chute nobody named.

**The pre-push review found a Sev-1 in this increment, and it is the one worth reading: the applier's
own comment claimed its ordering PREVENTED the defect its ordering CREATED.** All three recovery
edits resolved `primaryParachute` independently, and unaimed that falls back to "the largest canopy".
A pick is the first edit in the pipeline that can make the aimed canopy SMALLER than another one — 62
of the 151 catalogued canopies are under 460 mm — so the target moved out from under the two steps
that follow it. Measured on `fixtures/demo-dual-deploy.ork` (Main 1220.0 mm, Drogue 460.0 mm, no
aim): pick a 457.2 mm canopy, then type 900 into *Main chute Ø* — the field directly above the
picker, whose placeholder reads 1220 — and the **drogue** goes to 900 mm at 4× its mass while the
main never moves. The same construction on the promotion path produced **two** components named "Main
parachute", both on altitude deploy. Independently reproduced by a second reviewer over the corpus:
13 of the 14 multi-canopy OpenRocket designs. The canopy is now resolved ONCE from the pristine
design and passed as an explicit aim to all three steps — which is what `nosePickId` and `massTarget`
already do. Pinned, with a negative control: the pre-fix resolution leaves the main at 0.305 m where
0.9 was typed.

**And a second wrong number, on the one format that carries no per-part masses at all.**
`lib/rasaero/adapt.ts` gives every `.CDX1` canopy `mass: 0` deliberately, because the stated launch
weight already includes it. `withMainParachuteDiameter` preserved that for free — it SCALES, and
0 × anything is 0 — but an applier that ASSIGNS counts the canopy twice. Measured on `Show-off.CDX1`:
dry mass 0.4536 kg (its stated 1 lb) → 0.5358 kg, **+18%**, with the dry CG moving 25.4 → 96.9 mm.
A massless canopy now stays massless; the vendor's SIZE still lands, so the descent rate moves exactly
as it should. Pinned over the real corpus, and the check asserts it examined designs (2 carry a
canopy) rather than passing on an empty walk.

Nine more from the same three-lens review, each real. The pick cleared *Main chute Ø*, so the field
fell back to a placeholder read off the PRISTINE design and advertised the pre-pick diameter while
another canopy flew. The pick survived REMOVAL of the canopy it was made for and migrated onto the
next-largest, provenance line and all — the `withCatalogTube` defect in its third incarnation. The
narrowed wording fell through to the tube's, telling a flyer a canopy's "wall and stock" came from the
vendor when a `Parachute` has neither, while omitting the mass, which is what actually survives. The
empty state offered to "turn off the caliber filter", a control this kind never renders — §5 says an
empty state names the one action that fills it, and the only concrete one it named was false. The
search placeholder's own worked example, "Top Flight", returned **0 rows**: the filter reads part
number and description, and the maker is the select beside it. `buildable` did not mirror
`usableCatalogParachute`'s absolute bands, which is the one invariant its own header states. And the
table was given 8rem LESS width than a tube while carrying the same compound-cell shape that made a
cone need more.

**Two findings were about this increment's own honesty, and those are the ones to read.** The e2e's
headline assertion — *every row must be choosable* — was VACUOUS twice over: a disabled `<button>`
still has `role=button`, so counting them proved nothing about enablement, and
`getByRole("columnheader", {name: /^Length/})` matches nothing on ANY kind, because `DataTable`
renders each header as a button carrying `aria-label="Sort by …"` and Playwright returns a
descendant's `aria-label` before name-from-content. That check would have passed with the shared
Length column reinstated. Both now discriminate, and the column check carries a POSITIVE assertion
beside the negative one so it cannot pass on a broken read. **And the "measured" claim behind the
whole published-beats-derived rule was cherry-picked**: it quoted "Public Missiles' three agree to
within 4%" when Public Missiles publishes a weight on **twelve** canopies running 0.99x to 1.69x.
Recomputed over all 21 — Public Missiles 0.99–1.69x, Rocketarium 1.46–1.73x, Giant Leap 2.91–7.85x —
only three land within 4%, and the derivation runs low essentially everywhere, which supports the rule
more strongly than the wrong number did. `MAINTAINING.md`'s bar is numbers rather than adjectives; a
flattering subset presented as the whole set is the same failure wearing a number.

Pinned by six cases in `lib/model/edit.test.ts` — every catalogued canopy resolves and has a mass
path, a pick clears the weighed override and keeps the `cd`, a typed diameter scales the vendor's
weight, all three edits stay on one canopy, a massless canopy stays massless, and a removal takes the
pick with it — and by an e2e that drives the whole gesture in a browser, including the clear path back.

*Increment 7 — SHIPPED, but only the BUILD PATH. The coupler and the centring ring can be authored;
they cannot yet be picked from the catalogue.*

The two internal kinds, together, because they are the same `RingComponent` shape in the model
(`length`, `outerRadius`, `innerRadius`) and needed the same new path: a union member on
`AddedPart`, a `buildAdded` arm placing them INSIDE their host, an `ADD_LABEL`, an `addPartAfter`
arm and an inspector button. Doing them apart would have built that path twice.

**Scope taken deliberately, and the remainder is named rather than implied.** This ships the two
kinds as AUTHORABLE parts sized from the design. It does NOT ship a `PartPicker` kind for them, so
the *done when* clause "add a … coupler, centering ring … by choosing a real commercial part" is
**still open** — that is increment 8, and the two gotchas already measured for it stand: `rowKey`
collides on five centring rings (SEMROC CR-7-18, RA-50/52H-101(BT-50), CR-9-225X2, CR-9-225X2P,
CR-9-175P), and 7 of 236 couplers state an inner diameter of 0 (solid balsa plugs, which
`lib/sim/mass.ts` already flies correctly). Fit is real for these two where it was not for a cone —
**232 of 236 couplers and 478 of 497 rings** sit within 0.5 mm of some catalogued tube's bore,
because they are cut to the same imperial stock — so the caliber filter will earn its place there.

**Both sizes come from the corpus, and the single most important thing here is that ONE default
could not have served both.** They are the same shape in the model and could not be less alike in
proportion. Measured over the real corpus: **31 couplers, median 1.859 calibers** (p25 1.287, p75
2.323, never once below 1.0537); **83 centring rings, median 3.18 mm thick** — which is 1/8 inch, a
stock plywood sheet. A first draft gave both a 50 mm slug and shipped a **134 g median ring, 1.74 kg
at worst**, on a part that really weighs a gram and a half. Thickness generalises better than a ratio
on its own numbers too: the rings' length/diameter spans 0.020–1.000, a 50x spread, against the
thickness's 25x — and ring stock is sold in sheets, not in calibers.

**A ring is always bored, and that is a measurement rather than a preference: 0 of the 83 real rings
in the corpus is solid.** A disc with no hole is a bulkhead, a different part doing a different job.
The bore is read off the `innertube` the host carries — that IS the motor mount a ring centres, since
`MotorMount` is a marker with no diameter of its own — descending the tree rather than checking only
direct children, because 41 corpus body tubes keep theirs deeper, and preferring a tube actually
carrying a mount because `innertube` also models av-bay sleeves. Where the host has no mount at all
the fallback is the corpus median ratio, 0.87.

**Four defects the pre-push review found after the gate was green, all real, and two of them were in
this increment's own honesty rather than its logic:**

- **the coupler's wall was a FLOOR wearing a fallback's comment.** `Math.max(wall, ro * 0.05)` reads
  as "5% where the host states none" and behaves as "at least 5%, always" — so it overrode the host's
  own stated wall on **56 of the 78 corpus tubes that state one (72%)**, inflating the coupler's mass
  by a median 1.93x and up to 12.85x (+416 g on `FullScaleModelTH.rkt` alone). A design that states
  its wall has answered the question. Fixing it took the corpus median coupler from 12.97 g to
  **3.54 g**;
- **the birth clamp was measured against the wrong tree.** `applyAdds` runs before
  `applyDimensionEdits`, so a coupler was clamped to the host's PRISTINE length and a `bodyLength`
  edit afterwards resized the tube underneath it. Seated `bottom`-flush, the overhang goes out the
  FRONT: on the starter, 74.8 mm of a 94.8 mm coupler ends up inside the nose cone still carrying its
  un-shrunk mass. A tube that shrinks now takes its internal fittings with it — applied to the
  fittings a design ARRIVED with too, since the geometry is equally impossible either way. This is
  the class `withMassStation` already closed for point masses, reopened for a new kind;
- **the e2e's headline assertion could not fail.** It read overall length to prove the parts went
  inside — but `overallLength` maxes over body kinds only, so it is structurally blind to these two.
  The whole test passed with `inside: false` and both parts built at a NEGATIVE station, ahead of the
  nose tip. It now reads the Station column and the stated length and asserts containment directly;
- **the corpus check's count had 43% of slack** (`> 40` against an actual 70) while every list it
  fills sits behind an `if (!made) continue`, so half the corpus could have stopped building with
  every assertion still green. It is `eligible * 2` exactly.

Two smaller honesty corrections from the same review: "never below 1.054" was false as written (the
corpus minimum is 1.05374), and the e2e's comment named cardboard and ply for parts that inherit the
starter's fibreglass.

Pinned by seven cases in `lib/model/edit.test.ts` — the two sizes diverge from one host and the gap
widens with diameter, the bore comes from a nested mount with a negative control where there is none,
the built part uses the resolved bore rather than only the helper reporting it, the mass is a plate's
rather than a slug's, a short host clamps at birth, a shrinking host clamps after, and a non-tube is
refused — by a corpus sweep authoring both kinds on all 35 designs, and by an e2e that drives both
buttons and reads the stations back.

*Increment 8 — PART-WAY, and what is left is UI wiring only.* The model layer and the picker's own
half are on the branch, gated and tested; nothing renders them yet, so **no flyer can reach this and
it is not shipped**.

**The structural difference from the three pickers that already exist, which is why this took a new
shape rather than a fourth copy.** A body tube, a nose cone and a parachute all exist on the design
before the flyer picks one, so each pick is an EDIT to a part an aim slot can name, keyed on
`GeometryEdits`. A coupler and a centring ring do not exist until they are authored — there is
nothing to aim at. So the pick rides on the `AddedPart` entry that creates the part
(`AddedPart.pick`), which says the same thing with no new addressing and inherits everything the
entry already has: one undo step takes the part and its pick together, removing the part cannot leave
the pick behind, and **none of `hasGeometryEdits`, `INERT_EDIT_FIELDS`, `isEditedValue` or
`AIM_SLOTS` needs a new case** — four hand-maintained enumerations avoided.

**What the catalogue states, measured over all 733 rather than assumed.** Every coupler and every
ring states an outer diameter, an inner diameter, a length and a material — 236 of 236 and 497 of
497 — and **none of either states a mass or a thickness**. So unlike the nose cone and the parachute
there is no published-versus-derived mass question here at all: the weight is computed from the
geometry and the stock in every case, through the same `lib/sim/mass.ts` path a hand-typed ring uses.
The one discriminating term is the stock's DENSITY, and it disables 14 of the 497 rings and 0 of the
236 couplers. 7 couplers state a bore of exactly 0 — solid balsa plugs, a real product the mass model
already flies as a solid cylinder, so `buildable` admits them deliberately.

**A picked part too long for its host is REFUSED, not clamped**, and that is the opposite of what the
derived path does. The derived length is Loft's own number and cutting it down is honest; a picked one
carries a vendor's part number on the parts row, and silently flying a shortened version of a named
product is a wrong number under a label naming a real part. Reachable rather than theoretical:
catalogued couplers run to 1.2192 m.

**Both recorded gotchas reproduce, and one is sharper than recorded.** The five `rowKey` collisions
are all SEMROC rings — but only THREE are different products at identical dimensions, separated by
their description alone (`CR-7-18` with and without an engine-hook slot, `CR-9-175P` with and without
four fin locks). The other two are byte-identical rows listed twice upstream, which no field can
separate. The key carries the description and, in the last resort, the index `DataTable` already
passes for exactly this. Couplers collide 0 times.

**And a placeholder trap the parachute increment had already been caught by, caught again.** The first
draft's search examples were `38 mm` for couplers and `29 mm` for rings; both match **0** rows,
because the filter reads part number and description and no ring or coupler description states a
millimetre size — they read "Tube coupler, T5, 2 in. length, PN C5-2". Every term is counted now:
`JT-` 21, `BT-` 45, `phenolic` 31; `CR-` 186, `fiber` 242, `plywood` 125.

Pinned by four cases in `lib/model/edit.test.ts` — a pick replaces all four properties and is
provably a different part from the derived one, a too-long pick is refused while the same pick at a
fitting length builds, the mass is the pick's and dropping the pick returns the derived part exactly,
and every way a stored record can fail is refused while a solid plug is admitted.

**What remains, and it is the whole of what a flyer would see.** `GeometryInspector` owns the
selection and would host the picker, but it receives neither the `added` list nor `imperial`, so two
props have to be threaded from `LoftApp` before a `PartPicker` can render against the selected
authored part. That is the increment's last slice and it is where the next run should start; the
model beneath it is done and green.

*Increment 8's last slice — SHIPPED. The picker renders, and the wiring was one prop rather than two.*

**The handoff's own brief was off by one file, and measuring it saved most of the work.**
`GeometryInspector` is rendered from `ResultsView.tsx`, not `LoftApp`, and both wanted values already
arrive there: `added` rides inside the `geometry` bag beside `addedStages` and `mountAdds`, and
`imperial` is `units === "imperial"` on a prop the panel has always had. So the thread is **one new
prop and one call-site line**, plus the two handlers that turn a catalogue row into a `PickedRing` —
built in `LoftApp` beside the other three picks, because that is where the rest of the bag is
assembled and where the refusal of a density the catalogue would not stand behind stays one decision.

**Authoring the part now picks it out, and without that the picker was unreachable.** A coupler and a
centring ring have no `AIM_SLOTS` entry — deliberately; no field on the editor describes one — so
`aimEditsAt` returns an empty patch and the panel's aim-following effect cannot show a newly authored
one as the pick the way it does for a tube, a fin set, a transition or a mass object. Authoring a
coupler left the panel still pointing at its HOST, with the picker behind an unexplained click on a
row a flyer has no reason to think is interactive. The same rule the aim effect already states — a
part that just arrived shows as the pick — now applies to the two kinds no aim can speak for.

**A Sev-1 this increment made reachable, found by the pre-push fan-out and confirmed in a browser —
and the first fix for it was wrong in the other direction, which the pre-push review then caught.**

`buildAdded` REFUSES a picked part longer than its host rather than cutting it down, and the reason
is stated in its own comment: a vendor's part number over a length that vendor never published is a
wrong number under a real label. But it judges against the host's **pristine** length, and
`applyDimensionEdits` runs afterwards. Measured on the starter: pick a 203.2 mm Always Ready Rocketry
TC_2.15_8 for the 620 mm tube, then type 200 into *Body length*, and the shrink clamp cut the part to
**200.0 mm** while the panel still read *Flying Always Ready Rocketry TC_2.15_8*.

Teaching the shrink clamp to drop a picked part fixed that case and left the rule split across two
gates judging two different rockets — and the review found the other half immediately: **lengthen**
the tube instead and a coupler that fits the tube on screen is refused for not fitting the tube in
the file, after which `applyAdds` drops the entry and the part the flyer just chose disappears. Two
gates, two rockets, wrong in both directions.

So there is now **one** gate. `fitAddedInternalParts` runs dead last in `applyGeometryEdits`, over the
finished tree, and asks the question once: a PICKED part longer than its host is left out, a DERIVED
one is cut down. That asymmetry is the rule rather than a deletion — a derived length is Loft's own
estimate and shortening it is honest — and it is the negative control in the test. Design-arrived
fittings stay with the shrink clamp, which is the right home for them: their geometry is the file's
own until the flyer types a length that contradicts it. One class of part, one rule, one home.

**Which meant the disappearance had to be said out loud.** A part leaving the design with a caption
still claiming to fly it is two surfaces disagreeing about one rocket, so the panel now names the
part, both lengths, why it is left out, and the two ways back — lengthen the tube, or drop the pick.
`DESIGN.md` §6: a withheld value says why and how to get it back.

**And the picker refuses a too-long row up front rather than at apply time**, because `applyAdds`
skips a part it cannot build: without the bound, tapping *Use* on a 1.2192 m coupler would delete the
flyer's authored part with nothing said. It is disabled with the reason on the row rather than
filtered out, so a flyer who searched for a part number they own reads "longer than the 620.0 mm it
goes into" instead of finding nothing. The fit filter also names the **host tube's bore** rather than
"this design's caliber" for these two kinds — a coupler at the airframe's caliber does not go inside
the airframe, and the old wording named the wrong dimension while showing the right number.

**Three more the review found on the new surface, all real, all in what it SAYS rather than what it
computes.** The picker's caption read *Flying Always Ready Rocketry TC_2.15_8* directly beneath the
notice saying the part is not in the flight — two lines about one part, disagreeing; both now read
the same comparison off the same two lengths. The provenance paragraph had no arm for the two
internal kinds and fell through to the nose cone's, so the coupler picker told a flyer that choosing
a part sets "this design's nose length, contour, base diameter, shoulder" and warned about a
mould-line step, on a part that touches no mould line at all. And with the part out of the tree there
was no built component to read a caliber off, so the fit checkbox vanished while the filter behind it
stayed latched — "0 of 236 catalogued couplers" with no control on screen to clear it, which is a
state with no way back out; the caliber now falls back to the pick's own.

**And the fit filter was showing the wrong number under the right name.** Opening it on the picked
PART's outer diameter agreed with the tube only until a pick landed — `buildAdded` overwrites that
figure with the vendor's — so after choosing a 50.8 mm coupler the label read "Only couplers that fit
this tube's bore (50.8 mm)" over a 51.0 mm bore, and ticking the box filtered for parts matching the
last choice rather than the tube. It now reads the host's own bore, by the same expression the
applier sizes a derived coupler with.

Pinned by the six `picking a real coupler or centring ring` cases and by an e2e that authors a
coupler, reads the picker off the authored part, checks the filter names and shows the tube's 51.0 mm
bore both before and after a pick, is refused an 863.6 mm row with its reason, takes a 152.4 mm one,
shortens the host under it, reads the notice, checks the caption agrees with it, re-opens the list to
prove the filter can still be cleared, and drops the pick to get the derived part back. Both were
proved able to fail: reverting the fit rule alone reds the unit case, cutting the `added` prop alone
reds the e2e.

**Size.** 3–5 increments; 4–6 was the last estimate and **8 is now honest** — the catalogue pickers
for these two kinds were still owed, and increment 8 took two passes.

**Notes.** `COMPETITION.md` rows 2 and 3. Keep the corpus honest: a catalogue part must produce the
same internal Rocket model an imported one does, or the solver ends up with two shapes of truth.

---

## R9 — The descent Loft cannot defend, and the flyer cannot reach

**Status: SHIPPED 2026-08-04** — every clause of the amended *done when* is met and pinned, and one
clause of the ORIGINAL wording is refuted rather than delivered (see increment 4). Increments 1, 2
and 3 shipped 2026-08-03; 4, 5, 6 and 7 on 2026-08-04.

**What a flyer can do that they could not:** see the drag coefficient their descent is computed from,
learn whose figure it is, change it, and re-fly on it — and be told when the figures below it rest on
a coefficient nobody stated. **What is measurably better:** the RockSim ground-hit median fell
**25.7% → 21.9%** with no engine change, because the census had been comparing a vertical speed
against a total one.

Pinned by: `lib/sim/recovery-defaults.test.ts` (six cases — the descent-drag constant, every adapter
fallback's source, and the Loft-authored coefficient, all asserted on the SOURCE so the literals
cannot come back); `lib/rkt/adapt.test.ts` (the vertical component is read as a magnitude and is
explicitly asserted NOT to be the total; the fallback fires only when the component is absent);
`lib/model/edit.test.ts` (the edit sets the coefficient, records the flyer's provenance, leaves mass
alone, refuses zero and negative, and moves the arrival speed in the right direction);
`lib/ork/export.test.ts` (the value survives the round trip and the attribution changes honestly);
and two e2e cases that read the coefficient off `/design` and change it.

*Increment 7 — SHIPPED. The census re-measured and published, and it did not move where the
milestone was originally scoped to move it.* `groundHitVelocity` is **8.3% over 94 stored
simulations**, unchanged. That is the honest outcome and this file said in advance it would be
acceptable: the milestone's premise — that the parachute coefficient was the lever — was disproved by
its own increment 3, and what it delivered instead is honesty (the coefficient visible, attributed,
editable, and its dependents marked) plus a real 3.8-point accuracy gain confined to the `.rkt`
subset. `/docs/limitations` carries both figures and the reason.


**Increment 3 disproved the milestone's own premise and the remaining increments are re-aimed** —
read its entry before building 4 onward, and note the *done when* is amended there. **Increment 6
then found the RockSim half of the error was not physics at all** — read its entry before assuming
the remaining 21.9% is Loft's to fix. Increments 4, 5 and 7 remain: the coefficient on screen,
editable, and the census re-published.

*Increment 6 — SHIPPED 2026-08-04. The RockSim gap attributed to a named cause, and most of what
was attributable fixed. No engine change.*

**RockSim stores the TOTAL ground-frame landing speed; Loft reports the VERTICAL descent rate.** The
census had been comparing one against the other. Verified rather than inferred: `<VelocityAtLanding>`
equals hypot(X, Y, Z) of its own three component tags to four decimal places on **17 of 17** stored
simulations across the corpus's RockSim designs. A total is never smaller than its own vertical
component, so Loft could only ever read low against it — which is exactly the one-directional
signature increment 3 measured and could not explain ("86 of 92 descend SLOWER than stored", where a
merely wrong coefficient would scatter).

Reading `<YVelocityAtLanding>` instead, as a magnitude (the file stores it signed and negative on a
descent):

```
rocksim ground-hit velocity, median |Δ|:   25.7%  ->  21.9%
```

with nothing Loft flies having moved. The overall `groundHitVelocity` median is unchanged at 8.3%
(n=94) because RockSim is 16 of the 92 attributed rows and OpenRocket dominates the median.

**What is left is not all Loft's, and the next session should not assume it is.** Of the 17 `.rkt`
comparison rows, 11 are one design's plugged-motor BALLISTIC runs — RockSim's own
`<HasDeployed>0</HasDeployed>` and `<FinalState>4</FinalState>` — pooled with canopy descents by a
census that filters only on `hasPropulsion && validation`. And that design stores **83.6 m/s and
162.0 m/s for eleven runs of the same ballistic configuration**, a 1.94x self-disagreement no
coefficient or drag model can satisfy. Splitting deployed from ballistic rows before comparing is the
obvious next measurement; it is filed rather than queued, because R9's remaining increments are the
Cd surface and this is now a corpus-methodology question.

Pinned by two cases in `lib/rkt/adapt.test.ts` — the vertical component is read as a magnitude and is
explicitly asserted NOT to be the total, and the fallback to the total fires only when the component
is absent.

*Increments 1 and 2 — SHIPPED. Six figures the descent is computed from, in one place each, saying
what backs them. No flown number moved, and that was the contract.*

**The airframe's descent drag existed as three numbers, one of which claimed to be the source of the
other two.** `lib/sim/recovery.ts` exported `DESCENT_BODY_CDA_FACTOR` with a comment saying it
"matches the descent model in simulate.ts" — and `simulate.ts` typed the bare literal twice, at the
drag term and at the descent step-size limiter. Nothing enforced the match, so changing the constant
would have re-sized every canopy while leaving every flown descent alone and no test could have seen
the disagreement. `simulate.ts` imports it now, and the constant says in a value
(`DESCENT_BODY_CDA_SOURCE`) as well as in prose that it has no published source.

**Five uncited literals across three adapters are now one documented set.** `lib/sim/recovery-defaults.ts`
holds each fallback with its provenance, its basis in a sentence, and **how often it actually fires
across the corpus** — because a default that fires on nothing is not a lever, and knowing which is
which is what stops the next session "fixing" the wrong one.

| fallback | value | source | corpus hits |
|---|---|---|---|
| `.ork` canopy | 0.8 | **OpenRocket's own `auto` default** (`Parachute.java`) | **17** of 24 |
| `.ork` streamer | 0.75 | none verified | 0 |
| `.rkt` canopy | 0.8 | none — RockSim exposes no Cd field at all | 0 |
| `.rkt` streamer | 0.75 | none | 0 |
| RASAero canopy | 0.8 | none — **their own documented default is 1.33** | 0 |

**Two things this increment refused to do, and both refusals are the point.**

- **It did not move the RASAero default to 1.33**, even though RASAero II documents that figure with a
  stated basis and Loft falls back to 0.8. Every RASAero recovery device in the corpus states its own
  `CD`, so the fallback is reached by **zero** real files: the change would move no flown number and
  could be validated against nothing, which is exactly the speculative fix `MAINTAINING.md` forbids.
  It is recorded in the constant's own comment so it is not rediscovered and re-shelved every session.
- **It withdrew a citation it could not back.** The first draft gave the `.ork` streamer default a
  source of "OpenRocket's own streamer default (`Streamer.java`)" — invented by symmetry with the
  canopy line above it. The canopy's claim rests on an actual reading recorded in `COMPETITION.md`
  row 35; nothing in this repository records reading `Streamer.java`. A source string is a claim, and
  the test now asserts exactly one of the five is sourced.

**Verified to have changed nothing that flies:** the corpus census is identical before and after —
`groundHitVelocity n=94 8.3%`, `maxAltitude n=97 3.1%`, all ten metrics unmoved.

Pinned by `lib/sim/recovery-defaults.test.ts` (four cases: both descent `cdA` expressions go through
the constant, asserted on the SHAPE so the literal this forbids cannot come back; every fallback has a
source or says "no published basis" in words; no adapter types a recovery Cd by hand; and each
fallback carries its corpus hit count, with the RASAero discrepancy asserted to still be written
down). Published on `/docs/limitations`.

*Increment 3 — SHIPPED, and it does NOT support this milestone's own premise. Read this before
building increments 4–6 as written.*

The milestone was scoped on the hypothesis that the parachute drag coefficient is the lever on the
8.3%. **The measurement says it is not.** Every recovery device now records whether its coefficient
came from the file or from a Loft fallback (`Parachute.cdFrom`), which is what makes the split
possible at all — a canopy imported at 0.8 and one that fell back to 0.8 are indistinguishable by
value:

```
ground-hit velocity, attributed (R9 increment 3):
all                    n= 92  |Δ|   8.3%  signed   -8.2%  86/92 descend SLOWER than stored
Cd from the file       n= 52  |Δ|   8.3%  signed   -5.7%  46/52 descend SLOWER than stored
Cd from a fallback     n= 40  |Δ|   8.3%  signed   -8.3%  40/40 descend SLOWER than stored
openrocket             n= 76  |Δ|   7.8%  signed   -7.8%  74/76 descend SLOWER than stored
rocksim                n= 16  |Δ|  25.7%  signed  -14.9%  12/16 descend SLOWER than stored
```

**Three things fall out of that, and the first two kill the original plan.**

1. **The coefficient's provenance does not discriminate at all.** Designs flown on their own designer's
   figure and designs flown on a Loft fallback have the *same* median absolute error, to a tenth of a
   percent. Whatever is wrong is wrong for both, so changing a fallback cannot fix it. Increments 4–6
   as written — put the Cd on screen, make it editable, re-measure the census — would have shipped a
   real capability and moved the census by approximately nothing, and the re-measure at the end is
   where anyone would have found that out.
2. **The error is one-directional, which a wrong coefficient would not be.** 86 of 92 flights descend
   SLOWER than the file's stored figure, and **40 of 40** in the fallback group. A coefficient that is
   merely wrong scatters; a systematic one-sided offset points at the descent MODEL, at a definitional
   difference in what "ground-hit velocity" means between the tools, or at both.
3. **The tool discriminates where the coefficient does not.** RockSim files are **3.3x worse** than
   OpenRocket files — 25.7% against 7.8% — and the five worst cases in the corpus are all `.rkt`, four
   of them the same design at ~65%. That is the lever, and it is an adapter or a definitional question
   rather than a physics one.

**So R9's remaining increments are re-aimed, and the *done when* is amended below.** The Cd work is
still worth shipping — a flyer cannot see or change the one input in the recovery chain, which is a
real gap and `COMPETITION.md` row 35 — but it is now a **capability and honesty** increment rather
than an accuracy one, and this file should stop implying it will move the census. What follows it is
the RockSim split.

**Amended *done when*:** a canopy's Cd is readable and editable on `/design` for imported and authored
chutes alike, with its origin named (file value · catalogue part · Loft's default) and the default's
basis cited — **and** the `.rkt` ground-hit disagreement is attributed to a named cause and either
fixed or written down as a `knownIssue` with the measurement. The census figure is re-measured and
published whatever it turns out to be, **including if it does not move** — a milestone that improves
honesty and not accuracy is a real outcome and must not be dressed as the other one.

**Remaining increments, re-ordered:** (4) put the coefficient on screen read-only with its provenance;
(5) make it editable and let the edit flow through a re-fly and the `.ork` round trip R6 pinned;
(6) attribute the RockSim 25.7% — one design contributes four of the five worst cases, so start by
reading what `FullScaleModelTH.rkt` stores and what Loft flies for it; (7) re-measure and publish.

Pinned by the corpus case *says where the ground-hit-velocity error actually lives*, which prints the
split and asserts the measurement was actually taken — both groups have to be non-trivially populated
or the split cannot discriminate and the test says so rather than printing three tidy `n=0` lines.

**Outcome.** The descent half of every flight becomes a number Loft can stand behind and a flyer can
steer. The parachute drag coefficient becomes visible, sourced and editable wherever it is flown; the
airframe's own descent drag stops being an undocumented `0.5` typed into two files; and the worst
figure in the accuracy census stops being the one nobody can reach.

**Why this and not the after-list's R9.** The after-list names "the multi-solver cross-check as a
first-class view" next — but P2 already shipped `/validate` as a real route rendering
`ValidationPanel`, `DragCrossCheck` and `RocketpyCrossCheck`, so a whole milestone for it overstates
what is left. Meanwhile the corpus points at a gap nobody has queued, and the numbers are this run's
own measurement rather than a recollection:

```
corpus census (median |Δ| vs each file's stored results, known issues included):
  groundHitVelocity    n= 94  8.3%      ← worst of ten, 2.7× apogee's
  deploymentVelocity   n= 76  6.0%
  flightTime           n= 94  3.3%
  maxAltitude          n= 97  3.1%
  …
  timeToApogee         n= 97  1.5%
```

**Ground-hit velocity is carried by 94 of the corpus's stored simulations and is the metric Loft
agrees with least** — nearly three times apogee's error. And the single input that drives it is on no
surface in the app: a flyer cannot see the parachute drag coefficient, cannot change it, and is not
told where it came from. Landing speed and landing energy are what an RSO and a waiver actually check.

**The state of it today, measured 2026-08-03 rather than assumed:**

- `lib/sim/recovery.ts:21` exports `DESCENT_BODY_CDA_FACTOR = 0.5` with a comment saying it "matches
  the descent model in `simulate.ts`" — and `simulate.ts:612` and `:654` each type a bare `* 0.5`
  instead of importing it. One physical quantity, three literals, one of them claiming to be the
  source of the other two.
- Three adapters carry uncited defaults for the same coefficient: `lib/ork/adapt.ts:555` 0.8 (and
  `:576` 0.75 for a streamer), `lib/rkt/adapt.ts:465` 0.8 and `:486` 0.75, `lib/rasaero/adapt.ts:400`
  0.8. None names a source.
- `COMPETITION.md` row 35 is the same gap from the competitive side, and two of the four competitors
  DO state a basis: RASAero II's 1.33 with its stated derivation, RocketPy's 1.4 cited to NASA
  SP-8066. Loft states nothing.

**Done when** a canopy's Cd is readable and editable on `/design` for imported and authored chutes
alike, with its origin named (file value · catalogue part · Loft's default) and the default's basis
cited on the methods page; the descent body-drag factor is ONE exported, cited constant that
`simulate.ts` imports rather than re-types; every adapter's recovery-Cd default carries a source
string or an explicit "no published basis"; the derived readouts a defaulted Cd feeds — descent rate,
arrival speed, landing energy — carry the `extrapolated` marker the rest of the app already uses; and
the census figure for `groundHitVelocity` is re-measured and published, whatever it turns out to be.

**Pinned by** a unit test asserting the three descent-drag literals are one imported constant and that
every adapter default has a non-empty source; an e2e that reads the Cd off `/design`, changes it, and
watches ground-hit speed move; and the corpus census itself, whose `PUBLISHED_MEDIAN_PCT` gate already
fails CI on a regression.

**Size.** 4–6 increments. The first three, in order, because each is cheap and none depends on the
next: (1) import `DESCENT_BODY_CDA_FACTOR` in both places in `simulate.ts` and state whether it has a
source or explicitly has none; (2) give every adapter default a source string or an honest "no
published basis"; (3) **measure where the 8.3% actually comes from before moving any number** — print
stored versus Loft descent rate for all 94, split by stated-Cd against auto-Cd designs and by wind
above and below 4 m/s. Only then (4) put the coefficient on screen read-only with its provenance,
(5) make it editable and let the edit flow through a re-fly and the `.ork` round trip R6 pinned, and
(6) re-measure the census and update `PUBLISHED_MEDIAN_PCT`, `/docs/validation` and the methods page
in ONE commit.

**Notes.** `COMPETITION.md` rows 35 and 33. **Do not move a number before increment 3.** The 8.3% has
not been attributed, and "improve the descent" without knowing whether the error lives in the
coefficient, the body drag, the wind model or the stored figures themselves is how a tolerance gets
widened to fit. This milestone is allowed to end with the coefficient unchanged and honestly labelled;
that would still meet the *done when*.

---

## R10 — The corpus comparison Loft can actually defend

**Status: SHIPPED 2026-08-09** — every clause of the *done when* is met. Size items (1)–(4) shipped
2026-08-04, three of item (5)'s four parts on 2026-08-05 (`optimumDelay`, `deploymentVelocity`, and
the published per-metric populations), and `maxAcceleration` on 2026-08-09 — where the defect turned
out to be the census counting one comparison fifteen times rather than the oracle's resolution, and
the entry below records both the prediction and the measurement that replaced it. Pinned by the
corpus census's own `PUBLISHED_MEDIAN_PCT` gate, now failing in **both** directions, plus
`counts a stored comparison once, however many times a file repeats it`, `counts a plugged descent
separately from a canopy one, and neither population vanishes`, `names every file whose own tool
stores two answers for one flight`, and `scores every stored optimum delay against the flight its own
file describes`. Original note follows.

**Size items (1) through (4) shipped 2026-08-04**, each publishing as it
landed; only (5) remains. Pinned by `lib/ork/adapt.test.ts` (`the OpenRocket ground-hit frame`, both
sides of the 24.12 boundary plus every version string the corpus actually carries), by four cases in
`lib/rkt/adapt.test.ts` covering the deployment read, by the census cases
`counts a plugged descent separately from a canopy one, and neither population vanishes` and
`names every file whose own tool stores two answers for one flight`, and by the census's own
`PUBLISHED_MEDIAN_PCT` gate — which now also fails on a published claim nothing measures. **The first
commit's message calls its work "increments 1 and 2" — read it as Size item (1); the numbering there
is wrong and this line is the one to trust.**

*Size item (1) — SHIPPED 2026-08-04. The `.ork` convention, settled from source, and every file
compared against the quantity its own version stored.*

The inference in `COMPETITION.md` row 34 was half right, and the half it missed is why this metric
had three different "gaps". OpenRocket interpolates `groundhitvelocity` out of `TYPE_VELOCITY_TOTAL`
at the GROUND_HIT event — logic byte-identical across every release — but what that series holds
during descent flipped at **24.12**: `AbstractEulerStepper.java:168` set it from `airSpeed.length()`
(air-relative, and under an open canopy effectively the vertical rate) up to 23.09, while from 24.12
that stepper has zero references to the type and `SimulationStatus.java:643` sets it from
`getRocketVelocity().length()` — the ground-frame total, drift included, the same quantity RockSim
stores. On this corpus 27 stored simulations are pre-24.12 and 64 are 24.12 or later, so most of the
OpenRocket census was on the wrong side of it, in one direction, because a total is never smaller
than its own vertical component.

`orkGroundHitFrame()` records the ERA rather than converting the value — the creator string is a
fact about the file, and by the time a comparison runs the document is a `Rocket` and the string is
gone — and `compareToStored` picks which of Loft's two figures to score. An unparseable creator falls
back to the vertical reading, because a wrong era is worse than no era.

Worth 8.3% → **2.0%** on ground-hit velocity over the same 94 simulations with no change to the
solver (openrocket alone 7.8% → 1.2%), and it took the one-sided bias with it: "86 of 92 descend
slower than stored" at a signed −8.2% median became 66 of 92 at −1.0%. Worst of the ten metrics to
third-best. `/docs/validation`, `/docs/limitations` and row 34 all moved in the same commit — row 34
from inference to citation.

*Size items (2) and (3) — SHIPPED 2026-08-04. The census stops pooling a lawn dart with a parachute.*

RockSim states deployment per device, as `<HasDeployed>` inside each stored run's
`<SimulationEvents>`. Scoping to that element is load-bearing: the same tag appears in
`<Booster1Staging>`/`<Booster2Staging>`, which are STAGING events, so a file-wide read would report a
booster separating with nothing else out as a canopy descent. `<FinalState>` is read only to tell
"the file ran this and nothing came out" from "the file records no events at all" — it corroborates
on 17 of 17 and is deliberately not the primary signal, being an undocumented enum where
`HasDeployed` says exactly what it says.

**And OpenRocket states it too, which the first version of this increment got wrong.** The claim
"only `.rkt` files say" was written into a type comment, a census comment and a docs paragraph before
anything checked — and it was wrong for the same structural reason the whole milestone keeps
finding: the `.ork` importer reads `<flightdata>`'s summary ATTRIBUTES and had never opened its
`<databranch>`, which carries a per-step event timeline including
`<event type="recoverydevicedeployment"/>`. **77 of the corpus's 91 stored `.ork` flights record
one**, and not one records events without one. The remaining 14 are summary-only saves and stay
undefined.

Measured: `FullScaleModelTH.rkt` stores 15 runs of one design — 4 `[L1940X-0]` with three devices
out landing at 8.8–9.2 m/s, and **11 `[L1940X-P]` plugged, landing at 83–162 m/s**. The census was
averaging them together.

Split on the tool's own marking, `groundHitVelocity` goes **2.0% → 1.3% over 82 non-ballistic runs**,
with the 12 ballistic ones on their own published line at **14.9%** — now the worst figure in the
census rather than diluted into the best. Same split on `flightTime`: 3.3% → 3.1%, and 4.8%
ballistic. Of those 82, **70 are stated canopy descents and 12 state nothing either way**, and the
third population is named on the page rather than folded in silently.

*Size item (4) — SHIPPED 2026-08-04. The self-disagreeing file is named, by a detector rather than by
a comment.*

Those 11 plugged runs are stored under one name, share every stated input, and split into four at
83.3–83.7 m/s and seven at 161.6–162.0 — RockSim itself returns two answers for one rocket, so part
of the 14.9% ballistic figure is the reference's own spread rather than Loft's error. The census case
`names every file whose own tool stores two answers for one flight` groups each file's stored runs by
name and flags any group spanning ≥1.5×. It asserts in both directions: the known group must still be
found, and no second one may appear unlisted. Nothing is dropped — R10's notes forbid removing a case
to improve a median, and the gate is only worth having because of that.

The threshold has room rather than being tuned: the known group is 1.94× and **the next-widest group
anywhere in the corpus is 1.004×**, which the run prints so a corpus that grows a 1.4× group says so.

*Size item (5) — IN PROGRESS. The remaining eight metrics re-examined, and the first correction
shipped 2026-08-05.*

**All eight were probed, and the answer is not evenly spread.** Five are Loft's physics and should
stop being candidates: `maxMach` (OpenRocket's `maxmach` is the max of its own Mach column, 77/77,
on the same air-relative basis Loft uses), `maxVelocity` (no `.ork` sim in the corpus peaks in total
velocity after apogee, 0/77, so the 24.12 frame change cannot reach it), `maxAltitude` and
`timeToApogee` (clean reads — stored equals the log's own max and event time, 77/77 and 74/77, the
three misses being one 0.05 s output step), and `launchRodVelocity` (OpenRocket's figure equals BOTH
the total and the vertical at the `launchrod` event, the rod being vertical). Writing that down is
half the value of the item: it stops the next session re-litigating settled numbers.

**Three carry a real defect, and they are ranked by what a probe measured rather than by what the
docs page argues.**

1. **`optimumDelay` — SHIPPED 2026-08-05.** Two formats mean different flights by the same word. See
   `COMPETITION.md` row 38 for the arithmetic. Worst row **+1107% → −21%**, corpus-worst
   **1107% → 59%**, published median unmoved at 2.5% — and that last fact is why the pinning check is
   a `worst`-row assertion rather than a median: *a median cannot see four rows in eighty-four move
   by a factor of eighteen*. Pinned by `lib/corpus/sweep.test.ts`'s
   `scores every stored optimum delay against the flight its own file describes`, proved able to fail
   by reverting the adapter (red at 1107.2%, naming the file).
2. **`deploymentVelocity` — SHIPPED 2026-08-05.** All three problems taken. OpenRocket's stored
   figure is the speed at the LAST device to open, where Loft reports the FASTEST — the opening shock
   a flyer sizes hardware against, and deliberately not the smaller of the two, since it also feeds
   the `early-deployment` warning. `deploymentVelocityEvent` scores each against the event its own
   file describes: **openrocket 6.0% → 5.6%**. RockSim's figure, in the misspelled
   `VelocityAtDeplyment`, is read for the first time — so the metric stops being an OpenRocket-only
   number standing in a cross-tool census, at **6.0% over 76 rows → 6.2% over 81**. The published
   median rose and the measurement got better, which is the direction this milestone's notes
   explicitly allow. And the not-deployed population is split off: one stored run is a charge firing
   with nothing out at ~234 m/s against Loft's correct nothing, which is not the same quantity.
   Pinned by three cases in `lib/validation/compare.test.ts` asserting both events on one summary,
   and by the census's own page-population check, which caught the n change the moment it happened.

   *Superseded plan, kept because the measurement in it is what made the increment cheap:* Three separate problems
   under one 6.0%: OpenRocket stores the velocity at the LAST deployment event (77/77 exact) where
   `lib/sim/simulate.ts` takes `Math.max` across every device — `Chute release.ork::Simulation 3`
   reads stored 14.34 against Loft's max 19.46 and Loft's last 14.00; RockSim stores it too, as the
   misspelled `<VelocityAtDeplyment>` plus a per-device `<DeployedAt_Velocity>`, and
   `lib/rkt/adapt.ts` reads neither, so the published 6.0% is an **OpenRocket-only** figure standing
   in a cross-tool census; and the deployed/ballistic population split is not applied to this metric,
   though its stored values span 0.601 to 225.35 m/s. **Loft's own reported figure must not change**
   — it is deliberately the worst-case opening shock and feeds the `early-deployment` warning; it is
   the COMPARISON that has to be made like-for-like, the same way `optimumDelayBasis` just was.
3. **`maxAcceleration` — SHIPPED 2026-08-09, and the fix is not the one this entry predicted.**
   The measurement below is right and its diagnosis was wrong, which is the whole value of having
   reproduced it before scoping it.

   *What this entry said:* all of the 3.2% lives in the 17 `.rkt` rows (median 8.8%, every one HIGH),
   and `FullScaleModelTH.rkt` stores a byte-identical `<MaxAcceleration>` of 125.291 across all
   fifteen runs with different winds and two rail lengths — so a stored value that never varies is a
   sampled or rounded peak rather than a per-run measurement, and part of that 8.8% is the oracle's
   own resolution.

   *What is actually true:* **Loft returns 136.345 for all fifteen of those runs too.** What those
   runs vary is the **rail length** (`<LaunchGuideLen>` 914.4 mm on eleven, 1422.4 on four) and the
   **ejection delay** (`[L1940X-0]` against the plugged `[L1940X-P]`, apogee ~323 m against
   ~2,101 m); `<LaunchWindSpeed>` is `0.` on all fifteen. Peak axial acceleration comes from the
   thrust spike, which is over before the rocket clears even the short rail and long before any
   ejection charge, so neither varied input can reach it and both tools agree it does not move. The
   stored figure is not coarse either — `<MaxHorzAcceleration>` in the same blocks reads fifteen
   distinct values at six significant figures, so RockSim is not quantising this field. What was
   wrong was the arithmetic over it: **one disagreement, at +8.8%, counted fifteen times in a
   population of 94**, carrying fifteen times the weight of any other design's. The same shape sat
   under `launchRodVelocity` — 13 repeats, not 14, because rail length **does** reach that one
   (14.6479 off the short rail, 18.1014 off the long) so its fifteen rows collapse to two — and,
   smaller, under `maxMach`, `optimumDelay`, `timeToApogee`, `maxVelocity` and `groundHitVelocity`:
   **54 of the census's 910 comparison rows were exact repeats.**

   *And the first version of this paragraph was wrong in the same way the entry it corrects was.* It
   said the runs "differ only in wind or rail length" and that boost-phase figures respond to
   neither — a plausible story, written from the shape of the finding rather than from the file, and
   caught by the pre-push review opening `FullScaleModelTH.rkt`. It was in the test docblock, in
   `HANDOFF.md`, and on `/docs/validation`. **Reproducing a finding is not the same as reproducing
   its explanation**, and this milestone has now been bitten by that twice in one item.

   The census now counts a comparison once, keyed on the file, the metric, the stored value **and**
   Loft's value — so a disagreement that genuinely varies per run still counts every time, and the
   rule cannot reach an inconvenient case, which differs from its neighbours by definition.
   `maxAcceleration` **3.2% → 1.8%** over 80 rows, `launchRodVelocity` **1.9% → 1.6%** over 73,
   `optimumDelay` 2.5 → 2.4; four metrics did not move at all. Loft's own window was already right
   for `.ork` — stored `maxacceleration` equals the max before the first deployment on 77/77, which
   is exactly Loft's `!anyDeployed` freeze — and no solver code changed.

   **Every figure it moved, it moved downward, and R10's notes forbid dropping a case to make a
   median look better.** Three things answer that rather than one: the rule is mechanical and
   metric-blind — `pctError` is a pure function of the two values the key is built from, so every
   member of a duplicate group carries the same error and the rule cannot see a row's magnitude at
   all; the repeats are published on `/docs/validation` with each metric's population rather than
   netted away; and `counts a stored comparison once, however many times a file repeats it` holds it
   from both ends — it fails if the de-duplication stops finding repeats, if it starts finding rows
   that are not repeats, or if any metric's population falls below ten.

   **Two limits are stated rather than left to be found, and one of them cost something.**
   De-duplicating identical VALUES is not the same as de-duplicating identical RUNS: nine of that
   file's fifteen are byte-identical in every stated input and differ only in RockSim's turbulence
   draw, so on `maxAltitude` they survive as nine rows and one design still casts fifteen votes there
   while casting one on `maxAcceleration`. The principled form is a median of per-design medians;
   it is filed in `BACKLOG.md` rather than smuggled into this item. And **weight is how a median sees
   a single design** — fifteen rows moving to the top used to drag it past the slack and one row
   cannot, so the change cost real gate strength on exactly the metric it was made for. That is
   replaced rather than accepted: the same case now counts how many designs' max acceleration sits
   past 25% and fails when that number grows. A worst-ROW bound would not have done it — it has to
   sit above today's worst (59.9%) to be green, so the +8.8% → +40% excursion it exists for would
   pass underneath.

   **And the census gate is now two-sided.** It only ever failed on a page claiming to be BETTER than
   the measurement, on the stated principle that improving is always allowed — but a page claiming
   3.2% while the suite measures 1.8% is just as wrong about Loft, and it is the direction that rots
   silently. Improving is still allowed; it now has to be published in the commit that earned it,
   which is what this item's own *done when* asks for.

   **One latent defect fell out of it.** The population check builds a regex from each metric's page
   label, and `apogee` is a substring of `time to apogee` — so `maxAltitude` had been reading
   time-to-apogee's population since the check was written, and passed anyway because both were 97.
   De-duplication moved time-to-apogee to 94 and the collision surfaced. Anchored to the start of a
   list entry; a check that is right by coincidence is not a check.

**And one thing the page itself gets wrong, which belongs to this item's *done when*.**
`/docs/validation` publishes "**97 stored simulations**" once and then lists ten medians under it,
but their real populations range **76 to 97**: `deploymentVelocity` 76 and `maxMach` 77 are
OpenRocket-only, `optimumDelay` 84, `maxAcceleration` and `launchRodVelocity` 94, and only four
metrics reach 97. A reader takes 6.0% as a corpus-wide figure when it is measured on one tool's
files — the same dilution the ballistic split shipped to end.

**Why this and not the after-list's R10.** The after-list names "Toward 6-DOF" next, and explicitly
says to decompose it "only when the fundamentals justify it, and only against published, citable
sources". They do not yet. R9 spent four increments on the accuracy census's worst metric and found
that **a large part of the disagreement was never Loft's physics at all** — it was what Loft was
comparing itself against. That is a fundamentals problem, and it sits directly under 6-DOF: adding
rotational dynamics while the oracle is misread would produce a number nobody could interpret.

**What R9 measured, and left.** Three findings, each with a command behind it:

- **RockSim's `<VelocityAtLanding>` is the TOTAL ground-frame speed** and Loft reports the vertical
  descent rate. Verified as hypot of its own three component tags on **17 of 17** stored simulations.
  Fixed in R9 increment 6, worth 25.7% → 21.9%. **The same question is now open on the `.ork` side**:
  `COMPETITION.md` row 34 establishes OpenRocket's convention by INFERENCE from stored numbers, not
  from a published statement, and a probe this run read OpenRocket 23.09's `AbstractEulerStepper`
  overwriting `TYPE_VELOCITY_TOTAL` with the AIR-relative speed while `unstable` sets it from
  `getRocketVelocity()` — the ground-frame total. If that reading holds, **the convention CHANGED
  between OpenRocket versions**, and a corpus file's `creator` string decides which figure Loft is
  being scored against. Marked `UNVERIFIED`; verifying it is increment 1.
- **11 of the 17 `.rkt` comparison rows are one design's plugged-motor BALLISTIC runs**, pooled with
  canopy descents. RockSim marks them itself — `<HasDeployed>0</HasDeployed>`, `<FinalState>4</FinalState>` —
  and Loft's adapter reads neither tag. `lib/corpus/sweep.test.ts` filters only on
  `hasPropulsion && validation`.
- **That same file self-disagrees by 1.94x**: 83.3–83.7 m/s on four stored runs and 161.6–162.0 m/s
  on seven, for the same design, motor and wind. No coefficient or drag model can satisfy both, and
  four of the corpus's five worst cases are it.

**Outcome.** The accuracy census compares like with like, and every figure it publishes says which
convention it is in and which population it is over. A number in `/docs/validation` stops being "how
close Loft is" in the abstract and becomes a claim a reader can check.

**Done when** every stored figure the census compares against is read in Loft's own convention or
excluded with a reason; a stored simulation the source tool marks as not-deployed is not pooled with
canopy descents (the census reports both populations, separately, rather than dropping either); a
file whose own tool disagrees with itself is named as such rather than averaged into a median; the
`.ork` convention question is settled from OpenRocket's source with a version, and
`COMPETITION.md` row 34 upgraded from inference to citation or corrected; and the published census
figures are re-measured against all of that, with `/docs/validation` and `PUBLISHED_MEDIAN_PCT`
moved in the same commit.

**Pinned by** the corpus census itself — which already fails CI past `CENSUS_SLACK_PCT` — plus a case
asserting the deployed and ballistic populations are counted separately and both are non-trivially
populated, so the split cannot silently degenerate the way R9 increment 3's did.

**Size.** 4–6 increments, and take them in this order because each is cheap and none depends on the
next: (1) settle the `.ork` convention from OpenRocket's source, by version, and write it into row 34;
(2) read `HasDeployed`/`FinalState` in the `.rkt` adapter and carry them onto the stored simulation;
(3) split the census's populations and print both; (4) name the self-disagreeing file rather than
averaging it; (5) re-measure and publish.

**Notes.** `COMPETITION.md` rows 33, 34 and 35. **This milestone is allowed to make the published
number WORSE**, and if it does, that is the result: R9's own increment already moved this metric
3.0% → 8.3% by removing two errors that were cancelling, and said so on the page. What it must not do
is widen a tolerance or drop a case to make a median look better — the corpus gating CI is the single
most valuable check this repo has for unattended physics work.

---

## R11 (from ON-2) — A scratch build flies a flight that goes somewhere

**Status: SHIPPED 2026-08-08** — both increments, and every clause of the *done when* met. Pinned by
four checks:

- `lib/model/starter.test.ts` — *flies a flight that goes somewhere, instead of a vertical line*.
  Asserts the trajectory has more than one distinct downrange value AND that removing the wind
  removes the drift, so it fails for the right reason rather than on a tuned constant.
- `e2e/smoke.spec.ts` — *a from-scratch flight goes downrange, and says the wind is Loft's
  assumption*. The second half matters as much as the first: a drift figure is a number a flyer
  plans a recovery walk around, so a down-range appearing WITHOUT the notice naming whose assumption
  it rests on would be a worse defect than the vertical line.
- `e2e/smoke.spec.ts` — *a flight with no down-range says so, instead of drawing a line on its own
  axis*, with a control asserting the note is ABSENT on the shipped defaults. A caveat that always
  fires teaches flyers to ignore it.
- `e2e/smoke.spec.ts` — *the Conditions placeholders advertise the setup that is actually being
  flown*, which already existed and which CAUGHT this change: it went red on the wind placeholder
  the moment the default moved. That is the contract working — a placeholder is a claim about what
  is being flown, so the constant and the advertised number cannot drift apart.

Both new checks were proved able to fail by a negative control: at `windSpeed: 0` the unit case
reports "expected 1 to be greater than 10" — one distinct x, which is the vertical line itself.

**The census did not move, and that was measured before the constant changed rather than after.**
All 91 stored simulations across the 27 corpus `.ork` files declare their own wind, as does every
committed fixture and bundled sample — so `overridesFromStored` always supplies it and the engine
default is unreachable from any comparison. `lib/sim` and `lib/corpus` green on 346 tests.

**What increment 2 added, stated as what the code does rather than what it was aiming at.**
`FlightViz` detects a trajectory with no horizontal extent — measured in metres off the model, so the
threshold means the same in both unit systems, and gated on a `liftoff` event so it stays silent on a
vehicle that never left the rail — and then says so in two places: the x-axis label reads *"none on
these conditions"*, and a sentence below the plot states that every point is directly above the pad
and names the two inputs a down-range comes from.

**It does NOT relabel or rescale the axis, and the *done when* clause about "a labelled axis" is
therefore NOT met.** `xMax = Math.max(...xs, 1)` is untouched, so the fabricated one-unit range and
the path drawn along the axis line both remain; what changed is the caption and the note. Recorded as
a gap rather than claimed as delivered — the honest next step is x tick labels, which the plot has
never had in any state, and that is a `BACKLOG.md` entry rather than a reason to hold the milestone
open. **The sentence in this paragraph originally claimed the axis fix; a pre-push review caught it
against the diff.**

**Outcome.** A flyer who starts from scratch sees a trajectory, not a vertical line — and wherever
the answer genuinely IS a vertical line, the plot says why instead of leaving them to conclude the
tool is broken.

**Reproduced 2026-08-08, and it is a DEFAULTS problem, not a solver or plotting defect.** The
distinction mattered enough that the note asked for it to be settled first. Downrange is integrated
correctly — `lib/sim/simulate.ts` writes `x: Math.hypot(state.pos.x, state.pos.y)` into every sample,
and `FlightViz` plots it as the x-axis. But `defaultConditions()` in `lib/sim/setup.ts` ships
`rodAngleFromVertical: 0` **and** `windSpeed: 0`, and in a 3-DOF solver with no weathercocking those
are the only two sources of horizontal motion. So all 506 trajectory samples carry `x === 0` exactly,
and the plot is a true vertical line drawn on top of its own axis. Measured on the starter design:

| conditions | downrange at apogee | at landing |
|---|---|---|
| shipped defaults | **0.00 m** | **0.00 m** |
| wind 2 m/s (OpenRocket's own default) | 11.70 m | **411.3 m** |
| rod 5°, no wind | — | 155.6 m |

**A design that DECLARES its conditions is unaffected** — the importer carries them through, and the
placeholders already say when a value is the engine's default rather than the file's. This is only
the from-scratch path, which is exactly the path a stranger takes.

**Done when** a from-scratch design flies with a defaulted wind that is stated on screen as a default
rather than as the flyer's own setup; the trajectory plot refuses to imply a downrange it does not
have (a degenerate range gets a labelled axis and a sentence, not a bare line); and the number chosen
is cited rather than picked. **The citation is the load-bearing part** — the corpus is the source:
across 91 stored OpenRocket simulations the median declared wind is 2 m/s with only 1 of 91 at zero,
while rod angle really is 0 in 85 of 91. So change the wind default and leave the rod plumb.

**Size.** 2 increments. (1) the default, its citation, and every surface that states what is being
flown; (2) the degenerate-plot case, which is the half that still matters on a genuinely calm day.

**Notes.** SAFETY posture applies directly: a defaulted wind is an assumption, not the flyer's
setup, and every surface that prints a drift or a landing figure has to say which it is. Send an
agent to enumerate those surfaces rather than trusting memory — a caveat on the plot and a confident
number in the CSV is the failure this repo has shipped before. **Do not** reach for a non-zero rod
angle to manufacture drift: the corpus says flyers really do set it to zero, and inventing a lean
would put a number on screen that no file asked for.

---

## R12 (from ON-6, ON-7, ON-5, ON-4) — The component tree the flyer sees, and edits

**Status: IN PROGRESS** — the first member's *done when* is MET as of increment 2, 2026-08-08.
Selecting a component is now how you edit it.

**Increment 20 — the panel answers on every part, and the rule lives in one place, 2026-08-17.**
Picking most of a design got NOTHING: no button, no sentence, no else branch, with an unrelated
paragraph about stages next on screen. Measured across the 35-design corpus: **of 569 parts, 419 take
no authoring gesture at all** — centring ring 83, mass object 56, fin set 52, parachute 50, inner tube
37, coupler 31, bulkhead 29, shock cord 24, launch lug 19, engine block 14, rail button 11. A flyer
picking any of them learned nothing: not that the gesture was unavailable, not why, not what to pick.

**`addOptionsFor(rocket, id)` is now the single home of a rule that was written in three layers.**
`canAnchorAfter` was the only shared piece; the panel spelled six more gates of its own and
`addPartAfter` spelled the whole rule a second time. They agreed for every rendered control **while
already disagreeing about a mass object** — panel and applier demand a body tube, `buildAdded` demands
only a length — and nothing pinned the agreement. That is exactly how increment 19's gap survived: the
guard was narrower than the code behind it, in two of three copies, on every design in the corpus. The
function returns a verdict for every kind, always, in a stable order, so a caller cannot render a
subset by forgetting one.

**The refusal names the part and what WOULD take the gesture**, deduplicated — six kinds collapse to
two sentences on any given part, and six restatements of one fact is a wall, not an answer. It uses
the part's OWN name, exactly as `removalRefusal` does, so there is no second vocabulary table to keep
in step with `KIND_LABEL`. `DESIGN.md` §5: a surface with no empty state is not finished, and an empty
state "says what would fill it *and* the one action that does. Never 'No data'."

**Pinned at both layers.** `lib/corpus/sweep.test.ts` drives all 569 parts of all 35 designs and
asserts every one answers on all six kinds, that no offered gesture carries a refusal, and that every
refusal carries a reason long enough to teach something. `e2e/smoke.spec.ts`'s *a part that takes no
authoring gesture says so, and says what would* picks a fin set, asserts the sentence and both halves
of its reasoning, asserts no add buttons, then picks a body tube and asserts the converse — so it pins
a distinction rather than a constant. Control: removing the empty state fails it with *"a part that
takes no gesture must say so rather than rendering an empty space"*.

**The gap this leaves, measured and deliberately not folded in:** of the 419 silent parts, **283 have
`length > 0`, so `buildAdded`'s mass arm would already build a mass object for them today** — nose
ballast in a nose cone is the obvious case, and the ROADMAP's own North Star text names it. That is a
capability being refused rather than a rule being enforced, and widening it is its own increment with
its own verification. Filed. `COMPETITION.md` row 50 carries the field comparison: OpenRocket greys
invalid components and explains only in its documentation; none of the four states the reason in the
product.

**Increment 19 — the gesture a build starts with, refused on the part a build starts from,
2026-08-14.** "Add a tube behind this" was gated on the picked part being a body tube — in the panel
and in the applier — so selecting the nose cone offered nothing. **Body tubes are 90 of the 569 parts
across the 35-design corpus**; the nose cone is the first part a from-scratch build has, and
"another one of these, here" was refused on it in every design.

**The guard was narrower than the code behind it, which is what makes this a one-line capability
rather than a feature.** `buildAdded`'s body-tube arm sizes the new part with `aftOuterRadius(after)`
and `transitionDefaults` reads the same accessor — and `aftOuterRadius` has always answered for a
nose cone and a transition at their aft radii. Neither consults the anchor's kind. So the model could
already author a tube behind a cone; only the two guards said otherwise.

**Two rules, not one, and collapsing them is what caused it.** A part authored BEHIND another needs
an aft face to fair to; a part authored INSIDE it, or mounted ON it, needs a tube. Both were spelled
as one body-tube test. `lib/model/geometry.ts`'s new `canAnchorAfter` is the first rule, named once
and used at both sites; the inside-and-on kinds keep the second, so a coupler, a centring ring, a
mass object and a fin set are still refused on a cone — correctly.

**Pinned by `e2e/smoke.spec.ts`'s *a tube can be added behind the nose cone, which is where a build
starts*** — picks the cone from the parts list, asserts the gesture is offered, asserts the three
inside-kinds are NOT, adds the tube and checks it is undoable. **The e2e is the only thing that can
pin this**, and the model test beside it says so in as many words: `applyGeometryEdits` builds the
same tube before and after the change, because the applier never consulted the kind. A model test
that passes either way is evidence about the model, not about the fix — it is kept for what it does
prove, which is that the capability was there. Control: narrowing the panel gate back to body tubes
fails the e2e with *"the nose cone must offer the gesture"*.

**Increment 18 — two suppressed accuracy assertions, armed, 2026-08-14.** `KNOWN_ISSUES` is the
corpus's documented-gap list: a design Loft still gets wrong is parsed but not asserted, so the gap is
recorded rather than baked in as correct, and the contract is *fix the bug, then drop the entry to arm
the assert*. Two entries had come good and nothing said so.

**Re-measured before touching either, against every excused case:**

| case | apogee | max velocity | verdict |
|---|---|---|---|
| `Punisher Apprentice.ork::Simulation 10` | −10.15% | −1.56% | stale — both inside the ±12% asserted |
| `03.Three-stage.ork::Simulation 1` | +10.76% | +4.95% | stale — both inside the ±12% asserted |
| `Complex.Two-Stage.CDX1::J90W` | +12.40% | +8.02% | genuinely excused, still outside |
| `TubeFins1.rkt::C6-5` | +5.20% | +25.29% | genuinely excused, still outside on speed |

**The nudge that exists to catch exactly this could not see either of them, and that is the real
find.** `sweep.test.ts`'s stale-entry detector required apogee within `TOLERANCE_PCT / 2` — 6% —
while the suite ASSERTS at `TOLERANCE_PCT` — 12%. An entry between the two passes the assertion it is
excused from, excuses nothing, and can never be reported. Both stale entries sat in that gap. The
halved bar had no reason of its own: the stated guard against arming a coincidence is the VELOCITY
clause, which is untouched. **A check that cannot fire over the range it polices** is the same shape
P14 and P16 are about, inside the corpus rather than inside the gate.

**Both assertions are armed now**, with 1.85 and 1.24 points of margin respectively — the second is
the thinnest armed case in the corpus and is named as such in the file, so the next run knows how
close it is rather than discovering it from a red gate.

**The physics behind the second entry is NOT fixed, and its prose was kept rather than deleted with
the entry.** Three of `03.Three-stage.ork`'s five fin sets are rounded and were billed as square
until R7's per-set cross-section; its leading-edge sweep is still collapsed to one design-wide 22.4°
against five real sets at 35.0–70.6°. The two errors were partly cancelling and only one is fixed,
which is why R7 made this design's apogee error worse — the one place in the corpus where it did. The
case passes and the model is still approximate, which is precisely the state a green assertion cannot
express, so it is a comment beside the list.

Corpus after: **45 tests, 0 failures, 35 design files**, all twelve census medians unchanged.

**Increment 17 — Sev-1: a part inside the rocket was setting the rocket's caliber, 2026-08-14.**
Preempted the milestone, as a Sev-1 must. Found by the opening fan-out's competitive probe, confirmed
by an adversarial verifier that set out to refute it, and reproduced independently here before a line
was changed.

**What was wrong.** A catalogued coupler or centring ring pick wrote the vendor's outer diameter onto
the component with no bound against the host's bore (`lib/model/edit.ts`, `buildAdded`). A ring is
invisible on the diagram — `lib/model/silhouette.ts` only walks the airframe — but `maxBodyRadius`
maxes `outerRadius()` over **every** component, internals included. So the picked part became
`referenceRadius`, and through it the diameter `staticMarginCal` is quoted in calibers OF and the
reference area every drag coefficient is computed from. The TYPED field has been clamped against
exactly this since the panel gained it, and the comment above that clamp names this consequence in as
many words; the pick path reached the model without passing it.

**Measured on the bundled starter, 54 mm airframe with a 51 mm bore.** 123 of the 236 catalogued
couplers and 243 of the 497 centring rings are wider than the entire rocket — the common case, not
an exotic one. Picking the widest (Public Missiles CT-11.4, 289.8 mm) took the reference diameter
**54 mm → 289.8 mm** and static margin **1.5279 → 0.1157 cal**. Isolating the cause by pinning the
reference to the airframe's own radius on the *same* tree — mass and CG byte-identical — the
reference diameter ALONE accounts for **0.6211 → 0.1157 cal**. Nothing on screen said the caliber had
moved.

**Why it is criterion (a) and not merely a bad default.** Static margin is the figure a flyer reads
before they go to the pad, the readout prints bare calibers with a low/high flag, and it never names
the diameter it is quoting. The number was wrong and unlabelled on the surface a flyer acts on.
`BACKLOG.md` had this filed since 2026-08-03 and had **explicitly declined Sev-1**, on the reasoning
that "the mass is honestly computed for the part the flyer chose". True, and it does not reach the
reference diameter, which is not a fact about the chosen part at all. That entry is corrected rather
than deleted.

**The fix follows the rule already shipped for LENGTH**, at the layer that already asks the question.
`fitAddedInternalParts` judges the flown tree once, after dimension edits — deliberately, because
`applyAdds` runs first and a birth-time guard is judged against the pristine host. It now asks about
width beside length, with the same established outcome: a catalogued pick that does not fit is left
out whole rather than resized, because a vendor's part number over a dimension that vendor never
published is a wrong number under a real label; a derived part is clamped. The picker refuses the row
with the reason on it, and the panel's "not in the flight" notice now names *which* dimension does not
fit — a flyer told the wrong reason goes and lengthens a tube that was never too short.

**It cannot touch an imported design.** The pass only ever looks at parts the flyer authored in this
session (`authored.get(ch.id)`), so no corpus design, sample or `.ork` import changes by a gram — the
census is untouched, which is what makes a Sev-1 fix safe to ship on its own.

**What it does NOT close, stated because the first draft of its own copy claimed otherwise.** The
caliber edit (`scaleAirframeRadii`) multiplies every internal part's radii along with the airframe's
and runs before this pass, so a PICKED ring is still silently rescaled — 33.0 mm flown at 65.9 mm
under a caption reading *Flying SEMROC CR-10-13P*. That is the part's LABEL being wrong, where this
increment is about the design's CALIBER being wrong, and it is filed rather than folded in: scaling
internals with the airframe is correct for derived parts, so exempting picks needs its own rule.
The panel's `pickTooWide` also judges the pick's UNSCALED published diameter while the model judges
the scaled one, which diverges on a narrowing caliber edit. Both are in `BACKLOG.md` with the
measurements; the notice's wording was changed from "left out rather than flown narrowed" to a claim
that survives them.

**Pinned by `lib/model/edit.test.ts`'s *refuses a picked part wider than its host, so the design's
caliber stays the airframe's*.** Asserted on the REFERENCE RADIUS rather than on the part, because
that is the quantity that was wrong; the airframe's own radius is read off the design rather than
written into the test, so it cannot pass by agreeing with a constant, and the over-wide pick is made
deliberately short so the length guard cannot be what refuses it. Negative control: judging width as
always-fitting fails it with the coupler built.

**And it found a test fixture that had been exercising the defect.** Five existing cases drove a
`SEMROC CR-9-175P` — 44.4 mm across — into a fixture whose only body tube is 38 mm outside with a 2 mm
wall, a 34 mm bore. All five went red the moment the model started refusing that part, which is how it
surfaced. They now use `CR-10-13P`: same manufacturer, same plywood stock, same length, and a part
that can physically exist inside that design.

**Increment 16 — the two probe solves the panel was paying for on every keystroke, 2026-08-13.**
Increment 15 filed this and said why it was not taken then: `localBodyCGx` recovered the station a
flyer had stated by INVERTING two whole-rocket mass solves, which was the right shape while a shoulder
blend meant there was a slope other than 1 to find. That blend went in increment 15.
`componentPointMass` now reads `overrideCg !== undefined ? p.xFore + overrideCg : componentCg`, so the
probes could only ever recover slope 1 and intercept `xFore`, and the conversion is a subtraction: the
parts table publishes an absolute station, this control holds one measured from the part's own fore
face, and the datum is the whole difference.

**Measured before the change rather than argued** — all 35 corpus designs, every part where either
form returns a figure: **372 parts, 0 disagreements, worst difference 4.4e-16 m** (one ULP), and no
part where one form returns a station and the other returns nothing. So no number moves on any
surface; the filed reason for keeping it — that the inversion supplied the `undefined` guard — was
wrong, and the guard is the `reported === undefined` line it always was.

**What a flyer gets is speed on the panel's hot path.** `localBodyCGx` sits inside the `designDims`
memo, so both controls are recomputed on every part pick and every keystroke in a geometry field.
Timed over the corpus, the pair per render: **median 0.585 → 0.182 ms, worst 96.9 → 29.6 ms**
(`03.Three-stage.ork`, 35 parts) — 3.2× and 3.3×. The old form was slow enough that the probe
harness timed out at vitest's 5 s default while the new one finished inside it. `BACKLOG.md`'s
neighbouring entry — `statedCGReachesDesign` at three solves per call, worst 60.9 ms — is the larger
remaining half of the same stutter and is untouched here, deliberately: it decides whether a control
is OFFERED, so deriving it analytically can change what the panel shows and wants its own increment.

**Pinned by two new assertions in `lib/sim/mass.test.ts`**, one per kind the panel offers the control
on: a shouldered transition hung 400 mm down the airframe, and a body tube behind a 120 mm cone —
which is the REACHABLE path, since `LoftApp.tsx` offers this control on a nose and a body tube and
never on a transition. No other case in that file calls `localBodyCGx` at all, so nothing else covers
the datum. Two independent negative controls, both re-run against the final diff: dropping the
`- part.xFore` fails both cases (0.08 against 0 on the transition, 0.32 against 0.2 on the tube), and
reintroducing the shoulder blend in `componentPointMass` fails the transition with 0.027 against 0
and takes two of increment 15's assertions with it.

**The pre-push review is why that pins anything, and what it caught is worth more than the increment.**
The first draft also asserted that the unstated reading lands inside the part — which the
`statedCGBounds` clamp guarantees whatever the datum is, so it could not fail. A pass-by-construction
assertion, inside a test whose own docblock claimed it could not pass by construction, one milestone
after P14 shipped about checks that cannot fail. It also caught the comment beside it stating a
failure mode the clamp structurally forbids, a pointer aimed at the wrong end of this file, and
**four dated claims written as 2026-08-14 while it was still the 13th** — none of which any of the
four gates can see.

**Increment 15 — what a stated CG and a stated WEIGHT actually mean on a part with a shoulder,
2026-08-13.** `HANDOFF.md` named this as the next R slice and framed it as one defect on the CG path
that would "re-fly every imported `<overridecg>` and move the published accuracy census". **It is two
defects, they are on opposite paths, and the census does not move.** All three corrections came from
reading OpenRocket's own source rather than from reasoning about the format.

**The rule, quoted rather than inferred** — `RocketComponent.getCG()`, release-24.12:

```java
if (cgOverridden)   return getOverrideCG().setWeight(getMass());   // getOverrideCG() = getComponentCG().setX(overrideCGX)
if (massOverridden) return getComponentCG().setWeight(getMass());
return getComponentCG();
```

…and `getComponentCG()` is shoulder-INCLUSIVE: `Transition.calculateProperties()` sums
`foreCapCG + foreShoulderCG + transCG + aftShoulderCG + aftCapCG` into a single centroid. So a
shoulder is *inside* a component's CG, never something blended in afterwards.

Both of Loft's branches were wrong, in opposite directions:

1. **A stated CG was treated as the SHELL's centroid, with the shoulder blended in aft of it.** The
   part acted up to **133 mm** behind the station the flyer stated, and the control was
   non-idempotent — typing back the figure the box already showed moved the design's CG.
2. **A stated MASS dropped the shoulder from the CG entirely**, placing the whole stated weight at
   the shell centroid. This is the one that reaches real files, and it is dry CG — what static margin
   is measured from. The old comment's reasoning ("a stated component mass already includes it") is
   true of the MASS and says nothing about the CG; skipping the block dropped the moment as well.

**Measured on the corpus, both sides of the change: 4 of 35 designs move, all AFT, and not one gram
of mass moves on any of them** — the signature of a CG-only correction.
`Punisher Apprentice.ork` +4.32 mm, `Simulation scripting.ork` +2.17 mm, `The Red Hunter.ork`
+1.95 mm, `rocksimTestRocket2.rkt` +1.43 mm. Aft means Loft had been reporting these four as *more*
stable than they are.

**The published accuracy census is byte-identical before and after** — all twelve medians unchanged.
`HANDOFF.md:27` and `BACKLOG.md` both said this change would move it; they were wrong, and the entries
are corrected. The reason is that 0 of the 12 `.ork` `<overridecg>` elements sit on a shouldered part
*without* an `<overridemass>` (which already suppressed the blend), and a 1–4 mm CG shift does not
reach apogee or velocity at the census's resolution.

**Pinned by three assertions in `lib/sim/mass.test.ts`, argued from first principles rather than by
recomputing the implementation** — the P14 lesson about checks that cannot fail. The strongest needs
no arithmetic at all: whatever station the flyer states, the part must report exactly that back.
Negative control: restoring the blend fails two of the three, reporting a stated CG of 0 as 29.5 mm
and putting a stated mass's balance point 11.5 mm too far forward.

**Living docs moved in the same change**, because the behaviour made three of their sentences untrue:
the methods page now says a stated balance point describes the whole part, shoulder included, and a
stated weight moves none of it; and the two nose-CG tooltips said "a shoulder is weighed separately —
so this is not a knife-edge reading of the whole part", which was the old semantics stated to the
flyer. A knife-edge reading of the whole part IS now the figure to type, and they say so.

**The pre-push review found that the first draft of this increment REINTRODUCED the exact
non-idempotency it set out to remove, and that is the most useful thing in it.** Redefining
`overrideCGx` as the whole part's centroid made `[0, length]` the wrong bound — a shouldered cone can
genuinely balance behind its own base, and a transition with a fore shoulder fore of its datum — but
all three clamps still held the body's length: `localBodyCGx` (read), `withStatedCG` (write) and the
field's own `max`. Measured: `rocket.ork` carries two **12.70 mm** transitions whose 152.4 mm
shoulders hold ~92% of their mass and which balance at **81.96 mm**; the panel was handed 12.70. So
the placeholder stopped being a fixed point, which is the one property that control exists to have.
`lib/model/geometry.ts`'s new `statedCGBounds` is the bound now — the part that physically exists,
shoulder and all — and all three sites share it.

**The corpus sweep's idempotency guard could not have caught it, and the reason generalises.** It
drives the two panel controls over real design files, and **0 of the 35** carry a cone of that shape.
The **catalogue** does — a cone pick is one click from the front door — so the new check runs all 854
catalogued cones through the pick, reads the placeholder and commits it. Negative control: restoring
the body-only bound reports *"the shown balance point is not a fixed point on 11 cone(s)"*. It also
asserts its own population is non-empty, because the failure mode of a bound is to clamp the
interesting cases out of existence and pass by testing nothing.

**Three claims written in the first draft were false and are corrected rather than quietly dropped:**
the mass-override CG test asserted `overridden.cg ≈ props(noseBase(SH)).cg` — the same expression on
both sides, so it held for any centroid formula whatever, under a docblock claiming first principles;
the methods page gained a correct sentence while keeping a contradicting one twenty lines later in the
same paragraph; and "a stated weight moves none of it" is false for the *override all subcomponents*
flag, which does move a section's balance point. All three are fixed, and the published BNC-55D2
measurement this change invalidates (CG 456.9 → **457.1** mm, margin 2.712 → **2.7095** cal) is
updated in `COMPETITION.md` row 2, this file's own table, and the test's docblock.

**Not taken, and filed** — *the first of these was taken the next day as increment 16, ABOVE, and the
reason recorded here for not taking it turned out to be wrong: the `undefined` guard is the
`reported === undefined` line and never came from the probes at all. Left standing rather than
rewritten, because what a run believed at the time is the record:* `localBodyCGx`'s
inversion collapses to the identity now that the slope is 1, and 30 lines plus two whole-rocket mass
solves per call become ceremony. It is kept because it
still returns `undefined` for a part that reports no CG of its own, which the placeholder must not
guess at; collapsing it means reproducing that guard, and that is its own increment. Also filed:
`lib/rkt/adapt.ts`'s `cgOverrideM` still rejects a `KnownCG` past the body's length, which is now
slightly too tight — left alone because both `.rkt` overrides in the corpus pass it comfortably, so
widening it would fire on zero real files while weakening the guard that rejects RockSim's
cached-not-measured values.

**Increment 13 — the flyer's own BALANCE POINT reaches the airframe, 2026-08-12.** `COMPETITION.md`
row 45's next slice, and the exact twin of the mass override increments 8–11 built: `overrideCGx` has
been parsed, honoured over the computed centroid and exported since the first importer, with no
control anywhere. Two now — `noseCGx` and `bodyTubeCGx` — written by `withStatedCG` with
`cgFrom: "flyer"` beside the number, applied LAST of everything so a station read off a knife edge
beats a catalogue pick and a caliber scale, the same precedence the stated weights already have.
Measured from the part's own fore end, which is what OpenRocket's override tab asks for, what
`overrideCGx` means, and what a flyer can reach with a rule.

**Three things are NOT the same as the weight's, and each one is why this was not a copy-paste.**

1. **It is BOUNDED, where every stated weight is not.** A mass has no host to fit inside, so the only
   thing wrong with one is a number that is not one. A balance point is a station on a part, and one
   off the end of that part cannot mean anything — `MAINTAINING.md`'s safety posture is explicit that
   such an input is refused or bounded rather than flown into a confident number. Clamped at the
   applier against the length being WRITTEN, not the one that was measured, because the bag is
   persisted and replayed and a pick can move the part's length underneath a station typed before it.
   Driven over the corpus: **63 of the 70 parts are short enough for the bound to fire**, and a
   metre typed into a 170 mm cone stores 170 mm.
2. **`>= 0`, and zero is the case the field most exists for.** A cone with lead in the tip balances at
   its own fore end, which is the commonest reason a real design states a CG at all. `> 0` would have
   silently discarded it.
3. **The refusal predicate is the SOLVER's answer, and reusing the mass model's would have been
   wrong on three of the four lumped designs.** For a weight the hazard is a double-count and the
   question is "does an ancestor already state this part's mass". For a CG there is nothing to add
   to, so the hazard is a silent no-op — and the two do not coincide. On a *stage-level* override
   (3 of 35) the lump's CG is recomputed from every subsumed part whenever the stage states no
   `overrideCGx`, so a per-part CG **is live and does move the design's balance point** while a
   per-part MASS on the same part is dead. `statedMassHolder` answers identically for that case and
   for a component-level override where the opposite holds, so it would have greyed out a working
   control. `statedCGReachesDesign` perturbs the part and asks the solver instead — two probes, at
   each end, because a single one lands on the current station whenever the part already balances
   there and a probe that changes nothing cannot tell a dead control from an unmoved one.

**Pinned by a corpus case over all 35 designs. Its first draft was a TAUTOLOGY, and saying so is the
most useful thing in this entry.** That draft recomputed `[0, len].some(probe moves the design CG)`
and compared it with `statedCGReachesDesign` — which is that expression, term for term. It agreed on
70 of 70 by construction, both failure branches were unreachable, and it was published here as
"0 disagreements": a compliance check that cannot fail, written one increment after the milestone
whose entire subject is compliance checks that cannot fail. It now asserts two things a different
function answers: every REFUSED control is a part that produces no point mass at all (the reason the
refusal actually gives), and every OFFERED control's placeholder is a FIXED POINT — committing the
figure the box shows must not move the flight. **35 nose cones and 35 body tubes offered, 62 controls
the flight answers to and 8 it does not, 63 bound to the part's own length, 57 fixed points, 5 live on
a part a stage lump subsumes.** The fixed-point half fires on 15 real cones when reverted. Two unit
cases pin the precedence (a station typed in the same edit as a catalogue pick survives it, where a
*stale* one is still cleared) and the bound at both ends; an e2e case drives the control in the app
and fails when the writer is neutered.

**What the pre-push review caught, because none of it was visible from the diff alone.**

- **`overrideCGx` sets the cone's SHELL centroid and a shoulder is blended in aft of it**, so the
  part acts up to 133 mm behind the station stated, and offering the part's REPORTED CG as the
  placeholder made the control non-idempotent: typing the number the box already showed moved the
  design's CG on 15 of 57 live controls. The placeholder is now `localBodyCGx` — the station
  `overrideCGx` actually replaces, recovered by inversion so there is one definition of the blend —
  and the hint says the shoulder is weighed separately, as the tube's hint already said about fins.
  *(Both halves of that sentence were overtaken later: increment 15 removed the blend and rewrote the
  hint, and increment 16 removed the inversion. Left as written, because this entry is the record of
  what the increment did on its date.)*
  **The remaining question is a semantic one and is filed rather than guessed at:** a flyer balancing
  a cone on a knife edge measures the whole part, shoulder included, and OpenRocket's override tab
  may mean that. Changing what `overrideCGx` means would re-fly every imported `<overridecg>` and
  move the accuracy census, so it is its own increment with its own corpus run.
- **`bodyTubeCGx` was not registered in `AIM_SLOTS`**, so a station measured on one tube survived that
  tube's deletion and landed on the fallback — 23 of 35 designs migrate it, `FullScaleModelTH.rkt` by
  235 mm of dry CG — and `designKey` left the key unchanged across a re-aim, so a sweep could present
  one tube's answer as another's. Registered.
- **`max` was passed in METRES to a millimetre field**, so a 170 mm cone advertised and *enforced* a
  ceiling of 0.17 mm and `NumberField.commit` silently pulled every real entry to the tip. Caught by
  self-review and by two lenses independently; the control was unusable on every design.
- **The refusal's stated reason was false on all 8 cases it fires on.** It said the part's mass was
  stated by an assembly that already fixes where it acts; measured, all 8 are RASAero shells for which
  `statedMassHolder` is null — they are dead because the format gives them no material, so there is
  no mass for a station to place. The same false reason had been copied to the docs page and to
  `COMPETITION.md`; all three now say what is true.
- **The `statedMassHolder` comparison in `lib/sim/mass.ts` was backwards in its first bullet.** Over
  the 70 controls the two predicates disagree on **13**, not 5 — the 5 stage-lumped parts where the CG
  is live and the mass is dead, *plus* 8 where `statedMassHolder` would have offered a control that
  does nothing. The conclusion (do not reuse it) holds; the arithmetic behind it did not.
- **The clamp dropped its upper bound when the target had no usable length**, storing a balance point
  a thousand kilometres down a zero-length part. It refuses the write now: "I cannot bound this" must
  not become "unbounded".

The methods page gains the paragraph, and `cgSourceLabel`'s docblock loses the sentence saying
nothing lets a flyer set one yet — it has carried the `"flyer"` branch since it was written.

**Increment 14 — the parts table says where each part balances, 2026-08-12.** The gap increment 13
left, closed in the increment after it. The table published a *Station* — the part's FORE FACE, where
it starts — and a *Mass*, and no balance point at all, so the surface whose stated job is *did Loft
read my rocket right?* could show where every part begins and what it weighs and **not where any of
it acts**, which is the number the static margin is built from. `MassBreakdown` had carried it since
it shipped, one disclosure away; `COMPETITION.md` row 46 named the split.

Two columns, mirroring the two beside them: **Balance** and **Balance from**, the second through the
shared `cgSourceLabel` so this and `MassBreakdown` cannot drift into two vocabularies for one
question. Both travel in the CSV, because a copied build sheet that says 984 g without saying who
said so is the same wrong claim one screen further away — the argument *Mass from* already makes.

**Absolute from the nose tip here, local to the part in the editor, and that difference is
deliberate.** The per-part control takes a station from the part's own fore end because that is what a
flyer measures with a rule; a table comparing parts down one airframe needs a single origin for all of
them, and mixing the two in one row is how a build sheet lies. It matches `Station` beside it and
`MassBreakdown`'s own column.

A part carrying no mass of its own gets an em dash rather than its geometric middle — that would be a
number nothing acts at, and the Mass cell beside it already says where the weight went. `cg` is
genuinely optional on the record (a part subsumed by a stage lump is reported with no `cg` at all), so
the narrowing is a binding rather than a `Number.isFinite` the compiler cannot see through.

**The pre-push review found the increment repeating the exact mistake the increment before it warned
about, and the check that should have caught it asserting nothing.** `Balance from` passed
`ownsMass` — the MASS predicate — to `cgSourceLabel`'s `hasOwnCg`, and those two questions diverge
precisely where `COMPETITION.md` row 46 says they do: on `EscapeVelocity.ork` the nose cone's weight
is subsumed by a stage-level override while its stated `<overridecg>` is live, and stripping that one
field moves the design's dry CG by 6.5 mm. The column whose only job is saying whose figure a station
is printed "—" over a station Loft is flying and a design stated. There is a `hasOwnCg` beside
`ownsMass` now, reading the record's own `cg`.

And the e2e case's first draft asserted **nothing new**: `toContainText(/\d/)` against the whole row
is satisfied by Station, and the provenance regex by the *Mass from* cell, both of which predate this
change — so both new columns could have been deleted and it stayed green. **That is the third
selector this run that looked right and tested nothing**, after a `columnheader` name that never
matched an uppercased header and an apogee readout insensitive to the thing under test. It indexes
the two cells by column now, and an em dash where the number belongs fails it.

Two smaller ones taken: the CSV exported `Balance from nose (mm)` beside `Balance from`, two adjacent
headers reading as one name truncated twice, so the provenance column exports as `Balance source`;
and `PartSort` was laundering `"cg"` in through an `as` cast, leaving the component's own pre-sort
switch with no branch for a column it offers.

Pinned by an e2e case that reads the header ROW and the two new CELLS by column index on `/design`;
renaming either column, or dashing a real figure, fails it by name. **The headers are uppercased by CSS and a sortable one carries its direction
glyph, so `getByRole("columnheader", { name: "Balance", exact: true })` matches nothing while the
column is plainly on screen** — worth recording, because that is the second selector this run that
looked right and asserted nothing.

**Increment 8 — the flyer's own scale reading reaches the airframe, and stops lying where it cannot,
2026-08-10.** `COMPETITION.md` row 41 named (d) — a universal mass override — as the cheapest and
most useful thing left in that row, and the nose cone and the body tube were the two kinds it had
never reached. Measured over the 35-design corpus by kind, counting every mass the design or its own
tool supplied rather than Loft: **13 body tubes and 10 nose cones**. `noseMass` and `bodyTubeMass`
are the two new keys — the tube's a target of `bodyTubeId`, so on the **23 of 35** designs carrying
more than one tube the weight lands on the tube the length field beside it is holding; the cone's
unaimed, because there is no nose slot and `noseLength`, `noseShape` and the catalogue pick all
resolve through `primaryNose` already. Both are written last in the applier, so a scale reading beats
a catalogue pick and a caliber scale made in the same patch — the precedence `parachuteMass` already
has over a resize.

**A correction to a number this file published: the nose cone's count was recorded as 26 and it is
10.** Re-measured 2026-08-10 by two independent counts over the same 35 files — `massFrom` tallied by
kind, and every `overrideMass` on a cone listed by file — which agreed. The body tube's 13 reproduced
exactly, so the method was right and the one figure was not. The comment in `components/LoftApp.tsx`
that carried it is corrected in place rather than deleted, because the wrong number had already been
used once to rank what to build next.

**And the increment's own corpus check found a defect on four SHIPPED surfaces, which is most of what
this increment is worth.** OpenRocket lets an assembly state one weight for itself and everything
inside it, and **4 of the 35 corpus designs do** — a stage-level override on three, a component-level
one on the fourth. A part inside such an assembly contributes nothing of its own, so a mass typed on
it changes no flight. `massByComponent` reports those parts at **0 kg, counted in ⟨assembly⟩**, and
`GeometryInspector`'s parts table has always printed exactly that. The property panel did not:
**42 aimable parts across those 4 designs** — 10 body tubes, 7 centring rings, 5 canopies, 4 couplers,
4 bulkheads, 3 nose cones, 2 inner tubes, 2 mass objects, 2 shock cords, 2 launch lugs, 1 rail button
— sat behind a live-looking box, and on three of the kinds that box advertised a placeholder of **0**
for a part that weighs something. 29 of the 42 are on controls that shipped in earlier increments, so
this was live. Fixed on all six mass fields at once from one derived `massCarriedBy`, using
`NumberField`'s own `disabled`, whose docblock already said it was for exactly this: *a control that
demonstrably does nothing must not sit there looking as though it does*. The field names the carrier
in words rather than greying out silently.

**Increment 11 — the balance point says whose figure it is, 2026-08-11.** The exact twin of increment
7, on the other number the mass model produces per part. Loft honours a stated CG in preference to its
own geometry — that is what makes a nose cone with lead in the tip fly the margin it actually has —
and `MassBreakdown` printed the result on its *CG from nose* column with no way to tell the design's
claim from Loft's arithmetic. **Measured over the corpus: 15 stated CGs across 8 of the 35 designs** —
5 nose cones, 4 parachutes, 2 mass objects and one each of transition, tube coupler, body tube and fin set — and
stripping them moves the static margin on **6 of the 7**, by up to a full caliber
(`rocksimTestRocket1.rkt` 4.243 → 5.254 cal, `Cherokee-E-5055.ork` 1.421 → 1.897). `DESIGN.md` §6 asks
a reference value to name its source, and a breakdown is nothing but reference values.

`cgFrom` is the field, beside `massFrom` and reusing `MassProvenance` because it is the same question;
`cgSourceLabel` joins `massSourceLabel` in `lib/mass-provenance.ts` rather than a second describer
being written, for the reason that module already gives. **Only the `"stated"` branch arises today and
the other two are deliberately absent** rather than written speculatively: no importer marks a CG as
the source tool's, and nothing lets a flyer set one yet.

**One honest negative: the round-trip guard does NOT fire, and that is measured rather than assumed.**
`lib/ork/adapt.ts` refuses provenance from a file Loft wrote, which for MASS prevented 51 parts going
unmarked → stated. Removing the same clause for CG leaves the round-trip case green, because
`overrideXml` emits `<overridecg>` only where `overrideCGx` is already set and Loft never invents one.
The clause is kept for symmetry and the comment says plainly that it is not load-bearing today — it
becomes so the moment a flyer can SET a CG, which is the next slice from `COMPETITION.md` row 45.

Pinned by `lib/corpus/sweep.test.ts`'s *says which of every real design's balance points the design
itself stated* (asserted in both directions over all 35 files: a stated CG is marked, and no mark
exists without an override behind it), by the round-trip case now checking both marks, and by an
`e2e/smoke.spec.ts` case on a new committed fixture — `cg-stated.ork`, since the e2e job does not
fetch the corpus and no bundled sample stated a CG. That case asserts the two marks are INDEPENDENT:
the same design states the altimeter's mass and not its CG, so one column reads *stated by the design*
and the other *Loft's own*, which a single provenance field reused for both numbers would fail.
Negative controls: removing the mark reports four real designs by name; removing it and rebuilding
fails the e2e case with *Received: "Nose cone0.084 kgLoft's own16%63 mmLoft's own"*.

**And the increment's own review found a stale mark on 5 real designs, which is the most useful thing
it produced.** All three catalogue-pick sites clear `overrideCGx` — a 65.4 mm balance measured on a
396.9 mm cone must not be pinned onto the 233.7 mm one that replaced it — and the first version of
`cgFrom` cleared the number at every one and the MARK at none. So picking a catalogued cone on
`03.Three-stage.ork`, `Cherokee-E-5055.ork`, `EscapeVelocity.ork`, `rocksimTestRocket1.rkt` or
`TubeFins1.rkt` left the breakdown reading *"stated by the design"* beside a figure the design no
longer supplies. **The same shape as the four wrong mass marks the review caught on the increment that
added `massFrom`** — a label put on a number nobody re-checked — and the corpus case written for this
increment could not see it, because that case only ever looks at an IMPORT. A second case asserts the
invariant over the EDIT path (*never leaves a stated-CG mark on a design whose CG an edit has
replaced*, 5 designs exercised); its negative control reports all five by name.

**Three more the review found after that, and one of them was a wrong number this file published.**
- **The RASAero adapter was the third importer and was left out.** It marks its synthesised airframe
  mass `"stated"` and never marked the CG, so `Show-off.CDX1` read *453.6 g · stated by the design ·
  25.4 mm · Loft's own* — crediting the design with the weight and Loft with the balance point, from
  two adjacent elements of the same file, where 25.4 mm IS `<SustainerCG>` converted. The mark rides
  the same branch as the mass one, because it is the same arithmetic: `airframeMass` returns the
  stated station untouched exactly when no motor could be weighed.
- **Which made the new invariant too narrow, and widening it is the honest fix rather than an
  exemption.** "Marked implies an override behind it" is an `.ork`/`.rkt`-shaped sentence; a RASAero
  lump is a zero-length mass component whose PLACEMENT is the balance point, with no computed CG for
  an override to replace. The invariant now reads "an override **or** `standsForAirframe`", which is
  the exact and only such carrier.
- **The census was wrong in both halves and is re-measured: 15 stated CGs across 8 of the 35
  designs** — 5 nose cones, 4 parachutes, 2 mass objects, and one each of transition, tube coupler,
  body tube and fin set. As first written it said 14 across 7 and then listed 13, omitting
  `EscapeVelocity.ork`'s trapezoidal fin set — the one marked kind whose CG is a chordwise centroid
  rather than a body-of-revolution one, so a reader auditing the kinds was pointed away from it. The
  fifteenth is the RASAero lump above. Corrected in all four places that carried it.
- **And the new e2e's column control could not fail.** It joined the header cells and asked for
  "cg from", which the pre-existing *CG from nose* heading already satisfies — deleting the whole new
  column left it green. Array containment per trimmed cell now, which is the repo's own pattern.

**A flaky e2e, recorded so the next session does not diagnose it as a regression.**
`e2e/rocketpy-selfhosted.spec.ts:254` failed once in a full shard-1 run and passed in isolation, on
the clean baseline with this run's changes stashed, and on a re-run of the same shard (132 + 132 =
264). It is unrelated to anything this increment touches.

**Increment 10 — the same Sev-1 again, on the four fields the last fix did not reach, 2026-08-11.**
`#168` stopped a stated part weight being ADDED to a design that states one weight for its whole
airframe — and it stopped it on the nose and the body tube, which were the two fields that increment
happened to be about. **The canopy went on double-counting, and it was live in the shipped app.**
Measured on the bundled `demo-rasaero.CDX1`, one click from the front door: the *Canopy mass* control
rendered **enabled**, and 500 g typed into it took dry mass **0.4536 → 0.9536 kg** on `Show-off.CDX1`
and its stability margin **12.81 → 9.28 cal**; on `Complex.Two-Stage.CDX1` a fitting weight took
**1.1777 → 2.1777 kg** (the typed unit mass times its count) and the margin **1.78 → 1.29 cal**. Ten
double-counts across three designs and four fields, on designs nobody had edited.

**The repair is not a fifth copy of the guard — it is the deletion of the per-field guard.** The two
`!lumpedAirframe` clauses are gone; `stripPerPartMassOnLumpedAirframe` takes every per-part mass key
out of the bag once, at the top of `applyDimensionEdits`, before any aim resolves. It reads
`PER_PART_MASS_FIELDS`, and `lib/model/edit.test.ts` derives the expected contents of that list from
`AIM_SLOTS`' own targets — so a seventh mass field that forgets to join it fails the build with
*"`X` writes a per-part weight but PER_PART_MASS_FIELDS omits it"* rather than double-counting in
silence. The panel half is one `lumpedAirframeHint` rather than six sentences, for the reason
`carrierLabel` is one function.

**This is the third time this exact defect has been filed, and the shape of the miss is the lesson.**
Each fix covered the fields its own increment was looking at, and each shipped a check written in the
same increment — which can only encode that increment's belief. The corpus case listed the nose and
the tube by hand and passed for a day while two other fields were wrong; it is driven off the registry
now. Pinned by `lib/corpus/sweep.test.ts` (all six fields x 35 designs), two cases in
`lib/model/edit.test.ts` on the bundled RASAero sample, and `e2e/smoke.spec.ts`'s lumped-airframe case
extended from two fields to three. Negative controls: dropping two keys from the registry reports
them by name; disabling the strip reports all **10** real double-counts by design and field; reverting
the canopy's panel guard fails the e2e case with *"Expected: disabled, Received: enabled"*.

**And that last control only fires after a rebuild** — `playwright.config.ts` serves the built `out/`,
so a source revert with no rebuild silently re-runs the previous bundle and the control "passes". It
did, once, here. Recorded in `MAINTAINING.md`.

**The pre-push review then found that the first version of this fix broke authoring, and it is the
most useful thing this increment produced.** Keyed on the DESIGN, the refusal stripped every per-part
weight from any design carrying a lump — including a weight typed on a part the flyer had just
**added**, which a figure the file stated before that part existed cannot possibly contain. Reproduced
on the bundled sample: add a mass object to a body tube, and it arrives at the 0.045 kg default whose
whole purpose is that *"the next keystroke replaces the starting weight"*; that keystroke did nothing
and dry mass stayed at **8.3099 kg**, with the control greyed out. RASAero is the format where this
hurts most, because it states no per-part masses at all — a flyer's own scale is the only possible
source of one there.

**The gate was fully green through all of it.** Every check written for this guard asked whether an
IMPORTED part could be double-counted; not one asked whether an authored part could still be weighed.
So the refusal is keyed on the PART now: `applyGeometryEdits` captures every id the FILE brought
before a single authored part joins the tree, and a target absent from that set is the flyer's own.
Deriving it from the two trees rather than from the bag's entries is what makes it right for
`mountAdds` and `addedStages` too, which build their components at apply time and carry no id to
enumerate. `massCarriedBy` makes the same distinction the same way — six keys rather than one flag —
because a panel that offers a control the applier ignores is the defect this whole family is about.
Pinned by a new case in each of `lib/model/edit.test.ts` and `e2e/smoke.spec.ts`; the negative control
(restoring the design-wide test) reports *"a weight typed on a part the flyer authored did not reach
the flight: expected +0 to be close to 0.255"*.

**Increment 9 — what the review found in increment 8, and a Sev-1 beside it, 2026-08-11.** The
pre-push agent read on increment 8's diff returned five findings and all five were real; three were
on surfaces already pushed. Every one is the same shape — *the control described a quantity that was
not the one it held*.

- **The control never rendered on 4 of the 35 designs, and they are the ones that need it most.**
  `massByComponent` has an entry only for a part producing a structural point mass: a SUBSUMED part
  gets `{mass: 0}`, a part Loft computes no mass for gets no entry at all. Every RASAero `.CDX1`
  states one lumped launch weight and no per-part masses, so its nose and tube had none, the readback
  was `undefined` and the field never appeared — on exactly the designs where a flyer's scale is the
  only possible source. Gated on the PART existing now.
- **A typed weight could be stranded in a box that could no longer be edited** — a pick re-aims a
  live value, so typing a weight and then clicking a part whose mass an assembly states left the
  number in a `disabled` field, still an active what-if, with only Undo as a way out. That is the
  one-way door the `disabled` prop was added without. It applies only while the field is empty now.
- **A tube stating its OWN assembly weight was labelled the opposite of what it is.** The docblock
  written in increment 8 said the case "does not arise on any real design" — measured over the
  corpus and asserted of everything. `fixtures/demo-quirks.ork`'s "Upper" is the counterexample, one
  click from the front door, 600 g covering the tube plus a coupler and a streamer, under a hint
  reading *"the tube on its own"*. This is the measure-don't-remember trap taken while quoting a
  measurement, and it is worth reading twice.
- **The case pinning "the flag is never set" pinned nothing** — it passed with `bodyTubeMass`
  unimplemented. It measures the shift the edit causes now, and its negative control fails by exactly
  the 0.25 kg stated.
- **`carrierLabel` is one function** because two had drifted on how to name an unnamed carrier, and
  the parts table read one while the property panel read the other.

**And the Sev-1 the tenth-use walk found, which preempted the rest of the run: a copied table carried
the units the numbers were STORED in.** `GeometryInspector`'s parts table rendered
`lengthMm(xFore, units)` and `mass(m, units)` on screen while exporting `xFore * 1000` — always
millimetres — and `m.mass` — always kilograms — under bare `Station` and `Mass` headers. In Imperial
the screen read *12.8 in / 0.06 lb* and the copied row said *323.8 / 0.026086*: a build sheet 25.4x
and 2.2x off, with no unit anywhere in the file. Flight phases did the same with raw SI altitude and
speed. **`BACKLOG.md` had held this since 2026-08-05** — diagnosed, with `DataTable`'s `csvLabel`
named as the mechanism and both call sites named by file — and nothing converted them for six days.
It took somebody looking at the product to move it. Fixed by deriving every export from the same
`Quantity` its cell renders (`csvQuantity`/`csvHeader`), so the pair cannot drift again rather than
being converted once.

Pinned by `lib/corpus/sweep.test.ts`'s *puts the flyer's own weight on every real design's nose cone
and body tube* — asserted as a relationship over all 35 files rather than as golden counts, with the
aim taken on the LAST tube so a multi-tube design tests the aim rather than the fallback, and with a
second half asserting that the mass model's `subsumedBy` and `statedMassHolder` agree on every
aimable part, because those are the two answers the parts table and the property panel read. Plus
seven cases in `lib/model/edit.test.ts` and two in `e2e/smoke.spec.ts`, the second of which is the
control. Negative controls: dropping the aim to `primaryBodyTube(rocket)` reports *"a stated tube mass
migrated onto another tube"* on the real corpus; removing the six `disabled` props fails the e2e case.

**Increment 7 — the parts table says which masses the design STATED, 2026-08-10.** `COMPETITION.md`
row 43, opened this run and closed by it. Both OpenRocket and RockSim tell a user when a mass was
entered rather than derived — OpenRocket by storing the fact as its own element beside its own
Override tab, RockSim by keeping `<CalcMass>` and `<KnownMass>` side by side on **67 of 67 parts in
all four corpus files**, with spreads that are not cosmetic (a tube coupler stating 984.0 g against a
computed 70.6 g). Loft flew 91 stated masses and marked none of them, on the surface whose stated job
is *did Loft read my rocket right?* — and `DESIGN.md` §6 asks a reference value to name its source.

**The distinction could not be read off `overrideMass`, which is why this is a model field rather than
a formatting change.** `lib/ork/adapt.ts` sets that field only from a genuine `<overridemass>`;
`lib/rkt/adapt.ts` synthesises one on every structural part from whichever figure RockSim selected —
and every corpus `.rkt` has `<UseKnownMass>` at 0, so all four fly RockSim's own COMPUTED number. A
marker hung off `overrideMass` would have called those measurements. `massFrom` carries the three
cases instead, in the shape `CdProvenance` already takes for a drag coefficient: **108 stated by the
design, 60 carried from the source tool, 401 computed here**, across the 35-design corpus.

**Four wrong marks the pre-push review found, all fixed and all the same shape — a label put on a
number nobody checked.** RockSim's parachutes, streamers and lugs take their mass verbatim from the
file but sit outside the structural set, so they were claiming to be Loft's own; a `.rkt` mass object
was hardcoded `"stated"` and so presented RockSim's own non-round `CalcMass` as a scale reading; and
the RASAero airframe mass is the stated LAUNCH weight minus a motor mass from Loft's bundled data —
4,368.8 g where the file says 37.8 lb — which is not a figure the design states at all. Only the
branch that places the stated weight unchanged is marked now. The review reproduced each by importing
all 35 designs through the real adapters. Two more it found in the EDIT path, which the first version
wired nothing through: a catalogued canopy's published weight kept the design's old claim over the
vendor's figure, and a typed fitting mass kept the importer's — the latter because `withFitting`'s
parameter list omitted the field while its caller computed it, so it was dropped in silence. `"flyer"`
is the third value, for the same reason `CdProvenance` has one, and the unmarked label reads
*Loft's own* rather than *computed here* because Loft authoring a mass object is not a calculation.

**And Loft's own export was laundering its arithmetic into the design's claim.** The exporter writes a
mass Loft COMPUTED as an explicit figure — that is what keeps a canopy's mass across an export at all
— so a re-import read every one as the design's own: **51 parts across the 27 `.ork` designs went
unmarked → stated, and 15 parts of `FullScaleModelTH.rkt` went from the source tool's figure to
stated**, which `lib/ork/export.test.ts` names in its own words as forbidden. It needed no download to
reach a flyer: a design authored here is persisted as its own exported bytes. `lib/ork/adapt.ts` takes
no mass provenance from a file whose `creator` is exactly Loft's own string — a deliberate loss on
such files, in preference to a confident wrong claim — and a corpus case asserts that nothing gains or
changes a mark across a round trip, proved able to fail by restoring the old behaviour.

Pinned by `lib/corpus/sweep.test.ts`'s *says which of every real design's masses the design itself
stated* — asserted as a relationship rather than as golden counts, with all three populations
required non-empty — and by two `e2e/smoke.spec.ts` cases, the second of which is the control: a
design that computes all its own structural masses must print only the half of the key it needs.

**Three things the gate caught that reading would not have.** The mark landed at `text-[11px]`, which
§3 scopes to axis ticks, and `lib/design-system.test.ts`'s ratchet refused it. At `text-zinc-500` on
the indigo tint a picked row wears it measured **4.32:1** against WCAG AA's 4.5, which
`e2e/contrast.spec.ts` refused. And the mark's meaning started life in a `title`, which
`e2e/touch.spec.ts` counted as two new hover-only states — correctly, because a phone cannot reach a
tooltip. The key is in the caption and the words are in their own column.

**Increment 5 — the notes a design file carries stop being destroyed, 2026-08-09.** `COMPETITION.md`
row 42 named the per-part comment as the more urgent of the two next members, and the measurement
holds: **81 non-empty notes across 22 of the 35 corpus designs** — 40 `<comment>` on 18 of the 27
`.ork` files (16 on the rocket, 1 on a stage, 23 on components), 40 `<PartDesc>` on all 4 `.rkt`
files, and one design-level `<Comments>` — and Loft read none of them and wrote none of them, so
import → download deleted every one. `comment` is now on the component base, the stage and the
rocket; both importers read it and the exporter writes it. **This is the FILE half only, deliberately:
the edit half needs a keyed bag entry that the flat patch cannot express**, which is the same
structural obstacle the mass override hits and is recorded in `BACKLOG.md`. Pinned by
`lib/corpus/sweep.test.ts`'s *carries every note a real design wrote* (an exact multiset, in and back
out) plus cases in both adapters' suites.

Two defects the pre-push review found over a green gate, both fixed in the same commit and both
pinned: the exporter minted a freeform fin set's id **twice**, so 7 sets across 6 of the 27 `.ork`
designs went out under a fabricated hash — the only 7 of 332 stated ids that did not survive a round
trip, on a persistence path that stores a design as its own exported bytes; and `buildStage`'s
`structuredClone` carried the original author's prose onto parts Loft invented, which the exporter
then wrote into the flyer's file.

**Increment 6 — a rail button weighs something, 2026-08-09. Sev-1, and it preempted the milestone.**
OpenRocket stores a launch lug as a tube and a rail button as six different elements, none of them
`<length>` or `<thickness>` — so the tube-wall volume resolved to zero on **all 9 rail buttons across
7 of the 27 `.ork` designs**, and the 4 that state no mass of their own imported weightless. The
flight barely moves (533.45 g → 535.10 g dry on `Parallel booster staging.ork`); the screen moves a
lot, because a part with no mass gets no row in `massByComponent` — so the parts table printed a dash
where every other part carries a figure, and the same undefined value hid the fittings fieldset and
opened that part's Properties popover empty. Massed now as the spool its own six dimensions describe.
Pinned by `lib/corpus/sweep.test.ts`'s *weighs every external fitting on every real design* over all
54 fittings, and by four adapter cases.

**Increment 3 — the internal structure gets a property surface, 2026-08-09.** The largest unreachable
population in the model is reachable. Measured over the 35-design corpus before this increment:
**249 of 569 parts (43.8%) had no field describing them at all, and 194 of those 249 are five kinds
that are one shape in `types.ts`** — 83 centring rings on 25 designs, 37 inner tubes on 25, 31
couplers on 17, 29 bulkheads on 11, 14 engine blocks on 13. They selected, highlighted, and offered
no Properties control: the "feature reachable only by knowing it is there" tell in its purest form,
except that there was nothing there to know. One `AIM_SLOTS` entry with three targets —
`internalLength`, `internalOuterDiameter`, `internalInnerDiameter` — takes the unreachable population
from 249 parts to **55** (9.7%), and every one of the 55 left is a `MinorComponent` or a `Streamer`,
which is the next increment.

Pinned by `e2e/smoke.spec.ts`'s *the internal structure has properties too, and a plate is not a
tube*, which drives the whole gesture on the bundled 38 mm single-deploy sample — it carries a
motor-mount tube and two centring rings, so both halves are checkable on one design. Negative
control: emptying the slot's `kinds` reports *"a centring ring offered no way to edit it"*. And by
`lib/corpus/sweep.test.ts`'s *sizes every real design's internal structure, and never builds one out
of nothing* (194 parts across all 35 files, every one aimable, every one bounded by its host, every
one driven under the most hostile entry the panel's own bounds allow) and nine cases in
`lib/model/edit.test.ts` with three negative controls.

**One slot for five kinds, because they are one shape.** `RingComponent` and `InnerTube` carry the
identical three geometry fields and both model as annular cylinders with no aerodynamic contribution.
Five slots would have been five copies of one registry entry.

**A plate has a THICKNESS and a tube has a LENGTH**, and that is not taste: OpenRocket's own dialogs
split the same way — `CenteringRingConfig` and `BulkheadConfig` build a `Thickness` row,
`ThicknessRingComponentConfig` (tube coupler, engine block) and `InnerTubeConfig` build a `Length`
one. Read from that source rather than remembered. A single label would be wrong for one of the two
on every design carrying both, and the bundled sample carries both.

**Every bound is physical and the panel advertises exactly what the applier enforces**, from one
exported function, because a bound quoted from one place and applied from another is a promise the
validator never made — a defect this repo has shipped once already, when the boattail field
advertised the picked tube's caliber while the validator used the aft-most tube's. Nothing fits in a
tube wider than its host's bore; nothing is longer than the part holding it; and a bore is capped a
hair below the outer diameter *being flown*, because a bore at it is a part made of nothing and a
confident CG computed from a component that cannot exist.

**Two defects the pre-push review found over a green gate, and both are one mistake in two places:
a bound measured on the PRISTINE tree and applied AFTER `scaleAirframeRadii`, which moves the very
radii it was measured against.** Typing a coupler's bore just under its own 48 mm and then halving the
airframe left the bore wider than the 24 mm part it is cut in — a negative wall, which the mass model
drops to nothing at a fixed station; typing its outer diameter and halving the airframe left the
coupler wider than the tube around it, and `outerRadius()` reads the widest part, so the reference
area the whole flight is computed against would have come from a component inside the airframe. The
host bound now carries the caliber factor, on both the applier and the panel that advertises it, and
the bore is re-clamped at the point it is WRITTEN — which makes "a part is never inside out" true by
construction rather than by an argument about the order of five transforms.

**Two more the review found, and one of them was a hole in this increment's OWN corpus check.**
`internalPartBounds` read a host's bore through `aftOuterRadius`, which answers only for body parts —
so an internal part whose host is ITSELF internal (a bulkhead in a coupler, an engine block in a
motor-mount tube: **36 parts on 14 of the 27 OpenRocket corpus designs**, ten of them on
`Two stage high power rocket.ork` alone) got no bound at all, and the sweep's asserts were written
`if (bound !== undefined && …)`, so those 36 were driven at nine metres of outer diameter and then not
looked at. The bound reads the host's own `innerRadius` for those kinds now, and **a missing bound is
a finding rather than a skip** — the negative control names 43 rows. The second: `describeDims`
showed neither the bore nor the plate/tube distinction, so the parts row, the parts CSV and the print
page called a centring ring `L 3 mm` while the panel one click away called the same number
`Thickness`.

**And the increment's own corpus sweep found a Sev-1 in the importer** — five real parts on three
designs whose `auto` bore had resolved to a zero wall, so they weighed nothing. Fixed first and
separately (`373024e`, PR #147), because a parser change gets its own commit.

**Increment 4 — the external fittings, 2026-08-09. ONE part in the whole corpus now has no field.**
A shock cord, a launch lug and a rail button are one `MinorComponent` in `types.ts`, so one more slot
with four targets — mass, length, outer diameter and how many — covers **54 parts across the 35
designs** (24 shock cords on 21, 19 launch lugs on 14, 11 rail buttons on 9). With increment 3's 194
that is 248 of the 249 parts that no field described; the remaining one is a single streamer, and it
stays out deliberately (it shares the recovery job with a parachute rather than the shape of a
fitting, and designing a vocabulary entry around its sole possible adopter is what `DESIGN.md` §5
already declined to do once).

**Two of the three reach the flight through DRAG, which is what makes this more than completeness.**
`lib/sim/aero.ts` sums `count x pi x radius^2` over every launch lug and rail button into the
protuberance area, so a flyer who models a pair of buttons as one is flying a drag figure they cannot
correct. The panel says so, on those two kinds and not on the shock cord — a caveat printed on
everything is a caveat nobody reads. Pinned by `lib/corpus/sweep.test.ts`'s *sizes every real design's
external fittings, and the count reaches the drag* (54 parts, 30 of them protuberances, the count
asserted through the frontal area the solver reads rather than through the field), by five cases in
`lib/model/edit.test.ts` — one of which flies the starter with a rail button on it and moves the two
drag inputs SEPARATELY, because a first version varied both and passed with the count wired to
nothing — and by `e2e/smoke.spec.ts`'s *a launch lug is a part too, and its count is drag rather than
decoration*, whose negative control reports *"a launch lug offered no way to edit it"*.

**What is still NOT done, stated rather than implied.** One streamer across the corpus has no field.
A motor mount's own overhang and cluster count have no control, and there is no mass override or
per-part comment anywhere — which `COMPETITION.md` row 41 names as the cheapest next thing, because
Loft honours `overrideMass` on import and offers no way to set one. The parts list is still collapsed
by default. There is still no verb band beside the tree, and `add` is still behind one body-tube
guard at `components/GeometryInspector.tsx:747` which wraps all six add verbs.

**Increment 2 — the property surface, aimed by the pick.** Picking a part on the diagram or in the
tree offers a **Properties** control on that part, which opens a popover holding exactly the fields
that describe *that component* — nothing else. Pinned by `e2e/smoke.spec.ts`'s *selecting a nested
part opens ITS properties, and an edit there flies that part and not a sibling*, which drives the
whole gesture on the dual-deploy sample: it picks a canopy nested under a body tube, asserts the
surface holds that canopy's own fields, that **seven** whole-design controls are absent along with the
wall's own pitch and its "pick another part" advice, and that focus landed on the first field rather
than on Close; then edits the diameter inside the popover, leaves by `Escape`, confirms focus
returned to the trigger, confirms the flight moved — and then reopens **the other canopy** and
asserts its own as-designed diameter has not moved. Negative control: dropping the aim so the surface
renders every field reports `Fin span` present on a parachute.

**Six more the pre-push review caught over a green gate, and five were leaks of exactly the kind the
surface exists to prevent.** The mask works by blanking fields that belong to another *aim* — so a
field belonging to NO aim is invisible to it, and three whole-design controls (`Payload`,
`Payload pos`, `Surface finish`) rendered inside a mass object's properties beside its two. The wall's
own ninety-word pitch, which names four controls a property surface deliberately does not carry,
rendered inside every one of them. So did the *"to work on another, pick it on the diagram"* advice,
to a flyer who had just picked one. The nose catalogue picker lost its fit filter, because it reads
the airframe caliber for context and the mask had blanked it. The trigger sat in a `<p>` while the
panel it opens is a `Card` full of fieldsets — invalid nesting the browser repairs by closing the
paragraph early, which moves the panel out of the wrapper the outside-press handler measures against.
And the panel focused its **Close** button on open rather than the first field, because `Card` renders
its actions row before its children — while the primitive's own docblock claimed the opposite. All
six are fixed and the e2e case now asserts seven whole-design controls absent, the pitch absent, the
advice absent, and focus on the first input.

**Three more this increment got wrong first, all caught by driving it rather than by reading it.**
The primitive bound `Escape` to the surface, so the way out stopped working the moment focus left it
— a `blur()`, a control that removes itself, a stray click — which is the one-way door the component
exists not to be; it is a document-level listener now. And the check's own sibling assertion compared
the second canopy against the FIRST one's diameter and failed at 460 against 1220, which is not a
defect but a dual-deploy design having a main and a drogue of different sizes. Both baselines are
read before anything is edited now.

And the third is about how a failure READS: renaming those canopy labels broke the check's own
locator, and Playwright reports a locator that stops matching inside an open popover as a **test
timeout**, not as "element not found". It looked exactly like contention on a four-core box, so the
first fix was to raise the timeout — which made the same wrong diagnosis take twice as long. The
lesson is in the test: read the call-log line, not the timeout.

**And two the review found on the SURFACE rather than in the code, both of which a flyer would have
met.** On the drogue's own property panel the field holding its 460 mm diameter was labelled *"Main
chute Ø"* — a wrong label on a number a flyer sizes a recovery area with, correct on the wall (where
one set of fields stands for the whole design) and wrong the moment the panel is headed with the
part's name. The aimed labels drop the *"Main"*; *"Drogue Ø"* is removed from a per-part surface
outright, because on a single-canopy design it AUTHORS a second canopy rather than describing the one
in hand. And **picking a part dropped its own kind cell below WCAG AA**: the picked row paints
`bg-indigo-50`, and `text-zinc-500` on that is **4.32:1** against 4.5, where the same cell reads
4.83:1 at rest and passes. Every contrast case in the suite walked a surface in its RESTING state, so
nothing could see it — on the gesture this milestone makes central. `zinc-600` reads 6.90:1 picked and
7.72:1 at rest, and `e2e/contrast.spec.ts` gained a case that picks a row first, in both themes;
its negative control reports the 4.32:1 by name.

**And one more, which is the run's most useful finding and cost nothing because it was caught in
time: the sibling repo already HAD this primitive.** Debrief shipped a `Popover` from its own owner
note the same week, with a fuller contract — and Loft was one commit from inventing a second one,
which is the *"assembled by many hands"* failure the whole design system exists to prevent. `DESIGN.md`
§5's entry is now that repo's, adopted verbatim rather than rewritten, and Loft's implementation was
rebuilt against it: `Card`'s own title/actions row, the body scrolling while the heading stays pinned,
focus returned on an outside click only where it would otherwise be lost, `aria-haspopup="dialog"`,
the visible words as the accessible name, viewport anchoring below `sm` (measured: 16 → 374 px on a
390 px phone, no body overflow), and a typography reset for the panel — that last one because
`text-transform` and `letter-spacing` inherit, and the sibling had already measured 764 words of
accidental capitals with every text assertion in its suite passing. **Loft reached the document-level
`Escape` independently, the same week, from the same symptom.** What still differs is API rather than
contract, filed in `BACKLOG.md` against the shared-file reconciliation.

**How it is built, because the shape is the point.** There is no second copy of the fields.
`DesignEditor` gained an `only` mode that blanks every value belonging to another component and
renders bare; the controls were already gated on `designDims.<field> !== undefined`, so most of the
filtering fell out for free, and the handful that are whole-DESIGN rather than one part's — the motor
swap, the surface finish and airframe material, the nose ballast, the recovery scale, the boattail,
the payload — are gated on `only` explicitly. Which fields belong to which part is read from
`AIM_SLOTS`, the registry that already answers it, plus the nose, which has no slot because a design
has exactly one. **The 24-field flat patch is untouched and the wall of fields is still there**, which
is `ON-4`'s sequencing: nothing shipped is removed until its replacement has proved itself.

**What is NOT done, stated rather than implied.** Roughly two in five components still have no field
that describes them — a coupler, a centring ring, an inner tube, a bulkhead, a launch lug — so they
select and offer no Properties control at all, which is correct but is not "every component". The
parts list is still collapsed by default. And there is no verb band beside the tree
(`COMPETITION.md` row 40): add is still behind one body-tube guard.

**Increment 1** shipped earlier the same day: **the design's tree is visible.**
Pinned by `lib/corpus/sweep.test.ts`'s *carries every real design's tree structure through the
flatten, not just its order* (569 parts across all 35 design files, 419 nested, three deep, every
parent verified to exist, precede its child, sit exactly one level shallower and share its stage)
and by `e2e/smoke.spec.ts`'s *the parts list shows the design's tree, not a flat list of parts* —
which asserts the relationship through the WORDS and then checks the named host is a real row of the
same table, so it cannot pass against a hard-coded label. Negative control: removing the host line
reports `Expected /in Payload \/ main bay/, Received "└ Main parachute…"`.

**What was actually wrong was one line in the walk.** `flattenRocket` has always been depth-first and
has always discarded the depth, so every surface built on it could only render a list — three
quarters of a real design's structure was invisible for that reason alone, not through any UI
decision. `Positioned` now carries `depth`, `parentId` and `stageIndex`, and the parts list renders
the nesting: an indent in design order, and the host named in words in every order, which is the half
that reaches a screen reader and the CSV.

**Two things deliberately NOT done in this increment, each with its reason.**
- **The list is still collapsed by default.** The audit is right that a closed `<details>` is a poor
  home for the surface a flyer builds in — but opening it moves everything below it down by roughly
  a screen on `/design`, a route that already records a 1,841 px journey against a two-screen
  contract, and it touches 36 e2e call sites that open it by clicking. That is its own increment with
  its own depth measurement, not a flag flip.
- **Selection still does not flow from the tree.** Clicking a row already picks the part and lights
  it on the diagram; what is missing is the property surface being AIMED by that pick, which is the
  next increment and the one the *done when* below actually turns on.

Treat this as a milestone FAMILY: the *done when* below is the first member, and the rest are
decomposed as it lands rather than guessed at now.

**Outcome.** A flyer builds and edits a rocket through a component tree they can see — parts nested
under their hosts, the way the design actually is — with a property dialog per component, instead of
a flat wall of number fields addressing "the" nose and "the" body tube.

**The model is already there, and that is the single most important measurement for scoping this.**
`lib/model/types.ts` gives every component `children: RocketComponent[]` and a `Placement` relative
to its parent, and the file's own header says it is "shaped like OpenRocket's component tree … so a
design editor can be layered on top later without reshaping the model." So ON-6's nesting — a
payload or a mass or a chute *under* a coupler or tube — is a **UI** milestone, not a model rewrite.
What is missing is a surface that shows the tree and a selection concept to drive it.

**Done when** (first member) a flyer can see every component of the loaded design as a nested tree,
select one from either the tree or the drawing, and have that selection drive a single property
surface that edits *that* component by id — with the 24-field flat patch still working underneath and
untouched. Pinned by an e2e case that selects a nested part (a mass object under a body tube) from
the tree, edits one of its dimensions, and asserts the flight re-runs on the edited part and not on a
sibling.

**Size.** 5–6 increments across the family, of which the first member is 2–3.

**Notes.** `ON-4` withdrew **drag** as the authoring gesture and did not withdraw **directness** —
select-and-edit is the interaction. The sequencing the owner chose is in that note and holds: stop
extending drag now; do not remove what has shipped until the tree and dialogs can do the same job.
`DESIGN.md` §8's "Drag has an arrow-key equivalent and an undo" is a constraint on any drag that
exists, not a requirement that drag exist. **`ON-5`'s popover needs a `DESIGN.md` §5 primitive that
does not exist today, and the sibling repo's own `ON-3` asks for the same pattern from the other
direction — so it is designed once, in that file, in both repos, and never invented twice.** And the
trap `ON-4` names is real: `ROADMAP.md` uses "drag" in the AERODYNAMIC sense throughout — wave drag,
forebody pressure drag — so a find-and-replace over the word corrupts the methods documentation.

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

**Status: SHIPPED 2026-08-03** — all seven increments, pinned by `e2e/touch.spec.ts`: the
under-44 px scan (now with the widened `label:has(input.sr-only)` selector and the parameter sweep
opened), the hover-count ratchet, and *the three pad journeys work one-handed, and survive losing
signal*. **This status line was stale and is corrected rather than re-decided**: increment 7 shipped
as `1a336f8` on 2026-08-03 and the commit did not update it, so the file said 6 of 7 while the code,
the specs and `HANDOFF.md` all said 7. Confirmed by `git show --stat 1a336f8` and by the two blind
spots being closed in the spec today. The roadmap is the baton; a status line that lags the work is
how a run redoes what the last one shipped.

Two of the *done when*'s three pad journeys were already sound; the third, *pick a motor*, dead-ended
in a table that could not apply its own recommendation, and does not any more. The diagram's own touch
targets closed across increments 5 and 6 — every part it draws now has a column. §8's two counts read
0, and as of increment 7 that zero is measured by a scan with no known blind spot.

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

*Increment 2 — SHIPPED. 67 → 25, and the whole shared-chrome category is gone.*

Five files, and the leverage is that every site in the shared chrome renders on all six routes the
ratchet walks — so five edits paid for forty-two states. Both invisible-until-hover external-link
arrows (`components/Footer.tsx`, `components/FusionSpaceBadge.tsx`) are now always drawn: at
`opacity-0` they were the one mark saying those links leave the site, and no touch gesture brings
them up, so on a phone that mark did not exist. They already occupied their box, so showing them
costs no layout and spends nothing against the chrome ratchet. The duplicated brand `title`, the
theme toggle's (its `aria-label` is a strict superset), and a `title` on a decorative `aria-hidden`
bar are deleted — that last one reached neither touch nor assistive tech, only a mouse.

**The Ko-fi link is the one where deletion alone was the wrong fix**, and it is the general lesson:
"Ko-fi" appeared nowhere else on the surface, so removing the tooltip would have removed the only
statement of where the link goes. The destination moved INTO the visible label instead, which costs
nothing on an existing 44 px control. A `title` is only safely deleted when its information is
genuinely somewhere else.

**A trap worth recording, because it would have looked like a fix.** The check matches the class
STRING, not the computed style, so adding `pointer-coarse:opacity-100` beside the
`group-hover:` variant would leave the count exactly where it was — and leave the defect in place
too. The literal has to be deleted.

*Increment 3 — SHIPPED. 25 → 0, without writing a pixel.*

All 25 sat on the app chrome above the workspace spine, where writing anything visibly spends the
phone chrome ratchet and the two-screen depth cap at once — the trade increment 1 records making and
reverting. So nothing was written: each moved onto the **accessible name**. A `title` reaches a mouse
only; an `aria-label` reaches assistive tech on every form factor and costs no layout. Where the
tooltip restated a visible label it was deleted (the stability hint already carried an `aria-label`
superset); where it carried something real — what a `.ork` download omits, an undo's keyboard
shortcut, which motor a designation matched — it was relocated rather than lost.

**Both of §8's counts are now zero — and the check says what that does and does not establish.** `GeometryInspector`'s gesture bar —
remove, reorder, add a tube / fin set / mass object / transition / motor mount, eleven controls —
renders only once a part is SELECTED, and the walk never selects one — so TEN of the eleven
contributed 0 to every reading this ratchet has ever taken while being exactly the kind of state it
exists to find. (The eleventh, "Add a booster stage", renders unselected and was the whole reason the
floor stood at 1.) **All eleven are fixed**, in the same increment, and a regression on the ten still
would not fail the check. That is recorded in the spec rather than smoothed over: the zero is honest about the app and
narrow about the check.

**Getting them right took two attempts, and the failed one is the lesson.** A regex sweep replaced
each `title` with an `aria-label` carrying the description alone — and `aria-label` REPLACES the
accessible name where `title` only supplements it, so "Add a tube behind this" became "Add a body
tube immediately behind this one, faired to it, and re-fly the design". That no longer contains the
visible label, which is WCAG 2.5.3 and the words a voice-control user says out loud; **fourteen e2e
specs caught it** by finding those buttons by the words on screen. The shipped form is label-first:
the control's own visible text, then an em dash, then what the tooltip said — with the three dynamic
labels interpolating the same name the visible text does. Two ways of reaching the surface from the
walk also failed and are recorded in the spec: `getByRole("row")` matches nothing for that table, and
a direct row click times out because it is 1,198 px wide inside a 390 px viewport in its own
scrolling container.

*Increment 4 — SHIPPED. The blind spot is reached, and the journey that could not be finished now is.*

**Both halves of the increment, and they came out very differently.**

**(a) The selection-gated surface — a PIN, not a repair, and saying which matters.** `e2e/touch.spec.ts`
now opens the parts disclosure, selects the BODY TUBE row specifically (four of the gesture controls
render only for a body tube, so picking row 1 — the nose cone — would have measured a strictly smaller
bar), asserts two of the gated buttons rendered, and runs BOTH of §8's counts over it. **It found
nothing: 0 hover-only states and 0 controls under 44 px.** That is the honest result rather than a
disappointing one — increment 3 had already fixed those eight controls; what was missing was any check
able to see them, so a regression would have read 0 either way. The number did not move because the
work was done, and until this run nothing could have told that apart from a surface full of defects.

**The recorded reason nobody had reached it was STALE, and that is the finding.** `ROADMAP.md` and
`BACKLOG.md` both said the parts table is "1,198 px wide inside a 390 px viewport" and that
"`getByRole("row")` matches nothing" and "a direct row click times out". Measured on the built export
at 390x664: the table is **418 px inside a 324 px scroller**, `getByRole("row")` returns **9**, and
rows click clean on both bundled samples. The `DataTable` conversion fixed all three and nothing
re-measured, so a false measurement held the gate shut for several runs. Both records are corrected.
The roadmap's "eleven controls" is also an overstatement: **eight** are strictly selection-gated, two
more need a mount or a stage to exist first, and *Add a booster stage* renders ungated.

**(b) The three pad journeys — and one of them could not be completed at all.** Walked at 390 px:
*check stability* is healthy (the margin is in the shared chrome, on every route, inside the first
screen); *sanity-check a delay* works; **and *pick a motor* dead-ended.** `components/MotorSweep.tsx`
contained exactly one `<Button>` in the whole file — *Run*. The panel ranks every fitting bundled
motor on apogee, max velocity, rail exit, thrust-to-weight, margin, flutter and delay, and then could
not apply the one it recommends. A flyer had to memorise the designation, leave for the Design
workspace, and scroll **1,841 px — 2.77 screens at this viewport** — to re-find it in a sixteen-option
`<select>`. That is `MAINTAINING.md`'s rank-4 tell ("a task that works but costs steps a mature tool
doesn't charge") sitting on a named *done when* clause; RockSim and OpenRocket both apply a motor from
the list you chose it in.

**A *Use* column now does it in one tap**, routed through `applyEdit` like every other what-if — so it
lands in the same edit bag, is undoable by the same control, persists across a reload, re-flies every
panel, and is read back by the *Swap motor* select rather than being a second mechanism beside it. The
design's own row says "flying now" instead of offering a button that would change nothing. The record
carries `diameter` looked up from `swapOptions`, so the two paths build an identical edit rather than
an equivalent-by-argument one. The accessible name is label-first and names the motor, because fifteen
bare "Use"s are fifteen anonymous stops.

**Offline is asserted, and what the assertion establishes is stated narrowly.** The suite cuts the
network and RELOADS the route in view — the pad case, where the app is already open when the signal
goes. It is deliberately not a cross-route walk: `serve` answers `/flight` with a redirect to
`/flight/` because the RSC segment directory sits beside the document, while `gen-sw-precache.mjs`
precaches the un-slashed form, so an offline spine tap churns between the two **under `serve`** in a
way Cloudflare Pages does not. `e2e/docs.spec.ts` already walks every docs route offline, which covers
the cross-route case on paths with no such directory. Filed rather than papered over.

**The pre-push review found EIGHT defects in this increment after the whole gate was green, and one
of them undid the increment's own claim.** Worth reading, because six were in code the author was
confident about:

- **The *Use* control was the table's TENTH column, ~683 px into a horizontal scroller, so on a
  390 px viewport every one of them sat off screen at rest.** The control added to remove a
  scrolling trip required a ~350 px scroll of a nested scroller to reach. **And the new e2e could not
  see it**: Playwright's `toBeVisible()` does not test viewport intersection and `click()`
  auto-scrolls, so "the three pad journeys work one-handed" passed on a control a thumb could not
  find. The column moved to SECOND, beside the motor's own name, and the spec now asserts the
  button's right edge is inside the viewport.
- **The cell was gated on `isDesign` — a fact about the FILE's motor, which a swap does not move.**
  After one tap "flying now" sat on a motor that was not flying, the applied row still offered a
  dead button, and the design's own motor became the one row with **no way back to it** except Undo
  (which stops being one step back as soon as any other edit follows) or the select two routes away.
  Now gated on what is actually flying, comparing manufacturer AND designation — which also settles
  an ambiguity `isDesign` carries, where an Estes C6 and a Quest C6 could both read as the design's
  and neither would have offered a control.
- **Every tap re-ran the entire sweep.** `MotorSweep` was keyed on `dkey`, which carries `motorSwap`
  — so applying a motor re-flew fifteen ballistic flights on a phone to produce byte-identical rows,
  dimming the table the flyer was reading. No sweep row can depend on the swap (`lib/sim/sweep.ts`
  overrides the motor per candidate), so the panel now takes a key without it.
- **`SORT_CHOICES` is derived from the column list**, so the new column silently added `use:asc` and
  `use:desc` to the set of persisted sorts the panel would ACCEPT — and `use` has no `sortValue`
  behind a non-null assertion, so a stored value of that shape would throw during render and take
  the workspace down. Built from sortable columns only.
- **Re-tapping the motor already in force committed an undo step that undoes nothing visible**
  (`movedWhatIf` compares by reference, and a fresh object counts as a change). The `<select>` could
  never reach this — it fires no change event when the same option is re-chosen — but a button is
  one tap. Guarded.
- **The e2e asked for a 120 s tolerance inside a 60 s per-test budget** with no `test.setTimeout`, so
  its headline assertion could only ever fail as an opaque timeout mid-step — the exact failure mode
  `playwright.config.ts`'s own comment says it was written to prevent.
- Two more recorded rather than fixed here: the `ballisticGap` notice compares the DESIGN row against
  the FLOWN apogee, so after a swap it attributes a motor difference to the ballistic-vs-recovery
  method; both are in `BACKLOG.md`.

*Increment 5 — SHIPPED. The diagram gets a touch target the silhouette could never be.*

**The problem is that the hit shape WAS the rocket, drawn to scale.** At a phone's fit width the
airframe is about eleven pixels tall, so the two body parts that carried an overlay measured
**78x12 and 218x12 px** against §8's 44 — and no amount of care on the shape fixes that, because the
shape is the thing being drawn. Worse, each of the three centreline drag grips carries its own 44x44
transparent hit circle sitting ON the airframe (`hitR = coarse ? 22 : 0`), so the grips were stealing
the part underneath: measured, **9 of 19 points sampled across the body tube resolved to a handle**,
and tapping the middle of the body tube left the NOSE selected.

**Each body part now gets a full-height tap COLUMN on a coarse pointer**, spanning the diagram's
vertical extent over that part's x-range. Measured on the built export at 390 px with the bundled
sample: **78x84 and 218x84 px**, with **80% and 73%** of each column reaching the part when sampled
on a 9x9 grid with `elementFromPoint`. Not a drawn pixel changed.

**HEIGHT is what this fixes, and the width limit is stated rather than glossed.** A column is as wide
as its part is LONG on screen, so measured across all 39 corpus files **56 of 150 body parts are
under 44 px wide** at this fit width — the narrowest 0.8 px, a transition on `silsim/rocket.ork`. A
part that short cannot get its own 44 px column without stealing area from its neighbours, and since
the later-drawn column wins an overlap the theft would be arbitrary. The diagram's zoom control is
the real answer there and is already a 44 px target. The check asserts height on every column and
prints the widths rather than asserting them, because a width assertion would pass only on a
generous sample.

**The grips still win where they overlap, and that is deliberate rather than a compromise.** SVG
hit-tests the topmost painted element, so drawing the columns BEFORE the handles leaves a grip as the
winner on its own 44 px circle — which is right: a grip is a smaller, more specific target the flyer
aimed at. What changed is that everywhere else in a part's area now selects the part, where before
there was nothing at all outside an eleven-pixel silhouette. The remaining 20–27% IS the grips, and
the check prints the figure rather than asserting a bare pass.

Fine pointers are untouched: a mouse has the precision for the silhouette, and full-height columns
there would swallow the hover previews the diagram is built around.

Pinned by `e2e/touch.spec.ts` — every column clears 44 px in BOTH dimensions, each column's reach is
above 40%, and two different columns select two different parts. That last one is the assertion that
matters: a column selecting the same part whichever you tapped would be worse than no target, and is
exactly what the handles used to produce.

**The pre-push review caught a Sev-1 here, and the premise behind it was the real error.** The first
version painted the columns AFTER the fin sets — and a fin's planform sits inside its host tube's
x-range and inside the column's full height, so on a phone **tapping a fin selected "Body tube"**.
That is a strict LOSS of a working target on the surface this increment exists to improve.

It was hidden by a wrong count that this file itself recorded: "2 of 8 parts are reachable on the
picture". **Four were.** `o.fins` carries `hoverProps(fin.id)` and `o.masses` carries
`hoverProps(m.id)`, so fin sets and mass objects were already tappable — the measurement had looked
only at `o.parts` and generalised. The columns are now painted FIRST, before the fins, the masses,
the silhouette and every handle, which makes them a FALLBACK: they catch the area nothing more
specific claims, and take nothing from anything. Pinned by an assertion that a fin set is still
selectable from the diagram after the change.

Three more from the same review. The rect hand-rolled its click instead of spreading `hoverProps`,
which killed a live path rather than a theoretical one: a coarse pointer still fires compatibility
mouse events, `hoveredId` is what they set, and `activeId = hoveredId ?? selectedId` drives both the
diagram tint and the "what you just pointed at" readout — so with only a click the readout rode on
`selectedId` alone, and `pick` TOGGLES, meaning a second tap anywhere in the now much larger column
cleared the selection and blanked the readout. The render guard read `onHover || onSelect` while the
rect wired neither hover handler, so a caller passing hover alone would get invisible rects that
swallow taps and do nothing. And the CG/CP marks — guide lines, dots and the "CG"/"CP" text — are
painted after the columns with no `pointer-events-none`, so they punched dead holes through the new
target, where a tap did nothing at all because the mark is not a descendant of the rect; they are
part of the unexplained 20–27% the check prints, which the first draft attributed wholly to the grips.

**And the guard that pins the Sev-1 was itself broken in the way the defect predicts.** It clicked the
fin group's top-left corner — which is the empty notch ahead of a 45° leading edge, and is exactly
where the fin-station handle's transparent 44 px circle sits, so it failed as "intercepts pointer
events" rather than as the thing under test. It now clicks the lower planform's aft-outer corner.
Negative control run: with the columns painted back after the fins it fails with its own message,
*tapping a fin selected nothing — the columns buried it*.

**What this does NOT fix, corrected:** the four kinds with no diagram target of any sort remain the
parachute, the inner tube and the two centring rings — `rocketOutline` produces no silhouette for
them, so there is nothing to attach one to. 4 of the sample's 8 parts are reachable on the picture;
the other four are table-only. Filed in `BACKLOG.md`.

*Increment 6 — SHIPPED. The two kinds the columns could not reach, and an honest limit on one of them.*

Increment 5 gave every BODY part a full-height tap column. It could not reach the other two kinds,
and the reason is structural: the columns are built from `o.parts`, which is the silhouette list —
nose cones, tubes and transitions. A fin set and a mass object are drawn from their own geometry, so
each was left with the shape it is DRAWN as.

**Measured across all 35 corpus designs at phone fit width:** of 64 fin sets the planform is a median
**32.1 x 16.0 px** — 45 under 44 wide, **63 of 64 under 44 tall**. A mass object does not vary at all:
it is an `r=3.5` dot, so **7 px**, on all 56 of them. That is the smallest thing on the diagram by a
factor of six and the only way to pick one out on the picture.

Both now get the same column: full height, at least 44 px wide, transparent, not a drawn pixel
changed.

**A mass object's column is clipped to the midpoint between it and its neighbours**, and that is the
part that needed measuring rather than deciding. A fin set has a real extent to widen; a mass is a
station, and stations cluster — **12 of the 30 neighbouring pairs in the corpus sit closer than 44 px
apart, one of them at 0.0**. Two unclipped columns would overlap, and in an overlap the later-painted
one wins, so which mass a tap selected would have depended on nothing but list order. Clipped, a tap
resolves to the NEAREST mass and each gets every pixel the geometry allows.

**Two orderings were tried, and the pre-push review caught the wrong one.** Painting the columns
AFTER the per-part silhouettes buys the fin a bigger share of its own column — 52% against 49%, and
the mass 100% against 90% — and costs two things that matter more: a body part narrower than 44 px
lying inside a fin's or mass's column is covered whole and has no tap point at all (56 of the 150
body parts across the corpus are under 44 px wide), and a mass column at a fin's station buries the
fin's drawn planform. Increment 5 had already written the rule down from the other side — a column
catches what nothing more specific claims — and it is worth more than the percentage.

**What it does NOT close, stated rather than implied.** Sampling every column on a 9x9 grid and
attributing each point: a mass object's column reaches it on **73 of 81**, the rest going to the body
silhouette it sits inside. A fin set's reaches it on **40 of 81**, and the largest single claimant of
the rest is the fin's own *Fin position* grip — a 44x44 circle on the centreline at exactly that
station. So the PRIMARY fin set (the only one that gets a grip) is selectable in the bands above and
below its own grip plus its drawn planform; every other fin set keeps more. That is a real gain on 32x16 and it is not yet 44x44. Closing it means the grip and the fin
wanting different places to live — a taller diagram on a coarse pointer — which spends the depth
contract `e2e/depth.spec.ts` holds, so it is filed rather than bundled in here.

**And the check had to be able to ask the right question first.** It sampled each column and counted
a point as reaching the part only when it landed on that exact rect — so a point landing on the DRAWN
fin, which selects the very same part, counted as a miss. The fin column measured 32% under that rule
and 100% under the one that matters. Every hit-bearing element now carries `data-part` through the one
`hoverProps` helper, and the metric resolves by part. A metric that punishes a more specific target for
existing would have argued for deleting it.

Pinned by `e2e/touch.spec.ts`: every part the diagram DRAWS has a column (asserted as a set
comparison, not a count — a count passes when the column exists for the wrong part), every column
clears 44 px tall, every column's reach is above 40%, a tap on the mass object's column selects it by
name, and the per-column attribution is PRINTED so the next session reads numbers rather than a pass.
Negative control: with the two kinds' columns removed it fails naming both uncovered parts.

*Increment 7 — SHIPPED as `1a336f8`, and the fan-out found it rather than the roadmap.* **`DESIGN.md` §8's "zero
controls under 44 px" is asserted by a scan with two measured blind spots, so the count is 0 because
of what it cannot see.** (1) The scan visits `/sweep` and runs the MOTOR sweep, but never opens the
PARAMETER sweep — its two hand-rolled `<select>`s (`ParameterSweep.tsx:360` and `:377`) render only
after *Run parameter sweep* and measure **137x34 and 152x34**. (2) The scan's selector is
`button, input, select, summary, nav a`, and the flight-log control is a `<label>` wrapping an
`sr-only` file input — so the 1x1 input is dropped by the `width < 4` filter and the label is not
matched at all. It measures **148x30**. The scan's own comment exempts it on the grounds that it sits
"behind a visible 44 px trigger"; that trigger is 30 px, so a documented exemption rests on a wrong
measurement. Fix the three controls, then close both holes in the scan so they cannot reopen.

**All of that shipped.** `e2e/touch.spec.ts` now carries `label:has(input.sr-only)` in the scanned
selector and opens the parameter sweep before counting, and the scan itself names the three controls
it used to miss — `label"Overlay a flight log" 148x30`, `select"Sweep variable" 137x34`,
`select"Sweep metric" 152x34` — each fix reverted alone to prove the widened scan sees it. That
closed the milestone: §8's two counts are 0, and the zero is now measured by a scan whose blind spots
were found, closed, and pinned against reopening.

*Superseded note — the problem increment 3 was expected to be:* The remaining 25 all sit on
the app chrome ABOVE the workspace spine — `Undo`/`Redo`'s disabled reason, the design-name field,
`Download .ork`, the motor-match badge, the stability `<abbr>` — so each renders on four routes
rather than six, and writing any of them visibly spends the phone chrome ratchet (1060 px, measured
1011, so 49 px of headroom) and the two-screen depth cap simultaneously. That is the exact trade
increment 1 recorded making once and reverting. **The next increment needs somewhere to put the
words, not a shorter string** — a disclosure, a details row under the fold, or the reasoning moving
to where `StabilityTrimHint` already writes it in full.

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

**Status: SHIPPED 2026-08-03** — all six increments, every *done when* clause met and pinned.
Decomposed the same day with every clause measured first, so no increment was spent discovering that
its work was already done.

**Pinned by:** `lib/version.test.ts` and `scripts/gen-version.mjs`'s build-time refusal (the version
shown is the release described); `lib/inline-markdown.test.tsx`; `e2e/first-run.spec.ts`'s *says the
three things it does that no other tool does*; `e2e/docs.spec.ts`'s three cases for the version, the
changelog page and the report link; and `scripts/check-links.mjs` in `postbuild`, which is the
*done when*'s own "link-checking" clause. Every one was proved able to fail by reverting one thing.

**Where each *done when* clause stands, measured 2026-08-03 rather than assumed:**

| clause | today | what it needs |
|---|---|---|
| README shows the tool with images | **NOT** — two `shields.io` badges, zero screenshots, no image asset anywhere in the repo | increment 4 |
| landing states the three differentiators | **PARTLY** — `components/ImportPanel.tsx` says the formats and "never uploaded"; never free / no-install / offline, never the multi-answer cross-check | increment 2 |
| a visible changelog and a versioned release the flyer can see | **NOT, on all three counts** — no `CHANGELOG.md`, `git tag` is empty, version is `0.1.0` and no component renders it | increments 1 and 3 |
| a limitations page a sceptic can read | **DONE** — `app/docs/limitations/page.tsx`, dated, linked from four places | nothing |
| a way to report a bug or request a format from inside the app | **PARTLY** — `components/Footer.tsx` links the repo ROOT on every route; issue links exist only on docs pages | increment 5 |
| *pinned by* link-checking and a build-time assertion that the shown version matches the release | **does not exist** — `scripts/check-routes.mjs` asserts routes, sitemap and noindex, nothing about links or versions | increments 1 and 6 |

**The decomposition, and the ordering rule behind it.** The version work comes first because it is the
half of the milestone's own pinning check that everything else is then measured against, and because
a changelog is the one artifact that gets harder to write the longer the history gets. The reachability
work (2, 5) comes before the presentation work (4), because a screenshot of a landing surface that
still does not say what the tool is would have to be retaken.

1. **A version a flyer can see, and a changelog that is one source.** `CHANGELOG.md` as the only
   place a release is described; a prebuild generator turning it into the module the UI reads, which
   FAILS THE BUILD when it disagrees with `package.json`; the version in the footer on every route.
2. **The landing surface says the three things.** `COMPETITION.md`'s standing conclusion, in the
   flyer's words, where a stranger sees it first.
3. **The changelog as a route** — `/docs/changelog`, rendered from the same generated module, so the
   file and the page cannot drift.
4. **The README shows the tool.** Screenshots taken from the built export by a committed script, so
   they can be regenerated rather than going stale by hand.
5. **Report a bug or request a format from inside the app**, from every route rather than from the
   docs only.
6. **Link-checking as a build-time gate**, which is the other half of the *done when*'s pinning.

**A decision taken without the owner: "the release" means `CHANGELOG.md`'s newest released version,
not a git tag.** `git tag` is empty and cutting the project's first tag is a publishing act that is
the owner's to make, not a side effect of a maintenance run. A static export cannot ask GitHub what
the latest release is at request time either, so the assertion a build can actually make is that the
version the UI renders, the version `package.json` declares, and the newest entry in `CHANGELOG.md`
are the same string. That is the check that ships. If the owner starts tagging, the same script gains
one more comparison and nothing else changes.

*Increment 1 — SHIPPED. One version string, three files that must agree, and a build that fails when
they do not.*

`CHANGELOG.md` is the single source. `scripts/gen-version.mjs` parses its newest released heading,
refuses to emit anything when that disagrees with `package.json`, and writes `lib/version.ts` — the
one module the UI imports. It runs in `prebuild`, so the failure is a red build with a sentence
naming both numbers rather than a version string nobody backs. The footer renders `v0.9.0` on every
route, linking to the changelog, with the release date on the accessible name.

**The version moved 0.1.0 → 0.9.0, and that is a claim rather than a formality.** `0.1.0` was the
`create-next-app` default and had never been touched across eight R milestones and four P ones. Loft
is pre-1.0 because the editor is younger than OpenRocket's and the physics is not 6-DOF; it is not at
0.1, because a flyer can import five formats, build and edit a staged rocket from scratch, pick real
commercial parts from a 2,990-part catalogue, sweep, run a Monte-Carlo and cross-check against two
other solvers. The changelog's first entry describes what the tool DOES rather than reconstructing
every step that got here — the per-change record starts from it.

**The date rides on the accessible name rather than beside the number**, because the phone chrome
ratchet has 49 px of headroom and this renders on all six routes at once. It is asserted there, so it
is not lost.

Pinned by `lib/version.test.ts` (four cases: the three files agree; the committed module is byte for
byte what the generator produces, so a hand-edit reds `npm test` rather than shipping; every release
is semantic, dated, non-empty and newest-first; and the disagreement path is driven rather than
assumed) and by `e2e/docs.spec.ts`'s *the version a flyer is running is on every route*, which walks
all six and reads the text, the accessible name and the destination. The unit case was proved able to
fail by editing `lib/version.ts` alone: `lib/version.ts disagrees with CHANGELOG.md: expected '0.8.0'
to be '0.9.0'`.

**Why both a test and a build step, when the build already checks.** The gate runs `npm test` before
`npm run build`, and a stale committed `lib/version.ts` is a real state — edit the changelog, do not
rebuild, push. The test fails in seconds where the build fails in three minutes, for the same reason
and with the same message.

*Increment 2 — SHIPPED. The landing surface makes the case `COMPETITION.md` has been asking it to
make for four runs.*

`COMPETITION.md`'s standing conclusion says of its own three claims: *"it is what the landing surface
and the README should say, and right now they do not."* Measured before this: the page stated the
formats and "never uploaded" — claim 2 and half of claim 1 — and said **nothing at all** about the
multi-answer cross-check, which is the one no other hobby tool offers at all. A *Why Loft* block now
carries all three, each with the substance under it rather than the slogan alone.

**Placed after the bundled examples, deliberately, and the e2e asserts the placement.** The primary
controls and the samples are what a flyer with a file and one without actually came for, and the
first example already sits 89 px below the fold on a 390x664 phone. A claim strip above them would
push the one control that needs no reading further out of sight, to make an argument to someone who
has not yet decided to read one. The scroll now reads: **try it · why it is different · what it can
do**.

**Free, offline and no-account are ONE claim, not three.** They are one decision — everything runs on
the flyer's device — and splitting them would have diluted the two that follow into a feature list.

**The format claim names five, where the drop zone names three.** RocketPy and SpaceCAD import too,
and a stranger comparing tools counts them; the drop zone lists only what its file input accepts. The
e2e asserts all five are in that claim, so the two cannot drift as adapters are added.

Pinned by `e2e/first-run.spec.ts`'s *says the three things it does that no other tool does* — three
claims asserted as IDEAS rather than strings, so a rewrite that keeps the meaning passes and a
deletion fails; the substance behind the two a sceptic would test; the five formats; and the
placement, measured as a document offset against the examples. Proved able to fail: rewriting the
third claim's heading alone reds it with `the landing surface never claims: more than one answer`.

*Increment 3 — SHIPPED. The changelog is a page in the app, generated from the file rather than
written twice.*

`/docs/changelog` renders `RELEASES` from `lib/version.ts`, which increment 1 already generates from
`CHANGELOG.md` and refuses to build when `package.json` disagrees. So the page, the version in the
chrome and the file in the repository are **one source with two readers**, not three artifacts
somebody keeps in step. The footer's version now goes there rather than off-site, and the docs hub
links it.

**The block structure is resolved at BUILD time and the inline markdown at render time**, which is
the split that keeps a markdown library out of a bundle budgeted to 335 KB gzipped.
`scripts/gen-version.mjs` turns each entry into `{ heading, lead, items }`, and
`lib/inline-markdown.tsx` — thirty lines — turns `**bold**`, `` `code` `` and `[text](url)` into
ELEMENTS. Never `dangerouslySetInnerHTML`: the input is a file in this repository, so that is not a
live injection path today, but it would make the changelog the one surface in the app where writing
a file is writing markup, and that property is only ever discovered later.

**Two real defects, both found by running the parser over the file it exists to render rather than
over invented examples.**

- **A link inside a bold run came out as literal `[text](url)`.** The changelog's own honesty section
  opens `**A candid, dated [limitations log](…)**`, so the very first release entry would have
  printed the parser's syntax at a flyer. The bold arm recurses now; a bold run cannot contain
  another `*` by construction, so it terminates in one step.
- **`vitest.config.ts` had no `lib/**/*.test.tsx` include at all.** `app` carried both extensions and
  `lib` only `.ts`, so the first test file under `lib` that renders anything reported *No test files
  found* — a red exit for a filtered run, and for the whole suite simply a file that never runs and
  never says so. That is the false all-clear shape `MAINTAINING.md` warns about for the corpus suite,
  one directory over, and it would have swallowed any future `.tsx` test silently.

Pinned by `lib/inline-markdown.test.tsx` (the four forms; that it escapes rather than emitting markup,
inside each construct as well as around it; that unparsable syntax stays literal rather than being
swallowed; and a sweep over **every bullet the shipped changelog contains**, asserting no bullet loses
a word — which is the case that found the nesting bug) and by `e2e/docs.spec.ts`'s *the changelog is a
page in the app*, which asserts every release and date from the module appears, every section heading,
that no unrendered link or bold syntax reaches the page, and that it is reachable from the docs hub as
well as the footer. It also joins the offline docs walk.

*Increment 5 — SHIPPED, out of order and deliberately: it lands on the same component as 1 and 3 and
shares their gate run.*

**A flyer can report a bug or ask for an unsupported format from every route.** It existed on three
docs pages and the docs hub only, each hard-coding the same URL, and the footer's GitHub link went to
the repository ROOT — so a flyer whose import went wrong on `/flight` had to find the documentation
before they could say so. One `NEW_ISSUE_URL` constant, pointed at the form rather than the issue
list, in the footer that renders on all six routes.

**The accessible name names BOTH jobs**, because asking for a format Loft does not read yet is the
request a flyer is least likely to guess is welcome — and ingestion breadth is a North Star, so those
requests are how that queue gets its evidence.

Pinned by `e2e/docs.spec.ts`'s *a flyer can report a bug or ask for a format from any route*, walking
all six and asserting the destination, both jobs in the accessible name, and the new-tab contract.

*Increment 4 — SHIPPED. The README shows the tool, from pictures a script takes rather than a human
remembers to retake.*

**The trap in this clause is not taking the screenshots — it is that hand-captured ones are wrong
within a fortnight and nobody notices, because a README image has no test and no 404.** It renders as
a broken-image icon on the project's front page for as long as it takes somebody to look.
`scripts/gen-screenshots.mjs` makes them the output of a committed script, so "are these current?" is
a command anybody can run: four shots — the landing surface, a flown design, the builder, and the
same flight on a 390 px phone.

**Every shot is DRIVEN, not posed.** Each loads a real bundled sample and waits for the numbers to be
on screen before capturing, so a picture can never show a loading state or an empty panel — and if
the app stops being able to reach that state, the script fails loudly instead of writing a screenshot
of the failure. Dev-only and deliberately not in `prebuild`: it needs a browser and a running server,
which the deploy job has neither of, and a build that failed for a missing Chromium would gate the
deploy on something the deploy does not need.

**One thing worth carrying: a structural locator that happens to resolve is not one that resolves to
the thing you meant.** The builder shot first waited on `page.locator("svg").first()`, which on
`/design` is an icon inside the HIDDEN flight panel — so it timed out while the page was perfectly
ready. It anchors on the workspace region and the parts table now, and scrolls to the region's own
top, because opening the disclosure scrolled the airframe half out of frame in the first take.

*Increment 6 — SHIPPED. Link-checking as a build gate, which is the other half of this milestone's
own pinning.*

`scripts/check-links.mjs` runs in `postbuild` beside `check-routes` and makes two claims, because
there are two ways an internal link dies and only one is visible from inside the app:

- **Every in-app link points at a document the export actually contains** — 425 of them across 14
  exported documents. A route renamed or retired leaves anchors behind on pages nobody edited: the
  docs hub links five pages, the footer links three more, and every one is a literal in a file that
  is not touched when a route moves.
- **Every relative link and image in the repository's markdown points at a file that exists** and is
  not empty. This is what stops increment 4's four screenshots from becoming four broken-image icons
  the day someone renames a directory.

**External links are NOT fetched, deliberately.** A build that fails because somebody else's site is
down is a build that teaches a session to ignore it, and a red gate meaning something is this repo's
whole safety net under unreviewed merges. Off-site rot wants a scheduled check, not this one.

**And it refuses to pass on an empty scan.** Both halves assert they had something to look at, because
a link checker that found no links prints exactly like one that found no problems — the false
all-clear this repo has been caught by twice.

Both halves proved able to fail: renaming one README image reds it with
`README.md links docs/screenshots/flght.png, which does not exist`, and pointing one docs anchor at a
missing route reds it with `docs.html links /docs/limitationz, which the export does not serve`.

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

## P6 — The primitives the design system already declares

**Status: SHIPPED 2026-08-05** — pinned by `lib/design-system.test.ts`'s per-primitive adoption
ratchets (each an EXACT equality, so a hand-rolled copy and a silent regression both fail), by the
`axisTickSize` ratchet at 41 with its per-file breakdown, by the source counts asserting zero
hand-rolled `<select>` elements and zero components re-deriving `useReturnFocus`, and by the
file-level check that a component rendering a chart imports `Figure`. Every §5 primitive exists, is
adopted, and cannot be re-hand-rolled without the suite going red.

**The last clause closed as one conversion and one refusal.** `ResultsView`'s `Field` (14 sites) is
gone — the queue was never one treatment written many ways, it was one treatment at two DENSITIES,
and a card-shaped primitive could not reach the dense half without repainting the shared chrome into
fourteen cards. `Readout` gained `variant` for that. **The five what-if delta rows are REFUSED with a
measured reason**: a before → after → change is three values and a comparison rather than a labelled
value, `q` would have to become a triple, and five call sites in one component are its only possible
user — which is the reasoning §5 already used to delete `Chip`. Both halves are recorded in §5 so the
next audit does not re-open them.

*Earlier status:* increments 1–6 shipped 2026-08-04 (`Readout`, `Select`,
`EmptyState`/`ErrorState`, `Panel`, `Figure`, and the `Section`/`Chip` decision), plus `Extrapolated`,
which arrived early as a Sev-1 fix rather than as planned P6 work. Every primitive §5 declares now
exists and is adopted, each with a per-primitive ratchet in `lib/design-system.test.ts`, and the two
zero-adopter primitives are answered rather than inherited.

**ONE *done when* clause is still open, and increments 8 and 9 closed the half of it that was
blocked.** "`Readout` is the only labelled-value treatment" is not true yet. The queue, re-measured
2026-08-05 — and note the file name, because the previous three entries said `LoftApp` and the sites
are in `ResultsView`:

| shape | sites | state |
|---|---|---|
| `MonteCarlo`'s `StatCard` / `WithheldCard` / `RadiusCard` | 6 | **converted, increment 8** |
| `MonteCarlo`'s waiver-exceedance readout | 1 | **converted, increment 9** |
| `ResultsView`'s `Field` — a `<dl>` strip at `text-sm`, not a card at `text-xl` | 14 | open |
| `ResultsView`'s what-if delta rows — before → after → change | 5 | open |

**Do not mark this milestone SHIPPED until that count is 0 or the remainder is refused with a
measured reason.** The two open shapes are one question, and increment 9 has already answered half of
it: they are a different DENSITY of the same treatment, not a different treatment. `frame="bare"`
gave `Readout` the container axis; the remaining axis is the value SIZE — `text-sm` in a dense strip
against `text-xl` in a tile — and it should be taken the same way, on the smallest real call site
first.

**Increment 7 took the prerequisite and found the blocker.** `Readout`'s own label and sub-line were
at `text-[11px]`, a size §3 scopes to "axis ticks and diagram annotations only" — the design system's
primitive breaking the design system, on the treatment a flyer reads every number through. Both moved
to `text-xs`, and a new `axisTickSize` ratchet holds the app-wide count of that token at its measured
**46** with the per-file breakdown beside it (now **42**), so the remaining offenders cannot be joined
by another while they wait. **But converting `MonteCarlo`'s six cards would now make them worse**:
they put a
5–95% band in the `sub` slot at `text-sm`, and a recovery band IS a decision-grade figure, which §3
puts at `text-sm` and the text AROUND a value one size down. **One `sub` slot cannot be both sizes.**
That is the API decision the next run owes — probably a second slot, or a `sub` that takes a node
rather than a string, and either way it should be decided from the six real call sites rather than
invented.

*Increments 8 and 9 — SHIPPED 2026-08-05. The blocker answered, and the dispersion panel's five
labelled values are all `Readout`s.*

**The slot was split rather than widened, and the six call sites decided it.** `sub` stays the
caption at `text-xs`; a new `figure` slot is a SECOND decision-grade number at `text-sm`, mono — a
percentile band (`q` … `to`, one unit for the pair) or a labelled companion (`lead` + `q`). Three of
the six wanted a band, one a companion, and two wanted neither and took `withheld`, which the
primitive already had. `StatCard`, `WithheldCard` and `RadiusCard` are deleted; the only part with
logic in it, the band, survives as a four-line helper. `DESIGN.md` §5 carries the rule that decides
which slot a caller wants, since choosing between them is a §3 question rather than a taste one.

**Two divergences closed on the way, both toward the file.** The three card titles were `text-[11px]`
(§3: axis ticks and diagram annotations only), and all four cards were `font-semibold`, which §3
reserves for "the one number a surface exists to show" — four lead numbers is no lead number, and a
flyer moving between this panel and the flight card met the same apogee weighted two ways. `Readout`'s
own label gained `font-medium` for the same reason in reverse: §3's weight rule asks for it and the
converting sites already spelled it, so adopting the primitive must not cost a call site its
compliance with the file the primitive exists to enforce.

**Increment 9 exists because increment 8 made the panel WORSE in one place, and a pre-push review
caught it.** The panel has a fifth labelled value — the waiver-ceiling exceedance — which is not in
the stat grid but inside the inputs card. Converting the grid left it the only `text-[11px]` label
and the only sans-serif number among five, and the new e2e guard could not see it because it counts
the accent colour and that readout's warn treatment is amber. **A conversion that improves four of
five sites can leave the fifth further from the system than it started**, which is an argument for
finishing a surface rather than a shape. `Readout` gained `frame="bare"` for a readout that already
sits inside a container, and `caution` — which takes the REASON as a string rather than a boolean,
because that value had turned amber above 5% for its whole life without ever saying what 5% was.
`text-[11px]` 46 → 42; `MonteCarlo`'s remaining two are the histogram's own axis labels.

*Increment 1 — SHIPPED. `Readout` exists and `ResultsView`'s sixteen readouts go through it.*

Lifted from that file's own local `Stat` rather than designed fresh: it had already grown every axis
§5 asks for — unit in its own span, accent, the withheld em-dash-with-a-reason, the extrapolated
caveat — each added on a separate occasion for a recorded reason. The defect was never the API; it
was that sixteen readouts on one page could reach it and no other surface could. DOM unchanged class
for class, proved by 227 e2e cases passing unmodified (several locate these readouts by walking a
label's following sibling).

*`Extrapolated` — SHIPPED 2026-08-04, out of order and for a different reason.* It was needed to fix
a Sev-1: the transonic caveat existed only inside that same local `Stat`, so ONE surface marked a
number outside the drag model's envelope while five others flying the same solver rendered theirs as
validated. **That is the strongest argument this milestone has**, and it was found by measurement
rather than by the audit: a treatment written inline is invisible to a check that counts imports, so
nothing in `lib/design-system.test.ts` could see it. Both primitives now carry a per-primitive
ratchet, which is what stops the next one being found the same way.

*Increment 2 — SHIPPED 2026-08-04. `Select`, and every dropdown in the app goes through it.*

Twelve `<select>` elements across four files, five class strings, and the fifth was a defect rather
than untidiness: `ResultsView`'s two unit pickers carried no `TOUCH_TARGET`, so they rendered under
§8's 44 px minimum on a phone. Pinned two ways — a per-primitive adoption ratchet at four files, and
a source count asserting zero hand-rolled `<select>` elements remain outside `ui.tsx`, because
adoption alone cannot see a thirteenth one added tomorrow beside the primitive.

**It also forced a fix to the compliance check itself, and the next increment will thank it.**
Converting those controls took `LoftApp` from 17/16 to 17/9 on the caption-vs-body ratio without one
rendered pixel changing size, because a primitive's `text-sm` moves out of the call site where the
grep can see it. `DESIGN.md` §9 already recorded this distortion for the SUITE total and concluded
"count the inverted files"; that conclusion was right and incomplete, since a file's own count moves
the same way. The check credits the body-default primitives a file uses now, from an explicit list,
and §9 carries the rule underneath: **a check that counts a file's own class strings will always
penalise adoption, so it has to count what the file RENDERS.** Verified it keeps its teeth — every
other component still passes on raw counts alone.

*Increment 3 — SHIPPED 2026-08-04. `EmptyState` and `ErrorState`.*

`EmptyState` is adopted by `DataTable`, which is "every table in the app", so one branch is now the
empty state of all seven. `ErrorState` takes three named slots — what failed, what was expected, the
way forward — because a message assembled at the call site drops one of the three about as often as
not, and it renders `danger` where `EmptyState` renders `muted`: a surface with nothing to show and a
surface that broke are different facts.

**One claim in that increment was wrong, and driving the app is what caught it.** `MassBreakdown`
guarded on an empty structural-mass set and returned null, and one corpus design does produce that
set — but loaded through the UI that design has no motor, so `ResultsView` withholds everything below
its "No flight simulated" card and the guard is never reached. Nothing in the corpus both flies and
states no structural mass. The guard is still gone and the dead `empty` copy is now live; the honest
claim is that a data surface no longer has a branch where it silently disappears, not that a visible
hole was patched. Pinned by `lets no data surface vanish instead of saying why`, scoped to the named
data-rendering components — a blanket rule would fire on the app's conditional ADVICE, and a hint
that does not apply must not render an empty box saying so.

*Increment 4 — SHIPPED 2026-08-04. `Panel`, and it is the first primitive here that carries
BEHAVIOUR rather than a treatment.*

Three adopters from the first commit: the parameter sweep, the motor sweep and the dispersion run
had hand-rolled the identical landmark, header row, `text-xl` heading, `text-xs` caption,
`open`-gated close button and `!open` Run block. The styling was the cheap half. §5 also says `Panel`
"owns focus return", and until now nothing did — each call site declared `useReturnFocus()`, put the
ref on its own Run button, and called the returner from inside its own close handler. Four steps, by
hand, three times, and **a panel that closes and drops focus onto `<body>` is invisible to every
check in this repo**.

Pinned two ways, the pattern `Select` established: a per-primitive ratchet at three files, and a
source count asserting zero components outside `ui.tsx` call `useReturnFocus` — because adoption sees
a fourth panel that imports `Panel` and cannot see a fourth panel that re-derives the wiring beside
it. Proved able to fail by putting the hook back into `MonteCarlo`.

It also moved three counts DOWN — `Card` 12→11, `Button` 14→12, `ClosePanel` 3→0 — with no rendered
pixel changing, which is the distortion §9 already records under *count what a file RENDERS*. Noted
beside each number so the next audit reads it as absorption rather than regression.

*Increment 5 — SHIPPED 2026-08-04. `Figure`, and every chart in the app is framed by it.*

Nine call sites in four files, in four disagreeing treatments: `ResultsView`'s local `Plot` (a `Card`,
an `h3`, an `overflow-x-auto` wrapper), `MonteCarlo` repeating that exact heading string without the
wrapper, `DragCrossCheck` using a `<p>` where a heading belongs and one shade off at `text-zinc-600`,
and `ParameterSweep` with the out-of-envelope caveat above the chart and the caption below it and no
heading at all. **That last one is the argument for the primitive**: the caveat had exactly one home
in the app, and a home is what makes it a STATE rather than a paragraph somebody remembered.

Legend and axis units are deliberately not the wrapper's — `LineChart` owns both, draws the legend
from each series' own label, and takes `xLabel`/`yLabel`. §5 lists them as things a figure must HAVE,
not as things this component must render, and hoisting them would make every chart declare its axes
twice.

Pinned three ways: the per-primitive ratchet at four adopters; a file-level source check that a
component rendering a chart imports `Figure` (which catches the next file that frames one by hand —
the way all four of these started, and which the import ratchet cannot see); and `Extrapolated`
dropping 6 → 4 adopters as `Readout` and now `Figure` took it over, recorded as absorption with the
reason. Both new checks proved able to fail.

**It also caught a stale ratchet.** `uiAdopters` sat at 17 while §9's own grep answered 18 — and
because it is a `toBeGreaterThanOrEqual`, a stale floor cannot fail, it just quietly stops
ratcheting. Raised, with the grep written beside it.

*Increment 6 — SHIPPED 2026-08-04. The two zero-adopter primitives, answered.*

`Section` and `Chip` had sat at 0 call sites for five runs, and this milestone's own notes said they
either gain them or are deleted. Both got a decision, and they went opposite ways.

**`Section` gains its call sites, and its own implementation was why it had none.** It imposed
`mt-8 first:mt-0` on the region and `mt-4` on its children — rhythm the two real bare regions already
own through the workspace's `space-y-8` — so adopting it would have doubled every gap. **A primitive
that cannot be adopted without a repaint does not get adopted; it gets copied**, which is exactly what
both sites did. Both margins are gone.

**And it had already drifted from the app before it ever rendered**: `Section` spelled its heading
`text-xl font-medium text-zinc-900 dark:text-zinc-100` while all ten real headings spelled it
`text-xl font-medium tracking-tight`. The app's spelling won — a primitive with zero call sites is a
proposal, and ten rendered sites are the evidence. `Panel` and `Section` now render one shared header
component, so the two cannot drift again.

**`Panel` turned out to be the shape the app uses most.** Extracted last increment for the three
dismissible analysis panels, its header was byte-identical at **seven** more cards with nothing to
dismiss: both cross-checks, the validation report, the flight-path card, the phase table, the
no-flight refusal and the design-name strip. §5's container vocabulary was missing that shape
entirely — `Card`'s own `title` is a level below it, an `h3` inside a card rather than the card's own
heading. The dismissible half is now a type union rather than four loose optionals, so a call site
cannot ask for a Close button and forget the Run button focus returns to. 3 → 7 adopters.

**`Chip` is DELETED**, from `ui.tsx`, from the ratchet and from §5. It declared "a compact key/value
or filter token" and had zero call sites for its whole life, where every other §5 primitive found
between one and seven on the day it was built. The key/value half is `Readout`'s, which has adopters.
And the app contains **exactly one** token-shaped element — the motor-resolution pills in
`ResultsView` — a single-label STATE pill, not a key/value, in a geometry
(`rounded-full px-2.5 py-0.5`) that is not the one §5 stated. Adopting it there would have meant
rewriting both the API and the spec to fit the only possible user. §5 now carries that reasoning so it
is not re-added from memory; if a second token surface arrives, that pill strip is the shape to
extract, and the entry should be written from it rather than before it.

(The `GeometryInspector` empty-state case was investigated and
REFUTED — `ResultsView` never mounts without a successful flight, so that branch is genuinely
unreachable.) **The `Readout` queue behind increment 1 is the milestone's last open clause** and is
measured and waiting: `Field` (14 sites in the same file, a pre-formatted-string value),
`MonteCarlo`'s `StatCard`/`WithheldCard`/`RadiusCard` (6, differing only in what fills `sub`), and
the what-if delta rows (5, a before → after → change shape the API does not yet express).

**Outcome.** `DESIGN.md` §5's component vocabulary stops being a description of what the app should
have and becomes what it is built from — so a surface added next run inherits the system instead of
re-deciding it.

**Why now, and why not before P5.** This gap has been visible since P1 and was deliberately not taken
first, for a measured reason: it is **held stationary by an exact ratchet**.
`lib/design-system.test.ts` asserts adoption per primitive as an equality, and all six `DESIGN.md` §9
counts are at their target or their recorded honest floor, so the divergence cannot decay while it
waits. P5's gap could not wait the same way — it was costing every stranger who arrived, and P6 was
gated behind it. With P5 shipped, this is the obvious next P milestone.

**The audit, re-measured 2026-08-03** (the previous count was five absent primitives and missed one):

- **Six primitives §5 declares do not exist**: `Panel`, `Readout`, `Figure`, `EmptyState`,
  `ErrorState`, `Extrapolated`.
- **Two exist with ZERO call sites**: `Section` (while 12 sites hand-roll its exact heading across 6
  files) and `Chip`. (`Tabs` is also 0 and is NOT drift — it is the documented consequence of the
  route split.)
- **`Readout` — the labelled-value-with-unit treatment — is hand-rolled ~27 times in 7 disagreeing
  class strings** across `ResultsView`, `MonteCarlo`, `LoftApp`, `ImportPanel`, `ParameterSweep` and
  `ui`. A cheap proxy to re-measure it: `grep -roh 'uppercase tracking-wide' components app | wc -l`
  returns **31**, which counts the label half of the treatment plus a few section eyebrows. It is the
  single most-repeated treatment in the app and the one a flyer reads every number through — start
  here, and take the exact count as the first thing the increment does.
- **There is no `Select` primitive and 12 real `<select>` elements hand-roll their own class
  strings** — LoftApp 7, ParameterSweep 2, ResultsView 2, PartPicker 1. (`grep '<select'` returns 14;
  two of those are inside comments, which is worth stating because the next session will run the same
  grep and get the larger number.)
- **`EmptyState` / `ErrorState` are hand-rolled 10 ways**, and two surfaces have neither:
  `ParameterSweep.tsx:328` and `FlightViz.tsx:37` both `return null`, so the panel VANISHES rather
  than saying why — the one state that teaches nothing.
- **A second `warn` card tone** is spelled inline at `ResultsView.tsx:1234`, disagreeing with
  `CARD_TONES.warn` by one shade in each theme.
- **`text-[11px]` is used 47 times across 10 files**, ~21 of them on field labels, legends and readout
  labels — §3 scopes that size to axis ticks and diagram annotations only.

**Done when** every primitive `DESIGN.md` §5 declares exists in `components/ui.tsx` and is used at
every site that hand-rolls it today; `Readout` is the only labelled-value treatment; a `Select`
primitive is the only `<select>` treatment; no data surface returns `null` where an empty or error
state belongs; and `lib/design-system.test.ts` gains a per-primitive adoption ratchet for each new
one, so the next hand-rolled copy fails the suite rather than being found by a later audit.

**Pinned by** that ratchet — which is the point of the milestone as much as the components are. A
design system that is enforced only by somebody re-running an audit is a description, not a system.

**Size.** 4–6 increments. Take `Readout` first: 27 sites, one treatment, and it is the one a flyer
reads every number through — so it is both the biggest single win and the clearest test of whether the
primitive's API is right before four more are built on the same pattern. Then `Select` (12 sites),
then `EmptyState`/`ErrorState` (10, plus the two surfaces that have none), then `Panel`, `Figure` and
`Extrapolated`.

**Notes.** Convert, do not repaint. Where a hand-rolled site differs from the primitive, the primitive
wins and the difference is a defect — that is what `DESIGN.md` being binding means. Where a site
differs for a REASON, change `DESIGN.md` first, with the reason, and then the primitive. The two
zero-call-site primitives (`Section`, `Chip`) are a live question this milestone must answer rather
than inherit: either they gain their call sites or they are deleted from the file and from §5.

---

## P7 (from ON-1) — Readable in every theme a visitor can actually be in

**Status: SHIPPED 2026-08-08** — pinned by `e2e/contrast.spec.ts` (four cases: all six docs routes in
light, in chosen-Dark, and on a dark OS with nothing chosen, plus all four workspaces in that last
state) and by `lib/design-system.test.ts`'s *lets no hand-written rule answer only the class half of
the dark variant*. Both were proved able to fail by a negative control that reproduces the original
1.12:1 and 3.16:1 by name.

**Outcome.** Text is readable in every theme state a visitor can reach — including the default one,
which is the one that was broken.

**What it was.** The `dark` variant has two clauses; a `dark:` utility gets both, a hand-written
stylesheet rule gets only the one it asks for. All eleven `.prose-loft` rules asked for the `.dark`
class, and "System" — the default — sets no class. Every first-time visitor on a dark-OS device read
all six docs routes in the light palette on a dark ground: body prose **1.91:1**, `h2` and `strong`
**1.12:1**, links 3.16:1, blockquotes 2.57:1, against WCAG AA's 4.5:1.

**Done when** — all met: every docs route and every workspace clears WCAG AA in all three theme
states; the fix is expressed so the OS clause cannot be forgotten again (`light-dark()`, which
resolves against the used `color-scheme` the root already sets per clause); `DESIGN.md` §9 carries
contrast as a rule with its two commands, because seven class-name greps could not see this and never
will; and the suite's dark-mode accessibility audit no longer runs only in the class state.

**Size.** 1 increment, which is what it took.

**The gap this leaves, and it is the next session's.** `DESIGN.md` is shared verbatim with the
sibling repo and a change to one is a change to both in the same run. Whether Debrief's own
stylesheet carries the same class-only defect is measured in that repo, not inferred from this one.

---

## P8 (from ON-3) — The phone stands the rocket up

**Status: SHIPPED 2026-08-09** — in ONE increment rather than the three or four estimated, because
the rotation turned out to be one transform rather than a second drawing. Every clause of the
*done when* is met and pinned by `e2e/touch.spec.ts`'s *a phone held upright draws the rocket upright,
nose at top, and no grip inverts* and `e2e/touch-landscape.spec.ts`'s *a phone turned sideways keeps
the rocket lying down*. A phone held
upright draws the airframe upright, nose at top, at a scale set by a named height budget; every grip
is re-based on the model axis; the tap columns' 44 px follows the model axis too; and landscape is
unchanged with a case saying so. Pinned by `e2e/touch.spec.ts`'s *a phone held upright draws the
rocket upright, nose at top, and no grip inverts* and by `e2e/touch-landscape.spec.ts`'s *a phone
turned sideways keeps the rocket lying down*.

**Measured on the built export at a 390 px viewport: 296 x 11.8 px becomes 124 x 508**, and the
airframe itself goes from 11.8 px across to about 26 — better than the 1.62x this milestone predicted,
because the prediction assumed the fin span would not share the cross axis.

**The implementation is one transform, and that is the finding worth carrying.** Every coordinate in
`RocketDiagram.tsx` stays in the drawing's own space — station along `x`, radius about `centerY` — and
`rotate(90) translate(0,-H)` on the group that holds them turns the whole picture a quarter turn. So
the tap columns, the labels, the CG/CP marks and the nine grips needed no rotated variants: there is
one drawing and two framings of it, rather than two drawings to keep in step. The pointer mapping came
free with it, because reading `getScreenCTM()` from the HANDLE rather than from the `<svg>` lands the
pointer in the coordinate space the handle is drawn in, rotation included.

**`axis` now means the MODEL axis** — `"station"` or `"radius"` — and the five things the screen needs
are derived from it and `vertical`: the value mapping, the resize cursor, `aria-orientation`, the
arrow-key direction and the arrow glyph. The milestone's own correction 2 undercounted those
consumers at three, and missed a sixth thing that was not gated on `axis` at all: the arrow-key
handler hard-coded left-and-down as decrease, so on an upright airframe `ArrowDown` would have moved
the fin toward the nose while the number went the other way.

**Four e2e cases had to follow the model axis rather than the screen**, and every one of them failed
in a way that reads as a product defect rather than a test written against a horizontal drawing:
`elementFromPoint` answering `null` past the fold and under the sticky nav (twice, reading as
"centre resolves to null"); a mass column tapped 8 px from its top, which was clear sky lying down
and the fin planform standing up; a fin tapped at a corner hand-read off the horizontal planform;
and the Sev-1 flick regression driving a grip by NAME, so it flicked vertically along a grip that had
become horizontal. The flick case also now asserts the flick's own signature rather than the page
holding perfectly still — a design edit re-renders the panels below it and scroll anchoring follows,
which is not the gesture scrolling the page.

**What is NOT done.** The airframe is 508 px tall in a panel that starts 412 px down a 664 px screen,
so the aft grips sit below the first screen and a flyer scrolls to them. That is inherent to standing
a rocket up rather than a defect in this increment — but the 412 px of chrome above the drawing is
its own finding and is not this milestone's. `DESIGN.md` §8 carries the orientation rule and the
model-axis rule, in both repos, byte-identical.

**Four corrections to this milestone's own measurements, made 2026-08-08 and
each verified by hand rather than taken from the agent that reported it** — a milestone spec is not
evidence, and three of these would have cost the run that built it.

1. **There are NINE `FinHandle` call sites, not eight.** `grep -c '<FinHandle' components/RocketDiagram.tsx`
   answers 10; the tenth is `<FinHandlePicker` at `:1024`. The nine are at `:826, :844, :862, :880,
   :898, :925, :953, :976, :996`. **And no call site passes `axis="x"` at all** — it is the prop's
   default, declared `axis = "x"` at `:1166` — so `grep 'axis='` finds exactly two hits (`:901` and
   `:999`, both `axis="y"`) and a session reading that concludes seven grips do not need re-basing.
   That trap is worse than the miscount. *(A first draft of this paragraph cited `:1165` for the
   default and was corrected by opening the line — which is the whole point of the framing above.)*
2. **`axis` has THREE consumers, not two.** The resize cursor (`:1307`), `aria-orientation` (`:1311`)
   and the arrow-glyph path drawn on the grip (`:1375`). A rotation that re-bases the value mapping
   and forgets the glyph draws an arrow pointing across the gesture.
3. **The pointer→value mapping is written TWICE and is not shared** — once in `apply` (`:1253`, the
   drag frame) and once in `onPointerDown` (`:1345`, the grab offset). Re-basing one and not the other
   is a grip that jumps on grab, which is exactly the tell `ON-4` complained about.
4. **The depth-budget clause below is WRONG, and it is the one that would have shaped the increment.**
   It says vertical is not free on journey depth because everything below the drawing moves down by
   ~420 px on `/design`. `e2e/depth.spec.ts:71-74` anchors `/design` on the drawing ITSELF
   (`#panel-design svg[aria-label*='Scale side-view']`), which sits at the TOP of the panel — so
   pushing the content below it down moves nothing that spec measures, on either form factor. The only
   ratchet that could fire is the shared-chrome cap (`:165`, DESKTOP 820 / PHONE 1060) measured on
   `nav[aria-label='Workspace']`, which sits ABOVE the panel and cannot move either. **So there is no
   depth budget to buy here** — the milestone should stop reserving one and spend the increment on the
   grips instead.

5. **Clause 4 of the *done when* is not impossible — it is mis-stated, and the last handoff was wrong
   to park the milestone on it.** That handoff read correction 4's arithmetic (56 of 150 corpus body
   parts under 44 px along their length, the narrowest 0.8 px) as proof that a rotated drawing cannot
   satisfy the touch contract, and left P8 as a product question for the owner. Opened and measured
   2026-08-09, it is neither. **A tap column today is `y={0} height={H}` — the FULL diagram height —
   and `x0..x1` wide, where the width is the part's length** (`components/RocketDiagram.tsx:608-614`
   for the body parts, `:668-690` for the fin and mass columns). The `e2e/touch.spec.ts` assert is on
   **height only**, and its own docblock already says why width is not asserted: it is bounded by the
   part's length, and those 56 rows are exactly that bound. So the 44 px passes today because the
   CROSS-AXIS dimension is the whole drawing — not because of anything about the parts.

   Rotate, and that is still true: the band becomes `x={0} width={W}` (324 px at a 390 px viewport)
   by part-length tall. **The contract does not change; only the screen axis it lands on rotates.**
   The work is to make the assert follow the MODEL axis instead of the screen axis — which is
   **correction 3's defect in a second place**: `FinHandle`'s `axis` prop means screen axis and needs
   the same re-basing. Two instances of one mistake is the finding, and it is the thing to write into
   `DESIGN.md` §8 alongside the orientation rule.

   So P8 opens on the grips and the height budget, not on a question for the owner, and clause 4
   should read *"the tap columns are rebuilt on the cross axis and the 44 px assert follows the model
   axis rather than the screen axis"*. Corrected here rather than in the handoff, because the handoff
   is not the queue.

Two further measurements the milestone does not carry and the implementation needs: `e2e/touch.spec.ts:238`
hard-codes `toHaveCount(3)` on `g[role="slider"]` for a coarse pointer, so any change to which grips
a phone shows fails there by design; and there are **two separate tap-column builders**, not one —
body-part columns computed inline in JSX (`:604-627`, with no `TAP_MIN` floor) and fin/mass columns
from the `tapColumns` array (`:668-690`). Clause 4 of the *done when* has to re-derive both.

**Outcome.** On a phone held upright, the airframe is drawn upright — nose at top — at a scale that
makes it legible as a rocket instead of a hairline.

**Measured 2026-08-08, and the numbers decide the scope.** Nothing has to be un-picked first: there
is no orientation switch anywhere, no `matchMedia("(orientation: portrait)")`, no CSS rotation. At a
390 px viewport the diagram column measures 324 px, and for the bundled `38 mm single-deploy` sample
the airframe renders **296 px long and 11.8 px tall** — 3.86:1 in a box, a to-scale rocket too thin
to read as one. Dual-deploy is 10.3 px; the from-scratch starter is 19.0 px.

**Four measurements that must survive contact with the implementation**, each of which kills an
obvious wrong turn:

1. **Rotating buys 1.62×, not an order of magnitude.** A vertical airframe cannot use the 324 px
   cross-axis — the widest bundled design is 104–121 px tip-to-tip at any usable scale — so the scale
   comes from a HEIGHT budget. At 500 px of a 664 px screen, single-deploy goes 11.8 → 19.2 px.
   **None of them reaches §8's 44 px.** So this is a legibility and affordance fix and must not be
   sold as a hit-target fix; the 44 px contract stays satisfied by the tap columns exactly as today.
2. **Key it on `(orientation: portrait)` AND coarse, never coarse alone.** `e2e/touch-landscape.spec.ts`
   runs Pixel 7 landscape at 863×360, where the horizontal drawing gets ~831 px of column and a
   vertical one would get at most ~340 px of height — strictly worse than today. That suite's own
   test name is already *"the pointer decides the hit target, not the viewport width"*.
3. **`FinHandle`'s `axis` prop means SCREEN axis, not model axis.** Six of eight grips pass `"x"`
   (station-valued) and two pass `"y"` (radius-valued), and `aria-orientation` and the resize cursor
   derive from the same prop. Rotating without re-basing it on the MODEL axis silently inverts every
   grip — a drag toward the nose lengthening the fin root, and a screen reader announcing the
   opposite of the gesture. That is a wrong control, not a cosmetic one.
4. **The 44 px tap assert flips from trivially-passing to failing.** `e2e/touch.spec.ts` asserts no
   tap column is under 44 px, which holds today only because columns are full-diagram-height and
   part-length wide. On the cross axis the band's height becomes the part's length, and that spec
   already records **56 of 150 body parts across the corpus under 44 px** along it, the narrowest at
   0.8 px. The column-building code has to be re-derived in the same change, not after it.

**Done when** a phone in portrait draws the airframe vertically with the nose at top, at a scale set
by a named height budget; every grip is re-based on the model axis so no control inverts; the tap
columns are rebuilt on the cross axis and the 44 px assert follows the model axis rather than the
screen axis (see correction 5 — it is not a new bound to satisfy, it is the same one, rotated); landscape
is unchanged and has a case saying so; and `DESIGN.md` §8 — which today says nothing whatever about
orientation — carries the rule, in both repos.

**Size.** 3–4 increments.

**Notes.** Nose at TOP is settled by existing convention rather than taste: `MassBreakdown`'s *CG from
nose*, `GeometryInspector`'s station sort and its "at X from the nose" readout, and the parts table's
design order all read nose-first. Nose at bottom would contradict all four. **The height budget is a
genuinely new concept** — `useMeasuredWidth` is the only measurement hook in the codebase and it
measures width only — so name the constant in the milestone rather than discovering it mid-increment,
and remember it cannot be `100vh`-derived without a hydration mismatch. The coarse-pointer fin chip
row survives rotation and must stay: at 1.62× the fin-corner spacings are still 34/34/11 px at best
and still coincident on two of four samples. And vertical is not free on journey depth — everything
below the drawing moves down by roughly 420 px on `/design`, a route that already records a 1,841 px
journey — so the milestone needs its own budget clause.

---

## P9 (from ON-B1) — One suite, one set of chrome

**Status: SHIPPED 2026-08-08** — in one increment, not the two estimated, because the theme half
turned out to need nothing. Every clause of the *done when* is met and each is pinned by a check in
`lib/design-system.test.ts`'s new §10 block:

- *keeps Loft's touch floor and focus ring on the suite's Tip control* — asserts the link's geometry
  still comes from `buttonClass()` rather than a hand-rolled string, and that `buttonClass` itself
  still carries the ring and the 44 px floor. **Both halves are scoped to that function's own body,
  and the first draft was not:** `TOUCH_TARGET,` occurs twice in `lib/ui-tokens.ts` — once here and
  once in `navItemClass` — so a whole-file match stayed green with the floor deleted from the button.
  A check that cannot fail for the regression it names is worse than none; found by the pre-push
  review, not by running it.
- *draws the Tip control with the suite's coffee-cup glyph* — the thing that actually makes the
  control recognisable, asserted on the distinctive segment of the cup path plus the accessible name,
  together with the ABSENCE of a `title` on it (see below).
- *lets no chrome wear a semantic ramp* — across header, footer and spine, asserting an EMPTY list.
  Negative control: a `text-amber-600` in `Footer.tsx` reports it by file and class.
- *takes the theme control's accessible name from the reference implementation, unchanged* — the half
  that was never divergent, asserted so a later run cannot "align" it into a rewrite.

**What shipped, measured rather than described.** The Tip link now draws the suite's coffee-cup glyph
in place of the `♥` it carried, and the siblings' own sentence — *"Tip the project — buy me a coffee on
Ko-fi"* — as its accessible name. It keeps `px-3 py-1.5 text-sm`, `pointer-coarse:min-h-11` and the
`focus-visible` indigo ring, none of which the motor finder has.

**The `title` both siblings carry was tried here and the touch suite refused it — a second reversal
inside the same increment, and a second one the repo caught rather than a reviewer.**
`e2e/touch.spec.ts`'s *"counts the states a flyer at the pad cannot reach"* counts any `title` whose
text is not already rendered beside it and holds the total at `HOVER_ONLY_FLOOR = 0`; this one took it
to **1**. Correctly: the visible label is "Tip", the tooltip is a sentence, and a phone gets no
tooltip. So the wording converges and the mechanism does not — `aria-label` alone — and §10 now states
that as a family rule with the measurement behind it. **Worth noting how it was caught: the first
re-run after removing the `title` still failed, because the e2e suite serves the built `out/` and the
rebuild had not happened yet.** A source fix that "does not take" is that, more often than it is
wrong.

**The colour did NOT change, and reversing that decision mid-increment is the most useful thing this
milestone did.** The first version of this increment shipped the motor finder's amber pill: `ON-B1`
asks for consistency, §2 reserves amber for *"an estimate outside its envelope, an extrapolation, a
caveat"*, the note outranks `DESIGN.md` under `OWNER-NOTES.md`'s precedence rule, so §2 was amended
with a bounded one-control exception and a check to hold it there. It was measured against **two**
tools — Loft and the live motor finder — because the third was not attached.

Then the sibling was attached, and `components/KofiButton.tsx` in Debrief turned out to carry the
answer in a docblock: **that control used to be amber and was deliberately changed**, because *"every
other amber in the tree is a real caveat… a flyer learns amber means 'this number is qualified';
spending it on a tip jar in the persistent header devalues the one signal the safety posture leans
on. The coffee cup is what distinguishes it, and a glyph costs the colour system nothing."* Two of the
three tools already agreed, and they are the two that meet §2. So the consistency the owner asked for
is delivered by the **glyph**, the amber was reverted, and §2 now carries *no* chrome exception at all
— a stronger rule than the one it started the run with, and the check asserts an EMPTY list rather
than a one-item allowance.

**The transferable lesson, and it is about method rather than about colour:** a suite question
measured across two of three tools produced a confident, documented, checked answer that was wrong.
`HANDOFF.md` had already recorded that the sibling is attachable in one tool call. §10 now says to
attach it before deciding anything that section governs.

**Cost: zero bytes.** The amber version grew the shipped stylesheet 63,476 → 67,124 (+3,648, measured
by building both sides with `out/` and `.next/` removed — six new ramp shades' theme variables and
twenty rules, of which the four `dark:…hover:` variants each emit a `@media (hover:hover)`, an
`@supports (color-mix)` and a `prefers-color-scheme` copy). Reverting the colour gives all of it back:
the glyph is an inline SVG and the geometry was already there.

**Mirrored into the sibling in the same run, which is what §10 requires and what four consecutive runs
reported as impossible.** `nrdptel/fusionspace-debrief` was attached mid-run, §2 and §10 landed there
verbatim, and its Tip control gained the same `aria-label` beside its `title`.

**Outcome.** The theme control and the Tip control read as the same controls a flyer already used on
`motor.fusionspace.co`, because the suite has a live reference implementation and neither of these
repos has ever been measured against it.

**Measured 2026-08-08 from the live site's rendered output.** The motor finder's repo is not attached
to this environment, so the behaviour is verified and the implementation is inferred — say so again in
whatever run builds this, and do not guess at source.

- **The theme control's BEHAVIOUR already matches**: same tri-state cycle, same `System / Light /
  Dark` labels, same `◐ ☀ ☾` icons, same `Color theme: X. Click to change.` accessible name. Only the
  storage key differs, correctly. **Nothing in `ThemeToggle`'s logic needs touching**, which rules
  out the rewrite this note could easily have been read as asking for.
- **The Tip control is the real divergence**: an amber pill with a coffee-cup glyph there, a neutral
  grey secondary button with a `♥` here. Same word, same destination, different colour and icon.
- The theme button also differs in fill (solid there, transparent here) and size (~26 px vs ~34 px).

**"Match the live site" LITERALLY is the wrong answer, and this is the clause to hold the milestone
to.** Copying the motor finder's chrome verbatim would shrink Loft's header controls below its own
44 px touch floor, drop the `focus-visible` ring Loft's button token adds, and revert a measured
decision recorded in `SiteHeader.tsx`. So: align colour, icon and tooltip posture toward the senior
sibling; keep Loft's touch floor and focus ring; and where Loft is the one meeting a contract, the
motor finder is what should move.

**Done when** `DESIGN.md` §10 names the motor finder as the reference implementation and specifies
the Tip and theme controls concretely enough to converge on (it names neither today); Loft's Tip
control matches that specification; and a check asserts the touch floor and focus ring survived the
alignment, so the next run cannot regress them chasing a pixel.

**Size.** 2 increments.

**Notes.** The header's SHAPE also differs — two right-aligned rows there, one row here, Tip last vs
first — and that is a product call parked in `OWNER-NOTES.md` under *Awaiting the owner* rather than
decided here. Build the token alignment without it.

---

## P10 (from ON-B2) — The repo page is a surface, and it goes stale like one

**Status: IN PROGRESS — 2 of 3 shipped.** Increment 2 landed 2026-08-11 (its entry is below);
increment 3 is the repository SETTINGS half, which is not a file and which no session can edit, so it
is parked on the owner and this milestone cannot close without them. *(Status line corrected
2026-08-11: it read "increment 1 of 2" for a day after increment 2 shipped and after the size grew to
3, contradicting this section's own body.)*

Increment 1 shipped 2026-08-08: the README describes what ships, and
two of its claims are now asserted against the code that makes them true. Pinned by
`lib/version.test.ts`'s *names every design format the importer actually accepts* (which reads
`ImportPanel`'s own `accept` list, so a new adapter fails the build until the README names it) and
*states the number of bundled examples the repo actually ships*. Both proved able to fail by a
negative control that restores the shipped text: the first reports *"README.md does not mention
design formats the import panel accepts: .rkt, .cdx1"* — the exact claim that stood for four months.

**Deliberately narrow, and that is the design.** Only claims with a single mechanical source of
truth are asserted. Prose about what the tool feels like is not testable, and pretending otherwise
would make the check noisy enough that someone disables it — which is how a stale README happens in
the first place.

**Increment 2 — the claim the check could not see, 2026-08-11.** The mechanism increment 1 built is
DIRECTIONAL: it asserts the README mentions every extension `ImportPanel`'s accept list takes, so it
catches an omission and by construction cannot catch an over-claim. And an over-claim is what had
shipped. The landing page's own *"It reads the file you already have"* card and the changelog entry
served at `/docs/changelog` both said Loft imports **"OpenRocket `.ork`, RockSim `.rkt`, RASAero
`.CDX1`, RocketPy and SpaceCAD"**. The input accepts three extensions, `lib/ork/import.ts`'s own
refusal names three formats, and **there is no SpaceCAD code in the repo at all** —
`lib/validation/rocketpy-spec.ts` builds a spec FROM a Loft design for the in-browser second solver,
which is the export direction. So a RocketPy or SpaceCAD flyer read the front door, tried their file,
and was told it is not a rocket design. Found by this run's desktop cold walk and reproduced against
the code before it was touched.

Both claims corrected, and pinned by `lib/version.test.ts`'s *names no design format the importer does
not actually accept*: every design tool NAMED in an import claim must have its own file extension in
the accept list. It reads the claim by the phrase both copies share rather than by line number, and
bounds the window at the next bullet or the end of the JSX fragment — because the card immediately
after names RocketPy legitimately, as the second solver, and a greedy window would fail on a true
sentence. **Self-maintaining in the useful direction:** the day a SpaceCAD adapter lands and puts its
extension in the accept list, naming SpaceCAD becomes legal on its own. Negative controls on both
sources: restoring either sentence reports *"CHANGELOG.md names rocketpy, whose files are .py"* and
the same for the panel.

**Remaining: increment 3, the repository SETTINGS half**, which is not a file and which no tool
available to a session can edit. Paste-ready description, website and topics are in `OWNER-NOTES.md`
under *Awaiting the owner*. **Do not report `ON-B2` as closed while that half is open.**

**Outcome.** Someone arriving from a forum link reads a landing page that describes the tool that
exists today.

**Measured 2026-08-08.** `README.md` was last touched 28 commits and ~1,726 insertions ago and now
carries claims the repo disproves: it advertises `.ork` import ALONE while the file input accepts
`.rkt` and `.CDX1` (so a RockSim or RASAero flyer concludes Loft cannot open their file and leaves);
it calls RockSim and RocketPy *"future"* adapters when both shipped; it omits the parts catalogue,
building from scratch, staging, `.ork` export, sweeps, the 300-flight Monte-Carlo and the RocketPy
cross-check; and it says "two bundled examples" where there are four.

**The durable half is the mechanism, and a milestone that only rewrites prose does not deliver it.**
No gate step reads README content — `check-links.mjs` resolves relative links and never a claim — and
`README.md` is in no session-start list, so it goes stale silently every run. That is what ON-B2 is
actually about.

**Done when** the README *and the app's own copy* describe what ships today, and the claims that can
be mechanically tied to code are ASSERTED against them **in both directions**: the accepted import
extensions against `ImportPanel`'s accept list, the route list against the exported routes, and the
sample count against `public/samples/`. A false claim then fails the build instead of waiting for an
owner to notice.

**The *done when* was widened on 2026-08-11, and the reason is recorded rather than assumed.** As
first written it named `README.md` alone and asserted only that no accepted format was MISSING from
it. Both halves of that turned out to be too narrow on the same day: the false claim that shipped was
in the app's own landing card and changelog rather than in the README, and it was an over-claim rather
than an omission — so the milestone's own outcome, *"someone arriving from a forum link reads a
landing page that describes the tool that exists today"*, was untrue of the page a forum link actually
opens. Widening it is what makes the outcome and the check agree.

**Size.** 3 increments (was 2; the in-app half is increment 2).

**Notes.** The other half — repository description, website link and topics — is a GitHub SETTING, not
a file, and no tool available to a session can edit it. It is parked in `OWNER-NOTES.md` under
*Awaiting the owner* with paste-ready values. Do not report ON-B2 as closed while that half is open.

---

## P11 (from ON-8) — Docs a flyer can navigate, not just read

**Status: SHIPPED 2026-08-09** — both clauses of the *done when* are met and counted on the built
export by `lib/docs-nav.test.ts`. Increment 2 also had to repair increment 1, twice over.

**Increment 2, 2026-08-09 — the prose has a budget, and the check that holds it now runs.**
`DESIGN.md` §3 gained the sibling's measure clause verbatim (45–75 rendered characters, capped in
`rem`, with the `ch` trap named) plus this repo's own chunk: no run between two headings over **800
rendered words**, at least **2.5 headings per thousand**. §11 stopped exempting the methods and
limitations pages, which had put 19,083 of 29,204 words out of reach of the two rules written for
exactly that text. Measured on the export, before → after:

| route | worst run | headings / 1,000 words |
|---|---|---|
| `/docs/limitations` | 3,744w → **732w** | 2.4 → **3.2** |
| `/docs/methods` | 1,784w → **747w** | 1.8 → **3.4** |
| `/docs/validation` | 2,252w → **651w** | 2.8 → **3.8** |

**Two corrections to increment 1, both of which it reported as successes.**

1. **Its pin had never executed.** `lib/docs-nav.test.ts` counts the built export, `/out` is
   gitignored, and `.github/workflows/test.yml` ran `npm test` before `npm run build` — so
   `existsSync(out)` was false on every pull request, all five checks returned early, and the job went
   green having asserted nothing. The workflow builds first now and `docsPages()` throws rather than
   skipping when `CI` is set. Verified both ways.
2. **"32 of 32 headings carry an anchor" counted the wrong denominator.** Measured on the export at
   the commit before this increment: **93 headings, 32 linkable** — 57 `h3` and 4 `h4` carried no id,
   and the claim that the routes have no `h3` was simply false. Chunking with bare `<h3>` would have
   made each route LESS linkable while the run got shorter. `DocsH3` anchors them; the count is
   **120 of 120** now.

`/docs/faq` — 4,712 words under a single `h2` — rendered no contents list at all, because the strip
read `h2` only. It falls back to `h3` where the top level does not divide the page.

**Increment 1 shipped 2026-08-09: every heading is linkable and every route offers a contents list.**
Pinned by `lib/docs-nav.test.ts` — now five cases counting the export, including one asserting no two
headings on a route answer to the same anchor (it caught a real `#tube-fins` collision the moment it
was widened to `h3`) and one holding `/docs/validation#rocketpy`, a URL that was already published and
is therefore a promise — and by `e2e/contrast.spec.ts`'s *every docs route offers a contents list, and
it says where the reader is*, which asserts the RELATIONSHIP (every chip points at a heading that
exists on the page) rather than a hard-coded list that could stop matching.

**The primitive was adopted, not invented, and that is the increment's most useful half.** The
sibling repo shipped `SectionNav` — a pinned strip of in-page links with a you-are-here marker — out
of its own flight report on 2026-08-08, together with `useCurrentSection`, whose docblock records two
bugs already found and fixed in it (measuring against the strip's bottom edge is off by one section,
because the jump margin deliberately parks a heading BELOW the strip; and a short final section can
never reach the reading line, so the bottom of the document has to count as the last section). Loft
was one commit from writing a third copy of that. `DESIGN.md` §5's entry is that repo's, byte-identical.

**The contents list is built from the DOM rather than authored per route**, so a page that gains a
section cannot disagree with its own list — which is the failure `P10` exists to clean up on
`README.md`. It is a client component in a static export: a reader with no JavaScript sees the page
complete and every heading still carries its id, so a link INTO a section keeps working. That is the
right failure for an enhancement.

**Remaining: the prose itself.** `/docs/limitations` is still 11,157 words under three `h2` — one
section break per ~3,700 — including a single 2,800-word unbroken run, and `/docs/methods` is 7,926
under 14 with no `h3` at all. That is increment 2 and it needs `DESIGN.md` to change first: §11 puts
the physics pages out of scope. **Read the sibling's copy before writing that clause — it already has
one**, with the measurement behind it (45–75 rendered characters, and an explicit warning that `ch`
is the wrong unit: 1ch is 11.0 px against a 7.10 px average prose character, so `max-w-prose` renders
about 101 characters per line).

**Outcome.** The six docs routes can be scanned, linked into, and returned to — instead of read
start-to-finish or not at all.

**Measured 2026-08-08 on the built export**, after a first reading wrote this off by eye and the
numbers overturned it: **29,204 words, zero figures, zero code blocks, four tables all on one page,
and one linkable heading in eighty-nine.** `/docs/limitations` carries 11,157 words under three `h2`
— one section break per ~3,700 words — including a single **2,800-word** run of unbroken paragraphs.
`/docs/methods` is the mirror failure: 7,926 words under 14 `h2` and no `h3` at all. The nav is five
route links with no table of contents, no in-page anchors, no next/prev and no search.

**`DESIGN.md` has to change FIRST, and that is not a formality.** §11 explicitly puts *"physics and
method presentation (the methods and limitations pages)"* out of scope — 19,083 of those 29,204 words
— and the file has no measure, line-length or prose-chunking clause anywhere. §4's *"density is the
point… when in doubt, tighten"* currently reads as an argument against this work. So amend §11, add
a long-form clause, in both repos, and only then convert.

**Done when** every heading on every docs route carries an anchor and the route offers a contents
list; no unbroken prose run exceeds the budget the new `DESIGN.md` clause sets; and those two are
COUNTED on the built export by a check, the way §9's other counts are — longest run,
headings-per-thousand-words, and anchor coverage.

**Size.** 3–4 increments.

**Notes.** This is presentation, not content: the physics prose is good and the milestone must not
become a rewrite of it. Note also that the four rendered tables are raw `<table>` elements against
§5's *"every table is `DataTable`"* — real, but a separate finding, and `DataTable` is a client
component while these are static routes, so converting them is a decision rather than a conversion.

---

## P12 (from ON-9) — Samples that show what the tool can actually do

**Status: SHIPPED 2026-08-08/09** — all three increments, and every clause of the *done when* met.
Pinned by `lib/samples.test.ts` (five cases, three with negative controls) and `lib/version.test.ts`'s
count check. Increment 1: **two capabilities that had no example
at all now have one, and the sample list is pinned in both directions.**

`demo-boattail.ork` and `demo-payload-separation.ork` were already generated from committed source,
already loading, and already carrying their own stored results — they were simply absent from
`gen-fixtures.mjs`'s `SAMPLES` set, so they existed as test fixtures nobody could reach. Adding two
strings to a literal took the bundled set from four files / three airframes to six / five, and closed
the two sharpest gaps: **no bundled sample had a transition or boattail, and none had a
non-trapezoidal fin planform**, so a flyer arriving without a design of their own could not see that
Loft handles either.

Pinned by `lib/samples.test.ts`, four cases:

- *offers exactly the files it ships, in both directions* — the import screen's own `SAMPLES` list
  against `public/samples/`. The two directions are asserted separately because they fail
  differently: offered-but-missing is a one-tap button that 404s on a flyer's first minute,
  shipped-but-unoffered is a capability nobody can reach. Negative controls fire on both.
- *ships a design that imports and flies for every one of them* — imported and flown through the same
  path a first tap takes, asserting a resolved motor set and a real apogee.
- *covers the capabilities the set exists to demonstrate, and says which are still uncovered* — the
  covered kinds asserted by name, and the **uncovered** ones asserted as an exact list, so a sample
  added for one of them has to shrink that list in the same commit.
- *records that EVERY sample is still over-stable* — see below.

**Three stale counts fell out of it, which is how the milestone earned its pin.** `README.md` said
"four bundled examples", `/docs/limitations` said "two `.ork` files and one RockSim `.rkt`", and
`/docs/validation` said "the two bundled samples". `lib/version.test.ts`'s count check caught the
first the moment the files landed; the other two were prose nothing asserts, found by grep.

**Increment 2 shipped the same day: a stranger's first flight no longer opens with a caution.**
`OVER_STABLE_CAL` is 3, and before this the whole set measured **3.06 / 3.82 / 4.07 / 4.07 / 4.38
cal** — so every one-tap example Loft offered greeted a stranger with a warning, and increment 1 had
made that six of six rather than four of four. `fixtures/src/demo-stable.ork.xml` is a synthesized
design, not a promoted fixture: derived from the 38 mm trainer and given its own name, component ids
and motor configuration, with the fin set reduced (root 120 → 85 mm, tip 60 → 40, sweep 60 → 40,
semi-span 60 → 33). Found by searching the fin geometry against the solver rather than guessed —
five candidates measured 4.07 / 3.49 / 2.83 / **2.07** / 1.49 cal, and 2.07 was taken because it sits
clear of BOTH warnings rather than near either edge.

Measured through the app's own path: **2.07 cal, 1,214 m apogee, 230 m/s max, 23.3 m/s off a 1.2 m
rail, Mach 0.68 — inside the validated subsonic envelope — 6.6 m/s at the ground, and zero
warnings of any kind.**

The check flipped, and flipping it IS the increment: `lib/samples.test.ts` asserted the in-band count
was **zero** precisely so this could not land quietly, and now asserts it is at least one. It asserts
a BAND rather than the number 2.07 — pinning the figure would fail on any drag or mass change that
moved it by a hundredth, which is a check about the solver wearing a sample's clothes.

**Increment 3 — the `.CDX1` example, and it closes the milestone.** `.CDX1` had been accepted since
the RASAero adapter shipped, the drop zone advertised it, and **no `.CDX1` existed anywhere in the
repo** — not a sample, not a test fixture, not a corpus file. So the only way a RASAero flyer could
learn Loft reads their format was to try it: the *"reachable only by knowing it is there"* tell,
pointed at a whole format.

`fixtures/src/demo-rasaero.CDX1` is hand-authored against the published RASAero II layout, in that
program's own units (inches), naming its motor the way that program names it. Clean-room: the adapter
was written from the format and this is written to the adapter's reading of it. It brings a
**launch lug**, which no other bundled sample had. Measured through the app: **1.92 cal, 1,083 m
apogee, Mach 0.41, no warnings** — and the fin was searched against the solver like the trainer's
(1.33 / 1.92 / 2.18 / 2.25 cal across four candidates; the first draft at 1.33 read as fine and is a
third of a caliber from a low-stability warning).

**The check reads the file input's own `accept` list rather than a list of formats written here**, so
a new adapter fails it the moment its extension is advertised and before anyone can forget the
sample. Negative control: removing the file reports `.cdx1` by name.

**Status was: NOT STARTED.**

**Outcome.** A flyer who arrives without a design file of their own can see the capabilities Loft
actually has.

**Measured 2026-08-08.** `public/samples/` ships four files but only **three airframes** —
`demo-multi-config.ork` differs from `demo-single-deploy.ork` by ids, a motor configuration and a
stored simulation, and by not one line of geometry. Against what the adapter and model support,
**nine capabilities have zero sample coverage**: transitions/boattails, multi-stage, motor clusters,
tube fins, freeform fins, streamers and shock cords, couplers and bulkheads, mass overrides, and
per-configuration recovery. RASAero `.CDX1` is the sharpest: an advertised import format with a
640-line adapter and no example anywhere in the repo, not even as a fixture.

**Start with the two designs that already exist.** `fixtures/demo-boattail.ork` (boattail, elliptical
fins, already carrying a RocketPy cross-check reference) and `fixtures/demo-payload-separation.ork`
(two-stage, separation event, chute on lower-stage separation) are built, loadable, and generated
from committed source — they are simply absent from `gen-fixtures.mjs`'s `SAMPLES` set. That closes
two gaps for the cost of a set literal and the surfaces that list samples.

**And fix the thing the coverage question uncovered: every bundled sample is OVER-STABLE** — 3.06,
3.84, 4.07 and 4.51 cal against `OVER_STABLE_CAL = 3` — so every one-tap example a stranger opens
greets them with a caution. Adding a fourth over-stable design would make that worse.

**Done when** every sample listed above is reachable from the import screen; at least one sample is
inside the stable band so a stranger's first flight is not a caution; a `.CDX1` example exists; and a
check asserts every file in `SAMPLES` is actually served, actually imports, and that the sample count
stated in the docs matches the set — the counts at `/docs/limitations` and `/docs/validation` are
already stale, which is how this milestone earns its pin.

**Size.** 3 increments.

**Notes.** The corpus cannot supply these: 35 real files, 24 of them GPLv3, 3 MIT and 11 with no
explicit licence, against Loft's MIT — so redistribution is out and synthesizing is the answer, which
is what the note argued. Synthesized is also better: a file built to exercise one capability
deliberately beats one that covers it by luck. A demo design is a design, not a flight; any stored
result a Loft-authored file carries names Loft as its source.

---

## P13 (from `OWNER-NOTES.md` *Awaiting the owner*, 2026-08-09) — One design system, one copy, and a check that reads it

**Status: IN PROGRESS** — increments 1–3 of 3 shipped 2026-08-09, and the milestone's *done when*
is met in Loft. **`DESIGN.md` is read by the gate, in three ways.** What is left is widening the
shared span, which the mechanism now makes a routine change rather than a milestone.

**Increment 3, 2026-08-09 — the shared span, held by a digest committed in BOTH repos.**
`add_repo` with `access: "push"` for `nrdptel/fusionspace-debrief` SUCCEEDED this run, which the
previous run recorded as refused and parked on the owner — so the reconciliation was never blocked on
them. With both copies in one session: **12 diff hunks apart, 753 lines against 834, drift in BOTH
directions.** Measured section by section, §4, §6, §7, §8 and §10 were already **byte-identical** —
9,944 bytes — and §5 and §9 are app-specific by nature, because the two apps genuinely ship different
primitives (this repo deleted `Chip`; the sibling defines it). So the span is those five sections,
`lib/design-shared.test.ts` hashes them, and the digest constant is committed in both repos: neither
can read the other at test time, so the constant is the channel. §1, §2, §3 and §11 differ only in
clauses one copy has taken and the other has not, and they are the next to join. **Widening the span
IS what reconciliation means from here** — a routine change, in both repos, in one commit.

**Increment 2, 2026-08-09 — a primitive the vocabulary was missing, found by a check that could
finally see it.** §9's radius grep named ONE literal — the middle radius — so with it reporting 0 the
tree held **seven** off-system radii, and five of the seven were one treatment: a 12x8 px legend
swatch hand-rolled across four files at two different radii, plus three marker dots. `Swatch` is what
it became, at eight call sites across five files, and the off-system radius count is **0** — §2 keeps
its three sanctions and gains no exception. The check enumerates every radius token and subtracts §2's three, and it reads
string literals with comments stripped: run over raw source it read the English word in prose (18 hits
across the docs routes), and run over `class="…"` attributes only — the sibling's approach — it cannot
see a class composed through `cx(…)`, which is how every primitive here writes its own. A second
check catches arbitrary spacing values, which §4 forbids and which the named-step pattern could not
express; the one legitimate case, a device inset, is exempted by naming `env(safe-area-inset-` and is
then asserted to still be there.

**The pre-push review then found five holes in the new checks themselves, and all five are fixed and
pinned.** The scan read `components/` and `app/` only, so `lib/ui-tokens.ts` — which spells the
control radius for every button in the app — could take the forbidden radius with the suite green. The
stylesheet declares radii as VALUES where these match NAMES, so `app/globals.css` contributed nothing
and `.prose-loft code` was sitting at a fifth radius (6 px now, with a value scan holding it).
**And the exception itself was unnecessary**: CSS scales a corner radius to what its edge can hold, so
on a 12x8 px chip every radius at or above 4 px renders as exactly 4 px — the control radius is
pixel-identical there, so the binding document had gained a permanent carve-out, and this suite an
owner-exemption assertion, for zero pixels. Both are gone and the count is 0. An exact count on the
safe-area exemption would have failed a
second legitimate device inset with a message saying the first had been deleted. And `stripComments`
missed a TRAILING `//`, so quoting a class name in a note beside the code turned the gate red — the
very failure that helper was added to end. Nine negative controls across the increment, each firing on
the right assertion.

**Increment 1, 2026-08-09 — the file's own contradictions, and the check that stops the next one.**
Three things this document said about itself were false and nothing could notice, because nothing in
either repo opened it. §5's Controls heading read *"three button weights, and only three"* above four
bullets, over the four keys `lib/ui-tokens.ts` ships — so §1's rule that inventing a new weight is a
change to this file was broken BY the file, in the sentence that governs it. `Select` and
`ClosePanel` shipped, were ratcheted by §9, and were named nowhere in the vocabulary §5 exists to be.
All three are corrected, with the reason kept beside the heading rather than quietly fixed.

`lib/design-doc.test.ts` reads the document now, and the durable half is that **the vocabulary has
one mechanical definition**: §5 is the declaration, `components/ui.tsx` is the module, and the two
directions are asserted separately because they fail for opposite reasons — a primitive that shipped
undeclared, versus a declaration with nothing behind it. Neither direction is a hand-maintained list;
a third list would drift exactly as the first two did. `BUTTON_VARIANT_NAMES` exists so the count is
readable at runtime rather than only by the type system. All four assertions were proved able to fail
by restoring each defect in turn: a fifth variant in code alone, a heading number moved alone, a
declared `Chip` with nothing behind it, and `ClosePanel` removed from §5.

**Outcome.** `DESIGN.md` stops being a binding file that nothing reads and that two repos disagree
about. A session can no longer ship a primitive the file does not declare, declare one it does not
ship, or state a count the code contradicts — because the gate reads the file.

**Why this and not the other two candidates.** The owner named it: `OWNER-NOTES.md`'s *Awaiting the
owner* says a session with both repos writable should spend an increment reconciling the two copies
clause by clause, that **it is a milestone, not a chore, and that it belongs on the P-track**. It is
also the concrete form of the one unclaimed entry in this file's own standing P-order ("the suite as
one product"). The two rejected alternatives are recorded under *Decisions taken without the owner*.

**Measured 2026-08-09, in Loft's own copy, before writing any of this:**

- §5's Controls heading reads **"three button weights, and only three"** and the four bullets under
  it are `primary`, `secondary`, `ghost`, `danger`. `lib/ui-tokens.ts:60`'s `BUTTON_VARIANTS` ships
  those same four. So the file's §2 rule — *"inventing a fourth button weight is a change to this
  file"* — is already broken by the file, in the sentence that governs it.
- §5 declares **15** primitives by name. `components/ui.tsx` exports **17**. `Select` and
  `ClosePanel` ship, are ratcheted, and are named nowhere in §5's vocabulary (only in §9 prose and a
  §5 aside). `DataTable` and `SectionNav` are declared by §5 and live in their own files rather than
  in `components/ui.tsx`, so "the vocabulary" has no single mechanical definition at all.
- **Nothing in the repo reads `DESIGN.md` as a file.** `lib/design-system.test.ts:21` re-encodes §9's
  greps by hand and its own docblock says they are "kept in step with it deliberately" — i.e. by a
  human. It is the only major doc with no assertion behind it, and `P10` already built exactly this
  mechanism for `README.md`, on lower stakes.

**Done when** three things are true, each pinned by a check that fails when it stops being:

1. **The file's own counts match the code.** A test reads `DESIGN.md` and asserts that every key of
   `BUTTON_VARIANTS` has a §5 bullet, and that the number the Controls heading states equals that
   count — so adding a variant without amending the file, or amending the file's number without the
   code, fails the build.
2. **Declares-and-ships agree, both directions, as separate assertions.** Every primitive §5 names
   resolves to a real exported component, and every component the vocabulary ships is named by §5.
   The "vocabulary" gets a single mechanical definition (a named list the test and the components
   both answer to) rather than "whatever `ui.tsx` happens to export".
3. **The shared span of the two repos' copies is identical, and something says so.** A digest of the
   shared span, committed in both, so a change to one that is not made to the other fails rather than
   drifting. The two copies are 11 diff hunks apart today and the drift runs in BOTH directions.

**Size.** 3 increments: (i) fix Loft's copy and land the reader check; (ii) adopt the primitives the
reconciliation imports, at their real call sites, with per-primitive ratchets in the pattern P6 set;
(iii) mirror to the sibling and land the shared digest in both.

**Notes.** Increment (iii) needs write access to `nrdptel/fusionspace-debrief`, which the previous
run was refused by the harness — so **(i) and (ii) are scoped to be complete and pinnable in Loft
alone**, and (iii) is last. Otherwise this repeats `P10`'s failure mode: a milestone stranded
half-done on a permission no session controls. One divergence is a direct contradiction rather than a
gap and needs a decision rather than a merge: the sibling's §5 defines `Chip` and `ChipButton`, and
Loft's copy records `Chip` as deleted on 2026-08-04 with the reason.

---

## P14 — The checks that can only see what they already know

**Status: SHIPPED 2026-08-12** — all three increments landed; increment 1 on 2026-08-11, increments 2
and 3 on 2026-08-12. All three instruments are general rather than enumerative, each pinned by its own
check, and §9 states each in the readable form beside the executable one. The *done when* is met.

**Written 2026-08-11 because the P-track had run dry** — P13 met its *done when*, and P10's remaining
increment is a repository SETTING no session can edit. `MAINTAINING.md` says extending the track IS
the work in that case, so this is that increment plus the first slice of what it named.

**Outcome.** The design system's instruments stop reporting green over the class they were never told
to look for. Every §9 count of 0 means "there are none", not "there are none of the two we listed".

**The measurement that decided it, 2026-08-11.** An audit agent was handed `DESIGN.md` and the
component tree and asked for divergences the EXISTING checks cannot see. All seven §9 greps read at
target — radius 0, off-scale spacing 0, arbitrary spacing 0, off-scale type 0, hand-rolled `<select>`
0, adoption 22/31, card treatments 3 — and the tree still held these:

- **§2 defines exactly two border pairs, says *"Two, deliberately"*, and NOTHING checked it.** Radius,
  spacing, type, `<select>`, chart and focus were all ratcheted; the one token §2 calls the
  readability signal had no instrument at all. Measured when one was finally pointed at it: **8 uses
  of 3 unsanctioned values** — `border-zinc-100` x6, `-400` x1, `-600` x1 — plus one genuinely
  mismatched pair. Six of the eight were ONE treatment: every table body row in the app, from
  `components/DataTable.tsx`, pairing a third light value against the hairline dark, so the same rule
  was a different rung in light than in dark, in the file that draws every table in the product.
- **`lib/design-system.test.ts`'s `DATA_SURFACES` is a hand-typed two-name allowlist**
  (`MassBreakdown`, `DataTable`), so the missing-empty-state ratchet can only ever find the two
  surfaces somebody already fixed — every data surface added since is exempt by construction. Three
  real vanishes it cannot see: `GeometryInspector.tsx:653`, `FlightViz.tsx:38` (a hole where the
  flight path was, against `components/ui.tsx:922`'s rule for `Figure` stating exactly this) and
  `ParameterSweep.tsx:344`, which is the primary surface of `/sweep`.
- **`e2e/touch.spec.ts` counts the `title` ATTRIBUTE, so `HOVER_ONLY_FLOOR = 0` measures the wrong
  thing.** `components/RocketDiagram.tsx` states eleven gestures in SVG `<title>` CHILD elements,
  which render the identical native tooltip a phone cannot reach and have a 0x0 rect the walk skips.
  The ratchet reads green over the one surface §8 was written for.

**This is the same class error §9 already records about itself twice** — the radius grep naming one
literal while seven off-system radii stood, and the spacing grep matching named steps so an arbitrary
value was invisible rather than off-scale. Both were found by pointing a *general* instrument at the
tree. Every item above is that same shape, which is why they are one milestone and not three defects.

**Increment 3 — the hover-only states the touch ratchet could not see, 2026-08-12.** `HOVER_ONLY_FLOOR`
was 0 and had been blind twice over: `e2e/touch.spec.ts` read the `title` ATTRIBUTE, and its
`width === 0 && height === 0` skip discarded an SVG `<title>` CHILD before the attribute test could
run — a `<title>` element has no rect of its own. Both closed: the probe now reads
`:scope > title` on any SVG element and attributes it to the PARENT, which is the thing with a rect
and the thing a flyer would have to hover.

**Pointed at a 390 px coarse pointer it found 4 where the file had predicted eleven, and the
difference is the useful part.** Eleven `<title>` children exist in `components/RocketDiagram.tsx`,
but `showFin` renders only one fin grip at a time on a coarse pointer, so four is what a phone
actually carries: the fin-position grip, the nose-length grip, the body-diameter grip, and the mass
marker naming an internal mass object. **A count predicted from the source and a count measured on
the device are different numbers, and only one of them is the tell.**

**The mass marker was relocated; the three grips were GATED, and the difference between those two
is the judgement in this increment.** The marker's `<title>` carried an internal mass object's name —
real information, nowhere else on the drawing — so it moved onto `role="img"` + `aria-label`, which
reaches assistive tech on every form factor and costs no pixels. The grips' tooltips say *"Drag or
use arrow keys to …"*, and on a coarse pointer that sentence adds nothing the control does not
already show: the glyph drawn on the grip IS the drag arrow, and "use arrow keys" names a device that
is not there. They render only where a pointer can hover them now.

**Relocating those three onto the accessible name was tried first and is the wrong answer twice
over.** A slider's name is announced on every focus AND every value change, so the instruction would
be read out on each arrow key — and it broke `e2e/touch.spec.ts`'s orientation assertion, which keys
grips by their exact `aria-label`. The repo's own precedent covers both cases and this increment used
both halves of it: *where the tooltip carries something real, relocate it; where it restates what is
already visible, drop it.*

The number went **0 → 4 → 0** inside one commit, which is the shape this milestone's notes predicted
and the reason the floor is a ratchet rather than a budget. Pinned by a control: restoring the
`<title>` children takes it back to 3 and fails the assertion by name.

**Increment 2 — the five states, and the two vanishes this file had not found, 2026-08-12.**
`DATA_SURFACES` is gone. A data surface is now DERIVED: **a component that renders one of §5's DATA
containers (`DataTable`, `Figure`, `<table>`), or renders a dataset into one of its general ones
(`Panel`, `<svg>`, `Card as="section"`).** The container is what separates a surface a flyer navigated
to from advice that appeared beside one; without it the check fires on all **eleven** conditional
hints in the tree (the flutter hint, the stability-trim note, the booster descent line, the
service-worker toast). The dataset tell is what stops `<svg>` matching every icon in the app and
`Panel` matching the primitive itself.

**The split between the two kinds is a correction, and it bought two surfaces.** The first draft
demanded a literal `.map(` of all six containers, which exempted by VOCABULARY where the old list
exempted by NAME — the same error one layer down. `RocketpyCrossCheck`'s `Comparison` builds six
solver-comparison rows as an array literal and renders them into a `DataTable`; `MotorSweep` passes
rows straight through. Neither types `.map(` in its own body, so a `return null` added to either would
have shipped green — on the panel whose whole job is Loft-versus-RocketPy figures. Nothing renders a
`DataTable`, a `Figure` or a `<table>` for a single value, so those three need no second tell at all.

**Pointed at the tree it saw 22 surfaces and found 5 vanishes. This file had named 3.** The two it
did not are the increment's argument for itself:

- **`ResultsView.tsx`'s `PhaseTable`** returned null on an empty row set — and its `DataTable`'s
  `empty` copy was already written, already required by the primitive, and provably unreachable
  behind that guard. A comment beside it said so in as many words. That is the `MassBreakdown` defect
  exactly, still standing, in the file P14 increment 1 had just edited. **And the copy behind the
  guard was wrong**, which is what an unrenderable branch buys: it named a cause — "a design that
  never sheds a stage flies as one" — that produces ONE phase and a one-row table, not an empty one.
  A sentence nobody can see is a sentence nobody re-reads.
- **`RocketDiagram`** returned null on an undrawable outline, which left `/design`'s drawing missing
  under its heading and, on every other route, `AirframeStrip`'s sunken band standing empty with its
  `Airframe` landmark and nothing inside it. `COMPETITION.md` row 31 is about keeping that picture on
  screen, so the surface whose whole point is persistence had the failure mode of showing an empty band.

All five converted. `EmptyState` adoption **1 → 5** (`PhaseTable` needed no new one — the fix was
deleting the guard that made the existing copy unreachable, then correcting the copy). The strip
variant of `RocketDiagram` gets a bare line rather than the card: it is a two-row band inside a
`Card tone="sunken"` that already draws the container, and a card nested in it is the treatment §9's
card count exists to measure.

**Three of the five are DEFENSIVE, not holes a flyer was falling into — and the first draft of this
entry said the opposite.** It sold `RocketDiagram` and `GeometryInspector` as "reachable, not
hypothetical: where a scratch build starts and where R2's deletions can return it." Both halves are
false, and the repo says so plainly: `newDesign()` (`lib/model/starter.ts`) ships a nose cone and a
body tube, and `removalRefusal` (`lib/model/edit.ts`) refuses the removal that would leave a stage
with none — *"This is the only body tube left…, and an airframe needs one."* `ParameterSweep`'s is the
same shape: the panel renders only under `!staged && run.hasPropulsion`, and a design that flies has a
tube whose length is itself an axis. What stays reachable is a malformed import, which is why
`RocketDiagram`'s copy no longer tells anyone to add a part — on two of that branch's three conditions
they already have one. **The conversions are still right** (§5 governs what a surface does when it has
nothing, not how often that happens); the claim about how the app got there was not measured, and an
overstated symptom in this file is what a later session sizes its risk from.

**Two things about the instrument itself, both found by driving it rather than by reading it.**

- **The obvious find-and-blank loop does not terminate, and its bound hid that.** To ask "is this
  `return null` at the component's OWN top level" the nested callback bodies have to be excluded.
  Replacing each with a marker and re-scanning does not work: the marker is still preceded by the
  `=>` that matched it, so the pattern matches its own replacement — `DataTable` blanked the same two
  characters 5,000 times without converging. It was capped at 40 passes, which turned an infinite
  loop into a **silent** one: the cap was reached, the deeper callbacks were never excluded, and two
  `return null`s inside `.map(…)` callbacks were reported as top-level. It is a single brace-matching
  scan now. **A bound that hides non-termination instead of exposing it is worse than no bound.**
- **The first version matched 0 components in 21 files and reported a clean sweep.** `indexOf("{")`
  after a function signature lands on the DESTRUCTURING pattern of `function X({ rocket }: { … })`,
  which is every component in this tree. It is the compliance command that cannot fail, arriving
  inside the fix for compliance commands that cannot fail — the third time §9 has recorded that shape.

**The surface count is a FLOOR, not an exact ratchet, and that is a deliberate departure** from the
rule governing every other count in `lib/design-system.test.ts`. Those count drift, where each unit is
a defect and the target is 0, so an exact number forces an improvement into the same commit as the
work. This one counts how much of the tree the instrument can SEE, where more is better and a falling
number means it has gone blind again. An exact assertion would make deleting a surface a red gate;
a floor makes going blind one.

Pinned by three controls, run and reverted: reintroducing a top-level `return null` fails the check;
the two live `return null`s inside `.map(…)` callbacks keep it green; and a component added to
`components/` **today** that maps rows into a `DataTable` and returns null fails it by name — which is
this increment's *done when*, stated as an executable thing rather than an intention. A second
assertion pins the reader itself: an arrow-function component would be invisible to it rather than
exempt, so `components/` is asserted to declare its components with the `function` keyword.

**Increment 1 — the border tokens, 2026-08-11.** `offSystemBorder` enumerates every `border-zinc-*`
and subtracts §2's four, in the shape the radius check already uses; a second check asserts the two
pairs are used AS pairs, because fixing only the light half of `border-zinc-100 dark:border-zinc-800`
reaches a count of 0 with the rule still a different rung in each theme. All nine divergences
converted: six table and divider rules to the hairline light, the you-are-here chip to the control
pair, and `ServiceWorker`'s toast off a hairline-light/control-dark mismatch. Both counts are **0**.

**The pairing check was noisy first, and that is worth recording.** Scanning by LINE reported five
violations of which three were false: one line carrying two elements' classes, and
`SectionNav.tsx:60`'s `border-zinc-200 … hover:border-zinc-300 … dark:border-zinc-800`, which is the
hairline resting and the control on hover — exactly right. It reads one class string at a time now,
counts only RESTING tokens, and skips any string where the pairing cannot be attributed. A check that
fires wrongly is one somebody disables, so it fires only where the answer is unambiguous; the one it
does report is real.

**Done when** all three instruments above are general rather than enumerative, each pinned by its own
check at 0, and `DESIGN.md` §9 states each in the readable form beside the executable one:

1. **Borders** — every `border-zinc-*` minus §2's four, at 0, plus the pairing assertion. **DONE.**
2. **The five states** — `DATA_SURFACES` derived rather than hand-listed, so a new data surface is in
   scope the day it lands, with the three known vanishes given real empty states. **DONE**, and it
   delivered more than it promised: five vanishes rather than three, 20 surfaces in scope rather than
   2, and the "new surface is in scope the day it lands" half proved by control rather than asserted.
3. **Hover-only states** — the touch walk counts the SVG `<title>` element as well as the attribute,
   and the gestures it then finds are stated somewhere a phone can reach. **DONE.**

**Size.** 3 increments, one per instrument. Each is independently shippable and each lands its own
check, so a run that gets one done has moved a real count.

**Notes.** Increment 3 will move `HOVER_ONLY_FLOOR` off 0 before it can return to 0 — that is the
ratchet working, not a regression, and the number goes up in the same commit that makes the
instrument honest. `MAINTAINING.md`'s rule that a §9 count moving the wrong way is fixed before the
run ends assumes the instrument was already right; say which case it is in the commit message.

---

## P15 — A target is an area, not a height

**Status: SHIPPED 2026-08-13** — all three increments. Every clause of the *done when* is met and
pinned: the width floor is asserted wherever the height floor is on every route the suite walks;
`TOUCH_TARGET`'s docblock states which of the two tokens a control takes and why; and the remaining
width-only failures are zero, with the one deliberate exemption (the skip link) and the one filed gap
(the app-route wordmark, blocked by the chrome ratchet) both named here rather than skipped.

**Written 2026-08-12 because the P-track had run dry again.** P14 shipped, P13 met its *done when*,
and P10's remaining increment is a repository SETTING no session can edit. `MAINTAINING.md` says
extending the track IS the work in that case, so this is that increment plus the first slice of what
it named.

**Outcome.** The 44 px touch contract means an AREA on every control, and the instruments that check
it stop agreeing with each other about a rule neither of them fully states.

**The measurement that decided it, 2026-08-12.** Driven on an iPhone 13 viewport with a real coarse
pointer — which matters, and getting it wrong is recorded below — over eight routes:

- **`TOUCH_TARGET` is `pointer-coarse:min-h-11`. A HEIGHT.** §8 says *"44 px minimum hit target on
  `pointer: coarse`, everywhere"*, and the token every control in the app reaches for promises one
  dimension of it. `TOUCH_TARGET_SQUARE` exists and its docblock scopes itself to a control *"whose
  text is one glyph"* — but a short WORD misses the width floor exactly as a glyph does.
- **And `e2e/touch.spec.ts` measures the same one dimension**, so the two were blind together. The
  footer's *Docs* rendered **33x44** and *v0.9.0* **41x44**, on all **eight** routes — **16 controls**
  that satisfied the token, satisfied the check, and were a third of a target across.
- **80 controls fail one dimension or the other** across those eight routes, of which **16 fail WIDTH
  only** — the population no existing assertion can see. The rest are height failures on surfaces the
  suite does not walk (the brand link at 37x28, the skip link at 32x16, which is visually hidden until
  focused and is a false positive to be excluded rather than fixed).

**The first measurement of this was WRONG, and it is worth recording how.** A probe at a 390 px
viewport with no `hasTouch`/`isMobile` reported **369** under-target elements and **238** controls —
because `pointer-coarse:` does not apply to a fine pointer, so it measured a desktop layout squeezed
into a phone's width. The real number is 80. A probe that does not reproduce the media query the
token is written against is measuring a different app, and this file already records the same class of
error twice about greps reading the wrong text.

**Increment 1 — the footer's two narrow controls, and the assertion that could not see them,
2026-08-12.** Both took `TOUCH_TARGET_SQUARE` with `justify-center`, so the added width grows around
the label rather than stranding it. The footer case now measures BOTH dimensions on the nav row, and
keeps HEIGHT-only on the prose credits — a link inside a sentence carries WCAG's *"inline in a block
of text"* exemption and a wide one is simply a long phrase, so the two are different rules and are
now written as two. Pinned by a control: reverting the *Docs* link to `TOUCH_TARGET` fails the
assertion with `33x44` by name.

**Done when** the width floor is asserted wherever the height floor is, on every route the suite
walks; `TOUCH_TARGET`'s docblock states which of the two tokens a control takes and why; and the
remaining width-only failures are zero, with any deliberate exemption named in this file rather than
skipped.

1. **The footer nav row** — both dimensions asserted, both controls converted. **DONE.**
2. **The header, the import controls and `/design`** — the other three places `touch.spec.ts` counts
   heights, widened to areas, with the brand link and the skip link exempted BY NAME rather than by
   a filter nobody can find. **DONE 2026-08-13**, and it landed one exemption rather than two.

   **The hole was not where increment 1 predicted, and finding that was most of the increment.**
   The prediction was that the three height-only assertions were the gap. Measured on an iPhone 13
   with a real coarse pointer, on all six static routes plus the four workspaces: the width-only
   population those assertions could not see is **zero** — increment 1 drained it — and the two
   controls failing width fail HEIGHT too, so a height check already had standing to catch them and
   did not. The actual gap is a fourth place: `scan()`, the one assertion that measures both
   dimensions, matched `button, input, select, summary, nav[aria-label="Workspace"] a` and **no
   `header a` at all**. The header's four anchors are on every route and were area-measured nowhere.
   `header a` is in that selector now.

   **The brand link is FIXED on the docs routes and EXEMPT on the app, and arriving at that split is
   the part worth reading.** It rendered **37x28** everywhere. The first attempt gave it
   `TOUCH_TARGET_SQUARE` unconditionally, on the reasoning that the 16 px of header depth it costs
   (`/` 96 → 112, `/docs` 76 → 92) fitted inside "49 px of headroom" — a figure taken from a comment
   in `components/SiteHeader.tsx` dated to an older measurement. **It did not fit. `e2e/depth.spec.ts`
   failed on all four workspace routes with the spine at 1071 px against its 1060 px cap.** Measured
   fresh: the baseline spine is **1055 px**, so the real headroom is **5 px**. The comment was not
   wrong on its own date; the chrome grew between them, and quoting it instead of measuring is the
   error — `MAINTAINING.md` names this exact failure and it still happened, which is why the number
   is now annotated at the line that produced it.

   So the split is: **the docs section gets the target; the app is a KNOWN GAP, filed.** It is not an
   exemption and this file does not call it one.

   - **Docs routes — it takes the target.** It is the header's only route back into the app, on all
     six docs routes, and those routes carry no workspace spine, so the 16 px is not metered.
   - **App routes — it stays 37x28, short of `DESIGN.md` §8, because the ratchet refuses the fix.**
     Widening a cap to admit a regression is what a ratchet exists to prevent. The gap is recorded
     here and in `BACKLOG.md` rather than dressed up as a decision.

   **Two justifications for calling the app side EXEMPT were drafted, written into three files as
   measured fact, and both were REFUTED by the pre-push review. They are recorded so that no later
   run re-derives them:**

   1. *"WCAG 2.5.8's Equivalent exception applies, because ← Import another reaches the same place."*
      **False twice over.** `components/LoftApp.tsx`'s router effect runs
      `router.replace(workspacePath(lastWorkspace.current))` whenever a design is open, so `/` bounces
      straight back to the workspace — the wordmark reaches the import screen from nowhere that a
      design is loaded. And `← Import another` is `reset()`: it clears the doc, the edits, the undo
      history and the session. *Equivalent* requires the **same function**, and a destructive reset is
      not the same function as a navigation.
   2. *"2.5.8 is the governing criterion."* **It is not.** 2.5.8 is the 24x24 AA floor, which 37x28
      already clears unaided; the 44 px figure this repo works to is **2.5.5 (AAA)**, as
      `lib/ui-tokens.ts` has always said. Citing 2.5.8 to excuse a 2.5.5 failure is vacuous.

   **The exclusion is keyed `header h1 > a`.** The wordmark is the page heading on the app and is not
   one in the docs section, so this names it without naming its label. The first draft used
   `closest("h1")` across the whole population — which would exempt any future control placed inside
   any heading — replacing a too-narrow filter with a too-wide one.

   **The skip link IS the one true exemption, and it is now an assertion rather than an absence.** It
   is `sr-only` at rest and exempt because the contract is scoped to `pointer: coarse` while this
   control is reachable by Tab and by nothing else. Its case asserts it stays keyboard-only, so the
   exemption fails the day its reason stops being true — a different claim from the old "it is
   offscreen", which would equally have excused a control merely scrolled out of view.

   **Its assertion could not fail, and the review caught that too.** It read
   `toHaveClass(/\bsr-only\b/)`, which also matches the `focus:not-sr-only` in the same attribute
   (`\b` treats the `-` before `sr` as a boundary), so it stayed green with the leading `sr-only`
   deleted — an unfailable check guarding an exemption, one increment after P14, whose entire subject
   is checks that cannot fail. It is `classList.contains("sr-only")` now. A drafted claim that the
   link measures "33x36 focused" was also removed rather than corrected: `focus:not-sr-only:focus`
   sets `padding:0` at a higher specificity than `px-4 py-2`, so the number was never measured and
   could not have been. **That padding collapse is a real defect** — the focused skip bar paints with
   no padding at all — and is filed.

   **The inline-prose rule is now written where a call site will find it**, in `TOUCH_TARGET`'s own
   docblock rather than only in a spec comment: a link inside a sentence carries WCAG 2.5.8's
   "inline in a block of text" exemption, and the suite draws that line by STRUCTURE, never by
   naming controls. `app/docs/page.tsx:46`'s inline *FAQ* link (31x21) is the case that fixed the
   wording — it is prose, not a chip, and padding it would break the sentence it lives in.

   Pinned by a control: reverting the wordmark to a plain inline link fails **two** assertions, the
   header case naming `37x28 "Loft"` and `scan()` on every workspace.
3. **The docs routes** — `SectionNav`'s contents chips render 34 px tall and the suite never visits
   those routes at all, so the count there is unmeasured rather than zero. **DONE 2026-08-13**, and
   the premise was half wrong in a way worth recording: the suite DOES visit the docs routes, and has
   a case called *"the docs section nav is a row of targets, on every docs route"* that reads as
   though they were covered. **It asserts `nav[aria-label="Docs sections"]` — the CROSS-ROUTE list.
   The IN-PAGE contents nav sitting beside it on the same pages, `SectionNav`'s "Jump to a section of
   this page", was measured by nothing at all.** Two navigations on one page, one asserted and one
   invisible.

   Measured on an iPhone 13 with a coarse pointer, over all six docs routes: **57 chips at 34 px**,
   the largest single group of under-target controls left anywhere in the walk, on a `sticky` strip a
   reader taps repeatedly working through a long page. `px-3 py-1.5` at `text-sm` and no touch token.
   They take `TOUCH_TARGET_SQUARE` — standalone controls whose width is a section's name, per the
   rule increment 2 wrote into the token's docblock; the narrowest today is *Drag* at 58 px, so the
   width floor changes nothing yet, which is what a floor is for.

   After: **every under-target control remaining on the six docs routes is inline prose**, which
   carries WCAG's "inline in a block of text" exemption. The new case walks all six — including
   `/docs/changelog`, which the older one does not visit — asserts both dimensions, and asserts its
   own population is above 40, so a nav that stopped rendering could not pass by measuring nothing.
   Pinned by a control: removing the token fails with `/docs: "What Loft is" is 34 px tall`.

**Size.** 3 increments. Each lands its own assertion, so a run that gets one has moved a real count.

**Notes.** Increment 2 will raise counts before it lowers them, exactly as P14's increment 3 did.
That is the ratchet working; the number goes up in the same commit that makes the instrument honest.

---

## P16 — The gate cannot see what the browser actually got

**Status: SHIPPED 2026-08-14** — all three increments, every *done when* clause pinned by a check with
its own negative control.

**Written 2026-08-13 because P15 shipped and the P-track went dry, and because this run produced the
evidence for it rather than an argument for it.** `MAINTAINING.md` says extending the track IS the
work in that case; this is that increment plus the first slice of what it named.

**Outcome.** The gate compares what the app SERVES against what it PROMISED, on the axes where a
green suite currently proves nothing. P14 made three instruments general rather than enumerative;
this milestone is about a different blindness — instruments that read the SOURCE and never the
artifact.

**The measurement that decided it, and it is this run's own failure.** A one-character change in
`components/SiteHeader.tsx` put a class immediately before a `${` interpolation boundary. Tailwind
v4 extracts candidates from raw source text, so it stopped seeing the literal; the header is the
only use of that utility in the tree, so **the rule was never generated and the class shipped in the
served `class` attribute with nothing behind it.** The desktop wordmark dropped from 30 px to 20 px
on every route.

**What passed while that was true:** `npm run lint` (0 errors), `npm test` (1254 tests),
`npm run build` (succeeded), `npm run test:e2e` (268 tests) — including the cases that measure that
exact header, because they run at a phone viewport where the `md:` variant does not apply. It was
found by an agent reading the stylesheet, not by anything in the gate.

**Increment 1 — every served class has a rule, 2026-08-13.** `scripts/check-classes.mjs`, wired into
`postbuild` beside the three checks already there. It collects the class selectors the built
stylesheet DEFINES — scanning selector context only, and unescaping as it reads — then walks every
served document and fails on any class token that is not among them. Collect-then-subtract rather
than escape-each-token-and-grep, so the escaping rules live in one place. Pinned by a control:
restoring the interpolation boundary fails the build with `md:` ... `3xl` named, exit 1.

**Two things it found about itself before it found anything about the app, and both are recorded
because each nearly produced a false result:**

1. **It cried wolf on its first run.** CSS has two escape forms and it handled one. A class may not
   begin with a digit unescaped, so Tailwind writes the app's `2xl` max-width utility with a HEX
   escape terminated by a space; read as literal characters that yields "32", and the script
   confidently reported a rule-less class whose rule was three characters away. A checker that is
   wrong on its first run is worse than no checker.
2. **Naming a class in prose REGENERATES it, and that masked the defect during verification.** Two
   attempts to reproduce the original bug failed, and a correct diagnosis was nearly retracted as
   unreproducible — because the fix's own explanatory comment named the class, and then this
   script's docblock named it again, each quietly recreating the rule whose absence was the bug.
   `MAINTAINING.md` records this hazard for markdown and `app/globals.css` excludes `*.md` and test
   files for it; it applies to every scanned file. **`@source not "../scripts/**"` is added** —
   nothing under `scripts/` renders markup, so none of it can legitimately contribute a utility,
   while all of it describes them at length.

**Increment 2 — a test that has stopped testing, 2026-08-14.** `scripts/check-selectors.mjs`, wired
into `postbuild` between `check-classes` and `check-routes`.

**The increment as this file first worded it could not be built, and the investigation that
established that is worth more than the sentence it corrected.** The wording was "enumerate the names
the suite asserts and check the export carries them". All four workspace routes render `null` on the
server by design — the shell lives in the route group's layout so moving between workspaces does not
unmount a running dispersion — so `out/**/*.html` carries the header, the footer and almost nothing
else. Measured: of the 84 unique (role, name) pairs the suite asserts from literal-name call sites,
**13 resolve in static HTML with the role verified**. A check scoped to served markup would have
reported every selector resolved while seeing about 15% of the app — the exact false all-clear this
milestone is named after, shipped inside the milestone. **`scripts/check-text-gaps.mjs` already had
the answer**: it walks `out/**/*.html` AND `out/_next/static/chunks/**/*.js`, reports the two
separately so they are never added into one misleading total, and gates on the reliable one only.

**So the increment narrowed to the half that can carry a verdict, and it is the half that matters.**
For a name asserted PRESENT, a rename already fails the test loudly — the suite is its own alarm and
a new instrument adds nothing. For a name asserted ABSENT the direction reverses: not finding the
string anywhere in the build proves the assertion **can never fail again**. The suite holds 109
`toHaveCount(0)` and 11 `toBeHidden()` assertions, and **five names in it are asserted ONLY as an
absence** — each one copy edit away from being permanently vacuous, and a vacuous absence assertion
prints identically to a correct one.

**Negative control, run with the rebuild it requires** (the check reads `out/`, so a control without
one proves nothing — the trap `MAINTAINING.md` records): renaming the span at
`components/RocketpyCrossCheck.tsx:276` leaves `npm run build` and all four existing postbuild checks
green, and `npx playwright test e2e/rocketpy-selfhosted.spec.ts` green at **11 passed** — which is the
defect. `check-selectors` exits 1 naming the string and `e2e/rocketpy-selfhosted.spec.ts:235`.
Restored and rebuilt, it is green again.

**Two things it says about itself, because an instrument that overclaims is what this milestone is
about.** It prints the 679 regex and template selector names it CANNOT see rather than counting them
as resolved; and it reports allowlist entries that are doing no work. The first draft carried three
exemptions written from a list of names expected to be unreachable — the script named all three as
idle on its own first run (one is present in the build after all, two are not absence-only), so the
list ships **empty**. An exemption that excuses nothing today is one that will one day excuse a real
defect.

**And increment 1's own script gets the guard it shipped without.** `check-classes.mjs` was the only
one of the five postbuild checks with no examined-nothing guard and no `existsSync`: with an empty
`out/` it printed *"every served class has a rule"* and exited 0, and with no `out/` it threw a raw
`ENOENT` stack. Both fixed, both controlled — empty export now exits 1 naming the four counts, absent
export exits 1 with the sentence its three siblings already use.

**Increment 3 — the rules nobody asked for, 2026-08-14. P16 SHIPPED.** The inverse of increment 1,
inside the same script because it needs the same stylesheet parse: increment 1 asks whether every
served class has a rule, this asks whether every rule has something that asked for it.

**Its first two designs were both wrong, and the pre-push review killed both.** That is the most
useful thing in this increment, because each was wrong in a way that still printed a clean pass.

1. **Substring matching is almost no test at all.** The first version asked whether the class's text
   appeared anywhere in the built output. Measured on the build that shipped it: only **8 of 484**
   defined classes ever appear as a delimited token, so 476 were passing by being embedded in a
   longer name — `left-0` passed on `sm:left-0`, including one this increment's own comment had just
   introduced. Six rules with nothing asking for them survived, 783 bytes, about 70% of what the
   increment claimed to have removed. It now collects TOKENS: the words of every `class` attribute in
   the markup, and of every quote- or space-delimited run in the shipped JS.
2. **Lexing string literals out of minified JS desynchronises.** The token collector's first form
   scanned for quoted literals; minified English prose carries apostrophes, so a stray one opened a
   bogus single-quoted match that swallowed everything to the next apostrophe. It reported `pr-4`,
   `ring-1` and `text-right` as unused while `,!s&&"pr-4",` sat in a chunk. Splitting on quote and
   whitespace boundaries cannot desynchronise, and is what it does.

**Then the honest version found something better than a defect: a limit.** With real token matching,
11 rules had nothing asking for them — and ten were ordinary English words. `container`, `transform`,
`shadow`, `outline`, `invert`, `grow`, `shrink`, `collapse`, `invisible`, `isolate`, every one
generated by a sentence that had to say "the container", "a transform", "shadow another". **No
wording avoids those**, so gating on them would buy a few hundred bytes at the price of prose nobody
can write, and a check that forces that gets disabled — which is worse than one honest about its
reach. So the script splits the population the way `check-text-gaps.mjs` splits its two detectors: a
class carrying a digit, hyphen, colon, bracket or slash is a namespaced utility that reaches prose
only when somebody wrote it, and **that half gates**; a bare lowercase word is printed as a lead and
does not. The output names both counts and lists the leads, so the reach is stated rather than
implied.

**What it caught on the way.** Four of the pre-fix orphans were OFF-SYSTEM RADII — `DESIGN.md` §2
sanctions three — regenerated by the prose in `components/ui.tsx` explaining which off-system radii
had been *removed*. §9's radius grep reads source string literals, so it read **0** while the rules
shipped. That is the third distinct shape of §9 blindness this file records, after the `.eqn` radius
and the docs' font sizes.

**And a hole in the `@source not` list that had been there since the list was written.** The globs
exclude `*.test.ts` and `*.test.tsx`; Playwright names its files `*.spec.ts`, so the entire e2e suite
was scanned. `@source not "../e2e/**"` is there now, on the argument already used for `scripts/`:
nothing under `e2e/` renders markup. Of the rules it removed, `p-12` is the one that cleanly traces
to a spec comment. **An exclusion list is an enumeration, and this one was right about the class of
file and wrong about its extension for its whole life.**

**Measured, not asserted.** Stylesheet **64,804 → 63,670 bytes**, defined selectors **500 → 483** —
1,134 bytes of rules nothing asked for, on top of the 2,617 `MAINTAINING.md` records from
2026-08-08. Eight comment blocks across five files now DESCRIBE the class instead of writing it,
which is the practice P16 increment 1 wrote down and which nothing enforced until now.

**Two negative controls, both against the final design.** Writing two radius literals back into one
docblock regenerates both rules and fails the build naming both, 485 selectors against 483, exit 1.
Writing three bare English words into the same docblock does NOT fail it — exit 0, 483 selectors —
which is the half that had to be proved too, because a check that gated on those would be unusable
rather than strict.

**Ordering matters and the first draft got it backwards**: the orphan report now runs AFTER the
served-class verdict, because a build with both defects was printing only the dead bytes and hiding
the class-with-no-rule, which is the visible pixel regression the whole milestone exists for.

**Done when** the gate fails on a served class with no rule (**done**); on a test selector the app can
no longer satisfy (**done**, for the absence-only population, which is the half where a missing string
is a verdict rather than a lead); and on a stylesheet rule
generated from prose rather than from a component (**done for the parameterised half, which is
where every case that has bitten this repo lives; the bare-English-word half is printed as a lead and
deliberately not gated, for the reason in increment 3**). **All three clauses met — P16 is SHIPPED,
with that limit stated rather than glossed.**

2. **Selectors that no longer resolve.** The suite is full of `getByRole(… { name })` and `#id`
   selectors; a renamed label makes a case pass by matching nothing wherever the assertion is a
   count-or-absence. Enumerate the names the suite asserts and check the export carries them.
3. **Rules generated from prose.** The inverse of increment 1: a class in the stylesheet that no
   component asks for. `MAINTAINING.md` records 2,617 bytes of exactly this, removed on 2026-08-08
   by the `@source not` globs, with no check to stop it returning.

**Size.** 3 increments. Each lands its own check and its own control.

**Notes.** Increment 1 asserts a count of 6,163 class uses against 500 selectors; those numbers are
printed rather than asserted, deliberately — the check's claim is "none missing", and pinning the
totals would make every legitimate utility addition a failure.

---

## P17 — The shell survives every navigation, including the ones it does not own

**Status: IN PROGRESS** — increment 2 shipped 2026-08-17. Increment 1 shipped 2026-08-14 on the
second attempt; that first attempt's withdrawal, and the seven requirements it left, are recorded
below the increment entries.

**Increment 2 — the finished Monte-Carlo survives the docs link, 2026-08-17.** 300 flights lived in a
plain `useState`, so following one of the docs links the app plants *beside those very numbers* threw
the whole run away and coming back re-flew it. It is now filed in its own `localStorage` slot when the
run completes, and restored only under the exact identity of the run that produced it.

**Two measurements decided the shape, and both argued against the obvious design.**

1. **It is NOT in `SavedSession`, because that record is written once per keystroke.** Measured on the
   38 mm sample: a finished 300-flight result is **78,649 bytes of JSON, 77,619 of it the samples**
   (the summary alone is 1,030). Putting it in the session record would add a 77 KB synchronous
   `JSON.stringify` and `setItem` to every edit, on the main thread, on the phone §8 is written for —
   and would put a derived cache inside the one record whose quota path is already choosing what to
   sacrifice to keep the flyer's rocket. So: its own slot, written once, and losing it costs the run
   and nothing else.
2. **The staleness key could not be built from what the panel already had, and that was a wrong
   number rather than a missed cache.** `designKey`'s leading field is `loadId` — a `useState(0)`
   counter bumped once per load — and `conditionsKey`'s trailing field is `weatherSerial`, the same
   shape. Both restart at zero on the remount that a stored result exists to survive. So a stored
   cloud would never match under a forecast, and *two different designs, or two different forecasts,
   can stamp identical keys after a remount* — a dispersion flown through one day's air restored as
   another's, on the surface a flyer sizes a recovery area from. Both halves are content-addressed
   now: `designFingerprint` (name + byte length + an FNV-1a hash of the bytes) and the forecast's own
   fetch time, which the session already carries through a resume unchanged.

**What is stored is argued from the SHAPE of the object, which is what increment 1's withdrawal
demanded.** `MonteCarloResult` is plain numbers and booleans to every leaf — no class instance, no
closure, nothing to derive back. Its one JSON hazard is `NaN`, which this file's own contract uses as
the withheld sentinel for drift, landing speed, landing energy and the recovery radius when nothing
landed. Measured: an ordinary run has **2,739 leaves and round-trips with none changed**, so the
normal case would never reveal it; a run in which nothing landed has **39 leaves and loses 29 to
`null`**. `rehydrateResult` reads `null` back as `NaN`, and refuses the record outright if any count
disagrees with the samples backing it — `landedN` is what four of the six figures are withheld on, so
a record claiming a landing it does not carry would publish a drift band computed from nothing.

**A control corrected the claim before it shipped.** `plainResult` was first described as what carries
the sentinel; it is not. `JSON.stringify` already writes `NaN` as `null`, so the reader is the whole
of the fix, and the test now feeds the reader naive bytes to prove it. `plainResult` is kept for what
it actually does — the field-by-field write discipline `readSlot` applies to the session record, so a
field this type grows later that is not plain data is dropped loudly rather than smuggled through.

**Pinned by `e2e/smoke.spec.ts`'s *a finished Monte-Carlo survives the docs link the app plants beside
it***. The pin is that the panel comes back **open and populated with no Run click**: the seed is
fixed, so a re-fly reproduces the identical cloud and the numbers alone cannot tell a restore from a
re-run — but a panel that re-flew would have had to be opened first, and it used to come back closed.
Control: run against the build that predates the change and it fails with *"the dispersion did not
survive the docs link"*.

**Still open from the milestone's list:** the RocketPy run (increment 3), bounding the session record
by BYTES rather than step count, the per-keystroke write cost, and `reset()` discarding the undo
stack. A restored cloud carries no "restored" marker on any of its three surfaces, which is
deliberate — the key guarantees it is this run's answer, not a stale one — and the stored `at` is
written but never read.

**Increment 1 — the undo stack survives the docs link, 2026-08-14.** `SavedSession` carries the stack
beside the bytes it belongs to; `loadDoc` replays it on a RESUME only, so a fresh load still starts
clean and one design's past can never land on another.

**The rebuild's whole content is the thing that sank the first attempt: what in a step is DATA.** A
step's state is the app's `WhatIf` — edits, scenario, sim index, and the live `WeatherConditions`.
Those conditions turned out to be **eleven fields of data plus exactly two things that are functions
OF them**: `atmosphere`, an `Atmosphere` class instance, and `windProfile`, a closure.
`JSON.stringify` drops both silently, the stored record still looks right, and the throw lands inside
the solver on replay.

**So the derivation was extracted rather than the weather dropped.** `lib/weather.ts` now exports
`deriveConditions(plain)` — lifted out of `parseForecast`, which calls it, so there is ONE definition
of what the wind does between two reported levels — and `rehydrateConditions(unknown)`, which
validates a stored record field by field and rebuilds the two derived members. Nothing is lost: a
restored step flies the same air it was taken in. The alternative considered and rejected was storing
steps with `weather: null`, which is smaller and quietly changes the flight a step restores to — a
wrong number, which this repo ranks above the convenience.

**Pinned at both layers, each with a control run against the final diff:**

- `lib/weather.test.ts` — a JSON round trip loses both members (asserted on BEHAVIOUR: the dead object
  still has an `atmosphere` property of type object, which is what made this easy to miss), and
  rehydrating gives back identical density and identical wind at five altitudes to 12 places. A third
  case refuses a malformed record, including one malformed LEVEL — which would not crash, it would
  make the wind `NaN` in the two bands that level bounds, and mis-fire the surface-wind guard as well
  if it is the lowest. A fourth pins the SORT, which moved into `deriveConditions` from
  `parseForecast`: the profile walks ascending pairs, so an unsorted array reads the surface wind
  where it should interpolate — silently, with no throw. The invariant now lives in the one function
  that requires it rather than in the one caller that happened to hold it.
- `lib/session.test.ts` — a stack whose step carries live conditions survives the store and still
  flies; the write side strips the derived members from every step; and malformed shapes are refused
  all-or-nothing while the rest of the session still comes back. Controls: removing the rehydration
  fails the round-trip case, and not stripping on write fails the write-side one.
- `e2e/smoke.spec.ts` — *a docs link the app itself planted does not throw the undo stack away*.
  Three edits on `/design`, out through the app's own **"where it's weak"** link, back, then all three
  undone in order. **It clicks the link rather than navigating to the URL**, which is the difference
  from the withdrawn version: a `page.goto` passes unchanged if the link is deleted, so it pinned the
  navigation and not the affordance. Control: not replaying the stack fails it with *"the undo stack
  did not survive the docs link"*.

**`writeSlot` drops the stack, not the design, when the record will not fit.** `MAX_BYTES` is measured
against the design alone and cannot see the stack, so the quota path retries without it — losing a
flyer's rocket because the app was trying to remember how to undo it would be a feature making them
worse off.

**Two things the opening fan-out caught in this increment before it shipped, both folded in:**

1. **The present and the stack disagreed about what air was being flown.** `loadDoc` restored the
   stack and then set `weather` to null and `scenario` to *design* unconditionally, so a resume could
   leave steps taken under a forecast sitting above a present that had none — one undo would jump
   into weather the flyer could not otherwise get back, and one redo would lose it again. The present
   conditions now travel with the stack, stored and rebuilt the same way, so the two halves are one
   state. A fresh load still starts on design conditions.
2. **Storing live conditions wrote the dead class into the record.** `Atmosphere`'s own fields are
   enumerable, so `JSON.stringify` faithfully emits its layer table — bytes that cannot be called and
   that the reader ignores — and because one fetch is shared by reference across every step that
   followed it, the same blob was written once per step. `plainConditions` is the write-side
   counterpart of `rehydrateConditions`, applied to the present and to every step, so the only form
   that ever reaches storage is the one that can be read back.

**And three more the pre-push review caught, all in this increment's own work:**

- **`readStep` guarded the field that had broken before and passed the other three through.** The
  conditions are the tempting field to guard alone; the failure MODE is what matters, and it is the
  same for all of them — the apply throws, `applyWhatIfState` returns false, and a step that fails to
  apply is not consumed, so the control stays lit over a stack nothing can walk. A step whose `edits`
  is a string jams it exactly as a dead atmosphere does. Every field is validated now.
- **Nothing capped the stack on READ.** The reducer caps writes at `HISTORY_DEPTH`; a hand-edited or
  foreign record of any length was accepted whole. The bound belongs on both sides of the boundary.
- **A restored forecast had no age, and nothing on screen would reveal a stale one.** The Conditions
  panel prints `aloftTime` as the hour alone — `18:00 local`, no date — so a profile restored from a
  previous day reads exactly like this evening's, and this file's own measurement puts an unmatched
  profile up to **154° apart** from the actual hour. Stored conditions now carry `weatherAt` and are
  restored only while they are still this hour's; when they expire they go, and so does the stack
  **if and only if** its steps were taken under them. The ordinary session never fetches a forecast
  and its stack is untouched.

**Still open from the withdrawn attempt's list, and deliberately not folded in:** bounding the record
by BYTES rather than by step count (what landed is a catch-and-retry around whatever the browser's
quota happens to be, which is quota-dependent); the per-keystroke cost of writing it; `reset()` —
*Import another* — still discarding the stack; and closing the restored top step's run so an edit
within the coalescing window cannot merge into it. Each is its own slice.



**Increment 1 was attempted 2026-08-14 and pulled by its own pre-push review.** It persisted the
undo stack in `SavedSession`, replayed it on a resume only, and passed the whole gate — lint clean,
1,261 unit tests, six postbuild checks, its own e2e case green with a working negative control. It
was still wrong, and wrong in the one way this milestone cannot afford.

**`WhatIf.weather` is not serialisable, and the failure is a PERMANENT one-way door.**
`WeatherConditions` carries `atmosphere`, an instance of the `Atmosphere` **class**
(`lib/sim/atmosphere.ts:62`, with a `sample()` method at `:94`), and `windProfile`, a **function**
(`lib/weather.ts:50`). `JSON.stringify` drops the prototype and the function outright — verified
directly: a round trip leaves `atmosphere.sample` as `undefined`, and calling it throws *"is not a
function"*. `lib/sim/simulate.ts:633` calls exactly that. So a step committed while today's weather
was loaded cannot be flown after a restore: `fly` throws, the apply returns false, and **`undoStep`
returns without consuming the step**. The flyer gets raw JavaScript text in the error strip, Undo
stays lit, and every step beneath it is unreachable for good. That is damage-order 1 — a state with
no way back — created by the fix for damage-order 1.

**What the next attempt has to do, all of it measured rather than guessed:**

1. **Persist a step's state WITHOUT `weather`**, or persist a re-derivable descriptor of it rather
   than the live object. Anything holding a class instance or a closure cannot go through
   `localStorage`, and nothing in the type system says so.
2. **Bound the record by BYTES, not by step count.** `HISTORY_DEPTH` caps the stack at 100 steps and
   `MAX_BYTES` is checked against `s.design.length` alone, before the write — so the history is
   unbounded past it. Worst case measured: a 6 KB from-scratch design with 100 steps of a heavily
   built rocket is a **1.85 MB record, 1.82 MB of it history**, while the guard sees 6,000. The cost
   is quadratic in structural edits, because `edits.added` / `moved` / `removedIds` are append-only.
3. **Cost the write.** That record is a synchronous `JSON.stringify` plus a `localStorage.setItem`
   **per keystroke**, on the main thread, on the phone §8 is written for.
4. **Validate every STEP on read, not just that the two lists are arrays.** `undoHistory` reads
   `step.state` straight into `setEdits`, so `past: [1, 2, 3]` jams the stack the same way. The
   withdrawn increment had this fixed and it is worth keeping: all-or-nothing, because dropping only
   the bad steps silently changes what "undo three times" means.
5. **`reset()` — "Import another" — still discards the stack**, and it is the app's one destructive
   act. A stack that survives a docs link but not that link is half a fix.
6. **Drive the actual LINK in the e2e case.** The withdrawn test used `page.goto("/docs/methods")`,
   which is a typed URL: it would have passed unchanged if the in-app link were deleted. Click
   `LoftApp.tsx`'s own `<Link>`.
7. **Close the restored top step's run** — nothing calls `endRun` on resume, so an edit to the same
   field within the coalescing window merges into the restored step and one undo takes back two
   gestures.

**The lesson, which is bigger than this milestone.** A green gate said this was fine: the failure
needs a fetched forecast, an edit, a navigation and an undo, in that order, and no test walks that
sequence. **Persisting a state object is a promise that every field in it is data**, and neither the
type nor the gate checks it. Whatever ships here must be argued from the SHAPE of what is stored,
not from a passing suite.

Written 2026-08-14 because P16 shipped and the P-track went dry, and
`MAINTAINING.md` says extending the track IS the work in that case. Chosen over the other candidates
the run's fan-out produced because it is the only one that ranks 1 on this file's own damage order —
a state a flyer can enter with no way back to the work they had done — and because it is **P2's own
*done when* not holding at a seam P2 never looked at**.

**The measurement that decided it.** `app/(app)/layout.tsx:9-20` states, as the load-bearing reason
for its own shape, that "the imported design, its edits, its undo stack, a running Monte-Carlo and a
RocketPy cross-check all survive a navigation". That is true between the four workspace routes and
**false for `/docs/*`**, which resolves through `app/docs/layout.tsx` — a different layout, so the
route group's layout and `LoftApp` under it unmount. The design itself comes back from the saved
session. Three things do not, because none is persisted:

- the undo/redo stack — `loadDoc` resets it and `saveSession` never writes history;
- a finished Monte-Carlo (`components/MonteCarlo.tsx:136`, plain `useState`) — 300 flights;
- a finished or **running** RocketPy cross-check (`components/RocketpyCrossCheck.tsx:98`), including
  its ~40 MB runtime download, discarded mid-flight with no prompt.

**And the app plants those links directly beside the numbers that raise the question** —
`ResultsView.tsx:613`, `:1191`, `ValidationPanel.tsx:98`, plus the footer strip on all four routes.
So the gesture that destroys the work is the one the product invites. `BACKLOG.md:1877` and `:593`
file the RELOAD variant, which a flyer chooses knowingly; this is a single click on a link Loft put
there.

**Outcome.** Following any in-app link out of a workspace and coming back leaves the flyer's work
where it was. Nothing they cannot re-derive in a second is silently thrown away, and anything that
genuinely cannot be preserved says so before it goes rather than after.

**Done when** a flyer can: make three edits on `/design`, follow a docs link from `/flight`, come
back, and still undo all three; run a Monte-Carlo, read the method that explains it, and come back to
the same dispersion; and start a RocketPy cross-check, leave the page, and either return to it still
running or be told before leaving that it will be discarded. **Pinned by an e2e case per clause** —
the first is the cheapest and is the one that must exist before the milestone is called started.

**Size.** 3–4 increments. Suggested order, smallest first so something lands early:

1. **The undo stack survives.** It is the cheapest of the three and the one a flyer hits every
   session. `lib/session.ts` already persists the design; history is a list of the same shape.
   The open question is a bound — an unbounded history in `localStorage` is its own defect — so
   measure the stack's real size on a heavy edit session before choosing one.
2. **The Monte-Carlo result survives**, or the panel says plainly that leaving discards it. Note the
   counter-argument recorded against the reload variant: re-opening re-flies 300 flights, so
   persisting the RESULT is right where persisting the open/closed flag alone is not.
3. **The RocketPy run.** The hardest, and the only one where "warn before it goes" may be the honest
   answer rather than a weaker version of the fix — a 40 MB download cannot follow the flyer to a
   docs page, and a prompt that says so is not a consolation prize.
4. **Whatever the audit of step 1 turns up about the seam itself.** Two layouts that disagree about
   what survives is a structural fact, not three bugs; if a single shell above both is the right
   answer, it belongs here with its own measurement of what that costs a docs page.

**Notes.** The docs routes must stay readable without mounting the whole app — a docs page is the
one surface a flyer may reach from a search engine with no design loaded, and it is also the lightest
document Loft serves. Any structural answer that makes `/docs` carry `LoftApp` needs to show it did
not cost that.

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

- **2026-08-13 — the wordmark takes the touch target on the docs routes and an exemption on the app,
  rather than one answer everywhere.** P15's increment 2 was written as "the brand link and the skip
  link exempted BY NAME". **Taken: split it by context.** On the docs section the wordmark is the
  only link back into the app — enumerated, not assumed: every `<a href>` on `/docs` and
  `/docs/methods` yields `["/"]` — so it gets `TOUCH_TARGET_SQUARE`, and those routes carry no
  workspace spine to charge the 16 px against. On the app it stays **37x28 and short of `DESIGN.md`
  §8** — recorded as a filed GAP, not an exemption. **Rejected: give it the target everywhere** —
  tried first, and `e2e/depth.spec.ts` refused it: the spine went to **1071 px** against a **1060 px**
  cap on all four workspaces. The headroom is **5 px** (baseline 1055), not the 49 px implied by a
  stale comment this session quoted instead of measuring — the exact failure `MAINTAINING.md` names
  under *Measure, don't remember*. **Rejected: call the app side exempt under WCAG 2.5.8's
  *Equivalent* exception** — drafted, and refuted at pre-push review: `/` bounces back to the open
  workspace via `router.replace`, and **← Import another** is `reset()`, a destructive act rather than
  the same function; 2.5.8 is also the 24x24 AA floor, which 37x28 already clears, where this repo
  works to 2.5.5's 44 px. **Rejected: keep the depth by hanging the target off negative margin** —
  that hand-rolls a treatment to defeat a measurement. Desktop reports `pointer: fine` and is
  untouched at 37x28. Reversing this is one ternary.

- **2026-08-10 — the persistent airframe strip is a DESKTOP affordance, and the phone keeps its
  screens.** Driven at 390x664 the strip put the sweep's first answer 2.13 screens down, past
  `DESIGN.md`'s two-screen rule. **Taken: `hidden sm:block`.** On a phone vertical space is the
  scarce resource and persistent chrome spends it on every route at once; the drawing stays one tap
  away on `/design`, which is the trade the two-screen rule exists to make, and every tool
  `COMPETITION.md` row 31 cites keeps its rocket view in a desktop window. **Rejected: shrink it
  until the phone fits** — the budget was already at 72 px, and below that the drawing stops being
  legible as a rocket, so it would cost the phone its screens AND deliver a smear. **Rejected: ship
  it everywhere and move the phone cap** — that cap guards the two-screen rule, and moving it to
  admit a regression is what a ratchet exists to prevent. The desktop cap DID move (820 → 920), with
  the measurement in `e2e/depth.spec.ts`, because there the strip costs depth the desktop can pay.

- **2026-08-10 — the mass override ships on the PARACHUTE slot first, and sets the canopy's own
  `mass` rather than `overrideMass`.** Two choices, both forced by structure rather than taste.
  **Taken: parachute first.** `aimEditsAt` returns the FIRST matching slot and a green test forbids
  one kind routing to two, so a *universal* per-part override cannot be a peer slot — it needs the
  keyed bag the flat `GeometryEdits` cannot express. Per-slot is what ships today, and the canopy is
  where the demand is: 22 of the corpus's 64 `<overridemass>` elements sit on parachutes, more than
  any other kind. **Rejected: wait for the keyed bag** — it would leave the single most-overridden
  kind unreachable for another run to buy generality nothing yet asks for.
  **Taken: write `Parachute.mass`.** `lib/sim/mass.ts` reads `c.mass` as a canopy's natural weight
  and `overrideMass` only as a later override of it, and the catalogue pick beside this control
  already writes `mass` with `massFrom: "flyer"`. Writing the same field keeps one meaning for it.
  **Rejected: write `overrideMass`** — it would give one surface two ways to say the same thing and
  make "which wins" a question a flyer could ask and Loft could answer badly.

- **2026-08-10 — an assumed flight-log unit is MARKED, not withheld.** A log whose header names no
  unit is read in the flyer's display system, and the comparison built on it can be 3.28x out.
  **Taken: state the assumption at the picker and put a caution on the number naming what it would
  cost.** The flyer may well have the right unit — most flyers read the system their altimeter
  exports — so blanking the figure would withhold a correct number from the majority to protect the
  minority, and the house precedent for a value resting on a default is `descentWhy`'s caution
  beside the descent figures rather than a blanked readout. **Rejected: withhold the delta until
  confirmed** — it is the safer-looking option and it makes the overlay useless on first upload,
  which is the moment it is worth most. **Rejected: refuse the file and demand a unit in the header**
  — Loft does not get to dictate an altimeter's export format. Touching either picker clears its own
  marker, because answering the question is what makes the unit the flyer's rather than Loft's.

- **2026-08-10 — a metric whose event never happened is withheld PER METRIC, not by skipping the
  whole validation report.** `lib/sim/run.ts` already handles two versions of this question by
  skipping the report entirely (no propulsion, ballistic what-if), so matching that would have been
  the consistent-looking choice. **Taken: per metric.** An unlanded flight still has a real apogee,
  max velocity, max Mach and time to apogee; skipping the report throws eight good comparisons away
  to suppress two bad ones, and the panel a flyer opens to ask "can I trust this" would go blank on
  the flights that most need answering. **Rejected: report-level skip** — simpler, one condition,
  and it loses information that is not in question. **Rejected: comparing anyway with a caveat** —
  the withheld figure is not an uncertain measurement, it is the absence of one, and `DESIGN.md` §6
  does not have a treatment for "this number is fictional". The withheld metrics are named under the
  table instead, so the table cannot silently shrink.

- **2026-08-10 — the reason a figure is withheld lives in `lib/sim/withheld.ts`, shared, rather than
  being restated at the second surface.** The wording was a local `const` in `components/ResultsView.tsx`
  whose own docblock said it existed so four readouts "cannot drift apart again" — and the drift that
  followed was a fifth surface that never read it. **Taken: extract the condition and its sentence.**
  A component-local string cannot be shared by `lib/validation/compare.ts`, which must not import a
  React component; putting it in `lib/sim/` next to the summary that defines the sentinels means a
  new surface has to walk past the rule to break it. **Rejected: duplicate the wording** — it is what
  produced this defect. **Rejected: a `withheld` flag on the summary itself** — the summary would then
  carry presentation copy, and the two conditions (`landed`, `deployments`) are already there for a
  consumer to ask.

- **2026-08-09 — the P-track's next milestone is the design-system reconciliation, not the persistent
  airframe strip and not a numeric desktop contract.** The P-track had run dry: P1–P9, P11 and P12 are
  shipped and P10's remaining half is a repository SETTING no session can edit, so `MAINTAINING.md`'s
  rule applies — extend the file rather than fall back to the defect ledger. Three candidates were
  scouted and measured. **Taken: P13.** The owner named it in `OWNER-NOTES.md`'s *Awaiting the owner*
  in as many words ("a milestone, not a chore, and it should go on the P-track"), and it is the
  concrete form of the one unclaimed entry in this file's own standing P-order. It is also the only
  one of the three whose failure is already live and shipping: §5's Controls heading says "three
  button weights, and only three" over four bullets and four shipped variants.
  **Rejected: "the airframe stays on screen"** — `COMPETITION.md` row 31, a real gap (the drawing has
  one mount site, inside one of four workspace panels, so three of four workspaces show numbers and
  no picture) and the cheapest of the three to ship. It loses on precedence, not on merit, and it
  should be the P-track's next pick after P13 unless a note says otherwise. **Rejected: a numeric
  desktop contract in §8** — the app answers every width from 1280 to 2560 with one column, which is
  a genuine tell, but two of §8's three desktop clauses are already met and pinned, and its multi-pane
  half overlaps what R12 is already doing with the component tree. Building both would be two runs
  arguing over the same layout.

- **2026-08-09 — the census de-duplicates comparison rows, and every published figure it moved went
  down.** The rejected option was to leave it and only say so in prose, because R10's own notes
  forbid dropping a case to make a median look better and this improves four figures at once. Taken
  anyway, because the alternative is publishing a number that is arithmetically wrong: fifteen copies
  of one comparison are not fifteen measurements, and a median that says they are is not describing
  the corpus. Three things are what make it safe rather than convenient, and if any of them is ever
  weakened this decision should be reversed: the rule is mechanical and metric-blind (it never asks
  what a row's error is); it drops a row only when the stored value **and** Loft's value both repeat,
  so a genuinely varying disagreement is never touched; and the repeats are published on
  `/docs/validation` with each metric's population rather than netted away. The reversal is one line
  — delete the `counted` guard in the census loop — and the published figures then fail the gate,
  which is exactly how it should behave.

- **2026-08-09 — P8 is un-parked without asking, on a measurement rather than a judgement.** The
  previous run left P8 as a product question for the owner (*does the drawing stay the touch path in
  portrait?*), on the reading that clause 4 of its *done when* was geometrically impossible. Opened
  and measured: it is not impossible, it is mis-stated — the 44 px assert holds on the CROSS-axis
  dimension, which is the full drawing in either orientation, and rotating changes which screen axis
  that is rather than whether it clears. See correction 5 in P8. There was no product decision to
  take, so none was taken; the clause is corrected and the milestone opens on the grips. The option
  rejected was leaving it parked for the owner, which would have cost a run on a question with a
  measurable answer.

- **2026-08-08 — P12 is taken before P8, and the reason is a question P8's own *done when* hides.**
  Strict alternation puts P8 next on the P-track. Its first coherent slice is not small: you cannot
  ship half a rotation, so it is the orientation switch, the drawing, **nine** `FinHandle` grips
  re-based off the screen axis onto the model axis, three consumers of that prop, a pointer-to-value
  mapping written twice, and both tap-column builders — in one change.
  **And clause 4 of its *done when* asks for something the geometry may not permit.** It requires the
  44 px tap assert to "still pass for a real reason" after the columns are rebuilt on the cross axis.
  Today a column is full-diagram-HEIGHT and part-length WIDE, so the assert measures the height and
  trivially passes. Rotated, the column's height becomes the part's LENGTH — and `e2e/touch.spec.ts`
  already records **56 of 150 corpus body parts under 44 px** along it, the narrowest at 0.8 px. No
  arrangement gives twenty stacked parts a 44 px band each inside a 500 px height budget. So the
  honest answer is either that the drawing stops being the touch path in portrait (the parts tree
  already is, for reorder) or that the contract is stated differently for it — **a product decision,
  not an implementation detail**, and one worth making with a whole increment rather than at the end
  of a long one. **Taken:** ship P12's first slice, which is complete and reaches a flyer, and leave
  P8 to open on that question. **Rejected:** starting P8 and shipping the rotation without the touch
  answer, which would have left the phone drawing in a state the suite's own floor says is worse.

- **2026-08-08 — R12's property surface stays LIVE-COMMIT, not transactional.** `COMPETITION.md` row
  39 left this open and row 40 now settles it: OpenRocket's component dialog is transactional — it has
  a Cancel, and a preference for confirming a discard — and Loft's fieldsets commit on every keystroke
  and re-fly the design as you type. **Taken:** keep live-commit. The live re-fly is the thing Loft has
  that the desktop tools do not, and `lib/model/history.test.ts`'s whole-design undo already answers
  "I did not mean that". **Rejected:** a per-component Cancel, which would need a second,
  component-scoped history that could disagree with the global one — two undo stacks over one model is
  a state a flyer can get lost in, which is the failure mode ranked first in `MAINTAINING.md`.

- **2026-08-08 — NO chrome takes a semantic ramp, including the Tip control, and this entry replaces
  one written three hours earlier that said the opposite.** `ON-B1` asks Loft's Tip control to match
  the motor finder's, which is an amber pill; §2 reserves amber for a caveat on a VALUE. The first
  decision was "the note outranks `DESIGN.md`, so amend §2 with one bounded exception and check that
  it stays one" — defensible, and taken with only two of the suite's three tools measured. **Attaching
  the sibling refuted it in one read:** Debrief's `components/KofiButton.tsx` records that its own Tip
  control *used* to be amber and was deliberately changed, for exactly the reason §2 exists. **Taken:**
  the glyph converges, the colour does not, and §2 gains no exception. **Rejected:** the amber, and
  with it the "bounded exception" mechanism — a rule with one sanctioned violation is a rule that
  argues about the second one. **The reversal cost nothing and is the point:** +3,648 bytes of
  stylesheet went back to zero, and the owner's actual ask — a control a flyer recognises from the
  other tool — is delivered by a coffee cup that both siblings already draw.

- **2026-08-08 — R4 is left SHIPPED and un-rewritten, and the drag withdrawal is carried by R12
  instead.** `ON-4` withdrew drag as the authoring gesture, and the note says the roadmap "carries an
  ACTIVE milestone whose *done when* is drag" that the triaging run must re-scope. Measured: that
  milestone is R4, and R4 shipped 2026-07-31. `MAINTAINING.md`'s *"never re-open a milestone marked
  shipped"* therefore applies, so R4 is annotated rather than rewritten and the withdrawal lives in
  R12's notes. **Rejected:** editing R4's *done when* to say "tree" — it would have made a shipped,
  pinned milestone describe work nobody did, and left 484 drop slots asserted by a corpus test that
  no longer matched any stated goal.

- **2026-08-08 — drag is not removed this run, and the eight shipped grips stay.** `ON-4` names two;
  there are eight, all `role="slider"` with arrow-key equivalents, so none is a `DESIGN.md` §8 breach
  and each is a working capability today. The owner's own sequencing ("do not remove until the tree
  can do the same job") is followed literally. **Rejected:** removing the two the note names, which
  would have been an arbitrary two-eighths and would have left a flyer worse off with nothing in
  place of it.

- **2026-08-08 — `ON-10` is REJECTED as a new canonical format, and narrowed to a fidelity
  measurement.** A `loft.json` would be a format only Loft reads, while `.ork` export already exists,
  already round-trips through the real serializer (pinned by `lib/model/id.test.ts`), and opens in
  OpenRocket. **Rejected:** building the new format anyway to satisfy the note literally — it would
  double the surface on which a field can silently fail to survive, for strictly less flyer value.
  What survives is a `COMPETITION.md` row on which model fields `.ork` cannot carry.

- **2026-08-08 — the docs' dark-mode fix is `light-dark()` rather than a duplicated media block.**
  The alternative was to repeat every dark declaration inside `@media (prefers-color-scheme: dark)`,
  which is what the `dark` variant does for utilities. **Rejected** because it doubles eleven rules
  and the duplication is exactly the thing that goes stale; `light-dark()` resolves against the used
  `color-scheme`, which the root already sets per clause. The bare light value is kept as a preceding
  declaration so a browser without `light-dark()` is not made worse off, and the `:where(.dark)`
  rules stay as that browser's explicit-choice path.

- **2026-08-05 — narrowing an airframe below the motor inside it is REFUSED, not clamped, and that
  makes "narrow the body diameter" unavailable on five of the six committed fixtures.** The Sev-1 was
  a body tube typed thinner than its own motor flying to a confident +69% apogee. The fix refuses the
  motor, which routes the whole flight into the existing no-propulsion path.

  **The measurement that makes this a decision rather than a detail:** a real design's motor mount is
  sized to its motor, so on `demo-single-deploy.ork` the bore is 28.0 mm around a 29 mm H128W — real files state a
  nominal mount rather than a machined one, and the veto's 3 mm tolerance is measured from the
  tightest of 132 real motor instances (1.60 mm on `demo-dual-deploy.ork`) — and `applyGeometryEdits` scales
  inner tubes with their host. So ANY narrowing of that airframe, even 5%, takes the mount below the
  motor. Five of six fixtures behave that way; only `demo-quirks.ork` has 10% of headroom.

  **Rejected: clamping the mount at the motor's diameter instead of refusing.** That keeps the
  what-if usable and it is what a flyer probably means — but it silently flies a vehicle whose
  airframe and mount no longer relate, and reports the number as if the design were the one on
  screen. `MAINTAINING.md`'s safety posture asks for a refusal or a bound over a confident number
  from an input that cannot mean anything, and a refusal that names both diameters teaches the flyer
  what is actually in the way. **Also rejected: not scaling inner tubes with the body**, which would
  restore the what-if but is a physics change dressed as a UI fix, and would make a widened airframe
  keep a mount too small for the motor it is meant to accept.

  Cheap to reverse in either direction: the veto is one condition in `lib/sim/setup.ts` and the slack
  is one constant beside it. **Both were got wrong once and the record is the point**: the first
  version compared radii while every sentence about it said diameters, and the second tightened to
  1 mm and made four committed fixtures unflyable. The constant now carries its measurement and a
  check prints the margin.

- **2026-08-03 — the next R milestone is R9 *the descent Loft cannot defend*, not the after-list's
  "multi-solver cross-check as a first-class view".** The after-list names the cross-check next, and
  reordering a queue the owner set is a call I took rather than asked about. The reason is measured:
  P2 already shipped `/validate` as a real route rendering `ValidationPanel`, `DragCrossCheck` and
  `RocketpyCrossCheck`, so a whole milestone for it overstates what is left — while this run's own
  census run puts `groundHitVelocity` at **8.3% median across 94 stored simulations, the worst of ten
  metrics and 2.7x apogee's**, with the coefficient that drives it reachable on no surface in the app.
  **Rejected alternative:** take the after-list in order and file the descent gap as a defect. That
  loses, because it is not a defect — nothing is wrong, a whole input is missing — and the defect
  ledger is exactly where such things go to wait forever. The cross-check remains on the after-list
  and is unharmed by being second.

- **2026-08-03 — "the release" means `CHANGELOG.md`'s newest released version, not a git tag.**
  `git tag` is empty, and cutting this project's first tag is a publishing act that belongs to the
  owner rather than being a side effect of a maintenance run. A static export also cannot ask GitHub
  what the latest release is at request time. So the build-time assertion P5's *done when* asks for is
  that the version the UI renders, the version `package.json` declares and the newest changelog entry
  are one string. **Rejected alternative:** cut a `v0.9.0` tag and assert against it. That publishes
  something on the owner's behalf and would need re-cutting every release by a session, which is worse
  than the check being one comparison narrower. If tagging starts, `scripts/gen-version.mjs` gains one
  more comparison and nothing else changes.

- **2026-08-03 — the version moved 0.1.0 to 0.9.0 rather than 0.2.0 or 1.0.0.** `0.1.0` was the
  scaffold default and had never been touched. 1.0.0 would claim the editor and the physics are done,
  which they are not; anything near 0.1 misrepresents five import formats, a from-scratch staged
  builder, a 2,990-part catalogue, sweeps, Monte-Carlo and two cross-check solvers. **Rejected
  alternative:** leave it at 0.1.0 and let the changelog carry the meaning. That ships a version
  string that is visibly false on the one surface the milestone added it to.

- **2026-08-04 — an edit the solver refuses is DISCARDED, rather than shown with the previous
  flight's numbers or with no numbers at all.** Three options, and the middle one is the one that
  looks right and is not. Keeping the edit and marking the numbers stale means a staleness state on
  every readout on every surface, and `MAINTAINING.md` is explicit that a presentation change has to
  reach all of them. Clearing the run matches what the load path already does beside its own
  `setError` — and would have deleted the design editor, which renders inside the run gate, leaving
  a flyer with a red card and no field to correct the value in: a one-way door, which outranks a
  wrong number. So the change is refused and nothing on screen moves. **What this COSTS:** a flyer
  who types an impossible value sees it revert rather than persist while they think about it. That is
  the idiom `NumberField` already uses for a value that cannot fly, so it is at least consistent.
  Reverse it by giving `ResultsView` a stale flag and threading it through every readout — a real
  improvement, and a much larger change than this was.

- **2026-08-04 — the RockSim landing-speed comparison was changed rather than filed as a
  `knownIssue`.** Moving what a fixture is compared against is close to loosening a tolerance, and
  `MAINTAINING.md` forbids the latter outright, so the distinction matters: this does not widen any
  bound, it stops comparing a vertical speed against a total one. The evidence is that RockSim's
  `<VelocityAtLanding>` is exactly hypot of its own three component tags on 17 of 17 stored
  simulations, so the two numbers were never the same physical quantity. **Rejected alternative:**
  record a `knownIssue` and leave the 25.7% standing. That would have published a Loft accuracy
  figure that is partly an artefact of reading the wrong tag, on the page that claims Loft's
  accuracy. Reverse it by restoring the single `set("groundHitVelocity", "VelocityAtLanding")` line;
  the two cases in `lib/rkt/adapt.test.ts` say what that would mean.

- **2026-08-03 — a picked coupler or centring ring WIDER than its host's bore is accepted, not
  refused.** The length rule refuses, because a shortened part under a vendor's part number is a wrong
  number under a real label; a too-wide one is not mislabelled, it is the flyer's own choice of a part
  that does not fit, and its mass is honestly computed for the part they chose. OpenRocket does not
  refuse it either. **Rejected alternative:** refuse or clamp it. Refusing removes a choice a flyer may
  have a reason for; clamping would invent a size no vendor published. Filed in `BACKLOG.md` with the
  measurement, because it is squarely "an input that accepts a value it cannot physically mean".

- **2026-08-02 — the liftoff mass is WITHHELD when a motor is missing, not relabelled "Dry mass".**
  The Sev-1 fix's first draft relabelled it, on the reasoning that the figure is a correct number
  under a wrong name and a flyer building to a weight still wants it. **Rejected on measurement**,
  in two states it would have been wrong in: on a partial cluster `liftoffMass` is the dry mass plus
  whichever motors happened to resolve — a wrong number under a right label, which is worse than the
  single-motor case the reasoning was built on — and `liftoffMass` is `massAt(0)`, which also carries
  the flyer's what-if nose ballast, so with 50 g of ballast set the strip would have read "Dry mass
  650 g" while `MassBreakdown` and the parts panel both published 600 g for the same design. Three
  surfaces, one label, two numbers. **What this COSTS:** a flyer with an unmatched motor can no
  longer read a mass off the summary strip; they get it from Mass & balance or the parts panel, both
  of which publish the real dry figure and are unaffected. Reverse it by giving the strip a genuine
  dry-mass source (`dryMassProperties`) rather than reusing the flight's loaded figure — which is the
  right fix if the cell is wanted back, and is not a relabel.

- **2026-08-02 — the OVER-stable caution is gated on a complete motor set; the LOW-stability warning
  is deliberately not.** Both read the same figure, and the first draft of the fix gated both.
  **Rejected once measured against the direction of the bias:** a missing motor is missing AFT mass,
  so the CG sits forward and the margin reads high. That makes the over-stable caution a false alarm
  about a vehicle nobody flew — gate it. It makes a LOW reading conservative: if an incomplete build
  still computes under 1 cal, the complete one is lower still, so suppressing that warning adds a
  false negative in the one direction where the number already errs safe. The low branch keeps firing
  and appends the reason the figure is not final. `upper-stage-stability` is ungated for the same
  reason, and additionally because an unresolved LOWER-stage motor has already detached by the time
  that margin is taken. Reverse it by gating both, and accept losing a real warning.

- **The Ko-fi link's destination went to its ACCESSIBLE NAME rather than its visible label
  (2026-08-02).** P4 increment 2 deletes hover-only `title`s, and this one carried the only mention
  of where the link goes — "Ko-fi" appears nowhere else on the surface — so deleting it alone would
  have lost information rather than relocated it. **The rejected option was writing it visibly**
  ("Tip on Ko-fi"), which was tried and MEASURED: it wraps the header on a 390 px phone and took the
  shared chrome from 1011 px to **1074**, past the 1060 px cap that every route's depth is built on,
  failing `e2e/depth.spec.ts` on all four workspace routes. Two contracts collided and the chrome
  ratchet is the harder one — it is a ceiling on every route at once, where the destination of a tip
  link is a nicety. `aria-label="Tip the project on Ko-fi"` reaches assistive tech on every form
  factor, where the `title` reached none on touch, so the change is a strict improvement for the
  users most in need of it and neutral for a sighted touch user. Reverse it by finding the label
  63 px of room, or by naming Ko-fi in the footer where there is space.

- **2026-08-02 — a published accuracy figure was RAISED rather than the gate slackened.**
  `groundHitVelocity`'s census median goes 3.0% → 8.3% because the metric stopped being measured on
  the total ground-frame speed. **Rejected:** keeping the total-speed convention so the median stayed
  at 3.0%. That figure was two errors cancelling — Loft's own descent rate runs low on the openrocket
  files and the wind term ran high — and on the nine stored sims where wind is strong enough that
  they cannot cancel, the vertical figure agrees to 0.68% against 25.27% for the total. Widening
  `CENSUS_SLACK_PCT` was also rejected outright: `MAINTAINING.md` names that as a regression dressed
  as a pass. The page says why the number rose. **Reversing this means reverting the convention, not
  the figure.**

- **2026-08-02 — a `title` is acceptable as a pointer-only convenience, never as the only route.**
  Writing the stability flag's reasoning into the design summary on a coarse pointer put the phone
  chrome past the 1060 px ratchet and `/sweep` back over two screens — §8's depth clause and its
  hover clause were being spent against each other. **Rejected:** keeping the visible line and
  raising the depth ratchet, which would have traded a measured contract for an unmeasured one. The
  reasoning is already written in full by `StabilityTrimHint`/`FlutterFixHint` below the fold, which
  render exactly when a flag is raised, so the tooltip is redundancy rather than the only path. The
  hover-only count treats a tooltip whose words appear nearby as reachable, which is what encodes
  this decision in a check rather than in prose.

- **2026-08-02 — the parts catalogue refuses six upstream entries rather than shipping them.**
  Three material densities that cannot describe matter (`Paper, bulk` at 0.0011 kg/m³ in two files,
  referenced by 18 real parts) and three parts with negative material volume. **Rejected:** shipping
  them and letting the UI cope, which would have put a made-up mass under CG, stability and apogee
  with nothing saying so. Also **rejected:** refusing `ROCKETARIUM.ORC`'s 9,072 kg/m³ "paper" —
  that is a possible density for *something*, and refusing it would mean judging a value against its
  NAME rather than against physics. It is recorded in `THIRD-PARTY-NOTICES.md` and `BACKLOG.md`
  instead. **Reversing any of this is one edit to the bands in `scripts/gen-components.mjs`.**

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
