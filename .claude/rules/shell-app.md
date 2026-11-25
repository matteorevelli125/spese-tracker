---
paths:
  - "sw.js"
  - "index.html"
  - "app.js"
---

# Guscio dell'app

- Un file nuovo entra sia nei `<script>` di `index.html`, nell'ordine di caricamento, sia in `ASSETS` di `sw.js`. `CACHE` lo incrementa `deploy.sh`.
- Le globali e le funzioni `render*` di `app.js` sono lette da `tools/golden/probe.js`, `tools/e2e/scenario.js` e `tools/perf/bench.js`. Se ne rinomini una, aggiornali nella stessa PR.
- Le metriche leggono `amount`, cioè la mia quota. Verifica con il golden test: 0 differenze.
