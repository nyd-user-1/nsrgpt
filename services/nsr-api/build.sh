#!/bin/bash
# Build the nsr-api Lambda package on a Linux x86_64 box with Python 3.12 (like the Lambda runtime) and put it in S3,
# where deploy.sh points Lambda at it. DuckDB is pinned so the bundled extensions load and search.duckdb opens.
# Runs on the parse box (/opt/parse) or, since brief 34, on the dev box (/opt/nsrapi, made here if missing).
# From the Mac:
#   aws s3 cp services/nsr-api/ s3://nsr-lake-613473203863/lake/_work/parse/exfor/nsr-api/ --recursive --exclude '*' --include '*.py' --include '*.sh'
#   ./scripts/iaea/box/ssm.sh <box> 'aws s3 cp s3://nsr-lake-613473203863/lake/_work/parse/exfor/nsr-api/build.sh /tmp/ && bash /tmp/build.sh'
# The package: every module here (lambda_function.py, keyword_search.py, structure.py, dataset.py, community.py), DuckDB
# with httpfs and fts, reportlab and its Pillow for the dataset PDFs (brief 34), and the DejaVu fonts the PDFs embed for
# Greek letters. boto3 comes with the Lambda runtime.
set -euo pipefail
export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-us-east-2}
export HOME=${HOME:-/root}  # DuckDB needs a home directory to install extensions
B=s3://nsr-lake-613473203863/lake/_work/parse/exfor/nsr-api
DUCKDB=2.0.0
if [ -x /opt/parse/bin/python ]; then PY=/opt/parse/bin/python; else
  PY=/opt/nsrapi/bin/python
  if [ ! -x $PY ]; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y -q python3-venv fonts-dejavu-core >/dev/null
    python3 -m venv /opt/nsrapi
  fi
  $PY -m pip install -q "duckdb==$DUCKDB" reportlab boto3
fi
FONTS=/usr/share/fonts/truetype/dejavu
[ -f $FONTS/DejaVuSans.ttf ] || DEBIAN_FRONTEND=noninteractive apt-get install -y -q fonts-dejavu-core >/dev/null
V=$($PY -c "import duckdb; print(duckdb.__version__)")
D=/data/nsr-api
rm -rf $D/pkg $D/nsr-api.zip && mkdir -p $D/pkg/duckdb_ext/v$V/linux_amd64 $D/pkg/fonts
aws s3 cp --quiet --recursive $B/ $D/pkg/ --exclude '*' --include '*.py' --exclude 'test_*' --exclude '*/*'
$PY -m pip install -q --target $D/pkg "duckdb==$V" reportlab
$PY -c "import duckdb; c = duckdb.connect(config={'extension_directory': '/opt/duckdb_ext'}); [c.execute(f'INSTALL {e}') for e in ('httpfs', 'fts')]"
for e in httpfs fts; do cp /opt/duckdb_ext/v$V/linux_amd64/$e.duckdb_extension* $D/pkg/duckdb_ext/v$V/linux_amd64/; done  # httpfs: S3 reads; fts: /search
cp $FONTS/DejaVuSans.ttf $FONTS/DejaVuSans-Bold.ttf $FONTS/DejaVuSansMono.ttf $D/pkg/fonts/
find $D/pkg -name __pycache__ -type d -prune -exec rm -rf {} +
cd $D/pkg && $PY -m zipfile -c ../nsr-api.zip * && aws s3 cp --quiet ../nsr-api.zip $B/nsr-api.zip
echo "duckdb $V; zip $(stat -c %s $D/nsr-api.zip) bytes; unzipped $(du -sb $D/pkg | cut -f1) bytes"
