#!/usr/bin/env bash
# Publishes public/viz-data/ (the snapshot scripts' output) to the lake as one version folder, which CloudFront
# serves to the site (lib/data-url.ts, 2026-11-08). Files are immutable inside a version, so a change is a new
# version: publish, then set VIZ_DATA_VERSION in lib/data-url.ts to it.
#   scripts/viz-data-publish.sh v20261108
set -euo pipefail

version="${1:?usage: scripts/viz-data-publish.sh <version>, e.g. v20261108}"
dest="s3://nsr-lake-613473203863/site/viz-data/${version}"
aws=(--profile nysgpt-new --region us-east-2)

cd "$(dirname "$0")/.."
[ -d public/viz-data ] || { echo "public/viz-data/ not found: run the snapshot scripts first" >&2; exit 1; }

aws s3 sync public/viz-data "$dest" --cache-control "public, max-age=31536000, immutable" \
  --content-type application/json --only-show-errors "${aws[@]}"
aws s3 ls "$dest/" --recursive --summarize "${aws[@]}" | tail -2
