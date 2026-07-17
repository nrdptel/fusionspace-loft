// Service worker for offline use. High-power launches happen where there's no cell
// signal, and Loft's simulation runs entirely client-side — so once it's been loaded
// online, it should work at the pad with no connection: import a design, run the sim,
// and read the plots. The bundled motor database and the app shell are all that's needed.
//
// Strategy:
//   - navigations: network-first (an online visitor always gets fresh HTML), falling
//     back to the cached app shell when offline.
//   - other same-origin GETs (JS/CSS/fonts/icons): stale-while-revalidate, so assets
//     load instantly and refresh in the background.
//   - install precaches the app shell AND the bundled sample designs, which are fetched
//     on demand (not on first paint) — so the "try a sample" buttons work offline even
//     if the visitor never clicked one while online.
// The cache name is versioned; old caches are cleared on activate.
//
// The one thing that needs a connection is the optional "today's conditions" re-run
// (live weather); everything else is offline by design.

const CACHE = "loft-v2";
const SHELL = "/";
// Assets loaded on demand rather than on first paint, so stale-while-revalidate wouldn't
// have them cached before a user goes offline. The samples ship in the bundle; precache them.
const PRECACHE = [
  SHELL,
  "/samples/demo-single-deploy.ork",
  "/samples/demo-dual-deploy.ork",
  "/samples/demo-multi-config.ork",
  "/samples/demo-rocksim.rkt",
];

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
