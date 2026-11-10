#!/bin/bash
# Brief 60 Part D on the dev box: the drive on production and the box, then the screenshots and results.json to
# lake/_work/qa/<date>/ (role nsr-browser-box, inline policy nsr-qa).   nohup bash run.sh 2026-11-11 > /tmp/qa.log 2>&1 &
D=${1:-2026-11-11}
OUT=/tmp/qa/$D
mkdir -p $OUT /opt/gnds-qa
aws s3 cp s3://nsr-lake-613473203863/lake/_work/gnds/qa/drive.js /opt/gnds-qa/drive.js --region us-east-2 --only-show-errors
node /opt/gnds-qa/drive.js $OUT prod=https://nsrgpt.brendan-stanton.workers.dev box=http://localhost:3000
aws s3 cp $OUT s3://nsr-lake-613473203863/lake/_work/qa/$D/ --recursive --region us-east-2 --only-show-errors
echo "qa done $(date -u +%FT%TZ)"
