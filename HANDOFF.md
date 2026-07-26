# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Where the work is

This run's work reached `main` and therefore production. PR #34 merged as `27ea431`; the branch was
then restarted from that commit (a merged PR cannot carry follow-up work) and the later increments
went on top.

The session is pinned to a working branch, not `main`. **CI does not run on a branch push.**
`test.yml` fires on `push: [main]` and on `pull_request:` only, and `deploy-cloudflare.yml` on
`push: [main]`. So the sequence that actually ships is: gate locally → push the branch → open a PR
(that is what makes CI run) → merge on green (that is what deploys). Both CI jobs, `frontend` and
`e2e`, passed on `98d2df7` before the merge.

**Read the PR body back after posting it.** The harness appends an attribution footer to the body it
creates, which the zero-trace invariant forbids. It did so on #34 and was stripped with
`update_pull_request`. Set the squash commit title and message explicitly at merge time for the same
reason — do not let the merge inherit a body you did not check.

**The clone is shallow** (`git rev-parse --is-shallow-repository` → true), so every commit count and
file history here is a window, not the record.

## Environment traps these sessions hit

- **Git identity was wrong out of the box** — `user.name`/`user.email` came preset to the harness's
  own values, which the project's zero-trace invariant forbids. Set them per-repo before the first
  commit and check with `git log -1 --format='%an <%ae>'`. Signing itself works (`gpg.format=ssh`);
  confirm with `git cat-file commit HEAD | grep gpgsig`.
- **A probe that finds nothing may be broken, not clean.** A census over the corpus returned "0
  designs with multiple fin sets" twice — first because the component `kind` strings are lowercase
  (`bodytube`, `trapezoidfinset`), then because `flattenRocket` returns `Positioned` wrappers and the
  kind lives at `.component.kind`. The true answer is 13 of 35. It happened again with a flutter
  probe: "0 flights" was `runFromDocument` being called with a made-up options shape (it takes
  `{configId, validateAgainst, overrides}`, and `overridesFromStored` takes a *sim*, not a doc and an
  index) inside a `try/catch` that swallowed the throw. The true answer was 60. Print a histogram or
  a denominator, count the throws instead of hiding them, and never believe a zero on its own.
- **A vitest test that drives the corpus needs an explicit timeout.** The default is 5 s and flying
  113 simulations takes longer; pass `{ timeout: 180_000 }` as `it`'s second argument.
- **JSX can eat the space between an expression and the text after it.** `{fn(x)} describe …`
  compiled to `…, fn(x), "describe …"` and shipped "workspacedescribe" to the page. Check the built
  bundle (`grep` the chunk) or the rendered text, and use an explicit `{" "}`.

## Before you trust a sweep

The corpus is gitignored and absent on a fresh container. Both repos are checked out in this
session, so no token is needed — symlink the fixtures repo's per-tool directories into `corpus/`:

```bash
mkdir -p corpus && for d in openrocket rocksim rasaero rocketpy spacecad; do
  ln -sfn /home/user/loft-fixtures/$d corpus/$d; done
npx vitest run lib/corpus --reporter=verbose --silent=false
```

It must print `imports every design file (35 present)`. With no corpus the suite skips itself and a
run that says `1 passed` with no census examined nothing. `FIXTURES_TOKEN=… npm run fetch-fixtures`
is the other path; `fixtures.lock.json` pins the snapshot by commit and by the sha256 of its own
`CHECKSUMS.sha256` and fails loudly if either moved.

Note `--silent=false`: vitest 4 swallows a test's `console.log` without it, so the census that proves
the suite ran does not print.

**CI still cannot fetch the corpus until a `FIXTURES_TOKEN` repository secret exists.** Everything
else is wired. That secret remains the one owner-side action.

## Shipped this session

Three increments. The first is **on `main` and deployed**; the other two are on the working branch,
gated locally and awaiting their own PR.

