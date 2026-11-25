// Wizard "Aggiungi": righe "Pagato da" e "Diviso con" con i loro pannelli (F3).
// Caricato DOPO app.js: usa $, fmt, selType, parseAmount, updateSaveState.
// Il calcolo vero (centesimi, resto a me, validazioni) è in Ledger.planSplit.
const Split = (() => {
  const fresh = () => ({ payer: null, people: [], mode: 'equal', notMe: false, exact: {} });
  let st = fresh();
  let names = new Map(); // id → persona, per i riepiloghi (aggiornata a ogni render)

  const totalCents = () => { const v = parseAmount($('#amountInput').value); return v ? Money.toCents(v) : 0; };
  const isExpense = () => selType === 'expense';
  const inUse = () => isExpense() && (st.payer || st.people.length);
  const money = cents => fmt(cents / 100);
  const nameOf = id => (names.get(id) || { name: 'Persona sconosciuta' }).name;

  // ---------- stato ----------
  function reset() { st = fresh(); render(); }

  // Carica lo split di un movimento in modifica; restituisce l'importo da mostrare (RF-W11).
  function load(e) {
    st = fresh();
    if (e.type !== 'income') {
      if (e.payer) st.payer = e.payer;
      else if (Array.isArray(e.splits) && e.splits.length) {
        st.people = e.splits.map(s => s.personId);
        st.mode = e.splitMode === 'exact' ? 'exact' : 'equal';
        st.notMe = e.amount === 0;
        if (st.mode === 'exact') st.exact = Object.fromEntries(e.splits.map(s => [s.personId, Money.toCents(s.amount)]));
      }
    }
    render();
    return e.payer ? e.amount : (e.paid != null ? e.paid : e.amount);
  }

  // Preimposta chi ha pagato (scorciatoia "Ha pagato per me" dalla scheda persona, RF-P5).
  function setPayer(id) { st = fresh(); st.payer = id; render(); }

  // Campi da salvare: { fields } oppure { error }. Per le entrate solo l'importo.
  function plan() {
    if (!isExpense()) return { fields: { amount: totalCents() / 100 } };
    return Ledger.planSplit(totalCents(), st);
  }
  const isValid = () => { const p = plan(); return !p.error || p.error === 'total'; };
  const usedPeople = () => (st.payer ? [st.payer] : st.people);

  // Testo breve per conferme e toast: "pagati 80,00 €" / "pagato da Marco".
  function note(rec) {
    if (rec.payer) return `pagato da ${nameOf(rec.payer)}`;
    if (rec.paid != null && rec.paid !== rec.amount) return `pagati ${fmt(rec.paid)}`;
    return '';
  }

  const ERR = {
    over: p => `Le quote degli altri (${money(p.sum)}) superano il totale pagato (${money(totalCents())}).`,
    'notme-sum': p => `Con "Non partecipo" le quote devono fare ${money(totalCents())} (ora ${money(p.sum)}).`,
    'no-others': () => 'Scegli almeno una persona con cui dividere.',
    amount: () => 'Controlla gli importi delle quote.',
  };

  // ---------- righe del wizard ----------
  async function render() {
    names = await People.map();
    const exp = isExpense();
    $('#payerRow').hidden = !exp;
    $('#splitRow').hidden = !exp || !!st.payer;          // RV-3
    $('#payerRow').classList.toggle('sel', !!st.payer);
    $('#splitRow').classList.toggle('sel', st.people.length > 0);
    $('#payerVal').innerHTML = st.payer
      ? `${UI.avatar(names.get(st.payer) || { id: st.payer, name: '?' }, true)} ${UI.esc(nameOf(st.payer))} <span class="chev">›</span>`
      : 'Io <span class="chev">›</span>';
    $('#payerVal').classList.toggle('on', true);
    const ppl = st.people.map(id => names.get(id) || { id, name: '?' });
    $('#splitVal').innerHTML = ppl.length
      ? `${ppl.slice(0, 3).map(p => UI.avatar(p, true)).join('')} ${UI.esc(ppl.length <= 2 ? ppl.map(p => p.name).join(', ') : `${ppl.length} persone`)} <span class="chev">›</span>`
      : 'nessuno <span class="chev">›</span>';
    $('#splitVal').classList.toggle('on', ppl.length > 0);
    $('#amountLabel').textContent = !exp ? 'Importo' : st.payer ? 'La tua quota' : st.people.length ? 'Importo pagato' : 'Importo';

    const sum = $('#splitSummary');
    sum.classList.remove('err');
    if (!inUse()) { sum.hidden = true; sum.innerHTML = ''; }
    else {
      const p = plan();
      sum.hidden = false;
      if (p.error && p.error !== 'total') {
        sum.classList.add('err');
        sum.innerHTML = `<span>${UI.esc(ERR[p.error] ? ERR[p.error](p) : 'Divisione non valida')}</span>`;
      } else if (st.payer) {
        sum.innerHTML = `<span>dal tuo conto <b>0,00 €</b></span><span>saldo ${UI.esc(nameOf(st.payer))} −${money(totalCents())}</span>`;
      } else {
        const how = st.mode === 'exact' ? 'importi esatti' : st.notMe ? `diviso tra ${st.people.length}, non partecipi`
          : `diviso in ${st.people.length + 1} parti uguali`;
        const mine = p.fields ? Money.toCents(p.fields.amount) : 0;
        sum.innerHTML = `<span>👥 ${how}</span><span>tua quota <b>${money(mine)}</b></span>`;
      }
    }
    if (typeof updateSaveState === 'function') updateSaveState();
  }

  // ---------- pannello "Chi ha pagato?" ----------
  async function openPayer() {
    const [people, exps, sets] = await Promise.all([People.recent(), DB.allExpenses(), DB.all('settlements')]);
    const bal = Ledger.balances(exps, sets);
    const balTxt = id => { const c = bal.get(id) || 0; return c > 0 ? `ti deve ${money(c)}` : c < 0 ? `devi ${money(-c)}` : 'in pari'; };
    const s = UI.sheet(`
      <h3>Chi ha pagato?</h3>
      <div class="sheet-sub">Se ha pagato un'altra persona, l'importo è solo la tua quota.</div>
      <input type="text" class="pick-search" placeholder="Cerca o aggiungi persona…" autocomplete="off" aria-label="Cerca persona">
      <div class="pick-list" role="listbox"></div>`, { label: 'Chi ha pagato?' });
    const list = s.root.querySelector('.pick-list'), q = s.root.querySelector('.pick-search');
    const choose = id => {
      st.payer = id;
      if (id) { st.people = []; st.notMe = false; st.exact = {}; st.mode = 'equal'; }
      s.close();
      render();
    };
    const paint = () => {
      const k = q.value.trim().toLocaleLowerCase('it-IT');
      const rows = people.filter(p => !k || p.name.toLocaleLowerCase('it-IT').includes(k));
      const exact = people.find(p => p.name.toLocaleLowerCase('it-IT') === k);
      list.innerHTML =
        (k ? '' : `<button class="pick-row${st.payer ? '' : ' on'}" data-id="">${UI.avatarMe()}<span class="info"><b>Io</b></span></button>`) +
        rows.map(p => `<button class="pick-row${st.payer === p.id ? ' on' : ''}" data-id="${UI.esc(p.id)}">${UI.avatar(p)}
          <span class="info"><b>${UI.esc(p.name)}</b><small>${balTxt(p.id)}</small></span></button>`).join('') +
        (k && !exact ? `<button class="pick-row create" data-create="1">＋ Crea "${UI.esc(q.value.trim())}"</button>` : '');
    };
    list.addEventListener('click', async e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.create) { const p = await People.create(q.value); choose(p.id); }
      else choose(b.dataset.id || null);
    });
    q.addEventListener('input', paint);
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const b = list.querySelector('.pick-row'); if (b) b.click(); } });
    paint();
  }

  // ---------- pannello "Diviso con" ----------
  async function openSplit() {
    const draft = JSON.parse(JSON.stringify(st));
    let people = await People.recent();
    const total = totalCents();
    const s = UI.sheet(`
      <h3>Diviso con</h3>
      <div class="sheet-sub">${total ? `Totale pagato ${money(total)}` : 'Inserisci l\'importo per vedere le quote'}</div>
      <input type="text" class="pick-search" placeholder="Cerca o aggiungi persona…" autocomplete="off" aria-label="Cerca o aggiungi persona">
      <div class="pick-suggest"></div>
      <div class="chips"></div>
      <div class="opt-list">
        <label class="opt-row"><span>Importi esatti<small>altrimenti parti uguali</small></span><input type="checkbox" class="switch" data-opt="exact"></label>
        <label class="opt-row"><span>Non partecipo<small>anticipo puro: la tua quota è 0</small></span><input type="checkbox" class="switch" data-opt="notMe"></label>
      </div>
      <div class="split-rows"></div>
      <div class="sheet-warn" data-err hidden></div>
      <button class="btn-primary" data-ok>Conferma</button>
      <button class="sheet-cancel" data-cancel>${st.people.length ? 'Togli la divisione' : 'Annulla'}</button>`, { label: 'Diviso con' });
    const R = sel => s.root.querySelector(sel);
    const q = R('.pick-search'), sug = R('.pick-suggest'), chips = R('.chips'), rows = R('.split-rows'), err = R('[data-err]'), ok = R('[data-ok]');
    const byId = () => new Map(people.map(p => [p.id, p]));
    R('[data-opt=exact]').checked = draft.mode === 'exact';
    R('[data-opt=notMe]').checked = draft.notMe;

    const toggle = id => {
      const i = draft.people.indexOf(id);
      if (i >= 0) { draft.people.splice(i, 1); delete draft.exact[id]; } else draft.people.push(id);
      paintChips(); paintRows();
    };
    const paintChips = () => {
      const m = byId();
      const shown = [...new Set([...draft.people, ...people.slice(0, 10).map(p => p.id)])].map(id => m.get(id)).filter(Boolean);
      chips.innerHTML = shown.map(p => `<button class="chip${draft.people.includes(p.id) ? ' selected' : ''}" data-id="${UI.esc(p.id)}" aria-pressed="${draft.people.includes(p.id)}">
        ${UI.avatar(p, true)}${UI.esc(p.name)}</button>`).join('') || '<div class="pick-hint">Scrivi un nome per aggiungere la prima persona.</div>';
    };
    const paintSuggest = () => {
      const k = q.value.trim().toLocaleLowerCase('it-IT');
      if (!k) { sug.innerHTML = ''; return; }
      const matches = people.filter(p => p.name.toLocaleLowerCase('it-IT').includes(k)).slice(0, 5);
      const exact = people.find(p => p.name.toLocaleLowerCase('it-IT') === k);
      sug.innerHTML = matches.map(p => `<button class="pick-row" data-id="${UI.esc(p.id)}">${UI.avatar(p, true)}<span class="info"><b>${UI.esc(p.name)}</b></span>${draft.people.includes(p.id) ? '<span class="tick">✓</span>' : ''}</button>`).join('') +
        (exact ? '' : `<button class="pick-row create" data-create="1">＋ Crea "${UI.esc(q.value.trim())}"</button>`);
    };
    // Righe delle quote. In "importi esatti" gli input non vengono ridisegnati mentre
    // si scrive (perderebbero il focus): si aggiornano solo residuo ed errore.
    const paintRows = () => {
      const m = byId();
      if (!draft.people.length) { rows.innerHTML = ''; status(); return; }
      if (draft.mode === 'exact') {
        rows.innerHTML = draft.people.map(id => `<div class="split-row">${UI.avatar(m.get(id) || { id, name: '?' }, true)}<span class="nm">${UI.esc((m.get(id) || {}).name || '?')}</span>
          <input class="split-inp" inputmode="decimal" data-id="${UI.esc(id)}" value="${draft.exact[id] ? String(draft.exact[id] / 100).replace('.', ',') : ''}" placeholder="0,00" aria-label="Quota di ${UI.esc((m.get(id) || {}).name || '')}"></div>`).join('') +
          `<div class="split-row me">${UI.avatarMe(true)}<span class="nm">Tu<small>calcolato</small></span><span class="q" data-me></span></div>`;
      } else {
        const eq = Money.splitEqual(total, draft.people.length, !draft.notMe);
        rows.innerHTML = draft.people.map((id, i) => `<div class="split-row">${UI.avatar(m.get(id) || { id, name: '?' }, true)}<span class="nm">${UI.esc((m.get(id) || {}).name || '?')}</span><span class="q">${money(eq.others[i])}</span></div>`).join('') +
          `<div class="split-row me">${UI.avatarMe(true)}<span class="nm">Tu${!draft.notMe && eq.me !== eq.others[0] ? '<small>+ arrotondamento</small>' : ''}</span><span class="q">${money(eq.me)}</span></div>`;
      }
      status();
    };
    const status = () => {
      const p = Ledger.planSplit(total || 0, draft);
      const real = p.error && p.error !== 'total' && !(p.error === 'no-others' && !draft.people.length && !draft.notMe);
      err.hidden = !real;
      err.textContent = real ? (ERR[p.error] ? ERR[p.error](p) : 'Divisione non valida') : '';
      ok.disabled = !!real;
      const me = R('[data-me]');
      if (me) {
        const sum = Money.sum(draft.people.map(id => draft.exact[id] || 0));
        me.textContent = money((total || 0) - sum);
        me.classList.toggle('neg', (total || 0) - sum < 0);
      }
    };

    chips.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) toggle(b.dataset.id); });
    sug.addEventListener('click', async e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.create) {
        const p = await People.create(q.value);
        people = await People.recent();
        if (!draft.people.includes(p.id)) draft.people.push(p.id);
        paintChips(); paintRows();
      } else if (!draft.people.includes(b.dataset.id)) toggle(b.dataset.id);
      q.value = '';
      paintSuggest();
      q.focus();
    });
    q.addEventListener('input', paintSuggest);
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const b = sug.querySelector('button'); if (b) b.click(); } });
    R('[data-opt=exact]').addEventListener('change', e => {
      draft.mode = e.target.checked ? 'exact' : 'equal';
      if (draft.mode === 'exact') { // parto dalle quote uguali attuali
        const eq = Money.splitEqual(total, Math.max(draft.people.length, 1), !draft.notMe);
        draft.people.forEach((id, i) => { if (draft.exact[id] == null) draft.exact[id] = eq.others[i] || 0; });
      }
      paintRows();
    });
    R('[data-opt=notMe]').addEventListener('change', e => { draft.notMe = e.target.checked; paintRows(); });
    rows.addEventListener('input', e => {
      const inp = e.target.closest('.split-inp');
      if (!inp) return;
      const c = inp.value.trim() ? Money.toCents(inp.value.replace(/[€\s]/g, '')) : 0;
      draft.exact[inp.dataset.id] = Number.isFinite(c) && c >= 0 ? c : -1;
      status();
    });
    ok.addEventListener('click', () => {
      if (!draft.people.length) { draft.notMe = false; draft.mode = 'equal'; draft.exact = {}; }
      st = draft;
      s.close();
      render();
    });
    R('[data-cancel]').addEventListener('click', () => {
      if (st.people.length) { st.people = []; st.notMe = false; st.exact = {}; st.mode = 'equal'; render(); }
      s.close();
    });
    paintChips(); paintRows();
  }

  // ---------- RF-S2: modifica/cancellazione che cambia il segno di un saldo ----------
  // newRec = record dopo la modifica (null = cancellazione). → Promise<boolean>
  async function confirmBalanceChange(id, newRec) {
    const [exps, sets, m] = await Promise.all([DB.allExpenses(), DB.all('settlements'), People.map()]);
    const before = Ledger.balances(exps, sets);
    const after = Ledger.balances(exps.filter(e => e.id !== id).concat(newRec ? [newRec] : []), sets);
    const flips = Ledger.signFlips(before, after);
    if (!flips.length) return true;
    const lbl = c => (c > 0 ? 'ti deve' : c < 0 ? 'devi' : 'in pari');
    const body = flips.map(f => {
      const n = UI.esc((m.get(f.personId) || { name: 'Persona sconosciuta' }).name);
      return `<p class="dialog-p">${f.before === 0 ? `${n} era in pari` : `Con ${n} il saldo cambia verso`}: ora <b>${f.after < 0 ? `risulterai tu debitore` : `${n} risulterà debitore`}</b>.</p>
        <div class="diff"><div><span class="lbl">Prima</span><b>${money(Math.abs(f.before))}</b><span class="lbl">${lbl(f.before)}</span></div>
        <span class="arrow">→</span><div><span class="lbl">Dopo</span><b class="${f.after < 0 ? 'neg' : 'pos'}">${money(Math.abs(f.after))}</b><span class="lbl">${lbl(f.after)}</span></div></div>`;
    }).join('');
    return UI.confirm({ title: flips.length === 1 ? `Attenzione al saldo di ${(m.get(flips[0].personId) || { name: '' }).name}` : 'Attenzione ai saldi',
      body, ok: newRec ? 'Salva comunque' : 'Elimina comunque' });
  }

  // ---------- collegamenti ----------
  const onKey = fn => e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
  $('#payerRow').addEventListener('click', openPayer);
  $('#payerRow').addEventListener('keydown', onKey(openPayer));
  $('#splitRow').addEventListener('click', openSplit);
  $('#splitRow').addEventListener('keydown', onKey(openSplit));
  $('#amountInput').addEventListener('input', () => { if (inUse()) render(); });
  render();

  return { reset, load, setPayer, plan, isValid, usedPeople, note, render, confirmBalanceChange };
})();
