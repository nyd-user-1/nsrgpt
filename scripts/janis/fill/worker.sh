#!/bin/bash
# Brief 70: a parse worker on the fill box. Pops one line at a time from /opt/fill/queue.txt ("A <release>",
# "B <release>" or "C <release>": parts A, B (MF8, MF33) and C (MF2, MF32) of scripts/parse/endfb/fill.sh) and runs it;
# sleeps when the queue is empty. Run one per vCPU:  setsid nohup /opt/fill/worker.sh 1 > /data/worker-1.out 2>&1 &
W=$1
Q=/opt/fill/queue.txt
touch $Q
cd /opt/parse/scripts/endfb || exit 1
while true; do
  line=$(flock $Q.lock sh -c "head -n 1 $Q; sed -i 1d $Q")
  if [ -z "$line" ]; then sleep 20; continue; fi
  set -- $line
  echo "$(date -u +%FT%TZ) worker $W picks $line" >> /data/workers.log
  case $1 in
    A) ./fill.sh "$2";;
    B) ./fill.sh --mf=8,33 "$2";;
    C) ./fill.sh --mf=2,32 "$2";;
  esac
  echo "$(date -u +%FT%TZ) worker $W done $line" >> /data/workers.log
done
