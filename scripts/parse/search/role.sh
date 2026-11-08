#!/usr/bin/env bash
# Widen the parse box's role (nsr-parse-exfor-box, from scripts/parse/exfor/create.sh) for brief 18: read every table
# in Glue database nsr (the search docs draw on EXFOR, ENSDF, XUNDL, ENDF/B and NSR), and write the search prefixes
# (lake/serve/search/*, lake/_work/parse/search/*) and tables nsr.search_*. Everything brief 16 allowed stays.
#   ./scripts/parse/search/role.sh
set -euo pipefail
A=(--profile nysgpt-new --region us-east-2)
ROLE=nsr-parse-exfor-box
B=arn:aws:s3:::nsr-lake-613473203863
G=arn:aws:glue:us-east-2:613473203863
T=$(mktemp -d)
cat > $T/policy.json <<J
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":"s3:GetObject","Resource":["$B/raw/*","$B/lake/*"]},
 {"Effect":"Allow","Action":["s3:PutObject","s3:DeleteObject","s3:AbortMultipartUpload"],"Resource":["$B/lake/exfor/*","$B/lake/serve/exfor/*","$B/lake/_work/parse/exfor/*","$B/lake/serve/search/*","$B/lake/_work/parse/search/*"]},
 {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:AbortMultipartUpload"],"Resource":"$B/work/athena-results/*"},
 {"Effect":"Allow","Action":["s3:ListBucket","s3:GetBucketLocation","s3:ListBucketMultipartUploads"],"Resource":"$B"},
 {"Effect":"Allow","Action":["athena:StartQueryExecution","athena:GetQueryExecution","athena:GetQueryResults","athena:StopQueryExecution","athena:GetWorkGroup"],"Resource":"arn:aws:athena:us-east-2:613473203863:workgroup/nsrgpt"},
 {"Effect":"Allow","Action":["glue:GetDatabase","glue:GetTable","glue:GetTables","glue:GetPartition","glue:GetPartitions","glue:BatchGetPartition"],"Resource":["$G:catalog","$G:database/nsr","$G:table/nsr/*"]},
 {"Effect":"Allow","Action":["glue:CreateTable","glue:UpdateTable","glue:DeleteTable","glue:CreatePartition","glue:BatchCreatePartition"],"Resource":["$G:catalog","$G:database/nsr","$G:table/nsr/exfor_*","$G:table/nsr/search_*"]}]}
J
aws iam put-role-policy --role-name $ROLE --policy-name $ROLE --policy-document file://$T/policy.json "${A[@]}"
rm -rf $T
echo "updated $ROLE"
