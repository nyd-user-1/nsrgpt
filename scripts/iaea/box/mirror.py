# Walled-site mirror (brief 11): real Chrome (Playwright, channel "chrome", headful under Xvfb), one browser per proxy
# line, sharing one queue and one rate limit. Each browser clears the site's challenge on a page, then fetches files
# inside that browser context (context.request shares its cookies), and each file goes straight to S3 from the box.
#   xvfb-run -a /opt/pw/bin/python /opt/box/mirror.py job.json
# job.json:
#   {"name": "iaea-x", "prefix": "raw/iaea/2026-11-07", "warm": "https://nds.iaea.org/",
#    "seeds": [urls], "scope": [url prefixes whose HTML pages are read for links], "skip": "regex",
#    "files": "regex for file links taken from in-scope pages (any host listed in hosts)",
#    "hosts": ["nds.iaea.org", "www-nds.iaea.org"], "items": [{"url", "key"?}], "lines": [0, 1, 2],
#    "rate": 2.0, "max": 20000, "minutes": 200}
# Writes <prefix>/_work/box/<name>/results.jsonl and status.json as it goes.
import hashlib, json, os, queue, random, re, signal, sys, threading, time, urllib.parse
import boto3
from playwright.sync_api import sync_playwright

BUCKET = "nsr-lake-613473203863"
s3 = boto3.client("s3", region_name="us-east-2")
job = json.load(open(sys.argv[1]))
PREFIX, NAME = job["prefix"].rstrip("/"), job["name"]
OUT = f"{PREFIX}/_work/box/{NAME}"
HOSTS = set(job.get("hosts", []))
SCOPE, SKIP = job.get("scope", []), re.compile(job["skip"]) if job.get("skip") else None
FILES = re.compile(job.get("files", r"\.(zip|gz|tgz|tar|7z|bz2|xz|txt|dat|endf|e6|pdf|asc|doc|docx|xls|xlsx|csv|json|xml|for|f|f90|c|exe|ps|lst|htm|html)$"), re.I)
DEADLINE = time.time() + 60 * job.get("minutes", 200)
lines = [l.split(":") for l in boto3.client("ssm", region_name="us-east-2").get_parameter(
    Name="/nsrgpt/webshare/proxies", WithDecryption=True)["Parameter"]["Value"].splitlines() if l.strip()]

q, seen, lock = queue.Queue(), set(), threading.Lock()
results, status = [], {"name": NAME, "started": time.strftime("%H:%M:%S"), "lines": {}}
_CH = re.compile(rb"<title>Just a moment|cf-chl-widget|id=\"challenge-form|<title>Checking your browser|Incapsula incident", re.I)


class _Challenge:
    # Cloudflare's challenge page, or Incapsula's (a short page whose only content is its _Incapsula_Resource script)
    def search(self, b):
        return _CH.search(b) or (b"_Incapsula_Resource" in b and len(b) < 3000)


CHALLENGE = _Challenge()


class Rate:
    # one limit for the whole origin; halves for a minute when recent latency runs over twice the early baseline
    def __init__(self, per_sec):
        self.gap, self.next, self.lat, self.base, self.slow_until = 1.0 / per_sec, 0.0, [], None, 0
        self.l = threading.Lock()

    def wait(self):
        with self.l:
            gap = self.gap * (2 if time.time() < self.slow_until else 1)
            t = max(time.time(), self.next)
            self.next = t + gap
        time.sleep(max(0, t - time.time()))

    def took(self, s, nbytes=0):
        if nbytes > 1_000_000:  # big files take long by size, not because the server is strained
            return
        with self.l:
            self.lat.append(s)
            if self.base is None and len(self.lat) >= 20:
                self.base = sorted(self.lat)[10]
            recent = sorted(self.lat[-20:])
            if self.base and len(recent) >= 10 and recent[int(len(recent) * 0.95) - 1] > 2 * max(self.base, 0.3):
                self.slow_until = time.time() + 60


rate = Rate(job.get("rate", 2.0))


def keyfor(url):
    u = urllib.parse.urlparse(url)
    path = urllib.parse.unquote(u.path) or "/"
    if path.endswith("/"):
        path += "index.html"
    if u.query:
        path += "__" + re.sub(r"[^A-Za-z0-9=&.,_-]", "_", u.query)[:180]
    return PREFIX + path


LIST_ONLY = re.compile(job["list_only"], re.I) if job.get("list_only") else None


def add(url, key=None, depth=0):
    url = url.split("#")[0]
    if LIST_ONLY and LIST_ONLY.search(url):  # listed with their URL, not pulled (processed forms, or a list-only run)
        with lock:
            if url in seen:
                return
            seen.add(url)
        if job.get("skip_held") and have(key or keyfor(url)) is not None:
            return
        with lock:
            results.append({"url": url, "key": key or keyfor(url), "status": "not_taken", "phase": job.get("list_phase", 3),
                            "reason": job.get("list_reason", "processed form (phase 3-4)")})
        return
    with lock:
        if url in seen or len(seen) >= job.get("max", 200000):
            return
        seen.add(url)
    q.put((url, key or keyfor(url), depth))


