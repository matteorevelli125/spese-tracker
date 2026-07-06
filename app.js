/* Spese Tracker — logica applicativa */
'use strict';

const $ = sel => document.querySelector(sel);
const fmt = n => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
// Escaping HTML per ogni valore controllato dall'utente prima di inserirlo via innerHTML.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in ora locale
const pad = n => String(n).padStart(2, '0');
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 1800);
}

/* ---------- Navigazione ---------- */
document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    // Toccare "Aggiungi" dalla tab bar riparte sempre da un nuovo movimento.
    if (btn.dataset.view === 'add' && typeof resetAddForm === 'function') resetAddForm();
    showView(btn.dataset.view);
  });
});
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $(`#view-${name}`).classList.add('active');
  if (name === 'list') renderList();
  if (name === 'stats') renderStats();
  if (name === 'budget') renderBudget();
  if (name === 'settings') { renderRecurring(); renderDrive(); }
}

/* ---------- Inserimento ---------- */
// I record hanno type 'expense' | 'income'; i record storici senza campo sono uscite.
const isIncome = e => e.type === 'income';
const buzz = () => { try { navigator.vibrate && navigator.vibrate(10); } catch (e) {} }; // micro-feedback (10ms)
let selType = 'expense', selCat = null, selSub = null;
let editingId = null; // id del movimento in modifica (null = nuovo inserimento)

function setType(type) {
  selType = type;
  document.querySelectorAll('#typeToggle button').forEach(b => b.classList.toggle('selected', b.dataset.type === type));
}
function refreshAddTitles() {
  const editing = editingId !== null;
  $('#addTitle').textContent = editing
    ? (selType === 'income' ? 'Modifica entrata' : 'Modifica spesa')
    : (selType === 'income' ? 'Nuova entrata' : 'Nuova spesa');
  $('#saveBtn').textContent = editing ? 'Aggiorna' : (selType === 'income' ? 'Salva entrata' : 'Salva spesa');
  $('#deleteBtn').style.display = editing ? '' : 'none';
}

document.querySelectorAll('#typeToggle button').forEach(btn => {
  btn.addEventListener('click', () => {
    setType(btn.dataset.type);
    selCat = null; selSub = null;
    refreshAddTitles();
    renderCatGrid(); renderSubList(); updateSaveState();
  });
});

// Riporta il form "Aggiungi" allo stato di nuovo inserimento.
function resetAddForm() {
  editingId = null;
  setType('expense');
  selCat = null; selSub = null;
  $('#amountInput').value = '';
  $('#noteInput').value = '';
  $('#dateInput').value = todayStr();
  refreshAddTitles();
  renderCatGrid(); renderSubList(); updateSaveState();
}

// Apre il movimento in modifica nella schermata Aggiungi.
function startEdit(e) {
  editingId = e.id;
  setType(isIncome(e) ? 'income' : 'expense');
  selCat = e.cat;
  selSub = isIncome(e) ? null : e.sub;
  $('#amountInput').value = String(e.amount).replace('.', ',');
  $('#noteInput').value = e.note || '';
  $('#dateInput').value = e.date;
  showView('add');
  refreshAddTitles();
  renderCatGrid(); renderSubList(); updateSaveState();
}

function renderCatGrid() {
  const grid = $('#catGrid');
  grid.innerHTML = '';
  const list = selType === 'income' ? INCOME_CATEGORIES : CATEGORIES;
  list.forEach(c => {
    const b = document.createElement('button');
    b.className = 'cat-btn' + (selCat === c.id ? ' selected' : '');
    b.innerHTML = `<span class="ico">${c.icon}</span>${c.name}`;
    b.onclick = () => { selCat = c.id; selSub = null; renderCatGrid(); renderSubList(); updateSaveState(); };
    grid.appendChild(b);
  });
}
function renderSubList() {
  const wrap = $('#subList');
  wrap.innerHTML = '';
  const show = selCat && selType === 'expense'; // le entrate non hanno sottocategorie
  $('#subLabel').style.display = show ? '' : 'none';
  if (!show) return;
  catById(selCat).subs.forEach(s => {
    const b = document.createElement('button');
    b.className = 'chip' + (selSub === s ? ' selected' : '');
    b.textContent = s;
    b.onclick = () => { selSub = s; renderSubList(); updateSaveState(); };
    wrap.appendChild(b);
  });
}
function parseAmount(str) {
  const v = parseFloat(String(str).replace(/[€\s]/g, '').replace(',', '.'));
  return isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
}
function updateSaveState() {
  const ok = parseAmount($('#amountInput').value) && selCat && (selType === 'income' || selSub);
  $('#saveBtn').disabled = !ok;
}
$('#amountInput').addEventListener('input', updateSaveState);

