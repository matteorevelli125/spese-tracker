const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Sanitize = require('../sanitize.js');
const Ledger = require('../ledger.js');

// Copia FEDELE della sanificazione in produzione fino alla v25 (app.js): riferimento
// per la retrocompatibilità RD-3. Non modificarla.
const legacy = (() => {
  const isDateStr = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const cleanStr = (s, max = 200) => (typeof s === 'string' ? s : '').slice(0, max);
  const cleanAmount = a => { const n = typeof a === 'number' ? a : parseFloat(a); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };
  function sanitizeExpense(e) {
    if (!e || typeof e !== 'object') return null;
    const amount = cleanAmount(e.amount);
    if (!isDateStr(e.date) || amount === null) return null;
    return { date: e.date, amount, type: e.type === 'income' ? 'income' : 'expense',
      cat: cleanStr(e.cat, 40), sub: cleanStr(e.sub, 60), note: cleanStr(e.note, 200), ts: Number.isFinite(e.ts) ? e.ts : Date.now() };
  }
  function sanitizeRecurring(r) {
    if (!r || typeof r !== 'object') return null;
    const amount = cleanAmount(r.amount);
    if (!amount || !isDateStr(r.nextDue)) return null;
    return { name: cleanStr(r.name, 80), amount, type: r.type === 'income' ? 'income' : 'expense',
      cat: cleanStr(r.cat, 40), sub: cleanStr(r.sub, 60), freq: r.freq === 'yearly' ? 'yearly' : 'monthly', nextDue: r.nextDue };
  }
  return { sanitizeExpense, sanitizeRecurring, cleanAmount, cleanStr };
})();

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-backup.json'), 'utf8'));

// Casi strani che un file v1 può contenere
const weird = [
  { date: '2026-01-01', amount: '12,5', cat: 'cibo', sub: 'Spesa' },
  { date: '2026-01-01', amount: '12.345', cat: 'cibo', sub: 'Spesa', note: 'x'.repeat(500), ts: 5 },
  { date: '2026-1-1', amount: 3, cat: 'cibo' },
  { date: '2026-01-01', amount: 0, cat: 'cibo' },
  { date: '2026-01-01', amount: -4, cat: 'cibo' },
  { date: '2026-01-01', amount: 'abc', cat: 'cibo' },
  { date: '2026-01-01', amount: 7, type: 'income', cat: 'bonus', sub: 'Bonus', extra: 'campo sconosciuto', id: 99 },
  null, 'stringa', 42,
  { date: '2026-01-01', amount: 1e9, cat: 'casa', sub: 'Affitto / Mutuo', ts: 1.5 },
];

test('RD-3: ogni movimento v1 dà lo stesso record della versione in produzione', () => {
  for (const raw of [...fixture.expenses, ...weird]) {
    const old = legacy.sanitizeExpense(raw);
    const r = Sanitize.expense(raw);
    if (old === null) { assert.equal(r, null, JSON.stringify(raw)); continue; }
    // ts generato con Date.now() quando assente: confronto il resto
    if (!Number.isFinite(raw.ts)) { delete old.ts; delete r.record.ts; }
    assert.deepEqual(r.record, old, JSON.stringify(raw));
    assert.equal(r.repaired, false);
  }
});

test('RD-3: ricorrenti e budget v1 identici a prima', () => {
  for (const raw of fixture.recurring) assert.deepEqual(Sanitize.recurring(raw), legacy.sanitizeRecurring(raw));
  for (const b of [...fixture.budgets, { cat: 'x', amount: 0 }, { cat: '', amount: 5 }, null]) {
    const old = (() => { const amount = legacy.cleanAmount(b && b.amount); const cat = legacy.cleanStr(b && b.cat, 40); return cat && amount ? { cat, amount } : null; })();
    assert.deepEqual(Sanitize.budget(b), old);
  }
});

