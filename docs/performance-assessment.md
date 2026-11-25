# Assessment prestazioni: come degradano con la crescita dei record

Data: 25/11/2026 · versione analizzata: v31 (ottimizzazioni 1 e 2 applicate nella versione successiva, vedi in fondo) · benchmark: [`tools/perf/bench.js`](../tools/perf/bench.js)

## In breve

- **Oggi (585 movimenti) non c'è nessun problema**: ogni schermata si disegna in meno di 30 ms sul Mac e, a stima, in circa 0,1 s su un telefono.
- I tempi crescono **in modo lineare** con il numero di movimenti, perché quasi ogni schermata rilegge **tutto** l'archivio (`DB.allExpenses()`, 17 punti nel codice), spesso più volte.
- Al tuo ritmo, circa **600 movimenti l'anno**, il primo rallentamento percepibile sul telefono arriverebbe tra **5 e 10 anni** (3.000–6.000 movimenti), in Statistiche, Persone e nel pannello "Pagato da".
- Le correzioni più utili sono poche e a basso rischio: **non ricalcolare a ogni cambio di periodo** le viste che non dipendono dal periodo, **calcoli in un solo passaggio** per Persone ed Eventi e **una cache in memoria** dei movimenti.

## Misure

Dataset sintetici realistici: circa 6% di entrate, 15% di spese condivise (un terzo pagate da altri), 20 persone, un evento ogni 200 movimenti, un rimborso ogni 50 movimenti. Ogni valore è la mediana di 3 esecuzioni sul Mac (8 core), in millisecondi.

| Movimenti (≈ anni al tuo ritmo) | 600 (1) | 3.000 (5) | 6.000 (10) | 20.000 (33) | 50.000 (80) |
|---|---:|---:|---:|---:|---:|
| Lettura di tutti i movimenti (`allExpenses`) | 3 | 13 | 23 | 74 | 188 |
| Lettura del mese (indice per data) | 1 | 0 | 0 | 0 | 0 |
| **Statistiche: apertura o cambio periodo** (4 viste)¹ | 28 | 55 | 116 | 401 | 1.049 |
| di cui saldo cumulato / cruscotto / insight | 3 / 15 / 4 | 12 / 22 / 14 | 26 / 32 / 23 | 76 / 82 / 74 | 191 / 194 / 190 |
| **Movimenti** (prima pagina) | 22 | 27 | 34 | 89 | 213 |
| Ricerca in Movimenti | 17 | 27 | 37 | 94 | 223 |
| Budget + obiettivo | 6 | 21 | 40 | 130 | 333 |
| **Persone** (elenco) | 10 | 25 | 47 | 151 | 378 |
| Scheda persona | 5 | 17 | 32 | 102 | 266 |
| Eventi (solo attivi) | 4 | 14 | 23 | 74 | 190 |
| Saldi per il pannello "Pagato da" | 5 | 14 | 25 | 79 | 200 |
| Export JSON | 5 | 16 | 26 | 85 | 217 |
| Dimensione del backup | 133 KB | 655 KB | 1,3 MB | 4,4 MB | 11 MB |

¹ Una scheda Statistiche più le tre viste che non dipendono dal periodo (saldo cumulato, cruscotto annuale, insight), ricalcolate a **ogni** tocco di ‹ / ›.

**Sul telefono** bisogna moltiplicare questi numeri per circa **3–5**: è una stima per un Android di fascia media, non l'ho misurato. Sotto i 100 ms la risposta sembra immediata, tra 100 e 300 ms si nota, oltre 1 s dà fastidio.

| Al tuo ritmo | Statistiche (cambio periodo) | Persone | Pagato da |
|---|---|---|---|
| tra 1 anno | ~0,1 s | ~0,05 s | ~0,03 s |
| tra 5 anni | ~0,2–0,3 s | ~0,1 s | ~0,05 s |
| tra 10 anni | **~0,4–0,6 s** | ~0,2 s | ~0,1 s |
| volume estremo (20.000) | **1,5–2 s** | 0,5–0,8 s | 0,3–0,4 s |

