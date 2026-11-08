# Wayback downloader for the box (brief 11): streams each file of a pull list (iaea-pull select output: Wayback id_ URL,
# key, original URL, snapshot) straight into S3, from the box's own address (no proxy, no Lambda time limit).
# Two at a time; waits and retries on 429 and 5xx. Writes <out>/results.jsonl and status.json.
#   /opt/pw/bin/python wbget.py <list-key> <out-prefix> [workers]
#
# Ranges mode (brief 14): one address gets about 0.27 MB/s a connection from the Wayback Machine and 429 above 3, so big
# files are fetched as byte ranges, each worker on its own proxy line (its own exit address), and written as the parts of
# one S3 multipart upload. Files under 300 MB go in one GET. "direct" in --lines is a worker on the box's own address.
#   /opt/pw/bin/python wbget.py <list-key> <out-prefix> --ranges 256M --lines direct,direct,0,1,2,3
import collections, hashlib, json, os, queue, sys, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor
import boto3
from boto3.s3.transfer import TransferConfig

B = "nsr-lake-613473203863"
s3 = boto3.client("s3", region_name="us-east-2")
items = json.loads(s3.get_object(Bucket=B, Key=sys.argv[1])["Body"].read())["files"]
FLAGS = dict(zip(sys.argv[3::2], sys.argv[4::2])) if len(sys.argv) > 3 and sys.argv[3].startswith("--") else {}
OUT, W = sys.argv[2].rstrip("/"), int(sys.argv[3]) if len(sys.argv) > 3 and not FLAGS else 2
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


def save(extra=None):
    with lock:
        body = "\n".join(json.dumps(r) for r in results).encode()
        st = {"done": sum(1 for r in results if r["status"] == "done"), "skipped": sum(1 for r in results if r["status"] == "skipped"),
              "errors": sum(1 for r in results if r["status"] == "error"), "of": len(items),
              "bytes": sum(r.get("bytes") or 0 for r in results if r["status"] == "done"), "at": time.strftime("%H:%M:%S")}
        st.update(extra() if extra else {})
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


# ---------------------------------------------------------------- ranges mode (brief 14)
SMALL = 300 * 1024 * 1024
TMP = "/var/tmp/wb"
MIN_RATE = 100_000  # bytes a second; a line under this after a minute gives its range back
BENCH = 300  # seconds a slow line sits out


def size_arg(s):
    s = s.upper().rstrip("B")
    return int(float(s[:-1]) * {"K": 1 << 10, "M": 1 << 20, "G": 1 << 30}[s[-1]]) if s[-1] in "KMG" else int(s)


def openers(spec):
    # one urllib opener per worker: "direct" is the box's own address, a number is that line of the proxy list
    lines = [l.split(":") for l in boto3.client("ssm", region_name="us-east-2").get_parameter(
        Name="/nsrgpt/webshare/proxies", WithDecryption=True)["Parameter"]["Value"].splitlines() if l.strip()]
    out = []
    for s in spec.split(","):
        if s == "direct":
            out.append(("direct", urllib.request.build_opener(urllib.request.ProxyHandler({}))))
        else:
            ip, port, user, pw = lines[int(s)][:4]
            p = f"http://{user}:{pw}@{ip}:{port}"
            out.append((s, urllib.request.build_opener(urllib.request.ProxyHandler({"http": p, "https": p}))))
    return out