test('backup v1: conteggi e nessuna persona/evento inventati', () => {
  const r = Sanitize.backup(fixture);
  assert.equal(r.expenses.length, fixture.expenses.length);
  assert.equal(r.stats.skipped, 0);
  assert.equal(r.stats.repaired, 0);
  assert.deepEqual([r.people.length, r.events.length, r.settlements.length], [0, 0, 0]);
  assert.ok(r.expenses.every(e => !('id' in e)), 'senza keepId gli id non si importano (come prima)');
  const keep = Sanitize.backup(fixture, { keepId: true });
  assert.deepEqual(keep.expenses.map(e => e.id), fixture.expenses.map(e => e.id));
  assert.deepEqual(keep.recurring.map(e => e.id), fixture.recurring.map(e => e.id));
});

test('backup: formato non valido', () => {
  assert.throws(() => Sanitize.backup({}), /formato non valido/);
  assert.throws(() => Sanitize.backup(null), /formato non valido/);
});

test('v2: spesa divisa, pagato da altri, non partecipo restano coerenti', () => {
  const r = Sanitize.backup({
    version: 2,
    expenses: [
      { date: '2026-08-11', amount: 24, paid: 96, splits: [{ personId: 'ma', amount: 24 }, { personId: 'lu', amount: 24 }, { personId: 'gi', amount: 24 }], splitMode: 'equal', eventId: 'sard', type: 'expense', cat: 'viaggi', sub: 'Cibo', note: '', ts: 1 },
      { date: '2026-08-12', amount: 35, paid: 0, payer: 'ma', eventId: 'sard', type: 'expense', cat: 'cibo', sub: 'Ristorante', note: '', ts: 2 },
      { date: '2026-08-11', amount: 0, paid: 30, splits: [{ personId: 'lu', amount: 30 }], splitMode: 'exact', type: 'expense', cat: 'regali', sub: 'Regali', note: '', ts: 3 },
    ],
    people: [{ id: 'ma', name: 'Marco' }, { id: 'lu', name: 'Luca' }, { id: 'gi', name: 'Giulia' }],
    events: [{ id: 'sard', name: 'Sardegna agosto', emoji: '✈️', participants: ['ma', 'lu', 'gi'], start: '2026-08-08', end: '2026-08-22' }],
    settlements: [{ id: 's1', personId: 'ma', direction: 'in', amount: 90, date: '2026-05-20' }],
  });
  assert.deepEqual(r.stats, { skipped: 0, repaired: 0, placeholders: 0 });
  assert.equal(r.expenses.length, 3);
  r.expenses.forEach(e => assert.deepEqual(Ledger.validate(e), [], JSON.stringify(e)));
  assert.equal(r.expenses[2].amount, 0);
  assert.equal(r.expenses[1].payer, 'ma');
  assert.equal(r.events[0].participants.length, 3);
  assert.equal(r.settlements[0].direction, 'in');
});

test('v2: paid incoerente viene ricalcolato, split non validi scartati', () => {
  const r = Sanitize.expense({ date: '2026-01-01', amount: 40, paid: 70, splits: [{ personId: 'gi', amount: 40 }, { personId: 'gi', amount: 5 }, { personId: '', amount: 3 }, { personId: 'ma', amount: -1 }], cat: 'cibo', sub: 'Spesa' });
  assert.equal(r.repaired, true);
  assert.deepEqual(r.record.splits, [{ personId: 'gi', amount: 40 }]);
  assert.equal(r.record.paid, 80);
});

test('v2: quota 0 senza split validi viene scartata, con pagatore non è ammessa', () => {
  assert.equal(Sanitize.expense({ date: '2026-01-01', amount: 0, splits: [{ personId: 'x', amount: 0 }], cat: 'regali', sub: 'Regali' }), null);
  assert.equal(Sanitize.expense({ date: '2026-01-01', amount: 0, payer: 'ma', splits: [{ personId: 'x', amount: 3 }], cat: 'cibo' }), null);
});

