# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Where the work is

The session is pinned to a working branch, not `main`. **CI does not run on a branch push.**
`test.yml` fires on `push: [main]` and on `pull_request:` only, and `deploy-cloudflare.yml` on
`push: [main]`. So the sequence that actually ships is: gate locally → push the branch → open a PR
(that is what makes CI run) → merge on green (that is what deploys).

**Read the PR body back after posting it.** The harness appends an attribution footer to the body it
creates, which the zero-trace invariant forbids. Strip it with `update_pull_request`. Set the squash
commit title and message explicitly at merge time for the same reason.

**The clone is shallow** (`git rev-parse --is-shallow-repository` → true), so every commit count and
file history here is a window, not the record.

**Everything from this run is on `main` and deployed** — PRs #36, #37 and #38 merged as `7520d65`,
`fed272e` and `84cb2b3`. Nothing is pending on the working branch.

**Production's build marker is in `sw.js`.** `curl -s https://loft.fusionspace.co/sw.js | grep BUILD_ID`
against `grep BUILD_ID out/sw.js` is the fastest way to tell whether what you built is what is being
served. At this session's start production was `44d265094e3f`; it served `7520d65` (PR #36) and then
`fed272e` (PR #37) during it, and a local build of `7520d65` reproduced production's `a2721df72cfa`
byte-for-byte — which is how to prove what is live, rather than assuming the deploy fired.

## Environment traps these sessions hit

- **Git identity is wrong out of the box** — `user.name`/`user.email` come preset to the harness's
  own values, which the project's zero-trace invariant forbids. Set them per-repo before the first
  commit and check with `git log -1 --format='%an <%ae>'`. Signing works (`gpg.format=ssh`) even
  though the configured `user.signingkey` file is zero bytes; confirm with
  `git cat-file commit HEAD | grep gpgsig` after the first commit rather than trusting the config.
- **A probe that finds nothing may be broken, not clean.** A census over the corpus returned "0
  designs with multiple fin sets" twice — first because the component `kind` strings are lowercase
  (`bodytube`, `trapezoidfinset`), then because `flattenRocket` returns `Positioned` wrappers and the
  kind lives at `.component.kind`. The true answer is 13 of 35. Print a histogram or a denominator,
  count the throws instead of hiding them, and never believe a zero on its own.
- **A vitest test that drives the corpus needs an explicit timeout.** The default is 5 s; pass
  `{ timeout: 180_000 }` as `it`'s second argument.
- **JSX can eat the space between an expression and the text after it.** Hit three times now, most
  recently shipping "300flights;" from the Monte-Carlo caption. Always use an explicit `{" "}`, and
  check the built chunk, not the source:
  `grep -ohE 'children:\[[^]"]{1,25},"[a-z]{3,}' out/_next/static/chunks/*.js` returns every
  occurrence — it is 0 as of this session.
- **`getByLabel` matches substrings.** `getByLabel("Results")` also matches the tab list's
  "Results workspace"; pass `{ exact: true }` when the negative assertion matters.
- **The diagram's SVG is `role="group"`, not `role="img"`, whenever it is editable** (an `img` may
  not hold focusable descendants). Locate it by its label, not its role.

## Before you trust a sweep

The corpus is gitignored and absent on a fresh container. Both repos are checked out in this
session, so no token is needed — symlink the fixtures repo's per-tool directories into `corpus/`:

```bash
mkdir -p corpus && for d in openrocket rocksim rasaero rocketpy spacecad; do
  ln -sfn /home/user/loft-fixtures/$d corpus/$d; done
npx vitest run lib/corpus --reporter=verbose --silent=false
```

It must print `imports every design file (35 present)`. With no corpus the suite skips itself and a
run that says `1 passed` with no census examined nothing. Note `--silent=false`: vitest 4 swallows a
test's `console.log` without it.

**CI still cannot fetch the corpus until a `FIXTURES_TOKEN` repository secret exists.** Everything
else is wired. That secret remains the one owner-side action.

## Shipped this session

Baseline gate before anything changed: lint, 619 unit tests, build, 95 e2e — all green. Corpus
sweep ran throughout at **35 design files, 3 suites passing, 0 findings**.

