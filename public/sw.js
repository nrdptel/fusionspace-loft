// Service worker for offline use. High-power launches happen where there's no cell
// signal, and Loft's simulation runs entirely client-side — so once it's been loaded
// online, it should work at the pad with no connection: import a design, run the sim,
// and read the plots.
//
// Strategy:
//   - navigations: network-first (an online visitor always gets fresh HTML), falling
//     back offline to the cached copy of THAT page, and to the app shell only for a
//     route that was never cached.
//   - other same-origin GETs (JS/CSS/fonts/icons): stale-while-revalidate, so assets
//     load instantly and refresh in the background.
//   - install PRECACHES everything needed to run offline: every prerendered route, the
//     hashed JS/CSS/font build output, and the bundled sample designs. Precaching the
//     build output is essential, not just an optimisation — on a first visit the
//     script/style chunks load via <script>/<link> tags BEFORE this worker is installed
//     and in control, so stale-while-revalidate never sees them and they'd otherwise
//     never be cached. Without them a returning offline visitor gets the shell HTML but
//     no way to hydrate, i.e. a dead page. Precaching every route matters for the same
//     reason the app is offline-first at all: the limitations log and the methods write-up
//     are what tell a flyer how much to trust a number, and the pad is exactly where that
//     question gets asked — with no signal to go and fetch them.
// The cache name carries a per-build id (injected below), so a new deploy lands in a
// fresh cache and the old one is cleared on activate — and the id hashes both the asset
// list and every route's HTML, so the worker's bytes change on any build that changes
// what's served (a docs rewrite included) and the update prompt fires reliably.
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
//
// **Enumerated at build time rather than listed here, because the hand-written list drifted and
// nothing noticed for three days.** These filenames are stable, unlike the hashed chunks below, so
// a static list looked safe — and then `public/samples/` went from four designs to eight on
// 2026-08-08 and this array stayed at four. Offline, half the "try a bundled example" chips on the
// front door returned the worker's own synthetic 504: the exact pad-with-no-signal case the offline
// claim is sold on. `scripts/gen-sw-precache.mjs` reads `out/samples/` and injects the list, so
// adding a sample cannot forget this file.
const SAMPLES = [
  // __BUILD_SAMPLES__
];
// The exported JS/CSS/font assets that make the app run. Each carries a per-build content
// hash, so they can't be listed statically here — scripts/gen-sw-precache.mjs enumerates
// out/_next/static/** at build time and injects the list in place of the marker below.
// Empty in the source (and in dev, where the worker isn't registered).
const BUILD_ASSETS = [
  // __BUILD_ASSETS__
];
// **Next's client-router payloads — `<route>.txt` and the per-segment `__next.*.txt` — and this
// list is the difference between an app that works at the pad and one that loops.** Measured
// 2026-08-18, before it existed: with a design open and the network off, a workspace route ran 38
// main-frame navigations in 3 seconds and did not stop. The router asks for these on every
// client-side navigation; with none cached the worker answered its own 504 below, the router
// downgraded to a HARD navigation, that reload re-ran the session restore, and the restore issued
// the same navigation again. Injected by `scripts/gen-sw-precache.mjs`, like everything above.
const BUILD_PAYLOADS = [
  // __BUILD_PAYLOADS__
];
// The rest of what a page renders — wordmark, icons, web manifest, the RocketPy worker. The asset
// walk reads `out/_next/static` only, so offline the two brand SVGs returned a 504 and the app came
// back with no logo. Enumerate-and-subtract at build time; the exclusions are argued for there.
const BUILD_MEDIA = [
  // __BUILD_MEDIA__
];
// Every prerendered route, injected the same way. "/" is in here, so it covers the shell.
const ROUTES = [
  SHELL,
  // __BUILD_ROUTES__
];

