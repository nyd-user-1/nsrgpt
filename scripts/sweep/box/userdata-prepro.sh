#!/bin/bash
# EC2 user-data for a PREPRO reconstruction box (brief 57 follow-up): the sweep box (userdata.sh) plus PREPRO 2023's
# linear, recent and sigma1 built at -O2 from the lake's copy of IAEA-NDS/PREPRO (as scripts/jobs/box/userdata.sh does);
# a shutdown 4 hours after boot, which terminates the box.
set -x
shutdown -h +240
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3-venv unzip jq gfortran make
snap install aws-cli --classic || true
mkdir -p /opt/sweep /data/sweep /data/tmp/duckdb /opt/duckdb_ext /opt/prepro/bin-o2
python3 -m venv /opt/sweep/venv
/opt/sweep/venv/bin/pip install -q boto3 pyarrow duckdb==2.0.0 numpy
HOME=/root /opt/sweep/venv/bin/python -c "import duckdb; c=duckdb.connect(config={'extension_directory':'/opt/duckdb_ext'}); c.execute('INSTALL httpfs')"
cd /opt/prepro && /snap/bin/aws s3 cp s3://nsr-lake-613473203863/raw/github/IAEA-NDS/PREPRO/cc5fd087ab40debcf77d1448232c9e1a3e802b91.tar.gz prepro.tar.gz --region us-east-2 \
  && tar xzf prepro.tar.gz --strip-components=1 && cd source && make FLAGS="-O2 -static-libgfortran" linear recent sigma1 \
  && cp linear recent sigma1 /opt/prepro/bin-o2/
/snap/bin/aws s3 cp --recursive s3://nsr-lake-613473203863/lake/_work/sweep/scripts/ /opt/sweep/ --region us-east-2 || true
touch /opt/sweep/ready
