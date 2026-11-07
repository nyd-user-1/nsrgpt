#!/usr/bin/env bash
# Renders every guide and recording, one at a time at concurrency 1 (the codespace's memory is shared with the dev
# server), with its poster, into capture/videos/ (2026-11-07). Ruth is the default, <name>.mp4; Matthew is
# <name>.matthew.mp4. A file already rendered is skipped, so a stopped run picks up where it left off.
#   ./render.sh                    everything
#   ./render.sh guide-search       one video's files
cd "$(dirname "$0")/.."
M=capture
mkdir -p $M/videos
GUIDES="find-your-way read-a-chart 3d-camera panel-2 search data-table notes"
RECORDINGS="decay levels reactions"
only="${1:-}"

r() { # composition, output, props
  [ -s "$2" ] && return 0
  echo "$(date +%T) $2"
  npx remotion render index.ts "$1" "$2" --props="$3" --public-dir=$M --codec=h264 --crf=24 --concurrency=1 --log=error || echo "FAILED $2"
}
s() { # composition, output, props
  [ -s "$2" ] && return 0
  npx remotion still index.ts "$1" "$2" --props="$3" --public-dir=$M --frame=20 --log=error || echo "FAILED $2"
}

for g in $GUIDES; do
  n=guide-$g
  [ -n "$only" ] && [ "$only" != "$n" ] && continue
  s Guide $M/videos/$n.jpg $M/guides/$g.json
  r Guide $M/videos/$n.mp4 $M/voice/props/$n.ruth.json
  r Guide $M/videos/$n.matthew.mp4 $M/voice/props/$n.matthew.json
done
for k in $RECORDINGS; do
  n=record-$k
  [ -n "$only" ] && [ "$only" != "$n" ] && continue
  s Recording $M/videos/$n.jpg $M/$k-edit.json
  r Recording $M/videos/$n.mp4 $M/voice/props/$n.ruth.json
  r Recording $M/videos/$n.matthew.mp4 $M/voice/props/$n.matthew.json
done
echo "$(date +%T) done"