$('#saveBtn').addEventListener('click', async () => {
  const amount = parseAmount($('#amountInput').value);
  const income = selType === 'income';
  const record = {
    date: $('#dateInput').value || todayStr(),
    amount,
    type: selType,
    cat: selCat,
    sub: income ? incomeCatById(selCat).name : selSub,
    note: $('#noteInput').value.trim(),
    ts: Date.now(),
  };
  buzz();
  if (editingId !== null) {
    await DB.putExpense({ ...record, id: editingId });
    toast('Movimento aggiornato');
    resetAddForm();
    showView('list');
    return;
  }
  await DB.addExpense(record);
  toast(`${income ? 'Entrata' : 'Salvato'}: ${fmt(amount)} — ${income ? incomeCatById(selCat).name : selSub}`);
  $('#amountInput').value = '';
  $('#noteInput').value = '';
  selSub = null;
  if (income) { selCat = null; renderCatGrid(); }
  renderSubList();
  updateSaveState();
});

$('#deleteBtn').addEventListener('click', async () => {
  if (editingId === null) return;
  if (confirm('Eliminare questo movimento?')) {
    await DB.deleteExpense(editingId);
    toast('Movimento eliminato');
    resetAddForm();
    showView('list');
  }
});

/* ---------- Movimenti ---------- */
$('#searchInput').addEventListener('input', () => renderList());

// Match semplice: sottocategoria, categoria, nota o importo contengono la query.
function matchesQuery(e, q) {
  if (!q) return true;
  const c = isIncome(e) ? incomeCatById(e.cat) : catById(e.cat);
  // includo l'importo sia "grezzo" (18,9) sia a 2 decimali (18,90) per cercare in entrambi i modi
  const amt = `${String(e.amount).replace('.', ',')} ${e.amount.toFixed(2).replace('.', ',')}`;
  const hay = `${e.sub} ${c.name} ${e.note || ''} ${amt}`.toLowerCase();
  return hay.includes(q);
}

async function renderList() {
  const q = ($('#searchInput').value || '').trim().toLowerCase();
  const all = (await DB.allExpenses())
    .filter(e => matchesQuery(e, q))
    .sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  const wrap = $('#expList');
  wrap.innerHTML = '';
  if (!all.length) { wrap.innerHTML = `<div class="empty">${q ? 'Nessun movimento trovato.' : 'Nessuna spesa registrata.'}</div>`; return; }
  let curDay = null;
  const recent = all.slice(0, 300);
  const dayTotals = {}; // netto del giorno: entrate − uscite
  recent.forEach(e => { dayTotals[e.date] = (dayTotals[e.date] || 0) + (isIncome(e) ? e.amount : -e.amount); });
  recent.forEach(e => {
    if (e.date !== curDay) {
      curDay = e.date;
      const h = document.createElement('div');
      h.className = 'day-header';
      const d = new Date(e.date + 'T12:00');
      const net = dayTotals[e.date];
      h.innerHTML = `<span>${d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long' })}</span><span>${net > 0 ? '+' : ''}${fmt(net)}</span>`;
      wrap.appendChild(h);
    }
    const income = isIncome(e);
    const c = income ? incomeCatById(e.cat) : catById(e.cat);
    const item = document.createElement('div');
    item.className = 'exp-item' + (income ? ' income' : '');
    item.innerHTML = `<span class="ico">${c.icon}</span>
      <div class="info"><div class="cat">${esc(e.sub)}</div><div class="note">${esc(c.name)}${e.note ? ' · ' + esc(e.note) : ''}</div></div>
      <span class="amt">${income ? '+' : ''}${fmt(e.amount)}</span>`;
    item.addEventListener('click', () => startEdit(e)); // tap = modifica (elimina dentro il form)
    wrap.appendChild(item);
  });
}

/* ---------- Statistiche ---------- */
let periodOffset = 0;       // 0 = periodo corrente, -1 = precedente...
let statFilter = new Set(); // macro categorie selezionate (vuoto = tutte)
let drillCat = null;        // se valorizzato mostra le sottocategorie

