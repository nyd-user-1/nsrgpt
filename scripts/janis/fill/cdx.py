"""Brief 73: ask the Wayback Machine's index (CDX) which archived copies exist for a list of URL prefixes, with retries
(the CDX server answers an outage page under load). One line per capture: original, timestamp, length, status, mime.
Writes lake/_work/fill/a73/cdx/<name>.txt per query and prints a count per query.

  python cdx.py <queries.json key in S3>     # {"queries": [{"name", "url", "match": "prefix"|"domain"|"exact", "filter"?}]}
  python cdx.py --one <name> <url> [prefix|domain|exact]
"""
import json
import sys
import time
import urllib.parse
import urllib.request

import boto3

B = "nsr-lake-613473203863"
OUT = "lake/_work/fill/a73/cdx"
UA = "Mozilla/5.0 (X11; Linux x86_64) nsrgpt-archive-fetch"
s3 = boto3.client("s3", region_name="us-east-2")


def cdx(url, match="prefix", flt=None):
    q = {"url": url, "matchType": match, "fl": "original,timestamp,length,statuscode,mimetype", "collapse": "urlkey",
         "limit": "100000"}
    if flt:
        q["filter"] = flt
    u = "http://web.archive.org/cdx/search/cdx?" + urllib.parse.urlencode(q)
    for attempt in range(8):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=180) as r:
                body = r.read().decode("utf-8", "replace")
            if "<html" in body[:2000].lower() or "<img" in body[:2000].lower():
                raise IOError("outage page")
            return [ln for ln in body.splitlines() if ln.strip()]
        except Exception as e:  # noqa: BLE001
            print(f"  retry {attempt + 1} {url}: {str(e)[:80]}", flush=True)
            time.sleep(10 * (attempt + 1))
    return None


def main():
    if sys.argv[1] == "--one":
        qs = [{"name": sys.argv[2], "url": sys.argv[3], "match": sys.argv[4] if len(sys.argv) > 4 else "prefix"}]
    else:
        qs = json.loads(s3.get_object(Bucket=B, Key=sys.argv[1])["Body"].read())["queries"]
    for q in qs:
        rows = cdx(q["url"], q.get("match", "prefix"), q.get("filter"))
        if rows is None:
            print(f"{q['name']}: FAILED", flush=True)
            continue
        s3.put_object(Bucket=B, Key=f"{OUT}/{q['name']}.txt", Body="\n".join(rows).encode())
        print(f"{q['name']}: {len(rows)} captures", flush=True)
        time.sleep(2)


if __name__ == "__main__":
    main()
