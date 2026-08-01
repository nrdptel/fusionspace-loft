# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Read this first

**The sibling repo is still owed three commits, for the FOURTH run running, and it is an OWNER fix.**
`add_repo` for `nrdptel/fusionspace-debrief` was refused by the harness's permission classifier again on
2026-08-01. `DESIGN.md` §10 makes a change to one copy a change to both **in the same run**, so every
wording owed to that file stays unmade rather than creating the divergence the invariant forbids. Three
are now queued, all listed in `BACKLOG.md`:

1. §9's shell block still says `grep -roh '\btext-lg\b'` while the executable check moved past it (P1
   increment 10);
2. §5's "everything below lives in `components/ui.tsx`" now has two documented exceptions —
   `buttonClass` (server components cannot call into a `"use client"` module) and `DataTable` (it needs
   `DownloadCsv`, which imports `Button`, so putting it in `ui.tsx` makes a cycle);
3. a hand-rolled-`<button>` grep, to match the ratchet added 2026-08-01.

None is a divergence in BEHAVIOUR — every count agrees today — but the prose drifts a wording at a
time. **A session created with both repos attached as sources clears all three in one commit each.**

**`BACKLOG.md`'s Sev-1 count is ZERO at the end of this run.** Two were found and both are fixed (see
below). The warning the previous handoff left still stands and was borne out again: a screen that
classifies ledger entries against the Sev-1 criteria *without checking reachability* will produce a
large number and most of it will be wrong. But the converse bit harder this run — **an entry that
asserts "not reachable" without driving it is the more expensive error**, and one had been sitting in
the ledger doing exactly that.

**The queue has two tracks and a run ships from both.** `ROADMAP.md` is the queue; read it first.

| track | state |
|---|---|
| **R — capability** | **R5 — author a staged rocket — IN PROGRESS**, increments 1–3 shipped. One clause of its *done when* is left: "give it its own motor mount and fins" is still INHERITED from the seed rather than authored. That is increment 4. **Its hazard 4 is now CLOSED** — fixed ahead of the increment as a Sev-1, because its "not reachable today" premise was false. |
| **P — product & craft** | **P1 — one design system, adopted — IN PROGRESS**, increments 1–16 shipped. Every §9 count is at target. What is left: the **two hand-rolled tables** (`MotorSweep`, `GeometryInspector`) and **6 hand-rolled `<button>` elements** on the corrected metric. |

## The arc so far

| milestone | state |
|---|---|
| R1 — address components by identity | SHIPPED 2026-07-30 |
| R2 — delete a component, and undo it | SHIPPED 2026-07-30 |
| R3 — add a component | SHIPPED 2026-07-30 |
| R4 — reorder and restack | SHIPPED 2026-07-31 |
| R5 — author a staged rocket | **IN PROGRESS** — inc. 1–3 shipped; one *done when* clause left |
| P1 — one design system, adopted | **IN PROGRESS** — inc. 1–16 shipped; two tables and 6 buttons left |
| P2–P5 | NOT STARTED |

## Shipped this session (2026-08-01)

Baseline before anything changed, all four green: lint 0 errors / 1 warning (the standing `setDraft`
one), **923 unit**, build, **187 e2e** (sharded 94 + 93), corpus **35 design files, 12/12**. Nothing
inherited was red.

| commit | what | state |
|---|---|---|
| `212f8b0` | P1 inc. 15 — fourteen hand-rolled buttons onto `Button`; `square` and the `aria-disabled` treatment added to `buttonClass`; the hand-rolled-`<button>` ratchet P1's *done when* never had | on the branch, in **#97** |
| `4382f3d` | **Sev-1** — a cluster of N no longer multiplies an AIRFRAME tube's mass and inertia, nor a stated mass | on the branch, in **#97** |
| `e923b08` | P1 inc. 16 — the four review findings on `212f8b0`, and the ratchet reworked from file-exclusions to a per-element test | on the branch, in **#97** |
| `b5996b6` | **Sev-1** — the Motor cluster field writes only the mounts its own value describes, and says how many it does not | on the branch, in **#97** |

