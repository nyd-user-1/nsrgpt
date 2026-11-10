#!/bin/bash
# Brief 60: the releases one compile box works through after B-VIII.1, its share of each (--shard <i>/<n>); the
# manifest and each release's index.json are rebuilt after every release, so /gnds answers as the files land.
#   nohup /opt/gnds/chain.sh <i> <n> > /data/chain.log 2>&1 &
# Order: the brief's (B-VIII.0, B-VII.1, JEFF-3.3, JENDL-5, CENDL-3.2, TENDL-2023 neutrons first), then B-VII.0 and the
# older releases before TENDL-2023's other six sublibraries, so the small old releases finish whole before the
# biggest remainder takes the boxes' last hours.
I=$1; N=$2
cd /opt/gnds
while pgrep -f "compile.py B-VIII.1" >/dev/null; do sleep 30; done
/opt/gnds/venv/bin/python -I compile.py --manifest >> /data/manifest.log 2>&1
for job in "B-VIII.0" "B-VII.1" "JEFF-3.3" "JENDL-5" "CENDL-3.2" "TENDL-2023 neutrons" "B-VII.0" "B-VI.8" "B-V" "B-IV" \
           "B-III" "B-II" "TENDL-2023 protons,deuterons,tritons,helium3s,alphas,gammas"; do
  set -- $job
  /snap/bin/aws s3 cp s3://nsr-lake-613473203863/lake/_work/gnds/box/compile.py /opt/gnds/compile.py --region us-east-2 --only-show-errors
  echo "$(date -u +%FT%TZ) start $job"
  /opt/gnds/venv/bin/python -I compile.py $job --shard $I/$N > "/data/$1.$(echo ${2:-all} | cut -c1-12).s$I.log" 2>&1
  echo "$(date -u +%FT%TZ) end $job exit $?"
  /opt/gnds/venv/bin/python -I compile.py --manifest >> /data/manifest.log 2>&1
done
echo "$(date -u +%FT%TZ) chain done"
