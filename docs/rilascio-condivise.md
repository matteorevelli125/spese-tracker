# Rilascio: spese condivise, crediti ed eventi

Riferimenti: [requisiti](requisiti-condivise.md) · [piano](piano-sviluppo-condivise.md) · [golden test](../tools/golden/README.md)

Il rilascio è **uno solo** (D2). La PR `condivise → main` si unisce con `deploy.sh`, che aggiorna anche la cache del service worker. Al primo avvio la migrazione del DB v2 → v3 avviene una sola volta: aggiunge 3 store e **non riscrive nessun record**.

## Prima del rilascio (lo stesso giorno)

1. **Export JSON dal telefono** (app attuale: Altro → Esporta JSON) e copia in `private/`.
2. **Backup su Drive** dal telefono (Altro → Esegui backup ora), se collegato.
3. **Golden test con quell'export**: la produzione (`main`) e `condivise` devono dare **zero differenze**. Il diff serve con il nome del tuo export:
   ```bash
   node tools/golden/diff.mjs private/snapshots/<main>.json private/snapshots/<condivise>.json
   ```
4. **Andata e ritorno**: dopo la misura su `condivise`, export v2 → «Sostituisci tutto» → nuova misura, sempre con zero differenze.
5. `node --test` deve passare tutto.

## Rilascio

```bash
git checkout condivise && git pull
```

```bash
./deploy.sh condivise
```

## Dopo il rilascio, sul telefono

1. Apri l'app con la rete attiva (si scarica la nuova versione), poi chiudila e riaprila se serve.
2. Compare il popup **"App aggiornata"**: tocca **«Scarica copia e continua»**. Controlla che nei Download ci sia `spese-pre-v3-AAAA-MM-GG.json`.
3. Se Drive è collegato, dopo qualche secondo nella cartella di backup compare la stessa copia `spese-pre-v3-…`. Se non c'è, viene ricaricata ai prossimi avvii.
4. **Tre numeri a campione** contro lo snapshot del golden test: totale del mese corrente, totale dell'anno, un budget.
5. Altro › Dati › **Copie di sicurezza**: la copia pre-aggiornamento deve essere elencata e scaricabile.
6. Prova veloce: una spesa divisa in due, poi Condivise › Persone. Se serve, eliminala.

## Se qualcosa va storto: versione di ritorno

Un semplice `git revert` **non basta**: la versione vecchia chiede il DB alla v2, il telefono è già alla v3 e l'app non si aprirebbe (VersionError).

Il branch **`rollback-v3`** contiene la v25 (produzione prima di questa funzionalità) che apre il DB alla v3. Gli store nuovi restano intatti e vengono ignorati. È stato verificato con il golden test sui dati reali: 537/537 viste identiche.

```bash
./deploy.sh rollback-v3
```

Cosa comporta tornare indietro:
- i dati di persone, eventi e rimborsi restano nel DB ma non sono visibili;
- le spese divise mostrano la **tua quota** (le metriche restano coerenti);
- modificare una spesa divisa con la versione vecchia ne cancella i campi di divisione;
- per ripristinare tutto dopo la correzione basta ripubblicare la versione nuova.

In ogni caso, sul telefono restano l'export fatto prima del rilascio e la copia `spese-pre-v3-…`, che si possono reimportare con «Sostituisci tutto».
