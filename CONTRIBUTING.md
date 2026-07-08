# Contributing

Thanks for your interest! This is a personal hobby project, but issues and PRs
are welcome — especially corrections to the physics, its constants, or the
model's assumptions, and anything that makes the numbers clearer, more honest, or
better validated.

## Project layout

This is a single Next.js app, statically exported. There is no backend.

- `app/` — the page, layout, metadata, robots/sitemap, error/not-found, and the
  in-site `docs/` section.
- `components/` — the simulator UI, plots (`LineChart`), flight visualization,
  validation panel, theme toggle, header, footer.
- `lib/model/` — the canonical internal rocket model (a component tree shaped like
  OpenRocket's, but physics-first) and its geometry helpers.
- `lib/sim/` — the format-agnostic simulation core: atmosphere, mass properties,
  Barrowman aerodynamics, drag, the RK4 flight integrator, and the run orchestration.
- `lib/ork/` — the `.ork` importer: a zero-dependency ZIP reader, a small XML
  parser, and the adapter that maps OpenRocket XML into the internal model.
- `lib/motors/` — the bundled thrust-curve database (RASP `.eng` from ThrustCurve.org)
  and motor resolution.
- `lib/validation/` — the harness that diffs the engine against stored `.ork` results.
- `fixtures/` — committed `.ork` test designs (with readable source XML in `src/`).
- `public/` — brand marks, icons, the OG image, sample designs, and the Cloudflare `_headers`.

The simulation is deliberately isolated from the importer: the solver only ever
sees a `Rocket`, never a `.ork`. That boundary is what makes new import formats
(RockSim, RocketPy) thin adapters rather than rewrites. Keep it intact.

## The living-docs rule

The methods documentation and the limitations log are first-class. **Any change
that adds or alters a calculation must update `app/docs/methods` and
`app/docs/limitations` in the same PR**, and new validation runs should feed
`app/docs/validation`. If a calculation changes, cite the source.

## Setup

```bash
npm install
npm run dev   # http://localhost:3000
```

## Checks (run before opening a PR)

These mirror CI (`.github/workflows/test.yml`); all must pass.

```bash
npm run lint        # eslint
npm test            # vitest unit tests (parser + sim core)
npm run build       # also type-checks (CI gate; tsconfig has noUnusedLocals/Params)
npm run test:e2e    # Playwright (incl. an axe accessibility audit) — run after a build
```

## Conventions

- Match the surrounding code's style, naming, and comment density.
- Keep commits focused; describe the *why* in the message.
- Never present a computed figure as authoritative, and never add a go/no-go
  verdict. Honest numbers, stated limits, and deference to the flyer and the RSO
  are core to this tool — keep them intact.
