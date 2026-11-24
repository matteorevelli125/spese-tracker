// Golden test, passo 1: ricrea il DB locale com'è in produzione oggi (schema v2)
// con i dati del backup indicato, poi apre l'app con freeze-time e probe.
//
//   /__golden/seed.html?data=<file.json>&label=<nome>&now=AAAA-MM-GG
//
// Il DB viene scritto "a mano" (non con l'import dell'app) così la versione
// vecchia e quella nuova partono da record identici, id compresi. Se l'app
// nuova usa uno schema più recente, la sua migrazione gira su questi dati:
// è proprio quello che succederà sul telefono.
(async () => {
  const status = document.getElementById('status');
  const say = t => { status.textContent = t; };
  try {
    const qs = new URLSearchParams(location.search);
    const dataName = qs.get('data');
    const label = qs.get('label');
    const now = qs.get('now');
    if (!dataName || !label || !now) throw new Error('servono i parametri data, label e now');

    const res = await fetch('/__golden/data/' + encodeURIComponent(dataName), { cache: 'no-store' });
    if (!res.ok) throw new Error('dati non trovati: ' + dataName);
    const data = await res.json();

    // Eventuale service worker di una run precedente: via, per non servire file vecchi.
    if (navigator.serviceWorker) {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    }

    say('Cancello il database locale…');
    await new Promise((resolve, reject) => {
      const del = indexedDB.deleteDatabase('spese-tracker');
      del.onsuccess = resolve;
      del.onerror = () => reject(del.error);
      del.onblocked = () => reject(new Error('DB bloccato: chiudi le altre schede di questo indirizzo'));
    });

    say('Ricreo lo schema v2 e carico i dati…');
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('spese-tracker', 2);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        d.createObjectStore('expenses', { keyPath: 'id', autoIncrement: true }).createIndex('date', 'date');
        d.createObjectStore('budgets', { keyPath: 'cat' });
        d.createObjectStore('recurring', { keyPath: 'id', autoIncrement: true });
        d.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const t = db.transaction(['expenses', 'budgets', 'recurring', 'meta'], 'readwrite');
      (data.expenses || []).forEach(e => t.objectStore('expenses').put(e));
      (data.budgets || []).forEach(b => t.objectStore('budgets').put(b));
      (data.recurring || []).forEach(r => t.objectStore('recurring').put(r));
      // In produzione la migrazione delle categorie (v2) è già stata fatta.
      t.objectStore('meta').put({ key: 'schemaVersion', value: 2 });
      Object.entries(data.meta || {}).forEach(([key, value]) => t.objectStore('meta').put({ key, value }));
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
    db.close();

    say(`Caricati ${(data.expenses || []).length} movimenti. Apro l'app…`);
    location.href = `/index.html?golden=1&label=${encodeURIComponent(label)}&now=${encodeURIComponent(now)}`;
  } catch (err) {
    document.title = 'GOLDEN ERRORE';
    say('Errore: ' + err.message);
  }
})();