// Page HTML is cached under a normalised path — "/docs", never "/docs/" — because hosts
// disagree about which form is canonical: Cloudflare Pages serves /docs directly, while the
// local `serve` used by the e2e run 301s it to /docs/. Normalising both the write and the
// read means an offline visitor gets the page they asked for under either host.
function pageKey(pathname) {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

// A page replayed from the cache for a navigation must not carry fetch's "redirected" flag:
// responding to a navigation with a redirected Response is a TypeError, and following a host
// redirect is exactly how some of these get fetched. Rebuilding the Response from its body
// drops the flag. Only the content type is worth keeping — the rest are the host's to set.
async function pageCopy(res) {
  return new Response(await res.blob(), {
    status: 200,
    statusText: "OK",
    headers: { "content-type": res.headers.get("content-type") || "text/html; charset=utf-8" },
  });
}

async function precache() {
  const c = await caches.open(CACHE);
  // Best-effort and per-entry (allSettled): a transient failure fetching one entry must not
  // fail the whole install — anything missed is re-cached on first online use anyway.
  await Promise.allSettled([
    ...ROUTES.map(async (path) => {
      const res = await fetch(path, { credentials: "same-origin" });
      if (res.ok) await c.put(pageKey(path), await pageCopy(res));
    }),
    ...SAMPLES.map((u) => c.add(u)),
    ...BUILD_ASSETS.map((u) => c.add(u)),
    // Fetched WITHOUT the router's `?_rsc=` cache-buster and read back with `ignoreSearch`, so one
    // cached copy answers whatever query the router appends. On a static export the query changes
    // nothing about what the host returns.
    ...BUILD_PAYLOADS.map((u) => c.add(u)),
    ...BUILD_MEDIA.map((u) => c.add(u)),
  ]);
}

self.addEventListener("install", (event) => {
  // Note: no skipWaiting() here. When a controller is already running (an updated
  // visit), the new worker waits so it can't swap assets out from under an open tab;
  // the page shows a "refresh" prompt and calls skipWaiting() via the message below.
  // On a first-ever visit there's no controller, so the browser activates immediately.
  event.waitUntil(precache().catch(() => {}));
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
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // The self-hosted RocketPy runtime (~40 MB of Pyodide + wheels) is immutable and version-pinned,
  // and it's fetched only when a flyer opts in to the second solver. Serve it cache-first: once
  // downloaded it works offline at the pad, and — unlike stale-while-revalidate — repeat runs don't
  // re-download tens of MB in the background to "refresh" bytes that never change. A new deploy's
  // fresh build cache (and the activate cleanup below) re-fetches it, so it can't go stale.
  if (url.pathname.startsWith("/pyodide/")) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req)
            .then((res) => {
              if (res && res.status === 200) {
                const copy = res.clone();
                caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
              }
              return res;
            })
            .catch(() => new Response("", { status: 504, statusText: "Offline" })),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    const key = pageKey(url.pathname);
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches
              .open(CACHE)
              .then(async (c) => c.put(key, await pageCopy(copy)))
              .catch(() => {});
          }
          return res;
        })
        // Offline: the page that was actually asked for, and the shell only for a route
        // that was never cached — so /docs/limitations reads as the limitations log rather
        // than silently serving the landing page under the URL of something else.
        .catch(() => caches.match(key).then((hit) => hit || caches.match(SHELL))),
    );
    return;
  }

  // A router payload is precached under its bare path while the router asks for it with a per-build
  // `?_rsc=` cache-buster, so an exact match misses every time — which is how a fully-precached app
  // still looped offline. `ignoreSearch` only for these: a hashed chunk carries no query at all, and
  // ignoring the search anywhere else would let one request answer another's.
  // A router payload is precached under its bare path while the router asks for it with a per-build
  // `?_rsc=` cache-buster, so an exact match misses every time — which is how a fully-precached app
  // still looped offline. `ignoreSearch` only for these: a hashed chunk carries no query at all, and
  // ignoring the search anywhere else would let one request answer another's.
  //
  // **A `<Link>` PREFETCH of a page is NOT normalised here, and that was tried and measured out.**
  // Those requests ask for `/design/` while the navigate branch caches under `/design`, so they miss
  // and fail offline. Routing them through `pageKey` fixes the miss and changes nothing a flyer can
  // see: measured 2026-08-18, four offline spine clicks cost four hard navigations before and after,
  // and the same eight prefetches still fail. Next's static-export router decides to hard-navigate
  // for its own reasons, upstream of the cache. Left out rather than shipped as a correct-looking
  // change with no effect.
  const isPayload = url.pathname.endsWith(".txt");
  event.respondWith(
    caches.match(req, isPayload ? { ignoreSearch: true } : undefined).then((cached) => {
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
