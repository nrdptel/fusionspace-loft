import type { Metadata } from "next";
import RetiredWorkspace from "@/components/RetiredWorkspace";

/** `/analyze` — the address the sweeps and the cross-checks shared before they were split apart.
 *
 *  It existed for part of one day, which is long enough to be in somebody's history and in a link
 *  they sent. A retired address that answers with the 404 page is a one-way door for whoever
 *  followed it, so this route stays and forwards. The mapping is the same one the saved session
 *  uses (`RETIRED` in `lib/workspaces.ts`): the two sweeps and the dispersion kept this workspace's
 *  job, and only the second solver left it.
 *
 *  Deliberately not indexed and not in the sitemap — it is a forward, not a page. */
export const metadata: Metadata = {
  title: "Sweep — Loft",
  robots: { index: false, follow: false },
  alternates: { canonical: "/sweep" },
};

export default function AnalyzePage() {
  return <RetiredWorkspace from="analyze" />;
}
