#!/bin/bash
# Brief 70: a parse worker on the fill box. Pops one line at a time from /opt/fill/queue.txt ("A <release>",
# "B <release>" or "C <release>": parts A, B (MF8, MF33) and C (MF2, MF32) of scripts/parse/endfb/fill.sh) and runs it;
# sleeps when the queue is empty. Brief 73 adds "S <release>" (serving files, serve_fill.sh), "F <release>" (Files 4-15
# on this box, mf415_local.py) and "R2 <release>" (B, C, S and F one after another in this worker, so the steps of one
# release never run at once and never race on its manifest). Run one per vCPU:  setsid nohup /opt/fill/worker.sh 1 > /data/worker-1.out 2>&1 &
W=$1
Q=${Q:-/opt/fill/queue.txt}  # brief 73: Q=/opt/fill/queue2.txt runs a second queue beside workers already running
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
    S) /opt/fill/serve_fill.sh "$2";;
    F) /opt/parse/bin/python -I /opt/fill/mf415_local.py "$2" --procs=2 --cpp >> /data/mf415-local-$2.out 2>&1;;
    R2) ./fill.sh --mf=8,33 "$2"; ./fill.sh --mf=2,32 "$2"; /opt/fill/serve_fill.sh "$2"
        /opt/parse/bin/python -I /opt/fill/mf415_local.py "$2" --procs=2 --cpp >> /data/mf415-local-$2.out 2>&1;;
  esac
  echo "$(date -u +%FT%TZ) worker $W done $line" >> /data/workers.log
done
