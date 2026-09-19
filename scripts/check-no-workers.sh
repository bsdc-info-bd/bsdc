#!/usr/bin/env bash
# BSDC — scripts/check-no-workers.sh
# Purpose : ADR-036 gate: BSDC uses no Cloudflare Worker, at all, ever.
# Owner   : RRC Development / BSDC Platform Team
# Notes   : Sitemap, RSS, dynamic SEO and any other request-time logic run in the build pipeline or
#           in Firebase. A Worker file, a wrangler config or a Pages Functions directory is a
#           violation of the architecture and fails CI.
# Licence : Source-available. Re-deployment or rebranding is not permitted.
set -euo pipefail

EXIT_CODE=0

FORBIDDEN_PATHS='(^|/)(functions)/index\.js$|wrangler\.(toml|json|jsonc)$|\.workers\.dev|cloudflare/workers|/_worker\.js$'

while IFS= read -r file; do
  if echo "$file" | grep -Eq "$FORBIDDEN_PATHS"; then
    printf 'ADR-036 violation: Cloudflare Worker artefact found: %s\n' "$file"
    EXIT_CODE=1
  fi
done < <(git ls-files 2>/dev/null)

# A browser service worker is expected and allowed (ADR-023): it is a static asset served by
# Pages, not server-side logic. Only Worker entry points outside public/ are a violation.
if grep -Rl --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=public \
  -E 'export default \{[^}]*fetch|addEventListener\(["'"'"']fetch' . >/dev/null 2>&1; then
  printf 'ADR-036 violation: a fetch event handler (Worker entry point) was found outside public/.\n'
  grep -Rn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=public \
    -E 'addEventListener\(["'"'"']fetch' . | head -5
  EXIT_CODE=1
fi

if [ "$EXIT_CODE" -ne 0 ]; then
  echo "ADR-036: Cloudflare Workers are forbidden. Use the build pipeline or Firebase."
  exit 1
fi

echo "[bsdc] ADR-036 clean: no Cloudflare Worker artefact in the repository."
