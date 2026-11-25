// Benchmark delle schermate al crescere dei record (solo DB locale di prova!).
//   (await import('/tools/perf/bench.js')).run([600, 3000, 6000, 20000, 50000])
// Per ogni N: genera un dataset sintetico realistico (≈15% spese condivise, 20 persone,
// 1 evento ogni ~200 spese, rimborsi), lo carica con DB.replaceAll e misura ogni vista
// (mediana di 3 esecuzioni). Risultato anche in private/snapshots/perf-report.json.
const sleep = ms => new Promise(r => setTimeout(r, ms));
let seed = 42;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];
const pad = n => String(n).padStart(2, '0');

function dataset(n) {
  seed = 42;
  const people = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, name: `Persona ${i}`, archived: false, createdAt: 1, lastUsedAt: i }));
  const nEvents = Math.max(1, Math.round(n / 200));
  const events = Array.from({ length: nEvents }, (_, i) => ({ id: `e${i}`, name: `Evento ${i}`, emoji: '✈️',
    participants: ['p0', 'p1', 'p2'], archived: i < nEvents - 2, createdAt: i }));
  // ~600 movimenti l'anno, a ritroso da oggi
  const days = Math.max(30, Math.round(n / 600 * 365));
  const today = new Date();
  const expenses = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - Math.floor(rnd() * days));
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const income = rnd() < 0.06;
    const c = income ? pick(INCOME_CATEGORIES) : pick(CATEGORIES);
    const amount = Math.round((2 + rnd() * (income ? 2000 : 120)) * 100) / 100;
    const e = { id: i + 1, date, amount, type: income ? 'income' : 'expense', cat: c.id, sub: income ? c.name : pick(c.subs), note: rnd() < 0.3 ? 'nota ' + i : '', ts: i };
    if (!income && rnd() < 0.15) {
      const who = [pick(people).id, pick(people).id].filter((x, k, a) => a.indexOf(x) === k);
      if (rnd() < 0.3) { e.payer = who[0]; e.paid = 0; e.payerTotal = Math.round(amount * 2 * 100) / 100; e.splitMode = 'equal'; }
      else { const tot = Math.round(amount * (who.length + 1) * 100) / 100; e.splits = who.map(id => ({ personId: id, amount }));
        e.paid = Math.round((amount * (who.length + 1)) * 100) / 100; e.splitMode = 'exact'; void tot; }
      if (rnd() < 0.5) e.eventId = pick(events).id;
    }
    expenses.push(e);
  }
  const settlements = Array.from({ length: Math.round(n / 50) }, (_, i) => ({ id: `s${i}`, personId: pick(people).id,
    direction: rnd() < 0.7 ? 'in' : 'out', amount: Math.round(rnd() * 5000) / 100 + 1, date: expenses[i % n].date, note: '', ts: i }));
  return { expenses, people, events, settlements };
}

async function time(fn, runs = 3) {
  const t = [];
  for (let i = 0; i < runs; i++) { const t0 = performance.now(); await fn(); t.push(performance.now() - t0); await sleep(20); }
  return Math.round(t.sort((a, b) => a - b)[Math.floor(runs / 2)]);
}

export async function run(sizes = [600, 3000, 6000, 20000, 50000], label = 'perf-report') {
  window.confirm = () => true;
  const out = { ua: navigator.userAgent, cpu: navigator.hardwareConcurrency, results: [] };
  for (const n of sizes) {
    const data = dataset(n);
    const tLoad = performance.now();
    await DB.replaceAll(data);
    const r = { n, replaceAll: Math.round(performance.now() - tLoad) };
    r.allExpenses = await time(() => DB.allExpenses());
    r.monthRange = await time(() => { const d = new Date(); return DB.expensesBetween(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-31`); });
    $('#periodType').value = 'month'; periodOffset = 0; drillCat = null; statFilter.clear();
    await sleep(300);
    r.statsCard = await time(() => renderStats());
    r.cumulative = await time(() => renderCumulative());
    r.yearDashboard = await time(() => renderYearDashboard());
    r.insights = await time(() => renderInsights());
    // lavoro per ogni tocco di ‹ / ›: prima tutte e 4 le viste, ora solo la scheda del periodo
    r.cambioPeriodo = typeof renderStatsGlobals === 'function' ? r.statsCard : r.statsCard + r.cumulative + r.yearDashboard + r.insights;
    $('#searchInput').value = ''; listLimit = LIST_PAGE;
    r.movimenti = await time(() => renderList());
    $('#searchInput').value = 'nota'; r.ricerca = await time(() => renderList()); $('#searchInput').value = '';
    r.budget = await time(async () => { await renderBudget(); await renderGoal(); });
    r.persone = await time(() => PeopleUI.renderList());
    r.schedaPersona = await time(() => PeopleUI.openPerson('p0'));
    r.eventi = await time(() => EventsUI.renderList());
    // con la sezione "Archiviati" aperta (tutti gli eventi in elenco)
    if (!document.querySelector('#eventsPane [data-act=arch][aria-expanded=true]')) { document.querySelector('#eventsPane [data-act=arch]')?.click(); await sleep(300); }
    r.eventiArchiviati = await time(() => EventsUI.renderList());
    document.querySelector('#eventsPane [data-act=arch]')?.click(); await sleep(200);
    r.saldiPagatoDa = await time(async () => Ledger.balances(await DB.allExpenses(), await DB.all('settlements')));
    let json = '';
    r.exportJson = await time(async () => { json = JSON.stringify(await buildBackup(), null, 2); });
    r.exportKB = Math.round(json.length / 1024);
    out.results.push(r);
    console.table([r]);
    showView('add');
  }
  try { await fetch(`/__golden/save?label=${label}`, { method: 'POST', body: JSON.stringify(out, null, 1) }); } catch (e) { /* solo locale */ }
  window.__perf = out;
  return out;
}