def spent():
    with lock:
        return sum(r.get("bytes") or 0 for r in results if r.get("status") == "done")


def have(key):
    try:
        return s3.head_object(Bucket=BUCKET, Key=key)["ContentLength"]
    except Exception:
        return None


def links(base, html):
    out = []
    for h in re.findall(rb"""(?:href|src)\s*=\s*["']?([^"'\s>]+)""", html, re.I):
        h = h.decode("utf-8", "replace").strip()
        if h.startswith(("mailto:", "javascript:", "#")):
            continue
        out.append(urllib.parse.urljoin(base, h))
    return out


def in_scope(u):
    return any(u.startswith(s) for s in SCOPE)


def save():
    with lock:
        body = "\n".join(json.dumps(r) for r in results).encode()
        st = dict(status, done=sum(1 for r in results if r["status"] == "done"), skipped=sum(1 for r in results if r["status"] == "skipped"),
                  errors=sum(1 for r in results if r["status"] == "error"), queued=q.qsize(), seen=len(seen),
                  bytes=sum(r.get("bytes") or 0 for r in results if r["status"] == "done"), at=time.strftime("%H:%M:%S"))
    s3.put_object(Bucket=BUCKET, Key=f"{OUT}/results.jsonl", Body=body)
    s3.put_object(Bucket=BUCKET, Key=f"{OUT}/status.json", Body=json.dumps(st, indent=1).encode())
    with q.mutex:  # the queue too, so a stopped run can be resumed from where it was
        pending = [{"url": u, "key": k, "depth": d} for u, k, d in list(q.queue)]
    s3.put_object(Bucket=BUCKET, Key=f"{OUT}/queue.json", Body=json.dumps(pending).encode())


FETCH_JS = """async (u) => {
  const ctl = new AbortController();
  const r = await fetch(u, {credentials: 'include', signal: ctl.signal, redirect: 'follow'});
  const len = +(r.headers.get('content-length') || 0), ct = r.headers.get('content-type') || '';
  if (len > 10e6) { ctl.abort(); return {status: r.status, big: true, len, ct, url: r.url}; }
  const buf = new Uint8Array(await r.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return {status: r.status, ct, url: r.url, len: buf.length, b64: btoa(s)};
}"""
CLICK_JS = "u => { const a = document.createElement('a'); a.href = u; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); }"


def same_origin(url):
    # nds.iaea.org and www-nds.iaea.org are one server; fetch from the page's own origin so the browser can read it
    return url.replace("://www-nds.iaea.org/", "://nds.iaea.org/")


def home(page):
    # back to the warm page's origin if a navigation or redirect left it
    warm = urllib.parse.urlparse(job["warm"])
    cur = urllib.parse.urlparse(page.url)
    if (cur.netloc, cur.scheme) != (warm.netloc, warm.scheme):
        rate.wait()
        page.goto(job["warm"], timeout=90000, wait_until="domcontentloaded")


def nav_get(page, u):
    # navigate the tab to the URL; pages come back as the response body, files as a download; then return the tab to
    # the warm page's origin so in-page fetches keep working
    out = None
    try:
        resp = page.goto(u, timeout=90000, wait_until="domcontentloaded")
        if resp:
            out = {"status": resp.status, "ct": resp.headers.get("content-type", ""), "url": page.url, "body": resp.body()}
    except Exception as e:
        if "Download is starting" not in str(e):
            raise
        with page.expect_download(timeout=3600000) as d:
            page.evaluate(CLICK_JS, u)
        out = {"status": 200, "ct": "application/octet-stream", "url": d.value.url, "body": b"", "path": str(d.value.path())}
    home(page)
    return out or {"status": 0, "ct": "", "url": u, "body": b""}


