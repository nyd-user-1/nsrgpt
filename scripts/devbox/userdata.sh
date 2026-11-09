#!/usr/bin/env bash
# The nsrgpt dev box (2026-11-08): the UI dev server on EC2 in place of the codespace, whose free hours ran out.
# Ubuntu 24.04. Clones branch ui-layer with the read-only deploy key held in SSM (/nsrgpt/devbox/deploy-key), runs
# `next dev` on port 3000 as a service, pulls origin every 20 seconds so a push is live within half a minute, and stops
# itself 6 hours after every boot (the instance's shutdown behaviour is stop, so the disk and packages survive a restart).
# Log: /var/log/nsr-devbox.log. Launch: scripts/devbox/launch.sh.
set -euxo pipefail
exec > >(tee -a /var/log/nsr-devbox.log) 2>&1

cat > /etc/systemd/system/nsrgpt-stop.service <<'U'
[Unit]
Description=nsrgpt dev box stops itself 6 hours after boot
[Service]
Type=oneshot
ExecStart=/usr/sbin/shutdown -h +360
[Install]
WantedBy=multi-user.target
U
systemctl daemon-reload
systemctl enable --now nsrgpt-stop

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ca-certificates jq
snap install aws-cli --classic || true
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g pnpm@11.1.1

install -d -m 700 /root/.ssh
aws ssm get-parameter --region us-east-2 --name /nsrgpt/devbox/deploy-key --with-decryption --query Parameter.Value --output text > /root/.ssh/nsr-devbox
chmod 600 /root/.ssh/nsr-devbox
ssh-keyscan github.com >> /root/.ssh/known_hosts
export GIT_SSH_COMMAND="ssh -i /root/.ssh/nsr-devbox -o IdentitiesOnly=yes"
git clone -b ui-layer git@github.com:nyd-user-1/nsrgpt.git /srv/nsrgpt
cd /srv/nsrgpt
git config core.sshCommand "$GIT_SSH_COMMAND"
pnpm install --frozen-lockfile

cat > /etc/systemd/system/nsrgpt-dev.service <<'U'
[Unit]
Description=nsrgpt dev server (next dev, port 3000)
After=network-online.target
[Service]
WorkingDirectory=/srv/nsrgpt
Environment=NEXT_PUBLIC_DATA_BASE=https://dcl3kyt3ynmb2.cloudfront.net
Environment=NODE_OPTIONS=--max-old-space-size=4096
# The dev reader (brief 33, lib/dev-session.ts): chat answers and saves carry its name. Set here and nowhere else;
# it does nothing under next build.
Environment=NEXT_PUBLIC_DEV_SIGNED_IN=1
ExecStart=/usr/bin/pnpm exec next dev --turbopack -H 0.0.0.0 -p 3000
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
U

# Pull every 20 seconds; reinstall only when the lockfile moved.
cat > /usr/local/bin/nsrgpt-pull <<'P'
#!/usr/bin/env bash
cd /srv/nsrgpt
while true; do
  H=$(git rev-parse HEAD)
  if git pull -q --ff-only 2>/dev/null && [ "$H" != "$(git rev-parse HEAD)" ]; then
    git diff --name-only "$H" HEAD | grep -q '^pnpm-lock.yaml$' && pnpm install --frozen-lockfile
  fi
  sleep 20
done
P
chmod +x /usr/local/bin/nsrgpt-pull
cat > /etc/systemd/system/nsrgpt-pull.service <<'U'
[Unit]
Description=nsrgpt pulls origin/ui-layer every 20 seconds
After=network-online.target
[Service]
ExecStart=/usr/local/bin/nsrgpt-pull
Restart=always
[Install]
WantedBy=multi-user.target
U

systemctl daemon-reload
systemctl enable --now nsrgpt-dev nsrgpt-pull
echo "nsr-devbox ready"