| | |
|---|---|
| `27ea431` (on `main`) | **Bug.** The fin what-ifs read their starting values off the frontmost fin set but wrote them back to *every* set. Nudging the span field on `03.Three-stage.ork` by 10 mm took its five sets from 19.1/108.0/63.5/108.0/63.5 mm to 29.1 mm across the board — shrinking the booster fins 73% while the field only ever showed the sustainer's 19.1 mm — and then flew that. Shape edits now land on the *fin group* the fields describe: the frontmost set plus any set indistinguishable from it (same station, same dimensions). That second half matters as much as the first — the pre-push agent review caught that scoping to a single component id breaks the opposite real case, where a file stores one physical 3-fin ring as three 1-fin sets (`ARC payload rocket.ork`) and resizing one would fly an asymmetric rocket. Measured over the corpus: of the 13 multi-set designs, 12 hold genuinely independent sets and 1 is a split ring. Fin *position* stays group-wide on purpose (it is a delta, so spacing and `finStationTrim`'s slope hold). A design with sets outside the group now says so above the fin fields and names the set it edits. |

| `9fa7706` (branch) | A design whose motor isn't bundled never reaches the workspace tabs, but still runs the stability-trim and flutter hints — which said "in the Design workspace", naming a tab that was never drawn. The pointer now follows the layout. The same notice also offered "or pick a configuration" without checking that a configuration picker exists (it only renders above one stored config). An e2e case holds both invariants. |
| (branch, uncommitted at time of writing) | The fin-flutter fix hint named the worst-margin set and told the flyer to thicken it — but the thickness field reaches only the primary fin group. Measured: the hint fires on 60 corpus flights and **16 name a set the fields cannot reach**, including the thinnest margins in the corpus (0.08x, 0.21x, 0.29x). `FinFlutter` now carries the set's component id and the hint says plainly when the change has to go back to the design file. |

Baseline gate at session start was green before anything changed: lint, 618 unit tests, build, 94
e2e. The corpus sweep ran throughout at **35 design files / 97 stored simulations, 0 findings**,
median apogee disagreement 3.2% — unchanged.

## Pick up first

1. **Per-component-id addressing is now the blocking gap for the editor.** Every what-if resolves one
   component per role (frontmost fin set, frontmost nose, longest tube, largest parachute). 13 of 35
   corpus designs have several fin sets and 23 several body tubes, so on those designs most
   components simply cannot be edited. This is the same change the read-only parts list needs, and
   it is what turns the editor from a viewer with fields beside it into an editor. Scope note from a
   full audit: `lib/model/edit.ts` throughout, ~244 flat-field references in `components/LoftApp.tsx`
   (including two hand-written 23-field enumerations), the `SWEEP_AXES`/`GEOMETRY_AXES` string unions
   in `lib/sim/sweep.ts`, `RocketDiagram.tsx`'s handles, and a `lib/session.ts` schema bump with a
   migration.
2. **The phone's diagram handles are 24 px** — the one control the whole direct-manipulation story
   rests on, and the last thing in the Design workspace under the 44 px minimum. A bigger circle
   isn't the fix: seven would overlap on a 346x89 px phone diagram, so it wants a touch-specific
   layout.
3. **Fin flutter still cries wolf** (60 of 113 corpus flights now that the census has been run
   properly). Blocked on a citable shear modulus; the Wood Handbook ratios in `BACKLOG.md` unblock
   half of it, and the honest destination is a flutter-speed band per material rather than a better
   single number. Its fix hint is now honest about reach but still quotes "0 mm" and "0x" on
   `Cherokee-E-5055.ork`, which is a display-precision bug, not a physics one.

## Environment notes

- Playwright: pass `PW_EXECUTABLE_PATH=/opt/pw-browsers/chromium`; do not run `playwright install`.
  A standalone probe script must live in the repo root to resolve `playwright` from `node_modules` —
  one under `/tmp` fails with `ERR_MODULE_NOT_FOUND`.
- Probe scripts: name them `*-tmp.*`. The ignore glob covers `*-tmp.mjs`, `*-tmp.ts` and
  `*-tmp.*.ts`. A `*-tmp.test.ts` under `lib/` is picked up by vitest, which makes it a convenient
  way to run a one-off query against the corpus — but it is also type-checked by `npm run build`, so
  delete it before gating.
- Nothing flaky was seen; the full e2e suite (95 tests) passed on every run.
- `npx vitest --reporter=basic` no longer exists in vitest 4 and fails as an unloadable custom
  reporter; use `--reporter=verbose` or the default.
