// Copie di sicurezza SUL DISPOSITIVO in un database IndexedDB separato
// (`spese-tracker-backup`), che non viene mai migrato insieme a quello dei dati
// (RD-11, RD-12, decisione D1). Contengono il JSON completo, pronto da scaricare.
const Snapshots = (() => {
  const NAME = 'spese-tracker-backup';
  const KEEP = 10; // copie conservate (le più vecchie vengono eliminate)
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('snapshots', { keyPath: 'id', autoIncrement: true });
      req.onsuccess = () => { _db = req.result; _db.onversionchange = () => { _db.close(); _db = null; }; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  const all = () => open().then(db => new Promise((resolve, reject) => {
    const req = db.transaction('snapshots').objectStore('snapshots').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));

  // { kind, filename, json, ... } → id. Tiene solo le ultime KEEP copie.
  async function save(snap) {
    const db = await open();
    const old = await all();
    return new Promise((resolve, reject) => {
      const t = db.transaction('snapshots', 'readwrite');
      const s = t.objectStore('snapshots');
      const req = s.add({ at: new Date().toISOString(), ...snap });
      old.sort((a, b) => a.id - b.id).slice(0, Math.max(0, old.length + 1 - KEEP)).forEach(x => s.delete(x.id));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
    });
  }

  async function latest(kind) {
    const list = (await all()).filter(s => !kind || s.kind === kind);
    return list.sort((a, b) => b.id - a.id)[0] || null;
  }

  // Salva il file. Va chiamata DENTRO il gestore di un tocco: senza gesto il browser
  // può bloccarla (decisione D1). Dove si può (Android, anche nell'app installata)
  // usa la condivisione, come l'export JSON: il download diretto da un'app installata
  // non è affidabile. Se la condivisione viene annullata o fallisce, scarica.
  function download(filename, json) {
    try {
      const file = new File([json], filename, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: filename }).catch(() => anchorDownload(filename, json));
        return;
      }
    } catch (e) { /* File o share non disponibili: download diretto */ }
    anchorDownload(filename, json);
  }

  function anchorDownload(filename, json) {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  return { save, latest, all, download };
})();
