// Configurazione backup su Google Drive.
//
// Il Client ID ora si inserisce direttamente nell'app (Altro → Backup Google
// Drive) e viene salvato sul dispositivo, così NON deve stare nel repo.
// Questo file resta solo come fallback opzionale: se preferisci "cablare" il
// Client ID nel codice (utile per un deploy self-hosted), incollalo qui sotto.
// Il Client ID di un'app web OAuth è comunque pubblico (non è un segreto): la
// protezione reale è l'allowlist delle origini autorizzate lato Google Cloud.
window.DRIVE_CONFIG = {
  clientId: '', // lascia vuoto per inserirlo dall'app
  folderName: 'Spese Tracker Backup',
  keepBackups: 3, // quanti file di backup mensili conservare
};
