# Wayback pass (brief 20, steps 2-4): fetch a fetch list's files from the Wayback Machine's id_ replay, from the box's
# own address (no proxy bytes), check each against the record's size and md5, and only then put it in the lake.
# Reads  raw/iaea-records/2026-11-08/_work/lists/<list>.json (classify.py: id, name, key, url, size, md5, cands).
# Writes raw/iaea-records/2026-11-08/<record-id>/<filename> (Intelligent-Tiering) and
#        raw/iaea-records/2026-11-08/_work/<list>/results.jsonl and status.json.
# Tested 2026-11-08: these captures answer 404 to any Range request, so each file is one plain GET (about 0.9 MB/s a
# stream from the box's address); a stream that breaks starts again. CONNS files at once (brief 14 saw 429s above 3
# connections from one address), the list's largest first so the long file starts at once. Captures of the file's own
# URL (/records/<id>/files/<name>, with or without ?download=1) are tried newest first; the API form
# (/api/records/.../content) replays as 404 and goes last. A capture whose size or md5 differs from the record's is a
# mismatch, and the file's row says so (the proxy pass may take it later).
#   /opt/pw/bin/python wayback.py <list> [conns]
import gzip, hashlib, json, os, sys, threading, time, zlib
import urllib3
from concurrent.futures import ThreadPoolExecutor
from boto3.s3.transfer import TransferConfig
from rec import *

LIST = sys.argv[1]
CONNS = int(sys.argv[2]) if len(sys.argv) > 2 else 3
OUT = f"{W}/{LIST}"
TMP = "/data/wb"
UA = "Mozilla/5.0 (X11; Linux x86_64) nsrgpt-archive-fetch"
cfg = TransferConfig(multipart_chunksize=64 << 20, max_concurrency=4)
items = get_json(f"{W}/lists/{LIST}.json")["files"]
results, lock, moved = [], threading.Lock(), {"bytes": 0}
# a rerun keeps the rows an earlier run of this list settled (done, mismatch, dead) and fetches only the rest
try:
    results = [r for r in (json.loads(l) for l in get(f"{OUT}/results.jsonl").decode().splitlines() if l.strip())
               if r["status"] in ("done", "skipped", "mismatch", "dead")]
except Exception:
    results = []
settled = {r["key"] for r in results}
items_all, items = items, [it for it in items if it["key"] not in settled]
os.makedirs(TMP, exist_ok=True)


class Mismatch(Exception):
    pass


class Dead(Exception):
    pass


def save():
    with lock:
        rows = list(results)
    st = {"list": LIST, "of": len(items_all), "at": time.strftime("%H:%M:%S"), "bytes_read": moved["bytes"]}
    for s in ("done", "skipped", "mismatch", "dead", "error"):
        st[s] = sum(1 for r in rows if r["status"] == s)
    st["bytes_done"] = sum(r.get("bytes", 0) for r in rows if r["status"] == "done")
    put_lines(f"{OUT}/results.jsonl", rows)
    put_json(f"{OUT}/status.json", st)


def decode(enc, raw):
    if enc == "gzip":
        return gzip.decompress(raw)
    if enc == "deflate":
        return zlib.decompress(raw)
    if enc == "br":
        import brotli
        return brotli.decompress(raw)
    return raw


HTTP = urllib3.PoolManager(maxsize=8, retries=urllib3.Retry(total=None, connect=0, read=0, status=0, other=0, redirect=5),
                           timeout=urllib3.Timeout(connect=20, read=180))


