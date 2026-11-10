#!/bin/bash
# Brief 56: once res_all.sh writes its last line, count the sections by MF into each manifest (Part C.1), then parse and
# serve the POINT releases above 293.6 K (serve-structure/point_hot.sh).
#   nohup ./after_res.sh > /data/after.log 2>&1 &
until grep -q "res_all done" /data/endf-releases.log 2>/dev/null; do sleep 30; done
cd /opt/parse/scripts/endfb && /opt/parse/bin/python -I sections_by_mf.py > /data/sections_by_mf.log 2>&1
echo "$(date -u +%FT%TZ) sections_by_mf exit $?" >> /data/endf-releases.log
cd /opt/parse/scripts/serve-structure && ./point_hot.sh
