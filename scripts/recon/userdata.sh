#!/bin/bash
# EC2 user-data for a recon box (brief 74), copied from scripts/parse/box/userdata.sh (the venv at /opt/parse) and
# scripts/jobs/box/userdata.sh (PREPRO 2023 from the lake's copy of IAEA-NDS/PREPRO, commit cc5fd087, linear, recent and
# sigma1 at -O2 in /opt/prepro/bin-o2). The box ends itself after 8 hours (instance-initiated shutdown terminates it).
# Scripts come from lake/_work/parse/endfb/recon/: recon.py, jpk.py, janis_serve.py and the B1 readers to /opt/recon, serve.py, its ddl/ and
# lake.py to /opt/parse/scripts/{serve-structure,box}; the NJOY2016 binary from bin/njoy. Work is sent through SSM
# (scripts/recon/README.md).
set -x
shutdown -h +480
export DEBIAN_FRONTEND=noninteractive HOME=/root
apt-get update -y
apt-get install -y gfortran make python3-venv unzip jq
snap install aws-cli --classic || true
python3 -m venv /opt/parse
/opt/parse/bin/pip install -q boto3 pyarrow pandas duckdb numpy
mkdir -p /data/recon /data/tmp /opt/prepro /opt/recon /opt/duckdb_ext /opt/parse/scripts/serve-structure/ddl /opt/parse/scripts/box
cd /opt/prepro && /snap/bin/aws s3 cp s3://nsr-lake-613473203863/raw/github/IAEA-NDS/PREPRO/cc5fd087ab40debcf77d1448232c9e1a3e802b91.tar.gz prepro.tar.gz --region us-east-2 \
  && tar xzf prepro.tar.gz --strip-components=1 && cd source \
  && make FLAGS="-O2 -static-libgfortran" linear recent sigma1 && mkdir -p /opt/prepro/bin-o2 \
  && cp linear recent sigma1 /opt/prepro/bin-o2/ && rm -f linear recent sigma1
W=s3://nsr-lake-613473203863/lake/_work/parse/endfb/recon
for f in recon.py jpk.py janis_serve.py janis_tabler.py janis_book.py b1.py; do /snap/bin/aws s3 cp $W/$f /opt/recon/ --region us-east-2; done
/snap/bin/aws s3 cp $W/serve.py /opt/parse/scripts/serve-structure/ --region us-east-2
/snap/bin/aws s3 cp $W/lake.py /opt/parse/scripts/box/ --region us-east-2
/snap/bin/aws s3 cp --recursive $W/ddl/ /opt/parse/scripts/serve-structure/ddl/ --region us-east-2
# NJOY2016 (njoy/NJOY2016 ab27c64, built on nsr-recon-1 with cmake Release, gfortran 13): the engine B1 chose
mkdir -p /opt/njoy/build && /snap/bin/aws s3 cp $W/bin/njoy /opt/njoy/build/njoy --region us-east-2 && chmod +x /opt/njoy/build/njoy
touch /opt/recon/ready
