#!/usr/bin/env bash
# Start a mirror job on the box, detached: ./scripts/iaea/box/run-job.sh <instance-id> <job-name>
set -euo pipefail
cd "$(dirname "$0")"
./ssm.sh "$1" "cd /opt/box && aws s3 cp s3://nsr-lake-613473203863/raw/iaea/2026-11-07/_work/box/mirror.py . --quiet && aws s3 cp s3://nsr-lake-613473203863/raw/iaea/2026-11-07/_work/box/jobs/$2.json . --quiet && (setsid nohup xvfb-run -a /opt/pw/bin/python mirror.py $2.json > /opt/box/$2.log 2>&1 &) && sleep 2 && echo started $2"