def ranges_mode():
    RANGE, OPS = size_arg(FLAGS["--ranges"]), openers(FLAGS.get("--lines", "direct"))
    N = len(OPS)
    os.makedirs(TMP, exist_ok=True)
    tasks = queue.Queue(maxsize=N)  # the producer stays at most one round of ranges ahead of the workers
    meter = {"proxy_bytes": 0, "direct_bytes": 0, "lines": {name: {"ok": 0, "retries": 0, "http429": 0} for name, _ in OPS}}
    files = {}  # key -> state of a file in flight
    back = collections.deque()  # tasks a slow line gave back
    state = {"read": False, "active": 0}

    def extra():
        inflight = [{"key": k, "parts_left": f["left"], "of": f["parts"]} for k, f in files.items() if not f.get("ended")]
        return dict(meter, inflight=inflight, mode="ranges", range_mb=RANGE >> 20, workers=N)

    def record(r):
        with lock:
            results.append(r)
        save(extra)

    def count(name, n):
        with lock:
            meter["direct_bytes" if name == "direct" else "proxy_bytes"] += n

    def probe(url, name, op):
        # Range bytes=0-0: the total size from Content-Range, and the capture's final URL so every range reads the same one
        for attempt in range(6):
            try:
                resp = op.open(urllib.request.Request(url, headers={"User-Agent": UA, "Range": "bytes=0-0"}), timeout=120)
                cr, final = resp.headers.get("Content-Range") or "", resp.geturl()
                resp.close()  # never read the body: a server that ignores Range would send the whole file
                if resp.status == 206 and "/" in cr:
                    return int(cr.rsplit("/", 1)[1]), final, None
                return int(resp.headers.get("Content-Length") or 0), final, "no ranges"
            except urllib.error.HTTPError as e:
                if e.code in (404, 410):
                    return None, url, "dead"
                if e.code == 429:
                    meter["lines"][name]["http429"] += 1
                err = f"http {e.code}"
            except Exception as e:
                err = str(e)[:200]
            time.sleep(30 * (attempt + 1))
        return None, url, err

    class Slow(Exception):
        pass

    def pull(resp, f, name, h=None):
        # copy a response into a file; under MIN_RATE after the first minute the line is too slow: give the work back
        t0, n = time.time(), 0
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                return
            f.write(chunk); count(name, len(chunk)); n += len(chunk)
            if h:
                h.update(chunk)
            dt = time.time() - t0
            if dt > 60 and n / dt < MIN_RATE:
                resp.close()
                raise Slow(f"{n / dt / 1e6:.2f} MB/s")

    def get_range(name, op, url, a, b, path):
        # one range into a temp file; a retry continues from the bytes already written. Anything but 206 with the right
        # Content-Range and length is retried 5 times (30 s x attempt). A slow line returns "slow" at once and keeps the
        # partial file, so the worker that takes the range next continues it
        want, err = b - a + 1, None
        for attempt in range(6):
            have = os.path.getsize(path) if os.path.exists(path) else 0
            if have == want:
                return None
            try:
                resp = op.open(urllib.request.Request(url, headers={"User-Agent": UA, "Range": f"bytes={a + have}-{b}"}), timeout=120)
                cr = resp.headers.get("Content-Range") or ""
                if resp.status != 206 or not cr.startswith(f"bytes {a + have}-{b}/"):
                    resp.close()
                    raise IOError(f"http {resp.status} content-range {cr!r}")
                with open(path, "ab") as f:
                    pull(resp, f, name)
                resp.close()
                got = os.path.getsize(path)
                if got == want:
                    return None
                raise IOError(f"short range {got} of {want}")
            except Slow:
                return "slow"
            except urllib.error.HTTPError as e:
                err = f"http {e.code}"
                if e.code == 429:
                    meter["lines"][name]["http429"] += 1
            except Exception as e:
                err = str(e)[:200]
            meter["lines"][name]["retries"] += 1
            time.sleep(30 * (attempt + 1))
        return err

    def end(f, r):
        # the last range of a file is in: complete the upload and check the byte count, or abort it
        f["ended"] = True
        try:
            if r.get("status") != "error":
                parts = [{"PartNumber": n, "ETag": e} for n, e in sorted(f["etags"].items())]
                s3.complete_multipart_upload(Bucket=B, Key=f["key"], UploadId=f["uid"], MultipartUpload={"Parts": parts})
                got = s3.head_object(Bucket=B, Key=f["key"])["ContentLength"]
                if got != f["total"]:
                    raise IOError(f"lake holds {got} of {f['total']}")
                r.update(status="done", bytes=got)
        except Exception as e:
            r.update(status="error", error=str(e)[:200])
        if r["status"] == "error":
            try:
                s3.abort_multipart_upload(Bucket=B, Key=f["key"], UploadId=f["uid"])
            except Exception:
                pass
        r.update(parts=f["parts"], seconds=int(time.time() - f["t0"]), lines=sorted(f["lines"]))
        record(r)

    def whole(name, op, it, final, total, r):
        # under 300 MB: one GET into a temp file, checked against the size, then one upload (no partial object in the lake)
        path = f"{TMP}/{abs(hash(it['key']))}.whole"
        err = None
        for attempt in range(6):
            try:
                if os.path.exists(path):
                    os.remove(path)
                resp = op.open(urllib.request.Request(final, headers={"User-Agent": UA}), timeout=300)
                h = hashlib.sha256()
                with open(path, "wb") as f:
                    pull(resp, f, name, h)
                resp.close()
                got = os.path.getsize(path)
                if total and got != total:
                    raise IOError(f"short read {got} of {total}")
                s3.upload_file(path, B, it["key"], Config=cfg, ExtraArgs={"StorageClass": "INTELLIGENT_TIERING",
                               "Metadata": {"source-url": (it.get("original") or it["url"])[:1800], "wayback": final[:1800]}})
                r.update(status="done", bytes=got, sha256=h.hexdigest(), line=name)
                err = None
                break
            except Slow:
                if os.path.exists(path):
                    os.remove(path)
                return "slow"
            except urllib.error.HTTPError as e:
                err = f"http {e.code}"
                if e.code in (404, 410):
                    r.update(status="dead", error=err); err = None; break
            except Exception as e:
                err = str(e)[:200]
            time.sleep(30 * (attempt + 1))
        if err:
            r.update(status="error", error=err)
        if os.path.exists(path):
            os.remove(path)
        record(r)

    def worker(i):
        name, op = OPS[i]
        while True:
            # given-back work first; leave only when the list is read and nothing is queued, given back or in hand
            with lock:
                t = back.popleft() if back else None
                if t:
                    state["active"] += 1
            if t is None:
                try:
                    t = tasks.get(timeout=5)
                except queue.Empty:
                    with lock:
                        if state["read"] and not back and state["active"] == 0:
                            return
                    continue
                if t is None:  # the list is read
                    with lock:
                        state["read"] = True
                    continue
                with lock:
                    state["active"] += 1
            if t[0] == "whole":
                if whole(name, op, *t[1:]) == "slow":
                    give_back(name, t)
                else:
                    meter["lines"][name]["ok"] += 1
                    with lock:
                        state["active"] -= 1
                continue
            _, f, n, a, b = t
            path = f"{TMP}/{f['idx']}.{n}"
            err = "file failed" if f.get("failed") else get_range(name, op, f["final"], a, b, path)
            if err == "slow":
                give_back(name, t)
                continue
            if not err:
                try:
                    with open(path, "rb") as body:
                        etag = s3.upload_part(Bucket=B, Key=f["key"], UploadId=f["uid"], PartNumber=n, Body=body)["ETag"]
                except Exception as e:
                    err = f"upload_part: {str(e)[:150]}"
            if os.path.exists(path):
                os.remove(path)
            with lock:
                if err:
                    f["failed"] = True
                    f["r"].setdefault("error", f"part {n}: {err}")
                else:
                    f["etags"][n] = etag
                    f["lines"].add(name)
                    meter["lines"][name]["ok"] += 1
                f["left"] -= 1
                last = f["left"] == 0
            if last:
                if f.get("failed"):
                    f["r"]["status"] = "error"
                end(f, f["r"])
            with lock:
                state["active"] -= 1

    def give_back(name, t):
        # a slow line hands its task to the next free worker and sits out 5 minutes
        with lock:
            back.append(t)
            state["active"] -= 1
            meter["lines"][name]["slow"] = meter["lines"][name].get("slow", 0) + 1
        time.sleep(BENCH)

    threads =[threading.Thread(target=worker, args=(i,), daemon=True) for i in range(N)]
    for t in threads:
        t.start()

    def heartbeat():
        while True:
            time.sleep(60)
            save(extra)
    threading.Thread(target=heartbeat, daemon=True).start()

    for k, it in enumerate(items):
        name, op = OPS[k % N]
        url = it["url"].replace("http://web.archive.org/", "https://web.archive.org/", 1)
        r = {"url": it["url"], "key": it["key"], "original": it.get("original"), "snapshot": it.get("snapshot"), "via": "wayback-ranges"}
        total, final, note = probe(url, name, op)
        if total is None:
            r.update(status="dead" if note == "dead" else "error", error=note)
            record(r); continue
        try:
            held = s3.head_object(Bucket=B, Key=it["key"])["ContentLength"]
        except Exception:
            held = None
        if held is not None and held == total:
            r.update(status="skipped", bytes=held)
            record(r); continue
        r.update(wayback_final=final, total=total)
        if total < SMALL or note == "no ranges":
            r["via"] = "wayback-whole"
            tasks.put(("whole", it, final, total, r))
            continue
        uid = s3.create_multipart_upload(Bucket=B, Key=it["key"], StorageClass="INTELLIGENT_TIERING",
                                         Metadata={"source-url": (it.get("original") or it["url"])[:1800], "wayback": final[:1800]})["UploadId"]
        spans = [(a, min(a + RANGE, total) - 1) for a in range(0, total, RANGE)]
        f = {"idx": k, "key": it["key"], "uid": uid, "final": final, "total": total, "parts": len(spans), "left": len(spans),
             "etags": {}, "lines": set(), "t0": time.time(), "r": r}
        with lock:
            files[it["key"]] = f
        for n, (a, b) in enumerate(spans, 1):
            tasks.put(("range", f, n, a, b))
    for _ in threads:
        tasks.put(None)
    for t in threads:
        t.join()
    save(extra)


if FLAGS.get("--ranges"):
    ranges_mode()
else:
    with ThreadPoolExecutor(W) as ex:
        list(ex.map(one, items))
    save()
print(json.dumps(json.loads(s3.get_object(Bucket=B, Key=f"{OUT}/status.json")["Body"].read())))