$('#periodType').addEventListener('change', () => { periodOffset = 0; drillCat = null; renderStats(); });
$('#prevPeriod').addEventListener('click', () => { periodOffset--; renderStats(); });
$('#nextPeriod').addEventListener('click', () => { if (periodOffset < 0) { periodOffset++; renderStats(); } });

// Restituisce {from, to, label, prev:{from,to,label}, yoy:{from,to,label}|null}
function periodRange(type, offset) {
  const now = new Date();
  const mk = (from, to, label) => ({ from: dstr(from), to: dstr(to), label });
  if (type === 'day') {
    const d = new Date(now); d.setDate(d.getDate() + offset);
    const p = new Date(d); p.setDate(p.getDate() - 1);
    return { ...mk(d, d, d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })),
      prev: mk(p, p, 'giorno precedente'), yoy: null };
  }
  if (type === 'week') {
    const d = new Date(now);
    const dow = (d.getDay() + 6) % 7; // lunedì = 0
    d.setDate(d.getDate() - dow + offset * 7);
    const end = new Date(d); end.setDate(end.getDate() + 6);
    const p = new Date(d); p.setDate(p.getDate() - 7);
    const pEnd = new Date(p); pEnd.setDate(pEnd.getDate() + 6);
    return { ...mk(d, end, `${d.getDate()}/${d.getMonth() + 1} – ${end.getDate()}/${end.getMonth() + 1}/${end.getFullYear()}`),
      prev: mk(p, pEnd, 'settimana precedente'), yoy: null };
  }
  if (type === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const pEnd = new Date(p.getFullYear(), p.getMonth() + 1, 0);
    const y = new Date(d.getFullYear() - 1, d.getMonth(), 1);
    const yEnd = new Date(y.getFullYear(), y.getMonth() + 1, 0);
    return { ...mk(d, end, d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })),
      prev: mk(p, pEnd, 'mese precedente'),
      yoy: mk(y, yEnd, `${y.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}`) };
  }
  // year
  const yr = now.getFullYear() + offset;
  return { from: `${yr}-01-01`, to: `${yr}-12-31`, label: String(yr),
    prev: { from: `${yr - 1}-01-01`, to: `${yr - 1}-12-31`, label: 'anno precedente' }, yoy: null };
}

const applyFilter = list => statFilter.size ? list.filter(e => statFilter.has(e.cat)) : list;
const sum = list => list.reduce((a, e) => a + e.amount, 0);

function comparePhrase(cur, ref, label) {
  if (ref === 0) return null;
  const delta = ((cur - ref) / ref) * 100;
  const cls = delta > 0 ? 'up' : 'down';
  const sign = delta > 0 ? '+' : '';
  return `<span class="${cls}">${sign}${delta.toFixed(0)}%</span> vs ${label} (${fmt(ref)})`;
}

async function renderStats() {
  const type = $('#periodType').value;
  const r = periodRange(type, periodOffset);
  $('#periodLabel').textContent = r.label;
  $('#nextPeriod').disabled = periodOffset >= 0;

  const all = await DB.expensesBetween(r.from, r.to);
  const cur = applyFilter(all.filter(e => !isIncome(e)));      // uscite (filtrate per categoria)
  const income = all.filter(isIncome);                          // entrate del periodo
  const prevAll = await DB.expensesBetween(r.prev.from, r.prev.to);
  const prev = applyFilter(prevAll.filter(e => !isIncome(e)));
  $('#statTotal').textContent = fmt(sum(cur));

  const parts = [];
  const p1 = comparePhrase(sum(cur), sum(prev), r.prev.label);
  if (p1) parts.push(p1);
  if (r.yoy) {
    const yoyAll = await DB.expensesBetween(r.yoy.from, r.yoy.to);
    const p2 = comparePhrase(sum(cur), sum(yoyAll.filter(e => !isIncome(e))), r.yoy.label);
    if (p2) parts.push(p2);
  }
  $('#statCompare').innerHTML = parts.join('<br>') || 'Nessun dato di confronto';

  // Confronto entrate/uscite del periodo (uscite totali, non filtrate)
  const totExp = sum(all.filter(e => !isIncome(e)));
  const totInc = sum(income);
  const balance = totInc - totExp;
  if (totInc || totExp) {
    $('#statBalance').innerHTML = `
      <div><span class="lbl">Entrate</span><b class="pos">+${fmt(totInc)}</b></div>
      <div><span class="lbl">Uscite</span><b class="neg">−${fmt(totExp)}</b></div>
      <div><span class="lbl">Saldo</span><b class="${balance >= 0 ? 'pos' : 'neg'}">${balance >= 0 ? '+' : ''}${fmt(balance)}</b></div>`;
  } else {
    $('#statBalance').innerHTML = '';
  }

  renderFilterChips();
  renderCatBars(cur);
  renderTrend(type, r, cur);
}

