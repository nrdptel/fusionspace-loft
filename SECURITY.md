# Security Policy

This is a hobby project, but security reports are very welcome.

## Reporting a vulnerability

Please **report privately** — do not open a public issue for security problems.

Use GitHub's private vulnerability reporting:
[**Report a vulnerability**](https://github.com/nrdptel/fusionspace-loft/security/advisories/new)

Please include steps to reproduce and the impact you observed. I'll acknowledge
as soon as I can and work on a fix; since this is a side project, response times
are best-effort.

## Scope

This is a fully static site: there is no backend, no API, and no accounts. The
simulation runs entirely in your browser, your imported design is never uploaded,
and the only data stored (your theme and unit preferences) stays in your browser's
local storage. The one optional network call is the "today's conditions" re-run,
which sends only a launch-site latitude/longitude to Open-Meteo — never your design.

In scope: the web app itself (the page, the client-side `.ork` parser, the
simulation, and state handling) and the build/deploy pipeline.

Out of scope: third-party services this integrates with (Cloudflare for hosting,
Open-Meteo for optional weather) — report those to the respective vendor. A
predicted apogee or descent rate differing from reality is not a security issue;
it's the expected nature of a model estimate, documented in the in-app limitations
log.

## Known advisories

`npm audit` reports a **moderate** advisory in `postcss`, pulled in transitively
by Next.js. It concerns PostCSS's CSS *stringify* output and only affects
**build-time** processing of CSS. This project builds only its own first-party
Tailwind CSS (no untrusted CSS is processed), so there is no runtime exposure.
There is no fix available in the current Next.js major; it will clear when a
Next.js release bundles a patched PostCSS. Tracked, not a release blocker.
