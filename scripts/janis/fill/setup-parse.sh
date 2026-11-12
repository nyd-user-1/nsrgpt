#!/bin/bash
# Brief 73: make a parse box (scripts/parse/box/create.sh, userdata.sh) ready for fill.sh queue work: the scripts from
# lake/_work/fill/a73/scripts.tgz (scripts/parse, scripts/janis, scripts/recon, services/nsr-endf-parse), the DDL record
# seeded from S3 so this box's uploads keep every other box's partition lines, then <workers> queue workers
# (worker.sh: "A|B|C <release>" lines in /opt/fill/queue.txt). The queue starts with the lines given.
#   setup-parse.sh <workers> "A TENDL-2015" "A TENDL-2014" …
set -e
until [ -f /opt/box/ready ]; do sleep 5; done
AWS=/snap/bin/aws
mkdir -p /opt/a73 /opt/fill /opt/parse/scripts /data
cd /opt/a73
$AWS s3 cp s3://nsr-lake-613473203863/lake/_work/fill/a73/scripts.tgz . --region us-east-2 --quiet
tar xzf scripts.tgz
cp -r scripts/parse/* /opt/parse/scripts/
cp scripts/janis/fill/*.py scripts/janis/fill/*.sh scripts/janis/*.py /opt/fill/
chmod +x /opt/parse/scripts/endfb/fill.sh /opt/fill/*.sh
mkdir -p /opt/parse/scripts/endfb/ddl
$AWS s3 cp s3://nsr-lake-613473203863/lake/_work/parse/endfb/ddl/ /opt/parse/scripts/endfb/ddl/ --recursive --region us-east-2 --quiet || true
W=$1; shift
for l in "$@"; do echo "$l" >> /opt/fill/queue.txt; done
for w in $(seq 1 "$W"); do (setsid nohup /opt/fill/worker.sh "$w" > /data/worker-$w.out 2>&1 &); done
echo "ready: $W workers, queue: $(wc -l < /opt/fill/queue.txt) lines"
