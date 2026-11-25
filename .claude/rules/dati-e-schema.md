---
paths:
  - "db.js"
  - "sanitize.js"
  - "backup.js"
  - "snapshots.js"
---

# Dati, schema e backup

- Lo schema cresce solo per aggiunta: crei uno store se manca (`if (!contains(...))`) e i record esistenti restano come sono. Prima di toccare questi file, segui la ricetta "Aggiungere uno store o un indice" in `docs/architettura.md`.
- Un movimento v1 importato da `Sanitize` deve restare identico, con gli stessi campi e gli stessi valori. Ogni campo nuovo si conserva solo se è presente e valido.
- Verifica con `node --test` (`tests/sanitize.test.js`) e con il golden test, sia sull'import sia sull'andata e ritorno.
