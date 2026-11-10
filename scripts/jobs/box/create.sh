#!/usr/bin/env bash
# Launch the job box nsr-jobs-1 (brief 51), copied from scripts/parse/box/create.sh: EC2 m7i-flex.large (2 vCPU, 8 GB),
# Ubuntu 24.04, 30 GB gp3, reached through SSM (scripts/iaea/box/ssm.sh). Instance-initiated shutdown STOPS it (the
# parse box terminates): idle.sh shuts it down after 30 idle minutes and Lambda nsr-jobs starts it again for a job.
# Own role, nsr-jobs-box: reads lake/* and the lake's copy of IAEA-NDS/PREPRO; writes lake/jobs/*, lake/_work/jobs/* and
# lake/serve/exfor/2026-10-28/points/* (the EXFOR points table, scripts/parse/serve/points.py); reads and updates DynamoDB
# nsrgpt-jobs. Tag project=nsr.
#   ./scripts/jobs/box/create.sh [name] [type] [disk GB]    # prints the instance id
set -euo pipefail
cd "$(dirname "$0")"
NAME=${1:-nsr-jobs-1}; TYPE=${2:-m7i-flex.large}; DISK=${3:-30}
A=(--profile nysgpt-new --region us-east-2)
ROLE=nsr-jobs-box
B=arn:aws:s3:::nsr-lake-613473203863
D=arn:aws:dynamodb:us-east-2:613473203863:table/nsrgpt-jobs
if ! aws iam get-role --role-name $ROLE "${A[@]}" >/dev/null 2>&1; then
  T=$(mktemp -d)
  echo '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' > $T/trust.json
  cat > $T/policy.json <<J
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":"s3:GetObject","Resource":["$B/lake/*","$B/raw/github/IAEA-NDS/PREPRO/*"]},
 {"Effect":"Allow","Action":["s3:PutObject","s3:DeleteObject","s3:AbortMultipartUpload"],"Resource":["$B/lake/jobs/*","$B/lake/_work/jobs/*","$B/lake/serve/exfor/2026-10-28/points/*"]},
 {"Effect":"Allow","Action":["s3:ListBucket","s3:GetBucketLocation"],"Resource":"$B"},
 {"Effect":"Allow","Action":["dynamodb:GetItem","dynamodb:UpdateItem"],"Resource":"$D"}]}
J
  aws iam create-role --role-name $ROLE --assume-role-policy-document file://$T/trust.json "${A[@]}" >/dev/null
  aws iam put-role-policy --role-name $ROLE --policy-name $ROLE --policy-document file://$T/policy.json "${A[@]}"
  aws iam attach-role-policy --role-name $ROLE --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore "${A[@]}"
  aws iam create-instance-profile --instance-profile-name $ROLE "${A[@]}" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name $ROLE --role-name $ROLE "${A[@]}"
  rm -rf $T; sleep 15
fi
AMI=$(aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id "${A[@]}" --query Parameter.Value --output text)
aws ec2 run-instances "${A[@]}" --image-id "$AMI" --instance-type "$TYPE" --count 1 \
  --iam-instance-profile Name=$ROLE --instance-initiated-shutdown-behavior stop \
  --metadata-options HttpTokens=required,HttpEndpoint=enabled \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":'"$DISK"',"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME},{Key=project,Value=nsr}]" "ResourceType=volume,Tags=[{Key=project,Value=nsr}]" \
  --user-data file://userdata.sh --query 'Instances[0].InstanceId' --output text
