#!/usr/bin/env bash
# Brief 77 step 11: Lambda nsr-janis (container image, Java 21) runs JANIS's own list and search (JanisService.java) over
# the H2 bases JANIS's importer built on the engine boxes. The image holds NEA's JANIS 4.1 jars (lib/), the handler, and the
# bases' .h2.db files (index only; the DataPack is not needed to list or search). Built and pushed from an engine box
# (build: Docker, ECR repository nsr-janis), then wired from the Mac (deploy: role, function, the API's GET /janis/{proxy+}
# route to it). None of NEA's code or data is in this repository.
#   ./scripts/iaea/box/ssm.sh <engine box> 'bash /opt/engine/nsr-janis/deploy.sh build <dir with *.h2.db>'
#   ./services/nsr-janis/deploy.sh deploy
set -euo pipefail
FN=nsr-janis
ACCT=613473203863
REGION=us-east-2
REPO=$ACCT.dkr.ecr.$REGION.amazonaws.com/$FN
if [ "${1:-}" = build ]; then
  export PATH=$PATH:/snap/bin
  DB=${2:-/data/janis/database}
  command -v docker >/dev/null || (DEBIAN_FRONTEND=noninteractive apt-get install -y -q docker.io >/dev/null && systemctl start docker)
  W=/data/nsr-janis-image; rm -rf $W && mkdir -p $W/lib $W/db && cd $W
  aws s3 cp s3://nsr-lake-$ACCT/lake/_work/janis/engine/nsr-janis/JanisService.java . --only-show-errors
  cp /opt/janis/*.jar lib/
  /usr/lib/jvm/java-8-openjdk-amd64/bin/javac -source 8 -target 8 -cp "lib/*" -d classes JanisService.java
  for f in $DB/*.h2.db; do cp "$f" db/; done
  cat > Dockerfile <<'D'
FROM public.ecr.aws/lambda/java:21
COPY lib/ ${LAMBDA_TASK_ROOT}/lib/
COPY classes/ ${LAMBDA_TASK_ROOT}/
COPY db/ /opt/janis-db/
CMD ["JanisService::handleRequest"]
D
  aws ecr describe-repositories --repository-names $FN --region $REGION >/dev/null 2>&1 || aws ecr create-repository --repository-name $FN --region $REGION >/dev/null
  aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCT.dkr.ecr.$REGION.amazonaws.com >/dev/null
  docker build -q -t $FN . && docker tag $FN:latest $REPO:latest && docker push -q $REPO:latest
  docker inspect --format '{{.Size}}' $FN:latest
  exit 0
fi
A=(--profile nysgpt-new --region $REGION)
ROLE=$FN-lambda
T=$(mktemp -d)
if ! aws iam get-role --role-name $ROLE "${A[@]}" >/dev/null 2>&1; then
  echo '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' > $T/trust.json
  aws iam create-role --role-name $ROLE --assume-role-policy-document file://$T/trust.json "${A[@]}" >/dev/null
  aws iam attach-role-policy --role-name $ROLE --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole "${A[@]}"
  sleep 10
fi
if aws lambda get-function --function-name $FN "${A[@]}" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name $FN --image-uri $REPO:latest "${A[@]}" --query LastModified --output text
else
  aws lambda create-function --function-name $FN --package-type Image --code ImageUri=$REPO:latest \
    --role arn:aws:iam::$ACCT:role/$ROLE --memory-size 3008 --timeout 30 --ephemeral-storage Size=10240 \
    --tags project=nsr "${A[@]}" --query FunctionArn --output text
fi
# GET /janis/{proxy+} on nsr-api's HTTP API goes to nsr-janis
API=$(aws apigatewayv2 get-apis "${A[@]}" --query "Items[?Name=='nsr-api'].ApiId | [0]" --output text)
ARN=arn:aws:lambda:$REGION:$ACCT:function:$FN
INT=$(aws apigatewayv2 get-integrations --api-id $API "${A[@]}" --query "Items[?IntegrationUri=='$ARN'].IntegrationId | [0]" --output text)
if [ "$INT" = "None" ] || [ -z "$INT" ]; then
  INT=$(aws apigatewayv2 create-integration --api-id $API --integration-type AWS_PROXY --integration-uri $ARN --payload-format-version 2.0 "${A[@]}" --query IntegrationId --output text)
  aws lambda add-permission --function-name $FN --statement-id apigw-$FN --action lambda:InvokeFunction --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:$REGION:$ACCT:$API/*/*/janis/*" "${A[@]}" >/dev/null
fi
R=$(aws apigatewayv2 get-routes --api-id $API "${A[@]}" --query "Items[?RouteKey=='GET /janis/{proxy+}'].RouteId | [0]" --output text)
if [ "$R" = "None" ] || [ -z "$R" ]; then
  aws apigatewayv2 create-route --api-id $API --route-key 'GET /janis/{proxy+}' --target integrations/$INT "${A[@]}" --query RouteId --output text
fi
rm -rf $T
echo "https://$API.execute-api.$REGION.amazonaws.com/janis/list?refs="
