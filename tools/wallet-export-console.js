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
    'bar, cafe': ['cibo', 'Bar e caffè'], 'bar, caffè': ['cibo', 'Bar e caffè'],
    'food & drinks': ['cibo', 'Spesa'], 'cibo e bevande': ['cibo', 'Spesa'],
    // Casa
    'rent': ['casa', 'Affitto / Mutuo'], 'affitto': ['casa', 'Affitto / Mutuo'],
    'mortgage': ['casa', 'Affitto / Mutuo'], 'mutuo': ['casa', 'Affitto / Mutuo'],
    'energy, utilities': ['casa', 'Bollette'], 'energia, utenze': ['casa', 'Bollette'],
    'utilities': ['casa', 'Bollette'], 'bollette': ['casa', 'Bollette'],
    'internet': ['casa', 'Bollette'], 'phone, cell phone': ['casa', 'Bollette'],
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
  // Struttura Wallet web: la lista è divisa in blocchi giorno con data in
  // testata e righe record (icona, categoria, conto, nota, importo).
  // Le classi CSS sono offuscate e cambiano fra release, quindi il parsing è
  // euristico: cerca righe che contengono un importo in valuta e risale alla
  // data del blocco più vicino.
  const AMOUNT_RE = /^-?\s?(?:€|EUR)?\s?-?\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})\s?(?:€|EUR)?$/;
  const DATE_RES = [
    { re: /^(\d{1,2})\s+(\w+)\s+(\d{4})$/i },                       // "12 marzo 2024"
    { re: /^(\w+),?\s+(\d{1,2})\s+(\w+)(?:\s+(\d{4}))?$/i },         // "martedì, 12 marzo 2024"
    { re: /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/ },                 // "12/03/2024"
  ];
  const MONTHS = { gennaio:1,febbraio:2,marzo:3,aprile:4,maggio:5,giugno:6,luglio:7,agosto:8,settembre:9,ottobre:10,novembre:11,dicembre:12,
    january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12 };
  const pad = n => String(n).padStart(2, '0');

  function parseDate(text) {
    const t = text.trim().toLowerCase()
      .replace(/^oggi$/, new Date().toLocaleDateString('it-IT'))
      .replace(/^ieri$/, new Date(Date.now() - 864e5).toLocaleDateString('it-IT'));
    let m = t.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
    if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    m = t.match(/(\d{1,2})\s+([a-zà-ù]+)(?:\s+(\d{4}))?/);
    if (m && MONTHS[m[2]]) {
      const y = m[3] || new Date().getFullYear();
      return `${y}-${pad(MONTHS[m[2]])}-${pad(m[1])}`;
    }
    return null;
  }
  function parseAmount(text) {
    const clean = text.replace(/[€\sEUR]/g, '').replace(/\./g, '').replace(',', '.');
    const v = parseFloat(clean);
    return isFinite(v) ? v : null;
  }

  // Foglie di testo che sembrano importi
  const leaves = [...document.querySelectorAll('div,span,td')].filter(el =>
    el.children.length === 0 && AMOUNT_RE.test(el.textContent.trim()));

  const expenses = [];
  const unmapped = new Map();
  let currentDate = null;
  const seenRows = new Set();

  // Cammina tutto il DOM in ordine: aggiorna la data quando incontra una
  // testata giorno, cattura la riga quando incontra un importo.
  const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_ELEMENT);
  for (let el = walker.nextNode(); el; el = walker.nextNode()) {
    if (el.children.length === 0) {
      const d = parseDate(el.textContent);
      if (d && el.textContent.trim().length < 40) { currentDate = d; continue; }
    }
    if (leaves.includes(el)) {
      const row = el.closest('[class]')?.parentElement?.closest('div') || el.parentElement;
      if (seenRows.has(row)) continue;
      seenRows.add(row);
      const amount = parseAmount(el.textContent);
      if (amount === null || amount >= 0) continue; // solo uscite (negative in Wallet)
      // testo della riga senza l'importo = categoria + conto + nota
      const texts = [...row.querySelectorAll('div,span')]
        .filter(x => x.children.length === 0 && x !== el)
        .map(x => x.textContent.trim()).filter(Boolean);
      const catName = texts[0] || '';
      const note = texts.slice(1).join(' · ');
      const mapped = mapCategory(catName);
      if (!mapped) unmapped.set(catName, (unmapped.get(catName) || 0) + 1);
      const [cat, sub] = mapped || ['altro', 'Varie'];
      expenses.push({
        date: currentDate || new Date().toISOString().slice(0, 10),
        amount: Math.abs(amount),
        cat, sub,
        note: mapped ? note : `${catName}${note ? ' · ' + note : ''}`,
        ts: Date.now(),
      });
    }
  }

  console.log(`[wallet-export] record estratti: ${expenses.length}`);
  if (unmapped.size) {
    console.warn('[wallet-export] categorie NON mappate (finite in Altro/Varie):');
    console.table([...unmapped.entries()].map(([name, n]) => ({ categoria: name, occorrenze: n })));
  }
  if (!expenses.length) {
    console.error('[wallet-export] Nessun record trovato: la struttura della pagina è diversa dal previsto. Manda uno screenshot della lista record e adattiamo i selettori.');
    return;
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
