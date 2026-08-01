import type { Metadata } from "next";
import { WORKSPACE_META, workspacePath } from "@/lib/workspaces";

const ME = "flight" as const;
const TITLE = `${WORKSPACE_META[ME].title} — Loft`;

/** The flight workspace's own route.
 *
 *  Its content is rendered by the shell in `../layout.tsx`, which holds the design, the solver and
 *  every workspace at once so that moving between them costs the flyer nothing — the note there
 *  explains why. What this file contributes is the route itself: an entry in the static export, a
 *  document the service worker precaches on its own, an address that can be linked and bookmarked,
 *  and a title that says which job the flyer is looking at.
 *
 *  **Deliberately not indexed, and not in `app/sitemap.ts`.** A workspace's content is the flyer's
 *  own design, held on their own device — so the prerendered document is empty by construction, and
 *  a visitor arriving with no design of their own is sent to the import screen. A search result
 *  titled "Flight — Loft" promising apogee and plots, landing on an import screen, is a promise the
 *  page cannot keep. `follow` stays on: the links out of it are real. */
export const metadata: Metadata = {
  title: TITLE,
  description: WORKSPACE_META[ME].description,
  alternates: { canonical: workspacePath(ME) },
  robots: { index: false, follow: true },
  // Inherited whole from the root layout otherwise, so a workspace link pasted into a chat showed
  // the site's generic card pointing at the root — a link that says something other than where it
  // goes.
  openGraph: {
    title: TITLE,
    description: WORKSPACE_META[ME].description,
    url: workspacePath(ME),
  },
  twitter: { title: TITLE, description: WORKSPACE_META[ME].description },
};

export default function FlightPage() {
  return null;
}
