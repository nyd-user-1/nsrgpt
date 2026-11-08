#!/usr/bin/env bash
# Build pull events for NNDC Sigma's five libraries we lacked (JEFF-3.1, JENDL-4.0, JENDL-3.3, ROSFOND, CENDL-3.1),
# from Sigma's static directory tree (tree_items1.js neutrons, tree_items2.js the other sublibraries). Each item is a
# material page; iaea-pull resolves its getDataset.jsp link (the ENDF-6 text, served inside <html><pre>) and copies it.
#   ./scripts/iaea/sigma-list.sh <outdir>      # writes <outdir>/sigma-<lib>.json, one pull event per library
set -euo pipefail
OUT=${1:?outdir}; mkdir -p "$OUT"
T=$(mktemp -d)
for n in 1 2; do curl -s -m 120 -A "Mozilla/5.0" "https://www.nndc.bnl.gov/sigma/tree/tree_items$n.js" -o "$T/t$n.js"; done
cat "$T/t1.js" "$T/t2.js" | awk -v Q="'" '
  function slug(s) { gsub(/<[^>]*>/, "", s); gsub(/^ +| +$/, "", s); gsub(/[^A-Za-z0-9.+-]+/, "_", s); return s }
  BEGIN {
    lib["200"]="jeff-3.1"; lib["300"]="jendl-3.3"; lib["310"]="jendl-4.0"; lib["500"]="rosfond"; lib["700"]="cendl-3.1"
    sub_["10"]="n"; sub_["12"]="tsl"; sub_["19"]="std"; sub_["0"]="g"; sub_["10010"]="p"; sub_["10020"]="d"; sub_["10030"]="t"
    sub_["20030"]="he3"; sub_["20040"]="a"; sub_["4"]="decay"; sub_["11"]="nfy"; sub_["5"]="sfy"; sub_["3"]="photo"; sub_["6"]="ard"; sub_["113"]="e"
  }
  /^\[.*, 0, 0,$/ { split($0, q, Q); mat = slug(q[2]); next }
  /getTree.jsp\?nlibid=/ {
    match($0, /nlibid=[0-9]+&nsub=[0-9]+&z=[0-9]+&a=[0-9]+&liso=[0-9]+/); u = substr($0, RSTART, RLENGTH)
    split(u, kv, /[=&]/); id = kv[2]; ns = kv[4]; liso = kv[10]
    if (!(id in lib)) next
    k = lib[id] "/" sub_[ns] "/" mat (liso > 0 ? "m" liso : "")
    if (k in seen) next; seen[k] = 1
    printf "%s\thttps://www.nndc.bnl.gov/sigma/getTree.jsp?%s\n", lib[id], u >> "'"$T"'/items.tsv"
    printf "%s\n", k >> "'"$T"'/keys.txt"
  }'
paste "$T/items.tsv" "$T/keys.txt" | awk -F'\t' -v OUT="$OUT" '
  { f = OUT "/sigma-" $1 ".items"; printf "%s{\"page\": \"%s\", \"key\": \"raw/nndc-sigma/2026-11-07/%s.html\", \"size\": 0, \"group\": \"%s\", \"phase\": 1}", (n[f]++ ? ",\n" : ""), $2, $3, $1 > f }'
for f in "$OUT"/sigma-*.items; do
  l=$(basename "$f" .items)
  { printf '{"pull": {"prefix": "raw/nndc-sigma/2026-11-07", "source": "https://www.nndc.bnl.gov/sigma/ (NNDC Sigma: ENDF-6 text per material, as served inside <html><pre>)", "workers": 8, "pick": "getDataset\\\\.jsp\\\\?evalid=[0-9]+", "items": [\n'; cat "$f"; printf '\n]}}\n'; } > "$OUT/$l.json"
  rm "$f"; echo "$l $(grep -c '"page"' "$OUT/$l.json")"
done
rm -rf "$T"