def browser_get(page, url):
    # in-page fetch through Chrome's own network stack (its cookies, TLS and proxy); files over 40 MB go through a
    # browser download to /data instead
    import base64
    u = same_origin(url)
    if job.get("nav_files") and re.search(r"\.(gz|tgz|tar|zip|bz2|xz|7z|pdf)$", urllib.parse.urlparse(u).path, re.I):
        # Incapsula: a file URL first answers a script page that sets a cookie and reloads; navigating lets that run,
        # then the file arrives as a download
        with page.expect_download(timeout=180000) as d:
            try:
                page.goto(u, timeout=180000, wait_until="commit")
            except Exception:
                pass
        dl = d.value
        if dl.failure():
            raise IOError(f"download failed: {dl.failure()}")
        return {"status": 200, "ct": "application/octet-stream", "url": dl.url, "body": b"", "path": str(dl.path())}
    try:
        r = page.evaluate(FETCH_JS, u)
    except Exception as e:
        if "Failed to fetch" not in str(e):
            raise
        return nav_get(page, u)  # a redirect to another origin: the tab can't read it, so navigate instead
    if r.get("big") and r.get("len", 0) > job.get("max_bytes", 1e15):  # over the job's proxy budget per file: listed, not pulled
        return {"status": "too_big", "ct": r["ct"], "url": r["url"], "body": b"", "len": r["len"]}
    if r.get("big"):
        with page.expect_download(timeout=3600000) as d:
            page.evaluate(CLICK_JS, u)
        dl = d.value
        path = dl.path()
        return {"status": r["status"], "ct": r["ct"], "url": r["url"], "body": b"", "path": str(path)}
    return {"status": r["status"], "ct": r["ct"], "url": r["url"], "body": base64.b64decode(r.get("b64") or "")}


def cleared(page, secs=90):
    t0 = time.time()
    while time.time() - t0 < secs:
        try:
            if not CHALLENGE.search(page.content().encode()) and "moment" not in page.title().lower():
                return True
        except Exception:
            pass
        time.sleep(2)
    return False