**Pull request #97 is OPEN against `main` and is where all four sit.** Under SHIPPED-MEANS-REACHABLE
none of this is shipped until it merges. *Re-derive rather than trust this table:*
`git log --oneline origin/main..HEAD` and `mcp list_pull_requests state=open`.

## The two Sev-1s, and the lesson under both

Both are the same mechanism — the motor **cluster count** — and neither needed an authoring gesture to
reach. The "Motor cluster" field has always been offered on every design that has a mount at all
(`LoftApp.tsx`, min 1 max 12). Typing a number was the whole reproduction.

**1. `lib/sim/mass.ts` scaled whatever carried the mount.** Correct for an `innertube` — a cluster of
three genuinely is three motor tubes. Wrong for a `bodytube`, which is the airframe: three motors
inside one 50 mm airframe do not make three airframes. Measured, Motors 1 → 3:

| design | dry mass | CG |
|---|---|---|
| `01.One-stage.ork` | +38.7% | +39.7 mm |
| `Parallel booster staging.ork` | +74.1% | +96.7 mm |
| `OR vs RAS Test 1.ork` | +65.9% | +100.0 mm |
| `silsim rocket.ork` | +27.0% | +216.0 mm |

CG is what the static margin is measured from. A third defect sat behind it: **the scale ran after the
`overrideMass` check**, so a part whose weight the design states outright had that figure multiplied
too — 120 g reported as 360 g.

**2. The field read the FIRST mount and wrote EVERY mount.** `Airstart timing.ork` has a `54mm center`
holding 1 beside a `38mm airstart` holding 3; the field read 1 and committing any value flattened the
airstart. Five corpus designs had one edit rewrite two or three mounts. Fixed with the rule the fin
fields already follow (`primaryFinGroupIds` → `primaryMountGroupIds`): a field that reads back off one
part may only write to parts that reading is TRUE of.

**The lesson, and it is the one worth keeping.** `BACKLOG.md` had #1 filed as *"Not reachable today,
and that is the whole reason it is filed rather than fixed: only an inner tube or a minimum-diameter
tube ever carries a mount"*, and `ROADMAP.md`'s R5 hazard 4 repeated it. Both halves were false — **12
of the 35 real designs carry the mount on a `bodytube`**. The claim was made from the type signature
and never driven. One loop over the corpus settles it in a minute and it stood for days saying the
opposite. **When an entry says "not reachable", the cheapest possible next action is to drive it.**

## What else this session learned

**Tailwind v4 will silently generate nothing for an interpolated class.** The fix for the disabled-hover
regression was first written as `` `${NO_HOVER}hover:bg-zinc-50` `` with the prefix hoisted into a
constant. Tailwind scans SOURCE for literal strings, so the utility never appears contiguously and no
rule is emitted — the class ships in the served `class` attribute doing nothing. **Spell variant
prefixes out in full at every site, and grep the built stylesheet after touching that block.** Both
dark clauses matter (`.dark` AND the `prefers-color-scheme` form) — the same pair the print fix learned
about the hard way.

**`not-aria-disabled:` does not cover `disabled`.** `:not([aria-disabled=true])` matches a
`<button disabled>`, and Chromium matches `:hover` on disabled buttons. Gating hover on one of the two
shipped for exactly one commit and made the diagram's zoom −/+ light up with the accent border at the
ends of their range. The gate is `not-disabled:not-aria-disabled:` on both clauses of every variant.

**A `className` cannot re-tint a variant.** The shelf's `×` passed `text-zinc-400` while `ghost` emits
`text-zinc-600`; both are bare single-class selectors and Tailwind emits `text-zinc-400` FIRST, so the
variant wins on source order however the attribute is ordered. It rendered zinc-600 in light mode while
dark kept zinc-400 through ghost's own `dark:` clause — the two themes disagreeing about which half of
a split control is muted. If a variant already sets a property, `className` is not an override.

