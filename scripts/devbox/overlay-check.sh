#!/bin/bash
# Type check and lint files not yet pushed, on the dev box: lay a tarball of them (from the lake) over /srv/nsrgpt, run
# check-files.sh on the given paths, then put the tree back as it was (tracked files checked out, new files removed), so
# the box's pull keeps working. Run through SSM:
#   ./scripts/iaea/box/ssm.sh i-0ec4775a5cd68d41b 'bash /srv/nsrgpt/scripts/devbox/overlay-check.sh <tgz key> <paths...>'
export PATH=$PATH:/snap/bin
KEY=$1; shift
cd /srv/nsrgpt || exit 1
T=$(mktemp -d)
aws s3 cp "s3://nsr-lake-613473203863/$KEY" $T/o.tgz --only-show-errors --region us-east-2 || exit 1
NEW=$(tar tzf $T/o.tgz | while read -r f; do [ -f "$f" ] || [ -z "$(git ls-files -- "$f")" ] && echo "$f"; done)
tar xzf $T/o.tgz
bash scripts/devbox/check-files.sh "$@"
git checkout -- $(tar tzf $T/o.tgz | while read -r f; do [ -n "$(git ls-files -- "$f")" ] && echo "$f"; done) 2>/dev/null
for f in $NEW; do [ -z "$(git ls-files -- "$f")" ] && rm -f "$f"; done
rm -rf $T
