#!/bin/bash
# Brief 61: launch the nsr-encoder v2 GPU box, copied from ~/Code/nsr/scripts/train-nsr/launch.sh (the NSR-CPT rig: Old
# account 638175140432, us-east-1, role and instance profile nsr-embed, security group nsr-embed-sg, 44b's PyTorch DLAMI)
# without its database steps. The New account's GPU quota is 0 (2026-11-10), so the box runs here; the lake refuses
# this account across accounts, so the box reads its inputs by presigned links (presign.mjs) and writes to
# s3://nsr-embed-v2/models/nsr-encoder-v2/. The box runs v2_box.sh, uploads its log and stops itself (instance-initiated shutdown terminates it); a watchdog stops it after WATCHDOG_MIN minutes whatever happens.
#   ./scripts/models/launch_v2.sh            # prints the instance id; price: g6e.xlarge about $1.861 an hour
#   SPOT=1 TYPE=g6e.xlarge ./scripts/models/launch_v2.sh    # a Spot box; BATCH=8 in v2_box.sh for a 24 GB GPU
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
# The inputs as presigned links (the lake refuses this account across accounts), 12 hours, kept in the rig's bucket.
T=$(mktemp -d)
node scripts/models/presign.mjs $T/links.json 12 >&2
aws s3 cp $T/links.json s3://nsr-embed-v2/v2/links-$RUN_ID.json "${A[@]}" --only-show-errors
rm -rf $T
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
RUN_ID=$RUN_ID BATCH=${BATCH:-16} PRICE=${PRICE:-1.861} TYPE=$TYPE N_NEW=${N_NEW:-} CKPT_FLAG=${CKPT_FLAG:-} /opt/v2_box.sh
aws s3 cp /var/log/v2.log s3://nsr-embed-v2/logs/nsr-v2-$RUN_ID.log
aws s3 cp /var/log/v2.log s3://nsr-embed-v2/models/nsr-encoder-v2/run-$RUN_ID/box.log
shutdown -h now
EOF
)
echo "run_id: $RUN_ID" >&2
# Capacity for g6e varies by zone: try each default subnet in turn.
for SUBNET in $(aws ec2 describe-subnets "${A[@]}" --filters Name=vpc-id,Values=$VPC Name=default-for-az,Values=true \
    --query 'Subnets[].SubnetId' --output text); do
ID=$(aws ec2 run-instances "${A[@]}" --image-id "$AMI" --instance-type $TYPE --count 1 --subnet-id $SUBNET \
  ${SPOT:+--instance-market-options '{"MarketType":"spot","SpotOptions":{"SpotInstanceType":"one-time","InstanceInterruptionBehavior":"terminate"}}'} \
  --iam-instance-profile Name=nsr-embed --security-group-ids "$SG" --instance-initiated-shutdown-behavior terminate \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":150,"VolumeType":"gp3","DeleteOnTermination":true}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=nsr-v2-$RUN_ID},{Key=project,Value=nsr}]" \
  --user-data "$UD" --query 'Instances[0].InstanceId' --output text 2>/tmp/launch_v2.err) && { echo "$ID"; exit 0; }
echo "$TYPE${SPOT:+ spot} refused in $SUBNET: $(tail -1 /tmp/launch_v2.err | cut -c1-160)" >&2
done
exit 1
