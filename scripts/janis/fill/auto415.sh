#!/bin/bash
# Brief 70, on the fill box: once a release's part A ends with exit 0 (/data/endf-releases.log), run its Files 4-15
# through the Lambda (mf415.py), one release at a time, each once (/opt/fill/415.done). A release whose part A is rerun
# (TENDL-2015 with its charged particles) is taken again when its newer part A ends.
#   setsid nohup /opt/fill/auto415.sh > /data/auto415.out 2>&1 &
D=/opt/fill/415.done
touch $D
cd /opt/fill || exit 1
while true; do
  grep -E ' end [^ ]+  exit 0$' /data/endf-releases.log | while read -r at _ rel _; do
    grep -qx "$rel $at" $D && continue
    echo "$rel $at" >> $D
    # a rerun of part A: the old split text and indexes describe the old records
    if grep -q "^$rel " $D && [ "$(grep -c "^$rel " $D)" -gt 1 ]; then
      /snap/bin/aws lambda invoke --function-name nsr-endf-parse --region us-east-2 --cli-binary-format raw-in-base64-out --payload "{\"job\":\"clean\",\"release\":\"$rel\"}" /tmp/clean.json >/dev/null
    fi
    /opt/parse/bin/python -I mf415.py "$rel" >> /data/mf415-auto.out 2>&1
  done
  sleep 60
done
