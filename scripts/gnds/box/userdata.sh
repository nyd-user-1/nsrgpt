#!/bin/bash
# EC2 user-data for the GNDS compile box nsr-gnds-1 (brief 60), copied from scripts/jobs/box/userdata.sh. The box ends
# itself after 12 hours. FUDGE: GitHub's archive of tag 6.14.0 goes into the lake first (raw/github/2026-11-10/LLNL/fudge/,
# with manifest.json: tag, commit, URL, bytes, sha256), then the box builds FUDGE from the lake's copy with the
# repository's own Makefile (`make -s`, C extensions in place; pip's build needs git tags the archive lacks) into
# /opt/gnds/fudge, run with PYTHONPATH=/opt/gnds/fudge from the venv /opt/gnds/venv (setuptools, numpy, boto3, pyarrow).
# compile.py and check.py come from lake/_work/gnds/box/.
set -x
shutdown -h +720
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y build-essential python3-dev python3-venv git jq unzip time
snap install aws-cli --classic || true
AWS=/snap/bin/aws
B=s3://nsr-lake-613473203863
RAW=raw/github/2026-11-10/LLNL/fudge
TAG=6.14.0
COMMIT=41da14cfeaa8d0261451441f5212cd34ccf6b13f
mkdir -p /opt/gnds /data/src /data/tapes /data/out /data/rec
python3 -m venv /opt/gnds/venv
/opt/gnds/venv/bin/pip install -q setuptools wheel numpy boto3 pyarrow
cd /data/src && curl -sSL -o fudge-$TAG.tar.gz https://github.com/LLNL/fudge/archive/refs/tags/$TAG.tar.gz
TARCOMMIT=$(gzip -dc fudge-$TAG.tar.gz | git get-tar-commit-id)
jq -n --arg tag $TAG --arg commit $COMMIT --arg tarcommit "$TARCOMMIT" \
  --arg url https://github.com/LLNL/fudge/archive/refs/tags/$TAG.tar.gz --arg key $RAW/fudge-$TAG.tar.gz \
  --argjson bytes $(stat -c %s fudge-$TAG.tar.gz) --arg sha256 $(sha256sum fudge-$TAG.tar.gz | cut -d' ' -f1) \
  --arg fetched "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{repo: "LLNL/fudge", name: "FUDGE (For Updating Data and Generating Evaluations)", license: "BSD-3-Clause",
    version: $tag, tag: $tag, commit: $commit, archive_commit: $tarcommit, url: $url, key: $key, bytes: $bytes,
    sha256: $sha256, fetched_at: $fetched, brief: "60"}' > manifest.json
$AWS s3 cp fudge-$TAG.tar.gz $B/$RAW/fudge-$TAG.tar.gz --region us-east-2 --only-show-errors
$AWS s3 cp manifest.json $B/$RAW/manifest.json --region us-east-2 --only-show-errors
rm -f fudge-$TAG.tar.gz
cd /opt/gnds && $AWS s3 cp $B/$RAW/fudge-$TAG.tar.gz . --region us-east-2 --only-show-errors \
  && tar xzf fudge-$TAG.tar.gz && mv fudge-$TAG fudge && rm -f fudge-$TAG.tar.gz
cd /opt/gnds/fudge && make -s PYTHON=/opt/gnds/venv/bin/python > /opt/gnds/build.log 2>&1; echo "make exit $?" >> /opt/gnds/build.log
# getFudgeVersion.py's no-git default leaves out __version__, which fudge/__init__.py imports
grep -q __version__ fudge/fudgeVersion.py || printf "\nFUDGE_PATCHLEVEL = 0\n__version__ = '$TAG'\n" >> fudge/fudgeVersion.py
$AWS s3 cp --recursive $B/lake/_work/gnds/box/ /opt/gnds/ --region us-east-2 --only-show-errors || true
touch /opt/gnds/ready
