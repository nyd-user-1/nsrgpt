#!/usr/bin/env bash
# Sync the records scripts to the box through S3 and start one, detached, logging to /opt/box/<log>.log.
#   ./scripts/iaea/records/run.sh <instance-id> sync                       # upload and copy the scripts only
#   ./scripts/iaea/records/run.sh <instance-id> <log> '<command in /opt/rec>'
#   e.g. run.sh i-0… index 'xvfb-run -a /opt/pw/bin/python /opt/rec/index.py 2,3,6'
set -euo pipefail
cd "$(dirname "$0")"
S=s3://nsr-lake-613473203863/raw/iaea-records/2026-11-08/_work/scripts
aws s3 sync . "$S/" --exclude '*' --include '*.py' --include '*.sh' --exclude 'sample-record.json' \
  --profile nysgpt-new --region us-east-2 --only-show-errors
GET="aws s3 sync $S/ /opt/rec/ --only-show-errors && chmod +x /opt/rec/*.sh"
if [ "$2" = sync ]; then
  ../box/ssm.sh "$1" "$GET && ls /opt/rec"
else
  ../box/ssm.sh "$1" "$GET && cd /opt/rec && (setsid nohup sh -c '$3' > /opt/box/$2.log 2>&1 &) && sleep 2 && echo started $2"
fi
