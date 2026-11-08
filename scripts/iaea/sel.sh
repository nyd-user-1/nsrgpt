#!/usr/bin/env bash
# Select files from the Wayback list of IAEA's ENDF tree and write them as a pull list.
#   ./scripts/iaea/sel.sh <name> <include-regex> [list]    → raw/iaea/2026-11-07/_work/wb-<name>.json
set -euo pipefail
cd "$(dirname "$0")"
LIST=${3:-raw/iaea/2026-11-07/_work/cdx-www-nds-download-endf.json}
jq -n --arg l "$LIST" --arg inc "$2" --arg out "raw/iaea/2026-11-07/_work/wb-$1.json" \
  '{select: {list: $l, strip: "/public/download-endf/", depth: 1, include: $inc, out: $out, show: 50}}' > events/sel-$1.json
./run.sh events/sel-$1.json | jq -c '{selected, groups: (.summary | map_values(.n))}'
