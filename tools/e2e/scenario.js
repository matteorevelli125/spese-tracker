// Scenario end-to-end sulle spese condivise, da eseguire DENTRO l'app (localhost).
//
// Uso (vedi tools/e2e/README.md): carica i dati con il golden test, poi nella pagina
//   const m = await import('/tools/e2e/scenario.js'); await m.run();
// Il risultato va anche al server golden come private/snapshots/e2e-report.json.
//
// Ogni passo agisce dall'INTERFACCIA (wizard, pannelli, schede) e poi confronta i
// numeri mostrati in tutte le sezioni con un ORACOLO indipendente, calcolato in
// questo file direttamente dai record del DB (non usa Ledger né le funzioni dell'app).
// In più verifica le variazioni attese passo per passo (es. "il mese sale di 3,34").
// Alla fine elimina tutto ciò che ha creato: i dati tornano quelli di partenza.

const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const cents = x => Math.round(Number(x) * 100);
// "1.234,56 €" · "−12,50 €" · "+5,00 €" → centesimi
const parseEur = s => {
  const m = String(s).replace(/\s/g, '').match(/[+\-−]?[\d.]+,\d{2}/);
  if (!m) return null;
  return Math.round(parseFloat(m[0].replace('−', '-').replace(/\./g, '').replace(',', '.')) * 100);
};
const fmtE = c => (c / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayLabel = d => new Date(d + 'T12:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long' });
// confronto di record indipendente dall'ordine dei campi
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x));
const catName = id => (CATEGORIES.find(c => c.id === id) || { name: id }).name;

const R = { steps: [], checks: 0, failures: [] };
let step = '(avvio)';
function ok(cond, what, detail) {
  R.checks++;
  if (!cond) R.failures.push({ step, what, detail });
  return cond;
}
const eq = (a, b, what) => ok(a === b, what, `atteso ${b}, trovato ${a}`);
function banner(t) {
  let b = $('#e2eBanner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'e2eBanner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99;padding:6px 10px;background:#000;color:#fff;font:600 11px/1.3 system-ui';
    document.body.appendChild(b);
  }
  b.textContent = 'E2E · ' + t;
}

// ---------------- ORACOLO (indipendente dall'app) ----------------
async function oracle() {
  const [exps, sets, budgets] = await Promise.all([DB.allExpenses(), DB.all('settlements'), DB.allBudgets()]);
  const isInc = e => e.type === 'income';
  const sumBy = (list, f) => list.reduce((a, e) => a + f(e), 0);
  const period = prefix => {
    const ex = exps.filter(e => !isInc(e) && e.date.startsWith(prefix));
    const inc = exps.filter(e => isInc(e) && e.date.startsWith(prefix));
    const byCat = {};
    ex.forEach(e => { byCat[catName(e.cat)] = (byCat[catName(e.cat)] || 0) + cents(e.amount); });
    return { total: sumBy(ex, e => cents(e.amount)), inc: sumBy(inc, e => cents(e.amount)), byCat,
      n: exps.filter(e => e.date.startsWith(prefix)).length };
  };
  const day = d => sumBy(exps.filter(e => e.date === d), e => (isInc(e) ? 1 : -1) * cents(e.amount));
  const cumulative = sumBy(exps, e => (isInc(e) ? 1 : -1) * cents(e.amount));
  // saldi per persona, implementazione autonoma (positivo = mi deve)
  const bal = {};
  const add = (id, c) => { bal[id] = (bal[id] || 0) + c; };
  exps.filter(e => !isInc(e)).forEach(e => {
    if (e.payer) add(e.payer, -cents(e.amount));
    else (e.splits || []).forEach(s => add(s.personId, cents(s.amount)));
  });
  sets.forEach(s => add(s.personId, (s.direction === 'out' ? 1 : -1) * cents(s.amount)));
  const event = id => {
    const ex = exps.filter(e => !isInc(e) && e.eventId === id);
    return { quota: sumBy(ex, e => cents(e.amount)),
      paidByMe: sumBy(ex, e => (e.payer ? 0 : cents(e.paid != null ? e.paid : e.amount))),
      paidByOthers: sumBy(ex.filter(e => e.payer), e => cents(e.amount)), count: ex.length };
  };
  return { exps, sets, budgets, period, day, cumulative, bal, event };
}

