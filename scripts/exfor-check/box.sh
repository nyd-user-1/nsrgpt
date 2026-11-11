#!/usr/bin/env bash
# Ship scripts/exfor-check/ (and the generated dictionary module) to the dev box and run a command there, in
# /data/exfor-check/repo (a copy of this repo's two folders). Nothing runs on the Mac but two AWS CLI calls.
#   ./scripts/exfor-check/box.sh 'python3 scripts/exfor-check/check.py /data/exfor-check/nrdc/trans.1356 | head'
set -euo pipefail
cd "$(dirname "$0")/../.."
A=(--profile nysgpt-new --region us-east-2)
W=s3://nsr-lake-613473203863/lake/_work/exfor-check/src
BOX=${BOX:-i-0ec4775a5cd68d41b}
aws s3 sync scripts/exfor-check/ $W/scripts/exfor-check/ "${A[@]}" --quiet --exclude '__pycache__/*' --exclude '*.pyc'
[ -f services/nsr-api/exfor_check_dicts.py ] && aws s3 cp services/nsr-api/exfor_check_dicts.py $W/services/nsr-api/ "${A[@]}" --quiet
[ -f services/nsr-api/exfor_check.py ] && aws s3 cp services/nsr-api/exfor_check.py $W/services/nsr-api/ "${A[@]}" --quiet
./scripts/iaea/box/ssm.sh "$BOX" "export PATH=/snap/bin:/usr/local/bin:/usr/bin:/bin HOME=/root; mkdir -p /data/exfor-check/repo && cd /data/exfor-check/repo && aws s3 sync --quiet $W/ ./ && $1"
