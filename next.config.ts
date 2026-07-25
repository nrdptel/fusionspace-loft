import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";

// Static export for Cloudflare Pages. `output: "export"` prerenders every route
// to static HTML in `out/` at build time; there is no Node server at runtime.
//
// `images.unoptimized` is required by static export (no Image Optimization
// server). The security headers that would live in `headers()` move to
// public/_headers (static export can't emit response headers; Cloudflare Pages
// serves _headers).

/** The build id names `_next/static/<id>/` and is embedded in every prerendered page, so Next's
 *  default — a fresh random string per run — makes two builds of the same commit differ. That
 *  churn is not cosmetic on an offline-first app: the service worker's cache is versioned by a
 *  hash of the built output, so a no-op deploy lands in a new cache, prompts every visitor to
 *  refresh, and makes an offline user re-download the whole app for nothing. Naming the build
 *  after the commit makes identical source produce identical output. */
function buildId(): string {
  // GitHub Actions sets GITHUB_SHA; a local build reads the same value from git. Neither is
  // available in a tarball checkout, where a fixed literal is still better than a random one.
  const sha =
    process.env.GITHUB_SHA ??
    (() => {
      try {
        return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        return "";
      }
    })();
  return sha.trim().slice(0, 12) || "source";
}

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  generateBuildId: buildId,
};

export default nextConfig;
