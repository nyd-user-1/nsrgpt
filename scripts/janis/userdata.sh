#!/bin/bash
# EC2 user-data for the JANIS crawl box (brief 68), copied from scripts/parse/cinda/userdata.sh: the box ends itself
# after 22 hours (the crawl stops itself sooner, --hours). python3 with boto3 from apt; the AWS CLI from snap.
set -x
shutdown -h +1320
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3-boto3
snap install aws-cli --classic || true
mkdir -p /opt/janis /opt/box
touch /opt/box/ready
