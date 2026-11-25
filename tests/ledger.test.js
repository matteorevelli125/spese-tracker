const test = require('node:test');
const assert = require('node:assert/strict');
const Ledger = require('../ledger.js');

const exp = (o) => ({ date: '2026-08-11', type: 'expense', cat: 'cibo', sub: 'Ristorante', note: '', ts: 1, ...o });

test('normalize: i record vecchi hanno paid = amount, nessun pagatore né split', () => {
  const n = Ledger.normalize({ date: '2025-01-01', amount: 12.5, cat: 'cibo', sub: 'Spesa' });
  assert.equal(n.paid, 12.5);
  assert.equal(n.payer, null);
  assert.deepEqual(n.splits, []);
});

test('validate: record vecchi ed entrate sono validi', () => {
  assert.deepEqual(Ledger.validate(exp({ amount: 10 })), []);
  assert.deepEqual(Ledger.validate({ date: '2025-01-01', amount: 10, cat: 'cibo', sub: 'Spesa' }), []);
  assert.deepEqual(Ledger.validate({ date: '2025-01-27', amount: 2100, type: 'income', cat: 'stipendio', sub: 'Stipendio' }), []);
});

test('validate: spesa divisa coerente (80 € in 2)', () => {
  assert.deepEqual(Ledger.validate(exp({ amount: 40, paid: 80, splits: [{ personId: 'gi', amount: 40 }] })), []);
  assert.deepEqual(Ledger.validate(exp({ amount: 33.34, paid: 100, splits: [{ personId: 'gi', amount: 33.33 }, { personId: 'ma', amount: 33.33 }] })), []);
});

test('validate: non partecipo (quota 0) solo con split', () => {
  assert.deepEqual(Ledger.validate(exp({ amount: 0, paid: 30, splits: [{ personId: 'lu', amount: 30 }] })), []);
  assert.ok(Ledger.validate(exp({ amount: 0 })).includes('amount'));
});

test('validate: pagato da altri', () => {
  assert.deepEqual(Ledger.validate(exp({ amount: 35, paid: 0, payer: 'ma' })), []);
  assert.ok(Ledger.validate(exp({ amount: 35, paid: 35, payer: 'ma' })).includes('payer-paid'));
  assert.ok(Ledger.validate(exp({ amount: 35, paid: 0, payer: 'ma', splits: [{ personId: 'gi', amount: 5 }] })).includes('payer-splits'));
});

test('validate: errori di split', () => {
  assert.ok(Ledger.validate(exp({ amount: 40, paid: 70, splits: [{ personId: 'gi', amount: 40 }] })).includes('paid-sum'));
  assert.ok(Ledger.validate(exp({ amount: 40, paid: 80, splits: [{ personId: 'gi', amount: 20 }, { personId: 'gi', amount: 20 }] })).includes('split-duplicate'));
  assert.ok(Ledger.validate(exp({ amount: 80, paid: 80, splits: [{ personId: 'gi', amount: 0 }] })).includes('split-amount'));
  assert.ok(Ledger.validate({ date: '2025-01-27', amount: 10, type: 'income', cat: 'bonus', sub: 'Bonus', eventId: 'ev' }).includes('income-shared'));
});

// Scenario dei mockup: storico di Marco (requisiti/mockup 4b) → saldo 155 €
const marco = [
  exp({ date: '2026-05-02', amount: 125, paid: 500, splits: [{ personId: 'ma', amount: 125 }, { personId: 'lu', amount: 125 }, { personId: 'gi', amount: 125 }], eventId: 'sard' }),
  exp({ date: '2026-08-11', amount: 24, paid: 96, splits: [{ personId: 'ma', amount: 24 }, { personId: 'lu', amount: 24 }, { personId: 'gi', amount: 24 }], eventId: 'sard' }),
  exp({ date: '2026-08-12', amount: 35, paid: 0, payer: 'ma', eventId: 'sard' }),
  exp({ date: '2026-08-14', amount: 131, paid: 524, splits: [{ personId: 'ma', amount: 131 }, { personId: 'lu', amount: 131 }, { personId: 'gi', amount: 131 }], eventId: 'sard' }),
  exp({ date: '2026-08-10', amount: 12.5 }), // spesa normale: nessun effetto
  { date: '2026-08-27', amount: 2100, type: 'income', cat: 'stipendio', sub: 'Stipendio' },
];
const rimborsi = [{ id: 's1', personId: 'ma', direction: 'in', amount: 90, date: '2026-05-20' }];

test('balances: scenario Marco = 155 € (mockup 4b)', () => {
  const b = Ledger.balances(marco, rimborsi);
  assert.equal(b.get('ma'), 15500);
  assert.equal(b.get('lu'), 28000);
  assert.equal(b.get('gi'), 28000);
});

test('balances: filtro per evento (saldi generati, RF-E6)', () => {
  const b = Ledger.balances(marco, rimborsi, { eventId: 'sard' });
  assert.equal(b.get('ma'), 24500); // il rimborso non è legato all'evento
});

