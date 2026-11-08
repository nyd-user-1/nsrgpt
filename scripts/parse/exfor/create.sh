#!/usr/bin/env bash
# Launch the EXFOR parse box (brief 16), copied from scripts/iaea/box/create.sh: EC2 m7i-flex.large (2 vCPU, 8 GB),
# Ubuntu 24.04, 100 GB gp3, reached through SSM (scripts/iaea/box/ssm.sh). Instance-initiated shutdown terminates it;
# user-data schedules that shutdown 24 hours out. Tag project=nsr.
# Own role, nsr-parse-exfor-box: reads raw/* and lake/*; writes lake/exfor/*, lake/serve/exfor/*, lake/_work/parse/exfor/*;
# Athena in workgroup nsrgpt and Glue tables nsr.exfor_* (to register what it writes).
#   ./scripts/parse/exfor/create.sh [name] [type] [user-data] [disk GB]    # prints the instance id
set -euo pipefail
cd "$(dirname "$0")"
NAME=${1:-nsr-parse-2}; TYPE=${2:-m7i-flex.large}; UD=${3:-userdata.sh}; DISK=${4:-100}
A=(--profile nysgpt-new --region us-east-2)
ROLE=nsr-parse-exfor-box
B=arn:aws:s3:::nsr-lake-613473203863
if ! aws iam get-role --role-name $ROLE "${A[@]}" >/dev/null 2>&1; then
  T=$(mktemp -d)
  echo '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' > $T/trust.json
  cat > $T/policy.json <<J
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":"s3:GetObject","Resource":["$B/raw/*","$B/lake/*"]},
 {"Effect":"Allow","Action":["s3:PutObject","s3:DeleteObject","s3:AbortMultipartUpload"],"Resource":["$B/lake/exfor/*","$B/lake/serve/exfor/*","$B/lake/_work/parse/exfor/*"]},
 {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:AbortMultipartUpload"],"Resource":"$B/work/athena-results/*"},
 {"Effect":"Allow","Action":["s3:ListBucket","s3:GetBucketLocation","s3:ListBucketMultipartUploads"],"Resource":"$B"},
 {"Effect":"Allow","Action":["athena:StartQueryExecution","athena:GetQueryExecution","athena:GetQueryResults","athena:StopQueryExecution","athena:GetWorkGroup"],"Resource":"arn:aws:athena:us-east-2:613473203863:workgroup/nsrgpt"},
 {"Effect":"Allow","Action":["glue:GetDatabase","glue:GetTable","glue:GetTables","glue:CreateTable","glue:UpdateTable","glue:DeleteTable","glue:GetPartition","glue:GetPartitions","glue:BatchGetPartition","glue:CreatePartition","glue:BatchCreatePartition"],"Resource":["arn:aws:glue:us-east-2:613473203863:catalog","arn:aws:glue:us-east-2:613473203863:database/nsr","arn:aws:glue:us-east-2:613473203863:table/nsr/exfor_*"]}]}
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
  --iam-instance-profile Name=$ROLE --instance-initiated-shutdown-behavior terminate \
  --metadata-options HttpTokens=required,HttpEndpoint=enabled \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":'"$DISK"',"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME},{Key=project,Value=nsr}]" "ResourceType=volume,Tags=[{Key=project,Value=nsr}]" \
  --user-data file://$UD --query 'Instances[0].InstanceId' --output text
