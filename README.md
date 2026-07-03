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
- Spese ricorrenti (mensili/annuali) inserite automaticamente all'apertura dell'app
- Export JSON (backup completo) e CSV (per Excel), condivisibili via Web Share su Android
- Import backup JSON
- Offline completo via service worker, installabile come app (PWA)

## Uso

Serve solo un web server statico (IndexedDB e service worker richiedono http/https):

```sh
npx serve .        # oppure: python3 -m http.server 8080
```

Su Android: apri l'URL in Chrome → menu → "Aggiungi a schermata Home".

## Deploy gratuito

GitHub Pages: Settings → Pages → branch `main`, root. L'app sarà su
`https://matteorevelli125.github.io/spese-tracker/`.

## Backup

I dati stanno solo sul dispositivo: esporta periodicamente il JSON da **Altro → Esporta JSON**.
