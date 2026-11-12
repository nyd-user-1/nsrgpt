#!/bin/bash
# Brief 73: nsr.endfb_release_sources, one row per release, sublibrary and source archive, from fill.sh's own list, so a
# consumer (lane B's reconstruction, the sweep) can tell an evaluation from JANIS's processed data before using MF3:
#   release, sublibrary (the token fill.sh gives: n, p, d, t, he3, a, g, nfpy, sfpy, …), source, mf3, s3_key
#   source: iaea (IAEA download-endf), wayback (JAEA, NEA through the Wayback Machine), imperial (Imperial College's TENDL
#           mirror), gef (the GEF site), janis_package (NEA GitLab janis/data, rebuilt by fill/jpk2endf.py)
#   mf3:    evaluated, or processed (a JANIS package: neutron MF3 reconstructed and broadened by JANIS, NJOY MTs added;
#           multigroup sets are group averages) — never reconstruct on top of it or compare it as an evaluation
# Releases parsed before brief 70 (the thirteen, JEFF-3.3, JENDL-5, TENDL-2023, CENDL-3.2) are not in fill.sh and have
# no row: their MF3 is evaluated.
#   release_sources.sh > release_sources.csv   (run where fill.sh is; then upload to lake/endfb/_release_sources/)
cd "$(dirname "$0")/../../parse/endfb" || exit 1
echo "release,sublibrary,source,mf3,s3_key"
./fill.sh --list | while read -r rel keys; do
  [ -z "$rel" ] && continue
  for w in $keys; do
    key=${w%%#*}; tok=${w##*#}; [ "$tok" = "$w" ] && tok=""
    case "$key" in
      lake/_raw/janis-data-endf/*) src=janis_package; mf3=processed;;
      raw/iaea/*|lake/_raw/iaea/*) src=iaea; mf3=evaluated;;
      lake/_raw/TENDL-20*) src=imperial; mf3=evaluated;;
      lake/_raw/GEFY-*) src=gef; mf3=evaluated;;
      *) src=wayback; mf3=evaluated;;
    esac
    echo "$rel,$tok,$src,$mf3,$key"
  done
done