function renderFilterChips() {
  const wrap = $('#filterChips');
  wrap.innerHTML = '';
  CATEGORIES.forEach(c => {
    const b = document.createElement('button');
    b.className = 'chip' + (statFilter.has(c.id) ? ' selected' : '');
    b.textContent = `${c.icon} ${c.name}`;
    b.onclick = () => {
      statFilter.has(c.id) ? statFilter.delete(c.id) : statFilter.add(c.id);
      drillCat = null;
      renderStats();
    };
    wrap.appendChild(b);
  });
}

function renderCatBars(list) {
  const wrap = $('#catBars');
  wrap.innerHTML = '';
  const total = sum(list);
  if (!total) { wrap.innerHTML = '<div class="empty">Nessuna spesa nel periodo.</div>'; $('#breakdownTitle').textContent = 'Per categoria'; return; }

  let groups; // [{key, label, icon, color, amount}]
  if (drillCat) {
    const c = catById(drillCat);
    $('#breakdownTitle').innerHTML = `${c.icon} ${c.name} — sottocategorie <button class="btn-danger-link" id="drillBack">← indietro</button>`;
    const bySub = {};
    list.filter(e => e.cat === drillCat).forEach(e => { bySub[e.sub] = (bySub[e.sub] || 0) + e.amount; });
    groups = Object.entries(bySub).map(([s, a]) => ({ key: s, label: s, icon: '', color: c.color, amount: a }));
  } else {
    $('#breakdownTitle').textContent = 'Per categoria (tocca per dettaglio)';
    const byCat = {};
    list.forEach(e => { byCat[e.cat] = (byCat[e.cat] || 0) + e.amount; });
    groups = Object.entries(byCat).map(([id, a]) => {
      const c = catById(id);
      return { key: id, label: c.name, icon: c.icon, color: c.color, amount: a };
    });
  }
  groups.sort((a, b) => b.amount - a.amount);
  const max = groups[0].amount;
  groups.forEach(g => {
    const row = document.createElement('div');
    row.className = 'hbar-row';
    row.innerHTML = `<span class="lbl">${g.icon} ${esc(g.label)}</span>
      <div class="track"><div class="fill" style="width:${(g.amount / max) * 100}%;background:${g.color}"></div></div>
      <span class="val">${fmt(g.amount)}</span>`;
    if (!drillCat) row.onclick = () => { drillCat = g.key; renderStats(); };
    wrap.appendChild(row);
  });
  const back = $('#drillBack');
  if (back) back.onclick = () => { drillCat = null; renderStats(); };
}

// Andamento: barre dei sotto-periodi (giorni del mese/settimana, mesi dell'anno, ore no → giorni)
function renderTrend(type, r, list) {
  const wrap = $('#trendChart');
  wrap.innerHTML = '';
  const buckets = []; // {label, from, to}
  const from = new Date(r.from + 'T12:00'), to = new Date(r.to + 'T12:00');
  if (type === 'year') {
    for (let m = 0; m < 12; m++) {
      const s = new Date(from.getFullYear(), m, 1), e = new Date(from.getFullYear(), m + 1, 0);
      buckets.push({ label: s.toLocaleDateString('it-IT', { month: 'narrow' }), from: dstr(s), to: dstr(e) });
    }
  } else if (type === 'day') {
    // per il singolo giorno mostra gli ultimi 14 giorni come contesto
    for (let i = 13; i >= 0; i--) {
      const d = new Date(to); d.setDate(d.getDate() - i);
      buckets.push({ label: String(d.getDate()), from: dstr(d), to: dstr(d) });
    }
  } else {
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      buckets.push({ label: String(d.getDate()), from: dstr(d), to: dstr(d) });
    }
  }
  const totals = buckets.map(b => sum(list.filter(e => e.date >= b.from && e.date <= b.to)));
  // per la vista "giorno" il contesto esce dal periodo: ricarico non filtrato per data del periodo
  const max = Math.max(...totals, 1);
  buckets.forEach((b, i) => {
    const tb = document.createElement('div');
    tb.className = 'tb';
    tb.title = `${b.label}: ${fmt(totals[i])}`;
    tb.innerHTML = `<div class="bar" style="height:${(totals[i] / max) * 100}%"></div><div class="tl">${b.label}</div>`;
    wrap.appendChild(tb);
  });
}

