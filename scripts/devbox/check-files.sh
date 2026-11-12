#!/bin/bash
# Type check the whole project and lint the files given, on the dev box (/srv/nsrgpt pulls main every 20 s), without
# writing anything: tsc --noEmit, then eslint on the paths. Run through SSM:
#   ./scripts/iaea/box/ssm.sh i-0ec4775a5cd68d41b 'bash /srv/nsrgpt/scripts/devbox/check-files.sh lib/elpis.ts'
cd /srv/nsrgpt || exit 1
git log -1 --format='%h %s' | cut -c1-100
echo "== tsc"
timeout 900 npx tsc --noEmit -p . 2>&1 | tail -30
echo "tsc exit ${PIPESTATUS[0]}"
if [ "$#" -gt 0 ]; then
  echo "== eslint $*"
  timeout 300 npx eslint "$@" 2>&1 | tail -30
  echo "eslint exit ${PIPESTATUS[0]}"
fi
