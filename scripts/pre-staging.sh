#!/usr/bin/env bash
# scripts/pre-staging.sh — runs automatically before every `make staging-up`
#
# 1. Bumps the minor version in lib/releases.ts
# 2. Auto-commits all changes (including the version bump)
# 3. Appends a deploy entry to STAGING-TODO.md with:
#    - the new version number
#    - placeholder for lib/releases.ts (changenotes)
#    - reminder to add lessons to lib/lessons.ts

set -e

DATE=$(date '+%Y-%m-%d %H:%M')
TODO_FILE="STAGING-TODO.md"

# ── 1. Bump version ───────────────────────────────────────────────────────────
NEW_VERSION=$(node scripts/bump-version.js)

# ── 2. Auto-commit (includes the version bump + any other changes) ────────────
UNCOMMITTED=$(git status --porcelain)
if [ -n "$UNCOMMITTED" ]; then
  git add -A
  git commit -m "staging $NEW_VERSION: auto-commit voor deploy ($DATE)"
  echo "✓ Wijzigingen gecommit"
else
  echo "✓ Geen ongecommitte wijzigingen"
fi

SHA=$(git rev-parse --short HEAD)

# Files changed in this commit
CHANGED_FILES=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only HEAD)

# ── 3. Prepend TODO entry to STAGING-TODO.md ──────────────────────────────────
ENTRY="## $NEW_VERSION — Deploy $DATE  (sha: $SHA)

### Changenotes invullen — lib/releases.ts
- [ ] Beschrijving per wijziging schrijven (placeholder staat klaar)
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

echo "✓ TODO toegevoegd aan $TODO_FILE"
echo ""
echo "▶ Staging build starten met $NEW_VERSION (sha: $SHA)..."