def get_whole(url, size, path):
    # the capture into path; returns the URL the replay settled on. Kept-alive connections (urllib3): the Wayback
    # Machine refuses some new connections from a busy address, so a refused connection is retried within seconds,
    # while a 429 or 5xx waits longer. A broken stream starts again.
    err = None
    for attempt in range(10):
        resp, clean = None, False
        try:
            resp = HTTP.request("GET", url, headers={"User-Agent": UA, "Accept-Encoding": "identity"}, preload_content=False)
            if resp.status in (404, 410):
                raise Dead(f"http {resp.status}")
            if resp.status != 200:
                err = f"http {resp.status}"
                resp.drain_conn()
                clean = True
                time.sleep((60 if resp.status == 429 else 30) * min(attempt + 1, 4))
                continue
            enc = (resp.headers.get("Content-Encoding") or "").lower()
            n = int(resp.headers.get("Content-Length") or -1)
            if not enc and n >= 0 and n != size:
                raise Mismatch(f"capture holds {n} bytes, record lists {size}")
            got = 0
            with open(path, "wb") as f:
                for chunk in resp.stream(1 << 20, decode_content=False):
                    f.write(chunk)
                    got += len(chunk)
                    with lock:
                        moved["bytes"] += len(chunk)
                    if not enc and got > size:
                        raise Mismatch(f"capture longer than the record lists ({size})")
            clean = True
            final = getattr(resp, "url", None) or url
            if enc and enc != "identity":  # stored compressed (the crawler accepted gzip): decode it
                with open(path, "rb") as f:
                    body = decode(enc, f.read())
                with open(path, "wb") as f:
                    f.write(body)
            return final
        except (Mismatch, Dead):
            raise
        except (urllib3.exceptions.NewConnectionError, urllib3.exceptions.ConnectTimeoutError,
                urllib3.exceptions.MaxRetryError) as e:
            err = f"connect: {str(e)[:120]}"
            time.sleep(3 * (attempt + 1))
        except Exception as e:
            err = str(e)[:160]
            time.sleep(10 * min(attempt + 1, 4))
        finally:
            if resp is not None:
                if not clean:  # a response left half read must not go back to the pool
                    resp.close()
                resp.release_conn()
    raise IOError(err)


def ordered(cands):
    # the file's own URL first, newest first; the API form last
    return sorted(cands, key=lambda c: ("/api/" in c["original"], -int(c["timestamp"])))


def one(it):
    r = {k: it[k] for k in ("id", "name", "key", "url", "size", "md5", "class")}
    r["route"], r["tries"] = "wayback", []
    if have(it["key"]) == it["size"]:
        r.update(status="skipped", bytes=it["size"])
    else:
        r["status"] = "dead"
        path = f"{TMP}/{hashlib.sha1(it['key'].encode()).hexdigest()}"
        for cand in ordered(it["cands"])[:4]:
            url = f"https://web.archive.org/web/{cand['timestamp']}id_/{cand['original']}"
            try:
                final = get_whole(url, it["size"], path)
                n = os.path.getsize(path)
                if n != it["size"]:
                    raise Mismatch(f"got {n} bytes, record lists {it['size']}")
                md5 = md5_file(path)
                if it.get("md5") and md5 != it["md5"]:
                    raise Mismatch(f"md5 {md5}, record lists {it['md5']}")
                s3.upload_file(path, B, it["key"], Config=cfg, ExtraArgs={
                    "StorageClass": "INTELLIGENT_TIERING", "ContentType": "application/octet-stream",
                    "Metadata": {"source-url": it["url"][:1800], "wayback": final[:1800], "md5": md5}})
                if have(it["key"]) != it["size"]:
                    raise IOError("lake byte count differs after upload")
                r.update(status="done", bytes=it["size"], md5_checked=bool(it.get("md5")), snapshot=cand["timestamp"],
                         wayback_url=final)
                break
            except Mismatch as e:
                r["tries"].append({"timestamp": cand["timestamp"], "original": cand["original"], "mismatch": str(e)[:200]})
                r["status"] = "mismatch"
            except Dead as e:
                r["tries"].append({"timestamp": cand["timestamp"], "original": cand["original"], "dead": str(e)})
            except Exception as e:
                r["tries"].append({"timestamp": cand["timestamp"], "original": cand["original"], "error": str(e)[:200]})
                if r["status"] != "mismatch":
                    r["status"] = "error"
            finally:
                if os.path.exists(path):
                    os.remove(path)
    with lock:
        results.append(r)
    print(json.dumps({k: r.get(k) for k in ("key", "status", "size")}), flush=True)
    return r


def heartbeat():
    while True:
        time.sleep(60)
        save()


threading.Thread(target=heartbeat, daemon=True).start()
items.sort(key=lambda it: -it["size"])
with ThreadPoolExecutor(CONNS) as ex:
    list(ex.map(one, items))
save()
print(json.dumps(get_json(f"{OUT}/status.json")))
