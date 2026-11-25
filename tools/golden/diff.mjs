// Confronta due snapshot del golden test.
//
//   node tools/golden/diff.mjs private/snapshots/prima.json private/snapshots/dopo.json [--numbers] [--max 30]
//
// Default: confronto esatto del testo (e della geometria delle barre).
// --numbers: confronta solo i numeri (importi, percentuali) estratti dal testo;
//            utile quando una fase cambia di proposito delle etichette.
// Esce con codice 1 se trova differenze.
import fs from 'node:fs';

const args = process.argv.slice(2);
const files = args.filter(a => !a.startsWith('--') && !/^\d+$/.test(a));
if (files.length !== 2) {
  console.error('uso: node tools/golden/diff.mjs <prima.json> <dopo.json> [--numbers] [--max N]');
  process.exit(2);
}
const numbersOnly = args.includes('--numbers');
const maxI = args.indexOf('--max');
const MAX = maxI > -1 ? Number(args[maxI + 1]) : 30;

const [a, b] = files.map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
const NUM = /[+\-−]?\d{1,3}(?:\.\d{3})*(?:,\d+)?\s?%?|[+\-−]?\d+(?:,\d+)?\s?%?/g;
const norm = v => {
  if (v == null || !numbersOnly) return v;
  return (String(v).match(NUM) || []).map(s => s.replace(/\s/g, '').replace('−', '-')).join(' ');
};

const diffs = [];
const keys = new Set([...Object.keys(a.sections), ...Object.keys(b.sections)]);
for (const k of [...keys].sort()) {
  const sa = a.sections[k], sb = b.sections[k];
  if (!sa || !sb) { diffs.push({ k, f: '(vista)', va: sa ? 'presente' : 'assente', vb: sb ? 'presente' : 'assente' }); continue; }
  for (const f of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
    if (numbersOnly && f.startsWith('geo')) continue;
    const va = norm(sa[f]), vb = norm(sb[f]);
    if (va !== vb) diffs.push({ k, f, va, vb });
  }
}

const short = v => { const s = String(v); return s.length > 220 ? s.slice(0, 220) + '…' : s; };
console.log(`Prima: ${files[0]}  (now ${a.now}, ${a.count?.expenses} movimenti)`);
console.log(`Dopo:  ${files[1]}  (now ${b.now}, ${b.count?.expenses} movimenti)`);
console.log(`Viste: ${Object.keys(a.sections).length} vs ${Object.keys(b.sections).length} · modalità: ${numbersOnly ? 'solo numeri' : 'testo esatto'}`);
if (JSON.stringify(a.count) !== JSON.stringify(b.count)) {
  diffs.unshift({ k: 'count', f: '(conteggi)', va: JSON.stringify(a.count), vb: JSON.stringify(b.count) });
}
if (!diffs.length) {
  console.log('✔ Nessuna differenza.');
  process.exit(0);
}
console.log(`✘ ${diffs.length} differenze${diffs.length > MAX ? ` (mostro le prime ${MAX})` : ''}:`);
for (const d of diffs.slice(0, MAX)) {
  console.log(`\n• ${d.k} › ${d.f}\n  prima: ${short(d.va)}\n  dopo:  ${short(d.vb)}`);
}
process.exit(1);
