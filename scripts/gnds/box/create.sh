#!/usr/bin/env bash
# Launch a GNDS compile box (brief 60), copied from scripts/jobs/box/create.sh: EC2 m7i-flex.large (2 vCPU, 8 GB,
# about $0.096 an hour; the account launches Free Tier types only, so the brief's c7i.4xlarge is refused and Part B fans out
# over several of these, nsr-gnds-1..N), Ubuntu 24.04, 100 GB gp3, reached through SSM (scripts/iaea/box/ssm.sh). Instance-initiated
# shutdown TERMINATES it, and userdata.sh shuts it down after 12 hours, so it cannot outlive the night's $10 cap.
# Role nsr-jobs-box (brief 51) with an inline policy nsr-gnds added here: write lake/gnds/*, lake/_work/gnds/* and the
# lake's copy of FUDGE (raw/github/2026-11-10/LLNL/fudge/*); read uploads (files/pdfs/workspace/*, the gnds job's
# file_key on nsr-jobs-1, which shares the role); Athena and Glue for nsr.gnds_*. Tag project=nsr.
#   ./scripts/gnds/box/create.sh [name] [type] [disk GB]    # prints the instance id
set -euo pipefail
cd "$(dirname "$0")"
NAME=${1:-nsr-gnds-1}; TYPE=${2:-m7i-flex.large}; DISK=${3:-100}
A=(--profile nysgpt-new --region us-east-2)
ROLE=nsr-jobs-box
B=arn:aws:s3:::nsr-lake-613473203863
G=arn:aws:glue:us-east-2:613473203863
T=$(mktemp -d)
cat > $T/policy.json <<J
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":"s3:GetObject","Resource":["$B/raw/github/2026-11-10/LLNL/fudge/*","$B/work/athena-results/*","$B/files/pdfs/workspace/*"]},
 {"Effect":"Allow","Action":["s3:PutObject","s3:DeleteObject","s3:AbortMultipartUpload"],"Resource":["$B/lake/gnds/*","$B/lake/_work/gnds/*","$B/raw/github/2026-11-10/LLNL/fudge/*","$B/work/athena-results/*"]},
 {"Effect":"Allow","Action":["athena:StartQueryExecution","athena:GetQueryExecution","athena:GetQueryResults","athena:StopQueryExecution","athena:GetWorkGroup"],"Resource":"arn:aws:athena:us-east-2:613473203863:workgroup/nsrgpt"},
 {"Effect":"Allow","Action":["glue:GetDatabase","glue:GetDatabases","glue:GetTable","glue:GetTables","glue:CreateTable","glue:UpdateTable","glue:DeleteTable","glue:GetPartition","glue:GetPartitions","glue:BatchGetPartition","glue:CreatePartition","glue:BatchCreatePartition","glue:UpdatePartition","glue:DeletePartition","glue:BatchDeletePartition"],"Resource":["$G:catalog","$G:database/nsr","$G:table/nsr/gnds_*"]}]}
J
aws iam put-role-policy --role-name $ROLE --policy-name nsr-gnds --policy-document file://$T/policy.json "${A[@]}"
rm -rf $T
AMI=$(aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id "${A[@]}" --query Parameter.Value --output text)
aws ec2 run-instances "${A[@]}" --image-id "$AMI" --instance-type "$TYPE" --count 1 \
  --iam-instance-profile Name=$ROLE --instance-initiated-shutdown-behavior terminate \
  --metadata-options HttpTokens=required,HttpEndpoint=enabled \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":'"$DISK"',"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME},{Key=project,Value=nsr}]" "ResourceType=volume,Tags=[{Key=project,Value=nsr}]" \
  --user-data file://userdata.sh --query 'Instances[0].InstanceId' --output text
