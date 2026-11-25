// Aritmetica sui soldi in CENTESIMI INTERI (RC-11): niente somme di float.
// Usato dal browser come globale `Money` e da Node (`require('./money.js')`) nei test.
const Money = {
  // euro (number o stringa con , o .) → centesimi interi. Valori non finiti → NaN.
  toCents(euro) {
    const n = typeof euro === 'string' ? parseFloat(euro.replace(',', '.')) : Number(euro);
    if (!Number.isFinite(n)) return NaN;
    // toFixed(6) assorbe l'errore binario (1.005*100 = 100.49999…) prima di arrotondare.
    return Math.round(Number((n * 100).toFixed(6)));
  },

  fromCents(cents) {
    return cents / 100;
  },

  sum(centsList) {
    return centsList.reduce((a, c) => a + c, 0);
  },

  // Divide `totalCents` in parti uguali tra `others` persone più, se `includeMe`, me.
  // Il resto dei centesimi va a me (10 € in 3 → 3,33 · 3,33 · 3,34 io).
  // Se non partecipo, il resto si distribuisce un centesimo per volta ai primi.
  // → { me, others: [..] } con me + Σothers === totalCents.
  splitEqual(totalCents, others, includeMe = true) {
    if (!Number.isInteger(totalCents) || totalCents < 0) throw new RangeError('totalCents deve essere un intero ≥ 0');
    if (!Number.isInteger(others) || others < 0) throw new RangeError('others deve essere un intero ≥ 0');
    const parts = others + (includeMe ? 1 : 0);
    if (parts === 0) throw new RangeError('serve almeno una parte');
    const base = Math.floor(totalCents / parts);
    const rest = totalCents - base * parts;
    if (includeMe) return { me: base + rest, others: Array(others).fill(base) };
    return { me: 0, others: Array.from({ length: others }, (_, i) => base + (i < rest ? 1 : 0)) };
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = Money;