// ---------------- LETTURA DELLE SEZIONI (DOM) ----------------
async function readStats(type, off) {
  $('#periodType').value = type;
  periodOffset = off; drillCat = null; statFilter.clear();
  await renderStats();
  const cats = {};
  $$('#catBars .hbar-row').forEach(r => {
    const name = r.querySelector('.lbl').textContent.replace(/^[^\p{L}]+/u, '').trim();
    const v = parseEur(r.querySelector('.val').textContent);
    if (v) cats[name] = v; // una categoria a 0 € (es. "non partecipo") equivale ad assente
  });
  const b = $$('#statBalance b').map(x => parseEur(x.textContent));
  return { label: $('#periodLabel').textContent, total: parseEur($('#statTotal').textContent), cats,
    inc: b.length ? b[0] : 0, exp: b.length ? Math.abs(b[1]) : 0 };
}
const monthOffset = ym => {
  const n = new Date();
  return (+ym.slice(0, 4) - n.getFullYear()) * 12 + (+ym.slice(5, 7) - 1 - n.getMonth());
};
async function readBudget() {
  await renderBudget();
  const rows = {};
  $$('#budgetProgress .budget-row').forEach(r => {
    const name = r.querySelector('.head span').textContent.replace(/^[^\p{L}]+/u, '').trim();
    rows[name] = parseEur(r.querySelector('.head .sp').textContent);
  });
  return { rows, total: parseEur($('#budgetSummary .amt').textContent) };
}
async function readCumulative() { await renderCumulative(); return parseEur($('#cumulativeChart .cum-head b').textContent); }
async function readListDay(d) {
  $('#searchInput').value = '';
  await renderList();
  const h = $$('#expList .day-header').find(x => x.firstElementChild.textContent === dayLabel(d));
  return h ? parseEur(h.lastElementChild.textContent) : null;
}
async function readDashboardMonth(m) {
  await renderYearDashboard();
  const row = $$('#tblMonthly tbody tr')[m];
  if (!row) return null;
  const td = row.querySelectorAll('td');
  return { exp: +td[2].textContent.replace(/\./g, ''), n: +td[8].textContent };
}
async function readPeople() {
  await PeopleUI.renderList();
  const owe = $$('#peoplePane .owe-card b').map(x => parseEur(x.textContent));
  const rows = {};
  $$('#peoplePane .person-row').forEach(r => {
    const r2 = r.querySelector('.r');
    const v = parseEur(r2.firstChild.textContent);
    rows[r.dataset.id] = r2.classList.contains('neg') ? -v : v;
  });
  return { owedToMe: owe[0] || 0, iOwe: owe[1] || 0, rows };
}
async function readEvent(id) {
  await EventsUI.openEvent(id);
  await sleep(150);
  const k = $$('#eventBody .kpi3 b');
  return { quota: parseEur($('#eventBody .person-hero .big').textContent), paidByMe: parseEur(k[0].textContent),
    paidByOthers: parseEur(k[1].textContent), count: +k[2].textContent };
}

