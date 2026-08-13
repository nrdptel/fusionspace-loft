# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Pick up first

**Everything this run is on `claude/ultracode-maintenance-ro9u5w` and NOTHING has reached production
yet.** `main` was at `99b5134` at session start and the branch is ahead of it; open one pull request
against `main` and merge it on green and the whole run is live. Under SHIPPED-MEANS-REACHABLE this
run's work counts as **pending, not shipped**. PRs #171–#173 from run 13 are all merged; **no pull
request was open at session start** (the handoff said #173 was in flight — it merged in between).

Where the two tracks stand, measured this run:

- **P-track: P15 is at increment 2 of 3.** The width floor is asserted wherever the height floor is,
  on every route the suite walks. **Increment 3 is the docs routes**, which `scan()` still never
  visits — `SectionNav`'s contents chips render 34 px tall there and the count is unmeasured rather
  than zero.
- **R-track: R12 is at increment 15.** What a stated CG and a stated WEIGHT mean on a part with a
  shoulder, settled against OpenRocket's own source rather than reasoned about. **The next R slice
  is the one this run deliberately did not take:** `localBodyCGx`'s inversion is now the identity
  (slope 1) and 30 lines plus two whole-rocket mass solves per call are ceremony; collapsing it means
  reproducing its `undefined` guard for a part that reports no CG of its own.

**The single most valuable thing this run learned.** Two of my own increments shipped a *false
premise* that the full green gate could not see, and the pre-push agent review caught both. This is
the third consecutive run to say the review is the highest-yield step in the loop; it is now the
step I would cut last.

1. **A class name immediately before a `${` interpolation is not extracted by Tailwind v4.** Writing
   `` `…md:text-3xl${cond ? x : ""}` `` shipped `md:text-3xl` in the served `class` attribute with
   **no CSS rule behind it**. `SiteHeader.tsx` is the only use of that utility in the tree, so the
   rule was never generated and the desktop wordmark silently dropped 30 px → 20 px on every route —
   with a green build, a green lint and 268 green e2e tests. **Nothing in the gate reads served
   classes back against the stylesheet**, and that check is the highest-value instrument this repo is
   currently missing. Proof: `grep -c 'md:text-3xl' out/index.html` → 1 while
   `grep -c 'md\:text-3xl' out/_next/static/chunks/*.css` → 0.
2. **I justified an exemption with a WCAG citation and a claim about the app, and both were false.**
   The wordmark's app-route exemption was written as "WCAG 2.5.8 *Equivalent*, because ← Import
   another reaches the same place". `/` bounces straight back to the open workspace via
   `router.replace`, and `← Import another` is `reset()` — a destructive act, not the same function.
   2.5.8 is also the 24x24 AA floor, which 37x28 already clears; this repo works to **2.5.5**. It is
   now recorded as a **filed gap**, which is what it always was.
3. **"Measure, don't remember" cost an hour, exactly as the manual says it will.** I read "49 px of
   headroom" out of a code comment and spent 16 px of it. The real headroom was **5 px** — the
   comment was right on its date and the chrome had grown since. Only `e2e/depth.spec.ts` caught it.
   Both stale copies (`SiteHeader.tsx`, `Footer.tsx`) are corrected, and the Footer one now carries no
   number at all, on purpose.
4. **A negative control must be run AFTER the change it guards, not only before.** My first control
   fired correctly; then I added an `h1` exclusion in the same increment, which made the control
   unreachable, and the roadmap entry claiming "fails two assertions" was false by the time it was
   written. Re-run the control against the final diff.

## The environment, measured 2026-08-13 (run 14)

- **Four cores.** `nproc` = 4. A six-agent fan-out took **22 minutes**; a three-agent review took
  **21**. Size accordingly.
- **`node_modules` is NOT installed at session start.** `npm install` first.
- **The managed Playwright browser is ABSENT at session start.** `npx playwright install chromium`
  fixes it in about a minute. Still not in the environment's setup script — the owner's to make, and
  it is paid for again every run.
- **The fixtures repo WAS attached** at `/home/user/loft-fixtures`. Linking its five per-tool
  directories into `corpus/` gave the suite **35 design files**, and it named that count itself.
- **Git identity arrives as the harness vendor's default** and must be set per-repo before the first
  commit. Signing was already configured; every commit this run carries a `gpgsig`.
- **The clone is SHALLOW** — every commit count and file history is a window, not the record.
- **Never run two shards concurrently — and the failure is silent.** A backgrounded shard 2 overlapped
  a foreground one and reported **76 passed** with a check-mark-less "did not run" list and NO failure
  line. Run alone it is **134**. Sequential shards are stable at 134 + 134 = **268**.
- **Vitest swallows `console.log` in this config.** A probe that prints will look like a probe that
  found nothing; write to a file instead.
- **`importDesign` takes `(Uint8Array)` and is async** — `importDesign(buf, name)` returns undefined
  properties and reads as 35 parse errors.
- **One e2e flake seen once in five full shard runs**: a `toBeVisible()` in shard 1, passing 134/134
  on an immediate clean re-run. This is the slow-session-restore flake `playwright.config.ts` already
  documents.

## What the opening fan-out returned

Six lenses: two Sev-1 screens, two milestone recons, a design-system audit, a competitive probe.
**No Sev-1 survived.** The strongest candidate — `PartPicker`'s parts list as a one-way door, which
`BACKLOG.md` itself called "the strongest single candidate" — was **REFUTED**: the "Close the parts
list" toggle precedes the list in DOM order, so one Shift+Tab from the search field exits. All
findings are filed in `BACKLOG.md`, newest section first. The three worth naming:

- **Self-unmounting controls drop the keyboard user's place — four instances, one defect, one fix.**
  `PartPicker.tsx:585` ("Use"), `GeometryInspector.tsx:894` (Remove), `:925` (Move toward the tail),
  `:1138` (Remove stage). Focus falls to `<body>`; `useReturnFocus` exists and has one adopter.
- **`text-[11px]` is a de-facto seventh type size at 33 uses**, and §9's type grep matches NAMED
  sizes only, so it reads 0 forever. §2's three text roles have **136 off-rung uses** and §9 has no
  text-colour grep at all.
- **Every §9 count is AT its target** (radius 0, border 0, spacing 0, arbitrary spacing 0, type 0,
  inverted files 0; card treatments 3 against an honest floor of 3; adoption 22 of 31).

## The arc across sessions

- **Run 14 (2026-08-13, this one).** Two increments, one per track, each its own gate and push.
  P15 increment 2 (touch areas, and a Tailwind regression caught before it shipped); R12 increment 15
  (override semantics, settled from OpenRocket's source). `BACKLOG.md` gained the fan-out's findings
  and had two entries corrected that this run proved wrong.
- **Run 13 (2026-08-12).** Five increments; #171 and #172 merged and live, #173 open then merged.
  P14 shipped, P15 written and opened, R12 reached increment 14.
- **Run 12 (2026-08-11).** The lumped-airframe Sev-1 family closed. PRs #166–#170.
- **Run 11 and earlier.** R12's editor family from increment 1, P13's shared design system, P10's
  repo surface, P7's dark mode. See `ROADMAP.md` for each milestone's *done when*.

## Standing hazards this run re-confirmed

- **Never push straight to `main`** — the deploy fires on any push, gated on nothing.
- **Every e2e negative control is `revert → rebuild → run → restore → rebuild`**, and it must compile.
- **Shard the e2e suite sequentially**, never concurrently — see above, the failure is silent.
- **A merged PR cannot track new work.** After merging, `git checkout -B <branch> origin/main`.
- **The harness appends an attribution footer to PR bodies and asks for the commit identity the
  zero-trace invariant forbids.** Both are recorded under *Awaiting the owner* in `OWNER-NOTES.md`
  from run 12 and are unchanged.
