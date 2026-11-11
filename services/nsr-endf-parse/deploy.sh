#!/usr/bin/env bash
# Create or update nsr-endf-parse (brief 64), one AWS CLI call at a time: role nsr-endf-parse (policy.json), the function
# (lambda_function.py plus endf-parserpy 0.18.0's pure-Python package from raw/pypi, no compiled parts; pyarrow from
# AWS's managed layer AWSSDKPandas-Python312), 3,008 MB, 900 s, reserved concurrency 300 so the other functions keep
# 100 of the account's 400.
#   ./services/nsr-endf-parse/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
A=(--profile nysgpt-new --region us-east-2)
ACCT=613473203863
FN=nsr-endf-parse
ROLE=nsr-endf-parse
LAYER=arn:aws:lambda:us-east-2:336392948345:layer:AWSSDKPandas-Python312:20
TMP=$(mktemp -d)
if ! aws iam get-role --role-name $ROLE "${A[@]}" >/dev/null 2>&1; then
  echo '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' > "$TMP/trust.json"
  aws iam create-role --role-name $ROLE --assume-role-policy-document "file://$TMP/trust.json" "${A[@]}" >/dev/null
  aws iam attach-role-policy --role-name $ROLE --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole "${A[@]}"
  sleep 10
fi
aws iam put-role-policy --role-name $ROLE --policy-name $ROLE --policy-document file://services/nsr-endf-parse/policy.json "${A[@]}"
aws s3 cp s3://nsr-lake-$ACCT/raw/pypi/2026-11-07/endf-parserpy/endf_parserpy-0.18.0.tar.gz "$TMP/" "${A[@]}" --only-show-errors
mkdir -p "$TMP/pkg" && tar -xzf "$TMP/endf_parserpy-0.18.0.tar.gz" -C "$TMP"
cp -R "$TMP/endf_parserpy-0.18.0/endf_parserpy" "$TMP/pkg/"
find "$TMP/pkg" \( -name '*.cpp' -o -name '*.hpp' -o -name '__pycache__' \) -prune -exec rm -rf {} +
cp services/nsr-endf-parse/lambda_function.py "$TMP/pkg/"
(cd "$TMP/pkg" && zip -q -r "$TMP/fn.zip" .)
aws s3 cp "$TMP/fn.zip" s3://nsr-lake-$ACCT/lake/_work/endf-parse/fn.zip "${A[@]}" --only-show-errors
if aws lambda get-function --function-name $FN "${A[@]}" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name $FN --s3-bucket nsr-lake-$ACCT --s3-key lake/_work/endf-parse/fn.zip "${A[@]}" --query LastModified --output text
  aws lambda wait function-updated --function-name $FN "${A[@]}"
else
  aws lambda create-function --function-name $FN --runtime python3.12 --handler lambda_function.lambda_handler \
    --role arn:aws:iam::$ACCT:role/$ROLE --memory-size 3008 --timeout 900 --layers $LAYER \
    --code S3Bucket=nsr-lake-$ACCT,S3Key=lake/_work/endf-parse/fn.zip --ephemeral-storage Size=4096 \
    --tags project=nsr "${A[@]}" --query FunctionArn --output text
  aws lambda wait function-active-v2 --function-name $FN "${A[@]}"
  aws lambda put-function-concurrency --function-name $FN --reserved-concurrent-executions 300 "${A[@]}" >/dev/null
  aws lambda put-function-event-invoke-config --function-name $FN --maximum-retry-attempts 0 "${A[@]}" >/dev/null
fi
rm -rf "$TMP"
