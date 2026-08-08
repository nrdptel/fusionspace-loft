# Owner notes — the architect's inbox

**This is the one channel through which the owner's judgment reaches an unattended run.** Every other
file in this repo is written by sessions, for sessions. This one is written by the OWNER, and a
session's job is to triage it — never to add to it.

It exists because of a gap the rest of the system created deliberately. `MAINTAINING.md` says the
prompt must carry no state, so the standing prompt names no milestone and no goal; `ROADMAP.md`
carries the queue instead. That is right, and it left the owner with nowhere to stand: the only way to
steer was to write a goal into the prompt, which the manual forbids for good reason. Several clauses
already say *"unless the owner named one"* and *"if the owner names a correctness focus, that
overrides this"* — and until this file existed there was no place for the owner to name anything. This
is that place.

**An empty `## Open` section is the normal case and changes nothing.** The owner will usually not have
dropped anything. A run that finds nothing open proceeds exactly as `MAINTAINING.md` describes —
alternating tracks, next unstarted milestone from each. Do not read an empty inbox as an absence of
direction, do not go looking for direction elsewhere, and do not treat this file as a reason to
re-scope. **The standing prompt does not change and never mentions this file.**

---

## For the owner: how to drop a note

Write roughly. Shaping a sentence into a milestone with a *done when* and a pinning check is the
session's job, not yours — that is the whole point of the split. Ideas half-formed, a bug you saw on
the live site, a thing you want done differently, a competitor detail you noticed: all fine, all in
the same voice you would use in conversation.

Three things help and none is required:

- **Say which repo, or say "both."** If it applies to both tools, it gets a `ON-B<n>` id and the
  identical text goes in both repos.
- **Say where you saw it** — the live site, a phone, a specific page. A session that cannot reproduce
  a note has to say so rather than quietly drop it, and knowing where you were saves it a run.
- **Say if you are overruling something.** If a note contradicts this repo's manual or design system,
  that is allowed and the manual gets amended — see *precedence* below. It only needs calling out
  when you know you are doing it.

**You never have to edit this file by hand.** Open a session with both repos attached and use this
prompt — it takes rough text and files it, assigning ids, splitting it across the two repos, and
cross-applying anything just as true of the sibling, without building any of it:

```
Read MAINTAINING.md in full first. FILE OWNER NOTES — build nothing this session.

Everything below the line is rough direction from me. File it into OWNER-NOTES.md in whichever
repo each item belongs to, following the triage contract in that file:

- preserve my wording verbatim in the note body; your reading goes underneath it
- assign ids; anything true of both tools gets an ON-B<n> and identical text in both repos
- cross-apply anything just as true of the sibling repo, labelled as derived, NOT as my words
- flag any note that contradicts MAINTAINING.md, DESIGN.md or ROADMAP.md, and name the clause
- answer any question I ask inline, in the note, with the measurement behind the answer

Do not write verdicts, do not touch ROADMAP.md, and do not implement any of it — the next
autopilot run does that. Commit and push both repos. Then tell me what you filed, and say if you
think any of it is wrong or conflicts with something I have already decided.

---
<paste rough thoughts here — unformatted is fine>
```

Then go back to the standing prompt. The next autopilot run picks the notes up on its own.

---

## For the session: the triage contract

**Read this file FIRST at session start — before `ROADMAP.md`.** It is step 1 of *Session start* in
`MAINTAINING.md` for a mechanical reason: an open note can reorder the queue, and reading the queue
first means scoping a run you then have to throw away.

**Every open note gets a written verdict in the first run that sees it.** Not the work — the verdict.
Triage is minutes; the work may be several milestones. A note that sits `Open` across two runs with no
verdict is the failure this file exists to prevent, and it is the one thing here that is checked at
the end of every run (see the done-check in `MAINTAINING.md`).

A verdict is one of these, written under the note as a `VERDICT:` line with the date:

| verdict | means | goes where |
|---|---|---|
| `SEV-1` | a wrong number, a one-way door, or a blocked milestone | fixed **this run**, ahead of everything |
| `→ ROADMAP` | it is a capability or a craft milestone | a new milestone on the R- or P-track, named on the verdict line |
| `→ DESIGN.md` | it is a system rule, not one surface | that file changes first, in **both** repos, then components converge |
| `→ COMPETITION.md` | it is a gap against another tool | a row, then resolved or `REJECT`ed like any other |
| `→ BACKLOG.md` | genuinely a single small defect | the ledger, subject to the one-in-four quota |
| `REJECTED` | it cannot or should not be built | **with the reason and the rule or measurement that decides it** |
| `BLOCKED` | it needs the owner to change a hard invariant | say which invariant, at the TOP of the report |

