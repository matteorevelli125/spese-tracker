// Wrapper minimale su IndexedDB.
const DB_NAME = 'spese-tracker';
// v3 (spese condivise): aggiunge `people`, `events`, `settlements`. Migrazione SOLO
// additiva (RD-1): nessun record esistente viene riscritto.
const DB_VERSION = 3;
let _db = null;
let _opening = null;

const getAllFrom = (db, store) => new Promise((resolve, reject) => {
  const req = db.transaction(store).objectStore(store).getAll();
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

// RD-12: prima di aggiornare lo schema, copia dei dati com'erano nel DB di backup
// separato (snapshots.js). Apre il DB SENZA versione, quindi non avvia migrazioni.
// → { filename, fromVersion, count } se ha copiato, null se non serve.
function snapshotBeforeUpgrade() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onerror = () => reject(req.error);
    req.onsuccess = async () => {
      const db = req.result;
      try {
        // DB nuovo (appena creato vuoto) o già aggiornato: niente da copiare.
        if (db.version >= DB_VERSION || !db.objectStoreNames.contains('expenses')) return resolve(null);
        const read = n => (db.objectStoreNames.contains(n) ? getAllFrom(db, n) : Promise.resolve([]));
        const [expenses, budgets, recurring] = await Promise.all([read('expenses'), read('budgets'), read('recurring')]);
        const now = new Date();
        const day = now.toLocaleDateString('sv-SE');
        const filename = `spese-pre-v${DB_VERSION}-${day}.json`;
        // Formato v1: si reimporta sia in questa versione sia in quelle precedenti.
        const json = JSON.stringify({ version: 1, exported: now.toISOString(), source: `pre-v${DB_VERSION}`, expenses, budgets, recurring }, null, 2);
        await Snapshots.save({ kind: 'pre-upgrade', fromVersion: db.version, toVersion: DB_VERSION, filename, json });
        resolve({ filename, fromVersion: db.version, count: expenses.length });
      } catch (err) {
        reject(err);
      } finally {
        db.close();
      }
    };
  });
}

function openDB() {
  if (_db) return Promise.resolve(_db);
  if (_opening) return _opening; // un'unica apertura anche con tante chiamate in parallelo all'avvio
  _opening = (async () => {
    // La migrazione è additiva: se la copia fallisce si prosegue comunque, ma lo si
    // registra (il popup di aggiornamento proporrà l'export manuale).
    let upgrade = null;
    try { upgrade = await snapshotBeforeUpgrade(); }
    catch (err) { upgrade = { error: String(err && err.message || err) }; }

    let wasBlocked = false;
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('expenses')) {
          const s = d.createObjectStore('expenses', { keyPath: 'id', autoIncrement: true });
          s.createIndex('date', 'date');
        }
        if (!d.objectStoreNames.contains('budgets')) d.createObjectStore('budgets', { keyPath: 'cat' });
        if (!d.objectStoreNames.contains('recurring')) d.createObjectStore('recurring', { keyPath: 'id', autoIncrement: true });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
        // v3: chiavi UUID (stringhe), così i riferimenti restano validi tra export e import
        if (!d.objectStoreNames.contains('people')) d.createObjectStore('people', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('events')) d.createObjectStore('events', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('settlements')) d.createObjectStore('settlements', { keyPath: 'id' });
      };
      // RD-10: una scheda con la versione vecchia tiene aperto il DB.
      req.onblocked = () => { wasBlocked = true; window.dispatchEvent(new Event('db-blocked')); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    // RD-10: un'altra scheda aggiorna il DB → chiudo e chiedo di ricaricare.
    db.onversionchange = () => {
      db.close();
      _db = null;
      _opening = null;
      window.dispatchEvent(new Event('db-versionchange'));
    };
    if (upgrade) {
      // Promemoria per il popup "App aggiornata" (RD-13) e per la copia su Drive (RD-12).
      await new Promise(resolve => {
        const t = db.transaction('meta', 'readwrite');
        t.objectStore('meta').put({ key: 'upgradeNotice', value: { toVersion: DB_VERSION, at: new Date().toISOString(),
          ...upgrade, shown: false, driveUploaded: false } });
        t.oncomplete = resolve;
        t.onerror = resolve; // non bloccare l'app per un promemoria
      });
    }
    _db = db;
    // L'attesa è finita (l'altra istanza si è chiusa): la UI può ridisegnarsi.
    if (wasBlocked) setTimeout(() => window.dispatchEvent(new Event('db-unblocked')), 0);
    return db;
  })();
  _opening.catch(() => { _opening = null; });
  return _opening;
}

function tx(store, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const result = fn(s);
    t.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
    t.onerror = () => reject(t.error);
  }));
}