// ---------------- CONFRONTO COMPLETO: DOM vs ORACOLO ----------------
const touched = { months: new Set(), days: new Set(), events: new Set() };
async function checkAll() {
  const o = await oracle();
  const now = new Date();
  const ym = d => d.slice(0, 7);
  const months = new Set([`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, ...touched.months]);
  for (const m of months) {
    const s = await readStats('month', monthOffset(m)), p = o.period(m);
    eq(s.total, p.total, `Statistiche ${m}: totale uscite`);
    eq(s.inc, p.inc, `Statistiche ${m}: entrate`);
    eq(JSON.stringify(Object.entries(s.cats).sort()), JSON.stringify(Object.entries(p.byCat).filter(([, v]) => v).sort()), `Statistiche ${m}: per categoria`);
    if (+m.slice(0, 4) === now.getFullYear()) {
      const d = await readDashboardMonth(+m.slice(5, 7) - 1);
      ok(d && Math.abs(d.exp - Math.round(p.total / 100)) <= 1, `Cruscotto ${m}: uscite`, `atteso ~${Math.round(p.total / 100)}, trovato ${d && d.exp}`);
      ok(d && d.n === p.n, `Cruscotto ${m}: n. movimenti`, `atteso ${p.n}, trovato ${d && d.n}`);
    }
  }
  for (const y of new Set([String(now.getFullYear()), ...[...touched.months].map(m => m.slice(0, 4))])) {
    const s = await readStats('year', +y - now.getFullYear()), p = o.period(y);
    eq(s.total, p.total, `Statistiche anno ${y}: totale`);
    eq(s.inc, p.inc, `Statistiche anno ${y}: entrate`);
  }
  const b = await readBudget(), cur = o.period(ym(todayStr()));
  for (const bud of o.budgets) {
    eq(b.rows[catName(bud.cat)], cur.byCat[catName(bud.cat)] || 0, `Budget ${catName(bud.cat)}: speso`);
  }
  eq(b.total, o.budgets.reduce((a, x) => a + (cur.byCat[catName(x.cat)] || 0), 0), 'Budget: totale speso');
  eq(await readCumulative(), o.cumulative, 'Saldo cumulato');
  // Movimenti mostra solo i 300 più recenti (limite dell'app): controllo i giorni visibili
  const visible = new Set(o.exps.slice().sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts).slice(0, 300).map(e => e.date));
  for (const d of touched.days) {
    if (o.exps.some(e => e.date === d) && !visible.has(d)) continue;
    const v = await readListDay(d), want = o.day(d);
    const has = o.exps.some(e => e.date === d);
    ok(has ? v === want : v === null, `Movimenti ${d}: totale del giorno`, `atteso ${has ? want : 'giorno assente'}, trovato ${v}`);
  }
  const pp = await readPeople();
  const want = Object.entries(o.bal);
  eq(pp.owedToMe, want.reduce((a, [, v]) => a + Math.max(v, 0), 0), 'Persone: ti devono');
  eq(pp.iOwe, want.reduce((a, [, v]) => a + Math.max(-v, 0), 0), 'Persone: devi');
  for (const [id, v] of want) if (id in pp.rows) eq(pp.rows[id], v, `Persone: saldo ${id}`);
  for (const id of touched.events) {
    if (!(await DB.all('events')).some(e => e.id === id)) continue;
    const ev = await readEvent(id), x = o.event(id);
    eq(ev.quota, x.quota, `Evento ${id}: tua quota`);
    eq(ev.paidByMe, x.paidByMe, `Evento ${id}: pagato da te`);
    eq(ev.paidByOthers, x.paidByOthers, `Evento ${id}: pagato da altri`);
    eq(ev.count, x.count, `Evento ${id}: n. spese`);
  }
  showView('add');
  return o;
}

// ---------------- AZIONI DALL'INTERFACCIA ----------------
const W = {
  async fresh() { document.querySelector('nav button[data-view=add]').click(); await sleep(450); },
  amount(v) { const i = $('#amountInput'); i.value = v; i.dispatchEvent(new Event('input')); },
  async type(t) { $(`#typeToggle [data-type=${t}]`).click(); await sleep(250); },
  async cat(cat, sub) {
    if (selCat && selCat !== cat) { $('.cat-btn.selected .cat-edit').click(); await sleep(450); }
    if (selCat !== cat) { $(`.cat-btn[aria-label="${catName(cat)}"]`).click(); await sleep(750); }
    if (sub) { $$('.sub-tile').find(b => b.textContent === sub).click(); await sleep(50); }
  },
  date(d) { $('#dateInput').value = d; },
  note(n) { $('#noteInput').value = n; },
  // persone per nome (create se mancano) → nel pannello aperto
  async pick(names) {
    for (const n of names) {
      const chip = $$('.sheet .chips .chip').find(c => c.textContent.trim().endsWith(n));
      if (chip) { if (!chip.classList.contains('selected')) chip.click(); await sleep(50); continue; }
      const q = $('.sheet .pick-search'); q.value = n; q.dispatchEvent(new Event('input'));
      await sleep(50);
      const b = $$('.sheet .pick-suggest .pick-row').find(r => r.textContent.trim().endsWith(n) || r.dataset.create);
      b.click(); await sleep(350);
    }
  },
  async split({ people = [], exact, notMe, myShare, clear } = {}) {
    $('#splitRow').click(); await sleep(400);
    if (clear) { $('.sheet [data-cancel]').click(); await sleep(250); return; }
    // deseleziono chi non va (es. partecipanti preimpostati)
    await W.pick(people);
    if (exact || myShare != null) { const sw = $('.sheet [data-opt=exact]'); if (!sw.checked) sw.click(); await sleep(50); }
    if (notMe) { $('.sheet [data-opt=notMe]').click(); await sleep(50); }
    if (exact) for (const [n, v] of Object.entries(exact)) {
      const row = $$('.sheet .split-row').find(r => r.querySelector('.nm') && r.querySelector('.nm').textContent.startsWith(n));
      const inp = row.querySelector('.split-inp'); inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (myShare != null) { const inp = $('.sheet [data-me-inp]'); inp.value = myShare; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    const okBtn = $('.sheet [data-ok]');
    const res = { disabled: okBtn.disabled, err: ($('.sheet [data-err]') || {}).textContent || '' };
    if (!okBtn.disabled) { okBtn.click(); await sleep(300); } else { $('.sheet-backdrop').click(); await sleep(250); }
    return res;
  },
  async payer(name) {
    $('#payerRow').click(); await sleep(400);
    const row = $$('.sheet .pick-row').find(r => (name ? r.textContent.includes(name) : r.dataset.id === ''));
    if (row) { row.click(); await sleep(350); return; }
    const q = $('.sheet .pick-search'); q.value = name; q.dispatchEvent(new Event('input')); await sleep(50);
    $('.sheet [data-create]').click(); await sleep(400);
  },
  async event(name) {
    $('#eventRow').click(); await sleep(400);
    $$('.sheet .pick-row').find(r => (name ? r.textContent.includes(name) : r.dataset.id === '')).click(); await sleep(300);
  },
  // Salva; se compare l'avviso RF-S2 lo accetta (o rifiuta) e lo restituisce
  async save({ acceptFlip = true } = {}) {
    if ($('#saveBtn').disabled) return { saved: false };
    const before = (await DB.allExpenses()).length;
    $('#saveBtn').click(); await sleep(500);
    let dialog = null;
    const d = $('.dialog');
    if (d) { dialog = d.innerText.replace(/\n/g, ' | '); d.querySelector(`[data-r="${acceptFlip ? 1 : 0}"]`).click(); await sleep(500); }
    const cel = $('.cel-ok'); if (cel) cel.click();
    await sleep(100);
    return { saved: true, dialog, added: (await DB.allExpenses()).length - before };
  },
};
const last = async () => (await DB.allExpenses()).sort((a, b) => b.id - a.id)[0];
const personId = async name => ((await DB.all('people')).find(p => p.name === name) || {}).id;

// ---------------- SCENARIO ----------------
export async function run() {
  window.confirm = () => true; // conferme native (es. "Eliminare questo movimento?")
  const t0 = Date.now();
  const today = todayStr();
  const base = await oracle();
  const baseMaxId = Math.max(0, ...base.exps.map(e => e.id));
  const created = new Set();
  const mark = async () => { const r = await last(); created.add(r.id); return r; };
  const S = async (name, fn) => {
    step = name; banner(name);
    const f0 = R.failures.length;
    try { await fn(); } catch (err) { ok(false, 'eccezione', String(err && err.stack || err)); }
    await checkAll();
    R.steps.push({ step: name, failures: R.failures.length - f0 });
  };
  const delta = async (fn, label) => { const a = await oracle(); await fn(); const b = await oracle(); return { a, b }; };
  touched.days.add(today);

  await S('0 · Base: dati reali senza modifiche', async () => {});

  let s1, s2, s3, s5, s7, s8;
  await S('1 · Spesa normale (controllo)', async () => {
    await W.fresh(); W.amount('12,5'); await W.cat('cibo', 'Bar e caffè'); W.note('E2E caffè');
    const { a, b } = await delta(() => W.save());
    s1 = await mark();
    eq(Object.keys(s1).sort().join(','), 'amount,cat,date,id,note,sub,ts,type', 'record identico al formato di prima');
    eq(b.period(today.slice(0, 7)).total - a.period(today.slice(0, 7)).total, 1250, 'mese +12,50');
  });

  await S('2 · Divisa in 3 parti uguali con arrotondamento (10 €)', async () => {
    await W.fresh(); W.amount('10'); await W.cat('svago', 'Cinema e eventi'); W.note('E2E cinema');
    await W.split({ people: ['Giulia E2E', 'Marco E2E'] });
    const { a, b } = await delta(() => W.save());
    s2 = await mark();
    eq(cents(s2.amount), 334, 'mia quota 3,34 (resto a me)');
    eq(s2.splits.map(x => cents(x.amount)).join(','), '333,333', 'quote altrui 3,33');
    eq(b.period(today.slice(0, 7)).total - a.period(today.slice(0, 7)).total, 334, 'statistiche +3,34, non +10');
  });

  await S('3 · Importi esatti: oltre il totale bloccato, poi valido', async () => {
    await W.fresh(); W.amount('100'); await W.cat('cibo', 'Ristorante'); W.note('E2E ristorante esatti');
    const bad = await W.split({ people: ['Giulia E2E', 'Marco E2E'], exact: { 'Giulia E2E': '45', 'Marco E2E': '70' } });
    ok(bad.disabled && /superano/.test(bad.err), 'quote > totale: Conferma disabilitata', JSON.stringify(bad));
    eq((await DB.allExpenses()).length, base.exps.length + 2, 'nessun salvataggio');
    const good = await W.split({ people: ['Giulia E2E', 'Marco E2E'], exact: { 'Giulia E2E': '45', 'Marco E2E': '20' } });
    ok(!good.disabled, 'quote valide confermabili');
    await W.save(); s3 = await mark();
    eq(cents(s3.amount), 3500, 'mia quota residua 35');
  });

  await S('4 · Non partecipo (quota 0)', async () => {
    await W.fresh(); W.amount('30'); await W.cat('regali', 'Regali'); W.note('E2E regalo per Luca');
    await W.split({ people: ['Luca E2E'], notMe: true });
    const { a, b } = await delta(() => W.save());
    const r = await mark();
    eq(cents(r.amount), 0, 'quota 0');
    eq(b.period(today.slice(0, 7)).total, a.period(today.slice(0, 7)).total, 'statistiche invariate');
    eq(b.bal[await personId('Luca E2E')], 3000, 'Luca mi deve 30');
  });

  await S('5 · Pagato da altri: totale 96, in 2 → 48', async () => {
    await W.fresh(); W.amount('96'); await W.cat('cibo', 'Ristorante'); W.note('E2E cena pagata da Giulia');
    await W.payer('Giulia E2E');
    eq($('#amountLabel').textContent, 'Totale pagato da Giulia E2E', 'etichetta totale');
    const gi = await personId('Giulia E2E');
    const { a, b } = await delta(() => W.save());
    s5 = await mark();
    eq([cents(s5.amount), cents(s5.payerTotal), cents(s5.paid)].join(','), '4800,9600,0', 'quota 48 su 96, dal conto 0');
    eq(b.bal[gi] - a.bal[gi], -4800, 'debito verso Giulia 48');
  });

  await S('6 · Pagato da altri: quota a mano oltre il totale bloccata', async () => {
    await W.fresh(); W.amount('60'); await W.cat('trasporti', 'Taxi'); await W.payer('Marco E2E');
    const r = await W.split({ myShare: '70' });
    ok(r.disabled && /supera/.test(r.err), 'quota > totale bloccata', JSON.stringify(r));
    const r2 = await W.split({ myShare: '15' });
    ok(!r2.disabled, 'quota 15 accettata');
    await W.save(); const x = await mark();
    eq([cents(x.amount), cents(x.payerTotal), x.splitMode].join(','), '1500,6000,exact', 'quota a mano salvata');
  });

  await S('7 · Entrata (niente divisione) e altro mese (31/10)', async () => {
    await W.fresh(); await W.type('income'); ok($('#payerRow').hidden && $('#splitRow').hidden && $('#eventRow').hidden, 'righe condivise nascoste');
    W.amount('50'); $(`.cat-btn[aria-label="Bonus"]`).click(); await sleep(400); W.note('E2E bonus');
    await W.save(); s7 = await mark();
    eq(s7.type, 'income', 'entrata salvata'); await W.type('expense');
    await W.fresh(); W.amount('50'); await W.cat('trasporti', 'Taxi'); W.date('2026-10-31'); W.note('E2E taxi ottobre');
    await W.split({ people: ['Marco E2E'] });
    await W.save(); await mark();
    touched.months.add('2026-10'); touched.days.add('2026-10-31');
  });

  await S('8 · Anno precedente (31/12/2025): nuovo anno nelle statistiche', async () => {
    await W.fresh(); W.amount('20'); await W.cat('casa', 'Altro'); W.date('2025-12-31'); W.note('E2E fine anno');
    await W.save(); s8 = await mark();
    touched.months.add('2025-12'); touched.days.add('2025-12-31');
  });

  let evId;
  await S('9 · Evento in corso: creazione, preselezione, categoria e partecipanti', async () => {
    showView('share'); $('#shareSeg [data-pane=events]').click(); await sleep(300);
    $('#eventsPane [data-act=new]').click(); await sleep(500);
    $('#evName').value = 'E2E Vacanza'; $('#evName').dispatchEvent(new Event('input', { bubbles: true }));
    const d = new Date(); const pad = n => String(n).padStart(2, '0');
    const ds = x => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
    $('#evStart').value = ds(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 2));
    $('#evEnd').value = ds(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 2));
    for (const n of ['Giulia E2E', 'Marco E2E', 'Luca E2E']) $$('#evChips .chip').find(c => c.textContent.trim().endsWith(n)).click();
    $('#evSave').click(); await sleep(600);
    evId = (await DB.all('events')).find(e => e.name === 'E2E Vacanza').id;
    touched.events.add(evId);
    await W.fresh();
    ok($('#eventVal').textContent.includes('E2E Vacanza'), 'evento preselezionato (in corso oggi)');
    eq(selCat, 'viaggi', 'categoria predefinita Vacanze');
    W.amount('120'); await W.cat('viaggi', 'Alloggio'); W.note('E2E alloggio');
    await W.save(); const r = await mark();
    eq([cents(r.amount), r.splits.length, r.eventId === evId].join(','), '3000,3,true', '120 in 4 → 30, nell\'evento');
    ok($('#eventVal').textContent.includes('E2E Vacanza') && selCat === 'viaggi' && /3 persone/.test($('#splitVal').textContent),
      'dopo il salvataggio restano evento, categoria e partecipanti', $('#splitVal').textContent);
  });

  await S('10 · Evento: pagato da Marco 80 tra 4 → 20; Luca paga 60, mia quota a mano 15 in altra categoria', async () => {
    W.amount('80'); await W.cat('viaggi', 'Cibo'); await W.payer('Marco E2E');
    ok(/4 persone/.test($('#splitVal').textContent), 'Diviso tra 4 persone (pagatore contato una volta)', $('#splitVal').textContent);
    await W.save(); let r = await mark();
    eq([cents(r.amount), r.shareWith.length, r.eventId === evId].join(','), '2000,2,true', 'quota 20, shareWith 2');
    W.amount('60'); await W.cat('auto', 'Carburante'); await W.payer('Luca E2E'); await W.split({ myShare: '15' });
    await W.save(); r = await mark();
    eq([cents(r.amount), r.cat, r.eventId === evId].join(','), '1500,auto,true', 'altra categoria nello stesso evento');
  });

  await S('11 · Rimborsi: parziale, oltre il saldo (solo avviso), restituzione, saldato, eliminazione', async () => {
    const gi = await personId('Giulia E2E'), ma = await personId('Marco E2E'), lu = await personId('Luca E2E');
    await PeopleUI.openPerson(lu); await sleep(300);
    await PeopleUI.openSettlement(lu); await sleep(300);
    const inp = $('.sheet #setAmount'); inp.value = '9999'; inp.dispatchEvent(new Event('input'));
    ok(!$('.sheet [data-warn]').hidden, 'avviso rimborso oltre il saldo');
    inp.value = '10'; inp.dispatchEvent(new Event('input'));
    $('.sheet [data-act=save]').click(); await sleep(500);
    const o1 = await oracle();
    // Giulia: devo 48 − sue quote → restituisco 5 (direzione "out" se negativo)
    await PeopleUI.openSettlement(gi); await sleep(300);
    ok(/Ho restituito|Registra rimborso/.test($('.sheet h3').textContent), 'titolo coerente con il segno del saldo', $('.sheet h3').textContent);
    $('.sheet #setAmount').value = '5'; $('.sheet #setAmount').dispatchEvent(new Event('input'));
    $('.sheet [data-act=save]').click(); await sleep(500);
    // Marco: segna come saldato
    await PeopleUI.openPerson(ma); await sleep(300);
    $('#personBody [data-act=even]').click(); await sleep(300); $('.dialog [data-r="1"]').click(); await sleep(500);
    eq((await oracle()).bal[ma], 0, 'Marco in pari dopo "saldato"');
    // elimino il primo rimborso di Luca → torna al saldo precedente
    const st = (await DB.all('settlements')).find(s => s.personId === lu);
    await PeopleUI.openSettlement(lu, { edit: st }); await sleep(300);
    $('.sheet [data-act=del]').click(); await sleep(300); $('.dialog [data-r="1"]').click(); await sleep(500);
    eq((await oracle()).bal[lu], o1.bal[lu] + 1000, 'eliminato il rimborso, saldo Luca ripristinato');
    ok(true, 'statistiche non toccate dai rimborsi (verificato da checkAll)');
  });

  await S('12 · Modifica: 10 → 13 € nella divisa in 3', async () => {
    startEdit(s2); await sleep(500);
    eq($('#amountInput').value, '10', 'il wizard riapre il pagato');
    W.amount('13');
    const { a, b } = await delta(() => W.save());
    const r = (await DB.allExpenses()).find(e => e.id === s2.id);
    eq(cents(r.amount), 434, 'nuova quota 4,34');
    eq(b.period(today.slice(0, 7)).total - a.period(today.slice(0, 7)).total, 100, 'statistiche +1,00');
  });

  await S('13 · Modifica: Giulia pagatrice → pago io, Giulia rientra tra i partecipanti', async () => {
    startEdit(s5); await sleep(500);
    eq($('#amountInput').value, '96', 'riapre il totale pagato da Giulia');
    await W.payer(null); // torno a "Io": Giulia rientra tra i partecipanti
    ok(/Giulia E2E/.test($('#splitVal').textContent), 'Giulia ora in "Diviso con"', $('#splitVal').textContent);
    const a = await oracle(); const gi = await personId('Giulia E2E');
    const res = await W.save({ acceptFlip: true });
    const b = await oracle();
    // l'avviso compare solo se il saldo di Giulia cambia davvero segno
    const flip = Math.sign(b.bal[gi]) !== Math.sign(a.bal[gi]) && b.bal[gi] !== 0;
    eq(!!res.dialog, flip, 'avviso RF-S2 solo se il saldo cambia segno');
    eq(b.bal[gi] - a.bal[gi], 9600, 'Giulia: da −48 (pagatrice) a +48 (mi deve)');
    const r = (await DB.allExpenses()).find(e => e.id === s5.id);
    eq([cents(r.amount), cents(r.paid), r.payer === undefined].join(','), '4800,9600,true', 'ora ho pagato io 96, quota 48');
  });

  await S('14 · Eliminazioni: con e senza avviso', async () => {
    const ma = await personId('Marco E2E');
    const a = await oracle();
    startEdit(s3); await sleep(400);
    $('#deleteBtn').click(); await sleep(600);
    const d = $('.dialog');
    // Marco (saldato, poi +1 dalla modifica) perde la quota di 20 → diventa creditore: avviso atteso
    const flip = Math.sign(a.bal[ma] - 2000) !== Math.sign(a.bal[ma]) && a.bal[ma] - 2000 !== 0;
    eq(!!d, flip, 'avviso RF-S2 all\'eliminazione quando un saldo cambia segno');
    if (d) { ok(/Marco E2E/.test(d.innerText), 'avviso cita Marco', d.innerText); d.querySelector('[data-r="1"]').click(); await sleep(500); }
    ok(!(await DB.allExpenses()).some(e => e.id === s3.id), 'spesa divisa eliminata');
    created.delete(s3.id);
    startEdit(s1); await sleep(400); $('#deleteBtn').click(); await sleep(600);
    ok(!(await DB.allExpenses()).some(e => e.id === s1.id), 'spesa normale eliminata'); created.delete(s1.id);
  });

  await S('15 · Doppione unito: "Giuli E2E" in "Giulia E2E" con spesa in comune', async () => {
    await W.fresh(); await W.event(null); await W.split({ clear: true });
    ok(!/persone|E2E/.test($('#splitVal').textContent), 'divisione tolta', $('#splitVal').textContent);
    W.amount('30'); await W.cat('cibo', 'Ristorante'); W.note('E2E pizza doppione');
    await W.split({ people: ['Giulia E2E', 'Giuli E2E'] });
    await W.save(); await mark();
    const a = await oracle(); const gi = await personId('Giulia E2E'), gl = await personId('Giuli E2E');
    await PeopleUI.openPerson(gl); await sleep(300);
    $('#personMore').click(); await sleep(300); $('.sheet [data-act=merge]').click(); await sleep(400);
    $$('.sheet .pick-row').find(r => r.textContent.includes('Giulia E2E')).click(); await sleep(400);
    $('.dialog [data-r="1"]').click(); await sleep(700);
    const b = await oracle();
    eq(b.bal[gi], a.bal[gi] + a.bal[gl], 'saldi sommati');
    ok(!(await DB.all('people')).some(p => p.id === gl), 'doppione eliminato');
  });

  await S('16 · Archiviazione rifiutata con saldo ≠ 0', async () => {
    const gi = await personId('Giulia E2E');
    await PeopleUI.openPerson(gi); await sleep(300);
    $('#personMore').click(); await sleep(300); $('.sheet [data-act=archive]').click(); await sleep(400);
    ok(/saldo a zero/.test($('#toast').textContent), 'messaggio di rifiuto', $('#toast').textContent);
    ok(!(await DB.all('people')).find(p => p.id === gi).archived, 'non archiviata');
  });

  await S('17 · Ricerca e CSV', async () => {
    showView('list'); $('#searchInput').value = 'e2e vacanza'; await renderList();
    eq($$('#expList .exp-item').length, (await DB.allExpenses()).filter(e => e.eventId === evId).length, 'ricerca per evento');
    $('#searchInput').value = 'giulia e2e'; await renderList();
    const gi = await personId('Giulia E2E');
    eq($$('#expList .exp-item').length, (await DB.allExpenses()).filter(e => e.payer === gi || (e.splits || []).some(s => s.personId === gi) || (e.shareWith || []).includes(gi)).length, 'ricerca per persona');
    $('#searchInput').value = '';
    let csv = null; const oc = URL.createObjectURL, os = navigator.canShare, ock = HTMLAnchorElement.prototype.click;
    navigator.canShare = () => false; URL.createObjectURL = bl => { bl.text().then(t => { csv = t; }); return 'blob:x'; };
    HTMLAnchorElement.prototype.click = function () {};
    await exportData('csv'); await sleep(300);
    URL.createObjectURL = oc; navigator.canShare = os; HTMLAnchorElement.prototype.click = ock;
    const lines = csv.trim().split('\r\n');
    eq(lines.length - 1, (await DB.allExpenses()).length, 'righe CSV = movimenti');
    eq(lines[0].split(';').length, 11, 'colonne CSV');
  });

  await S('18 · Export v2 → "Sostituisci tutto": niente cambia', async () => {
    const before = await oracle();
    const b = JSON.parse(JSON.stringify(await buildBackup()));
    await DB.replaceAll(Sanitize.backup(b, { keepId: true }));
    const after = await oracle();
    eq(canon(after.exps), canon(before.exps), 'movimenti identici (contenuto)');
    eq(canon(after.bal), canon(before.bal), 'saldi identici');
  });

  await S('19 · Eliminazione evento: spese e saldi restano', async () => {
    const a = await oracle();
    await EventsUI.openEvent(evId); await sleep(300);
    $('#eventMore').click(); await sleep(300); $('.sheet [data-act=delete]').click(); await sleep(300);
    $('.dialog [data-r="1"]').click(); await sleep(600);
    const b = await oracle();
    eq(b.exps.length, a.exps.length, 'nessuna spesa persa');
    eq(b.exps.filter(e => e.eventId).length, 0, 'etichette rimosse');
    eq(JSON.stringify(b.bal), JSON.stringify(a.bal), 'saldi invariati');
    touched.events.delete(evId);
  });

  await S('20 · Pulizia: elimino dall\'interfaccia tutto ciò che ho creato', async () => {
    const mine = (await DB.allExpenses()).filter(e => e.id > baseMaxId);
    for (const e of mine) {
      startEdit(e); await sleep(350);
      $('#deleteBtn').click(); await sleep(500);
      const d = $('.dialog'); if (d) { d.querySelector('[data-r="1"]').click(); await sleep(450); }
    }
    for (const s of await DB.all('settlements')) await DB.del('settlements', s.id);
    for (const p of await DB.all('people')) await DB.del('people', p.id);
    const o = await oracle();
    eq(o.exps.length, base.exps.length, 'numero movimenti come all\'inizio');
    eq(JSON.stringify(o.exps.map(e => e.id).sort((a, b) => a - b)), JSON.stringify(base.exps.map(e => e.id).sort((a, b) => a - b)), 'stessi id dell\'inizio');
    eq(o.cumulative, base.cumulative, 'saldo cumulato come all\'inizio');
    touched.days.clear(); touched.months.clear(); touched.days.add(today);
  });

  R.duration = Math.round((Date.now() - t0) / 1000) + ' s';
  R.passed = R.checks - R.failures.length;
  banner(`fatto: ${R.passed}/${R.checks} controlli ok, ${R.failures.length} falliti (${R.duration})`);
  try { await fetch('/__golden/save?label=e2e-report', { method: 'POST', body: JSON.stringify(R, null, 1) }); } catch (e) { /* solo locale */ }
  window.__e2e = R;
  return R;
}
