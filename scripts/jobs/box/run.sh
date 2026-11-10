#!/bin/bash
# One job on nsr-jobs-1 (brief 51; kinds by brief 60). Lambda nsr-jobs sends "/opt/jobs/run.sh <id> <kind>" through SSM
# after starting the box; <kind> is broaden (the default) or gnds, and names the script (broaden.py, gnds.py). The script
# is refreshed from lake/_work/jobs/box/ first, so a fix reaches the box without a rebuild; the log stays in
# /data/jobs/<id>.log. /opt/jobs/last marks activity for idle.sh. Jobs run one at a time (flock): a job waiting for the
# lock stays queued in the table, and each job has both CPUs.
KIND=${2:-broaden}
case "$KIND" in broaden|gnds) ;; *) echo "no kind $KIND"; exit 2;; esac
touch /opt/jobs/last
exec 9>/opt/jobs/lock
flock 9
touch /opt/jobs/last
/snap/bin/aws s3 cp s3://nsr-lake-613473203863/lake/_work/jobs/box/$KIND.py /opt/jobs/$KIND.py --region us-east-2 --only-show-errors
cd /opt/jobs && HOME=/root /opt/jobs/venv/bin/python -I $KIND.py "$1" > "/data/jobs/$1.log" 2>&1
rc=$?
touch /opt/jobs/last
tail -5 "/data/jobs/$1.log"
exit $rc
