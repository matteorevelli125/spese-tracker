// Regole contabili delle spese condivise (requisiti §2–3), come funzioni PURE:
// nessun accesso a DB o DOM, così sono testabili con `node --test`.
//
// Modello (campi nuovi tutti facoltativi, i record vecchi sono già validi):
//   amount   = MIA QUOTA (è il valore che leggono tutte le metriche)
//   paid     = uscito dal mio conto (se manca vale amount)
//   payer    = personId di chi ha pagato (se manca: io)
//   splits   = [{ personId, amount }] quote degli altri (solo se ho pagato io)
//   splitMode= 'equal' | 'exact'
//   eventId  = evento (facoltativo)
// Saldo di una persona, in centesimi, positivo = mi deve (RC-5):
//   Σ sue quote nelle spese pagate da me − Σ mie quote nelle spese pagate da lei
//   − Σ rimborsi ricevuti da lei (in) + Σ rimborsi dati a lei (out)
const Ledger = (() => {
  const M = typeof Money !== 'undefined' ? Money : require('./money.js');
  const c = M.toCents;
  const isIncome = e => e.type === 'income';

  // Vista completa di un movimento con i default applicati (non modifica l'originale).
  function normalize(e) {
    const payer = e.payer || null;
    const splits = !payer && Array.isArray(e.splits) ? e.splits : [];
    const paid = e.paid != null ? e.paid : (payer ? 0 : e.amount);
    return { ...e, payer, splits, paid };
  }

  // Errori di coerenza di un movimento (vuoto = valido). Codici stabili per la UI e i test.
  function validate(e) {
    const err = [];
    const n = normalize(e);
    const amount = c(n.amount);
    if (!Number.isFinite(amount) || amount < 0) err.push('amount');
    if (isIncome(e)) {
      if (e.payer || (e.splits && e.splits.length) || e.eventId) err.push('income-shared');
      if (amount <= 0) err.push('amount');
      return err;
    }
    if (n.payer) {
      if (c(n.paid) !== 0) err.push('payer-paid');
      if (e.splits && e.splits.length) err.push('payer-splits');      // RV-3
      if (amount <= 0) err.push('amount');
      return err;
    }
    const ids = new Set();
    for (const s of n.splits) {
      if (!s || !s.personId) err.push('split-person');
      else if (ids.has(s.personId)) err.push('split-duplicate');
      else ids.add(s.personId);
      if (!s || !Number.isFinite(c(s.amount)) || c(s.amount) <= 0) err.push('split-amount'); // RV-4
    }
    if (amount === 0 && !n.splits.length) err.push('amount');            // quota 0 solo con split
    const others = M.sum(n.splits.map(s => c(s && s.amount) || 0));
    if (c(n.paid) !== amount + others) err.push('paid-sum');
    return [...new Set(err)];
  }

  // Saldi per persona, in centesimi. `filter` opzionale per limitare i movimenti (es. a un evento).
  function balances(expenses, settlements = [], filter = {}) {
    const out = new Map();
    const add = (id, cents) => out.set(id, (out.get(id) || 0) + cents);
    for (const raw of expenses) {
      if (isIncome(raw)) continue;
      if (filter.eventId && raw.eventId !== filter.eventId) continue;
      const e = normalize(raw);
      if (e.payer) add(e.payer, -c(e.amount));
      else for (const s of e.splits) add(s.personId, c(s.amount));
    }
    for (const s of settlements) {
      if (filter.eventId && s.eventId !== filter.eventId) continue;
      add(s.personId, s.direction === 'out' ? c(s.amount) : -c(s.amount));
    }
    return out;
  }

  // Totali "ti devono" / "devi" in centesimi.
  function totals(balanceMap) {
    let owedToMe = 0, iOwe = 0;
    for (const v of balanceMap.values()) { if (v > 0) owedToMe += v; else iOwe -= v; }
    return { owedToMe, iOwe };
  }

  // Persone il cui saldo cambia segno per effetto di una modifica/cancellazione (RF-S2):
  // il saldo dopo non è zero e ha segno diverso da prima (anche partendo da 0, es.
  // "Marco ti aveva già rimborsato: ora risulterai debitore"). Arrivare a 0 non conta.
  function signFlips(before, after) {
    const ids = new Set([...before.keys(), ...after.keys()]);
    const flips = [];
    for (const id of ids) {
      const b = before.get(id) || 0, a = after.get(id) || 0;
      if (a !== 0 && Math.sign(a) !== Math.sign(b)) flips.push({ personId: id, before: b, after: a });
    }
    return flips;
  }

  // Unisce la persona `fromId` in `toId` (RF-P10): restituisce i record da riscrivere.
  // Le quote della stessa spesa si sommano; i partecipanti agli eventi non si duplicano.
  function mergePeople({ expenses = [], events = [], settlements = [] }, fromId, toId) {
    if (!fromId || !toId || fromId === toId) throw new Error('unione non valida');
    const expOut = [];
    for (const e of expenses) {
      let changed = false;
      const next = { ...e };
      if (e.payer === fromId) { next.payer = toId; changed = true; }
      if (Array.isArray(e.splits) && e.splits.some(s => s.personId === fromId)) {
        const acc = new Map();
        for (const s of e.splits) {
          const id = s.personId === fromId ? toId : s.personId;
          acc.set(id, (acc.get(id) || 0) + c(s.amount));
        }
        next.splits = [...acc].map(([personId, cents]) => ({ personId, amount: M.fromCents(cents) }));
        changed = true;
      }
      if (changed) expOut.push(next);
    }
    const evOut = events
      .filter(ev => (ev.participants || []).includes(fromId))
      .map(ev => ({ ...ev, participants: [...new Set(ev.participants.map(p => (p === fromId ? toId : p)))] }));
    const stOut = settlements.filter(s => s.personId === fromId).map(s => ({ ...s, personId: toId }));
    return { expenses: expOut, events: evOut, settlements: stOut };
  }

  return { normalize, validate, balances, totals, signFlips, mergePeople };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Ledger;
