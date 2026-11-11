#!/bin/bash
# EC2 user-data for the CINDA parse box (brief 65), copied from scripts/parse/box/userdata.sh: the box ends itself after
# 6 hours. Python venv at /opt/parse with boto3 and pyarrow.
set -x
shutdown -h +360
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3-venv unzip jq
snap install aws-cli --classic || true
python3 -m venv /opt/parse
/opt/parse/bin/pip install -q boto3 pyarrow
mkdir -p /data /opt/box
touch /opt/box/ready
