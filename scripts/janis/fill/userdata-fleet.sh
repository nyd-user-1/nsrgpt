#!/bin/bash
# Brief 73 (A1): EC2 user-data for a Wayback fetch box (t3.micro, its own address): one shard of IAEA's TENDL
# per-material zips through wbfleet.py, ten keep-alive workers (the measured per-address ceiling is about twelve), then
# the box shuts itself down (instance-initiated shutdown terminates it). Ends itself after 6 hours whatever happens.
# The shard (__I__ of __N__) is written into a copy of this file per box: sed "s/__I__/1/; s/__N__/3/".
set -x
shutdown -h +360
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3-venv jq
python3 -m venv /opt/f
/opt/f/bin/pip install -q boto3
snap install aws-cli --classic || true
I=__I__; N=__N__
P=lake/_work/fill/a73/tendl
/snap/bin/aws s3 cp s3://nsr-lake-613473203863/lake/_work/fill/a73/wbfleet.py /opt/wbfleet.py --region us-east-2
/opt/f/bin/python -I /opt/wbfleet.py $P/pull-2009.json,$P/pull-2010.json,$P/pull-2011.json,$P/pull-2012.json,$P/pull-2014.json "$I" "$N" 10 tendl > /var/log/fleet.out 2>&1
shutdown -h now