/* ---------- Budget ---------- */
async function renderBudget() {
  const now = new Date();
  const monthLabel = now.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const first = dstr(new Date(now.getFullYear(), now.getMonth(), 1));
  const last = dstr(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const [budgets, expenses] = await Promise.all([DB.allBudgets(), DB.expensesBetween(first, last)]);
  const spentBy = {};
  expenses.filter(e => !isIncome(e)).forEach(e => { spentBy[e.cat] = (spentBy[e.cat] || 0) + e.amount; });

  const summary = $('#budgetSummary');
  if (!budgets.length) {
    summary.innerHTML = '';
  } else {
    const totalBudget = budgets.reduce((a, b) => a + b.amount, 0);
    const totalSpent = budgets.reduce((a, b) => a + (spentBy[b.cat] || 0), 0);
    const pct = totalBudget ? (totalSpent / totalBudget) * 100 : 0;
    summary.innerHTML = `<div class="head"><span>Speso su budget — ${monthLabel}</span><span class="pct">${pct.toFixed(0)}%</span></div>
      <div class="amt">${fmt(totalSpent)} <span class="of">/ ${fmt(totalBudget)}</span></div>
      <div class="track"><div class="fill" style="width:${Math.min(pct, 100)}%"></div></div>`;
  }

  const prog = $('#budgetProgress');
  prog.innerHTML = '';
  if (!budgets.length) prog.innerHTML = '<div class="empty">Nessun budget impostato. Usa il pannello qui sotto.</div>';
  budgets.forEach(b => {
    const c = catById(b.cat);
    const spent = spentBy[b.cat] || 0;
    const pct = (spent / b.amount) * 100;
    const row = document.createElement('div');
    row.className = 'budget-row' + (pct >= 100 ? ' over' : pct >= 80 ? ' warn' : '');
    const status = pct >= 100 ? `⚠️ sforato di ${fmt(spent - b.amount)}` : `restano ${fmt(b.amount - spent)}`;
    row.innerHTML = `<div class="head"><span>${c.icon} ${c.name}</span><span class="sp">${fmt(spent)} / ${fmt(b.amount)}</span></div>
      <div class="track"><div class="fill" style="width:${Math.min(pct, 100)}%"></div></div>
      <div class="sub">${pct.toFixed(0)}% — ${status}</div>`;
    prog.appendChild(row);
  });

  const editor = $('#budgetEditor');
  editor.innerHTML = '';
  CATEGORIES.forEach(c => {
    const cur = budgets.find(b => b.cat === c.id);
    const row = document.createElement('div');
    row.className = 'budget-edit';
    row.innerHTML = `<span class="name">${c.icon} ${c.name}</span>
      <input type="number" inputmode="decimal" min="0" step="1" placeholder="€ / mese" value="${cur ? cur.amount : ''}">`;
    row.querySelector('input').addEventListener('change', async ev => {
      await DB.setBudget(c.id, parseFloat(ev.target.value) || 0);
      renderBudget();
      toast('Budget aggiornato');
    });
    editor.appendChild(row);
  });
}

/* ---------- Movimenti ricorrenti (uscite ed entrate) ---------- */
function fillRecSelectors() {
  const ts = $('#recType'), cs = $('#recCat'), ss = $('#recSub');
  const sync = () => {
    const income = ts.value === 'income';
    const list = income ? INCOME_CATEGORIES : CATEGORIES;
    cs.innerHTML = list.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
    ss.style.display = income ? 'none' : '';
    if (!income) ss.innerHTML = catById(cs.value).subs.map(s => `<option>${s}</option>`).join('');
  };
  ts.addEventListener('change', sync);
  cs.addEventListener('change', () => {
    if (ts.value === 'expense') $('#recSub').innerHTML = catById(cs.value).subs.map(s => `<option>${s}</option>`).join('');
  });
  sync();
}

$('#recAddBtn').addEventListener('click', async () => {
  const name = $('#recName').value.trim();
  const amount = parseFloat($('#recAmount').value);
  const start = $('#recStart').value;
  const income = $('#recType').value === 'income';
  if (!name || !(amount > 0) || !start) { toast('Compila nome, importo e prima scadenza'); return; }
  await DB.addRecurring({
    name, amount: Math.round(amount * 100) / 100,
    type: income ? 'income' : 'expense',
    cat: $('#recCat').value,
    sub: income ? incomeCatById($('#recCat').value).name : $('#recSub').value,
    freq: $('#recFreq').value,
    nextDue: start,
  });
  $('#recName').value = ''; $('#recAmount').value = '';
  await applyRecurring();
  renderRecurring();
  toast('Ricorrente aggiunta');
});

async function renderRecurring() {
  const list = await DB.allRecurring();
  const wrap = $('#recList');
  wrap.innerHTML = list.length ? '' : '<div class="empty">Nessuna spesa ricorrente.</div>';
  list.forEach(r => {
    const income = isIncome(r);
    const c = income ? incomeCatById(r.cat) : catById(r.cat);
    const item = document.createElement('div');
    item.className = 'rec-item' + (income ? ' income' : '');
    item.innerHTML = `<span class="ico">${c.icon}</span>
      <div class="info">${esc(r.name)}
        <small>${r.freq === 'monthly' ? 'Mensile' : 'Annuale'} · ${esc(r.sub)} · prossima ${new Date(r.nextDue + 'T12:00').toLocaleDateString('it-IT')}</small>
      </div>
      <div class="rec-end">
        <span class="amt">${income ? '+' : '−'}${fmt(r.amount).replace('€', '').trim()} €</span>
        <button class="btn-danger-link">Elimina</button>
      </div>`;
    item.querySelector('button').onclick = async () => {
      await DB.deleteRecurring(r.id);
      renderRecurring();
    };
    wrap.appendChild(item);
  });
}

// All'avvio inserisce automaticamente le occorrenze scadute (recupera anche più periodi arretrati).
async function applyRecurring() {
  const list = await DB.allRecurring();
  const today = todayStr();
  let inserted = 0;
  for (const r of list) {
    let due = r.nextDue;
    let guard = 0;
    while (due <= today && guard++ < 240) {
      await DB.addExpense({ date: due, amount: r.amount, type: r.type || 'expense', cat: r.cat, sub: r.sub, note: `Ricorrente: ${r.name}`, ts: Date.now() });
      inserted++;
      const d = new Date(due + 'T12:00');
      if (r.freq === 'monthly') {
        // mantiene il giorno del mese, con clamp a fine mese (es. 31 → 30 aprile)
        const day = new Date(r.nextDue + 'T12:00').getDate();
        const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        n.setDate(Math.min(day, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()));
        due = dstr(n);
      } else {
        due = dstr(new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()));
      }
    }
    if (due !== r.nextDue) await DB.putRecurring({ ...r, nextDue: due });
  }
  if (inserted) toast(`${inserted} movimenti ricorrenti inseriti`);
}

