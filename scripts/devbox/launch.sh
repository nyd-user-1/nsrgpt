#!/usr/bin/env bash
# Launch the nsrgpt dev box (2026-11-08): EC2 m7i-flex.large, Ubuntu 24.04, 30 GB gp3, in the default VPC of the new
# account (us-east-2), security group nsr-devbox (port 3000 from Brendan's address only), role nsr-browser-box (SSM
# Session Manager and the deploy key parameter). Shutdown behaviour stop: userdata.sh stops it 6 hours after every boot,
# and `aws ec2 start-instances` brings it back with everything installed. Prints the instance id and public address.
#   ./scripts/devbox/launch.sh                      # new box
#   ./scripts/devbox/launch.sh start i-0123…        # restart a stopped box, print its address
set -euo pipefail
cd "$(dirname "$0")"
A=(--profile nysgpt-new --region us-east-2)
if [ "${1:-}" = "start" ]; then
  aws ec2 start-instances "${A[@]}" --instance-ids "$2" >/dev/null
  aws ec2 wait instance-running "${A[@]}" --instance-ids "$2"
  echo "http://$(aws ec2 describe-instances "${A[@]}" --instance-ids "$2" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text):3000"
  exit 0
fi
VPC=$(aws ec2 describe-vpcs "${A[@]}" --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
SG=$(aws ec2 describe-security-groups "${A[@]}" --filters Name=group-name,Values=nsr-devbox Name=vpc-id,Values="$VPC" --query 'SecurityGroups[0].GroupId' --output text)
AMI=$(aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id "${A[@]}" --query Parameter.Value --output text)
ID=$(aws ec2 run-instances "${A[@]}" --image-id "$AMI" --instance-type m7i-flex.large --count 1 \
  --iam-instance-profile Name=nsr-browser-box --instance-initiated-shutdown-behavior stop \
  --security-group-ids "$SG" --metadata-options HttpTokens=required,HttpEndpoint=enabled \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":30,"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=nsr-devbox},{Key=project,Value=nsr}]" "ResourceType=volume,Tags=[{Key=project,Value=nsr}]" \
  --user-data file://userdata.sh --query 'Instances[0].InstanceId' --output text)
echo "instance $ID"
aws ec2 wait instance-running "${A[@]}" --instance-ids "$ID"
echo "http://$(aws ec2 describe-instances "${A[@]}" --instance-ids "$ID" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text):3000"