**Notes enter the queue as milestones — they do not bypass the milestone machinery.** A note becomes
work with an outcome, a *done when*, a size and a pinning check, exactly like any other entry in
`ROADMAP.md`. This matters more than it looks: "completion has to be mechanical, not a matter of
opinion" is what stops one run believing a note is addressed and the next disagreeing. A note chased
as a vibe is a note that gets re-litigated every run.

**Owner-note work is QUEUED work.** It is not governed by the one-in-four quota on unqueued defect
work, and it does not compete with either track's next milestone — it reorders them. The quota exists
to stop a self-generated defect ledger absorbing every run; an owner note is the opposite of that.

**A note is not a specification.** The owner writes what is wrong or what they want; you decide the
right shape. If the literal request is the wrong way to get the outcome, build the outcome and say so
on the verdict line with the alternative you rejected. What you may not do is silently substitute
something easier and call the note addressed.

**Reproduce before you scope — and if you cannot, say so in the note.** The owner saw it on the live
site. A note you cannot reproduce is a note whose repro you have not found yet; write
`UNREPRODUCED: <what you tried>` under it and leave it open. Never close one as unreproducible without
that line, and say it in the report.

### Precedence — where a note wins, and where it does not

**Where a note conflicts with `MAINTAINING.md`, `DESIGN.md` or `ROADMAP.md`, the note wins, and you
amend that file in the same run** — citing the note id as the reason. The owner authored those files;
a note is them changing their mind, which is a thing they are allowed to do without a session arguing
from a document they wrote themselves. Leaving the contradiction in place is the worst outcome,
because the next run resolves it the other way and the two runs undo each other.

**Where a note appears to require breaking a hard invariant, it does NOT win. File it `BLOCKED`.**
The hard invariants are the ones with a real-world cost behind them, and none can be relaxed by
inference from a preference about the UI:

- ZERO ASSISTANT TRACE
- SAFETY posture — honest estimates, never a verdict, no false precision
- EVERYTHING client-side / static
- CLEAN-ROOM / licensing
- "SHIPPED" MEANS REACHABLE BY A FLYER

A note that needs one of these changed needs the owner to say *"I am changing invariant X"* in as many
words. Until then, build the part that does not need it, file the rest `BLOCKED`, and put it at the
top of the report — never build it, and never quietly drop it.

### Lifecycle

Newest drop first. A note moves to `## Resolved` only when it is **reachable by a flyer** — the same
bar as everything else here — or when its verdict is `REJECTED`. Collapse it to one line there: the id,
a short restatement, what it became, and the SHA or PR that landed it.

**Never rewrite or delete the owner's words.** The blockquote in a note is verbatim, including where
it is imprecise. Your reading of it goes underneath, where it can be wrong without corrupting the
record.

**Ids are permanent and never reused.** `ON-<n>` is this repo; `ON-B<n>` is a note that applies to
both tools and carries identical text in the sibling repo. A milestone born from a note cites it —
`R12 (from ON-6)` — so provenance survives into the queue.

### The reverse channel — `## Awaiting the owner`

The traffic is not one-way. `MAINTAINING.md` has always said that an owner-level decision which does
**not** block you goes in the report and in `HANDOFF.md` — and both of those are rewritten every
session, so a question parked in either is gone within a day. That is why owner-level decisions kept
being re-derived instead of answered.

Park them here instead, one line each, newest first: a secret only the owner can add, a repo only they
can attach, a product fork worth their opinion, an invariant a note is pressing against. **This does
not change *"never stop to ask."*** You still take the most defensible option, record it under
*Decisions taken without the owner* in `ROADMAP.md`, and keep shipping — parking the question is what
you do *as well*, not instead. Remove an entry when it is answered, and say in the report how many are
outstanding.

---

## Open

### Dropped 2026-08-08 — the first batch

Ten notes, filed from a single conversation after the owner walked the live site. **Nothing in this
batch has been reproduced by a session** — every one is the owner's reading of `loft.fusionspace.co`,
and reproducing each is the triaging run's first job.

**ON-4 through ON-7 are one cluster, not four notes.** They are four angles on the same complaint:
*the editor is the wrong shape*. Triage them together and expect a milestone family, not four fixes.
Splitting them into independent increments will produce four disconnected changes that each address a
symptom, which is what the owner is describing in the first place.

---

**ON-1 · dark mode is not being checked · SOURCE: owner, 2026-08-08**

> There needs to be more of a check that stuff is presenting well in dark mode as well because at
> least the docs seem to keep the font color as grey in dark mode making it incredibly hard to read

