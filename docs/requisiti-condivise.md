# Requisiti — Spese condivise, crediti ed eventi

Stato: **confermato** (25/11/2026) · origine: sessione di grilling del 25/11/2026.
Base per mockup e piano di sviluppo. Gli ID (`RC-…`, `RF-…`) servono per tracciare i requisiti nel piano e nei test.

---

## 1. Problema

- Pago spesso anche per altri (ragazza, amici): oggi la spesa intera finisce nelle metriche e **sovrastima** la categoria.
- Quando un amico paga anche la mia quota non lo registro, quindi le metriche **sottostimano**.
- Non so in ogni momento chi mi deve quanto.
- Per vacanze, picnic e uscite voglio raggruppare gli acquisti, anche quelli fatti mesi prima.

L'app resta **personale**: un solo utente, i dati sul dispositivo, nessuna condivisione con gli amici.

---

## 2. Regole contabili (non negoziabili)

| ID | Regola |
|----|--------|
| RC-1 | Ogni uscita ha due valori: **pagato**, cioè i soldi usciti dal mio conto, e **mia quota**, cioè il mio consumo reale. |
| RC-2 | **Tutte** le metriche (statistiche, budget, insight, cruscotto annuale, saldo cumulato, obiettivo di risparmio) usano **solo la mia quota**. |
| RC-3 | La **data** di un movimento è la data del pagamento, chiunque abbia pagato (principio di cassa sulla data). |
| RC-4 | La differenza tra pagato e mia quota genera un credito verso le persone dello split. |
| RC-5 | Ogni persona ha **un solo saldo netto**: positivo vuol dire che mi deve, negativo che le devo. Non esistono crediti legati a una singola spesa da chiudere uno per uno. |
| RC-6 | Un **rimborso** non è un'Entrata: modifica solo il saldo della persona e non compare in nessuna metrica. |
| RC-7 | Se un'altra persona paga per me, registro una spesa con **mia quota = Y, pagato = 0**, e il saldo della persona diminuisce di Y. La riconciliazione è automatica: la differenza resta nel saldo. |
| RC-8 | Si tracciano solo i rapporti tra **me e ciascuna persona**, mai i debiti tra terzi. |
| RC-9 | Lo split vale solo per le **Uscite**. |
| RC-10 | Lo storico non si ricalcola: i movimenti esistenti hanno mia quota = pagato = importo attuale. |
| RC-11 | Gli importi si calcolano in **centesimi interi**. Nella divisione in parti uguali il resto dei centesimi va a me (10 € in 3 → 3,33 · 3,33 · **3,34 io**). |

Formula del saldo (positivo = mi deve):

```
saldo(P) =  Σ quote di P nelle spese pagate da me
          − Σ mie quote nelle spese pagate da P
          − Σ rimborsi ricevuti da P
          + Σ rimborsi dati a P
```

---

## 3. Modello dati

> Scelta di compatibilità: il campo esistente **`amount` resta il valore che tutte le metriche leggono**, e d'ora in poi significa "mia quota". Così le circa 30 letture di `amount` in `app.js` restano corrette senza modifiche e i record vecchi (senza i campi nuovi) sono già validi così come sono.

### 3.1 `expenses` (esteso: i campi nuovi sono tutti facoltativi)

| Campo | Tipo | Note |
|---|---|---|
| `amount` | number ≥ 0 | **mia quota**. Vale 0 solo se `splits` non è vuoto ("non partecipo"). |
| `paid` | number ≥ 0 | uscito dal mio conto. **Se manca vale `amount`**. |
| `payer` | personId | se manca, ho pagato io. |
| `splits` | `[{ personId, amount }]` | quote degli altri, solo se `payer` manca. |
| `splitMode` | `'equal'` \| `'exact'` | serve a riaprire lo split come era stato inserito. |
| `eventId` | eventId | facoltativo. |
| _(invariati)_ | `date, type, cat, sub, note, ts` | |

Invarianti:
- `payer` mancante → `paid = amount + Σ splits.amount`
- `payer` presente → `paid = 0`, `splits` vuoto, `amount > 0`
- `type = 'income'` → niente `payer`, `splits` o `eventId` (RC-9). L'evento si potrà valutare in futuro.

### 3.2 Store nuovi

**`people`**: `{ id (uuid), name, archived, createdAt, lastUsedAt }`

**`events`**: `{ id (uuid), name, emoji, start?, end?, participants: [personId], defaultCat?, defaultSub?, archived, createdAt }`

**`settlements`** (rimborsi): `{ id (uuid), personId, direction: 'in' | 'out', amount > 0, date, note, eventId?, ts }`
- `in` = la persona mi restituisce soldi; `out` = io restituisco soldi a lei.

