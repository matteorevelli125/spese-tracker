// Condivise › Persone (F4): elenco dei saldi, scheda persona con lo storico, rimborsi
// e gestione della rubrica. Caricato dopo app.js e split-ui.js.
// I calcoli sono in Ledger (balances, timeline, mergePeople): qui solo interfaccia.
const PeopleUI = (() => {
  const C = Money.toCents;
  const F = cents => fmt(cents / 100);
  const N = cents => (cents < 0 ? '−' : '') + (Math.abs(cents) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Valore per i campi di input: senza separatore delle migliaia (parseAmount non lo gestisce).
  const NI = cents => (cents / 100).toFixed(2).replace('.', ',');
  const shortDate = d => new Date(d + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  const balLabel = c => (c > 0 ? 'ti deve' : c < 0 ? 'devi' : 'in pari');
  let current = null;       // persona aperta nella scheda
  let showArchived = false;
  let timelineItems = [];   // righe dello storico mostrate (per il tap)

  async function load() {
    const [people, expenses, settlements, events] = await Promise.all([
      DB.all('people'), DB.allExpenses(), DB.all('settlements'), DB.all('events')]);
    return { people, expenses, settlements, events, bal: Ledger.balances(expenses, settlements) };
  }
  const lastActivity = (id, d) => {
    const t = Ledger.timeline(id, d.expenses, d.settlements)[0];
    if (!t) return 'nessun movimento';
    const what = t.settlement ? (t.kind === 'refund' ? 'rimborso' : 'restituito') : (t.expense.note || t.expense.sub);
    return `ultimo: ${shortDate(t.date)} · ${what}`;
  };

  // ---------- elenco (RF-P1, RF-P2) ----------
  async function renderList() {
    const d = await load();
    const { owedToMe, iOwe } = Ledger.totals(d.bal);
    const abs = p => Math.abs(d.bal.get(p.id) || 0);
    const active = d.people.filter(p => !p.archived).sort((a, b) => abs(b) - abs(a) || a.name.localeCompare(b.name, 'it'));
    const archived = d.people.filter(p => p.archived).sort((a, b) => a.name.localeCompare(b.name, 'it'));
    const row = p => {
      const c = d.bal.get(p.id) || 0;
      return `<button class="person-row${c === 0 ? ' zero' : ''}" data-id="${UI.esc(p.id)}">${UI.avatar(p)}
        <span class="info"><b>${UI.esc(p.name)}</b><small>${UI.esc(lastActivity(p.id, d))}</small></span>
        <span class="r ${c > 0 ? 'pos' : c < 0 ? 'neg' : ''}">${F(Math.abs(c))}<small>${balLabel(c)}</small></span><span class="chev">›</span></button>`;
    };
    $('#peoplePane').innerHTML = (d.people.length ? `
      <div class="owe-card"><div><span class="lbl">Ti devono</span><b class="pos">${F(owedToMe)}</b></div>
        <div><span class="lbl">Devi</span><b class="neg">${F(iOwe)}</b></div></div>` : '') +
      (active.length ? `<div class="person-list">${active.map(row).join('')}</div>`
        : '<div class="empty">Nessuna persona ancora.<br>Quando dividi una spesa con qualcuno, qui vedrai chi ti deve cosa.</div>') +
      '<button class="btn-secondary wide" data-act="new">＋ Nuova persona</button>' +
      (archived.length ? `<button class="collapse-row" data-act="arch" aria-expanded="${showArchived}"><span>Archiviate · ${archived.length}</span><span>${showArchived ? '⌄' : '›'}</span></button>` +
        (showArchived ? `<div class="person-list">${archived.map(row).join('')}</div>` : '') : '');
  }

  // ---------- scheda persona (RF-P3…P6) ----------
  async function openPerson(id) {
    current = id;
    showView('person');
    await renderPerson();
  }

  async function renderPerson() {
    const d = await load();
    const p = d.people.find(x => x.id === current);
    if (!p) { showView('share'); return; }
    const c = d.bal.get(p.id) || 0;
    const evById = new Map(d.events.map(e => [e.id, e]));
    timelineItems = Ledger.timeline(p.id, d.expenses, d.settlements);
    const item = (t, i) => {
      const e = t.expense, s = t.settlement;
      const title = s ? (t.kind === 'refund' ? 'Rimborso ricevuto' : 'Hai restituito') : (e.note || e.sub);
      const sub = s ? [shortDate(s.date), s.note].filter(Boolean).join(' · ')
        : t.kind === 'paid-for-me' ? `${shortDate(e.date)} · ha pagato ${p.name} · tua quota`
          : `${shortDate(e.date)} · pagato da te ${fmt(Ledger.normalize(e).paid)} · sua quota`;
      const ev = evById.get((e || s).eventId);
      return `<button class="tl-row" data-i="${i}"><span class="ico">${s ? '↩︎' : catById(e.cat).icon}</span>
        <span class="info"><b>${UI.esc(title)}</b><small>${UI.esc(sub)}</small>${ev ? `<span class="tag evt">${UI.esc(ev.emoji)} ${UI.esc(ev.name)}</span>` : ''}</span>
        <span class="r ${t.cents > 0 ? 'pos' : 'neg'}">${t.cents > 0 ? '+' : ''}${N(t.cents)}<small>saldo ${N(t.balance)}</small></span></button>`;
    };
    $('#personBody').innerHTML = `
      <div class="person-hero">
        <div class="who">${UI.avatar(p)}<span>${UI.esc(p.name)}</span>${p.archived ? '<span class="tag">archiviata</span>' : ''}</div>
        <div class="lbl">${c > 0 ? 'Ti deve' : c < 0 ? 'Devi' : 'In pari'}</div>
        <div class="big ${c > 0 ? 'pos' : c < 0 ? 'neg' : ''}">${F(Math.abs(c))}</div>
      </div>
      <div class="person-actions">
        <button class="btn-primary" data-act="settle">${c < 0 ? 'Ho restituito' : 'Registra rimborso'}</button>
        <button class="btn-secondary" data-act="paid-for-me">Ha pagato per me</button>
        <button class="btn-secondary" data-act="even"${c === 0 ? ' disabled' : ''}>Segna come saldato</button>
      </div>
      <h2>Storico</h2>
      ${timelineItems.length ? `<div class="person-list tl">${timelineItems.map(item).join('')}</div>`
        : '<div class="empty">Nessun movimento con questa persona.</div>'}`;
  }

  // ---------- rimborso: registra, modifica, elimina (RF-P4, P7, P8) ----------
  async function openSettlement(personId, opts = {}) {
    const d = await load();
    const p = d.people.find(x => x.id === personId);
    if (!p) return;
    const edit = opts.edit || null;
    const bal = d.bal.get(personId) || 0;
    // Saldo senza il rimborso che sto modificando
    const base = edit ? bal - (edit.direction === 'out' ? C(edit.amount) : -C(edit.amount)) : bal;
    const dir = edit ? edit.direction : (base < 0 ? 'out' : 'in');
    const due = dir === 'in' ? Math.max(base, 0) : Math.max(-base, 0);
    const initial = edit ? C(edit.amount) : due;
    const eventId = edit ? edit.eventId : opts.eventId;
    const events = d.events.filter(e => !e.archived || e.id === eventId);
    const s = UI.sheet(`
      <h3>${edit ? 'Modifica rimborso' : dir === 'in' ? 'Registra rimborso' : 'Ho restituito'}</h3>
      <div class="sheet-sub">${dir === 'in' ? `${UI.esc(p.name)} ti restituisce dei soldi. Non è un'entrata: cambia solo il saldo.`
        : `Restituisci dei soldi a ${UI.esc(p.name)}. Non è una spesa: cambia solo il saldo.`}</div>
      <div class="amount-box"><label class="l" for="setAmount">Importo</label>
        <input id="setAmount" class="amount-input" inputmode="decimal" autocomplete="off" placeholder="0,00 €" value="${initial ? NI(initial) : ''}"></div>
      ${due > 0 ? `<div class="quick-row"><button class="chip" data-q="${due}">Tutto · ${N(due)}</button><button class="chip" data-q="${Math.floor(due / 2)}">Metà · ${N(Math.floor(due / 2))}</button></div>` : ''}
      <div class="sheet-warn" data-warn hidden></div>
      <div class="field-list">
        <label class="field-row"><span>Data</span><input type="date" data-f="date" value="${edit ? edit.date : todayStr()}"></label>
        <label class="field-row"><span>Nota</span><input type="text" data-f="note" placeholder="es. bonifico, contanti" value="${UI.esc(edit ? edit.note : '')}"></label>
        ${events.length ? `<label class="field-row"><span>Evento</span><select data-f="event" class="row-select"><option value="">nessuno</option>
          ${events.map(e => `<option value="${UI.esc(e.id)}"${e.id === eventId ? ' selected' : ''}>${UI.esc(e.emoji)} ${UI.esc(e.name)}</option>`).join('')}</select></label>` : ''}
      </div>
      <button class="btn-primary" data-act="save">${edit ? 'Salva' : dir === 'in' ? 'Registra rimborso' : 'Registra restituzione'}</button>
      ${edit ? '<button class="sheet-cancel danger" data-act="del">Elimina rimborso</button>' : ''}`, { label: 'Rimborso' });
    const R = sel => s.root.querySelector(sel);
    const amt = () => { const v = parseAmount(R('#setAmount').value); return v ? C(v) : 0; };
    const check = () => {
      const a = amt();
      const after = dir === 'in' ? base - a : base + a;
      const w = R('[data-warn]');
      const over = (dir === 'in' && after < 0) || (dir === 'out' && after > 0);
      w.hidden = !over;
      w.textContent = !over ? '' : dir === 'in' ? `Il rimborso supera il saldo: ${p.name} risulterà creditore di ${F(-after)}.`
        : `Supera quanto devi: ${p.name} risulterà debitore di ${F(after)}.`;
      R('[data-act=save]').disabled = a <= 0;
    };
    R('#setAmount').addEventListener('input', check);
    s.root.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { R('#setAmount').value = NI(+b.dataset.q); check(); }));
    R('[data-act=save]').addEventListener('click', async () => {
      const a = amt();
      if (a <= 0) return;
      const ev = R('[data-f=event]') ? R('[data-f=event]').value : '';
      const rec = { id: edit ? edit.id : People.uuid(), personId, direction: dir, amount: a / 100,
        date: R('[data-f=date]').value || todayStr(), note: R('[data-f=note]').value.trim().slice(0, 200), ts: edit ? edit.ts : Date.now() };
      if (ev) rec.eventId = ev;
      await DB.put('settlements', rec);
      s.close();
      toast(edit ? 'Rimborso aggiornato' : dir === 'in' ? `Rimborso di ${F(a)} registrato` : `Restituzione di ${F(a)} registrata`);
      refresh();
    });
    if (edit) R('[data-act=del]').addEventListener('click', async () => {
      if (!(await UI.confirm({ title: 'Eliminare il rimborso?', body: `${F(C(edit.amount))} del ${shortDate(edit.date)}. Il saldo con ${UI.esc(p.name)} verrà ricalcolato.`, ok: 'Elimina', danger: true }))) return;
      await DB.del('settlements', edit.id);
      s.close();
      toast('Rimborso eliminato');
      refresh();
    });
    check();
    R('#setAmount').focus();
  }

  // "Segna come saldato" (RF-P6): un rimborso pari al saldo intero.
  async function markEven(personId) {
    const d = await load();
    const p = d.people.find(x => x.id === personId);
    const c = d.bal.get(personId) || 0;
    if (!p || !c) return;
    const ok = await UI.confirm({ title: `Saldare i conti con ${p.name}?`,
      body: c > 0 ? `Registro che ${UI.esc(p.name)} ti ha restituito <b>${F(c)}</b>. Il saldo torna a zero.`
        : `Registro che hai restituito <b>${F(-c)}</b> a ${UI.esc(p.name)}. Il saldo torna a zero.`, ok: 'Segna come saldato' });
    if (!ok) return;
    await DB.put('settlements', { id: People.uuid(), personId, direction: c > 0 ? 'in' : 'out', amount: Math.abs(c) / 100,
      date: todayStr(), note: 'Saldato', ts: Date.now() });
    toast(`Conti con ${p.name} saldati`);
    refresh();
  }

  // ---------- gestione: nuova, rinomina, unisci, archivia, elimina (RF-P9, P10) ----------
  function askName(title, value, onSave) {
    const s = UI.sheet(`<h3>${UI.esc(title)}</h3>
      <input type="text" class="pick-search" data-name maxlength="60" placeholder="Nome" value="${UI.esc(value || '')}" autocomplete="off">
      <button class="btn-primary" data-act="ok">Salva</button><button class="sheet-cancel" data-act="no">Annulla</button>`, { label: title });
    const inp = s.root.querySelector('[data-name]');
    const go = async () => { const v = inp.value.trim(); if (v && (await onSave(v)) !== false) s.close(); };
    s.root.querySelector('[data-act=ok]').addEventListener('click', go);
    s.root.querySelector('[data-act=no]').addEventListener('click', s.close);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    inp.focus();
    inp.select();
  }

  function newPerson() {
    askName('Nuova persona', '', async name => {
      const before = await People.search(name);
      const p = await People.create(name);
      if (before.exact) toast(`${p.name} c'è già`);
      openPerson(p.id);
    });
  }

  async function manage() {
    const d = await load();
    const p = d.people.find(x => x.id === current);
    if (!p) return;
    const c = d.bal.get(p.id) || 0;
    const referenced = Ledger.isReferenced(p.id, d);
    const s = UI.sheet(`<h3>${UI.esc(p.name)}</h3>
      <div class="pick-list">
        <button class="pick-row" data-act="rename"><span class="info"><b>Rinomina</b></span></button>
        <button class="pick-row" data-act="merge"><span class="info"><b>Unisci con…</b><small>per i doppioni, es. "Giuli" e "Giulia"</small></span></button>
        <button class="pick-row" data-act="archive"><span class="info"><b>${p.archived ? 'Ripristina' : 'Archivia'}</b>
          <small>${p.archived ? 'torna nei suggerimenti' : c ? 'possibile solo con saldo a zero' : 'non compare più nei suggerimenti'}</small></span></button>
        ${referenced ? '' : '<button class="pick-row danger" data-act="delete"><span class="info"><b>Elimina persona</b><small>non compare in nessun movimento</small></span></button>'}
      </div>`, { label: 'Gestisci persona' });
    s.root.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      s.close();
      if (b.dataset.act === 'rename') {
        askName('Rinomina', p.name, async name => {
          const clash = (await People.all()).find(x => x.id !== p.id && People.key(x.name) === People.key(name));
          if (clash) { toast(`Esiste già "${clash.name}": usa «Unisci con…»`); return false; }
          await DB.put('people', { ...p, name: name.slice(0, 60) });
          refresh();
        });
      } else if (b.dataset.act === 'archive') {
        if (!p.archived && c) { toast('Si può archiviare solo con il saldo a zero'); return; }
        await DB.put('people', { ...p, archived: !p.archived });
        toast(p.archived ? `${p.name} ripristinata` : `${p.name} archiviata`);
        if (p.archived) refresh(); else showView('share');
      } else if (b.dataset.act === 'delete') {
        if (!(await UI.confirm({ title: `Eliminare ${p.name}?`, body: 'Non compare in nessun movimento, rimborso o evento.', ok: 'Elimina', danger: true }))) return;
        await DB.del('people', p.id);
        toast(`${p.name} eliminata`);
        showView('share');
      } else if (b.dataset.act === 'merge') {
        pickMergeTarget(p, d);
      }
    });
  }

  // Unisci `from` dentro un'altra persona: saldi sommati, riferimenti spostati, `from` eliminata.
  function pickMergeTarget(from, d) {
    const others = d.people.filter(x => x.id !== from.id).sort((a, b) => a.name.localeCompare(b.name, 'it'));
    if (!others.length) { toast('Non ci sono altre persone con cui unire'); return; }
    const s = UI.sheet(`<h3>Unisci "${UI.esc(from.name)}" con…</h3>
      <div class="sheet-sub">Movimenti, rimborsi ed eventi passano alla persona che scegli.</div>
      <div class="pick-list" style="margin-top:14px">${others.map(o => `<button class="pick-row" data-id="${UI.esc(o.id)}">${UI.avatar(o)}
        <span class="info"><b>${UI.esc(o.name)}</b><small>${balLabel(d.bal.get(o.id) || 0)} ${F(Math.abs(d.bal.get(o.id) || 0))}</small></span></button>`).join('')}</div>`, { label: 'Unisci' });
    s.root.addEventListener('click', async e => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      s.close();
      const to = others.find(o => o.id === b.dataset.id);
      const a = d.bal.get(from.id) || 0, t = d.bal.get(to.id) || 0;
      const ok = await UI.confirm({ title: `Unire "${from.name}" in "${to.name}"?`,
        body: `Movimenti, rimborsi e partecipazioni agli eventi di ${UI.esc(from.name)} passano a ${UI.esc(to.name)}, poi "${UI.esc(from.name)}" viene eliminata.
          <div class="diff" style="margin-top:12px"><div><span class="lbl">${UI.esc(from.name)} + ${UI.esc(to.name)}</span><b>${N(a)} + ${N(t)}</b></div>
          <span class="arrow">→</span><div><span class="lbl">${UI.esc(to.name)}</span><b class="${a + t > 0 ? 'pos' : a + t < 0 ? 'neg' : ''}">${F(Math.abs(a + t))}</b><span class="lbl">${balLabel(a + t)}</span></div></div>`,
        ok: 'Unisci' });
      if (!ok) return;
      const ch = Ledger.mergePeople(d, from.id, to.id);
      const lastUsedAt = Math.max(from.lastUsedAt || 0, to.lastUsedAt || 0) || null;
      await DB.applyChanges({
        put: { expenses: ch.expenses, events: ch.events, settlements: ch.settlements, people: [{ ...to, lastUsedAt }] },
        del: { people: [from.id] },
      });
      toast(`"${from.name}" unita in "${to.name}"`);
      openPerson(to.id);
    });
  }

  // Ridisegna ciò che è visibile dopo una modifica.
  function refresh() {
    if ($('#view-person').classList.contains('active')) renderPerson();
    else renderList();
  }

  // ---------- collegamenti ----------
  $('#peoplePane').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.id) openPerson(b.dataset.id);
    else if (b.dataset.act === 'new') newPerson();
    else if (b.dataset.act === 'arch') { showArchived = !showArchived; renderList(); }
  });
  $('#personBody').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !current) return;
    if (b.dataset.act === 'settle') openSettlement(current);
    else if (b.dataset.act === 'even') markEven(current);
    else if (b.dataset.act === 'paid-for-me') { resetAddForm(); showView('add'); Split.setPayer(current); }
    else if (b.dataset.i != null) {
      const t = timelineItems[+b.dataset.i];
      if (t.settlement) openSettlement(current, { edit: t.settlement });
      else startEdit(t.expense);
    }
  });
  $('#personMore').addEventListener('click', manage);

  return { renderList, openPerson, openSettlement };
})();