// Store con i dati dell'utente: "Cancella tutti i dati" li svuota tutti (RD-8).
// `meta` resta fuori di proposito (preferenze, obiettivo, stato dei backup).
const DATA_STORES = ['expenses', 'budgets', 'recurring', 'people', 'events', 'settlements'];

const DB = {
  addExpense: exp => tx('expenses', 'readwrite', s => s.add(exp)),
  putExpense: exp => tx('expenses', 'readwrite', s => s.put(exp)),
  deleteExpense: id => tx('expenses', 'readwrite', s => s.delete(id)),
  allExpenses: () => openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction('expenses').objectStore('expenses').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  })),
  // Range di date incluse, formato 'YYYY-MM-DD'
  expensesBetween: (from, to) => openDB().then(db => new Promise((resolve, reject) => {
    const idx = db.transaction('expenses').objectStore('expenses').index('date');
    const req = idx.getAll(IDBKeyRange.bound(from, to));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  })),
  setBudget: (cat, amount) => tx('budgets', 'readwrite', s => amount > 0 ? s.put({ cat, amount }) : s.delete(cat)),
  allBudgets: () => openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction('budgets').objectStore('budgets').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  })),
  addRecurring: r => tx('recurring', 'readwrite', s => s.add(r)),
  putRecurring: r => tx('recurring', 'readwrite', s => s.put(r)),
  deleteRecurring: id => tx('recurring', 'readwrite', s => s.delete(id)),
  allRecurring: () => openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction('recurring').objectStore('recurring').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  })),
  getMeta: key => openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction('meta').objectStore('meta').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
    req.onerror = () => reject(req.error);
  })),
  setMeta: (key, value) => tx('meta', 'readwrite', s => s.put({ key, value })),
  clearAll: () => Promise.all(DATA_STORES.map(st => tx(st, 'readwrite', s => s.clear()))),

  // Store v3 (persone, eventi, rimborsi): accesso generico per id.
  all: store => openDB().then(db => getAllFrom(db, store)),
  put: (store, rec) => tx(store, 'readwrite', s => s.put(rec)),
  del: (store, id) => tx(store, 'readwrite', s => s.delete(id)),

  // Import "Sostituisci tutto" (RD-11): UNA transazione su tutti gli store dati, quindi
  // o va a buon fine tutta o non cambia niente. `meta` non si tocca.
  replaceAll: data => openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(DATA_STORES, 'readwrite');
    t.oncomplete = resolve;
    t.onabort = () => reject(t.error || new Error('import annullato'));
    // Un record rifiutato in modo sincrono (es. chiave mancante) non annulla da solo la
    // transazione: senza abort() le clear() verrebbero comunque confermate.
    try {
      DATA_STORES.forEach(n => t.objectStore(n).clear());
      DATA_STORES.forEach(n => (data[n] || []).forEach(r => t.objectStore(n).put(r)));
    } catch (err) {
      t.onabort = () => reject(err);
      t.abort();
    }
  })),

  // Più scritture in UNA transazione (es. unione di persone, RF-P10): tutto o niente.
  //   { put: { store: [record] }, del: { store: [id] } }
  applyChanges: ({ put = {}, del = {} }) => openDB().then(db => new Promise((resolve, reject) => {
    const stores = [...new Set([...Object.keys(put), ...Object.keys(del)])];
    if (!stores.length) return resolve();
    const t = db.transaction(stores, 'readwrite');
    t.oncomplete = resolve;
    t.onabort = () => reject(t.error || new Error('operazione annullata'));
    try {
      Object.entries(put).forEach(([n, recs]) => recs.forEach(r => t.objectStore(n).put(r)));
      Object.entries(del).forEach(([n, ids]) => ids.forEach(id => t.objectStore(n).delete(id)));
    } catch (err) {
      t.onabort = () => reject(err);
      t.abort();
    }
  })),

  // Import "Aggiungi" (come prima per movimenti/ricorrenti: nuovi id) + persone,
  // eventi e rimborsi aggiornati per id (RD-7). Anche questo in una transazione.
  appendAll: data => openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(DATA_STORES, 'readwrite');
    const noId = ({ id, ...r }) => r;
    t.oncomplete = resolve;
    t.onabort = () => reject(t.error || new Error('import annullato'));
    try {
      (data.expenses || []).forEach(r => t.objectStore('expenses').add(noId(r)));
      (data.recurring || []).forEach(r => t.objectStore('recurring').add(noId(r)));
      (data.budgets || []).forEach(r => t.objectStore('budgets').put(r));
      ['people', 'events', 'settlements'].forEach(n => (data[n] || []).forEach(r => t.objectStore(n).put(r)));
    } catch (err) {
      t.onabort = () => reject(err);
      t.abort();
    }
  })),
};
