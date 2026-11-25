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

/* ---------- Popup "affanno" al salvataggio ----------
 * Spesa oltre 30 € → uno dei 3 messaggi a caso (mai lo stesso due volte di fila);
 * entrata → GODIMENT. Testi fissi: solo categoria/sottocategoria passano da esc().
 */
const CEL_FONTS = [["'Anton'", 0.5], ["'Bungee'", 0.8], ["'Permanent Marker'", 0.62],
  ["'Bowlby One SC'", 0.8], ["'Rubik Mono One'", 0.95], ["'Monoton'", 0.95]];
// Font-size che fa stare la parola nella card (cw = larghezza media di un carattere in em).
const celWord = (w, [font, cw], base) =>
  `<span style="font-family:${font},sans-serif;font-size:${Math.floor(Math.min(base, 270 / (w.length * cw)))}px">${w}</span>`;
const CEL_MESSAGES = {
  affanno: () => `<span class="f-anton" style="font-size:44px">CHE</span><span class="f-anton pant" style="font-size:58px">AFFANNO</span>`,
  costantemente: () => `<span class="f-anton" style="font-size:42px">COSTANTEMENTE</span>` +
    `<span class="f-marker" style="font-size:40px">in</span><span class="f-bungee" style="font-size:46px">AFFANNO</span>`,
  imballato: () => {
    const n = CEL_FONTS.length, a = Math.floor(Math.random() * n);
    const b = (a + 1 + Math.floor(Math.random() * (n - 1))) % n; // diverso da a
    return celWord('CHE', CEL_FONTS[a], 56) + celWord('IMBALLATO', CEL_FONTS[b], 64);
  },
  godiment: () => `<span class="f-anton" style="font-size:40px">SEI NEL</span><span class="f-anton glow" style="font-size:66px">GODIMENT</span>`,
};
function celebrate(kind, rec) {
  const el = $('#celebrate');
  const income = kind === 'godiment';
  const extra = !income && typeof Split !== 'undefined' ? Split.note(rec) : '';
  const where = (income ? incomeCatById(rec.cat).name : `${catById(rec.cat).name} · ${rec.sub}`) + (extra ? ` · ${extra}` : '');
  el.innerHTML = `<div class="cel-card ${kind}" role="alertdialog" aria-label="${income ? 'Entrata' : 'Spesa'} salvata">
    <div class="cel-head"><span>${income ? 'ENTRATA' : 'SPESA'} SALVATA</span><span class="cel-amount">${fmt(rec.amount)}</span></div>
    <div class="cel-msg">${CEL_MESSAGES[kind]()}</div>
    <div class="cel-foot"><span>${esc(where)}</span><button type="button" class="cel-ok">OK</button></div>
  </div>`;
  el.classList.add('show');
  const close = () => { el.classList.remove('show'); clearTimeout(celebrate._t); };
  el.onclick = ev => { if (ev.target === el || ev.target.closest('.cel-ok')) close(); };
  clearTimeout(celebrate._t);
  celebrate._t = setTimeout(close, 4000);
}
function pickAffanno() {
  const opts = ['affanno', 'costantemente', 'imballato'].filter(k => k !== pickAffanno._last);
  return (pickAffanno._last = opts[Math.floor(Math.random() * opts.length)]);
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
  const view = $(`#view-${name}`);
  // Le pagine di Altro (budget, ricorrenti, Drive, dati) tengono attiva la tab Altro.
  const tab = view.dataset.parent || name;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === tab));
  view.classList.add('active');
  const scroller = document.querySelector('.app-scroll');
  if (scroller) scroller.scrollTop = 0;
  if (name === 'list') { listLimit = LIST_PAGE; renderList(); }
  if (name === 'stats') renderStats();
  if (name === 'budget') renderBudget();
  if (name === 'recurring') renderRecurring();
  if (name === 'drive') renderDrive();
  if (name === 'settings') renderMoreMenu();
  if (name === 'data') renderSnapshots();
  if (name === 'share' && typeof PeopleUI !== 'undefined') { PeopleUI.renderList(); EventsUI.renderList(); }
}

/* ---------- Altro: menu di voci (RF-N3) ---------- */
document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => showView(b.dataset.open)));
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => showView(b.dataset.back)));

