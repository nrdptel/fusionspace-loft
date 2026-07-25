import { execFileSync } from "node:child_process";
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/links";

export const dynamic = "force-static";

const routes = ["/", "/docs", "/docs/methods", "/docs/limitations", "/docs/validation", "/docs/faq"];

/** When the deployed site last actually changed — the head commit's date, not the moment the
 *  build ran. Build time would restamp every page on every deploy, which is both untrue (a docs
 *  page does not change because an unrelated commit shipped) and one more thing that makes two
 *  builds of the same commit differ. Falls back to build time outside a git checkout. */
function lastModified(): Date {
  try {
    const iso = execFileSync("git", ["log", "-1", "--format=%cI"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const at = new Date(iso);
    if (!Number.isNaN(at.getTime())) return at;
  } catch {
    // not a git checkout (or no git) — fall through
  }
  return new Date();
}

export default function sitemap(): MetadataRoute.Sitemap {
  const at = lastModified();
  return routes.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: at,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));
}
