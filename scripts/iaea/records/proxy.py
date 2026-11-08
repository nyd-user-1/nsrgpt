# Proxy pass (brief 20, steps 2, 3 and 5): fetch files through real Chrome on one Webshare line, smallest first, inside
# the 5.0 GB proxy cap as counted by meter.sh (which must be running: no meter, no fetch).
# Reads  sources given as list:<name> (raw/iaea-records/2026-11-08/_work/lists/<name>.json) or retry:<run>
#        (rows of a wayback.py run whose status is mismatch, dead or error), or items:<s3-key> ({"files": [{url, key,
#        size?, md5?, class?}]}, for files outside the records repository such as PRONDOS).
# Writes each file at its key (Intelligent-Tiering) after checking its byte count and md5 where the record lists them;
#        <out>/results.jsonl and status.json, <out> defaulting to raw/iaea-records/2026-11-08/_work/<run>.
# Before each file: if the meter plus the file (and 5% overhead) would pass CAP minus the reserve, that file and every
# larger one is listed "deferred: <class>, proxy budget (2026-11-08)" instead.
#   xvfb-run -a /opt/pw/bin/python proxy.py <run> <line>[,<line>...] <source>... [--reserve BYTES] [--out PREFIX]
import hashlib, json, os, sys, time
from boto3.s3.transfer import TransferConfig
from rec import *

args = sys.argv[1:]
opts = {}
for flag in ("--reserve", "--out"):
    if flag in args:
        i = args.index(flag)
        opts[flag] = args[i + 1]
        del args[i:i + 2]
RUN, LINES, SOURCES = args[0], [int(x) for x in args[1].split(",")], args[2:]
OUT = opts.get("--out", f"{W}/{RUN}").rstrip("/")
RESERVE = int(float(opts.get("--reserve", 0)))
cfg = TransferConfig(multipart_chunksize=64 << 20, max_concurrency=4)
LOG, results = [], []


def log(m):
    LOG.append(f"{time.strftime('%H:%M:%S')} {m}")
    print(LOG[-1], flush=True)


def save(**kw):
    st = {"run": RUN, "of": len(items), "at": time.strftime("%H:%M:%S"), "metered": metered(), "cap": CAP, "reserve": RESERVE}
    for s in ("done", "skipped", "deferred", "error"):
        st[s] = sum(1 for r in results if r["status"] == s)
    st["bytes_done"] = sum(r.get("bytes", 0) for r in results if r["status"] == "done")
    st.update(kw)
    put_lines(f"{OUT}/results.jsonl", results)
    put_json(f"{OUT}/status.json", st)
    put(f"{OUT}/log.txt", "\n".join(LOG).encode(), "text/plain")


items, seen = [], set()
for src in SOURCES:
    kind, name = src.split(":", 1)
    if kind == "list":
        got = get_json(f"{W}/lists/{name}.json")["files"]
    elif kind == "retry":
        got = [json.loads(l) for l in get(f"{W}/{name}/results.jsonl").decode().splitlines() if l.strip()]
        got = [r for r in got if r["status"] in ("mismatch", "dead", "error")]
    else:
        got = get_json(name)["files"]
    for it in got:
        if it["key"] not in seen:
            seen.add(it["key"])
            items.append(it)
items.sort(key=lambda it: it.get("size") or 0)
if metered() is None:
    raise SystemExit("meter.sh is not running (no /opt/box/meter.json): no proxy fetches without the meter")
log(f"{len(items)} files, {sum(it.get('size') or 0 for it in items)} bytes listed; metered {metered()}")

br, stop, finished = None, False, []  # finished: (time, bytes) of each file this run took
for it in items:
    r = {k: it.get(k) for k in ("id", "name", "key", "url", "size", "md5", "class")}
    r["route"] = "proxy"
    size = it.get("size")
    held = have(it["key"])
    if held is not None and (size is None or held == size):
        r.update(status="skipped", bytes=held)
        results.append(r)
        continue
    # the meter writes every 30 s: add the files finished since its last write, so the cap is not overrun between writes
    m, at = metered_at()
    m = None if m is None else m + sum(b for t, b in finished if t >= at - 1)
    if stop or m is None or m + (size or 0) * 1.05 + 1_000_000 > CAP - RESERVE:
        stop = True  # sorted smallest first: every file after this one is larger
        r.update(status="deferred", reason=f"deferred: {it.get('class') or 'file'}, proxy budget (2026-11-08)", metered_at_stop=m)
        results.append(r)
        continue
    if br is None:
        br = Browser(LINES, log=log)
    t0 = time.time()
    try:
        res = br.get(it["url"])
        if res["status"] != 200:
            raise IOError(f"http {res['status']}")
        if "path" in res:
            path = res["path"]
        else:
            path = f"/data/proxy-{hashlib.sha1(it['key'].encode()).hexdigest()}"
            with open(path, "wb") as f:
                f.write(res["body"])
        n = os.path.getsize(path)
        if size is not None and n != size:
            raise IOError(f"got {n} bytes, record lists {size}")
        md5 = md5_file(path)
        if it.get("md5") and md5 != it["md5"]:
            raise IOError(f"md5 {md5}, record lists {it['md5']}")
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for b in iter(lambda: f.read(1 << 20), b""):
                h.update(b)
        s3.upload_file(path, B, it["key"], Config=cfg, ExtraArgs={
            "StorageClass": "INTELLIGENT_TIERING", "ContentType": res.get("ct") or "application/octet-stream",
            "Metadata": {"source-url": it["url"][:1800], "md5": md5}})
        os.remove(path)
        finished.append((time.time(), n))
        r.update(status="done", bytes=n, md5=md5, md5_checked=bool(it.get("md5")), sha256=h.hexdigest(), line=br.line,
                 ms=int((time.time() - t0) * 1000), via="box-chrome")
    except Exception as e:
        r.update(status="error", error=str(e)[:200])
        log(f"error {it['key']}: {str(e)[:200]}")
    results.append(r)
    if len(results) % 20 == 0:
        save()
if br:
    br.close()
save(finished=True)
log(json.dumps({s: sum(1 for r in results if r["status"] == s) for s in ("done", "skipped", "deferred", "error")}))
save(finished=True)
