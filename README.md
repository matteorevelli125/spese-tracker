# Spese Tracker

PWA per tracciare le spese personali. Nessun backend, nessun costo: i dati vivono in **IndexedDB sul dispositivo**.

## Funzionalità (MVP)

- Inserimento rapido: importo → categoria → sottocategoria → salva (3 tap)
- Categorie personalizzate (macro + sottocategorie) in `categories.js`
- Movimenti raggruppati per giorno, eliminazione con tap
- Statistiche per giorno / settimana / mese / anno, con:
  - confronto vs periodo precedente e (per il mese) vs stesso mese dell'anno scorso
  - ripartizione per categoria con drill-down nelle sottocategorie
  - filtro multi-categoria
  - grafico andamento per sotto-periodi
- Budget mensili per macro categoria con indicatore di sforamento (verde / arancio ≥80% / rosso ≥100%)
- **Spese condivise**: "Diviso con" (parti uguali, importi esatti, non partecipo) e "Pagato da" nel wizard; nelle metriche conta solo la **tua quota**
- **Condivise › Persone**: saldo per persona (chi ti deve cosa), storico, rimborsi parziali, "segna come saldato", unione dei doppioni
- **Condivise › Eventi**: vacanze, picnic, uscite… con partecipanti, categoria predefinita, riepilogo e saldi generati; evento in corso preselezionato nel wizard
- Spese ricorrenti (mensili/annuali) inserite automaticamente all'apertura dell'app
- Export JSON (backup completo, v2) e CSV (per Excel), condivisibili via Web Share su Android
- Import backup JSON (v1 e v2) con scelta "Sostituisci tutto" / "Aggiungi" e copia di sicurezza prima di procedere
- Copie di sicurezza automatiche sul dispositivo prima di ogni aggiornamento del database e di ogni import (Altro › Dati)
- Offline completo via service worker, installabile come app (PWA)

## Uso

Serve solo un web server statico (IndexedDB e service worker richiedono http/https):

```sh
npx serve .        # oppure: python3 -m http.server 8080
```

In sviluppo il service worker serve la versione salvata: dopo una modifica attiva *DevTools → Application → Service workers → Update on reload* (o tocca «Aggiorna» quando compare).

Su Android: apri l'URL in Chrome → menu → "Aggiungi a schermata Home".

Aggiornamenti: l'app si apre subito dalla versione salvata sul telefono (anche offline). Dopo un rilascio la nuova versione si scarica in background e compare **«Nuova versione pronta · Aggiorna»**; senza toccarlo, la si usa dall'apertura successiva.

## Deploy gratuito

GitHub Pages: Settings → Pages → branch `main`, root. L'app sarà su
`https://matteorevelli125.github.io/spese-tracker/`.

## Test

```sh
node --test                      # test unitari (money.js, …): Node ≥ 20, nessuna dipendenza
```

Golden test delle metriche (nessun numero deve cambiare tra `main` e un branch): vedi [tools/golden/README.md](tools/golden/README.md).

## Backup

I dati stanno solo sul dispositivo: esporta periodicamente il JSON da **Altro › Dati › Esporta JSON** (o collega Google Drive).

Rilascio delle spese condivise e versione di ritorno: [docs/rilascio-condivise.md](docs/rilascio-condivise.md).
