// Shared outbound links. The site origin resolves the same way the metadata,
// robots, and sitemap do — a fork can point it at its own domain with
// NEXT_PUBLIC_SITE_URL.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://loft.fusionspace.co";
export const HUB_URL = "https://fusionspace.co";
export const REPO_URL = "https://github.com/nrdptel/fusionspace-loft";
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
