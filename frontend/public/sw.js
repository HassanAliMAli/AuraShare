// Only provide an offline navigation fallback. Never cache transfers or API data.
const CACHE = 'aurashare-offline-v1';
const OFFLINE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('aurashare-offline-') && key !== CACHE)
      .map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.mode !== 'navigate' || url.origin !== self.location.origin ||
      (url.pathname !== '/' && url.pathname !== '/app')) return;
  event.respondWith(fetch(event.request).catch(async () =>
    (await caches.open(CACHE)).match(OFFLINE).then((response) => response ?? Response.error()),
  ));
});
