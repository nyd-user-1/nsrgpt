#!/usr/bin/env bash
# Pull a Wayback list into raw/iaea/2026-11-07 (manifest.json there), chunked so it chains past 15 minutes.
#   ./scripts/iaea/wb.sh <name> [workers] [chunk]       # sync for the first chunk; the rest chains in AWS
set -euo pipefail
cd "$(dirname "$0")"
jq -n --arg l "raw/iaea/2026-11-07/_work/wb-$1.json" --argjson w "${2:-6}" --argjson c "${3:-0}" \
  '{pull: {prefix: "raw/iaea/2026-11-07", list: $l, workers: $w, chunk: (if $c > 0 then $c else null end),
   source: "https://nds.iaea.org/ (IAEA Nuclear Data Section). Cloudflare blocks scripts there, so files come from the Wayback Machine (web.archive.org id_ raw captures); each file keeps its original URL and snapshot date."}}' > events/wb-$1.json
./run.sh events/wb-$1.json | jq -c '{run, run_bytes, manifest, offset, of, next, errors: (.errors[:3] | map(.error))}'
