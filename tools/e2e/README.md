# Test end-to-end delle spese condivise

`scenario.js` usa l'app **dall'interfaccia** (wizard, pannelli, schede Persone ed Eventi) su una copia locale dei dati. Inserisce, modifica ed elimina voci coprendo i casi limite. Dopo ogni passo confronta i numeri mostrati con un **oracolo indipendente**, calcolato in `scenario.js` direttamente dai record, senza usare `Ledger` né le funzioni dell'app.

Sezioni confrontate a ogni passo:
- Statistiche: mese corrente, mesi e anni toccati, con totale, entrate e importi per categoria;
- cruscotto annuale (uscite e numero di movimenti del mese);
- budget (per categoria e totale);
- saldo cumulato;
- totali del giorno in Movimenti;
- Persone (ti devono, devi, saldo di ognuno);
- scheda evento (quota, pagato da te, pagato da altri, numero di spese).

Casi coperti:
- spesa normale (il record resta nel formato di prima);
- divisione in parti uguali con arrotondamento;
- importi esatti, con quote oltre il totale bloccate;
- non partecipo;
- pagato da altri con il totale, o con la quota scritta a mano (anche oltre il totale, bloccata);
- entrata;
- altro mese e anno precedente;
- evento in corso (preselezione, categoria e partecipanti che restano dopo il salvataggio, pagatore contato una volta, altra categoria nello stesso evento);
- rimborsi parziali, oltre il saldo, restituzione, saldato, eliminazione;
- modifiche, compreso il cambio di pagatore;
- eliminazioni con l'avviso di cambio segno;
- unione di un doppione;
- archiviazione rifiutata con saldo diverso da zero;
- ricerca per evento e per persona;
- CSV;
- export v2 seguito da «Sostituisci tutto»;
- eliminazione di un evento.

Alla fine il test **elimina tutto ciò che ha creato**: rilanciando poi il golden test, l'app deve essere identica alla fotografia di partenza.

## Uso

1. Server `golden-branch` (vedi `tools/golden/README.md`) e dati caricati con il seed:
   `http://localhost:8132/__golden/seed.html?data=<export>.json&label=e2e-inizio&now=<data export>`
2. Apri `http://localhost:8132/index.html` e nella console:
   ```js
   (await import('/tools/e2e/scenario.js')).run()
   ```
   Il risultato compare in alto nella pagina e viene salvato in `private/snapshots/e2e-report.json`.
3. Confronto finale. Disattiva prima il service worker, perché con «prima la cache» la pagina arriverebbe dalla cache, senza gli script di misura:
   ```js
   for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
   ```
   poi apri `http://localhost:8132/index.html?golden=1&label=e2e-fine&now=<data export>` e lancia:
   ```bash
   node tools/golden/diff.mjs private/snapshots/<riferimento>.json private/snapshots/e2e-fine.json
   ```

Il test gira solo in locale e non tocca mai i dati del telefono.
