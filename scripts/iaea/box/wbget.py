# Wayback downloader for the box (brief 11): streams each file of a pull list (iaea-pull select output: Wayback id_ URL,
# key, original URL, snapshot) straight into S3, from the box's own address (no proxy, no Lambda time limit).
# Two at a time; waits and retries on 429 and 5xx. Writes <out>/results.jsonl and status.json.
#   /opt/pw/bin/python wbget.py <list-key> <out-prefix> [workers]
import hashlib, json, sys, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor
import boto3
from boto3.s3.transfer import TransferConfig

B = "nsr-lake-613473203863"
s3 = boto3.client("s3", region_name="us-east-2")
items = json.loads(s3.get_object(Bucket=B, Key=sys.argv[1])["Body"].read())["files"]
OUT, W = sys.argv[2].rstrip("/"), int(sys.argv[3]) if len(sys.argv) > 3 else 2
UA = "Mozilla/5.0 (X11; Linux x86_64) nsrgpt-archive-fetch"
cfg = TransferConfig(multipart_chunksize=64 * 1024 * 1024, max_concurrency=4)
results, lock = [], threading.Lock()


class Hashing:
    def __init__(self, r):
        self.r, self.h, self.n = r, hashlib.sha256(), 0

    def read(self, amt=-1):
        b = self.r.read(amt)
        self.h.update(b); self.n += len(b)
        return b


def save():
    with lock:
        body = "\n".join(json.dumps(r) for r in results).encode()
        st = {"done": sum(1 for r in results if r["status"] == "done"), "skipped": sum(1 for r in results if r["status"] == "skipped"),
              "errors": sum(1 for r in results if r["status"] == "error"), "of": len(items),
              "bytes": sum(r.get("bytes") or 0 for r in results if r["status"] == "done"), "at": time.strftime("%H:%M:%S")}
    s3.put_object(Bucket=B, Key=f"{OUT}/results.jsonl", Body=body)
    s3.put_object(Bucket=B, Key=f"{OUT}/status.json", Body=json.dumps(st).encode())


def one(it):
    r = {"url": it["url"], "key": it["key"], "original": it.get("original"), "snapshot": it.get("snapshot"), "via": "wayback-box"}
    try:
        r["bytes"] = s3.head_object(Bucket=B, Key=it["key"])["ContentLength"]
        r["status"] = "skipped"
    except Exception:
        for attempt in range(6):
            try:
                resp = urllib.request.urlopen(urllib.request.Request(it["url"], headers={"User-Agent": UA}), timeout=300)
                size = int(resp.headers.get("Content-Length") or 0)
                h = Hashing(resp)
                s3.upload_fileobj(h, B, it["key"], Config=cfg, ExtraArgs={"StorageClass": "INTELLIGENT_TIERING",
                                  "Metadata": {"source-url": (it.get("original") or it["url"])[:1800], "wayback": it["url"][:1800]}})
                if size and h.n != size:
                    raise IOError(f"short read {h.n} of {size}")
                r.update(status="done", bytes=h.n, sha256=h.h.hexdigest())
                break
            except urllib.error.HTTPError as e:
                r.update(status="error", error=f"http {e.code}")
                if e.code == 404:
                    r["status"] = "dead"; break
                time.sleep(30 * (attempt + 1))
            except Exception as e:
                r.update(status="error", error=str(e)[:200]); time.sleep(30 * (attempt + 1))
    with lock:
        results.append(r)
    if len(results) % 10 == 0:
        save()


with ThreadPoolExecutor(W) as ex:
    list(ex.map(one, items))
save()
print(json.dumps(json.loads(s3.get_object(Bucket=B, Key=f"{OUT}/status.json")["Body"].read())))
