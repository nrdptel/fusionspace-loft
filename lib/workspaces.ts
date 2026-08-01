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
 *  `analyze` still carries sweep, Monte-Carlo AND the cross-checks together; P2's *done when* wants
 *  sweep/Monte-Carlo and validate/cross-check as separate routes, which is the next slice. Adding
 *  one here is all a new route needs from this file. */
export const WORKSPACES = ["flight", "design", "analyze"] as const;

export type Workspace = (typeof WORKSPACES)[number];

/** What each workspace is called on the spine, and the one line that says what the job IS. The
 *  description is the route's own `<title>`/meta description — a route that cannot say what it is
 *  for is a route a flyer reaches only by knowing it is there, which is a named tell. */
export const WORKSPACE_META: Record<Workspace, { label: string; title: string; description: string }> = {
  flight: {
    label: "Flight",
    title: "Flight",
    description:
      "The simulated flight — apogee, velocity, the plots and the flight path — beside the numbers the design file's own tool stored for it.",
  },
  design: {
    label: "Design",
    title: "Design",
    description:
      "Build and edit the rocket on its own to-scale diagram: parts, dimensions, motors, recovery, and the mass and balance they produce.",
  },
  analyze: {
    label: "Analyze",
    title: "Analyze",
    description:
      "Sweep a motor or a dimension, run a dispersion, and cross-check the flight against an independent solver.",
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
