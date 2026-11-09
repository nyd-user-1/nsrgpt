#!/usr/bin/env bash
# Create or update Lambda nsr-api (services/nsr-api/), its API Gateway HTTP API and the CloudFront distribution in front
# of it, in the New account (brief 16). Copied from scripts/iaea/deploy.sh's pattern; one AWS CLI call at a time.
# The package is built on the parse box by build.sh and read from S3, so nothing large touches the Mac.
#   ./services/nsr-api/deploy.sh        # first run creates everything; later runs update the code; prints the URLs
# Price: inside the free tiers (Lambda 1 M requests and 400,000 GB-s a month; API Gateway HTTP API 1 M calls a month
# for the first year, then $1 a million; CloudFront 10 M requests and 1 TB out a month).
set -euo pipefail
cd "$(dirname "$0")/../.."
A=(--profile nysgpt-new --region us-east-2)
ACCT=613473203863
BUCKET=nsr-lake-$ACCT
FN=nsr-api
ROLE=nsr-api-lambda
KEY=lake/_work/parse/exfor/nsr-api/nsr-api.zip
MEM=3008  # MB, the account's limit (Lambda gives CPU in proportion to memory); /search warm queries run faster than at 2048
TMP=$(mktemp -d)
if ! aws iam get-role --role-name $ROLE "${A[@]}" >/dev/null 2>&1; then
  cat > "$TMP/trust.json" <<'J'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