/* ---------- Export / Import ---------- */
async function exportData(format) {
  const [expenses, budgets, recurring] = await Promise.all([DB.allExpenses(), DB.allBudgets(), DB.allRecurring()]);
  let blob, filename;
  if (format === 'json') {
    blob = new Blob([JSON.stringify({ version: 1, exported: new Date().toISOString(), expenses, budgets, recurring }, null, 2)], { type: 'application/json' });
    filename = `spese-backup-${todayStr()}.json`;
    await DB.setMeta('lastExportAt', new Date().toISOString()); // per il promemoria backup
  } else {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['data', 'tipo', 'importo', 'categoria', 'sottocategoria', 'nota']];
    expenses.sort((a, b) => a.date.localeCompare(b.date))
      .forEach(e => rows.push([e.date, isIncome(e) ? 'entrata' : 'uscita', String(e.amount).replace('.', ','),
        (isIncome(e) ? incomeCatById(e.cat) : catById(e.cat)).name, e.sub, e.note]));
    blob = new Blob(['﻿' + rows.map(r => r.map(esc).join(';')).join('\r\n')], { type: 'text/csv' });
    filename = `spese-${todayStr()}.csv`;
  }
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { /* annullato: fallback */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
$('#exportJsonBtn').addEventListener('click', () => exportData('json'));
$('#exportCsvBtn').addEventListener('click', () => exportData('csv'));

// Validazione/sanificazione dei record importati: si accettano solo campi
// attesi con i tipi corretti. Le stringhe vengono limitate in lunghezza per
// evitare payload abnormi; i record non validi vengono scartati.
const isDateStr = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const cleanStr = (s, max = 200) => (typeof s === 'string' ? s : '').slice(0, max);
const cleanAmount = a => {
  const n = typeof a === 'number' ? a : parseFloat(a);
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};
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
    cat: cleanStr(r.cat, 40), sub: cleanStr(r.sub, 60),
    freq: r.freq === 'yearly' ? 'yearly' : 'monthly', nextDue: r.nextDue };
}

