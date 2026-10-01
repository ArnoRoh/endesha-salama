// Offline: serve from cache, refresh the cache in the background (stale-while-revalidate).
// Bump CACHE to drop old files after a breaking change.
const CACHE = 'es-v1';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'content.js', 'lessons.json', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((r) => {
      if (r.status === 200) c.put(e.request, r.clone());
      return r;
    }).catch(() => hit);
    if (hit) e.waitUntil(net);
    return hit || net;
  }));
});
