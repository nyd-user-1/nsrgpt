# iaea-pull: crawl a source's pages, list its files, and fan the files out to Lambda nsr-fetch, all inside AWS, so the
# Mac (8 GB, no python3) only sends one invoke. Brief 11 (docs/briefs/11-iaea-and-open-libraries-acquisition.md).
#
# Modes (one per event):
#   {"probe": {"urls": [...], "proxy": 3}}                      status, bytes and server for each URL, from AWS
#   {"crawl": {"seeds": [...], "scope": [prefixes], "files": "regex", "skip": "regex", "max_pages": 400,
#              "proxy": null, "out": "raw/<src>/2026-11-07/_work/list.json"}}
#       walks HTML pages under the scope prefixes, collects links matching "files", HEADs each for its size
#   {"cdx": {"url": "www-nds.iaea.org/public/*", "out": "raw/iaea/2026-11-07/_work/cdx-x.json"}}
#       the Wayback Machine's latest 200 capture of each URL under the pattern (original URL, snapshot, size)
#   {"pull": {"prefix": "raw/<src>/2026-11-07", "items": [{"url", "key"?, "size"?, "phase"?, "group"?}] | "list": key,
#             "strip": "url prefix to drop when building keys", "workers": 24, "big": bytes, "not_taken": [...], "spend": [...], "source": "..."}}
#       copies the items through nsr-fetch (24 at a time; parts mode over 2 GB), then merges manifest.json in the prefix
#       "chunk": n runs n items, then hands the rest to a fresh run of this function; "then": [pull, …] runs next, in order
import json, os, re, threading, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
import boto3
from botocore.config import Config

BUCKET = os.environ.get("BUCKET", "nsr-lake-613473203863")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
PART, BIG = 64 * 1024 * 1024, 2 * 1024 ** 3
s3 = boto3.client("s3")
lam = boto3.client("lambda", config=Config(read_timeout=900, connect_timeout=10, retries={"max_attempts": 0},
                                           max_pool_connections=40))
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


