#!/usr/bin/env bash
# The proxy army, ported from pax2 (scripts/catalog-media/fleet.sh, docs/FETCH-WORKER.md): Webshare static
# residential IPs, bought 2026-10-19 at $6 a month for 20. Their credentials are the SSM SecureString
# /nsrgpt/webshare/proxies (New account, nysgpt-new, us-east-2), copied from the Old account's
# /pax2/webshare/proxies v3: one ip:port:user:pass:country per line, US lines first, walled lines pruned
# (14 of 20 left). Read the parameter; never store the lines anywhere else.
#
#   source scripts/proxy/proxies.sh
#   proxy_count                 # how many lines
#   proxy_url 3                 # http://user:pass@ip:port for line 3 (0-based), as fleet.sh picks lines
#   ./scripts/proxy/proxies.sh probe [url]   # every line against url: status, seconds, exit IP
#
# PROXY_LINES="0 1 2 4" picks the lines a caller deals work across (fleet.sh's convention); skip lines that
# probe walled. Walls come and go per line within hours.
PROXY_PARAM=${PROXY_PARAM:-/nsrgpt/webshare/proxies}
PROXY_PROFILE=${PROXY_PROFILE:-nysgpt-new}
PROXY_REGION=${PROXY_REGION:-us-east-2}

proxy_lines() {
  aws ssm get-parameter --with-decryption --name "$PROXY_PARAM" --query Parameter.Value --output text \
    --profile "$PROXY_PROFILE" --region "$PROXY_REGION"
}
proxy_count() { proxy_lines | grep -c .; }
proxy_url() {
  proxy_lines | sed -n "$(($1+1))p" | awk -F: '{printf "http://%s:%s@%s:%s\n", $3, $4, $1, $2}'
}

if [ "${BASH_SOURCE[0]}" = "$0" ] && [ "${1:-}" = probe ]; then
  URL=${2:-https://www.nndc.bnl.gov/}
  ALL=$(proxy_lines); N=$(printf '%s\n' "$ALL" | grep -c .)
  for i in $(seq 0 $((N-1))); do
    L=$(printf '%s\n' "$ALL" | sed -n "$((i+1))p")
    P=$(printf '%s' "$L" | awk -F: '{printf "http://%s:%s@%s:%s", $3, $4, $1, $2}')
    C=$(printf '%s' "$L" | awk -F: '{print $5}')
    R=$(curl -s -o /dev/null -x "$P" -m 25 -w "%{http_code} %{time_total}" "$URL" 2>/dev/null || echo "000 -")
    IP=$(curl -s -x "$P" -m 15 https://api.ipify.org 2>/dev/null || echo -)
    echo "line $i $C $R exit=$IP"
  done
fi
