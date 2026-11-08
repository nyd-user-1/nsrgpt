#!/bin/sh
# Lane A queue for a Chrome box (brief 14): run the mirror.py jobs named in jobs/<queue>.txt in order, one at a time.
# The queue is re-read from S3 before each job, so jobs can be added or reordered while it runs. Each box has its own
# queue file and its own proxy lines (set in each job), so no file is pulled twice.
#   on the box:  setsid nohup /opt/box/chain.sh queue-3 > /opt/box/chain.log 2>&1 &
cd /opt/box
Q=s3://nsr-lake-613473203863/raw/iaea/2026-11-07/_work/box
aws s3 cp $Q/mirror.py mirror.py --quiet
touch done.txt
while true; do
  aws s3 cp "$Q/jobs/$1.txt" queue.txt --quiet || break
  j=$(grep -vxF -f done.txt queue.txt | head -1)
  [ -z "$j" ] && break
  aws s3 cp "$Q/jobs/$j.json" . --quiet
  xvfb-run -a /opt/pw/bin/python mirror.py "$j.json" > "/opt/box/$j.log" 2>&1
  echo "$j" >> done.txt
done
