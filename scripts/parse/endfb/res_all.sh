#!/bin/bash
# Brief 56: MF2 and MF32 for every release, in the brief's order (B-VIII.1 first; File 32 is absent from B-IV and older),
# one after another; each release's log is /data/mf2-<release>.log, one line per release in /data/endf-releases.log.
#   nohup ./res_all.sh [<release>…] &
cd "$(dirname "$0")"
ORDER=${*:-"B-VIII.1 B-VIII.0 B-VII.1 B-VII.0 B-VI.8 JEFF-3.3 JENDL-5 TENDL-2023 CENDL-3.2 B-V B-IV B-III B-II"}
for rel in $ORDER; do
  ./releases.sh --mf=2,32 "$rel"
  rm -rf "/data/endfb/$rel/src"  # the archive, once its tables are up (the disk holds a few releases' archives at most)
done
echo "$(date -u +%FT%TZ) res_all done" >> /data/endf-releases.log
