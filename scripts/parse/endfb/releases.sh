#!/bin/bash
# Every ENDF/B release held as ENDF text (brief 15), one after another on the parse box; a log per release in
# /data/endf-<release>.log and a line per release in /data/endf-releases.log. B-VI.8 and older come from the tapes nsr-count counted (raw/nndc/2026-11-07/endf-b*/); B-I has no tape in the lake.
#   ./releases.sh                     # all of them
#   ./releases.sh <release> <s3 key>  # one
cd "$(dirname "$0")"
N=raw/nndc/2026-11-07
R=$N/endf-releases/releases
ALL="B-VIII.1 $R/B-VIII.1/ENDF-B-VIII.1.tar.gz
B-VIII.0 $R/B-VIII.0/ENDF-B-VIII.0.zip
B-VII.1 $R/B-VII.1/ENDF-B-VII.1.tar.gz
B-VII.0 $R/B-VII.0/ENDF-B-VII.0.tar.gz
B-VI.8 $N/endf-b6.8/endfb6.tar.gz
B-V $N/endf-b5/endfb5.tar.gz
B-IV $N/endf-b4/endfb4.tar.gz
B-III $N/endf-b3/endfb3.tar.gz
B-II $N/endf-b2/endfb2.tar.gz"
LIST=${1:+$1 $2}
echo "${LIST:-$ALL}" | while read -r rel key; do
  echo "$(date -u +%FT%TZ) start $rel" >> /data/endf-releases.log
  /opt/parse/bin/python parse.py "$rel" "$key" > "/data/endf-$rel.log" 2>&1
  echo "$(date -u +%FT%TZ) end $rel exit $?" >> /data/endf-releases.log
done
