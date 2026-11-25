// Validazione/sanificazione dei backup importati (RD-3, RD-6, RD-7), come funzioni
// PURE (testabili con `node --test`). Si accettano solo i campi attesi con i tipi
// corretti; stringhe limitate in lunghezza; record non validi scartati.
//
// Retrocompatibilità: un movimento in formato v1 produce ESATTAMENTE lo stesso
// record di prima ({date, amount, type, cat, sub, note, ts}); i campi nuovi si
// aggiungono solo quando presenti e validi.
const Sanitize = (() => {
  const L = typeof Ledger !== 'undefined' ? Ledger : require('./ledger.js');
  const M = typeof Money !== 'undefined' ? Money : require('./money.js');

  const isDateStr = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const cleanStr = (s, max = 200) => (typeof s === 'string' ? s : '').slice(0, max);
  // Importo > 0 arrotondato al centesimo (come prima); null se non valido.
  const cleanAmount = a => {
    const n = typeof a === 'number' ? a : parseFloat(a);
    return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  };
  const isId = s => typeof s === 'string' && /^[\w-]{1,64}$/.test(s);
  const isPosInt = n => Number.isInteger(n) && n > 0;

  // Movimento. opts.keepId: conserva l'id numerico (import "Sostituisci tutto").
  // Ritorna { record, repaired } oppure null se da scartare.
  function expense(e, opts = {}) {
    if (!e || typeof e !== 'object') return null;
    if (!isDateStr(e.date)) return null;
    const type = e.type === 'income' ? 'income' : 'expense';
    // Quota 0 ammessa solo per una spesa divisa in cui non partecipo.
    const zeroOk = type === 'expense' && !e.payer && Array.isArray(e.splits) && e.splits.length > 0 &&
      (e.amount === 0 || e.amount === '0');
    const amount = zeroOk ? 0 : cleanAmount(e.amount);
    if (amount === null) return null;
    const rec = { date: e.date, amount, type, cat: cleanStr(e.cat, 40), sub: cleanStr(e.sub, 60),
      note: cleanStr(e.note, 200), ts: Number.isFinite(e.ts) ? e.ts : Date.now() };
    if (opts.keepId && isPosInt(e.id)) rec.id = e.id;
    let repaired = false;
    if (type === 'income') {
      if (e.payer || (e.splits && e.splits.length) || e.eventId) repaired = true; // RC-9: campi ignorati
      return { record: rec, repaired };
    }
    if (isId(e.eventId)) rec.eventId = e.eventId;
    else if (e.eventId != null) repaired = true;

    if (e.payer != null) {
      // Pagato da un altro (amount > 0 garantito: la quota 0 richiede che abbia pagato io).
      if (isId(e.payer)) {
        rec.payer = e.payer;
        rec.paid = 0;
        if ((e.splits && e.splits.length) || cleanAmount(e.paid) !== null) repaired = true; // RV-3
      } else {
        repaired = true; // pagatore illeggibile: resta una spesa normale con la stessa quota
      }
      return { record: rec, repaired };
    }

    if (Array.isArray(e.splits) && e.splits.length) {
      const seen = new Set();
      const splits = [];
      for (const s of e.splits) {
        const a = cleanAmount(s && s.amount);
        if (!s || !isId(s.personId) || a === null || seen.has(s.personId)) { repaired = true; continue; }
        seen.add(s.personId);
        splits.push({ personId: s.personId, amount: a });
      }
      if (splits.length) {
        rec.splits = splits;
        rec.splitMode = e.splitMode === 'exact' ? 'exact' : 'equal';
        // `paid` deve essere quota + Σ quote altrui: se nel file non torna, lo ricalcolo.
        const paidCents = M.toCents(amount) + M.sum(splits.map(s => M.toCents(s.amount)));
        if (cleanAmount(e.paid) === null || M.toCents(e.paid) !== paidCents) repaired = true;
        rec.paid = M.fromCents(paidCents);
      } else if (amount === 0) {
        return null; // quota 0 senza nessuna quota altrui valida: niente da tenere
      }
    } else if (e.paid != null && cleanAmount(e.paid) !== amount) {
      repaired = true; // paid senza split: vale amount, campo omesso
    }
    if (L.validate(rec).length) return null; // ultima difesa: mai record incoerenti nel DB
    return { record: rec, repaired };
  }

  function recurring(r, opts = {}) {
    if (!r || typeof r !== 'object') return null;
    const amount = cleanAmount(r.amount);
    if (!amount || !isDateStr(r.nextDue)) return null;
    const rec = { name: cleanStr(r.name, 80), amount, type: r.type === 'income' ? 'income' : 'expense',
      cat: cleanStr(r.cat, 40), sub: cleanStr(r.sub, 60),
      freq: r.freq === 'yearly' ? 'yearly' : 'monthly', nextDue: r.nextDue };
    if (opts.keepId && isPosInt(r.id)) rec.id = r.id;
    return rec;
  }

  function budget(b) {
    const amount = cleanAmount(b && b.amount);
    const cat = cleanStr(b && b.cat, 40);
    return cat && amount ? { cat, amount } : null;
  }

  function person(p) {
    if (!p || !isId(p.id)) return null;
    const name = cleanStr(p.name, 60).trim();
    if (!name) return null;
    return { id: p.id, name, archived: p.archived === true,
      createdAt: Number.isFinite(p.createdAt) ? p.createdAt : Date.now(),
      lastUsedAt: Number.isFinite(p.lastUsedAt) ? p.lastUsedAt : null };
  }

  function event(ev) {
    if (!ev || !isId(ev.id)) return null;
    const name = cleanStr(ev.name, 80).trim();
    if (!name) return null;
    const rec = { id: ev.id, name, emoji: cleanStr(ev.emoji, 8) || '📌',
      participants: [...new Set((Array.isArray(ev.participants) ? ev.participants : []).filter(isId))],
      archived: ev.archived === true, createdAt: Number.isFinite(ev.createdAt) ? ev.createdAt : Date.now() };
    if (isDateStr(ev.start)) rec.start = ev.start;
    if (isDateStr(ev.end)) rec.end = ev.end;
    if (rec.start && rec.end && rec.end < rec.start) delete rec.end;
    if (ev.defaultCat) rec.defaultCat = cleanStr(ev.defaultCat, 40);
    if (rec.defaultCat && ev.defaultSub) rec.defaultSub = cleanStr(ev.defaultSub, 60);
    return rec;
  }

  function settlement(s) {
    if (!s || !isId(s.id) || !isId(s.personId) || !isDateStr(s.date)) return null;
    const amount = cleanAmount(s.amount);
    if (amount === null) return null;
    const rec = { id: s.id, personId: s.personId, direction: s.direction === 'out' ? 'out' : 'in', amount,
      date: s.date, note: cleanStr(s.note, 200), ts: Number.isFinite(s.ts) ? s.ts : Date.now() };
    if (isId(s.eventId)) rec.eventId = s.eventId;
    return rec;
  }

  // Backup completo (v1 o v2). Lancia un errore se il formato non è riconoscibile.
  // → { expenses, budgets, recurring, people, events, settlements, stats }
  function backup(data, opts = {}) {
    if (!data || !Array.isArray(data.expenses)) throw new Error('formato non valido');
    const arr = k => (Array.isArray(data[k]) ? data[k] : []);
    const stats = { skipped: 0, repaired: 0, placeholders: 0 };
    const keep = (list, fn) => list.map(fn).filter(Boolean);

    const expenses = [];
    for (const raw of data.expenses) {
      const r = expense(raw, opts);
      if (!r) { stats.skipped++; continue; }
      if (r.repaired) stats.repaired++;
      expenses.push(r.record);
    }
    const budgets = keep(arr('budgets'), budget);
    const recurring = keep(arr('recurring'), r => recurring_(r, opts));
    // Scartati = non validi; i doppioni per id non contano (vince l'ultimo).
    const valid = (k, fn) => { const l = keep(arr(k), fn); stats.skipped += arr(k).length - l.length; return dedupe(l); };
    const people = valid('people', person);
    const events = valid('events', event);
    const settlements = valid('settlements', settlement);

    // Riferimenti a persone/eventi assenti dal file: segnaposto, così i saldi non cambiano.
    const pIds = new Set(people.map(p => p.id));
    const eIds = new Set(events.map(e => e.id));
    const needPerson = id => {
      if (pIds.has(id)) return;
      pIds.add(id); stats.placeholders++;
      people.push({ id, name: 'Persona sconosciuta', archived: false, createdAt: Date.now(), lastUsedAt: null });
    };
    const needEvent = id => {
      if (eIds.has(id)) return;
      eIds.add(id); stats.placeholders++;
      events.push({ id, name: 'Evento sconosciuto', emoji: '📌', participants: [], archived: true, createdAt: Date.now() });
    };
    for (const e of expenses) {
      if (e.payer) needPerson(e.payer);
      (e.splits || []).forEach(s => needPerson(s.personId));
      if (e.eventId) needEvent(e.eventId);
    }
    for (const s of settlements) { needPerson(s.personId); if (s.eventId) needEvent(s.eventId); }
    for (const ev of events) ev.participants.forEach(needPerson);

    return { expenses, budgets, recurring, people, events, settlements, stats };
  }
  const recurring_ = recurring;
  const dedupe = list => [...new Map(list.map(x => [x.id, x])).values()];

  return { expense, recurring, budget, person, event, settlement, backup, isDateStr, cleanStr, cleanAmount };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Sanitize;
