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
K=lake/_raw/iaea/public/download-endf  # IAEA, fetched 2026-11-11 through browser box nsr-fill-wb
J=lake/_raw                            # Wayback (JAEA, NEA) and the GEF site, 2026-11-11
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
IRDFF-1.05 $I/IRDFF-v1.05/n/*#n
EAF-2010 $I/EAF-2010/n/*#n
IRDF-2002-MG $I/IRDF-2002-G/irdf-2002-g_n.zip#n
JEFF-3.1.1 $K/JEFF-3.1.1/backup/jeff-3-1_n.sublib.zip $K/JEFF-3.1.1/backup/jeff-3-1_p.sublib.zip $K/JEFF-3.1.1/backup/jeff-3-1_tsl.sublib.zip $K/JEFF-3.1.1/backup/jeff-3-1_decay.sublib.zip $K/JEFF-3.1.1/backup/jeff-3-1_nfpy.sublib.zip $K/JEFF-3.1.1/backup/jeff-3-1_sfpy.sublib.zip
JEFF-3.1 $K/JEFF-3.1/n/*#n $K/JEFF-3.1/p/*#p $K/JEFF-3.1/tsl/*#tsl $K/JEFF-3.1/nfpy/*#nfpy $K/JEFF-3.1/sfpy/*#sfpy $K/JEFF-3.1.1/backup/jeff-3-1_decay.sublib.zip
JEFF-3.1.2 $K/JEFF-3.1.2/n/*#n
JEFF-3.2 $K/JEFF-3.2/n/*#n
CENDL-3.1 $K/CENDL-3.1/n/*#n
JENDL-4.0 $K/JENDL-4.0/n/*#n $K/JENDL-4.0/e/*#e $K/JENDL-4.0/nfpy/*#nfpy $K/JENDL-4.0/photo/*#photo $K/JENDL-4.0/sfpy/*#sfpy $K/JENDL-4.0/tsl/*#tsl
JENDL-4.0u $J/JENDL-4.0u/jendl40-or-up_20160106.tar.gz#n
JENDL-4.0-HE $K/JENDL-4.0-HE/backup/jendl-4-0-he_n.sublib.zip $K/JENDL-4.0-HE/backup/jendl-4-0-he_p.sublib.zip
JENDL-AD-2017 $K/JENDL-AD-2017/backup/jendl-ad-2017_n.sublib.zip $K/JENDL-AD-2017/backup/jendl-ad-2017_p.sublib.zip
JENDL-DEU-2020 $K/JENDL-DEU-2020/backup/jendl-deu-2020_d.sublib.zip
JENDL-PD-2016 $K/JENDL-PD-2016/backup/jendl-pd-2016_g.sublib.zip
JENDL-PD-2016.1 $K/JENDL-PD-2016.1/backup/jendl-pd-2016-1_g.sublib.zip
JENDL-3.3 $J/JENDL-3.3/jendl33.tar#n
JENDL-HE-2007 $J/JENDL-HE-2007/jendl-he2007n.tar.gz#n $J/JENDL-HE-2007/jendl-he2007p.tar.gz#p
JENDL-AC-2008 $J/JENDL-AC-2008/jendlac2008.tar.gz#n
JENDL-AN-2005 $J/JENDL-AN-2005/jendlan2005.tar.gz#a
JENDL-PD-2004 $J/JENDL-PD-2004/jendl-pd2004.tar.gz#g
JENDL-DDF-2015 $J/JENDL-DDF-2015/jendl-ddf-2015.tar.gz#decay
JENDL-FPD-2000 $J/JENDL-FPD-2000/jendl-fpd2000.tar.gz#decay
JENDL-FPD-2011 $J/JENDL-FPD-2011/jendl-fpd2011.tar.gz#decay
JENDL-FPY-2011 $J/JENDL-FPY-2011/jendl-fpy2011.tar.gz#fy
JEFF-3.0 $J/JEFF-3.0/JEFF30N.zip#n $J/JEFF-3.0/JEFF30TS.zip#tsl
GEFY-9.1 $J/GEFY-9.1/GEFY91_n.zip#nfpy $J/GEFY-9.1/GEFY91_mn.zip#nfpy $J/GEFY-9.1/GEFY91_s.zip#sfpy
GEFY-8.1 $J/GEFY-8.1/GEFY81_n.zip#nfpy $J/GEFY-8.1/GEFY81_mn.zip#nfpy $J/GEFY-8.1/GEFY81_s.zip#sfpy
GEFY-6.2 $J/GEFY-6.2/GEFY62_n.zip#nfpy $J/GEFY-6.2/GEFY62_mn.zip#nfpy $J/GEFY-6.2/GEFY62_s.zip#sfpy
GEFY-6.1 $J/GEFY-6.1/GEFY61_n.zip#nfpy $J/GEFY-6.1/GEFY61_mn.zip#nfpy $J/GEFY-6.1/GEFY61_s.zip#sfpy
TENDL-2019 $J/TENDL-2019/TENDL-n.tgz#n $J/TENDL-2019/TENDL-p.tgz#p $J/TENDL-2019/TENDL-d.tgz#d $J/TENDL-2019/TENDL-t.tgz#t $J/TENDL-2019/TENDL-h.tgz#he3 $J/TENDL-2019/TENDL-a.tgz#a $J/TENDL-2019/TENDL-g.tgz#g
TENDL-2017 $J/TENDL-2017/TENDL-n.tgz#n $J/TENDL-2017/TENDL-p.tgz#p $J/TENDL-2017/TENDL-d.tgz#d $J/TENDL-2017/TENDL-t.tgz#t $J/TENDL-2017/TENDL-h.tgz#he3 $J/TENDL-2017/TENDL-a.tgz#a $J/TENDL-2017/TENDL-g.tgz#g
TENDL-2015 $J/TENDL-2015/TENDL-n.tgz#n $J/TENDL-2015/TENDL-p.tgz#p $J/TENDL-2015/TENDL-d.tgz#d $J/TENDL-2015/TENDL-t.tgz#t $J/TENDL-2015/TENDL-h.tgz#he3 $J/TENDL-2015/TENDL-a.tgz#a $J/TENDL-2015/TENDL-g.tgz#g
TENDL-2014 $K/TENDL-2014/n/*#n $K/TENDL-2014/p/*#p $K/TENDL-2014/d/*#d $K/TENDL-2014/t/*#t $K/TENDL-2014/he3/*#he3 $K/TENDL-2014/he4/*#he4 $K/TENDL-2014/g/*#g
TENDL-2012 $K/TENDL-2012/n/*#n $K/TENDL-2012/p/*#p $K/TENDL-2012/d/*#d $K/TENDL-2012/t/*#t $K/TENDL-2012/he3/*#he3 $K/TENDL-2012/he4/*#he4 $K/TENDL-2012/g/*#g
TENDL-2011 $K/TENDL-2011/n/*#n $K/TENDL-2011/p/*#p $K/TENDL-2011/d/*#d $K/TENDL-2011/t/*#t $K/TENDL-2011/he3/*#he3 $K/TENDL-2011/he4/*#he4 $K/TENDL-2011/g/*#g $K/TENDL-2011/nfpy/*#nfpy $K/TENDL-2011/sfpy/*#sfpy $K/TENDL-2011/pfpy/*#pfpy $K/TENDL-2011/dfpy/*#dfpy $K/TENDL-2011/tfpy/*#tfpy $K/TENDL-2011/he3fp/*#he3fp $K/TENDL-2011/he4fp/*#he4fp
TENDL-2010 $K/TENDL-2010/n/*#n $K/TENDL-2010/p/*#p $K/TENDL-2010/d/*#d $K/TENDL-2010/t/*#t $K/TENDL-2010/he3/*#he3 $K/TENDL-2010/he4/*#he4 $K/TENDL-2010/g/*#g $K/TENDL-2010/nfpy/*#nfpy $K/TENDL-2010/sfpy/*#sfpy $K/TENDL-2010/pfpy/*#pfpy $K/TENDL-2010/dfpy/*#dfpy $K/TENDL-2010/tfpy/*#tfpy $K/TENDL-2010/he3fp/*#he3fp $K/TENDL-2010/he4fp/*#he4fp
TENDL-2009 $K/TENDL-2009/n/*#n $K/TENDL-2009/p/*#p $K/TENDL-2009/d/*#d $K/TENDL-2009/t/*#t $K/TENDL-2009/he3/*#he3 $K/TENDL-2009/he4/*#he4 $K/TENDL-2009/g/*#g $K/TENDL-2009/nfpy/*#nfpy $K/TENDL-2009/sfpy/*#sfpy $K/TENDL-2009/pfpy/*#pfpy $K/TENDL-2009/dfpy/*#dfpy $K/TENDL-2009/tfpy/*#tfpy $K/TENDL-2009/he3fp/*#he3fp $K/TENDL-2009/he4fp/*#he4fp"
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
