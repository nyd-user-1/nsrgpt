#!/bin/bash
# Brief 77 steps 4-6 for one book: JANIS's book generator (BookRun = BarnBook OFFICIAL), JANIS's Tabler on every series
# of every page (PageExport), then the page files (pages.py) into /data/janis/pages/<letter>/, synced to
# lake/janis/book/<letter>/ (gzip, Content-Encoding gzip) for the CDN.
#   bash book.sh <n|g|p|d|t|h|a> [threads] [material]     # a material runs that nuclide's pages only (a test)
set -uo pipefail
export PATH=$PATH:/snap/bin
L=$1; T=${2:-2}; MAT=${3:-}
BASE="LOCAL:label=BOOK|root=/data/janis/DataPack|url=jdbc:h2:/data/janis/database/BOOK|user=janis|password=janis"
CP="/opt/janis/*:/opt/engine/java"
D=/data/janis/book/$L${MAT:+-$MAT}; X=/data/janis/export/$L${MAT:+-$MAT}; P=/data/janis/pages${MAT:+-test}
mkdir -p $D $X $P
cd $D
t0=$(date +%s)
java -Xmx6g -XX:SoftRefLRUPolicyMSPerMB=20 -Djava.awt.headless=true -Duser.dir=$D -cp "$CP" BookRun "$BASE" $L $T $MAT > $D/run.log 2>&1
echo "$(date -u +%FT%TZ) book $L$MAT: $(ls $D | grep -c '\.jns$') pages in $(( $(date +%s) - t0 )) s"
t1=$(date +%s)
java -Xmx6g -XX:SoftRefLRUPolicyMSPerMB=20 -Djava.awt.headless=true -cp "$CP" PageExport "$BASE" $D $X > $D/export.log 2>&1
echo "$(date -u +%FT%TZ) export $L$MAT: $(tail -1 $D/export.log) in $(( $(date +%s) - t1 )) s"
python3 /opt/engine/pages.py $L $D $X $P
LABEL=$(ls $D | sed -n 's/^book-\(.*\)-navig\.xml$/\1/p' | head -1)
java -Djava.awt.headless=true -cp "$CP" NavExport $D "$LABEL" $P/$L/navigation.json
if [ -z "$MAT" ]; then
  aws s3 cp $P/$L/navigation.json s3://nsr-lake-613473203863/lake/janis/book/$L/navigation.json --only-show-errors --cache-control max-age=300
  aws s3 sync $P/$L s3://nsr-lake-613473203863/lake/janis/book/$L --only-show-errors --exclude pages.json \
    --content-encoding gzip --content-type application/json --cache-control max-age=300
  aws s3 cp $P/$L/pages.json s3://nsr-lake-613473203863/lake/janis/book/$L/pages.json --only-show-errors
  for f in $D/book-*-navig.xml $D/run.log; do aws s3 cp $f s3://nsr-lake-613473203863/lake/janis/engine/book/$L/$(basename $f) --only-show-errors; done
fi
