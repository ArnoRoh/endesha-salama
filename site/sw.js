// Offline: serve from cache, refresh the cache in the background (stale-while-revalidate).
// Bump CACHE to drop old files after a breaking change.
const CACHE = 'es-v21';
const SHELL = [
  './', 'index.html', 'style.css', 'app.js', 'content.js', 'art.js', 'lessons.json', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'fonts/overpass.woff2', 'work.html', 'manifest-work.webmanifest',
  'art/bike-check.webp', 'art/tyre-pressure.webp', 'art/brake-test.webp', 'art/lights-check.webp', 'art/weak-brakes.webp', 'art/chain-fuel.webp',
  'art/helmet-on.webp', 'art/strap-closed.webp', 'art/vest.webp', 'art/boots-gloves.webp', 'art/strap-open.webp', 'art/flip-flop.webp', 'art/two-helmets.webp',
  'art/steady-speed.webp', 'art/following-gap.webp', 'art/wet-road.webp', 'art/night-ride.webp', 'art/blind-overtake.webp', 'art/junction-stop.webp',
  'art/one-passenger.webp', 'art/passenger-helmet.webp', 'art/secure-load.webp', 'art/three-passengers.webp', 'art/wide-load.webp', 'art/passenger-footrests.webp',
  'art/refuse-alcohol.webp', 'art/park-to-phone.webp', 'art/rest-break.webp', 'art/phone-riding.webp', 'art/two-beers.webp', 'art/safe-rest.webp',
  'art/warn-traffic.webp', 'art/emergency-call.webp', 'art/leave-helmet.webp', 'art/cloth-pressure.webp', 'art/neck-still.webp', 'art/location-call.webp',
  'art/fire-find-exit.webp', 'art/gas-chained.webp', 'art/exit-clear.webp', 'art/hot-work.webp', 'art/assembly-point.webp', 'art/gas-loose.webp',
  'art/pallets-exit.webp', 'art/alarm-sounds.webp', 'art/gas-hiss.webp', 'art/lift-help.webp', 'art/lift-knees.webp', 'art/under-load.webp',
  'art/pallet-jack.webp', 'art/tidy-floor.webp', 'art/bad-lift.webp', 'art/ibc-foot.webp', 'art/heavy-sack.webp', 'art/wet-walkway.webp',
  'art/safety-shoes.webp', 'art/goggles.webp', 'art/ear-muffs.webp', 'art/work-gloves.webp', 'art/gear-check.webp', 'art/shoes-gloves.webp',
  'art/knife-cut.webp', 'art/loud-room.webp', 'art/hot-steam.webp', 'art/spot-hazard.webp', 'art/box-falls.webp', 'art/scan-report.webp',
  'art/hurt-help.webp', 'art/first-aid-box.webp', 'art/loose-fan.webp', 'art/bee-sting.webp',
  'art/ladder-check.webp', 'art/ladder-climb.webp', 'art/ladder-angle.webp', 'art/roof-guard.webp', 'art/tools-secure.webp', 'art/ladder-cracked.webp', 'art/carry-climb.webp', 'art/ladder-reach.webp', 'art/work-below.webp', 'art/cable-check.webp', 'art/wet-switch.webp', 'art/machine-off.webp', 'art/lock-tag.webp', 'art/electrician.webp', 'art/cable-taped.webp', 'art/wet-hands.webp', 'art/lock-removed.webp', 'art/fan-repair.webp',
  'art/chem-label.webp', 'art/chem-store.webp', 'art/fuel-store.webp', 'art/spill.webp', 'art/wash-hands.webp', 'art/drink-bottle.webp', 'art/food-store.webp', 'art/spill-hose.webp', 'art/chem-eyes.webp', 'art/heat-signs.webp', 'art/drink-water.webp', 'art/shade-rest.webp', 'art/handwash.webp', 'art/faint.webp', 'art/water-break.webp', 'art/dizzy.webp', 'art/hands-food.webp', 'art/collapse.webp',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => /^es-v\d+$/.test(k) && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  if (/\/(api|admin)(\/|$)/.test(new URL(e.request.url).pathname)) return; // staff data and the admin portal are never cached
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((r) => {
      if (r.status === 200) c.put(e.request.url.split('?')[0], r.clone()); // no ?c=code in cache keys
      return r;
    }).catch(() => hit);
    if (hit) e.waitUntil(net);
    return hit || net;
  }));
});