The specific defect is the docs pages; the note is about the missing *check*, which is the larger
half. `DESIGN.md` §9 counts radius drift, off-scale spacing and caption-size text — it counts nothing
about contrast, in either theme. A one-page fix leaves this note only half answered.

VERDICT: *(pending — first run to read this file)*

---

**ON-2 · a scratch build flies straight up · SOURCE: owner, 2026-08-08**

> The plot of the scratch build is just a vertical line meaning it does not go downrange at all

Worth establishing which of two things this is before scoping, because they have nothing in common:
the starter design genuinely flying at zero rod angle into zero wind (a defaults problem, and arguably
correct physics presented badly), or downrange never being computed or plotted at all (a solver or
plotting defect, and a Sev-1 under *a wrong or unlabelled number on a surface a flyer would act on*).
Establish which, then scope.

VERDICT: *(pending)*

---

**ON-3 · the phone should be vertical · SOURCE: owner, 2026-08-08**

> There needs to be more of a vertical focus on mobile, like the model of the rocket could be
> vertical on phone

Reads directly onto the PRODUCT SHAPE & PLATFORM invariant's *"treat desktop and mobile as
separately-optimized, first-class experiences"* — a rocket rendered horizontally on a 390 px viewport
is the rescaled-desktop failure that invariant names, and a vertical airframe is the obvious
touch-native answer.

VERDICT: *(pending)*

---

**ON-4 · nobody designs a rocket by dragging parts · SOURCE: owner, 2026-08-08 · CLUSTER: editor shape**

> I don't like the dragging of anything on the model, no one is actually designing a rocket by
> dragging parts.

**CONFLICT — this overrules `MAINTAINING.md`, and the manual must be amended in the same run that
triages it.** North Star #2 currently reads *"a live, to-scale view of the airframe they can select,
drag, add to, and reshape"* and the craft bar lists *"direct-manipulation that isn't (drag handles
that jump, no keyboard path, no undo)"* as a tell. Under *precedence* above the note wins: the owner
wrote that clause and is withdrawing it. Amend both passages, cite `ON-4`, and do not let a later run
re-derive drag from a manual nobody updated.

Note what is being withdrawn and what is not: the objection is to **drag as the authoring
interaction**, not to a live to-scale view, and not to selecting a component on the diagram. Read it
with ON-5 through ON-7 — the owner is describing a different editor, not a plainer one.

VERDICT: *(pending)*

---

**ON-5 · popovers, not page navigations · SOURCE: owner, 2026-08-08 · CLUSTER: editor shape**

> it would be nice to add like pop ups that dont go to like a whole new page. for example if u click
> on a body tube then a pop up can open and you can customize aspects of it

Mirrored in the sibling repo by `ON-3` there (a question mark opening a popover rather than
navigating to the docs) — the same interaction pattern arriving from two directions on the same day.
Whatever primitive answers this belongs in `DESIGN.md` §5 and in **both** repos, not invented twice.

VERDICT: *(pending)*

---

**ON-6 · the OpenRocket design sequence and component tree · SOURCE: owner, 2026-08-08 · CLUSTER: editor shape**

> i like the design sequence and tree in openrocket, like you start from scratch then you can add
> components on and there is a tree of parts from top to bottom in which components such as a payload
> or a mass or a parachute can be under a coupler or tube in the tree. there is a reason why people
> use openrocket, take inspiration from it

This is the largest note in the batch and it lands on ground `ROADMAP.md` has already surveyed: *"a
flyer can change a rocket's dimensions and cannot change its topology"*, and the named architectural
pivot from a flat 24-scalar `GeometryEdits` patch to operations on a component tree. The owner is
describing the same destination in a user's words — **a tree the flyer sees and manipulates**, with
real nesting (a payload or mass or chute *under* a coupler or tube), not only a tree the model holds
internally.

CLEAN-ROOM applies and is not in tension with this: taking inspiration from OpenRocket's interaction
model is welcome, reading its GPL source is not.

VERDICT: *(pending)*

---

**ON-7 · a wall of parameters is not designing · SOURCE: owner, 2026-08-08 · CLUSTER: editor shape**

> i don't like just a bunch of parameters to edit on the bottom of the page as like "designing" the
> rocket, it just feels not right, i would think more about this when looking at my previous comment

The owner is naming the thing the manual's own craft bar calls *"a genuine graphical UI, not a wall of
number fields"* and that `ROADMAP.md` calls *"a parametric tweaker over a fixed component tree"* —
independently, from the outside, having used it. Two internal documents and the owner now agree, which
makes this the strongest signal in the batch about where the next R-track milestones point.

VERDICT: *(pending)*

