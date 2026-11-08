#!/usr/bin/env bash
# Send one event to Lambda iaea-pull and print the reply. One call at a time from the Mac.
#   ./scripts/iaea/run.sh events/x.json         # waits (up to 15 minutes)
#   ASYNC=1 ./scripts/iaea/run.sh events/x.json # returns at once; read the manifest later
set -euo pipefail
A=(--profile nysgpt-new --region us-east-2)
OUT=$(mktemp)
if [ "${ASYNC:-}" = 1 ]; then
  aws lambda invoke --function-name iaea-pull --invocation-type Event --cli-binary-format raw-in-base64-out \
    --payload "file://$1" "${A[@]}" "$OUT" --query StatusCode --output text
else
  aws lambda invoke --function-name iaea-pull --cli-binary-format raw-in-base64-out --cli-read-timeout 0 \
    --payload "file://$1" "${A[@]}" "$OUT" --query FunctionError --output text >/dev/null
  cat "$OUT"; echo
fi
rm -f "$OUT"
