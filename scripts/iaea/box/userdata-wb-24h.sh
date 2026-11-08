#!/bin/bash
# EC2 user-data for the Wayback box, long form (brief 12): same as userdata-wb.sh, but the box ends itself after 24 hours,
# not 4, so a 3 GB file in flight is not lost at the 4-hour mark. The wbget start command shuts the box down when the list ends.
set -x
shutdown -h +1440
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3-venv
python3 -m venv /opt/pw
/opt/pw/bin/pip install -q boto3
snap install aws-cli --classic || true
mkdir -p /opt/box
touch /opt/box/ready
