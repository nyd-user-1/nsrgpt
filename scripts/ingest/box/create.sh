#!/usr/bin/env bash
# Launch the ingest box nsr-ingest-1 (brief 62), copied from scripts/gnds/box/create.sh: EC2 m7i-flex.large (2 vCPU, 8 GB,
# about $0.096 an hour; the account launches Free Tier types only), Ubuntu 24.04, 60 GB gp3, reached through SSM (scripts/iaea/box/ssm.sh). Instance-initiated
# shutdown TERMINATES it, and userdata.sh shuts it down after 8 hours (brief 62's cap is $5).
# Role nsr-jobs-box (brief 51) with an inline policy nsr-ingest added here: read raw/*; write raw/iaea/2026-11-11/*, the
# brief's tables (lake/stopping/*, lake/ripl/*, lake/conderc/*, lake/iaea-records/*, lake/iaea-cdroms/*,
# lake/iaea-betashape/*) and
# lake/_work/ingest/*; Athena and Glue for nsr.stopping_*, nsr.ripl_*, nsr.conderc_*, nsr.iaea_*. Tag project=nsr.
#   ./scripts/ingest/box/create.sh [name] [type] [disk GB]    # prints the instance id
set -euo pipefail
cd "$(dirname "$0")"
NAME=${1:-nsr-ingest-1}; TYPE=${2:-m7i-flex.large}; DISK=${3:-60}
A=(--profile nysgpt-new --region us-east-2)
ROLE=nsr-jobs-box
B=arn:aws:s3:::nsr-lake-613473203863
G=arn:aws:glue:us-east-2:613473203863
T=$(mktemp -d)
cat > $T/policy.json <<J
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":"s3:GetObject","Resource":["$B/raw/*","$B/work/athena-results/*"]},
 {"Effect":"Allow","Action":["s3:PutObject","s3:DeleteObject","s3:AbortMultipartUpload"],"Resource":["$B/raw/iaea/2026-11-11/*","$B/lake/stopping/*","$B/lake/ripl/*","$B/lake/conderc/*","$B/lake/iaea-records/*","$B/lake/iaea-cdroms/*","$B/lake/iaea-betashape/*","$B/lake/_work/ingest/*","$B/work/athena-results/*"]},
 {"Effect":"Allow","Action":["athena:StartQueryExecution","athena:GetQueryExecution","athena:GetQueryResults","athena:StopQueryExecution","athena:GetWorkGroup"],"Resource":"arn:aws:athena:us-east-2:613473203863:workgroup/nsrgpt"},
 {"Effect":"Allow","Action":["glue:GetDatabase","glue:GetDatabases","glue:GetTable","glue:GetTables","glue:CreateTable","glue:UpdateTable","glue:DeleteTable","glue:GetPartition","glue:GetPartitions","glue:BatchGetPartition","glue:CreatePartition","glue:BatchCreatePartition","glue:UpdatePartition","glue:DeletePartition","glue:BatchDeletePartition"],"Resource":["$G:catalog","$G:database/nsr","$G:table/nsr/stopping_*","$G:table/nsr/ripl_*","$G:table/nsr/conderc_*","$G:table/nsr/iaea_*"]}]}
J
aws iam put-role-policy --role-name $ROLE --policy-name nsr-ingest --policy-document file://$T/policy.json "${A[@]}"
rm -rf $T
AMI=$(aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id "${A[@]}" --query Parameter.Value --output text)
aws ec2 run-instances "${A[@]}" --image-id "$AMI" --instance-type "$TYPE" --count 1 \
  --iam-instance-profile Name=$ROLE --instance-initiated-shutdown-behavior terminate \
  --metadata-options HttpTokens=required,HttpEndpoint=enabled \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":'"$DISK"',"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME},{Key=project,Value=nsr}]" "ResourceType=volume,Tags=[{Key=project,Value=nsr}]" \
  --user-data file://userdata.sh --query 'Instances[0].InstanceId' --output text
