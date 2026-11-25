// Rubrica delle persone (Q5): un solo elenco per split ed eventi.
// Record: { id (uuid), name, archived, createdAt, lastUsedAt }.
const People = (() => {
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
  const norm = s => String(s || '').trim().replace(/\s+/g, ' ');
  const key = s => norm(s).toLocaleLowerCase('it-IT');

  const all = () => DB.all('people');
  async function map() { return new Map((await all()).map(p => [p.id, p])); }

  // Attive, prima le usate più di recente, poi in ordine alfabetico.
  async function recent() {
    return (await all()).filter(p => !p.archived)
      .sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0) || a.name.localeCompare(b.name, 'it'));
  }

  // Ricerca per nome (contiene, senza maiuscole/minuscole). `exact` = nome identico già presente.
  async function search(q) {
    const k = key(q);
    const list = await recent();
    return { matches: k ? list.filter(p => key(p.name).includes(k)) : list, exact: list.find(p => key(p.name) === k) || null };
  }

  // Crea una persona; se esiste già con lo stesso nome (anche archiviata) restituisce quella.
  async function create(name) {
    const n = norm(name).slice(0, 60);
    if (!n) throw new Error('nome vuoto');
    const same = (await all()).find(p => key(p.name) === key(n));
    if (same) {
      if (same.archived) { same.archived = false; await DB.put('people', same); }
      return same;
    }
    const p = { id: uuid(), name: n, archived: false, createdAt: Date.now(), lastUsedAt: null };
    await DB.put('people', p);
    return p;
  }

  // Segna come usate adesso (ordinamento dei "recenti").
  async function touch(ids) {
    const m = await map();
    const now = Date.now();
    for (const id of new Set(ids)) {
      const p = m.get(id);
      if (p) await DB.put('people', { ...p, lastUsedAt: now });
    }
  }

  return { all, map, recent, search, create, touch, uuid, key };
})();
