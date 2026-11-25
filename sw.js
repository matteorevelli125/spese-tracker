// Service worker "prima la cache", con versioni intere.
//
// L'app si apre subito dai file salvati sul telefono (anche offline), qualunque
// sia il numero di script. Ogni rilascio cambia CACHE (deploy.sh), quindi il
// browser scarica in background il nuovo sw.js, che salva TUTTI i file della
// nuova versione in una cache nuova e poi prende il controllo: la pagina mostra
// "Nuova versione pronta · Aggiorna" e la versione nuova si usa da quel momento
// o dall'apertura successiva. Una pagina carica sempre file di una sola versione:
// mai un misto di vecchio e nuovo (che con lo schema del DB sarebbe pericoloso).
const CACHE = 'spese-v28';
const ASSETS = ['.', 'index.html', 'style.css', 'app.js', 'snapshots.js', 'db.js', 'money.js', 'ledger.js', 'sanitize.js', 'backup.js', 'ui.js', 'people.js', 'split-ui.js', 'people-ui.js', 'events-ui.js', 'categories.js', 'drive-config.js', 'drive.js', 'manifest.webmanifest', 'favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', e => {
  // `?v=CACHE` scavalca anche la cache della CDN di GitHub Pages: la nuova versione
  // non può finire con un file della precedente. Si salva con l'URL pulito.
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ASSETS.map(async u => {
    const res = await fetch(new Request(`${u}${u.includes('?') ? '&' : '?'}v=${CACHE}`, { cache: 'reload' }));
    if (!res.ok) throw new Error(`${u}: HTTP ${res.status}`); // installazione fallita: resta la versione attuale
    await c.put(u, res);
  }))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Solo i file dell'app; font e script Google seguono la loro cache normale.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const hit = await caches.match(e.request, { ignoreSearch: true, cacheName: CACHE });
    if (hit) return hit;
    try {
      return await fetch(e.request); // file non in elenco: rete
    } catch (err) {
      return (await caches.match(e.request, { ignoreSearch: true })) || Response.error();
    }
  })());
});