$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async ev => {
  const f = ev.target.files[0];
  if (!f) return;
  try {
    if (f.size > 20 * 1024 * 1024) throw new Error('file troppo grande');
    const data = JSON.parse(await f.text());
    if (!data || !Array.isArray(data.expenses)) throw new Error('formato non valido');
    let ok = 0, skipped = 0;
    for (const raw of data.expenses) {
      const e = sanitizeExpense(raw);
      if (e) { await DB.addExpense(e); ok++; } else skipped++;
    }
    for (const b of Array.isArray(data.budgets) ? data.budgets : []) {
      const amount = cleanAmount(b && b.amount);
      const cat = cleanStr(b && b.cat, 40);
      if (cat && amount) await DB.setBudget(cat, amount);
    }
    for (const raw of Array.isArray(data.recurring) ? data.recurring : []) {
      const r = sanitizeRecurring(raw);
      if (r) await DB.addRecurring(r);
    }
    toast(`Importate ${ok} spese${skipped ? ` (${skipped} scartate)` : ''}`);
  } catch (err) {
    toast('Import fallito: ' + err.message);
  }
  ev.target.value = '';
});

$('#wipeBtn').addEventListener('click', async () => {
  if (confirm('Cancellare TUTTI i dati? Operazione irreversibile.') && confirm('Sei davvero sicuro?')) {
    await DB.clearAll();
    toast('Dati cancellati');
    renderRecurring();
  }
});

/* ---------- Backup Google Drive ---------- */
async function renderDrive() {
  const status = $('#driveStatus');
  const connectBtn = $('#driveConnectBtn');
  const backupBtn = $('#driveBackupBtn');
  const autoRow = $('#driveAutoRow');
  const autoToggle = $('#driveAutoToggle');
  const idRow = $('#driveClientIdRow');
  const clearIdBtn = $('#driveClearIdBtn');

  await Drive.loadConfig();

  if (!Drive.isConfigured()) {
    status.innerHTML = '🔑 <b>Inserisci il Client ID</b> per attivare il backup su Drive.<br><span class="muted">Lo trovi in Google Cloud → Credenziali. Resta salvato solo su questo dispositivo.</span>';
    idRow.style.display = '';
    connectBtn.style.display = 'none'; backupBtn.style.display = 'none';
    autoRow.style.display = 'none'; clearIdBtn.style.display = 'none';
    return;
  }
  idRow.style.display = 'none';
  connectBtn.style.display = ''; backupBtn.style.display = '';
  autoRow.style.display = ''; clearIdBtn.style.display = '';
  const [granted, last, auto] = await Promise.all([
    Drive.isGranted(), DB.getMeta('lastBackupAt'), DB.getMeta('autoBackup'),
  ]);
  autoToggle.checked = auto !== false;
  const lastTxt = last ? new Date(last).toLocaleString('it-IT') : 'mai';
  const overdue = await backupIsOverdue();
  status.innerHTML = `${granted ? '✅ <b>Collegato a Drive</b>' : '⚪ Non collegato'}<br><span class="muted">Ultimo backup: ${esc(lastTxt)}</span>`
    + (overdue ? '<br><span class="warn-text">⚠️ Nessun backup da oltre 30 giorni</span>' : '');
  connectBtn.textContent = granted ? 'Disconnetti' : 'Connetti Google Drive';
  backupBtn.disabled = false;
}

$('#driveClientIdSave').addEventListener('click', async () => {
  try {
    await Drive.setClientId($('#driveClientIdInput').value);
    $('#driveClientIdInput').value = '';
    toast('Client ID salvato');
  } catch (e) {
    toast(e.message);
  }
  renderDrive();
});

$('#driveClearIdBtn').addEventListener('click', async () => {
  if (!confirm('Rimuovere il Client ID da questo dispositivo? Il backup Drive verrà disattivato.')) return;
  await Drive.disconnect();
  await Drive.setClientId('');
  toast('Client ID rimosso');
  renderDrive();
});

