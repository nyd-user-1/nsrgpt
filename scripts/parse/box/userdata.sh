#!/bin/bash
# EC2 user-data for the ENSDF/XUNDL/ENDF-B parse box (brief 15), copied from scripts/iaea/box/userdata-wb-24h.sh: the
# box ends itself after 24 hours. Python venv at /opt/parse with boto3, pyarrow, pandas, DuckDB and endf-parserpy
# 0.18.0 (from the lake's held sdist, pure-Python build).
set -x
shutdown -h +1440
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3-venv unzip jq
snap install aws-cli --classic || true
python3 -m venv /opt/parse
/opt/parse/bin/pip install -q boto3 pyarrow pandas duckdb
/snap/bin/aws s3 cp s3://nsr-lake-613473203863/raw/pypi/2026-11-07/endf-parserpy/endf_parserpy-0.18.0.tar.gz /tmp/ --region us-east-2 \
  && INSTALL_ENDF_PARSERPY_CPP=no /opt/parse/bin/pip install -q /tmp/endf_parserpy-0.18.0.tar.gz || true
mkdir -p /data /opt/box
touch /opt/box/ready
