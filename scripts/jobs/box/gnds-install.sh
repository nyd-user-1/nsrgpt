#!/bin/bash
# LLNL FUDGE 6.14.0 on nsr-jobs-1 for the gnds job kind (brief 60), the recipe of scripts/gnds/box/userdata.sh: build
# tools, a venv /opt/gnds/venv (setuptools, wheel, numpy), FUDGE from the lake's copy (raw/github/2026-11-10/LLNL/fudge/)
# built in place with its own Makefile into /opt/gnds/fudge. gnds.py runs it with PYTHONPATH=/opt/gnds/fudge and reads
# the lake with /opt/jobs/venv (boto3, pyarrow). Run once as root; userdata.sh calls it on a new box.
set -x
export DEBIAN_FRONTEND=noninteractive
TAG=6.14.0
apt-get install -y build-essential python3-dev python3-venv
mkdir -p /opt/gnds
[ -x /opt/gnds/venv/bin/python ] || python3 -m venv /opt/gnds/venv
/opt/gnds/venv/bin/pip install -q setuptools wheel numpy
cd /opt/gnds && rm -rf fudge && /snap/bin/aws s3 cp s3://nsr-lake-613473203863/raw/github/2026-11-10/LLNL/fudge/fudge-$TAG.tar.gz . --region us-east-2 --only-show-errors \
  && tar xzf fudge-$TAG.tar.gz && mv fudge-$TAG fudge && rm -f fudge-$TAG.tar.gz
cd /opt/gnds/fudge && make -s PYTHON=/opt/gnds/venv/bin/python > /opt/gnds/build.log 2>&1; echo "make exit $?" >> /opt/gnds/build.log
# getFudgeVersion.py's no-git default leaves out __version__, which fudge/__init__.py imports
grep -q __version__ fudge/fudgeVersion.py || printf "\nFUDGE_PATCHLEVEL = 0\n__version__ = '$TAG'\n" >> fudge/fudgeVersion.py
cd /tmp && PYTHONPATH=/opt/gnds/fudge /opt/gnds/venv/bin/python -c "import fudge; print('fudge', fudge.__version__)"
