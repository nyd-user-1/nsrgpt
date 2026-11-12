"""Brief 73 (A1): Wayback pulls of many small files (IAEA's TENDL per-material zips) from one box's own address, held under
the Wayback Machine's per-address ceiling. Each worker keeps one keep-alive connection; a refused connection, a 429 or
a 5xx sends that worker to sleep (30 s, doubling to 5 minutes) and the file is tried again. The lake is the checkpoint:
a key already in S3 is skipped, so any box can be killed and rerun. A shard takes every n-th file of the lists.

  python wbfleet.py <list key>[,<list key>…] <shard i> <of n> <workers> [<name>]
Writes lake/_work/fill/a73/fleet/<name>-<i>.json every 30 s: done, skipped, dead (404 twice), refusals, files a second.
"""
import hashlib
import json
import sys
import threading
import time

import boto3
import urllib3
from boto3.s3.transfer import TransferConfig

B = "nsr-lake-613473203863"
UA = "Mozilla/5.0 (X11; Linux x86_64) nsrgpt-archive-fetch"
s3 = boto3.client("s3", region_name="us-east-2")
cfg = TransferConfig(multipart_threshold=256 * 1024 * 1024)
lists, I, N, W = sys.argv[1].split(","), int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
NAME = sys.argv[5] if len(sys.argv) > 5 else "tendl"
items = [it for k in lists for it in json.loads(s3.get_object(Bucket=B, Key=k)["Body"].read())["files"]]
items = items[I::N]
st = {"of": len(items), "done": 0, "skipped": 0, "dead": 0, "refusals": 0, "bytes": 0, "t0": time.time(), "workers": W}
lock = threading.Lock()
nxt = iter(items)
dead = []


class Hashing:
    def __init__(self, r):
        self.r, self.h, self.n = r, hashlib.sha256(), 0

    def read(self, amt=-1):
        b = self.r.read(amt if amt and amt > 0 else 1 << 20)
        self.h.update(b)
        self.n += len(b)
        return b


def held(key):
    try:
        return s3.head_object(Bucket=B, Key=key)["ContentLength"] > 0
    except Exception:  # noqa: BLE001
        return False


def worker():
    pool = urllib3.PoolManager(maxsize=1, retries=False, timeout=urllib3.Timeout(connect=20, read=180), headers={"User-Agent": UA})
    nap = 30
    while True:
        with lock:
            it = next(nxt, None)
        if it is None:
            return
        if held(it["key"]):
            with lock:
                st["skipped"] += 1
            continue
        misses = 0
        while True:
            try:
                r = pool.request("GET", it["url"], preload_content=False, redirect=True)
                if r.status == 200:
                    h = Hashing(r)
                    s3.upload_fileobj(h, B, it["key"], Config=cfg, ExtraArgs={"StorageClass": "INTELLIGENT_TIERING",
                                      "Metadata": {"source-url": it["original"][:1800], "wayback": it["url"][:1800], "sha256": ""}})
                    r.release_conn()
                    clen = int(r.headers.get("Content-Length") or 0)
                    if clen and h.n != clen:
                        raise IOError(f"short read {h.n} of {clen}")
                    with lock:
                        st["done"] += 1
                        st["bytes"] += h.n
                    nap = 30
                    break
                r.release_conn()
                if r.status == 404:
                    misses += 1
                    if misses >= 2:
                        with lock:
                            st["dead"] += 1
                            dead.append(it["key"])
                        break
                    time.sleep(10)
                    continue
                raise IOError(f"http {r.status}")
            except Exception:  # noqa: BLE001  refused, reset, 429, 5xx: wait under the ceiling, then the same file again
                with lock:
                    st["refusals"] += 1
                time.sleep(nap)
                nap = min(nap * 2, 300)
                pool = urllib3.PoolManager(maxsize=1, retries=False, timeout=urllib3.Timeout(connect=20, read=180), headers={"User-Agent": UA})


def report():
    with lock:
        d = dict(st, dead_keys=dead[-200:], rate=round(st["done"] / max(1, time.time() - st["t0"]), 3),
                 at=time.strftime("%H:%M:%S", time.gmtime()))
    s3.put_object(Bucket=B, Key=f"lake/_work/fill/a73/fleet/{NAME}-{I}.json", Body=json.dumps(d).encode())


threads = [threading.Thread(target=worker, daemon=True) for _ in range(W)]
for t in threads:
    t.start()
while any(t.is_alive() for t in threads):
    time.sleep(30)
    report()
report()
