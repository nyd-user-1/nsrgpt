#!/bin/bash
# Brief 69 (elpis-wire, 2026-11-11): JANIS Web's book rails, one book: every element's page lists its nuclides, every nuclide's page lists its MTs (the
# outline embedded in each page expands only the page's own element and nuclide). Output: rail-<book>.jsonl, one line a
# nuclide {book, element, label, mat, mts:[{label, reac, page}]}. Usage: janis-book-rails.sh <book> [dir]; then
# aws s3 cp <dir>/rail-<book>.jsonl s3://nsr-lake-613473203863/lake/elpis/<date>/janis-rail-<book>.jsonl and run
# book-index.mjs <date>. Books: neutrons gammas protons deuterons tritons he3 alphas (about 2,500 pages in all, a
# few minutes each run in parallel).
B=$1
cd "${2:-.}"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
CJ="cj-$B"
OUT="rail-$B.jsonl"
: > "$OUT"
login() { rm -f "$CJ"; curl -s -c "$CJ" -b "$CJ" -A "$UA" -o /dev/null --max-time 60 https://www.oecd-nea.org/janisweb/; }
# outline <mat> <reac>: the page's outline JSON on stdout (empty on failure; one retry with a fresh session)
outline() {
  for try in 1 2 3; do
    local o
    o=$(curl -s -c "$CJ" -b "$CJ" -L -A "$UA" --max-time 90 "https://www.oecd-nea.org/janisweb/book/$B${1:+/$1/$2}" \
      | grep -m1 "var bookPageOutline" | tr -d '\r' | sed -e "s/^ *var bookPageOutline = jQuery.parseJSON('//" -e "s/');$//")
    if [ -n "$o" ] && echo "$o" | jq -e . >/dev/null 2>&1; then echo "$o"; return; fi
    sleep $((try * 3)); login
  done
}
login
ROOT=$(outline "" "")
[ -z "$ROOT" ] && { echo "no outline for $B"; exit 1; }
echo "$ROOT" | jq -c '.[0].children[] | {label, mat: .matIdStr, reac: .reacIdStr}' | while read -r el; do
  EL=$(echo "$el" | jq -r .label); M=$(echo "$el" | jq -r .mat); R=$(echo "$el" | jq -r .reac)
  O=$(outline "$M" "$R"); sleep 0.3
  [ -z "$O" ] && { echo "{\"book\":\"$B\",\"element\":\"$EL\",\"error\":\"element page\"}" >> "$OUT"; continue; }
  echo "$O" | jq -c --arg el "$EL" '.[0].children[] | select(.label == $el) | .children[] | {label, mat: .matIdStr, reac: .reacIdStr, n: (.children | length), mts: [.children[] | {label, reac: .reacIdStr, page}]}' | while read -r nuc; do
    N=$(echo "$nuc" | jq -r .n)
    if [ "$N" -gt 0 ]; then
      echo "$nuc" | jq -c --arg b "$B" --arg el "$EL" '{book: $b, element: $el, label, mat, mts}' >> "$OUT"
    else
      NM=$(echo "$nuc" | jq -r .mat); NR=$(echo "$nuc" | jq -r .reac); NL=$(echo "$nuc" | jq -r .label)
      P=$(outline "$NM" "$NR"); sleep 0.3
      if [ -z "$P" ]; then echo "{\"book\":\"$B\",\"element\":\"$EL\",\"label\":\"$NL\",\"error\":\"nuclide page\"}" >> "$OUT"; continue; fi
      echo "$P" | jq -c --arg b "$B" --arg el "$EL" --arg nl "$NL" '.[0].children[] | select(.label == $el) | .children[] | select(.label == $nl) | {book: $b, element: $el, label, mat: .matIdStr, mts: [.children[] | {label, reac: .reacIdStr, page}]}' >> "$OUT"
    fi
  done
done
echo "done $B $(wc -l < "$OUT")"
