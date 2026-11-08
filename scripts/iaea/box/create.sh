#!/usr/bin/env bash
# Launch the walled-site box: EC2 m7i-flex.large (the largest Free Tier type: 2 vCPU, 8 GB), Ubuntu 24.04, 100 GB gp3, reached through SSM (no SSH keys).
# Instance-initiated shutdown terminates it; user-data schedules that shutdown 4 hours out. Tag project=nsr.
#   ./scripts/iaea/box/create.sh [name] [type] [userdata] [disk-gb]       # prints the instance id
#   SPOT=1 ./scripts/iaea/box/create.sh …    # a one-time Spot instance, terminated on interruption. Denied in this account
#                                            # on 2026-11-08 (the organization service control policy denies ec2:InstanceMarketType spot)
set -euo pipefail
cd "$(dirname "$0")"
NAME=${1:-nsr-browser-1}; TYPE=${2:-m7i-flex.large}; UD=${3:-userdata.sh}; DISK=${4:-100}
A=(--profile nysgpt-new --region us-east-2)
ROLE=nsr-browser-box
if ! aws iam get-role --role-name $ROLE "${A[@]}" >/dev/null 2>&1; then
  T=$(mktemp -d)
  echo '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' > $T/trust.json
  cat > $T/policy.json <<'J'
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:PutObject","s3:GetObject","s3:AbortMultipartUpload"],"Resource":"arn:aws:s3:::nsr-lake-613473203863/raw/*"},
 {"Effect":"Allow","Action":"s3:ListBucket","Resource":"arn:aws:s3:::nsr-lake-613473203863"},
 {"Effect":"Allow","Action":"ssm:GetParameter","Resource":"arn:aws:ssm:us-east-2:613473203863:parameter/nsrgpt/webshare/proxies"}]}
J
  aws iam create-role --role-name $ROLE --assume-role-policy-document file://$T/trust.json "${A[@]}" >/dev/null
  aws iam put-role-policy --role-name $ROLE --policy-name nsr-browser-box --policy-document file://$T/policy.json "${A[@]}"
  aws iam attach-role-policy --role-name $ROLE --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore "${A[@]}"
  aws iam create-instance-profile --instance-profile-name $ROLE "${A[@]}" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name $ROLE --role-name $ROLE "${A[@]}"
  rm -rf $T; sleep 15
fi
MARKET=()
[ -n "${SPOT:-}" ] && MARKET=(--instance-market-options '{"MarketType":"spot","SpotOptions":{"SpotInstanceType":"one-time","InstanceInterruptionBehavior":"terminate"}}')
AMI=$(aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id "${A[@]}" --query Parameter.Value --output text)
aws ec2 run-instances "${A[@]}" --image-id "$AMI" --instance-type "$TYPE" --count 1 \
  --iam-instance-profile Name=$ROLE --instance-initiated-shutdown-behavior terminate ${MARKET[@]+"${MARKET[@]}"} \
  --metadata-options HttpTokens=required,HttpEndpoint=enabled \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":'"$DISK"',"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME},{Key=project,Value=nsr}]" "ResourceType=volume,Tags=[{Key=project,Value=nsr}]" \
  --user-data file://$UD --query 'Instances[0].InstanceId' --output text
