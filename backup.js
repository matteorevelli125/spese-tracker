// Unico serializzatore del backup (RD-5): lo usano l'export JSON (app.js) e il
// backup su Google Drive (drive.js), così i due file non possono divergere.
// `extra` aggiunge campi di intestazione (es. source) dopo version/exported.
//
// Formato v2 (RD-4): come v1 più persone, eventi e rimborsi. Le versioni
// precedenti dell'app lo importano comunque (leggono solo expenses/budgets/recurring).
async function buildBackup(extra = {}) {
  const [expenses, budgets, recurring, people, events, settlements] = await Promise.all([
    DB.allExpenses(), DB.allBudgets(), DB.allRecurring(), DB.all('people'), DB.all('events'), DB.all('settlements'),
  ]);
  return { version: 2, exported: new Date().toISOString(), ...extra, expenses, budgets, recurring, people, events, settlements };
}
