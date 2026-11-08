#!/bin/bash
# Brief 17, agent-1's go: NNDC's reconstructed POINT libraries as ENDF/B releases of their own (one per temperature),
# so /endf/xs never charts the bare MF3 background inside a resonance range. Runs on the parse box from
# /opt/parse/scripts/: rebuilds the nine releases' serving tables (new columns lrp, n_served, thinned), then per POINT
# archive parses it into endfb_* (scripts/parse/endfb/parse.py, same checks) and builds its serving rows
# (serve.py endf_point), deleting its local files after. Progress in /data/point.log.
set -u
cd /opt/parse/scripts
L=/data/point.log
P=raw/nndc/2026-11-07/endf-library
/opt/parse/bin/python serve-structure/serve.py endf --fresh > /data/serve-endf.log 2>&1
echo "$(date -u +%FT%TZ) endf --fresh exit $?" >> $L
while read -r rel key; do
  [ -z "$rel" ] && continue
  echo "$(date -u +%FT%TZ) start $rel" >> $L
  (cd endfb && /opt/parse/bin/python parse.py "$rel" "$key" > "/data/endf-$rel.log" 2>&1)
  echo "$(date -u +%FT%TZ) parsed $rel exit $?" >> $L
  /opt/parse/bin/python serve-structure/serve.py endf_point "$rel" > "/data/serve-$rel.log" 2>&1
  echo "$(date -u +%FT%TZ) served $rel exit $?" >> $L
  rm -rf "/data/endfb/$rel" /data/tmp/xs-"$rel" /data/tmp/duckdb
done <<LIST
B-VIII.1-point-293.6K $P/B-VIII.1/POINT2025/files/293.6K.tar.gz
B-VIII.1-point-0K $P/B-VIII.1/POINT2025/files/0K.tar.gz
B-VIII.0-point-293.6K $P/B-VIII.0/POINT2018/files/293.6K.zip
B-VIII.0-point-0K $P/B-VIII.0/POINT2018/files/0K.zip
LIST
echo "$(date -u +%FT%TZ) done" >> $L
