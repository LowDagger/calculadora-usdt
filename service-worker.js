// ─── Version ──────────────────────────────────────────────────────────────────
// Bump APP_VERSION on every new deployment to bust the old cache automatically.
const APP_VERSION  = '53';
const CACHE_NAME   = `calcuflow-v${APP_VERSION}`;

// ─── Pre-cache manifest ───────────────────────────────────────────────────────
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/js/app.js',
  '/js/api.js',
  '/js/bcv-rates.js',
  '/js/bank-logo.js',
  '/js/bank-logo-processing.js',
  '/js/bank-profiles.js',
  '/js/calculator.js',
  '/js/changelog.js',
  '/js/modal-controller.js',
  '/js/rates-controller.js',
  '/js/settings-controller.js',
  '/js/share.js',
  '/js/storage.js',
  '/js/ui.js',
  '/js/utils.js',
  '/assets/icon.svg',
  '/assets/telegram-qr.webp',
  '/assets/banks/banco-de-venezuela.png',
  '/assets/banks/bbva-provisional.png',
  '/assets/banks/banco-del-tesoro.png',
  '/assets/banks/bancamiga.png',
  '/assets/banks/banesco-provisional.png',
  '/assets/banks/bnc.png',
];
const PRECACHE_PATHS = new Set(PRECACHE_ASSETS);

// ─── Install ──────────────────────────────────────────────────────────────────
// Pre-cache all assets and immediately take control (no waiting for old tabs).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())   // activate as soon as install is done
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────
// Purge every cache that doesn't match the current version, then claim clients
// so open tabs are immediately controlled by the new worker.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch strategies ─────────────────────────────────────────────────
// Strategy:
//  • Non-GET or cross-origin → pass through to the network, no caching.
//  • Navigation (HTML pages) → network-first; fall back to cached /index.html
//    so the app remains usable offline.
//  • Precached static assets → cache-first; APP_VERSION provides freshness.
//  • Other static assets → stale-while-revalidate (existing behavior).
self.addEventListener('fetch', (event) => {
  // Only handle same-origin GET requests
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.startsWith('/api/')) return;

  // ── Navigation requests (page loads) ──
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Update the cached shell on every successful page load
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
          return networkResponse;
        })
        .catch(() => caches.match('/index.html'))   // offline fallback
    );
    return;
  }

  // ── Known precached assets – Cache-First ──
  if (PRECACHE_PATHS.has(requestUrl.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request, { ignoreSearch: true }).then((cachedResponse) =>
          cachedResponse || fetch(event.request)
        )
      )
    );
    return;
  }

  // ── Other static assets – Stale-While-Revalidate ──
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
        // Always kick off a background network fetch to keep the cache fresh
        const networkFetch = fetch(event.request)
          .then((networkResponse) => {
            // Only cache valid same-origin responses
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => null);   // network error → ignore; cached copy will serve

        // Return cached immediately, or wait for network if nothing is cached
        return cachedResponse || networkFetch;
      })
    )
  );
});

// ─── Message ──────────────────────────────────────────────────────────────────
// The app posts { type: 'SKIP_WAITING' } to trigger activation of the waiting
// worker without the user needing to close all tabs.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
