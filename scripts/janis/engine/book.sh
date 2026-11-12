#!/bin/bash
# Brief 77 steps 4-6 for one book: JANIS's book generator in one pass (BookEngine: JANIS's searches, plotter threads and
# JNS/XML writers, plus JANIS's Tabler on every series of every page), the page files (pages.py) into
# /data/janis/pages/<letter>/, JANIS's outline (NavExport), all synced to lake/janis/book/<letter>/ (pages gzip with
# Content-Encoding gzip) for the CDN.
#   bash book.sh <n|g|p|d|t|h|a> [threads] [material]     # a material runs that nuclide's pages only (a test)
#   EXTRA="<library>=<#rrggbb>,..." bash book.sh ...       # step 10: libraries JANIS has no package for, added (ELPIS)
set -uo pipefail
export PATH=$PATH:/snap/bin
L=$1; T=${2:-2}; MAT=${3:-}
BASE="LOCAL:label=BOOK|root=/data/janis/DataPack|url=jdbc:h2:/data/janis/database/BOOK|user=janis|password=janis"
CP="/opt/janis/*:/opt/engine/java"
TAG=${EXTRA:+-elpis}
D=/data/janis/book/$L$TAG${MAT:+-$MAT}; X=/data/janis/export/$L$TAG${MAT:+-$MAT}; P=/data/janis/pages$TAG${MAT:+-test}
mkdir -p $D $X $P
cd $D
t0=$(date +%s)
java -Xmx6g -XX:SoftRefLRUPolicyMSPerMB=20 -Djava.awt.headless=true -Duser.dir=$D ${EXTRA:+-Dextra=$EXTRA} -cp "$CP" BookEngine "$BASE" $L $T $X $MAT > $D/run.log 2>&1
echo "$(date -u +%FT%TZ) book $L$TAG$MAT: $(ls $D | grep -c '\.jns$') pages, $(grep -o 'TABLER END.*' $D/run.log) in $(( $(date +%s) - t0 )) s"
python3 /opt/engine/pages.py $L $D $X $P
LABEL=$(ls $D | sed -n 's/^book-\(.*\)-navig\.xml$/\1/p' | head -1)
java -Djava.awt.headless=true -cp "$CP" NavExport $D "$LABEL" $P/$L/navigation.json
if [ -z "$MAT" ]; then
  DEST=s3://nsr-lake-613473203863/lake/janis/book$TAG/$L
  aws s3 sync $P/$L $DEST --only-show-errors --exclude pages.json --exclude navigation.json \
    --content-encoding gzip --content-type application/json --cache-control max-age=300
  aws s3 cp $P/$L/pages.json $DEST/pages.json --only-show-errors
  aws s3 cp $P/$L/navigation.json $DEST/navigation.json --only-show-errors --cache-control max-age=300
  for f in $D/book-*-navig.xml $D/run.log $X/items.tsv; do aws s3 cp $f s3://nsr-lake-613473203863/lake/janis/engine/book$TAG/$L/$(basename $f) --only-show-errors; done
fi
