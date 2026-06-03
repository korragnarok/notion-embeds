// @helloitskortny — TikTok Shop Creator Hub
// Service Worker v1.1

const CACHE_NAME = 'kortny-hub-v2';
const RUNTIME_CACHE = 'kortny-runtime-v2';

// App shell — everything needed to load offline
const APP_SHELL = [
  '/index.html',
  '/dashboard.html',
  '/commissions.html',
  '/video-tracker.html',
  '/daily-sales-calendar.html',
  '/level-ladder.html',
  '/products.html',
  '/hooks.html',
  '/script-generator.html',
  '/daily-todo.html',
  '/manifest.json'
];

// External assets to cache on first fetch (fonts etc)
const CACHE_PATTERNS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com'
];

// ─── Install: pre-cache app shell ───────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing kortny-hub-v2...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        // Use individual adds so one 404 doesn't break everything
        return Promise.allSettled(
          APP_SHELL.map(url => cache.add(url).catch(err => {
            console.warn('[SW] Failed to cache:', url, err);
          }))
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ─── Activate: clean up old caches ──────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== RUNTIME_CACHE)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// ─── Fetch: network-first for API, cache-first for assets ───────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension requests
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Notion API + Anthropic API — always network, never cache
  if (
    url.hostname === 'kortny-api.vercel.app' ||
    url.hostname === 'api.anthropic.com'
  ) {
    event.respondWith(
      fetch(request).catch(() => new Response(
        JSON.stringify({ error: 'Offline — cannot reach API' }),
        { headers: { 'Content-Type': 'application/json' }, status: 503 }
      ))
    );
    return;
  }

  // External cacheable assets (fonts, CDN scripts)
  const isExternal = CACHE_PATTERNS.some(p => url.hostname.includes(p));
  if (isExternal) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // App shell HTML + local assets — cache-first, fallback to network
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) {
          // Background revalidate (stale-while-revalidate)
          const fetchPromise = fetch(request).then(response => {
            if (response.ok) {
              caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
            }
            return response;
          }).catch(() => {});
          return cached;
        }
        // Not in cache — fetch and cache it
        return fetch(request).then(response => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
          }
          return response;
        }).catch(() => {
          // Offline fallback — try index.html
          return caches.match('/index.html');
        });
      })
    );
    return;
  }
});

// ─── Message: force update from app ─────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => caches.delete(RUNTIME_CACHE));
  }
});
