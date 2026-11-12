"""Brief 73: every file of NEA's public GitLab project janis/data ("The data sets for JANIS offline installation", the
library files JANIS itself draws) into the lake, once, for both Elpis lanes:
  s3://nsr-lake-613473203863/lake/_raw/janis-data/<NAME>/<VERSION>/<file>
Packages and files from the GitLab API (no token); each file streamed straight to S3 with its SHA-256, a file already
held at the same size skipped. Several streams at once (one stream gets about 33 MB/s from a box). Writes
lake/_raw/janis-data/manifest.json (package, version, file, bytes, sha256, GitLab's own sha256, URL) when done.

  python janisdata.py [--streams=8] [--only=TENDL,GEFY]
"""
import hashlib
import json
import sys
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import boto3
from boto3.s3.transfer import TransferConfig

B = "nsr-lake-613473203863"
PRE = "lake/_raw/janis-data"
API = "https://git.oecd-nea.org/api/v4/projects/janis%2Fdata"
UA = "Mozilla/5.0 (X11; Linux x86_64) nsrgpt-archive-fetch"
s3 = boto3.client("s3", region_name="us-east-2")
cfg = TransferConfig(multipart_chunksize=64 * 1024 * 1024, max_concurrency=4)
STREAMS = int(next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--streams=")), "8"))
ONLY = next((a.split("=", 1)[1].split(",") for a in sys.argv if a.startswith("--only=")), None)
lock = threading.Lock()
rows = []


def api(path):
    out, page = [], 1
    while True:
        for attempt in range(8):  # the host refuses a connection now and then (Cloudflare in front of it)
            try:
                with urllib.request.urlopen(urllib.request.Request(f"{API}{path}{'&' if '?' in path else '?'}per_page=100&page={page}",
                                                                   headers={"User-Agent": UA}), timeout=60) as r:
                    got = json.loads(r.read())
                break
            except Exception:  # noqa: BLE001
                if attempt == 7:
                    raise
                time.sleep(5 * (attempt + 1))
        out += got
        if len(got) < 100:
            return out
        page += 1


class Hashing:
    def __init__(self, r):
        self.r, self.h, self.n = r, hashlib.sha256(), 0

    def read(self, amt=-1):
        b = self.r.read(amt)
        self.h.update(b)
        self.n += len(b)
        return b


def one(job):
    pkg, f = job
    name, ver, fn = pkg["name"], pkg["version"], f["file_name"]
    key = f"{PRE}/{name}/{ver}/{fn}"
    url = f"{API}/packages/generic/{urllib.parse.quote(name)}/{urllib.parse.quote(ver)}/{urllib.parse.quote(fn)}"
    r = {"package": name, "version": ver, "file": fn, "key": key, "url": url, "gitlab_size": f.get("size"),
         "gitlab_sha256": f.get("file_sha256")}
    try:
        held = s3.head_object(Bucket=B, Key=key)
        if held["ContentLength"] == f.get("size"):
            r.update(status="skipped", bytes=held["ContentLength"], sha256=held.get("Metadata", {}).get("sha256"))
            with lock:
                rows.append(r)
            return
    except Exception:  # noqa: BLE001
        pass
    for attempt in range(5):
        try:
            t0 = time.time()
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=300) as resp:
                h = Hashing(resp)
                s3.upload_fileobj(h, B, key, Config=cfg, ExtraArgs={"Metadata": {"source-url": url[:1800]}})
            if f.get("size") and h.n != f["size"]:
                raise IOError(f"short read {h.n} of {f['size']}")
            sha = h.h.hexdigest()
            if f.get("file_sha256") and sha != f["file_sha256"]:
                raise IOError(f"sha256 {sha} differs from GitLab's {f['file_sha256']}")
            r.update(status="done", bytes=h.n, sha256=sha, seconds=round(time.time() - t0, 1))
            break
        except Exception as e:  # noqa: BLE001
            r.update(status="error", error=str(e)[:200])
            time.sleep(15 * (attempt + 1))
    with lock:
        rows.append(r)
        print(json.dumps({k: r.get(k) for k in ("key", "status", "bytes", "seconds", "error")}), flush=True)


def main():
    pkgs = [p for p in api("/packages") if not ONLY or p["name"] in ONLY]
    jobs = []
    for p in pkgs:
        for f in api(f"/packages/{p['id']}/package_files"):
            jobs.append((p, f))
    jobs.sort(key=lambda j: -(j[1].get("size") or 0))  # the big ones first, so the tail is short
    print(len(pkgs), "packages", len(jobs), "files", round(sum(j[1].get("size") or 0 for j in jobs) / 1e9, 1), "GB", flush=True)
    with ThreadPoolExecutor(STREAMS) as ex:
        list(ex.map(one, jobs))
    man = {"source": "NEA GitLab janis/data, https://git.oecd-nea.org/janis/data (packages API, no token)",
           "fetched": time.strftime("%FT%TZ", time.gmtime()), "packages": len(pkgs), "files": len(rows),
           "bytes": sum(r.get("bytes") or 0 for r in rows), "errors": sum(r["status"] == "error" for r in rows),
           "rows": sorted(rows, key=lambda r: r["key"])}
    if not ONLY:
        s3.put_object(Bucket=B, Key=f"{PRE}/manifest.json", Body=json.dumps(man, indent=1).encode())
    print(json.dumps({k: man[k] for k in ("packages", "files", "bytes", "errors")}), flush=True)


if __name__ == "__main__":
    main()