test('balances: rimborso dato (out) aumenta il saldo', () => {
  const b = Ledger.balances([exp({ amount: 20, paid: 0, payer: 'fe' })], [{ personId: 'fe', direction: 'out', amount: 2, date: '2026-01-01' }]);
  assert.equal(b.get('fe'), -1800);
});

test('totals', () => {
  assert.deepEqual(Ledger.totals(new Map([['a', 15500], ['b', 8500], ['c', -1800], ['d', 0]])), { owedToMe: 24000, iOwe: 1800 });
});

test('signFlips: da 0 a negativo avvisa, verso 0 no, aumento no (RF-S2)', () => {
  const before = new Map([['ma', 0], ['gi', 4650], ['lu', 1000]]);
  const after = new Map([['ma', -2000], ['gi', 0], ['lu', 3000]]);
  assert.deepEqual(Ledger.signFlips(before, after), [{ personId: 'ma', before: 0, after: -2000 }]);
  assert.deepEqual(Ledger.signFlips(new Map([['x', -500]]), new Map([['x', 700]])), [{ personId: 'x', before: -500, after: 700 }]);
});

test('mergePeople: somma le quote, sposta pagatore, rimborsi e partecipanti (RF-P10)', () => {
  const data = {
    expenses: [
      exp({ id: 1, amount: 30, paid: 90, splits: [{ personId: 'giuli', amount: 30 }, { personId: 'giulia', amount: 30 }] }),
      exp({ id: 2, amount: 10, paid: 0, payer: 'giuli' }),
      exp({ id: 3, amount: 5 }),
    ],
    events: [{ id: 'e1', participants: ['giuli', 'giulia', 'ma'] }, { id: 'e2', participants: ['ma'] }],
    settlements: [{ id: 's', personId: 'giuli', direction: 'in', amount: 3, date: '2026-01-01' }],
  };
  const before = Ledger.balances(data.expenses, data.settlements);
  const r = Ledger.mergePeople(data, 'giuli', 'giulia');
  assert.deepEqual(r.expenses.map(e => e.id), [1, 2]);
  assert.deepEqual(r.expenses[0].splits, [{ personId: 'giulia', amount: 60 }]);
  assert.equal(r.expenses[0].splitMode, 'exact');
  assert.equal(r.expenses[1].payer, 'giulia');
  assert.deepEqual(r.events, [{ id: 'e1', participants: ['giulia', 'ma'] }]);
  assert.equal(r.settlements[0].personId, 'giulia');
  // il saldo risultante è la somma dei due
  const merged = { ...data, expenses: data.expenses.map(e => r.expenses.find(x => x.id === e.id) || e), settlements: r.settlements };
  const after = Ledger.balances(merged.expenses, merged.settlements);
  assert.equal(after.get('giulia'), before.get('giuli') + before.get('giulia'));
  assert.equal(after.get('giuli'), undefined);
  assert.deepEqual(Ledger.validate(r.expenses[0]), []);
});

test('mergePeople: unione su sé stessi rifiutata', () => {
  assert.throws(() => Ledger.mergePeople({}, 'a', 'a'));
});

// ---- planSplit: dal wizard al record ----
const base = { date: '2026-08-11', type: 'expense', cat: 'cibo', sub: 'Ristorante', note: '', ts: 1 };
const rec = (total, s) => { const r = Ledger.planSplit(total, s); return r.error ? r : { ...base, ...r.fields }; };

test('planSplit: senza persone il record resta quello di prima', () => {
  assert.deepEqual(Ledger.planSplit(1250, {}), { fields: { amount: 12.5 } });
  assert.deepEqual(Ledger.planSplit(1250, { people: [] }), { fields: { amount: 12.5 } });
});

test('planSplit: parti uguali (1a, 2a dei mockup)', () => {
  const r = rec(8000, { people: ['gi'] });
  assert.deepEqual([r.amount, r.paid, r.splits, r.splitMode], [40, 80, [{ personId: 'gi', amount: 40 }], 'equal']);
  const r2 = rec(10000, { people: ['gi', 'ma'] });
  assert.equal(r2.amount, 33.34);
  assert.deepEqual(r2.splits.map(s => s.amount), [33.33, 33.33]);
  assert.deepEqual(Ledger.validate(r2), []);
});

test('planSplit: non partecipo', () => {
  const r = rec(3000, { people: ['lu'], notMe: true });
  assert.deepEqual([r.amount, r.paid, r.splits], [0, 30, [{ personId: 'lu', amount: 30 }]]);
  assert.deepEqual(Ledger.validate(r), []);
  assert.deepEqual(Ledger.planSplit(3000, { people: [], notMe: true }), { error: 'no-others' });
});

