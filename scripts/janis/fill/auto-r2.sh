#!/bin/bash
# Brief 73: once a release's part A ends with exit 0 (/data/endf-releases.log), queue "R2 <release>" (parts B and C,
# serving files, Files 4-15 with the C++ parser) in /opt/fill/queue2.txt for the worker.sh started with
# Q=/opt/fill/queue2.txt, each release once (/opt/fill/r2.done; seed it with releases already done another way).
#   setsid nohup /opt/fill/auto-r2.sh > /data/auto-r2.out 2>&1 &
D=/opt/fill/r2.done
touch $D /opt/fill/queue2.txt /data/endf-releases.log
while true; do
  grep -E ' end [^ ]+  exit 0$' /data/endf-releases.log | while read -r _ _ rel _; do
    grep -qx "$rel" $D && continue
    echo "$rel" >> $D
    flock /opt/fill/queue2.txt.lock sh -c "echo 'R2 $rel' >> /opt/fill/queue2.txt"
    echo "$(date -u +%FT%TZ) queued R2 $rel" >> /data/auto-r2.out
  done
  sleep 60
done
