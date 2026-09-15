// Service worker: network-first con fallback cache, per non servire mai
// versioni stale dell'app quando il dispositivo è online.
// "Rete" deve voler dire davvero rete: senza `cache` esplicito anche le fetch del
// worker passano dalla cache HTTP del browser, che può tenere per minuti i file
// della versione precedente (GitHub Pages manda max-age=600).
const CACHE = 'spese-v20';
const ASSETS = ['.', 'index.html', 'style.css', 'app.js', 'db.js', 'categories.js', 'drive-config.js', 'drive.js', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Solo i file dell'app vengono rivalidati (304 se invariati); font e script
  // Google restano con la loro cache normale.
  const own = new URL(e.request.url).origin === self.location.origin;
  e.respondWith(
    fetch(own ? new Request(e.request, { cache: 'no-cache' }) : e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
