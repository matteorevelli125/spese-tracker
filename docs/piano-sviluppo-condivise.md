# Piano di sviluppo: Spese condivise, crediti ed eventi

Riferimenti: [requisiti](requisiti-condivise.md) (gli ID RC-/RF-/RD- vengono da lì) · [mockup](mockup/condivise.html)
Stato: **completato e rilasciato** (v26, 25/11/2026). È un documento **storico**: per lo stato attuale vedi [architettura](architettura.md) e [decisioni](decisioni.md). Gli strumenti di §3 sono stati realizzati in [`tools/golden/`](../tools/golden/README.md), con nomi diversi da quelli previsti qui, e oggi esistono anche `node --test` e lo scenario E2E.

---

## 1. Vincoli da cui parte il piano

- **Ogni push su `main` va subito in produzione** (GitHub Pages e `deploy.sh`), e i dati veri stanno sul telefono, all'indirizzo di github.io. Quindi `main` non deve mai ricevere lavoro a metà.
- **App in JavaScript puro, senza build e senza test automatici.** Il calcolo delle metriche è dentro le funzioni che disegnano le schermate in `app.js`. Lo lasciamo così (rifattorizzarlo sarebbe un rischio inutile) e verifichiamo i numeri **dall'esterno**, cioè leggendo ciò che l'app mostra (§3).
- **Node 26 disponibile**: le parti nuove senza interfaccia (centesimi, split, saldi, sanificazione dell'import) si testano con `node --test`, senza dipendenze.

## 2. Strategia di branch e rilascio

```
main (produzione) ◄──────────────────────────── 1 sola PR di rilascio (deploy.sh)
   └── condivise (branch di integrazione)
          ├── F0-fondamenta      PR → condivise
          ├── F1-dati            PR → condivise
          ├── F2-navigazione     PR → condivise
          ├── F3-split-wizard    PR → condivise
          ├── F4-persone         PR → condivise
          ├── F5-eventi          PR → condivise
          └── F6-rilascio        PR → condivise, poi condivise → main
```

- Ogni fase si chiude con una PR verso `condivise`: revisione, test, mockup a confronto.
- **Un solo rilascio in produzione** alla fine, così la migrazione del database avviene una volta sola e il popup "App aggiornata" descrive funzioni che esistono davvero.
- Le prove sul telefono si fanno in locale: `python3 -m http.server` in rete locale. IndexedDB funziona, il service worker no, ma per provare va bene. **Mai** sull'indirizzo di produzione prima del rilascio.

## 3. Rete di sicurezza sui numeri (prima di scrivere codice)

| Strumento | Cosa fa |
|---|---|
| **Fotografia di riferimento** (`tools/golden-snapshot.js`) | Script da lanciare nella console del browser, sull'app in locale. Passa in rassegna ogni giorno, settimana, mese e anno presente nei dati e legge dalla pagina: totale, confronti, entrate/uscite, barre per categoria e sottocategoria, andamento, saldo cumulato, insight, cruscotto annuale (KPI e tabelle), budget, obiettivo e totali del giorno in Movimenti. Produce un JSON. |
| **Confronto** (`tools/golden-diff.js`, Node) | Confronta due fotografie e mostra ogni differenza al centesimo. |
| **Dati reali** | Esporti il JSON dal telefono e lo metti in `private/` (cartella esclusa da git, il file non lascia mai il Mac). |

Procedura: fotografia sulla versione di produzione di oggi con i dati reali → fotografia su ogni fase → **zero differenze** perché la PR si possa unire (RD-2). La stessa procedura vale per l'andata e ritorno: import v1 → export v2 → import in un DB vuoto → fotografia identica.

---

## 4. Fasi

Ogni fase include i suoi test e la verifica nel browser. La dimensione è indicativa (S/M/L).

### F0 · Fondamenta (S), nessuna modifica visibile
- `tools/golden-snapshot.js` e `tools/golden-diff.js`, `private/` in `.gitignore`, **fotografia di riferimento** su `main` con i dati reali.
- `money.js`: funzioni sui centesimi interi (conversione da euro a centesimi e ritorno, somme, divisione in parti uguali con il resto a me, RC-11) e i relativi test.
- **Un solo serializzatore del backup** (`backup.js`), usato sia dall'export JSON sia da Drive (RD-5). Il contenuto resta `version: 1`, identico a oggi.
- "Cancella tutti i dati" svuota tutto quello che `DB` conosce (RD-8).
- ✅ Uscita: fotografia identica, i test Node passano.

### F1 · Dati, migrazione e import/export (L), quasi nessuna modifica visibile
- **DB v3 solo additivo** (RD-1): nuovi store `people`, `events`, `settlements`, con UUID come chiave. **Nessun record esistente viene riscritto.**
- Gestione di `versionchange` e `blocked` (RD-10): una scheda vecchia aperta chiude la connessione e chiede di ricaricare.
- **Backup prima dell'aggiornamento** (RD-12): all'avvio si apre il DB *senza* chiedere la versione. Se è < 3, si legge tutto, si salva la copia (vedi la decisione **D1**) e solo dopo si apre la v3.
- `ledger.js` (funzioni pure, testate): normalizzazione di una spesa (`paid` di default uguale ad `amount`), invarianti del §3.1, validazioni RV-1…RV-5, calcolo dei saldi per persona, saldi per evento, effetto di una modifica sui saldi (per RF-S2), unione di persone.
- **Export v2** (RD-4) e **import v1 e v2** (RD-3, RD-6, RD-7) con la sanificazione estesa e test: un JSON v1 resta identico, `amount = 0` è ammesso solo con split, i riferimenti mancanti diventano segnaposto.
- **Dialogo di import con la scelta** (RD-11): la sostituzione avviene in **un'unica transazione IndexedDB su tutti gli store**, quindi o va a buon fine tutta o non cambia niente.
- ✅ Uscita: fotografia identica, andata e ritorno identica, test che coprono le invarianti.

### F2 · Navigazione (M)
- Barra in basso: Aggiungi · Movimenti · Statistiche · **Condivise** · Altro (RF-N1).
- **Altro diventa un menu** con dettagli e "‹ Altro" (RF-N3). Budget e obiettivo si spostano lì **senza cambiare il codice che li disegna**.
- Condivise contiene il segmented control Persone | Eventi, per ora con elenchi vuoti.
- Le scorciatoie `?view=` restano valide (RF-N4). Si aggiunge `?view=budget`, che porta ad Altro › Budget.
- ✅ Uscita: fotografia identica (Budget compreso), confronto con i mockup 6a.

### F3 · Split nel wizard e Movimenti (L)
- Componente **selettore persone** con autocompletamento, persone recenti e "+ Crea" (Q5, RF-W4). Lo riusano anche F4 e F5.
- Righe **Pagato da** e **Diviso con** con i loro pannelli: parti uguali, importi esatti, non partecipo, riepilogo, validazioni (RF-W3…W8, RV-*).
- Salvataggio con `amount = mia quota`, `paid`, `splits`, `payer`. **Modifica** di un movimento con lo split già compilato (RF-W11).
- **Movimenti**: quota come importo principale, pagato in piccolo, badge, totali del giorno sulla quota, ricerca per persona (RF-M1…M5).
- Conferma con il prima e il dopo quando un saldo cambia segno (RF-S2).
- Conferma di salvataggio con quota e pagato (RF-W10). CSV con le colonne nuove (RD-9).
- ✅ Uscita: fotografia identica **sui dati vecchi**. Un dataset di prova con split dà le metriche calcolate a mano (per esempio cena da 80 € in 2 → Ristorante 40 €). Confronto con i mockup 1a, 1c, 2a–2c e 3.

### F4 · Persone e crediti (M)
- Elenco con il riepilogo "Ti devono / Devi" (RF-P1, P2).
- Scheda persona con il saldo progressivo e le tre azioni (RF-P3…P6). Rimborso e "Ho restituito" con l'avviso quando supera il saldo (RF-P7). Modifica e cancellazione dei rimborsi (RF-P8).
- Gestione: rinomina, archivia, **unisci** (RF-P9, P10).
- ✅ Uscita: i saldi coincidono con quelli calcolati a mano sul dataset di prova, i rimborsi non toccano nessuna metrica (fotografia identica prima e dopo un rimborso). Confronto con i mockup 4a–4e.

### F5 · Eventi (M)
- Creazione e modifica con i modelli Vacanza / Picnic / Uscita / **Generico**, placeholder "Vacanza agosto" (RF-E1…E3).
- Elenco con attivi e archiviati, archivia, riapri, elimina (RF-E4, E8, E9).
- Wizard: riga Evento, preselezione se oggi è nelle date, evento che resta selezionato dopo il salvataggio, partecipanti nello split, categoria predefinita come suggerimento (RF-W1, W2, W9).
- Scheda evento: KPI, per categoria con drill-down, saldi generati, spese, "+ Spesa" (RF-E5, E6, E10).
- Ricerca per nome dell'evento e colonna Evento nel CSV.
- ✅ Uscita: confronto con i mockup 1b, 5a–5c, totali dell'evento coerenti con i movimenti.

### F6 · Rilascio (S)
- Popup **"App aggiornata"** mostrato una sola volta (RD-13).
- Controllo finale: fotografia con i dati reali, andata e ritorno, prova completa sul telefono in rete locale.
- Aggiornamento di README e checklist di rilascio (sotto). `deploy.sh condivise` aggiorna anche la cache del service worker.

---

## 5. Checklist di rilascio (produzione)

1. Export JSON dal telefono (sull'app attuale) **e** backup su Drive, fatti il giorno stesso.
2. Fotografia finale identica a quella di riferimento con quell'export.
3. `./deploy.sh condivise`.
4. Sul telefono: apri l'app → popup → verifica che il backup pre-v3 esista → controlla 3 numeri a campione (mese corrente, anno, un budget) contro la fotografia.
5. Piano di ritorno indietro: `git revert` del merge e nuovo deploy. **Attenzione**: la versione vecchia chiede il DB alla versione 2 mentre sul telefono c'è già la 3, quindi non lo aprirebbe. Per questo il ritorno indietro non è un semplice revert: la versione precedente va ripubblicata con `DB_VERSION = 3` (ignora gli store che non conosce). Questa patch va **preparata in anticipo** in F6.

## 6. Rischi principali

| Rischio | Contromisura |
|---|---|
| Una metrica letta in un punto dimenticato usa il pagato invece della quota | `amount` resta la quota e il pagato sta in un campo nuovo, quindi il codice esistente è corretto per costruzione. Più la fotografia di riferimento. |
| Errori di arrotondamento nello split | Calcoli in centesimi interi (`money.js`) e test. |
| Import doppio o parziale | Scelta "Sostituisci" con un'unica transazione, copia prima dell'import. |
| La migrazione si blocca per una scheda vecchia aperta | Gestione di `versionchange` e `blocked` (RD-10). |
| Ritorno indietro impossibile per la versione del DB | Patch di ritorno preparata in anticipo (§5.5). |
| Download automatico bloccato dal browser senza un tocco dell'utente | Decisione **D1**. |

---

## 7. Decisioni (confermate il 25/11/2026)

- **D1: dove salvare la copia "sul dispositivo" all'avvio della nuova versione.** Il browser (soprattutto Chrome su Android) non garantisce il download di un file se l'utente non ha appena toccato qualcosa. Quindi:
  - all'avvio, una copia **automatica** in un database separato sul dispositivo (`spese-tracker-backup`), indipendente da quello che viene migrato, più Drive se è collegato;
  - nel popup RD-13 il pulsante **"Scarica copia e continua"** salva anche il file JSON nei Download;
  - per l'import il file si prepara quando si apre il dialogo e si salva al tocco di "Importa".
- **D2: un solo rilascio in produzione alla fine** (§2), non uno per fase.
