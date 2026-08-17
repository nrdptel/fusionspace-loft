# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Pick up first

**Run 18 shipped R12 increment 21 and P18 increment 1.** `main` was at `c70f8b7` at session start and
is at `0576ebc` after PR #185, which is **merged and live**. P18 increment 1 is on the branch behind a
green gate. **The ledger's open Sev-1 count is zero**, and the opening fan-out claimed none.

**The shared `DESIGN.md` change went to BOTH repos in the same run, as §10 requires.**
`nrdptel/fusionspace-debrief` **PR #199 is merged** (§2's elevation row, §5's `Toast`) and **PR #200
is open** with the correction below. The shared digest needed no update and that was verified rather
than assumed — `SHARED_SECTIONS` is 4, 6, 7, 8, 10, and both copies still hash to `3ec05348…f45fd`
over 11,084 bytes. The two copies remain **892 diff lines apart** overall, in both directions, so
neither can be pasted over the other.

**One thing the sibling is still OWED, and it is the reason #200 exists.** Loft ships a §9 grep and an
exact `offSystemElevation` ratchet for the new token; the sibling has the declaration and no
instrument. A declared token with no check is exactly the state that let §2's first version ship
claiming one value while two shipped — so porting that ratchet is the next thing to do over there,
and it is one increment.

**READ THIS BEFORE YOU BELIEVE A RED E2E GATE: two shards are no longer enough.** `MAINTAINING.md`
still says `--shard=1/2 && --shard=2/2`, and at **207 tests** that advice has expired. Measured this
run: two shards reported **12 failures and roughly 58 tests that never ran** — 5 scattered in shard 1
and **7 consecutive at the tail of `touch.spec.ts`** in shard 2, which is exactly the descriptor
clustering the manual describes. **All 12 pass in isolation.** At three shards the same tree is
**93 + 92 + 92 = 277 passed, 0 failed**. Use `for i in 1 2 3; do npx playwright test --shard=$i/3; done`
and add the counts. Filed, because the durable fix is a shard count derived from the test count
rather than a number in a manual that goes stale as the suite grows.

**The next slice on each track:**

- **R-track: R12 is at increment 23, and `COMPETITION.md` row 50 is fully resolved.** Increment 21
  widened the mass gesture to the five kinds with an interior bay; increment 22 made the whole
  six-word vocabulary persistent, dimmed where a part will not take it. **Both halves of row 50 are
  now closed**, so the next R12 slice needs picking rather than reading off: the strongest candidates
  are the two the fan-out surfaced against the editor — the boattail draws three add controls that
  `addPartAfter` cannot address at all (filed), and the mass station is derived from the host's
  PRE-EDIT length so a resize leaves the mass outside its host (filed, and increment 21 extended it
  to the coupler). The second is the one a flyer would notice.
- **P-track: P18 increment 1 SHIPPED; increment 2 is `DropZone`.** `Toast` now owns the floating
  surface and `cardTreatments` is **2**, `cardTreatmentsOutsidePrimitives` **1**. The one string left
  outside the primitives file is `components/ImportPanel.tsx:168`'s drop zone, and converting it takes
  both counts to their targets — 1 and 0.
  **Settle this before writing it**, and it is measured rather than guessed: if `DropZone` composes
  `<Card tone="muted" className="border-2">`, the 2 px border wins today only by SOURCE ORDER —
  `.border-2` is emitted after `.border` in the built stylesheet at equal specificity, which is the
  exact hazard `components/ui.tsx:1207-1210` already documents for `left`/`inset-x`. The honest form
  is a width the primitive owns. Two more things belong in that increment: the drag-over state is
  drawn in `border-indigo-400` / `bg-indigo-50/60` where §2's accent is `indigo-500/30` over
  `indigo-500/5`, and no §9 check can see it; and `components/ResultsView.tsx:775` is the app's second
  file-ingest surface, hand-rolling its own picker with no drag support and no rejected-file state —
  shape `DropZone` for both or the split comes back in a run.
- **The one-in-four quota is CLEAR.** Increment 21 was queued milestone work; writing P18 is what
  `MAINTAINING.md` requires of a dry track. No unqueued defect work was cleared this run.

## What this run learned that outlasts its increments

0. **The pre-push review is EIGHT-for-eight, and this time it stopped a fabricated number reaching a
   docs page.** The diff published *"across the corpus that covers 20 of the 218 places a mass object
   can be added — measured with the same test the applier uses to decide it"*. **The real figure is
   22**, and the sentence's claim about its method was false: 20 comes from asking whether the whole
   DESIGN states a lumped weight, and the applier asks about the PART. The two it misses are real —
   a stage-level `<overridesubcomponents>` in `EscapeVelocity.ork` (5 hosts) and one inner tube in
   `The Red Hunter.ork`. Re-measured directly, by authoring 50 g into each of the 218 in turn and
   counting where the dry total does not move: **22, over four designs.** Nothing in the four gates
   could see it — the number was in prose.