// Sottotitoli del menu con lo stato attuale di ogni voce.
async function renderMoreMenu() {
  const [budgets, rec, goal, last, granted] = await Promise.all([
    DB.allBudgets(), DB.allRecurring(), DB.getMeta('savingsGoal'), lastBackupTime(), Drive.isGranted()]);
  const parts = [];
  if (budgets.length) parts.push(`${budgets.length} budget ${budgets.length === 1 ? 'mensile' : 'mensili'}`);
  if (goal && goal.amount) parts.push(`obiettivo ${goal.label || 'di risparmio'}`);
  $('#menuBudgetSub').textContent = parts.join(' · ') || 'budget mensili e obiettivo di risparmio';
  $('#menuRecSub').textContent = rec.length ? `${rec.length} ${rec.length === 1 ? 'attiva' : 'attive'}` : 'nessuna: mensili e annuali, inserite in automatico';
  const lastTxt = last ? `ultimo backup ${new Date(last).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'nessun backup ancora';
  $('#menuDriveSub').textContent = granted ? lastTxt : `non collegato · ${lastTxt}`;
}

/* ---------- Condivise: Persone | Eventi (contenuto in F3–F5) ---------- */
document.querySelectorAll('#shareSeg button').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('#shareSeg button').forEach(b => {
    const on = b === btn;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  document.querySelectorAll('.share-pane').forEach(p => { p.hidden = p.dataset.pane !== btn.dataset.pane; });
}));

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
    Split.reset(); // RC-9: niente split né evento sulle entrate
    EventsUI.reset(); // tornando alle uscite: evento e partecipanti di nuovo
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
  if (typeof Split !== 'undefined') Split.reset();
  if (typeof EventsUI !== 'undefined') EventsUI.reset(); // evento scelto in questa sessione o in corso oggi
}

// Apre il movimento in modifica nella schermata Aggiungi.
function startEdit(e) {
  editingId = e.id;
  setType(isIncome(e) ? 'income' : 'expense');
  selCat = e.cat;
  selSub = isIncome(e) ? null : e.sub;
  $('#noteInput').value = e.note || '';
  $('#dateInput').value = e.date;
  showView('add');
  // Con uno split l'importo del wizard è il pagato; con un altro pagatore è la mia quota (RF-W11).
  $('#amountInput').value = String(Split.load(e)).replace('.', ',');
  EventsUI.load(e);
  refreshAddTitles();
  renderCatGrid(); renderSubList(); updateSaveState();
}

/* Al tap la griglia collassa nella barra della categoria scelta (620 ms in tre
   battute) e poi entrano le sottocategorie; MODIFICA riapre la griglia.
   `catPhase` è solo stato di presentazione: la selezione resta in selCat/selSub. */
const CAT_ROW_H = 52; // altezza della barra a categoria scelta
const GRID_PAD = 4;   // padding-bottom di .cat-grid: spazio per l'ombra piena delle tessere
let catPhase = 'grid'; // 'grid' | 'collapse' | 'row' | 'sub' | 'closing'
// Alzato da renderCatGrid e consumato dalla renderSubList che segue: la coppia
// `renderCatGrid(); renderSubList();` applica lo stato finale senza animazione.
let catStatic = false;
let catTimers = [];
const clearCatTimers = () => { catTimers.forEach(clearTimeout); catTimers = []; };
const catAfter = (ms, fn) => catTimers.push(setTimeout(fn, ms));
// Forza un ricalcolo sincrono: fissa il valore di partenza di una transizione.
// (requestAnimationFrame non basta: in una tab in background non viene chiamato.)
const reflow = el => el.offsetHeight;

const XMARK = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function renderCatGrid() {
  const grid = $('#catGrid');
  clearCatTimers();
  grid.innerHTML = '';
  const list = selType === 'income' ? INCOME_CATEGORIES : CATEGORIES;
  list.forEach(c => {
    const b = document.createElement('button');
    b.className = 'cat-btn' + (selCat === c.id ? ' selected' : '');
    // Nome e icona compaiono in entrambi i layer: uno solo va esposto all'accessibilità.
    b.setAttribute('aria-label', c.name);
    b.innerHTML =
      `<span class="cat-face" aria-hidden="true"><span class="ico">${c.icon}</span>${esc(c.name)}</span>` +
      `<span class="cat-bar"><span class="cat-bar-name" aria-hidden="true"><span class="ico">${c.icon}</span>${esc(c.name)}</span>` +
      `<span class="cat-edit" role="button" tabindex="0" aria-label="Cambia categoria">MODIFICA ${XMARK}</span></span>`;
    b.onclick = () => pickCat(c.id, b);
    const edit = b.querySelector('.cat-edit');
    edit.onclick = expandCatGrid;
    edit.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); expandCatGrid(ev); } };
    grid.appendChild(b);
  });
  // Ricostruzione (reset, modifica movimento, cambio tipo, avvio): stato finale
  // già applicato, senza transizioni — la sequenza parte solo dal tap.
  catPhase = selCat ? 'sub' : 'grid';
  catStatic = true;
  grid.classList.add('no-anim');
  grid.classList.remove('is-collapsing');
  grid.classList.toggle('is-collapsed', catPhase === 'sub');
  grid.style.height = catPhase === 'sub' ? CAT_ROW_H + GRID_PAD + 'px' : '';
  reflow(grid); // commit dello stato finale prima di riattivare le transizioni
  grid.classList.remove('no-anim');
}

function pickCat(id, btn) {
  if (catPhase !== 'grid') return; // tap ignorati durante la transizione
  selCat = id; selSub = null;
  const grid = $('#catGrid');
  grid.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('selected', b === btn));
  catPhase = 'collapse';
  // La tessera scelta scivola verso la prima cella: scarto misurato rispetto alla
  // griglia (offsetLeft/Top guarderebbero all'antenato posizionato, non a #catGrid).
  const gr = grid.getBoundingClientRect(), br = btn.getBoundingClientRect();
  btn.style.setProperty('--dx', Math.round(gr.left - br.left) + 'px');
  btn.style.setProperty('--dy', Math.round(gr.top - br.top) + 'px');
  grid.style.height = grid.offsetHeight + 'px'; // valore di partenza: `auto` non è animabile
  grid.classList.add('is-collapsing');
  reflow(grid);
  grid.style.height = CAT_ROW_H + GRID_PAD + 'px';
  catAfter(260, () => { catPhase = 'row'; grid.classList.add('is-collapsed'); });
  catAfter(400, () => { catPhase = 'sub'; setSubWrap(selType === 'expense'); });
  renderSubList(); // tessere pronte, ancora chiuse: entrano a 400 ms
  updateSaveState();
}

// Altezza della griglia aperta, misurata a transizioni spente e poi ripristinata:
// misurarla mentre l'animazione è in corso darebbe il valore a una sola colonna.
function catGridFullHeight(grid) {
  grid.classList.add('no-anim');
  const wasCollapsed = grid.classList.contains('is-collapsed'), prev = grid.style.height;
  grid.classList.remove('is-collapsed');
  grid.style.height = 'auto';
  const h = grid.offsetHeight;
  grid.style.height = prev;
  if (wasCollapsed) grid.classList.add('is-collapsed');
  reflow(grid); // stato collassato ripristinato; `no-anim` resta al chiamante
  return h;
}

function expandCatGrid(e) {
  if (e) e.stopPropagation();
  if (catPhase !== 'row' && catPhase !== 'sub') return;
  clearCatTimers();
  const grid = $('#catGrid'), sel = grid.querySelector('.cat-btn.selected');
  catPhase = 'closing';
  setSubWrap(false);
  const full = catGridFullHeight(grid); // lascia `no-anim` attivo
  grid.classList.remove('no-anim');
  reflow(grid); // commit con le transizioni riattivate, poi la griglia si riapre
  grid.classList.remove('is-collapsed');
  grid.style.height = full + 'px';
  catAfter(240, () => {
    selCat = null; selSub = null;
    grid.classList.remove('is-collapsing');
    if (sel) { sel.classList.remove('selected'); sel.style.removeProperty('--dx'); sel.style.removeProperty('--dy'); }
    grid.style.height = '';
    catPhase = 'grid';
    renderSubList();
    updateSaveState();
  });
}

// Apre/chiude il blocco SOTTOCATEGORIA animandone l'altezza (0 ↔ contenuto).
function setSubWrap(open, instant) {
  const w = $('#subWrap');
  if (instant) {
    w.classList.add('no-anim');
    w.classList.toggle('open', !!open);
    w.style.height = open ? 'auto' : '0px';
    reflow(w);
    w.classList.remove('no-anim');
    return;
  }
  const isOpen = w.classList.contains('open');
  if (open) {
    if (isOpen) { w.style.height = 'auto'; return; }
    w.classList.add('open');
    w.style.height = w.scrollHeight + 'px';
    // A fine transizione `auto`, così i nomi lunghi possono andare a capo senza tagli.
    catAfter(360, () => { w.style.height = 'auto'; });
  } else {
    if (!isOpen) { w.style.height = '0px'; return; }
    w.style.height = w.scrollHeight + 'px'; // da `auto` a px: serve un valore di partenza
    w.classList.remove('open');
    reflow(w);
    w.style.height = '0px';
  }
}

function renderSubList() {
  const wrap = $('#subList');
  wrap.innerHTML = '';
  const show = selCat && selType === 'expense'; // le entrate non hanno sottocategorie
  if (show) {
    catById(selCat).subs.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'sub-tile' + (selSub === s ? ' selected' : '');
      b.style.setProperty('--i', i); // entrata sfalsata di 35 ms
      b.textContent = s;
      b.onclick = () => { selSub = s; renderSubList(); updateSaveState(); };
      wrap.appendChild(b);
    });
  }
  const instant = catStatic; // consuma il flag alzato da renderCatGrid
  catStatic = false;
  setSubWrap(show && catPhase === 'sub', instant);
}
function parseAmount(str) {
  const v = parseFloat(String(str).replace(/[€\s]/g, '').replace(',', '.'));
  return isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
}
function updateSaveState() {
  const ok = parseAmount($('#amountInput').value) && selCat && (selType === 'income' || selSub) &&
    (typeof Split === 'undefined' || Split.isValid());
  $('#saveBtn').disabled = !ok;
}
$('#amountInput').addEventListener('input', updateSaveState);

$('#saveBtn').addEventListener('click', async () => {
  const income = selType === 'income';
  // Importo, pagato, pagatore e quote dal wizard (Ledger.planSplit). Senza split il
  // record è identico a prima: { date, amount, type, cat, sub, note, ts }.
  const plan = Split.plan();
  if (plan.error) { toast('Controlla la divisione della spesa'); return; }
  const { amount, ...shared } = plan.fields;
  const record = {
    date: $('#dateInput').value || todayStr(),
    amount,
    type: selType,
    cat: selCat,
    sub: income ? incomeCatById(selCat).name : selSub,
    note: $('#noteInput').value.trim(),
    ts: Date.now(),
    ...shared,
  };
  // Evento (solo uscite, RC-9)
  const eventId = income ? null : EventsUI.currentId();
  if (eventId) record.eventId = eventId;
  if (Ledger.validate(record).length) { toast('Spesa non coerente: controlla gli importi'); return; }
  buzz();
  const used = Split.usedPeople();
  if (editingId !== null) {
    // RF-S2: se un saldo cambia segno chiedo conferma mostrando prima e dopo.
    if (!(await Split.confirmBalanceChange(editingId, { ...record, id: editingId }))) return;
    await DB.putExpense({ ...record, id: editingId });
    await People.touch(used);
    toast('Movimento aggiornato');
    resetAddForm();
    showView('list');
    return;
  }
  await DB.addExpense(record);
  await People.touch(used);
  const extra = Split.note(record);
  if (income) celebrate('godiment', record);
  else if (amount > 30) celebrate(pickAffanno(), record);
  else toast(`Salvato: ${fmt(amount)} — ${selSub}${extra ? ` (${extra})` : ''}`);
  $('#amountInput').value = '';
  $('#noteInput').value = '';
  selSub = null;
  if (income) { selCat = null; renderCatGrid(); }
  renderSubList();
  Split.reset(); // RF-W9: senza evento split e pagatore si azzerano…
  EventsUI.afterSave(); // …con un evento restano evento, partecipanti e categoria predefinita
  updateSaveState();
});

$('#deleteBtn').addEventListener('click', async () => {
  if (editingId === null) return;
  if (confirm('Eliminare questo movimento?')) {
    if (!(await Split.confirmBalanceChange(editingId, null))) return; // RF-S2
    await DB.deleteExpense(editingId);
    toast('Movimento eliminato');
    resetAddForm();
    showView('list');
  }
});

/* ---------- Movimenti ---------- */
// La lista mostra i movimenti a pagine (i più recenti prima): "Mostra altri" ne aggiunge
// un'altra pagina. Nuova ricerca o nuova apertura di Movimenti ripartono dalla prima.
const LIST_PAGE = 300;
let listLimit = LIST_PAGE;
$('#searchInput').addEventListener('input', () => { listLimit = LIST_PAGE; renderList(); });

// Match semplice: sottocategoria, categoria, nota o importo contengono la query.
function matchesQuery(e, q, people = new Map(), events = new Map()) {
  if (!q) return true;
  const c = isIncome(e) ? incomeCatById(e.cat) : catById(e.cat);
  // includo l'importo sia "grezzo" (18,9) sia a 2 decimali (18,90) per cercare in entrambi i modi
  const amt = `${String(e.amount).replace('.', ',')} ${e.amount.toFixed(2).replace('.', ',')}`;
  const who = [e.payer, ...(e.splits || []).map(s => s.personId), ...(e.shareWith || [])].filter(Boolean).map(id => (people.get(id) || {}).name || '').join(' ');
  const ev = e.eventId ? (events.get(e.eventId) || {}).name || '' : '';
  const hay = `${e.sub} ${c.name} ${e.note || ''} ${amt} ${who} ${ev}`.toLowerCase();
  return hay.includes(q);
}

async function renderList() {
  const q = ($('#searchInput').value || '').trim().toLowerCase();
  const [people, evList] = await Promise.all([People.map(), DB.all('events')]);
  const events = new Map(evList.map(ev => [ev.id, ev]));
  const all = (await DB.allExpenses())
    .filter(e => matchesQuery(e, q, people, events))
    .sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  const wrap = $('#expList');
  wrap.innerHTML = '';
  if (!all.length) { wrap.innerHTML = `<div class="empty">${q ? 'Nessun movimento trovato.' : 'Nessuna spesa registrata.'}</div>`; return; }
  let curDay = null, dayCard = null;
  const recent = all.slice(0, listLimit);
  // Netto del giorno (entrate − uscite) su TUTTI i movimenti del giorno, anche quelli
  // della pagina successiva: prima, un giorno a cavallo del limite mostrava un totale parziale.
  const dayTotals = {};
  all.forEach(e => { dayTotals[e.date] = (dayTotals[e.date] || 0) + (isIncome(e) ? e.amount : -e.amount); });
  recent.forEach(e => {
    if (e.date !== curDay) {
      curDay = e.date;
      const h = document.createElement('div');
      h.className = 'day-header';
      const d = new Date(e.date + 'T12:00');
      const net = dayTotals[e.date];
      h.innerHTML = `<span>${d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long' })}</span><span>${net > 0 ? '+' : ''}${fmt(net)}</span>`;
      dayCard = document.createElement('div');
      dayCard.className = 'day-card';
      wrap.append(h, dayCard);
    }
    const income = isIncome(e);
    const c = income ? incomeCatById(e.cat) : catById(e.cat);
    const item = document.createElement('div');
    item.className = 'exp-item' + (income ? ' income' : '');
    // Spese condivise (RF-M1): importo = mia quota, sotto il pagato e i badge.
    // I movimenti normali restano identici a prima.
    const shared = !income && (e.payer || (e.splits && e.splits.length));
    const ev = !income && e.eventId ? events.get(e.eventId) : null;
    const tags = !shared && !ev ? '' : `<div class="meta">${ev ? `<span class="tag evt">${esc(ev.emoji)} ${esc(ev.name)}</span>` : ''}${!shared ? '' : e.payer
      ? `<span class="tag">pagato da ${esc((people.get(e.payer) || { name: 'Persona sconosciuta' }).name)}</span>`
      : `<span class="tag">${e.amount === 0 ? 'non partecipo · ' : ''}👥 ${e.splits.length}</span>`}</div>`;
    const amt = !shared ? `<span class="amt">${income ? '+' : ''}${fmt(e.amount)}</span>`
      : `<span class="amtcol"><span class="amt${e.amount === 0 ? ' zero' : ''}">${fmt(e.amount)}</span><small>${e.payer ? (e.payerTotal != null ? `su ${fmt(e.payerTotal)}` : 'dal conto 0,00 €') : `pagati ${fmt(e.paid)}`}</small></span>`;
    item.innerHTML = `<span class="ico">${c.icon}</span>
      <div class="info"><div class="cat">${esc(e.sub)}</div><div class="note">${esc(c.name)}${e.note ? ' · ' + esc(e.note) : ''}</div>${tags}</div>
      ${amt}`;
    item.addEventListener('click', () => startEdit(e)); // tap = modifica (elimina dentro il form)
    dayCard.appendChild(item);
  });
  if (all.length > recent.length) {
    const more = document.createElement('button');
    more.className = 'btn-secondary list-more';
    const left = all.length - recent.length;
    more.textContent = `Mostra altri ${Math.min(left, LIST_PAGE)} (${left} rimanenti)`;
    more.onclick = () => { listLimit += LIST_PAGE; renderList(); };
    wrap.appendChild(more);
  }
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
    // Tasso di risparmio: solo mese/anno (su periodi brevi le entrate sono lumpy → poco significativo)
    let savingsHtml = '';
    if ((type === 'month' || type === 'year') && totInc > 0) {
      const rate = (balance / totInc) * 100;
      savingsHtml = `<div><span class="lbl">Risparmio</span><b class="${rate >= 0 ? 'pos' : 'neg'}">${rate.toFixed(0)}%</b></div>`;
    }
    $('#statBalance').innerHTML = `
      <div><span class="lbl">Entrate</span><b class="pos">+${fmt(totInc)}</b></div>
      <div><span class="lbl">Uscite</span><b class="neg">−${fmt(totExp)}</b></div>
      <div><span class="lbl">Saldo</span><b class="${balance >= 0 ? 'pos' : 'neg'}">${balance >= 0 ? '+' : ''}${fmt(balance)}</b></div>
      ${savingsHtml}`;
  } else {
    $('#statBalance').innerHTML = '';
  }

  renderFilterChips();
  renderCatBars(cur);
  renderTrend(type, r, cur);
  renderCumulative();
  renderYearDashboard();
  renderInsights();
}