$('#driveConnectBtn').addEventListener('click', async () => {
  const granted = await Drive.isGranted();
  if (granted) {
    await Drive.disconnect();
    toast('Drive disconnesso');
  } else {
    const ok = await Drive.connect();
    toast(ok ? 'Google Drive collegato' : 'Collegamento annullato');
  }
  renderDrive();
});

$('#driveBackupBtn').addEventListener('click', async () => {
  toast('Backup in corso…');
  try {
    const r = await Drive.backupNow(true);
    if (r.ok) toast(`Backup salvato su Drive: ${r.filename}`);
    else if (r.reason === 'not-configured') toast('Drive non configurato');
    else toast('Backup non riuscito: accesso negato');
  } catch (e) {
    toast('Backup fallito: ' + e.message);
  }
  renderDrive();
});

$('#driveAutoToggle').addEventListener('change', async ev => {
  await DB.setMeta('autoBackup', ev.target.checked);
  toast(ev.target.checked ? 'Backup automatico attivo' : 'Backup automatico disattivato');
});

/* ---------- Migrazione dati (una tantum, versionata) ---------- */
// v2: rimappa i movimenti esistenti sul nuovo schema categorie:
//  - svago/Abbonamenti            → abbonamenti/Altro
//  - casa/Bollette da 9,99 €      → abbonamenti/Streaming
//  - casa/Bollette da 26,95 €     → abbonamenti/Telefonia e internet
//  - altro/Varie nota "Elettronica…" → svago/Elettronica
//  - altro/Varie nota "Tintoria"  → abbigliamento/Tintoria
async function migrateData() {
  const CURRENT = 2;
  const done = (await DB.getMeta('schemaVersion')) || 1;
  if (done >= CURRENT) return;
  const remap = e => {
    if (e.cat === 'svago' && e.sub === 'Abbonamenti') return { cat: 'abbonamenti', sub: 'Altro' };
    if (e.cat === 'casa' && e.sub === 'Bollette' && e.amount === 9.99) return { cat: 'abbonamenti', sub: 'Streaming' };
    if (e.cat === 'casa' && e.sub === 'Bollette' && e.amount === 26.95) return { cat: 'abbonamenti', sub: 'Telefonia e internet' };
    if (e.cat === 'altro' && /elettronica/i.test(e.note || '')) return { cat: 'svago', sub: 'Elettronica' };
    if (e.cat === 'altro' && /tintoria/i.test(e.note || '')) return { cat: 'abbigliamento', sub: 'Tintoria' };
    return null;
  };
  let n = 0;
  for (const e of await DB.allExpenses()) {
    const m = remap(e);
    if (m) { await DB.putExpense({ ...e, ...m }); n++; }
  }
  for (const r of await DB.allRecurring()) {
    const m = remap(r);
    if (m) { await DB.putRecurring({ ...r, ...m }); n++; }
  }
  await DB.setMeta('schemaVersion', CURRENT);
  if (n) toast(`Categorie aggiornate: ${n} movimenti rimappati`);
}

/* ---------- Promemoria backup ---------- */
// Ultimo salvataggio = più recente tra export JSON e backup su Drive.
async function lastBackupTime() {
  const [exp, drv] = await Promise.all([DB.getMeta('lastExportAt'), DB.getMeta('lastBackupAt')]);
  const t = [exp, drv].filter(Boolean).map(s => new Date(s).getTime());
  return t.length ? Math.max(...t) : null;
}
async function backupIsOverdue() {
  const n = (await DB.allExpenses()).length;
  if (!n) return false; // niente dati, niente da proteggere
  const last = await lastBackupTime();
  return !last || (Date.now() - last) > 30 * 864e5; // mai, oppure > 30 giorni
}
// Promemoria non invadente: al massimo una volta al giorno.
async function maybeBackupReminder() {
  if (!(await backupIsOverdue())) return;
  const today = todayStr();
  if ((await DB.getMeta('lastBackupReminder')) === today) return;
  await DB.setMeta('lastBackupReminder', today);
  toast('⚠️ Nessun backup da oltre 30 giorni — vai in Altro per salvarlo');
}

/* ---------- Avvio ---------- */
(async function init() {
  $('#dateInput').value = todayStr();
  $('#recStart').value = todayStr();
  renderCatGrid();
  fillRecSelectors();
  await migrateData();
  await applyRecurring();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  Drive.maybeAutoBackup(); // backup mensile "all'apertura" (silenzioso se già collegato)
  setTimeout(maybeBackupReminder, 4000); // dopo l'eventuale toast delle ricorrenti
})();
