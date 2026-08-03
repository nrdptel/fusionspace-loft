// Shared outbound links. The site origin resolves the same way the metadata,
// robots, and sitemap do — a fork can point it at its own domain with
// NEXT_PUBLIC_SITE_URL.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://loft.fusionspace.co";
export const HUB_URL = "https://fusionspace.co";
export const REPO_URL = "https://github.com/nrdptel/fusionspace-loft";

/** What changed, release by release. The repository's own `CHANGELOG.md` rather than a Releases
 *  page: `git tag` is empty and the changelog is the single source the app's version string is
 *  generated and checked against (`scripts/gen-version.mjs`), so this is the artifact that is
 *  guaranteed to describe the version the footer is showing. */
export const CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`;

/** Report a bug, or ask for a format Loft does not read yet.
 *
 *  **The hard-coded literal was in four places and reachable from none of the app.** Three docs pages
 *  and the docs hub each wrote `https://github.com/nrdptel/fusionspace-loft/issues` inline, so a
 *  flyer whose import went wrong on `/flight` had no way to say so without first finding the docs —
 *  and the footer, which renders on every route, linked the repository ROOT, where "open an issue" is
 *  three clicks and a scroll away. One constant, and the footer points at it.
 *
 *  `/new` rather than the issue list, because the gesture is "tell them", not "read what others
 *  said". GitHub shows the list on the way past if a template picker is configured, so nothing is
 *  lost by starting at the form. */
export const NEW_ISSUE_URL = `${REPO_URL}/issues/new`;
export const KOFI_URL = "https://ko-fi.com/nrdptel";

// Sibling Fusion Space tools, linked inline in the footer the way the live siblings do.
// The LIVE tools only — Debrief is still in development, so it isn't linked from a
// launch-ready tool. Loft is omitted (you're already here). Ordered as on the hub.
export const SIBLING_TOOLS = [
  { name: "Motor Finder", href: "https://motor.fusionspace.co", blurb: "Live motor stock & pricing" },
  { name: "Charge", href: "https://charge.fusionspace.co", blurb: "Ejection-charge calculator" },
  { name: "Window", href: "https://window.fusionspace.co", blurb: "Launch weather" },
  { name: "Muster", href: "https://muster.fusionspace.co", blurb: "Motor-hardware compatibility" },
] as const;

// Data providers — credited in the footer and the methods docs.
export const OPEN_METEO_URL = "https://open-meteo.com";
export const THRUSTCURVE_URL = "https://www.thrustcurve.org";
export const OPENROCKET_URL = "https://openrocket.info";
