# Spese Tracker: guida per agenti

PWA personale per le spese, con un solo utente. È scritta in JavaScript puro, senza build, dipendenze né backend. I dati stanno solo in IndexedDB sul telefono e l'app è pubblicata su GitHub Pages. Interfaccia, commenti, documenti, commit e PR sono **in italiano**.

## Regole non negoziabili

1. **Dati reali solo sul Mac.** In `private/` (esclusa da git) ci sono gli export JSON reali, gli snapshot del golden test e il worktree `private/main-wt`. Si usano solo su server locali (`localhost`). Non finiscono mai in commit, PR, log incollati o servizi esterni, e le prove si fanno sempre su copie locali, mai sull'app del telefono.
2. **`main` è la produzione.** Ogni push su `main` va online su GitHub Pages e arriva sul telefono. Il lavoro si fa su un branch con PR. Il rilascio (`./deploy.sh <branch>`) parte solo dopo il **via esplicito dell'utente**, da chiedere ogni volta.
3. **Numeri identici, zero perdite.** Ogni modifica lascia invariate tutte le metriche sui dati esistenti e reimporta i vecchi JSON (v1 e v2) come prima. Lo dimostra il golden test.
4. **Il database cresce solo per aggiunta.** `DB_VERSION` può solo salire. Un aggiornamento aggiunge store e indici senza riscrivere nessun record, e prima di migrare salva una copia (`snapshotBeforeUpgrade`).
5. **`amount` è la mia quota**, ed è l'unico campo che leggono le metriche. Il resto del modello contabile è sotto.

## Modello contabile

- Campi di un movimento:
  - `amount`: la mia quota.
  - `paid`: quanto è uscito dal mio conto; se manca, vale `amount`.
  - `payer`: chi ha pagato; se manca, ho pagato io.
  - `splits`: le quote degli altri, `[{personId, amount}]`.
  - `payerTotal`, `shareWith`, `splitMode`, `eventId`.

  Tutti i campi nuovi sono facoltativi, quindi i record vecchi sono già validi.
- I calcoli si fanno in **centesimi interi** (`Money`). Nella divisione in parti uguali il resto dei centesimi va a me.
- Ogni persona ha un **saldo** unico, positivo se mi deve. I rimborsi non sono entrate. Si tracciano solo i rapporti tra me e ciascuna persona, mai i debiti tra terzi.
- Le regole complete, con gli ID RC/RF/RD, sono in [docs/requisiti-condivise.md](docs/requisiti-condivise.md). Le regole contabili stanno come funzioni pure in `ledger.js`.

## Comandi

```bash
node --test                    # test unitari (money, ledger, sanitize): Node ≥ 20, nessuna dipendenza
python3 -m http.server 8123    # app in locale (anche "spese" in .claude/launch.json)
./deploy.sh <branch>           # SOLO con il via dell'utente: merge PR → main, bump cache SW, deploy, verifica HTTP 200
```

## Mappa del codice

Non ci sono moduli ES: gli script sono globali e si caricano in ordine da `index.html`. Ogni file usa quelli caricati prima di lui.

| File | Ruolo |
|---|---|
| `categories.js` | Categorie e sottocategorie. Gli `id` sono salvati nei record. |
| `snapshots.js` | Copie di sicurezza nel DB separato `spese-tracker-backup`. |
| `db.js` | IndexedDB `spese-tracker`, oggi v3: apertura, migrazione, blocchi tra istanze, transazioni. |
| `money.js`, `ledger.js`, `sanitize.js` | Logica **pura**: centesimi, saldi e split, sanificazione dell'import. Testate con Node. |
| `backup.js` | `buildBackup()`, l'unico serializzatore (export JSON e Drive). |
| `ui.js`, `people.js` | Pannelli, conferme e avatar; rubrica delle persone. |
| `drive.js`, `drive-config.js` | Backup su Google Drive, tutto lato client. |
| `app.js` | Wizard, Movimenti, Statistiche, Budget, Altro, import/export, avvio. Le metriche si calcolano qui, dentro i `render*`. |
| `split-ui.js`, `people-ui.js`, `events-ui.js` | Pagato da / Diviso con; Condivise › Persone; Condivise › Eventi. |
| `sw.js` | Service worker "prima la cache", con versioni intere `spese-vNN`. |

