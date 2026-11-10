#!/bin/bash
# EC2 user-data for the ingest box nsr-ingest-1 (brief 62), copied from scripts/gnds/box/userdata.sh: ends itself after
# 8 hours; a venv /opt/ingest/venv with boto3 and pyarrow; the scripts come from lake/_work/ingest/box/.
set -x
shutdown -h +480
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3-venv unzip jq
snap install aws-cli --classic || true
mkdir -p /opt/ingest /data
python3 -m venv /opt/ingest/venv
/opt/ingest/venv/bin/pip install -q boto3 pyarrow
/snap/bin/aws s3 cp --recursive s3://nsr-lake-613473203863/lake/_work/ingest/box/ /opt/ingest/ --region us-east-2 --only-show-errors || true
touch /opt/ingest/ready
