#!/bin/bash
# Brief 56, Part C.1: NNDC's POINT libraries above 293.6 K (600, 900, 1200, 1500 and 1800 K for B-VIII.1's POINT2025 and
# B-VIII.0's POINT2018) as releases of their own, copied from point.sh: per archive, parse into endfb_*
# (scripts/parse/endfb/parse.py, the same checks), build its serving rows (serve.py endf_point) and the API's index and
# series files (serve.py point_files), then delete its local files. Progress in /data/point.log.
#   nohup ./point_hot.sh &        (from /opt/parse/scripts/serve-structure)
set -u
cd /opt/parse/scripts
L=/data/point.log
P=raw/nndc/2026-11-07/endf-library
while read -r rel key; do
  [ -z "$rel" ] && continue
  echo "$(date -u +%FT%TZ) start $rel" >> $L
  (cd endfb && /opt/parse/bin/python -I parse.py "$rel" "$key" > "/data/endf-$rel.log" 2>&1)
  echo "$(date -u +%FT%TZ) parsed $rel exit $?" >> $L
  HOME=/root /opt/parse/bin/python -I serve-structure/serve.py endf_point "$rel" > "/data/serve-$rel.log" 2>&1
  echo "$(date -u +%FT%TZ) served $rel exit $?" >> $L
  HOME=/root /opt/parse/bin/python -I serve-structure/serve.py point_files "$rel" > "/data/files-$rel.log" 2>&1
  echo "$(date -u +%FT%TZ) files $rel exit $?" >> $L
  rm -rf "/data/endfb/$rel" /data/tmp/xs-"$rel" /data/tmp/mat-"$rel" /data/tmp/duckdb
done <<LIST
B-VIII.1-point-600K $P/B-VIII.1/POINT2025/files/600K.tar.gz
B-VIII.1-point-900K $P/B-VIII.1/POINT2025/files/900K.tar.gz
B-VIII.1-point-1200K $P/B-VIII.1/POINT2025/files/1200K.tar.gz
B-VIII.1-point-1500K $P/B-VIII.1/POINT2025/files/1500K.tar.gz
B-VIII.1-point-1800K $P/B-VIII.1/POINT2025/files/1800K.tar.gz
B-VIII.0-point-600K $P/B-VIII.0/POINT2018/files/600K.zip
B-VIII.0-point-900K $P/B-VIII.0/POINT2018/files/900K.zip
B-VIII.0-point-1200K $P/B-VIII.0/POINT2018/files/1200K.zip
B-VIII.0-point-1500K $P/B-VIII.0/POINT2018/files/1500K.zip
B-VIII.0-point-1800K $P/B-VIII.0/POINT2018/files/1800K.zip
LIST
echo "$(date -u +%FT%TZ) point_hot done" >> $L
