# Golden test delle metriche

Controlla che una modifica **non cambi nessun numero** mostrato dall'app (requisito RD-2).
Si carica lo stesso backup nella versione di riferimento (`main`) e in quella nuova, con "oggi" bloccato. Lo strumento passa in rassegna ogni giorno, settimana, mese e anno, salva tutto quello che la pagina mostra e confronta i due risultati.

Cosa misura: totali, confronti, entrate/uscite/risparmio, barre per categoria e per sottocategoria (con la lunghezza), andamento, saldo cumulato, insight, budget, obiettivo e cruscotto annuale (KPI e tabelle). Le viste che dipendono dalla data di oggi si misurano al giorno 1, al 15 e all'ultimo di ogni mese. Misura anche i totali del giorno in Movimenti.

## Uso

```bash
# 1. una volta: worktree con la versione di riferimento (cartella ignorata da git)
git worktree add --detach private/main-wt main     # per aggiornarlo: git -C private/main-wt checkout --detach main

# 2. i due server (oppure le configurazioni golden-main / golden-branch di .claude/launch.json)
node tools/golden/server.mjs --root private/main-wt --port 8131
node tools/golden/server.mjs --root .               --port 8132
```

3. Nel browser apri entrambi:
   - `http://localhost:8131/__golden/seed.html?data=<file>&label=main&now=2026-11-25`
   - `http://localhost:8132/__golden/seed.html?data=<file>&label=branch&now=2026-11-25`

   `<file>` si cerca in `private/` (dati reali) e poi in `tests/fixtures/` (`sample-backup.json`, sintetico). Quando la misura finisce, il titolo della scheda diventa **GOLDEN DONE** e lo snapshot è in `private/snapshots/<label>.json`.

4. Confronta i due snapshot:

```bash
node tools/golden/diff.mjs private/snapshots/main.json private/snapshots/branch.json
```

   Con `--numbers` confronta solo importi e percentuali, utile quando una fase cambia di proposito un'etichetta. Il comando esce con codice 1 se trova differenze.

## Dati reali

Esporta il JSON dal telefono (**Altro → Esporta JSON**) e copialo in `private/` (ignorata da git, non lascia mai il Mac). Usa per `now` la data dell'export.

## Note

- **Service worker «prima la cache»**: `seed.html` lo disattiva prima di aprire l'app. Per misurare **senza** passare dal seed (es. dopo il test e2e), disattivalo prima dalla console: `for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()`. Altrimenti la pagina arriva dalla cache, senza `freeze-time.js` e `probe.js`.

- `seed.js` riscrive a mano il DB **locale** dell'origine di prova (`localhost:<porta>`), con lo schema v2 di produzione. Non tocca mai i dati del telefono.
- `probe.js` legge gli interni di `app.js` (`periodOffset`, `drillCat`, funzioni `render*`). Se una fase li rinomina, va aggiornato nella stessa PR, mantenendo le stesse chiavi nello snapshot.
- `make-fixture.mjs` rigenera `tests/fixtures/sample-backup.json` in modo deterministico.
- Bug già presente in produzione, trovato con questo strumento: aprire il dettaglio di una categoria in Statistiche e poi passare a un periodo in cui quella categoria non ha spese manda in errore `renderCatBars`. Il probe per ora fa il dettaglio solo delle categorie presenti nel periodo.