Gli ID dei nuovi store sono **UUID** (non autoincrement), così i riferimenti restano validi tra export e import.

---

## 4. Navigazione

| ID | Requisito |
|---|---|
| RF-N1 | Barra in basso: **Aggiungi · Movimenti · Statistiche · Condivise · Altro**. |
| RF-N2 | **Condivise** ha due sezioni (segmented control): **Persone** \| **Eventi**. |
| RF-N3 | **Altro** diventa un **menu di voci** che si aprono una alla volta (vista di dettaglio con "‹ Indietro"): **Budget** (con obiettivo di risparmio), **Spese ricorrenti**, **Backup Google Drive**, **Dati**. |
| RF-N4 | Le scorciatoie PWA esistenti (`?view=stats`, `?view=list`) continuano a funzionare. |

---

## 5. Wizard "Aggiungi" (flusso principale)

Il flusso a 3 tap (importo → categoria → sottocategoria → salva) **non cambia**. Le righe nuove stanno sotto Data e Nota, chiuse di default, e compaiono solo per le **Uscite**.

| ID | Requisito |
|---|---|
| RF-W1 | Riga **"Evento"**: compare solo se esiste almeno un evento attivo. Scegliere un evento propone la sua categoria predefinita (che si cambia con un tap) e riempie "Diviso con" con **tutti i partecipanti in parti uguali**. |
| RF-W2 | Se oggi cade tra `start` e `end` di un evento attivo, l'evento è **già selezionato** e si toglie con un tap. Se gli eventi in corso sono più di uno, non se ne seleziona nessuno. |
| RF-W3 | Riga **"Pagato da: Io ▾"**. Se scelgo una persona: l'importo inserito è **la mia quota**, `paid = 0`, la riga "Diviso con" si nasconde. |
| RF-W4 | Riga **"Diviso con"**: si apre un pannello con le persone in chip (prima le più recenti), una ricerca con autocompletamento e **"+ Crea '‹nome›'"**. Per ogni spesa posso togliere o aggiungere persone rispetto ai partecipanti dell'evento. |
| RF-W5 | Di default l'importo è diviso **in parti uguali** tra me e le persone selezionate (RC-11). |
| RF-W6 | Interruttore **"Importi esatti"**: inserisco la quota di ciascuno e la mia si calcola come residuo e si aggiorna in tempo reale. |
| RF-W7 | Interruttore **"Non partecipo"**: la mia quota è 0 e il totale si divide in parti uguali tra gli altri (o si inserisce a importi esatti). |
| RF-W8 | Riepilogo sulla riga chiusa: `👥 Giulia, Marco · tua quota 26,67 €`. |
| RF-W9 | Dopo il salvataggio **con un evento**: l'evento resta selezionato fino alla chiusura dell'app o fino a quando lo tolgo, lo split torna ai partecipanti in parti uguali, la categoria torna a quella predefinita. **Senza evento**: split e pagatore si azzerano. |
| RF-W10 | La conferma di salvataggio mostra la mia quota e, se diversa, anche il pagato. |
| RF-W11 | Quando modifico un movimento esistente, il wizard si riapre con split, pagatore ed evento come erano stati salvati. |
| RF-W12 | Le spese ricorrenti automatiche non hanno split né evento (fuori dalla v1). |

### Validazioni del wizard

| ID | Regola |
|---|---|
| RV-1 | Con "Diviso con" attivo serve almeno 1 altra persona. "Non partecipo" richiede almeno 1 persona. |
| RV-2 | Con gli importi esatti: se Σ quote degli altri > totale, il salvataggio è disabilitato e compare un messaggio. Se Σ = totale, la mia quota è 0 (equivale a "non partecipo"). |
| RV-3 | Non posso usare "Pagato da ‹persona›" e "Diviso con" insieme. |
| RV-4 | Tutte le quote sono ≥ 0. Una quota 0 per un'altra persona equivale a toglierla dallo split. |
| RV-5 | La rubrica non contiene "io": l'utente non può selezionare sé stesso. |

---

## 6. Persone e crediti (Condivise › Persone)

