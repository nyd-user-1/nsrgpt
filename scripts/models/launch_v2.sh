#!/bin/bash
# Brief 61: launch the nsr-encoder v2 GPU box, copied from ~/Code/nsr/scripts/train-nsr/launch.sh (the NSR-CPT rig: Old
# account 638175140432, us-east-1, role and instance profile nsr-embed, security group nsr-embed-sg, 44b's PyTorch DLAMI)
# without its database steps. The New account's GPU quota is 0 (2026-11-11), so the box runs here and reads and writes
# the lake through the bucket policy's OldAccountTrainer* statements. The box runs v2_box.sh, uploads its log and stops
# itself (instance-initiated shutdown terminates it); a watchdog stops it after WATCHDOG_MIN minutes whatever happens.
#   ./scripts/models/launch_v2.sh            # prints the instance id; price: g6e.xlarge about $1.861 an hour
set -euo pipefail
cd "$(dirname "$0")/../.."
A=(--profile default --region us-east-1)
TYPE=${TYPE:-g6e.xlarge}
AMI=${AMI:-ami-012ba162b9cd2729c}
WATCHDOG_MIN=${WATCHDOG_MIN:-240}
RUN_ID=${RUN_ID:-$(date -u +%Y%m%d-%H%M)}
aws s3 cp scripts/models/v2_box.sh s3://nsr-embed-v2/v2/v2_box.sh "${A[@]}" --only-show-errors
aws s3 cp scripts/models/v2_eval.py s3://nsr-lake-613473203863/lake/models/nsr-encoder-v2/scripts/v2_eval.py \
  --profile nysgpt-new --region us-east-2 --only-show-errors
VPC=$(aws ec2 describe-vpcs "${A[@]}" --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
SG=$(aws ec2 describe-security-groups "${A[@]}" --filters Name=group-name,Values=nsr-embed-sg Name=vpc-id,Values=$VPC \
  --query 'SecurityGroups[0].GroupId' --output text)
UD=$(cat <<EOF
#!/bin/bash
exec > /var/log/v2.log 2>&1
set -x
shutdown -h +$WATCHDOG_MIN
export AWS_DEFAULT_REGION=us-east-1
mkdir -p /opt/train
aws s3 cp s3://nsr-embed-v2/v2/v2_box.sh /opt/v2_box.sh
chmod +x /opt/v2_box.sh
RUN_ID=$RUN_ID /opt/v2_box.sh
aws s3 cp /var/log/v2.log s3://nsr-embed-v2/logs/nsr-v2-$RUN_ID.log
aws s3 cp /var/log/v2.log s3://nsr-lake-613473203863/lake/models/nsr-encoder-v2/run-$RUN_ID/box.log --region us-east-2
shutdown -h now
EOF
)
echo "run_id: $RUN_ID" >&2
aws ec2 run-instances "${A[@]}" --image-id "$AMI" --instance-type $TYPE --count 1 \
  --iam-instance-profile Name=nsr-embed --security-group-ids "$SG" --instance-initiated-shutdown-behavior terminate \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":150,"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=nsr-v2-$RUN_ID},{Key=project,Value=nsr}]" \
  --user-data "$UD" --query 'Instances[0].InstanceId' --output text