| | |
|---|---|
| `2da08e2` | **Display honesty.** Every surface quoting a fin thickness or a flutter margin rounded the thinnest ones away. `Cherokee-E-5055.ork`'s real 0.254 mm (0.010 in) balsa fin read "0 mm" and "0 in", and its five stored configurations — margins 0.012, 0.024, 0.035, 0.049, 0.012 — all printed "0×", so the worst margins in the corpus were indistinguishable from each other and from a bug. Measured: 5 of 87 corpus flights affected, 0 after. `fmtSmall` keeps the places a value needs and states a bound below that; `lengthMm` and a new `flutterMargin` helper both route through it. |
| `6c2a5ac` | **Navigation spine.** A design whose motor isn't bundled lost the workspace tabs entirely — and with them the diagram, the parts table and the mass breakdown, which are motor-independent and were already computed. All three workspaces now render, the load lands on Design, and Flight/Analyze explain themselves. The motor sweep is carved out because it flies the bundled candidates itself: driven on `unresolved-motor.ork` it returns 15 candidates with full flight metrics, which is the most useful thing that design can be told. The `EditHere` two-vocabulary split existed only because the tabs might not be drawn, so it collapses to one constant. |
| `6be502c` | **The pre-push review's own findings on `2da08e2`.** The what-if delta row took its precision from the two ends and not from the change, so 1.44 → 1.46 rendered "1.4 → 1.5" beside a change of "0" — the exact contradiction the row exists to avoid. The motor-sweep CSV exported the margin at 2 dp while the cell it came from kept more. `fmtSmall`'s bound path used a different minus glyph from its ordinary path. And the flutter caution banner formatted its margin with `toFixed`, which disagrees with the display layer on ties *and* on a trailing zero ("1.0×" against the card's "1×") — a test now pins the two together. |
| `f01771f` | **Two picker options that read alike.** Of the 21 corpus designs offering a configuration picker, 3 produce a repeated label — `Clustered motors.ork` has two different configurations both stored at 307 m, `FullScaleModelTH.rkt` fifteen runs of one motor with six indistinguishable and one name reused eleven times. The picked configuration is what Loft flies and compares against, so an ambiguous option silently checks the engine against a different flight. `storedRunLabels` in `lib/display.ts` adds the run's name, then its position, then guarantees distinctness outright. |
| `e2c0247` | **An apogee the tool has disowned.** 18 of 108 picker options quote a run the source tool marks outdated (11) or never simulated (7) — all five of `USLI2025-FULLSCALE`'s, 8 of `Punisher Apprentice.ork`'s 9. Loft already read the marker (validation panel, drag cross-check); the picker dropped it. `storedTag` shares its switch with `storedCaveat`, and a test holds the two to speaking in the same cases. |
| `cf64f1c` | **That review's findings in turn:** the name tier appended a name the label already carried (RASAero names each run after its own motor), the promised distinctness was the caller's property not the function's, the test meant to prove it varied only the tiebreaker's field, a NaN apogee could render "C6 · — m", and the option tooltip had become less specific than the visible text. |
| `84cb2b3` | **The phone's fin handles.** Measured at 412x915/DPR 2.6: seven handles at 24x24 px, the five fin ones inside a 24x34 box, and `elementFromPoint` at the centre of "Fin position" returning "Fin sweep" — unreachable by any tap, with the reachable ones dragging the wrong dimension about half the time. A bigger circle makes it worse (at 10 px apart, 44 px circles nest), so a coarse pointer gets ONE fin handle aimed by a chip row, and every handle carries a 44 px grab area. Desktop untouched. |
| `84cb2b3` (both, merged) | **"300flights;".** The done-check walk caught the JSX-eats-the-space bug a third time, in the Monte-Carlo caption. Fixed with an explicit `{" "}` and verified in the built chunk; a scan of the whole bundle for the same pattern (`children:[<expr>,"<word>`) returns **0** other instances. |

## Pick up first

1. **Per-component-id addressing is the blocking gap for the editor.** Every what-if resolves one
   component per role (frontmost fin set, frontmost nose, longest tube, largest parachute). 13 of 35
   corpus designs have several fin sets and 23 several body tubes. A fresh scope audit says the
   smallest independently-shippable slice is additive: an optional `finSetIds?: string[]` on
   `GeometryEdits` (`lib/model/edit.ts:78`) used in place of `primaryFinGroupIds(rocket)` at
   `edit.ts:770` — defaults to today's behaviour, no UI or persistence change, and unblocks the rest.
   Then `RocketDiagram.tsx:155` (the fin handle still resolves by nearest station rather than by id;
   the body-tube handle at :238 is the id-matching pattern to copy), then collapsing the three
   identical 23-field literals in `LoftApp.tsx` (198, 404, 810) into one derived object.
2. **The rest of the phone's 44 px gaps**, all re-measured this run at 412x915/DPR 2.6 and listed in
   `BACKLOG.md` with their numbers: the 9 motor-sweep column-sort buttons at 15.7 px, the Conditions
   "Launch site" input (34 px) and "Fetch" button (32 px), the sticky header's name input (30 px),
   the four Analyze "Run …" buttons and 7 Monte-Carlo inputs at 36 px, the 5 /docs sub-nav links at
   30 px, and 10 footer links at 16–20 px. The diagram handles are done; these are what is left, and
   they are mostly a class change each. Separately: 13 elements carry information ONLY in `title=`,
   which never fires on touch — including the `<abbr>` behind the stability badge and all four
   Conditions explanations, so a phone gets no explanation of a flagged margin at all.
3. **Fin flutter still cries wolf** (60 of 113 corpus flights). Blocked on a citable shear modulus;
   the Wood Handbook ratios in `BACKLOG.md` unblock half of it, and the honest destination is a
   flutter-speed band per material rather than a better single number.

## Environment notes

- Playwright: pass `PW_EXECUTABLE_PATH=/opt/pw-browsers/chromium`; do not run `playwright install`.
  A standalone probe script must live in the repo root to resolve `playwright` from `node_modules` —
  one under `/tmp` fails with `ERR_MODULE_NOT_FOUND`.
- Probe scripts: name them `*-tmp.*`. The ignore glob covers `*-tmp.mjs`, `*-tmp.ts` and
  `*-tmp.*.ts`. A `*-tmp.test.ts` under `lib/` is picked up by vitest, which makes it a convenient
  way to run a one-off query against the corpus — but it is also type-checked by `npm run build`, so
  delete it before gating.
- Nothing flaky was seen; the full e2e suite passed on every run.
- `npx vitest --reporter=basic` no longer exists in vitest 4; use `--reporter=verbose` or the default.
