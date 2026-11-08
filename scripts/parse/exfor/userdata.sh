#!/bin/bash
# EC2 user-data for the EXFOR parse box (brief 16), copied from scripts/iaea/box/userdata-wb-24h.sh: the box ends
# itself after 24 hours. Python venv at /opt/parse with boto3, pyarrow, pandas and DuckDB; sqlite3 and unzip.
set -x
shutdown -h +1440
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3-venv sqlite3 unzip zip jq
python3 -m venv /opt/parse
/opt/parse/bin/pip install -q boto3 pyarrow pandas duckdb
mkdir -p /opt/duckdb_ext /data
export HOME=/root
/opt/parse/bin/python -c "import duckdb; c=duckdb.connect(config={'extension_directory':'/opt/duckdb_ext'}); c.sql('INSTALL sqlite'); c.sql('INSTALL httpfs')" || true
snap install aws-cli --classic || true
mkdir -p /opt/box
touch /opt/box/ready
