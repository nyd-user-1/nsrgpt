#!/bin/bash
# Build the nsr-api Lambda package on the parse box (Linux x86_64, Python 3.12, like the Lambda runtime) and put it in
# S3, where deploy.sh points Lambda at it. DuckDB is pinned to the box's version so the bundled httpfs extension loads.
# From the Mac:
#   aws s3 cp services/nsr-api/ s3://nsr-lake-613473203863/lake/_work/parse/exfor/nsr-api/ --recursive
#   ./scripts/iaea/box/ssm.sh <box> 'aws s3 cp s3://nsr-lake-613473203863/lake/_work/parse/exfor/nsr-api/build.sh /tmp/ && bash /tmp/build.sh'
set -euo pipefail
B=s3://nsr-lake-613473203863/lake/_work/parse/exfor/nsr-api
V=$(/opt/parse/bin/python -c "import duckdb; print(duckdb.__version__)")
D=/data/nsr-api
rm -rf $D && mkdir -p $D/pkg/duckdb_ext/v$V/linux_amd64
aws s3 cp --quiet $B/lambda_function.py $D/pkg/
/opt/parse/bin/pip install -q --target $D/pkg "duckdb==$V"
cp /opt/duckdb_ext/v$V/linux_amd64/httpfs.duckdb_extension* $D/pkg/duckdb_ext/v$V/linux_amd64/
cd $D/pkg && /opt/parse/bin/python -m zipfile -c ../nsr-api.zip * && aws s3 cp --quiet ../nsr-api.zip $B/nsr-api.zip
echo "duckdb $V; zip $(stat -c %s $D/nsr-api.zip) bytes; unzipped $(du -sb $D/pkg | cut -f1) bytes"
