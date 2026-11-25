---
paths:
  - "money.js"
  - "ledger.js"
  - "split-ui.js"
  - "people-ui.js"
  - "events-ui.js"
---

# Conti delle spese condivise

- Ogni somma e ogni divisione si fa in centesimi con `Money`. Le regole stanno in `Ledger`, come funzioni pure: i file `*-ui.js` le chiamano e disegnano il risultato.
- Un record salvato rispetta `Ledger.validate` (elenco vuoto). Le invarianti sono in `docs/requisiti-condivise.md` §3.1, e i commenti citano gli ID RC/RF/RV.
- Ogni regola nuova o corretta arriva con un test in `tests/ledger.test.js`. Le modifiche a un flusso dell'interfaccia passano anche lo scenario E2E (`tools/e2e/README.md`).
