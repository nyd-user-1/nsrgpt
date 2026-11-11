#!/bin/bash
# EC2 user-data for the walled-site box (brief 11): real Chrome under Xvfb, driven by Playwright. Ends itself in 12 hours (brief 70).
set -x
shutdown -h +720
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y xvfb python3-venv curl unzip jq fonts-liberation libatomic1
curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
apt-get install -y /tmp/chrome.deb
python3 -m venv /opt/pw
/opt/pw/bin/pip install -q playwright boto3 nodriver
snap install aws-cli --classic || true
mkdir -p /opt/box /data
touch /opt/box/ready
