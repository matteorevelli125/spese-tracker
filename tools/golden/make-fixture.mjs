// Genera un backup SINTETICO e deterministico (nessun dato reale) per il golden test:
//
//   node tools/golden/make-fixture.mjs > tests/fixtures/sample-backup.json
//
// Copre: ~26 mesi di uscite su tutte le categorie/sottocategorie, entrate
// (stipendio, buoni pasto, bonus), record storici senza campo `type`,
// abbonamenti (spese fisse), budget, ricorrenti (una scaduta rispetto al
// "now" del test, una futura) e un obiettivo di risparmio.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(REPO, 'categories.js'), 'utf8') + ';this.C=CATEGORIES;this.I=INCOME_CATEGORIES;', ctx);
const CATS = ctx.C, INC = ctx.I;

// PRNG deterministico (mulberry32)
let seed = 20261125;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const money = (min, max) => Math.round((min + rnd() * (max - min)) * 100) / 100;
const pad = n => String(n).padStart(2, '0');
const ds = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const expenses = [];
let id = 1, ts = Date.UTC(2024, 9, 1);
const add = (e) => expenses.push({ id: id++, ...e, ts: (ts += 61_000) });

const start = new Date(2024, 9, 1), end = new Date(2026, 10, 24);
for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
  const date = ds(d);
  const n = Math.floor(rnd() * 3); // 0-2 spese al giorno
  for (let i = 0; i < n; i++) {
    const c = pick(CATS);
    const e = { date, amount: money(2, c.id === 'casa' ? 180 : 70), cat: c.id, sub: pick(c.subs), note: rnd() < 0.3 ? pick(['', 'con amici', 'Esselunga', 'regalo', 'pranzo']) : '' };
    if (date < '2025-03-01' && rnd() < 0.5) add(e);          // storico senza campo type
    else add({ ...e, type: 'expense' });
  }
  if (d.getDate() === 27) add({ date, amount: 2150 + Math.round(rnd() * 100), type: 'income', cat: 'stipendio', sub: INC[0].name, note: '' });
  if (d.getDate() === 5) add({ date, amount: 160, type: 'income', cat: 'buoni-pasto', sub: INC[1].name, note: '' });
  if (d.getDate() === 1) {
    add({ date, amount: 950, type: 'expense', cat: 'casa', sub: 'Affitto / Mutuo', note: 'Ricorrente: Affitto' });
    add({ date, amount: 12.99, type: 'expense', cat: 'abbonamenti', sub: 'Streaming', note: 'Ricorrente: Netflix' });
  }
  if (d.getMonth() === 6 && d.getDate() === 15) add({ date, amount: 1800, type: 'income', cat: 'bonus', sub: INC[2].name, note: 'Premio' });
}
// casi limite: importi con centesimi "scomodi" e grandi
add({ date: '2026-11-03', amount: 0.01, type: 'expense', cat: 'altro', sub: 'Commissioni bancarie', note: '' });
add({ date: '2026-11-03', amount: 1234.56, type: 'expense', cat: 'viaggi', sub: 'Alloggio', note: 'Hotel' });
add({ date: '2026-02-28', amount: 33.33, type: 'expense', cat: 'cibo', sub: 'Ristorante', note: '' });

const budgets = [
  { cat: 'cibo', amount: 400 }, { cat: 'svago', amount: 150 }, { cat: 'trasporti', amount: 80 }, { cat: 'abbigliamento', amount: 100 },
];
const recurring = [
  { id: 1, name: 'Affitto', amount: 950, type: 'expense', cat: 'casa', sub: 'Affitto / Mutuo', freq: 'monthly', nextDue: '2026-12-01' },
  { id: 2, name: 'Palestra', amount: 39, type: 'expense', cat: 'svago', sub: 'Sport', freq: 'monthly', nextDue: '2026-11-20' }, // scaduta
  { id: 3, name: 'Assicurazione', amount: 420, type: 'expense', cat: 'auto', sub: 'Assicurazione', freq: 'yearly', nextDue: '2027-03-10' },
];
const meta = { savingsGoal: { label: 'Fondo emergenze', amount: 10000 } };

process.stdout.write(JSON.stringify({ version: 1, exported: '2026-11-25T00:00:00.000Z', expenses, budgets, recurring, meta }, null, 1));
