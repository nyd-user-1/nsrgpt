#!/bin/bash
# Brief 77 step 1: NEA's JANIS program, manual, books and checker into lake/_raw/janis-software/ (run on a box).
# The program and its files are kept in the lake and run as tools; none of it is committed to this repository.
#   bash fetch.sh            # every file below; files already in the lake at the same size are skipped
set -uo pipefail
export PATH=$PATH:/snap/bin
L=s3://nsr-lake-613473203863/lake/_raw/janis-software
D=/data/janis-software
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
mkdir -p $D && cd $D
N=https://www.oecd-nea.org
FILES=(
  janis/janis-4.0/software/janis-4.0.zip
  janis/janis-4.0/documentation/janis-4.0_manual_rev1.pdf
  janis/janis-4.0/software/groups.zip
  janis/book/books-2020-09-JNS.7z
  janis/book/book-neutron-2020-09.pdf
  janis/book/book-photon-2020-09.pdf
  janis/book/book-proton-2020-09.pdf
  janis/book/book-deuteron-2020-09.pdf
  janis/book/book-triton-2020-09.pdf
  janis/book/book-helion-2020-09.pdf
  janis/book/book-alpha-2020-09.pdf
  janis/trans-checker/download/janis-trans-checker.zip
  janis/webstart/janis.jnlp
  jcms/pl_39963/janis-downloads
  jcms/pl_44624/janis-books
  jcms/pl_40305/janis-trans-checker
  jcms/pl_39929/janis-changes
)
# JANIS 4.1 (Java Web Start, the build janis/data's README names): every jar the JNLP lists
JARS=$(curl -s -A "$UA" $N/janis/webstart/janis.jnlp | grep -oE 'jar href="[^"]+"' | sed -E 's/jar href="([^"]+)"/\1/')
for j in $JARS; do FILES+=(janis/webstart/$j); done
FILES+=(janis/webstart/images/splash4.1.jpg)
# janis/data's own README and loader, the record that names the JANIS build
G=https://git.oecd-nea.org/api/v4/projects/2902/repository/files
echo '[' > manifest.json; first=1
for f in "${FILES[@]}"; do
  out=$f; case $f in jcms/*) out=$f.html;; esac
  mkdir -p "$(dirname "$out")"
  code=$(curl -s -L -A "$UA" -o "$out" -w '%{http_code}' "$N/$f")
  bytes=$(stat -c %s "$out" 2>/dev/null || echo 0)
  sha=$(sha256sum "$out" | cut -d' ' -f1)
  echo "$(date -u +%FT%TZ) $code $bytes $f"
  [ $first = 1 ] || echo ',' >> manifest.json; first=0
  printf '{"url":"%s","file":"%s","http":%s,"bytes":%s,"sha256":"%s"}\n' "$N/$f" "$out" "$code" "$bytes" "$sha" >> manifest.json
done
for f in README_janis.md README.md get_data.py; do
  mkdir -p gitlab-janis-data
  curl -s "$G/$f/raw?ref=main" -o gitlab-janis-data/$f
  echo ',' >> manifest.json
  printf '{"url":"%s","file":"%s","http":200,"bytes":%s,"sha256":"%s"}\n' "$G/$f/raw?ref=main" "gitlab-janis-data/$f" "$(stat -c %s gitlab-janis-data/$f)" "$(sha256sum gitlab-janis-data/$f | cut -d' ' -f1)" >> manifest.json
done
echo ']' >> manifest.json
aws s3 sync $D $L --only-show-errors --exclude 'unpacked/*'
echo "files $(jq length manifest.json) bad $(jq '[.[]|select(.http!=200 or .bytes==0)]|length' manifest.json)"
