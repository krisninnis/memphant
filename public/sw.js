/**
 * Memphant — Service Worker
 * Caches the app shell so it works offline on mobile.
 * Strategy: Cache-first for assets, network-first for navigation.
 */

const CACHE_NAME = 'memphant-v1';

// App shell files to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
];

// ─── Install: pre-cache the app shell ────────────────────────────────────────

self.addEventListener('install', (event) => {
  // Pre-cache the app shell. Do NOT call skipWaiting() here — forcing
  // immediate activation mid-navigation breaks module script loading on
  // first install (the SW intercepts the JS bundle fetch before it has
  // anything in cache, which can cause a blank screen on first load).
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

// ─── Activate: clean up old caches ───────────────────────────────────────────

self.addEventListener('activate', (event) => {
  // Do NOT call clients.claim() here — claiming open clients mid-navigation
  // causes the same blank-screen race condition as skipWaiting().
  // The SW takes control naturally on the next navigation.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

// ─── Fetch: serve from cache, fall back to network ───────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and non-http requests
  if (!request.url.startsWith('http')) return;

  const url = new URL(request.url);

  // Navigation requests (HTML pages) — network first, fall back to cached index
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache a fresh copy
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match('/index.html').then(
            (cached) => cached ?? new Response('Offline', { status: 503 }),
          ),
        ),
    );
    return;
  }

  // Asset requests (JS, CSS, images, fonts) — cache first, fall back to network
  if (
    url.pathname.match(/\.(js|css|png|svg|ico|woff2?|ttf|webmanifest|json)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request).then((response) => {
          // Only cache successful responses
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      }),
    );
    return;
  }
});

// ─── Message: skip waiting on demand ─────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
   }
});