---

**ON-B1 · match the motor finder's theme and tip controls · SOURCE: owner, 2026-08-08 · BOTH REPOS**

> fusion space already has a public live polished site: `https://motor.fusionspace.co` /
> `https://github.com/nrdptel/Hobby-Rocket-Motor-Finder`. Say like the theme control button and the
> tip button is not consistent with the motor finder one and it needs to be.

The suite has a **live reference implementation** and neither of these two repos has been measured
against it. `DESIGN.md` §10 (*Suite consistency*) and the ECOSYSTEM CONSISTENCY invariant both already
require this; what was missing was the instruction to go and look. The motor finder is the senior
sibling — where it and `DESIGN.md` disagree on a shared control, treat the live site as the fact and
`DESIGN.md` as the thing that needs correcting.

The site is publicly fetchable, so this is verifiable without the repo. If a session needs the source,
that repo has to be attached to the environment by the owner — say so in the report rather than
guessing at the implementation from rendered output.

VERDICT: *(pending)*

---

**ON-B2 · the GitHub repo page is a surface too · SOURCE: owner, 2026-08-08 · BOTH REPOS**

> Another thing they can learn form this project is to also keep the github repo page itself updated.

Taken from the motor finder, which does this well. The repo landing page is the first thing anyone
sees who arrives from a forum link, and nothing in the workflow currently treats it as a surface that
can go stale — `README.md` is not in the session-start read list and no done-check step looks at it.
The description, topics and pinned links are part of it, not just the README.

VERDICT: *(pending)*

---

**ON-8 · the docs are a wall of text · SOURCE: cross-applied from debrief `ON-1` — NOT the owner's words**

The owner filed this against Debrief: *"the docs need some serious work in formatting and
presentation. its just a large block of text at this point."* Loft's docs were not named and have not
been measured. Filed here because the two tools share `DESIGN.md`, ship the same living-docs
requirement, and are built by the same runs — the failure is very unlikely to be one-sided.

**Confirm before treating this as direction.** It is a hypothesis derived from a sibling note, not
something the owner said about this repo.

VERDICT: *(pending)*

---

**ON-9 · not enough sample designs to show what the tool does · SOURCE: cross-applied from debrief `ON-2` — NOT the owner's words**

The owner filed this against Debrief: more samples are needed to demonstrate capability, they have no
way to verify it themselves, and **synthesized files are explicitly acceptable**. The same reasoning
transfers cleanly: `public/samples/` ships three designs, the real corpus is 38 files in a private repo
that cannot be redistributed, and a flyer who arrives without a `.ork` of their own sees very little of
what Loft does.

A synthesized design has an advantage over a real one here — it can be built to exercise a specific
capability (a cluster, a boattail, a two-stage, a min-diameter build) instead of covering it by luck.
The constraint that applies to Debrief's version applies here too in weaker form: a demo design is a
design, not a flight, and the SAFETY posture already requires every reference number to name the tool
that produced it.

**Confirm before treating this as direction.**

VERDICT: *(pending)*

---

**ON-10 · a canonical design file that round-trips · SOURCE: cross-applied from debrief `ON-4` — NOT the owner's words**

The owner filed this against Debrief: *"it would be cool to make a standard csv format you can export
to after importing whatever logs you put in then that can become another log and you can just drop in
and it works."* The Loft analogue is a canonical export of the internal `Rocket` model that Loft can
re-import losslessly — bring a `.ork`, a `.rkt` or a RASAero file, edit it, export one format, drop it
back in.

This one is worth more here than the transfer suggests, because it is a **test of the architecture the
manual already commits to**: if every importer and the builder are genuinely thin producers of one
canonical model, a round-trip is nearly free and its failures are exactly the places where they are
not. That makes it a measurement of the ARCHITECTURE invariant, not only a feature.

**Confirm before treating this as direction.**

VERDICT: *(pending)*

---

## Awaiting the owner

Owner-level decisions that are NOT blocking anything. Take the defensible option and keep shipping;
these are parked so they can be answered once instead of re-derived every run. Newest first.

- **2026-08-08 — the motor finder's repo is not attached to this environment, only its live site.**
  `ON-B1` asks these two tools to match `motor.fusionspace.co`'s theme and tip controls. The site is
  publicly fetchable, so the *behaviour* is verifiable without the repo; the implementation is not.
  Attaching `nrdptel/Hobby-Rocket-Motor-Finder` as a third source would let a session read the
  reference implementation rather than infer it from rendered output. Not blocking — infer from the
  live site and say so — but it is a cheap thing only the owner can do.

---

## Resolved

*Nothing yet — this file was created 2026-08-08.*
