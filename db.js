// Wrapper minimale su IndexedDB.
const DB_NAME = 'spese-tracker';
const DB_VERSION = 2;
let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('expenses')) {
        const s = db.createObjectStore('expenses', { keyPath: 'id', autoIncrement: true });
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('budgets')) {
        db.createObjectStore('budgets', { keyPath: 'cat' });
      }
      if (!db.objectStoreNames.contains('recurring')) {
        db.createObjectStore('recurring', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
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
  clearAll: () => Promise.all(['expenses', 'budgets', 'recurring'].map(st => tx(st, 'readwrite', s => s.clear()))),
};
