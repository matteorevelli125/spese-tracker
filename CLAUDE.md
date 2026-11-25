@AGENTS.md

## Claude Code

- Le anteprime si avviano dalle configurazioni di `.claude/launch.json`:
  - `spese` (porta 8123): l'app;
  - `golden-main` (porta 8131): il worktree `private/main-wt`, cioè la versione di riferimento;
  - `golden-branch` (porta 8132): il branch corrente.

  Il golden test e l'E2E girano su 8131 e 8132.
- Le regole per tipo di file sono in `.claude/rules/` e si caricano da sole quando tocchi i file corrispondenti.
- Le spiegazioni all'utente vanno scritte in italiano semplice: cosa cambia sul telefono e cosa è stato verificato. Prima di ogni `./deploy.sh` fai una domanda di conferma esplicita.
