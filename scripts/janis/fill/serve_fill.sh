#!/bin/bash
# Brief 70, on a fill box: serving files for each release given (serve.py endf: nsr.endf_serve_materials and _xs
# partitions; serve.py point_files: the API's xs_index and xs_series, INDEXED serving), one release at a time, a line
# per step in /data/serve.log.
#   setsid nohup /opt/fill/serve_fill.sh <release>… > /data/serve.out 2>&1 &
mkdir -p /data/tmp /opt/duckdb_ext
cd /opt/parse/scripts/serve-structure || exit 1
for r in "$@"; do
  echo "$(date -u +%FT%TZ) endf $r start" >> /data/serve.log
  /opt/parse/bin/python -I serve.py endf "$r" >> /data/serve-$r.log 2>&1; a=$?
  echo "$(date -u +%FT%TZ) endf $r exit $a" >> /data/serve.log
  HOME=/root /opt/parse/bin/python -I serve.py point_files "$r" >> /data/serve-$r.log 2>&1; b=$?
  echo "$(date -u +%FT%TZ) point_files $r exit $b" >> /data/serve.log
done