I dettagli (store, flussi di avvio, aggiornamento, import ed export) e le ricette per le modifiche frequenti sono in [docs/architettura.md](docs/architettura.md).

## Come si verifica una modifica

Il controllo dipende da cosa tocca la modifica. Una modifica è finita quando sono verdi tutti i controlli che la riguardano:

- **Logica pura** (`money`, `ledger`, `sanitize`): `node --test`, con un test nuovo per il caso aggiunto.
- **Numeri, render, DB, import o export**: golden test sui dati reali con **0 differenze**, a parte le aggiunte volute all'interfaccia. La procedura è in [tools/golden/README.md](tools/golden/README.md).
- **Spese condivise, persone, eventi e rimborsi**: lo scenario E2E deve passare tutti i controlli. Vedi [tools/e2e/README.md](tools/e2e/README.md).
- **Interfaccia**: prova nel browser a 375 px di larghezza, sia con il tema chiaro sia con quello scuro, senza errori in console.
- **Prestazioni** (letture complete, liste, Statistiche): `tools/perf/bench.js` prima e dopo. Vedi [docs/performance-assessment.md](docs/performance-assessment.md).

## Flusso di lavoro

- Si parte da un branch da `main` con un nome breve in italiano, in kebab-case (`fix-salva-sopra`).
- I commit seguono lo stile convenzionale, in italiano: `feat(wizard): …`, `fix: …`, `perf: …`, `docs: …`, `test: …`. Si apre la PR verso `main`.
- Si aspetta il via dell'utente, poi si lancia `./deploy.sh <branch>`. Lo script unisce la PR e incrementa `CACHE` in `sw.js` (va lasciato a lui). Dopo verifica che il sito risponda.
- Sul telefono la nuova versione compare con **"Nuova versione pronta · Aggiorna"** oppure all'apertura successiva.

## Trappole note

- **Service worker "prima la cache"**: in locale la pagina può arrivare dalla cache. Prima di misurare con il golden test, o dopo l'E2E, disattivalo con `for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()`.
- **Un file nuovo** va aggiunto sia a `ASSETS` in `sw.js` sia ai `<script>` di `index.html`, nell'ordine giusto. Altrimenti offline manca.
- `tools/golden/probe.js` legge gli interni di `app.js` (`periodOffset`, `drillCat`, `statFilter`, le funzioni `render*`). Se ne rinomini uno, aggiorna il probe nella stessa PR.
- Due cose diverse:
  - `meta.schemaVersion` (in `migrateData`) è una migrazione dei **contenuti**, cioè la rimappatura delle categorie;
  - `DB_VERSION` (in `db.js`) è lo **schema** IndexedDB.
- **Ritorno indietro**: una versione vecchia ripubblicata deve avere `DB_VERSION` ≥ quella sul telefono, altrimenti non apre il DB. Per la v3 la versione di ritorno è pronta nel branch `rollback-v3`.
- **Date**: sono stringhe `AAAA-MM-GG` in ora locale (`todayStr()`). Ogni valore scritto dall'utente passa da `esc()` prima di finire in `innerHTML`.

## Documenti: quando leggerli

- [docs/architettura.md](docs/architettura.md): prima di toccare DB, avvio, service worker, import ed export, oppure di aggiungere uno store, un file o una vista.
- [docs/decisioni.md](docs/decisioni.md): prima di cambiare una scelta di fondo, per sapere perché è stata fatta così.
- [docs/requisiti-condivise.md](docs/requisiti-condivise.md): per split, persone, eventi, rimborsi e backup. Gli ID RC/RF/RD si citano nei commenti e nelle PR.
- [docs/performance-assessment.md](docs/performance-assessment.md): quando una schermata rallenta o aggiungi letture di tutto l'archivio.
- [docs/rilascio-condivise.md](docs/rilascio-condivise.md): come modello per un rilascio con migrazione del DB.
- [docs/piano-sviluppo-condivise.md](docs/piano-sviluppo-condivise.md) e [docs/mockup/condivise.html](docs/mockup/condivise.html): storico delle fasi F0–F6, già rilasciate.
