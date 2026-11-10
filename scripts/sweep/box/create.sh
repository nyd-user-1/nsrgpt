#!/usr/bin/env bash
# Launch the sweep box (brief 57), copied from scripts/jobs/box/create.sh: EC2 m7i-flex.large (2 vCPU, 8 GB, about $0.10 an
# hour; the brief asked for a c7i.4xlarge but the account allows Free Tier types only), Ubuntu 24.04, 100 GB gp3, reached through SSM (scripts/iaea/box/ssm.sh). Instance-initiated shutdown TERMINATES
# it, and userdata.sh schedules a shutdown 9 hours after boot (the night's spend cap). Role nsr-jobs-box (it reads lake/*);
# this script adds the inline policy nsr-sweep to it: writes lake/sweep/* and lake/_work/sweep/*, reads the lake's mirror of the
# IAEA medical pages (raw/iaea/2026-11-07/medical/), Athena in workgroup
# nsrgpt and Glue tables nsr.sweep_* (to register them). Remove it with
#   aws iam delete-role-policy --role-name nsr-jobs-box --policy-name nsr-sweep
#   ./scripts/sweep/box/create.sh [name] [type] [disk GB]    # prints the instance id
set -euo pipefail
cd "$(dirname "$0")"
NAME=${1:-nsr-sweep-1}; TYPE=${2:-m7i-flex.large}; DISK=${3:-100}
A=(--profile nysgpt-new --region us-east-2)
ROLE=nsr-jobs-box
B=arn:aws:s3:::nsr-lake-613473203863
G=arn:aws:glue:us-east-2:613473203863
T=$(mktemp -d)
cat > $T/policy.json <<J
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:PutObject","s3:DeleteObject","s3:AbortMultipartUpload"],"Resource":["$B/lake/sweep/*","$B/lake/_work/sweep/*"]},
 {"Effect":"Allow","Action":"s3:GetObject","Resource":"$B/raw/iaea/2026-11-07/medical/*"},
 {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:AbortMultipartUpload"],"Resource":"$B/work/athena-results/*"},
 {"Effect":"Allow","Action":["athena:StartQueryExecution","athena:GetQueryExecution","athena:GetQueryResults","athena:StopQueryExecution","athena:GetWorkGroup"],"Resource":"arn:aws:athena:us-east-2:613473203863:workgroup/nsrgpt"},
 {"Effect":"Allow","Action":["glue:GetDatabase","glue:GetDatabases","glue:GetTable","glue:GetTables","glue:CreateTable","glue:UpdateTable","glue:DeleteTable","glue:GetPartition","glue:GetPartitions","glue:BatchGetPartition","glue:CreatePartition","glue:BatchCreatePartition"],"Resource":["$G:catalog","$G:database/nsr","$G:table/nsr/sweep_*"]}]}
J
aws iam put-role-policy --role-name $ROLE --policy-name nsr-sweep --policy-document file://$T/policy.json "${A[@]}"
rm -rf $T
AMI=$(aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id "${A[@]}" --query Parameter.Value --output text)
aws ec2 run-instances "${A[@]}" --image-id "$AMI" --instance-type "$TYPE" --count 1 \
  --iam-instance-profile Name=$ROLE --instance-initiated-shutdown-behavior terminate \
  --metadata-options HttpTokens=required,HttpEndpoint=enabled \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":'"$DISK"',"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME},{Key=project,Value=nsr}]" "ResourceType=volume,Tags=[{Key=project,Value=nsr}]" \
  --user-data file://userdata.sh --query 'Instances[0].InstanceId' --output text
