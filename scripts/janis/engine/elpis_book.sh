#!/bin/bash
# Brief 77 step 10 on a JANIS box with the BOOK base: the libraries Elpis holds beyond JANIS's book go into the base with
# JANIS's importer, then JANIS's own book engine runs with them added (BookEngine -Dextra, the ELPIS run), so the ELPIS side
# of the book is made by the same code and rules as JANIS's side. Pages go to lake/janis/book-elpis/<letter>/.
#   - packaged by NEA but not drawn by JANIS's book: JENDL-5 (JENDL 5.0), JEFF-4.0 (janis/data packages, as evaluated
#     with NEA's processed MF3);
#   - no NEA package: ENDF/B-VIII.1, TENDL-2023, ENDF/B-V, B-IV, B-III, B-II, processed by elpis.py the way NEA processed
#     its packages (NJOY reconr + broadr 293.6 K into the evaluation's neutron MF3) and fetched from the lake.
#   bash elpis_book.sh import "<names>"  # the imports of those (JENDL-5 JEFF-4.0 B-VIII.1 TENDL-2023 B-V B-IV B-III B-II), each once
#   bash elpis_book.sh run <letters>   # the ELPIS run for those books
set -uo pipefail
export PATH=$PATH:/snap/bin
J=/data/janis; L=s3://nsr-lake-613473203863/lake/_raw/janis-data
BASE="LOCAL:label=BOOK|root=$J/DataPack|url=jdbc:h2:$J/database/BOOK|user=janis|password=janis"
imp() { java -Xmx3500m -cp "/opt/janis/*" org.nea.janis.format.tools.Import "$BASE" "$@"; }
EXTRA="ENDF/B-VIII.1=#8b0000,JEFF-4.0=#c71585,JENDL-5=#006400,TENDL-2023=#1e90ff,ENDF/B-V=#b22222,ENDF/B-IV=#cd5c5c,ENDF/B-III=#e9967a,ENDF/B-II=#f08080"
mkdir -p $J/done $J/logs
PY=/opt/py/bin/python; [ -x $PY ] || PY=/opt/parse/bin/python
if [ "$1" = import ]; then
  WANT=" ${2:-JENDL-5 JEFF-4.0 B-VIII.1 TENDL-2023 B-V B-IV B-III B-II} "
  for spec in "JENDL|5.0|JENDL-5" "JEFF|4.0|JEFF-4.0"; do
    IFS='|' read -r pkg ver label <<< "$spec"
    [[ "$WANT" == *" $label "* ]] || continue
    [ -f $J/done/ELPIS-$label ] && continue
    D=$J/DataPack/elpis-$pkg-$ver; mkdir -p $D
    jq -r --arg p "$pkg" --arg v "$ver" '.rows[] | select(.package==$p and .version==$v) | .file' /opt/engine/janis-data-manifest.json | grep '\.jpk$' |
      while read -r f; do [ -s $D/$f ] || aws s3 cp "$L/$pkg/$ver/$f" $D/$f --only-show-errors; done
    rc=0
    for f in $(ls $D | grep -v '\.part[2-9][0-9]*of'); do imp ENDF "$label" $D/$f >> $J/logs/ELPIS-$label.log 2>&1 || rc=$?; done
    [ $rc = 0 ] && touch $J/done/ELPIS-$label
    echo "$(date -u +%FT%TZ) $label rc=$rc"
  done
  for spec in "B-VIII.1|ENDF/B-VIII.1" "TENDL-2023|TENDL-2023" "B-V|ENDF/B-V" "B-IV|ENDF/B-IV" "B-III|ENDF/B-III" "B-II|ENDF/B-II"; do
    IFS='|' read -r rel label <<< "$spec"
    [[ "$WANT" == *" $rel "* ]] || continue
    [ -f $J/done/ELPIS-$rel ] && continue
    $PY /opt/engine/elpis.py fetch $rel > $J/logs/ELPIS-fetch-$rel.log 2>&1
    D=$J/DataPack/elpis-$rel; rm -rf $D; mkdir -p $D && mv /data/elpis/$rel/tapes/* $D/
    [ -n "$(ls $D)" ] || { echo "no tapes for $rel"; continue; }
    imp ENDF "$label" $D > $J/logs/ELPIS-$rel.log 2>&1 && touch $J/done/ELPIS-$rel
    echo "$(date -u +%FT%TZ) $label $(ls $D | wc -l) tapes, $(grep -c '^Total time' $J/logs/ELPIS-$rel.log) imports"
  done
fi
if [ "$1" = run ]; then
  for B in $2; do EXTRA=$EXTRA bash /opt/engine/book.sh ${B} 2; done
fi