test('v2: pagatore + split → vince il pagatore e si segnala la riparazione (RV-3)', () => {
  const r = Sanitize.expense({ date: '2026-01-01', amount: 10, paid: 10, payer: 'ma', splits: [{ personId: 'gi', amount: 5 }], cat: 'cibo', sub: 'Spesa' });
  assert.equal(r.repaired, true);
  assert.deepEqual([r.record.payer, r.record.paid, r.record.splits], ['ma', 0, undefined]);
});

test('v2: le entrate ignorano i campi condivisi (RC-9)', () => {
  const r = Sanitize.expense({ date: '2026-01-27', amount: 2000, type: 'income', cat: 'stipendio', sub: 'Stipendio', payer: 'ma', eventId: 'e' });
  assert.equal(r.repaired, true);
  assert.deepEqual(Object.keys(r.record).sort(), ['amount', 'cat', 'date', 'note', 'sub', 'ts', 'type']);
});

test('riferimenti mancanti → segnaposto, saldi invariati (RD-6)', () => {
  const data = {
    expenses: [{ date: '2026-01-01', amount: 10, paid: 30, splits: [{ personId: 'ghost', amount: 20 }], eventId: 'evx', cat: 'cibo', sub: 'Spesa' }],
    settlements: [{ id: 's', personId: 'ghost2', direction: 'out', amount: 5, date: '2026-01-02' }],
    events: [{ id: 'e2', name: 'Gita', participants: ['ghost3'] }],
  };
  const r = Sanitize.backup(data);
  assert.equal(r.stats.placeholders, 4);
  assert.deepEqual(r.people.map(p => p.id).sort(), ['ghost', 'ghost2', 'ghost3']);
  assert.ok(r.events.find(e => e.id === 'evx' && e.archived));
  const b = Ledger.balances(r.expenses, r.settlements);
  assert.equal(b.get('ghost'), 2000);
  assert.equal(b.get('ghost2'), 500);
});

test('persone/eventi duplicati per id: tengo l\'ultimo (RD-7)', () => {
  const r = Sanitize.backup({ expenses: [], people: [{ id: 'a', name: 'Giuli' }, { id: 'a', name: 'Giulia' }, { id: 'bad id!', name: 'x' }, { id: 'b', name: '  ' }] });
  assert.deepEqual(r.people.map(p => p.name), ['Giulia']);
  assert.equal(r.stats.skipped, 2);
});

test('eventi: date incoerenti e campi facoltativi', () => {
  const ev = Sanitize.event({ id: 'e', name: 'Picnic', start: '2026-12-06', end: '2026-12-01', defaultSub: 'Spesa' });
  assert.equal(ev.end, undefined);
  assert.equal(ev.defaultSub, undefined); // sottocategoria senza categoria: ignorata
  assert.equal(ev.emoji, '📌');
});

test('v2: pagato da altri con totale e partecipanti (RF-W3 rivisto)', () => {
  const r = Sanitize.backup({ expenses: [
    { date: '2026-08-12', amount: 24, paid: 0, payer: 'ma', payerTotal: 96, splitMode: 'equal', shareWith: ['lu', 'gi', 'ma'], type: 'expense', cat: 'cibo', sub: 'Ristorante', note: '', ts: 1 },
    { date: '2026-08-13', amount: 50, paid: 0, payer: 'ma', payerTotal: 40, type: 'expense', cat: 'cibo', sub: 'Ristorante', note: '', ts: 2 },
  ] });
  const [a, b] = r.expenses;
  assert.deepEqual([a.payerTotal, a.splitMode, a.shareWith], [96, 'equal', ['lu', 'gi']]);
  assert.deepEqual(Ledger.validate(a), []);
  assert.equal(b.payerTotal, undefined); // totale < quota: scartato, la quota resta
  assert.equal(r.stats.repaired, 1);
  assert.deepEqual(r.people.map(p => p.id).sort(), ['gi', 'lu', 'ma']); // segnaposto anche per shareWith
});
