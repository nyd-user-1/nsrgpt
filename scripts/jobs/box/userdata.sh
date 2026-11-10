#!/bin/bash
# EC2 user-data for the job box nsr-jobs-1 (brief 51), copied from scripts/parse/box/userdata.sh, without the 24-hour
# self-termination: cron runs idle.sh every 5 minutes and it stops the box after 30 minutes with no job. PREPRO 2023 is
# built from the lake's copy of IAEA-NDS/PREPRO (commit cc5fd087) with gfortran and the repository's own Makefile flags
# (-O0, /opt/prepro/bin), plus linear, recent and sigma1 at -O2 (/opt/prepro/bin-o2, the same output, about 3x faster);
# a venv at /opt/jobs/venv holds boto3, pyarrow and DuckDB; run.sh, broaden.py and idle.sh come from lake/_work/jobs/box/.
set -x
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y gfortran make python3-venv unzip jq
snap install aws-cli --classic || true
mkdir -p /opt/jobs /opt/prepro /data/jobs /data/tapes /data/tmp /opt/duckdb_ext
python3 -m venv /opt/jobs/venv
/opt/jobs/venv/bin/pip install -q boto3 pyarrow duckdb==2.0.0
cd /opt/prepro && /snap/bin/aws s3 cp s3://nsr-lake-613473203863/raw/github/IAEA-NDS/PREPRO/cc5fd087ab40debcf77d1448232c9e1a3e802b91.tar.gz prepro.tar.gz --region us-east-2 \
  && tar xzf prepro.tar.gz --strip-components=1 && cd source && make && make install PREFIX=/opt/prepro && make clean \
  && make FLAGS="-O2 -static-libgfortran" linear recent sigma1 && mkdir -p /opt/prepro/bin-o2 \
  && cp linear recent sigma1 /opt/prepro/bin-o2/ && rm -f linear recent sigma1
/snap/bin/aws s3 cp --recursive s3://nsr-lake-613473203863/lake/_work/jobs/box/ /opt/jobs/ --region us-east-2
chmod +x /opt/jobs/*.sh
printf '*/5 * * * * root /opt/jobs/idle.sh\n@reboot root touch /opt/jobs/last\n' > /etc/cron.d/nsr-jobs
touch /opt/jobs/last /opt/jobs/ready
