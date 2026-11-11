"""Brief 70: read IAEA download-endf folder listings (one request a second, a browser user agent) and write every file
link with its size to lake/_work/fill/listings.json, merged with what is there already.

  python listings.py <DIR> [<DIR>…]       # e.g. JENDL-4.0 TENDL-2019 (reads <DIR>/ and <DIR>/backup/)
  python listings.py --url <url> [<url>…]  # any Apache-style index page
"""
import json
import re
import sys
import time
import urllib.request

import boto3

BUCKET = "nsr-lake-613473203863"
KEY = "lake/_work/fill/listings.json"
BASE = "https://www-nds.iaea.org/public/download-endf/"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
s3 = boto3.client("s3", region_name="us-east-2")
ROW = re.compile(r'<a href="([^"?/][^"]*)">[^<]*</a>\s*</td>\s*<td[^>]*>\s*([\d-]+ [\d:]+)?\s*</td>\s*<td[^>]*>\s*([\d.]+[KMGT]?|-)\s*</td>', re.I)
LINK = re.compile(r'<a href="([^"?][^"]*)"', re.I)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, r.read().decode("latin-1")


def human(s):
    if not s or s == "-":
        return None
    m = {"K": 1024, "M": 1024 ** 2, "G": 1024 ** 3, "T": 1024 ** 4}
    return int(float(s[:-1]) * m[s[-1]]) if s[-1] in m else int(s)


def read(url):
    try:
        status, html = fetch(url)
    except Exception as e:  # noqa: BLE001
        return {"url": url, "error": str(e)[:200]}
    rows = [{"name": a, "date": d, "approx_bytes": human(z)} for a, d, z in ROW.findall(html)]
    if not rows:
        rows = [{"name": a} for a in LINK.findall(html) if not a.startswith(("/", "http", "mailto", "#"))]
    challenged = "challenge" in html.lower() and "cloudflare" in html.lower()
    return {"url": url, "status": status, "rows": rows, "challenged": challenged, "bytes": len(html)}


def main():
    args = sys.argv[1:]
    urls = args[1:] if args and args[0] == "--url" else [u for d in args for u in (f"{BASE}{d}/", f"{BASE}{d}/backup/")]
    try:
        have = json.loads(s3.get_object(Bucket=BUCKET, Key=KEY)["Body"].read())
    except Exception:  # noqa: BLE001
        have = {}
    for u in urls:
        r = read(u)
        have[u] = r
        n = len(r.get("rows", []))
        print(u, r.get("status"), r.get("error", ""), f"{n} rows", "CHALLENGED" if r.get("challenged") else "", flush=True)
        for row in r.get("rows", []):
            if not row["name"].endswith("/") and re.search(r"\.(zip|tgz|gz|tar|lst|dat|txt|endf|asc)$", row["name"], re.I):
                print("   ", row["name"], row.get("approx_bytes"))
        time.sleep(1)
    s3.put_object(Bucket=BUCKET, Key=KEY, Body=json.dumps(have).encode())


if __name__ == "__main__":
    main()
