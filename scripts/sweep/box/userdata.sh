#!/bin/bash
# EC2 user-data for the sweep box (brief 57), copied from scripts/jobs/box/userdata.sh: a venv at /opt/sweep/venv with
# boto3, pyarrow, DuckDB 2.0.0 (httpfs installed into /opt/duckdb_ext), numpy and scipy; the scripts from
# lake/_work/sweep/scripts/; a shutdown 9 hours after boot, which terminates the box (the night's spend cap).
set -x
shutdown -h +540
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3-venv unzip jq
snap install aws-cli --classic || true
mkdir -p /opt/sweep /data/sweep /data/tmp/duckdb /opt/duckdb_ext
python3 -m venv /opt/sweep/venv
/opt/sweep/venv/bin/pip install -q boto3 pyarrow duckdb==2.0.0 numpy scipy
HOME=/root /opt/sweep/venv/bin/python -c "import duckdb; c=duckdb.connect(config={'extension_directory':'/opt/duckdb_ext'}); c.execute('INSTALL httpfs')"
/snap/bin/aws s3 cp --recursive s3://nsr-lake-613473203863/lake/_work/sweep/scripts/ /opt/sweep/ --region us-east-2 || true
touch /opt/sweep/ready
