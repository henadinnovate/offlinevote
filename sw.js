/**
 * OFFLINE Live Arena — Service Worker (Network-First App Shell Cache)
 */
const CACHE_NAME = 'offline-live-arena-v6';
const APP_SHELL = [
  '/',
  '/index.html',
  '/base.css?v=20261029.6',
  '/tokens.css?v=20261029.6',
  '/styles.css?v=20261029.6',
  '/app.js?v=20261029.6',
  '/manifest.webmanifest?v=20261029.6',
  '/assets/offline-logo.jpg',
  '/assets/offline-banner.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html')))
  );
});
