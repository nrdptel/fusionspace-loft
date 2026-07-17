// Service worker for offline use. High-power launches happen where there's no cell
// signal, and Loft's simulation runs entirely client-side — so once it's been loaded
// online, it should work at the pad with no connection: import a design, run the sim,
// and read the plots.
//
// Strategy:
//   - navigations: network-first (an online visitor always gets fresh HTML), falling
//     back to the cached app shell when offline.
//   - other same-origin GETs (JS/CSS/fonts/icons): stale-while-revalidate, so assets
//     load instantly and refresh in the background.
//   - install PRECACHES everything needed to run offline: the app shell, the hashed
//     JS/CSS/font build output, and the bundled sample designs. Precaching the build
//     output is essential, not just an optimisation — on a first visit the script/style
//     chunks load via <script>/<link> tags BEFORE this worker is installed and in
//     control, so stale-while-revalidate never sees them and they'd otherwise never be
//     cached. Without them a returning offline visitor gets the shell HTML but no way to
//     hydrate, i.e. a dead page.
// The cache name carries a per-build id (injected below), so a new deploy lands in a
// fresh cache and the old one is cleared on activate — and the worker's bytes change
// every build that changes an asset, so the update prompt fires reliably.
//
// The one thing that needs a connection is the optional "today's conditions" re-run
// (live weather); everything else is offline by design.

// Replaced at build time by scripts/gen-sw-precache.mjs with a hash of the shipped
// assets; "dev" in the source and in `next dev` (where no service worker is registered).
const BUILD_ID = "dev"; // __BUILD_ID__
const CACHE = `loft-${BUILD_ID}`;
const SHELL = "/";
// The bundled sample designs, fetched on demand (on a "try a sample" click) rather than
// on first paint — so stale-while-revalidate wouldn't have them cached before a user goes
// offline. They ship in the bundle; precache them.
const SAMPLES = [
  "/samples/demo-single-deploy.ork",
  "/samples/demo-dual-deploy.ork",
  "/samples/demo-multi-config.ork",
  "/samples/demo-rocksim.rkt",
];
// The exported JS/CSS/font assets that make the app run. Each carries a per-build content
// hash, so they can't be listed statically here — scripts/gen-sw-precache.mjs enumerates
// out/_next/static/** at build time and injects the list in place of the marker below.
// Empty in the source (and in dev, where the worker isn't registered).
const BUILD_ASSETS = [
  // __BUILD_ASSETS__
];
const PRECACHE = [SHELL, ...SAMPLES, ...BUILD_ASSETS];

self.addEventListener("install", (event) => {
  // Note: no skipWaiting() here. When a controller is already running (an updated
  // visit), the new worker waits so it can't swap assets out from under an open tab;
  // the page shows a "refresh" prompt and calls skipWaiting() via the message below.
  // On a first-ever visit there's no controller, so the browser activates immediately.
  // Best-effort and per-asset (allSettled): a transient failure fetching one entry must
  // not fail the whole install — anything missed is re-cached on first online use anyway.
  event.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u)))).catch(() => {}),
  );
});

// The page posts this when the user accepts the update, letting the waiting worker
// take over; the page then reloads on controllerchange.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(SHELL, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(SHELL, { ignoreSearch: true })),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        // Offline and not cached: resolve to a real 504 Response rather than undefined,
        // which would make respondWith throw and surface as an opaque network error.
        .catch(() => cached || new Response("", { status: 504, statusText: "Offline" }));
      return cached || network;
    }),
  );
});