J
  cat > "$TMP/policy.json" <<J
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":"s3:GetObject","Resource":["arn:aws:s3:::$BUCKET/lake/serve/*","arn:aws:s3:::$BUCKET/lake/exfor/*"]},
 {"Effect":"Allow","Action":"s3:ListBucket","Resource":"arn:aws:s3:::$BUCKET",
  "Condition":{"StringLike":{"s3:prefix":["lake/serve/*","lake/exfor/*"]}}}]}
J
  aws iam create-role --role-name $ROLE --assume-role-policy-document "file://$TMP/trust.json" "${A[@]}" >/dev/null
  aws iam put-role-policy --role-name $ROLE --policy-name $ROLE --policy-document "file://$TMP/policy.json" "${A[@]}"
  aws iam attach-role-policy --role-name $ROLE --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole "${A[@]}"
  sleep 10
fi
if aws lambda get-function --function-name $FN "${A[@]}" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name $FN --s3-bucket $BUCKET --s3-key $KEY "${A[@]}" --query LastModified --output text
  if [ "$(aws lambda get-function-configuration --function-name $FN "${A[@]}" --query MemorySize --output text)" != "$MEM" ]; then
    aws lambda wait function-updated --function-name $FN "${A[@]}"
    aws lambda update-function-configuration --function-name $FN --memory-size $MEM "${A[@]}" --query MemorySize --output text
  fi
else
  aws lambda create-function --function-name $FN --runtime python3.12 --handler lambda_function.lambda_handler \
    --role arn:aws:iam::$ACCT:role/$ROLE --memory-size $MEM --timeout 30 --code S3Bucket=$BUCKET,S3Key=$KEY \
    --tags project=nsr "${A[@]}" --query FunctionArn --output text
fi
# Brief 34: the dataset routes read the parsed lake, /community and /files write the views table and the uploads folder
# (store-policy.json), and those two answer only a caller holding the write key (SSM, merged into the variables kept).
aws iam put-role-policy --role-name $ROLE --policy-name nsr-api-store --policy-document file://services/nsr-api/store-policy.json "${A[@]}"
WK=$(aws ssm get-parameter --name /nsrgpt/devbox/nsr-api-write-key --with-decryption --query Parameter.Value --output text "${A[@]}")
ENV=$(aws lambda get-function-configuration --function-name $FN "${A[@]}" --query 'Environment.Variables' --output json)
if [ "$(echo "$ENV" | jq -r '.NSR_WRITE_KEY // ""')" != "$WK" ]; then
  aws lambda wait function-updated --function-name $FN "${A[@]}"
  aws lambda update-function-configuration --function-name $FN "${A[@]}" --query LastUpdateStatus --output text \
    --environment "$(echo "$ENV" | jq -c --arg k "$WK" '{Variables: ((. // {}) + {NSR_WRITE_KEY: $k})}')"
fi
unset WK
API=$(aws apigatewayv2 get-apis "${A[@]}" --query "Items[?Name=='$FN'].ApiId | [0]" --output text)
if [ "$API" = "None" ] || [ -z "$API" ]; then
  # quick create: one $default route to the Lambda (payload 2.0) and a $default stage that deploys itself
  API=$(aws apigatewayv2 create-api --name $FN --protocol-type HTTP --target arn:aws:lambda:us-east-2:$ACCT:function:$FN \
    --tags project=nsr "${A[@]}" --query ApiId --output text)
  aws lambda add-permission --function-name $FN --statement-id apigw-$FN --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:us-east-2:$ACCT:$API/*" "${A[@]}" >/dev/null
fi
ORIGIN=$API.execute-api.us-east-2.amazonaws.com
CP=$(aws cloudfront list-cache-policies --type custom "${A[@]}" \
  --query "CachePolicyList.Items[?CachePolicy.CachePolicyConfig.Name=='nsr-api-1h'].CachePolicy.Id | [0]" --output text)
if [ "$CP" = "None" ] || [ -z "$CP" ]; then
  CP=$(aws cloudfront create-cache-policy "${A[@]}" --query CachePolicy.Id --output text --cache-policy-config \
    '{"Name":"nsr-api-1h","Comment":"nsr-api: key on the whole query string, keep an hour","DefaultTTL":3600,"MaxTTL":3600,"MinTTL":0,
      "ParametersInCacheKeyAndForwardedToOrigin":{"EnableAcceptEncodingGzip":true,"EnableAcceptEncodingBrotli":true,
      "HeadersConfig":{"HeaderBehavior":"none"},"CookiesConfig":{"CookieBehavior":"none"},"QueryStringsConfig":{"QueryStringBehavior":"all"}}}')
fi
DIST=$(aws cloudfront list-distributions "${A[@]}" --query "DistributionList.Items[?Comment=='nsr-api'].Id | [0]" --output text)
if [ "$DIST" = "None" ] || [ -z "$DIST" ]; then
  # origin request policy b689b0a8-…: AWS's managed AllViewerExceptHostHeader (API Gateway needs its own Host header)
  cat > "$TMP/dist.json" <<J
{"CallerReference":"nsr-api-$(date +%s)","Comment":"nsr-api","Enabled":true,"PriceClass":"PriceClass_100","HttpVersion":"http2and3",
 "Origins":{"Quantity":1,"Items":[{"Id":"nsr-api","DomainName":"$ORIGIN",
   "CustomOriginConfig":{"HTTPPort":80,"HTTPSPort":443,"OriginProtocolPolicy":"https-only","OriginSslProtocols":{"Quantity":1,"Items":["TLSv1.2"]}}}]},
 "DefaultCacheBehavior":{"TargetOriginId":"nsr-api","ViewerProtocolPolicy":"redirect-to-https","Compress":true,
   "AllowedMethods":{"Quantity":2,"Items":["GET","HEAD"],"CachedMethods":{"Quantity":2,"Items":["GET","HEAD"]}},
   "CachePolicyId":"$CP","OriginRequestPolicyId":"b689b0a8-53d0-40ab-baf2-68738e2966ac"}}
J
  DIST=$(aws cloudfront create-distribution --distribution-config "file://$TMP/dist.json" "${A[@]}" --query Distribution.Id --output text)
  aws cloudfront tag-resource --resource "arn:aws:cloudfront::$ACCT:distribution/$DIST" --tags 'Items=[{Key=project,Value=nsr}]' "${A[@]}"
fi
DOMAIN=$(aws cloudfront get-distribution --id "$DIST" "${A[@]}" --query Distribution.DomainName --output text)
echo "api: https://$ORIGIN"
echo "cdn: https://$DOMAIN  (distribution $DIST)"
rm -rf "$TMP"