## Dove degrada e perché

1. **Letture complete ripetute.** Ogni vista rilegge tutto l'archivio da IndexedDB (circa 3,7 µs a record sul Mac, compresa la copia degli oggetti), anche quando servono pochi mesi. Statistiche lo fa **3 volte** per ogni apertura e per ogni cambio di periodo.
2. **Viste ricalcolate senza motivo.** `renderStats` rilancia ogni volta saldo cumulato, cruscotto annuale e insight ([app.js:579](../app.js:579)), che non dipendono dal periodo scelto. Se tocchi ‹ più volte di seguito, i calcoli si accumulano in parallelo.
3. **Calcoli "per persona" e "per evento" con più passaggi.**
   - In Persone, l'"ultima attività" ricalcola lo storico di ogni persona sull'intero archivio: costo O(persone × movimenti).
   - In Eventi, ogni evento rilegge tutti i movimenti: costo O(eventi × movimenti). Con l'elenco degli **archiviati** aperto (250 eventi con 50.000 movimenti): 385 ms sul Mac, circa 1,5 s su un telefono.
4. **Saldi ricalcolati a richiesta**: aprendo "Pagato da" e salvando ogni modifica (controllo del cambio di segno RF-S2), sempre sull'intero archivio.
5. **Spazio occupato dalle copie di sicurezza.** Ogni import e ogni aggiornamento del database salvano una copia JSON completa, con indentazione, nel database di backup. Se ne tengono fino a **10**: con 20.000 movimenti fanno circa 45 MB. Anche il backup su Drive e l'export usano JSON indentato, circa il 25% più grande del necessario.
6. **Già sotto controllo:**
   - l'apertura dell'app non dipende più dal numero di file né dai dati (service worker "prima la cache", v29);
   - la lista Movimenti disegna al massimo 300 righe per volta ("Mostra altri", v31);
   - Budget usa già l'indice per data per il mese corrente.

## Strategie di mitigazione (in ordine di rapporto beneficio/rischio)

| # | Intervento | Effetto atteso | Rischio | Quando |
|---|---|---|---|---|
| 1 ✅ | **Statistiche: ricalcolare saldo cumulato, cruscotto e insight solo all'apertura** della schermata (o se i dati cambiano), non a ogni ‹ / › | Il cambio periodo scende da 116 ms a meno di 10 ms con 6.000 movimenti (circa 50 volte meno lavoro) | Basso. Lo copre il golden test: le viste non cambiano | **Subito** |
| 2 ✅ | **Persone ed Eventi in un solo passaggio**: un giro sui movimenti per calcolare saldi, ultima attività e riepiloghi di tutti | Da O(P·N) / O(E·N) a O(N). Elimina i secondi con gli archiviati aperti | Basso, con test Node sui risultati | **Subito** |
| 3 | **Cache in memoria dei movimenti** per la sessione: una sola lettura, aggiornata a ogni scrittura (`add`/`put`/`delete`/`replaceAll`) e invalidata da `versionchange` o da un `BroadcastChannel` tra schede | Toglie la lettura completa (23 ms a 6.000, 188 ms a 50.000) da quasi tutte le viste | Medio: va gestito bene con più schede aperte | Quando si superano circa 3.000 movimenti |
| 4 | **Query per intervallo** dove basta l'anno: cruscotto e insight (anno corrente) con `expensesBetween` invece di leggere tutto | Lettura proporzionale a un anno, non a tutta la storia | Basso | Insieme al 3 |
| 5 | **Aggregati mensili precalcolati** (entrate, uscite, per categoria, spese fisse, conteggio) in uno store, aggiornati a ogni scrittura del mese toccato | Statistiche, cruscotto, saldo cumulato e insight leggono circa 12 righe all'anno invece di migliaia | Medio-alto: è una seconda fonte di verità. Il golden test deve confermare l'equivalenza | Solo oltre circa 20.000 movimenti |
| 6 | **Copie di sicurezza più leggere**: tenerne 3 invece di 10, comprimerle (`CompressionStream` gzip, circa 5–8 volte meno spazio), JSON senza indentazione per Drive e per le copie | Spazio da circa 45 MB a circa 2 MB con 20.000 movimenti | Basso. Le copie restano reimportabili (si decomprimono al download) | Entro 1–2 anni |
| 7 | **Saldi in cache** per "Pagato da" e per il controllo RF-S2, ricalcolati solo quando cambiano i dati (insieme al 3) | Apertura del pannello immediata | Basso | Insieme al 3 |
| 8 | **Calcoli in un Web Worker** per aggregazioni molto grandi | L'interfaccia non si blocca mai | Medio (più codice) | Solo se 3–5 non bastano |
| 9 | **Monitoraggio**: `navigator.storage.estimate()` in Altro › Dati (spazio usato e quota), più rilanciare `tools/perf/bench.js` dopo ogni rilascio importante | Si vede il degrado prima di sentirlo | Nullo | Subito, è economico |

