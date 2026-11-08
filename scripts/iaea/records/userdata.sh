#!/bin/bash
# EC2 user-data for the records box (brief 20), from scripts/iaea/box/userdata.sh: real Chrome under Xvfb, driven by
# Playwright, plus brotli for compressed Wayback captures. Ends itself in 8 hours.
set -x
shutdown -h +480
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y xvfb python3-venv curl unzip jq fonts-liberation
curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
apt-get install -y /tmp/chrome.deb
python3 -m venv /opt/pw
/opt/pw/bin/pip install -q playwright boto3 brotli
snap install aws-cli --classic || true
mkdir -p /opt/box /opt/rec /data
touch /opt/box/ready