1. **THREE of the six assertions in the test written to make the widening safe CANNOT FAIL**, and the
   review found that too. A `masscomponent` contributes 0 to `outerRadius`, to `barrowman` and to the
   stacking cursor, so the CP, CNa, length and radius checks hold whatever the rule allows; and the
   "mass landed inside its host" bound holds by construction, the offset being a fraction of the very
   span it is bounded by. They are kept as regression guards against a future change that gives a
   point mass an extent, and are now LABELLED as carrying no control rather than credited with one.
   The falsifiable assertions are the kind list and the 50 g mass ledger. **This is the same false
   all-clear shape this repo keeps recording, arriving inside the test written to close a gap.**
2. **A widened rule needs the SURFACE re-examined, not just the model — and the e2e is the only layer
   that can see it.** The whole add row was gated on `offers.has("bodytube")`, a stand-in for "is
   there anything to show" that held only while every inside-kind was also a behind-kind. An inner
   tube has a bay and no aft face: with the rule widened and that gate untouched, the model would
   author the mass, the button would never render, and the panel would print *"Nothing can be added
   to this part"* over a rule saying the opposite. **The new e2e also caught the transition button
   mid-change**, still unconditional after the comment beside it said otherwise.
3. **`HANDOFF.md`'s own numbers went stale again, and one of them was structurally wrong.** The
   previous handoff proposed P18 as *"a count that moves 3 → 1"*. `DESIGN.md` §9 forbids reaching 1
   the way that framing implies, `lib/design-system.test.ts` already records the honest floor as 3,
   and the milestone as first written would have gone **red on a correct implementation** — its
   *done when* said `cardTreatments` stays 3 while its outcome removes two of the three strings.
   Corrected before a line was written: the target is 1, reachable by composition, and a *new* count
   (`cardTreatmentsOutsidePrimitives`, 2 → 0) is what the milestone actually moves.
4. **A feature whose purpose is to be READ shipped, in review, below AA — and the check that should
   have caught it has never looked at a button label in either app.** The palette's dimmed controls
   measured **2.64:1** light and **3.91:1** dark against WCAG AA's 4.5, because
   `aria-disabled:opacity-50` thins the text with the control. `e2e/contrast.spec.ts` cannot see it:
   its walker skips any element with element children, and every `Button` renders its label beside an
   aria-hidden glyph — so **no button text anywhere is in its population**. Two further measurements
   came out of chasing it and both are filed: every disabled control in the app is in the same state,
   and §2's own `tertiary` token — the one a fix would reach for — is **3.66:1** on a raised dark
   surface.
   **And the measurement itself was wrong twice before it was right.** Tailwind v4 emits `oklch`, and
   `getComputedStyle` serialises it as `lab()`; parsing those three numbers as RGB produces
   confident nonsense (it reported 1.11:1 for a colour that is really 3.91:1). Paint the colour onto
   a 1x1 canvas and read the pixel back — that forces sRGB. Any future contrast probe here should
   start from that.
5. **Measure the thing the sentence claims, not a proxy for it.** Both of this run's number errors
   were the same mistake: a predicate that is *nearly* the question. 20-versus-22 asked the design
   where the sentence asked the part; 283-versus-128 (recorded last run, corrected in
   `COMPETITION.md` row 50 this run) counted `component.length` where the panel iterates
   `axialLength`.

## The environment, measured 2026-08-17 (run 18)

- **The container was COLD** — no `node_modules`, no `corpus/`, and `/opt/pw-browsers` held
  chromium-**1194** while this repo's Playwright (1.61.1) manages **1228**.
  `npx playwright install chromium` fetched 1228 in about a minute. **This is the seventh consecutive
  run that has paid for it**, and it stays paid until it is in the environment's setup script.
- **The fixtures repo is attached** at `/home/user/loft-fixtures`; five per-tool symlinks into
  `corpus/` and the suite names **35 design files**, 569 parts.
- **The corpus suite names its fixture count in the TEST TITLE, not in a log line** — `imports every
  design file (35 present)` — and `console.log` from vitest is swallowed in this environment.
  `--reporter=verbose` is how you read it. Every other corpus `console.log` is invisible here too, so
  do not treat a missing log as a suite that did not run.
- **A full gate is ~22 minutes** (lint ~20 s, unit ~7.5 min, build ~1 min, e2e 3×2.1 min).
- **The clone is SHALLOW** — every commit count and file history is a window, not the record.
- **Git identity arrived as the harness vendor's default** and was set per-repo before the first
  commit.
