#!/usr/bin/env bash
# Pages are static shells (app/(site)/layout.tsx, 2026-11-08): no page or layout file awaits data, reads the
# request, or calls a data store while it renders; data loads after the shell paints, through lib/use-data.ts or
# a route under app/api/. This lists any page.tsx or layout.tsx that breaks the rule and exits 1.
# Awaiting a route's params is allowed: they name the page and read no data.
#   scripts/check-static-shells.sh
set -uo pipefail
cd "$(dirname "$0")/.."

pattern='(^|[^[:alnum:]_])await([^[:alnum:]_]|$)|cookies\(\)|headers\(\)|fetch\(|force-dynamic|lib/chat-data|@aws-sdk|dynamo|athena'
hits=$(find app \( -name page.tsx -o -name layout.tsx \) -not -path 'app/api/*' -print0 \
  | xargs -0 grep -nHE "$pattern" \
  | grep -vE '(^|[^[:alnum:]_])await params([^[:alnum:]_]|$)')

if [ -n "$hits" ]; then
  echo "$hits"
  echo "check-static-shells: $(echo "$hits" | wc -l | tr -d ' ') hit(s); pages and layouts must not read data while they render" >&2
  exit 1
fi
echo "check-static-shells: 0 hits in $(find app \( -name page.tsx -o -name layout.tsx \) -not -path 'app/api/*' | wc -l | tr -d ' ') page and layout files"
