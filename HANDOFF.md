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

**Production's build marker is in `sw.js`.** `curl -s https://loft.fusionspace.co/sw.js | grep BUILD_ID`
against `grep BUILD_ID out/sw.js` is the fastest way to tell whether what you built is what is being
served. At this session's start production was `44d265094e3f`.

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
- **JSX can eat the space between an expression and the text after it.** `{fn(x)} describe …`
  compiled to `…, fn(x), "describe …"` and shipped "workspacedescribe" to the page. Use `{" "}`.
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
| (increment 3) | **The pre-push review's own findings on `2da08e2`.** The what-if delta row took its precision from the two ends and not from the change, so 1.44 → 1.46 rendered "1.4 → 1.5" beside a change of "0" — the exact contradiction the row exists to avoid. The motor-sweep CSV exported the margin at 2 dp while the cell it came from kept more. `fmtSmall`'s bound path used a different minus glyph from its ordinary path. And the flutter caution banner formatted its margin with `toFixed`, which disagrees with the display layer on ties *and* on a trailing zero ("1.0×" against the card's "1×") — a test now pins the two together. |

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
2. **The phone's diagram handles are 22–24 px** with an 11 px grab radius, and two sit 7 px apart —
   the one control the whole direct-manipulation story rests on. A bigger circle isn't the fix:
   seven would overlap on a 346x89 px phone diagram, so it wants a touch-specific layout.
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