def get(url, proxy=None, method="GET", limit=None, timeout=40):
    req = urllib.request.Request(url, method=method, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        r = opener(proxy).open(req, timeout=timeout)
        body = r.read(limit) if method == "GET" else b""
        return {"url": url, "final": r.geturl(), "http": r.status, "size": int(r.headers.get("Content-Length") or -1),
                "type": r.headers.get("Content-Type", ""), "server": r.headers.get("Server", ""), "body": body}
    except urllib.error.HTTPError as e:
        return {"url": url, "http": e.code, "size": -1, "server": e.headers.get("Server", ""), "body": b""}
    except Exception as e:
        return {"url": url, "http": str(e)[:120], "size": -1, "body": b""}


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.out = []

    def handle_starttag(self, tag, attrs):
        for k, v in attrs:
            if k in ("href", "src") and v:
                self.out.append(v.strip())


def links(base, body):
    p = Links()
    try:
        p.feed(body.decode("utf-8", "replace"))
    except Exception:
        pass
    out = []
    for h in p.out:
        if h.startswith(("mailto:", "javascript:", "#")):
            continue
        u = urllib.parse.urljoin(base, h).split("#")[0]
        if u.startswith(("http://", "https://")):
            out.append(u)
    return out


def crawl(c):
    scope, files_re = c["scope"], re.compile(c.get("files", r"\.(tar|gz|tgz|zip|7z|bz2|xz|z|dat|txt|endf|e6|pdf|asc|ace|h5|xml|json|csv|for|f|f90|exe|doc|ps)$"), re.I)
    skip = re.compile(c["skip"]) if c.get("skip") else None
    proxy, maxp = c.get("proxy"), c.get("max_pages", 400)
    seen, queue, files, pages, bad = set(), list(c["seeds"]), {}, [], []
    t0 = time.time()
    while queue and len(pages) < maxp and time.time() - t0 < 600:
        batch = []
        while queue and len(batch) < 8:
            u = queue.pop(0)
            if u not in seen:
                seen.add(u); batch.append(u)
        with ThreadPoolExecutor(8) as ex:
            res = list(ex.map(lambda u: get(u, proxy, limit=8_000_000), batch))
        for r in res:
            if r["http"] != 200:
                bad.append({"url": r["url"], "http": r["http"]}); continue
            pages.append(r["url"])
            if "html" not in (r.get("type") or "") and not r["url"].endswith(("/", ".html", ".htm")):
                continue
            for u in links(r.get("final") or r["url"], r["body"]):
                if skip and skip.search(u):
                    continue
                path = urllib.parse.urlparse(u).path
                if files_re.search(path):
                    files.setdefault(u, {"url": u, "from": r["url"]})
                elif any(u.startswith(s) for s in scope) and u not in seen and (path.endswith(("/", ".html", ".htm", ".php")) or "." not in path.rsplit("/", 1)[-1]):
                    queue.append(u)
    flist = list(files.values())
    with ThreadPoolExecutor(12) as ex:
        heads = list(ex.map(lambda f: get(f["url"], proxy, method="HEAD"), flist))
    for f, h in zip(flist, heads):
        f["size"], f["http"] = h["size"], h["http"]
        if h.get("final") and h["final"] != f["url"]:
            f["final"] = h["final"]
    out = {"seeds": c["seeds"], "pages": pages, "bad_pages": bad, "files": flist, "queue_left": len(queue),
           "bytes": sum(max(f["size"], 0) for f in flist)}
    if c.get("out"):
        s3.put_object(Bucket=BUCKET, Key=c["out"], Body=json.dumps(out, indent=1).encode(), ContentType="application/json")
    summary = {k: v for k, v in out.items() if k != "files"}
    summary["n_files"], summary["n_pages"] = len(flist), len(pages)
    summary["pages"] = pages[:60]
    summary["files"] = [{"url": f["url"], "size": f["size"], "http": f["http"]} for f in flist[:400]]
    return summary


def invoke(payload):
    r = lam.invoke(FunctionName="nsr-fetch", Payload=json.dumps(payload).encode())
    body = json.loads(r["Payload"].read())
    if isinstance(body, dict) and body.get("errorMessage"):
        raise RuntimeError(body["errorMessage"][:300])
    return body


def big_file(it, proxy=None):
    try:
        if s3.head_object(Bucket=BUCKET, Key=it["key"])["ContentLength"] == it["size"]:
            return {"url": it["url"], "key": it["key"], "status": "skipped", "bytes": it["size"]}
    except Exception:
        pass
    up = s3.create_multipart_upload(Bucket=BUCKET, Key=it["key"], StorageClass="INTELLIGENT_TIERING",
                                    Metadata={"source-url": it["url"][:1800]})["UploadId"]
    size = it["size"]
    ranges = [[i + 1, o, min(o + PART, size) - 1] for i, o in enumerate(range(0, size, PART))]
    chunks = [ranges[i:i + 16] for i in range(0, len(ranges), 16)]
    parts = []
    try:
        with ThreadPoolExecutor(12) as ex:
            for r in ex.map(lambda ch: invoke({"parts": {"url": it["url"], "key": it["key"], "upload_id": up, "ranges": ch, "proxy": proxy}}), chunks):
                parts += r
        s3.complete_multipart_upload(Bucket=BUCKET, Key=it["key"], UploadId=up,
                                     MultipartUpload={"Parts": sorted(parts, key=lambda p: p["PartNumber"])})
    except Exception as e:
        s3.abort_multipart_upload(Bucket=BUCKET, Key=it["key"], UploadId=up)
        return {"url": it["url"], "key": it["key"], "status": "error", "error": str(e)[:300]}
    return {"url": it["url"], "key": it["key"], "status": "done", "bytes": size, "multipart": len(ranges)}


def batches(items):
    b, n = [], 0
    for it in items:
        sz = max(it.get("size") or 0, 0)
        if b and (n + sz > 300 * 1024 ** 2 or len(b) >= 40):
            yield b; b, n = [], 0
        b.append(it); n += sz
    if b:
        yield b


DEADLINE = [time.time() + 800]  # reset per invocation from the Lambda context


def run_small(items, proxy=None, workers=24):
    # copies through nsr-fetch; stops waiting near this run's time limit (TIMED_OUT set) so the manifest still gets written
    out = []
    ex = ThreadPoolExecutor(workers)
    futs = {ex.submit(invoke, {"items": [{"url": x["url"], "key": x["key"], **({"proxy": proxy} if proxy is not None else {})} for x in b]}): b
            for b in batches(items)}
    try:
        for f in as_completed(futs, timeout=max(1, DEADLINE[0] - time.time())):
            try:
                out += f.result()
            except Exception as e:
                out += [{"url": x["url"], "key": x["key"], "status": "error", "error": str(e)[:300]} for x in futs[f]]
    except TimeoutError:
        TIMED_OUT[0] = True
    ex.shutdown(wait=False, cancel_futures=True)
    return out


TIMED_OUT = [False]


def keyfor(url, prefix, strip):
    if strip and url.startswith(strip):
        rel = url[len(strip):]
    else:
        p = urllib.parse.urlparse(url)
        rel = p.netloc + p.path
    rel = urllib.parse.unquote(rel).lstrip("/")
    return f"{prefix}/{rel}"


def pull(p):
    prefix = p["prefix"].rstrip("/")
    allitems = p.get("items") or json.loads(s3.get_object(Bucket=BUCKET, Key=p["list"])["Body"].read())["files"]
    off = p.get("offset", 0)
    chunk = p.get("chunk") or len(allitems)  # with chunk set, the rest goes on in a fresh run of this function
    items = [dict(i) for i in allitems[off:off + chunk] if i.get("http", 200) == 200]
    workers = p.get("workers", 24)
    if any("page" in i for i in items):
        pick = re.compile(p["pick"])

        def resolve(it):
            if "page" not in it:
                return it
            r = get(it["page"], p.get("proxy"), limit=4_000_000)
            m = pick.search(r["body"].decode("utf-8", "replace")) if r["http"] == 200 else None
            it["url"] = urllib.parse.urljoin(it["page"], m.group(0)) if m else None
            return it
        with ThreadPoolExecutor(workers) as ex:
            items = list(ex.map(resolve, items))
        unresolved = [{"url": i["page"], "reason": "no file link on the page"} for i in items if not i.get("url")]
        p.setdefault("dead_links", []).extend(unresolved)
        items = [i for i in items if i.get("url")]
    for it in items:
        it.setdefault("key", keyfor(it.get("final") or it["url"], prefix, p.get("strip")))
        if it.get("size") is None or it["size"] < 0:
            it["size"] = get(it["url"], p.get("proxy"), method="HEAD")["size"]
    big = p.get("big", BIG)  # over this, parts mode across many nsr-fetch calls; under it, one call (its own multipart)
    small = [i for i in items if i["size"] <= big]
    large = [i for i in items if i["size"] > big]
    results = run_small(small, p.get("proxy"), workers)
    for rnd in range(0 if TIMED_OUT[0] else p.get("retry", 0)):  # rate-limited or failed items: wait, then again at 2 workers
        bad = [r for r in results if r["status"] == "error"]
        if not bad:
            break
        time.sleep(30 * (rnd + 1))
        byurl = {i["url"]: i for i in small}
        results = [r for r in results if r["status"] != "error"] + run_small([byurl[r["url"]] for r in bad if r["url"] in byurl], p.get("proxy"), 2)
    for it in large:
        results.append(big_file(it, p.get("proxy")))
    meta = {i["url"]: i for i in items}
    for r in results:
        m = meta.get(r["url"], {})
        for k, v in m.items():  # carry the item's own fields (phase, group, original, snapshot, repo, …)
            if k not in ("url", "key", "size", "http", "final", "page") and v is not None and k not in r:
                r[k] = v
    mkey = p.get("manifest") or f"{prefix}/manifest.json"
    try:
        man = json.loads(s3.get_object(Bucket=BUCKET, Key=mkey)["Body"].read())
    except Exception:
        man = {"source": p.get("source", ""), "prefix": prefix, "files": [], "not_taken": [], "dead_links": [], "spend": [],
               "how": "services/iaea-pull and services/nsr-fetch (Lambda, us-east-2), scripts/iaea/ in nsrgpt"}
    byk = {f["key"]: f for f in man["files"]}
    for r in results:
        if r["status"] == "skipped" and r["key"] in byk:
            continue
        byk[r["key"]] = {**byk.get(r["key"], {}), **r}
    man["files"] = sorted(byk.values(), key=lambda f: f["key"])
    for k in ("not_taken", "dead_links", "spend"):
        have = {json.dumps(x, sort_keys=True) for x in man.get(k, [])}
        man[k] = man.get(k, []) + [x for x in p.get(k, []) if json.dumps(x, sort_keys=True) not in have]
    if p.get("source"):
        man["source"] = p["source"]
    ok = [f for f in man["files"] if f.get("status") in ("done", "skipped")]
    man["counts"] = {"files": len(ok), "errors": sum(1 for f in man["files"] if f.get("status") == "error"),
                     "not_taken": len(man["not_taken"]), "dead_links": len(man["dead_links"])}
    man["bytes"] = sum(f.get("bytes") or 0 for f in ok)
    man["updated"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    s3.put_object(Bucket=BUCKET, Key=mkey, Body=json.dumps(man, indent=1).encode(), ContentType="application/json")
    nxt = None
    if TIMED_OUT[0] and p.get("attempt", 0) < 3:  # same chunk again; finished keys are skipped by size
        nxt = {**p, "attempt": p.get("attempt", 0) + 1, "not_taken": [], "dead_links": [], "spend": []}
        if "list" not in p:
            p["list"] = f"{prefix}/_work/chain-{int(time.time())}.json"
            s3.put_object(Bucket=BUCKET, Key=p["list"], Body=json.dumps({"files": allitems}).encode())
            nxt = {**nxt, "list": p["list"]}; nxt.pop("items", None)
    elif off + chunk < len(allitems):
        if "list" not in p:
            p["list"] = f"{prefix}/_work/chain-{int(time.time())}.json"
            s3.put_object(Bucket=BUCKET, Key=p["list"], Body=json.dumps({"files": allitems}).encode())
            p.pop("items", None)
        nxt = {**p, "offset": off + chunk, "attempt": 0, "not_taken": [], "dead_links": [], "spend": []}
    elif p.get("then"):
        nxt = {**p["then"][0], "then": p["then"][1:]}
    if nxt:
        lam.invoke(FunctionName="iaea-pull", InvocationType="Event", Payload=json.dumps({"pull": nxt}).encode())
    errs = [r for r in results if r["status"] == "error"]
    return {"run": {s: sum(1 for r in results if r["status"] == s) for s in ("done", "skipped", "error")},
            "run_bytes": sum(r.get("bytes") or 0 for r in results if r["status"] != "error"),
            "manifest": man["counts"], "manifest_bytes": man["bytes"], "errors": errs[:30], "offset": off, "of": len(allitems), "next": (nxt or {}).get("offset", (nxt or {}).get("prefix"))}


def cdx(c):
    # Wayback Machine index for a URL pattern: the latest 200 capture of each URL, written to S3 as a list.
    base = "http://web.archive.org/cdx/search/cdx?"
    q = {"url": c["url"], "fl": "original,timestamp,length,mimetype,digest", "filter": "statuscode:200"}
    n = get(base + urllib.parse.urlencode({"url": c["url"], "showNumPages": "true"}), timeout=120)
    pages = int(n["body"].strip() or 0) if n["http"] == 200 else 0
    rows, fails = {}, []
    for pg in range(pages):
        for attempt in range(4):
            r = get(base + urllib.parse.urlencode({**q, "page": pg}), timeout=180, limit=200_000_000)
            if r["http"] == 200:
                break
            time.sleep(5 * (attempt + 1))
        if r["http"] != 200:
            fails.append({"page": pg, "http": r["http"]}); continue
        for line in r["body"].decode("utf-8", "replace").splitlines():
            f = line.split(" ")
            if len(f) < 5:
                continue
            u = urllib.parse.urlparse(f[0])
            k = u.hostname.removeprefix("www-").removeprefix("www.") + u.path + ("?" + u.query if u.query else "")
            if k not in rows or f[1] > rows[k]["snapshot"]:
                rows[k] = {"original": f[0], "snapshot": f[1], "size": int(f[2]) if f[2].isdigit() else -1, "mime": f[3], "digest": f[4]}
        time.sleep(1)
    out = {"query": c["url"], "pages": pages, "failed_pages": fails, "files": sorted(rows.values(), key=lambda x: x["original"])}
    s3.put_object(Bucket=BUCKET, Key=c["out"], Body=json.dumps(out).encode(), ContentType="application/json")
    return {"query": c["url"], "pages": pages, "failed_pages": fails, "urls": len(rows), "out": c["out"]}


def select(c):
    # Filter a cdx list and summarise it by path depth; optionally write it as pull items (Wayback raw URLs, id_).
    rows = json.loads(s3.get_object(Bucket=BUCKET, Key=c["list"])["Body"].read())["files"]
    inc = re.compile(c.get("include", ".")); exc = re.compile(c["exclude"]) if c.get("exclude") else None
    strip, depth = c.get("strip", ""), c.get("depth", 1)
    groups, items = {}, []
    for r in rows:
        o = r["original"]
        if "?" in o and not c.get("queries"):
            continue
        path = urllib.parse.unquote(urllib.parse.urlparse(o).path)
        if not inc.search(path) or (exc and exc.search(path)):
            continue
        if c.get("min_bytes") and r["size"] < c["min_bytes"]:
            continue
        if path.endswith("/"):
            path += "index.html"
        rel = path[len(strip):] if path.startswith(strip) else path.lstrip("/")
        g = "/".join(rel.split("/")[:depth])
        ext = rel.rsplit(".", 1)[-1].lower() if "." in rel.rsplit("/", 1)[-1] else "(none)"
        e = groups.setdefault(g, {"n": 0, "bytes": 0, "ext": {}})
        e["n"] += 1; e["bytes"] += max(r["size"], 0); e["ext"][ext] = e["ext"].get(ext, 0) + 1
        items.append({"url": f"http://web.archive.org/web/{r['snapshot']}id_/{o}", "key": f"{c.get('prefix', 'raw/iaea/2026-11-07')}{path}",
                      "size": max(r["size"], 0), "wb_size": r["size"], "original": o, "snapshot": r["snapshot"], "group": g, "phase": c.get("phase", 1)})
    if c.get("out"):
        s3.put_object(Bucket=BUCKET, Key=c["out"], Body=json.dumps({"files": items}).encode(), ContentType="application/json")
    top = sorted(groups.items(), key=lambda kv: -kv[1]["n"])
    return {"selected": len(items), "groups": len(groups), "summary": {k: v for k, v in top[:c.get("show", 200)]}, "files": [{"o": i["original"], "mb": round(i["wb_size"] / 1e6, 1), "ts": i["snapshot"][:8]} for i in sorted(items, key=lambda i: -i["wb_size"])[:c.get("files", 0)]]}


def lambda_handler(event, context):
    if "probe" in event:
        pr = event["probe"]
        with ThreadPoolExecutor(12) as ex:
            res = list(ex.map(lambda u: get(u, pr.get("proxy"), method=pr.get("method", "GET"), limit=pr.get("limit", 2000)), pr["urls"]))
        for r in res:
            b = r.pop("body", b"")
            if pr.get("show"):
                r["head"] = b.decode("utf-8", "replace")[:pr.get("show")]
        return res
    if "crawl" in event:
        return crawl(event["crawl"])
    if "cdx" in event:
        return cdx(event["cdx"])
    if "select" in event:
        return select(event["select"])
    if "pull" in event:
        DEADLINE[0] = time.time() + context.get_remaining_time_in_millis() / 1000 - 120
        TIMED_OUT[0] = False
        return pull(event["pull"])
    return {"error": "event needs probe, crawl or pull"}
