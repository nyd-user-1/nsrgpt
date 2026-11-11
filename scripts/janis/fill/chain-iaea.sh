#!/bin/bash
# Brief 70, on the browser box: the IAEA jobs one after another (one stream to IAEA at a time).
export PATH=/snap/bin:$PATH
cd /opt/box
for j in fill-iaea-1 fill-iaea-jendl fill-iaea-tendl-1 fill-iaea-tendl-2; do
  while pgrep -f "mirror.py $j.json" >/dev/null; do sleep 30; done
  [ -f done-$j ] && continue
  if [ "$j" != fill-iaea-1 ]; then
    aws s3 cp s3://nsr-lake-613473203863/lake/_raw/_work/jobs/$j.json . --region us-east-2 --quiet
    xvfb-run -a /opt/pw/bin/python mirror.py $j.json > /opt/box/$j.log 2>&1
  fi
  touch done-$j
done
