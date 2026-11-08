#!/usr/bin/env bash
# Brief 18's checks from the Mac: each request three times through CloudFront (first hit, cached, then warm but not
# cached via an extra parameter), the latencies and the top three hits, as JSON lines to stdout.
#   ./scripts/parse/search/verify.sh [tag] > verify.jsonl      tag: any fresh string, so the first hit misses the cache
set -euo pipefail
C=https://daw1qggkn69lv.cloudfront.net
TAG=${1:-$(date +%s)}
T=$(mktemp -d)
for p in "/search?q=U-235%20fission" "/search?q=60Co%20gammas" "/search?q=10001002" "/search?q=JEFF-3.3%20Fe-56" \
         "/search?q=Janssens%202011" "/suggest?q=Cs-1"; do
  first=$(curl -s -o $T/a.json -D $T/a.h -w "%{time_total}" "$C$p&t=$TAG")
  cached=$(curl -s -o $T/b.json -D $T/b.h -w "%{time_total}" "$C$p&t=$TAG")
  warm=$(curl -s -o $T/c.json -D $T/c.h -w "%{time_total}" "$C$p&t=$TAG-w")
  jq -c --arg p "$p" --arg first "$first" --arg cached "$cached" --arg warm "$warm" \
     --arg xa "$(grep -i '^x-cache' $T/a.h | tr -d '\r' | cut -c10-)" --arg xb "$(grep -i '^x-cache' $T/b.h | tr -d '\r' | cut -c10-)" \
     '{request: $p, first_s: ($first|tonumber), cached_s: ($cached|tonumber), warm_uncached_s: ($warm|tonumber),
       cache: [$xa, $xb], took_ms, total, cold_start,
       top3: ([.hits[0:3][]? | {type, id, name, url_path}] + [.suggestions[0:3][]? | {name, kind}])}' $T/a.json
done
rm -rf $T
