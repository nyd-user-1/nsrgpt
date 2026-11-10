#!/bin/bash
# Brief 61, Part D (only if v2 wins): launch the box that turns nsr-encoder v2 into the search Lambda's files
# (work/search/v2/: int8 ONNX encoder, tokenizer, vectors, vec_index) and uploads it to Hugging Face, private, under
# NYSgpt. Copied from launch_v2.sh: Old account us-east-1, role nsr-embed, 44b's PyTorch DLAMI; a CPU box (the export
# needs memory, not a GPU). The lake takes the files by presigned PUT links (presign_serve.mjs).
#   RUN_ID=20261110-1052 ./scripts/models/launch_serve.sh     # m7i.2xlarge, about $0.40 an hour
set -euo pipefail
cd "$(dirname "$0")/../.."
A=(--profile default --region us-east-1)
TYPE=${TYPE:-m7i.2xlarge}
AMI=${AMI:-ami-012ba162b9cd2729c}
WATCHDOG_MIN=${WATCHDOG_MIN:-240}
RUN_ID=${RUN_ID:?set RUN_ID to the training run, e.g. 20261110-1052}
aws s3 cp scripts/models/v2_serve.sh s3://nsr-embed-v2/v2/v2_serve.sh "${A[@]}" --only-show-errors
T=$(mktemp -d)
node scripts/models/presign_serve.mjs $T/links.json 6 >&2
aws s3 cp $T/links.json s3://nsr-embed-v2/v2/serve-links-$RUN_ID.json "${A[@]}" --only-show-errors
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
aws s3 cp s3://nsr-embed-v2/v2/v2_serve.sh /opt/v2_serve.sh
chmod +x /opt/v2_serve.sh
RUN_ID=$RUN_ID BATCH=${BATCH:-16} PRICE=${PRICE:-1.861} TYPE=$TYPE N_NEW=${N_NEW:-} CKPT_FLAG=${CKPT_FLAG:-} /opt/v2_serve.sh
aws s3 cp /var/log/v2.log s3://nsr-embed-v2/logs/nsr-v2-serve-$RUN_ID.log
aws s3 cp /var/log/v2.log s3://nsr-embed-v2/models/nsr-encoder-v2/run-$RUN_ID/serve.log
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
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=nsr-v2-serve-$RUN_ID},{Key=project,Value=nsr}]" \
  --user-data "$UD" --query 'Instances[0].InstanceId' --output text 2>/tmp/launch_v2.err) && { echo "$ID"; exit 0; }
echo "$TYPE${SPOT:+ spot} refused in $SUBNET: $(tail -1 /tmp/launch_v2.err | cut -c1-160)" >&2
done
exit 1
