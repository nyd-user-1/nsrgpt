#!/usr/bin/env bash
# Brief 17: let the parse box's role (nsr-parse-box, scripts/parse/box/create.sh) write the serving tables. Adds one inline
# policy: S3 writes under lake/serve/nuclide/, lake/serve/endf/, lake/serve/search/2026-11-08/docs_structure/ and
# lake/_work/parse/serve-structure/ (Athena UNLOAD writes there with the caller's credentials), and Glue tables
# nsr.nuclide_serve_*, nsr.endf_serve_*, nsr.search_docs_structure. One AWS CLI call.
set -euo pipefail
B=arn:aws:s3:::nsr-lake-613473203863
G=arn:aws:glue:us-east-2:613473203863
T=$(mktemp)
cat > $T <<J
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:PutObject","s3:DeleteObject","s3:AbortMultipartUpload"],"Resource":["$B/lake/serve/nuclide/*","$B/lake/serve/endf/*","$B/lake/serve/search/2026-11-08/docs_structure/*","$B/lake/serve/search/2026-11-08/docs_structure.manifest.json","$B/lake/_work/parse/serve-structure/*"]},
 {"Effect":"Allow","Action":["glue:GetDatabase","glue:GetTable","glue:GetTables","glue:CreateTable","glue:UpdateTable","glue:DeleteTable","glue:GetPartition","glue:GetPartitions","glue:BatchGetPartition","glue:CreatePartition","glue:BatchCreatePartition","glue:DeletePartition","glue:BatchDeletePartition"],"Resource":["$G:catalog","$G:database/nsr","$G:table/nsr/nuclide_serve_*","$G:table/nsr/endf_serve_*","$G:table/nsr/search_docs_structure"]}]}
J
aws iam put-role-policy --role-name nsr-parse-box --policy-name nsr-parse-box-serve --policy-document file://$T --profile nysgpt-new --region us-east-2
rm -f $T
echo "policy nsr-parse-box-serve set"
