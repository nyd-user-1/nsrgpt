#!/usr/bin/env bash
# Create or update the job runner (brief 51), copied from services/nsr-api/deploy.sh's pattern, one AWS CLI call at a time:
# DynamoDB nsrgpt-jobs (on demand; key id; index status-created_at), role nsr-jobs-lambda, Lambda nsr-jobs (one small
# file, zipped here), its write key from SSM (/nsrgpt/devbox/nsr-api-write-key, as nsr-api), and the routes POST /jobs,
# GET /jobs, GET /jobs/{id}, GET /jobs/{id}/result on nsr-api's HTTP API, so the same CloudFront distribution serves them.
#   ./services/nsr-jobs/deploy.sh [box instance id]     # the box from scripts/jobs/box/create.sh (Name nsr-jobs-1)
# Price: DynamoDB on demand ($1.25 a million writes, $0.25 a million reads), Lambda and API Gateway inside the free tiers.
set -euo pipefail
cd "$(dirname "$0")/../.."
A=(--profile nysgpt-new --region us-east-2)
ACCT=613473203863
FN=nsr-jobs
ROLE=nsr-jobs-lambda
TABLE=nsrgpt-jobs
BOX=${1:-$(aws ec2 describe-instances "${A[@]}" --filters Name=tag:Name,Values=nsr-jobs-1 Name=instance-state-name,Values=pending,running,stopping,stopped --query 'Reservations[0].Instances[0].InstanceId' --output text)}
TMP=$(mktemp -d)
if ! aws dynamodb describe-table --table-name $TABLE "${A[@]}" >/dev/null 2>&1; then
  aws dynamodb create-table --table-name $TABLE --billing-mode PAY_PER_REQUEST "${A[@]}" \
    --attribute-definitions AttributeName=id,AttributeType=S AttributeName=status,AttributeType=S AttributeName=created_at,AttributeType=S \
    --key-schema AttributeName=id,KeyType=HASH \
    --global-secondary-indexes '[{"IndexName":"status-created_at","KeySchema":[{"AttributeName":"status","KeyType":"HASH"},{"AttributeName":"created_at","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
    --tags Key=project,Value=nsr --query TableDescription.TableStatus --output text
  aws dynamodb wait table-exists --table-name $TABLE "${A[@]}"
fi
if ! aws iam get-role --role-name $ROLE "${A[@]}" >/dev/null 2>&1; then
  echo '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' > "$TMP/trust.json"
  aws iam create-role --role-name $ROLE --assume-role-policy-document "file://$TMP/trust.json" "${A[@]}" >/dev/null
  aws iam attach-role-policy --role-name $ROLE --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole "${A[@]}"
  sleep 10
fi
sed "s/@BOX@/$BOX/g" services/nsr-jobs/policy.json > "$TMP/policy.json"
aws iam put-role-policy --role-name $ROLE --policy-name $ROLE --policy-document "file://$TMP/policy.json" "${A[@]}"
(cd services/nsr-jobs && zip -q -j "$TMP/fn.zip" lambda_function.py)
WK=$(aws ssm get-parameter --name /nsrgpt/devbox/nsr-api-write-key --with-decryption --query Parameter.Value --output text "${A[@]}")
ENV=$(jq -nc --arg b "$BOX" --arg k "$WK" '{Variables: {JOB_BOX: $b, NSR_WRITE_KEY: $k, CDN: "https://daw1qggkn69lv.cloudfront.net"}}')
if aws lambda get-function --function-name $FN "${A[@]}" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name $FN --zip-file "fileb://$TMP/fn.zip" "${A[@]}" --query LastModified --output text
  aws lambda wait function-updated --function-name $FN "${A[@]}"
  aws lambda update-function-configuration --function-name $FN --environment "$ENV" "${A[@]}" --query LastUpdateStatus --output text
else
  aws lambda create-function --function-name $FN --runtime python3.12 --handler lambda_function.lambda_handler \
    --role arn:aws:iam::$ACCT:role/$ROLE --memory-size 512 --timeout 300 --zip-file "fileb://$TMP/fn.zip" \
    --environment "$ENV" --tags project=nsr "${A[@]}" --query FunctionArn --output text
fi
unset WK ENV
API=$(aws apigatewayv2 get-apis "${A[@]}" --query "Items[?Name=='nsr-api'].ApiId | [0]" --output text)
INT=$(aws apigatewayv2 get-integrations --api-id "$API" "${A[@]}" --query "Items[?ends_with(IntegrationUri, ':function:$FN')].IntegrationId | [0]" --output text)
if [ "$INT" = "None" ] || [ -z "$INT" ]; then
  INT=$(aws apigatewayv2 create-integration --api-id "$API" --integration-type AWS_PROXY --payload-format-version 2.0 \
    --integration-uri arn:aws:lambda:us-east-2:$ACCT:function:$FN "${A[@]}" --query IntegrationId --output text)
  aws lambda add-permission --function-name $FN --statement-id apigw-$FN --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:us-east-2:$ACCT:$API/*" "${A[@]}" >/dev/null
fi
ROUTES=$(aws apigatewayv2 get-routes --api-id "$API" "${A[@]}" --query 'Items[].RouteKey' --output text)
for R in "POST /jobs" "GET /jobs" "GET /jobs/{id}" "GET /jobs/{id}/result"; do
  case "$ROUTES" in *"$R"*) ;; *) aws apigatewayv2 create-route --api-id "$API" --route-key "$R" --target "integrations/$INT" "${A[@]}" --query RouteKey --output text;; esac
done
echo "box: $BOX"
echo "api: https://$API.execute-api.us-east-2.amazonaws.com/jobs"
rm -rf "$TMP"
