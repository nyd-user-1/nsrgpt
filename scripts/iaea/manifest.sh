#!/usr/bin/env bash
# Build one manifest.json per source folder from what the lanes recorded (brief 11):
#   - the folder's Lambda manifest (iaea-pull), if any
#   - the box's mirror results (raw/iaea/2026-11-07/_work/box/<job>/results.jsonl, and raw/jaea/… for JAEA tests)
#   - the box's Wayback results (raw/iaea/2026-11-07/_work/box/wb-*/results.jsonl)
#   - not_taken entries from scripts/iaea/not-taken/<source>.json (walls, phase 3-4, deferred, held)
# Files are deduplicated by key (a done entry wins). Spend comes from scripts/iaea/spend.json.
#   ./scripts/iaea/manifest.sh <source> <prefix>     e.g. iaea raw/iaea/2026-11-07
set -euo pipefail
cd "$(dirname "$0")"
SRC=$1; PREFIX=${2%/}
A=(--profile nysgpt-new --region us-east-2)
B=s3://nsr-lake-613473203863
T=$(mktemp -d)
aws s3 cp "$B/$PREFIX/manifest.json" "$T/lambda.json" "${A[@]}" --only-show-errors 2>/dev/null || echo '{}' > "$T/lambda.json"
aws s3 ls "$B/raw/iaea/2026-11-07/_work/box/" "${A[@]}" | awk '/PRE/{print $2}' | tr -d / > "$T/jobs"
: > "$T/box.jsonl"
while read -r j; do
  aws s3 cp "$B/raw/iaea/2026-11-07/_work/box/$j/results.jsonl" - "${A[@]}" 2>/dev/null | jq -c --arg j "$j" '. + {job: $j}' >> "$T/box.jsonl" || true
done < "$T/jobs"
NT=not-taken/$SRC.json
[ -f "$NT" ] || { echo '[]' > "$T/nt.json"; NT=$T/nt.json; }
jq -n --arg src "$SRC" --arg p "$PREFIX/" --slurpfile lam "$T/lambda.json" --slurpfile nt "$NT" --slurpfile spend spend.json \
  --rawfile box "$T/box.jsonl" '
  ($box | split("\n") | map(select(length > 0) | fromjson)) as $bx
  | (($lam[0].files // []) | map(select((.status // "done") == "done" or .status == "skipped")) | map(. + {via: (.via // (if .original then "wayback-lambda" else "lambda" end))})) as $lf
  | ($bx | map(select(.key and (.key | startswith($p)) and (.key | contains("/_work/") | not)))) as $mine
  | ([$lf[], ($mine[] | select(.status == "done" or .status == "skipped"))]
     | group_by(.key) | map((map(select(.status == "done")) + .)[0])
     | map({url: (.original // .url), key, bytes, sha256, snapshot, via: (.via // (if .job then "box-chrome" else null end)),
            group, phase}) | map(with_entries(select(.value != null)))) as $files
  | ($files | map(.key)) as $have
  | {source: $src, prefix: ($p | rtrimstr("/")), built: (now | todate),
     how: "scripts/iaea/ (iaea-pull Lambda, box/mirror.py through real Chrome, box/wbget.py from the Wayback Machine) in nsrgpt; services/iaea-pull, services/nsr-fetch",
     counts: {files: ($files | length), bytes: ($files | map(.bytes // 0) | add // 0)},
     files: $files,
     not_taken: (((($nt[0] // []) + ($lam[0].not_taken // [])) + ($mine | map(select(.status == "not_taken") | {url, phase, reason, bytes_offered}) | unique_by(.url)))
                 | map(with_entries(select(.value != null))) | unique_by(.url)),
     dead_links: (($lam[0].dead_links // []) + [$mine[], ($lam[0].files // [])[] | select(.status == "dead" or (.status == "error" and ((.error // "") | test("404")))) | {url: (.original // .url), http: (.http // 404)}]
                  | unique_by(.url) | map(select(.url as $u | ($files | map(.url) | index($u)) == null))),
     errors_retry_later: ([$mine[], ($lam[0].files // [])[] | select(.status == "error") | {url: (.original // .url), key, error: ((.error // "")[:120])}]
                  | unique_by(.key) | map(select(.key as $k | ($have | index($k)) == null))),
     spend: ($spend[0][$src] // $spend[0].all)}
  | .counts.not_taken = (.not_taken | length) | .counts.dead_links = (.dead_links | length) | .counts.errors_retry_later = (.errors_retry_later | length)' > "$T/manifest.json"
jq -c '{source, counts}' "$T/manifest.json"
aws s3 cp "$T/manifest.json" "$B/$PREFIX/manifest.json" "${A[@]}" --only-show-errors
rm -rf "$T"
