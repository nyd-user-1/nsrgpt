#!/bin/bash
# EC2 user-data for a JANIS engine box (brief 77): Java 8, Xvfb, 7-Zip, JANIS 4.1's jars and the engine scripts from the
# lake (lake/_work/janis/engine/, setup.sh), and NJOY2016 (lane B's build, lake/_work/parse/endfb/recon/bin/njoy) for the
# libraries JANIS has no package for. Ends itself after 12 hours (instance-initiated shutdown terminates it).
#   ./scripts/parse/box/create.sh nsr-janis-2 m7i-flex.large ../../janis/engine/userdata.sh 200
set -x
shutdown -h +720
export DEBIAN_FRONTEND=noninteractive HOME=/root
apt-get update -y
apt-get install -y jq unzip python3-venv libgfortran5
snap install aws-cli --classic || true
mkdir -p /opt/engine /data/janis /opt/njoy/build
/snap/bin/aws s3 cp s3://nsr-lake-613473203863/lake/_work/janis/engine/ /opt/engine/ --recursive --exclude janis-src.tgz --exclude 'java/*.class' --region us-east-2
bash /opt/engine/setup.sh > /data/setup.log 2>&1
cd /opt/engine/java && /usr/lib/jvm/java-8-openjdk-amd64/bin/javac -cp "/opt/janis/*" *.java >> /data/setup.log 2>&1
/snap/bin/aws s3 cp s3://nsr-lake-613473203863/lake/_work/parse/endfb/recon/bin/njoy /opt/njoy/build/njoy --region us-east-2 && chmod +x /opt/njoy/build/njoy
python3 -m venv /opt/py && /opt/py/bin/pip install -q boto3 pyarrow numpy
touch /opt/engine/ready
