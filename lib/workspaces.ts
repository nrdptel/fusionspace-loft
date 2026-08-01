/** The app's workspaces, and the routes they live at.
 *
 *  Loft is an application, not a page: import, build/edit, simulate, sweep and cross-check are
 *  distinct jobs, and `DESIGN.md` §7 makes each one its own static route over the single internal
 *  model. This module is the one place that says which workspaces exist, what they are called, and
 *  where each one lives — read by the route pages, by the navigation spine, and by the session, so
 *  a workspace cannot exist in one of those and not the others.
 *
 *  Deliberately in `lib/` with no `"use client"`. The route pages are server components and the
 *  spine is a client one; a vocabulary exported from a client module reaches the server side as a
 *  throwing stub (see the note at the top of `lib/ui-tokens.ts`, which is that bug's scar).
 *
 *  The workspace was a URL FRAGMENT until 2026-08-02 — `/#design` — switching hidden panels behind
 *  one route. That is what `DESIGN.md` §5 rules out for this case: "Tabs switch views over one
 *  subject *within* a route. Not for navigation between jobs; that is a route." A fragment is also
 *  invisible to everything that reads a URL: it never reaches a static export's route list, so no
 *  workspace was precached for offline on its own, and none could carry a title of its own.
 */

/** The workspaces a loaded design can be looked at through, in spine order.
 *
 *  Four, since 2026-08-02. `analyze` was one route carrying three of the five jobs P2's *done when*
 *  names — a motor and parameter sweep, a Monte-Carlo dispersion, AND an independent second solver —
 *  while the two cross-checks that belong beside that solver sat in the FLIGHT panel, a workspace
 *  away from it. Splitting on the question each answers puts sweeps with sweeps and every "does
 *  something else agree?" surface in one place. Adding one here is all a new route needs from this
 *  file: the pages, the spine, the sitemap and the session all read it. */
export const WORKSPACES = ["flight", "design", "sweep", "validate"] as const;

export type Workspace = (typeof WORKSPACES)[number];

/** A workspace name that no longer exists, mapped to the one that took its job over.
 *
 *  A session stored before a split names a workspace this build has never heard of, and the generic
 *  fallback is `flight` — which silently moves the flyer somewhere they were not. `analyze` became
 *  `sweep` (the two sweeps and the dispersion stayed together; only the second solver left), so that
 *  is where a session left on it resumes. */
const RETIRED: Record<string, Workspace> = { analyze: "sweep" };

/** What each workspace is called on the spine, and the one line that says what the job IS. The
 *  description is the route's own `<title>`/meta description — a route that cannot say what it is
 *  for is a route a flyer reaches only by knowing it is there, which is a named tell. */
export const WORKSPACE_META: Record<Workspace, { label: string; title: string; description: string }> = {
  flight: {
    label: "Flight",
    title: "Flight",
    description:
      "The simulated flight — apogee, velocity, the plots and the flight path — for the design as it is currently set up.",
  },
  design: {
    label: "Design",
    title: "Design",
    description:
      "Build and edit the rocket on its own to-scale diagram: parts, dimensions, motors, recovery, and the mass and balance they produce.",
  },
  sweep: {
    label: "Sweep",
    title: "Sweep",
    description:
      "Vary one thing and see what it does: compare every motor that fits, sweep a dimension, and run a dispersion study over the whole flight.",
  },
  validate: {
    label: "Cross-check",
    title: "Cross-check",
    description:
      "Loft's answer beside somebody else's — the numbers the design file's own tool stored, its step-by-step flight, and an independent second solver run in the browser.",
  },
};

/** Where a workspace lives. The import screen is the root, so a workspace path is never `/`. */
export function workspacePath(w: Workspace): string {
  return `/${w}`;
}

/** Which workspace a path names, or null for anything else — the root, the docs, an unknown route.
 *  Trailing slashes are tolerated because a static export is served from a host that may add one. */
export function workspaceFromPath(pathname: string | null | undefined): Workspace | null {
  if (!pathname) return null;
  const seg = pathname.replace(/\/+$/, "").replace(/^\//, "");
  return (WORKSPACES as readonly string[]).includes(seg) ? (seg as Workspace) : null;
}

/** A workspace name from somewhere that outlives a build — a saved session, an old bookmark — mapped
 *  onto one that exists, or null if it names nothing. Callers decide what null means; the session
 *  falls back to the flight. */
export function resolveWorkspace(name: string | null | undefined): Workspace | null {
  if (!name) return null;
  if ((WORKSPACES as readonly string[]).includes(name)) return name as Workspace;
  return RETIRED[name] ?? null;
}