function renderFilterChips() {
  const wrap = $('#filterChips');
  wrap.innerHTML = '';
  CATEGORIES.forEach(c => {
    const b = document.createElement('button');
    b.className = 'chip' + (statFilter.has(c.id) ? ' selected' : '');
    b.textContent = c.name;
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
  // Dettaglio di una categoria senza spese nel periodo (ci si arriva cambiando
  // periodo con il dettaglio aperto): stato vuoto, "← indietro" resta attivo.
  if (!groups.length) wrap.innerHTML = `<div class="empty">Nessuna spesa in ${esc(catById(drillCat).name)} nel periodo.</div>`;
  const max = groups.length ? groups[0].amount : 0;
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
  // Con molte barre (mese) le etichette si accavallano: tengo 1, 5, 10, 15…
  const sparse = buckets.length > 14;
  buckets.forEach((b, i) => {
    const lbl = !sparse || i === 0 || (i + 1) % 5 === 0 ? b.label : '';
    const tb = document.createElement('div');
    tb.className = 'tb';
    tb.title = `${b.label}: ${fmt(totals[i])}`;
    tb.innerHTML = `<div class="bar${totals[i] ? '' : ' zero'}" style="height:${(totals[i] / max) * 100}%"></div><div class="tl">${lbl}&nbsp;</div>`;
    wrap.appendChild(tb);
  });
}

// Saldo cumulato: somma progressiva mensile di (entrate − uscite) su tutto lo storico.
async function renderCumulative() {
  const wrap = $('#cumulativeChart');
  const all = await DB.allExpenses();
  const byMonth = {}; // 'YYYY-MM' -> netto
  all.forEach(e => {
    const m = e.date.slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + (isIncome(e) ? e.amount : -e.amount);
  });
  const months = Object.keys(byMonth).sort();
  if (months.length < 2) { wrap.innerHTML = '<div class="empty">Servono almeno due mesi di dati.</div>'; return; }
  let run = 0;
  const pts = months.map(m => { run += byMonth[m]; return { m, v: run }; });

  const W = 300, H = 130, padL = 34, padR = 8, padT = 10, padB = 20;
  const vals = pts.map(p => p.v).concat(0);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = (max - min) || 1;
  const x = i => padL + (i / (pts.length - 1)) * (W - padL - padR);
  const y = v => padT + (1 - (v - min) / span) * (H - padT - padB);
  const zeroY = y(0);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${x(0).toFixed(1)},${zeroY.toFixed(1)} Z`;
  const last = pts[pts.length - 1].v;
  const lblIdx = [0, Math.floor((pts.length - 1) / 2), pts.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  const mlabel = m => new Date(m + '-01T12:00').toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
  const xlabels = lblIdx.map(i => `<text x="${x(i).toFixed(1)}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}" class="cum-x">${mlabel(pts[i].m)}</text>`).join('');

  // Asse Y: tick "arrotondati" con gridline orizzontali ed etichette in €.
  const kfmt = v => {
    const a = Math.abs(v);
    if (a >= 1000) return (v / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + 'k';
    return Math.round(v).toLocaleString('it-IT');
  };
  const niceTicks = (lo, hi, n = 4) => {
    const raw = (hi - lo) / n || 1;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const ticks = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-6; t += step) ticks.push(t);
    return ticks;
  };
  const yAxis = niceTicks(min, max).map(t => {
    const yy = y(t).toFixed(1);
    const isZero = Math.abs(t) < 1e-6;
    return `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" class="cum-grid${isZero ? ' zero' : ''}"/>
      <text x="${padL - 4}" y="${(y(t) + 2.5).toFixed(1)}" text-anchor="end" class="cum-y">${kfmt(t)}</text>`;
  }).join('');

  wrap.innerHTML = `
    <div class="cum-head">Oggi: <b class="${last >= 0 ? 'pos' : 'neg'}">${last >= 0 ? '+' : ''}${fmt(last)}</b></div>
    <svg viewBox="0 0 ${W} ${H}" class="cum-svg">
      ${yAxis}
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${(H - padB).toFixed(1)}" class="cum-axis"/>
      <path d="${area}" class="cum-area"/>
      <path d="${line}" class="cum-line"/>
      <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="3" class="cum-dot"/>
      ${xlabels}
    </svg>`;
}

/* ---------- Cruscotto annuale (in coda alle statistiche) ----------
 * Metriche YTD sull'anno corrente + tabelle Riepilogo mensile e Categoria×Mese.
 * Costi fissi = ricorrenti: casa (affitto/mutuo, bollette, condominio),
 * auto (finanziamento, assicurazione, bollo) e tutti gli abbonamenti.
 */
const FIXED_SUBS = {
  casa: ['Affitto / Mutuo', 'Bollette', 'Condominio'],
  auto: ['Finanziamento', 'Assicurazione', 'Bollo'],
};
const isFixed = e => !isIncome(e) && (e.cat === 'abbonamenti' || (FIXED_SUBS[e.cat] || []).includes(e.sub));
const EATOUT_SUBS = ['Ristorante', 'Bar e caffè', 'Take away'];
const fmt0 = n => Math.round(n).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const pctFmt = n => (n * 100).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const n0 = n => Math.round(n).toLocaleString('it-IT');                    // "3.052" (senza €)
const sgn0 = n => (n >= 0 ? '+' : '−') + Math.round(Math.abs(n)).toLocaleString('it-IT'); // "+23" / "−308"
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const MESI_ABBR = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

async function renderYearDashboard() {
  const now = new Date();
  const year = now.getFullYear();
  const curMonth = now.getMonth(); // 0-based; mesi < curMonth (stesso anno) = completi
  $('#dashYear').textContent = year;

  const all = (await DB.allExpenses()).filter(e => e.date.slice(0, 4) === String(year));
  const exp = all.filter(e => !isIncome(e));
  const inc = all.filter(isIncome);

  // Aggregati per mese (0..11)
  const M = Array.from({ length: 12 }, () => ({ inc: 0, exp: 0, fixed: 0, n: 0 }));
  all.forEach(e => {
    const m = +e.date.slice(5, 7) - 1;
    M[m].n++;
    if (isIncome(e)) M[m].inc += e.amount;
    else { M[m].exp += e.amount; if (isFixed(e)) M[m].fixed += e.amount; }
  });
  const isComplete = m => year < now.getFullYear() || m < curMonth;
  const completeMonths = M.map((_, m) => m).filter(m => isComplete(m) && (M[m].inc || M[m].exp));
  const nComplete = completeMonths.length || 1;

  const totInc = inc.reduce((a, e) => a + e.amount, 0);
  const totExp = exp.reduce((a, e) => a + e.amount, 0);
  const totFixed = exp.filter(isFixed).reduce((a, e) => a + e.amount, 0);
  const saldo = totInc - totExp;
  const savRate = totInc ? saldo / totInc : 0;

  // Medie sui mesi completi
  const sumComplete = sel => completeMonths.reduce((a, m) => a + sel(M[m]), 0);
  const incAvg = sumComplete(x => x.inc) / nComplete;
  const expAvg = sumComplete(x => x.exp) / nComplete;
  const fixedAvg = sumComplete(x => x.fixed) / nComplete;
  const saldoAvg = incAvg - expAvg;
  const perMov = exp.length ? totExp / exp.length : 0;

  // Totali per categoria (uscite)
  const byCat = {};
  exp.forEach(e => { byCat[e.cat] = (byCat[e.cat] || 0) + e.amount; });
  const catRank = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const top = catRank[0] || ['—', 0];
  const casaAuto = (byCat.casa || 0) + (byCat.auto || 0);
  const buoni = inc.filter(e => e.cat === 'buoni-pasto').reduce((a, e) => a + e.amount, 0);
  const totCibo = byCat.cibo || 0;
  const eatOut = exp.filter(e => e.cat === 'cibo' && EATOUT_SUBS.includes(e.sub)).reduce((a, e) => a + e.amount, 0);
  // Burn rate: uscite YTD / giorni trascorsi dal 1° gennaio all'ultima spesa
  const lastDate = exp.reduce((mx, e) => e.date > mx ? e.date : mx, `${year}-01-01`);
  const days = Math.round((new Date(lastDate) - new Date(`${year}-01-01`)) / 864e5) + 1;
  const burn = days ? totExp / days : 0;

  // Mesi da mostrare nelle tabelle: da gennaio al mese corrente (anni passati: tutti)
  const showMonths = M.map((_, m) => m).filter(m => year < now.getFullYear() || m <= curMonth);

  // ----- KPI: hero cash-flow + 3 gruppi di card -----
  const card = (lbl, val, extra = '') => `<div class="mk-card"><div class="mk-clbl">${esc(lbl)}</div>${val}${extra}</div>`;
  const bigv = (v, cls = '') => `<div class="mk-cval ${cls}">${esc(v)}</div>`;
  $('#dashKpi').innerHTML = `
    <div class="mk-lbl">Sintesi · cash flow YTD</div>
    <div class="mk-hero">
      <div class="mk-hero-row">
        <div><div class="mk-h-lbl in">Entrate</div><div class="mk-h-val">${esc(fmt0(totInc))}</div></div>
        <div class="mk-h-div"></div>
        <div><div class="mk-h-lbl out">Uscite</div><div class="mk-h-val">${esc(fmt0(totExp))}</div></div>
      </div>
      <div class="mk-h-hr"></div>
      <div class="mk-hero-row bottom">
        <div><div class="mk-h-lbl in">Saldo netto</div><div class="mk-h-big">${esc(sgn0(saldo))} €</div></div>
        <div class="right"><div class="mk-h-lbl in">Tasso di risparmio</div><div class="mk-h-big">${esc(pctFmt(savRate))}</div></div>
      </div>
    </div>

    <div class="mk-lbl">Medie mensili · mesi completi</div>
    <div class="mk-grid">
      ${card('Entrata media', bigv(fmt0(incAvg)))}
      ${card('Uscita media', bigv(fmt0(expAvg)))}
      ${card('Ricorrente / mese', bigv(fmt0(fixedAvg)))}
      ${card('Spesa media / mov.', bigv(fmt(perMov)))}
    </div>

    <div class="mk-lbl">Composizione della spesa</div>
    <div class="mk-grid">
      ${card('Categoria #1', `<div class="mk-cat1"><span class="name">${esc(catName(top[0]))}</span><span class="amt">${esc(fmt0(top[1]))}</span></div>`)}
      ${card('% costi fissi', bigv(pctFmt(totExp ? totFixed / totExp : 0)))}
      ${card('Casa + Auto / reddito', bigv(pctFmt(totInc ? casaAuto / totInc : 0)))}
      ${card('Copertura buoni pasto', bigv(pctFmt(totCibo ? buoni / totCibo : 0)))}
    </div>

    <div class="mk-lbl">Abitudini &amp; proiezioni</div>
    <div class="mk-grid">
      ${card('Cibo fuori casa', bigv(fmt0(eatOut)))}
      ${card('Burn rate / giorno', bigv(fmt(burn)))}
      ${card('Proiez. uscite / anno', bigv(fmt0(expAvg * 12)))}
      ${card('Proiez. risparmio / anno', bigv(sgn0(saldoAvg * 12) + ' €', saldoAvg >= 0 ? 'pos' : 'neg'))}
    </div>`;

  // ----- Tabella riepilogo mensile -----
  let run = 0;
  const rowsM = M.map((x, m) => {
    run += x.inc - x.exp;
    const inProg = m === curMonth && year === now.getFullYear();
    return { m, ...x, saldo: x.inc - x.exp, sav: x.inc ? (x.inc - x.exp) / x.inc : null, cum: run, varc: x.exp - x.fixed, inProg };
  });
  const monthly = `
    <thead><tr>
      <th class="sticky-col">Mese</th><th>Entrate</th><th>Uscite</th><th>Saldo</th>
      <th>Risp.%</th><th>Costi fissi</th><th>Costi var.</th><th>Cumulato</th><th>N.mov</th>
    </tr></thead>
    <tbody>${showMonths.map(m => { const r = rowsM[m]; return `
      <tr>
        <td class="sticky-col">${MESI[r.m]}${r.inProg ? ' <span class="in-prog">·in corso</span>' : ''}</td>
        <td class="num${r.inc ? '' : ' faint'}">${n0(r.inc)}</td>
        <td class="num">${n0(r.exp)}</td>
        <td class="num ${r.saldo >= 0 ? 'pos' : 'neg'}">${sgn0(r.saldo)}</td>
        <td class="num">${r.sav != null ? pctFmt(r.sav) : '—'}</td>
        <td class="num">${n0(r.fixed)}</td><td class="num">${n0(r.varc)}</td>
        <td class="num">${n0(r.cum)}</td>
        <td class="num faint">${r.n || 0}</td>
      </tr>`; }).join('')}</tbody>
    <tfoot><tr>
      <td class="sticky-col">TOTALE</td>
      <td class="num">${n0(totInc)}</td><td class="num">${n0(totExp)}</td>
      <td class="num">${sgn0(saldo)}</td><td class="num">${pctFmt(savRate)}</td>
      <td class="num">${n0(totFixed)}</td><td class="num">${n0(totExp - totFixed)}</td>
      <td class="num">${n0(saldo)}</td><td class="num">${all.length}</td>
    </tr></tfoot>`;
  $('#tblMonthly').innerHTML = monthly;

  // ----- Tabella categoria × mese (heatmap) -----
  // Aggregati per categoria e (categoria → sottocategoria) per mese.
  const catByMonth = {};
  const subByMonth = {}; // catId -> { sub -> [12] }
  catRank.forEach(([id]) => { catByMonth[id] = Array(12).fill(0); subByMonth[id] = {}; });
  exp.forEach(e => {
    const m = +e.date.slice(5, 7) - 1;
    catByMonth[e.cat][m] += e.amount;
    const s = e.sub || 'Altro';
    (subByMonth[e.cat][s] || (subByMonth[e.cat][s] = Array(12).fill(0)))[m] += e.amount;
  });
  const cells = catRank.flatMap(([id]) => showMonths.map(m => catByMonth[id][m]));
  const maxCell = Math.max(1, ...cells);
  // Estremi della scala dal CSS (--heat-lo/--heat-hi): di notte la scala è scura.
  const rootCss = getComputedStyle(document.documentElement);
  const rgbVar = (name, fallback) => {
    const v = rootCss.getPropertyValue(name).split(',').map(Number);
    return v.length === 3 && v.every(Number.isFinite) ? v : fallback;
  };
  const lo = rgbVar('--heat-lo', [251, 228, 201]), hi = rgbVar('--heat-hi', [226, 103, 58]);
  const heat = v => {
    if (!v) return ' style="background:var(--heat0)"';
    const t = Math.min(1, v / maxCell);
    // interpola arancio tenue (--heat-lo) → arancio pieno (--heat-hi)
    const c = (a, b) => Math.round(a + (b - a) * t);
    return ` style="background:rgb(${c(lo[0], hi[0])},${c(lo[1], hi[1])},${c(lo[2], hi[2])})"`;
  };
  const rowCells = (arr, tot, extraCls = '') => `${showMonths.map(m => `<td class="num heat ${extraCls}"${heat(arr[m])}>${n0(arr[m])}</td>`).join('')}<td class="num tot ${extraCls}">${n0(tot)}</td><td class="num faint ${extraCls}">${pctFmt(totExp ? tot / totExp : 0)}</td>`;
  const catMonth = `
    <thead><tr>
      <th class="sticky-col">Categoria</th>
      ${showMonths.map(m => `<th>${MESI_ABBR[m]}</th>`).join('')}
      <th>Totale</th><th>%</th>
    </tr></thead>
    <tbody>${catRank.map(([id, tot]) => {
      const c = catById(id);
      const subs = Object.entries(subByMonth[id])
        .map(([s, a]) => [s, a, a.reduce((x, y) => x + y, 0)])
        .sort((x, y) => y[2] - x[2]);
      const catRow = `<tr class="cat-row" data-cat="${id}">
        <td class="sticky-col cat-cell" style="border-left:3px solid ${c.color}"><span class="caret">▸</span>${esc(c.name)}</td>
        ${rowCells(catByMonth[id], tot)}
      </tr>`;
      const subRows = subs.map(([s, arr, stot]) => `<tr class="sub-row sub-${id} hidden">
        <td class="sticky-col sub-cell">${esc(s)}</td>
        ${rowCells(arr, stot, 'subc')}
      </tr>`).join('');
      return catRow + subRows;
    }).join('')}</tbody>
    <tfoot><tr>
      <td class="sticky-col">TOTALE</td>
      ${showMonths.map(m => `<td class="num">${n0(M[m].exp)}</td>`).join('')}
      <td class="num">${n0(totExp)}</td><td class="num">100%</td>
    </tr></tfoot>`;
  const tbl = $('#tblCatMonth');
  tbl.innerHTML = catMonth;
  // Espansione sottocategorie al click sulla riga di categoria.
  tbl.querySelectorAll('.cat-row').forEach(row => {
    row.addEventListener('click', () => {
      row.classList.toggle('open');
      tbl.querySelectorAll('.sub-' + row.dataset.cat).forEach(sr => sr.classList.toggle('hidden'));
    });
  });
}
const catName = id => (catById(id) || {}).name || id;

/* ---------- Insight automatici (mese corrente) ----------
 * Regole client-side sui dati locali, su una scala di intensità:
 *   0 GODIMENT · 1 AFFANNO / previsione · 2 COSTANTEMENTE IN AFFANNO ·
 *   3 MA COME HAI FATTO (budget sforato) · 4 IMBALLATO (gravissimo).
 * Il ritmo considera solo le spese variabili (i fissi a inizio mese falserebbero
 * la media). Ogni categoria compare una volta sola, al livello più alto; si
 * mostrano le 2 card più gravi più un GODIMENT se c'è, massimo 3.
 */
async function renderInsights() {
  const wrap = $('#insightWrap');
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const day = now.getDate(), dim = new Date(year, month + 1, 0).getDate();
  const progress = day / dim;
  const MESE = MESI[month].toUpperCase();

  const [all, budgets] = await Promise.all([DB.allExpenses(), DB.allBudgets()]);
  const yr = all.filter(e => e.date.slice(0, 4) === String(year));
  const expM = Array(12).fill(0), incM = Array(12).fill(0);
  yr.forEach(e => {
    const m = +e.date.slice(5, 7) - 1;
    if (isIncome(e)) incM[m] += e.amount; else expM[m] += e.amount;
  });
  const complete = expM.map((_, m) => m).filter(m => m < month && (expM[m] || incM[m]));
  const nC = complete.length;
  const lm = nC ? complete[nC - 1] : -1; // ultimo mese completo
  const expAvg = nC ? complete.reduce((a, m) => a + expM[m], 0) / nC : 0;
  const incAvg = nC ? complete.reduce((a, m) => a + incM[m], 0) / nC : 0;
  const curExp = expM[month];

  // Spesa del mese per categoria (tutta, per i budget), solo variabile (per il
  // ritmo), media mensile variabile e variabile dell'ultimo mese completo.
  const curBy = {}, curVarBy = {}, avgVarBy = {}, lastVarBy = {};
  yr.filter(e => !isIncome(e)).forEach(e => {
    const m = +e.date.slice(5, 7) - 1;
    if (m === month) {
      curBy[e.cat] = (curBy[e.cat] || 0) + e.amount;
      if (!isFixed(e)) curVarBy[e.cat] = (curVarBy[e.cat] || 0) + e.amount;
    } else if (complete.includes(m) && !isFixed(e)) {
      avgVarBy[e.cat] = (avgVarBy[e.cat] || 0) + e.amount / nC;
      if (m === lm) lastVarBy[e.cat] = (lastVarBy[e.cat] || 0) + e.amount;
    }
  });

  const out = []; // { key, level, tag, head, detail }
  // alt = titolo "MA COME HAI FATTO" per un IMBALLATO di budget che non entra (ne mostriamo uno solo).
  const add = (key, level, tag, head, detail, alt) => {
    const prev = out.find(i => i.key === key);
    if (prev && prev.level >= level) return;
    if (prev) out.splice(out.indexOf(prev), 1);
    out.push({ key, level, tag, head, detail, alt });
  };
  const CAT = c => esc(c.name.toUpperCase());
  const aM = m => (/^[aeiou]/i.test(MESI[m]) ? 'ad ' : 'a ') + MESI[m].toLowerCase(); // "ad agosto"

  // Budget: sforato di brutto, sforato, in proiezione di sforare, o ben sotto.
  for (const b of budgets) {
    const c = catById(b.cat), spent = curBy[b.cat] || 0, pct = spent / b.amount;
    if (pct >= 1.5) {
      add(b.cat, 4, 'BUDGET', 'SEI UN IMBALLATO DEL CAZZO', `<b>${esc(c.name)}</b>: ${fmt0(spent)} su un budget di ${fmt0(b.amount)}`,
        `MA COME HAI FATTO A SPENDERE COSI TANTO PER ${CAT(c)}?`);
    } else if (pct >= 1) {
      add(b.cat, 3, 'BUDGET', `MA COME HAI FATTO A SPENDERE COSI TANTO PER ${CAT(c)}?`, `${fmt0(spent)} su un budget di ${fmt0(b.amount)}`);
    } else if (day >= 5 && pct / progress >= 1) {
      add(b.cat, 1, 'PREVISIONE', `STAI PER ANDARE IN AFFANNO CON ${CAT(c)}`,
        `Budget al ${Math.round(pct * 100)}% al giorno ${day}: a fine mese arrivi a ~${fmt0(spent / progress)} su ${fmt0(b.amount)}`);
    } else if (day >= 20 && pct < 0.5) {
      add(b.cat, 0, 'BUDGET', `SEI NEL GODIMENT PER ${CAT(c)}`, `Budget usato al ${Math.round(pct * 100)}% al giorno ${day}`);
    }
  }

  // Ritmo di spesa variabile per categoria: sopra media questo mese (affanno),
  // e anche il mese scorso (costantemente).
  if (nC && day >= 8) {
    for (const [cat, cur] of Object.entries(curVarBy)) {
      const avg = avgVarBy[cat] || 0;
      if (avg < 40 || cur < 50) continue; // troppo piccole: rumore
      const r = cur / progress / avg;
      if (r < 1.4) continue;
      const c = catById(cat), perc = Math.round((r - 1) * 100);
      if ((lastVarBy[cat] || 0) >= avg * 1.2) {
        add(cat, 2, 'RITMO', `SEI COSTANTEMENTE IN AFFANNO CON ${CAT(c)}`,
          `Già ${fmt0(cur)} ${aM(month)}, ritmo +${perc}% sulla tua media, e anche ${aM(lm)} eri sopra`);
      } else {
        add(cat, 1, 'RITMO', `SEI IN AFFANNO CON ${CAT(c)}`,
          `Già ${fmt0(cur)} ${aM(month)}, ritmo +${perc}% sulla tua media (${fmt0(avg)}/mese, esclusi i fissi)`);
      }
    }
  }

  // Proiezione di fine mese: oltre le entrate medie (imballato), sopra la media
  // delle uscite (previsione) o sotto (godiment).
  if (day >= 5 && curExp > 0 && nC) {
    const proj = curExp / progress;
    if (incAvg > 0 && proj > incAvg) {
      add('mese', 4, 'PREVISIONE', 'SEI UN IMBALLATO DEL CAZZO',
        `A questo ritmo spendi ~${fmt0(proj)} ${aM(month)}, più di quanto entra (${fmt0(incAvg)}/mese)`);
    } else if (proj > expAvg * 1.15) {
      add('mese', 1, 'PREVISIONE', `STAI PER ANDARE IN AFFANNO ${aM(month).toUpperCase()}`,
        `Proiezione ~${fmt0(proj)} di uscite, sopra la tua media di ${fmt0(expAvg)}`);
    } else if (proj < expAvg * 0.85) {
      add('mese', 0, 'PREVISIONE', `SEI NEL GODIMENT PER ${MESE}`,
        `Proiezione ~${fmt0(proj)} di uscite, sotto la tua media di ${fmt0(expAvg)}`);
    }
  }

  // Ultimo mese chiuso: in risparmio (godiment) o in rosso (affanno).
  if (nC && incM[lm] > 0) {
    const sv = incM[lm] - expM[lm], LM = MESI[lm].toUpperCase();
    if (sv > 0) add('scorso', 0, 'RISPARMIO', `SEI NEL GODIMENT PER ${LM}`, `Hai risparmiato ${fmt0(sv)} (${Math.round(sv / incM[lm] * 100)}% delle entrate)`);
    else if (sv < 0) add('scorso', 1, 'RISPARMIO', `SEI IN AFFANNO CON ${LM}`, `Hai speso ${fmt0(-sv)} più di quanto è entrato`);
  }

  // Selezione: un solo IMBALLATO, le 2 più gravi + un GODIMENT se c'è.
  out.sort((a, b) => b.level - a.level);
  const top = out.find(i => i.level === 4);
  const bad = out.filter(i => i.level > 0 && (i.level < 4 || i === top || i.alt))
    .map(i => i.level === 4 && i !== top ? { ...i, level: 3, head: i.alt } : i)
    .sort((a, b) => b.level - a.level);
  const good = out.find(i => i.level === 0);
  const shown = good ? [...bad.slice(0, 2), good] : bad.slice(0, 3);

  wrap.innerHTML = shown.length
    ? `<div class="insight-title">Insight · ${MESE}</div>` +
      shown.map(i => `<div class="insight-card lv${i.level}"><span class="ins-tag">${i.tag}</span>` +
        `<div class="ins-head">${i.head}</div><div class="ins-detail">${i.detail}</div></div>`).join('')
    : '';
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
    const status = pct >= 100 ? `Sforato di ${fmt(spent - b.amount)}` : `Restano ${fmt(b.amount - spent)}`;
    row.innerHTML = `<div class="head"><span>${c.icon} ${c.name}</span><span class="sp">${fmt(spent)} / ${fmt(b.amount)}</span></div>
      <div class="track"><div class="fill" style="width:${Math.min(pct, 100)}%"></div></div>
      <div class="sub"><span class="status">${status}</span><span>${pct.toFixed(0)}%</span></div>`;
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

  renderGoal();
}

/* ---------- Obiettivo di risparmio ----------
 * Un solo obiettivo (KISS), salvato in meta. Il progresso è il saldo cumulato
 * (entrate − uscite) di tutto lo storico — lo stesso del grafico in statistiche.
 * L'ETA usa il risparmio medio degli ultimi 6 mesi completi.
 */
async function renderGoal() {
  const wrap = $('#goalWrap');
  const [goal, all] = await Promise.all([DB.getMeta('savingsGoal'), DB.allExpenses()]);
  if (!goal || !goal.amount) {
    wrap.innerHTML = '<button class="goal-add" id="goalAddBtn">＋ Imposta un obiettivo</button>';
    $('#goalAddBtn').onclick = () => renderGoalEditor(goal);
    return;
  }
  const saldo = all.reduce((a, e) => a + (isIncome(e) ? e.amount : -e.amount), 0);
  const now = new Date();
  const byMonth = {};
  all.forEach(e => {
    const m = e.date.slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + (isIncome(e) ? e.amount : -e.amount);
  });
  const curKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const past = Object.keys(byMonth).filter(m => m < curKey).sort().slice(-6);
  const avgSave = past.length ? past.reduce((a, m) => a + byMonth[m], 0) / past.length : 0;

  const pct = Math.max(0, Math.min(100, (saldo / goal.amount) * 100));
  const done = saldo >= goal.amount;
  let eta;
  if (done) eta = '🎉 Obiettivo raggiunto!';
  else if (avgSave > 0) {
    const left = Math.ceil((goal.amount - saldo) / avgSave);
    const d = new Date(now.getFullYear(), now.getMonth() + left, 1);
    eta = `Al ritmo attuale (~${fmt0(avgSave)}/mese) lo raggiungi a ${d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}`;
  } else eta = 'Al ritmo attuale non lo raggiungi: serve un risparmio mensile positivo';

  wrap.innerHTML = `
    <div class="goal-card">
      <div class="head"><span>🎯 ${esc(goal.label || 'Obiettivo')}</span><span class="sp">${fmt0(Math.max(saldo, 0))} / ${fmt0(goal.amount)}</span></div>
      <div class="track"><div class="fill" style="width:${pct}%"></div></div>
      <div class="sub">${pct.toFixed(0)}% — ${eta}</div>
      <button class="btn-danger-link goal-edit" id="goalEditBtn">modifica</button>
    </div>`;
  $('#goalEditBtn').onclick = () => renderGoalEditor(goal);
}

function renderGoalEditor(goal) {
  const wrap = $('#goalWrap');
  wrap.innerHTML = `
    <div class="goal-card">
      <input type="text" id="goalLabel" placeholder="Nome (es. Fondo emergenze)" value="${esc(goal?.label || '')}">
      <input type="number" id="goalAmount" inputmode="decimal" min="1" placeholder="Importo obiettivo (€)" value="${goal?.amount || ''}">
      <div class="goal-btns">
        <button class="btn-primary" id="goalSaveBtn">Salva</button>
        ${goal ? '<button class="btn-danger-link" id="goalDelBtn">Rimuovi</button>' : ''}
        <button class="btn-danger-link" id="goalCancelBtn">Annulla</button>
      </div>
      <div class="chart-note">Il progresso è il saldo cumulato (entrate − uscite) da quando registri.</div>
    </div>`;
  $('#goalSaveBtn').onclick = async () => {
    const amount = parseFloat($('#goalAmount').value);
    if (!(amount > 0)) { toast('Inserisci un importo valido'); return; }
    await DB.setMeta('savingsGoal', { amount, label: $('#goalLabel').value.trim() });
    toast('Obiettivo salvato');
    renderGoal();
  };
  const del = $('#goalDelBtn');
  if (del) del.onclick = async () => { await DB.setMeta('savingsGoal', null); renderGoal(); };
  $('#goalCancelBtn').onclick = () => renderGoal();
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
  let blob, filename;
  if (format === 'json') {
    blob = new Blob([JSON.stringify(await buildBackup(), null, 2)], { type: 'application/json' });
    filename = `spese-backup-${todayStr()}.json`;
    await DB.setMeta('lastExportAt', new Date().toISOString()); // per il promemoria backup
  } else {
    const [expenses, people, events] = await Promise.all([DB.allExpenses(), People.map(), DB.all('events')]);
    const evName = new Map(events.map(ev => [ev.id, ev.name]));
    const who = id => (people.get(id) || { name: 'Persona sconosciuta' }).name;
    const num = n => String(n).replace('.', ',');
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    // `importo` resta la mia quota (coerente con le metriche); `tua quota` la ripete per chiarezza.
    const rows = [['data', 'tipo', 'importo', 'categoria', 'sottocategoria', 'nota', 'pagato', 'tua quota', 'pagato da', 'diviso con', 'evento']];
    expenses.sort((a, b) => a.date.localeCompare(b.date))
      .forEach(e => {
        const n = Ledger.normalize(e);
        rows.push([e.date, isIncome(e) ? 'entrata' : 'uscita', num(e.amount),
          (isIncome(e) ? incomeCatById(e.cat) : catById(e.cat)).name, e.sub, e.note,
          num(n.paid), num(e.amount), e.payer ? `${who(e.payer)}${e.payerTotal != null ? ` (${num(e.payerTotal)})` : ''}` : 'io',
          n.splits.map(s => `${who(s.personId)} ${num(s.amount)}`).join(' | '), e.eventId ? (evName.get(e.eventId) || '') : '']);
      });
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

/* ---------- Import con scelta (RD-11) ---------- */
// La sanificazione (v1 e v2, segnaposto per i riferimenti mancanti) è in sanitize.js.
$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async ev => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  try {
    if (f.size > 20 * 1024 * 1024) throw new Error('file troppo grande');
    const clean = Sanitize.backup(JSON.parse(await f.text()), { keepId: true });
    // Copia dei dati attuali preparata ORA: al tocco di "Importa" il download parte
    // subito, dentro il gesto dell'utente (decisione D1).
    const current = JSON.stringify(await buildBackup({ source: 'pre-import' }), null, 2);
    openImportSheet(f.name, clean, { filename: `spese-pre-import-${todayStr()}.json`, json: current });
  } catch (err) {
    toast('Import fallito: ' + err.message);
  }
});

function openImportSheet(fileName, clean, safety) {
  const n = clean.expenses.length, st = clean.stats;
  const plural = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  const parts = [plural(n, 'movimento', 'movimenti')];
  if (clean.people.length) parts.push(plural(clean.people.length, 'persona', 'persone'));
  if (clean.events.length) parts.push(plural(clean.events.length, 'evento', 'eventi'));
  const notes = [];
  if (st.skipped) notes.push(st.skipped === 1 ? '1 record non valido verrà scartato' : `${st.skipped} record non validi verranno scartati`);
  if (st.repaired) notes.push(`${plural(st.repaired, 'movimento corretto', 'movimenti corretti')} (dati incoerenti)`);
  if (st.placeholders) notes.push(`${plural(st.placeholders, 'riferimento mancante sostituito', 'riferimenti mancanti sostituiti')} da un segnaposto`);

  const el = document.createElement('div');
  el.className = 'sheet-backdrop';
  el.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="importTitle">
      <div class="sheet-handle"></div>
      <h3 id="importTitle">Importa backup</h3>
      <div class="sheet-sub">${esc(fileName)} · ${parts.join(' · ')}</div>
      ${notes.length ? `<div class="sheet-warn">${notes.map(esc).join('<br>')}</div>` : ''}
      <label class="choice selected"><input type="radio" name="importMode" value="replace" checked>
        <span class="dot"></span><span><b>Sostituisci tutto <span class="rec">CONSIGLIATO</span></b>
        <small>I dati attuali vengono sostituiti da quelli del file. Se qualcosa va storto non cambia niente.</small></span></label>
      <label class="choice"><input type="radio" name="importMode" value="append">
        <span class="dot"></span><span><b>Aggiungi ai dati attuali</b>
        <small>Come prima. Attenzione: importare due volte lo stesso file duplica le spese.</small></span></label>
      <div class="sheet-note">💾 Prima di procedere salvo <b>${esc(safety.filename)}</b> sul dispositivo.</div>
      <button class="btn-primary" data-act="go">Importa</button>
      <button class="sheet-cancel" data-act="cancel">Annulla</button>
    </div>`;
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  el.addEventListener('click', e => { if (e.target === el) close(); });
  el.querySelectorAll('input[name=importMode]').forEach(r => r.addEventListener('change', () => {
    el.querySelectorAll('.choice').forEach(c => c.classList.toggle('selected', c.querySelector('input').checked));
  }));
  el.querySelector('[data-act=cancel]').onclick = close;
  el.querySelector('[data-act=go]').onclick = async ev => {
    const mode = el.querySelector('input[name=importMode]:checked').value;
    Snapshots.download(safety.filename, safety.json); // sincrono: siamo nel gesto
    ev.target.disabled = true;
    try {
      await Snapshots.save({ kind: 'pre-import', filename: safety.filename, json: safety.json });
      if (mode === 'replace') await DB.replaceAll(clean);
      else await DB.appendAll(clean);
      close();
      toast(mode === 'replace' ? `Dati sostituiti: ${n} movimenti` : `Importati ${n} movimenti`);
      renderRecurring();
    } catch (err) {
      ev.target.disabled = false;
      toast('Import fallito, dati invariati: ' + err.message);
    }
  };
  document.body.appendChild(el);
  el.querySelector('[data-act=go]').focus();
}

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

/* ---------- Aggiornamento del database (RD-10) ---------- */
// Un'altra istanza con la versione vecchia (l'app rimasta aperta in background o una
// scheda di Chrome con il sito) tiene aperto il DB: l'aggiornamento aspetta e ogni
// lettura dei dati resta in sospeso. Schermata fissa finché non si sblocca da solo.
window.addEventListener('db-blocked', () => {
  if ($('#dbBlocked')) return;
  const el = document.createElement('div');
  el.id = 'dbBlocked';
  el.className = 'sheet-backdrop dialog-backdrop';
  el.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true" aria-label="Aggiornamento in attesa">
    <h3>Aggiornamento in attesa ⏳</h3>
    <div class="dialog-body"><p>Un'altra finestra dell'app usa ancora la versione precedente e blocca l'aggiornamento.
      <b>I tuoi dati non sono stati toccati.</b></p>
      <p style="margin-top:10px">Chiudi le altre finestre: dalle <b>app recenti</b> chiudi Spese e anche le <b>schede di Chrome</b> con il sito.
      Questa schermata si sblocca da sola appena l'aggiornamento riparte.</p></div>
  </div>`;
  document.body.appendChild(el);
});
window.addEventListener('db-unblocked', () => {
  const el = $('#dbBlocked');
  if (el) el.remove();
  const v = document.querySelector('.view.active');
  if (v) showView(v.id.replace(/^view-/, '')); // ridisegna con i dati
  if (typeof EventsUI !== 'undefined') EventsUI.reset();
  toast('Aggiornamento completato'); // il popup "App aggiornata" arriva dalla chiamata dell'avvio, rimasta in attesa
});
// Un'altra scheda ha aggiornato il DB: questa ha già chiuso la connessione, va ricaricata.
window.addEventListener('db-versionchange', () => {
  if (confirm("L'app è stata aggiornata in un'altra scheda. Ricaricare ora?")) location.reload();
  else toast('Ricarica la pagina per continuare');
});

/* ---------- Popup "App aggiornata" (RD-12, RD-13, decisione D1) ---------- */
// Una sola volta dopo l'aggiornamento del DB. La copia dei dati com'erano è già nel
// DB di backup del dispositivo (snapshots.js); il tocco su "Scarica copia e continua"
// la salva anche come file nei Download (senza tocco il browser può bloccarlo).
async function maybeShowUpgradeNotice() {
  const n = await DB.getMeta('upgradeNotice');
  if (!n || n.shown || document.querySelector('.update-dialog')) return;
  const snap = n.filename ? await Snapshots.latest('pre-upgrade') : null;
  const ok = snap && snap.filename === n.filename;
  const granted = await Drive.isGranted();
  const el = document.createElement('div');
  el.className = 'sheet-backdrop dialog-backdrop';
  el.innerHTML = `<div class="dialog update-dialog" role="alertdialog" aria-modal="true" aria-label="App aggiornata">
    <h3>App aggiornata 🎉</h3>
    <div class="dialog-body">Ecco le novità di questa versione:</div>
    <ul class="news">
      <li><span>👥</span><span><b>Spese divise</b>: nel wizard trovi "Diviso con" e "Pagato da". Nelle statistiche conta solo la tua quota.</span></li>
      <li><span>💸</span><span><b>Condivise › Persone</b>: chi ti deve cosa, rimborsi e compensazioni.</span></li>
      <li><span>✈️</span><span><b>Eventi</b>: raggruppa le spese di vacanze, picnic e uscite.</span></li>
      <li><span>⋯</span><span><b>Altro</b> è diventato un menu, e dentro trovi Budget.</span></li>
    </ul>
    ${ok ? `<div class="sheet-note">✅ I tuoi dati sono intatti. Copia di prima dell'aggiornamento salvata sul dispositivo${granted ? ' (e caricata anche su Google Drive)' : ''}: <b>${esc(snap.filename)}</b> · ${n.count} movimenti.</div>`
      : `<div class="sheet-warn">Non è stato possibile fare la copia automatica${n.error ? ` (${esc(n.error)})` : ''}. I dati non sono stati modificati: esporta comunque un backup adesso.</div>`}
    <button class="btn-primary" data-act="go">${ok ? 'Scarica copia e continua' : 'Esporta backup e continua'}</button>
  </div>`;
  el.querySelector('[data-act=go]').onclick = async () => {
    if (ok) Snapshots.download(snap.filename, snap.json); // nel gesto: il download parte
    else exportData('json');
    el.remove();
    await DB.setMeta('upgradeNotice', { ...(await DB.getMeta('upgradeNotice')), shown: true, shownAt: new Date().toISOString() });
  };
  document.body.appendChild(el);
}

/* ---------- Copie di sicurezza sul dispositivo (Altro › Dati) ---------- */
async function renderSnapshots() {
  const list = (await Snapshots.all()).sort((a, b) => b.id - a.id);
  const what = { 'pre-upgrade': "Prima dell'aggiornamento", 'pre-import': "Prima di un import" };
  $('#snapList').innerHTML = list.length ? list.map(s => `<div class="rec-item"><span class="ico">💾</span>
      <span class="info">${esc(what[s.kind] || s.kind)}<small>${esc(new Date(s.at).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' }))} · ${(s.json.length / 1024).toFixed(0)} KB</small></span>
      <button class="btn-secondary" data-snap="${s.id}">Scarica</button></div>`).join('')
    : '<div class="empty">Nessuna copia: ne viene fatta una prima di ogni aggiornamento del database e di ogni import.</div>';
  $('#snapList').querySelectorAll('[data-snap]').forEach(b => {
    b.onclick = () => { const s = list.find(x => x.id === +b.dataset.snap); Snapshots.download(s.filename, s.json); };
  });
}

/* ---------- Service worker e nuove versioni ---------- */
// Con il service worker "prima la cache" l'app si apre dalla versione salvata.
// Quando un rilascio installa la nuova versione e ne prende il controllo, propongo di
// ricaricare (con un tocco: niente ricarica a sorpresa mentre si sta scrivendo una spesa).
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const hadController = !!navigator.serviceWorker.controller; // al primo avvio non è un aggiornamento
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) showUpdateBanner();
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
function showUpdateBanner() {
  if ($('#updateBanner')) return;
  const el = document.createElement('div');
  el.id = 'updateBanner';
  el.className = 'update-banner';
  el.setAttribute('role', 'status');
  el.innerHTML = '<span>Nuova versione pronta</span><button type="button">Aggiorna</button>';
  el.querySelector('button').onclick = () => location.reload();
  document.body.appendChild(el);
}

/* ---------- Avvio ---------- */
(async function init() {
  $('#dateInput').value = todayStr();
  $('#recStart').value = todayStr();
  renderCatGrid();
  fillRecSelectors();
  registerServiceWorker(); // prima di aspettare il DB: il controllo aggiornamenti parte subito
  await migrateData();
  await applyRecurring();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  Drive.maybeAutoBackup(); // backup mensile "all'apertura" (silenzioso se già collegato)
  setTimeout(() => Drive.maybeUploadUpgradeSnapshot(), 3000); // RD-12: copia pre-aggiornamento anche su Drive
  setTimeout(maybeBackupReminder, 4000); // dopo l'eventuale toast delle ricorrenti
  maybeShowUpgradeNotice(); // RD-13: una volta sola dopo l'aggiornamento del DB
  // Apertura diretta da scorciatoia PWA (long-press sull'icona → Statistiche/Movimenti)
  const qv = new URLSearchParams(location.search).get('view');
  if (qv && document.querySelector(`#view-${qv}`)) showView(qv);
})();
