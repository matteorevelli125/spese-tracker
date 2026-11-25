// Golden test: "oggi" fisso, impostato da ?now=AAAA-MM-GG (ore 12:00 locali).
// Caricato prima degli script dell'app, così `new Date()` e `Date.now()` sono
// deterministici. window.__goldenSetNow(str) lo sposta durante la misura.
(() => {
  const qs = new URLSearchParams(location.search);
  const start = qs.get('now');
  if (!start) return;
  const Real = Date;
  let fixed = new Real(start + 'T12:00:00').getTime();
  class FrozenDate extends Real {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }
    static now() { return fixed; }
  }
  window.Date = FrozenDate;
  window.__goldenSetNow = str => { fixed = new Real(str + 'T12:00:00').getTime(); };
})();
