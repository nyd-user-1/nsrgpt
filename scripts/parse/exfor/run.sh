#!/bin/bash
# On the parse box: pull the scripts from S3 and run one of them in the background, logging to /data/logs/<name>.log.
#   bash /opt/nsr/run.sh <log-name> <script.py> [args …]
# From the Mac: ./scripts/iaea/box/ssm.sh <id> 'aws s3 cp s3://nsr-lake-613473203863/lake/_work/parse/exfor/scripts/run.sh /opt/nsr/run.sh && bash /opt/nsr/run.sh x4-inv x4pro.py inventory <key> <build>'
set -euo pipefail
NAME=$1; shift
mkdir -p /opt/nsr/scripts /data/logs /data/tmp
aws s3 sync --quiet s3://nsr-lake-613473203863/lake/_work/parse/exfor/scripts/ /opt/nsr/scripts/
cd /data; export HOME=/root
(setsid nohup /opt/parse/bin/python -I /opt/nsr/scripts/"$@" > /data/logs/$NAME.log 2>&1 &)
sleep 2; echo "started $NAME"
