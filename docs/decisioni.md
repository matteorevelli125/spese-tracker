# Registro delle decisioni

Le scelte di fondo, con il loro motivo. Una decisione nuova va aggiunta **in fondo**. Una decisione superata si segna come "sostituita da DNN" e resta qui, senza cancellarla.

Formato: **Decisione** · *Perché* · Conseguenze.

---

### D01 · App statica, dati solo sul dispositivo
**JS puro senza build né dipendenze, IndexedDB sul telefono, GitHub Pages, nessun backend.**
*Perché*: un solo utente, costo zero e dati personali che non passano da un server.
Conseguenze:
- il backup è responsabilità dell'utente: export JSON oppure Google Drive con scope `drive.file`;
- ogni push su `main` è un rilascio.

### D02 · `amount` resta la "mia quota"
**Il campo che leggono tutte le metriche vuol dire "mia quota". Quanto è uscito dal conto va in `paid`.**
*Perché*: le circa 30 letture di `amount` in `app.js` restano corrette senza modifiche, e i record vecchi sono già validi così come sono.
Conseguenze:
- una metrica nuova legge `amount`;
- il flusso di cassa reale si ricava da `Ledger.normalize(e).paid`.

### D03 · Le metriche si verificano dall'esterno (golden test)
**Il calcolo delle metriche resta dentro i `render*` di `app.js`. Lo si controlla leggendo ciò che la pagina mostra, su ogni giorno, settimana, mese e anno, con i dati reali e "oggi" bloccato.**
*Perché*: rifattorizzare le metriche per poterle testare sarebbe stato un rischio inutile. Il golden test confronta 537 viste al centesimo.
Conseguenze: `tools/golden/probe.js` dipende dagli interni di `app.js`.

### D04 · Migrazioni solo additive, con una copia prima
**Un aggiornamento dello schema aggiunge store e indici senza riscrivere nessun record. Prima salva una copia completa in un DB separato (`spese-tracker-backup`) che non viene mai migrato** (D1 del piano, RD-1, RD-12).
*Perché*: zero perdite garantite per costruzione. Se la nuova versione ha un bug, i dati di prima restano intatti e scaricabili.
Conseguenze: `DB_VERSION` non scende mai. Una versione vecchia ripubblicata deve avere il `DB_VERSION` corrente (D13).

### D05 · Centesimi interi, resto a me
**I calcoli si fanno in centesimi con `Money`. Nella divisione in parti uguali, i centesimi che avanzano vanno a me** (RC-11).
*Perché*: sommare valori decimali produce errori di arrotondamento. Così ogni split torna esattamente al totale.

### D06 · Principio di cassa, solo rapporti tra me e ciascuna persona
**Ogni persona ha un saldo netto. I rimborsi non sono entrate e non pesano sulle metriche. Non si tracciano i debiti tra terzi** (RC-5, RC-8).
*Perché*: le statistiche devono mostrare quanto spendo io davvero. Un gestionale di gruppo è fuori dallo scopo.
Conseguenze: con "Pagato da ‹persona›", la divisione tra gli altri partecipanti non crea crediti verso di loro.

### D07 · Lo storico non si ricostruisce
**I movimenti precedenti alle spese condivise restano con mia quota = pagato = importo** (RC-10).
*Perché*: inventare split nel passato cambierebbe numeri già noti.

### D08 · Eventi generici e Altro come menu
**"Vacanze" diventa "Eventi", con i modelli Vacanza, Picnic, Uscita e Generico. La categoria predefinita è solo un suggerimento. Altro diventa un menu di voci che si aprono una alla volta, Budget compreso.**
*Perché*: le stesse esigenze valgono per picnic e uscite. Con le voci nuove, la schermata Altro unica era diventata troppo lunga.

### D09 · Un solo rilascio per le spese condivise
**Le fasi F0–F6 sono state unite nel branch `condivise` e poi in `main` in un'unica volta** (v26, 25/11/2026; D2 del piano).
*Perché*: una sola migrazione del DB, e un popup "App aggiornata" che descrive funzioni già tutte presenti.
Conseguenze: è un modello da riusare per le prossime migrazioni dello schema.

### D10 · "Pagato da altri": si inserisce il totale
**Con "Pagato da ‹persona›", l'importo scritto è il totale pagato da lei. Di default si divide in parti uguali, con il pagatore e gli eventuali partecipanti. "Scrivo la mia quota" permette di inserire la quota a mano** (RF-W3 rivisto, v30).
*Perché*: prima si inseriva la sola quota, e chi aveva pagato tutto non poteva dividere la spesa.
Conseguenze:
- campi `payerTotal`, `shareWith` e `splitMode`;
- `paid = 0`.

### D11 · Aggiornamento bloccato: schermata d'attesa persistente
**Se un'altra istanza tiene aperto il DB vecchio, l'app mostra "Aggiornamento in attesa" finché il DB non si sblocca, invece di partire vuota** (v27).
*Perché*: sul telefono un'istanza rimasta aperta ha bloccato l'upgrade. Il risultato erano Movimenti vuoti e il download del JSON che non funzionava.
Conseguenze: i download su Android passano da Web Share (`navigator.share`), con un link come ripiego.

### D12 · Service worker "prima la cache", con versioni intere
**L'app si apre sempre dai file salvati. Una nuova versione si installa per intero in background e si attiva con "Nuova versione pronta · Aggiorna"** (v29).
*Perché*:
- con "prima la rete", rivalidare 15 script costava circa 0,5 s a ogni avvio;
- mescolare file di versioni diverse è pericoloso con lo schema del DB.

Conseguenze:
- `deploy.sh` incrementa `CACHE`;
- ogni file nuovo va in `ASSETS`;
- per i test in locale bisogna disattivare il service worker.

### D13 · Versione di ritorno preparata in anticipo
**Per ogni migrazione dello schema si tiene pronto un branch con il codice precedente e il nuovo `DB_VERSION`. Per la v3 è `rollback-v3`, verificato 537/537 con il golden test.**
*Perché*: un semplice `git revert` chiederebbe una versione del DB più vecchia di quella sul telefono, e il DB non si aprirebbe.

### D14 · Prestazioni: solo interventi a basso rischio, finché servono
**La lista Movimenti mostra 300 righe per pagina (v31). In Statistiche le viste globali si calcolano solo all'apertura, e Persone ed Eventi si calcolano in un solo passaggio (v32).** La cache in memoria dei movimenti è rimandata a quando si superano circa 3.000 movimenti.
*Perché*: oggi ci sono circa 600 movimenti l'anno. Una seconda fonte di verità, come aggregati o cache, aggiunge rischi sui numeri prima che serva.
Dettagli e soglie: [performance-assessment.md](performance-assessment.md).
