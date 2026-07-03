// Configurazione backup su Google Drive.
// Il Client ID di un'app web OAuth è pubblico (non è un segreto): può stare nel repo.
// Incolla qui il tuo ID client OAuth 2.0 (tipo "Applicazione web") creato su
// https://console.cloud.google.com → Credenziali.
// Finché resta il placeholder, la funzione di backup mostra "non configurato"
// e il resto dell'app funziona normalmente.
window.DRIVE_CONFIG = {
  clientId: '619853471974-0ne2bkir8kfh6kukh9u85vfsam37k6gq.apps.googleusercontent.com',
  folderName: 'Spese Tracker Backup',
  keepBackups: 3, // quanti file di backup mensili conservare (i più vecchi vengono cancellati)
};
