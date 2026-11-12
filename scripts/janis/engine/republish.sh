#!/bin/bash
# Brief 77: rewrite and republish books' page files from the engine's output already on this box (pages.py, NavExport),
# replacing lake/janis/book<tag>/<letter>/ (pages no longer written are removed).
#   bash republish.sh "<letters>" [elpis]
set -uo pipefail
export PATH=$PATH:/snap/bin
TAG=${2:+-elpis}
for L in $1; do
  D=/data/janis/book/$L$TAG; X=/data/janis/export/$L$TAG; P=/data/janis/pages$TAG
  [ -d $D ] || continue
  rm -rf $P/$L
  python3 /opt/engine/pages.py $L $D $X $P
  LABEL=$(ls $D | sed -n 's/^book-\(.*\)-navig\.xml$/\1/p' | head -1)
  (cd / && java -Djava.awt.headless=true -cp "/opt/janis/*:/opt/engine/java" NavExport $D "$LABEL" $P/$L/navigation.json)
  DEST=s3://nsr-lake-613473203863/lake/janis/book$TAG/$L
  aws s3 sync $P/$L $DEST --delete --only-show-errors --exclude pages.json --exclude navigation.json \
    --content-encoding gzip --content-type application/json --cache-control max-age=300
  aws s3 cp $P/$L/pages.json $DEST/pages.json --only-show-errors
  aws s3 cp $P/$L/navigation.json $DEST/navigation.json --only-show-errors --cache-control max-age=300
  echo "$(date -u +%FT%TZ) republished $L$TAG"
done
