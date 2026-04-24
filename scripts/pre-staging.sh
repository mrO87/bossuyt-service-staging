#!/usr/bin/env bash
# scripts/pre-staging.sh — runs automatically before every `make staging-up`
#
# 1. Auto-commits any uncommitted changes
# 2. Appends a deploy entry to STAGING-TODO.md with:
#    - placeholder for lib/releases.ts (changenotes)
#    - reminder to add lessons to lib/lessons.ts

set -e

DATE=$(date '+%Y-%m-%d %H:%M')
TODO_FILE="STAGING-TODO.md"

# ── 1. Auto-commit ────────────────────────────────────────────────────────────
UNCOMMITTED=$(git status --porcelain)
if [ -n "$UNCOMMITTED" ]; then
  git add -A
  git commit -m "staging: auto-commit voor deploy ($DATE)"
  echo "✓ Wijzigingen gecommit"
else
  echo "✓ Geen ongecommitte wijzigingen"
fi

SHA=$(git rev-parse --short HEAD)

# Files changed in last commit (or since beginning if only 1 commit)
CHANGED_FILES=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only HEAD)

# ── 2. Prepend TODO entry to STAGING-TODO.md ──────────────────────────────────
ENTRY="## Deploy $DATE  (sha: $SHA)

### Changenotes invullen — lib/releases.ts
- [ ] Versie + datum toevoegen
- [ ] Beschrijving per wijziging schrijven
- Gewijzigde bestanden:
$(echo "$CHANGED_FILES" | sed 's/^/    - /')

### Lessen toevoegen — lib/lessons.ts
- [ ] Lesson-items schrijven voor bovenstaande wijzigingen

---
"

if [ -f "$TODO_FILE" ]; then
  EXISTING=$(cat "$TODO_FILE")
  printf '%s\n%s' "$ENTRY" "$EXISTING" > "$TODO_FILE"
else
  printf '# Staging Deploy TODO\n\n%s' "$ENTRY" > "$TODO_FILE"
fi

echo "✓ TODO toegevoegd aan $TODO_FILE (sha: $SHA)"
