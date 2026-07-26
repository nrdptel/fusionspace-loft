# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Where the work is

Measured at the start of this session, after `git fetch --prune origin`: the working branch and
`origin/main` were both at `8223f2b` — `git rev-list --count origin/main..HEAD` was 0 in both
directions, so this run started level with production.

This session is pinned to a working branch, not `main`. **CI does not run on it.** `test.yml` fires
on `push: [main]` and on `pull_request:` only, and `deploy-cloudflare.yml` on `push: [main]` — so a
branch push builds nothing, checks nothing, and deploys nothing. The local gate is the only gate.
Opening a PR against `main` is pre-authorised and is what makes CI run at all.

**The clone is shallow** (`git rev-parse --is-shallow-repository` → true), so every commit count and
file history here is a window, not the record.

## Two environment traps this session hit

- **Git identity was wrong out of the box** — `user.name`/`user.email` came preset to the harness's
  own values, which the project's zero-trace invariant forbids. Set them per-repo before the first
  commit and check with `git log -1 --format='%an <%ae>'`. Signing itself works (`gpg.format=ssh`);
  confirm with `git cat-file commit HEAD | grep gpgsig`.
- **A probe that finds nothing may be broken, not clean.** A census over the corpus returned "0
  designs with multiple fin sets" twice — first because the component `kind` strings are lowercase
  (`bodytube`, `trapezoidfinset`), then because `flattenRocket` returns `Positioned` wrappers and the
  kind lives at `.component.kind`. The true answer is 13 of 35. Print a histogram of what the probe
  actually saw before believing a zero.

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

| | |
|---|---|
| this run's single commit (the tip of the working branch) | **Bug.** The fin what-ifs read their starting values off the frontmost fin set but wrote them back to *every* set. Nudging the span field on `03.Three-stage.ork` by 10 mm took its five sets from 19.1/108.0/63.5/108.0/63.5 mm to 29.1 mm across the board — shrinking the booster fins 73% while the field only ever showed the sustainer's 19.1 mm — and then flew that. Shape edits now land on the *fin group* the fields describe: the frontmost set plus any set indistinguishable from it (same station, same dimensions). That second half matters as much as the first — the pre-push agent review caught that scoping to a single component id breaks the opposite real case, where a file stores one physical 3-fin ring as three 1-fin sets (`ARC payload rocket.ork`) and resizing one would fly an asymmetric rocket. Measured over the corpus: of the 13 multi-set designs, 12 hold genuinely independent sets and 1 is a split ring. Fin *position* stays group-wide on purpose (it is a delta, so spacing and `finStationTrim`'s slope hold). A design with sets outside the group now says so above the fin fields and names the set it edits. |

Baseline gate at session start was green before anything changed: lint, 617 unit tests, build, 94
e2e. The corpus sweep ran throughout at **35 design files / 97 stored simulations, 0 findings**,
median apogee disagreement 3.2% — unchanged from last session.

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
3. **Fin flutter still cries wolf** (31 of 94 corpus flights). Blocked on a citable shear modulus;
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
- Nothing flaky was seen this session; the full e2e suite (94 tests) passed on every run.
- `npx vitest --reporter=basic` no longer exists in vitest 4 and fails as an unloadable custom
  reporter; use `--reporter=verbose` or the default.
