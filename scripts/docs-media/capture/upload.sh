#!/usr/bin/env bash
# Uploads the docs media and checks each file on the CDN (2026-11-07). Run on the Mac from capture/, after the
# codespace's shots/ and videos/ are copied here: `./upload.sh shots`, `./upload.sh videos`, or both with no argument.
# The one place the media's home is named: when it moves to s3://nsr-lake-613473203863/files/docs/ (same account and
# region), change DEST and CDN here and lib/docs/media.ts.
set -euo pipefail
DEST=s3://pax-trinity-clips-613473203863/nsrgpt/docs
CDN=https://d19bx9wfmnrb34.cloudfront.net/nsrgpt/docs
PROFILE=nysgpt-new
cd "$(dirname "$0")"
WHAT=("${@:-shots videos}")
WHAT=(${WHAT[*]})

files=()
for d in "${WHAT[@]}"; do
  aws s3 sync "$d/" "$DEST/$d/" --exclude '*' --include '*.jpg' --content-type image/jpeg --profile "$PROFILE" --only-show-errors
  [ "$d" = videos ] && aws s3 sync videos/ "$DEST/videos/" --exclude '*' --include '*.mp4' --content-type video/mp4 --profile "$PROFILE" --only-show-errors
  for f in "$d"/*.jpg "$d"/*.mp4; do [ -e "$f" ] && files+=("$f"); done
done

# Every file answers 200 with its type, or it's listed.
bad=0
for f in "${files[@]}"; do
  h=$(curl -sI "$CDN/$f")
  code=$(printf '%s' "$h" | head -1 | awk '{print $2}')
  type=$(printf '%s' "$h" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2}')
  case "$f" in *.jpg) want=image/jpeg ;; *.mp4) want=video/mp4 ;; esac
  if [ "$code" != 200 ] || [ "$type" != "$want" ]; then echo "BAD $f $code $type"; bad=$((bad + 1)); fi
done
echo "checked ${#files[@]} files; $bad bad"
