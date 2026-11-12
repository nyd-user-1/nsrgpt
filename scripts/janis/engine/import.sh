#!/bin/bash
# Brief 77 step 3: JANIS's own importer (org.nea.janis.format.tools.Import, the code behind its Import wizard) loads
# janis/data's packages into local JANIS bases (H2 1.3 + DataPack folder, user/password janis, as README_janis.md sets).
# The packages carry no H2 index, so JANIS builds it. One base per group in libs.tsv: BOOK holds the fourteen libraries
# JANIS's book generator draws plus EXFOR (the generator searches one connection), REST the other packages.
#   bash import.sh BOOK     # or REST; a library whose done-marker exists is skipped
set -uo pipefail
export PATH=$PATH:/snap/bin
GROUP=$1
J=/data/janis; L=s3://nsr-lake-613473203863/lake/_raw/janis-data
E=/opt/engine; M=$E/janis-data-manifest.json
mkdir -p $J/DataPack $J/database $J/logs $J/done
[ -f $M ] || aws s3 cp $L/manifest.json $M --only-show-errors
BASE="LOCAL:label=$GROUP|root=$J/DataPack|url=jdbc:h2:$J/database/$GROUP|user=janis|password=janis"
imp() { # format label path
  # 3.5 GB: at 5 GB the importer's queue plus H2 outgrew the 8 GB box on TENDL-2019 and the OOM killer ended it
  java -Xmx3500m -cp "/opt/janis/*" org.nea.janis.format.tools.Import "$BASE" "$@"
}
grep -v '^#' $E/libs.tsv | awk -F'\t' -v g=$GROUP '$4==g' | while IFS=$'\t' read -r pkg ver label base fmt; do
  key="$pkg-$ver"; D=$J/DataPack/$key
  [ -f $J/done/$GROUP-$key ] && { echo "skip $key"; continue; }
  mkdir -p $D/jpk $D/inter $D/boxer
  # the package's files; EXFOR keeps only its latest dump; files GitLab marks unused, bad or alternative are left out
  jq -r --arg p "$pkg" --arg v "$ver" '.rows[] | select(.package==$p and .version==$v) | .file' $M |
    grep -vE '\.(UNUSED|BAD)$|_noFY$|_pbNJOY$|covr\.zip$|boxer-JANIS-[0-9]+\.zip$' | while read -r f; do
      case $f in *.jpk) sub=jpk;; *.inter.zip) sub=inter;; *.boxer.zip) sub=boxer;; *) continue;; esac
      [ -s $D/$sub/$f ] || aws s3 cp "$L/$pkg/$ver/$f" $D/$sub/$f --only-show-errors
    done
  t0=$(date +%s)
  echo "$(date -u +%FT%TZ) import $key as [$label] ($fmt)"
  if [ "$fmt" = EXFOR ]; then
    imp EXFOR $D/jpk > $J/logs/$GROUP-$key-jpk.log 2>&1; rc=$?
  else
    # one JVM per packed file or multipart set (JANIS reads a set from its first part), each one committed on its own
    rc=0
    for f in $(ls $D/jpk | grep -v '\.part[2-9][0-9]*of' ); do
      imp $fmt "$label" $D/jpk/$f >> $J/logs/$GROUP-$key-jpk.log 2>&1 || rc=$?
      [ $rc = 0 ] || break
    done
    for z in $D/inter/*.inter.zip; do [ -f "$z" ] && imp INTER "$label" "$z" > $J/logs/$GROUP-$key-inter.log 2>&1; done
    for z in $D/boxer/*.boxer.zip; do [ -f "$z" ] && imp BOXER "$label" "$z" > $J/logs/$GROUP-$key-boxer.log 2>&1; done
  fi
  ok=$(grep -c '^Total time' $J/logs/$GROUP-$key-jpk.log)
  echo "$(date -u +%FT%TZ) end $key rc=$rc total_time_lines=$ok seconds=$(( $(date +%s) - t0 ))"
  [ $rc = 0 ] && [ $ok -ge 1 ] && touch $J/done/$GROUP-$key
done
echo "$(date -u +%FT%TZ) group $GROUP finished"
