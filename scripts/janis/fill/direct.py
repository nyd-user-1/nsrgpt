"""Brief 70: fetch public files that answer a plain client (GEF's GEFY files, IAEA's AMDC Nubase texts) straight into the
lake from the fill box, one request at a time with a browser user agent, each streamed to S3 with its SHA-256.
Appends one result per file to lake/_raw/_work/direct-results.jsonl.

  python direct.py <items.json key in S3>      # {"items": [{"url", "key", "library"}]}
"""
import hashlib
import json
import sys
import time
import urllib.request

import boto3

BUCKET = "nsr-lake-613473203863"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
s3 = boto3.client("s3", region_name="us-east-2")
OUT = "lake/_raw/_work/direct-results.jsonl"


class Hashing:
    def __init__(self, r):
        self.r, self.h, self.n = r, hashlib.sha256(), 0

    def read(self, amt=-1):
        b = self.r.read(amt)
        self.h.update(b)
        self.n += len(b)
        return b


def main():
    items = json.loads(s3.get_object(Bucket=BUCKET, Key=sys.argv[1])["Body"].read())["items"]
    try:
        done = s3.get_object(Bucket=BUCKET, Key=OUT)["Body"].read().decode().splitlines()
    except Exception:  # noqa: BLE001
        done = []
    for it in items:
        t0 = time.time()
        r = {"url": it["url"], "key": it["key"], "library": it.get("library"), "at": time.strftime("%FT%TZ", time.gmtime())}
        try:
            req = urllib.request.Request(it["url"], headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as resp:
                ct = resp.headers.get("Content-Type", "application/octet-stream")
                if "html" in ct and not it["url"].endswith((".html", ".htm")):
                    raise IOError(f"an HTML page where a file was expected ({ct})")
                h = Hashing(resp)
                s3.upload_fileobj(h, BUCKET, it["key"], ExtraArgs={"ContentType": ct, "Metadata": {"source-url": it["url"][:1800]}})
            r.update(status="done", bytes=h.n, sha256=h.h.hexdigest(), seconds=round(time.time() - t0, 1))
        except Exception as e:  # noqa: BLE001
            r.update(status="error", error=str(e)[:200])
        print(json.dumps(r), flush=True)
        done.append(json.dumps(r))
        s3.put_object(Bucket=BUCKET, Key=OUT, Body="\n".join(done).encode())
        time.sleep(1)


if __name__ == "__main__":
    main()
