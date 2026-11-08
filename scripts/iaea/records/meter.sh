#!/bin/sh
# Proxy meter for the records pass (brief 20), copied from scripts/iaea/box/meter.sh: iptables byte counters on every
# packet to or from a Webshare proxy address (both directions, headers, challenges and failed transfers included).
# Writes the running total to /opt/box/meter.json (proxy.py reads it before each file) and to
# raw/iaea-records/2026-11-08/_work/meter.json every 30 s, and stops index.py and proxy.py once the total passes CAP.
#   on the box:  setsid nohup sh /opt/rec/meter.sh 5000000000 > /opt/box/meter.log 2>&1 &
CAP=$1
OUT=s3://nsr-lake-613473203863/raw/iaea-records/2026-11-08/_work/meter.json
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
  J=$(printf '{"in":%s,"out":%s,"total":%s,"cap":%s,"at":"%s"}' "$IN" "$OUTB" "$T" "$CAP" "$(date -u +%H:%M:%S)")
  printf '%s' "$J" > /opt/box/meter.json.tmp && mv /opt/box/meter.json.tmp /opt/box/meter.json
  printf '%s' "$J" | aws s3 cp - "$OUT" --quiet
  if [ "$T" -gt "$CAP" ]; then
    pkill -TERM -f '/opt/rec/(index|proxy)\.py'
    echo "cap reached: $T bytes"
  fi
  sleep 30
done
