// Unico serializzatore del backup (RD-5): lo usano l'export JSON (app.js) e il
// backup su Google Drive (drive.js), così i due file non possono divergere.
// `extra` aggiunge campi di intestazione (es. source) dopo version/exported.
async function buildBackup(extra = {}) {
  const [expenses, budgets, recurring] = await Promise.all([DB.allExpenses(), DB.allBudgets(), DB.allRecurring()]);
  return { version: 1, exported: new Date().toISOString(), ...extra, expenses, budgets, recurring };
}
