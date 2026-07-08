import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { observancesForDate } from "@/lib/observances";
import { SITE_URL } from "@/lib/links";
import ServiceWorker from "@/components/ServiceWorker";
import "./globals.css";

// Origin used to resolve OG / Twitter card image URLs absolutely. Defaults to the
// production site; a fork can override with NEXT_PUBLIC_SITE_URL on its deploy host
// (Cloudflare Pages) to point cards at its own domain. Mirrors the sibling tools.
const siteUrl = SITE_URL;

const DESCRIPTION =
  "A flight simulator for high-power rocketry that runs in your browser and works on a phone. " +
  "Import an OpenRocket .ork design and get apogee, max velocity and Mach, stability margin, " +
  "rail-exit speed, and descent and drift — with the model's assumptions and accuracy shown. " +
  "No accounts, no tracking, no verdicts.";

const TITLE = "Loft — HPR flight simulator";

// Pre-generated at build by scripts/gen-og.mjs (a static export can't render the dynamic
// next/og route at request time). Resolved absolutely against metadataBase. Uses the HPR
// Motor Finder's exact card template so the family reads as one.
const OG_IMAGE = "/og/default.png";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Loft",
  manifest: "/manifest.webmanifest",
  // iOS home-screen install: launch full-screen (standalone) with our own title,
  // not the page <title>. Android/desktop get this from the manifest's display mode.
  appleWebApp: {
    capable: true,
    title: "Loft",
    statusBarStyle: "default",
  },
  alternates: { canonical: "/" },
  icons: {
    icon: { url: "/icon.svg", type: "image/svg+xml" },
    apple: { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
  },
  openGraph: {
    type: "website",
    siteName: "Loft",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  colorScheme: "light dark",
};

// Set the theme class before first paint so there's no flash. Mirrors the hub and the
// Motor Finder; the key is namespaced per tool.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('loft.theme');var e=document.documentElement;e.classList.toggle('dark',t==='dark');e.classList.toggle('light',t==='light');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Thin accent rule(s) for the month's awareness observance(s). Fixed at build time on a
  // static export; a monthly rebuild rolls it over (see the deploy workflow). Decorative,
  // so aria-hidden — the footer carries the worded line.
  const bars = observancesForDate()
    .map((o) => o.bar)
    .filter((b): b is NonNullable<typeof b> => Boolean(b));

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <ServiceWorker />
        {bars.map((b, i) => (
          <div
            key={i}
            aria-hidden
            title={b.title}
            className="h-1.5 w-full shrink-0"
            style={{ background: b.background }}
          />
        ))}
        {children}
      </body>
    </html>
  );
}
