#!/bin/bash
# Brief 70, on the browser box: the IAEA jobs one after another (one stream to IAEA at a time). A json job runs
# mirror.py; "py:<script> <args>" runs that script under xvfb. Each finished entry leaves done-<name>.
export PATH=/snap/bin:$PATH
cd /opt/box
J="fill-iaea-1 fill-iaea-jendl fill-iaea-misc py:endfdb.py_probe fill-iaea-tendl-1a fill-iaea-tendl-1b fill-iaea-tendl-2"
for j in $J; do
  if pgrep -f "mirror.py $j.json" >/dev/null; then  # already running (a restarted chain): wait, then count it done
    while pgrep -f "mirror.py $j.json" >/dev/null; do sleep 30; done; touch "done-$j"; continue
  fi
  [ -f "done-$j" ] && continue
  case $j in
    fill-iaea-1) ;;
    py:*) s=${j#py:}; aws s3 cp s3://nsr-lake-613473203863/lake/_raw/_work/endfdb.py . --region us-east-2 --quiet
          xvfb-run -a /opt/pw/bin/python ${s//_/ } > "/opt/box/${s%%.py*}.log" 2>&1;;
    *) aws s3 cp s3://nsr-lake-613473203863/lake/_raw/_work/jobs/$j.json . --region us-east-2 --quiet
       xvfb-run -a /opt/pw/bin/python mirror.py $j.json > /opt/box/$j.log 2>&1;;
  esac
  touch "done-$j"
done
