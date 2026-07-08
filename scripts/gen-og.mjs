// Pre-generate the Open Graph / Twitter card PNG at build time (public/og/default.png).
//
// A static export can't render the dynamic next/og route at request time, so we render
// it here in `prebuild` instead. This uses the EXACT shared card template from the HPR
// Motor Finder (the family standard) via next/og's `ImageResponse` — same renderer and
// same font (Geist), so the output matches: sparkle mark → product name → tagline →
// domain, centered on the dark background with the soft indigo glow. The only per-tool
// changes are the three strings below.
//
// The Geist TTFs are loaded and registered explicitly because Satori (next/og) does NOT
// synthesize weight — without the real bold font the `fontWeight: 700` on the title is
// silently dropped to the default single weight, which is why the card must ship the font
// to render bold, matching the Motor Finder's bolded card.
//
// Imported via the explicit `next/og.js` specifier so it resolves from a plain node
// script; the layout is written with React.createElement to keep this a dependency-free
// .mjs, matching the sibling.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import React from "react";
import { ImageResponse } from "next/og.js";

const here = dirname(fileURLToPath(import.meta.url));
const ogDir = resolve(here, "..", "public", "og");
const fontDir = resolve(here, "..", "node_modules", "geist", "dist", "fonts");
const SIZE = { width: 1200, height: 630 };
const h = React.createElement;

// Shared default card — identical template to the Motor Finder's, so the family reads as
// one. Only the name, tagline, and domain differ between tools.
function defaultCard(markUri) {
  return h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        background: "#09090b",
        backgroundImage:
          "radial-gradient(56% 64% at 50% 31%, rgba(99,102,241,0.27) 0%, rgba(99,102,241,0) 76%)",
        color: "#fafafa",
        fontFamily: "Geist",
      },
    },
    h("img", { src: markUri, width: 130, height: 120, style: { marginBottom: 40 } }),
    h(
      "div",
      { style: { fontSize: 100, fontWeight: 700, lineHeight: 1.0, letterSpacing: "-0.03em" } },
      "Loft",
    ),
    h(
      "div",
      { style: { fontSize: 40, fontWeight: 600, color: "#d4d4d8", marginTop: 32, maxWidth: 1040 } },
      "High-power rocketry flight simulator",
    ),
    h(
      "div",
      { style: { fontSize: 26, fontWeight: 400, color: "#818cf8", marginTop: 28, fontFamily: "Geist Mono", letterSpacing: "0.02em" } },
      "loft.fusionspace.co",
    ),
  );
}

async function main() {
  // Extract the embedded sparkle-mark data URI (robust to formatting); shared verbatim
  // with the Motor Finder.
  const markSrc = await readFile(resolve(here, "..", "lib", "og-mark.ts"), "utf-8");
  const markUri = markSrc.match(/data:image\/png;base64,[A-Za-z0-9+/=]+/)?.[0];
  if (!markUri) throw new Error("gen-og: could not extract OG_MARK_PNG from lib/og-mark.ts");

  // Register Geist at the weights the card uses so Satori renders them for real (700 for the
  // bold title, 600 for the tagline, 400 mono for the domain) instead of dropping the weight.
  const [bold, semibold, mono] = await Promise.all([
    readFile(resolve(fontDir, "geist-sans", "Geist-Bold.ttf")),
    readFile(resolve(fontDir, "geist-sans", "Geist-SemiBold.ttf")),
    readFile(resolve(fontDir, "geist-mono", "GeistMono-Regular.ttf")),
  ]);

  await mkdir(ogDir, { recursive: true });
  const resp = new ImageResponse(defaultCard(markUri), {
    ...SIZE,
    fonts: [
      { name: "Geist", data: bold, weight: 700, style: "normal" },
      { name: "Geist", data: semibold, weight: 600, style: "normal" },
      { name: "Geist Mono", data: mono, weight: 400, style: "normal" },
    ],
  });
  await writeFile(resolve(ogDir, "default.png"), Buffer.from(await resp.arrayBuffer()));
  console.log("gen-og: wrote public/og/default.png");
}

await main();
