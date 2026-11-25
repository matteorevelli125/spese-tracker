// Golden test, passo 2: gira DENTRO l'app (stesso realm degli script), quindi
// vede le sue variabili globali (periodOffset, drillCat, statFilter...) e le sue
// funzioni di render. Legge dalla pagina tutto ciò che mostra numeri e lo
// invia al server come JSON. Non modifica i dati.
//
// ATTENZIONE: è accoppiato agli interni di app.js. Se una fase rinomina una
// funzione o un id qui sotto, aggiornare il probe nella stessa PR, mantenendo
// le stesse chiavi nello snapshot.
(async () => {
  const qs = new URLSearchParams(location.search);
  if (!qs.get('golden')) return;
  const label = qs.get('label');
  const startNow = qs.get('now');
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99;padding:8px 12px;background:#000;color:#fff;font:600 12px/1.3 system-ui';
  document.body.appendChild(banner);
  const say = t => { banner.textContent = 'GOLDEN · ' + t; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const txt = sel => { const el = document.querySelector(sel); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; };
  // Larghezze/altezze delle barre: catturano grafici che cambiano anche a testo uguale.
  const geo = sel => {
    const el = document.querySelector(sel);
    return el ? [...el.querySelectorAll('[style]')].map(n => n.getAttribute('style')).join('|') : null;
  };
  const pick = sels => Object.fromEntries(sels.map(s => [s, txt(s)]));

  try {
    say('attendo la fine dell\'avvio dell\'app…');
    // L'avvio inserisce le ricorrenti scadute: aspetto che il numero di movimenti si stabilizzi.
    let prev = -1;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      const n = (await DB.allExpenses()).length;
      if (n === prev) break;
      prev = n;
    }

    const out = { label, now: startNow, generated: new Date().toISOString(), sections: {} };
    const S = out.sections;
    const all = await DB.allExpenses();
    out.count = { expenses: all.length, budgets: (await DB.allBudgets()).length, recurring: (await DB.allRecurring()).length };
    if (!all.length) throw new Error('nessun movimento nel DB');
    const minDate = all.reduce((m, e) => (e.date < m ? e.date : m), '9999-99-99');

    // ---- Statistiche: ogni periodo di ogni tipo, da oggi indietro fino al primo dato ----
    statFilter.clear();
    for (const type of ['day', 'week', 'month', 'year']) {
      $('#periodType').value = type;
      for (let off = 0; periodRange(type, off).to >= minDate; off--) {
        periodOffset = off;
        drillCat = null;
        await renderStats();
        const key = `stats.${type}.${off}`;
        S[key] = {
          ...pick(['#periodLabel', '#statTotal', '#statCompare', '#statBalance', '#catBars', '#trendChart']),
          geoCatBars: geo('#catBars'), geoTrend: geo('#trendChart'),
        };
        if (type === 'month' || type === 'year') {
          // Solo le categorie con spese nel periodo: è ciò che l'utente può toccare.
          // Dettaglio solo delle categorie presenti nel periodo (chiavi stabili; il crash su categoria vuota è corretto dalla v25).
          const r = periodRange(type, off);
          const present = new Set((await DB.expensesBetween(r.from, r.to)).filter(e => !isIncome(e)).map(e => e.cat));
          for (const c of CATEGORIES.filter(c => present.has(c.id))) {
            drillCat = c.id;
            await renderStats();
            S[`${key}.drill.${c.id}`] = { '#catBars': txt('#catBars'), geoCatBars: geo('#catBars') };
          }
          drillCat = null;
        }
        if (off % 20 === 0) say(`statistiche ${type} ${off}`);
      }
    }
    periodOffset = 0;
    $('#periodType').value = 'month';

    // ---- Viste che dipendono da "oggi": insight, budget, obiettivo, cruscotto annuale ----
    const [y0, m0] = minDate.split('-').map(Number);
    const [y1, m1] = startNow.split('-').map(Number);
    const pad = n => String(n).padStart(2, '0');
    for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? (y++, m = 1) : m++) {
      const last = new Date(y, m, 0).getDate();
      const days = [1, 15, last].map(d => `${y}-${pad(m)}-${pad(d)}`);
      if (y === y1 && m === m1) days.push(startNow);
      for (const day of [...new Set(days)].sort()) {
        if (day > startNow) continue;
        const d = Number(day.slice(8));
        window.__goldenSetNow(day);
        await renderInsights();
        await renderBudget();
        await renderGoal();
        S[`now.${day}`] = {
          ...pick(['#insightWrap', '#budgetSummary', '#budgetProgress', '#goalWrap']),
          geoBudget: geo('#budgetProgress'),
        };
        if (d === last || day === startNow) {
          await renderYearDashboard();
          S[`dash.${day}`] = pick(['#dashYear', '#dashKpi', '#tblMonthly', '#tblCatMonth']);
        }
      }
      say(`viste per data ${y}-${pad(m)}`);
    }
    window.__goldenSetNow(startNow);

    // ---- Saldo cumulato e Movimenti ----
    await renderCumulative();
    S.cumulative = { '#cumulativeChart': txt('#cumulativeChart'), geo: geo('#cumulativeChart') };
    $('#searchInput').value = '';
    await renderList();
    S.list = { '#expList': txt('#expList') };

    say('invio lo snapshot…');
    const res = await fetch(`/__golden/save?label=${encodeURIComponent(label)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out, null, 1),
    });
    if (!res.ok) throw new Error('salvataggio fallito: HTTP ' + res.status);
    document.title = 'GOLDEN DONE';
    say(`fatto: ${Object.keys(S).length} viste misurate, ${all.length} movimenti`);
  } catch (err) {
    document.title = 'GOLDEN ERRORE';
    say('ERRORE: ' + err.message);
    console.error(err);
  }
})();
