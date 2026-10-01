// Offline: serve from cache, refresh the cache in the background (stale-while-revalidate).
// Bump CACHE to drop old files after a breaking change.
const CACHE = 'es-v6';
const SHELL = [
  './', 'index.html', 'style.css', 'app.js', 'content.js', 'art.js', 'lessons.json', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'art/bike-check.webp', 'art/tyre-pressure.webp', 'art/brake-test.webp', 'art/lights-check.webp', 'art/weak-brakes.webp', 'art/chain-fuel.webp',
  'art/helmet-on.webp', 'art/strap-closed.webp', 'art/vest.webp', 'art/boots-gloves.webp', 'art/strap-open.webp', 'art/flip-flop.webp', 'art/two-helmets.webp',
  'art/steady-speed.webp', 'art/following-gap.webp', 'art/wet-road.webp', 'art/night-ride.webp', 'art/blind-overtake.webp', 'art/junction-stop.webp',
  'art/one-passenger.webp', 'art/passenger-helmet.webp', 'art/secure-load.webp', 'art/three-passengers.webp', 'art/wide-load.webp', 'art/passenger-footrests.webp',
  'art/refuse-alcohol.webp', 'art/park-to-phone.webp', 'art/rest-break.webp', 'art/phone-riding.webp', 'art/two-beers.webp', 'art/safe-rest.webp',
  'art/warn-traffic.webp', 'art/emergency-call.webp', 'art/leave-helmet.webp', 'art/cloth-pressure.webp', 'art/neck-still.webp', 'art/location-call.webp',
];

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
