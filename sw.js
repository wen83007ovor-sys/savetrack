// Service Worker for 省錢計劃 (Budget Tracker)
//
// Strategy: "Network-first, cache as fallback"
// - Every time the app opens, it tries to fetch the LATEST version from the network first.
// - If that succeeds, it updates the cache AND serves the fresh content immediately.
// - If the network fails (offline), it falls back to whatever was last cached,
//   so the app still opens instead of showing a blank/error screen.
//
// IMPORTANT: bump CACHE_VERSION whenever you want to force all clients to treat
// this as a "new" service worker (this also helps during debugging). It is not
// strictly required for normal updates to work, since network-first always tries
// fresh content first — but bumping it cleans out old cache entries.
const CACHE_VERSION = 'v1';
const CACHE_NAME = `budget-tracker-${CACHE_VERSION}`;

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// ── Install: pre-cache the core files so there's an offline fallback from day one ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  // NOTE: skipWaiting() is intentionally NOT called automatically here anymore.
  // Instead we wait for the page to explicitly ask us to (via the "Update now" banner button),
  // so the user gets a chance to see the update notice before the page reloads underneath them.
});

// Listen for the page asking us to activate the new version immediately
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Activate: clean up old cache versions from previous deployments ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('budget-tracker-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim(); // take control of any already-open tabs right away
});

// ── Fetch: network-first, cache fallback ──
self.addEventListener('fetch', (event) => {
  // Only handle GET requests for our own origin (skip Google Fonts CDN, etc. — let those
  // go through normal browser caching rules instead of our custom logic).
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Got a fresh response from the network — update the cache for next time we're offline.
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return networkResponse;
      })
      .catch(() => {
        // Network failed (offline, or GitHub Pages unreachable) — serve from cache instead.
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Last resort for navigations: fall back to the cached index page.
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