| ID | Requisito |
|---|---|
| RF-P1 | In alto il riepilogo **"Ti devono X € · Devi Y €"**. |
| RF-P2 | Elenco delle persone con il saldo, ordinate per importo assoluto decrescente. Le persone a saldo 0 vanno in fondo e in grigio. |
| RF-P3 | **Scheda persona**: storico di anticipi, spese pagate da lei e rimborsi, in ordine cronologico, con il **saldo progressivo**. Toccando una voce si apre il movimento o il rimborso. |
| RF-P4 | Azione **"Registra rimborso"**: l'importo proposto è il saldo intero e si può modificare per un rimborso parziale. Ci sono anche data (default oggi), nota ed evento facoltativo. Se il saldo è negativo l'azione diventa **"Ho restituito"** (`direction: out`). |
| RF-P5 | Azione **"Ha pagato per me"**: apre il wizard con `Pagato da` già impostato su quella persona. |
| RF-P6 | Azione **"Segna come saldato"**: crea un rimborso pari al saldo intero, con un tap e una conferma. |
| RF-P7 | Un rimborso **maggiore del saldo** è permesso con un avviso ("Marco risulterà creditore di 10 €"). |
| RF-P8 | Rimborsi e movimenti si possono modificare e cancellare dalla scheda persona. |
| RF-P9 | **Rubrica**: rinomina, archivia (solo con saldo 0; le persone archiviate non compaiono nell'autocompletamento ma si possono ripristinare), **nessuna cancellazione** se la persona compare in qualche movimento. |
| RF-P10 | **Unisci persone** (A dentro B): i saldi si sommano, tutti i riferimenti passano da A a B (split, pagatore, rimborsi, partecipanti degli eventi, senza doppioni), A viene cancellata. Prima compare una conferma con il saldo risultante. |

### Modifiche e cancellazioni che toccano i saldi

| ID | Requisito |
|---|---|
| RF-S1 | Modificare lo split o cancellare una spesa è **sempre possibile** e ricalcola i saldi. |
| RF-S2 | Se un saldo **cambia segno** per effetto dell'operazione, compare una conferma con il prima e il dopo ("Marco ti aveva già rimborsato: ora risulterai debitore di 20 €"). |

---

## 7. Eventi (Condivise › Eventi)

| ID | Requisito |
|---|---|
| RF-E1 | Un evento ha: **nome** obbligatorio (placeholder *"Vacanza agosto"*), **emoji o modello**, **date di inizio e fine** facoltative (in un evento di un giorno coincidono), **partecipanti**, **categoria e sottocategoria predefinite** facoltative. |
| RF-E2 | Modelli che preimpostano emoji e categoria: ✈️ Vacanza → Vacanze · 🧺 Picnic → Cibo e bevande/Spesa · 🎉 Uscita → Svago · 📌 Generico → nessuna categoria proposta. |
| RF-E3 | La categoria predefinita è **solo un suggerimento**: un evento può contenere spese di **qualsiasi categoria**. |
| RF-E4 | Elenco degli eventi: prima gli **attivi** (possono essere più di uno), poi una sezione **"Archiviati"** chiusa. |
| RF-E5 | **Scheda evento**: mia quota totale, pagato da me, pagato da altri per me, **ripartizione per categoria** (con drill-down nelle sottocategorie), elenco delle spese, pulsante **"+ Spesa"** che apre lo **stesso wizard** con l'evento preselezionato. |
| RF-E6 | Riquadro **"Saldi generati in questo evento"** per partecipante: è informativo (RC-5). Il pulsante "Salda" porta alla scheda persona con l'evento già indicato nel rimborso. |
| RF-E7 | Aggiungere o togliere partecipanti **non modifica** le spese già registrate. |
| RF-E8 | **Archivia**: l'evento sparisce dal wizard, resta consultabile e si può riaprire. Si può archiviare anche con saldi aperti. |
| RF-E9 | **Elimina**: toglie solo l'etichetta, le spese restano. Serve una conferma. |
| RF-E10 | Una spesa con `Pagato da ‹persona›` può appartenere a un evento. |

---

## 8. Movimenti, ricerca e statistiche

| ID | Requisito |
|---|---|
| RF-M1 | Le spese divise mostrano come importo principale la **mia quota** e sotto, in piccolo, `pagati 80 € · 👥 2`. Le spese pagate da altri mostrano `pagato da Marco`. L'eventuale evento compare come badge. |
| RF-M2 | I rimborsi **non** compaiono in Movimenti, ma solo nella scheda persona. |
| RF-M3 | I totali del giorno nell'elenco Movimenti usano la mia quota. |
| RF-M4 | La ricerca trova anche i nomi delle persone e degli eventi. |
| RF-M5 | I movimenti con quota 0 ("non partecipo") compaiono in Movimenti ma non pesano su nessuna metrica, perché la quota è 0. |

---

## 9. Dati, backup e retrocompatibilità (critico)

### 9.1 Garanzie

| ID | Garanzia |
|---|---|
| RD-1 | **Migrazione solo additiva**: l'aggiornamento di IndexedDB (versione 2 → 3) **aggiunge** i nuovi store e **non riscrive nessun record esistente**. I campi mancanti hanno valori di default (RC-10). |
| RD-2 | **Numeri identici**: su un dataset senza split, tutte le metriche danno **esattamente** gli stessi valori prima e dopo il rilascio (totali per periodo, categorie, sottocategorie, budget, insight, cruscotto annuale, saldo cumulato, obiettivo). |
| RD-3 | **Import dei vecchi JSON** (`version: 1`, senza persone, eventi o rimborsi): funziona come oggi e non scarta nessun record che oggi viene accettato. |
| RD-4 | **Nuovo export JSON** `version: 2`: `expenses` (con i campi nuovi), `budgets`, `recurring`, `people`, `events`, `settlements`. |
| RD-5 | **Un solo serializzatore** del backup, usato sia dall'export JSON sia dal backup su Drive. Oggi il payload è duplicato in `app.js` e in `drive.js`. |
| RD-6 | La sanificazione dell'import conserva i campi nuovi e accetta `amount = 0` solo se `splits` non è vuoto. Un `personId` o `eventId` assente dal file genera una persona o un evento segnaposto ("Persona sconosciuta"), così i saldi non cambiano. |
| RD-7 | Le persone e gli eventi importati con un UUID già presente si **aggiornano** invece di duplicarsi. |
| RD-8 | "Cancella tutti i dati" svuota anche i nuovi store. |
| RD-9 | CSV dei movimenti: alle colonne attuali si aggiungono *Pagato, Tua quota, Pagato da, Diviso con, Evento*. La colonna `importo` resta = mia quota, per coerenza con le metriche. Niente CSV per i rimborsi nella v1. |
| RD-10 | Se una scheda con la versione vecchia è ancora aperta durante l'aggiornamento del DB, va gestito l'evento `versionchange`: la scheda vecchia chiude la connessione e chiede di ricaricare, invece di bloccarsi. |

### 9.2 Criteri di rilascio

- **Golden test** su un export JSON reale fatto prima del rilascio: si calcolano le metriche con la versione attuale e con quella nuova e devono coincidere al centesimo.
- **Andata e ritorno**: import di un JSON v1 → export v2 → import in un DB vuoto. Il numero di record e tutte le metriche devono restare identici.
- Test unitari su split, arrotondamenti, saldi, unione di persone e validazioni.
- Backup obbligatorio prima del rilascio: export JSON manuale e/o backup Drive.
- Incremento della cache del service worker (`spese-vNN`), come per ogni rilascio.

---

## 10. Fuori dalla v1

- Debiti tra terzi o "chi deve a chi" all'interno di un gruppo (RC-8)
- Caso misto, cioè la stessa spesa pagata in parte da me e in parte da un altro
- Split sulle Entrate
- Spese ricorrenti divise
- Valute estere
- Foto degli scontrini
- Condivisione o sincronizzazione con gli amici
- Budget di un evento e voci pianificate ma non pagate (preventivo)
- Ricostruzione degli split nello storico

---

### 9.3 Import e aggiornamento

| ID | Requisito |
|---|---|
| RD-11 | **Import con scelta**: un dialogo propone **"Sostituisci tutto"** (consigliato) oppure **"Aggiungi ai dati attuali"** (il comportamento di oggi). Prima della sostituzione l'app salva **sempre** sul dispositivo un JSON completo dei dati attuali (`spese-pre-import-AAAA-MM-GG.json`). La sostituzione è atomica: se l'import fallisce, i dati attuali restano intatti. |
| RD-12 | **Backup al primo avvio della nuova versione**, prima di toccare il DB: l'app salva **sempre e in automatico** una copia sul dispositivo, in un database IndexedDB separato (`spese-tracker-backup`) che non viene migrato, e, se Drive è collegato, **anche** su Drive (`spese-pre-v3-AAAA-MM-GG.json`). Il file JSON nei Download si salva dal popup (RD-13), perché il browser non garantisce un download senza un tocco dell'utente. |
| RD-13 | **Popup "App aggiornata"** al primo avvio della nuova versione: spiega in breve le novità (Condivise, split, eventi, Altro diventato menu), conferma che il backup è stato fatto e dove, e ha il pulsante **"Scarica copia e continua"**, che salva `spese-pre-v3-AAAA-MM-GG.json` sul dispositivo e chiude il popup. Compare una sola volta. |

---

## 11. Decisioni chiuse in fase di revisione

- DA-1 → RD-11 (import con scelta tra sostituzione e aggiunta, backup sempre sul dispositivo).
- DA-2 → RD-12 e RD-13 (backup al primo avvio sul dispositivo e su Drive, popup di avviso).
- D1 del piano → RD-12 e RD-13: copia automatica in un DB di backup separato più Drive, file JSON salvato al tocco di "Scarica copia e continua".
