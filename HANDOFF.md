# Handoff

Overwritten each session. What shipped, what is part-way, and what to pick up first.

## Where the work is

Everything below is on `claude/loft-lead-engineer-manual-p857yp`, which is **62 commits ahead of
`main` with no open PR**. `main` — and therefore loft.fusionspace.co — does not have any of it.
That is an owner decision to make, not an engineering one, but it is the single most important
fact about this repo right now: the live site is 62 commits stale.

## Before you trust a sweep

The corpus directory is gitignored and absent on a fresh container. Link it first:

```bash
cd fusionspace-loft && mkdir -p corpus
for d in openrocket rocksim rasaero rocketpy spacecad; do ln -sfn /home/user/loft-fixtures/$d corpus/$d; done
npx vitest run lib/corpus --reporter=verbose     # must print "imports every design file (35 present)"
```

A run that says `1 passed` with no census printed examined nothing.

## Shipped this session

| | |
|---|---|
| `a4e6727` | Name the tool whose numbers a comparison is showing. A RASAero `.CDX1` carries its own stored simulation; the results view read the format stamp with a single RockSim test and called everything else OpenRocket, so a `.CDX1` showed "OpenRocket format RASAero 2" over an "OpenRocket vs Loft" panel. `sourceTool()`/`formatLabel()` now live in the importer and are read on all seven surfaces that name a tool. |
| `5947140` | Per-part mass in the geometry panel: `massByComponent()` keys the dry structural masses by component id, so the pointed-at line and the parts table show what each part weighs, with sortable columns and "in &lt;assembly&gt;" where a subtree override swallowed it. |
| `ea76ebb` | A recent-designs shelf. Every design opened joins "Your designs" on the import screen, eight kept, reopenable in a tap. Separate localStorage key from the working session, so a shelf that can't be written never costs the flyer the open design. |
| `052b54e` | The open workspace is the URL fragment: Back steps between workspaces, a reload lands where you were, and clearing the design clears the fragment. |
| `93d7bfc` | **Bug.** Two definitions of "edited" disagreed, so clearing a what-if field left the stored-tool comparison hidden *and* hid the button that would restore it. One predicate now. |
| `3b407b5` | Physical ranges on every what-if. A rail angle of 120° flew and reported an apogee of zero; wind accepted −50; fin count 0 was silently discarded. |
| `97390bd` | Import failures in the flyer's words, chosen from the file's own leading bytes, instead of `zip: end-of-central-directory not found`. |
| `8fc6af9` | A staged design is told why three of the four Analyze tools aren't offered, and the four hand-written reset keys became one tested `designKey()` in `lib/model`. |
| `9223369` | An `<h1>` on the app page, a skip link, an accessible name on the focusable parts rows, and a reason behind the amber "HIGH" static-margin badge. |
| `00ef139` | A nose-length drag handle (the import screen had been promising one), and keyboard steps scaled to each handle's range instead of a fixed 10 mm / 50 mm pair that had fine and coarse the wrong way round. |
| `aac24c6` | A stored run marked `outdated` or `notsimulated` by its own tool now says so. 11 of 91 stored OpenRocket runs in the corpus are outdated, 7 more not simulated. |

Every one was gated locally on lint + `npm test` + `npm run build` + `npm run test:e2e` before
pushing, and driven in a real browser against the built export. The corpus sweep was green
throughout (35 files, 97 stored simulations, census unchanged).

## Pick up first

1. **Analyze results are silently discarded by any design edit** (top of BACKLOG). The panels are
   keyed on `designKey` so a stale result can't be shown as current — right, but it means a fin
   tweak throws away a 300-flight Monte-Carlo with no notice, and comparing before with after is
   the whole point of the workbench. Keep the result, mark it stale against the key it was computed
   under, and let the old numbers sit beside the new ones. Four panels, one shared pattern.
2. **The editor is still a viewer with fields beside it.** Mass and selection landed this session;
   add/delete and per-part fields are the remaining gap, and they need the edits model to grow past
   one flat bag of ~26 global fields to something addressed per component id.
3. **Fin flutter still cries wolf** (31 of 94 corpus flights). The Wood Handbook's elastic ratios
   are now in the backlog and unblock half of it; the honest destination is probably a flutter-speed
   band per material rather than a better single number, since G is uncertain by ~2× on exactly the
   soft stocks that trip it.

## Environment notes

- Playwright: pass `PW_EXECUTABLE_PATH=/opt/pw-browsers/chromium`; do not run `playwright install`.
- Probe scripts: name them `*-tmp.*` — the ignore glob now covers `*-tmp.*.ts` too, which it didn't,
  so an `audit-a-tmp.spec.ts` used to show up as untracked and as a lint error in the local gate.
- Nothing flaky was seen this session; the full e2e suite (90 tests) passed on every run.
