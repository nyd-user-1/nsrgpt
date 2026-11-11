#!/bin/bash
# Brief 70: the releases JANIS Web lists that the lake lacked, parsed as releases.sh parses the thirteen (same parse.py,
# same parts, same logs: /data/endf-<release>.log, /data/mf-<release>.log, /data/mf2-<release>.log, a line per run in
# /data/endf-releases.log). One line per release: its name as JANIS prints it, slashes to hyphens (ENDF/B's "ENDF/"
# dropped as the lake does), then its archives. A key ending in #<token> names the sublibrary of an archive or tape
# whose name carries none; a word <prefix>/*#<token> stands for every .zip under that prefix (IAEA's per-material
# zips), each read as that sublibrary.
#   ./fill.sh <release>                 # part A
#   ./fill.sh --mf=8,33 <release>       # part B
#   ./fill.sh --mf=2,32 <release>       # part C
#   ./fill.sh --list                    # the releases and their key words
cd "$(dirname "$0")"
set -f  # the */*#t words are S3 prefixes, never globs
I=raw/iaea/2026-11-07/public/download-endf
J=lake/_raw
ALL="JEFF-4.0 $I/JEFF-4.0/backup/jeff-4-0_n.sublib.zip $I/JEFF-4.0/backup/jeff-4-0_p.sublib.zip $I/JEFF-4.0/backup/jeff-4-0_tsl.sublib.zip $I/JEFF-4.0/backup/jeff-4-0_decay.sublib.zip $I/JEFF-4.0/backup/jeff-4-0_nfpy.sublib.zip $I/JEFF-4.0/backup/jeff-4-0_sfpy.sublib.zip
IRDFF-II $I/IRDFF-II/backup/irdff-ii_n.sublib.zip
B-VI.8-HE $I/ENDF-HE-VI/NEUTRON/endf-he-vi_n.zip#n $I/ENDF-HE-VI/PROTON/endf-he-vi_p.zip#p
JEF-2.2 $I/JEF-2.2/backup/jef-2-2_n.sublib.zip $I/JEF-2.2/backup/jef-2-2_tsl.sublib.zip $I/JEF-2.2/backup/jef-2-2_decay.sublib.zip $I/JEF-2.2/backup/jef-2-2_nfpy.sublib.zip $I/JEF-2.2/backup/jef-2-2_sfpy.sublib.zip $I/JEF-2.2/backup/jef-2-2_photo.sublib.zip
IAEA-PD-2019 $I/IAEA-PD-2019/backup/iaea-pd-2019_g.sublib.zip
IRDF-2002 $I/IRDF-2002/backup/irdf-2002_n.sublib.zip $I/IRDF-2002/backup/irdf-2002_decay.sublib.zip
PADF-2007 $I/PADF-2007/backup/padf-2007_p.sublib.zip
RUSFOND-2010 $I/ROSFOND-2010/backup/rosfond_n.sublib.zip
CENDL-2.1 $I/CENDL-2/cendl-2_n.zip#n
BROND-2.2 $I/BROND-2-2/brond22n.dat#n
BROND-3.1 $I/BROND-3.1/n/*#n
FENDL-2.1 $I/FENDL-2.1/n/*#n
IRDFF-1.0 $I/IRDFF/n/*#n
IRDFF-1.05 $I/IRDFF-v1.05/n/*#n"
[ -f fill.extra ] && ALL="$ALL
$(cat fill.extra)"  # releases fetched tonight, one line each, appended on the box as they land
MF=
case "$1" in --mf=*) MF=$1; shift;; esac
if [ "$1" = --list ]; then echo "$ALL"; exit 0; fi
ONE=$1
expand() {  # <prefix>/*#<token> -> every .zip under the prefix, each with #<token>
  for w in "$@"; do
    case "$w" in
      *'/*#'*) p=${w%%\*#*}; t=${w##*#}
               /snap/bin/aws s3 ls "s3://nsr-lake-613473203863/$p" --region us-east-2 | awk '{print $4}' | grep -i '\.zip$' | sed "s|^|$p|; s|\$|#$t|";;
      *) echo "$w";;
    esac
  done
}
echo "$ALL" | while read -r rel keys; do
  [ -n "$ONE" ] && [ "$rel" != "$ONE" ] && continue
  # shellcheck disable=SC2086  # keys split on spaces
  set -- $(expand $keys)
  log=/data/endf-$rel.log; [ -n "$MF" ] && log=/data/mf-$rel.log; [ "$MF" = "--mf=2,32" ] && log=/data/mf2-$rel.log
  echo "$(date -u +%FT%TZ) start $rel $MF ($# keys)" >> /data/endf-releases.log
  /opt/parse/bin/python -I parse.py "$rel" "$@" $MF > "$log" 2>&1
  rc=$?
  echo "$(date -u +%FT%TZ) end $rel $MF exit $rc" >> /data/endf-releases.log
done