test('planSplit: importi esatti, residuo a me, errori (RV-2)', () => {
  const r = rec(10000, { people: ['gi', 'ma'], mode: 'exact', exact: { gi: 4500, ma: 2000 } });
  assert.deepEqual([r.amount, r.splitMode], [35, 'exact']);
  assert.deepEqual(Ledger.validate(r), []);
  assert.deepEqual(Ledger.planSplit(10000, { people: ['gi', 'ma'], mode: 'exact', exact: { gi: 4500, ma: 7000 } }), { error: 'over', sum: 11500 });
  // somma = totale → mia quota 0, come "non partecipo"
  assert.equal(rec(10000, { people: ['gi'], mode: 'exact', exact: { gi: 10000 } }).amount, 0);
  assert.deepEqual(Ledger.planSplit(10000, { people: ['gi'], mode: 'exact', exact: { gi: 9000 }, notMe: true }), { error: 'notme-sum', sum: 9000 });
});

test('planSplit: quota 0 di un altro lo toglie dallo split (RV-4)', () => {
  const r = rec(10000, { people: ['gi', 'ma'], mode: 'exact', exact: { gi: 2500 } });
  assert.deepEqual(r.splits, [{ personId: 'gi', amount: 25 }]);
  assert.deepEqual(rec(5000, { people: ['gi'], mode: 'exact', exact: {} }), { ...base, amount: 50 });
});

test('planSplit: pagato da un altro (RC-7)', () => {
  const r = rec(3500, { payer: 'ma', people: ['gi'] });
  assert.deepEqual([r.amount, r.paid, r.payer, r.splits], [35, 0, 'ma', undefined]);
  assert.deepEqual(Ledger.validate(r), []);
});

test('planSplit: totale non valido', () => {
  assert.deepEqual(Ledger.planSplit(0, {}), { error: 'total' });
  assert.deepEqual(Ledger.planSplit(12.5, {}), { error: 'total' });
});

// ---- storico per persona (mockup 4b) ----
test('timeline: saldo progressivo di Marco, dal più recente (RF-P3)', () => {
  const t = Ledger.timeline('ma', marco, rimborsi);
  assert.deepEqual(t.map(i => [i.date, i.kind, i.cents, i.balance]), [
    ['2026-08-14', 'advance', 13100, 15500],
    ['2026-08-12', 'paid-for-me', -3500, 2400],
    ['2026-08-11', 'advance', 2400, 5900],
    ['2026-05-20', 'refund', -9000, 3500],
    ['2026-05-02', 'advance', 12500, 12500],
  ]);
  assert.equal(t[0].balance, Ledger.balances(marco, rimborsi).get('ma'));
});

test('timeline: rimborso dato (out) e persona senza movimenti', () => {
  const t = Ledger.timeline('fe', [exp({ amount: 18, paid: 0, payer: 'fe', ts: 1 })], [{ personId: 'fe', direction: 'out', amount: 18, date: '2026-08-20', ts: 2 }]);
  assert.deepEqual(t.map(i => [i.kind, i.balance]), [['repaid', 0], ['paid-for-me', -1800]]);
  assert.deepEqual(Ledger.timeline('nessuno', marco, rimborsi), []);
});

test('isReferenced', () => {
  assert.equal(Ledger.isReferenced('gi', { expenses: marco }), true);
  assert.equal(Ledger.isReferenced('zz', { expenses: marco, settlements: rimborsi }), false);
  assert.equal(Ledger.isReferenced('zz', { events: [{ participants: ['zz'] }] }), true);
});

// ---- eventi ----
test('eventSummary: quota, cassa e categorie (mockup 5c)', () => {
  const r = Ledger.eventSummary('sard', marco);
  assert.equal(r.count, 4);
  assert.equal(r.quota, 12500 + 2400 + 3500 + 13100);
  assert.equal(r.paidByMe, 50000 + 9600 + 52400);
  assert.equal(r.paidByOthers, 3500);
  assert.equal(r.byCat.cibo.total, 2400 + 3500 + 12500 + 13100);
  assert.deepEqual(Ledger.eventSummary('altro', marco), { quota: 0, paidByMe: 0, paidByOthers: 0, count: 0, byCat: {} });
});

test('eventsInProgress: date, giorno singolo, archiviati e senza date', () => {
  const evs = [
    { id: 'a', start: '2026-08-08', end: '2026-08-22' },
    { id: 'b', start: '2026-12-06' },
    { id: 'c' },
    { id: 'd', start: '2026-08-01', end: '2026-08-31', archived: true },
  ];
  assert.deepEqual(Ledger.eventsInProgress(evs, '2026-08-12').map(e => e.id), ['a']);
  assert.deepEqual(Ledger.eventsInProgress(evs, '2026-12-06').map(e => e.id), ['b']);
  assert.deepEqual(Ledger.eventsInProgress(evs, '2026-08-22').map(e => e.id), ['a']);
  assert.deepEqual(Ledger.eventsInProgress(evs, '2026-08-23').map(e => e.id), []);
});