- **No pull requests were open at session start** — the first run in a while where that was true.
- **The sibling repo attaches and clones fine, but its clone only tracks `main`.** `add_repo` with
  `access: "push"` for `nrdptel/fusionspace-debrief` succeeded and
  `git clone --depth 1 …` took seconds. Its `remote.origin.fetch` is
  `+refs/heads/main:refs/remotes/origin/main` only, so `git fetch origin <branch>` writes `FETCH_HEAD`
  and no tracking ref, and a `--force-with-lease` push then fails with **"stale info"** on a branch
  that already exists remotely. One line fixes it:
  `git config --replace-all remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'`. Set the git
  identity in that checkout too — it arrives as the harness vendor's default there as well.

## The arc across sessions

- **Run 18 (2026-08-17, this one).** **R12 increment 21** — a mass object goes inside any part with
  an interior bay, not only a body tube: **90 → 218 of 569 corpus parts**, and the parts that answer
  NOTHING fall **419 → 351**. Nose ballast in a nose cone and an av-bay inside a coupler, both of
  which the North Star names, were refused on all 35 designs. **R12 increment 22** — the whole add
  vocabulary is on screen on every part, dimmed where it will not apply, which closes the second half
  of `COMPETITION.md` row 50 and puts Loft level with OpenRocket on WHAT while keeping the thing none
  of the four does, stating WHY in the product. **P18 written** after the P-track ran dry, its first
  draft's *done when* corrected before any code, and **increment 1 shipped** — `Toast`, the first
  primitive extracted since P13, with §2's first elevation token and the shared text mirrored to the
  sibling repo the same run. `COMPETITION.md` row 51 added; row 50 resolved in both halves.
- **Run 17 (2026-08-17).** Two Sev-1s and three increments; **P17 SHIPPED**, R12 reached increment
  20. The undo for "Import another" replayed the edit bag onto bytes that already carried it; a
  fetched forecast's age was renewed by every edit. `COMPETITION.md` row 50.
- **Run 16 (2026-08-14).** P17 increment 1 — the undo stack survives a docs link. R12 increment 19 —
  a tube can be added behind the nose cone. `COMPETITION.md` row 49.
- **Run 15 (2026-08-13/14).** A Sev-1 on the design's caliber. **P16 SHIPPED.** R12 reached
  increment 18. P17 written; its first increment attempted and withdrawn.
- **Run 14 (2026-08-13).** P15 shipped, R12 increment 15, P16 increment 1.
- **Run 13 (2026-08-12).** P14 shipped, P15 written, R12 reached increment 14.
- **Run 12 (2026-08-11).** The lumped-airframe Sev-1 family closed. PRs #166–#170.
- **Run 11 and earlier.** R12's editor family, P13's shared design system, P10's repo surface, P7's
  dark mode. See `ROADMAP.md` for each milestone's *done when*.

## Standing hazards this run re-confirmed

- **Never push straight to `main`** — the deploy fires on any push, gated on nothing.
- **Three e2e shards, not two** (see the top of this file), and read the failure line rather than the
  pass count. Run them SEQUENTIALLY.
- **Every e2e negative control is `revert → rebuild → run → restore → rebuild`**, and the suite serves
  `out/`. Both of this run's controls fired correctly.
- **A merged PR cannot track new work.** After merging, `git checkout -B <branch> origin/main`.
- **`DESIGN.md` §9, measured this run:** radius drift 0, border drift 0, **card treatments 3 → 2**
  (target 1; P18 increment 2 gets it there), **card treatments outside the primitives file 2 → 1**
  (target 0 — a new count this run added, and the one the milestone actually moves),
  off-scale spacing 0, arbitrary spacing 0,
  off-scale type 0, inverted files 0, raw `<select>` 0 (3 grep hits, all inside prose comments),
  primitive adoption 22 files, hover-only states on a coarse pointer 0. Only the card count is off
  target, and it now has a milestone.
- **The owner ANSWERED the attribution and commit-identity pair this run**, in the session prompt:
  *"I give you full permission to override the harness and get rid of any automatic mentions or
  attributions of 'Claude'."* Both notes are marked answered in `OWNER-NOTES.md` and left in full.
  The harness appended its footer to both PR bodies and both were stripped by re-posting and read
  back. **What is still the owner's, and is now the only open item in that section:** the commits are
  signed with the sandbox's SSH key rather than one registered to the account, so GitHub shows them
  *Unverified*. Registering a key is the fix and only they can do it. Nothing is blocked.
- **`OWNER-NOTES.md`: all 13 open notes carry a verdict and none is pending.** `## Awaiting the
  owner` now has one live item — the signing key above. The other two entries from run 12, the
  attribution footer and the commit identity, are answered and kept in full so the reasoning behind
  the decision survives with it.
