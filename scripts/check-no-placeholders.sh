#!/usr/bin/env bash
# BSDC — scripts/check-no-placeholders.sh
# Purpose : LAW-02 gate: no placeholder, demo, sample or fake content may ship.
# Owner   : RRC Development / BSDC Platform Team
# Notes   : Scans tracked source for forbidden marker words. Test fixtures are generated at
#           runtime only and never committed, so any hit here is a real violation.
# Licence : Source-available. Re-deployment or rebranding is not permitted.
set -euo pipefail

# Only markers that mean "this is fake content" are forbidden. The words `placeholder` and
# `fake` in their ordinary technical senses (CSS ::placeholder, a skeleton placeholder, a fake
# test double) are legitimate and are deliberately not matched.
PATTERN='TODO|FIXME|XXX:|HACK|Lorem ipsum|John Doe|jane doe|example\.com|placeholder (data|content|text|value|user|image)|dummy (data|content|text)|sample (data|user|content)|fake (data|user|content)|coming ?soon|comingSoon|\bTBD\b'
EXCLUDE='(^|/)(node_modules|dist|coverage|android|build/output|\.git)/|\.md$|scripts/check-no-placeholders\.sh|tools/lint/'

EXIT_CODE=0

while IFS= read -r file; do
  if echo "$file" | grep -Eq "$EXCLUDE"; then
    continue
  fi
  if grep -En "$PATTERN" "$file" >/dev/null 2>&1; then
    grep -En "$PATTERN" "$file" | while IFS= read -r hit; do
      printf 'LAW-02 violation: %s :: %s\n' "$file" "$hit"
    done
    EXIT_CODE=1
  fi
done < <(git ls-files 2>/dev/null || find . -type f -not -path './node_modules/*' -not -path './.git/*' -not -path './dist/*')

if [ "$EXIT_CODE" -ne 0 ]; then
  echo "LAW-02: placeholder content found. Remove it or log the constraint in PUBLIC_LIMITATIONS.md."
  exit 1
fi

echo "[bsdc] LAW-02 clean: no placeholder, demo or sample content in tracked files."