def worker(n):
    direct = n == "direct"  # the box's own AWS address, no proxy
    ip, port, user, pw, _ = lines[0] if direct else lines[n]
    st = status["lines"].setdefault(str(n), {"ok": 0, "challenged": 0, "errors": 0, "state": "starting"})
    with sync_playwright() as p:
        br = p.chromium.launch(channel="chrome", headless=False, proxy=None if direct else {"server": f"http://{ip}:{port}", "username": user, "password": pw},
                               args=["--no-first-run", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
                               ignore_default_args=["--enable-automation"], downloads_path="/data")
        ctx = br.new_context(accept_downloads=True, viewport={"width": 1280, "height": 900}, locale="en-US")
        ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        page = ctx.new_page()
        rate.wait()
        try:
            page.goto(job["warm"], timeout=90000, wait_until="domcontentloaded")
        except Exception as e:
            st["state"] = f"warm failed: {str(e)[:120]}"
        if not cleared(page):
            st["state"] = "challenge did not clear on warm page"
            st["busy"] = False  # a dropped line counts as idle, so the others can finish the job
            br.close(); return
        st["state"] = "cleared"
        tries = 0
        while time.time() < DEADLINE:
            try:
                url, key, depth = q.get(timeout=30)
            except queue.Empty:
                if all(v.get("busy") is False for v in status["lines"].values()):
                    break
                st["busy"] = False
                continue
            st["busy"] = True
            page_like = in_scope(url) and not FILES.search(urllib.parse.urlparse(url).path)
            if not page_like:
                h = have(key)
                if h is not None:
                    with lock:
                        results.append({"url": url, "key": key, "status": "skipped", "bytes": h})
                    continue
            if not page_like and job.get("budget_bytes") and spent() > job["budget_bytes"]:
                with lock:
                    results.append({"url": url, "key": key, "status": "not_taken", "reason": "deferred: proxy cap"})
                continue
            rate.wait()
            t0 = time.time()
            r = {"url": url, "key": key, "line": n}
            try:
                res = browser_get(page, url)
                if res["status"] in (403, 503) or ("html" in res["ct"] and CHALLENGE.search(res["body"][:20000])):
                    st["challenged"] += 1
                    page.goto(job["warm"], timeout=90000, wait_until="domcontentloaded")  # a real page navigation clears it, then again
                    cleared(page, 60)
                    res = browser_get(page, url)
                    if res["status"] in (403, 503) or ("html" in res["ct"] and CHALLENGE.search(res["body"][:20000])):
                        raise IOError(f"challenged ({res['status']})")
                ct, body = res["ct"], res["body"]
                rate.took(time.time() - t0, len(body) or (os.path.getsize(res["path"]) if res.get("path") else 0))
                if not ct and body[:300].lstrip().lower().startswith((b"<!doctype html", b"<html")):
                    ct = "text/html"  # some pages come without a content type
                r.update(http=res["status"], ct=ct[:60], ms=int((time.time() - t0) * 1000))
                if res["status"] == "too_big":
                    r.update(status="not_taken", bytes_offered=res["len"], reason="deferred: proxy cap (over the per-file limit)")
                elif res["status"] != 200:
                    r.update(status="dead" if res["status"] in (404, 410) else "error", error=f"http {res['status']}")
                elif res.get("path"):  # big file: Chrome downloaded it to disk
                    s3.upload_file(res["path"], BUCKET, key, ExtraArgs={"ContentType": ct or "application/octet-stream",
                                   "StorageClass": "INTELLIGENT_TIERING", "Metadata": {"source-url": url[:1800]}})
                    r.update(status="done", bytes=os.path.getsize(res["path"]), via="download")
                    os.remove(res["path"]); st["ok"] += 1; tries = 0
                else:
                    s3.put_object(Bucket=BUCKET, Key=key, Body=body, ContentType=ct or "application/octet-stream",
                                  StorageClass="INTELLIGENT_TIERING", Metadata={"source-url": url[:1800]})
                    r.update(status="done", bytes=len(body), sha256=hashlib.sha256(body).hexdigest())
                    st["ok"] += 1; tries = 0
                    found = links(res["url"], body) if "html" in ct else []
                    js_built = len(found) < 4 or b"document.write" in body or b"nds_out" in body or b"<frameset" in body.lower()
                    if job.get("render") and "html" in ct and in_scope(url) and js_built:
                        # pages that build their links in JavaScript: load in the tab, read links from the finished page
                        rate.wait()
                        try:
                            page.goto(same_origin(url), timeout=60000, wait_until="networkidle")
                            found += page.eval_on_selector_all("a[href], area[href], frame[src], iframe[src], script[src]",
                                                               "els => els.map(e => e.href || e.src)")
                            html2 = page.content().encode()
                            found += links(page.url, html2)
                            s3.put_object(Bucket=BUCKET, Key=key + ".rendered.html", Body=html2, ContentType="text/html")
                            home(page)
                        except Exception as e:
                            r["render_error"] = str(e)[:120]
                    if found and (in_scope(url) or depth == 0) and depth < job.get("depth", 6):
                        for u in found:
                            if SKIP and SKIP.search(u):
                                continue
                            host = urllib.parse.urlparse(u).hostname or ""
                            if in_scope(u) or (host in HOSTS and FILES.search(urllib.parse.urlparse(u).path)):
                                add(u, depth=depth + 1)
            except Exception as e:
                r.update(status="error", error=str(e)[:200]); st["errors"] += 1; tries += 1
                if "challenged" in str(e) or "crashed" in str(e) or "closed" in str(e):
                    with lock:
                        seen.discard(url)
                    add(url, key, depth)  # another line may get it
                if "crashed" in str(e) or "closed" in str(e):
                    # the tab died (usually memory): open a new one and warm it, or end this line if the browser is gone
                    st["restarts"] = st.get("restarts", 0) + 1
                    try:
                        page.close()
                    except Exception:
                        pass
                    try:
                        page = ctx.new_page()
                        rate.wait()
                        page.goto(job["warm"], timeout=90000, wait_until="domcontentloaded")
                        cleared(page)
                    except Exception as e2:
                        st["state"] = f"browser lost: {str(e2)[:100]}"; st["busy"] = False
                        with lock:
                            results.append(r)
                        break
                if tries >= 5 and st["ok"] == 0:
                    st["state"] = "dropped: 0 of first 5"
                    st["busy"] = False
                    with lock:
                        results.append(r)
                    break
            with lock:
                results.append(r)
        br.close()
    st["state"] = st.get("state", "") + " / finished"


for lk in job.get("lists", []):  # pull lists written by iaea-pull select (Wayback index): original URL and key
    for f in json.loads(s3.get_object(Bucket=BUCKET, Key=lk)["Body"].read())["files"]:
        add(f["original"].replace("http://", "https://", 1).replace(":80/", "/", 1), f["key"])
for lk in job.get("seen_from", []):  # results.jsonl of an earlier run of the same crawl: don't fetch those URLs again
    for ln in s3.get_object(Bucket=BUCKET, Key=lk)["Body"].read().decode().splitlines():
        r = json.loads(ln)
        if r.get("status") in ("done", "skipped", "dead"):
            seen.add(r["url"])
for lk in job.get("resume", []):  # queue.json files from stopped runs
    for it in json.loads(s3.get_object(Bucket=BUCKET, Key=lk)["Body"].read()):
        add(it["url"], it["key"], it.get("depth", 1))
for it in job.get("items", []):
    add(it["url"], it.get("key"))
for u in job.get("seeds", []):
    add(u)
def stop(*_):
    # SIGTERM: each worker finishes the file in hand and leaves; the queue left is saved to queue.json for a resume
    global DEADLINE
    DEADLINE = 0


signal.signal(signal.SIGTERM, stop)
threads = [threading.Thread(target=worker, args=(n,), daemon=True) for n in job.get("lines", [0])]
for i, t in enumerate(threads):
    t.start(); time.sleep(5)
while any(t.is_alive() for t in threads):
    time.sleep(20); save()
save()
print(json.dumps(json.loads(s3.get_object(Bucket=BUCKET, Key=f"{OUT}/status.json")["Body"].read())))
