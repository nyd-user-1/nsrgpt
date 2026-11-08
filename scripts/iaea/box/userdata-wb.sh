#!/bin/bash
# EC2 user-data for the Wayback box (brief 11): Python and boto3 only, no browser. Ends itself in 4 hours.
set -x
shutdown -h +240
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3-venv
python3 -m venv /opt/pw
/opt/pw/bin/pip install -q boto3
snap install aws-cli --classic || true
mkdir -p /opt/box
touch /opt/box/ready
