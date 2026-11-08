#!/bin/sh
# Real proxy traffic on this box (brief 14): iptables byte counters on every packet to or from a proxy address (both
# directions, headers, challenges and failed transfers included). Writes the running total to S3 every 30 s and stops
# the lane A jobs on this box (chain, then mirror.py with SIGTERM, which saves its queue) once the total passes CAP bytes.
# The counters start when the rules are added, so the total carries across job restarts on this box.
#   on the box:  setsid nohup /opt/box/meter.sh <cap-bytes> <name> > /opt/box/meter.log 2>&1 &
CAP=$1; NAME=$2
OUT=s3://nsr-lake-613473203863/raw/iaea/2026-11-07/_work/box/meter-$NAME.json
IPS=$(aws ssm get-parameter --name /nsrgpt/webshare/proxies --with-decryption --region us-east-2 \
  --query Parameter.Value --output text | cut -d: -f1 | sort -u)
iptables -N PROXYMETER 2>/dev/null
for ip in $IPS; do
  iptables -C INPUT -s "$ip" -j PROXYMETER 2>/dev/null || iptables -I INPUT -s "$ip" -j PROXYMETER
  iptables -C OUTPUT -d "$ip" -j PROXYMETER 2>/dev/null || iptables -I OUTPUT -d "$ip" -j PROXYMETER
done
total() { iptables -L "$1" -v -n -x | awk '$3 == "PROXYMETER" { s += $2 } END { print s + 0 }'; }
while true; do
  IN=$(total INPUT); OUTB=$(total OUTPUT); T=$((IN + OUTB))
  printf '{"box":"%s","in":%s,"out":%s,"total":%s,"cap":%s,"at":"%s"}' "$NAME" "$IN" "$OUTB" "$T" "$CAP" "$(date -u +%H:%M:%S)" \
    | aws s3 cp - "$OUT" --quiet
  if [ "$T" -gt "$CAP" ]; then
    pkill -f chain.sh; pkill -TERM -f '^/opt/pw/bin/python mirror.py'
    echo "cap reached: $T bytes"; exit 0
  fi
  sleep 30
done
