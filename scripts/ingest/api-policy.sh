#!/usr/bin/env bash
# Brief 62's tables served by nsr-api (services/nsr-api/refdata.py): inline policy nsr-api-refdata on the Lambda's role
# nsr-api-lambda lets it read lake/stopping/*, lake/ripl/*, lake/iaea-betashape/* and lake/conderc/*. A policy of its own,
# so deploy.sh (which puts nsr-api-lambda and nsr-api-store) leaves it in place.   ./scripts/ingest/api-policy.sh
set -euo pipefail
B=arn:aws:s3:::nsr-lake-613473203863
aws iam put-role-policy --role-name nsr-api-lambda --policy-name nsr-api-refdata --profile nysgpt-new --policy-document "$(cat <<J
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":"s3:GetObject","Resource":["$B/lake/stopping/*","$B/lake/ripl/*","$B/lake/iaea-betashape/*","$B/lake/conderc/*"]},
 {"Effect":"Allow","Action":"s3:ListBucket","Resource":"$B","Condition":{"StringLike":{"s3:prefix":["lake/stopping/*","lake/ripl/*","lake/iaea-betashape/*","lake/conderc/*"]}}}]}
J
)"
echo "nsr-api-refdata put"
