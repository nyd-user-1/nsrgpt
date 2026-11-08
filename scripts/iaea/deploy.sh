#!/usr/bin/env bash
# Create or update Lambda iaea-pull (services/iaea-pull/) in the New account. One AWS CLI call at a time.
#   ./scripts/iaea/deploy.sh            # first run creates the role and function; later runs update the code
set -euo pipefail
cd "$(dirname "$0")/../.."
A=(--profile nysgpt-new --region us-east-2)
ROLE=iaea-pull-lambda
TMP=$(mktemp -d)
cd services/iaea-pull && zip -q "$TMP/f.zip" lambda_function.py && cd - >/dev/null
if ! aws iam get-role --role-name $ROLE "${A[@]}" >/dev/null 2>&1; then
  cat > "$TMP/trust.json" <<'J'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
J
  cat > "$TMP/policy.json" <<'J'
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:PutObject","s3:GetObject","s3:AbortMultipartUpload"],"Resource":"arn:aws:s3:::nsr-lake-613473203863/raw/*"},
 {"Effect":"Allow","Action":"s3:ListBucket","Resource":"arn:aws:s3:::nsr-lake-613473203863"},
 {"Effect":"Allow","Action":"lambda:InvokeFunction","Resource":["arn:aws:lambda:us-east-2:613473203863:function:nsr-fetch","arn:aws:lambda:us-east-2:613473203863:function:iaea-pull"]},
 {"Effect":"Allow","Action":"ssm:GetParameter","Resource":"arn:aws:ssm:us-east-2:613473203863:parameter/nsrgpt/webshare/proxies"}]}
J
  aws iam create-role --role-name $ROLE --assume-role-policy-document "file://$TMP/trust.json" "${A[@]}" >/dev/null
  aws iam put-role-policy --role-name $ROLE --policy-name iaea-pull --policy-document "file://$TMP/policy.json" "${A[@]}"
  aws iam attach-role-policy --role-name $ROLE --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole "${A[@]}"
  sleep 10
fi
if aws lambda get-function --function-name iaea-pull "${A[@]}" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name iaea-pull --zip-file "fileb://$TMP/f.zip" "${A[@]}" --query LastModified --output text
else
  aws lambda create-function --function-name iaea-pull --runtime python3.12 --handler lambda_function.lambda_handler \
    --role arn:aws:iam::613473203863:role/$ROLE --memory-size 1024 --timeout 900 --zip-file "fileb://$TMP/f.zip" \
    "${A[@]}" --query FunctionArn --output text
fi
rm -rf "$TMP"
