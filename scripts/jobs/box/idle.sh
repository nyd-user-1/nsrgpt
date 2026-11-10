#!/bin/bash
# Stop nsr-jobs-1 after 30 minutes with no job (brief 51). cron runs this every 5 minutes; run.sh touches /opt/jobs/last at
# a job's start and end, cron touches it at boot. The instance stops (not terminates) on shutdown; nsr-jobs starts it.
if pgrep -f broaden.py >/dev/null || pgrep -f gnds.py >/dev/null || pgrep -f points.py >/dev/null; then touch /opt/jobs/last; exit 0; fi
[ -f /opt/jobs/last ] || touch /opt/jobs/last
if [ $(( $(date +%s) - $(stat -c %Y /opt/jobs/last) )) -ge 1800 ]; then shutdown -h now; fi
