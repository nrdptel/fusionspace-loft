# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Where the work is

**All of it is on `main` and deployed.** PR #32 merged as `7a17dd9`; `git rev-list --count
origin/main..HEAD` is 0. That PR was also the first thing to make CI run for this work — `test.yml`
fires on `pull_request:` but not on a branch push, so a branch push builds and checks nothing. Both
jobs passed on `2eef314` before the merge.

Opening and merging pull requests is pre-authorised. Use them: they are the only way to get checks,
and a working branch that never lands has shipped nothing.

Two things to measure rather than assume, both of which caught this session out:
- **`git fetch --prune origin` before quoting any divergence**, and cite the SHA. An earlier draft of
  this file said "61 commits ahead, main has none of it", read off a remote-tracking ref that had
  gone stale two hours in. The real figure was 20.
- **The clone may be shallow** (`git rev-parse --is-shallow-repository`), so every commit count and
  file history is a window rather than the record.

## Before you trust a sweep

The corpus is gitignored and absent on a fresh container. There is now one command for it:

```bash
FIXTURES_TOKEN=<token that can read nrdptel/loft-fixtures> npm run fetch-fixtures
npx vitest run lib/corpus --reporter=verbose     # must print "imports every design file (N present)"
```

`fixtures.lock.json` pins the snapshot by commit and by the sha256 of its own `CHECKSUMS.sha256`;
the fetch verifies both and fails loudly if either moved. With no token it exits 0 and does nothing,
and the corpus suite then skips itself — a run that says `1 passed` with no census printed examined
nothing. Linking a local fixtures checkout into `corpus/` still works and needs no token.

**CI cannot fetch the corpus until a `FIXTURES_TOKEN` repository secret exists.** Everything else is
wired: the lock file, the script, the npm script, and the workflow step. That secret is the only
remaining owner action.

## Shipped this session

Seventeen increments, every one gated locally on lint + `npm test` + `npm run build` +
`npm run test:e2e` and driven in a real browser against the built export before pushing.

| | |
|---|---|
| `a4e6727` | Name the tool whose numbers a comparison is showing. A RASAero `.CDX1` carries its own stored simulation; the results view tested only for RockSim and called everything else OpenRocket, so a `.CDX1` showed "OpenRocket format RASAero 2" over an "OpenRocket vs Loft" panel. `sourceTool()`/`formatLabel()` now live in the importer and are read on all seven surfaces that name a tool. |
| `5947140` | Per-part mass in the geometry panel, keyed by component id, with sortable columns and "in &lt;assembly&gt;" where a subtree override swallowed a part. |
| `ea76ebb` | A recent-designs shelf: every design opened joins "Your designs", eight kept, reopenable in a tap, on a separate storage key from the working session. |
| `052b54e` | The open workspace is the URL fragment — Back steps between workspaces, a reload lands where you were. |
| `93d7bfc` | **Bug.** Two definitions of "edited" disagreed, so clearing a what-if left the stored-tool comparison hidden *and* hid the button that would restore it. |
| `3b407b5` | Physical ranges on every what-if. A rail angle of 120° flew and reported an apogee of zero. |
| `97390bd` | Import failures in the flyer's words, chosen from the file's leading bytes, not `zip: end-of-central-directory not found`. |
| `8fc6af9` | A staged design is told why three Analyze tools aren't offered; four hand-written reset keys became one tested `designKey()`. |
| `9223369` | An `<h1>`, a skip link, a name on the focusable parts rows, and a reason behind the amber "HIGH" margin badge. |
| `00ef139` | A nose-length drag handle (the import screen was promising one), and keyboard steps scaled to each handle's range. |
| `aac24c6` | A stored run marked `outdated` or `notsimulated` by its own tool now says so — 11 of 91 corpus runs are outdated, 7 more not simulated. |
| `8c01ed9` | Backlog and this handoff. |
| `67f45e6` | An edit re-runs an open sweep instead of erasing it; the RocketPy panel keeps its answer and labels it. Also stopped an unrelated re-render restarting hundreds of flights. |
| `d4a5f8e` | The previous sweep stays on screen, dimmed and labelled, while the next one flies. |
| `8803a11` | Copy beside Download on every analysis table, as tab-separated text. |
| `688941e` | Documents carry notes as well as warnings, so "this design flies serially" stops appearing under "weren't fully understood". |
| `b549038` | The two cross-check tables read the same way — reference, Loft, delta. |
| `a0d61c1` | The Design workspace meets the project's own 44 px hit target: 41 controls were under it on a phone. |
| `fbc6fe2` | Corrected this file: the divergence from main was read off a stale ref and published wrong. |
| `9394d94` | The corpus can be fetched and hash-verified — lock file, script, npm script, CI step. Needs the secret. |
| `6724aaf` | The standing operating brief moved into the repo (now `MAINTAINING.md`), so it is reviewable in a diff rather than pasted per session. Open a session with "Follow MAINTAINING.md". |

The corpus sweep was green throughout and its census never moved: **35 design files, 97 stored
simulations flown, 0 new findings**, median apogee disagreement 3.2%.

## Pick up first

1. **The editor is still a viewer with fields beside it.** Mass and selection landed this session;
   add/delete and per-part fields are the remaining gap, and they need the edits model to grow past
   one flat bag of ~26 global fields to something addressed per component id.
2. **Fin flutter still cries wolf** (31 of 94 corpus flights). The Wood Handbook's elastic ratios
   are now in the backlog and unblock half of it; the honest destination is probably a flutter-speed
   band per material rather than a better single number, since G is uncertain by ~2× on exactly the
   soft stocks that trip it.
3. **The phone's diagram handles are 24 px** — the one control the whole direct-manipulation story
   rests on, and the last thing in the Design workspace under the 44 px minimum. A bigger circle
   isn't the fix: seven of them would overlap on a 346x89 px phone diagram, so it wants a
   touch-specific layout. Measured, with the numbers, at the top of `BACKLOG.md`.

## Environment notes

- Playwright: pass `PW_EXECUTABLE_PATH=/opt/pw-browsers/chromium`; do not run `playwright install`.
- Probe scripts: name them `*-tmp.*` — the ignore glob now covers `*-tmp.*.ts` too, which it didn't,
  so an `audit-a-tmp.spec.ts` used to show up as untracked and as a lint error in the local gate.
- Nothing flaky was seen this session; the full e2e suite (94 tests) passed on every run. The three
  RocketPy tests genuinely run (~19 s each) once `npm run build` has vendored Pyodide — check for
  that, because they skip silently without it.
- **CI does not run on this branch.** `.github/workflows/test.yml` triggers on pushes to `main` and
  on pull requests only, so a push here builds nothing and checks nothing. The local gate is the
  only gate; run all four commands before every push. Opening a PR would attach CI — there is no
  `gh` binary in this environment, but the GitHub MCP tools (`create_pull_request`, `actions_list`)
  are available if a future session wants one.
