#!/usr/bin/env bash
# Brief 77 step 12: Lambda nsr-trans-check (Java 21) runs JANIS's own EXFOR TRANS checker for nsr-api's /exfor/check.
# The package is built on a JANIS engine box (build): TransCheck.class (Java 8 bytecode) at the root and NEA's checker
# jars from lake/_raw/janis-software/janis/trans-checker/download/janis-trans-checker.zip under lib/, zipped to
# lake/_work/janis/engine/nsr-trans-check.zip. Then, from the Mac, one AWS CLI call at a time (deploy): the role, the
# function, and nsr-api's permission to invoke it.
#   ./scripts/iaea/box/ssm.sh <engine box> 'bash /opt/engine/trans-check/deploy.sh build'
#   ./services/nsr-trans-check/deploy.sh deploy
set -euo pipefail
FN=nsr-trans-check
ACCT=613473203863
BUCKET=nsr-lake-$ACCT
KEY=lake/_work/janis/engine/nsr-trans-check.zip
if [ "${1:-}" = build ]; then
  export PATH=$PATH:/snap/bin
  D=/data/trans-check; rm -rf $D && mkdir -p $D/pkg/lib && cd $D
  aws s3 cp s3://$BUCKET/lake/_work/janis/engine/trans-check/TransCheck.java . --only-show-errors
  unzip -q -o /data/janis-software/janis/trans-checker/download/janis-trans-checker.zip -d $D/pkg/lib
  /usr/lib/jvm/java-8-openjdk-amd64/bin/javac -source 8 -target 8 -d $D/pkg TransCheck.java
  (cd $D/pkg && zip -q -r ../$FN.zip .) 2>/dev/null || (cd $D/pkg && /usr/lib/jvm/java-8-openjdk-amd64/bin/jar cfM ../$FN.zip .)
  aws s3 cp $D/$FN.zip s3://$BUCKET/$KEY --only-show-errors
  unzip -l $D/$FN.zip | tail -1
  exit 0
fi
A=(--profile nysgpt-new --region us-east-2)
ROLE=$FN-lambda
T=$(mktemp -d)
if ! aws iam get-role --role-name $ROLE "${A[@]}" >/dev/null 2>&1; then
  echo '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' > $T/trust.json
  aws iam create-role --role-name $ROLE --assume-role-policy-document file://$T/trust.json "${A[@]}" >/dev/null
  aws iam attach-role-policy --role-name $ROLE --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole "${A[@]}"
  sleep 10
fi
if aws lambda get-function --function-name $FN "${A[@]}" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name $FN --s3-bucket $BUCKET --s3-key $KEY "${A[@]}" --query LastModified --output text
else
  aws lambda create-function --function-name $FN --runtime java21 --handler TransCheck::handleRequest \
    --role arn:aws:iam::$ACCT:role/$ROLE --memory-size 2048 --timeout 120 --code S3Bucket=$BUCKET,S3Key=$KEY \
    --tags project=nsr "${A[@]}" --query FunctionArn --output text
fi
# nsr-api invokes it (inline policy nsr-api-trans-check on nsr-api's role)
echo '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"lambda:InvokeFunction","Resource":"arn:aws:lambda:us-east-2:'$ACCT':function:'$FN'"}]}' > $T/p.json
aws iam put-role-policy --role-name nsr-api-lambda --policy-name nsr-api-trans-check --policy-document file://$T/p.json "${A[@]}"
rm -rf $T
