# Architettura

Riferimento tecnico per chi modifica il codice, persona o agente. Le regole di progetto sono in [AGENTS.md](../AGENTS.md), le scelte di fondo e i loro motivi in [decisioni.md](decisioni.md).

## Panoramica

- **PWA statica**: niente build e niente moduli ES. `index.html` carica gli script in quest'ordine, e ogni script vede le globali dei precedenti:

  ```
  categories → snapshots → db → money → ledger → sanitize → backup → ui → people
  → drive-config → drive → app → split-ui → people-ui → events-ui
  ```

  `money.js`, `ledger.js` e `sanitize.js` si esportano anche con `module.exports`, per i test con Node.
- **Separazione**: i calcoli delle spese condivise sono funzioni **pure** in `Ledger`, senza DB né DOM. I moduli `*-ui.js` disegnano soltanto. Le metriche storiche (Statistiche, cruscotto, insight, budget, saldo cumulato) restano invece dentro i `render*` di `app.js`, e vengono verificate dall'esterno con il golden test.
- **Viste**: ogni vista è una `<section id="view-…">` di `index.html` e si apre con `showView(name)`. Le viste di dettaglio hanno `data-parent` (`settings` per Altro, `share` per Condivise), che tiene evidenziata la tab giusta in basso. I pulsanti `[data-open]` e `[data-back]` aprono una vista o tornano indietro. La barra in basso è: `add` · `list` · `stats` · `share` · `settings`. Le scorciatoie PWA aprono una vista diretta con `?view=stats` o `?view=list`.

## Dati

### IndexedDB `spese-tracker` (`DB_VERSION = 3`)

| Store | Chiave | Contenuto |
|---|---|---|
| `expenses` | `id` autoincrement, indice `date` | Movimenti, con il modello in [requisiti §3.1](requisiti-condivise.md). |
| `budgets` | `cat` | `{cat, amount}`, il budget mensile per macro categoria. |
| `recurring` | `id` autoincrement | Spese ricorrenti, inserite all'avvio da `applyRecurring()`. |
| `meta` | `key` | `schemaVersion`, `upgradeNotice`, `savingsGoal`, `lastExportAt`, `lastBackupAt`, `lastBackupReminder`, `autoBackup` e i campi `drive*`. |
| `people`, `events`, `settlements` | `id` UUID (stringa) | Aggiunti nella v3. Con gli UUID i riferimenti restano validi tra export e import. |

- `DATA_STORES` (in `db.js`) elenca gli store che contengono dati dell'utente. Lo usano `clearAll`, `replaceAll` e `appendAll`. `meta` è escluso.
- Le scritture su più store passano da `DB.applyChanges({put, del})`, in un'unica transazione: se una singola scrittura fallisce in modo sincrono, la transazione viene annullata (`t.abort()`).
- Le date sono stringhe `AAAA-MM-GG` in ora locale, gli importi sono in euro come `number` con 2 decimali. Quando si somma o si divide si converte in centesimi con `Money.toCents`.

### IndexedDB `spese-tracker-backup`

È un DB separato, gestito da `snapshots.js`, che non viene mai migrato insieme a quello dei dati. Tiene le ultime **10** copie JSON complete, di due tipi:

- `pre-upgrade`, fatta prima di ogni aggiornamento dello schema;
- `pre-import`, fatta prima di ogni import.

Le copie si scaricano da Altro › Dati › Copie di sicurezza. `Snapshots.download` usa Web Share su Android, altrimenti un link.

### Formato del backup

- `buildBackup()` (in `backup.js`) è l'unico serializzatore, usato sia dall'export JSON sia da Drive. Produce la **v2**: `expenses`, `budgets`, `recurring`, `people`, `events`, `settlements`.
- Le versioni precedenti dell'app leggono solo i primi tre campi.
- `Sanitize` importa sia la v1 sia la v2:
  - un movimento v1 produce esattamente il record di prima;
  - i riferimenti mancanti diventano segnaposto ("Persona sconosciuta");
  - persone ed eventi con un UUID già presente si aggiornano invece di duplicarsi.

## Flussi principali

### Avvio

`init()` in `app.js`:

1. registra il service worker;
2. esegue `migrateData()` (migrazione dei contenuti, con `meta.schemaVersion`);
3. esegue `applyRecurring()`;
4. chiede `navigator.storage.persist()`;
5. lancia il backup automatico su Drive;
6. carica su Drive la copia pre-aggiornamento, dopo 3 s;
7. mostra il promemoria del backup;
8. mostra il popup "App aggiornata" se c'è un `upgradeNotice` non ancora mostrato.

### Apertura del DB e aggiornamento dello schema

`openDB()` in `db.js` usa un'unica promessa `_opening`:

1. `snapshotBeforeUpgrade()` apre il DB **senza versione**. Se la versione è minore di `DB_VERSION`, salva una copia v1 in `spese-tracker-backup`.
2. `indexedDB.open(DB_NAME, DB_VERSION)`. `onupgradeneeded` crea **solo** gli store che mancano.
3. Se un'altra istanza tiene aperta la versione vecchia, scatta `onblocked`: l'evento `db-blocked` mostra la schermata persistente "Aggiornamento in attesa". Quando il DB si sblocca arriva `db-unblocked`.
4. Se un'altra scheda aggiorna il DB, scatta `onversionchange`: questa scheda chiude la connessione e l'evento `db-versionchange` chiede di ricaricare.
5. Con la copia fatta, si salva `meta.upgradeNotice`. Il popup "App aggiornata" offre "Scarica copia e continua", perché il download parte solo dentro un gesto dell'utente.

