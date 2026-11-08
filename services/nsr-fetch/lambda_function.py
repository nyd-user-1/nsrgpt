# nsr-fetch: copy public files from the web straight into the NSR lake, so bulk pulls (NNDC, GitHub archives)
# never pass through the Mac's ~2.3 MB/s upload. Lambda in us-east-2 next to s3://nsr-lake-613473203863;
# inbound transfer is free and the compute sits in the free tier.
#
# Event: {"items": [{"url": "...", "key": "raw/nndc/...", "proxy": 3}], "bucket": "..."}
#   proxy (optional): a line of SSM /nsrgpt/webshare/proxies (scripts/proxy/proxies.sh) to fetch through.
# Parts mode, for files too big for one 15-minute run: {"parts": {"url", "key", "upload_id", "ranges": [[n, a, b], …]}}
#   uploads those parts of a multipart upload the caller created, and returns [{PartNumber, ETag}]; the caller
#   completes it (scripts/nndc/pull.py).
# Each item: skipped when the key already holds the same byte count; files over 100 MB on servers that
# take Range requests go up as a parallel multipart upload. Returns one result per item:
#   {url, key, status: done|skipped|error, bytes, sha256, error}
import hashlib, os, threading, urllib.request
from concurrent.futures import ThreadPoolExecutor
import boto3

s3 = boto3.client("s3")
BUCKET = os.environ.get("BUCKET", "nsr-lake-613473203863")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
PART = 64 * 1024 * 1024
BIG = 100 * 1024 * 1024
CLASS = os.environ.get("STORAGE_CLASS", "INTELLIGENT_TIERING")
_proxies = None


def opener(line):
    global _proxies
    if line is None:
        return urllib.request.build_opener()
    if _proxies is None:
        v = boto3.client("ssm").get_parameter(Name="/nsrgpt/webshare/proxies", WithDecryption=True)["Parameter"]["Value"]
        _proxies = [l for l in v.splitlines() if l.strip()]
    ip, port, user, pw, _ = _proxies[int(line)].split(":")
    p = f"http://{user}:{pw}@{ip}:{port}"
    return urllib.request.build_opener(urllib.request.ProxyHandler({"http": p, "https": p}))


def head_size(key, bucket):
    try:
        return s3.head_object(Bucket=bucket, Key=key)["ContentLength"]
    except Exception:
        return None


class Hashing:
    def __init__(self, r):
        self.r, self.h, self.n = r, hashlib.sha256(), 0

    def read(self, amt=-1):
        b = self.r.read(amt)
        self.h.update(b)
        self.n += len(b)
        return b


def fetch(item, bucket):
    url, key = item["url"], item["key"]
    op = opener(item.get("proxy"))
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    r = op.open(req, timeout=120)
    size = int(r.headers.get("Content-Length") or 0) or None
    have = head_size(key, bucket)
    if size and have == size:
        r.close()
        return {"url": url, "key": key, "status": "skipped", "bytes": size}
    meta = {"source-url": url[:1800]}
    ctype = r.headers.get("Content-Type", "application/octet-stream")
    if size and size > BIG and (r.headers.get("Accept-Ranges") or "").lower() == "bytes":
        r.close()
        return multipart(op, url, key, size, bucket, meta, ctype)
    h = Hashing(r)
    s3.upload_fileobj(h, bucket, key, ExtraArgs={"Metadata": meta, "ContentType": ctype, "StorageClass": CLASS})
    r.close()
    if size and h.n != size:
        raise IOError(f"short read {h.n} of {size}")
    return {"url": url, "key": key, "status": "done", "bytes": h.n, "sha256": h.h.hexdigest()}


def multipart(op, url, key, size, bucket, meta, ctype):
    up = s3.create_multipart_upload(Bucket=bucket, Key=key, Metadata=meta, ContentType=ctype, StorageClass=CLASS)["UploadId"]
    ranges = [(i + 1, o, min(o + PART, size) - 1) for i, o in enumerate(range(0, size, PART))]
    try:
        parts = upload_parts(op, url, key, up, ranges, bucket)
        s3.complete_multipart_upload(Bucket=bucket, Key=key, UploadId=up,
                                     MultipartUpload={"Parts": sorted(parts, key=lambda p: p["PartNumber"])})
    except Exception:
        s3.abort_multipart_upload(Bucket=bucket, Key=key, UploadId=up)
        raise
    return {"url": url, "key": key, "status": "done", "bytes": size, "sha256": None, "multipart": len(ranges)}


def upload_parts(op, url, key, up, ranges, bucket):
    lock, parts = threading.Lock(), []

    def one(rg):
        n, a, b = rg
        for attempt in range(4):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA, "Range": f"bytes={a}-{b}"})
                data = op.open(req, timeout=300).read()
                if len(data) != b - a + 1:
                    raise IOError(f"part {n}: {len(data)} of {b - a + 1}")
                e = s3.upload_part(Bucket=bucket, Key=key, UploadId=up, PartNumber=n, Body=data)["ETag"]
                with lock:
                    parts.append({"PartNumber": n, "ETag": e})
                return
            except Exception:
                if attempt == 3:
                    raise

    with ThreadPoolExecutor(8) as ex:
        list(ex.map(one, ranges))
    return parts


def lambda_handler(event, context):
    bucket = event.get("bucket", BUCKET)
    if "parts" in event:
        p = event["parts"]
        return upload_parts(opener(p.get("proxy")), p["url"], p["key"], p["upload_id"], [tuple(r) for r in p["ranges"]], bucket)
    out = []
    for item in event["items"]:
        try:
            out.append(fetch(item, bucket))
        except Exception as e:
            out.append({"url": item["url"], "key": item["key"], "status": "error", "error": str(e)[:300]})
    return out
