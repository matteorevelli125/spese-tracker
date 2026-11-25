// Eventi (F5): riga "Evento" del wizard, Condivise › Eventi, form con modelli e
// scheda evento. Caricato dopo app.js, split-ui.js e people-ui.js.
// Usa selType/selCat/selSub/editingId e le funzioni di render del wizard (app.js).
const EventsUI = (() => {
  // Modelli (RF-E2): preimpostano emoji e categoria predefinita, che resta un suggerimento.
  const TEMPLATES = [
    { key: 'vacanza', label: 'Vacanza', emoji: '✈️', cat: 'viaggi', sub: '' },
    { key: 'picnic', label: 'Picnic', emoji: '🧺', cat: 'cibo', sub: 'Spesa' },
    { key: 'uscita', label: 'Uscita', emoji: '🎉', cat: 'svago', sub: '' },
    { key: 'generico', label: 'Generico', emoji: '📌', cat: '', sub: '' },
  ];
  const F = cents => fmt(cents / 100);
  const N = cents => (cents > 0 ? '+' : cents < 0 ? '−' : '') + (Math.abs(cents) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDay = d => new Date(d + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  // "6 dic" · "8 – 22 ago" · "28 lug – 3 ago"
  const range = ev => {
    if (!ev.start) return '';
    if (!ev.end || ev.end === ev.start) return fmtDay(ev.start);
    const sameMonth = ev.start.slice(0, 7) === ev.end.slice(0, 7);
    return `${sameMonth ? +ev.start.slice(8) : fmtDay(ev.start)} – ${fmtDay(ev.end)}`;
  };

  let cache = [];          // eventi, ricaricati a ogni render
  let current = null;      // evento selezionato nel wizard
  let isAuto = false;      // selezionato perché in corso oggi (RF-W2)
  // Scelta fatta in questa sessione (RF-W9): undefined = nessuna, null = tolto, id = scelto.
  let sticky;
  let openId = null;       // evento aperto nella scheda
  let drill = null;        // categoria in dettaglio nella scheda
  let showArchived = false;

  const load = async () => (cache = await DB.all('events'));
  const byId = id => cache.find(e => e.id === id) || null;
  const activeEvents = () => cache.filter(e => !e.archived);

  // ---------- riga del wizard (RF-W1, W2, W9, W11) ----------
  const currentId = () => (selType === 'expense' && current && byId(current) ? current : null);

  async function render() {
    await load();
    if (current && !byId(current)) current = null;
    const ev = byId(current);
    $('#eventRow').hidden = selType !== 'expense' || (!activeEvents().length && !ev);
    $('#eventRow').classList.toggle('sel', !!ev);
    $('#eventHint').textContent = ev && isAuto ? 'in corso oggi' : '';
    $('#eventVal').classList.toggle('on', !!ev);
    $('#eventVal').innerHTML = ev
      ? `${UI.esc(ev.emoji)} ${UI.esc(ev.name)} <span class="x" role="button" tabindex="0" aria-label="Togli evento" data-clear>✕</span>`
      : 'nessuno <span class="chev">›</span>';
  }

  // Categoria predefinita (solo se non ne ho già scelta una) e partecipanti in parti uguali.
  function applyDefaults(ev, { forceCategory = false } = {}) {
    if (!ev || selType !== 'expense') return;
    if (ev.defaultCat && (forceCategory || !selCat)) {
      selCat = ev.defaultCat;
      selSub = ev.defaultSub || null;
      renderCatGrid(); renderSubList();
    }
    if (ev.participants.length) Split.applyEventPeople(ev.participants);
    updateSaveState();
  }

  // Nuovo inserimento: evento della sessione, altrimenti quello in corso oggi (se è uno solo).
  async function reset() {
    await load();
    current = null; isAuto = false;
    if (sticky !== undefined) {
      const ev = byId(sticky);
      current = ev && !ev.archived ? ev.id : null;
    } else {
      const now = Ledger.eventsInProgress(cache, todayStr());
      if (now.length === 1) { current = now[0].id; isAuto = true; }
    }
    if (current) applyDefaults(byId(current));
    render();
  }

  // Modifica di un movimento: l'evento è quello salvato.
  function loadFrom(e) { current = e.eventId || null; isAuto = false; render(); }

  // Dopo un salvataggio con evento: categoria e partecipanti tornano quelli dell'evento.
  function afterSave() {
    const ev = byId(currentId());
    if (ev) applyDefaults(ev, { forceCategory: true });
  }

  function choose(id) {
    current = id; isAuto = false;
    if (editingId === null) sticky = id; // la scelta vale per i prossimi inserimenti
    if (id) applyDefaults(byId(id));
    render();
  }

  async function openPicker() {
    await load();
    const list = activeEvents().sort(sortEvents);
    const s = UI.sheet(`<h3>Evento</h3>
      <div class="sheet-sub">Le spese dell'evento si ritrovano nella sua scheda. La categoria resta libera.</div>
      <div class="pick-list" style="margin-top:14px">
        <button class="pick-row${current ? '' : ' on'}" data-id=""><span class="ev-ico sm">∅</span><span class="info"><b>Nessun evento</b></span></button>
        ${list.map(ev => `<button class="pick-row${ev.id === current ? ' on' : ''}" data-id="${UI.esc(ev.id)}"><span class="ev-ico sm">${UI.esc(ev.emoji)}</span>
          <span class="info"><b>${UI.esc(ev.name)}</b><small>${UI.esc([range(ev), `${ev.participants.length} partecipanti`].filter(Boolean).join(' · '))}</small></span>
          ${Ledger.inProgress(ev, todayStr()) ? '<span class="live">IN CORSO</span>' : ''}</button>`).join('')}
      </div>`, { label: 'Evento' });
    s.root.addEventListener('click', e => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      s.close();
      choose(b.dataset.id || null);
    });
  }

  // ---------- Condivise › Eventi (RF-E4) ----------
  const sortEvents = (a, b) => {
    const t = todayStr();
    const la = Ledger.inProgress(a, t), lb = Ledger.inProgress(b, t);
    if (la !== lb) return la ? -1 : 1;
    return (b.start || '').localeCompare(a.start || '') || b.createdAt - a.createdAt;
  };

  async function renderList() {
    await load();
    const [exps, people] = await Promise.all([DB.allExpenses(), People.map()]);
    const sums = Ledger.eventSummaries(exps); // tutti gli eventi in un solo passaggio
    const empty = { quota: 0 };
    const card = ev => {
      const sum = sums.get(ev.id) || empty;
      const avs = ev.participants.slice(0, 6).map(id => UI.avatar(people.get(id) || { id, name: '?' }, true)).join('');
      return `<button class="event-card${ev.archived ? ' archived' : ''}" data-id="${UI.esc(ev.id)}"><span class="ev-ico">${UI.esc(ev.emoji)}</span>
        <span class="info"><span class="t">${UI.esc(ev.name)}${Ledger.inProgress(ev, todayStr()) ? ' <span class="live">IN CORSO</span>' : ''}</span>
          <small>${UI.esc([range(ev), `${ev.participants.length} ${ev.participants.length === 1 ? 'partecipante' : 'partecipanti'}`].filter(Boolean).join(' · '))}</small>
          <span class="avs">${UI.avatarMe(true)}${avs}</span></span>
        <span class="r">${F(sum.quota)}<small>tua quota</small></span></button>`;
    };
    const active = activeEvents().sort(sortEvents);
    const archived = cache.filter(e => e.archived).sort(sortEvents);
    $('#eventsPane').innerHTML =
      (active.length ? `<div class="event-list">${active.map(card).join('')}</div>`
        : '<div class="empty">Nessun evento attivo.<br>Raggruppa le spese di vacanze, picnic e uscite.</div>') +
      '<button class="btn-primary" data-act="new">＋ Nuovo evento</button>' +
      (archived.length ? `<button class="collapse-row" data-act="arch" aria-expanded="${showArchived}"><span>Archiviati · ${archived.length}</span><span>${showArchived ? '⌄' : '›'}</span></button>` +
        (showArchived ? `<div class="event-list">${archived.map(card).join('')}</div>` : '') : '');
  }

  // ---------- form nuovo / modifica (RF-E1…E3) ----------
  let draft = null;
  let formPeople = [];
  async function openForm(ev = null) {
    const t = TEMPLATES[0];
    draft = ev ? JSON.parse(JSON.stringify(ev))
      : { name: '', emoji: t.emoji, start: '', end: '', participants: [], defaultCat: t.cat, defaultSub: t.sub };
    formPeople = await People.recent();
    showView('event-form');
    const tpl = TEMPLATES.find(x => x.emoji === draft.emoji);
    $('#eventForm').innerHTML = `
      <h1 class="page-title">${ev ? 'Modifica evento' : 'Nuovo evento'}</h1>
      <div class="section-label first">MODELLO</div>
      <div class="tpl-grid">${TEMPLATES.map(x => `<button class="cat-btn tpl${tpl && tpl.key === x.key ? ' selected' : ''}" data-tpl="${x.key}"><span class="ico">${x.emoji}</span>${x.label}</button>`).join('')}</div>
      <div class="section-label">NOME</div>
      <input type="text" id="evName" maxlength="80" placeholder="Vacanza agosto" autocomplete="off" value="${UI.esc(draft.name)}">
      <div class="section-label">DATE (FACOLTATIVE)</div>
      <div class="field-list tight">
        <label class="field-row"><span>Dal</span><input type="date" id="evStart" value="${draft.start || ''}"></label>
        <label class="field-row"><span>Al</span><input type="date" id="evEnd" value="${draft.end && draft.end !== draft.start ? draft.end : ''}"></label>
      </div>
      <div class="chart-note">Per un evento di un giorno basta "Dal".</div>
      <div class="section-label">PARTECIPANTI</div>
      <input type="text" class="pick-search" id="evSearch" placeholder="Cerca o aggiungi persona…" autocomplete="off" aria-label="Cerca o aggiungi partecipante">
      <div class="pick-suggest" id="evSuggest"></div>
      <div class="chips" id="evChips"></div>
      ${ev ? '<div class="chart-note">Cambiare i partecipanti non modifica le spese già registrate.</div>' : ''}
      <div class="section-label">CATEGORIA PREDEFINITA</div>
      <div class="field-list tight">
        <label class="field-row"><span>Categoria</span><select id="evCat" class="row-select"><option value="">nessuna</option>
          ${CATEGORIES.map(c => `<option value="${c.id}"${c.id === draft.defaultCat ? ' selected' : ''}>${c.icon} ${UI.esc(c.name)}</option>`).join('')}</select></label>
        <label class="field-row"><span>Sottocategoria</span><select id="evSub" class="row-select"></select></label>
      </div>
      <div class="chart-note">È solo un suggerimento: nell'evento puoi registrare spese di qualsiasi categoria.</div>
      <button class="btn-primary" id="evSave">${ev ? 'Salva' : 'Crea evento'}</button>`;
    fillSubs();
    paintChips();
    $('#evSave').disabled = !draft.name.trim();
  }

  function fillSubs() {
    const cat = $('#evCat').value;
    const sel = $('#evSub');
    sel.innerHTML = `<option value="">nessuna</option>` + (cat ? catById(cat).subs.map(s => `<option${s === draft.defaultSub ? ' selected' : ''}>${UI.esc(s)}</option>`).join('') : '');
    sel.disabled = !cat;
  }
  function paintChips() {
    const m = new Map(formPeople.map(p => [p.id, p]));
    const ids = [...new Set([...draft.participants, ...formPeople.slice(0, 10).map(p => p.id)])];
    $('#evChips').innerHTML = ids.map(id => m.get(id)).filter(Boolean).map(p => `<button class="chip${draft.participants.includes(p.id) ? ' selected' : ''}" data-id="${UI.esc(p.id)}" aria-pressed="${draft.participants.includes(p.id)}">
      ${UI.avatar(p, true)}${UI.esc(p.name)}</button>`).join('') || '<div class="pick-hint">Scrivi un nome per aggiungere il primo partecipante.</div>';
  }
  function paintSuggest() {
    const q = $('#evSearch').value.trim(), k = q.toLocaleLowerCase('it-IT');
    if (!k) { $('#evSuggest').innerHTML = ''; return; }
    const matches = formPeople.filter(p => p.name.toLocaleLowerCase('it-IT').includes(k)).slice(0, 5);
    const exact = formPeople.find(p => p.name.toLocaleLowerCase('it-IT') === k);
    $('#evSuggest').innerHTML = matches.map(p => `<button class="pick-row" data-id="${UI.esc(p.id)}">${UI.avatar(p, true)}<span class="info"><b>${UI.esc(p.name)}</b></span>${draft.participants.includes(p.id) ? '<span class="tick">✓</span>' : ''}</button>`).join('') +
      (exact ? '' : `<button class="pick-row create" data-create="1">＋ Crea "${UI.esc(q)}"</button>`);
  }

  async function saveForm() {
    const name = $('#evName').value.trim().slice(0, 80);
    if (!name) return;
    const start = $('#evStart').value, end = $('#evEnd').value;
    if (end && !start) { toast('Indica anche la data di inizio'); return; }
    if (start && end && end < start) { toast('La data di fine è prima dell\'inizio'); return; }
    const prev = draft.id ? byId(draft.id) : null;
    const rec = { id: draft.id || People.uuid(), name, emoji: draft.emoji || '📌', participants: draft.participants,
      archived: prev ? prev.archived : false, createdAt: prev ? prev.createdAt : Date.now() };
    if (start) { rec.start = start; rec.end = end || start; } // un giorno: inizio = fine (RF-E1)
    const cat = $('#evCat').value, sub = $('#evSub').value;
    if (cat) { rec.defaultCat = cat; if (sub) rec.defaultSub = sub; }
    await DB.put('events', rec);
    await People.touch(rec.participants);
    toast(prev ? 'Evento aggiornato' : `Evento "${name}" creato`);
    openEvent(rec.id);
  }

  // ---------- scheda evento (RF-E5, E6) ----------
  async function openEvent(id) {
    openId = id; drill = null;
    showView('event');
    await renderEvent();
  }

  async function renderEvent() {
    await load();
    const ev = byId(openId);
    if (!ev) { showView('share'); return; }
    const [exps, sets, people] = await Promise.all([DB.allExpenses(), DB.all('settlements'), People.map()]);
    const sum = Ledger.eventSummary(ev.id, exps);
    const bal = Ledger.balances(exps, sets, { eventId: ev.id });
    const name = id => (people.get(id) || { name: 'Persona sconosciuta' }).name;

    // Per categoria, con dettaglio delle sottocategorie al tocco
    let bars = '';
    const entries = drill && sum.byCat[drill]
      ? Object.entries(sum.byCat[drill].subs).map(([s, v]) => ({ key: s, label: s, icon: '', color: catById(drill).color, v }))
      : Object.entries(sum.byCat).map(([k, x]) => ({ key: k, label: catById(k).name, icon: catById(k).icon, color: catById(k).color, v: x.total }));
    entries.sort((a, b) => b.v - a.v);
    const max = entries.length ? Math.max(...entries.map(x => x.v), 1) : 1;
    bars = entries.map(x => `<div class="hbar-row"${drill ? '' : ` data-cat="${x.key}"`}><span class="lbl">${x.icon} ${UI.esc(x.label)}</span>
      <div class="track"><div class="fill" style="width:${(x.v / max) * 100}%;background:${x.color}"></div></div><span class="val">${F(x.v)}</span></div>`).join('');

    const who = [...new Set([...ev.participants, ...bal.keys()])].filter(id => ev.participants.includes(id) || bal.get(id));
    const saldi = who.map(id => {
      const c = bal.get(id) || 0;
      return `<div class="ev-bal">${UI.avatar(people.get(id) || { id, name: '?' }, true)}<span class="nm">${UI.esc(name(id))}</span>
        <span class="v ${c > 0 ? 'pos' : c < 0 ? 'neg' : ''}">${N(c)}</span>${c ? `<button class="chip sm" data-settle="${UI.esc(id)}">Salda</button>` : '<span class="chip-sp"></span>'}</div>`;
    }).join('');

    const list = exps.filter(e => e.eventId === ev.id && e.type !== 'income').sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
    const rows = list.map(e => {
      const n = Ledger.normalize(e);
      const extra = e.payer ? `pagato da ${name(e.payer)}` : n.splits.length ? `👥 ${n.splits.length}` : '';
      return `<div class="exp-item" data-exp="${e.id}"><span class="ico">${catById(e.cat).icon}</span>
        <div class="info"><div class="cat">${UI.esc(e.sub)}</div><div class="note">${UI.esc([fmtDay(e.date), e.note, extra].filter(Boolean).join(' · '))}</div></div>
        ${n.paid !== e.amount || e.payer ? `<span class="amtcol"><span class="amt${e.amount === 0 ? ' zero' : ''}">${fmt(e.amount)}</span><small>${e.payer ? (e.payerTotal != null ? `su ${fmt(e.payerTotal)}` : 'dal conto 0,00 €') : `pagati ${fmt(n.paid)}`}</small></span>`
          : `<span class="amt">${fmt(e.amount)}</span>`}</div>`;
    }).join('');

    $('#eventBody').innerHTML = `
      <div class="person-hero">
        <div class="who"><span class="ev-ico sm">${UI.esc(ev.emoji)}</span><span>${UI.esc(ev.name)}</span>${ev.archived ? '<span class="tag">archiviato</span>' : ''}</div>
        <div class="lbl">Tua quota${range(ev) ? ' · ' + UI.esc(range(ev)) : ''}</div>
        <div class="big">${F(sum.quota)}</div>
        <div class="kpi3">
          <div><span class="lbl">Pagato da te</span><b>${F(sum.paidByMe)}</b></div>
          <div><span class="lbl">Pagato da altri per te</span><b>${F(sum.paidByOthers)}</b></div>
          <div><span class="lbl">Spese</span><b>${sum.count}</b></div>
        </div>
      </div>
      ${ev.archived ? '<div class="chart-note">Evento archiviato: riaprilo dal menu ⋯ per aggiungere spese.</div>'
        : '<button class="btn-primary" data-act="add">＋ Spesa in questo evento</button>'}
      ${entries.length ? `<div class="card ev-card"><h2>${drill ? `${catById(drill).icon} ${UI.esc(catById(drill).name)} <button class="btn-danger-link back-drill" data-act="undrill">← indietro</button>` : 'Per categoria'}</h2>${bars}</div>` : ''}
      ${who.length ? `<div class="card ev-card"><h2>Saldi generati in questo evento</h2>${saldi}
        <div class="chart-note">Solo informativo: il saldo vero è unico per persona e comprende anche gli altri movimenti.</div></div>` : ''}
      <h2>Spese</h2>
      ${rows ? `<div class="day-card">${rows}</div>` : '<div class="empty">Ancora nessuna spesa in questo evento.</div>'}`;
  }

  // ---------- gestione: modifica, archivia/riapri, elimina (RF-E8, E9) ----------
  async function manage() {
    await load();
    const ev = byId(openId);
    if (!ev) return;
    const n = (await DB.allExpenses()).filter(e => e.eventId === ev.id).length;
    const s = UI.sheet(`<h3>${UI.esc(ev.emoji)} ${UI.esc(ev.name)}</h3>
      <div class="pick-list">
        <button class="pick-row" data-act="edit"><span class="info"><b>Modifica</b><small>nome, date, partecipanti, categoria</small></span></button>
        <button class="pick-row" data-act="archive"><span class="info"><b>${ev.archived ? 'Riapri' : 'Archivia'}</b>
          <small>${ev.archived ? 'torna tra gli eventi attivi e nel wizard' : 'sparisce dal wizard, resta consultabile'}</small></span></button>
        <button class="pick-row danger" data-act="delete"><span class="info"><b>Elimina evento</b><small>le spese restano, perdono solo l'etichetta</small></span></button>
      </div>`, { label: 'Gestisci evento' });
    s.root.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      s.close();
      if (b.dataset.act === 'edit') openForm(ev);
      else if (b.dataset.act === 'archive') {
        await DB.put('events', { ...ev, archived: !ev.archived });
        if (!ev.archived && sticky === ev.id) sticky = undefined;
        toast(ev.archived ? 'Evento riaperto' : 'Evento archiviato');
        renderEvent();
      } else if (b.dataset.act === 'delete') {
        const ok = await UI.confirm({ title: `Eliminare "${ev.name}"?`,
          body: n ? `Le ${n === 1 ? 'spesa resta' : `${n} spese restano`} nei movimenti: perdono solo l'etichetta dell'evento.` : 'L\'evento non ha spese.',
          ok: 'Elimina', danger: true });
        if (!ok) return;
        const [exps, sets] = await Promise.all([DB.allExpenses(), DB.all('settlements')]);
        const strip = ({ eventId, ...r }) => r;
        await DB.applyChanges({
          put: { expenses: exps.filter(x => x.eventId === ev.id).map(strip), settlements: sets.filter(x => x.eventId === ev.id).map(strip) },
          del: { events: [ev.id] },
        });
        if (sticky === ev.id) sticky = undefined;
        if (current === ev.id) current = null;
        toast('Evento eliminato');
        showView('share');
      }
    });
  }

  // ---------- collegamenti ----------
  const onKey = fn => e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); } };
  const rowClick = e => {
    if (e.target.closest('[data-clear]')) { e.stopPropagation(); choose(null); return; }
    openPicker();
  };
  $('#eventRow').addEventListener('click', rowClick);
  $('#eventRow').addEventListener('keydown', onKey(rowClick));

  $('#eventsPane').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.id) openEvent(b.dataset.id);
    else if (b.dataset.act === 'new') openForm();
    else if (b.dataset.act === 'arch') { showArchived = !showArchived; renderList(); }
  });

  $('#eventForm').addEventListener('click', async e => {
    const t = e.target.closest('[data-tpl]');
    if (t) {
      const x = TEMPLATES.find(y => y.key === t.dataset.tpl);
      draft.emoji = x.emoji; draft.defaultCat = x.cat; draft.defaultSub = x.sub;
      document.querySelectorAll('#eventForm [data-tpl]').forEach(b => b.classList.toggle('selected', b === t));
      $('#evCat').value = x.cat;
      fillSubs();
      return;
    }
    const chip = e.target.closest('#evChips [data-id]');
    if (chip) {
      const id = chip.dataset.id, i = draft.participants.indexOf(id);
      if (i >= 0) draft.participants.splice(i, 1); else draft.participants.push(id);
      paintChips();
      return;
    }
    const sug = e.target.closest('#evSuggest button');
    if (sug) {
      if (sug.dataset.create) { const p = await People.create($('#evSearch').value); formPeople = await People.recent(); if (!draft.participants.includes(p.id)) draft.participants.push(p.id); }
      else if (!draft.participants.includes(sug.dataset.id)) draft.participants.push(sug.dataset.id);
      $('#evSearch').value = '';
      paintSuggest(); paintChips();
      $('#evSearch').focus();
      return;
    }
    if (e.target.closest('#evSave')) saveForm();
  });
  $('#eventForm').addEventListener('input', e => {
    if (e.target.id === 'evName') { draft.name = e.target.value; $('#evSave').disabled = !e.target.value.trim(); }
    if (e.target.id === 'evSearch') paintSuggest();
  });
  $('#eventForm').addEventListener('change', e => {
    if (e.target.id === 'evCat') { draft.defaultCat = e.target.value; draft.defaultSub = ''; fillSubs(); }
    if (e.target.id === 'evSub') draft.defaultSub = e.target.value;
  });
  $('#eventForm').addEventListener('keydown', e => {
    if (e.target.id === 'evSearch' && e.key === 'Enter') { e.preventDefault(); const b = $('#evSuggest button'); if (b) b.click(); }
  });

  $('#eventBody').addEventListener('click', e => {
    const ev = byId(openId);
    if (!ev) return;
    if (e.target.closest('[data-act=add]')) {
      sticky = ev.id;      // RF-E5: lo stesso wizard, con l'evento selezionato
      resetAddForm();
      showView('add');
      return;
    }
    if (e.target.closest('[data-act=undrill]')) { drill = null; renderEvent(); return; }
    const cat = e.target.closest('[data-cat]');
    if (cat) { drill = cat.dataset.cat; renderEvent(); return; }
    const st = e.target.closest('[data-settle]');
    if (st) { // RF-E6: "Salda" porta alla scheda persona con l'evento già indicato
      PeopleUI.openPerson(st.dataset.settle).then(() => PeopleUI.openSettlement(st.dataset.settle, { eventId: ev.id }));
      return;
    }
    const row = e.target.closest('[data-exp]');
    if (row) DB.allExpenses().then(all => { const x = all.find(y => y.id === +row.dataset.exp); if (x) startEdit(x); });
  });
  $('#eventMore').addEventListener('click', manage);

  reset(); // all'avvio: evento in corso oggi (RF-W2)

  return { currentId, render, reset, load: loadFrom, afterSave, renderList, openEvent };
})();
