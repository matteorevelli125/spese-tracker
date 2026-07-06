#!/usr/bin/env bash
# deploy.sh — merge di un branch su main + deploy su GitHub Pages, con retry
# automatico sui fallimenti transitori di Pages e verifica finale del sito.
#
# USO:
#   ./deploy.sh            # usa il branch git corrente
#   ./deploy.sh nome-branch
#
# Richiede: git e gh (GitHub CLI) autenticato.  Non serve altro.
set -euo pipefail

SITE="https://matteorevelli125.github.io/spese-tracker/"
BRANCH="${1:-$(git branch --show-current)}"
cd "$(dirname "$0")"

echo "▶ Branch da rilasciare: $BRANCH"

# 1) Merge su main (saltato se sei già su main) --------------------------------
if [ "$BRANCH" != "main" ]; then
  git push -u origin "$BRANCH" >/dev/null 2>&1 || true
  if ! gh pr view "$BRANCH" >/dev/null 2>&1; then
    gh pr create --base main --head "$BRANCH" --title "$BRANCH" --body "Deploy $BRANCH" >/dev/null
  fi
  echo "▶ Merge della PR su main..."
  gh pr merge "$BRANCH" --merge >/dev/null
fi
git checkout main -q
git pull -q

# 2) Bump automatico della cache del service worker (invalida i client) --------
CUR=$(grep -oE "spese-v[0-9]+" sw.js | head -1)
N=$(echo "$CUR" | grep -oE "[0-9]+$")
NEW="spese-v$((N + 1))"
sed -i '' "s/$CUR/$NEW/" sw.js
git add sw.js
git commit -q -m "chore: bump cache SW $NEW e deploy" || true
echo "▶ Cache SW: $CUR → $NEW"

# 3) Deploy con attesa + retry sui blocchi/fallimenti transitori di Pages ------
deploy_and_wait() {
  git push origin main -q
  sleep 8
  local rid; rid=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')
  for _ in $(seq 1 40); do
    local s; s=$(gh run view "$rid" --json status,conclusion --jq '.status+"/"+(.conclusion//"")' 2>/dev/null || echo "")
    [ "$s" = "completed/success" ] && return 0
    case "$s" in completed/failure|completed/cancelled) return 1 ;; esac
    sleep 6
  done
  return 1  # rimasto bloccato in coda: consideralo da riprovare
}

ok=0
for attempt in 1 2 3; do
  echo "▶ Deploy (tentativo $attempt)..."
  if deploy_and_wait; then ok=1; break; fi
  echo "⚠ Tentativo $attempt non riuscito (intoppo transitorio di Pages), riprovo..."
  git commit --allow-empty -q -m "chore: retry deploy Pages"
done
[ "$ok" = 1 ] && echo "✔ Workflow di deploy completato" || echo "⚠ Deploy non confermato dopo 3 tentativi"

# 4) Verifica che il sito risponda --------------------------------------------
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$SITE")
echo "▶ Sito: HTTP $CODE"
if [ "$CODE" = "200" ]; then
  echo "🎉 Online: $SITE  ($NEW)"
else
  echo "❌ Il sito non risponde 200 — controlla su GitHub → Actions"
  exit 1
fi