**A ratchet that excludes FILES excludes more than it means to.** The first hand-rolled-`<button>` check
skipped `components/ui.tsx` and `components/DataTable.tsx` "because a primitive's own button is what
everything converts onto". Only ONE of the four buttons in that pair is that button; `Segmented` and
`Tabs` re-type `buttonClass`'s base line **without the focus-visible ring at all**. Worse, it was
gameable in the direction the milestone is heading: routing the last two tables through `DataTable`
would take the count 3 → 1 with nothing converted onto `Button`. **Exclude by BEHAVIOUR, per element** —
here, "its opening tag takes its class from `buttonClass`".

**Do not defend a check with a lookbehind on punctuation.** The same check first used
`` /(?<!`)<button[\s>]/ `` so a code-fenced mention in prose would not read as a breach. That makes an
exact-count assertion depend on where a backtick sits inside an English sentence — reword the comment to
fence the clause instead of the tag and the suite fails on a comment-only edit. **Strip comments before
counting.** Both behaviours have controls now.

**The per-file caption-inversion guard has no headroom and adoption pushes it the wrong way.** §9 already
records this for the suite-wide ratio; it reproduces at file granularity. Converting
`RocketpyCrossCheck`'s Stop button moved a `text-sm` into `BUTTON_SIZES` and left the file inverted at
6/5 with no glyph changed. It happened to have a genuinely decision-grade sentence to promote, so it was
fixed honestly — **but the next adoption may not.** Filed.

## Running the gate without fooling yourself

Everything under this heading in the previous handoff still holds and was re-confirmed:

- **`npm install` first** on a fresh container, then **`npx playwright install chromium` once** and a
  bare `npx playwright test` — do NOT set `PW_EXECUTABLE_PATH`. `@playwright/test` is 1.61.1 and manages
  **chromium-1228**; the sandbox ships 1194. Confirmed again 2026-08-01: 1228 was absent at session
  start and installed in about a minute through the proxy. **The installer exits 2 even on success** —
  check `/opt/pw-browsers/` for `chromium-1228` rather than trusting the exit code.
- **Shard the e2e**: `npx playwright test --shard=1/2 && npx playwright test --shard=2/2`. 94 + 93 = 187.
- **`pkill -f "<pattern>"` matches the shell running it** and kills your own background job (exit 144).
  Seen twice this session. Use a pattern that cannot match the invoking command line, or skip the kill.
- Record each gate step's own exit code; a `{ … } > file` brace group reports only its last command.
- **`git commit --amend` is blocked by the permission classifier.** Add a second commit.
- **Never revert a negative control with `git checkout -- <file>`.** Copy the file's bytes aside and
  restore from the copy. Used five times this session with no loss.
- **A negative control's BUILD exit is part of the control** — the e2e runs against `out/`.
- `rm -f *-tmp.*` immediately before every gate: eslint lints gitignored root-level probes.
- **A probe under the scratchpad cannot resolve `@playwright/test`.** Put probes in the repo root with a
  `*-tmp.mjs` name (gitignored — check with `git check-ignore -v`) and delete them before the gate.
- Serve the built export for probes with
  `(setsid npx serve -c e2e-serve.json -l 3100 --no-clipboard --no-request-logging < /dev/null &)`.
  **Do not pass `out` as an argument** — `e2e-serve.json` already sets `"public": "out"`.
- **`npx vite-node <file>.mjs` runs a probe that imports `.ts` modules directly.** `node` cannot; the
  `-e` form of `vite-node` does not work either. Write the probe to a `*-tmp.mjs` file.

## Before you trust a sweep

The corpus is gitignored and absent on a fresh container. Both repos are checked out, so no token is
needed — symlink the fixtures repo's per-tool directories into `corpus/`:

```bash
mkdir -p corpus && for d in openrocket rocksim rasaero rocketpy spacecad; do
  ln -sfn /home/user/loft-fixtures/$d corpus/$d; done
npx vitest run lib/corpus --reporter=verbose --silent=false
```

It must print `imports every design file (35 present)`. **Confirmed this session: 35 files, 13/13.**

## Orchestration, measured

**This box has 4 cores, so a workflow's concurrency cap is 2.** An eight-agent fan-out launched at
session start returned **2 results in 45 minutes** and the rest starved — and two agents' transcripts
simply stopped mid-run with nothing recorded in the journal. **Size a fan-out to 4 agents, not 8**, and
harvest anything still in flight after ~30 minutes rather than waiting. The two that did return were
worth the whole exercise: both Sev-1s above came out of one of them.

**The pre-push second opinion earned its keep again and found a regression the full gate could not.**
Four lenses over one diff turned up six things, of which one was a real visual regression I had shipped
(the disabled-hover) and one was a structural hole in the check I had just written (the file
exclusions). 187 e2e tests were green across both. **The gate does not measure hover states or the
meaning of a metric.**

## Facts about this codebase that cost time to rediscover

- **`FlightRun`'s scalars are under `result.summary`**, not on `result`.
- **A per-configuration deploy override REPLACES the component's own event AND altitude**
  (`lib/sim/setup.ts` `effectiveDeploy`). Drive `buildRocketDynamics` and read the built device.
- **Components nest under `.children`; a `Stage` holds `.components`.**
- **`importDesign` is async.** `lib/ork/import.ts`, takes BYTES, handles `.ork`/`.rkt`/`.CDX1` alike.
- **The session persists across a reload**, so a second `page.goto("/")` in one e2e test restores the
  design and the import panel — with its sample buttons — is not rendered at all.
- `innerText` throws on an SVG `<text>`; use `textContent`.
- The app has SIX page routes: `/`, `/docs`, `/docs/faq`, `/docs/methods`, `/docs/limitations`,
  `/docs/validation`. `/validation` and `/motors` are 404s.
- **A motor mount is a FIELD on a component, not a component** — `motorMount?: MotorMount` on `BodyTube`
  (`types.ts:120`) and `InnerTube` (`types.ts:201`). Twelve of the 35 real designs put it on the body
  tube. Any code that assumes "the thing carrying a mount is a motor tube" is wrong on a third of them.

## Pick up first

1. **P1's last two tables — `MotorSweep` and `GeometryInspector` onto `DataTable`.** Neither is
   mechanical. `MotorSweep` needs: a highlighted DESIGN row, per-cell amber flagging, a sort PERSISTED
   across designs (`usePersistedChoice`), non-finite values sorting last either way, and a numeric column
   starting descending while a text one starts ascending. `GeometryInspector` needs: row click-to-select
   with `aria-selected`, hover linking to the diagram, and a sort whose third click returns to the
   design's own nose-to-tail order rather than reversing. **Decide first whether `DataTable`'s sort
   becomes controllable (`sort` + `onSortChange`) or owns persistence itself (`persistKey`).** Watch the
   trap this repo has already hit: converting a table whose first column was a row header shifts every
   `td` index and an e2e read a label cell as a number.

2. **R5 increment 4 — the last clause of its *done when*.** `ROADMAP.md`'s R5 section carries the five
   hazards with file:line; **hazard 4 is now closed** and hazard 1 is still the load-bearing one
   (`applyAddedStages` runs before `applyAdds`, so `stageSeedBase` never sees `edits.added` and a mount
   authored onto the aft tube is invisible to `buildStage`). One thing worth knowing that was established
   this run: **a mount-add creates no component**, so it cannot change `tubes` or any `xFore` — which is
   the whole content of the anchoring property the pipeline order protects. Folding *mount-adds only*
   into `stageSeedBase` is therefore orthogonal to that property and needs no reordering. Verify that
   before building on it.

3. **The §9 blind spots that are still open**, all filed: the caption-inversion guard's adoption blind
   spot, `secondary`'s hover fill being the same token as §2's sunken surface (so that hover is a no-op
   on the import drop zone), and the header's design-name input being the last hand-rolled field in a row
   of primitives. All three want a `DESIGN.md` sentence, which is why they are filed and not fixed.
