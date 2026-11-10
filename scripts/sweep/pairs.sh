#!/bin/bash
# The retrodiction on older release pairs (brief 57 follow-up), on the sweep box after userdata.sh: each pair in its own
# database, MF3 above the common resonance floor, merged into lake/sweep/2026-11-10/retrodiction/summary.json's pairs.
#   bash /opt/sweep/pairs.sh "B-VII.1,B-VIII.0" "B-VII.0,B-VII.1" "B-VIII.0,B-VIII.1"
until [ -f /opt/sweep/ready ]; do sleep 10; done
cd /opt/sweep && /snap/bin/aws s3 cp --recursive s3://nsr-lake-613473203863/lake/_work/sweep/scripts/ . --quiet
for p in "$@"; do
  echo "== $p $(date -u +%H:%M:%S)"
  SWEEP_PAIR="$p" HOME=/root venv/bin/python -I sweep.py load floors covs run changes retro 2>&1 | grep -E "^== |Error|Traceback|hit_rate\": |base_rate" | head -40
done
echo "== done $(date -u +%H:%M:%S)"
