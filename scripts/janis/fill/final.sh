#!/bin/bash
# Brief 70, on the fill box: wait for the JANIS crawl to finish (progress.json done), then mark the finished tree with
# this brief's mark.py (lake/janis/2026-11-10/ and lake/janis/current/) and with brief 68's (lake/_work/fill/mark-before/),
# refresh PROGRESS.json and the SOURCE.md files, and write the report table; outputs to lake/_work/fill/final/.
#   setsid nohup /opt/fill/final.sh > /data/final.out 2>&1 &
export PATH=/snap/bin:$PATH
P=s3://nsr-lake-613473203863/lake/janis/2026-11-10/progress.json
until [ "$(aws s3 cp $P - --region us-east-2 2>/dev/null | jq -r .done)" = true ]; do sleep 300; done
cd /opt/fill
date -u +%FT%TZ > /data/final-start
/opt/parse/bin/python -I mark.py > /data/final-mark.json 2>&1
/opt/parse/bin/python -I mark_before.py > /data/final-before.json 2>&1
/opt/parse/bin/python -I progress.py > /dev/null 2>&1
/opt/parse/bin/python -I sources.py > /data/final-sources.out 2>&1
/opt/parse/bin/python -I report.py > /data/final-report.md 2>&1
for f in final-start final-mark.json final-before.json final-report.md final-sources.out; do
  aws s3 cp /data/$f s3://nsr-lake-613473203863/lake/_work/fill/final/$f --region us-east-2 --quiet
done
echo done > /data/final-done
