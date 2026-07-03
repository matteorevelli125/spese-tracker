/**
 * Export storico da Wallet (BudgetBakers) → JSON importabile in Spese Tracker.
 *
 * USO:
 * 1. Apri https://web.budgetbakers.com e vai sulla pagina "Records".
 * 2. Imposta il filtro periodo più ampio possibile (es. "All time") così
 *    la lista contiene tutto lo storico.
 * 3. Apri la console di Chrome (F12 → Console), incolla TUTTO questo file
 *    e premi Invio.
 * 4. Lo script scorre automaticamente la lista per caricare tutti i record,
 *    poi scarica "wallet-import.json".
 * 5. Nell'app Spese Tracker: Altro → "Importa backup JSON" → seleziona il file.
 *
 * Se qualche categoria non viene riconosciuta finisce in "Altro / Varie":
 * lo script stampa in console l'elenco delle categorie non mappate, così
 * possiamo estendere WALLET_MAP qui sotto.
 */
(async function walletExport() {
  'use strict';

  // ---- Mappatura categorie Wallet → categorie Spese Tracker (cat, sub) ----
  // Chiave: nome categoria/sottocategoria come appare in Wallet (case-insensitive).
  const WALLET_MAP = {
    // Automobile
    'fuel': ['auto', 'Carburante'], 'carburante': ['auto', 'Carburante'],
    'parking': ['auto', 'Parcheggio'], 'parcheggio': ['auto', 'Parcheggio'],
    'vehicle maintenance': ['auto', 'Manutenzione'], 'manutenzione veicolo': ['auto', 'Manutenzione'],
    'vehicle insurance': ['auto', 'Assicurazione'], 'assicurazione veicolo': ['auto', 'Assicurazione'],
    'pedaggi': ['auto', 'Pedaggi'], 'tolls': ['auto', 'Pedaggi'],
    'vehicle': ['auto', 'Manutenzione'], 'veicolo': ['auto', 'Manutenzione'],
    // Cibo
    'groceries': ['cibo', 'Spesa'], 'spesa': ['cibo', 'Spesa'], 'alimentari': ['cibo', 'Spesa'],
    'restaurant, fast-food': ['cibo', 'Ristorante'], 'ristorante, fast food': ['cibo', 'Ristorante'],
    'restaurant': ['cibo', 'Ristorante'], 'ristorante': ['cibo', 'Ristorante'],
    'ristorante, fast-food': ['cibo', 'Ristorante'],
    'bar, cafe': ['cibo', 'Bar e caffè'], 'bar, caffè': ['cibo', 'Bar e caffè'],
    'food & drinks': ['cibo', 'Spesa'], 'cibo e bevande': ['cibo', 'Spesa'],
    // Casa
    'rent': ['casa', 'Affitto / Mutuo'], 'affitto': ['casa', 'Affitto / Mutuo'],
    'mortgage': ['casa', 'Affitto / Mutuo'], 'mutuo': ['casa', 'Affitto / Mutuo'],
    'energy, utilities': ['casa', 'Bollette'], 'energia, utenze': ['casa', 'Bollette'],
    'utilities': ['casa', 'Bollette'], 'bollette': ['casa', 'Bollette'],
    'internet': ['casa', 'Bollette'], 'phone, cell phone': ['casa', 'Bollette'],
    'telefonia, cellulare': ['casa', 'Bollette'],
    'home improvement': ['casa', 'Manutenzione'], 'furniture': ['casa', 'Arredamento'],
    'housing': ['casa', 'Bollette'], 'casa': ['casa', 'Bollette'],
    // Svago
    'life & entertainment': ['svago', 'Cinema e eventi'], 'vita e intrattenimento': ['svago', 'Cinema e eventi'],
    'tv, streaming': ['svago', 'Abbonamenti'], 'subscriptions': ['svago', 'Abbonamenti'], 'abbonamenti': ['svago', 'Abbonamenti'],
    'active sport, fitness': ['svago', 'Sport'], 'sport': ['svago', 'Sport'],
    'hobbies': ['svago', 'Hobby'], 'hobby': ['svago', 'Hobby'],
    'books, audio, subscriptions': ['svago', 'Libri e giochi'],
    'culture, sport events': ['svago', 'Cinema e eventi'],
    'holiday, trips, hotels': ['viaggi', 'Alloggio'],
    // Salute
    'health care, doctor': ['salute', 'Visite mediche'], 'salute, medico': ['salute', 'Visite mediche'],
    'drug-store, chemist': ['salute', 'Farmacia'], 'farmacia': ['salute', 'Farmacia'],
    'beauty': ['salute', 'Cura personale'], 'wellness, beauty': ['salute', 'Cura personale'],
    // Abbigliamento
    'clothes & footwear': ['abbigliamento', 'Vestiti'], 'abbigliamento e calzature': ['abbigliamento', 'Vestiti'],
    'clothes': ['abbigliamento', 'Vestiti'], 'shoes': ['abbigliamento', 'Scarpe'],
    'jewels, accessories': ['abbigliamento', 'Accessori'],
    'shopping': ['abbigliamento', 'Vestiti'],
    // Trasporti
    'public transport': ['trasporti', 'Bus e metro'], 'trasporto pubblico': ['trasporti', 'Bus e metro'],
    'taxi': ['trasporti', 'Taxi'], 'long distance': ['trasporti', 'Treno'],
    'transportation': ['trasporti', 'Bus e metro'], 'trasporti': ['trasporti', 'Bus e metro'],
    // Regali
    'gifts, joy': ['regali', 'Regali'], 'regali': ['regali', 'Regali'],
    'charity, gifts': ['regali', 'Donazioni'],
    // Altro
    'financial expenses': ['altro', 'Commissioni bancarie'], 'spese finanziarie': ['altro', 'Commissioni bancarie'],
    'charges, fees': ['altro', 'Commissioni bancarie'],
    'taxes': ['altro', 'Tasse'], 'tasse': ['altro', 'Tasse'],
    'others': ['altro', 'Varie'], 'altro': ['altro', 'Varie'], 'unknown': ['altro', 'Varie'],
    // Categorie italiane osservate nell'export reale di Wallet
    'generi alimentari': ['cibo', 'Spesa'],
    'lunga distanza': ['trasporti', 'Treno'],
    'tempo libero': ['svago', 'Hobby'],
    'vacanze, viaggi, hotel': ['viaggi', 'Alloggio'],
    'finanziamento auto': ['auto', 'Finanziamento'],
    'spese condominiali': ['casa', 'Condominio'],
    'regali, piaceri': ['regali', 'Regali'],
    'salute e bellezza': ['salute', 'Cura personale'],
    'benessere, bellezza': ['salute', 'Cura personale'],
    'drogheria, farmacia': ['salute', 'Farmacia'],
    'cultura, eventi sportivi': ['svago', 'Cinema e eventi'],
    'manutenzione veicoli': ['auto', 'Manutenzione'],
    'casa, giardino': ['casa', 'Manutenzione'],
    'multe': ['altro', 'Tasse'],
  };

  const mapCategory = name => {
    const k = (name || '').trim().toLowerCase();
    return WALLET_MAP[k] || null;
  };

  // ---- 1. Trova il contenitore scrollabile della lista record ----
  const scrollables = [...document.querySelectorAll('*')].filter(el => {
    const s = getComputedStyle(el);
    return (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50;
  });
  const scroller = scrollables.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] || document.scrollingElement;
  console.log('[wallet-export] contenitore scroll:', scroller);

  // ---- 2. Auto-scroll per caricare tutto lo storico (lazy loading) ----
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let lastH = -1, stable = 0;
  while (stable < 5) { // esce dopo 5 giri senza nuovi contenuti
    scroller.scrollTop = scroller.scrollHeight;
    await sleep(700);
    if (scroller.scrollHeight === lastH) stable++;
    else { stable = 0; lastH = scroller.scrollHeight; }
  }
  console.log('[wallet-export] scroll completato, altezza:', lastH);

  // ---- 3. Parsing dei record dal DOM ----
  // Wallet renderizza OGNI record due volte (layout desktop "md:grid" e
  // layout mobile "md:hidden" alternati via CSS): usiamo solo la variante
  // mobile, che contiene data e ora complete (es. "02/07/2026 13:49"), e
  // recuperiamo l'eventuale nota dalla variante desktop gemella che la precede.
  const allRows = [...document.querySelectorAll('button[aria-label="edit_record"]')].map(b => b.parentElement);
  const mobileRows = allRows.filter(r => r.className.includes('md:hidden'));
  console.log(`[wallet-export] righe totali (doppie): ${allRows.length}, record unici: ${mobileRows.length}`);

  const expenses = [];
  const unmapped = new Map();
  const pad2 = n => String(n).padStart(2, '0');

  for (const row of mobileRows) {
    const rowText = t => (t ? t.textContent.replace(/ /g, ' ').trim() : '');
    // importo: <p> con lo <span> che contiene €
    const amtEl = [...row.querySelectorAll('p')].find(p => /€/.test(p.textContent));
    if (!amtEl) continue;
    const amtText = rowText(amtEl);
    if (!amtText.startsWith('-')) continue; // solo uscite
    const amount = Math.abs(parseFloat(amtText.replace(/[€\s-]/g, '').replace(/\./g, '').replace(',', '.')));
    if (!isFinite(amount) || amount === 0) continue;
    // data: "dd/mm/yyyy hh:mm" nell'ultimo <p>
    const dm = row.textContent.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!dm) continue;
    const date = `${dm[3]}-${dm[2]}-${dm[1]}`;
    // categoria: primo <p data-line-clamp> (il secondo è il conto)
    const catName = rowText(row.querySelector('p[data-line-clamp]'));
    // nota: nella variante desktop gemella (riga precedente), il <p> "dimmed"
    // subito dopo il nome categoria
    let note = '';
    const twin = row.previousElementSibling;
    if (twin && twin.querySelector('button[aria-label="edit_record"]')) {
      const ps = [...twin.querySelectorAll('p[data-line-clamp]')];
      const ci = ps.findIndex(p => rowText(p) === catName);
      if (ci >= 0 && ps[ci + 1]) note = rowText(ps[ci + 1]);
    }
    const mapped = mapCategory(catName);
    if (!mapped) unmapped.set(catName, (unmapped.get(catName) || 0) + 1);
    const [cat, sub] = mapped || ['altro', 'Varie'];
    expenses.push({ date, amount, cat, sub,
      note: mapped ? note : `${catName}${note ? ' · ' + note : ''}`,
      ts: Date.now() });
  }
  // ---- 4. Download del JSON nel formato backup di Spese Tracker ----
  const blob = new Blob([JSON.stringify({ version: 1, exported: new Date().toISOString(), source: 'wallet', expenses, budgets: [], recurring: [] }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'wallet-import.json';
  a.click();
  URL.revokeObjectURL(a.href);
  console.log('[wallet-export] scaricato wallet-import.json — importalo da Spese Tracker → Altro → Importa backup JSON');
})();
