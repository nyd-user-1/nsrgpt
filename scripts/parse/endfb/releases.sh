#!/bin/bash
# Every ENDF release held as ENDF text (briefs 15, 43), one after another on the parse box; a log per release in
# /data/endf-<release>.log and a line per release in /data/endf-releases.log. B-VI.8 and older come from the tapes
# nsr-count counted (raw/nndc/2026-11-07/endf-b*/); B-I has no tape in the lake. CENDL-3.2, JEFF-3.3, JENDL-5 and
# TENDL-2023 are one archive per sublibrary: IAEA's backup zips, and NEA's archives for JEFF-3.3's alphas, deuterons,
# gammas, helium3s and protons (NEA has no JEFF-3.3 tritons archive).
#   ./releases.sh                              # all of them
#   ./releases.sh <release> [<s3 key>…]        # one (its keys from the list below unless given)
#   ./releases.sh --mf=8,33 [<release>]        # part B, MF8 and MF33 tables; logs /data/mf-<release>.log
cd "$(dirname "$0")"
N=raw/nndc/2026-11-07
R=$N/endf-releases/releases
I=raw/iaea/2026-11-07/public/download-endf
J=$I/JEFF-3.3/_backup-by-NSUB/zip/jeff-3-3
E=raw/nea/2026-11-07/dbdata/jeff/jeff33/downloads/JEFF33
K=$I/JENDL-5-Aug2023/backup/jendl-5
T=$I/TENDL-2023/backup/tendl-2023
ALL="B-VIII.1 $R/B-VIII.1/ENDF-B-VIII.1.tar.gz
B-VIII.0 $R/B-VIII.0/ENDF-B-VIII.0.zip
B-VII.1 $R/B-VII.1/ENDF-B-VII.1.tar.gz
B-VII.0 $R/B-VII.0/ENDF-B-VII.0.tar.gz
B-VI.8 $N/endf-b6.8/endfb6.tar.gz
B-V $N/endf-b5/endfb5.tar.gz
B-IV $N/endf-b4/endfb4.tar.gz
B-III $N/endf-b3/endfb3.tar.gz
B-II $N/endf-b2/endfb2.tar.gz
CENDL-3.2 $I/CENDL-3.2/backup/cendl-3-2_n.sublib.zip
JEFF-3.3 ${J}_n.sublib.zip ${J}_tsl.sublib.zip ${J}_decay.sublib.zip ${J}_nfpy.sublib.zip ${J}_sfpy.sublib.zip $E-g.tgz $E-p.tgz $E-d.tgz $E-he3.tgz $E-a.tgz
JENDL-5 ${K}_n.sublib.zip ${K}_g.sublib.zip ${K}_p.sublib.zip ${K}_tsl.sublib.zip ${K}_d.sublib.zip ${K}_photo.sublib.zip ${K}_decay.sublib.zip ${K}_he4.sublib.zip ${K}_e.sublib.zip ${K}_nfpy.sublib.zip ${K}_sfpy.sublib.zip ${K}_ard.sublib.zip
TENDL-2023 ${T}_n.sublib.zip ${T}_g.sublib.zip ${T}_p.sublib.zip ${T}_d.sublib.zip ${T}_t.sublib.zip ${T}_he3.sublib.zip ${T}_he4.sublib.zip"
MF=
case "$1" in --mf=*) MF=$1; shift;; esac
ONE=$1; shift
GIVEN="$*"
echo "$ALL" | while read -r rel keys; do
  [ -n "$ONE" ] && [ "$rel" != "$ONE" ] && continue
  [ -n "$GIVEN" ] && keys=$GIVEN
  log=/data/endf-$rel.log; [ -n "$MF" ] && log=/data/mf-$rel.log
  echo "$(date -u +%FT%TZ) start $rel $MF" >> /data/endf-releases.log
  # shellcheck disable=SC2086  # keys split on spaces
  /opt/parse/bin/python -I parse.py "$rel" $keys $MF > "$log" 2>&1
  rc=$?
  echo "$(date -u +%FT%TZ) end $rel $MF exit $rc" >> /data/endf-releases.log
done
