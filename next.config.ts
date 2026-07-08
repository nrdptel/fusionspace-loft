import type { NextConfig } from "next";

// Static export for Cloudflare Pages. `output: "export"` prerenders every route
// to static HTML in `out/` at build time; there is no Node server at runtime.
//
// `images.unoptimized` is required by static export (no Image Optimization
// server). The security headers that would live in `headers()` move to
// public/_headers (static export can't emit response headers; Cloudflare Pages
// serves _headers).
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
