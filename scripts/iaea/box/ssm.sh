#!/usr/bin/env bash
# Run a shell command on the box through SSM and print its output (waits up to ~10 minutes).
#   ./scripts/iaea/box/ssm.sh <instance-id> '<command>'
set -euo pipefail
A=(--profile nysgpt-new --region us-east-2)
ID=$(aws ssm send-command "${A[@]}" --instance-ids "$1" --document-name AWS-RunShellScript \
  --parameters "$(jq -nc --arg c "$2" '{commands: [$c], executionTimeout: ["3600"]}')" --query Command.CommandId --output text)
for i in $(seq 1 120); do
  sleep 5
  S=$(aws ssm get-command-invocation "${A[@]}" --command-id "$ID" --instance-id "$1" --output json 2>/dev/null || echo '{"Status":"Pending"}')
  case $(echo "$S" | jq -r .Status) in
    Pending|InProgress|Delayed) continue;;
    *) echo "$S" | jq -r '.Status, .StandardOutputContent, .StandardErrorContent'; exit 0;;
  esac
done
echo "still running: $ID"