### Salvataggio di una spesa (wizard)

1. `Split.plan()` chiama `Ledger.planSplit(totalCents, stato)` e ottiene `{amount, paid, payer, splits, …}`.
2. `Ledger.validate(record)` deve restituire un elenco vuoto.
3. `Split.confirmBalanceChange` chiede conferma se il saldo di qualcuno cambia segno (RF-S2).
4. Salvataggio su IndexedDB.

Con "Pagato da ‹persona›", l'importo scritto è il **totale pagato da lei**. Diviso in parti uguali, la quota che resta a me è salvata in `amount`, mentre `paid` vale 0.

### Import

1. Il file passa da `Sanitize`.
2. Si apre il pannello con la scelta tra "Sostituisci tutto" (consigliato) e "Aggiungi".
3. Al tocco di "Importa" il download della copia di sicurezza parte subito, dentro il gesto, e la copia si salva anche negli snapshot.
4. Poi viene eseguito `DB.replaceAll`, atomico, oppure `DB.appendAll`.

### Service worker e nuove versioni

- `sw.js` è "prima la cache". In fase di installazione scarica **tutti** gli `ASSETS` con `?v=CACHE` e `cache: 'reload'`, così scavalca anche la CDN di Pages, e li salva sotto l'URL pulito. Poi esegue `skipWaiting` e `clients.claim`.
- Le richieste si servono dalla cache della versione corrente. Così una pagina usa sempre file di una sola versione.
- Al `controllerchange`, se la pagina aveva già un controller, compare il banner "Nuova versione pronta · Aggiorna".
- `deploy.sh` incrementa `CACHE` (`spese-vNN`) a ogni rilascio.

## Dove guardare per…

| Argomento | Dove |
|---|---|
| Saldi, storico di una persona, riepiloghi degli eventi | `Ledger.balances`, `timeline`, `eventSummaries`, `lastActivities`. Fanno un solo passaggio sui movimenti. |
| Unione di due persone | `Ledger.mergePeople`, che produce le modifiche passate poi a `DB.applyChanges`. |
| Evento in corso preselezionato nel wizard | `Ledger.eventsInProgress`, in `events-ui.js`. |
| Elenco Movimenti | `renderList()`: pagine da `LIST_PAGE = 300` e "Mostra altri". I totali del giorno si calcolano su tutti i record. |
| Statistiche | `renderStats()`, ricalcolata a ogni cambio di periodo. `renderStatsGlobals()` (saldo cumulato, cruscotto, insight) si calcola solo all'apertura della vista. |
| Export CSV | `exportData('csv')`. La colonna `importo` contiene la mia quota. |

## Ricette

### Aggiungere un file JS

- Aggiungi il `<script>` in `index.html` nel punto giusto dell'ordine di caricamento.
- Aggiungi il file anche a `ASSETS` in `sw.js`, altrimenti offline manca e l'installazione non lo mette in cache.

### Aggiungere un campo a un movimento

1. Rendi il campo facoltativo, con un default in `Ledger.normalize` se serve.
2. Aggiorna `Ledger.validate`.
3. Aggiorna `Sanitize`, così che conservi il campo solo se è valido e un record v1 resti identico.
4. Aggiungi il campo al CSV, se è utile all'utente.
5. Aggiungi i test in `tests/` e aggiorna la tabella §3.1 dei requisiti.

### Aggiungere uno store o un indice (nuova versione dello schema)

1. Incrementa `DB_VERSION`.
2. In `onupgradeneeded`, crea lo store solo `if (!contains(...))`, senza riscrivere record.
3. Aggiungi lo store a `DATA_STORES`, a `buildBackup()` e a `Sanitize`. Se cambia la forma del backup, incrementa `version`.
4. Aggiorna il testo del popup "App aggiornata", che oggi descrive le novità della v3.
5. Prepara la versione di ritorno: il codice precedente ripubblicato con il nuovo `DB_VERSION`, come il branch `rollback-v3`.
6. Segui la checklist di [rilascio-condivise.md](rilascio-condivise.md): export dal telefono, golden test, andata e ritorno.

### Aggiungere una vista

1. Aggiungi la `<section id="view-x" class="view">` in `index.html`, con `data-parent` se è un dettaglio.
2. Aggiungi la riga `if (name === 'x') renderX();` in `showView`.
3. Se la vista sta in Altro, aggiungi la voce in `renderMoreMenu()`.

### Rinominare una globale letta dal golden

Se rinomini `periodOffset`, `drillCat`, `statFilter`, `listLimit` o una funzione `render*`, aggiorna nella stessa PR `tools/golden/probe.js`, `tools/e2e/scenario.js` e `tools/perf/bench.js`, mantenendo le stesse chiavi nello snapshot.
