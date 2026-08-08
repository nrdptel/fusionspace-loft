# Start here

**Read `MAINTAINING.md` in full before touching anything.** It is the operating manual for this
repo — who you are on this project, what the bar is, how work ships, and the invariants that override
everything else. This file exists only to point at it, so a session that never names it still finds
it. Where this file and `MAINTAINING.md` disagree, the manual wins.

Then, in this order:

| file | holds |
|---|---|
| `OWNER-NOTES.md` | **the owner's inbox** — rough direction dropped between runs, and the one input that outranks the queue. Usually empty; read it anyway, and give every open note a verdict. |
| `ROADMAP.md` | **the queue.** Two tracks — R (capability) and P (product & craft). A run ships the next unstarted milestone from **each**, alternating. |
| `DESIGN.md` | **binding** design system: tokens, type and spacing scale, component vocabulary, the five required states, product shape, touch contract. Read before writing a component. |
| `COMPETITION.md` | the tracked gap against OpenRocket, RocketPy, RASAero and RockSim. One row added or resolved per run. |
| `HANDOFF.md` | what the last session did, and the arc across sessions. |
| `BACKLOG.md` | a defect ledger to file into — **not** a list of what to build. |
| `CONTRIBUTING.md` | architecture and the gate. |

The gate — all four green before every push:

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

Four things that are easy to get wrong and expensive to fix afterwards. All are spelled out in
`MAINTAINING.md`; they are repeated here because each has already cost a session real time.

- **Set the git identity per-repo before the first commit.** It arrives as the harness vendor's
  default, which the zero-trace invariant forbids. `HANDOFF.md` carries the exact value.
- **Never push straight to `main`.** The deploy fires on any push to `main` whether a test ran or
  not. Ship through a pull request; merging on green is pre-authorised.
- **Read the pull request body back after posting it** and strip any attribution footer the harness
  appended. This is a zero-trace breach on a public artifact, and it has happened repeatedly.
- **Prefer the browser this repo's Playwright manages** (`npx playwright test` with no override).
  Pointing `PW_EXECUTABLE_PATH` at a sandbox Chromium can silently run the suite against the wrong
  revision — there is no guard here yet, and it is filed in `BACKLOG.md`.