**Non serve**: virtualizzare la lista (bastano le pagine da 300), cambiare database o aggiungere un backend.

## Come verificare ogni intervento

- **Golden test** (`tools/golden`): nessun numero deve cambiare.
- **Scenario E2E** (`tools/e2e`): 992 controlli su tutte le sezioni.
- **Benchmark** (`tools/perf/bench.js`): confronto prima e dopo, sugli stessi dataset.

## Interventi applicati (1 e 2) e risultati

1. **Statistiche**: saldo cumulato, cruscotto annuale e insight si calcolano all'apertura della schermata (`renderStatsGlobals`) e non più a ogni ‹ / ›, cambio di tipo di periodo o dettaglio di categoria. Nessuno dei tre dipende da periodo, filtro o dettaglio: verificato nel codice.
2. **Persone ed Eventi in un solo passaggio**: `Ledger.lastActivities` (ultima voce di ogni persona) e `Ledger.eventSummaries` (riepilogo di ogni evento) fanno un solo giro sui movimenti. Due test Node confrontano i risultati con i calcoli per singola persona o evento, su dati casuali e anche a parità di data.

Benchmark sugli stessi dataset (Mac, ms, mediana di 3, prima → dopo):

| | 600 | 6.000 | 20.000 | 50.000 |
|---|---:|---:|---:|---:|
| **Statistiche: tocco di ‹ / ›** | 63 → **8** | 193 → **9** | 408 → **10** | 1.132 → **8** |
| Persone (elenco) | 22 → 6 | 64 → 28 | 200 → 83 | 477 → 206 |
| Eventi con gli archiviati aperti | 9 → 10 | 56 → 32 | 135 → 78 | 385 → 196 |
| Scheda persona² | 28 → 9 | 83 → 34 | 201 → 105 | 518 → 263 |

² La scheda persona non è cambiata. Il miglioramento viene dal fatto che, prima, i calcoli lanciati dalle Statistiche continuavano in sottofondo e rallentavano anche le misure successive. Vale lo stesso, in parte, per le altre righe.

Il tocco di ‹ / › ora costa **meno di 10 ms a qualunque volume** (sul telefono ~30–50 ms): prima il costo cresceva con i dati. Quello che resta in Persone, Eventi e scheda persona è soprattutto la **lettura completa** dei movimenti (188 ms con 50.000). È il prossimo intervento, il 3, da fare quando si superano circa 3.000 movimenti.

Verifiche: golden test sui dati reali identico (537/537), scenario E2E **992/992** (con un nuovo passo che apre Statistiche dalla barra e controlla che le viste globali siano disegnate e restino invariate con ‹ / ›), `node --test` 49/49.
